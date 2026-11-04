import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HostedIdentityBindings } from "./hosted-identity.js";

test("hosted subjects survive credential changes and never migrate between users", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-hosted-identity-"));
  const file = path.join(dir, "users.db");
  let db = new DatabaseSync(file);
  try {
    db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, contact TEXT NOT NULL, api_key TEXT NOT NULL, disabled_at INTEGER NOT NULL)");
    db.prepare("INSERT INTO users VALUES (?, ?, ?, 0)").run("user-a", "old-contact", "old-key");
    db.prepare("INSERT INTO users VALUES (?, ?, ?, 0)").run("user-b", "other-contact", "other-key");
    let identities = new HostedIdentityBindings(db);
    assert.equal(identities.resolve("user-a"), null);
    assert.throws(() => identities.enroll("missing-user", 10), /HOSTED_IDENTITY_UNAVAILABLE/);
    const a = identities.enroll("user-a", 10);
    const b = identities.enroll("user-b", 10);
    assert.match(a, /^publy_account_[a-f0-9]{64}$/);
    assert.notEqual(a, b);
    assert.equal(identities.enroll("user-a", 11), a);
    db.prepare("UPDATE users SET contact = ?, api_key = ? WHERE id = ?").run("new-contact", "new-key", "user-a");
    db.close();
    db = new DatabaseSync(file);
    identities = new HostedIdentityBindings(db);
    assert.equal(identities.resolve("user-a"), a);
    assert.equal(identities.resolve("user-b"), b);
    db.prepare("UPDATE users SET disabled_at = 20 WHERE id = ?").run("user-a");
    assert.equal(identities.resolve("user-a"), null);
    assert.throws(() => identities.enroll("user-a", 21), /HOSTED_IDENTITY_UNAVAILABLE/);
    db.prepare("UPDATE users SET disabled_at = 0 WHERE id = ?").run("user-a");
    assert.equal(identities.resolve("user-a"), a);
    assert.equal(identities.resolve("missing-user"), null);
    assert.throws(() => identities.enroll("user-a", -1), /HOSTED_IDENTITY_INVALID_INPUT/);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrent enrollment produces exactly one stable subject", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-hosted-identity-race-"));
  const file = path.join(dir, "users.db");
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, disabled_at INTEGER NOT NULL); INSERT INTO users VALUES ('user-a', 0)");
  new HostedIdentityBindings(db);
  db.close();
  const moduleUrl = new URL("./hosted-identity.js", import.meta.url).href;
  const worker = `import {DatabaseSync} from "node:sqlite";
    const {HostedIdentityBindings} = await import(process.argv[1]);
    const db = new DatabaseSync(process.argv[2]);
    console.log(new HostedIdentityBindings(db).enroll("user-a", 10)); db.close();`;
  const run = () => new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", worker, moduleUrl, file], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "", errors = "";
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { errors += data; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(`identity worker exited ${code}: ${errors}`)));
  });
  try {
    const results = await Promise.allSettled(Array.from({ length: 8 }, run));
    const values = results.map((result) => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    });
    assert.equal(new Set(values).size, 1);
    assert.match(values[0], /^publy_account_[a-f0-9]{64}$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
