// Tests: lost-key account status endpoint — masked tail only, rate limited.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp, type ServerConfig } from "./index.js";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-status-test-"));

const config: ServerConfig = {
  port: 0,
  apiKey: "admin-key",
  dataDir,
  accounts: [{ name: "Acct", appId: "wx_a", appSecret: "s" }],
};

const app = buildApp(config);
const H = (key: string) => ({ "x-api-key": key, "content-type": "application/json" });

before(async () => {
  await app.ready();
  await app.inject({
    method: "POST",
    url: "/v1/admin/users",
    headers: H("admin-key"),
    payload: { contact: "owner@example.com", plan: "free", months: 1 },
  });
});

after(async () => {
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("status by contact returns masked tail, never the full key", async () => {
  const res = await app.inject({ method: "GET", url: "/v1/account-status?contact=owner@example.com" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.exists, true);
  assert.equal(body.keyTail.length, 4);
  assert.ok(!("apiKey" in body));
  assert.ok(!JSON.stringify(body).includes("api_key"));
});

test("unknown contact reports exists:false without account details", async () => {
  const res = await app.inject({ method: "GET", url: "/v1/account-status?contact=nobody@example.com" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { exists: false });
});

test("bad contact shape is rejected", async () => {
  const res = await app.inject({ method: "GET", url: "/v1/account-status?contact=x" });
  assert.equal(res.statusCode, 400);
});

test("lookup is rate limited per ip after repeated calls", async () => {
  let last = 0;
  for (let i = 0; i < 12; i++) {
    const res = await app.inject({ method: "GET", url: "/v1/account-status?contact=owner@example.com" });
    last = res.statusCode;
  }
  assert.equal(last, 429);
});
