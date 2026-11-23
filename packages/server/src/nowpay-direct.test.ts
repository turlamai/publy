// Synthetic socket/verifier boundaries; cryptographic fixtures are tested in racket/.
import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp, loadServerConfig, type ServerConfig } from "./index.js";
import { Store } from "./store.js";
import { consultNowpayDirect } from "./nowpay-direct.js";

async function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-direct-"));
  const socketPath = process.platform === "win32" ? `\\\\.\\pipe\\publy-direct-${process.pid}-${Date.now()}` : path.join(dir, "issuer.sock");
  const verifierScript = path.join(dir, "verifier.cjs"), trustStore = path.join(dir, "trust.json");
  fs.writeFileSync(trustStore, "{}");
  fs.writeFileSync(verifierScript, `let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const i=JSON.parse(s), r=i.credential;
    process.stdout.write(JSON.stringify({...r,status:'admitted',authorizes_use:true,entitlement_id:'synthetic-ent-'+i.account,payload_sha256:'a'.repeat(64)}));});`);
  let decision = "PURCHASE_REQUIRED", revision = 0, badNonce = false;
  const buyers: string[] = [];
  const server = net.createServer({ allowHalfOpen: true }, socket => {
    let input = "";
    socket.on("error", () => {});
    socket.on("data", c => input += c);
    socket.on("end", () => {
      const x = JSON.parse(input); buyers.push(x.buyer_id);
      const now = Math.floor(Date.now() / 1000) * 1000;
      const iso = (n: number) => new Date(n).toISOString().replace(/\.\d{3}Z$/, "Z");
      const ext = { request_nonce: badNonce ? "b".repeat(64) : x.nonce, service_id: "publy", provider_product_id: "product_synthetic",
        valid_from: iso(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1)),
        valid_until: iso(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() + 1, 1)),
        use_expires_at: iso(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() + 1, 1)),
        observed_at: iso(now), fresh_until: iso(now + 30_000), revision: ++revision };
      socket.end(JSON.stringify({ version: 1, nonce: x.nonce, buyer_id: x.buyer_id, decision,
        credential: ext, purchase_url: "alipays://platformapi/startapp?appId=synthetic",
        purchase_qr_code: "https://mobilecodec.alipay.com/client_download.htm?code=synthetic" }));
    });
  });
  await new Promise<void>(r => server.listen(socketPath, r));
  const direct = { socketPath, serviceId: "publy", outProductId: "product_synthetic", issuer: "issuer_synthetic",
    racketExecutable: process.execPath, verifierScript, trustStore, purchasingEnabled: true };
  return { dir, direct, buyers, setDecision: (d: string) => decision = d, setBadNonce: () => badNonce = true,
    close: async () => { await new Promise<void>((r, reject) => server.close(e => e ? reject(e) : r())); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } };
}

test("Direct uses only authenticated user IDs, restores accounts after restart and never repurchases active access", async () => {
  const f = await fixture();
  const config: ServerConfig = { port: 0, apiKey: "admin", accounts: [{ name: "operator", appId: "wx_synthetic", appSecret: "synthetic" }],
    dataDir: f.dir, secretKey: "a".repeat(64), hostedDirect: f.direct };
  let app = buildApp(config);
  try {
    await app.ready();
    const signup = (await app.inject({ method: "POST", url: "/v1/signup", payload: { contact: "buyer@example.test" } })).json();
    assert.equal(signup.subject, signup.userId);
    const headers = { "x-api-key": signup.apiKey };
    const status = () => app.inject({ method: "POST", url: "/v1/hosted/status", headers, payload: { buyer_id: "attacker" } });
    assert.equal((await status()).json().status, "purchase-required");
    assert.equal(f.buyers.at(-1), signup.userId);
    assert.match((await status()).json().qrDataUrl, /^data:image\/png;base64,/);
    f.setDecision("ALLOW");
    const active = await status();
    assert.equal(active.json().status, "active");
    assert.equal(active.json().purchaseUrl, undefined);
    assert.equal((app as unknown as { store: Store }).store.findUserById(signup.userId)?.plan, "personal");
    await app.close(); app = buildApp(config); await app.ready();
    const restored = await app.inject({ method: "POST", url: "/v1/hosted/session", headers, payload: {} });
    assert.equal(restored.statusCode, 200); assert.match(String(restored.headers["set-cookie"]), /HttpOnly/);
    assert.equal((await status()).json().status, "active");
    f.setDecision("DENY");
    assert.equal((await status()).statusCode, 403);
    f.setDecision("ALLOW"); f.setBadNonce();
    assert.equal((await status()).statusCode, 403, "even a successful verifier cannot authorize another nonce");
    assert.equal((await app.inject({ method: "POST", url: "/v1/hosted/status", payload: {} })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: "/v1/hosted/checkout", headers, payload: { offer: "publy-studio-annual", requestId: "request_synthetic" } })).statusCode, 409);
    const page = (await app.inject("/hosted")).body;
    assert.match(page, /¥29/); assert.doesNotMatch(page, /publy-studio|publy-personal-annual/);
  } finally { await app.close(); await f.close(); }
});

test("Direct configuration is exclusive, strict and keeps purchase URLs closed by default", async () => {
  const f = await fixture(); const store = new Store(f.dir);
  try {
    const r = await consultNowpayDirect({ ...f.direct, purchasingEnabled: false }, "buyer_synthetic", store.hostedFence());
    assert.deepEqual(r, { status: "purchase-required" });
    const file = path.join(f.dir, "server.json");
    fs.writeFileSync(file, JSON.stringify({ apiKey: "admin", accounts: [{ name: "x", appId: "x", appSecret: "x" }], hostedDirect: f.direct }));
    assert.equal(loadServerConfig(file).hostedDirect?.outProductId, "product_synthetic");
    fs.writeFileSync(file, JSON.stringify({ apiKey: "admin", accounts: [{ name: "x", appId: "x", appSecret: "x" }], hostedDirect: { ...f.direct, socketPath: "relative" } }));
    assert.throws(() => loadServerConfig(file), /absolute/);
    assert.throws(() => buildApp({ port: 0, apiKey: "admin", accounts: [], hostedDirect: f.direct, hostedAdmission: {} as never }), /exclusive/);
  } finally { store.close(); await f.close(); }
});

test("Direct quota commits claims atomically, holds unknown drafts and isolates billing periods and users", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-direct-quota-"));
  let store = new Store(dir);
  try {
    const u = store.createUser("buyer_synthetic", "free", 1), v = store.createUser("other_synthetic", "free", 1);
    const now = Date.now(), period = { validFrom: now - 1000, validUntil: now + 100000 };
    const owner = `user:${u.id}`, fp = "a".repeat(64);
    store.setDirectPeriod(u.id, period.validFrom, period.validUntil);
    for (let i = 0; i < 30; i++) store.reserveDirect(u.id, "op" + i, fp, period, 1);
    assert.throws(() => store.claimDirectImmediate("overflow", owner, fp, u.id, period, 1, { account: "x", title: "x" }), /QUOTA_EXCEEDED/);
    assert.equal(store.getImmediateClaim("overflow"), null);
    const ticket = store.directQuotaTicket(u.id, "op0")!;
    store.beginDirectSend(ticket); store.failDirect(ticket, false);
    assert.throws(() => store.reserveDirect(u.id, "op0", fp, period, 1), /UNRESOLVED/);
    assert.throws(() => store.reserveDirect(u.id, "op0", fp, { validFrom: now + 100000, validUntil: now + 200000 }, 1), /UNRESOLVED/);
    store.failDirect(store.directQuotaTicket(u.id, "op1")!, true);
    const claim = store.claimDirectImmediate("success", owner, fp, u.id, period, 1, { account: "x", title: "x" });
    store.beginDirectSend(claim.ticket!); store.confirmDirectImmediate(claim.ticket!, "success", owner, fp, "draft_synthetic");
    assert.equal(store.getUsage(store.findUserById(u.id)!), 1);
    store.close(); store = new Store(dir);
    assert.equal(store.getImmediateClaim("success")?.mediaId, "draft_synthetic");
    assert.equal(store.getUsage(store.findUserById(u.id)!), 1);
    assert.equal(store.reserveDirect(v.id, "op0", fp, period, 1).subject, v.id);
  } finally { store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});


test("Direct publish reserves the period allowance, deduplicates success and blocks use after withdrawal", async () => {
  const f = await fixture(); f.setDecision("ALLOW");
  const originalFetch = globalThis.fetch; let drafts = 0;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes("/cgi-bin/token")) return Response.json({ access_token: "synthetic", expires_in: 7200 });
    if (url.includes("/material/add_material")) return Response.json({ media_id: "material", url: "https://example.test/image" });
    if (url.includes("/draft/add")) { drafts++; return Response.json({ media_id: "draft-" + drafts }); }
    throw new Error("unexpected synthetic URL");
  };
  const app = buildApp({ port: 0, apiKey: "admin", accounts: [], dataDir: f.dir, hostedDirect: f.direct });
  try {
    await app.ready();
    const store = (app as unknown as { store: Store }).store;
    const user = store.createUser("publish_synthetic", "free", 1);
    store.insertOwnedAccount({ name: "owned", appId: "wx_owned", appSecret: "synthetic", ownerUserId: user.id }, 1);
    const headers = { "x-api-key": user.apiKey };
    const body = { account: "owned", title: "Synthetic", type: "image_post", images: [{ name: "test.png", contentType: "image/png", data: Buffer.from("synthetic").toString("base64") }] };
    const publish = (key: string) => app.inject({ method: "POST", url: "/v1/publish", headers, payload: { ...body, idempotencyKey: key } });
    const first = await publish("one"); assert.equal(first.statusCode, 200, first.body);
    assert.equal((await publish("one")).json().deduped, true); assert.equal(drafts, 1);
    assert.equal((await app.inject({ method: "POST", url: "/v1/publish", headers, payload: body })).json().code, "REQUEST_ID_REQUIRED");
    f.setDecision("DENY"); assert.equal((await publish("withdrawn")).statusCode, 403); assert.equal(drafts, 1);
    f.setDecision("ALLOW");
    for (let i = 1; i < 30; i++) assert.equal((await publish("task-" + i)).statusCode, 200);
    const overflow = await publish("overflow"); assert.equal(overflow.json().code, "QUOTA_EXCEEDED"); assert.equal(overflow.statusCode, 429);
    assert.equal(drafts, 30); assert.equal(store.getUsage(store.findUserById(user.id)!), 30);
  } finally { globalThis.fetch = originalFetch; await app.close(); await f.close(); }
});
