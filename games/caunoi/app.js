/* =====================================================================
 * Cầu Nối - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Mỗi đề là một ván; mode = độ khó (s 7×7, m 10×10, l 13×13) chọn trong Cài đặt, metric time_low trên cổng
 *   - Chuột / chạm: kéo từ đảo về phía đảo kia, chạm lần lượt hai đảo, hoặc chạm mặt nước giữa hai đảo
 *     để thêm cầu 0 → 1 → 2 → 0
 *   - Bàn phím: mũi tên chọn đảo; Shift + mũi tên (hoặc Space rồi mũi tên) thêm cầu theo hướng đó;
 *     Z / Y hoàn tác / làm lại, H gợi ý, N đề mới, Esc bỏ chọn
 *   - Đồng hồ chạy từ nước đầu tiên, dừng khi tab ẩn hoặc đang mở hộp thoại; lưu cả đồng hồ trong ván dở
 *   - Báo ván cho cổng:
 *     - Chia đề mới: kit.sdk.start(mode); mở lại đề lưu dở: kit.sdk.start(mode, true)
 *     - Giải xong: kit.sdk.end({ mode, won: true, timeMs, assisted }) (assisted = đã dùng gợi ý)
 *     - Bỏ đề đã đi ít nhất một nước: kit.sdk.end({ mode, won: false, ... }); chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODES = Object.keys(E.MODES);
  const kit = PNKit.init({
    gameId: 'caunoi',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { mode: 's', errors: 'auto' },
    onSetting: (key, value) => {
      if (key === 'mode') onModeSetting(value);
      if (key === 'errors' && game) render();
    },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const board = $('board');

  let mode = 's'; // mode của đề đang giải (Cài đặt có thể đã đổi cho đề sau)
  let game = null;
  let won = false;
  let sel = -1; // đảo đang chọn (chạm hoặc bàn phím)
  let armed = false; // bàn phím: đã bấm Space, chờ mũi tên để nối cầu
  let showKbd = false; // vừa dùng bàn phím: hiện khung chọn rõ hơn
  let drag = null; // { from, x0, y0, moved, edge }
  let flash = []; // cạnh nháy đỏ (cầu đang chặn) hoặc vừa gợi ý
  let flashKind = '';
  let flashTimer = 0;
  let pass = null; // ô mặt nước → các cạnh đi qua ô đó (chạm mặt nước để nối)
  let modalHeld = false; // đồng hồ đang tạm dừng vì mở hộp thoại

  /* ---------------- Thống kê theo mode ---------------- */
  const blankMode = () => ({ played: 0, won: 0, best: null, clean: 0 });
  const stats = { modes: {} };
  (function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    MODES.forEach((m) => {
      const s = raw.modes && raw.modes[m];
      stats.modes[m] = Object.assign(blankMode(), s && typeof s === 'object' ? s : {});
    });
  })();
  const total = (field) => MODES.reduce((s, m) => s + (Number(stats.modes[m][field]) || 0), 0);

  function settingMode() {
    const m = kit.settings.get().mode;
    return MODES.indexOf(m) >= 0 ? m : 's';
  }
  const sizeLabel = (m) => E.MODES[m].size + '×' + E.MODES[m].size;
  const modeLabel = (m) => t('mode.' + m) + ' ' + sizeLabel(m);

  function showErrors() {
    const v = kit.settings.get().errors;
    return v === 'on' || (v !== 'off' && mode === 's');
  }

  /** m:ss (HUD) hoặc m:ss.d (kết quả). */
  function fmt(ms, tenths) {
    const ds = Math.floor(ms / 100);
    const m = Math.floor(ds / 600);
    const s = Math.floor((ds % 600) / 10);
    const base = m + ':' + String(s).padStart(2, '0');
    return tenths ? base + (kit.i18n.lang === 'vi' ? ',' : '.') + (ds % 10) : base;
  }

  const inPlay = () => !!game && game.moves > 0 && !won;

  /* ---------------- Vẽ ---------------- */
  const R = 0.4; // bán kính đảo (đơn vị ô)
  const cx = (i) => game.islands[i][1] + 0.5;
  const cy = (i) => game.islands[i][0] + 0.5;

  /** Đường cầu giữa hai đảo, `off` = lệch sang bên (cầu đôi). */
  function bridgeLine(e, off, cls) {
    const [a, b, horiz] = game.net.edges[e];
    const ox = horiz ? 0 : off;
    const oy = horiz ? off : 0;
    const x1 = cx(a) + (horiz ? R : 0) + ox;
    const y1 = cy(a) + (horiz ? 0 : R) + oy;
    const x2 = cx(b) - (horiz ? R : 0) + ox;
    const y2 = cy(b) - (horiz ? 0 : R) + oy;
    return '<line class="' + cls + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>';
  }

  function renderBoard() {
    const n = game.size;
    const net = game.net;
    let s = '';
    // Mặt nước: chấm nhỏ ở mỗi ô
    let dots = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dots += 'M' + (c + 0.5) + ' ' + (r + 0.5) + 'h0';
    s += '<path class="sea-dot" d="' + dots + '"/>';
    // Cầu
    game.br.forEach((k, e) => {
      if (!k) return;
      const cls = 'bridge' + (flash.indexOf(e) >= 0 ? ' ' + flashKind : '');
      if (k === 1) s += bridgeLine(e, 0, cls);
      else s += bridgeLine(e, -0.11, cls) + bridgeLine(e, 0.11, cls);
    });
    // Cầu sắp đặt khi đang kéo
    if (drag && drag.moved && drag.edge >= 0) {
      const blocked = game.br[drag.edge] < 2 && E.blockedBy(game, drag.edge).length > 0;
      s += bridgeLine(drag.edge, 0, 'preview' + (blocked ? ' bad' : ''));
    }
    // Gợi ý vừa đặt mà cạnh về 0: vẽ nét đứt để thấy chỗ đã sửa
    if (flashKind === 'hinted') flash.forEach((e) => { if (!game.br[e]) s += bridgeLine(e, 0, 'preview hinted-off'); });
    // Đảo
    const err = showErrors() ? E.errors(game) : { over: [], closed: [] };
    const bad = new Set(err.over.concat(err.closed));
    const near = new Set();
    if (sel >= 0 && !won) net.nb[sel].forEach((e) => { if (e >= 0) near.add(E.other(game, e, sel)); });
    const from = drag && drag.moved && drag.edge >= 0 ? E.other(game, drag.edge, drag.from) : -1;
    game.islands.forEach(([r, c, num], i) => {
      const k = E.count(game, i);
      let cls = 'isl';
      if (k === num) cls += ' done';
      if (bad.has(i)) cls += ' err';
      if (i === sel || (drag && drag.from === i && drag.moved)) cls += ' sel';
      if (i === sel && armed) cls += ' armed';
      if (near.has(i) || i === from) cls += ' near';
      s += '<g class="' + cls + '" data-island="' + i + '">' +
        (i === sel && showKbd ? '<circle class="kbd-ring" cx="' + (c + 0.5) + '" cy="' + (r + 0.5) + '" r="0.5"/>' : '') +
        '<circle class="isl-bg" cx="' + (c + 0.5) + '" cy="' + (r + 0.5) + '" r="' + R + '"/>' +
        '<text x="' + (c + 0.5) + '" y="' + (r + 0.5) + '" dy="0.18" font-size="0.5">' + num + '</text></g>';
    });
    board.innerHTML = s;
    board.setAttribute('viewBox', '0 0 ' + n + ' ' + n);
    board.classList.toggle('won', won);
  }

  let raf = 0;
  function renderTime() {
    $('time').textContent = fmt(clock.elapsed());
    cancelAnimationFrame(raf);
    if (clock.running) raf = requestAnimationFrame(renderTime);
  }

  function render() {
    renderBoard();
    const done = E.doneCount(game);
    const all = game.islands.length;
    $('islands').textContent = done + '/' + all;
    const best = stats.modes[mode].best;
    $('best').textContent = best == null ? '–' : fmt(best);
    $('mode-name').textContent = t('mode.' + mode);
    $('mode-size').textContent = ' ' + sizeLabel(mode);
    $('mode-badge').setAttribute('aria-label', t('mode.badge', { mode: modeLabel(mode) }));
    board.setAttribute('aria-label', t('board.label', { size: sizeLabel(mode), done, total: all }));
    $('btn-undo').disabled = won || !game.undo.length;
    $('btn-redo').disabled = won || !game.redo.length;
    $('btn-clear').disabled = won || game.br.every((k) => !k);
    $('btn-hint').disabled = won || !game.sol;
    renderTime();
  }

  /* ---------------- Lưu ---------------- */
  function saveStats() {
    kit.store.write(keys.stats, { v: 1, modes: stats.modes });
  }
  function writeSummary() {
    const bests = MODES.filter((m) => stats.modes[m].best != null);
    const cur = stats.modes[mode].best != null ? mode : bests[bests.length - 1];
    const done = game ? E.doneCount(game) : 0;
    const all = game ? game.islands.length : 1;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: total('played'),
      won: total('won'),
      note: cur ? t('summary.note', { time: fmt(stats.modes[cur].best, true), mode: modeLabel(cur) }) : t('summary.none'),
      stats: bests.map((m) => ({ value: fmt(stats.modes[m].best, true), label: modeLabel(m) })),
      resume: inPlay() ? { title: t('app.name') + ' · ' + modeLabel(mode), detail: t('summary.resume', { done, total: all }), pct: done / all } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */

  /** Bảng ô mặt nước → cạnh đi qua (để chạm vào khoảng giữa hai đảo). */
  function buildPass() {
    pass = new Map();
    game.net.edges.forEach(([a, b, horiz], e) => {
      const [r1, c1] = game.islands[a];
      const [r2, c2] = game.islands[b];
      if (horiz) for (let c = c1 + 1; c < c2; c++) pass.set(r1 * game.size + c, (pass.get(r1 * game.size + c) || []).concat([e]));
      else for (let r = r1 + 1; r < r2; r++) pass.set(r * game.size + c1, (pass.get(r * game.size + c1) || []).concat([e]));
    });
  }

  function setGame(g) {
    game = g;
    won = false;
    sel = -1;
    armed = false;
    drag = null;
    flash = [];
    buildPass();
  }

  function newGame() {
    mode = settingMode();
    setGame(E.newGame(mode, (Math.random() * 4294967296) >>> 0));
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(mode);
    render();
    writeSummary();
  }

  function setFlash(edges, kind, ms) {
    flash = edges;
    flashKind = kind;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flash = [];
      flashKind = '';
      if (game) render();
    }, ms);
  }

  /** Nhận ván mới từ engine: chạy đồng hồ, kiểm tra thắng, lưu. */
  function apply(next) {
    if (next === game) return false;
    const before = E.doneCount(game);
    game = next;
    if (!clock.running && !modalHeld) clock.resume();
    if (E.isWon(game)) {
      finish();
      return true;
    }
    const done = E.doneCount(game);
    if (done === game.islands.length && before !== done) kit.toast(t('toast.allDone'));
    persist();
    return true;
  }

  /** Thêm cầu trên cạnh e (0 → 1 → 2 → 0); cắt cầu khác thì nháy cầu đang chặn. */
  function doEdge(e) {
    if (won || e < 0) return;
    const prev = game.br[e];
    const next = E.cycle(game, e);
    if (next === game) {
      setFlash(E.blockedBy(game, e), 'blocked', 700);
      kit.sfx('error');
      kit.toast(t('toast.blocked'), 1200);
      render();
      return;
    }
    apply(next);
    if (!won) kit.sfx(prev === 2 ? 'pop' : 'place');
    render();
  }

  function finish() {
    won = true;
    sel = -1;
    armed = false;
    drag = null;
    clock.pause();
    const ms = Math.round(clock.elapsed());
    const s = stats.modes[mode];
    const assisted = !!game.assisted;
    const best = !assisted && (s.best == null || ms < s.best);
    s.played++;
    s.won++;
    if (!assisted) s.clean++;
    if (best) s.best = ms;
    saveStats();
    persist();
    kit.sdk.end({ mode, won: true, timeMs: ms, assisted });
    kit.sfx('win');
    kit.confetti();
    $('win-time').textContent = fmt(ms, true);
    $('win-bridges').textContent = kit.i18n.fmtNumber(game.br.reduce((a, k) => a + k, 0));
    $('win-best').hidden = !best;
    $('win-assisted').hidden = !assisted;
    render();
    // Cho người chơi nhìn bàn đã nối xong một chút rồi mới hiện kết quả
    setTimeout(() => { if (won && !kit.modal.current()) kit.modal.open('modal-win'); }, 650);
  }

  /** Đề đang dở (đã đi nước) thì hỏi trước, vì bỏ đề tính là thua. */
  function requestNew() {
    if (inPlay()) kit.modal.open('modal-confirm');
    else newGame();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    stats.modes[mode].played++;
    saveStats();
    kit.sdk.end({ mode, won: false, timeMs: Math.round(clock.elapsed()), assisted: !!game.assisted });
    newGame();
  }

  /** Đổi độ khó trong Cài đặt: chưa đi nước nào thì đổi ngay, đang giải dở thì áp dụng từ đề sau. */
  function onModeSetting(value) {
    if (!game || MODES.indexOf(value) < 0 || value === mode) return;
    if (inPlay()) kit.toast(t('toast.nextSize'));
    else newGame();
  }

  /* ---------------- Nút ---------------- */
  function history(fn) {
    if (won) return;
    if (apply(fn(game))) kit.sfx('move');
    render();
  }
  function clearAll() {
    if (won) return;
    if (apply(E.clear(game))) kit.sfx('clear');
    sel = -1;
    render();
  }
  function useHint() {
    if (won) return;
    const h = E.hint(game);
    if (!h) return;
    const first = !game.assisted;
    apply(h.game);
    if (won) return;
    if (first) kit.toast(t('toast.hint'), 2200);
    kit.sfx('flip');
    setFlash([h.edge], 'hinted', 1400);
    render();
  }

  $('btn-undo').addEventListener('click', () => history(E.undo));
  $('btn-redo').addEventListener('click', () => history(E.redo));
  $('btn-clear').addEventListener('click', clearAll);
  $('btn-hint').addEventListener('click', useHint);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-next').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newGame();
  });
  $('btn-stats').addEventListener('click', () => {
    const m = settingMode();
    const s = stats.modes[m];
    $('stats-for').textContent = t('stats.for', { mode: modeLabel(m) });
    $('stats-played').textContent = kit.i18n.fmtNumber(s.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(s.won);
    $('stats-best').textContent = s.best == null ? '–' : fmt(s.best, true);
    $('stats-clean').textContent = kit.i18n.fmtNumber(s.clean);
  });

  /* ---------------- Chuột / chạm ---------------- */
  function point(e) {
    const r = board.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * game.size, ((e.clientY - r.top) / r.height) * game.size];
  }
  /**
   * Đảo gần điểm (x, y) nhất trong bán kính 0,8 ô: vùng chạm rộng hơn hình tròn vẽ ra (bàn 13×13 trên điện thoại
   * mỗi ô chỉ ~29px). Đảo không bao giờ kề nhau theo hàng / cột nên vùng của hai đảo hiếm khi chồng nhau,
   * và giữa hai đảo cách một ô vẫn còn dải mặt nước để chạm nối cầu.
   */
  function islandAt(x, y) {
    let best = -1;
    let bd = 0.8 * 0.8;
    game.islands.forEach((p, i) => {
      const d = (cx(i) - x) ** 2 + (cy(i) - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  function tapIsland(i) {
    if (sel >= 0 && sel !== i) {
      const e = E.edgeBetween(game, sel, i);
      if (e >= 0) {
        sel = -1;
        doEdge(e);
        return;
      }
    }
    sel = sel === i ? -1 : i;
    armed = false;
    kit.sfx('tap');
    render();
  }

  function tapWater(x, y) {
    const r = Math.floor(y);
    const c = Math.floor(x);
    const list = (pass && pass.get(r * game.size + c)) || [];
    sel = -1;
    if (!list.length) return render();
    // Ô là chỗ hai cạnh cắt nhau: chọn cạnh đang có cầu, không thì cạnh mà điểm chạm nằm gần đường hơn
    let e = list.find((x2) => game.br[x2] > 0);
    if (e == null) {
      e = list.slice().sort((p, q) => {
        const dist = (k) => (game.net.edges[k][2] ? Math.abs(y - (r + 0.5)) : Math.abs(x - (c + 0.5)));
        return dist(p) - dist(q);
      })[0];
    }
    doEdge(e);
  }

  board.addEventListener('pointerdown', (e) => {
    if (won || kit.modal.current() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    showKbd = false;
    armed = false;
    const [x, y] = point(e);
    drag = { from: islandAt(x, y), x0: x, y0: y, moved: false, edge: -1 };
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
  });
  board.addEventListener('pointermove', (e) => {
    if (!drag || drag.from < 0) return;
    const [x, y] = point(e);
    const dx = x - drag.x0;
    const dy = y - drag.y0;
    if (!drag.moved && Math.max(Math.abs(dx), Math.abs(dy)) < 0.35) return;
    drag.moved = true;
    // Hướng kéo chính quyết định đảo đích: đảo gần nhất theo hướng đó
    const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
    const edge = game.net.nb[drag.from][d];
    if (edge !== drag.edge || !drag.shown) {
      drag.edge = edge;
      drag.shown = true;
      render();
    }
  });
  board.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.from >= 0 && d.moved) {
      sel = -1;
      if (d.edge >= 0) doEdge(d.edge);
      else {
        kit.sfx('error');
        render();
      }
    } else if (d.from >= 0) {
      tapIsland(d.from);
    } else {
      const [x, y] = point(e);
      tapWater(x, y);
    }
  });
  board.addEventListener('pointercancel', () => {
    drag = null;
    render();
  });

  /* ---------------- Bàn phím ---------------- */
  const DIR_KEYS = { arrowup: 0, arrowright: 1, arrowdown: 2, arrowleft: 3 };

  /** Đảo kế tiếp theo hướng d: đảo nối được nếu có, không thì đảo gần nhất trong hình nón hướng đó. */
  function stepFrom(i, d) {
    const e = game.net.nb[i][d];
    if (e >= 0) return E.other(game, e, i);
    const [r0, c0] = game.islands[i];
    let best = -1;
    let bs = Infinity;
    game.islands.forEach(([r, c], j) => {
      if (j === i) return;
      const along = d === 0 ? r0 - r : d === 2 ? r - r0 : d === 1 ? c - c0 : c0 - c;
      const perp = d === 0 || d === 2 ? Math.abs(c - c0) : Math.abs(r - r0);
      if (along <= 0 || perp > along * 2) return;
      const score = along + perp * 2;
      if (score < bs) {
        bs = score;
        best = j;
      }
    });
    return best < 0 ? i : best;
  }

  document.addEventListener('keydown', (e) => {
    if (e.altKey || kit.modal.current() || !game) return;
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl) {
      if (k === 'z') history(e.shiftKey ? E.redo : E.undo);
      else if (k === 'y') history(E.redo);
      else return;
      e.preventDefault();
      return;
    }
    // Space / Enter trên một nút đang focus là cú bấm của trình duyệt
    if ((k === ' ' || k === 'enter') && e.target && e.target.tagName === 'BUTTON') return;
    if (k === 'n') {
      e.preventDefault();
      return requestNew();
    }
    if (won) return;
    if (Object.prototype.hasOwnProperty.call(DIR_KEYS, k)) {
      const d = DIR_KEYS[k];
      showKbd = true;
      if (sel < 0) sel = 0;
      else if (e.shiftKey || armed) {
        armed = false;
        const edge = game.net.nb[sel][d];
        if (edge < 0) {
          kit.sfx('error');
          kit.toast(t('toast.noNeighbor'), 1000);
        } else {
          e.preventDefault();
          return doEdge(edge);
        }
      } else {
        sel = stepFrom(sel, d);
      }
    } else if (k === ' ' || k === 'enter') {
      showKbd = true;
      if (sel < 0) sel = 0;
      armed = !armed;
      if (armed) kit.toast(t('kbd.armed'), 900);
    } else if (k === 'escape') {
      sel = -1;
      armed = false;
    } else if (k === 'z') {
      return history(E.undo);
    } else if (k === 'y') {
      return history(E.redo);
    } else if (k === 'h') {
      return useHint();
    } else {
      return;
    }
    e.preventDefault();
    render();
  });

  /* ---------------- Đồng hồ dừng khi mở hộp thoại ---------------- */
  new MutationObserver(() => {
    const open = !!kit.modal.current();
    if (open && clock.running) {
      clock.pause();
      modalHeld = true;
    } else if (!open && modalHeld) {
      modalHeld = false;
      if (!won) clock.resume();
      renderTime();
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });

  kit.onLeave(persist);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderTime(); });

  /* ---------------- Khởi động: mở lại đề dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 && E.fromJSON(saved.game);
  if (restored && restored.moves > 0 && !E.isWon(restored)) {
    mode = restored.mode;
    setGame(restored);
    clock.set(saved.elapsed);
    kit.sdk.start(mode, true);
    kit.toast(t('toast.saved'));
    render();
    writeSummary();
  } else {
    newGame();
  }
})();
