/** Local pacing and an estimated monthly CU ceiling. Actual provider billing wins. */
import {existsSync,readFileSync,writeFileSync,renameSync,mkdirSync} from "node:fs";
import {join} from "node:path";
const costs:Record<string,number>={eth_getLogs:60,eth_call:26,eth_blockNumber:10,eth_chainId:0};
export class RpcBudget {
 private nextAt=0;private queue:Promise<void>=Promise.resolve();private used=0;private month="";
 constructor(private directory:string,private limit=24_000_000,private cuPerSecond=400){
  const path=join(directory,"rpc-budget.json");
  if(existsSync(path)){const s=JSON.parse(readFileSync(path,"utf8"));if(typeof s.month!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/.test(s.month)||!Number.isFinite(s.used)||s.used<0)throw new Error("Invalid RPC usage ledger");this.month=s.month;this.used=s.used;}
 }
 take(method:string):Promise<void>{
  const job=this.queue.then(async()=>{
   const current=new Date().toISOString().slice(0,7);if(this.month!==current){this.month=current;this.used=0;}
   const cost=costs[method]??20;if(this.used+cost>this.limit)throw new Error("Local RPC monthly budget reached; ingestion paused");
   const delay=Math.max(0,this.nextAt-Date.now());this.nextAt=Math.max(Date.now(),this.nextAt)+Math.ceil(cost/this.cuPerSecond*1000);
   if(delay)await new Promise(r=>setTimeout(r,delay));
   // Reserve before issuing the request; crashes may overcount, never reset usage.
   this.used+=cost;mkdirSync(this.directory,{recursive:true});const path=join(this.directory,"rpc-budget.json");
   writeFileSync(path+".tmp",JSON.stringify({month:this.month,used:this.used,limit:this.limit,estimateOnly:true}),{mode:0o600});renameSync(path+".tmp",path);
  });this.queue=job.catch(()=>{});return job;
 }
 summary(){return {month:this.month,estimatedCu:this.used,monthlyCeiling:this.limit,estimateOnly:true};}
}
