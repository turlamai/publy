// Synthetic WeChat token responses only; no live account or network calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TokenManager } from "./wechat.js";

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
