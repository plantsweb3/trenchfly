"use client";

import { useEffect, useRef, useState } from "react";
import {
  COIN_META,
  createSim,
  fmtPrice,
  fmtUsd,
  mulberry32,
  tick,
  TICKERS,
  type SimState,
  type Ticker,
  type Trade,
} from "@/lib/sim";
import NeuralActivity from "./NeuralActivity";
import FlySvg from "./FlySvg";
import WalletPanel from "./WalletPanel";

const OBS_MS = 1800;

export default function Terminal() {
  const [sim, setSim] = useState<SimState | null>(null);
  const rngRef = useRef<() => number>(() => 0.5);
  const seedRef = useRef(0);

  useEffect(() => {
    const seed = (Date.now() ^ 0x5f3759df) >>> 0;
    seedRef.current = seed % 100000;
    rngRef.current = mulberry32(seed);
    setSim(createSim(seed));
    const id = setInterval(() => {
      setSim((s) => (s ? tick(s, rngRef.current) : s));
    }, OBS_MS);
    return () => clearInterval(id);
  }, []);

  if (!sim) {
    return (
      <section id="terminal" className="mx-auto max-w-7xl px-4 py-24">
        <div className="panel corner p-10 text-center text-xs tracking-[0.3em] text-ink-dim">
          BOOTING CONNECTOME · VERIFYING SHA-256 LOCKS · 166,700 NEURONS
          <span className="anim-blink text-lime"> ▮</span>
        </div>
      </section>
    );
  }

  const activity = Math.min((sim.rateL + sim.rateR) / 30, 1);
  const drive =
    sim.pamPulse > 0 ? 0.85 : sim.pplPulse > 0 ? 0.15 : 0.35 + activity * 0.3;

  return (
    <section id="terminal" className="relative mx-auto max-w-7xl px-4 pb-24 pt-10">
      {/* session strip */}
      <div className="panel mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 text-[10px] tracking-[0.18em] text-ink-dim">
        <span className="flex items-center gap-2 text-ink">
          <span className="anim-blink inline-block h-2 w-2 bg-green" />
          LIVE PAPER SESSION
        </span>
        <span>SEED {String(seedRef.current).padStart(5, "0")}</span>
        <span>OBS {sim.obs.toString().padStart(4, "0")}</span>
        <span className="text-lime">
          {(sim.spikesTotal / 1e6).toFixed(2)}M SPIKES
        </span>
        <span>
          ORDERS {sim.dailyOrders}/24
        </span>
        <span>CHAIN 4663</span>
        <span className="ml-auto hidden text-ink-faint sm:block">
          MARKET→NEURAL CLOCK ×33 COMPRESSED
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        {/* ---- left sidebar: CNS + fly ---- */}
        <div className="flex flex-col gap-4">
          <NeuralActivity drive={drive} />

          <div className="panel corner">
            <div className="panel-title">
              <strong>FLY</strong>
              <span>/</span>
              <span>ROBINHOOD INPUT</span>
            </div>
            <div className="bg-inset px-2 pt-2">
              <FlySvg phone className="block w-full" />
            </div>
            <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[10px]">
              <span className="font-bold tracking-[0.2em] text-lime">
                DEPLOY COMPLETE
              </span>
              <span className="text-ink-dim">Fly is onchain</span>
            </div>
          </div>

          <WalletPanel />

          <div className="panel px-3 py-2 text-[10px] leading-relaxed text-ink-dim">
            Dopamine cells wired to unrealized P&amp;L. The fly has no idea any
            of this is happening. Neither did most Pons deployers.
          </div>
        </div>

        {/* ---- main column ---- */}
        <div className="flex flex-col gap-4">
          <FlyEye sim={sim} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Decoder sim={sim} />
            <Dopamine sim={sim} />
          </div>

          <SpikeRaster activity={activity} />

          <Portfolio sim={sim} />
        </div>

        {/* ---- right column: trade log ---- */}
        <TradeLog sim={sim} />
      </div>
    </section>
  );
}

/* ================= what the fly sees ================= */

function FlyEye({ sim }: { sim: SimState }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const coin = sim.coins[sim.active];
    const h = coin.history;

    // Robinhood-flavored light chart at native retina resolution: 320×180.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 320, 180);
    ctx.fillStyle = "#f2f5f2";
    for (let x = 12; x < 310; x += 30) ctx.fillRect(x, 34, 1, 126);
    for (let y = 38; y < 162; y += 24) ctx.fillRect(10, y, 298, 1);

    ctx.fillStyle = "#0c1005";
    ctx.fillRect(0, 0, 320, 28);
    ctx.fillStyle = "#ccf53d";
    ctx.font = "bold 12px monospace";
    ctx.fillText(`${sim.active}/${COIN_META[sim.active].pair}`, 9, 18);
    ctx.fillStyle = "#9aa87e";
    ctx.font = "10px monospace";
    ctx.fillText(`Robinhood Chain · ${COIN_META[sim.active].venue}`, 155, 18);

    const vals = h.slice(-100);
    const lo = Math.min(...vals);
    const span = Math.max(Math.max(...vals) - lo, lo * 0.002);
    const up = vals[vals.length - 1] >= vals[0];
    ctx.strokeStyle = up ? "#00c805" : "#ff5000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = 12 + (i * 294) / (vals.length - 1);
      const y = 153 - ((v - lo) / (span * 1.24)) * 109;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const bid = coin.price * 0.9985;
    const ask = coin.price * 1.0015;
    ctx.fillStyle = "#1c2e22";
    ctx.font = "10px monospace";
    ctx.fillText(
      `BID ${bid.toFixed(COIN_META[sim.active].decimals)}  ASK ${ask.toFixed(COIN_META[sim.active].decimals)}`,
      9,
      173,
    );
  }, [sim]);

  return (
    <div className="panel corner">
      <div className="panel-title">
        <strong>SENSORY INPUT</strong>
        <span>/</span>
        <span>WHAT THE FLY SEES</span>
        <span className="ml-auto normal-case tracking-normal text-ink-faint">
          320×180 RGB → 3,335 R1–R6 · 811 R8
        </span>
      </div>
      <canvas
        ref={ref}
        width={320}
        height={180}
        className="pixelated block w-full"
        style={{ aspectRatio: "16 / 9" }}
      />
      <div className="border-t border-line px-3 py-1.5 text-[9px] text-ink-faint">
        The simulator receives these pixels. Not prices. Not indicators. Pixels.
      </div>
    </div>
  );
}

/* ================= decoder ================= */

function Decoder({ sim }: { sim: SimState }) {
  const diff = sim.rateR - sim.rateL;
  const color =
    sim.proposal === "BUY"
      ? "var(--green)"
      : sim.proposal === "SELL"
        ? "var(--red)"
        : "var(--ink-dim)";
  return (
    <div className="panel corner">
      <div className="panel-title">
        <strong>DECODER</strong>
        <span>/</span>
        <span>DNp20 L−R READOUT</span>
      </div>
      <div className="space-y-2 p-3">
        <RateBar label="DNp20 LEFT" hz={sim.rateL} />
        <RateBar label="DNp20 RIGHT" hz={sim.rateR} />
        <div className="flex items-baseline justify-between pt-1 text-[10px] text-ink-dim">
          <span>
            Δ {diff >= 0 ? "+" : ""}
            {diff.toFixed(2)} Hz · gate DNpe017{" "}
            <span style={{ color: sim.dnpe017 ? "var(--lime)" : "var(--ink-faint)" }}>
              {sim.dnpe017 ? "SPIKED" : "SILENT"}
            </span>
          </span>
        </div>
        <div
          className="border py-2 text-center font-bold tracking-[0.4em]"
          style={{ color, borderColor: "var(--line-bright)", fontSize: 18 }}
        >
          {sim.proposal}
        </div>
        <p className="text-[9px] leading-snug text-ink-faint">
          Δ ≥ +2 Hz with a DNpe017 spike proposes buy. Δ ≤ −2 Hz proposes sell.
          Persistent turning bias becomes persistent buying. This is not market
          insight.
        </p>
      </div>
    </div>
  );
}

function RateBar({ label, hz }: { label: string; hz: number }) {
  return (
    <div>
      <div className="flex justify-between text-[9px] text-ink-dim">
        <span>{label}</span>
        <span className="text-ink">{hz.toFixed(1)} Hz</span>
      </div>
      <div className="mt-0.5 h-2 bg-inset">
        <div
          className="h-full transition-all duration-700"
          style={{
            width: `${Math.min((hz / 22) * 100, 100)}%`,
            background:
              "linear-gradient(to right, var(--lime-dim), var(--lime))",
          }}
        />
      </div>
    </div>
  );
}

/* ================= dopamine ================= */

function Dopamine({ sim }: { sim: SimState }) {
  return (
    <div className="panel corner">
      <div className="panel-title">
        <strong>REINFORCEMENT</strong>
        <span>/</span>
        <span>DOPAMINE</span>
      </div>
      <div className="space-y-3 p-3">
        <CellRow
          label="PAM11 (α1) · profit"
          n={15}
          on={sim.pamPulse > 0}
          color="var(--green)"
        />
        <CellRow
          label="PPL101 (γ1pedc) · loss"
          n={2}
          on={sim.pplPulse > 0}
          color="var(--red)"
        />
        <div className="flex justify-between text-[10px] text-ink-dim">
          <span>ΔEQUITY / OBS</span>
          <span
            style={{
              color:
                sim.lastPnl >= 0.01
                  ? "var(--green)"
                  : sim.lastPnl <= -0.01
                    ? "var(--red)"
                    : "var(--ink-dim)",
            }}
          >
            {sim.lastPnl >= 0 ? "+" : ""}
            {sim.lastPnl.toFixed(3)} USD
          </span>
        </div>
        <p className="text-[9px] leading-snug text-ink-faint">
          ±$0.01 deadband. 200 ms, 20 mV-equivalent pulse. Binary — the fly
          feels a $0.02 candle exactly as hard as a 10× runner. 7,835 KC→MBON
          synapses eligible to change.
        </p>
      </div>
    </div>
  );
}

function CellRow({
  label,
  n,
  on,
  color,
}: {
  label: string;
  n: number;
  on: boolean;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[9px] text-ink-dim">
        <span>{label}</span>
        <span style={{ color: on ? color : "var(--ink-faint)" }}>
          {on ? "PULSING" : "IDLE"}
        </span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: n }).map((_, i) => (
          <span
            key={i}
            className={on ? "anim-blink" : ""}
            style={{
              width: 10,
              height: 10,
              background: on ? color : "var(--bg-inset)",
              border: `1px solid ${on ? color : "var(--line-bright)"}`,
              animationDelay: `${i * 60}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ================= spike raster ================= */

function SpikeRaster({ activity }: { activity: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const actRef = useRef(activity);
  actRef.current = activity;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const W = 640;
    const H = 96;
    canvas.width = W;
    canvas.height = H;
    ctx.fillStyle = "#030402";
    ctx.fillRect(0, 0, W, H);
    // prefill so the raster reads as an ongoing recording, not a blank tape
    for (let x = 0; x < W; x += 2) {
      for (let row = 0; row < 96; row++) {
        if (Math.random() < 0.09) {
          ctx.fillStyle =
            Math.random() < 0.12
              ? "rgba(255,140,58,0.9)"
              : "rgba(204,245,61,0.8)";
          ctx.fillRect(x, row, 2, 1);
        }
      }
    }
    let raf = 0;
    let last = 0;
    const step = (t: number) => {
      if (t - last > 36) {
        last = t;
        ctx.drawImage(canvas, -2, 0);
        ctx.fillStyle = "#030402";
        ctx.fillRect(W - 2, 0, 2, H);
        const density = 0.04 + actRef.current * 0.16;
        for (let row = 0; row < 96; row++) {
          if (Math.random() < density) {
            ctx.fillStyle =
              Math.random() < 0.12
                ? "rgba(255,140,58,0.9)"
                : "rgba(204,245,61,0.8)";
            ctx.fillRect(W - 2, row, 2, 1);
          }
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="panel corner">
      <div className="panel-title">
        <strong>NEURAL REPLAY</strong>
        <span>/</span>
        <span>96-CELL SPIKE RASTER</span>
        <span className="ml-auto normal-case tracking-normal text-ink-faint">
          0.1 ms kernel · 20 ms membrane τ
        </span>
      </div>
      <canvas
        ref={ref}
        className="block h-[96px] w-full"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}

/* ================= portfolio ================= */

function Portfolio({ sim }: { sim: SimState }) {
  const pnl = sim.equity - 100;
  const eq = sim.equityHistory;
  const lo = Math.min(...eq);
  const span = Math.max(Math.max(...eq) - lo, 0.5);
  const pts = eq
    .map(
      (v, i) =>
        `${(i / Math.max(eq.length - 1, 1)) * 100},${34 - ((v - lo) / span) * 30}`,
    )
    .join(" ");

  return (
    <div className="panel corner">
      <div className="panel-title">
        <strong>PORTFOLIO</strong>
        <span>/</span>
        <span>MARKED AT BID</span>
        <span className="ml-auto normal-case tracking-normal text-ink-faint">
          $100 funded · $20 drawdown stop
        </span>
      </div>
      <div className="grid gap-0 sm:grid-cols-[220px_minmax(0,1fr)]">
        <div className="border-b border-line p-3 sm:border-b-0 sm:border-r">
          <div className="text-[9px] tracking-[0.2em] text-ink-dim">EQUITY</div>
          <div
            className="text-2xl font-semibold"
            style={{ color: pnl >= 0 ? "var(--green)" : "var(--red)" }}
          >
            {fmtUsd(sim.equity)}
          </div>
          <div
            className="text-[11px]"
            style={{ color: pnl >= 0 ? "var(--green)" : "var(--red)" }}
          >
            {pnl >= 0 ? "▲" : "▼"} {fmtUsd(Math.abs(pnl))} all time
          </div>
          <svg viewBox="0 0 100 36" className="mt-2 w-full">
            <polyline
              points={pts}
              fill="none"
              stroke={pnl >= 0 ? "var(--green)" : "var(--red)"}
              strokeWidth="1.2"
            />
          </svg>
          <div className="mt-1 text-[10px] text-ink-dim">
            CASH <span className="text-ink">{fmtUsd(sim.cash)}</span>
          </div>
        </div>
        <div className="divide-y divide-line text-[11px]">
          {TICKERS.map((t) => (
            <HoldingRow key={t} sim={sim} ticker={t} />
          ))}
        </div>
      </div>
    </div>
  );
}

function HoldingRow({ sim, ticker }: { sim: SimState; ticker: Ticker }) {
  const qty = sim.holdings[ticker];
  const value = qty * sim.coins[ticker].price;
  const h = sim.coins[ticker].history;
  const chg = (h[h.length - 1] / h[h.length - 21] - 1) * 100;
  const active = sim.active === ticker;
  return (
    <div
      className="flex items-center gap-3 px-3 py-1.5"
      style={{ background: active ? "rgba(204,245,61,0.05)" : undefined }}
    >
      <span className="w-[4.6rem] font-semibold text-ink">
        {ticker}
        {active && <span className="anim-blink text-lime"> ◂</span>}
      </span>
      <span className="w-20 text-ink-dim">{fmtPrice(ticker, sim.coins[ticker].price)}</span>
      <span
        className="w-14 text-right"
        style={{ color: chg >= 0 ? "var(--green)" : "var(--red)" }}
      >
        {chg >= 0 ? "+" : ""}
        {chg.toFixed(1)}%
      </span>
      <span className="ml-auto text-right text-ink-dim">
        {qty > 0 ? (
          <>
            {qty >= 1000
              ? Math.round(qty).toLocaleString()
              : qty.toFixed(3)}{" "}
            · <span className="text-ink">{fmtUsd(value)}</span>
          </>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </span>
    </div>
  );
}

/* ================= trade log ================= */

function TradeLog({ sim }: { sim: SimState }) {
  const rows = [...sim.trades].reverse();
  return (
    <div className="panel corner flex min-h-[420px] flex-col lg:max-h-[840px]">
      <div className="panel-title">
        <strong>TRADE LOG</strong>
        <span>/</span>
        <span>ORDERS</span>
        <span className="ml-auto normal-case tracking-normal text-ink-faint">
          $10 max
        </span>
      </div>
      <div className="flex-1 divide-y divide-line overflow-y-auto">
        {rows.length === 0 && (
          <div className="p-4 text-[10px] leading-relaxed text-ink-faint">
            No orders yet. The fly is watching the chart.
            <span className="anim-blink text-lime"> ▮</span>
          </div>
        )}
        {rows.map((tr) => (
          <TradeRow key={tr.id} tr={tr} />
        ))}
      </div>
      <div className="border-t border-line px-3 py-2 text-[9px] leading-snug text-ink-faint">
        Every order originates as motor-neuron spikes. The guard can reject an
        order; it cannot invent a better one.
      </div>
    </div>
  );
}

function TradeRow({ tr }: { tr: Trade }) {
  const rejected = tr.rejected !== null;
  const color = rejected
    ? "var(--amber)"
    : tr.side === "BUY"
      ? "var(--green)"
      : "var(--red)";
  return (
    <div className="px-3 py-2 text-[11px]">
      <div className="flex items-center gap-2">
        <span
          className="border px-1.5 py-0.5 text-[9px] font-bold tracking-widest"
          style={{ color, borderColor: color }}
        >
          {rejected ? "REJ" : tr.side}
        </span>
        <span className="font-semibold text-ink">{tr.ticker}</span>
        {!rejected && <span className="text-ink-dim">{fmtUsd(tr.usd)}</span>}
        <span className="ml-auto text-[9px] text-ink-faint">
          OBS {tr.obs.toString().padStart(4, "0")}
        </span>
      </div>
      {rejected ? (
        <div className="mt-1 text-[9px] text-amber/80">guard: {tr.rejected}</div>
      ) : (
        <div className="mt-1 text-[9px] text-ink-faint">
          {tr.qty >= 1000
            ? Math.round(tr.qty).toLocaleString()
            : tr.qty.toFixed(4)}{" "}
          {tr.ticker} @ {fmtPrice(tr.ticker, tr.price)} ·{" "}
          {COIN_META[tr.ticker].venue} · filled
        </div>
      )}
    </div>
  );
}
