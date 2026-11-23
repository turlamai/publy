// Verify built CLI output and captured requests, never real publishing services.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const entry=path.join(root,'packages/cli/dist/index.js');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'publy-operation-options-'));
const requests=[];
const server=http.createServer(async(req,res)=>{
  let raw=''; for await(const part of req) raw+=part;
  assert.equal(req.url,'/v1/publish');
  requests.push(JSON.parse(raw));
  res.setHeader('content-type','application/json');
  res.end(JSON.stringify({mediaId:'SYNTHETIC_DRAFT',requestId:requests.at(-1).idempotencyKey}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const config=path.join(dir,'config.json');
fs.writeFileSync(config,JSON.stringify({server:`http://127.0.0.1:${server.address().port}`,api_key:'synthetic-key',accounts:[{name:'fixture'}]}));
const run=(...args)=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[entry,...args],{env:{...process.env,PUBLY_CONFIG:config}});
  let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
  const timer=setTimeout(()=>{child.kill();reject(Error('CLI timeout'));},45000);
  child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
});
const canary='PRIVATE_NOTE_PROPERTY_MUST_NOT_ESCAPE_20261123';
const envelope=`---\ntitle: ${canary}\ncaption: ${canary}\nauthor: ${canary}\ndigest: ${canary}\ntags: [${canary}]\ntype: image\nmode: cards\ntheme: ../${canary}\ncover: /${canary}.png\ntypora-root-url: /${canary}\ninvalid-yaml: [broken\n---\n`;
const note=path.join(dir,'note.md');
const caption=path.join(dir,'caption.txt');fs.writeFileSync(caption,'Explicit caption\n#Chosen');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
fs.writeFileSync(path.join(dir,'cover.png'),png);
const scan=(value)=>assert.ok(!JSON.stringify(value).includes(canary),'private properties leaked into output or request');
try {
 for(const format of ['article','image','cards']) {
  const body=format==='cards'?'## cover\nTitle\n\n## point\nDetail\n\n## ending\nThanks':'# Body title\n\nBody paragraph\n\n![image](cover.png)';
  fs.writeFileSync(note,envelope+body);
  const options=['--format',format,'--title','Operation title','--cover','cover.png','--author','Chosen author','--digest','Chosen summary','--caption-file',caption,'--theme',format==='cards'?'naive':'claude'];
  for(const command of ['check','preview']) {
   const result=await run(command,note,...options,'--json');scan(result);
   assert.equal(result.code,0,result.stderr);const report=JSON.parse(result.stdout);
   assert.equal(report.title,'Operation title');assert.equal(report.format,format);
   if(report.output)scan(fs.readFileSync(report.output,'utf8'));
  }
  const published=await run('publish',note,...options,'--account','fixture','--json');scan(published);
  assert.equal(published.code,0,published.stderr);assert.equal(JSON.parse(published.stdout).status,'confirmed');
  const withProperties=requests.at(-1);scan(withProperties);
  assert.equal(withProperties.title,'Operation title');assert.equal(withProperties.author,'Chosen author');assert.equal(withProperties.digest,'Chosen summary');
  if(format!=='article')assert.match(withProperties.html,/Explicit caption/);
  fs.writeFileSync(note,body);
  const repeated=await run('publish',note,...options,'--account','fixture','--json');assert.equal(repeated.code,0,repeated.stderr);
  assert.deepEqual(requests.at(-1),withProperties,'ignored properties must not change rendered bytes or request identity');
 }
 const count=requests.length;
 const missing=await run('publish',note,'--account','fixture','--json');
 assert.equal(missing.code,2);assert.equal(JSON.parse(missing.stdout).code,'FORMAT_REQUIRED');
 const conflict=await run('publish',note,'--format','article','--account','fixture','--caption','x','--caption-file',caption,'--json');
 assert.equal(conflict.code,2);assert.equal(JSON.parse(conflict.stdout).code,'CAPTION_INVALID');
 fs.writeFileSync(note,`---\nprivate: ${canary}\n`);
 for(const command of ['check','preview','render','card','publish']) {
  const result=await run(command,note,...(command==='publish'?['--account','fixture','--format','article']:[]),'--json');
  scan(result);assert.notEqual(result.code,0);
 }
 assert.equal(requests.length,count,'invalid options must never submit');
 console.log('PASS — article/image/cards: explicit parameters, private-property output scans, identical request bytes, caption files, missing format and no-submit errors');
} finally {await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
