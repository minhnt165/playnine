/* =====================================================================
 * Sudoku - Game (chỉ chạy trong trình duyệt, cần engine.js nạp trước)
 *   1. Cài đặt, thống kê, tiến trình mở khóa (localStorage)
 *   2. Trạng thái ván chơi + lưu / khôi phục
 *   3. Render bàn cờ, bàn phím số, modal, xử lý input
 *   4. Gợi ý có giải thích dựa trên solver kỹ thuật của engine
 * ===================================================================== */
(() => {
  // Phiên bản app: tăng khi phát hành, đồng bộ với ?v= ở index.html để trình duyệt tải file mới
  const APP_VERSION = '1.1.0';
  const STORAGE_KEY = 'sudoku-vn-save-v1';
  const PROGRESS_KEY = 'sudoku-vn-progress-v1';
  const SETTINGS_KEY = 'sudoku-vn-settings-v1';
  const STATS_KEY = 'sudoku-vn-stats-v1';
  const MAX_MISTAKES = 3;
  const MAX_HINTS = 1; // số lượt gợi ý mỗi ván
  const GEN_ATTEMPTS = 60; // số lần thử sinh đề để đạt mức kỹ thuật yêu cầu

  // Thứ tự độ khó tăng dần. `unlockWins`: số ván phải thắng ở độ khó liền
  // trước để mở khóa. `minLevel`/`maxLevel`: mức kỹ thuật engine phải dùng để giải.
  const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'expert', 'extreme'];
  const DIFFICULTIES = {
    easy: { label: 'Dễ', givens: 40, minLevel: 1, maxLevel: 1, level: 1, unlockWins: 0, desc: 'Nhiều ô cho trước, chỉ cần đếm số còn thiếu' },
    medium: { label: 'Trung bình', givens: 34, minLevel: 1, maxLevel: 1, level: 2, unlockWins: 3, desc: 'Tìm vị trí duy nhất của mỗi số' },
    hard: { label: 'Khó', givens: 29, minLevel: 2, maxLevel: 2, level: 3, unlockWins: 3, desc: 'Cần cặp chỉ hướng, cặp trần; nên dùng ghi chú' },
    expert: { label: 'Chuyên gia', givens: 25, minLevel: 3, maxLevel: 3, level: 4, unlockWins: 3, desc: 'Cần cặp ẩn, bộ ba, X-Wing, XY-Wing' },
    extreme: { label: 'Cực khó', givens: 17, minLevel: 4, maxLevel: 4, level: 5, unlockWins: 3, desc: 'Vượt ngoài các kỹ thuật cơ bản, thử thách tối đa' },
  };
  // Độ khó ván hằng ngày theo thứ trong tuần (0 = Chủ nhật)
  const DAILY_BY_WEEKDAY = ['extreme', 'easy', 'medium', 'medium', 'hard', 'hard', 'expert'];

  /* ---------------- Cài đặt ---------------- */
  const DEFAULT_SETTINGS = { theme: 'auto', inputMode: 'cell', checkErrors: true, mistakeLimit: true };
  let settings = loadSettings();

  function loadSettings() {
    const s = { ...DEFAULT_SETTINGS };
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      if (['auto', 'light', 'dark'].includes(raw.theme)) s.theme = raw.theme;
      if (['cell', 'number'].includes(raw.inputMode)) s.inputMode = raw.inputMode;
      if (typeof raw.checkErrors === 'boolean') s.checkErrors = raw.checkErrors;
      if (typeof raw.mistakeLimit === 'boolean') s.mistakeLimit = raw.mistakeLimit;
    } catch (e) {
      /* dùng mặc định */
    }
    return s;
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      /* ignore */
    }
  }

  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    requestAnimationFrame(() => {
      const meta = document.getElementById('theme-color');
      if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim();
    });
  }

  /* ---------------- Thống kê ---------------- */
  let stats = loadStats();

  function loadStats() {
    const empty = { byDifficulty: {}, daily: { completed: {} } };
    try {
      const raw = JSON.parse(localStorage.getItem(STATS_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return empty;
      return {
        byDifficulty: raw.byDifficulty && typeof raw.byDifficulty === 'object' ? raw.byDifficulty : {},
        daily: { completed: raw.daily && raw.daily.completed && typeof raw.daily.completed === 'object' ? raw.daily.completed : {} },
      };
    } catch (e) {
      return empty;
    }
  }

  function saveStats() {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (e) {
      /* ignore */
    }
  }

  function diffStats(key) {
    if (!stats.byDifficulty[key]) stats.byDifficulty[key] = { started: 0, won: 0, lost: 0, bestTime: null, totalWonTime: 0 };
    return stats.byDifficulty[key];
  }

  /* ---------------- Ván hằng ngày ---------------- */
  const pad2 = (n) => String(n).padStart(2, '0');
  function dateKeyOf(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function todayKey() {
    return dateKeyOf(new Date());
  }
  function dailyDifficulty(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return DAILY_BY_WEEKDAY[new Date(y, m - 1, d).getDay()];
  }
  function formatDate(dateKey) {
    const [y, m, d] = dateKey.split('-');
    return `${d}/${m}/${y}`;
  }
  /** Thời gian hoàn thành ván hằng ngày của ngày `key` (giây), hoặc null nếu chưa xong. */
  function dailyTime(key) {
    const v = stats.daily.completed[key];
    return typeof v === 'number' ? v : null;
  }
  /** Số ngày liên tiếp đã hoàn thành ván hằng ngày (tính tới hôm nay hoặc hôm qua). */
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

  /* ---------------- Tiến trình mở khóa ---------------- */
  let progress = loadProgress(); // { wins: { easy: n, ... } }

  function loadProgress() {
    const empty = { wins: {} };
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (!raw) return empty;
      const p = JSON.parse(raw);
      if (!p || typeof p.wins !== 'object' || p.wins === null) return empty;
      return { wins: p.wins };
    } catch (e) {
      return empty;
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch (e) {
      /* ignore */
    }
  }

  function winsOf(difficulty) {
    return progress.wins[difficulty] || 0;
  }

  function prevDifficulty(difficulty) {
    const i = DIFFICULTY_ORDER.indexOf(difficulty);
    return i > 0 ? DIFFICULTY_ORDER[i - 1] : null;
  }

  function isUnlocked(difficulty) {
    const prev = prevDifficulty(difficulty);
    if (!prev) return true;
    return isUnlocked(prev) && winsOf(prev) >= DIFFICULTIES[difficulty].unlockWins;
  }

  /** Ghi nhận thắng, trả về độ khó vừa được mở khóa (nếu có). */
  function recordWin(difficulty) {
    const nextKey = DIFFICULTY_ORDER[DIFFICULTY_ORDER.indexOf(difficulty) + 1];
    const wasUnlocked = nextKey ? isUnlocked(nextKey) : true;
    progress.wins[difficulty] = winsOf(difficulty) + 1;
    saveProgress();
    if (nextKey && !wasUnlocked && isUnlocked(nextKey)) return nextKey;
    return null;
  }

  /* ---------------- State ván chơi ---------------- */
  let state = null;
  let selected = -1; // ô đang chọn (-1 = chưa chọn)
  let activeDigit = 0; // số đang chọn ở chế độ "chọn số trước" (0 = không)
  let notesMode = false;
  let timerId = null;
  let hintView = null; // gợi ý đang hiển thị
  let generating = false;
  let resumeAfterModal = false;

  function createState(difficulty, puzzle, solution, extra) {
    return {
      version: 1,
      difficulty,
      daily: null, // 'YYYY-MM-DD' nếu là ván hằng ngày
      level: 0, // mức kỹ thuật engine chấm
      puzzle: puzzle.slice(),
      solution: solution.slice(),
      board: puzzle.slice(),
      notes: new Array(Sudoku.CELLS).fill(0),
      initialGivens: puzzle.filter((v) => v !== 0).length,
      hintCells: [], // các ô đã điền bằng gợi ý (được ghi vào puzzle như ô đề bài)
      mistakes: 0,
      hintsUsed: 0,
      seconds: 0,
      history: [],
      status: 'playing', // playing | paused | won | lost
      ...extra,
    };
  }

  function save() {
    if (!state) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* bỏ qua nếu localStorage không khả dụng */
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      const arr81 = (a) => Array.isArray(a) && a.length === Sudoku.CELLS;
      if (!s || s.version !== 1 || !DIFFICULTIES[s.difficulty] || !arr81(s.puzzle) || !arr81(s.solution) || !arr81(s.board) || !arr81(s.notes)) {
        return null;
      }
      if (!Array.isArray(s.history)) s.history = [];
      if (!Array.isArray(s.hintCells)) {
        // Bản lưu cũ: suy ra từ lịch sử
        s.hintCells = s.history.filter((h) => h && h.hint).map((h) => h.idx);
      }
      if (typeof s.initialGivens !== 'number') {
        s.initialGivens = s.puzzle.filter((v) => v !== 0).length - s.hintCells.length;
      }
      if (typeof s.hintsUsed !== 'number') s.hintsUsed = s.hintCells.length;
      if (typeof s.daily !== 'string') s.daily = null;
      return s;
    } catch (e) {
      return null;
    }
  }

  function clearSave() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  /* ---------------- DOM refs ---------------- */
  const $ = (id) => document.getElementById(id);
  const appEl = document.querySelector('.app');
  const boardEl = $('board');
  const numpadEl = $('numpad');
  const pauseOverlay = $('pause-overlay');
  const genOverlay = $('gen-overlay');
  const difficultyLabel = $('difficulty-label');
  const mistakesLabel = $('mistakes-label');
  const mistakesCount = $('mistakes-count');
  const mistakesMax = $('mistakes-max');
  const progressFilled = $('progress-filled');
  const progressTotal = $('progress-total');
  const progressFill = $('progress-fill');
  const difficultyList = $('difficulty-list');
  const winUnlock = $('win-unlock');
  const timerLabel = $('timer-label');
  const btnPause = $('btn-pause');
  const btnResume = $('btn-resume');
  const btnNew = $('btn-new');
  const btnUndo = $('btn-undo');
  const btnErase = $('btn-erase');
  const btnNotes = $('btn-notes');
  const btnHint = $('btn-hint');
  const notesBadge = $('notes-badge');
  const hintBadge = $('hint-badge');
  const hintPanel = $('hint-panel');
  const hintTechnique = $('hint-technique');
  const hintText = $('hint-text');
  const hintValue = $('hint-value');
  const legendElim = $('legend-elim');
  const modalDifficulty = $('modal-difficulty');
  const modalWin = $('modal-win');
  const modalLose = $('modal-lose');
  const modalSettings = $('modal-settings');
  const modalStats = $('modal-stats');
  const difficultyWarning = $('difficulty-warning');
  const btnDifficultyCancel = $('btn-difficulty-cancel');
  const toastEl = $('toast');
  const versionEl = $('app-version');
  if (versionEl) versionEl.textContent = APP_VERSION;

  const cellEls = [];
  const noteEls = []; // noteEls[idx][d-1]
  const numEls = [];
  const countEls = [];

  /* ---------------- Build board & numpad ---------------- */
  function buildBoard() {
    boardEl.innerHTML = '';
    for (let i = 0; i < Sudoku.CELLS; i++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.idx = String(i);
      cell.tabIndex = i === 0 ? 0 : -1;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `Hàng ${Sudoku.ROW[i] + 1}, cột ${Sudoku.COL[i] + 1}`);
      if (Sudoku.COL[i] % 3 === 2 && Sudoku.COL[i] !== 8) cell.classList.add('box-right');
      if (Sudoku.ROW[i] % 3 === 2 && Sudoku.ROW[i] !== 8) cell.classList.add('box-bottom');

      const value = document.createElement('span');
      value.className = 'value';
      cell.appendChild(value);

      const notes = document.createElement('span');
      notes.className = 'notes';
      const spans = [];
      for (let d = 1; d <= 9; d++) {
        const s = document.createElement('span');
        s.textContent = String(d);
        notes.appendChild(s);
        spans.push(s);
      }
      cell.appendChild(notes);
      noteEls.push(spans);

      cell.addEventListener('click', () => tapCell(i));
      boardEl.appendChild(cell);
      cellEls.push(cell);
    }
  }

  function buildNumpad() {
    numpadEl.innerHTML = '';
    for (let d = 1; d <= 9; d++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'num';
      b.dataset.num = String(d);
      b.setAttribute('aria-label', `Số ${d}`);
      const label = document.createElement('span');
      label.textContent = String(d);
      const count = document.createElement('span');
      count.className = 'count';
      b.appendChild(label);
      b.appendChild(count);
      b.addEventListener('click', () => pressDigit(d));
      numpadEl.appendChild(b);
      numEls.push(b);
      countEls.push(count);
    }
  }

  /* ---------------- Render ---------------- */
  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${pad2(m)}:${pad2(s)}`;
  }

  /** Ô i được coi là "đã điền": đúng đáp án (khi báo lỗi) hoặc có số (khi không báo lỗi). */
  function isFilled(i) {
    const v = state.board[i];
    return v !== 0 && (!settings.checkErrors || v === state.solution[i]);
  }

  /** Số ô người chơi đã điền / tổng số ô trống ban đầu. */
  function progressInfo() {
    const total = Sudoku.CELLS - state.initialGivens;
    let n = 0;
    for (let i = 0; i < Sudoku.CELLS; i++) if (isFilled(i)) n++;
    return { filled: Math.max(0, n - state.initialGivens), total };
  }

  function difficultyName(s) {
    const label = DIFFICULTIES[s.difficulty].label;
    return s.daily ? `Hằng ngày · ${label}` : label;
  }

  function renderStatus() {
    difficultyLabel.textContent = state.daily ? 'Hằng ngày' : DIFFICULTIES[state.difficulty].label;
    difficultyLabel.title = difficultyName(state);
    if (settings.checkErrors) {
      mistakesCount.textContent = String(state.mistakes);
      mistakesMax.hidden = !settings.mistakeLimit;
      mistakesLabel.classList.toggle('warn', settings.mistakeLimit && state.mistakes >= MAX_MISTAKES - 1);
    } else {
      mistakesCount.textContent = '—';
      mistakesMax.hidden = true;
      mistakesLabel.classList.remove('warn');
    }
    const { filled, total } = progressInfo();
    progressFilled.textContent = String(filled);
    progressTotal.textContent = String(total);
    progressFill.style.width = `${total ? (filled / total) * 100 : 0}%`;
    timerLabel.textContent = formatTime(state.seconds);
    const paused = state.status === 'paused';
    appEl.classList.toggle('is-paused', paused);
    pauseOverlay.hidden = !paused;
    btnPause.setAttribute('aria-label', paused ? 'Tiếp tục' : 'Tạm dừng');
    btnPause.title = paused ? 'Tiếp tục' : 'Tạm dừng';
  }

  function renderBoard() {
    const paused = state.status === 'paused';
    const selVal = selected >= 0 ? state.board[selected] : 0;
    const hlDigit = activeDigit || selVal;
    const selRow = selected >= 0 ? Sudoku.ROW[selected] : -1;
    const selCol = selected >= 0 ? Sudoku.COL[selected] : -1;
    const selBox = selected >= 0 ? Sudoku.BOX[selected] : -1;
    const focusIdx = selected >= 0 ? selected : 0;
    const h = hintView;

    for (let i = 0; i < Sudoku.CELLS; i++) {
      const cell = cellEls[i];
      const v = state.board[i];
      const given = state.puzzle[i] !== 0;
      const cls = cell.classList;

      cell.firstChild.textContent = paused || !v ? '' : String(v);
      cell.tabIndex = i === focusIdx ? 0 : -1;
      cls.toggle('given', given);
      cls.toggle('error', !paused && settings.checkErrors && v !== 0 && v !== state.solution[i]);

      const inUnit = selected >= 0 && (Sudoku.ROW[i] === selRow || Sudoku.COL[i] === selCol || Sudoku.BOX[i] === selBox);
      const sameDigit = hlDigit !== 0 && v === hlDigit;
      cls.toggle('selected', !paused && i === selected);
      cls.toggle('same', !paused && !h && i !== selected && sameDigit);
      cls.toggle('highlight', !paused && !h && i !== selected && inUnit && !sameDigit);
      const isTarget = !!h && i === h.idx;
      const isReason = !!h && h.reason.includes(i);
      const isElim = !!h && !isTarget && !isReason && h.elimCells.includes(i);
      cls.toggle('hint-target', !paused && isTarget);
      cls.toggle('hint-reason', !paused && isReason && !isTarget);
      cls.toggle('hint-elim', !paused && isElim);
      cls.toggle('hint-unit', !paused && !!h && !isTarget && !isReason && !isElim && h.unit.includes(i));

      const mask = paused || v ? 0 : state.notes[i];
      const spans = noteEls[i];
      for (let d = 0; d < 9; d++) spans[d].classList.toggle('on', (mask & (1 << d)) !== 0);
    }
  }

  function renderNumpad() {
    const counts = new Array(10).fill(0);
    for (let i = 0; i < Sudoku.CELLS; i++) if (isFilled(i)) counts[state.board[i]]++;
    for (let d = 1; d <= 9; d++) {
      const left = 9 - counts[d];
      countEls[d - 1].textContent = String(left);
      numEls[d - 1].classList.toggle('done', left <= 0);
      numEls[d - 1].disabled = left <= 0;
      if (left <= 0 && activeDigit === d) activeDigit = 0;
      numEls[d - 1].classList.toggle('active', activeDigit === d);
      numEls[d - 1].setAttribute('aria-pressed', String(activeDigit === d));
    }
  }

  function renderTools() {
    const playing = !!state && state.status === 'playing';
    btnUndo.disabled = !playing || state.history.length === 0;
    btnErase.disabled = !playing;
    const hintsLeft = state ? Math.max(0, MAX_HINTS - state.hintsUsed) : 0;
    btnHint.disabled = !playing || hintsLeft <= 0;
    hintBadge.textContent = String(hintsLeft);
    btnHint.title = hintsLeft > 0 ? `Còn ${hintsLeft} lượt gợi ý` : 'Đã hết lượt gợi ý';
    btnNotes.disabled = !playing;
    btnNotes.classList.toggle('active', notesMode);
    btnNotes.setAttribute('aria-pressed', String(notesMode));
    notesBadge.textContent = notesMode ? 'Bật' : 'Tắt';
    appEl.classList.toggle('notes-mode', notesMode);
    appEl.classList.toggle('number-first', settings.inputMode === 'number');
  }

  function renderAll() {
    if (!state) {
      renderTools();
      return;
    }
    renderStatus();
    renderBoard();
    renderNumpad();
    renderTools();
  }

  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 2800);
  }

  /* ---------------- Timer ---------------- */
  function startTimer() {
    stopTimer();
    timerId = setInterval(() => {
      if (state && state.status === 'playing') {
        state.seconds++;
        timerLabel.textContent = formatTime(state.seconds);
        if (state.seconds % 5 === 0) save();
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function pauseGame() {
    if (!state || state.status !== 'playing') return;
    closeHint();
    state.status = 'paused';
    save();
    renderAll();
  }

  function resumeGame() {
    if (!state || state.status !== 'paused') return;
    state.status = 'playing';
    save();
    renderAll();
  }

  /* ---------------- Game actions ---------------- */
  function selectCell(i) {
    if (!state || state.status !== 'playing') return;
    closeHint();
    selected = i;
    renderBoard();
  }

  /** Nhấp/chạm vào ô: chọn ô, và ở chế độ "chọn số trước" thì điền luôn số đang chọn. */
  function tapCell(i) {
    if (!state || state.status !== 'playing') return;
    selectCell(i);
    if (settings.inputMode === 'number' && activeDigit) inputNumber(activeDigit);
  }

  /** Nhấn số trên bàn phím số / phím 1-9. */
  function pressDigit(d) {
    if (!state || state.status !== 'playing') return;
    if (settings.inputMode === 'number') {
      closeHint();
      activeDigit = activeDigit === d ? 0 : d;
      renderBoard();
      renderNumpad();
      return;
    }
    inputNumber(d);
  }

  function pushHistory(entry) {
    state.history.push(entry);
    if (state.history.length > 500) state.history.shift();
  }

  /** Xóa số `d` khỏi ghi chú của các ô cùng hàng/cột/vùng với `idx`. */
  function clearPeerNotes(idx, d) {
    const bit = 1 << (d - 1);
    const changed = [];
    for (const p of Sudoku.PEERS[idx]) {
      if (state.notes[p] & bit) {
        changed.push({ idx: p, prevNotes: state.notes[p] });
        state.notes[p] &= ~bit;
      }
    }
    return changed;
  }

  /** Ô đã đúng và đang bật báo lỗi thì khóa, không cho sửa/xóa. */
  function isLocked(idx) {
    if (state.puzzle[idx] !== 0) return true;
    return settings.checkErrors && state.board[idx] !== 0 && state.board[idx] === state.solution[idx];
  }

  function inputNumber(d) {
    if (!state || state.status !== 'playing') return;
    if (selected < 0) return;
    closeHint();
    const idx = selected;
    if (isLocked(idx)) return;

    if (notesMode) {
      if (state.board[idx] !== 0) return; // có số thì không ghi chú
      pushHistory({ idx, prevValue: 0, prevNotes: state.notes[idx], peers: [] });
      state.notes[idx] ^= 1 << (d - 1);
      save();
      renderBoard();
      renderTools();
      return;
    }

    if (state.board[idx] === d) return;

    const entry = { idx, prevValue: state.board[idx], prevNotes: state.notes[idx], peers: [] };
    state.board[idx] = d;
    state.notes[idx] = 0;

    const right = d === state.solution[idx];
    if (!right && settings.checkErrors) {
      state.mistakes++;
      animateCell(idx, 'shake');
    } else {
      entry.peers = clearPeerNotes(idx, d);
      animateCell(idx, 'pop');
    }
    pushHistory(entry);

    if (settings.checkErrors && settings.mistakeLimit && state.mistakes >= MAX_MISTAKES) {
      finishLose();
      return;
    }
    if (isSolved()) {
      finishWin();
      return;
    }
    if (!settings.checkErrors && state.board.every((v) => v !== 0)) {
      toast('Bàn cờ đã đầy nhưng vẫn còn số sai. Hãy kiểm tra lại.');
    }
    save();
    renderAll();
  }

  function erase() {
    if (!state || state.status !== 'playing' || selected < 0) return;
    closeHint();
    const idx = selected;
    if (isLocked(idx)) return;
    if (state.board[idx] === 0 && state.notes[idx] === 0) return;
    pushHistory({ idx, prevValue: state.board[idx], prevNotes: state.notes[idx], peers: [] });
    state.board[idx] = 0;
    state.notes[idx] = 0;
    save();
    renderAll();
  }

  function undo() {
    if (!state || state.status !== 'playing') return;
    closeHint();
    const entry = state.history.pop();
    if (!entry) return;
    if (entry.hint) {
      state.puzzle[entry.idx] = 0;
      state.hintCells = state.hintCells.filter((c) => c !== entry.idx);
    }
    state.board[entry.idx] = entry.prevValue;
    state.notes[entry.idx] = entry.prevNotes;
    for (let k = entry.peers.length - 1; k >= 0; k--) state.notes[entry.peers[k].idx] = entry.peers[k].prevNotes;
    selected = entry.idx;
    save();
    renderAll();
  }

  /* ---------------- Gợi ý có giải thích ---------------- */
  function unitName(unit) {
    if (unit.type === 'row') return `hàng ${unit.index + 1}`;
    if (unit.type === 'col') return `cột ${unit.index + 1}`;
    const br = Math.floor(unit.index / 3) * 3;
    const bc = (unit.index % 3) * 3;
    return `vùng 3x3 (hàng ${br + 1}–${br + 3}, cột ${bc + 1}–${bc + 3})`;
  }

  function cellName(idx) {
    return `hàng ${Sudoku.ROW[idx] + 1}, cột ${Sudoku.COL[idx] + 1}`;
  }

  /** Tên ngắn "H3C5" (hàng 3, cột 5) dùng khi liệt kê nhiều ô. */
  function shortCell(idx) {
    return `H${Sudoku.ROW[idx] + 1}C${Sudoku.COL[idx] + 1}`;
  }

  function listCells(idxs) {
    return idxs.map(shortCell).join(', ');
  }

  function uniqueIdx(elims) {
    return [...new Set(elims.map((e) => e.idx))];
  }

  function joinDigits(ds) {
    return ds.length <= 2 ? ds.join(' và ') : `${ds.slice(0, -1).join(', ')} và ${ds[ds.length - 1]}`;
  }

  /** Bàn cờ chỉ gồm các số đúng (số sai được coi như ô trống khi suy luận). */
  function trustedBoard() {
    return state.board.map((v, i) => (v !== 0 && v === state.solution[i] ? v : 0));
  }

  /** Diễn giải một bước suy luận của engine bằng tiếng Việt. */
  function describeStep(s) {
    const t = s.technique;
    if (t === 'naked-single') {
      const others = [];
      for (let e = 1; e <= 9; e++) if (e !== s.value) others.push(e);
      return `Ô ${cellName(s.idx)} chỉ có thể là ${s.value}. Tám số còn lại (${others.join(', ')}) đều đã xuất hiện trong hàng, cột hoặc vùng 3x3 chứa ô này (các ô vàng).`;
    }
    if (t === 'hidden-single') {
      const name = unitName(s.unitRef);
      return `Trong ${name}, số ${s.value} chỉ có thể đặt vào ô ${cellName(s.idx)}. Mọi ô trống khác của ${name} đều nằm cùng hàng, cột hoặc vùng 3x3 với một số ${s.value} đã có (các ô vàng) hoặc đã bị loại ${s.value} ở bước trước.`;
    }
    const targets = listCells(uniqueIdx(s.eliminations));
    if (t === 'pointing') {
      const box = unitName(s.boxUnit);
      const line = unitName(s.lineUnit);
      return `Trong ${box}, số ${s.digit} chỉ có thể nằm ở các ô vàng, và chúng đều thuộc ${line}. Vì ${box} chắc chắn chứa ${s.digit} tại một trong các ô đó, phần còn lại của ${line} không thể là ${s.digit}: loại ${s.digit} khỏi ${targets}.`;
    }
    if (t === 'claiming') {
      const box = unitName(s.boxUnit);
      const line = unitName(s.lineUnit);
      return `Trong ${line}, số ${s.digit} chỉ có thể nằm ở các ô vàng, và chúng đều thuộc ${box}. Vì vậy các ô khác của ${box} không thể là ${s.digit}: loại ${s.digit} khỏi ${targets}.`;
    }
    if (t === 'naked-pair') {
      const name = unitName(s.unitRef);
      return `Hai ô ${listCells(s.cells)} trong ${name} chỉ có thể là ${joinDigits(s.digits)}. Hai số này chắc chắn chiếm hai ô đó, nên các ô khác trong ${name} không thể là ${joinDigits(s.digits)}: loại khỏi ${targets}.`;
    }
    if (t === 'hidden-pair') {
      const name = unitName(s.unitRef);
      const removed = [...new Set(s.eliminations.map((e) => e.digit))];
      return `Trong ${name}, hai số ${joinDigits(s.digits)} chỉ có thể nằm ở hai ô ${listCells(s.cells)}. Hai ô này vì thế không thể chứa số nào khác: loại ${joinDigits(removed)} khỏi ${targets}.`;
    }
    if (t === 'naked-triple') {
      const name = unitName(s.unitRef);
      return `Ba ô ${listCells(s.cells)} trong ${name} chỉ chứa các số ${joinDigits(s.digits)}. Ba số này chắc chắn chiếm ba ô đó, nên các ô khác trong ${name} không thể là chúng: loại khỏi ${targets}.`;
    }
    if (t === 'hidden-triple') {
      const name = unitName(s.unitRef);
      const removed = [...new Set(s.eliminations.map((e) => e.digit))];
      return `Trong ${name}, ba số ${joinDigits(s.digits)} chỉ có thể nằm ở ba ô ${listCells(s.cells)}. Ba ô này vì thế không thể chứa số nào khác: loại ${joinDigits(removed)} khỏi ${targets}.`;
    }
    if (t === 'x-wing') {
      const [l1, l2] = s.lines.map(unitName);
      const [c1, c2] = s.crossLines.map(unitName);
      const crossType = s.crossLines[0].type === 'col' ? 'cột' : 'hàng';
      return `Số ${s.digit} ở ${l1} và ${l2} đều chỉ có thể nằm ở ${c1} hoặc ${c2} (4 ô vàng). Dù xếp cách nào, ${s.digit} cũng chiếm một ô ở mỗi ${crossType} đó, nên các ô khác của ${c1} và ${c2} không thể là ${s.digit}: loại ${s.digit} khỏi ${targets}.`;
    }
    if (t === 'xy-wing') {
      const [x, y] = s.pivotDigits;
      return `Ô trụ ${shortCell(s.pivot)} chỉ có thể là ${x} hoặc ${y}. Hai ô cánh ${listCells(s.wings)} cùng nhìn thấy ô trụ, mỗi ô lấy một trong hai số đó kèm số ${s.digit}. Dù ô trụ là ${x} hay ${y}, một trong hai ô cánh chắc chắn là ${s.digit}, nên ô nhìn thấy cả hai cánh không thể là ${s.digit}: loại ${s.digit} khỏi ${targets}.`;
    }
    if (t === 'swordfish') {
      const lines = s.lines.map(unitName).join(', ');
      const cross = s.crossLines.map(unitName).join(', ');
      return `Số ${s.digit} ở ${lines} chỉ có thể nằm trong ${cross} (các ô vàng). Ba ${s.lines[0].type === 'row' ? 'hàng' : 'cột'} này sẽ chiếm trọn ${s.digit} của ba ${s.crossLines[0].type === 'col' ? 'cột' : 'hàng'} đó, nên các ô khác của chúng không thể là ${s.digit}: loại ${s.digit} khỏi ${targets}.`;
    }
    return '';
  }

  function placeSummary(s) {
    if (s.technique === 'hidden-single') {
      return `số ${s.value} chỉ còn một vị trí trong ${unitName(s.unitRef)} là ô ${cellName(s.idx)}.`;
    }
    return `ô ${cellName(s.idx)} chỉ còn số ${s.value}.`;
  }

  /** Gói bước điền (kèm các bước loại trừ dẫn tới nó) thành gợi ý hiển thị. */
  function buildHint(elimSteps, place) {
    const label = (t) => Sudoku.TECHNIQUES[t].label;
    if (!elimSteps.length) {
      return { idx: place.idx, value: place.value, technique: label(place.technique), text: describeStep(place), reason: place.reason, unit: place.unit, elimCells: [], elims: [] };
    }
    const first = elimSteps[0];
    const more = elimSteps.length - 1;
    const bridge = more > 0 ? `Sau thêm ${more} bước loại trừ tương tự, ` : 'Sau bước này, ';
    const elims = [];
    for (const s of elimSteps) elims.push(...s.eliminations);
    return {
      idx: place.idx,
      value: place.value,
      technique: label(first.technique),
      text: `${describeStep(first)} ${bridge}${placeSummary(place)}`,
      reason: first.reason,
      unit: first.unit,
      elimCells: uniqueIdx(first.eliminations),
      elims,
    };
  }

  /** Tìm bước gợi ý tốt nhất kèm giải thích. */
  function findHint() {
    // 1. Có số sai trên bàn cờ: chỉ ra ô sai trước
    const wrong = [];
    for (let i = 0; i < Sudoku.CELLS; i++) {
      if (state.board[i] !== 0 && state.board[i] !== state.solution[i]) wrong.push(i);
    }
    if (wrong.length) {
      const idx = wrong.includes(selected) ? selected : wrong[0];
      return {
        idx,
        value: state.solution[idx],
        technique: 'Có số sai',
        text: `Số ${state.board[idx]} ở ô ${cellName(idx)} không đúng, đáp án của ô này là ${state.solution[idx]}. Hãy sửa ô sai trước khi suy luận tiếp.`,
        reason: [],
        unit: [],
        elimCells: [],
        elims: [],
      };
    }

    const b = trustedBoard();
    const g = Sudoku.makeGrid(b);
    // 2. Ưu tiên ô đang chọn nếu suy luận được ngay tại đó
    if (selected >= 0 && !b[selected]) {
      const s = Sudoku.singleAt(g, selected);
      if (s) return buildHint([], s);
    }
    // 3. Chạy solver kỹ thuật cho tới bước điền số đầu tiên
    const elimSteps = [];
    for (let guard = 0; guard < 60; guard++) {
      const step = Sudoku.nextStep(g);
      if (!step) break;
      if (step.type === 'place') return buildHint(elimSteps, step);
      elimSteps.push(step);
      Sudoku.applyStep(g, step);
    }
    // 4. Bế tắc: đưa đáp án của ô đang chọn (hoặc ô trống đầu tiên)
    const idx = selected >= 0 && !b[selected] ? selected : b.indexOf(0);
    if (idx < 0) return null;
    return {
      idx,
      value: state.solution[idx],
      technique: 'Cần kỹ thuật nâng cao',
      text: `Ở trạng thái hiện tại không có ô nào suy ra được bằng các kỹ thuật thông dụng (single, cặp, bộ ba, X-Wing, XY-Wing, Swordfish). Đáp án của ô ${cellName(idx)} là ${state.solution[idx]}.`,
      reason: [],
      unit: [],
      elimCells: [],
      elims: [],
    };
  }

  function hint() {
    if (!state || state.status !== 'playing') return;
    if (state.hintsUsed >= MAX_HINTS) return;
    const h = findHint();
    if (!h) return;
    state.hintsUsed++; // lượt gợi ý tính từ lúc xem, không hoàn lại
    hintView = h;
    selected = h.idx;
    activeDigit = 0;
    hintTechnique.textContent = h.technique;
    hintText.textContent = h.text;
    hintValue.textContent = String(h.value);
    legendElim.hidden = h.elimCells.length === 0;
    hintPanel.hidden = false;
    save();
    renderAll();
    hintPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function closeHint() {
    if (!hintView) return;
    hintView = null;
    hintPanel.hidden = true;
    renderBoard();
  }

  function applyHint() {
    if (!hintView || !state || state.status !== 'playing') return;
    const { idx, value: d, elims } = hintView;
    closeHint();
    if (state.board[idx] === d) return;
    const entry = { idx, prevValue: state.board[idx], prevNotes: state.notes[idx], peers: [], hint: true };
    // Bỏ các ứng viên đã bị loại trong lập luận khỏi ghi chú của người chơi
    for (const e of elims) {
      const bit = 1 << (e.digit - 1);
      if (state.notes[e.idx] & bit) {
        entry.peers.push({ idx: e.idx, prevNotes: state.notes[e.idx] });
        state.notes[e.idx] &= ~bit;
      }
    }
    state.board[idx] = d;
    state.notes[idx] = 0;
    state.puzzle[idx] = d; // gợi ý được coi như ô đề bài
    if (!state.hintCells.includes(idx)) state.hintCells.push(idx);
    entry.peers.push(...clearPeerNotes(idx, d));
    pushHistory(entry);
    selected = idx;
    animateCell(idx, 'pop');

    if (isSolved()) {
      finishWin();
      return;
    }
    save();
    renderAll();
  }

  function animateCell(idx, cls) {
    const el = cellEls[idx];
    el.classList.remove('pop', 'shake');
    void el.offsetWidth; // ép trình duyệt tính lại để chạy lại animation
    el.classList.add(cls);
  }

  function toggleNotes() {
    if (!state || state.status !== 'playing') return;
    notesMode = !notesMode;
    renderTools();
  }

  function isSolved() {
    for (let i = 0; i < Sudoku.CELLS; i++) {
      if (state.board[i] !== state.solution[i]) return false;
    }
    return true;
  }

  function moveSelection(dr, dc) {
    if (!state || state.status !== 'playing') return;
    if (selected < 0) {
      selectCell(0);
    } else {
      const r = (Sudoku.ROW[selected] + dr + 9) % 9;
      const c = (Sudoku.COL[selected] + dc + 9) % 9;
      selectCell(r * 9 + c);
    }
    cellEls[selected].focus({ preventScroll: true });
  }

  /* ---------------- New game / retry ---------------- */
  function newGame(difficulty, dateKey = null) {
    if (generating) return;
    closeHint();
    stopTimer();
    generating = true;
    genOverlay.hidden = false;
    const info = DIFFICULTIES[difficulty];
    const spec = { givens: info.givens, minLevel: info.minLevel, maxLevel: info.maxLevel };
    // Trì hoãn một nhịp để trình duyệt vẽ overlay "đang tạo đề" trước
    setTimeout(() => {
      let result;
      if (dateKey) {
        const seed = Sudoku.hashString(`sudoku-daily-${dateKey}`);
        result = Sudoku.withRandom(Sudoku.seededRandom(seed), () => Sudoku.generatePuzzle(spec, GEN_ATTEMPTS));
      } else {
        result = Sudoku.generatePuzzle(spec, GEN_ATTEMPTS);
      }
      generating = false;
      genOverlay.hidden = true;
      state = createState(difficulty, result.puzzle, result.solution, { daily: dateKey, level: result.level });
      if (!dateKey) {
        diffStats(difficulty).started++;
        saveStats();
      }
      selected = -1;
      activeDigit = 0;
      notesMode = false;
      save();
      renderAll();
      startTimer();
    }, 30);
  }

  function retryGame() {
    if (!state) return;
    closeHint();
    // Khôi phục đề gốc: bỏ các ô gợi ý đã được ghi vào puzzle
    for (const idx of state.hintCells) state.puzzle[idx] = 0;
    state.hintCells = [];
    state.board = state.puzzle.slice();
    state.notes = new Array(Sudoku.CELLS).fill(0);
    state.mistakes = 0;
    state.hintsUsed = 0;
    state.seconds = 0;
    state.history = [];
    state.status = 'playing';
    selected = -1;
    activeDigit = 0;
    notesMode = false;
    save();
    renderAll();
    startTimer();
  }

  /* ---------------- Kết thúc ván ---------------- */
  function finishWin() {
    stopTimer();
    state.status = 'won';
    const notes = [];
    if (state.daily) {
      const prev = dailyTime(state.daily);
      stats.daily.completed[state.daily] = prev === null ? state.seconds : Math.min(prev, state.seconds);
      notes.push(`📅 Hoàn thành ván hằng ngày · chuỗi ${dailyStreak()} ngày`);
      state.unlocked = null;
    } else {
      const unlockedKey = recordWin(state.difficulty);
      const s = diffStats(state.difficulty);
      s.won++;
      s.totalWonTime += state.seconds;
      if (s.bestTime === null || state.seconds < s.bestTime) {
        if (s.bestTime !== null) notes.push('🏆 Kỷ lục thời gian mới!');
        s.bestTime = state.seconds;
      }
      if (unlockedKey) notes.unshift(`🔓 Đã mở khóa độ khó ${DIFFICULTIES[unlockedKey].label}!`);
      state.unlocked = unlockedKey || null;
    }
    state.winNotes = notes;
    saveStats();
    save();
    renderAll();
    showWin();
  }

  function finishLose() {
    stopTimer();
    state.status = 'lost';
    if (!state.daily) {
      diffStats(state.difficulty).lost++;
      saveStats();
    }
    save();
    renderAll();
    showLose();
  }

  /* ---------------- Modals ---------------- */
  function showModal(el) {
    el.hidden = false;
  }
  function hideModal(el) {
    el.hidden = true;
  }
  function anyModalOpen() {
    return [modalDifficulty, modalWin, modalLose, modalSettings, modalStats].some((m) => !m.hidden);
  }

  const LOCK_SVG =
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zm-7-2a2 2 0 0 1 4 0v2h-4V6z"/></svg>';
  const TROPHY_SVG =
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 4h-2V3a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1H5a2 2 0 0 0-2 2v1a5 5 0 0 0 4.4 4.96A6 6 0 0 0 11 15.9V18H8v2h8v-2h-3v-2.1a6 6 0 0 0 3.6-3.94A5 5 0 0 0 21 7V6a2 2 0 0 0-2-2zM5 7V6h2v3.83A3 3 0 0 1 5 7zm14 0a3 3 0 0 1-2 2.83V6h2v1z"/></svg>';
  const CAL_SVG =
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2zm-2 8v10h14V10H5zm2 2h3v3H7v-3z"/></svg>';

  function buildDifficultyList() {
    difficultyList.innerHTML = '';

    // Ván hằng ngày
    const dateKey = todayKey();
    const dKey = dailyDifficulty(dateKey);
    const doneTime = dailyTime(dateKey);
    const streak = dailyStreak();
    const daily = document.createElement('button');
    daily.type = 'button';
    daily.className = 'difficulty-option daily';
    if (state && state.daily === dateKey) daily.classList.add('current');
    const badge =
      doneTime !== null
        ? `<span class="difficulty-badge done">✓ ${formatTime(doneTime)}</span>`
        : `<span class="difficulty-badge wins">Hôm nay</span>`;
    daily.innerHTML = `
      <span class="difficulty-cal" aria-hidden="true">${CAL_SVG}</span>
      <span class="difficulty-text">
        <span class="difficulty-name">Ván hằng ngày</span>
        <span class="difficulty-desc">${formatDate(dateKey)} · ${DIFFICULTIES[dKey].label}${streak ? ` · chuỗi ${streak} ngày` : ''}</span>
      </span>
      ${badge}`;
    daily.setAttribute('aria-label', `Ván hằng ngày ${formatDate(dateKey)}, độ khó ${DIFFICULTIES[dKey].label}`);
    daily.addEventListener('click', () => startFromPicker(dKey, dateKey));
    difficultyList.appendChild(daily);

    for (const key of DIFFICULTY_ORDER) {
      const info = DIFFICULTIES[key];
      const unlocked = isUnlocked(key);
      const prev = prevDifficulty(key);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'difficulty-option';
      btn.dataset.difficulty = key;
      btn.disabled = !unlocked;
      if (state && !state.daily && state.difficulty === key) btn.classList.add('current');

      let dots = '';
      for (let i = 1; i <= 5; i++) dots += `<i class="${i <= info.level ? 'on' : ''}"></i>`;

      const b = unlocked
        ? `<span class="difficulty-badge wins">${TROPHY_SVG}${winsOf(key)}</span>`
        : `<span class="difficulty-badge locked">${LOCK_SVG}Khóa</span>`;
      const desc = unlocked
        ? info.desc
        : `Thắng ${info.unlockWins} ván ${DIFFICULTIES[prev].label} để mở (${Math.min(winsOf(prev), info.unlockWins)}/${info.unlockWins})`;

      btn.innerHTML = `
        <span class="difficulty-dots" aria-hidden="true">${dots}</span>
        <span class="difficulty-text">
          <span class="difficulty-name">${info.label}</span>
          <span class="difficulty-desc">${desc}</span>
        </span>
        ${b}`;
      btn.setAttribute('aria-label', unlocked ? info.label : `${info.label} (đang khóa)`);
      btn.addEventListener('click', () => {
        if (isUnlocked(key)) startFromPicker(key, null);
      });
      difficultyList.appendChild(btn);
    }
  }

  function startFromPicker(key, dateKey) {
    hideModal(modalDifficulty);
    hideModal(modalWin);
    hideModal(modalLose);
    newGame(key, dateKey);
  }

  function showDifficultyPicker() {
    const inProgress = state && (state.status === 'playing' || state.status === 'paused');
    difficultyWarning.hidden = !inProgress;
    btnDifficultyCancel.hidden = !state;
    if (state && state.status === 'playing') pauseGame();
    buildDifficultyList();
    showModal(modalDifficulty);
  }

  function closeDifficultyPicker() {
    if (!state) return; // chưa có ván nào thì không cho đóng
    hideModal(modalDifficulty);
    if (state.status === 'paused') resumeGame();
  }

  function showWin() {
    $('win-difficulty').textContent = difficultyName(state);
    $('win-time').textContent = formatTime(state.seconds);
    $('win-mistakes').textContent = settings.checkErrors ? String(state.mistakes) : '—';
    const notes = state.winNotes || [];
    winUnlock.hidden = notes.length === 0;
    winUnlock.textContent = notes.join(' · ');
    showModal(modalWin);
  }

  function showLose() {
    showModal(modalLose);
  }

  /** Mở modal phụ (cài đặt / thống kê): tạm dừng ván, đóng thì tiếp tục. */
  function openSideModal(el) {
    resumeAfterModal = !!state && state.status === 'playing';
    if (resumeAfterModal) pauseGame();
    showModal(el);
  }

  function closeSideModal(el) {
    hideModal(el);
    if (resumeAfterModal && state && state.status === 'paused' && !anyModalOpen()) resumeGame();
    resumeAfterModal = false;
  }

  /* ---------------- Cài đặt ---------------- */
  function renderSettings() {
    modalSettings.querySelectorAll('.segmented').forEach((seg) => {
      const key = seg.dataset.setting;
      seg.querySelectorAll('button').forEach((b) => {
        const on = b.dataset.value === settings[key];
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      });
    });
    modalSettings.querySelectorAll('input[data-setting]').forEach((input) => {
      input.checked = !!settings[input.dataset.setting];
    });
    const limit = modalSettings.querySelector('input[data-setting="mistakeLimit"]');
    limit.disabled = !settings.checkErrors;
    $('setting-mistake-limit').classList.toggle('is-disabled', !settings.checkErrors);
  }

  function updateSetting(key, value) {
    if (settings[key] === value) return;
    settings[key] = value;
    saveSettings();
    if (key === 'theme') applyTheme();
    if (key === 'inputMode') activeDigit = 0;
    renderSettings();
    renderAll();
  }

  function openSettings() {
    renderSettings();
    openSideModal(modalSettings);
  }

  /* ---------------- Thống kê ---------------- */
  function renderStats() {
    const times = Object.values(stats.daily.completed).filter((v) => typeof v === 'number');
    const dailyDone = times.length;
    const dailyBest = dailyDone ? Math.min(...times) : null;
    $('stats-streak').textContent = String(dailyStreak());
    $('stats-daily-total').textContent = String(dailyDone);
    $('stats-daily-best').textContent = dailyBest === null ? '—' : formatTime(dailyBest);

    const body = $('stats-body');
    body.innerHTML = '';
    for (const key of DIFFICULTY_ORDER) {
      const s = stats.byDifficulty[key] || { won: 0, lost: 0, bestTime: null, totalWonTime: 0 };
      const tr = document.createElement('tr');
      const avg = s.won ? formatTime(Math.round(s.totalWonTime / s.won)) : '—';
      tr.innerHTML = `<td>${DIFFICULTIES[key].label}</td><td>${s.won}</td><td>${s.lost}</td><td>${s.bestTime === null ? '—' : formatTime(s.bestTime)}</td><td>${avg}</td>`;
      body.appendChild(tr);
    }
  }

  function openStats() {
    renderStats();
    openSideModal(modalStats);
  }

  function resetStats() {
    if (!window.confirm('Xóa toàn bộ thống kê và tiến trình mở khóa?')) return;
    stats = { byDifficulty: {}, daily: { completed: {} } };
    progress = { wins: {} };
    saveStats();
    saveProgress();
    renderStats();
    toast('Đã đặt lại thống kê.');
  }

  /* ---------------- Events ---------------- */
  btnNew.addEventListener('click', showDifficultyPicker);
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-stats').addEventListener('click', openStats);
  $('btn-stats-reset').addEventListener('click', resetStats);
  btnPause.addEventListener('click', () => {
    if (!state) return;
    if (state.status === 'playing') pauseGame();
    else if (state.status === 'paused') resumeGame();
  });
  btnResume.addEventListener('click', resumeGame);
  btnUndo.addEventListener('click', undo);
  btnErase.addEventListener('click', erase);
  btnNotes.addEventListener('click', toggleNotes);
  btnHint.addEventListener('click', hint);
  $('btn-hint-apply').addEventListener('click', applyHint);
  $('btn-hint-close').addEventListener('click', closeHint);
  $('btn-hint-self').addEventListener('click', closeHint);

  document.querySelectorAll('[data-close]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.close;
      if (id === 'modal-difficulty') closeDifficultyPicker();
      else closeSideModal($(id));
    });
  });

  modalSettings.querySelectorAll('.segmented button').forEach((b) => {
    b.addEventListener('click', () => updateSetting(b.closest('.segmented').dataset.setting, b.dataset.value));
  });
  modalSettings.querySelectorAll('input[data-setting]').forEach((input) => {
    input.addEventListener('change', () => updateSetting(input.dataset.setting, input.checked));
  });

  $('btn-win-new').addEventListener('click', () => {
    hideModal(modalWin);
    showDifficultyPicker();
  });
  $('btn-lose-new').addEventListener('click', () => {
    hideModal(modalLose);
    showDifficultyPicker();
  });
  $('btn-lose-retry').addEventListener('click', () => {
    hideModal(modalLose);
    retryGame();
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key;

    if (anyModalOpen()) {
      if (key !== 'Escape') return;
      if (!modalSettings.hidden) closeSideModal(modalSettings);
      else if (!modalStats.hidden) closeSideModal(modalStats);
      else if (!modalDifficulty.hidden && state) closeDifficultyPicker();
      else return;
      e.preventDefault();
      return;
    }
    if (!state) return;

    if (key >= '1' && key <= '9') {
      pressDigit(Number(key));
      e.preventDefault();
    } else if (key === 'Backspace' || key === 'Delete' || key === '0') {
      erase();
      e.preventDefault();
    } else if (key === 'ArrowUp') {
      moveSelection(-1, 0);
      e.preventDefault();
    } else if (key === 'ArrowDown') {
      moveSelection(1, 0);
      e.preventDefault();
    } else if (key === 'ArrowLeft') {
      moveSelection(0, -1);
      e.preventDefault();
    } else if (key === 'ArrowRight') {
      moveSelection(0, 1);
      e.preventDefault();
    } else if (key === 'n' || key === 'N') {
      toggleNotes();
      e.preventDefault();
    } else if (key === 'z' || key === 'Z') {
      undo();
      e.preventDefault();
    } else if (key === 'h' || key === 'H') {
      hint();
      e.preventDefault();
    } else if (key === 'Escape' && hintView) {
      closeHint();
      e.preventDefault();
    } else if (key === 'Escape' && activeDigit) {
      activeDigit = 0;
      renderBoard();
      renderNumpad();
      e.preventDefault();
    } else if (key === 'p' || key === 'P' || key === 'Escape') {
      if (state.status === 'playing') pauseGame();
      else if (state.status === 'paused') resumeGame();
      e.preventDefault();
    }
  });

  // Tự tạm dừng khi chuyển tab / ẩn trang
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state && state.status === 'playing') pauseGame();
  });
  window.addEventListener('pagehide', save);
  window.addEventListener('beforeunload', save);
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  }

  /* ---------------- Init ---------------- */
  function init() {
    applyTheme();
    buildBoard();
    buildNumpad();
    const saved = load();
    if (saved) {
      state = saved;
      if (state.status === 'won') {
        renderAll();
        showWin();
      } else if (state.status === 'lost') {
        renderAll();
        showLose();
      } else {
        // Mở lại trang: bắt đầu ở trạng thái tạm dừng để người chơi chủ động tiếp tục
        state.status = 'paused';
        renderAll();
        startTimer();
      }
    } else {
      clearSave();
      state = null;
      renderAll();
      showDifficultyPicker();
    }
  }

  init();
})();
