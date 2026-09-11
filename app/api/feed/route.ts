import { NextResponse } from "next/server";
import {feedOrigin} from "../../../lib/feed-source";
export const dynamic="force-dynamic";
export async function GET() {
 try {
  const source=feedOrigin();
  const res=await fetch(`${source.url}/latest.json`,{next:{revalidate:source.transport==="direct"?2:30},redirect:"error",signal:AbortSignal.timeout(6000)});
  if(!res.ok)return NextResponse.json({session:null,transport:source.transport},{headers:{"Cache-Control":"no-store"}});
  const body=await res.text();if(body.length>1_000_000)throw new Error("Feed too large");
  return NextResponse.json({session:JSON.parse(body),transport:source.transport},{headers:{"Cache-Control":"public,max-age=1,s-maxage=2,stale-while-revalidate=2"}});
 } catch {return NextResponse.json({session:null},{headers:{"Cache-Control":"no-store"}});}
}
