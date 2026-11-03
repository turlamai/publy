import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HostedQuotaLedger } from "./hosted-quota.js";

test("hosted quota reservations are durable, bounded and conservative for unknown drafts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-quota-ledger-"));
  const dbPath = path.join(dir, "quota.db");
  let db = new DatabaseSync(dbPath);
  try {
    let ledger = new HostedQuotaLedger(db);
    const base = { subject: "account-a", fingerprint: "a".repeat(64), periodStart: 1000, periodEnd: 2000, limit: 2, now: 1500 };
    assert.deepEqual(ledger.reserve({ ...base, requestId: "one" }), { status: "reserved", state: "reserved" });
    assert.deepEqual(ledger.reserve({ ...base, requestId: "one" }), { status: "existing", state: "reserved" });
    assert.throws(() => ledger.reserve({ ...base, requestId: "one", fingerprint: "b".repeat(64) }), /QUOTA_REQUEST_CONFLICT/);
    assert.equal(ledger.beginSend(base.subject, "one", 1500), "sending");
    assert.throws(() => ledger.beginSend(base.subject, "one", 1500), /QUOTA_INVALID_TRANSITION/);
    assert.throws(() => ledger.cancelBeforeSend(base.subject, "one"), /QUOTA_INVALID_TRANSITION/);
    assert.equal(ledger.markUnknown(base.subject, "one"), "unknown");
    assert.throws(() => ledger.cancelBeforeSend(base.subject, "one"), /QUOTA_INVALID_TRANSITION/);
    assert.equal(ledger.reserve({ ...base, requestId: "two" }).status, "reserved");
    assert.equal(ledger.reserve({ ...base, requestId: "three" }).status, "exhausted");
    db.close();
    db = new DatabaseSync(dbPath);
    ledger = new HostedQuotaLedger(db);
    assert.equal(ledger.reserve({ ...base, requestId: "three" }).status, "exhausted", "unknown reservation survives restart");
    assert.equal(ledger.confirmSuccess(base.subject, "one"), "succeeded");
    assert.equal(ledger.confirmSuccess(base.subject, "one"), "succeeded", "duplicate confirmation is idempotent");
    assert.equal(ledger.cancelBeforeSend(base.subject, "two"), "cancelled");
    assert.equal(ledger.reserve({ ...base, requestId: "three" }).status, "reserved");
    assert.throws(() => ledger.reserve({ ...base, requestId: "different", limit: 3 }), /QUOTA_POLICY_CONFLICT/);
    assert.throws(() => ledger.reserve({ ...base, requestId: "overlap", periodStart: 1200, periodEnd: 2200 }), /QUOTA_PERIOD_OVERLAP/);
    assert.equal(ledger.reserve({ ...base, subject: "account-b", requestId: "one" }).status, "reserved");
    assert.throws(() => ledger.confirmSuccess("account-b", "three"), /QUOTA_INVALID_TRANSITION/);
    assert.equal(ledger.reserve({ ...base, requestId: "next-period", periodStart: 2000, periodEnd: 3000, now: 2000 }).status, "reserved");
    assert.throws(() => ledger.reserve({ ...base, requestId: "expired", now: 2000 }), /INVALID_QUOTA_REQUEST/);
    assert.equal(ledger.reserve({ ...base, subject: "account-c", requestId: "late" }).status, "reserved");
    assert.throws(() => ledger.beginSend("account-c", "late", 2000), /QUOTA_PERIOD_EXPIRED/);
    assert.equal(ledger.cancelBeforeSend("account-c", "late"), "cancelled");
    assert.equal(ledger.reserve({ ...base, subject: "account-d", requestId: "rejected", limit: 1 }).status, "reserved");
    ledger.beginSend("account-d", "rejected", 1500);
    assert.equal(ledger.confirmRejected("account-d", "rejected"), "cancelled");
    assert.equal(ledger.reserve({ ...base, subject: "account-d", requestId: "next", limit: 1 }).status, "reserved", "a definitive failure releases its slot");
    assert.throws(() => ledger.confirmRejected(base.subject, "one"), /QUOTA_INVALID_TRANSITION/);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test("multiple processes cannot reserve beyond the same account allowance", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-quota-race-"));
  const dbPath = path.join(dir, "quota.db");
  const seed = new DatabaseSync(dbPath);
  new HostedQuotaLedger(seed);
  seed.close();
  const moduleUrl = new URL("./hosted-quota.js", import.meta.url).href;
  const worker = `import {DatabaseSync} from "node:sqlite";
    const {HostedQuotaLedger} = await import(process.argv[1]);
    const db = new DatabaseSync(process.argv[2]);
    const ledger = new HostedQuotaLedger(db);
    const result = ledger.reserve({subject:"shared",requestId:process.argv[3],fingerprint:"a".repeat(64),periodStart:1000,periodEnd:2000,limit:3,now:1500});
    console.log(result.status); db.close();`;
  const run = (id: number) => new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", worker, moduleUrl, dbPath, `request-${id}`], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "", errors = "";
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { errors += data; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(`worker ${id} exited ${code}: ${errors}`)));
  });
  try {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => run(i)));
    assert.equal(results.filter((result) => result === "reserved").length, 3);
    assert.equal(results.filter((result) => result === "exhausted").length, 5);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
