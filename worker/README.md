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

## Live readiness still required

The implementation includes chain-ID checks, actual-order quotes, swap simulation, minimum output checks, exact approvals, receipt-based token settlement, gas accounting, and partial-unwrap handling. A durable pending intent is saved before execution. Any unresolved execution pauses for reconciliation; it is not automatically retried.

No launch check has established a complete live buy → sell → gas/recovery cycle. Review and test that path independently before any owner-operated activation. A private production RPC, a durable always-on host, complete route coverage and operational recovery remain launch requirements. The website host is not the brain-worker host.

The limits in `config.ts` are experimental controls, not guarantees. Dopamine learning and profitable behavior are not demonstrated.
