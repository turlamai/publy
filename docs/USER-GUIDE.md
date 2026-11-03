# Publy user guide

**English** · [简体中文](USER-GUIDE.zh-CN.md)

Turn Markdown into WeChat article drafts and image-post cards, with local preview and a self-hosted delivery server.

## Availability

CLI, default themes, Obsidian and self-hosting remain free under their existing licences. Public hosted subscriptions are not open; there is no unlimited plan for sale.

The development plugin embeds its rendering assets in `main.js`. Three-file offline installation is under test; actual clean-vault installation and update acceptance remain open ([#12](https://github.com/turlamai/publy/issues/12), [#15](https://github.com/turlamai/publy/issues/15)).

## Platforms and installation

Use the developer CLI or the Obsidian plugin. Published release assets currently include the Obsidian plugin. A server needs stable outbound IP and the account’s actual official API permissions.

Source builds require Node.js 22+, pnpm and Git; follow the [developer installation and setup](guide.md). Release assets do not constitute a deployed service.

## Write in Typora or Obsidian

For Typora, choose the **original Markdown file**. For Obsidian, use the
plugin or the same underlying Markdown. No other editor integrations are planned. In the current
developer CLI, run `publy check "/path/to/your-note.md" --json` to inspect
images, covers and card structure **locally**, then `publy preview` before
considering delivery. Neither command sends a draft. Typora's local
`typora-root-url` and nested image paths are understood; missing attachments
are reported, and the original source stays untouched. This is developer
source-build functionality, **not yet a no-setup public installer**.

[Typora quick start](typora.md) · [Supported input paths, limitations and commercial user-experience standard](editor-workflows.md)
· [简体中文](editor-workflows.zh-CN.md)

In the development plugin, **Copy rendered rich text** stops without changing the clipboard if images or formulas are missing, fail to render, or remain as local attachments. Use draft delivery for content with attachments.

## Where are my notes and drafts?

Publy does not create a notebook or provide a dashboard for browsing and
editing notes. Continue to find, edit, organize and back up your original
Markdown and images in Typora, Obsidian or your file manager. Publy reads the
file you choose for checking and formatting; it does not migrate your notes.

After delivery, sign in to the **WeChat Official Account platform** and open
the selected account's draft box to review, edit and manage the draft. Publy
does not publish it publicly. If the outcome is unknown, check that draft box
before deciding whether to submit again: a missing server record does not prove
that WeChat did not receive the draft.

A self-hosted server also has an operator page at `/admin` for service users,
WeChat accounts, scheduled draft tasks, historical orders and events. The
**Draft tasks** view shows pending, confirmed and unknown outcomes, plus
recent delivery events. The event list is limited and may be affected by log
retention; it does not replace checking the WeChat draft box.
It is not a note manager. This page is still a development-stage tool; public hosting and checkout are not
open. Access it over HTTPS or a trusted private network and keep the admin key
private. See [operations and backups](operations.md) for server details.

## Your first successful session

1. Install from the source instructions and preview a non-sensitive Markdown article locally before configuring delivery.
2. Configure your own server and account, whitelist its actual outbound IP, and keep AppSecret on that server. Use HTTPS or a private tunnel for access.
3. Publish one test draft and confirm its result in the WeChat backend. A delivered draft is not a publicly published or mass-sent article.

## Data, backup and recovery

Keep source Markdown and media locally. Back up server configuration, databases, job history and encryption material together using restricted, encrypted storage. Before restoration, stop all writers and isolate the server. A job pending in an older backup may already have been delivered; follow the [restore procedure](operations.md#backup-and-restore-developer-self-hosted-deployments) to quarantine jobs and reconcile draft and account changes since the snapshot.

When a delivery loses its connection, the outcome is "unknown", not "failed": query the original request identity (`publy publish-result <key>`, or the plugin query action), then check the WeChat draft box. The server records a success only after receiving a confirmation; submitting again can create a duplicate even with the same request identity. Check the draft box before taking any action on an interrupted scheduled job too.

## Network, keys and privacy

Rendering can run locally. Delivery sends content/media and account credentials or derived tokens through your chosen server to official WeChat APIs. Server logs, retry history and storage must be reviewed; “nothing is stored” is not a valid blanket promise. Never share API keys in URLs or screenshots.

## Known limits

Public hosted registration, payment, tenant isolation, retention/deletion and reliable job recovery are not yet qualified (#7, #8). Do not send AppSecret to an unannounced hosted endpoint or an issue.

## Upgrading and stopping use

Back up configuration/data and identify the source and dependency versions. Validate in isolation before replacing the version in use. Stop the process before removing local data; content and credentials at external services must be managed or revoked there separately.

## Get help

Report problems in [GitHub Issues](https://github.com/turlamai/publy/issues), in English or Chinese. Include the version, OS/architecture, installation channel, steps, expected result and actual result. Reproduce with synthetic input first; do not attach keys, credentials, databases, private source documents or complete logs. Public support has no guaranteed response time.

## Further reading

- [CLI and self-hosting manual](../docs/guide.md)
- [Operations](../docs/operations.md)
- [Project overview and development](../README.md)
- [Current licence](../LICENSE)
