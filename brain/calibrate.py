"""Physiology calibration: find the tonic background drive that puts the
network in a sparse-firing awake state, so retinal transients propagate
instead of dying in a silent (or seizing) graph.

Bisection on background current, fixed noise, 200 ms probes. Target mean
rate 0.5-3 Hz. Then a chart-transition probe: render two frames (price
falling vs rising), drive the retina with each, report DNp20 L/R and
DNpe017 activity. Writes calibration.json with everything measured.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from display import market_frame
from kernel import Brain
from sensory import frame_to_drive

HERE = Path(__file__).parent
OUT = HERE / "calibration.json"

NOISE = 0.9
TARGET_LO, TARGET_HI = 0.5, 3.0
SEIZURE_HZ = 25.0


def reset(b: Brain) -> None:
    b.v[:] = -52.0
    b.syn[:] = 0
    b.refrac[:] = 0
    b.ext[:] = 0
    b.spike_counts[:] = 0


def mean_rate(b: Brain, ms: float) -> float:
    c = b.run_ms(ms, {})
    return c["_total"] / b.n / (ms / 1000.0)


def main() -> None:
    pops = json.loads((HERE / "populations.json").read_text())["populations"]
    b = Brain(noise_sigma=NOISE)

    def ids(name, side=None):
        d = pops[name]["bodyIds"]
        if side:
            return d.get(side, [])
        return [x for lst in d.values() for x in lst]

    ix16 = b.idx(ids("R1_R6"))
    ix78 = b.idx(ids("R7_R8"))
    watch = {
        "L": b.idx(ids("DNp20", "L")),
        "R": b.idx(ids("DNp20", "R")),
        "gate": b.idx(ids("DNpe017")),
        "KC": b.idx(ids("KC")),
    }

    # ---- bisection on background drive ----
    lo_b, hi_b = 0.0, 6.0
    best = None
    for it in range(9):
        mid = (lo_b + hi_b) / 2
        reset(b)
        b.bg = np.float32(mid)
        r = mean_rate(b, 200)
        print(f"probe bg={mid:.3f} -> {r:.2f} Hz mean")
        if r > SEIZURE_HZ or r > TARGET_HI:
            hi_b = mid
        elif r < TARGET_LO:
            lo_b = mid
        else:
            best = (mid, r)
            break
    if best is None:
        mid = (lo_b + hi_b) / 2
        reset(b)
        b.bg = np.float32(mid)
        best = (mid, mean_rate(b, 200))
    bg, rest_hz = best
    print(f"calibrated bg={bg:.3f} (resting {rest_hz:.2f} Hz mean)")

    # ---- chart-transition probe ----
    b.bg = np.float32(bg)
    down = list(np.linspace(1.0, 0.7, 100))
    up = list(np.linspace(0.7, 1.0, 100))
    results = {}
    for name, series in (("falling", down), ("rising", up)):
        reset(b)
        # settle with the first frame, then present the moving chart
        f0 = market_frame("PROBE", series[:60], series[59], series[59])
        d16, d78 = frame_to_drive(f0, len(ix16), len(ix78))
        b.ext[:] = 0
        b.ext[ix16] = d16
        b.ext[ix78] = d78
        b.run_ms(200, {})
        f1 = market_frame("PROBE", series, series[-1], series[-1])
        d16, d78 = frame_to_drive(f1, len(ix16), len(ix78))
        b.ext[:] = 0
        b.ext[ix16] = d16
        b.ext[ix78] = d78
        t0 = time.time()
        c = b.run_ms(500, watch)
        sec = 0.5
        results[name] = {
            "dnp20_L_hz": c["L"] / max(len(watch["L"]), 1) / sec,
            "dnp20_R_hz": c["R"] / max(len(watch["R"]), 1) / sec,
            "dnpe017_spikes": c["gate"],
            "kc_spikes": c["KC"],
            "total_spikes": c["_total"],
            "wall_s": round(time.time() - t0, 1),
        }
        print(f"{name}: {results[name]}")

    OUT.write_text(
        json.dumps(
            {
                "bg": bg,
                "noise_sigma": NOISE,
                "resting_hz_mean": rest_hz,
                "transition_probe": results,
            },
            indent=2,
        )
        + "\n"
    )
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
