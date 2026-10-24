/* =====================================================================
 * Cờ Lục Giác - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Đấu máy (Dễ / Vừa / Khó) hoặc 2 người cùng máy; chọn phe, cỡ bàn (7 / 9 / 11) và luật đổi bên trong Cài đặt
 *   - Bàn vẽ bằng SVG, xoay để đường chéo dài nằm dọc (màn hình đứng) hoặc ngang (màn hình rộng),
 *     chọn hướng cho ô to nhất trong khung
 *   - Chuột / chạm: chạm ô trống để đặt quân; nút "Đổi bên" khi được đổi
 *   - Bàn phím: mũi tên di chuyển con trỏ theo hướng trên màn hình, Enter / Space đặt quân, S đổi bên, N ván mới
 *   - Máy nghĩ trong Web Worker dựng từ mã nguồn engine (Blob); không có worker thì tính từng khúc bằng setTimeout
 *   - Báo ván cho cổng (metric wins, mode = mức máy; chế độ 2 người không gửi gì):
 *     ván mới kit.sdk.start(level), mở lại ván dở kit.sdk.start(level, true);
 *     hết ván kit.sdk.end({ mode, won, assisted: false }) (Hex không có hòa; thua gửi won: false);
 *     bỏ ván đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì. Không có đi lại.
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const { RED, BLUE, SWAP, LEVELS, SIZES } = E;
  const kit = PNKit.init({
    gameId: 'colucgiac',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { level: 'medium', side: 'red', size: '9', swap: true, opp: 'ai' },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);
  const MIN_THINK_MS = 500; // máy "nghĩ" ít nhất chừng này để người chơi kịp thấy nước của mình
  const SVGNS = 'http://www.w3.org/2000/svg';
  const SQ3 = Math.sqrt(3);
  const MARGIN = 1.05; // lề hình thoi ngoài tâm ô góc (đơn vị lưới); phần ngoài ô là dải màu cạnh
  const STONE_R = 0.62; // bán kính quân so với bán kính ô
  const ROTS = [-Math.PI / 6, Math.PI / 3]; // đường chéo dài nằm ngang / nằm dọc

  const stage = $('stage');
  const boardEl = $('board');
  const edgesEl = $('edges');
  const cellsEl = $('cells');
  const stonesEl = $('stones');

  /* ---------------- Thống kê ---------------- */
  const toInt = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const st = { levels: {}, streak: toInt(raw.streak), best: toInt(raw.best), pvp: { played: 0, red: 0, blue: 0 } };
    for (const lv of LEVELS) {
      const r = (raw.levels && raw.levels[lv]) || {};
      st.levels[lv] = { played: toInt(r.played), won: toInt(r.won), lost: toInt(r.lost) };
    }
    if (raw.pvp) for (const k of ['played', 'red', 'blue']) st.pvp[k] = toInt(raw.pvp[k]);
    return st;
  }
  const stats = loadStats();
  const totals = () => LEVELS.reduce((a, lv) => ({ played: a.played + stats.levels[lv].played, won: a.won + stats.levels[lv].won }), { played: 0, won: 0 });

  /* ---------------- Trạng thái ván ---------------- */
  // cur: { opp ('ai' | 'pvp'), level, human (RED | BLUE), humanMoves, seed (hạt giống của máy), ended, hinted }
  let game = null;
  let cur = null;
  let thinking = false;
  let aiToken = 0;
  let resultTimer = 0;
  let cursor = -1; // con trỏ bàn phím; -1 = chưa dùng bàn phím
  let geom = null; // hình học đang vẽ: { n, rot, centers, corners, hex, box }
  let stoneEls = []; // phần tử quân theo ô
  let tieFlip = false; // xen kẽ khi phím mũi tên có hai ô cách đều

  const isPvp = () => cur && cur.opp === 'pvp';
  const isAiTurn = () => game && !game.winner && !isPvp() && game.turn !== cur.human;
  const started = () => (isPvp() ? game.moves.length > 0 : cur.humanMoves > 0);
  const inProgress = () => game && !game.winner && started();
  const humanCanPlay = () => game && !game.winner && !thinking && !kit.modal.current() && (isPvp() || game.turn === cur.human);
  const sizeLabel = (n) => n + '×' + n;
  const sideName = (c) => t('side.' + c);

  function readSettings() {
    const s = kit.settings.get();
    return {
      opp: s.opp === 'pvp' ? 'pvp' : 'ai',
      level: LEVELS.indexOf(s.level) >= 0 ? s.level : 'medium',
      human: s.side === 'blue' ? BLUE : RED,
      n: SIZES.indexOf(Number(s.size)) >= 0 ? Number(s.size) : 9,
      swap: s.swap !== false,
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
        '  var r = g ? G.chooseMove(g, { level: d.level, seed: d.seed, timeMs: d.timeMs }) : { move: null };\n' +
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
    /** args: { state, level, seed, timeMs } */
    think(args, cb) {
      const id = ++this.nextId;
      this.pending = { id, args, cb };
      if (this.worker) {
        this.worker.postMessage(Object.assign({ id }, args));
        return;
      }
      // Không có worker: tìm kiếm từng khúc ~25 ms để giao diện không đơ (rút ngắn thời gian nghĩ)
      const g = E.fromJSON(args.state);
      const plan = g ? E.planMove(g, { level: args.level, seed: args.seed }) : { move: null };
      const now = () => performance.now();
      const stop = now() + Math.min(args.timeMs, 1200);
      const step = () => {
        if (!this.pending || this.pending.id !== id) return;
        if (plan.search) {
          plan.search.run(1e9, Math.min(stop, now() + 25), now);
          if (now() < stop) {
            setTimeout(step, 0);
            return;
          }
        }
        this.pending = null;
        cb(plan.search ? plan.search.best() : plan.move);
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

  /* ---------------- Hình học bàn ----------------
   * Lưới: ô (r, c) có tâm (√3·(c + r/2), 1,5·r) với bán kính ô 1 (lục giác đỉnh nhọn).
   * Hình thoi ngoài: (u, v) ∈ {-MARGIN, n-1+MARGIN}²; xoay cả bàn một góc rot. */
  function buildGeom(n, rot) {
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const R = (x, y) => [x * cs - y * sn, x * sn + y * cs];
    const lat = (u, v) => R(SQ3 * (u + v / 2), 1.5 * v);
    const centers = [];
    for (let i = 0; i < n * n; i++) centers.push(lat(i % n, (i / n) | 0));
    const a = -MARGIN, b = n - 1 + MARGIN;
    const corners = [lat(a, a), lat(b, a), lat(b, b), lat(a, b)]; // A gần (0,0), B gần (0,n-1), C gần (n-1,n-1), D gần (n-1,0)
    const hex = [];
    for (let k = 0; k < 6; k++) {
      const ang = rot + Math.PI / 6 + (k * Math.PI) / 3;
      hex.push([Math.cos(ang), Math.sin(ang)]);
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of corners) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    const pad = 0.25;
    return { n, rot, centers, corners, hex, box: [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2] };
  }

  const fmt = (v) => Math.round(v * 1000) / 1000;
  const pts = (list) => list.map(([x, y]) => fmt(x) + ',' + fmt(y)).join(' ');
  const hexPts = (g, i, s) => pts(g.hex.map(([hx, hy]) => [g.centers[i][0] + hx * s, g.centers[i][1] + hy * s]));

  function el(name, attrs, parent) {
    const e = document.createElementNS(SVGNS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /** Vẽ nền: bốn tam giác màu cạnh (Đỏ trên-dưới theo hàng, Xanh trái-phải theo cột) và các ô. */
  function drawBoard(svg, g, edgesG, cellsG) {
    const [x, y, w, h] = g.box;
    svg.setAttribute('viewBox', [fmt(x), fmt(y), fmt(w), fmt(h)].join(' '));
    edgesG.textContent = '';
    cellsG.textContent = '';
    const c = g.centers[(g.n * g.n - 1) / 2];
    const [A, B, C, D] = g.corners;
    el('polygon', { class: 'edge red', points: pts([c, A, B]) }, edgesG);
    el('polygon', { class: 'edge blue', points: pts([c, B, C]) }, edgesG);
    el('polygon', { class: 'edge red', points: pts([c, C, D]) }, edgesG);
    el('polygon', { class: 'edge blue', points: pts([c, D, A]) }, edgesG);
    const out = [];
    for (let i = 0; i < g.n * g.n; i++) out.push(el('polygon', { class: 'hex', points: hexPts(g, i, 1), 'data-i': i }, cellsG));
    return out;
  }

  /* ---------------- Dựng bàn và kích thước ---------------- */
  let cellEls = [];
  let lastDot = null;
  let cursorRing = null;

  function rebuild(g) {
    geom = g;
    cellEls = drawBoard(boardEl, g, edgesEl, cellsEl);
    stonesEl.textContent = '';
    stoneEls = new Array(g.n * g.n).fill(null);
    lastDot = el('circle', { class: 'last-dot', r: 0.2, cx: 0, cy: 0 });
    cursorRing = el('polygon', { class: 'cursor-ring', points: '' });
  }

  function layout() {
    if (!game) return;
    // Khung bàn (.board-box) chiếm phần còn lại của sân sau hai thanh người chơi
    const box = $('board-box');
    const w = box.clientWidth;
    const h = box.clientHeight;
    let best = null, bestScale = -1;
    for (const rot of ROTS) {
      const g = geom && geom.n === game.n && geom.rot === rot ? geom : buildGeom(game.n, rot);
      const s = Math.min(w / g.box[2], h / g.box[3]);
      if (s > bestScale + 0.01) {
        bestScale = s;
        best = g;
      }
    }
    if (best !== geom) {
      rebuild(best);
      renderBoard(true);
    }
    const s = Math.max(4, bestScale);
    boardEl.style.width = Math.floor(best.box[2] * s) + 'px';
    boardEl.style.height = Math.floor(best.box[3] * s) + 'px';
    stage.style.setProperty('--cellpx', Math.round(s * SQ3) + 'px');
  }

  /* ---------------- Vẽ ---------------- */
  function render() {
    renderBoard(false);
    renderBars();
  }

  function renderBoard(still) {
    if (!geom || geom.n !== game.n) return;
    const b = game.board;
    const path = game.winner ? new Set(E.winningPath(game)) : null;
    for (let i = 0; i < b.length; i++) {
      let s = stoneEls[i];
      if (b[i]) {
        const cls = b[i] === RED ? 'red' : 'blue';
        if (!s || s.dataset.c !== cls) {
          if (s) s.remove();
          s = el('circle', { class: 'stone ' + cls + (still || calm() ? '' : ' drop'), r: STONE_R, cx: fmt(geom.centers[i][0]), cy: fmt(geom.centers[i][1]) }, stonesEl);
          s.dataset.c = cls;
          stoneEls[i] = s;
        }
        s.classList.toggle('win', !!path && path.has(i));
      } else if (s) {
        s.remove();
        stoneEls[i] = null;
      }
      const c = cellEls[i];
      c.classList.toggle('empty', !b[i]);
      c.setAttribute('aria-label', E.cellName(i, game.n) + ', ' + (b[i] ? sideName(b[i]) : t('cell.empty')));
    }
    // Chấm đánh dấu nước vừa đi, vòng con trỏ bàn phím (luôn nằm trên cùng)
    if (game.last >= 0 && b[game.last]) {
      lastDot.setAttribute('cx', fmt(geom.centers[game.last][0]));
      lastDot.setAttribute('cy', fmt(geom.centers[game.last][1]));
      stonesEl.appendChild(lastDot);
    } else lastDot.remove();
    if (cursor >= 0 && cursor < b.length) {
      cursorRing.setAttribute('points', hexPts(geom, cursor, 0.9));
      stonesEl.appendChild(cursorRing);
    } else cursorRing.remove();
    boardEl.classList.toggle('over', !!game.winner);
    boardEl.classList.toggle('wait', !humanCanPlay());
    boardEl.classList.toggle('turn-red', game.turn === RED);
    boardEl.classList.toggle('turn-blue', game.turn === BLUE);
  }

  /** Hai thanh người chơi: máy (hoặc Xanh khi 2 người) ở trên, bạn (hoặc Đỏ) ở dưới. */
  function renderBars() {
    if (isPvp()) {
      fillBar($('bar-top'), BLUE, t('bar.p', { side: sideName(BLUE) }), true);
      fillBar($('bar-bottom'), RED, t('bar.p', { side: sideName(RED) }), true);
    } else {
      fillBar($('bar-top'), 3 - cur.human, t('bar.ai'), false);
      fillBar($('bar-bottom'), cur.human, t('bar.you'), true);
    }
  }
  function fillBar(bar, color, name, human) {
    const active = !game.winner && game.turn === color;
    bar.classList.toggle('red', color === RED);
    bar.classList.toggle('blue', color === BLUE);
    bar.classList.toggle('active', active);
    bar.classList.toggle('won', game.winner === color);
    bar.classList.toggle('thinking', active && !human && thinking);
    bar.querySelector('.pname').textContent = name;
    const canSwapHere = human && active && E.canSwap(game) && !thinking;
    let sub = human ? t('bar.goal', { side: sideName(color), edge: t('edge.' + color) }) : t('bar.aiSub', { side: sideName(color), level: t('level.' + cur.level) });
    if (canSwapHere) sub = t('bar.swapHint');
    else if (active && human) sub = isPvp() ? t('bar.turnPvp') : t('bar.turn');
    else if (active && thinking) sub = t('bar.thinking');
    bar.querySelector('.psub').textContent = sub;
    const btn = bar.querySelector('.btn-swap');
    btn.hidden = !canSwapHere;
    btn.setAttribute('aria-label', t('swap.label'));
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
    const live = game && !game.winner && game.moves.length > 0 && !cur.ended;
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
    if (game && !game.winner && game.moves.length > 0 && !cur.ended) {
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
    if (cursor >= g.n * g.n) cursor = -1;
    if (!geom || geom.n !== g.n) geom = null;
    layout();
    if (geom) {
      // ván mới: dựng lại quân không hiệu ứng
      stoneEls.forEach((s) => s && s.remove());
      stoneEls = new Array(g.n * g.n).fill(null);
      renderBoard(true);
    }
    renderBars();
    syncSettingsRows();
  }

  function newGame() {
    const s = readSettings();
    kit.modal.close('modal-result');
    setGame(E.newGame({ n: s.n, swap: s.swap }), { opp: s.opp, level: s.level, human: s.human, humanMoves: 0, seed: (Math.random() * 4294967296) >>> 0, ended: false, hinted: false });
    kit.store.remove(keys.save);
    if (!isPvp()) kit.sdk.start(cur.level);
    kit.sfx('start');
    writeSummary();
    scheduleAi();
  }

  /** Người chơi chạm / bấm Enter vào ô i. */
  function onCell(i) {
    if (!game || game.winner || kit.modal.current()) return;
    if (thinking || (!isPvp() && game.turn !== cur.human)) {
      kit.toast(t('toast.thinking'));
      return;
    }
    if (game.board[i]) {
      kit.sfx('error', { volume: 0.5 });
      kit.toast(t('toast.taken'));
      return;
    }
    commit(i, true);
  }

  function swapMove() {
    if (!game || !E.canSwap(game) || !humanCanPlay()) return;
    commit(SWAP, true);
  }

  function commit(m, byHuman) {
    const mover = game.turn;
    const next = E.play(game, m);
    if (!next) return;
    game = next;
    if (byHuman) cur.humanMoves++;
    const who = isPvp() ? sideName(mover) : byHuman ? t('bar.you') : t('bar.ai');
    if (m === SWAP) {
      announce(t('live.swap', { who, cell: E.cellName(game.last, game.n) }));
      kit.sfx('flip');
      if (!byHuman) kit.toast(t('toast.aiSwap'), 2600);
    } else {
      announce(t('live.move', { who, cell: E.cellName(m, game.n) }));
      if (!game.winner) kit.sfx('place', byHuman ? undefined : { pitch: 0.85 });
    }
    render();
    persist();
    if (game.winner) finish();
    else {
      hintSwap();
      scheduleAi();
    }
  }

  /** Lần đầu tới lượt người cầm Xanh mà được đổi bên: nhắc một lần. */
  function hintSwap() {
    if (cur.hinted || !E.canSwap(game) || isAiTurn()) return;
    cur.hinted = true;
    kit.toast(t('toast.canSwap'), 2600);
  }

  function scheduleAi() {
    if (!isAiTurn() || thinking) return;
    thinking = true;
    const token = ++aiToken;
    const t0 = Date.now();
    render();
    const seed = (cur.seed + game.moves.length * 2654435761) >>> 0;
    AI.think({ state: E.toJSON(game), level: cur.level, seed, timeMs: E.HARD_MS[game.n] }, (move) => {
      if (token !== aiToken) return;
      const wait = Math.max(0, MIN_THINK_MS - (Date.now() - t0));
      setTimeout(() => {
        if (token !== aiToken) return;
        thinking = false;
        const legal = E.legalMoves(game);
        // phòng hờ: không bao giờ để máy đi sai luật
        const m = legal.indexOf(move) >= 0 ? move : legal.filter((x) => x !== SWAP)[Math.floor(Math.random() * (legal.length - 1))];
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

  function finish() {
    if (cur.ended) return;
    cur.ended = true;
    const w = game.winner;
    if (isPvp()) {
      stats.pvp.played++;
      stats.pvp[w === RED ? 'red' : 'blue']++;
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
    // Hex không có hòa: thắng won true, thua won false (ván luôn có ít nhất một nước của người chơi)
    if (won || cur.humanMoves > 0) kit.sdk.end({ mode: cur.level, won, assisted: false });
    kit.sfx(won ? 'win' : 'lose');
    if (won) kit.confetti();
    showResult();
  }

  function showResult() {
    const w = game.winner;
    const n = E.winningPath(game).length;
    let title, text;
    if (isPvp()) {
      title = t('result.winPvp', { side: sideName(w) });
      text = t('result.textPvp', { side: sideName(w), n });
    } else if (w === cur.human) {
      title = t('result.win');
      text = t('result.textWin', { edge: t('edge.' + w), n });
    } else {
      title = t('result.lose');
      text = t('result.textLose', { edge: t('edge.' + w) });
    }
    $('result-title').textContent = title;
    $('result-text').textContent = text;
    const won = isPvp() || w === cur.human;
    $('result-art').className = 'result-art ' + (won ? 'win' : 'lose');
    $('result-art').innerHTML = '<svg viewBox="-1.2 -1.2 2.4 2.4"><polygon class="hex" points="' +
      [0, 1, 2, 3, 4, 5].map((k) => { const a = Math.PI / 6 + (k * Math.PI) / 3; return fmt(Math.cos(a) * 1.15) + ',' + fmt(Math.sin(a) * 1.15); }).join(' ') +
      '"/><circle class="stone ' + (w === RED ? 'red' : 'blue') + '" r="0.72" cx="0" cy="0"/></svg>';
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
    if (['opp', 'level', 'side', 'size', 'swap'].indexOf(key) < 0 || !game) return;
    if (game.winner || !started()) newGame();
    else kit.toast(t('toast.next'));
  }
  /** Chế độ 2 người không cần mức máy và phe. */
  function syncSettingsRows() {
    const pvp = readSettings().opp === 'pvp';
    $('setting-level').hidden = pvp;
    $('setting-side').hidden = pvp;
  }

  /* ---------------- Sự kiện ---------------- */
  boardEl.addEventListener('click', (e) => {
    const c = e.target.closest && e.target.closest('.hex');
    if (!c) return;
    if (cursor >= 0) {
      cursor = -1;
      renderBoard(false);
    }
    onCell(Number(c.getAttribute('data-i')));
  });
  document.querySelectorAll('.btn-swap').forEach((b) => b.addEventListener('click', swapMove));

  /** Phím mũi tên: đi tới ô láng giềng nằm đúng hướng nhất trên màn hình (bàn có thể xoay). */
  function moveCursor(dx, dy) {
    // Dùng phím mũi tên thì đưa focus về bàn để Enter không bấm nhầm nút đang focus
    if (document.activeElement !== boardEl) boardEl.focus({ preventScroll: true });
    const n = game.n;
    if (cursor < 0) cursor = game.last >= 0 ? game.last : (n * n - 1) / 2;
    else if (dx || dy) {
      const [cx, cy] = geom.centers[cursor];
      let best = [];
      let bestDot = 0.35;
      for (const j of E.geo(n).adj[cursor]) {
        const vx = geom.centers[j][0] - cx, vy = geom.centers[j][1] - cy;
        const d = (vx * dx + vy * dy) / Math.hypot(vx, vy);
        if (d > bestDot + 1e-6) {
          bestDot = d;
          best = [j];
        } else if (Math.abs(d - bestDot) <= 1e-6) best.push(j);
      }
      if (best.length) {
        tieFlip = !tieFlip;
        cursor = best.length > 1 && tieFlip ? best[1] : best[0];
      }
    }
    renderBoard(false);
    const b = game.board[cursor];
    announce(E.cellName(cursor, n) + ', ' + (b ? sideName(b) : t('cell.empty')));
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
      else onCell(cursor);
    } else if (k === 'Escape' && cursor >= 0) {
      cursor = -1;
      renderBoard(false);
    } else if (k === 's' || k === 'S') swapMove();
    else if (k === 'n' || k === 'N') requestNew();
    else return;
    e.preventDefault();
  });

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
    $('stats-pvp').textContent = t('stats.pvp', { n: p.played, r: p.red, b: p.blue });
  }

  /** Hình minh họa trong Cách chơi: bàn 5×5, Đỏ đã nối hai cạnh đỏ, có một cầu. */
  (function drawHelpArt() {
    const svg = $('help-art');
    const g = buildGeom(5, -Math.PI / 6);
    const edgesG = el('g', {}, svg);
    const cellsG = el('g', {}, svg);
    drawBoard(svg, g, edgesG, cellsG);
    const red = [[0, 2], [1, 2], [2, 1], [3, 1], [4, 0]];
    const blue = [[1, 1], [2, 2], [2, 3], [3, 0], [1, 4]];
    const put = (list, cls) => list.forEach(([r, c]) => el('circle', { class: 'stone ' + cls, r: STONE_R, cx: fmt(g.centers[r * 5 + c][0]), cy: fmt(g.centers[r * 5 + c][1]) }, svg));
    put(red, 'red win');
    put(blue, 'blue');
  })();

  kit.onLeave(persist);
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const okSave = saved && saved.v === 1 && (saved.opp === 'ai' || saved.opp === 'pvp') && LEVELS.indexOf(saved.level) >= 0 &&
    (saved.human === RED || saved.human === BLUE) && Number.isInteger(saved.humanMoves) && saved.humanMoves >= 0 && Number.isInteger(saved.seed);
  const restored = okSave ? E.fromJSON(saved.game) : null;
  if (restored && !restored.winner && restored.moves.length > 0 && saved.humanMoves <= restored.moves.length) {
    setGame(restored, { opp: saved.opp, level: saved.level, human: saved.human, humanMoves: saved.humanMoves, seed: saved.seed >>> 0, ended: false, hinted: true });
    if (!isPvp()) kit.sdk.start(cur.level, true);
    kit.toast(t('toast.saved'));
    writeSummary();
    scheduleAi();
  } else {
    newGame();
  }
  // Lần đầu mở game: hiện Cách chơi (luật Hex ít người biết)
  if (!kit.settings.get().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
})();
