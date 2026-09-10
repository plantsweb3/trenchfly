/** Validate public telemetry before it becomes a status claim or an external link. */
export type Proposal = "BUY" | "SELL" | "HOLD" | "UNKNOWN";
export interface SessionDecision {
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
export interface SessionMarket { symbol: string; address: string; status: "checking" | "warming" | "ready" | "no_quote" | "error"; samples: number; lastQuoteAt: string | null; priceEth: number | null }
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
    markets.push({ symbol: string(market.symbol, 24) || "Unreported", address: market.address, status: ["checking", "warming", "ready", "no_quote", "error"].includes(state) ? state as SessionMarket["status"] : "error", samples: Math.max(0, Math.floor(finite(market.samples) ?? 0)), lastQuoteAt: date(market.lastQuoteAt), priceEth: finite(market.priceEth) });
  }
  const status = string(s.status);
  const accounting = record(s.accounting);
  return {
    updatedAt, tier: s.tier === 1 || s.tier === 2 ? s.tier : null,
    brainLabel: string(s.brainLabel, 80), obs: obs !== null && obs >= 0 ? Math.floor(obs) : null,
    watching: Array.isArray(s.watching) ? s.watching.filter((v): v is string => typeof v === "string").slice(0, 40).map(v => v.slice(0, 24)) : [],
    recent, mode: s.mode === "paper" || s.mode === "live" ? s.mode : null,
    status: ["starting", "warming", "running", "degraded", "stopped"].includes(status) ? status as PublicSession["status"] : null,
    runId: string(s.runId, 80) || null, lastObservationAt: date(s.lastObservationAt), lastError: string(s.lastError, 240) || null,
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
