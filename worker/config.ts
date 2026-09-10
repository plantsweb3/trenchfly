import { defineChain } from "viem";
import { CONTRACTS, ROBINHOOD_CHAIN } from "../lib/chain";

export { CONTRACTS };

export const robinhoodChain = defineChain({
  id: ROBINHOOD_CHAIN.id,
  name: ROBINHOOD_CHAIN.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ROBINHOOD_CHAIN.rpc] } },
  blockExplorers: {
    default: { name: "Blockscout", url: ROBINHOOD_CHAIN.explorer },
  },
});

// Guard settings — ETH-denominated versions of the reference risk rules.
// ORDER_ETH ≈ $10 and CAPITAL_ETH ≈ $100 at ~$4k ETH; adjust to taste,
// the ratios are what matter. The guard can reject a proposal for price,
// budget, inventory or timing reasons. It cannot replace the proposal.
export const GUARD = {
  capitalEth: 0.025, // reference trading capital (rewards can exceed this)
  orderEth: 0.0025, // max size per swap, gas + fees included — the leash
  maxInventoryEth: 0.0125, // total open-position cap: creator rewards can
  // pile up in the wallet, but the fly can never deploy more than this
  // into tokens at once (~5 positions worth)
  drawdownStopEth: 0.005, // stop NEW orders; does not liquidate holdings
  slippageBps: 50, // 0.50%
  minIntervalMs: 60_000,
} as const;

export const FEE_TIERS = [3000, 10000, 500] as const;
