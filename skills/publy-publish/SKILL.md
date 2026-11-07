---
name: publy-publish
description: Preview, check, and deliver a local Markdown document to a selected WeChat Official Account draft using Publy. Use when a user asks to prepare or send an article or image post to a WeChat draft; do not use for public release or mass messaging.
---

# Publy: Markdown to WeChat drafts

Use the installed Publy CLI; it works with Markdown files regardless of editor. Obsidian and Typora are optional sources. Respect the user's chosen document and account; creating a draft requires authorization for that document and destination. Creating a draft is not public publication.

1. Discover actual installed commands with `publy capabilities --json`. Check accounts with `publy account list --json`; never expose keys, secrets, article contents, or private paths in logs. If setup is missing, guide the user through the product's setup without asking for credentials in chat.
2. Determine the intended form from the user's instruction first. Existing metadata can express article (`type: article` or no type), image-and-caption (`type: image`), or cards (`mode: cards`); `type: article` takes precedence over `mode: cards`. Do not infer image posts from length or the presence of pictures. If the user says an ambiguous term such as “图文” without clarifying whether they mean an article with embedded pictures or a separate image-and-caption post, ask which they intend. When capabilities advertise `publicationFormats`, pass the same explicit `--format article`, `--format image`, or `--format cards` to check, preview and publish. A choice overrides document metadata for that operation only. Older versions may not support this option: explain the mismatch and do not silently submit another form. Do not alter the source or write into a note library to change the format.
3. Run `publy check <file> --json`, inspect blocking issues and local media, then `publy preview <file> --json` for a local review. Card previews need their declared card sections and bundled font coverage. Inspect previews before drafting; do not send if required assets or rendered content are missing. The preview may create private local files; remove only generated artifacts after review, never source files or user assets.
4. Once the document, format, account, and draft action are authorized, run `publy publish <file> --account <name> --json` with any supported, explicitly chosen options. Use the same resolved format for check, preview and submission. Never silently choose another account or publish publicly.
5. Report the actual result: `confirmed` means a draft was created or deduplicated, `scheduled` is a queued task, and `unknown` means the outcome is not known. If unknown, preserve the original `requestId`, run `publy publish-result <requestId> --json`, and check that account's draft box. Never automatically resubmit an uncertain request: a timeout or a missing local record does not prove that WeChat received nothing.

Follow product help and the installed version's `capabilities` output rather than assuming features from a newer release. Do not add publisher-specific promotional copy, themes, branding, or cover-generation rules unless the user requests them.
