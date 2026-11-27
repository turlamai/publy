import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {buildApp} from "./index.js";
import {WORKBENCH_ORIGIN} from "./workbench-cors.js";

test("workbench CORS permits only exact public origin and required endpoints, without bypassing auth",async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"publy-cors-"));
 const app=buildApp({port:0,apiKey:"test-key",accounts:[],dataDir:dir});
 try{
  await app.ready();
  const preflight=(url:string,method:string,origin=WORKBENCH_ORIGIN,headers="x-api-key, content-type")=>app.inject({method:"OPTIONS",url,headers:{origin,"access-control-request-method":method,"access-control-request-headers":headers}});
  for(const [url,method] of [["/v1/accounts","GET"],["/v1/publish","POST"],["/v1/publish-result/"+"a".repeat(32),"GET"]]){
   const res=await preflight(url,method);assert.equal(res.statusCode,204);assert.equal(res.headers["access-control-allow-origin"],WORKBENCH_ORIGIN);assert.equal(res.headers["access-control-allow-methods"],method);
   assert.equal(res.headers["access-control-allow-credentials"],undefined);
  }
  for(const res of [await preflight("/v1/publish","POST","https://publy.jrtx.site.evil.test"),await preflight("/v1/publish","POST","null"),await preflight("/v1/publish","DELETE"),await preflight("/v1/publish","POST",WORKBENCH_ORIGIN,"authorization"),await preflight("/v1/admin/users","POST")]){
   assert.notEqual(res.statusCode,204);assert.equal(res.headers["access-control-allow-origin"],undefined);
  }
  const bad=await app.inject({method:"GET",url:"/v1/accounts",headers:{origin:WORKBENCH_ORIGIN}});
  assert.equal(bad.statusCode,401);assert.equal(bad.headers["access-control-allow-origin"],WORKBENCH_ORIGIN);
  const ok=await app.inject({method:"GET",url:"/v1/accounts",headers:{origin:WORKBENCH_ORIGIN,"x-api-key":"test-key"}});
  assert.equal(ok.statusCode,200);assert.equal(ok.headers["access-control-allow-origin"],WORKBENCH_ORIGIN);
  const native=await app.inject({method:"GET",url:"/v1/accounts",headers:{"x-api-key":"test-key"}});
  assert.equal(native.statusCode,200);assert.equal(native.headers["access-control-allow-origin"],undefined);
 }finally{await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
