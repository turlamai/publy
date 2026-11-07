// Tests: theme variable resolution (incl. the comment-swallow regression).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadTheme, loadThemeFromCss, loadHighlightCss, BUILTIN_THEMES } from "./theme.js";

test("claude theme resolves all variables to literals", () => {
  const theme = loadTheme("claude");
  assert.ok(!theme.css.includes("var(--"), "unresolved var() remains");
  assert.ok(theme.css.includes("#f8f6f0"), "bg missing — first-var-after-comment bug");
  assert.ok(!/:root\s*{/.test(theme.css), ":root block should be dropped");
});

test("every builtin theme resolves cleanly", () => {
  for (const id of BUILTIN_THEMES) {
    const theme = loadTheme(id);
    assert.ok(!theme.css.includes("var(--"), `${id}: unresolved var()`);
  }
});

test("unknown theme throws with the builtin list", () => {
  assert.throws(() => loadTheme("nope"), /Built-in themes/);
});

test("built-in theme IDs cannot bypass the allowlist through relative paths", () => {
  // Previously '../themes/claude' normalized to the same existing file, so
  // an untrusted frontmatter ID could be used as a filesystem path.
  assert.throws(() => loadTheme("../themes/claude"), /Built-in themes/);
  assert.throws(() => loadTheme("../theme/claude"), /Built-in themes/);
  assert.throws(() => loadTheme("..\\\\themes\\\\claude"), /Built-in themes/);
  assert.throws(() => loadTheme("claude/../claude"), /Built-in themes/);
  assert.equal(loadTheme("claude").id, "claude");
});

test("highlight theme names cannot traverse outside the stylesheet directory", () => {
  assert.throws(() => loadHighlightCss("../styles/github"), /Invalid highlight theme id/);
  assert.throws(() => loadHighlightCss("..\\\\styles\\\\github"), /Invalid highlight theme id/);
  assert.throws(() => loadHighlightCss("/tmp/private"), /Invalid highlight theme id/);
  assert.ok(loadHighlightCss("github").length > 0, "ordinary installed highlight CSS must keep working");
});

test("loadThemeFromCss resolves variables from arbitrary css", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-test-"));
  const file = path.join(dir, "t.css");
  fs.writeFileSync(file, "/* comment */\n:root {\n  --x: #123456;\n}\n#publy { color: var(--x); }");
  const theme = loadThemeFromCss(file);
  assert.equal(theme.id, "custom");
  assert.ok(theme.css.includes("#123456"));
  assert.ok(!theme.css.includes("var(--x)"));
});
