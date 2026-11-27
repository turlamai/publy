import { installWorkbenchUpdate } from "./workbench-update.mjs";
import { CARD_PALETTES, parseCardSource, lintCards } from "../../core/src/card-layout.js";
import { loadWorkbenchModule } from "./local-modules.mjs";
import { installDraftDialog } from "./draft-dialog.mjs";
import { richClipboard } from "./rich-clipboard.mjs";
import { previewArticleWithMath } from "./preview-math.mjs";
import { localMediaKey } from "../../core/src/local-article-preview.js";
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
let lang=navigator.language.toLowerCase().startsWith("zh")?"zh":"en", revision=0, previewGeneration=0, timer;
const format=get("format"), cards=get("card-preview"), strip=get("card-strip"), caption=get("card-caption");
const copy=get("copy"); let currentPreview=null;
let draftDialog;
const strings={zh:{format:"预览形式",article:"文章",cards:"图片卡片",cardTheme:"卡片主题",cardPreview:"图片卡片预览",cardHelp:"使用至少三节 ## cover、## point、## list、## ending，开头填写配文。",cardError:"无法生成卡片。每篇需 3–9 张，封面在第一张，另需结尾及 1–1000 字配文。",cardReady:"卡片已生成",cardRendering:"正在生成图片卡片",cardSave:"下载 PNG",stage:"本地预览开发版",open:"打开 Markdown",theme:"文章主题",width:"预览宽度",source:"Markdown 原文",preview:"文章预览",limits:"支持文本、公式及选定的本地图片。微信粘贴及在线投递效果待验证。",copy:"复制富文本",copied:"已复制富文本",copyError:"无法复制：请使用支持富文本剪贴板的浏览器",media:"添加图片",folder:"添加图片目录",clear:"清除图片",mediaError:"图片无效、重名或超过大小限制",ok:"本地预览完成",error:"无法预览",large:"文件超过 2 MiB",warning:"部分内容暂不支持"},en:{format:"Preview format",article:"Article",cards:"Image cards",cardTheme:"Card theme",cardPreview:"Image card preview",cardHelp:"Start with a caption and at least three sections marked ## cover, ## point, ## list or ## ending.",cardError:"Use 3–9 cards, starting with the cover and including an ending, plus a 1–1000 character caption.",cardReady:"Cards ready",cardRendering:"Rendering image cards",cardSave:"Download PNG",stage:"Local preview · development",open:"Open Markdown",theme:"Article theme",width:"Preview width",source:"Markdown source",preview:"Article preview",limits:"Text, formulas and selected local images. WeChat paste and online delivery remain unverified.",copy:"Copy rich text",copied:"Rich text copied",copyError:"Copy failed: use a browser with rich clipboard support",media:"Add images",folder:"Add image folder",clear:"Clear images",mediaError:"Invalid, duplicate or oversized image",ok:"Local preview ready",error:"Cannot preview",large:"File exceeds 2 MiB",warning:"Some content is not yet supported"}};
async function renderCards(generation){
 const t=strings[lang];
 strip.replaceChildren();caption.textContent="";
 status.textContent=t.cardHelp;
 if(!source.value.trim())return;
 let parsed;
 try{parsed=parseCardSource(source.value);}catch{return;}
 if(parsed.sections[0]?.kind!=="cover"||!lintCards(parsed.sections,parsed.caption).ok){status.textContent=t.cardError;return;}
 const palette=CARD_PALETTES[theme.value];
 status.textContent=t.cardRendering;
 const {renderCard}=await loadWorkbenchModule("workbench-cards.js","PublyCards");
 if(generation!==previewGeneration)return;
 const images=[];
 for(const [index,section] of parsed.sections.entries()){
  const data=await renderCard(palette,section,index,parsed.sections.length);
  if(generation!==previewGeneration)return;
  const item=document.createElement("figure"),image=document.createElement("img");
  image.src=data;image.alt=section.lines[0]??`${t.cards} ${index+1}`;
  image.width=1080;image.height=1440;item.append(image);
  const link=document.createElement("a");link.href=data;
  const filename=`card-${String(index+1).padStart(2,"0")}-${section.kind}.png`;
  link.download=filename;
  images.push({filename,data});
  link.textContent=t.cardSave;item.append(link);strip.append(item);
 }
 caption.textContent=parsed.caption;
 status.textContent=t.cardReady;
 currentPreview={cards:images,caption:parsed.caption,title:parsed.sections[0].lines[0]??"",warnings:[]};
 draftDialog?.refresh();
}

async function render(){
 const generation=++previewGeneration;
 currentPreview=null;copy.disabled=true;draftDialog?.refresh();
 try{
  if(format.value==="cards"){await renderCards(generation);return;}
  const result=await previewArticleWithMath(source.value,themes[theme.value],media);
  if(generation!==previewGeneration)return;
  // All CSS is bundled, reviewed theme CSS, never user input. The sandbox has no
  // scripts, same-origin privileges, forms or navigation; CSP blocks resources.
  frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; base-uri \'none\'; form-action \'none\'"><style>html{background:white;color:#222}body{margin:16px;overflow-wrap:anywhere}pre{overflow:auto}img{max-width:100%;height:auto}'+result.css+'</style></head><body>'+result.html+'</body></html>';
  currentPreview=result;copy.disabled=!source.value.trim()||result.warnings.length>0;
  status.textContent=result.warnings.length?strings[lang].warning:strings[lang].ok;
 }catch{if(generation!==previewGeneration)return;frame.srcdoc="";strip.replaceChildren();status.textContent=strings[lang].error;}
 draftDialog?.refresh();
}
function queue(){previewGeneration++;currentPreview=null;copy.disabled=true;draftDialog?.refresh();clearTimeout(timer);timer=setTimeout(render,120);}
source.addEventListener("input",()=>{revision++;queue();});
theme.addEventListener("change",render);
const selectedThemes={article:"claude",cards:"naive"};
let previousFormat="article";
format.addEventListener("change",()=>{
 selectedThemes[previousFormat]=theme.value;previousFormat=format.value;
 const showCards=format.value==="cards";
 theme.replaceChildren(...Object.keys(showCards?CARD_PALETTES:themes).map(name=>new Option(name,name)));
 theme.value=selectedThemes[format.value];
 cards.hidden=!showCards;frame.parentElement.hidden=showCards;copy.hidden=showCards;
 get("width-control").hidden=showCards;
 translate();
});
get("width").addEventListener("change",e=>{frame.dataset.width=e.target.value;});
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
copy.addEventListener("click",async()=>{
 const snapshot=currentPreview;if(!snapshot||snapshot.warnings.length)return;
 try{
  if(!navigator.clipboard?.write||!globalThis.ClipboardItem)throw Error("unsupported");
  const output=richClipboard(snapshot.html,snapshot.css,document);
  await navigator.clipboard.write([new ClipboardItem({"text/html":new Blob([output.html],{type:"text/html"}),"text/plain":new Blob([output.text],{type:"text/plain"})})]);
  status.textContent=strings[lang].copied;
 }catch{status.textContent=strings[lang].copyError;}
});
const translateUpdate=installWorkbenchUpdate(()=>lang);
function translate(){const t=strings[lang];document.documentElement.lang=lang==="zh"?"zh-CN":"en";for(const [id,key] of [["stage","stage"],["open-label","open"],["theme-label","theme"],["width-label","width"],["source-label","source"],["preview-label","preview"],["limits","limits"],["media-label","media"],["folder-label","folder"],["clear-media","clear"],["copy","copy"]])get(id).textContent=t[key];get("language").textContent=lang==="zh"?"EN":"中文";frame.title=t.preview;
 get("format-label").textContent=t.format;
 format.options[0].textContent=t.article;format.options[1].textContent=t.cards;
 if(format.value==="cards"){get("theme-label").textContent=t.cardTheme;get("preview-label").textContent=t.cardPreview;}
 translateUpdate();render();}
get("language").addEventListener("click",()=>{lang=lang==="zh"?"en":"zh";translate();});
draftDialog=installDraftDialog({getPreview:()=>source.value.trim()?currentPreview:null,getLanguage:()=>lang});
translate();
