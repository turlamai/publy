import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HostedEntitlementFence } from "./hosted-entitlement-fence.js";

test("entitlement lineage and high-water revision survive restarts and reject replay", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-entitlement-fence-"));
  const dbPath = path.join(dir, "fence.db");
  let db = new DatabaseSync(dbPath);
  try {
    let fence = new HostedEntitlementFence(db);
    const value = { subject: "account-a", offer: "personal", entitlementId: "ent-1", revision: 1, payloadSha256: "a".repeat(64) };
    assert.throws(() => fence.record(value, false), /FENCE_NOT_ENROLLED/);
    assert.equal(fence.record(value, true), "enrolled");
    assert.equal(fence.record(value, false), "unchanged");
    assert.throws(() => fence.record({ ...value, entitlementId: "other" }, true), /FENCE_LINEAGE_MISMATCH/);
    assert.throws(() => fence.record({ ...value, payloadSha256: "b".repeat(64) }, false), /FENCE_REVISION_CONFLICT/);
    assert.equal(fence.record({ ...value, revision: 2, payloadSha256: "b".repeat(64) }, false), "advanced");
    db.close();
    db = new DatabaseSync(dbPath);
    fence = new HostedEntitlementFence(db);
    assert.throws(() => fence.record(value, false), /FENCE_STALE_REVISION/);
    assert.equal(fence.record({ ...value, revision: 2, payloadSha256: "b".repeat(64) }, false), "unchanged");
    assert.throws(() => fence.record({ ...value, subject: "account-b" }, false), /FENCE_NOT_ENROLLED/);
    assert.throws(() => fence.record({ ...value, revision: -1 }, true), /FENCE_INVALID_INPUT/);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
