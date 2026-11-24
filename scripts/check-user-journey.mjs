// Keep public navigation usable after Markdown-to-HTML generation and locale changes.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'packages/core/package.json'));
const {load}=require('cheerio');
const pages=['index','start','hosted','api','wechat','user-guide','terms','privacy'];
let errors=[];
for(const page of pages){
 const $=load(fs.readFileSync(path.join(root,'docs',page+'.html'),'utf8'));
 if(!$('html').hasClass('publy-web')||!$('link[href="web.css"]').length)errors.push(page+': shared appearance missing');
 $('a[href]').each((_i,el)=>{
  const href=$(el).attr('href');if(!href||/^(https?:|mailto:|data:|\/)/.test(href))return;
  const url=new URL(href,'https://example.test/'+page+'.html');
  const target=path.join(root,'docs',decodeURIComponent(url.pathname));
  if(!fs.existsSync(target)){errors.push(page+': missing '+href);return;}
  if(url.hash&&target.endsWith('.html')){
   const doc=load(fs.readFileSync(target,'utf8')),id=decodeURIComponent(url.hash.slice(1));
   if(!doc('[id]').toArray().some(el=>doc(el).attr('id')===id))errors.push(page+': missing anchor '+href);
  }
 });
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1}else console.log('PASS — 8 public pages share appearance and resolve local navigation.');
