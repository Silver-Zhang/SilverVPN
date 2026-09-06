#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_ORIGIN="https://github.com/Silver-Zhang/SilverVPN.git"
cd "$ROOT_DIR"

if ! command -v git >/dev/null 2>&1 || [[ ! -d "$ROOT_DIR/.git" ]]; then
  echo "This installation cannot be updated in place because it is not a Git checkout." >&2
  exit 1
fi

ORIGIN="$(git config --get remote.origin.url || true)"
if [[ "$ORIGIN" != "$EXPECTED_ORIGIN" ]]; then
  echo "Refusing to update from an untrusted origin: ${ORIGIN:-<missing>}" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree has local changes. Commit or stash them before updating." >&2
  exit 1
fi

git pull --ff-only origin main
"$ROOT_DIR/scripts/install.sh"
