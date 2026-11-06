// Development-only reconciliation. This does not admit paid work.
import { observeHostedProof, type HostedProofScope } from "./commerce-proof-request.js";
import type { HostedEntitlementFence } from "./hosted-entitlement-fence.js";
import { verifyAndFenceHostedSnapshot, type VerifiedSnapshot } from "./hosted-snapshot-verifier.js";

export async function observeAndFenceHostedSnapshot(input: {
  endpoint: string;
  serviceId: string;
  secret: Uint8Array;
  /** Scope, plan, verifier paths and enrollment are trusted server inputs. */
  scope: HostedProofScope;
  plan: "personal" | "studio";
  racketExecutable: string;
  verifierScript: string;
  trustStore: string;
  fence: HostedEntitlementFence;
  enroll: boolean;
  fetcher?: typeof fetch;
}): Promise<VerifiedSnapshot | null> {
  if (input.scope?.subjectType !== "account" || input.scope.productId !== "publy" ||
      !["personal", "studio"].includes(input.plan) || typeof input.enroll !== "boolean") return null;
  try {
    const previous = input.fence.lookup(input.scope.subjectId, input.scope.offerId);
    // A missing fence is not permission to start a new lineage. Only an
    // operator-controlled enrollment procedure may allow the first snapshot.
    if (!previous && !input.enroll) return null;
    const observation = await observeHostedProof({ endpoint: input.endpoint, serviceId: input.serviceId,
      secret: input.secret, scope: input.scope, minimumRevision: previous?.revision ?? null,
      expectedEntitlementId: previous?.entitlementId ?? null, fetcher: input.fetcher });
    return await verifyAndFenceHostedSnapshot({ observation, subject: input.scope.subjectId, plan: input.plan,
      racketExecutable: input.racketExecutable, verifierScript: input.verifierScript, trustStore: input.trustStore,
      fence: input.fence, offer: input.scope.offerId, enroll: input.enroll });
  } catch {
    // Corrupt, unavailable or inconsistent state never becomes permission.
    return null;
  }
}
