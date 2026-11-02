// Community installs fetch only main.js, manifest.json and styles.css.
// Bundle renderer glue, WASM, MathJax and font bytes; only host APIs and
// Node builtins may remain external. No runtime package installation.
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "dist");
fs.mkdirSync(dist, { recursive: true });
// Remove obsolete sidecars so a stale build cannot conceal missing imports.
for (const name of ["node_modules", "fonts"]) {
  fs.rmSync(path.join(dist, name), { recursive: true, force: true });
}
for (const name of ["manifest.json", "versions.json", "styles.css"]) {
  fs.copyFileSync(path.join(here, name), path.join(dist, name));
}

const embeddedHarfBuzz = {
  name: "publy-embedded-harfbuzz",
  setup(build) {
    build.onResolve({ filter: /^harfbuzzjs$/ }, () => ({ path: "harfbuzz", namespace: "publy-embedded" }));
    build.onLoad({ filter: /^harfbuzz$/, namespace: "publy-embedded" }, () => {
      const hb = path.join(here, "node_modules", "harfbuzzjs");
      return {
        loader: "js",
        resolveDir: here,
        // Preserve the package's Promise export expected by Satori. Explicit
        // wasmBinary bypasses Emscripten's filesystem/fetch fallback in both
        // Node and Electron's renderer environment.
        contents: `
const createHarfBuzz = require(${JSON.stringify(path.join(hb, "hb.js"))});
const wrapHarfBuzz = require(${JSON.stringify(path.join(hb, "hbjs.js"))});
const binary = require(${JSON.stringify(path.join(hb, "hb.wasm"))});
module.exports = createHarfBuzz({ wasmBinary: binary.default ?? binary }).then(wrapHarfBuzz);
`,
      };
    });
  },
};

await esbuild.build({
  entryPoints: [path.join(here, "src", "main.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "es2022",
  outfile: path.join(dist, "main.js"),
  sourcemap: false,
  external: ["obsidian", "electron", "@resvg/resvg-js"],
  plugins: [embeddedHarfBuzz],
  loader: { ".css": "text", ".otf": "binary", ".wasm": "binary" },
  legalComments: "inline",
  banner: { js: "/*!\n" + fs.readFileSync(path.join(here, "third-party-notices.txt"), "utf8").replaceAll("*/", "* /") + "\n*/" },
  logLevel: "info",
});
