// Durable anti-rollback fence. This does not authenticate an account, verify
// a Permit signature, or grant hosted access; callers must do those separately.
import { DatabaseSync } from "node:sqlite";

const validId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 256;
type FenceRow = { entitlement_id: string; revision: number; payload_sha256: string };
function assertValidRow(row: FenceRow): void {
  if (!validId(row.entitlement_id) || !Number.isSafeInteger(row.revision) || row.revision < 0 ||
      typeof row.payload_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(row.payload_sha256)) throw new Error("FENCE_CORRUPT_STATE");
}

export interface EntitlementRevision {
  subject: string;
  offer: string;
  entitlementId: string;
  revision: number;
  /** SHA-256 of the authenticated, exact signed payload bytes. */
  payloadSha256: string;
}

export class HostedEntitlementFence {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS hosted_entitlement_fences (
        subject TEXT NOT NULL, offer TEXT NOT NULL, entitlement_id TEXT NOT NULL,
        revision INTEGER NOT NULL, payload_sha256 TEXT NOT NULL,
        PRIMARY KEY(subject, offer)
      )`);
  }

  /** Supply the remembered identity and revision to the next trusted
   * Commerce query; this is neither current state nor permission to use it. */
  lookup(subject: string, offer: string): { entitlementId: string; revision: number; payloadSha256: string } | null {
    if (!validId(subject) || !validId(offer)) throw new Error("FENCE_INVALID_INPUT");
    const row = this.db.prepare("SELECT entitlement_id, revision, payload_sha256 FROM hosted_entitlement_fences WHERE subject = ? AND offer = ?")
      .get(subject, offer) as FenceRow | undefined;
    if (!row) return null;
    assertValidRow(row);
    return { entitlementId: row.entitlement_id, revision: row.revision, payloadSha256: row.payload_sha256 };
  }

  /** Enrollment must be a separate trusted decision, never an HTTP flag. */
  record(value: EntitlementRevision, enroll: boolean): "enrolled" | "unchanged" | "advanced" {
    if (!validId(value.subject) || !validId(value.offer) || !validId(value.entitlementId) || !Number.isSafeInteger(value.revision) ||
        value.revision < 0 || !/^[a-f0-9]{64}$/.test(value.payloadSha256) || typeof enroll !== "boolean") throw new Error("FENCE_INVALID_INPUT");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.db.prepare("SELECT entitlement_id, revision, payload_sha256 FROM hosted_entitlement_fences WHERE subject = ? AND offer = ?")
        .get(value.subject, value.offer) as FenceRow | undefined;
      let result: "enrolled" | "unchanged" | "advanced";
      if (!previous) {
        if (!enroll) throw new Error("FENCE_NOT_ENROLLED");
        this.db.prepare("INSERT INTO hosted_entitlement_fences(subject, offer, entitlement_id, revision, payload_sha256) VALUES (?, ?, ?, ?, ?)")
          .run(value.subject, value.offer, value.entitlementId, value.revision, value.payloadSha256);
        result = "enrolled";
      } else {
        assertValidRow(previous);
        if (previous.entitlement_id !== value.entitlementId) throw new Error("FENCE_LINEAGE_MISMATCH");
        if (value.revision < previous.revision) throw new Error("FENCE_STALE_REVISION");
        if (value.revision === previous.revision && previous.payload_sha256 !== value.payloadSha256) throw new Error("FENCE_REVISION_CONFLICT");
        if (value.revision === previous.revision) result = "unchanged";
        else {
          this.db.prepare("UPDATE hosted_entitlement_fences SET revision = ?, payload_sha256 = ? WHERE subject = ? AND offer = ?")
            .run(value.revision, value.payloadSha256, value.subject, value.offer);
          result = "advanced";
        }
      }
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
