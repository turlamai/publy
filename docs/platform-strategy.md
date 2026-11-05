# Publy destination and editor scope — updated 2026-11-05

[简体中文](platform-strategy.zh-CN.md) · **Active product decision**

**Markdown is the input; WeChat Official Account drafts are the publishing
destination.** Generic Markdown and agent workflows are first-class. Typora
and Obsidian are optional writing entry points; no particular editor is required.

## What Publy builds

The complete experience is **keep the existing Markdown and images → review
and check locally → choose the target WeChat Official Account → explicitly
save a draft → confirm the outcome or recover from an unknown result**.

- **Markdown and agents:** use an existing Markdown file from any editor or an
  explicitly instructed agent; check and preview locally without moving the
  source, then choose the destination and create a draft only with authorization.
- **Typora:** open its existing Markdown file and resolve its relative image
  paths, local `typora-root-url`, covers and math. Deliver a source-preserving,
  usable local preview and a simple future nontechnical publishing entry.
- **Obsidian:** reliable plugin preview and explicit account/draft actions;
  validate the official three-file community install with fonts, cards and
  formula rendering. No vault copying.
- **WeChat:** the only actual delivery protocol. No implicit public send,
  mass-send, cross-post or automated browser login. First earn user trust in
  media fidelity, credential boundaries, failures, idempotency and status
  recovery. Public hosted checkout remains closed until real operational and
  Commerce/Permit acceptance.

Ordinary `.md` files are a supported product input. Test the common Markdown
workflow independently of any editor; a dedicated integration for another
editor requires a concrete customer need and separate validation.

## Publishing scope

The current product delivers only to WeChat Official Account drafts. A new
publishing destination requires a separate product decision. The owner’s
2026-11-05 direction also supersedes editor-only positioning: a plain Markdown
file or an authorized agent is a complete entry point.

## Release priorities in order

1. **Correct source and media:** filenames and relative paths, Typora roots,
   Obsidian vault embeds, safe HTML, covers, equations and cards; no silent
   asset substitution or dropped images.
2. **User-level quality:** offline preview and visible warnings, exact selected
   account, explicit draft-only submit, status/unknown-outcome recovery, clean
   installs and first-use validation on Windows/macOS/Linux, keyboard and
   accessibility, polished error states.
3. **WeChat real-world reliability:** fixed-egress and whitelist acceptance,
   official draft confirmation, credentials and backup/restore, retry/idempotency
   after network loss and process restart.
4. **Commercial readiness:** hosted onboarding only after operations,
   entitlements via Commerce/Permit, quotas, cancellation/refund, abuse
   resistance and support are proven.

No new destination is required to call Publy complete. Any future expansion
would require an explicit **new** product decision; it should not be worked on
under this roadmap. The existing licence and public release status do not
change with this decision.
