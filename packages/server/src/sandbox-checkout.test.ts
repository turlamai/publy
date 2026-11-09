import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp, type ServerConfig } from "./index.js";
import type { Store } from "./store.js";

test("sandbox checkout is closed by default and binds server pricing to an enrolled authenticated user", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-sandbox-checkout-"));
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const config: ServerConfig = { port: 0, apiKey: "admin", dataDir: dir,
    accounts: [{ name: "fixture", appId: "wx_fixture", appSecret: "synthetic" }] };
  let app = buildApp(config);
  try {
    await app.ready();
    assert.equal((await app.inject({ method: "POST", url: "/v1/hosted/checkout", headers: { "x-api-key": "admin" }, payload: {} })).statusCode, 503);
    await app.close();
    const requests: Array<Record<string, string>> = [];
    const fetcher: typeof fetch = async (_url, init) => {
      requests.push(JSON.parse(Buffer.from(init?.body as Uint8Array).toString()));
      const order = `ali${"a".repeat(32)}`;
      const fields: Record<string, string> = { app_id: "fixture-app", method: "alipay.trade.page.pay", format: "JSON", charset: "utf-8",
        sign_type: "RSA2", timestamp: "2026-11-04 10:00:00", version: "1.0", notify_url: "https://example.test/notify",
        return_url: "https://example.test/return", biz_content: JSON.stringify({ out_trade_no: order, total_amount: "29.00", product_code: "FAST_INSTANT_TRADE_PAY" }) };
      const canonical = Object.keys(fields).filter((k) => k !== "sign" && k !== "sign_type").sort().map((k) => `${k}=${fields[k]}`).join("&");
      fields.sign = crypto.sign("sha256", Buffer.from(canonical), { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }).toString("base64");
      return new Response(JSON.stringify({ status: "checkout-ready", order_id: order,
        gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do", fields }));
    };
    app = buildApp({ ...config, sandboxCheckout: { endpoint: "http://127.0.0.1:8787/v1/hosted/alipay-checkout",
      serviceId: "service", secret: Buffer.alloc(32, 107), issuer: "fixture", appId: "fixture-app",
      merchantPublicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      notifyUrl: "https://example.test/notify", returnUrl: "https://example.test/return", fetcher } });
    await app.ready();
    const store = (app as unknown as { store: Store }).store;
    const user = store.createUser("fixture-contact", "free", 0);
    const headers = { "x-api-key": user.apiKey };
    const payload = { offer: "publy-personal-monthly", requestId: "request_123456789" };
    assert.equal((await app.inject({ method: "POST", url: "/v1/hosted/checkout", payload })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: "/v1/hosted/checkout", headers, payload })).statusCode, 403);
    const subject = store.enrollHostedSubject(user.id);
    assert.equal((await app.inject({ method: "POST", url: "/v1/hosted/checkout", headers, payload: { ...payload, amount: 1 } })).statusCode, 400);
    const first = await app.inject({ method: "POST", url: "/v1/hosted/checkout", headers, payload });
    const second = await app.inject({ method: "POST", url: "/v1/hosted/checkout", headers, payload });
    assert.equal(first.statusCode, 200);
    assert.equal(first.headers["cache-control"], "no-store");
    assert.equal(first.json().status, "ready");
    assert.equal(first.json().paid, false);
    assert.equal(second.statusCode, 200);
    assert.equal(requests[0].subject_id, subject);
    assert.equal(requests[0].request_id, requests[1].request_id);
    assert.notEqual(requests[0].request_id, payload.requestId);
    const other = store.createUser("other-fixture-contact", "free", 0);
    const otherSubject = store.enrollHostedSubject(other.id);
    const otherResult = await app.inject({ method: "POST", url: "/v1/hosted/checkout", headers: { "x-api-key": other.apiKey }, payload });
    assert.equal(otherResult.statusCode, 200);
    assert.equal(requests[2].subject_id, otherSubject);
    assert.notEqual(requests[2].request_id, requests[0].request_id);
    assert.ok(!JSON.stringify(requests).includes(user.apiKey));
    assert.ok(!JSON.stringify(requests).includes(user.contact));
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
