# Third-Party Notices

Publy is a multi-package monorepo. This file is an **overview only**; the
authoritative, full-text notice lists are the files that ship with the
packages carrying the third-party code:

- [`packages/cli/third-party-notices.txt`](packages/cli/third-party-notices.txt)
  — the publishing CLI (`@turlamai/publy`) and its bundled runtime
  dependencies: css-tree 3.1.0 (MIT), mdn-data (CC0 1.0).
- [`packages/obsidian-plugin/third-party-notices.txt`](packages/obsidian-plugin/third-party-notices.txt)
  — the Obsidian plugin's embedded rendering components: Noto Sans SC
  subset fonts (SIL Open Font License 1.1), resvg-wasm 2.6.2 / Satori
  0.33.5 (MPL-2.0), HarfBuzzJS 0.10.0 (Apache-2.0 for the Zephyr libc and
  emmalloc pieces, MIT for the rest), MathJax 3.2.2 (Apache-2.0),
  css-tree 3.1.0 (MIT), mdn-data (CC0 1.0).

## Maintenance rule

When a package's dependency set changes, update that package's
`third-party-notices.txt` in the same PR — the package files are what
ships inside releases — and keep this overview consistent with them. This
root file must never contradict the per-package lists.
