/* =====================================================================
 * Đẩy Thùng - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Bàn chơi vẽ bằng SVG (1 đơn vị = 1 ô), thùng và người trượt bằng CSS transform
 *   - Điều khiển: phím mũi tên / WASD, vuốt, chạm ô sàn để tự đi (BFS), chạm thùng ngay cạnh để đẩy
 *   - Mỗi lần chơi một màn là một ván (metric wins, mode classic):
 *     · hiện màn: kit.sdk.start(MODE); mở lại ván lưu dở: kit.sdk.start(MODE, true)
 *     · qua màn: kit.sdk.end({ mode, won: true, assisted: false }) (hoàn tác / chơi lại không tính trợ giúp)
 *     · chơi lại hoặc rời màn khi đã đi ít nhất một bước: kit.sdk.end({ mode, won: false }); chưa đi thì không gửi
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const TOTAL = E.LEVELS.length;
  const WALK_MS = 55; // mỗi bước khi tự đi tới ô được chạm
  const kit = PNKit.init({ gameId: 'daythung', version: '1.0.0', dict: window.GAME_DICT });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touchUI = () => window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches;

  let game = null;
  let moved = false; // ván (lượt chơi màn hiện tại) đã đi ít nhất một bước, kể cả khi đã hoàn tác hết
  let over = false; // ván đã qua màn, đã gửi kết quả
  let facing = 2; // hướng mặt người (0 lên, 1 phải, 2 xuống, 3 trái)

  /* ---------------- Thống kê + tiến độ ---------------- */
  function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const int = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
    const s = { played: int(raw.played), won: int(raw.won), moves: int(raw.moves), solved: [], best: {}, current: 0 };
    if (Array.isArray(raw.solved)) s.solved = raw.solved.filter((i, k, a) => Number.isInteger(i) && i >= 0 && i < TOTAL && a.indexOf(i) === k);
    if (raw.best && typeof raw.best === 'object') {
      Object.keys(raw.best).forEach((k) => {
        const b = raw.best[k];
        const i = Number(k);
        if (Number.isInteger(i) && i >= 0 && i < TOTAL && b && Number.isInteger(b.m) && Number.isInteger(b.p)) s.best[i] = { m: b.m, p: b.p };
      });
    }
    if (Number.isInteger(raw.current) && raw.current >= 0 && raw.current < TOTAL) s.current = raw.current;
    return s;
  }
  const stats = loadStats();
  const saveStats = () => kit.store.write(keys.stats, stats);
  const isSolved = (i) => stats.solved.indexOf(i) >= 0;
  /** Màn chưa giải có số nhỏ nhất (giải hết thì -1). */
  function frontier() {
    for (let i = 0; i < TOTAL; i++) if (!isSolved(i)) return i;
    return -1;
  }
  /** Mở: mọi màn đã giải + màn chưa giải đầu tiên. */
  const unlocked = (i) => isSolved(i) || i === frontier();

  /* ---------------- Bàn chơi (SVG) ---------------- */
  const board = $('board');
  const stage = $('stage');
  let built = null; // { src, boxes: [g], player: g }

  function el(name, attrs, parent) {
    const n = document.createElementNS(SVGNS, name);
    Object.keys(attrs || {}).forEach((k) => n.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(n);
    return n;
  }
  const place = (node, i, w) => { node.style.transform = 'translate(' + (i % w) + 'px,' + Math.floor(i / w) + 'px)'; };

  /** Vẽ phần tĩnh (sàn, tường, đích) và tạo thùng + người; chỉ làm lại khi đổi màn. */
  function buildBoard() {
    const { w, h, wall, floor, goal } = game.map;
    board.textContent = '';
    board.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    const gFloor = el('g', { class: 'layer-floor' }, board);
    const gWall = el('g', { class: 'layer-wall' }, board);
    for (let i = 0; i < w * h; i++) {
      const x = i % w;
      const y = Math.floor(i / w);
      if (floor[i]) {
        el('rect', { x, y, width: 1, height: 1, class: 'floor' + ((x + y) % 2 ? ' alt' : '') }, gFloor);
        if (goal[i]) {
          el('circle', { cx: x + 0.5, cy: y + 0.5, r: 0.26, class: 'goal' }, gFloor);
          el('circle', { cx: x + 0.5, cy: y + 0.5, r: 0.1, class: 'goal-dot' }, gFloor);
        }
      } else if (wall[i]) {
        // Tường liền khối (ô đầy, phủ chồng một chút để không hở đường nối) + viên đá sáng hơn bên trong
        el('rect', { x: x - 0.01, y: y - 0.01, width: 1.02, height: 1.02, class: 'wall' }, gWall);
        el('rect', { x: x + 0.09, y: y + 0.09, width: 0.82, height: 0.82, rx: 0.14, class: 'wall-stone' }, gWall);
        el('rect', { x: x + 0.17, y: y + 0.15, width: 0.66, height: 0.14, rx: 0.07, class: 'wall-hi' }, gWall);
      }
    }
    const gBox = el('g', { class: 'layer-box' }, board);
    const boxes = game.boxes.map(() => {
      const b = el('g', { class: 'box' }, gBox);
      el('rect', { x: 0.08, y: 0.08, width: 0.84, height: 0.84, rx: 0.14, class: 'box-body' }, b);
      el('rect', { x: 0.2, y: 0.2, width: 0.6, height: 0.6, rx: 0.06, class: 'box-inner' }, b);
      el('path', { d: 'M0.24 0.24L0.76 0.76M0.76 0.24L0.24 0.76', class: 'box-cross' }, b);
      return b;
    });
    const player = el('g', { class: 'player' }, board);
    el('ellipse', { cx: 0.5, cy: 0.86, rx: 0.3, ry: 0.07, class: 'player-shadow' }, player);
    el('circle', { cx: 0.5, cy: 0.5, r: 0.34, class: 'player-body' }, player);
    const face = el('g', { class: 'player-face' }, player);
    el('circle', { cx: 0.38, cy: 0.46, r: 0.06, class: 'player-eye' }, face);
    el('circle', { cx: 0.62, cy: 0.46, r: 0.06, class: 'player-eye' }, face);
    built = { src: game.src, boxes, player, face };
    // Màn mới: đặt vị trí ngay, không trượt
    board.classList.add('no-anim');
    renderPieces();
    void board.getBoundingClientRect();
    board.classList.remove('no-anim');
    fitBoard();
  }

  function renderPieces() {
    const { w, goal } = game.map;
    game.boxes.forEach((b, k) => {
      place(built.boxes[k], b, w);
      built.boxes[k].classList.toggle('on', goal[b] === 1);
    });
    place(built.player, game.player, w);
    built.face.style.transform = 'translate(' + E.DX[facing] * 0.07 + 'px,' + E.DY[facing] * 0.06 + 'px)';
  }

  /** Cỡ ô theo khung còn trống (vừa 390×844 dọc và ngang), tối đa 64px. */
  function fitBoard() {
    if (!game) return;
    const { w, h } = game.map;
    const cs = Math.max(8, Math.floor(Math.min(stage.clientWidth / w, stage.clientHeight / h, 64)));
    board.style.width = cs * w + 'px';
    board.style.height = cs * h + 'px';
  }
  if (window.ResizeObserver) new ResizeObserver(fitBoard).observe(stage);
  else window.addEventListener('resize', fitBoard);

  /* ---------------- HUD ---------------- */
  function render() {
    if (!built || built.src !== game.src) buildBoard();
    else renderPieces();
    const lv = game.level + 1;
    $('level').textContent = lv;
    $('level-total').textContent = '/' + TOTAL;
    $('moves').textContent = kit.i18n.fmtNumber(E.moves(game));
    $('pushes').textContent = kit.i18n.fmtNumber(E.pushes(game));
    const best = stats.best[game.level];
    $('best').textContent = best ? kit.i18n.fmtNumber(best.m) : '–';
    $('btn-level').setAttribute('aria-label', t('hud.levelBtn', { n: lv }));
    $('btn-undo').disabled = !game.hist || over;
    $('btn-restart').disabled = !game.hist && !over;
    board.setAttribute('aria-label', t('board.label', { n: lv, on: E.onGoal(game), total: game.boxes.length }));
  }

  /* ---------------- Lưu ---------------- */
  function writeSummary() {
    const n = stats.solved.length;
    const inPlay = game && moved && !over;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: n ? t('summary.note', { n, total: TOTAL }) : t('summary.none'),
      stats: n ? [{ value: n + '/' + TOTAL, label: t('summary.solved') }] : [],
      resume: inPlay
        ? { title: t('summary.resume', { n: game.level + 1 }), detail: t('summary.detail', { on: E.onGoal(game), total: game.boxes.length }), pct: E.onGoal(game) / game.boxes.length }
        : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (game && moved && !over) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */
  /** Bỏ ván đang chơi: đã đi ít nhất một bước thì tính một lượt thua; chưa đi thì không gửi gì. */
  function abandon() {
    stopWalk();
    if (game && moved && !over) {
      stats.played++;
      saveStats();
      kit.sdk.end({ mode: MODE, won: false, assisted: false });
    }
  }

  /** Hiện màn i và bắt đầu ván mới (gửi start). */
  function showLevel(i) {
    stopWalk();
    game = E.newGame(i);
    moved = false;
    over = false;
    facing = 2;
    armedRestart = 0;
    stats.current = i;
    saveStats();
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    render();
    writeSummary();
  }

  function goLevel(i) {
    if (!unlocked(i)) return;
    if (game && i === game.level && !over) return;
    abandon();
    showLevel(i);
    kit.sfx('start');
  }

  /** Áp một nước của engine; trả true nếu đi được. */
  function step(dir) {
    if (!game || over) return false;
    const next = E.move(game, dir);
    facing = typeof dir === 'number' ? dir : E.LETTERS.indexOf(dir);
    if (next === game) {
      renderPieces();
      return false;
    }
    const pushed = E.pushes(next) > E.pushes(game);
    const onBefore = E.onGoal(game);
    game = next;
    moved = true;
    armedRestart = 0;
    if (pushed) kit.sfx(E.onGoal(game) > onBefore ? 'place' : 'move');
    render();
    if (E.isWon(game)) finish();
    return true;
  }

  function finish() {
    over = true;
    stopWalk();
    const lv = game.level;
    const m = E.moves(game);
    const p = E.pushes(game);
    const prev = stats.best[lv];
    const isBest = !prev || m < prev.m || (m === prev.m && p < prev.p);
    if (isBest) stats.best[lv] = { m, p };
    if (!isSolved(lv)) stats.solved.push(lv);
    stats.played++;
    stats.won++;
    stats.moves += m;
    const next = lv + 1 < TOTAL ? lv + 1 : frontier();
    if (next >= 0) stats.current = next;
    saveStats();
    persist();
    kit.sdk.end({ mode: MODE, won: true, assisted: false });
    kit.sfx('win');
    kit.confetti();
    render();
    $('win-title').textContent = t('win.title', { n: lv + 1 });
    $('win-result').textContent = t('win.result', { moves: kit.i18n.fmtNumber(m), pushes: kit.i18n.fmtNumber(p) });
    $('win-best').hidden = !(isBest && prev);
    $('win-prev').hidden = isBest || !prev;
    if (prev) $('win-prev').textContent = t('win.prevBest', { moves: kit.i18n.fmtNumber(stats.best[lv].m) });
    $('win-all').hidden = frontier() >= 0;
    $('btn-next').hidden = next < 0;
    setTimeout(() => {
      if (over && game.level === lv) kit.modal.open('modal-win');
    }, reduced() ? 0 : 450);
  }

  function nextLevel() {
    kit.modal.close('modal-win');
    const n = game.level + 1 < TOTAL ? game.level + 1 : frontier();
    if (n >= 0) goLevel(n);
  }

  function undo() {
    if (!game || over || !game.hist) return;
    stopWalk();
    game = E.undo(game);
    armedRestart = 0;
    kit.sfx('pop');
    render();
  }

  // Chơi lại khi đã đi: bấm hai lần trong 2,5 giây để không lỡ tay mất cả màn
  let armedRestart = 0;
  function restart() {
    if (!game) return;
    if (over) {
      kit.modal.close('modal-win');
      showLevel(game.level);
      kit.sfx('start');
      return;
    }
    if (!game.hist) return;
    const now = Date.now();
    if (now - armedRestart > 2500) {
      armedRestart = now;
      kit.toast(t(touchUI() ? 'toast.restartAgainTouch' : 'toast.restartAgain'), 2500);
      return;
    }
    abandon();
    showLevel(game.level);
    kit.sfx('start');
  }

  /* ---------------- Tự đi tới ô được chạm ---------------- */
  let walkTimer = 0;
  function stopWalk() {
    clearInterval(walkTimer);
    walkTimer = 0;
  }
  function walk(path) {
    stopWalk();
    if (reduced()) {
      for (const ch of path) if (!step(ch)) break;
      return;
    }
    let k = 0;
    walkTimer = setInterval(() => {
      if (k >= path.length || !step(path[k++])) stopWalk();
    }, WALK_MS);
    if (path.length) step(path[k++]);
  }

  /** Chạm ô (x, y): thùng ngay cạnh thì đẩy, ô sàn đi tới được thì tự đi. */
  function tapCell(x, y) {
    if (!game || over) return;
    const { w, h, floor } = game.map;
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (!floor[i] || i === game.player) return;
    const px = game.player % w;
    const py = Math.floor(game.player / w);
    if (E.boxAt(game, i) >= 0) {
      if (Math.abs(px - x) + Math.abs(py - y) === 1) {
        stopWalk();
        const d = x > px ? 1 : x < px ? 3 : y > py ? 2 : 0;
        if (!step(d)) kit.sfx('error');
      }
      return;
    }
    const path = E.pathTo(game, i);
    if (path) walk(path);
    else kit.sfx('error');
  }

  /* ---------------- Chạm / vuốt trên bàn ---------------- */
  let down = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  stage.addEventListener('pointerup', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down = null;
    if (kit.modal.current()) return;
    const cs = board.getBoundingClientRect().width / game.map.w;
    const min = Math.max(18, Math.min(40, cs * 0.6));
    if (Math.abs(dx) >= min || Math.abs(dy) >= min) {
      stopWalk();
      step(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
      return;
    }
    const r = board.getBoundingClientRect();
    tapCell(Math.floor(((e.clientX - r.left) / r.width) * game.map.w), Math.floor(((e.clientY - r.top) / r.height) * game.map.h));
  });
  stage.addEventListener('pointercancel', () => { down = null; });

  /* ---------------- Chọn màn ---------------- */
  function renderLevels() {
    const grid = $('level-grid');
    grid.textContent = '';
    $('levels-progress').textContent = t('levels.progress', { n: stats.solved.length, total: TOTAL });
    for (let i = 0; i < TOTAL; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'level-btn';
      const open = unlocked(i);
      const best = stats.best[i];
      b.disabled = !open;
      if (isSolved(i)) b.classList.add('solved');
      if (game && i === game.level) {
        b.classList.add('current');
        b.setAttribute('aria-current', 'true');
      }
      b.setAttribute('aria-label', !open ? t('levels.locked', { n: i + 1 }) : best ? t('levels.solved', { n: i + 1, moves: best.m }) : t('levels.open', { n: i + 1 }));
      b.innerHTML = open
        ? '<span class="level-num">' + (i + 1) + '</span>' + (best ? '<span class="level-best">' + best.m + '</span>' : '')
        : '<svg class="level-lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-7-2a2 2 0 0 1 4 0v2h-4V7z"/></svg>';
      b.addEventListener('click', () => {
        kit.modal.close('modal-levels');
        goLevel(i);
      });
      grid.appendChild(b);
    }
  }
  function openLevels() {
    stopWalk();
    renderLevels();
    kit.modal.closeAll();
    kit.modal.open('modal-levels');
    const cur = document.querySelector('.level-btn.current') || document.querySelector('.level-btn:not(:disabled)');
    if (cur) cur.focus();
  }

  /* ---------------- Hình chú thích trong Cách chơi ---------------- */
  (function legend() {
    const svg = $('help-legend');
    [0, 1, 2].forEach((k) => {
      el('rect', { x: k, y: 0, width: 1, height: 1, class: 'floor' + (k % 2 ? ' alt' : '') }, svg);
      if (k > 0) el('circle', { cx: k + 0.5, cy: 0.5, r: 0.26, class: 'goal' }, svg);
      if (k > 0) el('circle', { cx: k + 0.5, cy: 0.5, r: 0.1, class: 'goal-dot' }, svg);
      if (k !== 1) {
        const b = el('g', { class: 'box' + (k === 2 ? ' on' : ''), transform: 'translate(' + k + ' 0)' }, svg);
        el('rect', { x: 0.08, y: 0.08, width: 0.84, height: 0.84, rx: 0.14, class: 'box-body' }, b);
        el('rect', { x: 0.2, y: 0.2, width: 0.6, height: 0.6, rx: 0.06, class: 'box-inner' }, b);
        el('path', { d: 'M0.24 0.24L0.76 0.76M0.76 0.24L0.24 0.76', class: 'box-cross' }, b);
      }
    });
  })();

  /* ---------------- Sự kiện ---------------- */
  $('btn-undo').addEventListener('click', undo);
  $('btn-restart').addEventListener('click', restart);
  $('btn-levels').addEventListener('click', openLevels);
  $('btn-level').addEventListener('click', openLevels);
  $('btn-next').addEventListener('click', nextLevel);
  $('btn-replay').addEventListener('click', () => {
    kit.modal.close('modal-win');
    showLevel(game.level);
    kit.sfx('start');
  });
  $('btn-win-levels').addEventListener('click', openLevels);
  $('btn-stats').addEventListener('click', () => {
    $('stats-solved').textContent = stats.solved.length + '/' + TOTAL;
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-moves').textContent = kit.i18n.fmtNumber(stats.moves);
  });

  const KEYS = { arrowup: 0, w: 0, arrowright: 1, d: 1, arrowdown: 2, s: 2, arrowleft: 3, a: 3 };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey) {
      // Ctrl+Z cũng hoàn tác
      if (k === 'z' && !kit.modal.current()) {
        undo();
        e.preventDefault();
      }
      return;
    }
    const open = kit.modal.current();
    if (open) {
      if (open.id === 'modal-win' && k === 'n') nextLevel();
      else if (open.id === 'modal-win' && k === 'r') restart();
      return;
    }
    if (k in KEYS) {
      stopWalk();
      step(KEYS[k]);
    } else if (k === 'z' || k === 'u' || k === 'backspace') undo();
    else if (k === 'r') restart();
    else if (k === 'l') openLevels();
    else if (k === 'n' && over) nextLevel();
    else return;
    e.preventDefault();
  });
  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && !E.isWon(restored) && unlocked(restored.level)) {
    game = restored;
    moved = true;
    stats.current = game.level;
    kit.sdk.start(MODE, true);
    render();
    kit.toast(t('toast.saved'));
    writeSummary();
  } else {
    kit.store.remove(keys.save);
    showLevel(unlocked(stats.current) ? stats.current : Math.max(0, frontier()));
  }
})();
