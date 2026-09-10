// Order execution. Paper mode appends to runs/log.jsonl and touches no
// chain state. Live mode signs Uniswap v3 exactInputSingle swaps with the
// fly's wallet:
//  - minOut comes from a real same-direction quote (quoteBuyOut /
//    quoteSellOut) minus the slippage allowance, so fees and price impact
//    are priced in instead of double-counted;
//  - receipts are checked — a reverted swap throws and is never recorded
//    as a fill;
//  - sell proceeds (WETH) are unwrapped to native ETH so the budget guard
//    sees them.

import {
  createWalletClient,
  http,
  parseAbi,
  parseEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CONTRACTS, GUARD, robinhoodChain } from "./config";
import { publicClient, quoteBuyOut, quoteSellOut } from "./market";

const dir = dirname(fileURLToPath(import.meta.url));
const runsDir = join(dir, "runs");

const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
]);

const erc20Abi = parseAbi([
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

const wethAbi = parseAbi(["function withdraw(uint256)"]);

export interface OrderIntent {
  side: "BUY" | "SELL";
  symbol: string;
  token: Address;
  fee: number;
  decimals: number;
  /** BUY: ETH in. SELL: token qty in whole units (display only). */
  amount: number;
  /** SELL only: exact raw token amount to sell (authoritative). */
  amountRaw?: bigint;
  priceEth: number;
}

export function logRun(entry: Record<string, unknown>) {
  mkdirSync(runsDir, { recursive: true });
  appendFileSync(
    join(runsDir, "log.jsonl"),
    JSON.stringify(
      { t: new Date().toISOString(), ...entry },
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
    ) + "\n",
  );
}

export function walletFromEnv() {
  const pk = process.env.FLY_PRIVATE_KEY;
  if (!pk) return null;
  const account = privateKeyToAccount(pk as `0x${string}`);
  return {
    account,
    client: createWalletClient({
      account,
      chain: robinhoodChain,
      transport: http(),
    }),
  };
}

async function confirmed(hash: `0x${string}`): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`tx reverted: ${hash}`);
  }
}

export async function placeLive(intent: OrderIntent): Promise<string> {
  const wallet = walletFromEnv();
  if (!wallet) throw new Error("FLY_PRIVATE_KEY missing — run wallet:new");
  const { account, client } = wallet;
  const minOutFactor = 10_000n - BigInt(GUARD.slippageBps);

  if (intent.side === "BUY") {
    const amountIn = parseEther(intent.amount.toFixed(18));
    const quotedOut = await quoteBuyOut(intent.token, intent.fee, amountIn);
    if (quotedOut === null) throw new Error("no buy quote at order size");
    const hash = await client.writeContract({
      address: CONTRACTS.swapRouter02 as Address,
      abi: routerAbi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: CONTRACTS.weth as Address,
          tokenOut: intent.token,
          fee: intent.fee,
          recipient: account.address,
          amountIn,
          amountOutMinimum: (quotedOut * minOutFactor) / 10_000n,
          sqrtPriceLimitX96: 0n,
        },
      ],
      value: amountIn,
    });
    await confirmed(hash);
    return hash;
  }

  // SELL: raw amount is authoritative; approve, swap, unwrap proceeds.
  const amountIn = intent.amountRaw;
  if (amountIn === undefined || amountIn <= 0n)
    throw new Error("sell without raw amount");
  const allowance = await publicClient.readContract({
    address: intent.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, CONTRACTS.swapRouter02 as Address],
  });
  if (allowance < amountIn) {
    const approveHash = await client.writeContract({
      address: intent.token,
      abi: erc20Abi,
      functionName: "approve",
      args: [CONTRACTS.swapRouter02 as Address, amountIn * 4n],
    });
    await confirmed(approveHash);
  }
  const quotedOut = await quoteSellOut(intent.token, intent.fee, amountIn);
  if (quotedOut === null) throw new Error("no sell quote at order size");
  const hash = await client.writeContract({
    address: CONTRACTS.swapRouter02 as Address,
    abi: routerAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: intent.token,
        tokenOut: CONTRACTS.weth as Address,
        fee: intent.fee,
        recipient: account.address,
        amountIn,
        amountOutMinimum: (quotedOut * minOutFactor) / 10_000n,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  await confirmed(hash);

  // unwrap all held WETH so proceeds are visible to the native-ETH budget
  const wethBal = await publicClient.readContract({
    address: CONTRACTS.weth as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  if (wethBal > 0n) {
    const unwrapHash = await client.writeContract({
      address: CONTRACTS.weth as Address,
      abi: wethAbi,
      functionName: "withdraw",
      args: [wethBal],
    });
    await confirmed(unwrapHash);
  }
  return hash;
}
