"""JSON-over-stdio decision server: the tier-2 adapter the TS worker calls.

Protocol (one JSON object per line):
  in:  {"symbol": "CASHCAT", "prices": [..], "bid": f, "ask": f,
        "neural_ms": 500}
  out: {"rateL": f, "rateR": f, "dnpe017_spikes": int,
        "total_spikes": int, "frame_sha256": "..."}

The server renders the chart itself (display.py), drives the retina,
advances the persistent brain state, and reads DNp20/DNpe017 spikes.
Every observation is audit-logged: the exact frame PNG is saved under
runs/frames/<sha>.png and a line is appended to runs/decisions.jsonl,
so any order can be traced back to the pixels that caused it.

Decode thresholds live in the worker so the mapping is audited in one
place. Uses calibration.json (background drive + noise) from calibrate.py.
"""

from __future__ import annotations

import hashlib
import io
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

from display import market_frame
from kernel import Brain
from sensory import frame_to_drive

HERE = Path(__file__).parent
FRAMES = HERE / "runs" / "frames"
DECISIONS = HERE / "runs" / "decisions.jsonl"


def main() -> None:
    FRAMES.mkdir(parents=True, exist_ok=True)
    pops = json.loads((HERE / "populations.json").read_text())["populations"]
    cal = {}
    cal_path = HERE / "calibration.json"
    if cal_path.exists():
        cal = json.loads(cal_path.read_text())
    brain = Brain(
        bg=float(cal.get("bg", 0.0)),
        noise_sigma=float(cal.get("noise_sigma", 0.0)),
    )

    def ids(name: str, side: str | None = None) -> list[int]:
        d = pops[name]["bodyIds"]
        if side:
            return d.get(side, [])
        return [b for lst in d.values() for b in lst]

    ix_r16 = brain.idx(ids("R1_R6"))
    ix_r78 = brain.idx(ids("R7_R8"))
    watch = {
        "dnp20_L": brain.idx(ids("DNp20", "L")),
        "dnp20_R": brain.idx(ids("DNp20", "R")),
        "dnpe017": brain.idx(ids("DNpe017")),
    }
    print(
        json.dumps(
            {
                "ready": True,
                "neurons": brain.n,
                "synapses": int(brain.W.nnz),
                "bg": float(brain.bg),
                "noise_sigma": float(brain.noise_sigma),
            }
        ),
        flush=True,
    )

    req_count = 0
    for line in sys.stdin:
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            print(json.dumps({"id": -1, "error": "bad json"}), flush=True)
            continue
        rid = req.get("id", -1)
        try:
            frame = _handle(req, brain, ix_r16, ix_r78, watch)
            frame["id"] = rid
            print(json.dumps(frame), flush=True)
        except Exception as e:  # noqa: BLE001 — one bad request must not kill the brain
            print(json.dumps({"id": rid, "error": str(e)[:200]}), flush=True)
            continue
        req_count += 1
        if req_count % 100 == 0:
            _prune_frames()


def _prune_frames(keep: int = 400) -> None:
    try:
        files = sorted(FRAMES.glob("*.png"), key=lambda f: f.stat().st_mtime)
        for f in files[:-keep]:
            f.unlink()
    except OSError:
        pass


def _handle(req, brain, ix_r16, ix_r78, watch) -> dict:
        prices = [float(x) for x in req.get("prices", []) if x is not None]
        img = market_frame(
            str(req.get("symbol", "?"))[:10],
            prices,
            float(req.get("bid") or 0),
            float(req.get("ask") or 0),
        )
        buf = io.BytesIO()
        Image.fromarray(img).save(buf, format="PNG")
        raw = buf.getvalue()
        sha = hashlib.sha256(raw).hexdigest()
        (FRAMES / f"{sha}.png").write_bytes(raw)

        d16, d78 = frame_to_drive(img, len(ix_r16), len(ix_r78))
        brain.ext[:] = 0
        brain.ext[ix_r16] = d16
        brain.ext[ix_r78] = d78
        ms = float(req.get("neural_ms", 500))
        counts = brain.run_ms(ms, watch)
        sec = ms / 1000.0
        out = {
            "rateL": counts["dnp20_L"] / max(len(watch["dnp20_L"]), 1) / sec,
            "rateR": counts["dnp20_R"] / max(len(watch["dnp20_R"]), 1) / sec,
            "dnpe017_spikes": counts["dnpe017"],
            "total_spikes": counts["_total"],
            "frame_sha256": sha,
        }
        with open(DECISIONS, "a") as f:
            f.write(
                json.dumps(
                    {
                        "t": datetime.now(timezone.utc).isoformat(),
                        "symbol": req.get("symbol"),
                        **out,
                    }
                )
                + "\n"
            )
        return out


if __name__ == "__main__":
    main()
