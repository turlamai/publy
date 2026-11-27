import { test } from "node:test";
import assert from "node:assert/strict";
import { previewLocalArticle } from "./local-article-preview.js";

test("local preview preserves source privacy and does not emit active URLs", () => {
  const raw = "---\nprivate: secret\n---\n# Article\n\n[[Note|Label]] ![remote](https://example.org/a.png) [click](https://example.org)\n\n<script>alert(1)</script>";
  const result = previewLocalArticle(raw, ":root { --x: red; } #publy {color:var(--x)}");
  assert.equal(result.title, "Article");
  assert.match(result.html, /Label/);
  assert.match(result.html, /\[Image\]/);
  assert.doesNotMatch(result.html, /secret|<script|<img|href=|src=/);
  assert.match(result.css, /color:red/);
  assert.ok(result.warnings.length);
});

test("code remains literal and malformed private properties fail closed", () => {
  const result = previewLocalArticle("`[[Note]]`", "");
  assert.match(result.html, /\[\[Note\]\]/);
  assert.throws(() => previewLocalArticle("---\nsecret: x", ""), /Unclosed/);
});
