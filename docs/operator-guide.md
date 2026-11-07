# Publy self-hosted operator guide

**English** · [简体中文](operator-guide.zh-CN.md)

This guide is for the person operating their own Publy server. The admin page
manages a service, not your notebook: keep editing and organising your original
files in Obsidian, Typora or your file manager. WeChat drafts are reviewed and
published in the selected WeChat Official Account's own backend.

The current console is a **development tool**. Public hosted registration and
payment are not open, and the legacy user-plan and order screens do not prove
that Commerce/Permit authorization or real sales are active.

Alipay Vibe Pay is the planned collection method. A sandbox payment and a
signed order query have been verified, while callbacks, refunds, customer
entitlements and live merchant eligibility still need acceptance. Do not use
historical order records to enable paid service. See the
[Alipay integration plan](alipay-vibe-pay-plan.md) for the current boundaries.

## Reach the admin page

1. Start a configured Publy server on a machine you control. New development
   configurations bind to `127.0.0.1` by default. See the
   [server setup guide](guide.md) and [operations](operations.md).
2. On that same machine, visit `http://127.0.0.1:8081/admin` (replace the port
   if your configuration uses another one). For a remote server, establish a
   private SSH tunnel from your own computer, for example:

   ```sh
   ssh -N -L 127.0.0.1:18081:127.0.0.1:8081 USER@SERVER
   ```

   Keep that terminal open and visit `http://127.0.0.1:18081/admin` locally.
   Replace `USER`, `SERVER`, and ports with your own values. Alternatively use
   a properly protected HTTPS reverse proxy on a trusted network.
3. Enter the server configuration's `apiKey`. It is stored in the current
   browser tab's session storage and sent in the request header. Log out when
   finished, keep the key private, and do not paste it into issues, URLs or
   chat. The server config can also contain WeChat AppSecrets: do not share it.

The new production unit template reads `/etc/publy/server.json`; existing
self-hosted setups may use `~/.publy/server.json` or a different configured
path. To display **only** the admin key on a trusted server terminal, replace
the path as appropriate and run:

```sh
sudo python3 -c 'import json; print(json.load(open("/etc/publy/server.json"))["apiKey"])'
```

Do not run this where someone else can see the screen or terminal transcript.
Logging out removes the tab's stored key; it does **not** revoke the key. If a
key was exposed, change the server configuration and restart the service through
your normal controlled procedure, then update trusted clients. Plan a backup
first, and never change or lose `secretKey` casually: it decrypts stored
account secrets.

## What each section means

- **Overview:** a snapshot of service counts and shortcuts. The legacy plan
  and order figures describe local records, not authoritative billing.
- **Draft tasks:** scheduled jobs and recent delivery events. “Draft confirmed”
  means WeChat acknowledged draft creation, not public publication. Pending
  jobs can be cancelled after confirmation; if the result is uncertain, refresh
  and check the status. Jobs already sending cannot be cancelled here. History
  is limited and may be affected by retention.
- **Unresolved submissions (待核对):** immediate requests whose response was
  lost. Resolving one reads the account's WeChat draft box at that moment.
  “Draft found” requires selecting the actual draft; “Draft absent” is allowed
  only when the whole box was read and no same-title draft exists. Both need a
  short note and are written to the audit trail. A partial read, a same-title
  draft, a missing account or an unreachable WeChat API leaves the request
  blocked — do not resubmit it.
- **Users:** local user records, keys and legacy plan fields. Creating or
  extending a legacy plan here is an operator mutation, not a payment or
  Permit entitlement.
- **Orders:** historical or isolated test records. Do not treat a local status
  or manual action as proof of payment or a current customer entitlement.
- **Accounts:** configured and database-backed WeChat account entries. Keep
  server configuration and backups restricted. An AppSecret in configuration
  is plaintext; database account encryption depends on `secretKey`.
- **Activity:** live events require the separately configured WebSocket
  gateway. Confirm the address before connecting to another host or a remote
  unencrypted gateway; an HTTPS console requires `wss`. An empty or
  disconnected feed is not proof that no event occurred.

## When delivery is uncertain

A timeout or lost response does not mean a draft failed. Keep the original
request identity, use `publy publish-result <requestId> --json` when available,
and check the correct WeChat draft box. Do not automatically resubmit. Use the
**待核对** section to resolve it: the console reads the draft box, then records
the draft as found or proves it absent; only then may the client retry. The
check uses live WeChat API results, so an offline or partially read draft box
stays blocked instead of guessing. An old backup can also be missing later
deliveries. See [recovery and backup](operations.md)
before restarting or restoring a service.

## Care for the service

- Back up the configured data directory and server configuration together,
  with all writers stopped, into encrypted, access-controlled storage. Verify
  recovery in an isolated environment before relying on the backup.
- A small synthetic recovery exercise has checked encryption, recovery-key
  use and restored-job quarantine. It did not establish an automated backup,
  independent key custody or recovery of activity after a snapshot; follow
  the [recovery runbook](operations.md) for the remaining work.
- Treat administrator keys, AppSecrets, draft data and logs as confidential.
  Do not post them in public support requests.
- The source server template defaults to loopback; expose a service only via
  appropriate authentication, HTTPS and network controls. Hosting, backup
  retention, customer deletion and merchant admission still need release
  validation.

For non-sensitive problems, use [GitHub Issues](https://github.com/turlamai/publy/issues)
and include the version and steps to reproduce with synthetic content.
