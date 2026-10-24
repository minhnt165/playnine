/* =====================================================================
 * Ghép Chữ - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, words.js, engine.js nạp trước)
 *   - Vẽ bằng DOM: hàng chữ cái (nút), hàng từ đang ghép, danh sách từ đã tìm; đồng hồ chạy bằng requestAnimationFrame
 *     (dt giới hạn 100 ms khi tab vừa quay lại).
 *   - Trạng thái: 'idle' (màn chờ) | 'playing' | 'paused' | 'over'. Tự tạm dừng khi trang ẩn hoặc mở hộp thoại;
 *     lớp phủ tạm dừng che kín chữ để không ngồi nghĩ khi đồng hồ đứng.
 *   - Từ đang ghép là danh sách chỉ số ô chữ (sel), chỉ ở giao diện; engine chỉ nhận chuỗi khi Gửi.
 *   Báo ván cho cổng (metric score_high, mode classic):
 *   - Vòng mới: kit.sdk.start(MODE) khi bấm Bắt đầu; mở lại vòng lưu dở: kit.sdk.start(MODE, true)
 *   - Hết 90 giây: kit.sdk.end({ mode, won: false, score, assisted: false })
 *   - Bỏ vòng khi đã có điểm hoặc đã chơi ≥ 1 giây: kit.sdk.end({ mode, won: false, score }); chưa thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const MAX_DT = 100; // tab vừa quay lại: không nhảy cóc
  const OVER_DELAY = 600; // hết giờ: chờ một chút rồi mới hiện bảng kết quả
  const IDLE_LETTERS = 'anagram'; // chữ trang trí sau màn chờ

  const kit = PNKit.init({
    gameId: 'ghepchu',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { vibrate: true, guideSeen: false },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const settings = () => kit.settings.get();
  const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const fmtN = (n) => kit.i18n.fmtNumber(n);
  const upper = (w) => w.toUpperCase();

  const statsDefault = { played: 0, best: null, words: 0, longest: '' };
  const stats = Object.assign({}, statsDefault, kit.store.read(keys.stats, {}) || {});

  let game = null;
  let mode = 'idle';
  let overShown = false;
  let sel = []; // chỉ số ô chữ theo thứ tự đã chọn
  let roundWords = []; // mọi từ hợp lệ của vòng (tính một lần khi chia vòng)

  /* ---------------- Tiện ích ---------------- */
  function buzz(pattern) {
    if (!settings().vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* bỏ qua */ }
  }
  const say = (msg) => { $('sr').textContent = msg; };

  /** m:ss, làm tròn lên (90 giây đầu hiện 1:30) */
  function fmtTime(ms) {
    const s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /** Chạy lại một hiệu ứng CSS trên phần tử. */
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /** Dài trước, rồi theo ABC. */
  const byLength = (a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0);

  function chip(w, extra) {
    const li = document.createElement('li');
    li.className = 'chip len-' + w.length + (extra ? ' ' + extra : '');
    li.textContent = upper(w);
    return li;
  }

  /* ---------------- Vẽ ---------------- */
  const letters = () => (game ? game.letters : IDLE_LETTERS);
  const current = () => sel.map((i) => letters()[i]).join('');

  function renderRack() {
    const rack = $('rack');
    const l = letters();
    const live = mode === 'playing';
    rack.style.setProperty('--n', l.length);
    $('word').style.setProperty('--n', l.length);
    if (rack.children.length !== l.length) {
      rack.textContent = '';
      for (let i = 0; i < l.length; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tile';
        b.dataset.i = String(i);
        rack.appendChild(b);
      }
    }
    for (let i = 0; i < l.length; i++) {
      const b = rack.children[i];
      const used = sel.includes(i);
      if (b.textContent !== upper(l[i])) b.textContent = upper(l[i]);
      b.classList.toggle('used', used);
      b.disabled = !live || used;
      b.setAttribute('aria-label', t('tile.label', { l: upper(l[i]) }));
    }
  }

  function renderWord() {
    const row = $('word');
    const n = letters().length;
    if (row.children.length !== n) {
      row.textContent = '';
      for (let i = 0; i < n; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'slot';
        b.tabIndex = -1;
        b.dataset.k = String(i);
        row.appendChild(b);
      }
    }
    for (let k = 0; k < n; k++) {
      const b = row.children[k];
      const ch = k < sel.length ? upper(letters()[sel[k]]) : '';
      if (b.textContent !== ch) b.textContent = ch;
      b.classList.toggle('filled', !!ch);
      b.disabled = !ch || mode !== 'playing';
    }
    const live = mode === 'playing';
    $('btn-shuffle').disabled = !live;
    $('btn-back').disabled = !live || !sel.length;
    $('btn-submit').disabled = !live || sel.length < E.MIN_LEN;
  }

  function renderFound() {
    const list = $('found-list');
    const found = game ? game.found : [];
    // Mới nhất đứng đầu; chỉ thêm phần tử mới để hiệu ứng "nảy" chạy trên đúng từ vừa tìm
    if (list.children.length > found.length) list.textContent = '';
    for (let i = list.children.length; i < found.length; i++) list.insertBefore(chip(found[i], i === found.length - 1 ? 'new' : ''), list.firstChild);
    $('found-empty').hidden = found.length > 0;
    let longest = '';
    found.forEach((w) => { if (w.length > longest.length) longest = w; });
    $('found-best').textContent = longest ? t('found.longest', { w: upper(longest) }) : '';
  }

  const hud = { score: -1, time: '', words: '', hurry: null, pause: '' };
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
    const hurry = mode === 'playing' && left <= 10000;
    if (hurry !== hud.hurry) {
      $('time-box').classList.toggle('hurry', hurry);
      hud.hurry = hurry;
    }
    const words = game ? game.found.length + '/' + roundWords.length : '0';
    if (words !== hud.words) {
      $('words').textContent = words;
      hud.words = words;
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
    renderRack();
    renderWord();
    renderFound();
    renderHud();
  }

  function showOverlay(name) {
    ['start', 'pause', 'over'].forEach((n) => { $('overlay-' + n).hidden = n !== name; });
    overShown = name === 'over';
  }

  let msgTimer = 0;
  function message(text, cls) {
    const el = $('msg');
    el.textContent = text;
    el.className = 'msg show ' + cls;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { el.className = 'msg'; }, 1300);
  }

  /* ---------------- Lưu ---------------- */
  const hasProgress = () => !!game && !E.isOver(game) && (game.score > 0 || game.t >= 1000);
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

  /** Cộng một vòng đã xong / đã bỏ vào thống kê. */
  function tally() {
    stats.played++;
    if (game.score > 0 && (stats.best == null || game.score > stats.best)) stats.best = game.score;
    stats.words += game.found.length;
    game.found.forEach((w) => { if (w.length > (stats.longest || '').length) stats.longest = w; });
    saveStats();
  }

  /* ---------------- Vòng lặp đồng hồ ---------------- */
  let raf = 0;
  let last = 0;
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
      const dt = Math.min(MAX_DT, Math.max(0, now - last));
      if (dt > 0) game = E.advance(game, dt);
      // Đếm ngược 5 giây cuối
      const sec = Math.ceil(E.timeLeft(game) / 1000);
      if (sec !== lastSec && sec <= 5 && sec > 0) kit.sfx('tick', { pitch: sec === 1 ? 1.3 : 1 });
      lastSec = sec;
      if (E.isOver(game)) finish();
    }
    last = now;
    renderHud();
    if (mode === 'playing') raf = requestAnimationFrame(frame);
  }

  /* ---------------- Ghép chữ ---------------- */
  function pick(i) {
    if (mode !== 'playing' || sel.includes(i) || i < 0 || i >= letters().length) return;
    sel.push(i);
    kit.sfx('tap', { pitch: 0.9 + sel.length * 0.07, volume: 0.6 });
    renderRack();
    renderWord();
    const slot = $('word').children[sel.length - 1];
    if (slot && !reduceMotion.matches) replay(slot, 'pop');
  }

  /** Gõ phím: lấy ô chưa dùng đầu tiên có chữ đó. */
  function typeLetter(ch) {
    const l = letters();
    for (let i = 0; i < l.length; i++) {
      if (l[i] === ch && !sel.includes(i)) {
        pick(i);
        return;
      }
    }
    kit.sfx('tap', { pitch: 0.5, volume: 0.4 });
    if (!reduceMotion.matches) replay($('word'), 'shake');
  }

  /** Bỏ chữ ở vị trí k của từ đang ghép (mặc định chữ cuối). */
  function unpick(k) {
    if (mode !== 'playing' || !sel.length) return;
    sel.splice(k == null ? sel.length - 1 : k, 1);
    kit.sfx('tap', { pitch: 0.7, volume: 0.5 });
    renderRack();
    renderWord();
  }

  function clearWord() {
    if (mode !== 'playing' || !sel.length) return;
    sel = [];
    kit.sfx('tap', { pitch: 0.6, volume: 0.5 });
    renderRack();
    renderWord();
  }

  /** Xáo chữ, giữ nguyên từ đang ghép (chuyển chỉ số sang vị trí mới của cùng chữ). */
  function shuffle() {
    if (mode !== 'playing') return;
    const word = current();
    game = E.shuffle(game, Math.random);
    const l = game.letters;
    const taken = [];
    sel = word.split('').map((ch) => {
      for (let i = 0; i < l.length; i++) {
        if (l[i] === ch && !taken.includes(i)) {
          taken.push(i);
          return i;
        }
      }
      return -1;
    }).filter((i) => i >= 0);
    kit.sfx('flip');
    renderRack();
    renderWord();
    if (!reduceMotion.matches) replay($('rack'), 'mix');
  }

  function submit() {
    if (mode !== 'playing') return;
    const word = current();
    if (!word) return;
    const r = E.submit(game, word);
    const res = r.result;
    if (res.type === 'ok') {
      game = r.game;
      sel = [];
      const n = word.length;
      message(t(res.all ? 'msg.all' : 'msg.ok', { n: fmtN(res.points) }), 'ok len-' + n);
      say(t('say.ok', { word, n: res.points }));
      if (res.all) {
        kit.sfx('levelup');
        buzz([20, 40, 20]);
      } else if (n >= 5) kit.sfx('combo', { pitch: 0.9 + (n - 5) * 0.1 });
      else kit.sfx('coin', { pitch: n === 3 ? 0.9 : 1.1 });
      render();
      persist();
      return;
    }
    if (res.type === 'over') return;
    message(t('msg.' + res.type), 'bad');
    say(t('msg.' + res.type));
    kit.sfx(res.type === 'dup' ? 'flip' : 'error');
    buzz(30);
    if (!reduceMotion.matches) replay($('word'), 'shake');
    if (res.type === 'dup') {
      // Chớp từ đã tìm trong danh sách
      const idx = game.found.indexOf(res.word);
      const el = $('found-list').children[game.found.length - 1 - idx];
      if (el && !reduceMotion.matches) replay(el, 'flash');
    }
    if (res.type !== 'short') {
      sel = [];
      renderRack();
      renderWord();
    }
  }

  /* ---------------- Luồng ván ---------------- */
  function startRound() {
    kit.modal.close('modal-confirm');
    clearTimeout(overTimer);
    game = E.newGame(Math.floor(Math.random() * 0x100000000) >>> 0);
    roundWords = E.allWords(game);
    sel = [];
    mode = 'playing';
    lastSec = 90;
    $('found-list').textContent = '';
    $('msg').className = 'msg';
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    showOverlay(null);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    kit.sfx('start');
    render();
    writeSummary();
    kick();
  }

  function pause(focus) {
    if (mode !== 'playing') return;
    mode = 'paused';
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
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    kit.sfx('tap', { pitch: 1.15 });
    render();
    kick();
  }

  function togglePause() {
    if (mode === 'playing') pause(true);
    else if (mode === 'paused') resume();
  }

  let overTimer = 0;
  function finish() {
    mode = 'over';
    sel = [];
    const score = game.score;
    const record = score > 0 && (stats.best == null || score > stats.best);
    tally();
    persist(); // vòng đã xong: xóa vòng lưu, resume = null
    kit.sdk.end({ mode: MODE, won: false, score, assisted: false });
    kit.sfx(record ? 'win' : 'clear');
    if (record) kit.confetti();
    buzz([40, 40, 80]);
    say(t('say.over', { score: fmtN(score) }));
    fillOver(record);
    render();
    clearTimeout(overTimer);
    overTimer = setTimeout(() => {
      if (mode !== 'over') return;
      showOverlay('over');
      if (!kit.modal.current()) $('btn-again').focus();
    }, reduceMotion.matches ? 0 : OVER_DELAY);
  }

  function fillOver(record) {
    const found = game.found.slice().sort(byLength);
    const missed = E.missed(game);
    $('over-score').textContent = fmtN(game.score);
    $('over-best').hidden = !record;
    $('over-line').textContent = missed.length ? t('over.line', { n: found.length, total: roundWords.length }) : t('over.all');
    $('over-found-n').textContent = String(found.length);
    $('over-missed-n').textContent = String(missed.length);
    [['over-found', found, ''], ['over-missed', missed, 'missed']].forEach(([id, list, cls]) => {
      const ul = $(id);
      ul.textContent = '';
      if (!list.length) {
        const li = document.createElement('li');
        li.className = 'chip-none';
        li.textContent = t('over.none');
        ul.appendChild(li);
      }
      list.forEach((w) => ul.appendChild(chip(w, cls)));
    });
    $('over-lists').scrollTop = 0;
  }

  /** Vòng đang dở (đã có điểm hoặc chơi ≥ 1 giây) thì hỏi trước, vì bỏ vòng vẫn báo về cổng. */
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
      kit.sdk.end({ mode: MODE, won: false, score: game.score, assisted: false });
    }
    startRound();
  }

  /* ---------------- Màn chờ ---------------- */
  function fillStart() {
    const ul = $('legend');
    ul.textContent = '';
    [3, 4, 5, 6, 7].forEach((n) => {
      const li = document.createElement('li');
      li.className = 'len-' + n;
      li.innerHTML = '<span class="legend-len"></span><b></b>';
      li.firstChild.textContent = t('legend.len', { n });
      li.lastChild.textContent = fmtN(E.POINTS[n]);
      ul.appendChild(li);
    });
    $('start-best').hidden = stats.best == null;
    if (stats.best != null) $('start-best').textContent = t('start.best', { score: fmtN(stats.best) });
  }

  /* ---------------- Sự kiện ---------------- */
  // Chuột / chạm: bắt ngay khi nhấn xuống, không lấy focus (để Enter vẫn là Gửi). Bàn phím (Tab + Enter) đi qua click.
  function onPress(el, fn) {
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      fn(e);
    });
    el.addEventListener('click', (e) => { if (e.detail === 0) fn(e); });
  }
  onPress($('rack'), (e) => {
    const b = e.target.closest && e.target.closest('.tile');
    if (b && !b.disabled) pick(Number(b.dataset.i));
  });
  onPress($('word'), (e) => {
    const b = e.target.closest && e.target.closest('.slot');
    if (b && !b.disabled) unpick(Number(b.dataset.k));
  });
  onPress($('btn-shuffle'), () => { if (!$('btn-shuffle').disabled) shuffle(); });
  onPress($('btn-back'), () => { if (!$('btn-back').disabled) unpick(); });
  onPress($('btn-submit'), () => { if (!$('btn-submit').disabled) submit(); });
  $('rack').addEventListener('contextmenu', (e) => e.preventDefault());

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
    $('stats-words').textContent = fmtN(stats.words);
    $('stats-longest').textContent = stats.longest ? upper(stats.longest) : '–';
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key;
    if (mode === 'playing' && k.length === 1 && /[a-z]/i.test(k)) {
      e.preventDefault();
      typeLetter(k.toLowerCase());
      return;
    }
    if (k === 'Enter' || k === ' ') {
      // Enter / Space trên một nút đang focus (đi bằng Tab) là cú bấm của chính nút đó
      const tgt = e.target;
      if (tgt && tgt.closest && tgt.closest('button, input, a')) return;
      if (mode === 'playing') {
        if (k === 'Enter') submit();
        else shuffle();
      } else if (mode === 'idle') startRound();
      else if (mode === 'paused') resume();
      else if (mode === 'over' && overShown) startRound();
      else return;
    } else if (k === 'Backspace') {
      if (mode !== 'playing') return;
      unpick();
    } else if (k === 'Delete') {
      if (mode !== 'playing') return;
      clearWord();
    } else if (k === 'Escape') {
      if (mode !== 'playing' && mode !== 'paused') return;
      togglePause();
    } else return;
    e.preventDefault();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause(false);
  });
  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại vòng dở nếu có ---------------- */
  fillStart();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && !E.isOver(restored) && restored.t > 0) {
    game = restored;
    roundWords = E.allWords(game);
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
