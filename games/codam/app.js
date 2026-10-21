/* =====================================================================
 * Cờ Đam - Game (chỉ chạy trong trình duyệt, cần engine.js nạp trước)
 *   1. Lưu trữ: cài đặt, thống kê, ván đang chơi, tóm tắt cho cổng PlayNine
 *   2. Máy nghĩ trong Web Worker (tạo từ Blob mã nguồn engine)
 *   3. Điều khiển ván: chọn quân, chọn ô đến (từng bước khi có nhiều đường ăn),
 *      kéo thả, máy đi, đi lại, ván mới, kết thúc
 *   4. Hiệu ứng quân trượt theo từng bước nhảy, quân bị ăn mờ dần, lên vua
 *   5. Render bàn, người chơi, nhật ký, modal, hướng dẫn có hình minh họa
 * ===================================================================== */
(() => {
  'use strict';
  const PN = window.PlayNine || null; // SDK PlayNine: chỉ có khi chạy trong cổng
  PN && PN.init({ gameId: 'codam' });

  // Phiên bản app: tăng khi phát hành, đồng bộ với ?v= ở index.html
  const APP_VERSION = '1.0.1';
  const KEYS = {
    settings: 'playnine-codam-settings-v1',
    save: 'playnine-codam-save-v1',
    stats: 'playnine-codam-stats-v1',
    summary: 'playnine-codam-summary-v1',
  };
  const E = CoDam;
  const LEVELS = E.LEVELS;
  const RULES = E.RULES;
  const LEVEL_ORDER = ['easy', 'medium', 'hard'];
  const RULE_ORDER = ['intl', 'english'];
  // Chữ hiển thị lấy từ i18n.js theo ngôn ngữ đang chọn
  const T = I18N.t;
  const levelLabel = (lv) => T('level.' + lv);
  const rulesShort = (rk) => T('rulesShort.' + rk);
  const SIDE_NAME = [T('side.0'), T('side.1')];
  const endText = (reason) => T('end.' + reason);
  // Thời gian trượt cho mỗi bước nhảy (ms)
  const SPEED = { slow: 380, medium: 230, fast: 120, off: 0 };
  const MIN_THINK_MS = 450; // máy luôn "nghĩ" tối thiểu chừng này
  const AFTER_ANIM_MS = 260; // nghỉ một nhịp sau khi quân đi xong rồi máy mới đi
  const CROWN = '<svg class="crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 8.2l4.7 3.7L12 4.8l3.9 7.1 4.7-3.7-1.9 9.4H5.3z"/><rect x="5.3" y="18.6" width="13.4" height="2.2" rx="1"/></svg>';
  const CROWN_PATH = 'M3.4 8.2l4.7 3.7L12 4.8l3.9 7.1 4.7-3.7-1.9 9.4H5.3zM5.3 18.6h13.4v2.2H5.3z';

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  /* ================= 1. Lưu trữ ================= */
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  const DEFAULT_SETTINGS = { theme: 'auto', speed: 'medium', coords: true, mode: 'ai', level: 'medium', human: 0, rules: 'intl', guideSeen: false };
  let settings = loadSettings();

  function loadSettings() {
    const s = { ...DEFAULT_SETTINGS };
    const raw = readJSON(KEYS.settings) || {};
    if (['auto', 'light', 'dark'].includes(raw.theme)) s.theme = raw.theme;
    if (SPEED[raw.speed] != null) s.speed = raw.speed;
    if (typeof raw.coords === 'boolean') s.coords = raw.coords;
    if (raw.mode === 'ai' || raw.mode === 'pvp') s.mode = raw.mode;
    if (LEVELS[raw.level]) s.level = raw.level;
    if (raw.human === 0 || raw.human === 1) s.human = raw.human;
    if (RULES[raw.rules]) s.rules = raw.rules;
    s.guideSeen = raw.guideSeen === true;
    return s;
  }
  function saveSettings() { writeJSON(KEYS.settings, settings); }

  // Thống kê tách theo bộ luật; trong mỗi bộ luật: đấu máy theo mức + hai người
  function emptyRuleStats() {
    const levels = {};
    for (const lv of LEVEL_ORDER) levels[lv] = { played: 0, won: 0, lost: 0, drawn: 0 };
    return { levels, pvp: { played: 0, p0: 0, p1: 0, drawn: 0 } };
  }
  function emptyStats() {
    return { rules: { intl: emptyRuleStats(), english: emptyRuleStats() }, streak: 0, best: 0 };
  }
  const toInt = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  function loadStats() {
    const st = emptyStats();
    const raw = readJSON(KEYS.stats);
    if (!raw || typeof raw !== 'object' || !raw.rules) return st;
    for (const rk of RULE_ORDER) {
      const r = raw.rules[rk];
      if (!r) continue;
      for (const lv of LEVEL_ORDER) {
        const x = r.levels && r.levels[lv];
        if (x) for (const k of ['played', 'won', 'lost', 'drawn']) st.rules[rk].levels[lv][k] = toInt(x[k]);
      }
      if (r.pvp) for (const k of ['played', 'p0', 'p1', 'drawn']) st.rules[rk].pvp[k] = toInt(r.pvp[k]);
    }
    st.streak = toInt(raw.streak);
    st.best = toInt(raw.best);
    return st;
  }
  let stats = loadStats();
  function saveStats() { writeJSON(KEYS.stats, stats); }

  function totals() {
    let played = 0, won = 0, pvp = 0;
    for (const rk of RULE_ORDER) {
      const r = stats.rules[rk];
      for (const lv of LEVEL_ORDER) { played += r.levels[lv].played; won += r.levels[lv].won; }
      pvp += r.pvp.played;
    }
    return { played, won, pvp };
  }

  /* ================= 2. Máy nghĩ trong Web Worker ================= */
  // Worker được dựng từ chính mã nguồn hàm CoDamFactory (qua Blob) nên chạy được
  // cả khi mở trang bằng file://. Không tạo được worker thì tính trên luồng chính.
  const AI = {
    worker: null,
    nextId: 0,
    pending: null, // { id, cb, moves, cfg, level }
    source() {
      return 'var CoDam = (' + E.factory.toString() + ')();\n' +
        'self.onmessage = function (e) {\n' +
        '  var d = e.data;\n' +
        '  var res = CoDam.chooseMove(CoDam.fromMoves(d.moves, d.cfg), { level: d.level });\n' +
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
  // game: { mode: 'ai'|'pvp', level, human: 0|1 (bên bạn cầm khi đấu máy), rules: 'intl'|'english',
  //         moves: [path...], recorded, state, log, last }
  // Bên 0 cầm quân Đen (đi trước), bên 1 cầm quân Trắng. Đấu máy mà bạn cầm Trắng thì lật bàn
  // để quân của bạn luôn ở phía dưới; hai người thì Đen (Người 1) ở dưới.
  let game = null;
  let thinking = false;
  let aiToken = 0;
  let aiResult = null;
  let aiPreview = null; // nước máy đã chọn, đang được tô lên bàn trước khi đi
  let sel = null; // { from, path: [ô đã đi qua...], cands: [nước còn khớp] }
  let resultTimer = 0;
  let animEndAt = 0;

  const cfgOf = (g) => ({ rules: g.rules });
  const moverOf = (i) => i % 2;
  const isAiTurn = () => game && game.mode === 'ai' && !game.state.over && game.state.turn !== game.human;
  const humanCanPlay = () => game && !game.state.over && !thinking && !anim.busy && !aiPreview && (game.mode === 'pvp' || game.state.turn === game.human);
  const flipped = () => !!game && game.mode === 'ai' && game.human === 1;
  const posOf = (side) => (flipped() ? 1 - side : side); // 0: phía dưới bàn, 1: phía trên
  const sideAt = (pos) => (flipped() ? 1 - pos : pos);
  const nameOf = (g, side) => (g.mode === 'pvp' ? (side === 0 ? T('who.p1') : T('who.p2')) : side === g.human ? T('who.you') : T('who.ai'));
  const playerName = (side) => nameOf(game, side);
  const isYou = (g, side) => g.mode === 'ai' && side === g.human;
  // "Bạn thắng" / "Máy thắng" / "Người 1 thắng" (tiếng Anh: You win / Computer wins)
  const winsText = (g, side) => (isYou(g, side) ? T('wins.you') : T('wins.name', { name: nameOf(g, side) }));

  // Danh sách nước hợp lệ của thế hiện tại (tính lại khi ván đổi)
  let legalCache = null;
  function legal() {
    if (!legalCache || legalCache.s !== game.state || legalCache.n !== game.moves.length) {
      legalCache = { s: game.state, n: game.moves.length, moves: E.legalMoves(game.state) };
    }
    return legalCache.moves;
  }
  const movesFrom = (sq) => legal().filter((m) => m.from === sq);

  function saveGame() {
    if (!game) return;
    writeJSON(KEYS.save, { v: 1, mode: game.mode, level: game.level, human: game.human, rules: game.rules, moves: game.moves, recorded: game.recorded, usedUndo: !!game.usedUndo });
  }

  function loadGame() {
    const raw = readJSON(KEYS.save);
    if (!raw || raw.v !== 1 || !Array.isArray(raw.moves)) return null;
    try {
      const g = {
        mode: raw.mode === 'pvp' ? 'pvp' : 'ai',
        level: LEVELS[raw.level] ? raw.level : 'medium',
        human: raw.human === 1 ? 1 : 0,
        rules: RULES[raw.rules] ? raw.rules : 'intl',
        moves: raw.moves.map((p) => {
          if (!Array.isArray(p) || p.length < 2 || !p.every((x) => Number.isInteger(x) && x >= 0 && x < 64)) throw new Error('Nước hỏng');
          return p.slice();
        }),
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
    g.last = null;
    for (let i = 0; i < g.moves.length; i++) {
      const m = E.findMove(s, g.moves[i]);
      if (!m) throw new Error('Nước không hợp lệ');
      const side = s.turn;
      E.play(s, m);
      g.log.push(...describe(g, side, m, s));
      g.last = { path: m.path, caps: m.caps };
    }
    g.state = s;
    legalCache = null;
  }

  // Mô tả một nước cho nhật ký: "Bạn: c3×e5×g7 · lên vua"
  function describe(g, side, m, after) {
    const promo = m.promoteAt >= 0;
    const out = [{ p: side, text: T('log.move', { name: nameOf(g, side), move: `<span class="mv">${E.moveText(m)}</span>` }) + (promo ? T('log.crowned') : ''), big: m.caps.length >= 2 || promo }];
    if (after.over) out.push({ p: -1, info: true, text: overText(g, after) });
    return out;
  }
  function overText(g, s) {
    if (s.winner === E.DRAW) return T('log.draw', { reason: endText(s.endReason) });
    return T('log.over', { loser: nameOf(g, 1 - s.winner), reason: endText(s.endReason), wins: winsText(g, s.winner) });
  }

  function startGame(cfg) {
    cancelAi();
    cancelAnim();
    clearTimeout(resultTimer);
    closeModal('modal-result');
    game = {
      mode: cfg.mode,
      level: cfg.level,
      human: cfg.mode === 'ai' ? cfg.human : 0,
      rules: cfg.rules,
      moves: [],
      recorded: false,
    };
    rebuild(game);
    sel = null;
    focusSq = -1;
    saveGame();
    render();
    renderLog();
    writeSummary();
    PN && game.mode === 'ai' && PN.gameStart({ mode: game.level });
    scheduleAi();
  }

  function newGameSame() {
    startGame({ mode: game.mode, level: game.level, human: game.human, rules: game.rules });
  }

  // Đi một nước (người hoặc máy): cập nhật ván ngay, hiệu ứng chạy sau
  function commitMove(m) {
    const s = game.state;
    const before = s.board.slice();
    const side = s.turn;
    E.play(s, m);
    game.moves.push(m.path.slice());
    game.log.push(...describe(game, side, m, s));
    game.last = { path: m.path, caps: m.caps };
    legalCache = null;
    sel = null;
    if (s.over) recordResult();
    saveGame();
    writeSummary();
    animateMove(before, m, side); // nhật ký cập nhật khi quân đi xong

    // Máy bắt đầu nghĩ ngay trong lúc hiệu ứng đang chạy
    scheduleAi();
  }

  function select(sq) {
    sel = { from: sq, path: [sq], cands: movesFrom(sq) };
  }

  // Chạm / Enter vào một ô
  function tapSquare(sq) {
    if (!game) return;
    if (anim.busy) { skipAnim(); return; }
    const s = game.state;
    if (s.over) { toast(T('toast.over')); return; }
    if (thinking || aiPreview) { toast(T('toast.thinking')); return; }
    if (!humanCanPlay()) return;
    if (sel && tryTarget(sq)) return;
    const v = s.board[sq];
    if (E.isOwn(v, s.turn)) {
      if (sel && sel.from === sq) { sel = null; render(); return; } // bấm lại để bỏ chọn
      if (movesFrom(sq).length) { select(sq); render(); return; }
      const all = legal();
      toast(all.length && all[0].caps.length ? T('toast.mustCapture') : T('toast.cantMove'));
      return;
    }
    if (sel) { sel = null; render(); return; }
    if (v && E.isOwn(v, 1 - s.turn)) toast(game.mode === 'ai' ? T('toast.aiPiece') : T('toast.notYourTurn', { name: playerName(s.turn), side: SIDE_NAME[s.turn] }));
  }

  // Ô sq có phải ô đến của quân đang chọn: đi luôn nếu chỉ còn một nước khớp,
  // còn nhiều đường ăn thì ghi nhận bước này và chờ chạm bước kế tiếp
  function tryTarget(sq) {
    const k = sel.path.length;
    const next = sel.cands.filter((m) => m.path[k] === sq);
    if (next.length === 1) { commitMove(next[0]); return true; }
    if (next.length > 1) { sel.path.push(sq); sel.cands = next; render(); return true; }
    const fin = sel.cands.filter((m) => m.to === sq && m.path.length > k + 1);
    if (fin.length === 1) { commitMove(fin[0]); return true; }
    if (fin.length > 1) { toast(T('toast.manyRoutes')); return true; }
    return false;
  }

  // Chỉ một quân đi được và bắt buộc ăn: chọn sẵn quân đó
  function autoSelect() {
    if (!humanCanPlay() || sel) return;
    const ms = legal();
    if (ms.length && ms[0].caps.length && ms.every((m) => m.from === ms[0].from)) { select(ms[0].from); render(); }
  }

  function scheduleAi() {
    if (!isAiTurn() || thinking) return;
    thinking = true;
    aiResult = null;
    const token = ++aiToken;
    const t0 = Date.now();
    renderInfo();
    AI.think(game.moves.slice(), cfgOf(game), game.level, (res) => {
      if (token !== aiToken) return;
      aiResult = { move: res && res.move, t0, token };
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
      (fast ? 100 : AFTER_ANIM_MS) - (Date.now() - animEndAt));
    setTimeout(() => {
      if (r.token !== aiToken || anim.busy || aiResult !== r) return;
      aiResult = null;
      thinking = false;
      let m = E.findMove(game.state, r.move);
      if (!m) { // phòng hờ: không bao giờ để máy đi sai luật
        const ms = legal();
        m = ms[(Math.random() * ms.length) | 0];
      }
      previewAi(m);
    }, wait);
  }

  // Cho người chơi thấy máy chọn quân nào, đi đường nào trước khi đi
  function previewAi(m) {
    const token = aiToken;
    aiPreview = m;
    render();
    const ms = settings.speed === 'off' ? 150 : reduceMotion.matches ? 350 : Math.max(450, SPEED[settings.speed] * 2.4);
    setTimeout(() => {
      if (token !== aiToken) return;
      aiPreview = null;
      commitMove(m);
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
    for (let i = 0; i < game.moves.length; i++) if (moverOf(i) === game.human) n++;
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
    do {
      game.moves.pop();
    } while (game.mode === 'ai' && game.moves.length > 0 && moverOf(game.moves.length) !== game.human);
    rebuild(game);
    sel = null;
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
    const st = stats.rules[game.rules];
    if (game.mode === 'ai') {
      const lv = st.levels[game.level];
      lv.played++;
      PN && PN.gameEnd({ mode: game.level, won: w === game.human, assisted: !!game.usedUndo });
      if (w === game.human) { lv.won++; stats.streak++; stats.best = Math.max(stats.best, stats.streak); }
      else if (w === E.DRAW) { lv.drawn++; stats.streak = 0; }
      else { lv.lost++; stats.streak = 0; }
    } else {
      st.pvp.played++;
      if (w === 0) st.pvp.p0++;
      else if (w === 1) st.pvp.p1++;
      else st.pvp.drawn++;
    }
    saveStats();
  }

  function onAnimDone() {
    animEndAt = Date.now();
    render();
    renderLog();
    if (game.state.over) {
      clearTimeout(resultTimer);
      resultTimer = setTimeout(showResult, reduceMotion.matches || settings.speed === 'off' ? 250 : 800);
    } else {
      maybePlayAi();
      autoSelect();
    }
  }

  /* ---------------- Tóm tắt cho cổng PlayNine ---------------- */
  function writeSummary() {
    const t = totals();
    const played = t.played + t.pvp;
    const level = game && game.mode === 'ai' ? game.level : settings.level;
    const lvLabel = levelLabel(level);
    let note;
    if (t.played) note = T('summary.note', { won: t.won, played: t.played, level: lvLabel });
    else if (t.pvp) note = T('summary.notePvp', { n: t.pvp });
    else note = T('summary.noteNone');
    const list = [];
    if (played) {
      list.push({ value: String(t.won), label: T('summary.won') });
      list.push({ value: String(played), label: T('summary.played') });
      if (stats.best) list.push({ value: String(stats.best), label: T('summary.best') });
    }
    let resume = null;
    if (game && game.moves.length > 0 && !game.state.over) {
      const s = game.state;
      const ai = game.mode === 'ai';
      const turnText = ai ? (s.turn === game.human ? T('summary.turnYou') : T('summary.turnAi')) : T('summary.turnName', { name: playerName(s.turn) });
      const me = ai ? game.human : 0;
      const c1 = E.countPieces(s.board, me).total, c2 = E.countPieces(s.board, 1 - me).total;
      resume = {
        title: ai ? T('summary.titleAi', { level: levelLabel(game.level) }) : T('summary.titlePvp'),
        detail: T('summary.detail', { rules: rulesShort(game.rules), me: playerName(me), c1: T('pieces', { n: c1 }), other: playerName(1 - me), c2: T('pieces', { n: c2 }), turn: turnText }),
        pct: null,
      };
    }
    writeJSON(KEYS.summary, { v: 1, updatedAt: Date.now(), played, won: t.won, note, stats: list, resume, daily: null });
  }

  /* ================= 4. Hiệu ứng ================= */
  const anim = { busy: false, skip: false, token: 0, wake: null, move: null, side: 0, taken: new Set() };
  let view = null; // bàn đang hiển thị trong lúc hiệu ứng chạy
  let floatEl = null;

  const stepMs = () => (reduceMotion.matches && settings.speed !== 'off' ? Math.max(SPEED[settings.speed], 140) : SPEED[settings.speed]);

  function wait(ms) {
    if (anim.skip || ms <= 0) return Promise.resolve();
    return new Promise((res) => {
      const t = setTimeout(() => { anim.wake = null; res(); }, ms);
      anim.wake = () => { clearTimeout(t); anim.wake = null; res(); };
    });
  }
  function skipAnim() {
    if (!anim.busy) return;
    anim.skip = true;
    if (anim.wake) anim.wake();
  }
  function cancelAnim() {
    anim.token++;
    if (anim.busy) skipAnim();
    anim.busy = false;
    anim.taken.clear();
    view = null;
    removeFloater();
    for (const el of cellEls) el.classList.remove('fx-fade', 'taken');
  }

  // Vị trí góc trên trái của ô trong bàn (px)
  const cellPos = (sq) => ({ x: cellEls[sq].offsetLeft, y: cellEls[sq].offsetTop });
  const tr = (p) => `translate(${p.x}px, ${p.y}px)`;
  function makeFloater(v, sq) {
    removeFloater();
    floatEl = document.createElement('div');
    floatEl.className = 'floater';
    floatEl.setAttribute('aria-hidden', 'true');
    floatEl.innerHTML = pieceHtml(v);
    floatEl.style.transform = tr(cellPos(sq));
    boardEl.appendChild(floatEl);
    return floatEl;
  }
  function removeFloater() {
    if (floatEl) { floatEl.remove(); floatEl = null; }
  }
  function slide(fl, a, b, ms) {
    const pa = cellPos(a), pb = cellPos(b);
    fl.style.transform = tr(pb);
    if (anim.skip) return Promise.resolve();
    if (ms <= 0) return Promise.resolve();
    if (reduceMotion.matches || !fl.animate) return wait(ms); // giảm chuyển động: nhảy từng bước, không trượt
    fl.animate([{ transform: tr(pa) }, { transform: tr(pb) }], { duration: ms, easing: 'cubic-bezier(0.45, 0.05, 0.35, 1)' });
    return wait(ms);
  }

  async function animateMove(before, m, side) {
    const token = ++anim.token;
    anim.busy = true;
    anim.skip = settings.speed === 'off';
    anim.move = m;
    anim.side = side;
    anim.taken.clear();
    view = before;
    view[m.from] = 0;
    const step = stepMs();
    render();
    const fl = makeFloater(m.piece, m.from);
    let king = E.isKing(m.piece);
    for (let i = 1; i < m.path.length; i++) {
      if (token !== anim.token) return;
      if (anim.skip) break;
      const a = m.path[i - 1], b = m.path[i];
      const dist = Math.abs(E.rowOf(b) - E.rowOf(a));
      await slide(fl, a, b, step * (1 + 0.2 * (dist - 1))); // vua bay đi xa thì trượt lâu hơn một chút
      if (token !== anim.token) return;
      if (m.caps.length) { anim.taken.add(m.caps[i - 1]); cellEls[m.caps[i - 1]].classList.add('taken'); }
      if (m.promoteAt === i && !king) {
        king = true;
        fl.innerHTML = pieceHtml(E.kingOf(side));
        fl.firstChild.classList.add('crown-pop');
        await wait(step * 1.2);
      } else if (m.caps.length && i < m.path.length - 1) await wait(step * 0.25);
    }
    if (token !== anim.token) return;
    removeFloater();
    // Quân đứng vào ô đích, sau đó các quân bị ăn mới mờ dần và biến mất
    if (!anim.skip && m.caps.length) {
      view[m.to] = game.state.board[m.to];
      render();
      for (const c of m.caps) cellEls[c].classList.add('fx-fade');
      await wait(Math.max(300, step * 1.4));
      if (token !== anim.token) return;
    }
    for (const c of m.caps) cellEls[c].classList.remove('fx-fade', 'taken');
    anim.busy = false;
    anim.skip = false;
    anim.taken.clear();
    view = null;
    onAnimDone();
  }

  /* ================= 5. Render ================= */
  const boardEl = $('board');
  const cellEls = [];
  const pieceEls = [];
  let pathsEl = null;
  let focusSq = -1;
  let orientFlip = null;

  // Vị trí hiển thị của ô: hàng trên cùng màn hình là vr = 0
  const visOf = (sq) => (orientFlip ? { vr: E.rowOf(sq), vc: 7 - E.colOf(sq) } : { vr: 7 - E.rowOf(sq), vc: E.colOf(sq) });
  const sqAtVis = (vr, vc) => (orientFlip ? vr * 8 + (7 - vc) : (7 - vr) * 8 + vc);
  const pieceHtml = (v) => (v ? `<span class="pc s${E.sideOfPiece(v)}${E.isKing(v) ? ' king' : ''}">${E.isKing(v) ? CROWN : ''}</span>` : '');
  const pieceName = (v) => T(E.isKing(v) ? 'sq.king' : 'sq.man', { side: SIDE_NAME[E.sideOfPiece(v)] });

  function buildBoard() {
    const frag = document.createDocumentFragment();
    for (let sq = 0; sq < 64; sq++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'sq' + (E.isDark(sq) ? ' dark' : '');
      el.dataset.sq = sq;
      el.tabIndex = -1;
      cellEls[sq] = el;
      pieceEls[sq] = null;
      frag.appendChild(el);
    }
    pathsEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    pathsEl.setAttribute('class', 'paths');
    pathsEl.setAttribute('viewBox', '0 0 8 8');
    pathsEl.setAttribute('preserveAspectRatio', 'none');
    pathsEl.setAttribute('aria-hidden', 'true');
    frag.appendChild(pathsEl);
    boardEl.appendChild(frag);
  }

  // Xếp ô theo hướng nhìn (lật bàn khi bạn cầm Trắng), ghi tọa độ ở mép trái và mép dưới
  function orient() {
    const f = flipped();
    if (orientFlip === f) return;
    orientFlip = f;
    for (let sq = 0; sq < 64; sq++) {
      const el = cellEls[sq];
      const { vr, vc } = visOf(sq);
      el.style.gridRow = String(vr + 1);
      el.style.gridColumn = String(vc + 1);
      for (const c of el.querySelectorAll('.coord')) c.remove();
      if (vc === 0) el.insertAdjacentHTML('afterbegin', `<span class="coord rank" aria-hidden="true">${E.rowOf(sq) + 1}</span>`);
      if (vr === 7) el.insertAdjacentHTML('afterbegin', `<span class="coord file" aria-hidden="true">${E.FILES[E.colOf(sq)]}</span>`);
    }
  }

  function renderPiece(sq, v) {
    const cur = pieceEls[sq];
    if (cur && +cur.dataset.v === v) return;
    if (cur) cur.remove();
    pieceEls[sq] = null;
    if (!v) return;
    cellEls[sq].insertAdjacentHTML('beforeend', pieceHtml(v));
    const el = cellEls[sq].lastElementChild;
    el.dataset.v = v;
    pieceEls[sq] = el;
  }

  function render() {
    if (!game) return;
    const s = game.state;
    const src = view || s.board;
    const canPlay = humanCanPlay();
    orient();
    boardEl.classList.toggle('locked', !canPlay);
    boardEl.classList.toggle('no-coords', !settings.coords);
    const ms = canPlay ? legal() : [];
    const must = ms.length > 0 && ms[0].caps.length > 0;
    const movable = new Set(ms.map((m) => m.from));

    // Ô đến, đường đi và quân sẽ bị ăn của quân đang chọn (hoặc nước máy vừa chọn)
    const targets = new Map(); // ô -> 'next' | 'final'
    const willCap = new Set();
    const routes = [];
    const show = aiPreview ? { from: aiPreview.from, path: [aiPreview.from], cands: [aiPreview] } : sel;
    if (show) {
      const k = show.path.length;
      for (const m of show.cands) {
        routes.push(m.path);
        if (m.path.length > k + 1 && !targets.has(m.to)) targets.set(m.to, 'final');
      }
      for (const m of show.cands) targets.set(m.path[k], aiPreview && m.path.length === k + 1 ? 'final' : 'next');
      if (aiPreview) for (let i = 1; i < aiPreview.path.length - 1; i++) targets.set(aiPreview.path[i], 'next');
      const c0 = show.cands[0];
      if (c0) for (const c of show.cands.length === 1 ? c0.caps : c0.caps.slice(0, k - 1)) willCap.add(c);
    }
    const last = !anim.busy && !aiPreview ? game.last : null;
    const lastSet = new Set(last ? last.path : []);
    const lastCaps = new Set(last ? last.caps : []);

    for (let sq = 0; sq < 64; sq++) {
      const v = src[sq];
      renderPiece(sq, v);
      const el = cellEls[sq];
      if (!E.isDark(sq)) { el.setAttribute('aria-label', T('sq.light', { sq: E.sqName(sq) })); continue; }
      const isSel = !!show && sq === show.from;
      const isMust = must && movable.has(sq);
      const tg = targets.get(sq);
      el.classList.toggle('movable', movable.has(sq));
      el.classList.toggle('must', isMust);
      el.classList.toggle('sel', isSel);
      el.classList.toggle('target', !!tg);
      el.classList.toggle('final', tg === 'final');
      el.classList.toggle('will-cap', willCap.has(sq));
      el.classList.toggle('taken', anim.taken.has(sq));
      el.classList.toggle('last', lastSet.has(sq));
      el.classList.toggle('last-cap', lastCaps.has(sq) && !v);
      let label = E.sqName(sq) + ', ' + (v ? pieceName(v) : T('sq.empty'));
      if (isSel) label += ', ' + T('sq.selected');
      if (isMust && !isSel) label += ', ' + T('sq.must');
      if (tg) label += ', ' + (tg === 'final' ? T('sq.final') : T('sq.target'));
      if (willCap.has(sq)) label += ', ' + T('sq.willCap');
      el.setAttribute('aria-label', label);
    }
    renderRoutes(routes, show && show.cands.length > 1, show ? null : last);

    // Ô nhận tiêu điểm bàn phím (một điểm dừng Tab cho cả bàn)
    if (focusSq < 0) {
      const own = ms.length ? ms[0].from : E.DARK.find((sq) => E.isOwn(s.board[sq], game.mode === 'ai' ? game.human : s.turn));
      focusSq = own != null && own >= 0 ? own : 0;
    }
    for (let sq = 0; sq < 64; sq++) cellEls[sq].tabIndex = sq === focusSq ? 0 : -1;
    renderScores(src);
    renderInfo();
  }

  // Đường đi vẽ trên lớp SVG: đường nét đứt cho nước đang chọn, nét liền mảnh cho nước vừa đi
  function renderRoutes(routes, alt, last) {
    const pt = (sq) => { const { vr, vc } = visOf(sq); return `${vc + 0.5},${vr + 0.5}`; };
    let html = '';
    for (const p of routes) html += `<polyline class="route${alt ? ' alt' : ''}" points="${p.map(pt).join(' ')}"/>`;
    if (last && (last.caps.length || Math.abs(E.rowOf(last.path[0]) - E.rowOf(last.path[1])) > 1)) {
      html += `<polyline class="route last" points="${last.path.map(pt).join(' ')}"/>`;
    }
    pathsEl.innerHTML = html;
  }

  const AVATAR = {
    human: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.2" r="4"/><path d="M4.5 20.5c.6-4 3.6-6.3 7.5-6.3s6.9 2.3 7.5 6.3z"/></svg>',
    ai: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="3.5"/><circle cx="9.3" cy="12" r="1.6" class="eye"/><circle cx="14.7" cy="12" r="1.6" class="eye"/><path d="M12 6V3.2"/><circle cx="12" cy="2.8" r="1.3"/></svg>',
  };

  function renderScores(board) {
    for (const pos of [0, 1]) {
      const side = sideAt(pos);
      const c = E.countPieces(board, side);
      const sc = $('score-' + pos);
      if (sc.textContent !== String(c.total)) {
        sc.textContent = c.total;
        sc.classList.remove('bump');
        void sc.offsetWidth; // khởi động lại hiệu ứng
        if (game.moves.length) sc.classList.add('bump');
      }
      sc.setAttribute('aria-label', T('score.left', { n: c.total }));
      const capEl = $('cap-' + pos);
      capEl.innerHTML = `<i class="mini-pc s${side}" aria-hidden="true"></i><b>${c.men}</b><i class="mini-pc s${side} king" aria-hidden="true"></i><b>${c.kings}</b>`;
      capEl.setAttribute('aria-label', T('count.men', { n: c.men }) + ', ' + T('count.kings', { n: c.kings }));
    }
  }

  function setTurnText(html) { $('turn-text').innerHTML = html; }

  function renderInfo() {
    const s = game.state;
    const ai = game.mode === 'ai';
    const lvLabel = levelLabel(game.level);
    $('mode-label').textContent = (ai ? T('mode.ai', { level: lvLabel }) : T('mode.pvp')) + ` · ${T('rulesTiny.' + game.rules)}`;
    for (const pos of [0, 1]) {
      const side = sideAt(pos);
      const card = $('player-' + pos);
      const isAi = ai && side !== game.human;
      $('avatar-' + pos).innerHTML = isAi ? AVATAR.ai : AVATAR.human;
      let sub = isAi ? T('sub.ai', { level: lvLabel, side: SIDE_NAME[side] }) : T(side === 0 ? 'sub.first' : 'sub.second', { side: SIDE_NAME[side] });
      const isThinking = thinking && isAi && s.turn === side && !anim.busy;
      if (isThinking) sub = T('sub.thinking');
      $('name-' + pos).textContent = playerName(side);
      $('sub-' + pos).textContent = sub;
      card.classList.toggle('active', !s.over && s.turn === side && !anim.busy);
      card.classList.toggle('thinking', isThinking);
      card.classList.toggle('winner', s.over && !anim.busy && s.winner === side);
    }

    const turn = $('turn');
    turn.classList.toggle('thinking', thinking && !anim.busy);
    let color = `var(--p${posOf(s.turn)})`;
    if (anim.busy && anim.move) {
      color = `var(--p${posOf(anim.side)})`;
      const mv = `<span class="mv">${E.moveText(anim.move)}</span>`;
      setTurnText(T(isYou(game, anim.side) ? 'turn.movingYou' : 'turn.moving', { name: playerName(anim.side), move: mv }) + ` <span class="skip-hint">${T('turn.skip')}</span>`);
    } else if (s.over) {
      if (s.winner === E.DRAW) { color = 'var(--muted)'; setTurnText(T('turn.draw', { reason: capFirst(endText(s.endReason)) })); }
      else {
        color = `var(--p${posOf(s.winner)})`;
        const who = ai ? (s.winner === game.human ? T('win.you') : T('win.ai')) : T('win.name', { name: playerName(s.winner) });
        setTurnText(T('turn.over', { who, loser: playerName(1 - s.winner), reason: endText(s.endReason) }));
      }
    } else if (aiPreview) {
      setTurnText(T('turn.aiPicks', { move: `<span class="mv">${E.moveText(aiPreview)}</span>` }));
    } else if (thinking) {
      setTurnText(`<span class="dots">${T('turn.thinking')}</span>`);
    } else if (sel) {
      const sq = `<span class="mv">${E.sqName(sel.from)}</span>`;
      if (sel.path.length > 1) setTurnText(T('turn.chain'));
      else if (sel.cands.length && sel.cands[0].caps.length) setTurnText(T('turn.selCapture', { sq }));
      else setTurnText(T('turn.selMove', { sq }));
    } else {
      const ms = legal();
      const must = ms.length && ms[0].caps.length;
      const who = ai ? T('turn.you') : T('turn.name', { name: playerName(s.turn), side: SIDE_NAME[s.turn] });
      setTurnText(who + (must ? T('turn.must') : ai ? T('turn.tapPiece') : ''));
    }
    turn.style.setProperty('--turn-c', color);
    $('btn-undo').disabled = !canUndo();
  }
  const capFirst = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  function renderLog() {
    const list = $('log');
    const items = game.log;
    let n = 0;
    const rows = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.info) n++;
      const p = it.p >= 0 ? posOf(it.p) : -1;
      rows.push(`<li class="log-item${it.info ? ' info' : ''}${it.big ? ' big' : ''}" data-p="${p}">` +
        (it.info ? '<span class="log-n" aria-hidden="true">·</span>' : `<span class="log-n">${n}</span>`) +
        `<span class="log-text">${it.text}</span></li>`);
    }
    list.innerHTML = rows.length ? rows.slice(-200).reverse().join('') : `<li class="log-empty">${T('log.empty')}</li>`;
    list.scrollTop = 0;
  }

  /* ---------------- Bàn phím trên bàn ---------------- */
  function setFocus(sq, focus) {
    if (cellEls[focusSq]) cellEls[focusSq].tabIndex = -1;
    focusSq = sq;
    cellEls[sq].tabIndex = 0;
    if (focus) cellEls[sq].focus();
  }

  const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  boardEl.addEventListener('keydown', (e) => {
    const cell = e.target.closest('.sq');
    if (!cell || !game) return;
    const sq = +cell.dataset.sq;
    const d = ARROWS[e.key];
    if (d) {
      e.preventDefault();
      const { vr, vc } = visOf(sq);
      const r = Math.max(0, Math.min(7, vr + d[0])), c = Math.max(0, Math.min(7, vc + d[1]));
      setFocus(sqAtVis(r, c), true);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const { vr } = visOf(sq);
      setFocus(sqAtVis(vr, e.key === 'Home' ? 0 : 7), true);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      lastKeyAt = Date.now();
      if (anim.busy) { skipAnim(); return; }
      tapSquare(sq);
    }
  });
  // Click do trình đọc màn hình sinh ra (không qua pointer, không qua phím vừa xử lý ở trên)
  let lastKeyAt = 0;
  boardEl.addEventListener('click', (e) => {
    const cell = e.target.closest('.sq');
    if (!cell || e.detail !== 0 || Date.now() - lastKeyAt < 400) return;
    tapSquare(+cell.dataset.sq);
  });

  /* ---------------- Chạm và kéo thả ---------------- */
  let drag = null; // { sq, x, y, id, was, ghost }
  const cellAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const c = el && el.closest ? el.closest('.sq') : null;
    return c && boardEl.contains(c) ? +c.dataset.sq : -1;
  };
  boardEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const cell = e.target.closest('.sq');
    if (!cell || !game) return;
    if (anim.busy) { skipAnim(); return; }
    const sq = +cell.dataset.sq;
    setFocus(sq, false);
    const isTarget = sel && cell.classList.contains('target');
    if (humanCanPlay() && !isTarget && movesFrom(sq).length) {
      // Quân đi được: chọn ngay, giữ con trỏ để có thể kéo thả
      const was = !!sel && sel.from === sq && sel.path.length === 1;
      if (!was) { select(sq); render(); }
      drag = { sq, x: e.clientX, y: e.clientY, id: e.pointerId, was, ghost: null };
      try { boardEl.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
      return;
    }
    tapSquare(sq);
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 7) return;
      const cell = cellEls[drag.sq];
      const g = document.createElement('div');
      g.className = 'ghost';
      g.style.setProperty('--cell', cell.offsetWidth + 'px');
      g.style.width = cell.offsetWidth + 'px';
      g.style.height = cell.offsetHeight + 'px';
      g.innerHTML = pieceHtml(game.state.board[drag.sq]);
      document.body.appendChild(g);
      cell.classList.add('lifted');
      drag.ghost = g;
    }
    drag.ghost.style.left = e.clientX + 'px';
    drag.ghost.style.top = e.clientY + 'px';
  });
  function endDrag(e, cancel) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag;
    drag = null;
    cellEls[d.sq].classList.remove('lifted');
    if (d.ghost) {
      d.ghost.remove();
      const t = cancel ? -1 : cellAt(e.clientX, e.clientY);
      if (t >= 0 && t !== d.sq && sel) {
        if (!tryTarget(t)) { toast(T('toast.badTarget')); render(); }
      }
      return;
    }
    if (!cancel && d.was) { sel = null; render(); } // chạm lại quân đang chọn: bỏ chọn
  }
  boardEl.addEventListener('pointerup', (e) => endDrag(e, false));
  boardEl.addEventListener('pointercancel', (e) => endDrag(e, true));
  boardEl.addEventListener('lostpointercapture', (e) => { if (drag && drag.ghost && e.pointerId === drag.id) endDrag(e, false); });

  // Đang đi quân: chạm bất kỳ đâu trên sân (trừ nút điều khiển) để bỏ qua hiệu ứng
  $('stage').addEventListener('pointerdown', (e) => {
    if (anim.busy && !e.target.closest('.controls, .log-box, .board')) skipAnim();
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
    if (anim.busy && (e.key === ' ' || e.key === 'Escape')) { e.preventDefault(); skipAnim(); return; }
    if (e.key === 'Escape' && sel) {
      e.preventDefault();
      sel = null;
      render();
      if (cellEls[focusSq]) cellEls[focusSq].focus();
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
  const draft = { mode: 'ai', level: 'medium', human: 0, rules: 'intl' };
  const fieldGroup = (name) => document.querySelector(`#modal-new [data-field="${name}"]`);

  function syncNewModal() {
    setSegmented(fieldGroup('mode'), draft.mode);
    setSegmented(fieldGroup('rules'), draft.rules);
    setSegmented(fieldGroup('level'), draft.level);
    setSegmented(fieldGroup('human'), draft.human);
    for (const el of document.querySelectorAll('#modal-new [data-ai-only]')) el.hidden = draft.mode !== 'ai';
    for (const el of document.querySelectorAll('#modal-new [data-pvp-only]')) el.hidden = draft.mode !== 'pvp';
    $('level-desc').textContent = T('levelDesc.' + draft.level);
    $('rules-desc').textContent = T('rulesDesc.' + draft.rules);
  }
  function openNewGame() {
    draft.mode = game ? game.mode : settings.mode;
    draft.level = game ? game.level : settings.level;
    draft.human = game && game.mode === 'ai' ? game.human : settings.human;
    draft.rules = game ? game.rules : settings.rules;
    $('new-warning').hidden = !(game && game.moves.length > 0 && !game.state.over);
    syncNewModal();
    closeModal('modal-result');
    openModal('modal-new');
  }
  bindSegmented(fieldGroup('mode'), (v) => { draft.mode = v; syncNewModal(); });
  bindSegmented(fieldGroup('rules'), (v) => { draft.rules = v; syncNewModal(); });
  bindSegmented(fieldGroup('level'), (v) => { draft.level = v; syncNewModal(); });
  bindSegmented(fieldGroup('human'), (v) => { draft.human = +v; syncNewModal(); });
  $('btn-start').addEventListener('click', () => {
    settings.mode = draft.mode;
    settings.level = draft.level;
    settings.human = draft.human;
    settings.rules = draft.rules;
    saveSettings();
    closeModal('modal-new');
    startGame({ mode: draft.mode, level: draft.level, human: draft.human, rules: draft.rules });
  });

  /* ---------------- Kết quả ---------------- */
  function showResult() {
    if (!game || !game.state.over || topModal()) return;
    const s = game.state;
    const w = s.winner;
    const ai = game.mode === 'ai';
    const lv = levelLabel(game.level);
    let title, sub, celebrate = false;
    if (w === E.DRAW) {
      title = T('result.draw');
      sub = s.endReason === 'repetition' ? T('result.drawRepetition') : T('result.drawKings');
    } else if (ai) {
      const youWin = w === game.human;
      title = youWin ? T('win.you') : T('result.aiWins');
      sub = youWin ? T('result.subWin', { level: lv, reason: endText(s.endReason) }) : T('result.subLose', { reason: endText(s.endReason) });
      celebrate = youWin;
    } else {
      title = T('win.name', { name: playerName(w) });
      sub = T('result.subPvp', { loser: playerName(1 - w), side: SIDE_NAME[1 - w], reason: endText(s.endReason) });
      celebrate = true;
    }
    $('result-mark').className = 'result-mark' + (w === E.DRAW ? ' draw' : ' p' + posOf(w));
    $('result-mark').innerHTML = w === E.DRAW ? pieceHtml(1) : pieceHtml(E.kingOf(w));
    $('result-title').textContent = title;
    $('result-sub').textContent = sub;
    $('result-score').innerHTML = [0, 1].map((pos) => {
      const side = sideAt(pos);
      const c = E.countPieces(s.board, side);
      return `<div data-p="${pos}"${w === side ? ' class="win"' : ''}><dt>${playerName(side)}</dt><dd><b>${c.total}</b><span>${T('result.pieces', { men: T('count.men', { n: c.men }), kings: T('count.kings', { n: c.kings }) })}</span></dd></div>`;
    }).join('');
    const st = stats.rules[game.rules];
    if (ai) {
      const r = st.levels[game.level];
      $('result-line').textContent = T('result.lineAi', { rules: rulesShort(game.rules), level: lv, won: r.won, lost: r.lost, d: r.drawn }) + (stats.streak > 1 ? T('result.streak', { n: stats.streak }) : '');
    } else {
      $('result-line').textContent = T('result.linePvp', { rules: rulesShort(game.rules), p0: st.pvp.p0, p1: st.pvp.p1, d: st.pvp.drawn });
    }
    $('btn-result-new').textContent = ai ? T('btn.playAgain') : T('btn.new');
    const conf = $('confetti');
    conf.innerHTML = '';
    if (celebrate && !reduceMotion.matches) {
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
  let statsRules = 'intl';
  function renderStats() {
    const t = totals();
    $('stats-won').textContent = t.won;
    $('stats-best').textContent = stats.best;
    $('stats-pvp-total').textContent = t.pvp;
    setSegmented($('stats-rules'), statsRules);
    const r = stats.rules[statsRules];
    $('stats-body').innerHTML = LEVEL_ORDER.map((k) => {
      const x = r.levels[k];
      return `<tr><td>${levelLabel(k)}</td><td>${x.played}</td><td>${x.won}</td><td>${x.lost}</td><td>${x.drawn}</td></tr>`;
    }).join('');
    const p = r.pvp;
    $('stats-pvp').textContent = p.played ? T('stats.pvpLine', { n: p.played, p0: p.p0, p1: p.p1, d: p.drawn }) : T('stats.none');
  }
  let resetTimer = 0;
  function resetConfirm(on) {
    const btn = $('btn-stats-reset');
    btn.classList.toggle('confirm', on);
    btn.textContent = on ? T('btn.resetConfirm') : T('btn.reset');
    clearTimeout(resetTimer);
    if (on) resetTimer = setTimeout(() => resetConfirm(false), 3500);
  }
  bindSegmented($('stats-rules'), (v) => { statsRules = v; renderStats(); });
  $('btn-stats').addEventListener('click', () => {
    statsRules = game ? game.rules : settings.rules;
    renderStats();
    resetConfirm(false);
    openModal('modal-stats');
  });
  $('btn-stats-reset').addEventListener('click', () => {
    if (!$('btn-stats-reset').classList.contains('confirm')) { resetConfirm(true); return; }
    stats = emptyStats();
    saveStats();
    writeSummary();
    renderStats();
    resetConfirm(false);
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
  $('set-coords').addEventListener('change', (e) => { settings.coords = e.target.checked; saveSettings(); render(); });
  $('btn-settings').addEventListener('click', () => {
    setSegmented(settingGroup('theme'), settings.theme);
    setSegmented(settingGroup('speed'), settings.speed);
    setSegmented(settingGroup('lang'), I18N.lang);
    $('set-coords').checked = settings.coords;
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
  // Vẽ một góc bàn cờ. cfg: { alt, cols: [c0, c1], rows: [r0, r1] (chỉ số 0..7, gồm hai đầu),
  //   pcs: { 'c3': 'o'|'O'|'x'|'X' }, hl: { 'd4': 'sel'|'must'|'cap'|'dot'|'ring' }, paths: [['c3', 'e5']], tags: { 'e5': 'chữ' } }
  function figure(cfg) {
    const uid = ++figId;
    const [c0, c1] = cfg.cols || [0, 7];
    const [r0, r1] = cfg.rows || [0, 7];
    const W = (c1 - c0 + 1) * 10, H = (r1 - r0 + 1) * 10;
    const X = (sq) => (E.colOf(sq) - c0) * 10 + 5;
    const Y = (sq) => (r1 - E.rowOf(sq)) * 10 + 5;
    const P = E.parseSq;
    let s = `<svg viewBox="-6 -7 ${W + 8} ${H + 13}" role="img" aria-label="${cfg.alt}">`;
    s += `<defs><marker id="ah${uid}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path class="d-arrow-head" d="M0 0L10 5L0 10z"/></marker></defs>`;
    s += `<rect class="d-frame" x="-1.4" y="-1.4" width="${W + 2.8}" height="${H + 2.8}" rx="1.6"/>`;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const sq = r * 8 + c;
        s += `<rect class="${E.isDark(sq) ? 'd-dark' : 'd-light'}" x="${X(sq) - 5}" y="${Y(sq) - 5}" width="10" height="10"/>`;
      }
      s += `<text class="d-coord" x="-3.6" y="${(r1 - r) * 10 + 6.1}">${r + 1}</text>`;
    }
    for (let c = c0; c <= c1; c++) s += `<text class="d-coord" x="${(c - c0) * 10 + 5}" y="${H + 4.6}">${E.FILES[c]}</text>`;
    const hl = cfg.hl || {};
    for (const n in hl) {
      const sq = P(n), k = hl[n];
      if (k === 'dot') s += `<circle class="d-dot" cx="${X(sq)}" cy="${Y(sq)}" r="1.7"/>`;
      if (k === 'ring') s += `<circle class="d-ring" cx="${X(sq)}" cy="${Y(sq)}" r="3.4"/>`;
    }
    for (const n in cfg.pcs || {}) {
      const sq = P(n), t = cfg.pcs[n], side = t === 'o' || t === 'O' ? 0 : 1;
      s += `<circle class="d-pc s${side}" cx="${X(sq)}" cy="${Y(sq)}" r="3.7"/>`;
      if (t === 'O' || t === 'X') s += `<path class="d-crown s${side}" transform="translate(${X(sq) - 3.1} ${Y(sq) - 3.2}) scale(0.26)" d="${CROWN_PATH}"/>`;
      else s += `<circle class="d-groove s${side}" cx="${X(sq)}" cy="${Y(sq)}" r="2.1"/>`;
    }
    for (const n in hl) {
      const sq = P(n), k = hl[n];
      if (k === 'sel' || k === 'must' || k === 'cap') s += `<circle class="d-${k}" cx="${X(sq)}" cy="${Y(sq)}" r="4.5"/>`;
    }
    for (const p of cfg.paths || []) {
      const pts = p.map(P);
      // Mũi tên dừng trước tâm ô đích một chút để không che chấm
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      const dx = X(b) - X(a), dy = Y(b) - Y(a), len = Math.hypot(dx, dy);
      let d = `M${X(pts[0])} ${Y(pts[0])}`;
      for (let i = 1; i < pts.length - 1; i++) d += `L${X(pts[i])} ${Y(pts[i])}`;
      d += `L${(X(b) - (dx / len) * 2.6).toFixed(2)} ${(Y(b) - (dy / len) * 2.6).toFixed(2)}`;
      s += `<path class="d-arrow" d="${d}" marker-end="url(#ah${uid})"/>`;
    }
    // Nhãn đặt phía trên ô; tên ô có dấu "_" phía trước thì đặt phía dưới (tránh đè mũi tên)
    for (const n in cfg.tags || {}) {
      const below = n[0] === '_';
      const sq = P(below ? n.slice(1) : n);
      s += `<text class="d-tag" x="${X(sq)}" y="${Y(sq) + (below ? 8.6 : -5.8)}">${cfg.tags[n]}</text>`;
    }
    return s + '</svg>';
  }
  const START_PCS = {};
  for (const sq of E.DARK) {
    if (E.rowOf(sq) <= 2) START_PCS[E.sqName(sq)] = 'o';
    else if (E.rowOf(sq) >= 5) START_PCS[E.sqName(sq)] = 'x';
  }
  const HELP = [
    {
      title: T('help.1.title'),
      text: T('help.1.text'),
      fig: { alt: T('help.1.alt'), pcs: START_PCS },
    },
    {
      title: T('help.2.title'),
      text: T('help.2.text'),
      fig: { alt: T('help.2.alt'), cols: [1, 6], rows: [1, 4], pcs: { d4: 'o', c3: 'o', g3: 'o' }, hl: { d4: 'sel', c5: 'dot', e5: 'dot' }, paths: [['d4', 'c5'], ['d4', 'e5']] },
    },
    {
      title: T('help.3.title'),
      text: T('help.3.text'),
      fig: { alt: T('help.3.alt'), cols: [1, 6], rows: [1, 4], pcs: { c3: 'o', d4: 'x', g5: 'o', f4: 'x' }, hl: { c3: 'must', g5: 'must', d4: 'cap', f4: 'cap', e5: 'dot', e3: 'dot' }, paths: [['c3', 'e5'], ['g5', 'e3']], tags: { e5: T('help.3.tagCap'), _e3: T('help.3.tagBack') } },
    },
    {
      title: T('help.4.title'),
      text: T('help.4.text'),
      fig: { alt: T('help.4.alt'), cols: [1, 7], rows: [1, 6], pcs: { c3: 'o', d4: 'x', f6: 'x', b6: 'x' }, hl: { c3: 'sel', d4: 'cap', f6: 'cap', e5: 'dot', g7: 'ring' }, paths: [['c3', 'e5', 'g7']], tags: { e5: '1', g7: '2' } },
    },
    {
      title: T('help.5.title'),
      text: T('help.5.text'),
      fig: { alt: T('help.5.alt'), pcs: { a1: 'O', d4: 'x', c7: 'o' }, hl: { d4: 'cap', e5: 'dot', f6: 'dot', g7: 'dot', h8: 'dot', d8: 'ring' }, paths: [['a1', 'f6'], ['c7', 'd8']], tags: { d8: T('help.5.tagCrown'), f3: T('help.5.tagFly') } },
    },
    {
      title: T('help.6.title'),
      text: T('help.6.text'),
      fig: { alt: T('help.6.alt'), cols: [0, 3], rows: [0, 3], pcs: { a3: 'x', b2: 'o', c1: 'o' }, hl: { a3: 'must' }, tags: { a3: T('help.6.tagStuck') } },
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
    render();
    renderLog();
    writeSummary();
    scheduleAi();
    autoSelect();
  } else {
    startGame({ mode: settings.mode, level: settings.level, human: settings.human, rules: settings.rules });
  }
  // Lần đầu vào game: tự mở hướng dẫn (đánh dấu đã xem ngay để chỉ hiện một lần)
  if (!settings.guideSeen) {
    settings.guideSeen = true;
    saveSettings();
    openHelp();
  }
})();
