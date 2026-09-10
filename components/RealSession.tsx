"use client";

// REAL SESSION — the actual tier-2 worker's decisions, published by the
// worker itself to the repo's public `feed` branch (every update is a
// git commit: tamper-evident). This panel is real data or nothing; it
// never falls back to simulation.

import { useEffect, useState } from "react";

interface FeedDecision {
  t: string;
  symbol: string;
  proposal: string;
  rateL: number;
  rateR: number;
  dev: number;
  gate: boolean;
  frameSha?: string;
  result: string;
}

interface Feed {
  updatedAt: string;
  tier: number;
  brainLabel: string;
  obs: number;
  watching: string[];
  recent: FeedDecision[];
}

const FRAME_BASE =
  "https://raw.githubusercontent.com/plantsweb3/trenchfly/feed/frames";

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return `${Math.round(s)}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export default function RealSession() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/feed")
        .then((r) => r.json())
        .then((j) => alive && setFeed(j.session ?? null))
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    const tickId = setInterval(() => setTick((x) => x + 1), 5_000);
    return () => {
      alive = false;
      clearInterval(id);
      clearInterval(tickId);
    };
  }, []);

  const lastFrame = feed?.recent
    ?.slice()
    .reverse()
    .find((d) => d.frameSha)?.frameSha;
  const decisions = feed?.recent?.slice(-6).reverse() ?? [];
  const stale = feed
    ? Date.now() - new Date(feed.updatedAt).getTime() > 15 * 60_000
    : false;

  return (
    <div className="panel corner">
      <div className="panel-title">
        <strong>REAL SESSION</strong>
        <span>/</span>
        <span>TIER-{feed?.tier ?? 2} · PAPER</span>
      </div>
      {!feed ? (
        <div className="p-3 text-[10px] leading-relaxed text-ink-faint">
          Waiting for the worker&apos;s first feed commit. This panel shows
          the actual connectome session — real data or nothing.
        </div>
      ) : (
        <>
          {lastFrame && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${FRAME_BASE}/${lastFrame}.png`}
              alt="The exact chart frame the connectome last saw"
              className="pixelated block w-full border-b border-line"
            />
          )}
          <div className="flex items-center justify-between px-3 py-1.5 text-[9px] text-ink-dim">
            <span>
              LAST OBS{" "}
              <span style={{ color: stale ? "var(--amber)" : "var(--green)" }}>
                {ago(feed.updatedAt)}
              </span>
            </span>
            <span className="text-ink-faint">OBS {feed.obs}</span>
          </div>
          <div className="divide-y divide-line border-t border-line text-[10px]">
            {decisions.map((d, i) => {
              const c =
                d.proposal === "BUY"
                  ? "var(--green)"
                  : d.proposal === "SELL"
                    ? "var(--red)"
                    : "var(--ink-faint)";
              return (
                <div key={i} className="flex items-center gap-2 px-3 py-1">
                  <span className="w-8 font-bold" style={{ color: c }}>
                    {d.proposal === "HOLD" ? "·" : d.proposal}
                  </span>
                  <span className="text-ink">{d.symbol}</span>
                  <span className="text-ink-faint">
                    L{d.rateL} R{d.rateR}
                  </span>
                  <span className="ml-auto text-ink-dim">
                    {d.dev >= 0 ? "+" : ""}
                    {d.dev}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
      <div className="border-t border-line px-3 py-1.5 text-[9px] leading-snug text-ink-faint">
        Published by the worker to the{" "}
        <a
          href="https://github.com/plantsweb3/trenchfly/commits/feed"
          target="_blank"
          rel="noopener noreferrer"
          className="text-lime underline decoration-lime/40 underline-offset-2 hover:decoration-lime"
        >
          feed branch ↗
        </a>{" "}
        — every update is a commit. Tamper with it and the history shows.
      </div>
    </div>
  );
}
