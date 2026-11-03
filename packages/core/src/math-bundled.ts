// Optional static entry point for self-contained hosts. The CLI keeps the
// lazy package loader in math.ts and does not import this module.
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { LiteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { setMathModuleLoader } from "./math.js";

export function configureBundledMath(): void {
  const modules: Record<string, unknown> = {
    "mathjax-full/js/mathjax.js": { mathjax },
    "mathjax-full/js/input/tex.js": { TeX },
    "mathjax-full/js/output/svg.js": { SVG },
    "mathjax-full/js/adaptors/liteAdaptor.js": { LiteAdaptor },
    "mathjax-full/js/handlers/html.js": { RegisterHTMLHandler },
    "mathjax-full/js/input/tex/AllPackages.js": { AllPackages },
  };
  setMathModuleLoader((id) => {
    if (!(id in modules)) throw new Error(`Math module not bundled: ${id}`);
    return modules[id];
  });
}
