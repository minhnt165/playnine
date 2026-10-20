/* =====================================================================
 * Cờ 9 Ô - Game (chỉ chạy trong trình duyệt, cần engine.js nạp trước)
 *   1. Lưu trữ: cài đặt, thống kê, ván đang chơi, tóm tắt cho cổng PlayNine
 *   2. Máy nghĩ trong Web Worker (tạo từ Blob mã nguồn engine)
 *   3. Điều khiển ván: đánh, máy đi, đi lại, đổi bên, ván mới, kết thúc
 *   4. Render bàn cờ, người chơi, modal, hướng dẫn có hình minh họa
 * ===================================================================== */
(() => {
  'use strict';

  // Phiên bản app: tăng khi phát hành, đồng bộ với ?v= ở index.html
  const APP_VERSION = '1.0.0';
  const KEYS = {
    settings: 'playnine-co9o-settings-v1',
    save: 'playnine-co9o-save-v1',
    stats: 'playnine-co9o-stats-v1',
    summary: 'playnine-co9o-summary-v1',
  };
  const { X, O, DRAW } = Co9o;
  const LEVELS = Co9o.LEVELS;
  const LEVEL_ORDER = ['easy', 'medium', 'hard'];
  const LEVEL_DESC = {
    easy: 'Máy nghĩ nhanh và thỉnh thoảng đi hớ. Hợp để làm quen luật.',
    medium: 'Máy nghĩ khoảng 1 giây mỗi nước, đối thủ vững để luyện tập.',
    hard: 'Máy nghĩ khoảng 2 giây mỗi nước và rất khó thắng.',
  };
  // Tên vị trí trong lưới 3x3 (dùng cho cả ô và bàn nhỏ)
  const POS = ['trên trái', 'trên giữa', 'trên phải', 'giữa trái', 'chính giữa', 'giữa phải', 'dưới trái', 'dưới giữa', 'dưới phải'];
  const MARK = { 1: 'X', 2: 'O' };
  const MIN_THINK_MS = 420; // máy luôn "nghĩ" tối thiểu chừng này để người chơi kịp thấy nước của mình

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  /* ================= 1. Lưu trữ ================= */
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  const DEFAULT_SETTINGS = { theme: 'auto', mode: 'ai', level: 'medium', side: X, guideSeen: false };
  let settings = loadSettings();

  function loadSettings() {
    const s = { ...DEFAULT_SETTINGS };
    const raw = readJSON(KEYS.settings) || {};
    if (['auto', 'light', 'dark'].includes(raw.theme)) s.theme = raw.theme;
    if (raw.mode === 'ai' || raw.mode === 'pvp') s.mode = raw.mode;
    if (LEVELS[raw.level]) s.level = raw.level;
    if (raw.side === X || raw.side === O) s.side = raw.side;
    s.guideSeen = raw.guideSeen === true;
    return s;
  }
  function saveSettings() { writeJSON(KEYS.settings, settings); }

  function emptyStats() {
    const levels = {};
    for (const lv of LEVEL_ORDER) levels[lv] = { played: 0, won: 0, lost: 0, drawn: 0 };
    return { levels, pvp: { played: 0, x: 0, o: 0, drawn: 0 }, streak: 0, best: 0 };
  }
  const toInt = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  function loadStats() {
    const st = emptyStats();
    const raw = readJSON(KEYS.stats);
    if (!raw || typeof raw !== 'object') return st;
    for (const lv of LEVEL_ORDER) {
      const r = raw.levels && raw.levels[lv];
      if (r) for (const k of ['played', 'won', 'lost', 'drawn']) st.levels[lv][k] = toInt(r[k]);
    }
    if (raw.pvp) for (const k of ['played', 'x', 'o', 'drawn']) st.pvp[k] = toInt(raw.pvp[k]);
    st.streak = toInt(raw.streak);
    st.best = toInt(raw.best);
    return st;
  }
  let stats = loadStats();
  function saveStats() { writeJSON(KEYS.stats, stats); }

  function aiTotals() {
    let played = 0, won = 0;
    for (const lv of LEVEL_ORDER) { played += stats.levels[lv].played; won += stats.levels[lv].won; }
    return { played, won };
  }

  /* ================= 2. Máy nghĩ trong Web Worker ================= */
  // Worker được dựng từ chính mã nguồn hàm Co9oFactory (qua Blob) nên chạy được
  // cả khi mở trang bằng file://. Không tạo được worker thì tính trên luồng chính.
  const AI = {
    worker: null,
    nextId: 0,
    pending: null, // { id, cb, moves, level }
    source() {
      return 'var Co9o = (' + Co9o.factory.toString() + ')();\n' +
        'self.onmessage = function (e) {\n' +
        '  var d = e.data;\n' +
        '  var res = Co9o.chooseMove(Co9o.fromMoves(d.moves), { level: d.level });\n' +
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
          if (p) { this.pending = null; this.think(p.moves, p.level, p.cb); }
        };
      } catch (e) { this.worker = null; }
    },
    think(moves, level, cb) {
      const id = ++this.nextId;
      this.pending = { id, cb, moves, level };
      if (this.worker) { this.worker.postMessage({ id, moves, level }); return; }
      setTimeout(() => {
        if (!this.pending || this.pending.id !== id) return;
        this.pending = null;
        cb(Co9o.chooseMove(Co9o.fromMoves(moves), { level }));
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
  // game: { mode: 'ai'|'pvp', level, human: X|O, moves: [], recorded, state }
  let game = null;
  let thinking = false;
  let aiToken = 0;
  let fx = { move: -1, closed: [], line: false }; // hiệu ứng cho lần render kế tiếp
  let resultTimer = 0;

  const sideToMove = (n) => (n % 2 === 0 ? X : O);
  const isAiTurn = () => game && game.mode === 'ai' && !game.state.winner && game.state.turn !== game.human;
  const humanCanPlay = () => game && !game.state.winner && !thinking && (game.mode === 'pvp' || game.state.turn === game.human);

  function saveGame() {
    if (!game) return;
    writeJSON(KEYS.save, { v: 1, mode: game.mode, level: game.level, human: game.human, moves: game.moves, recorded: game.recorded });
  }

  function loadGame() {
    const raw = readJSON(KEYS.save);
    if (!raw || raw.v !== 1 || !Array.isArray(raw.moves)) return null;
    try {
      const state = Co9o.fromMoves(raw.moves);
      return {
        mode: raw.mode === 'pvp' ? 'pvp' : 'ai',
        level: LEVELS[raw.level] ? raw.level : 'medium',
        human: raw.human === O ? O : X,
        moves: raw.moves.slice(),
        recorded: raw.recorded === true || !!state.winner,
        state,
      };
    } catch (e) { return null; } // ván lưu bị hỏng: bỏ qua
  }

  function startGame(cfg) {
    cancelAi();
    clearTimeout(resultTimer);
    closeModal('modal-result');
    game = {
      mode: cfg.mode,
      level: cfg.level,
      human: cfg.human,
      moves: [],
      recorded: false,
      state: Co9o.createState(),
    };
    fx = { move: -1, closed: [], line: true };
    focusIdx = 40;
    saveGame();
    render();
    writeSummary();
    scheduleAi();
  }

  function newGameSame() {
    startGame({ mode: game.mode, level: game.level, human: game.human });
  }

  function makeMove(m) {
    const s = game.state;
    const before = s.boards.slice();
    Co9o.play(s, m);
    game.moves.push(m);
    const closed = [];
    for (let b = 0; b < 9; b++) if (before[b] !== s.boards[b]) closed.push(b);
    fx = { move: m, closed, line: true };
    saveGame();
    render();
    writeSummary();
    if (s.winner) onGameOver();
    else scheduleAi();
  }

  function handleCell(m) {
    if (!game || game.state.winner) return;
    if (thinking) { toast('Máy đang nghĩ, chờ chút nhé'); return; }
    if (!humanCanPlay()) return;
    const s = game.state;
    if (s.cells[m]) return;
    if (!Co9o.isLegal(s, m)) {
      toast(s.forced >= 0 ? `Phải đánh vào bàn ${POS[s.forced]} đang sáng` : 'Bàn này đã xong, chọn bàn khác đang sáng');
      nudgePlayable();
      return;
    }
    makeMove(m);
  }

  function scheduleAi() {
    if (!isAiTurn() || thinking) return;
    thinking = true;
    const token = ++aiToken;
    const t0 = Date.now();
    render();
    AI.think(game.moves.slice(), game.level, (res) => {
      if (token !== aiToken) return;
      const wait = Math.max(0, (reduceMotion.matches ? 150 : MIN_THINK_MS) - (Date.now() - t0));
      setTimeout(() => {
        if (token !== aiToken) return;
        thinking = false;
        let m = res && res.move;
        if (!Co9o.isLegal(game.state, m)) { // phòng hờ: không bao giờ để máy đi sai luật
          const legal = Co9o.legalMoves(game.state);
          m = legal[(Math.random() * legal.length) | 0];
        }
        makeMove(m);
        followFocus();
      }, wait);
    });
  }

  function cancelAi() {
    aiToken++;
    if (thinking) { thinking = false; AI.cancel(); }
  }

  function humanMoveCount() {
    let n = 0;
    for (let i = 0; i < game.moves.length; i++) if (sideToMove(i) === game.human) n++;
    return n;
  }
  function canUndo() {
    if (!game || game.state.winner) return false;
    return game.mode === 'pvp' ? game.moves.length > 0 : humanMoveCount() > 0;
  }

  // Đi lại: ở chế độ đấu máy, gỡ nước của người chơi cùng nước đáp của máy
  function undo() {
    if (!canUndo()) return;
    cancelAi();
    do {
      game.moves.pop();
    } while (game.mode === 'ai' && game.moves.length > 0 && sideToMove(game.moves.length) !== game.human);
    game.state = Co9o.fromMoves(game.moves);
    fx = { move: -1, closed: [], line: false };
    saveGame();
    render();
    writeSummary();
    scheduleAi();
  }

  // Đổi bên: người chơi cầm quân bên kia, máy tiếp quản phía còn lại
  function swapSides() {
    if (!game || game.mode !== 'ai') return;
    const human = 3 - game.human;
    settings.side = human;
    saveSettings();
    if (game.state.winner) { startGame({ mode: 'ai', level: game.level, human }); return; }
    cancelAi();
    game.human = human;
    fx = { move: -1, closed: [], line: false };
    saveGame();
    render();
    writeSummary();
    toast(`Bạn chuyển sang cầm ${MARK[human]}`);
    scheduleAi();
  }

  function onGameOver() {
    recordResult();
    saveGame();
    writeSummary();
    clearTimeout(resultTimer);
    resultTimer = setTimeout(showResult, reduceMotion.matches ? 250 : 1350);
  }

  function recordResult() {
    if (game.recorded) return;
    game.recorded = true;
    const w = game.state.winner;
    if (game.mode === 'ai') {
      const lv = stats.levels[game.level];
      lv.played++;
      if (w === game.human) { lv.won++; stats.streak++; stats.best = Math.max(stats.best, stats.streak); }
      else if (w === DRAW) { lv.drawn++; stats.streak = 0; }
      else { lv.lost++; stats.streak = 0; }
    } else {
      stats.pvp.played++;
      if (w === X) stats.pvp.x++;
      else if (w === O) stats.pvp.o++;
      else stats.pvp.drawn++;
    }
    saveStats();
  }

  /* ---------------- Tóm tắt cho cổng PlayNine ---------------- */
  function writeSummary() {
    const ai = aiTotals();
    const played = ai.played + stats.pvp.played;
    const level = game && game.mode === 'ai' ? game.level : settings.level;
    const lvLabel = LEVELS[level].label;
    let note;
    if (ai.played) note = `Thắng máy ${ai.won}/${ai.played} ván · mức ${lvLabel}`;
    else if (stats.pvp.played) note = `${stats.pvp.played} ván hai người · chưa đấu máy`;
    else note = 'Chưa chơi ván nào · thử đấu máy nhé';
    const list = [];
    if (played) {
      list.push({ value: String(ai.won), label: 'Thắng máy' });
      list.push({ value: String(played), label: 'Ván đã chơi' });
      list.push({ value: String(stats.best), label: 'Chuỗi thắng dài nhất' });
    }
    let resume = null;
    if (game && game.moves.length > 0 && !game.state.winner) {
      const s = game.state;
      const cnt = Co9o.countBoards(s);
      let boardsText;
      if (cnt.x && cnt.o) boardsText = `X thắng ${cnt.x}, O thắng ${cnt.o} bàn nhỏ`;
      else if (cnt.x || cnt.o) boardsText = `${cnt.x ? 'X' : 'O'} đã thắng ${cnt.x || cnt.o} bàn nhỏ`;
      else boardsText = `Đã đi ${s.ply} nước`;
      const turnText = game.mode === 'ai' ? (s.turn === game.human ? 'đến lượt bạn' : 'đến lượt máy') : `đến lượt ${MARK[s.turn]}`;
      resume = {
        title: game.mode === 'ai' ? `Cờ 9 Ô với máy · ${LEVELS[game.level].label}` : 'Cờ 9 Ô hai người',
        detail: `${boardsText} · ${turnText}`,
        pct: null,
      };
    }
    writeJSON(KEYS.summary, { v: 1, updatedAt: Date.now(), played, won: ai.won, note, stats: list, resume, daily: null });
  }

  /* ================= 4. Render ================= */
  const boardEl = $('board');
  const sbEls = [];
  const cellEls = [];
  const cellShown = new Int8Array(81).fill(-1); // giá trị đã vẽ của từng ô, tránh vẽ lại
  const sbShown = new Int8Array(9).fill(-1);
  let winlineEl = null;
  let focusIdx = 40;

  const svgX = '<svg viewBox="0 0 40 40" aria-hidden="true"><path pathLength="1" d="M11 11L29 29"/><path pathLength="1" d="M29 11L11 29"/></svg>';
  const svgO = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle pathLength="1" cx="20" cy="20" r="10.5" transform="rotate(-90 20 20)"/></svg>';
  const markSvg = (p) => (p === X ? svgX : svgO);

  function buildBoard() {
    const frag = document.createDocumentFragment();
    for (let b = 0; b < 9; b++) {
      const sb = document.createElement('div');
      sb.className = 'sb';
      sb.dataset.b = b;
      for (let c = 0; c < 9; c++) {
        const m = b * 9 + c;
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.m = m;
        cell.tabIndex = -1;
        sb.appendChild(cell);
        cellEls[m] = cell;
      }
      sbEls[b] = sb;
      frag.appendChild(sb);
    }
    boardEl.appendChild(frag);
  }

  function cellLabel(m, s, playable) {
    const b = (m / 9) | 0, c = m % 9;
    const v = s.cells[m];
    let t = `Bàn ${POS[b]}, ô ${POS[c]}: ${v ? MARK[v] : 'trống'}`;
    if (s.boards[b] === X || s.boards[b] === O) t += `. Bàn của ${MARK[s.boards[b]]}`;
    else if (s.boards[b] === DRAW) t += '. Bàn hòa';
    else if (!v && playable) t += '. Đánh được';
    if (m === s.last) t += '. Nước vừa đi';
    return t;
  }

  function render() {
    if (!game) return;
    const s = game.state;
    const over = !!s.winner;
    boardEl.dataset.turn = s.turn;
    boardEl.classList.toggle('free', !over && s.forced < 0);
    boardEl.classList.toggle('forced', !over && s.forced >= 0);
    boardEl.classList.toggle('locked', !humanCanPlay());
    boardEl.classList.toggle('over', over);

    for (let b = 0; b < 9; b++) {
      const sb = sbEls[b];
      const playable = Co9o.boardPlayable(s, b);
      sb.classList.toggle('playable', playable);
      sb.classList.toggle('idle', !playable && s.boards[b] === 0);
      sb.classList.toggle('closed', s.boards[b] !== 0);
      if (sbShown[b] !== s.boards[b]) {
        sbShown[b] = s.boards[b];
        const old = sb.querySelector('.sb-mark');
        if (old) old.remove();
        if (s.boards[b]) {
          const el = document.createElement('div');
          if (s.boards[b] === DRAW) {
            el.className = 'sb-mark draw-label';
            el.innerHTML = '<span>Hòa</span>';
          } else {
            el.className = 'sb-mark ' + (s.boards[b] === X ? 'x' : 'o') + (fx.closed.includes(b) ? ' new' : '');
            el.innerHTML = markSvg(s.boards[b]);
          }
          el.setAttribute('aria-hidden', 'true');
          sb.appendChild(el);
        }
      }
      for (let c = 0; c < 9; c++) {
        const m = b * 9 + c;
        const cell = cellEls[m];
        const v = s.cells[m];
        if (cellShown[m] !== v) {
          cellShown[m] = v;
          cell.classList.toggle('x', v === X);
          cell.classList.toggle('o', v === O);
          cell.innerHTML = v ? `<span class="mark${m === fx.move ? ' new' : ''}">${markSvg(v)}</span>` : '';
        }
        cell.classList.toggle('last', m === s.last);
        cell.setAttribute('aria-label', cellLabel(m, s, playable));
        cell.setAttribute('aria-disabled', !v && playable && humanCanPlay() ? 'false' : 'true');
        cell.tabIndex = m === focusIdx ? 0 : -1;
      }
    }
    renderWinLine();
    renderInfo();
    fx = { move: -1, closed: [], line: fx.line };
  }

  // Đường thắng: nối tâm 3 bàn nhỏ, kéo dài ra hai đầu
  function renderWinLine() {
    const line = Co9o.bigWinLine(game.state);
    if (!line) { if (winlineEl) { winlineEl.remove(); winlineEl = null; } return; }
    if (winlineEl) return;
    // Tâm bàn nhỏ theo tỉ lệ padding (1,3%) và khoảng cách (2,2%) của .board
    const center = (i) => [0.168, 0.5, 0.832][i] * 300;
    const p = (b) => [center(b % 3), center((b / 3) | 0)];
    const a = p(line[0]), c = p(line[2]);
    const dx = c[0] - a[0], dy = c[1] - a[1];
    const len = Math.hypot(dx, dy), ex = (dx / len) * 34, ey = (dy / len) * 34;
    const coords = `x1="${a[0] - ex}" y1="${a[1] - ey}" x2="${c[0] + ex}" y2="${c[1] + ey}"`;
    const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wrap.setAttribute('class', 'winline' + (fx.line ? '' : ' static'));
    wrap.setAttribute('viewBox', '0 0 300 300');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.setProperty('--wc', game.state.winner === X ? 'var(--x)' : 'var(--o)');
    wrap.innerHTML = `<line class="halo" pathLength="1" ${coords}/><line pathLength="1" ${coords}/>`;
    boardEl.appendChild(wrap);
    winlineEl = wrap;
  }

  function renderInfo() {
    const s = game.state;
    const ai = game.mode === 'ai';
    const lvLabel = LEVELS[game.level].label;
    const cnt = Co9o.countBoards(s);
    $('mode-label').textContent = ai ? `Đấu máy · ${lvLabel}` : 'Hai người';
    for (const p of [X, O]) {
      const k = p === X ? 'x' : 'o';
      const card = $('player-' + k);
      const isHuman = !ai || game.human === p;
      let name, sub;
      if (ai) {
        name = isHuman ? 'Bạn' : 'Máy';
        sub = isHuman ? (p === X ? 'Đi trước' : 'Đi sau') : `Mức ${lvLabel}`;
      } else {
        name = p === X ? 'Người 1' : 'Người 2';
        sub = p === X ? 'Đi trước' : 'Đi sau';
      }
      const isThinking = thinking && !isHuman && s.turn === p;
      if (isThinking) sub = 'Đang nghĩ…';
      $('name-' + k).textContent = name;
      $('sub-' + k).textContent = sub;
      $('score-' + k).textContent = p === X ? cnt.x : cnt.o;
      $('score-' + k).setAttribute('aria-label', `${p === X ? cnt.x : cnt.o} bàn nhỏ đã thắng`);
      card.classList.toggle('active', !s.winner && s.turn === p);
      card.classList.toggle('thinking', isThinking);
    }

    const turn = $('turn');
    const txt = $('turn-text');
    turn.classList.toggle('thinking', thinking);
    let color = s.turn === X ? 'var(--x)' : 'var(--o)';
    if (s.winner) {
      if (s.winner === DRAW) { color = 'var(--muted)'; txt.innerHTML = '<b>Hòa.</b> Hết nước đi mà không ai có 3 bàn thẳng hàng'; }
      else {
        color = s.winner === X ? 'var(--x)' : 'var(--o)';
        if (ai) txt.innerHTML = s.winner === game.human ? '<b>Bạn thắng!</b> 3 bàn nhỏ thẳng hàng' : '<b>Máy thắng.</b> Thử lại nhé';
        else txt.innerHTML = `<b>${MARK[s.winner]} thắng!</b> 3 bàn nhỏ thẳng hàng`;
      }
    } else if (thinking) {
      txt.innerHTML = '<span class="dots">Máy đang nghĩ</span>';
    } else {
      const who = ai ? 'Lượt của bạn' : `Lượt của <b>${MARK[s.turn]}</b>`;
      let where;
      if (s.ply === 0) where = 'đánh ô bất kỳ';
      else if (s.forced >= 0) where = `đánh vào bàn <b>${POS[s.forced]}</b>`;
      else where = 'chọn bàn bất kỳ đang sáng';
      txt.innerHTML = `${ai ? '<b>' + who + '</b>' : who} · ${where}`;
    }
    turn.style.setProperty('--turn-c', color);

    $('btn-undo').disabled = !canUndo();
    $('btn-swap').disabled = !ai;
    $('btn-swap').title = ai ? 'Đổi bên (S)' : 'Chỉ dùng khi đấu máy';
  }

  function nudgePlayable() {
    if (reduceMotion.matches) return;
    for (const sb of sbEls) {
      if (!sb.classList.contains('playable')) continue;
      sb.classList.remove('nudge');
      void sb.offsetWidth; // khởi động lại hiệu ứng
      sb.classList.add('nudge');
    }
  }

  /* ---------------- Bàn phím trên bàn cờ ---------------- */
  // Tọa độ toàn cục 9x9 <-> (bàn nhỏ, vị trí)
  const toRC = (m) => { const b = (m / 9) | 0, c = m % 9; return [((b / 3) | 0) * 3 + ((c / 3) | 0), (b % 3) * 3 + (c % 3)]; };
  const fromRC = (r, c) => (((r / 3) | 0) * 3 + ((c / 3) | 0)) * 9 + (r % 3) * 3 + (c % 3);

  function setFocus(m, focus) {
    if (cellEls[focusIdx]) cellEls[focusIdx].tabIndex = -1;
    focusIdx = m;
    cellEls[m].tabIndex = 0;
    if (focus) cellEls[m].focus();
  }

  // Sau khi máy đi: nếu đang dùng bàn phím trên bàn cờ, đưa tiêu điểm tới bàn phải đánh
  function followFocus() {
    const active = document.activeElement;
    if (!active || !active.classList.contains('cell')) return;
    const s = game.state;
    if (s.winner || s.forced < 0) return;
    if (((focusIdx / 9) | 0) === s.forced) return;
    const c = focusIdx % 9;
    let m = s.forced * 9 + c;
    if (s.cells[m]) {
      for (let k = 0; k < 9; k++) if (!s.cells[s.forced * 9 + k]) { m = s.forced * 9 + k; break; }
    }
    setFocus(m, true);
  }

  boardEl.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const m = +cell.dataset.m;
    setFocus(m, false);
    handleCell(m);
  });
  boardEl.addEventListener('keydown', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const m = +cell.dataset.m;
    let [r, c] = toRC(m);
    const k = e.key;
    if (k === 'ArrowUp') r = (r + 8) % 9;
    else if (k === 'ArrowDown') r = (r + 1) % 9;
    else if (k === 'ArrowLeft') c = (c + 8) % 9;
    else if (k === 'ArrowRight') c = (c + 1) % 9;
    else if (k === 'Home') { r = 0; c = 0; }
    else if (k === 'End') { r = 8; c = 8; }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); handleCell(m); return; }
    else return;
    e.preventDefault();
    setFocus(fromRC(r, c), true);
  });

  /* ---------------- Thông báo nhanh ---------------- */
  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2000);
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
    if (k === 'z' || k === 'u') { e.preventDefault(); undo(); }
    else if (k === 's') { e.preventDefault(); swapSides(); }
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
  const draft = { mode: 'ai', level: 'medium', side: X };
  const fieldGroup = (name) => document.querySelector(`#modal-new [data-field="${name}"]`);

  function syncNewModal() {
    setSegmented(fieldGroup('mode'), draft.mode);
    setSegmented(fieldGroup('level'), draft.level);
    setSegmented(fieldGroup('side'), draft.side);
    for (const el of document.querySelectorAll('#modal-new [data-ai-only]')) el.hidden = draft.mode !== 'ai';
    for (const el of document.querySelectorAll('#modal-new [data-pvp-only]')) el.hidden = draft.mode !== 'pvp';
    $('level-desc').textContent = LEVEL_DESC[draft.level];
  }
  function openNewGame() {
    draft.mode = game ? game.mode : settings.mode;
    draft.level = game ? game.level : settings.level;
    draft.side = game ? game.human : settings.side;
    $('new-warning').hidden = !(game && game.moves.length > 0 && !game.state.winner);
    syncNewModal();
    closeModal('modal-result');
    openModal('modal-new');
  }
  bindSegmented(fieldGroup('mode'), (v) => { draft.mode = v; syncNewModal(); });
  bindSegmented(fieldGroup('level'), (v) => { draft.level = v; syncNewModal(); });
  bindSegmented(fieldGroup('side'), (v) => { draft.side = +v; syncNewModal(); });
  $('btn-start').addEventListener('click', () => {
    settings.mode = draft.mode;
    settings.level = draft.level;
    settings.side = draft.side;
    saveSettings();
    closeModal('modal-new');
    startGame({ mode: draft.mode, level: draft.level, human: draft.side });
  });

  /* ---------------- Kết quả ---------------- */
  function showResult() {
    if (!game || !game.state.winner) return;
    const w = game.state.winner;
    const ai = game.mode === 'ai';
    const lv = LEVELS[game.level].label;
    const markEl = $('result-mark');
    let title, sub, celebrate = false;
    if (w === DRAW) {
      title = 'Hòa';
      sub = 'Hết nước đi mà không ai chiếm được 3 bàn nhỏ thẳng hàng.';
      markEl.className = 'result-mark';
      markEl.innerHTML = '<svg viewBox="0 0 40 40"><path class="draw-eq" d="M11 16H29M11 24H29"/></svg>';
    } else {
      markEl.className = 'result-mark ' + (w === X ? 'x' : 'o');
      markEl.innerHTML = markSvg(w);
      if (ai) {
        const youWin = w === game.human;
        title = youWin ? 'Bạn thắng!' : 'Máy thắng';
        sub = youWin ? `Bạn chiếm 3 bàn nhỏ thẳng hàng trước máy mức ${lv}.` : 'Máy chiếm 3 bàn nhỏ thẳng hàng. Thử lại nhé!';
        celebrate = youWin;
      } else {
        title = `${MARK[w]} thắng!`;
        sub = `${w === X ? 'Người 1' : 'Người 2'} chiếm 3 bàn nhỏ thẳng hàng.`;
        celebrate = true;
      }
    }
    $('result-title').textContent = title;
    $('result-sub').textContent = sub;
    if (ai) {
      const st = stats.levels[game.level];
      $('result-line').textContent = `Mức ${lv}: thắng ${st.won} · thua ${st.lost} · hòa ${st.drawn}` + (stats.streak > 1 ? ` · chuỗi ${stats.streak} ván thắng` : '');
    } else {
      $('result-line').textContent = `Hai người: X thắng ${stats.pvp.x} · O thắng ${stats.pvp.o} · hòa ${stats.pvp.drawn}`;
    }
    $('btn-result-swap').hidden = !ai;
    document.querySelector('#modal-result .modal-actions').classList.toggle('three', ai);
    $('btn-result-new').textContent = ai ? 'Chơi tiếp' : 'Ván mới';
    const conf = $('confetti');
    conf.innerHTML = '';
    if (celebrate && !reduceMotion.matches) {
      const colors = ['var(--x)', 'var(--o)', 'var(--accent)', 'var(--text)'];
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
  $('btn-result-swap').addEventListener('click', () => { closeModal('modal-result'); swapSides(); });

  /* ---------------- Thống kê ---------------- */
  function renderStats() {
    const ai = aiTotals();
    $('stats-won').textContent = ai.won;
    $('stats-streak').textContent = stats.streak;
    $('stats-best').textContent = stats.best;
    $('stats-body').innerHTML = LEVEL_ORDER.map((k) => {
      const r = stats.levels[k];
      return `<tr><td>${LEVELS[k].label}</td><td>${r.played}</td><td>${r.won}</td><td>${r.lost}</td><td>${r.drawn}</td></tr>`;
    }).join('');
    const p = stats.pvp;
    $('stats-pvp').textContent = p.played ? `${p.played} ván · X thắng ${p.x} · O thắng ${p.o} · hòa ${p.drawn}` : 'Chưa có ván nào.';
    resetConfirm(false);
  }
  let resetTimer = 0;
  function resetConfirm(on) {
    const btn = $('btn-stats-reset');
    btn.classList.toggle('confirm', on);
    btn.textContent = on ? 'Bấm lần nữa để xóa' : 'Đặt lại';
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
    toast('Đã đặt lại thống kê');
  });

  /* ---------------- Cài đặt + giao diện ---------------- */
  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'light' || settings.theme === 'dark') root.setAttribute('data-theme', settings.theme);
    else root.removeAttribute('data-theme');
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (bg) $('theme-color').setAttribute('content', bg);
  }
  const themeGroup = document.querySelector('#modal-settings [data-setting="theme"]');
  bindSegmented(themeGroup, (v) => { settings.theme = v; saveSettings(); applyTheme(); });
  $('btn-settings').addEventListener('click', () => { setSegmented(themeGroup, settings.theme); openModal('modal-settings'); });
  $('btn-settings-help').addEventListener('click', () => { closeModal('modal-settings'); openHelp(); });
  if (window.matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme();
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* ---------------- Cách chơi (có hình minh họa) ---------------- */
  let figId = 0;
  // Vẽ bàn cờ thu nhỏ bằng SVG. cfg: { alt, cells: {m: X|O}, won: {b: X|O}, drawn: [b],
  //   glow: [b], glowColor: 'x'|'o'|'', dim: bool, hl: m, arrow: { from: m, to: b, cross }, line: [a, c] }
  function figure(cfg) {
    const uid = ++figId;
    const sbX = (b) => 3 + (b % 3) * 38.5;
    const sbY = (b) => 3 + ((b / 3) | 0) * 38.5;
    const cX = (m) => sbX((m / 9) | 0) + 2.2 + (m % 3) * 10.8;
    const cY = (m) => sbY((m / 9) | 0) + 2.2 + (((m % 9) / 3) | 0) * 10.8;
    const cells = cfg.cells || {};
    const won = cfg.won || {};
    const drawn = cfg.drawn || [];
    const glow = cfg.glow || [];
    let s = `<svg viewBox="0 0 119 119" role="img" aria-label="${cfg.alt}">`;
    s += `<defs><marker id="ah${uid}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto"><path class="d-arrow-head" d="M0 0L10 5L0 10z"/></marker></defs>`;
    s += '<rect class="d-board" x="0.5" y="0.5" width="118" height="118" rx="7"/>';
    for (let b = 0; b < 9; b++) {
      const closed = !!won[b] || drawn.includes(b);
      let cls = 'd-sb';
      if (glow.includes(b)) cls += ' glow' + (cfg.glowColor ? '-' + cfg.glowColor : '');
      else if (cfg.dim && !closed) cls += ' dim';
      s += `<rect class="${cls}" x="${sbX(b)}" y="${sbY(b)}" width="36" height="36" rx="4"/>`;
      for (let c = 0; c < 9; c++) {
        const m = b * 9 + c;
        const x = cX(m), y = cY(m);
        s += `<rect class="d-cell${closed ? ' closed' : ''}${cfg.hl === m ? ' hl' : ''}${cfg.dim && !glow.includes(b) && !closed && cfg.hl !== m ? ' d-faded' : ''}" x="${x}" y="${y}" width="10" height="10" rx="1.8"/>`;
        const v = cells[m];
        const fade = closed ? ' d-faded' : '';
        if (v === X) s += `<path class="d-x${fade}" stroke-width="1.8" d="M${x + 2.7} ${y + 2.7}L${x + 7.3} ${y + 7.3}M${x + 7.3} ${y + 2.7}L${x + 2.7} ${y + 7.3}"/>`;
        else if (v === O) s += `<circle class="d-o${fade}" stroke-width="1.7" cx="${x + 5}" cy="${y + 5}" r="2.6"/>`;
      }
      const cx = sbX(b) + 18, cy = sbY(b) + 18;
      if (won[b] === X) s += `<path class="d-x" stroke-width="4.4" d="M${cx - 10} ${cy - 10}L${cx + 10} ${cy + 10}M${cx + 10} ${cy - 10}L${cx - 10} ${cy + 10}"/>`;
      else if (won[b] === O) s += `<circle class="d-o" stroke-width="4.2" cx="${cx}" cy="${cy}" r="10.5"/>`;
      else if (drawn.includes(b)) s += `<rect x="${cx - 11}" y="${cy - 5}" width="22" height="10" rx="5" class="d-board"/><text class="d-label" x="${cx}" y="${cy + 2.1}">HÒA</text>`;
    }
    if (cfg.line) {
      const p = (b) => [sbX(b) + 18, sbY(b) + 18];
      const a = p(cfg.line[0]), c = p(cfg.line[1]);
      const dx = c[0] - a[0], dy = c[1] - a[1], len = Math.hypot(dx, dy);
      const ex = (dx / len) * 12, ey = (dy / len) * 12;
      s += `<line class="d-line ${cfg.lineColor === X ? 'd-x' : 'd-o'}" x1="${a[0] - ex}" y1="${a[1] - ey}" x2="${c[0] + ex}" y2="${c[1] + ey}"/>`;
    }
    if (cfg.arrow) {
      const fx0 = cX(cfg.arrow.from) + 5, fy0 = cY(cfg.arrow.from) + 5;
      const tx = sbX(cfg.arrow.to) + 18, ty = sbY(cfg.arrow.to) + 18;
      const dx = tx - fx0, dy = ty - fy0, len = Math.hypot(dx, dy);
      const sx = fx0 + (dx / len) * 5, sy = fy0 + (dy / len) * 5;
      const ex = tx - (dx / len) * 9, ey = ty - (dy / len) * 9;
      // Uốn cong nhẹ cho dễ nhìn
      const mx = (sx + ex) / 2 - (dy / len) * 8, my = (sy + ey) / 2 + (dx / len) * 8;
      s += `<path class="d-arrow" d="M${sx} ${sy}Q${mx} ${my} ${ex} ${ey}" marker-end="url(#ah${uid})"/>`;
    }
    return s + '</svg>';
  }

  const M = (b, c) => b * 9 + c;
  const HELP = [
    {
      title: '9 bàn ca-rô trong một bàn lớn',
      text: 'Bàn lớn gồm <b>9 bàn nhỏ</b>, mỗi bàn là một lưới 3×3. Hai bên lần lượt đánh X và O vào các ô. <b>X đi trước</b> và được đánh ở bất kỳ ô nào.',
      fig: { alt: 'Bàn lớn gồm 9 bàn nhỏ, tất cả đang sáng vì X được đánh bất kỳ đâu', glow: [0, 1, 2, 3, 4, 5, 6, 7, 8], glowColor: 'x' },
    },
    {
      title: 'Ô bạn đánh chỉ đường cho đối thủ',
      text: 'X đánh vào ô <b>trên phải</b> của bàn giữa, nên O <b>bắt buộc</b> đánh tiếp trong bàn <b>trên phải</b> của bàn lớn. Bàn phải đánh luôn được làm sáng.',
      fig: { alt: 'X đánh ô trên phải của bàn giữa, mũi tên chỉ sang bàn trên phải đang sáng', cells: { [M(4, 2)]: X }, hl: M(4, 2), glow: [2], glowColor: 'o', dim: true, arrow: { from: M(4, 2), to: 2 } },
    },
    {
      title: 'Thắng bàn nhỏ để chiếm bàn đó',
      text: 'Có <b>3 quân thẳng hàng</b> trong một bàn nhỏ là chiếm được bàn đó, bàn hiện dấu lớn của bạn. Bàn đầy mà không ai thắng là <b>bàn hòa</b>, không tính cho ai.',
      fig: {
        alt: 'Bàn trên trái thuộc về X, bàn dưới phải hòa',
        cells: { [M(0, 0)]: X, [M(0, 4)]: X, [M(0, 8)]: X, [M(0, 1)]: O, [M(0, 3)]: O, [M(8, 0)]: X, [M(8, 1)]: O, [M(8, 2)]: X, [M(8, 3)]: X, [M(8, 4)]: O, [M(8, 5)]: O, [M(8, 6)]: O, [M(8, 7)]: X, [M(8, 8)]: X, [M(4, 4)]: O, [M(2, 6)]: X, [M(6, 2)]: O },
        won: { 0: X }, drawn: [8],
      },
    },
    {
      title: 'Bị gửi tới bàn đã xong? Chọn tự do',
      text: 'Nếu bàn bạn bị gửi tới <b>đã có người thắng hoặc đã đầy</b>, bạn được đánh vào <b>bất kỳ bàn nào còn mở</b>. Các bàn đó cùng sáng lên.',
      fig: {
        alt: 'O đánh ô trên trái, gửi X tới bàn trên trái đã xong nên X được chọn mọi bàn còn mở',
        cells: { [M(0, 0)]: X, [M(0, 4)]: X, [M(0, 8)]: X, [M(0, 1)]: O, [M(0, 3)]: O, [M(5, 0)]: O, [M(4, 5)]: X, [M(7, 4)]: O },
        won: { 0: X }, hl: M(5, 0), glow: [1, 2, 3, 4, 5, 6, 7, 8], glowColor: 'x', arrow: { from: M(5, 0), to: 0 },
      },
    },
    {
      title: 'Chiếm 3 bàn thẳng hàng để thắng',
      text: 'Ai chiếm được <b>3 bàn nhỏ thẳng hàng</b> (ngang, dọc hoặc chéo) trên bàn lớn thì thắng. Hết nước đi mà không ai làm được thì <b>hòa</b>.<br><b>Mẹo:</b> trước khi đánh, hãy xem ô đó sẽ gửi đối thủ tới bàn nào.',
      fig: { alt: 'O chiếm ba bàn chéo từ trên phải xuống dưới trái và thắng', won: { 2: O, 4: O, 6: O, 0: X, 7: X }, line: [2, 6], lineColor: O },
    },
  ];
  let helpIdx = 0;

  function showHelp(i) {
    helpIdx = Math.max(0, Math.min(HELP.length - 1, i));
    const h = HELP[helpIdx];
    $('help-body').innerHTML =
      `<div class="help-figure">${figure(h.fig)}</div>` +
      `<p class="help-step">Bước ${helpIdx + 1}/${HELP.length}</p>` +
      `<h3>${h.title}</h3><p>${h.text}</p>`;
    const dots = $('help-dots');
    if (!dots.children.length) {
      HELP.forEach((_, k) => {
        const d = document.createElement('button');
        d.type = 'button';
        d.setAttribute('role', 'tab');
        d.setAttribute('aria-label', `Bước ${k + 1}`);
        d.addEventListener('click', () => showHelp(k));
        dots.appendChild(d);
      });
    }
    [...dots.children].forEach((d, k) => {
      d.setAttribute('aria-selected', k === helpIdx ? 'true' : 'false');
      d.tabIndex = k === helpIdx ? 0 : -1;
    });
    $('btn-help-prev').disabled = helpIdx === 0;
    $('btn-help-next').textContent = helpIdx === HELP.length - 1 ? 'Chơi thôi!' : 'Tiếp';
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
  $('btn-swap').addEventListener('click', swapSides);
  $('btn-new').addEventListener('click', openNewGame);

  /* ================= Khởi động ================= */
  $('app-version').textContent = APP_VERSION;
  applyTheme();
  buildBoard();
  AI.start();
  const saved = loadGame();
  if (saved) {
    game = saved;
    fx = { move: -1, closed: [], line: false };
    render();
    writeSummary();
    scheduleAi();
  } else {
    startGame({ mode: settings.mode, level: settings.level, human: settings.side });
  }
  // Lần đầu vào game: tự mở hướng dẫn (đánh dấu đã xem ngay để chỉ hiện một lần)
  if (!settings.guideSeen) {
    settings.guideSeen = true;
    saveSettings();
    openHelp();
  }
})();
