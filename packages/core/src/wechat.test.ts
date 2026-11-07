// Synthetic WeChat token responses only; no live account or network calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TokenManager, draftBatchGet, listDraftSummaries } from "./wechat.js";

test("TokenManager rejects missing or malformed success tokens without caching them", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-token-validation-"));
  const originalFetch = globalThis.fetch;
  const invalidResponses = [
    { errcode: 0, expires_in: 7200 },
    { access_token: "", expires_in: 7200 },
    { access_token: "   ", expires_in: 7200 },
    { access_token: 42, expires_in: 7200 },
    null,
  ];
  let calls = 0;
  globalThis.fetch = (async () => {
    const response = calls < invalidResponses.length
      ? invalidResponses[calls]
      : { access_token: "synthetic-token", expires_in: 7200 };
    calls++;
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const manager = new TokenManager(dir);
    for (const _ of invalidResponses) {
      await assert.rejects(
        manager.get("synthetic-app", "synthetic-secret"),
        /token response missing a valid access_token/,
      );
      assert.equal(fs.existsSync(path.join(dir, "token.json")), false);
    }
    assert.equal(await manager.get("synthetic-app", "synthetic-secret"), "synthetic-token");
    assert.equal(await manager.get("synthetic-app", "synthetic-secret"), "synthetic-token");
    assert.equal(calls, invalidResponses.length + 1, "only the valid response may be cached");
    const persisted = JSON.parse(fs.readFileSync(path.join(dir, "token.json"), "utf8"));
    assert.equal(persisted["synthetic-app"].accessToken, "synthetic-token");
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("TokenManager refreshes malformed tokens left in an older disk cache", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-legacy-token-"));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return Response.json({ access_token: "synthetic-recovered", expires_in: 7200 });
  }) as typeof fetch;
  try {
    // undefined is omitted by JSON.stringify, reproducing an old poisoned cache.
    for (const accessToken of [undefined, "", "   ", 42]) {
      fs.writeFileSync(path.join(dir, "token.json"), JSON.stringify({
        "synthetic-app": { accessToken, expireAt: Date.now() / 1000 + 7200 },
      }));
      const manager = new TokenManager(dir);
      assert.equal(await manager.get("synthetic-app", "synthetic-secret"), "synthetic-recovered");
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(dir, "token.json"), "utf8"))["synthetic-app"].accessToken,
        "synthetic-recovered",
      );
    }
    assert.equal(calls, 4, "each malformed persisted token must be refreshed");
    // Valid disk entries must remain usable offline without another request.
    const valid = new TokenManager(dir);
    assert.equal(await valid.get("synthetic-app", "synthetic-secret"), "synthetic-recovered");
    assert.equal(calls, 4);
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test("TokenManager repairs malformed top-level token caches without using live credentials", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-token-cache-root-"));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return Response.json({ access_token: "synthetic-repaired", expires_in: 7200 });
  }) as typeof fetch;
  try {
    // JSON.parse accepts these values, but none is a usable token dictionary.
    // An array also silently drops named keys when JSON.stringify persists it.
    for (const invalidRoot of ["null", "[]", '"old-format"', "42", "true"]) {
      fs.writeFileSync(path.join(dir, "token.json"), invalidRoot);
      const manager = new TokenManager(dir);
      assert.equal(await manager.get("synthetic-app", "synthetic-secret"), "synthetic-repaired");
      const repaired = JSON.parse(fs.readFileSync(path.join(dir, "token.json"), "utf8"));
      assert.equal(Array.isArray(repaired), false);
      assert.equal(repaired["synthetic-app"].accessToken, "synthetic-repaired");
    }
    assert.equal(calls, 5, "each malformed root must refresh exactly once");
    const recovered = new TokenManager(dir);
    assert.equal(await recovered.get("synthetic-app", "synthetic-secret"), "synthetic-repaired");
    assert.equal(calls, 5, "repaired cache must be reusable without another request");
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("TokenManager preserves prototype-like app IDs across disk recovery", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-token-prototype-"));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return Response.json({ access_token: `synthetic-token-${calls}`, expires_in: 7200 });
  }) as typeof fetch;
  try {
    for (const appId of ["__proto__", "constructor", "toString"]) {
      const manager = new TokenManager(dir);
      const expected = `synthetic-token-${calls + 1}`;
      assert.equal(await manager.get(appId, "synthetic-secret"), expected);
      const persisted = JSON.parse(fs.readFileSync(path.join(dir, "token.json"), "utf8"));
      assert.equal(Object.hasOwn(persisted, appId), true, `${appId} must be persisted as an own key`);
      assert.equal(persisted[appId].accessToken, expected);
      const restored = new TokenManager(dir);
      assert.equal(await restored.get(appId, "synthetic-secret"), expected);
    }
    assert.equal(calls, 3, "restored entries must not trigger additional token requests");
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("draftBatchGet keeps titles and media IDs and ignores malformed entries", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: any }> = [];
  globalThis.fetch = (async (input: any, init: any) => {
    requests.push({ url: String(input), body: JSON.parse(init.body) });
    return Response.json({
      total_count: 4,
      item_count: 4,
      item: [
        { media_id: "draft-a", content: { news_item: [{ title: "Synthetic A" }] }, update_time: 1700000000 },
        { media_id: "", content: { news_item: [{ title: "empty id" }] } },
        { media_id: "draft-b", content: {}, update_time: "not-a-number" },
        null,
      ],
    });
  }) as typeof fetch;
  try {
    const page = await draftBatchGet("synthetic-token", 20, 99);
    assert.equal(requests[0].body.offset, 20);
    assert.equal(requests[0].body.count, 20, "WeChat page size must be clamped to 20");
    assert.equal(requests[0].body.no_content, 1);
    assert.equal(page.totalCount, 4);
    assert.deepEqual(page.items, [
      { mediaId: "draft-a", title: "Synthetic A", updateTime: 1700000000 },
      { mediaId: "draft-b", title: "", updateTime: 0 },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("listDraftSummaries pages through the draft box and stops on an empty page", async () => {
  const originalFetch = globalThis.fetch;
  const offsets: number[] = [];
  globalThis.fetch = (async (_input: any, init: any) => {
    const body = JSON.parse(init.body);
    offsets.push(body.offset);
    const start = body.offset;
    const count = Math.max(Math.min(45 - start, body.count), 0);
    const item = Array.from({ length: count }, (_, index) => ({
      media_id: `draft-${start + index}`,
      content: { news_item: [{ title: `Title ${start + index}` }] },
      update_time: 1700000000 + start + index,
    }));
    return Response.json({ total_count: 45, item_count: item.length, item });
  }) as typeof fetch;
  try {
    const listing = await listDraftSummaries("synthetic-token", 100);
    assert.deepEqual(offsets, [0, 20, 40], "pages must advance by the server-reported count");
    assert.equal(listing.totalCount, 45);
    assert.equal(listing.items.length, 45);
    assert.equal(listing.items.at(-1)?.mediaId, "draft-44");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("draft box listing fails closed with the WeChat error code", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ errcode: 40001, errmsg: "invalid credential" })) as typeof fetch;
  try {
    await assert.rejects(draftBatchGet("stale-token"), /40001: invalid credential/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("draft box listing refuses a response without a usable total_count", async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    { item: [{ media_id: "draft-a", content: { news_item: [{ title: "Synthetic" }] } }] },
    { total_count: "3", item: [] },
    { total_count: null, item: [] },
  ];
  let calls = 0;
  globalThis.fetch = (async () => Response.json(responses[calls++])) as typeof fetch;
  try {
    for (const _ of responses) {
      await assert.rejects(draftBatchGet("synthetic-token"), /no usable total_count/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
