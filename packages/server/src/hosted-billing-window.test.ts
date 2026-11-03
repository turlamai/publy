import { test } from "node:test";
import assert from "node:assert/strict";
import { hostedBillingWindow } from "./hosted-billing-window.js";

const ms = (iso: string) => Date.parse(iso);
const iso = (value: number) => new Date(value).toISOString();
const windowAt = (start: string, end: string, at: string) => {
  const result = hostedBillingWindow(ms(start), ms(end), ms(at));
  return [iso(result.periodStart), iso(result.periodEnd)];
};

test("UTC billing windows retain the original day and time without end-of-month drift", () => {
  const start = "2024-01-31T10:20:30.123Z", end = "2025-01-31T10:20:30.123Z";
  assert.deepEqual(windowAt(start, end, "2024-02-29T10:20:30.122Z"), [start, "2024-02-29T10:20:30.123Z"]);
  assert.deepEqual(windowAt(start, end, "2024-02-29T10:20:30.123Z"), ["2024-02-29T10:20:30.123Z", "2024-03-31T10:20:30.123Z"]);
  assert.deepEqual(windowAt(start, end, "2024-03-31T10:20:30.123Z"), ["2024-03-31T10:20:30.123Z", "2024-04-30T10:20:30.123Z"]);
});

test("short paid periods truncate the final window and expiry is exclusive", () => {
  const start = "2026-01-15T08:00:00.000Z", end = "2026-03-01T12:00:00.000Z";
  assert.deepEqual(windowAt(start, end, "2026-02-20T00:00:00.000Z"), ["2026-02-15T08:00:00.000Z", end]);
  assert.throws(() => hostedBillingWindow(ms(start), ms(end), ms(end)), /INVALID_BILLING_WINDOW/);
  assert.throws(() => hostedBillingWindow(ms(start), ms(end), ms(start) - 1), /INVALID_BILLING_WINDOW/);
  assert.throws(() => hostedBillingWindow(ms(start), ms(start), ms(start)), /INVALID_BILLING_WINDOW/);
  assert.throws(() => hostedBillingWindow(NaN, ms(end), ms(start)), /INVALID_BILLING_WINDOW/);
});

test("adjacent payment-anchored windows keep quota usage in separate periods", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { HostedQuotaLedger } = await import("./hosted-quota.js");
  const db = new DatabaseSync(":memory:");
  try {
    const ledger = new HostedQuotaLedger(db);
    const paidFrom = ms("2026-01-31T08:00:00.000Z"), paidThrough = ms("2027-01-31T08:00:00.000Z");
    const before = ms("2026-02-28T07:59:59.999Z"), after = before + 1;
    const first = hostedBillingWindow(paidFrom, paidThrough, before);
    const second = hostedBillingWindow(paidFrom, paidThrough, after);
    assert.equal(first.periodEnd, second.periodStart);
    const base = { subject: "synthetic-account", fingerprint: "a".repeat(64), limit: 1 };
    assert.equal(ledger.reserve({ ...base, ...first, now: before, requestId: "first" }).status, "reserved");
    assert.equal(ledger.reserve({ ...base, ...first, now: before, requestId: "exhausted" }).status, "exhausted");
    assert.equal(ledger.reserve({ ...base, ...second, now: after, requestId: "second" }).status, "reserved");
  } finally { db.close(); }
});
