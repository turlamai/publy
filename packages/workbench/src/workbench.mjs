import { previewLocalArticle } from "../../core/src/local-article-preview.js";
import claude from "../../core/themes/claude.css";
import medium from "../../core/themes/medium.css";
import wechat from "../../core/themes/wechat.css";
import ink from "../../core/themes/ink.css";
import tech from "../../core/themes/tech.css";
import rose from "../../core/themes/rose.css";
import official from "../../core/themes/official.css";
import fortune from "../../core/themes/fortune.css";
import terminal from "../../core/themes/terminal.css";
import news from "../../core/themes/news.css";
const themes = {claude,medium,wechat,ink,tech,rose,official,fortune,terminal,news};
const get = id => document.getElementById(id);
const source=get("source"), frame=get("preview"), status=get("status"), file=get("file"), theme=get("theme");
let lang=navigator.language.toLowerCase().startsWith("zh")?"zh":"en", revision=0, timer;
const strings={zh:{stage:"本地预览开发版",open:"打开 Markdown",theme:"文章主题",width:"预览宽度",source:"Markdown 原文",preview:"文章预览",limits:"仅支持文本预览；暂不支持图片、公式、富文本复制与草稿投递。",ok:"本地预览完成",error:"无法预览",large:"文件超过 2 MiB",warning:"部分内容暂不支持"},en:{stage:"Local preview · development",open:"Open Markdown",theme:"Article theme",width:"Preview width",source:"Markdown source",preview:"Article preview",limits:"Text preview only. Images, formulas, rich-text copying and draft delivery are not yet supported.",ok:"Local preview ready",error:"Cannot preview",large:"File exceeds 2 MiB",warning:"Some content is not yet supported"}};
function render(){
 const t=strings[lang];
 try{
  const result=previewLocalArticle(source.value,themes[theme.value]);
  // All CSS is bundled, reviewed theme CSS, never user input. The sandbox has no
  // scripts, same-origin privileges, forms or navigation; CSP blocks resources.
  frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><style>html{background:white;color:#222}body{margin:16px;overflow-wrap:anywhere}pre{overflow:auto}'+result.css+'</style></head><body>'+result.html+'</body></html>';
  status.textContent=result.warnings.length?t.warning:t.ok;
 }catch{frame.srcdoc="";status.textContent=t.error;}
}
function queue(){clearTimeout(timer);timer=setTimeout(render,120);}
source.addEventListener("input",()=>{revision++;queue();});
theme.addEventListener("change",render);
get("width").addEventListener("change",e=>{frame.width=e.target.value;frame.style.width=e.target.value+"px";});
file.addEventListener("change",async()=>{
 const picked=file.files?.[0];if(!picked)return;const current=++revision;
 try{if(picked.size>2*1024*1024){status.textContent=strings[lang].large;return;}
 const raw=await picked.text();if(current!==revision)return;source.value=raw;get("filename").textContent=picked.name;render();}
 catch{if(current===revision)status.textContent=strings[lang].error;}
 finally{file.value="";}
});
function translate(){const t=strings[lang];document.documentElement.lang=lang==="zh"?"zh-CN":"en";for(const [id,key] of [["stage","stage"],["open-label","open"],["theme-label","theme"],["width-label","width"],["source-label","source"],["preview-label","preview"],["limits","limits"]])get(id).textContent=t[key];get("language").textContent=lang==="zh"?"EN":"中文";frame.title=t.preview;render();}
get("language").addEventListener("click",()=>{lang=lang==="zh"?"en":"zh";translate();});
translate();
