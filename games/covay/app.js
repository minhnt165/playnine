/* =====================================================================
 * Cờ Vây - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Đấu máy (Dễ / Vừa / Khó) hoặc 2 người cùng máy; chọn phe (Đen đi trước / Trắng +6,5), bàn 9×9 hoặc 13×13
 *   - Bàn vẽ bằng SVG (gỗ, lưới, điểm sao, tọa độ), quân đá có bóng, dấu nước vừa đi, quân ma khi chọn điểm
 *   - Chuột: rê để xem quân ma, bấm để đặt. Chạm: chạm một lần hiện quân ma, chạm lại đúng điểm đó để đặt
 *     (tắt được trong Cài đặt). Bàn phím: mũi tên di chuyển con trỏ, Enter / Space đặt, P bỏ lượt, N ván mới
 *   - Bỏ lượt có thể kết thúc ván thì hỏi lại kèm điểm tạm tính; Đầu hàng có hỏi lại
 *   - Hết ván: tô đất (điểm trống) theo luật khu vực; đầu hàng thì tô ước lượng bằng mô phỏng (quân chết mờ đi)
 *   - Máy nghĩ trong Web Worker dựng từ mã nguồn engine (Blob); không có worker thì tính từng khúc bằng setTimeout
 *   - Báo ván cho cổng (metric wins, mode = mức máy; chế độ 2 người không gửi gì):
 *     ván mới kit.sdk.start(level), mở lại ván dở kit.sdk.start(level, true);
 *     hết ván kit.sdk.end({ mode, won, assisted: false }) (komi 6,5 nên không có hòa);
 *     bỏ ván / đầu hàng khi đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì. Không có đi lại.
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const { BLACK, WHITE, PASS, RESIGN, LEVELS, SIZES } = E;
  const kit = PNKit.init({
    gameId: 'covay',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { level: 'medium', side: 'black', size: '9', opp: 'ai', confirm: true },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);
  const MIN_THINK_MS = 500; // máy "nghĩ" ít nhất chừng này để người chơi kịp thấy nước của mình
  const SVGNS = 'http://www.w3.org/2000/svg';
  const STONE_R = 0.47;

  const stage = $('stage');
  const boardEl = $('board');
  const gridEl = $('grid');
  const marksEl = $('marks');
  const stonesEl = $('stones');
  const overlayEl = $('overlay');

  /* ---------------- Thống kê ---------------- */
  const toInt = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const st = { levels: {}, streak: toInt(raw.streak), best: toInt(raw.best), pvp: { played: 0, black: 0, white: 0 } };
    for (const lv of LEVELS) {
      const r = (raw.levels && raw.levels[lv]) || {};
      st.levels[lv] = { played: toInt(r.played), won: toInt(r.won), lost: toInt(r.lost) };
    }
    if (raw.pvp) for (const k of ['played', 'black', 'white']) st.pvp[k] = toInt(raw.pvp[k]);
    return st;
  }
  const stats = loadStats();
  const totals = () => LEVELS.reduce((a, lv) => ({ played: a.played + stats.levels[lv].played, won: a.won + stats.levels[lv].won }), { played: 0, won: 0 });

  /* ---------------- Trạng thái ván ---------------- */
  // cur: { opp ('ai' | 'pvp'), level, human (BLACK | WHITE), humanMoves, seed (hạt giống của máy), ended }
  let game = null;
  let cur = null;
  let thinking = false;
  let aiToken = 0;
  let resultTimer = 0;
  let cursor = -1; // con trỏ bàn phím; -1 = chưa dùng bàn phím
  let ghost = -1; // điểm đang chọn bằng chạm (chờ chạm lần hai)
  let hover = -1; // điểm chuột đang trỏ
  let marks = null; // tô đất khi hết ván: { owner: mảng 0/1/2, dead: Set điểm quân chết, estimate }
  let drawnN = 0; // cỡ bàn đang vẽ
  let stoneEls = []; // phần tử quân theo điểm
  let ghostHinted = false;
  let lastPointer = 'mouse';

  const isPvp = () => cur && cur.opp === 'pvp';
  const isAiTurn = () => game && !game.over && !isPvp() && game.turn !== cur.human;
  const started = () => (isPvp() ? game.moves.length > 0 : cur.humanMoves > 0);
  const inProgress = () => game && !game.over && started();
  const humanCanPlay = () => game && !game.over && !thinking && !kit.modal.current() && (isPvp() || game.turn === cur.human);
  const sizeLabel = (n) => n + '×' + n;
  const sideName = (c) => t(c === BLACK ? 'side.black' : 'side.white');
  const fmtPts = (v) => kit.i18n.fmtNumber(v);

  function readSettings() {
    const s = kit.settings.get();
    return {
      opp: s.opp === 'pvp' ? 'pvp' : 'ai',
      level: LEVELS.indexOf(s.level) >= 0 ? s.level : 'medium',
      human: s.side === 'white' ? WHITE : BLACK,
      n: SIZES.indexOf(Number(s.size)) >= 0 ? Number(s.size) : 9,
      confirm: s.confirm !== false,
    };
  }

  /* ---------------- Máy nghĩ trong Web Worker ---------------- */
  const AI = {
    worker: null,
    pending: null, // { id, args, cb }
    nextId: 0,
    source() {
      return 'var G = (' + E.factory.toString() + ')();\n' +
        'self.onmessage = function (e) {\n' +
        '  var d = e.data, g = G.fromJSON(d.state);\n' +
        '  var r = g ? G.chooseMove(g, { level: d.level, seed: d.seed }) : { move: null };\n' +
        '  self.postMessage({ id: d.id, move: r.move });\n' +
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
          p.cb(e.data.move);
        };
        this.worker.onerror = (e) => { // worker hỏng: bỏ worker, tính trên luồng chính
          if (e && e.preventDefault) e.preventDefault();
          this.worker = null;
          const p = this.pending;
          if (p) {
            this.pending = null;
            this.think(p.args, p.cb);
          }
        };
      } catch (e) {
        this.worker = null;
      }
    },
    /** args: { state, level, seed } */
    think(args, cb) {
      const id = ++this.nextId;
      this.pending = { id, args, cb };
      if (this.worker) {
        this.worker.postMessage(Object.assign({ id }, args));
        return;
      }
      // Không có worker: tìm kiếm từng khúc ~25 ms để giao diện không đơ (rút thời gian nghĩ còn tối đa 1,2 s)
      const g = E.fromJSON(args.state);
      const plan = g ? E.planMove(g, { level: args.level, seed: args.seed }) : { move: null };
      const now = () => performance.now();
      const stop = now() + Math.min(plan.ms || 0, 1200);
      let left = plan.playouts || 0;
      const step = () => {
        if (!this.pending || this.pending.id !== id) return;
        if (plan.search) {
          left -= plan.search.run(left, Math.min(stop, now() + 25), now);
          if (left > 0 && now() < stop) {
            setTimeout(step, 0);
            return;
          }
        }
        this.pending = null;
        cb(plan.search ? plan.search.result().move : plan.move);
      };
      setTimeout(step, 30);
    },
    cancel() {
      if (!this.pending) return;
      this.pending = null;
      // Dừng ngay phép tính đang chạy rồi tạo worker mới
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
        this.start();
      }
    },
  };
  AI.start();

  /* ---------------- Vẽ bàn ---------------- */
  const fx = (v) => Math.round(v * 1000) / 1000;
  const px = (i, n) => (i % n) + 1; // tọa độ SVG của điểm i (đơn vị lưới, lề 1)
  const py = (i, n) => ((i / n) | 0) + 1;

  function el(name, attrs, parent) {
    const e = document.createElementNS(SVGNS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /** Nền gỗ, lưới, điểm sao, tọa độ (chữ trên–dưới, số trái–phải). */
  function drawGrid(svg, g, n, labels) {
    svg.setAttribute('viewBox', '0 0 ' + (n + 1) + ' ' + (n + 1));
    g.textContent = '';
    el('rect', { class: 'wood', x: 0, y: 0, width: n + 1, height: n + 1, rx: 0.32 }, g);
    let d = '';
    for (let k = 1; k <= n; k++) d += 'M1 ' + k + 'H' + n + 'M' + k + ' 1V' + n;
    el('path', { class: 'gl', d }, g);
    el('rect', { class: 'gl edge', x: 1, y: 1, width: n - 1, height: n - 1 }, g);
    for (const i of E.hoshi(n)) el('circle', { class: 'hoshi', cx: px(i, n), cy: py(i, n), r: n >= 13 ? 0.09 : 0.1 }, g);
    if (!labels) return;
    // chữ vẽ ở thang 100 rồi thu nhỏ (cỡ chữ quá nhỏ theo px có thể bị trình duyệt nâng lên)
    const lg = el('g', { class: 'coords', transform: 'scale(0.01)' }, g);
    for (let k = 0; k < n; k++) {
      const letter = E.pointName(k, n).replace(/\d+/, '');
      const num = String(n - k);
      for (const y of [0.29, n + 0.71]) el('text', { class: 'coord', x: (k + 1) * 100, y: Math.round(y * 100) }, lg).textContent = letter;
      for (const x of [0.29, n + 0.71]) el('text', { class: 'coord', x: Math.round(x * 100), y: (k + 1) * 100 }, lg).textContent = num;
    }
  }

  function makeStone(i, n, color, parent, cls) {
    const s = el('g', { class: 'stone ' + (color === BLACK ? 'black' : 'white') + (cls ? ' ' + cls : ''), transform: 'translate(' + px(i, n) + ' ' + py(i, n) + ')' }, parent);
    el('circle', { class: 'sh', r: STONE_R, cx: 0.04, cy: 0.06 }, s);
    el('circle', { class: 'body', r: STONE_R }, s);
    s.dataset.c = String(color);
    return s;
  }

  let lastMark = null;
  let ghostEl = null;
  let cursorEl = null;

  function rebuild(n) {
    drawnN = n;
    drawGrid(boardEl, gridEl, n, true);
    stonesEl.textContent = '';
    marksEl.textContent = '';
    overlayEl.textContent = '';
    stoneEls = new Array(n * n).fill(null);
    lastMark = el('circle', { class: 'last-mark', r: 0.19 }, null);
    ghostEl = null;
    cursorEl = el('rect', { class: 'cursor-ring', width: 0.96, height: 0.96, rx: 0.2 }, null);
  }

  function layout() {
    if (!game) return;
    if (drawnN !== game.n) {
      rebuild(game.n);
      renderBoard(true);
    }
    // Bàn vuông lớn nhất vừa phần sân còn lại sau hai thanh người chơi và hàng nút
    // (màn hình rộng / ngang thấp: sau cột bên phải); cả nhóm được căn giữa sân
    const cs = getComputedStyle(stage);
    const gap = parseFloat(cs.rowGap) || parseFloat(cs.gap) || 8;
    let w = stage.clientWidth, h = stage.clientHeight;
    if (cs.flexDirection === 'row') w -= $('side').offsetWidth + gap;
    else h -= $('bar-top').offsetHeight + $('bar-bottom').offsetHeight + $('controls').offsetHeight + 3 * gap;
    const s = Math.max(120, Math.floor(Math.min(w, h)));
    const box = $('board-box');
    box.style.width = s + 'px';
    box.style.height = s + 'px';
    boardEl.style.width = s + 'px';
    boardEl.style.height = s + 'px';
  }

  /* ---------------- Vẽ ---------------- */
  function render() {
    renderBoard(false);
    renderBars();
  }

  function renderBoard(still) {
    if (!game || drawnN !== game.n) return;
    const n = game.n;
    const b = game.board;
    for (let i = 0; i < b.length; i++) {
      let s = stoneEls[i];
      if (b[i]) {
        if (!s || s.dataset.c !== String(b[i])) {
          if (s) s.remove();
          s = makeStone(i, n, b[i], stonesEl, still || calm() ? '' : 'drop');
          stoneEls[i] = s;
        }
        s.classList.toggle('dead', !!(marks && marks.dead.has(i)));
      } else if (s) {
        stoneEls[i] = null;
        if (still || calm()) s.remove();
        else {
          // quân bị bắt mờ dần rồi biến mất
          s.classList.add('gone');
          setTimeout(() => s.remove(), 280);
        }
      }
    }
    renderMarks();
    renderOverlay();
    boardEl.classList.toggle('over', !!game.over);
    boardEl.classList.toggle('wait', !humanCanPlay());
  }

  /** Tô đất khi hết ván: ô vuông nhỏ màu chủ đất trên điểm trống và trên quân chết. */
  function renderMarks() {
    marksEl.textContent = '';
    if (!marks || !game) return;
    const n = game.n;
    for (let i = 0; i < n * n; i++) {
      const o = marks.owner[i];
      if (!o || (game.board[i] && !marks.dead.has(i))) continue;
      el('rect', { class: 'terr ' + (o === BLACK ? 'black' : 'white'), x: fx(px(i, n) - 0.17), y: fx(py(i, n) - 0.17), width: 0.34, height: 0.34, rx: 0.05 }, marksEl);
    }
    // quân chết: ô đất vẽ trên quân
    marksEl.parentNode.appendChild(marksEl);
  }

  function renderOverlay() {
    const n = game.n;
    overlayEl.textContent = '';
    // dấu nước vừa đi
    if (game.last >= 0 && game.board[game.last] && !game.over) {
      lastMark.setAttribute('cx', px(game.last, n));
      lastMark.setAttribute('cy', py(game.last, n));
      lastMark.setAttribute('class', 'last-mark ' + (game.board[game.last] === BLACK ? 'on-black' : 'on-white'));
      overlayEl.appendChild(lastMark);
    }
    // quân ma: điểm đang chọn bằng chạm, hoặc chuột đang trỏ
    const gi = ghost >= 0 ? ghost : hover;
    if (gi >= 0 && humanCanPlay() && !game.board[gi]) {
      ghostEl = makeStone(gi, n, game.turn, overlayEl, 'ghost' + (ghost >= 0 ? ' picked' : ''));
    }
    if (cursor >= 0 && cursor < n * n) {
      cursorEl.setAttribute('x', fx(px(cursor, n) - 0.48));
      cursorEl.setAttribute('y', fx(py(cursor, n) - 0.48));
      overlayEl.appendChild(cursorEl);
    }
  }

  /** Thanh người chơi: máy (hoặc Trắng khi 2 người) ở trên, bạn (hoặc Đen) ở dưới. */
  function renderBars() {
    if (isPvp()) {
      fillBar($('bar-top'), WHITE, t('bar.p', { side: sideName(WHITE) }), true);
      fillBar($('bar-bottom'), BLACK, t('bar.p', { side: sideName(BLACK) }), true);
    } else {
      fillBar($('bar-top'), 3 - cur.human, t('bar.aiShort'), false);
      fillBar($('bar-bottom'), cur.human, t('bar.you'), true);
    }
    const can = humanCanPlay();
    $('btn-pass').disabled = !can;
    $('btn-resign').disabled = !game || game.over || !started() || thinking;
    $('btn-pass').classList.toggle('hot', can && game.passes > 0);
  }
  function fillBar(bar, color, name, human) {
    const active = !game.over && game.turn === color;
    bar.classList.toggle('black', color === BLACK);
    bar.classList.toggle('white', color === WHITE);
    bar.classList.toggle('active', active);
    bar.classList.toggle('won', !!(game.over && game.result.winner === color));
    bar.classList.toggle('thinking', active && !human && thinking);
    bar.querySelector('.pname').textContent = name;
    let sub = !human ? t('bar.aiSub', { level: t('level.' + cur.level), side: sideName(color) }) : color === BLACK ? t('bar.black') : t('bar.white', { komi: fmtPts(game.komi) });
    if (active && human) sub = isPvp() ? t('bar.turnPvp') : t('bar.turn');
    else if (active && thinking) sub = t('bar.thinking');
    if (!game.over && game.passes > 0 && game.turn !== color) sub = t('bar.passed');
    bar.querySelector('.psub').textContent = sub;
    bar.querySelector('.pcaps-n').textContent = fmtPts(game.caps[color]);
  }

  function announce(msg) {
    $('live').textContent = msg;
  }

  /* ---------------- Lưu ---------------- */
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    const tot = totals();
    const live = game && !game.over && game.moves.length > 0 && !cur.ended;
    const played = tot.played + stats.pvp.played;
    const detail = live ? t(isPvp() ? 'summary.resumePvp' : 'summary.resume', { size: sizeLabel(game.n), level: t('level.' + cur.level), n: game.moves.length + 1 }) : '';
    kit.store.write(keys.summary, PNKit.buildSummary({
      played,
      won: tot.won,
      note: tot.played ? t('summary.note', { n: tot.won }) : t('summary.none'),
      stats: tot.played ? [{ value: kit.i18n.fmtNumber(tot.won), label: t('stats.won') }, { value: kit.i18n.fmtNumber(stats.best), label: t('stats.best') }] : [],
      resume: live ? { title: t('app.name'), detail } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (game && !game.over && game.moves.length > 0 && !cur.ended) {
      kit.store.write(keys.save, { v: 1, opp: cur.opp, level: cur.level, human: cur.human, humanMoves: cur.humanMoves, seed: cur.seed, game: E.toJSON(game) });
    } else {
      kit.store.remove(keys.save);
    }
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */
  function setGame(g, c) {
    cancelAi();
    clearTimeout(resultTimer);
    game = g;
    cur = c;
    marks = null;
    ghost = -1;
    hover = -1;
    if (cursor >= g.n * g.n) cursor = -1;
    if (drawnN !== g.n) drawnN = 0;
    layout();
    // ván mới: dựng lại quân không hiệu ứng
    stoneEls.forEach((s) => s && s.remove());
    stoneEls = new Array(g.n * g.n).fill(null);
    renderBoard(true);
    renderBars();
    syncSettingsRows();
  }

  function newGame() {
    const s = readSettings();
    kit.modal.close('modal-result');
    setGame(E.newGame({ n: s.n }), { opp: s.opp, level: s.level, human: s.human, humanMoves: 0, seed: (Math.random() * 4294967296) >>> 0, ended: false });
    kit.store.remove(keys.save);
    if (!isPvp()) kit.sdk.start(cur.level);
    kit.sfx('start');
    writeSummary();
    scheduleAi();
  }

  /** Người chơi chọn điểm i (chuột, chạm hoặc bàn phím). Chạm có xác nhận thì lần đầu chỉ hiện quân ma. */
  function onPoint(i, touch) {
    if (!game || game.over || kit.modal.current() || i < 0) return;
    if (thinking || (!isPvp() && game.turn !== cur.human)) {
      kit.toast(t('toast.thinking'));
      return;
    }
    if (game.board[i]) {
      kit.sfx('error', { volume: 0.5 });
      kit.toast(t('toast.taken'));
      return;
    }
    const err = E.tryMove(game, i).error;
    if (err) {
      kit.sfx('error', { volume: 0.5 });
      kit.toast(t(err === 'ko' ? 'toast.ko' : 'toast.suicide'), 2600);
      ghost = -1;
      renderOverlay();
      return;
    }
    if (touch && readSettings().confirm && ghost !== i) {
      ghost = i;
      kit.sfx('tap', { volume: 0.4 });
      announce(t('live.pick', { point: E.pointName(i, game.n) }));
      if (!ghostHinted) {
        ghostHinted = true;
        kit.toast(t('toast.confirm'), 2200);
      }
      renderOverlay();
      return;
    }
    commit(i, true);
  }

  function commit(m, byHuman) {
    const mover = game.turn;
    const prev = game;
    const next = E.play(game, m);
    if (!next) return;
    game = next;
    ghost = -1;
    if (byHuman) cur.humanMoves++;
    const who = isPvp() ? sideName(mover) : byHuman ? t('bar.you') : t('bar.aiShort');
    if (m === PASS) {
      announce(t('live.pass', { who }));
      kit.sfx('tap');
      if (!game.over) kit.toast(byHuman ? t('toast.passed', { who }) : t('toast.aiPass'), 2600);
    } else {
      const caps = game.caps[mover] - prev.caps[mover];
      announce(t(caps ? 'live.capture' : 'live.move', { who, point: E.pointName(m, game.n), n: caps }));
      if (caps) kit.sfx('capture');
      else kit.sfx('place', byHuman ? undefined : { pitch: 0.85 });
    }
    render();
    persist();
    if (game.over) finish();
    else scheduleAi();
  }

  /** Bỏ lượt của người chơi: nếu có thể kết thúc ván (đối thủ vừa bỏ lượt, hoặc máy sẽ bỏ lượt theo) thì hỏi lại. */
  function humanPass() {
    if (!humanCanPlay()) return;
    const after = E.play(game, PASS);
    const mayEnd = after.over || (!isPvp() && E.aiWouldPass(after));
    if (!mayEnd) {
      commit(PASS, true);
      return;
    }
    $('pass-text').textContent = t(after.over ? 'pass.textEnd' : 'pass.textAi');
    fillScore($('pass-score'), E.score(game));
    kit.modal.open('modal-pass');
  }

  /** Bảng điểm: Đen (quân + đất), Trắng (quân + đất + komi). */
  function fillScore(dl, s) {
    const f = fmtPts;
    dl.innerHTML =
      '<div><dt><i class="sdot black" aria-hidden="true"></i>' + sideName(BLACK) + '</dt><dd>' + f(s.black) + '</dd></div>' +
      '<div><dt><i class="sdot white" aria-hidden="true"></i>' + sideName(WHITE) + '</dt><dd>' + t('score.white', { pts: f(s.white), komi: f(s.komi), total: f(s.white + s.komi) }) + '</dd></div>' +
      '<div class="lead"><dt>' + t('score.lead') + '</dt><dd>' + t('score.by', { side: sideName(s.winner), n: f(s.margin) }) + '</dd></div>';
  }

  function humanResign() {
    if (!game || game.over || !started() || thinking) return;
    $('resign-text').textContent = isPvp() ? t('resign.textPvp', { side: sideName(game.turn), other: sideName(3 - game.turn) }) : t('resign.text');
    kit.modal.open('modal-resign');
  }
  function confirmResign() {
    kit.modal.close('modal-resign');
    if (!game || game.over) return;
    const side = isPvp() ? game.turn : cur.human;
    cancelAi();
    game = E.resign(game, side);
    announce(t('live.resign', { who: isPvp() ? sideName(side) : t('bar.you') }));
    render();
    persist();
    finish();
  }

  function scheduleAi() {
    if (!isAiTurn() || thinking) return;
    thinking = true;
    const token = ++aiToken;
    const t0 = Date.now();
    render();
    const seed = (cur.seed + game.moves.length * 2654435761) >>> 0;
    AI.think({ state: E.toJSON(game), level: cur.level, seed }, (move) => {
      if (token !== aiToken) return;
      const wait = Math.max(0, MIN_THINK_MS - (Date.now() - t0));
      setTimeout(() => {
        if (token !== aiToken) return;
        thinking = false;
        if (move === RESIGN) {
          game = E.resign(game, game.turn);
          announce(t('live.aiResign'));
          render();
          persist();
          finish();
          return;
        }
        // phòng hờ: không bao giờ để máy đi sai luật
        let m = move;
        if (!(m === PASS || (Number.isInteger(m) && E.isLegal(game, m)))) {
          const legal = E.legalMoves(game).filter((x) => x !== PASS);
          m = legal.length ? legal[Math.floor(Math.random() * legal.length)] : PASS;
        }
        commit(m, false);
      }, wait);
    });
  }

  function cancelAi() {
    aiToken++;
    if (thinking) {
      thinking = false;
      AI.cancel();
    }
  }

  /** Tô đất cuối ván: hết bằng bỏ lượt thì theo luật khu vực; đầu hàng thì ước lượng bằng mô phỏng. */
  function computeMarks() {
    const n = game.n;
    if (game.result.reason === 'score') return { owner: E.score(game).owner, dead: new Set(), estimate: false };
    const own = E.ownership(game, 48, cur.seed);
    const owner = own.map((v) => (v > 0.35 ? BLACK : v < -0.35 ? WHITE : 0));
    const dead = new Set();
    for (let i = 0; i < n * n; i++) if (game.board[i] && owner[i] && owner[i] !== game.board[i]) dead.add(i);
    return { owner, dead, estimate: true };
  }

  function finish() {
    if (cur.ended) return;
    cur.ended = true;
    ghost = -1;
    hover = -1;
    marks = computeMarks();
    renderBoard(true);
    renderBars();
    const w = game.result.winner;
    if (isPvp()) {
      stats.pvp.played++;
      stats.pvp[w === BLACK ? 'black' : 'white']++;
      saveStats();
      persist();
      kit.sfx('win');
      kit.confetti();
      showResult();
      return;
    }
    const won = w === cur.human;
    const lv = stats.levels[cur.level];
    lv.played++;
    if (won) {
      lv.won++;
      stats.streak++;
      stats.best = Math.max(stats.best, stats.streak);
    } else {
      lv.lost++;
      stats.streak = 0;
    }
    saveStats();
    persist();
    // komi 6,5 nên không có hòa: thắng won true, thua / đầu hàng won false
    if (won || cur.humanMoves > 0) kit.sdk.end({ mode: cur.level, won, assisted: false });
    kit.sfx(won ? 'win' : 'lose');
    if (won) kit.confetti();
    showResult();
  }

  function showResult() {
    const r = game.result;
    const w = r.winner;
    const humanWon = isPvp() || w === cur.human;
    let title, text;
    if (isPvp()) title = t('result.winPvp', { side: sideName(w) });
    else title = t(w === cur.human ? 'result.win' : 'result.lose');
    if (r.reason === 'resign') {
      if (isPvp()) text = t('result.resignPvp', { side: sideName(r.resigned) });
      else text = t(r.resigned === cur.human ? 'result.youResigned' : 'result.aiResigned');
      $('result-score').hidden = true;
    } else {
      text = t('result.byScore', { side: sideName(w), n: fmtPts(r.margin) });
      fillScore($('result-score'), r);
      $('result-score').hidden = false;
    }
    if (marks && marks.estimate) text += ' ' + t('result.estimate');
    $('result-title').textContent = title;
    $('result-text').textContent = text;
    $('result-art').className = 'result-art ' + (humanWon ? 'win' : 'lose');
    $('result-art').innerHTML = '<svg viewBox="-1 -1 2 2"><g class="stone ' + (w === BLACK ? 'black' : 'white') + '"><circle class="sh" r="0.8" cx="0.06" cy="0.1"/><circle class="body" r="0.8"/></g></svg>';
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => kit.modal.open('modal-result'), calm() ? 300 : 1100);
  }

  /** Ván đang dở (bạn đã đi) thì hỏi trước, vì bỏ ván tính là thua. */
  function requestNew() {
    if (inProgress()) {
      $('confirm-text').textContent = t(isPvp() ? 'confirm.textPvp' : 'confirm.text');
      kit.modal.open('modal-confirm');
    } else newGame();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inProgress() && !isPvp()) {
      const lv = stats.levels[cur.level];
      lv.played++;
      lv.lost++;
      stats.streak = 0;
      saveStats();
      kit.sdk.end({ mode: cur.level, won: false, assisted: false });
    }
    newGame();
  }

  /** Đổi cài đặt ván: chưa đi nước nào (hoặc ván đã xong) thì chơi lại ngay, đang dở thì để ván sau. */
  function onSetting(key) {
    syncSettingsRows();
    if (['opp', 'level', 'side', 'size'].indexOf(key) < 0 || !game) return;
    if (game.over || !started()) newGame();
    else kit.toast(t('toast.next'));
  }
  /** Chế độ 2 người không cần mức máy và phe. */
  function syncSettingsRows() {
    const pvp = readSettings().opp === 'pvp';
    $('setting-level').hidden = pvp;
    $('setting-side').hidden = pvp;
  }

  /* ---------------- Sự kiện ---------------- */
  /** Điểm gần nhất dưới con trỏ (null nếu ra ngoài lưới quá nửa ô). */
  function pointAt(e) {
    if (!game || !boardEl.getScreenCTM) return -1;
    const m = boardEl.getScreenCTM();
    if (!m) return -1;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const c = Math.round(p.x - 1), r = Math.round(p.y - 1);
    const n = game.n;
    return r >= 0 && r < n && c >= 0 && c < n ? r * n + c : -1;
  }

  boardEl.addEventListener('pointerdown', (e) => {
    lastPointer = e.pointerType || 'mouse';
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const i = pointAt(e);
    if (i !== hover) {
      hover = i;
      if (game) renderOverlay();
    }
  });
  boardEl.addEventListener('pointerleave', () => {
    if (hover < 0) return;
    hover = -1;
    if (game) renderOverlay();
  });
  boardEl.addEventListener('click', (e) => {
    const i = pointAt(e);
    if (cursor >= 0) cursor = -1;
    if (i < 0) {
      if (ghost >= 0) {
        ghost = -1;
        renderOverlay();
      }
      return;
    }
    onPoint(i, lastPointer !== 'mouse');
  });

  /** Phím mũi tên: di chuyển con trỏ (bắt đầu ở nước vừa đi hoặc tâm bàn). */
  function moveCursor(dx, dy) {
    // Dùng phím mũi tên thì đưa focus về bàn để Enter không bấm nhầm nút đang focus
    if (document.activeElement !== boardEl) boardEl.focus({ preventScroll: true });
    const n = game.n;
    if (cursor < 0) cursor = game.last >= 0 ? game.last : (n * n - 1) / 2;
    else {
      const r = Math.min(n - 1, Math.max(0, ((cursor / n) | 0) + dy));
      const c = Math.min(n - 1, Math.max(0, (cursor % n) + dx));
      cursor = r * n + c;
    }
    ghost = -1;
    renderOverlay();
    const v = game.board[cursor];
    announce(E.pointName(cursor, n) + ', ' + (v ? sideName(v) : t('cell.empty')));
  }

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key;
    const onButton = e.target && e.target.closest && e.target.closest('button, input, select, a');
    if (k === 'ArrowLeft') moveCursor(-1, 0);
    else if (k === 'ArrowRight') moveCursor(1, 0);
    else if (k === 'ArrowUp') moveCursor(0, -1);
    else if (k === 'ArrowDown') moveCursor(0, 1);
    else if ((k === 'Enter' || k === ' ') && !onButton) {
      if (cursor < 0) moveCursor(0, 0);
      else onPoint(cursor, false);
    } else if (k === 'Escape' && (cursor >= 0 || ghost >= 0)) {
      cursor = -1;
      ghost = -1;
      renderOverlay();
    } else if (k === 'p' || k === 'P') humanPass();
    else if (k === 'n' || k === 'N') requestNew();
    else return;
    e.preventDefault();
  });

  $('btn-pass').addEventListener('click', humanPass);
  $('btn-confirm-pass').addEventListener('click', () => {
    kit.modal.close('modal-pass');
    if (game && !game.over && (isPvp() || game.turn === cur.human) && !thinking) commit(PASS, true);
  });
  $('btn-resign').addEventListener('click', humanResign);
  $('btn-confirm-resign').addEventListener('click', confirmResign);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', newGame);
  $('btn-stats').addEventListener('click', renderStats);

  function renderStats() {
    const tot = totals();
    const f = kit.i18n.fmtNumber;
    $('stats-played').textContent = f(tot.played);
    $('stats-won').textContent = f(tot.won);
    $('stats-streak').textContent = f(stats.streak);
    $('stats-best').textContent = f(stats.best);
    $('stats-body').innerHTML = LEVELS.map((lv) => {
      const r = stats.levels[lv];
      const rate = r.played ? Math.round((r.won / r.played) * 100) + '%' : '–';
      return '<tr><th scope="row">' + t('level.' + lv) + '</th><td>' + f(r.played) + '</td><td>' + f(r.won) + '</td><td>' + f(r.lost) + '</td><td>' + rate + '</td></tr>';
    }).join('');
    const p = stats.pvp;
    $('stats-pvp').hidden = !p.played;
    $('stats-pvp').textContent = t('stats.pvp', { n: p.played, b: p.black, w: p.white });
  }

  /** Hình minh họa trong Cách chơi: ba bàn 5×5 nhỏ — atari, bắt quân, đất. */
  (function drawHelpArt() {
    const svg = $('help-art');
    const panels = [
      { stones: [[1, 2, BLACK], [2, 1, BLACK], [3, 2, BLACK], [2, 2, WHITE]], ghost: [2, 3, BLACK] },
      { stones: [[1, 2, BLACK], [2, 1, BLACK], [3, 2, BLACK], [2, 3, BLACK]], ring: [2, 2] },
      { stones: [[0, 2, BLACK], [1, 2, BLACK], [2, 2, BLACK], [2, 1, BLACK], [2, 0, BLACK], [0, 3, WHITE], [1, 3, WHITE], [2, 3, WHITE], [3, 2, WHITE], [3, 1, WHITE], [3, 0, WHITE]], terr: true },
    ];
    panels.forEach((pn, k) => {
      const g = el('g', { transform: 'translate(' + (k * 70 + 4) + ' 2) scale(10)' }, svg);
      drawGrid({ setAttribute() {} }, el('g', {}, g), 5, false);
      for (const [r, c, col] of pn.stones) makeStone(r * 5 + c, 5, col, g);
      if (pn.ghost) makeStone(pn.ghost[0] * 5 + pn.ghost[1], 5, pn.ghost[2], g, 'ghost');
      if (pn.ring) el('circle', { class: 'help-ring', cx: pn.ring[1] + 1, cy: pn.ring[0] + 1, r: 0.32 }, g);
      if (pn.terr) {
        for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) el('rect', { class: 'terr black', x: c + 0.83, y: r + 0.83, width: 0.34, height: 0.34 }, g);
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            if ((r <= 2 && c === 4) || (r === 3 && c >= 3) || r === 4) el('rect', { class: 'terr white', x: c + 0.83, y: r + 0.83, width: 0.34, height: 0.34 }, g);
          }
        }
      }
    });
  })();

  kit.onLeave(persist);
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const okSave = saved && saved.v === 1 && (saved.opp === 'ai' || saved.opp === 'pvp') && LEVELS.indexOf(saved.level) >= 0 &&
    (saved.human === BLACK || saved.human === WHITE) && Number.isInteger(saved.humanMoves) && saved.humanMoves >= 0 && Number.isInteger(saved.seed);
  const restored = okSave ? E.fromJSON(saved.game) : null;
  if (restored && !restored.over && restored.moves.length > 0 && saved.humanMoves <= restored.moves.length) {
    setGame(restored, { opp: saved.opp, level: saved.level, human: saved.human, humanMoves: saved.humanMoves, seed: saved.seed >>> 0, ended: false });
    if (!isPvp()) kit.sdk.start(cur.level, true);
    kit.toast(t('toast.saved'));
    writeSummary();
    scheduleAi();
  } else {
    newGame();
  }
  // Lần đầu mở game: hiện Cách chơi
  if (!kit.settings.get().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
})();
