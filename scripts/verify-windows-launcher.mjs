// Exercise actual Windows process argument handling with an isolated fake CLI.
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (process.platform !== "win32" || !process.argv[2]) throw new Error("Windows launcher path required");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-launcher-test-"));
try {
  fs.mkdirSync(path.join(dir, "runtime"));
  fs.mkdirSync(path.join(dir, "app", "dist"), { recursive: true });
  const launcher = path.join(dir, "publy.exe");
  fs.copyFileSync(process.argv[2], launcher);
  fs.copyFileSync(process.execPath, path.join(dir, "runtime", "node.exe"));
  const cli = path.join(dir, "app", "dist", "index.js");
  fs.writeFileSync(cli, "process.stdout.write(JSON.stringify(process.argv.slice(2)))\n");
  const args = ["", "with spaces", "test & source.md", "percent%caret^", 'quote"and\\slashes\\', "中文 文件.md"];
  const result = spawnSync(launcher, args, { encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), args);
  fs.writeFileSync(cli, "process.exit(37)\n");
  assert.equal(spawnSync(launcher, [], { shell: false }).status, 37);
  console.log("PASS — Windows launcher preserves arguments and child exit status without a shell");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
