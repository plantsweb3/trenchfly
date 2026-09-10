"use client";
import {useState} from "react";
import type {PublicSession} from "../lib/session-state";
import s from "./market-radar.module.css";
const explorer="https://robinhoodchain.blockscout.com";
const amount=(n:number|null|undefined)=>n===null||n===undefined?"—":n.toLocaleString("en-US",{maximumSignificantDigits:4});
function age(at:number|null|undefined,now:number){if(!at||!now||at>now)return "—";const sec=Math.floor((now-at)/1000);return sec<60?`${sec}s`:sec<3600?`${Math.floor(sec/60)}m`:`${Math.floor(sec/3600)}h`;}
export default function MarketRadar({feed,now}:{feed:PublicSession|null;now:number}) {
 const [all,setAll]=useState(false);const markets=feed?.markets??[];const rows=all?markets:markets.slice(0,6);const discovery=feed?.discovery;
 const backlog=discovery?.head&&discovery.cursor?Math.max(0,Number(BigInt(discovery.head)-BigInt(discovery.cursor))-12):null;
 return <section className={s.radar} aria-label="Market discovery and swap activity">
  <div className={s.heading}><div><span>THE WATCHLIST</span><h3>Market radar.</h3></div><div className={s.status}><b>{discovery?.queued??"—"}</b><span>pools indexed</span><b>{markets.length}</b><span>in view</span></div></div>
  <p className={s.scope}>{discovery?.scope??"Configured markets on Robinhood Chain"}. Software selects the candidates; the connectome proposes the action.</p>
  {backlog!==null&&backlog>100&&<p className={s.notice}>Catching up on {backlog.toLocaleString("en-US")} blocks. The newest-pair list is still incomplete.</p>}
  {discovery?.error&&<p className={s.notice}>{discovery.error}</p>}
  <div className={s.scroll}><table><caption className={s.srOnly}>Recorded pool information. Missing data is shown as a dash. Pool WETH is the pool’s token balance, not locked liquidity or a safety rating.</caption><thead><tr><th>Pair / status</th><th>Pool age</th><th>5m buys / sells</th><th>5m volume</th><th>Pool WETH</th><th>Source</th></tr></thead><tbody>
   {rows.map(m=>{const c=m.context;const fresh=!!c?.scanThroughAt&&now>=c.scanThroughAt&&now-c.scanThroughAt<60_000;return <tr key={m.address}>
    <td><a href={`${explorer}/token/${m.address}`} target="_blank" rel="noopener noreferrer">{m.symbol}<small>/ ETH</small></a><span className={s.state}>{m.lastQuoteAt&&now-Date.parse(m.lastQuoteAt)>60_000?"Quote delayed":m.status==="ready"?"Observing":m.status==="warming"?`Warming · ${m.samples}/8`:m.status==="no_quote"?"No route quote":m.status==="error"?"Read unavailable":"Checking"}</span></td>
    <td>{age(c?.createdAt,now)}</td><td><span className={s.buy}>{fresh?amount(c?.buys5m):"—"}</span><span className={s.divider}> / </span><span className={s.sell}>{fresh?amount(c?.sells5m):"—"}</span></td><td>{fresh?amount(c?.volumeEth5m):"—"}<small> ETH</small></td><td>{c?.statsAt&&now-c.statsAt<120_000?amount(c.poolWeth):"—"}</td>
    <td>{c?.discoveryTx?<a href={`${explorer}/tx/${c.discoveryTx}`} target="_blank" rel="noopener noreferrer">Creation ↗</a>:"Configured"}{m.pool&&<a className={s.pool} href={`${explorer}/address/${m.pool}`} target="_blank" rel="noopener noreferrer">{m.pool.slice(0,6)}…{m.pool.slice(-4)} ↗</a>}</td>
   </tr>;})}
  </tbody></table>{!rows.length&&<p className={s.empty}>Waiting for the worker’s first market snapshot.</p>}</div>
  <div className={s.footer}><p>Swap events supply the counts and volume. Holders and contract-risk checks are not indexed. Pool balances do not prove sellability.</p>{markets.length>6&&<button onClick={()=>setAll(!all)}>{all?"Show less":`Show all ${markets.length}`}</button>}</div>
 </section>;
}
