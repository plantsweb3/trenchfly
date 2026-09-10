import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Mode } from "./state";

const execute = promisify(execFile);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const WT = join(REPO, ".feed-worktree");
const FRAMES = join(REPO, "brain", "runs", "frames");
const INTERVAL = 60_000;

export interface FeedDecision {
  t: string; symbol: string; proposal: string; rateL: number; rateR: number;
  dev: number; gate: boolean; frameSha?: string; result: string;
  token?: string; priceEth?: number; quoteAt?: string; id?: string;
}
export type WorkerStatus = "starting" | "warming" | "running" | "degraded" | "stopped";
export interface FeedMarket {
  symbol: string; address: string; status: "checking" | "warming" | "ready" | "no_quote" | "error";
  samples: number; lastQuoteAt: string | null; priceEth: number | null;
}
export interface FeedPayload {
  schemaVersion: 2; mode: Mode; runId: string; status: WorkerStatus;
  tier: 1 | 2 | null; brainLabel: string; startedAt: string; obs: number;
  watching: string[]; recent: FeedDecision[]; lastObservationAt: string | null;
  markets: FeedMarket[]; lastError: string | null;
  accounting: { kind: "quote_based_paper" | "live_ledger"; gasIncluded: boolean; orders: number };
}

let lastSuccess = 0;
let active: Promise<boolean> | null = null;
let queued: FeedPayload | null = null;
let queuedUrgent = false;

async function git(args: string[], cwd = WT) {
  return execute("git", args, { cwd, timeout: 20_000, maxBuffer: 256 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
}

export function referencedFrames(payload: Pick<FeedPayload, "recent">): Set<string> {
  return new Set(payload.recent.flatMap(d => d.frameSha && /^[a-f\d]{64}$/i.test(d.frameSha) ? [`${d.frameSha}.png`] : []));
}

async function publish(payload: FeedPayload): Promise<boolean> {
  try {
    if (!existsSync(join(WT, ".git"))) {
      await git(["fetch", "origin", "feed"], REPO);
      try { await git(["show-ref", "--verify", "refs/heads/feed"], REPO); }
      catch { await git(["branch", "feed", "origin/feed"], REPO); }
      await git(["worktree", "add", WT, "feed"], REPO);
    }
    const document = { updatedAt: new Date().toISOString(), ...payload };
    const temporary = join(WT, "latest.json.tmp");
    writeFileSync(temporary, JSON.stringify(document));
    renameSync(temporary, join(WT, "latest.json"));
    const framesDir = join(WT, "frames");
    mkdirSync(framesDir, { recursive: true });
    const keep = referencedFrames(payload);
    for (const name of keep) {
      const from = join(FRAMES, name), to = join(framesDir, name);
      if (existsSync(from) && !existsSync(to)) copyFileSync(from, to);
    }
    for (const name of readdirSync(framesDir)) if (/^[a-f\d]{64}\.png$/i.test(name) && !keep.has(name)) unlinkSync(join(framesDir, name));
    // Only telemetry files enter the public feed commit. Never overwrite remote history.
    await git(["add", "--", "latest.json", "frames"]);
    await git(["-c", "user.name=RobinFly worker", "-c", "user.email=worker@robinfly.net", "commit", "--allow-empty", "-m", `feed: ${payload.mode} ${payload.status}, obs ${payload.obs}`]);
    await git(["push", "-q", "origin", "HEAD:feed"]);
    lastSuccess = Date.now();
    return true;
  } catch (error) {
    console.error(`feed: publish failed; history preserved (${(error as Error).message.slice(0, 240)})`);
    return false;
  }
}

/** Serialize asynchronous publishes; keep only the newest pending snapshot. */
export function maybePublish(payload: FeedPayload, urgent = false): Promise<boolean> {
  queued = structuredClone(payload);
  queuedUrgent ||= urgent;
  if (active) return active;
  if (!queuedUrgent && Date.now() - lastSuccess < INTERVAL) return Promise.resolve(false);
  active = (async () => {
    let published = false;
    while (queued && (queuedUrgent || Date.now() - lastSuccess >= INTERVAL)) {
      const next = queued; queued = null; queuedUrgent = false;
      published = await publish(next);
      if (!published) break;
    }
    return published;
  })().finally(() => { active = null; });
  return active;
}

export async function flushFeed(): Promise<void> { await active; }
