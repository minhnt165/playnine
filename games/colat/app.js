/* =====================================================================
 * Cờ Lật - Game (chỉ chạy trong trình duyệt, cần i18n.js và engine.js nạp trước)
 *   1. Lưu trữ: cài đặt, thống kê, ván đang chơi, tóm tắt cho cổng PlayNine
 *   2. Máy nghĩ trong Web Worker (tạo từ Blob mã nguồn engine)
 *   3. Điều khiển ván: đặt quân, máy đi, mất lượt, đi lại, ván mới, kết thúc
 *   4. Hiệu ứng đặt quân, lật quân 3D lan dần, báo mất lượt, bỏ qua bằng một chạm
 *   5. Render bàn, người chơi, nhật ký, modal, hướng dẫn có hình minh họa
 * ===================================================================== */
(() => {
  'use strict';

  // Phiên bản app: tăng khi phát hành, đồng bộ với ?v= ở index.html
  const APP_VERSION = '1.0.1';
  const KEYS = {
    settings: 'playnine-colat-settings-v1',
    save: 'playnine-colat-save-v1',
    stats: 'playnine-colat-stats-v1',
    summary: 'playnine-colat-summary-v1',
  };
  const E = CoLat;
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
  const COLOR = [tr('color.0'), tr('color.1')]; // ['Black', 'White'] / ['Đen', 'Trắng']
  const COLOR_LC = [tr('colorl.0'), tr('colorl.1')]; // màu quân giữa câu
  // Thời gian lật một quân và độ trễ giữa các vòng lật lan ra (ms)
  const SPEED = {
    slow: { flip: 620, stagger: 120 },
    medium: { flip: 400, stagger: 75 },
    fast: { flip: 230, stagger: 40 },
    off: { flip: 0, stagger: 0 },
  };
  const MIN_THINK_MS = 450; // máy luôn "nghĩ" tối thiểu chừng này
  const AFTER_ANIM_MS = 260; // nghỉ một nhịp sau khi lật xong rồi máy mới đi
  const PASS_MS = 1500; // thời gian hiện thông báo mất lượt trên bàn

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  /* ================= 1. Lưu trữ ================= */
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  const DEFAULT_SETTINGS = { theme: 'auto', speed: 'medium', hints: true, mode: 'ai', level: 'medium', you: 0, guideSeen: false };
  let settings = loadSettings();

  function loadSettings() {
    const s = { ...DEFAULT_SETTINGS };
    const raw = readJSON(KEYS.settings) || {};
    if (['auto', 'light', 'dark'].includes(raw.theme)) s.theme = raw.theme;
    if (SPEED[raw.speed]) s.speed = raw.speed;
    if (typeof raw.hints === 'boolean') s.hints = raw.hints;
    if (raw.mode === 'ai' || raw.mode === 'pvp') s.mode = raw.mode;
    if (LEVELS[raw.level]) s.level = raw.level;
    if (raw.you === 0 || raw.you === 1) s.you = raw.you;
    s.guideSeen = raw.guideSeen === true;
    return s;
  }
  function saveSettings() { writeJSON(KEYS.settings, settings); }

  function emptyStats() {
    const levels = {};
    for (const lv of LEVEL_ORDER) levels[lv] = { played: 0, won: 0, lost: 0, drawn: 0 };
    return { levels, pvp: { played: 0, p0: 0, p1: 0, drawn: 0 }, streak: 0, best: 0, margin: 0 };
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
    if (raw.pvp) for (const k of ['played', 'p0', 'p1', 'drawn']) st.pvp[k] = toInt(raw.pvp[k]);
    st.streak = toInt(raw.streak);
    st.best = toInt(raw.best);
    st.margin = Math.min(64, toInt(raw.margin));
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
  // Worker được dựng từ chính mã nguồn hàm CoLatFactory (qua Blob) nên chạy được
  // cả khi mở trang bằng file://. Không tạo được worker thì tính trên luồng chính.
  const AI = {
    worker: null,
    nextId: 0,
    pending: null, // { id, cb, moves, level }
    source() {
      return 'var CoLat = (' + E.factory.toString() + ')();\n' +
        'self.onmessage = function (e) {\n' +
        '  var d = e.data;\n' +
        '  var res = CoLat.chooseMove(CoLat.fromMoves(d.moves), { level: d.level });\n' +
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
        cb(E.chooseMove(E.fromMoves(moves), { level }));
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
  // game: { mode: 'ai'|'pvp', level, you: 0|1 (màu bạn cầm khi đấu máy), moves: [], movers: [],
  //         recorded, state, log, passNote }
  // Người chơi 0 cầm Đen (đi trước), người chơi 1 cầm Trắng. Mất lượt do engine tự xử lý
  // nên danh sách nước chỉ gồm số ô; movers ghi bên đã đi từng nước để Đi lại đúng.
  let game = null;
  let thinking = false;
  let aiToken = 0;
  let aiResult = null;
  let aiPreview = -1; // ô máy vừa chọn, đang cho người chơi thấy trước khi đặt
  let resultTimer = 0;
  let animEndAt = 0;

  const aiColor = () => 1 - game.you;
  const isAiTurn = () => game && game.mode === 'ai' && !game.state.over && game.state.turn === aiColor();
  const humanCanPlay = () => game && !game.state.over && !thinking && !anim.busy && aiPreview < 0 && (game.mode === 'pvp' || game.state.turn === game.you);
  const nameOf = (g, p) => (g.mode === 'pvp' ? (p === 0 ? tr('who.p1') : tr('who.p2')) : p === g.you ? tr('who.you') : tr('who.ai'));
  const playerName = (p) => nameOf(game, p);
  const isCorner = (sq) => sq === 0 || sq === 7 || sq === 56 || sq === 63;

  function saveGame() {
    if (!game) return;
    writeJSON(KEYS.save, { v: 1, mode: game.mode, level: game.level, you: game.you, moves: game.moves, recorded: game.recorded });
  }

  function loadGame() {
    const raw = readJSON(KEYS.save);
    if (!raw || raw.v !== 1 || !Array.isArray(raw.moves)) return null;
    try {
      const g = {
        mode: raw.mode === 'pvp' ? 'pvp' : 'ai',
        level: LEVELS[raw.level] ? raw.level : 'medium',
        you: raw.you === 1 ? 1 : 0,
        moves: raw.moves.slice(),
        recorded: raw.recorded === true,
      };
      rebuild(g);
      if (g.state.over) g.recorded = true;
      return g;
    } catch (e) { return null; } // ván lưu bị hỏng: bỏ qua
  }

  // Dựng lại trạng thái + nhật ký từ danh sách nước (khôi phục, Đi lại)
  function rebuild(g) {
    const s = E.createState();
    g.log = [];
    g.movers = [];
    g.passNote = '';
    for (let i = 0; i < g.moves.length; i++) {
      const m = g.moves[i];
      if (!E.isLegal(s, m)) throw new Error('Nước không hợp lệ');
      const p = s.turn;
      const ev = [];
      E.play(s, m, ev);
      g.movers.push(p);
      g.log.push(...describe(g, p, m, ev, s));
      g.passNote = passNoteOf(g, ev);
    }
    g.state = s;
  }

  // Câu báo mất lượt: "Bên Trắng (máy) không có nước, mất lượt"
  function passText(g, q) {
    const who = g.mode === 'pvp' ? nameOf(g, q) : q === g.you ? tr('who.youLc') : tr('who.aiLc');
    return tr('pass', { color: COLOR[q], who });
  }
  function passNoteOf(g, ev) {
    const e = ev.find((x) => x.t === 'pass');
    return e ? passText(g, e.p) : '';
  }

  // Mô tả một nước cho nhật ký: "Bạn: d3, lật 1"
  function describe(g, p, m, ev, after) {
    const flips = ev.find((e) => e.t === 'flip').sqs.length;
    const out = [{ p, text: tr('log.move', { name: nameOf(g, p), sq: E.sqName(m), n: flips }) + (isCorner(m) ? tr('log.corner') : ''), big: isCorner(m) }];
    for (const e of ev) {
      if (e.t === 'pass') out.push({ p: -1, info: true, text: passText(g, e.p) });
      if (e.t === 'over') {
        const full = after.discs[0] + after.discs[1] === 64;
        out.push({ p: -1, info: true, text: (full ? tr('log.full') : tr('log.noMoves')) + tr('log.score', { a: after.discs[0], b: after.discs[1] }) });
      }
    }
    return out;
  }

  function startGame(cfg) {
    cancelAi();
    cancelAnim();
    clearTimeout(resultTimer);
    closeModal('modal-result');
    game = {
      mode: cfg.mode,
      level: cfg.level,
      you: cfg.mode === 'ai' ? cfg.you : 0,
      moves: [],
      recorded: false,
    };
    rebuild(game);
    focusSq = firstFocus();
    snapBoard();
    saveGame();
    render();
    renderLog();
    writeSummary();
    scheduleAi();
  }

  function newGameSame() {
    startGame({ mode: game.mode, level: game.level, you: game.you });
  }

  // Đi một nước (người hoặc máy): cập nhật ván ngay, hiệu ứng chạy sau
  function commitMove(m) {
    const s = game.state;
    const before = E.cloneState(s);
    const p = s.turn;
    const ev = [];
    E.play(s, m, ev);
    game.moves.push(m);
    game.movers.push(p);
    game.log.push(...describe(game, p, m, ev, s));
    game.passNote = passNoteOf(game, ev);
    if (s.over) recordResult();
    saveGame();
    writeSummary();
    animateMove(before, ev); // nhật ký cập nhật khi lật xong để không lộ kết quả trước

    // Máy bắt đầu nghĩ ngay trong lúc hiệu ứng đang chạy
    scheduleAi();
  }

  function handleCell(sq) {
    if (!game) return;
    if (anim.busy) { skipAnim(); return; }
    const s = game.state;
    if (s.over) { toast(tr('toast.over')); return; }
    if (thinking || aiPreview >= 0) { toast(tr('toast.thinking')); return; }
    if (!humanCanPlay()) return;
    if (s.board[sq] !== E.EMPTY) { toast(tr('toast.taken')); return; }
    if (!E.isLegal(s, sq)) { toast(tr('toast.noFlank', { sq: E.sqName(sq), color: COLOR_LC[1 - s.turn] })); return; }
    focusSq = sq;
    commitMove(sq);
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
      let m = r.move;
      if (!E.isLegal(game.state, m)) { // phòng hờ: không bao giờ để máy đi sai luật
        const legal = E.legalMoves(game.state);
        m = legal[(Math.random() * legal.length) | 0];
      }
      previewAi(m);
    }, wait);
  }

  // Cho người chơi thấy máy chọn ô nào trước khi đặt quân
  function previewAi(m) {
    const token = aiToken;
    aiPreview = m;
    render();
    const ms = settings.speed === 'off' ? 0 : reduceMotion.matches ? 300 : settings.speed === 'fast' ? 380 : 560;
    setTimeout(() => {
      if (token !== aiToken) return;
      aiPreview = -1;
      commitMove(m);
    }, ms);
  }

  function cancelAi() {
    aiToken++;
    aiResult = null;
    aiPreview = -1;
    if (thinking) { thinking = false; AI.cancel(); }
  }

  function humanMoveCount() {
    let n = 0;
    for (const p of game.movers) if (p === game.you) n++;
    return n;
  }
  function canUndo() {
    if (!game || game.state.over) return false;
    return game.mode === 'pvp' ? game.moves.length > 0 : humanMoveCount() > 0;
  }

  // Đi lại: ở chế độ đấu máy, gỡ nước gần nhất của bạn cùng mọi nước máy đi sau đó
  // (máy có thể đi liền nhiều nước nếu bạn mất lượt)
  function undo() {
    if (!canUndo()) return;
    cancelAi();
    cancelAnim();
    if (game.mode === 'pvp') game.moves.pop();
    else {
      for (;;) {
        game.moves.pop();
        const p = game.movers.pop();
        if (p === game.you || !game.moves.length) break;
      }
    }
    rebuild(game);
    snapBoard();
    saveGame();
    render();
    renderLog();
    writeSummary();
    toast(tr('toast.undone'));
    scheduleAi();
  }

  function recordResult() {
    if (game.recorded) return;
    game.recorded = true;
    const s = game.state;
    const w = s.winner;
    if (game.mode === 'ai') {
      const lv = stats.levels[game.level];
      lv.played++;
      if (w === game.you) {
        lv.won++;
        stats.streak++;
        stats.best = Math.max(stats.best, stats.streak);
        stats.margin = Math.max(stats.margin, s.discs[game.you] - s.discs[aiColor()]);
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

  // passMissed: có mất lượt nhưng thông báo trên bàn chưa kịp hiện đủ (tắt / bỏ qua hiệu ứng)
  function onAnimDone(passMissed) {
    animEndAt = Date.now();
    render();
    renderLog();
    if (passMissed && game.passNote) toast(game.passNote);
    if (game.state.over) {
      clearTimeout(resultTimer);
      resultTimer = setTimeout(showResult, reduceMotion.matches || settings.speed === 'off' ? 250 : 900);
    } else {
      maybePlayAi();
      followFocus();
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
      if (stats.margin) list.push({ value: '+' + stats.margin, label: tr('sum.margin') });
    }
    let resume = null;
    if (game && game.moves.length > 0 && !game.state.over) {
      const s = game.state;
      const vsAi = game.mode === 'ai';
      const turnText = vsAi ? (s.turn === game.you ? tr('sum.turnYou') : tr('sum.turnAi')) : tr('sum.turnOf', { name: playerName(s.turn) });
      resume = {
        title: vsAi ? tr('sum.titleAi', { level: LEVEL_LABEL[game.level] }) : tr('sum.titlePvp'),
        detail: tr('sum.detail', { p0: playerName(0), a: s.discs[0], p1: playerName(1), b: s.discs[1], turn: turnText }),
        pct: Math.max(0, Math.min(1, (s.discs[0] + s.discs[1] - 4) / 60)),
      };
    }
    writeJSON(KEYS.summary, { v: 1, updatedAt: Date.now(), played, won: ai.won, note, stats: list, resume });
  }

  /* ================= 4. Hiệu ứng ================= */
  const anim = { busy: false, skip: false, token: 0, wake: null };
  let view = null; // bàn đang hiển thị trong lúc hiệu ứng chạy

  const speedOf = () => (reduceMotion.matches ? SPEED.off : SPEED[settings.speed]);

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
    snapBoard();
    if (anim.wake) anim.wake();
  }
  function cancelAnim() {
    anim.token++;
    if (anim.busy) skipAnim();
    anim.busy = false;
    view = null;
    hideNotice();
  }
  // Đổi màu quân ngay lập tức (không chạy transition) trong một khung hình
  function snapBoard() {
    boardEl.classList.add('instant');
    requestAnimationFrame(() => requestAnimationFrame(() => boardEl.classList.remove('instant')));
  }

  async function animateMove(before, ev) {
    const token = ++anim.token;
    const sp = speedOf();
    anim.busy = true;
    anim.skip = settings.speed === 'off';
    view = { board: before.board.slice(), discs: before.discs.slice(), last: before.last };
    let passMissed = ev.some((e) => e.t === 'pass');
    boardEl.style.setProperty('--flip-ms', sp.flip + 'ms');
    for (const el of cellEls) { el.classList.remove('placed', 'flip'); el.style.removeProperty('--d'); }
    render();
    for (const e of ev) {
      if (token !== anim.token) return;
      if (anim.skip) break;
      if (e.t === 'place') {
        view.board[e.sq] = e.p;
        view.discs[e.p]++;
        view.last = e.sq;
        cellEls[e.sq].classList.add('placed');
        render();
        await wait(sp.flip * 0.45);
      } else if (e.t === 'flip') {
        // Lật lan dần: quân càng xa ô vừa đặt càng lật muộn
        const from = view.last;
        let maxD = 0;
        for (const sq of e.sqs) {
          const d = Math.max(Math.abs(E.rowOf(sq) - E.rowOf(from)), Math.abs(E.colOf(sq) - E.colOf(from))) - 1;
          maxD = Math.max(maxD, d);
          const el = cellEls[sq];
          el.style.setProperty('--d', d * sp.stagger + 'ms');
          el.classList.remove('flip');
          void el.offsetWidth; // khởi động lại hiệu ứng nhấc quân
          el.classList.add('flip');
          view.board[sq] = e.p;
        }
        view.discs[e.p] += e.sqs.length;
        view.discs[1 - e.p] -= e.sqs.length;
        render();
        bump(e.p);
        await wait(sp.flip + maxD * sp.stagger + 60);
      } else if (e.t === 'pass') {
        showNotice(passText(game, e.p));
        await wait(PASS_MS);
        if (!anim.skip) passMissed = false;
        hideNotice();
      }
    }
    if (token !== anim.token) return;
    if (anim.skip) snapBoard();
    anim.busy = false;
    anim.skip = false;
    view = null;
    hideNotice();
    onAnimDone(passMissed);
  }

  function bump(p) {
    const el = $('score-' + p);
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  function showNotice(text) {
    const el = $('notice');
    el.textContent = text;
    el.hidden = false;
  }
  function hideNotice() { $('notice').hidden = true; }

  /* ================= 5. Render ================= */
  const boardEl = $('board');
  const cellEls = [];
  let focusSq = 19; // d3

  function buildBoard() {
    const frag = document.createDocumentFragment();
    for (let sq = 0; sq < 64; sq++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'cell';
      el.dataset.sq = sq;
      el.tabIndex = -1;
      el.innerHTML = '<span class="dw" aria-hidden="true"><span class="disc"><i class="f fb"></i><i class="f fw"></i></span></span><span class="mk" aria-hidden="true"></span>';
      cellEls[sq] = el;
      frag.appendChild(el);
    }
    boardEl.appendChild(frag);
  }

  // Ô nhận tiêu điểm đầu tiên: nước hợp lệ đầu tiên, không có thì d3
  function firstFocus() {
    const ms = game ? E.legalMoves(game.state) : [];
    return ms.length ? ms[0] : 19;
  }

  function render() {
    if (!game) return;
    const s = game.state;
    const src = view || s;
    const canPlay = humanCanPlay();
    const legal = canPlay ? new Set(E.legalMoves(s)) : new Set();
    boardEl.dataset.turn = aiPreview >= 0 ? aiColor() : s.turn;
    boardEl.classList.toggle('can-play', canPlay);
    boardEl.classList.toggle('hints', settings.hints);
    boardEl.classList.toggle('over', s.over);
    const last = view ? view.last : s.last;
    for (let sq = 0; sq < 64; sq++) {
      const el = cellEls[sq];
      const v = src.board[sq];
      el.classList.toggle('b', v === 0);
      el.classList.toggle('w', v === 1);
      el.classList.toggle('legal', legal.has(sq));
      el.classList.toggle('last', sq === last);
      el.classList.toggle('preview', sq === aiPreview);
      el.setAttribute('aria-label', cellLabel(sq, v, legal.has(sq), sq === last));
      el.tabIndex = sq === focusSq ? 0 : -1;
    }
    renderScores(src);
    renderInfo();
  }

  function cellLabel(sq, v, isLegal, isLast) {
    let t = E.sqName(sq) + ': ';
    if (v === E.EMPTY) {
      t += tr('sq.empty');
      if (isLegal) t += tr('sq.playable', { n: E.flipsOf(game.state, sq).length });
    } else {
      t += tr('sq.disc', { color: COLOR_LC[v] });
      if (isLast) t += tr('sq.last');
    }
    return t;
  }

  const AVATAR = {
    human: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.2" r="4"/><path d="M4.5 20.5c.6-4 3.6-6.3 7.5-6.3s6.9 2.3 7.5 6.3z"/></svg>',
    ai: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="3.5"/><circle cx="9.3" cy="12" r="1.6" class="eye"/><circle cx="14.7" cy="12" r="1.6" class="eye"/><path d="M12 6V3.2"/><circle cx="12" cy="2.8" r="1.3"/></svg>',
  };

  function renderScores(src) {
    for (const p of [0, 1]) {
      const n = src.discs[p];
      $('score-' + p).textContent = n;
      $('score-' + p).setAttribute('aria-label', tr('score.label', { n, color: COLOR_LC[p] }));
    }
  }

  function setTurnText(html) { $('turn-text').innerHTML = html; }

  function renderInfo() {
    const s = game.state;
    const ai = game.mode === 'ai';
    const lvLabel = LEVEL_LABEL[game.level];
    $('mode-label').textContent = ai ? tr('mode.ai', { level: lvLabel }) : tr('mode.pvp');
    for (const p of [0, 1]) {
      const card = $('player-' + p);
      const isAi = ai && p === aiColor();
      $('avatar-' + p).innerHTML = isAi ? AVATAR.ai : AVATAR.human;
      // Thẻ hẹp chỉ hiện màu quân ("Đen"); phần trong .psub-x chỉ hiện khi màn rộng
      let sub = tr('player.sub', { color: COLOR[p], extra: isAi ? tr('player.level', { level: lvLabel }) : p === 0 ? tr('player.first') : tr('player.second') });
      const isThinking = (thinking || aiPreview >= 0) && isAi && !anim.busy;
      if (isThinking) sub = tr('player.thinking');
      $('name-' + p).textContent = playerName(p);
      $('sub-' + p).innerHTML = sub;
      card.classList.toggle('active', !s.over && s.turn === p && !anim.busy);
      card.classList.toggle('thinking', isThinking);
      card.classList.toggle('winner', s.over && !anim.busy && s.winner === p);
    }

    const turn = $('turn');
    turn.classList.toggle('thinking', thinking && !anim.busy);
    let c = s.turn;
    if (anim.busy) {
      c = game.movers.length ? game.movers[game.movers.length - 1] : 0;
      setTurnText(tr(game.mode === 'ai' && c === game.you ? 'turn.placingYou' : 'turn.placing', { name: playerName(c), sq: E.sqName(game.moves[game.moves.length - 1]) }));
    } else if (s.over) {
      const a = s.discs[0], b = s.discs[1];
      if (s.winner === E.DRAW) { c = -1; setTurnText(tr('turn.draw', { a, b })); }
      else {
        c = s.winner;
        const who = ai ? (s.winner === game.you ? tr('turn.youWin') : tr('turn.aiWins')) : tr('turn.nameWins', { name: playerName(s.winner) });
        setTurnText(tr('turn.over', { who, a, b }));
      }
    } else {
      const note = game.passNote ? `<b>${game.passNote}.</b> ` : '';
      if (aiPreview >= 0) setTurnText(tr('turn.aiPicks', { sq: E.sqName(aiPreview) }));
      else if (thinking) setTurnText(note + `<span class="dots">${tr('turn.thinking')}</span>`);
      else if (ai) setTurnText(note + (note ? tr('turn.again') : tr('turn.yours', { hint: settings.hints ? tr('turn.hintDots') : tr('turn.hintFlank', { color: COLOR_LC[1 - s.turn] }) })));
      else setTurnText(note + tr('turn.of', { name: playerName(s.turn), color: COLOR[s.turn] }));
    }
    turn.dataset.c = c;
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
    list.innerHTML = rows.length ? rows.reverse().join('') : `<li class="log-empty">${tr('log.empty')}</li>`;
    list.scrollTop = 0;
  }

  /* ---------------- Bàn phím trên bàn ---------------- */
  function setFocus(sq, focus) {
    if (cellEls[focusSq]) cellEls[focusSq].tabIndex = -1;
    focusSq = sq;
    cellEls[sq].tabIndex = 0;
    if (focus) cellEls[sq].focus();
  }
  // Đang dùng bàn phím: sau lượt máy, đưa tiêu điểm tới ô đi được nếu ô hiện tại không đi được
  function followFocus() {
    const active = document.activeElement;
    if (!active || !active.classList.contains('cell') || !humanCanPlay()) return;
    if (E.isLegal(game.state, focusSq)) return;
    const ms = E.legalMoves(game.state);
    if (ms.length) setFocus(ms[0], true);
  }

  boardEl.addEventListener('click', (e) => {
    if (Date.now() - lastSkipAt < 400) return; // chạm vừa rồi chỉ để bỏ qua hiệu ứng
    const cell = e.target.closest('.cell');
    if (!cell) { if (anim.busy) skipAnim(); return; }
    const sq = +cell.dataset.sq;
    setFocus(sq, false);
    handleCell(sq);
  });
  boardEl.addEventListener('keydown', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || !game) return;
    const sq = +cell.dataset.sq;
    let r = E.rowOf(sq), c = E.colOf(sq);
    const k = e.key;
    if (k === 'ArrowUp') r = Math.max(0, r - 1);
    else if (k === 'ArrowDown') r = Math.min(7, r + 1);
    else if (k === 'ArrowLeft') c = Math.max(0, c - 1);
    else if (k === 'ArrowRight') c = Math.min(7, c + 1);
    else if (k === 'Home') c = 0;
    else if (k === 'End') c = 7;
    else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (anim.busy) { skipAnim(); return; }
      handleCell(sq);
      return;
    } else return;
    e.preventDefault();
    setFocus(E.sqOf(r, c), true);
  });
  // Đang lật: chạm bất kỳ đâu trên sân (trừ nút điều khiển) để bỏ qua hiệu ứng
  let lastSkipAt = 0;
  $('stage').addEventListener('pointerdown', (e) => {
    if (anim.busy && !e.target.closest('.controls, .log-box')) { lastSkipAt = Date.now(); skipAnim(); }
  });

  /* ---------------- Thông báo nhanh ---------------- */
  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
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
    // Phím mũi tên khi tiêu điểm chưa ở trên bàn: đưa tiêu điểm vào bàn
    if (e.key.startsWith('Arrow') && !e.target.closest('.board, .segmented, .log')) {
      e.preventDefault();
      setFocus(focusSq, true);
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
  const draft = { mode: 'ai', level: 'medium', you: 0 };
  const fieldGroup = (name) => document.querySelector(`#modal-new [data-field="${name}"]`);

  function syncNewModal() {
    setSegmented(fieldGroup('mode'), draft.mode);
    setSegmented(fieldGroup('level'), draft.level);
    setSegmented(fieldGroup('you'), draft.you);
    for (const el of document.querySelectorAll('#modal-new [data-ai-only]')) el.hidden = draft.mode !== 'ai';
    for (const el of document.querySelectorAll('#modal-new [data-pvp-only]')) el.hidden = draft.mode !== 'pvp';
    $('level-desc').textContent = LEVEL_DESC[draft.level];
  }
  function openNewGame() {
    draft.mode = game ? game.mode : settings.mode;
    draft.level = game ? game.level : settings.level;
    draft.you = game && game.mode === 'ai' ? game.you : settings.you;
    $('new-warning').hidden = !(game && game.moves.length > 0 && !game.state.over);
    syncNewModal();
    closeModal('modal-result');
    openModal('modal-new');
  }
  bindSegmented(fieldGroup('mode'), (v) => { draft.mode = v; syncNewModal(); });
  bindSegmented(fieldGroup('level'), (v) => { draft.level = v; syncNewModal(); });
  bindSegmented(fieldGroup('you'), (v) => { draft.you = +v; syncNewModal(); });
  $('btn-start').addEventListener('click', () => {
    settings.mode = draft.mode;
    settings.level = draft.level;
    settings.you = draft.you;
    saveSettings();
    closeModal('modal-new');
    startGame({ mode: draft.mode, level: draft.level, you: draft.you });
  });

  /* ---------------- Kết quả ---------------- */
  function showResult() {
    if (!game || !game.state.over || topModal()) return;
    const s = game.state;
    const w = s.winner;
    const ai = game.mode === 'ai';
    const lv = LEVEL_LABEL[game.level];
    const diff = Math.abs(s.discs[0] - s.discs[1]);
    const full = s.discs[0] + s.discs[1] === 64;
    let title, sub, celebrate = false;
    if (w === E.DRAW) {
      title = tr('result.draw');
      sub = tr('result.drawSub');
    } else if (ai) {
      const youWin = w === game.you;
      title = youWin ? tr('result.youWin') : tr('result.aiWins');
      sub = youWin ? tr('result.youWinSub', { level: lv, n: diff }) : tr('result.youLoseSub', { n: diff });
      celebrate = youWin;
    } else {
      title = tr('result.nameWins', { name: playerName(w) });
      sub = tr('result.colorBy', { color: COLOR[w], n: diff });
      celebrate = true;
    }
    if (!full) sub = tr('result.noMoves') + sub;
    $('result-mark').className = 'result-mark' + (w === E.DRAW ? ' draw' : ' p' + w);
    $('result-mark').innerHTML = '<i></i>';
    $('result-title').textContent = title;
    $('result-sub').textContent = sub;
    $('result-score').innerHTML = [0, 1].map((p) =>
      `<div${w === p ? ' class="win"' : ''}><dt><i class="mini-disc ${p ? 'w' : 'b'}" aria-hidden="true"></i>${playerName(p)}</dt><dd><b>${s.discs[p]}</b><span>${tr('result.discs', { color: COLOR_LC[p] })}</span></dd></div>`).join('');
    if (ai) {
      const st = stats.levels[game.level];
      $('result-line').textContent = tr('result.levelLine', { level: lv, won: st.won, lost: st.lost, drawn: st.drawn }) + (stats.streak > 1 ? tr('result.streak', { n: stats.streak }) : '');
    } else {
      $('result-line').textContent = tr('result.pvpLine', { a: stats.pvp.p0, b: stats.pvp.p1, d: stats.pvp.drawn });
    }
    $('btn-result-new').textContent = ai ? tr('result.again') : tr('btn.new');
    const conf = $('confetti');
    conf.innerHTML = '';
    if (celebrate && !reduceMotion.matches) {
      const colors = ['var(--accent)', 'var(--red)', 'var(--disc-b)', 'var(--disc-w)'];
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
    $('stats-best').textContent = stats.best;
    $('stats-margin').textContent = stats.margin ? '+' + stats.margin : '0';
    $('stats-body').innerHTML = LEVEL_ORDER.map((k) => {
      const r = stats.levels[k];
      return `<tr><td>${LEVEL_LABEL[k]}</td><td>${r.played}</td><td>${r.won}</td><td>${r.lost}</td><td>${r.drawn}</td></tr>`;
    }).join('');
    const p = stats.pvp;
    $('stats-pvp').textContent = p.played ? tr('stats.pvpLine', { n: p.played, a: p.p0, b: p.p1, d: p.drawn }) : tr('stats.none');
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
  $('btn-settings').addEventListener('click', () => {
    setSegmented(settingGroup('theme'), settings.theme);
    setSegmented(settingGroup('speed'), settings.speed);
    setSegmented(settingGroup('lang'), I18N.lang);
    $('set-hints').checked = settings.hints;
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
  // Bàn minh họa 8 x 8: mỗi ô 10 đơn vị, lề khung 4, nhãn cột / hàng nằm trong lề
  const FIG_C = (sq) => [4 + E.colOf(sq) * 10 + 5, 4 + E.rowOf(sq) * 10 + 5];
  // cfg: { alt, rows: 8 dòng 'X' Đen / 'O' Trắng / '.' trống, hints: [ô], hintW, marks: { ô: 'new'|'flip'|'good'|'bad' }, lines: [[từ, tới]] }
  function figure(cfg) {
    const uid = ++figId;
    const at = (n) => E.parseSq(n);
    let s = `<svg viewBox="0 0 88 88" role="img" aria-label="${cfg.alt}">`;
    s += `<defs><marker id="ah${uid}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path class="d-arrow-head" d="M0 0L10 5L0 10z"/></marker></defs>`;
    s += '<rect class="d-frame" x="0" y="0" width="88" height="88" rx="4"/>';
    s += '<rect class="d-grid" x="3.6" y="3.6" width="80.8" height="80.8" rx="1"/>';
    for (let sq = 0; sq < 64; sq++) {
      const [x, y] = FIG_C(sq);
      s += `<rect class="d-sq" x="${x - 4.6}" y="${y - 4.6}" width="9.2" height="9.2"/>`;
    }
    for (const [x, y] of [[24, 24], [64, 24], [24, 64], [64, 64]]) s += `<circle class="d-star" cx="${x}" cy="${y}" r="0.9"/>`;
    const marks = cfg.marks || {};
    for (const n in marks) {
      const [x, y] = FIG_C(at(n));
      if (marks[n] === 'bad') s += `<rect class="d-bad" x="${x - 4.6}" y="${y - 4.6}" width="9.2" height="9.2"/>`;
    }
    cfg.rows.forEach((line, r) => {
      for (let c = 0; c < 8; c++) {
        const ch = line[c];
        if (ch !== 'X' && ch !== 'O') continue;
        const [x, y] = FIG_C(E.sqOf(r, c));
        s += `<circle class="${ch === 'X' ? 'd-b' : 'd-w'}" cx="${x}" cy="${y}" r="3.8"/>`;
      }
    });
    for (const n of cfg.hints || []) {
      const [x, y] = FIG_C(at(n));
      s += `<circle class="d-hint${cfg.hintW ? ' w' : ''}" cx="${x}" cy="${y}" r="1.3"/>`;
    }
    for (const n in marks) {
      const [x, y] = FIG_C(at(n));
      if (marks[n] === 'new') s += `<circle class="d-new" cx="${x}" cy="${y}" r="4.6"/>`;
      if (marks[n] === 'flip') s += `<circle class="d-flip" cx="${x}" cy="${y}" r="4.6"/>`;
      if (marks[n] === 'good') s += `<rect class="d-good" x="${x - 4.3}" y="${y - 4.3}" width="8.6" height="8.6" rx="1"/>`;
    }
    for (const [a, b] of cfg.lines || []) {
      const [x1, y1] = FIG_C(at(a));
      const [x2, y2] = FIG_C(at(b));
      // Rút ngắn đầu mũi tên để không đè lên quân đích
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
      const ex = x2 - (dx / len) * 4.6, ey = y2 - (dy / len) * 4.6;
      s += `<path class="d-line" d="M${x1} ${y1}L${ex.toFixed(2)} ${ey.toFixed(2)}" marker-end="url(#ah${uid})"/>`;
    }
    for (let i = 0; i < 8; i++) {
      s += `<text class="d-lab" x="${9 + i * 10}" y="2.9">${E.COLS[i]}</text>`;
      s += `<text class="d-lab" x="1.9" y="${10.1 + i * 10}">${i + 1}</text>`;
    }
    return s + '</svg>';
  }
  const E8 = '........';
  const START = [E8, E8, E8, '...OX...', '...XO...', E8, E8, E8];
  const HELP = [
    {
      title: tr('help.1.title'),
      text: tr('help.1.text'),
      fig: { alt: tr('help.1.alt'), rows: START, hints: ['d3', 'c4', 'f5', 'e6'] },
    },
    {
      title: tr('help.2.title'),
      text: tr('help.2.text'),
      fig: { alt: tr('help.2.alt'), rows: [E8, E8, '...X....', '...XX...', '...XO...', E8, E8, E8], marks: { d3: 'new', d4: 'flip' }, lines: [['d3', 'd5']] },
    },
    {
      title: tr('help.3.title'),
      text: tr('help.3.text'),
      fig: { alt: tr('help.3.alt'), rows: [E8, E8, '...X....', '...X....', '.XXXXXX.', '...X....', '...X....', E8], marks: { d5: 'new', d4: 'flip', d6: 'flip', c5: 'flip', e5: 'flip', f5: 'flip' } },
    },
    {
      title: tr('help.4.title'),
      text: tr('help.4.text'),
      fig: { alt: tr('help.4.alt'), rows: ['XXX.....', E8, E8, E8, E8, E8, '.......O', '.......X'], hints: ['h6'] },
    },
    {
      title: tr('help.5.title'),
      text: tr('help.5.text'),
      fig: { alt: tr('help.5.alt'), rows: [E8, E8, '..OXX...', '..XXOO..', '..XOXO..', '...OX...', E8, E8], marks: { a1: 'good', h1: 'good', a8: 'good', h8: 'good', b2: 'bad', g2: 'bad', b7: 'bad', g7: 'bad' } },
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
    focusSq = firstFocus();
    render();
    renderLog();
    writeSummary();
    scheduleAi();
  } else {
    startGame({ mode: settings.mode, level: settings.level, you: settings.you });
  }
  // Lần đầu vào game: tự mở hướng dẫn (đánh dấu đã xem ngay để chỉ hiện một lần)
  if (!settings.guideSeen) {
    settings.guideSeen = true;
    saveSettings();
    openHelp();
  }
})();
