/* =====================================================================
 * {{nameVi}} - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   Game mẫu của _template: chạm nút 10 lần, xếp hạng theo thời gian (metric time_low, mode classic).
 *   Luật báo ván cho cổng (giữ khi viết game thật):
 *   - Chia ván mới: kit.sdk.start(MODE); mở lại ván lưu dở: kit.sdk.start(MODE, true)
 *   - Thắng: kit.sdk.end({ mode, won: true, timeMs | score, assisted })
 *   - Bỏ ván đã đi ít nhất một nước: kit.sdk.end({ mode, won: false, ... }); ván chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const TARGET = 10;
  const kit = PNKit.init({ gameId: '{{id}}', version: '1.0.0', dict: window.GAME_DICT });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();

  let game = null;
  const stats = Object.assign({ played: 0, won: 0, best: null }, kit.store.read(keys.stats, {}) || {});

  /** m:ss.d */
  function fmt(ms) {
    const ds = Math.floor(ms / 100);
    const m = Math.floor(ds / 600);
    const s = Math.floor((ds % 600) / 10);
    return m + ':' + String(s).padStart(2, '0') + (kit.i18n.lang === 'vi' ? ',' : '.') + (ds % 10);
  }

  /* ---------------- Vẽ ---------------- */
  let raf = 0;
  function render() {
    $('time').textContent = fmt(clock.elapsed());
    $('taps').textContent = game.taps + '/' + game.target;
    $('best').textContent = stats.best == null ? '–' : fmt(stats.best);
    $('btn-tap').disabled = E.isDone(game);
    $('btn-tap').setAttribute('aria-label', t('board.label', { n: game.target - game.taps }));
    cancelAnimationFrame(raf);
    if (clock.running) raf = requestAnimationFrame(render);
  }

  /* ---------------- Lưu ---------------- */
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    const inPlay = game && game.taps > 0 && !E.isDone(game);
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: stats.best == null ? t('summary.none') : t('summary.note', { time: fmt(stats.best) }),
      stats: stats.best == null ? [] : [{ value: fmt(stats.best), label: t('hud.best') }],
      resume: inPlay ? { title: t('app.name'), detail: game.taps + '/' + game.target, pct: game.taps / game.target } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (game && game.taps > 0 && !E.isDone(game)) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */
  function newGame() {
    game = E.newGame(TARGET);
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    render();
    writeSummary();
  }

  function tap() {
    if (!game || E.isDone(game) || kit.modal.current()) return;
    clock.resume();
    game = E.tap(game);
    kit.sfx('tap');
    const btn = $('btn-tap');
    btn.classList.remove('pop');
    void btn.offsetWidth; // chạy lại hiệu ứng
    btn.classList.add('pop');
    if (E.isDone(game)) finish();
    render();
  }

  function finish() {
    clock.pause();
    const ms = Math.round(clock.elapsed());
    const best = stats.best == null || ms < stats.best;
    stats.played++;
    stats.won++;
    if (best) stats.best = ms;
    saveStats();
    persist();
    kit.sdk.end({ mode: MODE, won: true, timeMs: ms, assisted: false });
    kit.sfx('win');
    kit.confetti();
    $('win-time').textContent = fmt(ms);
    $('win-best').hidden = !best;
    kit.modal.open('modal-win');
  }

  /** Ván đang dở (đã chạm) thì hỏi trước, vì bỏ ván tính là thua. */
  function requestNew() {
    if (game && game.taps > 0 && !E.isDone(game)) kit.modal.open('modal-confirm');
    else newGame();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    stats.played++;
    saveStats();
    kit.sdk.end({ mode: MODE, won: false, timeMs: Math.round(clock.elapsed()), assisted: false });
    newGame();
  }

  /* ---------------- Sự kiện ---------------- */
  $('btn-tap').addEventListener('click', tap);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-win');
    newGame();
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
  });
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key.toLowerCase();
    // Space / Enter trên chính nút chạm đã thành cú bấm của trình duyệt: không chạm thêm lần nữa
    if ((k === ' ' || k === 'enter') && e.target !== $('btn-tap')) tap();
    else if (k === 'n') requestNew();
    else return;
    e.preventDefault();
  });
  kit.onLeave(persist);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && E.fromJSON(saved.game);
  if (restored && restored.taps > 0 && !E.isDone(restored)) {
    game = restored;
    clock.set(saved.elapsed);
    kit.sdk.start(MODE, true);
    kit.toast(t('toast.saved'));
    render();
  } else {
    newGame();
  }
})();
