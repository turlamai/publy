import {pendingDraftStore,withDraftLock} from "./pending-draft.mjs";
import {createHostedClient} from "./hosted-client.mjs";

export function createDraftFlow() {
 if(document.documentElement.hasAttribute("data-desktop")){
  // Explicit desktop build marker: a missing bridge must never fall back to Fetch.
  const call=async (operation,args={})=>{
   const route=globalThis.glaze?.api?.[operation];
   if(!route)throw Error("DRAFT_LOCK_UNAVAILABLE");
   const reply=await route(args);
   if(reply.status==="busy")throw Error("DRAFT_LOCK_BUSY");
   if(reply.status==="storage-error"||reply.status==="invalid")throw Error("DRAFT_STORAGE_ERROR");
   return reply;
  };
  return {
   read:async()=> (await call("draftPending")).pending,
   identify:async payload=> (await call("draftIdentity",{body:JSON.stringify(payload)})).id,
   connect:async key=>(await call("draftAccounts",{key:key.trim()})).accounts,
   submit:(key,request)=>call("draftSend",{key:key.trim(),approved:request.id,body:request.payload}),
   reconcile:(key,request)=>call("draftResult",{key:key.trim(),id:request.id})
  };
 }
 const store=pendingDraftStore(globalThis.localStorage);
 return {
  read:()=>store.read(),
  connect:key=>createHostedClient(key).accounts(),
  submit:(key,request)=>withDraftLock(navigator.locks,async()=>{
   const saved=store.read();
   if(saved)return {status:"pending",pending:saved};
   const pending=store.save(request);
   const result=await createHostedClient(key).submit(request,request.id);
   if(result.status==="confirmed")store.clear(request.id);
   return {...result,pending:result.status==="confirmed"?null:pending};
  }),
  reconcile:(key,request)=>withDraftLock(navigator.locks,async()=>{
   const saved=store.read();
   if(!saved||saved.id!==request.id)return {status:"changed",pending:saved};
   const result=await createHostedClient(key).reconcile(saved);
   if(result.status==="confirmed")store.clear(request.id);
   return {...result,pending:result.status==="confirmed"?null:saved};
  })
 };
}
