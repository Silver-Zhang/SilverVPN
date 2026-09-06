#!/usr/bin/env bash
# 创建 SilverVPN v0.2.0 GitHub Release（需要 GITHUB_TOKEN 环境变量）
set -euo pipefail

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "请先设置 GITHUB_TOKEN 环境变量，例如："
  echo "  export GITHUB_TOKEN=ghp_xxx"
  echo "Token 需要 repo 权限（classic）或 Contents:Read/Write（fine-grained）。"
  exit 1
fi

REPO="Silver-Zhang/SilverVPN"
TAG="v0.2.0"
API="https://api.github.com/repos/${REPO}/releases"

cat > /tmp/silvervpn-release.json <<'JSON'
{
  "tag_name": "v0.2.0",
  "target_commitish": "main",
  "name": "SilverVPN 0.2.0",
  "body": "## SilverVPN 0.2.0\n\n### 新功能\n- 全新 Vision 风格 12 列网格 UI、7 套颜色主题、自定义背景与玻璃透明度\n- 全局粒子背景：随机飞行 + 星轨连线 + 鼠标水纹排斥，开关/强度/速度可调\n- 核心状态 HUD 粒子状态机：开启绿色螺旋释放、星环吸积；停止红色把粒子全部吸入\n- 实时监控（流量/延迟/连接曲线）与流量统计（今天/3/7/30 天，按节点）\n- GUI 自定义端口组（与 CLI 共享 server.json，双向同步）\n- 订阅方案重命名/删除、面板折叠状态持久化\n- 完整中英文切换（data-i18n）\n\n### 修复\n- 统一 GUI/CLI 端口 schema（旧结构自动迁移）\n- 实现 rename-profile / delete-profile / open-config-dir handler\n- 更新检查 HTTP 404 优雅降级\n- 粒子层与鼠标坐标对齐（DPR）、速度调节可感知等多项体验修复\n\n### 验证\n- npm run check / npm run verify:svpn（13 项）通过",
  "draft": false,
  "prerelease": false
}
JSON

echo "正在创建 Release..."
HTTP_CODE=$(curl -s -o /tmp/silvervpn-release-resp.json -w "%{http_code}" \
  -X POST "${API}" \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github.v3+json" \
  -d @/tmp/silvervpn-release.json)

echo "HTTP ${HTTP_CODE}"
if [[ "${HTTP_CODE}" == "201" ]]; then
  echo "✅ Release 创建成功："
  python3 -c "import json;d=json.load(open('/tmp/silvervpn-release-resp.json'));print(d.get('html_url'),'| 名称:',d.get('name'),'| 标签:',d.get('tag_name'))"
else
  echo "❌ 创建失败，响应内容："
  cat /tmp/silvervpn-release-resp.json
  exit 1
fi
