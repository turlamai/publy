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

The installer matrix first installs the checksum-pinned 0.1.0 GitHub
Actions artifact, then applies the current installer and checks the installed
version. The matrix also tests the signed update manifest against the actual
three installer artifacts using a disposable key. Installers built in pull
requests remain development candidates.

Use `node scripts/package-desktop.mjs --release` to write production bytes
to `dist/desktop-production`. These builds use the stable public key
embedded in `update-trust.rkt`. macOS requires a Developer ID Application
identity in `PUBLY_MAC_SIGN_IDENTITY` and an authenticated Apple notary
profile in `PUBLY_MAC_NOTARY_PROFILE`. Set `PUBLY_MAC_NOTARY_KEYCHAIN` when the
profile lives outside the default keychain. The command checks the signature,
waits for notarization, and validates the ticket on the DMG. Windows requires
a trusted code-signing identity in the certificate store, the Windows SDK
Signing Tools on PATH, and `PUBLY_WINDOWS_CERT_THUMBPRINT`. It checks the MSI's
Authenticode signature and timestamp. Linux authenticity comes from the
Ed25519-signed feed and the DEB digest. Build and accept each final installer
before staging the feed.

Collect the three accepted production installers in a directory and run
`racket scripts/make-desktop-update-manifest.rkt <artifacts> <private.pem>`.
A private key that differs from the embedded public key cannot write the
manifest. Run `racket scripts/check-desktop-update-feed.rkt <artifacts>` to
check all three staged installers. The signed manifest's canonical address is
`https://publy.jrtx.site/desktop/update-manifest.json`, served by GitHub Pages
from `main:docs/desktop/update-manifest.json`. Installers are served by the
version-specific `desktop-v<version>` GitHub release. Publication is a
separate operator action. Once authorized, publish the checked installer
bytes before promoting the verified manifest, then run
`racket scripts/check-desktop-update-feed.rkt` to validate HTTPS, the live
manifest and all three installer downloads.

桌面安装门禁先安装带固定校验值的 0.1.0，再应用本次安装包并检查版本。
生产构建输出到 `dist/desktop-production`。macOS 校验 Developer ID
签名和公证票据，Windows 校验 Authenticode 与时间戳，Linux 用 Ed25519
签名清单及 DEB 摘要验证。生成清单时，签名私钥必须和应用内置公钥成对。

正式安装包和更新清单由运营者独立发布。先验收准备发布的安装包，再发布
版本对应的 GitHub Release 资产，最后推进官网更新清单。桌面端只在用户
主动检查并确认下载后取回并验证安装包，由用户手动安装。
