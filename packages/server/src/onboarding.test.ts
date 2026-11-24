// Customer onboarding must expose no credentials and reuse authenticated ownership rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from './index.js';
import { setupPage } from './setup-page.js';
import { hostedPurchasePage, hostedResultPage } from './pages.js';

test('public setup renders only a valid service egress IP, with escaped result text', () => {
  assert.match(setupPage('192.0.2.10'), /data-available="true">192\.0\.2\.10/);
  assert.match(setupPage('2001:db8::1'), /2001:db8::1/);
  for (const input of [undefined, 'https://example.test', '<script>alert(1)</script>', '192.0.2.10:443']) {
    const page = setupPage(input);
    assert.match(page, /data-available="false"/);
    assert.doesNotMatch(page, /<script>alert/);
  }
  assert.doesNotMatch(hostedResultPage('<img onerror=x>', '<script>x</script>', false), /<img onerror|<script>x/);
  const page = hostedPurchasePage(true, undefined, true);
  assert.match(page, /id="copy-key" disabled/);
  assert.match(page, /if \(!value\)/);
  assert.match(page, /href="\/setup"/);
});

test('setup shell is public but account data and binding remain authenticated and isolated', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publy-onboarding-'));
  const app = buildApp({port:0,apiKey:'fixture-admin',accounts:[],dataDir:dir,publicIp:'192.0.2.10'});
  const headers = (key:string) => ({'x-api-key':key});
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async (_url, init) => {
    const url=String(_url);
    return new Response(JSON.stringify(url.includes('fixture-bad') ? {errcode:40164,errmsg:'invalid ip 192.0.2.20, not in whitelist',ip:'192.0.2.20'} : {access_token:'fixture-token'}));
  };
  try {
    await app.ready();
    const shell=await app.inject({method:'GET',url:'/setup?lang=zh'});
    assert.equal(shell.statusCode,200);assert.equal(shell.headers['cache-control'],'no-store');
    assert.doesNotMatch(shell.body,/fixture-admin|fixture-token/);
    assert.equal((await app.inject({method:'GET',url:'/v1/accounts'})).statusCode,401);
    assert.equal((await app.inject({method:'POST',url:'/v1/bind',payload:{appId:'wx',appSecret:'secret'}})).statusCode,401);
    assert.equal((await app.inject({method:'GET',url:'/setup/private'})).statusCode,401);
    const user=async (contact:string) => (await app.inject({method:'POST',url:'/v1/admin/users',headers:headers('fixture-admin'),payload:{contact,plan:'free',months:1}})).json().apiKey as string;
    const alice=await user('alice@fixture.test'),bob=await user('bob@fixture.test');
    const bind=(secret:string) => app.inject({method:'POST',url:'/v1/bind',headers:headers(alice),payload:{appId:'wx_fixture',appSecret:secret,accountName:'My account'}});
    const failed=await bind('fixture-bad');assert.equal(failed.json().code,'NEEDS_WHITELIST');
    assert.equal((await app.inject({method:'GET',url:'/v1/accounts',headers:headers(alice)})).json().accounts.length,0);
    assert.equal((await bind('fixture-good')).statusCode,200);
    const owned=await app.inject({method:'GET',url:'/v1/accounts',headers:headers(alice)});
    assert.deepEqual(owned.json().accounts,[{name:'My account'}]);assert.equal(owned.headers['cache-control'],'no-store');
    assert.doesNotMatch(owned.body,/appSecret|fixture-good|wx_fixture/);
    assert.deepEqual((await app.inject({method:'GET',url:'/v1/accounts',headers:headers(bob)})).json().accounts,[]);
    assert.equal((await bind('fixture-good')).statusCode,400,'repeat binding cannot bypass limits');
    assert.equal(fs.readFileSync(path.join(dir,'history.jsonl'),'utf8').includes('fixture-good'),false);
  } finally {globalThis.fetch=originalFetch;await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
