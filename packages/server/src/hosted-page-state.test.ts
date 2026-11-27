// A stale response must never leave another customer's checkout visible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { hostedPurchasePage } from './pages.js';

function browserFixture(fetcher: (url:string, init:any)=>Promise<any>) {
  const elements=new Map<string,any>();
  const element=(id:string):any=>{
    if(!elements.has(id))elements.set(id,{id,value:'',textContent:'',className:'',hidden:true,disabled:false,handlers:{},
      addEventListener(name:string,fn:any){this.handlers[name]=fn;},
      removeAttribute(name:string){delete this[name];},remove(){elements.delete(id);},appendChild(child:any){elements.set(child.id,child);}});
    return elements.get(id);
  };
  const events=new Map<string,()=>unknown>();
  const timers=new Map<number,()=>Promise<void>>();let sequence=0;
  const document={addEventListener:(name:string,fn:()=>unknown)=>events.set(name,fn),getElementById:(id:string)=>id==='purchase-link'?(elements.get(id)||null):element(id),createElement:()=>({id:'',remove(){elements.delete(this.id);}}),visibilityState:'visible'};
  const saved=new Map([['publy_hosted_api_key','fixture-old']]);
  const context=vm.createContext({document,fetch:fetcher,sessionStorage:{getItem:(k:string)=>saved.get(k),setItem:(k:string,v:string)=>saved.set(k,v),removeItem:(k:string)=>saved.delete(k)},setTimeout:(fn:()=>Promise<void>)=>{timers.set(++sequence,fn);return sequence;},clearTimeout:(id:number)=>timers.delete(id),navigator:{clipboard:{writeText:async()=>{}}}});
  const script=hostedPurchasePage(true,undefined,true).match(/<script>([\s\S]*?)<\/script>/)![1];
  vm.runInContext(script,context);
  return {element,saved,events,timers,tick:async()=>{const next=timers.entries().next().value;if(next){timers.delete(next[0]);await next[1]();}},submit:()=>element('buy').handlers.submit({preventDefault(){}})};
}
const response=(value:unknown)=>({ok:true,json:async()=>value});

test('changing the key during an access check hides stale checkout and prevents cross-account rendering', async()=>{
  let resolveStatus!:(value:any)=>void,started!:()=>void;
  const waiting=new Promise<void>(r=>{started=r});
  const ui=browserFixture(async(url)=>url==='/v1/hosted/session'?response({}):new Promise(r=>{resolveStatus=r;started();}));
  ui.element('existingKey').value='fixture-old';
  const pending=ui.submit();await waiting;
  const input=ui.element('existingKey');input.value='fixture-other';input.handlers.input.call(input);
  resolveStatus(response({status:'purchase_required',purchaseUrl:'https://example.test/stale-checkout'}));await pending;
  assert.equal(ui.element('direct-result').hidden,true);
  assert.equal(ui.element('direct-qr').src,undefined);
  assert.doesNotMatch(ui.element('msg').textContent,/请在支付宝确认/);
  assert.equal(ui.saved.has('publy_hosted_api_key'),false);
});

test('clearing a saved key uses explicit signup rather than silently reusing the hidden previous key', async()=>{
  const requests:Array<{url:string,key?:string}>=[];
  const ui=browserFixture(async(url,init)=>{requests.push({url,key:init.headers['x-api-key']});return response(url==='/v1/signup'?{apiKey:'fixture-new'}:url==='/v1/hosted/status'?{status:'purchase_required'}:{});});
  const input=ui.element('existingKey');input.value='';input.handlers.input.call(input);ui.element('contact').value='new@example.test';
  assert.equal(ui.element('copy-key').disabled,true);
  await ui.submit();
  assert.equal(requests[0].url,'/v1/signup');assert.equal(requests[0].key,undefined);
  assert.deepEqual(requests.slice(1).map(r=>r.key),['fixture-new','fixture-new']);
  assert.equal(ui.saved.has('publy_hosted_api_key'),false);
  assert.equal(input.value,'fixture-new');
});

test('pending checkout polls until confirmed and removes the payment link on activation', async()=>{
  let checks=0;
  const ui=browserFixture(async(url)=>response(url==='/v1/hosted/status'?(++checks<3?{status:'purchase_required',purchaseUrl:'https://example.test/pay'}:{status:'active',validUntil:'2026-12-01T00:00:00Z'}):{}));
  ui.element('existingKey').value='fixture-old';
  await ui.submit();
  assert.equal(ui.timers.size,1);
  assert.equal(ui.element('purchase-link').href,'https://example.test/pay');
  await ui.tick();
  assert.equal(ui.timers.size,1);
  await ui.tick();
  assert.equal(checks,3);
  assert.equal(ui.timers.size,0);
  assert.match(ui.element('direct-state').textContent,/已开通/);
  assert.equal(ui.element('direct-qr').hidden,true);
  assert.equal(ui.element('purchase-link').href,undefined);
  assert.equal(ui.element('onboarding-next').hidden,false);
  assert.equal(ui.element('pay').hidden,true);
  assert.equal(ui.element('refresh').hidden,true);
  const input=ui.element('existingKey');input.value='fixture-other';input.handlers.input.call(input);
  assert.equal(ui.element('onboarding-next').hidden,true);
  assert.equal(ui.element('pay').hidden,false);
  assert.equal(ui.element('refresh').hidden,false);
});
