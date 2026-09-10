/** Validate public telemetry before it becomes a status claim or an external link. */
export type Proposal = "BUY" | "SELL" | "HOLD" | "UNKNOWN";
export interface NeuralTrace { neuralMs: number; totalSpikes: number; bins: {tMs:number;rateL:number;rateR:number;gateSpikes:number;totalSpikes:number}[]; populations: {name:string;neurons:number;spikes:number;rateHz:number}[]; mapping:string }
export interface MarketContext { pool:string|null; discoveryTx:string|null; createdAt:number|null; volumeEth5m:number|null; buys5m:number|null; sells5m:number|null; poolWeth:number|null; statsAt:number|null; scanThroughAt:number|null; source:string; coverageCurrent:boolean }
export interface DiscoveryStatus { enabled:boolean; scope:string; cursor:string|null; head:string|null; queued:number|null; active:number|null; lastIngestionAt:string|null; error:string|null; selection:string }
export interface SessionDecision {
  neural?: NeuralTrace | null; inferenceMs?:number|null; signalAgeMs?:number|null; input?:MarketContext|null; pool?:string|null;
  t: string;
  symbol: string;
  proposal: Proposal;
  rateL: number | null;
  rateR: number | null;
  dev: number | null;
  gate: boolean | null;
  frameSha: string | null;
  result: string;
  id: string | null;
  token: string | null;
  priceEth: number | null;
  quoteAt: string | null;
}
export interface SessionMarket { pool?:string|null; context?:MarketContext|null; symbol: string; address: string; status: "checking" | "warming" | "ready" | "no_quote" | "error"; samples: number; lastQuoteAt: string | null; priceEth: number | null }
export interface PublicSession {
  updatedAt: string;
  tier: 1 | 2 | null;
  brainLabel: string;
  obs: number | null;
  watching: string[];
  recent: SessionDecision[];
  mode: "paper" | "live" | null;
  status: "starting" | "warming" | "running" | "degraded" | "stopped" | null;
  runId: string | null;
  lastObservationAt: string | null;
  lastError: string | null;
  markets: SessionMarket[];
  gasIncluded: boolean | null;
  discovery?:DiscoveryStatus|null;
  transport?:string;
}
export interface PublicWallet { address: string | null; balanceEth: number | null }
export interface PublicTransaction {
  hash: string;
  method: string;
  timestamp: string | null;
  success: boolean;
  direction: "in" | "out" | null;
}
export type Tone = "lime" | "amber" | "muted";

const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
const string = (v: unknown, max = 200) => typeof v === "string" ? v.slice(0, max) : "";
const date = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;
export const isAddress = (v: unknown): v is string => typeof v === "string" && /^0x[\da-f]{40}$/i.test(v);
export const isTxHash = (v: unknown): v is string => typeof v === "string" && /^0x[\da-f]{64}$/i.test(v);

const positive = (v:unknown) => {const n=finite(v);return n!==null&&n>=0?n:null;};
function marketContext(v:unknown):MarketContext|null {
  const c=record(v);if(!c)return null;
  return {pool:isAddress(c.pool)?c.pool:null,discoveryTx:isTxHash(c.discoveryTx)?c.discoveryTx:null,createdAt:positive(c.createdAt),volumeEth5m:positive(c.volumeEth5m),buys5m:positive(c.buys5m),sells5m:positive(c.sells5m),poolWeth:positive(c.poolWeth),statsAt:positive(c.statsAt),scanThroughAt:positive(c.scanThroughAt),source:string(c.source,40),coverageCurrent:c.coverageCurrent===true};
}
function neuralTrace(v:unknown):NeuralTrace|null {
  const n=record(v);if(!n||!Array.isArray(n.bins)||!Array.isArray(n.populations)||positive(n.neuralMs)===null||positive(n.totalSpikes)===null)return null;
  const bins=n.bins.slice(0,20).flatMap(value=>{const b=record(value);if(!b||[b.tMs,b.rateL,b.rateR,b.gateSpikes,b.totalSpikes].some(x=>positive(x)===null))return [];return [{tMs:b.tMs as number,rateL:b.rateL as number,rateR:b.rateR as number,gateSpikes:b.gateSpikes as number,totalSpikes:b.totalSpikes as number}];});
  if(!bins.length)return null;
  const populations=n.populations.slice(0,10).flatMap(value=>{const p=record(value);if(!p||[p.neurons,p.spikes,p.rateHz].some(x=>positive(x)===null))return [];return [{name:string(p.name,24),neurons:p.neurons as number,spikes:p.spikes as number,rateHz:p.rateHz as number}];});
  return {neuralMs:n.neuralMs as number,totalSpikes:n.totalSpikes as number,bins,populations,mapping:string(n.mapping,80)};
}
export function normalizeSession(payload: unknown): PublicSession | null {
  const s = record(record(payload)?.session);
  const updatedAt = date(s?.updatedAt);
  if (!s || !updatedAt) return null;
  const recent: SessionDecision[] = [];
  for (const value of Array.isArray(s.recent) ? s.recent.slice(-120) : []) {
    const d = record(value);
    const t = date(d?.t);
    if (!d || !t) continue;
    const proposal = string(d.proposal).toUpperCase();
    recent.push({
      neural:neuralTrace(d.neural),inferenceMs:positive(d.inferenceMs),signalAgeMs:positive(d.signalAgeMs),input:marketContext(d.input),pool:isAddress(d.pool)?d.pool:null,
      t, symbol: string(d.symbol, 24) || "Unreported",
      proposal: ["BUY", "SELL", "HOLD"].includes(proposal) ? proposal as Proposal : "UNKNOWN",
      rateL: finite(d.rateL), rateR: finite(d.rateR), dev: finite(d.dev),
      gate: typeof d.gate === "boolean" ? d.gate : null,
      frameSha: typeof d.frameSha === "string" && /^[\da-f]{64}$/i.test(d.frameSha) ? d.frameSha : null,
      result: string(d.result) || "Result unreported",
      id: string(d.id, 80) || null, token: isAddress(d.token) ? d.token : null, priceEth: finite(d.priceEth), quoteAt: date(d.quoteAt),
    });
  }
  recent.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const obs = finite(s.obs);
  const markets: SessionMarket[] = [];
  for (const value of Array.isArray(s.markets) ? s.markets.slice(0, 40) : []) {
    const market = record(value);
    if (!market || !isAddress(market.address)) continue;
    const state = string(market.status);
    markets.push({ pool:isAddress(market.pool)?market.pool:null,context:marketContext(market.context), symbol: string(market.symbol, 24) || "Unreported", address: market.address, status: ["checking", "warming", "ready", "no_quote", "error"].includes(state) ? state as SessionMarket["status"] : "error", samples: Math.max(0, Math.floor(finite(market.samples) ?? 0)), lastQuoteAt: date(market.lastQuoteAt), priceEth: finite(market.priceEth) });
  }
  const status = string(s.status);
  const accounting = record(s.accounting);
  const discovery=record(s.discovery);
  return {
    updatedAt, tier: s.tier === 1 || s.tier === 2 ? s.tier : null,
    brainLabel: string(s.brainLabel, 80), obs: obs !== null && obs >= 0 ? Math.floor(obs) : null,
    watching: Array.isArray(s.watching) ? s.watching.filter((v): v is string => typeof v === "string").slice(0, 40).map(v => v.slice(0, 24)) : [],
    recent, mode: s.mode === "paper" || s.mode === "live" ? s.mode : null,
    status: ["starting", "warming", "running", "degraded", "stopped"].includes(status) ? status as PublicSession["status"] : null,
    runId: string(s.runId, 80) || null, lastObservationAt: date(s.lastObservationAt), lastError: string(s.lastError, 240) || null,
    discovery:discovery?{enabled:discovery.enabled===true,scope:string(discovery.scope,100),cursor:typeof discovery.cursor==="string"&&/^\d+$/.test(discovery.cursor)?discovery.cursor:null,head:typeof discovery.head==="string"&&/^\d+$/.test(discovery.head)?discovery.head:null,queued:positive(discovery.queued),active:positive(discovery.active),lastIngestionAt:date(discovery.lastIngestionAt),error:string(discovery.error,240)||null,selection:string(discovery.selection,160)}:null,transport:string(record(payload)?.transport,40),
    markets, gasIncluded: typeof accounting?.gasIncluded === "boolean" ? accounting.gasIncluded : null,
  };
}

export function normalizeWallet(payload: unknown): PublicWallet | null {
  const w = record(payload);
  if (!w || !("address" in w)) return null;
  if (w.address === null) return { address: null, balanceEth: null };
  if (!isAddress(w.address)) return null;
  const balance = finite(w.balanceEth);
  return { address: w.address, balanceEth: balance !== null && balance >= 0 ? balance : null };
}

export function normalizeTransactions(payload: unknown): PublicTransaction[] | null {
  const rows = record(payload)?.txs;
  if (!Array.isArray(rows)) return null;
  return rows.slice(0, 25).flatMap(value => {
    const tx = record(value);
    if (!tx || !isTxHash(tx.hash)) return [];
    return [{ hash: tx.hash, method: string(tx.method, 32) || "Transaction", timestamp: date(tx.timestamp), success: tx.success === true, direction: tx.direction === "in" || tx.direction === "out" ? tx.direction : null } satisfies PublicTransaction];
  });
}

export function feedHealth(session: PublicSession | null, now: number, unavailable = false): { label: string; tone: Tone } {
  if (!session) return { label: unavailable ? "Feed unavailable" : "Awaiting session", tone: unavailable ? "amber" : "muted" };
  if (unavailable) return { label: "Feed unavailable", tone: "amber" };
  const age = now - Date.parse(session.updatedAt);
  if (!now || age < -30_000) return { label: "Time unverified", tone: "amber" };
  if (age > 5 * 60_000) return { label: "Feed delayed", tone: "amber" };
  if (session.status === "stopped") return { label: "Worker stopped", tone: "amber" };
  if (session.status === "degraded") return { label: "Worker needs attention", tone: "amber" };
  if (session.status === "starting") return { label: "Starting worker", tone: "muted" };
  if (session.status === "warming") return { label: "Collecting chart points", tone: "muted" };
  if (session.status === "running" && session.lastObservationAt && now - Date.parse(session.lastObservationAt) > 5 * 60_000) return { label: "Decisions delayed", tone: "amber" };
  return { label: "Feed current", tone: "lime" };
}

export function executionState(session: PublicSession | null): { label: string; tone: Tone; detail: string } {
  if (session?.mode === "paper") return { label: "Paper mode reported", tone: "amber", detail: session.gasIncluded === false ? "Real market quotes and worker proposals; simulated fills include pool fees and price impact. Network gas is excluded. No live funds are traded by this session." : "The worker reports paper mode. Fills are simulated, not blockchain transactions." };
  if (session?.mode === "live") return { label: "Live mode reported", tone: "amber", detail: "The worker reports live mode. Inspect each transaction receipt and settlement outcome; a mode label is not proof of a completed trade." };
  const paper = session?.recent.some(d => d.result === "paper fill");
  const live = session?.recent.some(d => receiptHash(d.result));
  if (paper && live) return { label: "Mixed reported results", tone: "amber", detail: "This feed includes paper fills and transaction references. Current execution mode is unreported." };
  if (live) return { label: "Receipts reported", tone: "lime", detail: "The worker has published transaction references. Open each receipt to verify its outcome; current execution mode is unreported." };
  if (paper) return { label: "Paper results", tone: "amber", detail: "The worker has recorded simulated fills. Current execution mode is unreported." };
  return { label: "Execution unreported", tone: "muted", detail: "Current execution mode has not been published. A fresh feed alone does not confirm live trading." };
}

export function receiptHash(result: string): string | null {
  const match = /^live\s+(0x[\da-f]{64})$/i.exec(result.trim());
  return match?.[1] ?? null;
}

export function resultLabel(result: string): string {
  if (receiptHash(result)) return "View receipt";
  if (result === "paper fill") return "Paper fill";
  if (result === "hold") return "No order";
  if (result.toLowerCase().startsWith("rejected")) return "Guard rejected";
  return result;
}

export function relativeTime(dateString: string, now: number): string {
  if (!now) return "Time pending";
  const seconds = Math.floor((now - Date.parse(dateString)) / 1000);
  if (seconds < -30) return "Time unverified";
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function utcTime(value: string): string {
  return new Date(value).toISOString().slice(11, 19);
}
