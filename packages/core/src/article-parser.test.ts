import { test } from "node:test";
import assert from "node:assert/strict";
import { createArticleParser } from "./article-parser.js";

test("shared article parser retains local image paths and highlights code", () => {
  const parser = createArticleParser();
  const html = parser.render("# Title\n\n![local](file:///tmp/image.png)\n\n```js\nconst x = 1;\n```");
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /src="file:\/\/\/tmp\/image.png"/);
  assert.match(html, /hljs-keyword/);
  assert.equal(parser.validateLink("javascript:alert(1)"), false);
});

test("parser keeps source HTML for the separate sanitization boundary", () => {
  assert.match(createArticleParser().render("<script>alert(1)</script>"), /<script>/);
});
