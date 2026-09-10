// New-pair discovery: watches Uniswap v3 PoolCreated events on chain 4663
// and surfaces fresh WETH-paired tokens so the fly trades new launches,
// not just the starter watchlist. Forward-only from process start.
//
// Trench reality, stated plainly: brand-new pairs include honeypots and
// rugs. The guard's protections are small fixed orders, the slippage cap
// and the trading-P&L drawdown stop; a failed (reverting) sell is logged
// as a rejection, not retried in a loop.

import { parseAbi, parseAbiItem, type Address } from "viem";
import { CONTRACTS } from "./config";
import { publicClient } from "./market";

const poolCreated = parseAbiItem(
  "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)",
);

const erc20Abi = parseAbi(["function symbol() view returns (string)"]);

export interface Discovered {
  symbol: string;
  address: string;
  fee: number;
  block: string;
}

let lastBlock: bigint | null = null;

export async function scanNewPools(max = 5): Promise<Discovered[]> {
  const head = await publicClient.getBlockNumber();
  if (lastBlock === null) {
    lastBlock = head; // start watching from now
    return [];
  }
  if (head <= lastBlock) return [];
  const from = lastBlock + 1n;
  const to = head - from > 4999n ? from + 4999n : head; // RPC range safety
  lastBlock = to;

  const logs = await publicClient.getLogs({
    address: CONTRACTS.uniswapV3Factory as Address,
    event: poolCreated,
    fromBlock: from,
    toBlock: to,
  });

  const weth = CONTRACTS.weth.toLowerCase();
  const out: Discovered[] = [];
  for (const l of logs) {
    const token0 = (l.args.token0 as string).toLowerCase();
    const token1 = (l.args.token1 as string).toLowerCase();
    let token: string | null = null;
    if (token0 === weth) token = l.args.token1 as string;
    else if (token1 === weth) token = l.args.token0 as string;
    if (!token) continue;
    const symbol = await publicClient
      .readContract({
        address: token as Address,
        abi: erc20Abi,
        functionName: "symbol",
      })
      .catch(() => null);
    if (!symbol) continue;
    out.push({
      symbol: symbol.slice(0, 12),
      address: token,
      fee: Number(l.args.fee),
      block: String(l.blockNumber),
    });
    if (out.length >= max) break;
  }
  return out;
}
