/* =====================================================================
 * Gõ Nhanh - Giao diện + luồng bài gõ (cần ../_kit/kit.js, i18n.js, words.js, engine.js nạp trước)
 *   - Một ô nhập ẩn (#inp) nhận mọi phím, cả bàn phím máy tính lẫn bàn phím hệ thống của điện thoại.
 *     Mỗi sự kiện input so giá trị ô với từ đang gõ trong engine để suy ra thao tác: thêm 1 ký tự, xóa, xóa cả từ.
 *     Thêm từ 2 ký tự trở lên một lúc (dán, tự sửa chính tả, gõ vuốt) thì bỏ qua và báo.
 *   - Thời điểm mỗi phím lấy từ event.timeStamp (ưu tiên keydown) để engine đo nhịp gõ, chặn ký tự đến đồng loạt.
 *   - Trạng thái: 'idle' (màn chờ) | 'ready' (đã hiện từ, chờ phím đầu) | 'playing' | 'paused' | 'over'.
 *   - visualViewport: khi bàn phím điện thoại bật, khung game co theo phần màn hình còn nhìn thấy.
 *   Báo ván cho cổng (metric score_high, mode '60s' | '30s', điểm = WPM làm tròn):
 *   - Bài mới: kit.sdk.start(mode) khi bấm Bắt đầu; mở lại bài lưu dở: kit.sdk.start(mode, true)
 *   - Hết giờ: kit.sdk.end({ mode, won: false, score, assisted: false })
 *   - Bị gắn cờ gõ tự động: kit.sdk.end({ mode, won: false, score: 0, assisted: true })
 *   - Bỏ bài khi đã có ký tự đúng hoặc đã gõ ≥ 1 giây: kit.sdk.end({ mode, won: false, score }); chưa thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const WORDS = window.WORDS;
  const MODE_KEYS = Object.keys(E.MODES);
  const OVER_DELAY = 700; // hết giờ: chờ một chút mới nhận Space / Enter (tránh phím đang gõ dở bấm "Chơi lại")
  const KEY_TS_WINDOW = 150; // keydown và input của cùng một phím cách nhau dưới mức này

  const kit = PNKit.init({
    gameId: 'gonhanh',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { mode: '60s', guideSeen: false, vibrate: true, keySound: false },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const settings = () => kit.settings.get();
  const fmtN = (n) => kit.i18n.fmtNumber(n);
  const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const touchUI = window.matchMedia ? matchMedia('(hover: none) and (pointer: coarse)') : { matches: false };
  if (MODE_KEYS.indexOf(settings().mode) < 0) kit.settings.set({ mode: '60s' });

  /* Đồng hồ bài gõ: tự quản (không dùng kit.timer vì nó tự chạy tiếp khi trang hiện lại, còn bài gõ đã tạm dừng) */
  const clock = PNKit.createTimer({ now: () => performance.now() });

  /* ---------------- Thống kê ---------------- */
  function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const num = (x) => (Number.isFinite(x) && x >= 0 ? x : null);
    const best = {};
    MODE_KEYS.forEach((m) => { best[m] = raw.best && num(raw.best[m]) != null ? raw.best[m] : null; });
    return {
      played: num(raw.played) || 0,
      best,
      bestAcc: num(raw.bestAcc),
      words: num(raw.words) || 0,
      recent: Array.isArray(raw.recent) ? raw.recent.filter((x) => x && Number.isFinite(x.w)).slice(-10) : [],
    };
  }
  const stats = loadStats();

  let game = null;
  let mode = 'idle';
  let overShown = false;

  /* ---------------- DOM ---------------- */
  const inp = $('inp');
  const wordsEl = $('words');
  const typingEl = $('typing');
  let wordEls = [];
  const caret = document.createElement('span');
  caret.className = 'caret';
  caret.setAttribute('aria-hidden', 'true');

  const say = (msg) => { $('sr').textContent = msg; };
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
  const LETTER_CLS = { ok: 'ok', bad: 'bad', todo: '', miss: 'miss', extra: 'x' };

  function buzz(pattern) {
    if (!settings().vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* bỏ qua */ }
  }

  /* ---------------- Vẽ dãy từ ---------------- */
  function lettersHTML(k) {
    const word = game.words[k];
    const typed = k < game.typed.length ? game.typed[k] : k === game.i ? game.cur : '';
    return E.letterStates(game, k)
      .map((s, j) => '<i class="' + LETTER_CLS[s] + '">' + esc(j < word.length ? word[j] : typed[j]) + '</i>')
      .join('');
  }
  function wordClass(k) {
    if (k < game.i) return E.wordOk(game, k) ? 'w done' : 'w done err';
    return k === game.i ? 'w cur' : 'w';
  }
  function renderWords() {
    let html = '';
    for (let k = 0; k < game.words.length; k++) html += '<span class="' + wordClass(k) + '">' + lettersHTML(k) + '</span> ';
    wordsEl.innerHTML = html;
    wordsEl.appendChild(caret);
    wordEls = Array.from(wordsEl.querySelectorAll('.w'));
    scrollLine = -1;
    placeCaret();
  }
  function updateWords(from, to) {
    for (let k = Math.max(0, from); k <= Math.min(to, game.words.length - 1); k++) {
      const el = wordEls[k];
      el.className = wordClass(k);
      el.innerHTML = lettersHTML(k);
    }
  }

  /* Con trỏ: đặt trước chữ kế tiếp (hoặc sau chữ cuối); dãy từ cuộn từng dòng để dòng đang gõ luôn là dòng 1 hoặc 2 */
  let scrollLine = -1;
  function placeCaret() {
    if (!game || !wordEls.length) return;
    const k = Math.min(game.i, game.words.length - 1);
    const el = wordEls[k];
    const letters = el.children;
    const n = k === game.i ? game.cur.length : letters.length;
    // .w là position: relative nên offsetLeft của chữ tính từ đầu từ: cộng thêm vị trí của từ trong dãy.
    let x = el.offsetLeft;
    if (n < letters.length) x += letters[n].offsetLeft;
    else {
      const last = letters[letters.length - 1];
      x += last.offsetLeft + last.offsetWidth;
    }
    const lineH = el.offsetHeight || 1;
    const line = Math.round(el.offsetTop / lineH);
    const top = Math.max(0, line - 1);
    if (top !== scrollLine) {
      scrollLine = top;
      wordsEl.style.transform = 'translateY(' + -top * lineH + 'px)';
    }
    caret.style.height = lineH * 0.62 + 'px';
    caret.style.transform = 'translate(' + (x - 1) + 'px,' + (el.offsetTop + lineH * 0.19) + 'px)';
    caret.hidden = mode === 'over';
  }

  let idleTimer = 0;
  function caretActive() {
    caret.classList.remove('blink');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => caret.classList.add('blink'), 600);
  }

  /* ---------------- HUD ---------------- */
  const hud = { time: '', fill: '', wpm: '', acc: '', best: '', hurry: null, pause: '', tag: '' };
  function curMode() {
    return game ? game.mode : settings().mode;
  }
  function renderHud() {
    const m = curMode();
    const dur = E.MODES[m];
    const left = game && mode !== 'idle' ? E.timeLeft(game) : dur;
    const time = String(Math.ceil(left / 1000));
    if (time !== hud.time) {
      $('time').textContent = time;
      hud.time = time;
    }
    const fill = (left / dur).toFixed(4);
    if (fill !== hud.fill) {
      $('time-fill').style.transform = 'scaleX(' + fill + ')';
      hud.fill = fill;
    }
    const hurry = mode === 'playing' && left <= 5000;
    if (hurry !== hud.hurry) {
      $('time-box').classList.toggle('hurry', hurry);
      hud.hurry = hurry;
    }
    const live = game && game.started && mode !== 'idle' && (game.over || game.t >= 1000);
    const wpm = live ? fmtN(E.score(game)) : '–';
    if (wpm !== hud.wpm) {
      $('wpm').textContent = wpm;
      hud.wpm = wpm;
    }
    const a = game && mode !== 'idle' ? E.accuracy(game) : null;
    const acc = a == null ? '–' : Math.floor(a * 100) + '%';
    if (acc !== hud.acc) {
      $('acc').textContent = acc;
      hud.acc = acc;
    }
    const best = stats.best[m] == null ? '–' : fmtN(stats.best[m]);
    if (best !== hud.best) {
      $('best').textContent = best;
      hud.best = best;
    }
    const tag = t('mode.short' + m);
    if (tag !== hud.tag) {
      $('mode-tag').textContent = tag;
      hud.tag = tag;
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

  function renderHint() {
    let key = '';
    if (mode === 'ready') key = touchUI.matches ? 'typing.readyTouch' : 'typing.ready';
    else if (mode === 'playing') key = 'typing.playing';
    $('typing-hint').textContent = key ? t(key) : '';
    typingEl.classList.toggle('is-ready', mode === 'ready');
  }

  function renderStartBest() {
    const m = settings().mode;
    const best = stats.best[m];
    const name = t('mode.' + m);
    $('start-best').textContent = best == null ? t('start.noBest', { mode: name }) : t('start.best', { mode: name, wpm: fmtN(best) });
  }

  function showOverlay(name) {
    ['start', 'pause', 'over'].forEach((n) => { $('overlay-' + n).hidden = n !== name; });
    if (name !== 'over') overShown = false;
    typingEl.classList.toggle('covered', !!name);
    updateFocusHint();
  }

  /* ---------------- Lưu ---------------- */
  const inRound = () => (mode === 'playing' || mode === 'paused') && !!game && game.started && !game.over;
  const hasProgress = () => inRound() && (game.t >= 1000 || E.correctChars(game) > 0);

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function syncClock() {
    if (mode === 'playing' && game && game.started && !game.over) game = E.advance(game, clock.elapsed());
  }
  function writeSummary() {
    const bests = MODE_KEYS.filter((m) => stats.best[m] != null);
    const top = bests.length ? Math.max.apply(null, bests.map((m) => stats.best[m])) : null;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: 0,
      note: top == null ? t('summary.none') : t('summary.note', { wpm: fmtN(top) }),
      stats: bests.map((m) => ({ value: fmtN(stats.best[m]), label: t('summary.wpm', { mode: t('mode.short' + m) }) })),
      resume: inRound()
        ? {
          title: t('app.name'),
          detail: t('summary.resume', { wpm: fmtN(E.score(game)), time: Math.ceil(E.timeLeft(game) / 1000) }),
          pct: game.t / E.duration(game),
        }
        : null,
      now: Date.now(),
    }));
  }
  function persist() {
    syncClock();
    if (inRound()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Vòng lặp (đồng hồ + HUD) ---------------- */
  let raf = 0;
  function kick() {
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function frame() {
    raf = 0;
    if (mode === 'playing') {
      if (kit.modal.current() || document.hidden) {
        pause(false);
        return;
      }
      game = E.advance(game, clock.elapsed());
      if (game.over) {
        finish();
        return;
      }
    }
    renderHud();
    if (mode === 'playing') raf = requestAnimationFrame(frame);
  }

  /* ---------------- Ô nhập ẩn ---------------- */
  const typingMode = () => mode === 'ready' || mode === 'playing';

  function focusInput() {
    if (!game) return;
    inp.value = game.cur;
    try {
      inp.focus({ preventScroll: true });
    } catch (e) {
      inp.focus();
    }
    updateFocusHint();
  }

  function updateFocusHint() {
    $('focus-hint').hidden = !(typingMode() && document.activeElement !== inp && !kit.modal.current());
  }

  let toastAt = 0;
  function reject(kind) {
    if (game) inp.value = game.cur;
    kit.sfx('error', { volume: 0.4 });
    const now = performance.now();
    if (now - toastAt > 1500) {
      toastAt = now;
      kit.toast(t(kind === 'paste' ? 'toast.paste' : 'toast.multi'), 2400);
    }
  }

  /** Thời điểm sự kiện theo đồng hồ bài gõ (ms tính từ phím đầu). */
  const evAt = (ts) => Math.max(0, clock.elapsed() - Math.max(0, performance.now() - ts));

  let lastKeyTs = -1;
  inp.addEventListener('keydown', (e) => {
    lastKeyTs = e.timeStamp;
    if (e.key === 'Enter') e.preventDefault(); // Enter không làm gì trong ô gõ
  });
  inp.addEventListener('beforeinput', (e) => {
    const it = e.inputType || '';
    if (it.indexOf('insertFrom') === 0 || it === 'insertReplacementText' || it === 'insertTranspose') {
      e.preventDefault();
      reject(it === 'insertReplacementText' ? 'multi' : 'paste');
    }
  });
  ['paste', 'drop'].forEach((ev) => inp.addEventListener(ev, (e) => {
    e.preventDefault();
    reject('paste');
  }));
  wordsEl.addEventListener('dragstart', (e) => e.preventDefault());

  inp.addEventListener('input', (e) => {
    if (!game || !typingMode() || kit.modal.current()) {
      inp.value = game ? game.cur : '';
      return;
    }
    const val = inp.value;
    const old = game.cur;
    let p = 0;
    while (p < old.length && p < val.length && old[p] === val[p]) p++;
    const del = old.length - p;
    const add = val.slice(p);
    if (add.length > 1) {
      reject('multi');
      return;
    }
    const ts = lastKeyTs >= 0 && e.timeStamp - lastKeyTs < KEY_TS_WINDOW ? lastKeyTs : e.timeStamp;
    lastKeyTs = -1;
    const before = game;
    let result = null;
    if (del > 0) {
      if (del === old.length && del > 1) game = E.clearWord(game, evAt(ts)).game;
      else for (let d = 0; d < del; d++) game = E.backspace(game, evAt(ts)).game;
    }
    if (add.length === 1 && !game.over) {
      if (!game.started && add !== ' ' && mode === 'ready') beginClock(ts);
      const r = E.type(game, add, evAt(ts));
      game = r.game;
      result = r.result;
    }
    if (inp.value !== game.cur) inp.value = game.cur;
    updateWords(before.i, game.i);
    placeCaret();
    caretActive();
    if (result) feedback(result);
    if (game.over) finish();
    else renderHud();
  });

  inp.addEventListener('blur', () => setTimeout(updateFocusHint, 0));
  inp.addEventListener('focus', updateFocusHint);

  function beginClock(ts) {
    clock.reset();
    clock.start();
    clock.set(Math.max(0, performance.now() - ts));
    mode = 'playing';
    renderHint();
    kick();
  }

  function feedback(res) {
    if (res.type !== 'char' && res.type !== 'space') return;
    if (res.ok) {
      if (settings().keySound) kit.sfx('tap', { volume: 0.18, pitch: res.type === 'space' ? 0.8 : 1 + Math.random() * 0.15 });
    } else {
      if (settings().keySound) kit.sfx('error', { volume: 0.18 });
      buzz(12);
    }
  }

  /* ---------------- Luồng bài ---------------- */
  function startRound() {
    kit.modal.close('modal-confirm');
    clearTimeout(overTimer);
    const m = MODE_KEYS.indexOf(settings().mode) >= 0 ? settings().mode : '60s';
    game = E.newGame(Math.floor(Math.random() * 0x100000000) >>> 0, m, WORDS);
    mode = 'ready';
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(m);
    showOverlay(null);
    renderWords();
    renderHint();
    renderHud();
    caretActive();
    focusInput();
    kit.sfx('start');
    writeSummary();
  }

  function pause(focus) {
    if (mode !== 'playing') return;
    game = E.advance(game, clock.elapsed());
    clock.pause();
    if (game.over) {
      finish();
      return;
    }
    mode = 'paused';
    inp.blur();
    showPaused();
    persist();
    say(t('say.paused'));
    if (focus && !kit.modal.current()) $('btn-resume').focus();
  }

  function showPaused() {
    $('pause-sub').textContent = t('pause.sub', { wpm: fmtN(E.score(game)), time: Math.ceil(E.timeLeft(game) / 1000) });
    showOverlay('pause');
    renderHint();
    renderHud();
  }

  function resume() {
    if (mode !== 'paused' || kit.modal.current()) return;
    mode = 'playing';
    showOverlay(null);
    renderHint();
    clock.resume();
    focusInput();
    placeCaret();
    caretActive();
    kick();
  }

  function togglePause() {
    if (mode === 'playing') pause(true);
    else if (mode === 'paused') resume();
  }

  let overTimer = 0;
  function finish() {
    if (mode === 'over') return;
    mode = 'over';
    clock.pause();
    inp.blur();
    cancelAnimationFrame(raf);
    raf = 0;
    const flagged = !!game.flagged;
    const score = E.score(game);
    const acc = E.accuracy(game);
    const record = !flagged && score > 0 && (stats.best[game.mode] == null || score > stats.best[game.mode]);
    stats.played++;
    if (!flagged) {
      if (record) stats.best[game.mode] = score;
      if (acc != null && game.keys >= 20 && (stats.bestAcc == null || acc > stats.bestAcc)) stats.bestAcc = acc;
      stats.words += game.typed.filter((w, k) => w === game.words[k]).length;
      stats.recent = stats.recent.concat([{ m: game.mode, w: score, a: acc == null ? 0 : Math.round(acc * 1000) / 1000 }]).slice(-10);
    }
    saveStats();
    persist(); // bài đã xong: xóa bài lưu, resume = null
    kit.sdk.end(flagged ? { mode: game.mode, won: false, score: 0, assisted: true } : { mode: game.mode, won: false, score, assisted: false });
    if (flagged) kit.sfx('error');
    else kit.sfx(record ? 'win' : 'clear');
    if (record) kit.confetti();

    $('over-wpm').textContent = fmtN(score);
    $('over-best').hidden = !record;
    $('over-flag').hidden = !flagged;
    $('over-acc').textContent = acc == null ? '–' : Math.floor(acc * 100) + '%';
    $('over-raw').textContent = fmtN(Math.round(E.rawWpm(game)));
    const cs = E.charStats(game);
    const chars = $('over-chars');
    chars.innerHTML = '<span class="c-ok">' + cs.correct + '</span>/<span class="c-bad">' + cs.incorrect + '</span>/<span class="c-x">' +
      cs.extra + '</span>/<span class="c-miss">' + cs.missed + '</span>';
    chars.title = t('over.charsTitle');
    chars.setAttribute('aria-label', t('over.chars') + ': ' + cs.correct + ' / ' + cs.incorrect + ' / ' + cs.extra + ' / ' + cs.missed + ' (' + t('over.charsTitle') + ')');
    $('over-mode').textContent = t('mode.' + game.mode);
    say(t('say.over', { wpm: score, acc: $('over-acc').textContent }));
    placeCaret();
    renderHint();
    renderHud();
    showOverlay('over');
    drawChart();
    clearTimeout(overTimer);
    overTimer = setTimeout(() => {
      if (mode !== 'over') return;
      overShown = true;
      if (!kit.modal.current()) $('btn-again').focus();
    }, reduceMotion.matches ? 300 : OVER_DELAY);
  }

  /** Bài đang dở (đã có ký tự đúng hoặc gõ ≥ 1 giây) thì hỏi trước, vì bỏ bài vẫn báo về cổng. */
  function requestNew() {
    syncClock();
    if (hasProgress()) {
      pause(false);
      if (mode !== 'paused') return; // vừa hết giờ trong lúc bấm
      $('confirm-text').textContent = t('confirm.text', { wpm: fmtN(E.score(game)) });
      kit.modal.open('modal-confirm');
      return;
    }
    startRound();
  }

  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (hasProgress()) {
      stats.played++;
      saveStats();
      kit.sdk.end({ mode: game.mode, won: false, score: E.score(game), assisted: false });
    }
    startRound();
  }

  /* ---------------- Biểu đồ WPM theo giây (SVG) ---------------- */
  const SVGNS = 'http://www.w3.org/2000/svg';
  let chartData = [];
  let chartGeo = null;

  function svgEl(name, attrs) {
    const el = document.createElementNS(SVGNS, name);
    Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
    return el;
  }

  function drawChart() {
    const box = $('chart-box');
    box.textContent = '';
    $('chart-tip').hidden = true;
    chartData = game ? E.chart(game) : [];
    $('chart').hidden = chartData.length < 2;
    if (chartData.length < 2) return;
    const W = Math.max(200, box.clientWidth);
    const H = box.clientHeight || 130;
    const pad = { l: 30, r: 8, t: 8, b: 20 };
    const n = chartData.length;
    const top = Math.max(20, ...chartData.map((d) => Math.max(d.wpm, d.raw)));
    const step = top > 200 ? 100 : top > 100 ? 50 : top > 40 ? 20 : 10;
    const maxY = Math.ceil(top / step) * step;
    const x = (s) => pad.l + ((s - 1) / (n - 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - v / maxY) * (H - pad.t - pad.b);
    const svg = svgEl('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg', role: 'img' });
    svg.setAttribute('aria-label', t('chart.label', { wpm: E.score(game) }));
    // Lưới ngang + nhãn trục y
    for (let v = 0; v <= maxY; v += step) {
      svg.appendChild(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'grid' }));
      const tx = svgEl('text', { x: pad.l - 6, y: y(v) + 3.5, class: 'axis', 'text-anchor': 'end' });
      tx.textContent = v;
      svg.appendChild(tx);
    }
    // Nhãn trục x: giây 1 và mỗi 5 / 10 giây
    const every = n > 40 ? 10 : 5;
    for (let s = 1; s <= n; s++) {
      if (s !== 1 && s % every) continue;
      const tx = svgEl('text', { x: x(s), y: H - 5, class: 'axis', 'text-anchor': 'middle' });
      tx.textContent = s;
      svg.appendChild(tx);
    }
    const path = (key) => chartData.map((d, i) => (i ? 'L' : 'M') + x(d.s).toFixed(1) + ' ' + y(d[key]).toFixed(1)).join('');
    svg.appendChild(svgEl('path', { d: path('raw'), class: 'line-raw' }));
    svg.appendChild(svgEl('path', { d: path('wpm'), class: 'line-wpm' }));
    // Lỗi: dấu × trên đường WPM thô của giây đó
    chartData.forEach((d) => {
      if (!d.err) return;
      const cx = x(d.s);
      const cy = y(d.raw);
      const r = 3 + Math.min(2, d.err - 1);
      svg.appendChild(svgEl('path', { d: 'M' + (cx - r) + ' ' + (cy - r) + 'L' + (cx + r) + ' ' + (cy + r) + 'M' + (cx + r) + ' ' + (cy - r) + 'L' + (cx - r) + ' ' + (cy + r), class: 'mark-err' }));
    });
    // Lớp rê chuột / chạm: đường dọc + chấm + chú thích
    const hover = svgEl('g', { class: 'hover', visibility: 'hidden' });
    hover.appendChild(svgEl('line', { y1: pad.t, y2: H - pad.b, x1: 0, x2: 0, class: 'hover-line' }));
    hover.appendChild(svgEl('circle', { r: 4, class: 'dot-raw' }));
    hover.appendChild(svgEl('circle', { r: 4.5, class: 'dot-wpm' }));
    svg.appendChild(hover);
    svg.appendChild(svgEl('rect', { x: pad.l, y: 0, width: W - pad.l - pad.r, height: H, fill: 'transparent', class: 'hit' }));
    box.appendChild(svg);
    chartGeo = { x, y, n, W, pad, hover };
  }

  function chartHover(e) {
    if (!chartGeo || !chartData.length) return;
    const box = $('chart-box');
    const rect = box.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const { x, y, n, W, pad, hover } = chartGeo;
    const s = Math.max(1, Math.min(n, Math.round(1 + ((px - pad.l) / (W - pad.l - pad.r)) * (n - 1))));
    const d = chartData[s - 1];
    const [line, dotRaw, dotWpm] = hover.children;
    line.setAttribute('x1', x(s));
    line.setAttribute('x2', x(s));
    dotRaw.setAttribute('cx', x(s));
    dotRaw.setAttribute('cy', y(d.raw));
    dotWpm.setAttribute('cx', x(s));
    dotWpm.setAttribute('cy', y(d.wpm));
    hover.setAttribute('visibility', 'visible');
    const tip = $('chart-tip');
    tip.textContent = t('chart.tip', { s, wpm: Math.round(d.wpm), raw: d.raw }) + (d.err ? ' · ' + t('chart.tipErr', { n: d.err }) : '');
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = Math.max(0, Math.min(rect.width - tw, x(s) - tw / 2)) + 'px';
  }
  function chartLeave() {
    if (chartGeo) chartGeo.hover.setAttribute('visibility', 'hidden');
    $('chart-tip').hidden = true;
  }
  $('chart-box').addEventListener('pointermove', chartHover);
  $('chart-box').addEventListener('pointerdown', chartHover);
  $('chart-box').addEventListener('pointerleave', chartLeave);

  /* ---------------- Khung nhìn khi bàn phím điện thoại bật ---------------- */
  const vv = window.visualViewport;
  let vvMax = 0;
  let vvW = 0;
  function fitViewport() {
    if (!vv) return;
    const root = document.documentElement;
    if (Math.abs(vv.width - vvW) > 2) {
      vvW = vv.width;
      vvMax = 0;
    }
    vvMax = Math.max(vvMax, vv.height, window.innerHeight);
    root.style.setProperty('--vvh', Math.round(vv.height) + 'px');
    root.style.setProperty('--vvtop', Math.round(vv.offsetTop) + 'px');
    root.classList.toggle('kb', vv.height < vvMax * 0.78);
    placeCaret();
  }
  if (vv) {
    vv.addEventListener('resize', fitViewport);
    vv.addEventListener('scroll', fitViewport);
    fitViewport();
  }
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    placeCaret();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      placeCaret();
      if (mode === 'over') drawChart();
    }, 120);
  });

  /* ---------------- Cài đặt ---------------- */
  function onSetting(key, value) {
    if (key === 'mode') {
      if (MODE_KEYS.indexOf(value) < 0) return;
      renderStartBest();
      if (mode === 'idle') renderHud();
    }
  }

  /* ---------------- Sự kiện ---------------- */
  typingEl.addEventListener('pointerdown', (e) => {
    if (!typingMode() || e.target.closest('.overlay')) return;
    e.preventDefault(); // giữ focus ở ô nhập ẩn, không chọn chữ
    focusInput();
  });
  typingEl.addEventListener('click', () => {
    if (typingMode()) focusInput();
  });
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
    const r = stats.recent;
    $('stats-avg').textContent = r.length ? fmtN(Math.round(r.reduce((s, x) => s + x.w, 0) / r.length)) : '–';
    $('stats-best60').textContent = stats.best['60s'] == null ? '–' : fmtN(stats.best['60s']);
    $('stats-best30').textContent = stats.best['30s'] == null ? '–' : fmtN(stats.best['30s']);
    $('stats-acc').textContent = stats.bestAcc == null ? '–' : Math.floor(stats.bestAcc * 100) + '%';
    $('stats-words').textContent = fmtN(stats.words);
  });

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || kit.modal.current()) return;
    const k = e.key;
    if (k === 'Escape') {
      if (mode === 'playing' || mode === 'paused') {
        e.preventDefault();
        togglePause();
      }
      return;
    }
    if (k === 'Tab' && typingMode() && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      requestNew();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (typingMode()) {
      // Phím chữ khi ô nhập mất focus: đưa focus về, ký tự sẽ vào ô nhập
      if (document.activeElement !== inp && k.length === 1) focusInput();
      return;
    }
    if (k === ' ' || k === 'Enter') {
      const tgt = e.target;
      if (tgt && tgt.closest && tgt.closest('button, input, a')) return; // cú bấm của chính nút đang focus
      if (mode === 'idle') startRound();
      else if (mode === 'paused') resume();
      else if (mode === 'over' && overShown) startRound();
      else return;
    } else if (k === 'n' || k === 'N') {
      if (mode === 'over' && !overShown) return;
      requestNew();
    } else if (k === 'p' || k === 'P') {
      if (mode !== 'paused') return;
      resume();
    } else return;
    e.preventDefault();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause(false);
  });
  kit.onLeave(persist);
  // Mở hộp thoại khi đang gõ: tạm dừng ngay (vòng lặp cũng tự kiểm tra)
  document.addEventListener('click', () => {
    if (mode === 'playing' && kit.modal.current()) pause(false);
    updateFocusHint();
  });

  /* ---------------- Khởi động: mở lại bài dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && restored.started && !restored.over) {
    game = restored;
    mode = 'paused';
    clock.set(game.t);
    kit.sdk.start(game.mode, true);
    renderWords();
    showPaused();
    kit.toast(t('toast.saved'), 2600);
  } else {
    kit.store.remove(keys.save);
    game = E.newGame(Math.floor(Math.random() * 0x100000000) >>> 0, settings().mode, WORDS);
    renderWords(); // dãy từ mờ phía sau màn chờ
    game = null;
    showOverlay('start');
    renderHud();
  }
  renderStartBest();
  renderHint();
  writeSummary();

  // Lần đầu mở: hướng dẫn ngắn
  if (!settings().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
})();
