import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Mode = "paper" | "live";
export interface Ledger {
  version: 1;
  mode: Mode;
  account: string | null;
  paperEth: number;
  holdings: Record<string, number>;
  tokens: Record<string, { symbol: string; decimals: number; fee: number }>;
  buyTotalEth: number;
  sellTotalEth: number;
  gasEth: number;
  ordersTotal: number;
  lastOrderAt: number;
  pending: { id: string; token: string; side: "BUY" | "SELL"; createdAt: string; hash?: string } | null;
}
const address = /^0x[\da-f]{40}$/i;
const nonnegative = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

export function initialLedger(mode: Mode, capitalEth: number, account: string | null): Ledger {
  return { version: 1, mode, account: account?.toLowerCase() ?? null, paperEth: capitalEth, holdings: {}, tokens: {}, buyTotalEth: 0, sellTotalEth: 0, gasEth: 0, ordersTotal: 0, lastOrderAt: 0, pending: null };
}

export function validateLedger(value: unknown, mode: Mode, account: string | null): Ledger {
  const v = value as Ledger;
  if (!v || v.version !== 1 || v.mode !== mode || v.account !== (account?.toLowerCase() ?? null)) throw new Error("Ledger mode or wallet mismatch; reconcile the saved state before continuing.");
  for (const key of ["paperEth", "buyTotalEth", "sellTotalEth", "gasEth", "ordersTotal", "lastOrderAt"] as const) if (!nonnegative(v[key])) throw new Error(`Invalid ledger field: ${key}`);
  if (!Number.isSafeInteger(v.ordersTotal) || !v.holdings || Array.isArray(v.holdings) || typeof v.holdings !== "object") throw new Error("Invalid holdings ledger");
  for (const [token, qty] of Object.entries(v.holdings)) if (!address.test(token) || !nonnegative(qty)) throw new Error("Invalid saved holding");
  if (!v.tokens || typeof v.tokens !== "object" || Array.isArray(v.tokens)) throw new Error("Missing token metadata");
  for (const [token, meta] of Object.entries(v.tokens)) if (!address.test(token) || !meta || typeof meta.symbol !== "string" || !Number.isInteger(meta.decimals) || meta.decimals < 0 || meta.decimals > 36 || !Number.isSafeInteger(meta.fee) || meta.fee < 0) throw new Error("Invalid saved token metadata");
  if (v.pending !== null && (!v.pending || typeof v.pending !== "object" || typeof v.pending.id !== "string" || !address.test(v.pending.token) || !["BUY", "SELL"].includes(v.pending.side) || !Number.isFinite(Date.parse(v.pending.createdAt)))) throw new Error("Invalid pending execution record");
  return v;
}

export function loadLedger(directory: string, mode: Mode, capitalEth: number, account: string | null): Ledger {
  const path = join(directory, `${mode}-state.json`);
  if (!existsSync(path)) {
    if (mode === "live" && existsSync(join(directory, "state.json"))) throw new Error("Legacy mixed-mode state exists. Reconcile it before creating a live ledger.");
    return initialLedger(mode, capitalEth, account);
  }
  // A corrupt ledger is an error, never an invitation to reset loss/cash limits.
  return validateLedger(JSON.parse(readFileSync(path, "utf8")), mode, account);
}

export function saveLedger(directory: string, state: Ledger): void {
  validateLedger(state, state.mode, state.account);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${state.mode}-state.json`);
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  renameSync(temporary, path);
}

/** One worker across both modes. Never evict a process that is still alive. */
export function acquireWorkerLock(directory: string): () => void {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "worker.lock");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, "wx", 0o600);
      try { writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); } finally { closeSync(fd); }
      return () => {
        if (existsSync(path) && JSON.parse(readFileSync(path, "utf8")).pid === process.pid) unlinkSync(path);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const owner = JSON.parse(readFileSync(path, "utf8"));
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error("Worker lock is invalid; inspect it before recovery.");
      try { process.kill(owner.pid, 0); } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ESRCH") { unlinkSync(path); continue; }
        throw new Error("Cannot verify the existing worker lock owner.");
      }
      throw new Error(`Another worker is running (PID ${owner.pid}).`);
    }
  }
  throw new Error("Could not acquire the worker lock.");
}
