// Read-only readiness probe. No signer, wallet client, approvals or broadcasts.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isAddress, parseAbi, parseEther, formatEther, formatUnits, type Address } from "viem";
import { publicClient, quoteBuyOut, quoteEth, quoteSellOut, tokenDecimals } from "./market";
import { CONTRACTS, GUARD, robinhoodChain } from "./config";
import { assertChain } from "./guard";
import { rpcFailureStatus, safeError } from "../lib/rpc-config";

const dir = dirname(fileURLToPath(import.meta.url));
const abi = parseAbi(["function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)"]);
async function main() {
  const chainId = await publicClient.getChainId(); assertChain(chainId, robinhoodChain.id);
  const response = await fetch("https://robinfly.net/api/wallet", { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("Public wallet unavailable");
  const wallet = await response.json() as { address?: unknown };
  if (!isAddress(String(wallet.address), { strict: false })) throw new Error("Public wallet address is not valid");
  const account = wallet.address as Address;
  const amountIn = parseEther(GUARD.orderEth.toFixed(18));
  const rows: Record<string, unknown>[] = [];
  const tokens = JSON.parse(readFileSync(join(dir, "watchlist.json"), "utf8")).tokens as { symbol: string; address: Address }[];
  for (const token of tokens) {
    const row: Record<string, unknown> = { symbol: token.symbol, token: token.address };
    try {
      row.stage = "token_read";
      const decimals = await tokenDecimals(token.address);
      row.stage = "price_quote";
      const price = await quoteEth(token.address, decimals);
      if (!price) { row.status = "no_v3_quote"; rows.push(row); continue; }
      row.fee = price.fee; row.stage = "order_size_quote";
      const quotedOut = await quoteBuyOut(token.address, price.fee, amountIn);
      if (!quotedOut) throw new Error("No order-size buy quote");
      const minimum = quotedOut * (10_000n - BigInt(GUARD.slippageBps)) / 10_000n;
      row.stage = "buy_simulation";
      const simulation = await publicClient.simulateContract({
        account, address: CONTRACTS.swapRouter02 as Address, abi,
        functionName: "exactInputSingle", value: amountIn,
        args: [{ tokenIn: CONTRACTS.weth as Address, tokenOut: token.address, fee: price.fee, recipient: account, amountIn, amountOutMinimum: minimum, sqrtPriceLimitX96: 0n }],
      });
      if (simulation.result < minimum) throw new Error("Simulation output below quoted minimum");
      row.stage = "reverse_quote";
      const reverse = await quoteSellOut(token.address, price.fee, simulation.result);
      Object.assign(row, { status: "buy_simulation_passed", fee: price.fee, inputEth: formatEther(amountIn), outputTokens: formatUnits(simulation.result, decimals), reverseQuoteEth: reverse === null ? null : formatEther(reverse), sellExecutionTested: false });
    } catch (error) { row.status = "simulation_unavailable"; row.reason = safeError(error); if (rpcFailureStatus(error)) { rows.push(row); break; } }
    rows.push(row);
  }
  const report = { checkedAt: new Date().toISOString(), chainId, account, transactionsSubmitted: 0, method: "eth_call", limitations: "Quotes and read-only buy simulations only. Approval, sell execution, gas reconciliation and recovery have not been demonstrated onchain.", markets: rows };
  mkdirSync(join(dir, "runs"), { recursive: true });
  writeFileSync(join(dir, "runs", "route-readiness.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
void main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
