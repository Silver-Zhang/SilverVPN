# SilverVPN Linux 安装与使用手册

更新时间：2026-06-18

## 1. 功能与工作方式

SilverVPN 是基于 mihomo 的 Linux 桌面客户端，支持：

- 账号登录并更新节点
- 导入订阅 URL、`sub://`、YAML、`.url` 和文本订阅
- 多配置方案和独立节点列表
- 智能代理、全局代理和直连模式
- GNOME 系统代理
- Bash/Zsh 终端自动代理
- 可选 TUN 整机路由
- 内网直连和自定义绕过地址
- 出口 IP、端口、路由、隧道和其他 VPN 状态检查

程序默认不自动连接。启动 UI 后，需要手动选择“系统与终端代理”或“TUN 模式”。

## 2. 新 Linux 电脑安装

### 2.1 安装系统依赖

Ubuntu/Debian：

```bash
sudo apt update
sudo apt install -y git curl gzip nodejs npm libcap2-bin
```

建议 Node.js 18 或更高版本：

```bash
node --version
npm --version
```

### 2.2 下载并安装 SilverVPN

```bash
git clone https://github.com/Silver-Zhang/SilverVPN.git
cd SilverVPN
chmod +x scripts/*.sh
./scripts/install.sh
```

普通安装过程不会使用 `sudo`，会创建：

- 主启动命令：`~/.local/bin/silvervpn`
- 应用菜单：`~/.local/share/applications/silvervpn.desktop`
- 桌面图标：`~/Desktop/SilverVPN.desktop` 或系统本地化桌面目录
- 图标文件：`~/.local/share/icons/hicolor/256x256/apps/silvervpn.png`
- 终端代理钩子：`~/.config/SilverVPN/shell-hook.sh`

安装后只有一个正式入口：`SilverVPN`。旧版本的以下命令会被删除：

```text
silvervpn-run
silvervpn-code
silvervpn-claude
```

终端、Claude、Copilot 和 IDE 统一通过“系统与终端代理”或 TUN 工作，不再维护应用专用版本。

## 3. 启动程序

可以使用以下任一方式：

1. 在应用菜单搜索 `SilverVPN`。
2. 双击桌面的 `SilverVPN` 图标。
3. 在终端执行：

```bash
~/.local/bin/silvervpn
```

启动器直接执行：

```text
项目目录/node_modules/electron/dist/electron
```

因此不会依赖图形桌面是否继承 nvm、asdf 或 `.bashrc` 中的 Node `PATH`。

### 3.1 点击桌面图标没有反应

先查看启动日志：

```bash
cat ~/.local/state/SilverVPN/launcher.log
```

测试应用菜单入口：

```bash
gtk-launch silvervpn
```

重新生成图标和启动器：

```bash
cd ~/SilverVPN
./scripts/install.sh
```

检查文件：

```bash
ls -l ~/.local/bin/silvervpn
ls -l ~/.local/share/applications/silvervpn.desktop
ls -l ~/Desktop/SilverVPN.desktop
```

GNOME 可能要求右键桌面图标并选择“允许启动”。安装器会在系统支持时自动执行 `gio set ... metadata::trusted true`。

如果日志显示 Electron 缺失：

```bash
cd ~/SilverVPN
./scripts/install-electron.sh
./scripts/install.sh
```

该脚本会忽略终端中全局设置的 production-only npm 环境，强制安装开发依赖并启用 npm 安装脚本。如果之前留下了不完整的 Electron 包，它会自动删除该包并重试一次。若仍然失败，请确认当前网络能够访问 npm registry 和 GitHub，也可以先开启可用的系统代理后再次执行。

## 4. 更新程序

推荐：

```bash
cd ~/SilverVPN
./scripts/update.sh
```

它会执行：

```bash
git pull --ff-only
./scripts/install.sh
```

如果已经手动 `git pull`，再次执行 `./scripts/install.sh` 即可。安装脚本可以重复运行，不会删除账号、订阅和用户配置。

## 5. 登录账号与导入订阅

### 5.1 账号登录

界面中的服务端 URL 必须是支持以下接口的 API 根地址：

```text
POST {base}/v1/login
GET  {base}/v1/userinfo
```

输入服务商提供的 URL、账号和密码，点击“登录并更新”。登录成功后，账号订阅会成为一个独立配置方案。

### 5.2 自定义订阅

可以导入：

- HTTPS 订阅 URL
- `sub://...`
- Clash YAML
- `.url` 文件
- URI 列表文本

每个来源保存为独立 profile。在配置方案中选择来源，再从中间节点列表选择节点。

## 6. 三种流量模式

- **智能代理**：实验室内网、私有地址和中国大陆流量直连，其余流量走节点。
- **全局代理**：所有被 SilverVPN 接管的流量走当前节点。
- **直连模式**：所有被 SilverVPN 接管的流量直接连接。

实验室环境通常使用“智能代理”。

CLI：

```bash
node cli.js mode rule
node cli.js mode global
node cli.js mode direct
```

## 7. 系统与终端代理

开启后 SilverVPN 会：

- 启动普通用户权限的 mihomo
- 设置 GNOME HTTP/HTTPS/SOCKS 系统代理
- 监听 HTTP `127.0.0.1:4780`
- 监听 SOCKS5 `127.0.0.1:4781`
- 自动同步 Bash/Zsh 的代理环境变量

新打开的终端会自动继承。已经打开的终端会在下一次出现命令提示符时同步。已经运行的 Copilot、Claude Code、VS Code 或其他 IDE 需要退出并重新启动。

关闭开关后，SilverVPN 会清除由自己设置的 GNOME 和终端代理。

该模式不会接管：

- `ping`
- 普通 `ssh`
- 不支持 HTTP/SOCKS 的程序
- 自定义网络协议

这些流量需要 TUN。

## 8. TUN 模式

TUN 会创建虚拟网卡并接管整机流量，因此终端、Copilot、Claude、IDE、浏览器和多数后台程序不需要单独设置代理。

### 8.1 首次安装 TUN 支持

只需执行一次：

```bash
cd ~/SilverVPN
./scripts/install-tun.sh
```

此脚本会要求 `sudo`，并且只执行：

1. 下载固定版本的官方 mihomo。
2. 校验 SHA256。
3. 安装到 `/usr/local/libexec/silvervpn/mihomo`。
4. 设置 root 所有权。
5. 只授予 `CAP_NET_ADMIN`。

特权命令记录在：

```text
~/SilverVPN/logs/privileged-commands.log
```

检查安装：

```bash
stat -c '%U:%G %A %n' /usr/local/libexec/silvervpn/mihomo
getcap /usr/local/libexec/silvervpn/mihomo
```

预期包含：

```text
root:root
cap_net_admin=ep
```

### 8.2 开启 TUN

1. 关闭 ExpressVPN、iNode、OpenVPN、WireGuard 等其他 VPN。
2. 确认 TUN 面板显示“预检通过”。
3. 选择智能/全局/直连模式。
4. 打开“TUN 模式”。

SilverVPN 使用固定资源：

```text
接口：silvervpn0
路由表：20229
规则起始优先级：19000
```

打开 TUN 时不需要同时打开“系统与终端代理”。

### 8.3 关闭 TUN

关闭开关后，SilverVPN 会停止 TUN 核心，并验证以下内容已经消失：

```bash
ip link show silvervpn0
ip rule show | grep 20229
ip route show table 20229
```

只有确认 SilverVPN TUN 清理完成后，才启动 ExpressVPN。

如果程序异常退出，watchdog 会自动终止核心，让 mihomo 清理自己的网卡和路由。下次开启前仍会检查残留。

## 9. ExpressVPN 共存原则

SilverVPN TUN 和 ExpressVPN 都属于系统级 VPN，不能同时接管路由。

### 使用 SilverVPN TUN

1. 断开 ExpressVPN。
2. 关闭 ExpressVPN Split Tunnel 或其他仍然生效的策略路由。
3. 开启 SilverVPN TUN。
4. 使用结束后关闭 SilverVPN TUN。
5. 等待界面确认关闭，再启动 ExpressVPN。

### 保持 ExpressVPN 运行

保持 SilverVPN TUN 关闭，只使用“系统与终端代理”。SilverVPN 不会删除或覆盖 ExpressVPN 的路由、DNS、kill switch 和接口。

检测到其他 VPN 接口、进程或策略路由时，TUN 按钮会显示冲突并拒绝开启。

### TUN 无法启用时

1. 点击“重新检测”，刷新当前 VPN、接口和策略路由状态。
2. 如果 SilverVPN 上次异常退出，点击“恢复默认网络”。
3. 退出或断开界面中列出的其他 VPN。
4. 再次点击“重新检测”，确认显示“预检通过”。

ExpressVPN 即使显示 `Disconnected`，Split Tunneling 仍可能保留 `evpnrt` 策略。此时需要在 ExpressVPN 设置中关闭 Split Tunneling/拆分隧道，而不只是点击断开。SilverVPN 会明确显示这一原因。

“恢复默认网络”只会处理 SilverVPN 自己的核心、系统代理、终端代理、`silvervpn0`、路由表 `20229` 和 SilverVPN 规则。它不会删除 ExpressVPN、iNode、OpenVPN 或 WireGuard 的策略。

程序不会提供“清理其余策略”功能，因为无法可靠判断未知路由属于哪个 VPN；自动删除会造成断网、kill switch 失效或内网不可达。

## 10. 内网与智能分流

默认直连范围包括：

```text
localhost
127.0.0.0/8
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
169.254.0.0/16
gitlab.reallab.org.cn
*.reallab.org.cn
*.local
```

因此实验室 SSH 和 GitLab 应继续走物理网卡。用户可以在 UI 的“直连/绕过地址”区域添加域名或 CIDR，不需要编辑 YAML。

示例：

```text
gitlab.example.org
*.example.org
192.168.20.0/24
```

## 11. 网络验证

查看状态：

```bash
node cli.js doctor
node cli.js status
npm run check
npm run verify
```

普通代理模式：

```bash
curl -x http://127.0.0.1:4780 https://api.ipify.org
```

TUN 模式下不使用代理参数：

```bash
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
curl https://api.ipify.org
curl -I https://copilot-proxy.githubusercontent.com/_ping
curl -I https://chatgpt.com
```

检查内网：

```bash
ip route get 192.168.9.27
ssh 192.168.9.27
curl -I https://gitlab.reallab.org.cn/
```

节点可能单独屏蔽或重置 Google。Copilot/ChatGPT 可用但 Google 超时时，先切换其他节点再测试，不代表 TUN 未接管。

## 12. 配置和日志位置

```text
用户数据：~/.config/SilverVPN/
运行配置：~/.config/SilverVPN/clash-runtime/config.yaml
订阅配置：~/.config/SilverVPN/subscriptions/
核心日志：~/.config/SilverVPN/logs/core.log
桌面启动日志：~/.local/state/SilverVPN/launcher.log
特权命令记录：项目目录/logs/privileged-commands.log
```

## 13. 卸载

先关闭系统代理和 TUN，然后：

```bash
rm -f ~/.local/bin/silvervpn
rm -f ~/.local/bin/silvervpn-run
rm -f ~/.local/bin/silvervpn-code
rm -f ~/.local/bin/silvervpn-claude
rm -f ~/.local/share/applications/silvervpn.desktop
rm -f ~/Desktop/SilverVPN.desktop
rm -f ~/.local/share/icons/hicolor/256x256/apps/silvervpn.png
```

如需删除 TUN 核心：

```bash
sudo setcap -r /usr/local/libexec/silvervpn/mihomo
sudo rm -rf /usr/local/libexec/silvervpn
```

用户账号和订阅数据默认保留在 `~/.config/SilverVPN/`。确认不再需要后再手动删除。
