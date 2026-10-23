/* =====================================================================
 * Rót Nước - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Chạm ống nguồn rồi chạm ống đích để rót; ống nguồn bay tới, nghiêng, nước chảy (giảm chuyển động: tức thì)
 *   - Mỗi lần chơi một màn là một ván trên cổng (metric wins, mode classic)
 *   - Báo ván: màn mới / chơi lại màn: kit.sdk.start(MODE); mở lại ván lưu dở: kit.sdk.start(MODE, true)
 *     Qua màn: kit.sdk.end({ mode, won: true, timeMs, assisted }) (assisted = đã dùng +1 ống; hoàn tác không tính)
 *     Bỏ màn đã rót ít nhất một lần, hoặc kẹt mà hết trợ giúp: won: false; chưa rót lần nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const kit = PNKit.init({
    gameId: 'rotnuoc',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { symbols: true },
    onSetting(key) {
      if (key === 'symbols') applySymbols();
    },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reducedMQ = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(reducedMQ && reducedMQ.matches);

  // 12 màu nước [màu, màu ký hiệu]: thứ tự chọn để các màn ít màu có màu dễ phân biệt nhất
  const COLOURS = [
    ['#e53935', 'rgba(255,255,255,.88)'],
    ['#1f6fe5', 'rgba(255,255,255,.88)'],
    ['#fbd338', 'rgba(70,45,0,.62)'],
    ['#2e9e4a', 'rgba(255,255,255,.88)'],
    ['#8b46d8', 'rgba(255,255,255,.88)'],
    ['#fb8c1e', 'rgba(70,30,0,.62)'],
    ['#45cbe8', 'rgba(0,45,60,.62)'],
    ['#f472b6', 'rgba(90,0,45,.6)'],
    ['#8b5a2b', 'rgba(255,255,255,.85)'],
    ['#a6e23a', 'rgba(30,60,0,.62)'],
    ['#a3aab8', 'rgba(25,30,45,.62)'],
    ['#25348f', 'rgba(255,255,255,.85)'],
  ];

  // Tỉ lệ ống theo bề rộng tw: cao lớp, khoảng trống miệng ống, khoảng cách ngang / dọc
  const LH = 0.78;
  const HEAD = 0.55;
  const GX = 0.36;
  const GY = 0.62;
  const TH = 4 * LH + HEAD + 0.08;
  const MAX_TW = 60;
  // Thời gian hiệu ứng rót (ms): bay + nghiêng, nước chảy, quay về
  const MOVE_MS = 260;
  const FLOW_MS = 320;
  const BACK_MS = 240;
  const TILT = 96;

  const stage = $('stage');
  const board = $('board');
  const stream = $('stream');

  let game = null;
  let sel = null; // ống đang chọn
  let busy = false; // đang rót: chặn chạm
  let reported = false; // đã gửi kết quả ván này cho cổng
  let focusIdx = 0; // ống nhận Tab (roving tabindex)
  let tubeEls = [];
  let rowsIdx = []; // chỉ số ống theo từng hàng (cho phím mũi tên)
  let metrics = { tw: 48, lh: 37 };

  /* ---------------- Thống kê ---------------- */
  function loadStats() {
    const s = { played: 0, won: 0, level: 1 };
    const raw = kit.store.read(keys.stats, null);
    if (raw && typeof raw === 'object') {
      ['played', 'won', 'level'].forEach((k) => {
        if (Number.isInteger(raw[k]) && raw[k] >= 0) s[k] = raw[k];
      });
    }
    s.level = Math.max(1, s.level);
    return s;
  }
  const stats = loadStats();
  const saveStats = () => kit.store.write(keys.stats, stats);

  /* ---------------- Định dạng ---------------- */
  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  const randomSeed = () => Math.floor(Math.random() * 4294967296) >>> 0;
  const announce = (msg) => { $('live').textContent = msg; };

  function applySymbols() {
    document.documentElement.classList.toggle('no-symbols', !kit.settings.get().symbols);
  }

  /** Chạy lại một lớp hiệu ứng CSS. */
  function replay(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /* ---------------- Bố cục ---------------- */

  /** Chọn số hàng cho ống to nhất trong khung chơi, dựng lại các ống. */
  function layout() {
    const n = game.tubes.length;
    const W = Math.max(200, stage.clientWidth);
    const H = Math.max(160, stage.clientHeight);
    let best = null;
    for (let r = 1; r <= 4; r++) {
      const c = Math.ceil(n / r);
      const tw = Math.min(MAX_TW, W / (c + (c - 1) * GX), H / (r * TH + (r - 1) * GY + 0.6));
      // Thêm hàng chỉ khi ống to hơn hẳn (một hàng dễ nhìn hơn)
      if (!best || tw > best.tw * 1.1) best = { r, tw };
    }
    const tw = Math.max(18, Math.floor(best.tw));
    const lh = Math.round(tw * LH);
    metrics = { tw, lh };
    const s = board.style;
    s.setProperty('--tw', tw + 'px');
    s.setProperty('--lh', lh + 'px');
    s.setProperty('--th', 4 * lh + Math.round(tw * HEAD) + 3 + 'px');
    s.setProperty('--gx', Math.round(tw * GX) + 'px');
    s.setProperty('--gy', Math.round(tw * GY) + 'px');
    stage.style.setProperty('--tw', tw + 'px');

    // Chia đều ống vào các hàng (hàng trên nhiều hơn nếu lẻ)
    const r = best.r;
    const base = Math.floor(n / r);
    const extra = n % r;
    const hadFocus = document.activeElement && document.activeElement.classList.contains('tube');
    board.textContent = '';
    tubeEls = [];
    rowsIdx = [];
    let i = 0;
    for (let k = 0; k < r; k++) {
      const row = document.createElement('div');
      row.className = 'row';
      const idx = [];
      for (let j = 0; j < base + (k < extra ? 1 : 0); j++, i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tube';
        b.dataset.i = String(i);
        const glass = document.createElement('span');
        glass.className = 'glass';
        b.appendChild(glass);
        row.appendChild(b);
        tubeEls.push(b);
        idx.push(i);
      }
      rowsIdx.push(idx);
      board.appendChild(row);
    }
    if (focusIdx >= n) focusIdx = 0;
    renderBoard();
    if (hadFocus) tubeEls[focusIdx].focus();
  }

  /* ---------------- Vẽ ---------------- */
  const SVG = 'http://www.w3.org/2000/svg';

  function makeLayer(c) {
    const el = document.createElement('span');
    el.className = 'layer';
    el.style.setProperty('--c', COLOURS[c][0]);
    el.style.setProperty('--ink', COLOURS[c][1]);
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'sym');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG, 'use');
    use.setAttribute('href', '#sym-' + c);
    svg.appendChild(use);
    el.appendChild(svg);
    return el;
  }

  function tubeLabel(i) {
    const tube = game.tubes[i];
    let s = t('tube.label', { n: i + 1 }) + ': ';
    s += tube.length ? tube.map((c) => t('colour.' + c)).join(', ') : t('tube.empty');
    if (E.isComplete(tube)) s += ' (' + t('tube.done') + ')';
    if (sel === i) s += ' (' + t('tube.selected') + ')';
    return s;
  }

  function renderTube(i) {
    const el = tubeEls[i];
    const tube = game.tubes[i];
    if (!el || !tube) return;
    const glass = el.firstChild;
    glass.textContent = '';
    tube.forEach((c) => glass.appendChild(makeLayer(c)));
    const done = E.isComplete(tube);
    el.classList.toggle('done', done);
    el.style.setProperty('--glow', done ? COLOURS[tube[0]][0] : 'transparent');
    el.classList.toggle('sel', sel === i);
    el.setAttribute('aria-pressed', String(sel === i));
    el.setAttribute('aria-label', tubeLabel(i));
    el.tabIndex = i === focusIdx ? 0 : -1;
  }

  function renderBoard() {
    for (let i = 0; i < tubeEls.length; i++) renderTube(i);
  }

  function renderSel() {
    tubeEls.forEach((el, i) => {
      el.classList.toggle('sel', sel === i);
      el.setAttribute('aria-pressed', String(sel === i));
      el.setAttribute('aria-label', tubeLabel(i));
    });
  }

  function renderHud() {
    $('level').textContent = String(game.level);
    $('moves').textContent = String(game.moves);
    $('time').textContent = fmt(clock.elapsed());
    const won = E.isWon(game);
    $('undo-left').textContent = String(game.undoLeft);
    $('extra-left').textContent = String(game.extraLeft);
    $('btn-undo').disabled = won || game.undoLeft <= 0 || !game.history.length;
    $('btn-extra').disabled = won || game.extraLeft <= 0;
    $('btn-restart').disabled = won;
  }

  function renderAll() {
    renderBoard();
    renderHud();
  }

  setInterval(() => {
    if (game && clock.running) $('time').textContent = fmt(clock.elapsed());
  }, 250);

  /* ---------------- Lưu ---------------- */
  const inPlay = () => game && game.moves > 0 && !E.isWon(game);

  function writeSummary() {
    const k = E.colorsFor(game ? game.level : stats.level);
    const sorted = game ? game.tubes.filter((tb) => E.isComplete(tb)).length : 0;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: stats.played ? t('summary.level', { n: stats.level }) : t('summary.none'),
      stats: stats.played
        ? [{ value: String(stats.level), label: t('summary.statLevel') }, { value: String(stats.won), label: t('summary.statWon') }]
        : [],
      resume: inPlay()
        ? { title: t('summary.resume', { n: game.level }), detail: t('summary.resumeDetail', { n: game.moves }), pct: Math.round((sorted / k) * 100) / 100 }
        : null,
      now: Date.now(),
    }));
  }

  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()), reported });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Báo ván ---------------- */
  function report(won) {
    if (reported || !game) return;
    reported = true;
    kit.sdk.end({ mode: MODE, won, timeMs: Math.round(clock.elapsed()), assisted: game.assisted });
  }

  /** Bỏ màn đang dở (đã rót) thì tính thua; chưa rót lần nào thì không gửi gì. */
  function abandon() {
    if (!inPlay() || reported) return;
    stats.played++;
    saveStats();
    report(false);
  }

  /* ---------------- Luồng màn ---------------- */
  function begin() {
    sel = null;
    busy = false;
    reported = false;
    focusIdx = 0;
    clock.reset();
    kit.sdk.start(MODE);
    layout();
    renderHud();
    persist();
  }

  function startLevel(level) {
    game = E.newGame(level, randomSeed());
    begin();
  }

  function restartLevel() {
    kit.modal.closeAll();
    abandon();
    game = E.restart(game);
    begin();
    kit.sfx('start');
  }

  function requestRestart() {
    if (busy || !game || E.isWon(game)) return;
    if (inPlay() && !reported && !E.isStuck(game)) kit.modal.open('modal-confirm');
    else restartLevel();
  }

  function nextLevel() {
    kit.modal.close('modal-win');
    startLevel(stats.level);
    kit.sfx('levelup');
  }

  function finish() {
    clock.pause();
    stats.played++;
    stats.won++;
    stats.level = Math.max(stats.level, game.level + 1);
    saveStats();
    report(true);
    persist();
    renderHud();
    kit.sfx('win');
    kit.confetti();
    $('win-title').textContent = t('win.title', { n: game.level });
    $('win-moves').textContent = kit.i18n.fmtNumber(game.moves);
    $('win-time').textContent = fmt(clock.elapsed());
    $('win-assisted').hidden = !game.assisted;
    setTimeout(() => kit.modal.open('modal-win'), reduced() ? 0 : 650);
  }

  function showStuck() {
    const canUndo = game.undoLeft > 0 && game.history.length > 0;
    const canExtra = game.extraLeft > 0;
    // Hết cách cứu thì màn coi như thua luôn (vẫn mở được bảng để xem lại)
    if (!canUndo && !canExtra && !reported) {
      stats.played++;
      saveStats();
      report(false);
      persist();
    }
    $('btn-stuck-undo').hidden = !canUndo;
    $('btn-stuck-undo').textContent = t('stuck.undo', { n: game.undoLeft });
    $('btn-stuck-extra').hidden = !canExtra;
    $('btn-stuck-extra').textContent = t('stuck.extra');
    $('stuck-text').textContent = t(canUndo || canExtra ? 'stuck.textHelp' : 'stuck.text');
    kit.sfx('lose');
    setTimeout(() => {
      if (game && E.isStuck(game) && !kit.modal.current()) kit.modal.open('modal-stuck');
    }, reduced() ? 0 : 450);
  }

  /* ---------------- Rót ---------------- */
  function deny(i, msg) {
    kit.sfx('error', { volume: 0.6 });
    if (i != null) replay(tubeEls[i], 'shake');
    if (msg) kit.toast(msg);
    announce(msg || t('live.cant'));
  }

  function onTube(i) {
    if (busy || !game || E.isWon(game) || kit.modal.current()) return;
    if (!Number.isInteger(i) || i < 0 || i >= game.tubes.length) return;
    focusIdx = i;
    if (sel === null) {
      if (!game.tubes[i].length) return deny(i);
      sel = i;
      kit.sfx('tap');
      renderSel();
      return;
    }
    if (sel === i) {
      sel = null;
      renderSel();
      return;
    }
    const from = sel;
    const n = E.canPour(game, from, i);
    sel = null;
    if (!n) {
      renderSel();
      deny(i);
      return;
    }
    pour(from, i, n);
  }

  function pour(a, b, n) {
    const colour = game.tubes[a][game.tubes[a].length - 1];
    const before = game.tubes[b].length;
    game = E.pour(game, a, b);
    clock.resume();
    kit.sfx('drop');
    announce(t('live.poured', { n, a: a + 1, b: b + 1 }));
    persist();
    renderHud();
    if (reduced()) {
      renderSel();
      renderTube(a);
      renderTube(b);
      afterPour(b);
    } else {
      animatePour(a, b, n, colour, before, () => afterPour(b));
    }
  }

  function afterPour(b) {
    if (E.isWon(game)) return finish();
    if (E.isComplete(game.tubes[b])) {
      replay(tubeEls[b], 'pop');
      kit.sfx('clear');
    }
    if (E.isStuck(game)) showStuck();
  }

  /**
   * Ống nguồn bay tới trên ống đích (xoay quanh miệng ống), nghiêng, nước chảy thành dòng:
   * lớp trên cùng của ống nguồn rút dần, lớp mới trong ống đích dâng lên; xong thì ống nguồn quay về.
   */
  function animatePour(a, b, n, colour, before, done) {
    busy = true;
    const src = tubeEls[a];
    const dst = tubeEls[b];
    const { tw, lh } = metrics;
    // Toạ độ trong khung chơi (offsetParent của ống là .stage), không tính transform đang có
    const sx = src.offsetLeft + src.offsetWidth / 2;
    const sy = src.offsetTop;
    const dx = dst.offsetLeft + dst.offsetWidth / 2;
    // Nghiêng về phía ống đích; thân ống (dài cỡ chiều cao ống) mà tràn khỏi khung thì nghiêng ngược lại
    const len = src.offsetHeight;
    let dir = dx >= sx ? 1 : -1;
    if (dir === 1 && dx - len < -tw * 0.3) dir = -1;
    else if (dir === -1 && dx + len > stage.clientWidth + tw * 0.3) dir = 1;
    const px = dx - dir * tw * 0.1;
    const py = dst.offsetTop - tw * 0.55;
    renderSel();
    src.classList.add('pouring');
    src.style.transition = 'transform ' + MOVE_MS + 'ms ease-in-out';
    src.style.transform = 'translate(' + (px - sx) + 'px,' + (py - sy) + 'px) rotate(' + dir * TILT + 'deg)';

    setTimeout(() => {
      // Dòng nước từ miệng ống xuống mặt nước của ống đích
      const surface = dst.offsetTop + dst.offsetHeight - 3 - before * lh;
      stream.style.setProperty('--c', COLOURS[colour][0]);
      stream.style.left = Math.round(px - tw * 0.1) + 'px';
      stream.style.top = Math.round(py) + 'px';
      stream.style.height = Math.max(0, Math.round(surface - py)) + 'px';
      stream.hidden = false;
      // Rút nước ở ống nguồn, dâng nước ở ống đích
      const layers = src.querySelectorAll('.layer');
      const drain = Array.prototype.slice.call(layers, layers.length - n);
      const glass = dst.firstChild;
      const fill = [];
      for (let k = 0; k < n; k++) {
        const el = makeLayer(colour);
        el.style.height = '0px';
        el.classList.add('anim');
        glass.appendChild(el);
        fill.push(el);
      }
      drain.forEach((el) => el.classList.add('anim'));
      void glass.offsetWidth;
      fill.forEach((el) => { el.style.height = ''; });
      drain.forEach((el) => { el.style.height = '0px'; });
    }, MOVE_MS);

    setTimeout(() => {
      stream.hidden = true;
      renderTube(a);
      renderTube(b);
      src.style.transition = 'transform ' + BACK_MS + 'ms ease-in-out';
      src.style.transform = '';
      busy = false;
      done();
      setTimeout(() => {
        src.style.transition = '';
        src.classList.remove('pouring');
      }, BACK_MS);
    }, MOVE_MS + FLOW_MS);
  }

  /* ---------------- Trợ giúp ---------------- */
  function useUndo() {
    if (busy || !game || E.isWon(game)) return;
    if (game.undoLeft <= 0) return deny(null, t('toast.noUndo'));
    if (!game.history.length) return deny(null, t('toast.nothingUndo'));
    const g = E.undo(game);
    if (!g) return deny(null, t('toast.nothingUndo'));
    game = g;
    sel = null;
    kit.modal.close('modal-stuck');
    kit.sfx('flip');
    replay($('btn-undo'), 'used');
    renderAll();
    persist();
  }

  function useExtra() {
    if (busy || !game || E.isWon(game)) return;
    if (game.extraLeft <= 0) return deny(null, t('toast.noExtra'));
    game = E.addTube(game);
    sel = null;
    kit.modal.close('modal-stuck');
    kit.sfx('coin');
    replay($('btn-extra'), 'used');
    layout();
    renderHud();
    persist();
  }

  /* ---------------- Sự kiện ---------------- */
  board.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('.tube');
    if (el) onTube(Number(el.dataset.i));
  });
  board.addEventListener('focusin', (e) => {
    const el = e.target.closest && e.target.closest('.tube');
    if (!el) return;
    focusIdx = Number(el.dataset.i);
    tubeEls.forEach((x, i) => { x.tabIndex = i === focusIdx ? 0 : -1; });
  });

  $('btn-undo').addEventListener('click', useUndo);
  $('btn-extra').addEventListener('click', useExtra);
  $('btn-restart').addEventListener('click', requestRestart);
  $('btn-confirm-restart').addEventListener('click', restartLevel);
  $('btn-stuck-undo').addEventListener('click', useUndo);
  $('btn-stuck-extra').addEventListener('click', useExtra);
  $('btn-stuck-restart').addEventListener('click', restartLevel);
  $('btn-next').addEventListener('click', nextLevel);
  $('btn-stats').addEventListener('click', () => {
    $('stats-level').textContent = kit.i18n.fmtNumber(stats.level);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-rate').textContent = stats.played ? Math.round((stats.won / stats.played) * 100) + '%' : '–';
  });

  /** Ống kế bên theo phím mũi tên (trái / phải theo thứ tự, lên / xuống sang hàng kề). */
  function neighbour(i, key) {
    const n = tubeEls.length;
    if (key === 'ArrowLeft') return (i - 1 + n) % n;
    if (key === 'ArrowRight') return (i + 1) % n;
    const r = rowsIdx.findIndex((row) => row.indexOf(i) >= 0);
    const r2 = key === 'ArrowUp' ? r - 1 : r + 1;
    if (r < 0 || r2 < 0 || r2 >= rowsIdx.length) return i;
    const col = rowsIdx[r].indexOf(i);
    const row = rowsIdx[r2];
    return row[Math.min(row.length - 1, Math.round((col / Math.max(1, rowsIdx[r].length - 1)) * (row.length - 1)))];
  }

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key;
    if (/^[0-9]$/.test(k)) {
      const i = k === '0' ? 9 : Number(k) - 1;
      if (i < tubeEls.length) {
        onTube(i);
        tubeEls[i].focus();
      }
    } else if (k.indexOf('Arrow') === 0) {
      const onTubeEl = document.activeElement && document.activeElement.classList.contains('tube');
      const i = onTubeEl ? neighbour(focusIdx, k) : sel != null ? sel : focusIdx;
      focusIdx = i;
      tubeEls[i].focus();
    } else if (k === 'u' || k === 'U' || k === 'z' || k === 'Z') useUndo();
    else if (k === 't' || k === 'T' || k === '+') useExtra();
    else if (k === 'r' || k === 'R') requestRestart();
    else if (k === 'Escape' && sel != null) {
      sel = null;
      renderSel();
    } else return;
    e.preventDefault();
  });

  kit.onLeave(persist);
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (game && !busy) layout(); }, 80);
  });

  /* ---------------- Khởi động: mở lại màn dở nếu có ---------------- */
  applySymbols();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && restored.moves > 0 && !E.isWon(restored)) {
    game = restored;
    reported = saved.reported === true;
    clock.set(Number(saved.elapsed) || 0);
    if (!reported) kit.sdk.start(MODE, true);
    layout();
    renderHud();
    writeSummary();
    if (E.isStuck(game)) showStuck();
    else kit.toast(t('toast.saved'));
  } else {
    startLevel(stats.level);
  }
})();
