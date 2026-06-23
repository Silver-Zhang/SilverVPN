#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn, spawnSync, execSync } = require('child_process');
const yaml = require('js-yaml');

const APP_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DELAY_URL = 'https://www.gstatic.com/generate_204';
const START_TIMEOUT_MS = 15000;
const DEFAULT_BASE_PORTS = [4780, 4880, 4980, 5080, 5180, 5280, 5380, 5480, 5580, 5680];
const MODE_ALIASES = {
  rule: 'rule',
  smart: 'rule',
  intelligent: 'rule',
  auto: 'rule',
  global: 'global',
  direct: 'direct'
};
const MODE_LABELS = {
  rule: '智能代理',
  Rule: '智能代理',
  global: '全局代理',
  Global: '全局代理',
  direct: '直连模式',
  Direct: '直连模式'
};
const DEFAULT_BYPASS_HOSTS = [
  'localhost',
  '127.0.0.0/8',
  '::1',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16',
  'gitlab.reallab.org.cn',
  '*.reallab.org.cn',
  '*.local'
];
const ALWAYS_PROXY_RULES = [
  'DOMAIN-SUFFIX,claude.ai,Proxy',
  'DOMAIN-SUFFIX,anthropic.com,Proxy',
  'DOMAIN-SUFFIX,claudeusercontent.com,Proxy',
  'DOMAIN,platform.claude.com,Proxy',
  'DOMAIN,downloads.claude.ai,Proxy',
  'DOMAIN-SUFFIX,openai.com,Proxy',
  'DOMAIN-SUFFIX,chatgpt.com,Proxy',
  'DOMAIN-SUFFIX,github.com,Proxy',
  'DOMAIN-SUFFIX,githubusercontent.com,Proxy',
  'DOMAIN-SUFFIX,githubcopilot.com,Proxy',
  'DOMAIN,copilot-proxy.githubusercontent.com,Proxy'
];
const ALWAYS_DIRECT_RULES = ['GEOIP,CN,DIRECT'];

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) {
      args._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readText(file, fallback = '') {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (_error) {
    return fallback;
  }
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch (_error) {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function getPaths(args = {}) {
  const dataDir =
    args['data-dir'] ||
    process.env.SILVERVPN_DATA_DIR ||
    path.join(os.homedir(), '.config', 'SilverVPN');
  const resources = args.resources || path.join(APP_ROOT, 'resources');
  return {
    dataDir,
    resources,
    configDir: path.join(dataDir, 'clash-configs'),
    runtimeDir: path.join(dataDir, 'clash-runtime'),
    logsDir: path.join(dataDir, 'logs'),
    settingsFile: path.join(dataDir, 'settings.json'),
    serverFile: path.join(dataDir, 'server.json'),
    pidFile: path.join(dataDir, 'svpn.pid'),
    shellProxyFile: path.join(dataDir, 'shell-proxy.sh'),
    activeConfigFile: path.join(dataDir, 'clash-configs', 'config.yaml'),
    runtimeConfigFile: path.join(dataDir, 'clash-runtime', 'config.yaml'),
    defaultMmdbFile: path.join(resources, 'clash-configs', 'Country.mmdb')
  };
}

function normalizePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function portsFromBase(base) {
  return {
    http: base,
    socks: base + 1,
    service: base + 8,
    core: base + 10
  };
}

function listListeningPorts() {
  try {
    const output = execSync('ss -H -ltn', { encoding: 'utf8' });
    const ports = new Set();
    for (const line of output.split(/\r?\n/)) {
      const match = line.match(/:(\d+)\s/);
      if (match) ports.add(Number(match[1]));
    }
    return ports;
  } catch (_error) {
    return new Set();
  }
}

function portSetAvailable(ports, allowPidRunning = false) {
  if (allowPidRunning) return true;
  const used = listListeningPorts();
  return [ports.http, ports.socks, ports.service, ports.core].every(port => !used.has(port));
}

function findAvailablePorts() {
  for (const base of DEFAULT_BASE_PORTS) {
    const ports = portsFromBase(base);
    if (portSetAvailable(ports)) return ports;
  }
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  for (let offset = 0; offset < 50; offset += 1) {
    const base = 6000 + ((uid + offset) % 200) * 10;
    const ports = portsFromBase(base);
    if (portSetAvailable(ports)) return ports;
  }
  throw new Error('No free SilverVPN port set found. Run: svpn config ports <base-port>');
}

function getServerConfig(paths) {
  return readJson(paths.serverFile, {});
}

function saveServerConfig(paths, config) {
  writeJson(paths.serverFile, config);
}

function getPorts(paths, args = {}) {
  const config = getServerConfig(paths);
  if (args['base-port']) {
    const ports = portsFromBase(normalizePort(args['base-port']));
    config.ports = ports;
    saveServerConfig(paths, config);
    return ports;
  }
  if (process.env.SVPN_BASE_PORT) {
    return portsFromBase(normalizePort(process.env.SVPN_BASE_PORT));
  }
  if (config.ports && config.ports.http && config.ports.socks && config.ports.service && config.ports.core) {
    return config.ports;
  }
  const ports = findAvailablePorts();
  config.ports = ports;
  saveServerConfig(paths, config);
  return ports;
}

function formatPorts(ports) {
  return `HTTP ${ports.http} / SOCKS ${ports.socks} / API ${ports.service} / Core ${ports.core}`;
}

function findCore(paths) {
  if (process.env.CLASH_CORE && fs.existsSync(process.env.CLASH_CORE)) return process.env.CLASH_CORE;
  const archMap = { x64: 'amd64', arm64: 'arm64', arm: 'armv7' };
  const arch = archMap[process.arch] || process.arch;
  const candidates = [
    `mihomo-linux-${arch}`,
    `clash-meta-linux-${arch}`,
    `clash-linux-${arch}`,
    'mihomo',
    'clash'
  ].map(name => path.join(paths.resources, 'clash-binaries', name));
  for (const file of candidates) {
    try {
      fs.accessSync(file, fs.constants.X_OK);
      return file;
    } catch (_error) {
      // continue
    }
  }
  for (const name of ['mihomo', 'clash-meta', 'clash']) {
    const found = spawnSync('which', [name], { encoding: 'utf8' });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  return '';
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (_error) {
    return false;
  }
}

function readPidInfo(paths) {
  const info = readJson(paths.pidFile, null);
  if (!info || !info.pid) return null;
  return info;
}

function isRunning(paths) {
  const info = readPidInfo(paths);
  return Boolean(info && pidAlive(info.pid));
}

function requestCore(ports, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: ports.core,
        path: pathname,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
        },
        timeout: options.timeout || 5000
      },
      res => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`core HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(raw ? JSON.parse(raw) : null);
          } catch (_error) {
            resolve(raw);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('core request timed out')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function waitForCore(ports, timeoutMs = START_TIMEOUT_MS) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await requestCore(ports, '/configs', { timeout: 1200 });
      return true;
    } catch (_error) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  return false;
}

function normalizeBypassHosts(values) {
  const source = Array.isArray(values) ? values : String(values || '').split(/\r?\n/);
  const out = [];
  const seen = new Set();
  for (const item of source) {
    const value = String(item || '').trim();
    if (!value || value.startsWith('#') || seen.has(value)) continue;
    out.push(value);
    seen.add(value);
  }
  return out;
}

function bypassHostToDirectRule(host) {
  if (host === 'localhost') return 'DOMAIN,localhost,DIRECT';
  if (host === '::1') return 'IP-CIDR6,::1/128,DIRECT,no-resolve';
  if (/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/.test(host)) return `IP-CIDR,${host},DIRECT,no-resolve`;
  if (/^[0-9a-f:]+\/\d{1,3}$/i.test(host)) return `IP-CIDR6,${host},DIRECT,no-resolve`;
  if (host.startsWith('*.')) return `DOMAIN-SUFFIX,${host.slice(2)},DIRECT`;
  if (host.startsWith('.')) return `DOMAIN-SUFFIX,${host.slice(1)},DIRECT`;
  if (/^[a-z0-9.-]+$/i.test(host)) return `DOMAIN,${host},DIRECT`;
  return '';
}

function getDirectRules(settings = {}) {
  return normalizeBypassHosts([
    ...normalizeBypassHosts([...DEFAULT_BYPASS_HOSTS, ...(settings.bypassHosts || [])]).map(bypassHostToDirectRule),
    ...ALWAYS_DIRECT_RULES
  ]).filter(Boolean);
}

function getProxyTarget(config) {
  const groups = Array.isArray(config['proxy-groups'])
    ? config['proxy-groups']
    : Array.isArray(config['Proxy Group'])
      ? config['Proxy Group']
      : [];
  const selectable = groups.filter(group => {
    const type = String((group && group.type) || '').toLowerCase();
    return group && group.name && ['select', 'url-test', 'fallback', 'load-balance'].includes(type);
  });
  return (selectable.find(group => group.name === 'Proxy') || selectable[0] || {}).name || 'Proxy';
}

function ensureRoutingRules(config, settings) {
  const proxyTarget = getProxyTarget(config);
  const desired = [
    ...ALWAYS_PROXY_RULES.map(rule => rule.replace(/,Proxy$/, `,${proxyTarget}`)),
    ...getDirectRules(settings)
  ];
  const existing = Array.isArray(config.rules) ? config.rules.map(String) : [];
  const seen = new Set(existing);
  const missing = desired.filter(rule => !seen.has(rule));
  config.rules = [...missing, ...existing];
  if (!config.rules.some(rule => /^MATCH,/.test(String(rule)))) {
    config.rules.push(`MATCH,${proxyTarget}`);
  }
}

function prepareRuntimeConfig(paths, ports) {
  if (!fs.existsSync(paths.activeConfigFile)) {
    throw new Error(`Config not found: ${paths.activeConfigFile}. Import a subscription first.`);
  }
  const settings = readJson(paths.settingsFile, {});
  const raw = readText(paths.activeConfigFile);
  const config = yaml.load(raw) || {};
  delete config['mixed-port'];
  delete config['redir-port'];
  delete config['tproxy-port'];
  delete config.tun;
  config.port = ports.http;
  config['socks-port'] = ports.socks;
  config['external-controller'] = `127.0.0.1:${ports.core}`;
  config.secret = '';
  if (settings.mode) config.mode = settings.mode;
  ensureRoutingRules(config, settings);
  ensureDir(paths.runtimeDir);
  fs.writeFileSync(paths.runtimeConfigFile, yaml.dump(config, { lineWidth: 160 }));
  if (fs.existsSync(paths.defaultMmdbFile)) {
    fs.copyFileSync(paths.defaultMmdbFile, path.join(paths.runtimeDir, 'Country.mmdb'));
  }
}

function appendLog(paths, stream, line) {
  ensureDir(paths.logsDir);
  fs.appendFileSync(path.join(paths.logsDir, stream), line);
}

async function start(paths, args) {
  const ports = getPorts(paths, args);
  if (isRunning(paths)) {
    console.log(`SilverVPN 已在后台运行：${formatPorts(ports)}`);
    return;
  }
  if (!portSetAvailable(ports)) {
    throw new Error(`端口组被占用：${formatPorts(ports)}。请运行 svpn config ports <base-port> 设置个人端口。`);
  }
  const core = findCore(paths);
  if (!core) throw new Error('mihomo core not found. Run scripts/install.sh first.');
  prepareRuntimeConfig(paths, ports);
  ensureDir(paths.logsDir);
  const stdout = fs.openSync(path.join(paths.logsDir, 'svpn-core.log'), 'a');
  const stderr = fs.openSync(path.join(paths.logsDir, 'svpn-core.err.log'), 'a');
  const child = spawn(core, ['-d', paths.runtimeDir], {
    detached: true,
    stdio: ['ignore', stdout, stderr]
  });
  child.unref();
  writeJson(paths.pidFile, {
    pid: child.pid,
    core,
    ports,
    startedAt: new Date().toISOString(),
    user: os.userInfo().username
  });
  const ready = await waitForCore(ports);
  if (!ready) {
    throw new Error(`后台已启动但 Core 未就绪。查看日志：${path.join(paths.logsDir, 'svpn-core.err.log')}`);
  }
  if (args.proxy) writeShellProxy(paths, ports, true);
  console.log('SilverVPN 已启动');
  console.log(`模式：proxy-only 后台`);
  console.log(`端口：${formatPorts(ports)}`);
  console.log(`终端代理：${args.proxy ? '已开启' : '未开启（运行 svpn proxy on）'}`);
}

function stop(paths, args) {
  const info = readPidInfo(paths);
  if (!info || !info.pid || !pidAlive(info.pid)) {
    if (args.proxy) writeShellProxy(paths, getPorts(paths, args), false);
    console.log('SilverVPN 未在后台运行');
    return;
  }
  process.kill(Number(info.pid), 'SIGTERM');
  fs.rmSync(paths.pidFile, { force: true });
  if (args.proxy !== false) writeShellProxy(paths, info.ports || getPorts(paths, args), false);
  console.log('SilverVPN 已停止');
}

async function restart(paths, args) {
  stop(paths, { ...args, proxy: false });
  await new Promise(resolve => setTimeout(resolve, 500));
  await start(paths, args);
}

function readModeLabel(mode) {
  return MODE_LABELS[mode] || mode || '未知';
}

async function getCoreState(paths, ports) {
  const state = { running: false, config: null, proxies: null };
  try {
    state.config = await requestCore(ports, '/configs', { timeout: 2000 });
    state.proxies = await requestCore(ports, '/proxies', { timeout: 3000 });
    state.running = true;
  } catch (_error) {
    state.running = false;
  }
  return state;
}

function getCurrentNode(proxies) {
  const items = proxies && proxies.proxies ? proxies.proxies : {};
  const proxy = items.Proxy || items.GLOBAL;
  return proxy ? proxy.now || '' : '';
}

async function getDelay(ports, node) {
  if (!node) return null;
  const target = encodeURIComponent(node);
  const url = encodeURIComponent(DEFAULT_DELAY_URL);
  try {
    const value = await requestCore(ports, `/proxies/${target}/delay?timeout=5000&url=${url}`, { timeout: 6500 });
    return Number.isFinite(value.delay) ? value.delay : null;
  } catch (_error) {
    return null;
  }
}

function shellProxyEnabled(paths) {
  const text = readText(paths.shellProxyFile);
  return /SILVERVPN_PROXY_ENABLED=1/.test(text);
}

function vscodeProxyEnabled(ports) {
  const files = [
    path.join(os.homedir(), '.vscode-server', 'data', 'Machine', 'settings.json'),
    path.join(os.homedir(), '.vscode-server-insiders', 'data', 'Machine', 'settings.json')
  ];
  return files.some(file => {
    const value = readJson(file, null);
    return value && value['http.proxy'] === `http://127.0.0.1:${ports.http}` && value['http.proxySupport'] === 'override';
  });
}

async function status(paths, args) {
  const ports = getPorts(paths, args);
  const pid = readPidInfo(paths);
  const alive = Boolean(pid && pidAlive(pid.pid));
  const core = await getCoreState(paths, ports);
  const mode = core.config ? core.config.mode : readJson(paths.settingsFile, {}).mode || 'rule';
  const node = getCurrentNode(core.proxies) || readJson(paths.settingsFile, {}).currentProxy || '未选择';
  const delay = core.running && node !== '未选择' && !args['no-delay'] ? await getDelay(ports, node) : null;

  if (args.json) {
    console.log(JSON.stringify({ running: alive || core.running, pid: pid && pid.pid, ports, mode, node, delay, terminalProxy: shellProxyEnabled(paths), vscodeProxy: vscodeProxyEnabled(ports), dataDir: paths.dataDir }, null, 2));
    return;
  }

  console.log(`SilverVPN：${alive || core.running ? '运行中' : '未运行'}`);
  console.log(`用户：${os.userInfo().username}`);
  console.log(`模式：${readModeLabel(mode)} (${String(mode).toLowerCase()})`);
  console.log(`节点：${node}${delay === null ? '' : `  ${delay} ms`}`);
  console.log(`代理：HTTP ${ports.http} / SOCKS ${ports.socks}`);
  console.log(`终端代理：${shellProxyEnabled(paths) ? '已开启' : '未开启'}`);
  console.log(`VS Code：${vscodeProxyEnabled(ports) ? '已配置 override' : '未配置'}`);
  console.log(`后台：${alive ? `PID ${pid.pid}` : '无后台进程'}`);
}

async function setMode(paths, args) {
  const mode = MODE_ALIASES[String(args._[1] || '').toLowerCase()];
  if (!mode) throw new Error('Usage: svpn mode smart|global|direct');
  const ports = getPorts(paths, args);
  const settings = readJson(paths.settingsFile, {});
  settings.mode = mode;
  writeJson(paths.settingsFile, settings);
  try {
    await requestCore(ports, '/configs', { method: 'PATCH', body: { mode } });
    console.log(`模式已切换：${readModeLabel(mode)}`);
  } catch (_error) {
    console.log(`模式已保存：${readModeLabel(mode)}（Core 未运行，启动后生效）`);
  }
}

function proxyListFromCore(proxies) {
  const items = proxies && proxies.proxies ? proxies.proxies : {};
  const group = items.Proxy || items.GLOBAL;
  return group && Array.isArray(group.all) ? group.all.filter(name => !['DIRECT', 'REJECT'].includes(name)) : [];
}

async function nodes(paths, args) {
  const ports = getPorts(paths, args);
  const proxies = await requestCore(ports, '/proxies');
  const current = getCurrentNode(proxies);
  const list = proxyListFromCore(proxies);
  for (let index = 0; index < list.length; index += 1) {
    const name = list[index];
    let suffix = '';
    if (args.delay) {
      const delay = await getDelay(ports, name);
      suffix = delay === null ? '  失败' : `  ${delay} ms`;
    }
    const mark = name === current ? '*' : ' ';
    console.log(`${mark} ${String(index + 1).padStart(2, ' ')}. ${name}${suffix}`);
  }
}

function resolveNode(input, list) {
  const value = String(input || '').trim();
  if (!value) throw new Error('Usage: svpn use <node-number-or-name>');
  if (/^\d+$/.test(value)) {
    const index = Number(value) - 1;
    if (index >= 0 && index < list.length) return list[index];
  }
  const exact = list.find(name => name === value);
  if (exact) return exact;
  const partial = list.find(name => name.includes(value));
  if (partial) return partial;
  throw new Error(`Node not found: ${value}`);
}

async function useNode(paths, args) {
  const ports = getPorts(paths, args);
  const proxies = await requestCore(ports, '/proxies');
  const list = proxyListFromCore(proxies);
  const node = resolveNode(args._.slice(1).join(' '), list);
  const groups = ['Proxy', 'GLOBAL'];
  for (const group of groups) {
    if (proxies.proxies && proxies.proxies[group]) {
      await requestCore(ports, `/proxies/${encodeURIComponent(group)}`, { method: 'PUT', body: { name: node } }).catch(() => null);
    }
  }
  await requestCore(ports, '/connections', { method: 'DELETE' }).catch(() => null);
  const settings = readJson(paths.settingsFile, {});
  settings.currentProxy = node;
  writeJson(paths.settingsFile, settings);
  const delay = await getDelay(ports, node);
  console.log(`节点已切换：${node}${delay === null ? '' : ` (${delay} ms)`}`);
}

function writeShellProxy(paths, ports, enabled) {
  ensureDir(path.dirname(paths.shellProxyFile));
  if (!enabled) {
    fs.writeFileSync(paths.shellProxyFile, `# Generated by svpn.\nexport SILVERVPN_PROXY_ENABLED=0\nunset HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY http_proxy https_proxy all_proxy no_proxy\n`);
    return;
  }
  const noProxy = 'localhost,127.0.0.1,::1,gitlab.reallab.org.cn,.reallab.org.cn,.local';
  fs.writeFileSync(
    paths.shellProxyFile,
    `# Generated by svpn.\nexport SILVERVPN_PROXY_ENABLED=1\nexport HTTP_PROXY='http://127.0.0.1:${ports.http}'\nexport HTTPS_PROXY='http://127.0.0.1:${ports.http}'\nexport ALL_PROXY='http://127.0.0.1:${ports.http}'\nexport http_proxy=\"$HTTP_PROXY\"\nexport https_proxy=\"$HTTPS_PROXY\"\nexport all_proxy=\"$ALL_PROXY\"\nexport NO_PROXY='${noProxy}'\nexport no_proxy=\"$NO_PROXY\"\n`
  );
}

function proxy(paths, args) {
  const action = args._[1] || 'status';
  const ports = getPorts(paths, args);
  if (action === 'on') {
    writeShellProxy(paths, ports, true);
    console.log('终端代理已开启');
    console.log('当前终端立即生效：source ~/.config/SilverVPN/shell-proxy.sh');
    return;
  }
  if (action === 'off') {
    writeShellProxy(paths, ports, false);
    console.log('终端代理已关闭');
    console.log('当前终端立即生效：source ~/.config/SilverVPN/shell-proxy.sh');
    return;
  }
  console.log(`终端代理：${shellProxyEnabled(paths) ? '已开启' : '未开启'}`);
}

function updateVscodeSettingsFile(file, ports, enabled) {
  const data = readJson(file, {});
  if (enabled) {
    data['http.proxy'] = `http://127.0.0.1:${ports.http}`;
    data['http.proxySupport'] = 'override';
    data['http.proxyStrictSSL'] = true;
  } else {
    delete data['http.proxy'];
    delete data['http.proxySupport'];
    delete data['http.proxyStrictSSL'];
  }
  writeJson(file, data);
}

function writeVscodeEnvFile(dir) {
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, 'server-env-setup'), `#!/usr/bin/env bash\nif [ -r \"$HOME/.config/SilverVPN/shell-proxy.sh\" ]; then\n  . \"$HOME/.config/SilverVPN/shell-proxy.sh\"\nfi\n`);
}

function vscode(paths, args) {
  const action = args._[1] || 'status';
  const ports = getPorts(paths, args);
  const targets = [
    path.join(os.homedir(), '.vscode-server'),
    path.join(os.homedir(), '.vscode-server-insiders')
  ];
  if (action === 'on') {
    writeShellProxy(paths, ports, true);
    for (const base of targets) {
      updateVscodeSettingsFile(path.join(base, 'data', 'Machine', 'settings.json'), ports, true);
      writeVscodeEnvFile(base);
    }
    console.log('VS Code Remote 代理已配置：override');
    console.log('请重启 VS Code Server：pkill -f .vscode-server');
    return;
  }
  if (action === 'off') {
    for (const base of targets) {
      updateVscodeSettingsFile(path.join(base, 'data', 'Machine', 'settings.json'), ports, false);
    }
    console.log('VS Code Remote 代理配置已移除');
    console.log('请重启 VS Code Server：pkill -f .vscode-server');
    return;
  }
  console.log(`VS Code：${vscodeProxyEnabled(ports) ? '已配置 override' : '未配置'}`);
}

function configurePorts(paths, args) {
  const base = args._[2];
  if (!base) {
    const ports = getPorts(paths, args);
    console.log(formatPorts(ports));
    return;
  }
  const ports = portsFromBase(normalizePort(base));
  const config = getServerConfig(paths);
  config.ports = ports;
  saveServerConfig(paths, config);
  console.log(`个人端口已设置：${formatPorts(ports)}`);
}

async function runTest(paths, args) {
  const ports = getPorts(paths, args);
  const env = {
    ...process.env,
    HTTP_PROXY: `http://127.0.0.1:${ports.http}`,
    HTTPS_PROXY: `http://127.0.0.1:${ports.http}`,
    ALL_PROXY: `http://127.0.0.1:${ports.http}`,
    http_proxy: `http://127.0.0.1:${ports.http}`,
    https_proxy: `http://127.0.0.1:${ports.http}`,
    all_proxy: `http://127.0.0.1:${ports.http}`
  };
  const tests = [
    ['出口 IP', 'https://api.ipify.org'],
    ['GitHub', 'https://api.github.com/repos/github/copilot-cli/releases/latest'],
    ['Copilot', 'https://api.githubcopilot.com'],
    ['OpenAI', 'https://api.openai.com/v1/models'],
    ['ChatGPT', 'https://chatgpt.com']
  ];
  for (const [label, url] of tests) {
    const result = spawnSync('curl', ['-sSI', '--max-time', '20', url], { encoding: 'utf8', env });
    const first = (result.stdout || result.stderr || '').split(/\r?\n/).find(Boolean) || '失败';
    console.log(`${label.padEnd(8)} ${first}`);
  }
}

function importConfig(paths, args) {
  const source = args._[1];
  if (!source) throw new Error('Usage: svpn import <subscription-url|sub://...|config.yaml>');
  const cli = path.join(APP_ROOT, 'cli.js');
  const result = spawnSync(process.execPath, [cli, 'import', source, '--data-dir', paths.dataDir], { stdio: 'inherit' });
  process.exit(result.status || 0);
}

function printHelp() {
  console.log(`Usage: svpn <command>\n\nCore commands:\n  svpn start [--proxy]          Start per-user proxy-only backend\n  svpn stop                     Stop backend\n  svpn restart [--proxy]        Restart backend\n  svpn status                   Human-friendly status\n\nProxy control:\n  svpn mode smart|global|direct Set routing mode\n  svpn nodes [--delay]          List nodes\n  svpn use <number|name>        Switch node\n  svpn proxy on|off             Write per-user terminal proxy env\n  svpn vscode on|off            Configure per-user VS Code Remote proxy\n\nSetup:\n  svpn import <sub-url|url|file> Import subscription/config\n  svpn config ports <base-port> Set personal ports, e.g. 4880\n  svpn test                     Test GitHub/Copilot/OpenAI/ChatGPT\n\nNotes:\n  - proxy-only only; no TUN and no global /etc proxy pollution.\n  - after 'svpn proxy on', run: source ~/.config/SilverVPN/shell-proxy.sh\n  - after 'svpn vscode on', restart VS Code Server.\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || 'help';
  const paths = getPaths(args);
  ensureDir(paths.dataDir);
  ensureDir(paths.logsDir);

  if (command === 'help' || args.help) return printHelp();
  if (command === 'start') return start(paths, args);
  if (command === 'stop') return stop(paths, args);
  if (command === 'restart') return restart(paths, args);
  if (command === 'status') return status(paths, args);
  if (command === 'mode') return setMode(paths, args);
  if (command === 'nodes') return nodes(paths, args);
  if (command === 'use') return useNode(paths, args);
  if (command === 'proxy') return proxy(paths, args);
  if (command === 'vscode') return vscode(paths, args);
  if (command === 'test') return runTest(paths, args);
  if (command === 'import') return importConfig(paths, args);
  if (command === 'config' && args._[1] === 'ports') return configurePorts(paths, args);
  throw new Error(`Unknown command: ${command}`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
