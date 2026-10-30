/* =====================================================================
 * Cờ Thú - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Đấu với máy: chọn mức (Dễ / Vừa / Khó) và phe (Đỏ đi trước / Xanh) trong Cài đặt; phe của bạn luôn ở dưới
 *   - Chuột / chạm: chạm quân của mình để chọn (ô đi được tô sáng), chạm ô sáng để đi
 *   - Bàn phím: mũi tên di chuyển con trỏ, Enter / Space chọn và đi, Esc bỏ chọn, N ván mới
 *   - Máy nghĩ trong Web Worker dựng từ mã nguồn engine (Blob); không có worker thì tính bằng setTimeout
 *   - Báo ván cho cổng (metric wins, mode = mức máy):
 *     ván mới kit.sdk.start(level), mở lại ván dở kit.sdk.start(level, true);
 *     hết ván kit.sdk.end({ mode, won, assisted: false }) (thua / hòa gửi won: false);
 *     bỏ ván đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì. Không có đi lại.
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const LEVELS = E.LEVELS;
  const kit = PNKit.init({
    gameId: 'cothu',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { level: 'medium', side: 'red' },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);
  const MIN_THINK_MS = 450; // máy "nghĩ" ít nhất chừng này để người chơi kịp thấy nước của mình
  const COLS = 'abcdefg';

  const stage = $('stage');
  const boardBox = $('board-box');
  const boardEl = $('board');
  const cellsEl = $('cells');
  const piecesEl = $('pieces');

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
  // cur: { level, human (0 Đỏ | 1 Xanh), humanMoves, ended }
  let game = null;
  let cur = null;
  let selected = -1; // ô của quân đang chọn
  let targets = []; // ô đi được của quân đang chọn
  let cursor = -1; // con trỏ bàn phím (ô thật); -1 = chưa dùng bàn phím
  let thinking = false;
  let aiToken = 0;
  let resultTimer = 0;
  let cell = 48; // cạnh một ô (px)
  let flipped = false; // người chơi cầm Xanh: xoay bàn 180° để phe mình ở dưới
  const pieceEls = new Map(); // mã quân (±bậc) -> phần tử

  const isAiTurn = () => game && game.winner == null && game.turn !== cur.human;
  const inProgress = () => game && game.winner == null && cur.humanMoves > 0;
  const humanCanPlay = () => game && game.winner == null && !thinking && game.turn === cur.human && !kit.modal.current();
  const sqName = (s) => COLS[E.xOf(s)] + (9 - E.yOf(s));
  const pieceName = (p) => t('piece.' + E.rankOf(p));

  /* ---------------- Máy nghĩ trong Web Worker ---------------- */
  const AI = {
    worker: null,
    pending: null, // { id, state, level, seed, cb }
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
            this.think(p.state, p.level, p.seed, p.cb);
          }
        };
      } catch (e) {
        this.worker = null;
      }
    },
    think(state, level, seed, cb) {
      const id = ++this.nextId;
      this.pending = { id, state, level, seed, cb };
      if (this.worker) {
        this.worker.postMessage({ id, state, level, seed });
        return;
      }
      setTimeout(() => {
        if (!this.pending || this.pending.id !== id) return;
        this.pending = null;
        const g = E.fromJSON(state);
        cb(g ? E.chooseMove(g, { level, seed }).move : null);
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

  /* ---------------- Tọa độ màn hình ---------------- */
  // Ô thật -> vị trí trên màn hình (cột, hàng) theo hướng nhìn của người chơi
  const viewX = (s) => (flipped ? 6 - E.xOf(s) : E.xOf(s));
  const viewY = (s) => (flipped ? 8 - E.yOf(s) : E.yOf(s));
  const fromView = (vx, vy) => (flipped ? E.sq(6 - vx, 8 - vy) : E.sq(vx, vy));

  /* ---------------- Dựng bàn ---------------- */
  const cellEls = [];
  function buildCells() {
    cellsEl.textContent = '';
    cellEls.length = 0;
    for (let vy = 0; vy < 9; vy++) {
      const row = document.createElement('div');
      row.className = 'row';
      row.setAttribute('role', 'row');
      for (let vx = 0; vx < 7; vx++) {
        const s = fromView(vx, vy);
        const c = document.createElement('div');
        c.className = 'cell';
        c.setAttribute('role', 'gridcell');
        c.dataset.sq = String(s);
        if ((E.xOf(s) + E.yOf(s)) % 2) c.classList.add('alt');
        if (E.isWater(s)) c.classList.add('water');
        const trap = E.trapOwner(s);
        const den = E.DEN.indexOf(s);
        if (trap >= 0) {
          c.classList.add('trap', trap === 0 ? 'own-red' : 'own-blue');
          c.innerHTML = '<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><use href="#i-trap"/></svg>';
        } else if (den >= 0) {
          c.classList.add('den', den === 0 ? 'own-red' : 'own-blue');
          c.innerHTML = '<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><use href="#i-den"/></svg>';
        }
        cellEls[s] = c;
        row.appendChild(c);
      }
      cellsEl.appendChild(row);
    }
  }

  function makePiece(p) {
    const el = document.createElement('div');
    el.className = 'piece ' + (p > 0 ? 'red' : 'blue');
    el.innerHTML = '<span class="token"><svg class="animal" viewBox="0 0 32 32"><use href="#a-' + E.rankOf(p) + '"/></svg>' +
      '<span class="rank">' + E.rankOf(p) + '</span></span>';
    piecesEl.appendChild(el);
    return el;
  }

  /* ---------------- Kích thước ---------------- */
  function layout() {
    const row = getComputedStyle(stage).flexDirection === 'row';
    const side = stage.querySelector('.side');
    const gap = parseFloat(getComputedStyle(stage).rowGap) || 8;
    // Chừa 12px cho khung gỗ quanh bàn (box-shadow 5px mỗi bên)
    let w = stage.clientWidth - 12;
    let h = stage.clientHeight - 12;
    if (row) w -= side.offsetWidth + gap;
    else h -= $('bar-top').offsetHeight + $('bar-bottom').offsetHeight + gap * 2;
    const next = Math.max(22, Math.min(76, Math.floor(Math.min(w / 7, h / 9))));
    if (next === cell && boardEl.style.width) return;
    cell = next;
    boardEl.classList.add('still');
    boardEl.style.setProperty('--cell', cell + 'px');
    boardEl.style.width = cell * 7 + 'px';
    boardEl.style.height = cell * 9 + 'px';
    stage.style.setProperty('--bw', cell * 7 + 'px');
    void boardEl.offsetWidth;
    boardEl.classList.remove('still');
  }

  /* ---------------- Vẽ ---------------- */
  function render() {
    renderBoard();
    renderBars();
  }

  function renderBoard() {
    const b = game.board;
    const alive = new Set();
    for (let s = 0; s < 63; s++) {
      const p = b[s];
      if (!p) continue;
      alive.add(p);
      let el = pieceEls.get(p);
      if (!el) {
        el = makePiece(p);
        pieceEls.set(p, el);
      }
      el.classList.remove('gone');
      el.style.setProperty('--x', viewX(s));
      el.style.setProperty('--y', viewY(s));
      el.classList.toggle('sel', s === selected);
      el.classList.toggle('mine', E.sideOf(p) === cur.human);
    }
    pieceEls.forEach((el, p) => {
      if (alive.has(p)) return;
      pieceEls.delete(p);
      if (calm()) {
        el.remove();
        return;
      }
      el.classList.add('gone');
      setTimeout(() => el.remove(), 320);
    });
    const last = game.last;
    const tset = new Set(targets);
    for (let s = 0; s < 63; s++) {
      const c = cellEls[s];
      c.classList.toggle('last-from', !!last && last.from === s);
      c.classList.toggle('last-to', !!last && last.to === s);
      c.classList.toggle('target', tset.has(s));
      c.classList.toggle('capture', tset.has(s) && !!b[s]);
      c.classList.toggle('cursor', s === cursor);
      c.classList.toggle('picked', s === selected);
      c.setAttribute('aria-label', cellLabel(s, tset.has(s)));
    }
    boardEl.classList.toggle('wait', !humanCanPlay());
    boardEl.classList.toggle('kb', cursor >= 0);
  }

  function cellLabel(s, isTarget) {
    const parts = [sqName(s)];
    const p = game.board[s];
    if (p) parts.push(t('cell.piece', { side: t('side.' + E.sideOf(p)), piece: pieceName(p), rank: E.rankOf(p) }));
    if (E.isWater(s)) parts.push(t('cell.water'));
    else if (E.trapOwner(s) >= 0) parts.push(t('cell.trap') + ' ' + t('side.' + E.trapOwner(s)));
    else if (E.DEN.indexOf(s) >= 0) parts.push(t('cell.den') + ' ' + t('side.' + E.DEN.indexOf(s)));
    if (isTarget) parts.push(t('cell.target'));
    return parts.join(', ');
  }

  /** Hai thanh người chơi: máy ở trên, bạn ở dưới; quân đã ăn được hiện nhỏ bên phải. */
  function renderBars() {
    const ai = 1 - cur.human;
    fillBar($('bar-top'), ai, t('bar.ai'), t('bar.aiSub', { side: t('side.' + ai), level: t('level.' + cur.level) }));
    fillBar($('bar-bottom'), cur.human, t('bar.you'), t('bar.youSub', { side: t('side.' + cur.human) }));
  }
  function fillBar(bar, side, name, sub) {
    const over = game.winner != null;
    const active = !over && game.turn === side;
    bar.classList.toggle('red', side === 0);
    bar.classList.toggle('blue', side === 1);
    bar.classList.toggle('active', active);
    const isAi = side !== cur.human;
    bar.classList.toggle('thinking', active && isAi && thinking);
    bar.querySelector('.pname').textContent = name;
    let s = sub;
    if (active && !isAi) s = t('bar.turn');
    if (active && isAi && thinking) s = t('bar.thinking');
    bar.querySelector('.psub').textContent = s;
    // Quân của đối thủ đã bị bên này ăn (theo bậc)
    const left = new Set();
    for (const p of game.board) if (p && E.sideOf(p) !== side) left.add(E.rankOf(p));
    const tray = bar.querySelector('.ptray');
    let html = '';
    for (let r = 8; r >= 1; r--) {
      if (!left.has(r)) html += '<svg class="mini ' + (side === 0 ? 'blue' : 'red') + '" viewBox="0 0 32 32"><use href="#a-' + r + '"/></svg>';
    }
    if (tray.innerHTML !== html) tray.innerHTML = html;
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
    const live = game && game.winner == null && game.ply > 0;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: tot.played,
      won: tot.won,
      note: tot.played ? t('summary.note', { n: tot.won }) : t('summary.none'),
      stats: tot.played ? [{ value: kit.i18n.fmtNumber(tot.won), label: t('stats.won') }, { value: kit.i18n.fmtNumber(stats.best), label: t('stats.best') }] : [],
      resume: live ? { title: t('app.name'), detail: t('summary.resume', { level: t('level.' + cur.level), n: Math.floor(game.ply / 2) + 1 }) } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (game && game.winner == null && game.ply > 0 && !cur.ended) {
      kit.store.write(keys.save, { v: 1, level: cur.level, human: cur.human, humanMoves: cur.humanMoves, game: E.toJSON(game) });
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
    selected = -1;
    targets = [];
    const flip = cur.human === E.BLUE;
    if (flip !== flipped || !cellEls.length) {
      flipped = flip;
      buildCells();
    }
    pieceEls.forEach((el) => el.remove());
    pieceEls.clear();
    boardEl.classList.add('still');
    render();
    void boardEl.offsetWidth;
    boardEl.classList.remove('still');
  }

  function newGame() {
    const s = kit.settings.get();
    const level = LEVELS.indexOf(s.level) >= 0 ? s.level : 'medium';
    const human = s.side === 'blue' ? E.BLUE : E.RED;
    kit.modal.close('modal-result');
    setGame(E.newGame(), { level, human, humanMoves: 0, ended: false });
    kit.store.remove(keys.save);
    kit.sdk.start(level);
    kit.sfx('start');
    writeSummary();
    scheduleAi();
  }

  function select(s) {
    selected = s;
    targets = s >= 0 ? E.movesFrom(game, s) : [];
  }

  /** Người chơi chạm / bấm Enter vào ô s. */
  function onSquare(s) {
    if (!game || game.winner != null || kit.modal.current()) return;
    if (thinking || game.turn !== cur.human) {
      kit.toast(t('toast.thinking'));
      return;
    }
    const p = game.board[s];
    if (selected >= 0 && targets.indexOf(s) >= 0) {
      commit(E.encode(selected, s), true);
      return;
    }
    if (p && E.sideOf(p) === cur.human) {
      if (s === selected) {
        select(-1);
      } else {
        select(s);
        if (!targets.length) {
          kit.sfx('error', { volume: 0.5 });
          kit.toast(t('toast.noMove'));
        } else {
          kit.sfx('tap');
        }
      }
      renderBoard();
      return;
    }
    if (selected >= 0) {
      select(-1);
      kit.sfx('error', { volume: 0.5 });
      renderBoard();
      return;
    }
    if (p) kit.toast(t('toast.notYours'));
  }

  function commit(m, byHuman) {
    const next = E.play(game, m);
    if (!next) return;
    const who = byHuman ? t('bar.you') : t('bar.ai');
    game = next;
    if (byHuman) cur.humanMoves++;
    select(-1);
    const l = game.last;
    let msg = t('live.move', { who, piece: pieceName(l.piece), from: sqName(l.from), to: sqName(l.to) });
    if (l.captured) msg += t('live.capture', { piece: pieceName(l.captured) });
    announce(msg);
    if (game.winner == null) kit.sfx(l.captured ? 'capture' : 'move');
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
    renderBars();
    renderBoard();
    const seed = (Math.random() * 4294967296) >>> 0;
    AI.think(E.toJSON(game), cur.level, seed, (move) => {
      if (token !== aiToken) return;
      const wait = Math.max(0, (calm() ? 150 : MIN_THINK_MS) - (Date.now() - t0));
      setTimeout(() => {
        if (token !== aiToken) return;
        thinking = false;
        const legal = E.legalMoves(game);
        // phòng hờ: không bao giờ để máy đi sai luật
        const m = legal.indexOf(move) >= 0 ? move : legal[Math.floor(Math.random() * legal.length)];
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
    const won = w === cur.human;
    const draw = w === E.DRAW;
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
    persist();
    // Thua / hòa vẫn là một ván đã chơi: gửi won: false (ván có ít nhất một nước của người chơi)
    if (won || cur.humanMoves > 0) kit.sdk.end({ mode: cur.level, won, assisted: false });
    kit.sfx(won ? 'win' : draw ? 'draw' : 'lose');
    if (won) kit.confetti();
    showResult();
  }

  function showResult() {
    const w = game.winner;
    const won = w === cur.human;
    const draw = w === E.DRAW;
    const reason = game.reason;
    let text;
    if (draw) text = t('reason.' + reason);
    else text = t('reason.' + reason + '.' + (won ? 'win' : 'lose'), { piece: game.last ? pieceName(game.last.piece) : '' });
    $('result-title').textContent = t(won ? 'result.win' : draw ? 'result.draw' : 'result.lose');
    $('result-text').textContent = text;
    const art = $('result-art');
    art.className = 'result-art ' + (won ? 'win' : draw ? 'draw' : 'lose');
    const p = game.last ? game.last.piece : 7;
    art.innerHTML = '<span class="token ' + (p > 0 ? 'red' : 'blue') + '"><svg class="animal" viewBox="0 0 32 32"><use href="#a-' + E.rankOf(p) + '"/></svg></span>';
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => kit.modal.open('modal-result'), calm() ? 200 : 750);
  }

  /** Ván đang dở (bạn đã đi) thì hỏi trước, vì bỏ ván tính là thua. */
  function requestNew() {
    if (inProgress()) kit.modal.open('modal-confirm');
    else newGame();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inProgress()) {
      const lv = stats.levels[cur.level];
      lv.played++;
      lv.lost++;
      stats.streak = 0;
      saveStats();
      kit.sdk.end({ mode: cur.level, won: false, assisted: false });
    }
    newGame();
  }

  /** Đổi mức / phe: chưa đi nước nào thì chơi lại ngay với cài đặt mới, đã đi thì để ván sau. */
  function onSetting(key) {
    if (key !== 'level' && key !== 'side') return;
    if (!game) return;
    if (game.winner == null && cur.humanMoves === 0) newGame();
    else kit.toast(t('toast.next'));
  }

  /* ---------------- Sự kiện ---------------- */
  boardEl.addEventListener('click', (e) => {
    const c = e.target.closest && e.target.closest('.cell');
    if (!c) return;
    cursor = -1;
    onSquare(Number(c.dataset.sq));
  });

  function moveCursor(dx, dy) {
    // Dùng phím mũi tên thì đưa focus về bàn để Enter không bấm nhầm nút đang focus
    if (document.activeElement !== boardEl) boardEl.focus({ preventScroll: true });
    if (cursor < 0) {
      cursor = selected >= 0 ? selected : fromView(3, 6);
    } else {
      const vx = Math.max(0, Math.min(6, viewX(cursor) + dx));
      const vy = Math.max(0, Math.min(8, viewY(cursor) + dy));
      cursor = fromView(vx, vy);
    }
    renderBoard();
    announce(cellEls[cursor].getAttribute('aria-label'));
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
      else onSquare(cursor);
    } else if (k === 'Escape' && selected >= 0) {
      select(-1);
      renderBoard();
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
    $('stats-body').innerHTML = LEVELS.map((lv) => {
      const r = stats.levels[lv];
      return '<tr><th scope="row">' + t('level.' + lv) + '</th><td>' + fmt(r.played) + '</td><td>' + fmt(r.won) + '</td><td>' + fmt(r.lost) + '</td><td>' + fmt(r.drawn) + '</td></tr>';
    }).join('');
  }

  // Hàng bậc quân trong Cách chơi
  $('rank-row').innerHTML = [8, 7, 6, 5, 4, 3, 2, 1].map((r) =>
    '<span class="rank-item"><span class="token red"><svg class="animal" viewBox="0 0 32 32"><use href="#a-' + r + '"/></svg><span class="rank">' + r + '</span></span>' +
    '<span class="rank-name">' + t('piece.' + r) + '</span></span>').join('');

  kit.onLeave(persist);
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 && LEVELS.indexOf(saved.level) >= 0 && (saved.human === 0 || saved.human === 1) &&
    Number.isInteger(saved.humanMoves) && saved.humanMoves >= 0 ? E.fromJSON(saved.game) : null;
  layout();
  if (restored) {
    setGame(restored, { level: saved.level, human: saved.human, humanMoves: saved.humanMoves, ended: false });
    kit.sdk.start(cur.level, true);
    kit.toast(t('toast.saved'));
    writeSummary();
    scheduleAi();
  } else {
    newGame();
  }
  layout();
})();
