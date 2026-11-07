import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { HostedEntitlementFence } from "./hosted-entitlement-fence.js";
import { observeAndFenceHostedSnapshot } from "./hosted-shadow-coordinator.js";

test("shadow reconciliation requires trusted enrollment and carries the durable revision to Commerce", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-shadow-coordinator-"));
  const db = new DatabaseSync(":memory:");
  try {
    const verifierScript = path.join(dir, "verifier.js"), trustStore = path.join(dir, "trust.json");
    fs.writeFileSync(trustStore, "{}");
    fs.writeFileSync(verifierScript, `let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{
      const x=JSON.parse(s);process.stdout.write(JSON.stringify({status:'verified-snapshot',authorizes_use:false,
      entitlement_id:x.entitlement_id,revision:x.revision,payload_sha256:'a'.repeat(64)}));});`);
    const bodies: Array<Record<string, unknown>> = [];
    let revision = 1;
    const fetcher: typeof fetch = async (_url, init) => {
      bodies.push(JSON.parse(Buffer.from(init?.body as Uint8Array).toString("utf8")));
      return new Response(JSON.stringify({ status: "verified-proof", entitlement_id: "ent-1", revision, credential: { synthetic: true } }));
    };
    const fence = new HostedEntitlementFence(db);
    const input = { endpoint: "http://127.0.0.1:8787/v1/hosted/proof", serviceId: "service", secret: Buffer.alloc(32, 1),
      scope: { issuer: "issuer", subjectType: "account" as const, subjectId: "account-a", offerId: "offer-a", productId: "publy" },
      plan: "personal" as const, racketExecutable: process.execPath, verifierScript, trustStore, fence, fetcher, enroll: false };
    assert.equal(await observeAndFenceHostedSnapshot(input), null);
    assert.equal(bodies.length, 0, "an unenrolled account must not start a new lineage");
    assert.equal((await observeAndFenceHostedSnapshot({ ...input, enroll: true }))?.canAuthorize, false);
    assert.equal(bodies[0].minimum_revision, null);
    assert.equal(bodies[0].expected_entitlement_id, null);
    revision = 2;
    assert.equal((await observeAndFenceHostedSnapshot(input))?.revision, 2);
    assert.equal(bodies[1].minimum_revision, 1);
    assert.equal(bodies[1].expected_entitlement_id, "ent-1");
    revision = 1;
    assert.equal(await observeAndFenceHostedSnapshot(input), null, "a stale response must not roll back the fence");
    assert.equal(fence.lookup("account-a", "offer-a")?.revision, 2);
    assert.equal(await observeAndFenceHostedSnapshot({ ...input, scope: { ...input.scope, productId: "other" } }), null);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
