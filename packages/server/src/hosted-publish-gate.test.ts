import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp, type ServerConfig } from "./index.js";
import type { Store } from "./store.js";

test("a paid user cannot publish when the current hosted proof is unavailable", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-admission-gate-"));
  try {
    const script = path.join(dir, "verify.js"), trust = path.join(dir, "trust.json"), secret = path.join(dir, "hmac");
    fs.writeFileSync(trust, "{}");
    fs.writeFileSync(secret, Buffer.alloc(32, 5), { mode: 0o600 });
    fs.writeFileSync(script, `process.stdin.resume();process.stdin.on('end',()=>process.exit(7))`);
    const config: ServerConfig = { port: 0, apiKey: "admin", dataDir: dir,
      accounts: [{ name: "fixture", appId: "wx_fixture", appSecret: "synthetic" }],
      hostedAdmission: {
        endpoint: "http://127.0.0.1:9/v1/hosted/proof", serviceId: "publy",
        secret: Buffer.from(fs.readFileSync(secret)), issuer: "fixture", offerId: "publy-personal-monthly",
        racketExecutable: process.execPath, verifierScript: script, trustStore: trust, enroll: true,
        fetcher: async () => Response.json({ status: "no-proof" }),
      } };
    const app = buildApp(config);
    try {
      await app.ready();
      const store = (app as unknown as { store: Store }).store;
      const user = store.createUser("gate@example.test", "personal", 1);
      store.upsertAccount({ name: "owned", appId: "wx_owned", appSecret: "synthetic", ownerUserId: user.id });
      store.enrollHostedSubject(user.id);
      const response = await app.inject({ method: "POST", url: "/v1/publish",
        headers: { "x-api-key": user.apiKey },
        payload: { account: "owned", title: "blocked", type: "article", html: "<p>x</p>" } });
      assert.equal(response.statusCode, 403);
      assert.equal(response.json().code, "HOSTED_ADMISSION_REQUIRED");
      assert.match(response.json().message, /not current/);
    } finally { await app.close(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});
