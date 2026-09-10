// RobinFly worker. Paper is the default; no signer is loaded in paper mode.
import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { formatEther, formatUnits, isAddress, parseEther, parseUnits, type Address } from "viem";
import { GUARD, robinhoodChain } from "./config";
import { createBrain, type BrainIface, type Decision } from "./brain";
import { publicClient, quoteEth, quoteBuyOut, quoteSellOut, tokenBalance, tokenDecimals } from "./market";
import { logRun, placeLive, walletFromEnv, type OrderIntent } from "./execute";
import { scanNewPools } from "./discovery";
import { maybePublish, flushFeed, type FeedDecision, type FeedPayload, type WorkerStatus } from "./feed";
import { acquireWorkerLock, loadLedger, saveLedger, type Ledger, type Mode } from "./state";
import { assertChain, guardReason } from "./guard";
import { rpcFailureStatus, safeError } from "../lib/rpc-config";

const dir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(dir, ".env") });
const LIVE = process.argv.includes("--live");
const mode: Mode = LIVE ? "live" : "paper";
const PREFLIGHT = process.argv.includes("--preflight");
const NO_PUBLISH = process.argv.includes("--no-publish");
const DISCOVER = process.argv.includes("--discover");
const maxArg = process.argv.find(a => a.startsWith("--max-observations="))?.split("=")[1];
const maxObservations = maxArg ? Number(maxArg) : Infinity;
if (maxArg && (!Number.isInteger(maxObservations) || maxObservations < 1)) throw new Error("--max-observations must be a positive integer");
const runs = join(dir, "runs");
const runId = randomUUID();
const startedAt = new Date().toISOString();

interface WatchToken {
  symbol: string; venue: string; address: Address; decimals?: number; history: number[]; fee?: number;
  lastQuoteAt: number; status: "checking" | "warming" | "ready" | "no_quote" | "error";
}
const watchlist: WatchToken[] = [];
for (const t of JSON.parse(readFileSync(join(dir, "watchlist.json"), "utf8")).tokens) {
  if (!isAddress(t.address, { strict: false })) throw new Error(`Invalid watchlist address for ${String(t.symbol).slice(0, 24)}`);
  if (!watchlist.some(w => w.address.toLowerCase() === t.address.toLowerCase())) watchlist.push({ ...t, symbol: String(t.symbol).slice(0, 24), history: [], lastQuoteAt: 0, status: "checking" });
}
if (!watchlist.length) throw new Error("Watchlist is empty");

let brain: BrainIface | undefined;
let state: Ledger;
let liveAddress: Address | null = null;
let status: WorkerStatus = "starting";
let lastError: string | null = null;
let obsTotal = 0;
let lastObservationAt: string | null = null;
let stopping = false;
let fatal = false;
let wake: (() => void) | undefined;
const recent: FeedDecision[] = [];
const key = (t: WatchToken) => t.address.toLowerCase();

function snapshot(): FeedPayload {
  return {
    schemaVersion: 2, mode, runId, status, tier: brain?.tier ?? null,
    brainLabel: brain?.label ?? "Starting connectome", startedAt, obs: obsTotal,
    lastObservationAt, lastError, watching: watchlist.map(t => t.symbol), recent,
    markets: watchlist.map(t => ({ symbol: t.symbol, address: t.address, status: t.status, samples: t.history.length, lastQuoteAt: t.lastQuoteAt ? new Date(t.lastQuoteAt).toISOString() : null, priceEth: t.history.at(-1) ?? null })),
    accounting: { kind: LIVE ? "live_ledger" : "quote_based_paper", gasIncluded: LIVE, orders: state?.ordersTotal ?? 0 },
  };
}
function publish(urgent = false) { return NO_PUBLISH ? Promise.resolve(true) : maybePublish(snapshot(), urgent); }
function save() {
  try { saveLedger(runs, state); }
  catch (error) { fatal = true; stopping = true; status = "degraded"; lastError = "Accounting could not be saved; worker stopped."; throw error; }
}
function record(t: WatchToken, d: Decision, result: string, urgent = false) {
  const decision = { id: randomUUID(), t: new Date().toISOString(), symbol: t.symbol, token: t.address, proposal: d.proposal, rateL: +d.rateL.toFixed(1), rateR: +d.rateR.toFixed(1), dev: +d.diff.toFixed(2), gate: d.gate, frameSha: d.frameSha, result, priceEth: t.history.at(-1), quoteAt: new Date(t.lastQuoteAt).toISOString() };
  obsTotal++; lastObservationAt = decision.t; recent.push(decision);
  if (recent.length > 40) recent.shift();
  logRun({ mode, runId, tier: brain?.tier, ...decision });
  void publish(urgent);
}

async function preflight() {
  const actual = await publicClient.getChainId();
  assertChain(actual, robinhoodChain.id);
  console.log(`chain: ${actual} — verified`);
  const wallet = walletFromEnv();
  if (wallet) console.log(`wallet: ${wallet.account.address}; balance: ${formatEther(await publicClient.getBalance({ address: wallet.account.address }))} ETH`);
  else console.log("wallet: unconfigured (not needed for paper operation)");
  let supported = 0;
  for (const t of watchlist) {
    try {
      const decimals = await tokenDecimals(t.address);
      const q = await quoteEth(t.address, decimals);
      if (q) supported++;
      console.log(`${t.symbol}: ${q ? `${q.priceEth.toExponential(4)} ETH; v3 fee ${q.fee}` : "no usable v3 quote"}`);
    } catch (error) { if (rpcFailureStatus(error)) throw error; console.log(`${t.symbol}: token read unavailable`); }
  }
  console.log(`quoted markets: ${supported}/${watchlist.length}; no transactions submitted`);
  if (!supported) throw new Error("No usable markets");
}

async function valuation(): Promise<{ total: number; complete: boolean }> {
  let total = 0, complete = true;
  for (const t of watchlist) {
    let quantity = state.holdings[key(t)] ?? 0;
    if (LIVE && liveAddress) {
      try {
        t.decimals ??= await tokenDecimals(t.address);
        quantity = Number(formatUnits(await tokenBalance(t.address, liveAddress), t.decimals));
      } catch (error) { if (rpcFailureStatus(error)) throw error; complete = false; continue; }
    }
    if (quantity <= 0) continue;
    const price = t.history.at(-1);
    if (!price || !Number.isFinite(price) || Date.now() - t.lastQuoteAt > 5 * 60_000) { complete = false; continue; }
    total += quantity * price;
  }
  for (const [address, quantity] of Object.entries(state.holdings)) if (quantity > 0 && !watchlist.some(t => key(t) === address)) complete = false;
  return { total, complete };
}

async function observe(t: WatchToken) {
  t.decimals ??= await tokenDecimals(t.address);
  if (!Number.isInteger(t.decimals) || t.decimals < 0 || t.decimals > 36) throw new Error("Unsupported token decimals");
  const quote = await quoteEth(t.address, t.decimals);
  if (!quote || !Number.isFinite(quote.priceEth) || quote.priceEth <= 0) { t.status = "no_quote"; return; }
  t.fee = quote.fee; t.lastQuoteAt = Date.now();
  t.history = [...t.history.slice(-99), quote.priceEth];
  t.status = t.history.length < 8 ? "warming" : "ready";
  state.tokens[key(t)] = { symbol: t.symbol, decimals: t.decimals, fee: t.fee };
  if (t.history.length < 8 || stopping) return;
  if (!brain) throw new Error("Brain unavailable");
  const d = await brain.decide(t.symbol, t.history, quote.priceEth, t.address);
  if (stopping) return;
  status = "running"; lastError = null;
  const line = `${t.symbol} ${d.proposal} L ${d.rateL.toFixed(1)} R ${d.rateR.toFixed(1)} Δ ${d.diff.toFixed(2)}`;
  if (d.proposal === "HOLD") { console.log(`${line} HOLD`); record(t, d, "hold"); return; }

  const positions = await valuation();
  const cashEth = LIVE && liveAddress ? Number(formatEther(await publicClient.getBalance({ address: liveAddress }))) : state.paperEth;
  const rawBalance = LIVE && liveAddress ? await tokenBalance(t.address, liveAddress) : undefined;
  const quantity = rawBalance !== undefined ? Number(formatUnits(rawBalance, t.decimals)) : state.holdings[key(t)] ?? 0;
  const rejected = guardReason({ side: d.proposal, now: Date.now(), lastOrderAt: state.lastOrderAt, cashEth, positionsEth: positions.total, tradingPnl: state.sellTotalEth + positions.total - state.buyTotalEth - state.gasEth, sellableEth: quantity * quote.priceEth, valuationComplete: positions.complete, pending: state.pending !== null }, GUARD);
  if (rejected) { console.log(`${line} REJECTED: ${rejected}`); record(t, d, `rejected: ${rejected}`); return; }

  const intent: OrderIntent = { side: d.proposal, symbol: t.symbol, token: t.address, fee: t.fee, decimals: t.decimals, amount: d.proposal === "BUY" ? GUARD.orderEth : Math.min(GUARD.orderEth / quote.priceEth, quantity), priceEth: quote.priceEth };
  if (d.proposal === "SELL") {
    const balance = rawBalance ?? parseUnits(quantity.toFixed(t.decimals), t.decimals);
    const fraction = Math.min(intent.amount / quantity, 1);
    intent.amountRaw = fraction >= 1 ? balance : balance * BigInt(Math.floor(fraction * 1e9)) / 1_000_000_000n;
    if (intent.amountRaw <= 0n) { record(t, d, "rejected: sell amount rounds to zero"); return; }
  }
  if (!LIVE) {
    // Paper uses the same-direction quote at the actual order size. It includes
    // pool fees/impact, but does not claim simulated gas is real expenditure.
    const amountIn = intent.side === "BUY" ? parseEther(intent.amount.toFixed(18)) : intent.amountRaw!;
    const amountOut = intent.side === "BUY" ? await quoteBuyOut(t.address, t.fee, amountIn) : await quoteSellOut(t.address, t.fee, amountIn);
    if (amountOut === null || amountOut <= 0n) { record(t, d, "rejected: no quote at order size"); return; }
    if (intent.side === "BUY") {
      const spent = Number(formatEther(amountIn));
      state.paperEth -= spent; state.buyTotalEth += spent;
      state.holdings[key(t)] = quantity + Number(formatUnits(amountOut, t.decimals));
    } else {
      const proceeds = Number(formatEther(amountOut));
      state.holdings[key(t)] = Math.max(0, quantity - Number(formatUnits(amountIn, t.decimals)));
      state.paperEth += proceeds; state.sellTotalEth += proceeds;
    }
    state.lastOrderAt = Date.now(); state.ordersTotal++; save();
    console.log(`${line} PAPER FILL (order-size quote, gas excluded)`);
    record(t, d, "paper fill", true);
    return;
  }

  state.pending = { id: randomUUID(), token: t.address, side: intent.side, createdAt: new Date().toISOString() };
  state.lastOrderAt = Date.now(); save();
  try {
    const receipt = await placeLive(intent);
    state.pending.hash = receipt.hash;
    state.gasEth += Number(formatEther(receipt.gasWei));
    if (intent.side === "BUY") {
      state.buyTotalEth += Number(formatEther(receipt.amountInRaw));
      state.holdings[key(t)] = quantity + Number(formatUnits(receipt.amountOutRaw, t.decimals));
    } else {
      state.sellTotalEth += Number(formatEther(receipt.amountOutRaw));
      state.holdings[key(t)] = Math.max(0, quantity - Number(formatUnits(receipt.amountInRaw, t.decimals)));
    }
    state.ordersTotal++;
    if (receipt.settlementComplete) state.pending = null;
    else { status = "degraded"; lastError = "A confirmed swap needs settlement reconciliation; new orders are paused."; }
    save(); record(t, d, `live ${receipt.hash}`, true);
  } catch (error) {
    // A broadcast may have succeeded even if the response was lost. Preserve
    // intent and pause; never turn an unknown outcome into an automatic retry.
    status = "degraded"; lastError = "An execution outcome needs reconciliation; new orders are paused.";
    save(); record(t, d, "execution unresolved", true);
    console.error(`execution paused: ${safeError(error)}`);
  }
}

async function main() {
  if (PREFLIGHT) return preflight();
  const release = acquireWorkerLock(runs);
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stop = () => { stopping = true; brain?.close(); wake?.(); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    assertChain(await publicClient.getChainId(), robinhoodChain.id);
    if (LIVE) {
      liveAddress = walletFromEnv()?.account.address ?? null;
      if (!liveAddress) throw new Error("Live wallet is unconfigured");
    }
    state = loadLedger(runs, mode, GUARD.capitalEth, liveAddress);
    if (state.pending) throw new Error("Pending execution requires reconciliation before restart");
    for (const [address, meta] of Object.entries(state.tokens)) if ((state.holdings[address] ?? 0) > 0 && !watchlist.some(t => key(t) === address)) watchlist.push({ ...meta, address: address as Address, venue: "saved position", history: [], lastQuoteAt: 0, status: "checking" });
    save(); await publish(true);
    heartbeat = setInterval(() => { void publish(); }, 30_000);
    brain = await createBrain({ requireConnectome: LIVE || !process.argv.includes("--allow-proxy") });
    if (stopping) return;
    status = "warming"; await publish(true);
    console.log(`RobinFly ${mode}; ${brain.label}; order cooldown ${GUARD.minIntervalMs / 1000}s`);
    let i = 0;
    while (!stopping && obsTotal < maxObservations) {
      if (DISCOVER && i % watchlist.length === 0 && watchlist.length < 14) {
        try { for (const found of await scanNewPools()) if (watchlist.length < 14 && !watchlist.some(t => key(t) === found.address.toLowerCase())) watchlist.push({ symbol: found.symbol, address: found.address as Address, venue: "discovered", history: [], lastQuoteAt: 0, status: "checking" }); }
        catch (error) { if (rpcFailureStatus(error)) throw error; lastError = "Pool discovery is unavailable; configured markets remain active."; }
      }
      const t = watchlist[i++ % watchlist.length];
      try {
        await observe(t);
        if (state.pending) { stopping = true; fatal = true; }
      } catch (error) {
        if (stopping) break;
        t.status = "error"; status = "degraded";
        lastError = rpcFailureStatus(error) ? safeError(error) : "A market or brain observation failed. No order was inferred from the error.";
        if (rpcFailureStatus(error)) { stopping = true; fatal = true; process.exitCode = 1; }
        console.error(`${t.symbol}: ${safeError(error)}`);
      }
      if (stopping || obsTotal >= maxObservations) break;
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => { wake = undefined; resolve(); }, Math.max(1000, 15_000 / watchlist.length));
        wake = () => { clearTimeout(timer); wake = undefined; resolve(); };
      });
    }
  } catch (error) {
    fatal = true; status = "degraded"; lastError = rpcFailureStatus(error) ? safeError(error) : "Worker startup or persistence failed; observation is paused.";
    console.error(safeError(error));
    process.exitCode = 1;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    brain?.close();
    if (!fatal) { status = "stopped"; lastError = null; }
    await publish(true); await flushFeed();
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
    release();
  }
}

void main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
