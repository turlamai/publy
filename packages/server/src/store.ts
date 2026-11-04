// Multi-user storage on node:sqlite (stdlib, zero deps).
// users:    one row per paying/registered customer — apiKey is their credential
// accounts: wechat accounts customers may publish to (AppSecret stays server-side)
// orders:   purchase orders (payment provider reference, plan, months)

import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { HostedIdentityBindings } from "./hosted-identity.js";

export type Plan = "free" | "personal" | "studio";

export interface UserRow {
  id: string;
  contact: string;
  apiKey: string;
  plan: Plan;
  /** pro expiry, epoch ms; 0 = n/a */
  expiresAt: number;
  /** usage counter + calendar month key (Asia/Shanghai) */
  publishCount: number;
  monthKey: string;
  /** epoch ms when the user was disabled; 0 = active */
  disabledAt: number;
  createdAt: number;
}

export interface AccountRow {
  name: string;
  appId: string;
  appSecret: string;
  /** user id that owns this account (null = admin/shared) */
  ownerUserId: string | null;
}

export interface OrderRow {
  id: string;
  contact: string;
  plan: Plan;
  months: number;
  amountFen: number;
  provider: string;
  status: "pending" | "paid";
  userId: string | null;
  createdAt: number;
  paidAt: number;
}

/** Plan allowances mirror PRICING.md `2026-10-v2`: Personal = 1 account /
 *  30 successful jobs per month, Studio = 3 accounts / 150 jobs. `free` is
 *  the operator-issued evaluation tier, not a published offer. */
export const PLAN_LIMITS: Record<Plan, { monthlyPublishes: number; accounts: number }> = {
  free: { monthlyPublishes: 30, accounts: 1 },
  personal: { monthlyPublishes: 30, accounts: 1 },
  studio: { monthlyPublishes: 150, accounts: 3 },
};

/** quota period key — PRICING `2026-10-v2`: quotas follow the UTC payment
 *  billing cycle, no rollover between periods */
export function monthKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 7); // UTC YYYY-MM
}

function newId(): string {
  return crypto.randomUUID();
}

export function newApiKey(): string {
  return `publy_${crypto.randomBytes(24).toString("hex")}`;
}

export class Store {
  private db: DatabaseSync;
  private hostedIdentities: HostedIdentityBindings;
  private secretKey: string | null = null;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, "users.db"));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        contact TEXT NOT NULL UNIQUE,
        api_key TEXT NOT NULL UNIQUE,
        plan TEXT NOT NULL DEFAULT 'free',
        expires_at INTEGER NOT NULL DEFAULT 0,
        publish_count INTEGER NOT NULL DEFAULT 0,
        month_key TEXT NOT NULL DEFAULT '',
        disabled_at INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS accounts (
        name TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        app_secret TEXT NOT NULL,
        owner_user_id TEXT
      );
      CREATE TABLE IF NOT EXISTS immediate_publish_claims (
        request_key TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending', 'confirmed')),
        media_id TEXT,
        completed_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        contact TEXT NOT NULL,
        plan TEXT NOT NULL,
        months INTEGER NOT NULL,
        amount_fen INTEGER NOT NULL,
        provider TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        user_id TEXT,
        created_at INTEGER NOT NULL,
        paid_at INTEGER NOT NULL DEFAULT 0
      );
    `);
    this.hostedIdentities = new HostedIdentityBindings(this.db);
  }

  /** close the sqlite handle (fastify onClose hook) */
  close(): void {
    this.db.close();
  }

  private toUser(r: Record<string, unknown>): UserRow {
    return {
      id: r.id as string,
      contact: r.contact as string,
      apiKey: r.api_key as string,
      plan: r.plan as Plan,
      expiresAt: r.expires_at as number,
      publishCount: r.publish_count as number,
      monthKey: r.month_key as string,
      disabledAt: r.disabled_at as number,
      createdAt: r.created_at as number,
    };
  }

  // --- users ---------------------------------------------------------------

  createUser(contact: string, plan: Plan, months: number): UserRow {
    const now = Date.now();
    const expiresAt = plan === "free" ? 0 : now + months * 30 * 24 * 3600 * 1000;
    const stmt = this.db.prepare(
      "INSERT INTO users (id, contact, api_key, plan, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const user: UserRow = {
      id: newId(),
      contact,
      apiKey: newApiKey(),
      plan,
      expiresAt,
      publishCount: 0,
      monthKey: monthKey(now),
      disabledAt: 0,
      createdAt: now,
    };
    stmt.run(user.id, contact, user.apiKey, plan, expiresAt, now);
    return user;
  }

  findUserByContact(contact: string): UserRow | null {
    const row = this.db.prepare("SELECT * FROM users WHERE contact = ?").get(contact) as Record<string, unknown> | undefined;
    return row ? this.toUser(row) : null;
  }

  findUserByKey(apiKey: string): UserRow | null {
    const row = this.db.prepare("SELECT * FROM users WHERE api_key = ?").get(apiKey) as Record<string, unknown> | undefined;
    return row ? this.toUser(row) : null;
  }

  findUserById(id: string): UserRow | null {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? this.toUser(row) : null;
  }

  listUsers(): UserRow[] {
    return (this.db.prepare("SELECT * FROM users ORDER BY created_at DESC").all() as Record<string, unknown>[]).map((r) => this.toUser(r));
  }

  /** Internal enrollment only. The caller must authenticate the user and
   * separately establish that this is a new, not restored, binding. */
  enrollHostedSubject(userId: string): string {
    return this.hostedIdentities.enroll(userId, Date.now());
  }

  /** Internal lookup; an absent or disabled user cannot resolve a subject. */
  resolveHostedSubject(userId: string): string | null {
    return this.hostedIdentities.resolve(userId);
  }

  /** paid expiry extension: adds months from the later of now / current expiry */
  extendPlan(userId: string, plan: Exclude<Plan, "free">, months: number): void {
    const u = this.findUserById(userId)!;
    const base = Math.max(u.expiresAt, Date.now());
    this.db.prepare("UPDATE users SET plan = ?, expires_at = ? WHERE id = ?").run(plan, base + months * 30 * 24 * 3600 * 1000, userId);
  }

  /** credential rotation: the old key stops working immediately; the user
   *  keeps plan, usage and bound accounts */
  rotateApiKey(userId: string): string {
    const apiKey = newApiKey();
    this.db.prepare("UPDATE users SET api_key = ? WHERE id = ?").run(apiKey, userId);
    return apiKey;
  }

  setDisabled(userId: string, disabled: boolean): void {
    this.db.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").run(disabled ? Date.now() : 0, userId);
  }

  /** used publishes in the current calendar month (resets on rollover) */
  getUsage(user: UserRow): number {
    const fresh = this.findUserById(user.id)!;
    return fresh.monthKey === monthKey() ? fresh.publishCount : 0;
  }

  /** consume one publish after success */
  incrementUsage(userId: string): void {
    const fresh = this.findUserById(userId)!;
    const mk = monthKey();
    const used = fresh.monthKey === mk ? fresh.publishCount : 0;
    this.db.prepare("UPDATE users SET publish_count = ?, month_key = ? WHERE id = ?").run(used + 1, mk, userId);
  }

  /** true when a paid plan is active (expiry is respected; `free` never counts) */
  isProActive(user: UserRow): boolean {
    return user.plan !== "free" && (user.expiresAt === 0 || user.expiresAt > Date.now());
  }

  /** the allowance currently in force for this user */
  planAllowance(user: UserRow): { monthlyPublishes: number; accounts: number } {
    return this.isProActive(user) ? PLAN_LIMITS[user.plan] : PLAN_LIMITS.free;
  }

  /** Durable immediate-publish claim; unknown outcomes never expire. */
  getImmediateClaim(key: string): { owner: string; fingerprint: string; state: "pending" | "confirmed"; mediaId: string | null; completedAt: number | null } | null {
    const row = this.db.prepare("SELECT owner, fingerprint, state, media_id, completed_at FROM immediate_publish_claims WHERE request_key = ?").get(key) as
      { owner: string; fingerprint: string; state: "pending" | "confirmed"; media_id: string | null; completed_at: number | null } | undefined;
    return row ? { owner: row.owner, fingerprint: row.fingerprint, state: row.state, mediaId: row.media_id, completedAt: row.completed_at } : null;
  }

  claimImmediate(key: string, owner: string, fingerprint: string, now: number, ttl: number): "claimed" | "existing" {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.getImmediateClaim(key);
      if (existing && !(existing.state === "confirmed" && existing.mediaId && existing.completedAt !== null && now - existing.completedAt >= ttl)) {
        this.db.exec("COMMIT");
        return "existing";
      }
      if (existing) this.db.prepare("DELETE FROM immediate_publish_claims WHERE request_key = ?").run(key);
      this.db.prepare("INSERT INTO immediate_publish_claims(request_key, owner, fingerprint, state) VALUES (?, ?, ?, 'pending')").run(key, owner, fingerprint);
      this.db.exec("COMMIT");
      return "claimed";
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  releaseImmediate(key: string, owner: string, fingerprint: string): void {
    const changed = this.db.prepare("DELETE FROM immediate_publish_claims WHERE request_key = ? AND owner = ? AND fingerprint = ? AND state = 'pending'")
      .run(key, owner, fingerprint);
    if (Number(changed.changes) !== 1) throw new Error("IMMEDIATE_CLAIM_CONFLICT");
  }

  confirmImmediate(key: string, owner: string, fingerprint: string, mediaId: string, now: number): void {
    const changed = this.db.prepare("UPDATE immediate_publish_claims SET state = 'confirmed', media_id = ?, completed_at = ? WHERE request_key = ? AND owner = ? AND fingerprint = ? AND state = 'pending'")
      .run(mediaId, now, key, owner, fingerprint);
    if (Number(changed.changes) !== 1) throw new Error("IMMEDIATE_CLAIM_CONFLICT");
  }

  // --- accounts ------------------------------------------------------------
  // AppSecret is encrypted at rest (AES-256-GCM, key = secretKey from
  // server.json). Rows written before the master key existed are stored as
  // plaintext and transparently encrypted on the next write.

  private encryptSecret(plain: string): string {
    if (!this.secretKey) return plain;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(this.secretKey, "hex"), iv);
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return "enc1:" + iv.toString("hex") + ":" + tag.toString("hex") + ":" + ct.toString("hex");
  }

  private decryptSecret(stored: string): string {
    if (!stored.startsWith("enc1:")) return stored; // legacy plaintext
    const [, ivHex, tagHex, ctHex] = stored.split(":");
    if (!this.secretKey) return "";
    const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(this.secretKey, "hex"), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]).toString("utf8");
  }

  setSecretKey(keyHex: string): void {
    this.secretKey = keyHex;
  }

  /** one-time migration: encrypt any legacy plaintext secrets */
  migrateSecrets(): void {
    if (!this.secretKey) return;
    const rows = this.db.prepare("SELECT name, app_secret FROM accounts").all() as Record<string, unknown>[];
    for (const row of rows) {
      const stored = String(row.app_secret);
      if (stored.startsWith("enc1:")) continue;
      this.db.prepare("UPDATE accounts SET app_secret = ? WHERE name = ?").run(this.encryptSecret(stored), String(row.name));
    }
  }

  upsertAccount(acc: AccountRow): void {
    this.db
      .prepare(
        "INSERT INTO accounts (name, app_id, app_secret, owner_user_id) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET app_id = excluded.app_id, app_secret = excluded.app_secret, owner_user_id = excluded.owner_user_id",
      )
      .run(acc.name, acc.appId, this.encryptSecret(acc.appSecret), acc.ownerUserId);
  }

  /** Atomically admit a new user-owned account without replacing an existing
   * name or exceeding the user's account allowance under concurrent binds. */
  insertOwnedAccount(acc: AccountRow, limit: number): boolean {
    if (!acc.ownerUserId) throw new Error("owner required");
    const result = this.db.prepare(`
      INSERT INTO accounts (name, app_id, app_secret, owner_user_id)
      SELECT ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM accounts WHERE owner_user_id = ?) < ?
      ON CONFLICT(name) DO NOTHING
    `).run(acc.name, acc.appId, this.encryptSecret(acc.appSecret), acc.ownerUserId, acc.ownerUserId, limit);
    return Number(result.changes) === 1;
  }

  findAccount(name: string): AccountRow | null {
    const row = this.db.prepare("SELECT * FROM accounts WHERE name = ?").get(name) as Record<string, unknown> | undefined;
    return row
      ? { name: row.name as string, appId: row.app_id as string, appSecret: this.decryptSecret(row.app_secret as string), ownerUserId: (row.owner_user_id as string | null) ?? null }
      : null;
  }

  listAccounts(): AccountRow[] {
    return (this.db.prepare("SELECT * FROM accounts").all() as Record<string, unknown>[]).map((r) => ({
      name: r.name as string,
      appId: r.app_id as string,
      appSecret: this.decryptSecret(r.app_secret as string),
      ownerUserId: (r.owner_user_id as string | null) ?? null,
    }));
  }

  countAccountsOwnedBy(userId: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE owner_user_id = ?").get(userId) as { n: number }).n;
  }

  // --- orders ----------------------------------------------------------------

  createOrder(contact: string, plan: Plan, months: number, amountFen: number, provider: string): OrderRow {
    const order: OrderRow = {
      id: newId(),
      contact,
      plan,
      months,
      amountFen,
      provider,
      status: "pending",
      userId: null,
      createdAt: Date.now(),
      paidAt: 0,
    };
    this.db
      .prepare("INSERT INTO orders (id, contact, plan, months, amount_fen, provider, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)")
      .run(order.id, contact, plan, months, amountFen, provider, order.createdAt);
    return order;
  }

  findOrder(id: string): OrderRow | null {
    const row = this.db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row
      ? {
          id: row.id as string,
          contact: row.contact as string,
          plan: row.plan as Plan,
          months: row.months as number,
          amountFen: row.amount_fen as number,
          provider: row.provider as string,
          status: row.status as OrderRow["status"],
          userId: (row.user_id as string | null) ?? null,
          createdAt: row.created_at as number,
          paidAt: row.paid_at as number,
        }
      : null;
  }

  markOrderPaid(id: string, userId: string): void {
    this.db.prepare("UPDATE orders SET status = 'paid', user_id = ?, paid_at = ? WHERE id = ?").run(userId, Date.now(), id);
  }

  listOrders(status?: string, limit = 100): OrderRow[] {
    const rows = status
      ? (this.db.prepare("SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT ?").all(status, limit) as Record<string, unknown>[])
      : (this.db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT ?").all(limit) as Record<string, unknown>[]);
    return rows.map((row) => ({
      id: row.id as string,
      contact: row.contact as string,
      plan: row.plan as Plan,
      months: row.months as number,
      amountFen: row.amount_fen as number,
      provider: row.provider as string,
      status: row.status as OrderRow["status"],
      userId: (row.user_id as string | null) ?? null,
      createdAt: row.created_at as number,
      paidAt: row.paid_at as number,
    }));
  }
}

/** Price table in fen (¥ * 100), mirroring PRICING.md `2026-10-v2` CNY
 *  targets: Personal ¥29/month or ¥290/year, Studio ¥79/month or ¥790/year.
 *  Providers settle CNY only; the USD column in PRICING is an independent
 *  regional target, not a separate checkout. */
export const PRICES: Record<Exclude<Plan, "free">, { months: number; fen: number }[]> = {
  personal: [
    { months: 1, fen: 2900 },
    { months: 12, fen: 29000 },
  ],
  studio: [
    { months: 1, fen: 7900 },
    { months: 12, fen: 79000 },
  ],
};
