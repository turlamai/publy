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
await build({entryPoints:[path.join(src,"workbench.mjs")],bundle:true,platform:"browser",format:"iife",loader:{".css":"text"},outfile:path.join(out,"workbench.js"),logLevel:"warning"});
for(const name of ["index.html","workbench.css"])await fs.copyFile(path.join(src,name),path.join(out,name));
console.log("Development workbench built:",out);
