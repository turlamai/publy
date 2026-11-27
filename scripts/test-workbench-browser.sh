#!/usr/bin/env bash
set -euo pipefail
driver="$(mktemp -d)"
trap 'rm -rf "$driver"' EXIT
npm install --prefix "$driver" --no-save --package-lock=false playwright@1.51.1
"$driver/node_modules/.bin/playwright" install --with-deps chromium
NODE_PATH="$driver/node_modules" node packages/workbench/tests/browser-smoke.mjs
