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
