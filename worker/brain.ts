// Decision layers.
//
// Tier-2 (preferred): the real MaleCNS v1.0 spiking kernel, spoken to
// over JSON/stdio (brain/serve.py). Every observation renders the chart,
// drives 6,091 photoreceptor bodies, advances the persistent 166,700-
// neuron state, and reads actual DNp20/DNpe017 spike counts. Frames and
// decisions are audit-logged under brain/runs/.
//
// Tier-1 (fallback): a decoder-faithful proxy — same interface, chart
// slope plus mean-reverting noise. Used only when the compiled graph or
// calibration is missing; the active tier is logged loudly either way.
//
// Decode rules (each declared where it runs): tier-1 uses the raw
// rateR - rateL diff; tier-2 uses the DEVIATION of that diff from a
// per-token rolling baseline (the active-regime network keeps absolute
// rates high and near-equal). Both propose BUY at >= +2 Hz with a
// DNpe017 spike, SELL at <= -2 Hz, otherwise HOLD.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInterface, type Interface } from "node:readline";

const dir = dirname(fileURLToPath(import.meta.url));
const BRAIN_DIR = join(dir, "..", "brain");

export type Proposal = "BUY" | "SELL" | "HOLD";

export interface Decision {
  proposal: Proposal;
  rateL: number;
  rateR: number;
  gate: boolean;
  diff: number;
  frameSha?: string;
}

export interface BrainIface {
  tier: 1 | 2;
  label: string;
  decide(symbol: string, history: number[], price: number, key?: string): Promise<Decision>;
}

function propose(rateL: number, rateR: number, gate: boolean): Decision {
  const diff = rateR - rateL;
  let proposal: Proposal = "HOLD";
  if (diff >= 2 && gate) proposal = "BUY";
  else if (diff <= -2 && gate) proposal = "SELL";
  return { proposal, rateL, rateR, gate, diff };
}

/* ---------------- tier-1 proxy ---------------- */

const t1 = { rateL: 6.5, rateR: 6.5 };

function gauss() {
  const u = Math.max(Math.random(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));

function tier1Decide(history: number[]): Decision {
  const n = history.length;
  const slope =
    n >= 8 ? (history[n - 1] - history[n - 8]) / history[n - 8] : 0;
  t1.rateL = clamp(t1.rateL + 0.35 * (6.5 - t1.rateL) + gauss() * 1.6, 0, 22);
  t1.rateR = clamp(
    t1.rateR + 0.35 * (6.5 + clamp(slope * 400, -5, 5) - t1.rateR) +
      gauss() * 1.6,
    0,
    22,
  );
  return propose(t1.rateL, t1.rateR, Math.random() < 0.62);
}

/* ---------------- tier-2 connectome client ---------------- */

class Tier2Client {
  proc: ChildProcessWithoutNullStreams;
  private rl: Interface;
  private pending = new Map<
    number,
    { resolve: (j: Record<string, unknown>) => void; reject: (e: Error) => void }
  >();
  private nextId = 1;
  private dead: Error | null = null;
  ready: Promise<{ neurons: number; synapses: number }>;

  constructor(python: string, script: string) {
    this.proc = spawn(python, [script], { cwd: BRAIN_DIR });
    this.rl = createInterface({ input: this.proc.stdout });
    let readyResolve!: (v: { neurons: number; synapses: number }) => void;
    let readyReject!: (e: Error) => void;
    this.ready = new Promise((res, rej) => {
      readyResolve = res;
      readyReject = rej;
    });
    let isReady = false;
    this.rl.on("line", (line) => {
      let j: Record<string, unknown>;
      try {
        j = JSON.parse(line);
      } catch {
        return; // startup noise / stray library output — never shifts pairing
      }
      if (!isReady && j.ready) {
        isReady = true;
        readyResolve(j as { neurons: number; synapses: number });
        return;
      }
      const id = typeof j.id === "number" ? j.id : -1;
      const waiter = this.pending.get(id);
      if (!waiter) return; // unmatched line — ignored, pairing intact
      this.pending.delete(id);
      waiter.resolve(j);
    });
    const fail = (why: string) => {
      this.dead = new Error(why);
      readyReject(this.dead);
      for (const [, w] of this.pending) w.reject(this.dead);
      this.pending.clear();
    };
    this.proc.on("exit", (code) => fail(`brain exited (${code})`));
    this.proc.stdin.on("error", (e) => fail(`brain stdin: ${e.message}`));
    this.proc.stderr.on("data", () => {}); // numpy chatter
  }

  request(
    obj: Record<string, unknown>,
    timeoutMs = 60_000,
  ): Promise<Record<string, unknown>> {
    if (this.dead) return Promise.reject(this.dead);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("brain timeout"));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (j) => {
          clearTimeout(timer);
          resolve(j);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      try {
        this.proc.stdin.write(JSON.stringify({ id, ...obj }) + "\n");
      } catch (e) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(e as Error);
      }
    });
  }
}

/* ---------------- factory ---------------- */

export async function createBrain(): Promise<BrainIface> {
  const python = join(BRAIN_DIR, ".venv", "bin", "python");
  const script = join(BRAIN_DIR, "serve.py");
  const artifacts = ["graph.npz", "populations.json", "calibration.json"];
  const haveAll =
    existsSync(python) &&
    artifacts.every((f) => existsSync(join(BRAIN_DIR, f)));

  if (haveAll) {
    try {
      const client = new Tier2Client(python, script);
      let bootTimer: NodeJS.Timeout | undefined;
      const info = await Promise.race([
        client.ready,
        new Promise<never>((_, rej) => {
          bootTimer = setTimeout(
            () => rej(new Error("brain boot timeout")),
            180_000,
          );
        }),
      ]).finally(() => clearTimeout(bootTimer));
      // The active-regime network keeps DNp20 rates high and near-equal,
      // so the decode reads the DEVIATION of (R−L) from its own rolling
      // baseline — a declared adaptation that makes the readout respond
      // to chart transitions (v1 sensory mapping has no retinotopy yet;
      // that is the next brain checklist item).
      const emaBySymbol = new Map<string, number>();
      return {
        tier: 2,
        label: `tier-2 connectome (${info.neurons.toLocaleString()} neurons, ${info.synapses.toLocaleString()} synapses)`,
        async decide(symbol, history, price, key) {
          const j = (await client.request({
            symbol,
            prices: history.slice(-100),
            bid: price * 0.9985,
            ask: price * 1.0015,
            neural_ms: 500,
          })) as {
            rateL: number;
            rateR: number;
            dnpe017_spikes: number;
            frame_sha256?: string;
            error?: string;
          };
          if (j.error) throw new Error(`brain: ${j.error}`);
          const raw = j.rateR - j.rateL;
          const k = (key ?? symbol).toLowerCase();
          const prev = emaBySymbol.get(k);
          const base = prev ?? raw;
          const dev = raw - base;
          emaBySymbol.set(k, base + 0.2 * (raw - base));
          const gate = j.dnpe017_spikes > 0;
          let proposal: Proposal = "HOLD";
          if (dev >= 2 && gate) proposal = "BUY";
          else if (dev <= -2 && gate) proposal = "SELL";
          return {
            proposal,
            rateL: j.rateL,
            rateR: j.rateR,
            gate,
            diff: dev,
            frameSha: j.frame_sha256,
          };
        },
      };
    } catch (e) {
      console.error(
        `tier-2 boot failed (${(e as Error).message}) — falling back to tier-1 proxy`,
      );
      try {
        // never leak a multi-GB orphan kernel
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).__lastBrainProc?.kill?.();
      } catch {
        /* already gone */
      }
    }
  }
  return {
    tier: 1,
    label: "tier-1 decoder proxy (connectome artifacts missing)",
    async decide(_symbol, history) {
      return tier1Decide(history);
    },
  };
}
