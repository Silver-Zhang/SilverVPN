(function () {
  'use strict';

  const panda = window.panda || {
    invoke: mockInvoke,
    copyText(value) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(String(value || '')).catch(() => {});
      }
    }
  };
  const state = {
    dashboard: null,
    delays: new Map(),
    filter: '',
    language: 'zh-CN',
    bypassHosts: [],
    profileId: '',
    update: null,
    tunRequestPending: false,
    tunPendingEnabled: false,
    tunError: '',
    toastTimer: null
  };

  const MONITOR_WINDOW = 60;
  const monitor = {
    timer: null,
    delayTimer: null,
    up: [],
    down: [],
    delay: [],
    conn: []
  };

  const messages = {
    'zh-CN': {
      smart: '智能代理',
      global: '全局代理',
      direct: '直连模式',
      coreRunning: '核心运行中',
      coreRunningExternal: '核心运行中（由 CLI/外部托管）',
      coreStopped: '核心未运行',
      noNode: '未选择',
      noRows: '没有可显示的节点',
      selected: '已选择',
      switchNode: '切换',
      refreshed: '状态已刷新',
      startOk: '核心已启动',
      stopOk: '核心已停止',
      configOpened: '已打开配置目录',
      logsOpened: '已打开日志目录',
      systemProxyOn: '系统与终端代理已启用；已有程序需重启',
      systemProxyOff: '系统与终端代理已关闭',
      tunEnabled: 'TUN 模式已启用',
      tunDisabled: 'TUN 模式已关闭',
      tunEnabling: '正在启用',
      tunDisabling: '正在关闭',
      tunActive: '运行中',
      tunReady: '预检通过',
      tunUnavailable: '不可用',
      tunConflict: '存在冲突',
      tunWaiting: '等待启动',
      tunUnchecked: '尚未预检',
      tunDefaultMessage: 'TUN 默认关闭；开启前会检查其他 VPN、隧道网卡和路由冲突。',
      tunReadyMessage: '预检通过，可以按需启用 TUN 模式。',
      tunActiveMessage: 'TUN 正在接管需要路由的流量。',
      tunConflictPrefix: '无法启用 TUN：',
      tunRefreshed: 'TUN 状态已重新检测',
      networkRestored: 'SilverVPN 默认网络已恢复',
      restoreConfirm: '确认停止 SilverVPN 代理和 TUN，并恢复默认网络？不会修改其他 VPN。',
      modeSwitched: '已切换到',
      noDelayNodes: '没有可测试的节点',
      delayDone: '延迟测试完成',
      importing: '正在下载并验证订阅，请稍候…',
      imported: '订阅已导入',
      fileImported: '文件已导入',
      loginDone: '账号已登录，节点已更新',
      refreshedUser: '账号订阅已刷新',
      bypassSaved: '绕过地址已保存',
      appearanceSaved: '外观已保存',
      profileSwitched: '配置方案已切换',
      networkRefreshed: '网络状态已刷新',
      detectingIp: 'Detecting outbound IP',
      testing: 'Testing',
      accountMissing: '未登录',
      testingState: '测试中',
      pass: '通过',
      fail: '失败',
      languageLabel: '语言',
      checkUpdateBtn: '检查更新',
      refreshTitle: '刷新',
      updateBellTitle: '更新提醒',
      updateKicker: '应用更新',
      updateTitleDefault: '发现新版本',
      updateDescDefault: '新版本已准备好安装。',
      installUpdateBtn: '立即更新',
      dismissUpdateBtn: '稍后提醒',
      kpiCoreLabel: '核心状态',
      kpiCoreFoot: 'mihomo 运行状态',
      kpiNodesLabel: '节点',
      kpiNodesFoot: '当前配置可用节点',
      kpiHttpLabel: 'HTTP 代理',
      kpiSocksLabel: 'SOCKS 代理',
      kpiPortFoot: '127.0.0.1 端口',
      monitorTitle: '实时监控',
      collapseTitle: '折叠/展开',
      monitorTraffic: '流量',
      monitorDelay: '当前延迟',
      monitorConnections: '活跃连接',
      trafficTitle: '流量统计',
      collapseTrafficTitle: '折叠/展开流量统计',
      refreshTrafficTitle: '刷新流量统计',
      trafficToday: '今天',
      trafficD3: '近 3 天',
      trafficD7: '近 7 天',
      trafficD30: '近 30 天',
      trafficEmpty: '暂无流量记录，使用代理后将自动统计',
      currentNodeKicker: '当前节点',
      notCheckedYet: '尚未检测',
      silverStateOff: '未连接',
      networkDirect: '直连出口',
      networkSilver: 'SilverVPN 出口',
      networkSystemProxy: '系统代理',
      networkDefaultRoute: '默认路由',
      networkTunnel: '隧道网卡',
      networkPorts: '本地端口',
      refreshNetworkTitle: '刷新网络状态',
      portGroupLabel: '代理端口组（HTTP 基础端口）',
      applyPortsBtn: '应用并重启',
      portHintPrefix: '当前',
      portHintSuffix: '修改后端口写入 server.json，与 CLI（svpn config ports）同步。',
      nodeTitle: '节点列表',
      nodeHeaderName: '节点',
      nodeHeaderType: '协议',
      nodeHeaderDelay: '延迟',
      nodeHeaderAction: '操作',
      profileSourceLabel: '来源',
      profileCountLabel: '节点数',
      profileUpdatedLabel: '更新',
      renameProfileBtn: '重命名',
      deleteProfileBtn: '删除',
      profileEmpty: '暂无已保存方案，导入后自动创建',
      bypassDefaultsSummary: '内置默认绕过',
      bypassDefaultsDesc: '内网网段和 localhost',
      testsPending: '待测试',
      testsOutputIdle: '等待测试',
      testButtonTitle: '测试',
      logEmpty: '暂无日志',
      loginSubmit: '登录并更新',
      themeLabel: '主题',
      themeVisionName: '深蓝',
      themeVisionTitle: 'Vision 深蓝',
      themeMidnightName: '午夜',
      themeMidnightTitle: '午夜黑蓝',
      themeAuroraName: '极光',
      themeAuroraTitle: '极光紫青',
      themeDayName: '晴空',
      themeDayTitle: '晴空白蓝',
      themeLightName: '浅色',
      themeLightTitle: '浅色玻璃',
      themeSunriseName: '晨曦',
      themeSunriseTitle: '晨曦暖白',
      themeEmberName: '暖阳',
      themeEmberTitle: '暖阳橙',
      backgroundLabel: '背景',
      uploadBgBtn: '上传图片',
      clearBgBtn: '清除',
      glassLabel: '玻璃透明度',
      glassHint: '透明度越低，背景越穿透；图片仅保存在本机。',
      particlesLabel: '粒子特效',
      particlesToggleText: '动态粒子 / 星轨连线',
      particlesOffHint: '关闭后不消耗渲染性能。',
      particlesIntensityLabel: '特效强度',
      particlesIntensityHint: '控制粒子数量、速度与星轨连线密度。',
      pathsDataDir: '数据目录',
      pathsConfigFile: '配置文件',
      pathsControlApi: '控制 API'
    },
    en: {
      smart: 'Smart',
      global: 'Global',
      direct: 'Direct',
      coreRunning: 'Core running',
      coreRunningExternal: 'Core running (managed externally)',
      coreStopped: 'Core stopped',
      noNode: 'Not selected',
      noRows: 'No nodes',
      selected: 'Selected',
      switchNode: 'Switch',
      refreshed: 'Status refreshed',
      startOk: 'Core started',
      stopOk: 'Core stopped',
      configOpened: 'Config opened',
      logsOpened: 'Logs opened',
      systemProxyOn: 'System and terminal proxy enabled; restart existing apps',
      systemProxyOff: 'System and terminal proxy disabled',
      tunEnabled: 'TUN mode enabled',
      tunDisabled: 'TUN mode disabled',
      tunEnabling: 'Enabling',
      tunDisabling: 'Disabling',
      tunActive: 'Active',
      tunReady: 'Preflight passed',
      tunUnavailable: 'Unavailable',
      tunConflict: 'Conflict detected',
      tunWaiting: 'Waiting to start',
      tunUnchecked: 'Not checked',
      tunDefaultMessage: 'TUN is off by default. Other VPNs, tunnel interfaces, and route conflicts are checked before enabling it.',
      tunReadyMessage: 'Preflight passed. TUN mode can be enabled when needed.',
      tunActiveMessage: 'TUN is routing traffic that requires system-level interception.',
      tunConflictPrefix: 'Unable to enable TUN: ',
      tunRefreshed: 'TUN status refreshed',
      networkRestored: 'SilverVPN default network restored',
      restoreConfirm: 'Stop SilverVPN proxy and TUN and restore the default network? Other VPNs will not be modified.',
      modeSwitched: 'Switched to ',
      noDelayNodes: 'No nodes to test',
      delayDone: 'Delay test complete',
      importing: 'Downloading and validating subscription…',
      imported: 'Subscription imported',
      fileImported: 'File imported',
      loginDone: 'Logged in and updated',
      refreshedUser: 'Account subscription refreshed',
      bypassSaved: 'Bypass list saved',
      appearanceSaved: 'Appearance saved',
      profileSwitched: 'Profile switched',
      networkRefreshed: 'Network status refreshed',
      detectingIp: 'Detecting outbound IP',
      testing: 'Testing',
      accountMissing: 'Not signed in',
      testingState: 'Testing',
      pass: 'Passed',
      fail: 'Failed',
      languageLabel: 'Language',
      checkUpdateBtn: 'Check updates',
      refreshTitle: 'Refresh',
      updateBellTitle: 'Update notification',
      updateKicker: 'App update',
      updateTitleDefault: 'New version available',
      updateDescDefault: 'A new version is ready to install.',
      installUpdateBtn: 'Install now',
      dismissUpdateBtn: 'Later',
      kpiCoreLabel: 'Core',
      kpiCoreFoot: 'mihomo core status',
      kpiNodesLabel: 'Nodes',
      kpiNodesFoot: 'Available nodes',
      kpiHttpLabel: 'HTTP proxy',
      kpiSocksLabel: 'SOCKS proxy',
      kpiPortFoot: '127.0.0.1 port',
      monitorTitle: 'Live monitor',
      collapseTitle: 'Collapse / expand',
      monitorTraffic: 'Traffic',
      monitorDelay: 'Delay',
      monitorConnections: 'Connections',
      trafficTitle: 'Traffic stats',
      collapseTrafficTitle: 'Collapse / expand traffic stats',
      refreshTrafficTitle: 'Refresh traffic stats',
      trafficToday: 'Today',
      trafficD3: 'Last 3 days',
      trafficD7: 'Last 7 days',
      trafficD30: 'Last 30 days',
      trafficEmpty: 'No traffic recorded yet; usage is tracked automatically.',
      currentNodeKicker: 'Current node',
      notCheckedYet: 'Not checked yet',
      silverStateOff: 'Disconnected',
      networkDirect: 'Direct egress',
      networkSilver: 'SilverVPN egress',
      networkSystemProxy: 'System proxy',
      networkDefaultRoute: 'Default route',
      networkTunnel: 'Tunnel interface',
      networkPorts: 'Local ports',
      refreshNetworkTitle: 'Refresh network status',
      portGroupLabel: 'Proxy port group (HTTP base)',
      applyPortsBtn: 'Apply & restart',
      portHintPrefix: 'Current',
      portHintSuffix: 'Ports are saved to server.json and synced with the CLI (svpn config ports).',
      nodeTitle: 'Nodes',
      nodeHeaderName: 'Node',
      nodeHeaderType: 'Type',
      nodeHeaderDelay: 'Delay',
      nodeHeaderAction: 'Action',
      profileSourceLabel: 'Source',
      profileCountLabel: 'Nodes',
      profileUpdatedLabel: 'Updated',
      renameProfileBtn: 'Rename',
      deleteProfileBtn: 'Delete',
      profileEmpty: 'No saved profiles; importing creates one.',
      bypassDefaultsSummary: 'Built-in bypass',
      bypassDefaultsDesc: 'LAN ranges and localhost',
      testsPending: 'Idle',
      testsOutputIdle: 'Waiting for tests',
      testButtonTitle: 'Test',
      logEmpty: 'No logs yet',
      loginSubmit: 'Sign in & update',
      themeLabel: 'Theme',
      themeVisionName: 'Vision',
      themeVisionTitle: 'Vision deep blue',
      themeMidnightName: 'Midnight',
      themeMidnightTitle: 'Midnight black-blue',
      themeAuroraName: 'Aurora',
      themeAuroraTitle: 'Aurora purple-cyan',
      themeDayName: 'Day',
      themeDayTitle: 'Day sky blue',
      themeLightName: 'Light',
      themeLightTitle: 'Light glass',
      themeSunriseName: 'Sunrise',
      themeSunriseTitle: 'Sunrise warm white',
      themeEmberName: 'Ember',
      themeEmberTitle: 'Ember orange',
      backgroundLabel: 'Background',
      uploadBgBtn: 'Upload image',
      clearBgBtn: 'Clear',
      glassLabel: 'Glass opacity',
      glassHint: 'Lower opacity lets the background show through; images stay on this device.',
      particlesLabel: 'Particles',
      particlesToggleText: 'Particles & constellation',
      particlesOffHint: 'Disable to save rendering performance.',
      particlesIntensityLabel: 'Intensity',
      particlesIntensityHint: 'Controls particle count, speed, and link density.',
      pathsDataDir: 'Data directory',
      pathsConfigFile: 'Config file',
      pathsControlApi: 'Control API'
    }
  };

  function t(key) {
    const language = state.language === 'en' ? 'en' : 'zh-CN';
    return (messages[language] && messages[language][key]) || messages['zh-CN'][key] || key;
  }

  function $(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function modeKey(mode) {
    const value = String(mode || '').toLowerCase();
    if (value === 'global') {
      return 'global';
    }
    if (value === 'direct') {
      return 'direct';
    }
    return 'rule';
  }

  function modeText(mode) {
    const key = modeKey(mode);
    if (key === 'global') {
      return t('global');
    }
    if (key === 'direct') {
      return t('direct');
    }
    return t('smart');
  }

  function applyLanguage() {
    const english = state.language === 'en';
    document.documentElement.lang = english ? 'en' : 'zh-CN';
    const pairs = [
      ['#connectionTitle', english ? 'Connection' : '连接'],
      ['#startCore', english ? 'Start' : '启动'],
      ['#stopCore', english ? 'Stop' : '停止'],
      ['.mode-button[data-mode="rule"]', modeText('rule')],
      ['.mode-button[data-mode="global"]', modeText('global')],
      ['.mode-button[data-mode="direct"]', modeText('direct')],
      ['#systemProxyLabel', english ? 'System and terminal proxy' : '系统与终端代理'],
      ['#tunModeLabel', english ? 'TUN mode' : 'TUN 模式'],
      ['#refreshTunStatus', english ? 'Recheck' : '重新检测'],
      ['#restoreDefaultNetwork', english ? 'Restore network' : '恢复默认网络'],
      ['#accountTitle', english ? 'Account' : '账号'],
      ['#refreshUser', english ? 'Refresh' : '刷新'],
      ['#subscriptionTitle', english ? 'Profiles' : '订阅'],
      ['#importFile', english ? 'Import file' : '导入文件'],
      ['#importForm button[type="submit"]', english ? 'Import subscription' : '导入订阅'],
      ['label[for="profileSelect"]', english ? 'Profile' : '配置方案'],
      ['#bypassTitle', english ? 'Direct bypass' : '直连/绕过地址'],
      ['#addBypass', english ? 'Add' : '添加'],
      ['#appearanceTitle', english ? 'Appearance' : '外观'],
      ['#testsTitle', english ? 'Connectivity' : '连通性测试'],
      ['#detectIp', english ? 'Outbound IP' : '出口 IP'],
      ['#pathsTitle', english ? 'Paths' : '路径'],
      ['#openConfig', english ? 'Open config' : '打开配置'],
      ['#logTitle', english ? 'Core log' : '核心日志'],
      ['#openLogs', english ? 'Open logs' : '打开目录'],
      ['#delayAll', english ? 'Delay test' : '延迟测试'],
      ['#networkTitle', english ? 'Network status' : '网络状态']
    ];
    pairs.forEach(([selector, value]) => setText(selector, value));
    $$('[data-i18n]').forEach(node => {
      const key = node.getAttribute('data-i18n');
      if (key) {
        node.textContent = t(key);
      }
    });
    $$('[data-i18n-title]').forEach(node => {
      const key = node.getAttribute('data-i18n-title');
      if (key) {
        node.title = t(key);
      }
    });
    refreshPortHint();
    $('#apiBase').placeholder = english ? 'Optional API base URL' : '服务端 URL（可选）';
    $('#username').placeholder = english ? 'Account email' : '账号';
    $('#password').placeholder = english ? 'Password' : '密码';
    $('#nodeSearch').placeholder = english ? 'Search nodes' : '搜索节点';
    $('#subscriptionSource').placeholder = english ? 'Subscription URL / sub://...' : '订阅 URL / sub://...';
    $('#customTestUrl').placeholder = 'https://example.com';
    $('#bypassInput').placeholder = english
      ? 'Domain or CIDR, e.g. example.com, *.corp.com, 192.168.0.0/16'
      : '域名或网段，例如 example.com、*.corp.com、192.168.0.0/16';
    const bypassEmpty = $('#bypassEmpty');
    if (bypassEmpty) {
      bypassEmpty.textContent = english ? 'No custom bypass hosts' : '暂无自定义绕过地址';
    }
    if (state.dashboard) {
      renderTunStatus(state.dashboard.settings || {}, state.dashboard.tun || {});
    }
  }

  function shortPath(value) {
    const text = String(value || '');
    if (text.length <= 48) {
      return text || '-';
    }
    return `${text.slice(0, 20)}...${text.slice(-24)}`;
  }

  function formatDate(value) {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  }

  function setText(selector, value) {
    const node = $(selector);
    if (node) {
      node.textContent = value == null || value === '' ? '-' : String(value);
    }
  }

  function setBadge(selector, text, tone) {
    const node = $(selector);
    if (!node) {
      return;
    }
    node.textContent = text;
    node.className = 'badge';
    if (tone === 'muted') {
      node.classList.add('badge-muted');
    }
    if (tone === 'warn') {
      node.classList.add('badge-warn');
    }
    if (tone === 'danger') {
      node.classList.add('badge-danger');
    }
  }

  function refreshPortHint() {
    const hint = $('#portHint');
    if (!hint) {
      return;
    }
    const info = state.portInfo || {};
    const read = key => (info[key] === undefined || info[key] === null || info[key] === '' ? '-' : info[key]);
    const separator = state.language === 'en' ? '. ' : '。';
    hint.innerHTML = `${t('portHintPrefix')} HTTP <b>${read('http')}</b> / SOCKS <b>${read('socks')}</b> / API <b>${read('api')}</b> / Core <b>${read('core')}</b>${separator}${t('portHintSuffix')}`;
  }

  function normalizeTunConflicts(conflicts) {
    if (!Array.isArray(conflicts)) {
      return conflicts ? [String(conflicts)] : [];
    }
    return conflicts
      .map(item => {
        if (typeof item === 'string') {
          return item;
        }
        if (item && typeof item === 'object') {
          return item.message || item.reason || item.name || JSON.stringify(item);
        }
        return String(item || '');
      })
      .filter(Boolean);
  }

  function renderTunStatus(settings, tun) {
    const control = $('#tunControl');
    const input = $('#tunMode');
    const messageNode = $('#tunMessage');
    const conflictNode = $('#tunConflicts');
    if (!control || !input || !messageNode || !conflictNode) {
      return;
    }

    const reportedConflicts = normalizeTunConflicts(tun.conflicts);
    const conflicts = reportedConflicts.length ? reportedConflicts : state.tunError ? [state.tunError] : [];
    const active = Boolean(tun.active);
    const enabled = Boolean(settings.tunEnabled);
    const available = tun.available;
    const effectiveEnabled = state.tunError ? false : active || (enabled && conflicts.length === 0 && available !== false);

    input.checked = state.tunRequestPending ? state.tunPendingEnabled : effectiveEnabled;
    input.disabled = state.tunRequestPending || (available === false && !effectiveEnabled);
    control.classList.toggle('has-conflict', conflicts.length > 0);
    control.classList.toggle('is-active', active);
    control.classList.toggle('is-pending', state.tunRequestPending);

    if (state.tunRequestPending) {
      setBadge('#tunState', state.tunPendingEnabled ? t('tunEnabling') : t('tunDisabling'), 'warn');
    } else if (conflicts.length) {
      setBadge('#tunState', t('tunConflict'), 'danger');
    } else if (active) {
      setBadge('#tunState', t('tunActive'));
    } else if (enabled) {
      setBadge('#tunState', t('tunWaiting'), 'warn');
    } else if (available === true) {
      setBadge('#tunState', t('tunReady'));
    } else if (available === false) {
      setBadge('#tunState', t('tunUnavailable'), 'warn');
    } else {
      setBadge('#tunState', t('tunUnchecked'), 'muted');
    }

    messageNode.textContent =
      (state.tunError ? `${t('tunConflictPrefix')}${state.tunError}` : tun.message) ||
      (active
        ? t('tunActiveMessage')
        : available === true
          ? t('tunReadyMessage')
          : t('tunDefaultMessage'));
    conflictNode.hidden = conflicts.length === 0;
    conflictNode.innerHTML = conflicts.map(item => `<div>${escapeHtml(item)}</div>`).join('');
  }

  function toast(message) {
    const node = $('#toast');
    if (!node) {
      return;
    }
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => node.classList.remove('show'), 2800);
  }

  function setLoading(enabled) {
    $('#app').classList.toggle('is-loading', Boolean(enabled));
  }

  function getRows() {
    const rows = state.dashboard && state.dashboard.proxies ? state.dashboard.proxies.rows || [] : [];
    const query = state.filter.trim().toLowerCase();
    if (!query) {
      return rows;
    }
    return rows.filter(row => row.name.toLowerCase().includes(query));
  }

  function renderNodes() {
    const list = $('#nodeList');
    if (!list) {
      return;
    }
    const dashboard = state.dashboard || {};
    const rows = getRows();
    if (!rows.length) {
      list.innerHTML = `<div class="node-empty">${t('noRows')}</div>`;
      return;
    }
    list.innerHTML = rows
      .map(row => {
        const delay = state.delays.get(row.name);
        const delayClass = delay == null ? '' : delay >= 0 && delay < 800 ? 'good' : 'bad';
        const delayText = delay == null ? '-' : delay >= 0 ? `${delay} ms` : '失败';
        const selected = row.name === dashboard.proxies.current || row.selected;
        return `
          <div class="node-row${selected ? ' selected' : ''}" data-node="${escapeHtml(row.name)}">
            <div class="node-name" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</div>
            <div class="node-type">${escapeHtml(row.type || '-')}</div>
            <div class="node-delay ${delayClass}">${delayText}</div>
            <button class="button button-small switch-node" type="button" data-node="${escapeHtml(row.name)}">${selected ? t('selected') : t('switchNode')}</button>
          </div>
        `;
      })
      .join('');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function applyAppearance(settings) {
    const theme = settings.theme || 'vision';
    document.body.dataset.theme = theme;
    const opacity = typeof settings.glassOpacity === 'number' ? settings.glassOpacity : 0.9;
    document.body.style.setProperty('--card-alpha', String(opacity));
    const slider = $('#glassOpacity');
    if (slider && document.activeElement !== slider) {
      slider.value = String(Math.round(opacity * 100));
    }
    const glassValue = $('#glassValue');
    if (glassValue) {
      glassValue.textContent = `${Math.round(opacity * 100)}%`;
    }
    const particlesEnabled = settings.particlesEnabled !== false;
    const particlesIntensity = typeof settings.particlesIntensity === 'number' ? settings.particlesIntensity : 0.6;
    const toggle = $('#particlesEnabled');
    if (toggle && document.activeElement !== toggle) {
      toggle.checked = particlesEnabled;
    }
    const intensityInput = $('#particlesIntensity');
    if (intensityInput && document.activeElement !== intensityInput) {
      intensityInput.value = String(Math.round(particlesIntensity * 100));
    }
    const particlesValue = $('#particlesValue');
    if (particlesValue) {
      particlesValue.textContent = `${Math.round(particlesIntensity * 100)}%`;
    }
    if (window.silverVpnParticles) {
      window.silverVpnParticles.apply({ enabled: particlesEnabled, intensity: particlesIntensity });
    }
    $$('.theme-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.theme === theme);
    });
    if (settings.bgImage) {
      document.body.style.setProperty('--user-bg', `url("${settings.bgImage}")`);
    } else {
      document.body.style.removeProperty('--user-bg');
    }
  }

  function readImageDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          const maxWidth = 1600;
          const scale = Math.min(1, maxWidth / image.width);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(image.width * scale);
          canvas.height = Math.round(image.height * scale);
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        image.onerror = () => reject(new Error(state.language === 'en' ? 'Unable to read the image' : '无法读取图片'));
        image.src = String(reader.result);
      };
      reader.onerror = () => reject(new Error(state.language === 'en' ? 'Unable to read the file' : '无法读取文件'));
      reader.readAsDataURL(file);
    });
  }

  function renderTrafficStats(stats) {
    const ranges = (stats && stats.ranges) || {};
    const total = value => (value ? value.up + value.down : 0);
    const today = total(ranges.today);
    const d3 = total(ranges.d3);
    const d7 = total(ranges.d7);
    const d30 = total(ranges.d30);
    setText('#tToday', formatBytes(today));
    setText('#tD3', formatBytes(d3));
    setText('#tD7', formatBytes(d7));
    setText('#tD30', formatBytes(d30));
    const refMax = Math.max(d30, 1);
    const setBar = (id, value) => {
      const bar = $(id);
      if (bar) {
        bar.style.width = `${Math.min(100, Math.round((value / refMax) * 100))}%`;
      }
    };
    setBar('#tTodayBar', today);
    setBar('#tD3Bar', d3);
    setBar('#tD7Bar', d7);
    const nodes = $('#trafficNodes');
    if (!nodes) {
      return;
    }
    const rows = (stats && stats.nodes) || [];
    nodes.innerHTML = rows.length
      ? rows
        .map(item => {
          const total30 = total(item.d30);
          const width = Math.min(100, Math.round((total30 / refMax) * 100));
          return `
            <div class="traffic-card">
              <div class="tc-head">
                <span class="tc-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
                <span class="tc-total">${formatBytes(total30)}</span>
              </div>
              <div class="tc-track"><i style="width:${width}%"></i></div>
              <div class="tc-cells">
                <span><b>${state.language === 'en' ? 'Today' : '今天'}</b>${formatBytes(total(item.today))}</span>
                <span><b>3 ${state.language === 'en' ? 'd' : '天'}</b>${formatBytes(total(item.d3))}</span>
                <span><b>7 ${state.language === 'en' ? 'd' : '天'}</b>${formatBytes(total(item.d7))}</span>
                <span><b>30 ${state.language === 'en' ? 'd' : '天'}</b>${formatBytes(total30)}</span>
              </div>
            </div>`;
        })
        .join('')
      : `<div class="traffic-empty">${t('trafficEmpty')}</div>`;
  }

  async function loadTrafficStats() {
    const button = $('#refreshTrafficStats');
    if (button) {
      button.classList.add('testing');
    }
    const startedAt = Date.now();
    try {
      const stats = await panda.invoke('traffic-stats');
      renderTrafficStats(stats);
    } catch (_error) {
      // keep the previous view
    } finally {
      // 保证旋转动画至少可见 450ms，避免一闪而过
      const remaining = 450 - (Date.now() - startedAt);
      if (remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, remaining));
      }
      if (button) {
        button.classList.remove('testing');
      }
    }
  }

  function renderDashboard(dashboard) {
    state.dashboard = dashboard;
    state.tunError = '';
    const config = dashboard.config || {};
    const core = dashboard.core || {};
    const settings = dashboard.settings || {};
    const proxies = dashboard.proxies || {};
    const account = dashboard.account || {};
    const profile = dashboard.activeProfile || account.profile || {};
    const auth = account.auth || {};
    const mode = modeKey(config.mode);
    state.language = settings.language || 'zh-CN';
    $('#languageSelect').value = state.language;
    applyLanguage();

    setText('#coreState', core.running ? (core.externallyManaged ? t('coreRunningExternal') : t('coreRunning')) : t('coreStopped'));
    setText('#kpiCore', core.running ? t('coreRunning') : t('coreStopped'));
    const kpiCoreCard = $('#kpiCoreCard');
    if (kpiCoreCard) {
      kpiCoreCard.classList.toggle('is-on', Boolean(core.running));
      kpiCoreCard.classList.toggle('is-off', !core.running);
      const kpiCoreValue = $('#kpiCore');
      if (kpiCoreValue) {
        kpiCoreValue.classList.toggle('dim', !core.running);
      }
    }
    setText('#currentProxy', proxies.current || t('noNode'));
    setText('#httpPort', config.httpPort || '-');
    setText('#socksPort', config.socksPort || '-');
    const portBaseInput = $('#portBaseInput');
    if (portBaseInput && document.activeElement !== portBaseInput) {
      portBaseInput.value = config.portBase || config.httpPort || '';
    }
    state.portInfo = {
      http: config.httpPort,
      socks: config.socksPort,
      api: config.apiPort,
      core: config.corePort
    };
    refreshPortHint();
    setText('#proxyCount', proxies.count || 0);
    setText('#profileSource', profile.name || profile.sourceType || settings.currentProfile || '-');
    setText('#profileCount', profile.proxyCount == null ? proxies.count || '-' : profile.proxyCount);
    setText('#profileUpdated', formatDate(profile.importedAt));
    setText('#dataDir', shortPath(config.dataDir));
    setText('#configFile', shortPath(config.activeConfigFile));
    setText('#controlApi', core.control || '-');
    setText('#coreLog', core.logTail ? core.logTail.trim() : t('logEmpty'));
    setBadge('#modeBadge', modeText(mode), core.running ? undefined : 'warn');
    setBadge('#accountState', auth && auth.username ? auth.username : t('accountMissing'), auth && auth.username ? undefined : 'muted');

    $('#systemProxy').checked = Boolean(settings.systemProxy);
    renderTunStatus(settings, dashboard.tun || {});
    $$('.mode-button').forEach(button => {
      button.classList.toggle('active', button.dataset.mode === mode);
    });

    const usernameInput = $('#username');
    if (usernameInput && document.activeElement !== usernameInput && !usernameInput.value && auth && auth.username) {
      usernameInput.value = auth.username;
    }

    renderProfiles(dashboard);
    applyAppearance(settings);
    applyCollapsedState(settings);
    renderBypass(settings);
    renderNodes();
  }

  function renderProfiles(dashboard) {
    const tabs = $('#profileTabs');
    if (!tabs) {
      return;
    }
    const profiles = dashboard.subscriptions || [];
    const currentId = dashboard.activeProfile && dashboard.activeProfile.id
      ? dashboard.activeProfile.id
      : (dashboard.settings && dashboard.settings.currentProfileId) || '';
    state.profileId = currentId;
    if (!profiles.length) {
      tabs.innerHTML = `<span class="profile-empty">${t('profileEmpty')}</span>`;
      return;
    }
    tabs.innerHTML = profiles
      .map(profile => {
        const active = profile.id === currentId;
        return `<button class="profile-tab${active ? ' active' : ''}" data-id="${escapeHtml(profile.id)}" type="button" title="${escapeHtml(profile.name || '')}">${escapeHtml(profile.name || profile.kind || profile.id)}</button>`;
      })
      .join('');
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes.toFixed(0)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  function pushWindow(values, value) {
    values.push(Number(value) || 0);
    if (values.length > MONITOR_WINDOW) values.shift();
  }

  function renderSparkline(polyline, values, fixedMax) {
    if (!polyline) return;
    if (!values.length) {
      polyline.setAttribute('points', '');
      return;
    }
    const width = 240;
    const height = 64;
    const pad = 3;
    const max = Math.max(fixedMax || 0, ...values) || 1;
    const step = width / (MONITOR_WINDOW - 1);
    const offset = (MONITOR_WINDOW - values.length) * step;
    const points = values
      .map((value, index) => {
        const x = index * step + offset;
        const y = height - pad - (value / max) * (height - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    polyline.setAttribute('points', points);
  }

  async function sampleMonitor() {
    try {
      const stats = await panda.invoke('monitor-stats');
      if (!stats || stats.inactive) {
        return;
      }
      pushWindow(monitor.up, stats.up);
      pushWindow(monitor.down, stats.down);
      pushWindow(monitor.conn, stats.connections);
      setText('#trafficValue', `${formatBytes(stats.down)} ↓ / ${formatBytes(stats.up)} ↑`);
      setText('#connectionsValue', stats.connections);
      renderSparkline($('#sparkUp'), monitor.up, 0);
      renderSparkline($('#sparkDown'), monitor.down, 0);
      renderSparkline($('#sparkConn'), monitor.conn, 0);
    } catch (_error) {
      // core not ready yet; keep the last window
    }
  }

  async function sampleDelay() {
    try {
      const value = await panda.invoke('monitor-delay');
      if (value && Number.isFinite(value.delay)) {
        pushWindow(monitor.delay, value.delay);
        setText('#delayValue', `${value.delay} ms`);
        renderSparkline($('#sparkDelay'), monitor.delay, 1500);
      }
    } catch (_error) {
      // ignore
    }
  }

  function startMonitor() {
    stopMonitor();
    sampleMonitor();
    sampleDelay();
    monitor.timer = setInterval(sampleMonitor, 1000);
    monitor.delayTimer = setInterval(sampleDelay, 5000);
  }

  function stopMonitor() {
    if (monitor.timer) clearInterval(monitor.timer);
    if (monitor.delayTimer) clearInterval(monitor.delayTimer);
    monitor.timer = null;
    monitor.delayTimer = null;
  }

  function setMonitorCollapsed(collapsed) {
    const body = $('#monitorBody');
    const toggle = $('#toggleMonitor');
    if (body) body.hidden = collapsed;
    if (toggle) toggle.textContent = collapsed ? '▸' : '▾';
    if (collapsed) {
      stopMonitor();
    } else {
      startMonitor();
    }
  }

  function setTrafficCollapsed(collapsed) {
    const body = $('#trafficBody');
    const toggle = $('#toggleTraffic');
    if (body) body.hidden = collapsed;
    if (toggle) toggle.textContent = collapsed ? '▸' : '▾';
  }

  function applyCollapsedState(settings) {
    setMonitorCollapsed(Boolean(settings.monitorCollapsed));
    setTrafficCollapsed(Boolean(settings.trafficCollapsed));
  }

  function persistCollapsedState(key, value) {
    callAction('set-appearance', { [key]: value }).catch(() => {});
  }

  function renderBypass(settings) {
    const custom = Array.isArray(settings.bypassHosts) ? settings.bypassHosts : [];
    state.bypassHosts = custom;
    const list = $('#bypassList');
    const empty = $('#bypassEmpty');
    if (list) {
      list.innerHTML = custom
        .map(host => `
          <li class="bypass-row">
            <span class="bypass-host" title="${escapeHtml(host)}">${escapeHtml(host)}</span>
            <button class="bypass-remove" type="button" data-host="${escapeHtml(host)}" aria-label="删除">&times;</button>
          </li>`)
        .join('');
    }
    if (empty) {
      empty.hidden = custom.length > 0;
    }
    setText('#defaultBypassHosts', (settings.defaultBypassHosts || []).join(', '));
  }

  function formatEgress(value) {
    if (!value || !value.ok) {
      return value && value.inactive ? (state.language === 'en' ? 'Core stopped' : '核心未启动') : '-';
    }
    return [value.ip, value.country, value.city].filter(Boolean).join(' · ');
  }

  function renderNetworkStatus(status) {
    const silver = status.silverVPN || {};
    const gnome = status.gnomeProxy || {};
    const route = status.routes || {};
    const tunnels = status.tunnelInterfaces || [];
    const ports = status.listeningPorts || [];
    const warnings = status.conflicts || [];
    const checkedAt = status.checkedAt ? new Date(status.checkedAt).toLocaleTimeString() : '-';
    const networkPanel = $('#networkPanel');
    if (networkPanel) {
      networkPanel.classList.toggle('state-off', !silver.coreRunning);
    }

    setText('#networkCheckedAt', `${state.language === 'en' ? 'Updated' : '更新'} ${checkedAt}`);
    setBadge(
      '#silverState',
      silver.coreRunning ? `${modeText(silver.mode)} · ${silver.node || t('noNode')}` : (state.language === 'en' ? 'Disconnected' : '未连接'),
      silver.coreRunning ? undefined : 'muted'
    );
    setText('#directEgress', formatEgress(status.directEgress));
    setText('#silverEgress', formatEgress(status.silverEgress));
    setText(
      '#systemProxyActual',
      gnome.mode === 'manual'
        ? `${gnome.http || gnome.https || 'manual'}${gnome.ownedBySilverVPN ? ' · SilverVPN' : ''}`
        : gnome.mode || '-'
    );
    setText('#defaultRoute', route.ipv4 || route.ipv6 || '-');
    setText('#tunnelInterfaces', tunnels.length ? tunnels.map(item => item.name).join(', ') : (state.language === 'en' ? 'None' : '无'));
    setText(
      '#listeningPorts',
      ports.filter(item => item.listening).map(item => item.port).join(', ') || (state.language === 'en' ? 'None' : '无')
    );

    const warningNode = $('#networkWarnings');
    warningNode.hidden = warnings.length === 0;
    warningNode.innerHTML = warnings.map(item => `<div>${escapeHtml(item)}</div>`).join('');
  }

  async function addBypassHost() {
    const input = $('#bypassInput');
    const value = String((input && input.value) || '').trim();
    if (!value) {
      return;
    }
    const existing = state.bypassHosts || [];
    const values = value.split(/[\s,]+/).filter(Boolean);
    const added = values.filter(item => !existing.includes(item));
    if (!added.length) {
      toast(state.language === 'en' ? 'Already in the list' : '已在列表中');
      return;
    }
    await callAction('set-bypass-hosts', { hosts: [...existing, ...added] }, t('bypassSaved'));
    if (input) {
      input.value = '';
    }
  }

  async function loadNetworkStatus(showToast) {
    try {
      const status = await panda.invoke('network-status');
      renderNetworkStatus(status);
      if (showToast) {
        toast(t('networkRefreshed'));
      }
    } catch (error) {
      setText('#networkCheckedAt', error.message || String(error));
    }
  }

  async function loadDashboard(quiet) {
    try {
      const dashboard = await panda.invoke('dashboard');
      renderDashboard(dashboard);
      if (!quiet) {
        toast(t('refreshed'));
      }
    } catch (error) {
      toast(error.message || String(error));
    }
  }

  async function callAction(action, payload, successMessage) {
    setLoading(true);
    try {
      const result = await panda.invoke(action, payload || {});
      if (result && result.dashboard) {
        renderDashboard(result.dashboard);
      } else if (result && result.appName) {
        renderDashboard(result);
      } else {
        await loadDashboard(true);
      }
      if (successMessage) {
        toast(successMessage);
      }
      return result;
    } catch (error) {
      toast(error.message || String(error));
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function setTunMode(enabled) {
    state.tunError = '';
    state.tunRequestPending = true;
    state.tunPendingEnabled = enabled;
    if (state.dashboard) {
      renderTunStatus(state.dashboard.settings || {}, state.dashboard.tun || {});
    }
    setLoading(true);

    try {
      const result = await panda.invoke('set-tun-mode', { enabled });
      const dashboard = result && result.dashboard
        ? result.dashboard
        : result && result.appName
          ? result
          : await panda.invoke('dashboard');
      renderDashboard(dashboard);

      const settings = dashboard.settings || {};
      const tun = dashboard.tun || {};
      const conflicts = normalizeTunConflicts(tun.conflicts);
      const accepted = !enabled || Boolean(settings.tunEnabled || tun.active);
      if (enabled && (conflicts.length || tun.available === false || !accepted)) {
        const reason = conflicts.join('；') || tun.message || t('tunUnavailable');
        toast(`${t('tunConflictPrefix')}${reason}`);
        return;
      }
      toast(enabled ? t('tunEnabled') : t('tunDisabled'));
    } catch (error) {
      const reason = (error && error.message ? error.message : String(error))
        .replace(/^Error invoking remote method 'PANDA_GUI': Error:\s*/i, '')
        .replace(/^无法开启 TUN：\s*/i, '');
      state.tunError = reason;
      toast(`${t('tunConflictPrefix')}${reason}`);
    } finally {
      state.tunRequestPending = false;
      setLoading(false);
      if (state.dashboard) {
        renderTunStatus(state.dashboard.settings || {}, state.dashboard.tun || {});
      }
    }
  }

  async function runUrlTest(url, button) {
    if (button) {
      button.classList.add('testing');
      button.disabled = true;
    }
    setBadge('#testState', t('testingState'), 'warn');
    setText('#testOutput', `${t('testing')} ${url}`);
    try {
      const result = await panda.invoke('test-url', { url });
      setBadge('#testState', result.ok ? t('pass') : t('fail'), result.ok ? undefined : 'danger');
      setText(
        '#testOutput',
        [
          `url=${result.url}`,
          `ok=${result.ok}`,
          `http=${result.httpCode}`,
          `remote_ip=${result.remoteIp || '-'}`,
          `time=${result.timeTotal || '-'}s`,
          `proxy=${result.proxy}`,
          result.stderr ? `stderr=${result.stderr}` : ''
        ]
          .filter(Boolean)
          .join('\n')
      );
    } catch (error) {
      setBadge('#testState', t('fail'), 'danger');
      setText('#testOutput', error.message || String(error));
    } finally {
      if (button) {
        button.classList.remove('testing');
        button.disabled = false;
      }
    }
  }

  async function runIpTest(button) {
    if (button) {
      button.classList.add('testing');
      button.disabled = true;
    }
    setBadge('#testState', t('testingState'), 'warn');
    setText('#testOutput', t('detectingIp'));
    try {
      const result = await panda.invoke('detect-ip');
      setBadge('#testState', result.ok ? t('pass') : t('fail'), result.ok ? undefined : 'danger');
      setText(
        '#testOutput',
        [
          `ip=${result.ip || '-'}`,
          `country=${result.country || '-'}`,
          `region=${result.region || '-'}`,
          `city=${result.city || '-'}`,
          `org=${result.org || '-'}`,
          `source=${result.source || '-'}`,
          `proxy=${result.proxy || '-'}`
        ].join('\n')
      );
    } catch (error) {
      setBadge('#testState', t('fail'), 'danger');
      setText('#testOutput', error.message || String(error));
    } finally {
      if (button) {
        button.classList.remove('testing');
        button.disabled = false;
      }
    }
  }

  async function runLanTest(button) {
    if (button) {
      button.classList.add('testing');
      button.disabled = true;
    }
    setBadge('#testState', t('testingState'), 'warn');
    setText('#testOutput', `${t('testing')} 192.168.9.27:22`);
    try {
      const result = await panda.invoke('test-tcp', { host: '192.168.9.27', port: 22 });
      setBadge('#testState', result.ok ? t('pass') : t('fail'), result.ok ? undefined : 'danger');
      setText(
        '#testOutput',
        [
          `host=${result.host}`,
          `port=${result.port}`,
          `ok=${result.ok}`,
          `elapsed=${result.elapsedMs}ms`,
          result.error ? `error=${result.error}` : ''
        ]
          .filter(Boolean)
          .join('\n')
      );
    } catch (error) {
      setBadge('#testState', t('fail'), 'danger');
      setText('#testOutput', error.message || String(error));
    } finally {
      if (button) {
        button.classList.remove('testing');
        button.disabled = false;
      }
    }
  }

  function bindEvents() {
    $('#refreshDashboard').addEventListener('click', () => loadDashboard(false));
    $('#refreshNetwork').addEventListener('click', () => loadNetworkStatus(true));
    $('#applyPorts').addEventListener('click', async () => {
      const base = Number($('#portBaseInput').value);
      if (!Number.isInteger(base) || base < 1024 || base > 65525) {
        toast(state.language === 'en' ? 'Invalid port base (1024-65525).' : '无效的端口基础值（1024-65525）。');
        return;
      }
      const button = $('#applyPorts');
      if (button) {
        button.classList.add('testing');
        button.textContent = '';
      }
      try {
        const result = await callAction('set-ports', { base }, state.language === 'en' ? 'Ports updated' : '端口已更新');
        if (result && result.message) {
          toast(result.message);
        }
      } catch (error) {
        toast(error.message || String(error));
      } finally {
        if (button) {
          button.classList.remove('testing');
          button.textContent = t('applyPortsBtn');
        }
      }
    });
    $('#refreshTrafficStats').addEventListener('click', () => loadTrafficStats());
    $('#checkUpdate').addEventListener('click', () => loadUpdate(false));
    $('#installUpdate').addEventListener('click', async () => {
      if (!window.confirm(state.language === 'en' ? 'Install the update now? The app will restart after installation.' : '现在安装更新吗？安装完成后将重启应用。')) {
        return;
      }
      setLoading(true);
      try {
        const result = await panda.invoke('install-update', {});
        if (result && result.restartRequired) {
          toast(state.language === 'en' ? 'Update installed. Restart SilverVPN to finish.' : '更新已安装，请重启 SilverVPN 完成更新。');
        }
      } catch (error) {
        toast(error.message || String(error));
      } finally {
        setLoading(false);
      }
    });
    $('#dismissUpdate').addEventListener('click', () => {
      if (!state.update) {
        return;
      }
      panda.invoke('dismiss-update', { version: state.update.latestVersion }).finally(() => {
        state.update.dismissed = true;
        renderUpdate(state.update);
      });
    });
    $('#refreshTunStatus').addEventListener('click', async () => {
      await loadDashboard(true);
      toast(t('tunRefreshed'));
    });
    $('#restoreDefaultNetwork').addEventListener('click', () => {
      if (!window.confirm(t('restoreConfirm'))) {
        return;
      }
      callAction('restore-default-network', {}, t('networkRestored'));
    });
    $('#startCore').addEventListener('click', async () => {
      await callAction('start-core', {}, t('startOk'));
      loadNetworkStatus(false);
    });
    $('#stopCore').addEventListener('click', async () => {
      try {
        const result = await callAction('stop-core', {}, null);
        const dashboard = result && (result.dashboard || (result.appName ? result : null));
        const core = (dashboard && dashboard.core) || {};
        if (core.externallyManaged && core.running) {
          toast(state.language === 'en'
            ? 'Core is managed by the CLI or another instance; use `svpn off` to stop it.'
            : '核心由 CLI 或外部实例托管，无法从 GUI 停止；请在终端执行 svpn off');
        } else {
          toast(t('stopOk'));
        }
        loadNetworkStatus(false);
      } catch (error) {
        toast(error.message || String(error));
      }
    });
    $('#openConfig').addEventListener('click', () => callAction('open-config-dir', {}, t('configOpened')));
    $('#openLogs').addEventListener('click', () => callAction('open-logs-dir', {}, t('logsOpened')));
    $('#languageSelect').addEventListener('change', event => {
      callAction('set-language', { language: event.target.value }, null).then(() => {
        applyLanguage();
      });
    });
    $('#systemProxy').addEventListener('change', event => {
      callAction('set-system-proxy', { enabled: event.target.checked }, event.target.checked ? t('systemProxyOn') : t('systemProxyOff')).catch(() => {
        event.target.checked = !event.target.checked;
      });
    });
    $('#tunMode').addEventListener('change', event => {
      setTunMode(event.target.checked);
    });

    $$('.mode-button').forEach(button => {
      button.addEventListener('click', () => callAction('set-mode', { mode: button.dataset.mode }, `${t('modeSwitched')}${modeText(button.dataset.mode)}`));
    });

    $('#nodeSearch').addEventListener('input', event => {
      state.filter = event.target.value;
      renderNodes();
    });

    $('#nodeList').addEventListener('click', event => {
      const button = event.target.closest('.switch-node');
      if (!button || !state.dashboard) {
        return;
      }
      callAction(
        'switch-proxy',
        {
          selector: state.dashboard.proxies.selector || 'Proxy',
          proxy: button.dataset.node
        },
        '节点已切换'
      );
    });

    $('#delayAll').addEventListener('click', async () => {
      const names = getRows()
        .slice(0, 120)
        .map(row => row.name);
      if (!names.length) {
        toast(t('noDelayNodes'));
        return;
      }
      const button = $('#delayAll');
      const originalText = button.textContent;
      button.disabled = true;
      button.classList.add('progress-testing');
      try {
        let done = 0;
        for (let index = 0; index < names.length; index += 12) {
          const chunk = names.slice(index, index + 12);
          const results = await panda.invoke('check-delays', { names: chunk });
          results.forEach(item => state.delays.set(item.name, item.delay));
          done += chunk.length;
          button.textContent = `${state.language === 'en' ? 'Testing' : '测试中'} ${done}/${names.length}`;
          renderNodes();
        }
        toast(t('delayDone'));
      } catch (error) {
        toast(error.message || String(error));
      } finally {
        button.disabled = false;
        button.classList.remove('progress-testing');
        button.textContent = originalText;
      }
    });

    $('#importForm').addEventListener('submit', event => {
      event.preventDefault();
      const source = $('#subscriptionSource').value.trim();
      const button = $('#importForm button[type="submit"]');
      const originalText = button.textContent;
      button.textContent = t('importing');
      button.disabled = true;
      callAction('import-source', { source }, t('imported'))
        .then(() => {
          $('#subscriptionSource').value = '';
        })
        .finally(() => {
          button.textContent = originalText;
          button.disabled = false;
        });
    });

    $('#importFile').addEventListener('click', () => callAction('import-file', {}, t('fileImported')));
    $('#profileTabs').addEventListener('click', event => {
      const tab = event.target.closest('.profile-tab');
      if (tab) {
        callAction('switch-profile', { id: tab.dataset.id }, t('profileSwitched'));
      }
    });
    $('#renameProfile').addEventListener('click', () => {
      const id = state.profileId;
      const profile = (state.dashboard && state.dashboard.subscriptions || []).find(item => item.id === id);
      if (!profile) {
        toast(state.language === 'en' ? 'Select a saved profile first' : '请先选择已保存的配置方案');
        return;
      }
      const name = window.prompt(state.language === 'en' ? 'Profile name' : '配置方案名称', profile.name || '');
      if (name && name.trim()) {
        callAction('rename-profile', { id, name: name.trim() }, state.language === 'en' ? 'Profile renamed' : '配置方案已重命名');
      }
    });
    $('#deleteProfile').addEventListener('click', () => {
      const id = state.profileId;
      const activeId = state.dashboard && state.dashboard.settings && state.dashboard.settings.currentProfileId;
      if (!id) {
        toast(state.language === 'en' ? 'Select a saved profile first' : '请先选择已保存的配置方案');
        return;
      }
      if (id === activeId) {
        toast(state.language === 'en' ? 'Switch to another profile before deleting this one' : '请先切换到其他方案，再删除当前方案');
        return;
      }
      if (window.confirm(state.language === 'en' ? 'Delete this saved profile? This cannot be undone.' : '确定删除这个已保存的配置方案吗？此操作不可撤销。')) {
        callAction('delete-profile', { id }, state.language === 'en' ? 'Profile deleted' : '配置方案已删除');
      }
    });
    $('#toggleMonitor').addEventListener('click', () => {
      const body = $('#monitorBody');
      const collapsed = !(body && body.hidden);
      setMonitorCollapsed(collapsed);
      persistCollapsedState('monitorCollapsed', collapsed);
    });
    $('#toggleTraffic').addEventListener('click', () => {
      const body = $('#trafficBody');
      const collapsed = !(body && body.hidden);
      setTrafficCollapsed(collapsed);
      persistCollapsedState('trafficCollapsed', collapsed);
    });
    $('#addBypass').addEventListener('click', () => addBypassHost());
    $('#bypassInput').addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addBypassHost();
      }
    });
    $('#bypassList').addEventListener('click', event => {
      const button = event.target.closest('.bypass-remove');
      if (!button) {
        return;
      }
      const host = button.dataset.host;
      const next = (state.bypassHosts || []).filter(item => item !== host);
      callAction('set-bypass-hosts', { hosts: next }, t('bypassSaved'));
    });

    $$('.theme-chip').forEach(chip => {
      chip.addEventListener('click', () => callAction('set-appearance', { theme: chip.dataset.theme }, t('appearanceSaved')));
    });
    $('#uploadBg').addEventListener('click', () => $('#bgFileInput').click());
    $('#bgFileInput').addEventListener('change', async event => {
      const file = event.target.files && event.target.files[0];
      if (!file) {
        return;
      }
      try {
        const dataUrl = await readImageDataUrl(file);
        await callAction('set-appearance', { bgImage: dataUrl }, t('appearanceSaved'));
      } catch (error) {
        toast(error.message || String(error));
      } finally {
        event.target.value = '';
      }
    });
    $('#clearBg').addEventListener('click', () => callAction('set-appearance', { bgImage: '' }, t('appearanceSaved')));
    $('#glassOpacity').addEventListener('input', event => {
      const alpha = Number(event.target.value) / 100;
      document.body.style.setProperty('--card-alpha', String(alpha));
      const value = $('#glassValue');
      if (value) {
        value.textContent = `${event.target.value}%`;
      }
    });
    $('#glassOpacity').addEventListener('change', event => {
      callAction('set-appearance', { glassOpacity: Number(event.target.value) / 100 }, t('appearanceSaved'));
    });
    $('#particlesEnabled').addEventListener('change', event => {
      const enabled = event.target.checked;
      if (window.silverVpnParticles) {
        window.silverVpnParticles.apply({ enabled });
      }
      callAction('set-appearance', { particlesEnabled: enabled }, t('appearanceSaved'));
    });
    $('#particlesIntensity').addEventListener('input', event => {
      const value = Number(event.target.value);
      if (window.silverVpnParticles) {
        window.silverVpnParticles.apply({ intensity: value / 100 });
      }
      const label = $('#particlesValue');
      if (label) {
        label.textContent = `${value}%`;
      }
    });
    $('#particlesIntensity').addEventListener('change', event => {
      callAction('set-appearance', { particlesIntensity: Number(event.target.value) / 100 }, t('appearanceSaved'));
    });

    $('#loginForm').addEventListener('submit', event => {
      event.preventDefault();
      callAction(
        'login',
        {
          base: $('#apiBase').value.trim(),
          username: $('#username').value.trim(),
          password: $('#password').value
        },
        t('loginDone')
      ).then(() => {
        $('#password').value = '';
      });
    });

    $('#refreshUser').addEventListener('click', () => {
      callAction('refresh-user', { base: $('#apiBase').value.trim() }, t('refreshedUser'));
    });

    $$('[data-test-url]').forEach(button => {
      button.addEventListener('click', () => runUrlTest(button.dataset.testUrl, button));
    });
    $('#detectIp').addEventListener('click', () => runIpTest($('#detectIp')));
    $('#testLan').addEventListener('click', () => runLanTest($('#testLan')));
    $('#customTestForm').addEventListener('submit', event => {
      event.preventDefault();
      runUrlTest($('#customTestUrl').value.trim(), $('#customTestForm button[type="submit"]'));
    });
  }

  function mockDashboard() {
    return {
      appName: 'SilverVPN',
      core: {
        running: true,
        binary: '/usr/local/bin/mihomo',
        control: 'http://127.0.0.1:4788',
        logTail: '[info] dashboard preview mode\n[info] proxy selector ready'
      },
      config: {
        dataDir: '/home/silver/.config/SilverVPN',
        activeConfigFile: '/home/silver/.config/SilverVPN/clash-configs/config.yaml',
        httpPort: 4780,
        socksPort: 4781,
        apiPort: 4788,
        corePort: 4790,
        portBase: 4780,
        mode: 'Rule',
        modeLabel: '智能代理'
      },
      settings: {
        systemProxy: false,
        tunEnabled: false,
        language: state.language,
        theme: 'vision',
        bgImage: '',
        glassOpacity: 0.9,
        particlesEnabled: true,
        particlesIntensity: 0.6,
        monitorCollapsed: false,
        trafficCollapsed: false,
        defaultBypassHosts: ['localhost', '127.0.0.0/8', '192.168.0.0/16'],
        bypassHosts: ['gitlab.example.org'],
        currentProfileId: 'account-preview',
        currentSelector: 'Proxy',
        currentProxy: '香港 01'
      },
      tun: {
        available: true,
        active: false,
        conflicts: [],
        message: t('tunReadyMessage')
      },
      account: {
        auth: { username: 'preview@example.com', hasCookie: true },
        profile: { name: 'account subscription', proxyCount: 31, importedAt: new Date().toISOString() }
      },
      activeProfile: { id: 'account-preview', name: 'SilverVPN Account (preview@example.com)', proxyCount: 5, importedAt: new Date().toISOString() },
      subscriptions: [
        { id: 'account-preview', name: 'SilverVPN Account (preview@example.com)', kind: 'account', proxyCount: 5 },
        { id: 'custom-preview', name: 'Custom Subscription', kind: 'custom', proxyCount: 2 }
      ],
      proxies: {
        selector: 'Proxy',
        current: '香港 01',
        count: 5,
        rows: [
          { name: '香港 01', type: 'Vmess', selected: true },
          { name: '日本 02', type: 'SSR', selected: false },
          { name: '新加坡 03', type: 'Vmess', selected: false },
          { name: '美国 04', type: 'Vmess', selected: false },
          { name: '台湾 05', type: 'SSR', selected: false }
        ]
      }
    };
  }

  async function mockInvoke(action, payload) {
    if (!state.dashboard) {
      state.dashboard = mockDashboard();
    }
    if (action === 'set-mode') {
      state.dashboard.config.mode = payload.mode;
      state.dashboard.config.modeLabel = modeText(payload.mode);
      return state.dashboard;
    }
    if (action === 'start-core') {
      state.dashboard.core.running = true;
      state.dashboard.core.externallyManaged = false;
      return state.dashboard;
    }
    if (action === 'stop-core') {
      state.dashboard.core.running = false;
      state.dashboard.core.externallyManaged = false;
      return state.dashboard;
    }
    if (action === 'set-system-proxy') {
      state.dashboard.settings.systemProxy = Boolean(payload.enabled);
      return state.dashboard;
    }
    if (action === 'set-language') {
      state.dashboard.settings.language = payload.language;
      return state.dashboard;
    }
    if (action === 'set-tun-mode') {
      const conflicts = normalizeTunConflicts(state.dashboard.tun.conflicts);
      if (payload.enabled && (state.dashboard.tun.available === false || conflicts.length)) {
        state.dashboard.settings.tunEnabled = false;
        state.dashboard.tun.active = false;
        return state.dashboard;
      }
      state.dashboard.settings.tunEnabled = Boolean(payload.enabled);
      state.dashboard.tun.active = Boolean(payload.enabled);
      state.dashboard.tun.message = payload.enabled ? t('tunActiveMessage') : t('tunReadyMessage');
      return state.dashboard;
    }
    if (action === 'set-bypass-hosts') {
      state.dashboard.settings.bypassHosts = Array.isArray(payload.hosts)
        ? payload.hosts
        : String(payload.text || '').split(/\r?\n/).filter(Boolean);
      return state.dashboard;
    }
    if (action === 'rename-profile') {
      const profile = state.dashboard.subscriptions.find(item => item.id === payload.id);
      if (profile) profile.name = payload.name;
      if (state.dashboard.activeProfile && state.dashboard.activeProfile.id === payload.id) state.dashboard.activeProfile.name = payload.name;
      return state.dashboard;
    }
    if (action === 'delete-profile') {
      state.dashboard.subscriptions = state.dashboard.subscriptions.filter(item => item.id !== payload.id);
      return state.dashboard;
    }
    if (action === 'switch-profile') {
      state.dashboard.activeProfile = state.dashboard.subscriptions.find(item => item.id === payload.id) || state.dashboard.activeProfile;
      state.dashboard.settings.currentProfileId = payload.id;
      return state.dashboard;
    }
    if (action === 'set-appearance') {
      Object.assign(state.dashboard.settings, {
        theme: payload.theme || state.dashboard.settings.theme,
        bgImage: typeof payload.bgImage === 'string' ? payload.bgImage : state.dashboard.settings.bgImage,
        glassOpacity: typeof payload.glassOpacity === 'number' ? payload.glassOpacity : state.dashboard.settings.glassOpacity,
        particlesEnabled: typeof payload.particlesEnabled === 'boolean' ? payload.particlesEnabled : state.dashboard.settings.particlesEnabled,
        particlesIntensity: typeof payload.particlesIntensity === 'number' ? payload.particlesIntensity : state.dashboard.settings.particlesIntensity,
        monitorCollapsed: typeof payload.monitorCollapsed === 'boolean' ? payload.monitorCollapsed : state.dashboard.settings.monitorCollapsed,
        trafficCollapsed: typeof payload.trafficCollapsed === 'boolean' ? payload.trafficCollapsed : state.dashboard.settings.trafficCollapsed
      });
      applyAppearance(state.dashboard.settings);
      return state.dashboard;
    }
    if (action === 'set-ports') {
      const base = Number(payload.base);
      state.dashboard.config.httpPort = base;
      state.dashboard.config.socksPort = base + 1;
      state.dashboard.config.apiPort = base + 8;
      state.dashboard.config.corePort = base + 10;
      state.dashboard.config.portBase = base;
      return {
        ok: true,
        message: `${state.language === 'en' ? 'Ports updated' : '端口已更新'}：HTTP ${base} / SOCKS ${base + 1} / API ${base + 8} / Core ${base + 10}`,
        dashboard: state.dashboard
      };
    }
    if (action === 'switch-proxy') {
      state.dashboard.proxies.current = payload.proxy;
      state.dashboard.settings.currentProxy = payload.proxy;
      state.dashboard.proxies.rows.forEach(row => {
        row.selected = row.name === payload.proxy;
      });
      return state.dashboard;
    }
    if (action === 'check-delays') {
      return (payload.names || []).map((name, index) => ({ name, delay: 96 + index * 47 }));
    }
    if (action === 'test-url') {
      return {
        ok: true,
        url: payload.url,
        httpCode: 200,
        remoteIp: '142.250.72.36',
        timeTotal: '0.218',
        proxy: 'http://127.0.0.1:4780'
      };
    }
    if (action === 'detect-ip') {
      return {
        ok: true,
        ip: '203.0.113.8',
        country: 'JP',
        region: 'Tokyo',
        city: 'Tokyo',
        org: 'Example Transit',
        source: 'ipinfo.io',
        proxy: 'http://127.0.0.1:4780'
      };
    }
    if (action === 'network-status') {
      return {
        checkedAt: new Date().toISOString(),
        silverVPN: {
          coreRunning: Boolean(state.dashboard && state.dashboard.core && state.dashboard.core.running),
          mode: state.dashboard.config.mode,
          selector: state.dashboard.proxies.selector,
          node: state.dashboard.proxies.current,
          httpProxy: '127.0.0.1:4780',
          socksProxy: '127.0.0.1:4781'
        },
        gnomeProxy: {
          mode: 'manual',
          http: '127.0.0.1:4780',
          ownedBySilverVPN: true
        },
        directEgress: { ok: true, ip: '198.51.100.21', country: 'CN', city: 'Beijing' },
        silverEgress: { ok: true, ip: '203.0.113.8', country: 'JP', city: 'Tokyo' },
        routes: { ipv4: 'default via 192.168.9.1 dev enp3s0' },
        tunnelInterfaces: [{ name: 'tun0', addresses: ['10.8.0.2'], tunnel: true }],
        listeningPorts: [
          { port: 4780, listening: true },
          { port: 4781, listening: true },
          { port: 4788, listening: true }
        ],
        conflicts: ['检测到隧道网卡：tun0']
      };
    }
    if (action === 'test-tcp') {
      return { ok: true, host: payload.host, port: payload.port, elapsedMs: 18 };
    }
    if (action === 'check-update') {
      return { checked: true, currentVersion: '0.1.0', latestVersion: '0.2.0', available: true, dismissed: false };
    }
    if (action === 'monitor-stats') {
      return {
        up: 18000 + Math.random() * 12000,
        down: 42000 + Math.random() * 26000,
        connections: 3 + Math.floor(Math.random() * 5),
        inactive: false
      };
    }
    if (action === 'monitor-delay') {
      return { delay: 120 + Math.round(Math.random() * 80), node: '香港 01' };
    }
    if (action === 'traffic-stats') {
      const bytes = value => ({ up: value, down: value * 2 });
      const range = (node) => ({ today: bytes(25 * 1024 * 1024), d3: bytes(80 * 1024 * 1024), d7: bytes(220 * 1024 * 1024), d30: bytes(640 * 1024 * 1024) });
      return {
        ranges: {
          today: bytes(60 * 1024 * 1024),
          d3: bytes(180 * 1024 * 1024),
          d7: bytes(420 * 1024 * 1024),
          d30: bytes(1100 * 1024 * 1024)
        },
        nodes: [
          { name: '香港 01', ...range() },
          { name: '日本 02', ...range() },
          { name: '新加坡 03', ...range() }
        ]
      };
    }
    if (action === 'dismiss-update') {
      return { ok: true };
    }
    if (action === 'install-update') {
      return { ok: true, restartRequired: true };
    }
    return state.dashboard;
  }

  function renderUpdate(update) {
    const card = $('#updateCard');
    if (!card) {
      return;
    }
    state.update = update && update.available ? update : null;
    card.hidden = !state.update || state.update.dismissed;
    if (!state.update || state.update.dismissed) {
      return;
    }
    setText('#updateTitle', state.language === 'en' ? `Version ${state.update.latestVersion} is available` : `发现新版本 ${state.update.latestVersion}`);
    setText(
      '#updateDescription',
      state.language === 'en'
        ? `Current ${state.update.currentVersion} · Download and install from the official repository.`
        : `当前版本 ${state.update.currentVersion} · 将从官方仓库下载并安装更新。`
    );
  }

  async function loadUpdate(quiet) {
    try {
      const update = await panda.invoke('check-update', {});
      renderUpdate(update);
      if (!quiet && (!update.available || update.dismissed)) {
        toast(state.language === 'en' ? 'You are up to date' : '已是最新版本');
      }
    } catch (error) {
      if (!quiet) {
        toast(error.message || String(error));
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    loadDashboard(true);
    loadNetworkStatus(false);
    loadUpdate(true);
    loadTrafficStats();
    startMonitor();
    setInterval(() => loadDashboard(true), 10000);
    setInterval(() => loadTrafficStats(), 30000);
    setInterval(() => loadNetworkStatus(false), 15000);
  });
})();
