// Convert a restricted, local TeX expression to self-contained glyph outlines.
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const output = new SVG({ fontCache: "none" });

export function browserMathSvg(tex: string, display: boolean): { svg: string; width: number; height: number; valign: number } {
  // ASCII escape commands that load packages or inject links are unavailable.
  // A new input jax prevents macros and equation labels leaking between notes.
  const input = new TeX({ packages: ["base", "ams"], maxBuffer: 2048, maxMacros: 500 });
  const doc = mathjax.document("", { InputJax: input, OutputJax: output });
  const html = adaptor.outerHTML(doc.convert(tex, { display }));
  const svg = /<svg[\s\S]*<\/svg>/.exec(html)?.[0];
  const width = 8 * Number(svg?.match(/\bwidth="([\d.]+)ex"/)?.[1]);
  const height = 8 * Number(svg?.match(/\bheight="([\d.]+)ex"/)?.[1]);
  const valign = 8 * Number(svg?.match(/vertical-align:\s*(-?[\d.]+)ex/)?.[1] ?? 0);
  if (!svg || /data-mjx-error=/.test(svg) || !(width > 0 && width <= 2048 && height > 0 && height <= 1024)) {
    throw new Error("FORMULA_UNSUPPORTED");
  }
  return { svg: svg.replace(/\bwidth="[\d.]+ex"/, `width="${width}"`)
                    .replace(/\bheight="[\d.]+ex"/, `height="${height}"`), width, height, valign };
}
