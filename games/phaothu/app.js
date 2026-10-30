/* =====================================================================
 * Pháo Thủ - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vẽ bằng canvas: bản đồ cố định 800 × 500 đơn vị, co theo khung (dọc thì trời cao hơn, ngang thì có lề)
 *   - Ngắm: kéo từ pháo (hướng + khoảng cách = góc + lực, có đường ngắm ngắn), thanh trượt, nút ‹ › − +,
 *     hoặc phím mũi tên; Space / Enter / nút Bắn để bắn; 1–3 chọn loại đạn
 *   - Engine tính trọn một phát (đường bay theo bước DT, các vụ nổ, sát thương, pháo rơi); app phát lại
 *     đường bay theo thời gian thật, khoét địa hình đúng lúc nổ, rồi cho pháo rơi và đổi lượt
 *   - Máy nghĩ trên luồng chính (vài ms), "ngắm" tối thiểu MIN_THINK_MS: nòng xoay dần tới góc đã chọn
 *   - Báo ván cho cổng (metric wins, mode = mức máy easy | medium | hard; chế độ 2 người không báo):
 *     ván mới kit.sdk.start(level), mở lại ván dở kit.sdk.start(level, true);
 *     hết ván kit.sdk.end({ mode, won, assisted: false }) (thua / hòa gửi won: false);
 *     bỏ ván đã bắn ít nhất một phát: won: false; chưa bắn phát nào thì không gửi gì. Không có đi lại.
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const LEVELS = E.LEVELS;
  const WEAPON_KEYS = ['shell', 'heavy', 'triple'];
  const kit = PNKit.init({
    gameId: 'phaothu',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { level: 'medium', opponent: 'cpu', vibrate: true, guideSeen: false },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const fmt = (n) => kit.i18n.fmtNumber(n);
  const reduced = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const calm = () => reduced.matches;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;

  const MIN_THINK_MS = 750; // máy "ngắm" ít nhất chừng này
  const AIM_RANGE = 260; // kéo cách pháo chừng này (đơn vị bản đồ) là lực 100
  const VIS_H = 400; // chiều cao bản đồ tối thiểu phải thấy được
  const SETTLE = 0.4; // thời gian pháo rơi (s)

  const board = $('board');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  /* ---------------- Thống kê ---------------- */
  const toInt = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const st = { levels: {}, streak: toInt(raw.streak), best: toInt(raw.best), shots: toInt(raw.shots), hits: toInt(raw.hits) };
    LEVELS.forEach((lv) => {
      const r = (raw.levels && raw.levels[lv]) || {};
      st.levels[lv] = { played: toInt(r.played), won: toInt(r.won), lost: toInt(r.lost), drawn: toInt(r.drawn) };
    });
    return st;
  }
  const stats = loadStats();
  const saveStats = () => kit.store.write(keys.stats, stats);
  const totals = () => LEVELS.reduce((a, lv) => ({ played: a.played + stats.levels[lv].played, won: a.won + stats.levels[lv].won }), { played: 0, won: 0 });

  /* ---------------- Trạng thái ---------------- */
  let game = null; // trạng thái engine (đã gồm phát mới nhất)
  let cur = null; // { mode: 'cpu' | 'pvp', level, humanShots, ended }
  let phase = 'aim'; // aim | think | fly | over
  let shown = null; // thứ đang vẽ: { terrain, tanks: [{ x, y, angle, hp }], wind } (đi sau game khi đạn đang bay)
  const aim = { angle: 45, power: 60 };
  let weapon = 'shell';
  let anim = null; // phát đang phát lại
  let aiAim = null; // nòng máy đang xoay: { side, from, to, start, dur }
  let aiToken = 0;
  let drag = null; // điểm đang kéo ngắm (tọa độ bản đồ)
  let dirty = true;
  let terrainDirty = true;
  let resultTimer = 0;

  const isCpu = () => cur && cur.mode === 'cpu';
  const isAiTurn = () => isCpu() && game && !E.isOver(game) && game.turn === 1;
  const canAim = () => phase === 'aim' && game && !E.isOver(game) && !isAiTurn() && !kit.modal.current();
  const inProgress = () => !!game && !E.isOver(game) && cur.humanShots > 0 && !cur.ended;
  const nameOf = (side) => t(isCpu() ? (side === 0 ? 'name.you' : 'name.cpu') : side === 0 ? 'name.p1' : 'name.p2');

  function fromGame(g) {
    return { terrain: g.terrain.slice(), tanks: g.tanks.map((tk) => ({ x: tk.x, y: tk.y, angle: tk.angle, hp: tk.hp })), wind: g.wind };
  }

  /* ---------------- Hiệu ứng (trang trí, tắt khi giảm chuyển động) ---------------- */
  const fx = { blasts: [], parts: [], floats: [], shake: 0 };
  function resetFx() {
    fx.blasts = [];
    fx.parts = [];
    fx.floats = [];
    fx.shake = 0;
  }
  function buzz(ms) {
    if (!kit.settings.get().vibrate || !navigator.vibrate) return;
    try {
      navigator.vibrate(ms);
    } catch (e) { /* bỏ qua */ }
  }

  /* ---------------- Bố cục canvas ---------------- */
  const view = { w: 0, h: 0, dpr: 1, s: 1, ox: 0, oy: 0, k: 1 };
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    colors = {};
    ['tank-0', 'tank-0-dark', 'tank-1', 'tank-1-dark', 'sky-1', 'sky-2', 'far-1', 'far-2', 'grass', 'grass-dark', 'dirt-1', 'dirt-2', 'rock',
      'blast', 'blast-2', 'shell', 'aim', 'canvas-ink', 'canvas-halo', 'star', 'sun', 'steel', 'accent', 'red', 'cloud'].forEach((n) => { colors[n] = v('--' + n); });
    colors.font = v('--font') || 'system-ui, sans-serif';
    bgCache = null;
    terrainDirty = true;
    dirty = true;
  }
  function layout() {
    const w = board.clientWidth;
    const h = board.clientHeight;
    if (!w || !h) return;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    view.w = w;
    view.h = h;
    canvas.width = Math.round(w * view.dpr);
    canvas.height = Math.round(h * view.dpr);
    view.s = Math.min(w / E.W, h / VIS_H);
    view.ox = (w - E.W * view.s) / 2;
    view.oy = h;
    view.k = Math.max(view.s, 0.55); // pháo vẽ không nhỏ hơn chừng này để dễ nhìn trên điện thoại
    bgCache = null;
    terrainDirty = true;
    dirty = true;
  }
  const SX = (x) => view.ox + x * view.s;
  const SY = (y) => view.oy - y * view.s;
  /** Điểm trên màn hình → tọa độ bản đồ. */
  function toWorld(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left - view.ox) / view.s, y: (view.oy - (clientY - r.top)) / view.s };
  }
  function offscreen() {
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    const g = c.getContext('2d');
    g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    return [c, g];
  }

  /* ---------------- Vẽ nền (trời, sao, núi xa) — dựng lại khi đổi khung / giao diện / ván ---------------- */
  let bgCache = null;
  function buildBg() {
    const [c, g] = offscreen();
    const { w, h } = view;
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, colors['sky-1']);
    sky.addColorStop(1, colors['sky-2']);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    // Sao (chỉ hiện ở giao diện tối: màu trong suốt ở giao diện sáng)
    let seed = (game ? game.seed : 1) >>> 0;
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    g.fillStyle = colors.star;
    for (let i = 0; i < 60; i++) {
      const x = rnd() * w;
      const y = rnd() * h * 0.6;
      g.globalAlpha = 0.3 + rnd() * 0.7;
      g.fillRect(x, y, rnd() < 0.2 ? 2 : 1.2, rnd() < 0.2 ? 2 : 1.2);
    }
    g.globalAlpha = 1;
    // Mặt trời / trăng
    const sx = w * 0.82;
    const sy = Math.min(h * 0.16, 70);
    const sr = Math.max(14, Math.min(w, h) * 0.05);
    const halo = g.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 3);
    halo.addColorStop(0, colors.sun);
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = 0.35;
    g.fillStyle = halo;
    g.fillRect(sx - sr * 3, sy - sr * 3, sr * 6, sr * 6);
    g.globalAlpha = 1;
    g.fillStyle = colors.sun;
    g.beginPath();
    g.arc(sx, sy, sr, 0, Math.PI * 2);
    g.fill();
    // Hai lớp núi xa (chỉ để trang trí, không phải địa hình thật)
    [['far-2', 0.42, 0.2], ['far-1', 0.3, 0.14]].forEach(([col, base, amp], layer) => {
      const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
      g.fillStyle = colors[col];
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w + 8; x += 8) {
        const u = x / Math.max(w, 1);
        const y = SY(E.H * (base + amp * (0.55 * Math.sin(u * 5.1 + ph[0]) + 0.3 * Math.sin(u * 11.3 + ph[1]) + 0.15 * Math.sin(u * 23 + ph[2] + layer))));
        g.lineTo(x, y);
      }
      g.lineTo(w, h);
      g.closePath();
      g.fill();
    });
    bgCache = c;
  }

  /* ---------------- Mây trôi theo gió (trang trí; đứng yên khi giảm chuyển động) ---------------- */
  let clouds = [];
  function makeClouds(seed) {
    let s = (seed ^ 0x5bd1e995) >>> 0;
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    clouds = [];
    for (let i = 0; i < 6; i++) clouds.push({ x: rnd(), y: rnd(), size: 0.7 + rnd() * 0.7, speed: 0.6 + rnd() * 0.8 });
  }
  /** Mây dịch theo gió đang thổi: gió càng mạnh trôi càng nhanh. Trả true nếu đang trôi (cần vẽ lại). */
  function moveClouds(dt) {
    if (calm() || !shown || !shown.wind || !view.w) return false;
    const span = view.w + 160;
    clouds.forEach((c) => {
      c.x += (shown.wind * 6 * c.speed * dt) / span;
      c.x -= Math.floor(c.x);
    });
    return true;
  }
  function drawClouds() {
    const { w, h } = view;
    const top = h * 0.05;
    const bottom = Math.max(h * 0.3, SY(E.H * 0.66) - 30);
    ctx.fillStyle = colors.cloud;
    clouds.forEach((c) => {
      const r = Math.max(10, Math.min(w, h) * 0.035) * c.size;
      const x = c.x * (w + 160) - 80;
      const y = top + c.y * Math.max(10, bottom - top);
      ctx.beginPath();
      ctx.arc(x - r * 1.1, y + r * 0.25, r * 0.75, 0, Math.PI * 2);
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.arc(x + r * 1.15, y + r * 0.2, r * 0.8, 0, Math.PI * 2);
      ctx.arc(x + r * 0.4, y + r * 0.45, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /* ---------------- Vẽ địa hình (dựng lại sau mỗi vụ nổ) ---------------- */
  let terrainCache = null;
  function buildTerrain() {
    const [c, g] = offscreen();
    const tr = shown.terrain;
    const { w, h } = view;
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, SY(tr[0]));
    for (let i = 0; i < E.COLS; i++) g.lineTo(SX(i * E.STEP), SY(tr[i]));
    g.lineTo(w, SY(tr[E.COLS - 1]));
    g.lineTo(w, h);
    g.closePath();
    const dirt = g.createLinearGradient(0, SY(E.H * 0.62), 0, h);
    dirt.addColorStop(0, colors['dirt-1']);
    dirt.addColorStop(1, colors['dirt-2']);
    g.fillStyle = dirt;
    g.fill();
    // Lớp đá đáy
    g.fillStyle = colors.rock;
    g.fillRect(0, SY(E.BEDROCK), w, h - SY(E.BEDROCK));
    // Viền cỏ trên mặt đất
    g.beginPath();
    g.moveTo(0, SY(tr[0]));
    for (let i = 0; i < E.COLS; i++) g.lineTo(SX(i * E.STEP), SY(tr[i]));
    g.lineTo(w, SY(tr[E.COLS - 1]));
    g.lineJoin = 'round';
    g.strokeStyle = colors['grass-dark'];
    g.lineWidth = Math.max(4, 9 * view.s);
    g.stroke();
    g.strokeStyle = colors.grass;
    g.lineWidth = Math.max(2.5, 6 * view.s);
    g.stroke();
    // Ngoài mép bản đồ: phủ mờ để biết đạn bay ra đó là mất
    if (view.ox > 1) {
      g.fillStyle = 'rgba(0, 0, 0, 0.14)';
      g.fillRect(0, 0, view.ox, h);
      g.fillRect(view.ox + E.W * view.s, 0, view.ox + 1, h);
    }
    terrainCache = c;
    terrainDirty = false;
  }

  /* ---------------- Vẽ pháo, đạn, hiệu ứng ---------------- */
  function drawTank(i, tk, active) {
    const k = view.k;
    const x = SX(tk.x);
    const y = SY(tk.y);
    const body = colors['tank-' + i];
    const rim = colors['tank-' + i + '-dark'];
    // Nòng (vẽ trước để thân che gốc nòng)
    const a = (tk.angle * Math.PI) / 180;
    const px = x;
    const py = y - E.PIVOT_H * k;
    ctx.lineCap = 'round';
    ctx.strokeStyle = colors.steel;
    ctx.lineWidth = Math.max(3, 4.2 * k);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(a) * E.BARREL * k, py - Math.sin(a) * E.BARREL * k);
    ctx.stroke();
    // Tháp pháo
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(px, py + 1 * k, 7 * k, Math.PI, 0);
    ctx.fill();
    // Thân
    ctx.beginPath();
    ctx.moveTo(x - 15 * k, y - 4 * k);
    ctx.lineTo(x - 11 * k, y - 10 * k);
    ctx.lineTo(x + 11 * k, y - 10 * k);
    ctx.lineTo(x + 15 * k, y - 4 * k);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = Math.max(1, 1.4 * k);
    ctx.strokeStyle = rim;
    ctx.stroke();
    // Bánh xích
    ctx.fillStyle = colors.steel;
    const tw = 30 * k;
    const th = 6 * k;
    roundRect(x - tw / 2, y - th, tw, th, th / 2);
    ctx.fill();
    ctx.fillStyle = body;
    for (let j = -2; j <= 2; j++) {
      ctx.beginPath();
      ctx.arc(x + j * 5.6 * k, y - th / 2, 1.6 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    // Thanh máu nhỏ trên đầu
    const bw = 34 * k;
    const bh = Math.max(4, 4 * k);
    const bx = x - bw / 2;
    const by = y - 34 * k;
    ctx.fillStyle = colors['canvas-halo'];
    roundRect(bx - 1.5, by - 1.5, bw + 3, bh + 3, (bh + 3) / 2);
    ctx.fill();
    ctx.fillStyle = tk.hp <= 30 ? colors.red : body;
    if (tk.hp > 0) {
      roundRect(bx, by, Math.max(bh, (bw * tk.hp) / E.MAX_HP), bh, bh / 2);
      ctx.fill();
    }
    // Mũi tên trên pháo đang tới lượt
    if (active) {
      const ty = by - 6 * k;
      ctx.fillStyle = colors.accent;
      ctx.beginPath();
      ctx.moveTo(x - 5 * k, ty - 7 * k);
      ctx.lineTo(x + 5 * k, ty - 7 * k);
      ctx.lineTo(x, ty);
      ctx.closePath();
      ctx.fill();
    }
  }
  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /** Đường ngắm ngắn: chấm theo 0,45 s đầu của quỹ đạo (không tính gió), dài theo lực. */
  function drawAim(side) {
    const tk = shown.tanks[side];
    const m = E.muzzle(tk, aim.angle);
    const a = (aim.angle * Math.PI) / 180;
    const v = (aim.power / 100) * E.VMAX;
    const vx = v * Math.cos(a);
    const vy = v * Math.sin(a);
    ctx.fillStyle = colors.aim;
    for (let i = 1; i <= 9; i++) {
      const tt = i * 0.05;
      const x = m.x + vx * tt;
      const y = m.y + vy * tt - 0.5 * E.G * tt * tt;
      ctx.globalAlpha = 1 - i * 0.085;
      ctx.beginPath();
      ctx.arc(SX(x), SY(y), Math.max(1.6, 2.6 * view.k - i * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (drag) {
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = colors.aim;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(SX(tk.x), SY(tk.y + E.PIVOT_H));
      ctx.lineTo(SX(drag.x), SY(drag.y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(SX(drag.x), SY(drag.y), 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** Dấu × ở chỗ đạn bên này rơi lần trước. */
  function drawLastMark(side) {
    const l = game.last[side];
    if (!l || l.out) return;
    const x = SX(l.x);
    const y = SY(E.groundAt(shown.terrain, l.x)) - 6;
    const r = 5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = colors['canvas-halo'];
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r);
    ctx.lineTo(x - r, y + r);
    ctx.stroke();
    ctx.strokeStyle = colors['tank-' + side];
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  function drawShells() {
    const step = Math.floor(anim.t / E.DT);
    const sr = Math.max(2.6, 4.2 * view.s);
    anim.out.shells.forEach((sh) => {
      if (step >= sh.end.step) return;
      const n = sh.path.length / 2;
      const i = Math.min(step, n - 1);
      if (!calm()) {
        // Vệt khói phía sau
        for (let j = 1; j <= 12; j++) {
          const q = i - j * 2;
          if (q < 0) break;
          ctx.globalAlpha = 0.28 * (1 - j / 13);
          ctx.fillStyle = colors.aim;
          ctx.beginPath();
          ctx.arc(SX(sh.path[q * 2]), SY(sh.path[q * 2 + 1]), sr * (1 - j / 16), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      const x = SX(sh.path[i * 2]);
      const y = SY(sh.path[i * 2 + 1]);
      if (y < -sr) {
        // Đạn bay cao quá khung: mũi tên ở mép trên
        ctx.fillStyle = colors.shell;
        ctx.beginPath();
        ctx.moveTo(x, 3);
        ctx.lineTo(x - 6, 13);
        ctx.lineTo(x + 6, 13);
        ctx.closePath();
        ctx.fill();
        return;
      }
      ctx.fillStyle = colors['canvas-halo'];
      ctx.beginPath();
      ctx.arc(x, y, sr + 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.shell;
      ctx.beginPath();
      ctx.arc(x, y, sr, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawFx() {
    fx.blasts.forEach((b) => {
      const k = b.age / b.life;
      const r = Math.max(6, b.r * view.s) * (calm() ? 1 : 0.35 + 0.75 * Math.min(1, k * 2.4));
      const g = ctx.createRadialGradient(SX(b.x), SY(b.y), 0, SX(b.x), SY(b.y), r);
      g.addColorStop(0, 'rgba(255,255,230,1)');
      g.addColorStop(0.35, colors.blast);
      g.addColorStop(0.75, colors['blast-2']);
      g.addColorStop(1, 'rgba(255,90,31,0)');
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(SX(b.x), SY(b.y), r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    fx.parts.forEach((p) => {
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });
    ctx.globalAlpha = 1;
    fx.floats.forEach((f) => {
      const k = f.age / f.life;
      const tk = shown.tanks[f.side];
      const x = SX(tk.x);
      const y = SY(tk.y) - 44 * view.k - (calm() ? 0 : 26 * k);
      ctx.globalAlpha = k < 0.7 ? 1 : Math.max(0, (1 - k) / 0.3);
      ctx.font = '800 ' + Math.round(Math.max(15, 18 * view.k)) + 'px ' + colors.font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = colors['canvas-halo'];
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.side === 0 ? colors['tank-0'] : colors['tank-1'];
      ctx.fillText(f.text, x, y);
    });
    ctx.globalAlpha = 1;
  }

  function draw() {
    if (!view.w || !shown) return;
    if (!bgCache) buildBg();
    if (terrainDirty || !terrainCache) buildTerrain();
    // Rung màn khi nổ: trời đứng yên, đất + pháo + đạn rung cùng một độ lệch
    const shake = fx.shake > 0.3 && !calm();
    const sx = shake ? (Math.random() * 2 - 1) * fx.shake * view.dpr : 0;
    const sy = shake ? (Math.random() * 2 - 1) * fx.shake * view.dpr : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bgCache, 0, 0);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    drawClouds();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(terrainCache, sx, sy);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, sx, sy);
    const turn = game.turn;
    const aiming = phase === 'aim' && !E.isOver(game);
    if (aiming) drawLastMark(turn);
    for (let i = 0; i < 2; i++) drawTank(i, shown.tanks[i], (aiming || phase === 'think') && i === turn);
    if (aiming && !isAiTurn()) drawAim(turn);
    if (anim) drawShells();
    drawFx();
  }

  /* ---------------- Bảng máu, gió, bảng ngắm ---------------- */
  function renderHud() {
    for (let i = 0; i < 2; i++) {
      const hp = shown.tanks[i].hp;
      $('name-' + i).textContent = nameOf(i) + (i === 1 && isCpu() ? ' · ' + t('level.' + cur.level) : '');
      $('hp-' + i).textContent = hp;
      const fill = $('hp-fill-' + i);
      fill.style.width = (hp / E.MAX_HP) * 100 + '%';
      fill.classList.toggle('low', hp <= 30);
      $('side-' + i).classList.toggle('active', !E.isOver(game) && phase !== 'fly' && game.turn === i);
    }
    const w = shown.wind;
    const arrow = $('wind-arrow');
    arrow.classList.toggle('left', w < 0);
    arrow.classList.toggle('calm', w === 0);
    $('wind-num').textContent = w === 0 ? t('hud.calm') : String(Math.abs(w));
    $('wind-box').setAttribute('aria-label', t('hud.wind') + ' ' + (w === 0 ? t('hud.calm') : (w < 0 ? '← ' : '→ ') + Math.abs(w)));
    // Dòng trạng thái trên bản đồ
    const pill = $('turn-pill');
    let txt = '';
    if (E.isOver(game) && phase === 'over') txt = t('turn.over');
    else if (phase === 'think') txt = t('turn.cpu');
    else if (phase === 'aim') txt = isCpu() ? t('turn.you') : t('turn.player', { name: nameOf(game.turn) });
    pill.textContent = txt;
    pill.className = 'turn-pill' + (phase === 'aim' || phase === 'think' ? ' p' + game.turn : '');
    renderControls();
  }

  function renderControls() {
    const can = phase === 'aim' && !E.isOver(game) && !isAiTurn();
    $('controls').classList.toggle('wait', !can);
    $('btn-fire').disabled = !can;
    board.classList.toggle('aiming', can);
    const a = Math.round(aim.angle);
    $('angle').value = String(180 - a);
    $('power').value = String(Math.round(aim.power));
    const elev = a <= 90 ? a : 180 - a;
    $('angle-val').textContent = elev + '°' + (a === 0 ? ' →' : a === 180 ? ' ←' : a < 90 ? ' ↗' : a > 90 ? ' ↖' : ' ↑');
    $('power-val').textContent = String(Math.round(aim.power));
    const side = isCpu() ? 0 : game.turn;
    const ammo = game.tanks[side].ammo;
    $('ammo-heavy').textContent = ammo.heavy;
    $('ammo-triple').textContent = ammo.triple;
    document.querySelectorAll('.weapon').forEach((b) => {
      const id = b.dataset.weapon;
      const left = id === 'shell' ? Infinity : ammo[id];
      b.setAttribute('aria-checked', String(id === weapon));
      b.tabIndex = id === weapon ? 0 : -1;
      b.disabled = left <= 0;
      b.setAttribute('aria-label', t('weapon.' + id) + (id === 'shell' ? '' : ' (' + left + ')'));
    });
  }

  function announce(msg) {
    $('live').textContent = msg;
  }

  /* ---------------- Ngắm ---------------- */
  function setAim(angle, power) {
    aim.angle = Math.round(clamp(angle, 0, 180));
    aim.power = Math.round(clamp(power, 0, 100));
    if (game && !E.isOver(game)) {
      // Nhớ góc / lực của bên đang ngắm (lưu kèm ván), nòng xoay theo ngay
      game.tanks[game.turn].angle = aim.angle;
      game.tanks[game.turn].power = aim.power;
      shown.tanks[game.turn].angle = aim.angle;
    }
    renderControls();
    dirty = true;
  }
  function selectWeapon(id) {
    if (!canAim()) return;
    if (!E.canUse(game, id)) {
      kit.sfx('error', { volume: 0.5 });
      kit.toast(t('toast.noAmmo'));
      return;
    }
    if (id !== weapon) kit.sfx('tap');
    weapon = id;
    renderControls();
  }

  /* ---------------- Lưu ---------------- */
  function writeSummary() {
    const tot = totals();
    const live = inProgress() && isCpu();
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: tot.played,
      won: tot.won,
      note: tot.played ? t('summary.note', { n: tot.won }) : t('summary.none'),
      stats: tot.played
        ? [{ value: fmt(tot.won), label: t('stats.won') }, { value: stats.shots ? Math.round((stats.hits / stats.shots) * 100) + '%' : '–', label: t('stats.accuracy') }]
        : [],
      resume: live
        ? { title: t('app.name'), detail: t('summary.resume', { level: t('level.' + cur.level), a: game.tanks[0].hp, b: game.tanks[1].hp }), pct: 1 - game.tanks[1].hp / E.MAX_HP }
        : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inProgress()) kit.store.write(keys.save, { v: 1, mode: cur.mode, level: cur.level, humanShots: cur.humanShots, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */
  function setGame(g, c) {
    cancelAi();
    clearTimeout(resultTimer);
    anim = null;
    drag = null;
    game = g;
    cur = c;
    shown = fromGame(game);
    makeClouds(game.seed);
    resetFx();
    weapon = 'shell';
    bgCache = null;
    terrainDirty = true;
    dirty = true;
  }

  function newGame() {
    const s = kit.settings.get();
    const mode = s.opponent === 'human' ? 'pvp' : 'cpu';
    const level = LEVELS.indexOf(s.level) >= 0 ? s.level : 'medium';
    kit.modal.close('modal-result');
    setGame(E.newGame({ seed: (Math.random() * 4294967296) >>> 0 }), { mode, level, humanShots: 0, ended: false });
    kit.store.remove(keys.save);
    if (mode === 'cpu') kit.sdk.start(level);
    kit.sfx('start');
    nextTurn();
    writeSummary();
  }

  /** Bắt đầu lượt mới: người thì nạp lại góc / lực đã nhớ của pháo đó, máy thì bắt đầu ngắm. */
  function nextTurn() {
    shown.wind = game.wind;
    if (E.isOver(game)) {
      phase = 'over';
      renderHud();
      return;
    }
    const tk = game.tanks[game.turn];
    if (isAiTurn()) {
      phase = 'think';
      scheduleAi();
    } else {
      phase = 'aim';
      aim.angle = Math.round(tk.angle);
      aim.power = Math.round(tk.power);
      if (!E.canUse(game, weapon)) weapon = 'shell';
    }
    const w = game.wind;
    announce(t('live.turn', { name: nameOf(game.turn), wind: w === 0 ? t('hud.calm') : (w < 0 ? '← ' : '→ ') + Math.abs(w) }));
    renderHud();
    dirty = true;
  }

  function humanFire() {
    if (!game || E.isOver(game) || kit.modal.current()) return;
    if (phase !== 'aim' || isAiTurn()) {
      kit.toast(t('toast.wait'));
      return;
    }
    if (!E.canUse(game, weapon)) {
      kit.toast(t('toast.noAmmo'));
      return;
    }
    shoot({ angle: aim.angle, power: aim.power, weapon }, true);
  }

  /** Bắn: engine tính trọn phát bắn, app phát lại hoạt cảnh. */
  function shoot(shot, byHuman) {
    const out = E.fire(game, shot);
    if (!out) {
      kit.sfx('error', { volume: 0.5 });
      return;
    }
    const me = game.turn;
    const wind = game.wind;
    game = out.state;
    if (byHuman) {
      cur.humanShots++;
      if (isCpu()) {
        stats.shots++;
        if (out.damage[1] > 0) stats.hits++;
        saveStats();
      }
    }
    shown.tanks[me].angle = shot.angle;
    shown.wind = wind;
    drag = null;
    const endStep = Math.max(...out.shells.map((s) => s.end.step));
    anim = { out, me, weapon: shot.weapon, t: 0, applied: 0, endStep, settle: null, fromY: null };
    phase = 'fly';
    kit.sfx('pop', { pitch: shot.weapon === 'heavy' ? 0.6 : 0.85 });
    if (byHuman) buzz(15);
    announce(t('live.shot', { name: nameOf(me), angle: Math.round(shot.angle <= 90 ? shot.angle : 180 - shot.angle), power: Math.round(shot.power) }));
    persist();
    renderHud();
  }

  /** Phát lại phát bắn: đạn bay theo bước DT, nổ đúng bước, rồi pháo rơi, rồi đổi lượt. */
  function stepAnim(dt) {
    anim.t += dt;
    const step = Math.floor(anim.t / E.DT);
    const ex = anim.out.explosions;
    while (anim.applied < ex.length && ex[anim.applied].step <= step) boom(ex[anim.applied++]);
    if (anim.settle == null && anim.t >= anim.endStep * E.DT + (calm() ? 0.15 : 0.35)) startSettle();
    if (anim.settle != null) {
      const k = clamp((anim.t - anim.settle) / (calm() ? 0.12 : SETTLE), 0, 1);
      const to = anim.out.state.tanks;
      for (let i = 0; i < 2; i++) shown.tanks[i].y = lerp(anim.fromY[i], to[i].y, k * k);
      if (k >= 1 && anim.t >= anim.settle + (calm() ? 0.12 : SETTLE) + 0.15) endShot();
    }
  }

  function boom(e) {
    shown.terrain = E.carve(shown.terrain, e.x, e.y, e.r);
    terrainDirty = true;
    const wpn = E.WEAPONS[anim.weapon];
    const hitTank = shown.tanks.some((tk) => E.blastDamage(tk, e.x, e.y, wpn) > 0);
    kit.sfx(hitTank ? 'capture' : 'drop', { pitch: e.r > 40 ? 0.7 : 1 });
    fx.blasts.push({ x: e.x, y: e.y, r: e.r, age: 0, life: calm() ? 0.25 : 0.55 });
    if (!calm()) {
      fx.shake = Math.max(fx.shake, e.r > 40 ? 7 : 4);
      const n = e.r > 40 ? 22 : 14;
      for (let i = 0; i < n; i++) {
        const a = Math.PI * (0.1 + 0.8 * Math.random());
        const v = 80 + Math.random() * 220;
        fx.parts.push({
          x: SX(e.x), y: SY(e.y), vx: Math.cos(a) * v * (Math.random() < 0.5 ? -1 : 1), vy: -Math.sin(a) * v,
          size: 2 + Math.random() * 3, age: 0, life: 0.6 + Math.random() * 0.5,
          color: Math.random() < 0.35 ? colors.blast : Math.random() < 0.5 ? colors['dirt-1'] : colors.grass,
        });
      }
    }
    if (hitTank && shown.tanks[0] && anim.me === 1 && E.blastDamage(shown.tanks[0], e.x, e.y, wpn) > 0) buzz(40);
  }

  function startSettle() {
    anim.settle = anim.t;
    anim.fromY = shown.tanks.map((tk) => tk.y);
    const out = anim.out;
    const parts = [];
    for (let i = 0; i < 2; i++) {
      shown.tanks[i].hp = out.state.tanks[i].hp;
      if (out.damage[i] > 0) {
        fx.floats.push({ side: i, text: '−' + out.damage[i], age: 0, life: 1.1 });
        parts.push(t('live.hit', { name: nameOf(i), n: out.damage[i], hp: out.state.tanks[i].hp }));
      }
      if (out.fall[i] > 4) kit.sfx('tick', { pitch: 0.6 });
    }
    announce(parts.length ? parts.join(' ') : t('live.miss'));
    renderHud();
  }

  function endShot() {
    anim = null;
    shown = fromGame(game);
    terrainDirty = true;
    dirty = true;
    if (E.isOver(game)) finish();
    else nextTurn();
    persist();
  }

  /* ---------------- Máy ---------------- */
  function scheduleAi() {
    const token = ++aiToken;
    const t0 = performance.now();
    setTimeout(() => {
      if (token !== aiToken || !isAiTurn()) return;
      const shot = E.chooseShot(game, cur.level);
      const side = game.turn;
      const spent = performance.now() - t0;
      const dur = Math.max(calm() ? 250 : 450, (calm() ? 400 : MIN_THINK_MS) - spent);
      aiAim = { side, from: shown.tanks[side].angle, to: shot.angle, start: performance.now(), dur };
      setTimeout(() => {
        if (token !== aiToken) return;
        aiAim = null;
        shoot(shot, false);
      }, dur);
    }, 60);
  }
  function cancelAi() {
    aiToken++;
    aiAim = null;
  }

  /* ---------------- Hết ván ---------------- */
  function finish() {
    if (cur.ended) return;
    cur.ended = true;
    phase = 'over';
    const w = game.winner;
    const draw = w === E.DRAW;
    const limit = !draw && game.tanks[0].hp > 0 && game.tanks[1].hp > 0;
    let title;
    let text;
    let art;
    if (isCpu()) {
      const won = w === 0;
      const lv = stats.levels[cur.level];
      lv.played++;
      if (won) {
        lv.won++;
        stats.streak++;
        stats.best = Math.max(stats.best, stats.streak);
      } else {
        if (draw) lv.drawn++;
        else lv.lost++;
        stats.streak = 0;
      }
      saveStats();
      // Thua / hòa vẫn là một ván đã chơi: gửi won: false (ván luôn có ít nhất một phát của người chơi)
      if (won || cur.humanShots > 0) kit.sdk.end({ mode: cur.level, won, assisted: false });
      kit.sfx(won ? 'win' : draw ? 'draw' : 'lose');
      if (won) kit.confetti();
      title = t(won ? 'result.win' : draw ? 'result.draw' : 'result.lose');
      text = limit ? t('result.textLimit') : draw ? t('result.textDraw') : t(won ? 'result.textWin' : 'result.textLose', { level: t('level.' + cur.level), n: cur.humanShots });
      art = won ? 'win' : draw ? 'draw' : 'lose';
      $('result-streak').hidden = !won || stats.streak < 2;
      $('result-streak').textContent = t('result.streak', { n: stats.streak });
    } else {
      kit.sfx(draw ? 'draw' : 'win');
      if (!draw) kit.confetti();
      title = draw ? t('result.draw') : t('result.pvp', { name: nameOf(w) });
      text = limit ? t('result.textLimit') : draw ? t('result.textDraw') : t('result.textPvp', { n: game.shots });
      art = draw ? 'draw' : w === 0 ? 'win' : 'lose';
      $('result-streak').hidden = true;
    }
    $('result-title').textContent = title;
    $('result-text').textContent = text;
    $('result-hp-0').textContent = game.tanks[0].hp;
    $('result-hp-1').textContent = game.tanks[1].hp;
    $('result-art').className = 'result-art ' + art;
    persist();
    renderHud();
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => kit.modal.open('modal-result'), calm() ? 200 : 700);
  }

  /** Ván đang dở (đã bắn) thì hỏi trước, vì bỏ ván tính là thua. */
  function requestNew() {
    if (inProgress()) {
      $('confirm-text').textContent = t(isCpu() ? 'confirm.text' : 'confirm.textPvp');
      kit.modal.open('modal-confirm');
    } else newGame();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inProgress() && isCpu()) {
      const lv = stats.levels[cur.level];
      lv.played++;
      lv.lost++;
      stats.streak = 0;
      saveStats();
      kit.sdk.end({ mode: cur.level, won: false, assisted: false });
    }
    cur.ended = true;
    newGame();
  }

  /** Đổi mức / đối thủ: chưa bắn phát nào thì chơi ván mới ngay với cài đặt mới, đã bắn thì để ván sau. */
  function onSetting(key) {
    if (key === 'theme') {
      requestAnimationFrame(readColors);
      return;
    }
    if (key !== 'level' && key !== 'opponent') return;
    if (!game) return;
    if (!E.isOver(game) && cur.humanShots === 0 && phase !== 'fly') newGame();
    else kit.toast(t('toast.next'));
    renderLevelSetting();
  }
  function renderLevelSetting() {
    $('setting-level').classList.toggle('dim', kit.settings.get().opponent === 'human');
  }

  /* ---------------- Vòng lặp vẽ ---------------- */
  function updateFx(dt) {
    let busy = false;
    fx.shake = fx.shake > 0.3 ? fx.shake * Math.exp(-dt * 12) : 0;
    if (fx.shake) busy = true;
    fx.blasts = fx.blasts.filter((b) => (b.age += dt) < b.life);
    fx.parts = fx.parts.filter((p) => {
      p.age += dt;
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      return p.age < p.life;
    });
    fx.floats = fx.floats.filter((f) => (f.age += dt) < f.life);
    return busy || fx.blasts.length > 0 || fx.parts.length > 0 || fx.floats.length > 0;
  }

  let lastT = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1; // tab vừa quay lại: không bù cả quãng dài
    let busy = false;
    if (phase === 'fly' && anim) {
      stepAnim(dt);
      busy = true;
    }
    if (aiAim) {
      const k = clamp((performance.now() - aiAim.start) / aiAim.dur, 0, 1);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      shown.tanks[aiAim.side].angle = lerp(aiAim.from, aiAim.to, e);
      busy = true;
    }
    if (updateFx(dt)) busy = true;
    if (moveClouds(dt)) busy = true;
    if (busy || dirty) {
      draw();
      dirty = false;
    }
  }

  /* ---------------- Điều khiển ---------------- */
  // Kéo ngắm: hướng từ gốc nòng tới ngón tay là góc, khoảng cách là lực
  function aimAt(e) {
    const p = toWorld(e.clientX, e.clientY);
    const tk = shown.tanks[game.turn];
    const dx = p.x - tk.x;
    const dy = p.y - (tk.y + E.PIVOT_H);
    let a = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (a < 0) a = dx >= 0 ? 0 : 180;
    drag = p;
    setAim(a, (Math.hypot(dx, dy) / AIM_RANGE) * 100);
  }
  board.addEventListener('pointerdown', (e) => {
    if (!canAim() || e.button > 0) return;
    try {
      board.setPointerCapture(e.pointerId);
    } catch (err) { /* bỏ qua */ }
    aimAt(e);
    kit.sfx('tick', { volume: 0.4 });
  });
  board.addEventListener('pointermove', (e) => {
    if (!drag || !canAim()) return;
    aimAt(e);
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    dirty = true;
  };
  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', endDrag);
  board.addEventListener('lostpointercapture', endDrag);

  $('angle').addEventListener('input', (e) => { if (canAim()) setAim(180 - Number(e.target.value), aim.power); else renderControls(); });
  $('power').addEventListener('input', (e) => { if (canAim()) setAim(aim.angle, Number(e.target.value)); else renderControls(); });

  // Nút ‹ › − +: chạm một lần đổi 1 nấc, giữ thì chạy liên tục
  function holdButton(id, fn) {
    const el = $(id);
    let timer = 0;
    const stop = () => {
      clearTimeout(timer);
      timer = 0;
    };
    const run = (delay) => {
      if (!canAim()) return stop();
      fn();
      timer = setTimeout(() => run(60), delay);
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      stop();
      run(380);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, stop));
    el.addEventListener('click', (e) => { if (e.detail === 0 && canAim()) fn(); }); // bàn phím (Enter / Space trên nút)
  }
  holdButton('angle-left', () => setAim(aim.angle + 1, aim.power));
  holdButton('angle-right', () => setAim(aim.angle - 1, aim.power));
  holdButton('power-down', () => setAim(aim.angle, aim.power - 1));
  holdButton('power-up', () => setAim(aim.angle, aim.power + 1));

  document.querySelectorAll('.weapon').forEach((b) => b.addEventListener('click', () => selectWeapon(b.dataset.weapon)));
  $('weapons').addEventListener('keydown', (e) => {
    const i = WEAPON_KEYS.indexOf(weapon);
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % 3;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i + 2) % 3;
    if (j < 0) return;
    e.preventDefault();
    e.stopPropagation();
    for (let n = 0; n < 3 && !E.canUse(game, WEAPON_KEYS[j]); n++) j = (j + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 2)) % 3;
    selectWeapon(WEAPON_KEYS[j]);
    document.querySelector('.weapon[data-weapon="' + weapon + '"]').focus();
  });
  $('btn-fire').addEventListener('click', humanFire);

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key;
    const el = e.target && e.target.closest ? e.target.closest('button, input, select, a') : null;
    const onRange = !!el && el.classList.contains('range');
    const big = e.shiftKey ? 5 : 1;
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      if (onRange || (el && el.closest('.segmented, .weapons'))) return; // để thanh trượt / nhóm nút tự xử lý
      if (!canAim()) return;
      if (k === 'ArrowLeft') setAim(aim.angle + big, aim.power);
      else if (k === 'ArrowRight') setAim(aim.angle - big, aim.power);
      else if (k === 'ArrowUp') setAim(aim.angle, aim.power + big);
      else setAim(aim.angle, aim.power - big);
    } else if (k === ' ' || k === 'Enter') {
      if (el && !onRange && el.offsetParent !== null) return; // để trình duyệt bấm nút đang focus
      humanFire();
    } else if (k === '1' || k === '2' || k === '3') selectWeapon(WEAPON_KEYS[Number(k) - 1]);
    else if (k === 'n' || k === 'N') requestNew();
    else return;
    e.preventDefault();
  });

  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', newGame);
  $('btn-stats').addEventListener('click', renderStats);

  function renderStats() {
    const tot = totals();
    $('stats-played').textContent = fmt(tot.played);
    $('stats-won').textContent = fmt(tot.won);
    $('stats-accuracy').textContent = stats.shots ? Math.round((stats.hits / stats.shots) * 100) + '%' : '–';
    $('stats-best').textContent = fmt(stats.best);
    $('stats-body').innerHTML = LEVELS.map((lv) => {
      const r = stats.levels[lv];
      return '<tr><th scope="row">' + t('level.' + lv) + '</th><td>' + fmt(r.played) + '</td><td>' + fmt(r.won) + '</td><td>' + fmt(r.lost) + '</td><td>' + fmt(r.drawn) + '</td></tr>';
    }).join('');
  }

  // Rời trang khi đạn đang bay: kết thúc hoạt cảnh ngay để ván (và kết quả nếu là phát cuối) được ghi nhận
  kit.onLeave(() => {
    if (anim) endShot();
    persist();
  });
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => requestAnimationFrame(readColors));
  if (window.ResizeObserver) new ResizeObserver(() => { layout(); draw(); }).observe(board);
  window.addEventListener('resize', () => { layout(); draw(); });

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  readColors();
  layout();
  renderLevelSetting();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 && (saved.mode === 'cpu' || saved.mode === 'pvp') && LEVELS.indexOf(saved.level) >= 0 &&
    Number.isInteger(saved.humanShots) && saved.humanShots > 0 ? E.fromJSON(saved.game) : null;
  if (restored && !E.isOver(restored)) {
    setGame(restored, { mode: saved.mode, level: saved.level, humanShots: saved.humanShots, ended: false });
    if (saved.mode === 'cpu') kit.sdk.start(cur.level, true);
    kit.toast(t('toast.saved'));
    nextTurn();
    writeSummary();
  } else {
    kit.store.remove(keys.save);
    newGame();
  }
  if (!kit.settings.get().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
  // Fonts tải xong thì vẽ lại chữ trên canvas
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { dirty = true; });
  requestAnimationFrame((now) => {
    lastT = now;
    frame(now);
  });
})();
