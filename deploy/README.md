# Production server installation

[简体中文](README.zh-CN.md)

The server has its own `server-v<version>` GitHub release identity, separate from Obsidian plugin and CLI releases. The Linux x64 archive contains compiled server/core/shared code, themes/fonts, production dependencies from the frozen workspace lock, the hosted Permit verifier modules, and this directory. Node and Racket are independently installed runtimes, not copied developer checkouts. No npm/pnpm is required on the production server.

Use Ubuntu 24.04 x64 (Python 3.12), systemd and the official Node **v24.14.0** Linux x64 tarball at `/opt/nodejs/node-v24.14.0-linux-x64`. Verify the vendor SHA-256 before extraction. Commerce/Permit use a separate versioned Racket installation and standard copied release packages; never borrow another application's package scope. Record runtime URLs, checksums, all installed package sources and the release manifest outside Git.

1. Download the versioned server archive, `SHA256SUMS`, and `release.json` from GitHub Releases; verify `sha256sum -c SHA256SUMS`.
2. Inspect the installer from the verified archive, then run `sudo bash deploy/install-server.sh ARCHIVE EXPECTED_SHA256`. It installs a root-owned immutable release under `/opt/publy/server/releases/<version>` and does **not** switch or restart a service.
3. Provision a persistent unprivileged `publy` OS account (do not mistake a running `DynamicUser` entry for a persistent account). When migrating `DynamicUser`, stop the old unit, back up its quiescent state, create the fixed account and preserve/migrate the private state directory with its ownership before activating this unit. Keep `/etc/publy/server.json`, encryption key and `/var/lib/publy` data. Pin `publicIp` and provision `secretKey` before activation; the hardened unit deliberately cannot modify `/etc`. Paid checkout remains disabled. Point any hosted verifier configuration at the installed release's `racket/publy-hosted-admission-cli.rkt` and the reviewed Commerce runtime, never `/root/Codes`.
4. Stop `publy` for the activation window. Back up configuration and the entire quiescent data directory, record the previous active code and unit, and verify that pending/running or unknown jobs have been reconciled. A backup file is not evidence that a restore works: rehearse restoration into an isolated directory first.
5. Atomically replace `/opt/publy/server/current` with a symlink to the installed version. Install its `deploy/publy.service` under `/etc/systemd/system`, run `systemd-analyze verify`, `systemctl daemon-reload`, then enable/start `publy`. Check loopback `/health`, configuration/data permissions, restart recovery, and the stable reverse-proxy HTTPS endpoint. Do not expose internal listeners or use a quick tunnel as the production address.
6. If validation fails, stop the service. Restore the prior code/unit and a compatible tested data snapshot **after** reconciling any external effects; quarantine restored jobs before enabling delivery. Do not assume changing a symlink reverses database migrations or an externally delivered draft. Keep old releases until rollback has been exercised.

Secrets, provider payloads, account data, private backup paths and real deployment manifests must never enter a release or Git. The packaged artifact test uses synthetic configuration, forbids external fetches, checks that every dependency link stays inside the artifact and exercises HTTP health. This is installation evidence, not real WeChat delivery, merchant admission, NowPay Direct acceptance or permission to open checkout.

## NowPay Direct optional hosted mode

See [the Direct operator guide](../docs/nowpay-direct.md). The dedicated Commerce issuer owns provider and Permit private keys; Publy receives only a protected Unix socket and public verifier trust. Do not enable public purchasing merely because this package is installed.
