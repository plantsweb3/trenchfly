// Price discovery via Uniswap v3 QuoterV2 on Robinhood Chain.
// Quotes token→WETH for 1 whole token; tries fee tiers in order.
// Pons bonding-curve tokens that have not graduated to a v3/v4 pool
// will not quote here — the watcher skips them with a warning.

import {
  createPublicClient,
  http,
  parseAbi,
  parseUnits,
  formatEther,
  type Address,
} from "viem";
import { CONTRACTS, FEE_TIERS, robinhoodChain } from "./config";

export const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(),
});

const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);

const erc20Abi = parseAbi([
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
]);

export async function tokenDecimals(token: Address): Promise<number> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
  });
}

export async function tokenBalance(
  token: Address,
  owner: Address,
): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}

/** Price of 1 whole token in ETH, plus the fee tier that quoted. */
export async function quoteEth(
  token: Address,
  decimals: number,
): Promise<{ priceEth: number; fee: number } | null> {
  for (const fee of FEE_TIERS) {
    try {
      const { result } = await publicClient.simulateContract({
        address: CONTRACTS.quoterV2 as Address,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: token,
            tokenOut: CONTRACTS.weth as Address,
            amountIn: parseUnits("1", decimals),
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      const amountOut = result[0];
      if (amountOut > 0n) {
        return { priceEth: Number(formatEther(amountOut)), fee };
      }
    } catch {
      // no pool at this tier — try the next
    }
  }
  return null;
}
