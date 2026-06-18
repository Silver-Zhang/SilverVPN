'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  ipcMain,
  shell
} = require('electron');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const { URL } = require('url');

const APP_NAME = 'SilverVPN';
const LEGACY_APP_NAMES = ['熊猫上网 Linux', 'xiongmao-vpn-linux'];
const CONTROL_HOST = '127.0.0.1';
const PUBLIC_CONTROL_PORT = 4788;
const CORE_CONTROL_PORT = 4790;
const HTTP_PROXY_PORT = 4780;
const SOCKS_PROXY_PORT = 4781;
const DEFAULT_DELAY_TEST_URL = 'https://www.gstatic.com/generate_204';
const CORE_START_TIMEOUT_MS = 20000;
const LOCAL_API_KEY = 'RocketMaker';
const MODE_ALIASES = {
  rule: 'Rule',
  smart: 'Rule',
  intelligent: 'Rule',
  auto: 'Rule',
  global: 'Global',
  direct: 'Direct'
};
const MODE_LABELS = {
  Rule: '智能代理',
  Global: '全局代理',
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
  'DOMAIN-SUFFIX,google.com,Proxy',
  'DOMAIN-SUFFIX,googleapis.com,Proxy',
  'DOMAIN-SUFFIX,gstatic.com,Proxy',
  'DOMAIN,storage.googleapis.com,Proxy',
  'DOMAIN-SUFFIX,github.com,Proxy',
  'DOMAIN-SUFFIX,githubusercontent.com,Proxy'
];
const ALWAYS_DIRECT_RULES = ['GEOIP,CN,DIRECT'];

let mainWindow = null;
let tray = null;
let compatServer = null;
let coreProcess = null;
let corePath = null;
let isQuitting = false;
let shutdownInProgress = false;

let runtime = null;
let settings = {
  systemProxy: false,
  startWithSystem: false,
  holdProxy: false,
  language: 'zh-CN',
  bypassHosts: [],
  currentProfileId: '',
  currentProfile: '',
  currentSelector: 'Proxy',
  currentProxy: '',
  alert: false
};

function resolveRuntimePaths() {
  const userData = app.getPath('userData');
  const packagedResources = path.join(process.resourcesPath || '', 'resources');
  const localResources = path.join(__dirname, 'resources');
  const resources = fs.existsSync(packagedResources) ? packagedResources : localResources;

  return {
    resources,
    userData,
    clashConfigDir: path.join(userData, 'clash-configs'),
    clashRuntimeDir: path.join(userData, 'clash-runtime'),
    clashyConfigDir: path.join(userData, 'clashy-configs'),
    subscriptionsDir: path.join(userData, 'subscriptions'),
    logsDir: path.join(userData, 'logs'),
    settingsFile: path.join(userData, 'clashy-configs', 'settings.json'),
    subscriptionsFile: path.join(userData, 'clashy-configs', 'subscriptions.json'),
    shellProxyFile: path.join(userData, 'shell-proxy.sh'),
    activeConfigFile: path.join(userData, 'clash-configs', 'config.yaml'),
    runtimeConfigFile: path.join(userData, 'clash-runtime', 'config.yaml'),
    loadingImage: path.join(resources, 'clashy-configs', 'loading.jpg'),
    iconFile: path.join(__dirname, 'renderer', 'static', 'media', 'silvervpn.png')
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDirectory(source, target, overwrite = false) {
  if (!fs.existsSync(source)) {
    return;
  }
  ensureDir(target);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(from, to, overwrite);
    } else if (overwrite || !fs.existsSync(to)) {
      fs.copyFileSync(from, to);
    }
  }
}

function copyIfMissing(source, target) {
  if (!fs.existsSync(target) && fs.existsSync(source)) {
    ensureDir(path.dirname(target));
    fs.copyFileSync(source, target);
  }
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      return fallback;
    }
    const raw = fs.readFileSync(file, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function userDataHasRealConfig(targetUserData) {
  const file = path.join(targetUserData, 'clash-configs', 'config.yaml');
  if (!fs.existsSync(file)) {
    return false;
  }
  const text = fs.readFileSync(file, 'utf8');
  return text.trim() && !text.includes('线路加载失败，请点击左侧刷新按钮');
}

function migrateLegacyUserData(targetUserData) {
  if (userDataHasRealConfig(targetUserData)) {
    return;
  }
  const appData = app.getPath('appData');
  for (const name of LEGACY_APP_NAMES) {
    const source = path.join(appData, name);
    if (source !== targetUserData && fs.existsSync(source)) {
      copyDirectory(source, targetUserData, true);
      return;
    }
  }
}

function normalizeBypassHosts(values) {
  const source = Array.isArray(values) ? values : String(values || '').split(/\r?\n/);
  const cleaned = [];
  const seen = new Set();
  for (const item of source) {
    const value = String(item || '').trim();
    if (!value || value.startsWith('#')) {
      continue;
    }
    if (!seen.has(value)) {
      cleaned.push(value);
      seen.add(value);
    }
  }
  return cleaned;
}

function getBypassHosts() {
  return normalizeBypassHosts([...DEFAULT_BYPASS_HOSTS, ...(settings.bypassHosts || [])]);
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

function getDirectRules() {
  return normalizeBypassHosts([...getBypassHosts().map(bypassHostToDirectRule), ...ALWAYS_DIRECT_RULES]);
}

function initializeFilesystem() {
  runtime = resolveRuntimePaths();
  migrateLegacyUserData(runtime.userData);
  [
    runtime.clashConfigDir,
    runtime.clashRuntimeDir,
    runtime.clashyConfigDir,
    runtime.subscriptionsDir,
    runtime.logsDir
  ].forEach(ensureDir);

  copyIfMissing(
    path.join(runtime.resources, 'clash-configs', 'config.yaml'),
    runtime.activeConfigFile
  );
  copyIfMissing(
    path.join(runtime.resources, 'clash-configs', 'Country.mmdb'),
    path.join(runtime.clashConfigDir, 'Country.mmdb')
  );
  copyIfMissing(
    path.join(runtime.resources, 'clash-configs', 'Country.mmdb'),
    path.join(runtime.clashRuntimeDir, 'Country.mmdb')
  );

  if (!fs.existsSync(runtime.subscriptionsFile)) {
    writeJson(runtime.subscriptionsFile, { subscriptions: [] });
  }
  settings = {
    ...settings,
    ...readJson(runtime.settingsFile, {})
  };
  if (readProfiles().length === 0 && userDataHasRealConfig(runtime.userData)) {
    const cliProfile = readCliSettings().profile || {};
    saveActiveConfigAsProfile(cliProfile.sourceType === 'account-subscription' ? 'account' : 'custom');
  }
  synchronizeProfileStateFromCli();
}

function saveSettings() {
  writeJson(runtime.settingsFile, settings);
  updateGlobals();
}

function updateGlobals() {
  global.PLATFORM = process.platform;
  global.ROCKET_VERSION = '2.0.7-linux';
  global.ERR = `http://${CONTROL_HOST}:${PUBLIC_CONTROL_PORT}`;
  global.initialization = 'ok';
  global.loadImg = runtime.loadingImage;
  global.state = settings;
  global.custom = {
    nav: [
      {
        desc: '配置目录',
        color: '#1890ff',
        link: `file://${runtime.clashConfigDir}`
      },
      {
        desc: '控制 API',
        color: '#13c2c2',
        link: `http://${CONTROL_HOST}:${PUBLIC_CONTROL_PORT}/configs`
      },
      {
        desc: '日志',
        color: '#52c41a',
        link: `http://${CONTROL_HOST}:${PUBLIC_CONTROL_PORT}/logs`
      }
    ],
    levelDesc: {
      l0: '本地模式',
      l1: '本地模式',
      l2: '本地模式',
      l3: '本地模式'
    },
    online: {
      enable: false
    }
  };
}

function parseScalarConfigValue(text, key, fallback) {
  const match = text.match(new RegExp(`^${key}:\\s*([^\\n#]+)`, 'm'));
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : fallback;
}

function writeScalarConfigValue(text, key, value) {
  const line = `${key}: ${value}`;
  const pattern = new RegExp(`^${key}:.*$`, 'm');
  return pattern.test(text) ? text.replace(pattern, line) : `${line}\n${text}`;
}

function ensureTrailingNewline(text) {
  return text.endsWith('\n') ? text : `${text}\n`;
}

function readActiveConfigText() {
  try {
    return fs.readFileSync(runtime.activeConfigFile, 'utf8');
  } catch (error) {
    return '';
  }
}

function readConfigSummary() {
  const text = readActiveConfigText();
  return {
    port: HTTP_PROXY_PORT,
    'socks-port': SOCKS_PROXY_PORT,
    mode: normalizeStoredMode(parseScalarConfigValue(text, 'mode', 'Rule'))
  };
}

function normalizeStoredMode(value) {
  const text = String(value || 'Rule').trim();
  const normalized = MODE_ALIASES[text.toLowerCase()];
  if (normalized) {
    return normalized;
  }
  return ['Rule', 'Global', 'Direct'].includes(text) ? text : 'Rule';
}

function normalizeProxyMode(value) {
  const normalized = MODE_ALIASES[String(value || '').trim().toLowerCase()];
  if (!normalized) {
    throw new Error('请选择智能代理、全局代理或直连模式。');
  }
  return normalized;
}

function coreIsRunning() {
  return Boolean(coreProcess && !coreProcess.killed);
}

function readTail(file, maxBytes = 12000) {
  try {
    if (!fs.existsSync(file)) {
      return '';
    }
    const stat = fs.statSync(file);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    fs.closeSync(fd);
    return buffer.toString('utf8');
  } catch (error) {
    return '';
  }
}

function redactUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.username) {
      parsed.username = '***';
    }
    if (parsed.password) {
      parsed.password = '***';
    }
    for (const key of [...parsed.searchParams.keys()]) {
      if (/token|key|pass|password|auth|secret/i.test(key)) {
        parsed.searchParams.set(key, '***');
      }
    }
    return parsed.toString();
  } catch (error) {
    const text = String(value || '');
    return text.length > 72 ? `${text.slice(0, 28)}...${text.slice(-18)}` : text;
  }
}

function extractProxyNames(configText) {
  const proxySection =
    configText.match(/(?:^|\n)(?:Proxy|proxies):\s*\n([\s\S]*?)(?:\n(?:Proxy Group|proxy-groups|Rule|rules):|\n[A-Za-z_-]+:\s*\n|$)/);
  const source = proxySection ? proxySection[1] : configText;
  const names = new Set();
  const pattern = /-\s*(?:\{\s*)?["']?name["']?\s*:\s*(?:"((?:\\.|[^"\\])*)"|'([^']*)'|([^,\n}]+))/g;
  let match;
  while ((match = pattern.exec(source))) {
    let name = (match[1] || match[2] || match[3] || '').trim();
    if (match[1]) {
      try {
        name = JSON.parse(`"${match[1]}"`);
      } catch (error) {
        name = match[1];
      }
    }
    if (name && !name.includes('type:')) {
      names.add(name);
    }
  }

  return [...names];
}

function fallbackProxiesResponse() {
  const names = extractProxyNames(readActiveConfigText());
  const first = settings.currentProxy || names[0] || '';
  return {
    proxies: {
      Proxy: {
        type: 'Selector',
        all: names,
        now: first
      },
      GLOBAL: {
        type: 'Selector',
        all: names,
        now: first
      },
      DIRECT: {
        type: 'Direct',
        all: [],
        now: ''
      },
      REJECT: {
        type: 'Reject',
        all: [],
        now: ''
      }
    }
  };
}

function patchConfigForRuntime(sourceText) {
  let text = sourceText;
  const replacements = {
    port: HTTP_PROXY_PORT,
    'socks-port': SOCKS_PROXY_PORT,
    'external-controller': `${CONTROL_HOST}:${CORE_CONTROL_PORT}`,
    secret: '""'
  };

  for (const [key, value] of Object.entries(replacements)) {
    const line = `${key}: ${value}`;
    const pattern = new RegExp(`^${key}:.*$`, 'm');
    text = pattern.test(text) ? text.replace(pattern, line) : `${line}\n${text}`;
  }

  text = ensureDirectRules(text);
  return text;
}

function ensureDirectRules(sourceText) {
  const lines = sourceText.split(/\r?\n/);
  const rulesIndex = lines.findIndex(line => /^rules:\s*$/.test(line));

  if (rulesIndex === -1) {
    const rules = [...ALWAYS_PROXY_RULES, ...getDirectRules(), 'MATCH,Proxy'].map(rule => `  - ${rule}`);
    return `${sourceText.replace(/\s*$/, '')}\nrules:\n${rules.join('\n')}\n`;
  }

  let endIndex = rulesIndex + 1;
  while (endIndex < lines.length && !/^[^\s#][^:]*:\s*/.test(lines[endIndex])) {
    endIndex += 1;
  }

  const existingRules = new Set(
    lines
      .slice(rulesIndex + 1, endIndex)
      .map(line => line.trim().replace(/^-\s*/, '').replace(/^["']|["']$/g, ''))
      .filter(Boolean)
  );
  const ruleIndent =
    lines
      .slice(rulesIndex + 1, endIndex)
      .map(line => line.match(/^(\s*)-\s/))
      .find(Boolean)?.[1] ?? '  ';
  const missingRules = [...ALWAYS_PROXY_RULES, ...getDirectRules()].filter(rule => !existingRules.has(rule));
  if (missingRules.length === 0) {
    return sourceText;
  }

  lines.splice(rulesIndex + 1, 0, ...missingRules.map(rule => `${ruleIndent}- ${rule}`));
  return lines.join('\n');
}

function prepareRuntimeConfig() {
  const source = readActiveConfigText();
  const patched = patchConfigForRuntime(source);
  ensureDir(runtime.clashRuntimeDir);
  fs.writeFileSync(runtime.runtimeConfigFile, patched);
  copyIfMissing(
    path.join(runtime.clashConfigDir, 'Country.mmdb'),
    path.join(runtime.clashRuntimeDir, 'Country.mmdb')
  );
  return runtime.clashRuntimeDir;
}

function executableExists(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch (error) {
    return false;
  }
}

function findInPath(command) {
  const result = spawnSync('which', [command], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

function findCoreBinary() {
  if (process.env.CLASH_CORE && executableExists(process.env.CLASH_CORE)) {
    return process.env.CLASH_CORE;
  }

  const archMap = {
    x64: 'amd64',
    arm64: 'arm64',
    arm: 'armv7'
  };
  const arch = archMap[process.arch] || process.arch;
  const bundled = [
    `mihomo-linux-${arch}`,
    `clash-meta-linux-${arch}`,
    `clash-linux-${arch}`,
    'mihomo',
    'clash'
  ].map(name => path.join(runtime.resources, 'clash-binaries', name));

  for (const candidate of bundled) {
    if (executableExists(candidate)) {
      return candidate;
    }
  }

  for (const command of ['mihomo', 'clash-meta', 'clash']) {
    const found = findInPath(command);
    if (found) {
      return found;
    }
  }

  return '';
}

function appendCoreLog(chunk) {
  const file = path.join(runtime.logsDir, 'core.log');
  fs.appendFile(file, chunk, () => {});
}

function requestCore(pathname, options = {}) {
  const method = options.method || 'GET';
  const body = options.body ? JSON.stringify(options.body) : null;

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: CONTROL_HOST,
        port: CORE_CONTROL_PORT,
        path: pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
        }
      },
      response => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          raw += chunk;
        });
        response.on('end', () => {
          if (response.statusCode >= 400) {
            reject(new Error(`Core API ${method} ${pathname} returned ${response.statusCode}`));
            return;
          }
          resolve(raw ? JSON.parse(raw) : null);
        });
      }
    );
    request.on('error', reject);
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

async function waitForCore(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await requestCore('/configs');
      return true;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
  return false;
}

async function startCore() {
  if (coreProcess && !coreProcess.killed) {
    return true;
  }

  corePath = findCoreBinary();
  if (!corePath) {
    appendCoreLog(`[${new Date().toISOString()}] No Linux Clash/mihomo core found.\n`);
    return false;
  }

  const coreConfigDir = prepareRuntimeConfig();
  coreProcess = spawn(corePath, ['-d', coreConfigDir], {
    cwd: coreConfigDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  coreProcess.stdout.on('data', appendCoreLog);
  coreProcess.stderr.on('data', appendCoreLog);
  coreProcess.on('exit', (code, signal) => {
    appendCoreLog(`[${new Date().toISOString()}] core exited code=${code} signal=${signal}\n`);
    coreProcess = null;
  });

  const ready = await waitForCore(CORE_START_TIMEOUT_MS);
  if (!ready) {
    return false;
  }
  await restoreCoreSelection();
  return true;
}

function stopCore() {
  if (coreProcess && !coreProcess.killed) {
    coreProcess.kill('SIGTERM');
  }
  coreProcess = null;
}

async function restoreCoreSelection() {
  const proxiesResponse = await requestCore('/proxies');
  const proxies = proxiesResponse.proxies || {};
  const mode = normalizeStoredMode((await requestCore('/configs')).mode);
  const selectorName = mode === 'Global' ? 'GLOBAL' : 'Proxy';
  const selector = proxies[selectorName] || {};
  const candidates = Array.isArray(selector.all) ? selector.all : [];
  let selected = settings.currentProxy;

  if (!selected || !candidates.includes(selected)) {
    selected = selector.now && candidates.includes(selector.now) ? selector.now : candidates.find(name => {
      const type = String((proxies[name] || {}).type || '').toLowerCase();
      return !['selector', 'direct', 'reject', 'pass', 'compatible'].includes(type);
    }) || '';
  }

  if (selected && candidates.includes(selected) && selector.now !== selected) {
    await requestCore(`/proxies/${encodeURIComponent(selectorName)}`, {
      method: 'PUT',
      body: { name: selected }
    });
  }
  settings.currentSelector = selectorName;
  settings.currentProxy = selected;
  saveSettings();
  updateCliSelection(findProfile(settings.currentProfileId));
}

async function stopCoreAndWait(timeoutMs = 4000) {
  const child = coreProcess;
  if (!child || child.killed) {
    coreProcess = null;
    return;
  }
  await new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish();
    }, timeoutMs);
    child.once('exit', finish);
    child.kill('SIGTERM');
  });
  if (coreProcess === child) {
    coreProcess = null;
  }
}

async function restartCore() {
  await stopCoreAndWait();
  return startCore();
}

function commandAvailable(command) {
  return Boolean(findInPath(command));
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', code => {
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`));
    });
  });
}

function runCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || __dirname,
      env: {
        ...process.env,
        ...(options.env || {})
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('exit', code => {
      const result = { code, stdout, stderr };
      if (code === 0) {
        resolve(result);
      } else {
        const message = (stderr || stdout || `${command} exited with ${code}`).trim();
        const error = new Error(message);
        error.result = result;
        reject(error);
      }
    });
  });
}

function parseJsonOutput(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch (parseError) {
        return null;
      }
    }
    return null;
  }
}

async function runCli(args, options = {}) {
  const nodePath = process.env.XIONGMAO_NODE || findInPath('node');
  if (!nodePath) {
    throw new Error('未找到 node，图形界面的账号登录/订阅导入需要可用的 Node.js。');
  }
  const result = await runCapture(nodePath, [path.join(__dirname, 'cli.js'), ...args, '--data-dir', runtime.userData], {
    cwd: __dirname,
    env: options.env || {}
  });
  return {
    ...result,
    json: parseJsonOutput(result.stdout)
  };
}

async function setGnomeProxy(enabled) {
  if (!commandAvailable('gsettings')) {
    throw new Error('未找到 gsettings，当前桌面环境不支持自动设置系统代理。');
  }

  if (!enabled) {
    await runCommand('gsettings', ['set', 'org.gnome.system.proxy', 'mode', 'none']);
    return;
  }

  const summary = readConfigSummary();
  await runCommand('gsettings', ['set', 'org.gnome.system.proxy', 'mode', 'manual']);
  await runCommand('gsettings', ['set', 'org.gnome.system.proxy.http', 'host', CONTROL_HOST]);
  await runCommand('gsettings', ['set', 'org.gnome.system.proxy.http', 'port', String(summary.port)]);
  await runCommand('gsettings', ['set', 'org.gnome.system.proxy.https', 'host', CONTROL_HOST]);
  await runCommand('gsettings', ['set', 'org.gnome.system.proxy.https', 'port', String(summary.port)]);
  await runCommand('gsettings', ['set', 'org.gnome.system.proxy.socks', 'host', CONTROL_HOST]);
  await runCommand('gsettings', ['set', 'org.gnome.system.proxy.socks', 'port', String(summary['socks-port'])]);
  await runCommand('gsettings', [
    'set',
    'org.gnome.system.proxy',
    'ignore-hosts',
    `[${getBypassHosts().map(host => `'${host.replace(/'/g, "'\\''")}'`).join(', ')}]`
  ]);
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function writeShellProxyState(enabled) {
  const variables = [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'NO_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'no_proxy'
  ];
  const lines = [
    '# Generated by SilverVPN. Changes are overwritten automatically.',
    `export SILVERVPN_PROXY_ENABLED=${enabled ? '1' : '0'}`
  ];

  if (enabled) {
    const httpProxy = `http://${CONTROL_HOST}:${HTTP_PROXY_PORT}`;
    const socksProxy = `socks5h://${CONTROL_HOST}:${SOCKS_PROXY_PORT}`;
    const noProxy = getBypassHosts().join(',');
    lines.push(
      `export HTTP_PROXY=${shellSingleQuote(httpProxy)}`,
      `export HTTPS_PROXY=${shellSingleQuote(httpProxy)}`,
      `export ALL_PROXY=${shellSingleQuote(socksProxy)}`,
      `export NO_PROXY=${shellSingleQuote(noProxy)}`,
      'export http_proxy="$HTTP_PROXY"',
      'export https_proxy="$HTTPS_PROXY"',
      'export all_proxy="$ALL_PROXY"',
      'export no_proxy="$NO_PROXY"'
    );
  } else {
    lines.push(`unset ${variables.join(' ')}`);
  }

  fs.writeFileSync(runtime.shellProxyFile, `${lines.join('\n')}\n`, { mode: 0o600 });
}

async function setSystemProxy(enabled) {
  if (process.platform !== 'linux') {
    settings.systemProxy = enabled;
    saveSettings();
    return;
  }

  if (enabled) {
    const coreStarted = await startCore();
    if (!coreStarted) {
      throw new Error('SilverVPN 核心启动失败，未开启系统和终端代理。请查看核心日志。');
    }
  }
  await setGnomeProxy(enabled);
  writeShellProxyState(enabled);
  settings.systemProxy = enabled;
  saveSettings();
}

async function setProxyMode(value) {
  const mode = normalizeProxyMode(value);
  const currentText = readActiveConfigText();
  fs.writeFileSync(runtime.activeConfigFile, ensureTrailingNewline(writeScalarConfigValue(currentText, 'mode', mode)));

  settings.mode = mode;
  settings.currentSelector = mode === 'Global' ? 'GLOBAL' : 'Proxy';
  saveSettings();

  let applied = false;
  let applyError = null;
  if (coreIsRunning()) {
    try {
      await requestCore('/configs', {
        method: 'PATCH',
        body: { mode }
      });
      applied = true;
      if (mode === 'Global' && settings.currentProxy) {
        const proxiesResponse = await readCoreProxies();
        const globalSelector = (proxiesResponse.proxies || {}).GLOBAL || {};
        if (Array.isArray(globalSelector.all) && globalSelector.all.includes(settings.currentProxy)) {
          await requestCore('/proxies/GLOBAL', {
            method: 'PUT',
            body: { name: settings.currentProxy }
          });
        }
      }
    } catch (error) {
      applyError = error.message || String(error);
    }
  }

  return {
    mode,
    label: MODE_LABELS[mode],
    saved: true,
    applied,
    applyError
  };
}

function autostartFilePath() {
  return path.join(os.homedir(), '.config', 'autostart', 'silvervpn.desktop');
}

function setAutostart(enabled) {
  const file = autostartFilePath();
  if (!enabled) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
    settings.startWithSystem = false;
    saveSettings();
    return;
  }

  ensureDir(path.dirname(file));
  fs.writeFileSync(
    file,
    [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${APP_NAME}`,
      `Exec=${process.execPath} --no-sandbox ${app.getAppPath()}`,
      'Terminal=false',
      'X-GNOME-Autostart-enabled=true'
    ].join('\n')
  );
  settings.startWithSystem = true;
  saveSettings();
}

function sanitizeName(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || `subscription_${Date.now()}`;
}

function downloadToFile(sourceUrl, targetFile, redirects = 0) {
  if (redirects > 5) {
    return Promise.reject(new Error('Too many redirects while downloading subscription.'));
  }

  const parsed = new URL(sourceUrl);
  const client = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.get(
      sourceUrl,
      {
        headers: {
          'User-Agent': `${APP_NAME}/0.1`
        }
      },
      response => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          const location = response.headers.location;
          response.resume();
          if (!location) {
            reject(new Error(`Redirect without location from ${sourceUrl}`));
            return;
          }
          downloadToFile(new URL(location, sourceUrl).toString(), targetFile, redirects + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          reject(new Error(`Subscription download returned ${response.statusCode}`));
          return;
        }

        ensureDir(path.dirname(targetFile));
        const output = fs.createWriteStream(targetFile);
        response.pipe(output);
        output.on('finish', () => output.close(resolve));
        output.on('error', reject);
      }
    );
    request.on('error', reject);
  });
}

function readSubscriptions() {
  return readJson(runtime.subscriptionsFile, { subscriptions: [] });
}

function writeSubscriptions(value) {
  writeJson(runtime.subscriptionsFile, value);
}

function profileId(seed) {
  return crypto.createHash('sha1').update(String(seed || Date.now())).digest('hex').slice(0, 12);
}

function normalizeProfileRecord(item) {
  if (!item || !item.fileName) {
    return null;
  }
  const id = item.id || profileId(item.fileName || item.url || item.name);
  return {
    id,
    fileName: item.fileName,
    name: item.name || item.label || path.basename(item.fileName, path.extname(item.fileName)),
    kind: item.kind || item.sourceType || (item.url ? 'subscription-url' : 'file'),
    sourceType: item.sourceType || item.kind || '',
    url: item.url || item.subscriptionUrl || '',
    urlDisplay: item.urlDisplay || item.subscriptionUrlDisplay || (item.url ? redactUrl(item.url) : ''),
    username: item.username || '',
    proxyCount: Number.isInteger(item.proxyCount) ? item.proxyCount : null,
    importedAt: item.importedAt || ''
  };
}

function readProfiles() {
  const data = readSubscriptions();
  const profiles = (data.subscriptions || []).map(normalizeProfileRecord).filter(Boolean);
  return profiles;
}

function writeProfiles(profiles) {
  writeSubscriptions({ subscriptions: profiles.map(normalizeProfileRecord).filter(Boolean) });
}

function findProfile(identifier) {
  const value = String(identifier || '');
  return readProfiles().find(item => item.id === value || item.fileName === value) || null;
}

function buildProfileName(kind, profile, options = {}) {
  if (options.name) {
    return options.name;
  }
  if (kind === 'account') {
    return `SilverVPN Account${options.username ? ` (${options.username})` : ''}`;
  }
  return profile.name || (profile.sourcePath ? path.basename(profile.sourcePath) : '') || 'Custom Subscription';
}

function saveActiveConfigAsProfile(kind, options = {}) {
  const cliSettings = readCliSettings();
  const profile = cliSettings.profile || {};
  const seed =
    options.idSeed ||
    profile.subscriptionUrl ||
    profile.sourcePath ||
    options.source ||
    `${kind}-${profile.name || ''}-${options.username || ''}`;
  const id = `${kind}-${profileId(seed)}`;
  const target = path.join(runtime.subscriptionsDir, `${id}.yaml`);
  ensureDir(runtime.subscriptionsDir);
  fs.copyFileSync(runtime.activeConfigFile, target);

  const record = normalizeProfileRecord({
    id,
    fileName: target,
    name: buildProfileName(kind, profile, options),
    kind,
    sourceType: profile.sourceType || kind,
    url: profile.subscriptionUrl || options.source || '',
    urlDisplay: profile.subscriptionUrlDisplay || (profile.subscriptionUrl ? redactUrl(profile.subscriptionUrl) : ''),
    username: profile.username || options.username || '',
    proxyCount: Number.isInteger(profile.proxyCount) ? profile.proxyCount : extractProxyNames(readActiveConfigText()).length,
    importedAt: profile.importedAt || new Date().toISOString()
  });

  const profiles = readProfiles().filter(item => item.id !== id && item.fileName !== target);
  profiles.push(record);
  writeProfiles(profiles);
  settings.currentProfile = target;
  settings.currentProfileId = id;
  saveSettings();
  updateCliSelection(record);
  return record;
}

function updateCliSelection(record) {
  const file = path.join(runtime.userData, 'settings.json');
  const cliSettings = readJson(file, {});
  if (record) {
    cliSettings.currentProfileId = record.id;
    cliSettings.currentProfile = runtime.activeConfigFile;
  }
  cliSettings.currentSelector = settings.currentSelector || 'Proxy';
  cliSettings.currentProxy = settings.currentProxy || '';
  writeJson(file, cliSettings);
}

function synchronizeProfileStateFromCli() {
  const cliSettings = readCliSettings();
  const profiles = readProfiles();
  if (!profiles.length) {
    return;
  }

  let selected = findProfile(cliSettings.currentProfileId);
  if (!selected && cliSettings.profile && cliSettings.profile.sourceType === 'account-subscription') {
    const username = (cliSettings.auth && cliSettings.auth.username) || cliSettings.profile.username || '';
    selected = profiles
      .filter(profile => profile.kind === 'account' && (!username || profile.username === username))
      .sort((left, right) => String(right.importedAt || '').localeCompare(String(left.importedAt || '')))[0];
  }
  if (!selected || !fs.existsSync(selected.fileName)) {
    return;
  }

  settings.currentProfileId = selected.id;
  settings.currentProfile = selected.fileName;
  if (cliSettings.currentProxy) {
    settings.currentProxy = cliSettings.currentProxy;
  }
  if (cliSettings.currentSelector) {
    settings.currentSelector = cliSettings.currentSelector;
  }
  saveSettings();
}

async function addSubscription(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('请输入有效的 HTTP/HTTPS 订阅地址。');
  }

  const parsed = new URL(url);
  const fileName = `${sanitizeName(parsed.host + parsed.pathname)}.yaml`;
  const target = path.join(runtime.subscriptionsDir, fileName);
  await downloadToFile(url, target);

  const data = readSubscriptions();
  data.subscriptions = (data.subscriptions || []).filter(item => item.fileName !== target);
  data.subscriptions.push({ fileName: target, url });
  writeSubscriptions(data);
  return target;
}

async function switchProfile(fileName) {
  if (!fileName) {
    return;
  }
  if (!fs.existsSync(fileName)) {
    throw new Error(`配置文件不存在：${fileName}`);
  }
  if (path.resolve(fileName) !== path.resolve(runtime.activeConfigFile)) {
    fs.copyFileSync(fileName, runtime.activeConfigFile);
  }
  settings.currentProfile = fileName;
  const record = readProfiles().find(item => path.resolve(item.fileName) === path.resolve(fileName));
  settings.currentProfileId = record ? record.id : '';
  saveSettings();
  updateCliSelection(record);
  await restartCore();
}

async function switchProfileFromGui(payload = {}) {
  const record = findProfile(payload.id || payload.fileName || payload.profile);
  if (!record) {
    throw new Error('请选择有效的配置方案。');
  }
  await switchProfile(record.fileName);
  return buildDashboard();
}

async function importConfigFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入 Clash 配置文件',
    properties: ['openFile'],
    filters: [
      { name: 'Clash config', extensions: ['yaml', 'yml'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) {
    return;
  }
  await switchProfile(result.filePaths[0]);
}

function rc4(input, key) {
  const s = new Array(256);
  const k = new Array(256);
  for (let i = 0; i < 256; i += 1) {
    s[i] = i;
    k[i] = key.charCodeAt(i % key.length);
  }
  let j = 0;
  for (let i = 0; i < 256; i += 1) {
    j = (j + s[i] + k[i]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
  }
  let i = 0;
  j = 0;
  let output = '';
  for (let x = 0; x < input.length; x += 1) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
    const y = s[(s[i] + s[j]) % 256];
    output += String.fromCharCode(input.charCodeAt(x) ^ y);
  }
  return output;
}

function encryptedLocalApi(payload) {
  const encrypted = rc4(JSON.stringify(payload), LOCAL_API_KEY);
  return Buffer.from(encrypted, 'binary').toString('base64');
}

function localUserInfo() {
  return {
    username: 'local',
    true_name: '本地模式',
    balance: 0,
    traffic: {
      used: 0,
      total: 1024 * 1024 * 1024 * 1024
    },
    level: 1,
    class: 1,
    level_expire: '2099-12-31',
    class_expire: '2099-12-31',
    defaultProxy: settings.currentSelector || 'Proxy',
    pc_sub: ''
  };
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  response.end(body);
}

function sendText(response, status, value, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(status, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  response.end(value);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        resolve({ raw: body });
      }
    });
    request.on('error', reject);
  });
}

function sendEncrypted(response, payload) {
  sendText(response, 200, encryptedLocalApi(payload), 'text/plain; charset=utf-8');
}

async function handleLocalApi(request, response, pathname) {
  const user = localUserInfo();
  if (pathname === '/v1/login' && request.method === 'POST') {
    await readRequestBody(request);
    sendEncrypted(response, { code: 200, data: user });
    return true;
  }
  if (pathname === '/v1/userinfo') {
    sendEncrypted(response, { code: 200, data: user });
    return true;
  }
  if (pathname === '/v1/logout') {
    sendEncrypted(response, { code: 200, data: {} });
    return true;
  }
  if (pathname === '/v1/anno') {
    sendEncrypted(response, { code: 200, data: [] });
    return true;
  }
  if (pathname === '/v1/pc-alert') {
    sendEncrypted(response, { code: 200, data: { show: false } });
    return true;
  }
  if (pathname === '/v1/pc-update') {
    sendEncrypted(response, { code: 200, data: { update: false } });
    return true;
  }
  if (pathname === '/v1/online') {
    sendEncrypted(response, { code: 200, data: {} });
    return true;
  }
  return false;
}

function proxyToCore(request, response) {
  const options = {
    hostname: CONTROL_HOST,
    port: CORE_CONTROL_PORT,
    path: request.url,
    method: request.method,
    headers: {
      ...request.headers,
      host: `${CONTROL_HOST}:${CORE_CONTROL_PORT}`
    }
  };

  const upstream = http.request(options, upstreamResponse => {
    response.writeHead(upstreamResponse.statusCode || 502, {
      ...upstreamResponse.headers,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    upstreamResponse.pipe(response);
  });

  upstream.on('error', () => {
    if (request.method === 'GET' && request.url.startsWith('/configs')) {
      sendJson(response, 200, readConfigSummary());
      return;
    }
    if (request.method === 'GET' && request.url.startsWith('/proxies')) {
      sendJson(response, 200, fallbackProxiesResponse());
      return;
    }
    if (request.method === 'GET' && request.url.startsWith('/traffic')) {
      sendText(response, 200, JSON.stringify({ up: 0, down: 0 }));
      return;
    }
    if (request.method === 'GET' && request.url.startsWith('/logs')) {
      const logFile = path.join(runtime.logsDir, 'core.log');
      sendText(response, 200, fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '');
      return;
    }
    sendJson(response, 503, { message: 'Clash core is not running.' });
  });

  request.pipe(upstream);
}

async function handleCompatRequest(request, response) {
  const parsed = new URL(request.url, `http://${CONTROL_HOST}:${PUBLIC_CONTROL_PORT}`);

  if (request.method === 'OPTIONS') {
    sendText(response, 204, '');
    return;
  }

  if (await handleLocalApi(request, response, parsed.pathname)) {
    return;
  }

  if (request.method === 'POST' && parsed.pathname === '/configs') {
    await readRequestBody(request);
    await restartCore();
    sendText(response, 204, '');
    return;
  }

  proxyToCore(request, response);
}

function startCompatServer() {
  if (compatServer) {
    return;
  }
  compatServer = http.createServer((request, response) => {
    handleCompatRequest(request, response).catch(error => {
      sendJson(response, 500, { message: error.message || String(error) });
    });
  });
  compatServer.listen(PUBLIC_CONTROL_PORT, CONTROL_HOST);
  compatServer.on('error', error => {
    appendCoreLog(`[${new Date().toISOString()}] control server error: ${error.message}\n`);
  });
}

function stopCompatServer() {
  if (compatServer) {
    compatServer.close();
    compatServer = null;
  }
}

async function checkDelay(names) {
  const values = Array.isArray(names) ? names : [];
  return Promise.all(
    values.map(async name => {
      try {
        return await requestCore(
          `/proxies/${encodeURIComponent(name)}/delay?timeout=10000&url=${encodeURIComponent(DEFAULT_DELAY_TEST_URL)}`
        );
      } catch (error) {
        return { delay: -1 };
      }
    })
  );
}

async function readCoreConfigs() {
  try {
    return await requestCore('/configs');
  } catch (error) {
    return readConfigSummary();
  }
}

async function readCoreProxies() {
  try {
    return await requestCore('/proxies');
  } catch (error) {
    return fallbackProxiesResponse();
  }
}

function pickSelectorName(proxiesResponse, mode) {
  const proxies = (proxiesResponse && proxiesResponse.proxies) || {};
  if (mode === 'Global' && proxies.GLOBAL && Array.isArray(proxies.GLOBAL.all)) {
    return 'GLOBAL';
  }
  if (mode !== 'Global' && proxies.Proxy && Array.isArray(proxies.Proxy.all)) {
    return 'Proxy';
  }
  const saved = settings.currentSelector || 'Proxy';
  if (proxies[saved] && Array.isArray(proxies[saved].all)) {
    return saved;
  }
  if (proxies.Proxy && Array.isArray(proxies.Proxy.all)) {
    return 'Proxy';
  }
  const found = Object.entries(proxies).find(([, value]) => Array.isArray(value.all) && value.all.length);
  return found ? found[0] : 'Proxy';
}

function buildProxyRows(proxiesResponse, selectorName) {
  const proxies = (proxiesResponse && proxiesResponse.proxies) || {};
  const selector = proxies[selectorName] || {};
  const current = selector.now || settings.currentProxy || '';
  const names = Array.isArray(selector.all) ? selector.all : [];
  return names
    .filter(name => {
      if (selectorName !== 'GLOBAL') {
        return true;
      }
      const type = String((proxies[name] || {}).type || '').toLowerCase();
      return !['selector', 'direct', 'reject', 'pass', 'compatible'].includes(type);
    })
    .map(name => {
    const detail = proxies[name] || {};
    return {
      name,
      type: detail.type || '',
      udp: Boolean(detail.udp),
      selected: name === current,
      history: Array.isArray(detail.history) ? detail.history.slice(-5) : []
    };
    });
}

function readCliSettings() {
  return readJson(path.join(runtime.userData, 'settings.json'), {});
}

function buildAccountSummary() {
  const cliSettings = readCliSettings();
  const auth = cliSettings.auth || {};
  const profile = cliSettings.profile || {};
  return {
    auth: auth.username || auth.apiBase || auth.loggedInAt
      ? {
          username: auth.username || '',
          apiBase: auth.apiBase ? redactUrl(auth.apiBase) : '',
          loggedInAt: auth.loggedInAt || '',
          userInfoUpdatedAt: auth.userInfoUpdatedAt || '',
          hasCookie: Boolean(auth.cookie),
          user: auth.user || null
        }
      : null,
    profile: profile.sourceType || profile.name || profile.subscriptionUrl
      ? {
          sourceType: profile.sourceType || '',
          name: profile.name || '',
          sourcePath: profile.sourcePath || '',
          subscriptionUrl: profile.subscriptionUrlDisplay || (profile.subscriptionUrl ? redactUrl(profile.subscriptionUrl) : ''),
          proxyCount: Number.isInteger(profile.proxyCount) ? profile.proxyCount : null,
          convertedSubscription: Boolean(profile.convertedSubscription),
          skippedProxyCount: Number.isInteger(profile.skippedProxyCount) ? profile.skippedProxyCount : null,
          importedAt: profile.importedAt || ''
        }
      : null
  };
}

async function buildDashboard() {
  const configs = await readCoreConfigs();
  const normalizedMode = normalizeStoredMode(configs.mode);
  const proxiesResponse = await readCoreProxies();
  const selectorName = pickSelectorName(proxiesResponse, normalizedMode);
  const selector = ((proxiesResponse && proxiesResponse.proxies) || {})[selectorName] || {};
  const rows = buildProxyRows(proxiesResponse, selectorName);
  const account = buildAccountSummary();
  const profiles = readProfiles();

  return {
    appName: APP_NAME,
    core: {
      running: coreIsRunning(),
      binary: corePath || findCoreBinary() || '',
      control: `http://${CONTROL_HOST}:${PUBLIC_CONTROL_PORT}`,
      coreControl: `http://${CONTROL_HOST}:${CORE_CONTROL_PORT}`,
      logTail: readTail(path.join(runtime.logsDir, 'core.log'))
    },
    config: {
      dataDir: runtime.userData,
      activeConfigFile: runtime.activeConfigFile,
      httpPort: Number(configs.port || HTTP_PROXY_PORT),
      socksPort: Number(configs['socks-port'] || SOCKS_PROXY_PORT),
      mode: normalizedMode,
      modeLabel: MODE_LABELS[normalizedMode] || normalizedMode
    },
    settings: {
      systemProxy: Boolean(settings.systemProxy),
      startWithSystem: Boolean(settings.startWithSystem),
      holdProxy: Boolean(settings.holdProxy),
      language: settings.language || 'zh-CN',
      defaultBypassHosts: DEFAULT_BYPASS_HOSTS,
      bypassHosts: normalizeBypassHosts(settings.bypassHosts || []),
      currentProfile: settings.currentProfile || '',
      currentProfileId: settings.currentProfileId || '',
      currentSelector: selectorName,
      currentProxy: selector.now || settings.currentProxy || ''
    },
    account,
    subscriptions: profiles,
    activeProfile: profiles.find(item => item.id === settings.currentProfileId || item.fileName === settings.currentProfile) || null,
    proxies: {
      selector: selectorName,
      current: selector.now || settings.currentProxy || '',
      rows,
      count: rows.length
    }
  };
}

async function switchProxyFromGui(payload = {}) {
  const mode = normalizeStoredMode((await readCoreConfigs()).mode);
  const selector = mode === 'Global' ? 'GLOBAL' : payload.selector || 'Proxy';
  const proxy = payload.proxy || payload.name || '';
  if (!proxy) {
    throw new Error('请选择要切换的节点。');
  }
  if (!coreIsRunning()) {
    await startCore();
  }
  await requestCore(`/proxies/${encodeURIComponent(selector)}`, {
    method: 'PUT',
    body: { name: proxy }
  });
  settings.currentSelector = selector;
  settings.currentProxy = proxy;
  saveSettings();
  updateCliSelection(findProfile(settings.currentProfileId));
  return buildDashboard();
}

async function checkDelaysFromGui(payload = {}) {
  const names = Array.isArray(payload.names) ? payload.names : [];
  const delays = await checkDelay(names);
  return names.map((name, index) => ({
    name,
    delay: Number.isFinite(delays[index] && delays[index].delay) ? delays[index].delay : -1
  }));
}

async function setBypassHostsFromGui(payload = {}) {
  settings.bypassHosts = normalizeBypassHosts(payload.hosts || payload.text || '');
  saveSettings();
  if (settings.systemProxy) {
    await setGnomeProxy(true);
  }
  await restartCore();
  return buildDashboard();
}

function setLanguageFromGui(payload = {}) {
  const language = String(payload.language || '').toLowerCase() === 'en' ? 'en' : 'zh-CN';
  settings.language = language;
  saveSettings();
  return buildDashboard();
}

async function importSourceFromGui(source) {
  const value = String(source || '').trim();
  if (!value) {
    throw new Error('请输入订阅地址，或选择要导入的配置文件。');
  }
  const result = await runCli(['import', value]);
  saveActiveConfigAsProfile('custom', { source: value });
  await restartCore();
  return {
    ok: true,
    message: result.stdout.trim(),
    dashboard: await buildDashboard()
  };
}

async function importFileFromGui() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入 Clash 配置或订阅文件',
    properties: ['openFile'],
    filters: [
      { name: 'Clash/subscription', extensions: ['yaml', 'yml', 'url', 'txt'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) {
    return { canceled: true };
  }
  return importSourceFromGui(result.filePaths[0]);
}

async function loginFromGui(payload = {}) {
  const username = String(payload.username || '').trim();
  const password = String(payload.password || '');
  const base = String(payload.base || '').trim();
  if (!username || !password) {
    throw new Error('请输入账号和密码。');
  }
  const args = ['login', '--username', username];
  if (base) {
    args.push('--base', base);
  }
  const result = await runCli(args, {
    env: {
      XIONGMAO_PASSWORD: password
    }
  });
  if (!result.json || !result.json.imported || Number(result.json.imported.proxyCount || 0) < 1) {
    throw new Error('账号登录成功，但服务端没有返回可用的节点订阅。');
  }
  saveActiveConfigAsProfile('account', { username });
  if (!(await restartCore())) {
    throw new Error('节点已更新，但代理核心启动失败，请查看核心日志。');
  }
  return {
    ok: true,
    result: result.json,
    dashboard: await buildDashboard()
  };
}

async function refreshUserFromGui(payload = {}) {
  const base = String(payload.base || '').trim();
  const args = ['refresh-user'];
  if (base) {
    args.push('--base', base);
  }
  const result = await runCli(args);
  if (!result.json || !result.json.imported || Number(result.json.imported.proxyCount || 0) < 1) {
    throw new Error('账号已刷新，但服务端没有返回可用的节点订阅。');
  }
  const auth = (readCliSettings().auth || {});
  saveActiveConfigAsProfile('account', { username: auth.username || '' });
  if (!(await restartCore())) {
    throw new Error('节点已更新，但代理核心启动失败，请查看核心日志。');
  }
  return {
    ok: true,
    result: result.json,
    dashboard: await buildDashboard()
  };
}

async function testUrlFromGui(payload = {}) {
  const target = String(payload.url || '').trim();
  if (!/^https?:\/\//i.test(target)) {
    throw new Error('请输入 http:// 或 https:// 开头的测试地址。');
  }
  if (!commandAvailable('curl')) {
    throw new Error('未找到 curl，无法执行代理连通性测试。');
  }
  if (!coreIsRunning()) {
    await startCore();
  }
  const summary = readConfigSummary();
  const result = await runCapture('curl', [
    '-L',
    '-sS',
    '-o',
    '/dev/null',
    '--connect-timeout',
    '8',
    '--max-time',
    '20',
    '-x',
    `http://${CONTROL_HOST}:${summary.port}`,
    '-w',
    'http_code=%{http_code}\nremote_ip=%{remote_ip}\ntime_total=%{time_total}\n',
    target
  ]);
  const fields = {};
  result.stdout
    .trim()
    .split(/\n+/)
    .forEach(line => {
      const [key, ...rest] = line.split('=');
      if (key) {
        fields[key] = rest.join('=');
      }
    });
  const status = Number(fields.http_code || 0);
  return {
    ok: status >= 200 && status < 400,
    url: target,
    httpCode: status,
    remoteIp: fields.remote_ip || '',
    timeTotal: fields.time_total || '',
    proxy: `http://${CONTROL_HOST}:${summary.port}`,
    stderr: result.stderr.trim()
  };
}

async function detectIpFromGui() {
  if (!commandAvailable('curl')) {
    throw new Error('未找到 curl，无法查询出口 IP。');
  }
  if (!coreIsRunning()) {
    await startCore();
  }
  const summary = readConfigSummary();
  const proxy = `http://${CONTROL_HOST}:${summary.port}`;
  const baseArgs = ['-L', '-sS', '--connect-timeout', '8', '--max-time', '20', '-x', proxy];
  let source = 'ipinfo.io';
  let info = {};

  try {
    const result = await runCapture('curl', [...baseArgs, 'https://ipinfo.io/json']);
    info = parseJsonOutput(result.stdout) || {};
  } catch (error) {
    info = {};
  }

  if (!info.ip) {
    source = 'api.ipify.org';
    const result = await runCapture('curl', [...baseArgs, 'https://api.ipify.org?format=json']);
    info = parseJsonOutput(result.stdout) || {};
  }

  return {
    ok: Boolean(info.ip),
    ip: info.ip || '',
    city: info.city || '',
    region: info.region || '',
    country: info.country || '',
    org: info.org || '',
    source,
    proxy
  };
}

function captureSync(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env
  });
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}

function stripGsettingsValue(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '');
}

function getGnomeProxyStatus() {
  if (!commandAvailable('gsettings')) {
    return { available: false, mode: 'unknown' };
  }
  const mode = stripGsettingsValue(captureSync('gsettings', ['get', 'org.gnome.system.proxy', 'mode']));
  const httpHost = stripGsettingsValue(captureSync('gsettings', ['get', 'org.gnome.system.proxy.http', 'host']));
  const httpPort = Number(captureSync('gsettings', ['get', 'org.gnome.system.proxy.http', 'port']) || 0);
  const httpsHost = stripGsettingsValue(captureSync('gsettings', ['get', 'org.gnome.system.proxy.https', 'host']));
  const httpsPort = Number(captureSync('gsettings', ['get', 'org.gnome.system.proxy.https', 'port']) || 0);
  return {
    available: true,
    mode: mode || 'none',
    http: httpHost && httpPort ? `${httpHost}:${httpPort}` : '',
    https: httpsHost && httpsPort ? `${httpsHost}:${httpsPort}` : '',
    ownedBySilverVPN:
      mode === 'manual' &&
      httpHost === CONTROL_HOST &&
      httpPort === HTTP_PROXY_PORT &&
      httpsHost === CONTROL_HOST &&
      httpsPort === HTTP_PROXY_PORT
  };
}

async function queryPublicIp(proxyUrl = '') {
  if (!commandAvailable('curl')) {
    return { ok: false, error: 'curl unavailable' };
  }
  const args = ['-L', '-sS', '--connect-timeout', '5', '--max-time', '10'];
  if (proxyUrl) {
    args.push('-x', proxyUrl);
  } else {
    args.push('--noproxy', '*');
  }
  args.push('https://ipinfo.io/json');
  try {
    const result = await runCapture('curl', args, {
      env: {
        HTTP_PROXY: '',
        HTTPS_PROXY: '',
        ALL_PROXY: '',
        http_proxy: '',
        https_proxy: '',
        all_proxy: ''
      }
    });
    const info = parseJsonOutput(result.stdout) || {};
    return {
      ok: Boolean(info.ip),
      ip: info.ip || '',
      country: info.country || '',
      region: info.region || '',
      city: info.city || '',
      org: info.org || ''
    };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

function getInterfaceSummary() {
  const interfaces = os.networkInterfaces();
  return Object.entries(interfaces)
    .map(([name, addresses]) => {
      const usable = (addresses || []).filter(address => !address.internal);
      return {
        name,
        addresses: usable.map(address => address.address),
        tunnel: /^(tun|tap|wg|ppp|tailscale|utun|vpn|ipsec|lightway|inode)/i.test(name)
      };
    })
    .filter(item => item.addresses.length > 0);
}

function getVpnProcesses() {
  const output = captureSync('ps', ['-eo', 'pid=,comm=,args=']);
  if (!output) {
    return [];
  }
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /(expressvpn|inode|openvpn|wireguard|wg-quick|tailscale|strongswan|ipsec|mihomo|clash)/i.test(line))
    .slice(0, 20);
}

function getListeningProxyPorts() {
  const output = captureSync('ss', ['-ltnp']);
  const ports = [HTTP_PROXY_PORT, SOCKS_PROXY_PORT, PUBLIC_CONTROL_PORT, CORE_CONTROL_PORT];
  return ports.map(port => ({
    port,
    listening: new RegExp(`[:.]${port}\\b`).test(output),
    detail: output
      .split(/\r?\n/)
      .find(line => new RegExp(`[:.]${port}\\b`).test(line)) || ''
  }));
}

async function getNetworkStatusFromGui() {
  const interfaces = getInterfaceSummary();
  const directPromise = queryPublicIp();
  const silverPromise = coreIsRunning()
    ? queryPublicIp(`http://${CONTROL_HOST}:${HTTP_PROXY_PORT}`)
    : Promise.resolve({ ok: false, inactive: true, error: 'SilverVPN core is stopped' });
  const [directEgress, silverEgress] = await Promise.all([directPromise, silverPromise]);
  const gnomeProxy = getGnomeProxyStatus();
  const environmentProxy = {
    HTTP_PROXY: process.env.HTTP_PROXY || process.env.http_proxy || '',
    HTTPS_PROXY: process.env.HTTPS_PROXY || process.env.https_proxy || '',
    ALL_PROXY: process.env.ALL_PROXY || process.env.all_proxy || '',
    NO_PROXY: process.env.NO_PROXY || process.env.no_proxy || ''
  };
  const tunnelInterfaces = interfaces.filter(item => item.tunnel);
  const vpnProcesses = getVpnProcesses();

  return {
    checkedAt: new Date().toISOString(),
    silverVPN: {
      coreRunning: coreIsRunning(),
      mode: normalizeStoredMode((await readCoreConfigs()).mode),
      selector: settings.currentSelector || 'Proxy',
      node: settings.currentProxy || '',
      httpProxy: `${CONTROL_HOST}:${HTTP_PROXY_PORT}`,
      socksProxy: `${CONTROL_HOST}:${SOCKS_PROXY_PORT}`
    },
    gnomeProxy,
    environmentProxy,
    directEgress,
    silverEgress,
    routes: {
      ipv4: captureSync('ip', ['route', 'show', 'default']),
      ipv6: captureSync('ip', ['-6', 'route', 'show', 'default'])
    },
    interfaces,
    tunnelInterfaces,
    vpnProcesses,
    listeningPorts: getListeningProxyPorts(),
    conflicts: [
      ...(tunnelInterfaces.length ? [`检测到隧道网卡：${tunnelInterfaces.map(item => item.name).join(', ')}`] : []),
      ...(vpnProcesses.some(line => !/(mihomo|clash)/i.test(line)) ? ['检测到其他 VPN 进程，默认路由可能由其他软件控制。'] : []),
      ...(gnomeProxy.mode === 'manual' && !gnomeProxy.ownedBySilverVPN ? ['系统代理已启用，但不是 SilverVPN 的本地端口。'] : [])
    ]
  };
}

function testTcpFromGui(payload = {}) {
  const host = String(payload.host || '').trim();
  const port = Number(payload.port || 22);
  const timeoutMs = Number(payload.timeoutMs || 5000);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return Promise.reject(new Error('请输入有效的主机和端口。'));
  }

  return new Promise(resolve => {
    const started = Date.now();
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok, error = '') => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve({
        ok,
        host,
        port,
        elapsedMs: Date.now() - started,
        error
      });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false, 'timeout'));
    socket.once('error', error => finish(false, error.message || String(error)));
    socket.connect(port, host);
  });
}

async function handleGuiAction(action, payload = {}) {
  switch (action) {
    case 'dashboard':
      return buildDashboard();
    case 'start-core':
      await startCore();
      return buildDashboard();
    case 'stop-core':
      stopCore();
      return buildDashboard();
    case 'restart-core':
      await restartCore();
      return buildDashboard();
    case 'set-system-proxy':
      await setSystemProxy(Boolean(payload.enabled));
      return buildDashboard();
    case 'set-mode':
      await setProxyMode(payload.mode);
      return buildDashboard();
    case 'switch-proxy':
      return switchProxyFromGui(payload);
    case 'check-delays':
      return checkDelaysFromGui(payload);
    case 'set-bypass-hosts':
      return setBypassHostsFromGui(payload);
    case 'set-language':
      return setLanguageFromGui(payload);
    case 'switch-profile':
      return switchProfileFromGui(payload);
    case 'import-source':
      return importSourceFromGui(payload.source);
    case 'import-file':
      return importFileFromGui();
    case 'login':
      return loginFromGui(payload);
    case 'refresh-user':
      return refreshUserFromGui(payload);
    case 'test-url':
      return testUrlFromGui(payload);
    case 'detect-ip':
      return detectIpFromGui();
    case 'network-status':
      return getNetworkStatusFromGui();
    case 'test-tcp':
      return testTcpFromGui(payload);
    case 'open-config-dir':
      await shell.openPath(runtime.clashConfigDir);
      return { ok: true };
    case 'open-logs-dir':
      await shell.openPath(runtime.logsDir);
      return { ok: true };
    case 'open-control-api':
      await shell.openExternal(`http://${CONTROL_HOST}:${PUBLIC_CONTROL_PORT}/configs`);
      return { ok: true };
    default:
      throw new Error(`Unsupported GUI action: ${action}`);
  }
}

async function routeIpcMessage(message) {
  const name = message.__name;
  const arg = Object.prototype.hasOwnProperty.call(message, 'arg') ? message.arg : message;

  switch (name) {
    case 'BRG_MSG_INIT':
      return { state: corePath ? 4 : 3 };
    case 'BRG_MSG_GETGLOBAL':
      updateGlobals();
      return { initialization: global.initialization, state: settings };
    case 'BRG_MSG_GET_CLASHY_CONFIG':
      return { ...settings };
    case 'BRG_MSG_START_CLASH':
      return startCore();
    case 'BRG_MSG_KILL_CLASH':
      stopCore();
      return null;
    case 'BRG_MSG_SET_SYSTEM_PROXY':
      await setSystemProxy(Boolean(arg));
      return null;
    case 'BRG_MSG_FETCH_PROFILES':
      return {
        profiles: readSubscriptions().subscriptions || [],
        currentProfile: settings.currentProfile
      };
    case 'BRG_MSG_ADD_SUBSCRIBE':
      await addSubscription(arg);
      return null;
    case 'BRG_MSG_DELETE_SUBSCRIBE': {
      const fileName = arg || '';
      const data = readSubscriptions();
      data.subscriptions = (data.subscriptions || []).filter(item => item.fileName !== fileName);
      writeSubscriptions(data);
      if (fileName && fs.existsSync(fileName)) {
        fs.unlinkSync(fileName);
      }
      return null;
    }
    case 'BRG_MSG_UPDATE_SUBSCRIBE':
      if (arg && arg.url) {
        const fileName = await addSubscription(arg.url);
        await switchProfile(fileName);
      } else if (settings.currentProfile && fs.existsSync(settings.currentProfile)) {
        await switchProfile(settings.currentProfile);
      }
      return { needUpdate: false };
    case 'BRG_MSG_SWITCHED_PROFILE':
      await switchProfile(arg);
      return null;
    case 'BRG_MSG_SWITCHED_PROXY':
      settings.currentSelector = message.selector || settings.currentSelector;
      settings.currentProxy = message.proxy || settings.currentProxy;
      saveSettings();
      return null;
    case 'BRG_MSG_SWITCHED_SELECTOR':
      settings.currentSelector = message.selector || message.currentSelector || settings.currentSelector;
      saveSettings();
      return null;
    case 'BRG_MSG_CHECK_DELAY':
      return checkDelay(message.arg || []);
    case 'BRG_MSG_EXEC_TCPPING':
      return {};
    case 'BRG_MSG_UPDATE_ROCKET':
      return null;
    case 'BRG_MSG_SET_LOGIN_ITEM':
      setAutostart(Boolean(arg));
      return null;
    case 'BRG_MSG_SET_HOLD_ITEM':
      settings.holdProxy = Boolean(arg);
      saveSettings();
      return null;
    case 'BRG_MSG_OPEN_URL':
    case 'BRG_MSG_OPEN_LINK':
      if (arg) {
        await shell.openExternal(String(arg));
      }
      return null;
    case 'BRG_MSG_OPEN_CONFIG_FODLER':
    case 'BRG_MSG_OPEN_CONFIG_FOLDER':
      await shell.openPath(runtime.clashConfigDir);
      return null;
    case 'BRG_MSG_UPDATE_STATE':
      if (message.name) {
        settings[message.name] = message.value;
        saveSettings();
      }
      return null;
    case 'BRG_MSG_HANDLE_EVENT_WINDOW':
      if (arg === 'miniWindow' && mainWindow) {
        mainWindow.minimize();
      }
      if (arg === 'closeWindow' && mainWindow) {
        mainWindow.hide();
      }
      return null;
    case 'BRG_MSG_REBOOT_APP':
      app.relaunch();
      app.exit(0);
      return null;
    default:
      throw new Error(`Unsupported IPC message: ${name}`);
  }
}

function installIpcBridge() {
  ipcMain.handle('PANDA_GUI', (event, action, payload) => handleGuiAction(action, payload || {}));

  ipcMain.on('IPC_MESSAGE_QUEUE', (event, message) => {
    const callbackId = message && message.__callbackId;
    routeIpcMessage(message || {})
      .then(value => {
        if (callbackId) {
          event.sender.send('IPC_MESSAGE_QUEUE', { __callbackId: callbackId, value });
        }
      })
      .catch(error => {
        if (callbackId) {
          event.sender.send('IPC_MESSAGE_QUEUE_REJECT', {
            __callbackId: callbackId,
            value: { message: error.message || String(error), info: error.message || String(error) }
          });
        }
      });
  });
}

function createMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '导入 Clash 配置文件...',
          click: () => importConfigFile().catch(error => dialog.showErrorBox('导入失败', error.message))
        },
        {
          label: '重新加载配置',
          click: () => restartCore().catch(error => dialog.showErrorBox('重新加载失败', error.message))
        },
        {
          label: '打开配置目录',
          click: () => shell.openPath(runtime.clashConfigDir)
        },
        { type: 'separator' },
        {
          label: '退出',
          click: () => {
            isQuitting = true;
            app.quit();
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (app.isReady()) {
      createWindow();
    }
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (!fs.existsSync(runtime.iconFile)) {
    return;
  }
  tray = new Tray(runtime.iconFile);
  tray.setToolTip(APP_NAME);
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '显示主界面',
        click: showMainWindow
      },
      {
        label: '打开配置目录',
        click: () => shell.openPath(runtime.clashConfigDir)
      },
      {
        label: '退出',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 820,
    minWidth: 900,
    minHeight: 560,
    title: APP_NAME,
    icon: fs.existsSync(runtime.iconFile) ? runtime.iconFile : undefined,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.on('close', event => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

async function bootstrap() {
  app.setName(APP_NAME);
  initializeFilesystem();
  settings.systemProxy = false;
  writeShellProxyState(false);
  settings.currentSelector = normalizeStoredMode(readConfigSummary().mode) === 'Global' ? 'GLOBAL' : 'Proxy';
  saveSettings();
  if (getGnomeProxyStatus().ownedBySilverVPN) {
    await setGnomeProxy(false);
  }
  updateGlobals();
  installIpcBridge();
  createMenu();
  startCompatServer();
  createWindow();
  createTray();
}

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  app.whenReady().then(bootstrap);
}

app.on('activate', () => {
  showMainWindow();
});

app.on('before-quit', event => {
  isQuitting = true;
  if (!shutdownInProgress && !settings.holdProxy && settings.systemProxy) {
    event.preventDefault();
    shutdownInProgress = true;
    setSystemProxy(false)
      .catch(error => {
        appendCoreLog(`[${new Date().toISOString()}] failed to disable proxy: ${error.message}\n`);
      })
      .finally(() => {
        stopCompatServer();
        stopCore();
        app.quit();
      });
    return;
  }
  stopCompatServer();
  stopCore();
});
