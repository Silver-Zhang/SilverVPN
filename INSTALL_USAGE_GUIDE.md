# 熊猫上网 Linux 安装指南和使用教程

更新时间：2026-06-17

本文档面向 `/home/workspace/codex_workspace/xiongmaosw` 这份 Linux 基础版客户端。它可以在没有图形界面的服务器上运行，也可以在 Linux 桌面环境中启动 Electron 图形界面。当前更推荐先使用 CLI，因为 CLI 已经覆盖账号登录、订阅刷新、mihomo 核心启动和代理连通性验证。

## 1. 当前主机状态

这台主机上的项目目录：

```bash
cd /home/workspace/codex_workspace/xiongmaosw
```

当前已经具备：

- Node.js 环境。
- 工程内 mihomo 核心：`resources/clash-binaries/mihomo-linux-amd64`。
- 可选订阅文件：`subscription.url`（需要用户自行放置，不随仓库发布）。
- CLI 命令：`doctor`、`status`、`import`、`login`、`refresh-user`、`serve`。

本轮没有使用 `sudo`，也没有修改系统级配置。

## 2. 从零安装

如果换到一台新 Linux 主机，按下面步骤准备。

### 2.1 安装 Node 依赖

```bash
cd /home/workspace/codex_workspace/xiongmaosw
npm install
```

如果只运行 CLI，依赖较少；如果要运行 Electron 图形界面，需要系统具备桌面环境、X11/Wayland 和 Electron 所需运行库。

### 2.2 安装 mihomo 核心

优先使用工程内脚本安装，不需要 `sudo`：

```bash
./scripts/install-core.sh --dry-run
./scripts/install-core.sh
node cli.js doctor
```

`doctor` 里能看到 `mihomo-linux-amd64` 或系统里的 `mihomo` / `clash`，就说明核心可用。

如果系统已经安装了 mihomo，也可以指定：

```bash
CLASH_CORE=/absolute/path/to/mihomo node cli.js doctor
```

## 3. 基础健康检查

```bash
cd /home/workspace/codex_workspace/xiongmaosw
npm run check
npm run verify
```

如果要验证真实订阅文件：

```bash
npm run verify:real
```

正常情况下会看到类似：

```text
verify ok
real .url import ok: proxyCount=31
```

## 4. 导入订阅

### 4.1 使用主机上的 `.url` 文件

这是当前最简单的方式：

```bash
node cli.js import subscription.url
node cli.js status
```

`status` 应显示：

```text
configExists: true
proxyCount: 31
```

CLI 会自动把 `.url` 文件里的 `sub://...` 解码成真实订阅地址，并把节点配置保存到默认数据目录。

### 4.2 直接导入订阅 URL

```bash
node cli.js import 'https://example.com/path/to/subscription'
node cli.js status
```

支持以下订阅响应：

- Clash YAML。
- base64 包裹的 Clash YAML。
- Shadowrocket 常见的 base64 SSR/VMess URI 列表。

## 5. 账号登录和刷新订阅

不要把真实密码写进命令历史、README 或脚本。推荐用交互式 `read` 输入：

```bash
cd /home/workspace/codex_workspace/xiongmaosw

read -rp '账号: ' XIONGMAO_USERNAME
read -rsp '密码: ' XIONGMAO_PASSWORD
echo

export XIONGMAO_USERNAME
export XIONGMAO_PASSWORD
export XIONGMAO_API_BASE='https://你的服务端域名或IP'

node cli.js login
node cli.js status

unset XIONGMAO_PASSWORD
```

如果以后只需要刷新账号订阅：

```bash
export XIONGMAO_API_BASE='https://你的服务端域名或IP'
node cli.js refresh-user
node cli.js status
```

说明：

- `login` 会请求 `{base}/v1/login`，按 macOS 客户端兼容逻辑解码服务端响应。
- 成功后会保存 cookie 和脱敏后的登录状态。
- 密码不会写入 `settings.json`。
- `refresh-user` 会用已保存 cookie 请求 `{base}/v1/userinfo`，并刷新 `pc_sub` 节点。

## 6. 启动代理服务

### 6.1 前台启动

```bash
node cli.js serve --port 4788
```

看到服务启动后，另开一个终端验证：

```bash
curl http://127.0.0.1:4788/health
curl http://127.0.0.1:4788/configs
```

`/health` 返回 `mode: "core"` 表示正在使用真实 mihomo 核心；如果返回 `mode: "demo"`，说明核心未找到或配置不可用。

默认代理端口：

- HTTP 代理：`127.0.0.1:4780`
- SOCKS5 代理：`127.0.0.1:4781`
- 本地控制 API：`127.0.0.1:4788`

停止服务：在运行 `serve` 的终端按 `Ctrl+C`。

### 6.2 后台启动

```bash
nohup node cli.js serve --port 4788 > xiongmao-serve.log 2>&1 &
echo $! > xiongmao-serve.pid
```

停止后台服务：

```bash
kill "$(cat xiongmao-serve.pid)"
```

确认没有残留：

```bash
pgrep -af 'node cli.js serve|mihomo-linux-amd64'
```

## 7. 使用代理

### 7.1 终端临时使用

```bash
export http_proxy=http://127.0.0.1:4780
export https_proxy=http://127.0.0.1:4780
export all_proxy=socks5h://127.0.0.1:4781
```

验证公网出口：

```bash
curl -x http://127.0.0.1:4780 https://api.ipify.org
curl --socks5-hostname 127.0.0.1:4781 https://api.ipify.org
```

取消代理：

```bash
unset http_proxy https_proxy all_proxy
```

### 7.2 浏览器使用

把浏览器代理设置成：

- HTTP/HTTPS：`127.0.0.1`，端口 `4780`
- SOCKS5：`127.0.0.1`，端口 `4781`

如果浏览器支持规则代理或 SwitchyOmega，可以单独给需要代理的网站走 `127.0.0.1:4780`。

### 7.3 Linux 桌面系统代理

GNOME 桌面可使用系统代理设置：

- HTTP 代理：`127.0.0.1:4780`
- HTTPS 代理：`127.0.0.1:4780`
- SOCKS 代理：`127.0.0.1:4781`

当前 CLI 不会自动启用 TUN 网卡；它提供的是 HTTP/SOCKS 代理。

## 8. 代理模式

当前 CLI 支持三种模式：

- 智能代理：`rule`
- 全局代理：`global`
- 直连模式：`direct`

### 8.1 智能代理

```bash
node cli.js mode rule
node cli.js status
```

智能代理会使用 Clash/mihomo 规则判断流量。当前真实订阅里的核心规则是：

```yaml
rules:
  - GEOIP,CN,DIRECT
  - MATCH,Proxy
```

含义：

- 中国大陆 IP 直连。
- 其他流量走 `Proxy` 策略组。

### 8.2 全局代理

```bash
node cli.js mode global
node cli.js status
```

全局代理表示所有进入本地 HTTP/SOCKS 代理端口的流量都交给 `GLOBAL`/代理策略处理。

### 8.3 直连模式

```bash
node cli.js mode direct
node cli.js status
```

直连模式表示所有进入本地 HTTP/SOCKS 代理端口的流量都直连。

### 8.4 在线切换

如果 `node cli.js serve --port 4788` 正在运行，`mode` 命令会先保存配置，再尝试即时应用到正在运行的 mihomo：

```bash
node cli.js mode rule
curl http://127.0.0.1:4788/configs
```

如果服务没有运行，命令仍会保存配置；下次启动 `serve` 时会按保存后的模式启动。

注意：当前基础版仍然是 HTTP/SOCKS 代理，不是 TUN 全局接管。因此 `ping`、普通 `ssh`、未设置代理的程序不会因为 `mode rule/global/direct` 自动进入代理。浏览器、curl 或其他软件需要配置代理到：

```text
HTTP/HTTPS: 127.0.0.1:4780
SOCKS5:     127.0.0.1:4781
```

## 9. 切换节点

查看策略组：

```bash
curl http://127.0.0.1:4788/proxies
```

切换 `Proxy` 组节点：

```bash
curl -X PUT \
  -H 'Content-Type: application/json' \
  --data '{"name":"节点名称"}' \
  http://127.0.0.1:4788/proxies/Proxy
```

再次查看当前节点：

```bash
curl http://127.0.0.1:4788/proxies
```

## 10. ChatGPT / OpenAI 连通性验证

注意：`ping chatgpt.com` 是 ICMP 流量，不会经过 HTTP/SOCKS 代理。当前基础版没有启用 TUN，所以 `ping` 不能代表 VPN 节点是否可用。

更可靠的测试方式是用代理访问 HTTPS：

```bash
curl -L -sS -o /dev/null \
  --max-time 25 \
  -w 'chatgpt status=%{http_code} time=%{time_total}\n' \
  -x http://127.0.0.1:4780 \
  https://chatgpt.com/

curl -L -sS -o /dev/null \
  --max-time 25 \
  -w 'openai_api status=%{http_code} time=%{time_total}\n' \
  -x http://127.0.0.1:4780 \
  https://api.openai.com/v1/models
```

结果解释：

- `api.openai.com/v1/models` 返回 `401`：正常，表示已经连到 OpenAI API，只是没有提供 API key。
- `chatgpt.com` 返回 `200` / `3xx`：网页入口可访问。
- `chatgpt.com` 返回 `403`：网络已经到达目标站点，但被 ChatGPT/Cloudflare 策略拒绝。
- `000` 或 timeout：该节点到目标站点不通或超时。

2026-06-17 在本主机上的实测结果：

- 账号登录成功，订阅刷新成功。
- 订阅内 31 个节点被 mihomo 正常识别。
- `ping -c 3 chatgpt.com`：100% packet loss。这个结果不代表代理不可用，因为 ICMP 没有走代理。
- 通过 HTTP 代理访问 `api.openai.com/v1/models`：多个节点返回 `401`，说明 OpenAI API 可达。
- 逐个切换 31 个节点测试 `https://chatgpt.com/`：没有节点返回 `2xx/3xx`；多数节点返回 `403`，部分节点超时或 SSL 连接失败。结论是：当前节点可以到达 OpenAI API，但没有验证出能正常打开 ChatGPT 网页入口的节点。

## 11. 图形界面启动

如果在 Linux 桌面环境中运行：

```bash
npm start
```

当前图形界面仍属于基础版，主要功能闭环建议先以 CLI 为准：

- 导入订阅。
- 登录账号刷新订阅。
- 启动 mihomo 核心。
- 通过 HTTP/SOCKS 代理访问网络。

## 12. 常见问题

### 12.1 `doctor` 找不到核心

执行：

```bash
./scripts/install-core.sh
node cli.js doctor
```

或指定系统核心：

```bash
CLASH_CORE=/absolute/path/to/mihomo node cli.js doctor
```

### 12.2 端口被占用

查看占用：

```bash
ss -lntp | grep -E '4780|4781|4788|4790'
```

停止旧服务：

```bash
pgrep -af 'node cli.js serve|mihomo-linux-amd64'
kill <PID>
```

### 12.3 `status` 没有节点

重新导入订阅：

```bash
node cli.js import subscription.url
node cli.js status
```

或重新刷新账号订阅：

```bash
node cli.js refresh-user
node cli.js status
```

### 12.4 `ping` 不通但 curl 代理可用

这是当前基础版的正常边界。HTTP/SOCKS 代理不会接管 ICMP。要让 `ping`、所有 App、所有系统流量都经过代理，需要后续实现 TUN 或系统透明代理。

### 12.5 ChatGPT 返回 403

这通常表示请求已经到达 ChatGPT/Cloudflare，但当前节点被拒绝。可以尝试：

- 切换其他节点。
- 优先测试节点名里标注支持 ChatGPT 的节点。
- 使用浏览器真实访问而不是 `curl`。
- 如果所有节点都 403，通常需要服务商提供可用节点，而不是本地客户端代码能单方面解决。

## 13. 安全注意事项

- 不要把账号密码写入文档、脚本或 shell history。
- 登录后 cookie 会保存在数据目录的 `settings.json`，不要把该文件发给别人。
- 临时测试建议使用 `--data-dir /tmp/xxx`，测完删除。
- 只有在明确需要系统级代理或安装系统依赖时才考虑 `sudo`。本项目当前安装核心、导入订阅和启动代理都不需要 `sudo`。
