import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {emptyMarketStore,commitDiscovery,loadMarketStore,saveMarketStore,selectActive,candlesFromSwaps,poolContext,appendSwaps,chooseObservation,signalFresh,type Candidate,type Swap} from "./pipeline";
import {executeOrder,type ExecutionIO,type TransactionEvent} from "./execution-engine";
const address=(n:number)=>`0x${n.toString(16).padStart(40,"0")}`;
const hash=(n:number)=>`0x${n.toString(16).padStart(64,"0")}` as `0x${string}`;
const factory=address(1),now=1_800_000_000_000;
function candidate(n:number):Candidate{return {pool:address(n+100),token:address(n+200),token0:address(n+200),fee:3000,block:"10",blockHash:hash(10),tx:hash(n),logIndex:n,createdAt:now-30_000,discoveredAt:now,symbol:`T${n}`,decimals:18,activeSince:0,lastSelectedAt:0,lastSampledAt:0,swapCursor:null,swapHash:null,swapThroughAt:null,swaps:[],quotes:[],liquidityRaw:null,poolWeth:null,poolToken:null,statsAt:null,status:"queued",error:null};}
const store=()=>emptyMarketStore(4663,factory);
test("discovery preserves a burst larger than the active set across restart",()=>{
 const dir=mkdtempSync(join(tmpdir(),"robinfly-discovery-"));try{
  const s=commitDiscovery(store(),0n,10n,hash(10),Array.from({length:37},(_,i)=>candidate(i+1)),now);saveMarketStore(dir,s);
  const restored=loadMarketStore(dir,4663,factory);assert.equal(Object.keys(restored.candidates).length,37);assert.equal(restored.cursor,"10");assert.equal(selectActive(restored,{},now).length,14);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("cursor gaps and conflicting source identities fail closed",()=>{
 const s=commitDiscovery(store(),0n,10n,hash(10),[candidate(1)],now);
 assert.throws(()=>commitDiscovery(s,12n,20n,hash(20),[],now),/contiguous/);
 const conflict={...candidate(1),block:"11",blockHash:hash(11)};
 assert.throws(()=>commitDiscovery(s,11n,11n,hash(11),[conflict],now),/Conflicting/);
});
test("replayed identical events deduplicate without losing metadata",()=>{
 const c=candidate(1);const s=commitDiscovery(store(),0n,10n,hash(10),[c,c],now);
 assert.equal(Object.keys(s.candidates).length,1);assert.equal(s.candidates[c.pool].symbol,"T1");
});
test("failed persistence is not treated as an empty new database",()=>{
 const dir=mkdtempSync(join(tmpdir(),"robinfly-corrupt-"));try{writeFileSync(join(dir,"markets.json"),"{broken");assert.throws(()=>loadMarketStore(dir,4663,factory));}finally{rmSync(dir,{recursive:true,force:true});}
});
test("candidate rotation visits overflow and retains held tokens past expiry",()=>{
 const s=commitDiscovery(store(),0n,10n,hash(10),Array.from({length:30},(_,i)=>candidate(i+1)),now);
 const first=selectActive(s,{},now);const held=first[0];
 const second=selectActive(s,{[held.token]:1},now+180_001);
 assert(second.some(c=>c.pool===held.pool));assert(second.some(c=>!first.some(x=>x.pool===c.pool)));
 const expired=selectActive(s,{[held.token]:1},now+86_400_001);assert.deepEqual(expired.map(c=>c.pool),[held.pool]);
});
test("multiple pools for one token do not occupy all observation slots",()=>{
 const a=candidate(1),b={...candidate(2),token:a.token};const s=commitDiscovery(store(),0n,10n,hash(10),[a,b],now);assert.equal(selectActive(s,{},now).length,1);
});
const swap=(id:number,t:number,priceEth:number,side:"BUY"|"SELL"="BUY"):Swap=>({id:String(id),block:"10",logIndex:id,t,priceEth,volumeEth:1,side});
test("OHLC uses chain log order, counts directions, and leaves empty minutes empty",()=>{
 const t=Math.floor(now/60_000)*60_000;
 const bars=candlesFromSwaps([swap(2,t+1,3,"SELL"),swap(1,t+1,2),swap(3,t+2,1),swap(4,t+120_000,4)],t+180_000);
 assert.equal(bars.length,2);assert.deepEqual(bars[0],{t,open:2,high:3,low:1,close:1,volumeEth:3,buys:2,sells:1});
});
test("swap replay is idempotent and completed empty scans are distinguishable from unknown data",()=>{
 const c=candidate(1),x=swap(1,now-1000,1);const once=appendSwaps(c,[x],10n,hash(10),now,now-1000);const twice=appendSwaps(once,[x],11n,hash(11),now,now);
 assert.equal(twice.swaps.length,1);assert.equal(poolContext(c,now).volumeEth5m,null);assert.equal(poolContext(twice,now).volumeEth5m,1);
 const empty=appendSwaps(c,[],10n,hash(10),now,now);assert.equal(poolContext(empty,now).volumeEth5m,0);
 assert.equal(poolContext(empty,now+60_000).volumeEth5m,null);
});
test("old and future observations cannot turn into actions; newest unconsumed input wins fairly",()=>{
 assert.equal(signalFresh(now,now+45_001),false);assert.equal(signalFresh(now+1,now),false);
 const a={address:address(1),lastQuoteAt:now,history:Array(8).fill(1)},b={...a,address:address(2),lastQuoteAt:now-1};
 const consumed=new Map([[a.address,now]]);assert.equal(chooseObservation([a,b],consumed,now)?.address,b.address);
 assert.equal(chooseObservation([a],consumed,now),undefined);
});
function io(overrides:Partial<ExecutionIO>={}){
 const calls:string[]=[];let next=0;
 const base:ExecutionIO={quote:async(side)=>{calls.push(`quote:${side}`);return 1000n;},allowance:async()=>0n,simulateApproval:async()=>{calls.push("simulate:approval");},approve:async()=>{calls.push("send:approval");return hash(++next);},simulateSwap:async(_side,_amount,min)=>{calls.push(`simulate:swap:${min}`);},swap:async()=>{calls.push("send:swap");return hash(++next);},simulateUnwrap:async n=>{calls.push(`simulate:unwrap:${n}`);},unwrap:async n=>{calls.push(`send:unwrap:${n}`);return hash(++next);},receipt:async()=>({status:"success",gasWei:7n,received:800n}),assertFresh:()=>{calls.push("fresh");}};
 return {calls,adapter:{...base,...overrides}};
}
test("buy enforces actual-size minimum and records broadcast before receipt",async()=>{
 const events:TransactionEvent[]=[];const {adapter,calls}=io({receipt:async()=>{assert.equal(events.at(-1)?.stage,"submitted");return {status:"success",gasWei:9n,received:800n};}});
 const result=await executeOrder({side:"BUY",amountIn:10n,slippageBps:50},adapter,e=>events.push(e));
 assert(calls.includes("simulate:swap:995"));assert(!calls.some(c=>c.includes("approval")));assert.equal(result.amountOutRaw,800n);assert.equal(result.gasWei,9n);
});
test("sell requotes after approval and unwraps only receipt proceeds",async()=>{
 const {adapter,calls}=io();const result=await executeOrder({side:"SELL",amountIn:10n,slippageBps:50},adapter,()=>{});
 assert.equal(calls.filter(c=>c==="quote:SELL").length,2);assert(calls.includes("send:unwrap:800"));assert.equal(result.gasWei,21n);
});
test("receipt timeouts leave one persisted broadcast and never retry",async()=>{
 const events:TransactionEvent[]=[];const {adapter,calls}=io({receipt:async()=>{throw new Error("timeout");}});
 await assert.rejects(executeOrder({side:"BUY",amountIn:10n,slippageBps:50},adapter,e=>events.push(e)),/timeout/);
 assert.equal(calls.filter(c=>c==="send:swap").length,1);assert.equal(events.length,1);assert.equal(events[0].stage,"submitted");
});
test("failed journal halts before waiting or submitting another transaction",async()=>{
 let receiptCalled=false;const {adapter}=io({receipt:async()=>{receiptCalled=true;throw new Error("unexpected");}});
 await assert.rejects(executeOrder({side:"BUY",amountIn:10n,slippageBps:50},adapter,()=>{throw new Error("disk full");}),/disk full/);assert.equal(receiptCalled,false);
});
test("reverted approvals stop the swap; reverted swaps never become fills",async()=>{
 for(const side of ["BUY","SELL"] as const){const {adapter,calls}=io({receipt:async()=>({status:"reverted",gasWei:4n,received:0n})});await assert.rejects(executeOrder({side,amountIn:10n,slippageBps:50},adapter,()=>{}),/reverted/);if(side==="SELL")assert(!calls.includes("send:swap"));}
});
test("incomplete unwrap preserves a confirmed sell for reconciliation",async()=>{
 const {adapter}=io({unwrap:async()=>{throw new Error("provider unavailable");}});const result=await executeOrder({side:"SELL",amountIn:10n,slippageBps:50},adapter,()=>{});assert.equal(result.settlementComplete,false);assert.equal(result.amountOutRaw,800n);
});
test("stale input, a failed simulation or missing reverse quote produces no broadcast",async()=>{
 for(const overrides of [{assertFresh:()=>{throw new Error("expired");}},{simulateSwap:async()=>{throw new Error("revert");}},{quote:async(side:string)=>side==="BUY"?1000n:null}]){const {adapter,calls}=io(overrides);await assert.rejects(executeOrder({side:"BUY",amountIn:10n,slippageBps:50},adapter,()=>{}));assert(!calls.some(c=>c.startsWith("send:")));}
});

import {RpcBudget} from "./rpc-budget";
import {normalizeSession} from "../lib/session-state";
test("local RPC estimate persists and stops at its configured allowance",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"robinfly-budget-"));try{
  const budget=new RpcBudget(dir,30,1_000_000);await budget.take("eth_call");assert.equal(budget.summary().estimatedCu,26);
  const restored=new RpcBudget(dir,30,1_000_000);await assert.rejects(restored.take("eth_call"),/budget reached/);assert.equal(restored.summary().estimatedCu,26);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("public neural and pool evidence rejects unsafe links and missing measurements",()=>{
 const session=normalizeSession({session:{updatedAt:new Date(now).toISOString(),recent:[{t:new Date(now).toISOString(),symbol:"TEST",proposal:"BUY",result:"hold",pool:"https://invalid",input:{pool:"https://invalid",discoveryTx:"javascript:alert(1)",volumeEth5m:-1},neural:{neuralMs:500,totalSpikes:20,bins:[{tMs:50,rateL:NaN,rateR:2,gateSpikes:1,totalSpikes:20}],populations:[]}}]}});
 assert.equal(session?.recent[0].neural,null);assert.equal(session?.recent[0].pool,null);assert.equal(session?.recent[0].input?.discoveryTx,null);assert.equal(session?.recent[0].input?.volumeEth5m,null);
});
test("a configured pool can acquire genuine creation provenance without losing its history",()=>{
 const c={...candidate(1),origin:"factory_lookup" as const,tx:null,createdAt:0};c.quotes=[{t:now,priceEth:1}];const s=store();s.candidates[c.pool]=c;
 const upgraded=commitDiscovery(s,0n,10n,hash(10),[candidate(1)],now);assert.equal(upgraded.candidates[c.pool].origin,"factory_event");assert.equal(upgraded.candidates[c.pool].quotes.length,1);assert.equal(upgraded.candidates[c.pool].tx,hash(1));
});
