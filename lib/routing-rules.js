'use strict';

// 统一的路由规则源。GUI (main.js) 与 CLI (cli.js / bin/svpn.js / bin/svpn-import.js)
// 必须共用这一份，否则两边用户的行为会分叉。
//
// 规则顺序（越靠前优先级越高）：ALWAYS_PROXY_RULES -> 直连列表 -> GEOIP,CN -> MATCH,Proxy

// 必须在代理之前判定的目标（境内不可直连或直连不可靠）。
// 注意：这些规则对所有平台一致，不要再在调用方增删。
const ALWAYS_PROXY_RULES = [
  'DOMAIN-SUFFIX,claude.ai,Proxy',
  'DOMAIN-SUFFIX,anthropic.com,Proxy',
  'DOMAIN-SUFFIX,claudeusercontent.com,Proxy',
  'DOMAIN,platform.claude.com,Proxy',
  'DOMAIN,downloads.claude.ai,Proxy',
  'DOMAIN-SUFFIX,openai.com,Proxy',
  'DOMAIN-SUFFIX,chatgpt.com,Proxy',
  'DOMAIN-SUFFIX,google.com,Proxy',
  'DOMAIN-SUFFIX,googleapis.com,Proxy',
  'DOMAIN-SUFFIX,gstatic.com,Proxy',
  'DOMAIN,storage.googleapis.com,Proxy',
  'DOMAIN-SUFFIX,github.com,Proxy',
  'DOMAIN-SUFFIX,githubusercontent.com,Proxy',
  'DOMAIN-SUFFIX,githubcopilot.com,Proxy',
  'DOMAIN,copilot-proxy.githubusercontent.com,Proxy'
];

// 内置直连目标。`*.x` 生成 DOMAIN-SUFFIX,x；精确域名生成 DOMAIN,x。
const DEFAULT_BYPASS_HOSTS = [
  // 本地与内网
  'localhost',
  '127.0.0.0/8',
  '::1',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16',
  'gitlab.reallab.org.cn',
  '*.reallab.org.cn',
  '*.local',
  // Microsoft / M365 / Office / Teams：境内有 CDN，兜底走代理会持续消耗流量
  '*.microsoft.com',
  '*.microsoftonline.com',
  '*.cloud.microsoft',
  '*.svc.ms',
  '*.windows.com',
  '*.skype.com',
  '*.exp-tas.com',
  // 开发工具后台流量（遥测、CDN、更新检查）
  '*.vscode-cdn.net',
  '*.visualstudio.com',
  '*.featureassets.org',
  '*.sentry.io',
  '*.datadoghq.com',
  '*.gitkraken.com',
  '*.statsigapi.net',
  // 注意：ipinfo.io / ipify.org 不能直连，出口 IP 探测必须走代理才能取到真实出口。
  // 境内可直连的常用服务
  '*.deepl.com',
  '*.immersivetranslate.com',
  '*.imtintl.com'
];

const ALWAYS_DIRECT_RULES = ['GEOIP,CN,DIRECT'];

// 纯上报类端点：不参与功能，直接丢弃以节省带宽。
// 用 REJECT 规则而不是改 /etc/hosts，无需 root 权限且随核心一起生效。
const ALWAYS_REJECT_RULES = [
  'DOMAIN-SUFFIX,mobile.events.data.microsoft.com,REJECT',
  'DOMAIN-SUFFIX,telemetry.individual.githubcopilot.com,REJECT',
  'DOMAIN-SUFFIX,ab.chatgpt.com,REJECT',
  'DOMAIN-SUFFIX,o33249.ingest.us.sentry.io,REJECT'
];

function normalizeBypassHosts(values) {
  const source = Array.isArray(values) ? values : String(values || '').split(/\r?\n/);
  const cleaned = [];
  const seen = new Set();
  for (const item of source) {
    const value = String(item || '').trim();
    if (!value || value.startsWith('#') || seen.has(value)) {
      continue;
    }
    cleaned.push(value);
    seen.add(value);
  }
  return cleaned;
}

function bypassHostToDirectRule(host) {
  if (host === 'localhost') {
    return 'DOMAIN,localhost,DIRECT';
  }
  if (host === '::1') {
    return 'IP-CIDR6,::1/128,DIRECT,no-resolve';
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/.test(host)) {
    return `IP-CIDR,${host},DIRECT,no-resolve`;
  }
  if (/^[0-9a-f:]+\/\d{1,3}$/i.test(host)) {
    return `IP-CIDR6,${host},DIRECT,no-resolve`;
  }
  if (host.startsWith('*.')) {
    return `DOMAIN-SUFFIX,${host.slice(2)},DIRECT`;
  }
  if (host.startsWith('.')) {
    return `DOMAIN-SUFFIX,${host.slice(1)},DIRECT`;
  }
  if (/^[a-z0-9.-]+$/i.test(host)) {
    return `DOMAIN,${host},DIRECT`;
  }
  return '';
}

function getBypassHosts(customHosts) {
  return normalizeBypassHosts([...DEFAULT_BYPASS_HOSTS, ...(customHosts || [])]);
}

function getDirectRules(settings = {}) {
  return normalizeBypassHosts([
    ...getBypassHosts(settings.bypassHosts).map(bypassHostToDirectRule),
    ...ALWAYS_DIRECT_RULES
  ]);
}

// 优先级最高：必须排在代理与直连规则之前，否则上报流量仍会被正常转发。
function getRejectRules() {
  return [...ALWAYS_REJECT_RULES];
}

// 把规则里的出口名替换成实际代理组名（订阅可能不叫 Proxy）。
function getProxyRoutingRules(target) {
  return ALWAYS_PROXY_RULES.map(rule => rule.replace(/,Proxy$/, `,${target}`));
}

module.exports = {
  ALWAYS_PROXY_RULES,
  ALWAYS_DIRECT_RULES,
  ALWAYS_REJECT_RULES,
  DEFAULT_BYPASS_HOSTS,
  normalizeBypassHosts,
  bypassHostToDirectRule,
  getBypassHosts,
  getDirectRules,
  getRejectRules,
  getProxyRoutingRules
};
