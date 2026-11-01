# Publy Agent CLI contract (development build)

[简体中文](agent-cli.zh-CN.md) · English

Publy CLI is the **editor-independent automation interface** for a saved
Markdown file. Typora and Obsidian are first-class writing experiences;
other programs or Agents may invoke the same CLI against an ordinary Markdown
file. **WeChat Official Account drafts are the only delivery destination.**
No cross-platform publishing, automatic mass-send, or public posting.

> This documents a developer-built TypeScript CLI, not an already released
> standalone Racket/native installer. Supported retail installation and real
> account acceptance remain open under #18, #25, #7 and #12.

## Discover capabilities before calling commands

```sh
publy capabilities --json
publy check "/path/to/article.md" --json
publy preview "/path/to/article.md" --json --out "/tmp/publy-review.html"
publy render "/path/to/article.md" --json
publy theme ls --json
publy account list --json
publy account add Work --theme claude --json  # explicit local mutation; user approval required
publy quota --json
publy jobs list --json
publy history --json
```

`capabilities --json` runs without a network connection, account, browser or
side effects and returns a **versioned** manifest. Each command declares
`json` support and whether it reads, writes local output, may access the
network or performs a draft-creating/mutating action. **Do not guess** that
every command supports `--json`: `theme preview` and some legacy commands are still human-oriented.
`account add <name> --json [--app-id <id>] [--author <name>] [--theme <id>]` returns a single `account-add` object, with `ACCOUNT_SAVED`, `ACCOUNT_NAME_INVALID`, `CONFIG_INVALID` or `CONFIG_WRITE_FAILED`. It does not echo App IDs, author metadata or config file contents. Omitted options preserve existing account fields. The command changes only local configuration and requires explicit user approval.

`config set <key> <value> --json` returns a single `config-set` object (`CONFIG_SAVED`, `CONFIG_KEY_INVALID`, `CONFIG_INVALID` or `CONFIG_WRITE_FAILED`) without ever echoing values, including API keys or credential-bearing URLs. This is a local mutation and requires the operator's approval.
`jobs cancel --json` and `jobs retry --json` now return structured results,
but are **mutating operations requiring explicit user approval**. If their
network outcome is uncertain, they return `status:"unknown"` with the original
job ID; query `jobs list --json` before deciding what to do next.
Those remaining commands' `json:false` entry is deliberate, not hidden implementation detail.

## Structured local review

```sh
publy check article.md --json
publy preview article.md --json
publy preview image-post.md --json
```

For `preview --json`, stdout is exactly **one JSON object** with
`schemaVersion:1`, `kind:"local-preview"`, `ok`, `source`, `output`
(on success), `problems` and `submitted:false`, `networkUsed:false`.
It **never launches the browser**, even without `--no-open`. It writes a
private self-contained HTML file (which may contain confidential note/image
bytes). Clean up the preview file/directory after reviewing it.

For `mode: cards`, the generated review contains the actual PNG cards;
if a font is unavailable it **fails without fetching fonts**. A preview with
blocking problems may still be written for human review, but exits with 4
and has `ok:false` in JSON mode. Neither `check` nor `preview` creates
a WeChat draft.

## Raw HTML export and bundled theme discovery

`render --json` creates a permission-limited local HTML file and returns
`kind:"html-render"`, `output`, `attachmentCount`, `problems`, and
`containsAttachmentReferences`. Unlike `preview`, this is **raw WeChat
render HTML**: `attachment://` placeholders still require the Publy media
submission workflow; it is not automatically paste-ready. The source never
changes, an existing output requires explicit `--force`, and the command
never uploads or publishes anything.

`theme ls --json` returns only bundled article/card theme names with
`source:"bundled"` and `networkUsed:false`. Legacy human-readable
`theme ls` may attempt registry lookup, but the Agent JSON command does not.

## Network submission and reconciliation

```sh
# This command CREATES a WeChat draft after explicit user approval.
publy publish article.md --account "my-wechat-account" --json

# When a request has unknown outcome, query the SAME id:
publy publish-result <requestId> --json
```

A successful publish returns `kind:"publish-result"`, `ok:true`,
`status:"confirmed"|"scheduled"`, `requestId` and the named account.
Offline failures return `ok:false`, `status:"not_submitted"` and a code.
A network exception returns `status:"unknown"`, `submitted:null`,
`requestId`. HTTP 5xx is also conservatively an unknown outcome;
HTTP 4xx is `status:"rejected"`. **Never treat unknown as failed** and
blindly retry as a new submission. The original idempotency key is part of
the recovery protocol, not a guarantee of end-to-end exactly once.

Server lookup (`publish-result --json`) returns the same server state;
an unknown result exits with code 4, even in JSON mode. Check the WeChat
draft backend where necessary.

## Tool-use safety and exit statuses

- Reading, checking and previewing are safe autonomous operations, but
  do not copy or upload source notes without the user's knowledge.
- Before `publish`, show the user the **source file, account and draft-only
  destination**; obtain approval for creating that draft. Scheduling or
  cancelling jobs are separate explicit actions.
- Agent-mode JSON belongs on **stdout**; diagnostics belong on **stderr**.
  Never parse human wording or rely only on exit status.
- Exit status: `0` success; `1` usage/config input; `2` bad file/output;
  `3` local renderer unavailable; `4` media/card blockers or unknown
  lookup; `5` server/network issue. These are the implemented statuses
  of the described commands, not a promise that every old command is uniform.
- No current MCP server is being claimed by this contract. CLI subprocess
  calls are the stable integration seam; an MCP adapter can be added only
  as a thin translation layer when needed.

Agent call flow: **discover → check → preview → user approves selected
account → publish → verify/reconcile**.
