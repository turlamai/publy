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

/** A shadow observation is not proof that a customer is entitled to use Publy.
 * Independent Permit verification, current-state fencing and quota admission
 * remain mandatory before any hosted feature can be enabled. */
export type HostedProofObservation =
  | { kind: "shadow-observation"; canAuthorize: false; status: "verified-proof"; entitlementId: string; revision: number; credential: object }
  | { kind: "shadow-observation"; canAuthorize: false; status: "no-proof" | "unavailable" };

export async function observeHostedProof(input: {
  endpoint: string;
  serviceId: string;
  secret: Uint8Array;
  scope: HostedProofScope;
  minimumRevision: number | null;
  expectedEntitlementId: string | null;
  fetcher?: typeof fetch;
}): Promise<HostedProofObservation> {
  const unavailable = (): HostedProofObservation => ({ kind: "shadow-observation", canAuthorize: false, status: "unavailable" });
  try {
    const endpoint = new URL(input.endpoint);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
    if ((endpoint.protocol !== "https:" && !(loopback && endpoint.protocol === "http:")) || endpoint.username || endpoint.password ||
        endpoint.pathname !== "/v1/hosted/proof" || endpoint.search || endpoint.hash) return unavailable();
    if ((input.minimumRevision !== null && (!Number.isSafeInteger(input.minimumRevision) || input.minimumRevision < 0)) ||
        (input.expectedEntitlementId !== null && (typeof input.expectedEntitlementId !== "string" || input.expectedEntitlementId.length < 1 || input.expectedEntitlementId.length > 256)) ||
        ((input.minimumRevision === null) !== (input.expectedEntitlementId === null))) return unavailable();
    const body = Buffer.from(JSON.stringify({ issuer: input.scope.issuer, subject_type: input.scope.subjectType,
      subject_id: input.scope.subjectId, offer_id: input.scope.offerId, product_id: input.scope.productId,
      minimum_revision: input.minimumRevision, expected_entitlement_id: input.expectedEntitlementId }), "utf8");
    const timestamp = Math.floor(Date.now() / 1000), nonce = crypto.randomBytes(24).toString("base64url");
    const mac = signHostedProofRequest({ serviceId: input.serviceId, secret: input.secret, timestamp, nonce, scope: input.scope, body });
    const response = await (input.fetcher ?? fetch)(endpoint, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(5000), body,
      headers: { "content-type": "application/json", "x-commerce-service-id": input.serviceId,
        "x-commerce-timestamp": String(timestamp), "x-commerce-nonce": nonce, "x-commerce-mac": mac },
    });
    if (response.status !== 200 || !response.body) return unavailable();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024 * 1024) { await reader.cancel(); return unavailable(); }
      chunks.push(part.value);
    }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    if (!value || typeof value !== "object" || Array.isArray(value)) return unavailable();
    const result = value as Record<string, unknown>;
    if (result.status !== "verified-proof") return { kind: "shadow-observation", canAuthorize: false, status: "no-proof" };
    if (typeof result.entitlement_id !== "string" || result.entitlement_id.length === 0 || result.entitlement_id.length > 256 ||
        !Number.isSafeInteger(result.revision) || (result.revision as number) < 0 ||
        !result.credential || typeof result.credential !== "object" || Array.isArray(result.credential)) return unavailable();
    return { kind: "shadow-observation", canAuthorize: false, status: "verified-proof", entitlementId: result.entitlement_id,
      revision: result.revision as number, credential: result.credential as object };
  } catch {
    // Never propagate provider bodies, URLs, headers or key material.
    return unavailable();
  }
}
