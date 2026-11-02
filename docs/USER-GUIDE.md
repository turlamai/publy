# Publy user guide

**English** · [简体中文](USER-GUIDE.zh-CN.md)

Turn Markdown into WeChat article drafts and image-post cards, with local preview and a self-hosted delivery server.

## Availability

CLI, default themes, Obsidian and self-hosting remain free under their existing licences. Public hosted subscriptions are not open; there is no unlimited plan for sale.

## Platforms and installation

CLI and Obsidian workflows; this is not a Rivet/Glaze desktop application. Published release assets currently include the Obsidian plugin. A server needs stable outbound IP and the account’s actual official API permissions.

See the [README](../README.md) for source installation and execution; release assets do not constitute a deployed service.

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

## Your first successful session

1. Install from the source instructions and preview a non-sensitive Markdown article locally before configuring delivery.
2. Configure your own server and account, whitelist its actual outbound IP, and keep AppSecret on that server. Use HTTPS or a private tunnel for access.
3. Publish one test draft and confirm its result in the WeChat backend. A delivered draft is not a publicly published or mass-sent article.

## Data, backup and recovery

Keep source Markdown and media locally. Back up server configuration, databases, job history and encryption material together using restricted, encrypted storage. Restore and test on an isolated server; do not replay an unknown-outcome job before checking remote draft/history state.

When a delivery loses its connection, its outcome is unknown. Query the original request (`publy publish-result <key>`, or the plugin's query action) and inspect the selected account's WeChat drafts before considering another submission. A missing or expired local record does not prove that WeChat rejected the draft; do not generate a new request key to bypass this uncertainty.

Interrupted scheduled jobs never auto-rerun. `publy jobs retry <id>` only reconciles an exact, locally confirmed draft without contacting WeChat, or retries a failure proved to have happened before submission. HTTP 409 `DRAFT_OUTCOME_UNKNOWN` or `IDEMPOTENCY_CONFLICT` leaves the job blocked. Check the remote draft separately; this command cannot guarantee exactly-once delivery or resolve an unrecorded remote result.

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
