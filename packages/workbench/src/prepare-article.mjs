import { browserDraftIdempotencyKey } from "../../core/src/draft-identity-browser.js";
import { richClipboard } from "./rich-clipboard.mjs";

// Operates only on an already reviewed local preview; does not perform a network request.
export async function prepareArticle(preview, account, title, document, identify=browserDraftIdempotencyKey){
 if(!preview||preview.warnings.length)throw new Error("PREVIEW_INCOMPLETE");
 if(!account?.trim()||!title?.trim())throw new Error("ACCOUNT_AND_TITLE_REQUIRED");
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
 const payload={account:account.trim(),type:"article",title:title.trim(),html:root.innerHTML,images};
 const id=await identify(payload,globalThis.crypto?.subtle);
 if(!/^[a-f0-9]{32}$/.test(id))throw new Error("INVALID_DRAFT_ID");
 const body=JSON.stringify({...payload,idempotencyKey:id});
 if(new TextEncoder().encode(body).length>29*1024*1024)throw new Error("REQUEST_TOO_LARGE");
 return Object.freeze({id,body,payload:JSON.stringify(payload),account:payload.account,title:payload.title});
}
