// Development-only signing primitive for Commerce's hosted-proof endpoint.
// This creates no entitlement and is not connected to request admission.
import crypto from "node:crypto";

export interface HostedProofScope {
  issuer: string;
  subjectType: "account";
  subjectId: string;
  offerId: string;
  productId: string;
}

/** Sign the exact request body and scope using Commerce hosted-s2s-v1.
 * Caller-provided identity must come from trusted server-side mapping. */
export function signHostedProofRequest(input: {
  serviceId: string;
  secret: Uint8Array;
  timestamp: number;
  nonce: string;
  scope: HostedProofScope;
  body: Uint8Array;
}): string {
  const { serviceId, secret, timestamp, nonce, scope, body } = input;
  const bounded = (value: unknown): value is string => typeof value === "string" && value.length > 0 && [...value].length <= 256;
  if (!bounded(serviceId) || !bounded(scope.issuer) || scope.subjectType !== "account" ||
      !bounded(scope.subjectId) || !bounded(scope.offerId) || !bounded(scope.productId)) {
    throw new Error("Invalid hosted proof scope");
  }
  if (!(secret instanceof Uint8Array) || secret.byteLength < 32 || secret.byteLength > 128) throw new Error("Invalid service key");
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error("Invalid timestamp");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) throw new Error("Invalid nonce");
  if (!(body instanceof Uint8Array) || body.byteLength > 1024 * 1024) throw new Error("Invalid request body");
  const values: Array<string | Uint8Array> = [serviceId, "POST", "/v1/hosted/proof", String(timestamp), nonce,
    scope.issuer, scope.subjectType, scope.subjectId, scope.offerId, scope.productId, body];
  const mac = crypto.createHmac("sha256", secret);
  mac.update("commerce-hosted-s2s-v1\n", "utf8");
  for (const value of values) {
    const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
    mac.update(String(bytes.byteLength) + ":", "utf8");
    mac.update(bytes);
  }
  return mac.digest("hex");
}
