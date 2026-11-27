# Publy Desktop (development)

The Glaze WebView hosts the shared workbench. The desktop build injects the
native client and disables browser network access. Its first draft-delivery
slice uses the fixed hosted account, publish and result endpoints over
certificate-verified TLS. The workbench requires explicit confirmation.

## Build and run

Install Racket 9.0+ CS, Node 22+, pnpm and Glaze at
`ba2442bb001910d20bca41d0de876e58d6341b63`. Check out that revision separately
and run `raco pkg install --auto --link <checkout>`. Native WebView
prerequisites are described in Glaze's getting-started guide.

From the Publy root:

```sh
pnpm install --frozen-lockfile
node scripts/build-workbench.mjs
racket packages/desktop/main.rkt
raco test packages/desktop/main.rkt
racket packages/desktop/native-smoke.rkt
```

The native smoke uses a synthetic upstream and a temporary recovery directory.
On Linux run it with `xvfb-run -a` when a display is unavailable.

## Recovery

The per-user recovery directory is `site.jrtx.publy` under Racket's preferences
directory. An OS file lock covers the full operation across processes. SQLite
commits only the request ID, account name and title before the POST. API keys,
article content and attachments stay in memory. The previous development
JSON journal is migrated on first access under the same lock.

When a response is lost, reopen the draft dialog, enter the key again and
check the original request. A matching confirmation clears the pending record.
An unknown outcome requires checking the WeChat draft box. Keep the recovery
directory intact while the outcome is unknown.

Native clipboard, Windows and Linux desktop interaction, physical power-loss
recovery, signed distribution and live WeChat delivery require separate
acceptance.

## Installer candidates and updates

`node scripts/package-desktop.mjs` uses the built workbench to produce a DMG
on Apple silicon, an MSI on Windows x64 or a DEB on Linux x64. The installer
workflow builds candidates only and records a SHA-256 checksum. macOS
development builds use ad-hoc signing. A release needs production platform
signing and clean-machine acceptance.

Build a signed update feed locally with
`racket scripts/make-desktop-update-manifest.rkt <artifacts> <private.pem> <public.pem> <key-id>`.
The release build must embed the matching public key and key ID in
`update-trust.rkt`. The signed feed belongs at the dedicated desktop manifest
URL and refers to installer assets on the matching `desktop-v<version>` GitHub
release. The client only checks on request, verifies the feed and installer,
and saves the verified file under Downloads for manual installation.
Development candidates omit the trust key and hide the update action.

开发候选包覆盖 Apple silicon DMG、Windows x64 MSI 和 Linux x64 DEB，
构建时记录 SHA-256。生产签名、正式更新源和干净机器验收是独立环节。
配置发布验签公钥后，桌面端才显示更新入口。用户检查并确认下载后，应用
验证清单签名和安装包摘要，将文件保存到「下载」目录，由用户手动安装。
