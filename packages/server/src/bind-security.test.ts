import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp } from "./index.js";

test("self-service binding cannot overwrite another owner or exceed account limits concurrently", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-bind-security-"));
  const app = buildApp({ port: 0, apiKey: "synthetic-admin", dataDir: dir, accounts: [{ name: "admin-account", appId: "wx_admin", appSecret: "synthetic" }] });
  const headers = (key: string) => ({ "x-api-key": key, "content-type": "application/json" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ access_token: "synthetic" }), { status: 200 });
  try {
    await app.ready();
    const createUser = async (contact: string) => (await app.inject({ method: "POST", url: "/v1/admin/users", headers: headers("synthetic-admin"), payload: { contact, plan: "free", months: 1 } })).json().apiKey as string;
    const alice = await createUser("alice@example.test");
    const bob = await createUser("bob@example.test");
    const bind = (key: string, accountName: string) => app.inject({ method: "POST", url: "/v1/bind", headers: headers(key), payload: { accountName, appId: "wx_test", appSecret: "synthetic" } });
    assert.equal((await bind(alice, "alice-account")).statusCode, 200);
    assert.equal((await bind(bob, "alice-account")).statusCode, 409);
    assert.equal((await bind(bob, "admin-account")).statusCode, 409);
    assert.deepEqual((await app.inject({ method: "GET", url: "/v1/accounts", headers: headers(alice) })).json().accounts, [{ name: "alice-account" }]);
    const results = await Promise.all([bind(bob, "bob-one"), bind(bob, "bob-two")]);
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 400]);
    assert.equal((await app.inject({ method: "GET", url: "/v1/accounts", headers: headers(bob) })).json().accounts.length, 1);

    const charlie = await createUser("charlie@example.test");
    const users = (await app.inject({ method: "GET", url: "/v1/admin/users", headers: headers("synthetic-admin") })).json().users;
    const charlieId = users.find((u: { contact: string }) => u.contact === "charlie@example.test").id;
    let releaseFetch!: (response: Response) => void;
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
    globalThis.fetch = async () => { notifyStarted(); return await new Promise<Response>((resolve) => { releaseFetch = resolve; }); };
    const pending = bind(charlie, "charlie-account");
    await started;
    await app.inject({ method: "POST", url: `/v1/admin/users/${charlieId}/disable`, headers: headers("synthetic-admin"), payload: { disabled: true } });
    releaseFetch(new Response(JSON.stringify({ access_token: "synthetic" }), { status: 200 }));
    assert.equal((await pending).statusCode, 403, "revocation during validation must prevent binding");
    const accounts = (await app.inject({ method: "GET", url: "/v1/admin/accounts", headers: headers("synthetic-admin") })).json().accounts;
    assert.equal(accounts.some((account: { name: string }) => account.name === "charlie-account"), false);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
