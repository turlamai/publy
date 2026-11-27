import { parseSource, type SourceMeta, type PublicationOptions } from "./frontmatter.js";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1440; // 3:4

export type CardSectionKind = "cover" | "point" | "list" | "ending";

export interface CardSection {
  kind: CardSectionKind;
  lines: string[];
}

export interface CardPalette {
  id: string;
  colors: {
    bg: string;
    text: string;
    muted: string;
    accent: string;
    accentSoft: string;
    rule: string;
  };
  /** subtle top-left label, e.g. a series name; empty disables */
  watermark?: string;
}

type Style = Record<string, string | number>;
interface El {
  type: string;
  props: { style?: Style; children?: El | string | (El | string)[] | null };
}
// Satori requires every div whose children are not a plain string to declare
// display:flex — pass strings for text leaves, null for empty containers.
const h = (type: string, style: Style, children: El | string | (El | string)[] | null = null): El => ({
  type,
  props: { style, children },
});

// ---------------------------------------------------------------------------
// built-in themes

export const CARD_PALETTES: Record<string, CardPalette> = {
  naive: {
    id: "naive",
    colors: { bg: "#ffffff", text: "#1a1a1a", muted: "#888888", accent: "#1a1a1a", accentSoft: "#f2f2f2", rule: "#eaeaea" },
  },
  claude: {
    id: "claude",
    colors: { bg: "#f8f6f0", text: "#2b2b2b", muted: "#6b6b6b", accent: "#b75c3d", accentSoft: "rgba(183, 92, 61, 0.08)", rule: "#e0ddd6" },
  },
  wechat: {
    id: "wechat",
    colors: { bg: "#ffffff", text: "#1a1a1a", muted: "#888888", accent: "#07C160", accentSoft: "rgba(7, 193, 96, 0.10)", rule: "#07C160" },
  },
  midnight: {
    id: "midnight",
    colors: { bg: "#0d1117", text: "#e6edf3", muted: "#8b949e", accent: "#7ee787", accentSoft: "rgba(126, 231, 135, 0.12)", rule: "#30363d" },
  },
};

// ---------------------------------------------------------------------------
// source parsing

export interface ParsedCards {
  meta: SourceMeta;
  sections: CardSection[];
  caption: string;
}

const SECTION_RE = /^##\s*(cover|point|list|ending)\s*$/m;

export function parseCardSource(raw: string, opts: PublicationOptions = {}): ParsedCards {
  const { body } = parseSource(raw);
  const meta: SourceMeta = { title: opts.title, theme: opts.theme, tags: opts.tags };
  const sections: CardSection[] = [];
  const rest = body;
  let match: RegExpExecArray | null;
  const pattern = new RegExp(SECTION_RE.source, "gm");
  const marks: { kind: CardSectionKind; start: number; end: number }[] = [];
  while ((match = pattern.exec(rest)) !== null) {
    marks.push({ kind: match[1] as CardSectionKind, start: match.index, end: pattern.lastIndex });
  }
  if (marks.length === 0) {
    throw new Error("No card sections found. Add `## cover` / `## point` / `## list` / `## ending` sections.");
  }
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : rest.length;
    const lines = rest
      .slice(marks[i].end, end)
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    sections.push({ kind: marks[i].kind, lines });
  }
  const caption = (opts.caption ?? body.slice(0, marks[0].start)).trim();
  return { meta, sections, caption };
}

// ---------------------------------------------------------------------------
// rendering

export function cardElement(theme: CardPalette, section: CardSection, index: number, total: number): El {
  const c = theme.colors;
  const page: El = h("div", { position: "absolute", bottom: 44, right: 72, fontSize: 28, color: c.muted }, `${index + 1} / ${total}`);
  const watermark: El[] = theme.watermark
    ? [h("div", { position: "absolute", top: 56, left: 72, fontSize: 26, color: c.muted, letterSpacing: 2 }, theme.watermark)]
    : [];

  const base: Style = {
    width: `${CARD_WIDTH}px`,
    height: `${CARD_HEIGHT}px`,
    display: "flex",
    flexDirection: "column",
    backgroundColor: c.bg,
    padding: "120px 88px",
    position: "relative",
  };

  const children: El[] = [];
  switch (section.kind) {
    case "cover": {
      const [title, ...subs] = section.lines;
      children.push(
        h("div", { display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", flex: 1 }, [
          h("div", { fontSize: 92, fontWeight: 700, color: c.text, lineHeight: 1.25 }, title ?? ""),
          ...(subs.length
            ? [h("div", { display: "flex", flexDirection: "column", marginTop: 36, fontSize: 42, color: c.muted, lineHeight: 1.6 }, subs)]
            : []),
        ]),
        h("div", { width: 120, height: 10, backgroundColor: c.accent, borderRadius: 6, marginBottom: 40 }),
      );
      break;
    }
    case "point": {
      const [heading, ...paras] = section.lines;
      children.push(
        h("div", { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }, [
          h("div", { display: "flex", flexDirection: "row", alignItems: "center", marginBottom: 36 }, [
            h("div", { width: 14, height: 44, backgroundColor: c.accent, borderRadius: 7, marginRight: 24 }),
            h("div", { fontSize: 64, fontWeight: 700, color: c.text, lineHeight: 1.3 }, heading ?? ""),
          ]),
          ...paras.map((p) =>
            h("div", { display: "flex", flexDirection: "column", fontSize: 42, color: c.text, lineHeight: 1.7, marginTop: 24, opacity: 0.92 }, p),
          ),
        ]),
      );
      break;
    }
    case "list": {
      const items = section.lines.slice(0, 8);
      children.push(
        h("div", { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: 34 }, items.map((item, i) =>
          h("div", { display: "flex", flexDirection: "row", alignItems: "flex-start" }, [
            h("div", {
              minWidth: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: c.accentSoft,
              color: c.accent,
              fontSize: 30,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 28,
            }, String(i + 1)),
            h("div", { display: "flex", flexDirection: "column", fontSize: 42, color: c.text, lineHeight: 1.55, flex: 1 }, item.replace(/^[-*]\s*/, "")),
          ]),
        )),
      );
      break;
    }
    case "ending": {
      const [cta, ...rest] = section.lines;
      children.push(
        h("div", { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center" }, [
          h("div", { fontSize: 60, fontWeight: 700, color: c.accent, textAlign: "center", lineHeight: 1.4 }, cta ?? ""),
          ...(rest.length
            ? [h("div", { display: "flex", flexDirection: "column", marginTop: 40, fontSize: 38, color: c.muted, textAlign: "center", lineHeight: 1.7 }, rest)]
            : []),
          h("div", { marginTop: 72, width: 80, height: 8, backgroundColor: c.rule, borderRadius: 4 }),
        ]),
      );
      break;
    }
  }

  return h("div", base, [...watermark, ...children, page]);
}

export interface LintResult {
  ok: boolean;
  problems: string[];
}

export function lintCards(sections: CardSection[], caption: string): LintResult {
  const problems: string[] = [];
  if (sections.length < 3 || sections.length > 9) {
    problems.push(`图片数量须为 3–9 张，当前 ${sections.length} 张`);
  }
  if (caption.length > 1000) {
    problems.push(`caption 超过微信 1000 字上限（当前 ${caption.length} 字）`);
  }
  if (caption.length === 0) {
    problems.push("配文为空：通过 --caption、--caption-file 或本次投递窗口填写配文");
  }
  if (!sections.some((s) => s.kind === "cover")) {
    problems.push("缺少 cover 封面卡");
  }
  if (!sections.some((s) => s.kind === "ending")) {
    problems.push("缺少 ending 结尾互动卡");
  }
  return { ok: problems.length === 0, problems };
}

