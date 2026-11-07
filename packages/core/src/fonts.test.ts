import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSatoriFontsOffline, loadSatoriFontsWithFallback, setEmbeddedFontSubsets, NOTO_SANS_SC } from "./fonts.js";

test("embedded font subsets are used offline without reading or downloading sidecars", async () => {
  // Small synthetic bytes exercise the selection seam; the Obsidian bundle
  // imports real subset OTFs at build time and is exercised by plugin smoke.
  const regular = Uint8Array.from([10, 20, 30]);
  const bold = Uint8Array.from([40, 50, 60]);
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  setEmbeddedFontSubsets({ regular, bold });
  globalThis.fetch = (async () => { networkCalls++; throw new Error("font fetch forbidden"); }) as typeof fetch;
  try {
    // Mutating the importer-owned bytes cannot corrupt the internal snapshot.
    regular[0] = 99;
    bold[0] = 99;
    for (const loader of [loadSatoriFontsOffline, loadSatoriFontsWithFallback]) {
      const fonts = await loader(NOTO_SANS_SC);
      assert.equal(fonts.length, 2);
      assert.deepEqual([...fonts[0].data], [10, 20, 30]);
      assert.deepEqual([...fonts[1].data], [40, 50, 60]);
      assert.deepEqual(fonts.map((font) => font.weight), [400, 700]);
    }
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    setEmbeddedFontSubsets(null);
  }
});
