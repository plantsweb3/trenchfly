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
import { createBrain, type BrainIface } from "./brain";
import {
  publicClient,
  quoteEth,
  tokenBalance,
  tokenDecimals,
} from "./market";
import { logRun, placeLive, walletFromEnv, type OrderIntent } from "./execute";
import { scanNewPools } from "./discovery";

const dir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(dir, ".env") });

const LIVE = process.argv.includes("--live");
const PREFLIGHT = process.argv.includes("--preflight");

let BRAIN: BrainIface;

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

let ordersTotal = 0;
let paperEth = GUARD.capitalEth;
const paperHoldings = new Map<string, number>();

// Creator rewards / deposits flow into this wallet, so drawdown is measured
// on TRADING P&L only (sell proceeds + open position value − buy costs) —
// never on the raw balance, which is expected to grow with coin volume.
let buyTotalEth = 0;
let sellTotalEth = 0;

async function positionsEth(address: Address | null): Promise<number> {
  let v = 0;
  for (const t of watchlist) {
    const px = t.history[t.history.length - 1];
    if (!px) continue;
    if (!LIVE || !address) {
      v += (paperHoldings.get(t.symbol) ?? 0) * px;
    } else if (t.address && t.decimals) {
      const bal = await tokenBalance(t.address as Address, address);
      if (bal > 0n) v += (Number(bal) / 10 ** t.decimals) * px;
    }
  }
  return v;
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

  const d = await BRAIN.decide(t.symbol, t.history, q.priceEth);
  const px = q.priceEth;
  const line = `${t.symbol.padEnd(8)} ${px.toExponential(3)} ETH  L ${d.rateL.toFixed(1)} R ${d.rateR.toFixed(1)} Δ ${d.diff >= 0 ? "+" : ""}${d.diff.toFixed(2)}  ${d.proposal}`;

  if (d.proposal === "HOLD") {
    console.log(line);
    return;
  }

  // ---- guard ----
  const wallet = walletFromEnv();
  const openPositionsEth = await positionsEth(
    wallet?.account.address ?? null,
  );
  const tradingPnl = sellTotalEth + openPositionsEth - buyTotalEth;
  const cashEth =
    LIVE && wallet
      ? Number(
          formatEther(
            await publicClient.getBalance({ address: wallet.account.address }),
          ),
        )
      : paperEth;

  let rejected: string | null = null;
  if (tradingPnl <= -GUARD.drawdownStopEth)
    rejected = "drawdown stop — trading P&L, deposits excluded";
  else if (
    d.proposal === "BUY" &&
    openPositionsEth + GUARD.orderEth > GUARD.maxInventoryEth
  )
    rejected = "inventory cap — open positions at maximum";
  else if (d.proposal === "BUY" && cashEth < GUARD.orderEth * 1.2)
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
    logRun({ symbol: t.symbol, proposal: d.proposal, rejected, tier: BRAIN.tier, frameSha: d.frameSha });
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
    ordersTotal += 1;
    console.log(`${line}  ✓ PAPER FILL`);
    logRun({ mode: "paper", tier: BRAIN.tier, frameSha: d.frameSha, ...intent });
    return;
  }

  const hash = await placeLive(intent);
  ordersTotal += 1;
  console.log(`${line}  ✓ ${robinhoodChain.blockExplorers!.default.url}/tx/${hash}`);
  logRun({ mode: "live", tier: BRAIN.tier, frameSha: d.frameSha, ...intent, hash });
}

async function main() {
  if (PREFLIGHT) return preflight();
  BRAIN = await createBrain();
  console.log(`brain: ${BRAIN.label}`);
  console.log(
    `trenchfly worker — ${LIVE ? "LIVE ORDERS" : "paper"} — chain ${robinhoodChain.id} — guard ${GUARD.orderEth} ETH/order, no daily cap`,
  );
  if (LIVE && !walletFromEnv()) {
    console.error("--live needs FLY_PRIVATE_KEY in worker/.env");
    process.exit(1);
  }
  let i = 0;
  const MAX_WATCH = 14;
  for (;;) {
    // discovery pass once per full rotation: new WETH-paired pools join
    // the rotation; oldest discovered pairs rotate out past MAX_WATCH.
    if (i % Math.max(watchlist.length, 1) === 0) {
      try {
        const found = await scanNewPools();
        for (const f of found) {
          if (watchlist.some((t) => t.address.toLowerCase() === f.address.toLowerCase()))
            continue;
          watchlist.push({
            symbol: f.symbol,
            venue: "new pair",
            address: f.address,
            history: [],
          });
          console.log(`🪰 new pair discovered: ${f.symbol} (${f.address})`);
          logRun({ discovered: f });
        }
        while (watchlist.length > MAX_WATCH) {
          const idx = watchlist.findIndex((t) => t.venue === "new pair");
          if (idx === -1) break;
          const [gone] = watchlist.splice(idx, 1);
          console.log(`rotated out: ${gone.symbol}`);
        }
      } catch (e) {
        console.error(`discovery: ${(e as Error).message}`);
      }
    }
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
