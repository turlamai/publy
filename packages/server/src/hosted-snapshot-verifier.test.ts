import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { HostedEntitlementFence } from "./hosted-entitlement-fence.js";
import { verifyHostedSnapshot, verifyAndFenceHostedSnapshot } from "./hosted-snapshot-verifier.js";
import type { HostedProofObservation } from "./commerce-proof-request.js";

test("snapshot bridge binds the verifier output and never grants access", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-snapshot-bridge-"));
  const previousSecret = process.env.PUBLY_BRIDGE_SYNTHETIC_SECRET;
  try {
    process.env.PUBLY_BRIDGE_SYNTHETIC_SECRET = "not-for-child";
    const script = path.join(dir, "verifier.js"), trustStore = path.join(dir, "trust.json");
    fs.writeFileSync(trustStore, "{}");
    fs.writeFileSync(script, `let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{
      const x=JSON.parse(s); if(x.account!=='account-a'||x.plan!=='personal'||process.env.PUBLY_BRIDGE_SYNTHETIC_SECRET)process.exit(2);
      process.stdout.write(JSON.stringify({status:'verified-snapshot',authorizes_use:false,
        entitlement_id:x.entitlement_id,revision:x.revision,payload_sha256:'a'.repeat(64)}));});`);
    const observation: HostedProofObservation = { kind: "shadow-observation", canAuthorize: false,
      status: "recorded-withdrawal", entitlementId: "ent-1", revision: 3, credential: { synthetic: true } };
    const input = { racketExecutable: process.execPath, verifierScript: script, trustStore,
      subject: "account-a", plan: "personal" as const, observation };
    assert.deepEqual(await verifyHostedSnapshot(input), { status: "verified-snapshot", canAuthorize: false,
      subject: "account-a", entitlementId: "ent-1", revision: 3, payloadSha256: "a".repeat(64) });
    const db = new DatabaseSync(":memory:");
    try {
      const fence = new HostedEntitlementFence(db);
      assert.equal(await verifyAndFenceHostedSnapshot({ ...input, fence, offer: "offer-a", enroll: false }), null);
      assert.equal((await verifyAndFenceHostedSnapshot({ ...input, fence, offer: "offer-a", enroll: true }))?.canAuthorize, false);
      assert.equal(await verifyAndFenceHostedSnapshot({ ...input, fence, offer: "offer-a", enroll: false,
        observation: { ...observation, revision: 2 } }), null);
    } finally { db.close(); }
    assert.equal(await verifyHostedSnapshot({ ...input, subject: "other" }), null);
    assert.equal(await verifyHostedSnapshot({ ...input, racketExecutable: "relative" }), null);
    assert.equal(await verifyHostedSnapshot({ ...input, observation: { kind: "shadow-observation", canAuthorize: false, status: "no-proof" } }), null);
    fs.writeFileSync(script, `process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(JSON.stringify({
      status:'verified-snapshot',authorizes_use:true,entitlement_id:'ent-1',revision:3,payload_sha256:'a'.repeat(64)})))`);
    assert.equal(await verifyHostedSnapshot(input), null);
    fs.writeFileSync(script, `process.stdin.resume();process.stdin.on('end',()=>process.stdout.write('x'.repeat(20000)))`);
    assert.equal(await verifyHostedSnapshot(input), null);
    fs.writeFileSync(script, `process.stdin.resume();process.stdin.on('end',()=>process.exit(7))`);
    assert.equal(await verifyHostedSnapshot(input), null);
    assert.equal(await verifyHostedSnapshot({ ...input, racketExecutable: path.join(dir, "missing-executable") }), null);
    fs.writeFileSync(script, `process.stdin.resume();process.stdin.on('end',()=>setInterval(()=>{},1000))`);
    assert.equal(await verifyHostedSnapshot(input), null, "a stuck verifier must not authorize or block indefinitely");
  } finally {
    if (previousSecret === undefined) delete process.env.PUBLY_BRIDGE_SYNTHETIC_SECRET;
    else process.env.PUBLY_BRIDGE_SYNTHETIC_SECRET = previousSecret;
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
