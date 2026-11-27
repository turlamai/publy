#!/usr/bin/env bash
# Exercise the production signing and verifier commands in an isolated checkout.
set -euo pipefail
source_assets="$(cd "$1" && pwd)"
fixture="$(mktemp -d)"
trap 'git worktree remove --force "$fixture/source" 2>/dev/null || true; rm -f "$fixture"/{key,public,other}.pem; rmdir "$fixture"' EXIT
git worktree add --detach "$fixture/source" HEAD
assets="$fixture/source/dist/feed-fixture"
mkdir -p "$assets"
cp "$source_assets"/publy-desktop-* "$assets/"
openssl genpkey -algorithm ED25519 -out "$fixture/key.pem"
openssl pkey -in "$fixture/key.pem" -pubout -out "$fixture/public.pem"
openssl genpkey -algorithm ED25519 -out "$fixture/other.pem"
stage="$fixture/source/packages/desktop/update-trust.rkt"
node --input-type=module - "$stage" "$fixture/public.pem" <<'JS'
import {readFileSync,writeFileSync} from "node:fs";
const [, , target, key]=process.argv;
const trust=readFileSync(target,"utf8");
writeFileSync(target,trust
 .replace(/^\(define update-public-key-pem .*\)$/m,"(define update-public-key-pem "+JSON.stringify(readFileSync(key,"utf8"))+")")
 .replace(/^\(define update-key-id .*\)$/m,'(define update-key-id "acceptance")'));
JS
(
 cd "$fixture/source"
 if racket scripts/make-desktop-update-manifest.rkt "$assets" "$fixture/other.pem"; then
   printf '%s\n' 'Unexpectedly signed the feed with a key different from the embedded key' >&2
   exit 1
 fi
 test ! -e "$assets/update-manifest.json"
 racket scripts/make-desktop-update-manifest.rkt "$assets" "$fixture/key.pem"
 racket scripts/check-desktop-update-feed.rkt "$assets"
 linux="$(find "$assets" -maxdepth 1 -name '*.deb' -print -quit)"
 printf '%s' 'altered' >> "$linux"
 if racket scripts/check-desktop-update-feed.rkt "$assets"; then
   printf '%s\n' 'Unexpectedly verified an altered installer' >&2
   exit 1
 fi
)
