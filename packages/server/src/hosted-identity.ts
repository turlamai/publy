// Trusted identity mapping foundation. This does not grant hosted access or
// expose an enrollment endpoint; a caller must authenticate the user first.
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export class HostedIdentityBindings {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS hosted_identity_bindings (
        user_id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      )`);
  }

  /** Create once for an authenticated, active local user. The subject is
   * independent of contact details and API keys, and cannot be chosen by a
   * client. Bindings are intentionally never reassigned or deleted here. */
  enroll(userId: string, now: number): string {
    if (typeof userId !== "string" || userId.length === 0 || userId.length > 256 ||
        !Number.isSafeInteger(now) || now < 0) throw new Error("HOSTED_IDENTITY_INVALID_INPUT");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const user = this.db.prepare("SELECT disabled_at FROM users WHERE id = ?").get(userId) as { disabled_at: number } | undefined;
      if (!user || user.disabled_at !== 0) throw new Error("HOSTED_IDENTITY_UNAVAILABLE");
      const existing = this.db.prepare("SELECT subject_id FROM hosted_identity_bindings WHERE user_id = ?")
        .get(userId) as { subject_id: string } | undefined;
      if (existing) {
        this.db.exec("COMMIT");
        return existing.subject_id;
      }
      const subject = `publy_account_${crypto.randomBytes(32).toString("hex")}`;
      this.db.prepare("INSERT INTO hosted_identity_bindings(user_id, subject_id, created_at) VALUES (?, ?, ?)")
        .run(userId, subject, now);
      this.db.exec("COMMIT");
      return subject;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /** Resolve only a previously enrolled active user; absence fails closed. */
  resolve(userId: string): string | null {
    if (typeof userId !== "string" || userId.length === 0 || userId.length > 256) return null;
    const row = this.db.prepare(`SELECT b.subject_id FROM hosted_identity_bindings b
      JOIN users u ON u.id = b.user_id WHERE b.user_id = ? AND u.disabled_at = 0`)
      .get(userId) as { subject_id: string } | undefined;
    return row?.subject_id ?? null;
  }
}
