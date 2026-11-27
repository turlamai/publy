import {createDraftFlow} from "./draft-flow.mjs";
import {prepareDraft} from "./prepare-draft.mjs";

const messages={
 zh:{open:"投递草稿",heading:"投递到微信公众号",intro:"仅创建草稿，不公开发布。API Key 仅保留在本次连接中。开发版：服务端跨域授权和真实投递尚待验收。",key:"Publy API Key",connect:"连接并查询公众号",account:"公众号",title:"草稿标题",cardType:"图片卡片 · ",review:"检查投递内容",send:"确认投递",close:"关闭",reconcile:"查询投递结果",connecting:"正在查询公众号…",connected:"请选择公众号并检查标题。",empty:"没有可用公众号，请先完成公众号配置。",connectError:"连接失败，请检查 API Key、网络或服务端授权。",preparing:"正在准备投递内容…",prepareError:"不能准备投递，请检查内容、标题、图片和浏览器安全环境。",reviewed:"请确认下方公众号与标题。确认后才发送内容及图片。",sending:"正在创建草稿…",unknown:"结果未确认。请查询结果或检查微信草稿箱，不要重复投递。",confirmed:"已确认创建草稿",changed:"文章已修改，请关闭后重新打开投递窗口。",querying:"正在查询原请求…",summary:"公众号 / 标题 / 请求编号",recover:"恢复未确认投递",recoverKey:"重新输入 API Key 后查询原请求。",storageError:"无法安全保存或读取恢复记录，已阻止新投递。",saved:"已保存恢复记录，可关闭窗口后继续查询。",busy:"另一个窗口正在处理投递，请稍后重新打开。",lockUnavailable:"当前浏览器不支持安全投递锁，请使用支持 Web Locks 的浏览器。"},
 en:{open:"Send draft",heading:"Send to WeChat drafts",intro:"Creates a draft only, never a public post. API key is held for this connection only. Development build: cross-origin access and live delivery are not yet verified.",key:"Publy API key",connect:"Connect and list accounts",account:"Official account",title:"Draft title",cardType:"Image cards · ",review:"Review draft",send:"Confirm delivery",close:"Close",reconcile:"Check result",connecting:"Loading accounts…",connected:"Choose an account and review the title.",empty:"No accounts. Complete account setup first.",connectError:"Connection failed. Check the API key, network or server access policy.",preparing:"Preparing draft…",prepareError:"Cannot prepare draft. Check the content, title, images and secure browser context.",reviewed:"Review the account and title below. Content and images are sent only on confirmation.",sending:"Creating draft…",unknown:"Outcome not confirmed. Check the result or WeChat draft box; do not submit again.",confirmed:"Draft creation confirmed",changed:"Article changed. Close and reopen the dialog.",querying:"Checking the original request…",summary:"Account / title / request ID",recover:"Recover pending draft",recoverKey:"Enter your API key again to check the original request.",storageError:"Cannot safely read or save recovery state. New delivery is blocked.",saved:"Recovery record saved; close and return to check the result.",busy:"Another window is handling a draft. Reopen this dialog later.",lockUnavailable:"This browser lacks safe delivery locks. Use a browser supporting Web Locks."}
};
export function installDraftDialog({getPreview,getLanguage}){
 const get=id=>document.getElementById(id);
 const dialog=get("draft-dialog"),key=get("draft-key"),account=get("draft-account"),title=get("draft-title"),open=get("draft-open"),connect=get("draft-connect"),review=get("draft-review"),send=get("draft-send"),reconcile=get("draft-reconcile"),close=get("draft-close"),status=get("draft-status"),summary=get("draft-summary");
 let credential=null,snapshot=null,prepared=null,phase="idle",generation=0,message="",mediaId="";
 let flow=null,recovery=null,storageFailed=false,reading=false,recoveryBusy=false;
 try{flow=createDraftFlow();}catch{storageFailed=true;}
 async function loadRecovery(){
  reading=true;state();
  try{if(flow){recovery=await flow.read();storageFailed=false;}recoveryBusy=false;}
  catch(err){
   recoveryBusy=err?.message==="DRAFT_LOCK_BUSY";
   storageFailed=!recoveryBusy;
  }finally{reading=false;state();}
 }
 const t=()=>messages[getLanguage()];
 function translate(){
  const m=t();for(const [id,name] of [["draft-open","open"],["draft-heading","heading"],["draft-intro","intro"],["draft-key-label","key"],["draft-connect","connect"],["draft-account-label","account"],["draft-title-label","title"],["draft-review","review"],["draft-send","send"],["draft-close","close"],["draft-reconcile","reconcile"]])get(id).textContent=m[name];
  open.textContent=recovery||storageFailed||recoveryBusy?m.recover:m.open;
  status.textContent=message?m[message]+(mediaId?" · "+mediaId:""):"";
  summary.textContent=prepared?(prepared.type==="image_post"?m.cardType:"")+m.summary+": "+prepared.account+" / "+prepared.title+" / "+prepared.id:"";
 }
 function state(){
  const locked=["connecting","preparing","sending","querying"].includes(phase);
  const terminal=["unknown","confirmed"].includes(phase);
  key.disabled=locked||terminal;connect.disabled=locked||terminal||phase==="recover"||storageFailed;account.disabled=locked||terminal||phase==="recover"||!credential||!account.options.length;title.disabled=locked||terminal||phase==="recover";
  review.hidden=terminal||phase==="recover";review.disabled=storageFailed||!!recovery||locked||terminal||!credential||!account.value||!title.value.trim()||!snapshot||snapshot!==getPreview();
  send.hidden=phase!=="reviewed";send.disabled=storageFailed||!!recovery||phase!=="reviewed"||snapshot!==getPreview();
  reconcile.hidden=phase!=="unknown"&&phase!=="recover";reconcile.disabled=locked||(phase==="recover"&&!credential&&!key.value.trim());close.disabled=locked;open.disabled=reading||(!recovery&&!storageFailed&&!recoveryBusy&&(!getPreview()||getPreview().warnings.length>0));
  translate();
 }
 function reset(){generation++;credential=null;prepared=null;phase="idle";message="";mediaId="";key.value="";account.replaceChildren();snapshot=null;summary.textContent="";}
 function invalidate(){generation++;prepared=null;phase="idle";message="";}
 open.addEventListener("click",async()=>{
  await loadRecovery();
  if(recoveryBusy){reset();message="busy";dialog.showModal();state();return;}
  if(storageFailed){reset();message="storageError";dialog.showModal();state();return;}
  if(recovery){reset();prepared=recovery;phase="recover";message="recoverKey";dialog.showModal();state();key.focus();return;}
  const p=getPreview();if(!p||p.warnings.length)return;
  reset();snapshot=p;title.value=p.title??"";dialog.showModal();state();key.focus();
 });
 key.addEventListener("input",()=>{if(phase==="recover"){state();return;}invalidate();credential=null;account.replaceChildren();state();});
 for(const el of [account,title])el.addEventListener("input",()=>{invalidate();state();});
 connect.addEventListener("click",async()=>{
  if(!key.value.trim())return;
  const g=++generation;prepared=null;credential=null;account.replaceChildren();phase="connecting";message="connecting";state();
  try{const candidate=key.value;const names=await flow.connect(candidate);if(g!==generation)return;credential=candidate;key.value="";for(const name of names){const option=document.createElement("option");option.value=name;option.textContent=name;account.append(option);}message=names.length?"connected":"empty";}
  catch{if(g!==generation)return;message="connectError";}
  finally{if(g===generation){phase="idle";state();}}
 });
 review.addEventListener("click",async()=>{
  if(!credential||snapshot!==getPreview())return;
  const g=++generation;phase="preparing";message="preparing";prepared=null;state();
  try{const result=await prepareDraft(snapshot,account.value,title.value,document,flow.identify);if(g!==generation)return;if(snapshot!==getPreview()){phase="idle";message="changed";return;}prepared=result;phase="reviewed";message="reviewed";}
  catch{if(g!==generation)return;phase="idle";message="prepareError";}
  finally{if(g===generation)state();}
 });
 function lockError(err){
  if(err?.message==="DRAFT_LOCK_BUSY"){message="busy";return;}
  if(err?.message==="DRAFT_LOCK_UNAVAILABLE"){message="lockUnavailable";return;}
  storageFailed=true;message="storageError";
 }
 send.addEventListener("click",async()=>{
  if(phase!=="reviewed"||!prepared||!credential||snapshot!==getPreview())return;
  const request=prepared;phase="sending";message="sending";state();
  try{
   finish(await flow.submit(credential,request));
  }catch(err){phase=recovery?"unknown":"reviewed";lockError(err);}
  finally{state();}
 });
 reconcile.addEventListener("click",async()=>{
  if(!["unknown","recover"].includes(phase)||!prepared)return;
  if(!credential){if(!key.value.trim())return;credential=key.value;key.value="";}
  const previous=phase;phase="querying";message="querying";state();
  try{finish(await flow.reconcile(credential,prepared));}
  catch(err){phase=previous;lockError(err);}
  finally{state();}
 });
 function finish(result){
  recovery=result.pending??null;
  if(result.status==="pending"||result.status==="changed"){
   prepared=recovery;credential=null;key.value="";
   phase=recovery?"recover":"idle";message=recovery?"recoverKey":"busy";return;
  }
  phase=result.status==="confirmed"?"confirmed":"unknown";message=phase;mediaId=result.mediaId??"";
  if(phase==="confirmed")credential=null;
 }
 close.addEventListener("click",()=>{if(close.disabled)return;dialog.close();reset();state();open.focus();});
 dialog.addEventListener("cancel",e=>{e.preventDefault();if(!close.disabled)close.click();});
 globalThis.addEventListener("storage",()=>{if(!dialog.open&&!reading)void loadRecovery();});
 void loadRecovery();
 return {refresh:state,translate};
}
