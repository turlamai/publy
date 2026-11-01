// Publy publishing server (protocol v1) + commercial control plane.
//
// Auth model:
//   admin key (server.json apiKey) — full access, no quota
//   user key (publy_…)             — publish to owned accounts, monthly quota
//
// Commercial loop: /purchase page → payment provider → callback → auto key
// issuance; /admin console for the operator. See docs/business.md.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import Fastify from "fastify";
import type { FastifyError, FastifyReply } from "fastify";
import type { JobInfo, JobStatus, PublishRequest, PublishResponse, PublishResultInfo } from "@publy/shared";
import { draftIdempotencyKey, publishToWechat, MaterialCache, TokenManager, WechatError, PublishError, checkWechatCredential, type AccountCredential } from "@publy/core";
import { Store, PLAN_LIMITS, PRICES, monthKey, type AccountRow, type Plan, type UserRow } from "./store.js";
import { createProvider } from "./payments.js";
import { purchasePage } from "./pages.js";
import { adminPage } from "./admin-page.js";

export interface ServerAccount {
  name: string;
  appId: string;
  appSecret: string;
  webhook?: string;
}

export interface ServerConfig {
  port: number;
  /** admin key: full access, no quota (the operator) */
  apiKey: string;
  accounts: ServerAccount[];
  dataDir?: string;
  /** public base url used for payment callbacks, e.g. https://publy-api.jrtx.site */
  publicUrl?: string;
  /** this server's egress IP — shown to customers for the WeChat IP whitelist.
   *  When absent it is auto-detected at boot (myip.ipip.net → api.ipify.org). */
  publicIp?: string;
  /** master key (hex) for AppSecret encryption at rest; auto-generated on first boot */
  secretKey?: string;
  /** scheduler poll interval; tests shorten it to exercise the job runner */
  jobPollMs?: number;
  payments?: {
    /** Old checkout is off by default. This opt-in permits only isolated tests. */
    enableLegacyCheckout?: boolean;
    provider?: "alipay" | "xunhupay" | "manual";
    alipay?: { appId?: string; privateKey?: string; alipayPublicKey?: string };
    xunhupay?: { appId?: string; secret?: string };
    /** static personal QR (image url or data url) shown on the purchase page;
     *  orders are completed from the admin console after you confirm payment */
    manual?: { qrUrl?: string };
  };
}

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".publy", "server.json");

/** Scrub credential-bearing query strings from any text before it reaches the
 *  audit log, an error response or a webhook: WeChat endpoints and the WS
 *  gateway legitimately carry tokens/secrets in URLs, and undici/fetch error
 *  messages can embed the full URL. Issue #7: AppSecret never enters logs. */
export function redactSecrets(text: string): string {
  return text.replace(/([?&](?:[^&\s"']*?(?:secret|token|key)[^&\s"']*)=)[^&\s"']+/gi, "$1[redacted]");
}

// --- WebSocket short-lived tickets ------------------------------------------
// The events gateway authenticates via ws://host/events?key=…, which puts a
// long-lived API key in URLs (proxy/access logs). Clients should instead take
// a signed ticket from POST /v1/ws-ticket (sent in the x-api-key header, so
// the long-lived key never travels in a URL) and connect with
// ?key=ws1.<exp>.<identity>.<mac>. Tickets expire in 2 minutes; the gateway
// verifies the HMAC against the same secretKey. Issue #8 credential rule.

const WS_TICKET_TTL_MS = 120_000;

/** identity is opaque to the gateway except for the "admin"/"user:" prefix */
export function signWsTicket(secretKey: string, identity: string, now = Date.now()): { ticket: string; expiresAt: number } {
  const expiresAt = now + WS_TICKET_TTL_MS;
  const exp = Math.floor(expiresAt / 1000).toString(36);
  const mac = crypto.createHmac("sha256", secretKey).update(`ws-ticket:${exp}:${identity}`).digest("hex");
  return { ticket: `ws1.${exp}.${identity}.${mac}`, expiresAt };
}

/** returns the identity for a valid, unexpired ticket; null otherwise */
export function verifyWsTicket(secretKey: string, ticket: string): string | null {
  const parts = ticket.split(".");
  if (parts.length !== 4 || parts[0] !== "ws1") return null;
  const [, exp, identity, mac] = parts;
  if (!/^[a-z0-9]+$/.test(exp) || !/^[A-Za-z0-9:-]+$/.test(identity)) return null;
  const expected = crypto.createHmac("sha256", secretKey).update(`ws-ticket:${exp}:${identity}`).digest("hex");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (parseInt(exp, 36) * 1000 < Date.now()) return null;
  return identity;
}

export function loadServerConfig(configPath?: string): ServerConfig {
  const file = configPath ?? process.env.PUBLY_SERVER_CONFIG ?? DEFAULT_CONFIG_PATH;
  const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  if (!raw.apiKey) throw new Error(`server config ${file} is missing "apiKey"`);
  if (!Array.isArray(raw.accounts) || raw.accounts.length === 0) {
    throw new Error(`server config ${file} must declare at least one account`);
  }
  for (const a of raw.accounts) {
    if (!a.name || !a.appId || !a.appSecret) {
      throw new Error(`account entries need "name", "appId", "appSecret" (account: ${a.name ?? "?"})`);
    }
  }
  return {
    port: raw.port ?? 8081,
    apiKey: raw.apiKey,
    accounts: raw.accounts,
    dataDir: raw.dataDir ?? path.join(path.dirname(file), "server-data"),
    publicUrl: raw.publicUrl,
    publicIp: raw.publicIp,
    secretKey: raw.secretKey,
    payments: raw.payments,
  };
}

/** best-effort egress IP detection for the onboarding guide (domestic first) */
export async function detectEgressIp(): Promise<string | null> {
  try {
    const t = await (await fetch("https://myip.ipip.net", { signal: AbortSignal.timeout(4000) })).text();
    const m = t.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    if (m) return m[1];
  } catch {
    /* fall through */
  }
  try {
    const t = (await (await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(4000) })).text()).trim();
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(t)) return t;
  } catch {
    /* fall through */
  }
  return null;
}

const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const JOB_MAX_ATTEMPTS = 3;
const JOB_RETRY_DELAY_MS = 5 * 60 * 1000;

interface StoredJob {
  id: string;
  runAt: number;
  body: PublishRequest;
  /** set when scheduled by a user key; quota applies at execution */
  userId: string | null;
  status: JobStatus;
  attempts: number;
  nextAttemptAt: number;
  /** Only pre-publish failures may be retried. Legacy failed jobs without
   * this marker must not be assumed safe: they may be older remote failures. */
  safeToRetry?: boolean;
  /** admission idempotency: same key never enqueues two jobs, and a retry of
   *  an interrupted run reconciles against the same record before re-sending */
  idempotencyKey?: string;
  result?: PublishResponse;
  error?: string;
}

function jobInfo(j: StoredJob): JobInfo {
  return {
    id: j.id,
    runAt: new Date(j.runAt).toISOString(),
    status: j.status,
    attempts: j.attempts,
    account: j.body.account,
    type: j.body.type,
    title: j.body.title,
    error: j.error,
    mediaId: j.result?.mediaId,
  };
}

/** resolved caller: admin, or a user row */
type Caller = { admin: true } | { admin: false; user: UserRow };

export function buildApp(config: ServerConfig) {
  // Validate policy before opening SQLite or any other resources. A rejected
  // configuration must not leave a locked database (especially on Windows).
  const legacyCheckoutEnabled = config.payments?.enableLegacyCheckout === true;
  if (legacyCheckoutEnabled && config.payments?.provider !== "manual") {
    throw new Error("legacy checkout is restricted to manual synthetic testing; online providers require Commerce/Permit");
  }
  const app = Fastify({ bodyLimit: 30 * 1024 * 1024 });
  const dataDir = config.dataDir ?? path.join(os.homedir(), ".publy", "server-data");
  fs.mkdirSync(dataDir, { recursive: true });

  // every unhandled error leaves this server redacted: fetch/undici messages
  // can embed full URLs with tokens/secrets (#7 — secrets stay out of logs)
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = typeof err.statusCode === "number" && err.statusCode >= 400 ? err.statusCode : 500;
    const code = typeof err.code === "string" && !err.code.startsWith("FST_ERR_") ? err.code : status >= 500 ? "INTERNAL" : "BAD_REQUEST";
    reply.code(status).send({ code, message: redactSecrets(err.message) });
  });

  const store = new Store(dataDir);
  if (config.secretKey) { store.setSecretKey(config.secretKey); store.migrateSecrets(); }
  app.addHook("onClose", async () => store.close());
  const tokens = new TokenManager(dataDir);
  const materials = new MaterialCache(dataDir);

  const publicUrl = (config.publicUrl ?? `http://localhost:${config.port}`).replace(/\/$/, "");

  // account resolution: admin owns server.json accounts + everything in db;
  // users own only their db accounts
  function resolveAccount(ref: string, caller: Caller): AccountCredential | null {
    if (!caller.admin) {
      const owned = store.findAccount(ref);
      if (owned && owned.ownerUserId === caller.user.id) return owned;
      return null;
    }
    const shared = config.accounts.find((a) => a.name === ref || a.appId === ref);
    if (shared) return { name: shared.name, appId: shared.appId, appSecret: shared.appSecret };
    const row = store.findAccount(ref);
    return row ?? null;
  }

  function planLimit(user: UserRow): number {
    return store.planAllowance(user).monthlyPublishes;
  }

  // webhook: fire-and-forget POST, never blocks the response
  const notifyWebhook = (accountName: string, event: string, extra: Record<string, unknown>) => {
    const hookUrl = config.accounts.find((a) => a.name === accountName)?.webhook;
    if (!hookUrl) return;
    fetch(hookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, account: accountName, ts: new Date().toISOString(), ...extra }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {
      /* best effort */
    });
  };

  // --- audit -----------------------------------------------------------------

  const historyFile = path.join(dataDir, "history.jsonl");
  const audit = (entry: Record<string, unknown>) => {
    // single choke point: error-ish fields are scrubbed before touching disk
    const clean: Record<string, unknown> = { ts: new Date().toISOString() };
    for (const [k, v] of Object.entries(entry)) clean[k] = typeof v === "string" ? redactSecrets(v) : v;
    fs.appendFileSync(historyFile, JSON.stringify(clean) + "\n");
  };
  const readHistory = (limit: number) => {
    try {
      return fs
        .readFileSync(historyFile, "utf-8")
        .trim()
        .split("\n")
        .slice(-limit)
        .map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  };

  // --- scheduled jobs --------------------------------------------------------

  const jobsFile = path.join(dataDir, "jobs.json");
  let jobs: Record<string, StoredJob> = {};
  try {
    jobs = JSON.parse(fs.readFileSync(jobsFile, "utf-8"));
  } catch {
    /* first run */
  }
  // crash-mid-run reconciliation (#8): a job found "running" at boot has an
  // unknown draft outcome — the process must not silently re-issue a second
  // publish. Surface it as interrupted; retry is an explicit endpoint that
  // re-checks idempotency before sending.
  let reconciled = 0;
  for (const job of Object.values(jobs)) {
    if (job.status === "running") {
      job.status = "interrupted";
      job.error = "interrupted by restart — draft outcome unknown; retry explicitly (idempotency-checked)";
      reconciled += 1;
    }
  }
  if (reconciled > 0) audit({ event: "jobs-reconciled", interrupted: reconciled });
  const saveJobs = () => fs.writeFileSync(jobsFile, JSON.stringify(jobs, null, 2), { mode: 0o600 });

  async function runJob(job: StoredJob): Promise<void> {
    job.status = "running";
    saveJobs();
    job.safeToRetry = false;
    // Once the remote publish pipeline starts, an error might mean WeChat
    // accepted the draft but its response was lost. No automatic re-send.
    let publishAttempted = false;
    const body = job.body;
    const caller: Caller = job.userId ? { admin: false, user: store.findUserById(job.userId)! } : { admin: true };
    const cred = resolveAccount(body.account, caller);
    try {
      if (!cred) throw new PublishError("ACCOUNT_NOT_FOUND", `Unknown account "${body.account}"`);
      if (!caller.admin) {
        const user = caller.user;
        if (user.disabledAt) throw new PublishError("USER_DISABLED", "account disabled");
        const limit = planLimit(user);
        const used = store.getUsage(user);
        if (used >= limit) throw new PublishError("QUOTA_EXCEEDED", `monthly limit ${limit} reached`);
      }
      // idempotency reconciliation before sending: a previous lost run (crash
      // after draft/add, before the status save) may already have delivered
      // this job's draft — a fresh hit means done, never a second draft
      if (job.idempotencyKey) {
        const hit = idempotency[job.idempotencyKey];
        if (hit && Date.now() - hit.at < IDEMPOTENCY_TTL_MS) {
          if (!sameDraftIdentity(hit, body, job.userId)) {
            throw new PublishError("IDEMPOTENCY_CONFLICT", "This request key belongs to a different WeChat draft.");
          }
          job.status = "done";
          job.result = { mediaId: hit.mediaId, deduped: true, account: body.account, title: body.title, requestId: job.idempotencyKey };
          job.error = undefined;
          audit({ event: "scheduled-deduped", account: body.account, title: body.title, jobId: job.id, key: job.idempotencyKey, mediaId: hit.mediaId });
          notifyWebhook(body.account, "publish", { title: body.title, mediaId: hit.mediaId, jobId: job.id, scheduled: true, deduped: true });
          saveJobs();
          return;
        }
      }
      publishAttempted = true;
      const result = await publishToWechat(body, cred, tokens, materials);
      job.status = "done";
      job.result = result;
      job.error = undefined;
      if (job.idempotencyKey) {
        idempotency[job.idempotencyKey] = { mediaId: result.mediaId, at: Date.now(), account: body.account, title: body.title, type: body.type, userId: job.userId, requestFingerprint: draftIdempotencyKey(body) };
        saveIdempotency();
      }
      if (!caller.admin) store.incrementUsage(caller.user.id);
      audit({ event: "scheduled-published", account: body.account, type: body.type, title: body.title, mediaId: result.mediaId, jobId: job.id });
      notifyWebhook(body.account, "publish", { title: body.title, mediaId: result.mediaId, jobId: job.id, scheduled: true });
    } catch (err) {
      job.attempts += 1;
      if (publishAttempted) {
        // The failure could be after draft/add committed remotely (including a
        // failed local state write). A server-side key cannot query an unknown
        // WeChat draft; automatically retrying could create duplicates.
        job.status = "interrupted";
        job.safeToRetry = false;
        job.error = "draft outcome unknown after publish attempt; inspect WeChat drafts before any further action";
        audit({ event: "scheduled-outcome-unknown", account: body.account, title: body.title, jobId: job.id, attempts: job.attempts });
      } else {
        job.safeToRetry = true;
        job.error = redactSecrets((err as Error).message);
        audit({ event: "scheduled-failed", account: body.account, title: body.title, jobId: job.id, attempts: job.attempts, error: job.error });
        if (job.attempts >= JOB_MAX_ATTEMPTS) {
          job.status = "failed";
          notifyWebhook(body.account, "failed", { title: body.title, jobId: job.id, error: job.error, scheduled: true });
        } else {
          job.status = "pending";
          job.nextAttemptAt = Date.now() + JOB_RETRY_DELAY_MS * job.attempts;
        }
      }
    }
    saveJobs();
  }

  const scheduler = setInterval(
    () => {
      for (const job of Object.values(jobs)) {
        if (job.status === "pending" && job.nextAttemptAt <= Date.now()) void runJob(job);
      }
    },
    config.jobPollMs ?? 30_000,
  );
  scheduler.unref();

  // --- idempotency ------------------------------------------------------------

  interface IdempotencyRecord {
    mediaId: string;
    at: number;
    account: string;
    title: string;
    type: string;
    /** owning user (null = admin) — records are not visible across callers */
    userId: string | null;
    /** verified request body hash; absent only in pre-v2 persisted records */
    requestFingerprint?: string;
  }

  const idempotencyFile = path.join(dataDir, "idempotency.json");
  let idempotency: Record<string, IdempotencyRecord> = {};
  try {
    idempotency = JSON.parse(fs.readFileSync(idempotencyFile, "utf-8"));
  } catch {
    /* first run */
  }
  const saveIdempotency = () => fs.writeFileSync(idempotencyFile, JSON.stringify(idempotency), { mode: 0o600 });

  const idempotencyFresh = (key: string): IdempotencyRecord | null => {
    const hit = idempotency[key];
    return hit && Date.now() - hit.at < IDEMPOTENCY_TTL_MS ? hit : null;
  };

  const sameDraftIdentity = (hit: IdempotencyRecord, body: PublishRequest, owner: string | null): boolean =>
    hit.userId === owner &&
    hit.account === body.account &&
    hit.title === body.title &&
    hit.type === body.type &&
    // Prior server files lack this field. Keep legacy same-account/title/type
    // retries readable, while all newly persisted records verify full bytes.
    (!hit.requestFingerprint || hit.requestFingerprint === draftIdempotencyKey(body));

  // test seams: multiuser/readiness tests drive quota and idempotency state
  // directly instead of making real WeChat calls
  app.decorate("store", store);
  app.decorate("idempotency", { records: idempotency, save: saveIdempotency });

  // --- auth ------------------------------------------------------------------

  function auth(callerKey: string | undefined): Caller | null {
    if (!callerKey) return null;
    if (config.apiKey && callerKey === config.apiKey) return { admin: true };
    const user = store.findUserByKey(callerKey);
    if (!user || user.disabledAt) return null;
    return { admin: false, user };
  }

  app.addHook("onRequest", async (req, reply) => {
    // the /admin page SHELL is public (it's just html); its data endpoints
    // (/v1/admin/*) still require the admin key
    if (req.url === "/health" || req.url === "/" || req.url === "/admin" || req.url.startsWith("/purchase") || req.url.startsWith("/order/") || req.url.startsWith("/lookup") || req.url.startsWith("/pay/")) return;
    const caller = auth(req.headers["x-api-key"] as string | undefined);
    if (!caller) {
      await reply.code(401).send({ code: "UNAUTHORIZED", message: "Invalid API key" });
      return;
    }
    (req as unknown as { caller: Caller }).caller = caller;
  });

  // --- public storefront (no auth) -------------------------------------------

  // naive per-IP rate limit for unauthenticated storefront writes
  const rateMap = new Map<string, number[]>();
  const RATE_WINDOW_MS = 3600_000;
  const RATE_MAX = 20;
  function rateLimited(ip: string): boolean {
    const now = Date.now();
    const hits = (rateMap.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    hits.push(now);
    rateMap.set(ip, hits);
    return hits.length > RATE_MAX;
  }

  app.get("/health", async () => ({ status: "ok", service: "publy-server", protocol: "v1" }));
  // Historical checkout is not Commerce/Permit-authorized public billing.
  const checkoutClosed = (reply: FastifyReply) =>
    reply.code(503).send({ code: "CHECKOUT_NOT_AVAILABLE", message: "Public hosted subscriptions are not open" });
  app.get("/", async (_req, reply) => legacyCheckoutEnabled
    ? reply.type("text/html").send(purchasePage(config.publicIp ?? "（探测中，稍后刷新可见）"))
    : reply.type("text/html").send('<!doctype html><html lang="en"><meta charset="utf-8"><title>Publy</title><body><main><h1>Publy</h1><p>Local preview, CLI and self-hosted publishing are available. Public hosted subscriptions are not open.</p><a href="https://github.com/turlamai/publy">Source and documentation</a></main></body></html>'));
  app.get("/admin", async (_req, reply) => reply.type("text/html").send(adminPage()));

  // The disabled path must never initialize a configured external gateway.
  const payments = createProvider(legacyCheckoutEnabled ? config.payments : { provider: "manual" }, store, (order) => {
    audit({ event: "purchase-paid", contact: order.contact, plan: order.plan, months: order.months, orderId: order.id });
  });
  console.log(`[payments] provider: ${payments.provider.name}`);
  const pollThrottle = new Map<string, number>();

  app.post<{ Body: { contact?: string; plan?: string; months?: number } }>("/purchase", async (req, reply) => {
    if (!legacyCheckoutEnabled) return checkoutClosed(reply);
    const ip = req.ip ?? "unknown";
    if (rateLimited(ip)) {
      return reply.code(429).send({ code: "RATE_LIMITED", message: "too many requests, try later" });
    }
    const { contact, plan, months } = req.body ?? {};
    if (!contact || !/^\S{1,64}$/.test(contact)) return reply.code(400).send({ code: "BAD_REQUEST", message: "contact required" });
    if (plan !== "personal" && plan !== "studio") {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "plan must be personal or studio" });
    }
    const price = PRICES[plan as Exclude<Plan, "free">].find((p) => p.months === Number(months));
    if (!price) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "months must be 1 or 12" });
    }
    const order = store.createOrder(contact, plan as Plan, Number(months), price.fen, payments.provider.name);
    try {
      const payment = await payments.provider.createPayment(
        order,
        `${publicUrl}/pay/xunhupay/notify`,
        `${publicUrl}/order/${order.id}`,
      );
      if (payment) return { orderId: order.id, payUrl: payment.payUrl };
      return { orderId: order.id, manual: true };
    } catch (err) {
      return reply.code(502).send({ code: "PAYMENT_PROVIDER_ERROR", message: (err as Error).message });
    }
  });

  app.get<{ Params: { id: string } }>("/order/:id", async (req, reply) => {
    if (!legacyCheckoutEnabled) return checkoutClosed(reply);
    const order = store.findOrder((req.params as { id: string }).id);
    if (!order) return reply.code(404).send({ code: "NOT_FOUND", message: "no such order" });
    if (order.status !== "paid") {
      // lazy active query: providers with polling (alipay) settle orders here,
      // throttled so page polling doesn't hammer the gateway
      if (payments.provider.pollOrder && !pollThrottle.has(order.id)) {
        pollThrottle.set(order.id, Date.now());
        try {
          if ((await payments.provider.pollOrder(order)) === "paid") payments.completeOrder(order.id);
        } catch {
          /* gateway hiccup — stay pending, next poll retries */
        } finally {
          setTimeout(() => pollThrottle.delete(order.id), 4000);
        }
      }
    }
    const fresh = store.findOrder(order.id)!;
    if (fresh.status !== "paid") return { orderId: fresh.id, status: fresh.status };
    const user = store.findUserByContact(fresh.contact);
    return { orderId: fresh.id, status: "paid", apiKey: user?.apiKey, plan: user?.plan, expiresAt: user?.expiresAt };
  });

  app.get<{ Querystring: { contact?: string } }>("/lookup", async (req, reply) => {
    if (!legacyCheckoutEnabled) return checkoutClosed(reply);
    const contact = (req.query as { contact?: string }).contact ?? "";
    const user = store.findUserByContact(contact);
    if (!user) return { keys: [] };
    return { keys: [user.apiKey.slice(-4)], plan: user.plan, expiresAt: user.expiresAt };
  });

  app.post<{ Body: Record<string, unknown> }>("/pay/xunhupay/notify", async (req, reply) => {
    if (!legacyCheckoutEnabled) return checkoutClosed(reply);
    const orderId = payments.provider.verifyNotify(req.body);
    if (!orderId) return reply.code(400).send({ code: "BAD_SIGNATURE" });
    const done = payments.completeOrder(orderId);
    if (!done || done.status !== "paid") return reply.code(400).send({ code: "FULFILLMENT_FAILED" });
    audit({ event: "purchase-completed", orderId, contact: done.contact });
    return "success";
  });

  // --- user routes -------------------------------------------------------------

  app.get("/verify", async (req) => {
    const caller = (req as unknown as { caller: Caller }).caller;
    return caller.admin
      ? { ok: true, admin: true, accounts: [...config.accounts.map((a) => a.name), ...store.listAccounts().map((a) => a.name)] }
      : { ok: true, accounts: store.listAccounts().filter((a) => a.ownerUserId === caller.user.id).map((a) => a.name) };
  });

  app.get("/v1/quota", async (req) => {
    const caller = (req as unknown as { caller: Caller }).caller;
    if (caller.admin) return { admin: true, unlimited: true };
    const limit = planLimit(caller.user);
    return { plan: caller.user.plan, used: store.getUsage(caller.user), limit, expiresAt: caller.user.expiresAt || undefined };
  });

  // self-serve account binding: the customer validates their own AppID +
  // AppSecret from THIS server (which also surfaces the IP-whitelist step)
  // and binds the account to their user — no operator in the loop.
  const bindAttempts = new Map<string, number[]>();
  app.post<{ Body: { appId?: string; appSecret?: string; accountName?: string } }>("/v1/bind", async (req, reply) => {
    const caller = (req as unknown as { caller: Caller }).caller;
    if (caller.admin) return reply.code(400).send({ code: "BAD_REQUEST", message: "use /v1/admin/accounts for admin-owned accounts" });
    const user = caller.user;
    if (user.disabledAt) return reply.code(403).send({ code: "USER_DISABLED", message: "account disabled" });

    const { appId, appSecret, accountName } = req.body ?? {};
    if (!appId || !appSecret) return reply.code(400).send({ code: "BAD_REQUEST", message: "appId / appSecret required" });
    // brute-force guard on bind attempts (per user)
    const now = Date.now();
    const attempts = (bindAttempts.get(user.id) ?? []).filter((t) => now - t < 3600_000);
    if (attempts.length >= 10) {
      return reply.code(429).send({ code: "RATE_LIMITED", message: "too many bind attempts, try later" });
    }
    attempts.push(now);
    bindAttempts.set(user.id, attempts);

    // plan account limit
    const limit = store.planAllowance(user).accounts;
    if (store.countAccountsOwnedBy(user.id) >= limit) {
      return reply.code(400).send({ code: "ACCOUNT_LIMIT", message: `plan limit is ${limit} account(s) — upgrade to bind more` });
    }

    // live validation from this server (surfaces the IP-whitelist step)
    const check = await checkWechatCredential(appId, appSecret);
    audit({ event: "bind-attempt", contact: user.contact, appId, ok: check.ok, errcode: check.errcode, ip: check.ip });
    if (!check.ok) {
      return reply.code(400).send({
        code: check.errcode === 40164 ? "NEEDS_WHITELIST" : "WECHAT_CHECK_FAILED",
        message: check.message,
        ip: check.ip,
      });
    }

    const name = (accountName ?? appId).trim().slice(0, 40) || appId;
    store.upsertAccount({ name, appId, appSecret, ownerUserId: user.id });
    audit({ event: "bound", contact: user.contact, appId, accountName: name });
    return { ok: true, accountName: name };
  });

  app.post<{ Body: PublishRequest }>("/v1/publish", async (req, reply) => {
    const caller = (req as unknown as { caller: Caller }).caller;
    const body = req.body;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "JSON body required" });
    }
    if (!body.account) return reply.code(400).send({ code: "BAD_REQUEST", message: '"account" is required' });
    if (!body.title) return reply.code(400).send({ code: "BAD_REQUEST", message: '"title" is required' });
    if (body.type !== "article" && body.type !== "image_post") {
      return reply.code(400).send({ code: "BAD_REQUEST", message: '"type" must be "article" or "image_post"' });
    }

    // ownership for user keys
    if (!caller.admin) {
      const owned = store.findAccount(body.account);
      if (!owned || owned.ownerUserId !== caller.user.id) {
        return reply.code(403).send({ code: "ACCOUNT_NOT_OWNED", message: `Account "${body.account}" is not bound to your user` });
      }
    }

    // A confirmed retry must resolve to the already-created draft even if
    // the caller has since reached quota. Check idempotency BEFORE quotas;
    // only genuinely new draft admissions consume quota.
    const quotaLimit = caller.admin ? null : planLimit(caller.user);
    const quotaExceeded = !caller.admin && store.getUsage(caller.user) >= quotaLimit!;
    const quotaReply = () => reply.code(429).send({
      code: "QUOTA_EXCEEDED",
      message: `monthly limit ${quotaLimit} reached — upgrade at ${publicUrl}`,
    });

    const key = body.idempotencyKey;
    if (key) {
      const hit = idempotencyFresh(key);
      if (hit) {
        if (!sameDraftIdentity(hit, body, caller.admin ? null : caller.user.id)) {
          return reply.code(409).send({
            code: "IDEMPOTENCY_CONFLICT",
            message: "This request key belongs to a different WeChat draft; inspect the previous result and use a new request identity for changed content.",
          });
        }
        // re-delivery of a request whose draft already landed — the response
        // names the original destination so a caller that lost the first
        // response can reconcile instead of sending a second publish (#7)
        audit({ event: "deduped", key, account: body.account, title: body.title });
        return { mediaId: hit.mediaId, deduped: true, account: hit.account || body.account, title: hit.title || body.title, requestId: key };
      }
    }

    if (body.publishAt) {
      const runAt = new Date(body.publishAt).getTime();
      if (Number.isNaN(runAt) || runAt < Date.now() - 60_000) {
        return reply.code(400).send({ code: "BAD_REQUEST", message: `invalid publishAt "${body.publishAt}"` });
      }
      // idempotent job admission: a retry of the same request identity must
      // not enqueue a second job for the same draft (#8)
      if (key) {
        const twin = Object.values(jobs).find(
          (j) => j.idempotencyKey === key && (j.status === "pending" || j.status === "running" || j.status === "interrupted") && (caller.admin ? j.userId === null : j.userId === caller.user.id),
        );
        if (twin) {
          if (draftIdempotencyKey(twin.body) !== draftIdempotencyKey(body)) {
            return reply.code(409).send({
              code: "IDEMPOTENCY_CONFLICT",
              message: "This request key already schedules a different WeChat draft.",
            });
          }
          audit({ event: "deduped", key, account: body.account, title: body.title, jobId: twin.id, admission: true });
          return { jobId: twin.id, runAt: new Date(twin.runAt).toISOString(), scheduled: true, deduped: true };
        }
      }
      if (quotaExceeded) return quotaReply();
      const id = crypto.randomUUID();
      jobs[id] = { id, runAt, body, userId: caller.admin ? null : caller.user.id, status: "pending", attempts: 0, nextAttemptAt: runAt, idempotencyKey: key };
      saveJobs();
      audit({ event: "scheduled", account: body.account, type: body.type, title: body.title, runAt: new Date(runAt).toISOString(), jobId: id });
      return { jobId: id, runAt: new Date(runAt).toISOString(), scheduled: true };
    }

    if (quotaExceeded) return quotaReply();

    try {
      const cred = resolveAccount(body.account, caller);
      if (!cred) {
        const code = caller.admin ? "ACCOUNT_NOT_FOUND" : "ACCOUNT_NOT_OWNED";
        return reply.code(caller.admin ? 400 : 403).send({ code, message: `Unknown/unowned account "${body.account}"` });
      }
      const result: PublishResponse = await publishToWechat(body, cred, tokens, materials);
      if (key) {
        idempotency[key] = { mediaId: result.mediaId, at: Date.now(), account: body.account, title: body.title, type: body.type, userId: caller.admin ? null : caller.user.id, requestFingerprint: draftIdempotencyKey(body) };
        saveIdempotency();
      }
      if (!caller.admin) store.incrementUsage(caller.user.id);
      audit({ event: "published", account: body.account, type: body.type, title: body.title, mediaId: result.mediaId, key, user: caller.admin ? "admin" : caller.user.contact });
      notifyWebhook(body.account, "publish", { title: body.title, mediaId: result.mediaId });
      // echo the submitted identity: results name their own destination and
      // request so clients cannot attach them to the wrong preview (#7)
      return { ...result, account: body.account, title: body.title, requestId: key };
    } catch (err) {
      audit({ event: "failed", account: body.account, type: body.type, title: body.title, error: (err as Error).message });
      notifyWebhook(body.account, "failed", { title: body.title, error: (err as Error).message });
      if (err instanceof PublishError) {
        return reply.code(400).send({ code: err.code, message: err.message });
      }
      if (err instanceof WechatError) {
        return reply.code(502).send({ code: `WECHAT_${err.errcode}`, message: err.message });
      }
      throw err;
    }
  });

  // query a submission by its idempotency key: did my publish land? A caller
  // that lost the response (timeout, dropped connection) reconciles here
  // instead of issuing a second publish. "unknown" is an answer — the key may
  // have expired or never reached this server — not an error (#7).
  app.get<{ Params: { key: string } }>("/v1/publish-result/:key", async (req): Promise<PublishResultInfo> => {
    const caller = (req as unknown as { caller: Caller }).caller;
    const key = (req.params as { key: string }).key;
    const hit = idempotencyFresh(key);
    if (!hit || (!caller.admin && hit.userId !== caller.user.id)) {
      return { status: "unknown" };
    }
    return { status: "confirmed", mediaId: hit.mediaId, account: hit.account, title: hit.title, requestId: key };
  });

  // accounts visible to the caller: names only — secrets and appIds never
  // leave the server (used by clients for account pickers). Admin sees
  // config accounts (server.json) plus DB accounts; users see their own.
  app.get("/v1/accounts", async (req) => {
    const caller = (req as unknown as { caller: Caller }).caller;
    const configNames = new Set((config.accounts ?? []).map((a) => a.name));
    const all: { name: string; ownerUserId: string | null }[] = [
      ...(config.accounts ?? []).map((a) => ({ name: a.name, ownerUserId: null as string | null })),
      ...store.listAccounts().filter((a) => !configNames.has(a.name)).map((a) => ({ name: a.name, ownerUserId: a.ownerUserId })),
    ];
    const visible = caller.admin ? all : all.filter((a) => a.ownerUserId === caller.user.id);
    return { accounts: visible.map((a) => ({ name: a.name })) };
  });

  // tenant isolation: a user key sees only publish-relevant events for its
  // own accounts; the admin key sees the full audit trail
  app.get<{ Querystring: { limit?: string } }>("/v1/history", async (req) => {
    const caller = (req as unknown as { caller: Caller }).caller;
    const limit = Math.min(Math.max(parseInt((req.query as { limit?: string }).limit ?? "50", 10) || 50, 1), 500);
    let history = readHistory(limit * 4);
    if (!caller.admin) {
      const owned = new Set(store.listAccounts().filter((a) => a.ownerUserId === caller.user.id).map((a) => a.name));
      const visible = new Set(["published", "failed", "scheduled", "cancelled", "deduped"]);
      history = history.filter((e) => visible.has(e.event) && owned.has(e.account));
    }
    return { history: history.slice(-limit) };
  });

  app.get("/v1/jobs", async (req) => {
    const caller = (req as unknown as { caller: Caller }).caller;
    let list = Object.values(jobs).sort((a, b) => a.runAt - b.runAt);
    if (!caller.admin) list = list.filter((j) => j.userId === caller.user.id);
    return { jobs: list.map(jobInfo) };
  });

  app.get<{ Params: { id: string } }>("/v1/jobs/:id", async (req, reply) => {
    const caller = (req as unknown as { caller: Caller }).caller;
    const job = jobs[(req.params as { id: string }).id];
    if (!job) return reply.code(404).send({ code: "NOT_FOUND", message: "no such job" });
    if (!caller.admin && job.userId !== caller.user.id) return reply.code(403).send({ code: "NOT_OWNED", message: "job belongs to another user" });
    return jobInfo(job);
  });

  app.delete<{ Params: { id: string } }>("/v1/jobs/:id", async (req, reply) => {
    const caller = (req as unknown as { caller: Caller }).caller;
    const job = jobs[(req.params as { id: string }).id];
    if (!job) return reply.code(404).send({ code: "NOT_FOUND", message: "no such job" });
    if (!caller.admin && job.userId !== caller.user.id) return reply.code(403).send({ code: "NOT_OWNED", message: "job belongs to another user" });
    if (job.status !== "pending") {
      return reply.code(400).send({ code: "NOT_CANCELLABLE", message: `job is ${job.status}` });
    }
    job.status = "cancelled";
    saveJobs();
    audit({ event: "cancelled", jobId: job.id, account: job.body.account, title: job.body.title });
    return { ok: true };
  });

  // A possibly delivered draft cannot be safely retried just because
  // someone clicks retry: WeChat has no server-side idempotency contract.
  // Only a *locally confirmed*, matching draft can be reconciled without
  // sending any network request. A missing/expired record stays interrupted.
  // Known pre-publish failures retain the existing bounded retry path.
  app.post<{ Params: { id: string } }>("/v1/jobs/:id/retry", async (req, reply) => {
    const caller = (req as unknown as { caller: Caller }).caller;
    const job = jobs[(req.params as { id: string }).id];
    if (!job) return reply.code(404).send({ code: "NOT_FOUND", message: "no such job" });
    if (!caller.admin && job.userId !== caller.user.id) return reply.code(403).send({ code: "NOT_OWNED", message: "job belongs to another user" });
    if (job.status !== "interrupted" && job.status !== "failed") {
      return reply.code(400).send({ code: "NOT_RETRYABLE", message: `job is ${job.status}` });
    }
    if (job.status === "interrupted") {
      const hit = job.idempotencyKey ? idempotencyFresh(job.idempotencyKey) : null;
      if (!hit) {
        return reply.code(409).send({
          code: "DRAFT_OUTCOME_UNKNOWN",
          message: "Remote draft outcome is unknown. Inspect WeChat drafts manually; this endpoint cannot safely resend an interrupted job.",
          jobId: job.id,
        });
      }
      // A pre-v2 idempotency record with no fingerprint is insufficient
      // evidence of byte-identical content; do not trust a title match.
      if (!hit.requestFingerprint ||
          hit.requestFingerprint !== draftIdempotencyKey(job.body) ||
          !hit.mediaId ||
          !sameDraftIdentity(hit, job.body, job.userId)) {
        return reply.code(409).send({
          code: "IDEMPOTENCY_CONFLICT",
          message: "Recorded draft identity does not match this job; no retry attempted.",
          jobId: job.id,
        });
      }
      // The local delivery record already confirms this exact draft. Finish
      // the job in place instead of enqueueing it or consuming quota again.
      job.status = "done";
      job.result = {
        mediaId: hit.mediaId, deduped: true,
        account: job.body.account, title: job.body.title,
        requestId: job.idempotencyKey,
      };
      job.error = undefined;
      saveJobs();
      audit({ event: "job-reconciled", jobId: job.id, account: job.body.account, title: job.body.title });
      return { ok: true, job: jobInfo(job), deduped: true };
    }
    if (job.safeToRetry !== true) {
      // Older failures did not record whether draft/add was attempted.
      // Treat missing provenance as unknown rather than risking a duplicate.
      return reply.code(409).send({
        code: "DRAFT_OUTCOME_UNKNOWN",
        message: "Cannot prove that this failed job stopped before WeChat draft submission; no retry attempted.",
        jobId: job.id,
      });
    }
    job.status = "pending";
    job.attempts = 0;
    job.nextAttemptAt = Date.now();
    job.error = undefined;
    saveJobs();
    audit({ event: "job-retried", jobId: job.id, account: job.body.account, title: job.body.title });
    return { ok: true, job: jobInfo(job) };
  });

  // --- admin routes ----------------------------------------------------------

  function requireAdmin(req: unknown): boolean {
    return ((req as unknown as { caller: Caller }).caller as Caller).admin;
  }

  app.get("/v1/admin/users", async (req, reply) => {
    if (!requireAdmin(req)) return reply.code(403).send({ code: "FORBIDDEN", message: "admin only" });
    return {
      users: store.listUsers().map((u) => ({
        id: u.id,
        contact: u.contact,
        plan: u.plan,
        expiresAt: u.expiresAt || undefined,
        used: store.getUsage(u),
        limit: planLimit(u),
        disabled: Boolean(u.disabledAt),
        apiKey: u.apiKey,
        createdAt: u.createdAt,
      })),
    };
  });

  app.post<{ Body: { contact?: string; plan?: string; months?: number } }>("/v1/admin/users", async (req, reply) => {
    if (!requireAdmin(req)) return reply.code(403).send({ code: "FORBIDDEN", message: "admin only" });
    const { contact, plan, months } = req.body ?? {};
    if (!contact) return reply.code(400).send({ code: "BAD_REQUEST", message: "contact required" });
    if (plan !== undefined && plan !== "free" && plan !== "personal" && plan !== "studio") {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "plan must be free, personal or studio" });
    }
    const existing = store.findUserByContact(contact);
    if (existing) {
      if (plan === "personal" || plan === "studio") store.extendPlan(existing.id, plan, Number(months) || 1);
      return { ok: true, extended: plan === "personal" || plan === "studio", apiKey: existing.apiKey, expiresAt: store.findUserById(existing.id)?.expiresAt };
    }
    const user = store.createUser(contact, (plan as Plan) ?? "free", Number(months) || 1);
    audit({ event: "admin-created", contact, plan });
    return { ok: true, apiKey: user.apiKey, userId: user.id };
  });

  app.post<{ Params: { id: string }; Body: { disabled?: boolean } }>("/v1/admin/users/:id/disable", async (req, reply) => {
    if (!requireAdmin(req)) return reply.code(403).send({ code: "FORBIDDEN", message: "admin only" });
    const user = store.findUserById((req.params as { id: string }).id);
    if (!user) return reply.code(404).send({ code: "NOT_FOUND", message: "no such user" });
    store.setDisabled(user.id, Boolean((req.body as { disabled?: boolean }).disabled));
    audit({ event: "admin-disabled", contact: user.contact, disabled: Boolean((req.body as { disabled?: boolean }).disabled) });
    return { ok: true };
  });

  // credential rotation (#7): issue a fresh key; the old one stops working
  // immediately while plan, usage and bound accounts are preserved
  app.post<{ Params: { id: string } }>("/v1/admin/users/:id/rotate-key", async (req, reply) => {
    if (!requireAdmin(req)) return reply.code(403).send({ code: "FORBIDDEN", message: "admin only" });
    const user = store.findUserById((req.params as { id: string }).id);
    if (!user) return reply.code(404).send({ code: "NOT_FOUND", message: "no such user" });
    const apiKey = store.rotateApiKey(user.id);
    audit({ event: "key-rotated", contact: user.contact });
    return { ok: true, apiKey };
  });

  app.post<{ Body: { name?: string; appId?: string; appSecret?: string; ownerContact?: string } }>("/v1/admin/accounts", async (req, reply) => {
    if (!requireAdmin(req)) return reply.code(403).send({ code: "FORBIDDEN", message: "admin only" });
    const { name, appId, appSecret, ownerContact } = req.body ?? {};
    if (!name || !appId || !appSecret) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "name / appId / appSecret required" });
    }
    const owner = ownerContact ? store.findUserByContact(ownerContact) : null;
    if (ownerContact && !owner) return reply.code(400).send({ code: "BAD_REQUEST", message: `unknown owner contact "${ownerContact}"` });
    if (owner) {
      const limit = store.planAllowance(owner).accounts;
      if (store.countAccountsOwnedBy(owner.id) >= limit) {
        return reply.code(400).send({ code: "ACCOUNT_LIMIT", message: `plan limit is ${limit} account(s)` });
      }
    }
    store.upsertAccount({ name, appId, appSecret, ownerUserId: owner?.id ?? null });
    audit({ event: "admin-account-added", name, owner: ownerContact ?? "shared" });
    return { ok: true };
  });

  // novice onboarding: verify an AppID/AppSecret pair from THIS server so the
  // user learns immediately whether the IP whitelist / secret is right
  app.post<{ Body: { appId?: string; appSecret?: string } }>("/v1/admin/verify-wechat", async (req, reply) => {
    if (!requireAdmin(req)) return reply.code(403).send({ code: "FORBIDDEN", message: "admin only" });
    const { appId, appSecret } = req.body ?? {};
    if (!appId || !appSecret) return reply.code(400).send({ code: "BAD_REQUEST", message: "appId / appSecret required" });
    const result = await checkWechatCredential(appId, appSecret);
    audit({ event: "verify-wechat", appId, ok: result.ok, errcode: result.errcode });
    return result;
  });

  app.get<{ Querystring: { status?: string } }>("/v1/admin/orders", async (req, reply) => {
    if (!requireAdmin(req)) return reply.code(403).send({ code: "FORBIDDEN", message: "admin only" });
    const status = (req.query as { status?: string }).status;
    return { orders: store.listOrders(status || undefined) };
  });

  app.post<{ Params: { id: string } }>("/v1/admin/orders/:id/complete", async (req, reply) => {
    if (!requireAdmin(req)) return reply.code(403).send({ code: "FORBIDDEN", message: "admin only" });
    const done = payments.completeOrder((req.params as { id: string }).id);
    if (!done) return reply.code(404).send({ code: "NOT_FOUND", message: "no such order" });
    audit({ event: "admin-order-completed", orderId: done.id, contact: done.contact });
    return { ok: done.status === "paid", order: done };
  });

  // operator dashboard aggregates (one round-trip for the whole overview)
  app.get("/v1/admin/overview", async (req, reply) => {
    if (!requireAdmin(req)) return reply.code(403).send({ code: "FORBIDDEN", message: "admin only" });
    const users = store.listUsers();
    const mk = monthKey();
    const pro = users.filter((u) => store.isProActive(u)).length;
    const disabled = users.filter((u) => u.disabledAt).length;
    const monthTotal = users
      .filter((u) => u.monthKey === mk)
      .reduce((acc, u) => acc + u.publishCount, 0);
    const orders = store.listOrders();
    const pending = orders.filter((o) => o.status === "pending").length;
    const paid = orders.filter((o) => o.status === "paid");
    const todayPrefix = new Date().toISOString().slice(0, 10);
    let eventsToday = 0;
    try {
      const lines = fs.readFileSync(historyFile, "utf-8").trim().split("\n").slice(-2000);
      for (const line of lines) {
        try { if (String(JSON.parse(line).ts ?? "").startsWith(todayPrefix)) eventsToday += 1; }
        catch { /* skip malformed */ }
      }
    } catch { /* no history yet */ }
    return {
      users: { total: users.length, pro, disabled },
      publishes: { monthTotal },
      orders: { pending, paid: paid.length, revenueFen: paid.reduce((a, o) => a + o.amountFen, 0) },
      accounts: { total: (config.accounts ?? []).length + store.listAccounts().length },
      eventsToday,
    };
  });

  // account inventory for the console: names + appIds + resolved owner
  // contact; secrets never leave the server
  app.get("/v1/admin/accounts", async (req, reply) => {
    if (!requireAdmin(req)) return reply.code(403).send({ code: "FORBIDDEN", message: "admin only" });
    const configNames = new Set((config.accounts ?? []).map((a) => a.name));
    const all = [
      ...(config.accounts ?? []).map((a) => ({ name: a.name, appId: a.appId, owner: null as string | null, source: "config" })),
      ...store.listAccounts()
        .filter((a) => !configNames.has(a.name))
        .map((a) => ({
          name: a.name,
          appId: a.appId,
          owner: a.ownerUserId ? (store.findUserById(a.ownerUserId)?.contact ?? null) : null,
          source: "db",
        })),
    ];
    return { accounts: all };
  });

  // --- websocket tickets --------------------------------------------------------

  // the long-lived key is exchanged over an authenticated header here and the
  // short-lived signed ticket goes into the gateway URL instead (#8)
  app.post("/v1/ws-ticket", async (req, reply) => {
    const caller = (req as unknown as { caller: Caller }).caller;
    if (!config.secretKey) {
      return reply.code(501).send({ code: "NO_TICKET_KEY", message: "set secretKey in server.json to enable WS tickets" });
    }
    const identity = caller.admin ? "admin" : `user:${caller.user.id}`;
    const { ticket, expiresAt } = signWsTicket(config.secretKey, identity);
    return { ticket, expiresAt: new Date(expiresAt).toISOString(), identity };
  });

  return app;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const configIdx = argv.indexOf("--config");
  const configPath = configIdx >= 0 ? argv[configIdx + 1] : undefined;
  const config = loadServerConfig(configPath);
  if (!config.publicIp) {
    config.publicIp = (await detectEgressIp()) ?? undefined;
    if (config.publicIp) console.log(`[boot] detected egress IP: ${config.publicIp} (set "publicIp" in server.json to pin it)`);
  }
  if (!config.secretKey) {
    config.secretKey = crypto.randomBytes(32).toString('hex');
    const cfgFile = configPath ?? process.env.PUBLY_SERVER_CONFIG ?? path.join(os.homedir(), '.publy', 'server.json');
    try {
      const raw = JSON.parse(fs.readFileSync(cfgFile, 'utf-8'));
      raw.secretKey = config.secretKey;
      fs.writeFileSync(cfgFile, JSON.stringify(raw, null, 2), { mode: 0o600 });
      console.log('[boot] generated secretKey for AppSecret encryption');
    } catch { console.error('[boot] could not persist secretKey — secrets stay encrypted only after manual key setup'); }
  }
  const app = buildApp(config);
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`publy-server listening on :${config.port} (purchase page: ${config.publicUrl ?? "http://localhost:" + config.port}/ )`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
