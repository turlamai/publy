import {pendingDraftStore} from "./pending-draft.mjs";
import {createHostedClient} from "./hosted-client.mjs";
import {prepareArticle} from "./prepare-article.mjs";

const messages={
 zh:{open:"投递草稿",heading:"投递到微信公众号",intro:"仅创建草稿，不公开发布。API Key 仅保留在本次连接中。开发版：服务端跨域授权和真实投递尚待验收。",key:"Publy API Key",connect:"连接并查询公众号",account:"公众号",title:"文章标题",review:"检查投递内容",send:"确认投递",close:"关闭",reconcile:"查询投递结果",connecting:"正在查询公众号…",connected:"请选择公众号并检查标题。",empty:"没有可用公众号，请先完成公众号配置。",connectError:"连接失败，请检查 API Key、网络或服务端授权。",preparing:"正在准备投递内容…",prepareError:"不能准备投递，请检查文章、标题、图片和浏览器安全环境。",reviewed:"请确认下方公众号与标题。确认后才发送文章及图片。",sending:"正在创建草稿…",unknown:"结果未确认。请查询结果或检查微信草稿箱，不要重复投递。",confirmed:"已确认创建草稿",changed:"文章已修改，请关闭后重新打开投递窗口。",querying:"正在查询原请求…",summary:"公众号 / 标题 / 请求编号",recover:"恢复未确认投递",recoverKey:"重新输入 API Key 后查询原请求。",storageError:"无法安全保存或读取恢复记录，已阻止新投递。",saved:"已保存恢复记录，可关闭窗口后继续查询。"},
 en:{open:"Send draft",heading:"Send to WeChat drafts",intro:"Creates a draft only, never a public post. API key is held for this connection only. Development build: cross-origin access and live delivery are not yet verified.",key:"Publy API key",connect:"Connect and list accounts",account:"Official account",title:"Article title",review:"Review draft",send:"Confirm delivery",close:"Close",reconcile:"Check result",connecting:"Loading accounts…",connected:"Choose an account and review the title.",empty:"No accounts. Complete account setup first.",connectError:"Connection failed. Check the API key, network or server access policy.",preparing:"Preparing draft…",prepareError:"Cannot prepare draft. Check the article, title, images and secure browser context.",reviewed:"Review the account and title below. Article and images are sent only on confirmation.",sending:"Creating draft…",unknown:"Outcome not confirmed. Check the result or WeChat draft box; do not submit again.",confirmed:"Draft creation confirmed",changed:"Article changed. Close and reopen the dialog.",querying:"Checking the original request…",summary:"Account / title / request ID",recover:"Recover pending draft",recoverKey:"Enter your API key again to check the original request.",storageError:"Cannot safely read or save recovery state. New delivery is blocked.",saved:"Recovery record saved; close and return to check the result."}
};
export function installDraftDialog({getPreview,getLanguage}){
 const get=id=>document.getElementById(id);
 const dialog=get("draft-dialog"),key=get("draft-key"),account=get("draft-account"),title=get("draft-title"),open=get("draft-open"),connect=get("draft-connect"),review=get("draft-review"),send=get("draft-send"),reconcile=get("draft-reconcile"),close=get("draft-close"),status=get("draft-status"),summary=get("draft-summary");
 let client=null,snapshot=null,prepared=null,phase="idle",generation=0,message="",mediaId="";
 let store=null,recovery=null,storageFailed=false;
 try{store=pendingDraftStore(globalThis.localStorage);recovery=store.read();}catch{storageFailed=true;}
 const t=()=>messages[getLanguage()];
 function translate(){
  const m=t();for(const [id,name] of [["draft-open","open"],["draft-heading","heading"],["draft-intro","intro"],["draft-key-label","key"],["draft-connect","connect"],["draft-account-label","account"],["draft-title-label","title"],["draft-review","review"],["draft-send","send"],["draft-close","close"],["draft-reconcile","reconcile"]])get(id).textContent=m[name];
  open.textContent=recovery||storageFailed?m.recover:m.open;
  status.textContent=message?m[message]+(mediaId?" · "+mediaId:""):"";
  summary.textContent=prepared?m.summary+": "+prepared.account+" / "+prepared.title+" / "+prepared.id:"";
 }
 function state(){
  const locked=["connecting","preparing","sending","querying"].includes(phase);
  const terminal=["unknown","confirmed"].includes(phase);
  key.disabled=locked||terminal;connect.disabled=locked||terminal||phase==="recover"||storageFailed;account.disabled=locked||terminal||!client||!account.options.length;title.disabled=locked||terminal;
  review.hidden=terminal||phase==="recover";review.disabled=storageFailed||!!recovery||locked||terminal||!client||!account.value||!title.value.trim()||!snapshot||snapshot!==getPreview();
  send.hidden=phase!=="reviewed";send.disabled=storageFailed||!!recovery||phase!=="reviewed"||snapshot!==getPreview();
  reconcile.hidden=phase!=="unknown"&&phase!=="recover";reconcile.disabled=locked||(phase==="recover"&&!key.value.trim());close.disabled=locked;open.disabled=!recovery&&!storageFailed&&(!getPreview()||getPreview().warnings.length>0);
  translate();
 }
 function reset(){generation++;client=null;prepared=null;phase="idle";message="";mediaId="";key.value="";account.replaceChildren();snapshot=null;summary.textContent="";}
 function invalidate(){generation++;prepared=null;phase="idle";message="";}
 open.addEventListener("click",()=>{
  try{recovery=store?.read()??null;}catch{storageFailed=true;}
  if(storageFailed){reset();message="storageError";dialog.showModal();state();return;}
  if(recovery){reset();prepared=recovery;phase="recover";message="recoverKey";dialog.showModal();state();key.focus();return;}
  const p=getPreview();if(!p||p.warnings.length)return;
  reset();snapshot=p;title.value=p.title??"";dialog.showModal();state();key.focus();
 });
 key.addEventListener("input",()=>{if(phase==="recover"){state();return;}invalidate();client=null;account.replaceChildren();state();});
 for(const el of [account,title])el.addEventListener("input",()=>{invalidate();state();});
 connect.addEventListener("click",async()=>{
  if(!key.value.trim())return;
  const g=++generation;prepared=null;client=null;account.replaceChildren();phase="connecting";message="connecting";state();
  try{const candidate=createHostedClient(key.value);const names=await candidate.accounts();if(g!==generation)return;client=candidate;key.value="";for(const name of names){const option=document.createElement("option");option.value=name;option.textContent=name;account.append(option);}message=names.length?"connected":"empty";}
  catch{if(g!==generation)return;message="connectError";}
  finally{if(g===generation){phase="idle";state();}}
 });
 review.addEventListener("click",async()=>{
  if(!client||snapshot!==getPreview())return;
  const g=++generation;phase="preparing";message="preparing";prepared=null;state();
  try{const result=await prepareArticle(snapshot,account.value,title.value,document);if(g!==generation)return;if(snapshot!==getPreview()){phase="idle";message="changed";return;}prepared=result;phase="reviewed";message="reviewed";}
  catch{if(g!==generation)return;phase="idle";message="prepareError";}
  finally{if(g===generation)state();}
 });
 send.addEventListener("click",async()=>{
  if(phase!=="reviewed"||!prepared||!client||snapshot!==getPreview())return;
  const request=prepared;
  try{recovery=store.save(request);}catch{storageFailed=true;message="storageError";state();return;}
  phase="sending";message="sending";state();
  const result=await client.submit(request,request.id);
  finish(result);
 });
 reconcile.addEventListener("click",async()=>{
  if(!["unknown","recover"].includes(phase)||!prepared)return;
  if(!client){if(!key.value.trim())return;client=createHostedClient(key.value);key.value="";}
  phase="querying";message="querying";state();const result=await client.reconcile(prepared);
  finish(result);
 });
 function finish(result){
  phase=result.status==="confirmed"?"confirmed":"unknown";message=phase;mediaId=result.mediaId??"";
  if(phase==="confirmed"){try{store.clear(prepared.id);recovery=null;}catch{storageFailed=true;message="storageError";}}
  state();
 }
 close.addEventListener("click",()=>{if(close.disabled)return;dialog.close();reset();state();open.focus();});
 dialog.addEventListener("cancel",e=>{e.preventDefault();if(!close.disabled)close.click();});
 return {refresh:state,translate};
}
