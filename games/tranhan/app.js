/* =====================================================================
 * Tranh Ẩn - App: vẽ lưới và gợi ý số, xử lý chạm / kéo / chuột / bàn phím,
 * hoàn tác, gợi ý, đồng hồ, lưu ván, bộ tranh, thống kê, tranh hằng ngày,
 * tóm tắt cho cổng PlayNine. Cần engine.js nạp trước (window.Nonogram).
 * ===================================================================== */
(() => {
  'use strict';

  const N = window.Nonogram;
  const PN = window.PlayNine || null; // SDK PlayNine: chỉ có khi chạy trong cổng
  PN && PN.init({ gameId: 'tranhan' });
  const APP_VERSION = '1.0.1';
  const t = I18N.t;
  I18N.apply();

  /* Mọi khóa localStorage đều có tiền tố playnine-tranhan- */
  const PREFIX = 'playnine-tranhan-';
  const SAVE_KEY = PREFIX + 'save-v1';
  const SETTINGS_KEY = PREFIX + 'settings-v1';
  const STATS_KEY = PREFIX + 'stats-v1';
  const SUMMARY_KEY = PREFIX + 'summary-v1';

  const LONG_PRESS_MS = 380; // nhấn giữ bao lâu thì đánh dấu X
  const MOVE_TOLERANCE = 8; // px: kéo xa hơn thì bắt đầu nét tô
  const AUTOSAVE_MS = 5000; // đang chơi thì lưu ván + tóm tắt định kỳ
  const ZOOM_THRESHOLD = 24; // ô nhỏ hơn mức này thì hiện nút phóng to
  const ZOOM_CELL = 32; // cỡ ô khi phóng to
  const MAX_CELL = 56;
  const MIN_CELL = 10;
  const REVEAL_SPAN_MS = 900; // tổng thời gian sóng lật ô khi lộ tranh

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
    // Tiếng Anh hiện dạng "Oct 20", tiếng Việt giữ dạng ngày/tháng
    if (I18N.lang !== 'vi') return I18N.fmtDate(new Date(+y, +m - 1, +d), { month: 'short', day: 'numeric' });
    return `${d}/${m}`;
  }
  const sizeText = (s) => `${s}x${s}`;
  const sizeLabel = (s) => t('size.' + s);
  const packName = (s) => t('pack.fullName', { label: sizeLabel(s), size: sizeText(s) });
  /** Tên tranh theo ngôn ngữ (khóa theo id), chưa có bản dịch thì dùng tên trong engine. */
  function picTitle(pic) {
    const k = 'pic.' + pic.id;
    const name = t(k);
    return name === k ? pic.title : name;
  }

  /* ---------------- Cài đặt ---------------- */
  const DEFAULT_SETTINGS = {
    theme: 'auto', // auto | light | dark
    check: false, // Kiểm tra lỗi (tắt mặc định)
    autoX: false, // tự đánh dấu X khi dòng đủ số
    vibrate: true,
    pack: 5, // bộ tranh gần nhất
    random: 10, // cỡ tranh ngẫu nhiên gần nhất
  };
  let settings = loadSettings();

  function loadSettings() {
    const s = Object.assign({}, DEFAULT_SETTINGS);
    const raw = readJSON(SETTINGS_KEY);
    if (raw && typeof raw === 'object') {
      if (['auto', 'light', 'dark'].indexOf(raw.theme) >= 0) s.theme = raw.theme;
      ['check', 'autoX', 'vibrate'].forEach((k) => {
        if (typeof raw[k] === 'boolean') s[k] = raw[k];
      });
      if (N.SIZES.indexOf(raw.pack) >= 0) s.pack = raw.pack;
      if (N.SIZES.indexOf(raw.random) >= 0) s.random = raw.random;
    }
    return s;
  }
  function saveSettings() {
    writeJSON(SETTINGS_KEY, settings);
  }

  /* ---------------- Thống kê ---------------- */
  // { sizes: { 5: { played, solved, best, total }, ... },
  //   daily: { played, won, completed: { 'YYYY-MM-DD': giây } },
  //   pics: { idTranh: giây tốt nhất } }
  let stats = loadStats();

  function emptyStats() {
    const sizes = {};
    N.SIZES.forEach((s) => { sizes[s] = { played: 0, solved: 0, best: null, total: 0 }; });
    return { sizes, daily: { played: 0, won: 0, completed: {} }, pics: {} };
  }
  function loadStats() {
    const s = emptyStats();
    const raw = readJSON(STATS_KEY);
    if (!raw || typeof raw !== 'object') return s;
    const num = (x) => (typeof x === 'number' && isFinite(x) && x >= 0 ? x : 0);
    N.SIZES.forEach((k) => {
      const b = raw.sizes && raw.sizes[k];
      if (!b) return;
      s.sizes[k] = {
        played: num(b.played),
        solved: num(b.solved),
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
    if (raw.pics && typeof raw.pics === 'object') {
      Object.keys(raw.pics).forEach((k) => {
        if (typeof raw.pics[k] === 'number' && N.pictureById(k)) s.pics[k] = raw.pics[k];
      });
    }
    return s;
  }
  function saveStats() {
    writeJSON(STATS_KEY, stats);
  }

  /** Thời gian giải tranh hằng ngày của ngày key (giây), hoặc null nếu chưa giải. */
  function dailyTime(key) {
    const v = stats.daily.completed[key];
    return typeof v === 'number' ? v : null;
  }
  /** Số ngày liên tiếp đã giải tranh hằng ngày (tính tới hôm nay hoặc hôm qua). */
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
  const picSolved = (id) => typeof stats.pics[id] === 'number';
  const packSolvedCount = (size) => N.pack(size).filter((p) => picSolved(p.id)).length;

  /** Tranh chưa giải kế tiếp trong bộ (sau tranh afterId, vòng lại đầu bộ). */
  function nextUnsolved(size, afterId) {
    const list = N.pack(size);
    const start = afterId ? list.findIndex((p) => p.id === afterId) + 1 : 0;
    for (let k = 0; k < list.length; k++) {
      const p = list[(start + k) % list.length];
      if (!picSolved(p.id) && p.id !== afterId) return p;
    }
    return null;
  }

  /* ---------------- Ván đang chơi ---------------- */
  // session: { kind: 'pack'|'random'|'daily', pid, daily, size, game, elapsed: ms, counted, hintsUsed }
  let session = null;
  let clockStart = null; // performance.now() khi đồng hồ đang chạy
  let mode = 'fill'; // chế độ chạm: fill | cross
  let zoomed = false;
  let cursor = 0; // ô con trỏ bàn phím
  let hlIdx = -1; // ô đang được tô sáng hàng + cột
  let lastSaveAt = 0;
  let resultTimer = null;

  const game = () => session.game;
  const isSolved = () => !!session && session.game.solved;

  function picOf(s) {
    return s && s.kind === 'pack' ? N.pictureById(s.pid) : null;
  }
  /** Số thứ tự (1..) của tranh trong bộ. */
  function picNumber(s) {
    return N.pack(s.size).findIndex((p) => p.id === s.pid) + 1;
  }

  function elapsedMs() {
    if (!session) return 0;
    return session.elapsed + (clockStart !== null ? performance.now() - clockStart : 0);
  }
  function startClock() {
    if (clockStart === null && session && session.counted && !isSolved() && !document.hidden) clockStart = performance.now();
  }
  function stopClock() {
    if (clockStart !== null) {
      session.elapsed += performance.now() - clockStart;
      clockStart = null;
    }
  }

  function createSession(kind, opts) {
    let puzzle;
    let pid = null;
    let daily = null;
    if (kind === 'pack') {
      const pic = N.pictureById(opts.id);
      puzzle = pic;
      pid = pic.id;
    } else if (kind === 'daily') {
      daily = (opts && opts.date) || todayKey();
      puzzle = N.dailyPuzzle(daily);
    } else {
      puzzle = N.generate(opts.size, opts.size, Math.random);
    }
    return { kind, pid, daily, size: puzzle.w, game: N.createGame(puzzle), elapsed: 0, counted: false, hintsUsed: 0 };
  }

  function newGame(kind, opts) {
    stopClock();
    clearTimeout(resultTimer);
    closeModal('modal-result');
    session = createSession(kind, opts || {});
    if (kind === 'pack') settings.pack = session.size;
    if (kind === 'random') settings.random = session.size;
    saveSettings();
    mode = 'fill';
    zoomed = false;
    const g = game();
    cursor = Math.floor(g.h / 2) * g.w + Math.floor(g.w / 2);
    hlIdx = -1;
    shownSec = -1;
    persist();
    buildBoard();
    renderAll();
    writeSummary();
    PN && PN.gameStart({ mode: 's' + session.size });
  }

  /** Bắt đầu tranh mặc định: tranh chưa giải kế tiếp của bộ gần nhất, hết thì tranh ngẫu nhiên. */
  function startDefault() {
    const next = nextUnsolved(settings.pack) || N.SIZES.map((s) => nextUnsolved(s)).find(Boolean);
    if (next) newGame('pack', { id: next.id });
    else newGame('random', { size: settings.random });
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  function persist() {
    lastSaveAt = Date.now();
    if (!session || isSolved()) {
      removeKey(SAVE_KEY);
      return;
    }
    writeJSON(SAVE_KEY, {
      v: 1,
      kind: session.kind,
      pid: session.pid,
      daily: session.daily,
      elapsed: Math.round(elapsedMs()),
      counted: session.counted,
      hintsUsed: session.hintsUsed,
      cursor,
      game: session.game,
      savedAt: Date.now(),
    });
  }

  function restoreSession() {
    const raw = readJSON(SAVE_KEY);
    if (!raw || raw.v !== 1 || ['pack', 'random', 'daily'].indexOf(raw.kind) < 0) return null;
    const g = N.restore(raw.game);
    if (!g || g.solved || g.w !== g.h || N.SIZES.indexOf(g.w) < 0) return null;
    if (raw.kind === 'pack') {
      // Tranh trong bộ đã đổi (phiên bản mới) thì bỏ ván lưu
      const pic = N.pictureById(raw.pid);
      if (!pic || pic.sol.join('') !== g.sol.join('')) return null;
    }
    if (raw.kind === 'daily') {
      if (typeof raw.daily !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.daily)) return null;
      if (N.dailyPuzzle(raw.daily).sol.join('') !== g.sol.join('')) return null;
    }
    const s = {
      kind: raw.kind,
      pid: raw.kind === 'pack' ? raw.pid : null,
      daily: raw.kind === 'daily' ? raw.daily : null,
      size: g.w,
      game: g,
      elapsed: typeof raw.elapsed === 'number' && raw.elapsed > 0 ? raw.elapsed : 0,
      counted: !!raw.counted,
      hintsUsed: Number.isInteger(raw.hintsUsed) ? Math.min(N.HINTS_PER_PUZZLE, Math.max(0, raw.hintsUsed)) : 0,
    };
    cursor = Number.isInteger(raw.cursor) && raw.cursor >= 0 && raw.cursor < g.w * g.h ? raw.cursor : 0;
    return s;
  }

  /* ---------------- Tóm tắt cho cổng PlayNine ---------------- */
  function totals() {
    let played = stats.daily.played;
    let won = stats.daily.won;
    N.SIZES.forEach((k) => {
      played += stats.sizes[k].played;
      won += stats.sizes[k].solved;
    });
    return { played, won };
  }

  /** Kỷ lục ở cỡ lớn nhất đã từng giải. */
  function headlineBest() {
    for (let i = N.SIZES.length - 1; i >= 0; i--) {
      const k = N.SIZES[i];
      if (typeof stats.sizes[k].best === 'number') return { label: sizeText(k), time: stats.sizes[k].best };
    }
    return null;
  }

  function filledText(g) {
    const need = g.sol.reduce((a, b) => a + b, 0);
    return { filled: N.filledCount(g), need };
  }

  function writeSummary() {
    const { played, won } = totals();
    const best = headlineBest();
    const streak = dailyStreak();
    const today = todayKey();
    const D = N.DAILY_SIZE;
    const picsDone = Object.keys(stats.pics).length;
    const picsAll = N.pictures().length;

    let note;
    if (!played && !won) note = t('sum.none', { size: sizeText(D) });
    else if (!won) note = t('sum.playedOnly', { n: played });
    else if (best) note = t('sum.wonBest', { n: won, label: best.label, time: formatTime(best.time) });
    else note = t('sum.won', { n: won });

    const headline = [];
    if (won || played) {
      headline.push({ value: String(won), label: t('sum.statSolved') });
      headline.push({ value: `${picsDone}/${picsAll}`, label: t('sum.statPacks') });
      if (best) headline.push({ value: formatTime(best.time), label: t('result.bestSize', { size: best.label }) });
      else if (streak) headline.push({ value: String(streak), label: t('stats.streak') });
    }

    let resume = null;
    if (session && !isSolved() && N.hasActions(game())) {
      const g = game();
      const { filled, need } = filledText(g);
      const pct = need ? Math.min(1, filled / need) : 0;
      resume = {
        title: session.kind === 'daily' ? t('sum.resumeDaily') : t('sum.resumeSize', { size: sizeText(session.size) }),
        detail: t('sum.resumeDetail', { pct: Math.floor(pct * 100), time: formatTime(elapsedMs() / 1000) }),
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
        title: t('sum.dailyTitle', { size: sizeText(D) }),
        done: dailyTime(today) !== null,
        streak,
      },
    });
  }

  /* ---------------- Màu (đọc từ CSS để khớp giao diện sáng / tối) ---------------- */
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /** Vẽ lưới lên canvas, 1 px mỗi ô (CSS phóng to, giữ nét). colors[i] null thì dùng màu mặc định. */
  function drawGrid(canvas, w, h, on, colors, fallback) {
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < w * h; i++) {
      if (!on(i)) continue;
      ctx.fillStyle = (colors && colors[i]) || fallback;
      ctx.fillRect(i % w, Math.floor(i / w), 1, 1);
    }
  }
  function drawPicture(canvas, pic) {
    drawGrid(canvas, pic.w, pic.h, (i) => pic.sol[i] === 1, pic.colors, cssVar('--accent', '#b07d1f'));
  }

  /* ---------------- Bố cục lưới ---------------- */
  const boardWrap = $('board-wrap');
  const boardEl = $('board');
  let cellEls = [];
  let rowClueEls = [];
  let colClueEls = [];
  let cornerCanvas = null;
  let clues = null;
  let view = { cell: 32 };

  /** Cỡ chữ gợi ý theo cỡ ô (tối thiểu 11px để vẫn đọc được). */
  const clueFont = (cell) => Math.max(11, Math.round(cell * 0.5));
  const digits = (n) => String(n).length;

  /** Kích thước dải gợi ý và cả lưới với cỡ ô cell. */
  function measure(cell) {
    const g = game();
    const fs = clueFont(cell);
    let rcw = 0;
    clues.rows.forEach((cl) => {
      const nums = cl.length ? cl : [0];
      const wd = nums.reduce((s, x) => s + digits(x) * 0.64 * fs, 0) + (nums.length - 1) * 0.42 * fs;
      rcw = Math.max(rcw, wd);
    });
    let cch = 0;
    clues.cols.forEach((cl) => {
      const k = Math.max(1, cl.length);
      cch = Math.max(cch, k * fs + (k - 1) * 0.18 * fs);
    });
    rcw = Math.ceil(rcw + cell * 0.24 + 8);
    cch = Math.ceil(cch + cell * 0.16 + 8);
    return { fs, rcw, cch, w: rcw + g.w * cell + 8, h: cch + g.h * cell + 8 };
  }

  /** Tính cỡ ô lớn nhất vừa khung; ô quá nhỏ thì cho phép phóng to. */
  function layout() {
    if (!session) return;
    // Chừa vài px để lưới không chạm mép bo tròn của khung
    const W = boardWrap.clientWidth - 6;
    const H = boardWrap.clientHeight - 6;
    if (W <= 0 || H <= 0) return;
    let cell = MAX_CELL;
    while (cell > MIN_CELL) {
      const m = measure(cell);
      if (m.w <= W && m.h <= H) break;
      cell--;
    }
    const canZoom = cell < ZOOM_THRESHOLD && !isSolved();
    $('btn-zoom').hidden = !canZoom;
    if (!canZoom) zoomed = false;
    if (zoomed) cell = Math.max(cell, ZOOM_CELL);
    $('btn-zoom').setAttribute('aria-pressed', String(zoomed));
    $('btn-zoom').setAttribute('aria-label', zoomed ? t('tool.zoomOut') : t('tool.zoomIn'));
    $('zoom-plus').setAttribute('d', zoomed ? 'M7.5 10.5h6' : 'M10.5 7.5v6M7.5 10.5h6');
    boardWrap.classList.toggle('zoomed', zoomed);

    const m = measure(cell);
    view.cell = cell;
    boardEl.style.setProperty('--cell', cell + 'px');
    boardEl.style.setProperty('--rcw', m.rcw + 'px');
    boardEl.style.setProperty('--cch', m.cch + 'px');
    boardEl.style.setProperty('--clue-fs', m.fs + 'px');
    if (cornerCanvas) {
      const s = Math.floor(Math.min(m.rcw, m.cch) - 10);
      cornerCanvas.hidden = s < 22;
      cornerCanvas.style.width = s + 'px';
      cornerCanvas.style.height = s + 'px';
    }
  }

  /** Tạo lại toàn bộ lưới DOM cho tranh hiện tại. */
  function buildBoard() {
    const g = game();
    clues = N.cluesOf(g.sol, g.w, g.h);
    boardEl.style.setProperty('--cols', g.w);
    boardEl.style.setProperty('--rows', g.h);
    boardEl.setAttribute('aria-rowcount', g.h);
    boardEl.setAttribute('aria-colcount', g.w);
    boardEl.classList.toggle('solved', g.solved);
    const frag = document.createDocumentFragment();

    // Hàng đầu: góc xem trước + gợi ý cột
    const head = document.createElement('div');
    head.className = 'row';
    head.setAttribute('aria-hidden', 'true');
    const corner = document.createElement('div');
    corner.className = 'corner';
    cornerCanvas = document.createElement('canvas');
    corner.appendChild(cornerCanvas);
    head.appendChild(corner);
    colClueEls = [];
    for (let c = 0; c < g.w; c++) {
      const el = document.createElement('div');
      el.className = 'cc' + (c % 5 === 4 && c < g.w - 1 ? ' vr' : '');
      fillClue(el, clues.cols[c]);
      colClueEls.push(el);
      head.appendChild(el);
    }
    frag.appendChild(head);

    cellEls = new Array(g.w * g.h);
    rowClueEls = [];
    for (let r = 0; r < g.h; r++) {
      const row = document.createElement('div');
      row.className = 'row';
      row.setAttribute('role', 'row');
      const rc = document.createElement('div');
      rc.className = 'rc' + (r % 5 === 4 && r < g.h - 1 ? ' hb' : '');
      rc.setAttribute('aria-hidden', 'true');
      fillClue(rc, clues.rows[r]);
      rowClueEls.push(rc);
      row.appendChild(rc);
      for (let c = 0; c < g.w; c++) {
        const idx = r * g.w + c;
        const el = document.createElement('div');
        let base = 'cell';
        if (c % 5 === 4 || c === g.w - 1) base += ' vr';
        if (r % 5 === 4 || r === g.h - 1) base += ' hb';
        if (c === 0) base += ' c0';
        if (r === 0) base += ' r0';
        el.id = 'c' + idx;
        el.setAttribute('role', 'gridcell');
        el.dataset.idx = idx;
        el._base = base;
        el._key = '';
        cellEls[idx] = el;
        row.appendChild(el);
      }
      frag.appendChild(row);
    }
    boardEl.textContent = '';
    boardEl.appendChild(frag);
    if (g.solved) paintPicture(false);
    renderBoard();
    updateDone();
    drawPreview();
    boardEl.setAttribute('aria-activedescendant', 'c' + cursor);
  }

  function fillClue(el, list) {
    const nums = list.length ? list : [0];
    el.innerHTML = nums.map((n) => `<span>${n}</span>`).join('');
  }

  /* ---------------- Vẽ ---------------- */
  const STATE_LABEL = [t('cell.empty'), t('cell.filled'), t('cell.crossed'), t('cell.miss')];

  function cellClass(idx) {
    const g = game();
    const el = cellEls[idx];
    const v = g.cells[idx];
    let cls = el._base;
    if (g.solved) return cls + (g.sol[idx] ? ' pic' : '');
    if (v === N.FILL) cls += ' f';
    else if (v === N.CROSS) cls += ' x';
    else if (v === N.MISS) cls += ' x miss';
    if (hlIdx >= 0 && (Math.floor(hlIdx / g.w) === Math.floor(idx / g.w) || hlIdx % g.w === idx % g.w)) cls += ' hl';
    if (idx === cursor) cls += ' cursor';
    return cls;
  }

  function renderCell(idx) {
    const el = cellEls[idx];
    if (!el) return;
    const cls = cellClass(idx);
    if (el._key === cls) return;
    const stateChanged = el._key.replace(/ (hl|cursor)/g, '') !== cls.replace(/ (hl|cursor)/g, '') || !el._key;
    el._key = cls;
    el.className = cls;
    if (stateChanged) {
      const g = game();
      const r = Math.floor(idx / g.w);
      const c = idx % g.w;
      const rowClue = (clues.rows[r].length ? clues.rows[r] : [0]).join(' ');
      const colClue = (clues.cols[c].length ? clues.cols[c] : [0]).join(' ');
      const state = g.solved ? (g.sol[idx] ? t('cell.pic') : t('cell.bg')) : STATE_LABEL[g.cells[idx]];
      el.setAttribute('aria-label', t('cell.aria', { r: r + 1, rc: rowClue, c: c + 1, cc: colClue, state }));
    }
  }

  function renderBoard() {
    for (let i = 0; i < cellEls.length; i++) renderCell(i);
  }

  /** Xám gợi ý của các dòng đã đủ số. Không truyền gì thì xét mọi dòng. */
  function updateDone(idxs) {
    const g = game();
    const rows = new Set();
    const cols = new Set();
    if (idxs) {
      idxs.forEach((i) => {
        rows.add(Math.floor(i / g.w));
        cols.add(i % g.w);
      });
    } else {
      for (let r = 0; r < g.h; r++) rows.add(r);
      for (let c = 0; c < g.w; c++) cols.add(c);
    }
    rows.forEach((r) => rowClueEls[r].classList.toggle('done', N.isLineDone(g, 'row', r)));
    cols.forEach((c) => colClueEls[c].classList.toggle('done', N.isLineDone(g, 'col', c)));
  }

  /** Tô sáng hàng + cột của ô idx (và dải gợi ý tương ứng). */
  function setHl(idx) {
    if (isSolved()) idx = -1; // giải xong thì không tô sáng nữa
    if (idx === hlIdx) return;
    const g = game();
    const old = hlIdx;
    hlIdx = idx;
    const touch = new Set();
    [old, idx].forEach((k) => {
      if (k < 0) return;
      const r = Math.floor(k / g.w);
      const c = k % g.w;
      for (let t = 0; t < g.w; t++) touch.add(r * g.w + t);
      for (let t = 0; t < g.h; t++) touch.add(t * g.w + c);
    });
    touch.forEach(renderCell);
    rowClueEls.forEach((el, r) => el.classList.toggle('hl', idx >= 0 && Math.floor(idx / g.w) === r));
    colClueEls.forEach((el, c) => el.classList.toggle('hl', idx >= 0 && idx % g.w === c));
  }

  let previewQueued = false;
  function drawPreview() {
    previewQueued = false;
    if (!session || !cornerCanvas) return;
    const g = game();
    if (g.solved) {
      drawGrid(cornerCanvas, g.w, g.h, (i) => g.sol[i] === 1, colorsOf(session), cssVar('--accent', '#b07d1f'));
    } else {
      drawGrid(cornerCanvas, g.w, g.h, (i) => g.cells[i] === N.FILL, null, cssVar('--fill', '#2b231c'));
    }
  }
  function schedulePreview() {
    if (previewQueued) return;
    previewQueued = true;
    requestAnimationFrame(drawPreview);
  }

  function colorsOf(s) {
    const pic = picOf(s);
    return pic ? pic.colors : null;
  }

  function kindLabel() {
    if (session.kind === 'pack') return packName(session.size);
    if (session.kind === 'daily') return t('hud.daily');
    return t('hud.random', { size: sizeText(session.size) });
  }
  function puzzleLabel() {
    if (session.kind === 'pack') {
      const pic = picOf(session);
      return isSolved() ? picTitle(pic) : `#${picNumber(session)}`;
    }
    if (session.kind === 'daily') return formatDate(session.daily);
    return isSolved() ? t('hud.solved') : sizeText(session.size);
  }

  function renderHud() {
    const g = game();
    $('kind-label').textContent = kindLabel();
    const pl = $('puzzle-label');
    pl.textContent = puzzleLabel();
    pl.classList.toggle('solved', isSolved());
    const mid = $('mid-value');
    if (settings.check) {
      $('mid-label').textContent = t('hud.mistakes');
      mid.textContent = String(g.mistakes);
      mid.classList.toggle('bad', g.mistakes > 0);
    } else {
      const { filled, need } = filledText(g);
      $('mid-label').textContent = t('hud.filled');
      mid.textContent = `${filled}/${need}`;
      mid.classList.remove('bad');
    }
    renderTimer();
    const left = N.HINTS_PER_PUZZLE - session.hintsUsed;
    $('hint-count').textContent = String(left);
    $('btn-hint').disabled = isSolved() || left <= 0;
    $('btn-hint').setAttribute('aria-label', t('tool.hintLeft', { n: left }));
    $('btn-undo').disabled = isSolved() || !g.past.length;
    $('btn-redo').disabled = isSolved() || !g.future.length;
    renderMode();
  }

  let shownSec = -1;
  function renderTimer() {
    const sec = Math.floor(elapsedMs() / 1000);
    if (sec === shownSec) return;
    shownSec = sec;
    $('timer').textContent = formatTime(sec);
  }

  function renderMode() {
    document.querySelectorAll('#mode button').forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      b.disabled = isSolved();
    });
  }

  function renderAll() {
    renderBoard();
    renderHud();
    layout();
  }

  /* ---------------- Con trỏ bàn phím ---------------- */
  function setCursor(idx) {
    const prev = cursor;
    cursor = idx;
    renderCell(prev);
    renderCell(cursor);
    boardEl.setAttribute('aria-activedescendant', 'c' + cursor);
  }
  function moveCursor(dr, dc) {
    const g = game();
    const r = Math.min(g.h - 1, Math.max(0, Math.floor(cursor / g.w) + dr));
    const c = Math.min(g.w - 1, Math.max(0, (cursor % g.w) + dc));
    setCursor(r * g.w + c);
    setHl(cursor);
    if (zoomed) cellEls[cursor].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /* ---------------- Thao tác tô ---------------- */
  function vibrate(ms) {
    if (!settings.vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* bỏ qua */ }
  }

  const norm = (v) => (v === N.MISS ? N.CROSS : v);
  const primaryTool = () => (mode === 'cross' ? N.CROSS : N.FILL);
  const altTool = () => (mode === 'cross' ? N.FILL : N.CROSS);

  /** Thao tác đầu tiên của tranh: tính là đã chơi, chạy đồng hồ. */
  function onFirstAction() {
    if (!session.counted) {
      session.counted = true;
      if (session.kind === 'daily') stats.daily.played++;
      else stats.sizes[session.size].played++;
      saveStats();
      writeSummary();
    }
    startClock();
  }

  function flashCell(idx, cls) {
    const el = cellEls[idx];
    if (!el || reduceMotion.matches) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => {
      el.classList.remove(cls);
      el._key = '';
      renderCell(idx);
    }, 950);
  }

  // Nét tô đang diễn ra: { id, start, tool, from, target, axis, changes, visited, stopped, last }
  let stroke = null;

  /**
   * Bắt đầu nét tô tại ô idx với công cụ tool (FILL / CROSS).
   * Ô xuất phát quyết định hành động: đang giống công cụ thì xóa, khác thì đặt.
   * Nét chỉ đổi các ô có cùng trạng thái với ô xuất phát.
   */
  function beginStroke(idx, tool, id) {
    const g = game();
    if (g.solved || g.cells[idx] === N.MISS) return;
    const from = norm(g.cells[idx]);
    stroke = { id, start: idx, tool, from, target: from === tool ? N.EMPTY : tool, axis: null, changes: [], visited: new Set(), stopped: false, last: idx };
    paintCell(idx);
  }

  function paintCell(idx) {
    const s = stroke;
    if (!s || s.stopped || s.visited.has(idx)) return;
    s.visited.add(idx);
    const g = game();
    if (g.cells[idx] === N.MISS || norm(g.cells[idx]) !== s.from) return;
    let to = s.target;
    if (to === N.FILL && settings.check && g.sol[idx] === 0) {
      // Kiểm tra lỗi: tô nhầm thì đánh dấu X đỏ, tính một lỗi và dừng nét
      to = N.MISS;
      g.mistakes++;
      s.stopped = true;
      vibrate(40);
      setTimeout(() => flashCell(idx, 'oops'), 0);
    }
    s.changes.push(...N.setCells(g, [[idx, to]]));
    renderCell(idx);
    updateDone([idx]);
    schedulePreview();
    if (to === N.MISS) renderHud();
  }

  /** Kéo tới ô idx: khóa theo hàng / cột của ô xuất phát, tô mọi ô từ đầu nét tới đó. */
  function extendStroke(idx) {
    const s = stroke;
    if (!s || idx < 0 || idx === s.last) return;
    const g = game();
    const w = g.w;
    const sr = Math.floor(s.start / w);
    const sc = s.start % w;
    const r = Math.floor(idx / w);
    const c = idx % w;
    if (!s.axis) {
      if (r === sr && c === sc) return;
      s.axis = Math.abs(c - sc) >= Math.abs(r - sr) ? 'row' : 'col';
    }
    if (s.axis === 'row') {
      const step = c >= sc ? 1 : -1;
      for (let k = sc; k !== c + step; k += step) paintCell(sr * w + k);
      setHl(sr * w + c);
    } else {
      const step = r >= sr ? 1 : -1;
      for (let k = sr; k !== r + step; k += step) paintCell(k * w + sc);
      setHl(r * w + sc);
    }
    s.last = idx;
  }

  /** Kết thúc nét: gộp thành một thao tác hoàn tác (kèm tự đánh dấu X nếu bật). cancel thì trả lại như cũ. */
  function endStroke(cancel) {
    const s = stroke;
    if (!s) return;
    stroke = null;
    const g = game();
    if (cancel) {
      for (let t = s.changes.length - 1; t >= 0; t--) g.cells[s.changes[t][0]] = s.changes[t][1];
      s.changes.forEach((c) => renderCell(c[0]));
      updateDone();
      schedulePreview();
      return;
    }
    let changes = s.changes;
    if (!changes.length) return;
    if (settings.autoX) changes = changes.concat(N.autoCross(g, changes.map((c) => c[0])));
    N.commit(g, changes);
    afterAction(changes);
  }

  /** Sau mỗi thao tác (nét tô, gợi ý, hoàn tác, làm lại). */
  function afterAction(changes) {
    onFirstAction();
    changes.forEach((c) => renderCell(c[0]));
    updateDone(changes.map((c) => c[0]));
    schedulePreview();
    renderHud();
    if (game().solved) onSolved();
    else persist();
  }

  /** Bật "Kiểm tra lỗi": các ô đang tô sai chuyển thành X đỏ (count: có tính là lỗi không). */
  function flagWrong(count) {
    const g = game();
    const list = [];
    g.cells.forEach((v, i) => {
      if (v === N.FILL && g.sol[i] === 0) list.push([i, N.MISS]);
    });
    if (!list.length) return 0;
    N.setCells(g, list);
    if (count) g.mistakes += list.length;
    renderBoard();
    updateDone();
    schedulePreview();
    renderHud();
    persist();
    return list.length;
  }

  function doUndo() {
    if (!session || stroke) return;
    const ch = N.undo(game());
    if (!ch) return;
    if (settings.check) flagWrong(false);
    afterAction(ch);
  }
  function doRedo() {
    if (!session || stroke) return;
    const ch = N.redo(game());
    if (!ch) return;
    if (settings.check) flagWrong(false);
    afterAction(ch);
  }

  function useHint() {
    if (!session || isSolved() || stroke) return;
    if (session.hintsUsed >= N.HINTS_PER_PUZZLE) {
      toast(t('toast.noHints', { n: N.HINTS_PER_PUZZLE }));
      return;
    }
    const g = game();
    const h = N.hint(g);
    if (!h) return;
    session.hintsUsed++;
    let changes = N.setCells(g, [[h.idx, h.value]]);
    if (settings.autoX) changes = changes.concat(N.autoCross(g, [h.idx]));
    N.commit(g, changes);
    setCursor(h.idx);
    setHl(h.idx);
    if (zoomed) cellEls[h.idx].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = Math.floor(h.idx / g.w) + 1;
    const c = (h.idx % g.w) + 1;
    afterAction(changes);
    if (!g.solved) {
      flashCell(h.idx, 'flash');
      toast(t(h.fix ? 'toast.hintFix' : h.value === N.FILL ? 'toast.hintFill' : 'toast.hintCross', { r, c }));
    }
  }

  /* ---------------- Giải xong ---------------- */
  function onSolved() {
    stopClock();
    const sec = Math.max(1, Math.round(elapsedMs() / 1000));
    PN && PN.gameEnd({ mode: 's' + session.size, timeMs: Math.round(elapsedMs()), won: true, assisted: session.hintsUsed > 0 || !!settings.check || !!settings.autoX });
    let record = false;
    if (session.kind === 'daily') {
      stats.daily.won++;
      const prev = dailyTime(session.daily);
      record = prev !== null && sec < prev;
      stats.daily.completed[session.daily] = prev === null ? sec : Math.min(prev, sec);
    } else {
      const b = stats.sizes[session.size];
      b.solved++;
      b.total += sec;
      record = b.best !== null && sec < b.best;
      if (b.best === null || sec < b.best) b.best = sec;
      if (session.kind === 'pack') {
        const prev = stats.pics[session.pid];
        stats.pics[session.pid] = typeof prev === 'number' ? Math.min(prev, sec) : sec;
      }
    }
    saveStats();
    persist();
    writeSummary();
    hlIdx = -1;
    rowClueEls.concat(colClueEls).forEach((el) => el.classList.remove('hl'));
    boardEl.classList.add('solved');
    const delay = paintPicture(true);
    renderBoard();
    renderHud();
    layout();
    drawPreview();
    showResult(sec, record, delay);
  }

  /** Lộ tranh: ô tô đổi sang màu của tranh, lật lần lượt theo đường chéo. Trả về thời gian hoạt ảnh (ms). */
  function paintPicture(animate) {
    const g = game();
    const colors = colorsOf(session);
    const motion = animate && !reduceMotion.matches;
    const step = REVEAL_SPAN_MS / (g.w + g.h);
    for (let i = 0; i < cellEls.length; i++) {
      const el = cellEls[i];
      if (colors && colors[i]) el.style.setProperty('--pc', colors[i]);
      else el.style.removeProperty('--pc');
      const d = motion ? Math.round((Math.floor(i / g.w) + (i % g.w)) * step) : 0;
      el.style.setProperty('--d', d + 'ms');
    }
    return motion ? REVEAL_SPAN_MS + 600 : 350;
  }

  function solvedTitle() {
    if (session.kind === 'pack') return picTitle(picOf(session));
    if (session.kind === 'daily') return t('hud.daily');
    return t('result.random');
  }

  function showResult(sec, record, delay) {
    clearTimeout(resultTimer);
    const g = game();
    const kind = session.kind;
    const pic = picOf(session);
    const canvas = $('result-pic');
    if (pic) drawPicture(canvas, pic);
    else drawGrid(canvas, g.w, g.h, (i) => g.sol[i] === 1, null, cssVar('--accent', '#b07d1f'));
    $('result-kicker').textContent = record ? t('result.record') : t('result.kicker');
    $('result-title').textContent = solvedTitle();
    let text;
    if (kind === 'pack') text = t('result.packText', { n: picNumber(session), pack: packName(session.size) });
    else if (kind === 'daily') text = t('result.dailyText', { date: formatDate(session.daily), size: sizeText(session.size) });
    else text = t('result.randomText', { size: sizeText(session.size) });
    $('result-text').textContent = text;
    $('result-time').textContent = formatTime(sec);
    if (kind === 'daily') {
      $('result-extra-label').textContent = t('stats.streak');
      $('result-extra').textContent = String(dailyStreak());
    } else {
      $('result-extra-label').textContent = t('result.bestSize', { size: sizeText(session.size) });
      $('result-extra').textContent = formatTime(stats.sizes[session.size].best);
    }
    if (settings.check) {
      $('result-third-label').textContent = t('hud.mistakes');
      $('result-third').textContent = String(g.mistakes);
    } else {
      $('result-third-label').textContent = t('result.hints');
      $('result-third').textContent = `${session.hintsUsed}/${N.HINTS_PER_PUZZLE}`;
    }
    const note = $('result-note');
    note.hidden = false;
    if (kind === 'pack') note.textContent = t('result.packNote', { k: packSolvedCount(session.size), n: N.pack(session.size).length });
    else if (kind === 'daily') note.textContent = t('result.dailyNote', { n: dailyStreak() });
    else note.hidden = true;
    const next = $('btn-result-next');
    if (kind === 'pack') next.textContent = nextUnsolved(session.size, session.pid) ? t('result.next') : t('result.viewPack');
    else if (kind === 'random') next.textContent = t('result.newRandom');
    else next.textContent = t('result.choose');
    resultTimer = setTimeout(() => openModal('modal-result'), delay);
  }

  function goNext() {
    closeModal('modal-result');
    if (!session) return;
    if (session.kind === 'pack') {
      const next = nextUnsolved(session.size, session.pid);
      if (next) newGame('pack', { id: next.id });
      else openPack(session.size);
    } else if (session.kind === 'random') {
      newGame('random', { size: session.size });
    } else {
      openNewGame();
    }
  }

  /* ---------------- Chạm / chuột ---------------- */
  let pending = null; // chạm cảm ứng chưa quyết định: { id, idx, x, y, timer }
  const pointers = new Map(); // ngón đang chạm (cho cử chỉ hai ngón khi phóng to)
  let pan = null;

  function cellFromEvent(e) {
    const el = e.target.closest ? e.target.closest('.cell') : null;
    return el && boardEl.contains(el) ? Number(el.dataset.idx) : -1;
  }
  function cellAtPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const c = el && el.closest ? el.closest('.cell') : null;
    return c && boardEl.contains(c) ? Number(c.dataset.idx) : -1;
  }
  function cancelPending() {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending = null;
  }
  function midpoint() {
    const pts = Array.from(pointers.values()).slice(0, 2);
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }

  boardEl.addEventListener('pointerdown', (e) => {
    boardEl.classList.remove('kbd');
    if (!session) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType !== 'mouse' && pointers.size >= 2) {
      // Hai ngón: hủy nét đang tô, khi phóng to thì kéo để di chuyển lưới
      cancelPending();
      endStroke(true);
      if (zoomed) {
        const m = midpoint();
        pan = { x: m.x, y: m.y, sl: boardWrap.scrollLeft, st: boardWrap.scrollTop };
      }
      return;
    }
    const idx = cellFromEvent(e);
    if (idx < 0 || isSolved()) return;
    try { boardEl.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
    setCursor(idx);
    setHl(idx);
    if (e.pointerType === 'mouse') {
      if (e.button === 0) beginStroke(idx, primaryTool(), e.pointerId);
      else if (e.button === 2) beginStroke(idx, altTool(), e.pointerId);
      return;
    }
    cancelPending();
    pending = {
      id: e.pointerId,
      idx,
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => {
        // Nhấn giữ: dùng công cụ còn lại (mặc định là đánh dấu X)
        if (!pending) return;
        const p = pending;
        pending = null;
        vibrate(15);
        beginStroke(p.idx, altTool(), p.id);
      }, LONG_PRESS_MS),
    };
  });

  boardEl.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pan) {
      if (pointers.size >= 2) {
        const m = midpoint();
        boardWrap.scrollLeft = pan.sl - (m.x - pan.x);
        boardWrap.scrollTop = pan.st - (m.y - pan.y);
      }
      return;
    }
    if (pending && e.pointerId === pending.id) {
      if (Math.abs(e.clientX - pending.x) > MOVE_TOLERANCE || Math.abs(e.clientY - pending.y) > MOVE_TOLERANCE) {
        const p = pending;
        cancelPending();
        beginStroke(p.idx, primaryTool(), p.id);
        extendStroke(cellAtPoint(e.clientX, e.clientY));
      }
      return;
    }
    if (stroke && e.pointerId === stroke.id) {
      extendStroke(cellAtPoint(e.clientX, e.clientY));
      return;
    }
    if (!stroke && e.pointerType === 'mouse' && !e.buttons && session && !isSolved()) {
      const idx = cellFromEvent(e);
      if (idx >= 0) setHl(idx);
    }
  });

  function pointerEnd(e, cancelled) {
    pointers.delete(e.pointerId);
    if (pan) {
      if (pointers.size < 2) pan = null;
      return;
    }
    if (pending && e.pointerId === pending.id) {
      const p = pending;
      cancelPending();
      if (!cancelled) {
        beginStroke(p.idx, primaryTool(), p.id);
        endStroke(false);
      }
      return;
    }
    if (stroke && e.pointerId === stroke.id) endStroke(false);
  }
  boardEl.addEventListener('pointerup', (e) => pointerEnd(e, false));
  boardEl.addEventListener('pointercancel', (e) => pointerEnd(e, true));
  boardEl.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !stroke && session && !isSolved()) setHl(boardEl.classList.contains('kbd') ? cursor : -1);
  });
  boardEl.addEventListener('contextmenu', (e) => e.preventDefault());
  // Chặn chọn chữ / kéo ảnh khi nhấn giữ trên iOS
  boardEl.addEventListener('selectstart', (e) => e.preventDefault());
  boardEl.addEventListener('dragstart', (e) => e.preventDefault());

  /* ---------------- Bàn phím ---------------- */
  function keyStroke(tool) {
    if (!session || isSolved()) return;
    beginStroke(cursor, tool, 'kbd');
    endStroke(false);
  }

  boardEl.addEventListener('keydown', (e) => {
    if (!session || e.altKey || e.ctrlKey || e.metaKey) return;
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[e.key]) {
      e.preventDefault();
      boardEl.classList.add('kbd');
      moveCursor(moves[e.key][0], moves[e.key][1]);
      return;
    }
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      boardEl.classList.add('kbd');
      keyStroke(N.FILL);
      return;
    }
    if (e.key === 'x' || e.key === 'X') {
      e.preventDefault();
      boardEl.classList.add('kbd');
      keyStroke(N.CROSS);
    }
  });
  boardEl.addEventListener('focus', () => {
    if (!session) return;
    renderCell(cursor);
    if (boardEl.classList.contains('kbd')) setHl(cursor);
  });

  document.addEventListener('keydown', (e) => {
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
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); doRedo(); }
      return;
    }
    if (e.altKey) return;
    if (k === 'z') { e.preventDefault(); doUndo(); }
    else if (k === 'y') { e.preventDefault(); doRedo(); }
    else if (k === 'h') { e.preventDefault(); useHint(); }
    else if (k === 'm') { e.preventDefault(); toggleMode(); }
    else if (k === 'n') { e.preventDefault(); openNewGame(); }
  });

  /* ---------------- Modal ---------------- */
  let lastFocus = null;

  function openModal(id) {
    const m = $(id);
    if (!m.hidden) return;
    document.querySelectorAll('.modal:not([hidden])').forEach((x) => { x.hidden = true; });
    if (!lastFocus || !document.contains(lastFocus) || lastFocus === document.body) lastFocus = document.activeElement;
    m.hidden = false;
    const visible = (el) => el.offsetParent !== null;
    const target = Array.from(m.querySelectorAll('[role="tab"].on, .btn-primary')).find(visible) || Array.from(m.querySelectorAll('button')).find(visible);
    if (target) target.focus();
  }
  function closeModal(id) {
    const m = $(id);
    if (!m || m.hidden) return;
    m.hidden = true;
    if (document.querySelector('.modal:not([hidden])')) return;
    const back = lastFocus;
    lastFocus = null;
    if (back && document.contains(back) && back !== document.body) back.focus();
    else boardEl.focus();
  }
  function trapFocus(e, modal) {
    if (e.key !== 'Tab') return;
    const items = Array.from(modal.querySelectorAll('button, input')).filter((el) => !el.disabled && el.offsetParent !== null && el.tabIndex >= 0);
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

  /* ---------------- Chọn tranh ---------------- */
  const ICON_DAILY = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zM5 9h14v11H5V9zm2 2v2h2v-2H7zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2z"/></svg>';
  const inProgress = () => !!session && !isSolved() && N.hasActions(game());

  function levelOption(name, desc, badge, badgeDone, iconHtml, current) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'level-option' + (current ? ' current' : '');
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
    const today = todayKey();
    const done = dailyTime(today);
    const streak = dailyStreak();
    const dl = $('daily-list');
    dl.textContent = '';
    const daily = levelOption(
      t('new.daily'),
      `${formatDate(today)} · ${sizeText(N.DAILY_SIZE)}${streak ? t('new.dailyStreak', { n: streak }) : ''}`,
      done !== null ? '✓ ' + formatTime(done) : t('new.badgeNew'),
      done !== null,
      ICON_DAILY,
      !!session && session.kind === 'daily' && session.daily === today,
    );
    daily.classList.add('daily');
    daily.addEventListener('click', () => {
      closeModal('modal-new');
      if (session && session.kind === 'daily' && session.daily === today && !isSolved()) return;
      newGame('daily', { date: today });
    });
    dl.appendChild(daily);

    const pl = $('pack-list');
    pl.textContent = '';
    N.SIZES.forEach((s) => {
      const total = N.pack(s).length;
      const k = packSolvedCount(s);
      const btn = levelOption(
        t('pack.name', { label: sizeLabel(s) }),
        t('new.packDesc', { size: sizeText(s), total, k }),
        k === total ? t('new.packDone') : '',
        true,
        sizeText(s),
        !!session && session.kind === 'pack' && session.size === s,
      );
      const meter = document.createElement('span');
      meter.className = 'meter';
      meter.innerHTML = `<i style="width:${Math.round((k / total) * 100)}%"></i>`;
      btn.querySelector('.level-text').appendChild(meter);
      btn.addEventListener('click', () => {
        closeModal('modal-new');
        openPack(s);
      });
      pl.appendChild(btn);
    });

    const rl = $('random-list');
    rl.textContent = '';
    N.SIZES.forEach((s) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'random-option' + (session && session.kind === 'random' && session.size === s ? ' current' : '');
      btn.innerHTML = `<span>${sizeText(s)}</span><small>${sizeLabel(s)}</small>`;
      btn.setAttribute('aria-label', t('new.randomAria', { size: sizeText(s) }));
      btn.addEventListener('click', () => {
        closeModal('modal-new');
        newGame('random', { size: s });
      });
      rl.appendChild(btn);
    });

    $('new-warning').hidden = !inProgress();
    openModal('modal-new');
  }

  /* ---------------- Bộ tranh ---------------- */
  let packSize = 5;

  function openPack(size) {
    packSize = size;
    renderPack();
    $('pack-warning').hidden = !inProgress();
    openModal('modal-pack');
  }

  function renderPack() {
    const tabs = $('pack-tabs');
    tabs.textContent = '';
    N.SIZES.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.textContent = sizeText(s);
      const on = s === packSize;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      b.addEventListener('click', () => {
        packSize = s;
        renderPack();
        tabs.querySelector('.on').focus();
      });
      tabs.appendChild(b);
    });

    const list = N.pack(packSize);
    $('pack-title').textContent = t('pack.name', { label: sizeLabel(packSize) });
    $('pack-progress').textContent = t('pack.progress', { k: packSolvedCount(packSize), n: list.length });
    const grid = $('pack-grid');
    grid.textContent = '';
    list.forEach((pic, k) => {
      const solved = picSolved(pic.id);
      const current = !!session && session.kind === 'pack' && session.pid === pic.id && !isSolved();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pic-tile' + (solved ? ' solved' : '') + (current ? ' current' : '');
      const thumb = document.createElement('span');
      thumb.className = 'pic-thumb';
      if (solved) {
        const cv = document.createElement('canvas');
        drawPicture(cv, pic);
        thumb.appendChild(cv);
      } else {
        thumb.textContent = '?';
      }
      const name = document.createElement('span');
      name.className = 'pic-name';
      name.textContent = solved ? picTitle(pic) : `#${k + 1}`;
      const sub = document.createElement('span');
      sub.className = 'pic-sub';
      sub.textContent = current ? t('pack.current') : solved ? '✓ ' + formatTime(stats.pics[pic.id]) : t('pack.unsolved');
      btn.append(thumb, name, sub);
      btn.setAttribute('aria-label', solved ? t('pack.ariaSolved', { n: k + 1, title: picTitle(pic) }) : t(current ? 'pack.ariaCurrent' : 'pack.ariaUnsolved', { n: k + 1 }));
      btn.addEventListener('click', () => {
        closeModal('modal-pack');
        if (current) return;
        newGame('pack', { id: pic.id });
      });
      grid.appendChild(btn);
    });
  }

  $('pack-tabs').addEventListener('keydown', (e) => {
    const i = N.SIZES.indexOf(packSize);
    let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % N.SIZES.length;
    if (e.key === 'ArrowLeft') j = (i - 1 + N.SIZES.length) % N.SIZES.length;
    if (j < 0) return;
    e.preventDefault();
    packSize = N.SIZES[j];
    renderPack();
    $('pack-tabs').querySelector('.on').focus();
  });

  /* ---------------- Chế độ chạm ---------------- */
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    renderMode();
  }
  function toggleMode() {
    if (!session || isSolved()) return;
    setMode(mode === 'fill' ? 'cross' : 'fill');
    toast(mode === 'fill' ? t('toast.modeFill') : t('toast.modeCross'));
  }
  const modeButtons = Array.from(document.querySelectorAll('#mode button'));
  modeButtons.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('mode').addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) < 0) return;
    e.preventDefault();
    setMode(mode === 'fill' ? 'cross' : 'fill');
    modeButtons.find((b) => b.dataset.mode === mode).focus();
  });

  /* ---------------- Cài đặt ---------------- */
  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    requestAnimationFrame(() => {
      $('theme-color').content = cssVar('--bg', '#f6f2ea');
      if (session) drawPreview();
    });
  }

  function renderSettings() {
    document.querySelectorAll('.segmented[data-setting]').forEach((seg) => {
      const key = seg.dataset.setting;
      seg.querySelectorAll('button').forEach((b) => {
        const on = b.dataset.value === settings[key];
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
      });
    });
    document.querySelectorAll('.switch[data-setting]').forEach((sw) => {
      sw.checked = !!settings[sw.dataset.setting];
    });
    langButtons.forEach((b) => {
      const on = b.dataset.lang === I18N.lang;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }

  /* Ngôn ngữ: lưu ván rồi đổi khóa dùng chung, trang tải lại */
  const langButtons = Array.from(document.querySelectorAll('#lang-seg button'));
  I18N.onSave = () => {
    if (!session) return;
    endStroke(false);
    persist();
    writeSummary();
  };
  langButtons.forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.lang !== I18N.lang) I18N.set(b.dataset.lang);
  }));
  $('lang-seg').addEventListener('keydown', (e) => {
    const i = langButtons.indexOf(document.activeElement);
    if (i < 0 || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) < 0) return;
    e.preventDefault();
    langButtons[(i + 1) % langButtons.length].focus();
  });

  document.querySelectorAll('.segmented[data-setting]').forEach((seg) => {
    const key = seg.dataset.setting;
    const buttons = Array.from(seg.querySelectorAll('button'));
    const choose = (b) => {
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
      choose(buttons[j]);
      buttons[j].focus();
    });
  });
  document.querySelectorAll('.switch[data-setting]').forEach((sw) => {
    sw.addEventListener('change', () => {
      const key = sw.dataset.setting;
      settings[key] = sw.checked;
      saveSettings();
      if (!session || isSolved()) return;
      if (key === 'check') {
        // Bật kiểm tra lỗi giữa chừng: các ô đang tô sai bị đánh dấu ngay và tính lỗi
        const n = sw.checked ? flagWrong(true) : 0;
        renderHud();
        if (n) toast(t('toast.flagged', { n }));
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
    N.SIZES.forEach((k) => {
      const b = stats.sizes[k];
      const tr = document.createElement('tr');
      const avg = b.solved ? formatTime(b.total / b.solved) : '—';
      const best = b.best !== null ? formatTime(b.best) : '—';
      [sizeText(k), b.played, b.solved, best, avg].forEach((v) => {
        const td = document.createElement('td');
        td.textContent = String(v);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    $('stats-pack-note').textContent = t('stats.note', { k: Object.keys(stats.pics).length, n: N.pictures().length });
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
    if (session && session.counted && !isSolved()) {
      // Tranh đang giải dở vẫn tính là đã chơi
      if (session.kind === 'daily') stats.daily.played = 1;
      else stats.sizes[session.size].played = 1;
    }
    saveStats();
    writeSummary();
    renderStats();
    toast(t('stats.resetDone'));
  });

  /* ---------------- Toast ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
  }

  /* ---------------- Nút ---------------- */
  $('btn-new').addEventListener('click', openNewGame);
  $('btn-stats').addEventListener('click', () => {
    renderStats();
    openModal('modal-stats');
  });
  $('btn-settings').addEventListener('click', () => {
    renderSettings();
    openModal('modal-settings');
  });
  $('btn-undo').addEventListener('click', doUndo);
  $('btn-redo').addEventListener('click', doRedo);
  $('btn-hint').addEventListener('click', useHint);
  $('btn-zoom').addEventListener('click', () => {
    zoomed = !zoomed;
    layout();
    if (zoomed && cellEls[cursor]) cellEls[cursor].scrollIntoView({ block: 'center', inline: 'center' });
    if (zoomed) toast(t('toast.zoom'));
  });
  $('btn-result-next').addEventListener('click', goNext);

  /* ---------------- Đồng hồ, ẩn tab, lưu định kỳ ---------------- */
  setInterval(() => {
    if (!session) return;
    renderTimer();
    if (!isSolved() && clockStart !== null && Date.now() - lastSaveAt >= AUTOSAVE_MS) {
      persist();
      writeSummary();
    }
  }, 250);

  document.addEventListener('visibilitychange', () => {
    if (!session) return;
    if (document.hidden) {
      endStroke(false);
      stopClock();
      persist();
      writeSummary();
    } else {
      startClock();
    }
  });
  window.addEventListener('pagehide', () => {
    if (!session) return;
    persist();
    writeSummary();
  });

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
    startClock();
    writeSummary();
    PN && PN.gameStart({ mode: 's' + session.size, resume: true });
  } else {
    startDefault();
  }
})();
