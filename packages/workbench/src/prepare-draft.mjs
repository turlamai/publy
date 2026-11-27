import { browserDraftIdempotencyKey } from "../../core/src/draft-identity-browser.js";
import { richClipboard } from "./rich-clipboard.mjs";

function articlePayload(preview, document){
 const output=richClipboard(preview.html,preview.css,document);
 const doc=document.implementation.createHTMLDocument("");
 const root=doc.createElement("div");root.innerHTML=output.html;
 const images=[];const seen=new Map();
 for(const image of root.querySelectorAll("img")){
  const source=image.getAttribute("src")??"";
  const match=/^data:image\/(png|jpeg|gif|webp);base64,([a-z0-9+/=]+)$/i.exec(source);
  if(!match)throw new Error("INVALID_IMAGE");
  let name=seen.get(source);
  if(!name){
   const type=match[1].toLowerCase();
   name="image-"+(images.length+1)+"."+(type==="jpeg"?"jpg":type);
   images.push({name,contentType:"image/"+type,data:match[2]});seen.set(source,name);
  }
  image.setAttribute("src","attachment://"+name);
 }
 return {type:"article",html:root.innerHTML,images};
}

function cardsPayload({caption,cards},document){
 const body=document.implementation.createHTMLDocument("").createElement("div");
 for(const line of caption.split("\n")){
  if(body.childNodes.length)body.append(document.createElement("br"));
  body.append(line||" ");
 }
 const images=cards.map(({filename,data})=>({name:filename,contentType:"image/png",data:data.slice("data:image/png;base64,".length)}));
 return {type:"image_post",html:body.innerHTML,images,cover:images[0].name};
}

// Operates only on an already reviewed local preview.
export async function prepareDraft(preview, account, title, document, identify=browserDraftIdempotencyKey){
 if(!preview||preview.warnings.length)throw new Error("PREVIEW_INCOMPLETE");
 if(!account?.trim()||!title?.trim())throw new Error("ACCOUNT_AND_TITLE_REQUIRED");
 const content=preview.cards?cardsPayload(preview,document):articlePayload(preview,document);
 const payload={...content,account:account.trim(),title:title.trim()};
 const id=await identify(payload,globalThis.crypto?.subtle);
 if(!/^[a-f0-9]{32}$/.test(id))throw new Error("INVALID_DRAFT_ID");
 const body=JSON.stringify({...payload,idempotencyKey:id});
 if(new TextEncoder().encode(body).length>29*1024*1024)throw new Error("REQUEST_TOO_LARGE");
 return Object.freeze({id,body,type:payload.type,payload:JSON.stringify(payload),account:payload.account,title:payload.title});
}
