import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const verifier = fileURLToPath(new URL("./verify-plugin.mjs", import.meta.url));
const files = {
  "main.js": "module.exports = { default: 42 };\n",
  "manifest.json": '{"id":"publy","name":"Publy","version":"0.0.0"}\n',
  "styles.css": "/* fixture */\n",
};

function fixture(t, extras = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-layout-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), contents);
  }
  for (const name of extras) {
    if (name.endsWith("/")) {
      fs.mkdirSync(path.join(dir, name), { recursive: true });
      fs.writeFileSync(path.join(dir, name, "sentinel"), "do not delete");
    } else {
      fs.writeFileSync(path.join(dir, name), "do not overwrite");
    }
  }
  return dir;
}

function verify(args, dir) {
  const run = spawnSync(process.execPath, [verifier, ...args, dir], {
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(run.error, undefined);
  assert.notEqual(run.status, 0, "the deliberately invalid plugin fixture must not load");
  return run.stderr + run.stdout;
}

test("community mode rejects unexpected sidecars without deleting or replacing them", (t) => {
  const dir = fixture(t, ["versions.json", "node_modules/", "fonts/"]);
  const before = fs.readFileSync(path.join(dir, "main.js"), "utf8");
  const output = verify(["--community-only"], dir);
  assert.match(output, /Community Directory install must contain exactly/);
  assert.match(output, /unexpected:/);
  assert.match(output, /versions\.json/);
  assert.match(output, /node_modules/);
  assert.match(output, /fonts/);
  assert.equal(fs.readFileSync(path.join(dir, "main.js"), "utf8"), before);
  assert.equal(fs.readFileSync(path.join(dir, "fonts", "sentinel"), "utf8"), "do not delete");
  assert.equal(fs.readFileSync(path.join(dir, "node_modules", "sentinel"), "utf8"), "do not delete");
});

test("community mode accepts exactly three files without overwriting a supplied install", (t) => {
  const dir = fixture(t);
  const output = verify(["--community-only"], dir);
  assert.match(output, /no default export/);
  assert.doesNotMatch(output, /Community Directory install must contain exactly/);
  for (const [name, contents] of Object.entries(files)) {
    assert.equal(fs.readFileSync(path.join(dir, name), "utf8"), contents);
  }
  assert.deepEqual(fs.readdirSync(dir).sort(), Object.keys(files).sort());
});

test("community mode rejects a missing official file", (t) => {
  const dir = fixture(t);
  fs.rmSync(path.join(dir, "styles.css"));
  const output = verify(["--community-only"], dir);
  assert.match(output, /missing: styles\.css/);
  assert.equal(fs.existsSync(path.join(dir, "styles.css")), false);
});

test("side-loaded mode preserves a supplied vault and its sidecars", (t) => {
  const dir = fixture(t, ["node_modules/", "fonts/", "versions.json"]);
  const output = verify([], dir);
  assert.match(output, /no default export/);
  assert.equal(fs.readFileSync(path.join(dir, "main.js"), "utf8"), files["main.js"]);
  assert.equal(fs.readFileSync(path.join(dir, "versions.json"), "utf8"), "do not overwrite");
  assert.equal(fs.readFileSync(path.join(dir, "fonts", "sentinel"), "utf8"), "do not delete");
  assert.equal(fs.readFileSync(path.join(dir, "node_modules", "sentinel"), "utf8"), "do not delete");
});

test("synthetic plugin smoke removes generated intermediates from its private temp directory", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-plugin-temp-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [verifier, "--community-only"], {
    encoding: "utf8", timeout: 60000,
    env: { ...process.env, TMPDIR: dir, TMP: dir, TEMP: dir },
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.deepEqual(fs.readdirSync(dir), [], "synthetic plugin and rendered intermediates must be removed");
});
