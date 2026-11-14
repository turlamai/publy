// Internal development integration. A signed checkout request is not payment
// evidence and does not authorize hosted service or open public checkout.
import crypto from "node:crypto";
import { signHostedCheckoutRequest, type HostedProofScope } from "./commerce-proof-request.js";

export type CheckoutObservation =
  | { status: "ready"; orderId: string; gateway: string; fields: Record<string, string>; paid: false }
  | { status: "unknown"; paid: false };

/** Ask a configured Commerce service to prepare a checkout. Retry only with
 * the original requestId and a fresh transport nonce. Network or malformed
 * responses are unknown, since Commerce may already have bound an order. */
export async function requestHostedCheckout(input: {
  endpoint: string;
  serviceId: string;
  secret: Uint8Array;
  scope: HostedProofScope;
  requestId: string;
  environment: "sandbox" | "production";
  appId: string;
  merchantPublicKeyPem: string;
  amountFen: number;
  notifyUrl: string;
  returnUrl: string;
  fetcher?: typeof fetch;
}): Promise<CheckoutObservation> {
  const unknown = (): CheckoutObservation => ({ status: "unknown", paid: false });
  try {
    const endpoint = new URL(input.endpoint);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
    if ((endpoint.protocol !== "https:" && !(loopback && endpoint.protocol === "http:")) || endpoint.username || endpoint.password ||
        endpoint.pathname !== "/v1/hosted/alipay-checkout" || endpoint.search || endpoint.hash ||
        !["sandbox", "production"].includes(input.environment) || typeof input.requestId !== "string" ||
        input.requestId.length < 1 || input.requestId.length > 256 || !Number.isSafeInteger(input.amountFen) || input.amountFen <= 0 ||
        typeof input.appId !== "string" || !input.appId || typeof input.merchantPublicKeyPem !== "string" || !input.merchantPublicKeyPem ||
        typeof input.notifyUrl !== "string" || typeof input.returnUrl !== "string") return unknown();
    const body = Buffer.from(JSON.stringify({ issuer: input.scope.issuer, subject_type: input.scope.subjectType,
      subject_id: input.scope.subjectId, offer_id: input.scope.offerId, product_id: input.scope.productId,
      request_id: input.requestId }), "utf8");
    const timestamp = Math.floor(Date.now() / 1000), nonce = crypto.randomBytes(24).toString("base64url");
    const mac = signHostedCheckoutRequest({ serviceId: input.serviceId, secret: input.secret, timestamp, nonce, scope: input.scope, body });
    const response = await (input.fetcher ?? fetch)(endpoint, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(5000), body,
      headers: { "content-type": "application/json", "x-commerce-service-id": input.serviceId,
        "x-commerce-timestamp": String(timestamp), "x-commerce-nonce": nonce, "x-commerce-mac": mac },
    });
    if (response.status !== 200 || !response.body) return unknown();
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024 * 1024) { await reader.cancel(); return unknown(); }
      chunks.push(part.value);
    }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    if (!value || typeof value !== "object" || Array.isArray(value)) return unknown();
    const result = value as Record<string, unknown>;
    const gateway = input.environment === "sandbox" ? "https://openapi-sandbox.dl.alipaydev.com/gateway.do" : "https://openapi.alipay.com/gateway.do";
    if (result.status !== "checkout-ready" || result.gateway !== gateway || typeof result.order_id !== "string" ||
        !/^ali[a-f0-9]{32}$/.test(result.order_id) || !result.fields || typeof result.fields !== "object" || Array.isArray(result.fields)) return unknown();
    const entries = Object.entries(result.fields);
    if (entries.length < 1 || entries.length > 32 || entries.some(([key, val]) =>
      !/^[a-z][a-z0-9_]{0,63}$/.test(key) || typeof val !== "string" || val.length > 65536)) return unknown();
    const fields = Object.fromEntries(entries) as Record<string, string>;
    const expectedFields = ["app_id", "method", "format", "charset", "sign_type", "timestamp", "version", "notify_url", "return_url", "biz_content", "sign"];
    if (entries.length !== expectedFields.length || expectedFields.some((name) => !Object.hasOwn(fields, name))) return unknown();
    if (fields.app_id !== input.appId || fields.method !== "alipay.trade.page.pay" || fields.sign_type !== "RSA2" ||
        fields.format !== "JSON" || fields.charset !== "utf-8" || fields.version !== "1.0" ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(fields.sign) || fields.notify_url !== input.notifyUrl || fields.return_url !== input.returnUrl) return unknown();
    const publicKey = crypto.createPublicKey(input.merchantPublicKeyPem);
    if (publicKey.asymmetricKeyType !== "rsa" || (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) return unknown();
    // This is an outbound OpenAPI request, not an asynchronous notification:
    // sign_type is signed. Only the signature itself is excluded.
    const signingContent = Object.keys(fields).filter((key) => key !== "sign").sort()
      .map((key) => `${key}=${fields[key]}`).join("&");
    if (!crypto.verify("sha256", Buffer.from(signingContent), { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(fields.sign, "base64"))) return unknown();
    const business: unknown = JSON.parse(fields.biz_content);
    if (!business || typeof business !== "object" || Array.isArray(business)) return unknown();
    const content = business as Record<string, unknown>;
    const amount = `${Math.floor(input.amountFen / 100)}.${String(input.amountFen % 100).padStart(2, "0")}`;
    if (content.out_trade_no !== result.order_id || content.total_amount !== amount || content.product_code !== "FAST_INSTANT_TRADE_PAY") return unknown();
    return { status: "ready", orderId: result.order_id, gateway, fields, paid: false };
  } catch {
    // Never forward response bodies, signing material or endpoint details.
    return unknown();
  }
}
