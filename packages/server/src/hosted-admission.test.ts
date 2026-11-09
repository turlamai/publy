import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyHostedAdmission } from "./hosted-admission.js";

test("hosted admission only accepts an explicit verified decision", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-hosted-admission-"));
  try {
    const script = path.join(dir, "verifier.js"), trust = path.join(dir, "trust.json");
    fs.writeFileSync(trust, "{}");
    fs.writeFileSync(script, `let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{
      const x=JSON.parse(s); if(x.account!=='account-a'||x.plan!=='personal'||x.at!=='2026-11-09T00:00:00Z'||(x.entitlement_id&&x.entitlement_id!=='ent-1'))process.exit(2);
      process.stdout.write(JSON.stringify({status:'admitted',authorizes_use:true,entitlement_id:x.entitlement_id||'ent-1',
        revision:3,payload_sha256:'a'.repeat(64),use_expires_at:'2026-12-01T00:00:00Z'}));});`);
    const base = { credential: { synthetic: true }, account: "account-a", plan: "personal" as const,
      at: "2026-11-09T00:00:00Z", racketExecutable: process.execPath, verifierScript: script, trustStore: trust };
    assert.deepEqual(await verifyHostedAdmission(base), { allowed: true, status: "admitted", entitlementId: "ent-1",
      revision: 3, payloadSha256: "a".repeat(64), useExpiresAt: "2026-12-01T00:00:00Z" });
    assert.equal((await verifyHostedAdmission({ ...base, entitlementId: "ent-2" })).allowed, false);
    assert.equal((await verifyHostedAdmission({ ...base, minimumRevision: 4 })).allowed, false);
    assert.equal((await verifyHostedAdmission({ ...base, account: "other" })).allowed, false);
    assert.equal((await verifyHostedAdmission({ ...base, racketExecutable: "relative" })).allowed, false);
    fs.writeFileSync(script, `process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(JSON.stringify({
      status:'admitted',authorizes_use:false,entitlement_id:'ent-1',revision:3,payload_sha256:'a'.repeat(64),use_expires_at:'x'})))`);
    assert.equal((await verifyHostedAdmission(base)).allowed, false);
    fs.writeFileSync(script, `process.stdin.resume();process.stdin.on('end',()=>process.stdout.write('x'.repeat(20000)))`);
    assert.equal((await verifyHostedAdmission(base)).allowed, false);
    fs.writeFileSync(script, `process.stdin.resume();process.stdin.on('end',()=>process.exit(7))`);
    assert.equal((await verifyHostedAdmission(base)).allowed, false);
    fs.writeFileSync(script, `process.stdin.resume();process.stdin.on('end',()=>setInterval(()=>{},1000))`);
    assert.equal((await verifyHostedAdmission(base)).allowed, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});
