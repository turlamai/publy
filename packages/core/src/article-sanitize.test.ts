import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { sanitizeArticleSource } from "./article-sanitize.js";
import { resolveVars } from "./theme-css.js";

test("shared HTML source policy removes executable markup and attributes", () => {
  const $ = cheerio.load('<p style="color:red" onclick="alert(1)">hello</p><script>alert(1)</script><iframe src="https://example.org"></iframe><a href="javascript:alert(1)">bad</a><img src="file:///tmp/a.png" srcset="https://example.org/a.png">', null, false);
  sanitizeArticleSource($);
  assert.equal($("script,iframe").length, 0);
  assert.equal($("p").text(), "hello");
  assert.equal($("p").attr("style"), undefined);
  assert.equal($("p").attr("onclick"), undefined);
  assert.equal($("a").attr("href"), undefined);
  assert.equal($("img").attr("srcset"), undefined);
  assert.equal($("img").attr("src"), "file:///tmp/a.png");
});

test("shared theme variables resolve without a filesystem", () => {
  assert.equal(resolveVars(":root { --accent: red; }\n#publy { color: var(--accent); }"), "#publy { color: red; }");
});
