/* =====================================================================
 * Bốn Liên Tiếp - Game (chỉ chạy trong trình duyệt, cần engine.js nạp trước)
 *   1. Lưu trữ: cài đặt, thống kê, ván đang chơi, tóm tắt cho cổng PlayNine
 *   2. Máy nghĩ trong Web Worker (tạo từ Blob mã nguồn engine)
 *   3. Điều khiển ván: chọn cột, thả quân, máy đi, đi lại, ván mới, kết thúc
 *   4. Hiệu ứng quân rơi có nảy nhẹ, tô sáng và kẻ đường bốn quân thắng
 *   5. Render bàn, người chơi, nhật ký, modal, hướng dẫn có hình minh họa
 * ===================================================================== */
(() => {
  'use strict';
  const PN = window.PlayNine || null; // SDK PlayNine: chỉ có khi chạy trong cổng
  PN && PN.init({ gameId: 'bonlientiep' });

  // Phiên bản app: tăng khi phát hành, đồng bộ với ?v= ở index.html
  const APP_VERSION = '1.0.1';
  const KEYS = {
    settings: 'playnine-bonlientiep-settings-v1',
    save: 'playnine-bonlientiep-save-v1',
    stats: 'playnine-bonlientiep-stats-v1',
    summary: 'playnine-bonlientiep-summary-v1',
  };
  const E = BonLienTiep;
  const { COLS, ROWS, CELLS } = E;
  const LEVELS = E.LEVELS;
  const LEVEL_ORDER = ['easy', 'medium', 'hard'];
  // Chữ hiển thị lấy từ i18n.js theo ngôn ngữ đang chọn
  const T = I18N.t;
  const levelLabel = (lv) => T('level.' + lv);
  // Thời gian một quân rơi hết chiều cao bàn (ms)
  const SPEED = { slow: 760, medium: 480, fast: 280, off: 0 };
  const MIN_THINK_MS = 450; // máy luôn "nghĩ" tối thiểu chừng này
  const AFTER_DROP_MS = 120; // nghỉ một nhịp sau khi quân rơi xong rồi máy mới thả
  const DIR_TEXT = [T('dir.0'), T('dir.1'), T('dir.2'), T('dir.3')];
  const COLOR_NAME = [T('color.0'), T('color.1')];

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  /* ================= 1. Lưu trữ ================= */
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  const DEFAULT_SETTINGS = { theme: 'auto', speed: 'medium', mode: 'ai', level: 'medium', first: 0, guideSeen: false };
  let settings = loadSettings();

  function loadSettings() {
    const s = { ...DEFAULT_SETTINGS };
    const raw = readJSON(KEYS.settings) || {};
    if (['auto', 'light', 'dark'].includes(raw.theme)) s.theme = raw.theme;
    if (SPEED[raw.speed] != null) s.speed = raw.speed;
    if (raw.mode === 'ai' || raw.mode === 'pvp') s.mode = raw.mode;
    if (LEVELS[raw.level]) s.level = raw.level;
    if (raw.first === 0 || raw.first === 1) s.first = raw.first;
    s.guideSeen = raw.guideSeen === true;
    return s;
  }
  function saveSettings() { writeJSON(KEYS.settings, settings); }

  // fast: số quân ít nhất bạn đã thả trong một ván thắng (0 = chưa thắng ván nào)
  function emptyStats() {
    const levels = {};
    for (const lv of LEVEL_ORDER) levels[lv] = { played: 0, won: 0, lost: 0, drawn: 0, fast: 0 };
    return { levels, pvp: { played: 0, p0: 0, p1: 0, drawn: 0 }, streak: 0, best: 0 };
  }
  const toInt = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  function loadStats() {
    const st = emptyStats();
    const raw = readJSON(KEYS.stats);
    if (!raw || typeof raw !== 'object') return st;
    for (const lv of LEVEL_ORDER) {
      const r = raw.levels && raw.levels[lv];
      if (r) for (const k of ['played', 'won', 'lost', 'drawn', 'fast']) st.levels[lv][k] = toInt(r[k]);
    }
    if (raw.pvp) for (const k of ['played', 'p0', 'p1', 'drawn']) st.pvp[k] = toInt(raw.pvp[k]);
    st.streak = toInt(raw.streak);
    st.best = toInt(raw.best);
    return st;
  }
  let stats = loadStats();
  function saveStats() { writeJSON(KEYS.stats, stats); }

  function aiTotals() {
    let played = 0, won = 0, fast = 0;
    for (const lv of LEVEL_ORDER) {
      const r = stats.levels[lv];
      played += r.played;
      won += r.won;
      if (r.fast && (!fast || r.fast < fast)) fast = r.fast;
    }
    return { played, won, fast };
  }

  /* ================= 2. Máy nghĩ trong Web Worker ================= */
  // Worker được dựng từ chính mã nguồn hàm BonLienTiepFactory (qua Blob) nên chạy được
  // cả khi mở trang bằng file://. Không tạo được worker thì tính trên luồng chính.
  const AI = {
    worker: null,
    nextId: 0,
    pending: null, // { id, cb, moves, cfg, level }
    source() {
      return 'var BonLienTiep = (' + E.factory.toString() + ')();\n' +
        'self.onmessage = function (e) {\n' +
        '  var d = e.data;\n' +
        '  var res = BonLienTiep.chooseMove(BonLienTiep.fromMoves(d.moves, d.cfg), { level: d.level });\n' +
        '  self.postMessage({ id: d.id, res: res });\n' +
        '};\n';
    },
    start() {
      if (typeof Worker === 'undefined' || typeof Blob === 'undefined') return;
      try {
        const url = URL.createObjectURL(new Blob([this.source()], { type: 'text/javascript' }));
        this.worker = new Worker(url);
        this.worker.onmessage = (e) => {
          const p = this.pending;
          if (!p || e.data.id !== p.id) return; // kết quả của yêu cầu đã hủy
          this.pending = null;
          p.cb(e.data.res);
        };
        this.worker.onerror = (e) => { // worker hỏng: bỏ worker, tính đồng bộ yêu cầu đang chờ
          if (e && e.preventDefault) e.preventDefault();
          this.worker = null;
          const p = this.pending;
          if (p) { this.pending = null; this.think(p.moves, p.cfg, p.level, p.cb); }
        };
      } catch (e) { this.worker = null; }
    },
    think(moves, cfg, level, cb) {
      const id = ++this.nextId;
      this.pending = { id, cb, moves, cfg, level };
      if (this.worker) { this.worker.postMessage({ id, moves, cfg, level }); return; }
      setTimeout(() => {
        if (!this.pending || this.pending.id !== id) return;
        this.pending = null;
        cb(E.chooseMove(E.fromMoves(moves, cfg), { level }));
      }, 30);
    },
    cancel() {
      if (!this.pending) return;
      this.pending = null;
      // Dừng ngay phép tính đang chạy rồi tạo worker mới
      if (this.worker) { this.worker.terminate(); this.worker = null; this.start(); }
    },
  };

  /* ================= 3. Điều khiển ván ================= */
  // game: { mode: 'ai'|'pvp', level, first: 0|1, moves: [cột...], recorded, state, log }
  // Người chơi 0 là bạn / Người 1 (quân vàng), người chơi 1 là máy / Người 2 (quân đỏ).
  let game = null;
  let thinking = false;
  let aiToken = 0;
  let aiResult = null;
  let resultTimer = 0;
  let revealTimer = 0;
  let dropEndAt = 0; // lúc hiệu ứng rơi của quân vừa thả kết thúc
  let winShown = false; // đã tô đường thắng (chờ quân cuối rơi xong mới tô)

  const cfgOf = (g) => ({ first: g.first });
  const moverOf = (i) => (game.first + i) % 2;
  const isAiTurn = () => game && game.mode === 'ai' && !game.state.over && game.state.turn === 1;
  const humanCanPlay = () => game && !game.state.over && !thinking && (game.mode === 'pvp' || game.state.turn === 0);
  const nameOf = (g, p) => (g && g.mode === 'pvp' ? (p === 0 ? T('who.p1') : T('who.p2')) : p === 0 ? T('who.you') : T('who.ai'));
  const playerName = (p) => nameOf(game, p);
  // "Bạn thắng" / "Máy thắng" / "Người 1 thắng" (tiếng Anh: You win / Computer wins)
  const winsText = (g, p) => (g && g.mode === 'ai' && p === 0 ? T('wins.you') : T('wins.name', { name: nameOf(g, p) }));

  function saveGame() {
    if (!game) return;
    writeJSON(KEYS.save, { v: 1, mode: game.mode, level: game.level, first: game.first, moves: game.moves, recorded: game.recorded, usedUndo: !!game.usedUndo });
  }

  function loadGame() {
    const raw = readJSON(KEYS.save);
    if (!raw || raw.v !== 1 || !Array.isArray(raw.moves)) return null;
    try {
      const g = {
        mode: raw.mode === 'pvp' ? 'pvp' : 'ai',
        level: LEVELS[raw.level] ? raw.level : 'medium',
        first: raw.first === 1 ? 1 : 0,
        moves: raw.moves.slice(),
        recorded: raw.recorded === true,
        usedUndo: raw.usedUndo === true,
      };
      rebuild(g);
      if (g.state.over) g.recorded = true;
      return g;
    } catch (e) { return null; } // ván lưu bị hỏng: bỏ qua
  }

  // Dựng lại trạng thái + nhật ký từ danh sách nước (khôi phục, Đi lại)
  function rebuild(g) {
    const s = E.createState(cfgOf(g));
    g.log = [];
    for (let i = 0; i < g.moves.length; i++) {
      const m = g.moves[i];
      if (!E.isLegal(s, m)) throw new Error('Nước không hợp lệ');
      const p = s.turn;
      E.play(s, m);
      g.log.push(...describe(g, p, m, s));
    }
    g.state = s;
  }

  // Mô tả một nước cho nhật ký: "Bạn: cột 4", kèm dòng kết quả khi hết ván
  function describe(g, p, m, after) {
    const out = [{ p, text: T('log.move', { name: nameOf(g, p), c: m + 1 }) }];
    if (after.over) {
      if (after.winner === E.DRAW) out.push({ p: -1, info: true, big: true, text: T('log.full') });
      else out.push({ p: -1, info: true, big: true, text: T('log.win', { wins: winsText(g, after.winner), dir: DIR_TEXT[after.win.segs[0].dir] }) });
    }
    return out;
  }

  function startGame(cfg) {
    cancelAi();
    finishDrops();
    clearTimeout(resultTimer);
    clearTimeout(revealTimer);
    closeModal('modal-result');
    game = {
      mode: cfg.mode,
      level: cfg.level,
      first: cfg.mode === 'ai' ? cfg.first : 0,
      moves: [],
      recorded: false,
    };
    rebuild(game);
    winShown = false;
    dropEndAt = 0;
    focusCol = 3;
    saveGame();
    render();
    renderLog();
    writeSummary();
    PN && game.mode === 'ai' && PN.gameStart({ mode: game.level });
    scheduleAi();
  }

  function newGameSame() {
    startGame({ mode: game.mode, level: game.level, first: game.first });
  }

  // Đi một nước (người hoặc máy): cập nhật ván ngay, hiệu ứng rơi chạy song song
  function commitMove(c) {
    const s = game.state;
    const p = s.turn;
    const res = E.play(s, c);
    game.moves.push(c);
    game.log.push(...describe(game, p, c, s));
    if (s.over) recordResult();
    saveGame();
    writeSummary();
    winShown = false;
    render();
    const dur = dropDisc(res);
    dropEndAt = Date.now() + dur;
    renderLog();
    if (s.over) {
      // Quân cuối rơi xong mới tô đường thắng, rồi hiện bảng kết quả
      clearTimeout(revealTimer);
      clearTimeout(resultTimer);
      revealTimer = setTimeout(() => {
        winShown = true;
        render();
        resultTimer = setTimeout(showResult, reduceMotion.matches || settings.speed === 'off' ? 500 : 1100);
      }, dur + 40);
    } else {
      // Máy bắt đầu nghĩ ngay trong lúc quân của bạn đang rơi
      scheduleAi();
    }
  }

  function handleCol(c) {
    if (!game) return;
    const s = game.state;
    if (s.over) { toast(T('toast.over')); return; }
    if (thinking) { toast(T('toast.thinking')); return; }
    if (!humanCanPlay()) return;
    if (s.heights[c] >= ROWS) { toast(T('toast.colFull', { c: c + 1 })); return; }
    commitMove(c);
  }

  function scheduleAi() {
    if (!isAiTurn() || thinking) return;
    thinking = true;
    aiResult = null;
    const token = ++aiToken;
    const t0 = Date.now();
    render();
    AI.think(game.moves.slice(), cfgOf(game), game.level, (res) => {
      if (token !== aiToken) return;
      aiResult = { move: res && res.move, t0, token };
      maybePlayAi();
    });
  }

  // Máy đã có nước: chờ quân trước rơi xong + thời gian nghĩ tối thiểu rồi mới thả
  function maybePlayAi() {
    if (!aiResult) return;
    const r = aiResult;
    const fast = reduceMotion.matches || settings.speed === 'off';
    const wait = Math.max(0,
      (fast ? 200 : MIN_THINK_MS) - (Date.now() - r.t0),
      dropEndAt + AFTER_DROP_MS - Date.now());
    setTimeout(() => {
      if (r.token !== aiToken || aiResult !== r) return;
      aiResult = null;
      thinking = false;
      let m = r.move;
      if (!E.isLegal(game.state, m)) { // phòng hờ: không bao giờ để máy đi sai luật
        const legal = E.legalMoves(game.state);
        m = legal[(Math.random() * legal.length) | 0];
      }
      commitMove(m);
    }, wait);
  }

  function cancelAi() {
    aiToken++;
    aiResult = null;
    if (thinking) { thinking = false; AI.cancel(); }
  }

  function humanMoveCount() {
    let n = 0;
    for (let i = 0; i < game.moves.length; i++) if (moverOf(i) === 0) n++;
    return n;
  }
  function canUndo() {
    if (!game || game.state.over) return false;
    return game.mode === 'pvp' ? game.moves.length > 0 : humanMoveCount() > 0;
  }

  // Đi lại: ở chế độ đấu máy, gỡ nước của người chơi cùng nước đáp của máy
  function undo() {
    if (!canUndo()) return;
    game.usedUndo = true;
    cancelAi();
    finishDrops();
    do {
      game.moves.pop();
    } while (game.mode === 'ai' && game.moves.length > 0 && moverOf(game.moves.length) !== 0);
    rebuild(game);
    dropEndAt = 0;
    saveGame();
    render();
    renderLog();
    writeSummary();
    toast(T('toast.undone'));
    scheduleAi();
  }

  function recordResult() {
    if (game.recorded) return;
    game.recorded = true;
    const w = game.state.winner;
    if (game.mode === 'ai') {
      const lv = stats.levels[game.level];
      lv.played++;
      PN && PN.gameEnd({ mode: game.level, won: w === 0, assisted: !!game.usedUndo });
      if (w === 0) {
        lv.won++;
        stats.streak++;
        stats.best = Math.max(stats.best, stats.streak);
        const n = humanMoveCount();
        game.newFast = !lv.fast || n < lv.fast;
        if (game.newFast) lv.fast = n;
      } else if (w === E.DRAW) { lv.drawn++; stats.streak = 0; }
      else { lv.lost++; stats.streak = 0; }
    } else {
      stats.pvp.played++;
      if (w === 0) stats.pvp.p0++;
      else if (w === 1) stats.pvp.p1++;
      else stats.pvp.drawn++;
    }
    saveStats();
  }

  /* ---------------- Tóm tắt cho cổng PlayNine ---------------- */
  function writeSummary() {
    const ai = aiTotals();
    const played = ai.played + stats.pvp.played;
    const level = game && game.mode === 'ai' ? game.level : settings.level;
    const lvLabel = levelLabel(level);
    let note;
    if (ai.played) note = T('summary.note', { won: ai.won, played: ai.played, level: lvLabel });
    else if (stats.pvp.played) note = T('summary.notePvp', { n: stats.pvp.played });
    else note = T('summary.noteNone');
    const list = [];
    if (played) {
      list.push({ value: String(ai.won), label: T('summary.won') });
      list.push({ value: String(played), label: T('summary.played') });
      if (ai.fast) list.push({ value: T('moves', { n: ai.fast }), label: T('summary.fast') });
    }
    let resume = null;
    if (game && game.moves.length > 0 && !game.state.over) {
      const s = game.state;
      const ai2 = game.mode === 'ai';
      const turnText = ai2 ? (s.turn === 0 ? T('summary.turnYou') : T('summary.turnAi')) : T('summary.turnName', { name: playerName(s.turn) });
      resume = {
        title: ai2 ? T('summary.titleAi', { level: levelLabel(game.level) }) : T('summary.titlePvp'),
        detail: T('summary.detail', { ply: s.ply, cells: CELLS, turn: turnText }),
        pct: s.ply / CELLS,
      };
    }
    writeJSON(KEYS.summary, { v: 1, updatedAt: Date.now(), played, won: ai.won, note, stats: list, resume, daily: null });
  }

  /* ================= 4. Hiệu ứng ================= */
  // Quân vừa thả rơi từ hàng thả quân xuống ô của nó, nảy nhẹ một nhịp.
  // Trả về thời gian hiệu ứng (ms), 0 nếu không có hiệu ứng.
  function dropDisc(res) {
    const el = discEls[res.idx];
    const base = SPEED[settings.speed];
    if (!el || !base || reduceMotion.matches || !el.animate) return 0;
    const a = el.getBoundingClientRect();
    const b = dropRowEl.getBoundingClientRect();
    const dy = a.top - (b.top + b.height / 2 - a.height / 2);
    if (!(dy > 0)) return 0;
    const rows = ROWS - 1 - res.row + 1.2; // số hàng rơi qua, kể cả hàng thả quân
    const fall = base * Math.sqrt(rows / (ROWS + 0.2)); // rơi tự do: thời gian tỉ lệ căn quãng đường
    const total = Math.round(fall / 0.74);
    const bounce = Math.min(dy * 0.1, a.height * 0.2);
    el.animate([
      { transform: `translateY(${-dy}px)`, easing: 'cubic-bezier(0.5, 0, 0.9, 0.45)' },
      { transform: 'translateY(0)', offset: 0.74, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' },
      { transform: `translateY(${-bounce}px)`, offset: 0.87, easing: 'cubic-bezier(0.6, 0, 0.8, 0.4)' },
      { transform: 'translateY(0)' },
    ], { duration: total });
    return total;
  }

  // Kết thúc ngay mọi hiệu ứng rơi đang chạy (đi lại, ván mới)
  function finishDrops() {
    for (const el of discEls) {
      if (el && el.getAnimations) for (const an of el.getAnimations()) an.finish();
    }
    clearTimeout(revealTimer);
  }

  /* ================= 5. Render ================= */
  const boardEl = $('board');
  const discsEl = $('discs');
  const rimsEl = $('rims');
  const colsEl = $('cols');
  const ghostEl = $('ghost');
  const dropRowEl = ghostEl.parentElement;
  const winSvg = $('win-svg');
  const discEls = new Array(CELLS).fill(null);
  const rimEls = [];
  const colEls = [];
  let focusCol = 3; // cột nhận tiêu điểm bàn phím
  let hoverCol = -1; // cột chuột đang trỏ
  let kbdCol = false; // tiêu điểm bàn phím đang ở trên bàn
  let winKey = '';

  // Vị trí ô trên màn hình: --c cột, --r hàng tính từ trên xuống
  const placeCell = (el, idx) => {
    el.style.setProperty('--c', E.colOf(idx));
    el.style.setProperty('--r', ROWS - 1 - E.rowOf(idx));
  };

  function buildBoard() {
    const rims = document.createDocumentFragment();
    for (let i = 0; i < CELLS; i++) {
      const el = document.createElement('i');
      el.className = 'rim';
      placeCell(el, i);
      rimEls.push(el);
      rims.appendChild(el);
    }
    rimsEl.appendChild(rims);
    for (let c = 0; c < COLS; c++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'col';
      b.dataset.c = c;
      b.tabIndex = c === focusCol ? 0 : -1;
      colEls.push(b);
      colsEl.appendChild(b);
    }
  }

  // Đồng bộ phần tử quân với bàn: thêm quân mới, gỡ quân đã bị đi lại
  function renderDiscs() {
    const b = game.state.board;
    for (let i = 0; i < CELLS; i++) {
      const v = b[i];
      let el = discEls[i];
      if (v && el && el.dataset.p !== String(v - 1)) { el.remove(); el = discEls[i] = null; }
      if (v && !el) {
        el = document.createElement('i');
        el.className = 'disc p' + (v - 1);
        el.dataset.p = v - 1;
        placeCell(el, i);
        discsEl.appendChild(el);
        discEls[i] = el;
      } else if (!v && el) {
        el.remove();
        discEls[i] = null;
      }
    }
  }

  function render() {
    if (!game) return;
    const s = game.state;
    const can = humanCanPlay();
    renderDiscs();
    const won = s.over && s.winner !== E.DRAW && winShown;
    boardEl.classList.toggle('won', won);
    const winCells = won ? s.win.cells : [];
    for (let i = 0; i < CELLS; i++) {
      const rim = rimEls[i];
      const isLast = i === s.last && !won;
      rim.classList.toggle('last', isLast);
      if (isLast) rim.dataset.p = s.board[i] - 1;
      const w = winCells.includes(i);
      rim.classList.toggle('win', w);
      if (discEls[i]) discEls[i].classList.toggle('win', w);
    }
    if (won) rimsEl.style.setProperty('--wc', s.winner === 0 ? 'var(--p0)' : 'var(--p1)');
    renderWinLine(won ? s.win : null);
    colsEl.classList.toggle('locked', !can);
    for (let c = 0; c < COLS; c++) {
      const b = colEls[c];
      const h = s.heights[c];
      const full = h >= ROWS;
      b.tabIndex = c === focusCol ? 0 : -1;
      b.setAttribute('aria-disabled', !can || full ? 'true' : 'false');
      let label = T('col.label', { c: c + 1, state: full ? T('col.full') : h === 0 ? T('col.empty') : T('col.free', { n: ROWS - h }) });
      if (h > 0) label += T('col.top', { color: COLOR_NAME[s.board[(h - 1) * COLS + c] - 1] });
      b.setAttribute('aria-label', label);
    }
    renderGhost();
    renderInfo();
  }

  // Quân "ma" ở hàng thả quân + vòng nét đứt ở ô quân sẽ rơi vào
  function renderGhost() {
    const s = game.state;
    const c = hoverCol >= 0 ? hoverCol : kbdCol ? focusCol : -1;
    const show = c >= 0 && humanCanPlay() && s.heights[c] < ROWS;
    ghostEl.hidden = !show;
    for (const r of rimEls) r.classList.remove('target');
    if (!show) return;
    ghostEl.style.setProperty('--gc', c);
    ghostEl.className = 'disc ghost p' + s.turn;
    const t = rimEls[s.heights[c] * COLS + c];
    t.classList.add('target');
    t.style.setProperty('--tc', s.turn === 0 ? 'var(--p0)' : 'var(--p1)');
  }

  // Đường thẳng nối các quân thắng (vẽ trong hệ tọa độ 7 x 6 ô)
  function renderWinLine(win) {
    const key = win ? win.segs.map((x) => x.from + '-' + x.to).join(',') : '';
    if (key === winKey) return;
    winKey = key;
    if (!win) { winSvg.innerHTML = ''; return; }
    const pt = (i) => [E.colOf(i) + 0.5, ROWS - 1 - E.rowOf(i) + 0.5];
    let html = '';
    for (const seg of win.segs) {
      const [x1, y1] = pt(seg.from), [x2, y2] = pt(seg.to);
      const xy = `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" pathLength="1"`;
      html += `<line class="wl-bg draw" ${xy}/><line class="wl draw" ${xy}/>`;
    }
    winSvg.innerHTML = html;
  }

  const AVATAR = {
    human: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.2" r="4"/><path d="M4.5 20.5c.6-4 3.6-6.3 7.5-6.3s6.9 2.3 7.5 6.3z"/></svg>',
    ai: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="3.5"/><circle cx="9.3" cy="12" r="1.6" class="eye"/><circle cx="14.7" cy="12" r="1.6" class="eye"/><path d="M12 6V3.2"/><circle cx="12" cy="2.8" r="1.3"/></svg>',
  };

  function setTurnText(html) { $('turn-text').innerHTML = html; }

  function renderInfo() {
    const s = game.state;
    const ai = game.mode === 'ai';
    const lvLabel = levelLabel(game.level);
    $('mode-label').textContent = ai ? T('mode.ai', { level: lvLabel }) : T('mode.pvp');
    // Số quân mỗi bên đã thả: bên đi trước thả trước
    const used = [0, 0];
    for (let i = 0; i < game.moves.length; i++) used[moverOf(i)]++;
    for (const p of [0, 1]) {
      const card = $('player-' + p);
      const isAi = ai && p === 1;
      $('avatar-' + p).innerHTML = isAi ? AVATAR.ai : AVATAR.human;
      let sub = isAi ? T('sub.ai', { level: lvLabel }) : game.first === p ? T('sub.first') : T('sub.second');
      const isThinking = thinking && isAi && s.turn === 1;
      if (isThinking) sub = T('sub.thinking');
      $('name-' + p).textContent = playerName(p);
      $('sub-' + p).textContent = sub;
      const left = $('left-' + p);
      left.lastChild.textContent = 21 - used[p];
      left.setAttribute('aria-label', T('left.label', { n: 21 - used[p], color: COLOR_NAME[p] }));
      left.title = T('left.title', { n: 21 - used[p] });
      card.classList.toggle('active', !s.over && s.turn === p);
      card.classList.toggle('thinking', isThinking);
      card.classList.toggle('winner', s.over && winShown && s.winner === p);
    }

    const turn = $('turn');
    turn.classList.toggle('thinking', thinking);
    let color = s.turn === 0 ? 'var(--p0)' : 'var(--p1)';
    const n = game.moves.length;
    const lastText = n ? T('turn.last', { name: playerName(moverOf(n - 1)), c: game.moves[n - 1] + 1 }) : '';
    if (s.over) {
      if (!winShown) {
        color = moverOf(n - 1) === 0 ? 'var(--p0)' : 'var(--p1)';
        setTurnText(lastText);
      } else if (s.winner === E.DRAW) {
        color = 'var(--muted)';
        setTurnText(T('turn.draw'));
      } else {
        color = s.winner === 0 ? 'var(--p0)' : 'var(--p1)';
        const who = ai ? (s.winner === 0 ? T('win.you') : T('win.ai')) : T('win.name', { name: playerName(s.winner) });
        setTurnText(T('turn.over', { who, dir: DIR_TEXT[s.win.segs[0].dir] }));
      }
    } else if (thinking) {
      setTurnText(`<span class="dots">${T('turn.thinking')}</span>`);
    } else if (ai) {
      setTurnText((n && moverOf(n - 1) === 1 ? T('turn.aiLast', { c: game.moves[n - 1] + 1 }) : '') +
        T('turn.you') + (n < 2 ? T('turn.tapCol') : ''));
    } else {
      setTurnText(T('turn.name', { name: playerName(s.turn), color: COLOR_NAME[s.turn] }));
    }
    turn.style.setProperty('--turn-c', color);
    $('btn-undo').disabled = !canUndo();
  }

  function renderLog() {
    const list = $('log');
    const items = game.log;
    let n = 0;
    const rows = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.info) n++;
      rows.push(`<li class="log-item${it.info ? ' info' : ''}${it.big ? ' big' : ''}" data-p="${it.p}">` +
        (it.info ? '<span class="log-n" aria-hidden="true">·</span>' : `<span class="log-n">${n}</span>`) +
        `<span class="log-text">${it.text}</span></li>`);
    }
    list.innerHTML = rows.length ? rows.reverse().join('') : `<li class="log-empty">${T('log.empty')}</li>`;
    list.scrollTop = 0;
  }

  /* ---------------- Chuột / chạm / bàn phím trên bàn ---------------- */
  function setFocusCol(c, focus) {
    c = Math.max(0, Math.min(COLS - 1, c));
    if (colEls[focusCol]) colEls[focusCol].tabIndex = -1;
    focusCol = c;
    colEls[c].tabIndex = 0;
    if (focus) colEls[c].focus();
    renderGhost();
  }

  let keyDropAt = 0; // lúc vừa thả bằng phím: bỏ qua cú click mà trình duyệt sinh thêm
  colsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.col');
    if (!b || Date.now() - keyDropAt < 400) return;
    const c = +b.dataset.c;
    setFocusCol(c, false);
    handleCol(c);
  });
  colsEl.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const b = e.target.closest('.col');
    const c = b ? +b.dataset.c : -1;
    if (c !== hoverCol) { hoverCol = c; renderGhost(); }
  });
  colsEl.addEventListener('pointerleave', () => { if (hoverCol >= 0) { hoverCol = -1; renderGhost(); } });
  colsEl.addEventListener('focusin', () => { kbdCol = true; renderGhost(); });
  colsEl.addEventListener('focusout', () => { kbdCol = false; renderGhost(); });
  colsEl.addEventListener('keydown', (e) => {
    const b = e.target.closest('.col');
    if (!b || !game) return;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      setFocusCol(focusCol + (k === 'ArrowLeft' ? -1 : 1), true);
    } else if (k === 'Home' || k === 'End') {
      e.preventDefault();
      setFocusCol(k === 'Home' ? 0 : COLS - 1, true);
    } else if (k === 'Enter' || k === ' ' || k === 'ArrowDown') {
      e.preventDefault();
      keyDropAt = Date.now();
      handleCol(focusCol);
    }
  });

  /* ---------------- Thông báo nhanh ---------------- */
  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  /* ---------------- Modal ---------------- */
  let modalStack = [];
  const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function openModal(id, focusSel) {
    const el = $(id);
    if (!el.hidden) return;
    modalStack.push({ id, back: document.activeElement });
    el.hidden = false;
    const target = (focusSel && el.querySelector(focusSel)) || el.querySelector('.btn-primary') || el.querySelector(FOCUSABLE);
    if (target) target.focus();
  }
  function closeModal(id) {
    const el = $(id);
    if (!el || el.hidden) return;
    el.hidden = true;
    const i = modalStack.findIndex((x) => x.id === id);
    const entry = i >= 0 ? modalStack.splice(i, 1)[0] : null;
    if (id === 'modal-help') onHelpClosed();
    if (entry && entry.back && document.contains(entry.back) && entry.back.focus) entry.back.focus();
  }
  const topModal = () => (modalStack.length ? modalStack[modalStack.length - 1].id : null);

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-close]');
    if (t) closeModal(t.dataset.close);
  });

  document.addEventListener('keydown', (e) => {
    const top = topModal();
    if (top) {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(top); return; }
      if (e.key === 'Tab') { // giữ tiêu điểm trong modal
        const items = [...$(top).querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if (top === 'modal-help' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !e.target.closest('.segmented')) {
        e.preventDefault();
        showHelp(helpIdx + (e.key === 'ArrowRight' ? 1 : -1));
      }
      return;
    }
    if (e.altKey || e.metaKey) return;
    if (e.target.closest('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey) {
      if (k === 'z') { e.preventDefault(); undo(); }
      return;
    }
    // Phím số 1–7: thả thẳng vào cột
    if (/^[1-7]$/.test(e.key)) {
      e.preventDefault();
      setFocusCol(+e.key - 1, false);
      handleCol(+e.key - 1);
      return;
    }
    // ←/→/↓ khi tiêu điểm nằm ngoài bàn (vd. vừa tải trang): vẫn chọn cột, thả quân được
    if (!e.target.closest('.cols, .segmented, .log')) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusCol(kbdCol || document.activeElement === document.body ? focusCol + (e.key === 'ArrowLeft' ? -1 : 1) : focusCol, true);
        return;
      }
      if (e.key === 'ArrowDown' && (document.activeElement === document.body || !document.activeElement)) {
        e.preventDefault();
        handleCol(focusCol);
        return;
      }
    }
    if (k === 'z' || k === 'u') { e.preventDefault(); undo(); }
    else if (k === 'n') { e.preventDefault(); openNewGame(); }
    else if (k === 'h' || k === '?') { e.preventDefault(); openHelp(); }
  });

  /* ---------------- Nút chọn dạng segmented ---------------- */
  function setSegmented(group, value) {
    for (const b of group.querySelectorAll('[role="radio"]')) {
      const on = b.dataset.value === String(value);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    }
  }
  function bindSegmented(group, onPick) {
    group.addEventListener('click', (e) => {
      const b = e.target.closest('[role="radio"]');
      if (!b) return;
      setSegmented(group, b.dataset.value);
      onPick(b.dataset.value);
    });
    group.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const items = [...group.querySelectorAll('[role="radio"]')];
      const i = items.findIndex((x) => x.getAttribute('aria-checked') === 'true');
      const d = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
      const next = items[(i + d + items.length) % items.length];
      setSegmented(group, next.dataset.value);
      next.focus();
      onPick(next.dataset.value);
    });
  }

  /* ---------------- Ván mới ---------------- */
  const draft = { mode: 'ai', level: 'medium', first: 0 };
  const fieldGroup = (name) => document.querySelector(`#modal-new [data-field="${name}"]`);

  function syncNewModal() {
    setSegmented(fieldGroup('mode'), draft.mode);
    setSegmented(fieldGroup('level'), draft.level);
    setSegmented(fieldGroup('first'), draft.first);
    for (const el of document.querySelectorAll('#modal-new [data-ai-only]')) el.hidden = draft.mode !== 'ai';
    for (const el of document.querySelectorAll('#modal-new [data-pvp-only]')) el.hidden = draft.mode !== 'pvp';
    $('level-desc').textContent = T('levelDesc.' + draft.level);
  }
  function openNewGame() {
    draft.mode = game ? game.mode : settings.mode;
    draft.level = game ? game.level : settings.level;
    draft.first = game && game.mode === 'ai' ? game.first : settings.first;
    $('new-warning').hidden = !(game && game.moves.length > 0 && !game.state.over);
    syncNewModal();
    closeModal('modal-result');
    openModal('modal-new');
  }
  bindSegmented(fieldGroup('mode'), (v) => { draft.mode = v; syncNewModal(); });
  bindSegmented(fieldGroup('level'), (v) => { draft.level = v; syncNewModal(); });
  bindSegmented(fieldGroup('first'), (v) => { draft.first = +v; syncNewModal(); });
  $('btn-start').addEventListener('click', () => {
    settings.mode = draft.mode;
    settings.level = draft.level;
    settings.first = draft.first;
    saveSettings();
    closeModal('modal-new');
    startGame({ mode: draft.mode, level: draft.level, first: draft.first });
  });

  /* ---------------- Kết quả ---------------- */
  function showResult() {
    if (!game || !game.state.over || topModal()) return;
    const s = game.state;
    const w = s.winner;
    const ai = game.mode === 'ai';
    const lv = levelLabel(game.level);
    const dir = w === E.DRAW ? '' : DIR_TEXT[s.win.segs[0].dir];
    let title, sub, celebrate = false;
    if (w === E.DRAW) {
      title = T('result.draw');
      sub = T('result.drawSub');
    } else if (ai) {
      const youWin = w === 0;
      title = youWin ? T('win.you') : T('result.aiWins');
      sub = youWin ? T('result.subWin', { dir, moves: T('moves', { n: humanMoveCount() }), level: lv }) : T('result.subLose', { dir });
      celebrate = youWin;
    } else {
      title = T('win.name', { name: playerName(w) });
      sub = T('result.subPvp', { color: COLOR_NAME[w], dir, moves: T('moves', { n: game.moves.length }) });
      celebrate = true;
    }
    $('result-mark').className = 'result-mark' + (w === E.DRAW ? ' draw' : ' p' + w);
    $('result-mark').innerHTML = '<i></i>';
    $('result-title').textContent = title;
    $('result-sub').textContent = sub;
    if (ai) {
      const st = stats.levels[game.level];
      let line = T('result.lineAi', { level: lv, won: st.won, lost: st.lost, d: st.drawn }) + (stats.streak > 1 ? T('result.streak', { n: stats.streak }) : '');
      if (w === 0 && game.newFast && st.won > 1) line = T('result.record', { level: lv, moves: T('moves', { n: st.fast }) }) + line;
      $('result-line').textContent = line;
    } else {
      $('result-line').textContent = T('result.linePvp', { p0: stats.pvp.p0, p1: stats.pvp.p1, d: stats.pvp.drawn });
    }
    $('btn-result-new').textContent = ai ? T('btn.playAgain') : T('btn.new');
    const conf = $('confetti');
    conf.innerHTML = '';
    if (celebrate && !reduceMotion.matches) {
      const colors = ['#e0b964', '#b3261e', 'var(--accent)', 'var(--text)'];
      for (let i = 0; i < 28; i++) {
        const p = document.createElement('i');
        p.style.left = (Math.random() * 100).toFixed(1) + '%';
        p.style.background = colors[i % colors.length];
        p.style.animationDelay = (Math.random() * 0.5).toFixed(2) + 's';
        p.style.transform = `rotate(${(Math.random() * 360) | 0}deg)`;
        conf.appendChild(p);
      }
    }
    openModal('modal-result', '#btn-result-new');
  }
  $('btn-result-new').addEventListener('click', () => { closeModal('modal-result'); newGameSame(); });

  /* ---------------- Thống kê ---------------- */
  const fastText = (n) => (n ? T('moves', { n }) : '—');
  function renderStats() {
    const ai = aiTotals();
    $('stats-won').textContent = ai.won;
    $('stats-best').textContent = stats.best;
    $('stats-fast').textContent = fastText(ai.fast);
    $('stats-body').innerHTML = LEVEL_ORDER.map((k) => {
      const r = stats.levels[k];
      return `<tr><td>${levelLabel(k)}</td><td>${r.played}</td><td>${r.won}</td><td>${r.lost}</td><td>${r.drawn}</td><td>${fastText(r.fast)}</td></tr>`;
    }).join('');
    const p = stats.pvp;
    $('stats-pvp').textContent = p.played ? T('stats.pvpLine', { n: p.played, p0: p.p0, p1: p.p1, d: p.drawn }) : T('stats.none');
    resetConfirm(false);
  }
  let resetTimer = 0;
  function resetConfirm(on) {
    const btn = $('btn-stats-reset');
    btn.classList.toggle('confirm', on);
    btn.textContent = on ? T('btn.resetConfirm') : T('btn.reset');
    clearTimeout(resetTimer);
    if (on) resetTimer = setTimeout(() => resetConfirm(false), 3500);
  }
  $('btn-stats').addEventListener('click', () => { renderStats(); openModal('modal-stats'); });
  $('btn-stats-reset').addEventListener('click', () => {
    if (!$('btn-stats-reset').classList.contains('confirm')) { resetConfirm(true); return; }
    stats = emptyStats();
    saveStats();
    writeSummary();
    renderStats();
    toast(T('toast.statsReset'));
  });

  /* ---------------- Cài đặt + giao diện ---------------- */
  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'light' || settings.theme === 'dark') root.setAttribute('data-theme', settings.theme);
    else root.removeAttribute('data-theme');
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (bg) $('theme-color').setAttribute('content', bg);
  }
  const settingGroup = (name) => document.querySelector(`#modal-settings [data-setting="${name}"]`);
  bindSegmented(settingGroup('theme'), (v) => { settings.theme = v; saveSettings(); applyTheme(); });
  bindSegmented(settingGroup('speed'), (v) => { settings.speed = v; saveSettings(); });
  // Đổi ngôn ngữ: lưu ván + cài đặt rồi tải lại trang
  bindSegmented(settingGroup('lang'), (v) => { saveGame(); saveSettings(); I18N.set(v); });
  $('btn-settings').addEventListener('click', () => {
    setSegmented(settingGroup('theme'), settings.theme);
    setSegmented(settingGroup('speed'), settings.speed);
    setSegmented(settingGroup('lang'), I18N.lang);
    openModal('modal-settings');
  });
  $('btn-settings-help').addEventListener('click', () => { closeModal('modal-settings'); openHelp(); });
  if (window.matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme();
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* ---------------- Cách chơi (có hình minh họa) ---------------- */
  let figId = 0;
  // Bàn minh họa: ô 10 x 10, tâm ô (cột c, hàng r tính từ trên) ở (c*10+5, r*10+6);
  // hàng thả quân phía trên có tâm y = -6
  const FX = (c) => c * 10 + 5;
  const FY = (r) => r * 10 + 6;
  // cfg: { alt, grid: [6 chuỗi từ trên xuống], ghost: { c, p }, line: [[c, r], [c, r]] }
  //   ký tự trong grid: '.' trống, 'a' / 'b' quân vàng / đỏ, 'A' / 'B' quân thuộc đường thắng,
  //   '+' ô quân sẽ rơi vào (vòng nét đứt), 'x' ô không nên thả (vòng đỏ gạch chéo)
  function figure(cfg) {
    const uid = ++figId;
    const hasWin = cfg.grid.some((row) => /[AB]/.test(row));
    let s = `<svg viewBox="-3 -12 76 74" role="img" aria-label="${cfg.alt}">`;
    s += `<defs><marker id="ah${uid}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path class="d-arrow-head" d="M0 0L10 5L0 10z"/></marker></defs>`;
    s += '<rect class="d-frame" x="-2" y="0" width="74" height="62" rx="4"/>';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = cfg.grid[r][c];
        const x = FX(c), y = FY(r);
        s += `<circle class="d-hole" cx="${x}" cy="${y}" r="3.9"/>`;
        if (ch === 'a' || ch === 'b' || ch === 'A' || ch === 'B') {
          const p = ch.toLowerCase() === 'a' ? 0 : 1;
          const dim = hasWin && ch === ch.toLowerCase() ? ' d-dim' : '';
          s += `<circle class="d-d${p}${dim}" cx="${x}" cy="${y}" r="3.9"/>`;
        } else if (ch === '+') {
          s += `<circle class="d-target" cx="${x}" cy="${y}" r="2.9"/>`;
        } else if (ch === 'x') {
          s += `<circle class="d-bad" cx="${x}" cy="${y}" r="3"/><path class="d-bad" d="M${x - 2} ${y - 2}L${x + 2} ${y + 2}M${x + 2} ${y - 2}L${x - 2} ${y + 2}"/>`;
        }
      }
    }
    if (cfg.line) {
      const [[c1, r1], [c2, r2]] = cfg.line;
      const xy = `x1="${FX(c1)}" y1="${FY(r1)}" x2="${FX(c2)}" y2="${FY(r2)}"`;
      s += `<line class="d-line-bg" ${xy}/><line class="d-line" ${xy}/>`;
    }
    if (cfg.ghost) {
      const { c, p } = cfg.ghost;
      s += `<circle class="d-d${p} d-ghost" cx="${FX(c)}" cy="-6" r="3.9"/>`;
      // Mũi tên từ quân "ma" xuống ô sẽ rơi vào (ô '+', không có thì ô trống thấp nhất)
      let r = cfg.grid.findIndex((row) => row[c] === '+');
      if (r < 0) { r = ROWS - 1; while (r > 0 && cfg.grid[r][c] !== '.') r--; }
      s += `<path class="d-arrow" d="M${FX(c)} -1.2V${FY(r) - 5.2}" marker-end="url(#ah${uid})"/>`;
    }
    return s + '</svg>';
  }
  const HELP = [
    {
      title: T('help.1.title'),
      text: T('help.1.text'),
      fig: { alt: T('help.1.alt'), grid: ['.......', '.......', '.......', '...+...', '...b...', '..aab..'], ghost: { c: 3, p: 0 } },
    },
    {
      title: T('help.2.title'),
      text: T('help.2.text'),
      fig: { alt: T('help.2.alt'), grid: ['.......', '.......', '....A..', '...Ab..', '..Abb..', '.Abab..'], line: [[1, 5], [4, 2]] },
    },
    {
      title: T('help.3.title'),
      text: T('help.3.text'),
      fig: { alt: T('help.3.alt'), grid: ['.......', '.......', '.......', '.......', 'a......', 'abbb+..'], ghost: { c: 4, p: 0 } },
    },
    {
      title: T('help.4.title'),
      text: T('help.4.text'),
      fig: { alt: T('help.4.alt'), grid: ['.......', '.......', '.......', '.......', 'bbb+...', 'aabxa..'] },
    },
    {
      title: T('help.5.title'),
      text: T('help.5.text'),
      fig: { alt: T('help.5.alt'), grid: ['.......', '.......', '.......', '.......', '...bb..', '.+aaa+b'] },
    },
  ];
  let helpIdx = 0;

  function showHelp(i) {
    helpIdx = Math.max(0, Math.min(HELP.length - 1, i));
    const h = HELP[helpIdx];
    $('help-body').innerHTML =
      `<div class="help-figure">${figure(h.fig)}</div>` +
      `<p class="help-step">${T('help.step', { i: helpIdx + 1, n: HELP.length })}</p>` +
      `<h3>${h.title}</h3><p>${h.text}</p>`;
    const dots = $('help-dots');
    if (!dots.children.length) {
      HELP.forEach((_, k) => {
        const d = document.createElement('button');
        d.type = 'button';
        d.setAttribute('role', 'tab');
        d.setAttribute('aria-label', T('help.dot', { i: k + 1 }));
        d.addEventListener('click', () => showHelp(k));
        dots.appendChild(d);
      });
    }
    [...dots.children].forEach((d, k) => {
      d.setAttribute('aria-selected', k === helpIdx ? 'true' : 'false');
      d.tabIndex = k === helpIdx ? 0 : -1;
    });
    $('btn-help-prev').disabled = helpIdx === 0;
    $('btn-help-next').textContent = helpIdx === HELP.length - 1 ? T('btn.letsPlay') : T('btn.next');
  }
  function openHelp() {
    showHelp(0);
    openModal('modal-help', '#btn-help-next');
  }
  function onHelpClosed() {
    if (!settings.guideSeen) { settings.guideSeen = true; saveSettings(); }
  }
  $('btn-help').addEventListener('click', openHelp);
  $('btn-help-prev').addEventListener('click', () => showHelp(helpIdx - 1));
  $('btn-help-next').addEventListener('click', () => {
    if (helpIdx >= HELP.length - 1) closeModal('modal-help');
    else showHelp(helpIdx + 1);
  });

  /* ---------------- Nút điều khiển ---------------- */
  $('btn-undo').addEventListener('click', undo);
  $('btn-new').addEventListener('click', openNewGame);

  /* ================= Khởi động ================= */
  I18N.apply();
  I18N.onBeforeReload = saveGame; // tải lại do đổi ngôn ngữ: lưu ván trước
  $('app-version').textContent = APP_VERSION;
  applyTheme();
  buildBoard();
  AI.start();
  const saved = loadGame();
  if (saved) {
    game = saved;
    PN && game.mode === 'ai' && !game.recorded && PN.gameStart({ mode: game.level, resume: true });
    winShown = true; // ván đã xong lúc rời đi: tô đường thắng ngay
    render();
    renderLog();
    writeSummary();
    scheduleAi();
  } else {
    startGame({ mode: settings.mode, level: settings.level, first: settings.first });
  }
  // Lần đầu vào game: tự mở hướng dẫn (đánh dấu đã xem ngay để chỉ hiện một lần)
  if (!settings.guideSeen) {
    settings.guideSeen = true;
    saveSettings();
    openHelp();
  }
})();
