#!/usr/bin/env node
// Internal portability probe, not an installer or release pipeline.
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
  if (!["--runtime", "--runtime-license", "--out", "--pnpm-entry"].includes(args[i]) || !args[i + 1] || options[args[i]]) {
    throw new Error("Usage: node scripts/build-portable-probe.mjs --runtime <node> --runtime-license <file> --out <new-directory> [--pnpm-entry <pnpm.cjs>]");
  }
  options[args[i]] = path.resolve(args[i + 1]);
}
if (!options["--runtime"] || !options["--runtime-license"] || !options["--out"]) throw new Error("All three arguments are required");
if (process.platform === "win32" && !options["--pnpm-entry"]) throw new Error("Windows requires --pnpm-entry pointing to pnpm.cjs");
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
// pnpm computes relative links during deploy; provide a canonical path so
// symlinked ancestors such as /var -> /private/var cannot corrupt them.
const app = path.join(fs.realpathSync(output), "app");
const deployArgs = ["--filter", "@turlamai/publy", "--prod", "deploy", "--legacy", app];
// Invoking pnpm's JavaScript entry avoids shell interpretation of output paths.
const result = options["--pnpm-entry"]
  ? spawnSync(process.execPath, [fs.realpathSync(options["--pnpm-entry"]), ...deployArgs], { cwd: root, stdio: "inherit" })
  : spawnSync("pnpm", deployArgs, { cwd: root, stdio: "inherit" });
if (result.status !== 0) throw new Error("Dependency deployment failed; inspect the new output directory before removing it");
// pnpm may place workspace-index links in its shared virtual-store hub.
// Remove only hub links that resolve exactly to one of this repo's packages;
// reject every other link escaping the portable package.
const workspaceTargets = new Set(fs.readdirSync(path.join(root, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => fs.realpathSync(path.join(root, "packages", entry.name))));
const workspaceHub = path.join(app, "node_modules", ".pnpm", "node_modules");
const realApp = fs.realpathSync(app);
function checkLinks(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      const resolved = fs.realpathSync(name);
      const relative = path.relative(realApp, resolved);
      if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
        const hubRelative = path.relative(workspaceHub, name);
        if (hubRelative && hubRelative !== ".." && !hubRelative.startsWith(".." + path.sep) && !path.isAbsolute(hubRelative) && workspaceTargets.has(resolved)) {
          fs.unlinkSync(name);
        } else {
          throw new Error("Dependency link escapes the package: " + path.relative(app, name));
        }
      }
    } else if (entry.isDirectory()) checkLinks(name);
  }
}
checkLinks(app);
fs.mkdirSync(path.join(output, "runtime"));
const runtimeName = process.platform === "win32" ? "node.exe" : "node";
fs.copyFileSync(runtime, path.join(output, "runtime", runtimeName));
fs.chmodSync(path.join(output, "runtime", runtimeName), 0o755);
const copiedRuntimeCheck = spawnSync(path.join(output, "runtime", runtimeName), ["-p", "process.versions.node"], { encoding: "utf8" });
if (copiedRuntimeCheck.status !== 0 || copiedRuntimeCheck.stdout.trim() !== info.version) {
  throw new Error("Copied runtime cannot run independently; supply a self-contained Node distribution");
}
fs.copyFileSync(license, path.join(output, "runtime", "LICENSE"));
fs.copyFileSync(path.join(root, "LICENSE"), path.join(output, "LICENSE"));
if (process.platform === "win32") {
  // Build a native console launcher; forwarding through cmd.exe can interpret
  // metacharacters, while a .ps1 is blocked by the default execution policy.
  const compiler = path.join(process.env.SystemRoot ?? "C:\\Windows", "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe");
  const launcher = spawnSync(compiler, ["/nologo", "/target:exe", "/out:" + path.join(output, "publy.exe"),
    path.join(root, "scripts", "windows-launcher.cs")], { encoding: "utf8" });
  if (launcher.status !== 0) throw new Error("Windows launcher compilation failed: " + (launcher.stderr || launcher.stdout).slice(0, 1000));
} else {
  fs.writeFileSync(path.join(output, "publy"), '#!/bin/sh\nset -eu\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$HERE/runtime/node" "$HERE/app/dist/index.js" "$@"\n', { mode: 0o755 });
}
const hash = crypto.createHash("sha256").update(fs.readFileSync(runtime)).digest("hex");
fs.writeFileSync(path.join(output, "PROBE.json"), JSON.stringify({ status: "development-only", node: info, runtimeSha256: hash }, null, 2) + "\n");
console.log("Built development-only probe:", output);
