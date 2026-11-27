# Publy product focus — 2026-11-27

**English** · [简体中文](platform-strategy.zh-CN.md)

Desktop, Web workspace, Obsidian plugin and CLI/Skill are first-class entry points. Desktop targets Racket + Glaze after capability validation; Web targets local-first browser rendering. Both follow design/prototype and reuse existing Core and hosted entitlement rather than duplicating business logic. Obsidian is optional. Keep original Markdown and assets in place; use one renderer, local checks/previews and explicit options for authorized delivery. Track #118 and #119. These are approved development targets, not shipped clients.

WeChat Official Account drafts remain the only destination. No public sending, mass sending, cross-posting, browser automation of WeChat, or new destination abstraction. No Typora-specific integration or compatibility programme. Ordinary Markdown files remain valid inputs for every client.

Note properties are preserved and skipped, never used as publication configuration. The plugin asks in a draft options dialog; the skill asks when intent is unclear; the CLI requires a format for submission. Selecting a format is separate from authorization to submit. See [workflow](editor-workflows.md).

Prioritize media fidelity, source immutability, safe HTML, clean Obsidian installs, preview/request agreement, exact selected account and unknown-result recovery. Commercial operations, merchant admission, quotas, backup/restore and Commerce/Permit remain independent launch gates. Public hosted checkout remains closed. This decision does not change the source licence or publish a release.
