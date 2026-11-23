import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSource, resolvePublication, publicationTitle, imagePostCaption } from "./frontmatter.js";

test("publication format comes only from an explicit choice or article default", () => {
  assert.deepEqual(resolvePublication(), {format:"article",type:"article",source:"default"});
  for (const format of ["article", "image", "cards"] as const) {
    assert.deepEqual(resolvePublication(format), {format,type:format === "article" ? "article" : "image_post",source:"choice"});
  }
  assert.throws(() => resolvePublication("invalid" as never));
});
test("properties are skipped even when YAML is malformed, with CRLF and BOM", () => {
  assert.deepEqual(parseSource("\uFEFF---\r\nprivate: [broken\r\n...\r\n# Body"), {meta:{},body:"# Body"});
  assert.throws(() => parseSource("---\nsecret: confidential"), /Unclosed note properties block/);
  assert.equal(parseSource("# Title\n\n---\nBody").body, "# Title\n\n---\nBody");
});
test("title and caption use operation parameters then body without properties", () => {
  const raw = "---\ntitle: Private\ncaption: Private\n---\n# Body title\n\nBody caption";
  assert.equal(publicationTitle(raw), "Body title");
  assert.equal(publicationTitle(raw,"Chosen"), "Chosen");
  assert.equal(publicationTitle("Plain body", undefined, "filename"), "filename");
  assert.equal(imagePostCaption(raw,"Chosen caption"), "Chosen caption");
  assert.equal(imagePostCaption(raw).includes("Private"), false);
});

test("private note properties never become publication options or rendered output", () => {
  const secret = "PRIVATE_PROPERTY_CANARY_20261123";
  const raw = `---\ntype: image\nmode: cards\ntitle: ${secret}\ntheme: /private/theme\ncaption: ${secret}\n---\n# Visible title\n\nVisible body`;
  const parsed = parseSource(raw);
  assert.deepEqual(parsed.meta, {});
  assert.equal(JSON.stringify(parsed).includes(secret), false);
  assert.equal(parsed.body.includes("Visible body"), true);
});

test("title candidates honor Markdown headings, literal hashes and fenced code", () => {
  assert.equal(publicationTitle("# C#"), "C#");
  assert.equal(publicationTitle("Setext title\n============"), "Setext title");
  assert.equal(publicationTitle("```md\n# Example\n```\n\n# **Actual** `title`"), "Actual title");
});
