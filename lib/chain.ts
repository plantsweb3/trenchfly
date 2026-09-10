// Robinhood Chain (Arbitrum Orbit L2) — verified 2026-09-10 against
// docs.robinhood.com/chain and the Uniswap v3 deployments page.
// Re-verify on the explorer before pointing real funds at anything.

export const ROBINHOOD_CHAIN = {
  id: 4663,
  name: "Robinhood Chain",
  rpc: "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://robinhoodchain.blockscout.com",
  gasToken: "ETH",
} as const;

export const CONTRACTS = {
  weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  uniswapV3Factory: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
  swapRouter02: "0xcaf681a66d020601342297493863e78c959e5cb2",
  quoterV2: "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7",
  universalRouter: "0x8876789976decbfcbbbe364623c63652db8c0904",
  ponsLaunchFactory: "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e",
  ponsLaunchRouter: "0xe33e9e479df8802cb0866d5d05258bec4cf62948",
} as const;

export const FLY_WALLET = process.env.NEXT_PUBLIC_FLY_WALLET ?? null;

export function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
