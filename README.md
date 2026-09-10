# RobinFly

[robinfly.net](https://robinfly.net) — a public experiment connecting a fruit-fly connectome model to market-chart observations on Robinhood Chain (mainnet 4663).

The homepage shows the worker's published record. Its Blender-rigged fly sits at a trading desk; the monitor shows the exact chart image for the selected decision. BUY and SELL animations replay that decision. A schematic neural window uses the published left/right motor rates; its dots are not individual-neuron measurements. Paused or stale sessions do not automatically replay trades. Gentle wing fidgets, hand rubbing and face grooming are decorative idle motion.

## What is implemented

- The full kernel adapter loads 166,700 neurons and 25,147,397 compiled synapses. The worker requires it by default; an explicitly allowed paper proxy is labeled separately.
- Quotes become chart images, the model returns motor activity, and a decoder produces BUY, SELL or HOLD. The guard can reject a proposal.
- Paper execution uses real order-size v3 quotes, with separate persistent accounting. It includes quoted pool fees and price impact, but excludes network gas.
- The session reports mode, worker status, market coverage, timestamps, chart hashes, decisions and reported outcomes. Transaction references link to independent receipts.
- The live execution implementation contains pre-submission simulation and receipt accounting, but complete live buy/sell/recovery operation has not been demonstrated by the launch checks.

## What is not demonstrated

Profitable learning, trading edge, biological equivalence, retinotopic visual processing and dopamine reinforcement are not established. The rendered fly is a mascot, not a biological visualization. A quote or eth_call simulation is not a settled trade. The v3 route implementation does not establish support for every venue in the watchlist.

## Project

- `app/`, `components/`, `lib/`: Next.js public observation site.
- `worker/`: paper-default observation and execution loop. See its README.
- `brain/`: computational model and chart rendering.
- `public/models/robinfly/`: original rigged fly, workstation, and fallback artwork.

The GitHub repository and feed retain their existing names so published links continue to work. Public branding and canonical URLs use RobinFly.

## Site development

```sh
npm install
npm run dev
```

`NEXT_PUBLIC_FLY_WALLET` is a public address. `NEXT_PUBLIC_SITE_URL` may override the canonical `https://robinfly.net`. `ROBINFLY_RPC_URL` is server-only and must never use a `NEXT_PUBLIC_` prefix. Keys, accounting files and model runtime outputs are excluded from version control.
