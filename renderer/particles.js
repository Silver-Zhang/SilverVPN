/* SilverVPN 全局粒子背景：随机飞行 + 鼠标排斥（水纹推开） */
(function () {
  'use strict';

  const canvas = document.getElementById('particleLayer');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let dpr = 1;
  const particles = [];
  const mouse = { x: -9999, y: -9999 };

  // 用户配置：开关 + 强度 + 内部速度基准 + 星环半径 + 引力大小 + 公转方向 + 边缘反弹 + 鼠标排斥
  const cfg = { enabled: true, intensity: 0.6, speed: 1, ringRadius: 110, gravity: 1, coreDir: 'ccw', bounce: false, mouseRepel: false };
  let rafId = 0;
  let running = false;
  // 窗口隐藏（关闭到托盘/最小化）时暂停渲染，节省 GPU/CPU 与内存；重新显示时恢复
  let suspended = false;

  // 核心状态机：运行 = 真实引力源（黑洞式吸积）；停止 = 红色 + 粒子全部吸走
  // 过渡：absorbing（红色把所有粒子吸入）→ off；releasing（从核心理出）→ on
  const core = { mode: 'on', emitCarry: 0, onGraceUntil: 0 };
  const HUD_CATCH_RADIUS = 30;
  const HUD_GLOW_RADIUS = 260;
  const MODE_COLOR = {
    on: { r: 52, g: 211, b: 153 },
    off: { r: 248, g: 113, b: 113 },
    absorbing: { r: 248, g: 113, b: 113 },
    releasing: { r: 52, g: 211, b: 153 }
  };

  function detectCoreMode() {
    const card = document.getElementById('kpiCoreCard');
    const on = Boolean(card && card.classList.contains('is-on') && !card.classList.contains('is-off'));
    return on ? 'on' : 'off';
  }

  function observeCoreState() {
    const card = document.getElementById('kpiCoreCard');
    if (!card) {
      return;
    }
    if (window.__silverVpnCoreObserver) {
      window.__silverVpnCoreObserver.disconnect();
    }
    const observer = new MutationObserver(() => {
      const next = detectCoreMode();
      if (next === core.mode) {
        return;
      }
      // 状态切换：先走过渡动画，再进入目标模式
      if (next === 'on') {
        core.mode = 'releasing';
        core.emitCarry = 0;
        core.releaseStartedAt = performance.now();
        // 从启动到稳定吸积：释放 5.2s + 无引力宽限 3s
        core.onGraceUntil = performance.now() + 8200;
      } else {
        core.mode = 'absorbing';
        core.absorbStartedAt = performance.now();
      }
    });
    observer.observe(card, { attributes: true, attributeFilter: ['class'] });
    window.__silverVpnCoreObserver = observer;
    core.mode = detectCoreMode();
    if (core.mode === 'off') {
      // 停止状态：外面一个粒子都不剩
      particles.length = 0;
    }
  }

  // HUD 能量核心（引力源）位置跟踪：黑洞式吸入粒子
  const hud = { x: -9999, y: -9999, active: false };

  // 自定义物理发射源：页面上可放置/拖动的 DOM 节点，点击切换喷射开/关
  // 每个发射源 { id, x, y, nextEmitAt, emitting }，x/y 为 CSS 像素坐标，nextEmitAt 为下次喷射时间戳
  const MAX_PARTICLES = 260; // 全局粒子数硬上限（性能保护，发射源持续喷时按 FIFO 滚动替换）
  const emitters = [];

  // 自定义引力源：页面上可放置/拖动的 DOM 节点，各自有独立的星环半径、引力大小与公转方向
  // 每个引力源 { id, x, y, ringRadius, gravity, dir }，dir: 'ccw' | 'cw' | 'random'
  const gravitySources = [];

  function refreshGravitySources() {
    // 按 id 复用已有对象（保留参数与 dir），只更新位置与参数；新增/删除同步
    const nodes = document.querySelectorAll('.gravity-source-node');
    const next = [];
    for (const node of nodes) {
      const id = node.dataset.id || '';
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const ringRadius = Math.min(250, Math.max(0, node.dataset.ring === undefined ? 110 : Number(node.dataset.ring)));
      const gravity = Math.min(10, Math.max(0, node.dataset.gravity === undefined ? 1 : Number(node.dataset.gravity)));
      const dir = node.dataset.dir === 'cw' || node.dataset.dir === 'ccw' ? node.dataset.dir : 'random';
      const existing = gravitySources.find(gs => gs.id === id);
      if (existing) {
        existing.x = x;
        existing.y = y;
        existing.ringRadius = ringRadius;
        existing.gravity = gravity;
        existing.dir = dir;
        next.push(existing);
      } else {
        next.push({ id, x, y, ringRadius, gravity, dir });
      }
    }
    gravitySources.length = 0;
    for (const gs of next) {
      gravitySources.push(gs);
    }
  }

  function refreshEmitters() {
    // 按 id 复用已有发射源对象（保留 nextEmitAt 喷射节奏），只更新位置与开关状态；新增/删除同步
    const nodes = document.querySelectorAll('.emitter-node');
    const next = [];
    for (const node of nodes) {
      const id = node.dataset.id || '';
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const emitting = node.dataset.emitting !== '0'; // 默认开（"0" 为关）
      const existing = emitters.find(em => em.id === id);
      if (existing) {
        existing.x = x;
        existing.y = y;
        existing.active = true;
        existing.emitting = emitting;
        next.push(existing);
      } else {
        next.push({ id, x, y, active: true, emitting });
      }
    }
    emitters.length = 0;
    for (const em of next) {
      emitters.push(em);
    }
  }

  function updateHudAnchor() {
    const el = document.getElementById('gravityCore');
    if (!el) {
      hud.active = false;
      return;
    }
    const rect = el.getBoundingClientRect();
    hud.x = rect.left + rect.width / 2;
    hud.y = rect.top + rect.height / 2;
    hud.active = true;
  }

  // 核心源公转方向符号：ccw=+1，cw=-1，random=随机 ±1
  function coreDirSign() {
    if (cfg.coreDir === 'cw') {
      return -1;
    }
    if (cfg.coreDir === 'random') {
      return Math.random() < 0.5 ? 1 : -1;
    }
    return 1; // 默认 ccw 逆时针
  }

  function respawnParticle(particle) {
    // 落入核心后重新投放到星环轨道（赋予切向速度继续公转）；黑洞模式下投到较远处再被吸入
    const ringR = cfg.ringRadius;
    const p = params();
    const GM = 900 * p.gravityStrength * (cfg.gravity || 1);
    const angle = Math.random() * Math.PI * 2;
    const r = ringR > 0
      ? ringR * (0.85 + Math.random() * 0.3)
      : 150 + Math.random() * 150;
    const vOrbit = Math.sqrt(GM / Math.max(r, 20));
    // 公转方向遵循核心源配置
    const dir = coreDirSign();
    particle.x = hud.x + Math.cos(angle) * r;
    particle.y = hud.y + Math.sin(angle) * r;
    particle.vx = -Math.sin(angle) * vOrbit * dir;
    particle.vy = Math.cos(angle) * vOrbit * dir;
    particle.dir = dir;
    if (particle.x < 0 || particle.x > width || particle.y < 0 || particle.y > height) {
      particle.x = Math.random() * width;
      particle.y = Math.random() * height;
      particle.vx = 0;
      particle.vy = 0;
    }
  }

  // 星环引力模型（核心与自定义引力源共用）：
  // 星环模式（ringR>0）：带内强切向公转 + 弱径向维持轨道，带外径向拉回；星环半径可调
  // 黑洞模式（ringR=0）：纯向心引力，粒子被吸入核心
  // sx/sy 为引力源坐标，ringR 为星环半径，gravityMult 为引力大小倍率（0~10），ramp 为引力递进系数（0~1）
  // dir 为公转方向：'ccw' 逆时针（默认）、'cw' 顺时针、'random' 每个粒子随机
  function applyStarRingForce(particle, sx, sy, ringR, gravityMult, ramp, p, dir) {
    const dx = sx - particle.x;
    const dy = sy - particle.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.01) {
      return;
    }
    const nx = dx / dist;
    const ny = dy / dist;

    // 解析公转方向符号：ccw=+1，cw=-1，random=用粒子自身方向
    let dirSign = 1;
    if (dir === 'cw') {
      dirSign = -1;
    } else if (dir === 'random') {
      dirSign = (particle.dir === undefined || particle.dir >= 0) ? 1 : -1;
    }

    // 黑洞模式：星环半径为 0，强向心引力（平方衰减，近处更猛）把粒子吸入核心
    if (ringR <= 0) {
      const GM = 4000 * gravityMult * ramp;
      const accel = GM / (dist * dist + 1600);
      particle.vx += nx * accel;
      particle.vy += ny * accel;
      return;
    }

    const ringWidth = 55;                 // 星环带半宽
    const dr = dist - ringR;              // 距星环半径的偏移（正=外，负=内）
    const inBand = Math.abs(dr) < ringWidth;
    const falloff = Math.max(0, 1 - dist / p.gravityRadius);

    if (inBand) {
      // 星环带内：强切向公转（引力越强转越快），弱径向维持轨道
      const pull = 0.02 * falloff * ramp;
      const swirl = (0.6 + gravityMult * 0.4) * falloff * ramp * 1.6;
      particle.vx += nx * pull;
      particle.vy += ny * pull;
      particle.vx += -ny * swirl * dirSign;
      particle.vy += nx * swirl * dirSign;
    } else {
      // 带外：径向拉回星环轨道，弱切向诱导进入
      const pull = falloff * falloff * p.gravityStrength * gravityMult * ramp;
      const swirl = falloff * p.swirlStrength * 0.4 * ramp;
      particle.vx += nx * pull;
      particle.vy += ny * pull;
      particle.vx += -ny * swirl * dirSign;
      particle.vy += nx * swirl * dirSign;
    }
  }

  // 从指定点向外“吐”一个粒子：统一直径向甩出，力量随机分布（真实物理）
  // 关键：起点半径拉开、切向大幅减小、径向初速提高，避免粒子吐出后缠绕成一团
  // origin: { x, y } 发射点（默认为当前 HUD 核心）
  function emitParticle(speed, origin) {
    const ox = origin ? origin.x : hud.x;
    const oy = origin ? origin.y : hud.y;
    // 起点：宽半径环（36 ~ 58px），让刚喷出的粒子天然分散，不挤在同一轨道
    const angle = Math.random() * Math.PI * 2;
    const radius = HUD_CATCH_RADIUS + 6 + Math.random() * 22;
    const roll = Math.random();
    // 力量：多数中等向外（0.8~2.2），少数强力远喷射（2.6~4.2），形成明显远近层次
    const power = roll < 0.18
      ? 2.6 + Math.random() * 1.6        // 少量：强力喷射，飞得远
      : 0.8 + Math.random() * 1.4;       // 多数：中/近自然分布
    const radial = speed * 3.4 * power;  // 更高的向外初速，确保脱离核心
    // 切向大幅减弱：只保留少量“甩丝”感，防止粒子绕核缠绕聚集
    const dir = Math.random() < 0.5 ? 1 : -1; // 随机公转方向
    const tangential = radial * (0.14 + Math.random() * 0.22) * dir;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // 径向（向外）+ 少量切向（随机公转方向）
    const particle = {
      x: ox + cos * radius,
      y: oy + sin * radius,
      vx: cos * radial - sin * tangential,
      vy: sin * radial + cos * tangential,
      dir
    };
    particles.push(particle);
  }

  // 根据强度计算实际参数
  function params() {
    const k = cfg.intensity;
    return {
      count: Math.round(12 + 48 * k),
      radius: 1.0 + 0.5 * k,
      speed: (0.45 + 0.3 * k) * cfg.speed,
      pushRadius: 120 + 60 * k,
      pushForce: 0.95 + 0.2 * k,
      linkDist: 90 + 60 * k,
      linkAlpha: 0.32 + 0.22 * k,
      gravityRadius: 480 + 140 * k,
      gravityStrength: 0.5 + 0.25 * k,
      swirlStrength: 1.5 + 0.5 * k
    };
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawn(speed) {
    // 粒子投放到核心周围：
    // - 星环模式（ringR>0）：放在星环半径轨道附近，赋予切向速度形成公转环
    // - 黑洞模式（ringR=0）：从屏幕边缘投放，被向心引力吸向核心后吞噬
    const ringR = cfg.ringRadius;
    const cx = hud.active ? hud.x : width / 2;
    const cy = hud.active ? hud.y : height / 2;
    const angle = Math.random() * Math.PI * 2;

    if (ringR <= 0) {
      // 黑洞模式：从核心周围较近处投放，被强引力快速吸入吞噬
      const r = 180 + Math.random() * 320;
      return {
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        vx: 0,
        vy: 0
      };
    }

    // 星环模式：星环半径散布（带厚度），赋予圆形轨道切向速度自然公转
    const r = ringR * (0.7 + Math.random() * 0.7);
    const p = params();
    const GM = 900 * p.gravityStrength * (cfg.gravity || 1);
    const vOrbit = Math.sqrt(GM / Math.max(r, 20));
    // 公转方向遵循核心源配置
    const dir = coreDirSign();
    const vx = -Math.sin(angle) * vOrbit * dir;
    const vy = Math.cos(angle) * vOrbit * dir;
    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx,
      vy,
      dir
    };
  }

  function initParticles() {
    particles.length = 0;
    const { count, speed } = params();
    for (let index = 0; index < count; index += 1) {
      particles.push(spawn(speed));
    }
  }

  // 增量同步数量：只补足核心粒子下限，不截断（发射源喷出的粒子由 MAX_PARTICLES 滚动控制）
  function syncCount() {
    // 核心停止时外面不留粒子
    if (core.mode === 'off' || core.mode === 'absorbing') {
      return;
    }
    const { count, speed } = params();
    while (particles.length < count) {
      particles.push(spawn(speed));
    }
  }

  function themeColor() {
    const theme = document.body.dataset.theme;
    const light = theme === 'light' || theme === 'day' || theme === 'sunrise';
    const styles = window.getComputedStyle(document.body);
    const accent = styles.getPropertyValue('--accent-rgb').trim();
    const accent2 = styles.getPropertyValue('--accent2-rgb').trim();
    const parse = raw => {
      const parts = raw.split(',').map(value => Number(value.trim()));
      return parts.length === 3 && parts.every(Number.isFinite) ? parts : null;
    };
    const first = parse(accent) || [96, 165, 250];
    const second = parse(accent2) || [34, 211, 238];
    // 主色为主，辅色加入星轨连线，浅色主题微调更深的对比度
    const r = Math.round(first[0] * 0.72 + second[0] * 0.28);
    const g = Math.round(first[1] * 0.72 + second[1] * 0.28);
    const b = Math.round(first[2] * 0.72 + second[2] * 0.28);
    return { r, g, b, a: light ? 0.3 : 0.44 };
  }

  function glowColor() {
    const m = MODE_COLOR[core.mode] || MODE_COLOR.on;
    return { r: m.r, g: m.g, b: m.b, a: core.mode === 'off' ? 0 : 0.6 };
  }

  function particleColor() {
    // 吸收/释放过渡期间粒子用模式色（红/绿），稳定后回到主题色
    if (core.mode === 'absorbing' || core.mode === 'releasing') {
      const token = core.mode === 'absorbing' ? 'off' : 'on';
      return MODE_COLOR[token];
    }
    return null;
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const p = params();
    updateHudAnchor();

    // 吸积盘光效：核心周围一圈柔光（非 off 状态）
    if (hud.active && core.mode !== 'off' && hud.x > -100 && hud.x < width + 100 && hud.y > -100 && hud.y < height + 100) {
      const mc = glowColor();
      const glow = ctx.createRadialGradient(hud.x, hud.y, 0, hud.x, hud.y, HUD_GLOW_RADIUS * 0.7);
      glow.addColorStop(0, `rgba(${mc.r}, ${mc.g}, ${mc.b}, ${0.12 * mc.a})`);
      glow.addColorStop(0.55, `rgba(${mc.r}, ${mc.g}, ${mc.b}, ${0.04 * mc.a})`);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(hud.x, hud.y, HUD_GLOW_RADIUS * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // 星座连线：相邻粒子随机连成星轨，随距离渐隐
    const baseColor = themeColor();
    const transition = particleColor();
    ctx.lineWidth = 1;
    for (let i = 0; i < particles.length; i += 1) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j += 1) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < p.linkDist * p.linkDist) {
          const alpha = (1 - Math.sqrt(dist2) / p.linkDist) * p.linkAlpha * (transition ? 1 : baseColor.a);
          ctx.strokeStyle = `rgba(${(transition || baseColor).r}, ${(transition || baseColor).g}, ${(transition || baseColor).b}, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // 释放进度：从核心理出粒子（持续约 5 秒的喷射动作），达标且时间足够后进入运行模式
    if (core.mode === 'releasing' && hud.active) {
      const target = p.count;
      const releaseElapsed = performance.now() - (core.releaseStartedAt || 0);
      // 前 5 秒持续喷射；已经吐够数量且过了喷射期才切换回吸积模式
      // 提高喷射速率：让粒子更迅速从核心喷散开，避免启动瞬间聚成一团
      if (particles.length < target && releaseElapsed < 5200) {
        core.emitCarry += (0.9 + 0.4 * p.speed) + 0.5;
        while (core.emitCarry >= 1 && particles.length < target) {
          core.emitCarry -= 1;
          emitParticle(p.speed);
        }
      } else if (releaseElapsed > 5200) {
        core.mode = 'on';
        core.emitCarry = 0;
        if (!core.onGraceUntil) {
          core.onGraceUntil = performance.now() + 3000;
        }
      }
    }

    // 自定义发射源：核心运行时按固定节奏脉冲式向外喷射粒子（类似喷泉）
    // 每隔约 260ms 喷出一个粒子；点击发射源可切换喷射开/关，无喷射数量上限
    refreshEmitters();
    refreshGravitySources();

    // 黑洞模式：粒子被核心吞噬后，从屏幕边缘持续补充，维持粒子总量（黑洞源源不断吸入）
    if (cfg.ringRadius <= 0 && core.mode === 'on' && hud.active) {
      const target = p.count;
      if (particles.length < target) {
        particles.push(spawn(p.speed));
      }
    }

    // 仅在核心运行/释放时喷射；停止（absorbing/off）时停止喷射，否则吸收永远清不空
    if (emitters.length && (core.mode === 'on' || core.mode === 'releasing')) {
      const emitSpeed = p.speed * 1.5;   // 较高初速，让喷出的粒子明显向外飞
      const EMIT_INTERVAL = 260;         // 发射间隔（毫秒）
      const now = performance.now();
      for (const em of emitters) {
        if (!em.emitting) {
          continue;
        }
        if (em.nextEmitAt === undefined) {
          // 初次错开节奏，避免多个发射源同时喷
          em.nextEmitAt = now + Math.random() * EMIT_INTERVAL;
          continue;
        }
        if (now >= em.nextEmitAt) {
          em.nextEmitAt = now + EMIT_INTERVAL * (0.85 + Math.random() * 0.3);
          // 全局性能保护：达到上限时移除最老粒子（FIFO），保持持续喷射而不无限增长
          if (particles.length >= MAX_PARTICLES) {
            particles.shift();
          }
          emitParticle(emitSpeed, em);
        }
      }
    }

    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];

      // 鼠标排斥（水纹推开），可通过开关关闭
      if (cfg.mouseRepel) {
        const mdx = particle.x - mouse.x;
        const mdy = particle.y - mouse.y;
        const mdist2 = mdx * mdx + mdy * mdy;
        if (mdist2 < p.pushRadius * p.pushRadius && mdist2 > 0.01) {
          const dist = Math.sqrt(mdist2);
          const force = ((p.pushRadius - dist) / p.pushRadius) * p.pushForce;
          particle.vx += (mdx / dist) * force;
          particle.vy += (mdy / dist) * force;
        }
      }

      // 自定义发射源斥力：轻轻把靠近的粒子向外推开，配合喷射形成外扩喷流
      // 仅核心运行时生效；停止/吸收时关闭
      if (core.mode === 'on' || core.mode === 'releasing') {
        for (const em of emitters) {
          const edx = particle.x - em.x;   // 从发射源指向粒子的向量
          const edy = particle.y - em.y;
          const edist = Math.hypot(edx, edy);
          if (edist < 90 && edist > 0.01) {
            const enx = edx / edist;   // 向外单位向量
            const eny = edy / edist;
            const rFalloff = 1 - edist / 90;
            const rForce = rFalloff * 0.6;   // 微弱斥力，只推不吸
            particle.vx += enx * rForce;
            particle.vy += eny * rForce;
          }
        }
      }

      // 自定义引力源：对附近粒子施加星环引力（向心 + 公转 + 软约束），各自有独立星环半径与引力大小
      // 星环半径 0 = 小黑洞，纯向心吸入
      // 仅核心运行时生效；停止/吸收时关闭，避免拉住粒子导致核心回收不完
      if (gravitySources.length && (core.mode === 'on' || core.mode === 'releasing')) {
        for (const gs of gravitySources) {
          const gdx = particle.x - gs.x;
          const gdy = particle.y - gs.y;
          const gdist = Math.hypot(gdx, gdy);
          const reach = p.gravityRadius * (0.5 + gs.gravity * 0.55);
          if (gdist < reach && gdist > 0.01) {
            applyStarRingForce(particle, gs.x, gs.y, gs.ringRadius, gs.gravity, 1, p, gs.dir);
          }
        }
      }

      if (hud.active && hud.x > -100 && hud.x < width + 100 && hud.y > -100 && hud.y < height + 100) {
        const hdx = hud.x - particle.x;
        const hdy = hud.y - particle.y;
        const hdist = Math.hypot(hdx, hdy);
        const normX = hdx / (hdist || 1);
        const normY = hdy / (hdist || 1);

        if (core.mode === 'absorbing') {
          // 关闭：把所有粒子快速吸进来（红），靠近即吞噬
          const catchH = HUD_CATCH_RADIUS + p.radius;
          if (hdist < catchH) {
            particles.splice(index, 1);
            continue;
          }
          const pullRadius = p.gravityRadius * 1.6;
          const falloff = Math.max(0, 1 - hdist / pullRadius);
          const force = 2.4 * falloff + 0.08;
          particle.vx += normX * force;
          particle.vy += normY * force;
          particle.vx += -normY * force * 0.7;
          particle.vy += normX * force * 0.7;
          if (particles.length === 0) {
            core.mode = 'off';
          }
        } else if (core.mode === 'releasing') {
          // 开启：粒子被统一直径向甩出（无自转），力量大小决定远近
          // 真实物理：吐出后无持续外力，初速+阻尼自然衰减，远近完全由力量决定
          // 此处不再额外衰减速度（已由全局 damping 处理），避免喷射初速被压扁
        } else if (core.mode === 'on') {
          // 星环模型：向心引力 + 温和切向公转 + 径向软约束
          // 星环半径（cfg.ringRadius）与引力大小（cfg.gravity）均可调；星环 0 = 黑洞（吞噬粒子）
          const now = performance.now();
          const inGrace = now < core.onGraceUntil;
          // 黑洞模式：立即全引力（跳过启动宽限/递进）；星环模式：启动后 3s 宽限 + 9s 递进
          const ramp = cfg.ringRadius <= 0
            ? 1
            : (inGrace ? 0 : Math.min(1, (now - core.onGraceUntil) / 9000));
          if (cfg.ringRadius > 0 && inGrace) {
            // 星环模式宽限期：不施加任何核心力
          } else if (hdist < HUD_CATCH_RADIUS + p.radius) {
            // 星环模式：重新投放到星环轨道继续公转；黑洞模式：吞噬粒子（真正消失）
            if (cfg.ringRadius <= 0) {
              particles.splice(index, 1);
            } else {
              respawnParticle(particle);
            }
            continue;
          } else {
            // 引力作用范围随强度扩大：强度越高覆盖越远（10 时覆盖全屏）
            const g = cfg.gravity || 1;
            const reach = p.gravityRadius * (0.5 + g * 0.55);
            if (hdist < reach) {
              applyStarRingForce(particle, hud.x, hud.y, cfg.ringRadius, g, ramp, p, cfg.coreDir || 'ccw');
            }
          }
        }
      }

      const damping = core.mode === 'releasing' ? 0.992 : 0.984;
      particle.vx *= damping;
      particle.vy *= damping;
      const speed = Math.hypot(particle.vx, particle.vy);
      // 速度上限固定（数值稳定保护，防速度无限增长），与引力大小无关
      // 真实物理：引力大 → 所需轨道速度高 → 超过上限被截断 → 螺旋坠入（快速吸过来）
      const maxSpeed = core.mode === 'absorbing' ? 4 : core.mode === 'releasing' ? 9 : 2.4;
      if (speed > maxSpeed) {
        particle.vx *= maxSpeed / speed;
        particle.vy *= maxSpeed / speed;
      } else if (speed < 0.1) {
        particle.vx += (Math.random() - 0.5) * 0.05;
        particle.vy += (Math.random() - 0.5) * 0.05;
      }
      particle.x += particle.vx;
      particle.y += particle.vy;
      if (cfg.bounce) {
        // 边缘反弹：碰到边界反转速度，粒子留在画面内
        if (particle.x < 0) { particle.x = 0; particle.vx = -particle.vx; }
        else if (particle.x > width) { particle.x = width; particle.vx = -particle.vx; }
        if (particle.y < 0) { particle.y = 0; particle.vy = -particle.vy; }
        else if (particle.y > height) { particle.y = height; particle.vy = -particle.vy; }
      } else {
        // 穿墙：从另一侧穿出（循环）
        if (particle.x < -12) particle.x = width + 12;
        else if (particle.x > width + 12) particle.x = -12;
        if (particle.y < -12) particle.y = height + 12;
        else if (particle.y > height + 12) particle.y = -12;
      }

      const color = transition || baseColor;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${transition ? 0.5 : baseColor.a})`;
      ctx.fill();
    }
  }

  function loop() {
    if (!running) return;
    draw();
    rafId = window.requestAnimationFrame(loop);
  }

  function start() {
    if (running || !cfg.enabled) return;
    running = true;
    syncCount();
    rafId = window.requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    ctx.clearRect(0, 0, width, height);
  }

  // 暂停/恢复：仅停止动画循环，不清空粒子与核心状态；用于窗口隐藏/恢复
  function suspend() {
    if (suspended) return;
    suspended = true;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    running = false;
  }

  function resume() {
    if (!suspended) return;
    suspended = false;
    if (cfg.enabled && !running && !document.hidden) {
      start();
    }
  }

  function applyConfig(next) {
    if (typeof next.enabled === 'boolean') {
      cfg.enabled = next.enabled;
    }
    if (typeof next.intensity === 'number') {
      cfg.intensity = Math.min(1, Math.max(0.1, next.intensity));
    }
    if (typeof next.speed === 'number') {
      const previous = cfg.speed;
      cfg.speed = Math.min(10, Math.max(0, next.speed));
      // 已有粒子按倍率同步缩放速度（保留方向），避免只有新粒子变快
      if (previous !== cfg.speed) {
        const ratio = cfg.speed / previous;
        for (const particle of particles) {
          particle.vx *= ratio;
          particle.vy *= ratio;
        }
      }
    }
    if (typeof next.ringRadius === 'number') {
      cfg.ringRadius = Math.min(250, Math.max(0, next.ringRadius));
    }
    if (typeof next.gravity === 'number') {
      cfg.gravity = Math.min(10, Math.max(0, next.gravity));
    }
    if (typeof next.coreDir === 'string') {
      cfg.coreDir = next.coreDir === 'cw' || next.coreDir === 'random' ? next.coreDir : 'ccw';
    }
    if (typeof next.bounce === 'boolean') {
      cfg.bounce = next.bounce;
    }
    if (typeof next.mouseRepel === 'boolean') {
      cfg.mouseRepel = next.mouseRepel;
    }
    if (cfg.enabled) {
      syncCount();
      // 窗口不可见时不启动渲染循环；等 visibilitychange 恢复
      if (!document.hidden) {
        start();
      } else {
        suspended = true;
      }
    } else {
      stop();
    }
  }

  // 供渲染进程 UI 控制
  window.silverVpnParticles = {
    apply: applyConfig,
    isEnabled: () => cfg.enabled,
    getIntensity: () => cfg.intensity,
    getSpeed: () => cfg.speed,
    getRingRadius: () => cfg.ringRadius,
    getGravity: () => cfg.gravity,
    getCoreDir: () => cfg.coreDir,
    getBounce: () => cfg.bounce,
    getMouseRepel: () => cfg.mouseRepel,
    getMode: () => core.mode,
    getParticles: () => particles,
    refreshEmitters,
    refreshGravitySources
  };

  window.addEventListener('resize', () => {
    resize();
    initParticles();
  });
  window.addEventListener('scroll', updateHudAnchor, { passive: true });
  window.addEventListener('pointermove', event => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  window.addEventListener('pointerleave', () => {
    mouse.x = -9999;
    mouse.y = -9999;
  });
  // 窗口隐藏（关闭到托盘/最小化）时暂停粒子渲染，节省 GPU/内存；显示时恢复
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      suspend();
    } else {
      resize();
      resume();
    }
  });

  resize();
  observeCoreState();
  start();
})();
