/* =====================================================================
 * Cờ Vua - Game (chỉ chạy trong trình duyệt, cần i18n.js và engine.js nạp trước)
 *   1. Lưu trữ: cài đặt, thống kê, ván đang chơi, tóm tắt cho cổng PlayNine
 *   2. Máy nghĩ trong Web Worker (tạo từ Blob mã nguồn engine)
 *   3. Điều khiển ván: chọn quân, đi quân, phong cấp, máy đi, đi lại, ván mới
 *   4. Hiệu ứng: quân trượt tới ô mới, máy cho thấy nước định đi trước khi đi
 *   5. Render bàn, người chơi, biên bản, modal, hướng dẫn có hình minh họa
 * ===================================================================== */
(() => {
  'use strict';
  const PN = window.PlayNine || null; // SDK PlayNine: chỉ có khi chạy trong cổng
  PN && PN.init({ gameId: 'covua' });
  // Âm thanh dùng chung của SDK (bản SDK cũ chưa có sfx thì game vẫn chạy, chỉ im lặng)
  const SFX = PN && PN.sfx && typeof PN.sfx.play === 'function' ? PN.sfx : null;
  const sfx = (name, o) => { try { SFX && SFX.play(name, o); } catch (e) { /* bỏ qua */ } };

  // Phiên bản app: tăng khi phát hành, đồng bộ với ?v= ở index.html
  const APP_VERSION = '1.3.0';
  const KEYS = {
    settings: 'playnine-covua-settings-v1',
    save: 'playnine-covua-save-v1',
    stats: 'playnine-covua-stats-v1',
    summary: 'playnine-covua-summary-v1',
  };
  const E = CoVua;
  // Chữ hiển thị lấy từ i18n.js theo ngôn ngữ đang chọn (đổi ngôn ngữ thì tải lại trang)
  const tr = I18N.t;
  const LEVELS = E.LEVELS;
  const LEVEL_ORDER = ['easy', 'medium', 'hard'];
  const LEVEL_LABEL = { easy: tr('level.easy'), medium: tr('level.medium'), hard: tr('level.hard') };
  const LEVEL_DESC = {
    easy: tr('levelDesc.easy'),
    medium: tr('levelDesc.medium'),
    hard: tr('levelDesc.hard'),
  };
  const WHITE = E.WHITE, BLACK = E.BLACK;
  // Thời gian quân trượt tới ô mới (ms)
  const SPEED = { slow: 380, medium: 220, fast: 120, off: 0 };
  const MIN_THINK_MS = 450; // máy luôn "nghĩ" tối thiểu chừng này
  const AFTER_ANIM_MS = 150; // nghỉ một nhịp sau khi quân dừng rồi máy mới đi
  const PIECE_ID = ' pnbrqk'; // id symbol trong index.html: #pc-p ... #pc-k
  const PIECE_NAME = ['', 1, 2, 3, 4, 5, 6].map((k) => (k ? tr('piece.' + k) : ''));
  const PIECE_LC = ['', 1, 2, 3, 4, 5, 6].map((k) => (k ? tr('piecel.' + k) : '')); // tên quân giữa câu
  const COLOR_NAME = [tr('color.0'), tr('color.1')];
  const COLOR_LC = [tr('colorl.0'), tr('colorl.1')];
  const REASON_TEXT = {
    checkmate: tr('reason.checkmate'),
    stalemate: tr('reason.stalemate'),
    threefold: tr('reason.threefold'),
    fifty: tr('reason.fifty'),
    material: tr('reason.material'),
  };

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const pieceSvg = (type) => `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><use href="#pc-${PIECE_ID[type]}"/></svg>`;
  const sideCls = (color) => (color === WHITE ? 'w' : 'b');

  /* ================= 1. Lưu trữ ================= */
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  const DEFAULT_SETTINGS = { theme: 'auto', speed: 'medium', hints: true, autoFlip: false, mode: 'ai', level: 'medium', color: 'white', guideSeen: false };
  let settings = loadSettings();

  function loadSettings() {
    const s = { ...DEFAULT_SETTINGS };
    const raw = readJSON(KEYS.settings) || {};
    if (['auto', 'light', 'dark'].includes(raw.theme)) s.theme = raw.theme;
    if (SPEED[raw.speed] != null) s.speed = raw.speed;
    if (typeof raw.hints === 'boolean') s.hints = raw.hints;
    if (typeof raw.autoFlip === 'boolean') s.autoFlip = raw.autoFlip;
    if (raw.mode === 'ai' || raw.mode === 'pvp') s.mode = raw.mode;
    if (LEVELS[raw.level]) s.level = raw.level;
    if (['white', 'black', 'random'].includes(raw.color)) s.color = raw.color;
    s.guideSeen = raw.guideSeen === true;
    return s;
  }
  function saveSettings() { writeJSON(KEYS.settings, settings); }

  function emptyStats() {
    const levels = {};
    for (const lv of LEVEL_ORDER) levels[lv] = { played: 0, won: 0, lost: 0, drawn: 0 };
    return { levels, pvp: { played: 0, white: 0, black: 0, drawn: 0 }, streak: 0, best: 0 };
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
    if (raw.pvp) for (const k of ['played', 'white', 'black', 'drawn']) st.pvp[k] = toInt(raw.pvp[k]);
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
  // Worker được dựng từ chính mã nguồn hàm CoVuaFactory (qua Blob) nên chạy được
  // cả khi mở trang bằng file://. Không tạo được worker thì tính trên luồng chính.
  const AI = {
    worker: null,
    nextId: 0,
    pending: null, // { id, cb, moves, level }
    source() {
      return 'var CoVua = (' + E.factory.toString() + ')();\n' +
        'self.onmessage = function (e) {\n' +
        '  var d = e.data;\n' +
        '  var r = CoVua.chooseMove(CoVua.fromMoves(d.moves), { level: d.level });\n' +
        '  self.postMessage({ id: d.id, res: { uci: r.uci, depth: r.depth, reason: r.reason } });\n' +
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
        const r = E.chooseMove(E.fromMoves(moves), { level });
        cb({ uci: r.uci, depth: r.depth, reason: r.reason });
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
  // game: { mode: 'ai'|'pvp', level, human: 0|1 (màu bạn cầm khi đấu máy), flip, moves: [uci], recorded, state, legal }
  let game = null;
  let thinking = false;
  let aiToken = 0;
  let aiResult = null;
  let aiPreview = null; // { m, from, to, san }: nước máy vừa chọn, đang cho người chơi thấy
  let selected = -1;    // ô của quân đang cầm
  let resultTimer = 0;
  let animEndAt = 0;
  let bottom = WHITE;   // màu quân đang ở phía dưới bàn

  const isAiTurn = () => game && game.mode === 'ai' && !game.state.over && game.state.turn !== game.human;
  const humanCanPlay = () => game && !game.state.over && !thinking && !anim.busy && !aiPreview && (game.mode === 'pvp' || game.state.turn === game.human);
  const playerName = (c) => (game && game.mode === 'ai' ? (c === game.human ? tr('who.you') : tr('who.ai')) : COLOR_NAME[c]);
  const movesFrom = (sq) => game.legal.filter((m) => E.fromOf(m) === sq);
  // Màu nhận diện: đấu máy thì bạn vàng, máy đỏ; hai người thì Trắng vàng, Đen đỏ
  const toneOf = (c) => (game && game.mode === 'ai' ? (c === game.human ? 0 : 1) : c);

  // Màu ở phía dưới bàn: đấu máy thì là màu của bạn; hai người thì Trắng, hoặc bên
  // đang đi nếu bật "Xoay bàn theo lượt"; nút Xoay bàn đảo lại
  function wantBottom() {
    if (!game) return WHITE;
    const base = game.mode === 'ai' ? game.human : settings.autoFlip ? game.state.turn : WHITE;
    return game.flip ? base ^ 1 : base;
  }

  function saveGame() {
    if (!game) return;
    writeJSON(KEYS.save, { v: 1, mode: game.mode, level: game.level, human: game.human, flip: game.flip, moves: game.moves, recorded: game.recorded, usedUndo: !!game.usedUndo });
  }

  function loadGame() {
    const raw = readJSON(KEYS.save);
    if (!raw || raw.v !== 1 || !Array.isArray(raw.moves)) return null;
    try {
      const g = {
        mode: raw.mode === 'pvp' ? 'pvp' : 'ai',
        level: LEVELS[raw.level] ? raw.level : 'medium',
        human: raw.human === BLACK ? BLACK : WHITE,
        flip: raw.flip === true,
        moves: raw.moves.filter((u) => typeof u === 'string'),
        recorded: raw.recorded === true,
        usedUndo: raw.usedUndo === true,
      };
      rebuild(g);
      if (g.state.over) g.recorded = true;
      return g;
    } catch (e) { return null; } // ván lưu bị hỏng: bỏ qua
  }

  // Dựng lại trạng thái từ danh sách nước (khôi phục, Đi lại)
  function rebuild(g) {
    g.state = E.fromMoves(g.moves);
    g.legal = E.legalMoves(g.state);
  }

  function startGame(cfg) {
    cancelAi();
    cancelAnim();
    clearTimeout(resultTimer);
    closeModal('modal-result');
    const human = cfg.color === 'random' ? (Math.random() < 0.5 ? WHITE : BLACK) : cfg.color === 'black' ? BLACK : WHITE;
    game = { mode: cfg.mode, level: cfg.level, human: cfg.mode === 'ai' ? human : WHITE, flip: false, moves: [], recorded: false };
    rebuild(game);
    selected = -1;
    saveGame();
    updateOrientation();
    render();
    renderLog();
    writeSummary();
    sfx('start');
    if (cfg.mode === 'ai' && cfg.color === 'random') toast(human === WHITE ? tr('toast.randomWhite') : tr('toast.randomBlack'));
    PN && game.mode === 'ai' && PN.gameStart({ mode: game.level });
    scheduleAi();
  }

  function newGameSame() {
    startGame({ mode: game.mode, level: game.level, color: game.mode === 'ai' ? (game.human === WHITE ? 'white' : 'black') : 'white' });
  }

  // Đi một nước (người hoặc máy): cập nhật ván ngay, hiệu ứng chạy sau
  function commitMove(m, instant) {
    const rec = E.play(game.state, m);
    moveSound(rec);
    game.moves.push(rec.uci);
    game.legal = E.legalMoves(game.state);
    selected = -1;
    if (game.state.over) recordResult();
    saveGame();
    writeSummary();
    animateMove(rec, instant);
    renderLog();
    // Máy bắt đầu nghĩ ngay trong lúc quân đang trượt
    scheduleAi();
  }

  // Tiếng nước đi: phong cấp / nhập thành / ăn quân / đi thường; máy đi nhỏ tiếng hơn; chiếu thì thêm tiếng báo
  function moveSound(rec) {
    const o = { volume: game.mode === 'ai' && rec.color !== game.human ? 0.7 : 1 };
    if (rec.promo) sfx('levelup', o);
    else if (rec.flags & E.F_CASTLE) sfx('coin', o);
    else if (rec.captured) sfx('capture', o);
    else sfx('move', o);
    if (rec.check && !rec.mate) setTimeout(() => sfx('error', { pitch: 1.8, volume: 0.6 }), 120);
  }

  // Đi từ ô from tới ô to. Có nhiều nước (phong cấp) thì hỏi chọn quân.
  function tryMove(from, to, instant) {
    const cands = game.legal.filter((m) => E.fromOf(m) === from && E.toOf(m) === to);
    if (!cands.length) return false;
    if (cands.length > 1) { openPromo(cands, instant); return true; }
    commitMove(cands[0], instant);
    return true;
  }

  function handleSquare(sq) {
    if (!game) return;
    const s = game.state;
    if (s.over) { toast(tr('toast.over')); return; }
    if (thinking || aiPreview) { toast(tr('toast.thinking')); return; }
    if (!humanCanPlay()) return;
    if (selected >= 0 && movesFrom(selected).some((m) => E.toOf(m) === sq)) { tryMove(selected, sq, false); return; }
    const p = s.b[sq];
    if (p && E.colorOf(p) === s.turn) {
      if (selected === sq) { selected = -1; render(); return; }
      if (!movesFrom(sq).length) {
        selected = -1;
        render();
        sfx('error');
        toast(tr(s.check ? 'toast.checkStuck' : 'toast.noMoves', { piece: PIECE_LC[E.typeOf(p)] }));
        return;
      }
      selected = sq;
      render();
      sfx('tap');
      return;
    }
    if (p && selected < 0) {
      sfx('error');
      toast(game.mode === 'ai' ? tr('toast.aiPiece') : tr('toast.turnOf', { color: COLOR_NAME[s.turn] }));
      return;
    }
    if (selected >= 0) { selected = -1; render(); sfx('error'); }
  }

  function scheduleAi() {
    if (!isAiTurn() || thinking) return;
    thinking = true;
    aiResult = null;
    const token = ++aiToken;
    const t0 = Date.now();
    renderInfo();
    AI.think(game.moves.slice(), game.level, (res) => {
      if (token !== aiToken) return;
      aiResult = { uci: res && res.uci, t0, token };
      maybePlayAi();
    });
  }

  // Máy đã có nước: chờ hiệu ứng xong + thời gian nghĩ tối thiểu rồi mới đi
  function maybePlayAi() {
    if (!aiResult || anim.busy) return;
    const r = aiResult;
    const fast = reduceMotion.matches || settings.speed === 'off';
    const wait = Math.max(0,
      (fast ? 150 : MIN_THINK_MS) - (Date.now() - r.t0),
      (fast ? 80 : AFTER_ANIM_MS) - (Date.now() - animEndAt));
    setTimeout(() => {
      if (r.token !== aiToken || anim.busy || aiResult !== r) return;
      aiResult = null;
      thinking = false;
      let m = E.parseUci(game.state, r.uci, game.legal);
      if (!m) m = game.legal[(Math.random() * game.legal.length) | 0]; // phòng hờ: không bao giờ để máy đi sai luật
      previewAi(m);
    }, wait);
  }

  // Cho người chơi thấy máy định đi quân nào tới đâu trước khi quân chạy
  function previewAi(m) {
    const token = aiToken;
    aiPreview = { m, from: E.fromOf(m), to: E.toOf(m), san: E.san(game.state, m, game.legal) };
    render();
    const ms = settings.speed === 'off' ? 120 : reduceMotion.matches ? 350 : Math.max(420, SPEED[settings.speed] * 2.4);
    setTimeout(() => {
      if (token !== aiToken) return;
      aiPreview = null;
      commitMove(m, false);
    }, ms);
  }

  function cancelAi() {
    aiToken++;
    aiResult = null;
    aiPreview = null;
    if (thinking) { thinking = false; AI.cancel(); }
  }

  function humanMoveCount() {
    let n = 0;
    for (let i = 0; i < game.moves.length; i++) if (i % 2 === game.human) n++;
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
    cancelAnim();
    closeModal('modal-promo');
    do {
      game.moves.pop();
    } while (game.mode === 'ai' && game.moves.length > 0 && game.moves.length % 2 !== game.human);
    rebuild(game);
    selected = -1;
    saveGame();
    updateOrientation();
    render();
    renderLog();
    writeSummary();
    sfx('tap');
    toast(tr('toast.undone'));
    scheduleAi();
  }

  function flipBoard() {
    if (!game) return;
    game.flip = !game.flip;
    saveGame();
    updateOrientation();
    render();
  }

  function recordResult() {
    if (game.recorded) return;
    game.recorded = true;
    const w = game.state.winner;
    if (game.mode === 'ai') {
      const lv = stats.levels[game.level];
      lv.played++;
      PN && PN.gameEnd({ mode: game.level, won: w === game.human, assisted: !!game.usedUndo });
      if (w === game.human) { lv.won++; stats.streak++; stats.best = Math.max(stats.best, stats.streak); }
      else if (w === E.DRAW) { lv.drawn++; stats.streak = 0; }
      else { lv.lost++; stats.streak = 0; }
    } else {
      stats.pvp.played++;
      if (w === WHITE) stats.pvp.white++;
      else if (w === BLACK) stats.pvp.black++;
      else stats.pvp.drawn++;
    }
    saveStats();
  }

  function onAnimDone() {
    animEndAt = Date.now();
    if (game.mode === 'pvp' && settings.autoFlip) updateOrientation();
    render();
    if (game.state.over) {
      clearTimeout(resultTimer);
      resultTimer = setTimeout(showResult, reduceMotion.matches || settings.speed === 'off' ? 300 : 900);
    } else {
      maybePlayAi();
    }
  }

  /* ---------------- Tóm tắt cho cổng PlayNine ---------------- */
  function writeSummary() {
    const ai = aiTotals();
    const played = ai.played + stats.pvp.played;
    const level = game && game.mode === 'ai' ? game.level : settings.level;
    const lvLabel = LEVEL_LABEL[level];
    let note;
    if (ai.played) note = tr('sum.noteAi', { won: ai.won, n: ai.played, level: lvLabel });
    else if (stats.pvp.played) note = tr('sum.notePvp', { n: stats.pvp.played });
    else note = tr('sum.noteNone');
    const list = [];
    if (played) {
      list.push({ value: String(ai.won), label: tr('sum.won') });
      list.push({ value: String(played), label: tr('sum.played') });
      if (stats.best) list.push({ value: String(stats.best), label: tr('sum.best') });
    }
    let resume = null;
    if (game && game.moves.length > 0 && !game.state.over) {
      const s = game.state;
      const isAi = game.mode === 'ai';
      const turnText = isAi ? (s.turn === game.human ? tr('sum.turnYou') : tr('sum.turnAi')) : tr('sum.turnOf', { color: COLOR_NAME[s.turn] });
      const mat = E.material(s);
      const lead = mat ? tr('sum.lead', { who: playerName(mat > 0 ? WHITE : BLACK), n: Math.abs(mat) }) : '';
      resume = {
        title: isAi ? tr('sum.titleAi', { level: LEVEL_LABEL[game.level] }) : tr('sum.titlePvp'),
        detail: tr('sum.move', { n: s.full }) + (isAi ? tr('sum.youPlay', { color: COLOR_NAME[game.human] }) : '') + lead + ` · ${turnText}`,
        pct: null,
      };
    }
    writeJSON(KEYS.summary, { v: 1, updatedAt: Date.now(), played, won: ai.won, note, stats: list, resume, daily: null });
  }

  /* ================= 4. Hiệu ứng ================= */
  const anim = { busy: false, token: 0, timer: 0 };
  const moveMs = () => (reduceMotion.matches ? 0 : SPEED[settings.speed]);

  // Cho quân trượt tới ô mới. Quân bị ăn mờ dần, xe nhập thành chạy cùng lúc.
  // Kéo thả thì quân đã ở sẵn ô đích: chỉ cần khớp vào giữa ô thật nhanh.
  function animateMove(rec, instant) {
    const token = ++anim.token;
    const ms = instant ? Math.min(moveMs(), 90) : moveMs();
    anim.busy = true;
    boardEl.style.setProperty('--move-ms', ms + 'ms');
    const capSq = rec.flags & E.F_EP ? rec.to + (rec.color === WHITE ? -16 : 16) : rec.to;
    const victim = rec.captured ? pieceAt.get(capSq) : null;
    if (victim) {
      pieceAt.delete(capSq);
      victim.classList.add('gone');
      setTimeout(() => victim.remove(), ms + 40);
    }
    slide(rec.from, rec.to);
    if (rec.flags & E.F_CASTLE) {
      const kside = rec.to > rec.from;
      slide(kside ? rec.from + 3 : rec.from - 4, kside ? rec.from + 1 : rec.from - 1);
    }
    render();
    clearTimeout(anim.timer);
    anim.timer = setTimeout(() => {
      if (token !== anim.token) return;
      anim.busy = false;
      syncPieces();
      land(pieceAt.get(rec.to));
      onAnimDone();
    }, ms + 30);
  }
  // Quân vừa tới ô mới nảy nhẹ một nhịp
  function land(el) {
    if (!el || reduceMotion.matches || settings.speed === 'off') return;
    el.classList.remove('land');
    void el.offsetWidth;
    el.classList.add('land');
  }
  function slide(from, to) {
    const el = pieceAt.get(from);
    if (!el) return;
    el.classList.remove('dragging');
    el.style.transform = '';
    pieceAt.delete(from);
    pieceAt.set(to, el);
    place(el, to);
  }
  function cancelAnim() {
    anim.token++;
    clearTimeout(anim.timer);
    anim.busy = false;
    endDrag();
  }

  /* ================= 5. Render ================= */
  const boardEl = $('board');
  const sqEls = new Map();   // ô (0x88) -> nút ô
  const pieceAt = new Map(); // ô (0x88) -> phần tử quân
  let piecesEl = null;
  let focusSq = E.sqOf(4, 1); // ô nhận tiêu điểm bàn phím (mặc định e2)

  // Tọa độ hiển thị (cột x, hàng y tính từ trên xuống) của ô theo hướng bàn
  function viewXY(sq) {
    const f = E.fileOf(sq), r = E.rankOf(sq);
    return bottom === WHITE ? [f, 7 - r] : [7 - f, r];
  }
  function sqAtView(x, y) {
    return bottom === WHITE ? E.sqOf(x, 7 - y) : E.sqOf(7 - x, y);
  }

  function buildBoard() {
    const frag = document.createDocumentFragment();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = E.sqOf(f, r);
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'sq' + ((f + r) % 2 === 0 ? ' dark' : '');
        el.dataset.sq = sq;
        el.tabIndex = -1;
        sqEls.set(sq, el);
        frag.appendChild(el);
      }
    }
    piecesEl = document.createElement('div');
    piecesEl.className = 'pieces';
    piecesEl.setAttribute('aria-hidden', 'true');
    frag.appendChild(piecesEl);
    boardEl.appendChild(frag);
  }

  // Xếp lại ô, tọa độ, góc bo theo hướng bàn hiện tại
  function layoutSquares() {
    for (const [sq, el] of sqEls) {
      const [x, y] = viewXY(sq);
      el.style.gridColumn = String(x + 1);
      el.style.gridRow = String(y + 1);
      let coords = '';
      if (x === 0) coords += `<span class="coord r" aria-hidden="true">${E.rankOf(sq) + 1}</span>`;
      if (y === 7) coords += `<span class="coord f" aria-hidden="true">${E.FILES[E.fileOf(sq)]}</span>`;
      el.innerHTML = coords;
      el.classList.toggle('c-tl', x === 0 && y === 0);
      el.classList.toggle('c-tr', x === 7 && y === 0);
      el.classList.toggle('c-bl', x === 0 && y === 7);
      el.classList.toggle('c-br', x === 7 && y === 7);
    }
  }

  // Đổi hướng bàn nếu cần, không cho quân trượt khi xoay
  function updateOrientation() {
    const want = wantBottom();
    if (want === bottom && sqEls.get(0).style.gridRow) return;
    bottom = want;
    boardEl.classList.add('noanim');
    layoutSquares();
    for (const [sq, el] of pieceAt) place(el, sq);
    void boardEl.offsetWidth;
    requestAnimationFrame(() => boardEl.classList.remove('noanim'));
    renderInfo();
  }

  function place(el, sq) {
    const [x, y] = viewXY(sq);
    el.style.setProperty('--x', x);
    el.style.setProperty('--y', y);
  }
  function makePiece(p) {
    const el = document.createElement('div');
    el.className = 'pc ' + sideCls(E.colorOf(p));
    el.dataset.p = p;
    el.innerHTML = pieceSvg(E.typeOf(p));
    return el;
  }
  // Khớp lớp quân với thế cờ hiện tại (tạo / bỏ / thay quân, ví dụ khi phong cấp)
  function syncPieces() {
    const b = game.state.b;
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = E.sqOf(f, r), p = b[sq];
        let el = pieceAt.get(sq);
        if (!p) { if (el) { el.remove(); pieceAt.delete(sq); } continue; }
        if (!el || +el.dataset.p !== p) {
          if (el) el.remove();
          el = makePiece(p);
          piecesEl.appendChild(el);
          pieceAt.set(sq, el);
        }
        el.classList.remove('dragging', 'gone');
        el.style.transform = '';
        place(el, sq);
      }
    }
    for (const [sq, el] of pieceAt) if (!b[sq]) { el.remove(); pieceAt.delete(sq); }
  }

  function squareLabel(sq, p, isTarget) {
    let t = E.sqName(sq) + ': ' + (p ? tr('sq.piece', { piece: PIECE_LC[E.typeOf(p)], color: COLOR_LC[E.colorOf(p)] }) : tr('sq.empty'));
    if (sq === selected) t += tr('sq.selected');
    else if (isTarget) t += p ? tr('sq.capture') : tr('sq.target');
    return t;
  }

  function render() {
    if (!game) return;
    const s = game.state;
    const canPlay = humanCanPlay();
    boardEl.classList.toggle('locked', !canPlay);
    const last = s.history.length ? s.history[s.history.length - 1] : null;
    const checkSq = s.check ? s.king[s.turn] : -1;
    const targets = new Map(); // ô đích -> có ăn quân không
    if (selected >= 0 && canPlay) for (const m of movesFrom(selected)) targets.set(E.toOf(m), !!(E.flagsOf(m) & E.F_CAP));
    const movable = new Set();
    if (canPlay) for (const m of game.legal) movable.add(E.fromOf(m));
    for (const [sq, el] of sqEls) {
      const p = s.b[sq];
      const isT = targets.has(sq);
      el.classList.toggle('last', !!last && (last.from === sq || last.to === sq));
      el.classList.toggle('sel', sq === selected);
      el.classList.toggle('target', isT && settings.hints);
      el.classList.toggle('capt', isT && targets.get(sq));
      el.classList.toggle('check', sq === checkSq);
      el.classList.toggle('movable', movable.has(sq));
      el.classList.toggle('ai-pick', !!aiPreview && (aiPreview.from === sq || aiPreview.to === sq));
      el.setAttribute('aria-label', squareLabel(sq, p, isT));
      el.tabIndex = sq === focusSq ? 0 : -1;
    }
    if (!anim.busy && !(drag && drag.moving)) syncPieces();
    for (const [sq, el] of pieceAt) el.classList.toggle('lifted', sq === selected);
    renderInfo();
  }

  // Quân mỗi bên đã ăn được, xếp theo giá trị
  function capturedBy(s, color) {
    const out = [];
    for (const h of s.history) if (h.color === color && h.captured) out.push(E.typeOf(h.captured));
    return out.sort((a, b) => a - b);
  }

  function setTurnText(html) { $('turn-text').innerHTML = html; }

  function renderInfo() {
    if (!game) return;
    const s = game.state;
    const ai = game.mode === 'ai';
    const lvLabel = LEVEL_LABEL[game.level];
    $('mode-label').textContent = ai ? tr('mode.ai', { level: lvLabel }) : tr('mode.pvp');
    const mat = E.material(s);
    for (const pos of [0, 1]) { // 0: thẻ dưới bàn, 1: thẻ trên bàn (màu thẻ theo người chơi, không theo vị trí)
      const color = pos === 0 ? bottom : bottom ^ 1;
      const card = $('player-' + pos);
      const isAi = ai && color !== game.human;
      const av = $('avatar-' + pos);
      av.className = 'pavatar ' + sideCls(color);
      av.innerHTML = pieceSvg(E.KING);
      let sub = tr('player.side.' + color) + (isAi ? ' · ' + tr('player.level', { level: lvLabel }) : color === WHITE ? ' · ' + tr('player.first') : '');
      const isThinking = (thinking || !!aiPreview) && isAi && s.turn === color && !s.over;
      const checked = s.check && !s.over && s.turn === color;
      if (isThinking) sub = tr('player.thinking');
      else if (checked) sub = tr('player.checked');
      $('name-' + pos).textContent = playerName(color);
      $('sub-' + pos).textContent = sub;
      card.style.setProperty('--pc', `var(--p${toneOf(color)})`);
      card.classList.toggle('active', !s.over && s.turn === color);
      card.classList.toggle('thinking', isThinking);
      card.classList.toggle('checked', checked && !isThinking);
      card.classList.toggle('winner', s.over && s.winner === color);
      // Quân đã ăn + chênh lệch quân
      const caps = capturedBy(s, color);
      let html = '';
      for (let i = 0; i < caps.length; i++) {
        const first = i > 0 && caps[i] !== caps[i - 1];
        html += `<svg class="mini ${sideCls(color ^ 1)}${first ? ' first' : ''}" viewBox="0 0 100 100" aria-hidden="true"><use href="#pc-${PIECE_ID[caps[i]]}"/></svg>`;
      }
      const capEl = $('cap-' + pos);
      capEl.innerHTML = html;
      capEl.setAttribute('aria-label', caps.length ? tr('player.caps', { list: caps.map((t) => PIECE_NAME[t]).join(', ') }) : tr('player.noCaps'));
      const lead = color === WHITE ? mat : -mat;
      const sc = $('score-' + pos);
      sc.textContent = lead > 0 ? '+' + lead : '';
      sc.setAttribute('aria-label', lead > 0 ? tr('player.lead', { n: lead }) : '');
    }

    // Dòng trạng thái lượt đi
    const turn = $('turn');
    turn.classList.toggle('thinking', thinking);
    let color = `var(--p${toneOf(s.turn)})`;
    if (s.over) {
      const w = s.winner;
      if (w === E.DRAW) { color = 'var(--muted)'; setTurnText(tr('turn.draw', { reason: REASON_TEXT[s.reason] })); }
      else {
        color = `var(--p${toneOf(w)})`;
        const who = ai ? (w === game.human ? tr('turn.youWin') : tr('turn.aiWins')) : tr('turn.colorWins', { color: COLOR_NAME[w] });
        setTurnText(tr('turn.mate', { who }));
      }
    } else if (aiPreview) {
      setTurnText(tr('turn.aiPlays', { san: aiPreview.san, desc: describe(aiPreview.m, s) }));
    } else if (thinking) {
      setTurnText(`<span class="dots">${tr('turn.thinking')}</span>`);
    } else {
      const pre = s.check ? `<b class="warn">${tr('turn.check')}</b> ` : '';
      if (s.check) color = 'var(--red)';
      if (selected >= 0) {
        const p = s.b[selected];
        setTurnText(pre + tr('turn.selected', { piece: PIECE_NAME[E.typeOf(p)], sq: E.sqName(selected) }));
      } else if (ai) {
        setTurnText(pre + tr('turn.yours', { color: COLOR_LC[game.human] }));
      } else {
        setTurnText(pre + tr('turn.of', { color: COLOR_NAME[s.turn] }));
      }
    }
    turn.style.setProperty('--turn-c', color);
    $('btn-undo').disabled = !canUndo();
  }

  // Diễn giải nước đi bằng lời theo ngôn ngữ đang chọn: "Mã g1 → f3, ăn Tốt, chiếu"
  function describe(m, s) {
    const from = E.fromOf(m), to = E.toOf(m), fl = E.flagsOf(m);
    const p = s.b[from];
    if (fl & E.F_CASTLE) return to > from ? tr('mv.castleK') : tr('mv.castleQ');
    let t = `${PIECE_NAME[E.typeOf(p)]} ${E.sqName(from)} → ${E.sqName(to)}`;
    if (fl & E.F_EP) t += tr('mv.ep');
    else if (s.b[to]) t += tr('mv.takes', { piece: PIECE_LC[E.typeOf(s.b[to])] });
    if (E.promoOf(m)) t += tr('mv.promo', { piece: PIECE_LC[E.promoOf(m)] });
    return t;
  }
  function describeRec(rec) {
    let t = `${COLOR_NAME[rec.color]}: `;
    if (rec.flags & E.F_CASTLE) t += rec.to > rec.from ? tr('mv.castleK') : tr('mv.castleQ');
    else {
      t += `${PIECE_NAME[E.typeOf(rec.piece)]} ${E.sqName(rec.from)} → ${E.sqName(rec.to)}`;
      if (rec.flags & E.F_EP) t += tr('mv.ep');
      else if (rec.captured) t += tr('mv.takes', { piece: PIECE_LC[E.typeOf(rec.captured)] });
      if (rec.promo) t += tr('mv.promo', { piece: PIECE_LC[rec.promo] });
    }
    if (rec.mate) t += tr('mv.mate');
    else if (rec.check) t += tr('mv.check');
    return t;
  }

  // Biên bản: "1. e4 e5 2. Nf3 …", cuộn tới nước mới nhất
  function renderLog() {
    const list = $('log');
    const h = game.state.history;
    const rows = [];
    for (let i = 0; i < h.length; i += 2) {
      const cell = (k) => (h[k] ? `<span class="log-mv${k === h.length - 1 ? ' cur' : ''}" title="${describeRec(h[k])}">${h[k].san}</span>` : '<span class="log-mv"></span>');
      rows.push(`<li class="log-row"><span class="log-n">${i / 2 + 1}.</span>${cell(i)}${cell(i + 1)}</li>`);
    }
    const s = game.state;
    if (s.over) rows.push(`<li class="log-end" title="${REASON_TEXT[s.reason]}">${s.winner === WHITE ? '1–0' : s.winner === BLACK ? '0–1' : '½–½'}</li>`);
    list.innerHTML = rows.length ? rows.join('') : `<li class="log-empty">${tr('log.empty')}</li>`;
    list.scrollTop = list.scrollHeight;
  }

  /* ---------------- Chạm, kéo thả trên bàn ---------------- */
  let drag = null; // { sq, id, x0, y0, moving, picked, el, over }

  function sqFromPoint(x, y) {
    const r = boardEl.getBoundingClientRect();
    const cx = Math.floor(((x - r.left) / r.width) * 8), cy = Math.floor(((y - r.top) / r.height) * 8);
    if (cx < 0 || cx > 7 || cy < 0 || cy > 7) return -1;
    return sqAtView(cx, cy);
  }
  const canPick = (sq) => humanCanPlay() && game.state.b[sq] && E.colorOf(game.state.b[sq]) === game.state.turn && movesFrom(sq).length > 0;

  function setDropOver(sq) {
    if (drag.over === sq) return;
    if (drag.over >= 0) sqEls.get(drag.over).classList.remove('drop-over');
    drag.over = sq;
    if (sq >= 0 && movesFrom(drag.sq).some((m) => E.toOf(m) === sq)) sqEls.get(sq).classList.add('drop-over');
  }
  function endDrag() {
    if (!drag) return;
    if (drag.over >= 0) sqEls.get(drag.over).classList.remove('drop-over');
    if (drag.el) { drag.el.classList.remove('dragging'); drag.el.style.transform = ''; }
    boardEl.classList.remove('dragging');
    drag = null;
  }

  boardEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target.closest('.sq');
    if (!el || !game) return;
    const sq = +el.dataset.sq;
    endDrag();
    drag = { sq, id: e.pointerId, x0: e.clientX, y0: e.clientY, moving: false, picked: false, el: null, over: -1 };
    if (canPick(sq)) {
      if (selected !== sq) { selected = sq; drag.picked = true; render(); sfx('tap'); }
      try { boardEl.setPointerCapture(e.pointerId); } catch (err) {}
    }
    focusSq = sq;
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.moving) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6 || !canPick(drag.sq)) return;
      drag.el = pieceAt.get(drag.sq);
      if (!drag.el) return;
      drag.moving = true;
      drag.el.classList.add('dragging');
      boardEl.classList.add('dragging');
    }
    const r = boardEl.getBoundingClientRect();
    const size = r.width / 8;
    drag.el.style.transform = `translate(${e.clientX - r.left - size / 2}px, ${e.clientY - r.top - size / 2}px)`;
    setDropOver(sqFromPoint(e.clientX, e.clientY));
  });
  boardEl.addEventListener('pointerup', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag;
    if (d.moving) {
      const to = sqFromPoint(e.clientX, e.clientY);
      if (d.over >= 0) sqEls.get(d.over).classList.remove('drop-over');
      boardEl.classList.remove('dragging');
      drag = null;
      if (to >= 0 && to !== d.sq && humanCanPlay() && tryMove(d.sq, to, true)) return;
      if (to >= 0 && to !== d.sq) sfx('error');
      // Thả ra ngoài hoặc vào ô không đi được: quân về chỗ cũ, vẫn đang cầm
      d.el.classList.remove('dragging');
      d.el.style.transform = '';
      render();
      return;
    }
    drag = null;
    if (d.picked) return; // vừa cầm quân lên bằng cú chạm này
    handleSquare(d.sq);
  });
  boardEl.addEventListener('pointercancel', () => { endDrag(); if (game) render(); });
  // Nhả tay ngoài bàn khi chưa bắt giữ con trỏ: bỏ thao tác dở
  window.addEventListener('pointerup', (e) => {
    if (drag && drag.id === e.pointerId && !boardEl.contains(e.target)) { endDrag(); if (game) render(); }
  });
  boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------------- Bàn phím trên bàn ---------------- */
  function setFocus(sq, focus) {
    if (sqEls.get(focusSq)) sqEls.get(focusSq).tabIndex = -1;
    focusSq = sq;
    sqEls.get(sq).tabIndex = 0;
    if (focus) sqEls.get(sq).focus();
  }
  boardEl.addEventListener('keydown', (e) => {
    const el = e.target.closest('.sq');
    if (!el || !game) return;
    const sq = +el.dataset.sq;
    const k = e.key;
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if (dir) {
      e.preventDefault();
      const [x, y] = viewXY(sq);
      const nx = Math.max(0, Math.min(7, x + dir[0])), ny = Math.max(0, Math.min(7, y + dir[1]));
      setFocus(sqAtView(nx, ny), true);
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      handleSquare(sq);
    }
  });
  // Nút ô không dùng sự kiện click (đã xử lý bằng pointer và phím)
  boardEl.addEventListener('click', (e) => e.preventDefault());

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
    if (id === 'modal-promo') onPromoClosed();
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
      if (top === 'modal-promo' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const btns = [...$('promo-list').children];
        const i = btns.indexOf(document.activeElement);
        if (i >= 0) { e.preventDefault(); btns[(i + (e.key === 'ArrowRight' ? 1 : 3)) % 4].focus(); }
      }
      return;
    }
    if (e.altKey || e.metaKey) return;
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'Escape' && selected >= 0) {
      e.preventDefault();
      selected = -1;
      render();
      if (sqEls.get(focusSq) && document.activeElement && document.activeElement.closest && document.activeElement.closest('.board')) sqEls.get(focusSq).focus();
      return;
    }
    const k = e.key.toLowerCase();
    if (e.ctrlKey) {
      if (k === 'z') { e.preventDefault(); undo(); }
      return;
    }
    if (k === 'z' || k === 'u') { e.preventDefault(); undo(); }
    else if (k === 'n') { e.preventDefault(); openNewGame(); }
    else if (k === 'h' || k === '?') { e.preventDefault(); openHelp(); }
    else if (k === 'f') { e.preventDefault(); flipBoard(); }
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
  const draft = { mode: 'ai', level: 'medium', color: 'white' };
  const fieldGroup = (name) => document.querySelector(`#modal-new [data-field="${name}"]`);

  function syncNewModal() {
    setSegmented(fieldGroup('mode'), draft.mode);
    setSegmented(fieldGroup('level'), draft.level);
    setSegmented(fieldGroup('color'), draft.color);
    for (const el of document.querySelectorAll('#modal-new [data-ai-only]')) el.hidden = draft.mode !== 'ai';
    for (const el of document.querySelectorAll('#modal-new [data-pvp-only]')) el.hidden = draft.mode !== 'pvp';
    $('level-desc').textContent = LEVEL_DESC[draft.level];
  }
  function openNewGame() {
    draft.mode = game ? game.mode : settings.mode;
    draft.level = game ? game.level : settings.level;
    draft.color = settings.color;
    $('new-warning').hidden = !(game && game.moves.length > 0 && !game.state.over);
    syncNewModal();
    closeModal('modal-result');
    openModal('modal-new');
  }
  bindSegmented(fieldGroup('mode'), (v) => { draft.mode = v; syncNewModal(); });
  bindSegmented(fieldGroup('level'), (v) => { draft.level = v; syncNewModal(); });
  bindSegmented(fieldGroup('color'), (v) => { draft.color = v; syncNewModal(); });
  $('btn-start').addEventListener('click', () => {
    settings.mode = draft.mode;
    settings.level = draft.level;
    settings.color = draft.color;
    saveSettings();
    closeModal('modal-new');
    startGame({ mode: draft.mode, level: draft.level, color: draft.color });
  });

  /* ---------------- Phong cấp ---------------- */
  let promoPending = null; // { cands, instant, done }
  function openPromo(cands, instant) {
    const color = game.state.turn;
    promoPending = { cands, instant, done: false };
    const list = $('promo-list');
    list.innerHTML = [E.QUEEN, E.ROOK, E.BISHOP, E.KNIGHT].map((t) =>
      `<button type="button" class="promo-btn ${sideCls(color)}" data-promo="${t}" aria-label="${tr('promo.to', { piece: PIECE_LC[t] })}">${pieceSvg(t)}<span>${PIECE_NAME[t]}</span></button>`).join('');
    openModal('modal-promo', '.promo-btn');
  }
  $('promo-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-promo]');
    if (!b || !promoPending) return;
    const m = promoPending.cands.find((x) => E.promoOf(x) === +b.dataset.promo);
    promoPending.done = true;
    const instant = promoPending.instant;
    closeModal('modal-promo');
    if (m && humanCanPlay()) commitMove(m, instant);
  });
  // Đóng hộp chọn mà không chọn: hủy nước, quân về chỗ cũ
  function onPromoClosed() {
    if (promoPending && !promoPending.done && game) { selected = -1; render(); }
    promoPending = null;
  }

  /* ---------------- Kết quả ---------------- */
  function showResult() {
    if (!game || !game.state.over || topModal()) return;
    const s = game.state;
    const w = s.winner;
    const ai = game.mode === 'ai';
    const lv = LEVEL_LABEL[game.level];
    const n = Math.ceil(s.history.length / 2);
    let title, sub, celebrate = false, mark = 'draw';
    if (w === E.DRAW) {
      title = tr('result.draw');
      sub = tr('result.drawSub', { reason: REASON_TEXT[s.reason], n });
    } else if (ai) {
      const youWin = w === game.human;
      title = youWin ? tr('result.youWin') : tr('result.aiWins');
      sub = youWin ? tr('result.youWinSub', { level: lv, n }) : tr('result.youLoseSub', { n });
      celebrate = youWin;
      mark = youWin ? 'win' : 'lose';
    } else {
      title = tr('result.colorWins', { color: COLOR_NAME[w] });
      sub = tr('result.mateSub', { n });
      celebrate = true;
      mark = 'win';
    }
    const markEl = $('result-mark');
    markEl.className = 'result-mark ' + mark + ' ' + sideCls(w === E.DRAW ? WHITE : w);
    markEl.innerHTML = pieceSvg(E.KING);
    $('result-title').textContent = title;
    $('result-sub').textContent = sub;
    const pts = (c) => (w === E.DRAW ? '½' : w === c ? '1' : '0');
    $('result-score').innerHTML = [bottom, bottom ^ 1].map((c) => {
      const caps = capturedBy(s, c).length;
      return `<div data-p="${toneOf(c)}"${w === c ? ' class="win"' : ''}><dt>${ai ? `${playerName(c)} · ${COLOR_NAME[c]}` : COLOR_NAME[c]}</dt><dd><b>${pts(c)}</b><span>${tr('result.caps', { n: caps })}</span></dd></div>`;
    }).join('');
    if (ai) {
      const st = stats.levels[game.level];
      $('result-line').textContent = tr('result.levelLine', { level: lv, won: st.won, lost: st.lost, drawn: st.drawn }) + (stats.streak > 1 ? tr('result.streak', { n: stats.streak }) : '');
    } else {
      $('result-line').textContent = tr('result.pvpLine', { w: stats.pvp.white, b: stats.pvp.black, d: stats.pvp.drawn });
    }
    $('btn-result-new').textContent = ai ? tr('result.again') : tr('btn.new');
    sfx(mark);
    const conf = $('confetti');
    conf.innerHTML = '';
    // Pháo giấy toàn màn hình của SDK khi có, không thì dùng pháo giấy trong hộp kết quả
    if (celebrate && PN && PN.fx && typeof PN.fx.confetti === 'function') {
      try { PN.fx.confetti(); } catch (e) { /* bỏ qua */ }
    } else if (celebrate && !reduceMotion.matches) {
      const colors = ['var(--p0)', 'var(--p1)', 'var(--accent)', 'var(--text)'];
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
  function renderStats() {
    const ai = aiTotals();
    $('stats-won').textContent = ai.won;
    $('stats-streak').textContent = stats.streak;
    $('stats-best').textContent = stats.best;
    $('stats-body').innerHTML = LEVEL_ORDER.map((k) => {
      const r = stats.levels[k];
      return `<tr><td>${LEVEL_LABEL[k]}</td><td>${r.played}</td><td>${r.won}</td><td>${r.lost}</td><td>${r.drawn}</td></tr>`;
    }).join('');
    const p = stats.pvp;
    $('stats-pvp').textContent = p.played ? tr('stats.pvpLine', { n: p.played, w: p.white, b: p.black, d: p.drawn }) : tr('stats.none');
    resetConfirm(false);
  }
  let resetTimer = 0;
  function resetConfirm(on) {
    const btn = $('btn-stats-reset');
    btn.classList.toggle('confirm', on);
    btn.textContent = on ? tr('stats.resetConfirm') : tr('stats.reset');
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
    toast(tr('toast.statsReset'));
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
  bindSegmented(settingGroup('lang'), (v) => { if (v !== I18N.lang) { saveGame(); saveSettings(); I18N.set(v); } });
  $('set-hints').addEventListener('change', (e) => { settings.hints = e.target.checked; saveSettings(); render(); });
  $('set-autoflip').addEventListener('change', (e) => {
    settings.autoFlip = e.target.checked;
    saveSettings();
    if (!anim.busy) { updateOrientation(); render(); }
    if (game && game.mode === 'ai') toast(tr('toast.autoFlipPvp'));
  });
  $('btn-settings').addEventListener('click', () => {
    setSegmented(settingGroup('theme'), settings.theme);
    setSegmented(settingGroup('speed'), settings.speed);
    setSegmented(settingGroup('lang'), I18N.lang);
    $('set-hints').checked = settings.hints;
    $('set-autoflip').checked = settings.autoFlip;
    if (!$('set-sound-row').hidden) $('set-sound').checked = !SFX.isMuted();
    openModal('modal-settings');
  });
  // Bật / tắt tiếng: dùng chung khóa với cổng PlayNine; SDK không có sfx thì ẩn dòng này
  if (SFX && typeof SFX.isMuted === 'function' && typeof SFX.setMuted === 'function') {
    $('set-sound').addEventListener('change', (e) => { SFX.setMuted(!e.target.checked); if (e.target.checked) sfx('tap'); });
    if (typeof SFX.onChange === 'function') SFX.onChange((muted) => { $('set-sound').checked = !muted; });
  } else {
    $('set-sound-row').hidden = true;
  }
  $('btn-settings-help').addEventListener('click', () => { closeModal('modal-settings'); openHelp(); });
  if (window.matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme();
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* ---------------- Cách chơi (có hình minh họa) ---------------- */
  let figId = 0;
  // Bàn cờ thu nhỏ, mỗi ô 10 đơn vị. cfg: { alt, x0, y0, w, h (cột / hàng bắt đầu, số cột / hàng),
  //   pcs: 'Ke1 qd8' (chữ hoa: Trắng), dots, rings, sel, last, check: [ô...], arrows: [[từ, đến]], tags: { ô: 'chữ' } }
  function figure(cfg) {
    const uid = ++figId;
    const W = cfg.w * 10, H = cfg.h * 10;
    const xy = (name) => { const sq = E.parseSq(name); return [(E.fileOf(sq) - cfg.x0) * 10, (cfg.y0 + cfg.h - 1 - E.rankOf(sq)) * 10]; };
    const top = cfg.tags ? 6 : 1;
    let s = `<svg viewBox="-1 ${-top} ${W + 2} ${H + top + 1}" role="img" aria-label="${cfg.alt}">`;
    s += `<defs><marker id="fa${uid}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto"><path class="f-arrow-head" d="M0 0L10 5L0 10z"/></marker></defs>`;
    for (let y = 0; y < cfg.h; y++) {
      for (let x = 0; x < cfg.w; x++) {
        const f = cfg.x0 + x, r = cfg.y0 + cfg.h - 1 - y;
        s += `<rect class="${(f + r) % 2 === 0 ? 'f-dark' : 'f-light'}" x="${x * 10}" y="${y * 10}" width="10" height="10"/>`;
      }
    }
    for (const n of cfg.last || []) { const [x, y] = xy(n); s += `<rect class="f-last" x="${x}" y="${y}" width="10" height="10"/>`; }
    for (const n of [].concat(cfg.sel || [])) { const [x, y] = xy(n); s += `<rect class="f-sel" x="${x}" y="${y}" width="10" height="10"/>`; }
    for (const n of cfg.check || []) { const [x, y] = xy(n); s += `<circle class="f-check" cx="${x + 5}" cy="${y + 5}" r="4.6"/>`; }
    s += `<rect class="f-frame" x="0" y="0" width="${W}" height="${H}" rx="1"/>`;
    for (const tok of (cfg.pcs || '').split(' ').filter(Boolean)) {
      const ch = tok[0], [x, y] = xy(tok.slice(1));
      const t = PIECE_ID.indexOf(ch.toLowerCase());
      s += `<use class="fig-pc ${ch === ch.toLowerCase() ? 'pc-b' : 'pc-w'}" href="#pc-${PIECE_ID[t]}" x="${x + 0.4}" y="${y + 0.4}" width="9.2" height="9.2"/>`;
    }
    for (const n of cfg.dots || []) { const [x, y] = xy(n); s += `<circle class="f-dot" cx="${x + 5}" cy="${y + 5}" r="1.6"/>`; }
    for (const n of cfg.rings || []) { const [x, y] = xy(n); s += `<circle class="f-ring" cx="${x + 5}" cy="${y + 5}" r="4.4"/>`; }
    for (const [a, b] of cfg.arrows || []) {
      const [x1, y1] = xy(a), [x2, y2] = xy(b);
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
      const ex = x2 + 5 - (dx / len) * 2.6, ey = y2 + 5 - (dy / len) * 2.6;
      s += `<path class="f-arrow" d="M${x1 + 5} ${y1 + 5}L${ex.toFixed(2)} ${ey.toFixed(2)}" marker-end="url(#fa${uid})"/>`;
    }
    for (const n in cfg.tags || {}) { const [x] = xy(n); s += `<text class="f-tag" x="${x + 5}" y="-1.6">${cfg.tags[n]}</text>`; }
    return s + '</svg>';
  }
  const HELP = [
    {
      title: tr('help.1.title'),
      text: tr('help.1.text'),
      fig: { alt: tr('help.1.alt'), x0: 2, y0: 4, w: 6, h: 4, pcs: 'Rd8 kg8 pf7 pg7 ph7 Kg5', check: ['g8'], arrows: [['d8', 'f8']], tags: { g8: tr('tag.mate') } },
    },
    {
      title: tr('help.2.title'),
      text: tr('help.2.text'),
      fig: { alt: tr('help.2.alt'), x0: 0, y0: 0, w: 5, h: 5, pcs: 'Qc3 pe5 Pa3', sel: 'c3', dots: ['c1', 'c2', 'c4', 'c5', 'b3', 'd3', 'e3', 'b2', 'a1', 'd4', 'd2', 'e1', 'b4', 'a5'], rings: ['e5'] },
    },
    {
      title: tr('help.3.title'),
      text: tr('help.3.text'),
      fig: { alt: tr('help.3.alt'), x0: 1, y0: 1, w: 5, h: 5, pcs: 'Nd4 Pd5 Pe4 Pc4 pd3', sel: 'd4', dots: ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'] },
    },
    {
      title: tr('help.4.title'),
      text: tr('help.4.text'),
      fig: { alt: tr('help.4.alt'), x0: 1, y0: 1, w: 5, h: 5, pcs: 'Pe2 Pc4 pc5 pd5', dots: ['e3', 'e4'], rings: ['d5'], arrows: [['c4', 'd5']], sel: 'e2' },
    },
    {
      title: tr('help.5.title'),
      text: tr('help.5.text'),
      fig: { alt: tr('help.5.alt'), x0: 0, y0: 0, w: 8, h: 3, pcs: 'Ke1 Rh1 Ra1 Pa2 Pb2 Pc2 Pf2 Pg2 Ph2 Nc3', sel: 'e1', dots: ['g1', 'f1', 'd1', 'c1', 'd2', 'e2'], arrows: [['h1', 'f1']] },
    },
    {
      title: tr('help.6.title'),
      text: tr('help.6.text'),
      fig: { alt: tr('help.6.alt'), x0: 0, y0: 4, w: 6, h: 4, pcs: 'Pe5 pd5 Pb7', last: ['d7', 'd5'], rings: ['d5'], dots: ['d6', 'b8'], arrows: [['e5', 'd6'], ['b7', 'b8']], tags: { b8: tr('tag.promo') } },
    },
    {
      title: tr('help.7.title'),
      text: tr('help.7.text'),
      fig: { alt: tr('help.7.alt'), x0: 4, y0: 5, w: 4, h: 3, pcs: 'kh8 Qf7 Kg6', sel: 'h8', tags: { h8: tr('tag.stalemate') } },
    },
  ];
  let helpIdx = 0;

  function showHelp(i) {
    helpIdx = Math.max(0, Math.min(HELP.length - 1, i));
    const h = HELP[helpIdx];
    $('help-body').innerHTML =
      `<div class="help-figure">${figure(h.fig)}</div>` +
      `<p class="help-step">${tr('help.step', { i: helpIdx + 1, n: HELP.length })}</p>` +
      `<h3>${h.title}</h3><p>${h.text}</p>`;
    const dots = $('help-dots');
    if (!dots.children.length) {
      HELP.forEach((_, k) => {
        const d = document.createElement('button');
        d.type = 'button';
        d.setAttribute('role', 'tab');
        d.setAttribute('aria-label', tr('help.dot', { i: k + 1 }));
        d.addEventListener('click', () => showHelp(k));
        dots.appendChild(d);
      });
    }
    [...dots.children].forEach((d, k) => {
      d.setAttribute('aria-selected', k === helpIdx ? 'true' : 'false');
      d.tabIndex = k === helpIdx ? 0 : -1;
    });
    $('btn-help-prev').disabled = helpIdx === 0;
    $('btn-help-next').textContent = helpIdx === HELP.length - 1 ? tr('help.play') : tr('help.next');
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
  $('btn-flip').addEventListener('click', flipBoard);
  $('btn-new').addEventListener('click', openNewGame);

  /* ================= Khởi động ================= */
  I18N.apply();
  I18N.onSave(() => { saveGame(); saveSettings(); }); // trang khác đổi ngôn ngữ: lưu trước khi tải lại
  $('app-version').textContent = APP_VERSION;
  applyTheme();
  buildBoard();
  AI.start();
  const saved = loadGame();
  if (saved) {
    game = saved;
    PN && game.mode === 'ai' && !game.recorded && PN.gameStart({ mode: game.level, resume: true });
    updateOrientation();
    render();
    renderLog();
    writeSummary();
    scheduleAi();
  } else {
    startGame({ mode: settings.mode, level: settings.level, color: settings.color });
  }
  // Lần đầu vào game: tự mở hướng dẫn (đánh dấu đã xem ngay để chỉ hiện một lần)
  if (!settings.guideSeen) {
    settings.guideSeen = true;
    saveSettings();
    openHelp();
  }
})();
