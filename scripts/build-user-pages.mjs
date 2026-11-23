// Branded reading pages generated from the paired Markdown documentation.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'packages/core/package.json'));
const MarkdownIt=require('markdown-it');
const md=new MarkdownIt({html:false,linkify:false});
md.renderer.rules.heading_open=(tokens,idx)=>{
  const text=tokens[idx+1]?.content||'';
  const id=text.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu,'').replace(/ /g,'-');
  return '<'+tokens[idx].tag+' id="'+md.utils.escapeHtml(id)+'">';
};
const names={'wechat-setup':'wechat','USER-GUIDE':'user-guide','terms':'terms','privacy':'privacy'};
function rewrite(source){return source.replaceAll('](../LICENSE)','](https://github.com/turlamai/publy/blob/main/LICENSE)').replace(/\]\(([^)]+\.md)(#[^)]*)?\)/g,(whole,link,hash='')=>{
  const name=path.basename(link).replace(/\.zh-CN(?=\.md$)/,'').replace(/\.md$/,'');
  return names[name]?`](${names[name]}.html${link.includes('.zh-CN.')?'?lang=zh':''}${hash})`:`](https://github.com/turlamai/publy/blob/main/${link.startsWith('../')?link.slice(3):'docs/'+link}${hash})`;
});}
let stale=false;
for(const [source,target] of Object.entries(names)){
  const english=md.render(rewrite(fs.readFileSync(path.join(root,'docs',source+'.md'),'utf8')));
  const chinese=md.render(rewrite(fs.readFileSync(path.join(root,'docs',source+'.zh-CN.md'),'utf8')));
  const title={'wechat':'Connect WeChat · 连接公众号','user-guide':'User guide · 使用指南',terms:'Terms · 服务条款',privacy:'Privacy · 隐私'}[target];
  const html=`<!doctype html><html lang="en" class="publy-web"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Publy</title><link rel="stylesheet" href="web.css"><script src="site.js" defer></script></head><body><main class="pw-wrap"><nav class="pw-nav" aria-label="Publy"><a href="index.html">Publy</a><div class="pw-actions"><a href="start.html"><span data-lang="en">Start</span><span data-lang="zh">开始使用</span></a><a href="hosted.html"><span data-lang="en">Hosted status</span><span data-lang="zh">托管状态</span></a><button class="secondary" data-switch="en">EN</button><button class="secondary" data-switch="zh">中文</button><button class="secondary" data-theme-switch aria-pressed="false">Light / dark · 亮 / 暗</button></div></nav><article class="pw-prose"><div data-lang="en">${english}</div><div data-lang="zh">${chinese}</div></article><footer class="pw-step"><a href="wechat.html">WeChat setup · 公众号连接</a> · <a href="user-guide.html">User guide · 使用指南</a> · <a href="privacy.html">Privacy · 隐私</a> · <a href="terms.html">Terms · 条款</a></footer></main></body></html>\n`;
  const file=path.join(root,'docs',target+'.html');
  if(process.argv.includes('--check')){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==html){console.error('Stale user page: '+target);stale=true}}
  else fs.writeFileSync(file,html);
}
if(stale)process.exitCode=1;
