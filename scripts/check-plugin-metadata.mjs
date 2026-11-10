// Keep the root Obsidian directory manifest and release metadata in sync
// with the monorepo plugin source. Every versions.json entry must have a
// matching local git tag; this does NOT verify GitHub Release assets,
// true 3-file directory installation, or private Obsidian review status.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const sourceManifest = read("packages/obsidian-plugin/manifest.json");
const directoryManifest = read("manifest.json");
const sourceVersions = read("packages/obsidian-plugin/versions.json");
const directoryVersions = read("versions.json");
const packageInfo = read("packages/obsidian-plugin/package.json");

assert.deepEqual(directoryManifest, sourceManifest, "root manifest.json differs from plugin source");
assert.deepEqual(directoryVersions, sourceVersions, "root versions.json differs from plugin source");
assert.equal(sourceManifest.id, "publy");
assert.equal(sourceManifest.version, packageInfo.version, "plugin package/manifest versions differ");
assert.equal(sourceVersions[sourceManifest.version], sourceManifest.minAppVersion, "missing matching versions.json entry");
assert.equal(sourceManifest.isDesktopOnly, true, "Node/Electron plugin must remain desktop-only");
assert.ok(sourceManifest.description.length > 0 && sourceManifest.description.length <= 250);
assert.ok(sourceManifest.description.endsWith("."));
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  assert.ok(fs.existsSync(path.join(root, "packages/obsidian-plugin/dist", file)), "missing built plugin asset " + file);
}
assert.deepEqual(read("packages/obsidian-plugin/dist/manifest.json"), sourceManifest, "built manifest differs from source");

// Every advertised plugin version must exist as a git tag. CI checkouts
// must run with fetch-depth: 0 so all tags are present. GitHub Release
// consistency stays a manual/pre-release step.
const tags = new Set(
  execFileSync("git", ["tag", "--list"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })
    .split("\n")
    .map((tag) => tag.trim())
    .filter(Boolean),
);
assert.ok(tags.size > 0, "git tag list is empty — fetch tags before running this check");
for (const version of Object.keys(sourceVersions)) {
  assert.ok(tags.has(version), `versions.json entry ${version} has no matching git tag`);
}
console.log("PASS — Obsidian source/root/built manifest and versions consistent (" + sourceManifest.version + "); " + Object.keys(sourceVersions).length + " versions.json entries all have git tags");
