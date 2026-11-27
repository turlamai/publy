// Real Chromium, synthetic hosted responses only. Never contact production or WeChat.
import {createRequire} from "node:module";
const {chromium}=createRequire(import.meta.url)("playwright");
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
const root=new URL("../dist/",import.meta.url);
const mime={"index.html":"text/html","workbench.js":"text/javascript","workbench.css":"text/css"};
const server=createServer(async(req,res)=>{
 const name=req.url==="/"? "index.html":req.url?.slice(1);
 if(!Object.hasOwn(mime,name)){res.writeHead(404).end();return;}
 try{res.writeHead(200,{"content-type":mime[name]});res.end(await readFile(new URL(name,root)));}catch{res.writeHead(500).end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({locale:"en-US"});
 let posts=0,last=null;
 const cors={"access-control-allow-origin":origin,"access-control-allow-headers":"x-api-key, content-type","access-control-allow-methods":"GET, POST, OPTIONS"};
 await context.route("**/*",async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===origin)return route.continue();
  if(url.origin!=="https://publy-api.jrtx.site")return route.abort();
  if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:cors});
  assert.equal(req.headers()["x-api-key"],"synthetic-key");
  if(url.pathname==="/v1/accounts")return route.fulfill({json:{accounts:[{name:"Test account"}]},headers:cors});
  if(url.pathname==="/v1/publish"&&req.method()==="POST"){
   posts++;last=req.postDataJSON();
   assert.equal(last.account,"Test account");assert.equal(last.title,"Sample");
   assert.match(last.html,/<strong[^>]*>bold<\/strong>/);
   assert.match(last.html,/style=/);
   assert.match(last.idempotencyKey,/^[a-f0-9]{32}$/);
   return route.abort("failed");
  }
  if(url.pathname==="/v1/publish-result/"+last?.idempotencyKey)return route.fulfill({json:{status:"confirmed",requestId:last.idempotencyKey,account:last.account,title:last.title,mediaId:"synthetic-draft"},headers:cors});
  return route.abort();
 });
 const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(origin);
 await page.locator("#source").fill("# Sample\n\nHello **bold**.");
 await page.frameLocator("#preview").locator("strong").waitFor();
 assert.equal(await page.frameLocator("#preview").locator("strong").textContent(),"bold");
 // Sandbox must remain opaque, and no author-supplied executable HTML reaches it.
 assert.equal(await page.locator("#preview").getAttribute("sandbox"),"");
 assert.equal(await page.frameLocator("#preview").locator("h1").count(),1);
 await page.locator("#draft-open").click();
 await page.locator("#draft-key").fill("synthetic-key");
 await page.locator("#draft-connect").click();
 await page.locator("#draft-account option").waitFor({state:"attached"});
 await page.locator("#draft-review").click();
 await page.locator("#draft-send").waitFor({state:"visible"});
 assert.equal(posts,0,"review must not publish");
 await page.locator("#draft-send").click();
 await page.locator("#draft-status").filter({hasText:"Outcome not confirmed"}).waitFor();
 assert.equal(posts,1);
 const metadata=await page.evaluate(()=>localStorage.getItem("publy.pending-draft.v1"));
 assert.deepEqual(JSON.parse(metadata),{id:last.idempotencyKey,account:"Test account",title:"Sample"});
 const second=await context.newPage();await second.goto(origin);
 await second.locator("#draft-open").filter({hasText:"Recover pending draft"}).click();
 await second.locator("#draft-key").fill("synthetic-key");
 await second.locator("#draft-reconcile").click();
 await second.locator("#draft-status").filter({hasText:"Draft creation confirmed"}).waitFor();
 assert.equal(posts,1,"recovery must be read-only");
 assert.equal(await second.evaluate(()=>localStorage.getItem("publy.pending-draft.v1")),null);
 assert.deepEqual(errors,[]);
 console.log("Chromium workbench delivery/recovery smoke passed");
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
