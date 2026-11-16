# Multi-user Linux Server Guide

[English](multi-user-server.md) | [中文](multi-user-server.zh-CN.md)

This guide describes how to deploy SilverVPN on a shared Linux server where multiple users may need independent proxy access.

## 1. Design goals

SilverVPN's `svpn` CLI is designed to support shared servers without taking over system networking:

- no TUN in the default server workflow;
- no system route or DNS changes;
- no writes to `/etc/environment`, `/etc/profile.d`, or shell-wide proxy files;
- no changes to other users' home directories;
- per-user configuration, logs, subscriptions, PID files, proxy state and VS Code Remote settings;
- per-user HTTP/SOCKS/API/controller port groups.

## 2. Per-user installation

Each user should install and run SilverVPN from their own Linux account:

```bash
git clone https://github.com/Silver-Zhang/SilverVPN.git ~/app/SilverVPN
cd ~/app/SilverVPN
./scripts/install.sh
./scripts/install-svpn.sh
```

If an administrator provides a shared source copy, copy or clone it in a way that does not preserve another user's `node_modules` ownership. A safe pattern is:

```bash
mkdir -p ~/app
rsync -a --exclude node_modules --exclude .git --exclude clash-runtime --exclude '*.log' \
  /path/to/SilverVPN/ ~/app/SilverVPN/
cd ~/app/SilverVPN
./scripts/install.sh
./scripts/install-svpn.sh
```

## 3. Personal port groups

Each user should use a dedicated base port:

```bash
svpn config ports 20080
```

Port rule:

```text
base       HTTP proxy
base + 1   SOCKS proxy
base + 8   svpn service/API
base + 10  mihomo controller
```

Example:

| Base | HTTP | SOCKS | API | Controller |
|---:|---:|---:|---:|---:|
| 20080 | 20080 | 20081 | 20088 | 20090 |
| 20180 | 20180 | 20181 | 20188 | 20190 |
| 20280 | 20280 | 20281 | 20288 | 20290 |

For larger servers, administrators can publish a read-only port allocation table in a shared documentation directory. Users then run `svpn config ports <their-base-port>` once.

## 4. One-click operation

```bash
svpn on
svpn status
svpn off
```

`svpn on` starts only the current user's proxy-only daemon, writes the current user's terminal proxy state, and configures the current user's VS Code Remote settings.

`svpn off` stops only the current user's daemon and removes only that user's terminal and VS Code proxy integration.

## 5. Subscription and node operations

```bash
svpn import '<private-subscription-url>' 'My Profile'
svpn profile list
svpn profile use 1
svpn profile rename 1 'New Name'
svpn profile delete 2

svpn nodes
svpn nodes --delay
svpn use 3
```

Private subscription URLs should never be written into public documentation, shared logs, screenshots, issue reports or chat messages.

## 6. Modes and tests

```bash
svpn mode smart
svpn mode global
svpn mode direct
svpn test
```

All modes remain proxy-only in the server CLI workflow. They do not enable TUN or modify system networking.

## 7. Per-user files

Typical paths:

```text
~/.config/SilverVPN/
~/.local/bin/svpn
~/.vscode-server/data/Machine/settings.json
~/.vscode-server/server-env-setup
~/.vscode-server-insiders/data/Machine/settings.json
~/.vscode-server-insiders/server-env-setup
```

VS Code settings use:

```json
{
  "http.proxy": "http://127.0.0.1:<personal-http-port>",
  "http.proxySupport": "override",
  "http.proxyStrictSSL": true
}
```

## 8. Operational recommendations

For shared servers:

- prefer proxy-only mode;
- keep TUN disabled unless the administrator explicitly supports it;
- allocate one stable port group per user;
- avoid dynamic port reuse based only on currently listening ports;
- do not share subscription URLs in public files;
- ask users to run `svpn off` when they no longer need the proxy.

## 9. Bulk upgrade (administrators)

On servers with many users, the bundled script upgrades every installed SilverVPN user in one pass:

```bash
sudo bash scripts/upgrade-all-users.sh
```

It walks system accounts, locates each `~/app/SilverVPN` or `~/SilverVPN` checkout, and runs as that user:

1. `git pull --ff-only` (after restoring the `bin/svpn` mode drift left by `install-svpn.sh`);
2. `scripts/install-svpn.sh` to refresh `~/.local/bin/svpn` and the shell hook;
3. if the proxy was running before the upgrade: `svpn stop` → truncate logs over 32 MB → `svpn start`.

Options:

```bash
sudo bash scripts/upgrade-all-users.sh --dry-run        # inspect only, no changes
sudo bash scripts/upgrade-all-users.sh --user alice     # upgrade a single user
sudo bash scripts/upgrade-all-users.sh --no-truncate    # keep oversized historical logs
```

For the first rollout the script is not on the server yet, so fetch it first:

```bash
curl -fsSLO https://raw.githubusercontent.com/Silver-Zhang/SilverVPN/main/scripts/upgrade-all-users.sh
sudo bash upgrade-all-users.sh --dry-run
sudo bash upgrade-all-users.sh
```

Guarantees:

- proxies that were stopped stay stopped; ports, subscriptions and node selection are untouched;
- a user whose `git pull` fails (local edits, diverged branch) is skipped intact and the run continues;
- only the CLI `svpn-core.log` / `svpn-core.err.log` are truncated, and only when larger than 32 MB; since v0.3.4 both rotate at 8 MB × 2, so routine cleanup is unnecessary.
