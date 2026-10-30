/* =====================================================================
 * Thoát Xe - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, puzzles.js, engine.js nạp trước)
 *   - Bãi đỗ là các phần tử .car đặt bằng transform theo cỡ ô (tính theo khung), hình xe vẽ bằng SVG
 *   - Điều khiển: kéo xe theo trục (chuột / chạm, chặn khi gặp xe khác, thả ra thì dừng đúng ô);
 *     bàn phím: Tab / mũi tên ngang trục chọn xe, mũi tên dọc trục trượt một ô, Home / End trượt hết cỡ
 *   - Mỗi lần chơi một bàn (hoặc đề ngày) là một ván, mode = mức ('easy' | 'medium' | 'hard' | 'daily'):
 *     · hiện bàn: kit.sdk.start(mode); mở lại ván lưu dở: kit.sdk.start(mode, true)
 *     · giải xong: kit.sdk.end({ mode, won: true, assisted }) (assisted = đã dùng Gợi ý)
 *     · chơi lại / rời bàn khi đã đi ít nhất một nước: kit.sdk.end({ mode, won: false, assisted }); chưa đi thì không gửi
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const N = E.N;
  const kit = PNKit.init({ gameId: 'thoatxe', version: '1.0.1', dict: window.GAME_DICT });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touchUI = () => window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches;

  // Màu + họa tiết xe (xe 0 luôn là xe đỏ); 14 màu × 6 họa tiết nên hai xe trong một bàn không bao giờ giống hệt nhau
  const RED = '#e5383b';
  const COLORS = ['#3b82f6', '#22a559', '#f2b705', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899', '#84cc16', '#1e3a8a', '#a0643c', '#06b6d4', '#64748b', '#c026d3', '#6b8e23'];
  const PATTERNS = ['stripes', 'dots', 'check', 'band', 'zig', 'frame'];

  let game = null;
  let moved = false; // ván (lượt chơi bàn hiện tại) đã đi ít nhất một nước, kể cả khi đã hoàn tác hết
  let over = false; // đã giải xong, đã gửi kết quả
  let stats = E.cleanStats(kit.store.read(keys.stats, {}));
  const saveStats = () => kit.store.write(keys.stats, stats);

  const pad2 = (n) => String(n).padStart(2, '0');
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  const starText = (s) => '★'.repeat(s) + '☆'.repeat(3 - s);
  const levelName = (lv) => t('level.' + lv);
  /** Tên ván đang chơi: "Dễ · Bàn 3" / "Đề ngày #297". */
  function gameName(g) {
    if (g.level === 'daily') return t('summary.dailyTitle', { n: E.dailyPuzzle(g.board).no });
    return levelName(g.level) + ' · ' + t('hud.boardNo', { n: g.board + 1 });
  }

  /* ---------------- Vẽ xe (SVG tự vẽ: thân, họa tiết, kính, đèn; xe tải có thùng hàng) ---------------- */

  /** Họa tiết phủ lên thân xe dài L (vẽ theo chiều ngang, bị cắt theo thân). */
  function pattern(kind, L) {
    let s = '';
    if (kind === 'stripes') s = '<rect class="car-pat" x="0" y="38" width="' + L + '" height="7"/><rect class="car-pat" x="0" y="55" width="' + L + '" height="7"/>';
    else if (kind === 'dots') {
      for (let x = 22; x < L - 10; x += 26) s += '<circle class="car-pat" cx="' + x + '" cy="24" r="6"/><circle class="car-pat" cx="' + x + '" cy="76" r="6"/>';
    } else if (kind === 'check') {
      for (let y = 6, k = 0; y < 94; y += 13, k++) {
        s += '<rect class="car-pat" x="' + (14 + (k % 2) * 13) + '" y="' + y + '" width="13" height="13"/>';
        s += '<rect class="car-pat" x="' + (L - 40 + (k % 2) * 13) + '" y="' + y + '" width="13" height="13"/>';
      }
    } else if (kind === 'band') s = '<rect class="car-pat-dark" x="16" y="0" width="16" height="100"/><rect class="car-pat-dark" x="' + (L - 40) + '" y="0" width="16" height="100"/>';
    else if (kind === 'zig') {
      let d = 'M0 50';
      for (let x = 12, up = true; x <= L; x += 16, up = !up) d += ' L' + x + ' ' + (up ? 36 : 64);
      s = '<path class="car-zig" d="' + d + '"/>';
    } else if (kind === 'frame') s = '<rect x="14" y="14" width="' + (L - 28) + '" height="72" rx="12" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="6"/>';
    return s;
  }

  /** SVG của xe i (uid để id clipPath không trùng giữa bàn chơi và hình trong Cách chơi). */
  function carSVG(i, car, uid) {
    const L = car.len * 100;
    const m = 6;
    const bw = L - 2 * m;
    const bh = 100 - 2 * m - 4;
    const color = i === 0 ? RED : COLORS[(i - 1) % COLORS.length];
    const kind = i === 0 ? '' : PATTERNS[(i - 1) % PATTERNS.length];
    const id = 'cp-' + uid + '-' + i;
    const rect = (cls, x, y, w, h, r, extra) => '<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r + '"' + (extra || '') + '/>';
    let s = '<defs><clipPath id="' + id + '">' + rect('', m, m, bw, bh, 20) + '</clipPath></defs>';
    s += rect('car-shadow', m + 2, m + 5, bw, bh, 20);
    s += rect('car-body', m, m, bw, bh, 20, ' fill="' + color + '"');
    s += '<g clip-path="url(#' + id + ')">' + pattern(kind, L);
    if (car.len === 3) {
      // Xe tải: thùng hàng có gân phía sau, khe nối, cabin phía trước
      for (let x = m + 22; x < L - 108; x += 22) s += '<line class="car-rib" x1="' + x + '" y1="' + m + '" x2="' + x + '" y2="' + (m + bh) + '"/>';
      s += '<rect class="car-pat-dark" x="' + (L - 106) + '" y="0" width="6" height="100"/>';
    }
    s += '</g>';
    if (car.len === 2) {
      s += rect('car-roof', L * 0.25, m + 10, L * 0.5, bh - 20, 14);
      s += rect('car-glass', L * 0.6, m + 13, L * 0.1, bh - 26, 6);
      s += rect('car-glass', L * 0.28, m + 16, L * 0.07, bh - 32, 5);
    } else {
      s += rect('car-roof', L - 88, m + 10, 46, bh - 20, 12);
      s += rect('car-glass', L - 44, m + 13, 14, bh - 26, 6);
    }
    s += rect('car-light', L - m - 9, m + 7, 6, 15, 2) + rect('car-light', L - m - 9, m + bh - 22, 6, 15, 2);
    s += rect('car-tail', m + 3, m + 7, 5, 14, 2) + rect('car-tail', m + 3, m + bh - 21, 5, 14, 2);
    if (i === 0) s += '<path class="car-arrow" d="M' + (L - 52) + ' 36 L' + (L - 32) + ' 50 L' + (L - 52) + ' 64 Z"/>';
    // Xe dọc: xoay hình ngang 90° (đầu xe quay xuống dưới)
    const body = car.h ? s : '<g transform="translate(100 0) rotate(90)">' + s + '</g>';
    const vb = car.h ? '0 0 ' + L + ' 100' : '0 0 100 ' + L;
    return '<svg viewBox="' + vb + '" preserveAspectRatio="none" aria-hidden="true">' + body + '</svg>';
  }

  /* ---------------- Bãi đỗ ---------------- */
  const stage = $('stage');
  const lot = $('lot');
  const grid = $('grid');
  const carsEl = $('cars');
  let els = []; // phần tử xe theo số thứ tự trong engine
  let built = null; // chuỗi đề đang dựng
  let cell = 56;

  function buildBoard() {
    carsEl.textContent = '';
    els = game.cars.map((car, i) => {
      const d = document.createElement('div');
      d.className = 'car';
      d.dataset.car = i;
      d.tabIndex = 0;
      d.setAttribute('role', 'button');
      d.style.setProperty('--w', car.h ? car.len : 1);
      d.style.setProperty('--h', car.h ? 1 : car.len);
      d.innerHTML = carSVG(i, car, 'b');
      return d;
    });
    // Thứ tự Tab theo ô đầu của xe lúc bắt đầu (đọc từ trên xuống, trái sang phải)
    const at = (i) => {
      const c = game.cars[i];
      return c.h ? c.fix * N + game.start[i] : game.start[i] * N + c.fix;
    };
    els.map((el, i) => i).sort((a, b) => at(a) - at(b)).forEach((i) => carsEl.appendChild(els[i]));
    built = game.puzzle;
    instant(placeAll);
  }

  /** Chạy fn mà không có hiệu ứng trượt (đổi bàn, đổi cỡ). */
  function instant(fn) {
    lot.classList.add('no-anim');
    fn();
    void lot.offsetWidth;
    lot.classList.remove('no-anim');
  }

  function place(i, px) {
    const car = game.cars[i];
    const el = els[i];
    let p = px == null ? game.pos[i] * cell : px;
    // Thắng: xe đỏ chạy ra khỏi bãi qua khe cửa (giảm chuyển động thì đứng yên ở cửa)
    const leaving = over && i === 0 && !reduced();
    el.classList.toggle('leave', leaving);
    if (leaving) p = (N + 1.5) * cell;
    const x = car.h ? p : car.fix * cell;
    const y = car.h ? car.fix * cell : p;
    el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }
  function placeAll() {
    for (let i = 0; i < els.length; i++) place(i);
  }

  /** Cỡ ô theo khung còn trống: bãi = 6 ô + khung 2 × 0,3 ô (vừa 390×844 dọc, ngang và 1280×800), tối đa 84px. */
  function fit() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    cell = Math.max(24, Math.floor(Math.min((w - 8) / 6.6, (h - 8) / 6.6, 84)));
    lot.style.setProperty('--cell', cell + 'px');
    lot.style.setProperty('--pad', Math.round(cell * 0.3) + 'px');
    if (game) instant(placeAll);
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);
  else window.addEventListener('resize', fit);

  /* ---------------- HUD ---------------- */
  function bestOf(g) {
    return g.level === 'daily' ? stats.daily[g.board] : stats.best[g.level][g.board];
  }

  function render() {
    if (built !== game.puzzle) buildBoard();
    else placeAll();
    const daily = game.level === 'daily';
    $('level-name').textContent = levelName(game.level);
    $('board-no').textContent = daily ? '#' + E.dailyPuzzle(game.board).no : String(game.board + 1);
    $('board-total').textContent = daily ? '' : '/' + E.boardCount(game.level);
    $('btn-level').setAttribute('aria-label', t('hud.boardBtn', { name: gameName(game) }));
    $('moves').textContent = kit.i18n.fmtNumber(E.moveCount(game));
    $('min').textContent = '/' + game.min;
    const best = bestOf(game);
    $('best').innerHTML = best ? kit.i18n.fmtNumber(best.m) + '<span class="mini-stars" aria-hidden="true">' + starText(best.s) + '</span>' : '–';
    $('btn-undo').disabled = over || !game.hist.length;
    $('btn-restart').disabled = !over && !game.hist.length;
    $('btn-hint').disabled = over;
    grid.setAttribute('aria-label', t('board.label', { name: gameName(game) }));
    game.cars.forEach((car, i) => {
      const color = i === 0 ? '' : t('color.' + ((i - 1) % COLORS.length));
      const name = i === 0 ? t('car.red') : t(car.len === 3 ? 'car.truck' : 'car.car', { color });
      const r = (car.h ? car.fix : game.pos[i]) + 1;
      const c = (car.h ? game.pos[i] : car.fix) + 1;
      els[i].setAttribute('aria-label', t('car.label', { name: name.charAt(0).toUpperCase() + name.slice(1), axis: t(car.h ? 'car.h' : 'car.v'), r, c }));
    });
  }

  /* ---------------- Lưu ---------------- */
  function writeSummary() {
    let solved = 0;
    let total = 0;
    let starsGot = 0;
    E.LEVELS.forEach((lv) => {
      solved += Object.keys(stats.best[lv]).length;
      total += E.boardCount(lv);
      starsGot += E.levelStars(stats, lv).got;
    });
    const inPlay = game && moved && !over;
    let pct = 0;
    if (inPlay) {
      const left = E.solve(game.cars, game.pos);
      pct = left ? Math.max(0, Math.min(0.95, (game.min - left.min) / game.min)) : 0;
    }
    const today = todayKey();
    const dp = E.dailyPuzzle(today);
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: solved ? t('summary.note', { n: solved, total }) : t('summary.none'),
      stats: solved ? [{ value: solved + '/' + total, label: t('summary.solved') }, { value: '★ ' + starsGot, label: t('summary.stars') }] : [],
      resume: inPlay
        ? {
          title: game.level === 'daily' ? t('summary.resumeDaily', { n: E.dailyPuzzle(game.board).no }) : t('summary.resume', { level: levelName(game.level), n: game.board + 1 }),
          detail: t('summary.detail', { n: E.moveCount(game) }),
          pct,
        }
        : null,
      daily: { date: today, done: !!stats.daily[today], title: t('summary.dailyTitle', { n: dp.no }), streak: E.dailyStreak(stats, today) },
      now: Date.now(),
    }));
  }
  function persist() {
    if (game && moved && !over) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */
  /** Bỏ ván đang chơi: đã đi ít nhất một nước thì tính một lượt thua; chưa đi thì không gửi gì. */
  function abandon() {
    cancelDrag();
    if (game && moved && !over) {
      stats.played++;
      saveStats();
      kit.sdk.end({ mode: game.level, won: false, assisted: !!game.assisted });
    }
  }

  /** Hiện bàn (hoặc đề ngày: level 'daily', board = ngày) và bắt đầu ván mới (gửi start). */
  function showBoard(level, board) {
    cancelDrag();
    const p = level === 'daily' ? E.dailyPuzzle(board) : E.boardPuzzle(level, board);
    game = E.newGame(p.puzzle, { level, board }, p.min);
    moved = false;
    over = false;
    armedRestart = 0;
    built = null;
    if (level !== 'daily') stats.current = { level, board };
    saveStats();
    kit.store.remove(keys.save);
    kit.sdk.start(level);
    render();
    writeSummary();
  }

  function goBoard(level, n) {
    if (!E.isUnlocked(stats, level, n)) return;
    if (game && game.level === level && game.board === n && !over) return;
    abandon();
    showBoard(level, n);
    kit.sfx('start');
  }

  function playDaily() {
    kit.modal.close('modal-levels');
    const today = todayKey();
    if (game && game.level === 'daily' && game.board === today && !over) return;
    abandon();
    showBoard('daily', today);
    kit.sfx('start');
  }

  /** Trượt xe i tới vị trí to; trả true nếu đi được. */
  function commit(i, to) {
    if (!game || over) return false;
    const next = E.move(game, i, to);
    if (next === game) {
      place(i);
      return false;
    }
    game = next;
    moved = true;
    armedRestart = 0;
    kit.sfx('move');
    render();
    if (E.isWon(game)) finish();
    return true;
  }

  function finish() {
    over = true;
    cancelDrag();
    const lv = game.level;
    const b = game.board;
    const m = E.moveCount(game);
    const st = game.assisted ? 1 : E.stars(m, game.min);
    const prev = bestOf(game);
    stats = E.recordWin(stats, lv, b, m, game.min, game.assisted);
    let next = -1;
    if (lv !== 'daily') {
      next = b + 1 < E.boardCount(lv) && E.isUnlocked(stats, lv, b + 1) ? b + 1 : E.frontier(stats, lv);
      stats.current = { level: lv, board: next >= 0 ? next : b };
    }
    saveStats();
    persist();
    kit.sdk.end({ mode: lv, won: true, assisted: !!game.assisted });
    kit.sfx('win');
    render(); // xe đỏ chạy ra cửa
    if (document.activeElement && document.activeElement.classList.contains('car')) document.activeElement.blur();

    $('win-title').textContent = lv === 'daily' ? t('win.dailyTitle', { n: E.dailyPuzzle(b).no }) : t('win.title', { n: b + 1 });
    const starsEl = $('win-stars');
    starsEl.querySelectorAll('span').forEach((s, k) => s.classList.toggle('on', k < st));
    starsEl.setAttribute('aria-label', t('win.starsLabel', { n: st }));
    $('win-result').textContent = t('win.result', { moves: kit.i18n.fmtNumber(m), min: game.min });
    const note = game.assisted ? t('win.assisted') : m <= game.min ? t('win.perfect') : prev && (st > prev.s || (st === prev.s && m < prev.m)) ? t('win.best') : '';
    $('win-note').textContent = note;
    $('win-note').hidden = !note;
    $('win-all').hidden = lv === 'daily' || E.frontier(stats, lv) >= 0;
    const btnNext = $('btn-next');
    btnNext.hidden = lv !== 'daily' && next < 0;
    btnNext.textContent = lv === 'daily' ? t('win.toBoards') : t('win.next');
    setTimeout(() => {
      if (!over) return;
      kit.confetti();
      kit.modal.open('modal-win');
    }, reduced() ? 0 : 650);
  }

  function nextBoard() {
    kit.modal.close('modal-win');
    if (!game) return;
    if (game.level === 'daily') {
      const c = stats.current;
      goBoard(c.level, E.isUnlocked(stats, c.level, c.board) ? c.board : Math.max(0, E.frontier(stats, c.level)));
      return;
    }
    const lv = game.level;
    const n = game.board + 1 < E.boardCount(lv) && E.isUnlocked(stats, lv, game.board + 1) ? game.board + 1 : E.frontier(stats, lv);
    if (n >= 0) goBoard(lv, n);
  }

  function undo() {
    if (!game || over || !game.hist.length) return;
    cancelDrag();
    game = E.undo(game);
    armedRestart = 0;
    kit.sfx('pop');
    render();
  }

  // Chơi lại khi đã đi: bấm hai lần trong 2,5 giây để không lỡ tay mất cả bàn (bỏ bàn tính là thua)
  let armedRestart = 0;
  function restart() {
    if (!game) return;
    if (over) {
      kit.modal.close('modal-win');
      showBoard(game.level, game.board);
      kit.sfx('start');
      return;
    }
    if (!game.hist.length) return;
    const now = Date.now();
    if (now - armedRestart > 2500) {
      armedRestart = now;
      kit.toast(t(touchUI() ? 'toast.restartAgainTouch' : 'toast.restartAgain'), 2500);
      return;
    }
    abandon();
    showBoard(game.level, game.board);
    kit.sfx('start');
  }

  /** Gợi ý: đi giúp nước tiếp theo của một lời giải ngắn nhất từ thế hiện tại; ván thành "có trợ giúp". */
  let hintTimer = 0;
  function hint() {
    if (!game || over) return;
    cancelDrag();
    const h = E.hint(game);
    if (!h) return;
    if (!game.assisted) {
      game = Object.assign({}, game, { assisted: true });
      kit.toast(t('toast.hint'), 2600);
    }
    stats.hints++;
    saveStats();
    const el = els[h[0]];
    els.forEach((x) => x.classList.remove('hinted'));
    void el.offsetWidth;
    el.classList.add('hinted');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => el.classList.remove('hinted'), 1300);
    commit(h[0], h[1]);
  }

  /* ---------------- Kéo xe (chuột / chạm / bút) ---------------- */
  let drag = null;
  function cancelDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.el.classList.remove('drag');
    if (game && els[d.i] === d.el) place(d.i);
  }
  carsEl.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.car');
    if (!el || e.button > 0 || !game || over || kit.modal.current() || drag) return;
    const i = Number(el.dataset.car);
    const [lo, hi] = E.range(game, i);
    drag = { i, el, id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: game.pos[i] * cell, lo: lo * cell, hi: hi * cell, off: game.pos[i] * cell, moving: false };
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
    el.focus({ preventScroll: true });
    e.preventDefault();
  });
  carsEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const car = game.cars[drag.i];
    const d = car.h ? e.clientX - drag.x0 : e.clientY - drag.y0;
    if (!drag.moving && Math.abs(d) < 5) return;
    if (!drag.moving) {
      drag.moving = true;
      drag.el.classList.add('drag');
    }
    // Chặn ở mép bàn / xe khác: chỉ trong khoảng trượt được tính lúc bắt đầu kéo
    drag.off = Math.max(drag.lo, Math.min(drag.hi, drag.p0 + d));
    place(drag.i, drag.off);
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    d.el.classList.remove('drag');
    // Thả ra: dừng ở ô gần nhất
    if (d.moving) commit(d.i, Math.round(d.off / cell));
  }
  carsEl.addEventListener('pointerup', endDrag);
  carsEl.addEventListener('pointercancel', (e) => {
    if (drag && e.pointerId === drag.id) cancelDrag();
  });

  /* ---------------- Bàn phím ---------------- */
  const DIRS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  /** Xe đang được chọn (đang có focus), không có thì -1. */
  function focusedCar() {
    const a = document.activeElement;
    return a && a.classList && a.classList.contains('car') && els.indexOf(a) >= 0 ? els.indexOf(a) : -1;
  }
  function center(i) {
    const c = game.cars[i];
    const p = game.pos[i];
    return c.h ? [p + c.len / 2, c.fix + 0.5] : [c.fix + 0.5, p + c.len / 2];
  }
  function bump(i) {
    kit.sfx('error');
    const el = els[i];
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
  function arrow(key) {
    if (!game || over) return;
    const [dx, dy] = DIRS[key];
    const i = focusedCar();
    if (i < 0) {
      els[0].focus();
      return;
    }
    const car = game.cars[i];
    if (car.h ? dx !== 0 : dy !== 0) {
      // Dọc trục: trượt một ô (các ô liền nhau của cùng xe gộp thành một nước)
      if (!commit(i, game.pos[i] + (car.h ? dx : dy))) bump(i);
      return;
    }
    // Ngang trục: chọn xe gần nhất theo hướng đó
    const [cx, cy] = center(i);
    let best = -1;
    let score = Infinity;
    for (let j = 0; j < els.length; j++) {
      if (j === i) continue;
      const [x, y] = center(j);
      const along = (x - cx) * dx + (y - cy) * dy;
      if (along <= 0.01) continue;
      const side = Math.abs((x - cx) * dy) + Math.abs((y - cy) * dx);
      const sc = along + side * 2;
      if (sc < score) {
        score = sc;
        best = j;
      }
    }
    if (best >= 0) els[best].focus();
  }
  function slideEnd(toEnd) {
    if (!game || over) return;
    const i = focusedCar() < 0 ? 0 : focusedCar();
    const [lo, hi] = E.range(game, i);
    if (!commit(i, toEnd ? hi : lo)) bump(i);
    if (!over) els[i].focus();
  }

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
      if (open.id === 'modal-win' && k === 'n' && !$('btn-next').hidden) nextBoard();
      else if (open.id === 'modal-win' && k === 'r') restart();
      return;
    }
    if (DIRS[e.key]) {
      // Mũi tên trên nút công cụ / ô số liệu cũng điều khiển bàn chơi
      arrow(e.key);
      e.preventDefault();
      return;
    }
    if (e.key === 'Home' || e.key === 'End') slideEnd(e.key === 'End');
    else if (k === 'z' || k === 'u' || k === 'backspace') undo();
    else if (k === 'r') restart();
    else if (k === 'h') hint();
    else if (k === 'l') openLevels();
    else if (k === 'n' && over) nextBoard();
    else return;
    e.preventDefault();
  });

  /* ---------------- Chọn bàn + đề ngày ---------------- */
  let tab = 'easy';
  function renderLevels() {
    document.querySelectorAll('#level-tabs button').forEach((b) => {
      const on = b.dataset.level === tab;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    const daily = tab === 'daily';
    $('board-grid').hidden = daily;
    $('levels-note').hidden = daily;
    $('daily-card').hidden = !daily;
    if (daily) {
      const today = todayKey();
      const dp = E.dailyPuzzle(today);
      const done = stats.daily[today];
      const streak = E.dailyStreak(stats, today);
      $('levels-progress').textContent = t('daily.streak', { n: streak });
      $('daily-no').textContent = t('daily.no', { n: dp.no });
      const [y, mo, d] = today.split('-').map(Number);
      $('daily-date').textContent = new Date(y, mo - 1, d).toLocaleDateString(kit.i18n.lang === 'vi' ? 'vi-VN' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
      $('daily-min').textContent = t('daily.min', { n: dp.min });
      $('daily-status').innerHTML = done ? '<span class="mini-stars" aria-hidden="true">' + starText(done.s) + '</span> ' + t('daily.done', { moves: kit.i18n.fmtNumber(done.m) }) : t('daily.todo');
      $('btn-daily').textContent = done ? t('daily.again') : t('daily.play');
      return;
    }
    const gridEl = $('board-grid');
    gridEl.textContent = '';
    const total = E.boardCount(tab);
    const st = E.levelStars(stats, tab);
    $('levels-progress').textContent = t('levels.progress', { n: Object.keys(stats.best[tab]).length, total, stars: st.got, max: st.max });
    for (let n = 0; n < total; n++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'board-btn';
      const open = E.isUnlocked(stats, tab, n);
      const best = stats.best[tab][n];
      b.disabled = !open;
      if (best) b.classList.add('solved');
      if (game && game.level === tab && game.board === n) {
        b.classList.add('current');
        b.setAttribute('aria-current', 'true');
      }
      b.setAttribute('aria-label', !open ? t('levels.locked', { n: n + 1 }) : best ? t('levels.solved', { n: n + 1, stars: best.s, moves: best.m }) : t('levels.open', { n: n + 1 }));
      b.innerHTML = open
        ? '<span class="board-num">' + (n + 1) + '</span><span class="board-stars" aria-hidden="true">' + (best ? '<b>' + '★'.repeat(best.s) + '</b>' + '★'.repeat(3 - best.s) : '★★★') + '</span>'
        : '<svg class="board-lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-7-2a2 2 0 0 1 4 0v2h-4V7z"/></svg>';
      b.addEventListener('click', () => {
        kit.modal.close('modal-levels');
        goBoard(tab, n);
      });
      gridEl.appendChild(b);
    }
  }
  function openLevels() {
    cancelDrag();
    tab = game ? game.level : 'easy';
    renderLevels();
    kit.modal.closeAll();
    kit.modal.open('modal-levels');
    const cur = document.querySelector('.board-btn.current') || (tab === 'daily' ? $('btn-daily') : document.querySelector('.board-btn:not(:disabled)'));
    if (cur) cur.focus();
  }
  const tabs = Array.from(document.querySelectorAll('#level-tabs button'));
  tabs.forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.level;
    renderLevels();
  }));
  $('level-tabs').addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : -1;
    if (j < 0) return;
    e.preventDefault();
    tab = tabs[j].dataset.level;
    renderLevels();
    tabs[j].focus();
  });

  /* ---------------- Thống kê ---------------- */
  function renderStats() {
    let solved = 0;
    let total = 0;
    let got = 0;
    const bars = $('level-bars');
    bars.textContent = '';
    E.LEVELS.forEach((lv) => {
      const n = Object.keys(stats.best[lv]).length;
      const c = E.boardCount(lv);
      const s = E.levelStars(stats, lv);
      solved += n;
      total += c;
      got += s.got;
      const row = document.createElement('div');
      row.className = 'level-bar';
      row.innerHTML = '<span></span><span class="bar"><i></i></span><span></span>';
      row.children[0].textContent = levelName(lv);
      row.querySelector('i').style.width = (100 * n) / c + '%';
      row.children[2].textContent = n + '/' + c + ' · ★ ' + s.got;
      bars.appendChild(row);
    });
    $('stats-solved').textContent = solved + '/' + total;
    $('stats-stars').textContent = kit.i18n.fmtNumber(got);
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-hints').textContent = kit.i18n.fmtNumber(stats.hints);
    $('stats-streak').textContent = kit.i18n.fmtNumber(E.dailyStreak(stats, todayKey()));
  }

  /* ---------------- Hình chú thích trong Cách chơi ---------------- */
  (function legend() {
    const box = $('help-legend');
    const car = document.createElement('div');
    car.className = 'car';
    car.style.setProperty('--w', 2);
    car.style.setProperty('--h', 1);
    car.innerHTML = carSVG(0, { h: true, len: 2, fix: 0 }, 'l');
    box.appendChild(car);
    const ex = document.createElement('div');
    ex.className = 'exit-mini';
    ex.innerHTML = '<span></span><span></span>';
    box.appendChild(ex);
  })();

  /* ---------------- Sự kiện ---------------- */
  $('btn-undo').addEventListener('click', undo);
  $('btn-restart').addEventListener('click', restart);
  $('btn-hint').addEventListener('click', hint);
  $('btn-boards').addEventListener('click', openLevels);
  $('btn-level').addEventListener('click', openLevels);
  $('btn-next').addEventListener('click', nextBoard);
  $('btn-daily').addEventListener('click', playDaily);
  $('btn-replay').addEventListener('click', () => {
    kit.modal.close('modal-win');
    showBoard(game.level, game.board);
    kit.sfx('start');
  });
  $('btn-win-boards').addEventListener('click', openLevels);
  $('btn-stats').addEventListener('click', renderStats);
  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  fit();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && !E.isWon(restored) && (restored.level === 'daily' || E.isUnlocked(stats, restored.level, restored.board))) {
    game = restored;
    moved = true;
    if (game.level !== 'daily') stats.current = { level: game.level, board: game.board };
    kit.sdk.start(game.level, true);
    render();
    kit.toast(t('toast.saved'));
    writeSummary();
  } else {
    kit.store.remove(keys.save);
    const c = stats.current;
    showBoard(c.level, E.isUnlocked(stats, c.level, c.board) ? c.board : Math.max(0, E.frontier(stats, c.level)));
  }
})();
