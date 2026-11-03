import { test } from "node:test";
import assert from "node:assert/strict";
import { signHostedProofRequest } from "./commerce-proof-request.js";

// Expected output produced by commerce/hosted-auth.rkt at Commerce commit
// 61d12372f8dcfeb1a9a997f63a07bc5583c226ca with this exact UTF-8 fixture.
test("hosted proof MAC matches Commerce's Racket framing, including Unicode", () => {
  const fixture = {
    serviceId: "publy-service", secret: Buffer.alloc(32, 107), timestamp: 1793678400,
    nonce: "abcdefghijklmnop", scope: { issuer: "issuer", subjectType: "account" as const,
      subjectId: "客户:一", offerId: "personal-monthly", productId: "publy" },
    body: Buffer.from('{"fixture":true}'),
  };
  const mac = signHostedProofRequest(fixture);
  assert.equal(mac, "7f92049f7ad80da4c83a2cf0df95110fe2ba33a373d59c64f8bc1ef8cb216f44");
  assert.notEqual(signHostedProofRequest({ ...fixture, body: Buffer.from('{"fixture":false}') }), mac);
  assert.notEqual(signHostedProofRequest({ ...fixture, scope: { ...fixture.scope, subjectId: "other" } }), mac);
  assert.throws(() => signHostedProofRequest({ ...fixture, secret: Buffer.alloc(31) }));
  assert.throws(() => signHostedProofRequest({ ...fixture, nonce: "short" }));
});

test("hosted proof observation signs the exact bytes and never grants access", async () => {
  const { observeHostedProof } = await import("./commerce-proof-request.js");
  const scope = { issuer: "issuer", subjectType: "account" as const, subjectId: "客户:一", offerId: "personal-monthly", productId: "publy" };
  const secret = Buffer.alloc(32, 107);
  let requests = 0;
  const fetcher: typeof fetch = async (url, init) => {
    requests++;
    assert.equal(String(url), "http://127.0.0.1:8787/v1/hosted/proof");
    assert.equal(init?.redirect, "error");
    const headers = new Headers(init?.headers);
    const body = Buffer.from(init?.body as Uint8Array);
    assert.equal(headers.get("x-commerce-mac"), signHostedProofRequest({ serviceId: "publy-service", secret,
      timestamp: Number(headers.get("x-commerce-timestamp")), nonce: headers.get("x-commerce-nonce")!, scope, body }));
    return new Response(JSON.stringify({ status: "verified-proof", entitlement_id: "ent-test", revision: 4, credential: { synthetic: true } }), { status: 200 });
  };
  const input = { endpoint: "http://127.0.0.1:8787/v1/hosted/proof", serviceId: "publy-service", secret, scope,
    minimumRevision: null, expectedEntitlementId: null, fetcher };
  const observation = await observeHostedProof(input);
  assert.equal(observation.status, "verified-proof");
  assert.equal(observation.canAuthorize, false);
  assert.equal(requests, 1);
  assert.equal((await observeHostedProof({ ...input, endpoint: "http://remote.example/v1/hosted/proof" })).status, "unavailable");
  assert.equal((await observeHostedProof({ ...input, minimumRevision: 1 })).status, "unavailable");
  assert.equal(requests, 1, "invalid configuration must not make a network request");
  const denied = await observeHostedProof({ ...input, fetcher: async () => new Response('{"status":"refund-pending"}', { status: 200 }) });
  assert.deepEqual(denied, { kind: "shadow-observation", canAuthorize: false, status: "no-proof" });
  const malformed = await observeHostedProof({ ...input, fetcher: async () => new Response('{"status":"verified-proof"}', { status: 200 }) });
  assert.equal(malformed.status, "unavailable");
  const oversized = await observeHostedProof({ ...input, fetcher: async () => new Response("x".repeat(1024 * 1024 + 1), { status: 200 }) });
  assert.equal(oversized.status, "unavailable");
});
