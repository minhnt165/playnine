/* =====================================================================
 * Dò Mìn - App: vẽ bàn mìn, xử lý chạm / chuột / bàn phím, đồng hồ,
 * lưu ván, thống kê, ván hằng ngày, tóm tắt cho cổng PlayNine.
 * Cần engine.js nạp trước (window.Minesweeper). Chữ hiển thị đi qua I18N.t (i18n.js).
 * ===================================================================== */
(() => {
  'use strict';

  const M = window.Minesweeper;
  const APP_VERSION = '1.3.1';
  const PN = window.PlayNine || null; // SDK PlayNine: chỉ có khi chạy trong cổng
  PN && PN.init({ gameId: 'minesweeper' });
  const t = I18N.t;
  // Âm thanh / pháo giấy của SDK: SDK cũ hoặc thiếu thì bỏ qua, không bao giờ làm hỏng game
  const sfx = (name, o) => { try { window.PlayNine?.sfx?.play(name, o); } catch (e) { /* bỏ qua */ } };
  const confetti = () => { try { window.PlayNine?.fx?.confetti(); } catch (e) { /* bỏ qua */ } };

  // Điền chữ tĩnh theo ngôn ngữ trước khi vẽ phần động
  I18N.apply();

  /* Mọi khóa localStorage đều có tiền tố playnine-minesweeper- */
  const PREFIX = 'playnine-minesweeper-';
  const SAVE_KEY = PREFIX + 'save-v1';
  const SETTINGS_KEY = PREFIX + 'settings-v1';
  const STATS_KEY = PREFIX + 'stats-v1';
  const SUMMARY_KEY = PREFIX + 'summary-v1';

  const LONG_PRESS_MS = 350; // nhấn giữ bao lâu thì cắm cờ
  const MOVE_TOLERANCE = 10; // px: kéo xa hơn thì coi là cuộn, không phải chạm
  const AUTOSAVE_MS = 5000; // đang chơi thì lưu ván + tóm tắt định kỳ
  const ZOOM_THRESHOLD = 26; // ô nhỏ hơn mức này thì hiện nút phóng to
  const ZOOM_CELL = 34; // cỡ ô khi phóng to
  const MAX_CELL = 44;
  const MIN_CELL = 10;
  const LEVEL_ORDER = ['easy', 'medium', 'hard'];
  const BUCKETS = ['easy', 'medium', 'hard', 'custom'];

  const $ = (id) => document.getElementById(id);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------- localStorage (luôn bọc try/catch) ---------------- */
  function readJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (e) {
      return null;
    }
  }
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* bỏ qua: hết dung lượng hoặc bị chặn */ }
  }
  function removeKey(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) { /* bỏ qua */ }
  }

  /* ---------------- Tiện ích thời gian ---------------- */
  const pad2 = (n) => String(n).padStart(2, '0');
  const dateKeyOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const todayKey = () => dateKeyOf(new Date());
  function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
  }
  function formatDate(key) {
    const [y, m, d] = key.split('-');
    // Tiếng Việt giữ dạng dd/mm
    if (I18N.lang === 'vi') return `${d}/${m}`;
    return I18N.fmtDate(new Date(Number(y), Number(m) - 1, Number(d)), { month: 'short', day: 'numeric' });
  }

  /* ---------------- Cài đặt ---------------- */
  const DEFAULT_SETTINGS = {
    theme: 'auto', // auto | light | dark
    question: false, // dấu ? (tắt mặc định)
    vibrate: true,
    level: 'easy', // mức chơi gần nhất
    custom: { w: 20, h: 12, mines: 40 },
  };
  let settings = loadSettings();

  function loadSettings() {
    const s = Object.assign({}, DEFAULT_SETTINGS, { custom: Object.assign({}, DEFAULT_SETTINGS.custom) });
    const raw = readJSON(SETTINGS_KEY);
    if (raw && typeof raw === 'object') {
      if (['auto', 'light', 'dark'].indexOf(raw.theme) >= 0) s.theme = raw.theme;
      if (typeof raw.question === 'boolean') s.question = raw.question;
      if (typeof raw.vibrate === 'boolean') s.vibrate = raw.vibrate;
      if (LEVEL_ORDER.indexOf(raw.level) >= 0 || raw.level === 'custom') s.level = raw.level;
      if (raw.custom && typeof raw.custom === 'object') s.custom = M.clampCustom(raw.custom.w, raw.custom.h, raw.custom.mines);
    }
    return s;
  }
  function saveSettings() {
    writeJSON(SETTINGS_KEY, settings);
  }

  /* ---------------- Thống kê ---------------- */
  // { levels: { easy: { played, won, best, total }, ... }, daily: { played, won, completed: { 'YYYY-MM-DD': giây } } }
  let stats = loadStats();

  function emptyBucket() {
    return { played: 0, won: 0, best: null, total: 0 };
  }
  function emptyStats() {
    const levels = {};
    BUCKETS.forEach((k) => { levels[k] = emptyBucket(); });
    return { levels, daily: { played: 0, won: 0, completed: {} } };
  }
  function loadStats() {
    const s = emptyStats();
    const raw = readJSON(STATS_KEY);
    if (!raw || typeof raw !== 'object') return s;
    const num = (x) => (typeof x === 'number' && isFinite(x) && x >= 0 ? x : 0);
    BUCKETS.forEach((k) => {
      const b = raw.levels && raw.levels[k];
      if (!b) return;
      s.levels[k] = {
        played: num(b.played),
        won: num(b.won),
        best: typeof b.best === 'number' ? b.best : null,
        total: num(b.total),
      };
    });
    if (raw.daily && typeof raw.daily === 'object') {
      s.daily.played = num(raw.daily.played);
      s.daily.won = num(raw.daily.won);
      if (raw.daily.completed && typeof raw.daily.completed === 'object') {
        Object.keys(raw.daily.completed).forEach((k) => {
          if (typeof raw.daily.completed[k] === 'number') s.daily.completed[k] = raw.daily.completed[k];
        });
      }
    }
    return s;
  }
  function saveStats() {
    writeJSON(STATS_KEY, stats);
  }

  /** Thời gian thắng ván hằng ngày của ngày key (giây), hoặc null nếu chưa thắng. */
  function dailyTime(key) {
    const v = stats.daily.completed[key];
    return typeof v === 'number' ? v : null;
  }
  /** Số ngày liên tiếp đã thắng ván hằng ngày (tính tới hôm nay hoặc hôm qua). */
  function dailyStreak() {
    const d = new Date();
    if (dailyTime(dateKeyOf(d)) === null) d.setDate(d.getDate() - 1);
    let n = 0;
    while (dailyTime(dateKeyOf(d)) !== null) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  /* ---------------- Ván đang chơi ---------------- */
  // session: { game, kind: 'easy'|'medium'|'hard'|'custom'|'daily', daily: 'YYYY-MM-DD'|null, elapsed: ms, counted }
  let session = null;
  let clockStart = null; // performance.now() khi đồng hồ đang chạy
  let flagMode = false;
  let zoomed = false;
  let cursor = 0; // ô (chỉ số logic) con trỏ bàn phím đang đứng
  let lastSaveAt = 0;
  let resultTimer = null;
  let booted = false; // chỉ phát tiếng "bắt đầu" khi người chơi chọn ván mới, không phát lúc mở trang

  const game = () => session.game;
  const isOver = () => session.game.status === 'won' || session.game.status === 'lost';

  function kindLabel(kind) {
    return t('level.' + kind);
  }
  function sessionLabel() {
    const g = game();
    if (session.kind === 'custom') return t('level.customSize', { w: g.w, h: g.h });
    return kindLabel(session.kind);
  }

  function elapsedMs() {
    if (!session) return 0;
    return session.elapsed + (clockStart !== null ? performance.now() - clockStart : 0);
  }
  function startClock() {
    if (clockStart === null && session && game().status === 'playing') clockStart = performance.now();
  }
  function stopClock() {
    if (clockStart !== null) {
      session.elapsed += performance.now() - clockStart;
      clockStart = null;
    }
  }

  function createSession(kind, opts) {
    let g;
    let daily = null;
    if (kind === 'daily') {
      daily = (opts && opts.date) || todayKey();
      g = M.createDaily(daily);
    } else if (kind === 'custom') {
      g = M.createGame(settings.custom);
    } else {
      g = M.createGame(M.LEVELS[kind]);
    }
    return { game: g, kind, daily, elapsed: 0, counted: false };
  }

  function newGame(kind, opts) {
    stopClock();
    clearTimeout(resultTimer);
    closeModal('modal-result');
    if (kind !== 'daily') {
      settings.level = kind;
      saveSettings();
    }
    session = createSession(kind, opts);
    flagMode = false;
    zoomed = false;
    const g = game();
    cursor = Math.floor(g.h / 2) * g.w + Math.floor(g.w / 2);
    persist();
    buildBoard();
    renderAll();
    writeSummary();
    if (booted) sfx('start');
    PN && session.kind !== 'custom' && PN.gameStart({ mode: session.daily ? 'daily' : session.kind });
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  function persist() {
    lastSaveAt = Date.now();
    if (!session || isOver()) {
      removeKey(SAVE_KEY);
      return;
    }
    writeJSON(SAVE_KEY, {
      v: 1,
      kind: session.kind,
      daily: session.daily,
      elapsed: Math.round(elapsedMs()),
      counted: session.counted,
      cursor,
      game: session.game,
      savedAt: Date.now(),
    });
  }

  function restoreSession() {
    const raw = readJSON(SAVE_KEY);
    if (!raw || raw.v !== 1) return null;
    const kinds = LEVEL_ORDER.concat(['custom', 'daily']);
    if (kinds.indexOf(raw.kind) < 0) return null;
    const g = M.restore(raw.game);
    if (!g || g.status === 'won' || g.status === 'lost') return null;
    if (raw.kind === 'daily' && (typeof raw.daily !== 'string' || g.seed !== M.dailySeed(raw.daily))) return null;
    const s = {
      game: g,
      kind: raw.kind,
      daily: raw.kind === 'daily' ? raw.daily : null,
      elapsed: typeof raw.elapsed === 'number' && raw.elapsed > 0 ? raw.elapsed : 0,
      counted: !!raw.counted,
    };
    cursor = Number.isInteger(raw.cursor) && raw.cursor >= 0 && raw.cursor < g.w * g.h ? raw.cursor : 0;
    return s;
  }

  /* ---------------- Tóm tắt cho cổng PlayNine ---------------- */
  function totals() {
    let played = stats.daily.played;
    let won = stats.daily.won;
    BUCKETS.forEach((k) => {
      played += stats.levels[k].played;
      won += stats.levels[k].won;
    });
    return { played, won };
  }

  /** Kỷ lục ở mức khó nhất đã từng thắng. */
  function headlineBest() {
    for (let i = LEVEL_ORDER.length - 1; i >= 0; i--) {
      const k = LEVEL_ORDER[i];
      if (typeof stats.levels[k].best === 'number') return { label: t('level.' + k), time: stats.levels[k].best };
    }
    return null;
  }

  function writeSummary() {
    const { played, won } = totals();
    const best = headlineBest();
    const streak = dailyStreak();
    const today = todayKey();
    const D = M.LEVELS[M.DAILY_LEVEL];

    let note;
    if (!played) note = t('summary.noGames', { w: D.w, h: D.h });
    else if (!won) note = t('summary.noWins', { n: played });
    else if (best) note = t('summary.winsBest', { n: won, level: best.label, time: formatTime(best.time) });
    else note = t('summary.wins', { n: won });

    const headline = [];
    if (played) {
      headline.push({ value: String(won), label: t('summary.statWins') });
      headline.push({ value: Math.round((won / played) * 100) + '%', label: t('summary.statRate') });
      if (best) headline.push({ value: formatTime(best.time), label: t('summary.statBest', { level: best.label }) });
      else if (streak) headline.push({ value: String(streak), label: t('summary.statStreak') });
    }

    let resume = null;
    if (session && game().status === 'playing') {
      const pct = M.progress(game());
      resume = {
        title: session.kind === 'daily' ? t('summary.resumeDaily') : t('summary.resume', { level: sessionLabel() }),
        detail: t('summary.resumeDetail', { pct: Math.floor(pct * 100), time: formatTime(elapsedMs() / 1000) }),
        pct: Math.round(pct * 1000) / 1000,
      };
    }

    writeJSON(SUMMARY_KEY, {
      v: 1,
      updatedAt: Date.now(),
      played,
      won,
      note,
      stats: headline,
      resume,
      daily: {
        date: today,
        title: t('summary.dailyTitle', { w: D.w, h: D.h }),
        done: dailyTime(today) !== null,
        streak,
      },
    });
  }

  /* ---------------- Bố cục bàn mìn ---------------- */
  const boardWrap = $('board-wrap');
  const boardEl = $('board');
  let cellEls = []; // theo chỉ số logic
  let view = { transposed: false, cols: 0, rows: 0, cell: 32, built: '' };

  /** Vị trí hiển thị (hàng, cột) của ô logic idx. Bàn xoay thì đổi hàng ↔ cột. */
  function displayPos(idx) {
    const g = game();
    const r = Math.floor(idx / g.w);
    const c = idx % g.w;
    return view.transposed ? [c, r] : [r, c];
  }
  function idxAt(dr, dc) {
    const g = game();
    return view.transposed ? dc * g.w + dr : dr * g.w + dc;
  }

  /** Cỡ ô lớn nhất để bàn cols x rows vừa khung. */
  function fitCell(cols, rows, W, H) {
    const gap = Math.max(cols, rows) > 20 ? 1 : 2;
    const pad = gap === 1 ? 4 : 6;
    const cw = (W - pad * 2 - (cols - 1) * gap) / cols;
    const ch = (H - pad * 2 - (rows - 1) * gap) / rows;
    return { cell: Math.floor(Math.min(cw, ch)), gap, pad };
  }

  /** Tính cỡ ô theo khung hiện tại; bàn dài hơn rộng trên màn hình dọc thì xoay 90°. */
  function layout() {
    if (!session) return;
    const g = game();
    const W = boardWrap.clientWidth;
    const H = boardWrap.clientHeight;
    if (!W || !H) return;
    const normal = fitCell(g.w, g.h, W, H);
    const turned = g.w !== g.h ? fitCell(g.h, g.w, W, H) : null;
    const transposed = !!turned && turned.cell > normal.cell;
    const fit = transposed ? turned : normal;
    let cell = Math.max(MIN_CELL, Math.min(MAX_CELL, fit.cell));
    const canZoom = cell < ZOOM_THRESHOLD;
    $('btn-zoom').hidden = !canZoom;
    if (!canZoom) zoomed = false;
    if (zoomed) cell = ZOOM_CELL;
    $('btn-zoom').setAttribute('aria-pressed', String(zoomed));
    $('btn-zoom').setAttribute('aria-label', zoomed ? t('tool.zoomOut') : t('tool.zoomIn'));
    $('zoom-plus').setAttribute('d', zoomed ? 'M7.5 10.5h6' : 'M10.5 7.5v6M7.5 10.5h6');
    boardWrap.classList.toggle('zoomed', zoomed);

    if (transposed !== view.transposed) {
      view.transposed = transposed;
      buildBoard();
    }
    view.cell = cell;
    boardEl.style.setProperty('--cell', cell + 'px');
    boardEl.style.setProperty('--gap', fit.gap + 'px');
    boardEl.style.setProperty('--pad', fit.pad + 'px');
  }

  /** Tạo lại các ô DOM theo thứ tự hiển thị (hàng → cột). */
  function buildBoard() {
    const g = game();
    view.cols = view.transposed ? g.h : g.w;
    view.rows = view.transposed ? g.w : g.h;
    boardEl.style.setProperty('--cols', view.cols);
    boardEl.setAttribute('aria-rowcount', view.rows);
    boardEl.setAttribute('aria-colcount', view.cols);
    const frag = document.createDocumentFragment();
    cellEls = new Array(g.w * g.h);
    for (let dr = 0; dr < view.rows; dr++) {
      const row = document.createElement('div');
      row.className = 'row';
      row.setAttribute('role', 'row');
      for (let dc = 0; dc < view.cols; dc++) {
        const idx = idxAt(dr, dc);
        const el = document.createElement('div');
        el.className = 'cell';
        el.id = 'c' + idx;
        el.setAttribute('role', 'gridcell');
        el.dataset.idx = idx;
        el._key = '';
        cellEls[idx] = el;
        row.appendChild(el);
      }
      frag.appendChild(row);
    }
    boardEl.textContent = '';
    boardEl.appendChild(frag);
    view.built = g.w + 'x' + g.h;
    renderBoard();
    updateCursor();
  }

  /* ---------------- Vẽ ---------------- */
  const ICON = {
    flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-flag"/></svg>',
    mine: '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-mine"/></svg>',
    wrong: '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-flag"/></svg><svg class="cross" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-cross"/></svg>',
  };

  const FACES = {
    smile: '<path d="M13 24.5q7 6.5 14 0" fill="none" stroke="#1d1711" stroke-width="2.6" stroke-linecap="round"/><circle cx="14.5" cy="16" r="2.4" fill="#1d1711"/><circle cx="25.5" cy="16" r="2.4" fill="#1d1711"/>',
    oh: '<circle cx="20" cy="26.5" r="3.4" fill="#1d1711"/><circle cx="14.5" cy="15.5" r="2.6" fill="#1d1711"/><circle cx="25.5" cy="15.5" r="2.6" fill="#1d1711"/>',
    won: '<path d="M7.5 13.5h25v2.5l-2.2 4.5h-6.6l-2.4-4.3h-2.6l-2.4 4.3H9.7l-2.2-4.5z" fill="#1d1711"/><path d="M12.5 25q7.5 6.5 15 0" fill="none" stroke="#1d1711" stroke-width="2.6" stroke-linecap="round"/>',
    lost: '<path d="M11.5 13l5 5M16.5 13l-5 5M23.5 13l5 5M28.5 13l-5 5" stroke="#1d1711" stroke-width="2.4" stroke-linecap="round"/><path d="M13.5 29q6.5-5.5 13 0" fill="none" stroke="#1d1711" stroke-width="2.6" stroke-linecap="round"/>',
  };
  function faceSvg(kind) {
    return '<circle cx="20" cy="20" r="17" fill="#f0cd7a" stroke="#c9902d" stroke-width="1.6"/>' + FACES[kind];
  }
  let faceKind = '';
  function setFace(kind) {
    if (kind === faceKind) return;
    faceKind = kind;
    $('face-svg').innerHTML = faceSvg(kind);
    $('btn-restart').dataset.face = kind;
  }

  function cellView(idx) {
    const g = game();
    const st = g.state[idx];
    const over = g.status === 'won' || g.status === 'lost';
    if (st === M.OPEN) {
      if (g.mine[idx]) {
        return { cls: 'cell open mine' + (idx === g.exploded ? ' exploded' : ''), html: ICON.mine, label: t('cell.exploded') };
      }
      const n = g.adj[idx];
      if (!n) return { cls: 'cell open', html: '', label: t('cell.empty') };
      return { cls: `cell open num n${n}`, html: String(n), label: t('cell.number', { n }) };
    }
    if (g.status === 'lost') {
      if (st === M.FLAG && !g.mine[idx]) return { cls: 'cell wrong', html: ICON.wrong, label: t('cell.wrongFlag') };
      if (g.mine[idx] && st !== M.FLAG) return { cls: 'cell mine', html: ICON.mine, label: t('cell.mine') };
    }
    if (st === M.FLAG) return { cls: 'cell flag' + (over ? '' : ' hidden'), html: ICON.flag, label: t('cell.flag') };
    if (st === M.QUESTION) return { cls: 'cell question hidden', html: '?', label: t('cell.question') };
    return { cls: over ? 'cell' : 'cell hidden', html: '', label: t('cell.hidden') };
  }

  function renderCell(idx) {
    const el = cellEls[idx];
    if (!el) return;
    const v = cellView(idx);
    const extra = idx === cursor ? ' cursor' : '';
    const key = v.cls + extra + '|' + v.html;
    if (el._key === key) return;
    el._key = key;
    el.className = v.cls + extra;
    el.innerHTML = v.html;
    const [dr, dc] = displayPos(idx);
    el.setAttribute('aria-label', t('cell.aria', { r: dr + 1, c: dc + 1, label: v.label }));
  }

  function renderBoard() {
    for (let i = 0; i < cellEls.length; i++) renderCell(i);
  }

  let shownLeft = null;
  function renderHud() {
    const g = game();
    const left = M.minesLeft(g);
    const ml = $('mines-left');
    if (shownLeft !== null && left !== shownLeft && !reduceMotion.matches) {
      ml.classList.remove('bump');
      void ml.offsetWidth;
      ml.classList.add('bump');
    }
    shownLeft = left;
    ml.textContent = String(left);
    ml.classList.toggle('neg', left < 0);
    $('level-label').textContent = sessionLabel();
    renderTimer();
    setFace(g.status === 'won' ? 'won' : g.status === 'lost' ? 'lost' : 'smile');
    const fm = $('btn-flag-mode');
    fm.setAttribute('aria-pressed', String(flagMode));
    $('flag-mode-state').textContent = flagMode ? t('tool.on') : t('tool.off');
  }

  let shownSec = -1;
  function renderTimer() {
    const sec = Math.floor(elapsedMs() / 1000);
    if (sec === shownSec) return;
    shownSec = sec;
    $('timer').textContent = formatTime(sec);
  }

  function renderAll() {
    renderBoard();
    renderHud();
    layout();
  }

  /* ---------------- Con trỏ bàn phím ---------------- */
  function updateCursor() {
    if (!cellEls[cursor]) cursor = 0;
    const prev = boardEl.querySelector('.cell.cursor');
    if (prev && Number(prev.dataset.idx) !== cursor) renderCell(Number(prev.dataset.idx));
    renderCell(cursor);
    boardEl.setAttribute('aria-activedescendant', 'c' + cursor);
  }
  function moveCursor(ddr, ddc) {
    const [dr, dc] = displayPos(cursor);
    const nr = Math.min(view.rows - 1, Math.max(0, dr + ddr));
    const nc = Math.min(view.cols - 1, Math.max(0, dc + ddc));
    cursor = idxAt(nr, nc);
    updateCursor();
    if (zoomed) cellEls[cursor].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /* ---------------- Hành động ---------------- */
  function vibrate(ms) {
    if (!settings.vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* bỏ qua */ }
  }

  /** Ván vừa bắt đầu (cú mở đầu tiên): tính vào số ván đã chơi, chạy đồng hồ. */
  function onGameStarted() {
    if (!session.counted) {
      session.counted = true;
      if (session.kind === 'daily') stats.daily.played++;
      else stats.levels[session.kind].played++;
      saveStats();
    }
    startClock();
    writeSummary();
  }

  function afterMove(res, from) {
    const g = game();
    if (res && res.opened.length > 60) renderBoard();
    else if (res) res.opened.forEach(renderCell);
    renderHud();
    if (g.status === 'won') onWin(from);
    else if (g.status === 'lost') onLose();
    else {
      if (res && res.opened.length) {
        // Mở một ô: tiếng gõ (cao dần theo số); loang nhiều ô: tiếng lật, càng rộng càng cao
        const n = res.opened.length;
        if (n > 1) sfx('flip', { pitch: 1 + Math.min(n, 60) / 120 });
        else sfx('tap', { pitch: 1 + (g.adj[res.opened[0]] || 0) * 0.06 });
        animateOpen(res.opened, from);
      }
      persist();
    }
  }

  /** Ô vừa mở bật lên và sáng nhẹ, lan từ ô được bấm (tối đa 400 ô để không nặng máy). */
  function animateOpen(list, from) {
    if (reduceMotion.matches) return;
    let maxD = 0;
    list.slice(0, 400).forEach((i) => {
      const el = cellEls[i];
      if (!el) return;
      const d = Math.min(distance(from, i) * 22, 330);
      if (d > maxD) maxD = d;
      el.style.setProperty('--d', d + 'ms');
      el.classList.remove('anim-open');
      void el.offsetWidth;
      el.classList.add('anim-open');
    });
    setTimeout(() => list.forEach((i) => cellEls[i] && cellEls[i].classList.remove('anim-open')), maxD + 420);
  }

  function openCell(idx) {
    const g = game();
    if (isOver()) return;
    if (g.state[idx] === M.FLAG) return;
    const wasReady = g.status === 'ready';
    const res = M.reveal(g, idx, Math.random);
    if (wasReady && g.status !== 'ready') onGameStarted();
    afterMove(res, idx);
  }

  function chordCell(idx) {
    const g = game();
    const res = M.chord(g, idx);
    if (!res) return;
    if (res.blocked) {
      // Số cờ chưa khớp: nháy nhẹ các ô kề chưa mở để báo
      sfx('error', { volume: 0.5 });
      if (!reduceMotion.matches) {
        M.neighbors(g.w, g.h, idx).forEach((j) => {
          if (g.state[j] === M.HIDDEN || g.state[j] === M.QUESTION) {
            const el = cellEls[j];
            el.classList.remove('hint-blocked');
            void el.offsetWidth;
            el.classList.add('hint-blocked');
            setTimeout(() => el.classList.remove('hint-blocked'), 400);
          }
        });
      }
      return;
    }
    afterMove(res, idx);
  }

  function flagCell(idx, fromLongPress) {
    const g = game();
    if (isOver()) return;
    const next = M.toggleFlag(g, idx, settings.question);
    if (next === null) return;
    if (fromLongPress) vibrate(25);
    sfx(next === M.FLAG ? 'place' : 'tap', next === M.FLAG ? undefined : { pitch: next === M.QUESTION ? 1.3 : 0.8 });
    renderCell(idx);
    if (next === M.FLAG && !reduceMotion.matches && cellEls[idx]) {
      const el = cellEls[idx];
      el.classList.add('anim-flag');
      setTimeout(() => el.classList.remove('anim-flag'), 320);
    }
    renderHud();
    persist();
  }

  /** Thao tác chính (chạm / nhấp trái / Space): mở ô, mở nhanh trên ô số, hoặc cắm cờ khi bật chế độ cờ. */
  function primaryAction(idx) {
    if (!session || isOver()) return;
    const g = game();
    if (g.state[idx] === M.OPEN) {
      chordCell(idx);
      return;
    }
    if (flagMode) flagCell(idx, false);
    else openCell(idx);
  }

  /* ---------------- Thắng / thua ---------------- */
  function onWin(fromIdx) {
    stopClock();
    const sec = Math.max(1, Math.round(elapsedMs() / 1000));
    PN && session.kind !== 'custom' && PN.gameEnd({ mode: session.daily ? 'daily' : session.kind, timeMs: Math.round(elapsedMs()), won: true, assisted: false });
    let record = false;
    if (session.kind === 'daily') {
      stats.daily.won++;
      const prev = dailyTime(session.daily);
      record = prev === null || sec < prev;
      stats.daily.completed[session.daily] = prev === null ? sec : Math.min(prev, sec);
    } else {
      const b = stats.levels[session.kind];
      b.won++;
      b.total += sec;
      if (session.kind !== 'custom') {
        record = b.best === null || sec < b.best;
        if (record) b.best = sec;
      }
    }
    saveStats();
    persist();
    writeSummary();
    renderBoard();
    renderHud();
    sfx('win');
    const delay = animateWin(fromIdx);
    showResult(true, sec, record, delay);
  }

  function onLose() {
    stopClock();
    PN && session.kind !== 'custom' && PN.gameEnd({ mode: session.daily ? 'daily' : session.kind, won: false });
    saveStats();
    persist();
    writeSummary();
    renderBoard();
    renderHud();
    sfx('capture', { pitch: 0.7 }); // tiếng nổ; giai điệu thua phát khi hiện kết quả
    const delay = animateLose();
    showResult(false, Math.round(elapsedMs() / 1000), false, delay);
  }

  /** Khoảng cách (theo ô hiển thị) giữa hai ô, dùng để lan hoạt ảnh. */
  function distance(a, b) {
    const [ar, ac] = displayPos(a);
    const [br, bc] = displayPos(b);
    return Math.max(Math.abs(ar - br), Math.abs(ac - bc));
  }

  function animateWin(fromIdx) {
    if (reduceMotion.matches) return 300;
    const from = fromIdx >= 0 ? fromIdx : 0;
    let maxD = 0;
    for (let i = 0; i < cellEls.length; i++) {
      const d = Math.min(distance(from, i) * 30, 600);
      if (d > maxD) maxD = d;
      const el = cellEls[i];
      el.style.setProperty('--d', d + 'ms');
      el.classList.add('anim-win');
    }
    setTimeout(() => {
      cellEls.forEach((el) => el.classList.remove('anim-win'));
    }, maxD + 800);
    return Math.min(maxD + 500, 1100);
  }

  function animateLose() {
    if (reduceMotion.matches) return 300;
    const g = game();
    const from = g.exploded;
    let maxD = 0;
    for (let i = 0; i < cellEls.length; i++) {
      if (!g.mine[i] || i === from || g.state[i] === M.FLAG) continue;
      const d = Math.min(distance(from, i) * 40, 700);
      if (d > maxD) maxD = d;
      const el = cellEls[i];
      el.style.setProperty('--d', d + 'ms');
      el.classList.add('anim-mine');
    }
    boardEl.classList.remove('shake');
    void boardEl.offsetWidth;
    boardEl.classList.add('shake');
    setTimeout(() => {
      boardEl.classList.remove('shake');
      cellEls.forEach((el) => el.classList.remove('anim-mine'));
    }, maxD + 600);
    return Math.min(maxD + 600, 1300);
  }

  function showResult(won, sec, record, delay) {
    clearTimeout(resultTimer);
    const kind = session.kind;
    $('result-badge').innerHTML = `<svg viewBox="0 0 40 40" aria-hidden="true">${faceSvg(won ? 'won' : 'lost')}</svg>`;
    $('result-badge').classList.toggle('lost', !won);
    $('result-title').textContent = won ? (record ? t('result.record') : t('result.win')) : t('result.lose');
    $('result-level').textContent = sessionLabel();
    $('result-time').textContent = formatTime(sec);

    const g = game();
    let text;
    let extraLabel = t('result.best');
    let extra = '—';
    if (won) {
      text = kind === 'daily' ? t('result.wonDaily') : t('result.wonBoard');
      if (kind === 'daily') {
        extraLabel = t('result.streak');
        extra = String(dailyStreak());
      } else if (kind === 'custom') {
        extraLabel = t('result.mines');
        extra = String(g.mines);
      } else {
        extra = formatTime(stats.levels[kind].best);
      }
    } else {
      const wrong = M.wrongFlags(g).length;
      text = t('result.lostText', { pct: Math.floor(M.progress(g) * 100) }) + (wrong ? ' ' + t('result.wrongFlags', { n: wrong }) : '');
      extraLabel = t('result.cleared');
      extra = Math.floor(M.progress(g) * 100) + '%';
    }
    $('result-text').textContent = text;
    $('result-extra-label').textContent = extraLabel;
    $('result-extra').textContent = extra;

    const note = $('result-note');
    if (won && kind === 'daily') {
      note.hidden = false;
      note.textContent = t('result.dailyNote', { n: dailyStreak() });
    } else {
      note.hidden = true;
    }
    $('btn-result-retry').hidden = !(kind === 'daily' && !won);
    $('btn-result-new').textContent = t('result.new');
    resultTimer = setTimeout(() => {
      openModal('modal-result');
      if (won) confetti();
      else sfx('lose');
    }, delay);
  }

  /* ---------------- Chạm / chuột ---------------- */
  let press = null; // { id, idx, x, y, type, timer, long, moved }

  function cellFromEvent(e) {
    const el = e.target.closest ? e.target.closest('.cell') : null;
    return el && boardEl.contains(el) ? Number(el.dataset.idx) : -1;
  }
  function cellAtPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const c = el && el.closest ? el.closest('.cell') : null;
    return c && boardEl.contains(c) ? Number(c.dataset.idx) : -1;
  }
  function clearPress() {
    if (!press) return;
    clearTimeout(press.timer);
    const el = cellEls[press.idx];
    if (el) el.classList.remove('press');
    press = null;
    if (session && !isOver()) setFace('smile');
  }

  boardEl.addEventListener('pointerdown', (e) => {
    boardEl.classList.remove('kbd');
    const idx = cellFromEvent(e);
    if (idx < 0 || !session || isOver()) return;
    if (e.pointerType === 'mouse' && e.button === 2) {
      // Chuột phải: cắm cờ ngay khi nhấn
      e.preventDefault();
      flagCell(idx, false);
      return;
    }
    if (e.button !== 0 && e.button !== 1) return;
    clearPress();
    cursor = idx;
    updateCursor();
    press = { id: e.pointerId, idx, x: e.clientX, y: e.clientY, type: e.pointerType, button: e.button, long: false, moved: false, timer: null };
    const g = game();
    if (g.state[idx] !== M.OPEN) {
      const el = cellEls[idx];
      if (el && g.state[idx] !== M.FLAG) el.classList.add('press');
      setFace('oh');
    }
    if (e.pointerType !== 'mouse' && g.state[idx] !== M.OPEN) {
      // Nhấn giữ trên màn hình cảm ứng: cắm cờ (hoặc mở ô nếu đang bật chế độ cờ)
      press.timer = setTimeout(() => {
        if (!press || press.moved) return;
        press.long = true;
        const i = press.idx;
        cellEls[i] && cellEls[i].classList.remove('press');
        if (flagMode) {
          vibrate(15);
          openCell(i);
        } else {
          flagCell(i, true);
        }
        setFace(isOver() ? faceKind : 'smile');
      }, LONG_PRESS_MS);
    }
  });

  boardEl.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id || press.moved) return;
    if (Math.abs(e.clientX - press.x) > MOVE_TOLERANCE || Math.abs(e.clientY - press.y) > MOVE_TOLERANCE) {
      press.moved = true;
      clearTimeout(press.timer);
      const el = cellEls[press.idx];
      if (el) el.classList.remove('press');
    }
  });

  boardEl.addEventListener('pointerup', (e) => {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    clearPress();
    if (p.long || p.moved) return;
    if (cellAtPoint(e.clientX, e.clientY) !== p.idx) return;
    if (p.button === 1) chordCell(p.idx); // chuột giữa: mở nhanh
    else primaryAction(p.idx);
  });

  boardEl.addEventListener('pointercancel', clearPress);
  boardEl.addEventListener('contextmenu', (e) => e.preventDefault());
  // Chặn chọn chữ / kéo ảnh khi nhấn giữ trên iOS
  boardEl.addEventListener('selectstart', (e) => e.preventDefault());
  boardEl.addEventListener('dragstart', (e) => e.preventDefault());

  /* ---------------- Bàn phím ---------------- */
  boardEl.addEventListener('keydown', (e) => {
    if (!session || e.altKey || e.ctrlKey || e.metaKey) return;
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[e.key]) {
      e.preventDefault();
      boardEl.classList.add('kbd');
      moveCursor(moves[e.key][0], moves[e.key][1]);
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      boardEl.classList.add('kbd');
      primaryAction(cursor);
      return;
    }
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      boardEl.classList.add('kbd');
      if (game().state[cursor] === M.OPEN) chordCell(cursor);
      else flagCell(cursor, false);
    }
  });
  boardEl.addEventListener('focus', () => {
    updateCursor();
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const open = document.querySelector('.modal:not([hidden])');
    if (e.key === 'Escape' && open) {
      closeModal(open.id);
      return;
    }
    if (open) {
      trapFocus(e, open);
      return;
    }
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT') return;
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      restartSame();
    }
  });

  /* ---------------- Modal ---------------- */
  let lastFocus = null;

  function openModal(id) {
    const m = $(id);
    if (!m.hidden) return;
    document.querySelectorAll('.modal:not([hidden])').forEach((x) => { x.hidden = true; });
    lastFocus = document.activeElement;
    m.hidden = false;
    const visible = (el) => el.offsetParent !== null;
    const target = Array.from(m.querySelectorAll('.btn-primary')).find(visible) || Array.from(m.querySelectorAll('button')).find(visible);
    if (target) target.focus();
  }
  function closeModal(id) {
    const m = $(id);
    if (!m || m.hidden) return;
    m.hidden = true;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    else boardEl.focus();
  }
  function trapFocus(e, modal) {
    if (e.key !== 'Tab') return;
    const items = Array.from(modal.querySelectorAll('button, input')).filter((el) => !el.disabled && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  document.addEventListener('click', (e) => {
    const c = e.target.closest && e.target.closest('[data-close]');
    if (c) closeModal(c.getAttribute('data-close'));
  });

  /* ---------------- Chọn ván chơi ---------------- */
  const LEVEL_ICONS = {
    daily: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zM5 9h14v11H5V9zm2 2v2h2v-2H7zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2z"/></svg>',
    custom: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>',
  };

  function levelOption(kind, name, desc, badge, badgeDone, iconHtml) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'level-option' + (kind === 'daily' ? ' daily' : '');
    const current = session && session.kind === kind && (kind !== 'daily' || session.daily === todayKey());
    if (current) btn.classList.add('current');
    btn.innerHTML = `
      <span class="level-icon">${iconHtml}</span>
      <span class="level-text"><span class="level-name"></span><span class="level-desc"></span></span>
      ${badge ? `<span class="level-badge${badgeDone ? ' done' : ''}"></span>` : ''}`;
    btn.querySelector('.level-name').textContent = name;
    btn.querySelector('.level-desc').textContent = desc;
    if (badge) btn.querySelector('.level-badge').textContent = badge;
    return btn;
  }

  function openNewGame() {
    const list = $('level-list');
    list.textContent = '';
    const today = todayKey();
    const D = M.LEVELS[M.DAILY_LEVEL];
    const done = dailyTime(today);
    const streak = dailyStreak();
    const daily = levelOption(
      'daily',
      t('new.daily'),
      `${formatDate(today)} · ${D.w}x${D.h} · ${t('new.mineCount', { n: D.mines })}${streak ? ' · ' + t('new.streak', { n: streak }) : ''}`,
      done !== null ? '✓ ' + formatTime(done) : t('new.badgeNew'),
      done !== null,
      LEVEL_ICONS.daily,
    );
    daily.addEventListener('click', () => {
      closeModal('modal-new');
      newGame('daily');
    });
    list.appendChild(daily);

    LEVEL_ORDER.forEach((key, i) => {
      const L = M.LEVELS[key];
      const best = stats.levels[key].best;
      const btn = levelOption(key, t('level.' + key), `${L.w}x${L.h} · ${t('new.mineCount', { n: L.mines })}`, best !== null ? t('new.badgeBest', { time: formatTime(best) }) : '', false, String(i + 1));
      btn.addEventListener('click', () => {
        closeModal('modal-new');
        newGame(key);
      });
      list.appendChild(btn);
    });

    const C = settings.custom;
    const custom = levelOption('custom', t('level.custom'), `${C.w}x${C.h} · ${t('new.mineCount', { n: C.mines })}`, '', false, LEVEL_ICONS.custom);
    custom.setAttribute('aria-expanded', 'false');
    custom.addEventListener('click', () => {
      const form = $('custom-form');
      form.hidden = !form.hidden;
      custom.setAttribute('aria-expanded', String(!form.hidden));
      if (!form.hidden) $('custom-w').focus();
    });
    list.appendChild(custom);

    $('custom-form').hidden = true;
    $('custom-w').value = C.w;
    $('custom-h').value = C.h;
    $('custom-mines').value = C.mines;
    updateCustomHint();
    $('new-warning').hidden = !(session && game().status === 'playing');
    openModal('modal-new');
  }

  function updateCustomHint() {
    const c = M.clampCustom($('custom-w').value, $('custom-h').value, $('custom-mines').value);
    $('custom-mines').max = c.w * c.h - 9;
    const L = M.CUSTOM_LIMITS;
    $('custom-hint').textContent = t('new.customHint', { min: L.minSide, max: L.maxSide, maxMines: c.w * c.h - 9, pct: Math.round((c.mines / (c.w * c.h)) * 100) });
  }
  ['custom-w', 'custom-h', 'custom-mines'].forEach((id) => $(id).addEventListener('input', updateCustomHint));

  $('custom-form').addEventListener('submit', (e) => {
    e.preventDefault();
    settings.custom = M.clampCustom($('custom-w').value, $('custom-h').value, $('custom-mines').value);
    saveSettings();
    closeModal('modal-new');
    newGame('custom');
  });

  function restartSame() {
    if (!session) return;
    if (session.kind === 'daily') newGame('daily', { date: todayKey() });
    else newGame(session.kind);
  }

  /* ---------------- Cài đặt ---------------- */
  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    requestAnimationFrame(() => {
      $('theme-color').content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#f6f2ea';
    });
  }

  function renderSettings() {
    document.querySelectorAll('.segmented[data-setting]').forEach((seg) => {
      const key = seg.dataset.setting;
      seg.querySelectorAll('button').forEach((b) => {
        const on = b.dataset.value === (key === 'lang' ? I18N.lang : settings[key]);
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
      });
    });
    document.querySelectorAll('.switch[data-setting]').forEach((sw) => {
      sw.checked = !!settings[sw.dataset.setting];
    });
  }

  document.querySelectorAll('.segmented[data-setting]').forEach((seg) => {
    const key = seg.dataset.setting;
    const buttons = Array.from(seg.querySelectorAll('button'));
    const choose = (b) => {
      if (key === 'lang') {
        // Lưu ván rồi tải lại trang theo ngôn ngữ mới
        if (b.dataset.value === I18N.lang) return;
        saveAll();
        I18N.set(b.dataset.value);
        return;
      }
      settings[key] = b.dataset.value;
      saveSettings();
      renderSettings();
      if (key === 'theme') applyTheme();
    };
    buttons.forEach((b) => b.addEventListener('click', () => choose(b)));
    seg.addEventListener('keydown', (e) => {
      const i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % buttons.length;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + buttons.length) % buttons.length;
      if (j < 0) return;
      e.preventDefault();
      // Ngôn ngữ: phím mũi tên chỉ chuyển focus, bấm mới đổi (đổi là tải lại trang)
      if (key !== 'lang') choose(buttons[j]);
      buttons[j].focus();
    });
  });
  document.querySelectorAll('.switch[data-setting]').forEach((sw) => {
    sw.addEventListener('change', () => {
      settings[sw.dataset.setting] = sw.checked;
      saveSettings();
      // Tắt dấu ? thì gỡ các dấu ? đang có
      if (sw.dataset.setting === 'question' && !sw.checked && session) {
        const g = game();
        g.state.forEach((s, i) => {
          if (s === M.QUESTION) g.state[i] = M.HIDDEN;
        });
        renderBoard();
        persist();
      }
    });
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.theme === 'auto') applyTheme();
  });

  /* ---------------- Thống kê ---------------- */
  function renderStats() {
    const times = Object.values(stats.daily.completed).filter((v) => typeof v === 'number');
    $('stats-streak').textContent = String(dailyStreak());
    $('stats-daily-total').textContent = String(times.length);
    $('stats-daily-best').textContent = times.length ? formatTime(Math.min(...times)) : '—';
    const body = $('stats-body');
    body.textContent = '';
    BUCKETS.forEach((k) => {
      const b = stats.levels[k];
      const tr = document.createElement('tr');
      const avg = b.won ? formatTime(b.total / b.won) : '—';
      const best = k !== 'custom' && b.best !== null ? formatTime(b.best) : '—';
      [kindLabel(k), b.played, b.won, best, avg].forEach((v) => {
        const td = document.createElement('td');
        td.textContent = String(v);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    const reset = $('btn-stats-reset');
    reset.classList.remove('confirm');
    reset.textContent = t('stats.reset');
  }

  $('btn-stats-reset').addEventListener('click', () => {
    const reset = $('btn-stats-reset');
    if (!reset.classList.contains('confirm')) {
      reset.classList.add('confirm');
      reset.textContent = t('stats.resetConfirm');
      return;
    }
    stats = emptyStats();
    if (session && session.counted && !isOver()) {
      // Ván đang chơi dở vẫn tính là đã chơi
      if (session.kind === 'daily') stats.daily.played = 1;
      else stats.levels[session.kind].played = 1;
    }
    saveStats();
    writeSummary();
    renderStats();
    toast(t('toast.statsReset'));
  });

  /* ---------------- Toast ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  /* ---------------- Nút ---------------- */
  $('btn-restart').addEventListener('click', restartSame);
  $('btn-new').addEventListener('click', openNewGame);
  $('btn-stats').addEventListener('click', () => {
    renderStats();
    openModal('modal-stats');
  });
  $('btn-settings').addEventListener('click', () => {
    renderSettings();
    openModal('modal-settings');
  });
  $('btn-flag-mode').addEventListener('click', () => {
    flagMode = !flagMode;
    sfx('tap', { pitch: flagMode ? 1.2 : 0.9 });
    renderHud();
    toast(flagMode ? t('toast.flagMode') : t('toast.openMode'));
  });
  $('btn-zoom').addEventListener('click', () => {
    zoomed = !zoomed;
    layout();
    if (zoomed && cellEls[cursor]) cellEls[cursor].scrollIntoView({ block: 'center', inline: 'center' });
  });
  $('btn-result-new').addEventListener('click', () => {
    closeModal('modal-result');
    if (session.kind === 'daily') openNewGame();
    else newGame(session.kind);
  });
  $('btn-result-retry').addEventListener('click', () => {
    closeModal('modal-result');
    newGame('daily', { date: session.daily || todayKey() });
  });

  /* ---------------- Âm thanh: công tắc trong Cài đặt, dùng chung trạng thái tắt tiếng với cổng ---------------- */
  const SFX = window.PlayNine && window.PlayNine.sfx;
  if (SFX && typeof SFX.isMuted === 'function' && typeof SFX.setMuted === 'function') {
    const sw = $('sound-switch');
    const sync = () => { sw.checked = !SFX.isMuted(); };
    $('setting-sound').hidden = false;
    sync();
    if (typeof SFX.onChange === 'function') SFX.onChange(sync);
    sw.addEventListener('change', () => {
      SFX.setMuted(!sw.checked);
      if (sw.checked) sfx('tap');
    });
  }

  /* ---------------- Đồng hồ, ẩn tab, lưu định kỳ ---------------- */
  setInterval(() => {
    if (!session) return;
    renderTimer();
    if (game().status === 'playing' && clockStart !== null && Date.now() - lastSaveAt >= AUTOSAVE_MS) {
      persist();
      writeSummary();
    }
  }, 250);

  document.addEventListener('visibilitychange', () => {
    if (!session) return;
    if (document.hidden) {
      stopClock();
      persist();
      writeSummary();
    } else if (game().status === 'playing') {
      startClock();
    }
  });
  /** Lưu ván + tóm tắt (rời trang hoặc tải lại vì đổi ngôn ngữ). */
  function saveAll() {
    if (!session) return;
    persist();
    writeSummary();
  }
  window.addEventListener('pagehide', saveAll);
  I18N.onBeforeReload(saveAll);

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => layout()).observe(boardWrap);
  } else {
    window.addEventListener('resize', layout);
  }

  /* ---------------- Khởi động ---------------- */
  $('app-version').textContent = APP_VERSION;
  applyTheme();
  renderSettings();

  const restored = restoreSession();
  if (restored) {
    session = restored;
    buildBoard();
    renderAll();
    if (game().status === 'playing' && !document.hidden) startClock();
    writeSummary();
    PN && session.kind !== 'custom' && PN.gameStart({ mode: session.daily ? 'daily' : session.kind, resume: true });
  } else {
    newGame(settings.level === 'custom' || LEVEL_ORDER.indexOf(settings.level) >= 0 ? settings.level : 'easy');
  }
  booted = true;
})();
