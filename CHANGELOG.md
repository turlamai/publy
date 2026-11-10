# Changelog

All notable changes to Publy are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Versions follow the Obsidian plugin release identity (`manifest.json` +
`versions.json`). CLI releases on npm carry their own `npm-v*` tags and
are listed in their own section. Versions **0.8.4–0.8.6 were never
released**: they have no git tag and no GitHub release, so the jump from
0.8.3 to 0.8.7 is real, not a gap in this file.

## [Unreleased]

## [0.8.7] - 2026-11-08

### Added

- Three-file install closure: cards, TeX, fonts and WASM ship inside
  `main.js`; the official install no longer needs `node_modules/` or
  `fonts/` sidecars. The simulated offline gate passes on Linux, Windows
  and macOS; `SHA256SUMS.txt` covers every release asset.
- Draft recovery: a lost response is never treated as failure — same
  request identity, explicit `confirmed` / `unknown` results, scheduled
  jobs that do not auto-resend ambiguous attempts, and an operator
  reconciliation path backed by a read-only WeChat draft-box check.
- Themes: content-only versioned bundles with scoped CSS validation,
  SHA-256 pinning and optional Ed25519 signatures (`--trusted-key`);
  installed themes appear in settings.
- Agent CLI: every advertised command supports `--json` with declared
  usage, prerequisites and approval requirements.

### Changed

- Markdown is the input, editor-independent: nested media paths, covers,
  Obsidian embeds and explicit article / image-and-caption / card
  selection share one pipeline.
- Safety hardening: preview HTML sanitization, clipboard/embed preflight,
  credential redaction, fail-closed recovery state, type-checked plugin
  build.

### Honest boundaries

- Publy is not yet confirmed as an Obsidian Community Directory listing;
  directory-install acceptance remains tracked in issues #12 and #14.
- Hosted subscription sales are not open; there is no purchase link.

## [0.8.3] - 2026-10-13

### Changed

- One ribbon per plugin: the second (eye) ribbon icon from 0.8.2 is gone.
  The zero-interaction path is the auto-preview on note open setting, and
  `Preview current note` remains a command bindable to a hotkey.

## [0.8.2] - 2026-10-13

### Added

- Eye ribbon icon: one click opens the in-app WeChat preview.
- Auto-preview on note open (off by default): every opened note renders
  its preview by itself.

## [0.8.1] - 2026-10-13

### Fixed

- Community-directory readiness: the cover picker's local-image button no
  longer uses `electron.remote` (banned by Obsidian review rules) — a
  plain `<input type="file">` picker with content-addressed keys,
  behavior unchanged.

### Added

- Plugin author URL and the community submission kit
  (`docs/obsidian-submission.md`).

## [0.8.0] - 2026-10-13

### Added

- The cover dialog now covers every article, including ones without body
  images: the auto title card renders for real (exact card the server
  would generate, rendered offline on the plugin's own wasm seam with
  bundled CJK fonts), and any local image can join the candidates.
- Per-note cover choice memory, including local files (validated by
  existence; moved or deleted files fall back gracefully).

## [0.7.0] - 2026-10-13

### Added

- Math formulas in the plugin: `$…$` inline and `$$…$$` display TeX
  render to crisp WeChat-safe PNGs (mathjax SVG @2x via resvg) through
  the regular attachment pipeline; the mathjax runtime ships inside the
  plugin package, fully offline. Malformed TeX degrades to the raw
  expression with a warning.

## [0.6.0] - 2026-10-12

### Added

- First real design system: `styles.css` with one WeChat-green accent
  token over Obsidian's native CSS variables; publish state machine with
  a colored result strip; mobile-width preview (390px/700px switch);
  toolbar theme quick-switch; Lucide icons; history timeline with
  status-colored nodes; 2.35:1 crop thumbnails in the cover picker.

## [0.5.1] - 2026-10-08

### Changed

- Copy cleanup: failure messages and docs no longer reference tunnels or
  specific network environments. No behavior changes.

## [0.5.0] - 2026-10-08

### Added

- Explicit cover choice: publishing an article with body images opens a
  cover picker (thumbnail grid of every image plus an auto-title-card
  tile); the first image is only the pre-selection and the pick is
  remembered per note. `cover:` frontmatter stays the explicit/agent
  path; the server gained `coverMode:"auto"` so "auto" really means the
  title card.

## [0.4.4] - 2026-10-08

### Changed

- Covers made observable: the success toast now tells you which cover the
  draft got (frontmatter image, first article image, or generated title
  card).

## [0.4.3] - 2026-10-08

### Fixed

- Embedded SVG diagrams rendered as empty boxes: the wasm resvg build
  loads no fonts from file paths, so fonts now load as raw buffers and
  generic families map to the shipped Noto Sans SC subsets; diagram text
  renders in previews and publishes.

## [0.4.2] - 2026-10-08

### Fixed

- Wide tables and long code lines no longer overflow the article column:
  unbreakable tokens wrap the way WeChat does, tables sit in a scroll
  container as a last resort, code blocks scroll internally. Applies to
  all ten themes, preview and published HTML alike.

## [0.4.1] - 2026-10-08

### Fixed

- Local images now display in the preview (in-app and browser): previews
  inline the resolved images directly instead of using attachment refs
  only the publish path resolves.

## [0.4.0] - 2026-10-08

### Added

- Bilingual UI (中文 / English) with an Auto mode following the Obsidian
  UI language; every surface is translated and re-renders immediately.

## [0.3.4] - 2026-10-08

### Fixed

- Live preview always shows the active note: instant re-render on note
  switch, ~0.9s refresh on save, the pane fills itself after an Obsidian
  restart, and non-markdown files don't clobber it.

## [0.3.3] - 2026-10-08

### Changed

- The preview opens like a real WeChat MP article: article header (title,
  account row, "draft preview" pill), system font stack, and the
  WeChat-green primary publish button matching the product's web pages.

## [0.3.2] - 2026-10-08

### Added

- A sticky progress toast spans the whole publish; outcome toasts stay
  readable for 5–8 seconds.

### Fixed

- Double-click protection while a publish is in flight; requests carry an
  idempotency key so the server's 10-minute dedupe turns accidental
  duplicates into a no-op.

## [0.3.1] - 2026-10-08

### Changed

- Theme-aware preview canvas (follows light/dark) with the article on an
  elevated white "paper" that stays white in dark mode, softer two-layer
  shadow, hairline toolbar; centered card strip for image posts.

## [0.3.0] - 2026-10-08

### Added

- Publish history and scheduled-jobs panel inside Obsidian, with one-tap
  cancel.
- Scheduled publishing: pick a datetime, the server queue ships it and
  retries on failure.
- Account switcher listing the WeChat accounts your key owns.
- Live preview re-renders as you save.

### Notes

- Pairs with a server from the same day (tenant-scoped `/v1/history`,
  `/v1/jobs`, `/v1/accounts`); older servers simply return no history or
  accounts.

## [0.2.3] - 2026-10-08

### Added

- Setup guide and one-tap Test connection in settings; masked API key;
  media dir auto-follows the vault attachment setting.
- One smart Preview that auto-detects article vs image-post cards from
  frontmatter; a preview toolbar (refresh / copy rich text / publish);
  right-click any note to publish, preview or copy it.
- Publish feedback: config guard that opens settings, server URL
  validation, status-bar progress, success toast with note title and
  elapsed time.

### Fixed

- Wasm init is idempotent — toggling the plugin off/on no longer silently
  disabled card rendering.

## [0.2.2] - 2026-10-08

### Fixed

- Loading in real Obsidian: the plugin resolves its wasm glue at runtime
  from its own directory instead of static package requires that
  Obsidian's synthetic module context can never do; card rendering works
  in-app again and fonts resolve by absolute path.

### Added

- In-app preview views (rendered article + card deck), publish progress
  steps, a theme setting (10 bundled themes), and an auto-generated title
  cover for coverless notes.

## [0.2.1] - 2026-09-30

### Fixed

- Plugin loading: wasm glue and module resolution rework; no native
  binaries, `resvg-wasm` shipped as a package beside `main.js`. Card
  preview opens the rendered deck via the system viewer.

## [0.1.0] - 2026-09-29

### Added

- First plugin release of the publishing pipeline: publish the current
  note, preview rendered HTML in a browser, preview the image-post card
  deck; settings for server URL, API key and account name.
- Install via zip (full features, bundled native renderer) or BRAT
  (article features only).

## CLI (npm)

npm releases of `@turinglambdaai/publy` use their own `npm-v*` tags.
1.0.0 predates the npm tags; 1.0.1 and 1.0.2 are deprecated and unusable
as global installs; 1.0.3 is the first usable npm install.

### [1.0.4] - 2026-10-13

- Math formulas in the CLI, same pipeline as plugin 0.7.0: mathjax SVG
  rasterized @2x via resvg, deduped per unique formula, shipped as plain
  images so they survive the WeChat editor's `<style>` stripping.
- Server terms of service and privacy policy documents, plus a
  hosted-service quickstart in the guide.

### [1.0.3] - 2026-10-12

- Critical fix: the `publy` bin was a silent no-op for every
  `npm i -g` install (the entry guard compared `import.meta.url` against
  the symlinked `argv[1]`; now resolved through `fs.realpathSync`).

### [1.0.1] - 2026-10-12

- First npm release after the diagnostics round; superseded by 1.0.3
  (the bin was a silent no-op under `npm i -g`).
- Attachment refs no longer truncated by a lazy regex quantifier (#2);
  fresh clones build again via declared `@types/node` (#3); `publish
  --json` surfaces rendering warnings, `config set media_dirs` accepts
  comma-separated dirs, and network errors report the real cause (#4).

[Unreleased]: https://github.com/turlamai/publy/compare/0.8.7...HEAD
[0.8.7]: https://github.com/turlamai/publy/releases/tag/0.8.7
[0.8.3]: https://github.com/turlamai/publy/releases/tag/0.8.3
[0.8.2]: https://github.com/turlamai/publy/releases/tag/0.8.2
[0.8.1]: https://github.com/turlamai/publy/releases/tag/0.8.1
[0.8.0]: https://github.com/turlamai/publy/releases/tag/0.8.0
[0.7.0]: https://github.com/turlamai/publy/releases/tag/0.7.0
[0.6.0]: https://github.com/turlamai/publy/releases/tag/0.6.0
[0.5.1]: https://github.com/turlamai/publy/releases/tag/0.5.1
[0.5.0]: https://github.com/turlamai/publy/releases/tag/0.5.0
[0.4.4]: https://github.com/turlamai/publy/releases/tag/0.4.4
[0.4.3]: https://github.com/turlamai/publy/releases/tag/0.4.3
[0.4.2]: https://github.com/turlamai/publy/releases/tag/0.4.2
[0.4.1]: https://github.com/turlamai/publy/releases/tag/0.4.1
[0.4.0]: https://github.com/turlamai/publy/releases/tag/0.4.0
[0.3.4]: https://github.com/turlamai/publy/releases/tag/0.3.4
[0.3.3]: https://github.com/turlamai/publy/releases/tag/0.3.3
[0.3.2]: https://github.com/turlamai/publy/releases/tag/0.3.2
[0.3.1]: https://github.com/turlamai/publy/releases/tag/0.3.1
[0.3.0]: https://github.com/turlamai/publy/releases/tag/0.3.0
[0.2.3]: https://github.com/turlamai/publy/releases/tag/0.2.3
[0.2.2]: https://github.com/turlamai/publy/releases/tag/0.2.2
[0.2.1]: https://github.com/turlamai/publy/releases/tag/v0.2.1
[0.1.0]: https://github.com/turlamai/publy/releases/tag/v0.1.0
[1.0.4]: https://github.com/turlamai/publy/releases/tag/npm-v1.0.4
[1.0.3]: https://github.com/turlamai/publy/releases/tag/npm-v1.0.3
[1.0.1]: https://github.com/turlamai/publy/releases/tag/npm-v1.0.1
