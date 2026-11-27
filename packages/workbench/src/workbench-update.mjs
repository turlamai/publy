const messages={
 en:{check:"Check for updates",download:"Download update",busy:"Checking or downloading the update…",current:"This version is current.",available:"Update available",downloaded:"Verified installer saved. Open it to update Publy.",unavailable:"Could not verify the update. Try again later.",changed:"The available update changed. Check again."},
 zh:{check:"检查更新",download:"下载更新",busy:"正在检查或下载更新…",current:"当前已是最新版本。",available:"有可用更新",downloaded:"已保存并校验安装包，请打开安装包更新 Publy。",unavailable:"暂时无法验证更新，请稍后再试。",changed:"可用版本已变化，请重新检查。"}
};

export function installWorkbenchUpdate(getLanguage){
 const button=document.getElementById("update-button"),output=document.getElementById("update-status");
 const api=globalThis.glaze?.api;
 if(!document.documentElement.hasAttribute("data-desktop")||!api?.updateEnabled)return ()=>{};
 let message="",detail="",version=null;
 function translate(){
  const t=messages[getLanguage()];
  button.textContent=t[version?"download":"check"];
  output.textContent=message?t[message]+(detail?" "+detail:""):"";
  output.hidden=!message;
 }
 void api.updateEnabled({}).then(result=>{button.hidden=result.enabled!==true;translate();}).catch(()=>{});
 button.addEventListener("click",async()=>{
  if(button.disabled)return;
  button.disabled=true;message="busy";detail="";translate();
  try{
   const result=version?await api.updateDownload({version}):await api.updateCheck({});
   message=Object.hasOwn(messages.en,result.status)?result.status:"unavailable";
   version=message==="available"?result.version:null;
   detail=version??(message==="downloaded"?result.path:"");
  }catch{message="unavailable";version=null;}
  finally{button.disabled=false;translate();}
 });
 return translate;
}
