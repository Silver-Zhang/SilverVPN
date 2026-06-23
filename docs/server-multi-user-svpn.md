# SilverVPN server multi-user proxy-only workflow

This workflow is for shared Linux servers such as `server29`.

Design rules:

- No TUN.
- No `/etc/environment` proxy variables.
- No `/etc/profile.d` global proxy injection.
- Each Linux user owns their own subscription, config, ports, shell proxy file and VS Code Remote proxy settings.
- The backend is proxy-only and can run in the background.

## Install the command

From each user's own account:

```bash
cd ~/app/SilverVPN
./scripts/install-svpn.sh
export PATH="$HOME/.local/bin:$PATH"
```

## Import subscription

Do not paste subscription links into shared logs.

```bash
svpn import 'sub://...'
```

## Set personal ports

If only one user is running SilverVPN, the default port base can be `4780`.

For multiple simultaneous users, assign a different base port to each user:

```text
silver:        4780 -> HTTP 4780, SOCKS 4781, Core 4790
zhangjunxiao: 4880 -> HTTP 4880, SOCKS 4881, Core 4890
renyushuo:    4980 -> HTTP 4980, SOCKS 4981, Core 4990
```

Example:

```bash
svpn config ports 4880
```

## Start backend

```bash
svpn start --proxy
source ~/.config/SilverVPN/shell-proxy.sh
```

Check status:

```bash
svpn status
```

Example output:

```text
SilverVPN：运行中
用户：zhangjunxiao
模式：智能代理 (rule)
节点：2 美国洛杉矶（支持chatgpt gemini claude）  180 ms
代理：HTTP 4880 / SOCKS 4881
终端代理：已开启
VS Code：已配置 override
后台：PID 12345
```

## Switch mode

```bash
svpn mode smart
svpn mode global
svpn mode direct
```

## Switch node

```bash
svpn nodes
svpn nodes --delay
svpn use 17
svpn use '2 美国洛杉矶'
```

## Configure VS Code Remote

```bash
svpn vscode on
pkill -f .vscode-server || true
```

Reconnect VS Code Remote after killing the server.

This writes per-user files only:

```text
~/.vscode-server/data/Machine/settings.json
~/.vscode-server/server-env-setup
~/.config/SilverVPN/shell-proxy.sh
```

It sets:

```json
{
  "http.proxy": "http://127.0.0.1:<user-http-port>",
  "http.proxySupport": "override",
  "http.proxyStrictSSL": true
}
```

## Test connectivity

```bash
svpn test
```

## Stop

```bash
svpn stop
source ~/.config/SilverVPN/shell-proxy.sh
```

## Notes

- `svpn` starts mihomo directly with a runtime config generated from the user's active config.
- Runtime config removes `tun`, `mixed-port`, `redir-port` and `tproxy-port` to keep the server proxy-only.
- Port assignments are stored in `~/.config/SilverVPN/server.json`.
- The process PID is stored in `~/.config/SilverVPN/svpn.pid`.
- Logs are under `~/.config/SilverVPN/logs/`.
