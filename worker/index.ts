// RobinFly worker. Paper is the default; no signer is loaded in paper mode.
import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { formatEther, formatUnits, isAddress, parseEther, parseUnits, type Address } from "viem";
import { CONTRACTS, GUARD, robinhoodChain } from "./config";
import { createBrain, type BrainIface, type Decision } from "./brain";
import { publicClient, rpcBudget, quoteEth, quoteBuyOut, quoteSellOut, tokenBalance, tokenDecimals } from "./market";
import { logRun, placeLive, walletFromEnv, type OrderIntent } from "./execute";
import { scanNewPools, loadPoolMetadata, ingestPools, configuredPool, poolStats, DISCOVERY_SCOPE, CONFIRMATIONS } from "./discovery";
import { loadMarketStore, saveMarketStore, selectActive, poolContext, chooseObservation, signalFresh, type MarketStore, type Candidate } from "./pipeline";
import { startTelemetryServer, writeLocalTelemetry } from "./telemetry";
import { maybePublish, flushFeed, type FeedDecision, type FeedPayload, type WorkerStatus } from "./feed";
import { acquireWorkerLock, loadLedger, saveLedger, type Ledger, type Mode } from "./state";
import { assertChain, guardReason } from "./guard";
import { rpcFailureStatus, safeError } from "../lib/rpc-config";

const dir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(dir, ".env") });
const LIVE = process.argv.includes("--live");
const mode: Mode = LIVE ? "live" : "paper";
const PREFLIGHT = process.argv.includes("--preflight");
if(!LIVE && !PREFLIGHT)delete process.env.FLY_PRIVATE_KEY;
const NO_PUBLISH = process.argv.includes("--no-publish");
const DISCOVER = !process.argv.includes("--no-discovery");
const maxArg = process.argv.find(a => a.startsWith("--max-observations="))?.split("=")[1];
const maxObservations = maxArg ? Number(maxArg) : Infinity;
if (maxArg && (!Number.isInteger(maxObservations) || maxObservations < 1)) throw new Error("--max-observations must be a positive integer");
const runs = join(dir, "runs");
const runId = randomUUID();
const startedAt = new Date().toISOString();

interface WatchToken {
  symbol: string; venue: string; address: Address; decimals?: number; history: number[]; fee?: number;
  pool?: string; context?: Record<string, unknown>;
  lastQuoteAt: number; status: "checking" | "warming" | "ready" | "no_quote" | "error";
}
const watchlist: WatchToken[] = [];
for (const t of JSON.parse(readFileSync(join(dir, "watchlist.json"), "utf8")).tokens) {
  if (!isAddress(t.address, { strict: false })) throw new Error(`Invalid watchlist address for ${String(t.symbol).slice(0, 24)}`);
  if (!watchlist.some(w => w.address.toLowerCase() === t.address.toLowerCase())) watchlist.push({ ...t, symbol: String(t.symbol).slice(0, 24), history: [], lastQuoteAt: 0, status: "checking" });
}
if (!watchlist.length) throw new Error("Watchlist is empty");

const starters = structuredClone(watchlist);
let markets: MarketStore;
let lastIngestionAt: string | null = null;
let ingestionError: string | null = null;
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
    rpcUsage: rpcBudget.summary(),
    schemaVersion: 2, mode, runId, status, tier: brain?.tier ?? null,
    brainLabel: brain?.label ?? "Starting connectome", startedAt, obs: obsTotal,
    lastObservationAt, lastError, watching: watchlist.map(t => t.symbol), recent,
    discovery: { enabled: DISCOVER, scope: DISCOVERY_SCOPE, confirmationBlocks: Number(CONFIRMATIONS), cursor: markets?.cursor ?? null, head: markets?.observedHead ?? null, queued: Object.values(markets?.candidates ?? {}).filter(c=>c.origin!=="factory_lookup").length, active: watchlist.length, lastIngestionAt, error: ingestionError, selection: "Software rotates candidates; connectome proposes BUY/SELL/HOLD" },
    markets: watchlist.map(t => ({ symbol: t.symbol, address: t.address, status: t.status, samples: t.history.length, lastQuoteAt: t.lastQuoteAt ? new Date(t.lastQuoteAt).toISOString() : null, priceEth: t.history.at(-1) ?? null, pool: t.pool ?? null, context: t.context ?? null })),
    accounting: { kind: LIVE ? "live_ledger" : "quote_based_paper", gasIncluded: LIVE, orders: state?.ordersTotal ?? 0 },
  };
}
function publish(urgent = false) { const payload=snapshot(); writeLocalTelemetry(runs,payload); return NO_PUBLISH ? Promise.resolve(true) : maybePublish(payload, urgent); }
function save() {
  try { saveLedger(runs, state); }
  catch (error) { fatal = true; stopping = true; status = "degraded"; lastError = "Accounting could not be saved; worker stopped."; throw error; }
}
function record(t: WatchToken, d: Decision, result: string, urgent = false) {
  const decision = { id: randomUUID(), t: new Date().toISOString(), symbol: t.symbol, token: t.address, proposal: d.proposal, rateL: +d.rateL.toFixed(1), rateR: +d.rateR.toFixed(1), dev: +d.diff.toFixed(2), gate: d.gate, frameSha: d.frameSha, result, priceEth: t.history.at(-1), quoteAt: new Date(t.lastQuoteAt).toISOString(), input: t.context, pool: t.pool, neural: d.neural, inferenceMs: d.inferenceMs, signalAgeMs: Date.now()-t.lastQuoteAt };
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
  if (t.decimals === undefined || t.fee === undefined || !t.history.length || !brain) return;
  const quote = { priceEth: t.history.at(-1)!, fee: t.fee };
  const d = await brain.decide(t.symbol, [...t.history], quote.priceEth, t.address, t.context);
  if (stopping) return;
  state.tokens[key(t)] = { symbol:t.symbol, decimals:t.decimals, fee:t.fee };
  status = ingestionError ? "degraded" : "running"; lastError = ingestionError;
  if (!signalFresh(t.lastQuoteAt, Date.now())) {record(t,d,"rejected: chart expired during inference");return;}
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
  if (!signalFresh(t.lastQuoteAt,Date.now())) {record(t,d,"rejected: chart expired during order checks");return;}
  if (!LIVE) {
    // Paper uses the same-direction quote at the actual order size. It includes
    // pool fees/impact, but does not claim simulated gas is real expenditure.
    const amountIn = intent.side === "BUY" ? parseEther(intent.amount.toFixed(18)) : intent.amountRaw!;
    const amountOut = intent.side === "BUY" ? await quoteBuyOut(t.address, t.fee, amountIn) : await quoteSellOut(t.address, t.fee, amountIn);
    if (!signalFresh(t.lastQuoteAt,Date.now())) {record(t,d,"rejected: chart expired during quote");return;}
    if (intent.side === "BUY" && amountOut !== null && amountOut > 0n) {
      // A reverse quote is a route check, not proof the wallet can sell a token.
      const reverse = await quoteSellOut(t.address,t.fee,amountOut);
      if (reverse === null || reverse <= 0n) {record(t,d,"rejected: no reverse route quote");return;}
    }
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
    const receipt = await placeLive(intent, event => {
      if (!state.pending) throw new Error("Pending order vanished");
      state.pending.transactions ??= [];
      state.pending.transactions.push(event);
      if(event.kind === "swap") state.pending.hash = event.hash;
      save();
    }, () => {if(!signalFresh(t.lastQuoteAt,Date.now()))throw new Error("Signal expired before submission");});
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

async function ingestOnce() {
  const selected=DISCOVER?selectActive(markets,state.holdings,Date.now()):[];
  saveMarketStore(runs,markets);
  // Keep original markets until the first pool candidate arrives, and always keep held positions.
  const targets:WatchToken[] = selected.map(c=>({symbol:c.symbol??c.token.slice(0,8),venue:DISCOVERY_SCOPE,address:c.token as Address,pool:c.pool,fee:c.fee,decimals:c.decimals,history:c.quotes.map(q=>q.priceEth),lastQuoteAt:c.quotes.at(-1)?.t??0,status:c.status==="queued"?"checking":c.status}));
  for(const t of [...watchlist,...starters]) if((!selected.length || (state.holdings[key(t)]??0)>0) && !targets.some(w=>key(w)===key(t))) targets.push(t);
  watchlist.splice(0,watchlist.length,...targets);
  let errors=0;
  for(const t of [...watchlist]) {
    if(stopping)return;
    try {
      let c:Candidate|undefined=t.pool?markets.candidates[t.pool]:undefined;
      if(c) {
        if(c.decimals===undefined || !c.symbol){const meta=await loadPoolMetadata(c);c=markets.candidates[c.pool];Object.assign(c,meta);}
        t.symbol=c.symbol!;t.decimals=c.decimals;
        if(!c.statsAt || Date.now()-c.statsAt>60_000){const stats=await poolStats(c);c=markets.candidates[c.pool];Object.assign(c,stats);}
        markets.candidates[c.pool]=c;
      }
      t.decimals ??= await tokenDecimals(t.address);
      if(!Number.isInteger(t.decimals)||t.decimals<0||t.decimals>36)throw new Error("Unsupported token decimals");
      const quote=await quoteEth(t.address,t.decimals,c?.fee);
      const quotedAt=Date.now();
      if(!quote || !Number.isFinite(quote.priceEth) || quote.priceEth<=0) {
        t.status="no_quote";if(c){c.status="no_quote";c.error="No quote on this pool";}continue;
      }
      if(!c){
        const pool=await configuredPool(t.address,quote.fee,t.symbol,t.decimals);
        if(pool){c=markets.candidates[pool.pool]??pool;markets.candidates[pool.pool]=c;t.pool=c.pool;}
      }else c=markets.candidates[c.pool];
      t.fee=quote.fee;t.lastQuoteAt=quotedAt;t.history=[...t.history.slice(-99),quote.priceEth];
      t.status=t.history.length<8?"warming":"ready";
      if(c){c.quotes=[...c.quotes.slice(-99),{t:t.lastQuoteAt,priceEth:quote.priceEth}];c.lastSampledAt=t.lastQuoteAt;c.status=t.status;c.error=null;t.context=poolContext(c,Date.now());}
      else t.context={source:"quoter_v2",pool:null,marketObservedAt:t.lastQuoteAt,candles:[],volumeEth5m:null,holders:null};
      saveMarketStore(runs,markets);
    } catch(error) {
      if(rpcFailureStatus(error) || /history changed|corruption|cursor|source mismatch|budget reached|ENOSPC|EACCES/.test(String(error)))throw error;
      errors++;t.status="error";
      if(t.pool){const c=markets.candidates[t.pool];c.status="error";c.error="Market read unavailable; will retry";}
      console.error(`ingestion ${t.symbol}: ${safeError(error)}`);
    }
  }
  saveMarketStore(runs,markets);
  lastIngestionAt=new Date().toISOString();ingestionError=errors?`${errors} market reads unavailable; affected candidates will retry.`:null;
  await publish();
}

async function main() {
  if (PREFLIGHT) return preflight();
  const release = acquireWorkerLock(runs);
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let ingestionTask: Promise<void> | undefined;
  let discoveryTask: Promise<void> | undefined;
  let swapTask:Promise<void>|undefined;
  let wakeSwaps:(()=>void)|undefined;
  let wakeDiscovery:(()=>void)|undefined;
  let telemetry: ReturnType<typeof startTelemetryServer> | undefined;
  let wakeIngestion: (()=>void)|undefined;
  const stop = () => { stopping = true; brain?.close(); wake?.(); wakeIngestion?.(); wakeDiscovery?.(); wakeSwaps?.(); };
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
    markets=loadMarketStore(runs,robinhoodChain.id,CONTRACTS.uniswapV3Factory);
    telemetry=startTelemetryServer(runs);
    save(); await publish(true);
    heartbeat = setInterval(() => { void publish().catch(()=>{fatal=true;stop();}); }, 15_000);
    if(DISCOVER) discoveryTask=(async()=>{
      while(!stopping){
        try{
          const next=await scanNewPools(markets);
          const merged={...next,candidates:{...next.candidates,...markets.candidates}};
          for(const [pool,c] of Object.entries(next.candidates))if(c.origin!=="factory_lookup"&&markets.candidates[pool]?.origin==="factory_lookup")Object.assign(merged.candidates[pool],{origin:"factory_event",block:c.block,blockHash:c.blockHash,tx:c.tx,logIndex:c.logIndex,createdAt:c.createdAt});
          saveMarketStore(runs,merged);markets=merged;
        }catch(error){ingestionError=safeError(error);lastError=ingestionError;status="degraded";fatal=true;process.exitCode=1;stop();break;}
        if(stopping)break;
        const lag=BigInt(markets.observedHead??"0")-BigInt(markets.cursor??"0");
        await new Promise<void>(resolve=>{const timer=setTimeout(()=>{wakeDiscovery=undefined;resolve();},lag>CONFIRMATIONS+10n?250:1500);wakeDiscovery=()=>{clearTimeout(timer);wakeDiscovery=undefined;resolve();};});
      }
    })();
    swapTask=(async()=>{
      while(!stopping){
        try{
          const candidates=watchlist.flatMap(t=>t.pool&&markets.candidates[t.pool]?[markets.candidates[t.pool]]:[]);
          const through=markets.cursor===null?(await publicClient.getBlockNumber({cacheTime:0}))-CONFIRMATIONS:BigInt(markets.cursor);
          const updates=await ingestPools(candidates,through);
          for(const c of updates){const current=markets.candidates[c.pool];markets.candidates[c.pool]={...current,swaps:c.swaps,swapCursor:c.swapCursor,swapHash:c.swapHash,swapThroughAt:c.swapThroughAt,swapFromAt:c.swapFromAt};}
          if(updates.length)saveMarketStore(runs,markets);
        }catch(error){ingestionError=safeError(error);lastError=ingestionError;status="degraded";fatal=true;process.exitCode=1;stop();break;}
        if(stopping)break;
        await new Promise<void>(resolve=>{const timer=setTimeout(()=>{wakeSwaps=undefined;resolve();},500);wakeSwaps=()=>{clearTimeout(timer);wakeSwaps=undefined;resolve();};});
      }
    })();
    ingestionTask=(async()=>{
      while(!stopping){
        try {await ingestOnce();}
        catch(error){ingestionError=safeError(error);lastError=ingestionError;status="degraded";
          if(rpcFailureStatus(error)||/history changed|corruption|cursor|source mismatch|budget reached|ENOSPC|EACCES/.test(String(error))){fatal=true;process.exitCode=1;stop();break;}
          console.error(`ingestion: ${safeError(error)}`);
        }
        if(stopping)break;
        await new Promise<void>(resolve=>{const timer=setTimeout(()=>{wakeIngestion=undefined;resolve();},10_000);wakeIngestion=()=>{clearTimeout(timer);wakeIngestion=undefined;resolve();};});
      }
    })();
    brain = await createBrain({ requireConnectome: LIVE || !process.argv.includes("--allow-proxy") });
    if (stopping) return;
    status = "warming"; await publish(true);
    console.log(`RobinFly ${mode}; ${brain.label}; order cooldown ${GUARD.minIntervalMs / 1000}s`);
    const consumed=new Map<string,number>();
    while (!stopping && obsTotal < maxObservations) {
      const available=chooseObservation(watchlist,consumed,Date.now());
      if(!available){await new Promise<void>(resolve=>{const timer=setTimeout(()=>{wake=undefined;resolve();},500);wake=()=>{clearTimeout(timer);wake=undefined;resolve();};});continue;}
      // Capture an immutable input before awaiting Python. Ingestion keeps updating the next frame.
      const t=structuredClone(available);
      consumed.set(key(t),t.lastQuoteAt);
      try {
        await observe(t);
        if (state.pending) { fatal = true; stop(); }
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
    stop();
    await Promise.all([ingestionTask,discoveryTask,swapTask]);
    telemetry?.close();
    brain?.close();
    if (!fatal) { status = "stopped"; lastError = null; }
    await publish(true); await flushFeed();
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
    release();
  }
}

void main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
