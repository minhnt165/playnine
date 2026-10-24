/* =====================================================================
 * Mạt Chược Ghép - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js, faces.js nạp trước)
 *   - Mỗi bàn là một mode ('turtle' | 'tower' | 'mini'), cộng 'daily' (bàn Rùa theo seed ngày, mỗi ngày chơi một lần)
 *   - Đồng hồ chạy từ lúc chia bàn, dừng khi mở hộp thoại / ẩn tab (bàn bị làm mờ lúc dừng), lưu cùng ván dở
 *   - Hoàn tác không ảnh hưởng điểm; gợi ý hoặc xáo lại → assisted (cổng không xếp hạng, máy không tính kỷ lục).
 *     Không phạt thời gian vì máy chủ từ chối timeMs lớn hơn thời gian thật của ván quá 5 giây.
 *   - Báo ván cho cổng:
 *     - ván mới: kit.sdk.start(mode); mở lại ván lưu dở: kit.sdk.start(mode, true)
 *     - thắng: kit.sdk.end({ mode, won: true, timeMs, assisted })
 *     - bỏ ván (ván mới / đổi bàn) khi đã gỡ ít nhất một cặp: won: false; chưa gỡ cặp nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODES = E.MODES;
  // Điện thoại dọc lần đầu mở: mặc định bàn Tháp (quân to hơn hẳn Rùa trên màn hình hẹp)
  const narrow = window.innerWidth < 600 && window.innerHeight > window.innerWidth;
  const kit = PNKit.init({ gameId: 'matchuocghep', version: '1.0.0', dict: window.GAME_DICT, defaults: { mode: narrow ? 'tower' : 'turtle', faces: 'auto' }, onSetting });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);
  const OUT_MS = 220; // hiệu ứng cặp vừa gỡ
  const HINT_MS = 3000; // thời gian tô cặp gợi ý
  const SIMPLE_BELOW = 40; // px: chế độ "Tự động" dùng mặt đơn giản khi quân hẹp hơn mức này
  const LAYER = 0.1; // độ lệch mỗi tầng (theo bề rộng quân)
  const THICK = 0.1; // bề dày quân (theo bề rộng quân)

  const isMode = (m) => MODES.indexOf(m) >= 0;
  const modeName = (m) => t('mode.' + m);

  // Sprite mặt quân (chữ trên quân gió theo ngôn ngữ đang dùng)
  document.body.insertAdjacentHTML('afterbegin', window.MJFaces.sprite(kit.i18n.lang));

  /* ---------------- Thống kê ---------------- */

  const num = (x) => (Number.isInteger(x) && x >= 0 ? x : 0);
  const time = (x) => (typeof x === 'number' && x > 0 ? x : null);
  const stats = (function () {
    const raw = kit.store.read(keys.stats, {}) || {};
    const s = { played: num(raw.played), won: num(raw.won), best: {}, daily: {}, maxDaily: num(raw.maxDaily) };
    MODES.forEach((m) => { s.best[m] = time(raw.best && raw.best[m]); });
    if (raw.daily && typeof raw.daily === 'object') {
      Object.keys(raw.daily).forEach((k) => {
        const d = raw.daily[k];
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && d && typeof d === 'object') s.daily[k] = { won: !!d.won, ms: time(d.ms) };
      });
    }
    return s;
  })();

  const today = () => E.dateKey(new Date());
  function shiftDay(key, n) {
    const [y, m, d] = key.split('-').map(Number);
    return E.dateKey(new Date(y, m - 1, d + n));
  }
  /** Chuỗi ngày thắng bàn ngày liên tiếp tới hôm nay (hôm nay chưa chơi thì tính tới hôm qua). */
  function dailyStreak() {
    const now = today();
    if (stats.daily[now] && !stats.daily[now].won) return 0;
    let k = stats.daily[now] ? now : shiftDay(now, -1);
    let n = 0;
    while (stats.daily[k] && stats.daily[k].won) {
      n++;
      k = shiftDay(k, -1);
    }
    return n;
  }
  /** Bàn hôm nay đã chơi (thắng hoặc bỏ) thì không chơi lại được. */
  const dailyDone = () => !!stats.daily[today()];

  /* ---------------- Trạng thái giao diện ---------------- */

  let game = null;
  let sel = -1; // quân đang chọn
  let cursor = -1; // quân đang focus bằng bàn phím
  let hintPair = null;
  let hintTimer = 0;
  const leaving = new Set(); // quân đang chạy hiệu ứng gỡ
  let leaveTimer = 0;
  let winTimer = 0;
  let stuckTimer = 0;
  let pending = null; // việc chờ xác nhận bỏ ván: { kind: 'new' } | { kind: 'mode', mode }
  let stuckShuffle; // kết quả xáo đã tính cho lần hết nước hiện tại (null = không xáo được)
  let tiles = [];
  let builtFor = '';
  let centers = []; // tâm từng quân (px trong bàn) cho di chuyển bằng phím
  let simpleFaces = false;

  const mode = () => game.mode;
  const won = () => !!game && E.isWon(game);
  /** Ván đang dở: đã gỡ ít nhất một cặp và chưa gỡ hết (bỏ lúc này là thua). */
  const inPlay = () => !!game && game.moves > 0 && !E.isWon(game);
  const assisted = () => !!game && (game.hints > 0 || game.shuffles > 0);

  /** Đồng hồ trên HUD: m:ss */
  function fmtClock(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  /** Thời gian kỷ lục: m:ss.d */
  function fmt(ms) {
    const ds = Math.floor(ms / 100);
    const m = Math.floor(ds / 600);
    const s = Math.floor((ds % 600) / 10);
    return m + ':' + String(s).padStart(2, '0') + (kit.i18n.lang === 'vi' ? ',' : '.') + (ds % 10);
  }

  function faceName(f) {
    const { suit, rank } = E.faceInfo(f);
    if (suit === 'dots' || suit === 'bamboo' || suit === 'chars') return t('face.' + suit, { n: rank });
    return t('face.' + suit + rank);
  }

  /* ---------------- Vẽ bàn ---------------- */

  const board = $('board');
  const stage = $('stage');

  /** Dựng các nút quân cho bàn của ván (khi đổi bàn). Thứ tự DOM = thứ tự vẽ (tầng, cột, hàng). */
  function buildBoard() {
    const L = E.layoutOf(mode());
    board.textContent = '';
    tiles = L.pos.map((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile';
      b.dataset.i = i;
      b.tabIndex = -1;
      b.style.zIndex = i + 1;
      b.style.setProperty('--d', p.z * 90 + (p.x + p.y) * 6 + 'ms');
      b.innerHTML = '<svg class="face" viewBox="0 0 60 80" aria-hidden="true"><use href=""/></svg>';
      b._use = b.firstChild.firstChild;
      b._href = '';
      board.appendChild(b);
      return b;
    });
    builtFor = L.key;
    layoutBoard();
  }

  /** Cỡ quân theo khung (vừa khít, không cuộn), đặt vị trí từng quân; tầng trên lệch lên trái để thấy độ sâu. */
  function layoutBoard() {
    if (!game || !tiles.length) return;
    const L = E.layoutOf(mode());
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (!W || !H) return;
    const Z = L.maxZ;
    const tw = Math.max(12, Math.min(88, W / (L.cols + LAYER * Z + THICK + 0.05), H / (L.rows * 4 / 3 + LAYER * Z + THICK + 0.05)));
    const th = (tw * 4) / 3;
    const dz = tw * LAYER;
    board.style.width = Math.ceil(L.cols * tw + Z * dz + tw * THICK) + 'px';
    board.style.height = Math.ceil(L.rows * th + Z * dz + tw * THICK) + 'px';
    board.style.setProperty('--tw', tw.toFixed(2) + 'px');
    board.style.setProperty('--th', th.toFixed(2) + 'px');
    board.style.setProperty('--dep', (tw * THICK).toFixed(2) + 'px');
    centers = L.pos.map((p, i) => {
      const left = (p.x / 2) * tw + (Z - p.z) * dz;
      const top = (p.y / 2) * th + (Z - p.z) * dz;
      tiles[i].style.left = left.toFixed(1) + 'px';
      tiles[i].style.top = top.toFixed(1) + 'px';
      return { x: left + tw / 2, y: top + th / 2 };
    });
    const pref = kit.settings.get().faces;
    const simple = pref === 'simple' || (pref !== 'classic' && tw < SIMPLE_BELOW);
    if (simple !== simpleFaces) {
      simpleFaces = simple;
      render();
    }
  }

  function render() {
    if (!game) return;
    if (builtFor !== E.layoutOf(mode()).key) buildBoard();
    const free = new Set(E.freeTiles(game));
    if (sel >= 0 && !free.has(sel)) sel = -1;
    fixCursor(free);
    const stuck = E.isStuck(game);
    const pairs = won() ? 0 : E.availablePairs(game).length;
    const kind = simpleFaces ? '#mj-s' : '#mj-f';
    tiles.forEach((b, i) => {
      const out = leaving.has(i);
      const gone = !!game.gone[i] && !out;
      b.hidden = gone;
      if (gone) return;
      const href = kind + game.faces[i];
      if (b._href !== href) {
        b._use.setAttribute('href', href);
        b._href = href;
      }
      const isFree = free.has(i);
      b.classList.toggle('free', isFree || out);
      b.classList.toggle('sel', i === sel);
      b.classList.toggle('hint', !!hintPair && (hintPair[0] === i || hintPair[1] === i));
      b.classList.toggle('out', out);
      b.tabIndex = i === cursor ? 0 : -1;
      let label = faceName(game.faces[i]) + ', ' + t(isFree ? 'tile.free' : 'tile.blocked');
      if (i === sel) label += ', ' + t('tile.selected');
      b.setAttribute('aria-label', label);
    });
    const left = E.remaining(game);
    board.setAttribute('aria-label', t('board.label', { name: modeName(mode()), n: left }));
    board.classList.toggle('cleared', won());
    $('tiles').textContent = kit.i18n.fmtNumber(left);
    $('pairs').textContent = won() ? '–' : kit.i18n.fmtNumber(pairs);
    $('pairs').classList.toggle('warn', stuck);
    const best = stats.best[mode()];
    $('best').textContent = best == null ? '–' : fmt(best);
    $('btn-undo').disabled = !E.canUndo(game) || won();
    $('btn-hint').disabled = won();
    $('btn-shuffle').disabled = !stuck;
    tick();
  }

  /** Giữ con trỏ bàn phím trên một quân tự do (gần chỗ cũ nhất). */
  function fixCursor(free) {
    if (cursor >= 0 && free.has(cursor)) return;
    const from = cursor >= 0 && centers[cursor] ? centers[cursor] : { x: 0, y: 0 };
    let best = -1;
    let bestD = Infinity;
    free.forEach((i) => {
      if (!centers[i]) return;
      const d = Math.hypot(centers[i].x - from.x, centers[i].y - from.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    cursor = best;
  }

  /** Cập nhật đồng hồ trên HUD; chạy theo khung hình khi đồng hồ đang chạy. */
  let raf = 0;
  let shown = '';
  function tick() {
    cancelAnimationFrame(raf);
    const s = fmtClock(game ? clock.elapsed() : 0);
    if (s !== shown) $('time').textContent = shown = s;
    if (clock.running) raf = requestAnimationFrame(tick);
  }

  /** Chạy lại một hiệu ứng CSS (gỡ lớp, ép vẽ lại, gắn lại). */
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /**
   * Đồng hồ chỉ chạy khi ván chưa xong, không mở hộp thoại và tab đang hiện.
   * Đang mở hộp thoại thì làm mờ bàn để không nhìn bàn "miễn phí" lúc đồng hồ dừng.
   */
  function syncClock() {
    const open = !!kit.modal.current();
    const playing = !!game && !won();
    if (playing && !open && !document.hidden) clock.resume();
    else clock.pause();
    $('app').classList.toggle('paused', playing && open);
    tick();
  }

  /* ---------------- Lưu ---------------- */

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }

  function writeSummary() {
    const m = game ? mode() : kit.settings.get().mode;
    const best = stats.best[m];
    const out = [];
    if (stats.won > 0) out.push({ value: kit.i18n.fmtNumber(stats.won), label: t('stats.won') });
    if (best != null) out.push({ value: fmt(best), label: t('hud.best') + ' ' + modeName(m) });
    const now = today();
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: best == null ? t('summary.none') : t('summary.note', { name: modeName(m), time: fmt(best) }),
      stats: out,
      resume: inPlay()
        ? { title: t('app.name') + ' · ' + modeName(m), detail: t('summary.resume', { name: modeName(m), n: E.remaining(game) }), pct: E.progress(game) }
        : null,
      daily: { date: now, done: !!stats.daily[now], title: t('summary.dailyTitle', { n: E.dayNumber(now) }), streak: dailyStreak() },
      now: Date.now(),
    }));
  }

  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */

  function resetView() {
    clearTimeout(winTimer);
    clearTimeout(stuckTimer);
    clearTimeout(leaveTimer);
    clearHint();
    leaving.clear();
    sel = -1;
    cursor = -1;
    stuckShuffle = undefined;
  }

  function newBoard(m) {
    resetView();
    game = m === 'daily' ? E.newGame({ mode: 'daily', date: today() }) : E.newGame({ mode: m, seed: Math.floor(Math.random() * 4294967296) });
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(m);
    render();
    if (!calm()) replay(board, 'deal');
    syncClock();
    writeSummary();
  }

  function clearHint() {
    clearTimeout(hintTimer);
    hintPair = null;
  }

  /** Bấm một quân: chọn / bỏ chọn / gỡ cặp; quân bị chặn thì rung nhẹ. */
  function press(i) {
    if (!game || won() || kit.modal.current() || game.gone[i] || leaving.has(i)) return;
    if (!E.isFree(game, i)) {
      kit.sfx('error');
      if (!calm()) replay(tiles[i], 'nope');
      return;
    }
    cursor = i;
    if (sel < 0 || sel === i) {
      sel = sel === i ? -1 : i;
      kit.sfx('tap');
      render();
      return;
    }
    const next = E.match(game, sel, i);
    if (next === game) {
      // Không ghép được: chuyển sang chọn quân mới
      sel = i;
      kit.sfx('tap');
      render();
      return;
    }
    const pair = [sel, i];
    game = next;
    sel = -1;
    clearHint();
    stuckShuffle = undefined;
    if (!calm()) {
      pair.forEach((k) => leaving.add(k));
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => {
        leaving.clear();
        render();
      }, OUT_MS);
    }
    render();
    if (E.isWon(game)) {
      finish();
      return;
    }
    kit.sfx('pop');
    persist();
    if (E.isStuck(game)) {
      clearTimeout(stuckTimer);
      stuckTimer = setTimeout(onStuck, calm() ? 0 : OUT_MS + 80);
    }
  }

  /** Hết nước: báo, đề nghị hoàn tác / xáo lại / ván mới. */
  function onStuck() {
    if (!game || !E.isStuck(game)) return;
    if (stuckShuffle === undefined) stuckShuffle = E.shuffle(game);
    $('stuck-text').textContent = stuckShuffle ? t('stuck.text') : t('stuck.noShuffle');
    $('btn-stuck-shuffle').hidden = !stuckShuffle;
    $('btn-stuck-undo').disabled = !E.canUndo(game);
    kit.sfx('error');
    kit.modal.open('modal-stuck');
  }

  function doShuffle() {
    if (!game || !E.isStuck(game)) return;
    if (stuckShuffle === undefined) stuckShuffle = E.shuffle(game);
    const next = stuckShuffle;
    if (!next) {
      onStuck();
      return;
    }
    const first = !assisted();
    game = next;
    sel = -1;
    stuckShuffle = undefined;
    kit.modal.close('modal-stuck');
    kit.sfx('flip');
    if (!calm()) replay(board, 'shuffling');
    render();
    persist();
    kit.toast(first ? t('toast.shuffled') : t('btn.shuffle'));
  }

  function undoMove() {
    if (!game || won() || !E.canUndo(game)) return;
    game = E.undo(game);
    sel = -1;
    clearHint();
    stuckShuffle = undefined;
    kit.modal.close('modal-stuck');
    kit.sfx('move');
    render();
    persist();
  }

  function hint() {
    if (!game || won() || kit.modal.current()) return;
    if (E.isStuck(game)) {
      onStuck();
      return;
    }
    const h = E.hint(game);
    if (!h) return;
    const first = !assisted();
    game = h.game;
    sel = -1;
    clearHint();
    hintPair = [h.a, h.b];
    hintTimer = setTimeout(() => {
      hintPair = null;
      render();
    }, HINT_MS);
    cursor = h.a;
    render();
    tiles[h.a].focus({ preventScroll: true });
    kit.sfx('flip');
    if (first) kit.toast(t('toast.hintFirst'), 2600);
    else if (h.solvable === false) kit.toast(t('toast.hintDead'), 3200);
    persist();
  }

  function finish() {
    clock.pause();
    clearTimeout(stuckTimer);
    const ms = Math.round(clock.elapsed());
    const m = mode();
    const help = assisted();
    const isBest = !help && (stats.best[m] == null || ms < stats.best[m]);
    stats.played++;
    stats.won++;
    if (isBest) stats.best[m] = ms;
    if (m === 'daily') {
      stats.daily[game.date] = { won: true, ms };
      stats.maxDaily = Math.max(stats.maxDaily, dailyStreak());
    }
    saveStats();
    persist();
    kit.sdk.end({ mode: m, won: true, timeMs: ms, assisted: help });
    kit.sfx('win');
    kit.confetti();
    render();
    $('app').classList.remove('paused');

    $('win-time').textContent = t('win.time', { time: fmt(ms) });
    const badge = $('win-badge');
    badge.hidden = !isBest && m !== 'daily';
    if (isBest) badge.textContent = t('win.best', { name: modeName(m) });
    else if (m === 'daily') badge.textContent = t('win.daily', { n: E.dayNumber(game.date), streak: dailyStreak() });
    let note = '';
    if (help) note = t('win.assisted');
    else if (!isBest && stats.best[m] != null) note = t('win.noteBest', { name: modeName(m), time: fmt(stats.best[m]) });
    $('win-note').textContent = note;
    $('win-note').hidden = !note;
    // Cho người chơi kịp thấy bàn sạch rồi mới mở hộp thắng
    winTimer = setTimeout(() => {
      if (won()) kit.modal.open('modal-win');
    }, calm() ? 0 : 650);
  }

  /** Bỏ ván đang dở: tính thua, báo cổng; bàn ngày tính là đã chơi. */
  function abandon() {
    stats.played++;
    if (mode() === 'daily' && !stats.daily[game.date]) stats.daily[game.date] = { won: false, ms: null };
    saveStats();
    kit.sdk.end({ mode: mode(), won: false, timeMs: Math.round(clock.elapsed()), assisted: assisted() });
  }

  function askConfirm(p) {
    pending = p;
    $('btn-confirm').textContent = p.kind === 'mode' ? t('confirm.mode', { name: modeName(p.mode) }) : t('kit.newGame');
    kit.modal.open('modal-confirm');
  }

  function confirmLeave() {
    const p = pending;
    pending = null;
    kit.modal.close('modal-confirm');
    if (!p || !inPlay()) return;
    abandon();
    if (p.kind === 'mode') switchMode(p.mode);
    else {
      newBoard(nextMode());
      syncModeSetting();
    }
  }

  /** Bàn cho "Ván mới": bàn đang chơi, trừ bàn ngày đã chơi hôm nay thì sang Rùa. */
  function nextMode() {
    const m = game ? mode() : kit.settings.get().mode;
    if (m === 'daily' && dailyDone()) return 'turtle';
    return isMode(m) ? m : 'turtle';
  }

  function requestNew() {
    if (inPlay()) {
      askConfirm({ kind: 'new' });
      return;
    }
    kit.modal.closeAll();
    const m = nextMode();
    newBoard(m);
    syncModeSetting();
  }

  /** Đổi bàn: chia bàn mới trước, rồi lưu cài đặt (onSetting gặp bàn đã khớp nên không làm gì). */
  function switchMode(m) {
    newBoard(m);
    kit.settings.set({ mode: m });
  }

  function dailyDoneToast() {
    const d = stats.daily[today()];
    kit.toast(t('toast.dailyDone', { result: d && d.won && d.ms ? fmt(d.ms) : t('toast.dailyLost') }), 2600);
  }

  /** Yêu cầu đổi bàn (thanh chọn bàn). Ván đang dở thì giữ lựa chọn cũ và hỏi trước. */
  function requestMode(m) {
    if (!isMode(m) || !game || m === mode()) return;
    if (m === 'daily' && dailyDone()) {
      syncModeSetting();
      dailyDoneToast();
      return;
    }
    if (inPlay()) {
      syncModeSetting();
      askConfirm({ kind: 'mode', mode: m });
    } else {
      switchMode(m);
    }
  }

  function onSetting(key, value) {
    if (key === 'mode') requestMode(value);
    else if (key === 'faces' && game) {
      layoutBoard(); // tính lại kiểu mặt theo cỡ quân
      render();
    }
  }

  /** Cài đặt bàn đi theo ván đang có (ghi thẳng, không qua onSetting). */
  function syncModeSetting() {
    if (!game || kit.settings.get().mode === mode()) return;
    kit.settings.get().mode = mode();
    kit.store.write(keys.settings, kit.settings.get());
    kit.renderSettings();
  }

  /* ---------------- Sự kiện: chuột / chạm ---------------- */

  board.addEventListener('click', (e) => {
    const b = e.target.closest('.tile');
    if (b) press(Number(b.dataset.i));
  });
  board.addEventListener('contextmenu', (e) => e.preventDefault());
  board.addEventListener('focusin', (e) => {
    const b = e.target.closest('.tile');
    if (b) cursor = Number(b.dataset.i);
  });

  $('btn-undo').addEventListener('click', undoMove);
  $('btn-hint').addEventListener('click', hint);
  $('btn-shuffle').addEventListener('click', () => {
    if (game && E.isStuck(game)) onStuck();
  });
  $('btn-stuck-shuffle').addEventListener('click', doShuffle);
  $('btn-stuck-undo').addEventListener('click', undoMove);
  $('btn-stuck-new').addEventListener('click', () => {
    kit.modal.close('modal-stuck');
    requestNew();
  });
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm').addEventListener('click', confirmLeave);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newBoard(nextMode());
    syncModeSetting();
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    MODES.forEach((m) => { $('stats-best-' + m).textContent = stats.best[m] == null ? '–' : fmt(stats.best[m]); });
    const streak = dailyStreak();
    $('stats-streak').textContent = kit.i18n.fmtNumber(streak);
    $('stats-max').textContent = kit.i18n.fmtNumber(Math.max(stats.maxDaily, streak));
  });

  /* ---------------- Sự kiện: bàn phím ---------------- */

  /** Chuyển con trỏ sang quân tự do gần nhất theo hướng (dx, dy). */
  function moveCursor(dx, dy) {
    const free = E.freeTiles(game).filter((i) => !leaving.has(i));
    if (!free.length) return;
    if (cursor < 0 || free.indexOf(cursor) < 0) {
      fixCursor(new Set(free));
    } else {
      const c = centers[cursor];
      let best = -1;
      let bestScore = Infinity;
      free.forEach((i) => {
        if (i === cursor) return;
        const vx = centers[i].x - c.x;
        const vy = centers[i].y - c.y;
        const along = vx * dx + vy * dy;
        if (along <= 2) return;
        const score = along + 2.2 * Math.abs(dx ? vy : vx);
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      });
      if (best >= 0) cursor = best;
    }
    render();
    if (cursor >= 0) tiles[cursor].focus({ preventScroll: true });
  }

  const ARROWS = { arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0] };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey) {
      if (k === 'z') undoMove();
      else return;
      e.preventDefault();
      return;
    }
    const target = e.target;
    const onTile = !!(target.closest && target.closest('.tile'));
    const onOther = !onTile && target.closest && target.closest('button, input, a[href]');
    if (ARROWS[k]) {
      if (target.closest && target.closest('.segmented')) return; // mũi tên trong thanh chọn bàn do kit xử lý
      moveCursor(ARROWS[k][0], ARROWS[k][1]);
    } else if (k === ' ' || k === 'enter') {
      if (onOther) return; // để trình duyệt bấm nút đang focus
      if (cursor < 0) moveCursor(0, 0);
      if (cursor < 0) return;
      tiles[cursor].focus({ preventScroll: true });
      press(cursor);
    } else if (k === 'escape') {
      if (sel < 0) return;
      sel = -1;
      render();
    } else if (k === 'z' || k === 'u' || k === 'backspace') undoMove();
    else if (k === 'h') hint();
    else if (k === 's') {
      if (E.isStuck(game)) onStuck();
    } else if (k === 'n') requestNew();
    else return;
    e.preventDefault();
  });
  // Space trên nút quân: chặn cả keyup để trình duyệt không bấm thêm lần nữa
  board.addEventListener('keyup', (e) => { if (e.key === ' ') e.preventDefault(); });

  /* ---------------- Đồng hồ theo hộp thoại / tab, cỡ bàn theo khung ---------------- */

  const observer = new MutationObserver(syncClock);
  document.querySelectorAll('.modal').forEach((m) => observer.observe(m, { attributes: true, attributeFilter: ['hidden'] }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncClock(); });
  kit.onLeave(persist);
  if (window.ResizeObserver) new ResizeObserver(() => layoutBoard()).observe(stage);
  else window.addEventListener('resize', layoutBoard);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */

  $('daily-no').textContent = '#' + E.dayNumber(today());

  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && E.fromJSON(saved.game);
  if (restored && restored.moves > 0 && !E.isWon(restored)) {
    game = restored;
    syncModeSetting();
    clock.reset();
    clock.set(typeof saved.elapsed === 'number' && saved.elapsed > 0 ? saved.elapsed : 0);
    kit.sdk.start(mode(), true);
    render();
    syncClock();
    writeSummary();
    kit.toast(mode() === 'daily' && game.date !== today() ? t('toast.oldDaily') : t('toast.saved'));
    if (E.isStuck(game)) onStuck();
  } else {
    newBoard(nextMode());
    syncModeSetting();
  }

  // Lần đầu mở game: hiện cách chơi (đồng hồ dừng trong lúc đọc)
  if (!kit.settings.get().guideSeen) {
    kit.settings.set({ guideSeen: true });
    if (!kit.modal.current()) kit.modal.open('modal-help');
  }
})();
