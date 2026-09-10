"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { canAutoPlay, decisionIdentity, decisionOutcome, rateIntensity } from "@/lib/session-playback";
import { utcTime, type PublicSession, type SessionDecision } from "@/lib/session-state";
import TradingDesk from "./TradingDesk";
import s from "./trading-theater.module.css";

// A deliberately schematic network. Positions are fixed; brightness is driven only
// by the published L/R summary rates. These are not individual neuron recordings.
const nodes = Array.from({ length: 48 }, (_, i) => {
  const side = i < 24 ? 0 : 1;
  const n = i % 24;
  const angle = n * 2.399963;
  const radius = Math.sqrt((n + .5) / 24);
  return { x: (side ? 224 : 116) + Math.cos(angle) * 80 * radius, y: 104 + Math.sin(angle) * 76 * radius, side, delay: (n % 6) * .09 };
});
const edges = nodes.flatMap((a, i) => nodes.slice(i + 1).flatMap((b, offset) => Math.hypot(a.x - b.x, a.y - b.y) < 54 ? [{ a: i, b: i + offset + 1 }] : []));

function NeuralWindow({ decision, tier, active, pulse }: { decision?: SessionDecision; tier: PublicSession["tier"]; active: boolean; pulse: number }) {
  const hasRates = decision?.rateL !== null && decision?.rateL !== undefined && decision.rateL >= 0 && decision?.rateR !== null && decision?.rateR !== undefined && decision.rateR >= 0;
  const left = rateIntensity(decision?.rateL), right = rateIntensity(decision?.rateR);
  return <div className={s.neuralWindow}>
    <div className={s.windowBar}><span>NEURAL ACTIVITY</span><span>{tier === 2 ? "CONNECTOME" : tier === 1 ? "PROXY" : "UNREPORTED"}</span></div>
    <svg key={pulse} className={`${s.network} ${active && hasRates ? s.firing : ""}`} viewBox="0 0 340 208" role="img" aria-label={hasRates ? `Schematic motor activity: left ${decision!.rateL!.toFixed(1)} hertz, right ${decision!.rateR!.toFixed(1)} hertz. Not a map of individual neuron activity.` : "Neural activity unavailable; no recorded motor rates"}>
      <g className={s.edges}>{edges.map(({ a, b }) => <line key={`${a}-${b}`} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} opacity={hasRates ? .13 + (nodes[a].side ? right : left) * .45 : .1} />)}</g>
      {nodes.map((node, i) => <circle key={i} cx={node.x} cy={node.y} r={i % 7 === 0 ? 3.4 : 2} className={s.neuron} fill={node.side ? "#93d5f7" : "#d7ff3f"} style={{ opacity: hasRates ? .18 + (node.side ? right : left) * .82 : .12, "--pulse-delay": `${node.delay}s` } as CSSProperties} />)}
      <text x="58" y="195">LEFT OUTPUT</text><text x="211" y="195">RIGHT OUTPUT</text>
    </svg>
    <div className={s.rates}><div><span>LEFT MOTOR</span><strong>{hasRates ? decision!.rateL!.toFixed(1) : "—"}<small>Hz</small></strong><div className={s.rateTrack}><i style={{ width: `${left * 100}%` }} /></div></div><div><span>RIGHT MOTOR</span><strong>{hasRates ? decision!.rateR!.toFixed(1) : "—"}<small>Hz</small></strong><div className={s.rateTrack}><i style={{ width: `${right * 100}%` }} /></div></div></div>
    <p className={s.neuralNote}>Summary visualization from recorded motor rates. Dots and connections are illustrative, not individual neuron measurements. Scale: 0–400 Hz.</p>
  </div>;
}

export default function TradingTheater({ feed, decision, now, historical, unavailable, chart, children }: {
  feed: PublicSession | null; decision?: SessionDecision; now: number; historical: boolean; unavailable: boolean; chart: ReactNode; children: ReactNode;
}) {
  const [playback, setPlayback] = useState({ key: "", pulse: 0, source: "replay" });
  const [phase, setPhase] = useState(0);
  const seen = useRef(new Set<string>());
  const identity = decisionIdentity(decision);
  const auto = canAutoPlay(feed, decision, now, historical, unavailable);
  const outcome = decisionOutcome(decision);
  const active = playback.key === identity && phase > 0 && phase < 4;
  const isAction = decision?.proposal === "BUY" || decision?.proposal === "SELL";

  useEffect(() => {
    if (!auto || seen.current.has(identity)) return;
    // Only a new, fresh observation triggers one playback. A heartbeat does not.
    const timer = setTimeout(() => { seen.current.add(identity); setPlayback(previous => ({ key: identity, pulse: previous.pulse + 1, source: "new" })); }, 0);
    return () => clearTimeout(timer);
  }, [auto, identity]);

  useEffect(() => {
    if (playback.key !== identity || !playback.pulse) return;
    const timers = [setTimeout(() => setPhase(1), 0), setTimeout(() => setPhase(2), 1200), setTimeout(() => setPhase(3), 2500), setTimeout(() => setPhase(4), 5200)];
    return () => timers.forEach(clearTimeout);
  }, [playback, identity]);

  const replay = () => { setPhase(0); setPlayback(previous => ({ key: identity, pulse: previous.pulse + 1, source: "replay" })); };
  const stageLabel = active ? playback.source === "new" ? "NEW OBSERVATION · PLAYBACK" : "REPLAYING RECORDED DECISION" : !decision ? "WAITING FOR INPUT" : "RECORDED OBSERVATION";
  const actionPhase = active && phase >= 2;
  const side = decision?.proposal === "BUY" ? "buy" : decision?.proposal === "SELL" ? "sell" : "hold";
  const reason = decision?.result.startsWith("rejected:") ? decision.result.slice(9).trim() : null;
  return <div className={s.theater}>
    <div className={s.theaterBar}><span><i />ROBINFLY / TRADING DESK</span><span className={s.mode}>{feed?.mode === "paper" ? "PAPER SESSION · NO REAL ORDERS" : feed?.mode === "live" ? "LIVE MODE REPORTED" : "EXECUTION UNREPORTED"}</span></div>
    <div className={s.theaterGrid}>
      <div className={s.arena}>
        <div className={s.playbackBar}><span>{stageLabel}</span><button onClick={replay} disabled={!decision || active} aria-label="Replay this recorded decision">{active ? "Playing…" : "Replay decision"}<span aria-hidden="true">↻</span></button></div>
        <div className={s.marketLabel}><div><span>CHART ON HIS MONITOR</span><strong>{decision?.symbol ?? "Awaiting market"}<small>/ ETH</small></strong></div><div><span>{decision ? `${utcTime(decision.t)} UTC` : "NO OBSERVATION"}</span><strong>{decision?.priceEth && decision.priceEth > 0 ? decision.priceEth.toPrecision(4) : "—"}</strong></div></div>
        <div className={s.deskPosition}>
          <TradingDesk frameSha={decision?.frameSha ?? null} reaction={actionPhase && isAction ? decision!.proposal as "BUY" | "SELL" : null} reactionKey={`${identity}-${playback.pulse}`} motion={active} pressed={active && phase === 3 && outcome.pressed && isAction ? decision!.proposal as "BUY" | "SELL" : null} />
        </div>
        <div className={s.controls} aria-label="Fly decision indicators, not visitor trading controls">
          {(["BUY", "SELL"] as const).map(action => {
            const selected = decision?.proposal === action;
            const pressed = selected && active && phase === 3 && outcome.pressed;
            return <div key={action} className={`${s.tradeButton} ${action === "BUY" ? s.buyButton : s.sellButton} ${selected ? s.selectedButton : ""} ${selected && actionPhase ? s.proposing : ""} ${pressed ? s.pressedButton : ""} ${selected && outcome.kind === "rejected" ? s.blockedButton : ""}`} aria-label={`${action}: ${selected ? outcome.label : "not selected"}`}><span>{action}</span><small>{selected ? outcome.kind === "rejected" ? "BLOCKED" : outcome.kind === "paper" ? "PAPER FILL" : outcome.kind === "receipt" ? "RECEIPT LINKED" : "PROPOSED" : "NOT SELECTED"}</small></div>;
          })}
        </div>
        <div className={s.arenaCaption}><span>SUBJECT RF—01</span><span>{decision?.proposal === "HOLD" ? "HOLDING · NO BUTTON PRESSED" : "DECISIONS DRIVE THE ANIMATION"}</span></div>
      </div>
      <aside className={s.telemetry} aria-label="Neural activity and decision outcome">
        <NeuralWindow decision={decision} tier={feed?.tier ?? null} active={active && phase >= 2} pulse={playback.pulse} />
        <div className={s.sequence} aria-label="Recorded decision sequence">{["SEE CHART", "BRAIN RESPONSE", "OUTCOME"].map((label, i) => <span key={label} className={active && phase === i + 1 ? s.currentStep : ""}><i>{String(i + 1).padStart(2, "0")}</i>{label}</span>)}</div>
        <div className={s.outcome} aria-live="polite"><span>{historical ? "SELECTED DECISION" : "LATEST DECISION"}</span><strong className={side === "buy" ? s.buyText : side === "sell" ? s.sellText : ""}>{decision?.proposal ?? "WAITING"}<small>{decision?.symbol}</small></strong><p>{outcome.label}</p>{reason && <p className={s.reason}>{reason}</p>}</div>
        {children}
      </aside>
    </div>
    <details className={s.sourceChart}><summary>Inspect the exact chart input <span>{decision?.symbol ?? "Awaiting frame"} · {decision ? `${utcTime(decision.t)} UTC` : "Unreported"}</span></summary><div>{chart}</div></details>
    <div className={s.theaterFooter}><span>Animation replays a published observation. It does not place orders.</span><span>{decision?.frameSha ? `INPUT ${decision.frameSha.slice(0, 12)}…` : "CHART SOURCE PENDING"}</span></div>
  </div>;
}
