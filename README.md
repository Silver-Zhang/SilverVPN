# SilverVPN

[English](README.md) | [中文](README.zh-CN.md)

SilverVPN is an open-source Linux VPN and proxy client built around the mihomo core. It provides both a desktop GUI and a headless `svpn` command-line workflow for personal Linux machines, remote development environments, and shared multi-user Linux servers.

The project focuses on practical Linux usage: subscription import, profile management, node selection, smart/global/direct routing, terminal proxy integration, VS Code Remote proxy integration, optional TUN routing, and per-user isolation for server deployments.

## Highlights

- **Linux desktop client**: Electron-based GUI with subscription, node, mode and diagnostics panels.
- **Headless CLI**: `svpn on`, `svpn off`, `svpn status`, `svpn import`, `svpn nodes`, `svpn use`, `svpn traffic`, `svpn test`.
- **Subscription support**: Clash/Mihomo YAML, subscription URLs, `sub://...`, URI lists, and common proxy schemes such as `ss`, `ssr`, `vmess`, `trojan`, `vless`, `hysteria2`, `tuic`, and `snell`.
- **Profile management**: list, switch, rename and delete saved subscription profiles.
- **Routing modes**: smart/rule, global, and direct.
- **Proxy-only mode**: HTTP/SOCKS proxy integration without changing system routes or DNS.
- **Optional TUN mode**: system-level routing for applications that do not support HTTP/SOCKS proxy settings.
- **Multi-user server support**: per-user data directories, per-user ports, per-user daemon, per-user terminal state, and per-user VS Code Remote settings.
- **Custom port group**: the GUI network panel and the CLI (`svpn config ports`) share one port configuration, so a change on either side applies to both.
- **Modern themed UI**: 7 color themes, custom background image, glass opacity, theme-colored hover glow, and a live particle-physics backdrop — place and drag emitters and gravity sources, pick ring-orbit or black-hole capture, and configure spin direction (CW/CCW/random).
- **Live monitor & traffic stats**: real-time traffic/delay/connection charts, per-node traffic by proxy/direct route for today/3/7/30 days, server-address visibility, and matching `svpn traffic` CLI reports.
- **Safe proxy lifecycle**: system/shell proxy updates are transactional and roll back on failure; log retention is capped (10 MB × 3 files) with stale-log cleanup.
- **Developer-tool friendly**: works with terminal tools and remote IDE workflows through explicit proxy variables and VS Code Remote configuration; automatically disables mihomo IPv6 when the host lacks usable IPv6 routing.

## Documentation

| Topic | English | 中文 |
|---|---|---|
| Installation and usage | [User Guide](docs/user-guide.md) | [用户手册](docs/user-guide.zh-CN.md) |
| Multi-user Linux server deployment | [Multi-user Server Guide](docs/multi-user-server.md) | [多人服务器部署指南](docs/multi-user-server.zh-CN.md) |
| Subscription profile management | [Profile Management](docs/profile-management.md) | [订阅方案管理](docs/profile-management.zh-CN.md) |

Legacy document paths are kept for compatibility, but the generic documents above are the preferred entry points.

## Quick install

Ubuntu/Debian prerequisites:

```bash
sudo apt update
sudo apt install -y git curl gzip nodejs npm libcap2-bin
```

Clone and install:

```bash
git clone https://github.com/Silver-Zhang/SilverVPN.git
cd SilverVPN
./scripts/install.sh
./scripts/install-svpn.sh
```

The desktop launcher is installed to `~/.local/bin/silvervpn`. The headless CLI is installed to `~/.local/bin/svpn`.

Open a new shell after installing `svpn`, or ensure `~/.local/bin` is in `PATH`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## Desktop usage

Launch SilverVPN from the application menu, from the generated desktop icon, or with:

```bash
~/.local/bin/silvervpn
```

The desktop mode is suitable for personal Linux machines where GNOME system proxy integration and GUI-based node selection are preferred.

## Headless CLI usage

Import a subscription:

```bash
svpn import '<subscription-url-or-file>' 'My Profile'
```

Start the per-user proxy-only backend and integrations:

```bash
svpn on
svpn status
```

Manage nodes and routing mode:

```bash
svpn nodes --delay
svpn use 3
svpn mode smart
svpn test
svpn traffic             # Today's per-node proxy/direct traffic
svpn traffic 7           # Last 7 days
svpn traffic 30 --json   # Last 30 days as JSON
svpn traffic --details   # Target domain/IP/port breakdown
```

`svpn traffic` reads the same persisted ledger as the desktop GUI and reports upload/download totals split by proxy node (including server address) and direct traffic. Use `--details` to show the top proxy targets by domain/IP/port. The process that owns the running mihomo core collects the ledger, so CLI-only deployments work without starting the desktop GUI. Valid ranges are `today` (default), `3`, `7`, and `30`.

Manage bypassed (direct) hosts:

```bash
svpn bypass list              # Show built-in defaults plus your custom bypass hosts
svpn bypass add example.com   # Add a bypass host (hot-reloaded when the core is running)
svpn bypass remove example.com
```

> The desktop GUI and the CLI share the same settings file and proxy core. With the GUI running, `svpn status` reports "running (desktop GUI core)"; if the CLI port group differs, `svpn on` guides you to align ports and reuse the existing core instead of starting a conflicting one.

Stop the current user's backend and proxy integrations:

```bash
svpn off
```

## Multi-user server usage

For shared servers, each Linux user should install and run `svpn` under their own account. SilverVPN stores each user's configuration under that user's home directory and can use a dedicated personal port group:

```bash
svpn config ports 20080
```

Port group rule:

```text
base       HTTP proxy
base + 1   SOCKS proxy
base + 8   svpn service/API
base + 10  mihomo controller
```

The desktop GUI can also change the port group from the network panel (applies with an automatic core restart). GUI and CLI read and write the same `server.json`, so whichever side changes it, the other immediately uses the same ports and reuses the same core.

See [Multi-user Server Guide](docs/multi-user-server.md) or [多人服务器部署指南](docs/multi-user-server.zh-CN.md).

## Validation

```bash
npm run check
npm run verify
npm run verify:svpn
node cli.js doctor
node cli.js status
```

## Safety model

In proxy-only mode, SilverVPN does not modify system routes, DNS, `/etc/environment`, `/etc/profile.d`, or global proxy files. In multi-user CLI deployments, writable paths are restricted to the invoking user's home directory.

TUN mode is optional and requires a separate privileged setup step because it creates a virtual network interface and system routing rules.
