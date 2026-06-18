# SilverVPN 安装指南和使用教程

更新时间：2026-06-18

SilverVPN 是一个 Linux 桌面代理客户端。它使用 `mihomo`/Clash-compatible 核心，提供图形界面、系统代理、智能代理/全局代理/直连模式、节点列表、多个订阅方案、内网绕过规则和出口 IP 测试。

## 1. 新 Linux 主机从零安装

第一步是拉取仓库：

```bash
git clone https://github.com/Silver-Zhang/SilverVPN.git
cd SilverVPN
```

第二步执行一键安装：

```bash
./scripts/install.sh
```

安装脚本会自动执行：

- `npm install`
- 下载 Linux `mihomo` 核心到 `resources/clash-binaries/`
- 创建启动命令 `~/.local/bin/silvervpn`
- 创建 `silvervpn-run`、`silvervpn-code`、`silvervpn-claude`
- 创建应用菜单入口 `~/.local/share/applications/silvervpn.desktop`
- 如果桌面目录存在，创建 `SilverVPN.desktop`

脚本不使用 `sudo`，只写当前用户目录和当前项目目录。

应用菜单只保留 `SilverVPN` 主程序。`silvervpn-code` 等代理启动器仅作为终端命令存在，避免被误认为 SilverVPN 图形界面。

启动方式：

```bash
silvervpn
```

或者在 Linux 应用菜单里搜索 `SilverVPN`。

程序启动后默认保持未连接：不会自动启动代理核心，也不会自动开启系统代理。需要用户明确点击“启动”和“系统代理”。

如果系统缺少 Node.js/npm，先安装 Node.js 18+ 和 npm。Ubuntu 上通常是：

```bash
sudo apt install -y git curl gzip nodejs npm
```

如果 GitHub 下载核心失败，可以走已有代理：

```bash
HTTPS_PROXY=http://127.0.0.1:4780 ./scripts/install.sh
```

也可以指定 mihomo 下载地址：

```bash
MIHOMO_DOWNLOAD_URL=https://.../mihomo-linux-amd64-compatible-v1.19.27.gz ./scripts/install.sh
```

## 2. 仓库更新后的程序更新

推荐直接运行：

```bash
cd SilverVPN
./scripts/update.sh
```

它会在 Git 仓库中执行：

```bash
git pull --ff-only
./scripts/install.sh
```

如果你已经手动执行过 `git pull`，只需要重新运行：

```bash
./scripts/install.sh
```

这样会刷新依赖、核心、桌面入口和启动器。

## 3. 代理方式说明

当前 SilverVPN 不是 WireGuard，也不是 TUN 全局虚拟网卡模式。它是：

- 本地 HTTP/HTTPS 代理：`127.0.0.1:4780`
- 本地 SOCKS5 代理：`127.0.0.1:4781`
- 本地控制 API：`127.0.0.1:4788`
- 后端核心：`mihomo`/Clash-compatible core

开启“系统代理”后，GNOME 会把浏览器等桌面应用的 HTTP/HTTPS/SOCKS 流量指向这些本地端口。未启用系统代理时，浏览器通常仍然直连。

当前版本的“系统与终端代理”开关还会自动管理 Bash/Zsh 的代理环境。新终端会立即继承；已经打开的终端会在下一次出现命令提示符时同步。已经运行的 Copilot、Claude Code 或 IDE 进程必须结束后重新启动，因为 Linux 不能从外部修改现有进程的环境。

`ping`、普通 `ssh` 以及不支持 HTTP/SOCKS 代理的程序仍不会自动走代理。它们需要 TUN 路由模式；检测到 ExpressVPN 等其他 VPN 时，SilverVPN 不会启用 TUN。

命令行临时走代理：

```bash
export HTTP_PROXY=http://127.0.0.1:4780
export HTTPS_PROXY=http://127.0.0.1:4780
export http_proxy=http://127.0.0.1:4780
export https_proxy=http://127.0.0.1:4780
export NO_PROXY=localhost,127.0.0.1,::1,.reallab.org.cn
export no_proxy="$NO_PROXY"
```

取消：

```bash
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy NO_PROXY no_proxy
```

也可以不修改当前 shell：

```bash
silvervpn-run curl -I https://www.google.com
```

## 4. 三种模式

图形界面和 CLI 都支持：

```bash
node cli.js mode rule
node cli.js mode global
node cli.js mode direct
```

含义：

- 智能代理：内网/绕过规则、中国大陆 GEOIP 直连，其余走代理节点。
- 全局代理：所有进入 HTTP/SOCKS 代理端口的流量走代理策略组。
- 直连模式：所有进入 HTTP/SOCKS 代理端口的流量直连。

在实验室内网环境下，推荐使用“智能代理 + 系统代理”。这样 GitLab、内网服务器等直连，ChatGPT/Google 等境外流量走代理。

## 5. 直连/绕过地址

右侧 `Direct bypass` 面板可以配置绕过地址。每行一个域名或 CIDR：

```text
gitlab.example.org
*.example.org
192.168.0.0/16
```

SilverVPN 默认已经内置：

- `localhost`
- `127.0.0.0/8`
- `::1`
- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16`
- `169.254.0.0/16`
- `gitlab.reallab.org.cn`
- `*.reallab.org.cn`
- `*.local`

点击保存后，规则会同时应用到：

- GNOME 系统代理 ignore-hosts
- mihomo 运行时 Clash rules

所以用户不需要手动编辑配置文件。

## 6. 账号登录和 Base URL

账号登录需要服务端 API 根地址，也就是界面里的 `API base URL`。这个地址必须支持：

- `POST {base}/v1/login`
- `GET {base}/v1/userinfo`

如果服务商提供官方 API 域名，就填写这个根地址，例如：

```text
https://api.example.com
```

如果只是使用订阅 URL，不需要填写 Base URL，直接在订阅框导入 URL 即可。

当前仓库不硬编码私有服务域名。如果没有服务商提供的 API base URL，账号登录模式无法自动猜出地址。

## 7. 多配置方案和节点列表

SilverVPN 现在把节点来源分成多个 profile：

- `SilverVPN Account (...)`：通过账号登录/刷新得到的节点。
- `Custom Subscription`：用户手动导入的订阅 URL、`.url`、`sub://...` 或 Clash YAML。

每次导入都会保存成独立 profile。使用方式：

1. 在 `Profiles` 面板导入订阅或登录账号。
2. 在 profile 下拉框选择要使用的方案。
3. 中间节点列表会显示该方案里的节点。
4. 点击节点行里的 `Switch`/`切换`。

不同 profile 的节点互不混在一起。

账号登录或刷新成功后，GUI 会自动切到账号 profile，并检查服务端实际返回的节点数量。全局模式使用 mihomo 的 `GLOBAL` 选择器；智能模式使用 `Proxy` 选择器，界面显示和真实出口保持一致。

## 8. 出口 IP

右侧 `Connectivity` / `连通性测试` 面板有 `Outbound IP` / `出口 IP` 按钮。它会通过当前代理节点查询公网 IP，显示：

- IP
- country/region/city
- org/运营商
- 使用的本地代理

这个 IP 就是访问境外网站时对方看到的公网出口。

## 9. Claude Code 和 VS Code 扩展

网页能打开 Claude，并不代表终端或 VS Code 扩展会自动走代理。GNOME “系统代理”主要供浏览器和遵循桌面代理设置的应用读取；Claude Code 官方使用 `HTTP_PROXY` / `HTTPS_PROXY`，且不支持只配置 SOCKS。

启动 Claude Code：

```bash
silvervpn-claude
```

启动带代理环境的 VS Code：

```bash
silvervpn-code
```

必须先完全退出已经运行的 VS Code，再运行 `silvervpn-code`。否则旧的 extension host 仍保留启动时的旧环境。

智能模式已将以下 Claude 必需域名明确设置为走节点，不应加入绕过列表：

- `api.anthropic.com`
- `claude.ai`
- `platform.claude.com`
- `downloads.claude.ai`
- `bridge.claudeusercontent.com`

应绕过的只包括本机、实验室内网和明确的内部站点，例如：

- `localhost`
- `127.0.0.1`
- `192.168.0.0/16`
- `gitlab.reallab.org.cn`
- `*.reallab.org.cn`

网络检查：

```bash
silvervpn-run curl -I https://api.anthropic.com
```

返回 HTTP `401`、`403` 或其他服务端状态，通常说明网络已经到达 Anthropic；连接超时或 DNS 错误才是代理链路问题。

## 10. 网络状态与多个 VPN 冲突

右侧“网络状态”面板会定时显示：

- 不经过 SilverVPN 的直连公网 IP
- 经过 SilverVPN 本地 HTTP 代理的公网 IP
- GNOME 当前系统代理及其是否属于 SilverVPN
- IPv4/IPv6 默认路由
- `tun`、`tap`、`wg`、`ppp` 等隧道网卡
- SilverVPN 的 `4780`、`4781`、`4788`、`4790` 监听状态
- ExpressVPN、iNode、OpenVPN、WireGuard、mihomo 等相关进程

当 SilverVPN 出口已是境外，但“直连出口”仍是中国，这是当前 HTTP 代理模式的正常现象。只有实际使用系统代理或代理环境变量的应用才会显示 SilverVPN 出口。如果 ExpressVPN/iNode 改写默认路由，直连出口和隧道网卡也会反映出来。

### ExpressVPN 兼容原则

SilverVPN 不创建第二张 TUN 网卡，也不修改系统默认路由、ExpressVPN 策略路由、DNS 或 kill switch。原因是两个整机 VPN 同时接管路由时，无法保证 ExpressVPN 完全不受影响。

因此，当“不能影响 ExpressVPN”是前提时：

- ExpressVPN 继续作为系统级 VPN。
- SilverVPN 只处理进入本地 HTTP/SOCKS 或 GNOME 系统代理的流量。
- 这些流量仍会按智能规则自动区分境内直连和境外节点。
- SilverVPN 不承诺接管所有不支持系统代理的后台程序、终端命令、ICMP 或自定义网络协议。

整机自动分流和“ExpressVPN 完全不受影响”不能同时作为强保证。SilverVPN 默认选择后者。

## 11. 语言和程序名

程序名已经改为 `SilverVPN`，桌面启动器、菜单入口和窗口标题都使用 ASCII 名称，避免 Linux 桌面环境中文乱码。

界面提供 `Language` 下拉框：

- `中文`
- `English`

语言设置保存在用户配置中。

## 12. 常用检查命令

```bash
node cli.js doctor
node cli.js status
npm run check
npm run verify
```

启动本地服务：

```bash
node cli.js serve --port 4788
```

验证端口：

```bash
curl http://127.0.0.1:4788/health
curl http://127.0.0.1:4788/configs
curl http://127.0.0.1:4788/proxies
```

验证 Google/OpenAI：

```bash
curl -L -x http://127.0.0.1:4780 https://www.google.com/
curl -L -x http://127.0.0.1:4780 https://api.openai.com/v1/models
```

OpenAI API 返回 `401` 通常表示网络已到达，只是没有提供 API key。
