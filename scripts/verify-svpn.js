#!/usr/bin/env node
'use strict';

// 纯 CLI 安全与复用验证：使用独立 data-dir，不改动真实环境。
// 覆盖：
//   1. 首次使用自动生成 64 位 coreApiSecret
//   2. Core 鉴权（无 Authorization 401 / 正确 Bearer 200）
//   3. HTTP/SOCKS/Core/service 仅监听 127.0.0.1（不允许 0.0.0.0）
//   4. service 仅提供 /health，Controller 路径返回 404
//   5. 复用检测（核心已运行时 start 不重复 spawn）
//   6. bypass 热重载
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SVPN = path.join(ROOT, 'bin', 'svpn.js');
const dataDir = path.join(os.homedir(), '.cache', `silvervpn-verify-${process.pid}`);
const PORTS = { http: 16800, socks: 16801, service: 16808, core: 16810 };

let failures = 0;
const passed = [];

function check(label, ok, detail = '') {
  if (ok) {
    passed.push(label);
    console.log(`ok   ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? `: ${detail}` : ''}`);
  }
}

function run(args) {
  const result = spawnSync(process.execPath, [SVPN, ...args], { encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0) {
    throw new Error(`svpn ${args.join(' ')} failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function httpGet(port, pathname, headers = {}) {
  return new Promise(resolve => {
    const request = http.get(
      { hostname: '127.0.0.1', port, path: pathname, headers, timeout: 3000 },
      response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          body += chunk;
        });
        response.on('end', () => resolve({ status: response.statusCode, body }));
      }
    );
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', error => resolve({ status: 0, body: '', error: error.message }));
  });
}

function listeningAddress(port) {
  try {
    const output = spawnSync('ss', ['-ltn'], { encoding: 'utf8' });
    const line = output.stdout
      .split(/\r?\n/)
      .find(item => new RegExp(`:${port}\\b`).test(item));
    if (!line) return '';
    const columns = String(line).trim().split(/\s+/);
    // ss -ltn 输出列：State Recv-Q Send-Q LocalAddress:Port PeerAddress:Port
    return columns.length >= 4 ? columns[3] : '';
  } catch (_error) {
    return '';
  }
}

function mihomoCount() {
  const result = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
  return result.stdout
    .split(/\r?\n/)
    .filter(line => /mihomo-linux|(?:^|\s)mihomo(?:\s|$)/i.test(line))
    .length;
}

async function main() {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dataDir, 'clash-configs'), { recursive: true });
  const sampleConfig = [
    'port: 0',
    'socks-port: 0',
    'mode: rule',
    'proxies:',
    '  - name: demo',
    '    type: direct',
    'proxy-groups:',
    '  - name: Proxy',
    '    type: select',
    '    proxies:',
    '      - demo',
    'rules:',
    '  - MATCH,Proxy',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(dataDir, 'clash-configs', 'config.yaml'), sampleConfig);
  const mmdb = path.join(ROOT, 'resources', 'clash-configs', 'Country.mmdb');
  if (fs.existsSync(mmdb)) {
    fs.copyFileSync(mmdb, path.join(dataDir, 'clash-configs', 'Country.mmdb'));
  }

  try {
    run(['config', 'ports', String(PORTS.http), '--data-dir', dataDir]);

    const settings = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
    check('首次使用自动生成 64 位 coreApiSecret', /^[a-f0-9]{64}$/i.test(String(settings.coreApiSecret || '')));
    const secret = settings.coreApiSecret || '';

    const before = mihomoCount();
    run(['start', '--data-dir', dataDir]);
    check('CLI 后台启动成功', true);

    const httpLine = listeningAddress(PORTS.http);
    const socksLine = listeningAddress(PORTS.socks);
    const coreLine = listeningAddress(PORTS.core);
    const serviceLine = listeningAddress(PORTS.service);
    check(
      'HTTP/SOCKS/Core/service 均绑定 127.0.0.1',
      [httpLine, socksLine, coreLine, serviceLine].every(line => line.startsWith('127.0.0.1')),
      `http="${httpLine}" socks="${socksLine}" core="${coreLine}" service="${serviceLine}"`
    );
    check(
      '未出现非 loopback 监听',
      [httpLine, socksLine, coreLine, serviceLine].every(line => !/^(0\.0\.0\.0|\[::\]|::)/.test(line)),
      `lines=${[httpLine, socksLine, coreLine, serviceLine].join(' | ')}`
    );

    const noAuth = await httpGet(PORTS.core, '/configs');
    check('Core 无 Authorization 返回 401', noAuth.status === 401, `status=${noAuth.status}`);
    const withAuth = await httpGet(PORTS.core, '/configs', { Authorization: `Bearer ${secret}` });
    check('Core 带正确 Bearer 返回 200', withAuth.status === 200, `status=${withAuth.status}`);

    const health = await httpGet(PORTS.service, '/health');
    check('service /health 返回 200', health.status === 200, `status=${health.status}`);
    const denied = await httpGet(PORTS.service, '/configs');
    check('service 非 /health 路径返回 404', denied.status === 404, `status=${denied.status}`);

    const reuseOutput = run(['start', '--data-dir', dataDir]);
    check('核心运行中重复 start 被识别（不重复 spawn）', /已在后台运行|复用现有核心/.test(reuseOutput), reuseOutput.trim().split('\n')[0]);
    check('mihomo 进程数未增加', mihomoCount() === before + 1, `before=${before} after=${mihomoCount()}`);

    const bypassOutput = run(['bypass', 'add', 'verify.example.com', '--data-dir', dataDir]);
    check('bypass 热重载生效', /即时生效|已更新/.test(bypassOutput), bypassOutput.trim().split('\n')[0]);

    const statusJson = JSON.parse(run(['status', '--json', '--no-delay', '--data-dir', dataDir]));
    check('status --json 报告 running=true', statusJson.running === true, JSON.stringify(statusJson));

    run(['stop', '--data-dir', dataDir]);
    const afterStop = await httpGet(PORTS.service, '/health');
    check('stop 后 service 已关闭', afterStop.status === 0, `status=${afterStop.status}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL 异常：${error.message}`);
  } finally {
    try {
      run(['stop', '--data-dir', dataDir]);
    } catch (_error) {
      // already stopped
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  console.log(`\n通过 ${passed.length} 项，失败 ${failures} 项`);
  process.exit(failures ? 1 : 0);
}

main();
