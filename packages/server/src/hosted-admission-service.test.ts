import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { HostedEntitlementFence } from "./hosted-entitlement-fence.js";
import { checkHostedAdmission } from "./hosted-admission-service.js";

function proofFetcher(status: string, requests: Array<Record<string, unknown>>, revision = 3): typeof fetch {
  return async (_url, init) => {
    requests.push(JSON.parse(Buffer.from(init?.body as Uint8Array).toString()));
    return Response.json(status === "verified-proof"
      ? { status: "verified-proof", entitlement_id: "ent-1", revision, credential: { synthetic: true } }
      : { status });
  };
}

test("hosted admission requires enrolled, current proof and a matching Permit decision", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-admission-service-"));
  const db = new DatabaseSync(":memory:");
  try {
    const script = path.join(dir, "verify.js"), trust = path.join(dir, "trust.json");
    fs.writeFileSync(trust, "{}");
    fs.writeFileSync(script, `let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const x=JSON.parse(s);
      if(x.plan!=='personal'||x.account!=='account-a')process.exit(2);
      if(x.entitlement_id&&typeof x.minimum_revision!=='number')process.exit(2);
      if(/\.\d{3}Z$/.test(x.at))process.exit(2);
      process.stdout.write(JSON.stringify({status:'admitted',authorizes_use:true,entitlement_id:'ent-1',revision:3,
        payload_sha256:'a'.repeat(64),use_expires_at:'2026-12-01T00:00:00Z'}));});`);
    const requests: Array<Record<string, unknown>> = [];
    const base = { endpoint: "http://127.0.0.1:9/v1/hosted/proof", serviceId: "publy", secret: Buffer.alloc(32, 4),
      issuer: "fixture", offerId: "publy-personal-monthly", subject: "account-a", plan: "personal" as const,
      racketExecutable: process.execPath, verifierScript: script, trustStore: trust, fence: new HostedEntitlementFence(db),
      fetcher: proofFetcher("verified-proof", requests) };
    assert.equal((await checkHostedAdmission({ ...base, enroll: false })).allowed, false, "first use needs operator enrollment");
    const first = await checkHostedAdmission({ ...base, enroll: true });
    assert.deepEqual(first, { allowed: true, status: "admitted", entitlementId: "ent-1", revision: 3, useExpiresAt: "2026-12-01T00:00:00Z" });
    assert.equal(requests[0].minimum_revision, null);
    assert.equal((await checkHostedAdmission({ ...base, enroll: false })).allowed, true, "same proof advances the fence");

    const noProof = await checkHostedAdmission({ ...base, enroll: false,
      fence: new HostedEntitlementFence(new DatabaseSync(":memory:")), fetcher: proofFetcher("recorded-withdrawal", requests) });
    assert.equal(noProof.allowed, false, "a withdrawal is not admission");

    const stale = await checkHostedAdmission({ ...base, enroll: false, fetcher: proofFetcher("verified-proof", requests, 2) });
    assert.equal(stale.allowed, false, "a lower revision must not authorize");

    fs.writeFileSync(script, `process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(JSON.stringify({
      status:'admitted',authorizes_use:false,entitlement_id:'ent-1',revision:3,payload_sha256:'a'.repeat(64),use_expires_at:'x'})))`);
    assert.equal((await checkHostedAdmission({ ...base, enroll: false })).allowed, false);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});
