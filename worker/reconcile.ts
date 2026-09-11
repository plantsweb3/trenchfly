/** Read-only recovery report. Never clears pending intents or broadcasts. */
import {existsSync,readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {formatEther,isAddress,type Address} from "viem";
import {publicClient,tokenBalance} from "./market";
import {validateLedger,type Ledger} from "./state";
import {receiptFee,receivedTokens} from "./settlement";
import {CONTRACTS,robinhoodChain} from "./config";
import {assertChain} from "./guard";
import {safeError} from "../lib/rpc-config";
async function main(){
 const runs=join(dirname(fileURLToPath(import.meta.url)),"runs");
 const statePath=join(runs,"live-state.json");
 if(!existsSync(statePath)){
  console.log("No live-state.json — no live session has run; nothing to reconcile.");
  return;
 }
 const raw=JSON.parse(readFileSync(statePath,"utf8")) as Ledger;
 if(!raw.account||!isAddress(raw.account))throw new Error("Saved live account unavailable");
 const state=validateLedger(raw,"live",raw.account);assertChain(await publicClient.getChainId(),robinhoodChain.id);
 const owner=raw.account as Address;const rows:Record<string,unknown>[]=[];
 const events=state.pending?.transactions??[];
 const hashes=new Map(events.map(e=>[e.hash,e.kind]));
 if(state.pending?.hash&&!hashes.has(state.pending.hash as `0x${string}`))hashes.set(state.pending.hash as `0x${string}`,"swap");
 for(const [hash,kind] of hashes){
  try{const receipt=await publicClient.getTransactionReceipt({hash});const tx=await publicClient.getTransaction({hash});
   rows.push({hash,kind,status:receipt.status,gasWei:String(receiptFee(receipt)),valueWei:String(tx.value),block:String(receipt.blockNumber),tokenNetRaw:state.pending?String(receivedTokens(receipt,state.pending.token as Address,owner)):null,wethNetRaw:String(receivedTokens(receipt,CONTRACTS.weth as Address,owner))});
  }catch(error){rows.push({hash,kind,status:"unresolved",reason:safeError(error)});}
 }
 const report={checkedAt:new Date().toISOString(),account:owner,pending:state.pending,transactions:rows,wallet:{eth:formatEther(await publicClient.getBalance({address:owner})),wethRaw:String(await tokenBalance(CONTRACTS.weth as Address,owner)),tokenRaw:state.pending?String(await tokenBalance(state.pending.token as Address,owner)):null},ledgerModified:false,transactionsSubmitted:0,readyToResume:false,note:"Evidence only. Reconcile gas, token balances, proceeds and native/WETH settlement before changing the saved ledger. An unknown broadcast outcome must never be retried blindly."};
 mkdirSync(runs,{recursive:true});writeFileSync(join(runs,"reconciliation.json"),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report,null,2));
}
void main().catch(e=>{console.error(safeError(e));process.exitCode=1;});
