# Operations: backup, restore, moving servers

## Reliability semantics (implemented)

- **Idempotent publishing**: clients can provide an `idempotencyKey`.
  Confirmed keyed results are retained for a ten-minute duplicate window;
  unkeyed requests do not have this protection. An unresolved immediate
  request is held rather than automatically retried (see below).
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
- **Restoring a snapshot**: a backup reflects only its snapshot time. Jobs
  pending in that snapshot may have run afterward; immediate request claims,
  key rotations, account changes and cancellations after the snapshot may be
  absent. Never start a restored server against WeChat until this gap is
  reviewed. The offline quarantine procedure below prevents selected restored
  jobs from running automatically; it cannot recover missing later activity
  or guarantee exactly-once delivery.
- **Quota**: the legacy local monthly counter is not an atomic hosted quota
  ledger. It is not evidence of reliable concurrent commercial enforcement.
- **Credentials**: `POST /v1/admin/users/:id/rotate-key` rotates a user key
  (old key dies immediately); disable revokes. Audit-log and error responses
  scrub credential-bearing query strings. WS clients should use short-lived
  tickets (`POST /v1/ws-ticket` → `ws://…/events?key=ws1.…`); set
  `"wsRequireTickets": true` in `server.json` to retire the legacy key-in-URL
  path.

The development server defaults to `127.0.0.1`; set `host` explicitly only
when a network listener is needed. This changes older direct-listener behavior:
check reverse-proxy routing and firewall rules before an upgrade. A public
reverse proxy requires its own HTTPS and access controls.

## Restricted systemd service (development template)

[`deploy/publy-server.service`](../deploy/publy-server.service) is a Linux
systemd template tested with an isolated synthetic staging instance. It runs
under a dynamic non-root identity, loads a root-owned configuration as a
systemd credential, restricts filesystem access and keeps state in a private
`/var/lib/publy` directory. It expects a reviewed release at
`/opt/publy-releases/current`, an independently verified Node runtime at
`/opt/publy-runtime/node`, and a protected `/etc/publy/server.json` with
`host: "127.0.0.1"` and `dataDir: "/var/lib/publy"`. Do not enable this unit
or point a public proxy to it before the deployment and release gates pass.
Staging with synthetic credentials does not verify production backup/restore,
merchant admission, egress policy, TLS, proxy access controls or hosted billing.

## Fixed-egress personal pilot runbook (issue #8) — IN PROGRESS

An owner-controlled fixed-egress test has delivered synthetic article and
image-and-caption drafts, and the owner checked their appearance. A separate
isolated synthetic backup rehearsal verified authenticated encryption, key
recovery, SQLite integrity and restored-job quarantine. These are partial
checks, not a production backup system or hosted commercial acceptance. See
[issue #8](https://github.com/turlamai/publy/issues/8) for the evidence and
remaining limitations. The checklist below is not yet complete; public sales
remain closed pending the gates in PRICING.

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

## Backup and restore: developer self-hosted deployments

A live archive of `~/.publy` is not a consistent backup: SQLite and the JSON
files may change while it is being copied. Stop admission, wait for in-flight
requests to finish, and stop **all** server writers before making a snapshot.
Back up the configured data directory and `server.json` together, including
SQLite `-wal` and `-shm` files if present. If `dataDir` points elsewhere, the
default directory alone is incomplete. Store the archive encrypted, restrict
access, and test recovery on an isolated machine. The archive contains API
keys, AppSecrets, customer data and draft content; do not post it to an issue.

Recovery needs special care even after a consistent backup: the original
server may have accepted work **after** that backup. Before starting a restored
copy, isolate it from incoming traffic and WeChat, stop the original instance
and all other writers, and keep the original data and backup unchanged.
Reconcile all activity since the snapshot against independent records and the
appropriate WeChat draft boxes. In particular, missing claims and credential
revocations cannot be reconstructed from an older archive. Do not reconnect
or resume delivery while that gap is unresolved.

For a restored development source checkout, with **all** Publy server
processes stopped, run this against the restored data directory before the
first server startup:

```bash
node scripts/quarantine-restored-jobs.mjs --data-dir /path/to/restored/server-data
```

The tool changes pending, running and previously safe-to-retry failed jobs to
`interrupted`. It preserves the exact original as
`jobs.json.before-restore-quarantine` with restricted permissions, and refuses
to overwrite that file. Keep it protected: it contains draft content. If there
is no `jobs.json`, or the file is damaged, it stops without creating an empty
queue. The interrupted retry endpoint does not blindly resend; an operator
must inspect the draft box. The tool does **not** recover requests absent from
the snapshot, validate backup integrity, reconcile account/credential changes,
or fence a still-running server. This is a development recovery aid, not a
production-tested backup or disaster-recovery system.

`secretKey` in `server.json` is needed to decrypt stored AppSecrets. Protect
and recover it with the matching data. Validate a restored copy in isolation;
only after the snapshot gap and credentials are reconciled may an operator
consider reconnecting it. A full fixed-egress pilot and restore rehearsal remain
release gates.

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
