import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { quarantineRestoredJobs } from "./quarantine-restored-jobs.mjs";
import { buildApp } from "../packages/server/dist/index.js";

const job = (id, status, extra = {}) => ({ id, status, runAt: 1, nextAttemptAt: 1, attempts: 0,
  userId: null, body: { account: "synthetic", title: id, type: "article" }, ...extra });

test("restored executable and previously retryable jobs stay blocked when the server starts", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-restore-"));
  const file = path.join(dir, "jobs.json");
  const original = JSON.stringify({ a: job("a", "pending"), b: job("b", "running"),
    c: job("c", "failed", { safeToRetry: true }), d: job("d", "done"), e: job("e", "failed") });
  fs.writeFileSync(file, original);
  let calls = 0;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected network call"); };
  let app;
  try {
    assert.equal(quarantineRestoredJobs(dir), 3);
    assert.equal(fs.readFileSync(`${file}.before-restore-quarantine`, "utf8"), original);
    assert.equal(quarantineRestoredJobs(dir), 0);
    const restored = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const id of ["a", "b", "c"]) assert.equal(restored[id].status, "interrupted");
    assert.equal(restored.d.status, "done");
    assert.equal(restored.e.status, "failed");
    app = buildApp({ port: 0, apiKey: "synthetic", dataDir: dir, jobPollMs: 5, accounts: [] });
    await app.ready();
    await new Promise((resolve) => setTimeout(resolve, 50));
    for (const id of ["a", "b", "c"]) {
      const retry = await app.inject({ method: "POST", url: `/v1/jobs/${id}/retry`, headers: { "x-api-key": "synthetic" } });
      assert.equal(retry.statusCode, 409);
      assert.equal(retry.json().code, "DRAFT_OUTCOME_UNKNOWN");
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = oldFetch;
    if (app) await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("invalid state and an existing backup stop without rewriting the restored queue", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-restore-invalid-"));
  const file = path.join(dir, "jobs.json");
  try {
    fs.writeFileSync(file, '{"bad":null}');
    assert.throws(() => quarantineRestoredJobs(dir));
    assert.equal(fs.readFileSync(file, "utf8"), '{"bad":null}');
    const valid = JSON.stringify({ a: job("a", "pending") });
    fs.writeFileSync(file, valid);
    fs.writeFileSync(`${file}.before-restore-quarantine`, "do not overwrite");
    assert.throws(() => quarantineRestoredJobs(dir));
    assert.equal(fs.readFileSync(file, "utf8"), valid);
    assert.equal(fs.readFileSync(`${file}.before-restore-quarantine`, "utf8"), "do not overwrite");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
