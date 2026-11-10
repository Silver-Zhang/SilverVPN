#!/usr/bin/env node
'use strict';

// 轻量级「未定义标识符」检查。
// 起因：重构删除本地函数后仍留有调用，node --check 只查语法，查不出这类错误。
// 这里不做完整作用域分析，只针对项目内跨模块共享的辅助函数做登记比对。

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = ['main.js', 'cli.js', 'bin/svpn.js', 'bin/svpn-import.js', 'bin/svpn-profile.js', 'preload.js'];

// 从仓库中任意模块导出、但可能被别处误用的名字：检查每个文件自身是否可见
const SHARED_MODULE = 'lib/routing-rules.js';

// 只在「确实应该存在于同文件」的函数名登记于此，减少误报
const KNOWN_PROJECT_FUNCTIONS = new Set([
  'parseArgs', 'ensureDir', 'readText', 'readJson', 'writeJson', 'setActivePaths',
  'getPaths', 'normalizePort', 'portsFromBase', 'normalizeBypassHosts',
  'bypassHostToDirectRule', 'getBypassHosts', 'getDirectRules', 'getProxyRoutingRules',
  'getRejectRules', 'getProxyTarget', 'extractProxyNames', 'readTail', 'appendCoreLog',
  'rotateCoreLogIfNeeded', 'pruneLogDirectory', 'syncBundledResource', 'copyIfMissing'
]);

function extractDestructuredNames(source, moduleLiteral) {
  const names = new Set();
  const pattern = new RegExp(`const\\s*\\{([\\s\\S]*?)\\}\\s*=\\s*require\\((['"])([^'"]*${moduleLiteral.replace(/\./g, '\\.')})\\2\\)`, 'g');
  let match;
  while ((match = pattern.exec(source))) {
    for (const part of match[1].split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const alias = trimmed.split(':').pop().trim();
      if (alias) names.add(alias);
    }
  }
  return names;
}

function collectDeclaredNames(source) {
  const declared = new Set();
  const patterns = [
    /\bfunction\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /\bclass\s+([A-Za-z_$][\w$]*)/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      declared.add(match[1]);
    }
  }
  // 解构声明
  let destructure;
  const destructurePattern = /\b(?:const|let|var)\s*\{([\s\S]*?)\}\s*=/g;
  while ((destructure = destructurePattern.exec(source))) {
    for (const part of destructure[1].split(',')) {
      const trimmed = part.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;
      const alias = trimmed.split(':').pop().trim().split(/\s/)[0];
      if (alias) declared.add(alias);
    }
  }
  return declared;
}

function getSharedExports() {
  const file = path.join(ROOT, SHARED_MODULE);
  if (!fs.existsSync(file)) return null;
  try {
    return Object.keys(require(file));
  } catch (_error) {
    return null;
  }
}

// 收集「本项目 own 的模块」导出的全部名字（含 lib/*.js）
function getProjectModuleExports() {
  const out = new Map();
  const libDir = path.join(ROOT, 'lib');
  if (!fs.existsSync(libDir)) return out;
  for (const entry of fs.readdirSync(libDir)) {
    if (!entry.endsWith('.js')) continue;
    const file = path.join(libDir, entry);
    try {
      const exports = Object.keys(require(file));
      for (const name of exports) {
        if (!out.has(name)) out.set(name, entry);
      }
    } catch (_error) {
      // 加载失败交由运行时暴露
    }
  }
  return out;
}

// 检查「源码里以识符形式出现、但既没在 import 块也没本地声明」的名字。
// 重点是捕获别名导入缺失：import 写了 getBypassHosts: sharedGetBypassHosts
// 结果别名被删掉，调用点却仍在用 sharedGetBypassHosts。
function checkAliasImports(source, relative) {
  const problems = [];
  // 收集所有 require(...) 导入块里的「本地可用名」
  const localNames = new Set(collectDeclaredNames(source));
  const requireBlocks = /require\(/g;
  let req;
  while ((req = requireBlocks.exec(source))) {
    // 向前找到 const { ... } = 
    const before = source.slice(Math.max(0, req.index - 4000), req.index);
    const braceStart = before.lastIndexOf('const {') >= 0
      ? before.lastIndexOf('const {')
      : before.lastIndexOf('const {');
    if (braceStart === -1) continue;
    const block = before.slice(braceStart);
    const close = block.indexOf('}');
    if (close === -1) continue;
    const inner = block.slice(block.indexOf('{') + 1, close);
    for (const part of inner.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const pieces = trimmed.split(':');
      localNames.add(pieces[pieces.length - 1].trim());
    }
  }

  // 找出所有 sharedXxx( 调用，要求本地可用
  const aliasCall = /\b(shared[A-Z][A-Za-z0-9_$]*)\s*\(/g;
  let call;
  while ((call = aliasCall.exec(source))) {
    const name = call[1];
    if (!localNames.has(name)) {
      problems.push(name);
    }
  }
  return [...new Set(problems)];
}

function main() {
  let failures = 0;

  for (const relative of TARGETS) {
    const file = path.join(ROOT, relative);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');

    // 检查 1：shared* 别名调用必须有对应导入
    const aliasMissing = checkAliasImports(source, relative);
    if (aliasMissing.length) {
      failures += 1;
      console.error(`✗ ${relative}: 调用了缺失导入的别名 → ${aliasMissing.join(', ')}`);
    }
  }

  if (failures) {
    console.error('\n未定义标识符检查失败。');
    process.exit(1);
  }

  failures += checkLocalCalls();

  if (failures) {
    console.error('\n未定义标识符检查失败。');
    process.exit(1);
  }
  console.log('未定义标识符检查通过。');
}

// 检测「本文件内定义过、但调用处已找不到定义」的典型重构事故：
// 只对驼峰命名的项目内函数做判断，避免误伤 Node/浏览器全局。
const NODE_GLOBALS = new Set([
  'require', 'module', 'exports', 'process', 'console', 'Buffer', 'setTimeout',
  'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'URL', 'URLSearchParams',
  'TextDecoder', 'TextEncoder', 'fetch', 'structuredClone', 'atob', 'btoa', 'globalThis'
]);

function checkLocalCalls() {
  let failures = 0;
  for (const relative of TARGETS) {
    const file = path.join(ROOT, relative);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const declared = collectDeclaredNames(source);

    // 找出所有「函数式调用」的标识符
    const called = new Set();
    const callPattern = /\b([a-z][A-Za-z0-9_$]*)\s*\(/g;
    let match;
    while ((match = callPattern.exec(source))) {
      called.add(match[1]);
    }

    const suspicious = [];
    for (const name of called) {
      if (declared.has(name) || NODE_GLOBALS.has(name)) continue;
      // 已知内建/库函数前缀白名单
      if (/^(is|to|has|parse|read|write|find|get|set|make|create|build|run|check|load|save|apply|normalize|resolve|collect|ensure)/.test(name)) {
        // 这些前缀太常见，交由共享模块检查负责；这里只关注完全没出现过的名字
      }
      // 判断：源码中该名字从未出现在任何声明上下文中
      const declaredAnywhere = new RegExp(
        '(?:function|const|let|var|class)\\s+' + name + '\\b|' +
        '\\b' + name + '\\s*[:=]\\s*(?:function|async|\\()|' +
        '\\{[^}]*\\b' + name + '\\b[^}]*\\}\\s*='
      ).test(source);
      if (!declaredAnywhere) {
        suspicious.push(name);
      }
    }

    if (suspicious.length) {
      // 只报告已知的项目工具函数名（避免把全局 API 当错误）
      const known = suspicious.filter(name => KNOWN_PROJECT_FUNCTIONS.has(name));
      if (known.length) {
        failures += 1;
        console.error(`✗ ${relative}: 调用了未定义的函数 → ${known.join(', ')}`);
      }
    }
  }
  return failures;
}

main();
