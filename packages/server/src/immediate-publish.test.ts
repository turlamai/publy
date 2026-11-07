import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp } from "./index.js";

const headers = { "x-api-key": "synthetic-admin", "content-type": "application/json" };
const payload = { account: "synthetic", title: "Sample", type: "image_post" as const,
  images: [{ name: "test.png", contentType: "image/png", data: Buffer.from("synthetic-image").toString("base64") }], idempotencyKey: "synthetic-request" };
const config = (dir: string) => ({ port: 0, apiKey: "synthetic-admin", dataDir: dir,
  accounts: [{ name: "synthetic", appId: "wx_synthetic", appSecret: "synthetic" }] });

test("concurrent immediate requests create one draft and confirmed claim survives JSON loss", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-immediate-"));
  const originalFetch = globalThis.fetch;
  let release!: () => void, notify!: () => void, draftCalls = 0;
  const started = new Promise<void>((resolve) => { notify = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/cgi-bin/token")) return Response.json({ access_token: "synthetic", expires_in: 7200 });
    if (url.includes("/material/add_material")) return Response.json({ media_id: "material", url: "https://example.test/image" });
    if (url.includes("/draft/add")) { draftCalls++; notify(); await gate; return Response.json({ media_id: "draft-one" }); }
    throw new Error("unexpected synthetic URL");
  };
  let app = buildApp(config(dir));
  const peer = buildApp(config(dir));
  try {
    await app.ready();
    await peer.ready();
    const first = app.inject({ method: "POST", url: "/v1/publish", headers, payload });
    await started;
    const duplicate = await peer.inject({ method: "POST", url: "/v1/publish", headers, payload });
    assert.equal(duplicate.statusCode, 409);
    assert.equal(duplicate.json().code, "DRAFT_OUTCOME_UNKNOWN");
    const changed = await peer.inject({ method: "POST", url: "/v1/publish", headers, payload: { ...payload, title: "Different" } });
    assert.equal(changed.json().code, "IDEMPOTENCY_CONFLICT");
    release();
    assert.equal((await first).json().mediaId, "draft-one");
    const peerRetry = await peer.inject({ method: "POST", url: "/v1/publish", headers, payload });
    assert.equal(peerRetry.json().deduped, true, "a peer with stale JSON memory must use the durable claim");
    assert.equal(draftCalls, 1);
    await peer.close();
    await app.close();
    fs.unlinkSync(path.join(dir, "idempotency.json"));
    app = buildApp(config(dir));
    await app.ready();
    const recovered = await app.inject({ method: "GET", url: "/v1/publish-result/synthetic-request", headers });
    assert.equal(recovered.json().mediaId, "draft-one");
    const retry = await app.inject({ method: "POST", url: "/v1/publish", headers, payload });
    assert.equal(retry.json().deduped, true);
    assert.equal(draftCalls, 1);
  } finally {
    release();
    globalThis.fetch = originalFetch;
    await peer.close();
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a lost draft response remains blocked after restart", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-unknown-"));
  const originalFetch = globalThis.fetch;
  let draftCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/cgi-bin/token")) return Response.json({ access_token: "synthetic", expires_in: 7200 });
    if (url.includes("/material/add_material")) return Response.json({ media_id: "material", url: "https://example.test/image" });
    if (url.includes("/draft/add")) { draftCalls++; throw new Error("synthetic lost response after remote acceptance"); }
    throw new Error("unexpected synthetic URL");
  };
  let app = buildApp(config(dir));
  try {
    await app.ready();
    const first = await app.inject({ method: "POST", url: "/v1/publish", headers, payload });
    assert.equal(first.statusCode, 409);
    assert.equal(first.json().code, "DRAFT_OUTCOME_UNKNOWN");
    await app.close();
    app = buildApp(config(dir));
    await app.ready();
    const query = await app.inject({ method: "GET", url: "/v1/publish-result/synthetic-request", headers });
    assert.equal(query.json().status, "unknown");
    const retry = await app.inject({ method: "POST", url: "/v1/publish", headers, payload });
    assert.equal(retry.json().code, "DRAFT_OUTCOME_UNKNOWN");
    assert.equal(draftCalls, 1, "the ambiguous operation must never be resent automatically");
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("confirmed claims expire after the duplicate window; unknown claims do not", async () => {
  const { Store } = await import("./store.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-claims-ttl-"));
  const store = new Store(dir);
  try {
    assert.equal(store.claimImmediate("done", "admin", "fingerprint", 1000, 600000), "claimed");
    store.confirmImmediate("done", "admin", "fingerprint", "draft", 1000);
    assert.equal(store.claimImmediate("done", "admin", "fingerprint", 600999, 600000), "existing");
    assert.equal(store.claimImmediate("done", "admin", "fingerprint", 601000, 600000), "claimed");
    assert.equal(store.claimImmediate("unknown", "admin", "fingerprint", 1000, 600000), "claimed");
    assert.equal(store.claimImmediate("unknown", "admin", "fingerprint", 900000000, 600000), "existing");
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("known pre-draft failures and explicit WeChat rejections release the claim", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-rejected-"));
  const originalFetch = globalThis.fetch;
  let tokenFails = true, draftRejects = true, draftCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/cgi-bin/token")) {
      if (tokenFails) { tokenFails = false; return Response.json({ errcode: 40001, errmsg: "synthetic rejection" }); }
      return Response.json({ access_token: "synthetic", expires_in: 7200 });
    }
    if (url.includes("/material/add_material")) return Response.json({ media_id: "material", url: "https://example.test/image" });
    if (url.includes("/draft/add")) {
      draftCalls++;
      if (draftRejects) { draftRejects = false; return Response.json({ errcode: 40003, errmsg: "synthetic rejection" }); }
      return Response.json({ media_id: "draft-after-correction" });
    }
    throw new Error("unexpected synthetic URL");
  };
  const app = buildApp(config(dir));
  try {
    await app.ready();
    const post = () => app.inject({ method: "POST", url: "/v1/publish", headers, payload });
    assert.equal((await post()).json().code, "WECHAT_40001");
    assert.equal((await post()).json().code, "WECHAT_40003");
    assert.equal((await post()).json().mediaId, "draft-after-correction");
    assert.equal(draftCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
