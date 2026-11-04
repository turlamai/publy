import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installThemeBundle, listInstalledThemes, readInstalledTheme, removeInstalledTheme, validateThemeBundle } from "./theme-bundle.js";
function make(css: string, changes: Record<string, unknown> = {}): string {
  return JSON.stringify({ format: "publy-theme-v1", id: "sample", version: "1.0.0", name: "Sample", license: "MIT", css, cssSha256: crypto.createHash("sha256").update(css).digest("hex"), ...changes });
}
test("content-only bundles accept scoped styles and reject active or malformed CSS", () => {
  assert.equal(validateThemeBundle(make("#publy p { color: #123; margin: 1px 2px; } ")).id, "sample");
  for (const css of ["body { color: red }", "#publy p { background: url(https://evil.test/x) }", "@import url(x);", "#publy p { color: red; } </style><script>x</script>", "#publy p { color: r\\65d }", "#publy p { color: expression(x) }", "#publy p { color: red; broken }", "#publy p, body { color: red }"]) {
    assert.throws(() => validateThemeBundle(make(css)), Error, css);
  }
  assert.throws(() => validateThemeBundle(make("#publy p {color:red}", { cssSha256: "0".repeat(64) })));
  assert.throws(() => validateThemeBundle(make("#publy p {color:red}", { id: "../escape" })));
  assert.throws(() => validateThemeBundle(make("#publy p {color:red}", { script: "malicious" })));
});
test("installation verifies each read, refuses replacement and removes only selected bundle", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-theme-bundle-test-"));
  const previous = process.env.PUBLY_THEME_DIR; process.env.PUBLY_THEME_DIR = dir;
  try {
    const source = make("#publy p {color:red}");
    assert.equal(installThemeBundle(source, "add").id, "sample");
    assert.throws(() => installThemeBundle(source, "add"));
    assert.equal(listInstalledThemes().length, 1);
    assert.equal(readInstalledTheme("sample").version, "1.0.0");
    assert.equal(installThemeBundle(make("#publy p {color:blue}", { version: "1.0.1" }), "update").version, "1.0.1");
    fs.writeFileSync(path.join(dir, "sample.json"), source.replace("color:red", "color:blue"));
    assert.throws(() => readInstalledTheme("sample"));
    fs.writeFileSync(path.join(dir, "sample.json"), source);
    removeInstalledTheme("sample"); assert.deepEqual(listInstalledThemes(), []);
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally { if (previous === undefined) delete process.env.PUBLY_THEME_DIR; else process.env.PUBLY_THEME_DIR = previous; fs.rmSync(dir, { recursive: true, force: true }); }
});
