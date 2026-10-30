/* =====================================================================
 * Bắn Tàu - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Hai giai đoạn: XẾP TÀU (kéo thả, chạm để chọn / xoay, Xếp ngẫu nhiên, Dọn) rồi TRẬN (bắn xen kẽ với máy)
 *   - Bố cục do layout() tính theo khung: dọc (điện thoại) thì lưới địch to ở trên, lưới mình thu nhỏ bên dưới
 *     cạnh bảng tàu; ngang / máy tính thì hai lưới cạnh nhau. Không bao giờ cuộn.
 *   - Bàn phím: xếp tàu 1–5 chọn tàu, mũi tên dời, R xoay, X ngẫu nhiên, Backspace cất tàu, S vào trận;
 *     trận: mũi tên di chuyển con trỏ trên lưới địch, Enter / Space bắn; N ván mới
 *   - Máy tính nước trong engine (vài ms), "ngắm" 450–850 ms cho tự nhiên; hoạt cảnh nước bắn khóa lượt
 *   - Báo ván cho cổng (metric wins, mode = mức máy): ván mới (lúc bắt đầu xếp tàu) kit.sdk.start(level),
 *     mở lại ván dở kit.sdk.start(level, true); hết ván kit.sdk.end({ mode, won, assisted: false });
 *     bỏ ván đã bắn ít nhất một phát: won: false; chưa bắn phát nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const LEVELS = E.LEVELS;
  const FLEET = E.FLEET;
  const kit = PNKit.init({
    gameId: 'bantau',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { level: 'medium' },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);
  const LETTERS = 'ABCDEFGHIJ';

  /** Nhịp hoạt cảnh (ms). Giảm chuyển động vẫn giữ một quãng ngắn để kịp đọc kết quả mỗi phát. */
  const timing = () => (calm()
    ? { human: 250, thinkMin: 300, thinkMax: 300, aim: 0, ai: 250, result: 200 }
    : { human: 700, thinkMin: 450, thinkMax: 850, aim: 320, ai: 700, result: 900 });

  const stage = $('stage');
  const seas = $('seas');
  const gridE = $('grid-enemy');
  const gridO = $('grid-own');
  const dockEl = $('dock');
  const setupEl = $('setup');
  const fleetsEl = $('fleets');

  /* ---------------- Thống kê ---------------- */
  const toInt = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const st = { levels: {}, streak: toInt(raw.streak), best: toInt(raw.best), fewest: toInt(raw.fewest) || null };
    for (const lv of LEVELS) {
      const r = (raw.levels && raw.levels[lv]) || {};
      st.levels[lv] = { played: toInt(r.played), won: toInt(r.won), lost: toInt(r.lost), shots: toInt(r.shots), hits: toInt(r.hits) };
    }
    return st;
  }
  const stats = loadStats();
  const totals = () => LEVELS.reduce((a, lv) => ({ played: a.played + stats.levels[lv].played, won: a.won + stats.levels[lv].won }), { played: 0, won: 0 });

  /* ---------------- Trạng thái ---------------- */
  let phase = 'place'; // 'place' (xếp tàu) | 'battle'
  let ships = []; // đội tàu đang xếp: mảng 5 phần tử, null = còn ở bến
  let sel = -1; // tàu đang chọn khi xếp
  let game = null; // ván của engine (từ lúc vào trận)
  let cur = { level: 'medium', ended: false };
  let busy = false; // đang hoạt cảnh một phát bắn / máy đang ngắm: không nhận phát mới
  let token = 0; // hủy hẹn giờ của ván cũ
  let cursor = -1; // con trỏ bàn phím trên lưới địch
  let lastShot = [-1, -1]; // phát gần nhất vào bàn 0 (máy bắn) và bàn 1 (bạn bắn)
  let fresh = [-1, -1]; // ô vừa trúng đạn (chạy hoạt cảnh dấu)
  let event = null; // { text, kind } dòng sự kiện dưới trạng thái
  const cellsE = [];
  const cellsO = [];

  const shots = () => (game ? E.shotsBy(game, 0) : 0);
  const inProgress = () => phase === 'battle' && game && game.winner == null && shots() > 0;
  const myTurn = () => phase === 'battle' && game && game.winner == null && game.turn === 0 && !busy && !kit.modal.current();
  const cellName = (i) => LETTERS[E.colOf(i)] + (E.rowOf(i) + 1);
  const shipName = (k) => t('ship.' + k);
  const later = (fn, ms) => {
    const my = token;
    setTimeout(() => { if (my === token) fn(); }, ms);
  };

  /* ---------------- Dựng lưới ---------------- */
  function buildGrid(el, list, owner) {
    el.textContent = '';
    list.length = 0;
    // Lớp tàu đứng trước các ô để dấu bắn (vẽ trên ô) nằm đè lên tàu; phần tử tuyệt đối không chiếm ô của CSS grid
    const shipsLayer = document.createElement('div');
    shipsLayer.className = 'layer ships';
    el.appendChild(shipsLayer);
    const corner = document.createElement('span');
    corner.className = 'lab corner';
    el.appendChild(corner);
    for (let c = 0; c < 10; c++) {
      const l = document.createElement('span');
      l.className = 'lab';
      l.textContent = LETTERS[c];
      el.appendChild(l);
    }
    for (let r = 0; r < 10; r++) {
      const l = document.createElement('span');
      l.className = 'lab';
      l.textContent = String(r + 1);
      el.appendChild(l);
      for (let c = 0; c < 10; c++) {
        const d = document.createElement('div');
        d.className = 'cell';
        d.setAttribute('role', 'gridcell');
        d.dataset.i = String(E.idx(r, c));
        d.dataset.owner = owner;
        el.appendChild(d);
        list.push(d);
      }
    }
    const fx = document.createElement('div');
    fx.className = 'layer fx';
    fx.setAttribute('aria-hidden', 'true');
    el.appendChild(fx);
  }
  buildGrid(gridE, cellsE, 'enemy');
  buildGrid(gridO, cellsO, 'own');

  /** Phần tử tàu: thân tàu vẽ bằng CSS, đặt theo ô (đơn vị --cell của lưới chứa nó). */
  function shipEl(s, k, cls) {
    const el = document.createElement('div');
    el.className = 'ship ' + (s.v ? 'v' : 'h') + ' len' + s.len + (cls ? ' ' + cls : '');
    el.style.setProperty('--r', s.r);
    el.style.setProperty('--c', s.c);
    el.style.setProperty('--len', s.len);
    if (k != null) el.dataset.k = String(k);
    el.innerHTML = '<i class="hull"></i><i class="deck"></i>';
    return el;
  }

  /* ---------------- Bố cục ---------------- */
  // Lưới có hàng chữ / cột số: bề rộng = 10 ô + dải nhãn (nửa ô, tối thiểu 12px)
  const labOf = (cell) => Math.max(12, Math.round(cell * 0.5));
  const gridPx = (cell, labels) => cell * 10 + (labels ? labOf(cell) : 0);

  function setGrid(el, cell, labels) {
    el.style.setProperty('--cell', cell + 'px');
    el.style.setProperty('--lab', (labels ? labOf(cell) : 0) + 'px');
    el.classList.toggle('nolab', !labels);
  }

  /** Bề rộng thật của các cột trong .seas (để thanh trạng thái rộng bằng khu chơi). */
  function seasWidth() {
    let lo = Infinity;
    let hi = -Infinity;
    for (const el of seas.children) {
      if (!el.offsetParent) continue;
      const r = el.getBoundingClientRect();
      lo = Math.min(lo, r.left);
      hi = Math.max(hi, r.right);
    }
    return hi > lo ? Math.round(hi - lo) : seas.clientWidth;
  }

  function layout() {
    const W = seas.clientWidth;
    const H = seas.clientHeight;
    if (!W || !H) return;
    const head = 24; // tiêu đề trên mỗi lưới
    const gap = 10;
    const wide = W > H * 1.15;
    seas.classList.remove('tall', 'wide', 'wide2', 'wide3', 'short');
    seas.classList.add(wide ? 'wide' : 'tall');
    seas.classList.toggle('short', H < 330);
    requestAnimationFrame(() => stage.style.setProperty('--seas-w', seasWidth() + 'px'));
    if (phase === 'place') {
      let co;
      if (wide) {
        const sw = Math.max(220, Math.min(300, Math.round(W * 0.34)));
        seas.style.setProperty('--sw', sw + 'px');
        co = Math.min(46, (W - sw - gap * 2) / 10.5, (H - head) / 10.5);
      } else {
        seas.style.setProperty('--sw', '100%');
        const setupH = setupEl.offsetHeight;
        co = Math.min(46, W / 10.5, (H - head - setupH - gap) / 10.5);
      }
      co = Math.max(14, Math.floor(co));
      setGrid(gridO, co, true);
      seas.style.setProperty('--ow', gridPx(co, true) + 'px');
      return;
    }
    if (!wide) {
      // Dọc: lưới địch to, lưới mình nhỏ (không nhãn) cạnh bảng tàu
      const ownMin = 150;
      let ce = Math.min(50, W / 10.5, (H - head * 2 - gap - ownMin) / 10.5);
      ce = Math.max(14, Math.floor(ce));
      const ew = gridPx(ce, true);
      const fw = Math.max(120, Math.min(190, Math.round(ew * 0.42)));
      let co = Math.min(ce * 0.62, (ew - fw - gap) / 10, (H - head * 2 - gap - ew) / 10);
      co = Math.max(8, Math.floor(co));
      setGrid(gridE, ce, true);
      setGrid(gridO, co, false);
      seas.style.setProperty('--ew', ew + 'px');
      seas.style.setProperty('--ow', gridPx(co, false) + 'px');
      return;
    }
    // Ngang: lưới mình bên trái, lưới địch bên phải; bảng tàu dưới lưới mình (wide2) hoặc thành cột riêng (wide3)
    const fw = 190;
    let ce = Math.min(50, (H - head - 8) / 10.5, (W - gap * 2 - fw) / 10.5 / 1.6);
    ce = Math.max(14, Math.floor(ce));
    const ew = gridPx(ce, true);
    const rest = W - ew - gap * 2;
    seas.classList.add('wide2');
    const fh = fleetsEl.offsetHeight || 220;
    const co2 = Math.floor(Math.min(ce * 0.8, rest / 10.5, (H - head - gap - fh) / 10.5));
    const co3 = Math.floor(Math.min(ce * 0.8, (rest - fw - gap) / 10.5, (H - head) / 10.5));
    const use3 = co3 > co2;
    const co = Math.max(8, use3 ? co3 : co2);
    seas.classList.toggle('wide2', !use3);
    seas.classList.toggle('wide3', use3);
    setGrid(gridE, ce, true);
    setGrid(gridO, co, true);
    seas.style.setProperty('--ew', ew + 'px');
    seas.style.setProperty('--ow', gridPx(co, true) + 'px');
    seas.style.setProperty('--fw', fw + 'px');
  }

  /* ---------------- Vẽ ---------------- */
  function render() {
    seas.classList.toggle('place', phase === 'place');
    seas.classList.toggle('battle', phase === 'battle');
    renderOwn();
    renderEnemy();
    if (phase === 'place') renderDock();
    else renderFleets();
    renderStatus();
  }

  function markClass(el, m, i, p) {
    el.classList.toggle('miss', m === E.MISS);
    el.classList.toggle('hit', m === E.HIT);
    el.classList.toggle('empty', m === E.EMPTY);
    el.classList.toggle('last', lastShot[p] === i);
    el.classList.toggle('fresh', fresh[p] === i);
  }

  function renderOwn() {
    const layer = gridO.querySelector('.ships');
    layer.textContent = '';
    const fleet = phase === 'place' ? ships : game.fleets[0];
    fleet.forEach((s, k) => {
      if (!s) return;
      let cls = '';
      if (phase === 'place') cls = (k === sel ? 'sel' : '') + ' movable';
      else if (E.isSunk(game, 0, k)) cls = 'wreck';
      layer.appendChild(shipEl(s, k, cls));
    });
    const sunkCells = new Set();
    if (game && phase === 'battle') game.fleets[0].forEach((s, k) => { if (E.isSunk(game, 0, k)) E.shipCells(s).forEach((i) => sunkCells.add(i)); });
    for (let i = 0; i < 100; i++) {
      const c = cellsO[i];
      const m = phase === 'battle' ? game.marks[0][i] : 0;
      markClass(c, m, i, 0);
      c.classList.toggle('sunk', sunkCells.has(i));
      c.setAttribute('aria-label', ownLabel(i, m));
    }
    gridO.classList.toggle('placing', phase === 'place');
  }

  function ownLabel(i, m) {
    const parts = [cellName(i)];
    const fleet = phase === 'place' ? ships : game.fleets[0];
    const k = fleet.findIndex((s) => s && E.shipCells(s).indexOf(i) >= 0);
    if (k >= 0) parts.push(shipName(k));
    if (m === E.MISS) parts.push(t('cell.miss'));
    else if (m === E.HIT) parts.push(t('cell.hit'));
    return parts.join(', ');
  }

  function renderEnemy() {
    const layer = gridE.querySelector('.ships');
    layer.textContent = '';
    if (phase !== 'battle') return;
    const over = game.winner != null;
    const sunkCells = new Set();
    game.fleets[1].forEach((s, k) => {
      const sunk = E.isSunk(game, 1, k);
      if (sunk) E.shipCells(s).forEach((i) => sunkCells.add(i));
      // Chỉ vẽ tàu địch đã chìm; thua thì lộ nốt tàu còn lại (mờ)
      if (sunk) layer.appendChild(shipEl(s, null, 'wreck'));
      else if (over && game.winner === 1) layer.appendChild(shipEl(s, null, 'reveal'));
    });
    for (let i = 0; i < 100; i++) {
      const c = cellsE[i];
      const m = game.marks[1][i];
      markClass(c, m, i, 1);
      c.classList.toggle('sunk', sunkCells.has(i));
      c.classList.toggle('open', m === E.UNKNOWN && !over);
      c.classList.toggle('cursor', i === cursor);
      c.setAttribute('aria-label', enemyLabel(i, m, sunkCells.has(i)));
    }
    gridE.classList.toggle('aiming', myTurn());
    gridE.classList.toggle('kb', cursor >= 0);
  }

  function enemyLabel(i, m, sunk) {
    const parts = [cellName(i)];
    if (m === E.MISS) parts.push(t('cell.miss'));
    else if (m === E.HIT) parts.push(t(sunk ? 'cell.sunk' : 'cell.hit'));
    else if (m === E.EMPTY) parts.push(t('cell.empty'));
    else parts.push(t('cell.unknown'));
    return parts.join(', ');
  }

  /** Bến tàu: tàu chưa đặt (kéo được), chỗ trống mờ cho tàu đã đặt. */
  function renderDock() {
    dockEl.textContent = '';
    FLEET.forEach((len, k) => {
      const slot = document.createElement('div');
      slot.className = 'dock-slot';
      slot.style.setProperty('--len', len);
      if (!ships[k]) {
        const el = shipEl({ r: 0, c: 0, len, v: false }, k, 'movable' + (k === sel ? ' sel' : ''));
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', shipName(k) + ' (' + len + ')');
        slot.appendChild(el);
      } else {
        slot.classList.add('placed');
      }
      dockEl.appendChild(slot);
    });
    const ready = E.fleetValid(ships);
    $('btn-start').disabled = !ready;
    $('btn-rotate').disabled = sel < 0 || !ships[sel];
    $('btn-clear').disabled = ships.every((s) => !s);
  }

  function renderFleets() {
    const n = shots();
    const h = E.hitsBy(game, 0);
    $('n-shots').textContent = kit.i18n.fmtNumber(n);
    $('n-hits').textContent = kit.i18n.fmtNumber(h);
    $('n-acc').textContent = n ? Math.round((h / n) * 100) + '%' : '–';
    for (const [p, id] of [[1, 'list-enemy'], [0, 'list-own']]) {
      const html = FLEET.map((len, k) => {
        const sunk = E.isSunk(game, p, k);
        return '<li class="' + (sunk ? 'down' : '') + '"><span class="sbar" style="--len:' + len + '"></span><span class="sname">' +
          shipName(k) + '</span></li>';
      }).join('');
      const ul = $(id);
      if (ul.innerHTML !== html) ul.innerHTML = html;
    }
  }

  function renderStatus() {
    let turn;
    let mode = '';
    if (phase === 'place') {
      const left = ships.filter((s) => !s).length;
      turn = t('status.place');
      if (!event) setEvent(left ? t('status.left', { n: left }) : t('status.ready'), 'info', true);
      mode = 'place';
    } else if (game.winner != null) {
      turn = t(game.winner === 0 ? 'status.won' : 'status.lost');
      mode = game.winner === 0 ? 'won' : 'lost';
    } else if (game.turn === 1) {
      turn = t('status.aiAim');
      mode = 'ai';
    } else if (busy) {
      turn = t('status.wait');
      mode = 'you';
    } else {
      turn = t('status.yourTurn');
      mode = 'you';
    }
    $('status').dataset.mode = mode;
    $('status-turn').textContent = turn;
    const ev = $('status-event');
    ev.textContent = event ? event.text : '';
    ev.dataset.kind = event ? event.kind : '';
    $('level-chip').textContent = t('chip.level', { level: t('level.' + cur.level) });
  }

  function setEvent(text, kind, quiet) {
    event = { text, kind };
    if (!quiet) renderStatus();
  }

  function announce(msg) {
    $('live').textContent = msg;
  }

  /* ---------------- Hoạt cảnh nước bắn ---------------- */
  /** Hồng tâm thu nhỏ vào ô (máy đang ngắm) rồi nổ / té nước. */
  function fxAt(grid, i, kind) {
    if (calm()) return;
    const fx = grid.querySelector('.fx');
    const el = document.createElement('div');
    el.className = 'boom ' + kind;
    el.style.setProperty('--r', E.rowOf(i));
    el.style.setProperty('--c', E.colOf(i));
    el.innerHTML = kind === 'aim' ? '<i></i>' : '<i></i><i></i><i></i><b></b><b></b><b></b><b></b><b></b><b></b>';
    fx.appendChild(el);
    setTimeout(() => el.remove(), kind === 'aim' ? 700 : 1100);
    if (kind === 'sunk' && !calm()) {
      grid.classList.remove('shake');
      void grid.offsetWidth;
      grid.classList.add('shake');
    }
  }

  /* ---------------- Lưu ---------------- */
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    const tot = totals();
    const live = inProgress();
    const st = [];
    if (tot.played) {
      st.push({ value: kit.i18n.fmtNumber(tot.won), label: t('stats.won') });
      if (stats.fewest) st.push({ value: kit.i18n.fmtNumber(stats.fewest), label: t('stats.fewestShort') });
    }
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: tot.played,
      won: tot.won,
      note: tot.played ? t('summary.note', { n: tot.won }) : t('summary.none'),
      stats: st,
      resume: live ? {
        title: t('app.name'),
        detail: t('summary.resume', { level: t('level.' + cur.level), n: shots() }),
        pct: Math.min(1, E.hitsBy(game, 0) / 17),
      } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inProgress() && !cur.ended) {
      kit.store.write(keys.save, { v: 1, level: cur.level, last: lastShot.slice(), game: E.toJSON(game) });
    } else {
      kit.store.remove(keys.save);
    }
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */
  function reset() {
    token++;
    busy = false;
    cursor = -1;
    sel = -1;
    lastShot = [-1, -1];
    fresh = [-1, -1];
    event = null;
    gridE.querySelector('.fx').textContent = '';
    gridO.querySelector('.fx').textContent = '';
    kit.modal.close('modal-result');
  }

  function newGame() {
    const s = kit.settings.get();
    reset();
    phase = 'place';
    game = null;
    ships = E.randomFleet(E.rng());
    cur = { level: LEVELS.indexOf(s.level) >= 0 ? s.level : 'medium', ended: false };
    kit.store.remove(keys.save);
    kit.sdk.start(cur.level);
    render();
    layout();
    writeSummary();
  }

  function startBattle() {
    if (phase !== 'place' || !E.fleetValid(ships)) {
      kit.sfx('error', { volume: 0.5 });
      kit.toast(t('toast.notReady'));
      return;
    }
    game = E.newGame({ seed: (Math.random() * 4294967296) >>> 0, fleet: ships });
    phase = 'battle';
    sel = -1;
    setEvent(t('event.start'), 'info', true);
    kit.sfx('start');
    render();
    layout();
    announce(t('status.yourTurn'));
    gridE.focus({ preventScroll: true });
  }

  /** Bạn bắn ô i của lưới địch. */
  function shoot(i) {
    if (phase !== 'battle' || !game || game.winner != null || kit.modal.current()) return;
    if (game.turn !== 0 || busy) {
      kit.toast(t('toast.wait'));
      return;
    }
    if (game.marks[1][i] !== E.UNKNOWN) {
      kit.sfx('error', { volume: 0.4 });
      kit.toast(t(game.marks[1][i] === E.EMPTY ? 'toast.empty' : 'toast.known'));
      return;
    }
    const r = E.fire(game, i);
    if (!r) return;
    game = r.game;
    busy = true;
    lastShot[1] = i;
    fresh[1] = i;
    report(r, i, true);
    fxAt(gridE, i, r.res);
    render();
    persist();
    if (game.winner != null) {
      // Thắng: báo ngay (hộp kết quả tự chờ hết hoạt cảnh), kẻo đóng trang giữa chừng thì mất ván
      busy = false;
      finish();
      return;
    }
    later(() => {
      fresh[1] = -1;
      aiTurn();
    }, timing().human);
  }

  /** Âm thanh + dòng sự kiện + thông báo đọc màn hình cho một phát bắn. */
  function report(r, i, byYou) {
    const where = cellName(i);
    let text;
    let kind = r.res;
    if (r.res === 'miss') text = t(byYou ? 'event.youMiss' : 'event.aiMiss', { cell: where });
    else if (r.res === 'hit') text = t(byYou ? 'event.youHit' : 'event.aiHit', { cell: where });
    else text = t(byYou ? 'event.youSunk' : 'event.aiSunk', { ship: shipName(r.ship), cell: where });
    if (r.res === 'sunk') kind = 'sunk';
    setEvent(text, (byYou ? 'you-' : 'ai-') + kind, true);
    announce(text);
    kit.sfx(r.res === 'miss' ? 'drop' : r.res === 'hit' ? 'capture' : 'combo');
    if (r.res === 'sunk') kit.toast(text);
  }

  /** Lượt máy: ngắm (hồng tâm trên lưới mình) rồi bắn. */
  function aiTurn() {
    if (!game || game.winner != null || game.turn !== 1) return;
    busy = true;
    render();
    const tm = timing();
    const think = tm.thinkMin + Math.random() * (tm.thinkMax - tm.thinkMin);
    const i = E.aiMove(game, cur.level);
    later(() => fxAt(gridO, i, 'aim'), Math.max(0, think - tm.aim));
    later(() => {
      const r = E.fire(game, i);
      if (!r) { // không xảy ra: máy luôn chọn ô chưa biết
        busy = false;
        render();
        return;
      }
      game = r.game;
      lastShot[0] = i;
      fresh[0] = i;
      report(r, i, false);
      fxAt(gridO, i, r.res);
      render();
      persist();
      if (game.winner != null) {
        busy = false;
        finish();
        return;
      }
      later(() => {
        fresh[0] = -1;
        busy = false;
        render();
        announce(t('status.yourTurn'));
      }, tm.ai);
    }, think);
  }

  function finish() {
    if (cur.ended) return;
    cur.ended = true;
    const won = game.winner === 0;
    const lv = stats.levels[cur.level];
    const n = shots();
    const h = E.hitsBy(game, 0);
    lv.played++;
    lv.shots += n;
    lv.hits += h;
    if (won) {
      lv.won++;
      stats.streak++;
      stats.best = Math.max(stats.best, stats.streak);
      if (!stats.fewest || n < stats.fewest) stats.fewest = n;
    } else {
      lv.lost++;
      stats.streak = 0;
    }
    saveStats();
    persist();
    // Thua vẫn là một ván đã chơi (bạn đã bắn ít nhất một phát): gửi won: false
    kit.sdk.end({ mode: cur.level, won, assisted: false });
    kit.sfx(won ? 'win' : 'lose');
    if (won) kit.confetti();
    render();
    const left = E.shipsLeft(game, 1);
    $('result-title').textContent = t(won ? 'result.win' : 'result.lose');
    $('result-text').textContent = won
      ? t('result.winText', { n, acc: Math.round((h / n) * 100) })
      : t('result.loseText', { n: left });
    const art = $('result-art');
    art.className = 'result-art ' + (won ? 'win' : 'lose');
    art.textContent = '';
    art.appendChild(shipEl({ r: 0, c: 0, len: 4, v: false }, null, won ? '' : 'wreck'));
    later(() => kit.modal.open('modal-result'), timing().result);
  }

  /** Ván đang dở (đã bắn) thì hỏi trước, vì bỏ ván tính là thua. */
  function requestNew() {
    if (inProgress()) kit.modal.open('modal-confirm');
    else newGame();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inProgress() && !cur.ended) {
      const lv = stats.levels[cur.level];
      lv.played++;
      lv.lost++;
      lv.shots += shots();
      lv.hits += E.hitsBy(game, 0);
      stats.streak = 0;
      saveStats();
      kit.sdk.end({ mode: cur.level, won: false, assisted: false });
    }
    newGame();
  }

  /** Đổi mức: chưa bắn phát nào thì áp dụng ngay (gửi lại start với mode mới), đã bắn thì để ván sau. */
  function onSetting(key, value) {
    if (key !== 'level' || !cur || LEVELS.indexOf(value) < 0) return;
    if (cur.ended || value === cur.level) return;
    if (shots() === 0) {
      cur.level = value;
      kit.sdk.start(cur.level);
      renderStatus();
      writeSummary();
    } else {
      kit.toast(t('toast.next'));
    }
  }

  /* ---------------- Xếp tàu ---------------- */
  function selectShip(k) {
    sel = k;
    if (k >= 0 && !ships[k]) placeFromDock(k);
    render();
  }

  /** Đưa tàu k từ bến ra biển ở chỗ hợp lệ đầu tiên (theo thứ tự đọc). */
  function placeFromDock(k) {
    const list = E.placements(ships, k);
    if (!list.length) {
      kit.sfx('error', { volume: 0.5 });
      kit.toast(t('toast.noRoom'));
      return false;
    }
    ships[k] = list[0];
    kit.sfx('place');
    return true;
  }

  function setShip(k, s) {
    ships[k] = s;
    sel = k;
    event = null;
    kit.sfx('place');
  }

  /** Xoay tàu k quanh ô đầu; chật thì tìm chỗ gần nhất xoay được. */
  function rotate(k) {
    const s = ships[k];
    if (!s) return;
    const ns = { r: s.r, c: s.c, len: s.len, v: !s.v };
    if (E.canPlace(ships, k, ns)) {
      ships[k] = ns;
    } else {
      let best = null;
      let bd = 4;
      for (const p of E.placements(ships, k)) {
        if (p.v !== ns.v) continue;
        const d = Math.abs(p.r - s.r) + Math.abs(p.c - s.c);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (!best) {
        kit.sfx('error', { volume: 0.5 });
        kit.toast(t('toast.noRotate'));
        return;
      }
      ships[k] = best;
    }
    kit.sfx('flip');
    render();
  }

  /** Dời tàu đang chọn theo hướng (dr, dc) tới chỗ hợp lệ gần nhất. */
  function nudge(dr, dc) {
    if (sel < 0) selectShip(ships.findIndex((s) => s));
    if (sel < 0 || !ships[sel]) return;
    const s = ships[sel];
    for (let step = 1; step < 10; step++) {
      const ns = { r: s.r + dr * step, c: s.c + dc * step, len: s.len, v: s.v };
      if (ns.r < 0 || ns.c < 0 || ns.r > 9 || ns.c > 9) break;
      if (E.canPlace(ships, sel, ns)) {
        ships[sel] = ns;
        kit.sfx('move');
        render();
        return;
      }
    }
    kit.sfx('error', { volume: 0.4 });
  }

  /** Chạm ô biển khi đang xếp: tàu đang chọn dời tới đó (giữ hướng, không được thì đổi hướng). */
  function placeAt(i) {
    if (sel < 0) return;
    const len = FLEET[sel];
    const v0 = ships[sel] ? ships[sel].v : false;
    for (const v of [v0, !v0]) {
      const s = { r: E.rowOf(i), c: E.colOf(i), len, v };
      if (E.canPlace(ships, sel, s)) {
        setShip(sel, s);
        render();
        return;
      }
    }
    kit.sfx('error', { volume: 0.5 });
    kit.toast(t('toast.cantPlace'));
  }

  function randomize() {
    ships = E.randomFleet(E.rng());
    sel = -1;
    event = null;
    kit.sfx('move');
    render();
  }
  function clearAll() {
    ships = FLEET.map(() => null);
    sel = -1;
    event = null;
    kit.sfx('clear');
    render();
  }

  /* ---------------- Kéo thả ---------------- */
  let drag = null; // { k, from, el, x0, y0, off, v, moved, ghost, cand, ok, px, py }
  let swallowClick = false; // cú click trình duyệt bắn ra ngay sau khi thả / chạm tàu: đã xử lý ở pointerup

  /** Ô của lưới mình dưới điểm (x, y) màn hình; -1 nếu ngoài lưới. */
  function cellAt(x, y) {
    const L = gridO.querySelector('.ships').getBoundingClientRect();
    const cell = L.width / 10;
    const c = Math.floor((x - L.left) / cell);
    const r = Math.floor((y - L.top) / cell);
    return r >= 0 && r < 10 && c >= 0 && c < 10 ? E.idx(r, c) : -1;
  }

  /** Tàu nào (trong lúc xếp) phủ ô i; -1 nếu không. */
  const shipOn = (i) => ships.findIndex((s) => s && E.shipCells(s).indexOf(i) >= 0);

  function onPointerDown(e) {
    if (phase !== 'place' || (e.button != null && e.button > 0) || !e.target.closest) return;
    let el;
    let k;
    let off;
    let from;
    const i = e.target.closest('#grid-own') ? cellAt(e.clientX, e.clientY) : -1;
    if (i >= 0) {
      // Trên biển: ô nằm trên tàu nên tìm tàu theo tọa độ chạm
      k = shipOn(i);
      if (k < 0) return;
      el = gridO.querySelector('.ship[data-k="' + k + '"]');
      off = E.shipCells(ships[k]).indexOf(i);
      from = 'grid';
    } else {
      el = e.target.closest('#dock .ship.movable');
      if (!el) return;
      k = Number(el.dataset.k);
      const rect = el.getBoundingClientRect();
      off = Math.max(0, Math.min(FLEET[k] - 1, Math.floor(((e.clientX - rect.left) / rect.width) * FLEET[k])));
      from = 'dock';
    }
    if (!el) return;
    const v = from === 'grid' ? ships[k].v : false;
    drag = { k, from, el, x0: e.clientX, y0: e.clientY, off, v, moved: false, ghost: null, cand: null, ok: false, px: e.clientX, py: e.clientY };
    try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
    e.preventDefault();
  }

  function clearPreview() {
    cellsO.forEach((c) => c.classList.remove('pv-ok', 'pv-bad'));
  }

  function dragUpdate() {
    const d = drag;
    const cell = parseFloat(gridO.style.getPropertyValue('--cell')) || 30;
    if (!d.ghost) {
      d.ghost = shipEl({ r: 0, c: 0, len: FLEET[d.k], v: d.v }, null, 'ghost');
      d.ghost.style.setProperty('--cell', cell + 'px');
      document.body.appendChild(d.ghost);
      d.el.classList.add('lifted');
    }
    d.ghost.classList.toggle('v', d.v);
    d.ghost.classList.toggle('h', !d.v);
    d.ghost.style.left = d.px - (d.v ? 0.5 : d.off + 0.5) * cell + 'px';
    d.ghost.style.top = d.py - (d.v ? d.off + 0.5 : 0.5) * cell + 'px';
    const L = gridO.querySelector('.ships').getBoundingClientRect();
    const col = Math.floor((d.px - L.left) / cell) - (d.v ? 0 : d.off);
    const row = Math.floor((d.py - L.top) / cell) - (d.v ? d.off : 0);
    const over = d.px >= L.left - cell && d.px <= L.right + cell && d.py >= L.top - cell && d.py <= L.bottom + cell;
    clearPreview();
    d.cand = over ? { r: row, c: col, len: FLEET[d.k], v: d.v } : null;
    d.ok = !!d.cand && E.canPlace(ships, d.k, d.cand);
    d.ghost.classList.toggle('bad', !!d.cand && !d.ok);
    if (d.cand) {
      for (let q = 0; q < d.cand.len; q++) {
        const r = d.v ? row + q : row;
        const c = d.v ? col : col + q;
        if (r >= 0 && r < 10 && c >= 0 && c < 10) cellsO[E.idx(r, c)].classList.add(d.ok ? 'pv-ok' : 'pv-bad');
      }
    }
  }

  function onPointerMove(e) {
    if (!drag) return;
    drag.px = e.clientX;
    drag.py = e.clientY;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    drag.moved = true;
    dragUpdate();
  }

  function endDrag(e, cancelled) {
    const d = drag;
    if (!d) return;
    drag = null;
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 0);
    clearPreview();
    if (d.ghost) d.ghost.remove();
    d.el.classList.remove('lifted');
    if (!d.moved) {
      if (cancelled) return;
      // Chạm: chọn tàu; chạm lại tàu đang chọn trên biển thì xoay
      if (d.from === 'grid' && sel === d.k) rotate(d.k);
      else selectShip(d.k);
      return;
    }
    if (!cancelled && d.ok) {
      setShip(d.k, d.cand);
    } else if (!cancelled && d.from === 'grid' && inRect(dockEl.getBoundingClientRect(), d.px, d.py)) {
      ships[d.k] = null; // thả về bến
      sel = -1;
      kit.sfx('pop');
    } else {
      kit.sfx('error', { volume: 0.4 });
    }
    render();
  }
  const inRect = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

  for (const el of [gridO, dockEl]) el.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', (e) => endDrag(e, false));
  document.addEventListener('pointercancel', (e) => endDrag(e, true));

  /* ---------------- Sự kiện ---------------- */
  gridE.addEventListener('click', (e) => {
    const c = e.target.closest && e.target.closest('.cell');
    if (!c) return;
    cursor = -1;
    shoot(Number(c.dataset.i));
  });
  gridO.addEventListener('click', (e) => {
    if (phase !== 'place' || swallowClick) return;
    const c = e.target.closest && e.target.closest('.cell');
    // Ô có tàu: chạm đã được xử lý ở pointerup (chọn / xoay)
    if (c && shipOn(Number(c.dataset.i)) < 0) placeAt(Number(c.dataset.i));
  });

  function moveCursor(dr, dc) {
    if (document.activeElement !== gridE) gridE.focus({ preventScroll: true });
    if (cursor < 0) {
      cursor = lastShot[1] >= 0 ? lastShot[1] : E.idx(4, 4);
    } else {
      const r = Math.max(0, Math.min(9, E.rowOf(cursor) + dr));
      const c = Math.max(0, Math.min(9, E.colOf(cursor) + dc));
      cursor = E.idx(r, c);
    }
    renderEnemy();
    announce(cellsE[cursor].getAttribute('aria-label'));
  }

  const DIRS = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key;
    const onButton = e.target && e.target.closest && e.target.closest('button, input, select, a');
    if (k === 'n' || k === 'N') requestNew();
    else if (phase === 'place') {
      if (drag && (k === 'r' || k === 'R')) {
        drag.v = !drag.v;
        if (drag.moved) dragUpdate();
      } else if (k >= '1' && k <= '5') selectShip(Number(k) - 1);
      else if (DIRS[k] && !e.target.closest('.segmented')) nudge(DIRS[k][0], DIRS[k][1]);
      else if (k === 'r' || k === 'R') {
        if (sel >= 0) rotate(sel);
      } else if (k === 'x' || k === 'X') randomize();
      else if ((k === 'Backspace' || k === 'Delete') && sel >= 0 && ships[sel]) {
        ships[sel] = null;
        sel = -1;
        kit.sfx('pop');
        render();
      } else if (k === 's' || k === 'S') startBattle();
      else if (k === 'Escape' && sel >= 0) {
        sel = -1;
        render();
      } else return;
    } else if (phase === 'battle') {
      if (DIRS[k]) moveCursor(DIRS[k][0], DIRS[k][1]);
      else if ((k === 'Enter' || k === ' ') && !onButton) {
        if (cursor < 0) moveCursor(0, 0);
        else shoot(cursor);
      } else return;
    } else return;
    e.preventDefault();
  });

  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', newGame);
  $('btn-start').addEventListener('click', startBattle);
  $('btn-random').addEventListener('click', randomize);
  $('btn-clear').addEventListener('click', clearAll);
  $('btn-rotate').addEventListener('click', () => { if (sel >= 0) rotate(sel); });
  $('btn-stats').addEventListener('click', renderStats);

  function renderStats() {
    const tot = totals();
    const fmt = kit.i18n.fmtNumber;
    $('stats-played').textContent = fmt(tot.played);
    $('stats-won').textContent = fmt(tot.won);
    $('stats-streak').textContent = fmt(stats.streak);
    $('stats-fewest').textContent = stats.fewest ? fmt(stats.fewest) : '–';
    $('stats-body').innerHTML = LEVELS.map((lv) => {
      const r = stats.levels[lv];
      const acc = r.shots ? Math.round((r.hits / r.shots) * 100) + '%' : '–';
      return '<tr><th scope="row">' + t('level.' + lv) + '</th><td>' + fmt(r.played) + '</td><td>' + fmt(r.won) + '</td><td>' + fmt(r.lost) + '</td><td>' + acc + '</td></tr>';
    }).join('');
  }

  kit.onLeave(persist);
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe(seas);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 && LEVELS.indexOf(saved.level) >= 0 ? E.fromJSON(saved.game) : null;
  if (restored && restored.winner == null && E.shotsBy(restored, 0) > 0) {
    reset();
    phase = 'battle';
    game = restored;
    ships = restored.fleets[0];
    cur = { level: saved.level, ended: false };
    const okIdx = (x) => (Number.isInteger(x) && x >= 0 && x < 100 ? x : -1);
    if (Array.isArray(saved.last)) lastShot = [okIdx(saved.last[0]), okIdx(saved.last[1])];
    setEvent(t('toast.saved'), 'info', true);
    kit.sdk.start(cur.level, true);
    kit.toast(t('toast.saved'));
    render();
    layout();
    writeSummary();
    if (game.turn === 1) aiTurn();
  } else {
    newGame();
  }
  layout();
})();
