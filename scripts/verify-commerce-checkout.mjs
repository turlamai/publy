#!/usr/bin/env node
// Synthetic loopback proof only. It never reaches Alipay or a real account.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { requestHostedCheckout } from "../packages/server/dist/commerce-checkout-request.js";
import { Store } from "../packages/server/dist/store.js";
import { buildApp } from "../packages/server/dist/index.js";

const commerce = process.env.COMMERCE_ROOT && path.resolve(process.env.COMMERCE_ROOT);
const permit = process.env.PERMIT_ROOT && path.resolve(process.env.PERMIT_ROOT);
if (!commerce || !permit) throw new Error("Set COMMERCE_ROOT and PERMIT_ROOT to clean pinned checkouts");
for (const [dir, revision] of [[commerce, "834a35a4f528958b9751d8e9ca345540e32d4431"], [permit, "4ac89f540bf6ddc3f337239d974a198612f8e705"]]) {
  const head = spawnSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" });
  const dirty = spawnSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8" });
  if (head.status !== 0 || head.stdout.trim() !== revision || dirty.status !== 0 || dirty.stdout.trim()) {
    throw new Error("Dependency checkout must be clean and match its pinned revision");
  }
}
const port = await new Promise((resolve, reject) => {
  const listener = net.createServer();
  listener.on("error", reject);
  listener.listen(0, "127.0.0.1", () => {
    const n = listener.address().port;
    listener.close((err) => err ? reject(err) : resolve(n));
  });
});
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-checkout-loopback-"));
let child, app;
try {
const publyData = path.join(dir, "publy-data");
const seed = new Store(publyData);
let user, subject;
try {
  user = seed.createUser("synthetic-contact", "free", 0);
  subject = seed.enrollHostedSubject(user.id);
} finally { seed.close(); }
const file = path.join(dir, "fixture.rkt");
fs.writeFileSync(file, String.raw`#lang racket/base
(require base64 json racket/file crypto crypto/libcrypto
         commerce commerce/admission commerce/alipay/checkout-http
         commerce/alipay/checkout-idempotency commerce/hosted-replay/sqlite
         commerce/storage/sqlite)
(define dir (getenv "PUBLY_FIXTURE_DIR"))
(define private (parameterize ([crypto-factories (list libcrypto-factory)])
                  (generate-private-key (get-pk 'rsa) '((nbits 2048)))))
(define public (pk-key->public-only-key private))
(define pem (string-append "-----BEGIN PUBLIC KEY-----\n"
  (bytes->string/utf-8 (base64-encode (pk-key->datum public 'SubjectPublicKeyInfo) #:line #f))
  "\n-----END PUBLIC KEY-----\n"))
(call-with-output-file (build-path dir "public.pem") (lambda (out) (display pem out)))
(define record (hasheq 'version 1 'provider "alipay" 'environment "sandbox"
  'merchant_app_id "fixture-app" 'seller_id "fixture-seller" 'product_category "fixture"
  'admission_reference "fixture" 'cost_reference "fixture"
  'checkout_api "alipay.trade.page.pay" 'read_api "alipay.trade.query"
  'approved_at 1 'expires_at 4102444800
  'capabilities (list (hasheq 'offer_id "publy-personal-monthly" 'product_id "publy"
    'method "alipay" 'transaction_type "one-time" 'currency "CNY"
    'amount_minor 2900 'min_minor 1 'max_minor 100000))))
(define admission-path (build-path dir "admission.json"))
(call-with-output-file admission-path (lambda (out) (write-json record out)))
(define store (open-sqlite-commerce-storage (build-path dir "commerce.sqlite")))
(define nonce-path (build-path dir "nonces.sqlite"))
(define claims-path (build-path dir "claims.sqlite"))
(initialize-sqlite-hosted-replay-store! nonce-path)
(initialize-sqlite-alipay-checkout-claims! claims-path)
(define endpoint
  (make-alipay-checkout-http-endpoint
   #:storage store #:resolve-key (lambda (id) (and (equal? id "service") (make-bytes 32 107)))
   #:allow-scope (lambda (s i t u o p)
     (and (equal? s "service") (equal? i "fixture") (equal? t "account")
          (equal? u (getenv "PUBLY_FIXTURE_SUBJECT")) (equal? o "publy-personal-monthly") (equal? p "publy")))
   #:claim-once! (make-sqlite-hosted-replay-claimer nonce-path)
   #:checkout-claim! (make-sqlite-alipay-checkout-claimer claims-path)
   #:resolve-offer (lambda (p o) (and (equal? p "publy") (equal? o "publy-personal-monthly")
                                      (offer o p 'one-time (money "CNY" 2900) "fixture-policy")))
   #:title "Publy Personal" #:admission (read-provider-admission admission-path)
   #:environment "sandbox" #:app-id "fixture-app" #:seller-id "fixture-seller"
   #:private-key private #:notify-url "https://example.test/notify" #:return-url "https://example.test/return"))
(serve-alipay-checkout-http-endpoint endpoint #:port (string->number (getenv "PUBLY_FIXTURE_PORT")))
`);
child = spawn("racket", [file], { env: { ...process.env, PUBLY_FIXTURE_DIR: dir,
  PUBLY_FIXTURE_PORT: String(port), PUBLY_FIXTURE_SUBJECT: subject,
  PLTCOLLECTS: commerce + path.delimiter + permit + path.delimiter + (process.env.PLTCOLLECTS ?? "") },
  stdio: ["ignore", "pipe", "pipe"] });
let output = "", childError = null;
child.on("error", (err) => { childError = err; });
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    if (childError) throw childError;
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Synthetic fixture exited: " + output.slice(-1000));
    try { await fetch(`http://127.0.0.1:${port}/v1/hosted/alipay-checkout`, { signal: AbortSignal.timeout(500) }); ready = true; }
    catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  if (!ready) throw new Error("Synthetic fixture did not start: " + output.slice(-1000));
  const scope = { issuer: "fixture", subjectType: "account", subjectId: subject, offerId: "publy-personal-monthly", productId: "publy" };
  const input = { endpoint: `http://127.0.0.1:${port}/v1/hosted/alipay-checkout`, serviceId: "service", secret: Buffer.alloc(32, 107),
    scope, requestId: "fixture-request-1", environment: "sandbox", appId: "fixture-app", amountFen: 2900,
    merchantPublicKeyPem: fs.readFileSync(path.join(dir, "public.pem"), "utf8"),
    notifyUrl: "https://example.test/notify", returnUrl: "https://example.test/return" };
  const first = await requestHostedCheckout(input);
  if (first.status !== "ready" || first.paid !== false) throw new Error("Synthetic checkout was not verified");
  const retry = await requestHostedCheckout(input);
  if (retry.status !== "ready" || retry.orderId !== first.orderId) throw new Error("Retry did not recover the same order");
  const wrongAccount = await requestHostedCheckout({ ...input, scope: { ...scope, subjectId: "account-b" } });
  if (wrongAccount.status !== "unknown") throw new Error("Unauthorized subject was not refused");
  const wrongAmount = await requestHostedCheckout({ ...input, amountFen: 1 });
  if (wrongAmount.status !== "unknown") throw new Error("Mismatched amount was not refused");
  app = buildApp({ port: 0, apiKey: "synthetic-admin", dataDir: publyData,
    accounts: [{ name: "fixture", appId: "wx_fixture", appSecret: "synthetic" }],
    sandboxCheckout: { endpoint: input.endpoint, serviceId: input.serviceId, secret: input.secret, issuer: "fixture",
      appId: input.appId, merchantPublicKeyPem: input.merchantPublicKeyPem, notifyUrl: input.notifyUrl, returnUrl: input.returnUrl } });
  await app.ready();
  const checkoutRequest = { method: "POST", url: "/v1/hosted/checkout", headers: { "x-api-key": user.apiKey },
    payload: { offer: "publy-personal-monthly", requestId: "sandbox-request-123456" } };
  const appFirst = await app.inject(checkoutRequest);
  const appRetry = await app.inject(checkoutRequest);
  if (appFirst.statusCode !== 200 || appFirst.json().paid !== false || appRetry.statusCode !== 200 ||
      appFirst.json().orderId !== appRetry.json().orderId) throw new Error("Publy sandbox checkout route failed");
  console.log("PASS — Publy sandbox route and Commerce checkout, signature, scope and retry; no payment made");
} finally {
  try {
    if (app) await app.close();
  } finally {
    try {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]);
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
          await new Promise((resolve) => child.once("exit", resolve));
        }
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
}
