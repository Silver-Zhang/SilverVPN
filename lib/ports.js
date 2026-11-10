'use strict';

// 端口组规则：GUI 与所有 CLI 入口必须共用同一份，
// 否则一方改端口后另一方会算出不同的 API/核心端口。

const PORT_GROUP_RULES = { socks: 1, service: 8, core: 10 };
const PORT_BASE_MIN = 1024;
const PORT_BASE_MAX = 65535 - PORT_GROUP_RULES.core;

function portsFromBase(base) {
  return {
    http: base,
    socks: base + PORT_GROUP_RULES.socks,
    service: base + PORT_GROUP_RULES.service,
    core: base + PORT_GROUP_RULES.core
  };
}

function isValidPortBase(value) {
  const base = Number(value);
  return Number.isInteger(base) && base >= PORT_BASE_MIN && base <= PORT_BASE_MAX;
}

module.exports = {
  PORT_GROUP_RULES,
  PORT_BASE_MIN,
  PORT_BASE_MAX,
  portsFromBase,
  isValidPortBase
};
