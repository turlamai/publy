// Hosted purchase seam: public signup exists only with a configured Commerce
// checkout, duplicate contacts never leak a key, and the browser page is not a
// fake payment button when checkout is unconfigured.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp, loadServerConfig, type ServerConfig } from "./index.js";

function signedCommerceFetcher(privateKey: crypto.KeyObject, requests: Array<Record<string, string>>): typeof fetch {
  return async (_url, init) => {
    requests.push(JSON.parse(Buffer.from(init?.body as Uint8Array).toString()));
    const order = `ali${"b".repeat(32)}`;
    const fields: Record<string, string> = {
      app_id: "fixture-app", method: "alipay.trade.page.pay", format: "JSON", charset: "utf-8",
      sign_type: "RSA2", timestamp: "2026-11-09 10:00:00", version: "1.0",
      notify_url: "https://example.test/notify", return_url: "https://example.test/return",
      biz_content: JSON.stringify({ out_trade_no: order, total_amount: "29.00", product_code: "FAST_INSTANT_TRADE_PAY" }),
    };
    const canonical = Object.keys(fields).filter((k) => k !== "sign").sort().map((k) => `${k}=${fields[k]}`).join("&");
    fields.sign = crypto.sign("sha256", Buffer.from(canonical), { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }).toString("base64");
    return new Response(JSON.stringify({ status: "checkout-ready", order_id: order,
      gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do", fields }));
  };
}

const base = (dir: string): ServerConfig => ({ port: 0, apiKey: "admin", dataDir: dir,
  accounts: [{ name: "fixture", appId: "wx_fixture", appSecret: "synthetic" }] });

test("server config reads a hosted checkout without exposing the HMAC secret", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-hosted-config-"));
  try {
    const secretFile = path.join(dir, "commerce.hmac");
    fs.writeFileSync(secretFile, Buffer.alloc(32, 7), { mode: 0o600 });
    const configFile = path.join(dir, "server.json");
    fs.writeFileSync(configFile, JSON.stringify({
      apiKey: "admin", accounts: [{ name: "a", appId: "wx_a", appSecret: "secret" }],
      hostedCheckout: {
        endpoint: "https://commerce.example.test/v1/hosted/alipay-checkout",
        serviceId: "publy", issuer: "example", appId: "2026", merchantPublicKeyPem: "-----BEGIN PUBLIC KEY-----\nAA==\n-----END PUBLIC KEY-----",
        notifyUrl: "https://publy.example.test/pay/notify", returnUrl: "https://publy.example.test/pay/return",
        environment: "sandbox", secretFile,
      },
    }));
    const config = loadServerConfig(configFile);
    assert.equal(config.hostedCheckout?.environment, "sandbox");
    assert.equal(config.hostedCheckout?.secret.length, 32);
    assert.equal(JSON.stringify(config).includes("commerce.hmac"), false);

    fs.writeFileSync(secretFile, Buffer.alloc(8, 7));
    assert.throws(() => loadServerConfig(configFile), /32-128/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("public signup is gated on checkout and refuses duplicate contacts", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-hosted-signup-"));
  const config = base(dir);
  let app = buildApp(config);
  try {
    await app.ready();
    assert.equal((await app.inject({ method: "POST", url: "/v1/signup", payload: { contact: "a@example.test" } })).statusCode, 503);
    assert.equal((await app.inject({ method: "GET", url: "/hosted" })).statusCode, 200);
    const page = (await app.inject({ method: "GET", url: "/hosted" })).body;
    assert.match(page, /暂不可购买/);
    assert.doesNotMatch(page, /去支付宝付款/);
    await app.close();

    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const admissionScript = path.join(dir, "admission.js"), trust = path.join(dir, "trust.json");
    fs.writeFileSync(trust, "{}");
    fs.writeFileSync(admissionScript, "process.stdin.resume();process.stdin.on('end',()=>process.exit(7))");
    app = buildApp({ ...config, hostedCheckout: {
      endpoint: "http://127.0.0.1:9/v1/hosted/alipay-checkout", serviceId: "service", secret: Buffer.alloc(32, 9),
      issuer: "fixture", appId: "fixture-app", merchantPublicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      notifyUrl: "https://example.test/notify", returnUrl: "https://example.test/return", environment: "sandbox",
      fetcher: signedCommerceFetcher(privateKey, []),
    }, hostedAdmission: { endpoint: "http://127.0.0.1:9/v1/hosted/proof", serviceId: "s", secret: Buffer.alloc(32, 3),
      issuer: "fixture", offerId: "publy-personal-monthly", racketExecutable: process.execPath,
      verifierScript: admissionScript, trustStore: trust, enroll: false } });
    await app.ready();
    const signup = await app.inject({ method: "POST", url: "/v1/signup", payload: { contact: "buyer@example.test" } });
    assert.equal(signup.statusCode, 200);
    const account = signup.json();
    assert.match(account.apiKey, /^publy_/);
    assert.match(account.subject, /^publy_account_/);
    const again = await app.inject({ method: "POST", url: "/v1/signup", payload: { contact: "buyer@example.test" } });
    assert.equal(again.statusCode, 409);
    assert.equal(again.body.includes(account.apiKey), false);

    const requests: Array<Record<string, string>> = [];
    const store = (app as unknown as { store: import("./store.js").Store }).store;
    store.findUserByContact("buyer@example.test");
    const checkout = await app.inject({ method: "POST", url: "/v1/hosted/checkout",
      headers: { "x-api-key": account.apiKey }, payload: { offer: "publy-personal-monthly", requestId: "request_123456789" } });
    assert.equal(checkout.statusCode, 200);
    assert.equal(checkout.json().status, "ready");
    assert.equal(checkout.json().paid, false);
    assert.equal(JSON.stringify(checkout.json()).includes(account.apiKey), false);
    const paidPage = (await app.inject({ method: "GET", url: "/hosted" })).body;
    assert.match(paidPage, /去支付宝付款/);
  } finally { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
