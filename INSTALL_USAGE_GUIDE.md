# SilverVPN 安装与使用手册

[English](docs/user-guide.md) | [中文](docs/user-guide.zh-CN.md)

本文档是 SilverVPN 的中文通用安装与使用入口。SilverVPN 面向 Linux 桌面、远程开发环境和多人共享 Linux 服务器，不绑定任何特定服务器、机构内网或第三方 VPN 产品。

推荐阅读：

- [中文用户手册](docs/user-guide.zh-CN.md)
- [English User Guide](docs/user-guide.md)
- [多人服务器部署指南](docs/multi-user-server.zh-CN.md)
- [Multi-user Server Guide](docs/multi-user-server.md)
- [订阅方案管理](docs/profile-management.zh-CN.md)
- [Profile Management](docs/profile-management.md)

## 快速安装

Ubuntu/Debian：

```bash
sudo apt update
sudo apt install -y git curl gzip nodejs npm libcap2-bin
```

克隆并安装：

```bash
git clone https://github.com/Silver-Zhang/SilverVPN.git
cd SilverVPN
chmod +x scripts/*.sh
./scripts/install.sh
./scripts/install-svpn.sh
```

普通 proxy-only 使用不需要 `sudo`。桌面启动命令会安装到：

```text
~/.local/bin/silvervpn
```

无图形 CLI 会安装到：

```text
~/.local/bin/svpn
```

安装后重新打开终端，或临时执行：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## 桌面模式

```bash
~/.local/bin/silvervpn
```

桌面模式适合个人 Linux 主机，提供图形界面的订阅导入、节点选择、模式切换、系统代理、终端代理、诊断和可选 TUN 模式。

## CLI 模式

导入订阅：

```bash
svpn import '<订阅链接或文件>' '我的方案'
```

启动当前用户自己的 proxy-only 后台和代理集成：

```bash
svpn on
svpn status
```

切换节点和模式：

```bash
svpn nodes --delay
svpn use 3
svpn mode smart
svpn test
```

关闭：

```bash
svpn off
```

## 多人服务器模式

多人服务器上，每个 Linux 用户都应该使用自己的账户运行 `svpn`。每个用户可以配置独立端口组：

```bash
svpn config ports 20080
```

端口规则：

```text
base       HTTP 代理
base + 1   SOCKS 代理
base + 8   svpn service/API
base + 10  mihomo controller
```

详见 [多人服务器部署指南](docs/multi-user-server.zh-CN.md)。

## 订阅方案管理

```bash
svpn profile list
svpn profile use 1
svpn profile rename 1 新名称
svpn profile delete 2
svpn profile delete 1 --yes
```

详见 [订阅方案管理](docs/profile-management.zh-CN.md)。

## 安全边界

proxy-only 模式不会修改系统路由、DNS、`/etc/environment`、`/etc/profile.d` 或全局代理文件。多人服务器 CLI 部署中，写入路径限制在当前执行用户自己的 HOME 目录内。

TUN 模式是可选功能，需要单独执行特权安装，因为它会创建虚拟网卡并写入系统路由规则。共享服务器和远程开发环境通常建议使用 proxy-only 模式。
