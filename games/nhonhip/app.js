/* =====================================================================
 * Nhớ Nhịp - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vẽ bằng DOM: mỗi ô là một nút có màu + hình riêng (cho người mù màu) + phím tắt; ô sáng là lớp .lit.
 *   - Vòng lặp requestAnimationFrame, dt giới hạn 100 ms (tab vừa quay lại), tiến engine theo bước cố định 10 ms.
 *   - Nốt nhạc của từng ô tự tổng hợp bằng Web Audio (đủ dài theo thời gian ô sáng, kit.sfx chỉ có tiếng ngắn);
 *     chỉ phát khi có âm thanh của PlayNine và người chơi không tắt tiếng (cùng công tắc với cổng).
 *   - Trạng thái: 'idle' (màn chờ chọn mức) | 'playing' | 'paused' | 'over'. Tự tạm dừng khi trang ẩn hoặc mở hộp thoại;
 *     chơi tiếp thì vòng hiện tại phát lại từ đầu.
 *   Báo ván cho cổng (metric score_high, mode classic | hard):
 *   - Ván mới: kit.sdk.start(mode) khi bấm Bắt đầu; mở lại ván lưu dở: kit.sdk.start(mode, true)
 *   - Bấm sai (hết ván): kit.sdk.end({ mode, won: false, score, assisted: false })
 *   - Bỏ ván khi đã có điểm hoặc đã chơi ≥ 1 giây: kit.sdk.end({ mode, won: false, score }); chưa thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const STEP = 10; // bước mô phỏng cố định (ms)
  const MAX_DT = 100; // tab vừa quay lại: không nhảy cóc
  const PRESS_MS = 220; // ô người chơi bấm sáng bao lâu
  const OVER_DELAY = 1400; // bấm sai: để người chơi thấy ô đúng rồi mới hiện bảng kết quả

  const kit = PNKit.init({
    gameId: 'nhonhip',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { mode: 'classic', vibrate: true, guideSeen: false },
    onSetting: (key) => {
      if (key === 'mode' && state === 'idle') buildBoard(chosenMode());
    },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const settings = () => kit.settings.get();
  const fmtN = (n) => kit.i18n.fmtNumber(n);
  const chosenMode = () => (E.MODES[settings().mode] ? settings().mode : 'classic');
  const modeName = (m) => t('mode.' + m);

  /* Phím theo vị trí (e.code) nên AZERTY / QWERTZ vẫn đúng chỗ; số 1–6 dùng được cho mọi mức */
  const LETTERS = { classic: ['KeyQ', 'KeyW', 'KeyA', 'KeyS'], hard: ['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD'] };
  function keyPad(code, m) {
    const d = /^(?:Digit|Numpad)([1-6])$/.exec(code);
    if (d) {
      const i = Number(d[1]) - 1;
      return i < E.MODES[m].pads ? i : -1;
    }
    return LETTERS[m].indexOf(code);
  }
  const keyLabel = (m, i) => LETTERS[m][i].slice(3);

  /* Nốt của các ô: hợp âm La trưởng cho 4 ô, ngũ cung Đô cho 6 ô (bấm lộn xộn vẫn nghe êm) */
  const NOTES = { classic: [329.63, 440, 554.37, 659.25], hard: [261.63, 293.66, 329.63, 392, 440, 523.25] };

  /* Hình trên từng ô (viewBox 0 0 100 100): tròn, tam giác, sao, vuông, chữ thập, tim */
  function starPath() {
    let d = '';
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 17 : 41;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      d += (k ? 'L' : 'M') + (50 + r * Math.cos(a)).toFixed(1) + ' ' + (54 + r * Math.sin(a)).toFixed(1);
    }
    return d + 'Z';
  }
  const SHAPES = [
    '<circle cx="50" cy="50" r="34"/>',
    '<path d="M50 13L89 82H11Z" stroke-linejoin="round" stroke-width="8"/>',
    '<path d="' + starPath() + '" stroke-linejoin="round" stroke-width="5"/>',
    '<rect x="17" y="17" width="66" height="66" rx="7"/>',
    '<path d="M38 12h24v26h26v24H62v26H38V62H12V38h26z"/>',
    '<path d="M50 88C21 67 9 52 9 34 9 20 19 10 32 10c8 0 14 4 18 11 4-7 10-11 18-11 13 0 23 10 23 24 0 18-12 33-41 54z"/>',
  ];
  const MARK = '<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><path d="M26 26l48 48M74 26L26 74"/></svg>';

  const statsDefault = { played: 0, rounds: 0, best: { classic: null, hard: null } };
  const stats = (() => {
    const raw = kit.store.read(keys.stats, {}) || {};
    const s = Object.assign({}, statsDefault, raw);
    s.best = Object.assign({ classic: null, hard: null }, raw.best && typeof raw.best === 'object' ? raw.best : {});
    return s;
  })();

  let game = null;
  let state = 'idle';
  let overShown = false;
  let boardMode = '';
  let justCleared = false; // vừa bấm đúng hết chuỗi, máy chưa phát vòng sau
  let pads = [];
  const userLit = [0, 0, 0, 0, 0, 0]; // ô người chơi vừa bấm sáng tới lúc (performance.now)

  /* ---------------- Âm thanh ---------------- */
  let actx = null;
  let master = null;
  function soundOn() {
    try {
      const s = window.PlayNine && window.PlayNine.sfx;
      return !!s && !s.isMuted();
    } catch (e) {
      return false;
    }
  }
  /** Tạo / đánh thức AudioContext; gọi trong thao tác của người chơi (trình duyệt chặn âm thanh tự phát). */
  function audio() {
    if (!soundOn()) return null;
    try {
      if (!actx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        actx = new Ctor();
        master = actx.createGain();
        master.gain.value = 0.22;
        master.connect(actx.destination);
      }
      if (actx.state === 'suspended') actx.resume().catch(() => {});
      return actx;
    } catch (e) {
      return null;
    }
  }
  /** Nốt của ô pad, dài ms: sóng tam giác + bồi âm sine, lên nhanh, giữ, tắt dần (không "tách"). */
  function tone(pad, ms) {
    const ac = audio();
    if (!ac || !game) return;
    try {
      const f = NOTES[game.mode][pad];
      const t0 = ac.currentTime + 0.005;
      const d = Math.max(0.12, ms / 1000);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.012);
      g.gain.setValueAtTime(0.9, t0 + d * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.09);
      g.connect(master);
      [['triangle', f, 1], ['sine', f * 2, 0.18]].forEach(([type, freq, vol]) => {
        const o = ac.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        if (vol === 1) o.connect(g);
        else {
          const v = ac.createGain();
          v.gain.value = vol;
          o.connect(v);
          v.connect(g);
        }
        o.start(t0);
        o.stop(t0 + d + 0.12);
      });
    } catch (e) { /* âm thanh không được làm hỏng game */ }
  }

  function buzz(pattern) {
    if (!settings().vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* bỏ qua */ }
  }

  const say = (msg) => { $('sr').textContent = msg; };

  /* ---------------- Dựng bàn ---------------- */
  const field = $('field');
  const board = $('board');

  function buildBoard(m) {
    boardMode = m;
    const n = E.MODES[m].pads;
    field.dataset.pads = String(n);
    board.textContent = '';
    pads = [];
    for (let i = 0; i < n; i++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pad p' + i;
      el.tabIndex = -1;
      el.dataset.pad = String(i);
      el.setAttribute('aria-label', t('pad.label', { n: i + 1, name: t('pad.' + i), key: (i + 1) + ' / ' + keyLabel(m, i) }));
      el.innerHTML =
        '<svg class="sym" viewBox="0 0 100 100" aria-hidden="true">' + SHAPES[i] + '</svg>' +
        '<span class="keycap" aria-hidden="true"><b>' + (i + 1) + '</b>' + keyLabel(m, i) + '</span>' + MARK;
      board.appendChild(el);
      pads.push({ el, lit: false });
    }
    userLit.fill(0);
    document.querySelectorAll('.help .help-keys').forEach((el) => { el.innerHTML = t(m === 'hard' ? 'help.keysHard' : 'help.keys'); });
  }

  /* ---------------- Vẽ ---------------- */
  const hud = { score: '', step: '', best: '', hub: '', status: '', phase: '', pause: '' };

  function setText(id, key, value) {
    if (hud[key] === value) return;
    hud[key] = value;
    $(id).textContent = value;
  }

  function statusOf() {
    if (state === 'idle' || !game) return ['idle', t('status.idle')];
    if (state === 'paused') return ['paused', t('status.paused')];
    if (state === 'over' || E.isOver(game)) return ['over', t('status.wrong')];
    if (game.phase === 'input') return ['input', t('status.input', { pos: fmtN(game.pos), n: fmtN(game.n) })];
    if (justCleared) return ['good', t('status.good')];
    return ['show', t('status.show')];
  }

  function render() {
    const now = performance.now();
    const lit = game && state === 'playing' ? E.litPad(game) : -1;
    pads.forEach((p, i) => {
      const on = i === lit || userLit[i] > now;
      if (on !== p.lit) {
        p.el.classList.toggle('lit', on);
        p.lit = on;
      }
    });
    board.classList.toggle('ready', !!game && state === 'playing' && game.phase === 'input');
    const m = game ? game.mode : chosenMode();
    setText('score', 'score', fmtN(game ? game.score : 0));
    setText('step', 'step', game && game.phase === 'input' && state === 'playing' ? fmtN(game.pos) + '/' + fmtN(game.n) : game && state !== 'idle' ? '0/' + fmtN(game.n) : '–');
    setText('best', 'best', stats.best[m] == null ? '–' : fmtN(stats.best[m]));
    setText('hub-num', 'hub', fmtN(game ? game.score : 0));
    const [phase, text] = statusOf();
    setText('status-text', 'status', text);
    if (phase !== hud.phase) {
      $('status').dataset.phase = phase;
      hud.phase = phase;
    }
    const open = state === 'playing' || state === 'paused';
    const ps = (open ? 'o' : 'c') + state;
    if (ps !== hud.pause) {
      const btn = $('btn-pause');
      btn.disabled = !open;
      btn.dataset.state = state === 'paused' ? 'paused' : 'running';
      const label = state === 'paused' ? t('btn.resume') : t('btn.pause');
      btn.setAttribute('aria-label', label);
      btn.title = t('btn.keySuffix', { label });
      hud.pause = ps;
    }
  }

  function showOverlay(name) {
    ['start', 'pause', 'over'].forEach((n) => { $('overlay-' + n).hidden = n !== name; });
    overShown = name === 'over';
  }

  function clearMarks() {
    pads.forEach((p) => p.el.classList.remove('wrong', 'expected'));
    board.classList.remove('cheer');
  }

  /* ---------------- Lưu ---------------- */
  const inRound = () => (state === 'playing' || state === 'paused') && !!game && !E.isOver(game);
  const hasProgress = () => inRound() && (game.score > 0 || game.t >= 1000);

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function bestNote() {
    const all = E.MODE_KEYS.map((m) => stats.best[m]).filter((x) => x != null);
    return all.length ? Math.max.apply(null, all) : null;
  }
  function writeSummary() {
    const top = bestNote();
    const list = E.MODE_KEYS.filter((m) => stats.best[m] != null).map((m) => ({ value: fmtN(stats.best[m]), label: modeName(m) }));
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: 0,
      note: top == null ? t('summary.none') : t('summary.note', { score: fmtN(top) }),
      stats: list,
      resume: inRound() && game.t > 0 ? { title: t('app.name'), detail: t('summary.resume', { mode: modeName(game.mode), score: fmtN(game.score) }) } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inRound() && game.t > 0) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Vòng lặp ---------------- */
  let raf = 0;
  let last = 0;
  let acc = 0;

  function kick() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    if (state === 'playing') {
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
        r.events.forEach(onEvent);
      }
    }
    last = now;
    render();
    if (state === 'playing') raf = requestAnimationFrame(frame);
  }

  function onEvent(ev) {
    if (ev.type === 'note') {
      justCleared = false;
      board.classList.remove('cheer');
      tone(ev.pad, ev.on);
    } else if (ev.type === 'turn') {
      say(t('say.turn', { n: game.n }));
    }
  }

  /* ---------------- Luồng ván ---------------- */
  function goIdle() {
    clearTimeout(overTimer);
    state = 'idle';
    game = null;
    kit.store.remove(keys.save);
    buildBoard(chosenMode());
    showOverlay('start');
    render();
    writeSummary();
    if (!kit.modal.current()) $('btn-start').focus();
  }

  function startRound() {
    if (kit.modal.current()) return;
    clearTimeout(overTimer);
    audio(); // trong cú bấm của người chơi: cho phép phát nốt về sau
    const m = chosenMode();
    if (boardMode !== m) buildBoard(m);
    game = E.newGame(m, Math.floor(Math.random() * 0x100000000) >>> 0);
    state = 'playing';
    acc = 0;
    justCleared = false;
    userLit.fill(0);
    clearMarks();
    kit.store.remove(keys.save);
    kit.sdk.start(m);
    showOverlay(null);
    kit.sfx('start', { volume: 0.6 });
    render();
    writeSummary();
    kick();
  }

  function pause(focus) {
    if (state !== 'playing') return;
    state = 'paused';
    acc = 0;
    userLit.fill(0);
    showPaused();
    persist();
    say(t('say.paused'));
    if (focus && !kit.modal.current()) $('btn-resume').focus();
  }

  function showPaused() {
    $('pause-sub').textContent = t('pause.sub', { score: fmtN(game.score) });
    showOverlay('pause');
    render();
  }

  function resume() {
    if (state !== 'paused' || kit.modal.current()) return;
    audio();
    game = E.replay(game); // phát lại vòng hiện tại từ đầu
    state = 'playing';
    justCleared = false;
    clearMarks();
    showOverlay(null);
    render();
    kick();
  }

  function togglePause() {
    if (state === 'playing') pause(true);
    else if (state === 'paused') resume();
  }

  function recordScore(score, m) {
    const record = score > 0 && (stats.best[m] == null || score > stats.best[m]);
    stats.played++;
    stats.rounds += score;
    if (record) stats.best[m] = score;
    saveStats();
    return record;
  }

  let overTimer = 0;
  function finish(res) {
    state = 'over';
    const score = game.score;
    const m = game.mode;
    const record = recordScore(score, m);
    persist(); // ván đã xong: xóa ván lưu, resume = null
    kit.sdk.end({ mode: m, won: false, score, assisted: false });
    kit.sfx('error');
    buzz([60, 40, 90]);
    userLit.fill(0); // vòng lặp đã dừng: tắt ngay các ô vừa bấm để chỉ còn ô sai / ô đúng
    pads[res.pad].el.classList.add('wrong');
    pads[res.expected].el.classList.add('expected');
    $('over-score').textContent = fmtN(score);
    $('over-best').hidden = !record;
    $('over-sub').textContent = t('over.sub', { mode: modeName(m), best: stats.best[m] == null ? '–' : fmtN(stats.best[m]) });
    say(t('say.over', { name: t('pad.' + res.expected), score: fmtN(score) }));
    render();
    clearTimeout(overTimer);
    overTimer = setTimeout(() => {
      if (state !== 'over') return;
      showOverlay('over');
      if (record) {
        kit.sfx('win');
        kit.confetti();
      } else kit.sfx('lose');
      if (!kit.modal.current()) $('btn-again').focus();
    }, OVER_DELAY);
  }

  /** Ván đang dở (đã có điểm hoặc chơi ≥ 1 giây) thì hỏi trước, vì bỏ ván vẫn báo về cổng. */
  function requestNew() {
    if (hasProgress()) {
      pause(false);
      $('confirm-text').textContent = t('confirm.text', { score: fmtN(game.score) });
      kit.modal.open('modal-confirm');
      return;
    }
    goIdle();
  }

  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (hasProgress()) {
      recordScore(game.score, game.mode);
      kit.sdk.end({ mode: game.mode, won: false, score: game.score, assisted: false });
    }
    goIdle();
  }

  /* ---------------- Bấm ô ---------------- */
  function hit(i) {
    if (state !== 'playing' || !game || i < 0 || i >= pads.length) return;
    audio();
    const r = E.press(game, i);
    const res = r.result;
    if (res.type === 'ignored') return;
    game = r.game;
    if (res.type === 'wrong') {
      finish(res);
      return;
    }
    userLit[i] = performance.now() + PRESS_MS;
    tone(i, PRESS_MS);
    buzz(8);
    if (res.type === 'round') {
      justCleared = true;
      kit.sfx('coin', { volume: 0.3 });
      board.classList.remove('cheer');
      void board.offsetWidth; // chạy lại hiệu ứng
      board.classList.add('cheer');
      say(t('say.round', { score: fmtN(game.score) }));
    }
    render();
  }

  /* ---------------- Sự kiện ---------------- */
  board.addEventListener('pointerdown', (e) => {
    const el = e.target.closest && e.target.closest('.pad');
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); // không lấy focus, không chọn chữ, không phóng to khi chạm đúp
    hit(Number(el.dataset.pad));
  });
  board.addEventListener('contextmenu', (e) => e.preventDefault());

  $('btn-start').addEventListener('click', startRound);
  $('overlay-start').addEventListener('click', (e) => {
    if (e.target.closest('.overlay-card')) return;
    startRound();
  });
  $('btn-resume').addEventListener('click', resume);
  $('btn-again').addEventListener('click', startRound);
  $('btn-menu').addEventListener('click', goIdle);
  $('btn-pause').addEventListener('click', togglePause);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = fmtN(stats.played);
    $('stats-steps').textContent = fmtN(stats.rounds);
    $('stats-best-classic').textContent = stats.best.classic == null ? '–' : fmtN(stats.best.classic);
    $('stats-best-hard').textContent = stats.best.hard == null ? '–' : fmtN(stats.best.hard);
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    if (state === 'playing') {
      const p = keyPad(e.code, game.mode);
      if (p >= 0) {
        e.preventDefault();
        if (!e.repeat) hit(p);
        return;
      }
    }
    const k = e.key;
    if (k === ' ' || k === 'Enter') {
      // Space / Enter trên một nút đang focus là cú bấm của chính nút đó
      const tgt = e.target;
      if (tgt && tgt.closest && tgt.closest('button, input, a')) return;
      if (state === 'idle') startRound();
      else if (state === 'paused') resume();
      else if (state === 'over' && overShown) startRound();
      else return;
    } else if (k === 'p' || k === 'P' || k === 'Escape') {
      if (state !== 'playing' && state !== 'paused') return;
      togglePause();
    } else if (k === 'n' || k === 'N') requestNew();
    else return;
    e.preventDefault();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause(false);
  });
  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  if (!E.MODES[settings().mode]) kit.settings.set({ mode: 'classic' });
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored) {
    game = restored;
    state = 'paused';
    buildBoard(game.mode);
    kit.sdk.start(game.mode, true);
    showPaused();
    kit.toast(t('toast.saved'));
  } else {
    kit.store.remove(keys.save);
    buildBoard(chosenMode());
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
