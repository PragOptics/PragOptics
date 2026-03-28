export function mountDnaSwirl(target, opts = {}) {
  const host = typeof target === 'string' ? document.querySelector(target) : target;
  if (!host) return null;

  // idempotent
  if (host.__dnaSwirlCleanup) return host.__dnaSwirlCleanup;

  const cfg = {
    height: opts.height ?? 56,

    // === Smoothness (adaptive density) ===
    dotSpacingPx: opts.dotSpacingPx ?? 4.8, // smaller = smoother on desktop
    minDensity: opts.minDensity ?? 120,
    maxDensity: opts.maxDensity ?? 520,
    pixelSize: opts.pixelSize ?? null,     // auto if null

    speed: opts.speed ?? 0.90,
    amplitude: opts.amplitude ?? 14,
    bgAlpha: opts.bgAlpha ?? 0.0,

    colorA: opts.colorA ?? '#a200ffc5',
    colorB: opts.colorB ?? '#1ca490da',

    buildDotsPerSec: opts.buildDotsPerSec ?? 140,
    shedDotsPerSec:  opts.shedDotsPerSec  ?? 160,
    holdSecs:        opts.holdSecs        ?? 0.75,

    easeToAnchor: opts.easeToAnchor ?? 0.14,
    outgoingSpeed: opts.outgoingSpeed ?? 2.35,
    snapEps: opts.snapEps ?? 0.75,

    showGuideLine: opts.showGuideLine ?? false,
    guideLineAlpha: opts.guideLineAlpha ?? 0.05,

    shimmer: opts.shimmer ?? 0.65,

    // === Logo end-state ===
    loop: opts.loop ?? false,
    logoUrl: opts.logoUrl ?? 'https://pragoptics.com/images/logo.png',
    logoSize: opts.logoSize ?? null,
    logoFadeInSecs: opts.logoFadeInSecs ?? 0.55,
    logoHoldAlpha: opts.logoHoldAlpha ?? 1.0,

    // === Soft logo mask ===
    logoMask: opts.logoMask ?? true,
    logoMaskPad: opts.logoMaskPad ?? 2,
    logoMaskFeather: opts.logoMaskFeather ?? 10,
    logoMaskMinAlpha: opts.logoMaskMinAlpha ?? 0.25,

    idleSpeedMul: opts.idleSpeedMul ?? 0.35,
    idleShimmerMul: opts.idleShimmerMul ?? 0.55,

    // === NEW: smoothing polish ===
    idleRadiusBoost: opts.idleRadiusBoost ?? 1.18, // overlap boost in idle/logo
    baseAlphaFloor: opts.baseAlphaFloor ?? 0.28,   // raises faint dots so line reads continuous
    baseAlphaDepth: opts.baseAlphaDepth ?? 0.42,   // preserves depth
    glowBridge: opts.glowBridge ?? true,           // adds soft glow to visually connect dots
  };

  // ----- canvas -----
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = cfg.height + 'px';
  canvas.style.display = 'block';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return null;

  if (!cfg.logoSize) cfg.logoSize = Math.round(Math.min(cfg.height * 0.72, 44));

  // ===== runtime state =====
  let raf = 0;
  let t = 0;

  // dynamic density + slots depend on width
  let density = 140;

  function computeDensity(w) {
    const d = Math.round(w / cfg.dotSpacingPx) + 1;
    return Math.max(cfg.minDensity, Math.min(cfg.maxDensity, d));
  }

  // ===== logo =====
  const logoImg = new Image();
  logoImg.crossOrigin = 'anonymous';
  let logoReady = false;
  let logoAlpha = 0;
  logoImg.onload = () => { logoReady = true; };
  logoImg.onerror = () => { logoReady = false; };
  logoImg.src = cfg.logoUrl;

  // ===== slots =====
  let slotsA = [];
  let slotsB = [];

  // phase machine
  let phase = 'build'; // build | hold | shed | logo | idle
  let holdUntil = 0;

  // pointers
  let buildL = 0, buildR = 0;
  let shedL = 0, shedR = 0;

  // rate-limiters
  let lastTs = performance.now();
  let buildAcc = 0;
  let shedAcc = 0;
  let logoFadeStart = 0;

  function makeSlots(strand) {
    return Array.from({ length: density }, (_, i) => ({
      idx: i,
      strand,
      state: 'empty', // empty | incoming | locked | outgoing
      x: 0,
      y: cfg.height * 0.5,
      vx: 0,
      vy: 0,
      life: 1,
      side: null,
    }));
  }

  function forceEmpty(slot) {
    slot.state = 'empty';
    slot.side = null;
    slot.life = 1;
  }

  function rebuildSlotsForDensity(preserve = true) {
    const prevPhase = phase;

    slotsA = makeSlots('A');
    slotsB = makeSlots('B');

    buildL = 0;
    buildR = density - 1;

    if (preserve && (prevPhase === 'idle' || prevPhase === 'logo')) {
      for (let i = 0; i < density; i++) {
        slotsA[i].state = 'locked';
        slotsB[i].state = 'locked';
      }
      phase = 'idle';
      logoAlpha = cfg.logoHoldAlpha;
    } else {
      phase = 'build';
      buildAcc = 0;
      shedAcc = 0;
      logoAlpha = 0;
    }
  }

  // ===== resize =====
  function resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, cfg.height);

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const newDensity = computeDensity(w);
    if (newDensity !== density) {
      density = newDensity;
      rebuildSlotsForDensity(true);
    } else if (!slotsA.length || slotsA.length !== density) {
      rebuildSlotsForDensity(true);
    }
  }

  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // init density/slots
  density = computeDensity(Math.max(1, host.clientWidth));
  rebuildSlotsForDensity(false);
  resize();

  // ===== pixel radius helpers (FIXED: proper scope) =====
  function computePixelRadius() {
    if (cfg.pixelSize != null) return cfg.pixelSize;
    // More overlap than before so desktop reads smoother
    return Math.max(2.0, Math.min(3.6, cfg.dotSpacingPx * 0.50));
  }

  function pixelRadiusForPhase() {
    const r = computePixelRadius();
    // During idle/logo, increase overlap slightly for smoother strand perception
    if (phase === 'idle' || phase === 'logo') return r * cfg.idleRadiusBoost;
    return r;
  }

  // ===== helpers =====
  function parseColorToRgba(color, alphaMul = 1) {
    const s = (color ?? '').toString().trim();

    if (s.startsWith('rgba(') || s.startsWith('rgb(')) {
      const inside = s.slice(s.indexOf('(') + 1, s.lastIndexOf(')'));
      const parts = inside.split(',').map(p => p.trim());
      const r = Number(parts[0]), g = Number(parts[1]), b = Number(parts[2]);
      const a = parts.length >= 4 ? Number(parts[3]) : 1;
      const aa = Math.max(0, Math.min(1, a * alphaMul));
      return `rgba(${r},${g},${b},${aa})`;
    }

    if (s.startsWith('#')) {
      const h = s.slice(1);
      const hex = (h.length === 3 || h.length === 4)
        ? h.split('').map(ch => ch + ch).join('')
        : h;

      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length >= 8 ? (parseInt(hex.slice(6, 8), 16) / 255) : 1;
      const aa = Math.max(0, Math.min(1, a * alphaMul));
      return `rgba(${r},${g},${b},${aa})`;
    }

    return s;
  }

  function drawDot(x, y, r, color, alpha = 1) {
    const fill = parseColorToRgba(color, alpha);

    ctx.save();

    // Glow bridge (optional): helps the line read continuous on desktop
    if (cfg.glowBridge) {
      ctx.shadowColor = fill;
      ctx.shadowBlur = (phase === 'idle' || phase === 'logo') ? 10 : 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawGuide(points, color, alpha) {
    ctx.strokeStyle = parseColorToRgba(color, alpha);
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  function getLogoRect(w, h) {
    const size = cfg.logoSize;
    const cx = w * 0.5;
    const cy = h * 0.5;

    const iw = logoImg.naturalWidth || size;
    const ih = logoImg.naturalHeight || size;
    const ar = iw / ih;

    let dw = size, dh = size;
    if (ar > 1) dh = size / ar;
    else dw = size * ar;

    return { x: cx - dw / 2, y: cy - dh / 2, w: dw, h: dh };
  }

  function drawLogoCentered(w, h) {
    if (!logoReady || logoAlpha <= 0) return;
    const r = getLogoRect(w, h);

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, logoAlpha));
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(logoImg, r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function logoMaskAlpha(x, y, w, h) {
    if (!cfg.logoMask || !logoReady) return 1;

    const lr = getLogoRect(w, h);
    const pad = cfg.logoMaskPad;
    const feather = cfg.logoMaskFeather;

    const left = lr.x - pad;
    const right = lr.x + lr.w + pad;
    const top = lr.y - pad;
    const bottom = lr.y + lr.h + pad;

    const inside = (x >= left && x <= right && y >= top && y <= bottom);
    if (inside) return cfg.logoMaskMinAlpha;

    const dx = (x < left) ? (left - x) : (x > right) ? (x - right) : 0;
    const dy = (y < top) ? (top - y) : (y > bottom) ? (y - bottom) : 0;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= feather) {
      const k = smoothstep(0, feather, dist);
      return cfg.logoMaskMinAlpha + (1 - cfg.logoMaskMinAlpha) * k;
    }
    return 1;
  }

  // ===== helix math =====
  function strandTwist(xNorm, phaseShift) {
    return Math.sin((xNorm * Math.PI * 2.0) + phaseShift + t);
  }

  function buildAnchors() {
    const w = host.clientWidth || 1;
    const midY = cfg.height * 0.5;

    const anchorsA = new Array(density);
    const anchorsB = new Array(density);

    for (let i = 0; i < density; i++) {
      const xNorm = (density === 1) ? 0 : i / (density - 1);
      const x = xNorm * w;

      const yA = midY + strandTwist(xNorm, 0) * cfg.amplitude;
      const yB = midY + strandTwist(xNorm, Math.PI) * cfg.amplitude;

      const depth = (strandTwist(xNorm, 0) + 1) / 2;

      anchorsA[i] = { x, y: yA, depth };
      anchorsB[i] = { x, y: yB, depth: 1 - depth };
    }
    return { anchorsA, anchorsB };
  }

  function startIncoming(slot, side) {
    const w = host.clientWidth || 1;
    const midY = cfg.height * 0.5;

    slot.side = side;
    slot.state = 'incoming';
    slot.life = 1;

    slot.x = (side === 'L') ? -14 : w + 14;
    slot.y = midY + (Math.sin(slot.idx * 0.17) * 0.35);

    slot.vx = 0;
    slot.vy = 0;
  }

  function startOutgoing(slot, side) {
    const w = host.clientWidth || 1;

    slot.side = side;
    slot.state = 'outgoing';
    slot.life = 1;

    const dir = (side === 'L') ? -1 : 1;
    slot.vx = dir * cfg.outgoingSpeed * (0.9 + 0.15 * Math.sin(slot.idx * 0.11));
    slot.vy = (Math.sin(slot.idx * 0.23) * 0.45);
  }

  function allLocked(slots) {
    for (const s of slots) if (s.state !== 'locked') return false;
    return true;
  }

  function allEmpty(slots) {
    for (const s of slots) if (s.state !== 'empty') return false;
    return true;
  }

  function updateSlot(slot, anchors, color, w, h, shimmerMul = 1) {
    const a = anchors[slot.idx];

    const sh = cfg.shimmer * shimmerMul;
    const shimmerX = Math.sin((t * 3.1) + slot.idx * 0.21) * 0.35 * sh;
    const shimmerY = Math.cos((t * 2.7) + slot.idx * 0.19) * 0.25 * sh;

    if (slot.state === 'incoming') {
      const tx = a.x, ty = a.y;
      slot.x += (tx - slot.x) * cfg.easeToAnchor;
      slot.y += (ty - slot.y) * cfg.easeToAnchor;

      const done = (Math.abs(tx - slot.x) < cfg.snapEps && Math.abs(ty - slot.y) < cfg.snapEps);
      if (done) {
        slot.state = 'locked';
        slot.x = tx;
        slot.y = ty;
      }
    }

    if (slot.state === 'locked') {
      slot.x = a.x + shimmerX;
      slot.y = a.y + shimmerY;
    }

    if (slot.state === 'outgoing') {
      slot.x += slot.vx;
      slot.y += slot.vy + shimmerY * 0.15;
      slot.life -= 0.02;

      if (slot.life <= 0 || slot.x < -40 || slot.x > w + 40) {
        forceEmpty(slot);
      }
    }

    if (slot.state !== 'empty') {
      const r = pixelRadiusForPhase();

      // ✅ Alpha floor raised (smoother line perception on desktop)
      const baseAlpha = cfg.baseAlphaFloor + a.depth * cfg.baseAlphaDepth;

      const stateBoost =
        slot.state === 'incoming' ? 0.18 :
        slot.state === 'locked'   ? 0.00 :
        slot.state === 'outgoing' ? -0.05 : 0;

      const maskMul = logoMaskAlpha(slot.x, slot.y, w, h);
      const alpha = Math.max(0, Math.min(1, (baseAlpha + stateBoost) * slot.life * maskMul));

      drawDot(slot.x, slot.y, r, color, alpha);
    }
  }

  function step(now) {
    const w = host.clientWidth || 1;
    const h = cfg.height;

    const dt = Math.max(0.001, (now - lastTs) / 1000);
    lastTs = now;

    const speedMul = (phase === 'idle') ? cfg.idleSpeedMul : 1;
    t += (0.022 * cfg.speed * speedMul) * (dt * 60);

    ctx.clearRect(0, 0, w, h);
    if (cfg.bgAlpha > 0) {
      ctx.fillStyle = `rgba(0,0,0,${cfg.bgAlpha})`;
      ctx.fillRect(0, 0, w, h);
    }

    const { anchorsA, anchorsB } = buildAnchors();

    if (cfg.showGuideLine) {
      drawGuide(anchorsA, cfg.colorA, cfg.guideLineAlpha);
      drawGuide(anchorsB, cfg.colorB, cfg.guideLineAlpha);
    }

    // === phases ===
    if (phase === 'build') {
      buildAcc += dt * cfg.buildDotsPerSec;

      while (buildAcc >= 1) {
        buildAcc -= 1;

        if (buildL <= buildR) {
          const iL = buildL;
          const iR = buildR;

          if (slotsA[iL].state === 'empty') startIncoming(slotsA[iL], 'L');
          if (slotsB[iL].state === 'empty') startIncoming(slotsB[iL], 'L');

          if (slotsA[iR].state === 'empty') startIncoming(slotsA[iR], 'R');
          if (slotsB[iR].state === 'empty') startIncoming(slotsB[iR], 'R');

          buildL++;
          buildR--;
        } else break;
      }

      if (buildL > buildR && allLocked(slotsA) && allLocked(slotsB)) {
        phase = 'hold';
        holdUntil = now + cfg.holdSecs * 1000;
      }
    }

    if (phase === 'hold') {
      if (now >= holdUntil) {
        phase = 'shed';
        shedAcc = 0;
        const mid = Math.floor((density - 1) / 2);
        shedL = mid;
        shedR = mid + 1;
      }
    }

    if (phase === 'shed') {
      shedAcc += dt * cfg.shedDotsPerSec;

      while (shedAcc >= 1) {
        shedAcc -= 1;

        if (shedL >= 0) {
          if (slotsA[shedL].state === 'locked') startOutgoing(slotsA[shedL], 'L');
          if (slotsB[shedL].state === 'locked') startOutgoing(slotsB[shedL], 'L');
          shedL--;
        }
        if (shedR < density) {
          if (slotsA[shedR].state === 'locked') startOutgoing(slotsA[shedR], 'R');
          if (slotsB[shedR].state === 'locked') startOutgoing(slotsB[shedR], 'R');
          shedR++;
        }
        if (shedL < 0 && shedR >= density) break;
      }

      if (allEmpty(slotsA) && allEmpty(slotsB)) {
        if (cfg.loop) {
          phase = 'build';
          buildL = 0;
          buildR = density - 1;
          buildAcc = 0;
          logoAlpha = 0;
        } else {
          phase = 'logo';
          logoFadeStart = now;
          logoAlpha = 0;
          buildL = 0;
          buildR = density - 1;
          buildAcc = 0;
        }
      }
    }

    if (phase === 'logo') {
      const p = Math.min(1, (now - logoFadeStart) / (cfg.logoFadeInSecs * 1000));
      logoAlpha = p * cfg.logoHoldAlpha;

      buildAcc += dt * cfg.buildDotsPerSec;
      while (buildAcc >= 1) {
        buildAcc -= 1;

        if (buildL <= buildR) {
          const iL = buildL;
          const iR = buildR;

          if (slotsA[iL].state === 'empty') startIncoming(slotsA[iL], 'L');
          if (slotsB[iL].state === 'empty') startIncoming(slotsB[iL], 'L');

          if (slotsA[iR].state === 'empty') startIncoming(slotsA[iR], 'R');
          if (slotsB[iR].state === 'empty') startIncoming(slotsB[iR], 'R');

          buildL++;
          buildR--;
        } else break;
      }

      if (buildL > buildR && allLocked(slotsA) && allLocked(slotsB)) {
        phase = 'idle';
      }
    }

    if (phase === 'idle') {
      logoAlpha = cfg.logoHoldAlpha;
    }

    const shimmerMul = (phase === 'idle') ? cfg.idleShimmerMul : 1;

    for (let i = 0; i < density; i++) {
      updateSlot(slotsA[i], anchorsA, cfg.colorA, w, h, shimmerMul);
      updateSlot(slotsB[i], anchorsB, cfg.colorB, w, h, shimmerMul);
    }

    drawLogoCentered(w, h);

    raf = requestAnimationFrame(step);
  }

  raf = requestAnimationFrame(step);

  function cleanup() {
    cancelAnimationFrame(raf);
    ro.disconnect();
    host.__dnaSwirlCleanup = null;
    try { host.removeChild(canvas); } catch {}
  }

  host.__dnaSwirlCleanup = cleanup;
  return cleanup;
}