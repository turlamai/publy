// Real Chromium, synthetic hosted responses only. Never contact production or WeChat.
import {createRequire} from "node:module";
const {chromium}=createRequire(import.meta.url)("playwright");
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
const root=new URL("../dist/",import.meta.url);
const mime={"index.html":"text/html","workbench.js":"text/javascript","workbench.css":"text/css","workbench-math.js":"text/javascript","workbench-cards.js":"text/javascript"};
const server=createServer(async(req,res)=>{
 const name=req.url==="/"? "index.html":req.url?.slice(1);
 if(!Object.hasOwn(mime,name)){res.writeHead(404).end();return;}
 try{res.writeHead(200,{"content-type":mime[name]});res.end(await readFile(new URL(name,root)));}catch{res.writeHead(500).end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.PUBLY_TEST_CHROMIUM});
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
   if(last.type==="image_post"){
    assert.equal(last.images.length,3);
    assert.equal(last.cover,"card-01-cover.png");
    assert.match(last.html,/A caption/);
    return route.fulfill({json:{requestId:last.idempotencyKey,account:last.account,title:last.title,mediaId:"synthetic-cards"},headers:cors});
   }
   assert.equal(last.account,"Test account");assert.equal(last.title,"Sample");
   assert.match(last.html,/<strong[^>]*>bold<\/strong>/);
   assert.match(last.html,/style=/);
   assert.equal(last.images.length,2);
   assert.ok(last.images.every(image=>image.contentType==="image/png"&&image.data.startsWith("iVBORw0KGgo")));
   assert.match(last.idempotencyKey,/^[a-f0-9]{32}$/);
   return route.abort("failed");
  }
  if(url.pathname==="/v1/publish-result/"+last?.idempotencyKey)return route.fulfill({json:{status:"confirmed",requestId:last.idempotencyKey,account:last.account,title:last.title,mediaId:"synthetic-draft"},headers:cors});
  return route.abort();
 });
 const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(origin);
 await page.locator("#source").fill("# Sample\n\nHello **bold**. $x^2$\n\n$$\\frac{1}{2}$$");
 await page.frameLocator("#preview").locator("strong").waitFor();
 assert.equal(await page.frameLocator("#preview").locator("strong").textContent(),"bold");
 // Sandbox must remain opaque, and no author-supplied executable HTML reaches it.
 assert.equal(await page.locator("#preview").getAttribute("sandbox"),"");
 assert.equal(await page.frameLocator("#preview").locator("h1").count(),1);
 const formulas=page.frameLocator("#preview").locator("img.publy-math");
 assert.equal(await formulas.count(),2);
 assert.ok(await formulas.evaluateAll(nodes=>nodes.every(node=>node.src.startsWith("data:image/png;")&&node.naturalWidth>0)));
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
 const second=await context.newPage();second.on("pageerror",e=>errors.push(e.message));await second.goto(origin);
 await second.locator("#draft-open").filter({hasText:"Recover pending draft"}).click();
 await second.locator("#draft-key").fill("synthetic-key");
 await second.locator("#draft-reconcile").click();
 await second.locator("#draft-status").filter({hasText:"Draft creation confirmed"}).waitFor();
 assert.equal(posts,1,"recovery must be read-only");
 assert.equal(await second.evaluate(()=>localStorage.getItem("publy.pending-draft.v1")),null);
 await second.locator("#draft-close").click();
 await second.locator("#format").selectOption("cards");
 await second.locator("#source").fill("A caption\n\n## cover\n咖啡 Coffee\n\n## point\nA tip\n\n## ending\nThanks");
 try{await second.locator("#card-strip img").nth(2).waitFor({timeout:8000});}
 catch(error){throw Error(await second.locator("#status").textContent(),{cause:error});}
 const card=second.locator("#card-strip img").first();
 assert.deepEqual(await card.evaluate(img=>[img.naturalWidth,img.naturalHeight]),[1080,1440]);
 const [download]=await Promise.all([second.waitForEvent("download"),second.locator("#card-strip a").first().click()]);
 assert.equal(download.suggestedFilename(),"card-01-cover.png");
 assert.equal(await second.locator("#card-caption").textContent(),"A caption");
 assert.equal(posts,1,"card preview and download must not submit");
 await second.locator("#draft-open").click();
 await second.locator("#draft-key").fill("synthetic-key");
 await second.locator("#draft-connect").click();
 await second.locator("#draft-review").click();
 await second.locator("#draft-summary").filter({hasText:"Image cards"}).waitFor();
 assert.equal(posts,1,"card review must not submit");
 await second.locator("#draft-send").click();
 await second.locator("#draft-status").filter({hasText:"Draft creation confirmed"}).waitFor();
 assert.equal(posts,2);
 assert.deepEqual(errors,[]);
 console.log("Chromium workbench delivery/recovery smoke passed");
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
