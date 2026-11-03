// Tests: Obsidian syntax preprocessing.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { preprocessObsidian } from "./obsidian.js";
import { renderMarkdown } from "./render.js";

function withMediaDir(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-test-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("embed resolves against media dir and keeps alt", () => {
  withMediaDir((dir) => {
    fs.writeFileSync(path.join(dir, "pic.png"), "x");
    const { body, assets, missing } = preprocessObsidian("![[pic.png|说明|650]]", [dir]);
    assert.equal(missing.length, 0);
    assert.equal(assets.length, 1);
    assert.match(body, /!\[说明\]\(.*pic\.png\)/);
  });
});

test("Obsidian embed never resolves a directory as an image attachment", () => {
  withMediaDir((dir) => {
    fs.mkdirSync(path.join(dir, "assets"));
    fs.writeFileSync(path.join(dir, "real.png"), "synthetic-image");
    const source = "![[assets]]\n\n![[real.png]]";
    const result = preprocessObsidian(source, [dir]);
    assert.deepEqual(result.missing, ["assets"]);
    assert.deepEqual(result.assets, [path.join(dir, "real.png")]);
    assert.match(result.body, /!\[assets\]\(assets\)/);
    const rendered = renderMarkdown(source, { baseDir: dir });
    assert.deepEqual(rendered.attachments.map((a) => a.path), [path.join(dir, "real.png")]);
    assert.ok(rendered.warnings.some((warning) => warning.includes("Assets not found: assets")));
  });
});

test("embed without alt falls back to file base name", () => {
  withMediaDir((dir) => {
    fs.writeFileSync(path.join(dir, "pic.png"), "x");
    const { body } = preprocessObsidian("![[pic.png]]", [dir]);
    assert.match(body, /!\[pic\]\(/);
  });
});

test("wikilink collapses to alias / target", () => {
  const a = preprocessObsidian("[[Some/Note|alias]]", []);
  assert.equal(a.body, "alias");
  const b = preprocessObsidian("[[Note]]", []);
  assert.equal(b.body, "Note");
});

test("missing asset is reported, body keeps reference", () => {
  const { missing, body } = preprocessObsidian("![[nope.png]]", []);
  assert.deepEqual(missing, ["nope.png"]);
  assert.match(body, /!\[nope\]\(nope\.png\)/);
});

test("Obsidian embeds preserve filenames with spaces, parentheses, hashes and percent signs", () => {
  withMediaDir((dir) => {
    const name = "Draft (final) #1 100%.png";
    const actual = path.join(dir, name);
    fs.writeFileSync(actual, "synthetic-image");
    const source = `![[${name}|Cover (draft)]]`;
    const pre = preprocessObsidian(source, [dir]);
    assert.deepEqual(pre.missing, []);
    assert.deepEqual(pre.assets, [actual]);
    assert.match(pre.body, /file:\/\/\//);
    assert.match(pre.body, /%28final%29/);
    assert.match(pre.body, /%23/);
    assert.match(pre.body, /%25/);
    const rendered = renderMarkdown(source, { baseDir: dir });
    assert.deepEqual(rendered.warnings, []);
    assert.deepEqual(rendered.attachments.map((a) => a.path), [actual]);
    assert.match(rendered.html, /attachment:\/\//);
    assert.ok(!rendered.html.includes("file:///"), "file URLs must not escape into the draft");
  });
});

test("Obsidian code examples remain literal and do not create false missing-media warnings", () => {
  withMediaDir((dir) => {
    const file = path.join(dir, "real.png");
    fs.writeFileSync(file, "synthetic-image");
    const source = [
      "Outside ![[real.png|实际图片]] and [[Note|alias]]",
      "`![[missing-inline.png]]` and ``![[missing-double.png]]``",
      "~~~markdown",
      "![[missing-tilde.png]] [[NotALink|example]]",
      "~~~",
      "````md",
      "![[missing-backtick.png]]",
      "````",
      "    ![[missing-indented.png]]",
      "Outside again ![[real.png]]",
    ].join("\n");
    const pre = preprocessObsidian(source, [dir]);
    assert.deepEqual(pre.missing, []);
    assert.deepEqual(pre.assets, [file, file]);
    assert.ok(pre.body.includes("Outside ![实际图片]("));
    assert.match(pre.body, /alias/);
    for (const literal of [
      "`![[missing-inline.png]]`",
      "``![[missing-double.png]]``",
      "![[missing-tilde.png]]",
      "[[NotALink|example]]",
      "![[missing-backtick.png]]",
      "    ![[missing-indented.png]]",
    ]) assert.ok(pre.body.includes(literal), `code literal was rewritten: ${literal}`);

    const rendered = renderMarkdown(source, { baseDir: dir });
    assert.deepEqual(rendered.warnings, []);
    assert.deepEqual(rendered.attachments.map((a) => a.path), [file, file]);
  });
});

test("escaped and unmatched backticks do not hide real Obsidian embeds", () => {
  withMediaDir((dir) => {
    const file = path.join(dir, "real.png");
    fs.writeFileSync(file, "synthetic-image");
    const source = "\\` ![[real.png]] and unmatched ` ![[real.png]]";
    const pre = preprocessObsidian(source, [dir]);
    assert.deepEqual(pre.missing, []);
    assert.deepEqual(pre.assets, [file, file]);
  });
});


test("indented paragraph continuation remains an active embed", () => {
  withMediaDir((dir) => {
    const file = path.join(dir, "real.png");
    fs.writeFileSync(file, "image");
    const result = preprocessObsidian("Paragraph\n    ![[real.png]]", [dir]);
    assert.deepEqual(result.assets, [file]);
    assert.deepEqual(result.missing, []);
  });
});


test("unmatched backticks do not hide embeds in a later paragraph", () => {
  withMediaDir((dir) => {
    const file = path.join(dir, "real.png");
    fs.writeFileSync(file, "image");
    const result = preprocessObsidian("unmatched `\n\n`literal` ![[real.png]]", [dir]);
    assert.deepEqual(result.assets, [file]);
  });
});
