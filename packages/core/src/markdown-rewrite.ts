import MarkdownIt from "markdown-it";

// Ask the Markdown parser which lines are actually code blocks: a four-space
// line continuing a paragraph is not necessarily an indented code block.
const markdownBlocks = new MarkdownIt();
export function rewriteOutsideCode(source: string, rewrite: (text: string) => string): string {
  const lines = source.split(/(?<=\n)/);
  const protectedLines = new Set<number>();
  const inlineStarts = new Set<number>(), inlineEnds = new Set<number>();
  for (const token of markdownBlocks.parse(source, {})) {
    if (token.type === "inline" && token.map) {
      inlineStarts.add(token.map[0]);
      inlineEnds.add(token.map[1]);
    }
    if ((token.type === "fence" || token.type === "code_block") && token.map) {
      for (let line = token.map[0]; line < token.map[1]; line++) protectedLines.add(line);
    }
  }
  const inline = (text: string): string => {
    const ticks = /`+/g;
    let cursor = 0, out = "", opener: RegExpExecArray | null;
    while ((opener = ticks.exec(text)) !== null) {
      let slashCount = 0;
      for (let i = opener.index - 1; i >= 0 && text[i] === "\\"; i--) slashCount++;
      if (slashCount % 2) continue;
      const search = /`+/g;
      search.lastIndex = ticks.lastIndex;
      let closing: RegExpExecArray | null;
      do { closing = search.exec(text); } while (closing && closing[0].length !== opener[0].length);
      if (!closing) continue;
      const end = closing.index + closing[0].length;
      out += rewrite(text.slice(cursor, opener.index)) + text.slice(opener.index, end);
      cursor = end;
      ticks.lastIndex = end;
    }
    return out + rewrite(text.slice(cursor));
  };
  let plain = "", result = "";
  const flush = () => { if (plain) { result += inline(plain); plain = ""; } };
  lines.forEach((line, index) => {
    if (inlineStarts.has(index)) flush();
    if (protectedLines.has(index) || /^\s*$/.test(line)) { flush(); result += line; }
    else plain += line;
    if (inlineEnds.has(index + 1)) flush();
  });
  flush();
  return result;
}

