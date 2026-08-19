#!/bin/sh
set -eu

REPOSITORY_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$REPOSITORY_ROOT"

patterns='-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}'

if git grep -nEI -e "$patterns" -- . ':!package-lock.json'; then
  printf 'Potential high-confidence secret material was found in tracked files.\n' >&2
  exit 1
fi

printf 'Tracked-file high-confidence secret scan passed (synthetic test credentials are intentionally out of scope).\n'
