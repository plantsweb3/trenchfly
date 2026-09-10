// Trenchfly worker: the decision loop that turns decoder proposals into
// Robinhood Chain orders. Paper by default; --live requires a funded
// worker/.env wallet and explicit intent. Ctrl-C stops it cleanly.

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { formatEther, type Address } from "viem";
import { GUARD, robinhoodChain } from "./config";
import { decide } from "./brain";
import {
  publicClient,
  quoteEth,
  tokenBalance,
  tokenDecimals,
} from "./market";
import { logRun, placeLive, walletFromEnv, type OrderIntent } from "./execute";

const dir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(dir, ".env") });

const LIVE = process.argv.includes("--live");
const PREFLIGHT = process.argv.includes("--preflight");

interface WatchToken {
  symbol: string;
  venue: string;
  address: string;
  decimals?: number;
  history: number[];
  fee?: number;
}

const watchlist: WatchToken[] = JSON.parse(
  readFileSync(join(dir, "watchlist.json"), "utf8"),
).tokens.map((t: Omit<WatchToken, "history">) => ({ ...t, history: [] }));

let dailyOrders = 0;
let dayStamp = new Date().toISOString().slice(0, 10);
let startEquityEth: number | null = null;
let paperEth = GUARD.capitalEth;
const paperHoldings = new Map<string, number>();

async function equityEth(address: Address | null): Promise<number> {
  if (!LIVE || !address) {
    let eq = paperEth;
    for (const t of watchlist) {
      const qty = paperHoldings.get(t.symbol) ?? 0;
      const px = t.history[t.history.length - 1];
      if (qty && px) eq += qty * px;
    }
    return eq;
  }
  const wei = await publicClient.getBalance({ address });
  let eq = Number(formatEther(wei));
  for (const t of watchlist) {
    if (!t.address || !t.decimals) continue;
    const bal = await tokenBalance(t.address as Address, address);
    const px = t.history[t.history.length - 1];
    if (bal > 0n && px) eq += Number(bal) / 10 ** t.decimals * px;
  }
  return eq;
}

async function preflight() {
  const id = await publicClient.getChainId();
  console.log(`chain: ${id} (${robinhoodChain.name}) — ${id === robinhoodChain.id ? "OK" : "MISMATCH"}`);
  const wallet = walletFromEnv();
  if (!wallet) {
    console.log("wallet: none (run `npm run wallet:new`)");
  } else {
    const bal = await publicClient.getBalance({
      address: wallet.account.address,
    });
    const eth = Number(formatEther(bal));
    console.log(`wallet: ${wallet.account.address}`);
    console.log(`balance: ${eth.toFixed(6)} ETH`);
    if (eth > GUARD.capitalEth)
      console.log(
        `WARN: balance exceeds guard capital ${GUARD.capitalEth} ETH — move the excess out.`,
      );
  }
  const live = watchlist.filter((t) => t.address);
  console.log(
    `watchlist: ${live.length}/${watchlist.length} tokens have addresses (${live.map((t) => t.symbol).join(", ") || "none"})`,
  );
  for (const t of live) {
    const decimals = await tokenDecimals(t.address as Address).catch(() => null);
    if (decimals === null) {
      console.log(`  ${t.symbol}: not readable as ERC-20 — check the CA`);
      continue;
    }
    const q = await quoteEth(t.address as Address, decimals);
    console.log(
      `  ${t.symbol}: ${q ? `${q.priceEth.toExponential(4)} ETH (fee ${q.fee})` : "no v3 pool quote — still on a curve?"}`,
    );
  }
}

async function observe(t: WatchToken): Promise<void> {
  if (!t.address) return;
  if (t.decimals === undefined)
    t.decimals = await tokenDecimals(t.address as Address);
  const q = await quoteEth(t.address as Address, t.decimals);
  if (!q) return;
  t.fee = q.fee;
  t.history = [...t.history.slice(-99), q.priceEth];
  if (t.history.length < 8) return; // let the chart warm up

  const d = decide(t.history);
  const px = q.priceEth;
  const line = `${t.symbol.padEnd(8)} ${px.toExponential(3)} ETH  L ${d.rateL.toFixed(1)} R ${d.rateR.toFixed(1)} Δ ${d.diff >= 0 ? "+" : ""}${d.diff.toFixed(2)}  ${d.proposal}`;

  if (d.proposal === "HOLD") {
    console.log(line);
    return;
  }

  // ---- guard ----
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayStamp) {
    dayStamp = today;
    dailyOrders = 0;
  }
  const wallet = walletFromEnv();
  const eq = await equityEth(wallet?.account.address ?? null);
  if (startEquityEth === null) startEquityEth = eq;

  let rejected: string | null = null;
  if (dailyOrders >= GUARD.dailyOrders) rejected = "timing — daily cap";
  else if (startEquityEth - eq >= GUARD.drawdownStopEth)
    rejected = "drawdown stop — no new orders";
  else if (d.proposal === "BUY" && (LIVE ? eq : paperEth) < GUARD.orderEth * 1.2)
    rejected = "budget — cash below order size";
  else if (d.proposal === "SELL") {
    const qty = LIVE
      ? wallet
        ? Number(await tokenBalance(t.address as Address, wallet.account.address)) /
          10 ** t.decimals
        : 0
      : (paperHoldings.get(t.symbol) ?? 0);
    if (qty * px < GUARD.orderEth * 0.1) rejected = "inventory — nothing to sell";
  }

  if (rejected) {
    console.log(`${line}  ✗ ${rejected}`);
    logRun({ symbol: t.symbol, proposal: d.proposal, rejected });
    return;
  }

  const intent: OrderIntent = {
    side: d.proposal,
    symbol: t.symbol,
    token: t.address as Address,
    fee: t.fee!,
    decimals: t.decimals,
    amount:
      d.proposal === "BUY"
        ? GUARD.orderEth
        : Math.min(
            GUARD.orderEth / px,
            paperHoldings.get(t.symbol) ?? GUARD.orderEth / px,
          ),
    priceEth: px,
  };

  if (!LIVE) {
    if (intent.side === "BUY") {
      paperEth -= intent.amount;
      paperHoldings.set(
        t.symbol,
        (paperHoldings.get(t.symbol) ?? 0) + intent.amount / px,
      );
    } else {
      paperHoldings.set(
        t.symbol,
        (paperHoldings.get(t.symbol) ?? 0) - intent.amount,
      );
      paperEth += intent.amount * px;
    }
    dailyOrders += 1;
    console.log(`${line}  ✓ PAPER FILL`);
    logRun({ mode: "paper", ...intent });
    return;
  }

  const hash = await placeLive(intent);
  dailyOrders += 1;
  console.log(`${line}  ✓ ${robinhoodChain.blockExplorers!.default.url}/tx/${hash}`);
  logRun({ mode: "live", ...intent, hash });
}

async function main() {
  if (PREFLIGHT) return preflight();
  console.log(
    `trenchfly worker — ${LIVE ? "LIVE ORDERS" : "paper"} — chain ${robinhoodChain.id} — guard ${GUARD.orderEth} ETH/order, ${GUARD.dailyOrders}/day`,
  );
  if (LIVE && !walletFromEnv()) {
    console.error("--live needs FLY_PRIVATE_KEY in worker/.env");
    process.exit(1);
  }
  let i = 0;
  for (;;) {
    const t = watchlist[i % watchlist.length];
    i += 1;
    try {
      await observe(t);
    } catch (e) {
      console.error(`${t.symbol}: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, GUARD.minIntervalMs / watchlist.length));
  }
}

main();
