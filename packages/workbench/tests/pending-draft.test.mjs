import {test} from "node:test";import assert from "node:assert/strict";import {pendingDraftStore} from "../src/pending-draft.mjs";
function fake(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),m};}
const req={id:"1234567890abcdef1234567890abcdef",account:"A",title:"T",body:"private article",key:"secret"};
test("recovery persists only metadata and survives reopening",()=>{const s=fake();pendingDraftStore(s).save(req);assert.deepEqual(pendingDraftStore(s).read(),{id:req.id,account:"A",title:"T"});assert.doesNotMatch([...s.m.values()][0],/private|secret/);});
test("cannot replace an unresolved request with another",()=>{const s=pendingDraftStore(fake());s.save(req);assert.throws(()=>s.save({...req,id:"f".repeat(32)}),/PENDING_DRAFT_EXISTS/);assert.throws(()=>s.clear("f".repeat(32)));s.clear(req.id);assert.equal(s.read(),null);});
test("malformed or inaccessible storage fails closed",()=>{const f=fake();f.setItem("publy.pending-draft.v1","bad json");assert.throws(()=>pendingDraftStore(f).read());assert.throws(()=>pendingDraftStore({getItem(){throw Error("denied");}}).save(req));});
