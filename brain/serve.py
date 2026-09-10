"""JSON-over-stdio decision server: the tier-2 adapter the TS worker calls.

Protocol (one JSON object per line):
  in:  {"frame_png_b64": "...", "neural_ms": 500}
  out: {"rateL": float, "rateR": float, "dnpe017_spikes": int,
        "total_spikes": int, "frame_sha256": "..."}

Decode rule (fixed, engineered): mean right DNp20 rate minus left over
the observation window; >= +2 Hz with a DNpe017 spike proposes buy,
<= -2 Hz proposes sell. The proposal itself is computed by the worker
from these numbers so the mapping lives in one audited place.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from kernel import Brain
from sensory import frame_to_drive

HERE = Path(__file__).parent


def main() -> None:
    pops = json.loads((HERE / "populations.json").read_text())["populations"]
    brain = Brain()

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
                "r16": len(ix_r16),
                "r78": len(ix_r78),
            }
        ),
        flush=True,
    )

    for line in sys.stdin:
        req = json.loads(line)
        raw = base64.b64decode(req["frame_png_b64"])
        frame = np.asarray(Image.open(io.BytesIO(raw)).convert("RGB"))
        d16, d78 = frame_to_drive(frame, len(ix_r16), len(ix_r78))
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
            "frame_sha256": hashlib.sha256(raw).hexdigest(),
        }
        print(json.dumps(out), flush=True)


if __name__ == "__main__":
    main()
