// Operator system/metrics endpoints: synthetic history only.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp } from "./index.js";

const adminHeaders = { "x-api-key": "synthetic-admin", "content-type": "application/json" };
const config = (dir: string) => ({
  port: 0,
  apiKey: "synthetic-admin",
  dataDir: dir,
  accounts: [{ name: "synthetic", appId: "wx_synthetic", appSecret: "synthetic" }],
});

test("system endpoint reports real process, storage and queue facts", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-admin-system-"));
  const app = buildApp(config(dir));
  try {
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/admin/system", headers: adminHeaders });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(typeof body.version, "string");
    assert.match(body.node, /^v\d+/);
    assert.ok(body.uptimeSec >= 0);
    assert.equal(body.counts.accounts, 1);
    assert.equal(body.counts.users, 0);
    assert.equal(body.jobs.pending, 0);
    assert.equal(body.dataDir.path, dir);
    assert.ok(body.dataDir.files >= 1, "users.db must be counted");
    assert.ok(body.history.bytes >= 0);
    assert.equal(body.claims.pending, 0);
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("metrics buckets audit events by Shanghai day and clamps the window", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-admin-metrics-"));
  const app = buildApp(config(dir));
  try {
    await app.ready();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
    const lines = [
      { ts: new Date().toISOString(), event: "published", title: "a" },
      { ts: new Date().toISOString(), event: "failed", title: "b" },
      { ts: new Date().toISOString(), event: "scheduled", title: "c" },
      { ts: new Date().toISOString(), event: "outcome-unknown", title: "d" },
      { ts: new Date().toISOString(), event: "deduped", title: "e" },
      { ts: new Date(Date.now() - 40 * 86_400_000).toISOString(), event: "published", title: "old" },
    ];
    fs.writeFileSync(path.join(dir, "history.jsonl"), lines.map((line) => JSON.stringify(line)).join("\n") + "\n");

    const res = await app.inject({ method: "GET", url: "/v1/admin/metrics?days=14", headers: adminHeaders });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.days, 14);
    assert.equal(body.timeZone, "Asia/Shanghai");
    assert.equal(body.series.length, 14);
    assert.equal(body.totals.published, 1);
    assert.equal(body.totals.failed, 1);
    assert.equal(body.totals.scheduled, 1);
    assert.equal(body.totals.unknown, 1);
    assert.equal(body.totals.other, 1);
    const todayBucket = body.series.find((item: { date: string }) => item.date === today);
    assert.ok(todayBucket);
    assert.equal(todayBucket.published, 1);
    assert.equal(todayBucket.failed, 1);
    assert.equal(todayBucket.unknown, 1);

    const clamped = await app.inject({ method: "GET", url: "/v1/admin/metrics?days=2", headers: adminHeaders });
    assert.equal(clamped.json().days, 7);
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("system and metrics are admin-only", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-admin-metrics-auth-"));
  const app = buildApp(config(dir));
  try {
    await app.ready();
    for (const url of ["/v1/admin/system", "/v1/admin/metrics"]) {
      const res = await app.inject({ method: "GET", url, headers: { "x-api-key": "not-admin" } });
      assert.equal(res.statusCode, 401);
    }
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
