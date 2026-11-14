#!/usr/bin/env node
// Full synthetic purchase lifecycle. No live keys, gateway or WeChat calls.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../packages/server/dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commerce = process.env.COMMERCE_ROOT && path.resolve(process.env.COMMERCE_ROOT);
const permit = process.env.PERMIT_ROOT && path.resolve(process.env.PERMIT_ROOT);
assert.ok(commerce && permit, "Set COMMERCE_ROOT and PERMIT_ROOT to clean pinned packages");
for (const [directory, revision] of [[commerce, "af6494a18109b96f94e53cac96fbb4769af9ccc4"],
                                    [permit, "a55632bb5e380aebfc114b9069b7abd7218c2386"]]) {
  const head = spawnSync("git", ["-C", directory, "rev-parse", "HEAD"], { encoding: "utf8" });
  const dirty = spawnSync("git", ["-C", directory, "status", "--porcelain"], { encoding: "utf8" });
  assert.equal(head.status, 0); assert.equal(head.stdout.trim(), revision);
  assert.equal(dirty.status, 0); assert.equal(dirty.stdout.trim(), "");
}
const located = spawnSync(process.platform === "win32" ? "where" : "which", ["racket"], { encoding: "utf8" });
assert.equal(located.status, 0, "Racket is required");
const racket = located.stdout.trim().split(/\r?\n/)[0];
const collects = commerce + path.delimiter + permit + path.delimiter + (process.env.PLTCOLLECTS ?? "");
const originalCollects = process.env.PLTCOLLECTS;
process.env.PLTCOLLECTS = collects;
const ports = new Set();
async function freePort() {
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer(); server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
  if (ports.has(port)) return freePort();
  ports.add(port); return port;
}
const checkoutPort = await freePort(), proofPort = await freePort();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-private-lifecycle-"));
const originalFetch = globalThis.fetch;
let externalAttempts = 0, child, app;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !ports.has(Number(url.port))) {
    externalAttempts++;
    throw new Error("Private fixture refuses non-fixture network requests");
  }
  return originalFetch(input, { ...init, redirect: "error", signal: init?.signal ?? AbortSignal.timeout(5000) });
};
const scenarios = [];
let stdout = "", diagnostic = "", childError;
const replies = [], waiting = [];
function acceptReply(value) {
  const next = waiting.shift();
  if (next) next(value); else replies.push(value);
}
async function command(action, order) {
  const reply = new Promise((resolve) => replies.length ? resolve(replies.shift()) : waiting.push(resolve));
  child.stdin.write(JSON.stringify({ action, order }) + "\n");
  let timer;
  try {
    return await Promise.race([reply, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Synthetic provider command timed out")), 20000);
    })]);
  } finally { clearTimeout(timer); }
}
function counts() {
  const db = new DatabaseSync(path.join(dir, "commerce.sqlite"), { readOnly: true });
  try {
    return ["commerce_event_journal", "commerce_issuance_outbox", "commerce_entitlement_revision"]
      .map((table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
  } finally { db.close(); }
}
try {
  child = spawn(racket, [path.join(root, "scripts/fixtures/vibe-pay-lifecycle.rkt"), dir, String(checkoutPort), String(proofPort)],
    { env: { ...process.env, PLTCOLLECTS: collects }, stdio: ["pipe", "pipe", "pipe"] });
  child.on("error", (error) => { childError = error; });
  child.stdin.on("error", (error) => { childError = error; });
  child.stderr.on("data", (chunk) => { diagnostic = (diagnostic + chunk).slice(-2000); });
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    let end;
    while ((end = stdout.indexOf("\n")) !== -1) {
      const line = stdout.slice(0, end); stdout = stdout.slice(end + 1);
      if (line.startsWith("FIXTURE ")) acceptReply(JSON.parse(line.slice(8)));
    }
  });
  for (const [port, route] of [[checkoutPort, "/v1/hosted/alipay-checkout"], [proofPort, "/v1/hosted/proof"]]) {
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) {
      if (childError) throw childError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error("Synthetic fixture exited: " + diagnostic);
      try { await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(300) }); ready = true; }
      catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, "Synthetic listener did not start: " + diagnostic);
  }
  const offer = "publy-personal-monthly", secret = Buffer.alloc(32, 107);
  const config = { port: 0, apiKey: "synthetic-admin", dataDir: path.join(dir, "publy"),
    accounts: [{ name: "fixture", appId: "wx_fixture", appSecret: "synthetic" }],
    hostedCheckout: { endpoint: `http://127.0.0.1:${checkoutPort}/v1/hosted/alipay-checkout`, serviceId: "fixture-service",
      secret, issuer: "fixture-issuer", environment: "sandbox", appId: "fixture-app",
      merchantPublicKeyPem: JSON.parse(fs.readFileSync(path.join(dir, "merchant-public.json"), "utf8")),
      notifyUrl: "https://example.test/notify", returnUrl: "https://example.test/return" },
    hostedAdmission: { endpoint: `http://127.0.0.1:${proofPort}/v1/hosted/proof`, serviceId: "fixture-service",
      secret, issuer: "fixture-issuer", offerId: offer, racketExecutable: racket,
      verifierScript: path.join(root, "racket/publy-hosted-admission-cli.rkt"), trustStore: path.join(dir, "trust.json"), enroll: true } };
  app = buildApp(config); await app.ready();
  const signup = await app.inject({ method: "POST", url: "/v1/signup", payload: { contact: "buyer@example.test" } });
  assert.equal(signup.statusCode, 200);
  const account = signup.json(), cookie = String(signup.headers["set-cookie"]).split(";")[0];
  fs.writeFileSync(path.join(dir, "subject"), account.subject, { mode: 0o600 });
  const headers = { "x-api-key": account.apiKey, cookie };
  const purchase = { method: "POST", url: "/v1/hosted/checkout", headers,
    payload: { offer, requestId: "lifecycle-request-0001" } };
  const first = await app.inject(purchase), repeated = await app.inject(purchase);
  assert.equal(first.statusCode, 200); assert.equal(repeated.statusCode, 200);
  const order = first.json().orderId;
  assert.equal(first.json().paid, false); assert.equal(repeated.json().orderId, order);
  const userId = app.store.findUserByContact("buyer@example.test").id;
  assert.equal(app.store.findUserById(userId).plan, "free");
  assert.deepEqual(counts(), [0, 0, 0]);
  scenarios.push("signup-and-same-order-checkout-retry");
  const unpaid = await app.inject({ method: "GET", url: "/hosted/return", headers: { cookie } });
  assert.match(unpaid.body, /还在确认支付/);
  assert.equal(app.store.findUserById(userId).plan, "free");
  const tampered = await command("tamper", order);
  assert.equal(tampered.http_status, 401); assert.deepEqual(counts(), [0, 0, 0]);
  scenarios.push("redirect-and-invalid-callback-do-not-grant-rights");
  const paid = await command("pay", order);
  assert.equal(paid.issued, true); assert.equal(paid.revision, 0);
  const retry = await command("pay", order);
  assert.equal(retry.issued, false); assert.deepEqual(counts(), [1, 1, 1]);
  scenarios.push("signed-callback-query-journal-evidence-verifier-and-single-issuance");
  const activated = await app.inject({ method: "GET", url: "/hosted/return", headers: { cookie } });
  assert.match(activated.body, /已开通/);
  assert.equal(app.store.findUserById(userId).plan, "personal");
  const fence = app.store.hostedFence().lookup(account.subject, offer);
  assert.equal(fence.entitlementId, paid.entitlement_id); assert.equal(fence.revision, 0);
  scenarios.push("real-permit-verification-and-account-bound-activation");
  await app.close(); app = buildApp(config); await app.ready();
  const lostSession = await app.inject({ method: "GET", url: "/hosted/return", headers: { cookie } });
  assert.match(lostSession.body, /无法确认购买会话/);
  const recovered = await app.inject({ method: "POST", url: "/v1/admin/hosted/reconcile",
    headers: { "x-api-key": "synthetic-admin" }, payload: { userId } });
  assert.equal(recovered.statusCode, 200);
  assert.equal(recovered.json().entitlementId, paid.entitlement_id); assert.equal(recovered.json().revision, 0);
  assert.deepEqual(counts(), [1, 1, 1]);
  scenarios.push("restart-lost-browser-session-and-verified-operator-recovery");
  const other = await app.inject({ method: "POST", url: "/v1/signup", payload: { contact: "other@example.test" } });
  assert.equal(other.statusCode, 200);
  const otherUser = app.store.findUserByContact("other@example.test");
  app.store.recordHostedPurchase(otherUser.id, offer, "synthetic-wrong-account");
  const refused = await app.inject({ method: "POST", url: "/v1/admin/hosted/reconcile",
    headers: { "x-api-key": "synthetic-admin" }, payload: { userId: otherUser.id } });
  assert.equal(refused.statusCode, 409); assert.equal(app.store.findUserById(otherUser.id).plan, "free");
  scenarios.push("wrong-account-recovery-denied");
  const refunded = await command("refund", order);
  assert.equal(refunded.issued, true); assert.equal(refunded.entitlement_id, paid.entitlement_id);
  assert.equal(refunded.revision, 1);
  const refundRetry = await command("refund", order);
  assert.equal(refundRetry.issued, false); assert.deepEqual(counts(), [2, 2, 2]);
  const noRecovery = await app.inject({ method: "POST", url: "/v1/admin/hosted/reconcile",
    headers: { "x-api-key": "synthetic-admin" }, payload: { userId } });
  assert.equal(noRecovery.statusCode, 409);
  app.store.upsertAccount({ name: "owned", appId: "wx_fixture_owned", appSecret: "synthetic", ownerUserId: userId });
  const noPublish = await app.inject({ method: "POST", url: "/v1/publish", headers: { "x-api-key": account.apiKey },
    payload: { account: "owned", title: "Synthetic blocked draft", type: "article", html: "<p>fixture</p>" } });
  assert.equal(noPublish.statusCode, 403); assert.equal(noPublish.json().code, "HOSTED_ADMISSION_REQUIRED");
  assert.equal(externalAttempts, 0);
  scenarios.push("signed-refund-withdrawal-replay-and-future-work-denial");
  console.log(JSON.stringify({ status: "pass", scope: "synthetic-private-lifecycle", scenarios,
    journalEvents: 2, signedRevisions: 2, externalNetworkAttempts: externalAttempts, realPayment: false, wechatDraftCreated: false }));
} finally {
  try { if (app) await app.close(); }
  finally {
    try {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]);
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL"); await new Promise((resolve) => child.once("exit", resolve));
        }
      }
    } finally {
      globalThis.fetch = originalFetch;
      if (originalCollects === undefined) delete process.env.PLTCOLLECTS; else process.env.PLTCOLLECTS = originalCollects;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}
