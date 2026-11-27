# Publy Desktop (development)

The Glaze native WebView hosts the exact bundle used by the browser workbench. No separate renderer, Node server, or browser fallback is introduced. This slice exposes no native file or shell bridge, and never sends drafts.

## Build and run

Install Racket 9.0+ CS, Node 22+, pnpm and Glaze from the source revision used to develop this integration: `ba2442bb001910d20bca41d0de876e58d6341b63`. Check out that revision in a separate Glaze checkout and run `raco pkg install --auto --link <checkout>`.

From the Publy root:

```sh
pnpm install --frozen-lockfile
node scripts/build-workbench.mjs
racket packages/desktop/main.rkt
```

Run `raco test packages/desktop/main.rkt` to test the bundle readiness guard. Native WebView prerequisites are described in Glaze's getting-started guide. A missing bundle fails with an explicit build instruction.

## Acceptance still required

- Real native windows on Windows, macOS and Linux, with file picker, IME, scaling, keyboard navigation and light/dark theme.
- Clipboard support in each WebView; browser clipboard permission is not guaranteed.
- Native scoped file access, packaging, signing and update verification.
- Preview parity, formula support, and explicit authenticated draft delivery.

Not a released installer. The existing Obsidian/CLI paths remain unchanged.

The restricted upstream adapter in `hosted-transport.rkt` defines only the fixed hosted account, publish and result operations, uses certificate-verifying TLS, rejects header injection and never follows redirects. Its mock tests run with the desktop readiness tests. It is deliberately not exposed to the WebView until native recovery storage and the bridge authorization are implemented; no desktop hosted delivery is enabled yet.

`recovery-journal.rkt` adds a stable per-user pending-draft file under the Racket preference directory. Only request ID, account and title are stored. Exclusive creation prevents overlapping claims; malformed or incomplete files block further delivery. Matching confirmation is required for deletion. Tests cover reopen, overlapping claims, privacy and malformed journals. The caller must still serialize confirmation and deletion across processes before exposing the journal to native delivery. Flush is not a guarantee of physical power-loss durability; crash/power-loss testing and OS-specific durability remain open. The WebView is not wired to this module yet.
