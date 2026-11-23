---
name: publy-publish
description: Preview, check, and deliver a local Markdown document to a selected WeChat Official Account draft using Publy. Use when a user asks to prepare or send an article or image post to a WeChat draft; do not use for public release or mass messaging.
---

# Publy: Markdown to WeChat drafts

Use the installed Publy CLI. Obsidian is the recommended editor and plugin workflow; the CLI accepts an original Markdown file independently of any editor. Do not modify source notes or their properties. Creating a draft requires authorization for the selected document and destination; choosing a format is not permission to submit.

1. Discover `publy capabilities --json` and `publy account list --json`. Never expose keys or private source/properties in logs. Follow the product setup if commands or accounts are missing; do not ask for secrets in chat.
2. Resolve the operation from the user's explicit intent. Ask whether they want an article, images with a caption, or text cards when unspecified or ambiguous (including “图文”). Do not infer the form from length, images or note properties. Require `--format article|image|cards` support; do not silently fall back to a legacy CLI.
3. Build one option set for the operation: `--format`, and any chosen `--title`, `--cover`, `--theme`, `--author`, `--digest`, `--caption` or `--caption-file`. A title may fall back to the first body H1 or filename. Captions may fall back to image-post body prose or the prose before the first card section. Never read frontmatter as publication settings. Existing properties are skipped and preserved. For multiline captions prefer a private UTF-8 caption file and pass `--caption-file`; do not put credentials in parameters or files.
4. Run `publy check <file> --json` and `publy preview <file> --json` with exactly the same option set. Inspect the actual preview and required media. Keep the resolved options stable; if the user changes the source or options, repeat check and preview. Preview is local, creates only generated artifacts, and never grants permission to submit. Remove only owned generated files after use.
5. After explicit authorization for this document, format and account, run `publy publish <file> --account <name> --json` with that same option set. Never choose another account or publish publicly. If format or required settings are missing, ask the user; do not write metadata into the note to work around it.
6. Report the actual result: `confirmed` is a created or deduplicated draft, `scheduled` is a queued draft, and `unknown` is unresolved. Preserve `requestId`, query `publy publish-result <requestId> --json` and check the original account's draft box before considering another submission. A timeout is not proof of failure. Never automatically resubmit an uncertain request.

Follow the installed CLI's capabilities and current product help. Do not add promotional copy, cover generation, themes or branding without user instruction. Do not claim a released installer or active paid service from a source build.
