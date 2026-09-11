# RobinFly worker

Paper is the default. It observes real market quotes and runs the connectome without creating a signer or sending transactions. The full kernel is required unless a paper operator explicitly selects `--allow-proxy`.

## Private connection

Create an Alchemy app for **Robinhood Chain Mainnet, chain ID 4663**. Robinhood recommends Alchemy and warns that its shared public RPC is not for production. QuickNode also supports this network.

Add `ROBINFLY_RPC_URL` to the existing `worker/.env`, preserving any other entries. `env.example` contains a placeholder. Never publish the full endpoint, put it in a public browser variable, or paste it into chat. The child brain process receives neither the endpoint nor the signer key. HTTP 401/403/429 stops observation rather than silently treating access failure as missing liquidity.

Official references: [Robinhood connection guide](https://docs.robinhood.com/chain/connecting/), [Alchemy pricing](https://www.alchemy.com/pricing), [billing usage caps](https://www.alchemy.com/docs/reference/pay-as-you-go-pricing-faq).

## Read-only and paper checks

```sh
npm install
npm run check
npm test
npm run preflight
npm run routes
npm run paper
```

`routes` performs read-only eth_call buy simulations and reverse quotes. It never approves or broadcasts. Those checks do not prove that sell execution, gas accounting or recovery works onchain. Do not classify a missing v3 route as token-wide illiquidity: another venue may require a different adapter.

`paper` uses confirmed chart input and order-size quotes. It includes pool fees/price impact, excludes gas, and saves holdings/cash/timing in `runs/paper-state.json`. All runtime files are private and ignored. `--max-observations=N` gives a bounded paper run. `--no-publish` disables feed publishing. New pool discovery is opt-in with `--discover`.

## Persistence and feed

A process lock prevents two workers from sharing the books. Paper and live books are separate, bound to the correct mode and account, and written atomically. Invalid saved state blocks startup. Existing live totals must be reconciled; never delete state just to start again.

The global 60-second order cooldown survives restart. Pending execution blocks further attempts. Unknown or stale inventory valuation blocks new buys. The feed includes mode, run ID, worker status, heartbeat, per-market quote coverage and the referenced input frames; it retains every frame referenced by the current decision window. Publishing never force-pushes history.

## First live cycle demonstrated (2026-09-11)

A complete owner-activated live cycle ran on mainnet 4663 and reconciled
with no pending intents: BUY CASHCAT 0.0025 ETH
(0x814d5af1dd41bff54beca22d32714fa6b8fe964849b4dd9eb9b0b8635af299e6,
block 59843446), approval, SELL
(0x357b188bbc62444acb9c065e1f240cfe9d985b91efa0042173c917e231a70265,
block 59844277), WETH unwrap — all receipts success; round-trip cost
including gas ≈ 0.00009 ETH. One demonstrated cycle on one liquid pair
is not blanket route coverage, recovery-path proof, or a performance
claim.

## Live readiness still required

The implementation includes chain-ID checks, actual-order quotes, swap simulation, minimum output checks, exact approvals, receipt-based token settlement, gas accounting, and partial-unwrap handling. A durable pending intent is saved before execution. Any unresolved execution pauses for reconciliation; it is not automatically retried.

One complete buy → sell → gas cycle has been demonstrated (above); failure-path recovery has only offline injected-I/O coverage. A private production RPC, a durable always-on host, complete route coverage and operational recovery remain launch requirements. The website host is not the brain-worker host.

The limits in `config.ts` are experimental controls, not guarantees. Dopamine learning and profitable behavior are not demonstrated.

## Fresh-pair pipeline (2026-09-10)

Discovery now runs by default (`--no-discovery` disables it). Scope is the declared canonical Uniswap v3 factory and WETH pairs on chain 4663. It does not claim every launchpad, bonding curve, quote currency, or pre-migration token.

- `runs/markets.json` atomically persists the contiguous discovery cursor, block hash, every event and each pool's quote/swap history. Overflow remains queued. Source changes, corrupt state and reorgs at saved anchors stop the worker for reconciliation.
- Software rotates a maximum of 14 candidate tokens through three-minute windows, preserving held positions even beyond that cap. Older unheld candidates leave the active window; stored creation records remain. This is software attention, not a learned brain choice.
- Discovery, quote ingestion, shared pool-swap ingestion and neural observations run independently. The observer copies an immutable frame input; a 45-second freshness rule is checked after inference and again before execution.
- Actual Swap logs produce one-minute OHLC candles, five-minute buys/sells and WETH volume. Empty intervals are not invented. Pool token balances and active-liquidity units are sourced contract reads, not proof of locked liquidity or sellability. Holders and security scanners remain unavailable.
- Existing configured pools use `getPool` and are explicitly distinguished from `PoolCreated` discoveries. Their creation age remains unknown unless the event is found.
- Every new connectome decision includes the exact frame hash, input context, population spike totals, ten 50-ms motor-rate bins, and inference/signal age. The decorative neural mesh remains schematic.
- Transaction hashes and receipt stages are journaled before waiting. `npm run reconcile` is read-only and never clears an unresolved intent. Entry/exit lifecycle failures are covered by offline injected-I/O tests; that does not establish mainnet sellability.
- A read-only local telemetry server listens on `127.0.0.1:8787`. `/health` and `/latest.json` expose only public telemetry. See `../deploy/README.md` for an HTTPS origin and persistent paper hosting.

The current Alchemy app was connected and verified as chain 4663. Its free plan required 10-block log ranges. The worker paces estimated compute units and stops at a local 24M monthly estimate. This is not account-wide billing enforcement; continuous polling may consume the free allowance in days. Inspect the provider dashboard. No paid plan or host has been provisioned by this change.
