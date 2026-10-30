/* =====================================================================
 * Rắn Leo Thang - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Bạn (người chơi 0) đua với 1-3 máy; bạn luôn tung trước, máy tự tung theo nhịp của cài đặt Tốc độ
 *   - Bàn vẽ bằng SVG (ô màu, thang gỗ, rắn khúc khuỷu thon dần); quân là lớp HTML phủ trên, đi từng ô
 *   - Trạng thái ván đổi ngay khi tung (engine), hiệu ứng chỉ là phần trình diễn đuổi theo sau
 *   - Báo ván cho cổng (mode 'classic', metric wins):
 *     - ván mới: kit.sdk.start(MODE); mở lại ván lưu dở: kit.sdk.start(MODE, true)
 *     - bạn về 100 trước: won true; máy về 100 trước: won false (gửi ngay lúc tung, không chờ hiệu ứng)
 *     - bỏ ván sau lần tung đầu: won false; chưa tung lần nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const kit = PNKit.init({
    gameId: 'ranleothang',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { bots: '3', extraSix: true, speed: 'normal' },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);

  /* Nhịp theo cài đặt Tốc độ (ms): máy nghĩ, xúc xắc lăn, mỗi bước, trượt rắn / leo thang, nghỉ sau nước */
  const SPEEDS = {
    slow: { think: 1100, tumble: 620, step: 240, glide: 950, rest: 550 },
    normal: { think: 700, tumble: 460, step: 165, glide: 680, rest: 380 },
    fast: { think: 300, tumble: 260, step: 90, glide: 380, rest: 180 },
  };
  function pace() {
    const s = SPEEDS[kit.settings.get().speed] || SPEEDS.normal;
    // Giảm chuyển động: không lăn xúc xắc, đi nhanh, nhảy thẳng tới cuối rắn / thang
    return calm() ? Object.assign({}, s, { tumble: 0, step: 45, glide: 0 }) : s;
  }

  /* Bảng màu rắn: thân, viền / khoang đậm, khoang sáng */
  const SNAKE_COLORS = [
    ['#43a047', '#1b5e20', '#c5e1a5'],
    ['#8e24aa', '#4a148c', '#e1bee7'],
    ['#fb8c00', '#9a4a00', '#ffe0b2'],
    ['#e53935', '#8e1b1b', '#ffcdd2'],
    ['#00897b', '#004d40', '#b2dfdb'],
    ['#3949ab', '#1a237e', '#c5cae9'],
    ['#d81b60', '#880e4f', '#f8bbd0'],
    ['#7cb342', '#33691e', '#f0f4c3'],
  ];

  const defaultStats = { played: 0, won: 0, best: null };
  const stats = Object.assign({}, defaultStats, kit.store.read(keys.stats, {}) || {});

  let game = null;
  let shown = []; // ô đang vẽ của từng quân (đuổi theo game.pos trong lúc hiệu ứng)
  let gen = 0; // tăng mỗi ván mới: hiệu ứng của ván cũ tự dừng
  let busy = false; // đang trình diễn một lần tung
  let cpuTimer = 0;
  let logText = '';
  let lastDie = 1;
  let builtLayout = -1;
  let geom = {}; // ô bắt đầu của rắn / thang -> các điểm đường đi (tọa độ SVG 0..1000)
  let wraps = [];

  const inPlay = () => !!game && game.rolls > 0 && !E.isOver(game);
  const nameOf = (p) => (p === 0 ? t('player.you') : t('player.cpu', { n: p }));
  const layoutName = () => t('layout.' + E.LAYOUTS[game.layout].id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Tâm ô `n` (1..100) trong tọa độ SVG. */
  function center(n) {
    const c = E.coord(n);
    return [c.col * 100 + 50, (9 - c.row) * 100 + 50];
  }

  /* ---------------- Vẽ bàn (SVG) ---------------- */

  function el(name, attrs, parent) {
    const node = document.createElementNS(SVGNS, name);
    Object.keys(attrs).forEach((k) => node.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(node);
    return node;
  }
  const f1 = (x) => Math.round(x * 10) / 10;
  const pts = (list) => list.map((p) => f1(p[0]) + ',' + f1(p[1])).join(' ');

  /** Đường cong Catmull-Rom dày đặc qua các điểm điều khiển. */
  function smooth(ctrl, per) {
    const out = [];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = ctrl[Math.max(0, i - 1)];
      const p1 = ctrl[i];
      const p2 = ctrl[i + 1];
      const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
      for (let k = 0; k < per; k++) {
        const s = k / per;
        const s2 = s * s;
        const s3 = s2 * s;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s2 + (-a + 3 * b - 3 * c + d) * s3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    out.push(ctrl[ctrl.length - 1]);
    return out;
  }

  function drawLadder(g, from, to) {
    const a = center(from);
    const b = center(to);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy * 17;
    const ny = ux * 17;
    const s = [a[0] - ux * 22, a[1] - uy * 22];
    const e = [b[0] + ux * 22, b[1] + uy * 22];
    const grp = el('g', { class: 'ladder' }, g);
    // Bóng đổ nhẹ cho thang nổi khỏi bàn
    el('path', { class: 'ladder-shadow', d: 'M' + pts([[s[0] + nx + 5, s[1] + ny + 7], [e[0] + nx + 5, e[1] + ny + 7]]) + 'M' + pts([[s[0] - nx + 5, s[1] - ny + 7], [e[0] - nx + 5, e[1] - ny + 7]]) }, grp);
    let rungs = '';
    for (let d = 26; d < len + 30; d += 40) {
      const cx = s[0] + ux * d;
      const cy = s[1] + uy * d;
      rungs += 'M' + pts([[cx + nx, cy + ny], [cx - nx, cy - ny]]);
    }
    el('path', { class: 'rung-dark', d: rungs }, grp);
    el('path', { class: 'rung', d: rungs }, grp);
    const rails = 'M' + pts([[s[0] + nx, s[1] + ny], [e[0] + nx, e[1] + ny]]) + 'M' + pts([[s[0] - nx, s[1] - ny], [e[0] - nx, e[1] - ny]]);
    el('path', { class: 'rail-dark', d: rails }, grp);
    el('path', { class: 'rail', d: rails }, grp);
    geom[from] = [a, b];
  }

  function drawSnake(g, from, to, idx) {
    const [body, dark, band] = SNAKE_COLORS[idx % SNAKE_COLORS.length];
    const H = center(from);
    const T = center(to);
    const dx = T[0] - H[0];
    const dy = T[1] - H[1];
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const waves = Math.max(1, Math.round(len / 250));
    const amp = Math.min(44, 20 + len * 0.05);
    const phase = idx % 2 ? Math.PI : 0;
    const steps = Math.max(10, Math.round(len / 30));
    const ctrl = [];
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.15)), 0.7);
      const off = amp * env * Math.sin(2 * Math.PI * waves * s + phase);
      ctrl.push([H[0] + dx * s - uy * off, H[1] + dy * s + ux * off]);
    }
    const line = smooth(ctrl, 4);
    // Độ dày thân theo độ dài cung: to ở đầu, thon dần về đuôi
    const acc = [0];
    for (let i = 1; i < line.length; i++) acc.push(acc[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
    const total = acc[acc.length - 1];
    const width = (s) => 30 - 24 * Math.pow(s, 1.3);
    const left = [];
    const right = [];
    const normalAt = (i) => {
      const p = line[Math.max(0, i - 1)];
      const q = line[Math.min(line.length - 1, i + 1)];
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      return [-(q[1] - p[1]) / l, (q[0] - p[0]) / l];
    };
    line.forEach((p, i) => {
      const w = width(acc[i] / total) / 2;
      const n = normalAt(i);
      left.push([p[0] + n[0] * w, p[1] + n[1] * w]);
      right.push([p[0] - n[0] * w, p[1] - n[1] * w]);
    });
    const grp = el('g', { class: 'snake' }, g);
    const outline = 'M' + pts(left) + 'L' + pts(right.reverse()) + 'Z';
    el('path', { class: 'snake-shadow', d: outline }, grp);
    el('path', { d: outline, fill: body, stroke: dark, 'stroke-width': 4, 'stroke-linejoin': 'round' }, grp);
    // Khoang ngang dọc thân
    let bands = '';
    for (let d = 46; d < total - 26; d += 30) {
      const i = acc.findIndex((x) => x >= d);
      const n = normalAt(i);
      const w = width(acc[i] / total) * 0.36;
      bands += 'M' + pts([[line[i][0] + n[0] * w, line[i][1] + n[1] * w], [line[i][0] - n[0] * w, line[i][1] - n[1] * w]]);
    }
    el('path', { d: bands, stroke: band, 'stroke-width': 7, 'stroke-linecap': 'round', fill: 'none', opacity: 0.9 }, grp);
    // Đầu: hình bầu dục quay theo hướng thân, mắt, lưỡi chẻ
    const back = line[Math.min(line.length - 1, 6)];
    let fx = H[0] - back[0];
    let fy = H[1] - back[1];
    const fl = Math.hypot(fx, fy) || 1;
    fx /= fl;
    fy /= fl;
    const ang = (Math.atan2(fy, fx) * 180) / Math.PI;
    const hx = H[0] + fx * 4;
    const hy = H[1] + fy * 4;
    el('path', {
      d: 'M' + pts([[hx + fx * 24, hy + fy * 24], [hx + fx * 36, hy + fy * 36]]) + 'M' + pts([[hx + fx * 36, hy + fy * 36], [hx + fx * 43 - fy * 6, hy + fy * 43 + fx * 6]]) + 'M' + pts([[hx + fx * 36, hy + fy * 36], [hx + fx * 43 + fy * 6, hy + fy * 43 - fx * 6]]),
      class: 'tongue',
    }, grp);
    el('ellipse', { cx: f1(hx), cy: f1(hy), rx: 27, ry: 21, transform: 'rotate(' + f1(ang) + ' ' + f1(hx) + ' ' + f1(hy) + ')', fill: body, stroke: dark, 'stroke-width': 4 }, grp);
    [-1, 1].forEach((side) => {
      const ex = hx + fx * 8 - fy * 10 * side;
      const ey = hy + fy * 8 + fx * 10 * side;
      el('circle', { cx: f1(ex), cy: f1(ey), r: 7.5, fill: '#fff', stroke: dark, 'stroke-width': 1.5 }, grp);
      el('circle', { cx: f1(ex + fx * 2), cy: f1(ey + fy * 2), r: 4, fill: '#111' }, grp);
    });
    geom[from] = line;
  }

  function buildBoard() {
    const L = E.LAYOUTS[game.layout];
    const svg = $('board');
    svg.textContent = '';
    geom = {};
    $('board-wrap').dataset.layout = L.id;
    const cells = el('g', { class: 'cells' }, svg);
    for (let n = 1; n <= 100; n++) {
      const { row, col } = E.coord(n);
      const x = col * 100;
      const y = (9 - row) * 100;
      const cls = n === 100 ? 'cell goal' : 'cell c' + ((col + row * 2) % 5);
      el('rect', { class: cls, x, y, width: 100, height: 100 }, cells);
      const num = el('text', { class: n === 100 ? 'num num-goal' : 'num', x: x + 9, y: y + 29 }, cells);
      num.textContent = n;
    }
    // Cúp ở ô 100
    const [gx, gy] = center(100);
    el('path', {
      class: 'trophy',
      d: 'M' + (gx - 20) + ' ' + (gy - 14) + 'h40v10a20 20 0 0 1-14 19v8h9v9h-30v-9h9v-8a20 20 0 0 1-14-19z'
        + 'M' + (gx - 20) + ' ' + (gy - 9) + 'h-10v4a12 12 0 0 0 11 12M' + (gx + 20) + ' ' + (gy - 9) + 'h10v4a12 12 0 0 1-11 12',
    }, cells);
    const ladders = el('g', { class: 'ladders' }, svg);
    L.ladders.forEach(([a, b]) => drawLadder(ladders, a, b));
    const snakes = el('g', { class: 'snakes' }, svg);
    L.snakes.forEach(([a, b], i) => drawSnake(snakes, a, b, i));
    builtLayout = game.layout;
    svg.setAttribute('aria-label', t('board.label', { name: layoutName() }));
  }

  /* ---------------- Quân ---------------- */

  function buildTokens() {
    const box = $('tokens');
    box.textContent = '';
    wraps = [];
    for (let p = 0; p < game.players; p++) {
      const w = document.createElement('div');
      w.className = 'tok-wrap';
      w.dataset.p = p;
      const tok = document.createElement('div');
      tok.className = 'token';
      tok.textContent = p === 0 ? '★' : String(p);
      w.appendChild(tok);
      box.appendChild(w);
      wraps.push(w);
    }
  }

  // Lệch trong ô khi nhiều quân đứng chung (đơn vị: % cỡ ô)
  const SPREAD = [
    [[0, 0]],
    [[-22, 0], [22, 0]],
    [[-22, -17], [22, -17], [0, 19]],
    [[-21, -21], [21, -21], [-21, 21], [21, 21]],
  ];

  /** Đặt quân theo `shown`; quân chưa vào bàn đứng mờ ở ô 1. */
  function placeTokens() {
    const groups = {};
    shown.forEach((sq, p) => {
      const k = Math.max(1, sq);
      (groups[k] = groups[k] || []).push(p);
    });
    shown.forEach((sq, p) => {
      const w = wraps[p];
      if (!w || w.classList.contains('gliding')) return;
      const k = Math.max(1, sq);
      const g = groups[k];
      const off = SPREAD[g.length - 1][g.indexOf(p)];
      const c = E.coord(k);
      w.style.setProperty('--x', c.col);
      w.style.setProperty('--y', 9 - c.row);
      w.style.setProperty('--ox', off[0] + '%');
      w.style.setProperty('--oy', off[1] + '%');
      w.classList.toggle('shared', g.length > 1);
      w.classList.toggle('out', sq === 0);
      w.classList.toggle('active', !E.isOver(game) && game.turn === p);
      w.classList.toggle('winner', game.winner === p && shown[p] === 100);
    });
  }

  /** Nảy nhẹ quân mỗi bước. */
  function hop(p) {
    if (calm()) return;
    const tok = wraps[p].firstChild;
    tok.classList.remove('hop');
    void tok.offsetWidth;
    tok.classList.add('hop');
  }

  /** Trượt quân dọc thân rắn / thang (rAF), giảm chuyển động thì nhảy thẳng. */
  function glide(p, line, ms, my) {
    return new Promise((resolve) => {
      const w = wraps[p];
      if (!ms || !line || line.length < 2) return resolve();
      const acc = [0];
      for (let i = 1; i < line.length; i++) acc.push(acc[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
      const total = acc[acc.length - 1];
      w.classList.add('gliding');
      w.style.setProperty('--ox', '0%');
      w.style.setProperty('--oy', '0%');
      const t0 = performance.now();
      const frame = (now) => {
        if (my !== gen) {
          w.classList.remove('gliding');
          return resolve();
        }
        const s = Math.min(1, (now - t0) / ms);
        const e = s < 0.5 ? 2 * s * s : 1 - Math.pow(-2 * s + 2, 2) / 2;
        const d = e * total;
        let i = 1;
        while (i < acc.length - 1 && acc[i] < d) i++;
        const r = (d - acc[i - 1]) / (acc[i] - acc[i - 1] || 1);
        const x = line[i - 1][0] + (line[i][0] - line[i - 1][0]) * r;
        const y = line[i - 1][1] + (line[i][1] - line[i - 1][1]) * r;
        w.style.setProperty('--x', x / 100 - 0.5);
        w.style.setProperty('--y', y / 100 - 0.5);
        if (s < 1) requestAnimationFrame(frame);
        else {
          w.classList.remove('gliding');
          resolve();
        }
      };
      requestAnimationFrame(frame);
    });
  }

  /* ---------------- Vẽ phần còn lại ---------------- */

  const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function setDie(v) {
    lastDie = v;
    const on = PIPS[v] || [];
    $('die-face').querySelectorAll('i').forEach((pip, i) => pip.classList.toggle('on', on.indexOf(i) >= 0));
  }

  function renderPlayers() {
    const box = $('players');
    if (box.children.length !== game.players) {
      box.textContent = '';
      for (let p = 0; p < game.players; p++) {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.dataset.p = p;
        chip.innerHTML = '<span class="chip-dot" aria-hidden="true"></span><span class="chip-text"><span class="chip-name"></span><span class="chip-pos"></span></span>';
        box.appendChild(chip);
      }
    }
    Array.from(box.children).forEach((chip, p) => {
      const sq = shown[p];
      chip.querySelector('.chip-name').textContent = nameOf(p);
      chip.querySelector('.chip-pos').textContent = sq === 0 ? '–' : kit.i18n.fmtNumber(sq);
      chip.querySelector('.chip-dot').textContent = p === 0 ? '★' : String(p);
      chip.classList.toggle('active', !E.isOver(game) && game.turn === p);
      chip.classList.toggle('winner', game.winner === p);
      chip.setAttribute('aria-label', sq === 0 ? t('player.out', { name: nameOf(p) }) : t('player.at', { name: nameOf(p), n: sq }));
    });
  }

  function renderStatus() {
    const p = game.turn;
    const turn = $('status-turn');
    turn.dataset.p = p;
    if (E.isOver(game) && !busy) turn.textContent = t('turn.won', { name: nameOf(game.winner) });
    else turn.textContent = p === 0 ? t('turn.you') : t('turn.cpu', { name: nameOf(p) });
    $('status-log').textContent = logText || (game.rolls === 0 ? t('hint.start', { board: layoutName() }) : '');
    const btn = $('btn-roll');
    const mine = !busy && !E.isOver(game) && p === 0;
    btn.disabled = !mine;
    btn.classList.toggle('ready', mine);
    btn.dataset.p = busy ? btn.dataset.p : p;
    btn.setAttribute('aria-label', mine ? t('die.label') : t('die.wait', { n: lastDie }));
  }

  function render() {
    if (builtLayout !== game.layout) buildBoard();
    if (wraps.length !== game.players) buildTokens();
    placeTokens();
    renderPlayers();
    renderStatus();
  }

  /* ---------------- Lưu ---------------- */

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }

  function writeSummary() {
    const lead = game ? Math.max.apply(null, game.pos.slice(1)) : 0;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: stats.played === 0 ? t('summary.none') : t('summary.note', { won: stats.won, played: stats.played }),
      stats: stats.played > 0
        ? [{ value: kit.i18n.fmtNumber(stats.won), label: t('stats.won') }].concat(stats.best == null ? [] : [{ value: kit.i18n.fmtNumber(stats.best), label: t('stats.best') }])
        : [],
      resume: inPlay() ? { title: t('app.name'), detail: t('summary.resume', { you: game.pos[0], lead }), pct: game.pos[0] / 100 } : null,
      now: Date.now(),
    }));
  }

  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), log: logText, die: lastDie, elapsed: Math.round(clock.elapsed()) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */

  function settingsGame() {
    const s = kit.settings.get();
    const bots = Math.max(1, Math.min(3, parseInt(s.bots, 10) || 3));
    return { players: bots + 1, extraSix: s.extraSix !== false };
  }

  function newGame() {
    gen++;
    busy = false;
    clearTimeout(cpuTimer);
    const o = settingsGame();
    game = E.newGame({ players: o.players, extraSix: o.extraSix, seed: Math.floor(Math.random() * 4294967296) });
    shown = game.pos.slice();
    wraps = []; // dựng lại quân (bỏ trạng thái hiệu ứng của ván cũ)
    logText = '';
    $('btn-roll').classList.remove('rolling');
    setDie(1);
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    render();
    writeSummary();
  }

  /** Ván kết thúc (ngay lúc tung trúng 100): thống kê + báo cổng; bảng kết quả hiện sau hiệu ứng. */
  function record() {
    clock.pause();
    const won = game.winner === 0;
    stats.played++;
    if (won) {
      stats.won++;
      if (stats.best == null || game.counts[0] < stats.best) stats.best = game.counts[0];
    }
    saveStats();
    kit.sdk.end({ mode: MODE, won, timeMs: Math.round(clock.elapsed()), assisted: false });
  }

  function showResult() {
    const won = game.winner === 0;
    const name = nameOf(game.winner);
    $('end-badge').dataset.p = game.winner;
    $('end-badge').textContent = won ? '★' : String(game.winner);
    $('end-title').textContent = won ? t('end.winTitle') : t('end.loseTitle', { name });
    $('end-text').textContent = won ? t('end.winText', { n: game.counts[0] }) : t('end.loseText', { name });
    kit.sfx(won ? 'win' : 'lose');
    if (won) kit.confetti();
    kit.modal.open('modal-end');
  }

  function describe(m) {
    const parts = [t('log.roll', { name: nameOf(m.player), n: m.roll })];
    if (m.jump) parts.push(t(m.jump.type === 'ladder' ? 'log.ladder' : 'log.snake', { from: m.jump.from, to: m.jump.to }));
    else if (m.bounced) parts.push(t('log.bounce', { to: m.to }));
    else parts.push(t('log.to', { to: m.to }));
    if (m.extra) parts.push(t('log.extra'));
    return parts.join(' · ');
  }

  /** Xúc xắc lăn: đổi mặt ngẫu nhiên vài lần rồi dừng ở `v`. */
  async function tumble(v, ms, my) {
    const btn = $('btn-roll');
    if (ms > 0) {
      btn.classList.remove('rolling');
      void btn.offsetWidth;
      btn.classList.add('rolling');
      const until = performance.now() + ms;
      let prev = lastDie;
      while (performance.now() < until) {
        let f = 1 + Math.floor(Math.random() * 6);
        if (f === prev) f = (f % 6) + 1;
        prev = f;
        setDie(f);
        await sleep(70);
        if (my !== gen) return;
      }
      btn.classList.remove('rolling');
    }
    setDie(v);
  }

  /** Một lần tung của người đang tới lượt (bạn hoặc máy). */
  async function playRoll() {
    const my = gen;
    const first = game.rolls === 0;
    const r = E.roll(game);
    if (!r.move) return;
    const m = r.move;
    game = r.game;
    busy = true;
    if (first) clock.start();
    else clock.resume();
    if (E.isOver(game)) record();
    persist();
    const sp = pace();
    $('btn-roll').dataset.p = m.player;
    renderStatus();
    kit.sfx('tap');
    await tumble(m.roll, sp.tumble, my);
    if (my !== gen) return;
    kit.sfx('flip');
    await sleep(Math.min(220, sp.rest));
    for (const sq of m.path) {
      if (my !== gen) return;
      shown[m.player] = sq;
      placeTokens();
      renderPlayers();
      hop(m.player);
      kit.sfx('tick');
      await sleep(sp.step);
    }
    if (my !== gen) return;
    if (m.bounced && !m.jump) kit.sfx('pop');
    if (m.jump) {
      await sleep(sp.glide ? 140 : 90);
      if (my !== gen) return;
      kit.sfx(m.jump.type === 'ladder' ? 'levelup' : 'drop');
      await glide(m.player, geom[m.jump.from], sp.glide, my);
      if (my !== gen) return;
      shown[m.player] = m.to;
    }
    logText = describe(m);
    busy = false;
    persist();
    render();
    if (m.won) {
      await sleep(sp.rest + 250);
      if (my === gen) showResult();
      return;
    }
    if (m.extra) kit.sfx('coin');
    scheduleCpu();
  }

  /** Lượt máy: chờ một nhịp rồi tự tung; đang mở hộp thoại hoặc trang ẩn thì đợi. */
  function scheduleCpu() {
    clearTimeout(cpuTimer);
    if (!game || busy || E.isOver(game) || game.turn === 0) return;
    const my = gen;
    cpuTimer = setTimeout(() => {
      if (my !== gen || busy) return;
      if (kit.modal.current() || document.hidden) return scheduleCpu();
      playRoll();
    }, pace().think);
  }

  /** Bạn tung (chạm xúc xắc / Space). */
  function rollYours() {
    if (!game || busy || E.isOver(game) || game.turn !== 0 || kit.modal.current()) return;
    playRoll();
  }

  /** Ván đang dở (đã tung) thì hỏi trước, vì bỏ ván tính là thua. */
  function requestNew() {
    if (inPlay()) kit.modal.open('modal-confirm');
    else newGame();
  }

  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inPlay()) {
      stats.played++;
      saveStats();
      kit.sdk.end({ mode: MODE, won: false, timeMs: Math.round(clock.elapsed()), assisted: false });
    }
    newGame();
  }

  /** Đổi số máy / luật 6: chưa tung thì chia lại ván ngay, đang dở thì áp dụng từ ván sau. */
  function onSetting(key) {
    if (!game) return;
    if (key === 'bots' || key === 'extraSix') {
      if (inPlay() || busy) {
        kit.toast(t('toast.nextGame'));
        return;
      }
      const o = settingsGame();
      if (o.players !== game.players || o.extraSix !== game.extraSix) newGame();
    }
  }

  /* ---------------- Sự kiện ---------------- */
  $('btn-roll').addEventListener('click', rollYours);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-end');
    newGame();
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-rate').textContent = stats.played ? Math.round((stats.won / stats.played) * 100) + '%' : '–';
    $('stats-best').textContent = stats.best == null ? '–' : kit.i18n.fmtNumber(stats.best);
  });
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key.toLowerCase();
    // Space / Enter trên một nút đã thành cú bấm của trình duyệt: không tung thêm lần nữa
    if (k === ' ' || k === 'enter') {
      if (e.target && e.target.closest && e.target.closest('button')) return;
      rollYours();
    } else if (k === 'n') requestNew();
    else return;
    e.preventDefault();
  });
  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && E.fromJSON(saved.game);
  if (restored && restored.rolls > 0 && !E.isOver(restored)) {
    game = restored;
    shown = game.pos.slice();
    logText = typeof saved.log === 'string' ? saved.log.slice(0, 200) : '';
    setDie(Number.isInteger(saved.die) && saved.die >= 1 && saved.die <= 6 ? saved.die : 1);
    clock.set(saved.elapsed);
    clock.resume();
    kit.sdk.start(MODE, true);
    kit.toast(t('toast.saved'));
    render();
    writeSummary();
    scheduleCpu();
  } else {
    newGame();
  }
})();
