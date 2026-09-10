// Publishes the worker's real session state to the repo's `feed` branch:
// latest.json + the exact frame PNGs the connectome saw. Because every
// update is a git commit, the feed is a public, tamper-evident log —
// rewriting it would be visible to anyone who cloned.
//
// Throttled: publishes at most every PUBLISH_MS, or immediately on a fill.

import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const REPO = join(dir, "..");
const WT = join(REPO, ".feed-worktree");
const FRAMES_SRC = join(REPO, "brain", "runs", "frames");
const PUBLISH_MS = 150_000;

export interface FeedDecision {
  t: string;
  symbol: string;
  proposal: string;
  rateL: number;
  rateR: number;
  dev: number;
  gate: boolean;
  frameSha?: string;
  result: string; // "hold" | "paper fill" | "live <txhash>" | "rejected: ..."
}

let lastPublish = 0;
let ready = false;

function git(cmd: string) {
  execSync(cmd, { stdio: "pipe" });
}

function ensureWorktree(): boolean {
  if (ready) return true;
  try {
    if (!existsSync(join(WT, ".git"))) {
      try {
        git(`git -C "${REPO}" branch feed origin/feed`);
      } catch {
        try {
          git(`git -C "${REPO}" branch feed`);
        } catch {
          /* branch exists */
        }
      }
      git(`git -C "${REPO}" worktree add "${WT}" feed`);
    }
    ready = true;
    return true;
  } catch (e) {
    console.error(`feed: worktree setup failed — ${(e as Error).message}`);
    return false;
  }
}

export function maybePublish(
  payload: {
    tier: number;
    brainLabel: string;
    startedAt: string;
    obs: number;
    watching: string[];
    recent: FeedDecision[];
  },
  urgent = false,
): void {
  const now = Date.now();
  if (!urgent && now - lastPublish < PUBLISH_MS) return;
  if (!ensureWorktree()) return;
  lastPublish = now;
  try {
    writeFileSync(
      join(WT, "latest.json"),
      JSON.stringify({ updatedAt: new Date().toISOString(), ...payload }),
    );
    const framesDir = join(WT, "frames");
    mkdirSync(framesDir, { recursive: true });
    for (const d of payload.recent.slice(-12)) {
      if (!d.frameSha) continue;
      const src = join(FRAMES_SRC, `${d.frameSha}.png`);
      const dst = join(framesDir, `${d.frameSha}.png`);
      if (existsSync(src) && !existsSync(dst)) copyFileSync(src, dst);
    }
    git(`git -C "${WT}" add -A`);
    git(
      `git -C "${WT}" -c user.name="trenchfly worker" -c user.email="fly@trenchfly.xyz" ` +
        `commit -m "feed: obs ${payload.obs}" --allow-empty`,
    );
    git(`git -C "${WT}" push -q origin feed`);
  } catch (e) {
    console.error(`feed: publish failed — ${(e as Error).message}`);
  }
}
