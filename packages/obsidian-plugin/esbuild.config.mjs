// Bundle the Obsidian plugin. @publy/core + @publy/shared are inlined.
//
// Obsidian evaluates plugin bundles with a synthetic module context
// (module.filename = null, __dirname inside electron.asar), so NO package
// require can ever resolve there — top-level or relative, bare or redirected.
// Therefore: the plugin must never statically import a wasm glue package.
//   - @resvg/resvg-wasm is loaded at runtime by src/main.ts via
//     createRequire(manifest.dir); a static import fails the build.
//   - harfbuzzjs is imported by satori itself at bundle-eval time, so it gets
//     a shim whose `default` getter is a promise bridge; main.ts arms the
//     bridge with the real module once the plugin dir is known.
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// ship bundled GB2312 font subsets beside main.js (card rendering, offline)
fs.rmSync(path.join(here, "dist", "fonts"), { recursive: true, force: true });
fs.cpSync(path.join(here, "..", "core", "fonts"), path.join(here, "dist", "fonts"), { recursive: true });
for (const f of ["manifest.json", "versions.json", "styles.css"]) fs.copyFileSync(path.join(here, f), path.join(here, "dist", f));

// wasm glue packages beside main.js (dereference: pnpm links must land as
// real files — a symlinked node_modules breaks any machine but this one):
//   @resvg/resvg-wasm (PNG renderer glue + index_bg.wasm)
//   harfbuzzjs        (satori text-shaping glue + hb.wasm)
const nm = path.join(here, "dist", "node_modules");
fs.rmSync(nm, { recursive: true, force: true });
fs.mkdirSync(nm, { recursive: true });
for (const pkg of ["@resvg/resvg-wasm", "harfbuzzjs"]) {
  fs.cpSync(path.join(here, "node_modules", pkg), path.join(nm, pkg), { recursive: true, dereference: true });
}
// mathjax-full rides along for TeX formulas (loaded at runtime by core's
// math.ts via createRequire). The npm package is ~30MB of sources, tests and
// bundled demos — ship only the runtime subtree the TeX→SVG chain touches.
{
  // mathjax-full is a dependency of @publy/core — under pnpm's strict layout
  // it resolves from core's node_modules, not the plugin package's
  const mjSrc = path.join(here, "..", "core", "node_modules", "mathjax-full");
  const mjDst = path.join(nm, "mathjax-full");
  fs.rmSync(mjDst, { recursive: true, force: true });
  fs.mkdirSync(mjDst, { recursive: true });
  fs.copyFileSync(path.join(mjSrc, "package.json"), path.join(mjDst, "package.json"));
  fs.cpSync(path.join(mjSrc, "js"), path.join(mjDst, "js"), { recursive: true, dereference: true });
  for (const junk of ["components", "demos", "ts", "mathjax.json", "README.md"]) {
    fs.rmSync(path.join(mjDst, "js", junk), { recursive: true, force: true });
  }
  // bundle tests live beside the sources
  for (const entry of fs.readdirSync(mjDst, { recursive: true })) {
    if (String(entry).endsWith(".d.ts")) fs.rmSync(path.join(mjDst, String(entry)));
  }
}
// harfbuzzjs ships the full harfbuzz C++ tree; only the emscripten glue is
// needed at runtime — prune the rest to keep the plugin package lean.
const hbDir = path.join(nm, "harfbuzzjs");
for (const entry of fs.readdirSync(hbDir)) {
  if (!["index.js", "hb.js", "hbjs.js", "hb.wasm", "hb-subset.wasm", "package.json", "LICENSE", "README.md"].includes(entry)) {
    fs.rmSync(path.join(hbDir, entry), { recursive: true, force: true });
  }
}

const wasmExternals = {
  name: "publy-wasm-externals",
  setup(build) {
    // banned: a static import would emit a require that cannot resolve in
    // Obsidian's loader and hard-fail plugin load
    build.onResolve({ filter: /^@resvg\/resvg-wasm(\/.*)?$/ }, (args) => {
      if (args.path.endsWith(".wasm")) return { path: args.path, external: true };
      throw new Error(
        "static import of @resvg/resvg-wasm is banned in the plugin — use loadPluginModule(pluginDir, ...) from src/main.ts",
      );
    });
    // satori's own import: swap in a bridge shim instead of a real require.
    // The exports are a THENABLE — whatever interop esbuild applies, an
    // `await` of it always forwards to the bridge promise, which main.ts arms
    // with the real module once the plugin dir is known.
    build.onResolve({ filter: /^harfbuzzjs$/ }, () => ({ path: "harfbuzzjs-bridge", namespace: "publy-shim" }));
    build.onLoad({ filter: /^harfbuzzjs-bridge$/, namespace: "publy-shim" }, () => ({
      loader: "js",
      contents: `
var bridge = null;
function getBridge() {
  return bridge || (bridge = Promise.reject(new Error("publy: harfbuzzjs bridge not armed — plugin dir unknown")));
}
if (typeof globalThis !== "undefined") {
  globalThis.__publyHarfbuzzBridge = function (p) { bridge = p; };
}
module.exports = {
  then: function (onF, onR) { return getBridge().then(onF, onR); },
  catch: function (onR) { return getBridge().catch(onR); },
  finally: function (f) { return getBridge().finally(f); },
};
`,
    }));
  },
};

await esbuild.build({
  entryPoints: [path.join(here, "src", "main.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "es2022",
  outfile: path.join(here, "dist", "main.js"),
  sourcemap: false,
  external: ["obsidian", "electron", "@resvg/resvg-js", "@resvg/resvg-wasm", "harfbuzzjs"],
  plugins: [wasmExternals],
  // Binary loader inlines CJK subset font bytes into main.js. Obsidian's
  // Community Directory installs only the official three files.
  loader: { ".css": "text", ".otf": "binary" },
  logLevel: "info",
});
