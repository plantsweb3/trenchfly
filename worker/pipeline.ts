/** Durable, provider-independent market state. Cursors and events commit together. */
import { existsSync, mkdirSync, openSync, closeSync, fsyncSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface Candle { t: number; open: number; high: number; low: number; close: number; volumeEth: number; buys: number; sells: number }
export interface Swap { id: string; block: string; logIndex: number; t: number; priceEth: number; volumeEth: number; side: "BUY" | "SELL" }
export interface Candidate {
  origin?: "factory_event" | "factory_lookup"; pool: string; token: string; token0: string; fee: number; block: string; blockHash: string; tx: string | null; logIndex: number;
  createdAt: number; discoveredAt: number; symbol?: string; decimals?: number;
  activeSince: number; lastSelectedAt: number; lastSampledAt: number;
  swapCursor: string | null; swapHash: string | null; swapThroughAt: number | null; swapFromAt?: number; swaps: Swap[];
  quotes: { t: number; priceEth: number }[];
  liquidityRaw: string | null; poolWeth: number | null; poolToken: number | null;
  statsAt: number | null; status: "queued" | "warming" | "ready" | "no_quote" | "error"; error: string | null;
}
export interface MarketStore {
  version: 1; chainId: number; factory: string; startBlock: string | null;
  cursor: string | null; cursorHash: string | null; scannedAt: number | null; observedHead: string | null;
  candidates: Record<string, Candidate>;
}
export const addr = (s: string) => s.toLowerCase();
export function emptyMarketStore(chainId: number, factory: string): MarketStore {
  return { version: 1, chainId, factory: addr(factory), startBlock: null, cursor: null, cursorHash: null, scannedAt: null, observedHead: null, candidates: {} };
}
const address = /^0x[\da-f]{40}$/i, hash = /^0x[\da-f]{64}$/i, block = /^\d+$/;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
export function validateMarketStore(s: MarketStore, chainId: number, factory: string): MarketStore {
  if (!s || s.version !== 1 || s.chainId !== chainId || s.factory !== addr(factory) || !s.candidates || typeof s.candidates !== "object" || Array.isArray(s.candidates)) throw new Error("Market-state source mismatch or corruption");
  for (const value of [s.cursor,s.startBlock,s.observedHead]) if (value !== null && (typeof value !== "string" || !block.test(value))) throw new Error("Invalid market cursor");
  if ((s.cursor === null) !== (s.cursorHash === null) || (s.cursorHash !== null && !hash.test(s.cursorHash))) throw new Error("Invalid cursor anchor");
  for (const [key,c] of Object.entries(s.candidates)) {
    if (!c || key !== addr(c.pool) || !address.test(c.pool) || !address.test(c.token) || !address.test(c.token0) || !block.test(c.block) || !hash.test(c.blockHash) || !(c.origin==="factory_lookup"?c.tx===null:typeof c.tx==="string"&&hash.test(c.tx)) || !Number.isSafeInteger(c.logIndex) || c.logIndex < 0 || !Number.isInteger(c.fee) || c.fee <= 0 || c.fee >= 1_000_000) throw new Error("Invalid discovered pool");
    for (const n of [c.createdAt,c.discoveredAt,c.activeSince,c.lastSelectedAt,c.lastSampledAt]) if (!finite(n)) throw new Error("Invalid market time");
    if (c.decimals !== undefined && (!Number.isInteger(c.decimals) || c.decimals<0 || c.decimals>36)) throw new Error("Invalid token decimals");
    if ((c.swapCursor===null)!==(c.swapHash===null) || (c.swapCursor!==null && (!block.test(c.swapCursor) || !hash.test(c.swapHash!)))) throw new Error("Invalid swap cursor");
    if (!Array.isArray(c.quotes) || !Array.isArray(c.swaps)) throw new Error("Invalid market history");
    for (const q of c.quotes) if (!finite(q.t) || !finite(q.priceEth) || q.priceEth<=0) throw new Error("Invalid saved quote");
    for (const x of c.swaps) if (typeof x.id!=="string" || !block.test(x.block) || !finite(x.t) || !finite(x.priceEth) || x.priceEth<=0 || !finite(x.volumeEth) || !["BUY","SELL"].includes(x.side)) throw new Error("Invalid saved swap");
  }
  return s;
}
export function loadMarketStore(directory: string, chainId: number, factory: string): MarketStore {
  const path = join(directory,"markets.json");
  return existsSync(path) ? validateMarketStore(JSON.parse(readFileSync(path,"utf8")),chainId,factory) : emptyMarketStore(chainId,factory);
}
export function saveMarketStore(directory: string, s: MarketStore) {
  validateMarketStore(s,s.chainId,s.factory); mkdirSync(directory,{recursive:true});
  const path=join(directory,"markets.json"), tmp=path+`.${process.pid}.tmp`;
  const fd=openSync(tmp,"w",0o600);
  try {writeFileSync(fd,JSON.stringify(s));fsyncSync(fd);} finally {closeSync(fd);}
  renameSync(tmp,path);
}
export function commitDiscovery(s: MarketStore, from: bigint, to: bigint, toHash: string, found: Candidate[], now: number): MarketStore {
  if (from>to || (s.cursor!==null && from!==BigInt(s.cursor)+1n)) throw new Error("Non-contiguous discovery range");
  const next=structuredClone(s);
  next.startBlock ??= String(from);
  for (const c of found) {
    if (BigInt(c.block)<from || BigInt(c.block)>to) throw new Error("Event outside committed range");
    const key=addr(c.pool), old=next.candidates[key];
    if(old?.origin==="factory_lookup" && c.tx){next.candidates[key]={...old,origin:"factory_event",block:c.block,blockHash:c.blockHash,tx:c.tx,logIndex:c.logIndex,createdAt:c.createdAt};continue;}
    if (old && (old.tx!==c.tx || old.logIndex!==c.logIndex || old.blockHash!==c.blockHash)) throw new Error("Conflicting pool event; reconcile chain history");
    next.candidates[key] ??= c;
  }
  next.cursor=String(to);next.cursorHash=toHash;next.scannedAt=now;
  return validateMarketStore(next,s.chainId,s.factory);
}
/** Keep held tokens, then rotate complete observation windows through the queue. */
export function selectActive(s: MarketStore, holdings: Record<string,number>, now: number, limit=14, leaseMs=180_000, maxAgeMs=86_400_000): Candidate[] {
  const all=Object.values(s.candidates);
  const held=all.filter(c=>(holdings[addr(c.token)]??0)>0).sort((a,b)=>b.lastSampledAt-a.lastSampledAt);
  const selected: Candidate[]=[];const tokens=new Set<string>();
  const add=(c:Candidate)=>{if(!tokens.has(addr(c.token))){selected.push(c);tokens.add(addr(c.token));}};
  held.forEach(add); // Holdings may exceed the candidate cap; exits never disappear.
  const eligible=all.filter(c=>!tokens.has(addr(c.token)) && c.origin!=="factory_lookup" && now-c.createdAt<=maxAgeMs);
  eligible.filter(c=>c.activeSince>0 && now-c.activeSince<leaseMs).sort((a,b)=>a.activeSince-b.activeSince).forEach(c=>{if(selected.length<limit)add(c);});
  eligible.sort((a,b)=>a.lastSelectedAt-b.lastSelectedAt || b.createdAt-a.createdAt || a.pool.localeCompare(b.pool)).forEach(c=>{
    if(selected.length<limit && !tokens.has(addr(c.token))){c.activeSince=now;c.lastSelectedAt=now;add(c);}
  });
  const selectedPools=new Set(selected.map(c=>addr(c.pool)));
  for(const c of all) if(!selectedPools.has(addr(c.pool))) c.activeSince=0;
  return selected;
}
export function candlesFromSwaps(swaps: Swap[], now: number, minutes=60): Candle[] {
  const candles=new Map<number,Candle>();
  for(const s of [...swaps].sort((a,b)=>a.t-b.t || Number(BigInt(a.block)-BigInt(b.block)) || a.logIndex-b.logIndex)) {
    if(s.t<now-minutes*60_000 || s.t>now)continue;
    const t=Math.floor(s.t/60_000)*60_000, c=candles.get(t);
    if(c){c.high=Math.max(c.high,s.priceEth);c.low=Math.min(c.low,s.priceEth);c.close=s.priceEth;c.volumeEth+=s.volumeEth;c.buys+=+(s.side==="BUY");c.sells+=+(s.side==="SELL");}
    else candles.set(t,{t,open:s.priceEth,high:s.priceEth,low:s.priceEth,close:s.priceEth,volumeEth:s.volumeEth,buys:+(s.side==="BUY"),sells:+(s.side==="SELL")});
  }
  return [...candles.values()]; // No invented flat candles in empty intervals.
}
export function poolContext(c: Candidate, now: number) {
  const covered=c.swapThroughAt!==null && signalFresh(c.swapThroughAt,now) && (c.swapFromAt??c.createdAt)<=Math.max(c.createdAt,now-300_000), trades=c.swaps.filter(s=>s.t>=now-300_000 && s.t<=now);
  return { source:"uniswap_v3_swaps" as const,pool:c.pool,discoveryTx:c.tx,discoveryBlock:c.origin==="factory_lookup"?null:c.block,createdAt:c.createdAt||null,ageSeconds:c.createdAt?Math.max(0,Math.floor((now-c.createdAt)/1000)):null,candles:covered?candlesFromSwaps(c.swaps,now):[],volumeEth5m:covered?trades.reduce((v,s)=>v+s.volumeEth,0):null,buys5m:covered?trades.filter(s=>s.side==="BUY").length:null,sells5m:covered?trades.filter(s=>s.side==="SELL").length:null,liquidityRaw:c.liquidityRaw,poolWeth:c.poolWeth,poolToken:c.poolToken,statsAt:c.statsAt,holders:null,scanThroughBlock:c.swapCursor,scanThroughAt:c.swapThroughAt,coverageCurrent:covered,marketObservedAt:c.lastSampledAt };
}
export function appendSwaps(c: Candidate, swaps: Swap[], cursor: bigint, cursorHash: string, now: number, throughAt: number): Candidate {
  const seen=new Map(c.swaps.map(s=>[s.id,s]));for(const s of swaps)seen.set(s.id,s);
  // One hour retained for candles; totals outside this window are not claimed.
  return {...c,swaps:[...seen.values()].filter(s=>s.t>=now-3_600_000),swapCursor:String(cursor),swapHash:cursorHash,swapThroughAt:throughAt};
}
export function signalFresh(inputAt: number, now: number, maxAgeMs=45_000): boolean {return Number.isFinite(inputAt)&&inputAt>0&&now>=inputAt&&now-inputAt<=maxAgeMs;}
export function chooseObservation<T extends {address:string;lastQuoteAt:number;history:number[]}>(candidates:T[], consumed:Map<string,number>, now:number):T|undefined {
  return candidates.filter(c=>c.history.length>=8 && signalFresh(c.lastQuoteAt,now) && c.lastQuoteAt>(consumed.get(addr(c.address))??0)).sort((a,b)=>(consumed.get(addr(a.address))??0)-(consumed.get(addr(b.address))??0) || b.lastQuoteAt-a.lastQuoteAt)[0];
}
