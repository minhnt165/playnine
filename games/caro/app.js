/* =====================================================================
 * Cờ Caro - Game (chỉ chạy trong trình duyệt, cần engine.js nạp trước)
 *   1. Lưu trữ: cài đặt, thống kê, ván đang chơi, tóm tắt cho cổng PlayNine
 *   2. Trạng thái ván: đi quân, đi lại, đổi bên, kết thúc ván
 *   3. Máy tính nước trong Web Worker (Blob dựng từ mã engine)
 *   4. Render bàn cờ, trạng thái, modal, bàn phím
 * ===================================================================== */
(() => {
  'use strict';
  const PN = window.PlayNine || null; // SDK PlayNine: chỉ có khi chạy trong cổng
  PN && PN.init({ gameId: 'caro' });

  // Phiên bản app: tăng khi phát hành, đồng bộ với ?v= ở index.html để trình duyệt tải file mới
  const APP_VERSION = '1.0.1';
  const E = window.CaroEngine;
  const N = E.SIZE, NN = E.CELLS, X = E.X, O = E.O;
  const KEYS = {
    settings: 'playnine-caro-settings-v1',
    save: 'playnine-caro-save-v1',
    stats: 'playnine-caro-stats-v1',
    summary: 'playnine-caro-summary-v1',
  };
  const LEVELS = ['easy', 'medium', 'hard'];
  // Chuỗi giao diện lấy từ i18n.js (ngôn ngữ cố định trong một lần tải trang)
  const tr = (key, params) => I18N.t(key, params);
  const LEVEL_LABEL = { easy: tr('level.easy'), medium: tr('level.medium'), hard: tr('level.hard') };
  const COLS = 'ABCDEFGHIJKLMNO';
  const STARS = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]].map(([r, c]) => r * N + c);
  const MIN_THINK_MS = 380; // máy trả lời nhanh quá thì vẫn chờ chút cho tự nhiên
  const RESULT_DELAY_MS = 900; // chờ cho người chơi thấy đường thắng rồi mới hiện kết quả

  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const grid = $('grid');
  const viewport = $('board-viewport');
  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  /* ---------------- 1. Lưu trữ (mọi truy cập localStorage đều bọc try/catch) ---------------- */
  function readJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* bỏ qua */ }
  }
  function removeKey(key) {
    try { localStorage.removeItem(key); } catch (e) { /* bỏ qua */ }
  }

  const DEFAULT_SETTINGS = {
    theme: 'auto', blockedBoth: true, overline: true, showNumbers: false,
    mode: 'ai', level: 'medium', human: X,
  };
  let settings = loadSettings();

  function loadSettings() {
    const s = Object.assign({}, DEFAULT_SETTINGS);
    const raw = readJSON(KEYS.settings) || {};
    if (['auto', 'light', 'dark'].includes(raw.theme)) s.theme = raw.theme;
    ['blockedBoth', 'overline', 'showNumbers'].forEach((k) => { if (typeof raw[k] === 'boolean') s[k] = raw[k]; });
    if (raw.mode === 'ai' || raw.mode === 'pvp') s.mode = raw.mode;
    if (LEVELS.includes(raw.level)) s.level = raw.level;
    if (raw.human === X || raw.human === O) s.human = raw.human;
    return s;
  }
  function saveSettings() { writeJSON(KEYS.settings, settings); }

  function emptyStats() {
    const s = {};
    LEVELS.forEach((lv) => { s[lv] = { played: 0, won: 0, lost: 0, drawn: 0 }; });
    return s;
  }
  let stats = loadStats();
  function loadStats() {
    const s = emptyStats();
    const raw = readJSON(KEYS.stats) || {};
    LEVELS.forEach((lv) => {
      const r = raw[lv] || {};
      ['played', 'won', 'lost', 'drawn'].forEach((k) => {
        const v = Number(r[k]);
        if (Number.isFinite(v) && v >= 0) s[lv][k] = Math.floor(v);
      });
    });
    return s;
  }
  function saveStats() { writeJSON(KEYS.stats, stats); }
  function totals() {
    const t = { played: 0, won: 0, lost: 0, drawn: 0 };
    LEVELS.forEach((lv) => { Object.keys(t).forEach((k) => { t[k] += stats[lv][k]; }); });
    return t;
  }
  function recordResult(level, result) {
    const s = stats[level];
    if (!s) return;
    s.played++;
    s[result]++;
    saveStats();
  }

  /* ---------------- 2. Trạng thái ván ---------------- */
  // game: { mode 'ai'|'pvp', level, human (X|O), rules, moves[], board, over: null | { winner, line } }
  let game = null;
  let thinking = false;
  let epoch = 0; // tăng mỗi khi ván đổi (đi lại, ván mới…) để bỏ kết quả máy đã cũ
  let focusIdx = E.CENTER;
  let zoomed = false;
  let freshIdx = -1;
  let resultTimer = 0;
  let lastAnnounced = '';

  const colorAt = (k) => (k % 2 === 0 ? X : O); // màu của nước thứ k (tính từ 0)
  const toMove = () => colorAt(game.moves.length);
  const pieceName = (p) => (p === X ? 'X' : 'O');
  const cellName = (i) => COLS[i % N] + (Math.floor(i / N) + 1);
  const humanMoveCount = (g) => g.moves.filter((_, k) => colorAt(k) === g.human).length;
  const isAiTurn = () => game.mode === 'ai' && !game.over && toMove() !== game.human;
  const canPlay = () => !game.over && !thinking && !isAiTurn();

  function currentRules() { return { blockedBoth: settings.blockedBoth, overline: settings.overline }; }

  function makeGame(cfg) {
    return {
      mode: cfg.mode,
      level: cfg.level,
      human: cfg.human,
      rules: E.normRules(cfg.rules || currentRules()),
      moves: [],
      board: E.createBoard(),
      over: null,
    };
  }

  // Ván đấu máy chưa xong mà người chơi đã đi ít nhất một nước: bỏ dở thì tính thua
  function abandonPenalty() {
    return !!(game && game.mode === 'ai' && !game.over && humanMoveCount(game) > 0);
  }

  function newGame(cfg) {
    if (abandonPenalty()) recordResult(game.level, 'lost');
    cancelAi();
    clearTimeout(resultTimer);
    closeModal('modal-result');
    game = makeGame(cfg);
    PN && game.mode === 'ai' && PN.gameStart({ mode: game.level });
    focusIdx = E.CENTER;
    freshIdx = -1;
    persist();
    renderAll();
    announce(game.mode === 'ai'
      ? tr('say.newAi', { level: LEVEL_LABEL[game.level], mark: pieceName(game.human) })
      : tr('say.newPvp'));
    maybeAi();
  }

  function restore() {
    const raw = readJSON(KEYS.save);
    if (!raw || !Array.isArray(raw.moves)) return false;
    if (raw.mode !== 'ai' && raw.mode !== 'pvp') return false;
    const cfg = {
      mode: raw.mode,
      level: LEVELS.includes(raw.level) ? raw.level : 'medium',
      human: raw.human === O ? O : X,
      rules: raw.rules,
    };
    const g = makeGame(cfg);
    let rep;
    try { rep = E.replay(raw.moves, g.rules); } catch (e) { return false; }
    if (rep.over) return false; // ván đã xong thì không khôi phục
    g.moves = raw.moves.slice();
    g.usedUndo = raw.usedUndo === true;
    g.board = rep.board;
    game = g;
    focusIdx = g.moves.length ? g.moves[g.moves.length - 1] : E.CENTER;
    return true;
  }

  function persist() {
    if (game && !game.over && game.moves.length) {
      writeJSON(KEYS.save, { v: 1, mode: game.mode, level: game.level, human: game.human, rules: game.rules, moves: game.moves, usedUndo: !!game.usedUndo });
    } else {
      removeKey(KEYS.save);
    }
    writeSummary();
  }

  function playMove(i) {
    if (!game || game.over || game.board[i] !== E.EMPTY) return;
    const p = toMove();
    game.board[i] = p;
    game.moves.push(i);
    freshIdx = i;
    focusIdx = i;
    const line = E.checkWin(game.board, i, game.rules);
    if (line) game.over = { winner: p, line };
    else if (game.moves.length >= NN) game.over = { winner: 0, line: [] };

    const who = game.mode === 'ai' ? (p === game.human ? tr('player.you') : tr('player.ai')) : tr('player.mark', { mark: pieceName(p) });
    announce(tr('say.move', { who, cell: cellName(i) }));
    if (game.over) finishGame();
    persist();
    renderAll();
    if (!game.over) maybeAi();
  }

  function finishGame() {
    const w = game.over.winner;
    if (game.mode === 'ai') recordResult(game.level, w === 0 ? 'drawn' : w === game.human ? 'won' : 'lost');
    if (game.mode === 'ai') PN && PN.gameEnd({ mode: game.level, won: w !== 0 && w === game.human, assisted: !!game.usedUndo });
    announce(resultTitle());
    clearTimeout(resultTimer);
    resultTimer = setTimeout(showResult, reduceMotion.matches ? 300 : RESULT_DELAY_MS);
  }

  function canUndo() {
    if (!game || game.over) return false;
    return game.mode === 'pvp' ? game.moves.length > 0 : humanMoveCount(game) > 0;
  }

  // Đi lại: với máy thì bỏ nước trả lời của máy cùng nước gần nhất của người
  function undo() {
    if (!canUndo()) return;
    game.usedUndo = true;
    cancelAi();
    if (game.mode === 'pvp') game.moves.pop();
    else {
      while (game.moves.length && colorAt(game.moves.length - 1) !== game.human) game.moves.pop();
      if (game.moves.length) game.moves.pop();
    }
    game.board = E.replay(game.moves, game.rules).board;
    freshIdx = -1;
    focusIdx = game.moves.length ? game.moves[game.moves.length - 1] : E.CENTER;
    persist();
    renderAll();
    announce(tr('say.undo'));
    maybeAi();
  }

  // Đổi bên: bắt đầu ván mới với quân còn lại (chỉ có ở chế độ đấu máy)
  function requestSwap() {
    if (!game || game.mode !== 'ai') return;
    const doSwap = () => {
      settings.human = game.human === X ? O : X;
      saveSettings();
      newGame({ mode: 'ai', level: game.level, human: settings.human });
      toast(tr(game.human === X ? 'toast.swapFirst' : 'toast.swapSecond', { mark: pieceName(game.human) }));
    };
    if (abandonPenalty()) {
      confirmDialog(tr('confirm.swapTitle'), tr('confirm.swapPenalty', { mark: pieceName(game.human === X ? O : X) }), doSwap);
    } else doSwap();
  }

  /* ---------------- 3. Máy tính nước (Web Worker) ----------------
   * Worker được dựng từ chính mã nguồn engine (CaroEngine.factorySource) qua Blob nên
   * chạy được cả khi mở index.html trực tiếp từ file://. Không tạo được worker thì
   * tính trên luồng chính bằng setTimeout. */
  const AI = {
    worker: null,
    url: null,
    pending: null, // { id, board, player, opts, cb, timer }
    nextId: 0,
    start() {
      if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || !window.URL) return;
      try {
        if (!this.url) {
          const src = 'var CaroEngine = (' + E.factorySource + ')();\nCaroEngine.serve(self);\n';
          this.url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        }
        const w = new Worker(this.url);
        w.onmessage = (e) => {
          const p = this.pending;
          if (!p || !e.data || e.data.id !== p.id) return; // kết quả của yêu cầu đã hủy
          this.pending = null;
          clearTimeout(p.timer);
          p.cb(e.data.res);
        };
        w.onerror = (ev) => {
          if (ev && ev.preventDefault) ev.preventDefault();
          this.fallback();
        };
        this.worker = w;
      } catch (e) { this.worker = null; }
    },
    // Worker hỏng: bỏ worker, tính đồng bộ yêu cầu đang chờ
    fallback() {
      if (this.worker) { try { this.worker.terminate(); } catch (e) { /* bỏ qua */ } }
      this.worker = null;
      const p = this.pending;
      if (p) { this.pending = null; clearTimeout(p.timer); this.think(p.board, p.player, p.opts, p.cb); }
    },
    think(board, player, opts, cb) {
      const id = ++this.nextId;
      const p = { id, board, player, opts, cb, timer: 0 };
      this.pending = p;
      if (this.worker) {
        try {
          this.worker.postMessage({ id, board, player, opts });
          // Phòng trường hợp worker im lặng (bị chặn mà không báo lỗi)
          p.timer = setTimeout(() => { if (this.pending === p) this.fallback(); }, (E.LEVELS[opts.level] || E.LEVELS.medium).time + 4000);
          return;
        } catch (e) { this.worker = null; }
      }
      setTimeout(() => {
        if (this.pending !== p) return;
        this.pending = null;
        cb(E.bestMove(board, player, opts));
      }, 30);
    },
    cancel() {
      const p = this.pending;
      if (!p) return;
      this.pending = null;
      clearTimeout(p.timer);
      if (this.worker) { this.worker.terminate(); this.worker = null; this.start(); }
    },
  };

  function cancelAi() {
    epoch++;
    AI.cancel();
    thinking = false;
  }

  function maybeAi() {
    if (!game || !isAiTurn() || thinking) return;
    thinking = true;
    const myEpoch = epoch;
    const t0 = Date.now();
    renderStatus();
    renderBoard();
    writeSummary();
    AI.think(Array.from(game.board), toMove(), { level: game.level, rules: game.rules }, (res) => {
      if (myEpoch !== epoch) return;
      const wait = Math.max(0, MIN_THINK_MS - (Date.now() - t0));
      setTimeout(() => {
        if (myEpoch !== epoch || !game || game.over) return;
        thinking = false;
        let m = res && res.move;
        if (!(m >= 0 && m < NN) || game.board[m] !== E.EMPTY) m = anyEmpty();
        if (m >= 0) playMove(m);
        else renderAll();
      }, wait);
    });
  }

  function anyEmpty() {
    for (let i = 0; i < NN; i++) if (game.board[i] === E.EMPTY) return i;
    return -1;
  }

  /* ---------------- Tóm tắt cho cổng PlayNine ---------------- */
  function writeSummary() {
    const t = totals();
    const lv = game && game.mode === 'ai' ? game.level : settings.level;
    const lvName = LEVEL_LABEL[lv];
    let note;
    if (t.played) note = tr('summary.note', { won: t.won, n: t.played, level: lvName });
    else if (game && game.mode === 'pvp') note = tr('summary.notePvp');
    else note = tr('summary.noteNone', { level: lvName });
    const statsOut = t.played
      ? [
        { value: `${t.won}/${t.played}`, label: tr('summary.won') },
        { value: `${Math.round((t.won / t.played) * 100)}%`, label: tr('summary.rate') },
        { value: lvName, label: tr('summary.level') },
      ]
      : [];
    let resume = null;
    if (game && !game.over && game.moves.length) {
      let detail;
      if (game.mode === 'ai') detail = tr(isAiTurn() ? 'summary.aiThinking' : 'summary.yourTurn', { n: game.moves.length + 1 });
      else detail = tr('summary.markTurn', { n: game.moves.length + 1, mark: pieceName(toMove()) });
      resume = {
        title: game.mode === 'ai' ? tr('summary.titleAi', { level: LEVEL_LABEL[game.level] }) : tr('summary.titlePvp'),
        detail,
        pct: null,
      };
    }
    writeJSON(KEYS.summary, {
      v: 1,
      updatedAt: Date.now(),
      played: t.played,
      won: t.won,
      note,
      stats: statsOut,
      resume,
      daily: null,
    });
  }

  /* ---------------- 4. Render ---------------- */
  const cells = [];
  function buildBoard() {
    const frag = document.createDocumentFragment();
    for (let r = 0; r < N; r++) {
      const row = document.createElement('div');
      row.setAttribute('role', 'row');
      for (let c = 0; c < N; c++) {
        const i = r * N + c;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cell' + (STARS.includes(i) ? ' star' : '');
        b.dataset.i = String(i);
        b.setAttribute('role', 'gridcell');
        b.tabIndex = -1;
        const num = document.createElement('span');
        num.className = 'num';
        num.setAttribute('aria-hidden', 'true');
        b.appendChild(num);
        row.appendChild(b);
        cells.push(b);
      }
      frag.appendChild(row);
    }
    grid.appendChild(frag);
  }

  function renderBoard() {
    const moveNo = new Int16Array(NN);
    game.moves.forEach((m, k) => { moveNo[m] = k + 1; });
    const last = game.moves.length ? game.moves[game.moves.length - 1] : -1;
    const win = game.over ? new Set(game.over.line) : null;
    for (let i = 0; i < NN; i++) {
      const el = cells[i];
      const p = game.board[i];
      el.classList.toggle('x', p === X);
      el.classList.toggle('o', p === O);
      el.classList.toggle('last', i === last && !(win && win.has(i)));
      el.classList.toggle('win', !!(win && win.has(i)));
      el.classList.toggle('fresh', i === freshIdx && !reduceMotion.matches);
      el.tabIndex = i === focusIdx ? 0 : -1;
      const n = moveNo[i];
      const numEl = el.firstChild;
      const txt = n ? String(n) : '';
      if (numEl.textContent !== txt) numEl.textContent = txt;
      const label = (p ? tr('cell.piece', { cell: cellName(i), mark: pieceName(p), n }) : tr('cell.empty', { cell: cellName(i) })) + (i === last ? tr('cell.last') : '');
      if (el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
      el.setAttribute('aria-disabled', p || !canPlay() ? 'true' : 'false');
    }
    const turn = game.over ? 0 : toMove();
    grid.classList.toggle('can-play', canPlay());
    grid.classList.toggle('ghost-x', turn === X);
    grid.classList.toggle('ghost-o', turn === O);
  }

  function resultTitle() {
    if (!game.over) return '';
    const w = game.over.winner;
    if (w === 0) return tr('result.draw');
    if (game.mode === 'ai') return w === game.human ? tr('result.youWin') : tr('result.aiWins');
    return tr('result.markWins', { mark: pieceName(w) });
  }

  function renderStatus() {
    const ai = game.mode === 'ai';
    [X, O].forEach((p) => {
      const isHuman = !ai || p === game.human;
      $('pname-' + p).textContent = ai ? (isHuman ? tr('player.you') : tr('player.ai')) : tr('player.mark', { mark: pieceName(p) });
      $('psub-' + p).textContent = ai && !isHuman ? tr('player.level', { level: LEVEL_LABEL[game.level] }) : p === X ? tr('player.first') : tr('player.second');
      $('player-' + p).classList.toggle('active', !game.over && toMove() === p);
    });
    let text, sub;
    if (game.over) {
      text = resultTitle();
      sub = tr('turn.moves', { n: game.moves.length });
    } else {
      if (thinking) text = tr('turn.thinking');
      else if (ai) text = isAiTurn() ? tr('turn.ai') : tr('turn.yours');
      else text = tr('turn.mark', { mark: pieceName(toMove()) });
      sub = tr('turn.move', { n: game.moves.length + 1 });
    }
    $('turn-text').textContent = text;
    $('turn-sub').textContent = sub;
    app.classList.toggle('thinking', thinking);
    app.classList.toggle('over', !!game.over);
    app.classList.toggle('lost', !!(game.over && ai && game.over.winner && game.over.winner !== game.human));
  }

  function renderTools() {
    $('btn-undo').disabled = !canUndo();
    const swap = $('btn-swap');
    swap.disabled = game.mode !== 'ai';
    swap.title = game.mode === 'ai' ? tr('tools.swapKey') : tr('tools.swapAiOnly');
    $('btn-numbers').setAttribute('aria-pressed', String(settings.showNumbers));
    $('btn-zoom').setAttribute('aria-pressed', String(zoomed));
    $('zoom-label').textContent = zoomed ? tr('tools.zoomOut') : tr('tools.zoomIn');
    app.classList.toggle('show-numbers', settings.showNumbers);
    app.classList.toggle('zoomed', zoomed);
    const r = game.rules;
    $('help-rules').textContent = tr('help.rules', {
      blocked: tr(r.blockedBoth ? 'help.blockedOn' : 'help.blockedOff'),
      overline: tr(r.overline ? 'help.overlineOn' : 'help.overlineOff'),
    });
  }

  function renderAll() {
    renderBoard();
    renderStatus();
    renderTools();
  }

  function announce(text) {
    if (!text || text === lastAnnounced) return;
    lastAnnounced = text;
    $('announcer').textContent = text;
  }

  let toastTimer = 0;
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  /* ---------------- Giao diện sáng / tối ---------------- */
  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    const dark = settings.theme === 'dark'
      || (settings.theme === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    $('theme-color').setAttribute('content', dark ? '#0e0b09' : '#f6f2ea');
  }

  /* ---------------- Modal ---------------- */
  let modalReturnFocus = null;
  function openModal(id) {
    const m = $(id);
    if (!m.hidden) return;
    // Chỉ một modal mở cùng lúc
    document.querySelectorAll('.modal:not([hidden])').forEach((el) => { el.hidden = true; });
    modalReturnFocus = document.activeElement;
    m.hidden = false;
    const first = m.querySelector('[aria-checked="true"]') || m.querySelector('.btn-primary') || m.querySelector('button, input');
    if (first) first.focus();
  }
  function closeModal(id) {
    const m = $(id);
    if (!m || m.hidden) return;
    m.hidden = true;
    if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus();
    modalReturnFocus = null;
  }
  function openModalEl() { return document.querySelector('.modal:not([hidden])'); }

  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-close]');
    if (c) closeModal(c.getAttribute('data-close'));
  });

  // Giữ focus bên trong modal khi bấm Tab
  document.addEventListener('keydown', (e) => {
    const m = openModalEl();
    if (!m) return;
    if (e.key === 'Escape') { e.preventDefault(); closeModal(m.id); return; }
    if (e.key !== 'Tab') return;
    const items = Array.from(m.querySelectorAll('button, input')).filter((el) => !el.disabled && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // Nhóm nút chọn một (segmented): đặt aria-checked, phím mũi tên đổi lựa chọn
  function setSegmented(group, value) {
    group.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.value === String(value);
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }
  function bindSegmented(group, onChange) {
    group.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      setSegmented(group, b.dataset.value);
      onChange(b.dataset.value);
    });
    group.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const btns = Array.from(group.querySelectorAll('button'));
      let k = btns.findIndex((b) => b.getAttribute('aria-checked') === 'true');
      k = (k + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + btns.length) % btns.length;
      btns[k].focus();
      btns[k].click();
    });
  }

  /* --- Modal ván mới --- */
  const draft = { mode: 'ai', level: 'medium', human: X };
  function rulesText(r) {
    return tr('new.rules', {
      blocked: tr(r.blockedBoth ? 'new.blockedOn' : 'new.blockedOff'),
      overline: tr(r.overline ? 'new.overlineOn' : 'new.overlineOff'),
    });
  }
  function renderNewModal() {
    document.querySelectorAll('#modal-new [data-field]').forEach((g) => setSegmented(g, draft[g.dataset.field]));
    $('field-level').hidden = draft.mode !== 'ai';
    $('field-side').hidden = draft.mode !== 'ai';
    $('new-warning').hidden = !abandonPenalty();
    $('new-rules').textContent = rulesText(currentRules());
  }
  function openNewModal() {
    draft.mode = game.mode;
    draft.level = game.mode === 'ai' ? game.level : settings.level;
    draft.human = game.mode === 'ai' ? game.human : settings.human;
    renderNewModal();
    openModal('modal-new');
  }
  document.querySelectorAll('#modal-new [data-field]').forEach((g) => {
    bindSegmented(g, (v) => {
      const f = g.dataset.field;
      draft[f] = f === 'human' ? Number(v) : v;
      renderNewModal();
    });
  });
  $('btn-start').addEventListener('click', () => {
    settings.mode = draft.mode;
    if (draft.mode === 'ai') { settings.level = draft.level; settings.human = draft.human; }
    saveSettings();
    closeModal('modal-new');
    newGame({ mode: draft.mode, level: draft.level, human: draft.mode === 'ai' ? draft.human : X });
  });

  /* --- Modal cài đặt --- */
  const langGroup = document.querySelector('[data-setting="lang"]');
  function renderSettings() {
    setSegmented(document.querySelector('[data-setting="theme"]'), settings.theme);
    setSegmented(langGroup, I18N.lang);
    document.querySelectorAll('input[data-setting]').forEach((el) => { el.checked = !!settings[el.dataset.setting]; });
  }
  bindSegmented(document.querySelector('[data-setting="theme"]'), (v) => {
    settings.theme = v;
    saveSettings();
    applyTheme();
  });
  // Ngôn ngữ: lưu ván rồi lưu khóa chung 'playnine-lang' và tải lại trang
  bindSegmented(langGroup, (v) => { persist(); I18N.set(v); });
  document.querySelectorAll('input[data-setting]').forEach((el) => {
    el.addEventListener('change', () => {
      const k = el.dataset.setting;
      settings[k] = el.checked;
      saveSettings();
      if (k === 'showNumbers') renderTools();
      else {
        const r = game.rules;
        const same = r.blockedBoth === settings.blockedBoth && r.overline === settings.overline;
        toast(same ? tr('toast.rulesSame') : tr('toast.rulesNext'));
      }
    });
  });

  /* --- Modal thống kê --- */
  function renderStats() {
    const num = I18N.fmtNumber;
    const rows = LEVELS.map((lv) => {
      const s = stats[lv];
      return `<tr><td>${LEVEL_LABEL[lv]}</td><td>${num(s.played)}</td><td>${num(s.won)}</td><td>${num(s.lost)}</td><td>${num(s.drawn)}</td></tr>`;
    });
    const t = totals();
    rows.push(`<tr class="total"><td>${tr('stats.total')}</td><td>${num(t.played)}</td><td>${num(t.won)}</td><td>${num(t.lost)}</td><td>${num(t.drawn)}</td></tr>`);
    $('stats-body').innerHTML = rows.join('');
    const btn = $('btn-stats-reset');
    btn.textContent = tr('stats.reset');
    btn.dataset.armed = '';
  }
  let resetTimer = 0;
  $('btn-stats-reset').addEventListener('click', () => {
    const btn = $('btn-stats-reset');
    if (!btn.dataset.armed) {
      btn.dataset.armed = '1';
      btn.textContent = tr('stats.resetConfirm');
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => { btn.dataset.armed = ''; btn.textContent = tr('stats.reset'); }, 3000);
      return;
    }
    clearTimeout(resetTimer);
    stats = emptyStats();
    saveStats();
    writeSummary();
    renderStats();
    toast(tr('toast.statsCleared'));
  });

  /* --- Modal xác nhận --- */
  let confirmAction = null;
  function confirmDialog(title, text, action) {
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    confirmAction = action;
    openModal('modal-confirm');
  }
  $('btn-confirm-ok').addEventListener('click', () => {
    const a = confirmAction;
    confirmAction = null;
    closeModal('modal-confirm');
    if (a) a();
  });

  /* --- Modal kết quả --- */
  function showResult() {
    if (!game.over || openModalEl()) return;
    const w = game.over.winner;
    const badge = $('result-badge');
    badge.className = 'result-badge ' + (w === X ? 'x' : w === O ? 'o' : 'draw');
    $('result-title').textContent = resultTitle();
    let text;
    if (w === 0) text = tr('result.drawText');
    else if (game.mode === 'ai') text = w === game.human ? tr('result.youWinText', { level: LEVEL_LABEL[game.level] }) : tr('result.aiWinsText');
    else text = tr('result.markText', { mark: pieceName(w) });
    $('result-text').textContent = text;
    $('result-moves').textContent = String(game.moves.length);
    if (game.mode === 'ai') {
      const s = stats[game.level];
      $('result-mid-label').textContent = tr('result.level');
      $('result-mid').textContent = LEVEL_LABEL[game.level];
      $('result-rec-label').textContent = tr('result.levelRecord');
      $('result-rec').textContent = `${s.won}/${s.played}`;
    } else {
      $('result-mid-label').textContent = tr('result.winner');
      $('result-mid').textContent = w ? pieceName(w) : '—';
      $('result-rec-label').textContent = tr('result.mode');
      $('result-rec').textContent = tr('result.twoPlayers');
    }
    openModal('modal-result');
  }
  $('btn-result-new').addEventListener('click', () => {
    closeModal('modal-result');
    newGame({ mode: game.mode, level: game.level, human: game.human });
  });

  /* ---------------- Input ---------------- */
  grid.addEventListener('click', (e) => {
    const el = e.target.closest('.cell');
    if (!el) return;
    const i = Number(el.dataset.i);
    focusIdx = i;
    tryPlay(i);
  });

  function tryPlay(i) {
    if (!game) return;
    if (game.over) { renderBoard(); return; }
    if (thinking || isAiTurn()) { toast(tr('toast.thinking')); return; }
    if (game.board[i] !== E.EMPTY) { renderBoard(); return; }
    playMove(i);
  }

  // Bàn cờ có một điểm dừng Tab duy nhất, di chuyển trong bàn bằng phím mũi tên
  grid.addEventListener('keydown', (e) => {
    let r = Math.floor(focusIdx / N), c = focusIdx % N;
    switch (e.key) {
      case 'ArrowUp': r = Math.max(0, r - 1); break;
      case 'ArrowDown': r = Math.min(N - 1, r + 1); break;
      case 'ArrowLeft': c = Math.max(0, c - 1); break;
      case 'ArrowRight': c = Math.min(N - 1, c + 1); break;
      case 'Home': c = 0; break;
      case 'End': c = N - 1; break;
      case 'PageUp': r = 0; break;
      case 'PageDown': r = N - 1; break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        tryPlay(focusIdx);
        return;
      default: return;
    }
    e.preventDefault();
    moveFocus(r * N + c);
  });
  grid.addEventListener('focusin', (e) => {
    const el = e.target.closest('.cell');
    if (el) focusIdx = Number(el.dataset.i);
  });
  function moveFocus(i) {
    cells[focusIdx].tabIndex = -1;
    focusIdx = i;
    cells[i].tabIndex = 0;
    cells[i].focus({ preventScroll: !zoomed });
  }

  // Phím tắt toàn cục
  document.addEventListener('keydown', (e) => {
    if (openModalEl() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && (e.target.tagName === 'INPUT')) return;
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); undo(); }
    else if (k === 'n') { e.preventDefault(); openNewModal(); }
    else if (k === 'm') { e.preventDefault(); toggleNumbers(); }
    else if (k === 's') { e.preventDefault(); requestSwap(); }
  });

  function toggleNumbers() {
    settings.showNumbers = !settings.showNumbers;
    saveSettings();
    renderTools();
  }

  function toggleZoom() {
    zoomed = !zoomed;
    renderTools();
    if (zoomed) {
      // Cuộn tới nước vừa đi (hoặc giữa bàn)
      const target = cells[game.moves.length ? game.moves[game.moves.length - 1] : E.CENTER];
      requestAnimationFrame(() => {
        viewport.scrollLeft = target.offsetLeft + target.offsetWidth / 2 - viewport.clientWidth / 2;
        viewport.scrollTop = target.offsetTop + target.offsetHeight / 2 - viewport.clientHeight / 2;
      });
    } else {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    }
  }

  $('btn-new').addEventListener('click', openNewModal);
  $('btn-settings').addEventListener('click', () => { renderSettings(); openModal('modal-settings'); });
  $('btn-stats').addEventListener('click', () => { renderStats(); openModal('modal-stats'); });
  $('btn-undo').addEventListener('click', undo);
  $('btn-swap').addEventListener('click', requestSwap);
  $('btn-numbers').addEventListener('click', toggleNumbers);
  $('btn-zoom').addEventListener('click', toggleZoom);

  // Theo dõi đổi giao diện hệ thống khi đang ở chế độ Tự động
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (settings.theme === 'auto') applyTheme(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* ---------------- Khởi động ---------------- */
  I18N.apply();
  I18N.beforeReload = persist; // đổi ngôn ngữ ở trang khác: lưu ván trước khi tải lại
  $('app-version').textContent = APP_VERSION;
  applyTheme();
  buildBoard();
  AI.start();
  const resumed = restore();
  if (!resumed) game = makeGame({ mode: settings.mode, level: settings.level, human: settings.human });
  PN && game.mode === 'ai' && PN.gameStart(resumed ? { mode: game.level, resume: true } : { mode: game.level });
  persist();
  renderAll();
  maybeAi();
})();
