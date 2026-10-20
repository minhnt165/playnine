/* =====================================================================
 * Ô Ăn Quan - Game (chỉ chạy trong trình duyệt, cần engine.js nạp trước)
 *   1. Lưu trữ: cài đặt, thống kê, ván đang chơi, tóm tắt cho cổng PlayNine
 *   2. Máy nghĩ trong Web Worker (tạo từ Blob mã nguồn engine)
 *   3. Điều khiển ván: chọn ô, chọn hướng, máy đi, đi lại, ván mới, kết thúc
 *   4. Hiệu ứng rải quân từng viên, ăn quân bay về ô điểm, bỏ qua bằng một chạm
 *   5. Render bàn, người chơi, nhật ký, modal, hướng dẫn có hình minh họa
 * ===================================================================== */
(() => {
  'use strict';

  // Phiên bản app: tăng khi phát hành, đồng bộ với ?v= ở index.html
  const APP_VERSION = '1.0.0';
  const KEYS = {
    settings: 'playnine-oanquan-settings-v1',
    save: 'playnine-oanquan-save-v1',
    stats: 'playnine-oanquan-stats-v1',
    summary: 'playnine-oanquan-summary-v1',
  };
  const E = OanQuan;
  const LEVELS = E.LEVELS;
  const LEVEL_ORDER = ['easy', 'medium', 'hard'];
  const LEVEL_DESC = {
    easy: 'Máy chỉ tính 1–2 lượt và hay chọn lệch. Hợp để làm quen luật.',
    medium: 'Máy tính trước 4 lượt đi, đối thủ vững để luyện tập.',
    hard: 'Máy tính sâu nhất có thể trong khoảng 1,5 giây mỗi nước.',
  };
  // Thời gian cho mỗi viên quân khi rải (ms)
  const SPEED = { slow: 320, medium: 180, fast: 90, off: 0 };
  const QUAN_VALUES = [5, 10, 15];
  const MIN_THINK_MS = 450; // máy luôn "nghĩ" tối thiểu chừng này
  const AFTER_ANIM_MS = 380; // nghỉ một nhịp sau khi rải xong rồi máy mới đi

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  /* ================= 1. Lưu trữ ================= */
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  const DEFAULT_SETTINGS = { theme: 'auto', speed: 'medium', quanNon: true, quanValue: 10, mode: 'ai', level: 'medium', first: 0, guideSeen: false };
  let settings = loadSettings();

  function loadSettings() {
    const s = { ...DEFAULT_SETTINGS };
    const raw = readJSON(KEYS.settings) || {};
    if (['auto', 'light', 'dark'].includes(raw.theme)) s.theme = raw.theme;
    if (SPEED[raw.speed] != null) s.speed = raw.speed;
    if (typeof raw.quanNon === 'boolean') s.quanNon = raw.quanNon;
    if (QUAN_VALUES.includes(raw.quanValue)) s.quanValue = raw.quanValue;
    if (raw.mode === 'ai' || raw.mode === 'pvp') s.mode = raw.mode;
    if (LEVELS[raw.level]) s.level = raw.level;
    if (raw.first === 0 || raw.first === 1) s.first = raw.first;
    s.guideSeen = raw.guideSeen === true;
    return s;
  }
  function saveSettings() { writeJSON(KEYS.settings, settings); }

  function emptyStats() {
    const levels = {};
    for (const lv of LEVEL_ORDER) levels[lv] = { played: 0, won: 0, lost: 0, drawn: 0 };
    return { levels, pvp: { played: 0, p0: 0, p1: 0, drawn: 0 }, streak: 0, best: 0, top: 0 };
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
    st.top = toInt(raw.top);
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
  // Worker được dựng từ chính mã nguồn hàm OanQuanFactory (qua Blob) nên chạy được
  // cả khi mở trang bằng file://. Không tạo được worker thì tính trên luồng chính.
  const AI = {
    worker: null,
    nextId: 0,
    pending: null, // { id, cb, moves, cfg, level }
    source() {
      return 'var OanQuan = (' + E.factory.toString() + ')();\n' +
        'self.onmessage = function (e) {\n' +
        '  var d = e.data;\n' +
        '  var res = OanQuan.chooseMove(OanQuan.fromMoves(d.moves, d.cfg), { level: d.level });\n' +
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
  // game: { mode: 'ai'|'pvp', level, first: 0|1, opts: { quanValue, quanNon }, moves: [], recorded, state, log, lastFx }
  // Người chơi 0 giữ hàng dưới (bạn / Người 1), người chơi 1 giữ hàng trên (máy / Người 2).
  let game = null;
  let thinking = false;
  let aiToken = 0;
  let aiResult = null;
  let selected = -1; // ô đang cầm (chờ chọn hướng)
  let resultTimer = 0;
  let animEndAt = 0;

  const cfgOf = (g) => ({ first: g.first, quanValue: g.opts.quanValue, quanNon: g.opts.quanNon });
  const moverOf = (i) => (game.first + i) % 2;
  const isAiTurn = () => game && game.mode === 'ai' && !game.state.over && game.state.turn === 1;
  const humanCanPlay = () => game && !game.state.over && !thinking && !anim.busy && !aiPreview && (game.mode === 'pvp' || game.state.turn === 0);
  const playerName = (p) => (game && game.mode === 'pvp' ? (p === 0 ? 'Người 1' : 'Người 2') : p === 0 ? 'Bạn' : 'Máy');

  // Số thứ tự ô (1..5 từ trái sang phải trên màn hình) và hướng theo màn hình
  const squareNo = (h) => E.ROW_LTR[E.ownerOf(h)].indexOf(h) + 1;
  const sideOf = (h, d) => ((E.ownerOf(h) === 0) === (d > 0) ? 'left' : 'right');
  const dirFor = (h, side) => ((E.ownerOf(h) === 0) === (side === 'left') ? 1 : -1);
  const SIDE_TEXT = { left: '← trái', right: '→ phải' };

  function saveGame() {
    if (!game) return;
    writeJSON(KEYS.save, { v: 1, mode: game.mode, level: game.level, first: game.first, opts: game.opts, moves: game.moves, recorded: game.recorded });
  }

  function loadGame() {
    const raw = readJSON(KEYS.save);
    if (!raw || raw.v !== 1 || !Array.isArray(raw.moves)) return null;
    try {
      const g = {
        mode: raw.mode === 'pvp' ? 'pvp' : 'ai',
        level: LEVELS[raw.level] ? raw.level : 'medium',
        first: raw.first === 1 ? 1 : 0,
        opts: {
          quanValue: raw.opts && QUAN_VALUES.includes(raw.opts.quanValue) ? raw.opts.quanValue : 10,
          quanNon: !(raw.opts && raw.opts.quanNon === false),
        },
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
    const s = E.createState(cfgOf(g));
    g.log = [];
    g.lastFx = null;
    for (let i = 0; i < g.moves.length; i++) {
      const m = g.moves[i];
      if (!E.isLegal(s, m)) throw new Error('Nước không hợp lệ');
      const p = s.turn;
      const ev = [];
      E.play(s, m, ev);
      g.log.push(...describe(g, p, m, ev, s));
      g.lastFx = fxOf(m, ev);
    }
    g.state = s;
  }

  // Mô tả một nước cho nhật ký: "Bạn: ô 3 → phải, ăn 7"
  function describe(g, p, m, ev, after) {
    const name = (q) => (g.mode === 'pvp' ? (q === 0 ? 'Người 1' : 'Người 2') : q === 0 ? 'Bạn' : 'Máy');
    const h = E.houseOf(m);
    let dan = 0, quan = 0, quanNon = false;
    for (const e of ev) {
      if (e.t === 'capture') { dan += e.dan; quan += e.quan; }
      if (e.t === 'stop' && e.why === 'quannon') quanNon = true;
    }
    let what;
    if (quan) what = `ăn ${quan > 1 ? quan + ' ' : ''}quan` + (dan ? ` + ${dan} dân` : '');
    else if (dan) what = `ăn ${dan}`;
    else what = quanNon ? 'gặp quan non' : 'không ăn';
    const out = [{ p, n: 0, text: `${name(p)}: ô ${squareNo(h)} ${SIDE_TEXT[sideOf(h, E.dirOf(m))]}, ${what}`, big: quan > 0 }];
    for (const e of ev) {
      if (e.t === 'scatter') {
        const total = e.own + e.borrow;
        out.push({ p: e.p, info: true, text: `${name(e.p)} hết dân, rải lại ${total} quân` + (e.borrow ? ` (vay ${e.borrow})` : '') });
      }
      if (e.t === 'over') {
        const a = E.score(after, 0), b = E.score(after, 1);
        out.push({ p: -1, info: true, text: (e.reason === 'stuck' ? 'Hết quân để rải' : 'Hết quan, thu quân') + ` · ${name(0)} ${a} – ${name(1)} ${b}` });
      }
    }
    return out;
  }

  // Dấu vết nước vừa đi để đánh dấu trên bàn: ô xuất phát và các ô bị ăn
  function fxOf(m, ev) {
    return { from: E.houseOf(m), caps: ev.filter((e) => e.t === 'capture').map((e) => e.h) };
  }

  function startGame(cfg) {
    cancelAi();
    cancelAnim();
    clearTimeout(resultTimer);
    closeModal('modal-result');
    game = {
      mode: cfg.mode,
      level: cfg.level,
      first: cfg.mode === 'ai' ? cfg.first : 0,
      opts: { quanValue: settings.quanValue, quanNon: settings.quanNon },
      moves: [],
      recorded: false,
    };
    rebuild(game);
    selected = -1;
    focusH = E.ROW_LTR[0][0];
    saveGame();
    render();
    renderLog();
    writeSummary();
    scheduleAi();
  }

  function newGameSame() {
    startGame({ mode: game.mode, level: game.level, first: game.first });
  }

  // Đi một nước (người hoặc máy): cập nhật ván ngay, hiệu ứng chạy sau
  function commitMove(m) {
    const s = game.state;
    const before = E.cloneState(s);
    const p = s.turn;
    const ev = [];
    E.play(s, m, ev);
    game.moves.push(m);
    game.log.push(...describe(game, p, m, ev, s));
    game.lastFx = fxOf(m, ev);
    selected = -1;
    if (s.over) recordResult();
    saveGame();
    writeSummary();
    animateMove(before, m, ev, p); // nhật ký cập nhật khi rải xong để không lộ kết quả trước

    // Máy bắt đầu nghĩ ngay trong lúc hiệu ứng đang chạy
    scheduleAi();
  }

  function handleHouse(h) {
    if (!game) return;
    if (anim.busy) { skipAnim(); return; }
    const s = game.state;
    if (s.over) { toast('Ván đã kết thúc · bấm Ván mới để chơi tiếp'); return; }
    if (thinking || aiPreview) { toast('Máy đang nghĩ, chờ chút nhé'); return; }
    if (!humanCanPlay()) return;
    if (E.isQuan(h)) { toast('Không được bốc ô quan để rải'); return; }
    if (E.ownerOf(h) !== s.turn) {
      toast(game.mode === 'pvp' ? `Đến lượt ${playerName(s.turn)} · chọn ô ở hàng ${s.turn === 0 ? 'dưới' : 'trên'}` : 'Chọn một ô ở hàng dưới của bạn');
      return;
    }
    if (s.board[h] === 0) { toast('Ô này trống, chọn ô còn quân'); return; }
    selected = selected === h ? -1 : h;
    focusH = h;
    render();
  }

  function playDirection(side) {
    if (selected < 0 || !humanCanPlay()) return;
    const h = selected;
    const m = E.encode(h, dirFor(h, side));
    if (!E.isLegal(game.state, m)) return;
    commitMove(m);
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
      let m = r.move;
      if (!E.isLegal(game.state, m)) { // phòng hờ: không bao giờ để máy đi sai luật
        const legal = E.legalMoves(game.state);
        m = legal[(Math.random() * legal.length) | 0];
      }
      previewAi(m);
    }, wait);
  }

  // Cho người chơi thấy máy cầm ô nào, rải hướng nào trước khi rải
  let aiPreview = null;
  function previewAi(m) {
    const token = aiToken;
    aiPreview = { h: E.houseOf(m), side: sideOf(E.houseOf(m), E.dirOf(m)) };
    render();
    const ms = settings.speed === 'off' ? 0 : reduceMotion.matches ? 300 : Math.max(380, SPEED[settings.speed] * 3);
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
    cancelAi();
    cancelAnim();
    do {
      game.moves.pop();
    } while (game.mode === 'ai' && game.moves.length > 0 && moverOf(game.moves.length) !== 0);
    rebuild(game);
    selected = -1;
    saveGame();
    render();
    renderLog();
    writeSummary();
    toast('Đã đi lại');
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
      if (w === 0) { lv.won++; stats.streak++; stats.best = Math.max(stats.best, stats.streak); }
      else if (w === E.DRAW) { lv.drawn++; stats.streak = 0; }
      else { lv.lost++; stats.streak = 0; }
      stats.top = Math.max(stats.top, E.score(s, 0));
    } else {
      stats.pvp.played++;
      if (w === 0) stats.pvp.p0++;
      else if (w === 1) stats.pvp.p1++;
      else stats.pvp.drawn++;
    }
    saveStats();
  }

  function onAnimDone() {
    animEndAt = Date.now();
    render();
    renderLog();
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
    const lvLabel = LEVELS[level].label;
    let note;
    if (ai.played) note = `Thắng máy ${ai.won}/${ai.played} ván · mức ${lvLabel}`;
    else if (stats.pvp.played) note = `${stats.pvp.played} ván hai người · chưa đấu máy`;
    else note = 'Chưa chơi ván nào · thử đấu máy nhé';
    const list = [];
    if (played) {
      list.push({ value: String(ai.won), label: 'Thắng máy' });
      list.push({ value: String(played), label: 'Ván đã chơi' });
      if (stats.top) list.push({ value: String(stats.top), label: 'Điểm cao nhất' });
    }
    let resume = null;
    if (game && game.moves.length > 0 && !game.state.over) {
      const s = game.state;
      const ai2 = game.mode === 'ai';
      const turnText = ai2 ? (s.turn === 0 ? 'đến lượt bạn' : 'đến lượt máy') : `đến lượt ${playerName(s.turn)}`;
      resume = {
        title: ai2 ? `Ô Ăn Quan với máy · ${LEVELS[game.level].label}` : 'Ô Ăn Quan hai người',
        detail: `${playerName(0)} ${E.score(s, 0)} – ${playerName(1)} ${E.score(s, 1)} điểm · ${turnText}`,
        pct: null,
      };
    }
    writeJSON(KEYS.summary, { v: 1, updatedAt: Date.now(), played, won: ai.won, note, stats: list, resume, daily: null });
  }

  /* ================= 4. Hiệu ứng ================= */
  const anim = { busy: false, skip: false, token: 0, wake: null };
  let view = null; // trạng thái đang hiển thị trong lúc hiệu ứng chạy

  const stepMs = () => (reduceMotion.matches && settings.speed !== 'off' ? Math.max(SPEED[settings.speed], 120) : SPEED[settings.speed]);

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
    for (const el of document.querySelectorAll('.fly')) el.remove();
    if (anim.wake) anim.wake();
  }
  function cancelAnim() {
    anim.token++;
    if (anim.busy) skipAnim();
    anim.busy = false;
    view = null;
    hideHand();
  }

  async function animateMove(before, m, ev, p) {
    const token = ++anim.token;
    anim.busy = true;
    anim.skip = settings.speed === 'off';
    view = before;
    const step = stepMs();
    const qv = game.opts.quanValue;
    let hand = 0;
    render();
    for (const e of ev) {
      if (token !== anim.token) return;
      if (anim.skip) break;
      if (e.t === 'pick') {
        hand = e.n;
        view.board[e.h] = 0;
        renderHouse(e.h);
        flash(e.h, 'fx-pick');
        showHand(e.h, hand);
        await wait(step * 1.4);
      } else if (e.t === 'drop') {
        hand--;
        view.board[e.h]++;
        renderHouse(e.h);
        flash(e.h, 'fx-drop');
        showHand(e.h, hand);
        await wait(step);
      } else if (e.t === 'stop') {
        hideHand();
        if (e.why !== 'done') {
          flash(e.h, 'fx-stop');
          setTurnText(STOP_TEXT[e.why] || '');
          await wait(step * 2.5);
        }
      } else if (e.t === 'capture') {
        hideHand();
        flash(e.h, 'fx-cap');
        setTurnText(`<b>${playerName(p)}</b> ăn ${e.quan ? 'quan' + (e.dan ? ` + ${e.dan} dân` : '') : e.dan + ' dân'}`);
        await wait(step * 2);
        if (token !== anim.token) return;
        fly(e.h, p, e.dan + e.quan * qv, step);
        view.board[e.h] = 0;
        view.capDan[p] += e.dan;
        if (e.quan) { view.quan[e.h === E.QL ? 0 : 1] = 0; view.capQuan[p]++; }
        renderHouse(e.h);
        await wait(step * 2.2);
        renderScores(view);
      } else if (e.t === 'scatter') {
        hideHand();
        view.capDan[e.p] -= e.own;
        view.capDan[1 - e.p] -= e.borrow;
        view.debt = game.state.debt.slice();
        renderScores(view);
        setTurnText(`<b>${playerName(e.p)}</b> hết dân, rải lại ${e.own + e.borrow} quân` + (e.borrow ? ` (vay ${e.borrow})` : ''));
        await wait(step * 2);
        for (const h of e.houses) {
          if (token !== anim.token || anim.skip) break;
          view.board[h]++;
          renderHouse(h);
          flash(h, 'fx-drop');
          await wait(step * 1.5);
        }
      } else if (e.t === 'collect') {
        setTurnText('Hết quan · mỗi bên thu dân trên hàng mình');
        fly(e.h, e.p, e.n, step);
        view.board[e.h] = 0;
        view.capDan[e.p] += e.n;
        renderHouse(e.h);
        await wait(step * 1.6);
        renderScores(view);
      }
    }
    if (token !== anim.token) return;
    anim.busy = false;
    anim.skip = false;
    view = null;
    hideHand();
    onAnimDone();
  }

  const STOP_TEXT = {
    quan: 'Gặp ô quan · hết lượt',
    empty2: 'Hai ô trống liền nhau · hết lượt',
    quannon: 'Quan non (dưới 5 dân) · chưa ăn được, hết lượt',
    loop: 'Rải quá lâu · dừng lượt',
  };

  function flash(h, cls) {
    const el = houseEls[h];
    el.classList.remove(cls);
    void el.offsetWidth; // khởi động lại hiệu ứng
    el.classList.add(cls);
  }

  // Bay số quân vừa ăn về ô điểm của người chơi
  function fly(h, p, amount, step) {
    const target = $('score-' + p);
    const bump = () => { target.classList.remove('bump'); void target.offsetWidth; target.classList.add('bump'); };
    if (anim.skip || reduceMotion.matches || !amount || !document.body.animate) { bump(); return; }
    const a = houseEls[h].getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2;
    const dx = b.left + b.width / 2 - x0, dy = b.top + b.height / 2 - y0;
    const el = document.createElement('div');
    el.className = 'fly';
    el.dataset.p = p;
    el.textContent = '+' + amount;
    el.style.left = x0 + 'px';
    el.style.top = y0 + 'px';
    document.body.appendChild(el);
    const anim2 = el.animate([
      { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 1, offset: 0.25 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.85)`, opacity: 0.95 },
    ], { duration: Math.max(320, step * 2.6), easing: 'cubic-bezier(0.5, 0, 0.3, 1)' });
    anim2.onfinish = () => { el.remove(); bump(); };
  }

  /* ================= 5. Render ================= */
  const boardEl = $('board');
  const houseEls = [];
  let pickerEl = null;
  let handEl = null;
  let focusH = 11;

  // Vị trí sỏi trong ô: rải đều kiểu "ứng viên tốt nhất" có seed, cố định cho từng ô
  const MAXP = 24;
  const PEBBLE_COLORS = ['#ece5d6', '#d8cfbe', '#c2b7a4', '#d4c4a5', '#b1a899', '#e6d9c2', '#9c9488', '#cdbfa8'];
  const QUAN_H = 2.1; // chiều cao ô quan tính theo cạnh ô dân (2 ô + khe giữa)
  const layouts = [];
  function makeLayout(h) {
    const rng = E.mulberry32(1013 + h * 7919);
    const quan = E.isQuan(h);
    const w = 1, hh = quan ? QUAN_H : 1;
    const cx = h === E.QL ? 0.62 : 0.38; // tâm viên quan (phần bầu của nửa vòng tròn)
    const inside = (x, y) => {
      if (!quan) return x >= 0.17 && x <= 0.83 && y >= 0.17 && y <= 0.83;
      const ex = h === E.QL ? (x - 1) : x; // nửa elip: mép phẳng ở phía trong bàn
      const ey = (y - 0.5) * 2;
      if (ex * ex + ey * ey > 0.6) return false;
      const dx = (x - cx) * w, dy = (y - 0.5) * hh;
      return dx * dx + dy * dy > 0.32 * 0.32; // chừa chỗ cho viên quan
    };
    const pts = [];
    for (let i = 0; i < MAXP; i++) {
      let best = null, bestD = -1;
      for (let k = 0; k < 30; k++) {
        const x = rng(), y = rng();
        if (!inside(x, y)) { k--; continue; }
        let dmin = Infinity;
        for (const q of pts) {
          const dx = (x - q.x) * w, dy = (y - q.y) * hh;
          dmin = Math.min(dmin, dx * dx + dy * dy);
        }
        if (dmin > bestD) { bestD = dmin; best = { x, y }; }
      }
      best.c = PEBBLE_COLORS[(rng() * PEBBLE_COLORS.length) | 0];
      best.s = (0.88 + rng() * 0.26).toFixed(2);
      best.r = (rng() * 180) | 0;
      pts.push(best);
    }
    return pts;
  }

  function buildBoard() {
    const frag = document.createDocumentFragment();
    for (let h = 0; h < 12; h++) {
      layouts[h] = makeLayout(h);
      const quan = E.isQuan(h);
      const el = document.createElement(quan ? 'div' : 'button');
      el.className = 'house ' + (quan ? 'quan ' + (h === E.QL ? 'ql' : 'qr') : 'sq p' + E.ownerOf(h));
      el.dataset.h = h;
      if (quan) {
        el.setAttribute('role', 'img');
        el.style.gridColumn = h === E.QL ? '1' : '7';
        el.style.gridRow = '1 / span 2';
      } else {
        el.type = 'button';
        el.tabIndex = -1;
        const p = E.ownerOf(h);
        el.style.gridRow = p === 1 ? '1' : '2';
        el.style.gridColumn = String(E.ROW_LTR[p].indexOf(h) + 2);
      }
      el.innerHTML = '<span class="pebbles" aria-hidden="true"></span><span class="cnt" aria-hidden="true"></span>';
      houseEls[h] = el;
      frag.appendChild(el);
    }
    pickerEl = document.createElement('div');
    pickerEl.className = 'picker';
    pickerEl.hidden = true;
    pickerEl.innerHTML =
      '<button type="button" class="pick-btn" data-side="left" aria-label="Rải sang trái"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<button type="button" class="pick-btn" data-side="right" aria-label="Rải sang phải"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>';
    frag.appendChild(pickerEl);
    handEl = document.createElement('div');
    handEl.className = 'hand';
    handEl.hidden = true;
    handEl.setAttribute('aria-hidden', 'true');
    frag.appendChild(handEl);
    boardEl.appendChild(frag);
  }

  const shown = []; // chuỗi đã vẽ của từng ô, tránh vẽ lại
  function renderHouse(h) {
    const src = view || game.state;
    const n = src.board[h];
    const hasQuan = E.isQuan(h) && src.quan[h === E.QL ? 0 : 1] === 1;
    const key = n + (hasQuan ? 'q' : '');
    const el = houseEls[h];
    if (shown[h] !== key) {
      shown[h] = key;
      const pts = layouts[h];
      let html = hasQuan ? '<i class="qs"></i>' : '';
      for (let i = 0; i < Math.min(n, MAXP); i++) {
        const q = pts[i];
        html += `<i class="pb" style="left:${(q.x * 100).toFixed(1)}%;top:${(q.y * 100).toFixed(1)}%;--c:${q.c};--s:${q.s};--r:${q.r}deg"></i>`;
      }
      el.firstChild.innerHTML = html;
      el.lastChild.textContent = n;
      el.classList.toggle('empty', n === 0 && !hasQuan);
      el.classList.toggle('has-quan', hasQuan);
    }
    el.setAttribute('aria-label', houseLabel(h, n, hasQuan));
  }

  function houseLabel(h, n, hasQuan) {
    if (E.isQuan(h)) return `Ô quan ${h === E.QL ? 'trái' : 'phải'}: ${hasQuan ? 'còn quan, ' : 'đã mất quan, '}${n} dân`;
    const nm = playerName(E.ownerOf(h));
    let t = `Ô ${squareNo(h)} của ${nm === 'Bạn' || nm === 'Máy' ? nm.toLowerCase() : nm}: ${n} dân`;
    if (h === selected) t += '. Đang chọn, bấm mũi tên trái hoặc phải để rải';
    return t;
  }

  function render() {
    if (!game) return;
    const s = game.state;
    const canPlay = humanCanPlay();
    boardEl.dataset.turn = s.turn;
    boardEl.classList.toggle('locked', !canPlay);
    boardEl.classList.toggle('over', s.over);
    const fxl = !anim.busy && game.lastFx;
    const src = view || s;
    for (let h = 0; h < 12; h++) {
      renderHouse(h);
      const el = houseEls[h];
      if (!anim.busy) el.classList.remove('fx-pick', 'fx-drop', 'fx-cap', 'fx-stop');
      el.classList.toggle('last-from', !!fxl && fxl.from === h);
      el.classList.toggle('last-cap', !!fxl && fxl.caps.includes(h));
      if (E.isQuan(h)) continue;
      const mine = E.ownerOf(h) === s.turn;
      const playable = canPlay && mine && src.board[h] > 0;
      el.classList.toggle('playable', playable);
      el.classList.toggle('selected', h === selected || (aiPreview && aiPreview.h === h));
      el.setAttribute('aria-disabled', playable ? 'false' : 'true');
      el.setAttribute('aria-pressed', h === selected ? 'true' : 'false');
    }
    // Ô nhận tiêu điểm bàn phím: ô của bên đang đi
    const row = E.ROW_LTR[game.mode === 'ai' ? 0 : s.turn];
    if (!row.includes(focusH)) focusH = row.find((h) => s.board[h] > 0) || row[0];
    for (let h = 0; h < 12; h++) if (!E.isQuan(h)) houseEls[h].tabIndex = h === focusH ? 0 : -1;
    renderPicker();
    renderScores(src);
    renderInfo();
  }

  function placeOver(el, h) {
    const t = houseEls[h];
    el.style.left = t.offsetLeft + 'px';
    el.style.top = t.offsetTop + 'px';
    el.style.width = t.offsetWidth + 'px';
    el.style.height = t.offsetHeight + 'px';
  }

  function renderPicker() {
    const h = aiPreview ? aiPreview.h : selected;
    if (h < 0 || (!aiPreview && !humanCanPlay())) { pickerEl.hidden = true; return; }
    pickerEl.hidden = false;
    pickerEl.classList.toggle('preview', !!aiPreview);
    pickerEl.dataset.row = E.ownerOf(h);
    for (const b of pickerEl.querySelectorAll('.pick-btn')) {
      const side = b.dataset.side;
      b.hidden = !!aiPreview && aiPreview.side !== side;
      b.tabIndex = aiPreview ? -1 : 0;
      b.setAttribute('aria-label', `Rải ô ${squareNo(h)} sang ${side === 'left' ? 'trái' : 'phải'}`);
    }
    placeOver(pickerEl, h);
  }

  function showHand(h, n) {
    if (n <= 0) { hideHand(); return; }
    handEl.hidden = false;
    handEl.textContent = n;
    const t = houseEls[h];
    handEl.style.left = t.offsetLeft + t.offsetWidth / 2 + 'px';
    handEl.style.top = (E.ownerOf(h) === 0 ? t.offsetTop + t.offsetHeight : t.offsetTop) + 'px';
    handEl.dataset.row = E.ownerOf(h);
  }
  function hideHand() { if (handEl) handEl.hidden = true; }

  const AVATAR = {
    human: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.2" r="4"/><path d="M4.5 20.5c.6-4 3.6-6.3 7.5-6.3s6.9 2.3 7.5 6.3z"/></svg>',
    ai: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="3.5"/><circle cx="9.3" cy="12" r="1.6" class="eye"/><circle cx="14.7" cy="12" r="1.6" class="eye"/><path d="M12 6V3.2"/><circle cx="12" cy="2.8" r="1.3"/></svg>',
  };
  const QUAN_ICON = '<i class="mini-quan" aria-hidden="true"></i>';

  function renderScores(src) {
    for (const p of [0, 1]) {
      const sc = E.score(src, p);
      $('score-' + p).textContent = sc;
      $('score-' + p).setAttribute('aria-label', `${sc} điểm`);
      let cap = '';
      for (let i = 0; i < src.capQuan[p]; i++) cap += QUAN_ICON;
      cap += `<span class="cap-dan">${src.capDan[p]} dân</span>`;
      if (src.debt[p]) cap += `<span class="debt">nợ ${src.debt[p]}</span>`;
      const capEl = $('cap-' + p);
      capEl.innerHTML = cap;
      capEl.setAttribute('aria-label', `Đã ăn ${src.capQuan[p]} quan và ${src.capDan[p]} dân` + (src.debt[p] ? `, đang nợ ${src.debt[p]}` : ''));
    }
  }

  function setTurnText(html) { $('turn-text').innerHTML = html; }

  function renderInfo() {
    const s = game.state;
    const ai = game.mode === 'ai';
    const lvLabel = LEVELS[game.level].label;
    $('mode-label').textContent = (ai ? `Đấu máy · ${lvLabel}` : 'Hai người') + (game.opts.quanNon ? '' : ' · không quan non');
    for (const p of [0, 1]) {
      const card = $('player-' + p);
      const isAi = ai && p === 1;
      $('avatar-' + p).innerHTML = isAi ? AVATAR.ai : AVATAR.human;
      let sub;
      if (isAi) sub = `Mức ${lvLabel}`;
      else sub = (ai ? '' : p === 0 ? 'Hàng dưới · ' : 'Hàng trên · ') + (game.first === p ? 'Đi trước' : 'Đi sau');
      const isThinking = thinking && isAi && s.turn === 1 && !anim.busy;
      if (isThinking) sub = 'Đang nghĩ…';
      $('name-' + p).textContent = playerName(p);
      $('sub-' + p).textContent = sub;
      card.classList.toggle('active', !s.over && s.turn === p && !anim.busy);
      card.classList.toggle('thinking', isThinking);
      card.classList.toggle('winner', s.over && !anim.busy && s.winner === p);
    }

    const turn = $('turn');
    turn.classList.toggle('thinking', thinking && !anim.busy);
    let color = s.turn === 0 ? 'var(--p0)' : 'var(--p1)';
    if (anim.busy) {
      // Chữ trong lúc rải do animateMove cập nhật; chỉ đặt câu mặc định
      const mover = game.moves.length ? moverOf(game.moves.length - 1) : 0;
      color = mover === 0 ? 'var(--p0)' : 'var(--p1)';
      if (!turn.dataset.busy) setTurnText(`<b>${playerName(mover)}</b> đang rải quân… <span class="skip-hint">chạm để bỏ qua</span>`);
      turn.dataset.busy = '1';
    } else {
      delete turn.dataset.busy;
      if (s.over) {
        const a = E.score(s, 0), b = E.score(s, 1);
        if (s.winner === E.DRAW) { color = 'var(--muted)'; setTurnText(`<b>Hòa ${a} – ${b}.</b> Hết quan, thu quân`); }
        else {
          color = s.winner === 0 ? 'var(--p0)' : 'var(--p1)';
          const who = ai ? (s.winner === 0 ? 'Bạn thắng!' : 'Máy thắng.') : `${playerName(s.winner)} thắng!`;
          setTurnText(`<b>${who}</b> ${a} – ${b} điểm`);
        }
      } else if (aiPreview) {
        setTurnText(`<b>Máy</b> cầm ô ${squareNo(aiPreview.h)}, rải ${SIDE_TEXT[aiPreview.side]}`);
      } else if (thinking) {
        setTurnText('<span class="dots">Máy đang nghĩ</span>');
      } else if (selected >= 0) {
        setTurnText(`Ô ${squareNo(selected)} (${s.board[selected]} quân) · chọn hướng rải <b>←</b> hoặc <b>→</b>`);
      } else if (ai) {
        setTurnText('<b>Lượt của bạn</b> · chạm một ô ở hàng dưới');
      } else {
        setTurnText(`Lượt của <b>${playerName(s.turn)}</b> · chọn ô ở hàng ${s.turn === 0 ? 'dưới' : 'trên'}`);
      }
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
    list.innerHTML = rows.length ? rows.slice(-160).reverse().join('') : '<li class="log-empty">Chưa có nước đi nào.</li>';
    list.scrollTop = 0;
  }

  /* ---------------- Bàn phím trên bàn ---------------- */
  function setFocus(h, focus) {
    if (houseEls[focusH]) houseEls[focusH].tabIndex = -1;
    focusH = h;
    houseEls[h].tabIndex = 0;
    if (focus) houseEls[h].focus();
  }
  // Hai người: sau mỗi lượt, đưa tiêu điểm sang hàng của bên kế tiếp nếu đang dùng bàn phím
  function followFocus() {
    const active = document.activeElement;
    if (!active || !active.classList.contains('house')) return;
    const row = E.ROW_LTR[game.mode === 'ai' ? 0 : game.state.turn];
    if (row.includes(focusH)) return;
    setFocus(row.find((h) => game.state.board[h] > 0) || row[0], true);
  }

  boardEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.pick-btn');
    if (btn) { e.stopPropagation(); playDirection(btn.dataset.side); return; }
    if (Date.now() - lastSkipAt < 400) return; // chạm vừa rồi chỉ để bỏ qua hiệu ứng
    const house = e.target.closest('.house');
    if (!house) { if (anim.busy) skipAnim(); else if (selected >= 0) { selected = -1; render(); } return; }
    const h = +house.dataset.h;
    if (!E.isQuan(h) && game && (game.mode === 'pvp' ? E.ownerOf(h) === game.state.turn : E.ownerOf(h) === 0)) setFocus(h, false);
    handleHouse(h);
  });
  boardEl.addEventListener('keydown', (e) => {
    const house = e.target.closest('.house');
    if (!house || !game) return;
    const h = +house.dataset.h;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      const side = k === 'ArrowLeft' ? 'left' : 'right';
      if (selected === h) { playDirection(side); return; }
      const row = E.ROW_LTR[E.ownerOf(h)];
      const i = row.indexOf(h);
      const j = Math.max(0, Math.min(4, i + (side === 'left' ? -1 : 1)));
      if (selected >= 0) { selected = -1; render(); }
      setFocus(row[j], true);
    } else if (k === 'Home' || k === 'End') {
      e.preventDefault();
      const row = E.ROW_LTR[E.ownerOf(h)];
      setFocus(row[k === 'Home' ? 0 : 4], true);
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (anim.busy) { skipAnim(); return; }
      handleHouse(h);
    }
  });
  // Đang rải: chạm bất kỳ đâu trên sân (trừ nút điều khiển) để bỏ qua hiệu ứng
  let lastSkipAt = 0;
  $('stage').addEventListener('pointerdown', (e) => {
    if (anim.busy && !e.target.closest('.controls, .log-box')) { lastSkipAt = Date.now(); skipAnim(); }
  });
  window.addEventListener('resize', () => {
    if (!pickerEl.hidden) renderPicker();
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
    if (e.key === 'Escape' && selected >= 0) { e.preventDefault(); selected = -1; render(); if (houseEls[focusH]) houseEls[focusH].focus(); return; }
    // Đang cầm một ô mà tiêu điểm nằm ngoài bàn: ←/→ vẫn rải được
    if (selected >= 0 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.closest('.board, .segmented')) {
      e.preventDefault();
      playDirection(e.key === 'ArrowLeft' ? 'left' : 'right');
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
  const draft = { mode: 'ai', level: 'medium', first: 0 };
  const fieldGroup = (name) => document.querySelector(`#modal-new [data-field="${name}"]`);

  function rulesLine() {
    return `Luật: quan non ${settings.quanNon ? 'bật' : 'tắt'} · 1 quan = ${settings.quanValue} dân. Đổi trong Cài đặt.`;
  }
  function syncNewModal() {
    setSegmented(fieldGroup('mode'), draft.mode);
    setSegmented(fieldGroup('level'), draft.level);
    setSegmented(fieldGroup('first'), draft.first);
    for (const el of document.querySelectorAll('#modal-new [data-ai-only]')) el.hidden = draft.mode !== 'ai';
    for (const el of document.querySelectorAll('#modal-new [data-pvp-only]')) el.hidden = draft.mode !== 'pvp';
    $('level-desc').textContent = LEVEL_DESC[draft.level];
    $('new-rules').textContent = rulesLine();
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
    const lv = LEVELS[game.level].label;
    let title, sub, celebrate = false;
    if (w === E.DRAW) {
      title = 'Hòa';
      sub = 'Hai bên bằng điểm sau khi thu quân.';
    } else if (ai) {
      const youWin = w === 0;
      title = youWin ? 'Bạn thắng!' : 'Máy thắng';
      sub = youWin ? `Bạn hơn máy mức ${lv} ${E.score(s, 0) - E.score(s, 1)} điểm.` : `Máy hơn ${E.score(s, 1) - E.score(s, 0)} điểm. Thử lại nhé!`;
      celebrate = youWin;
    } else {
      title = `${playerName(w)} thắng!`;
      sub = `Hơn ${Math.abs(E.score(s, 0) - E.score(s, 1))} điểm.`;
      celebrate = true;
    }
    if (s.endReason === 'stuck') sub = 'Không còn quân để rải nên ván dừng. ' + sub;
    $('result-mark').className = 'result-mark' + (w === E.DRAW ? ' draw' : ' p' + w);
    $('result-mark').innerHTML = '<i class="qs big"></i>';
    $('result-title').textContent = title;
    $('result-sub').textContent = sub;
    $('result-score').innerHTML = [0, 1].map((p) => {
      const debt = s.debt[p] ? ` · trả nợ ${s.debt[p]}` : s.debt[1 - p] ? ` · được trả ${s.debt[1 - p]}` : '';
      return `<div data-p="${p}"${w === p ? ' class="win"' : ''}><dt>${playerName(p)}</dt><dd><b>${E.score(s, p)}</b><span>${s.capQuan[p]} quan · ${s.capDan[p]} dân${debt}</span></dd></div>`;
    }).join('');
    if (ai) {
      const st = stats.levels[game.level];
      $('result-line').textContent = `Mức ${lv}: thắng ${st.won} · thua ${st.lost} · hòa ${st.drawn}` + (stats.streak > 1 ? ` · chuỗi ${stats.streak} ván thắng` : '');
    } else {
      $('result-line').textContent = `Hai người: Người 1 thắng ${stats.pvp.p0} · Người 2 thắng ${stats.pvp.p1} · hòa ${stats.pvp.drawn}`;
    }
    $('btn-result-new').textContent = ai ? 'Chơi tiếp' : 'Ván mới';
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
  function renderStats() {
    const ai = aiTotals();
    $('stats-won').textContent = ai.won;
    $('stats-best').textContent = stats.best;
    $('stats-top').textContent = stats.top;
    $('stats-body').innerHTML = LEVEL_ORDER.map((k) => {
      const r = stats.levels[k];
      return `<tr><td>${LEVELS[k].label}</td><td>${r.played}</td><td>${r.won}</td><td>${r.lost}</td><td>${r.drawn}</td></tr>`;
    }).join('');
    const p = stats.pvp;
    $('stats-pvp').textContent = p.played ? `${p.played} ván · Người 1 thắng ${p.p0} · Người 2 thắng ${p.p1} · hòa ${p.drawn}` : 'Chưa có ván nào.';
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
  const settingGroup = (name) => document.querySelector(`#modal-settings [data-setting="${name}"]`);
  bindSegmented(settingGroup('theme'), (v) => { settings.theme = v; saveSettings(); applyTheme(); });
  bindSegmented(settingGroup('speed'), (v) => { settings.speed = v; saveSettings(); });
  bindSegmented(settingGroup('quanValue'), (v) => { settings.quanValue = +v; saveSettings(); onRulesChanged(); });
  $('set-quannon').addEventListener('change', (e) => { settings.quanNon = e.target.checked; saveSettings(); onRulesChanged(); });
  // Luật mới áp dụng từ ván sau; ván hiện tại chưa đi nước nào thì áp ngay
  function onRulesChanged() {
    if (game && game.moves.length === 0 && !thinking) {
      game.opts = { quanValue: settings.quanValue, quanNon: settings.quanNon };
      rebuild(game);
      saveGame();
      render();
      toast('Đã áp dụng cho ván này');
    } else {
      toast('Luật mới áp dụng từ ván sau');
    }
  }
  $('btn-settings').addEventListener('click', () => {
    setSegmented(settingGroup('theme'), settings.theme);
    setSegmented(settingGroup('speed'), settings.speed);
    setSegmented(settingGroup('quanValue'), settings.quanValue);
    $('set-quannon').checked = settings.quanNon;
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
  // Tâm các ô trong hình minh họa (bàn 148 x 50, chừa lề trên/dưới cho nhãn)
  const FIG_C = (h) => {
    if (h === E.QL) return [15, 25];
    if (h === E.QR) return [133, 25];
    const p = E.ownerOf(h);
    return [34 + E.ROW_LTR[p].indexOf(h) * 20, p === 1 ? 15 : 35];
  };
  const DOTS = [[0, 0], [-4, -3.2], [4, 3.2], [-4, 3.6], [4, -3.4], [0, -5.6], [0, 5.6]];
  // cfg: { alt, b: [12 số dân], q: [1,1], hl: { ô: 'sel'|'own'|'cap'|'gap'|'stop'|'next' }, path: [ô...], tags: { ô: 'chữ' } }
  function figure(cfg) {
    const uid = ++figId;
    const hl = cfg.hl || {};
    const q = cfg.q || [1, 1];
    let s = `<svg viewBox="0 -8 148 66" role="img" aria-label="${cfg.alt}">`;
    s += `<defs><marker id="ah${uid}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path class="d-arrow-head" d="M0 0L10 5L0 10z"/></marker></defs>`;
    s += '<rect class="d-board" x="1.5" y="2.5" width="145" height="45" rx="22.5"/>';
    for (let h = 0; h < 12; h++) {
      const cls = 'd-house' + (hl[h] ? ' ' + hl[h] : '');
      if (h === E.QL) s += `<path class="${cls}" d="M24 6A19 19 0 0 0 24 44Z"/>`;
      else if (h === E.QR) s += `<path class="${cls}" d="M124 6A19 19 0 0 1 124 44Z"/>`;
      else { const [x, y] = FIG_C(h); s += `<rect class="${cls}" x="${x - 9}" y="${y - 9}" width="18" height="18" rx="3.5"/>`; }
    }
    for (let h = 0; h < 12; h++) {
      const [x, y] = FIG_C(h);
      const n = cfg.b[h];
      const hasQ = E.isQuan(h) && q[h === E.QL ? 0 : 1];
      const ox = E.isQuan(h) ? (h === E.QL ? 1.5 : -1.5) : 0;
      if (hasQ) s += `<circle class="d-quan" cx="${x + ox}" cy="${y}" r="4.6"/>`;
      for (let i = 0; i < Math.min(n, DOTS.length) && !hasQ; i++) s += `<circle class="d-peb" cx="${x + ox + DOTS[i][0]}" cy="${y + DOTS[i][1]}" r="1.7"/>`;
      if (hasQ) for (let i = 0; i < Math.min(n, 4); i++) s += `<circle class="d-peb" cx="${x + ox + [-1, 1, -1, 1][i] * 3.4}" cy="${y + [-1, -1, 1, 1][i] * 7.6}" r="1.6"/>`;
      // Số dân ở góc ô
      const tx = E.isQuan(h) ? x + ox : x + 6.3, ty = E.isQuan(h) ? y + (n ? 16.5 : 16.5) : E.ownerOf(h) === 1 ? y - 4.6 : y + 7.6;
      s += `<text class="d-cnt" x="${tx}" y="${ty}">${n}</text>`;
    }
    if (cfg.path && cfg.path.length > 1) {
      const pts = cfg.path.map((h) => FIG_C(h));
      let d = `M${pts[0][0]} ${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) d += `L${pts[i][0]} ${pts[i][1]}`;
      s += `<path class="d-arrow" d="${d}" marker-end="url(#ah${uid})"/>`;
    }
    for (const h in cfg.tags || {}) {
      const [x, y] = FIG_C(+h);
      const up = E.ownerOf(+h) === 1 || E.isQuan(+h);
      s += `<text class="d-tag" x="${x}" y="${up ? -2 : 55.5}">${cfg.tags[h]}</text>`;
    }
    return s + '</svg>';
  }
  // Mảng số dân theo thứ tự ô 0..11 từ hàng dưới / hàng trên (trái -> phải) và hai ô quan
  const B = (bot, top, ql, qr) => {
    const b = new Array(12).fill(0);
    for (let i = 0; i < 5; i++) { b[E.ROW_LTR[0][i]] = bot[i]; b[E.ROW_LTR[1][i]] = top[i]; }
    b[E.QL] = ql || 0;
    b[E.QR] = qr || 0;
    return b;
  };
  const HELP = [
    {
      title: 'Bàn chơi: 10 ô dân, 2 ô quan',
      text: 'Hàng dưới là <b>5 ô của bạn</b>, hàng trên của đối thủ. Mỗi ô dân có <b>5 dân</b> (1 điểm/viên). Hai ô quan hình bán nguyệt ở hai đầu, mỗi ô có <b>1 quan</b> lớn (mặc định 10 điểm).',
      fig: { alt: 'Bàn đầu ván: mỗi ô dân có 5 dân, mỗi ô quan có một viên quan lớn', b: B([5, 5, 5, 5, 5], [5, 5, 5, 5, 5]), hl: { 7: 'own', 8: 'own', 9: 'own', 10: 'own', 11: 'own' }, tags: { 9: 'hàng của bạn' } },
    },
    {
      title: 'Chọn ô và hướng rải',
      text: 'Chạm một ô có quân ở hàng của bạn rồi chọn mũi tên <b>←</b> hoặc <b>→</b>. Bốc hết quân trong ô, <b>rải mỗi ô một viên</b> theo hướng đó, đi qua ô quan cũng thả một viên.',
      fig: { alt: 'Bốc 5 quân ở ô giữa hàng dưới, rải sang phải qua ô quan phải lên hàng trên', b: B([5, 5, 0, 6, 6], [5, 5, 5, 6, 6], 0, 1), hl: { 9: 'sel' }, path: [9, 8, 7, 6, 5, 4], tags: { 9: 'bốc ô này' } },
    },
    {
      title: 'Ô kế tiếp còn quân? Rải tiếp',
      text: 'Rải xong viên cuối, nhìn <b>ô ngay sau</b>. Nếu đó là ô dân còn quân, bốc cả ô đó lên và <b>rải tiếp</b> theo cùng hướng.',
      fig: { alt: 'Viên cuối rơi vào ô 4 hàng trên, ô kế tiếp còn 5 quân nên bốc lên rải tiếp', b: B([5, 5, 0, 6, 6], [5, 5, 5, 6, 6], 0, 1), hl: { 4: 'sel', 3: 'next' }, path: [4, 3, 2], tags: { 3: 'bốc tiếp' } },
    },
    {
      title: 'Cách một ô trống là ăn',
      text: 'Nếu ô ngay sau là <b>ô trống</b> và ô kế đó có quân, bạn <b>ăn hết</b> ô đó. Sau ô vừa ăn lại là một ô trống rồi một ô có quân thì <b>ăn tiếp</b> (ăn dây). Ăn ô quan là được cả viên quan.',
      fig: { alt: 'Rải một viên, cách ô trống ăn ô quan phải, rồi ăn tiếp hai ô hàng trên', b: B([2, 0, 0, 1, 0], [1, 3, 0, 2, 0], 0, 6), hl: { 9: 'sel', 7: 'gap', 6: 'cap', 5: 'gap', 4: 'cap', 3: 'gap', 2: 'cap' }, path: [9, 8], tags: { 6: 'ăn', 4: 'ăn', 2: 'ăn' } },
    },
    {
      title: 'Khi nào hết lượt',
      text: 'Hết lượt khi ô ngay sau là <b>ô quan</b>, hoặc gặp <b>hai ô trống liền nhau</b>. Luật <b>quan non</b>: ô quan còn quan mà ít hơn 5 dân thì chưa được ăn, lượt cũng dừng.',
      fig: { alt: 'Rải một viên vào ô sát ô quan trái nên hết lượt; ô quan phải còn quan mà chỉ có 3 dân là quan non', b: B([2, 1, 0, 0, 4], [2, 0, 3, 1, 0], 2, 3), hl: { 10: 'sel', 6: 'stop', 0: 'stop' }, path: [10, 11], tags: { 0: 'hết lượt', 6: 'quan non' } },
    },
    {
      title: 'Hết dân thì rải quân · hết quan thì thu',
      text: 'Đến lượt mà 5 ô của bạn trống hết, lấy <b>5 dân đã ăn</b> rải lại mỗi ô một viên (thiếu thì <b>vay</b> đối thủ, cuối ván trả). Khi <b>cả hai ô quan hết quân</b>, mỗi bên thu dân trên hàng mình. Nhiều điểm hơn thì thắng.',
      fig: { alt: 'Hai ô quan đã hết, hàng dưới vừa rải lại mỗi ô một dân', b: B([1, 1, 1, 1, 1], [0, 2, 0, 0, 3]), q: [0, 0], hl: { 7: 'own', 8: 'own', 9: 'own', 10: 'own', 11: 'own', 0: 'gap', 6: 'gap' }, tags: { 9: 'rải lại 5 dân' } },
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
  $('btn-new').addEventListener('click', openNewGame);

  /* ================= Khởi động ================= */
  $('app-version').textContent = APP_VERSION;
  applyTheme();
  buildBoard();
  AI.start();
  const saved = loadGame();
  if (saved) {
    game = saved;
    render();
    renderLog();
    writeSummary();
    scheduleAi();
  } else {
    startGame({ mode: settings.mode, level: settings.level, first: settings.first });
    renderLog();
  }
  // Lần đầu vào game: tự mở hướng dẫn (đánh dấu đã xem ngay để chỉ hiện một lần)
  if (!settings.guideSeen) {
    settings.guideSeen = true;
    saveSettings();
    openHelp();
  }
})();
