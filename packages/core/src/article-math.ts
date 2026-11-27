import type MarkdownIt from "markdown-it";

export function configureArticleMath(parser: MarkdownIt, render: (tex: string, display: boolean) => string): void {
  function mathInlineRule(state: any, silent: boolean): boolean {
    const src = state.src;
    const pos = state.pos;
    if (src.charCodeAt(pos) !== 0x24 /* $ */) return false;
    // find the closer: a $ with an even number of backslashes before it
    let end = pos + 1;
    for (;;) {
      end = src.indexOf("$", end);
      if (end === -1) return false;
      let bs = 0;
      for (let k = end - 1; src.charCodeAt(k) === 0x5c; k--) bs++;
      if (bs % 2 === 0) break;
      end++;
    }
    const content = src.slice(pos + 1, end);
    if (!content.trim() || /[\n\r]/.test(content)) return false;
    // pandoc-style guard: no unescaped whitespace hugging the delimiters
    if (/^\s|\s$/.test(content)) return false;
    if (!silent) state.push("html_inline", "", 0).content = render(content, false);
    state.pos = end + 1;
    return true;
  }

  function mathBlockRule(state: any, startLine: number, endLine: number, silent: boolean): boolean {
    const startPos = state.bMarks[startLine] + state.tShift[startLine];
    if (state.src.charCodeAt(startPos) !== 0x24 || state.src.charCodeAt(startPos + 1) !== 0x24) return false;
    let pos = startPos + 2;
    let closeLine = startLine;
    let closeIdx = -1;
    while (closeLine < endLine) {
      const lineEnd = state.eMarks[closeLine];
      const rel = state.src.slice(pos, lineEnd).indexOf("$$");
      if (rel !== -1) {
        closeIdx = pos + rel;
        break;
      }
      closeLine++;
      pos = state.bMarks[closeLine] + state.tShift[closeLine];
    }
    if (closeIdx === -1) return false;
    const content = state.src.slice(startPos + 2, closeIdx).trim();
    if (!content) return false;
    if (!silent) {
      state.push("html_block", "", 0).content = render(content, true) + "\n";
    }
    state.line = closeLine + 1;
    return true;
  }

  parser.block.ruler.before("fence", "publy_math_block", mathBlockRule);
  parser.inline.ruler.after("escape", "publy_math_inline", mathInlineRule);
}
