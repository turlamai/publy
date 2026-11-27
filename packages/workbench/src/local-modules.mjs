const loaded=new Map();

export function loadWorkbenchModule(file,name){
 if(!loaded.has(file)){
  const pending=new Promise((resolve,reject)=>{
   const script=document.createElement("script");
   script.src=file;
   script.onload=()=>globalThis[name]?resolve(globalThis[name]):reject(Error("LOCAL_MODULE_UNAVAILABLE"));
   script.onerror=()=>reject(Error("LOCAL_MODULE_UNAVAILABLE"));
   document.head.append(script);
  });
  loaded.set(file,pending);
 }
 return loaded.get(file);
}
