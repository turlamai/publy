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
  return names[name]?`](${names[name]}.html${link.includes('.zh-CN.')?'?lang=zh':'?lang=en'}${hash})`:`](https://github.com/turlamai/publy/blob/main/${link.startsWith('../')?link.slice(3):'docs/'+link}${hash})`;
});}
let stale=false;
for(const [source,target] of Object.entries(names)){
  const english=md.render(rewrite(fs.readFileSync(path.join(root,'docs',source+'.md'),'utf8')));
  const chinese=md.render(rewrite(fs.readFileSync(path.join(root,'docs',source+'.zh-CN.md'),'utf8')));
  const title={'wechat':'Connect WeChat · 连接公众号','user-guide':'User guide · 使用指南',terms:'Terms · 服务条款',privacy:'Privacy · 隐私'}[target];
  const html=`<!doctype html><html lang="en" class="publy-web"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Publy</title><link rel="stylesheet" href="family.css"><link rel="stylesheet" href="web.css"><style>.publy-web body{background:var(--kit-bg)}.publy-web .kit-brand,.publy-web .kit-brand span{color:var(--kit-text)}.publy-web .kit-nav-links a{color:var(--kit-text-2)}.publy-web .kit-nav-links a:hover{color:var(--kit-text);text-decoration:none}.publy-web .kit-nav .pw-actions{margin:0}.publy-web .kit-nav-actions .theme-toggle{width:42px;min-height:42px;padding:0;border-radius:999px;margin-top:0}.publy-web h1{font-family:var(--kit-font-display);font-weight:600;letter-spacing:-0.01em}</style><script src="site.js" defer></script><meta name="theme-color" content="#D97757"><link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2217%22%20fill%3D%22%23D97757%22%2F%3E%3Cpath%20d%3D%22M32%2048V18M20%2029l12-12%2012%2012%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E"></head><body><header class="kit-nav"><div class="kit-container kit-nav-inner"><a class="kit-brand" href="index.html"><svg class="kit-brand-mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="17" fill="#D97757"/><path d="M32 48V18M20 29l12-12 12 12" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Publy</span></a><nav class="kit-nav-links"><a href="start.html"><span data-lang="en">Start</span><span data-lang="zh">开始使用</span></a><a href="hosted.html"><span data-lang="en">Pricing</span><span data-lang="zh">购买</span></a></nav><div class="kit-nav-actions"><div class="pw-actions"><button class="secondary" data-switch="en">EN</button><button class="secondary" data-switch="zh">中文</button><button class="secondary theme-toggle" type="button" data-theme-switch aria-pressed="false" title="切换亮暗主题" aria-label="切换亮暗主题"></button></div></div></div></header><main class="pw-wrap"><article class="pw-prose"><div data-lang="en">${english}</div><div data-lang="zh">${chinese}</div></article><footer class="pw-step"><a href="wechat.html">WeChat setup · 公众号连接</a> · <a href="user-guide.html">User guide · 使用指南</a> · <a href="privacy.html">Privacy · 隐私</a> · <a href="terms.html">Terms · 条款</a></footer></main></body></html>\n`;
  const file=path.join(root,'docs',target+'.html');
  if(process.argv.includes('--check')){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')!==html){console.error('Stale user page: '+target);stale=true}}
  else fs.writeFileSync(file,html);
}
if(stale)process.exitCode=1;
