/* =====================================================================
 * Tính 24 - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Một ván = một bộ 5 đề; mode = mức ('easy' | 'hard'), metric time_low (tổng thời gian cả bộ)
 *   - Chạm số → phép tính → số khác: hai số gộp thành kết quả ở ô chạm sau (kết quả được chọn sẵn để ghép tiếp)
 *   - Đồng hồ chạy từ lúc chia bộ, dừng khi mở hộp thoại / ẩn tab (bàn bị làm mờ lúc dừng), lưu cùng ván dở;
 *     bỏ qua đề cộng E.SKIP_MS vào đồng hồ
 *   - Báo ván cho cổng:
 *     - bộ mới: kit.sdk.start(mode); mở lại bộ lưu dở: kit.sdk.start(mode, true)
 *     - xong 5 đề: kit.sdk.end({ mode, won: true, timeMs, assisted }) (assisted = đã dùng gợi ý)
 *     - bỏ bộ (ván mới / đổi mức) khi đã đi ít nhất một nước (phép tính hoặc bỏ qua): won: false; chưa đi thì không gửi
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODES = E.MODES;
  const kit = PNKit.init({ gameId: 'tinh24', version: '1.0.1', dict: window.GAME_DICT, defaults: { level: 'easy' }, onSetting });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);

  const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  const SUITS = ['♠', '♥', '♦', '♣']; // chất trang trí cho 4 lá số gốc (theo ô)
  const isMode = (m) => MODES.indexOf(m) >= 0;
  const levelName = (m) => t('level.' + m);

  const defaults = { played: 0, won: 0, solved: 0, streak: 0, best: { easy: null, hard: null } };
  const stats = Object.assign({}, defaults, kit.store.read(keys.stats, {}) || {});
  stats.best = Object.assign({}, defaults.best, stats.best || {});
  MODES.forEach((m) => { if (!(typeof stats.best[m] === 'number' && stats.best[m] > 0)) stats.best[m] = null; });
  ['played', 'won', 'solved', 'streak'].forEach((k) => { if (!Number.isInteger(stats[k]) || stats[k] < 0) stats[k] = 0; });

  let game = null;
  let sel = null; // ô đang chọn (số thứ nhất)
  let autoSel = false; // sel là kết quả vừa gộp (chọn sẵn): chạm lại lần đầu chỉ giữ chọn, không bỏ chọn
  let op = null; // phép tính đang chọn
  let hl = null; // bước gợi ý đang tô sáng { a, op, b }
  let flash = null; // đề vừa giải: { slots, at } hiện "24" một lúc trước khi sang đề kế
  let flashTimer = 0;
  let winTimer = 0;

  const tiles = Array.from(document.querySelectorAll('.tile'));
  const opButtons = Array.from(document.querySelectorAll('.op'));

  const mode = () => game.mode;
  const won = () => !!game && E.isWon(game);
  /** Bộ đang dở: đã đi ít nhất một nước và chưa xong (bỏ lúc này là thua). */
  const inPlay = () => !!game && game.moves > 0 && !E.isWon(game);
  const busy = () => !!flash;

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

  /** Số dạng chữ cho trạng thái / gợi ý: "8", "−3", "8/3" */
  const valText = (v) => E.fracText(v).replace('-', '−');

  /* ---------------- Vẽ ---------------- */

  /** Nội dung một số: số nguyên hoặc phân số xếp chồng (chỉ chứa số do engine tính, an toàn cho innerHTML). */
  function numHTML(v) {
    const sign = v[0] < 0 ? '−' : '';
    const n = Math.abs(v[0]);
    if (v[1] === 1) {
      const s = sign + n;
      return '<span class="num" data-len="' + s.length + '">' + s + '</span>';
    }
    const len = Math.max(String(n).length + sign.length, String(v[1]).length);
    return '<span class="num frac" data-len="' + len + '"><span class="fr-n">' + sign + n + '</span><span class="fr-d">' + v[1] + '</span></span>';
  }

  function tileLabel(v) {
    if (!v) return t('tile.empty');
    const sign = v[0] < 0 ? '−' : '';
    if (v[1] === 1) return t('tile.label', { v: sign + Math.abs(v[0]) });
    return t('tile.label', { v: t('tile.frac', { n: sign + Math.abs(v[0]), d: v[1] }) });
  }

  /** Dựng lại nội dung ô chỉ khi đổi (tránh nháy và giữ hiệu ứng CSS). */
  function setTile(b, i, v, orig) {
    const key = v ? (orig ? 'o' : 'r') + E.fracText(v) : '';
    if (b.dataset.key === key) return;
    b.dataset.key = key;
    if (!v) b.innerHTML = '';
    else if (orig) {
      const s = SUITS[i];
      const idx = '<span class="idx"><b>' + v[0] + '</b><i>' + s + '</i></span>';
      b.innerHTML = idx + numHTML(v) + idx.replace('class="idx"', 'class="idx idx-b"');
    } else b.innerHTML = numHTML(v);
  }

  function render() {
    const slots = flash ? flash.slots : E.slotsOf(game);
    const live = slots.values.filter(Boolean).length;
    const stuck = !flash && E.isStuck(game);
    if (sel != null && !slots.values[sel]) sel = null;
    tiles.forEach((b, i) => {
      const v = slots.values[i];
      setTile(b, i, v, slots.orig[i]);
      b.classList.toggle('empty', !v);
      b.classList.toggle('orig', !!v && slots.orig[i]);
      b.classList.toggle('res', !!v && !slots.orig[i]);
      b.classList.toggle('red', !!v && slots.orig[i] && (i === 1 || i === 2));
      b.classList.toggle('sel', sel === i);
      b.classList.toggle('hint', !!hl && (hl.a === i || hl.b === i));
      b.classList.toggle('win', !!flash && flash.at === i);
      b.classList.toggle('bad', stuck && !!v);
      b.disabled = !v || busy() || won();
      b.setAttribute('aria-pressed', String(sel === i));
      b.setAttribute('aria-label', tileLabel(v));
    });
    const opsOn = sel != null && live > 1 && !busy() && !won();
    opButtons.forEach((b) => {
      b.disabled = !opsOn;
      b.setAttribute('aria-pressed', String(opsOn && op === b.dataset.op));
      b.classList.toggle('hint', !!hl && hl.op === b.dataset.op);
    });

    // Dòng trạng thái: hướng dẫn bước kế tiếp
    const st = $('status');
    let msg;
    if (flash) msg = t('status.solved');
    else if (won()) msg = '';
    else if (stuck) msg = t('status.stuck', { v: valText(slots.values.find(Boolean)) });
    else if (sel == null) msg = t('status.goal');
    else if (!op) msg = t('status.op');
    else msg = t('status.second', { v: valText(slots.values[sel]), op: SYM[op] });
    st.textContent = msg;
    st.classList.toggle('bad', stuck);
    st.classList.toggle('good', !!flash);

    $('btn-undo').disabled = busy() || !E.canUndo(game);
    $('btn-reset').disabled = busy() || !E.canUndo(game);
    $('btn-hint').disabled = busy() || won();
    $('btn-skip').disabled = busy() || won();

    const k = Math.min(game.done + 1, E.SET_SIZE);
    $('puzzle').textContent = k + '/' + E.SET_SIZE;
    Array.from($('pips').children).forEach((p, i) => {
      p.className = i < game.done ? 'done' : i === game.done && !won() ? 'cur' : '';
    });
    const best = stats.best[mode()];
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
  function replay(el, cls) {
    if (calm()) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /**
   * Đồng hồ chỉ chạy khi bộ chưa xong, không mở hộp thoại và tab đang hiện.
   * Đang mở hộp thoại thì làm mờ bàn để không nhìn đề "miễn phí" lúc đồng hồ dừng.
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
    const m = game ? mode() : kit.settings.get().level;
    const best = stats.best[m];
    const out = [];
    if (stats.won > 0) out.push({ value: kit.i18n.fmtNumber(stats.won), label: t('stats.won') });
    if (best != null) out.push({ value: fmt(best), label: t('hud.best') + ' · ' + levelName(m) });
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: best == null ? t('summary.none') : t('summary.note', { level: levelName(m), time: fmt(best) }),
      stats: out,
      resume: inPlay()
        ? {
          title: t('app.name') + ' · ' + levelName(m),
          detail: t('summary.resume', { level: levelName(m), k: Math.min(game.done + 1, E.SET_SIZE), time: fmtClock(clock.elapsed()) }),
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

  function clearPick() {
    sel = null;
    autoSel = false;
    op = null;
    hl = null;
  }

  function stopFlash() {
    clearTimeout(flashTimer);
    clearTimeout(winTimer);
    flash = null;
  }

  function newSet(m) {
    stopFlash();
    game = E.newGame({ mode: m, seed: Math.floor(Math.random() * 4294967296) });
    clearPick();
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(m);
    render();
    replay($('board'), 'deal');
    syncClock();
    writeSummary();
  }

  /** Chạm một ô số. */
  function tapTile(i) {
    if (!game || won() || busy() || kit.modal.current()) return;
    const slots = E.slotsOf(game);
    if (!slots.values[i]) return;
    if (sel != null && op && sel !== i) {
      doCombine(sel, op, i);
      return;
    }
    hl = null;
    if (sel === i && autoSel) {
      autoSel = false;
    } else if (sel === i) {
      sel = null;
      op = null;
    } else {
      sel = i;
      op = null;
    }
    kit.sfx('tap');
    render();
  }

  /** Chọn phép tính (chạm lại phép đang chọn để bỏ). */
  function pickOp(o) {
    if (!game || won() || busy() || kit.modal.current()) return;
    if (sel == null) {
      kit.toast(t('toast.pickFirst'));
      replay($('board'), 'nudge');
      return;
    }
    if (E.slotsOf(game).values.filter(Boolean).length < 2) return;
    op = op === o ? null : o;
    kit.sfx('tap');
    render();
  }

  function doCombine(a, o, b) {
    const prev = game;
    const prevSlots = E.slotsOf(prev);
    const next = E.combine(prev, a, o, b);
    if (next === prev) {
      // Chỉ xảy ra khi chia cho 0
      kit.sfx('error');
      kit.toast(t('toast.div0'));
      op = null;
      render();
      replay(tiles[b], 'shake');
      return;
    }
    game = next;
    hl = null;
    op = null;
    if (next.done > prev.done) {
      solved(E.stepSlots(prevSlots, a, o, b), b);
      return;
    }
    sel = b;
    autoSel = true;
    render();
    if (E.isStuck(game)) {
      kit.sfx('error');
      replay(tiles[b], 'shake');
    } else {
      kit.sfx('merge');
      replay(tiles[b], 'pop');
    }
    persist();
  }

  /** Vừa ra 24: hiện ô 24 một lúc rồi chia đề kế (hoặc kết thúc bộ). */
  function solved(slots, at) {
    stats.solved++;
    saveStats();
    clearPick();
    flash = { slots, at };
    render();
    replay(tiles[at], 'pop');
    if (won()) {
      finish();
      return;
    }
    kit.sfx('combo');
    kit.toast(t('toast.solved', { k: game.done }), 1200);
    persist();
    flashTimer = setTimeout(() => {
      flash = null;
      render();
      replay($('board'), 'deal');
    }, calm() ? 350 : 750);
  }

  function undo() {
    if (!game || busy() || kit.modal.current() || !E.canUndo(game)) return;
    game = E.undo(game);
    clearPick();
    kit.sfx('move');
    render();
    persist();
  }

  function reset() {
    if (!game || busy() || kit.modal.current() || !E.canUndo(game)) return;
    game = E.reset(game);
    clearPick();
    kit.sfx('flip');
    render();
    replay($('board'), 'deal');
    persist();
  }

  /** Bỏ qua: đề khác cùng mức, cộng thời gian phạt, cho xem một cách giải của đề vừa bỏ. */
  function skip() {
    if (!game || won() || busy() || kit.modal.current()) return;
    const before = E.current(game);
    game = E.skip(game);
    clock.set(clock.elapsed() + E.SKIP_MS);
    clearPick();
    kit.sfx('drop');
    kit.toast(t('toast.skip', { expr: E.solutionText(before) }), 3600);
    render();
    replay($('board'), 'deal');
    replay($('time'), 'penalty');
    persist();
  }

  /** Gợi ý: tô sáng hai ô và phép tính của bước kế; đang ở đường cụt thì làm lại đề trước. */
  function hint() {
    if (!game || won() || busy() || kit.modal.current()) return;
    const h = E.hint(game);
    if (!h) return;
    const first = game.hints === 0;
    game = h.reset ? E.reset(h.game) : h.game;
    sel = null;
    op = null;
    hl = h.step;
    const v = E.slotsOf(game).values;
    const step = valText(v[hl.a]) + ' ' + SYM[hl.op] + ' ' + valText(v[hl.b]);
    kit.toast(t(h.reset ? 'toast.hintReset' : 'toast.hint', { step }) + (first ? t('toast.hintFirst') : ''), first ? 3200 : 2400);
    kit.sfx('pop');
    render();
    persist();
  }

  function finish() {
    clock.pause();
    const ms = Math.round(clock.elapsed());
    const m = mode();
    const assisted = game.hints > 0;
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
    render(); // kỷ lục mới lên HUD
    $('app').classList.remove('paused');

    $('win-time').textContent = t('win.time', { time: fmt(ms) });
    const badge = $('win-badge');
    badge.hidden = !isBest;
    badge.textContent = t('win.best', { level: levelName(m) });
    const notes = [];
    if (assisted) notes.push(t('win.assisted', { n: game.hints }));
    if (game.skips > 0) notes.push(t('win.skips', { n: game.skips }));
    if (!assisted && !isBest && stats.best[m] != null) notes.push(t('win.noteBest', { level: levelName(m), time: fmt(stats.best[m]) }));
    $('win-note').textContent = notes.join(' ');
    $('win-note').hidden = !notes.length;
    // Cho người chơi kịp thấy ô 24 rồi mới mở hộp thắng (bàn giữ ô 24 tới khi chia bộ mới)
    winTimer = setTimeout(() => {
      if (won()) kit.modal.open('modal-win');
    }, calm() ? 200 : 900);
  }

  /** Bỏ bộ đang dở: tính thua, báo cổng. */
  function abandon() {
    stats.played++;
    stats.streak = 0;
    saveStats();
    kit.sdk.end({ mode: mode(), won: false, timeMs: Math.round(clock.elapsed()), assisted: game.hints > 0 });
  }

  let pending = null; // việc chờ xác nhận bỏ bộ: { kind: 'new' } | { kind: 'level', mode }
  function askConfirm(p) {
    pending = p;
    $('btn-confirm').textContent = p.kind === 'level' ? t('confirm.level', { level: levelName(p.mode) }) : t('kit.newGame');
    kit.modal.open('modal-confirm');
  }

  function confirmLeave() {
    const p = pending;
    pending = null;
    kit.modal.close('modal-confirm');
    if (!p || !inPlay()) return;
    abandon();
    if (p.kind === 'level') switchLevel(p.mode);
    else newSet(mode());
  }

  function requestNew() {
    if (inPlay()) askConfirm({ kind: 'new' });
    else {
      kit.modal.close('modal-win');
      newSet(mode());
    }
  }

  /** Đổi mức: chia bộ mới mức đó trước, rồi lưu cài đặt (onSetting gặp mức đã khớp nên không làm gì). */
  function switchLevel(m) {
    newSet(m);
    kit.settings.set({ level: m });
  }

  /** Yêu cầu đổi mức (thanh chọn mức). Bộ đang dở thì giữ lựa chọn cũ và hỏi trước. */
  function requestLevel(m) {
    if (!isMode(m) || !game || m === mode()) return;
    if (inPlay()) {
      kit.settings.set({ level: mode() });
      askConfirm({ kind: 'level', mode: m });
    } else {
      switchLevel(m);
    }
  }

  function onSetting(key, value) {
    if (key === 'level') requestLevel(value);
  }

  /* ---------------- Sự kiện: chuột / chạm ---------------- */

  tiles.forEach((b, i) => b.addEventListener('click', () => tapTile(i)));
  opButtons.forEach((b) => b.addEventListener('click', () => pickOp(b.dataset.op)));
  $('btn-undo').addEventListener('click', undo);
  $('btn-reset').addEventListener('click', reset);
  $('btn-hint').addEventListener('click', hint);
  $('btn-skip').addEventListener('click', skip);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm').addEventListener('click', confirmLeave);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newSet(mode());
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-solved').textContent = kit.i18n.fmtNumber(stats.solved);
    $('stats-streak').textContent = kit.i18n.fmtNumber(stats.streak);
    MODES.forEach((m) => { $('stats-best-' + m).textContent = stats.best[m] == null ? '–' : fmt(stats.best[m]); });
  });

  /* ---------------- Sự kiện: bàn phím ---------------- */

  const OP_KEYS = { '+': '+', '-': '-', '*': '*', x: '*', '/': '/', ':': '/', '÷': '/', '×': '*' };
  // Mũi tên di chuyển giữa 4 ô (lưới 2×2)
  const ARROWS = { arrowup: -2, arrowdown: 2, arrowleft: -1, arrowright: 1 };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey) {
      if (k === 'z') undo();
      else return;
      e.preventDefault();
      return;
    }
    if (k >= '1' && k <= '4' && k.length === 1) tapTile(Number(k) - 1);
    else if (OP_KEYS[k]) pickOp(OP_KEYS[k]);
    else if (ARROWS[k] != null) {
      if (e.target.closest && e.target.closest('.segmented')) return; // mũi tên trong thanh chọn mức do kit xử lý
      const from = tiles.indexOf(document.activeElement);
      let j = from < 0 ? 0 : from + ARROWS[k];
      if (from >= 0 && (j < 0 || j > 3 || (Math.abs(ARROWS[k]) === 1 && Math.floor(j / 2) !== Math.floor(from / 2)))) j = from;
      if (!tiles[j].disabled) tiles[j].focus();
    } else if (k === 'z' || k === 'u' || k === 'backspace') undo();
    else if (k === 'r') reset();
    else if (k === 'h') hint();
    else if (k === 's') skip();
    else if (k === 'n') requestNew();
    else if (k === 'escape') {
      clearPick();
      render();
    } else return;
    e.preventDefault();
  });

  /* ---------------- Đồng hồ theo hộp thoại / tab ---------------- */

  const observer = new MutationObserver(syncClock);
  document.querySelectorAll('.modal').forEach((m) => observer.observe(m, { attributes: true, attributeFilter: ['hidden'] }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncClock(); });
  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại bộ dở nếu có ---------------- */

  /** Cài đặt mức đi theo bộ đang có (ghi thẳng, không qua onSetting). */
  function syncLevelSetting() {
    if (kit.settings.get().level === mode()) return;
    kit.settings.get().level = mode();
    kit.store.write(keys.settings, kit.settings.get());
    kit.renderSettings();
  }

  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && E.fromJSON(saved.game);
  if (restored && restored.moves > 0 && !E.isWon(restored)) {
    game = restored;
    syncLevelSetting();
    clock.reset();
    clock.set(typeof saved.elapsed === 'number' && saved.elapsed > 0 ? saved.elapsed : 0);
    kit.sdk.start(mode(), true);
    render();
    syncClock();
    writeSummary();
    kit.toast(t('toast.saved'));
  } else {
    const m = kit.settings.get().level;
    newSet(isMode(m) ? m : 'easy');
    syncLevelSetting();
  }

  // Lần đầu mở game: hiện cách chơi (đồng hồ dừng trong lúc đọc)
  if (!kit.settings.get().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
})();
