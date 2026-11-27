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

 test("only exact selected relative raster images are rendered", () => {
 const data="data:image/png;base64,AAAA";
 const media=new Map([["a/photo.png",data],["photo.png","data:image/svg+xml;base64,AAAA"]]);
 const result=previewLocalArticle("![a](a/photo.png) ![b](photo.png) ![c](../a/photo.png) ![d](https://example.com/photo.png) ![[a/photo.png]]","",media);
 assert.equal((result.html.match(/<img /g)??[]).length,2);
 assert.doesNotMatch(result.html,/https:|image\/svg/);
 assert.ok(result.warnings.length);
 });
