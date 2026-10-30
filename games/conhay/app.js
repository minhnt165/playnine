/* =====================================================================
 * Cờ Nhảy - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Bàn sao vẽ bằng SVG; bạn luôn ở góc dưới (quân đỏ), đối thủ ở góc trên (2 người) hoặc
 *     hai góc trên trái / trên phải (3 người: bạn + 2 máy)
 *   - Chuột / chạm: chạm quân của mình để chọn (các lỗ đến được hiện chấm, kể cả cuối chuỗi nhảy;
 *     rê chuột lên chấm thấy đường nhảy), chạm chấm để đi; quân nhảy từng bước có hoạt cảnh
 *   - Bàn phím: mũi tên di chuyển con trỏ, Enter / Space chọn và đi, Esc bỏ chọn, N ván mới
 *   - Máy nghĩ trong Web Worker dựng từ mã nguồn engine (Blob); không có worker thì tính bằng setTimeout
 *   - Báo ván cho cổng chỉ ở chế độ đấu 1 máy (metric wins, mode = mức máy):
 *     ván mới kit.sdk.start(level), mở lại ván dở kit.sdk.start(level, true);
 *     hết ván kit.sdk.end({ mode, won, assisted: false }) (thua / hòa gửi won: false);
 *     bỏ ván đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì. Không có đi lại.
 *     Chế độ 2 máy và 2 người không gọi sdk.start / sdk.end (không xếp hạng).
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const LEVELS = E.LEVELS;
  const OPPS = ['ai1', 'ai2', 'pvp'];
  const kit = PNKit.init({
    gameId: 'conhay',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { level: 'medium', opp: 'ai1' },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);
  const MIN_THINK_MS = 500; // máy "nghĩ" ít nhất chừng này để người chơi kịp thấy nước vừa đi
  const CALM_THINK_MS = 300; // khi giảm chuyển động vẫn chờ một chút cho tự nhiên
  const HOP_MS = 190; // mỗi bước nhảy
  const STEP_MS = 160; // một bước đi thường
  const U = 10; // khoảng cách hai lỗ kề trong hệ tọa độ SVG
  const VB = { x: -67, y: -76.5, w: 134, h: 153 };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const PX = (c) => +(E.xOf(c) * U).toFixed(2);
  const PY = (c) => +(E.yOf(c) * U).toFixed(2);

  const stage = $('stage');
  const boxEl = $('board-box');
  const boardEl = $('board');
  const bgEl = $('layer-bg');
  const holesEl = $('layer-holes');
  const trailEl = $('layer-trail');
  const marksEl = $('layer-marks');
  const piecesEl = $('layer-pieces');
  const playersEl = $('players');
  boardEl.setAttribute('viewBox', VB.x + ' ' + VB.y + ' ' + VB.w + ' ' + VB.h);

  /* ---------------- Thống kê ---------------- */
  const toInt = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const st = { levels: {}, multi: { played: 0, won: 0, drawn: 0 }, streak: toInt(raw.streak), best: toInt(raw.best) };
    for (const lv of LEVELS) {
      const r = (raw.levels && raw.levels[lv]) || {};
      st.levels[lv] = { played: toInt(r.played), won: toInt(r.won), lost: toInt(r.lost), drawn: toInt(r.drawn) };
    }
    const m = raw.multi || {};
    st.multi = { played: toInt(m.played), won: toInt(m.won), drawn: toInt(m.drawn) };
    return st;
  }
  const stats = loadStats();
  const totals = () => LEVELS.reduce((a, lv) => ({ played: a.played + stats.levels[lv].played, won: a.won + stats.levels[lv].won }), { played: 0, won: 0 });

  /* ---------------- Trạng thái ván ---------------- */
  // cur: { level, opp ('ai1' | 'ai2' | 'pvp'), humanMoves (số nước người đã đi), ended }
  let game = null;
  let cur = null;
  let selected = -1; // lỗ của quân đang chọn
  let targets = []; // lỗ đến được của quân đang chọn
  let hover = -1; // lỗ đích đang rê chuột / con trỏ (xem trước đường nhảy)
  let cursor = -1; // con trỏ bàn phím; -1 = chưa dùng bàn phím
  let cursorX = 0; // cột "nhớ" khi đi lên / xuống bằng phím
  let thinking = false;
  let animating = false;
  let aiToken = 0;
  let moveToken = 0;
  let resultTimer = 0;
  let warned = 0; // lượt gần nhất đã nhắc "còn quân ở nhà"
  const pieceAt = new Array(E.N).fill(null); // lỗ -> phần tử quân

  const isHuman = (p) => cur.opp === 'pvp' || p === 0;
  const ranked = () => cur.opp === 'ai1';
  const inProgress = () => game && game.winner == null && cur.humanMoves > 0;
  const humanCanPlay = () => game && game.winner == null && !thinking && !animating && isHuman(game.turn) && !kit.modal.current();

  /** Tên người chơi p theo chế độ: Bạn / Máy / Máy 1, Máy 2 / Đỏ, Xanh. */
  function nameOf(p) {
    if (cur.opp === 'pvp') return t('side.' + p);
    if (p === 0) return t('bar.you');
    return cur.opp === 'ai2' ? t('bar.aiN', { n: p }) : t('bar.ai');
  }
  /** Tên lỗ cho trình đọc màn hình: hàng 1..17 tính từ dưới lên, lỗ đếm từ trái sang. */
  function cellName(c) {
    const r = E.rOf(c);
    let k = 1;
    for (let x = c - 1; x >= 0 && E.rOf(x) === r; x--) k++;
    return t('cell.name', { row: 9 - r, n: k });
  }

  /* ---------------- Máy nghĩ trong Web Worker ---------------- */
  const AI = {
    worker: null,
    pending: null, // { id, state, level, cb }
    nextId: 0,
    source() {
      return 'var G = (' + E.factory.toString() + ')();\n' +
        'self.onmessage = function (e) {\n' +
        '  var d = e.data, g = G.fromJSON(d.state);\n' +
        '  var r = g ? G.chooseMove(g, { level: d.level }) : { move: null };\n' +
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
            this.think(p.state, p.level, p.cb);
          }
        };
      } catch (e) {
        this.worker = null;
      }
    },
    think(state, level, cb) {
      const id = ++this.nextId;
      this.pending = { id, state, level, cb };
      if (this.worker) {
        this.worker.postMessage({ id, state, level });
        return;
      }
      setTimeout(() => {
        if (!this.pending || this.pending.id !== id) return;
        this.pending = null;
        const g = E.fromJSON(state);
        cb(g ? E.chooseMove(g, { level }).move : null);
      }, 30);
    },
    cancel() {
      if (!this.pending) return;
      this.pending = null;
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
        this.start();
      }
    },
  };
  AI.start();

  /* ---------------- Dựng bàn ---------------- */
  function svg(tag, attrs, parent) {
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  const pt = (c) => PX(c) + ',' + PY(c);
  const cellQR = (q, r) => E.cellAt(q, r);

  /** Ba đỉnh của góc k (đỉnh nhọn + hai đầu hàng đáy) để tô màu góc. */
  function cornerTri(k) {
    const cells = E.CORNERS[k];
    const apex = E.APEX[k];
    // Hai đầu hàng đáy: hai lỗ trong góc xa đỉnh nhất và xa nhau nhất
    const base = cells.filter((c) => E.dist(c, apex) === 3);
    let a = base[0];
    let b = base[0];
    for (const x of base) for (const y of base) if (E.dist(x, y) > E.dist(a, b)) { a = x; b = y; }
    return [apex, a, b];
  }
  /** Đa giác nới ra `pad` đơn vị quanh tâm (để viền góc đích bao ngoài các lỗ). */
  function inflate(cells, pad) {
    const cx = cells.reduce((s, c) => s + PX(c), 0) / cells.length;
    const cy = cells.reduce((s, c) => s + PY(c), 0) / cells.length;
    return cells.map((c) => {
      const dx = PX(c) - cx;
      const dy = PY(c) - cy;
      const l = Math.hypot(dx, dy) || 1;
      return (PX(c) + (dx / l) * pad).toFixed(2) + ',' + (PY(c) + (dy / l) * pad).toFixed(2);
    }).join(' ');
  }

  function buildBoard() {
    bgEl.textContent = '';
    // Ngôi sao: 6 đỉnh góc xen 6 đỉnh lõm (đỉnh lục giác giữa), viền dày bo tròn làm lề
    const star = [[4, -8], [4, -4], [8, -4], [4, 0], [4, 4], [0, 4], [-4, 8], [-4, 4], [-8, 4], [-4, 0], [-4, -4], [0, -4]]
      .map(([q, r]) => pt(cellQR(q, r))).join(' ');
    svg('polygon', { class: 'star-edge', points: star }, bgEl);
    svg('polygon', { class: 'star', points: star }, bgEl);
    // Góc nhà tô màu chủ góc; góc đích của từng người viền nét đứt màu người đó
    game.seats.forEach((k, p) => {
      const g = svg('g', { class: 'tint pl' + p }, bgEl);
      svg('polygon', { points: cornerTri(k).map(pt).join(' ') }, g);
    });
    game.seats.forEach((k, p) => {
      svg('polygon', { class: 'goal pl' + p, points: inflate(cornerTri((k + 3) % 6), 6.2) }, bgEl);
    });
    if (!holesEl.childNodes.length) {
      for (let c = 0; c < E.N; c++) {
        const g = svg('g', { class: 'hole', 'data-cell': c, transform: 'translate(' + pt(c) + ')' }, holesEl);
        svg('circle', { class: 'hit', r: 5 }, g);
        svg('circle', { class: 'pit', r: 2.7 }, g);
      }
    }
  }

  function makePiece(p) {
    const g = svg('g', { class: 'pc pl' + p }, piecesEl);
    svg('circle', { class: 'pc-body', r: 4.15 }, g);
    svg('circle', { class: 'pc-shine', cx: -1.35, cy: -1.55, r: 1.55 }, g);
    g.player = p;
    return g;
  }
  const tr = (c, s) => 'translate(' + PX(c) + 'px, ' + PY(c) + 'px) scale(' + (s || 1) + ')';
  function place(el, c) {
    el.style.transform = tr(c);
  }

  /** Đồng bộ phần tử quân với bàn (không hoạt cảnh). */
  function syncPieces() {
    for (let c = 0; c < E.N; c++) {
      const want = game.board[c];
      let el = pieceAt[c];
      if (el && (want < 0 || el.player !== want)) {
        el.remove();
        el = pieceAt[c] = null;
      }
      if (want >= 0 && !el) el = pieceAt[c] = makePiece(want);
      if (el) place(el, c);
    }
  }
  function clearPieces() {
    for (let c = 0; c < E.N; c++) pieceAt[c] = null;
    piecesEl.textContent = '';
  }

  /* ---------------- Kích thước ---------------- */
  function layout() {
    const w = boxEl.clientWidth;
    const h = boxEl.clientHeight;
    if (!w || !h) return;
    const s = Math.max(120, Math.min(w / VB.w, h / VB.h) * VB.w);
    boardEl.style.width = Math.floor(s) + 'px';
    boardEl.style.height = Math.floor((s * VB.h) / VB.w) + 'px';
  }

  /* ---------------- Vẽ ---------------- */
  function render() {
    syncPieces();
    renderTrail();
    renderMarks();
    renderPlayers();
  }

  /** Nước vừa đi: đường nét đứt màu người đi qua từng điểm dừng, vòng ở lỗ xuất phát. */
  function renderTrail() {
    trailEl.textContent = '';
    const l = game.last;
    if (!l || animating) return;
    const g = svg('g', { class: 'trail pl' + l.p }, trailEl);
    svg('circle', { class: 'trail-from', r: 3.6, cx: PX(l.path[0]), cy: PY(l.path[0]) }, g);
    svg('polyline', { points: l.path.map(pt).join(' ') }, g);
    for (let i = 1; i < l.path.length - 1; i++) svg('circle', { class: 'trail-hop', r: 1.3, cx: PX(l.path[i]), cy: PY(l.path[i]) }, g);
  }

  /** Quân đang chọn, lỗ đến được, đường xem trước, con trỏ bàn phím. */
  function renderMarks() {
    marksEl.textContent = '';
    const can = humanCanPlay();
    if (selected >= 0) {
      svg('circle', { class: 'sel-ring pl' + game.turn, r: 5.3, cx: PX(selected), cy: PY(selected) }, marksEl);
      if (hover >= 0 && targets.indexOf(hover) >= 0) {
        const path = E.pathOf(game, selected, hover);
        if (path) svg('polyline', { class: 'preview pl' + game.turn, points: path.map(pt).join(' ') }, marksEl);
      }
      for (const c of targets) svg('circle', { class: 'dot' + (c === hover ? ' on' : ''), r: c === hover ? 2.8 : 2.2, cx: PX(c), cy: PY(c) }, marksEl);
    }
    if (cursor >= 0) svg('circle', { class: 'cursor', r: 5.4, cx: PX(cursor), cy: PY(cursor) }, marksEl);
    boardEl.classList.toggle('wait', !can);
    for (let c = 0; c < E.N; c++) {
      const el = pieceAt[c];
      if (el) el.classList.toggle('sel', c === selected);
    }
  }

  /** Thẻ người chơi theo thứ tự lượt: tên, trạng thái, số quân đã về góc đích. */
  function renderPlayers() {
    const n = game.seats.length;
    let html = '';
    for (let p = 0; p < n; p++) {
      const over = game.winner != null;
      const active = !over && game.turn === p;
      const ai = !isHuman(p);
      let sub;
      if (over) sub = game.winner === p ? t('bar.winner') : '';
      else if (active && ai && thinking) sub = t('bar.thinking');
      else if (active) sub = cur.opp === 'pvp' ? t('bar.turnOf') : t('bar.turn');
      else sub = ai ? t('level.' + cur.level) : '';
      const home = E.inHome(game, p);
      const warn = !over && home > 0 && game.turns[p] >= 20 && !ai;
      if (warn && !active) sub = t('bar.homeLeft', { n: home });
      else if (warn) sub += ' · ' + t('bar.homeLeft', { n: home });
      if (!sub) sub = t('bar.turnNo', { n: game.turns[p] });
      html += '<div class="pchip pl' + p + (active ? ' active' : '') + (active && ai && thinking ? ' thinking' : '') + (warn ? ' warn' : '') + '">' +
        '<span class="pdot" aria-hidden="true"></span>' +
        '<span class="pinfo"><span class="pname">' + nameOf(p) + '</span><span class="psub">' + sub + '</span></span>' +
        '<span class="pcount" title="' + t('bar.inGoal') + '">' + E.inTarget(game, p) + '<small>/10</small></span></div>';
    }
    if (playersEl.innerHTML !== html) playersEl.innerHTML = html;
    playersEl.classList.toggle('three', n === 3);
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
    const live = game && game.winner == null && cur.humanMoves > 0;
    const mine = game ? E.inTarget(game, 0) : 0;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: tot.played,
      won: tot.won,
      note: tot.played ? t('summary.note', { n: tot.won }) : t('summary.none'),
      stats: tot.played ? [{ value: kit.i18n.fmtNumber(tot.won), label: t('stats.won') }, { value: kit.i18n.fmtNumber(stats.best), label: t('stats.best') }] : [],
      resume: live ? { title: t('app.name'), detail: t('summary.resume', { mode: modeLabel(), n: mine }), pct: mine / 10 } : null,
      now: Date.now(),
    }));
  }
  const modeLabel = () => (cur.opp === 'ai1' ? t('level.' + cur.level) : t('opp.' + cur.opp));
  function persist() {
    if (game && game.winner == null && cur.humanMoves > 0 && !cur.ended) {
      kit.store.write(keys.save, { v: 1, level: cur.level, opp: cur.opp, humanMoves: cur.humanMoves, game: E.toJSON(game) });
    } else {
      kit.store.remove(keys.save);
    }
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */
  function setGame(g, c) {
    cancelAi();
    clearTimeout(resultTimer);
    moveToken++;
    animating = false;
    game = g;
    cur = c;
    selected = -1;
    targets = [];
    hover = -1;
    warned = 0;
    clearPieces();
    buildBoard();
    render();
  }

  function newGame() {
    const s = kit.settings.get();
    const level = LEVELS.indexOf(s.level) >= 0 ? s.level : 'medium';
    const opp = OPPS.indexOf(s.opp) >= 0 ? s.opp : 'ai1';
    kit.modal.close('modal-result');
    setGame(E.newGame({ players: opp === 'ai2' ? 3 : 2 }), { level, opp, humanMoves: 0, ended: false });
    kit.store.remove(keys.save);
    if (opp === 'ai1') kit.sdk.start(level);
    kit.sfx('start');
    writeSummary();
    scheduleAi();
  }

  function select(c) {
    selected = c;
    targets = c >= 0 ? E.movesFrom(game, c) : [];
    hover = -1;
  }

  /** Người chơi chạm / bấm Enter vào lỗ c. */
  function onCell(c) {
    if (!game || game.winner != null || kit.modal.current() || animating) return;
    if (thinking || !isHuman(game.turn)) {
      kit.toast(t('toast.thinking'));
      return;
    }
    const v = game.board[c];
    if (selected >= 0 && targets.indexOf(c) >= 0) {
      commit(E.encode(selected, c), true);
      return;
    }
    if (v === game.turn) {
      if (c === selected) {
        select(-1);
      } else {
        select(c);
        if (!targets.length) {
          kit.sfx('error', { volume: 0.5 });
          kit.toast(t('toast.noMove'));
        } else {
          kit.sfx('tap');
        }
      }
      renderMarks();
      return;
    }
    if (selected >= 0) {
      select(-1);
      kit.sfx('error', { volume: 0.5 });
      renderMarks();
      return;
    }
    if (v >= 0) kit.toast(cur.opp === 'pvp' ? t('toast.notTurn', { side: t('side.' + game.turn) }) : t('toast.notYours'));
  }

  function commit(m, byHuman) {
    const next = E.play(game, m);
    if (!next) return;
    const p = game.turn;
    game = next;
    if (byHuman) cur.humanMoves++;
    select(-1);
    const path = game.last.path;
    const jumps = E.dist(path[0], path[1]) === 2 ? path.length - 1 : 0;
    announce(jumps
      ? t('live.jump', { who: nameOf(p), n: jumps, from: cellName(path[0]), to: cellName(path[path.length - 1]) })
      : t('live.step', { who: nameOf(p), from: cellName(path[0]), to: cellName(path[1]) }));
    persist();
    renderPlayers();
    animateMove(path, () => {
      render();
      if (game.winner != null) {
        finish();
        return;
      }
      if (byHuman) warnHome(p);
      scheduleAi();
    });
  }

  /** Quân đi theo đường: nhảy thì nảy lên ở giữa mỗi bước, mỗi bước một tiếng "pop" cao dần. */
  function animateMove(path, done) {
    const from = path[0];
    const to = path[path.length - 1];
    const el = pieceAt[from];
    pieceAt[from] = null;
    pieceAt[to] = el;
    const token = moveToken;
    const jump = E.dist(path[0], path[1]) === 2;
    const hops = path.length - 1;
    trailEl.textContent = '';
    marksEl.textContent = '';
    if (!el || calm() || typeof el.animate !== 'function') {
      if (el) place(el, to);
      kit.sfx(jump ? 'pop' : 'move');
      done();
      return;
    }
    animating = true;
    piecesEl.appendChild(el); // quân đang bay nằm trên cùng
    const per = jump ? HOP_MS : STEP_MS;
    const frames = [];
    for (let i = 0; i < hops; i++) {
      frames.push({ transform: tr(path[i]), offset: i / hops, easing: 'ease-in-out' });
      if (jump) {
        const mx = (PX(path[i]) + PX(path[i + 1])) / 2;
        const my = (PY(path[i]) + PY(path[i + 1])) / 2;
        frames.push({ transform: 'translate(' + mx + 'px, ' + my + 'px) scale(1.28)', offset: (i + 0.5) / hops, easing: 'ease-in-out' });
      }
      const k = i;
      setTimeout(() => {
        if (token === moveToken) kit.sfx(jump ? 'pop' : 'move', jump ? { pitch: 1 + k * 0.07 } : undefined);
      }, per * (i + 0.85));
    }
    frames.push({ transform: tr(to), offset: 1 });
    place(el, to);
    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      if (token !== moveToken) return;
      animating = false;
      done();
    };
    try {
      const anim = el.animate(frames, { duration: per * hops });
      anim.onfinish = end;
      anim.oncancel = end;
    } catch (e) {
      end();
    }
    // Phòng hờ trình duyệt không báo xong (tab ẩn…)
    setTimeout(end, per * hops + 400);
  }

  /** Nhắc luật chống chiếm góc khi bạn còn quân trong góc nhà ở lượt 20 và 25. */
  function warnHome(p) {
    if (cur.opp === 'ai2' || game.seats.length !== 2) return;
    const n = E.inHome(game, p);
    const turn = game.turns[p];
    if (!n || (turn !== 20 && turn !== 25) || warned === turn) return;
    warned = turn;
    kit.toast(t('toast.home', { n, left: E.HOME_LIMIT - turn }), 3200);
  }

  function scheduleAi() {
    if (!game || game.winner != null || isHuman(game.turn) || thinking || animating) return;
    thinking = true;
    const token = ++aiToken;
    const t0 = Date.now();
    renderPlayers();
    renderMarks();
    AI.think(E.toJSON(game), cur.level, (move) => {
      if (token !== aiToken) return;
      const wait = Math.max(0, (calm() ? CALM_THINK_MS : MIN_THINK_MS) - (Date.now() - t0));
      setTimeout(() => {
        if (token !== aiToken) return;
        thinking = false;
        const legal = E.legalMoves(game);
        // phòng hờ: không bao giờ để máy đi sai luật
        const m = legal.indexOf(move) >= 0 ? move : legal[0];
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
    const draw = w === E.DRAW;
    const won = cur.opp === 'pvp' ? !draw : w === 0;
    if (cur.opp === 'ai1') {
      const lv = stats.levels[cur.level];
      lv.played++;
      if (w === 0) {
        lv.won++;
        stats.streak++;
        stats.best = Math.max(stats.best, stats.streak);
      } else {
        if (draw) lv.drawn++;
        else lv.lost++;
        stats.streak = 0;
      }
      // Thua / hòa vẫn là một ván đã chơi: gửi won: false (ván có ít nhất một nước của người chơi)
      if (w === 0 || cur.humanMoves > 0) kit.sdk.end({ mode: cur.level, won: w === 0, assisted: false });
    } else if (cur.opp === 'ai2') {
      stats.multi.played++;
      if (w === 0) stats.multi.won++;
      if (draw) stats.multi.drawn++;
    }
    saveStats();
    persist();
    kit.sfx(won ? 'win' : draw ? 'draw' : 'lose');
    if (won) kit.confetti();
    showResult();
  }

  function showResult() {
    const w = game.winner;
    const draw = w === E.DRAW;
    let title;
    let text;
    if (draw) {
      title = t('result.draw');
      text = t('reason.' + game.reason);
    } else if (cur.opp === 'pvp') {
      title = t('result.pvp', { side: t('side.' + w) });
      text = t('reason.' + game.reason + '.pvp', { side: t('side.' + w), other: t('side.' + (1 - w)) });
    } else if (w === 0) {
      title = t('result.win');
      text = t('reason.' + game.reason + '.win');
    } else {
      title = t('result.lose');
      text = t('reason.' + game.reason + '.lose', { name: nameOf(w) });
    }
    $('result-title').textContent = title;
    $('result-text').textContent = text;
    const art = $('result-art');
    const mood = draw ? 'draw' : cur.opp === 'pvp' || w === 0 ? 'win' : 'lose';
    art.className = 'result-art ' + mood;
    art.innerHTML = '<svg viewBox="-10 -10 20 20"><g class="pc pl' + (draw ? 0 : w) + '"><circle class="pc-body" r="8"/><circle class="pc-shine" cx="-2.6" cy="-3" r="3"/></g></svg>';
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => kit.modal.open('modal-result'), calm() ? 200 : 700);
  }

  /** Ván đang dở (bạn đã đi) thì hỏi trước; ván xếp hạng bỏ giữa chừng tính là thua. */
  function requestNew() {
    if (inProgress()) {
      $('confirm-text').textContent = t(ranked() ? 'confirm.text' : 'confirm.textFree');
      kit.modal.open('modal-confirm');
    } else {
      newGame();
    }
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inProgress() && ranked()) {
      const lv = stats.levels[cur.level];
      lv.played++;
      lv.lost++;
      stats.streak = 0;
      saveStats();
      kit.sdk.end({ mode: cur.level, won: false, assisted: false });
    }
    newGame();
  }

  /** Đổi mức / đối thủ: chưa đi nước nào thì chơi lại ngay với cài đặt mới, đã đi thì để ván sau. */
  function onSetting(key) {
    if (key !== 'level' && key !== 'opp') return;
    if (!game) return;
    if (key === 'level' && cur.opp === 'pvp') return; // 2 người: mức máy không ảnh hưởng ván này
    if (game.winner == null && cur.humanMoves === 0) newGame();
    else kit.toast(t('toast.next'));
  }

  /* ---------------- Sự kiện ---------------- */
  /** Lỗ dưới điểm chạm: phần tử [data-cell], không thì lỗ gần nhất trong bán kính 0,6 ô. */
  function cellFromEvent(e) {
    const g = e.target && e.target.closest && e.target.closest('[data-cell]');
    if (g) return Number(g.getAttribute('data-cell'));
    const ctm = boardEl.getScreenCTM && boardEl.getScreenCTM();
    if (!ctm) return -1;
    const p = boardEl.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const s = p.matrixTransform(ctm.inverse());
    let best = -1;
    let bd = (U * 0.6) ** 2;
    for (let c = 0; c < E.N; c++) {
      const d = (PX(c) - s.x) ** 2 + (PY(c) - s.y) ** 2;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  boardEl.addEventListener('click', (e) => {
    const c = cellFromEvent(e);
    if (c < 0) return;
    if (cursor >= 0) {
      cursor = -1;
      renderMarks();
    }
    onCell(c);
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (selected < 0 || e.pointerType === 'touch') return;
    const c = cellFromEvent(e);
    const h = targets.indexOf(c) >= 0 ? c : -1;
    if (h !== hover) {
      hover = h;
      renderMarks();
    }
  });
  boardEl.addEventListener('pointerleave', () => {
    if (hover >= 0 && cursor < 0) {
      hover = -1;
      renderMarks();
    }
  });

  /** Con trỏ bàn phím: trái / phải theo hàng, lên / xuống sang hàng kề, giữ cột gần nhất. */
  function moveCursor(dq, dr) {
    if (document.activeElement !== boardEl) boardEl.focus({ preventScroll: true });
    if (cursor < 0) {
      cursor = selected >= 0 ? selected : E.cellAt(-2, 6);
      cursorX = E.xOf(cursor);
    } else if (dr === 0) {
      const n = E.cellAt(E.qOf(cursor) + dq, E.rOf(cursor));
      if (n >= 0) {
        cursor = n;
        cursorX = E.xOf(n);
      }
    } else {
      const r = E.rOf(cursor) + dr;
      let best = -1;
      for (let c = 0; c < E.N; c++) {
        if (E.rOf(c) !== r) continue;
        if (best < 0 || Math.abs(E.xOf(c) - cursorX) < Math.abs(E.xOf(best) - cursorX) - 1e-9) best = c;
      }
      if (best >= 0) cursor = best;
    }
    hover = targets.indexOf(cursor) >= 0 ? cursor : -1;
    renderMarks();
    const v = game.board[cursor];
    let msg = cellName(cursor);
    if (v >= 0) msg += ', ' + t('cell.piece', { name: nameOf(v) });
    if (hover >= 0) msg += ', ' + t('cell.target');
    announce(msg);
  }

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key;
    const onButton = e.target && e.target.closest && e.target.closest('button, input, select, a');
    if (k === 'ArrowLeft') moveCursor(-1, 0);
    else if (k === 'ArrowRight') moveCursor(1, 0);
    else if (k === 'ArrowUp') moveCursor(0, -1);
    else if (k === 'ArrowDown') moveCursor(0, 1);
    else if ((k === 'Enter' || k === ' ') && !onButton) {
      if (cursor < 0) moveCursor(0, 0);
      else onCell(cursor);
    } else if (k === 'Escape' && selected >= 0) {
      select(-1);
      renderMarks();
    } else if (k === 'n' || k === 'N') requestNew();
    else return;
    e.preventDefault();
  });

  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', newGame);
  $('btn-stats').addEventListener('click', renderStats);

  function renderStats() {
    const tot = totals();
    const fmt = kit.i18n.fmtNumber;
    $('stats-played').textContent = fmt(tot.played);
    $('stats-won').textContent = fmt(tot.won);
    $('stats-streak').textContent = fmt(stats.streak);
    $('stats-best').textContent = fmt(stats.best);
    const m = stats.multi;
    $('stats-body').innerHTML = LEVELS.map((lv) => {
      const r = stats.levels[lv];
      return '<tr><th scope="row">' + t('level.' + lv) + '</th><td>' + fmt(r.played) + '</td><td>' + fmt(r.won) + '</td><td>' + fmt(r.lost) + '</td><td>' + fmt(r.drawn) + '</td></tr>';
    }).join('') + '<tr class="multi"><th scope="row">' + t('opp.ai2') + '</th><td>' + fmt(m.played) + '</td><td>' + fmt(m.won) + '</td><td>' +
      fmt(Math.max(0, m.played - m.won - m.drawn)) + '</td><td>' + fmt(m.drawn) + '</td></tr>';
  }

  kit.onLeave(persist);
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe(boxEl);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const okSave = saved && saved.v === 1 && LEVELS.indexOf(saved.level) >= 0 && OPPS.indexOf(saved.opp) >= 0 &&
    Number.isInteger(saved.humanMoves) && saved.humanMoves > 0;
  const restored = okSave ? E.fromJSON(saved.game) : null;
  const fits = restored && restored.winner == null && restored.seats.length === (saved.opp === 'ai2' ? 3 : 2);
  layout();
  if (fits) {
    setGame(restored, { level: saved.level, opp: saved.opp, humanMoves: saved.humanMoves, ended: false });
    if (saved.opp === 'ai1') kit.sdk.start(saved.level, true);
    kit.toast(t('toast.saved'));
    writeSummary();
    scheduleAi();
  } else {
    newGame();
  }
  layout();
})();
