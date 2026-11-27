// Resolve the built-in theme variables without filesystem access.
export function resolveVars(css: string): string {
  // strip comments first: a trailing comment line would otherwise swallow the
  // first variable that follows it (bit both claude and medium backgrounds)
  const vars = new Map<string, string>();
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rootMatch = clean.match(/:root\s*{([^}]*)}/);
  if (rootMatch) {
    for (const line of rootMatch[1].split(";")) {
      const m = line.trim().match(/^(--[\w-]+)\s*:\s*(.+)$/);
      if (m) vars.set(m[1], m[2].trim());
    }
  }
  let out = css;
  // resolve simple var(--x) references (no fallback syntax needed by builtin themes)
  for (const [name, value] of vars) {
    out = out.replaceAll(`var(${name})`, value);
  }
  // drop the :root block entirely
  out = out.replace(/:root\s*{[^}]*}\s*/g, "");
  return out;
}

