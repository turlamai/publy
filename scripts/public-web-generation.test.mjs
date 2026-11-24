// Windows checkouts must not change the bytes embedded in the installed server.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('public web generation is stable across LF/CRLF checkouts and still rejects content drift',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'publy-web-generation-'));
 try{
  for(const sub of ['scripts','docs','design/prototype','packages/server/src'])fs.mkdirSync(path.join(dir,sub),{recursive:true});
  fs.copyFileSync(path.join(root,'scripts/sync-public-web.mjs'),path.join(dir,'scripts/sync-public-web.mjs'));
  const inputs=['public-web.css','public-web.js','setup.html'];
  for(const name of inputs)fs.copyFileSync(path.join(root,'design/prototype',name),path.join(dir,'design/prototype',name));
  const run=(...args)=>execFileSync(process.execPath,[path.join(dir,'scripts/sync-public-web.mjs'),...args],{stdio:'pipe'});
  run();
  const generated=path.join(dir,'packages/server/src/web-assets.ts'),first=fs.readFileSync(generated,'utf8');
  for(const file of [...inputs.map(n=>path.join(dir,'design/prototype',n)),generated,path.join(dir,'docs/web.css'),path.join(dir,'docs/site.js')]){
   fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n').replace(/\n/g,'\r\n'));
  }
  run('--check');run();assert.equal(fs.readFileSync(generated,'utf8'),first);
  fs.appendFileSync(path.join(dir,'design/prototype/public-web.css'),'\n/* changed */\n');
  assert.throws(()=>run('--check'),/Command failed/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
