/** Offline-testable order lifecycle; all chain effects are injected by the host. */
export type Hash = `0x${string}`;
export type TxKind = "approval" | "swap" | "unwrap";
export interface TransactionEvent { kind: TxKind; hash: Hash; stage: "submitted" | "success" | "reverted"; at: string; gasWei?: string }
export interface Plan { side:"BUY"|"SELL"; amountIn:bigint; slippageBps:number }
export interface Receipt { status:"success"|"reverted"; gasWei:bigint; received:bigint }
export interface ExecutionIO {
  quote(side:"BUY"|"SELL",amount:bigint):Promise<bigint|null>;
  allowance():Promise<bigint>;
  simulateApproval(amount:bigint):Promise<void>;
  approve(amount:bigint):Promise<Hash>;
  simulateSwap(side:"BUY"|"SELL",amount:bigint,minimum:bigint):Promise<void>;
  swap(side:"BUY"|"SELL",amount:bigint,minimum:bigint):Promise<Hash>;
  simulateUnwrap(amount:bigint):Promise<void>;
  unwrap(amount:bigint):Promise<Hash>;
  receipt(hash:Hash):Promise<Receipt>;
  assertFresh():void;
}
export interface ExecutionResult {hash:Hash;amountInRaw:bigint;amountOutRaw:bigint;gasWei:bigint;settlementComplete:boolean}
export async function executeOrder(plan:Plan,io:ExecutionIO,journal:(event:TransactionEvent)=>void):Promise<ExecutionResult> {
  if(plan.amountIn<=0n || !Number.isInteger(plan.slippageBps) || plan.slippageBps<0 || plan.slippageBps>=10_000)throw new Error("Invalid execution plan");
  let gasWei=0n;
  const record=(kind:TxKind,hash:Hash,stage:TransactionEvent["stage"],gas?:bigint)=>journal({kind,hash,stage,at:new Date().toISOString(),...(gas===undefined?{}:{gasWei:String(gas)})});
  const confirm=async(kind:TxKind,hash:Hash)=>{
    // Persist the hash before waiting. A failed journal or receipt blocks further effects.
    record(kind,hash,"submitted");
    const r=await io.receipt(hash);gasWei+=r.gasWei;record(kind,hash,r.status,r.gasWei);
    if(r.status!=="success")throw new Error(`${kind} reverted; reconcile the journal`);
    return r;
  };
  const getMinimum=async()=>{
    const quote=await io.quote(plan.side,plan.amountIn);
    if(quote===null || quote<=0n)throw new Error("No order-size quote");
    if(plan.side==="BUY") {const reverse=await io.quote("SELL",quote);if(reverse===null || reverse<=0n)throw new Error("No reverse route quote; sellability is unverified");}
    const min=quote*(10_000n-BigInt(plan.slippageBps))/10_000n;
    if(min<=0n)throw new Error("Quote too small to enforce slippage");return min;
  };
  // Check both route and freshness before an approval can be submitted.
  let minimum=await getMinimum();io.assertFresh();
  if(plan.side==="SELL" && await io.allowance()<plan.amountIn){
    await io.simulateApproval(plan.amountIn);io.assertFresh();
    await confirm("approval",await io.approve(plan.amountIn));
    minimum=await getMinimum(); // Never reuse a quote across an approval wait.
  }
  await io.simulateSwap(plan.side,plan.amountIn,minimum);io.assertFresh();
  const hash=await io.swap(plan.side,plan.amountIn,minimum);
  const receipt=await confirm("swap",hash);
  if(receipt.received<=0n)throw new Error("Confirmed swap has no reconciled proceeds");
  if(plan.side==="SELL"){
    try {
      await io.simulateUnwrap(receipt.received);
      await confirm("unwrap",await io.unwrap(receipt.received));
    } catch {return {hash,amountInRaw:plan.amountIn,amountOutRaw:receipt.received,gasWei,settlementComplete:false};}
  }
  return {hash,amountInRaw:plan.amountIn,amountOutRaw:receipt.received,gasWei,settlementComplete:true};
}
