// Math formulas: TeX → SVG (MathJax) → PNG attachment.
//
// The WeChat editor strips <style> tags and knows nothing of KaTeX/MathJax
// webfonts, so HTML/CSS formula output would paste as unstyled soup. Images
// are the only carrier that survives a paste. MathJax's SVG output bakes the
// glyph outlines into the markup as paths (fontCache: none keeps each SVG
// self-contained), and our PNG seam rasterizes it — the result rides the
// regular attachment pipeline like any other image.
//
// mathjax-full is loaded through createRequire at first use, so embedded
// environments that don't ship the package (older plugin bundles) degrade to
// showing the raw TeX instead of crashing the render.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { injectWhiteBackground } from "./svg.js";
import { getPngRenderer } from "./png.js";

export interface MathImage {
  png: Buffer;
  /** css width in px at 1x — the <img> carries this inline */
  widthPx: number;
  /** css vertical-align offset in px (negative sinks below the baseline) */
  valignPx: number;
}

interface SvgChain {
  convert(tex: string, display: boolean): { svg: string; widthEx: number; valignEx: number };
}

// undefined = not tried yet, null = mathjax-full unavailable
let chain: SvgChain | null | undefined = undefined;
let moduleLoader: ((id: string) => any) | null = null;

/** Supply statically bundled MathJax modules in hosts without package loading. */
export function setMathModuleLoader(loader: (id: string) => any): void {
  moduleLoader = loader;
  chain = undefined;
}

/** require relative to this module — same pattern as png.ts (ESM real path,
 *  esbuild-cjs __dirname fallback). */
function nodeRequire(): NodeRequire | null {
  try {
    return createRequire(fileURLToPath(import.meta.url));
  } catch {
    try {
      if (typeof __dirname !== "undefined") return createRequire(__dirname);
    } catch {
      /* fall through */
    }
    return null;
  }
}

function loadChain(): SvgChain | null {
  if (chain !== undefined) return chain;
  chain = null;
  try {
    const req = moduleLoader ?? nodeRequire();
    if (!req) return chain;
    const { mathjax } = req("mathjax-full/js/mathjax.js");
    const { TeX } = req("mathjax-full/js/input/tex.js");
    const { SVG } = req("mathjax-full/js/output/svg.js");
    const { LiteAdaptor } = req("mathjax-full/js/adaptors/liteAdaptor.js");
    const { RegisterHTMLHandler } = req("mathjax-full/js/handlers/html.js");
    const { AllPackages } = req("mathjax-full/js/input/tex/AllPackages.js");
    const adaptor = new LiteAdaptor();
    RegisterHTMLHandler(adaptor);
    const input = new TeX({ packages: AllPackages });
    const output = new SVG({ fontCache: "none" });
    // Document-class option names (InputJax/OutputJax) — the {InputTeX:...}
    // shorthand seen in some demos is rejected by the options validator in
    // mathjax-full@3.2.2 and silently drops both jax.
    const doc = mathjax.document("", { InputJax: input, OutputJax: output });
    chain = {
      convert(tex: string, display: boolean) {
        const node = doc.convert(tex, { display });
        const html = adaptor.outerHTML(node);
        // the handler wraps the output in <mjx-container> — rasterizers want
        // the bare <svg> element
        const svg = /<svg[\s\S]*<\/svg>/.exec(html)?.[0] ?? "";
        // MathJax renders TeX errors as visible merror boxes instead of
        // throwing — surface them so the caller falls back to raw TeX
        const texError = /data-mjx-error="([^"]*)"/.exec(svg)?.[1];
        if (texError) throw new Error(texError);
        const widthEx = parseFloat(/width="([\d.]+)ex"/.exec(svg)?.[1] ?? "0");
        const valignEx = parseFloat(/vertical-align:\s*(-?[\d.]+)ex/.exec(svg)?.[1] ?? "0");
        if (!svg || !Number.isFinite(widthEx) || widthEx <= 0) throw new Error("svg has no usable width");
        return { svg, widthEx, valignEx: Number.isFinite(valignEx) ? valignEx : 0 };
      },
    };
  } catch {
    chain = null;
  }
  return chain;
}

// MathJax assumes a 16px base font: 1ex = 8px. Rendered @2x so the PNG stays
// crisp after WeChat's recompression.
const EX_PX = 8;
const SCALE = 2;

/** TeX → PNG, or null when mathjax-full is missing or the TeX fails to parse
 *  (the caller warns and falls back to showing the raw TeX). */
export function texToPng(tex: string, display: boolean): MathImage | null {
  const c = loadChain();
  if (!c) return null;
  try {
    const { svg, widthEx, valignEx } = c.convert(tex, display);
    const widthPx = Math.round(widthEx * EX_PX * 100) / 100;
    const png = getPngRenderer()(injectWhiteBackground(svg), Math.max(2, Math.round(widthPx * SCALE)));
    return { png, widthPx, valignPx: Math.round(valignEx * EX_PX * 100) / 100 };
  } catch {
    return null;
  }
}
