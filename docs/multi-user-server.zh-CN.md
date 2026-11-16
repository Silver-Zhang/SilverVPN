# 多人 Linux 服务器部署指南

[English](multi-user-server.md) | [中文](multi-user-server.zh-CN.md)

本文档说明如何在多人共享 Linux 服务器上部署 SilverVPN，使每个用户拥有独立的代理配置和端口。

## 1. 设计目标

`svpn` CLI 面向共享服务器场景，默认不接管系统网络：

- 默认不使用 TUN；
- 不修改系统路由或 DNS；
- 不写 `/etc/environment`、`/etc/profile.d` 或全局 shell 代理文件；
- 不修改其他用户的 HOME 目录；
- 每个用户独立配置、日志、订阅、PID、终端代理状态和 VS Code Remote 设置；
- 每个用户使用独立 HTTP/SOCKS/API/controller 端口组。

## 2. 每个用户独立安装

每个用户应在自己的 Linux 账户下安装和运行 SilverVPN：

```bash
git clone https://github.com/Silver-Zhang/SilverVPN.git ~/app/SilverVPN
cd ~/app/SilverVPN
./scripts/install.sh
./scripts/install-svpn.sh
```

如果管理员已经提供了一份源码副本，复制时不要复制其他用户的 `node_modules` 权限。推荐方式：

```bash
mkdir -p ~/app
rsync -a --exclude node_modules --exclude .git --exclude clash-runtime --exclude '*.log' \
  /path/to/SilverVPN/ ~/app/SilverVPN/
cd ~/app/SilverVPN
./scripts/install.sh
./scripts/install-svpn.sh
```

## 3. 个人端口组

每个用户应使用一个独立 base port：

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

示例：

| Base | HTTP | SOCKS | API | Controller |
|---:|---:|---:|---:|---:|
| 20080 | 20080 | 20081 | 20088 | 20090 |
| 20180 | 20180 | 20181 | 20188 | 20190 |
| 20280 | 20280 | 20281 | 20288 | 20290 |

对于较大的共享服务器，管理员可以在公共只读文档目录中维护端口分配表。普通用户只需要查看自己的 base port，并执行一次：

```bash
svpn config ports <自己的base-port>
```

## 4. 一键开启与关闭

```bash
svpn on
svpn status
svpn off
```

`svpn on` 只启动当前用户自己的 proxy-only 后台，写入当前用户自己的终端代理状态，并配置当前用户自己的 VS Code Remote 设置。

`svpn off` 只停止当前用户自己的后台，并移除当前用户自己的终端和 VS Code 代理集成。

## 5. 订阅和节点操作

```bash
svpn import '<私人订阅链接>' '我的方案'
svpn profile list
svpn profile use 1
svpn profile rename 1 '新名称'
svpn profile delete 2

svpn nodes
svpn nodes --delay
svpn use 3
```

私人订阅链接不要写入公开文档、共享日志、截图、issue 或聊天记录。

## 6. 模式和测试

```bash
svpn mode smart
svpn mode global
svpn mode direct
svpn test
```

服务器 CLI 工作流中的三种模式均保持 proxy-only，不启用 TUN，也不修改系统网络。

## 7. 用户级文件

典型路径：

```text
~/.config/SilverVPN/
~/.local/bin/svpn
~/.vscode-server/data/Machine/settings.json
~/.vscode-server/server-env-setup
~/.vscode-server-insiders/data/Machine/settings.json
~/.vscode-server-insiders/server-env-setup
```

VS Code 设置为：

```json
{
  "http.proxy": "http://127.0.0.1:<个人HTTP端口>",
  "http.proxySupport": "override",
  "http.proxyStrictSSL": true
}
```

## 8. 运维建议

共享服务器建议：

- 优先使用 proxy-only 模式；
- 除非管理员明确支持，否则不要启用 TUN；
- 给每个用户分配稳定端口组；
- 不要只根据“当前端口是否监听”来动态复用端口；
- 不要在公共文件中保存订阅链接；
- 不使用时建议执行 `svpn off`。

## 9. 批量升级（管理员）

用户较多时，可以用仓库自带的脚本一次性升级服务器上所有已安装用户：

```bash
sudo bash scripts/upgrade-all-users.sh
```

脚本会遍历系统用户，自动定位 `~/app/SilverVPN` 或 `~/SilverVPN` 仓库，并以对应用户身份依次执行：

1. `git pull --ff-only`（先修复 `install-svpn.sh` 造成的 `bin/svpn` 权限差异）；
2. `scripts/install-svpn.sh` 刷新 `~/.local/bin/svpn` 与 shell hook；
3. 若升级前代理在运行：`svpn stop` → 截断超过 32 MB 的历史日志 → `svpn start`。

常用参数：

```bash
sudo bash scripts/upgrade-all-users.sh --dry-run        # 只检查版本、二进制与日志，不做修改
sudo bash scripts/upgrade-all-users.sh --user alice     # 只升级一个用户
sudo bash scripts/upgrade-all-users.sh --no-truncate    # 不清理历史超大日志
```

首次部署时服务器上还没有这个脚本，可以直接从仓库获取：

```bash
curl -fsSLO https://raw.githubusercontent.com/Silver-Zhang/SilverVPN/main/scripts/upgrade-all-users.sh
sudo bash upgrade-all-users.sh --dry-run
sudo bash upgrade-all-users.sh
```

行为约定：

- 不会启动本已停止的代理，也不会改动用户的端口、订阅与节点选择；
- 某个用户 `git pull` 失败（本地改动、分支分叉）时会整体跳过该用户并保留现场，其余用户继续；
- 只截断 CLI 的 `svpn-core.log` / `svpn-core.err.log`，且仅在超过 32 MB 时执行；v0.3.4 起这两种日志已按 8 MB × 2 轮转，无需日常清理。
