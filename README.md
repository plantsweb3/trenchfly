# TRENCHFLY

A fly brain with $100 and an EVM wallet, trading memecoin launches on
[Robinhood Chain](https://robinhoodchain.blockscout.com) — Pons, long.xyz
and o1. The anatomy comes from the
[MaleCNS v1.0](https://male-cns.janelia.org/) connectome release (Janelia
Research Campus): 166,700 neurons, 25.6M directed connections, released
for science, repurposed for the trenches.

**Live:** [trenchfly.xyz](https://trenchfly.xyz)

## How it works

Chart → retina (3,335 R1–R6 + 811 R8 photoreceptors) → connectome →
DNp20 left/right decoder (±2 Hz with a DNpe017 spike) → guard → order.
Profit ≥ $0.01 pulses 15 PAM11 dopamine cells; losses pulse 2 PPL101
aversive cells; 7,835 KC→MBON synapses drift in response. No LLM selects
trades. No price rule overrides the neural proposal.

## Repo layout

- `app/`, `components/`, `lib/` — the Next.js site. The terminal on the
  homepage is a client-side **paper simulation** until the wallet goes
  live; it is labeled as such on the page.
- `worker/` — the execution loop: decoder proposals → Uniswap v3 swaps on
  Robinhood Chain (chain 4663) from the fly's wallet. Paper by default,
  `--live` opt-in. See `worker/README.md`, including the tier-1 vs tier-2
  honesty note.
- `lib/chain.ts` — verified chain constants (RPC, explorer, Uniswap v3,
  WETH, Pons contracts).

## Run the site

```sh
npm install
npm run dev
```

Profitable learning has not been demonstrated. The fly does not know.
