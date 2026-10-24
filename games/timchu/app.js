/* =====================================================================
 * Tìm Chữ - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, words.js, engine.js nạp trước)
 *   - Mỗi đề là một ván; mode = cỡ lưới ('s' 8x8 | 'm' 11x11 | 'l' 14x14), metric time_low
 *   - Chọn từ: kéo (chuột / chạm) từ chữ đầu tới chữ cuối, hướng tự bắt về 1 trong 8 hướng gần nhất;
 *     hoặc chạm / Enter chữ đầu rồi chữ cuối (bàn phím: mũi tên di chuyển ô)
 *   - Đồng hồ chạy từ lúc đề hiện ra, dừng khi mở hộp thoại / ẩn tab (bàn bị làm mờ lúc dừng), lưu cùng ván dở
 *   - Báo ván cho cổng:
 *     - đề mới: kit.sdk.start(mode); mở lại đề lưu dở: kit.sdk.start(mode, true)
 *     - thắng: kit.sdk.end({ mode, won: true, timeMs, assisted }) (assisted = đã dùng gợi ý)
 *     - bỏ đề (đề mới / đổi cỡ) khi đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODES = ['s', 'm', 'l'];
  const SIZE = { s: '8×8', m: '11×11', l: '14×14' };
  const COLORS = 8; // số màu vệt khoanh (lớp c0…c7 trong style.css)
  const kit = PNKit.init({ gameId: 'timchu', version: '1.0.0', dict: window.GAME_DICT, defaults: { size: 's' }, onSetting });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);
  const SVGNS = 'http://www.w3.org/2000/svg';

  const isMode = (m) => MODES.indexOf(m) >= 0;

  const defaults = { played: 0, won: 0, streak: 0, best: { s: null, m: null, l: null } };
  const stats = Object.assign({}, defaults, kit.store.read(keys.stats, {}) || {});
  stats.best = Object.assign({}, defaults.best, stats.best || {});
  MODES.forEach((m) => { if (!(typeof stats.best[m] === 'number' && stats.best[m] > 0)) stats.best[m] = null; });
  ['played', 'won', 'streak'].forEach((k) => { if (!Number.isInteger(stats[k]) || stats[k] < 0) stats[k] = 0; });

  let game = null;
  let cursor = 0; // ô đang chọn bằng bàn phím
  let anchor = null; // ô chữ đầu đã chọn (chạm / Enter), chờ chữ cuối
  let drag = null; // { id, start, end, x, y, moved } khi đang nhấn trên bàn
  let miss = null; // [a, b] đoạn vừa chọn sai (nháy đỏ)
  let missTimer = 0;
  let pulse = -1; // từ vừa tìm được (vệt nảy lên)
  let pulseTimer = 0;
  let pending = null; // việc chờ xác nhận bỏ đề: { kind: 'new' } | { kind: 'size', mode }
  let winTimer = 0;
  let cells = [];

  const board = $('board');
  const letters = $('letters');
  const marks = $('marks');

  const won = () => !!game && E.isWon(game);
  /** Đề đang dở: đã đi ít nhất một nước (chọn một đoạn / dùng gợi ý) và chưa xong (bỏ lúc này là thua). */
  const inPlay = () => !!game && (game.tries > 0 || E.hints(game) > 0) && !E.isWon(game);
  const upper = (w) => w.toUpperCase();
  const rc = (i) => ({ r: Math.floor(i / game.n) + 1, c: (i % game.n) + 1 });

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

  function say(msg) {
    $('sr-status').textContent = msg;
  }

  /* ---------------- Vẽ ---------------- */

  /** Dựng lại lưới chữ khi đổi đề. */
  function buildBoard() {
    const n = game.n;
    board.style.setProperty('--n', n);
    board.dataset.size = game.mode;
    board.dataset.grid = game.grid;
    marks.setAttribute('viewBox', '0 0 ' + n + ' ' + n);
    letters.textContent = '';
    cells = [];
    for (let i = 0; i < n * n; i++) {
      const s = document.createElement('span');
      s.className = 'cell';
      s.dataset.i = i;
      s.textContent = upper(game.grid[i]);
      s.style.setProperty('--d', Math.floor(i / n) + (i % n));
      letters.appendChild(s);
      cells.push(s);
    }
  }

  /** Phần tử SVG với thuộc tính. */
  function el(tag, attrs) {
    const e = document.createElementNS(SVGNS, tag);
    Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k]));
    return e;
  }
  const cx = (i) => (i % game.n) + 0.5;
  const cy = (i) => Math.floor(i / game.n) + 0.5;
  /** Vệt khoanh từ ô a tới ô b (a === b thì là chấm tròn). */
  function stroke(a, b, cls) {
    return el('line', { x1: cx(a), y1: cy(a), x2: cx(b), y2: cy(b), class: 'mark ' + cls });
  }

  /** Vẽ lớp vệt: từ đã tìm, chấm gợi ý, chữ đầu đang chọn, đoạn đang kéo, đoạn vừa sai. */
  function renderMarks() {
    marks.textContent = '';
    game.found.forEach((i) => {
      const c = E.wordCells(game, i);
      const line = stroke(c[0], c[c.length - 1], 'found c' + (i % COLORS) + (i === pulse ? ' pulse' : ''));
      line.style.setProperty('--k', game.found.indexOf(i));
      marks.appendChild(line);
    });
    game.hinted.forEach((i) => {
      if (E.isFound(game, i)) return;
      const c0 = E.wordCells(game, i)[0];
      marks.appendChild(el('circle', { cx: cx(c0), cy: cy(c0), r: 0.42, class: 'hint' }));
    });
    if (miss) marks.appendChild(stroke(miss[0], miss[1], 'miss'));
    const sel = drag && drag.moved ? [drag.start, drag.end] : anchor != null ? [anchor, board.classList.contains('kbd') ? cursor : anchor] : null;
    if (sel) {
      const straight = sel[0] === sel[1] || E.lineBetween(game.n, sel[0], sel[1]);
      marks.appendChild(stroke(sel[0], straight ? sel[1] : sel[0], 'sel'));
    }
    cells.forEach((s, i) => {
      s.classList.toggle('cursor', i === cursor);
      s.classList.toggle('anchor', i === anchor);
    });
  }

  function renderWords() {
    const list = $('words');
    list.textContent = '';
    game.words.forEach((p, i) => {
      const li = document.createElement('li');
      const f = E.isFound(game, i);
      li.className = 'word' + (f ? ' found c' + (i % COLORS) : '') + (!f && game.hinted.indexOf(i) >= 0 ? ' hinted' : '') + (i === pulse ? ' pulse' : '');
      li.textContent = upper(p.w);
      li.setAttribute('aria-label', p.w + ', ' + (f ? t('word.found') : t('word.left')));
      list.appendChild(li);
    });
    $('words').setAttribute('aria-label', t('words.label'));
  }

  function render() {
    if (cells.length !== game.n * game.n || board.dataset.grid !== game.grid) buildBoard();
    renderMarks();
    renderWords();
    const theme = t('theme.' + game.theme);
    $('theme-name').textContent = theme;
    board.classList.toggle('solved', won());
    board.setAttribute('aria-label', t('board.label', { size: SIZE[game.mode], theme }));
    $('found').textContent = game.found.length + '/' + game.words.length;
    $('btn-hint').disabled = won();
    const best = stats.best[game.mode];
    $('best').textContent = best == null ? '–' : fmt(best);
    tick();
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

  /** Chạy lại một hiệu ứng CSS trên phần tử (gỡ lớp, ép vẽ lại, gắn lại). */
  function replay(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  /**
   * Đồng hồ chỉ chạy khi đề chưa xong, không mở hộp thoại và tab đang hiện.
   * Đang mở hộp thoại thì làm mờ bàn để không dò chữ "miễn phí" lúc đồng hồ dừng.
   */
  function syncClock() {
    const open = !!kit.modal.current();
    const playing = !!game && !won();
    if (playing && !open && !document.hidden) clock.resume();
    else clock.pause();
    $('app').classList.toggle('paused', playing && open);
    if (open) cancelSelection();
    tick();
  }

  /* ---------------- Lưu ---------------- */

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }

  function writeSummary() {
    const m = game ? game.mode : kit.settings.get().size;
    const best = stats.best[m];
    const out = [];
    if (stats.won > 0) out.push({ value: kit.i18n.fmtNumber(stats.won), label: t('stats.won') });
    if (best != null) out.push({ value: fmt(best), label: t('hud.best') + ' ' + SIZE[m] });
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: best == null ? t('summary.none') : t('summary.note', { size: SIZE[m], time: fmt(best) }),
      stats: out,
      resume: inPlay()
        ? {
          title: t('app.name') + ' ' + SIZE[m],
          detail: t('summary.resume', { size: SIZE[m], found: game.found.length + '/' + game.words.length, time: fmtClock(clock.elapsed()) }),
          pct: E.progress(game),
        }
        : null,
      now: Date.now(),
    }));
  }

  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */

  function newBoard(m) {
    clearTimeout(winTimer);
    kit.modal.close('modal-win');
    game = E.newGame({ mode: m, seed: Math.floor(Math.random() * 4294967296) });
    cursor = Math.min(cursor, game.n * game.n - 1);
    anchor = null;
    drag = null;
    miss = null;
    pulse = -1;
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(m);
    render();
    if (!calm()) replay(board, 'deal');
    syncClock();
    writeSummary();
  }

  function cancelSelection() {
    if (anchor == null && !drag) return;
    anchor = null;
    drag = null;
    if (game) renderMarks();
  }

  /** Chọn đoạn a → b: trúng từ thì khoanh, sai thì nháy đỏ. */
  function submit(a, b) {
    if (!game || won()) return;
    const res = E.select(game, a, b);
    if (res.game === game) return;
    game = res.game;
    clearTimeout(missTimer);
    miss = null;
    pulse = -1;
    if (res.hit >= 0) {
      pulse = res.hit;
      const left = game.words.length - game.found.length;
      say(t('sr.found', { word: game.words[res.hit].w, left }));
      if (E.isWon(game)) {
        render();
        finish();
        return;
      }
      kit.sfx('clear');
      if (navigator.vibrate) try { navigator.vibrate(15); } catch (err) { /* bỏ qua */ }
    } else if (res.already >= 0) {
      pulse = res.already;
      kit.sfx('tap');
      say(t('sr.already', { word: game.words[res.already].w }));
    } else {
      miss = [a, b];
      kit.sfx('error');
      say(t('sr.miss'));
      missTimer = setTimeout(() => {
        miss = null;
        if (game) renderMarks();
      }, calm() ? 500 : 420);
    }
    if (pulse >= 0) {
      clearTimeout(pulseTimer);
      pulseTimer = setTimeout(() => { pulse = -1; }, 450); // vẽ lại sau đó không chạy lại hiệu ứng
    }
    render();
    persist();
  }

  /** Chạm / Enter vào một ô: chọn chữ đầu, chọn lại thì bỏ, chọn chữ cuối thẳng hàng thì nộp đoạn. */
  function pick(i) {
    if (!game || won() || kit.modal.current()) return;
    if (anchor == null || (anchor !== i && !E.lineBetween(game.n, anchor, i))) {
      anchor = i;
      kit.sfx('tap');
      const p = rc(i);
      say(t('cell.start', { v: upper(game.grid[i]), r: p.r, c: p.c }));
    } else if (anchor === i) {
      anchor = null;
    } else {
      const a = anchor;
      anchor = null;
      submit(a, i);
      return;
    }
    renderMarks();
  }

  function hint() {
    if (!game || won() || kit.modal.current()) return;
    const h = E.hint(game);
    if (!h) {
      kit.toast(t('toast.nohint'));
      return;
    }
    const first = E.hints(game) === 0;
    game = h.game;
    const c0 = E.wordCells(game, h.index)[0];
    const p = rc(c0);
    kit.sfx('flip');
    render();
    persist();
    say(t('sr.hint', { word: game.words[h.index].w, r: p.r, c: p.c }));
    if (first) kit.toast(t('toast.hintFirst'), 2600);
  }

  function finish() {
    clock.pause();
    anchor = null;
    drag = null;
    const ms = Math.round(clock.elapsed());
    const m = game.mode;
    const assisted = E.hints(game) > 0;
    const isBest = !assisted && (stats.best[m] == null || ms < stats.best[m]);
    stats.played++;
    stats.won++;
    stats.streak++;
    if (isBest) stats.best[m] = ms;
    saveStats();
    persist();
    kit.sdk.end({ mode: m, won: true, timeMs: ms, assisted });
    kit.sfx('win');
    kit.confetti();
    render();
    $('app').classList.remove('paused');

    $('win-time').textContent = t('win.time', { time: fmt(ms) });
    const badge = $('win-badge');
    badge.hidden = !isBest;
    badge.textContent = t('win.best', { size: SIZE[m] });
    const note = assisted
      ? t('win.assisted', { n: E.hints(game) })
      : stats.best[m] != null && !isBest ? t('win.noteBest', { size: SIZE[m], time: fmt(stats.best[m]) }) : '';
    $('win-note').textContent = note;
    $('win-note').hidden = !note;
    // Cho người chơi kịp thấy lưới đã khoanh đủ rồi mới mở hộp thắng
    winTimer = setTimeout(() => {
      if (won()) kit.modal.open('modal-win');
    }, calm() ? 0 : 900);
  }

  /** Bỏ đề đang dở: tính thua, báo cổng. */
  function abandon() {
    stats.played++;
    stats.streak = 0;
    saveStats();
    kit.sdk.end({ mode: game.mode, won: false, timeMs: Math.round(clock.elapsed()), assisted: E.hints(game) > 0 });
  }

  function askConfirm(p) {
    pending = p;
    $('btn-confirm').textContent = p.kind === 'size' ? t('confirm.size', { size: SIZE[p.mode] }) : t('kit.newGame');
    kit.modal.open('modal-confirm');
  }

  function confirmLeave() {
    const p = pending;
    pending = null;
    kit.modal.close('modal-confirm');
    if (!p || !inPlay()) return;
    abandon();
    if (p.kind === 'size') switchSize(p.mode);
    else newBoard(game.mode);
  }

  function requestNew() {
    if (inPlay()) askConfirm({ kind: 'new' });
    else newBoard(game.mode);
  }

  /** Đổi cỡ: chia đề mới cỡ đó trước, rồi lưu cài đặt (onSetting gặp cỡ đã khớp nên không làm gì). */
  function switchSize(m) {
    newBoard(m);
    kit.settings.set({ size: m });
  }

  /** Yêu cầu đổi cỡ (thanh chọn cỡ). Đề đang dở thì giữ lựa chọn cũ và hỏi trước. */
  function requestSize(m) {
    if (!isMode(m) || !game || m === game.mode) return;
    if (inPlay()) {
      kit.settings.set({ size: game.mode });
      askConfirm({ kind: 'size', mode: m });
    } else {
      switchSize(m);
    }
  }

  function onSetting(key, value) {
    if (key === 'size') requestSize(value);
  }

  /* ---------------- Sự kiện: kéo / chạm ---------------- */

  // 8 hướng theo góc màn hình (trục y hướng xuống): 0 phải, 1 chéo xuống phải, 2 xuống, … 7 chéo lên phải
  const COMPASS = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];

  /** Tọa độ con trỏ theo đơn vị ô (số thực) trong lưới. */
  function gridPoint(e) {
    const r = letters.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * game.n, y: ((e.clientY - r.top) / r.height) * game.n };
  }

  /** Ô dưới con trỏ (kẹp vào trong lưới). */
  function cellAt(p) {
    const n = game.n;
    const c = Math.min(n - 1, Math.max(0, Math.floor(p.x)));
    const r = Math.min(n - 1, Math.max(0, Math.floor(p.y)));
    return r * n + c;
  }

  /**
   * Ô cuối khi kéo từ ô start tới điểm p: bắt hướng về 1 trong 8 hướng gần nhất, độ dài theo hình chiếu
   * lên hướng đó, cắt bớt cho khỏi ra ngoài lưới. Ngón tay lệch vài độ vẫn ra đúng đoạn thẳng.
   */
  function snapEnd(start, p) {
    const n = game.n;
    const r0 = Math.floor(start / n);
    const c0 = start % n;
    const dx = p.x - (c0 + 0.5);
    const dy = p.y - (r0 + 0.5);
    if (Math.hypot(dx, dy) < 0.55) return start;
    const k = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
    const [vr, vc] = COMPASS[k];
    const step2 = vr && vc ? 2 : 1; // bình phương độ dài một bước
    let len = Math.round((dx * vc + dy * vr) / step2);
    while (len > 0) {
      const r = r0 + vr * len;
      const c = c0 + vc * len;
      if (r >= 0 && r < n && c >= 0 && c < n) break;
      len--;
    }
    return (r0 + vr * len) * n + c0 + vc * len;
  }

  board.addEventListener('pointerdown', (e) => {
    if (!game || won() || kit.modal.current() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (drag) return; // ngón thứ hai: bỏ qua
    e.preventDefault();
    board.classList.remove('kbd');
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
    const start = cellAt(gridPoint(e));
    drag = { id: e.pointerId, start, end: start, x: e.clientX, y: e.clientY, moved: false };
    cursor = start;
  });

  board.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    const end = snapEnd(drag.start, gridPoint(e));
    if (!drag.moved) {
      drag.moved = true;
      anchor = null; // bắt đầu kéo thì bỏ chữ đầu đã chạm trước đó
    }
    if (end !== drag.end) {
      drag.end = end;
      const line = E.lineBetween(game.n, drag.start, end);
      if (line) kit.sfx('tick', { volume: 0.3, pitch: 0.9 + 0.06 * line.length }); // cao dần theo độ dài đoạn
    }
    renderMarks();
  });

  function endDrag(e, cancelled) {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag;
    drag = null;
    if (cancelled) {
      renderMarks();
      return;
    }
    if (d.moved && d.end !== d.start) submit(d.start, d.end);
    else pick(d.start); // chạm (hoặc kéo rồi quay về đúng ô cũ): chọn chữ đầu / chữ cuối
  }
  board.addEventListener('pointerup', (e) => endDrag(e, false));
  board.addEventListener('pointercancel', (e) => endDrag(e, true));
  board.addEventListener('contextmenu', (e) => e.preventDefault());

  $('btn-hint').addEventListener('click', hint);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm').addEventListener('click', confirmLeave);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newBoard(game.mode);
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-streak').textContent = kit.i18n.fmtNumber(stats.streak);
    MODES.forEach((m) => { $('stats-best' + m).textContent = stats.best[m] == null ? '–' : fmt(stats.best[m]); });
  });

  /* ---------------- Sự kiện: bàn phím ---------------- */

  const ARROWS = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey || e.ctrlKey || kit.modal.current() || !game) return;
    const k = e.key.toLowerCase();
    const target = e.target;
    const onBoard = target === board;
    const onOther = !onBoard && target.closest && target.closest('button, input, a[href]');
    if (ARROWS[k]) {
      if (target.closest && target.closest('.segmented')) return; // mũi tên trong thanh chọn cỡ do kit xử lý
      const n = game.n;
      const r = Math.min(n - 1, Math.max(0, Math.floor(cursor / n) + ARROWS[k][0]));
      const c = Math.min(n - 1, Math.max(0, (cursor % n) + ARROWS[k][1]));
      cursor = r * n + c;
      board.classList.add('kbd');
      if (!onBoard) board.focus({ preventScroll: true });
      const p = rc(cursor);
      say(t('cell.label', { r: p.r, c: p.c, v: upper(game.grid[cursor]) }));
      renderMarks();
    } else if (k === ' ' || k === 'enter') {
      if (onOther) return; // để trình duyệt bấm nút đang focus
      board.classList.add('kbd');
      if (!onBoard) board.focus({ preventScroll: true });
      pick(cursor);
    } else if (k === 'escape') {
      if (anchor == null) return;
      cancelSelection();
    } else if (k === 'h') hint();
    else if (k === 'n') requestNew();
    else return;
    e.preventDefault();
  });
  // Bấm chuột ở chỗ khác thì thôi hiện con trỏ bàn phím
  board.addEventListener('blur', () => {
    if (!drag) board.classList.remove('kbd');
    renderMarks();
  });

  /* ---------------- Đồng hồ theo hộp thoại / tab ---------------- */

  const observer = new MutationObserver(syncClock);
  document.querySelectorAll('.modal').forEach((m) => observer.observe(m, { attributes: true, attributeFilter: ['hidden'] }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncClock(); });
  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại đề dở nếu có ---------------- */

  /** Cài đặt cỡ đi theo đề đang có (ghi thẳng, không qua onSetting). */
  function syncSizeSetting() {
    if (kit.settings.get().size === game.mode) return;
    kit.settings.get().size = game.mode;
    kit.store.write(keys.settings, kit.settings.get());
    kit.renderSettings();
  }

  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && E.fromJSON(saved.game);
  if (restored && (restored.tries > 0 || restored.hinted.length > 0) && !E.isWon(restored)) {
    game = restored;
    syncSizeSetting();
    clock.reset();
    clock.set(typeof saved.elapsed === 'number' && saved.elapsed > 0 ? saved.elapsed : 0);
    kit.sdk.start(game.mode, true);
    render();
    syncClock();
    writeSummary();
    kit.toast(t('toast.saved'));
  } else {
    const m = kit.settings.get().size;
    newBoard(isMode(m) ? m : 's');
    syncSizeSetting();
  }

  // Lần đầu mở game: hiện cách chơi (đồng hồ dừng trong lúc đọc)
  if (!kit.settings.get().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
})();
