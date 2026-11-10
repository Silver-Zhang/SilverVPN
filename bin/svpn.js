#!/usr/bin/env node
'use strict';

const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn, spawnSync, execSync } = require('child_process');
const yaml = require('js-yaml');
const { portsFromBase } = require('../lib/ports');
const {
  DEFAULT_BYPASS_HOSTS,
  normalizeBypassHosts,
  getDirectRules,
  getRejectRules,
  getProxyRoutingRules
} = require('../lib/routing-rules');

const APP_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DELAY_URL = 'https://www.gstatic.com/generate_204';
const START_TIMEOUT_MS = 15000;
const DEFAULT_BASE_PORTS = [4780, 4880, 4980, 5080, 5180, 5280, 5380, 5480, 5580, 5680];
// GUI 默认端口组（若 server.json 已由 GUI/CLI 写入 config.ports，则以之为准）
const GUI_DEFAULT_BASE = 4780;
const GUI_DEFAULT_PORTS = { http: 4780, socks: 4781, service: 4788, core: 4790 };
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

let activePaths = null;

function setActivePaths(paths) {
  activePaths = paths;
}

function sharedCoreSecret() {
  try {
    const file = activePaths && activePaths.settingsFile
      ? activePaths.settingsFile
      : process.env.SILVERVPN_DATA_DIR
        ? path.join(process.env.SILVERVPN_DATA_DIR, 'settings.json')
        : path.join(os.homedir(), '.config', 'SilverVPN', 'settings.json');
    const value = readJson(file, {});
    return value.coreApiSecret || '';
  } catch (_error) {
    return '';
  }
}

function ensureCoreSecret(paths) {
  const settings = readJson(paths.settingsFile, {});
  if (!/^[a-f0-9]{64}$/i.test(String(settings.coreApiSecret || ''))) {
    settings.coreApiSecret = crypto.randomBytes(32).toString('hex');
    writeJson(paths.settingsFile, settings);
  }
  return settings.coreApiSecret;
}

function writeJson(file, value) {
  file = assertPathInHome(file, 'SilverVPN output file');
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function assertPathInHome(target, label) {
  const home = fs.realpathSync(os.homedir());
  const resolved = path.resolve(target);
  let existing = resolved;
  const missing = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  const canonical = path.join(fs.realpathSync(existing), ...missing);
  if (canonical !== home && !canonical.startsWith(`${home}${path.sep}`)) {
    throw new Error(`${label} must stay inside the current user's HOME: ${canonical}`);
  }
  return canonical;
}

function getPaths(args = {}) {
  const dataDir = assertPathInHome(
    args['data-dir'] ||
    process.env.SILVERVPN_DATA_DIR ||
    path.join(os.homedir(), '.config', 'SilverVPN'),
    'SilverVPN data directory'
  );
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
    shellHookFile: path.join(dataDir, 'shell-hook.sh'),
    subscriptionsDir: path.join(dataDir, 'subscriptions'),
    subscriptionsFile: path.join(dataDir, 'clashy-configs', 'subscriptions.json'),
    trafficStatsFile: path.join(dataDir, 'traffic-stats.json'),
    activeConfigFile: path.join(dataDir, 'clash-configs', 'config.yaml'),
    runtimeConfigFile: path.join(dataDir, 'clash-runtime', 'config.yaml'),
    defaultMmdbFile: path.join(resources, 'clash-configs', 'Country.mmdb')
  };
}

function normalizePort(value) {
  const port = Number(value);
  // 端口组要占用 base..base+10，超出范围会让 core 端口非法
  if (!Number.isInteger(port) || port < 1024 || port + 10 > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
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

// GUI 当前使用的端口组：优先读 server.json 的顶层 config.ports（GUI/CLI 共享），
// 兼容旧版 config.config.ports；否则默认
function getGuiPorts(paths) {
  const config = getServerConfig(paths);
  const ports = (config && config.ports && config.ports.http)
    ? config.ports
    : (config && config.config && config.config.ports && config.config.ports.http)
      ? config.config.ports
      : null;
  if (ports) {
    return portsFromBase(ports.http);
  }
  return GUI_DEFAULT_PORTS;
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

function processBelongsToCurrentUser(pid) {
  try {
    if (fs.statSync(`/proc/${Number(pid)}`).uid !== process.getuid()) return false;
    const command = fs.readFileSync(`/proc/${Number(pid)}/cmdline`, 'utf8').replace(/\0/g, ' ');
    return command.includes(path.resolve(__filename)) && command.includes(' daemon');
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
  return Boolean(info && pidAlive(info.pid) && processBelongsToCurrentUser(info.pid));
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
          ...(sharedCoreSecret() ? { Authorization: `Bearer ${sharedCoreSecret()}` } : {}),
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

async function coreProbe(ports) {
  try {
    const value = await requestCore(ports, '/configs', { timeout: 1500 });
    return Boolean(
      value &&
      typeof value === 'object' &&
      Number(value.port) === ports.http &&
      Number(value['socks-port']) === ports.socks
    );
  } catch (_error) {
    return false;
  }
}

function findUserMihomoProcesses() {
  try {
    const uid = typeof process.getuid === 'function' ? String(process.getuid()) : '';
    const output = execSync('ps -eo pid=,uid=,args=', { encoding: 'utf8' });
    return output
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => /mihomo/i.test(line))
      .filter(line => !uid || line.split(/\s+/)[1] === uid)
      .map(line => Number(line.split(/\s+/)[0]))
      .filter(pid => Number.isInteger(pid) && pid > 0);
  } catch (_error) {
    return [];
  }
}

async function resolveCoreReuse(ports) {
  const listening = await portListening(ports.core);
  if (!listening) return false;
  return coreProbe(ports);
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
    ...getRejectRules(),
    ...getProxyRoutingRules(proxyTarget),
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
  config['allow-lan'] = false;
  config['bind-address'] = '127.0.0.1';
  config['external-controller'] = `127.0.0.1:${ports.core}`;
  config.secret = settings.coreApiSecret || '';
  if (settings.mode) config.mode = settings.mode;
  ensureRoutingRules(config, settings);
  const runtimeConfigFile = assertPathInHome(paths.runtimeConfigFile, 'Runtime config');
  ensureDir(path.dirname(runtimeConfigFile));
  fs.writeFileSync(runtimeConfigFile, yaml.dump(config, { lineWidth: 160 }));
  if (fs.existsSync(paths.defaultMmdbFile)) {
    fs.copyFileSync(
      paths.defaultMmdbFile,
      assertPathInHome(path.join(paths.runtimeDir, 'Country.mmdb'), 'Runtime database')
    );
  }
}

function appendLog(paths, stream, line) {
  ensureDir(paths.logsDir);
  fs.appendFileSync(assertPathInHome(path.join(paths.logsDir, stream), 'SilverVPN log'), line);
}

const TRAFFIC_RETENTION_DAYS = 31;
const TRAFFIC_TARGETS_PER_DAY_MAX = 200;

function trafficDateKey(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() - offsetDays);
  return date.toISOString().slice(0, 10);
}

function pruneTrafficLedger(ledger) {
  const dates = Object.keys(ledger.byDate || {}).sort();
  while (dates.length > TRAFFIC_RETENTION_DAYS) {
    const date = dates.shift();
    delete ledger.byDate[date];
    delete ledger.detailsByDate[date];
  }
}

function proxyServerMap(paths) {
  const servers = new Map();
  try {
    const config = yaml.load(readText(paths.runtimeConfigFile)) || {};
    for (const proxy of Array.isArray(config.proxies) ? config.proxies : []) {
      if (proxy && proxy.name && proxy.server) {
        servers.set(String(proxy.name), String(proxy.server));
      }
    }
  } catch (_error) {
    // 服务地址是增强信息，读取失败不影响流量台账。
  }
  return servers;
}

function pruneTrafficTargets(details) {
  const entries = Object.entries(details);
  if (entries.length <= TRAFFIC_TARGETS_PER_DAY_MAX) {
    return;
  }
  entries
    .sort(([, left], [, right]) => ((right.up || 0) + (right.down || 0)) - ((left.up || 0) + (left.down || 0)))
    .slice(TRAFFIC_TARGETS_PER_DAY_MAX)
    .forEach(([key]) => delete details[key]);
}

function createTrafficSampler(paths, ports) {
  const stored = readJson(paths.trafficStatsFile, {});
  const ledger = {
    byDate: stored.byDate && typeof stored.byDate === 'object' ? stored.byDate : {},
    detailsByDate: stored.detailsByDate && typeof stored.detailsByDate === 'object' ? stored.detailsByDate : {},
    baseline: {},
    dirty: false,
    lastFlush: Date.now()
  };
  let timer = null;
  let inFlight = false;
  const servers = proxyServerMap(paths);

  const flush = force => {
    if (!ledger.dirty && !force) {
      return;
    }
    pruneTrafficLedger(ledger);
    writeJson(paths.trafficStatsFile, { byDate: ledger.byDate, detailsByDate: ledger.detailsByDate });
    ledger.dirty = false;
    ledger.lastFlush = Date.now();
  };

  const sample = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const value = await requestCore(ports, '/connections', { timeout: 2500 });
      const seen = new Set();
      const date = trafficDateKey();
      const day = ledger.byDate[date] || (ledger.byDate[date] = {});
      const details = ledger.detailsByDate[date] || (ledger.detailsByDate[date] = {});
      for (const connection of Array.isArray(value.connections) ? value.connections : []) {
        const metadata = connection.metadata || {};
        const node = (Array.isArray(connection.chains) && connection.chains[0]) || '未知';
        const id = String(connection.id || `${metadata.host || ''}:${metadata.destinationPort || ''}`);
        seen.add(id);
        const up = Number(connection.upload) || 0;
        const down = Number(connection.download) || 0;
        const previous = ledger.baseline[id];
        if (previous && previous.node === node && up >= previous.up && down >= previous.down) {
          const deltaUp = up - previous.up;
          const deltaDown = down - previous.down;
          const entry = day[node] || (day[node] = { up: 0, down: 0 });
          entry.up += deltaUp;
          entry.down += deltaDown;
          const host = String(metadata.host || metadata.destinationIP || '未知目标');
          const ip = String(metadata.destinationIP || '');
          const port = String(metadata.destinationPort || '');
          const key = `${node}\u0000${host}\u0000${ip}\u0000${port}`;
          const detail = details[key] || (details[key] = {
            host,
            ip,
            port,
            node,
            proxy: !/^(DIRECT|REJECT)$/i.test(node),
            server: servers.get(node) || '',
            up: 0,
            down: 0,
            lastSeen: ''
          });
          detail.up += deltaUp;
          detail.down += deltaDown;
          detail.lastSeen = new Date().toISOString();
          ledger.dirty = true;
        }
        ledger.baseline[id] = { node, up, down };
      }
      for (const id of Object.keys(ledger.baseline)) {
        if (!seen.has(id)) delete ledger.baseline[id];
      }
      pruneTrafficTargets(details);
      if (Date.now() - ledger.lastFlush >= 60000) flush(false);
    } catch (_error) {
      // 核心刚启动或已停止时下一轮自动重试。
    } finally {
      inFlight = false;
    }
  };

  return {
    start() {
      sample();
      timer = setInterval(sample, 2000);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      flush(true);
    }
  };
}

async function daemon(paths, args) {
  const ports = getPorts(paths, args);
  const core = findCore(paths);
  if (!core) throw new Error('mihomo core not found. Run scripts/install-core.sh first.');

  let child = null;
  const reusing = await coreProbe(ports);
  if (reusing) {
    appendLog(paths, 'svpn-core.log', `[${new Date().toISOString()}] reusing existing core on port ${ports.core}\n`);
  } else {
    prepareRuntimeConfig(paths, ports);
    child = spawn(core, ['-d', paths.runtimeDir], {
      stdio: ['ignore', 'inherit', 'inherit']
    });
  }
  let shuttingDown = false;
  const trafficSampler = createTrafficSampler(paths, ports);
  let trafficSamplingStarted = false;
  const server = http.createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true, pid: process.pid, corePid: child ? child.pid : null, ports, reusing }));
      return;
    }
    // 安全边界：service 只提供健康检查，不做 Core Controller 通用代理，
    // 避免本机其他用户通过 service 绕过 Core secret 获得 Controller 权限。
    response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: false, error: 'not found' }));
  });

  const stop = signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (trafficSamplingStarted) {
      trafficSampler.stop();
    }
    server.close();
    if (child && pidAlive(child.pid)) child.kill(signal || 'SIGTERM');
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
  if (child) {
    child.on('exit', code => {
      if (!shuttingDown) process.exit(code || 1);
    });
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(ports.service, '127.0.0.1', resolve);
  });
  // 只有 CLI 自己启动的核心才负责采集；复用 GUI/其它 CLI 核心时避免重复计数。
  if (child) {
    trafficSampler.start();
    trafficSamplingStarted = true;
  }
}

async function waitForService(ports, timeoutMs = START_TIMEOUT_MS) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      const value = await new Promise((resolve, reject) => {
        const request = http.get(
          { hostname: '127.0.0.1', port: ports.service, path: '/health', timeout: 1000 },
          response => {
            let raw = '';
            response.on('data', chunk => { raw += chunk; });
            response.on('end', () => resolve(JSON.parse(raw)));
          }
        );
        request.on('timeout', () => request.destroy(new Error('timeout')));
        request.on('error', reject);
      });
      if (value && value.ok) return true;
    } catch (_error) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  return false;
}

async function restoreSelection(paths, ports) {
  const settings = readJson(paths.settingsFile, {});
  const config = await requestCore(ports, '/configs');
  const proxies = await requestCore(ports, '/proxies');
  const selector = getSelectorName(paths, proxies, config && config.mode);
  const group = proxies.proxies && proxies.proxies[selector];
  const candidates = group && Array.isArray(group.all) ? group.all : [];
  let selected = settings.currentProxy;
  if (!selected || !candidates.includes(selected)) {
    selected = candidates.find(name => !['DIRECT', 'REJECT', 'PASS'].includes(name)) || '';
  }
  if (selected && group.now !== selected) {
    await requestCore(ports, `/proxies/${encodeURIComponent(selector)}`, {
      method: 'PUT',
      body: { name: selected }
    });
  }
  if (selected) {
    settings.currentProxy = selected;
    writeJson(paths.settingsFile, settings);
  }
}

async function start(paths, args) {
  const ports = getPorts(paths, args);
  if (isRunning(paths)) {
    console.log(`SilverVPN 已在后台运行：${formatPorts(ports)}`);
    return;
  }
  const reusing = await resolveCoreReuse(ports);
  const guiDataDir = path.resolve(path.join(os.homedir(), '.config', 'SilverVPN'));
  const guiPorts = getGuiPorts(paths);
  if (
    !reusing &&
    path.resolve(paths.dataDir) === guiDataDir &&
    ports.http !== guiPorts.http &&
    (await resolveCoreReuse(guiPorts))
  ) {
    throw new Error(
      `检测到桌面 GUI 的代理核心正在运行（HTTP ${guiPorts.http}），与 CLI 端口组 ${formatPorts(ports)} 不同。` +
      `请运行 svpn config ports ${guiPorts.http} 将 CLI 对齐到 GUI 后重试；或先关闭 GUI 再运行 svpn on。`
    );
  }
  if (!reusing && !portSetAvailable(ports)) {
    const others = findUserMihomoProcesses();
    if (others.length) {
      throw new Error(`检测到当前用户已有代理核心在运行（PID ${others.join(', ')}），端口组 ${formatPorts(ports)} 不可用。请先停止另一实例，或运行 svpn config ports <base-port> 更换个人端口。`);
    }
    throw new Error(`端口组被占用：${formatPorts(ports)}。请运行 svpn config ports <base-port> 设置个人端口。`);
  }
  const core = findCore(paths);
  if (!core) throw new Error('mihomo core not found. Run scripts/install.sh first.');

  if (reusing) {
    try {
      await restoreSelection(paths, ports);
    } catch (_error) {
      // 核心可能由 GUI 托管且鉴权尚未同步，选择恢复失败不影响集成。
    }
    if (args.proxy) writeShellProxy(paths, ports, true);
    console.log('SilverVPN 已就绪（复用现有核心）');
    console.log(`端口：${formatPorts(ports)}`);
    console.log('提示：核心由现有实例（可能为桌面 GUI）托管；svpn off 只会清理集成，不会停止该核心。');
    return;
  }

  prepareRuntimeConfig(paths, ports);
  ensureDir(paths.logsDir);
  const stdout = fs.openSync(assertPathInHome(path.join(paths.logsDir, 'svpn-core.log'), 'SilverVPN log'), 'a');
  const stderr = fs.openSync(assertPathInHome(path.join(paths.logsDir, 'svpn-core.err.log'), 'SilverVPN log'), 'a');
  const child = spawn(process.execPath, [path.resolve(__filename), 'daemon', '--data-dir', paths.dataDir], {
    detached: true,
    stdio: ['ignore', stdout, stderr]
  });
  child.unref();
  writeJson(paths.pidFile, {
    pid: child.pid,
    command: path.resolve(__filename),
    core,
    ports,
    startedAt: new Date().toISOString(),
    user: os.userInfo().username
  });
  const ready = (await waitForService(ports)) && (await waitForCore(ports));
  if (!ready) {
    if (pidAlive(child.pid) && processBelongsToCurrentUser(child.pid)) child.kill('SIGTERM');
    fs.rmSync(paths.pidFile, { force: true });
    throw new Error(`后台已启动但 Core 未就绪。查看日志：${path.join(paths.logsDir, 'svpn-core.err.log')}`);
  }
  await restoreSelection(paths, ports);
  if (args.proxy) writeShellProxy(paths, ports, true);
  const proxyEnabled = shellProxyEnabled(paths);
  console.log('SilverVPN 已启动');
  console.log(`模式：proxy-only 后台`);
  console.log(`端口：${formatPorts(ports)}`);
  console.log(`终端代理：${proxyEnabled ? '已开启' : '未开启（运行 svpn proxy on）'}`);
}

async function stop(paths, args) {
  const info = readPidInfo(paths);
  if (!info || !info.pid || !pidAlive(info.pid) || !processBelongsToCurrentUser(info.pid)) {
    fs.rmSync(paths.pidFile, { force: true });
    if (args.proxy) writeShellProxy(paths, getPorts(paths, args), false);
    restoreGnomeProxyIfOwned(paths, args);
    console.log('SilverVPN 未在后台运行');
    return;
  }
  process.kill(Number(info.pid), 'SIGTERM');
  const started = Date.now();
  while (pidAlive(info.pid) && Date.now() - started < 5000) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  fs.rmSync(paths.pidFile, { force: true });
  if (args.proxy !== false) writeShellProxy(paths, info.ports || getPorts(paths, args), false);
  restoreGnomeProxyIfOwned(paths, args);
  console.log('SilverVPN 已停止');
}

async function restart(paths, args) {
  await stop(paths, { ...args, proxy: false });
  await new Promise(resolve => setTimeout(resolve, 500));
  await start(paths, args);
}

function readModeLabel(mode) {
  return MODE_LABELS[mode] || mode || '未知';
}

function portListening(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port, timeout: 1000 });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

async function getCoreState(paths, ports) {
  const state = { running: false, listening: false, config: null, proxies: null };
  try {
    state.config = await requestCore(ports, '/configs', { timeout: 2000 });
    state.proxies = await requestCore(ports, '/proxies', { timeout: 3000 });
    state.running = true;
  } catch (_error) {
    state.running = false;
  }
  state.listening = await portListening(ports.core);
  return state;
}

function getSelectorName(paths, proxies, mode = '') {
  const items = proxies && proxies.proxies ? proxies.proxies : {};
  if (String(mode).toLowerCase() === 'global' && items.GLOBAL) return 'GLOBAL';
  try {
    const config = yaml.load(readText(paths.activeConfigFile)) || {};
    const target = getProxyTarget(config);
    if (items[target] && Array.isArray(items[target].all)) return target;
  } catch (_error) {
    // Fall through to compatibility selectors.
  }
  if (items.Proxy && Array.isArray(items.Proxy.all)) return 'Proxy';
  const found = Object.entries(items).find(([, value]) => Array.isArray(value.all) && value.all.length);
  return found ? found[0] : 'Proxy';
}

function getCurrentNode(paths, proxies, mode = '') {
  const items = proxies && proxies.proxies ? proxies.proxies : {};
  const proxy = items[getSelectorName(paths, proxies, mode)] || items.GLOBAL;
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
  return files.every(file => {
    const value = readJson(file, null);
    return value && value['http.proxy'] === `http://127.0.0.1:${ports.http}` && value['http.proxySupport'] === 'override';
  });
}

function vscodeProxyState(ports) {
  const check = base => {
    const file = path.join(os.homedir(), base, 'data', 'Machine', 'settings.json');
    const value = readJson(file, null);
    return Boolean(
      value &&
      value['http.proxy'] === `http://127.0.0.1:${ports.http}` &&
      value['http.proxySupport'] === 'override' &&
      value['http.proxyStrictSSL'] === true
    );
  };
  return {
    stable: check('.vscode-server'),
    insiders: check('.vscode-server-insiders')
  };
}

function vscodeOverrideInfo() {
  const read = base => {
    const file = path.join(os.homedir(), base, 'data', 'Machine', 'settings.json');
    const value = readJson(file, null);
    return value && value['http.proxy'] && value['http.proxySupport'] === 'override'
      ? String(value['http.proxy'])
      : '';
  };
  return {
    stable: read('.vscode-server'),
    insiders: read('.vscode-server-insiders')
  };
}

async function status(paths, args) {
  const ports = getPorts(paths, args);
  const pid = readPidInfo(paths);
  const alive = isRunning(paths);
  if (!alive && pid && pid.pid) {
    fs.rmSync(paths.pidFile, { force: true });
  }
  const core = await getCoreState(paths, ports);
  const cliUnavailable = !(alive || core.running);
  const guiPorts = getGuiPorts(paths);
  let guiListening = false;
  let guiPortBusy = false;
  if (!core.running) {
    guiListening = await coreProbe(guiPorts);
    if (!guiListening) {
      guiPortBusy = await portListening(guiPorts.core);
    }
  }
  const guiRunning = cliUnavailable && guiListening;
  const activeHttpPort = core.running ? ports.http : guiListening ? guiPorts.http : 0;
  const mode = core.config ? core.config.mode : readJson(paths.settingsFile, {}).mode || 'rule';
  const node = getCurrentNode(paths, core.proxies, mode) || readJson(paths.settingsFile, {}).currentProxy || '未选择';
  const delay = core.running && node !== '未选择' && !args['no-delay'] ? await getDelay(ports, node) : null;

  const override = vscodeOverrideInfo();
  const vscodeTargets = [
    path.join(os.homedir(), '.vscode-server'),
    path.join(os.homedir(), '.vscode-server-insiders')
  ];
  const envMode = vscodeEnvEnabled(vscodeTargets);
  const expectedProxy = activeHttpPort ? `http://127.0.0.1:${activeHttpPort}` : '';
  const describeOverride = value => {
    if (!value) return envMode ? '环境变量模式（已启用）' : '未配置';
    const fix = '建议运行 svpn vscode on 修复';
    if (!expectedProxy) return `${value}（警告：后端未运行，网络不可用；${fix}）`;
    if (value === expectedProxy) return `${value}（当前用户端口，配置正确）`;
    return `${value}（警告：与后端 ${expectedProxy} 不一致；${fix}）`;
  };

  if (args.json) {
    console.log(JSON.stringify({
      running: alive || core.running,
      guiCore: guiRunning,
      pid: alive ? pid && pid.pid : null,
      ports,
      mode,
      node,
      delay,
      terminalProxy: shellProxyEnabled(paths),
      vscodeOverride: override,
      dataDir: paths.dataDir
    }, null, 2));
    return;
  }

  if (alive || core.running) {
    console.log('SilverVPN：运行中（CLI 后台）');
  } else if (guiRunning) {
    console.log(`SilverVPN：运行中（桌面 GUI 核心，HTTP ${guiPorts.http}）`);
  } else if (guiPortBusy) {
    console.log(`SilverVPN：未运行（端口 ${guiPorts.core} 有服务但无法验证；若 GUI 正在运行，请重启 GUI 完成配置迁移）`);
  } else {
    console.log('SilverVPN：未运行');
  }
  console.log(`用户：${os.userInfo().username}`);
  console.log(`模式：${readModeLabel(mode)} (${String(mode).toLowerCase()})`);
  console.log(`节点：${node}${delay === null ? '' : `  ${delay} ms`}`);
  console.log(`代理：HTTP ${ports.http} / SOCKS ${ports.socks}`);
  console.log(`终端代理：${shellProxyEnabled(paths) ? '已开启' : '未开启'}`);
  console.log(`VS Code Stable：${describeOverride(override.stable)}`);
  console.log(`VS Code Insiders：${describeOverride(override.insiders)}`);
  console.log(`后台：${alive ? `PID ${pid.pid}` : '无后台进程'}${guiRunning ? '（核心由 GUI 托管）' : ''}`);
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
    await restoreSelection(paths, ports);
    console.log(`模式已切换：${readModeLabel(mode)}`);
  } catch (_error) {
    console.log(`模式已保存：${readModeLabel(mode)}（Core 未运行，启动后生效）`);
  }
}

function proxyListFromCore(paths, proxies, mode = '') {
  const items = proxies && proxies.proxies ? proxies.proxies : {};
  const group = items[getSelectorName(paths, proxies, mode)] || items.GLOBAL;
  return group && Array.isArray(group.all) ? group.all.filter(name => !['DIRECT', 'REJECT'].includes(name)) : [];
}

async function nodes(paths, args) {
  const ports = getPorts(paths, args);
  const proxies = await requestCore(ports, '/proxies');
  const mode = readJson(paths.settingsFile, {}).mode || 'rule';
  const current = getCurrentNode(paths, proxies, mode);
  const list = proxyListFromCore(paths, proxies, mode);
  const delays = args.delay ? await Promise.all(list.map(name => getDelay(ports, name))) : [];
  for (let index = 0; index < list.length; index += 1) {
    const name = list[index];
    let suffix = '';
    if (args.delay) {
      const delay = delays[index];
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
  const mode = readJson(paths.settingsFile, {}).mode || 'rule';
  const selector = getSelectorName(paths, proxies, mode);
  const list = proxyListFromCore(paths, proxies, mode);
  const node = resolveNode(args._.slice(1).join(' '), list);
  const groups = [...new Set([selector, 'GLOBAL'])];
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
  paths.shellProxyFile = assertPathInHome(paths.shellProxyFile, 'Shell proxy state');
  ensureDir(path.dirname(paths.shellProxyFile));
  if (!enabled) {
    fs.writeFileSync(paths.shellProxyFile, `# Generated by svpn.\nexport SILVERVPN_PROXY_ENABLED=0\nunset HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY http_proxy https_proxy all_proxy no_proxy\n`);
    fs.chmodSync(paths.shellProxyFile, 0o600);
    return;
  }
  const noProxy = 'localhost,127.0.0.1,::1,gitlab.reallab.org.cn,.reallab.org.cn,.local';
  fs.writeFileSync(
    paths.shellProxyFile,
    `# Generated by svpn.\nexport SILVERVPN_PROXY_ENABLED=1\nexport HTTP_PROXY='http://127.0.0.1:${ports.http}'\nexport HTTPS_PROXY='http://127.0.0.1:${ports.http}'\nexport ALL_PROXY='http://127.0.0.1:${ports.http}'\nexport http_proxy=\"$HTTP_PROXY\"\nexport https_proxy=\"$HTTPS_PROXY\"\nexport all_proxy=\"$ALL_PROXY\"\nexport NO_PROXY='${noProxy}'\nexport no_proxy=\"$NO_PROXY\"\n`
  );
  fs.chmodSync(paths.shellProxyFile, 0o600);
}

function readGnomeProxy() {
  const read = key => execSync(`gsettings get ${key}`, { encoding: 'utf8', timeout: 2000 }).trim().replace(/'/g, '');
  const mode = read('org.gnome.system.proxy mode');
  const host = read('org.gnome.system.proxy.http host');
  const port = Number(read('org.gnome.system.proxy.http port')) || 0;
  return { mode, host, port };
}

// 若 GNOME 系统代理仍指向本应用端口（如 GUI 停止核心后残留），恢复为直连模式
function restoreGnomeProxyIfOwned(paths, args) {
  const ports = getPorts(paths, args);
  const ownedPorts = new Set([Number(ports.http), Number(ports.socks)]);
  try {
    const state = readGnomeProxy();
    if (state.mode === 'manual' && state.host === '127.0.0.1' && ownedPorts.has(state.port)) {
      execSync('gsettings set org.gnome.system.proxy mode none', { timeout: 2000 });
    }
  } catch (_error) {
    // 无 gsettings（无桌面环境）时忽略
  }
}

// 诊断网络与代理状态
async function doctor(paths, args) {
  const ports = getPorts(paths, args);
  const coreState = await getCoreState(paths, ports);
  const lines = [];
  lines.push(coreState.running ? `✓ 核心运行中（控制端口 ${ports.core}）` : '✗ 核心未运行');
  lines.push(coreState.listening ? `✓ 控制端口 ${ports.core} 监听中` : `✗ 控制端口 ${ports.core} 未监听`);
  const httpUp = await portListening(ports.http);
  lines.push(httpUp ? `✓ 代理端口 ${ports.http}/${ports.socks} 正常` : `✗ 代理端口 ${ports.http} 未监听`);
  try {
    const g = readGnomeProxy();
    const ownedPorts = new Set([Number(ports.http), Number(ports.socks)]);
    if (g.mode === 'manual' && g.host === '127.0.0.1' && ownedPorts.has(g.port)) {
      lines.push(httpUp
        ? `✓ 系统代理正常（manual → 127.0.0.1:${g.port}）`
        : `✗ 系统代理残留：仍指向 127.0.0.1:${g.port}，但核心未监听 → 运行 svpn fix 修复`);
    } else if (g.mode === 'manual') {
      lines.push(`⚠ 系统代理由其他应用设置（${g.host}:${g.port || '?'}），未处理`);
    } else {
      lines.push('✓ 系统代理已关闭（直连）');
    }
  } catch (_error) {
    lines.push('ℹ 无桌面系统代理（gsettings 不可用）');
  }
  if (fs.existsSync(paths.shellProxyFile)) {
    const enabled = /SILVERVPN_PROXY_ENABLED=1/.test(fs.readFileSync(paths.shellProxyFile, 'utf8'));
    lines.push(enabled ? '⚠ 终端代理文件为开启状态（需在 shell 中 source 后生效）' : '✓ 终端代理文件为关闭状态');
  } else {
    lines.push('ℹ 未发现终端代理状态文件');
  }
  console.log(lines.join('\n'));
}

// 修复系统代理残留
async function fix(paths, args) {
  let fixed = false;
  const ports = getPorts(paths, args);
  const httpUp = await portListening(ports.http);
  try {
    const g = readGnomeProxy();
    const ownedPorts = new Set([Number(ports.http), Number(ports.socks)]);
    if (g.mode === 'manual' && g.host === '127.0.0.1' && ownedPorts.has(g.port) && !httpUp) {
      execSync('gsettings set org.gnome.system.proxy mode none', { timeout: 2000 });
      console.log('✓ 已修复：系统代理残留已恢复为直连模式');
      fixed = true;
    }
  } catch (_error) {
    // 忽略无 gsettings 的环境
  }
  if (!fixed) {
    console.log('未发现需要修复的问题');
  }
  await doctor(paths, args);
}

function proxy(paths, args) {
  const action = args._[1] || 'status';
  const ports = getPorts(paths, args);
  if (action === 'on') {
    writeShellProxy(paths, ports, true);
    console.log('终端代理已开启');
    console.log('新的 shell 会自动生效；已安装 shell hook 的当前交互 shell 会在下一次提示符刷新。');
    return;
  }
  if (action === 'off') {
    writeShellProxy(paths, ports, false);
    console.log('终端代理已关闭');
    console.log('新的 shell 会自动清理；已安装 shell hook 的当前交互 shell 会在下一次提示符刷新。');
    return;
  }
  console.log(`终端代理：${shellProxyEnabled(paths) ? '已开启' : '未开启'}`);
}

function clearVscodeProxySettings(file) {
  if (!fs.existsSync(file)) return;
  const data = readJson(file, null);
  if (!data || typeof data !== 'object') return;
  const keys = ['http.proxy', 'http.proxySupport', 'http.proxyStrictSSL'];
  const changed = keys.some(key => Object.prototype.hasOwnProperty.call(data, key));
  if (!changed) return;
  keys.forEach(key => delete data[key]);
  writeJson(file, data);
}

function vscodeEnvEnabled(targets) {
  return targets.every(base => {
    const file = path.join(base, 'server-env-setup');
    return readText(file).includes('# >>> SilverVPN proxy >>>');
  });
}

function updateVscodeEnvFile(dir, enabled) {
  const file = assertPathInHome(path.join(dir, 'server-env-setup'), 'VS Code environment file');
  if (!enabled && !fs.existsSync(file)) return;
  ensureDir(dir);
  const begin = '# >>> SilverVPN proxy >>>';
  const end = '# <<< SilverVPN proxy <<<';
  const current = readText(file);
  const pattern = /# >>> SilverVPN proxy >>>[\s\S]*?# <<< SilverVPN proxy <<<\n?/g;
  const cleaned = current.replace(pattern, '').replace(/\s+$/, '');
  const block = `${begin}\nif [ -r "$HOME/.config/SilverVPN/shell-proxy.sh" ]; then\n  . "$HOME/.config/SilverVPN/shell-proxy.sh"\nfi\n${end}`;
  const next = enabled ? `${cleaned ? `${cleaned}\n\n` : '#!/usr/bin/env bash\n'}${block}\n` : `${cleaned}${cleaned ? '\n' : ''}`;
  fs.writeFileSync(file, next);
  fs.chmodSync(file, 0o700);
}

async function vscode(paths, args) {
  const action = args._[1] || 'status';
  const ports = getPorts(paths, args);
  const targets = [
    path.join(os.homedir(), '.vscode-server'),
    path.join(os.homedir(), '.vscode-server-insiders')
  ];
  if (action === 'on') {
    writeShellProxy(paths, ports, true);
    for (const base of targets) {
      clearVscodeProxySettings(path.join(base, 'data', 'Machine', 'settings.json'));
      updateVscodeEnvFile(base, true);
    }
    console.log(`VS Code Remote 代理已启用：通过环境变量使用 http://127.0.0.1:${ports.http}`);
    console.log('关闭代理后，重新连接 VS Code 会自动恢复直连，不会再断网。');
    if (!(await coreProbe(ports))) {
      console.log(`警告：代理后端当前未运行，VS Code 网络将不可用。请先执行 svpn on 启动后端（或开启桌面 GUI 并保持端口一致）。`);
    }
    console.log('请重启 VS Code Server：pkill -f .vscode-server');
    return;
  }
  if (action === 'off') {
    for (const base of targets) {
      clearVscodeProxySettings(path.join(base, 'data', 'Machine', 'settings.json'));
      updateVscodeEnvFile(base, false);
    }
    console.log('VS Code Remote 代理已移除，重新连接后恢复直连');
    console.log('请重启 VS Code Server：pkill -f .vscode-server');
    return;
  }
  const legacy = vscodeOverrideInfo();
  if (legacy.stable || legacy.insiders) {
    console.log('VS Code：发现旧版遗留的持久代理配置（关闭代理会导致断网），请运行 svpn vscode on 修复');
    return;
  }
  console.log(`VS Code：${vscodeEnvEnabled(targets) ? '环境变量代理已启用' : '未配置'}`);
}

async function applyBypassRuntime(paths, ports) {
  prepareRuntimeConfig(paths, ports);
  await requestCore(ports, '/configs?force=true', {
    method: 'PUT',
    body: { path: paths.runtimeConfigFile }
  });
  await restoreSelection(paths, ports);
}

async function bypass(paths, args) {
  const action = args._[1] || 'list';
  const ports = getPorts(paths, args);
  const settings = readJson(paths.settingsFile, {});
  const custom = normalizeBypassHosts(settings.bypassHosts || []);

  const save = async next => {
    writeJson(paths.settingsFile, { ...settings, bypassHosts: normalizeBypassHosts(next) });
    const running = await coreProbe(ports);
    if (running) {
      try {
        await applyBypassRuntime(paths, ports);
        console.log('绕过列表已更新并即时生效（核心已热重载）。');
      } catch (error) {
        console.log(`绕过列表已保存，但核心热重载失败（${error.message}），重启代理后生效。`);
      }
    } else {
      console.log('绕过列表已保存，启动代理后生效。');
    }
  };

  if (action === 'list' || action === 'status') {
    console.log(`内置默认绕过（${DEFAULT_BYPASS_HOSTS.length} 条）：`);
    DEFAULT_BYPASS_HOSTS.forEach(host => console.log(`  ${host}`));
    console.log(`自定义绕过（${custom.length} 条）：`);
    if (!custom.length) console.log('  （无）');
    custom.forEach(host => console.log(`  ${host}`));
    return;
  }
  if (action === 'add') {
    const values = normalizeBypassHosts(args._.slice(2));
    if (!values.length) throw new Error('Usage: svpn bypass add <host> [host...]');
    await save([...custom, ...values]);
    return;
  }
  if (action === 'remove' || action === 'rm') {
    const removeSet = new Set(normalizeBypassHosts(args._.slice(2)));
    if (!removeSet.size) throw new Error('Usage: svpn bypass remove <host> [host...]');
    await save(custom.filter(host => !removeSet.has(host)));
    return;
  }
  if (action === 'reset' || action === 'clear') {
    await save([]);
    return;
  }
  throw new Error('Usage: svpn bypass list|add <host>|remove <host>|reset');
}

function configurePorts(paths, args) {
  const base = args._[2];
  if (!base) {
    const ports = getPorts(paths, args);
    console.log(formatPorts(ports));
    return;
  }
  if (isRunning(paths)) {
    throw new Error('SilverVPN is running. Run svpn off before changing this user\'s ports.');
  }
  const ports = portsFromBase(normalizePort(base));
  const config = getServerConfig(paths);
  config.ports = ports;
  if (config.config && config.config.ports) {
    delete config.config.ports;
    if (!Object.keys(config.config).length) {
      delete config.config;
    }
  }
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
    ['GitHub', 'https://api.github.com/repos/github/copilot-cli/releases/latest'],
    ['GitHub Copilot', 'https://api.githubcopilot.com'],
    ['OpenAI', 'https://api.openai.com/v1/models'],
    ['ChatGPT', 'https://chatgpt.com']
  ];
  const ipResult = spawnSync('curl', ['-sS', '--max-time', '20', 'https://api.ipify.org'], { encoding: 'utf8', env });
  console.log(`出口 IP：${ipResult.status === 0 && ipResult.stdout.trim() ? ipResult.stdout.trim() : '失败'}`);
  for (const [label, url] of tests) {
    const result = spawnSync(
      'curl',
      ['-sS', '-L', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '25', url],
      { encoding: 'utf8', env }
    );
    const code = String(result.stdout || '').trim();
    let state = '失败';
    if (/^[23]\d\d$/.test(code)) state = `可达 (HTTP ${code})`;
    else if (code === '401') state = '可达，需要认证 (HTTP 401)';
    else if (code === '403') state = '可达，但当前节点/服务拒绝访问 (HTTP 403)';
    else if (/^[45]\d\d$/.test(code)) state = `服务可达 (HTTP ${code})`;
    console.log(`${label}：${state}`);
  }
}

function profileId(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function readProfiles(paths) {
  const data = readJson(paths.subscriptionsFile, { subscriptions: [] });
  return Array.isArray(data.subscriptions) ? data.subscriptions : [];
}

function writeProfiles(paths, profiles) {
  writeJson(paths.subscriptionsFile, { subscriptions: profiles });
}

function saveImportedProfile(paths, source, name) {
  const settings = readJson(paths.settingsFile, {});
  const metadata = settings.profile || {};
  const id = `custom-${profileId(source)}`;
  const fileName = path.join(paths.subscriptionsDir, `${id}.yaml`);
  assertPathInHome(fileName, 'Subscription profile');
  ensureDir(paths.subscriptionsDir);
  fs.copyFileSync(paths.activeConfigFile, fileName);
  let proxyCount = metadata.proxyCount || 0;
  if (!proxyCount) {
    try {
      const config = yaml.load(readText(paths.activeConfigFile)) || {};
      proxyCount = Array.isArray(config.proxies) ? config.proxies.length : 0;
    } catch (_error) {
      proxyCount = 0;
    }
  }
  const record = {
    id,
    fileName,
    name: name || metadata.name || 'Custom Subscription',
    kind: 'custom',
    sourceType: metadata.sourceType || 'subscription-url',
    url: metadata.subscriptionUrl || (/^https?:|^sub:/i.test(source) ? source : ''),
    urlDisplay: metadata.subscriptionUrlDisplay || '',
    proxyCount,
    importedAt: metadata.importedAt || new Date().toISOString()
  };
  const profiles = readProfiles(paths).filter(item => item.id !== id && item.fileName !== fileName);
  profiles.push(record);
  writeProfiles(paths, profiles);
  settings.currentProfileId = id;
  settings.currentProfile = paths.activeConfigFile;
  writeJson(paths.settingsFile, settings);
  return record;
}

function listProfiles(paths) {
  const settings = readJson(paths.settingsFile, {});
  const profiles = readProfiles(paths);
  if (!profiles.length) {
    console.log('没有已保存的订阅方案。');
    return;
  }
  profiles.forEach((profile, index) => {
    const active = profile.id === settings.currentProfileId ? '*' : ' ';
    console.log(`${active} ${String(index + 1).padStart(2, ' ')}. ${profile.name || profile.id}  (${profile.proxyCount || '?'} 节点)`);
  });
}

function resolveProfile(paths, value) {
  const profiles = readProfiles(paths);
  const input = String(value || '').trim();
  if (!input) throw new Error('Usage: svpn profile use <number|name>');
  if (/^\d+$/.test(input)) {
    const selected = profiles[Number(input) - 1];
    if (selected) return selected;
  }
  return profiles.find(item => item.id === input || item.name === input) ||
    profiles.find(item => String(item.name || '').includes(input)) ||
    null;
}

async function useProfile(paths, args) {
  const profile = resolveProfile(paths, args._.slice(2).join(' '));
  if (!profile || !profile.fileName || !fs.existsSync(profile.fileName)) {
    throw new Error('Subscription profile not found or its config file is missing.');
  }
  assertPathInHome(profile.fileName, 'Subscription profile');
  fs.copyFileSync(profile.fileName, assertPathInHome(paths.activeConfigFile, 'Active config'));
  const settings = readJson(paths.settingsFile, {});
  settings.currentProfileId = profile.id;
  settings.currentProfile = paths.activeConfigFile;
  writeJson(paths.settingsFile, settings);
  if (isRunning(paths)) await restart(paths, { ...args, proxy: false });
  console.log(`订阅方案已切换：${profile.name || profile.id}`);
}

async function profile(paths, args) {
  const action = args._[1] || 'list';
  if (action === 'list') return listProfiles(paths);
  if (action === 'use') return useProfile(paths, args);
  throw new Error('Usage: svpn profile list|use <number|name>');
}

async function importConfig(paths, args) {
  const source = args._[1];
  if (!source) throw new Error('Usage: svpn import <subscription-url|sub://...|config.yaml> [profile-name]');
  const cli = path.join(APP_ROOT, 'cli.js');
  const result = spawnSync(process.execPath, [cli, 'import', source, '--data-dir', paths.dataDir], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'Subscription import failed').trim());
  }
  const record = saveImportedProfile(paths, source, args._.slice(2).join(' '));
  if (isRunning(paths)) await restart(paths, { ...args, proxy: false });
  console.log(`订阅已导入：${record.name}（${record.proxyCount || '未知'} 节点）`);
}

async function on(paths, args) {
  await start(paths, { ...args, proxy: false });
  proxy(paths, { ...args, _: ['proxy', 'on'] });
  await vscode(paths, { ...args, _: ['vscode', 'on'] });
  console.log('SilverVPN 一键开启完成。');
}

async function off(paths, args) {
  await vscode(paths, { ...args, _: ['vscode', 'off'] });
  proxy(paths, { ...args, _: ['proxy', 'off'] });
  await stop(paths, { ...args, proxy: false });
  console.log('SilverVPN 一键关闭完成。');
}

function trafficDateKey(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() - offsetDays);
  return date.toISOString().slice(0, 10);
}

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let amount = bytes;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function trafficRange(input) {
  const value = String(input || 'today').trim().toLowerCase();
  const ranges = {
    today: { days: 1, label: '今天' },
    '1': { days: 1, label: '今天' },
    d3: { days: 3, label: '近 3 天' },
    '3': { days: 3, label: '近 3 天' },
    d7: { days: 7, label: '近 7 天' },
    '7': { days: 7, label: '近 7 天' },
    d30: { days: 30, label: '近 30 天' },
    '30': { days: 30, label: '近 30 天' }
  };
  const selected = ranges[value];
  if (!selected) {
    throw new Error('用法：svpn traffic [today|3|7|30] [--json]');
  }
  return selected;
}

function proxyServerMap(paths) {
  const servers = new Map();
  try {
    const config = yaml.load(readText(paths.activeConfigFile)) || {};
    for (const item of Array.isArray(config.proxies) ? config.proxies : []) {
      if (item && item.name && item.server) {
        servers.set(String(item.name), String(item.server));
      }
    }
  } catch (_error) {
    // 台账仍可展示节点名，服务地址仅作为增强信息。
  }
  return servers;
}

function traffic(paths, args) {
  const selected = trafficRange(args._[1]);
  const source = readJson(paths.trafficStatsFile, { byDate: {} });
  const byDate = source.byDate && typeof source.byDate === 'object' ? source.byDate : {};
  const dates = Array.from({ length: selected.days }, (_, index) => trafficDateKey(index));
  const nodes = new Map();
  const total = { up: 0, down: 0 };
  const proxy = { up: 0, down: 0 };
  const direct = { up: 0, down: 0 };
  const servers = proxyServerMap(paths);
  const detailMap = new Map();

  for (const date of dates) {
    for (const [name, entry] of Object.entries(byDate[date] || {})) {
      if (name === '__proxy__' || name === '__total__') {
        continue;
      }
      const up = Number(entry && entry.up) || 0;
      const down = Number(entry && entry.down) || 0;
      const isProxy = entry && typeof entry.proxy === 'boolean'
        ? entry.proxy
        : !/^(DIRECT|REJECT)$/i.test(name);
      const node = nodes.get(name) || {
        name,
        server: entry && entry.server ? String(entry.server) : servers.get(name) || '',
        proxy: isProxy,
        up: 0,
        down: 0
      };
      node.up += up;
      node.down += down;
      nodes.set(name, node);
      total.up += up;
      total.down += down;
      const target = isProxy ? proxy : direct;
      target.up += up;
      target.down += down;
    }
    for (const detail of Object.values(source.detailsByDate && source.detailsByDate[date] || {})) {
      if (!detail || detail.proxy === false) {
        continue;
      }
      const host = String(detail.host || detail.ip || '未知目标');
      const ip = String(detail.ip || '');
      const port = String(detail.port || '');
      const node = String(detail.node || '未知');
      const key = `${node}\u0000${host}\u0000${ip}\u0000${port}`;
      const item = detailMap.get(key) || {
        host,
        ip,
        port,
        node,
        server: String(detail.server || servers.get(node) || ''),
        up: 0,
        down: 0,
        lastSeen: ''
      };
      item.up += Number(detail.up) || 0;
      item.down += Number(detail.down) || 0;
      if (String(detail.lastSeen || '') > item.lastSeen) {
        item.lastSeen = String(detail.lastSeen || '');
      }
      detailMap.set(key, item);
    }
  }

  const rows = [...nodes.values()]
    .map(node => ({ ...node, total: node.up + node.down }))
    .filter(node => node.total > 0)
    .sort((left, right) => {
      if (left.proxy !== right.proxy) return left.proxy ? -1 : 1;
      return right.total - left.total;
    });
  const details = [...detailMap.values()]
    .map(item => ({ ...item, total: item.up + item.down }))
    .sort((left, right) => right.total - left.total)
    .slice(0, TRAFFIC_TARGETS_PER_DAY_MAX);
  const result = { range: selected, dates, total, proxy, direct, nodes: rows, details };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`流量统计（${selected.label}：${dates[dates.length - 1]} 至 ${dates[0]}）`);
  console.log(`总流量：${formatBytes(total.up + total.down)}  ↓ ${formatBytes(total.down)} / ↑ ${formatBytes(total.up)}`);
  console.log(`代理流量：${formatBytes(proxy.up + proxy.down)}  ↓ ${formatBytes(proxy.down)} / ↑ ${formatBytes(proxy.up)}`);
  console.log(`直连流量：${formatBytes(direct.up + direct.down)}  ↓ ${formatBytes(direct.down)} / ↑ ${formatBytes(direct.up)}`);
  if (!rows.length) {
    console.log('暂无台账记录；请先运行 svpn on 并产生流量。');
    return;
  }
  console.log('\n节点 / 服务地址：');
  for (const row of rows) {
    const kind = row.proxy ? '代理' : '直连';
    const server = row.server ? `  ${row.server}` : '';
    console.log(`- [${kind}] ${row.name}${server}`);
    console.log(`  ${formatBytes(row.total)}  ↓ ${formatBytes(row.down)} / ↑ ${formatBytes(row.up)}`);
  }
  if (args.details || details.length) {
    console.log('\n代理目标明细：');
    if (!details.length) {
      console.log('暂无目标明细；新版采集器启动后才会记录域名/IP。');
    } else {
      for (const [index, item] of details.entries()) {
        const endpoint = [item.ip, item.port].filter(Boolean).join(':');
        const server = item.server ? `  节点地址：${item.server}` : '';
        console.log(`${index + 1}. ${item.host}${endpoint ? `  ${endpoint}` : ''}`);
        console.log(`   节点：${item.node}${server}`);
        console.log(`   ${formatBytes(item.total)}  ↓ ${formatBytes(item.down)} / ↑ ${formatBytes(item.up)}`);
      }
    }
  }
}

function printHelp() {
  console.log(`Usage: svpn <command>\n\nOne-click:\n  svpn on                       Start backend, terminal proxy and both VS Code Remote proxies\n  svpn off                      Stop and remove this user's proxy integrations\n  svpn status                   Human-friendly status\n\nCore commands:\n  svpn start [--proxy]          Start per-user proxy-only backend\n  svpn stop                     Stop backend\n  svpn restart [--proxy]        Restart backend\n\nProxy control:\n  svpn mode smart|global|direct Set proxy-only routing mode\n  svpn nodes [--delay]          List nodes, optionally with delays\n  svpn delay                    Alias for: svpn nodes --delay\n  svpn use <number|name>        Switch node and close old connections\n  svpn traffic [today|3|7|30]   Show persisted traffic by proxy node and server\n  svpn traffic ... --details    Also show target domain/IP/port breakdown\n  svpn proxy on|off             Write per-user terminal proxy state\n  svpn vscode on|off            Configure Stable and Insiders Remote proxy\n  svpn bypass list|add|remove   Manage bypassed (direct) hosts\n\nSubscriptions:\n  svpn import <url|file> [name] Import and save a profile\n  svpn profile list             List subscription profiles\n  svpn profile use <number|name> Switch profile\n\nSetup:\n  svpn config ports <base-port> Set personal HTTP port base, e.g. 4880\n  svpn test                     Test IP/GitHub/Copilot/OpenAI/ChatGPT\n  svpn doctor                   Diagnose core/ports/system-proxy state\n  svpn fix                      Repair leftover system proxy settings\n\nSafety:\n  - proxy-only: no TUN, routes, DNS or /etc changes.\n  - only the current user's HOME is modified.\n  - new shells automatically load proxy state through the installed shell hook.\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || 'help';
  const paths = getPaths(args);
  setActivePaths(paths);
  ensureCoreSecret(paths);
  ensureDir(paths.dataDir);
  ensureDir(paths.logsDir);

  if (command === 'help' || args.help) return printHelp();
  if (command === 'daemon') return daemon(paths, args);
  if (command === 'on') return on(paths, args);
  if (command === 'off') return off(paths, args);
  if (command === 'start') return start(paths, args);
  if (command === 'stop') return stop(paths, args);
  if (command === 'restart') return restart(paths, args);
  if (command === 'status') return status(paths, args);
  if (command === 'mode') return setMode(paths, args);
  if (command === 'nodes') return nodes(paths, args);
  if (command === 'delay') return nodes(paths, { ...args, delay: true });
  if (command === 'use') return useNode(paths, args);
  if (command === 'traffic') return traffic(paths, args);
  if (command === 'proxy') return proxy(paths, args);
  if (command === 'vscode') return vscode(paths, args);
  if (command === 'bypass') return bypass(paths, args);
  if (command === 'test') return runTest(paths, args);
  if (command === 'doctor') return doctor(paths, args);
  if (command === 'fix') return fix(paths, args);
  if (command === 'import') return importConfig(paths, args);
  if (command === 'profile') return profile(paths, args);
  if (command === 'config' && args._[1] === 'ports') return configurePorts(paths, args);
  throw new Error(`Unknown command: ${command}`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
