import {createHash} from "node:crypto";
import {feedOrigin} from "../../../../lib/feed-source";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{sha:string}>}){
 const {sha}=await params;if(!/^[a-f0-9]{64}$/.test(sha))return new Response(null,{status:404});
 try{
  const source=feedOrigin();
  const origins=[source.url,...(source.transport==="direct"?["https://raw.githubusercontent.com/plantsweb3/trenchfly/feed"]:[])];
  for(const origin of origins){
   try{
    const res=await fetch(`${origin}/frames/${sha}.png`,{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(5000)});
    if(!res.ok)continue;
    const data=await res.arrayBuffer();
    if(data.byteLength>1_000_000||createHash("sha256").update(new Uint8Array(data)).digest("hex")!==sha)continue;
    return new Response(data,{headers:{"Content-Type":"image/png","Cache-Control":"public,max-age=31536000,immutable"}});
   }catch{continue;}
  }
 }catch{/* No endpoint configuration is returned to visitors. */}
 return new Response(null,{status:404});
}
