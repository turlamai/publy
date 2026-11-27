import {rasterSvg} from "./raster.mjs";
import {loadWorkbenchModule} from "./local-modules.mjs";
import {previewLocalArticle} from "../../core/src/local-article-preview.js";

const escape=text=>text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

async function rasterize(tex,display){
 const {browserMathSvg}=await loadWorkbenchModule("workbench-math.js","PublyMath");
 const {svg,width,height,valign}=browserMathSvg(tex,display);
 const png=await rasterSvg(svg,width,height,2,"#fff");
 const style=display?`width:${width}px;display:block;margin:0.5em auto`:
  `width:${width}px;vertical-align:${valign}px`;
 return `<img class="publy-math" alt="${escape(tex)}" style="${style}" src="${png}">`;
}

export async function previewArticleWithMath(raw,css,media){
 const formulas=new Map();
 let limited=false;
 const preview=previewLocalArticle(raw,css,media,(tex,display)=>{
  const key=JSON.stringify([tex,display]);
  if(!formulas.has(key)){
   if(formulas.size>=16||tex.length>2048){limited=true;return `<code>${escape(tex)}</code>`;}
   formulas.set(key,{slot:formulas.size,tex,display});
  }
  return `<span data-publy-formula="${formulas.get(key).slot}"></span>`;
 });
 const replacements=await Promise.all(Array.from(formulas.values(),async entry=>{
  try{return await rasterize(entry.tex,entry.display);}
  catch{limited=true;return `<code>${escape(entry.tex)}</code>`;}
 }));
 preview.html=preview.html.replace(/<span data-publy-formula="(\d+)"><\/span>/g,(_,slot)=>replacements[Number(slot)]);
 if(limited)preview.warnings.push("One or more formulas could not be rendered locally.");
 return preview;
}
