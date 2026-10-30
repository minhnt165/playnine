/* =====================================================================
 * Tính Nhẩm - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vẽ bằng DOM: thẻ câu hỏi (phép tính + ô đáp án) và bàn phím số 3 × 4 kiểu điện thoại.
 *   - Vòng lặp requestAnimationFrame, dt giới hạn 100 ms (tab vừa quay lại), tiến đồng hồ engine theo bước cố định 10 ms.
 *   - Trạng thái: 'idle' (màn chờ) | 'playing' | 'paused' | 'over'. Tự tạm dừng khi trang ẩn hoặc mở hộp thoại;
 *     khi tạm dừng phép tính bị che để không nghĩ trước được.
 *   Báo ván cho cổng (metric score_high, mode classic):
 *   - Ván mới: kit.sdk.start(MODE) khi bấm Bắt đầu; mở lại ván lưu dở: kit.sdk.start(MODE, true)
 *   - Hết 60 giây: kit.sdk.end({ mode, won: false, score, assisted: false })
 *   - Bỏ ván khi đã trả lời ít nhất một câu hoặc đã chơi ≥ 1 giây: kit.sdk.end({ mode, won: false, score }); chưa thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const STEP = 10; // bước mô phỏng cố định (ms)
  const MAX_DT = 100; // tab vừa quay lại: không nhảy cóc
  const OVER_DELAY = 650; // hết giờ: chờ một chút rồi mới hiện bảng kết quả

  const kit = PNKit.init({
    gameId: 'tinhnham',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { vibrate: true, guideSeen: false },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const settings = () => kit.settings.get();
  const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const fmtN = (n) => kit.i18n.fmtNumber(n);

  // Ký hiệu hiển thị và lớp màu của từng phép (engine dùng '-' thường cho phép trừ)
  const OP_TEXT = { '+': '+', '-': '−', '×': '×', '÷': '÷' };
  const OP_CLASS = { '+': 'op-add', '-': 'op-sub', '×': 'op-mul', '÷': 'op-div' };

  const statsDefault = { played: 0, best: null, bestStreak: 0, solved: 0, answered: 0 };
  const stats = Object.assign({}, statsDefault, kit.store.read(keys.stats, {}) || {});

  let game = null;
  let mode = 'idle';
  let overShown = false;

  /* ---------------- Dựng phần tĩnh ---------------- */
  const card = $('card');
  const play = $('play');
  const fx = $('fx');
  const pips = [];
  for (let i = 0; i <= E.MAX_LEVEL; i++) {
    const p = document.createElement('i');
    $('pips').appendChild(p);
    pips.push(p);
  }
  const keyEls = {};
  document.querySelectorAll('#keypad .key').forEach((b) => { keyEls[b.dataset.key] = b; });

  /* ---------------- Hiệu ứng ---------------- */
  function buzz(pattern) {
    if (!settings().vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* bỏ qua */ }
  }

  /** Chạy lại một lớp hiệu ứng CSS trên phần tử. */
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // chạy lại hiệu ứng
    el.classList.add(cls);
  }

  function popText(text, cls) {
    fx.textContent = ''; // trả lời liên tiếp rất nhanh: chỉ giữ số điểm mới nhất
    const el = document.createElement('div');
    el.className = 'pop-text ' + (cls || '');
    el.textContent = text;
    fx.appendChild(el);
    setTimeout(() => el.remove(), reduceMotion.matches ? 400 : 800);
  }

  let bannerTimer = 0;
  function banner(text, cls) {
    const el = $('banner');
    el.textContent = text;
    el.className = 'banner show' + (cls ? ' ' + cls : '');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { el.className = 'banner'; }, 900);
  }

  function clearFx() {
    fx.textContent = '';
    $('banner').className = 'banner';
    $('feedback').textContent = '';
    $('feedback').className = 'feedback';
    card.classList.remove('ok', 'bad');
  }

  /** Bấm phím vật lý thì phím ảo tương ứng nhún theo. */
  function flashKey(key) {
    const el = keyEls[key];
    if (!el) return;
    el.classList.add('down');
    setTimeout(() => el.classList.remove('down'), 110);
  }

  const say = (msg) => { $('sr').textContent = msg; };
  const sayQ = (q) => t('say.q', { a: q.a, op: t('op.' + q.op), b: q.b });
  const qText = (q, ans) => q.a + ' ' + OP_TEXT[q.op] + ' ' + q.b + ' = ' + ans;

  /* ---------------- Vẽ ---------------- */
  /** m:ss, làm tròn lên (60 giây đầu hiện 1:00) */
  function fmtTime(ms) {
    const s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  const view = { q: null, input: null, level: -1, hidden: null };
  function renderCard() {
    const q = game ? game.q : null;
    const hidden = mode === 'paused' || mode === 'idle';
    if (hidden !== view.hidden) {
      play.classList.toggle('veiled', hidden);
      view.hidden = hidden;
    }
    if (q !== view.q) {
      $('q-a').textContent = q ? String(q.a) : '?';
      $('q-b').textContent = q ? String(q.b) : '?';
      const op = q ? q.op : '+';
      $('q-op').textContent = OP_TEXT[op];
      $('q-op').className = 'op ' + OP_CLASS[op];
      // Chữ nhỏ lại khi phép tính dài (hai số ba chữ số)
      const len = q ? String(q.a).length + String(q.b).length : 2;
      $('expr').style.setProperty('--len', String(Math.max(2, len)));
      view.q = q;
      view.input = null;
    }
    const input = game ? game.input : '';
    if (input !== view.input) {
      const n = q ? String(E.answerOf(q)).length : 2;
      let html = '';
      for (let i = 0; i < n; i++) {
        const d = input[i];
        html += '<span class="slot' + (d ? ' filled' : i === input.length ? ' caret' : '') + '">' + (d || '') + '</span>';
      }
      $('answer').innerHTML = html;
      $('answer').style.setProperty('--n', String(n));
      view.input = input;
    }
    const level = q ? q.level : 0;
    if (level !== view.level) {
      $('level').textContent = String(level + 1);
      pips.forEach((p, i) => p.classList.toggle('on', i <= level));
      const box = $('level-box');
      box.classList.remove('lv-' + view.level);
      box.classList.add('lv-' + level);
      view.level = level;
    }
  }

  const hud = { score: -1, time: '', mult: -1, streak: -1, best: '', hurry: null, pause: '' };
  function renderHud() {
    const score = game ? game.score : 0;
    const left = game ? E.timeLeft(game) : E.ROUND_MS;
    if (score !== hud.score) {
      $('score').textContent = fmtN(score);
      hud.score = score;
    }
    const time = fmtTime(left);
    if (time !== hud.time) {
      $('time').textContent = time;
      hud.time = time;
    }
    $('time-fill').style.transform = 'scaleX(' + (left / E.ROUND_MS).toFixed(4) + ')';
    const hurry = mode === 'playing' && left <= 5000;
    if (hurry !== hud.hurry) {
      $('time-box').classList.toggle('hurry', hurry);
      hud.hurry = hurry;
    }
    const streak = game ? game.streak : 0;
    const mult = E.multiplier(streak);
    if (mult !== hud.mult || streak !== hud.streak) {
      $('mult').textContent = '×' + mult;
      $('streak').textContent = String(streak);
      $('combo-box').className = 'hud-box hud-combo tier-' + mult;
      hud.mult = mult;
      hud.streak = streak;
    }
    const best = stats.best == null ? '–' : fmtN(stats.best);
    if (best !== hud.best) {
      $('best').textContent = best;
      hud.best = best;
    }
    const open = mode === 'playing' || mode === 'paused';
    const ps = (open ? 'o' : 'c') + mode;
    if (ps !== hud.pause) {
      const btn = $('btn-pause');
      btn.disabled = !open;
      btn.dataset.state = mode === 'paused' ? 'paused' : 'running';
      const label = mode === 'paused' ? t('btn.resume') : t('btn.pause');
      btn.setAttribute('aria-label', label);
      btn.title = t('btn.keySuffix', { label });
      hud.pause = ps;
    }
  }

  function render() {
    renderCard();
    renderHud();
  }

  function showOverlay(name) {
    ['start', 'pause', 'over'].forEach((n) => { $('overlay-' + n).hidden = n !== name; });
    overShown = name === 'over';
  }

  /* ---------------- Lưu ---------------- */
  const hasProgress = () => !!game && !E.isOver(game) && (game.correct + game.wrong > 0 || game.t >= 1000);
  const inRound = () => (mode === 'playing' || mode === 'paused') && !!game && !E.isOver(game);

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    const resume = inRound() && game.t > 0;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: 0,
      note: stats.best == null ? t('summary.none') : t('summary.note', { score: fmtN(stats.best) }),
      stats: stats.best == null ? [] : [{ value: fmtN(stats.best), label: t('hud.best') }],
      resume: resume
        ? { title: t('app.name'), detail: t('summary.resume', { score: fmtN(game.score), time: fmtTime(E.timeLeft(game)) }), pct: game.t / E.ROUND_MS }
        : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inRound() && game.t > 0) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }
  /** Cộng ván vào thống kê (hết giờ hoặc bỏ giữa chừng). */
  function tally() {
    stats.played++;
    stats.solved += game.correct;
    stats.answered += game.correct + game.wrong;
    stats.bestStreak = Math.max(stats.bestStreak, game.bestStreak);
  }

  /* ---------------- Vòng lặp ---------------- */
  let raf = 0;
  let last = 0;
  let acc = 0;
  let lastSec = 0;

  function kick() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    if (mode === 'playing') {
      if (kit.modal.current() || document.hidden) {
        pause(false);
        return;
      }
      acc += Math.min(MAX_DT, Math.max(0, now - last));
      const ms = Math.floor(acc / STEP) * STEP;
      acc -= ms;
      if (ms > 0) {
        const r = E.advance(game, ms);
        game = r.game;
        onTick(r.events);
      }
    }
    last = now;
    renderHud();
    if (mode === 'playing') raf = requestAnimationFrame(frame);
  }

  function onTick(events) {
    if (events.some((ev) => ev.type === 'over')) {
      finish();
      return;
    }
    // Đếm ngược 5 giây cuối
    const sec = Math.ceil(E.timeLeft(game) / 1000);
    if (sec !== lastSec && sec <= 5 && sec > 0) {
      kit.sfx('tick', { pitch: sec === 1 ? 1.3 : 1 });
      if (sec === 5) banner(t('fx.hurry'), 'hurry');
    }
    lastSec = sec;
  }

  /* ---------------- Luồng ván ---------------- */
  function startRound() {
    kit.modal.close('modal-confirm');
    game = E.newGame(Math.floor(Math.random() * 0x100000000) >>> 0);
    mode = 'playing';
    acc = 0;
    lastSec = 60;
    clearFx();
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    showOverlay(null);
    banner(t('fx.go'), 'go');
    kit.sfx('start');
    render();
    say(sayQ(game.q));
    writeSummary();
    kick();
  }

  function pause(focus) {
    if (mode !== 'playing') return;
    mode = 'paused';
    acc = 0;
    showPaused();
    persist();
    say(t('say.paused'));
    if (focus && !kit.modal.current()) $('btn-resume').focus();
  }

  function showPaused() {
    $('pause-sub').textContent = t('pause.sub', { score: fmtN(game.score), time: fmtTime(E.timeLeft(game)) });
    showOverlay('pause');
    render();
  }

  function resume() {
    if (mode !== 'paused' || kit.modal.current()) return;
    mode = 'playing';
    showOverlay(null);
    kit.sfx('tap', { pitch: 1.15 });
    render();
    say(sayQ(game.q));
    kick();
  }

  function togglePause() {
    if (mode === 'playing') pause(true);
    else if (mode === 'paused') resume();
  }

  let overTimer = 0;
  function finish() {
    mode = 'over';
    const score = game.score;
    const record = score > 0 && (stats.best == null || score > stats.best);
    tally();
    if (stats.best == null || score > stats.best) stats.best = score;
    saveStats();
    persist(); // ván đã xong: xóa ván lưu, resume = null
    kit.sdk.end({ mode: MODE, won: false, score, assisted: false });
    kit.sfx(record ? 'win' : 'clear');
    if (record) kit.confetti();
    $('over-score').textContent = fmtN(score);
    $('over-best').hidden = !record;
    $('over-correct').textContent = fmtN(game.correct);
    const tries = game.correct + game.wrong;
    $('over-acc').textContent = tries ? Math.round((game.correct / tries) * 100) + '%' : '–';
    $('over-streak').textContent = fmtN(game.bestStreak);
    $('over-level').textContent = String(game.maxLevel + 1);
    say(t('say.over', { score: fmtN(score) }));
    render();
    clearTimeout(overTimer);
    overTimer = setTimeout(() => {
      if (mode !== 'over') return;
      showOverlay('over');
      if (!kit.modal.current()) $('btn-again').focus();
    }, reduceMotion.matches ? 0 : OVER_DELAY);
  }

  /** Ván đang dở (đã trả lời hoặc chơi ≥ 1 giây) thì hỏi trước, vì bỏ ván vẫn báo về cổng. */
  function requestNew() {
    if (inRound() && hasProgress()) {
      pause(false);
      $('confirm-text').textContent = t('confirm.text', { score: fmtN(game.score) });
      kit.modal.open('modal-confirm');
      return;
    }
    startRound();
  }

  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inRound() && hasProgress()) {
      tally();
      saveStats();
      kit.sdk.end({ mode: MODE, won: false, score: game.score, assisted: false });
    }
    startRound();
  }

  /* ---------------- Nhập số ---------------- */
  function press(key) {
    if (mode !== 'playing' || !game) return;
    const prev = game;
    const r = E.press(game, key);
    game = r.game;
    const res = r.result;
    if (res.type === 'none') {
      if (key !== 'enter') kit.sfx('tap', { pitch: 0.6, volume: 0.25 });
      return;
    }
    if (res.type === 'digit' || res.type === 'back') {
      kit.sfx('tap', { pitch: res.type === 'back' ? 0.8 : 1 + res.input.length * 0.08, volume: 0.5 });
    } else if (res.type === 'correct') {
      const fb = $('feedback');
      fb.textContent = '✓ ' + qText(res.q, res.answer);
      fb.className = 'feedback good';
      replay(card, 'ok');
      card.classList.remove('bad');
      popText('+' + res.points, 'm' + res.mult);
      if (game.q.level > prev.q.level) {
        banner(t('fx.level', { n: game.q.level + 1 }), 'level');
        replay($('level-box'), 'up');
        kit.sfx('levelup');
      } else if (E.multiplier(game.streak) > E.multiplier(prev.streak)) {
        kit.sfx('combo');
      } else kit.sfx('coin', { pitch: 0.9 + 0.05 * res.level });
      if (E.multiplier(game.streak) > E.multiplier(prev.streak)) replay($('combo-box'), 'up');
      say(t('say.right', { n: res.points }) + ' ' + sayQ(game.q));
    } else if (res.type === 'wrong') {
      const fb = $('feedback');
      fb.textContent = '✗ ' + qText(res.q, res.answer);
      fb.className = 'feedback bad';
      replay(card, 'bad');
      card.classList.remove('ok');
      kit.sfx('error');
      buzz(60);
      if (prev.streak > 0) replay($('combo-box'), 'lost');
      say(t('say.wrong', { a: res.q.a, op: t('op.' + res.q.op), b: res.q.b, ans: res.answer }) + ' ' + sayQ(game.q));
    }
    render();
  }

  /* ---------------- Sự kiện ---------------- */
  const keypad = $('keypad');
  keypad.addEventListener('pointerdown', (e) => {
    const el = e.target.closest && e.target.closest('.key');
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); // không lấy focus, không chọn chữ, không phóng to khi chạm đúp
    flashKey(el.dataset.key);
    press(el.dataset.key);
  });
  // Kích hoạt không bằng con trỏ (trình đọc màn hình): click có detail = 0
  keypad.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('.key');
    if (el && e.detail === 0) press(el.dataset.key);
  });
  keypad.addEventListener('contextmenu', (e) => e.preventDefault());

  $('btn-start').addEventListener('click', startRound);
  $('overlay-start').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    startRound();
  });
  $('btn-resume').addEventListener('click', resume);
  $('btn-again').addEventListener('click', startRound);
  $('btn-pause').addEventListener('click', togglePause);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = fmtN(stats.played);
    $('stats-best').textContent = stats.best == null ? '–' : fmtN(stats.best);
    $('stats-streak').textContent = fmtN(stats.bestStreak);
    $('stats-solved').textContent = fmtN(stats.solved);
  });

  /** Phím vật lý → phím của engine: chữ số (cả bàn phím số khi tắt Num Lock), xóa, Enter. */
  function keyOf(e) {
    if (/^[0-9]$/.test(e.key)) return e.key;
    const m = /^Numpad([0-9])$/.exec(e.code);
    if (m) return m[1];
    if (e.key === 'Backspace' || e.key === 'Delete') return 'back';
    return null;
  }

  document.addEventListener('keydown', (e) => {
    // defaultPrevented: Esc vừa đóng hộp thoại (kit xử lý trước), không tính là phím tạm dừng
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = keyOf(e);
    if (k) {
      e.preventDefault();
      if (mode === 'playing') {
        flashKey(k);
        press(k);
      }
      return;
    }
    const key = e.key;
    if (key === 'Enter' && mode === 'playing') {
      e.preventDefault();
      flashKey('enter');
      press('enter');
      return;
    }
    if (key === ' ' || key === 'Enter') {
      // Space / Enter trên một nút đang focus là cú bấm của chính nút đó
      const tgt = e.target;
      if (tgt && tgt.closest && tgt.closest('button, input, a')) return;
      if (mode === 'idle') startRound();
      else if (mode === 'paused') resume();
      else if (mode === 'over' && overShown) startRound();
      else if (mode !== 'playing') return;
    } else if (key === 'p' || key === 'P' || key === 'Escape') {
      if (mode !== 'playing' && mode !== 'paused') return;
      togglePause();
    } else if (key === 'n' || key === 'N') requestNew();
    else return;
    e.preventDefault();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause(false);
  });
  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && !E.isOver(restored) && restored.t > 0) {
    game = restored;
    mode = 'paused';
    lastSec = Math.ceil(E.timeLeft(game) / 1000);
    kit.sdk.start(MODE, true);
    showPaused();
    kit.toast(t('toast.saved'));
  } else {
    kit.store.remove(keys.save);
    showOverlay('start');
    render();
  }
  writeSummary();

  // Lần đầu mở: hướng dẫn ngắn
  if (!settings().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
})();
