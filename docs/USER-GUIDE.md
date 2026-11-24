# Publy user guide

**English** · [简体中文](USER-GUIDE.zh-CN.md)

Turn Markdown into WeChat article drafts and image-post cards, with local preview and a self-hosted delivery server.

## Availability

CLI, default themes, Obsidian and self-hosting remain free under their existing licences. Public hosted subscriptions are not open; there is no unlimited plan for sale.

The development plugin embeds its rendering assets in `main.js`. Three-file offline installation is under test; actual clean-vault installation and update acceptance remain open ([#12](https://github.com/turlamai/publy/issues/12), [#15](https://github.com/turlamai/publy/issues/15)).

## First use without server knowledge

Follow the [step-by-step WeChat connection guide](wechat-setup.md): check official API permissions → open your service’s `/setup` → copy its egress IP → add the **API IP whitelist** in the official WeChat console → check and connect → configure Obsidian with the service root URL and Publy Key → explicitly approve one test draft and inspect it in WeChat.

The guide includes official entry links, credential sources, concrete actions, success criteria, and recovery for whitelist errors, a new computer, unknown outcomes and paid-but-inactive access. Public hosting is not on sale; invited acceptance users use the provided service and original key. Do not pay just to connect or reset AppSecret merely to follow the guide.


## Platforms and installation

Use the developer CLI or the Obsidian plugin. Published release assets currently include the Obsidian plugin. A server needs stable outbound IP and the account’s actual official API permissions. The development server binds to loopback by default; use a protected HTTPS reverse proxy for remote access. If upgrading a direct network listener, adjust access or explicitly set `host`.

Source builds require Node.js 22+, pnpm and Git; follow the [developer installation and setup](guide.md). Release assets do not constitute a deployed service.

## Obsidian or the official agent skill

Obsidian is the recommended editor and plugin experience. CLI and the official skill accept the original Markdown file independently of the editor. Use `check` and `preview` locally before confirming any draft delivery; neither submits a draft. Standard nested relative images and Obsidian embeds are supported. Original notes and their properties are preserved. The CLI is still a developer source build, not a qualified no-setup installer.

### Choose the operation

Select article, images with a caption, or text cards in the plugin's draft options dialog. The CLI uses `--format article|image|cards`; `publish` requires it plus `--account`. Skills ask when intent is unclear. Pass the same `--title`, `--cover`, `--theme`, `--author`, `--digest`, `--caption` or `--caption-file` to check, preview and publish. Do not combine both caption options. Local preview defaults to article if no choice is supplied.

Note frontmatter is skipped, not read as publication settings. No source is rewritten. Titles fall back to the first body H1 then filename. Image captions can come from remaining body text; card captions can precede the first section. Cancelling the plugin dialog does not submit anything. Preview and delivery share the selected options.

[Current workflow and acceptance boundaries](editor-workflows.md) · [简体中文](editor-workflows.zh-CN.md)

Copy rendered rich text stops without changing the clipboard if media or formulas are missing or remain as local attachments. Use draft delivery for content with attachments.

## Use a standalone article theme (CLI development build)

Built-in themes work offline. To use a content-only theme bundle from someone you trust, run `publy theme add ./theme.json`, then `publy theme preview THEME_ID` and use `--theme THEME_ID` when rendering. `publy theme ls` lists installed article themes. To replace one, run `publy theme update ./new-theme.json`; to remove it, run `publy theme remove THEME_ID`. Keep the earlier bundle if you may want to roll back: remove the installed version and add the earlier file. Obsidian running as the same system user can select validated installed article themes: reopen the plugin settings or preview panel after installation. The CLI manages the shared local bundle; the plugin does not download themes itself.

For an HTTPS bundle, obtain its complete-file SHA-256 independently from a trusted source and run `publy theme add https://example.com/theme.json --sha256 HASH`. A matching hash checks the downloaded bytes against that value; it does not establish who created them. Redirects are refused. These are content-only JSON files, not executable packages; they are limited to scoped `#publy` article styles and a conservative subset of CSS. Remote assets, CSS imports, scripts, and CSS escapes are rejected. This is not a signed gallery or an automatic updater.

To create a bundle from your own CSS, save a file containing styles such as `#publy p { color: #123456; }`, then run:

```sh
publy theme pack my.css --id my-style --theme-version 1.0.0 --name "My style" --license MIT --output my-style.json
```

The command validates the content, refuses to overwrite an existing output and prints the bundle's SHA-256. Include a suitable licence for styles you share. The original CSS and Markdown files are not modified. Themes are stored in `~/.publy/themes`; back up any bundles you want to keep.

To migrate an older local theme, keep a backup of its CSS and licence, then use `theme pack` on a copy. Adapt unsupported selectors or declarations explicitly; Publy rejects them rather than silently weakening validation. A CSS file you personally trust can still be used for a one-off render with `--custom-theme /path/to/theme.css`; that older path reads CSS as trusted input and is not the bundle safety boundary. Do not run an old package's install scripts. The bundle flow does not import npm packages automatically.

Signed bundles are optional. `theme pack --sign-key <pem>` with an Ed25519 private key emits a `publy-theme-v2` bundle that carries the matching public key and a detached signature over its metadata and CSS hash. `theme add/update --trusted-key <base64>` installs only a bundle signed by exactly that key. Pin a key only when you obtained it from the author through a trusted channel: a signature proves possession of that key, not identity, and an unpinned signature is informational. The private key stays in your local process and is never uploaded.

## Where are my notes and drafts?

Publy does not create a notebook or provide a dashboard for browsing and
editing notes. Continue to find, edit, organize and back up your original
Markdown and images in Obsidian or your file manager. Publy reads the
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
private. See the [operator guide](operator-guide.md) for login and page-by-page instructions, and [operations and backups](operations.md) for server details.

## Data, backup and recovery

Publy removes generated formula, SVG and card intermediates after they are consumed by the CLI or plugin. A preview HTML file deliberately created for you to open is an output and can contain your content; delete it when finished. Keep source Markdown and media locally. Back up server configuration, databases, job history and encryption material together using restricted, encrypted storage. Before restoration, stop all writers and isolate the server. A job pending in an older backup may already have been delivered; follow the [restore procedure](operations.md#backup-and-restore-developer-self-hosted-deployments) to quarantine jobs and reconcile draft and account changes since the snapshot.

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
