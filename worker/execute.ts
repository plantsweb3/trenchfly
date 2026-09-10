// Order execution. Paper mode appends to runs/log.jsonl and touches no
// chain state. Live mode signs Uniswap v3 exactInputSingle swaps with the
// fly's wallet. Sells deliver WETH (not unwrapped) to keep the path simple.

import {
  createWalletClient,
  http,
  parseAbi,
  parseEther,
  parseUnits,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CONTRACTS, GUARD, robinhoodChain } from "./config";
import { publicClient } from "./market";

const dir = dirname(fileURLToPath(import.meta.url));
const runsDir = join(dir, "runs");

const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
]);

const erc20Abi = parseAbi([
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
]);

export interface OrderIntent {
  side: "BUY" | "SELL";
  symbol: string;
  token: Address;
  fee: number;
  decimals: number;
  /** BUY: ETH in. SELL: token qty in whole units. */
  amount: number;
  priceEth: number;
}

export function logRun(entry: Record<string, unknown>) {
  mkdirSync(runsDir, { recursive: true });
  appendFileSync(
    join(runsDir, "log.jsonl"),
    JSON.stringify({ t: new Date().toISOString(), ...entry }) + "\n",
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

export async function placeLive(intent: OrderIntent): Promise<string> {
  const wallet = walletFromEnv();
  if (!wallet) throw new Error("FLY_PRIVATE_KEY missing — run wallet:new");
  const { account, client } = wallet;

  const minOutFactor = 10_000n - BigInt(GUARD.slippageBps);

  if (intent.side === "BUY") {
    const amountIn = parseEther(intent.amount.toFixed(18));
    const expectedOut = parseUnits(
      (intent.amount / intent.priceEth).toFixed(intent.decimals),
      intent.decimals,
    );
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
          amountOutMinimum: (expectedOut * minOutFactor) / 10_000n,
          sqrtPriceLimitX96: 0n,
        },
      ],
      value: amountIn,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  // SELL: ensure allowance, then token→WETH
  const amountIn = parseUnits(
    intent.amount.toFixed(intent.decimals),
    intent.decimals,
  );
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
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }
  const expectedOut = parseEther(
    (intent.amount * intent.priceEth).toFixed(18),
  );
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
        amountOutMinimum: (expectedOut * minOutFactor) / 10_000n,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
