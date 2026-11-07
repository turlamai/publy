import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { requestHostedCheckout } from "./commerce-checkout-request.js";
import { signHostedCheckoutRequest } from "./commerce-proof-request.js";

test("checkout request authenticates exact bytes and verifies the returned merchant signature", async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const scope = { issuer: "fixture", subjectType: "account" as const, subjectId: "account-a", offerId: "publy-personal-monthly", productId: "publy" };
  const secret = Buffer.alloc(32, 107), orderId = `ali${"a".repeat(32)}`;
  const fields: Record<string, string> = { app_id: "fixture-app", method: "alipay.trade.page.pay", format: "JSON", charset: "utf-8",
    sign_type: "RSA2", timestamp: "2026-11-04 10:00:00", version: "1.0", notify_url: "https://example.test/notify",
    return_url: "https://example.test/return", biz_content: JSON.stringify({ out_trade_no: orderId, total_amount: "29.00", product_code: "FAST_INSTANT_TRADE_PAY" }) };
  const canonical = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("&");
  fields.sign = crypto.sign("sha256", Buffer.from(canonical), { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }).toString("base64");
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(String(url), "http://127.0.0.1:8787/v1/hosted/alipay-checkout");
    assert.equal(init?.redirect, "error");
    const headers = new Headers(init?.headers), body = Buffer.from(init?.body as Uint8Array);
    assert.equal(headers.get("x-commerce-mac"), signHostedCheckoutRequest({ serviceId: "service", secret,
      timestamp: Number(headers.get("x-commerce-timestamp")), nonce: headers.get("x-commerce-nonce")!, scope, body }));
    assert.deepEqual(JSON.parse(body.toString()), { issuer: "fixture", subject_type: "account", subject_id: "account-a",
      offer_id: "publy-personal-monthly", product_id: "publy", request_id: "request-1" });
    return new Response(JSON.stringify({ status: "checkout-ready", order_id: orderId,
      gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do", fields }), { status: 200 });
  };
  const input = { endpoint: "http://127.0.0.1:8787/v1/hosted/alipay-checkout", serviceId: "service", secret, scope,
    requestId: "request-1", environment: "sandbox" as const, appId: "fixture-app", amountFen: 2900,
    merchantPublicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    notifyUrl: fields.notify_url, returnUrl: fields.return_url, fetcher };
  const result = await requestHostedCheckout(input);
  assert.equal(result.status, "ready");
  assert.equal(result.paid, false);
  if (result.status === "ready") assert.equal(result.orderId, orderId);
  assert.equal((await requestHostedCheckout({ ...input, amountFen: 1 })).status, "unknown");
  assert.equal((await requestHostedCheckout({ ...input, appId: "other-app" })).status, "unknown");
  assert.equal((await requestHostedCheckout({ ...input, merchantPublicKeyPem: "invalid" })).status, "unknown");
  const tampered: typeof fetch = async () => new Response(JSON.stringify({ status: "checkout-ready", order_id: orderId,
    gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do", fields: { ...fields, notify_url: "https://attacker.test" } }));
  assert.equal((await requestHostedCheckout({ ...input, fetcher: tampered })).status, "unknown");
  const legacyCanonical = Object.keys(fields).filter((k) => k !== "sign" && k !== "sign_type").sort().map((k) => `${k}=${fields[k]}`).join("&");
  const legacySignature = crypto.sign("sha256", Buffer.from(legacyCanonical), { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }).toString("base64");
  const incorrectlySigned: typeof fetch = async () => new Response(JSON.stringify({ status: "checkout-ready", order_id: orderId,
    gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do", fields: { ...fields, sign: legacySignature } }));
  assert.equal((await requestHostedCheckout({ ...input, fetcher: incorrectlySigned })).status, "unknown");
  assert.equal((await requestHostedCheckout({ ...input, endpoint: "http://remote.example/v1/hosted/alipay-checkout" })).status, "unknown");
  assert.equal(calls, 4, "invalid endpoint must not make a request");
  assert.equal((await requestHostedCheckout({ ...input, fetcher: async () => { throw new Error("synthetic network failure"); } })).status, "unknown");
});
