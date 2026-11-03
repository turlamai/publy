#!/usr/bin/env node
// Developer-only loopback interoperability probe. Uses synthetic keys/data;
// never calls a real Commerce, payment or WeChat deployment.
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { observeHostedProof } from "../packages/server/dist/commerce-proof-request.js";
import { HostedEntitlementFence } from "../packages/server/dist/hosted-entitlement-fence.js";
import { HostedQuotaLedger } from "../packages/server/dist/hosted-quota.js";

const commerce = process.env.COMMERCE_ROOT && path.resolve(process.env.COMMERCE_ROOT);
const permit = process.env.PERMIT_ROOT && path.resolve(process.env.PERMIT_ROOT);
if (!commerce || !permit) throw new Error("Set COMMERCE_ROOT and PERMIT_ROOT to the pinned checkouts");
for (const [directory, revision] of [[commerce, "61d12372f8dcfeb1a9a997f63a07bc5583c226ca"],
                                    [permit, "4ac89f540bf6ddc3f337239d974a198612f8e705"]]) {
  const head = spawnSync("git", ["-C", directory, "rev-parse", "HEAD"], { encoding: "utf8" });
  const dirty = spawnSync("git", ["-C", directory, "status", "--porcelain"], { encoding: "utf8" });
  if (head.status !== 0 || head.stdout.trim() !== revision || dirty.status !== 0 || dirty.stdout.trim()) {
    throw new Error("Dependency checkout must be clean and match its pinned revision");
  }
}
const collects = commerce + path.delimiter + permit + path.delimiter + (process.env.PLTCOLLECTS ?? "");
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
         permit/trust permit/issuer file/sha1 json)
(define dir (getenv "PUBLY_FIXTURE_DIR"))
(define store (open-sqlite-commerce-storage (build-path dir "commerce.sqlite")))
(define nonce-path (build-path dir "nonces.sqlite"))
(initialize-sqlite-hosted-replay-store! nonce-path)
(define-values (private public) (generate-ed25519-keypair))
(define trust-json (hasheq 'protocol "permit-trust-store" 'version 1 'issuer "issuer"
  'keys (hasheq 'test (hasheq 'algorithm "Ed25519" 'public_key (public-key->base64 public)
  'status "active" 'purposes '("entitlement") 'not_before 'null 'not_after 'null))))
(define trust (jsexpr->trust-store trust-json))
(call-with-output-file (build-path dir "trust.json") #:exists 'error (lambda (out) (write-json trust-json out)))
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
  PUBLY_FIXTURE_PORT: String(freePort), PLTCOLLECTS: collects }, stdio: ["ignore", "pipe", "pipe"] });
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
  // Publy independently verifies the exact signed envelope with Permit. This
  // still does not authorize use without current state and quota admission.
  const verifyFile = path.join(dir, "inspect.rkt");
  fs.writeFileSync(verifyFile, String.raw`#lang racket/base
(require json permit/trust)
(define inspect (dynamic-require (string->path (getenv "PUBLY_PROOF_MODULE")) 'inspect-publy-hosted-proof))
(write-json (inspect (read-json) (read-trust-store (getenv "PUBLY_FIXTURE_TRUST"))
  #:account "customer-a" #:plan "personal" #:at "2026-11-01T00:00:00Z"))
`);
  const modulePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../racket/publy-hosted-proof.rkt");
  const verify = (credential) => {
    const run = spawnSync("racket", [verifyFile], { input: JSON.stringify(credential), encoding: "utf8",
      env: { ...process.env, PUBLY_PROOF_MODULE: modulePath, PUBLY_FIXTURE_TRUST: path.join(dir, "trust.json"), PLTCOLLECTS: collects } });
    if (run.status !== 0) throw new Error("Independent Permit verification failed: " + run.stderr.slice(-1000));
    return JSON.parse(run.stdout);
  };
  const checked = verify(allowedScope.credential);
  if (checked.status !== "verified-local" || checked.authorizes_use !== false || checked.entitlement_id !== allowedScope.entitlementId) {
    throw new Error("Independent Permit verification did not confirm the expected lineage");
  }
  const tampered = verify({ ...allowedScope.credential, payload: "dGFtcGVyZWQ=" });
  if (tampered.status !== "denied") throw new Error("Tampered signed proof was accepted");
  // Exercise durable product-side fences and quota with synthetic inputs only.
  const productDb = new DatabaseSync(path.join(dir, "product-fixture.sqlite"));
  try {
    const fence = new HostedEntitlementFence(productDb);
    const exactPayload = Buffer.from(allowedScope.credential.payload, "base64");
    const recorded = { subject: scope.subjectId, offer: scope.offerId, entitlementId: checked.entitlement_id,
      revision: checked.revision, payloadSha256: crypto.createHash("sha256").update(exactPayload).digest("hex") };
    if (fence.record(recorded, true) !== "enrolled" || fence.record(recorded, false) !== "unchanged") throw new Error("Entitlement fence failed");
    let staleRejected = false;
    try { fence.record({ ...recorded, revision: recorded.revision - 1 }, false); } catch { staleRejected = true; }
    // Synthetic issuance starts at revision 0; conflicting same-revision data
    // must be rejected even when no lower revision exists.
    let conflictRejected = false;
    try { fence.record({ ...recorded, payloadSha256: "f".repeat(64) }, false); } catch { conflictRejected = true; }
    if ((recorded.revision > 0 && !staleRejected) || !conflictRejected) throw new Error("Entitlement rollback fence failed");
    const quota = new HostedQuotaLedger(productDb);
    const now = Date.now(), periodStart = now - 1000, periodEnd = now + 60000;
    const admission = { subject: scope.subjectId, requestId: "synthetic-request", fingerprint: "a".repeat(64), periodStart, periodEnd, limit: 1, now };
    if (quota.reserve(admission).status !== "reserved") throw new Error("Quota reservation failed");
    quota.beginSend(scope.subjectId, admission.requestId, now);
    quota.markUnknown(scope.subjectId, admission.requestId);
    if (quota.reserve({ ...admission, requestId: "second-request" }).status !== "exhausted") throw new Error("Unknown delivery did not retain quota");
  } finally { productDb.close(); }
  const stale = await observeHostedProof({ ...request, minimumRevision: allowedScope.revision + 1, expectedEntitlementId: allowedScope.entitlementId });
  const forbiddenScope = await observeHostedProof({ ...request, scope: { ...scope, subjectId: "other-account" } });
  if (stale.status !== "no-proof" || forbiddenScope.status !== "unavailable") {
    throw new Error("Commerce revision fence or scope isolation failed");
  }
  console.log("PASS — synthetic proof verified; tampering, stale revision and cross-account denied; quota/fence persisted; no access granted");
} finally {
  if (!childError) child.kill("SIGTERM");
  if (!childError && child.exitCode === null && child.signalCode === null) await new Promise((resolve) => child.once("exit", resolve));
  fs.rmSync(dir, { recursive: true, force: true });
}
