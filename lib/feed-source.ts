/** A configured server origin only. Request parameters never select destinations. */
export function feedOrigin(): {url:string;transport:"direct"|"archive"} {
 const raw=process.env.ROBINFLY_FEED_ORIGIN || (process.env.NODE_ENV==="development"?"http://127.0.0.1:8787":null);
 if(!raw)return {url:"https://raw.githubusercontent.com/plantsweb3/trenchfly/feed",transport:"archive"};
 const url=new URL(raw);
 if(url.username||url.password||url.search||url.hash||url.pathname!=="/"||!(url.protocol==="https:"||(process.env.NODE_ENV!=="production"&&url.protocol==="http:"&&["127.0.0.1","localhost"].includes(url.hostname))))throw new Error("Invalid telemetry origin");
 return {url:url.origin,transport:"direct"};
}
