import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp, type ServerConfig } from "./index.js";
import type { Store } from "./store.js";

test("an operator can reconcile a paid order only from a current verified entitlement", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-admin-reconcile-"));
  let proof = "verified-proof";
  try {
    const script = path.join(dir, "verify.js"), trust = path.join(dir, "trust.json"), secret = path.join(dir, "hmac");
    fs.writeFileSync(trust, "{}");
    fs.writeFileSync(secret, Buffer.alloc(32, 7), { mode: 0o600 });
    fs.writeFileSync(script, `let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const x=JSON.parse(s);
      if(typeof x.account!=='string'||x.plan!=='personal')process.exit(2);
      process.stdout.write(JSON.stringify({status:'admitted',authorizes_use:true,entitlement_id:'ent-1',revision:3,
        payload_sha256:'a'.repeat(64),use_expires_at:'2027-01-01T00:00:00Z'}));});`);
    const config: ServerConfig = { port: 0, apiKey: "admin", dataDir: dir,
      accounts: [{ name: "fixture", appId: "wx_fixture", appSecret: "synthetic" }],
      hostedAdmission: { endpoint: "http://127.0.0.1:9/v1/hosted/proof", serviceId: "publy",
        secret: Buffer.from(fs.readFileSync(secret)), issuer: "fixture", offerId: "publy-personal-monthly",
        racketExecutable: process.execPath, verifierScript: script, trustStore: trust, enroll: true,
        fetcher: async () => Response.json(proof === "verified-proof"
          ? { status: "verified-proof", entitlement_id: "ent-1", revision: 3, credential: {} }
          : { status: proof }) } };
    const app = buildApp(config);
    try {
      await app.ready();
      const store = (app as unknown as { store: Store }).store;
      const user = store.createUser("reconcile@example.test", "free", 1);
      store.enrollHostedSubject(user.id);
      store.recordHostedPurchase(user.id, "publy-personal-monthly", "request_123456789");
      const first = await app.inject({ method: "POST", url: "/v1/admin/hosted/reconcile",
        headers: { "x-api-key": "admin" }, payload: { userId: user.id } });
      assert.equal(first.statusCode, 200);
      assert.equal(first.json().plan, "personal");
      assert.equal(store.findUserById(user.id)?.plan, "personal");
      proof = "recorded-withdrawal";
      const withdrawn = await app.inject({ method: "POST", url: "/v1/admin/hosted/reconcile",
        headers: { "x-api-key": "admin" }, payload: { userId: user.id } });
      assert.equal(withdrawn.statusCode, 409);
      assert.equal(withdrawn.json().code, "HOSTED_ADMISSION_REQUIRED");
      const userKey = await app.inject({ method: "POST", url: "/v1/admin/hosted/reconcile",
        headers: { "x-api-key": user.apiKey }, payload: { userId: user.id } });
      assert.equal(userKey.statusCode, 403);
    } finally { await app.close(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});
