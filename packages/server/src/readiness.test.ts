// Tests: #7/#8 readiness slice — idempotency records with named identity,
// publish-result queries, idempotent job admission, crash reconciliation and
// explicit retry, credential rotation, WS tickets, secret redaction, quota
// exhaustion. All via fastify inject; no real WeChat calls.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp, loadServerConfig, signWsTicket, verifyWsTicket, redactSecrets, type ServerConfig } from "./index.js";
import { draftIdempotencyKey } from "@publy/core";
import { Store } from "./store.js";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-ready-test-"));

const config: ServerConfig = {
  port: 0,
  apiKey: "admin-key",
  dataDir,
  secretKey: crypto.randomBytes(32).toString("hex"),
  // This suite includes a historical purchase-pricing contract, not live sales.
  payments: { enableLegacyCheckout: true, provider: "manual" },
  jobPollMs: 40,
  accounts: [{ name: "TestAcct", appId: "wx_dummy", appSecret: "dummy" }],
};

const app = buildApp(config);
const H = (key: string) => ({ "x-api-key": key, "content-type": "application/json" });
/** headers for payload-less POSTs (json content-type + empty body is a 400) */
const HP = (key: string) => ({ "x-api-key": key });

let userKey = "";
let userId = "";

before(async () => {
  await app.ready();
  const created = await app.inject({
    method: "POST",
    url: "/v1/admin/users",
    headers: H("admin-key"),
    payload: { contact: "ready@test", plan: "personal", months: 1 },
  });
  userKey = created.json().apiKey;
  await app.inject({
    method: "POST",
    url: "/v1/admin/accounts",
    headers: H("admin-key"),
    payload: { name: "UserAcct", appId: "wx_user", appSecret: "s2", ownerContact: "ready@test" },
  });
  const users = (await app.inject({ method: "GET", url: "/v1/admin/users", headers: H("admin-key") })).json().users;
  userId = users.find((u: { contact: string }) => u.contact === "ready@test").id;
});

after(async () => {
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("server configuration binds loopback by default and requires a valid explicit host", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-server-host-"));
  const file = path.join(dir, "server.json");
  const value = { apiKey: "synthetic", accounts: [{ name: "test", appId: "wx", appSecret: "synthetic" }] };
  try {
    fs.writeFileSync(file, JSON.stringify(value));
    assert.equal(loadServerConfig(file).host, "127.0.0.1");
    fs.writeFileSync(file, JSON.stringify({ ...value, host: "0.0.0.0" }));
    assert.equal(loadServerConfig(file).host, "0.0.0.0");
    for (const host of ["", " ", null, 123]) {
      fs.writeFileSync(file, JSON.stringify({ ...value, host }));
      assert.throws(() => loadServerConfig(file), /host must be a non-empty string/);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// --- redaction ----------------------------------------------------------------

test("redactSecrets scrubs token/secret/key query values", () => {
  const tokenUrl = "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=wx123&secret=supersecret";
  assert.ok(!redactSecrets(tokenUrl).includes("supersecret"));
  assert.ok(redactSecrets(tokenUrl).includes("secret=[redacted]"));
  const pub = "https://api.weixin.qq.com/cgi-bin/draft/add?access_token=ABCDEF";
  assert.ok(!redactSecrets(pub).includes("ABCDEF"));
  assert.ok(redactSecrets("https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=wx123").includes("appid=wx123"));
  assert.equal(redactSecrets("no urls here"), "no urls here");
});

test("audit log never stores credential-looking query values", async () => {
  const history = fs.readFileSync(path.join(dataDir, "history.jsonl"), "utf-8");
  assert.ok(!/secret=[A-Za-z0-9]{6,}/.test(history));
});

// --- WS tickets -----------------------------------------------------------------

test("ws ticket round trip verifies and expires", () => {
  const key = config.secretKey!;
  const { ticket } = signWsTicket(key, "admin");
  assert.equal(verifyWsTicket(key, ticket), "admin");
  assert.equal(verifyWsTicket(key, "ws1.abc.admin.deadbeef"), null, "tampered mac rejected");
  assert.equal(verifyWsTicket("another-key", ticket), null, "wrong key rejected");
  const expired = signWsTicket(key, "admin", Date.now() - 121_000);
  assert.equal(verifyWsTicket(key, expired.ticket), null, "expired ticket rejected");
  assert.equal(verifyWsTicket(key, "legacy-plain-key"), null, "non-ticket values rejected");
});

test("POST /v1/ws-ticket issues a ticket bound to the caller", async () => {
  const admin = await app.inject({ method: "POST", url: "/v1/ws-ticket", headers: HP("admin-key") });
  assert.equal(admin.statusCode, 200);
  assert.equal(verifyWsTicket(config.secretKey!, admin.json().ticket), "admin");

  const user = await app.inject({ method: "POST", url: "/v1/ws-ticket", headers: HP(userKey) });
  assert.equal(user.statusCode, 200);
  assert.equal(verifyWsTicket(config.secretKey!, user.json().ticket), `user:${userId}`);

  const denied = await app.inject({ method: "POST", url: "/v1/ws-ticket" });
  assert.equal(denied.statusCode, 401);
});

// --- fail-closed recovery when disk state is damaged --------------------------

test("corrupt persisted recovery state blocks startup without discarding evidence", () => {
  for (const [filename, expected] of [
    ["jobs.json", "PUBLY_JOBS_STATE_INVALID"],
    ["idempotency.json", "PUBLY_IDEMPOTENCY_STATE_INVALID"],
  ]) {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-state-corrupt-"));
    // A simulated interrupted write may include private draft metadata.
    const corrupt = '{"privateDraftToken":"never-echo-this-marker",';
    try {
      const stateFile = path.join(testDir, filename);
      fs.writeFileSync(stateFile, corrupt);
      assert.throws(
        () => buildApp({ ...config, dataDir: testDir }),
        (err: unknown) => err instanceof Error &&
          err.message === expected &&
          !err.message.includes("never-echo-this-marker"),
        `${filename}: corrupt state must never be treated as an empty store`,
      );
      assert.equal(fs.readFileSync(stateFile, "utf8"), corrupt,
        "failed startup must preserve original file for manual recovery");
      assert.equal(fs.existsSync(path.join(testDir, "users.db")), false,
        "state validation should run before opening the SQLite store");
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
});

test("non-object persisted state also blocks startup", () => {
  for (const filename of ["jobs.json", "idempotency.json"]) {
    for (const value of ["null", "[]", "false"]) {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-state-shape-"));
      try {
        fs.writeFileSync(path.join(testDir, filename), value);
        assert.throws(() => buildApp({ ...config, dataDir: testDir }), /PUBLY_(JOBS|IDEMPOTENCY)_STATE_INVALID/);
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    }
  }
});

test("syntactically valid but damaged recovery entries also fail closed", () => {
  const goodJob = {
    id: "recover-1", runAt: Date.now() + 60_000,
    body: { account: "TestAcct", type: "article", title: "recovery fixture" },
    userId: null, status: "pending", attempts: 0, nextAttemptAt: Date.now() + 60_000,
  };
  const goodRecord = {
    mediaId: "ALREADY_DELIVERED", at: Date.now(),
    account: "TestAcct", title: "recovery fixture", type: "article", userId: null,
  };
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ["jobs.json", { "recover-1": null }, "PUBLY_JOBS_STATE_INVALID"],
    ["jobs.json", { "recover-1": { ...goodJob, body: null } }, "PUBLY_JOBS_STATE_INVALID"],
    ["jobs.json", { "recover-1": { ...goodJob, id: "different-id" } }, "PUBLY_JOBS_STATE_INVALID"],
    ["jobs.json", { "recover-1": { ...goodJob, attempts: "0" } }, "PUBLY_JOBS_STATE_INVALID"],
    ["idempotency.json", { "retry-key": null }, "PUBLY_IDEMPOTENCY_STATE_INVALID"],
    ["idempotency.json", { "retry-key": { ...goodRecord, mediaId: "" } }, "PUBLY_IDEMPOTENCY_STATE_INVALID"],
    ["idempotency.json", { "retry-key": { ...goodRecord, at: "not-a-time" } }, "PUBLY_IDEMPOTENCY_STATE_INVALID"],
  ];
  for (const [filename, payload, expected] of cases) {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-state-entry-"));
    try {
      const file = path.join(testDir, filename);
      const contents = JSON.stringify(payload);
      fs.writeFileSync(file, contents);
      assert.throws(() => buildApp({ ...config, dataDir: testDir }),
        (err: unknown) => err instanceof Error && err.message === expected);
      assert.equal(fs.readFileSync(file, "utf8"), contents);
      assert.equal(fs.existsSync(path.join(testDir, "users.db")), false);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
});

// --- prototype-key recovery state isolation ---------------------------------

test("job routes reject inherited Object keys instead of treating them as jobs", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-proto-jobs-"));
  const local = buildApp({ ...config, dataDir: dir, jobPollMs: 60_000 });
  try {
    await local.ready();
    for (const id of ["constructor", "toString", "__proto__"]) {
      const url = "/v1/jobs/" + encodeURIComponent(id);
      const get = await local.inject({ method: "GET", url, headers: H("admin-key") });
      assert.equal(get.statusCode, 404, `GET ${id} should not access an inherited object member`);
      assert.equal(get.json().code, "NOT_FOUND");
      const del = await local.inject({ method: "DELETE", url, headers: HP("admin-key") });
      assert.equal(del.statusCode, 404);
      assert.equal(del.json().code, "NOT_FOUND");
      const retry = await local.inject({ method: "POST", url: url + "/retry", headers: HP("admin-key") });
      assert.equal(retry.statusCode, 404);
      assert.equal(retry.json().code, "NOT_FOUND");
    }
  } finally {
    await local.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("prototype-like request IDs persist and reload only as own draft records", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-proto-idem-"));
  const key = "__proto__";
  const record = {
    mediaId: "LOCAL-RECORD-ONLY", at: Date.now(), account: "TestAcct",
    title: "safe fixture", type: "article", userId: null,
  };
  let local = buildApp({ ...config, dataDir: dir, jobPollMs: 60_000 });
  try {
    await local.ready();
    const seam = (local as unknown as {
      idempotency: { records: Record<string, unknown>; save: () => void };
    }).idempotency;
    assert.equal(Object.getPrototypeOf(seam.records), null,
      "a client-controlled key must not reach Object.prototype");
    seam.records[key] = record;
    seam.save();
    assert.deepEqual(Object.keys(seam.records), [key]);
    assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, "mediaId"), false);

    const response = await local.inject({
      method: "GET", url: "/v1/publish-result/" + encodeURIComponent(key),
      headers: H("admin-key"),
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "confirmed");
    assert.equal(response.json().mediaId, record.mediaId);
    const persisted = JSON.parse(fs.readFileSync(path.join(dir, "idempotency.json"), "utf8"));
    assert.equal(Object.hasOwn(persisted, key), true);
    assert.equal(persisted[key].mediaId, record.mediaId);
    await local.close();

    local = buildApp({ ...config, dataDir: dir, jobPollMs: 60_000 });
    await local.ready();
    const recovered = await local.inject({
      method: "GET", url: "/v1/publish-result/" + encodeURIComponent(key),
      headers: H("admin-key"),
    });
    assert.equal(recovered.statusCode, 200);
    assert.equal(recovered.json().status, "confirmed");
    assert.equal(recovered.json().mediaId, record.mediaId);
  } finally {
    await local.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- publish-result query (the lost-response reconciliation path) ----------------

test("publish-result returns confirmed for a fresh record, unknown otherwise", async () => {
  const seam = (app as unknown as { idempotency: { records: Record<string, unknown>; save: () => void } }).idempotency;
  seam.records["key-mine"] = { mediaId: "MEDIA1", at: Date.now(), account: "UserAcct", title: "my note", type: "article", userId };
  seam.records["key-admin"] = { mediaId: "MEDIA2", at: Date.now(), account: "TestAcct", title: "admin note", type: "article", userId: null };
  seam.save();

  const mine = await app.inject({ method: "GET", url: "/v1/publish-result/key-mine", headers: H(userKey) });
  assert.equal(mine.json().status, "confirmed");
  assert.equal(mine.json().mediaId, "MEDIA1");
  assert.equal(mine.json().account, "UserAcct");
  assert.equal(mine.json().title, "my note");

  // another user's record is invisible — "unknown", not an error
  const foreign = await app.inject({ method: "GET", url: "/v1/publish-result/key-admin", headers: H(userKey) });
  assert.equal(foreign.json().status, "unknown");
  // admin sees it
  const admin = await app.inject({ method: "GET", url: "/v1/publish-result/key-admin", headers: H("admin-key") });
  assert.equal(admin.json().status, "confirmed");

  // unknown keys answer unknown with 200
  const missing = await app.inject({ method: "GET", url: "/v1/publish-result/never-seen", headers: H(userKey) });
  assert.equal(missing.statusCode, 200);
  assert.equal(missing.json().status, "unknown");

  // expired records answer unknown
  seam.records["key-old"] = { mediaId: "MEDIA3", at: Date.now() - 11 * 60 * 1000, account: "UserAcct", title: "t", type: "article", userId };
  seam.save();
  const old = await app.inject({ method: "GET", url: "/v1/publish-result/key-old", headers: H(userKey) });
  assert.equal(old.json().status, "unknown");
});

// --- idempotent job admission -----------------------------------------------------

test("scheduling twice with the same idempotency key enqueues one job", async () => {
  const runAt = new Date(Date.now() + 3600_000).toISOString();
  const payload = { account: "TestAcct", type: "article", title: "sched", html: "<p>x</p>", publishAt: runAt, idempotencyKey: "job-key-1" };
  const first = await app.inject({ method: "POST", url: "/v1/publish", headers: H("admin-key"), payload });
  assert.equal(first.json().scheduled, true);
  const second = await app.inject({ method: "POST", url: "/v1/publish", headers: H("admin-key"), payload });
  assert.equal(second.json().scheduled, true);
  assert.equal(second.json().deduped, true);
  assert.equal(second.json().jobId, first.json().jobId);

  const list = await app.inject({ method: "GET", url: "/v1/jobs", headers: H("admin-key") });
  const same = list.json().jobs.filter((j: { title: string }) => j.title === "sched");
  assert.equal(same.length, 1);
});

test("a reused key cannot silently return a different saved draft", async () => {
  const seam = (app as unknown as {
    idempotency: { records: Record<string, unknown>; save: () => void };
  }).idempotency;
  const key = "collision-guard-test";
  const original = {
    account: "UserAcct", type: "article" as const, title: "Fixed title",
    html: "<p>alpha</p>",
    images: [{ name: "unchanged.png", contentType: "image/png", data: Buffer.from("IMG-A").toString("base64") }],
  };
  seam.records[key] = {
    mediaId: "ORIGINAL-DRAFT", at: Date.now(), account: original.account,
    title: original.title, type: original.type, userId,
    requestFingerprint: draftIdempotencyKey(original),
  };
  seam.save();
  const post = (payload: Record<string, unknown>, caller = userKey) =>
    app.inject({ method: "POST", url: "/v1/publish", headers: H(caller), payload: { ...payload, idempotencyKey: key } });

  const retry = await post(original);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.json().deduped, true);
  assert.equal(retry.json().mediaId, "ORIGINAL-DRAFT");

  const changedText = await post({ ...original, html: "<p>omega</p>" });
  assert.equal(original.html.length, "<p>omega</p>".length);
  assert.equal(changedText.statusCode, 409);
  assert.equal(changedText.json().code, "IDEMPOTENCY_CONFLICT");
  assert.ok(!JSON.stringify(changedText.json()).includes("ORIGINAL-DRAFT"));

  const changedImage = await post({
    ...original,
    images: [{ ...original.images[0], data: Buffer.from("IMG-B").toString("base64") }],
  });
  assert.equal(changedImage.statusCode, 409);
  assert.equal(changedImage.json().code, "IDEMPOTENCY_CONFLICT");

  const crossCaller = await post(original, "admin-key");
  assert.equal(crossCaller.statusCode, 409, "the admin key cannot hijack another caller's request identity");
  assert.equal(crossCaller.json().code, "IDEMPOTENCY_CONFLICT");
});

test("a reused scheduled request key cannot silently enqueue or dedupe different content", async () => {
  const key = "scheduled-payload-guard";
  const runAt = new Date(Date.now() + 3600_000).toISOString();
  const base = {
    account: "TestAcct", type: "article" as const, title: "Job",
    html: "<p>one</p>", publishAt: runAt, idempotencyKey: key,
  };
  const first = await app.inject({ method: "POST", url: "/v1/publish", headers: H("admin-key"), payload: base });
  assert.equal(first.statusCode, 200);
  const retry = await app.inject({ method: "POST", url: "/v1/publish", headers: H("admin-key"), payload: base });
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.json().deduped, true);
  assert.equal(retry.json().jobId, first.json().jobId);

  const changed = await app.inject({
    method: "POST", url: "/v1/publish", headers: H("admin-key"),
    payload: { ...base, html: "<p>two</p>" },
  });
  assert.equal(changed.statusCode, 409);
  assert.equal(changed.json().code, "IDEMPOTENCY_CONFLICT");
  const jobs = (await app.inject({ method: "GET", url: "/v1/jobs", headers: H("admin-key") })).json().jobs;
  assert.equal(jobs.filter((job: { id: string }) => job.id === first.json().jobId).length, 1);
});

// --- ambiguous scheduled delivery must not automatically duplicate drafts ---------

test("lost draft/add response interrupts a scheduled job without auto-resending", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-unknown-draft-"));
  const appId = "wx_synthetic_no_network";
  const jobId = "unknown-draft-1";
  const key = "unknown-draft-request";
  const due = Date.now() - 1000;
  // Keep token retrieval offline. Every network call is intercepted; the only
  // simulated draft/add request loses its response after possible acceptance.
  fs.writeFileSync(path.join(dir, "token.json"), JSON.stringify({
    [appId]: { accessToken: "synthetic-token", expireAt: Date.now() / 1000 + 7200 },
  }));
  fs.writeFileSync(path.join(dir, "jobs.json"), JSON.stringify({
    [jobId]: {
      id: jobId, runAt: due, nextAttemptAt: due, attempts: 0,
      status: "pending", userId: null, idempotencyKey: key,
      body: {
        account: "SyntheticAcct", title: "offline ambiguous draft",
        type: "image_post", idempotencyKey: key,
        images: [{ name: "one.png", data: "AQ==", contentType: "image/png" }],
      },
    },
  }));
  let draftCalls = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/cgi-bin/material/add_material")) {
      return Response.json({ media_id: "SYNTHETIC_IMAGE", url: "https://example.invalid/image" });
    }
    if (url.includes("/cgi-bin/draft/add")) {
      draftCalls++;
      throw new TypeError("simulated lost response after possible remote acceptance");
    }
    throw new Error("Unexpected network request in offline recovery test");
  });
  const isolated = buildApp({
    ...config, dataDir: dir, jobPollMs: 25,
    accounts: [{ name: "SyntheticAcct", appId, appSecret: "synthetic-not-real" }],
  });
  try {
    await isolated.ready();
    let job: { status: string; attempts: number; error?: string } | undefined;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 30));
      const result = await isolated.inject({ method: "GET", url: "/v1/jobs", headers: H("admin-key") });
      job = result.json().jobs.find((j: { id: string }) => j.id === jobId);
      if (job?.status === "interrupted") break;
    }
    assert.equal(job?.status, "interrupted");
    assert.equal(job?.attempts, 1);
    assert.match(job?.error ?? "", /outcome unknown/);
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(draftCalls, 1, "the scheduler must not reissue an ambiguous draft/add");
    const persisted = JSON.parse(fs.readFileSync(path.join(dir, "jobs.json"), "utf8"));
    assert.equal(persisted[jobId].status, "interrupted", "unknown outcome must survive restart");
  } finally {
    await isolated.close();
    t.mock.restoreAll();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- crash reconciliation + explicit retry ----------------------------------------

test("jobs left running by a crash boot as interrupted and never auto-run", async (t) => {
  const reconciliationDir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-recon-test-"));
  t.after(() => fs.rmSync(reconciliationDir, { recursive: true, force: true }));
  const runAt = Date.now() - 1000; // already due — the scheduler must still not run it
  // account "Ghost" resolves to nothing: if the scheduler ever picked the
  // retried job up, it fails offline (ACCOUNT_NOT_FOUND) instead of making a
  // real WeChat call from CI
  const job = {
    id: "recon-1",
    runAt,
    body: { account: "Ghost", type: "article", title: "lost in crash", html: "<p>x</p>" },
    userId: null,
    status: "running",
    attempts: 1,
    nextAttemptAt: runAt,
  };
  fs.writeFileSync(path.join(reconciliationDir, "jobs.json"), JSON.stringify({ "recon-1": job }));

  const app2 = buildApp({ ...config, dataDir: reconciliationDir, jobPollMs: 40 });
  await app2.ready();
  try {
    const list = await app2.inject({ method: "GET", url: "/v1/jobs", headers: H("admin-key") });
    const j = list.json().jobs.find((x: { id: string }) => x.id === "recon-1");
    assert.equal(j.status, "interrupted");
    assert.match(j.error, /outcome unknown/);

    // a due interrupted job is not executed by the scheduler
    await new Promise((r) => setTimeout(r, 150));
    const still = (await app2.inject({ method: "GET", url: "/v1/jobs", headers: H("admin-key") })).json().jobs.find((x: { id: string }) => x.id === "recon-1");
    assert.equal(still.status, "interrupted");

    // A crash could have happened *after* WeChat accepted a draft. Manual
    // retry cannot assume that the remote request did not land.
    const retry = await app2.inject({ method: "POST", url: "/v1/jobs/recon-1/retry", headers: HP("admin-key") });
    assert.equal(retry.statusCode, 409);
    assert.equal(retry.json().code, "DRAFT_OUTCOME_UNKNOWN");
    assert.equal(retry.json().jobId, "recon-1");
    await new Promise((r) => setTimeout(r, 150));
    const blocked = (await app2.inject({ method: "GET", url: "/v1/jobs", headers: H("admin-key") })).json().jobs.find((x: { id: string }) => x.id === "recon-1");
    assert.equal(blocked.status, "interrupted");
    assert.equal(blocked.attempts, 1, "manual retry may not dispatch an unknown-outcome draft");
    assert.equal(JSON.parse(fs.readFileSync(path.join(reconciliationDir, "jobs.json"), "utf8"))["recon-1"].status, "interrupted");
  } finally {
    await app2.close();
  }
});

test("manual retry reconciles a matching delivered draft locally without network or quota", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-manual-reconcile-"));
  const body = { account: "TestAcct", type: "article" as const, title: "already delivered", html: "<p>same bytes</p>" };
  const key = "manual-reconcile-key";
  const record = {
    mediaId: "CONFIRMED-REMOTE-DRAFT", at: Date.now(), account: body.account,
    title: body.title, type: body.type, userId: null, requestFingerprint: draftIdempotencyKey(body),
  };
  const id = "manual-reconcile-1";
  fs.writeFileSync(path.join(dir, "jobs.json"), JSON.stringify({
    [id]: { id, runAt: Date.now() - 1000, body, idempotencyKey: key, userId: null,
      status: "interrupted", attempts: 2, nextAttemptAt: Date.now() - 1000 },
  }));
  fs.writeFileSync(path.join(dir, "idempotency.json"), JSON.stringify({ [key]: record }));
  const local = buildApp({ ...config, dataDir: dir, jobPollMs: 20 });
  try {
    await local.ready();
    const res = await local.inject({ method: "POST", url: `/v1/jobs/${id}/retry`, headers: HP("admin-key") });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().ok, true);
    assert.equal(res.json().deduped, true);
    assert.equal(res.json().job.status, "done");
    assert.equal(res.json().job.mediaId, record.mediaId);
    assert.equal(res.json().job.attempts, 2, "local reconciliation should not count as a new publish attempt");
    const persisted = JSON.parse(fs.readFileSync(path.join(dir, "jobs.json"), "utf8"))[id];
    assert.equal(persisted.status, "done");
    assert.equal(persisted.result.mediaId, record.mediaId);
    const repeated = await local.inject({ method: "POST", url: `/v1/jobs/${id}/retry`, headers: HP("admin-key") });
    assert.equal(repeated.statusCode, 400);
    assert.equal(repeated.json().code, "NOT_RETRYABLE");
  } finally {
    await local.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("manual retry does not resend a mismatched or expired local delivery record", async () => {
  for (const [suffix, record] of [
    ["different-body", { mediaId: "DIFFERENT", at: Date.now(),
      account: "TestAcct", title: "other", type: "article", userId: null }],
    ["expired", { mediaId: "OLD", at: Date.now() - 60 * 60 * 1000,
      account: "TestAcct", title: "original", type: "article", userId: null }],
  ] as const) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-retry-mismatch-"));
    const id = "manual-block-" + suffix;
    const body = { account: "TestAcct", type: "article" as const, title: "original", html: "<p>x</p>" };
    fs.writeFileSync(path.join(dir, "jobs.json"), JSON.stringify({ [id]:
      { id, runAt: Date.now() - 1000, body, idempotencyKey: "shared-key",
        userId: null, status: "interrupted", attempts: 1, nextAttemptAt: Date.now() - 1000 },
    }));
    fs.writeFileSync(path.join(dir, "idempotency.json"), JSON.stringify({ "shared-key": record }));
    const local = buildApp({ ...config, dataDir: dir, jobPollMs: 20 });
    try {
      await local.ready();
      const res = await local.inject({ method: "POST", url: `/v1/jobs/${id}/retry`, headers: HP("admin-key") });
      assert.equal(res.statusCode, 409);
      assert.equal(res.json().code, suffix === "expired" ? "DRAFT_OUTCOME_UNKNOWN" : "IDEMPOTENCY_CONFLICT");
      await new Promise((r) => setTimeout(r, 60));
      const persisted = JSON.parse(fs.readFileSync(path.join(dir, "jobs.json"), "utf8"))[id];
      assert.equal(persisted.status, "interrupted");
      assert.equal(persisted.attempts, 1);
    } finally {
      await local.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("manual retry permits only provenance-verified pre-publish failures", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-failed-retry-"));
  const body = { account: "MissingAcct", type: "article" as const, title: "never submitted", html: "<p>x</p>" };
  const oldId = "legacy-failed", safeId = "local-preflight-failed";
  const job = (id: string, safeToRetry?: boolean) => ({
    id, body, runAt: Date.now() - 1000, userId: null, status: "failed",
    attempts: 3, nextAttemptAt: Date.now() - 1000,
    ...(safeToRetry === undefined ? {} : { safeToRetry }),
  });
  fs.writeFileSync(path.join(dir, "jobs.json"), JSON.stringify({
    [oldId]: job(oldId), [safeId]: job(safeId, true),
  }));
  // Slow poll ensures no retry is ever delivered during this isolated test.
  const local = buildApp({ ...config, dataDir: dir, jobPollMs: 60_000 });
  try {
    await local.ready();
    const unsafe = await local.inject({ method: "POST", url: `/v1/jobs/${oldId}/retry`, headers: HP("admin-key") });
    assert.equal(unsafe.statusCode, 409);
    assert.equal(unsafe.json().code, "DRAFT_OUTCOME_UNKNOWN");
    const permitted = await local.inject({ method: "POST", url: `/v1/jobs/${safeId}/retry`, headers: HP("admin-key") });
    assert.equal(permitted.statusCode, 200);
    assert.equal(permitted.json().job.status, "pending");
    assert.equal(permitted.json().job.attempts, 0);
    const jobs = JSON.parse(fs.readFileSync(path.join(dir, "jobs.json"), "utf8"));
    assert.equal(jobs[oldId].status, "failed", "legacy failed job must not be re-admitted");
    assert.equal(jobs[safeId].status, "pending");
  } finally {
    await local.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("manual reconciliation refuses legacy delivery records without a content fingerprint", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-unverified-identity-"));
  const id = "legacy-identity", key = "legacy-key";
  const body = { account: "TestAcct", type: "article" as const, title: "same title", html: "<p>changed contents</p>" };
  fs.writeFileSync(path.join(dir, "jobs.json"), JSON.stringify({
    [id]: { id, body, runAt: Date.now() - 1000, userId: null,
      status: "interrupted", attempts: 1, nextAttemptAt: Date.now() - 1000,
      idempotencyKey: key },
  }));
  fs.writeFileSync(path.join(dir, "idempotency.json"), JSON.stringify({
    [key]: { mediaId: "OLD-DRAFT", at: Date.now(), account: body.account, title: body.title,
      type: body.type, userId: null }, // no requestFingerprint in legacy data
  }));
  const local = buildApp({ ...config, dataDir: dir, jobPollMs: 20 });
  try {
    await local.ready();
    const res = await local.inject({ method: "POST", url: `/v1/jobs/${id}/retry`, headers: HP("admin-key") });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().code, "IDEMPOTENCY_CONFLICT");
    const persisted = JSON.parse(fs.readFileSync(path.join(dir, "jobs.json"), "utf8"))[id];
    assert.equal(persisted.status, "interrupted");
  } finally {
    await local.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- job runner reconciles against the idempotency record ---------------------------

test("a due job with a fresh idempotency record dedupes instead of re-publishing", async (t) => {
  const runnerDir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-runner-test-"));
  t.after(() => fs.rmSync(runnerDir, { recursive: true, force: true }));
  // simulate: the draft was already delivered (crash lost the status save),
  // but the idempotency record survived — the retry must NOT create a second
  const idem = {
    "job-key-2": { mediaId: "ALREADY_THERE", at: Date.now(), account: "TestAcct", title: "after crash", type: "article", userId: null },
  };
  fs.writeFileSync(path.join(runnerDir, "idempotency.json"), JSON.stringify(idem));
  const job = {
    id: "runner-1",
    runAt: Date.now() - 1000,
    body: { account: "TestAcct", type: "article", title: "after crash", html: "<p>x</p>", idempotencyKey: "job-key-2" },
    userId: null,
    status: "pending",
    attempts: 0,
    nextAttemptAt: Date.now() - 1000,
    idempotencyKey: "job-key-2",
  };
  fs.writeFileSync(path.join(runnerDir, "jobs.json"), JSON.stringify({ "runner-1": job }));

  const app3 = buildApp({ ...config, dataDir: runnerDir, jobPollMs: 40 });
  await app3.ready();
  try {
    let j: { status: string; mediaId?: string } | undefined;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const list = await app3.inject({ method: "GET", url: "/v1/jobs", headers: H("admin-key") });
      j = list.json().jobs.find((x: { id: string }) => x.id === "runner-1");
      if (j?.status === "done") break;
    }
    assert.equal(j?.status, "done");
    assert.equal(j?.mediaId, "ALREADY_THERE", "the recorded mediaId is returned, no second draft");
  } finally {
    await app3.close();
  }
});

// --- credential rotation ------------------------------------------------------------

test("rotate-key invalidates the old key and keeps the user intact", async () => {
  const before = await app.inject({ method: "GET", url: "/v1/quota", headers: H(userKey) });
  assert.equal(before.statusCode, 200);

  const rotated = await app.inject({ method: "POST", url: `/v1/admin/users/${userId}/rotate-key`, headers: HP("admin-key") });
  assert.equal(rotated.json().ok, true);
  const newKey: string = rotated.json().apiKey;
  assert.notEqual(newKey, userKey);

  const oldAfter = await app.inject({ method: "GET", url: "/v1/quota", headers: H(userKey) });
  assert.equal(oldAfter.statusCode, 401, "old key is dead");
  const newAfter = await app.inject({ method: "GET", url: "/v1/quota", headers: H(newKey) });
  assert.equal(newAfter.statusCode, 200);
  assert.equal(newAfter.json().plan, "personal");
  userKey = newKey; // keep later tests working
});

// --- scheduled recovery must not consume a second quota unit ------------------------

test("already-delivered scheduled draft reconciles even after monthly quota is exhausted", async () => {
  // Isolated synthetic user/account and persisted recovery files. The existing
  // code fails QUOTA_EXCEEDED before reading the saved mediaId, so no network
  // request is made even if this regression test fails.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-quota-recover-"));
  const seed = new Store(dir);
  let app4: ReturnType<typeof buildApp> | undefined;
  try {
    const user = seed.createUser("quota-recovery@test.invalid", "free", 0);
    seed.upsertAccount({
      name: "OfflineRecoveredAcct", appId: "wx_offline_only",
      appSecret: "synthetic-never-used", ownerUserId: user.id,
    });
    for (let i = 0; i < 30; i++) seed.incrementUsage(user.id);
    seed.close();

    const key = "already-delivered-quota-job";
    const body = {
      account: "OfflineRecoveredAcct", type: "article" as const,
      title: "Recovered draft", html: "<p>offline-only</p>", idempotencyKey: key,
    };
    fs.writeFileSync(path.join(dir, "idempotency.json"), JSON.stringify({
      [key]: {
        mediaId: "CONFIRMED_BEFORE_QUOTA", at: Date.now(),
        account: body.account, title: body.title, type: body.type, userId: user.id,
        requestFingerprint: draftIdempotencyKey(body),
      },
    }));
    const due = Date.now() - 1000;
    fs.writeFileSync(path.join(dir, "jobs.json"), JSON.stringify({
      "quota-recovery-1": {
        id: "quota-recovery-1", runAt: due, body, userId: user.id,
        status: "pending", attempts: 0, nextAttemptAt: due, idempotencyKey: key,
      },
    }));

    app4 = buildApp({ ...config, dataDir: dir, jobPollMs: 40 });
    await app4.ready();
    let recovered: { status: string; mediaId?: string; attempts: number } | undefined;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const res = await app4.inject({ method: "GET", url: "/v1/jobs", headers: H("admin-key") });
      recovered = res.json().jobs.find((j: { id: string }) => j.id === "quota-recovery-1");
      if (recovered?.status === "done") break;
    }
    assert.equal(recovered?.status, "done", "recovery must not be rejected as a new publish");
    assert.equal(recovered?.mediaId, "CONFIRMED_BEFORE_QUOTA");
    assert.equal(recovered?.attempts, 0, "dedupe must not consume a retry attempt");
    const checkStore = (app4 as unknown as { store: Store }).store;
    assert.equal(checkStore.getUsage(user), 30, "reconciliation never consumes quota again");
  } finally {
    if (app4) await app4.close();
    else {
      // Seeded SQLite is already closed when app startup was attempted.
      try { seed.close(); } catch { /* closed */ }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- quota exhaustion stops admission ------------------------------------------------

test("quota exhaustion returns QUOTA_EXCEEDED before any publish", async () => {
  const store = (app as unknown as { store: Store }).store;
  for (let i = 0; i < 30; i++) store.incrementUsage(userId);
  const res = await app.inject({
    method: "POST",
    url: "/v1/publish",
    headers: H(userKey),
    payload: { account: "UserAcct", type: "article", title: "over quota" },
  });
  assert.equal(res.statusCode, 429);
  assert.equal(res.json().code, "QUOTA_EXCEEDED");
  assert.match(res.json().message, /contact your server operator/i);
  assert.doesNotMatch(res.json().message, /upgrade|purchase/i);
  const q = (await app.inject({ method: "GET", url: "/v1/quota", headers: H(userKey) })).json();
  assert.equal(q.used, 30);
  assert.equal(q.limit, 30);

  // Once the monthly quota is exhausted, a legitimate retry still needs to
  // retrieve the previously confirmed draft. A new draft must stay blocked.
  const seam = (app as unknown as {
    idempotency: { records: Record<string, unknown>; save: () => void };
  }).idempotency;
  const original = { account: "UserAcct", type: "article" as const, title: "paid-for draft", html: "<p>completed</p>" };
  seam.records["quota-confirmed-key"] = {
    mediaId: "ALREADY-DELIVERED", at: Date.now(), account: original.account,
    title: original.title, type: original.type, userId,
    requestFingerprint: draftIdempotencyKey(original),
  };
  seam.save();
  const retry = await app.inject({
    method: "POST", url: "/v1/publish", headers: H(userKey),
    payload: { ...original, idempotencyKey: "quota-confirmed-key" },
  });
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.json().deduped, true);
  assert.equal(retry.json().mediaId, "ALREADY-DELIVERED");

  const conflict = await app.inject({
    method: "POST", url: "/v1/publish", headers: H(userKey),
    payload: { ...original, html: "<p>modified!</p>", idempotencyKey: "quota-confirmed-key" },
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().code, "IDEMPOTENCY_CONFLICT");

  const newDraft = await app.inject({
    method: "POST", url: "/v1/publish", headers: H(userKey),
    payload: { ...original, idempotencyKey: "quota-new-key" },
  });
  assert.equal(newDraft.statusCode, 429);
  assert.equal(newDraft.json().code, "QUOTA_EXCEEDED");
});

// --- new plans / prices ----------------------------------------------------------------

test("purchase accepts personal and studio plans at PRICING 2026-10-v2 targets", async () => {
  const personal = await app.inject({ method: "POST", url: "/purchase", payload: { contact: "p@test", plan: "personal", months: 1 } });
  assert.equal(personal.statusCode, 200);
  const pro = await app.inject({ method: "POST", url: "/purchase", payload: { contact: "p@test", plan: "pro", months: 1 } });
  assert.equal(pro.statusCode, 400);
  const badMonths = await app.inject({ method: "POST", url: "/purchase", payload: { contact: "p@test", plan: "personal", months: 6 } });
  assert.equal(badMonths.statusCode, 400);
});
