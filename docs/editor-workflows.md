# Obsidian, CLI and agent workflow

**English** · [简体中文](editor-workflows.zh-CN.md)

Owner decision `2026-11-23-operation-options`: Obsidian is the only recommended editor and plugin experience. The CLI remains editor-independent and the official [skill](../skills/publy-publish/SKILL.md) calls it. No Typora-specific integration, acceptance programme or publishing companion is planned. WeChat Official Account drafts remain the sole destination.

## One operation contract

Use explicit `--format article`, `--format image` or `--format cards`. Pass the same format, title, cover, theme, author, summary and caption to check, preview and delivery. `publish` requires an explicit format and account. Local check/preview default to article when no format is supplied; they never infer it from note properties or picture count. Without `--theme`, `publish` applies the selected account's saved theme when it fits the format; check and preview read no account, so pass `--theme` to all three when the preview must match. A skill asks when intent is unclear.

The plugin provides a three-choice format selector and a draft options dialog. Preview does not submit; confirm delivery explicitly after reviewing the selected note, target account and options. Cancel creates no draft. The plugin uses the same core parameter contract without spawning an external CLI binary.

Frontmatter is not a Publy configuration source. Leading note properties are skipped without parsing YAML, never exported as content or copied into publication metadata. Existing notes are not rewritten. Close the properties block before the body. Use operation parameters or plugin settings for defaults. Titles fall back to a body H1 then filename. Image captions fall back to body prose; card captions fall back to prose before the first `## cover/point/list/ending` section, or use `--caption-file`.

```sh
publy check note.md --format article --title "Draft title" --cover assets/cover.png --json
publy preview note.md --format article --title "Draft title" --cover assets/cover.png --json
# Only after authorization for this file and account:
publy publish note.md --format article --title "Draft title" --cover assets/cover.png --account me --json
```

## Files and recovery

Standard Markdown relative images and Obsidian embeds are supported by the shared renderer. Resolve paths from the source directory and configured media directories; keep nested paths distinct. No frontmatter asset roots are read. Missing media blocks delivery. Original Markdown and assets stay in place.

Local checks and previews require no service account and make no network request. Draft creation requires the configured server, its fixed outbound IP and the account's official API permissions. Unknown outcomes retain their original request identity and destination. Query/reconcile before trying again; a missing response is not proof of failure.

## Acceptance boundaries

Verify all three formats, malformed/private properties, unchanged source bytes, preview/request agreement, cancelled dialogs, wrong accounts, missing assets, late responses and same-request recovery. Core/CLI and synthetic plugin acceptance do not replace a clean Obsidian installation test. Current CLI distribution is a source build; hosted checkout remains closed. See [user guide](USER-GUIDE.md) and [agent contract](agent-cli.md).
