// Tests: card source parsing, lint rules and real rendering (bundled subset fonts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPreviewHtml, parseCardSource, lintCards, renderCards, CARD_WIDTH, CARD_HEIGHT } from "./cards.js";

const SAMPLE = `---
title: t
caption: ok
---

## cover
标题

## point
论点
正文

## ending
关注我
`;

test("parseCardSource extracts sections and caption", () => {
  const { sections, caption } = parseCardSource(SAMPLE);
  assert.deepEqual(sections.map((s) => s.kind), ["cover", "point", "ending"]);
  assert.equal(caption, "ok");
});

test("parseCardSource without sections throws", () => {
  assert.throws(() => parseCardSource("---\ntitle: t\n---\nno sections"), /No card sections/);
});

test("lint accepts a well-formed deck", () => {
  const { sections } = parseCardSource(SAMPLE);
  assert.equal(lintCards(sections, "ok").ok, true);
});

test("lint rejects over-long caption", () => {
  const { sections } = parseCardSource(SAMPLE);
  const result = lintCards(sections, "长".repeat(1001));
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.includes("1000")));
});

test("lint requires cover and ending", () => {
  const result = lintCards([{ kind: "point", lines: ["x"] }], "ok");
  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 3); // count + cover + ending
});

test("renderCards fires onCard progressively, in order", async () => {
  const os = await import("node:os");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-oncard-"));
  const existing = path.join(outDir, ".publy-card-0.svg");
  fs.writeFileSync(existing, "user-owned sentinel");
  const seen: number[] = [];
  let totalSeen = 0;
  const result = await renderCards(SAMPLE, {
    theme: "naive",
    outDir,
    onCard: (_card, index, total) => {
      seen.push(index);
      totalSeen = total;
    },
  });
  assert.equal(totalSeen, result.cards.length);
  assert.deepEqual(seen, result.cards.map((_, i) => i));
  assert.ok(seen.length >= 2);
  assert.equal(fs.readFileSync(existing, "utf8"), "user-owned sentinel");
  fs.rmSync(outDir, { recursive: true, force: true });
});

test("renderCards produces real PNGs via bundled subset fonts", async () => {
  const os = await import("node:os");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-render-test-"));
  const result = await renderCards(SAMPLE, { theme: "naive", outDir });
  assert.equal(result.cards.length, 3);
  for (const card of result.cards) {
    const buf = fs.readFileSync(card.file);
    // PNG magic + IHDR dimensions 1080x1440
    assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(buf.readUInt32BE(16), CARD_WIDTH);
    assert.equal(buf.readUInt32BE(20), CARD_HEIGHT);
  }
  assert.equal(result.lint.ok, true);
});

test("offline card preview renders real PNGs without fetching remote fonts", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-card-offline-"));
  const originalFetch = globalThis.fetch;
  let attempted = false;
  globalThis.fetch = (async () => {
    attempted = true;
    throw new Error("offline preview must not fetch a font");
  }) as typeof fetch;
  try {
    const result = await renderCards(SAMPLE, { outDir, offline: true });
    assert.equal(result.cards.length, 3);
    assert.equal(attempted, false);
    for (const card of result.cards) {
      const png = fs.readFileSync(card.file);
      assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    }
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("legacy card contact-sheet HTML escapes captions and forbids active network resources", () => {
  const hostile = "</div><script>fetch('https://example.test/private')</script>";
  const html = buildPreviewHtml({
    cards: [],
    caption: hostile,
    meta: { tags: ["<img src=x onerror=alert(1)>"] },
    warnings: [],
    lint: { ok: false, problems: ["<svg onload=alert(1)>"] },
  });
  assert.ok(html.includes("Content-Security-Policy"));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("&lt;img src=x"));
  assert.ok(html.includes("&lt;svg onload="));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<svg onload"));
  assert.ok(!html.includes("<img src=x"));
});
