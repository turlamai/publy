// Development workbench bundle; no public deployment or native installer yet.
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const require=createRequire(path.join(root,"packages/obsidian-plugin/package.json"));
const {build}=require("esbuild");
const src=path.join(root,"packages/workbench/src");
const out=path.join(root,"packages/workbench/dist");
await fs.mkdir(out,{recursive:true});
// HarfBuzz's default Node entry fetches its WASM by filename in a browser.
// Embed the existing package binary so cards also work offline in Glaze.
const coreRequire=createRequire(path.join(root,"packages/core/package.json"));
const satoriRequire=createRequire(coreRequire.resolve("satori"));
const hbDir=path.dirname(satoriRequire.resolve("harfbuzzjs"));
const bundledHarfBuzz={
 name:"bundled-harfbuzz",
 setup(build){
  build.onResolve({filter:/^harfbuzzjs$/},()=>({path:hbDir,namespace:"local-harfbuzz"}));
  build.onLoad({filter:/.*/,namespace:"local-harfbuzz"},()=>({
   contents:`import wasm from "./hb.wasm";
    import load from "./hb.js";
    import wrap from "./hbjs.js";
    export default load({wasmBinary:wasm}).then(wrap);`,
   resolveDir:hbDir
  }));
  // This branch in the generated Emscripten loader runs only in Node.
  build.onResolve({filter:/^fs$/},args=>args.importer===path.join(hbDir,"hb.js")?{path:"fs",external:true}:null);
 }
};
const bundle={bundle:true,platform:"browser",format:"iife",logLevel:"warning",minify:true};
await Promise.all([
 build({...bundle,entryPoints:[path.join(src,"workbench.mjs")],
  loader:{".css":"text"},outfile:path.join(out,"workbench.js")}),
 build({...bundle,entryPoints:[path.join(root,"packages/core/src/math-browser.ts")],
  globalName:"PublyMath",outfile:path.join(out,"workbench-math.js")}),
 build({...bundle,entryPoints:[path.join(src,"card-rasterizer.mjs")],
  nodePaths:[path.join(root,"packages/core/node_modules")],loader:{".otf":"binary",".wasm":"binary"},
  plugins:[bundledHarfBuzz],globalName:"PublyCards",outfile:path.join(out,"workbench-cards.js")})
]);
for(const name of ["index.html","workbench.css"])await fs.copyFile(path.join(src,name),path.join(out,name));
const desktop=path.join(root,"packages/workbench/dist-desktop");
await fs.mkdir(desktop,{recursive:true});
for(const name of ["workbench.js","workbench.css","workbench-math.js","workbench-cards.js"])await fs.copyFile(path.join(out,name),path.join(desktop,name));
const html=await fs.readFile(path.join(out,"index.html"),"utf8");
await fs.writeFile(path.join(desktop,"index.html"),html
 .replace("<html ","<html data-desktop ")
 .replace("connect-src https://publy-api.jrtx.site","connect-src 'none'")
 .replace('<script src="workbench.js" defer>', '<script src="/glaze/api.js" defer></script><script src="workbench.js" defer>'));
console.log("Development workbench built:",out);
