// Explicit hosted API adapter. No automatic retries, credential persistence, or arbitrary destinations.
export const HOSTED_ORIGIN = "https://publy-api.jrtx.site";

export function createHostedClient(apiKey, transport = globalThis.fetch) {
 if(typeof apiKey !== "string" || !apiKey.trim()) throw new Error("API_KEY_REQUIRED");
 const key=apiKey.trim();
 async function call(path, method="GET", body) {
  const response=await transport(HOSTED_ORIGIN+path,{
   method,headers:{"x-api-key":key,...(body?{"content-type":"application/json"}:{})},
   ...(body?{body}:{}),redirect:"error",credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer"
  });
  let data;
  try{data=await response.json();}catch{data=null;}
  return {ok:response.ok,status:response.status,data};
 }
 return {
  async accounts(){
   const r=await call("/v1/accounts");
   if(!r.ok||!Array.isArray(r.data?.accounts))throw new Error("ACCOUNT_QUERY_FAILED");
   if(!r.data.accounts.every(a=>typeof a?.name==="string"&&a.name.trim()))throw new Error("ACCOUNT_RESPONSE_INVALID");
   return [...new Set(r.data.accounts.map(a=>a.name))];
  },
  // The caller must obtain explicit approval for the immutable prepared request.
  async submit(prepared, approvedRequestId){
   if(!prepared||!/^[a-f0-9]{32}$/.test(prepared.id)||approvedRequestId!==prepared.id)throw new Error("CONFIRMATION_REQUIRED");
   try{
    const r=await call("/v1/publish","POST",prepared.body);
    if(r.ok&&confirmed(r.data,prepared))return {status:"confirmed",mediaId:r.data.mediaId,requestId:prepared.id};
   }catch{/* The request may already have reached WeChat. Do not retry. */}
   return {status:"unknown",requestId:prepared.id};
  },
  async reconcile(prepared){
   if(!prepared||!/^[a-f0-9]{32}$/.test(prepared.id))throw new Error("REQUEST_ID_REQUIRED");
   try{
    const r=await call("/v1/publish-result/"+prepared.id);
    if(r.ok&&r.data?.status==="confirmed"&&confirmed(r.data,prepared))return {status:"confirmed",mediaId:r.data.mediaId,requestId:prepared.id};
   }catch{/* Readback failure is not evidence of absence. */}
   return {status:"unknown",requestId:prepared.id};
  }
 };
}
function confirmed(data,prepared){
 return data?.requestId===prepared.id&&data.account===prepared.account&&data.title===prepared.title&&typeof data.mediaId==="string"&&data.mediaId.trim().length>0;
}
