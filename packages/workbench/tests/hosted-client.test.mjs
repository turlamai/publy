import {test} from "node:test";
import assert from "node:assert/strict";
import {createHostedClient,HOSTED_ORIGIN} from "../src/hosted-client.mjs";
const id="1234567890abcdef1234567890abcdef";
const prepared=Object.freeze({id,body:JSON.stringify({idempotencyKey:id,account:"A",title:"T"}),account:"A",title:"T"});
const response=(data,ok=true,status=200)=>({ok,status,json:async()=>data});
test("account query uses only the fixed origin and header credentials",async()=>{
 const client=createHostedClient("secret",async(url,opts)=>{
  assert.equal(url,HOSTED_ORIGIN+"/v1/accounts");assert.equal(opts.headers["x-api-key"],"secret");assert.equal(opts.redirect,"error");assert.equal(opts.credentials,"omit");
  return response({accounts:[{name:"A"},{name:"A"}]});
 });
 assert.deepEqual(await client.accounts(),["A"]);
});
test("submit requires approval, never retries and reconciles by original identity",async()=>{
 let calls=0;
 const client=createHostedClient("secret",async(url,opts)=>{
  calls++;
  if(opts.method==="POST"){assert.equal(opts.body,prepared.body);throw Error("lost response");}
  assert.equal(url,HOSTED_ORIGIN+"/v1/publish-result/"+id);
  return response({status:"confirmed",requestId:id,account:"A",title:"T",mediaId:"draft"});
 });
 await assert.rejects(client.submit(prepared,"wrong"),/CONFIRMATION_REQUIRED/);
 assert.equal(calls,0);
 assert.deepEqual(await client.submit(prepared,id),{status:"unknown",requestId:id});
 assert.equal(calls,1);
 assert.deepEqual(await client.reconcile(prepared),{status:"confirmed",requestId:id,mediaId:"draft"});
 assert.equal(calls,2);
});
test("wrong account or request identity never confirms a draft",async()=>{
 const client=createHostedClient("secret",async()=>response({status:"confirmed",requestId:id,account:"B",title:"T",mediaId:"draft"}));
 assert.equal((await client.submit(prepared,id)).status,"unknown");
 assert.equal((await client.reconcile(prepared)).status,"unknown");
});
