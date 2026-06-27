# SilverVPN

[English](README.md) | [中文](README.zh-CN.md)

SilverVPN is an open-source Linux VPN and proxy client built around the mihomo core. It provides both a desktop GUI and a headless `svpn` command-line workflow for personal Linux machines, remote development environments, and shared multi-user Linux servers.

The project focuses on practical Linux usage: subscription import, profile management, node selection, smart/global/direct routing, terminal proxy integration, VS Code Remote proxy integration, optional TUN routing, and per-user isolation for server deployments.

## Highlights

- **Linux desktop client**: Electron-based GUI with subscription, node, mode and diagnostics panels.
- **Headless CLI**: `svpn on`, `svpn off`, `svpn status`, `svpn import`, `svpn nodes`, `svpn use`, `svpn test`.
- **Subscription support**: Clash/Mihomo YAML, subscription URLs, `sub://...`, URI lists, and common proxy schemes such as `ss`, `ssr`, `vmess`, `trojan`, `vless`, `hysteria2`, `tuic`, and `snell`.
- **Profile management**: list, switch, rename and delete saved subscription profiles.
- **Routing modes**: smart/rule, global, and direct.
- **Proxy-only mode**: HTTP/SOCKS proxy integration without changing system routes or DNS.
- **Optional TUN mode**: system-level routing for applications that do not support HTTP/SOCKS proxy settings.
- **Multi-user server support**: per-user data directories, per-user ports, per-user daemon, per-user terminal state, and per-user VS Code Remote settings.
- **Developer-tool friendly**: works with terminal tools and remote IDE workflows through explicit proxy variables and VS Code Remote configuration.

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
```

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

See [Multi-user Server Guide](docs/multi-user-server.md) or [多人服务器部署指南](docs/multi-user-server.zh-CN.md).

## Validation

```bash
npm run check
npm run verify
node cli.js doctor
node cli.js status
```

## Safety model

In proxy-only mode, SilverVPN does not modify system routes, DNS, `/etc/environment`, `/etc/profile.d`, or global proxy files. In multi-user CLI deployments, writable paths are restricted to the invoking user's home directory.

TUN mode is optional and requires a separate privileged setup step because it creates a virtual network interface and system routing rules.
