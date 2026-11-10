# SilverVPN

[English](README.md) | [中文](README.zh-CN.md)

SilverVPN 是一款面向 Linux 的开源 VPN 与代理客户端，基于 mihomo 核心构建。它同时提供桌面图形界面和无图形终端 `svpn` 命令，既适合个人 Linux 主机使用，也适合远程开发环境和多人共享 Linux 服务器使用。

项目重点解决实际 Linux 使用场景中的问题：订阅导入、配置方案管理、节点选择、智能/全局/直连模式、终端代理、VS Code Remote 代理、可选 TUN 路由、多人服务器端口隔离和用户级配置隔离。

## 功能特点

- **Linux 桌面客户端**：基于 Electron 的图形界面，支持订阅、节点、模式与诊断管理。
- **无图形 CLI**：支持 `svpn on`、`svpn off`、`svpn status`、`svpn import`、`svpn nodes`、`svpn use`、`svpn traffic`、`svpn test` 等命令。
- **订阅格式支持**：支持 Clash/Mihomo YAML、订阅 URL、`sub://...`、URI 列表，以及 `ss`、`ssr`、`vmess`、`trojan`、`vless`、`hysteria2`、`tuic`、`snell` 等常见节点格式。
- **订阅方案管理**：支持查看、切换、重命名、删除订阅方案。
- **代理模式**：支持智能代理、全局代理、直连模式。
- **proxy-only 模式**：通过 HTTP/SOCKS 代理工作，不修改系统路由和 DNS。
- **可选 TUN 模式**：为不支持 HTTP/SOCKS 代理的程序提供系统级流量接管能力。
- **多人服务器支持**：每个用户独立配置、独立端口、独立后台进程、独立终端代理状态、独立 VS Code Remote 设置。
- **自定义端口组**：GUI 网络状态面板与 CLI（`svpn config ports`）共享同一份端口配置，一处修改两端同步。
- **现代化界面**：7 套颜色主题、自定义背景图、玻璃透明度、实时粒子物理背景（可放置/拖动的发射源与引力源、星环公转或黑洞吞噬模式、自旋方向 CCW/CW/随机可调），面板悬浮光效随主题变色。
- **实时监控与流量统计**：实时流量/延迟/连接曲线，按代理节点/直连分别统计今天/3/7/30 天流量、服务地址，并可用 `svpn traffic` 在终端查看同一份台账。
- **安全代理生命周期**：系统/终端代理设置采用失败回滚；核心日志限制为 10 MB × 3 份并定期清理过期日志。
- **开发工具友好**：适合终端工具、CLI Agent、Copilot/Codex 类工具和远程 IDE 场景；主机无可用 IPv6 路由时自动禁用 mihomo IPv6，避免直连域名出现网络不可达。

## 文档

| 主题 | English | 中文 |
|---|---|---|
| 安装与使用 | [User Guide](docs/user-guide.md) | [用户手册](docs/user-guide.zh-CN.md) |
| 多人 Linux 服务器部署 | [Multi-user Server Guide](docs/multi-user-server.md) | [多人服务器部署指南](docs/multi-user-server.zh-CN.md) |
| 订阅方案管理 | [Profile Management](docs/profile-management.md) | [订阅方案管理](docs/profile-management.zh-CN.md) |

旧文档路径会保留用于兼容，但推荐优先阅读上表中的通用文档。

## 快速安装

Ubuntu/Debian 依赖：

```bash
sudo apt update
sudo apt install -y git curl gzip nodejs npm libcap2-bin
```

克隆并安装：

```bash
git clone https://github.com/Silver-Zhang/SilverVPN.git
cd SilverVPN
./scripts/install.sh
./scripts/install-svpn.sh
```

桌面启动命令会安装到 `~/.local/bin/silvervpn`，无图形 CLI 会安装到 `~/.local/bin/svpn`。

安装 `svpn` 后建议重新打开一个终端，或确认 `~/.local/bin` 已加入 `PATH`：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## 桌面使用

可以从应用菜单、桌面图标或下面的命令启动：

```bash
~/.local/bin/silvervpn
```

桌面模式适合个人 Linux 主机，便于通过图形界面管理订阅、节点、GNOME 系统代理和可选 TUN 模式。

## CLI 使用

导入订阅：

```bash
svpn import '<订阅链接或文件>' '我的方案'
```

启动当前用户自己的 proxy-only 后台和代理集成：

```bash
svpn on
svpn status
```

管理节点和代理模式：

```bash
svpn nodes --delay
svpn use 3
svpn mode smart
svpn test
svpn traffic                  # 今天的节点、代理与直连流量
svpn traffic 7                # 近 7 天
svpn traffic 30 --json        # 近 30 天，供脚本读取
```

`svpn traffic` 与桌面 GUI 共用流量台账，按代理节点（含服务地址）和直连流量分别展示上传、下载及总量。可用时段：`today`（默认）、`3`、`7`、`30`。

管理绕过直连（不代理）的地址：

```bash
svpn bypass list              # 查看内置默认 + 自定义绕过地址
svpn bypass add example.com   # 添加绕过地址（后端运行中即时生效）
svpn bypass remove example.com
```

> 提示：桌面 GUI 与 CLI 共享同一份配置与代理核心。GUI 开启代理时，`svpn status` 会显示"运行中（桌面 GUI 核心）"；若 CLI 端口组与 GUI 不一致，`svpn on` 会提示对齐端口后复用现有核心，避免双核心冲突。

关闭当前用户自己的后台和代理集成：

```bash
svpn off
```

## 多人服务器使用

在共享服务器上，每个 Linux 用户都应该在自己的账户下安装和运行 `svpn`。SilverVPN 会把每个用户的配置保存在该用户自己的 HOME 目录下，并支持为每个用户配置独立端口组：

```bash
svpn config ports 20080
```

端口组规则：

```text
base       HTTP 代理
base + 1   SOCKS 代理
base + 8   svpn service/API
base + 10  mihomo controller
```

桌面 GUI 也可在网络状态面板中直接修改端口组（应用后自动重启核心）。GUI 与 CLI 读写同一份 `server.json`，因此无论从哪端修改，另一端都会立即使用相同端口并复用同一代理核心。

详见 [Multi-user Server Guide](docs/multi-user-server.md) 或 [多人服务器部署指南](docs/multi-user-server.zh-CN.md)。

## 验证

```bash
npm run check
npm run verify
npm run verify:svpn
node cli.js doctor
node cli.js status
```

## 安全边界

在 proxy-only 模式下，SilverVPN 不修改系统路由、DNS、`/etc/environment`、`/etc/profile.d` 或全局代理文件。多人服务器 CLI 部署中，写入路径限制在当前执行用户自己的 HOME 目录内。

TUN 模式是可选功能，需要单独执行一次特权安装，因为它会创建虚拟网卡并写入系统路由规则。
