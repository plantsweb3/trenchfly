# trenchfly worker

The execution half of Trenchfly: a decision loop that turns decoder
proposals into Uniswap v3 swaps on Robinhood Chain (chain 4663) from the
fly's own EVM wallet.

**Honesty note:** the default brain (`brain.ts`) is a *tier-1 decoder
proxy* — it reproduces the reference decision interface (DNp20 L−R rates,
DNpe017 gate, ±2 Hz thresholds), not the 166,700-neuron connectome. The
site says "decoder-driven" until the tier-2 connectome kernel adapter is
wired in. Don't claim the full brain before it's true; receipts are the
whole point.

## Setup

```sh
cd worker
npm install
npm run wallet:new     # generates worker/.env (gitignored, chmod 600)
```

Then, manually (the bot never does this):
1. Fund the printed address on Robinhood Chain — **≤ 0.025 ETH**, the
   guard's capital cap. This wallet is disposable by design.
2. Paste real token CAs into `watchlist.json` (verify canonical addresses
   on robinhoodchain.blockscout.com — same ticker ≠ same token).
3. Set `NEXT_PUBLIC_FLY_WALLET=<address>` in Vercel env so trenchfly.xyz
   shows the live wallet panel.

## Run

```sh
npm run preflight   # chain id, balance, watchlist quotes — no orders
npm run paper       # full loop, fills logged to runs/log.jsonl, no txs
npm run live        # real swaps. only after paper looks sane.
```

## Guard

ETH-denominated port of the reference risk rules (`config.ts`): 0.0025 ETH max
order, 24 orders/day, drawdown stop at 0.005 ETH (stops **new** orders —
it does not liquidate holdings), 0.50% slippage limit. The guard can
reject a proposal; it cannot replace it.

Pons tokens still on the bonding curve won't quote through the v3
QuoterV2 and are skipped — add them once they graduate to a pool, or
extend `market.ts` with the Pons launch router. o1 launches live in
Uniswap **v4** pools, which the v3 quoter also can't see (confirmed:
O1BOT returns no quote) — v4 Quoter support is the first worker TODO.
