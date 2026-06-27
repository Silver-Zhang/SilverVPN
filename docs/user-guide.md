# SilverVPN User Guide

[English](user-guide.md) | [中文](user-guide.zh-CN.md)

This guide covers installation and daily use of SilverVPN on Linux. It is written for both desktop users and headless CLI users.

## 1. Requirements

Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y git curl gzip nodejs npm libcap2-bin
```

Recommended Node.js version:

```bash
node --version
npm --version
```

Node.js 18 or newer is recommended.

## 2. Install

```bash
git clone https://github.com/Silver-Zhang/SilverVPN.git
cd SilverVPN
chmod +x scripts/*.sh
./scripts/install.sh
./scripts/install-svpn.sh
```

The installer creates user-level launchers and configuration files under your home directory. It does not require `sudo` for normal proxy-only use.

Installed entries include:

```text
~/.local/bin/silvervpn
~/.local/bin/svpn
~/.local/share/applications/silvervpn.desktop
~/.config/SilverVPN/
```

Open a new shell after installing `svpn`.

## 3. Desktop mode

Launch the GUI from the application menu, the generated desktop icon, or:

```bash
~/.local/bin/silvervpn
```

The desktop client is suitable for personal Linux machines. It provides subscription import, profile selection, node selection, mode switching, system proxy integration, terminal proxy integration, diagnostics, and optional TUN mode.

## 4. Headless CLI mode

The `svpn` command is designed for terminals, remote shells and shared servers.

Check the command:

```bash
command -v svpn
svpn --help
```

Import a subscription:

```bash
svpn import '<subscription-url-or-file>' 'My Profile'
```

Start SilverVPN in proxy-only mode:

```bash
svpn on
svpn status
```

Stop it:

```bash
svpn off
```

## 5. Subscription formats

`svpn import` supports:

- Clash/Mihomo YAML files;
- subscription URLs;
- `sub://...` links;
- base64-encoded subscription lists;
- URI lists;
- common schemes including `ss`, `ssr`, `vmess`, `trojan`, `vless`, `hysteria2`, `tuic`, and `snell`.

Do not paste private subscription URLs into public issues, screenshots, logs, documentation, or chat messages.

## 6. Profile management

List profiles:

```bash
svpn profile list
```

Switch profiles:

```bash
svpn profile use 1
svpn profile use 'My Profile'
```

Rename a profile:

```bash
svpn profile rename 1 'Work Nodes'
```

Delete a profile:

```bash
svpn profile delete 2
```

Deleting the active profile requires explicit confirmation:

```bash
svpn profile delete 1 --yes
```

See [Profile Management](profile-management.md) for details.

## 7. Nodes and modes

List nodes:

```bash
svpn nodes
svpn nodes --delay
```

Switch node:

```bash
svpn use 3
svpn use 'node-name'
```

Set mode:

```bash
svpn mode smart
svpn mode global
svpn mode direct
```

Mode meanings:

| Mode | Meaning |
|---|---|
| smart | rule-based routing; recommended default |
| global | proxied traffic uses the selected node |
| direct | proxied traffic goes direct |

In CLI proxy-only mode, these modes do not enable TUN and do not modify system routes or DNS.

## 8. Terminal proxy integration

`svpn on` writes the current user's terminal proxy state and installs a shell hook through `install-svpn.sh`. New shells automatically inherit the current proxy state.

Check proxy variables:

```bash
env | grep -i proxy
```

Check the exit IP:

```bash
curl -s https://api.ipify.org
echo
```

## 9. VS Code Remote integration

`svpn on` configures both VS Code Stable and VS Code Insiders Remote settings for the current user:

```text
~/.vscode-server/data/Machine/settings.json
~/.vscode-server-insiders/data/Machine/settings.json
~/.vscode-server/server-env-setup
~/.vscode-server-insiders/server-env-setup
```

The generated settings use:

```json
{
  "http.proxy": "http://127.0.0.1:<your-http-port>",
  "http.proxySupport": "override",
  "http.proxyStrictSSL": true
}
```

If VS Code Remote was already running, restart the current user's VS Code server after `svpn on`:

```bash
pkill -f .vscode-server 2>/dev/null || true
pkill -f .vscode-server-insiders 2>/dev/null || true
```

Then reconnect VS Code.

## 10. Network test

```bash
svpn test
```

It checks the exit IP and common developer services such as GitHub, GitHub Copilot, OpenAI, ChatGPT, Claude, and Anthropic API.

Interpretation:

| Result | Meaning |
|---|---|
| HTTP 200 / 30x | reachable |
| HTTP 401 | reachable but authentication is required |
| HTTP 403 | reachable, but the service or node rejected access |
| timeout / SSL error | current node is likely unsuitable |

## 11. Optional TUN mode

TUN mode is optional. It creates a virtual interface and system routing rules so applications that do not support HTTP/SOCKS proxy settings can also be routed.

Install TUN support once:

```bash
./scripts/install-tun.sh
```

Use TUN only when you understand the network impact. Proxy-only mode is recommended for shared servers and remote development environments.

## 12. Update

```bash
cd SilverVPN
git pull --ff-only
./scripts/install.sh
./scripts/install-svpn.sh
```

## 13. Troubleshooting

If the desktop icon does not start:

```bash
cat ~/.local/state/SilverVPN/launcher.log
gtk-launch silvervpn
```

If Electron is missing:

```bash
./scripts/install-electron.sh
./scripts/install.sh
```

If `svpn` is not found:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Then open a new shell.
