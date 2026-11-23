// Browser fixture for the real operation-dialog component, not an Obsidian host.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'packages/obsidian-plugin/package.json'));
const {build}=require('esbuild');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'publy-operation-dialog-'));
const host=`
export class Modal {
 constructor(){this.dialog=document.createElement('dialog');this.contentEl=document.createElement('div');this.dialog.append(this.contentEl);this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.close()});}
 open(){document.body.append(this.dialog);this.dialog.showModal();this.onOpen()}
 close(){this.dialog.close();this.onClose();this.dialog.remove();document.querySelector('#open').focus()}
}
export class App{};export class TFile{};export class Notice{};export function setIcon(){}
`;
await build({stdin:{contents:`import {PublicationOptionsModal} from './packages/obsidian-plugin/src/modals.ts';import {setLanguage} from './packages/obsidian-plugin/src/i18n.ts';setLanguage('zh');document.querySelector('#open').onclick=()=>new PublicationOptionsModal({},'示例笔记','测试公众号',{format:'article',title:'草稿标题'},result=>{document.querySelector('#result').textContent=JSON.stringify({submitted:false,result},null,2)}).open();`,resolveDir:root},bundle:true,platform:'browser',format:'esm',outfile:path.join(dir,'bundle.js'),plugins:[{name:'fixture-host',setup(b){b.onResolve({filter:/^(obsidian|@publy\/core|node:crypto|node:path)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='obsidian'?host:a.path==='@publy/core'?'export function generateTitleCover(){return null}':'export default {};',loader:'js'}));}}]});
const css=fs.readFileSync(path.join(root,'packages/obsidian-plugin/styles.css'),'utf8');
const html=`<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Publy 本次投递窗口 · 组件验收</title><style>
:root{font:14px/1.5 system-ui;color-scheme:light;--background-primary:#fff;--background-secondary:#f5f5f5;--text-normal:#252525;--text-muted:#666;--background-modifier-border:#ddd;--interactive-accent:#087f45;--text-on-accent:white}
body{padding:24px;background:var(--background-secondary);color:var(--text-normal)}body.dark{color-scheme:dark;--background-primary:#242424;--background-secondary:#171717;--text-normal:#eee;--text-muted:#aaa;--background-modifier-border:#555}
dialog{box-sizing:border-box;width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;padding:24px;border:1px solid var(--background-modifier-border);border-radius:12px;background:var(--background-primary);color:var(--text-normal)}dialog::backdrop{background:#0006}h3{margin:0;font-size:18px}button,input,select,textarea{font:inherit;padding:8px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-primary);color:inherit}button{cursor:pointer;min-height:36px}input,textarea{box-sizing:border-box;width:100%}.mod-cta{background:#087f45;color:white}pre{white-space:pre-wrap;overflow-wrap:anywhere}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #087f45;outline-offset:2px}.publy-modal-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
${css}</style><h1>Publy 投递窗口组件验收</h1><p>真实组件，浏览器宿主模拟；不连接 Obsidian 或公众号，不发送草稿。</p><button id="open">打开投递窗口</button> <button onclick="document.body.classList.toggle('dark')">切换亮暗</button><pre id="result" role="status">尚未执行</pre><script>
HTMLElement.prototype.createEl=function(tag){const el=document.createElement(tag);this.append(el);return el};HTMLElement.prototype.setText=function(value){this.textContent=value};HTMLElement.prototype.addClass=function(value){this.classList.add(value)};HTMLElement.prototype.empty=function(){this.replaceChildren()};
</script><script type="module" src="/bundle.js"></script></html>`;
const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/bundle.js'?'text/javascript':'text/html; charset=utf-8');res.end(req.url==='/bundle.js'?fs.readFileSync(path.join(dir,'bundle.js')):html)});
server.listen(0,'127.0.0.1',()=>console.log(`http://127.0.0.1:${server.address().port}`));
process.on('SIGTERM',()=>server.close(()=>{fs.rmSync(dir,{recursive:true,force:true});process.exit()}));
