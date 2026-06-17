# 熊猫上网 Linux

这是基于 macOS 安装包拆出的 Electron 前端做的 Linux 端工程。macOS 包里的代理核心是 `clashr-darwin-amd64`，不能在 Linux 运行，所以这里重写了主进程，并改为调用 Linux 下的 `mihomo`/`clash` 核心。

## 运行

完整安装指南和日常使用教程见 `INSTALL_USAGE_GUIDE.md`。

### 无图形基础版 CLI

远端或服务器环境优先用这个方式验证核心闭环，不需要 Electron 桌面环境：

```bash
node cli.js doctor
node cli.js status
node cli.js serve --demo --port 4788
```

验证：

```bash
curl http://127.0.0.1:4788/health
curl http://127.0.0.1:4788/configs
curl http://127.0.0.1:4788/proxies
npm run verify
```

`npm run verify` 使用临时 `data-dir`，不会写入用户真实的 `~/.config`。它会检查 `doctor`、`status`、本地 Clash YAML 导入、demo 服务 `/health`、`/configs`、`/proxies`，并验证 `sub://base64(url)#name` 订阅 URL 导入。默认验收只访问本地 HTTP fixture，不依赖真实公网订阅；本地 base64 URI-list fixture 会覆盖至少一个 SSR 和一个 VMess 假节点，如果当前 `cli.js` 尚未支持 URI-list 转换，默认验收会跳过该项。

强验收命令会把订阅 URL 导入和 base64 SSR/VMess URI-list 转 Clash YAML 列为必过项：

```bash
npm run verify:full
```

可选真实 `.url` 验收会联网下载真实订阅，但仍使用临时 `data-dir`，输出只包含通过/失败状态和代理数量，不打印真实订阅 URL 或节点内容：

```bash
node scripts/verify.js --require-subscription --real-url subscription.url
npm run verify:real
```

导入 Clash 配置或订阅：

```bash
node cli.js import /path/to/config.yaml
node cli.js import subscription.url
node cli.js import 'sub://BASE64_OR_BASE64URL#%E5%90%8D%E7%A7%B0'
node cli.js import 'https://example.com/path/to/subscription'
node cli.js serve --port 4788
```

`.url` 文件和 `sub://...` 字符串中的 body 会按 base64/base64url 解码为真实 HTTP/HTTPS 订阅地址，`#名称` 会保存为 profile 元数据。HTTP/HTTPS 订阅会按 Shadowrocket 风格订阅兼容方式下载后写入当前 active Clash 配置；如果响应是 Clash YAML 或 base64 包裹的 Clash YAML，会直接保存；如果响应是 base64 包裹的 `ssr://` / `vmess://` URI 列表，会转换成 Clash YAML 再保存。`node cli.js status` 会显示 profile 来源、名称、转换元数据和脱敏后的订阅地址提示，不输出真实节点内容。

账号登录并刷新节点：

```bash
XIONGMAO_PASSWORD='你的密码' node cli.js login --base https://你的服务端域名 --username 你的账号
node cli.js refresh-user --base https://你的服务端域名
node cli.js status
```

`login` 会按 macOS 客户端协议请求 `{base}/v1/login`，解码 `RocketMaker` 响应，保存登录 cookie 和脱敏后的账号状态，并自动导入响应里的 `pc_sub` 订阅。`refresh-user` 会使用已保存 cookie 请求 `{base}/v1/userinfo`，检查新的 `pc_sub` 并刷新节点。密码不会写入 `settings.json`；如果没有传 `--base`，CLI 会先尝试从本地 `http://127.0.0.1:4788/rocket` 发现服务端入口。

切换代理模式：

```bash
# 智能代理：国内 GEOIP 直连，其余走 Proxy
node cli.js mode rule

# 全局代理：所有进入 HTTP/SOCKS 代理的流量走 Proxy
node cli.js mode global

# 直连模式：所有进入 HTTP/SOCKS 代理的流量直连
node cli.js mode direct
```

`mode` 命令会写入当前 active Clash 配置；如果 `serve` 正在运行，并且能访问核心控制端口，还会即时应用到 mihomo。当前 Linux 基础版提供 HTTP/SOCKS 代理，不启用 TUN，因此 `ssh`、`ping` 等普通系统流量不会因为切换模式自动进入代理。

如果系统里已经安装了 `mihomo` / `clash`，或设置了 `CLASH_CORE=/absolute/path/to/mihomo`，`serve` 会尝试启动真实核心；否则自动退化为 demo API，用于演示和验证前端/控制 API。

### Electron 图形版

1. 安装 Node 依赖：

   ```bash
   npm install
   ```

2. 准备 Linux 代理核心。脚本会自动识别 Linux 架构，从 MetaCubeX/mihomo 官方 GitHub release 下载匹配的 `.gz` 资产，安装到 `resources/clash-binaries/mihomo-linux-<arch>`，并执行版本检查：

   ```bash
   # 先查看将下载的版本、资产和安装路径，不改动文件
   ./scripts/install-core.sh --dry-run

   # 下载并安装到工程内，不需要 sudo
   ./scripts/install-core.sh

   # 确认 CLI 能找到核心
   node cli.js doctor
   ```

   可选：如果系统里已经安装了核心，也可以直接使用系统命令或 `CLASH_CORE`：

   ```bash
   which mihomo || which clash
   CLASH_CORE=/absolute/path/to/mihomo npm start
   ```

   可选：固定 mihomo 版本或使用指定下载地址：

   ```bash
   ./scripts/install-core.sh --version v1.19.27
   MIHOMO_DOWNLOAD_URL=https://github.com/MetaCubeX/mihomo/releases/download/v1.19.27/mihomo-linux-amd64-compatible-v1.19.27.gz ./scripts/install-core.sh
   ```

   如果 GitHub 访问失败，脚本会输出手动下载和安装路径提示。手动安装时请将二进制放到 `resources/clash-binaries/mihomo-linux-amd64`、`resources/clash-binaries/mihomo-linux-arm64` 等对应文件名，并执行 `chmod +x`。

3. 启动：

   ```bash
   npm start
   ```

## 使用方式

- CLI `import` 可以导入 `.yaml` / `.yml` 配置、`.url` 订阅文件、`sub://...` 字符串或 HTTP/HTTPS 订阅地址；订阅响应支持 Clash YAML、base64 Clash YAML，以及 Shadowrocket 常见的 base64 SSR/VMess URI-list。
- CLI `login` / `refresh-user` 可以复用 macOS 客户端的账号登录和 `pc_sub` 刷新链路；真实使用时需要提供账号、密码和服务端 base URL，或让 CLI 从本地 `/rocket` 发现。
- CLI `mode rule|global|direct` 可以切换智能代理、全局代理和直连模式。
- 菜单 `文件 -> 导入 Clash 配置文件...` 可以导入 `.yaml` / `.yml` 配置。
- 菜单 `文件 -> 打开配置目录` 会打开当前数据目录，默认配置位于 `clash-configs/config.yaml`。
- 点击主界面的“启动连接”会在 GNOME 桌面环境下通过 `gsettings` 设置系统 HTTP/HTTPS/SOCKS 代理。
- Clash 控制 API 对前端保持 `127.0.0.1:4788`，实际核心控制端口被改写到 `127.0.0.1:4790`。

## 当前边界

- 账号登录/刷新已实现基础 CLI 链路，但图形界面仍未接入登录表单；真实服务端 base URL 需要通过 `--base`、`XIONGMAO_API_BASE` 或本地 `/rocket` 发现。
- 自动系统代理目前实现了 GNOME/gsettings。KDE、XFCE 等环境可以手动设置代理到 `127.0.0.1:4780` 和 SOCKS `127.0.0.1:4781`。
- 仓库不内置 Linux Clash/mihomo 二进制；可以运行 `./scripts/install-core.sh` 下载到工程内，也可以使用系统已安装版本或 `CLASH_CORE=/absolute/path/to/mihomo`。
