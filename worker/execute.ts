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
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CONTRACTS, GUARD, robinhoodChain } from "./config";
import { publicClient, quoteBuyOut, quoteSellOut } from "./market";
import { assertChain } from "./guard";
import { receiptFee, receivedTokens } from "./settlement";
import { rpcUrl } from "./rpc";

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
      transport: http(rpcUrl(), { timeout: 12_000, retryCount: 0 }),
    }),
  };
}

export interface ExecutionResult {
  hash: `0x${string}`;
  amountInRaw: bigint;
  amountOutRaw: bigint;
  gasWei: bigint;
  settlementComplete: boolean;
}

async function confirmed(hash: `0x${string}`): Promise<TransactionReceipt> {
  logRun({ kind: "transaction", stage: "submitted", hash });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  logRun({ kind: "transaction", stage: receipt.status, hash, gasWei: receiptFee(receipt) });
  if (receipt.status !== "success") {
    throw new Error(`tx reverted: ${hash}`);
  }
  return receipt;
}

export async function placeLive(intent: OrderIntent): Promise<ExecutionResult> {
  assertChain(await publicClient.getChainId(), robinhoodChain.id);
  const wallet = walletFromEnv();
  if (!wallet) throw new Error("FLY_PRIVATE_KEY missing — run wallet:new");
  const { account, client } = wallet;
  const minOutFactor = 10_000n - BigInt(GUARD.slippageBps);
  let gasWei = 0n;
  const minimum = (quote: bigint) => {
    const value = quote * minOutFactor / 10_000n;
    if (value <= 0n) throw new Error("Quote too small to enforce the slippage limit");
    return value;
  };
  const checkedSwap = async (params: { tokenIn: Address; tokenOut: Address; fee: number; recipient: Address; amountIn: bigint; amountOutMinimum: bigint; sqrtPriceLimitX96: bigint }, value?: bigint) => {
    const request = { address: CONTRACTS.swapRouter02 as Address, abi: routerAbi, functionName: "exactInputSingle" as const, args: [params] as const, value };
    await publicClient.simulateContract({ ...request, account: account.address });
    return client.writeContract(request);
  };

  if (intent.side === "BUY") {
    const amountIn = parseEther(intent.amount.toFixed(18));
    const quotedOut = await quoteBuyOut(intent.token, intent.fee, amountIn);
    if (quotedOut === null) throw new Error("no buy quote at order size");
    const hash = await checkedSwap({
      tokenIn: CONTRACTS.weth as Address, tokenOut: intent.token,
      fee: intent.fee, recipient: account.address, amountIn,
      amountOutMinimum: minimum(quotedOut), sqrtPriceLimitX96: 0n,
    }, amountIn);
    const receipt = await confirmed(hash);
    const amountOutRaw = receivedTokens(receipt, intent.token, account.address);
    if (amountOutRaw <= 0n) throw new Error(`confirmed swap needs token reconciliation: ${hash}`);
    return { hash, amountInRaw: amountIn, amountOutRaw, gasWei: receiptFee(receipt), settlementComplete: true };
  }

  // SELL: raw amount is authoritative; approve, swap, unwrap proceeds.
  const amountIn = intent.amountRaw;
  if (amountIn === undefined || amountIn <= 0n)
    throw new Error("sell without raw amount");
  const quotedOut = await quoteSellOut(intent.token, intent.fee, amountIn);
  if (quotedOut === null) throw new Error("no sell quote at order size");
  minimum(quotedOut);
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
      args: [CONTRACTS.swapRouter02 as Address, amountIn],
    });
    gasWei += receiptFee(await confirmed(approveHash));
  }

  const hash = await checkedSwap({
    tokenIn: intent.token, tokenOut: CONTRACTS.weth as Address,
    fee: intent.fee, recipient: account.address, amountIn,
    amountOutMinimum: minimum(quotedOut), sqrtPriceLimitX96: 0n,
  });
  const receipt = await confirmed(hash);
  gasWei += receiptFee(receipt);
  const proceeds = receivedTokens(receipt, CONTRACTS.weth as Address, account.address);
  if (proceeds <= 0n) throw new Error(`confirmed sell needs proceeds reconciliation: ${hash}`);
  // Settle only proceeds credited by this swap. Existing WETH is unrelated.
  // If settlement fails, the caller records the confirmed swap and pauses.
  try {
    const unwrapHash = await client.writeContract({
      address: CONTRACTS.weth as Address,
      abi: wethAbi,
      functionName: "withdraw",
      args: [proceeds],
    });
    gasWei += receiptFee(await confirmed(unwrapHash));
  } catch {
    logRun({ kind: "settlement", stage: "needs_reconciliation", swapHash: hash, proceeds });
    return { hash, amountInRaw: amountIn, amountOutRaw: proceeds, gasWei, settlementComplete: false };
  }
  return { hash, amountInRaw: amountIn, amountOutRaw: proceeds, gasWei, settlementComplete: true };
}
