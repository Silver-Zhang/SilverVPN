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

  // 用户配置：开关 + 强度（0.1 ~ 1）+ 速度倍率（0.2 ~ 2）
  const cfg = { enabled: true, intensity: 0.6, speed: 1 };
  let rafId = 0;
  let running = false;

  // 核心状态机：运行 = 绿色慢速吸积 + 星环；停止 = 红色 + 粒子全部吸走
  // 过渡：absorbing（红色把所有粒子吸入）→ off；releasing（从核心理出）→ on
  const core = { mode: 'on', emitCarry: 0, onGraceUntil: 0 };
  const HUD_CATCH_RADIUS = 30;
  const HUD_GLOW_RADIUS = 260;
  const RING_INNER = 42;
  const RING_OUTER = 150;
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

  function updateHudAnchor() {
    const el = document.querySelector('#kpiCoreCard .kpi-hud');
    const card = document.getElementById('kpiCoreCard');
    if (!el || !card) {
      hud.active = false;
      return;
    }
    const rect = el.getBoundingClientRect();
    hud.x = rect.left + rect.width / 2;
    hud.y = rect.top + rect.height / 2;
    hud.active = true;
  }

  function respawnParticle(particle) {
    const radius = HUD_GLOW_RADIUS * (1.5 + Math.random() * 0.8);
    const angle = Math.random() * Math.PI * 2;
    particle.x = hud.x + Math.cos(angle) * radius;
    particle.y = hud.y + Math.sin(angle) * radius;
    if (particle.x < 0 || particle.x > width || particle.y < 0 || particle.y > height) {
      particle.x = Math.random() * width;
      particle.y = Math.random() * height;
    }
  }

  // 从核心向外“吐”一个粒子：统一直径向甩出，力量随机分布（真实物理）
  // 力量：宽分布（0.1~1.6 均匀 + 20% 强烈喷射 2~3.2），形成明显的远近层次
  function emitParticle(speed) {
    const angle = Math.random() * Math.PI * 2;
    const radius = HUD_CATCH_RADIUS + 4 + Math.random() * 8;
    const roll = Math.random();
    const power = roll < 0.2
      ? 2 + Math.random() * 1.2          // 少量：强力喷射，飞得很远
      : 0.1 + Math.random() * 1.5;       // 多数：宽范围，近/中/远自然分布
    const radial = speed * 3.0 * power;
    const tangential = radial * (0.55 + Math.random() * 0.35);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // 径向（向外）+ 切向（统一公转方向）
    const particle = {
      x: hud.x + cos * radius,
      y: hud.y + sin * radius,
      vx: cos * radial - sin * tangential,
      vy: sin * radial + cos * tangential
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
      gravityRadius: 220 + 120 * k,
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
    let vx = (Math.random() - 0.5) * speed * 2;
    let vy = (Math.random() - 0.5) * speed * 2;
    const magnitude = Math.hypot(vx, vy) || 1;
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (vx / magnitude) * speed,
      vy: (vy / magnitude) * speed
    };
  }

  function initParticles() {
    particles.length = 0;
    const { count, speed } = params();
    for (let index = 0; index < count; index += 1) {
      particles.push(spawn(speed));
    }
  }

  // 增量同步数量：保留已有粒子，只新增或截断，避免位置瞬移
  function syncCount() {
    // 核心停止时外面不留粒子
    if (core.mode === 'off' || core.mode === 'absorbing') {
      return;
    }
    const { count, speed } = params();
    while (particles.length < count) {
      particles.push(spawn(speed));
    }
    if (particles.length > count) {
      particles.length = count;
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
      if (particles.length < target && releaseElapsed < 5200) {
        core.emitCarry += 0.45 + 0.15 * p.speed;
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

    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];

      // 鼠标排斥（水纹推开）
      const mdx = particle.x - mouse.x;
      const mdy = particle.y - mouse.y;
      const mdist2 = mdx * mdx + mdy * mdy;
      if (mdist2 < p.pushRadius * p.pushRadius && mdist2 > 0.01) {
        const dist = Math.sqrt(mdist2);
        const force = ((p.pushRadius - dist) / p.pushRadius) * p.pushForce;
        particle.vx += (mdx / dist) * force;
        particle.vy += (mdy / dist) * force;
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
          particle.vx *= 0.992;
          particle.vy *= 0.992;
        } else if (core.mode === 'on') {
          // 引力递进：开启后 3s 无引力 → 9s 引力从 0 线性递增到全量
          const now = performance.now();
          const inGrace = now < core.onGraceUntil;
          const ramp = inGrace
            ? 0
            : Math.min(1, (now - core.onGraceUntil) / 9000);
          if (inGrace) {
            // 宽限期：不施加任何核心力
          } else if (hdist < HUD_CATCH_RADIUS + p.radius) {
            respawnParticle(particle);
            continue;
          } else if (hdist < p.gravityRadius) {
            const inRing = hdist > RING_INNER && hdist < RING_OUTER;
            const falloff = 1 - hdist / p.gravityRadius;
            if (inRing) {
              // 星环区：强切向、弱径向，粒子绕行成环
              const pull = 0.02 * falloff * ramp;
              const swirl = 1.9 * falloff * ramp;
              particle.vx += normX * pull;
              particle.vy += normY * pull;
              particle.vx += -normY * swirl;
              particle.vy += normX * swirl;
            } else {
              // 外围：缓慢吸引进入星环
              const pull = falloff * falloff * p.gravityStrength * ramp;
              const swirl = falloff * p.swirlStrength * 0.4 * ramp;
              particle.vx += normX * pull;
              particle.vy += normY * pull;
              particle.vx += -normY * swirl;
              particle.vy += normX * swirl;
            }
          }
        }
      }

      const damping = core.mode === 'releasing' ? 0.995 : 0.984;
      particle.vx *= damping;
      particle.vy *= damping;
      const speed = Math.hypot(particle.vx, particle.vy);
      const maxSpeed = core.mode === 'absorbing' ? 4 : core.mode === 'releasing' ? 5 : 2.4;
      if (speed > maxSpeed) {
        particle.vx *= maxSpeed / speed;
        particle.vy *= maxSpeed / speed;
      } else if (speed < 0.1) {
        particle.vx += (Math.random() - 0.5) * 0.05;
        particle.vy += (Math.random() - 0.5) * 0.05;
      }
      particle.x += particle.vx;
      particle.y += particle.vy;
      if (particle.x < -12) particle.x = width + 12;
      else if (particle.x > width + 12) particle.x = -12;
      if (particle.y < -12) particle.y = height + 12;
      else if (particle.y > height + 12) particle.y = -12;

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

  function applyConfig(next) {
    if (typeof next.enabled === 'boolean') {
      cfg.enabled = next.enabled;
    }
    if (typeof next.intensity === 'number') {
      cfg.intensity = Math.min(1, Math.max(0.1, next.intensity));
    }
    if (typeof next.speed === 'number') {
      const previous = cfg.speed;
      cfg.speed = Math.min(2, Math.max(0.2, next.speed));
      // 已有粒子按倍率同步缩放速度（保留方向），避免只有新粒子变快
      if (previous !== cfg.speed) {
        const ratio = cfg.speed / previous;
        for (const particle of particles) {
          particle.vx *= ratio;
          particle.vy *= ratio;
        }
      }
    }
    if (cfg.enabled) {
      syncCount();
      start();
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
    getMode: () => core.mode,
    getParticles: () => particles
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

  resize();
  observeCoreState();
  start();
})();
