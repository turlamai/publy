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
