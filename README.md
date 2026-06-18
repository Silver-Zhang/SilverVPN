# SilverVPN

SilverVPN is a Linux desktop client for mihomo-compatible subscriptions. It provides account and subscription profiles, node selection, smart/global/direct routing, GNOME and terminal proxy integration, optional TUN routing, diagnostics, and intranet bypass rules.

## Install

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
```

The normal installer does not use `sudo`. It creates:

- `~/.local/bin/silvervpn`
- `~/.local/share/applications/silvervpn.desktop`
- `~/Desktop/SilverVPN.desktop` or the localized desktop equivalent
- `~/.config/SilverVPN/shell-hook.sh`

It removes obsolete `silvervpn-run`, `silvervpn-code`, and `silvervpn-claude` launchers. There is only one application entry: `SilverVPN`.

Launch it from the application menu, the desktop icon, or:

```bash
~/.local/bin/silvervpn
```

The launcher directly executes the installed Electron binary, so it does not depend on the graphical desktop inheriting an nvm or shell-specific `PATH`.

## Desktop Icon Troubleshooting

If clicking the icon does nothing:

```bash
cat ~/.local/state/SilverVPN/launcher.log
gtk-launch silvervpn
```

Recreate the launcher:

```bash
cd ~/SilverVPN
./scripts/install.sh
```

On GNOME, a copied `.desktop` file may require right-clicking it and choosing **Allow Launching**. The installer also marks it trusted through `gio` when supported.

## Update

```bash
cd ~/SilverVPN
./scripts/update.sh
```

If the repository was already pulled:

```bash
./scripts/install.sh
```

## Routing Options

### System And Terminal Proxy

This mode starts the normal user-owned mihomo core and configures:

- HTTP proxy: `127.0.0.1:4780`
- SOCKS5 proxy: `127.0.0.1:4781`
- GNOME system proxy
- Bash/Zsh proxy environment synchronization

New terminal processes inherit the proxy automatically. Existing applications must be restarted because Linux cannot change the environment of an already running process.

### TUN Mode

TUN routes applications that do not support HTTP/SOCKS settings. It is off by default and requires a one-time privileged installation:

```bash
./scripts/install-tun.sh
```

The script:

- downloads a pinned official mihomo release
- verifies its SHA256 digest
- installs it root-owned at `/usr/local/libexec/silvervpn/mihomo`
- grants only `CAP_NET_ADMIN`
- records privileged commands in `logs/privileged-commands.log`

TUN uses the dedicated interface `silvervpn0`, route table `20229`, and rule range starting at `19000`. SilverVPN verifies that these artifacts disappear when TUN stops.

SilverVPN refuses to enable TUN when ExpressVPN, iNode, OpenVPN, WireGuard, another tunnel interface, or conflicting policy routing is active. It never flushes another VPN's routes.

The TUN panel provides:

- **Recheck**: refresh conflict detection without changing the network.
- **Restore network**: stop SilverVPN-owned proxy/TUN state and verify that `silvervpn0`, table `20229`, and SilverVPN rules are gone.

It deliberately does not offer “remove other VPN policies”; deleting unknown routes cannot be made safe.

## Modes

- **Smart / Rule**: private networks and China traffic direct; foreign traffic through the selected node.
- **Global**: traffic handled by SilverVPN uses the selected node.
- **Direct**: traffic handled by SilverVPN goes direct.

CLI equivalents:

```bash
node cli.js mode rule
node cli.js mode global
node cli.js mode direct
```

## Profiles

SilverVPN supports:

- account login and `pc_sub` refresh
- subscription URL
- `sub://...`
- `.url`, YAML, or text subscription files

Each source is stored as a separate profile with its own node list.

## ExpressVPN

Only one system-level tunnel should own routing at a time:

1. Disconnect ExpressVPN and disable any active split-tunnel routing.
2. Confirm the SilverVPN TUN panel reports that preflight passed.
3. Enable SilverVPN TUN.
4. Disable SilverVPN TUN and wait for cleanup before reconnecting ExpressVPN.

When ExpressVPN must remain active, leave SilverVPN TUN off and use **System and terminal proxy**.

## Validation

```bash
npm run check
npm run verify
node cli.js doctor
node cli.js status
```

See [INSTALL_USAGE_GUIDE.md](INSTALL_USAGE_GUIDE.md) for the complete Chinese installation and usage guide.
