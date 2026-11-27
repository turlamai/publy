// This driver runs only in the synthetic native test application.
(async () => {
 const get=id=>document.getElementById(id);
 const wait=async (condition,label)=>{
  for(let i=0;i<200;i++){
   if(condition())return;
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  throw Error(label+": "+get("draft-status").textContent);
 };
 const enter=(id,value)=>{
  const el=get(id);el.value=value;el.dispatchEvent(new Event("input"));
 };
 const assert=(condition,label)=>{if(!condition)throw Error(label);};
 try{
  assert(!!window.glaze,"Glaze client missing");
  let denied=false;
  try{await glaze.api.testDenied({});}catch(error){denied=error?.code==="capability-denied";}
  assert(denied,"Ungranted capability was accepted");
  if(document.documentElement.lang!=="en")get("language").click();
  enter("source","# Sample\n\nHello **bold**. $x^2$");
  await wait(()=>!get("draft-open").disabled,"preview");
  assert(get("preview").getAttribute("sandbox")==="","No preview sandbox");
  get("draft-open").click();
  await wait(()=>get("draft-dialog").open,"open dialog");
  const opening=get("draft-status").textContent;
  const nativePending=await glaze.api.draftPending({});
  enter("draft-key","synthetic-key");
  assert(!get("draft-connect").disabled,"Connect disabled after opening: "+opening+" pending="+JSON.stringify(nativePending));
  get("draft-connect").click();
  assert(get("draft-status").textContent.includes("Loading"),"Connect did not start: "+get("draft-status").textContent);
  await wait(()=>!get("draft-review").disabled,"lookup accounts");
  get("draft-review").click();
  await wait(()=>!get("draft-send").hidden,"review");
  get("draft-send").click();
  get("draft-send").click();
  await wait(()=>get("draft-status").textContent.includes("Outcome not confirmed"),"lost reply");
  const saved=(await glaze.api.draftPending({})).pending;
  assert(Object.keys(saved).sort().join(",")==="account,id,title","Unexpected recovery fields");
  get("draft-close").click();
  get("draft-open").click();
  await wait(()=>get("draft-dialog").open,"open recovery");
  enter("draft-key","synthetic-key");
  get("draft-reconcile").click();
  await wait(()=>get("draft-status").textContent.includes("Draft creation confirmed"),"readback");
  assert((await glaze.api.draftPending({})).pending===null,"Recovery record remained");
  get("draft-close").click();
  get("format").value="cards";get("format").dispatchEvent(new Event("change"));
  enter("source","A caption\n\n## cover\n咖啡 Coffee\n\n## point\nA tip\n\n## ending\nThanks");
  await wait(()=>document.querySelectorAll("#card-strip img").length===3,"cards");
  const card=document.querySelector("#card-strip img");
  await card.decode();
  assert(card.naturalWidth===1080&&card.naturalHeight===1440,"card dimensions");
  await glaze.api.testDone({message:"passed"});
 }catch(error){
  await glaze.api.testDone({message:String(error)});
 }
})();
