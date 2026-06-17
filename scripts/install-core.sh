#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$ROOT_DIR/resources/clash-binaries"
REPO="MetaCubeX/mihomo"
VERSION="${MIHOMO_VERSION:-${CORE_VERSION:-latest}}"
DOWNLOAD_URL="${MIHOMO_DOWNLOAD_URL:-${CORE_DOWNLOAD_URL:-}}"
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: ./scripts/install-core.sh [--dry-run] [--version VERSION] [--url URL]

Downloads the official MetaCubeX/mihomo Linux core into:
  resources/clash-binaries/mihomo-linux-<arch>

Options:
  --dry-run          Show the release asset and target path without installing.
  --version VERSION  Use a specific mihomo release tag, for example v1.19.27.
                     Defaults to latest. MIHOMO_VERSION also works.
  --url URL          Download this exact asset URL. MIHOMO_DOWNLOAD_URL also works.
  -h, --help         Show this help.
EOF
}

log() {
  printf '%s\n' "$*"
}

manual_install_hint() {
  cat <<EOF

Manual install fallback:
  1. Open https://github.com/${REPO}/releases
  2. Download the Linux ${TARGET_ARCH:-<arch>} .gz asset
     ${PREFERRED_ASSET:-}
  3. Install it without sudo:
     mkdir -p "$BIN_DIR"
     gzip -dc /path/to/mihomo-linux-*.gz > "${TARGET:-$BIN_DIR/mihomo-linux-<arch>}"
     chmod +x "${TARGET:-$BIN_DIR/mihomo-linux-<arch>}"
     "${TARGET:-$BIN_DIR/mihomo-linux-<arch>}" -v

You can also keep the binary elsewhere and start with:
  CLASH_CORE=/absolute/path/to/mihomo npm start
EOF
}

fail() {
  printf 'error: %s\n' "$*" >&2
  manual_install_hint >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --version)
      [[ $# -ge 2 ]] || fail "--version requires a value"
      VERSION="$2"
      shift 2
      ;;
    --version=*)
      VERSION="${1#*=}"
      shift
      ;;
    --url)
      [[ $# -ge 2 ]] || fail "--url requires a value"
      DOWNLOAD_URL="$2"
      shift 2
      ;;
    --url=*)
      DOWNLOAD_URL="${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown option: $1"
      ;;
  esac
done

if [[ "$(uname -s)" != "Linux" ]]; then
  fail "this installer only downloads Linux mihomo cores"
fi

RAW_ARCH="$(uname -m)"
case "$RAW_ARCH" in
  x86_64|amd64)
    TARGET_ARCH="amd64"
    PREFERRED_ASSET="preferred asset: mihomo-linux-amd64-compatible-<version>.gz"
    ;;
  aarch64|arm64)
    TARGET_ARCH="arm64"
    PREFERRED_ASSET="preferred asset: mihomo-linux-arm64-<version>.gz"
    ;;
  armv7l|armv7|armhf)
    TARGET_ARCH="armv7"
    PREFERRED_ASSET="preferred asset: mihomo-linux-armv7-<version>.gz"
    ;;
  armv6l|armv6)
    TARGET_ARCH="armv6"
    PREFERRED_ASSET="preferred asset: mihomo-linux-armv6-<version>.gz"
    ;;
  i386|i686|386)
    TARGET_ARCH="386"
    PREFERRED_ASSET="preferred asset: mihomo-linux-386-<version>.gz"
    ;;
  riscv64)
    TARGET_ARCH="riscv64"
    PREFERRED_ASSET="preferred asset: mihomo-linux-riscv64-<version>.gz"
    ;;
  loongarch64)
    TARGET_ARCH="loong64-abi1"
    PREFERRED_ASSET="preferred asset: mihomo-linux-loong64-abi1-<version>.gz"
    ;;
  *)
    TARGET_ARCH="$RAW_ARCH"
    PREFERRED_ASSET="preferred asset: mihomo-linux-${TARGET_ARCH}-<version>.gz"
    ;;
esac

TARGET="$BIN_DIR/mihomo-linux-$TARGET_ARCH"

download_file() {
  local url="$1"
  local output="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 2 --connect-timeout 15 --max-time 180 \
      -A "xiongmaosw-install-core" \
      -o "$output" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget --timeout=30 --tries=3 --user-agent="xiongmaosw-install-core" \
      -O "$output" "$url"
  else
    return 127
  fi
}

select_asset() {
  local release_json="$1"

  command -v python3 >/dev/null 2>&1 || fail "python3 is required to select a GitHub release asset; set MIHOMO_DOWNLOAD_URL to skip API parsing"

  python3 - "$release_json" "$TARGET_ARCH" <<'PY'
import json
import re
import sys

release_file, arch = sys.argv[1], sys.argv[2]
with open(release_file, "r", encoding="utf-8") as handle:
    release = json.load(handle)

tag = release.get("tag_name") or ""
assets = release.get("assets") or []
candidates = []

def add(score, asset):
    name = asset.get("name") or ""
    url = asset.get("browser_download_url") or ""
    if name.endswith(".gz") and url:
        candidates.append((score, name, url))

for asset in assets:
    name = asset.get("name") or ""
    if arch == "amd64" and tag and name == f"mihomo-linux-amd64-compatible-{tag}.gz":
        add(0, asset)
    elif arch == "amd64" and tag and name == f"mihomo-linux-amd64-{tag}.gz":
        add(10, asset)
    elif arch != "amd64" and tag and name == f"mihomo-linux-{arch}-{tag}.gz":
        add(0, asset)
    elif arch == "amd64" and re.fullmatch(r"mihomo-linux-amd64-compatible-v[0-9][A-Za-z0-9.]*\.gz", name):
        add(100, asset)
    elif arch == "amd64" and re.fullmatch(r"mihomo-linux-amd64-v[0-9][A-Za-z0-9.]*\.gz", name):
        add(110, asset)
    elif arch != "amd64" and re.fullmatch(rf"mihomo-linux-{re.escape(arch)}-v[0-9][A-Za-z0-9.]*\.gz", name):
        add(100, asset)

if not candidates:
    linux_assets = sorted(
        asset.get("name") or ""
        for asset in assets
        if (asset.get("name") or "").startswith("mihomo-linux-")
    )
    print(f"no matching linux asset found for arch={arch}", file=sys.stderr)
    for name in linux_assets[:40]:
        print(f"  {name}", file=sys.stderr)
    sys.exit(2)

candidates.sort(key=lambda item: (item[0], item[1]))
_, name, url = candidates[0]
print(tag)
print(name)
print(url)
PY
}

resolve_download_url() {
  local tmp_dir="$1"
  local release_json="$tmp_dir/release.json"
  local api_url
  local asset_info

  if [[ -n "$DOWNLOAD_URL" ]]; then
    RELEASE_TAG="custom-url"
    ASSET_NAME="${DOWNLOAD_URL%%\?*}"
    ASSET_NAME="${ASSET_NAME##*/}"
    [[ -n "$ASSET_NAME" ]] || ASSET_NAME="mihomo-linux-$TARGET_ARCH"
    return
  fi

  if [[ "$VERSION" == "latest" ]]; then
    api_url="https://api.github.com/repos/${REPO}/releases/latest"
  else
    [[ "$VERSION" == v* ]] || VERSION="v$VERSION"
    api_url="https://api.github.com/repos/${REPO}/releases/tags/${VERSION}"
  fi

  log "Resolving ${REPO} release: ${VERSION}"
  if ! download_file "$api_url" "$release_json" >/dev/null 2>&1; then
    fail "failed to query GitHub release API: $api_url"
  fi

  if ! asset_info="$(select_asset "$release_json")"; then
    fail "failed to select a mihomo Linux asset for $RAW_ARCH/$TARGET_ARCH"
  fi

  RELEASE_TAG="$(printf '%s\n' "$asset_info" | sed -n '1p')"
  ASSET_NAME="$(printf '%s\n' "$asset_info" | sed -n '2p')"
  DOWNLOAD_URL="$(printf '%s\n' "$asset_info" | sed -n '3p')"
}

run_version_check() {
  local binary="$1"
  local output="$2"

  if "$binary" -v >"$output" 2>&1; then
    return 0
  fi
  if "$binary" version >"$output" 2>&1; then
    return 0
  fi
  return 1
}

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

resolve_download_url "$TMP_DIR"

if [[ "$DRY_RUN" -eq 1 ]]; then
  cat <<EOF
Dry run only. No files were changed.
  system arch: $RAW_ARCH
  mihomo arch: $TARGET_ARCH
  release: $RELEASE_TAG
  asset: $ASSET_NAME
  download: $DOWNLOAD_URL
  target: $TARGET
EOF
  exit 0
fi

mkdir -p "$BIN_DIR"

ARCHIVE="$TMP_DIR/$ASSET_NAME"
EXTRACTED="$TMP_DIR/mihomo"
VERSION_OUTPUT="$TMP_DIR/version.txt"

log "Downloading $ASSET_NAME"
if ! download_file "$DOWNLOAD_URL" "$ARCHIVE"; then
  fail "failed to download $DOWNLOAD_URL"
fi

case "$ASSET_NAME" in
  *.gz)
    command -v gzip >/dev/null 2>&1 || fail "gzip is required to unpack $ASSET_NAME"
    if ! gzip -dc "$ARCHIVE" > "$EXTRACTED"; then
      fail "failed to unpack $ASSET_NAME"
    fi
    ;;
  *)
    cp "$ARCHIVE" "$EXTRACTED"
    ;;
esac

chmod +x "$EXTRACTED"

if ! run_version_check "$EXTRACTED" "$VERSION_OUTPUT"; then
  printf 'Downloaded core did not pass version check. Output:\n' >&2
  sed -n '1,20p' "$VERSION_OUTPUT" >&2
  fail "mihomo core failed both '-v' and 'version' checks"
fi

install -m 0755 "$EXTRACTED" "$TARGET"

log "Installed mihomo core:"
log "  $TARGET"
log "Version check:"
sed -n '1,5p' "$VERSION_OUTPUT" | sed 's/^/  /'
