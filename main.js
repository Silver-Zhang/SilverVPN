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
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { URL } = require('url');

const APP_NAME = '熊猫上网 Linux';
const CONTROL_HOST = '127.0.0.1';
const PUBLIC_CONTROL_PORT = 4788;
const CORE_CONTROL_PORT = 4790;
const HTTP_PROXY_PORT = 4780;
const SOCKS_PROXY_PORT = 4781;
const LOCAL_API_KEY = 'RocketMaker';

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
    activeConfigFile: path.join(userData, 'clash-configs', 'config.yaml'),
    runtimeConfigFile: path.join(userData, 'clash-runtime', 'config.yaml'),
    loadingImage: path.join(resources, 'clashy-configs', 'loading.jpg'),
    iconFile: path.join(__dirname, 'renderer', 'static', 'media', 'ava.e147bdeb.png')
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
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

function initializeFilesystem() {
  runtime = resolveRuntimePaths();
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
    port: Number(parseScalarConfigValue(text, 'port', HTTP_PROXY_PORT)) || HTTP_PROXY_PORT,
    'socks-port': Number(parseScalarConfigValue(text, 'socks-port', SOCKS_PROXY_PORT)) || SOCKS_PROXY_PORT,
    mode: parseScalarConfigValue(text, 'mode', 'Rule')
  };
}

function extractProxyNames(configText) {
  const proxySection =
    configText.match(/(?:^|\n)(?:Proxy|proxies):\s*\n([\s\S]*?)(?:\n(?:Proxy Group|proxy-groups|Rule|rules):|\n[A-Za-z_-]+:\s*\n|$)/);
  const source = proxySection ? proxySection[1] : configText;
  const names = new Set();
  const patterns = [
    /-\s*name:\s*["']?([^"'\n]+)["']?/g,
    /-\s*\{\s*name:\s*["']([^"']+)["']/g,
    /-\s*\{\s*name:\s*([^,}]+)/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const name = match[1].trim();
      if (name && !name.includes('type:')) {
        names.add(name);
      }
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

  return text;
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

  return waitForCore(4000);
}

function stopCore() {
  if (coreProcess && !coreProcess.killed) {
    coreProcess.kill('SIGTERM');
  }
  coreProcess = null;
}

async function restartCore() {
  stopCore();
  await new Promise(resolve => setTimeout(resolve, 300));
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
    "['localhost', '127.0.0.0/8', '::1']"
  ]);
}

async function setSystemProxy(enabled) {
  if (process.platform !== 'linux') {
    settings.systemProxy = enabled;
    saveSettings();
    return;
  }

  if (enabled) {
    await startCore();
  }
  await setGnomeProxy(enabled);
  settings.systemProxy = enabled;
  saveSettings();
}

function autostartFilePath() {
  return path.join(os.homedir(), '.config', 'autostart', 'xiongmao-vpn-linux.desktop');
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
      `Exec=${process.execPath}`,
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
  saveSettings();
  await restartCore();
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
          `/proxies/${encodeURIComponent(name)}/delay?timeout=10000&url=${encodeURIComponent('https://www.google.com')}`
        );
      } catch (error) {
        return { delay: -1 };
      }
    })
  );
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

function createTray() {
  if (!fs.existsSync(runtime.iconFile)) {
    return;
  }
  tray = new Tray(runtime.iconFile);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '显示主界面',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
          }
        }
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
    width: 980,
    height: 620,
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
  updateGlobals();
  installIpcBridge();
  createMenu();
  startCompatServer();
  await startCore();
  createWindow();
  createTray();
}

app.whenReady().then(bootstrap);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (mainWindow) {
    mainWindow.show();
  }
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
