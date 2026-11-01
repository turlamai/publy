# Write anywhere, deliver through Publy

[简体中文](editor-workflows.zh-CN.md) · English

**Product decision (2026-10-30): Typora and Obsidian share one Markdown-to-WeChat workflow.** The writer
keeps their original file and preferred editor. Publy owns review, WeChat
formatting and explicit **draft** delivery, not the act of writing. The product
must earn a subscription through reliable hosted delivery and recovery, not
lock content into an editor, copy a vault or impose a subscription on offline
preview.

## What works in the current developer build

| Writing source | Intake | Readiness |
| --- | --- | --- |
| Typora | Open an existing `.md` / `.markdown` file in Publy CLI | Standard Markdown images and local `typora-root-url` support; no Typora plugin required |
| Other programs that save standard Markdown | Generic file input only | No editor-specific integration, validation or support commitment |
| Obsidian | Existing plugin or file path from CLI | Obsidian-style embeds; Community Directory three-file installation still blocked by #12 |
| Notion, Feishu/Lark, Yuque, Word/WPS, Google Docs | **Out of scope** | No product integration or connector planned |
| Browser paste, mobile share or URL import | **Out of scope** | Not a planned publishing feature |

A file-based editor that can save compatible Markdown is an input, **not**
a tested endorsement or supported proprietary plugin.

## Typora first

Typora can store images next to a document, in relative subfolders, or
under an optional YAML `typora-root-url`. Choose **the original Markdown file**,
not an exported PDF or HTML. Publy resolves image paths from the source
directory first, preserving nested directories and preventing two unrelated
`logo.png` files from being confused. It also respects a **local filesystem**
`typora-root-url` for references starting with `/`. Remote root URLs are not
downloaded. The source file is not edited. **Privacy note:** the preview HTML contains
embedded copies of local media for display, stored in a temporary file by
default or at an explicitly selected `--out` path. Handle that preview as
private content and delete it when done. Remote HTTP images are left as
remote references and may cause network requests **when opened in a browser**;
`publy check` itself performs no network requests.

Example alongside a real file and `assets/cover.jpg`:

```md
---
title: My first draft
cover: assets/cover.jpg
---

# Hello

![Cover](assets/cover.jpg)
```

Developer-built CLI (no public one-click installer yet):

```sh
publy check "/path/to/draft.md" --json    # offline, checks assets and card lint
publy preview "/path/to/draft.md"       # offline preview embeds local images
publy preview "/path/to/draft.md" --no-open --out preview.html  # for review/automation
# Only after confirming the destination, and configuring an approved self-hosted server:
publy publish "/path/to/draft.md" --account my-account
```

`check` reports missing media and other problems as a nonzero exit (input
errors: 2; preflight issues: 4) and emits a machine-readable JSON report.
It does not call a server or submit a draft. Preview and CLI/source builds
are currently developer capabilities, **not** a shipped clean-install user
experience. See [distribution](distribution.md).

**Draft safety in the developer CLI:** unresolved local images, covers,
SVG/math conversion failures and remote/data images that cannot be uploaded
all block `publish` with exit code 4 **before** any draft request. Use
`check` for a private local problem report and `preview` for a prominent
on-page warning banner. Save external images into the original note's
media folder. The local HTML preview applies a restrictive browser Content Security Policy:
remote images, scripts and connections are blocked while embedded local
images display; explicit user navigation to a link is still a separate
browser action. `check` itself does not fetch remote resources.

## Commercial-grade universal workflow (target, not already shipped)

1. **Open:** Open-with, drag a local file, or select it in a small cross-platform
   Publy companion; existing editors remain the place to write. No content
   library copy, repository import or cloud account needed for local preview.
2. **Review:** One accurate WeChat preview, usable typography, phone-width
   toggle, themes and a clear **asset checklist** (present, missing, remote,
   unsupported, duplicated basenames) with actionable fixes.
3. **Choose:** Separate **Copy formatted HTML** (text-only, with no unresolved media/formula attachments; it refuses to overwrite the clipboard if a required asset is missing) from
   **Save to selected account's draft box**. Show account, title, cover and
   operation before the remote action. Never silently broadcast/send.
4. **Resolve:** Confirmed draft, duplicate suppressed, queued, pending/unknown,
   failed are distinct. Timeout requires query/reconcile under the original
   request identity, not a blind retry.
5. **Return:** The original source stays in place, remains editable by Typora,
   Obsidian, VS Code etc., and retains the same relative media paths.

The companion, if built, is a **delivery shell**, not a second Markdown
editor or database. Rivet is a candidate only if it meets cross-platform
packaging, accessibility and installation quality gates; the core document
contract must not depend on it.

## Priority and acceptance

**P0 — content fidelity:** exact local media path resolution; source
unchanged; no same-name substitution; clean preview; missing asset and cover
problems visible before submit. Exercise Chinese file names, whitespace,
Unicode paths, Windows drive paths, UTF-8, linked media outside the note
directory, data/file/http references and hostile Markdown.

**P1 — no-technical-setup installation:** signed, reproducible Win/macOS/Linux
assets, clean install/update/uninstall, first local preview without Node,
Racket, npm, server configuration, account registration or a terminal. The
future companion can open file paths or drag-and-drop; no proprietary editor
API dependency. Real screen-reader/keyboard use, dark/light mode and error
copy matter as much as screenshots.

**P2 — dependable paid value:** customer self-service onboarding, stable
outbound IP, account checks, clear permissions, secure credentials,
restorable backups, live status and quotas, reconciliation, cancellation,
refunds and accessible support. Commerce/Permit is the server authority.
No hosted checkout before merchant and operational gates pass.

**P3 — format/connector expansion:** import-only adapters only if necessary to validate Typora/Obsidian compatibility; fixtures must
prove headings, local/remote images, captions, tables, code, maths, callouts,
references and cover identity. Prioritize actual requests and measured demand,
not a speculative plugin for each editor.

For all paths record: 1) clean install; 2) sample source + expected media
manifest; 3) preview visual comparison; 4) copy/publish identity; 5) offline
behavior and errors; 6) uninstall and user-data persistence. Successful
compilation is not user acceptance.
