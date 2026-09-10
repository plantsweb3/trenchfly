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
import { assertChain } from "./guard";
import { receiptFee, receivedTokens } from "./settlement";
import { rpcUrl } from "./rpc";
import { executeOrder, type TransactionEvent } from "./execution-engine";
export type { ExecutionResult } from "./execution-engine";

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

export async function placeLive(intent: OrderIntent, journal:(event:TransactionEvent)=>void, assertFresh:()=>void) {
  assertChain(await publicClient.getChainId(), robinhoodChain.id);
  const wallet=walletFromEnv();if(!wallet)throw new Error("Live wallet unconfigured");
  const {account,client}=wallet;
  const amountIn=intent.side==="BUY"?parseEther(intent.amount.toFixed(18)):intent.amountRaw;
  if(amountIn===undefined || amountIn<=0n || !Number.isFinite(intent.amount) || intent.amount<=0 || (intent.side==="BUY" && intent.amount>GUARD.orderEth))throw new Error("Invalid order amount");
  const swapRequest=(side:"BUY"|"SELL",amount:bigint,minimum:bigint)=>({
    address:CONTRACTS.swapRouter02 as Address,abi:routerAbi,functionName:"exactInputSingle" as const,
    args:[{tokenIn:side==="BUY"?CONTRACTS.weth as Address:intent.token,tokenOut:side==="BUY"?intent.token:CONTRACTS.weth as Address,fee:intent.fee,recipient:account.address,amountIn:amount,amountOutMinimum:minimum,sqrtPriceLimitX96:0n}] as const,
    value:side==="BUY"?amount:undefined,
  });
  const approval=(amount:bigint)=>({address:intent.token,abi:erc20Abi,functionName:"approve" as const,args:[CONTRACTS.swapRouter02 as Address,amount] as const});
  const unwrap=(amount:bigint)=>({address:CONTRACTS.weth as Address,abi:wethAbi,functionName:"withdraw" as const,args:[amount] as const});
  return executeOrder({side:intent.side,amountIn,slippageBps:GUARD.slippageBps},{
    quote:(side,amount)=>side==="BUY"?quoteBuyOut(intent.token,intent.fee,amount):quoteSellOut(intent.token,intent.fee,amount),
    allowance:()=>publicClient.readContract({address:intent.token,abi:erc20Abi,functionName:"allowance",args:[account.address,CONTRACTS.swapRouter02 as Address]}),
    async simulateApproval(amount){const result=await publicClient.simulateContract({...approval(amount),account:account.address});if(!result.result)throw new Error("Approval simulation returned false");},
    approve:amount=>client.writeContract(approval(amount)),
    async simulateSwap(side,amount,minimum){await publicClient.simulateContract({...swapRequest(side,amount,minimum),account:account.address});},
    swap:(side,amount,minimum)=>client.writeContract(swapRequest(side,amount,minimum)),
    async simulateUnwrap(amount){await publicClient.simulateContract({...unwrap(amount),account:account.address});},
    unwrap:amount=>client.writeContract(unwrap(amount)),
    async receipt(hash){const r=await publicClient.waitForTransactionReceipt({hash,timeout:120_000});return {status:r.status,gasWei:receiptFee(r),received:receivedTokens(r,intent.side==="BUY"?intent.token:CONTRACTS.weth as Address,account.address)};},
    assertFresh,
  },event=>{journal(event);logRun({recordType:"transaction",...event});});
}
