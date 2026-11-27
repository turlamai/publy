import { previewLocalArticle, localMediaKey } from "../../core/src/local-article-preview.js";
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
const media = new Map(); let mediaGeneration=0;
let lang=navigator.language.toLowerCase().startsWith("zh")?"zh":"en", revision=0, timer;
const strings={zh:{stage:"本地预览开发版",open:"打开 Markdown",theme:"文章主题",width:"预览宽度",source:"Markdown 原文",preview:"文章预览",limits:"支持文本及选定的本地图片；公式、富文本复制与草稿投递尚未实现。",media:"添加图片",folder:"添加图片目录",clear:"清除图片",mediaError:"图片无效、重名或超过大小限制",ok:"本地预览完成",error:"无法预览",large:"文件超过 2 MiB",warning:"部分内容暂不支持"},en:{stage:"Local preview · development",open:"Open Markdown",theme:"Article theme",width:"Preview width",source:"Markdown source",preview:"Article preview",limits:"Text and selected local images. Formulas, rich-text copying and draft delivery are not yet supported.",media:"Add images",folder:"Add image folder",clear:"Clear images",mediaError:"Invalid, duplicate or oversized image",ok:"Local preview ready",error:"Cannot preview",large:"File exceeds 2 MiB",warning:"Some content is not yet supported"}};
function render(){
 const t=strings[lang];
 try{
  const result=previewLocalArticle(source.value,themes[theme.value],media);
  // All CSS is bundled, reviewed theme CSS, never user input. The sandbox has no
  // scripts, same-origin privileges, forms or navigation; CSP blocks resources.
  frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; base-uri \'none\'; form-action \'none\'"><style>html{background:white;color:#222}body{margin:16px;overflow-wrap:anywhere}pre{overflow:auto}img{max-width:100%;height:auto}'+result.css+'</style></head><body>'+result.html+'</body></html>';
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
// Explicit user-selected files only. No network access or persistent storage.
async function loadMedia(input, folder){
 const files=Array.from(input.files??[]);input.value="";
 const generation=++mediaGeneration;
 const next=new Map(media); let total=[...next.values()].reduce((sum,v)=>sum+v.length,0);
 try{
  for(const f of files){
   if(!/^image\/(png|jpeg|gif|webp)$/.test(f.type)){if(folder)continue;throw Error("type");}
   const relative=folder?f.webkitRelativePath.split("/").slice(1).join("/"):f.name;
   const key=localMediaKey(relative);
   if(!key||next.has(key)||f.size>8*1024*1024||next.size>=100)throw Error("limit");
   const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(f);});
   total+=data.length;if(total>32*1024*1024)throw Error("limit");
   next.set(key,data);
  }
  if(generation!==mediaGeneration)return;media.clear();for(const [k,v] of next)media.set(k,v);render();
 }catch{if(generation===mediaGeneration)status.textContent=strings[lang].mediaError;}
}
get("media").addEventListener("change",e=>loadMedia(e.target,false));
get("folder").addEventListener("change",e=>loadMedia(e.target,true));
get("clear-media").addEventListener("click",()=>{mediaGeneration++;media.clear();render();});
function translate(){const t=strings[lang];document.documentElement.lang=lang==="zh"?"zh-CN":"en";for(const [id,key] of [["stage","stage"],["open-label","open"],["theme-label","theme"],["width-label","width"],["source-label","source"],["preview-label","preview"],["limits","limits"],["media-label","media"],["folder-label","folder"],["clear-media","clear"]])get(id).textContent=t[key];get("language").textContent=lang==="zh"?"EN":"中文";frame.title=t.preview;render();}
get("language").addEventListener("click",()=>{lang=lang==="zh"?"en":"zh";translate();});
translate();
