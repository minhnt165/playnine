/* =====================================================================
 * Xoay Cờ - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Mỗi lượt hai bước: chạm ô trống để đặt quân (chạm lại để nhấc ra), rồi chạm một mũi tên
 *     quanh bàn để xoay góc đó 90° sang phải / trái; góc xoay có hoạt cảnh (tắt khi giảm chuyển động)
 *   - Đấu máy (Dễ / Vừa / Khó, cầm Trắng đi trước hoặc Đen) hoặc 2 người cùng máy, chọn trong Cài đặt
 *   - Bàn phím: mũi tên di chuyển con trỏ, Enter / Space đặt quân, Q / E xoay góc dưới con trỏ
 *     sang trái / phải, Esc nhấc quân vừa đặt, N ván mới
 *   - Máy nghĩ trong Web Worker dựng từ mã nguồn engine (Blob); không có worker thì tính bằng setTimeout
 *   - Báo ván cho cổng (metric wins, mode = mức máy; 2 người không báo):
 *     ván mới kit.sdk.start(level), mở lại ván dở kit.sdk.start(level, true);
 *     hết ván kit.sdk.end({ mode, won, assisted: false }) (thua / hòa gửi won: false);
 *     bỏ ván đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì. Không có đi lại.
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const LEVELS = E.LEVELS;
  const kit = PNKit.init({
    gameId: 'xoayco',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { opponent: 'ai', level: 'medium', side: 'white' },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);
  const MIN_THINK_MS = 550; // máy "nghĩ" ít nhất chừng này để người chơi kịp thấy nước của mình
  const AI_PLACE_MS = 380; // máy đặt quân xong chờ chừng này rồi mới xoay
  const ROT_MS = 420; // thời gian hoạt cảnh xoay góc (khớp transition trong style.css)
  const HARD_MS = 1500; // giới hạn giờ nghĩ của mức Khó
  const COLS = 'abcdef';
  const SIDE_KEY = ['white', 'black'];
  // Hai mũi tên mỗi góc: một ở cạnh ngang (trên / dưới), một ở cạnh dọc (trái / phải), sát góc ngoài.
  // Chiều của mũi tên theo chiều quay quanh tâm góc ở chỗ đó, nên mỗi góc có một mũi tên phải và một mũi tên trái.
  const ROTS = [
    { q: 0, edge: 'top', dir: E.CW }, { q: 0, edge: 'left', dir: E.CCW },
    { q: 1, edge: 'top', dir: E.CCW }, { q: 1, edge: 'right', dir: E.CW },
    { q: 2, edge: 'bottom', dir: E.CCW }, { q: 2, edge: 'left', dir: E.CW },
    { q: 3, edge: 'bottom', dir: E.CW }, { q: 3, edge: 'right', dir: E.CCW },
  ];

  const stage = $('stage');
  const wrap = $('board-wrap');
  const boardEl = $('board');
  const quadEls = Array.from(boardEl.querySelectorAll('.quad'));
  const rotsEl = $('rots');

  /* ---------------- Thống kê ---------------- */
  const toInt = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const st = { levels: {}, streak: toInt(raw.streak), best: toInt(raw.best) };
    for (const lv of LEVELS) {
      const r = (raw.levels && raw.levels[lv]) || {};
      st.levels[lv] = { played: toInt(r.played), won: toInt(r.won), lost: toInt(r.lost), drawn: toInt(r.drawn) };
    }
    return st;
  }
  const stats = loadStats();
  const totals = () => LEVELS.reduce((a, lv) => ({ played: a.played + stats.levels[lv].played, won: a.won + stats.levels[lv].won }), { played: 0, won: 0 });

  /* ---------------- Trạng thái ván ---------------- */
  // cur: { mode 'ai' | 'pvp', level, human (0 Trắng | 1 Đen), humanMoves, seed, ended }
  let game = null;
  let cur = null;
  let pending = -1; // ô vừa đặt quân, chờ xoay (chưa ghi vào ván)
  let pendingSide = 0;
  let cursor = -1; // con trỏ bàn phím; -1 = chưa dùng bàn phím
  let thinking = false; // máy đang nghĩ
  let animating = false; // đang chạy hoạt cảnh xoay / nước của máy
  let aiToken = 0;
  let resultTimer = 0;
  let flash = -1; // chỉ số mũi tên đang sáng (nước máy sắp xoay)
  let unit = 44;

  const vsAi = () => cur.mode === 'ai';
  const isAiTurn = () => game && game.winner == null && vsAi() && game.turn !== cur.human;
  const inProgress = () => game && game.winner == null && cur.humanMoves > 0;
  // Tới lượt người chơi và bàn đang rảnh (hộp thoại mở thì onCell / onRotate / phím tự chặn riêng)
  const canAct = () => game && game.winner == null && !thinking && !animating && (!vsAi() || game.turn === cur.human);
  const cellName = (s) => COLS[E.colOf(s)] + (E.rowOf(s) + 1);
  const quadName = (q) => t('quad.' + q);
  const dirName = (d) => t(d === E.CW ? 'dir.cw' : 'dir.ccw');
  /** Tên người chơi của bên side: "Bạn" / "Máy" khi đấu máy, "Trắng" / "Đen" khi 2 người. */
  const who = (side) => (vsAi() ? t(side === cur.human ? 'bar.you' : 'bar.ai') : t('side.' + side));

  /* ---------------- Máy nghĩ trong Web Worker ---------------- */
  const AI = {
    worker: null,
    pending: null, // { id, state, opts, cb }
    nextId: 0,
    source() {
      return 'var G = (' + E.factory.toString() + ')();\n' +
        'self.onmessage = function (e) {\n' +
        '  var d = e.data, g = G.fromJSON(d.state);\n' +
        '  var r = g ? G.chooseMove(g, d.opts) : { move: null };\n' +
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
            this.think(p.state, p.opts, p.cb);
          }
        };
      } catch (e) {
        this.worker = null;
      }
    },
    think(state, opts, cb) {
      const id = ++this.nextId;
      this.pending = { id, state, opts, cb };
      if (this.worker) {
        this.worker.postMessage({ id, state, opts });
        return;
      }
      // Không có worker: tính trên luồng chính, mức Khó rút giờ nghĩ cho đỡ đơ
      setTimeout(() => {
        if (!this.pending || this.pending.id !== id) return;
        this.pending = null;
        const g = E.fromJSON(state);
        cb(g ? E.chooseMove(g, Object.assign({}, opts, opts.level === 'hard' ? { timeMs: 500 } : {})).move : null);
      }, 30);
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

  /* ---------------- Dựng bàn ---------------- */
  const cellEls = [];
  const stoneEls = [];
  quadEls.forEach((qe, q) => {
    E.quadCells(q).forEach((s) => {
      const c = document.createElement('div');
      c.className = 'cell';
      c.setAttribute('role', 'gridcell');
      c.dataset.s = String(s);
      c.innerHTML = '<span class="hole"></span><span class="stone"></span>';
      qe.appendChild(c);
      cellEls[s] = c;
      stoneEls[s] = c.lastChild;
    });
  });
  const rotEls = ROTS.map((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rot ' + (r.dir === E.CW ? 'cw' : 'ccw') + ' e-' + r.edge + (r.q >= 2 ? ' qb' : '');
    b.dataset.i = String(i);
    b.innerHTML = '<span class="rot-face"><svg class="rot-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-rot"/></svg></span>';
    rotsEl.appendChild(b);
    return b;
  });

  /* ---------------- Kích thước ---------------- */
  // Khung bàn = 6 ô + 4 lề góc + 1 khe giữa + 2 dải mũi tên ≈ 8,2 ô
  function layout() {
    const row = getComputedStyle(stage).flexDirection === 'row';
    const side = stage.querySelector('.side');
    const gap = parseFloat(getComputedStyle(stage).rowGap) || 8;
    let w = stage.clientWidth;
    let h = stage.clientHeight;
    if (row) w -= side.offsetWidth + gap;
    else h -= $('bar-top').offsetHeight + $('bar-bottom').offsetHeight + gap * 2;
    const u = Math.max(24, Math.min(74, Math.floor(Math.min(w, h) / 8.2)));
    if (u === unit && wrap.style.width) return;
    unit = u;
    const p = Math.round(u * 0.1); // lề trong mỗi góc
    const g = Math.max(4, Math.round(u * 0.16)); // khe giữa hai góc
    const m = Math.round(u * 0.85); // dải mũi tên quanh bàn
    const Q = 3 * u + 2 * p; // cạnh một góc
    const B = 2 * Q + g; // cạnh bàn
    const W = B + 2 * m;
    wrap.style.setProperty('--u', u + 'px');
    wrap.style.setProperty('--p', p + 'px');
    wrap.style.setProperty('--g', g + 'px');
    wrap.style.setProperty('--m', m + 'px');
    wrap.style.width = W + 'px';
    wrap.style.height = W + 'px';
    stage.style.setProperty('--bw', B + 'px');
    // Mũi tên: tâm ở giữa dải ngoài, lệch về phía góc ngoài một phần tư cạnh góc
    const near = m + Q * 0.3;
    const far = m + B - Q * 0.3;
    ROTS.forEach((r, i) => {
      const left = r.q & 1, bottom = r.q >> 1;
      let x, y;
      if (r.edge === 'top' || r.edge === 'bottom') {
        x = left ? far : near;
        y = r.edge === 'top' ? m / 2 : W - m / 2;
      } else {
        x = r.edge === 'left' ? m / 2 : W - m / 2;
        y = bottom ? far : near;
      }
      rotEls[i].style.left = Math.round(x - m / 2) + 'px';
      rotEls[i].style.top = Math.round(y - m / 2) + 'px';
    });
  }

  /* ---------------- Vẽ ---------------- */
  function render() {
    renderBoard();
    renderBars();
  }

  function renderBoard() {
    const b = game.board;
    const over = game.winner != null;
    const win = new Set();
    if (over) for (const i of game.lines) for (const s of E.LINES[i]) win.add(s);
    const last = game.last;
    for (let s = 0; s < 36; s++) {
      const v = s === pending ? pendingSide + 1 : b[s];
      const st = stoneEls[s];
      st.className = 'stone' + (v === 1 ? ' white' : v === 2 ? ' black' : '') + (s === pending ? ' pending' : '') +
        (!over && pending < 0 && last && last.at === s ? ' last' : '') + (win.has(s) ? ' win' : '');
      const c = cellEls[s];
      c.classList.toggle('cursor', s === cursor);
      c.classList.toggle('filled', !!v);
      c.classList.toggle('open', !v && canAct() && pending < 0);
      c.setAttribute('aria-label', cellLabel(s, v));
    }
    boardEl.classList.toggle('over', over);
    boardEl.classList.toggle('lined', win.size > 0);
    boardEl.classList.toggle('wait', !canAct());
    boardEl.classList.toggle('kb', cursor >= 0);
    const ready = pending >= 0 && canAct();
    rotEls.forEach((el, i) => {
      const r = ROTS[i];
      el.disabled = !ready;
      el.classList.toggle('ready', ready);
      el.classList.toggle('flash', flash === i);
      el.classList.toggle('last', !ready && flash < 0 && !over && !!last && last.q === r.q && last.dir === r.dir && pending < 0);
      el.setAttribute('aria-label', t('rot.label', { quad: quadName(r.q), dir: dirName(r.dir) }));
      el.title = el.getAttribute('aria-label');
    });
  }

  function cellLabel(s, v) {
    const parts = [cellName(s)];
    parts.push(v ? t('cell.stone', { side: t('side.' + (v - 1)) }) : t('cell.empty'));
    if (s === pending) parts.push(t('cell.pending'));
    return parts.join(', ');
  }

  /** Hai thanh người chơi: khi đấu máy, máy ở trên, bạn ở dưới; 2 người thì Đen trên, Trắng dưới. */
  function renderBars() {
    const bottom = vsAi() ? cur.human : E.FIRST;
    fillBar($('bar-top'), 1 - bottom);
    fillBar($('bar-bottom'), bottom);
  }
  function fillBar(bar, side) {
    const over = game.winner != null;
    const active = !over && game.turn === side;
    const isAi = vsAi() && side !== cur.human;
    bar.classList.toggle('white', side === 0);
    bar.classList.toggle('black', side === 1);
    bar.classList.toggle('active', active);
    bar.classList.toggle('thinking', active && isAi && thinking);
    bar.querySelector('.pname').textContent = who(side);
    let s;
    if (active && isAi) s = thinking ? t('bar.thinking') : t('bar.aiMove');
    else if (active) s = pending >= 0 ? t('bar.twist') : t('bar.place');
    else if (isAi) s = t('bar.aiSub', { side: t('side.' + side), level: t('level.' + cur.level) });
    else s = t('bar.sideSub', { side: t('side.' + side), order: t(side === 0 ? 'bar.first' : 'bar.second') });
    bar.querySelector('.psub').textContent = s;
    // Số quân còn trong tay (mỗi bên 18)
    let used = 0;
    for (const v of game.board) if (v === side + 1) used++;
    if (pending >= 0 && pendingSide === side) used++;
    bar.querySelector('.pcount').innerHTML = '<span class="mini ' + SIDE_KEY[side] + '"></span>' + (18 - used);
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
    const live = game && game.winner == null && game.ply > 0 && !cur.ended;
    let detail = '';
    if (live) detail = vsAi() ? t('summary.resume', { level: t('level.' + cur.level), n: game.ply }) : t('summary.resumePvp', { n: game.ply });
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: tot.played,
      won: tot.won,
      note: tot.played ? t('summary.note', { n: tot.won }) : t('summary.none'),
      stats: tot.played ? [{ value: kit.i18n.fmtNumber(tot.won), label: t('stats.won') }, { value: kit.i18n.fmtNumber(stats.best), label: t('stats.best') }] : [],
      resume: live ? { title: t('app.name'), detail, pct: game.ply / 36 } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (game && game.winner == null && game.ply > 0 && !cur.ended) {
      kit.store.write(keys.save, { v: 1, mode: cur.mode, level: cur.level, human: cur.human, humanMoves: cur.humanMoves, seed: cur.seed, game: E.toJSON(game) });
    } else {
      kit.store.remove(keys.save);
    }
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */
  function resetQuad(el) {
    el.classList.add('still');
    el.classList.remove('turning', 'peek-cw', 'peek-ccw');
    el.style.transform = '';
    void el.offsetWidth;
    el.classList.remove('still');
  }

  function setGame(g, c) {
    cancelAi();
    clearTimeout(resultTimer);
    animating = false;
    flash = -1;
    game = g;
    cur = c;
    pending = -1;
    quadEls.forEach(resetQuad);
    render();
  }

  function newGame() {
    const s = kit.settings.get();
    const mode = s.opponent === 'pvp' ? 'pvp' : 'ai';
    const level = LEVELS.indexOf(s.level) >= 0 ? s.level : 'medium';
    const human = s.side === 'black' ? E.SECOND : E.FIRST;
    kit.modal.close('modal-result');
    setGame(E.newGame(), { mode, level, human, humanMoves: 0, seed: (Math.random() * 4294967296) >>> 0, ended: false });
    kit.store.remove(keys.save);
    if (mode === 'ai') kit.sdk.start(level);
    kit.sfx('start');
    writeSummary();
    scheduleAi();
  }

  /** Người chơi chạm / bấm Enter vào ô s: đặt quân, nhấc quân vừa đặt, hoặc dời quân vừa đặt sang ô khác. */
  function onCell(s) {
    if (!game || game.winner != null || kit.modal.current()) return;
    if (!canAct()) {
      if (thinking || isAiTurn()) kit.toast(t('toast.thinking'));
      return;
    }
    if (s === pending) {
      pending = -1;
      kit.sfx('tap', { volume: 0.6 });
      announce(t('live.lift'));
      render();
      return;
    }
    if (game.board[s]) {
      kit.sfx('error', { volume: 0.5 });
      kit.toast(t('toast.taken'));
      return;
    }
    pending = s;
    pendingSide = game.turn;
    kit.sfx('place');
    announce(t('live.placed', { cell: cellName(s) }));
    render();
  }

  /** Người chơi chọn mũi tên xoay góc q theo chiều dir. */
  function onRotate(q, dir) {
    if (!game || game.winner != null || kit.modal.current()) return;
    if (!canAct()) {
      if (thinking || isAiTurn()) kit.toast(t('toast.thinking'));
      return;
    }
    if (pending < 0) {
      kit.sfx('error', { volume: 0.5 });
      kit.toast(t('toast.placeFirst'));
      return;
    }
    const m = E.encode(pending, q, dir);
    animating = true;
    renderBoard();
    turnQuad(q, dir, () => {
      animating = false;
      commit(m, true);
    });
  }

  /** Hoạt cảnh xoay góc q rồi gọi done (cùng một khung với lúc trả góc về, nên không nháy). */
  function turnQuad(q, dir, done) {
    const el = quadEls[q];
    kit.sfx('move');
    if (calm()) {
      done();
      return;
    }
    el.classList.remove('peek-cw', 'peek-ccw');
    el.classList.add('turning');
    el.style.transform = 'rotate(' + (dir === E.CW ? 90 : -90) + 'deg)';
    let fired = false;
    const token = aiToken;
    const fin = () => {
      if (fired) return;
      fired = true;
      el.removeEventListener('transitionend', onEnd);
      if (token !== aiToken) return; // ván đã đổi giữa chừng
      done();
      resetQuad(el);
    };
    const onEnd = (e) => { if (e.target === el && e.propertyName === 'transform') fin(); };
    el.addEventListener('transitionend', onEnd);
    setTimeout(fin, ROT_MS + 150);
  }

  function commit(m, byHuman) {
    const side = game.turn;
    const next = E.play(game, m);
    if (!next) return;
    game = next;
    pending = -1;
    flash = -1;
    if (byHuman) cur.humanMoves++;
    const l = game.last;
    announce(t('live.move', { who: who(side), cell: cellName(l.cell), quad: quadName(l.q), dir: dirName(l.dir) }));
    render();
    persist();
    if (game.winner != null) finish();
    else scheduleAi();
  }

  function scheduleAi() {
    if (!isAiTurn() || thinking) return;
    thinking = true;
    const token = ++aiToken;
    const t0 = Date.now();
    render();
    const seed = (cur.seed ^ Math.imul(game.ply + 1, 0x9e3779b1)) >>> 0;
    const opts = { level: cur.level, seed, timeMs: cur.level === 'hard' ? HARD_MS : undefined };
    AI.think(E.toJSON(game), opts, (move) => {
      if (token !== aiToken) return;
      const wait = Math.max(0, MIN_THINK_MS - (Date.now() - t0));
      setTimeout(() => {
        if (token !== aiToken) return;
        thinking = false;
        // phòng hờ: không bao giờ để máy đi sai luật
        const legal = E.legalMoves(game);
        const m = legal.indexOf(move) >= 0 ? move : legal[Math.floor(Math.random() * legal.length)];
        playAi(m, token);
      }, wait);
    });
  }

  /** Nước của máy: đặt quân, sáng mũi tên, rồi xoay góc. */
  function playAi(m, token) {
    animating = true;
    pending = E.cellOf(m);
    pendingSide = game.turn;
    kit.sfx('place', { pitch: 0.85, volume: 0.85 });
    render();
    setTimeout(() => {
      if (token !== aiToken) return;
      const q = E.quadOfMove(m), dir = E.dirOf(m);
      flash = ROTS.findIndex((r) => r.q === q && r.dir === dir);
      renderBoard();
      turnQuad(q, dir, () => {
        animating = false;
        commit(m, false);
      });
    }, calm() ? 250 : AI_PLACE_MS);
  }

  function cancelAi() {
    aiToken++;
    animating = false;
    flash = -1;
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
    if (vsAi()) {
      const won = w === cur.human;
      const lv = stats.levels[cur.level];
      lv.played++;
      if (won) {
        lv.won++;
        stats.streak++;
        stats.best = Math.max(stats.best, stats.streak);
      } else {
        if (draw) lv.drawn++;
        else lv.lost++;
        stats.streak = 0;
      }
      saveStats();
      // Thua / hòa vẫn là một ván đã chơi: gửi won: false (ván có ít nhất một nước của người chơi)
      if (won || cur.humanMoves > 0) kit.sdk.end({ mode: cur.level, won, assisted: false });
      kit.sfx(won ? 'win' : draw ? 'draw' : 'lose');
      if (won) kit.confetti();
    } else {
      kit.sfx(draw ? 'draw' : 'win');
      if (!draw) kit.confetti();
    }
    persist();
    showResult();
  }

  function showResult() {
    const w = game.winner;
    const draw = w === E.DRAW;
    const gift = !draw && game.last && game.last.side !== w; // tự xoay ra 5 cho đối thủ
    let title, text, outcome;
    if (draw) {
      title = t('result.draw');
      text = t('reason.' + game.reason);
      outcome = 'draw';
    } else if (vsAi()) {
      const won = w === cur.human;
      title = t(won ? 'result.win' : 'result.lose');
      text = t('reason.' + (gift ? 'gift' : 'five') + '.' + (won ? 'win' : 'lose'));
      outcome = won ? 'win' : 'lose';
    } else {
      title = t('result.sideWins', { side: t('side.' + w) });
      text = t(gift ? 'reason.gift.pvp' : 'reason.five.pvp', { side: t('side.' + w), other: t('side.' + (1 - w)) });
      outcome = 'win';
    }
    $('result-title').textContent = title;
    $('result-text').textContent = text;
    const art = $('result-art');
    art.className = 'result-art ' + outcome;
    art.innerHTML = draw
      ? '<span class="stone white"></span><span class="stone black"></span>'
      : '<span class="stone ' + SIDE_KEY[w] + '"></span>';
    announce(title + '. ' + text);
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => kit.modal.open('modal-result'), calm() ? 250 : 900);
  }

  /** Ván đang dở (bạn đã đi) thì hỏi trước; đấu máy thì bỏ ván tính là thua. */
  function requestNew() {
    const pvpLive = game && !vsAi() && game.winner == null && game.ply > 0;
    if (inProgress() || pvpLive) {
      $('confirm-text').textContent = t(vsAi() ? 'confirm.text' : 'confirm.textPvp');
      kit.modal.open('modal-confirm');
    } else newGame();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (vsAi() && inProgress()) {
      const lv = stats.levels[cur.level];
      lv.played++;
      lv.lost++;
      stats.streak = 0;
      saveStats();
      kit.sdk.end({ mode: cur.level, won: false, assisted: false });
    }
    newGame();
  }

  /** Đổi đối thủ / mức / phe: chưa đi nước nào thì chơi lại ngay với cài đặt mới, đã đi thì để ván sau. */
  function onSetting(key) {
    if (key === 'opponent') syncSettingRows();
    if (key !== 'opponent' && key !== 'level' && key !== 'side') return;
    if (!game) return;
    if (game.winner == null && cur.humanMoves === 0) newGame();
    else kit.toast(t('toast.next'));
  }
  function syncSettingRows() {
    const pvp = kit.settings.get().opponent === 'pvp';
    $('setting-level').hidden = pvp;
    $('setting-side').hidden = pvp;
  }

  /* ---------------- Sự kiện ---------------- */
  boardEl.addEventListener('click', (e) => {
    const c = e.target.closest && e.target.closest('.cell');
    if (!c) return;
    cursor = -1;
    onCell(Number(c.dataset.s));
  });
  rotsEl.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.rot');
    if (!b) return;
    const r = ROTS[Number(b.dataset.i)];
    onRotate(r.q, r.dir);
  });
  // Rê chuột / focus mũi tên: góc nghiêng nhẹ về chiều sẽ xoay
  function peek(e, on) {
    const b = e.target.closest && e.target.closest('.rot');
    if (!b || b.disabled || animating) return;
    const r = ROTS[Number(b.dataset.i)];
    quadEls[r.q].classList.toggle(r.dir === E.CW ? 'peek-cw' : 'peek-ccw', on);
  }
  rotsEl.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse') peek(e, true); });
  rotsEl.addEventListener('pointerout', (e) => peek(e, false));
  rotsEl.addEventListener('focusin', (e) => peek(e, true));
  rotsEl.addEventListener('focusout', (e) => peek(e, false));

  function moveCursor(dr, dc) {
    // Dùng phím mũi tên thì đưa focus về bàn để Enter không bấm nhầm nút đang focus
    if (document.activeElement !== boardEl) boardEl.focus({ preventScroll: true });
    if (cursor < 0) cursor = pending >= 0 ? pending : E.idx(2, 2);
    else cursor = E.idx(Math.max(0, Math.min(5, E.rowOf(cursor) + dr)), Math.max(0, Math.min(5, E.colOf(cursor) + dc)));
    renderBoard();
    announce(cellEls[cursor].getAttribute('aria-label'));
  }
  /** Q / E: xoay góc dưới con trỏ (không có con trỏ thì góc chứa quân vừa đặt). */
  function keyRotate(dir) {
    const at = cursor >= 0 ? cursor : pending;
    if (at < 0) {
      if (canAct()) kit.toast(t('toast.placeFirst'));
      return;
    }
    onRotate(E.quadOf(at), dir);
  }

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key;
    const onButton = e.target && e.target.closest && e.target.closest('button, input, select, a');
    if (k === 'ArrowLeft') moveCursor(0, -1);
    else if (k === 'ArrowRight') moveCursor(0, 1);
    else if (k === 'ArrowUp') moveCursor(-1, 0);
    else if (k === 'ArrowDown') moveCursor(1, 0);
    else if ((k === 'Enter' || k === ' ') && !onButton) {
      if (cursor < 0) moveCursor(0, 0);
      else onCell(cursor);
    } else if (k === 'q' || k === 'Q') keyRotate(E.CCW);
    else if (k === 'e' || k === 'E') keyRotate(E.CW);
    else if (k === 'Escape' && pending >= 0 && canAct()) onCell(pending);
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
    const fmt = kit.i18n.fmtNumber;
    $('stats-played').textContent = fmt(tot.played);
    $('stats-won').textContent = fmt(tot.won);
    $('stats-streak').textContent = fmt(stats.streak);
    $('stats-best').textContent = fmt(stats.best);
    $('stats-body').innerHTML = LEVELS.map((lv) => {
      const r = stats.levels[lv];
      return '<tr><th scope="row">' + t('level.' + lv) + '</th><td>' + fmt(r.played) + '</td><td>' + fmt(r.won) + '</td><td>' + fmt(r.lost) + '</td><td>' + fmt(r.drawn) + '</td></tr>';
    }).join('');
  }

  kit.onLeave(persist);
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);
  syncSettingRows();

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const okSave = saved && saved.v === 1 && (saved.mode === 'ai' || saved.mode === 'pvp') && LEVELS.indexOf(saved.level) >= 0 &&
    (saved.human === 0 || saved.human === 1) && Number.isInteger(saved.humanMoves) && saved.humanMoves >= 0 && Number.isInteger(saved.seed);
  const restored = okSave ? E.fromJSON(saved.game) : null;
  layout();
  if (restored && restored.ply > 0) {
    setGame(restored, { mode: saved.mode, level: saved.level, human: saved.human, humanMoves: saved.humanMoves, seed: saved.seed >>> 0, ended: false });
    if (vsAi()) kit.sdk.start(cur.level, true);
    kit.toast(t('toast.saved'));
    writeSummary();
    scheduleAi();
  } else {
    newGame();
  }
  layout();
})();
