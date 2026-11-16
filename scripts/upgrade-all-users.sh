#!/usr/bin/env bash
# SilverVPN 批量升级：一次升级服务器上所有已安装用户的 SilverVPN。
#
# 用法（建议以 root 运行）：
#   sudo bash scripts/upgrade-all-users.sh
#   sudo bash scripts/upgrade-all-users.sh --dry-run
#   sudo bash scripts/upgrade-all-users.sh --user alice
#   sudo bash scripts/upgrade-all-users.sh --no-truncate
#
# 每个用户按以下顺序处理：
#   1. git pull --ff-only（先修复 install-svpn.sh 造成的 bin/svpn 权限差异）
#   2. scripts/install-svpn.sh 刷新 ~/.local/bin/svpn 与 shell hook
#   3. 若升级前代理在运行：stop -> 截断超限的历史日志 -> start
#
# 日志只处理 CLI 的 svpn-core.log / svpn-core.err.log，且仅在超过
# SVPN_LOG_TRUNCATE_BYTES（默认 32 MB）时截断；v0.3.4 之后这两种日志
# 自身已按 8 MB x 2 轮转，不需要日常清理。
set -uo pipefail

REPO_NAME="${SVPN_REPO_NAME:-SilverVPN}"
TRUNCATE_BYTES="${SVPN_LOG_TRUNCATE_BYTES:-33554432}"
TRUNCATE=1
DRY_RUN=0
ONLY_USER=""

usage() {
  cat <<'EOF'
用法：sudo bash upgrade-all-users.sh [--dry-run] [--user <用户名>] [--no-truncate]
  --dry-run       只检查仓库版本、二进制与日志大小，不做任何修改
  --user <用户名> 只升级指定用户
  --no-truncate   不清理历史超大日志
EOF
}

say() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
ok() { printf '  [完成] %s\n' "$*"; }
warn() { printf '  [警告] %s\n' "$*" >&2; }
err() { printf '  [失败] %s\n' "$*" >&2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --no-truncate)
      TRUNCATE=0
      shift
      ;;
    --user)
      ONLY_USER="${2:-}"
      if [ -z "$ONLY_USER" ]; then
        err "--user 需要一个用户名"
        exit 2
      fi
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      err "未知参数：$1"
      usage >&2
      exit 2
      ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  if [ -n "$ONLY_USER" ] && [ "$ONLY_USER" != "$(id -un)" ]; then
    err "升级其他用户需要 root：sudo bash $0 --user $ONLY_USER"
    exit 1
  fi
  ONLY_USER="$(id -un)"
  warn "未以 root 运行，只处理当前用户 $(id -un)"
fi

list_users() {
  local name _passwd _uid _gid _gecos home _shell
  while IFS=: read -r name _passwd _uid _gid _gecos home _shell; do
    [ -n "$name" ] && [ -n "$home" ] || continue
    [ -d "$home" ] && [ "$home" != "/" ] || continue
    printf '%s:%s\n' "$name" "$home"
  done < <(getent passwd)
}

find_repo() {
  local home=$1 candidate found
  for candidate in "$home/app/$REPO_NAME" "$home/$REPO_NAME"; do
    if [ -f "$candidate/scripts/install-svpn.sh" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  found=$(find "$home" -maxdepth 5 \
    \( -name node_modules -o -name .git -o -name .cache -o -name .npm -o -name .local -o -name .vscode-server -o -name .vscode-server-insiders \) -prune -o \
    -type f -path "*/$REPO_NAME/scripts/install-svpn.sh" -print 2>/dev/null | head -n 1)
  if [ -n "$found" ]; then
    printf '%s\n' "$(dirname "$(dirname "$found")")"
    return 0
  fi
  return 1
}

user_node_path() {
  local home=$1 dir
  for dir in "$home"/.nvm/versions/node/*/bin; do
    [ -x "$dir/node" ] && printf '%s:' "$dir"
  done
}

run_as() {
  local user=$1 home=$2
  shift 2
  local nodepath
  nodepath=$(user_node_path "$home")
  if [ "$(id -u)" -ne 0 ]; then
    env HOME="$home" USER="$user" LOGNAME="$user" PATH="$nodepath$PATH" "$@"
  elif command -v runuser >/dev/null 2>&1; then
    runuser -u "$user" -- env HOME="$home" USER="$user" LOGNAME="$user" PATH="$nodepath$PATH" "$@"
  else
    sudo -u "$user" -H env PATH="$nodepath$PATH" "$@"
  fi
}

truncate_logs() {
  local home=$1 file size
  [ "$TRUNCATE" = "1" ] || return 0
  for file in "$home/.config/SilverVPN/logs/svpn-core.log" "$home/.config/SilverVPN/logs/svpn-core.err.log"; do
    [ -f "$file" ] || continue
    size=$(stat -c %s "$file" 2>/dev/null || printf '0')
    [ "$size" -gt "$TRUNCATE_BYTES" ] 2>/dev/null || continue
    if [ "$DRY_RUN" = "1" ]; then
      ok "将截断 $(basename "$file")（$((size / 1048576)) MB）"
      continue
    fi
    if truncate -s 0 "$file"; then
      ok "已截断 $(basename "$file")（$((size / 1048576)) MB）"
    else
      warn "无法截断 $(basename "$file")"
    fi
  done
}

upgrade_user() {
  local user=$1 home=$2 repo=$3
  local svpn="$home/.local/bin/svpn"
  local before after output was_running=0

  if [ "$DRY_RUN" = "1" ]; then
    printf '  仓库：%s\n' "$repo"
    printf '  当前版本：%s（%s）\n' \
      "$(run_as "$user" "$home" git -C "$repo" describe --tags --abbrev=0 2>/dev/null || printf 'unknown')" \
      "$(run_as "$user" "$home" git -C "$repo" rev-parse --short HEAD 2>/dev/null || printf 'unknown')"
    printf '  二进制：%s\n' "$([ -x "$svpn" ] && printf '%s' "$svpn" || printf '未安装')"
    if run_as "$user" "$home" "$svpn" status --json 2>/dev/null | grep -q '"running": *true'; then
      printf '  代理后台：运行中\n'
    else
      printf '  代理后台：未运行\n'
    fi
    truncate_logs "$home"
    return 0
  fi

  # install-svpn.sh 会给 bin/svpn 加执行位，服务器上容易留下 100644 -> 100755
  # 的差异并阻塞 git pull；这里只恢复这一个文件，其它本地改动保持不动。
  if [ -n "$(run_as "$user" "$home" git -C "$repo" status --porcelain -- bin/svpn 2>/dev/null)" ]; then
    if ! run_as "$user" "$home" git -C "$repo" restore bin/svpn >/dev/null 2>&1; then
      run_as "$user" "$home" git -C "$repo" checkout -- bin/svpn >/dev/null 2>&1 || true
    fi
  fi

  before=$(run_as "$user" "$home" git -C "$repo" rev-parse --short HEAD 2>/dev/null)
  if ! output=$(run_as "$user" "$home" git -C "$repo" pull --ff-only 2>&1); then
    err "git pull 失败（可能有本地改动或分支已分叉）："
    printf '%s\n' "$output" | tail -n 6 | sed 's/^/    /' >&2
    return 1
  fi
  after=$(run_as "$user" "$home" git -C "$repo" rev-parse --short HEAD 2>/dev/null)
  if [ "$before" = "$after" ]; then
    ok "代码已是最新（$after）"
  else
    ok "代码已更新 ${before:-?} -> ${after:-?}"
  fi

  if ! run_as "$user" "$home" test -d "$repo/node_modules/js-yaml"; then
    if ! output=$(run_as "$user" "$home" bash -c "cd $(printf '%q' "$repo") && npm install --omit=dev" 2>&1); then
      err "npm install 失败："
      printf '%s\n' "$output" | tail -n 6 | sed 's/^/    /' >&2
      return 1
    fi
    ok "依赖已安装"
  fi

  if ! output=$(run_as "$user" "$home" bash "$repo/scripts/install-svpn.sh" 2>&1); then
    err "install-svpn.sh 失败："
    printf '%s\n' "$output" | tail -n 6 | sed 's/^/    /' >&2
    return 1
  fi
  ok "已刷新 ~/.local/bin/svpn 与 shell hook"

  if run_as "$user" "$home" "$svpn" status --json 2>/dev/null | grep -q '"running": *true'; then
    was_running=1
  elif [ -f "$home/.config/SilverVPN/svpn.pid" ]; then
    was_running=1
  fi

  if [ "$was_running" = "1" ]; then
    run_as "$user" "$home" "$svpn" stop >/dev/null 2>&1 || true
    truncate_logs "$home"
    if ! output=$(run_as "$user" "$home" "$svpn" start 2>&1); then
      err "重启失败（可查看 $home/.config/SilverVPN/logs/svpn-core.err.log）："
      printf '%s\n' "$output" | tail -n 6 | sed 's/^/    /' >&2
      return 1
    fi
    ok "代理后台已用新版本重启"
  else
    ok "代理后台未在运行，跳过重启"
    truncate_logs "$home"
  fi
  return 0
}

total_ok=0
total_fail=0
total_skip=0
results=()

say "扫描用户"
while IFS=: read -r user home; do
  [ -n "$user" ] || continue
  if [ -n "$ONLY_USER" ] && [ "$user" != "$ONLY_USER" ]; then
    continue
  fi
  repo=$(find_repo "$home")
  if [ -z "$repo" ]; then
    if [ -d "$home/.config/SilverVPN" ]; then
      warn "$user 存在 ~/.config/SilverVPN，但找不到 SilverVPN 仓库，需手动升级"
      total_skip=$((total_skip + 1))
      results+=("⚠️  $user：数据目录存在，仓库未找到")
    fi
    continue
  fi

  say "$user  ($repo)"
  if upgrade_user "$user" "$home" "$repo"; then
    total_ok=$((total_ok + 1))
    results+=("✅ $user")
  else
    total_fail=$((total_fail + 1))
    results+=("❌ $user")
  fi
done < <(list_users)

if [ -n "$ONLY_USER" ] && [ "$total_ok" -eq 0 ] && [ "$total_fail" -eq 0 ] && [ "$total_skip" -eq 0 ]; then
  err "没有找到用户 $ONLY_USER 的 SilverVPN 安装"
  exit 1
fi

say "汇总"
for line in "${results[@]}"; do
  printf '  %s\n' "$line"
done
printf '\n  成功 %d，失败 %d，跳过 %d\n' "$total_ok" "$total_fail" "$total_skip"
[ "$total_fail" -eq 0 ] || exit 1
