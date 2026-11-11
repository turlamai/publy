// Bundle the CLI for npm: inline @publy/core and @publy/shared (workspace
// packages that don't exist on npm), keep real runtime deps external.
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// themes + fonts travel with the package so card rendering works offline
fs.rmSync(path.join(here, "themes"), { recursive: true, force: true });
fs.cpSync(path.join(here, "..", "core", "themes"), path.join(here, "themes"), { recursive: true });
fs.rmSync(path.join(here, "fonts"), { recursive: true, force: true });
fs.cpSync(path.join(here, "..", "core", "fonts"), path.join(here, "fonts"), { recursive: true });

await esbuild.build({
  entryPoints: [path.join(here, "src", "index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: path.join(here, "dist", "index.js"),
  sourcemap: false,
  banner: { js: "/*!\n" + fs.readFileSync(path.join(here, "third-party-notices.txt"), "utf8").replaceAll("*/", "* /") + "\n*/" },
  // entry file already starts with #!/usr/bin/env node — no banner needed
  external: [
    "@resvg/resvg-js",
    "satori",
    "commander",
    "highlight.js",
    "juice",
    "cheerio",
    "markdown-it",
    "gray-matter",
    "mathjax-full",
    "mathjax-full/*",
  ],
  logLevel: "info",
});
