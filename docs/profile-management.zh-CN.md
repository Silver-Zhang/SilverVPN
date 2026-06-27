# 订阅方案管理

[English](profile-management.md) | [中文](profile-management.zh-CN.md)

SilverVPN 会把导入的订阅保存为 profile。一个 profile 对应一个本地保存的配置来源，包含本地 YAML 文件、显示名称和节点列表元数据。

所有 profile 操作都是用户级操作，只修改当前用户自己的 `~/.config/SilverVPN` 目录。

## 查看方案

```bash
svpn profile list
```

当前正在使用的方案前会显示 `*`。

## 切换方案

```bash
svpn profile use 1
svpn profile use '我的方案'
```

选择器可以是编号、完整名称、profile id 或唯一名称片段。如果后台正在运行，切换方案后只会重启当前用户自己的后台进程，使新配置生效。

## 重命名方案

```bash
svpn profile rename 1 '工作节点'
svpn profile rename 'Custom Subscription' '个人节点'
svpn profile rename custom-xxxxxx '备用方案'
```

第一个参数用于选择 profile，后面的文本是新的显示名称。

重命名只修改本地 profile 元数据，不会修改订阅服务商、订阅链接或其他用户的 profile。

## 删除方案

删除非当前方案：

```bash
svpn profile delete 2
```

删除当前正在使用的方案需要显式确认：

```bash
svpn profile delete 1 --yes
```

别名：

```bash
svpn profile rm 1 --yes
svpn profile remove 1 --yes
```

删除会移除当前用户自己的 profile 记录；如果存在对应的本地 YAML 文件，也会删除该文件。如果删除的是当前正在使用的方案，SilverVPN 会保留当前 active Clash 配置文件，避免破坏正在运行的后台。之后可以通过 `svpn profile use ...` 切换到其他方案，或通过 `svpn import ...` 导入新方案。

## 安全边界

Profile 命令：

- 只操作当前用户自己的 HOME 目录；
- 不写 `/etc`；
- 不修改系统路由或 DNS；
- 不启用 TUN；
- 不修改其他用户文件。
