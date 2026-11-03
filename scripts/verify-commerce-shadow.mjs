#!/usr/bin/env node
// Developer-only loopback interoperability probe. Uses synthetic keys/data;
// never calls a real Commerce, payment or WeChat deployment.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { observeHostedProof } from "../packages/server/dist/commerce-proof-request.js";

const commerce = process.env.COMMERCE_ROOT && path.resolve(process.env.COMMERCE_ROOT);
if (!commerce) throw new Error("Set COMMERCE_ROOT to the pinned Commerce checkout");
const pinned = "61d12372f8dcfeb1a9a997f63a07bc5583c226ca";
const head = spawnSync("git", ["-C", commerce, "rev-parse", "HEAD"], { encoding: "utf8" });
if (head.status !== 0 || head.stdout.trim() !== pinned) throw new Error("Commerce checkout does not match pinned proof contract");
const freePort = await new Promise((resolve, reject) => {
  const listener = net.createServer();
  listener.on("error", reject);
  listener.listen(0, "127.0.0.1", () => {
    const port = listener.address().port;
    listener.close((err) => err ? reject(err) : resolve(port));
  });
});
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-commerce-shadow-"));
const file = path.join(dir, "fixture.rkt");
fs.writeFileSync(file, String.raw`#lang racket/base
(require commerce commerce/issuer commerce/journal commerce/permit commerce/provider
         commerce/hosted-http commerce/hosted-replay/sqlite commerce/storage commerce/storage/sqlite
         permit/trust permit/issuer file/sha1)
(define dir (getenv "PUBLY_FIXTURE_DIR"))
(define store (open-sqlite-commerce-storage (build-path dir "commerce.sqlite")))
(define nonce-path (build-path dir "nonces.sqlite"))
(initialize-sqlite-hosted-replay-store! nonce-path)
(define-values (private public) (generate-ed25519-keypair))
(define trust (jsexpr->trust-store (hasheq 'protocol "permit-trust-store" 'version 1 'issuer "issuer"
  'keys (hasheq 'test (hasheq 'algorithm "Ed25519" 'public_key (public-key->base64 public)
  'status "active" 'purposes '("entitlement") 'not_before 'null 'not_after 'null)))))
;; Entire payment/issuance fixture is synthetic and stays inside a temporary DB.
(define amount (money "CNY" 2900))
(define catalog (make-permit-policy-catalog
  (list (offer "personal-monthly" "publy" 'one-time amount "publy-personal-test"))
  (list (make-permit-entitlement-policy "publy-personal-test" 1 #:subject-type 'account
    #:grants (list (make-permit-grant-policy #:products '("publy") #:edition "personal"))
    #:constraints (make-permit-constraints-policy #:use-expires-at "2099-01-01T00:00:00Z")))))
(define worker (make-issuance-worker #:catalog catalog #:issuer "issuer" #:private-key private
  #:key-id "test" #:trust-store trust #:clock (lambda () (values 100 "2026-10-17T03:00:00Z"))))
(define raw #"synthetic-payment")
(journal-accept! store raw (make-verified-payment-event "mock" "payment-1"
  (bytes->hex-string (sha256-bytes raw)) 'payment-succeeded "order-1" "personal-monthly" "customer-a" amount 98)
  #:received-at 99)
(storage-project-next! store #:processed-at 99)
(unless (eq? (issuance-result-disposition (process-issuance-work! worker store)) 'completed)
  (error 'fixture "synthetic entitlement issuance failed"))
(define endpoint (make-hosted-proof-http-endpoint #:storage store #:trust-store trust
  #:resolve-key (lambda (id) (and (equal? id "publy-service") (make-bytes 32 107)))
  #:allow-scope (lambda (service issuer type subject offer product)
    (and (equal? service "publy-service") (equal? issuer "issuer") (equal? type "account")
         (equal? subject "customer-a") (equal? offer "personal-monthly") (equal? product "publy")))
  #:claim-once! (make-sqlite-hosted-replay-claimer nonce-path)))
(serve-hosted-proof-http-endpoint endpoint #:port (string->number (getenv "PUBLY_FIXTURE_PORT")) #:listen-ip "127.0.0.1")
`);
const child = spawn("racket", [file], { env: { ...process.env, PUBLY_FIXTURE_DIR: dir,
  PUBLY_FIXTURE_PORT: String(freePort), PLTCOLLECTS: commerce + path.delimiter + (process.env.PLTCOLLECTS ?? "") }, stdio: ["ignore", "pipe", "pipe"] });
let output = "", childError = null;
child.on("error", (error) => { childError = error; });
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });
try {
  // Poll only this disposable loopback listener; the fixture has no external services.
  const endpoint = `http://127.0.0.1:${freePort}/v1/hosted/proof`;
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    if (childError) throw childError;
    if (child.exitCode !== null) throw new Error("Synthetic Commerce fixture exited: " + output.slice(-1000));
    try { await fetch(endpoint, { signal: AbortSignal.timeout(500) }); ready = true; }
    catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  if (!ready) throw new Error("Synthetic Commerce fixture did not start: " + output.slice(-1000));
  const scope = { issuer: "issuer", subjectType: "account", subjectId: "customer-a", offerId: "personal-monthly", productId: "publy" };
  const request = { endpoint, serviceId: "publy-service", secret: Buffer.alloc(32, 107), scope,
    minimumRevision: null, expectedEntitlementId: null };
  const allowedScope = await observeHostedProof(request);
  if (allowedScope.status !== "verified-proof" || allowedScope.canAuthorize !== false) throw new Error("Synthetic signed proof was not observed");
  const stale = await observeHostedProof({ ...request, minimumRevision: allowedScope.revision + 1, expectedEntitlementId: allowedScope.entitlementId });
  const forbiddenScope = await observeHostedProof({ ...request, scope: { ...scope, subjectId: "other-account" } });
  if (stale.status !== "no-proof" || forbiddenScope.status !== "unavailable") {
    throw new Error("Commerce revision fence or scope isolation failed");
  }
  console.log("PASS — synthetic signed proof observed; stale revision and cross-account request denied; no access granted");
} finally {
  if (!childError) child.kill("SIGTERM");
  if (!childError && child.exitCode === null && child.signalCode === null) await new Promise((resolve) => child.once("exit", resolve));
  fs.rmSync(dir, { recursive: true, force: true });
}
