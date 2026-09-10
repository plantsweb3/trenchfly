// Price discovery via Uniswap v3 QuoterV2 on Robinhood Chain.
// quoteEth tries every fee tier and keeps the BEST output (a dust pool on
// one tier must not shadow real liquidity on another). quoteBuyOut quotes
// the actual WETH->token leg for an exact order size, so buy minOut math
// reflects real fees and price impact instead of an inverted sell quote.

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

async function quoteSingle(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  fee: number,
): Promise<bigint | null> {
  try {
    const { result } = await publicClient.simulateContract({
      address: CONTRACTS.quoterV2 as Address,
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: [
        { tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n },
      ],
    });
    return result[0] > 0n ? result[0] : null;
  } catch {
    return null;
  }
}

/** Price of 1 whole token in ETH via the deepest tier (max output wins). */
export async function quoteEth(
  token: Address,
  decimals: number,
): Promise<{ priceEth: number; fee: number } | null> {
  const amountIn = parseUnits("1", decimals);
  let best: { out: bigint; fee: number } | null = null;
  for (const fee of FEE_TIERS) {
    const out = await quoteSingle(
      token,
      CONTRACTS.weth as Address,
      amountIn,
      fee,
    );
    if (out !== null && (best === null || out > best.out)) {
      best = { out, fee };
    }
  }
  if (!best) return null;
  return { priceEth: Number(formatEther(best.out)), fee: best.fee };
}

/** Exact WETH->token output for a real order size on a specific tier. */
export async function quoteBuyOut(
  token: Address,
  fee: number,
  amountInWei: bigint,
): Promise<bigint | null> {
  return quoteSingle(CONTRACTS.weth as Address, token, amountInWei, fee);
}

/** Exact token->WETH output for a real sell size on a specific tier. */
export async function quoteSellOut(
  token: Address,
  fee: number,
  amountInRaw: bigint,
): Promise<bigint | null> {
  return quoteSingle(token, CONTRACTS.weth as Address, amountInRaw, fee);
}
