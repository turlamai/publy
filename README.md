# Publy

Editor-independent Markdown-to-WeChat draft publishing: local rendering and preflight, an Obsidian integration, and a self-hosted delivery service. Hosted subscriptions and a universal installer are not yet available.

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE) ![status](https://img.shields.io/badge/status-pipeline%20implemented-blue)

**English** · [中文](README.zh-CN.md)

- **Keep your Markdown wherever you write.** Typora and Obsidian are optional; an agent or the CLI can use the same source file directly. `publy check a.md` reports missing images before any draft is sent. The current CLI remains a developer source build.
- **The Obsidian plugin renders and delivers the current note to WeChat drafts in place**: in-app article preview, image-post card deck preview, rich-text copy, publish progress — no browser needed.
- **Image posts as a first-class citizen.** `publy card post.md` renders themed 3:4 card PNGs deterministically — pixel-perfect Chinese text, seconds per deck, no AI image generation.
- **Use themes without registry packages.** Built-in themes work offline; the development CLI can also pack, add, preview, update and remove content-only article theme bundles. HTTPS downloads require a user-supplied SHA-256. Obsidian can select validated local bundles; signed theme downloads and an installation catalogue are not available; see the [user guide](docs/USER-GUIDE.md#use-a-standalone-article-theme-cli-development-build).
- **Open core, no lock-in.** The CLI and a self-hostable server are open source (AGPL-3.0) and speak the same protocol as the hosted cloud. The future hosted service would provide: stable egress IP for the WeChat API whitelist, AppSecret custody, token lifecycle, scheduling, multi-account.

Compliance: Publy only uses official WeChat MP APIs. No account simulation, no browser automation.

Status: local rendering and delivery components exist; public hosted onboarding and commercial operation are not open. **Obsidian community-directory publication has not been verified**; the source plugin version and latest published GitHub Release differ. See [directory release readiness](docs/obsidian-submission.md) and [official-install blocker](https://github.com/turlamai/publy/issues/12).

**Use any Markdown file:** [Typora quick start](docs/typora.md) · [English workflow and acceptance criteria](docs/editor-workflows.md) · [中文](docs/editor-workflows.zh-CN.md). Obsidian is optional; Publy does not require a particular editor. Typora and Obsidian still require real clean-machine acceptance.

## Start here

CLI, default themes, Obsidian and self-hosting remain free under their existing licences. Public hosted subscriptions are not open; there is no unlimited plan for sale. Use the developer CLI or the Obsidian plugin. Published release assets currently include the Obsidian plugin. A server needs stable outbound IP and the account’s actual official API permissions.

[Installation, first use, privacy, backup and recovery](docs/USER-GUIDE.md) · [简体中文](docs/USER-GUIDE.zh-CN.md)

The [Publy publishing skill](skills/publy-publish/SKILL.md) helps compatible agents check, preview and create authorized WeChat drafts. · [Agent skill setup](skills/README.md)

## Quick start

```bash
publy config set server https://your-server.example
publy config set api_key "$PUBLY_API_KEY"   # POSIX shell: set the environment variable first
publy account add me --app-id wx... --theme claude
publy check article.md
publy preview article.md     # review locally; no draft is submitted
publy publish article.md --account me  # only after approval: create a WeChat draft, not a public post
```

For PowerShell, replace `"$PUBLY_API_KEY"` with `"$env:PUBLY_API_KEY"`. The CLI receives the key as an argument, which may be visible to local process inspection; do not paste credentials into shared logs.

Image-post: write sections (`## cover` / `## point` / `## list` / `## ending`) with `mode: cards` in frontmatter, run `publy card post.md --preview`, then `publy publish post.md --account me` only after confirming the destination and approving draft creation.

Full manual: [English manual](docs/guide.md) · [中文手册](docs/guide.zh-CN.md) · Theme gallery: [themes.publy.jrtx.site](https://themes.publy.jrtx.site/)

## License

AGPL-3.0
