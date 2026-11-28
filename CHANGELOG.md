# Changelog

## Server 0.2.5 — 2026-11-28

- Hosted checkout page joins the family site-kit: kit navigation with the brand mark, family tokens for buttons/plans/focus rings, serif display headline, theme toggle and dark-mode init — the whole purchase flow now matches publy.jrtx.site.
- Lost-key flow: new public `GET /v1/account-status` (rate limited, masked key tail only) with a「忘了 API Key？」self-check card on the checkout page; reset instructions render the new optional `supportContact` from `server.json` (issue-link fallback when unset). Rotation stays operator-verified in the admin console; SOP documented in the operator guide.
- Honest free-tier copy: the checkout footer drops the stale "before public hosting opens" line and states that local formatting is free without signup while draft delivery needs hosting or a self-hosted server.
- Filled buttons, pressed pills and focus rings across every embedded public page now use the family accent instead of the deep legacy shade.

## [0.8.9] — 2026-11-28

- Clear the Obsidian Community Directory automated scan errors: all seven direct style assignments (`obsidianmd/no-static-styles-assignment`) moved to classes in `styles.css` — hidden file input, cover fallback tile, dialog row, settings intro card, intro link row, connection result line, and the preview paper font stack.
- `minAppVersion` raised 1.5.0 → 1.7.2 so the public `Workspace.revealLeaf` API (since 1.7.2) sits inside the declared floor, fixing `obsidianmd/no-unsupported-api`.
- `verify-plugin.mjs`'s DOM stub models `classList` and `addClass` now that settings styling goes through classes.

## Unreleased

- Server 0.2.4: the hosted checkout page states the whole journey up front (open account → scan & pay ¥29 → connect via tutorial), labels the primary button honestly ("开户并扫码支付 ¥29"), and — once a month is active — links the next steps (paste the API key into the plugin/CLI, connect the Official Account via /setup with the whitelist walkthrough) instead of stopping at the entitlement confirmation.
- Public hosted purchasing opened on production (2026-11-26, owner decision): the issuer's `purchasing_enabled` gate, the Publy `hostedDirect.purchasingEnabled` gate and the empty `purchase_buyer_allowlist` restriction (an empty list allows nobody) were resolved together and verified end-to-end by a no-payment signup smoke that received a live Alipay purchase URL and QR. Real-money purchase, restart recovery and refund-to-withdrawal acceptance remain open in issue #17. Server packages are tagged and released separately (`server-v*`).


All notable changes to Publy are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Versions follow the Obsidian plugin release identity (`manifest.json` +
`versions.json`). CLI releases on npm carry their own `npm-v*` tags and
are listed in their own section. Versions **0.8.4–0.8.6 were never
released**: they have no git tag and no GitHub release, so the jump from
0.8.3 to 0.8.7 is real, not a gap in this file.

## [Unreleased]

- Nothing yet.

## [0.8.8] - 2026-11-26

### Added

- Draft box management for agents and operators: `publy draft list` reads
  the real WeChat draft box (read-only evidence for reconciling an unknown
  publish outcome and telling re-published batches apart by time), and
  `publy draft delete <mediaId>` removes one draft, reporting `unknown`
  on a lost response instead of a clean failure. Server routes
  `GET /v1/drafts` and `DELETE /v1/drafts/:mediaId` enforce the same
  account-ownership rules as publish; deletions are audited as
  `draft-deleted` and surface in `/v1/history`.
- Explicit operation parameters replace note frontmatter for every
  publication option; existing note properties are preserved and skipped
  without YAML evaluation.
- Draft creation requires an explicit format and supports consistent
  title/cover/author/summary/caption options across checks and previews,
  with an Obsidian draft options dialog.
- A disposable private purchase lifecycle probe: real Publy signup,
  checkout and current-proof activation, authenticated synthetic Alipay
  callback/query through the Commerce journal/projector/evidence-gated
  issuer, independent Permit verification, restart/operator recovery,
  wrong-account refusal and signed refund/withdrawal denial. All fixture
  listeners are loopback-only; synthetic money and a one-day test right
  only.

### Changed

- Focus the recommended writing experience on Obsidian, with an
  editor-independent CLI and official agent skill sharing one explicit
  operation parameter contract.
- The plugin ships the family design baseline: declared temperament
  profile, family typography scale and accent/helper/status colours at
  4.5:1 contrast.

### Fixed

- Publishing without an explicit `--theme` now applies the account's
  saved theme instead of ignoring it.
- Persist independently verified withdrawal revisions in hosted admission's
  durable fence before denying use, so an older signed grant cannot reopen an
  account after refund. The internal Racket CLI exposes an explicit snapshot
  verification mode that never authorizes work.
- Verify Commerce-generated Alipay Vibe Pay page-pay fields using the outbound
  OpenAPI signature contract, which includes `sign_type`. Notification rules
  excluded that field and caused valid checkout responses to be rejected as
  unknown. Correct the fixtures for both sandbox and configured hosted
  checkout/return paths and reject notification-style signatures for requests.
- Pin the synthetic Commerce probes and CI to Commerce `af6494a` and Permit
  `a55632b`. Run the real Racket checkout signer against Publy's verifier in
  CI so matching mock mistakes cannot hide this interoperability failure.
  This uses temporary keys and loopback only; it does not establish merchant
  admission, real payment or entitlement fulfilment.

### Honest boundaries

- Publy is not yet confirmed as an Obsidian Community Directory listing;
  directory-install acceptance remains tracked in issues #12 and #14.
- Public purchasing stays disabled; controlled real-payment acceptance is
  tracked in issue #17.

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
[0.8.8]: https://github.com/turlamai/publy/releases/tag/0.8.8
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
