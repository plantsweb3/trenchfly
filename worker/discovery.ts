/** One declared venue: canonical Uniswap v3 WETH pools on chain 4663. */
import { parseAbi, parseAbiItem, formatUnits, formatEther, type Address } from "viem";
import { CONTRACTS } from "./config";
import { publicClient } from "./market";
import { appendSwaps, commitDiscovery, addr, type Candidate, type MarketStore, type Swap } from "./pipeline";
const poolCreated=parseAbiItem("event PoolCreated(address indexed token0,address indexed token1,uint24 indexed fee,int24 tickSpacing,address pool)");
const swapEvent=parseAbiItem("event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)");
const erc20=parseAbi(["function symbol() view returns (string)","function decimals() view returns (uint8)","function balanceOf(address) view returns (uint256)"]);
const poolAbi=parseAbi(["function liquidity() view returns (uint128)"]);
export const DISCOVERY_SCOPE="Uniswap v3 · WETH pairs · Robinhood Chain";
export const CONFIRMATIONS=12n; // L2 block-depth delay, not a claim of L1 finality.
const configuredRange=Number(process.env.ROBINFLY_LOG_RANGE??10);
if(!Number.isInteger(configuredRange)||configuredRange<1||configuredRange>500)throw new Error("ROBINFLY_LOG_RANGE must be between 1 and 500");
const LOG_RANGE=BigInt(configuredRange);
const RANGE=LOG_RANGE*10n;
function logRanges(from:bigint,to:bigint){const ranges:{fromBlock:bigint;toBlock:bigint}[]=[];for(let start=from;start<=to;start+=LOG_RANGE)ranges.push({fromBlock:start,toBlock:start+LOG_RANGE-1n<to?start+LOG_RANGE-1n:to});return ranges;}

export async function scanNewPools(s:MarketStore, initialLookback=2000n):Promise<MarketStore> {
  const head=await publicClient.getBlockNumber({cacheTime:0});
  const safeHead=head>CONFIRMATIONS?head-CONFIRMATIONS:0n;
  if(s.cursor!==null) {
    const anchor=await publicClient.getBlock({blockNumber:BigInt(s.cursor)});
    if(anchor.hash!==s.cursorHash)throw new Error("Chain history changed at discovery cursor; ingestion paused for reconciliation");
  }
  const from=s.cursor===null?(safeHead>initialLookback?safeHead-initialLookback+1n:0n):BigInt(s.cursor)+1n;
  if(from>safeHead)return {...s,observedHead:String(head),scannedAt:Date.now()};
  const to=from+RANGE-1n<safeHead?from+RANGE-1n:safeHead;
  const logs=(await Promise.all(logRanges(from,to).map(range=>publicClient.getLogs({address:CONTRACTS.uniswapV3Factory as Address,event:poolCreated,...range,strict:true})))).flat();
  const blocks=new Map<string,Awaited<ReturnType<typeof publicClient.getBlock>>>();
  const getBlock=async(n:bigint)=>{const key=String(n);if(!blocks.has(key))blocks.set(key,await publicClient.getBlock({blockNumber:n}));return blocks.get(key)!;};
  const found:Candidate[]=[];
  for(const l of logs) {
    if(l.removed || l.blockNumber===null || !l.blockHash || !l.transactionHash || l.logIndex===null)throw new Error("Incomplete discovery event");
    const {token0,token1,fee,pool}=l.args;
    const token=addr(token0)===addr(CONTRACTS.weth)?token1:addr(token1)===addr(CONTRACTS.weth)?token0:null;
    if(!token)continue;
    const b=await getBlock(l.blockNumber);if(b.hash!==l.blockHash)throw new Error("Chain history changed during discovery read");
    found.push({pool:addr(pool),token:addr(token),token0:addr(token0),fee,block:String(l.blockNumber),blockHash:l.blockHash,tx:l.transactionHash,logIndex:l.logIndex,createdAt:Number(b.timestamp)*1000,discoveredAt:Date.now(),activeSince:0,lastSelectedAt:0,lastSampledAt:0,swapCursor:null,swapHash:null,swapThroughAt:null,swaps:[],quotes:[],liquidityRaw:null,poolWeth:null,poolToken:null,statsAt:null,status:"queued",error:null});
  }
  const anchor=await getBlock(to);if(!anchor.hash)throw new Error("Missing block anchor");
  return {...commitDiscovery(s,from,to,anchor.hash,found,Date.now()),observedHead:String(head)};
}

export async function loadPoolMetadata(c:Candidate):Promise<Pick<Candidate,"symbol"|"decimals">> {
  // Errors leave the candidate queued for another attempt; no event is discarded.
  const symbol=await publicClient.readContract({address:c.token as Address,abi:erc20,functionName:"symbol"});
  const decimals=await publicClient.readContract({address:c.token as Address,abi:erc20,functionName:"decimals"});
  if(!Number.isInteger(decimals)||decimals<0||decimals>36)throw new Error("Unsupported token decimals");
  return {symbol:symbol.replace(/[\x00-\x1f\x7f]/g,"").slice(0,24)||c.token.slice(0,8),decimals};
}

export async function ingestPools(candidates:Candidate[],discoveredThrough:bigint):Promise<Candidate[]> {
  const eligible=candidates.filter(c=>c.decimals!==undefined && (c.swapCursor===null?BigInt(c.block):BigInt(c.swapCursor)+1n)<=discoveredThrough);
  if(!eligible.length)return [];
  const from=eligible.reduce((min,c)=>{const n=c.swapCursor===null?BigInt(c.block):BigInt(c.swapCursor)+1n;return n<min?n:min;},discoveredThrough);
  const to=from+RANGE-1n<discoveredThrough?from+RANGE-1n:discoveredThrough;
  const active=eligible.filter(c=>(c.swapCursor===null?BigInt(c.block):BigInt(c.swapCursor)+1n)<=to);
  const blocks=new Map<string,Awaited<ReturnType<typeof publicClient.getBlock>>>();
  const getBlock=async(n:bigint)=>{const key=String(n);if(!blocks.has(key))blocks.set(key,await publicClient.getBlock({blockNumber:n}));return blocks.get(key)!;};
  // A shared block anchor validates all pools at the same cursor with one read.
  for(const c of active)if(c.swapCursor!==null){const b=await getBlock(BigInt(c.swapCursor));if(b.hash!==c.swapHash)throw new Error("Chain history changed at market cursor");}
  const logs=(await Promise.all(logRanges(from,to).map(range=>publicClient.getLogs({address:active.map(c=>c.pool as Address),event:swapEvent,...range,strict:true})))).flat();
  const byPool=new Map(active.map(c=>[c.pool,c]));const swapped=new Map<string,Swap[]>();
  for(const l of logs){
    const c=byPool.get(addr(l.address));if(!c)continue;
    if(l.removed||l.blockNumber===null||!l.blockHash||!l.transactionHash||l.logIndex===null)throw new Error("Incomplete swap event");
    if(l.blockNumber<(c.swapCursor===null?BigInt(c.block):BigInt(c.swapCursor)+1n))continue;
    const b=await getBlock(l.blockNumber);if(b.hash!==l.blockHash)throw new Error("Chain history changed during swap read");
    const tokenIs0=addr(c.token0)===addr(c.token);
    const tokenRaw=tokenIs0?l.args.amount0:l.args.amount1,wethRaw=tokenIs0?l.args.amount1:l.args.amount0;
    if(tokenRaw===0n||wethRaw===0n||(tokenRaw>0n)===(wethRaw>0n))continue;
    const tokenQty=Math.abs(Number(formatUnits(tokenRaw,c.decimals!))),volumeEth=Math.abs(Number(formatEther(wethRaw))),priceEth=volumeEth/tokenQty;
    if(!Number.isFinite(priceEth)||priceEth<=0||!Number.isFinite(volumeEth))throw new Error("Invalid decoded swap price");
    const rows=swapped.get(c.pool)??[];rows.push({id:`${l.transactionHash}:${l.logIndex.toString().padStart(8,"0")}`,block:String(l.blockNumber),logIndex:l.logIndex,t:Number(b.timestamp)*1000,priceEth,volumeEth,side:wethRaw>0n?"BUY":"SELL"});swapped.set(c.pool,rows);
  }
  const b=await getBlock(to);if(!b.hash)throw new Error("Missing swap anchor");
  const result:Candidate[]=[];
  for(const c of active){
    const first=c.swapFromAt??Number((await getBlock(BigInt(c.block))).timestamp)*1000;
    result.push({...appendSwaps(c,swapped.get(c.pool)??[],to,b.hash,Date.now(),Number(b.timestamp)*1000),swapFromAt:first});
  }
  return result;
}

/** Existing watchlist pools are sourced from getPool, never presented as newly created. */
export async function configuredPool(token:Address,fee:number,symbol:string,decimals:number):Promise<Candidate|null>{
  const factoryAbi=parseAbi(["function getPool(address,address,uint24) view returns (address)"]);
  const pool=await publicClient.readContract({address:CONTRACTS.uniswapV3Factory as Address,abi:factoryAbi,functionName:"getPool",args:[token,CONTRACTS.weth as Address,fee]});
  if(/^0x0{40}$/i.test(pool))return null;
  const head=await publicClient.getBlockNumber({cacheTime:0});const from=head>2000n?head-2000n:0n;const b=await publicClient.getBlock({blockNumber:from});
  if(!b.hash)throw new Error("Missing pool history anchor");
  return {origin:"factory_lookup",pool:addr(pool),token:addr(token),token0:addr(token)<addr(CONTRACTS.weth)?addr(token):addr(CONTRACTS.weth),fee,block:String(from),blockHash:b.hash,tx:null,logIndex:0,createdAt:0,discoveredAt:Date.now(),symbol,decimals,activeSince:0,lastSelectedAt:0,lastSampledAt:0,swapCursor:null,swapHash:null,swapThroughAt:null,swaps:[],quotes:[],liquidityRaw:null,poolWeth:null,poolToken:null,statsAt:null,status:"queued",error:null};
}

export async function poolStats(c:Candidate):Promise<Pick<Candidate,"liquidityRaw"|"poolWeth"|"poolToken"|"statsAt">> {
  const address=c.pool as Address;
  const at=await publicClient.getBlockNumber({cacheTime:0});
  const liquidity=await publicClient.readContract({address,abi:poolAbi,functionName:"liquidity",blockNumber:at});
  const weth=await publicClient.readContract({address:CONTRACTS.weth as Address,abi:erc20,functionName:"balanceOf",args:[address],blockNumber:at});
  const token=await publicClient.readContract({address:c.token as Address,abi:erc20,functionName:"balanceOf",args:[address],blockNumber:at});
  return {liquidityRaw:String(liquidity),poolWeth:Number(formatEther(weth)),poolToken:Number(formatUnits(token,c.decimals!)),statsAt:Date.now()};
}
