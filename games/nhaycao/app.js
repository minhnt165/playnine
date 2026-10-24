/* =====================================================================
 * Nhảy Cao - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Canvas: vòng lặp requestAnimationFrame, mô phỏng theo bước cố định E.DT (công bằng giữa máy nhanh / chậm),
 *     giới hạn dt khi tab vừa quay lại; khung thế giới E.W × E.VIEW_H co theo khung, nhân devicePixelRatio
 *   - Điều khiển: ← → / A D; chạm giữ nửa trái / phải khung chơi; nghiêng máy (bật trong Cài đặt)
 *   - Tự tạm dừng khi trang ẩn hoặc mở hộp thoại; P / Esc / nút tạm dừng
 *   - Báo ván cho cổng (metric score_high, mode classic):
 *     bấm Bắt đầu: kit.sdk.start(MODE); mở lại ván lưu dở: kit.sdk.start(MODE, true)
 *     rơi / trúng mây: kit.sdk.end({ mode, won: false, score }); bỏ ván đã có điểm hoặc đã chơi ≥ 1 s: cũng gửi
 *     won false + điểm hiện có; chưa chơi gì thì không gửi
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const W = E.W;
  const VH = E.VIEW_H;
  const kit = PNKit.init({
    gameId: 'nhaycao',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { tilt: false, vibrate: true, guideSeen: false },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const reduced = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const stage = $('stage');
  const field = $('field');
  const cv = $('cv');
  const ctx = cv.getContext('2d');

  const rawStats = kit.store.read(keys.stats, {}) || {};
  const stats = { played: 0, best: 0, total: 0 };
  Object.keys(stats).forEach((k) => {
    if (Number.isFinite(rawStats[k]) && rawStats[k] >= 0) stats[k] = Math.floor(rawStats[k]);
  });

  let game = null;
  let phase = 'ready'; // ready (màn chờ) | play | paused | over
  let resumed = false; // ván đang chờ là ván lưu dở (đã báo start resume)
  let cause = 'fall'; // fall | hit: lý do hết ván
  let bestToasted = false;
  let acc = 0;
  let last = 0;
  let raf = 0;
  let overTimer = 0;
  let squash = 0; // hiệu ứng nhún khi nảy (0..1)
  let clock = 0; // giây trôi qua (hiệu ứng trang trí)
  const fx = []; // hạt trang trí: { x, y, vx, vy, life, max, r, c }

  const fmtH = (n) => t('unit.m', { n: kit.i18n.fmtNumber(n) });
  const started = () => !!game && (game.score > 0 || game.t >= 120);
  const randomSeed = () => (Math.random() * 4294967296) >>> 0;

  /* ---------------- Màu (đọc từ CSS để theo giao diện sáng / tối) ---------------- */
  let col = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    col = {
      skyTop: v('--sky-top'), skyBot: v('--sky-bot'), spaceTop: v('--space-top'), spaceBot: v('--space-bot'),
      cloud: v('--cloud'), stars: parseFloat(v('--stars')) || 0, mark: v('--mark'), markText: v('--mark-text'),
      best: v('--accent'),
    };
  }
  function hex(c) {
    const m = /^#([0-9a-f]{6})$/i.exec(c || '');
    const n = m ? parseInt(m[1], 16) : 0;
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, k) {
    const x = hex(a);
    const y = hex(b);
    return 'rgb(' + x.map((c, i) => Math.round(c + (y[i] - c) * k)).join(',') + ')';
  }
  /** Số giả ngẫu nhiên cố định theo chỉ số (vị trí sao, mây nền). */
  function hash(i) {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  /* ---------------- Khung chơi ---------------- */
  let scale = 1;
  let dpr = 1;
  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    scale = Math.max(0.2, Math.min(w / W, h / VH));
    const cw = Math.floor(W * scale);
    const ch = Math.floor(VH * scale);
    field.style.width = cw + 'px';
    field.style.height = ch + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    draw();
  }

  /* ---------------- Vẽ ---------------- */
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Thêm một hình elip (không xoay) vào đường đang vẽ; moveTo trước để các elip không bị nối bằng đường thẳng. */
  function ell(x, y, rx, ry) {
    ctx.moveTo(x + rx, y);
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  }

  const PLAT = {
    n: ['#3fbf6f', '#2a9455', '#8be3a8'],
    s: ['#3fbf6f', '#2a9455', '#8be3a8'],
    m: ['#3d8bfd', '#2563c9', '#9cc4ff'],
    b: ['#b07a45', '#7d5229', '#d9a874'],
  };

  function drawPlatform(q, sy) {
    const c = PLAT[q.k];
    const x = q.x;
    const y = sy(q.y);
    const h = E.PLAT_H;
    if (q.k === 'b' && q.br) {
      // Bệ vỡ: hai nửa rơi và xoay ra hai bên
      const a = Math.min(0.9, q.fv * 0.0012);
      ctx.globalAlpha = Math.max(0, 1 - q.fv / 1400);
      [[-1, x, x + E.PW / 2], [1, x + E.PW / 2, x + E.PW]].forEach(([d, x0, x1]) => {
        ctx.save();
        ctx.translate((x0 + x1) / 2 + d * a * 12, y + h / 2);
        ctx.rotate(d * a);
        ctx.fillStyle = c[0];
        roundRect(-(x1 - x0) / 2, -h / 2, x1 - x0 - 1, h, 4);
        ctx.fill();
        ctx.restore();
      });
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = c[1];
    roundRect(x, y + 2, E.PW, h, 6);
    ctx.fill();
    ctx.fillStyle = c[0];
    roundRect(x, y, E.PW, h - 1, 6);
    ctx.fill();
    ctx.fillStyle = c[2];
    roundRect(x + 5, y + 2, E.PW - 10, 3, 1.5);
    ctx.fill();
    if (q.k === 'b') {
      // Vết nứt
      ctx.strokeStyle = c[1];
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x + 20, y);
      ctx.lineTo(x + 25, y + 5);
      ctx.lineTo(x + 21, y + 11);
      ctx.moveTo(x + 42, y + 1);
      ctx.lineTo(x + 38, y + 6);
      ctx.lineTo(x + 44, y + 11);
      ctx.stroke();
    } else if (q.k === 'm') {
      // Mũi tên hai đầu: bệ trượt
      ctx.fillStyle = c[2];
      ctx.beginPath();
      ctx.moveTo(x + 6, y + h / 2);
      ctx.lineTo(x + 11, y + 2.5);
      ctx.lineTo(x + 11, y + h - 3.5);
      ctx.moveTo(x + E.PW - 6, y + h / 2);
      ctx.lineTo(x + E.PW - 11, y + 2.5);
      ctx.lineTo(x + E.PW - 11, y + h - 3.5);
      ctx.fill();
    } else if (q.k === 's') {
      // Lò xo: bật ra một lúc sau khi được dẫm
      const open = game.t - q.st < 16;
      const sh = open ? 18 : 8;
      const sx = x + q.sx;
      ctx.strokeStyle = '#8a93a8';
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const turns = 3;
      for (let i = 0; i <= turns * 2; i++) {
        const px = sx + 3 + (i % 2 ? E.SPRING_W - 6 : 0);
        const py = y - (sh * i) / (turns * 2);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.fillStyle = '#ef4f5f';
      roundRect(sx, y - sh - 4, E.SPRING_W, 5, 2.5);
      ctx.fill();
    }
  }

  function drawMonster(m, sy) {
    const x = E.monsterX(m);
    const bob = reduced.matches ? 0 : Math.sin(m.ph * 2) * 2;
    const y = sy(m.y) + bob;
    const draw1 = (cx) => {
      ctx.save();
      ctx.translate(cx, y);
      // Tia sét bên dưới
      if (reduced.matches || Math.sin(clock * 9 + m.id) > -0.3) {
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.moveTo(-3, 10);
        ctx.lineTo(4, 10);
        ctx.lineTo(0, 17);
        ctx.lineTo(5, 17);
        ctx.lineTo(-4, 29);
        ctx.lineTo(-1, 20);
        ctx.lineTo(-5, 20);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#4a3d78';
      [[-11, 3, 12], [0, -5, 15], [12, 3, 12], [0, 6, 13]].forEach(([dx, dy, r]) => {
        ctx.beginPath();
        ctx.arc(dx, dy + 1.5, r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#6b5aa6';
      [[-11, 2, 11], [0, -6, 14], [12, 2, 11], [0, 4, 12]].forEach(([dx, dy, r]) => {
        ctx.beginPath();
        ctx.arc(dx, dy, r, 0, Math.PI * 2);
        ctx.fill();
      });
      // Mắt giận dữ
      ctx.fillStyle = '#fff';
      [-6, 6].forEach((ex) => {
        ctx.beginPath();
        ctx.ellipse(ex, -1, 4.2, 4.6, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#1b1530';
      [-5, 5].forEach((ex) => {
        ctx.beginPath();
        ctx.arc(ex, 0, 2.1, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.strokeStyle = '#1b1530';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-10, -8);
      ctx.lineTo(-3, -5);
      ctx.moveTo(10, -8);
      ctx.lineTo(3, -5);
      ctx.stroke();
      ctx.restore();
    };
    draw1(x);
    if (x < 40) draw1(x + W);
    if (x > W - 40) draw1(x - W);
  }

  /** Nhân vật "Mầm": hạt đậu cam có mầm lá trên đầu. (x, y) = giữa chân trên màn hình. */
  function drawPlayer(x, y) {
    const p = game.player;
    const dead = game.dead;
    let sx = 1;
    let sy2 = 1;
    if (!reduced.matches) {
      sx = 1 + 0.16 * squash;
      sy2 = 1 - 0.2 * squash;
      if (p.vy > 0 && squash < 0.05) {
        const st = Math.min(0.1, p.vy / 9000);
        sx -= st * 0.6;
        sy2 += st;
      }
    }
    const f = p.face;
    const one = (cx) => {
      ctx.save();
      ctx.translate(cx, y);
      if (dead) ctx.rotate(reduced.matches ? 0.5 : clock * 7);
      ctx.scale(sx, sy2);
      // Chân
      ctx.fillStyle = '#e0731d';
      ctx.beginPath();
      ell(-6, -2.5, 5, 3);
      ell(7, -2.5, 5, 3);
      ctx.fill();
      // Mầm lá trên đầu
      ctx.strokeStyle = '#2f9a52';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -36);
      ctx.quadraticCurveTo(-1 * f, -41, 1 * f, -45);
      ctx.stroke();
      ctx.fillStyle = '#46c46f';
      ctx.beginPath();
      ctx.ellipse(6 * f, -46, 6, 3.2, -0.5 * f, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-3 * f, -45, 4.4, 2.6, 0.6 * f, 0, Math.PI * 2);
      ctx.fill();
      // Thân
      ctx.fillStyle = '#e8891f';
      ctx.beginPath();
      ctx.ellipse(0, -18, 16, 18.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffb33d';
      ctx.beginPath();
      ctx.ellipse(-1, -19.5, 14.5, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd98a';
      ctx.beginPath();
      ctx.ellipse(2 * f, -11, 8.5, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      // Má hồng
      ctx.fillStyle = 'rgba(255, 112, 112, 0.55)';
      ctx.beginPath();
      ell(-8 + 4 * f, -17, 3, 2);
      ell(9 + 4 * f, -17, 3, 2);
      ctx.fill();
      // Mắt
      const ex = 3.5 * f;
      if (dead) {
        ctx.strokeStyle = '#2a1a0c';
        ctx.lineWidth = 2;
        [-5, 6].forEach((dx) => {
          ctx.beginPath();
          ctx.moveTo(dx + ex - 3, -27);
          ctx.lineTo(dx + ex + 3, -21);
          ctx.moveTo(dx + ex + 3, -27);
          ctx.lineTo(dx + ex - 3, -21);
          ctx.stroke();
        });
      } else {
        const look = p.vy > 300 ? -1.2 : p.vy < -300 ? 1.2 : 0;
        [-5, 6].forEach((dx) => {
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.ellipse(dx + ex, -24, 4.6, 5.4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#2a1a0c';
          ctx.beginPath();
          ctx.arc(dx + ex + 1.4 * f, -24 + look, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(dx + ex + 2.2 * f, -25.2 + look, 0.9, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      ctx.restore();
    };
    one(x);
    if (x < 22) one(x + W);
    if (x > W - 22) one(x - W);
  }

  function draw() {
    if (!game) return;
    const g = game;
    const cam = g.cam;
    const sy = (y) => VH - (y - cam);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);

    // Trời: lên cao chuyển dần sang màu vũ trụ
    const alt = clamp(cam / (E.UNIT * 1200), 0, 1);
    const grad = ctx.createLinearGradient(0, 0, 0, VH);
    grad.addColorStop(0, mix(col.skyTop, col.spaceTop, alt));
    grad.addColorStop(1, mix(col.skyBot, col.spaceBot, alt * 0.85));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, VH);

    // Sao (trôi chậm theo camera)
    const starA = Math.max(col.stars, alt * 0.9);
    if (starA > 0.02) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 48; i++) {
        const yy = (hash(i + 7) * 1400 + cam * 0.12) % 1400;
        if (yy > VH) continue;
        ctx.globalAlpha = starA * (0.35 + 0.65 * hash(i + 300));
        const r = 0.6 + hash(i + 900) * 1.1;
        ctx.fillRect(hash(i) * W, yy, r, r);
      }
      ctx.globalAlpha = 1;
    }

    // Mây nền (thị sai 0,4)
    const par = cam * 0.4;
    const band = 230;
    ctx.fillStyle = col.cloud;
    for (let j = Math.floor(par / band) - 1; j <= Math.floor((par + VH) / band) + 1; j++) {
      const yy = VH - (j * band - par);
      const xx = hash(j * 3 + 1) * (W + 120) - 60;
      const s = 0.7 + hash(j * 3 + 2) * 0.6;
      ctx.beginPath();
      ell(xx, yy, 34 * s, 12 * s);
      ell(xx - 18 * s, yy + 3 * s, 20 * s, 9 * s);
      ell(xx + 20 * s, yy + 2 * s, 22 * s, 10 * s);
      ell(xx + 4 * s, yy - 9 * s, 18 * s, 11 * s);
      ctx.fill();
    }

    // Vạch độ cao mỗi 50 m và vạch kỷ lục
    ctx.font = '600 11px ' + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = 'right';
    ctx.lineWidth = 1;
    const m0 = Math.max(1, Math.ceil((cam - E.START_Y) / E.UNIT / 50));
    for (let m = m0; ; m++) {
      const y = sy(E.START_Y + m * 50 * E.UNIT);
      if (y < -10) break;
      ctx.strokeStyle = col.mark;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col.markText;
      ctx.fillText(fmtH(m * 50), W - 6, y - 4);
    }
    if (stats.best > 0) {
      const y = sy(E.START_Y + stats.best * E.UNIT);
      if (y > -10 && y < VH + 10) {
        ctx.strokeStyle = col.best;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = col.best;
        ctx.textAlign = 'left';
        ctx.fillText(t('hud.best') + ' · ' + fmtH(stats.best), 6, y - 5);
        ctx.textAlign = 'right';
      }
    }

    // Bệ, mây giông, nhân vật, hạt
    for (const q of g.platforms) {
      const y = sy(q.y);
      if (y > -30 && y < VH + 20) drawPlatform(q, sy);
    }
    for (const m of g.monsters) {
      const y = sy(m.y);
      if (y > -40 && y < VH + 40) drawMonster(m, sy);
    }
    drawPlayer(g.player.x, sy(g.player.y));
    for (const p of fx) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, sy(p.y), p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- Hạt trang trí ---------------- */
  function burst(x, y, n, c, speed, up) {
    if (reduced.matches) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + (up || 0), life: 0.5, max: 0.5, r: 2 + Math.random() * 2.5, c });
    }
    if (fx.length > 120) fx.splice(0, fx.length - 120);
  }
  function updateFx(dt) {
    squash = Math.max(0, squash - dt * 7);
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i];
      p.life -= dt;
      if (p.life <= 0) {
        fx.splice(i, 1);
        continue;
      }
      p.vy -= 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  /* ---------------- Âm thanh, rung ---------------- */
  function vibrate(pattern) {
    if (!kit.settings.get().vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* bỏ qua */ }
  }
  function handleEvents() {
    for (const e of game.ev) {
      if (e.k === 'jump') {
        kit.sfx('tap', { volume: 0.35 });
        squash = 1;
      } else if (e.k === 'spring') {
        kit.sfx('levelup');
        squash = 1;
        vibrate(15);
        burst(e.x, e.y + 6, 10, '#ffd23f', 160, 120);
      } else if (e.k === 'break') {
        kit.sfx('drop');
        vibrate(10);
        burst(e.x, e.y, 8, '#b07a45', 120, 0);
      } else if (e.k === 'stomp') {
        kit.sfx('pop');
        vibrate(20);
        burst(e.x, e.y, 12, '#9c8fd0', 180, 0);
      } else if (e.k === 'hit') {
        cause = 'hit';
        kit.sfx('error');
        vibrate([40, 40, 60]);
      }
    }
    if (!bestToasted && stats.best > 0 && game.score > stats.best) {
      bestToasted = true;
      kit.sfx('coin');
      kit.toast(t('toast.best'));
    }
  }

  /* ---------------- HUD, lưu ---------------- */
  let shownScore = -1;
  let shownBest = -1;
  function hud() {
    const best = Math.max(stats.best, game ? game.score : 0);
    if (game && game.score !== shownScore) {
      shownScore = game.score;
      $('score').textContent = fmtH(game.score);
    }
    if (best !== shownBest) {
      shownBest = best;
      $('best').textContent = best > 0 ? fmtH(best) : '–';
    }
    $('btn-pause').disabled = phase !== 'play' && phase !== 'paused';
  }

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary(saving) {
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: 0,
      note: stats.best > 0 ? t('summary.note', { h: fmtH(stats.best) }) : t('summary.none'),
      stats: stats.best > 0 ? [{ value: fmtH(stats.best), label: t('hud.best') }, { value: kit.i18n.fmtNumber(stats.played), label: t('stats.played') }] : [],
      resume: saving ? { title: t('app.name'), detail: fmtH(game.score) } : null,
      now: Date.now(),
    }));
  }
  /** Lưu ván dở (đang chơi / tạm dừng / chờ chơi tiếp) nếu đã chơi thật; còn lại thì xóa. */
  function persist() {
    const live = game && !game.over && (phase === 'play' || phase === 'paused' || (phase === 'ready' && resumed)) && started();
    if (live) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary(live);
  }

  /* ---------------- Luồng ván ---------------- */
  function showOverlay(id, on) {
    $(id).hidden = !on;
  }
  function showStart() {
    $('start-label').textContent = t(resumed ? 'start.resume' : 'start.go');
    $('start-sub').textContent = resumed ? t('start.saved', { h: fmtH(game.score) }) : t('start.sub');
    const sb = $('start-best');
    sb.hidden = !(stats.best > 0) || resumed;
    sb.textContent = t('start.best', { h: fmtH(stats.best) });
    showOverlay('overlay-start', true);
    showOverlay('overlay-pause', false);
  }

  /** Chia ván mới, chờ người chơi bấm Bắt đầu. */
  function newRun() {
    clearTimeout(overTimer);
    game = E.newGame(randomSeed());
    phase = 'ready';
    resumed = false;
    cause = 'fall';
    bestToasted = false;
    acc = 0;
    fx.length = 0;
    squash = 0;
    kit.store.remove(keys.save);
    showStart();
    hud();
    draw();
    writeSummary(false);
  }

  function begin() {
    if (phase !== 'ready' || kit.modal.current()) return;
    if (!resumed) kit.sdk.start(MODE);
    resumed = false;
    phase = 'play';
    showOverlay('overlay-start', false);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (kit.settings.get().tilt) askTilt();
    kit.sfx('start');
    hud();
    loop();
  }

  function pause() {
    if (phase !== 'play') return;
    phase = 'paused';
    keysDown.l = keysDown.r = false;
    pointers.clear();
    $('pause-height').textContent = t('pause.height', { h: fmtH(game.score) });
    showOverlay('overlay-pause', true);
    cv.setAttribute('aria-label', t('field.label', { h: fmtH(game.score) }));
    hud();
    persist();
  }
  function resume() {
    if (phase !== 'paused' || kit.modal.current()) return;
    phase = 'play';
    showOverlay('overlay-pause', false);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    hud();
    loop();
  }

  function record(score) {
    stats.played++;
    stats.total += score;
    const best = score > stats.best;
    if (best) stats.best = score;
    saveStats();
    return best;
  }

  function finish() {
    phase = 'over';
    const score = game.score;
    const prev = stats.best;
    const best = record(score) && score > 0;
    kit.store.remove(keys.save);
    writeSummary(false);
    kit.sdk.end({ mode: MODE, won: false, score, assisted: false });
    kit.sfx('lose');
    vibrate(60);
    cv.setAttribute('aria-label', t('field.label', { h: fmtH(score) }));
    hud();
    $('over-title').textContent = t(cause === 'hit' ? 'over.titleHit' : 'over.title');
    $('over-score').textContent = fmtH(score);
    $('over-new').hidden = !best;
    $('over-prev').hidden = best || prev <= 0;
    $('over-prev').textContent = t('over.prev', { h: fmtH(prev) });
    overTimer = setTimeout(() => {
      if (phase !== 'over') return;
      kit.modal.open('modal-over');
      if (best) {
        kit.sfx('win');
        kit.confetti();
      }
    }, 450);
  }

  /** Bỏ ván: đã có điểm hoặc đã chơi ≥ 1 s thì báo thua với điểm hiện có. */
  function abandon() {
    if (started() && !game.over) {
      record(game.score);
      kit.sdk.end({ mode: MODE, won: false, score: game.score, assisted: false });
    }
  }

  function requestNew() {
    if (phase === 'over') {
      kit.modal.close('modal-over');
      newRun();
      return;
    }
    const live = phase === 'play' || phase === 'paused' || (phase === 'ready' && resumed);
    if (live && started()) {
      pause();
      kit.modal.open('modal-confirm');
    } else {
      newRun();
    }
  }

  /* ---------------- Vòng lặp ---------------- */
  function frame(now) {
    raf = 0;
    if (phase !== 'play') return draw();
    if (kit.modal.current()) {
      pause();
      return draw();
    }
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1; // tab vừa quay lại / máy khựng: không bù cả quãng
    acc += dt;
    clock += dt;
    let n = 0;
    while (acc >= E.DT && n < 20) {
      E.step(game, inputDir());
      handleEvents();
      acc -= E.DT;
      n++;
      if (game.over) break;
    }
    if (n >= 20) acc = 0;
    updateFx(dt);
    draw();
    hud();
    if (game.over) return finish();
    raf = requestAnimationFrame(frame);
  }
  function loop() {
    if (raf) return;
    last = performance.now();
    acc = 0;
    raf = requestAnimationFrame(frame);
  }

  /* ---------------- Điều khiển ---------------- */
  const keysDown = { l: false, r: false };
  const pointers = new Map(); // pointerId → hướng (-1 | 1)
  let touchDir = 0;
  let tilt = 0;
  function inputDir() {
    const k = (keysDown.r ? 1 : 0) - (keysDown.l ? 1 : 0);
    if (k) return k;
    if (pointers.size) return touchDir;
    return kit.settings.get().tilt ? tilt : 0;
  }
  const sideOf = (e) => {
    const r = field.getBoundingClientRect();
    return e.clientX - r.left < r.width / 2 ? -1 : 1;
  };
  field.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return; // nút trên lớp phủ tự xử lý
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (phase === 'ready') {
      begin();
      return;
    }
    if (phase !== 'play') return;
    e.preventDefault();
    try { field.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
    touchDir = sideOf(e);
    pointers.set(e.pointerId, touchDir);
  });
  field.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    touchDir = sideOf(e);
    pointers.set(e.pointerId, touchDir);
  });
  const lift = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    const restDirs = Array.from(pointers.values());
    touchDir = restDirs.length ? restDirs[restDirs.length - 1] : 0;
  };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => field.addEventListener(ev, lift));
  field.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keysDown.l = true;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') keysDown.r = true;
    else if (k === ' ' || k === 'Enter') {
      // Space / Enter trên nút đang focus đã thành cú bấm của trình duyệt
      if (e.target && e.target.closest && e.target.closest('button, input, a')) return;
      if (phase === 'ready') begin();
      else if (phase === 'paused') resume();
      else if (phase !== 'play') return;
    } else if (k === 'p' || k === 'P' || k === 'Escape') {
      if (phase === 'play') pause();
      else if (phase === 'paused') resume();
      else return;
    } else if (k === 'n' || k === 'N') {
      if (e.repeat) return;
      requestNew();
    } else return;
    e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keysDown.l = false;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') keysDown.r = false;
  });
  window.addEventListener('blur', () => {
    keysDown.l = keysDown.r = false;
    pointers.clear();
  });

  /* Nghiêng máy: góc nghiêng trái / phải theo hướng màn hình, vùng chết 3°, nghiêng 25° là hết lái */
  function onOrient(e) {
    const ang = (screen.orientation && screen.orientation.angle) || Number(window.orientation) || 0;
    let v = ang === 90 ? e.beta : ang === -90 || ang === 270 ? -e.beta : ang === 180 ? -e.gamma : e.gamma;
    v = Number(v) || 0;
    tilt = Math.abs(v) < 3 ? 0 : clamp((v - Math.sign(v) * 3) / 22, -1, 1);
  }
  let tiltOn = false;
  function tiltFail() {
    kit.toast(t('toast.tiltOff'));
    kit.settings.set({ tilt: false });
  }
  function listenTilt() {
    if (!tiltOn) window.addEventListener('deviceorientation', onOrient);
    tiltOn = true;
  }
  /** Bật lái nghiêng; iOS cần xin quyền trong một cú chạm (bật công tắc hoặc bấm Bắt đầu). */
  function askTilt() {
    const D = window.DeviceOrientationEvent;
    if (!D) return tiltFail();
    if (typeof D.requestPermission === 'function') {
      D.requestPermission().then((r) => (r === 'granted' ? listenTilt() : tiltFail())).catch(() => { /* chưa có cú chạm: thử lại khi bấm Bắt đầu */ });
    } else listenTilt();
  }
  function onSetting(key, value) {
    if (key === 'theme') {
      readColors();
      draw();
    } else if (key === 'tilt') {
      tilt = 0;
      if (value) askTilt();
      else if (tiltOn) {
        window.removeEventListener('deviceorientation', onOrient);
        tiltOn = false;
      }
    } else if (key === 'vibrate' && value) vibrate(20);
  }

  /* ---------------- Nút, hộp thoại ---------------- */
  $('btn-start').addEventListener('click', begin);
  $('btn-resume').addEventListener('click', resume);
  $('btn-pause').addEventListener('click', () => (phase === 'play' ? pause() : resume()));
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', () => {
    kit.modal.close('modal-confirm');
    abandon();
    newRun();
  });
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-over');
    newRun();
    begin();
  });
  $('btn-over-close').addEventListener('click', () => {
    kit.modal.close('modal-over');
    newRun();
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-best').textContent = stats.best > 0 ? fmtH(stats.best) : '–';
    $('stats-avg').textContent = stats.played ? fmtH(Math.round(stats.total / stats.played)) : '–';
    $('stats-total').textContent = fmtH(stats.total);
  });
  // Hướng dẫn lần đầu: đóng hộp là coi như đã xem
  new MutationObserver(() => {
    if ($('modal-help').hidden && !kit.settings.get().guideSeen) kit.settings.set({ guideSeen: true });
  }).observe($('modal-help'), { attributes: true, attributeFilter: ['hidden'] });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else draw();
  });
  kit.onLeave(persist);
  if (window.matchMedia) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      readColors();
      draw();
    });
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  readColors();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && !restored.over && (restored.score > 0 || restored.t >= 120)) {
    game = restored;
    phase = 'ready';
    resumed = true;
    cause = restored.dead ? 'hit' : 'fall';
    kit.sdk.start(MODE, true);
    showStart();
    kit.toast(t('toast.saved'));
    hud();
    writeSummary(true);
  } else {
    newRun();
  }
  if (kit.settings.get().tilt && !(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function')) askTilt();
  resize();
  if (!kit.settings.get().guideSeen) kit.modal.open('modal-help');
})();
