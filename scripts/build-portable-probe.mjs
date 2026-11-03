#!/usr/bin/env node
// Internal POSIX portability probe, not an installer or release pipeline.
// Accept an operator-supplied Node runtime; this script does not authenticate it.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!["--runtime", "--runtime-license", "--out"].includes(args[i]) || !args[i + 1] || options[args[i]]) {
    throw new Error("Usage: node scripts/build-portable-probe.mjs --runtime <node> --runtime-license <file> --out <new-directory>");
  }
  options[args[i]] = path.resolve(args[i + 1]);
}
if (!options["--runtime"] || !options["--runtime-license"] || !options["--out"]) throw new Error("All three arguments are required");
if (process.platform === "win32") throw new Error("This prototype currently supports POSIX hosts only");
const runtime = fs.realpathSync(options["--runtime"]), license = fs.realpathSync(options["--runtime-license"]);
const output = options["--out"];
if (fs.existsSync(output)) throw new Error("Output already exists; choose a new directory");
if (!fs.statSync(runtime).isFile() || !fs.statSync(license).isFile()) throw new Error("Runtime and license must be files");
const runtimeCheck = spawnSync(runtime, ["-p", "JSON.stringify({platform:process.platform,arch:process.arch,version:process.versions.node})"], { encoding: "utf8" });
if (runtimeCheck.status !== 0) throw new Error("Cannot execute the supplied Node runtime");
const info = JSON.parse(runtimeCheck.stdout);
if (info.platform !== process.platform || info.arch !== process.arch || Number(info.version.split(".")[0]) < 22) {
  throw new Error("Runtime must match the host platform and architecture and be Node 22 or newer");
}
fs.mkdirSync(output, { recursive: false, mode: 0o755 });
const app = path.join(output, "app");
const result = spawnSync("pnpm", ["--filter", "@turlamai/publy", "--prod", "deploy", "--legacy", app], { cwd: root, stdio: "inherit" });
if (result.status !== 0) throw new Error("Dependency deployment failed; inspect the new output directory before removing it");
// pnpm legacy deploy may add a self-reference into the source checkout.
// Remove only that exact expected link; reject every other external link.
const self = path.join(app, "node_modules", ".pnpm", "node_modules", "@turlamai", "publy");
if (fs.existsSync(self) && fs.lstatSync(self).isSymbolicLink() && fs.realpathSync(self) === fs.realpathSync(path.join(root, "packages", "cli"))) fs.unlinkSync(self);
function checkLinks(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      const resolved = fs.realpathSync(name);
      const relative = path.relative(app, resolved);
      if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) throw new Error("Dependency link escapes the package");
    } else if (entry.isDirectory()) checkLinks(name);
  }
}
checkLinks(app);
fs.mkdirSync(path.join(output, "runtime"));
fs.copyFileSync(runtime, path.join(output, "runtime", "node"));
fs.chmodSync(path.join(output, "runtime", "node"), 0o755);
fs.copyFileSync(license, path.join(output, "runtime", "LICENSE"));
fs.copyFileSync(path.join(root, "LICENSE"), path.join(output, "LICENSE"));
fs.writeFileSync(path.join(output, "publy"), '#!/bin/sh\nset -eu\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$HERE/runtime/node" "$HERE/app/dist/index.js" "$@"\n', { mode: 0o755 });
const hash = crypto.createHash("sha256").update(fs.readFileSync(runtime)).digest("hex");
fs.writeFileSync(path.join(output, "PROBE.json"), JSON.stringify({ status: "development-only", node: info, runtimeSha256: hash }, null, 2) + "\n");
console.log("Built development-only probe:", output);
