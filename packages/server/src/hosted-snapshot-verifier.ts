// Internal bridge for the pinned Permit verifier. A verified snapshot is not
// current Commerce state and never authorizes a hosted action.
import { spawn } from "node:child_process";
import path from "node:path";
import type { HostedProofObservation } from "./commerce-proof-request.js";
import type { HostedEntitlementFence } from "./hosted-entitlement-fence.js";

export type VerifiedSnapshot = {
  status: "verified-snapshot";
  canAuthorize: false;
  subject: string;
  entitlementId: string;
  revision: number;
  payloadSha256: string;
};

export interface HostedSnapshotVerifierInput {
  /** These paths and the account/plan come from trusted server configuration. */
  racketExecutable: string;
  verifierScript: string;
  trustStore: string;
  subject: string;
  plan: "personal" | "studio";
  observation: HostedProofObservation;
}

export async function verifyHostedSnapshot(input: HostedSnapshotVerifierInput): Promise<VerifiedSnapshot | null> {
  const validPath = (value: unknown): value is string => typeof value === "string" && path.isAbsolute(value) && !value.includes("\0");
  const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256;
  const observed = input.observation;
  if (!validPath(input.racketExecutable) || !validPath(input.verifierScript) || !validPath(input.trustStore) ||
      !validId(input.subject) || !["personal", "studio"].includes(input.plan) || !observed ||
      (observed.status !== "verified-proof" && observed.status !== "recorded-withdrawal") ||
      observed.canAuthorize !== false || !validId(observed.entitlementId) ||
      !Number.isSafeInteger(observed.revision) || observed.revision < 0 ||
      !observed.credential || typeof observed.credential !== "object" || Array.isArray(observed.credential)) return null;
  let body: string;
  try {
    body = JSON.stringify({ account: input.subject, plan: input.plan, entitlement_id: observed.entitlementId,
      revision: observed.revision, credential: observed.credential });
  } catch { return null; }
  if (Buffer.byteLength(body, "utf8") > 1024 * 1024) return null;

  return await new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      // The verifier needs runtime and temporary-directory settings, not the
      // parent service's payment, account or signing environment variables.
      const env: NodeJS.ProcessEnv = {};
      for (const key of ["PATH", "HOME", "USERPROFILE", "PLTCOLLECTS", "PLTUSERHOME", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR"]) {
        if (process.env[key] !== undefined) env[key] = process.env[key];
      }
      child = spawn(input.racketExecutable, [input.verifierScript, input.trustStore], { stdio: ["pipe", "pipe", "ignore"], shell: false, env });
    } catch { resolve(null); return; }
    const stdin = child.stdin, stdout = child.stdout;
    if (!stdin || !stdout) { child.kill(); resolve(null); return; }
    let settled = false, size = 0;
    const chunks: Buffer[] = [];
    const finish = (result: VerifiedSnapshot | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => { child.kill(); finish(null); }, 5000);
    child.on("error", () => finish(null));
    stdin.on("error", () => { child.kill(); finish(null); });
    stdout.on("error", () => { child.kill(); finish(null); });
    stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 16384) { child.kill(); finish(null); } else chunks.push(chunk);
    });
    child.on("close", (code) => {
      if (code !== 0 || settled) { finish(null); return; }
      try {
        const result: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
        if (!result || typeof result !== "object" || Array.isArray(result)) { finish(null); return; }
        const r = result as Record<string, unknown>;
        if (r.status !== "verified-snapshot" || r.authorizes_use !== false || r.entitlement_id !== observed.entitlementId ||
            r.revision !== observed.revision || typeof r.payload_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(r.payload_sha256)) {
          finish(null); return;
        }
        finish({ status: "verified-snapshot", canAuthorize: false, subject: input.subject,
          entitlementId: observed.entitlementId, revision: observed.revision, payloadSha256: r.payload_sha256 });
      } catch { finish(null); }
    });
    stdin.end(body);
  });
}

/** Verify before advancing the durable fence. Enrollment is an explicit,
 * trusted operator decision, never a client-supplied HTTP flag. This still
 * does not authorize work or replace a fresh Commerce-state check. */
export async function verifyAndFenceHostedSnapshot(input: HostedSnapshotVerifierInput & {
  fence: HostedEntitlementFence;
  offer: string;
  enroll: boolean;
}): Promise<VerifiedSnapshot | null> {
  if (typeof input.offer !== "string" || input.offer.length === 0 || input.offer.length > 256 || typeof input.enroll !== "boolean") return null;
  const verified = await verifyHostedSnapshot(input);
  if (!verified) return null;
  try {
    input.fence.record({ subject: verified.subject, offer: input.offer, entitlementId: verified.entitlementId,
      revision: verified.revision, payloadSha256: verified.payloadSha256 }, input.enroll);
    return verified;
  } catch {
    // Stale, conflicting, unenrolled and damaged fence state fail closed.
    return null;
  }
}
