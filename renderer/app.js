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
      kpiProxyLabel: '代理端口',
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
      glassEnabledLabel: '玻璃特效',
      glassEnabledText: '毛玻璃模糊 / 半透明',
      glassEnabledHint: '关闭后卡片与顶栏变为不透明实体样式。',
      glassBlurLabel: '毛玻璃强度',
      glassBlurHint: '0 为纯透玻璃（仅透明无模糊），100 为强毛玻璃。',
      particlesLabel: '粒子特效',
      particlesToggleText: '动态粒子 / 星轨连线',
      particlesOffHint: '关闭后不消耗渲染性能。',
      particlesIntensityLabel: '特效强度',
      particlesIntensityHint: '控制粒子数量与星轨连线密度。',
      particleControlsTitle: '粒子与发射源',
      ringRadiusLabel: '星环大小',
      ringRadiusHint: '控制核心引力星环的半径，粒子绕核心公转的轨道大小。',
      gravityLabel: '引力大小',
      gravityHint: '控制核心引力源对粒子的吸引强度。',
      spinDirLabel: '旋转方向',
      spinDir_ccw: '逆时针',
      spinDir_cw: '顺时针',
      spinDir_random: '随机',
      particlesBounceLabel: '边缘反弹',
      particlesBounceHint: '开启后粒子碰到边缘反弹，关闭则穿过从另一侧出现。',
      particlesMouseRepelLabel: '鼠标互动',
      particlesMouseRepelHint: '开启后鼠标会排斥推开附近粒子。',
      emittersLabel: '自定义物理发射源',
      addEmitterBtn: '添加发射源',
      clearEmittersBtn: '清空',
      emittersHint: '在页面放置并拖动，点击可切换喷射开/关，持续向外喷粒子；双击页面空白处也可创建。',
      emittersCleared: '已清空全部物理发射源',
      emitterAdded: '已添加物理发射源，可拖动位置或点击切换喷射',
      emitterRemoved: '已移除物理发射源',
      emitterPaused: '已暂停该发射源喷射',
      emitterResumed: '已开始该发射源喷射',
      addGravitySourceBtn: '添加引力源',
      gravitySourceLabel: '引力源',
      gravitySourceAdded: '已添加引力源，可拖动位置或点击调节星环与引力',
      gravitySourceRemoved: '已移除引力源',
      gravitySourcesCleared: '已清空全部引力源',
      diagRun: '网络诊断',
      diagFix: '一键修复',
      diagFixedToast: '修复完成，请查看诊断结果。',
      diagCoreRunning: '核心运行中',
      diagCoreStopped: '核心未运行',
      diagPortsOk: '代理端口监听正常（HTTP {http} / SOCKS {socks}）',
      diagPortsDown: '代理端口未监听（HTTP {http} / SOCKS {socks}）',
      diagProxyOk: '系统代理指向本机 {port}，与核心一致',
      diagProxyResidual: '系统代理残留：仍指向 127.0.0.1:{port} 但核心未运行，插件连接将被拒绝（ECONNREFUSED）',
      diagProxyExternal: '系统代理由其他应用设置（{target}），未处理',
      diagProxyOff: '系统代理已关闭（应用直连）',
      diagVscodeProxyOk: '未发现 VS Code 扩展宿主残留代理',
      diagVscodeProxyResidual: '检测到 {procs} 个 VS Code 扩展宿主进程仍持有指向 127.0.0.1:{port} 的代理变量（HTTP_PROXY/HTTPS_PROXY/ALL_PROXY），这些进程的网络请求会失败。需完整退出并重启 VS Code 才能清除，仅重启窗口无效。',
      diagVscodeRepairHint: '注意：{port} 端口已关闭，但 VS Code 扩展宿主仍缓存代理变量，请完整退出并重启 VS Code（仅重启窗口无效）。',
      diagPathOk: '代理链路正常（测试站点返回 {code}）',
      diagPathFail: '代理链路失败（{code}），请检查节点与配置',
      diagPathSkipped: '代理端口未监听，跳过链路测试',
      diagDirectOk: '直连正常（返回 {code}）',
      diagDirectFail: '直连失败或被拦截（{code}），受墙域名需走代理',
      diagTunOn: 'TUN 模式开启中',
      diagFixedProxyResidual: '已修复：系统代理残留恢复为直连（原指向 127.0.0.1:{port}）',
      diagFixedProxySetting: '已修复：关闭失效的系统代理设置',
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
      kpiProxyLabel: 'Proxy ports',
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
      glassEnabledLabel: 'Glass effect',
      glassEnabledText: 'Frosted blur / translucency',
      glassEnabledHint: 'When off, cards and top bar use solid backgrounds.',
      glassBlurLabel: 'Frost intensity',
      glassBlurHint: '0 is clear glass (transparent, no blur); 100 is strong frosted glass.',
      particlesLabel: 'Particles',
      particlesToggleText: 'Particles & constellation',
      particlesOffHint: 'Disable to save rendering performance.',
      particlesIntensityLabel: 'Intensity',
      particlesIntensityHint: 'Controls particle count and link density.',
      particleControlsTitle: 'Particles & emitters',
      ringRadiusLabel: 'Ring size',
      ringRadiusHint: 'Controls the radius of the core gravity ring — the orbit radius around the core.',
      gravityLabel: 'Gravity strength',
      gravityHint: 'Controls the pull strength of the core gravity source on particles.',
      spinDirLabel: 'Spin direction',
      spinDir_ccw: 'Counterclockwise',
      spinDir_cw: 'Clockwise',
      spinDir_random: 'Random',
      particlesBounceLabel: 'Edge bounce',
      particlesBounceHint: 'Particles bounce off edges when on, or wrap around to the opposite side when off.',
      particlesMouseRepelLabel: 'Mouse interaction',
      particlesMouseRepelHint: 'When on, the mouse repels nearby particles.',
      emittersLabel: 'Custom physics emitters',
      addEmitterBtn: 'Add emitter',
      clearEmittersBtn: 'Clear',
      emittersHint: 'Place and drag on the page; click to toggle emitting on/off; double-click a blank area to create one.',
      emittersCleared: 'All physics emitters cleared',
      emitterAdded: 'Physics emitter added; drag to move or click to toggle emitting',
      emitterRemoved: 'Physics emitter removed',
      emitterPaused: 'Emitter paused',
      emitterResumed: 'Emitter resumed',
      addGravitySourceBtn: 'Add gravity source',
      gravitySourceLabel: 'Gravity source',
      gravitySourceAdded: 'Gravity source added; drag to move or click to adjust ring & gravity',
      gravitySourceRemoved: 'Gravity source removed',
      gravitySourcesCleared: 'All gravity sources cleared',
      diagRun: 'Diagnose network',
      diagFix: 'Fix issues',
      diagFixedToast: 'Repair finished. See the diagnosis below.',
      diagCoreRunning: 'Core is running',
      diagCoreStopped: 'Core is not running',
      diagPortsOk: 'Proxy ports listening (HTTP {http} / SOCKS {socks})',
      diagPortsDown: 'Proxy ports not listening (HTTP {http} / SOCKS {socks})',
      diagProxyOk: 'System proxy points to 127.0.0.1:{port} and matches the core',
      diagProxyResidual: 'Leftover system proxy: still points to 127.0.0.1:{port} but the core is stopped — connections will be refused (ECONNREFUSED)',
      diagProxyExternal: 'System proxy is set by another app ({target}); left untouched',
      diagProxyOff: 'System proxy is off (direct connections)',
      diagVscodeProxyOk: 'No leftover proxy env in VS Code extension hosts',
      diagVscodeProxyResidual: 'Detected {procs} VS Code extension-host process(es) still holding proxy vars (HTTP_PROXY/HTTPS_PROXY/ALL_PROXY) pointing to 127.0.0.1:{port}; their network requests will fail. A full quit & relaunch of VS Code is required — reloading the window is not enough.',
      diagVscodeRepairHint: 'Note: port {port} is closed but VS Code extension hosts still cache proxy vars. Fully quit and relaunch VS Code (reloading the window is not enough).',
      diagPathOk: 'Proxy path OK (test site returned {code})',
      diagPathFail: 'Proxy path failed ({code}); check node and config',
      diagPathSkipped: 'Proxy port not listening; path test skipped',
      diagDirectOk: 'Direct connection OK (returned {code})',
      diagDirectFail: 'Direct connection failed or blocked ({code}); blocked domains need the proxy',
      diagTunOn: 'TUN mode is enabled',
      diagFixedProxyResidual: 'Fixed: leftover system proxy reset to direct (was 127.0.0.1:{port})',
      diagFixedProxySetting: 'Fixed: stale system proxy setting disabled',
      pathsDataDir: 'Data directory',
      pathsConfigFile: 'Config file',
      pathsControlApi: 'Control API'
    }
  };

  function t(key, params) {
    const language = state.language === 'en' ? 'en' : 'zh-CN';
    let text = (messages[language] && messages[language][key]) || messages['zh-CN'][key] || key;
    if (params && typeof params === 'object') {
      for (const [name, value] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
      }
    }
    return text;
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
    let html;
    if (!rows.length) {
      html = `<div class="node-empty">${t('noRows')}</div>`;
    } else {
      html = rows
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
    // 差量更新：内容未变化时不重写 DOM，避免点击按钮后整屏“重置”
    if (list.innerHTML === html) {
      return;
    }
    list.innerHTML = html;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderDiagnostics(diagnosis) {
    const list = $('#diagnosticsList');
    if (!list) {
      return;
    }
    const items = diagnosis && Array.isArray(diagnosis.items) ? diagnosis.items : [];
    if (!items.length) {
      list.hidden = true;
      return;
    }
    list.hidden = false;
    list.innerHTML = items.map(item => `<li class="diag-item diag-${item.level}">${escapeHtml(t(item.key, item.params))}</li>`).join('');
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
    const glassEnabled = settings.glassEnabled !== false;
    document.body.classList.toggle('glass-off', !glassEnabled);
    const glassBlur = typeof settings.glassBlur === 'number' ? settings.glassBlur : 1;
    document.body.style.setProperty('--glass-blur', `${Math.round(glassBlur * 20)}px`);
    document.body.style.setProperty('--glass-saturate', `${Math.round(100 + glassBlur * 40)}%`);
    const glassToggle = $('#glassEnabled');
    if (glassToggle && document.activeElement !== glassToggle) {
      glassToggle.checked = glassEnabled;
    }
    const blurInput = $('#glassBlur');
    if (blurInput && document.activeElement !== blurInput) {
      blurInput.value = String(Math.round(glassBlur * 100));
    }
    const blurValue = $('#glassBlurValue');
    if (blurValue) {
      blurValue.textContent = `${Math.round(glassBlur * 100)}%`;
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
    const ringRadius = typeof settings.ringRadius === 'number' ? settings.ringRadius : 110;
    const ringInput = $('#particlesRingRadius');
    if (ringInput && document.activeElement !== ringInput) {
      ringInput.value = String(Math.round(ringRadius));
    }
    const ringValue = $('#ringRadiusValue');
    if (ringValue) {
      ringValue.textContent = String(Math.round(ringRadius));
    }
    const bounce = settings.bounce === true;
    const bounceInput = $('#particlesBounce');
    if (bounceInput && document.activeElement !== bounceInput) {
      bounceInput.checked = bounce;
    }
    const mouseRepel = settings.mouseRepel === true;
    const mouseRepelInput = $('#particlesMouseRepel');
    if (mouseRepelInput && document.activeElement !== mouseRepelInput) {
      mouseRepelInput.checked = mouseRepel;
    }
    const gravity = typeof settings.gravity === 'number' ? settings.gravity : 1;
    const gravityInput = $('#particlesGravity');
    if (gravityInput && document.activeElement !== gravityInput) {
      gravityInput.value = String(Math.round(gravity * 100));
    }
    const gravityValue = $('#gravityValue');
    if (gravityValue) {
      gravityValue.textContent = `${gravity.toFixed(1)}×`;
    }
    const coreDir = settings.coreDir === 'cw' || settings.coreDir === 'random' ? settings.coreDir : 'ccw';
    const coreDirRow = $('#coreDirRow');
    if (coreDirRow) {
      coreDirRow.querySelectorAll('.dir-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.dir === coreDir);
      });
    }
    if (window.silverVpnParticles) {
      window.silverVpnParticles.apply({ enabled: particlesEnabled, intensity: particlesIntensity, ringRadius, gravity, coreDir, bounce, mouseRepel });
    }
    $$('.theme-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.theme === theme);
    });
    if (settings.bgImage) {
      document.body.style.setProperty('--user-bg', `url("${settings.bgImage}")`);
    } else {
      document.body.style.removeProperty('--user-bg');
    }
    // 恢复自定义物理发射源
    if (Array.isArray(settings.particlesEmitters)) {
      loadEmitters(settings.particlesEmitters);
    }
    // 恢复自定义引力源
    if (Array.isArray(settings.gravitySources)) {
      loadGravitySources(settings.gravitySources);
    }
    // 恢复引力核心位置
    if (settings.gravityCore && typeof settings.gravityCore.x === 'number' && typeof settings.gravityCore.y === 'number') {
      loadGravityCore(settings.gravityCore);
    }
  }

  // ===== 自定义物理发射源：页面 DOM 节点，可放置/拖动，持续按启动物理规律喷粒子 =====
  const emitterLayer = document.getElementById('emitterLayer');
  let emitterCount = 0;
  const DRAG_THRESHOLD = 4;

  // 生成唯一 id
  function emitterId() {
    emitterCount += 1;
    return `em-${Date.now()}-${emitterCount}`;
  }

  // 将发射源坐标写回 DOM（相对 emitterLayer 视口）
  function positionEmitter(node, x, y) {
    const layerRect = emitterLayer ? emitterLayer.getBoundingClientRect() : { left: 0, top: 0 };
    node.style.left = `${Math.round(x)}px`;
    node.style.top = `${Math.round(y)}px`;
    // 记录相对坐标（0~1），用于窗口缩放后恢复
    node.dataset.rx = String(x / window.innerWidth);
    node.dataset.ry = String(y / window.innerHeight);
    if (window.silverVpnParticles) {
      window.silverVpnParticles.refreshEmitters();
    }
  }

  // 切换发射源喷射开/关
  function toggleEmitter(node) {
    const wasEmitting = node.dataset.emitting !== '0';
    const next = !wasEmitting;
    node.dataset.emitting = next ? '1' : '0';
    node.classList.toggle('emitting-off', !next);
    saveEmitters();
    toast(next ? t('emitterResumed') : t('emitterPaused'));
  }

  // 创建发射源节点
  function createEmitterNode(opts = {}) {
    if (!emitterLayer) {
      return null;
    }
    const node = document.createElement('div');
    node.className = 'emitter-node';
    node.dataset.id = opts.id || emitterId();
    // 喷射开关：默认开启（"0" 表示关闭）
    const initialEmitting = opts.emitting !== false;
    node.dataset.emitting = initialEmitting ? '1' : '0';
    if (!initialEmitting) {
      node.classList.add('emitting-off');
    }
    node.title = t('emittersLabel');
    const label = document.createElement('span');
    label.className = 'emitter-label';
    label.textContent = '✦';
    const remove = document.createElement('button');
    remove.className = 'emitter-remove';
    remove.type = 'button';
    remove.title = t('emitterRemoved');
    remove.setAttribute('aria-label', t('emitterRemoved'));
    remove.textContent = '×';
    node.appendChild(label);
    node.appendChild(remove);

    // 拖动：mousedown 开始；位移超过阈值视为拖动，否则点按
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    node.addEventListener('mousedown', event => {
      event.preventDefault();
      event.stopPropagation();
      dragging = true;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      const layerRect = emitterLayer.getBoundingClientRect();
      startLeft = parseFloat(node.style.left) || (node.getBoundingClientRect().left - layerRect.left);
      startTop = parseFloat(node.style.top) || (node.getBoundingClientRect().top - layerRect.top);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
    const onMove = event => {
      if (!dragging) {
        return;
      }
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
        return;
      }
      moved = true;
      node.classList.add('dragging');
      const nx = Math.max(0, Math.min(window.innerWidth, startLeft + dx));
      const ny = Math.max(0, Math.min(window.innerHeight, startTop + dy));
      positionEmitter(node, nx, ny);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      node.classList.remove('dragging');
      dragging = false;
      if (moved) {
        saveEmitters();
      } else {
        // 点击（未拖动）：切换喷射开/关
        toggleEmitter(node);
      }
    };
    remove.addEventListener('click', event => {
      event.stopPropagation();
      node.remove();
      saveEmitters();
      toast(t('emitterRemoved'));
    });

    // 默认放置：视图中心附近
    const x = typeof opts.x === 'number' ? opts.x : window.innerWidth * 0.5 + (Math.random() - 0.5) * 120;
    const y = typeof opts.y === 'number' ? opts.y : window.innerHeight * 0.4 + (Math.random() - 0.5) * 120;
    emitterLayer.appendChild(node);
    positionEmitter(node, x, y);
    return node;
  }

  // 收集所有发射源的相对坐标
  function collectEmitters() {
    if (!emitterLayer) {
      return [];
    }
    return Array.from(emitterLayer.querySelectorAll('.emitter-node'))
      .map(node => {
        const rx = Number(node.dataset.rx);
        const ry = Number(node.dataset.ry);
        // 相对坐标存为 {x,y} 0~1，附带喷射开关状态
        return {
          id: node.dataset.id,
          x: Number.isFinite(rx) ? rx : 0.5,
          y: Number.isFinite(ry) ? ry : 0.5,
          emitting: node.dataset.emitting !== '0'
        };
      });
  }

  // 保存发射源到设置
  function saveEmitters() {
    const emitters = collectEmitters();
    state.dashboard.settings.particlesEmitters = emitters;
    callAction('set-appearance', { particlesEmitters: emitters }, '');
  }

  // 从设置加载发射源（相对坐标 -> 视口坐标）
  // 幂等：仅当发射源层为空（初次）时才加载，避免拖动/设置更新时重建已存在节点
  function loadEmitters(list) {
    if (!emitterLayer) {
      return;
    }
    const existing = emitterLayer.querySelectorAll('.emitter-node').length;
    if (existing > 0) {
      return;
    }
    const items = Array.isArray(list) ? list : [];
    if (!items.length) {
      return;
    }
    for (const item of items) {
      const x = (Number(item.x) || 0.5) * window.innerWidth;
      const y = (Number(item.y) || 0.5) * window.innerHeight;
      createEmitterNode({ id: item.id, x, y, emitting: item.emitting !== false });
    }
  }

  function clearEmitters() {
    if (!emitterLayer) {
      return;
    }
    emitterLayer.querySelectorAll('.emitter-node').forEach(node => node.remove());
    state.dashboard.settings.particlesEmitters = [];
    callAction('set-appearance', { particlesEmitters: [] }, '');
    toast(t('emittersCleared'));
    if (window.silverVpnParticles) {
      window.silverVpnParticles.refreshEmitters();
    }
  }

  // ===== 自定义引力源：可放置/拖动的迷你黑洞，点击弹出面板调节引力大小 =====
  let gravitySourceCount = 0;

  function gravitySourceId() {
    gravitySourceCount += 1;
    return `gs-${Date.now()}-${gravitySourceCount}`;
  }

  function positionGravitySource(node, x, y) {
    node.style.left = `${Math.round(x)}px`;
    node.style.top = `${Math.round(y)}px`;
    node.dataset.rx = String(x / window.innerWidth);
    node.dataset.ry = String(y / window.innerHeight);
    if (window.silverVpnParticles) {
      window.silverVpnParticles.refreshGravitySources();
    }
  }

  // 创建引力源节点（含调节面板：星环半径 + 引力大小，星环 0 = 黑洞）
  function createGravitySourceNode(opts = {}) {
    if (!emitterLayer) {
      return null;
    }
    const node = document.createElement('div');
    node.className = 'gravity-source-node';
    node.dataset.id = opts.id || gravitySourceId();
    node.dataset.ring = String(typeof opts.ringRadius === 'number' ? opts.ringRadius : 110);
    node.dataset.gravity = String(typeof opts.gravity === 'number' ? opts.gravity : 1);
    node.dataset.dir = opts.dir === 'cw' || opts.dir === 'ccw' ? opts.dir : 'random';
    node.title = t('gravitySourceLabel');

    const core = document.createElement('span');
    core.className = 'gs-core';
    core.textContent = '◉';
    const remove = document.createElement('button');
    remove.className = 'gs-remove';
    remove.type = 'button';
    remove.setAttribute('aria-label', t('gravitySourceRemoved'));
    remove.textContent = '×';
    node.appendChild(core);
    node.appendChild(remove);

    // 调节面板（点击后展开）
    const panel = document.createElement('div');
    panel.className = 'gs-panel';
    panel.hidden = true;
    const ringLabel = document.createElement('label');
    ringLabel.className = 'gs-field-label';
    ringLabel.innerHTML = `<span>${t('ringRadiusLabel')}</span><span class="gs-ring-val">${node.dataset.ring}</span>`;
    const ringInput = document.createElement('input');
    ringInput.type = 'range';
    ringInput.min = '0';
    ringInput.max = '250';
    ringInput.step = '5';
    ringInput.value = node.dataset.ring;
    const gravityLabel = document.createElement('label');
    gravityLabel.className = 'gs-field-label';
    gravityLabel.innerHTML = `<span>${t('gravityLabel')}</span><span class="gs-gravity-val">${(Number(node.dataset.gravity)).toFixed(1)}×</span>`;
    const gravityInput = document.createElement('input');
    gravityInput.type = 'range';
    gravityInput.min = '0';
    gravityInput.max = '1000';
    gravityInput.step = '10';
    gravityInput.value = String(Math.round(Number(node.dataset.gravity) * 100));
    panel.appendChild(ringLabel);
    panel.appendChild(ringInput);
    panel.appendChild(gravityLabel);
    panel.appendChild(gravityInput);
    // 公转方向选择（顺时针 / 逆时针 / 随机）
    const dirLabel = document.createElement('label');
    dirLabel.className = 'gs-field-label';
    dirLabel.innerHTML = `<span>${t('spinDirLabel')}</span>`;
    const dirRow = document.createElement('div');
    dirRow.className = 'gs-dir-row';
    ['ccw', 'cw', 'random'].forEach(value => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gs-dir-btn';
      btn.dataset.dir = value;
      btn.textContent = t(`spinDir_${value}`);
      btn.classList.toggle('active', node.dataset.dir === value);
      btn.addEventListener('click', () => {
        node.dataset.dir = value;
        dirRow.querySelectorAll('.gs-dir-btn').forEach(b => b.classList.toggle('active', b.dataset.dir === value));
        if (window.silverVpnParticles) {
          window.silverVpnParticles.refreshGravitySources();
        }
        saveGravitySources();
      });
      dirRow.appendChild(btn);
    });
    panel.appendChild(dirLabel);
    panel.appendChild(dirRow);
    node.appendChild(panel);

    // 调节滑块实时更新
    ringInput.addEventListener('input', () => {
      node.dataset.ring = ringInput.value;
      ringLabel.querySelector('.gs-ring-val').textContent = ringInput.value;
      if (window.silverVpnParticles) {
        window.silverVpnParticles.refreshGravitySources();
      }
    });
    ringInput.addEventListener('change', () => saveGravitySources());
    gravityInput.addEventListener('input', () => {
      const val = Number(gravityInput.value) / 100;
      node.dataset.gravity = String(val);
      gravityLabel.querySelector('.gs-gravity-val').textContent = `${val.toFixed(1)}×`;
      if (window.silverVpnParticles) {
        window.silverVpnParticles.refreshGravitySources();
      }
    });
    gravityInput.addEventListener('change', () => saveGravitySources());

    // 拖动：mousedown 开始；位移超过阈值视为拖动，否则点击切换面板
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    node.addEventListener('mousedown', event => {
      // 点在调节面板内部（滑块/标签）时，不启动拖动，让面板控件正常交互
      if (event.target.closest('.gs-panel')) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      dragging = true;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      const layerRect = emitterLayer.getBoundingClientRect();
      startLeft = parseFloat(node.style.left) || (node.getBoundingClientRect().left - layerRect.left);
      startTop = parseFloat(node.style.top) || (node.getBoundingClientRect().top - layerRect.top);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
    const onMove = event => {
      if (!dragging) {
        return;
      }
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
        return;
      }
      moved = true;
      node.classList.add('dragging');
      const nx = Math.max(0, Math.min(window.innerWidth, startLeft + dx));
      const ny = Math.max(0, Math.min(window.innerHeight, startTop + dy));
      positionGravitySource(node, nx, ny);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      node.classList.remove('dragging');
      dragging = false;
      if (moved) {
        saveGravitySources();
      } else {
        // 点击（未拖动）：切换调节面板
        panel.hidden = !panel.hidden;
        if (!panel.hidden) {
          // 关闭其它引力源面板
          emitterLayer.querySelectorAll('.gravity-source-node .gs-panel').forEach(other => {
            if (other !== panel) {
              other.hidden = true;
            }
          });
        }
      }
    };
    remove.addEventListener('click', event => {
      event.stopPropagation();
      node.remove();
      saveGravitySources();
      toast(t('gravitySourceRemoved'));
    });

    // 默认放置：视图中心偏下
    const x = typeof opts.x === 'number' ? opts.x : window.innerWidth * 0.5 + (Math.random() - 0.5) * 160;
    const y = typeof opts.y === 'number' ? opts.y : window.innerHeight * 0.55 + (Math.random() - 0.5) * 120;
    emitterLayer.appendChild(node);
    positionGravitySource(node, x, y);
    return node;
  }

  function collectGravitySources() {
    if (!emitterLayer) {
      return [];
    }
    return Array.from(emitterLayer.querySelectorAll('.gravity-source-node'))
      .map(node => {
        const rx = Number(node.dataset.rx);
        const ry = Number(node.dataset.ry);
        return {
          id: node.dataset.id,
          x: Number.isFinite(rx) ? rx : 0.5,
          y: Number.isFinite(ry) ? ry : 0.5,
          ringRadius: Math.min(250, Math.max(0, node.dataset.ring === undefined ? 110 : Number(node.dataset.ring))),
          gravity: Math.min(10, Math.max(0, node.dataset.gravity === undefined ? 1 : Number(node.dataset.gravity))),
          dir: node.dataset.dir === 'cw' || node.dataset.dir === 'ccw' ? node.dataset.dir : 'random'
        };
      });
  }

  function saveGravitySources() {
    const sources = collectGravitySources();
    state.dashboard.settings.gravitySources = sources;
    callAction('set-appearance', { gravitySources: sources }, '');
  }

  function loadGravitySources(list) {
    if (!emitterLayer) {
      return;
    }
    const existing = emitterLayer.querySelectorAll('.gravity-source-node').length;
    if (existing > 0) {
      return;
    }
    const items = Array.isArray(list) ? list : [];
    for (const item of items) {
      const x = (Number(item.x) || 0.5) * window.innerWidth;
      const y = (Number(item.y) || 0.5) * window.innerHeight;
      createGravitySourceNode({
        id: item.id,
        x,
        y,
        ringRadius: Number.isFinite(Number(item.ringRadius)) ? Number(item.ringRadius) : 110,
        gravity: Number.isFinite(Number(item.gravity)) ? Number(item.gravity) : 1,
        dir: item.dir
      });
    }
  }

  function clearGravitySources() {
    if (!emitterLayer) {
      return;
    }
    emitterLayer.querySelectorAll('.gravity-source-node').forEach(node => node.remove());
    state.dashboard.settings.gravitySources = [];
    callAction('set-appearance', { gravitySources: [] }, '');
    toast(t('gravitySourcesCleared'));
    if (window.silverVpnParticles) {
      window.silverVpnParticles.refreshGravitySources();
    }
  }

  // ===== 引力核心：独立的可拖动黑洞引力源（HUD 光球），默认居中 =====
  const gravityCore = document.getElementById('gravityCore');
  const GRAVITY_DRAG_THRESHOLD = 4;
  const GRAVITY_HALF = 32; // 光球 64px 的一半

  // 将引力核心中心坐标写回 DOM（x/y 为中心点，记录 0~1 相对坐标用于缩放恢复）
  function positionGravityCore(cx, cy) {
    if (!gravityCore) {
      return;
    }
    gravityCore.style.left = `${Math.round(cx - GRAVITY_HALF)}px`;
    gravityCore.style.top = `${Math.round(cy - GRAVITY_HALF)}px`;
    gravityCore.style.margin = '0';
    gravityCore.dataset.rx = String(cx / window.innerWidth);
    gravityCore.dataset.ry = String(cy / window.innerHeight);
  }

  // 保存引力核心位置到设置
  function saveGravityCore() {
    if (!gravityCore) {
      return;
    }
    const rx = Number(gravityCore.dataset.rx);
    const ry = Number(gravityCore.dataset.ry);
    const pos = {
      x: Number.isFinite(rx) ? rx : 0.5,
      y: Number.isFinite(ry) ? ry : 0.5
    };
    state.dashboard.settings.gravityCore = pos;
    callAction('set-appearance', { gravityCore: pos }, '');
  }

  // 从设置加载引力核心位置（相对坐标 -> 视口坐标）
  function loadGravityCore(pos) {
    if (!gravityCore || !pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
      return;
    }
    positionGravityCore(pos.x * window.innerWidth, pos.y * window.innerHeight);
  }

  // 初始化引力核心拖动
  function initGravityCoreDrag() {
    if (!gravityCore) {
      return;
    }
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    gravityCore.addEventListener('mousedown', event => {
      event.preventDefault();
      event.stopPropagation();
      dragging = true;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      const rect = gravityCore.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
    const onMove = event => {
      if (!dragging) {
        return;
      }
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < GRAVITY_DRAG_THRESHOLD) {
        return;
      }
      moved = true;
      gravityCore.classList.add('dragging');
      // 中心坐标：初始中心 = startLeft + GRAVITY_HALF，加上位移
      const nx = Math.max(GRAVITY_HALF, Math.min(window.innerWidth - GRAVITY_HALF, startLeft + GRAVITY_HALF + dx));
      const ny = Math.max(GRAVITY_HALF, Math.min(window.innerHeight - GRAVITY_HALF, startTop + GRAVITY_HALF + dy));
      positionGravityCore(nx, ny);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      gravityCore.classList.remove('dragging');
      dragging = false;
      if (moved) {
        saveGravityCore();
      }
    };
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
    // 独立的引力核心（可拖动黑洞）同步状态 class
    const gravityCore = $('#gravityCore');
    if (gravityCore) {
      gravityCore.classList.toggle('is-on', Boolean(core.running));
      gravityCore.classList.toggle('is-off', !core.running);
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
    let html;
    if (!profiles.length) {
      html = `<span class="profile-empty">${t('profileEmpty')}</span>`;
    } else {
      html = profiles
        .map(profile => {
          const active = profile.id === currentId;
          return `<button class="profile-tab${active ? ' active' : ''}" data-id="${escapeHtml(profile.id)}" type="button" title="${escapeHtml(profile.name || '')}">${escapeHtml(profile.name || profile.kind || profile.id)}</button>`;
        })
        .join('');
    }
    // 差量更新：内容未变化时不重写 DOM
    if (tabs.innerHTML === html) {
      return;
    }
    tabs.innerHTML = html;
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
    // 幂等：状态未变化时不重启定时器（renderDashboard 每次都会调用）
    if (state.monitorCollapsed === collapsed) {
      return;
    }
    state.monitorCollapsed = collapsed;
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

  // 轻量操作：不触发全屏 loading 遮罩，避免点击后整个界面“闪一下”
  const LIGHT_ACTIONS = new Set([
    'set-appearance',
    'set-language',
    'set-mode',
    'switch-proxy',
    'switch-profile',
    'rename-profile',
    'delete-profile',
    'set-bypass-hosts',
    'set-ports',
    'check-delays',
    'network-diagnostics',
    'fix-network',
    'dismiss-update'
  ]);

  async function callAction(action, payload, successMessage) {
    const light = LIGHT_ACTIONS.has(action);
    if (!light) {
      setLoading(true);
    }
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
      if (!light) {
        setLoading(false);
      }
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
    $('#runDiagnostics').addEventListener('click', async () => {
      const button = $('#runDiagnostics');
      if (button) button.disabled = true;
      try {
        const result = await callAction('network-diagnostics', {});
        renderDiagnostics(result && result.diagnosis);
      } catch (_error) {
        // callAction 已提示错误
      } finally {
        if (button) button.disabled = false;
      }
    });
    $('#fixNetwork').addEventListener('click', async () => {
      try {
        const result = await callAction('fix-network', {});
        renderDiagnostics(result && result.diagnosis);
        toast(t('diagFixedToast'));
        // 若有"需完整重启 VS Code"的提示，追加提醒
        const notes = result && result.notes;
        if (notes && notes.length) {
          setTimeout(() => {
            toast(notes.map(note => t(note.key, note.params)).join(' '));
          }, 400);
        }
      } catch (_error) {
        // callAction 已提示错误
      }
    });
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
    $('#glassEnabled').addEventListener('change', event => {
      const enabled = event.target.checked;
      document.body.classList.toggle('glass-off', !enabled);
      callAction('set-appearance', { glassEnabled: enabled }, t('appearanceSaved'));
    });
    $('#glassBlur').addEventListener('input', event => {
      const blur = Number(event.target.value) / 100;
      document.body.style.setProperty('--glass-blur', `${Math.round(blur * 20)}px`);
      document.body.style.setProperty('--glass-saturate', `${Math.round(100 + blur * 40)}%`);
      const value = $('#glassBlurValue');
      if (value) {
        value.textContent = `${event.target.value}%`;
      }
    });
    $('#glassBlur').addEventListener('change', event => {
      callAction('set-appearance', { glassBlur: Number(event.target.value) / 100 }, t('appearanceSaved'));
    });
    $('#particlesEnabled').addEventListener('change', event => {
      const enabled = event.target.checked;
      if (window.silverVpnParticles) {
        window.silverVpnParticles.apply({ enabled });
      }
      callAction('set-appearance', { particlesEnabled: enabled }, t('appearanceSaved'));
    });
    $('#particlesBounce').addEventListener('change', event => {
      const bounce = event.target.checked;
      if (window.silverVpnParticles) {
        window.silverVpnParticles.apply({ bounce });
      }
      callAction('set-appearance', { bounce }, t('appearanceSaved'));
    });
    $('#particlesMouseRepel').addEventListener('change', event => {
      const mouseRepel = event.target.checked;
      if (window.silverVpnParticles) {
        window.silverVpnParticles.apply({ mouseRepel });
      }
      callAction('set-appearance', { mouseRepel }, t('appearanceSaved'));
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
    const ringRadiusInput = $('#particlesRingRadius');
    if (ringRadiusInput) {
      ringRadiusInput.addEventListener('input', event => {
        const value = Number(event.target.value);
        if (window.silverVpnParticles) {
          window.silverVpnParticles.apply({ ringRadius: value });
        }
        const label = $('#ringRadiusValue');
        if (label) {
          label.textContent = String(Math.round(value));
        }
      });
      ringRadiusInput.addEventListener('change', event => {
        callAction('set-appearance', { ringRadius: Number(event.target.value) }, t('appearanceSaved'));
      });
    }
    const gravityInput = $('#particlesGravity');
    if (gravityInput) {
      gravityInput.addEventListener('input', event => {
        const value = Number(event.target.value) / 100;
        if (window.silverVpnParticles) {
          window.silverVpnParticles.apply({ gravity: value });
        }
        const label = $('#gravityValue');
        if (label) {
          label.textContent = `${value.toFixed(1)}×`;
        }
      });
      gravityInput.addEventListener('change', event => {
        callAction('set-appearance', { gravity: Number(event.target.value) / 100 }, t('appearanceSaved'));
      });
    }
    // 核心源旋转方向选择
    const coreDirRow = $('#coreDirRow');
    if (coreDirRow) {
      coreDirRow.querySelectorAll('.dir-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const dir = btn.dataset.dir;
          coreDirRow.querySelectorAll('.dir-btn').forEach(b => b.classList.toggle('active', b === btn));
          if (window.silverVpnParticles) {
            window.silverVpnParticles.apply({ coreDir: dir });
          }
          callAction('set-appearance', { coreDir: dir }, t('appearanceSaved'));
        });
      });
    }

    // 自定义物理发射源/引力源：添加/清空，双击页面空白处创建发射源
    const addEmitterBtn = $('#addEmitter');
    if (addEmitterBtn) {
      addEmitterBtn.addEventListener('click', () => {
        createEmitterNode();
        saveEmitters();
        toast(t('emitterAdded'));
      });
    }
    const addGravitySourceBtn = $('#addGravitySource');
    if (addGravitySourceBtn) {
      addGravitySourceBtn.addEventListener('click', () => {
        createGravitySourceNode();
        saveGravitySources();
        toast(t('gravitySourceAdded'));
      });
    }
    const clearEmittersBtn = $('#clearEmitters');
    if (clearEmittersBtn) {
      clearEmittersBtn.addEventListener('click', () => {
        clearEmitters();
        clearGravitySources();
      });
    }
    document.addEventListener('dblclick', event => {
      // 双击空白处（避开交互控件/发射源/引力源自身）创建发射源
      const target = event.target;
      if (!target || target.closest('.emitter-node') || target.closest('.gravity-source-node') || target.closest('#gravityCore') || target.closest('button, input, select, a, textarea, .panel, .topbar')) {
        return;
      }
      const x = event.clientX;
      const y = event.clientY;
      createEmitterNode({ x, y });
      saveEmitters();
      toast(t('emitterAdded'));
    });
    // 初始化引力核心拖动
    initGravityCoreDrag();
    // 窗口缩放：按相对坐标重新定位发射源/引力源/引力核心，避免拖出屏幕边界
    window.addEventListener('resize', () => {
      if (emitterLayer) {
        emitterLayer.querySelectorAll('.emitter-node').forEach(node => {
          const rx = (Number(node.dataset.rx) || 0.5) * window.innerWidth;
          const ry = (Number(node.dataset.ry) || 0.5) * window.innerHeight;
          positionEmitter(node, rx, ry);
        });
        emitterLayer.querySelectorAll('.gravity-source-node').forEach(node => {
          const rx = (Number(node.dataset.rx) || 0.5) * window.innerWidth;
          const ry = (Number(node.dataset.ry) || 0.5) * window.innerHeight;
          positionGravitySource(node, rx, ry);
        });
      }
      if (gravityCore) {
        const rx = (Number(gravityCore.dataset.rx) || 0.5) * window.innerWidth;
        const ry = (Number(gravityCore.dataset.ry) || 0.5) * window.innerHeight;
        positionGravityCore(rx, ry);
      }
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
        glassBlur: 1,
        glassEnabled: true,
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
    if (action === 'network-diagnostics') {
      return { diagnosis: { items: [{ level: 'ok', key: 'diagCoreRunning' }, { level: 'ok', key: 'diagPortsOk', params: { http: 4780, socks: 4781 } }, { level: 'info', key: 'diagProxyOff' }], residual: false } };
    }
    if (action === 'fix-network') {
      return { diagnosis: { items: [{ level: 'ok', key: 'diagCoreRunning' }, { level: 'ok', key: 'diagPortsOk', params: { http: 4780, socks: 4781 } }, { level: 'info', key: 'diagProxyOff' }], residual: false } };
    }
    if (action === 'set-appearance') {
      Object.assign(state.dashboard.settings, {
        theme: payload.theme || state.dashboard.settings.theme,
        bgImage: typeof payload.bgImage === 'string' ? payload.bgImage : state.dashboard.settings.bgImage,
        glassOpacity: typeof payload.glassOpacity === 'number' ? payload.glassOpacity : state.dashboard.settings.glassOpacity,
        glassBlur: typeof payload.glassBlur === 'number' ? payload.glassBlur : state.dashboard.settings.glassBlur,
        glassEnabled: typeof payload.glassEnabled === 'boolean' ? payload.glassEnabled : state.dashboard.settings.glassEnabled,
        particlesEnabled: typeof payload.particlesEnabled === 'boolean' ? payload.particlesEnabled : state.dashboard.settings.particlesEnabled,
        particlesIntensity: typeof payload.particlesIntensity === 'number' ? payload.particlesIntensity : state.dashboard.settings.particlesIntensity,
        ringRadius: typeof payload.ringRadius === 'number' ? payload.ringRadius : state.dashboard.settings.ringRadius,
        gravity: typeof payload.gravity === 'number' ? payload.gravity : state.dashboard.settings.gravity,
        coreDir: typeof payload.coreDir === 'string' ? payload.coreDir : state.dashboard.settings.coreDir,
        bounce: typeof payload.bounce === 'boolean' ? payload.bounce : state.dashboard.settings.bounce,
        mouseRepel: typeof payload.mouseRepel === 'boolean' ? payload.mouseRepel : state.dashboard.settings.mouseRepel,
        gravityCore: payload.gravityCore && typeof payload.gravityCore.x === 'number' ? payload.gravityCore : state.dashboard.settings.gravityCore,
        particlesEmitters: Array.isArray(payload.particlesEmitters) ? payload.particlesEmitters : state.dashboard.settings.particlesEmitters,
        gravitySources: Array.isArray(payload.gravitySources) ? payload.gravitySources : state.dashboard.settings.gravitySources,
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
      return { checked: true, currentVersion: '0.2.0', latestVersion: '0.3.0', available: true, dismissed: false };
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
