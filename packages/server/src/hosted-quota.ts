// Hosted quota ledger foundation. This module does not establish entitlement
// or enable hosted admission; callers must authenticate account and period.
import { DatabaseSync } from "node:sqlite";

export type ReservationState = "reserved" | "sending" | "unknown" | "succeeded" | "cancelled";
export interface QuotaRequest {
  subject: string;
  requestId: string;
  fingerprint: string;
  periodStart: number;
  periodEnd: number;
  limit: number;
  now: number;
  attachmentBytes?: number;
  maxActiveBytes?: number;
}
export type ReserveResult =
  | { status: "reserved" | "existing"; state: ReservationState }
  | { status: "exhausted" };

/** A durable SQLite reservation ledger for an already-authorized service.
 * Unknown remote outcomes retain a slot until explicitly reconciled. */
export class HostedQuotaLedger {
  constructor(private readonly db: DatabaseSync, private readonly runTransaction?: <T>(fn: () => T) => T) {
    db.exec(`
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS hosted_quota_periods (
        subject TEXT NOT NULL, period_start INTEGER NOT NULL, period_end INTEGER NOT NULL,
        allowance INTEGER NOT NULL, PRIMARY KEY(subject, period_start)
      );
      CREATE TABLE IF NOT EXISTS hosted_quota_reservations (
        subject TEXT NOT NULL, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
        period_start INTEGER NOT NULL, period_end INTEGER NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('reserved','sending','unknown','succeeded','cancelled')),
        PRIMARY KEY(subject, request_id)
      );
      CREATE INDEX IF NOT EXISTS hosted_quota_period_idx
        ON hosted_quota_reservations(subject, period_start, state);
    `);
    const columns = db.prepare("PRAGMA table_info(hosted_quota_reservations)").all() as Array<{ name: string }>;
    if (!columns.some(c => c.name === "attachment_bytes")) db.exec("ALTER TABLE hosted_quota_reservations ADD COLUMN attachment_bytes INTEGER NOT NULL DEFAULT 0");
  }

  private transaction<T>(fn: () => T): T {
    if (this.runTransaction) return this.runTransaction(fn);
    this.db.exec("BEGIN IMMEDIATE");
    try { const value = fn(); this.db.exec("COMMIT"); return value; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  reserve(request: QuotaRequest): ReserveResult {
    const { subject, requestId, fingerprint, periodStart, periodEnd, limit, now } = request;
    const attachmentBytes = request.attachmentBytes ?? 0;
    if (!Number.isSafeInteger(attachmentBytes) || attachmentBytes < 0 ||
        (request.maxActiveBytes !== undefined && (!Number.isSafeInteger(request.maxActiveBytes) || request.maxActiveBytes < 0))) throw new Error("INVALID_STORAGE_QUOTA");
    const validId = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= 256;
    if (!validId(subject) || !validId(requestId) || !/^[a-f0-9]{64}$/.test(fingerprint) ||
        !Number.isSafeInteger(periodStart) || !Number.isSafeInteger(periodEnd) || !Number.isSafeInteger(now) ||
        !Number.isSafeInteger(limit) || limit < 0 || periodStart < 0 || periodEnd <= periodStart || now < periodStart || now >= periodEnd) {
      throw new Error("INVALID_QUOTA_REQUEST");
    }
    return this.transaction(() => {
      const existing = this.db.prepare("SELECT fingerprint, period_start, period_end, state, attachment_bytes FROM hosted_quota_reservations WHERE subject = ? AND request_id = ?")
        .get(subject, requestId) as { fingerprint: string; period_start: number; period_end: number; state: ReservationState; attachment_bytes: number } | undefined;
      if (existing) {
        if (existing.fingerprint !== fingerprint || existing.period_start !== periodStart || existing.period_end !== periodEnd || existing.attachment_bytes !== attachmentBytes) throw new Error("QUOTA_REQUEST_CONFLICT");
        if (existing.state !== "cancelled") return { status: "existing", state: existing.state };
      }
      const period = this.db.prepare("SELECT period_end, allowance FROM hosted_quota_periods WHERE subject = ? AND period_start = ?")
        .get(subject, periodStart) as { period_end: number; allowance: number } | undefined;
      if (period && (period.period_end !== periodEnd || period.allowance !== limit)) throw new Error("QUOTA_POLICY_CONFLICT");
      if (!period) {
        const overlap = this.db.prepare("SELECT 1 FROM hosted_quota_periods WHERE subject = ? AND period_start < ? AND period_end > ? LIMIT 1")
          .get(subject, periodEnd, periodStart);
        if (overlap) throw new Error("QUOTA_PERIOD_OVERLAP");
        this.db.prepare("INSERT INTO hosted_quota_periods(subject, period_start, period_end, allowance) VALUES(?, ?, ?, ?)")
          .run(subject, periodStart, periodEnd, limit);
      }
      const used = this.db.prepare("SELECT COUNT(*) AS n FROM hosted_quota_reservations WHERE subject = ? AND period_start = ? AND state IN ('reserved','sending','unknown','succeeded')")
        .get(subject, periodStart) as { n: number };
      if (used.n >= limit) return { status: "exhausted" };
      if (request.maxActiveBytes !== undefined) {
        const held = this.db.prepare("SELECT COALESCE(SUM(attachment_bytes),0) AS n FROM hosted_quota_reservations WHERE subject = ? AND state IN ('reserved','sending','unknown')").get(subject) as { n: number };
        if (held.n + attachmentBytes > request.maxActiveBytes) throw new Error("STORAGE_QUOTA_EXCEEDED");
      }
      if (existing) this.db.prepare("UPDATE hosted_quota_reservations SET state='reserved' WHERE subject=? AND request_id=?").run(subject, requestId);
      else this.db.prepare("INSERT INTO hosted_quota_reservations(subject, request_id, fingerprint, period_start, period_end, state, attachment_bytes) VALUES(?, ?, ?, ?, ?, 'reserved', ?)")
        .run(subject, requestId, fingerprint, periodStart, periodEnd, attachmentBytes);
      return { status: "reserved", state: "reserved" };
    });
  }

  /** Cancel only before any remote side effect. Unknown results stay held. */
  cancelBeforeSend(subject: string, requestId: string): ReservationState {
    return this.transition(subject, requestId, "cancelled", ["reserved", "cancelled"]);
  }

  /** Recheck the trusted service time, then persist before any remote call.
   * The caller must separately recheck current entitlement and account status. */
  beginSend(subject: string, requestId: string, now: number): ReservationState {
    if (!Number.isSafeInteger(now) || now < 0) throw new Error("INVALID_QUOTA_TIME");
    return this.transaction(() => {
      const row = this.db.prepare("SELECT state, period_start, period_end FROM hosted_quota_reservations WHERE subject = ? AND request_id = ?")
        .get(subject, requestId) as { state: ReservationState; period_start: number; period_end: number } | undefined;
      if (!row || row.state !== "reserved") throw new Error("QUOTA_INVALID_TRANSITION");
      if (now < row.period_start || now >= row.period_end) throw new Error("QUOTA_PERIOD_EXPIRED");
      this.db.prepare("UPDATE hosted_quota_reservations SET state = 'sending' WHERE subject = ? AND request_id = ?").run(subject, requestId);
      return "sending";
    });
  }

  /** Only a trusted, definitive rejection proving no draft was created may
   * release a slot after send starts. A timeout or malformed response is not
   * such evidence and must instead be marked unknown. */
  confirmRejected(subject: string, requestId: string): ReservationState {
    return this.transition(subject, requestId, "cancelled", ["sending"]);
  }

  markUnknown(subject: string, requestId: string): ReservationState {
    return this.transition(subject, requestId, "unknown", ["sending", "unknown"]);
  }

  /** Caller must first obtain authoritative proof of the exact successful draft. */
  confirmSuccess(subject: string, requestId: string): ReservationState {
    return this.transition(subject, requestId, "succeeded", ["sending", "unknown", "succeeded"]);
  }

  /** Only the authenticated operator's independently checked absence evidence
   * may release an unknown result. Time passing is never that evidence. */
  cancelUnknownByOperator(subject: string, requestId: string): ReservationState {
    return this.transition(subject, requestId, "cancelled", ["unknown"]);
  }

  /** Trusted operator reconciliation after independently checking WeChat. */
  reconcileByOperator(subject: string, requestId: string, delivered: boolean): void {
    this.transition(subject, requestId, delivered ? "succeeded" : "cancelled", ["reserved", "sending", "unknown"]);
  }

  state(subject: string, requestId: string): ReservationState | undefined {
    return (this.db.prepare("SELECT state FROM hosted_quota_reservations WHERE subject=? AND request_id=?").get(subject, requestId) as { state: ReservationState } | undefined)?.state;
  }

  usage(subject: string, periodStart: number): { succeeded: number; held: number } {
    const counts = this.db.prepare("SELECT state, COUNT(*) AS n FROM hosted_quota_reservations WHERE subject=? AND period_start=? GROUP BY state").all(subject, periodStart) as Array<{ state: ReservationState; n: number }>;
    return { succeeded: counts.find(r => r.state === "succeeded")?.n ?? 0,
      held: counts.filter(r => ["reserved", "sending", "unknown"].includes(r.state)).reduce((n, r) => n + r.n, 0) };
  }

  private transition(subject: string, requestId: string, target: ReservationState, permitted: ReservationState[]): ReservationState {
    return this.transaction(() => {
      const row = this.db.prepare("SELECT state FROM hosted_quota_reservations WHERE subject = ? AND request_id = ?")
        .get(subject, requestId) as { state: ReservationState } | undefined;
      if (!row || !permitted.includes(row.state)) throw new Error("QUOTA_INVALID_TRANSITION");
      if (row.state !== target) this.db.prepare("UPDATE hosted_quota_reservations SET state = ? WHERE subject = ? AND request_id = ?").run(target, subject, requestId);
      return target;
    });
  }
}
