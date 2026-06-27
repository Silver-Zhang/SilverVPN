# SilverVPN 用户手册

[English](user-guide.md) | [中文](user-guide.zh-CN.md)

本文档介绍 SilverVPN 在 Linux 上的安装与日常使用，适用于桌面图形界面用户，也适用于无图形终端和远程服务器用户。

## 1. 系统依赖

Ubuntu/Debian：

```bash
sudo apt update
sudo apt install -y git curl gzip nodejs npm libcap2-bin
```

建议使用 Node.js 18 或更高版本：

```bash
node --version
npm --version
```

## 2. 安装

```bash
git clone https://github.com/Silver-Zhang/SilverVPN.git
cd SilverVPN
chmod +x scripts/*.sh
./scripts/install.sh
./scripts/install-svpn.sh
```

普通 proxy-only 使用不需要 `sudo`。安装内容主要位于当前用户 HOME 目录下：

```text
~/.local/bin/silvervpn
~/.local/bin/svpn
~/.local/share/applications/silvervpn.desktop
~/.config/SilverVPN/
```

安装 `svpn` 后建议重新打开一个终端。

## 3. 桌面图形界面

可以从应用菜单、桌面图标或下面命令启动：

```bash
~/.local/bin/silvervpn
```

桌面客户端适合个人 Linux 主机，提供订阅导入、方案选择、节点选择、模式切换、系统代理、终端代理、诊断和可选 TUN 模式。

## 4. 无图形 CLI

`svpn` 面向终端、SSH、远程开发环境和多人共享服务器。

检查命令是否可用：

```bash
command -v svpn
svpn --help
```

导入订阅：

```bash
svpn import '<订阅链接或文件>' '我的方案'
```

以 proxy-only 模式启动当前用户自己的后台和代理集成：

```bash
svpn on
svpn status
```

关闭：

```bash
svpn off
```

## 5. 订阅格式

`svpn import` 支持：

- Clash/Mihomo YAML；
- 订阅 URL；
- `sub://...` 链接；
- base64 编码订阅列表；
- URI 列表；
- `ss`、`ssr`、`vmess`、`trojan`、`vless`、`hysteria2`、`tuic`、`snell` 等常见节点格式。

不要把私人订阅链接粘贴到公开 issue、截图、日志、文档或聊天记录中。

## 6. 订阅方案管理

查看方案：

```bash
svpn profile list
```

切换方案：

```bash
svpn profile use 1
svpn profile use '我的方案'
```

重命名方案：

```bash
svpn profile rename 1 '工作节点'
```

删除方案：

```bash
svpn profile delete 2
```

删除当前正在使用的方案需要显式确认：

```bash
svpn profile delete 1 --yes
```

详见 [订阅方案管理](profile-management.zh-CN.md)。

## 7. 节点与模式

查看节点：

```bash
svpn nodes
svpn nodes --delay
```

切换节点：

```bash
svpn use 3
svpn use '节点名称'
```

切换模式：

```bash
svpn mode smart
svpn mode global
svpn mode direct
```

模式含义：

| 模式 | 含义 |
|---|---|
| smart | 基于规则的智能分流，推荐默认使用 |
| global | 被代理接管的流量走当前节点 |
| direct | 被代理接管的流量直连 |

CLI proxy-only 模式下，这些模式不会启用 TUN，也不会修改系统路由或 DNS。

## 8. 终端代理集成

`svpn on` 会写入当前用户自己的终端代理状态；`install-svpn.sh` 会安装 shell hook。新打开的终端会自动读取当前代理状态。

检查代理变量：

```bash
env | grep -i proxy
```

检查出口 IP：

```bash
curl -s https://api.ipify.org
echo
```

## 9. VS Code Remote 集成

`svpn on` 会配置当前用户自己的 VS Code Stable 和 VS Code Insiders Remote：

```text
~/.vscode-server/data/Machine/settings.json
~/.vscode-server-insiders/data/Machine/settings.json
~/.vscode-server/server-env-setup
~/.vscode-server-insiders/server-env-setup
```

生成的设置为：

```json
{
  "http.proxy": "http://127.0.0.1:<你的HTTP端口>",
  "http.proxySupport": "override",
  "http.proxyStrictSSL": true
}
```

如果 VS Code Remote 已经在运行，执行 `svpn on` 后建议重启当前用户自己的 VS Code Server：

```bash
pkill -f .vscode-server 2>/dev/null || true
pkill -f .vscode-server-insiders 2>/dev/null || true
```

然后重新连接 VS Code。

## 10. 网络测试

```bash
svpn test
```

该命令会测试出口 IP，以及 GitHub、GitHub Copilot、OpenAI、ChatGPT、Claude、Anthropic API 等常用开发服务。

判断标准：

| 结果 | 含义 |
|---|---|
| HTTP 200 / 30x | 基本可达 |
| HTTP 401 | 服务可达，但需要认证 |
| HTTP 403 | 代理链路可达，但当前服务或节点拒绝访问 |
| timeout / SSL error | 当前节点可能不适合 |

## 11. 可选 TUN 模式

TUN 模式是可选功能。它会创建虚拟网卡和系统路由规则，使不支持 HTTP/SOCKS 代理设置的程序也可以被路由。

首次安装 TUN 支持：

```bash
./scripts/install-tun.sh
```

只有在明确理解网络影响时才建议使用 TUN。共享服务器和远程开发环境通常建议使用 proxy-only 模式。

## 12. 更新

```bash
cd SilverVPN
git pull --ff-only
./scripts/install.sh
./scripts/install-svpn.sh
```

## 13. 常见问题

桌面图标无法启动：

```bash
cat ~/.local/state/SilverVPN/launcher.log
gtk-launch silvervpn
```

Electron 缺失：

```bash
./scripts/install-electron.sh
./scripts/install.sh
```

找不到 `svpn`：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

然后重新打开一个终端。
