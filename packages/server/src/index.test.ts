// Tests: server protocol via fastify inject (no sockets, no real WeChat calls).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp, type ServerConfig } from "./index.js";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-server-test-"));

const config: ServerConfig = {
  port: 0,
  apiKey: "test-key",
  dataDir,
  accounts: [{ name: "TestAcct", appId: "wx_dummy", appSecret: "dummy" }],
};

const app = buildApp(config);

before(async () => {
  await app.ready();
});

after(async () => {
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("hosted checkout endpoints are closed without an explicit legacy test opt-in", async () => {
  const homepage = await app.inject({ method: "GET", url: "/" });
  assert.equal(homepage.statusCode, 200);
  assert.match(homepage.body, /Public hosted subscriptions are not open/);
  assert.doesNotMatch(homepage.body, /<form/i);
  const requests = [
    { method: "POST" as const, url: "/purchase", payload: { contact: "any@example.test", plan: "personal", months: 1 } },
    { method: "GET" as const, url: "/order/synthetic" },
    { method: "GET" as const, url: "/lookup?contact=any%40example.test" },
    { method: "POST" as const, url: "/pay/xunhupay/notify", payload: { status: "OD", trade_order_id: "synthetic" } },
  ];
  for (const request of requests) {
    const res = await app.inject(request);
    assert.equal(res.statusCode, 503, request.url);
    assert.equal(res.json().code, "CHECKOUT_NOT_AVAILABLE", request.url);
  }
  const overview = await app.inject({ method: "GET", url: "/v1/admin/overview", headers: { "x-api-key": "test-key" } });
  assert.equal(overview.json().orders.pending, 0);
});
test("legacy online checkout cannot be re-enabled without Commerce", () => {
  const isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-legacy-closed-"));
  try {
    assert.throws(
      () => buildApp({ ...config, dataDir: isolatedDir, payments: { enableLegacyCheckout: true, provider: "alipay" } }),
      /Commerce\/Permit/,
    );
  } finally {
    fs.rmSync(isolatedDir, { recursive: true, force: true });
  }
});
test("health is reachable without auth", async () => {
  const res = await app.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().service, "publy-server");
});

test("auth rejects wrong key and accepts the right one", async () => {
  const bad = await app.inject({ method: "GET", url: "/verify", headers: { "x-api-key": "wrong" } });
  assert.equal(bad.statusCode, 401);
  const good = await app.inject({ method: "GET", url: "/verify", headers: { "x-api-key": "test-key" } });
  assert.equal(good.statusCode, 200);
  assert.deepEqual(good.json().accounts, ["TestAcct"]);
});

test("admin overview aggregates users, orders and accounts", async () => {
  const deny = await app.inject({ method: "GET", url: "/v1/admin/overview" });
  assert.equal(deny.statusCode, 401);
  const res = await app.inject({ method: "GET", url: "/v1/admin/overview", headers: { "x-api-key": "test-key" } });
  assert.equal(res.statusCode, 200);
  const d = res.json();
  assert.equal(d.users.total, 0);
  assert.equal(d.users.pro, 0);
  assert.equal(d.publishes.monthTotal, 0);
  assert.equal(d.orders.pending, 0);
  assert.equal(d.orders.revenueFen, 0);
  assert.ok(d.accounts.total >= 1); // server.json declares TestAcct
  assert.equal(d.eventsToday, 0);
});

test("admin accounts lists config and db accounts with owner resolved", async () => {
  const deny = await app.inject({ method: "GET", url: "/v1/admin/accounts" });
  assert.equal(deny.statusCode, 401);
  // a user binds their own account via the admin endpoint
  await app.inject({
    method: "POST", url: "/v1/admin/users",
    headers: { "x-api-key": "test-key", "content-type": "application/json" },
    payload: { contact: "owner@example.com", plan: "personal", months: 1 },
  });
  await app.inject({
    method: "POST", url: "/v1/admin/accounts",
    headers: { "x-api-key": "test-key", "content-type": "application/json" },
    payload: { name: "owned-acct", appId: "wx_owned", appSecret: "s", ownerContact: "owner@example.com" },
  });
  const res = await app.inject({ method: "GET", url: "/v1/admin/accounts", headers: { "x-api-key": "test-key" } });
  assert.equal(res.statusCode, 200);
  const d = res.json();
  const owned = d.accounts.find((a: { name: string }) => a.name === "owned-acct");
  assert.ok(owned);
  assert.equal(owned.owner, "owner@example.com");
  assert.equal(owned.source, "db");
  assert.ok(!JSON.stringify(d).includes("secret"), "appSecret must never be listed");
});

test("admin page shell is served publicly", async () => {
  const res = await app.inject({ method: "GET", url: "/admin" });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes("Publy"));
});

test("publish validates required fields", async () => {
  const headers = { "x-api-key": "test-key", "content-type": "application/json" };
  const noAccount = await app.inject({ method: "POST", url: "/v1/publish", headers, payload: { type: "article", title: "t" } });
  assert.equal(noAccount.statusCode, 400);
  const noTitle = await app.inject({ method: "POST", url: "/v1/publish", headers, payload: { account: "TestAcct", type: "article" } });
  assert.equal(noTitle.statusCode, 400);
  const badType = await app.inject({ method: "POST", url: "/v1/publish", headers, payload: { account: "TestAcct", type: "weird", title: "t" } });
  assert.equal(badType.statusCode, 400);
});

test("publish with unknown account returns ACCOUNT_NOT_FOUND", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/v1/publish",
    headers: { "x-api-key": "test-key", "content-type": "application/json" },
    payload: { account: "Nope", type: "article", title: "t" },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, "ACCOUNT_NOT_FOUND");
});

test("scheduled publish stores a job and can be cancelled", async () => {
  const runAt = new Date(Date.now() + 3600_000).toISOString();
  const created = await app.inject({
    method: "POST",
    url: "/v1/publish",
    headers: { "x-api-key": "test-key", "content-type": "application/json" },
    payload: { account: "TestAcct", type: "article", title: "scheduled", publishAt: runAt, images: [{ name: "a.png", data: "aGk=" }] },
  });
  assert.equal(created.statusCode, 200);
  const { jobId, scheduled } = created.json();
  assert.ok(scheduled);
  assert.ok(jobId);

  const list = await app.inject({ method: "GET", url: "/v1/jobs", headers: { "x-api-key": "test-key" } });
  assert.equal(list.statusCode, 200);
  assert.ok(list.json().jobs.some((j: { id: string }) => j.id === jobId));

  const cancel = await app.inject({ method: "DELETE", url: `/v1/jobs/${jobId}`, headers: { "x-api-key": "test-key" } });
  assert.equal(cancel.statusCode, 200);
  assert.equal(cancel.json().ok, true);
});

test("schedule rejects past dates", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/v1/publish",
    headers: { "x-api-key": "test-key", "content-type": "application/json" },
    payload: { account: "TestAcct", type: "article", title: "t", publishAt: "2000-01-01T00:00:00Z" },
  });
  assert.equal(res.statusCode, 400);
});

test("history returns an array", async () => {
  const res = await app.inject({ method: "GET", url: "/v1/history?limit=5", headers: { "x-api-key": "test-key" } });
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.json().history));
});

// Draft box management (list + delete): WeChat endpoints are stubbed at the
// fetch boundary, exactly like the core-level tests, so the routes are
// exercised against synthetic WeChat verdicts without network access.
type FetchCall = { url: string; body: any };

function stubWechatFetch(responses: Record<string, unknown>, calls: FetchCall[]): void {
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input);
    let body: any = null;
    try { body = init?.body ? JSON.parse(init.body) : null; } catch { body = null; }
    calls.push({ url, body });
    for (const [pattern, payload] of Object.entries(responses)) {
      if (url.includes(pattern)) return Response.json(payload);
    }
    return Response.json({ errcode: 99999, errmsg: "unexpected endpoint in test" });
  }) as typeof fetch;
}

test("draft listing requires an account parameter", async () => {
  const res = await app.inject({ method: "GET", url: "/v1/drafts", headers: { "x-api-key": "test-key" } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, "BAD_REQUEST");
});

test("draft listing rejects an unknown account", async () => {
  const res = await app.inject({ method: "GET", url: "/v1/drafts?account=Missing", headers: { "x-api-key": "test-key" } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, "ACCOUNT_NOT_FOUND");
});

test("draft listing returns live WeChat box contents for an owned account", async () => {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];
  stubWechatFetch({
    "cgi-bin/token": { access_token: "synthetic-token", expires_in: 7200 },
    "cgi-bin/draft/batchget": {
      total_count: 2,
      item_count: 2,
      item: [
        { media_id: "draft-a", content: { news_item: [{ title: "嵌入式 C 设计模式 1" }] }, update_time: 1700000000 },
        { media_id: "draft-b", content: { news_item: [{ title: "嵌入式 C 设计模式 2" }] }, update_time: 1700000100 },
      ],
    },
  }, calls);
  try {
    const res = await app.inject({ method: "GET", url: "/v1/drafts?account=TestAcct&limit=100", headers: { "x-api-key": "test-key" } });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.account, "TestAcct");
    assert.equal(body.totalCount, 2);
    assert.equal(body.complete, true);
    assert.deepEqual(body.items, [
      { mediaId: "draft-a", title: "嵌入式 C 设计模式 1", updateTime: 1700000000 },
      { mediaId: "draft-b", title: "嵌入式 C 设计模式 2", updateTime: 1700000100 },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("draft listing fails closed with the WeChat error code", async () => {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];
  stubWechatFetch({
    "cgi-bin/token": { access_token: "synthetic-token", expires_in: 7200 },
    "cgi-bin/draft/batchget": { errcode: 40001, errmsg: "invalid credential" },
  }, calls);
  try {
    const res = await app.inject({ method: "GET", url: "/v1/drafts?account=TestAcct", headers: { "x-api-key": "test-key" } });
    assert.equal(res.statusCode, 502);
    assert.equal(res.json().code, "WECHAT_40001");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("draft deletion relays the media_id and leaves an audit trail", async () => {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];
  stubWechatFetch({
    "cgi-bin/token": { access_token: "synthetic-token", expires_in: 7200 },
    "cgi-bin/draft/delete": { errcode: 0, errmsg: "ok" },
  }, calls);
  try {
    const res = await app.inject({ method: "DELETE", url: "/v1/drafts/draft-old?account=TestAcct", headers: { "x-api-key": "test-key" } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { deleted: true, account: "TestAcct", mediaId: "draft-old" });
    const deleteCall = calls.find((c) => c.url.includes("draft/delete"));
    assert.ok(deleteCall, "a draft/delete request must have been sent");
    assert.deepEqual(deleteCall.body, { media_id: "draft-old" });
    const history = await app.inject({ method: "GET", url: "/v1/history?limit=10", headers: { "x-api-key": "test-key" } });
    assert.ok(
      history.json().history.some((e: { event: string; mediaId?: string }) => e.event === "draft-deleted" && e.mediaId === "draft-old"),
      "the deletion must be auditable in /v1/history",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("draft deletion surfaces WeChat rejection codes", async () => {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];
  stubWechatFetch({
    "cgi-bin/token": { access_token: "synthetic-token", expires_in: 7200 },
    "cgi-bin/draft/delete": { errcode: 40007, errmsg: "invalid media_id" },
  }, calls);
  try {
    const res = await app.inject({ method: "DELETE", url: "/v1/drafts/gone?account=TestAcct", headers: { "x-api-key": "test-key" } });
    assert.equal(res.statusCode, 502);
    assert.equal(res.json().code, "WECHAT_40007");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
