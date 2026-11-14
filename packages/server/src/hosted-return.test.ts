import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp, type ServerConfig } from "./index.js";
import type { Store } from "./store.js";

function commerceFetcher(privateKey: crypto.KeyObject): typeof fetch {
  return async (_url, init) => {
    const fields: Record<string, string> = { app_id: "fixture-app", method: "alipay.trade.page.pay",
      format: "JSON", charset: "utf-8", sign_type: "RSA2", timestamp: "2026-11-09 10:00:00",
      version: "1.0", notify_url: "https://example.test/notify", return_url: "https://example.test/hosted/return",
      biz_content: JSON.stringify({ out_trade_no: "ali" + "c".repeat(32), total_amount: "29.00", product_code: "FAST_INSTANT_TRADE_PAY" }) };
    const canonical = Object.keys(fields).filter((k) => k !== "sign").sort().map((k) => `${k}=${fields[k]}`).join("&");
    fields.sign = crypto.sign("sha256", Buffer.from(canonical), { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }).toString("base64");
    return Response.json({ status: "checkout-ready", order_id: "ali" + "c".repeat(32),
      gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do", fields });
  };
}

test("browser return activates a plan only from a current verified Permit proof", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-hosted-return-"));
  try {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const script = path.join(dir, "verify.js"), trust = path.join(dir, "trust.json"), secret = path.join(dir, "hmac");
    fs.writeFileSync(trust, "{}");
    fs.writeFileSync(secret, Buffer.alloc(32, 6), { mode: 0o600 });
    fs.writeFileSync(script, `let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const x=JSON.parse(s);
      if(typeof x.account!=='string'||x.plan!=='personal')process.exit(2);
      process.stdout.write(JSON.stringify({status:'admitted',authorizes_use:true,entitlement_id:'ent-1',revision:3,
        payload_sha256:'a'.repeat(64),use_expires_at:'2027-01-01T00:00:00Z'}));});`);
    const config: ServerConfig = { port: 0, apiKey: "admin", dataDir: dir,
      accounts: [{ name: "fixture", appId: "wx_fixture", appSecret: "synthetic" }],
      hostedCheckout: { endpoint: "http://127.0.0.1:9/v1/hosted/alipay-checkout", serviceId: "publy",
        secret: Buffer.alloc(32, 1), issuer: "fixture", appId: "fixture-app",
        merchantPublicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
        notifyUrl: "https://example.test/notify", returnUrl: "https://example.test/hosted/return",
        environment: "sandbox", fetcher: commerceFetcher(privateKey) },
      hostedAdmission: { endpoint: "http://127.0.0.1:9/v1/hosted/proof", serviceId: "publy",
        secret: Buffer.from(fs.readFileSync(secret)), issuer: "fixture", offerId: "publy-personal-monthly",
        racketExecutable: process.execPath, verifierScript: script, trustStore: trust, enroll: true,
        fetcher: async () => Response.json({ status: "verified-proof", entitlement_id: "ent-1", revision: 3, credential: {} }) } };
    const app = buildApp(config);
    try {
      await app.ready();
      const signup = await app.inject({ method: "POST", url: "/v1/signup", payload: { contact: "return@example.test" } });
      assert.equal(signup.statusCode, 200);
      const account = signup.json();
      const cookie = String(signup.headers["set-cookie"]).split(";")[0];
      assert.match(cookie, /^publy_hosted_session=/);
      const checkout = await app.inject({ method: "POST", url: "/v1/hosted/checkout", headers: { "x-api-key": account.apiKey, cookie },
        payload: { offer: "publy-personal-monthly", requestId: "request_123456789" } });
      assert.equal(checkout.statusCode, 200);
      const returned = await app.inject({ method: "GET", url: "/hosted/return", headers: { cookie } });
      assert.equal(returned.statusCode, 200);
      assert.match(returned.body, /已开通/);
      const store = (app as unknown as { store: Store }).store;
      const user = store.findUserByContact("return@example.test")!;
      assert.equal(user.plan, "personal");
      assert.ok(user.expiresAt > Date.now());
    } finally { await app.close(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});
