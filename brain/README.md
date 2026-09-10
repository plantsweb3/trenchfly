# trenchfly brain — MaleCNS v1.0 spiking kernel (tier-2)

The full-connectome decision layer that replaces the worker's tier-1
decoder. Anatomy: [MaleCNS v1.0](https://male-cns.janelia.org/) (Janelia
Research Campus, CC-BY 4.0, doi:10.1101/2025.10.09.680999). Data is
pulled from the public flat-connectome release and pinned by SHA-256 —
anyone can rebuild the identical brain.

## Build status (updated as each stage lands — nothing marked done early)

- [x] Dataset sources verified: public GCS flat files, no auth
      (`body-annotations` 13 MB, `body-neurotransmitters` 42 MB,
      `connectome-weights` 1.1 GB)
- [x] `prepare.py` — download + SHA-256 pinning
- [x] `populations.py` — population selection from real annotations, verified
      against the raw file: DNp20 ×2 (L/R), DNpe017 ×2, PAM11(α1) ×15,
      PPL101(γ1pedc) ×2, MBON07 ×4, MBON11 ×2, Kenyon cells ×4,064,
      R1–R6 ×3,377, R7/R8 ×2,714
- [x] `compile_graph.py` — edge list → sparse CSR with NT-derived signs
      (`consensus_nt`: ACh +, GABA/Glu/His −; DA/5-HT/OA excluded from
      fast synapses in v1)
- [x] `kernel.py` — vectorized leaky integrate-and-fire (0.1 ms step,
      20 ms membrane τ, 5 ms synaptic τ, −45 mV threshold, refractory)
- [x] `sensory.py` — 320×180 chart RGB → photoreceptor drive (v1:
      luminance → R1–R6, blue/green proxy → R7/R8 axon bodies)
- [x] `serve.py` — JSON-over-stdio loop the TS worker calls
- [x] Graph compiled from the full 1.1 GB weights file: 151.9M raw edges
      → 25,147,397 retained fast synapses (14.7M exc / 9.8M inh /
      588k damped-fallback) + 435k modulatory, `graph-meta.json`
- [x] Kernel loads and runs the full brain (166,700 neurons; ~2.2 s wall
      per 100 ms neural — fits the 60 s market cadence). Silent at rest
      (no seizure); all 3,377 R1–R6 spike under drive
- [x] Physiology calibration pass (`calibrate.py` → `calibration.json`).
      Findings kept honest: histaminergic photoreceptors suppress under
      static light, so the network runs in a declared awake regime
      (tonic background + held noise, ~19 Hz mean). In that regime the
      decision cells are alive — DNp20 ~250–290 Hz, DNpe017 gating,
      Kenyon cells engaged — and 500 ms of neural time costs ~12 s wall
      (CSC column propagation; was 143 s)
- [x] DNp20 readout responds end-to-end (chart → retina → DNp20).
      Caveat, stated plainly: v1 sensory mapping has no retinotopy, so
      L/R rates barely differ between rising and falling charts; the
      worker therefore decodes the DEVIATION of (R−L) from its rolling
      baseline — a declared adaptation. True retinotopic mapping (optic-
      lobe column assignments from syn-points) is the next item
- [x] Worker `brain.ts` switched from tier-1 proxy to this kernel
      (automatic when graph + calibration artifacts exist; the active
      tier is printed at boot and logged on every decision)
- [ ] Retinotopic sensory mapping (syn-points optic-lobe columns)
- [ ] Dopamine reinforcement (PAM11/PPL101 pulses, KC→MBON plasticity)

Until every box is checked the site and worker say "decoder-driven."

## Run

```sh
cd brain
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python prepare.py          # downloads ~1.2 GB, writes locks.json
python populations.py      # verifiable population counts from real data
python compile_graph.py    # builds graph.npz (sparse signed weights)
python serve.py            # stdio decision server for the worker
```

Honest caveats, kept current: spike-based LIF over anatomical contact
counts is a coarse model — signs from predicted neurotransmitters, no
receptor kinetics, no gap junctions, engineered sensory injection. The
claim is "the real connectome's wiring runs every decision," not "a
simulated living fly."
