// One unresolved draft per workbench origin. Never persist credentials or article data.
const KEY="publy.pending-draft.v1";
function validate(v){
 if(!v||!(/^[a-f0-9]{32}$/).test(v.id)||typeof v.account!=="string"||!v.account.trim()||typeof v.title!=="string"||!v.title.trim())throw Error("INVALID_PENDING_DRAFT");
 return {id:v.id,account:v.account,title:v.title};
}
export function pendingDraftStore(storage){
 return {
  read(){const raw=storage.getItem(KEY);return raw===null?null:validate(JSON.parse(raw));},
  save(request){const value=validate(request);const raw=storage.getItem(KEY);if(raw!==null&&validate(JSON.parse(raw)).id!==value.id)throw Error("PENDING_DRAFT_EXISTS");storage.setItem(KEY,JSON.stringify(value));return value;},
  clear(id){const raw=storage.getItem(KEY);if(raw===null)return;if(validate(JSON.parse(raw)).id!==id)throw Error("PENDING_DRAFT_CHANGED");storage.removeItem(KEY);}
 };
}
