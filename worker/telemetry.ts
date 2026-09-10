/** Public, read-only telemetry on loopback by default. Never returns configuration. */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FeedPayload } from "./feed";
export function writeLocalTelemetry(runs:string,payload:FeedPayload) {
  mkdirSync(runs,{recursive:true});const path=join(runs,"latest.json"),tmp=path+".tmp";
  writeFileSync(tmp,JSON.stringify({...payload,updatedAt:new Date().toISOString()}),{mode:0o600});renameSync(tmp,path);
}
export function startTelemetryServer(runs:string) {
  const port=Number(process.env.ROBINFLY_TELEMETRY_PORT??8787);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error("Invalid telemetry port");
  const server=createServer((req,res)=>{
    if(req.method!=="GET"){res.writeHead(405).end();return;}
    if(req.url==="/health" || req.url==="/latest.json"){
      try {
        const data=JSON.parse(readFileSync(join(runs,"latest.json"),"utf8"));
        if(req.url==="/health"){
          const age=Date.now()-Date.parse(data.discovery?.lastIngestionAt??data.updatedAt);
          const healthy=age>=0&&age<120_000&&!["stopped","degraded"].includes(data.status);
          res.writeHead(healthy?200:503,{"Content-Type":"application/json","Cache-Control":"no-store"}).end(JSON.stringify({healthy,mode:data.mode,status:data.status,ingestionAgeMs:age}));
        }else res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"}).end(JSON.stringify(data));
      }catch{res.writeHead(503).end('{"healthy":false}');}return;
    }
    const frame=/^\/frames\/([a-f0-9]{64})\.png$/.exec(req.url??"");
    if(frame){const path=join(runs,"..","..","brain","runs","frames",frame[1]+".png");if(existsSync(path)){res.writeHead(200,{"Content-Type":"image/png","Cache-Control":"public,max-age=31536000,immutable"}).end(readFileSync(path));return;}}
    res.writeHead(404).end();
  });
  server.on("error",()=>{console.error("Telemetry listener unavailable; worker feed files remain available.");});
  server.listen(port,process.env.ROBINFLY_TELEMETRY_BIND??"127.0.0.1");
  return server;
}
