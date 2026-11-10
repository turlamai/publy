# Contributing to Publy

This file is a thin pointer. The binding rules live in the documents it
references; nothing here overrides them.

## Read first

- [AGENTS.md](AGENTS.md) — the development discipline: scope discipline
  (WeChat Official Account draft delivery is the only publishing
  destination), the editor-independent product contract, and the
  authorization decision to read before commercial or credential work.
- [docs/design.md](docs/design.md) — sections 3 (CLI contract) and 4
  (image-message pipeline) are required reading before code changes.
- [docs/distribution.md](docs/distribution.md) — the **no-npm policy**:
  users install from audited GitHub Releases and the Obsidian Community
  Directory; existing npm tags are historical and are not a recommended
  installation path, and no new npm publication is planned. Do not
  reintroduce npm-install paths in docs, scripts or code.
- [docs/roadmap.md](docs/roadmap.md) — the current execution queue.

## Verify before submitting

These are the real CI gates (`.github/workflows/ci.yml`):

```bash
pnpm install --frozen-lockfile
pnpm -r build
pnpm -r test
node scripts/check-plugin-metadata.mjs        # needs full tags: fetch-depth 0
node --test scripts/verify-plugin-layout.test.mjs
node --test scripts/verify-restore-quarantine.test.mjs
node scripts/verify-plugin.mjs
```

Racket components (CI job `racket-ws`):

```bash
raco pkg install --auto --batch websocket
raco test racket
```

Commerce shadow verification needs pinned `turlamai/permit` and
`turlamai/commerce` checkouts and runs
`node scripts/verify-commerce-shadow.mjs` with `COMMERCE_ROOT` /
`PERMIT_ROOT` set.

Exit codes and `--json` output are an external contract: any change must
be mirrored in `docs/design.md` section 3 and `docs/agent-cli.md` (plus
its `*.zh-CN.md` counterpart) in the same PR.

## Pull requests

- Keep PRs one bounded slice each; record owned files, dependency pins,
  command/platform/artifact evidence and rollback, as AGENTS.md requires.
- Security-sensitive reports go through [SECURITY.md](SECURITY.md), never
  public issues.
- **License terms:** Publy is licensed under the GNU Affero General
  Public License v3.0 ([LICENSE](LICENSE)). By opening a pull request you
  agree that your contribution is licensed under AGPL-3.0 without
  additional terms — the same license applies to users and to any
  networked deployment of the server code.
