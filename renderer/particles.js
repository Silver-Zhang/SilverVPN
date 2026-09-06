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

  // HUD 能量核心（引力源）位置跟踪：黑洞式吸入粒子
  const hud = { x: -9999, y: -9999, active: false };
  const HUD_CATCH_RADIUS = 30;
  const HUD_GLOW_RADIUS = 260;

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
    hud.active = card.classList.contains('is-on') && !card.classList.contains('is-off');
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
      gravityStrength: 1.1 + 0.5 * k,
      swirlStrength: 1.4 + 0.6 * k
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

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const color = themeColor();
    const p = params();
    updateHudAnchor();

    // 吸积盘光效：核心周围一圈柔光（仅在核心运行且可见时）
    if (hud.active && hud.x > -100 && hud.x < width + 100 && hud.y > -100 && hud.y < height + 100) {
      const glow = ctx.createRadialGradient(hud.x, hud.y, 0, hud.x, hud.y, HUD_GLOW_RADIUS * 0.7);
      glow.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${0.1 * color.a})`);
      glow.addColorStop(0.55, `rgba(${color.r}, ${color.g}, ${color.b}, ${0.03 * color.a})`);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(hud.x, hud.y, HUD_GLOW_RADIUS * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // 星座连线：相邻粒子随机连成星轨，随距离渐隐
    ctx.lineWidth = 1;
    for (let i = 0; i < particles.length; i += 1) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j += 1) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < p.linkDist * p.linkDist) {
          const alpha = (1 - Math.sqrt(dist2) / p.linkDist) * p.linkAlpha * color.a;
          ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (const particle of particles) {
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

      // 黑洞吸积：核心附近的粒子被螺旋吸入，靠近核心后“吞噬”并外围重生
      if (hud.active && hud.x > -100 && hud.x < width + 100 && hud.y > -100 && hud.y < height + 100) {
        const hdx = hud.x - particle.x;
        const hdy = hud.y - particle.y;
        const hdist = Math.hypot(hdx, hdy);
        const catchH = HUD_CATCH_RADIUS + p.radius;
        if (hdist < catchH) {
          respawnParticle(particle);
        } else if (hdist < p.gravityRadius) {
          const falloff = 1 - hdist / p.gravityRadius;
          const pull = falloff * falloff * p.gravityStrength;
          const normX = hdx / hdist;
          const normY = hdy / hdist;
          // 向心拉力
          particle.vx += normX * pull;
          particle.vy += normY * pull;
          // 切向涡流（吸积旋转方向）
          const swirl = falloff * p.swirlStrength;
          particle.vx += -normY * swirl;
          particle.vy += normX * swirl;
        }
      }

      particle.vx *= 0.984;
      particle.vy *= 0.984;
      const speed = Math.hypot(particle.vx, particle.vy);
      if (speed > 2.4) {
        particle.vx *= 2.4 / speed;
        particle.vy *= 2.4 / speed;
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

      ctx.beginPath();
      ctx.arc(particle.x, particle.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
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
  start();
})();
