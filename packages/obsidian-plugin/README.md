# Publy for Obsidian

A desktop Obsidian client for [Publy](https://github.com/turlamai/publy): preview a Markdown article, copy styled rich text, or deliver an article/image-post **draft** to a WeChat Official Account through your configured Publy server and the official API. Draft delivery is not public posting or mass-send.

[User guide](../../docs/USER-GUIDE.md) · [简体中文](../../docs/USER-GUIDE.zh-CN.md) · [Privacy](../../docs/privacy.md) · [License](../../LICENSE)

## What works without a server

- Preview the current Markdown article locally, with themes and responsive sizing.
- Copy styled HTML for manual pasting into the WeChat editor.
- Work with source notes in place; the plugin does not require a hosted account for local preview.

## What requires a server

- Deliver to a selected WeChat Official Account **draft box** with credentials configured on your trusted Publy server.
- Query the result of an ambiguous network failure using the original request identity. A timeout is not evidence of failure: inspect the WeChat draft box before deciding whether to submit again.
- Schedule and inspect server-side drafts/jobs only when your deployment provides those capabilities.

Use HTTPS or a trusted private tunnel; keep the WeChat AppSecret on the server. The plugin stores its Publy API key in local Obsidian plugin settings — secure your vault and device accordingly. The public Publy hosted subscription service is **not** open for purchase.

## Installation status (2026-10-30)

The latest **published** GitHub plugin release is [0.8.3](https://github.com/turlamai/publy/releases/tag/0.8.3); the current source tree is 0.8.7. For manual testing of the published release, unpack its `publy-obsidian-0.8.3.zip` completely into your vault's `.obsidian/plugins/publy/` directory and enable the plugin. This side-loaded archive includes extra renderer dependencies.

**Publy is not yet confirmed as listed in the official Obsidian Community directory.** The directory installer downloads only `main.js`, `manifest.json` and `styles.css`. The development build embeds its rendering dependencies and passes a simulated offline three-file installation; published 0.8.3 remains a separate side-loaded release. Real clean-vault installation and upgrade acceptance are still required. Do not treat a successful ZIP install or simulated test as a verified community-directory install. Track the [official-install compatibility blocker](https://github.com/turlamai/publy/issues/12) and [release / directory review status](https://github.com/turlamai/publy/issues/14).

For source development: use Node.js 22+, pnpm 11, `pnpm install --frozen-lockfile`, and `pnpm -r build`. Built plugin files are in `packages/obsidian-plugin/dist/`; the simulated smoke script is `node scripts/verify-plugin.mjs` at the repository root. This smoke script is not actual Obsidian desktop acceptance.

## Report an issue

Open an [issue](https://github.com/turlamai/publy/issues) with plugin version, Obsidian version, OS, installation method, reproducible steps and redacted output. Never attach API keys, AppSecrets or private notes.
