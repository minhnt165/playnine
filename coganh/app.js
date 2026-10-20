/* =====================================================================
 * Cờ Gánh - Game (chỉ chạy trong trình duyệt, cần engine.js nạp trước)
 *   1. Lưu trữ: cài đặt, thống kê, ván đang chơi, tóm tắt cho cổng PlayNine
 *   2. Máy nghĩ trong Web Worker (tạo từ Blob mã nguồn engine)
 *   3. Điều khiển ván: chọn quân, chọn điểm đến (chạm hoặc kéo), máy đi, đi lại, ván mới
 *   4. Hiệu ứng quân trượt theo đường kẻ, quân bị ăn lật màu, bỏ qua bằng một chạm
 *   5. Render bàn, người chơi, nhật ký, modal, hướng dẫn có hình minh họa
 * ===================================================================== */
(() => {
  'use strict';

  // Phiên bản app: tăng khi phát hành, đồng bộ với ?v= ở index.html
  const APP_VERSION = '1.0.0';
  const KEYS = {
    settings: 'playnine-coganh-settings-v1',
    save: 'playnine-coganh-save-v1',
    stats: 'playnine-coganh-stats-v1',
    summary: 'playnine-coganh-summary-v1',
  };
  const E = CoGanh;
  const LEVELS = E.LEVELS;
  const LEVEL_ORDER = ['easy', 'medium', 'hard'];
  const LEVEL_DESC = {
    easy: 'Máy chỉ tính 1–2 nước và hay chọn lệch. Hợp để làm quen luật.',
    medium: 'Máy tính trước 4 nước đi, đối thủ vững để luyện tập.',
    hard: 'Máy tính sâu nhất có thể trong khoảng 1,5 giây mỗi nước.',
  };
  // Thời gian quân trượt một bước (ms); lật màu và nhịp nghỉ tính theo số này
  const SPEED = { slow: 520, medium: 320, fast: 170, off: 0 };
  const MIN_THINK_MS = 450; // máy luôn "nghĩ" tối thiểu chừng này
  const AFTER_ANIM_MS = 320; // nghỉ một nhịp sau hiệu ứng rồi máy mới đi
  const COLOR_NAME = ['đỏ', 'xanh'];

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const coord = E.coord;

  /* ================= 1. Lưu trữ ================= */
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  const DEFAULT_SETTINGS = { theme: 'auto', speed: 'medium', openRule: false, mode: 'ai', level: 'medium', first: 0, guideSeen: false };
  let settings = loadSettings();

  function loadSettings() {
    const s = { ...DEFAULT_SETTINGS };
    const raw = readJSON(KEYS.settings) || {};
    if (['auto', 'light', 'dark'].includes(raw.theme)) s.theme = raw.theme;
    if (SPEED[raw.speed] != null) s.speed = raw.speed;
    if (typeof raw.openRule === 'boolean') s.openRule = raw.openRule;
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
    return { levels, pvp: { played: 0, p0: 0, p1: 0, drawn: 0 }, streak: 0, best: 0 };
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
  // Worker được dựng từ chính mã nguồn hàm CoGanhFactory (qua Blob) nên chạy được
  // cả khi mở trang bằng file://. Không tạo được worker thì tính trên luồng chính.
  const AI = {
    worker: null,
    nextId: 0,
    pending: null, // { id, cb, moves, cfg, level }
    source() {
      return 'var CoGanh = (' + E.factory.toString() + ')();\n' +
        'self.onmessage = function (e) {\n' +
        '  var d = e.data;\n' +
        '  var res = CoGanh.chooseMove(CoGanh.fromMoves(d.moves, d.cfg), { level: d.level });\n' +
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
  // game: { mode: 'ai'|'pvp', level, first: 0|1, opts: { openRule }, moves: [], recorded,
  //         state, log, lastFx, taken: [quân bên 0 đã ăn, quân bên 1 đã ăn] }
  // Người chơi 0 cầm quân đỏ phía dưới (bạn / Người 1), người chơi 1 cầm quân xanh phía trên (máy / Người 2).
  let game = null;
  let thinking = false;
  let aiToken = 0;
  let aiResult = null;
  let aiPreview = null; // { from, to }: nước máy vừa chọn, hiện ra trước khi đi
  let selected = -1; // điểm có quân đang cầm
  let resultTimer = 0;
  let animEndAt = 0;

  const cfgOf = (g) => ({ first: g.first, openRule: g.opts.openRule });
  const moverOf = (i) => (game.first + i) % 2;
  const isAiTurn = () => game && game.mode === 'ai' && !game.state.over && game.state.turn === 1;
  const humanCanPlay = () => game && !game.state.over && !thinking && !anim.busy && !aiPreview && (game.mode === 'pvp' || game.state.turn === 0);
  const nameIn = (g, p) => (g.mode === 'pvp' ? (p === 0 ? 'Người 1' : 'Người 2') : p === 0 ? 'Bạn' : 'Máy');
  const playerName = (p) => (game ? nameIn(game, p) : p === 0 ? 'Bạn' : 'Máy');

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
        opts: { openRule: !!(raw.opts && raw.opts.openRule === true) },
        moves: raw.moves.slice(),
        recorded: raw.recorded === true,
      };
      if (g.mode === 'pvp') g.first = 0;
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
    g.taken = [0, 0];
    for (let i = 0; i < g.moves.length; i++) {
      const m = g.moves[i];
      if (!E.isLegal(s, m)) throw new Error('Nước không hợp lệ');
      const p = s.turn;
      const ev = [];
      E.play(s, m, ev);
      g.log.push(...describe(g, p, m, ev));
      g.lastFx = fxOf(m, ev);
      g.taken[p] += g.lastFx.caps.length;
    }
    g.state = s;
  }

  // Mô tả một nước cho nhật ký: "Bạn: b2 → c3, gánh 2"
  function describe(g, p, m, ev) {
    let ganh = 0, vay = 0, forced = false;
    for (const e of ev) {
      if (e.t === 'move') forced = e.forced;
      if (e.t === 'ganh') ganh += e.pts.length;
      if (e.t === 'vay') vay += e.pts.length;
    }
    let text = `${nameIn(g, p)}: ${coord(E.fromOf(m))} → ${coord(E.toOf(m))}`;
    if (forced) text += ' (bắt buộc)';
    if (ganh) text += `, gánh ${ganh}`;
    if (vay) text += `, vây ${vay}`;
    const out = [{ p, text, big: ganh + vay > 0 }];
    const over = ev.find((e) => e.t === 'over');
    if (over) out.push({ p: -1, info: true, text: overText(g, over.reason, over.winner) });
    return out;
  }

  function overText(g, reason, w) {
    if (reason === 'repeat') return 'Thế cờ lặp lại 3 lần · hòa';
    if (reason === 'quiet') return `${E.QUIET_LIMIT} nước liên tiếp không ai ăn quân · hòa`;
    const loser = nameIn(g, 1 - w);
    return `${loser} ${reason === 'wipe' ? 'hết quân' : 'hết nước đi'} · ${nameIn(g, w)} thắng`;
  }

  // Dấu vết nước vừa đi để đánh dấu trên bàn: điểm đi, điểm đến và các quân bị đổi màu
  function fxOf(m, ev) {
    const caps = [];
    for (const e of ev) if (e.t === 'ganh' || e.t === 'vay') caps.push(...e.pts);
    return { from: E.fromOf(m), to: E.toOf(m), caps };
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
      opts: { openRule: settings.openRule },
      moves: [],
      recorded: false,
    };
    rebuild(game);
    selected = -1;
    focusP = E.idx(4, 2);
    saveGame();
    render();
    renderLog();
    writeSummary();
    scheduleAi();
  }

  function newGameSame() {
    startGame({ mode: game.mode, level: game.level, first: game.first });
  }

  // Đi một nước (người hoặc máy): cập nhật ván ngay, hiệu ứng chạy sau.
  // dragged: người chơi vừa kéo quân tới nơi nên bỏ đoạn trượt
  function commitMove(m, dragged) {
    const s = game.state;
    const before = E.cloneState(s, true);
    const takenBefore = game.taken.slice();
    const p = s.turn;
    const ev = [];
    E.play(s, m, ev);
    game.moves.push(m);
    game.log.push(...describe(game, p, m, ev));
    game.lastFx = fxOf(m, ev);
    game.taken[p] += game.lastFx.caps.length;
    selected = -1;
    if (s.over) recordResult();
    saveGame();
    writeSummary();
    animateMove(before, takenBefore, ev, p, dragged); // nhật ký cập nhật khi hiệu ứng xong để không lộ kết quả trước

    // Máy bắt đầu nghĩ ngay trong lúc hiệu ứng đang chạy
    scheduleAi();
  }

  // Giá trị của từng điểm đến cho quân đang cầm: số quân ăn được nếu đi tới đó
  function destsOf(from) {
    const s = game.state;
    const out = new Map();
    for (const m of E.legalMoves(s)) {
      if (E.fromOf(m) !== from) continue;
      out.set(E.toOf(m), E.applyMove(s, m).count[s.turn] - s.count[s.turn]);
    }
    return out;
  }

  function handlePoint(i) {
    if (!game) return;
    if (anim.busy) { skipAnim(); return; }
    const s = game.state;
    if (s.over) { toast('Ván đã kết thúc · bấm Ván mới để chơi tiếp'); return; }
    if (thinking || aiPreview) { toast('Máy đang nghĩ, chờ chút nhé'); return; }
    if (!humanCanPlay()) return;
    const v = s.board[i];
    const legal = E.legalMoves(s);
    if (v === s.turn + 1) {
      if (!legal.some((m) => E.fromOf(m) === i)) {
        const forced = E.forcedMoves(s);
        if (forced.length) toast(`Luật Mở: phải đi vào ${coord(E.toOf(forced[0]))} để gánh`);
        else toast('Quân này đang bị chặn, chọn quân khác');
        if (selected >= 0) { selected = -1; render(); }
        return;
      }
      selected = selected === i ? -1 : i;
      render();
      return;
    }
    if (selected >= 0) {
      const m = E.encode(selected, i);
      if (legal.includes(m)) { commitMove(m); return; }
      toast(v === 0 ? 'Chỉ đi một bước theo đường kẻ tới điểm trống' : 'Điểm này đã có quân');
      return;
    }
    if (v === 0) toast(game.mode === 'pvp' ? `Chạm một quân ${COLOR_NAME[s.turn]} trước` : 'Chạm một quân đỏ của bạn trước');
    else toast(game.mode === 'pvp' ? `Đến lượt ${playerName(s.turn)} · quân ${COLOR_NAME[s.turn]}` : 'Đó là quân của máy · bạn cầm quân đỏ');
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

  // Cho người chơi thấy máy cầm quân nào, đi tới đâu trước khi quân trượt
  function previewAi(m) {
    const token = aiToken;
    aiPreview = { from: E.fromOf(m), to: E.toOf(m) };
    render();
    const ms = settings.speed === 'off' ? 0 : reduceMotion.matches ? 300 : Math.max(420, SPEED[settings.speed] * 1.6);
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
    const w = game.state.winner;
    if (game.mode === 'ai') {
      const lv = stats.levels[game.level];
      lv.played++;
      if (w === 0) { lv.won++; stats.streak++; stats.best = Math.max(stats.best, stats.streak); }
      else if (w === E.DRAW) { lv.drawn++; stats.streak = 0; }
      else { lv.lost++; stats.streak = 0; }
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
      if (stats.best) list.push({ value: String(stats.best), label: 'Chuỗi thắng dài nhất' });
    }
    let resume = null;
    if (game && game.moves.length > 0 && !game.state.over) {
      const s = game.state;
      const ai2 = game.mode === 'ai';
      const turnText = ai2 ? (s.turn === 0 ? 'đến lượt bạn' : 'đến lượt máy') : `đến lượt ${playerName(s.turn)}`;
      resume = {
        title: ai2 ? `Cờ Gánh với máy · ${LEVELS[game.level].label}` : 'Cờ Gánh hai người',
        detail: `${playerName(0)} ${s.count[0]} – ${playerName(1)} ${s.count[1]} quân · ${turnText}`,
        pct: null,
      };
    }
    writeJSON(KEYS.summary, { v: 1, updatedAt: Date.now(), played, won: ai.won, note, stats: list, resume, daily: null });
  }

  /* ================= 4. Hiệu ứng ================= */
  const anim = { busy: false, skip: false, token: 0, wake: null, running: new Set() };
  let view = null; // trạng thái đang hiển thị trong lúc hiệu ứng chạy
  let viewTaken = null;

  const stepMs = () => (reduceMotion.matches && settings.speed !== 'off' ? Math.max(SPEED[settings.speed], 160) : SPEED[settings.speed]);

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
    hideGhost();
    for (const a of anim.running) a.cancel();
    anim.running.clear();
    if (anim.wake) anim.wake();
  }
  function cancelAnim() {
    anim.token++;
    if (anim.busy) skipAnim();
    anim.busy = false;
    view = null;
    viewTaken = null;
    hideGhost();
  }

  async function animateMove(before, takenBefore, ev, p, dragged) {
    const token = ++anim.token;
    anim.busy = true;
    anim.skip = settings.speed === 'off';
    view = before;
    viewTaken = takenBefore;
    const step = stepMs();
    const motion = !reduceMotion.matches && !!document.body.animate;
    render();
    for (const e of ev) {
      if (token !== anim.token) return;
      if (anim.skip) break;
      if (e.t === 'move') {
        setTurnText(`<b>${playerName(p)}</b> đi ${coord(e.from)} → ${coord(e.to)}` + (e.forced ? ' (bắt buộc)' : ''));
        view.board[e.from] = 0;
        renderPoint(e.from);
        if (!dragged) {
          showGhost(p, ...pctOf(e.from));
          if (motion) play(ghostEl, [{ left: pctOf(e.from)[0] + '%', top: pctOf(e.from)[1] + '%' }, { left: pctOf(e.to)[0] + '%', top: pctOf(e.to)[1] + '%' }], { duration: step, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' });
          await wait(step);
          if (token !== anim.token) return;
        }
        hideGhost();
        view.board[e.to] = p + 1;
        renderPoint(e.to);
        pointEls[e.to].classList.add('last-to');
      } else if (e.t === 'ganh' || e.t === 'vay') {
        setTurnText(e.t === 'ganh'
          ? `<b>${playerName(p)}</b> gánh ${e.pts.map(coord).join(' và ')}`
          : `<b>${playerName(p)}</b> vây ${e.pts.length} quân`);
        for (const q of e.pts) flash(q, 'fx-cap');
        await wait(step * 1.1);
        if (token !== anim.token || anim.skip) break;
        // Lật màu: thu hẹp quân lại, đổi màu, nở ra
        const half = Math.max(90, step * 0.45);
        if (motion) for (const q of e.pts) play(pointEls[q].firstChild, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0.05)' }, { transform: 'scaleX(1)' }], { duration: half * 2, easing: 'ease-in-out' });
        await wait(half);
        if (token !== anim.token) return;
        for (const q of e.pts) { view.board[q] = p + 1; renderPoint(q); }
        view.count[p] += e.pts.length;
        view.count[1 - p] -= e.pts.length;
        viewTaken[p] += e.pts.length;
        renderScores(view);
        bump(p);
        await wait(half + step * 0.5);
      }
    }
    if (token !== anim.token) return;
    anim.busy = false;
    anim.skip = false;
    view = null;
    viewTaken = null;
    hideGhost();
    onAnimDone();
  }

  // Chạy hiệu ứng Web Animations và ghi nhớ để hủy được khi bỏ qua
  function play(el, frames, opts) {
    const a = el.animate(frames, opts);
    anim.running.add(a);
    a.onfinish = a.oncancel = () => anim.running.delete(a);
    return a;
  }

  function flash(i, cls) {
    const el = pointEls[i];
    el.classList.remove(cls);
    void el.offsetWidth; // khởi động lại hiệu ứng
    el.classList.add(cls);
  }
  function bump(p) {
    const el = $('score-' + p);
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  /* ================= 5. Render ================= */
  const boardEl = $('board');
  let gridEl = null;
  let ghostEl = null;
  let lastLineEl = null;
  let hintLineEl = null;
  const pointEls = [];
  let focusP = E.idx(4, 2);

  // Vị trí điểm i trong lưới, tính theo phần trăm
  const pctOf = (i) => [10 + 20 * E.colOf(i), 10 + 20 * E.rowOf(i)];
  // Đường kẻ trên bàn: 5 hàng, 5 cột, hai đường chéo lớn và hình thoi nối trung điểm các cạnh
  const LINES_PATH = (() => {
    let d = '';
    for (let k = 0; k < 5; k++) { const v = 10 + 20 * k; d += `M10 ${v}H90M${v} 10V90`; }
    return d + 'M10 10L90 90M90 10L10 90M50 10L10 50L50 90L90 50Z';
  })();

  function buildBoard() {
    const frag = document.createDocumentFragment();
    // Nhãn tọa độ: cột a–e dưới bàn, hàng 1–5 bên trái
    for (let k = 0; k < 5; k++) {
      const f = 0.1 + 0.2 * k;
      const col = document.createElement('span');
      col.className = 'coord';
      col.setAttribute('aria-hidden', 'true');
      col.textContent = 'abcde'[k];
      col.style.left = `calc(var(--m) + (100% - 2 * var(--m)) * ${f})`;
      col.style.top = 'calc(100% - var(--m) / 2)';
      const row = document.createElement('span');
      row.className = 'coord';
      row.setAttribute('aria-hidden', 'true');
      row.textContent = String(5 - k);
      row.style.left = 'calc(var(--m) / 2)';
      row.style.top = `calc(var(--m) + (100% - 2 * var(--m)) * ${f})`;
      frag.append(col, row);
    }
    gridEl = document.createElement('div');
    gridEl.className = 'grid';
    let knots = '';
    for (let i = 0; i < 25; i++) { const [x, y] = pctOf(i); knots += `<circle class="knot" cx="${x}" cy="${y}" r="1.2"/>`; }
    gridEl.innerHTML = `<svg class="lines" viewBox="0 0 100 100" aria-hidden="true"><path class="ln" d="${LINES_PATH}"/>${knots}` +
      '<line class="last-line" x1="0" y1="0" x2="0" y2="0"/><line class="hint-line" x1="0" y1="0" x2="0" y2="0"/></svg>';
    lastLineEl = gridEl.querySelector('.last-line');
    hintLineEl = gridEl.querySelector('.hint-line');
    for (let i = 0; i < 25; i++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pt';
      el.dataset.i = i;
      el.tabIndex = -1;
      const [x, y] = pctOf(i);
      el.style.left = x + '%';
      el.style.top = y + '%';
      el.innerHTML = '<i class="pc" aria-hidden="true"></i><b class="mk" aria-hidden="true"></b>';
      pointEls[i] = el;
      gridEl.appendChild(el);
    }
    ghostEl = document.createElement('div');
    ghostEl.className = 'ghost';
    ghostEl.hidden = true;
    ghostEl.setAttribute('aria-hidden', 'true');
    gridEl.appendChild(ghostEl);
    frag.appendChild(gridEl);
    boardEl.appendChild(frag);
  }

  function showGhost(p, x, y) {
    for (const a of anim.running) a.cancel();
    ghostEl.dataset.v = p;
    ghostEl.style.left = x + '%';
    ghostEl.style.top = y + '%';
    ghostEl.hidden = false;
  }
  function hideGhost() {
    if (!ghostEl) return;
    for (const a of anim.running) if (a.effect && a.effect.target === ghostEl) a.cancel();
    ghostEl.hidden = true;
    ghostEl.classList.remove('drag');
  }

  function setLine(el, a, b) {
    if (a < 0) { el.style.display = 'none'; return; }
    const [x1, y1] = pctOf(a), [x2, y2] = pctOf(b);
    el.setAttribute('x1', x1);
    el.setAttribute('y1', y1);
    el.setAttribute('x2', x2);
    el.setAttribute('y2', y2);
    el.style.display = '';
  }

  function renderPoint(i) {
    const src = view || game.state;
    const v = src.board[i];
    const el = pointEls[i];
    const want = v ? String(v - 1) : 'e';
    if (el.dataset.v !== want) el.dataset.v = want;
  }

  function pointLabel(i, v, gain, isDest) {
    let t = coord(i) + ': ';
    if (!v) t += 'trống';
    else {
      const p = v - 1;
      const owner = game.mode === 'pvp' ? playerName(p) : p === 0 ? 'của bạn' : 'của máy';
      t += `quân ${COLOR_NAME[p]} ${owner}`;
    }
    if (i === selected) t += ', đang chọn';
    if (isDest) t += gain > 0 ? `, đi tới đây ăn ${gain} quân` : ', đi tới đây được';
    return t;
  }

  function render() {
    if (!game) return;
    const s = game.state;
    const src = view || s;
    const canPlay = humanCanPlay();
    boardEl.classList.toggle('locked', !canPlay);
    boardEl.classList.toggle('over', s.over);
    const legal = canPlay ? E.legalMoves(s) : [];
    const movable = new Set(legal.map(E.fromOf));
    const forced = canPlay ? E.forcedMoves(s) : [];
    const forcedFrom = new Set(forced.map(E.fromOf));
    if (selected >= 0 && !movable.has(selected)) selected = -1;
    const dests = selected >= 0 ? destsOf(selected) : new Map();
    const fx = !anim.busy && game.lastFx;
    for (let i = 0; i < 25; i++) {
      renderPoint(i);
      const el = pointEls[i];
      if (!anim.busy) el.classList.remove('fx-cap');
      const isDest = dests.has(i);
      const gain = isDest ? dests.get(i) : 0;
      el.classList.toggle('movable', movable.has(i));
      el.classList.toggle('selected', i === selected);
      el.classList.toggle('forced', forcedFrom.has(i) && selected !== i);
      el.classList.toggle('dest', isDest);
      el.classList.toggle('cap', isDest && gain > 0);
      el.classList.toggle('forced-dest', isDest && forced.length > 0);
      el.classList.toggle('last-from', !!fx && fx.from === i && src.board[i] === 0);
      el.classList.toggle('last-to', !!fx && fx.to === i);
      el.classList.toggle('last-cap', !!fx && fx.caps.includes(i));
      el.classList.toggle('ai-from', !!aiPreview && aiPreview.from === i);
      el.classList.toggle('ai-to', !!aiPreview && aiPreview.to === i);
      el.lastChild.textContent = isDest && gain > 0 ? '+' + gain : '';
      el.setAttribute('aria-label', pointLabel(i, src.board[i], gain, isDest));
      el.setAttribute('aria-pressed', i === selected ? 'true' : 'false');
      el.tabIndex = i === focusP ? 0 : -1;
    }
    setLine(lastLineEl, fx ? fx.from : -1, fx ? fx.to : -1);
    setLine(hintLineEl, aiPreview ? aiPreview.from : -1, aiPreview ? aiPreview.to : -1);
    renderScores(src);
    renderInfo();
  }

  const AVATAR = {
    human: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.2" r="4"/><path d="M4.5 20.5c.6-4 3.6-6.3 7.5-6.3s6.9 2.3 7.5 6.3z"/></svg>',
    ai: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="3.5"/><circle cx="9.3" cy="12" r="1.6" class="eye"/><circle cx="14.7" cy="12" r="1.6" class="eye"/><path d="M12 6V3.2"/><circle cx="12" cy="2.8" r="1.3"/></svg>',
  };

  function renderScores(src) {
    const taken = viewTaken && src === view ? viewTaken : game.taken;
    for (const p of [0, 1]) {
      const n = src.count[p];
      $('score-' + p).textContent = n;
      $('score-' + p).setAttribute('aria-label', `${n} quân trên bàn`);
      const capEl = $('cap-' + p);
      capEl.innerHTML = `<span>ăn ${taken[p]}</span><i class="mini-piece" data-p="${p}" aria-hidden="true"></i>`;
      capEl.setAttribute('aria-label', `Đã ăn ${taken[p]} quân, quân ${COLOR_NAME[p]}`);
    }
  }

  function setTurnText(html) { $('turn-text').innerHTML = html; }

  function renderInfo() {
    const s = game.state;
    const ai = game.mode === 'ai';
    const lvLabel = LEVELS[game.level].label;
    $('mode-label').textContent = (ai ? `Đấu máy · ${lvLabel}` : 'Hai người') + (game.opts.openRule ? ' · Luật Mở' : '');
    for (const p of [0, 1]) {
      const card = $('player-' + p);
      const isAi = ai && p === 1;
      $('avatar-' + p).innerHTML = isAi ? AVATAR.ai : AVATAR.human;
      let sub;
      if (isAi) sub = `Mức ${lvLabel}`;
      else sub = `Quân ${COLOR_NAME[p]} · ` + (game.first === p ? 'đi trước' : 'đi sau');
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
      // Chữ trong lúc hiệu ứng do animateMove cập nhật; chỉ đặt câu mặc định
      const mover = game.moves.length ? moverOf(game.moves.length - 1) : 0;
      color = mover === 0 ? 'var(--p0)' : 'var(--p1)';
      if (!turn.dataset.busy) setTurnText(`<b>${playerName(mover)}</b> đang đi… <span class="skip-hint">chạm để bỏ qua</span>`);
      turn.dataset.busy = '1';
    } else {
      delete turn.dataset.busy;
      const forced = humanCanPlay() ? E.forcedMoves(s) : [];
      if (s.over) {
        const why = overText(game, s.endReason, s.winner);
        if (s.winner === E.DRAW) { color = 'var(--muted)'; setTurnText(`<b>Hòa.</b> ${why.replace(' · hòa', '')}`); }
        else {
          color = s.winner === 0 ? 'var(--p0)' : 'var(--p1)';
          const who = ai ? (s.winner === 0 ? 'Bạn thắng!' : 'Máy thắng.') : `${playerName(s.winner)} thắng!`;
          setTurnText(`<b>${who}</b> ${playerName(1 - s.winner)} ${s.endReason === 'wipe' ? 'hết quân' : 'hết nước đi'}`);
        }
      } else if (aiPreview) {
        setTurnText(`<b>Máy</b> đi ${coord(aiPreview.from)} → ${coord(aiPreview.to)}`);
      } else if (thinking) {
        setTurnText('<span class="dots">Máy đang nghĩ</span>');
      } else if (forced.length && selected < 0) {
        setTurnText(`<b>Luật Mở:</b> phải đi vào ${coord(E.toOf(forced[0]))} để gánh`);
      } else if (selected >= 0) {
        setTurnText([...destsOf(selected).values()].some((g) => g > 0) ? 'Chọn điểm đến · <b>vòng đỏ</b> là ăn được' : `Quân ${coord(selected)} · chọn điểm đến`);
      } else if (ai) {
        setTurnText('<b>Lượt của bạn</b> · chạm một quân đỏ');
      } else {
        setTurnText(`Lượt của <b>${playerName(s.turn)}</b> · quân ${COLOR_NAME[s.turn]}`);
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

  /* ---------------- Chạm, kéo thả, bàn phím trên bàn ---------------- */
  function setFocus(i, focus) {
    if (pointEls[focusP]) pointEls[focusP].tabIndex = -1;
    focusP = i;
    pointEls[i].tabIndex = 0;
    if (focus) pointEls[i].focus();
  }

  let lastSkipAt = 0;
  let lastDragAt = 0;
  boardEl.addEventListener('click', (e) => {
    if (Date.now() - lastSkipAt < 400 || Date.now() - lastDragAt < 400) return; // chạm vừa rồi để bỏ qua hiệu ứng / vừa kéo xong
    const pt = e.target.closest('.pt');
    if (!pt) { if (anim.busy) skipAnim(); else if (selected >= 0) { selected = -1; render(); } return; }
    const i = +pt.dataset.i;
    setFocus(i, false);
    handlePoint(i);
  });

  // Kéo thả: nhấn giữ quân của mình rồi kéo tới điểm đến
  let drag = null;
  boardEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !game || !humanCanPlay()) return;
    const pt = e.target.closest('.pt');
    if (!pt) return;
    const i = +pt.dataset.i;
    if (!E.legalMoves(game.state).some((m) => E.fromOf(m) === i)) return;
    drag = { i, id: e.pointerId, x: e.clientX, y: e.clientY, on: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
      drag.on = true;
      selected = drag.i;
      render();
      pointEls[drag.i].classList.add('dragging');
      showGhost(game.state.turn, ...pctOf(drag.i));
      ghostEl.classList.add('drag');
    }
    const r = gridEl.getBoundingClientRect();
    ghostEl.style.left = ((e.clientX - r.left) / r.width) * 100 + '%';
    ghostEl.style.top = ((e.clientY - r.top) / r.height) * 100 + '%';
  });
  function endDrag(e, drop) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.on) return;
    lastDragAt = Date.now();
    hideGhost();
    pointEls[d.i].classList.remove('dragging');
    if (drop && humanCanPlay()) {
      // Điểm gần chỗ thả nhất (trong nửa khoảng cách giữa hai điểm)
      const r = gridEl.getBoundingClientRect();
      const fx = ((e.clientX - r.left) / r.width) * 100, fy = ((e.clientY - r.top) / r.height) * 100;
      const c = Math.round((fx - 10) / 20), rr = Math.round((fy - 10) / 20);
      if (c >= 0 && c < 5 && rr >= 0 && rr < 5 && Math.hypot(fx - (10 + 20 * c), fy - (10 + 20 * rr)) < 11) {
        const to = E.idx(rr, c);
        const m = E.encode(d.i, to);
        if (E.isLegal(game.state, m)) { setFocus(to, false); commitMove(m, true); return; }
        if (to !== d.i) toast('Chỉ đi một bước theo đường kẻ tới điểm trống');
      }
    }
    render();
  }
  window.addEventListener('pointerup', (e) => endDrag(e, true));
  window.addEventListener('pointercancel', (e) => endDrag(e, false));

  boardEl.addEventListener('keydown', (e) => {
    const pt = e.target.closest('.pt');
    if (!pt || !game) return;
    const i = +pt.dataset.i;
    const k = e.key;
    const DIR = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (DIR[k]) {
      e.preventDefault();
      const r = Math.max(0, Math.min(4, E.rowOf(i) + DIR[k][0]));
      const c = Math.max(0, Math.min(4, E.colOf(i) + DIR[k][1]));
      setFocus(E.idx(r, c), true);
    } else if (k === 'Home' || k === 'End') {
      e.preventDefault();
      setFocus(k === 'Home' ? 0 : 24, true);
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (anim.busy) { skipAnim(); return; }
      handlePoint(i);
    }
  });
  // Đang chạy hiệu ứng: chạm bất kỳ đâu trên sân (trừ nút điều khiển) để bỏ qua
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
    if (e.key === 'Escape' && selected >= 0) { e.preventDefault(); selected = -1; render(); if (pointEls[focusP]) pointEls[focusP].focus(); return; }
    // Mũi tên khi tiêu điểm còn ở ngoài bàn: đưa tiêu điểm vào bàn
    if (e.key.startsWith('Arrow') && !e.target.closest('.board, .segmented, .log')) {
      e.preventDefault();
      setFocus(focusP, true);
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
    return `Luật Mở: ${settings.openRule ? 'bật' : 'tắt'}. Đổi trong Cài đặt.`;
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
  const RESULT_WHY = {
    wipe: (loser) => `${loser} không còn quân nào trên bàn.`,
    stuck: (loser) => `${loser} đến lượt mà không còn nước đi.`,
    repeat: () => 'Một thế cờ lặp lại 3 lần.',
    quiet: () => `${E.QUIET_LIMIT} nước liên tiếp không ai ăn được quân.`,
  };
  function showResult() {
    if (!game || !game.state.over || topModal()) return;
    const s = game.state;
    const w = s.winner;
    const ai = game.mode === 'ai';
    const lv = LEVELS[game.level].label;
    const moves = Math.ceil(game.moves.length / 2);
    let title, sub, celebrate = false;
    const why = RESULT_WHY[s.endReason](w === E.DRAW ? '' : playerName(1 - w));
    if (w === E.DRAW) {
      title = 'Hòa';
      sub = why;
    } else if (ai) {
      const youWin = w === 0;
      title = youWin ? 'Bạn thắng!' : 'Máy thắng';
      sub = why + (youWin ? ` Bạn thắng máy mức ${lv} sau ${moves} nước.` : ' Thử lại nhé!');
      celebrate = youWin;
    } else {
      title = `${playerName(w)} thắng!`;
      sub = why;
      celebrate = true;
    }
    $('result-mark').className = 'result-mark' + (w === E.DRAW ? ' draw' : ' p' + w);
    $('result-mark').innerHTML = w === E.DRAW ? '<i class="mini-piece" data-p="0"></i><i class="mini-piece" data-p="1"></i>' : `<i class="mini-piece" data-p="${w}"></i>`;
    $('result-title').textContent = title;
    $('result-sub').textContent = sub;
    $('result-score').innerHTML = [0, 1].map((p) =>
      `<div data-p="${p}"${w === p ? ' class="win"' : ''}><dt>${playerName(p)}</dt><dd><b>${s.count[p]}</b><span>quân · đã ăn ${game.taken[p]}</span></dd></div>`).join('');
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
    $('stats-played').textContent = ai.played;
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
  $('set-openrule').addEventListener('change', (e) => { settings.openRule = e.target.checked; saveSettings(); onRulesChanged(); });
  // Luật mới áp dụng từ ván sau; ván hiện tại chưa đi nước nào thì áp ngay
  function onRulesChanged() {
    if (game && game.moves.length === 0 && !thinking) {
      game.opts = { openRule: settings.openRule };
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
    $('set-openrule').checked = settings.openRule;
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
  // cfg: { alt, b: 25 ký tự ('X' đỏ, 'O' xanh, '.' trống), hl: { điểm: 'sel'|'cap'|'open'|'dest' },
  //        arrows: [[từ, đến, nét đứt?]], tags: { điểm: 'chữ' hoặc ['chữ', 'below'] } }
  function figure(cfg) {
    const uid = ++figId;
    const hl = cfg.hl || {};
    let s = `<svg viewBox="0 0 100 100" role="img" aria-label="${cfg.alt}">`;
    s += `<defs><marker id="fa${uid}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path class="d-arrow-head" d="M0 0L10 5L0 10z"/></marker></defs>`;
    s += '<rect class="d-board" x="1" y="1" width="98" height="98" rx="7"/>';
    s += `<path class="d-ln" d="${LINES_PATH}"/>`;
    for (let i = 0; i < 25; i++) {
      const [x, y] = pctOf(i);
      const ch = cfg.b[i];
      if (hl[i] === 'dest') s += `<circle class="d-dest" cx="${x}" cy="${y}" r="2.8"/>`;
      if (hl[i] === 'open') s += `<circle class="d-open" cx="${x}" cy="${y}" r="5.5"/>`;
      if (ch === 'X') s += `<circle class="d-p0" cx="${x}" cy="${y}" r="6.6"/><circle class="d-dot0" cx="${x}" cy="${y}" r="1.7"/>`;
      if (ch === 'O') s += `<circle class="d-p1" cx="${x}" cy="${y}" r="6.6"/><circle class="d-ring1" cx="${x}" cy="${y}" r="3"/>`;
      if (hl[i] === 'sel') s += `<circle class="d-sel" cx="${x}" cy="${y}" r="8.6"/>`;
      if (hl[i] === 'cap') s += `<circle class="d-cap" cx="${x}" cy="${y}" r="9"/>`;
    }
    for (const [a, b, dash] of cfg.arrows || []) {
      const [x1, y1] = pctOf(a), [x2, y2] = pctOf(b);
      const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      s += `<path class="d-arrow${dash ? ' dash' : ''}" d="M${(x1 + ux * 7.5).toFixed(1)} ${(y1 + uy * 7.5).toFixed(1)}L${(x2 - ux * 8).toFixed(1)} ${(y2 - uy * 8).toFixed(1)}" marker-end="url(#fa${uid})"/>`;
    }
    for (const i in cfg.tags || {}) {
      const [x, y] = pctOf(+i);
      const [text, pos] = [].concat(cfg.tags[i]); // 'chữ' hoặc ['chữ', 'below']
      s += `<text class="d-tag" x="${x}" y="${pos === 'below' || E.rowOf(+i) === 0 ? y + 15.5 : y - 10.5}">${text}</text>`;
    }
    return s + '</svg>';
  }
  const B = (...rows) => rows.join('');
  const P = (r, c) => E.idx(r, c);
  const START_B = Array.from(E.createState().board, (v) => '.XO'[v]).join('');
  const HELP = [
    {
      title: 'Bàn cờ: 25 điểm, 16 quân',
      text: 'Bàn có <b>5 x 5 điểm</b> nối với nhau bằng đường kẻ. Mỗi bên có <b>8 quân</b>: bạn cầm <b>quân đỏ</b> phía dưới, đối thủ cầm quân xanh phía trên. Cột ghi a–e, hàng ghi 1–5.',
      fig: { alt: 'Bàn đầu ván: 8 quân đỏ ở dưới, 8 quân xanh ở trên, 9 điểm giữa còn trống', b: START_B },
    },
    {
      title: 'Đi quân: một bước theo đường kẻ',
      text: 'Mỗi lượt đi <b>một quân, một bước</b> dọc theo đường kẻ tới điểm <b>trống</b> kề bên. Chỉ điểm có đường chéo mới đi chéo được. Chạm quân để thấy các điểm đến, hoặc kéo quân thả vào đó.',
      fig: {
        alt: 'Quân ở b4 có đường chéo nên đi được 8 hướng; quân ở d1 không có đường chéo chỉ đi được 3 hướng',
        b: B('.....', '.X...', '.....', '.....', '...X.'),
        hl: { [P(1, 1)]: 'sel', [P(4, 3)]: 'sel', 0: 'dest', 1: 'dest', 2: 'dest', 5: 'dest', 7: 'dest', 10: 'dest', 11: 'dest', 12: 'dest', 18: 'dest', 22: 'dest', 24: 'dest' },
        tags: { [P(1, 1)]: '8 hướng', [P(4, 3)]: '3 hướng' },
      },
    },
    {
      title: 'Gánh: chen vào giữa là ăn',
      text: 'Đi vào điểm nằm <b>giữa hai quân đối thủ</b> trên cùng một đường thẳng thì <b>gánh</b>: cả hai quân đó đổi sang màu của bạn và thành quân của bạn.',
      fig: {
        alt: 'Quân đỏ đi từ c2 lên c3, nằm giữa hai quân xanh ở b3 và d3 nên gánh cả hai',
        b: B('.....', '.....', '.O.O.', '..X..', '.....'),
        hl: { [P(2, 1)]: 'cap', [P(2, 3)]: 'cap' },
        arrows: [[P(3, 2), P(2, 2)]],
        tags: { [P(2, 1)]: 'gánh', [P(2, 3)]: 'gánh' },
      },
    },
    {
      title: 'Gánh nhiều đường cùng lúc',
      text: 'Một nước có thể gánh <b>nhiều đường</b> một lúc, kể cả đường chéo. Tự đi vào giữa hai quân đối thủ thì <b>an toàn</b>: chỉ quân vừa đi mới gánh, quân đứng yên không bị gánh.',
      fig: {
        alt: 'Quân đỏ đi chéo từ b2 vào c3, gánh cùng lúc hai quân xanh hàng ngang và hai quân xanh hàng dọc',
        b: B('.....', '..O..', '.O.O.', '.XO..', '.....'),
        hl: { [P(1, 2)]: 'cap', [P(3, 2)]: 'cap', [P(2, 1)]: 'cap', [P(2, 3)]: 'cap' },
        arrows: [[P(3, 1), P(2, 2)]],
        tags: { [P(1, 2)]: 'gánh 4 quân' },
      },
    },
    {
      title: 'Vây: hết đường thoát là mất',
      text: 'Gánh xong, nhóm quân đối thủ nào <b>không còn điểm trống kề bên</b> để đi thì bị <b>vây</b> và đổi màu hết. Chỉ xét quân của bên vừa bị đi, không xét quân của người vừa đi.',
      fig: {
        alt: 'Quân xanh ở góc a5 bị ba quân đỏ bao quanh sau khi quân đỏ đi vào b4 nên bị vây',
        b: B('OX...', 'X.X..', '.....', '.....', '.....'),
        hl: { 0: 'cap' },
        arrows: [[P(1, 2), P(1, 1)]],
        tags: { [P(3, 1)]: 'a5 bị vây' },
      },
    },
    {
      title: 'Luật Mở (tùy chọn)',
      text: 'Bật trong Cài đặt, mặc định tắt. Đối thủ vừa rời khỏi một điểm mà bạn đi vào đúng điểm đó <b>gánh được</b> thì <b>bắt buộc</b> phải đi nước đó. Quân phải đi sẽ nhấp nháy.',
      fig: {
        alt: 'Quân xanh vừa rời c3 lên c4, mở ra điểm c3 giữa hai quân xanh; quân đỏ ở c2 bắt buộc đi vào c3 để gánh',
        b: B('.....', '..O..', '.O.O.', '..X..', '.....'),
        hl: { [P(2, 2)]: 'open', [P(3, 2)]: 'sel', [P(2, 1)]: 'cap', [P(2, 3)]: 'cap' },
        arrows: [[P(3, 2), P(2, 2), true]],
        tags: { [P(1, 2)]: 'vừa rời c3' },
      },
    },
    {
      title: 'Thắng, thua, hòa',
      text: '<b>Ăn hết quân</b> đối thủ là thắng. Đến lượt mà không còn nước đi thì thua. <b>Hòa</b> khi một thế cờ lặp lại 3 lần, hoặc 60 nước liên tiếp không ai ăn được quân.',
      fig: {
        alt: 'Hai quân xanh cuối cùng bị gánh, quân đỏ thắng',
        b: B('.X...', 'X.XX.', '.O.O.', '..X..', 'X...X'),
        hl: { [P(2, 1)]: 'cap', [P(2, 3)]: 'cap' },
        arrows: [[P(3, 2), P(2, 2)]],
        tags: { [P(2, 1)]: ['quân cuối', 'below'] },
      },
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
