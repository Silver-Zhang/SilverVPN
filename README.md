# SilverVPN

SilverVPN is a Linux desktop proxy client built around a Linux `mihomo`/Clash-compatible core. It provides an Electron GUI, a CLI, local HTTP/SOCKS proxy ports, GNOME system-proxy integration, profile management, node switching, delay tests, outbound IP checks, and account/subscription import flows.

## One-Command Install

On a new Linux desktop host:

```bash
git clone https://github.com/Silver-Zhang/SilverVPN.git
cd SilverVPN
./scripts/install.sh
```

The installer is user-local and does not use `sudo`. It will:

- run `npm install`
- download and install a Linux `mihomo` core into `resources/clash-binaries/`
- create the launcher `~/.local/bin/silvervpn`
- create `silvervpn-run`, `silvervpn-code`, and `silvervpn-claude` proxy-aware launchers
- create the application-menu entry `~/.local/share/applications/silvervpn.desktop`
- copy the desktop icon as `SilverVPN.desktop` when a desktop folder exists

Only `SilverVPN` is added to the application menu. The proxy-aware command wrappers remain terminal commands, so they cannot be confused with the SilverVPN desktop window.

Start it from the app menu by searching `SilverVPN`, or run:

```bash
silvervpn
```

If the downloaded core cannot be fetched from GitHub, retry with a proxy:

```bash
HTTPS_PROXY=http://127.0.0.1:4780 ./scripts/install.sh
```

## Update After `git pull`

From an existing clone:

```bash
cd SilverVPN
./scripts/update.sh
```

`update.sh` runs `git pull --ff-only` when the directory is a Git repository, then re-runs the same idempotent desktop installer. If you already pulled manually, run:

```bash
./scripts/install.sh
```

## Daily Use

The GUI supports two profile sources:

- Account profile: log in with a SilverVPN-compatible account API and refresh `pc_sub` nodes.
- Custom subscription profile: import a subscription URL, `sub://...`, `.url`, or Clash YAML file.

Each import is kept as a separate profile. Select the profile in the `Profiles` panel, then choose a node from that profile's node list.

The application opens disconnected. Starting the GUI does not start the core or enable proxying. Enabling `System and terminal proxy` starts the core, configures GNOME, and automatically synchronizes HTTP/SOCKS proxy variables into Bash and Zsh prompts. Processes that were already running must be restarted.

## Account Base URL

The account flow expects a backend API root that supports:

- `POST {base}/v1/login`
- `GET {base}/v1/userinfo`

If you only use subscription URLs, you do not need a base URL. If you want account login and automatic account subscription refresh, fill the official API base URL supplied by the service provider. This repository does not hard-code a private service domain.

## Bypass / Direct Rules

The GUI has a `Direct bypass` panel. Add one host or CIDR per line, for example:

```text
gitlab.example.org
*.example.org
192.168.0.0/16
```

SilverVPN always includes common local and private ranges by default, including `localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, and `192.168.0.0/16`. These entries are applied both to GNOME system-proxy ignore hosts and to the runtime Clash rules, so intranet sites can stay direct while ChatGPT/Google use the selected proxy node.

## Modes

```bash
node cli.js mode rule    # smart mode: bypass/default direct rules + CN direct, others proxy
node cli.js mode global  # all proxy-entered traffic uses the proxy group
node cli.js mode direct  # all proxy-entered traffic goes direct
```

The Linux client currently provides HTTP/SOCKS proxy mode:

- HTTP/HTTPS proxy: `127.0.0.1:4780`
- SOCKS5 proxy: `127.0.0.1:4781`
- control API: `127.0.0.1:4788`

It is not a WireGuard client and does not enable a TUN device yet. Browser traffic uses the proxy when GNOME system proxy is enabled; command-line tools can use `http_proxy` / `https_proxy` / `all_proxy`.

## Claude Code And VS Code

Claude Code requires an HTTP/HTTPS proxy and does not support a SOCKS-only proxy. Start it with:

```bash
silvervpn-claude
```

Launch VS Code so its Claude extension host inherits the same proxy:

```bash
silvervpn-code
```

Fully quit an already running VS Code instance before using `silvervpn-code`; an existing extension host keeps its old environment. For any other terminal command:

```bash
silvervpn-run curl -I https://api.anthropic.com
```

Claude/Anthropic domains are forced through the `Proxy` group in smart mode. Only localhost, private laboratory networks, and configured intranet domains belong in `NO_PROXY`; do not add `anthropic.com` or `claude.ai`.

## Network Status

The GUI network panel compares the machine's direct public IP with the SilverVPN proxy IP and shows GNOME system proxy ownership, default routes, tunnel interfaces, listening local ports, and other detected VPN processes. This makes route conflicts from ExpressVPN, iNode, OpenVPN, or similar software visible.

## ExpressVPN Compatibility

SilverVPN does not install a TUN interface or change the system routing table. This is intentional: when ExpressVPN is active, a second system-wide TUN client cannot guarantee that it will leave ExpressVPN's routes, DNS, kill switch, and tunnel behavior unchanged.

In this compatibility model, ExpressVPN remains the system VPN. SilverVPN only handles applications that use its local HTTP/SOCKS or GNOME system-proxy entry. Smart rules still classify that traffic as China/private direct and foreign proxy. Whole-machine automatic classification is not enabled while preserving the guarantee that ExpressVPN is unaffected.

## Useful CLI

```bash
node cli.js doctor
node cli.js status
node cli.js import 'https://example.com/subscription'
node cli.js serve --port 4788
```

The CLI accepts `SILVERVPN_DATA_DIR` for a custom data directory and still accepts legacy `XIONGMAO_*` account environment variables for compatibility.
