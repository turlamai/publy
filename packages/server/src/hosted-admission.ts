// Independent Permit admission check. It accepts only a signed credential
// returned by Commerce's current-state proof endpoint; a valid signature alone
// is not payment evidence or a local paid flag.
import { spawn } from "node:child_process";
import path from "node:path";

export interface HostedAdmissionResult {
  allowed: boolean;
  status: "admitted" | "denied";
  entitlementId?: string;
  revision?: number;
  payloadSha256?: string;
  useExpiresAt?: string;
}

const denied = (): HostedAdmissionResult => ({ allowed: false, status: "denied" });

export async function verifyHostedAdmission(input: {
  credential: object;
  account: string;
  plan: "personal" | "studio";
  at: string;
  entitlementId?: string;
  minimumRevision?: number;
  racketExecutable: string;
  verifierScript: string;
  trustStore: string;
}): Promise<HostedAdmissionResult> {
  const validPath = (value: unknown): value is string => typeof value === "string" && path.isAbsolute(value) && !value.includes("\0");
  if (!input.credential || typeof input.credential !== "object" || Array.isArray(input.credential) ||
      typeof input.account !== "string" || input.account.length === 0 || input.account.length > 256 ||
      !["personal", "studio"].includes(input.plan) || typeof input.at !== "string" || input.at.length === 0 ||
      !validPath(input.racketExecutable) || !validPath(input.verifierScript) || !validPath(input.trustStore) ||
      (input.entitlementId !== undefined && (typeof input.entitlementId !== "string" || input.entitlementId.length === 0)) ||
      (input.minimumRevision !== undefined && (!Number.isSafeInteger(input.minimumRevision) || input.minimumRevision < 0))) return denied();
  let body: string;
  try {
    body = JSON.stringify({ credential: input.credential, account: input.account, plan: input.plan, at: input.at,
      entitlement_id: input.entitlementId ?? null, minimum_revision: input.minimumRevision ?? null });
  } catch { return denied(); }
  if (Buffer.byteLength(body, "utf8") > 1024 * 1024) return denied();

  return await new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      const env: NodeJS.ProcessEnv = {};
      for (const key of ["PATH", "PLTCOLLECTS", "PLTUSERHOME", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR"]) {
        if (process.env[key] !== undefined) env[key] = process.env[key];
      }
      child = spawn(input.racketExecutable, [input.verifierScript, input.trustStore], { stdio: ["pipe", "pipe", "ignore"], shell: false, env });
    } catch { resolve(denied()); return; }
    const stdin = child.stdin, stdout = child.stdout;
    if (!stdin || !stdout) { child.kill(); resolve(denied()); return; }
    let settled = false, size = 0;
    const chunks: Buffer[] = [];
    const finish = (result: HostedAdmissionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => { child.kill(); finish(denied()); }, 5000);
    child.on("error", () => finish(denied()));
    stdin.on("error", () => { child.kill(); finish(denied()); });
    stdout.on("error", () => { child.kill(); finish(denied()); });
    stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 16384) { child.kill(); finish(denied()); } else chunks.push(chunk);
    });
    child.on("close", (code) => {
      if (code !== 0 || settled) { finish(denied()); return; }
      try {
        const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
        if (!value || typeof value !== "object" || Array.isArray(value)) { finish(denied()); return; }
        const r = value as Record<string, unknown>;
        if (r.status !== "admitted" || r.authorizes_use !== true ||
            typeof r.entitlement_id !== "string" || !r.entitlement_id || r.entitlement_id.length > 256 ||
            !Number.isSafeInteger(r.revision) || (r.revision as number) < 0 ||
            typeof r.payload_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(r.payload_sha256) ||
            typeof r.use_expires_at !== "string" ||
            (input.entitlementId !== undefined && r.entitlement_id !== input.entitlementId) ||
            (input.minimumRevision !== undefined && (r.revision as number) < input.minimumRevision)) { finish(denied()); return; }
        finish({ allowed: true, status: "admitted", entitlementId: r.entitlement_id, revision: r.revision as number,
          payloadSha256: r.payload_sha256, useExpiresAt: r.use_expires_at });
      } catch { finish(denied()); }
    });
    stdin.end(body);
  });
}
