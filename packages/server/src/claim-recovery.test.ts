// Operator reconciliation of unresolved immediate-publish claims.
// Synthetic WeChat fixtures only: no live account, no real draft box.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildApp } from "./index.js";
import { Store } from "./store.js";

const headers = { "x-api-key": "synthetic-admin", "content-type": "application/json" };
const payload = {
  account: "synthetic",
  title: "Claim recovery sample",
  type: "article" as const,
  html: "<p>synthetic</p>",
  images: [{ name: "synthetic.png", contentType: "image/png", data: Buffer.from("synthetic-image").toString("base64") }],
  idempotencyKey: "synthetic-claim",
};
const config = (dir: string) => ({
  port: 0,
  apiKey: "synthetic-admin",
  dataDir: dir,
  accounts: [{ name: "synthetic", appId: "wx_synthetic", appSecret: "synthetic-secret" }],
});

interface DraftFixture { mediaId: string; title: string; updateTime?: number }

/** Draft box fixture: the first draft/add loses its response, later calls succeed. */
function installWechatFixture(options: {
  drafts?: DraftFixture[];
  totalCount?: number;
  failDraftAdd?: number;
  batchError?: number;
}) {
  const originalFetch = globalThis.fetch;
  const state = {
    draftCalls: 0,
    batchCalls: 0,
    drafts: [...(options.drafts ?? [])],
    failDraftAdd: options.failDraftAdd ?? 1,
  };
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input);
    if (url.includes("/cgi-bin/token")) return Response.json({ access_token: "synthetic-token", expires_in: 7200 });
    if (url.includes("/material/add_material")) return Response.json({ media_id: "material", url: "https://example.test/image" });
    if (url.includes("/draft/add")) {
      state.draftCalls += 1;
      if (state.draftCalls <= state.failDraftAdd) throw new Error("synthetic lost response after remote acceptance");
      return Response.json({ media_id: `draft-created-${state.draftCalls}` });
    }
    if (url.includes("/draft/batchget")) {
      state.batchCalls += 1;
      if (options.batchError) return Response.json({ errcode: options.batchError, errmsg: "synthetic refusal" });
      const body = JSON.parse(init.body);
      const total = options.totalCount ?? state.drafts.length;
      const page = state.drafts.slice(body.offset, body.offset + body.count);
      return Response.json({
        total_count: total,
        item_count: page.length,
        item: page.map((draft) => ({
          media_id: draft.mediaId,
          update_time: draft.updateTime ?? 1_700_000_000,
          content: { news_item: [{ title: draft.title }] },
        })),
      });
    }
    throw new Error(`unexpected synthetic URL ${url}`);
  }) as typeof fetch;
  return { state, restore: () => { globalThis.fetch = originalFetch; } };
}

async function createPendingClaim(dir: string) {
  const app = buildApp(config(dir));
  await app.ready();
  const first = await app.inject({ method: "POST", url: "/v1/publish", headers, payload });
  assert.equal(first.statusCode, 409);
  assert.equal(first.json().code, "DRAFT_OUTCOME_UNKNOWN");
  return app;
}

test("an operator resolves an unknown claim to a draft read back from WeChat", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-claim-resolve-"));
  const fixture = installWechatFixture({ drafts: [{ mediaId: "draft-observed", title: "Claim recovery sample" }] });
  let app = buildApp(config(dir));
  try {
    await app.ready();
    const first = await app.inject({ method: "POST", url: "/v1/publish", headers, payload });
    assert.equal(first.json().code, "DRAFT_OUTCOME_UNKNOWN");
    assert.equal(fixture.state.draftCalls, 1);

    const listed = await app.inject({ method: "GET", url: "/v1/admin/claims", headers });
    assert.equal(listed.statusCode, 200);
    const claim = listed.json().claims[0];
    assert.equal(claim.key, "synthetic-claim");
    assert.equal(claim.state, "pending");
    assert.equal(claim.account, "synthetic");
    assert.equal(claim.title, "Claim recovery sample");
    assert.equal(claim.ownerContact, "operator");
    assert.equal(listed.json().pending, 1);

    const candidates = await app.inject({ method: "GET", url: "/v1/admin/claims/synthetic-claim/candidates", headers });
    assert.equal(candidates.statusCode, 200);
    assert.equal(candidates.json().sameTitleCount, 1);
    assert.equal(candidates.json().candidates[0].mediaId, "draft-observed");
    assert.equal(candidates.json().complete, true);

    const resolved = await app.inject({
      method: "POST",
      url: "/v1/admin/claims/synthetic-claim/reconcile",
      headers,
      payload: { outcome: "delivered", mediaId: "draft-observed", note: "draft box shows the article" },
    });
    assert.equal(resolved.statusCode, 200);
    assert.deepEqual(resolved.json().claim, { key: "synthetic-claim", state: "confirmed", mediaId: "draft-observed" });

    const result = await app.inject({ method: "GET", url: "/v1/publish-result/synthetic-claim", headers });
    assert.equal(result.json().status, "confirmed");
    assert.equal(result.json().mediaId, "draft-observed");

    const retry = await app.inject({ method: "POST", url: "/v1/publish", headers, payload });
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().deduped, true);
    assert.equal(retry.json().mediaId, "draft-observed");
    assert.equal(fixture.state.draftCalls, 1, "a resolved claim must never resend the draft");

    const after = await app.inject({ method: "GET", url: "/v1/admin/claims", headers });
    assert.equal(after.json().pending, 0);

    const auditLines = fs.readFileSync(path.join(dir, "history.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    const recorded = auditLines.find((entry) => entry.event === "claim-reconciled");
    assert.ok(recorded);
    assert.equal(recorded.outcome, "delivered");
    assert.equal(recorded.mediaId, "draft-observed");
    assert.equal(recorded.note, "draft box shows the article");
  } finally {
    fixture.restore();
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("absence is refused while a same-title draft is visible, then releases the identity", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-claim-absent-"));
  const fixture = installWechatFixture({
    drafts: [{ mediaId: "draft-present", title: "Claim recovery sample" }],
    failDraftAdd: 1,
  });
  let app = buildApp(config(dir));
  try {
    await app.ready();
    const first = await app.inject({ method: "POST", url: "/v1/publish", headers, payload });
    assert.equal(first.json().code, "DRAFT_OUTCOME_UNKNOWN");

    const refused = await app.inject({
      method: "POST",
      url: "/v1/admin/claims/synthetic-claim/reconcile",
      headers,
      payload: { outcome: "absent", note: "checked the draft box" },
    });
    assert.equal(refused.statusCode, 409);
    assert.equal(refused.json().code, "CLAIM_STILL_PRESENT");
    const still = await app.inject({ method: "GET", url: "/v1/admin/claims", headers });
    assert.equal(still.json().pending, 1, "a refused reconciliation must not release the claim");

    fixture.state.drafts = [];
    const released = await app.inject({
      method: "POST",
      url: "/v1/admin/claims/synthetic-claim/reconcile",
      headers,
      payload: { outcome: "absent", note: "checked the draft box twice" },
    });
    assert.equal(released.statusCode, 200);
    assert.deepEqual(released.json().claim, { key: "synthetic-claim", state: "released" });

    const retry = await app.inject({ method: "POST", url: "/v1/publish", headers, payload });
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().mediaId, "draft-created-2");
    assert.equal(fixture.state.draftCalls, 2, "the released identity may be submitted once more");
  } finally {
    fixture.restore();
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("reconcile rejects unverified evidence and never mutates the claim", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-claim-guards-"));
  const fixture = installWechatFixture({ drafts: [{ mediaId: "draft-real", title: "Other title" }] });
  const app = buildApp(config(dir));
  try {
    await app.ready();
    await app.inject({ method: "POST", url: "/v1/publish", headers, payload });

    const unverified = await app.inject({
      method: "POST",
      url: "/v1/admin/claims/synthetic-claim/reconcile",
      headers,
      payload: { outcome: "delivered", mediaId: "draft-invented", note: "operator believed it landed" },
    });
    assert.equal(unverified.statusCode, 409);
    assert.equal(unverified.json().code, "CLAIM_NOT_VERIFIED");

    const emptyNote = await app.inject({
      method: "POST",
      url: "/v1/admin/claims/synthetic-claim/reconcile",
      headers,
      payload: { outcome: "delivered", mediaId: "draft-real", note: "ok" },
    });
    assert.equal(emptyNote.statusCode, 400);
    assert.equal(emptyNote.json().code, "BAD_REQUEST");

    const badOutcome = await app.inject({
      method: "POST",
      url: "/v1/admin/claims/synthetic-claim/reconcile",
      headers,
      payload: { outcome: "maybe", note: "no evidence at all" },
    });
    assert.equal(badOutcome.statusCode, 400);

    const unknown = await app.inject({
      method: "POST",
      url: "/v1/admin/claims/not-a-claim/reconcile",
      headers,
      payload: { outcome: "absent", note: "no such claim here" },
    });
    assert.equal(unknown.statusCode, 404);

    const user = await app.inject({
      method: "POST",
      url: "/v1/admin/users",
      headers,
      payload: { contact: "synthetic-user@example.test", plan: "free" },
    });
    const userHeaders = { "x-api-key": user.json().apiKey, "content-type": "application/json" };
    const userList = await app.inject({ method: "GET", url: "/v1/admin/claims", headers: userHeaders });
    assert.equal(userList.statusCode, 403);
    const userReconcile = await app.inject({
      method: "POST",
      url: "/v1/admin/claims/synthetic-claim/reconcile",
      headers: userHeaders,
      payload: { outcome: "absent", note: "a user must not release this" },
    });
    assert.equal(userReconcile.statusCode, 403);

    const still = await app.inject({ method: "GET", url: "/v1/admin/claims", headers });
    assert.equal(still.json().pending, 1);
  } finally {
    fixture.restore();
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a partially read draft box cannot prove absence", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-claim-partial-"));
  // 500 drafts exist but the reader can only scan 200 of them.
  const drafts = Array.from({ length: 201 }, (_, index) => ({ mediaId: `draft-${index}`, title: `Unrelated ${index}` }));
  const fixture = installWechatFixture({ drafts, totalCount: 500, failDraftAdd: 1 });
  const app = buildApp(config(dir));
  try {
    await app.ready();
    await app.inject({ method: "POST", url: "/v1/publish", headers, payload });
    const candidates = await app.inject({ method: "GET", url: "/v1/admin/claims/synthetic-claim/candidates", headers });
    assert.equal(candidates.json().complete, false);
    const refused = await app.inject({
      method: "POST",
      url: "/v1/admin/claims/synthetic-claim/reconcile",
      headers,
      payload: { outcome: "absent", note: "scanned the first page only" },
    });
    assert.equal(refused.statusCode, 409);
    assert.equal(refused.json().code, "CLAIM_ABSENCE_UNPROVEN");
    const still = await app.inject({ method: "GET", url: "/v1/admin/claims", headers });
    assert.equal(still.json().pending, 1);
  } finally {
    fixture.restore();
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a WeChat draft-box failure leaves the claim blocked", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-claim-wechat-down-"));
  const fixture = installWechatFixture({ drafts: [], batchError: 40001 });
  const app = buildApp(config(dir));
  try {
    await app.ready();
    await app.inject({ method: "POST", url: "/v1/publish", headers, payload });
    const inspected = await app.inject({ method: "GET", url: "/v1/admin/claims/synthetic-claim/candidates", headers });
    assert.equal(inspected.statusCode, 502);
    assert.equal(inspected.json().code, "WECHAT_40001");
    const reconcile = await app.inject({
      method: "POST",
      url: "/v1/admin/claims/synthetic-claim/reconcile",
      headers,
      payload: { outcome: "absent", note: "tried to check the draft box" },
    });
    assert.equal(reconcile.statusCode, 502);
    const still = await app.inject({ method: "GET", url: "/v1/admin/claims", headers });
    assert.equal(still.json().pending, 1);
  } finally {
    fixture.restore();
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an older database gains claim context columns without releasing pending claims", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-claim-migration-"));
  try {
    const legacy = new DatabaseSync(path.join(dir, "users.db"));
    legacy.exec(`
      CREATE TABLE immediate_publish_claims (
        request_key TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending', 'confirmed')),
        media_id TEXT,
        completed_at INTEGER
      );
      INSERT INTO immediate_publish_claims(request_key, owner, fingerprint, state)
        VALUES ('legacy-claim', 'admin', 'legacy-fingerprint', 'pending');
    `);
    legacy.close();

    const store = new Store(dir);
    try {
      const row = store.getImmediateClaim("legacy-claim");
      assert.ok(row);
      assert.equal(row.state, "pending");
      assert.equal(row.account, null, "a legacy claim must not invent context");
      assert.equal(row.createdAt, null);
      const pending = store.listImmediateClaims("pending", 10);
      assert.equal(pending.length, 1);
      assert.equal(pending[0].key, "legacy-claim");

      assert.equal(store.claimImmediate("fresh-claim", "admin", "fingerprint", 1000, 600000, { account: "synthetic", title: "Fresh" }), "claimed");
      assert.deepEqual(
        { account: store.getImmediateClaim("fresh-claim")?.account, title: store.getImmediateClaim("fresh-claim")?.title },
        { account: "synthetic", title: "Fresh" },
      );
      assert.equal(store.releaseImmediateClaimByOperator("legacy-claim"), true);
      assert.equal(store.releaseImmediateClaimByOperator("legacy-claim"), false, "released claims cannot be released twice");
    } finally {
      store.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
