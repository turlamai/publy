# Operations: backup, restore, moving servers

## Reliability semantics (implemented)

- **Idempotent publishing**: every publish carries an `idempotencyKey`; the
  server keeps a durable record per key for 10 minutes and answers retries
  with the original `media_id` (`deduped: true`) instead of creating a second
  draft. Failed attempts are not recorded — only successes dedupe.
- **Immediate draft claims (development source):** a keyed immediate request
  first reserves its identity in SQLite. Concurrent duplicates cannot send a
  second draft, and a possibly submitted operation stays blocked after restart.
  A confirmed result is also kept in SQLite for the ten-minute duplicate
  window. A failure before draft submission or an explicit WeChat rejection
  releases the claim; an unresolved claim does not expire automatically.
  Inspect WeChat drafts and keep the original identity. No operator recovery
  action for clearing an unresolved claim is provided yet. Requests without a key retain legacy
  behavior and do not receive this protection. This is not multi-instance
  hosted-service or exactly-once acceptance evidence.
- **Lost responses**: clients reconcile via `GET /v1/publish-result/:key`
  (confirmed | unknown). A timeout is never permission to re-issue.
- **Scheduled jobs**: admission is idempotent (same key never enqueues two
  jobs). Jobs found `running` at boot, or tasks whose remote submission
  result was lost, are marked **interrupted** and never auto-rerun.
  `POST /v1/jobs/:id/retry` does **not** re-send an interrupted job:
  only an unexpired, exact-body-fingerprint matching local delivery record
  allows it to mark the job `done` without contacting WeChat or using quota.
  Otherwise it returns HTTP 409 `DRAFT_OUTCOME_UNKNOWN` (or
  `IDEMPOTENCY_CONFLICT`) and preserves the interrupted state. Examine the
  WeChat drafts box separately; absence of a local delivery record is not
  evidence that WeChat rejected the draft. Previously persisted `failed`
  jobs without proof of a pre-publish failure are also blocked. Only jobs
  explicitly marked safe after local pre-publish errors can be re-admitted.
  A remote review or controlled manual resolution procedure is still needed
  before any future re-submission; this endpoint cannot guarantee exactly-once
  delivery.
- **Restore safety**: a restored `jobs.json` never re-publishes already
  accepted content — only `pending` jobs execute, `done`/`cancelled`/`failed`
  stay terminal, and `running` jobs boot as `interrupted` (see above).
- **Quota**: per-account monthly limits on the UTC billing cycle, no
  rollover; exhaustion returns `QUOTA_EXCEEDED` before any send. Failures,
  retries and duplicate hits never count twice.
- **Credentials**: `POST /v1/admin/users/:id/rotate-key` rotates a user key
  (old key dies immediately); disable revokes. Audit-log and error responses
  scrub credential-bearing query strings. WS clients should use short-lived
  tickets (`POST /v1/ws-ticket` → `ws://…/events?key=ws1.…`); set
  `"wsRequireTickets": true` in `server.json` to retire the legacy key-in-URL
  path.

## Fixed-egress personal pilot runbook (issue #8) — NOT YET EXECUTED

The checklist below is the acceptance contract for the first owned-account
deployment. It proves a fixed-egress pilot; it does **not** prove hosted
commercial readiness, and it is not authorization to purchase infrastructure,
change DNS or accept paid customers (those gates stay with PRICING).

Prerequisites: a small managed Linux host with a stable outbound IP, the
operator's own WeChat account bound, synthetic content only.

- [ ] Record container/package versions, source SHA, `server.json` shape
      (secrets redacted) in this file or the deployment issue.
- [ ] State the outbound IP and its rotation behavior; verify the WeChat IP
      whitelist and token refresh work from that host (DNS/CDN does not fix
      egress).
- [ ] Service runs under its own identity/storage boundary, separate from
      Commerce issuer keys and order data.
- [ ] Exercise the failure-injection set with synthetic content: double
      submit, lost response → `publish-result` query, retry with same key
      (`deduped`), crash mid-run → boot reconciliation → explicit retry,
      backup restore → no republish.
- [ ] Restrict admin surfaces; enable `wsRequireTickets`; confirm access/
      proxy logs carry no keys (only tickets and `[redacted]`).
- [ ] Rehearse encrypted backup → key recovery → restore with synthetic
      content; record restore duration and validation output.

Evidence goes into the deployment issue on the pilot branch — do not
construct a parallel runbook file.

## What lives where

| Thing | Location | In git? |
| --- | --- | --- |
| Code (server, CLI, plugin, gateway) | this repo → `github.com/turlamai/publy` | ✅ |
| Operator config (apiKey, accounts, secretKey) | `~/.publy/server.json` on the server | ❌ back it up |
| **Users, API keys, orders** | `~/.publy/server-data/users.db` (SQLite) | ❌ back it up |
| Audit trail (the event gateway reads this) | `~/.publy/server-data/history.jsonl` | ❌ back it up |
| Scheduled publish jobs | `~/.publy/server-data/jobs.json` | ❌ back it up |
| WeChat tokens / material cache | `~/.publy/server-data/` (rest) | regenerable |

**Code can never be lost** (local clone + GitHub). What only exists on the
server is `~/.publy/` — that is the customer list, the keys and the order
book. Back it up before touching the server.

## Backup (on the server)

```bash
tar -czf publy-backup-$(date +%F).tar.gz -C ~ .publy
```

Contains config + database + audit trail in one file. Copy it off the box
(scp/oss/网盘). Automation: run it from cron daily and keep 7.

## Restore (new server)

```bash
# 1. node 22+ and the code
git clone https://github.com/turlamai/publy && cd publy && pnpm -r build
# 2. drop in the data
tar -xzf publy-backup-YYYY-MM-DD.tar.gz -C ~
# 3. start server + event gateway (ports default 8081 / 8082)
node packages/server/dist/index.js &
racket racket/publy-ws.rkt &
```

`secretKey` inside `server.json` decrypts the stored AppSecrets — restoring
without it keeps users and orders but breaks bound accounts until secrets
are re-entered. Never lose `server.json`.

## Updating a running deployment

```bash
cd publy && git pull && pnpm -r build
# restart the server / gateway processes however you run them
```

`users.db` is SQLite; the event gateway only ever opens it read-only, so a
rolling restart of the gateway is safe while the server keeps serving.

## Operational stats

```bash
racket racket/publy-stats.rkt                    # human report, last 30 days
racket racket/publy-stats.rkt --days 90 --json   # machine-readable, for agents
```

Read-only over the same data dir (`users.db` opened read-only,
`app_secret`/`api_key` never selected, `history.jsonl` only read) — safe to
run while the server is live. Reports publish volume and failure rate per
day, top WeChat errors, accounts near their monthly plan quota, the
user/plan mix and paid revenue by month, all bucketed in Asia/Shanghai
wall time. `--config` points at a non-default `server.json`.
