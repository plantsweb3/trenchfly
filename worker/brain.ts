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
// Decode rule (fixed, one audited place): rateR - rateL >= +2 Hz with a
// DNpe017 spike proposes BUY; <= -2 Hz proposes SELL; otherwise HOLD.

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
  decide(symbol: string, history: number[], price: number): Promise<Decision>;
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
  private proc: ChildProcessWithoutNullStreams;
  private rl: Interface;
  private pending: Array<(line: string) => void> = [];
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
      if (!isReady) {
        try {
          const j = JSON.parse(line);
          if (j.ready) {
            isReady = true;
            readyResolve(j);
            return;
          }
        } catch {
          return; // startup noise
        }
      }
      const next = this.pending.shift();
      if (next) next(line);
    });
    this.proc.on("exit", (code) => {
      readyReject(new Error(`brain exited (${code})`));
    });
    this.proc.stderr.on("data", () => {}); // numpy chatter
  }

  request(obj: unknown, timeoutMs = 60_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("brain timeout")),
        timeoutMs,
      );
      this.pending.push((line) => {
        clearTimeout(timer);
        resolve(line);
      });
      this.proc.stdin.write(JSON.stringify(obj) + "\n");
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
      const info = await Promise.race([
        client.ready,
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("brain boot timeout")), 180_000),
        ),
      ]);
      return {
        tier: 2,
        label: `tier-2 connectome (${info.neurons.toLocaleString()} neurons, ${info.synapses.toLocaleString()} synapses)`,
        async decide(symbol, history, price) {
          const line = await client.request({
            symbol,
            prices: history.slice(-100),
            bid: price * 0.9985,
            ask: price * 1.0015,
            neural_ms: 500,
          });
          const j = JSON.parse(line);
          const d = propose(j.rateL, j.rateR, j.dnpe017_spikes > 0);
          d.frameSha = j.frame_sha256;
          return d;
        },
      };
    } catch (e) {
      console.error(
        `tier-2 boot failed (${(e as Error).message}) — falling back to tier-1 proxy`,
      );
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
