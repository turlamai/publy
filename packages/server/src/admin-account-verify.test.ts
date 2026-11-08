// Admin account verification uses the configured credential server-side and
// never returns the AppSecret.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp } from "./index.js";

const config = (dir: string) => ({
  port: 0,
  apiKey: "synthetic-admin",
  dataDir: dir,
  accounts: [{ name: "synthetic", appId: "wx_synthetic", appSecret: "synthetic-secret" }],
});

test("admin can verify a configured account without leaking its secret", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-admin-verify-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    if (url.includes("/cgi-bin/token")) return Response.json({ access_token: "synthetic", expires_in: 7200 });
    throw new Error(`unexpected URL ${url}`);
  }) as typeof fetch;
  const app = buildApp(config(dir));
  try {
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/v1/admin/accounts/synthetic/verify", headers: { "x-api-key": "synthetic-admin" } });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.account, "synthetic");
    assert.equal(body.ok, true);
    assert.equal(JSON.stringify(body).includes("synthetic-secret"), false);
    const missing = await app.inject({ method: "POST", url: "/v1/admin/accounts/nope/verify", headers: { "x-api-key": "synthetic-admin" } });
    assert.equal(missing.statusCode, 404);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("account verification is admin-only", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-admin-verify-auth-"));
  const app = buildApp(config(dir));
  try {
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/v1/admin/accounts/synthetic/verify", headers: { "x-api-key": "not-admin" } });
    assert.equal(res.statusCode, 401);
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
