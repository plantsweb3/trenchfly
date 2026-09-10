"""Vectorized leaky integrate-and-fire kernel over the compiled graph.

v1 physiology (declared model choices, not measured biology):
0.1 ms step, 20 ms membrane tau, 5 ms synaptic tau, -45 mV threshold,
-52 mV rest, 2.2 ms refractory. Delays folded into the synaptic filter
in v1 (no per-edge delay yet). Unvalidated until the calibration pass
in the README checklist is checked off.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from scipy import sparse

HERE = Path(__file__).parent

DT_MS = 0.1
TAU_M = 20.0
TAU_S = 5.0
V_REST = -52.0
V_THRESH = -45.0
V_RESET = -52.0
REFRAC_MS = 2.2
R_IN = 1.0  # lumped input resistance (mV per unit current)


class Brain:
    def __init__(
        self,
        graph_path: Path | None = None,
        bg: float = 0.0,
        noise_sigma: float = 0.0,
        seed: int = 0,
    ):
        z = np.load(graph_path or HERE / "graph.npz")
        n = int(z["shape"][0])
        self.n = n
        self.W = sparse.csr_matrix(
            (z["w_data"], z["w_indices"], z["w_indptr"]), shape=(n, n)
        )
        # CSC copy for spike propagation: summing the columns of the
        # neurons that actually spiked costs O(their synapses), not
        # O(all 25M) — the difference between 143 s and seconds per obs.
        self.Wc = self.W.tocsc()
        self.body_ids = z["body_ids"]
        self.index = {int(b): i for i, b in enumerate(self.body_ids)}
        self.v = np.full(n, V_REST, dtype=np.float32)
        self.syn = np.zeros(n, dtype=np.float32)
        self.refrac = np.zeros(n, dtype=np.float32)
        self.ext = np.zeros(n, dtype=np.float32)
        self.spike_counts = np.zeros(n, dtype=np.int64)
        # tonic background drive + held noise: the declared "awake
        # network" adapter that lets retinal transients propagate.
        # Noise is redrawn every NOISE_EVERY steps (1 ms) and held — a
        # declared model choice that trades spectral purity for speed.
        self.bg = np.float32(bg)
        self.noise_sigma = np.float32(noise_sigma)
        self.rng = np.random.default_rng(seed)
        self._noise = np.zeros(n, dtype=np.float32)
        self._step_i = 0

    def idx(self, body_ids: list[int]) -> np.ndarray:
        return np.array(
            [self.index[b] for b in body_ids if b in self.index], dtype=np.int64
        )

    def set_drive(self, indices: np.ndarray, current: np.ndarray) -> None:
        self.ext[:] = 0
        self.ext[indices] = current

    NOISE_EVERY = 10  # redraw held noise every 1 ms

    def step(self) -> np.ndarray:
        """Advance one 0.1 ms step; returns bool spike vector."""
        self.syn *= 1.0 - DT_MS / TAU_S
        if self.noise_sigma > 0 and self._step_i % self.NOISE_EVERY == 0:
            self._noise = self.rng.normal(
                0.0, self.noise_sigma, self.n
            ).astype(np.float32)
        self._step_i += 1
        drive = self.syn + self.ext + self.bg + self._noise
        dv = ((V_REST - self.v) + R_IN * drive) * (DT_MS / TAU_M)
        active = self.refrac <= 0
        self.v[active] += dv[active]
        self.refrac[~active] -= DT_MS

        spikes = self.v >= V_THRESH
        if spikes.any():
            self.v[spikes] = V_RESET
            self.refrac[spikes] = REFRAC_MS
            idx = np.flatnonzero(spikes)
            self.syn += np.asarray(
                self.Wc[:, idx].sum(axis=1), dtype=np.float32
            ).ravel()
            self.spike_counts[spikes] += 1
        return spikes

    def run_ms(self, ms: float, watch: dict[str, np.ndarray]) -> dict:
        """Advance `ms` of neural time; return spike counts per watched set."""
        steps = int(round(ms / DT_MS))
        counts = {k: 0 for k in watch}
        total = 0
        for _ in range(steps):
            spikes = self.step()
            total += int(spikes.sum())
            for k, ix in watch.items():
                counts[k] += int(spikes[ix].sum())
        counts["_total"] = total
        counts["_ms"] = ms
        return counts
