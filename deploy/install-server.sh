#!/usr/bin/env bash
set -euo pipefail
archive="${1:?usage: install-server.sh ARCHIVE EXPECTED_SHA256}"
expected="${2:?expected SHA-256 from verified release}"
test "$(id -u)" = 0
printf '%s  %s\n' "$expected" "$archive" | sha256sum -c -
base=/opt/publy/server
mkdir -p "$base/releases"
stage="$(mktemp -d "$base/releases/.install-XXXXXXXX")"
trap 'rm -rf "$stage"' EXIT
python3 - "$archive" "$stage" <<'PY'
import json, pathlib, re, sys, tarfile
archive, stage = sys.argv[1:]
with tarfile.open(archive) as tf:
    tf.extractall(stage, filter='data')
p = pathlib.Path(stage) / 'publy-server'
d = json.loads((p / 'release.json').read_text())
assert d['service'] == 'publy-server' and d['platform'] == 'linux' and d['architecture'] == 'x64'
assert re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', d['version'])
assert d['node'] == 'v24.14.0'
assert (p / 'dist/index.js').is_file()
PY
test "$(uname -m)" = x86_64
node=/opt/nodejs/node-v24.14.0-linux-x64/bin/node
test "$("$node" --version)" = v24.14.0
version="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["version"])' "$stage/publy-server/release.json")"
target="$base/releases/$version"
test ! -e "$target"
mv "$stage/publy-server" "$target"
chown -R root:root "$target"
chmod -R go-w "$target"
printf 'Installed %s. Active service was not changed. Follow deploy/README.md for backup, activation and rollback.\n' "$target"
