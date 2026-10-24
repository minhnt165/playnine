/* =====================================================================
 * Đoán Chữ - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, words.js, engine.js nạp trước)
 *   - Hai mode: 'daily' (một từ mỗi ngày theo giờ máy, chuỗi ngày thắng, chia sẻ ô màu) và 'free' (từ ngẫu nhiên theo seed)
 *   - Mỗi lúc chỉ một ván đang chơi (cổng giữ một ván cho mỗi game); đổi mode / ván mới khi đang dở thì hỏi trước
 *   - Báo ván cho cổng (metric wins):
 *     ván mới kit.sdk.start(mode), mở lại ván dở kit.sdk.start(mode, true);
 *     thắng / hết 6 lượt kit.sdk.end({ mode, won, assisted: false });
 *     bỏ ván đã đoán ≥ 1 lượt gửi won: false, chưa đoán lượt nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const ROWS = E.MAX;
  const LEN = E.LEN;
  const KEYS = ['qwertyuiop', 'asdfghjkl', '+zxcvbnm-']; // + = Enter, - = Xóa
  const FLIP_MS = 320; // khoảng cách lật giữa hai ô khi lộ màu
  const kit = PNKit.init({
    gameId: 'doanchu',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { hard: false, contrast: false, guideSeen: false },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let game = null; // ván đang hiện trên bàn
  let typed = ''; // chữ đang gõ ở hàng hiện tại
  let busy = false; // đang lật ô: chặn nhập
  let hiddenRow = -1; // hàng đang lật: render() chưa tô màu hàng này
  let frozen = false; // xem lại từ hằng ngày đã xong (hoặc đã bỏ): không nhập được
  let endView = null; // ván đang hiện trong hộp Kết quả
  let pending = null; // việc chờ xác nhận bỏ ván

  /* ---------------- Thống kê ---------------- */

  function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const num = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
    const s = { played: num(raw.played), won: num(raw.won), dist: [0, 0, 0, 0, 0, 0], daily: {}, maxDaily: num(raw.maxDaily), lastN: null };
    if (Array.isArray(raw.dist)) for (let i = 0; i < ROWS; i++) s.dist[i] = num(raw.dist[i]);
    if (raw.daily && typeof raw.daily === 'object') {
      Object.keys(raw.daily).forEach((k) => {
        const d = raw.daily[k];
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && d && typeof d === 'object') s.daily[k] = d;
      });
    }
    if (Number.isInteger(raw.lastN) && raw.lastN >= 1 && raw.lastN <= ROWS) s.lastN = raw.lastN;
    return s;
  }
  const stats = loadStats();

  const todayKey = () => E.dateKey(new Date());
  const dayOffset = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return E.dateKey(d);
  };
  const dailyWon = (k) => !!(stats.daily[k] && stats.daily[k].won);

  /** Chuỗi ngày thắng từ hằng ngày: tính tới hôm nay (hoặc hôm qua nếu hôm nay chưa chơi). */
  function dailyStreak() {
    const today = todayKey();
    if (stats.daily[today] && !stats.daily[today].won) return 0;
    let i = stats.daily[today] ? 0 : -1;
    let n = 0;
    while (dailyWon(dayOffset(i))) {
      n++;
      i--;
    }
    return n;
  }

  /** Ghi kết quả một ván (thắng / thua / bỏ). */
  function record(g, quit) {
    const won = E.isWon(g);
    stats.played++;
    if (won) {
      stats.won++;
      stats.dist[g.guesses.length - 1]++;
      stats.lastN = g.guesses.length;
    } else {
      stats.lastN = null;
    }
    if (g.mode === 'daily') {
      stats.daily[g.date] = { won, n: g.guesses.length, g: g.guesses.slice(), hard: g.hard, quit: !!quit };
      // Ván cũ hơn 60 ngày chỉ giữ thắng / thua (đủ tính chuỗi), bỏ danh sách từ cho gọn
      const old = dayOffset(-60);
      Object.keys(stats.daily).forEach((k) => { if (k < old && stats.daily[k].g) stats.daily[k] = { won: !!stats.daily[k].won, n: stats.daily[k].n }; });
      stats.maxDaily = Math.max(stats.maxDaily, dailyStreak());
    }
    kit.store.write(keys.stats, stats);
  }

  /** Dựng lại ván hằng ngày đã chơi xong từ thống kê (để xem lại / chia sẻ). */
  function recordedDaily(k) {
    const d = stats.daily[k];
    if (!d || !Array.isArray(d.g)) return null;
    return E.fromJSON({ v: 1, mode: 'daily', date: k, answer: E.dailyAnswer(k), guesses: d.g, hard: !!d.hard });
  }

  /* ---------------- Lưu ---------------- */

  const inProgress = () => !!game && !frozen && game.guesses.length > 0 && !E.isOver(game);

  function writeSummary() {
    const today = todayKey();
    const streak = dailyStreak();
    const pct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: stats.played ? t('summary.note', { pct, streak }) : t('summary.none'),
      stats: stats.played ? [{ value: pct + '%', label: t('stats.winPct') }, { value: streak, label: t('stats.streak') }] : [],
      resume: inProgress()
        ? {
          title: game.mode === 'daily' ? t('summary.dailyTitle', { n: E.dayNumber(game.date) }) : t('mode.free'),
          detail: t('summary.resumeDetail', { n: game.guesses.length + 1 }),
          pct: game.guesses.length / ROWS,
        }
        : null,
      daily: { date: today, done: !!stats.daily[today], title: t('summary.dailyTitle', { n: E.dayNumber(today) }), streak },
      now: Date.now(),
    }));
  }
  function persist() {
    if (inProgress()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), typed });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Bàn chơi ---------------- */

  const board = $('board');
  const tiles = [];
  for (let r = 0; r < ROWS; r++) {
    const row = document.createElement('div');
    row.className = 'row';
    row.setAttribute('role', 'row');
    const cells = [];
    for (let c = 0; c < LEN; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.setAttribute('role', 'gridcell');
      tile.innerHTML = '<span class="tile-in"></span>';
      row.appendChild(tile);
      cells.push(tile);
    }
    board.appendChild(row);
    tiles.push(cells);
  }
  const rowEl = (r) => board.children[r];

  const keyboard = $('keyboard');
  const keyEls = {};
  KEYS.forEach((line) => {
    const row = document.createElement('div');
    row.className = 'kb-row';
    line.split('').forEach((ch) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'key';
      b.tabIndex = -1; // gõ bằng bàn phím thật; nút ảo cho chạm / chuột
      if (ch === '+') {
        b.classList.add('key-wide');
        b.dataset.key = 'enter';
        b.textContent = t('key.enter');
      } else if (ch === '-') {
        b.classList.add('key-wide');
        b.dataset.key = 'del';
        b.setAttribute('aria-label', t('key.del'));
        b.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 5H8.4a2 2 0 0 0-1.5.7L2 12l4.9 6.3a2 2 0 0 0 1.5.7H21a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1zm-3.3 10.3-1.4 1.4-2.8-2.8-2.8 2.8-1.4-1.4 2.8-2.8-2.8-2.8 1.4-1.4 2.8 2.8 2.8-2.8 1.4 1.4-2.8 2.8 2.8 2.8z"/></svg>';
      } else {
        b.dataset.key = ch;
        b.textContent = ch.toUpperCase();
        keyEls[ch] = b;
      }
      row.appendChild(b);
    });
    keyboard.appendChild(row);
  });

  const STATE_CLASS = ['c', 'p', 'a'];
  function setTile(tile, letter, state, label) {
    tile.firstChild.textContent = letter ? letter.toUpperCase() : '';
    tile.classList.toggle('filled', !!letter);
    STATE_CLASS.forEach((s) => tile.classList.toggle(s, s === state));
    tile.setAttribute('aria-label', label || (letter ? letter.toUpperCase() : ''));
  }
  const tileLabel = (letter, state) => t('tile.' + state, { l: letter.toUpperCase() });

  function render() {
    for (let r = 0; r < ROWS; r++) {
      const word = r < game.guesses.length ? game.guesses[r] : r === game.guesses.length && !frozen ? typed : '';
      const sc = r < game.guesses.length && r !== hiddenRow ? E.score(word, game.answer) : '';
      for (let c = 0; c < LEN; c++) setTile(tiles[r][c], word[c] || '', sc[c], sc ? tileLabel(word[c], sc[c]) : '');
      rowEl(r).setAttribute('aria-label', t('board.row', { n: r + 1 }));
    }
    renderKeys();
    renderModes();
    renderEndbar();
  }

  function renderKeys() {
    const shown = hiddenRow >= 0 ? Object.assign({}, game, { guesses: game.guesses.slice(0, hiddenRow) }) : game;
    const st = E.keyStates(shown);
    Object.keys(keyEls).forEach((ch) => {
      const b = keyEls[ch];
      STATE_CLASS.forEach((s) => b.classList.toggle(s, st[ch] === s));
      b.setAttribute('aria-label', st[ch] ? tileLabel(ch, st[ch]) : ch.toUpperCase());
    });
  }

  function renderModes() {
    document.querySelectorAll('#modes [data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === game.mode)));
    const k = game.mode === 'daily' ? game.date : todayKey();
    $('daily-no').textContent = '#' + E.dayNumber(k);
  }

  /** Thanh cuối ván thay cho bàn phím: đáp án, đếm ngược từ mới, nút Kết quả / chơi tiếp. */
  function renderEndbar() {
    const over = (frozen || E.isOver(game)) && hiddenRow < 0;
    keyboard.hidden = over;
    $('endbar').hidden = !over;
    if (!over) return;
    $('endbar-word').textContent = game.answer.toUpperCase();
    $('endbar-sub').textContent = endSub(game);
    $('btn-next').textContent = nextLabel(game);
  }

  function endTitle(g) {
    if (E.isWon(g)) return t('end.win.' + g.guesses.length);
    return E.isOver(g) ? t('end.lose') : t('end.quit');
  }
  function endSub(g) {
    if (g.mode === 'daily') return nextText(g);
    return t('end.free') + ' · ' + E.resultLabel(g);
  }
  /** Nút chơi tiếp: từ hằng ngày hôm nay nếu chưa chơi, không thì từ tự do mới. */
  const nextLabel = (g) => (!stats.daily[todayKey()] && !(g.mode === 'daily' && g.date === todayKey()) ? t('end.playDaily') : g.mode === 'free' ? t('end.newFree') : t('end.playFree'));

  /** Đếm ngược tới nửa đêm theo giờ máy; xem từ hằng ngày của hôm trước thì báo đã có từ mới. */
  function nextText(g) {
    if (g && g.mode === 'daily' && g.date !== todayKey() && !stats.daily[todayKey()]) return t('end.nextReady');
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const s = Math.max(0, Math.floor((next - now) / 1000));
    const p = (n) => String(n).padStart(2, '0');
    return t('end.next', { time: p(Math.floor(s / 3600)) + ':' + p(Math.floor((s % 3600) / 60)) + ':' + p(s % 60) });
  }
  setInterval(() => {
    if (!$('endbar').hidden && game.mode === 'daily') $('endbar-sub').textContent = endSub(game);
    if (!$('modal-end').hidden && endView && endView.mode === 'daily') $('end-next').textContent = endNext(endView);
    if (!$('modal-stats').hidden && !$('stats-next').hidden) $('stats-next').textContent = nextText(null);
  }, 1000);

  /* ---------------- Ô tự co theo khung ---------------- */

  const stage = $('stage');
  function fit() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const gap = 6;
    const size = Math.floor(Math.max(18, Math.min((w - gap * (LEN - 1)) / LEN, (h - gap * (ROWS - 1)) / ROWS, 66)));
    board.style.setProperty('--tile', size + 'px');
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);
  window.addEventListener('resize', fit);

  /* ---------------- Nhập ---------------- */

  const canType = () => !!game && !busy && !frozen && !E.isOver(game) && !kit.modal.current();

  function addLetter(ch) {
    if (!canType() || typed.length >= LEN) return;
    typed += ch;
    const tile = tiles[game.guesses.length][typed.length - 1];
    render();
    if (!reduced()) {
      tile.classList.remove('pop');
      void tile.offsetWidth; // chạy lại hiệu ứng
      tile.classList.add('pop');
    }
    kit.sfx('tap');
  }
  function delLetter() {
    if (!canType() || !typed) return;
    typed = typed.slice(0, -1);
    render();
  }

  function shake(msg) {
    kit.toast(msg, 1600);
    kit.sfx('error');
    const row = rowEl(game.guesses.length);
    if (reduced()) return;
    row.classList.remove('shake');
    void row.offsetWidth;
    row.classList.add('shake');
  }

  function submit() {
    if (!canType()) return;
    const r = E.guess(game, typed);
    if (!r.ok) {
      if (r.error === 'short') shake(t('err.short'));
      else if (r.error === 'unknown') shake(t('err.unknown'));
      else if (r.error === 'hardPos') shake(t('err.hardPos', { pos: r.pos + 1, l: r.letter.toUpperCase() }));
      else if (r.error === 'hardHas') shake(t('err.hardHas', { l: r.letter.toUpperCase() }));
      return;
    }
    const row = game.guesses.length;
    game = r.game;
    typed = '';
    // Chốt kết quả ngay (lưu + báo cổng), hiệu ứng lật chạy sau
    if (E.isOver(game)) {
      record(game, false);
      kit.sdk.end({ mode: game.mode, won: E.isWon(game), assisted: false });
    }
    persist();
    reveal(row);
  }

  /** Lật từng ô của hàng vừa đoán, xong thì tô bàn phím và báo kết quả. */
  function reveal(row) {
    const word = game.guesses[row];
    const sc = E.score(word, game.answer);
    $('sr-live').textContent = word.toUpperCase() + ': ' + sc.split('').map((s, i) => tileLabel(word[i], s)).join('; ');
    const done = () => {
      hiddenRow = -1;
      busy = false;
      render();
      afterReveal(row);
    };
    if (reduced()) {
      kit.sfx('flip');
      done();
      return;
    }
    busy = true;
    hiddenRow = row;
    render();
    tiles[row].forEach((tile, i) => {
      setTimeout(() => {
        tile.classList.add('flip');
        kit.sfx('flip');
        setTimeout(() => setTile(tile, word[i], sc[i], tileLabel(word[i], sc[i])), 160);
        setTimeout(() => tile.classList.remove('flip'), 340);
      }, i * FLIP_MS);
    });
    setTimeout(done, (LEN - 1) * FLIP_MS + 380);
  }

  function afterReveal(row) {
    if (!E.isOver(game)) return;
    if (E.isWon(game)) {
      kit.sfx('win');
      kit.confetti();
      if (!reduced()) {
        tiles[row].forEach((tile, i) => {
          tile.style.animationDelay = i * 90 + 'ms';
          tile.classList.add('bounce');
          setTimeout(() => {
            tile.classList.remove('bounce');
            tile.style.animationDelay = '';
          }, 1000 + i * 90);
        });
      }
    } else {
      kit.sfx('lose');
      kit.toast(game.answer.toUpperCase(), 2400);
    }
    const g = game;
    setTimeout(() => { if (game === g && !kit.modal.current()) openEnd(g); }, reduced() ? 300 : 1300);
  }

  /* ---------------- Luồng ván ---------------- */

  function startGame(g) {
    game = g;
    typed = '';
    frozen = false;
    hiddenRow = -1;
    busy = false;
    kit.sdk.start(g.mode);
    persist();
    render();
  }
  const startDaily = () => startGame(E.newGame({ mode: 'daily', date: todayKey(), hard: !!kit.settings.get().hard }));
  const startFree = () => startGame(E.newGame({ mode: 'free', seed: (Math.random() * 4294967296) >>> 0, hard: !!kit.settings.get().hard }));

  /** Hiện lại từ hằng ngày đã chơi xong (không mở ván mới, không báo cổng). */
  function showRecorded(g) {
    game = g;
    typed = '';
    frozen = true;
    hiddenRow = -1;
    persist();
    render();
  }

  /** Bỏ ván đang dở: tính thua và báo cổng. */
  function abandon() {
    if (!inProgress()) return;
    const g = game;
    record(g, true);
    kit.sdk.end({ mode: g.mode, won: false, assisted: false });
    frozen = true; // ván cũ không còn chơi được nữa
  }

  /** Làm `fn` (mở ván khác); ván đang dở thì hỏi trước vì bỏ ván tính là thua. */
  function guard(fn) {
    if (!inProgress()) return fn();
    pending = fn;
    $('confirm-text').textContent = game.mode === 'daily' ? t('confirm.daily') : t('confirm.free');
    kit.modal.open('modal-confirm');
  }

  function chooseDaily() {
    const today = todayKey();
    if (game.mode === 'daily' && game.date === today) {
      if (frozen || E.isOver(game)) openEnd(game);
      return;
    }
    if (stats.daily[today]) {
      // Hôm nay đã chơi: xem lại kết quả; bàn chỉ đổi khi không có ván dở
      const g = recordedDaily(today);
      if (!g) return;
      if (!inProgress()) showRecorded(g);
      openEnd(g);
      return;
    }
    guard(() => {
      abandon();
      startDaily();
    });
  }
  function chooseFree(fresh) {
    if (!fresh && game.mode === 'free' && !frozen && !E.isOver(game)) return;
    guard(() => {
      abandon();
      startFree();
    });
  }
  /** Nút chơi tiếp sau ván: từ hằng ngày hôm nay nếu chưa chơi, không thì từ tự do mới. */
  function playNext() {
    kit.modal.close('modal-end');
    const today = todayKey();
    if (!stats.daily[today] && !(game.mode === 'daily' && game.date === today)) chooseDaily();
    else chooseFree(true);
  }

  /* ---------------- Kết quả / chia sẻ ---------------- */

  function openEnd(g) {
    endView = g;
    $('end-title').textContent = endTitle(g);
    $('end-meta').textContent = (g.mode === 'daily' ? t('end.dailyNo', { n: E.dayNumber(g.date) }) : t('end.free')) + ' · ' + E.resultLabel(g);
    $('end-word').textContent = g.answer.toUpperCase();
    const mini = $('end-mini');
    mini.innerHTML = '';
    g.guesses.forEach((w) => {
      const row = document.createElement('div');
      E.score(w, g.answer).split('').forEach((s) => {
        const sq = document.createElement('span');
        sq.className = 'sq ' + s;
        row.appendChild(sq);
      });
      mini.appendChild(row);
    });
    const daily = g.mode === 'daily';
    $('end-next').hidden = !daily;
    if (daily) $('end-next').textContent = endNext(g);
    $('share-text').hidden = true;
    $('btn-end-next').textContent = nextLabel(g);
    kit.modal.open('modal-end');
  }

  const endNext = (g) => nextText(g) + (g.date === todayKey() ? ' · ' + t('end.streak', { n: dailyStreak() }) : '');

  function shareText(g) {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark'
      || (document.documentElement.getAttribute('data-theme') !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    const head = g.mode === 'daily' ? t('app.name') + ' #' + E.dayNumber(g.date) : t('app.name') + ' (' + t('mode.free') + ')';
    return head + ' ' + E.resultLabel(g) + '\n\n' + E.shareGrid(g, { dark, contrast: !!kit.settings.get().contrast });
  }

  function copyFallback(text) {
    const ta = $('share-text');
    ta.value = text;
    ta.hidden = false;
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    if (ok) ta.hidden = true;
    kit.toast(ok ? t('share.copied') : t('share.failed'));
  }
  function share() {
    if (!endView) return;
    const text = shareText(endView);
    kit.sfx('tap');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => kit.toast(t('share.copied')), () => copyFallback(text));
    } else {
      copyFallback(text);
    }
  }

  function renderStats() {
    const pct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-pct').textContent = pct;
    $('stats-streak').textContent = kit.i18n.fmtNumber(dailyStreak());
    $('stats-max').textContent = kit.i18n.fmtNumber(Math.max(stats.maxDaily, dailyStreak()));
    const max = Math.max(1, ...stats.dist);
    const list = $('stats-dist');
    list.innerHTML = '';
    stats.dist.forEach((c, i) => {
      const li = document.createElement('li');
      li.setAttribute('aria-label', t('stats.distLabel', { n: i + 1, c }));
      li.innerHTML = '<span class="dist-n">' + (i + 1) + '</span><span class="dist-track"><span class="dist-bar"></span></span>';
      const bar = li.querySelector('.dist-bar');
      bar.style.width = Math.max(8, (c / max) * 100) + '%';
      bar.textContent = kit.i18n.fmtNumber(c);
      if (stats.lastN === i + 1) li.classList.add('last');
      list.appendChild(li);
    });
    const doneToday = !!stats.daily[todayKey()];
    $('stats-next').hidden = !doneToday;
    if (doneToday) $('stats-next').textContent = nextText(null);
  }

  /* ---------------- Cài đặt ---------------- */

  function applyContrast() {
    document.documentElement.classList.toggle('contrast', !!kit.settings.get().contrast);
  }
  function onSetting(key, value) {
    if (key === 'contrast') applyContrast();
    if (key === 'hard' && game) {
      if (!frozen && !E.isOver(game) && game.guesses.length === 0) {
        game = E.setHard(game, value);
        persist();
      } else {
        kit.toast(t('toast.hardNext'));
      }
    }
  }

  /* ---------------- Sự kiện ---------------- */

  keyboard.addEventListener('mousedown', (e) => e.preventDefault()); // không lấy focus khỏi trang
  keyboard.addEventListener('click', (e) => {
    const b = e.target.closest('[data-key]');
    if (!b) return;
    const k = b.dataset.key;
    if (k === 'enter') submit();
    else if (k === 'del') delLetter();
    else addLetter(k);
  });
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    if (e.key === 'Enter') {
      // Enter luôn là "đoán" (kể cả khi nút khác đang focus); kích hoạt nút bằng Space
      if (!canType()) return;
      submit();
    } else if (e.key === 'Backspace') {
      delLetter();
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      addLetter(e.key.toLowerCase());
    } else {
      return;
    }
    e.preventDefault();
  });

  $('modes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b || busy) return;
    if (b.dataset.mode === 'daily') chooseDaily();
    else chooseFree(false);
  });
  $('btn-new').addEventListener('click', () => { if (!busy) chooseFree(true); });
  $('btn-confirm').addEventListener('click', () => {
    kit.modal.close('modal-confirm');
    const fn = pending;
    pending = null;
    if (fn) fn();
  });
  $('btn-result').addEventListener('click', () => openEnd(game));
  $('btn-next').addEventListener('click', playNext);
  $('btn-end-next').addEventListener('click', playNext);
  $('btn-share').addEventListener('click', share);
  $('btn-stats').addEventListener('click', renderStats);
  kit.onLeave(persist);

  /* ---------------- Khởi động ---------------- */

  applyContrast();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && E.fromJSON(saved.game);
  if (restored && restored.guesses.length > 0 && !E.isOver(restored)) {
    // Mở lại ván dở (kể cả từ hằng ngày của hôm trước)
    game = restored;
    typed = typeof saved.typed === 'string' && /^[a-z]{0,4}$/.test(saved.typed) ? saved.typed : '';
    kit.sdk.start(game.mode, true);
    kit.toast(t('toast.saved'));
    persist();
    render();
  } else if (stats.daily[todayKey()] && recordedDaily(todayKey())) {
    // Hôm nay đã chơi từ hằng ngày: hiện lại kết quả, chờ người chơi chọn chơi tự do
    showRecorded(recordedDaily(todayKey()));
  } else if (stats.daily[todayKey()]) {
    startFree();
  } else {
    startDaily();
  }
  fit();
  if (!kit.settings.get().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
})();
