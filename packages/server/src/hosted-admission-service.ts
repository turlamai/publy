// Current-state proof + independent Permit admission + durable fence.
// A valid signature alone is not enough: the proof must come from Commerce's
// current-state endpoint, the edition must be entitled at trusted server time,
// and the revision must advance the stored fence. Any failure denies.
import { observeHostedProof, type HostedProofScope } from "./commerce-proof-request.js";
import { verifyHostedAdmission } from "./hosted-admission.js";
import type { HostedEntitlementFence } from "./hosted-entitlement-fence.js";

export interface HostedAdmissionDecision {
  allowed: boolean;
  status: "admitted" | "denied";
  reason?: string;
  entitlementId?: string;
  revision?: number;
  useExpiresAt?: string;
}

const deny = (reason: string): HostedAdmissionDecision => ({ allowed: false, status: "denied", reason });

export async function checkHostedAdmission(input: {
  endpoint: string;
  serviceId: string;
  secret: Uint8Array;
  issuer: string;
  offerId: string;
  subject: string;
  plan: "personal" | "studio";
  racketExecutable: string;
  verifierScript: string;
  trustStore: string;
  fence: HostedEntitlementFence;
  enroll: boolean;
  now?: number;
  fetcher?: typeof fetch;
}): Promise<HostedAdmissionDecision> {
  if (typeof input.subject !== "string" || input.subject.length === 0 || input.subject.length > 256 ||
      typeof input.offerId !== "string" || input.offerId.length === 0 || input.offerId.length > 256 ||
      !["personal", "studio"].includes(input.plan) || typeof input.enroll !== "boolean") return deny("invalid-input");
  const scope: HostedProofScope = { issuer: input.issuer, subjectType: "account", subjectId: input.subject,
    offerId: input.offerId, productId: "publy" };
  try {
    const previous = input.fence.lookup(input.subject, input.offerId);
    // First enrollment is an explicit operator decision, never a client flag.
    if (!previous && !input.enroll) return deny("not-enrolled");
    const observation = await observeHostedProof({ endpoint: input.endpoint, serviceId: input.serviceId,
      secret: input.secret, scope, minimumRevision: previous?.revision ?? null,
      expectedEntitlementId: previous?.entitlementId ?? null, fetcher: input.fetcher });
    if (observation.status !== "verified-proof") return deny(`proof-${observation.status}`);
    const at = new Date(input.now ?? Date.now()).toISOString();
    const verified = await verifyHostedAdmission({ credential: observation.credential, account: input.subject,
      plan: input.plan, at, entitlementId: observation.entitlementId,
      minimumRevision: previous?.revision, racketExecutable: input.racketExecutable,
      verifierScript: input.verifierScript, trustStore: input.trustStore });
    if (!verified.allowed || !verified.entitlementId || verified.revision === undefined || !verified.payloadSha256 ||
        verified.entitlementId !== observation.entitlementId || verified.revision !== observation.revision) {
      return deny("permit-denied");
    }
    input.fence.record({ subject: input.subject, offer: input.offerId, entitlementId: verified.entitlementId,
      revision: verified.revision, payloadSha256: verified.payloadSha256 }, input.enroll);
    return { allowed: true, status: "admitted", entitlementId: verified.entitlementId, revision: verified.revision,
      useExpiresAt: verified.useExpiresAt };
  } catch {
    // Missing storage, stale/conflicting fence, verifier crash and timeouts all
    // become the same fail-closed decision; no internal state leaks to callers.
    return deny("unavailable");
  }
}
