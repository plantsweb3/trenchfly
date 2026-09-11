"use client";
import MarketRadar from "./MarketRadar";
import { SOCIAL_HANDLE, SOCIAL_URL } from "@/lib/site";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ROBINHOOD_CHAIN } from "@/lib/chain";
import {
  executionState, feedHealth, normalizeSession, normalizeTransactions, normalizeWallet,
  receiptHash, relativeTime, resultLabel, utcTime,
  type PublicSession, type SessionDecision, type Tone,
} from "@/lib/session-state";
import FlyMascot from "./FlyMascot";
import TradingTheater from "./TradingTheater";
import s from "./launch.module.css";

const REPO = "https://github.com/plantsweb3/trenchfly";
const HISTORY = `${REPO}/commits/feed`;
const FEED = "https://raw.githubusercontent.com/plantsweb3/trenchfly/feed/latest.json";
const EXPLORER = ROBINHOOD_CHAIN.explorer;

interface Resource<T> { data: T | null; status: "loading" | "ready" | "unavailable"; checkedAt: number | null }

/** Independent requests retain the last good snapshot when a service is unavailable. */
function usePublicResource<T>(url: string, normalize: (value: unknown) => T | null) {
  const [state, setState] = useState<Resource<T>>({ data: null, status: "loading", checkedAt: null });
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey(key => key + 1), []);
  useEffect(() => {
    let alive = true;
    let busy = false;
    let active: AbortController | null = null;
    async function load() {
      if (busy || document.hidden) return;
      busy = true;
      const controller = new AbortController();
      active = controller;
      const timeout = window.setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Unavailable");
        const data = normalize(await response.json());
        if (data === null) throw new Error("No valid snapshot");
        if (alive) setState({ data, status: "ready", checkedAt: Date.now() });
      } catch {
        if (alive) setState(previous => ({ ...previous, status: "unavailable", checkedAt: Date.now() }));
      } finally {
        clearTimeout(timeout);
        busy = false;
      }
    }
    void load();
    const interval = setInterval(load, url === "/api/feed" ? 3_000 : 30_000);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; active?.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [url, normalize, refreshKey]);
  return { ...state, refresh };
}

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d={diagonal ? "M5 19 19 5M5 5h14v14" : "M4 12h15m-6-6 6 6-6 6"} /></svg>;
}

function Mark() {
  return <svg aria-hidden="true" width="35" height="35" viewBox="0 0 40 40" fill="none"><path d="M18 20 4 8l2 16 11 3m5-7L36 8l-2 16-11 3" fill="currentColor" /><path d="m20 17-4 9 4 10 4-10-4-9Z" fill="currentColor" /><circle cx="16.5" cy="12" r="3.5" fill="#ff655d" /><circle cx="23.5" cy="12" r="3.5" fill="#ff655d" /></svg>;
}

function External({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}<Arrow diagonal /></a>;
}

function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`${s.badge} ${s[tone]}`}><span className={s.dot} aria-hidden="true" />{children}</span>;
}

function ChartFrame({ decision }: { decision?: SessionDecision }) {
  const [failed, setFailed] = useState(false);
  if (!decision?.frameSha || failed) return (
    <div className={s.frameEmpty}>
      <svg aria-hidden="true" viewBox="0 0 64 64" width="52" height="52" fill="none" stroke="currentColor"><path d="M8 24V8h16m16 0h16v16M8 40v16h16m16 0h16V40M24 32h16m-8-8v16" strokeWidth="1.4" /></svg>
      <strong>{failed ? "Frame unavailable" : "Waiting for a published frame"}</strong>
      <p>{failed ? "The decision is recorded below. Check the public feed for its source image." : "The chart the fly saw will appear here when the worker publishes it."}</p>
    </div>
  );
  return <a className={s.frameImageLink} href={`/api/frames/${decision.frameSha}`} target="_blank" rel="noopener noreferrer" aria-label={`Open source frame for ${decision.symbol}, ${utcTime(decision.t)} UTC`}>
    <Image unoptimized src={`/api/frames/${decision.frameSha}`} alt={`Published chart frame used for the ${decision.symbol} ${decision.proposal.toLowerCase()} proposal at ${utcTime(decision.t)} UTC`} width={640} height={360} className={s.frameImage} onError={() => setFailed(true)} />
    <span className={s.frameOverlay}>Open source frame <Arrow diagonal /></span>
  </a>;
}

function SessionPanel({ resource, now }: { resource: Resource<PublicSession> & { refresh: () => void }; now: number }) {
  const feed = resource.data;
  const health = feedHealth(feed, now, resource.status === "unavailable");
  const execution = executionState(feed);
  const [filter, setFilter] = useState<"all" | "fills" | "rejected">("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const decisionKey = (d: SessionDecision) => d.id ?? `${d.t}-${d.symbol}`;
  const selected = feed?.recent.find(d => decisionKey(d) === selectedKey);
  const latest = selected ?? feed?.recent.at(-1);
  const lastFrame = latest?.frameSha ? latest : undefined;
  const decisions = (feed?.recent ?? []).filter(d => filter === "all" || (filter === "fills" ? d.result === "paper fill" || !!receiptHash(d.result) : d.result.startsWith("rejected"))).slice(-8).reverse();
  const quotedMarkets = feed?.markets.filter(m => ["warming", "ready"].includes(m.status) && m.lastQuoteAt && now - Date.parse(m.lastQuoteAt) >= 0 && now - Date.parse(m.lastQuoteAt) < 300_000).length ?? 0;
  const [retrying, setRetrying] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);
  function retry() {
    resource.refresh(); setRetrying(true);
    retryTimer.current = setTimeout(() => setRetrying(false), 1500);
  }
  return (
    <section id="session" className={s.sessionSection} aria-labelledby="session-title">
      <div className={s.sectionHeading}>
        <div><span className={s.eyebrow}>01 / THE PUBLIC SESSION</span><h2 id="session-title">Watch him work.</h2></div>
        <p>His chart. His brain response. His next move.<br />Watch each decision reach the desk.</p>
      </div>
      <div className={s.console}>
        <div className={s.consoleBar}>
          <div className={s.consoleStatus} aria-live="polite"><Badge tone={resource.status === "loading" ? "muted" : health.tone}>{resource.status === "loading" ? "Checking feed" : health.label}</Badge><span className={s.divider} /><span className={s.smallMono}>{feed ? `Updated ${relativeTime(feed.updatedAt, now)}` : "No published snapshot loaded"}</span></div>
          <button className={s.refreshButton} onClick={retry} disabled={retrying} aria-label="Refresh public session">{retrying ? "Checking…" : "Refresh"}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M20 8a8 8 0 1 0 .5 7M20 3v6h-6" /></svg></button>
        </div>
        {feed && health.tone === "amber" && <p className={s.staleNotice}>{resource.status === "unavailable" ? "The feed could not be refreshed. Showing the last successfully loaded snapshot." : health.label === "Time unverified" ? "The feed timestamp could not be verified. Treat this snapshot as historical." : feed.status === "stopped" ? feed.lastError ?? "The worker reports a clean stop. This record is available for inspection." : feed.lastError ?? (health.label === "Decisions delayed" ? "The worker is reachable, but no recent decision has been published." : "The worker has not published a recent update. This is the last available snapshot.")}</p>}
        {feed?.status && <div className={s.runStrip}>
          <div><span>Execution</span><strong className={s.amber}>{feed.mode === "paper" ? "PAPER" : feed.mode === "live" ? "LIVE REPORTED" : "UNREPORTED"}</strong></div>
          <div><span>Market quotes</span><strong>{quotedMarkets} / {feed.markets.length} available</strong></div>
          <div><span>Last decision</span><strong>{feed.lastObservationAt ? relativeTime(feed.lastObservationAt, now) : "Warming up"}</strong></div>
          <div><span>Run</span><strong title={feed.runId ?? undefined}>{feed.runId?.slice(0, 8) ?? "Unreported"}</strong></div>
        </div>}
        {feed?.markets && feed.markets.length > 0 && <details className={s.marketDetails}><summary>Market coverage <span>{quotedMarkets} quoting · {feed.markets.length - quotedMarkets} waiting or unavailable</span></summary><ul>{feed.markets.map(m => <li key={m.address}><External href={`${EXPLORER}/token/${m.address}`}><strong>{m.symbol}</strong></External><span>{m.lastQuoteAt && now - Date.parse(m.lastQuoteAt) >= 300_000 ? "Last quote is stale" : m.status === "ready" ? "Receiving chart data" : m.status === "warming" ? `${m.samples} chart points collected` : m.status === "no_quote" ? "No usable v3 quote" : m.status === "error" ? "Observation unavailable" : "Checking route"}</span><code>{m.address.slice(0, 6)}…{m.address.slice(-4)}</code></li>)}</ul></details>}
        <TradingTheater feed={feed} decision={latest} now={now} historical={!!selected} unavailable={resource.status === "unavailable"} chart={<ChartFrame key={lastFrame?.frameSha ?? "empty"} decision={lastFrame} />}>
          <div className={s.deskInspector}>
            <div className={s.inspectorLabel}>{selected ? <button onClick={() => setSelectedKey(null)}>Back to latest observation</button> : <span className={s.eyebrow}>PUBLISHED EVIDENCE</span>}{latest && receiptHash(latest.result) && <External href={`${EXPLORER}/tx/${receiptHash(latest.result)}`} className={s.textLink}>Receipt</External>}</div>
            <dl className={s.neuralReadout}>
              <div><dt>Baseline deviation</dt><dd>{latest?.dev !== null && latest?.dev !== undefined ? `${latest.dev >= 0 ? "+" : ""}${latest.dev.toFixed(2)} Hz` : "—"}</dd></div>
              <div><dt>Inference time</dt><dd>{latest?.inferenceMs ? `${(latest.inferenceMs/1000).toFixed(1)}s` : "—"}</dd></div>
              <div><dt>Run observations</dt><dd>{feed?.obs?.toLocaleString("en-US") ?? "—"}</dd></div>
            </dl>
          </div>
        </TradingTheater>
        {latest?.input?.discoveryTx && <div className={s.evidenceChain}><span>FOLLOW THIS DECISION</span><External href={`${EXPLORER}/tx/${latest.input.discoveryTx}`}>Pool created ↗</External><span>→</span><a href={`/api/frames/${latest.frameSha}`} target="_blank" rel="noopener noreferrer">Exact chart ↗</a><span>→</span><span>Measured spikes</span><span>→</span><strong>{resultLabel(latest.result)}</strong></div>}
        <MarketRadar feed={feed} now={now} />
        <div className={s.logHeader}><h3>Decision log</h3><div className={s.logFilters} role="group" aria-label="Filter decision log">{(["all", "fills", "rejected"] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "fills" ? "Fills" : "Rejected"}</button>)}</div><span className={s.smallMono}>UTC / SELECT AN ASSET TO INSPECT</span></div>
        <div className={s.logWrap}>
          {decisions.length ? <table className={s.logTable}><caption className={s.srOnly}>Recent worker proposals and reported outcomes. A proposal is not a confirmed trade.</caption><thead><tr><th scope="col">Time</th><th scope="col">Asset</th><th scope="col">Proposal</th><th scope="col">Outcome</th></tr></thead><tbody>{decisions.map((d, i) => <tr key={`${d.t}-${d.symbol}-${i}`} className={selected && decisionKey(d) === decisionKey(selected) ? s.selectedRow : undefined}><td><time dateTime={d.t} title={d.t}>{utcTime(d.t)}</time></td><td><button className={s.inspectButton} aria-pressed={!!selected && decisionKey(d) === decisionKey(selected)} aria-label={`Inspect ${d.symbol} ${d.proposal.toLowerCase()} at ${utcTime(d.t)} UTC`} onClick={() => setSelectedKey(decisionKey(d))}>{d.symbol}</button><time dateTime={d.t} className={s.mobileTime}>{utcTime(d.t).slice(0, 5)}</time></td><td className={d.proposal === "BUY" ? s.buy : d.proposal === "SELL" ? s.sell : s.hold}>{d.proposal}</td><td title={d.result}>{receiptHash(d.result) ? <External href={`${EXPLORER}/tx/${receiptHash(d.result)}`} className={s.receiptLink}>View receipt</External> : resultLabel(d.result)}</td></tr>)}</tbody></table> : <div className={s.logEmpty}><span className={s.emptyIndex}>00</span><div><strong>{resource.status === "loading" ? "Loading the public record" : filter === "all" ? "No decisions available yet" : "No matching decisions in this snapshot"}</strong><p>{resource.status === "loading" ? "Connecting to the worker’s published feed." : "Check back here or open the source feed. Published decisions will appear automatically."}</p></div><External href={FEED} className={s.textLink}>Source feed</External></div>}
        </div>
        <div className={s.consoleFooter}><div><Badge tone={execution.tone}>{execution.label}</Badge><p>{execution.detail}</p></div><External href={HISTORY} className={s.textLink}>Feed history</External></div>
      </div>
      <p className={s.scienceNote}>Research status: chart pixels influence the model, but understanding price direction and profitability are unproven. <a href="/research/vision-audit.json" target="_blank" rel="noopener noreferrer">Inspect the 35-observation controlled test ↗</a></p>
      <div className={s.consoleNote}><span>{feed?.transport === "direct" ? "Direct laptop feed · checked every 3 seconds." : "Archived feed · checked every 3 seconds. Delivery can lag; timestamps show the age of each observation."}</span><External href={feed?.transport === "direct" ? "/api/feed" : FEED} className={s.textLink}>Raw data</External></div>
    </section>
  );
}

function WalletRecord({ now }: { now: number }) {
  const wallet = usePublicResource("/api/wallet", normalizeWallet);
  const transactions = usePublicResource("/api/trades", normalizeTransactions);
  const address = wallet.data?.address;
  const txs = transactions.data?.slice(0, 3) ?? [];
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  async function copy() {
    if (!address) return;
    try { await navigator.clipboard.writeText(address); setCopied(true); setCopyFailed(false); if (copyTimer.current) clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 2500); }
    catch { setCopyFailed(true); }
  }
  return <section id="record" className={s.recordSection} aria-labelledby="record-title">
    <div className={s.recordIntro}><span className={s.eyebrow}>02 / TRUST THE RECORD</span><h2 id="record-title">Receipts.<br />Not victory laps.</h2><p>Inspect the wallet, read the worker, and follow its published decisions. Activity is visible. Profitability is unproven.</p><External href={REPO} className={s.textLink}>Read the source</External></div>
    <div className={s.walletCard}>
      <div className={s.panelBar}><span>PUBLIC WALLET</span><span>ROBINHOOD CHAIN</span></div>
      <div className={s.walletBody}>
        <div className={s.balanceLine}><div><span className={s.eyebrow}>NATIVE BALANCE</span><p>{wallet.data?.balanceEth !== null && wallet.data?.balanceEth !== undefined ? wallet.data.balanceEth.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 }) : "—"}<span>ETH</span></p></div><Badge tone={address && wallet.status === "ready" ? "lime" : "muted"}>{wallet.status === "loading" ? "Checking wallet" : wallet.status === "unavailable" ? "Unavailable" : address ? "Address published" : "Not published"}</Badge></div>
        {address ? <div className={s.addressRow}><code>{address}</code><button onClick={copy} className={s.copyButton} aria-label="Copy public wallet address">{copied ? "Copied" : "Copy"}</button></div> : <p className={s.walletEmpty}>{wallet.status === "loading" ? "Loading the public wallet address." : "The wallet address is not available in this build. It will appear here when published."}</p>}
        {copyFailed && <p className={s.copyError} role="status">Copy is unavailable. Select the address above to copy it.</p>}
        {address && wallet.data?.balanceEth === null && <p className={s.walletEmpty}>Balance unavailable. Open the explorer to check it directly.</p>}
        {wallet.status === "unavailable" && wallet.data && <p className={s.copyError}>Wallet refresh failed. Showing the last loaded data.</p>}
        <div className={s.activityHeading}><h3>Wallet activity</h3><span>Not a profit report</span></div>
        {txs.length ? <ul className={s.transactionList}>{txs.map(tx => <li key={tx.hash}><External href={`${EXPLORER}/tx/${tx.hash}`}><div><strong>{tx.method}</strong><span>{tx.hash.slice(0, 10)}…{tx.hash.slice(-6)} · {tx.timestamp ? relativeTime(tx.timestamp, now) : "Time unreported"}</span></div><span className={s.txStatus}>{tx.success ? "Confirmed" : "Check receipt"}</span></External></li>)}</ul> : <p className={s.activityEmpty}>{transactions.status === "loading" ? "Checking published activity…" : "No wallet activity available. Chain receipts will appear here when available from the explorer."}</p>}
        {transactions.status === "unavailable" && txs.length > 0 && <p className={s.copyError}>Activity could not be refreshed. Verify the latest state on the explorer.</p>}
        <div className={s.walletFooter}>{address ? <External href={`${EXPLORER}/address/${address}`} className={s.textLink}>Open wallet on explorer</External> : <External href={EXPLORER} className={s.textLink}>Open chain explorer</External>}<span>Balances exclude token holdings.</span></div>
      </div>
    </div>
  </section>;
}

const QUESTIONS = [
  { q: "Is this a real fly brain?", a: "It is a computational model built from a mapped fruit-fly connectome. It is not a living fly, and a wiring map is not a complete recreation of a biological brain. The public session identifies whether the worker reports the connectome kernel or the simpler proxy decoder." },
  { q: "Is it trading real money right now?", a: "Check the session panel — the worker publishes its execution mode with every update, and this page repeats that label rather than claiming one. In paper mode, fills are simulated and no real orders are sent. In live mode, fills carry transaction references you can verify on the block explorer." },
  { q: "Can I trade through this page?", a: "This is an observation page, not a trading terminal or custody service. It does not connect to your wallet or place orders for you. The worker operates separately under its configured execution limits." },
  { q: "Does the fly learn to make money?", a: "Profitable learning has not been demonstrated. Dopamine-driven reinforcement is still in development. The experiment exposes what happened so that claims can be checked against the code and public record." },
];

export default function LaunchSite() {
  const session = usePublicResource("/api/feed", normalizeSession);
  const [now, setNow] = useState(0);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(id); }, []);
  const currentTime = Math.max(now, session.checkedAt ?? 0);
  const health = feedHealth(session.data, currentTime, session.status === "unavailable");
  const mode = session.data?.mode ?? null;
  const kicker = mode === "live" ? "A PUBLIC LIVE EXPERIMENT" : mode === "paper" ? "A PUBLIC PAPER EXPERIMENT" : "A PUBLIC EXPERIMENT";
  const outcomesWord = mode === "live" ? "Onchain outcomes." : mode === "paper" ? "Paper outcomes." : "Published outcomes.";
  return <div className={s.site}>
    <a href="#main" className={s.skipLink}>Skip to content</a>
    <header className={s.header}><div className={s.nav}>
      <a href="#" className={s.wordmark} aria-label="RobinFly home"><Mark /><span>ROBINFLY<span className={s.wordmarkDot}>.</span></span></a>
      <nav aria-label="Main navigation" className={s.navLinks}><a href="#session">Session</a><a href="#record">The record</a><a href="#experiment">The experiment</a></nav>
      <External href={SOCIAL_URL} className={s.navSource}>Follow on X</External>
    </div></header>
    <main id="main">
      <section className={s.hero} aria-labelledby="hero-title">
        <div className={s.heroCopy}>
          <div className={s.heroKicker}><span className={s.dot} />{kicker}</div>
          <h1 id="hero-title">SMALL<br />BRAIN.<br /><span>PUBLIC<br />RECORD.</span></h1>
          <p className={s.heroDescription}>Watch a fruit-fly connectome respond to market charts.<br className={s.desktopBreak} /> Neural proposals. {outcomesWord} An open record.</p>
          <div className={s.heroActions}><a href="#session" className={s.primaryButton}>Watch the session<Arrow /></a><a href="#experiment" className={s.secondaryButton}>Meet the experiment<Arrow diagonal /></a></div>
        </div>
        <div className={s.heroVisual}>
          <div className={s.stageLabel}><span>SUBJECT / 001</span><span>DROSOPHILA</span></div>
          <div className={s.flyStage}><div className={s.orbit} aria-hidden="true" /><div className={s.crosshair} aria-hidden="true" /><div className={s.stageNumber} aria-hidden="true">RF—01</div><FlyMascot eager className={s.heroFly} /><span className={s.subjectCaption}>Small creature. Open experiment.</span></div>
          <a className={s.heroStatus} href="#session"><div><span className={s.eyebrow}>PUBLIC SESSION</span><Badge tone={session.status === "loading" ? "muted" : health.tone}>{session.status === "loading" ? "Checking feed" : health.label}</Badge></div><Arrow /></a>
        </div>
      </section>
      <div className={s.specStrip}><div><strong>166,700</strong><span>Mapped neurons</span></div><div><strong>25.1M</strong><span>Compiled synapses</span></div><div><strong>Open source</strong><span>Source code & published feed</span></div><a href={`${REPO}/tree/main/brain`} target="_blank" rel="noopener noreferrer">Inspect the model<Arrow diagonal /></a></div>
      <div className={s.bodyContainer}>
        <SessionPanel resource={session} now={currentTime} />
        <WalletRecord now={currentTime} />
        <section id="experiment" className={s.experiment} aria-labelledby="experiment-title">
          <div className={s.sectionHeading}><div><span className={s.eyebrow}>03 / BIOLOGY, MEET MARKET</span><h2 id="experiment-title">A strange idea.<br />An inspectable process.</h2></div><p>A connectome is the starting point.<br />The implementation and its limits are public.</p></div>
          <div className={s.steps}>
            <article><div className={s.stepTop}><span>01</span><svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor"><path d="M5 10h38v28H5zM12 31l8-9 7 4 9-12" /><circle cx="36" cy="14" r="2" fill="currentColor" /></svg></div><h3>See a chart.</h3><p>The worker renders a market chart into a small image. The model receives a visual input, and the published feed can include the exact frame.</p><span className={s.stepFoot}>INPUT / MARKET IMAGE</span></article>
            <article><div className={s.stepTop}><span>02</span><svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor"><path d="m9 10 14 12L39 8M23 22l14 15M23 22 8 39M9 10l-1 29M39 8l-2 29" /><circle cx="9" cy="10" r="3" fill="currentColor" /><circle cx="23" cy="22" r="4" fill="currentColor" /><circle cx="39" cy="8" r="3" fill="currentColor" /><circle cx="8" cy="39" r="3" fill="currentColor" /><circle cx="37" cy="37" r="3" fill="currentColor" /></svg></div><h3>Make a proposal.</h3><p>The brain model produces activity. A decoder maps the response into buy, sell, or hold. The session reports the brain source and motor rates.</p><span className={s.stepFoot}>OUTPUT / NEURAL PROPOSAL</span></article>
            <article><div className={s.stepTop}><span>03</span><svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor"><path d="M12 5h24v38l-6-3-6 3-6-3-6 3V5Zm6 10h12M18 22h12m-12 7h7" /></svg></div><h3>Leave a record.</h3><p>The worker checks execution limits before an order. Outcomes and rejections appear in the feed; transaction references link to the chain.</p><span className={s.stepFoot}>EVIDENCE / PUBLIC OUTCOME</span></article>
          </div>
          <div className={s.guardBand}><div><span className={s.eyebrow}>THE FLY HAS LIMITS</span><h3>Curiosity, with a leash.</h3></div><p>The worker defines order, inventory, slippage, timing, and drawdown limits. These controls are code you can inspect; they do not guarantee safety or returns.</p><External href={`${REPO}/blob/main/worker/config.ts`} className={s.darkLink}>Read the limits</External></div>
        </section>
        <section className={s.faq} aria-labelledby="faq-title"><div><span className={s.eyebrow}>A FEW THINGS UP FRONT</span><h2 id="faq-title">Know what<br />you’re watching.</h2></div><div className={s.faqList}>{QUESTIONS.map(item => <details key={item.q}><summary>{item.q}<span aria-hidden="true">+</span></summary><p>{item.a}</p></details>)}</div></section>
        <section className={s.closing}><div><span className={s.eyebrow}>THE EXPERIMENT IS THE PRODUCT.</span><h2>Let the fly cook.<br /><span>Keep the receipts.</span></h2></div><a href="#session" className={s.primaryButton}>Back to the session<Arrow /></a></section>
      </div>
    </main>
    <footer className={s.footer}><div className={s.footerTop}><a href="#" className={s.wordmark}><Mark /><span>ROBINFLY<span className={s.wordmarkDot}>.</span></span></a><div><External href={SOCIAL_URL}>{SOCIAL_HANDLE}</External><a href="/media">Media kit</a><External href={REPO}>Source code</External><External href={HISTORY}>Feed history</External></div></div><div className={s.footerBottom}><p>An experimental system on Robinhood Chain. Profitable learning has not been demonstrated.<br />No affiliation with Robinhood. The public wallet is not a token contract.</p><span>SMALL BRAIN.<br />PUBLIC RECORD.</span></div></footer>
  </div>;
}
