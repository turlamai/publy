# Security Policy

Publy turns your Markdown into WeChat Official Account **drafts**: the
Obsidian plugin and CLI render locally and hold your publishing
credentials, while the self-hosted server keeps WeChat account secrets
and drives the official WeChat MP APIs. Reports are taken seriously and
handled quickly.

## Reporting a vulnerability

Email **security@jrtx.site** (or open a GitHub security advisory on this
repository). Include reproduction steps, affected versions, and your
assessment of impact. You will get an acknowledgment within 72 hours.

Please do not open public issues for security problems.

## Scope

In scope:

- Plugin data handling: rendering of untrusted Markdown and embedded SVG
  through the wasm render seam, preview HTML sanitization, clipboard and
  embed preflight, the credentials the plugin stores (server URL + API
  key, masked in settings), and redaction in logs and error surfaces.
- CLI data handling: the API key in `~/.publy/config.json`, credentials
  passed as command-line arguments (visible to local process inspection —
  documented, by design), `--json` output and exit codes never echoing
  credentials, and media/attachment resolution (`attachment://` refs).
- Server credential custody: WeChat AppID/AppSecret storage in the
  `accounts` table of `users.db` — AppSecret is encrypted at rest with
  AES-256-GCM under the `secretKey` from `server.json`, and legacy
  plaintext rows are transparently re-encrypted on their next write —
  plus the `server.json` file itself (admin `apiKey`, `secretKey`,
  Commerce checkout config) and per-user API keys in `users.db`.
- Server request surface: API-key authentication, the admin surface and
  its operator actions (reconciliation, unbinding), quotas and
  idempotency keys, immediate-publish claim/recovery state, redaction in
  `history.jsonl`, and the WebSocket events gateway (short-lived signed
  tickets vs the long-lived API key; `wsRequireTickets` refusal mode).
- Theme bundles: untrusted content-only bundles must stay fail-closed —
  scoped CSS validation, SHA-256 pinning, optional Ed25519 signature
  verification against an explicitly trusted key.
- Explicitly in scope as a fact, not a finding: **Publy currently has no
  automatic update mechanism** for plugin, CLI or server. Updates are
  manual installs from GitHub Releases; there is no update feed to
  attack.

Out of scope: the WeChat MP platform itself, social engineering, physical
access attacks, and a self-hosted operator's own misconfiguration (file
permissions, HTTPS, backups) — though we still want to hear if a default
is unsafe.

## Design notes reviewers should know

- AppSecret never travels to clients. Publishing requests are proxied by
  the server; the plugin and CLI only ever hold server API keys.
- The WebSocket gateway sits beside the server, never inside it: it tails
  `history.jsonl` read-only, prefers short-lived HMAC-SHA256 tickets over
  URL-carried long-lived keys, and can refuse the legacy key form
  entirely (`wsRequireTickets: true`).
- Commerce checkout configuration loads from `server.json` only when the
  hosted purchase path is enabled, and admission/verifier boundaries are
  designed fail-closed.
- Draft delivery is the only publishing destination: preview and local
  check never call a hosted service or require an account.
- Self-hosting operators own file permissions, HTTPS, authentication, log
  redaction and backups (see `docs/privacy.md`); the server stores jobs,
  history and caches on disk and does not claim content-free operation.

## Supported versions

Security fixes land on `main` first and ship with the next tagged
release; plugin versions follow `packages/obsidian-plugin/manifest.json`
and every `versions.json` entry must have a matching git tag (enforced by
`scripts/check-plugin-metadata.mjs`). There is no LTS branch.
