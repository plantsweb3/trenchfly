// Tier-1 decision layer: a decoder-faithful proxy for the DNp20 readout.
// It reproduces the reference decision INTERFACE (right-minus-left rate
// difference, DNpe017 gate, ±2 Hz thresholds) driven by chart slope plus
// mean-reverting noise — it is NOT the 166,700-neuron connectome.
//
// Tier-2 slot: replace `decide` with an adapter that feeds the rendered
// chart into a running connectome kernel and reads the
// actual DNp20/DNpe017 spike counts back. Same signature, real brain.

export type Proposal = "BUY" | "SELL" | "HOLD";

export interface Decision {
  proposal: Proposal;
  rateL: number;
  rateR: number;
  gate: boolean;
  diff: number;
}

const state = { rateL: 6.5, rateR: 6.5 };

function gauss() {
  const u = Math.max(Math.random(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));

export function decide(history: number[]): Decision {
  const n = history.length;
  const slope =
    n >= 8 ? (history[n - 1] - history[n - 8]) / history[n - 8] : 0;

  state.rateL = clamp(state.rateL + 0.35 * (6.5 - state.rateL) + gauss() * 1.6, 0, 22);
  state.rateR = clamp(
    state.rateR +
      0.35 * (6.5 + clamp(slope * 400, -5, 5) - state.rateR) +
      gauss() * 1.6,
    0,
    22,
  );
  const gate = Math.random() < 0.62;
  const diff = state.rateR - state.rateL;

  let proposal: Proposal = "HOLD";
  if (diff >= 2 && gate) proposal = "BUY";
  else if (diff <= -2 && gate) proposal = "SELL";

  return { proposal, rateL: state.rateL, rateR: state.rateR, gate, diff };
}
