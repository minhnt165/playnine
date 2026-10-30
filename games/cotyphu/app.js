/* =====================================================================
 * Cờ Tỷ Phú - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Bạn (ghế 0) đấu 3 máy cùng mức Dễ / Vừa / Khó trên bàn vòng 28 ô. Hết 30 vòng (hoặc chỉ còn một
 *     người) thì xếp hạng theo tổng tài sản; bạn thắng khi về nhất. Bạn phá sản là hết ván (thua).
 *   - Bàn là lưới CSS 8×8: 28 ô quanh viền, giữa bàn là thẻ thông tin (chi tiết ô đang chọn, thẻ vừa rút,
 *     lượt hiện tại) + xúc xắc. Quân 4 màu khác hình (tròn / vuông / tam giác / thoi) đi từng ô.
 *   - Mọi luật nằm trong engine; app chỉ gọi E.act rồi phát lại danh sách sự kiện g.ev thành hoạt cảnh
 *     (gieo, đi từng ô, tiền bay lên / xuống, thẻ) và nhật ký. Ván được lưu ngay sau mỗi thao tác
 *     (trước hoạt cảnh) nên tải lại không gieo lại được.
 *   - Máy: E.aiAction(g, mức) từng thao tác một, "nghĩ" ~0,55 s (Nhanh ~0,25 s). Máy đề nghị mua đất
 *     của bạn thì hiện hộp thoại Bán / Từ chối; bạn đề nghị mua đất của máy thì máy trả lời bằng E.aiAccept.
 *   - Báo ván cho cổng (metric wins, mode = mức máy): ván mới kit.sdk.start(level), mở lại
 *     kit.sdk.start(level, true); hết ván kit.sdk.end({ mode, won: về nhất, assisted: false });
 *     bỏ ván khi đã gieo ít nhất một lần: won false; chưa gieo lần nào thì không gửi.
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const { BOARD, GROUPS, N, LEVELS } = E;
  const kit = PNKit.init({
    gameId: 'cotyphu',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { level: 'medium', speed: 'normal' },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);

  const SEAT_COLORS = ['#7c5cff', '#f59e0b', '#10b981', '#ec4899'];
  const BOT_NAMES = ['', 'Mai', 'Khoa', 'Vy'];
  const LOG_KEEP = 40;

  /** Nhịp hoạt cảnh theo tốc độ trong Cài đặt (ms). */
  function pace() {
    if (kit.settings.get().speed === 'fast') return { step: 85, roll: 300, think: 250, card: 900, money: 120 };
    return { step: 185, roll: 620, think: 560, card: 1500, money: 260 };
  }

  function freshSeed() {
    try {
      return crypto.getRandomValues(new Uint32Array(1))[0];
    } catch (e) {
      return (Math.random() * 4294967296) >>> 0;
    }
  }

  /* ---------------- Thống kê ---------------- */
  const toInt = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const st = { levels: {}, streak: toInt(raw.streak), bestStreak: toInt(raw.bestStreak), best: toInt(raw.best) };
    for (const lv of LEVELS) {
      const r = (raw.levels && raw.levels[lv]) || {};
      st.levels[lv] = { played: toInt(r.played), won: toInt(r.won) };
    }
    return st;
  }
  const stats = loadStats();
  const totals = () => LEVELS.reduce((a, lv) => ({ played: a.played + stats.levels[lv].played, won: a.won + stats.levels[lv].won }), { played: 0, won: 0 });

  /* ---------------- Trạng thái ---------------- */
  let game = null;
  let cur = null; // { level, acted (đã gieo ít nhất một lần), ended }
  let token = 0; // đổi khi chia ván mới: hủy mọi hẹn giờ cũ
  let busy = false; // đang phát hoạt cảnh
  let sel = -1; // ô đang xem chi tiết
  let mode = null; // 'build' | 'mort': chạm ô để xây / cầm cố
  let flash = null; // thẻ vừa rút { d, id, p }
  let shown = null; // { pos: [], cash: [] } đang hiển thị (đi sau trạng thái thật trong lúc hoạt cảnh)
  let logList = []; // sự kiện cho nhật ký (cũ trước)
  let pendingOffer = null; // máy đang đề nghị mua đất của bạn
  let offerAmt = 0;
  let offerPos = -1;
  let asking = false; // đang chờ máy trả lời đề nghị của bạn
  let aiTimer = 0;
  let thinking = false;

  const money = (n) => '¤' + kit.i18n.fmtNumber(Math.round(n));
  const sqKey = (i) => BOARD[i].id || BOARD[i].k;
  const sqName = (i) => t('sq.' + sqKey(i));
  /** Tên ngắn trên ô (cảng / xưởng bỏ chữ "Cảng", "Xưởng" vì đã có biểu tượng); thiếu thì dùng tên đầy đủ. */
  const cellName = (i) => {
    const k = 'cell.' + sqKey(i);
    const s = t(k);
    return s === k ? sqName(i) : s;
  };
  const pname = (p) => (p === 0 ? t('pl.you') : BOT_NAMES[p]);
  const who = (p) => (p < 0 ? t('pl.bank') : '<b class="who s' + p + '">' + pname(p) + '</b>');
  const levelName = (lv) => t('level.' + lv);
  const humanTurn = () => !!game && !game.over && game.turn === 0;
  const canAct = () => humanTurn() && !busy && !kit.modal.current() && !pendingOffer && !asking;
  const inProgress = () => !!game && !game.over && !!cur && cur.acted && !cur.ended;

  /* ---------------- Hình quân ---------------- */
  function shapeSvg(p) {
    const c = SEAT_COLORS[p];
    const st = 'fill="' + c + '" stroke="#fff" stroke-width="2" stroke-linejoin="round"';
    const body = [
      '<circle cx="12" cy="12" r="9" ' + st + '/>',
      '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5" ' + st + '/>',
      '<path d="M12 2.5 21.5 20h-19z" ' + st + '/>',
      '<path d="M12 1.8 22.2 12 12 22.2 1.8 12z" ' + st + '/>',
    ][p];
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';
  }

  /* ---------------- Biểu tượng ô đặc biệt ---------------- */
  const ICON = {
    start: '<path d="M3 11h11.2l-3.6-3.6L12 6l6 6-6 6-1.4-1.4 3.6-3.6H3z"/><path d="M20 4h1.5v16H20z"/>',
    jail: '<path d="M4 3h16v18H4zm2 2v14h2V5zm4 0v14h4V5zm6 0v14h2V5z"/>',
    rest: '<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zm13 1h1.5a2.5 2.5 0 0 1 0 5H17v-2h1.5a.5.5 0 0 0 0-1H17zM3 19h16v2H3zM8 2c1 1.2 1 2.3 0 3.5M12 2c1 1.2 1 2.3 0 3.5" stroke="currentColor" stroke-width="0" />',
    goto: '<path d="M12 2 1.5 21h21zm-1 7h2v6h-2zm0 8h2v2h-2z"/>',
    tax: '<path d="M18.5 4 20 5.5 5.5 20 4 18.5zM7 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm10 10a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/>',
    chance: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 16h-2v-2h2zm1.6-6.4-.9.8c-.6.6-.7 1-.7 2.1h-2v-.5c0-1 .3-1.7 1-2.3l1.2-1.1a1.7 1.7 0 1 0-2.9-1.2H8.3a3.7 3.7 0 1 1 6.3 2.2z"/>',
    fortune: '<path d="m12 2 2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 16.9l-6.1 3.5 1.5-6.8L2.2 9l6.9-.7z"/>',
    port: '<path d="M12 2a3 3 0 0 1 1 5.8V9h4v2h-4v8.9c3-.4 5.4-2.6 5.9-5.6l-2-.3 3.4-3.4 1.5 4.3-1-.2A9 9 0 0 1 3.2 14.7l-1 .2L3.7 10.6 7.1 14l-2 .3c.5 3 2.9 5.2 5.9 5.6V11H7V9h4V7.8A3 3 0 0 1 12 2zm0 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>',
    solar: '<path d="M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM11 1h2v4h-2zm0 18h2v4h-2zM1 11h4v2H1zm18 0h4v2h-4zM4.2 2.8l2.8 2.8-1.4 1.4-2.8-2.8zm14.2 14.2 2.8 2.8-1.4 1.4-2.8-2.8zM2.8 19.8l2.8-2.8 1.4 1.4-2.8 2.8zM17 5.6l2.8-2.8 1.4 1.4-2.8 2.8z"/>',
    water: '<path d="M12 2s7 7.6 7 12.5A7 7 0 0 1 5 14.5C5 9.6 12 2 12 2z"/>',
  };
  const iconOf = (i) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICON[sqKey(i)] || ICON[BOARD[i].k] || '') + '</svg>';

  /* ---------------- Dựng bàn ---------------- */
  const boardEl = $('board');
  const tokensEl = $('tokens');
  const cells = [];
  const tokenEls = [];
  /** Hàng / cột (1..8) của ô i: Xuất phát góc dưới phải, đi ngược chiều kim đồng hồ quanh bàn. */
  function cellRC(i) {
    if (i <= 7) return [8, 8 - i];
    if (i <= 14) return [8 - (i - 7), 1];
    if (i <= 21) return [1, 1 + (i - 14)];
    return [1 + (i - 21), 8];
  }
  const sideOf = (i) => (i % 7 === 0 ? 'corner' : i < 7 ? 'b' : i < 14 ? 'l' : i < 21 ? 't' : 'r');
  function buildBoard() {
    const center = $('center');
    for (let i = 0; i < N; i++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.dataset.i = i;
      const [r, c] = cellRC(i);
      el.style.gridRow = String(r);
      el.style.gridColumn = String(c);
      boardEl.insertBefore(el, center);
      cells.push(el);
    }
    for (let p = 0; p < 4; p++) {
      const tk = document.createElement('span');
      tk.className = 'token s' + p;
      tk.innerHTML = shapeSvg(p);
      tokensEl.appendChild(tk);
      tokenEls.push(tk);
    }
  }

  /* ---------------- Bố cục ---------------- */
  let unit = 40;
  const PANEL_H = 214; // chỗ tối thiểu cho bảng điều khiển khi bàn ở trên (dọc)
  const PANEL_W = 300; // … khi bàn ở bên trái (ngang)
  function layout() {
    const stage = $('stage');
    const box = $('board-box');
    const row = getComputedStyle(stage).flexDirection === 'row';
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const side = Math.floor(Math.max(120, row ? Math.min(H, W - PANEL_W - 10) : Math.min(W, H - PANEL_H - 10)));
    if (W < 50 || H < 50) return;
    box.style.width = row ? side + 'px' : '100%';
    box.style.height = side + 'px';
    boardEl.style.width = side + 'px';
    boardEl.style.height = side + 'px';
    unit = side / 8.8;
    boardEl.style.setProperty('--u', unit.toFixed(2) + 'px');
    placeTokens(false);
  }

  /* ---------------- Vẽ ô ---------------- */
  function modeOk(i) {
    if (!mode || !canAct()) return false;
    if (mode === 'build') return E.canBuild(game, 0, i);
    return E.canMortgage(game, 0, i) || E.canUnmortgage(game, 0, i);
  }
  function housesHtml(h) {
    if (!h) return '';
    if (h === 5) return '<span class="hotel"></span>';
    return '<span class="house"></span>'.repeat(h);
  }
  function renderCells() {
    const lastLand = game && !game.over ? game.players[game.turn].pos : -1;
    for (let i = 0; i < N; i++) {
      const sq = BOARD[i];
      const el = cells[i];
      const o = game.own[i];
      let cls = 'cell side-' + sideOf(i) + ' k-' + sq.k;
      if (o >= 0) cls += ' owned';
      if (game.mort[i]) cls += ' mort';
      if (sel === i) cls += ' sel';
      if (modeOk(i)) cls += ' can';
      if (i === lastLand && !busy) cls += ' here';
      el.className = cls;
      let html = '';
      if (sq.k === 'lot') html += '<span class="band" style="--gc:' + GROUPS[sq.g].color + '">' + housesHtml(game.houses[i]) + '</span>';
      else html += '<span class="ic">' + iconOf(i) + '</span>';
      html += '<span class="nm">' + cellName(i) + '</span>';
      if (E.buyable(i)) html += '<span class="pr">' + (game.mort[i] ? t('cell.mort') : money(sq.price)) + '</span>';
      else if (sq.k === 'tax') html += '<span class="pr">' + money(sq.amt) + '</span>';
      if (o >= 0) html += '<span class="ow" style="--pc:' + SEAT_COLORS[o] + '">' + shapeSvg(o) + '</span>';
      el.innerHTML = html;
      el.style.setProperty('--pc', o >= 0 ? SEAT_COLORS[o] : 'transparent');
      el.setAttribute('aria-label', cellLabel(i));
    }
  }
  function cellLabel(i) {
    const sq = BOARD[i];
    let s = sqName(i);
    if (E.buyable(i)) {
      const o = game.own[i];
      s += ', ' + (o < 0 ? t('aria.free', { price: money(sq.price) }) : t('aria.owner', { name: pname(o) }));
      if (game.houses[i]) s += ', ' + t(game.houses[i] === 5 ? 'aria.hotel' : 'aria.houses', { n: game.houses[i] });
      if (game.mort[i]) s += ', ' + t('cell.mort');
    }
    const here = game.players.map((p, k) => (!p.out && p.pos === i ? pname(k) : null)).filter(Boolean);
    if (here.length) s += '. ' + t('aria.here', { names: here.join(', ') });
    return s;
  }

  /* ---------------- Quân ---------------- */
  /** Tâm quân của người p khi đứng ở ô i (lệch theo số quân cùng ô). */
  function tokenXY(p, i) {
    const el = cells[i];
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const together = [];
    for (let k = 0; k < 4; k++) if (!game.players[k].out && shown.pos[k] === i) together.push(k);
    if (together.indexOf(p) < 0) together.push(p);
    const n = together.length;
    const k = together.indexOf(p);
    const d = Math.min(w, h) * 0.2;
    const offs = n === 1 ? [[0, 0]] : n === 2 ? [[-d, 0], [d, 0]] : [[-d, -d], [d, -d], [-d, d], [d, d]];
    const [ox, oy] = offs[k] || [0, 0];
    // lệch về mép ngoài của ô để không che tên ô
    const side = sideOf(i);
    const sx = side === 'l' ? -w * 0.2 : side === 'r' ? w * 0.2 : 0;
    const sy = side === 'b' ? h * 0.2 : side === 't' ? -h * 0.2 : side === 'corner' ? h * 0.12 : 0;
    return [el.offsetLeft + w / 2 + ox + sx, el.offsetTop + h / 2 + oy + sy];
  }
  function placeTokens(animate, only) {
    if (!game || !shown) return;
    const size = Math.max(14, unit * 0.42);
    for (let p = 0; p < 4; p++) {
      if (only !== undefined && only !== p) continue;
      const tk = tokenEls[p];
      const pl = game.players[p];
      tk.hidden = pl.out;
      if (pl.out) continue;
      const [x, y] = tokenXY(p, shown.pos[p]);
      tk.style.width = tk.style.height = size + 'px';
      tk.style.transitionDuration = animate ? pace().step * 0.9 + 'ms' : '0ms';
      tk.style.transform = 'translate(' + (x - size / 2).toFixed(1) + 'px,' + (y - size / 2).toFixed(1) + 'px)';
      tk.classList.toggle('jailed', pl.jail && shown.pos[p] === E.JAIL);
      tk.classList.toggle('active', !game.over && game.turn === p);
    }
  }
  /** Đi từng ô từ `from` tới `to` (n bước, âm là lùi); cb khi xong. */
  function animateMove(p, from, to, n, cb) {
    const tk = token;
    if (calm()) {
      shown.pos[p] = to;
      placeTokens(false);
      setTimeout(() => tk === token && cb(), 120);
      return;
    }
    const steps = Math.abs(n);
    const dir = n < 0 ? -1 : 1;
    const ms = steps > 12 ? Math.max(45, Math.round((pace().step * 12) / steps)) : pace().step;
    let k = 0;
    const el = tokenEls[p];
    const stepOnce = () => {
      if (tk !== token) return;
      if (k >= steps) {
        shown.pos[p] = to;
        placeTokens(true);
        setTimeout(() => tk === token && cb(), ms * 0.6);
        return;
      }
      k++;
      shown.pos[p] = (from + dir * k + N) % N;
      el.style.transitionDuration = ms * 0.9 + 'ms';
      placeTokens(true);
      el.classList.remove('hop');
      void el.offsetWidth;
      el.classList.add('hop');
      if (k % 2 === 0 || steps < 6) kit.sfx('move', { volume: 0.35 });
      setTimeout(stepOnce, ms);
    };
    stepOnce();
  }

  /* ---------------- Xúc xắc ---------------- */
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function dieHtml(v) {
    let s = '';
    for (let k = 0; k < 9; k++) s += '<i' + (PIPS[v].indexOf(k) >= 0 ? ' class="on"' : '') + '></i>';
    return s;
  }
  function setDice(d) {
    const a = $('die-a');
    const b = $('die-b');
    $('dice').classList.toggle('empty', !d);
    a.innerHTML = dieHtml(d ? d[0] : 1);
    b.innerHTML = dieHtml(d ? d[1] : 1);
    $('dice').classList.toggle('double', !!d && d[0] === d[1]);
  }
  function rollAnim(d, cb) {
    const tk = token;
    kit.sfx('drop');
    if (calm()) {
      setDice(d);
      setTimeout(() => tk === token && cb(), 150);
      return;
    }
    const box = $('dice');
    box.classList.remove('rolling');
    void box.offsetWidth;
    box.classList.add('rolling');
    const face = () => 1 + Math.floor(Math.random() * 6);
    const iv = setInterval(() => setDice([face(), face()]), 70);
    setTimeout(() => {
      clearInterval(iv);
      box.classList.remove('rolling');
      if (tk !== token) return;
      setDice(d);
      kit.sfx('place', { volume: 0.5 });
      setTimeout(() => tk === token && cb(), 160);
    }, pace().roll);
  }

  /* ---------------- Bảng người chơi ---------------- */
  function renderPlayers() {
    const box = $('players');
    let html = '';
    for (let p = 0; p < 4; p++) {
      const pl = game.players[p];
      const active = !game.over && game.turn === p;
      let cls = 'pl s' + p;
      if (active) cls += ' active';
      if (pl.out) cls += ' out';
      if (active && thinking) cls += ' thinking';
      const badges = (pl.jail ? '<span class="badge jail" title="' + t('badge.jail') + '">' + iconOf(E.JAIL) + '</span>' : '') +
        (pl.cards.length ? '<span class="badge card" title="' + t('badge.card') + '">' + iconOf(2) + '</span>' : '');
      const sub = pl.out ? t('pl.out') : t('pl.worth', { v: money(E.netWorth(game, p)) });
      html += '<div class="' + cls + '" data-seat="' + p + '">' +
        '<span class="tk">' + shapeSvg(p) + '</span>' +
        '<span class="pn">' + pname(p) + (p ? '<small>' + t('pl.bot') + '</small>' : '') + badges + '</span>' +
        '<span class="pc" id="cash-' + p + '">' + (pl.out ? '–' : money(shown.cash[p])) + '</span>' +
        '<span class="pw">' + sub + '</span></div>';
    }
    box.innerHTML = html;
  }
  function setCash(p) {
    const el = $('cash-' + p);
    if (el && !game.players[p].out) el.textContent = money(shown.cash[p]);
  }
  function floatMoney(p, delta) {
    if (calm() || !delta) return;
    const row = document.querySelector('.pl.s' + p);
    if (!row) return;
    const f = document.createElement('span');
    f.className = 'float ' + (delta > 0 ? 'up' : 'down');
    f.textContent = (delta > 0 ? '+' : '−') + money(Math.abs(delta));
    row.appendChild(f);
    setTimeout(() => f.remove(), 1000);
  }

  /* ---------------- Thẻ giữa bàn ---------------- */
  function rentRows(i) {
    const sq = BOARD[i];
    const cell = (label, v, on) => '<div class="rr' + (on ? ' on' : '') + '"><span>' + label + '</span><b>' + v + '</b></div>';
    if (sq.k === 'lot') {
      const h = game.houses[i];
      const full = game.own[i] >= 0 && E.ownsGroup(game, game.own[i], sq.g);
      let s = cell(t('rent.base'), money(sq.rent[0]), h === 0 && !full) + cell(t('rent.group'), money(sq.rent[0] * 2), h === 0 && full);
      for (let k = 1; k <= 4; k++) s += cell(t('rent.houses', { n: k }), money(sq.rent[k]), h === k);
      s += cell(t('rent.hotel'), money(sq.rent[5]), h === 5) + cell(t('rent.houseCost'), money(GROUPS[sq.g].house), false);
      return s;
    }
    if (sq.k === 'port') {
      const n = game.own[i] >= 0 ? E.PORTS.filter((j) => game.own[j] === game.own[i]).length : 0;
      return cell(t('rent.ports', { n: 1 }), money(E.PORT_RENT[1]), n === 1) + cell(t('rent.ports', { n: 2 }), money(E.PORT_RENT[2]), n === 2);
    }
    const n = game.own[i] >= 0 ? E.UTILS.filter((j) => game.own[j] === game.own[i]).length : 0;
    return cell(t('rent.utils', { n: 1 }), t('rent.dice', { k: E.UTIL_MULT[1] }), n === 1) + cell(t('rent.utils', { n: 2 }), t('rent.dice', { k: E.UTIL_MULT[2] }), n === 2);
  }
  function detailHtml(i, buyPrompt) {
    const sq = BOARD[i];
    const color = sq.k === 'lot' ? GROUPS[sq.g].color : 'var(--surface-2)';
    let s = '<div class="sq-card"><div class="sq-head' + (sq.k === 'lot' ? ' colored' : '') + '" style="--gc:' + color + '">' +
      (sq.k === 'lot' ? '' : '<span class="ic">' + iconOf(i) + '</span>') + '<span class="sq-name">' + sqName(i) + '</span>' +
      '<button class="sq-x" type="button" data-act="close" aria-label="' + t('kit.close') + '">×</button></div>';
    if (!E.buyable(i)) {
      s += '<p class="sq-text">' + t('desc.' + sqKey(i), { salary: money(E.SALARY), fee: money(E.JAIL_FEE), amt: money(sq.amt || 0) }) + '</p></div>';
      return s;
    }
    const o = game.own[i];
    s += '<div class="sq-meta"><span>' + t('detail.price', { v: money(sq.price) }) + '</span><span>' + t('detail.mort', { v: money(E.mortValue(i)) }) + '</span></div>';
    s += '<div class="rents">' + rentRows(i) + '</div>';
    s += '<p class="sq-own">' + (o < 0 ? t('detail.free') : t('detail.owner', { name: who(o) })) + (game.mort[i] ? ' · <b class="mort-tag">' + t('cell.mort') + '</b>' : '') + '</p>';
    if (buyPrompt) {
      s += '<p class="sq-ask">' + t(game.players[0].cash >= sq.price ? 'detail.buyAsk' : 'detail.buyPoor', { v: money(sq.price) }) + '</p>';
    } else if (canAct()) {
      const acts = [];
      if (E.canBuild(game, 0, i)) acts.push(['build', t(game.houses[i] === 4 ? 'act.hotel' : 'act.build', { v: money(GROUPS[sq.g].house) })]);
      if (E.canSell(game, 0, i)) acts.push(['sell', t('act.sell', { v: money(GROUPS[sq.g].house / 2) })]);
      if (E.canMortgage(game, 0, i)) acts.push(['mortgage', t('act.mortgage', { v: money(E.mortValue(i)) })]);
      if (E.canUnmortgage(game, 0, i)) acts.push(['unmortgage', t('act.unmortgage', { v: money(E.unmortCost(i)) })]);
      if (acts.length) s += '<div class="sq-acts">' + acts.map(([a, l]) => '<button class="btn btn-ghost" type="button" data-act="' + a + '" data-pos="' + i + '">' + l + '</button>').join('') + '</div>';
      if (o > 0 && E.tradeable(game, i)) {
        if (offerPos !== i) {
          offerPos = i;
          offerAmt = Math.min(game.players[0].cash, Math.ceil((sq.price * 1.5) / 10) * 10);
        }
        const can = E.canOffer(game, 0, i, offerAmt);
        s += '<div class="offer"><span class="offer-label">' + t('offer.ask') + '</span>' +
          '<button class="btn btn-ghost step" type="button" data-act="less" aria-label="' + t('offer.less') + '">−</button>' +
          '<b class="offer-amt">' + money(offerAmt) + '</b>' +
          '<button class="btn btn-ghost step" type="button" data-act="more" aria-label="' + t('offer.more') + '">+</button>' +
          '<button class="btn btn-primary" type="button" data-act="offer"' + (can ? '' : ' disabled') + '>' + t('offer.send') + '</button></div>';
        if (game.offers.indexOf(i) >= 0) s += '<p class="sq-note">' + t('offer.done') + '</p>';
        else if (game.offers.length >= E.MAX_OFFERS) s += '<p class="sq-note">' + t('offer.limit') + '</p>';
      } else if (o > 0 && !E.tradeable(game, i)) s += '<p class="sq-note">' + t('offer.houses') + '</p>';
    }
    return s + '</div>';
  }
  function cardHtml(f) {
    return '<div class="draw-card ' + (f.d === 'c' ? 'chance' : 'fortune') + '"><span class="ic">' + iconOf(f.d === 'c' ? 2 : 12) + '</span>' +
      '<span class="dc-deck">' + t(f.d === 'c' ? 'sq.chance' : 'sq.fortune') + ' · ' + pname(f.p) + '</span>' +
      '<span class="dc-text">' + t('card.' + f.d + f.id) + '</span></div>';
  }
  function statusHtml() {
    if (game.over) {
      const rank = E.ranking(game);
      return '<div class="status"><span class="st-big">' + t(rank[0] === 0 ? 'st.youWon' : 'st.over') + '</span><span class="st-hint">' + t('st.place', { n: rank.indexOf(0) + 1 }) + '</span></div>';
    }
    const p = game.turn;
    if (p !== 0) return '<div class="status"><span class="st-big">' + t('st.botTurn', { name: who(p) }) + '</span><span class="st-hint">' + t(thinking ? 'st.thinking' : 'st.moving') + '</span></div>';
    const hint = {
      roll: game.again ? 'st.again' : 'st.roll',
      jail: 'st.jail',
      end: 'st.end',
      debt: 'st.debt',
      buy: 'st.roll',
    }[game.phase];
    const extra = game.phase === 'debt' ? t('st.debtAmt', { v: money(game.debt.amt), to: game.debt.to < 0 ? t('pl.bank') : pname(game.debt.to) }) : '';
    return '<div class="status"><span class="st-big">' + t('st.yourTurn') + '</span><span class="st-hint">' + t(hint) + (extra ? ' ' + extra : '') + '</span></div>';
  }
  function renderInfo() {
    let html;
    if (mode && canAct()) {
      const n = cells.filter((_, i) => modeOk(i)).length;
      html = '<div class="status mode"><span class="st-big">' + t(mode === 'build' ? 'mode.build' : 'mode.mort') + '</span><span class="st-hint">' +
        t(n ? (mode === 'build' ? 'mode.buildHint' : 'mode.mortHint') : 'mode.none') + '</span></div>';
    } else if (sel >= 0) html = detailHtml(sel, false);
    else if (flash) html = cardHtml(flash);
    else if (humanTurn() && game.phase === 'buy' && !busy) html = detailHtml(game.players[0].pos, true);
    else html = statusHtml();
    $('info').innerHTML = html;
  }

  /* ---------------- Nút điều khiển ---------------- */
  /** Nút chính / phụ theo pha: [{ label, key, run, disabled }] */
  function controls() {
    const out = { main: null, sec1: null, sec2: null };
    if (!game) return out;
    if (game.over) {
      out.main = { label: t('kit.newGame'), run: () => newGame() };
      return out;
    }
    if (!humanTurn()) {
      out.main = { label: t('btn.wait'), disabled: true };
      return out;
    }
    const pl = game.players[0];
    switch (game.phase) {
      case 'roll':
        out.main = { label: t(game.again ? 'btn.rollAgain' : 'btn.roll'), key: 'Space', run: () => humanAct({ type: 'roll' }) };
        break;
      case 'jail':
        out.main = { label: t('btn.rollJail'), key: 'Space', run: () => humanAct({ type: 'roll' }) };
        out.sec1 = { label: t('btn.payJail', { v: money(E.JAIL_FEE) }), key: 'J', disabled: pl.cash < E.JAIL_FEE, run: () => humanAct({ type: 'payJail' }) };
        if (pl.cards.length) out.sec2 = { label: t('btn.useCard'), key: 'C', run: () => humanAct({ type: 'useCard' }) };
        break;
      case 'buy': {
        const price = BOARD[pl.pos].price;
        out.main = { label: t('btn.buy', { v: money(price) }), key: 'B', disabled: pl.cash < price, run: () => humanAct({ type: 'buy' }) };
        out.sec1 = { label: t('btn.skip'), key: 'S', run: () => humanAct({ type: 'skip' }) };
        break;
      }
      case 'end':
        out.main = { label: t('btn.end'), key: 'E', run: () => humanAct({ type: 'end' }) };
        break;
      case 'debt': {
        const amt = game.debt.amt;
        if (pl.cash >= amt) out.main = { label: t('btn.pay', { v: money(amt) }), key: 'Space', run: () => humanAct({ type: 'pay' }) };
        else if (E.maxRaise(game, 0) < amt) out.main = { label: t('btn.bankrupt'), run: () => askBankrupt() };
        else {
          out.main = { label: t('btn.raise'), key: 'A', run: () => humanAct(E.autoRaise(game)) };
          out.sec1 = { label: t('btn.pay', { v: money(amt) }), disabled: true };
        }
        break;
      }
    }
    return out;
  }
  function setBtn(el, c) {
    el.hidden = !c;
    if (!c) return;
    el.innerHTML = '<span>' + c.label + '</span>' + (c.key ? '<kbd class="k">' + c.key + '</kbd>' : '');
    el.disabled = !!c.disabled || (c.run && game && !game.over && !canAct());
  }
  function renderActions() {
    const c = controls();
    setBtn($('btn-main'), c.main);
    setBtn($('btn-sec1'), c.sec1);
    setBtn($('btn-sec2'), c.sec2);
    const manage = canAct() && ['roll', 'end', 'jail', 'buy', 'debt'].indexOf(game.phase) >= 0;
    const anyBuild = manage && E.BUYABLE.some((i) => E.canBuild(game, 0, i));
    const anyMort = manage && E.BUYABLE.some((i) => E.canMortgage(game, 0, i) || E.canUnmortgage(game, 0, i));
    $('btn-build').disabled = !anyBuild && mode !== 'build';
    $('btn-mort').disabled = !anyMort && mode !== 'mort';
    $('btn-build').classList.toggle('on', mode === 'build');
    $('btn-mort').classList.toggle('on', mode === 'mort');
    $('btn-build').setAttribute('aria-pressed', String(mode === 'build'));
    $('btn-mort').setAttribute('aria-pressed', String(mode === 'mort'));
  }

  /* ---------------- Nhật ký ---------------- */
  function evText(e) {
    const sq = (i) => '<span class="sqn">' + sqName(i) + '</span>';
    switch (e.t) {
      case 'roll': return t(e.dice[0] === e.dice[1] ? 'log.rollDouble' : 'log.roll', { who: who(e.p), a: e.dice[0], b: e.dice[1] });
      case 'pay':
        if (e.why === 'salary') return t('log.salary', { who: who(e.to), v: money(e.amt) });
        if (e.why === 'rent') return t('log.rent', { who: who(e.from), to: who(e.to), v: money(e.amt), sq: sq(e.pos) });
        if (e.why === 'tax') return t('log.tax', { who: who(e.from), v: money(e.amt) });
        if (e.why === 'card' || e.why === 'repair') return t(e.from < 0 ? 'log.gain' : 'log.payBank', { who: who(e.from < 0 ? e.to : e.from), v: money(e.amt) });
        if (e.why === 'jail') return t('log.jailFee', { who: who(e.from), v: money(e.amt) });
        if (e.why === 'trade') return '';
        return '';
      case 'buy': return t('log.buy', { who: who(e.p), sq: sq(e.pos) });
      case 'skip': return t('log.skip', { who: who(e.p), sq: sq(e.pos) });
      case 'card': return t('log.card', { who: who(e.p), text: t('card.' + e.d + e.id) });
      case 'jail': return t('log.jail.' + e.why, { who: who(e.p) });
      case 'free': return t('log.free.' + e.how, { who: who(e.p) });
      case 'stay': return t('log.stay', { who: who(e.p), n: e.tries });
      case 'build': return t(e.h === 5 ? 'log.hotel' : 'log.build', { who: who(e.p), sq: sq(e.pos) });
      case 'sell': return t('log.sell', { who: who(e.p), sq: sq(e.pos) });
      case 'mortgage': return t('log.mortgage', { who: who(e.p), sq: sq(e.pos) });
      case 'unmortgage': return t('log.unmortgage', { who: who(e.p), sq: sq(e.pos) });
      case 'offer': return t(e.ok ? 'log.offerYes' : 'log.offerNo', { who: who(e.p), to: who(e.to), sq: sq(e.pos), v: money(e.amt) });
      case 'debt': return t('log.debt', { who: who(e.p), v: money(e.amt) });
      case 'bankrupt': return t('log.bankrupt', { who: who(e.p), to: who(e.to) });
      case 'over': return t('log.over');
      default: return '';
    }
  }
  const LOGGED = { roll: 1, pay: 1, buy: 1, skip: 1, card: 1, jail: 1, free: 1, stay: 1, build: 1, sell: 1, mortgage: 1, unmortgage: 1, offer: 1, debt: 1, bankrupt: 1, over: 1 };
  function addLog(e) {
    if (!LOGGED[e.t]) return;
    if (e.t === 'pay' && (e.why === 'trade' || e.why === 'buy' || e.why === 'build' || e.why === 'sell' || e.why === 'mortgage' || e.why === 'unmortgage' || e.why === 'liquidate' || e.why === 'bankrupt')) return;
    logList.push(e);
    if (logList.length > LOG_KEEP) logList.shift();
    const txt = evText(e);
    if (txt && (e.t !== 'roll' || e.p === 0)) $('live').textContent = txt.replace(/<[^>]+>/g, '');
  }
  function renderLog() {
    const items = logList.slice(-12).reverse().map((e) => evText(e)).filter(Boolean);
    $('log').innerHTML = items.map((s) => '<li>' + s + '</li>').join('');
  }

  function render() {
    if (!game) return;
    $('round').textContent = t('hud.round', { n: game.round, max: game.maxRounds });
    renderCells();
    renderPlayers();
    renderInfo();
    renderActions();
    renderLog();
    placeTokens(false);
  }

  /* ---------------- Phát lại sự kiện ---------------- */
  function syncShown() {
    shown = { pos: game.players.map((p) => p.pos), cash: game.players.map((p) => p.cash) };
  }
  /** Phát lần lượt các sự kiện của một thao tác thành hoạt cảnh; done() khi xong. */
  function playEvents(evs, done) {
    const tk = token;
    let k = 0;
    const P = pace();
    const later = (ms) => setTimeout(() => tk === token && next(), ms);
    const next = () => {
      if (tk !== token) return;
      if (k >= evs.length) {
        done();
        return;
      }
      const e = evs[k++];
      addLog(e);
      renderLog();
      switch (e.t) {
        case 'roll':
          if (e.p !== 0) flash = null;
          rollAnim(e.dice, next);
          break;
        case 'move':
          animateMove(e.p, shown.pos[e.p], e.to, e.n, next);
          break;
        case 'jail':
          kit.sfx('error');
          shown.pos[e.p] = E.JAIL;
          placeTokens(!calm(), e.p);
          later(calm() ? 150 : P.step * 3);
          break;
        case 'pay': {
          if (e.from >= 0) shown.cash[e.from] -= e.amt;
          if (e.to >= 0) shown.cash[e.to] += e.amt;
          if (e.from >= 0) { setCash(e.from); floatMoney(e.from, -e.amt); }
          if (e.to >= 0) { setCash(e.to); floatMoney(e.to, e.amt); }
          if (e.why === 'salary' || e.why === 'rent' || e.why === 'card' || e.why === 'trade') kit.sfx('coin', { volume: 0.6 });
          later(e.why === 'rent' || e.why === 'tax' || e.why === 'salary' ? P.money * 2 : P.money);
          break;
        }
        case 'card':
          flash = { d: e.d, id: e.id, p: e.p };
          sel = -1;
          renderInfo();
          kit.sfx('flip');
          later(P.card);
          break;
        case 'buy':
        case 'build':
        case 'sell':
        case 'mortgage':
        case 'unmortgage':
        case 'offer':
          kit.sfx(e.t === 'build' ? 'place' : e.t === 'offer' ? (e.ok ? 'coin' : 'tap') : 'pop');
          renderCells();
          later(e.p === 0 ? 60 : P.money);
          break;
        case 'debt':
          kit.sfx('error');
          later(P.money);
          break;
        case 'bankrupt':
          kit.sfx('lose', { volume: 0.6 });
          kit.toast(t('toast.bankrupt', { name: pname(e.p) }), 2200);
          later(P.card);
          break;
        case 'turn':
          flash = null;
          later(0);
          break;
        default:
          later(0);
      }
    };
    next();
  }

  /** Thực hiện thao tác `a` của người đang tới lượt: lưu ngay, rồi phát hoạt cảnh. */
  function perform(a, cb) {
    const nx = a ? E.act(game, a) : null;
    if (!nx) {
      kit.sfx('error', { volume: 0.4 });
      if (cb) cb(false);
      return;
    }
    if (a.type === 'roll' && game.turn === 0) cur.acted = true;
    game = nx;
    persist();
    busy = true;
    const tk = token;
    renderActions();
    playEvents(nx.ev, () => {
      if (tk !== token) return;
      busy = false;
      syncShown();
      render();
      if (game.over) finish();
      if (cb) cb(true);
    });
  }

  /* ---------------- Người chơi ---------------- */
  function humanAct(a) {
    if (!canAct() || !a) return;
    if (a.type === 'roll' || a.type === 'end') {
      sel = -1;
      mode = null;
      flash = null;
    }
    if (a.type === 'buy' || a.type === 'skip') sel = -1;
    perform(a, (okDone) => {
      if (!okDone) return;
      if (mode && !cells.some((_, i) => modeOk(i))) mode = null;
      if (game.turn !== 0 && !game.over) schedule();
      render();
    });
  }
  function toggleMode(m) {
    if (!canAct()) return;
    mode = mode === m ? null : m;
    sel = -1;
    if (mode) kit.sfx('tap', { volume: 0.4 });
    render();
  }
  function onCell(i) {
    if (!game) return;
    if (mode && canAct()) {
      if (mode === 'build' && E.canBuild(game, 0, i)) return humanAct({ type: 'build', pos: i });
      if (mode === 'mort' && E.canMortgage(game, 0, i)) return humanAct({ type: 'mortgage', pos: i });
      if (mode === 'mort' && E.canUnmortgage(game, 0, i)) return humanAct({ type: 'unmortgage', pos: i });
      kit.sfx('error', { volume: 0.3 });
      kit.toast(t(mode === 'build' ? 'toast.cantBuild' : 'toast.cantMort'));
      return;
    }
    sel = sel === i ? -1 : i;
    if (sel >= 0) kit.sfx('tap', { volume: 0.3 });
    renderCells();
    renderInfo();
  }
  function askBankrupt() {
    if (!canAct() || game.phase !== 'debt') return;
    $('bk-text').textContent = t('bk.text', { v: money(game.debt.amt), max: money(E.maxRaise(game, 0)) });
    kit.modal.open('modal-bankrupt');
  }
  /** Bạn đề nghị mua đất của máy: máy "nghĩ" một chút rồi trả lời. */
  function sendOffer() {
    if (!canAct() || offerPos < 0 || !E.canOffer(game, 0, offerPos, offerAmt)) return;
    const pos = offerPos;
    const amt = offerAmt;
    const owner = game.own[pos];
    const yes = E.aiAccept(game, pos, amt, cur.level);
    asking = true;
    render();
    kit.toast(t('toast.asking', { name: pname(owner) }), 900);
    const tk = token;
    setTimeout(() => {
      if (tk !== token) return;
      asking = false;
      kit.toast(t(yes ? 'toast.offerYes' : 'toast.offerNo', { name: pname(owner), sq: sqName(pos) }), 2000);
      if (yes) sel = -1;
      humanAct({ type: 'offer', pos, amt, ok: yes });
    }, Math.max(500, pace().think));
  }

  /* ---------------- Máy ---------------- */
  function schedule() {
    clearTimeout(aiTimer);
    if (!game || game.over || game.turn === 0) return;
    const tk = token;
    thinking = true;
    renderPlayers();
    renderInfo();
    aiTimer = setTimeout(() => aiStep(tk), pace().think);
  }
  function aiStep(tk) {
    if (tk !== token || !game || game.over || game.turn === 0) return;
    if (busy || kit.modal.current()) {
      aiTimer = setTimeout(() => aiStep(tk), 300);
      return;
    }
    let a = E.aiAction(game, cur.level);
    if (!a) return;
    thinking = false;
    if (a.type === 'offer') {
      if (game.own[a.pos] === 0) {
        askHuman(a);
        return;
      }
      a = Object.assign({}, a, { ok: E.aiAccept(game, a.pos, a.amt, cur.level) });
    }
    perform(a, () => schedule());
  }
  /** Máy đề nghị mua đất của bạn. */
  function askHuman(a) {
    pendingOffer = a;
    const i = a.pos;
    $('offer-text').innerHTML = t('offer.text', { name: who(game.turn), sq: '<b>' + sqName(i) + '</b>', v: '<b>' + money(a.amt) + '</b>', price: money(BOARD[i].price) });
    kit.sfx('pop');
    render();
    kit.modal.open('modal-offer');
  }
  function answerOffer(yes) {
    if (!pendingOffer) return;
    const a = Object.assign({}, pendingOffer, { ok: yes });
    pendingOffer = null;
    kit.modal.close('modal-offer');
    perform(a, () => schedule());
  }

  /* ---------------- Lưu ---------------- */
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    const tot = totals();
    const live = inProgress();
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: tot.played,
      won: tot.won,
      note: tot.won ? t('summary.note', { n: tot.won }) : tot.played ? t('summary.played', { n: tot.played }) : t('summary.none'),
      stats: tot.played ? [{ value: kit.i18n.fmtNumber(tot.won), label: t('stats.won') }, { value: money(stats.best), label: t('stats.best') }] : [],
      resume: live ? { title: t('app.name'), detail: t('summary.resume', { n: game.round, max: game.maxRounds, v: money(game.players[0].cash), level: levelName(cur.level) }), pct: Math.max(0, Math.min(1, (game.round - 1) / game.maxRounds)) } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (game && !game.over && cur && !cur.ended) {
      kit.store.write(keys.save, { v: 1, level: cur.level, acted: cur.acted, game: E.toJSON(game), log: logList.slice(-LOG_KEEP) });
    } else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */
  function readLevel() {
    const lv = kit.settings.get().level;
    return LEVELS.indexOf(lv) >= 0 ? lv : 'medium';
  }
  function resetFlags() {
    token++;
    clearTimeout(aiTimer);
    busy = false;
    thinking = false;
    sel = -1;
    mode = null;
    flash = null;
    pendingOffer = null;
    asking = false;
    offerPos = -1;
    kit.modal.close('modal-offer');
  }
  function newGame() {
    resetFlags();
    kit.modal.close('modal-result');
    game = E.newGame({ seed: freshSeed(), endSeat: 0 });
    cur = { level: readLevel(), acted: false, ended: false };
    logList = [];
    syncShown();
    setDice(null);
    kit.store.remove(keys.save);
    kit.sdk.start(cur.level);
    kit.sfx('start');
    persist();
    layout();
    render();
  }

  function finish() {
    if (cur.ended) return;
    cur.ended = true;
    mode = null;
    sel = -1;
    clearTimeout(aiTimer);
    const rank = E.ranking(game);
    const place = rank.indexOf(0) + 1;
    const won = place === 1;
    const lv = stats.levels[cur.level];
    lv.played++;
    if (won) {
      lv.won++;
      stats.streak++;
      stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    } else stats.streak = 0;
    stats.best = Math.max(stats.best, E.netWorth(game, 0));
    saveStats();
    persist();
    // Về nhất = thắng; hạng 2–4 hoặc phá sản = thua (không có hòa: bằng tài sản xếp theo tiền mặt rồi theo ghế)
    kit.sdk.end({ mode: cur.level, won, assisted: false });
    kit.sfx(won ? 'win' : 'lose');
    if (won) kit.confetti();
    render();
    showResult(rank);
  }
  function showResult(rank) {
    const place = rank.indexOf(0) + 1;
    const bankrupt = game.players[0].out;
    $('result-title').textContent = t(place === 1 ? 'result.win' : bankrupt ? 'result.broke' : 'result.lose');
    $('result-text').textContent = t(game.round >= game.maxRounds && !bankrupt && E.alive(game).length > 1 ? 'result.byRounds' : 'result.bySurvival', { n: game.maxRounds, place });
    $('result-rank').innerHTML = rank.map((p) => '<li class="s' + p + (p === 0 ? ' me' : '') + '"><span class="tk">' + shapeSvg(p) + '</span><span class="rn">' + pname(p) + '</span><b>' +
      (game.players[p].out ? t('pl.out') : money(E.netWorth(game, p))) + '</b></li>').join('');
    const tk = token;
    setTimeout(() => tk === token && kit.modal.open('modal-result'), calm() ? 300 : 900);
  }

  /** Ván đang dở (đã gieo) thì hỏi trước, vì bỏ ván tính là thua. */
  function requestNew() {
    if (inProgress()) kit.modal.open('modal-confirm');
    else newGame();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inProgress()) {
      stats.levels[cur.level].played++;
      stats.streak = 0;
      saveStats();
      kit.sdk.end({ mode: cur.level, won: false, assisted: false });
    }
    newGame();
  }
  /** Đổi mức: chưa gieo lần nào (hoặc ván đã xong) thì chia lại ngay, đang dở thì để ván sau. */
  function onSetting(key) {
    if (key === 'speed') return;
    if (key !== 'level' || !game) return;
    if (game.over || !cur.acted) newGame();
    else kit.toast(t('toast.next'));
  }

  /* ---------------- Sự kiện ---------------- */
  boardEl.addEventListener('click', (e) => {
    const c = e.target.closest && e.target.closest('.cell');
    if (c) onCell(Number(c.dataset.i));
  });
  $('info').addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'close') {
      sel = -1;
      renderCells();
      renderInfo();
    } else if (act === 'less' || act === 'more') {
      const step = Math.max(10, Math.round(BOARD[offerPos].price / 100) * 10);
      offerAmt = Math.max(10, Math.min(game.players[0].cash, offerAmt + (act === 'more' ? step : -step)));
      renderInfo();
      const again = $('info').querySelector('[data-act="' + act + '"]');
      if (again) again.focus();
    } else if (act === 'offer') sendOffer();
    else humanAct({ type: act, pos: Number(b.dataset.pos) });
  });
  const runCtl = (k) => {
    const c = controls()[k];
    if (c && c.run && !c.disabled) c.run();
  };
  $('btn-main').addEventListener('click', () => runCtl('main'));
  $('btn-sec1').addEventListener('click', () => runCtl('sec1'));
  $('btn-sec2').addEventListener('click', () => runCtl('sec2'));
  $('btn-build').addEventListener('click', () => toggleMode('build'));
  $('btn-mort').addEventListener('click', () => toggleMode('mort'));
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', newGame);
  $('btn-offer-yes').addEventListener('click', () => answerOffer(true));
  $('btn-offer-no').addEventListener('click', () => answerOffer(false));
  $('btn-bk-yes').addEventListener('click', () => {
    kit.modal.close('modal-bankrupt');
    humanAct({ type: 'bankrupt' });
  });
  $('btn-stats').addEventListener('click', renderStats);

  function renderStats() {
    const tot = totals();
    const f = kit.i18n.fmtNumber;
    $('stats-played').textContent = f(tot.played);
    $('stats-won').textContent = f(tot.won);
    $('stats-streak').textContent = f(stats.streak);
    $('stats-best').textContent = money(stats.best);
    $('stats-body').innerHTML = LEVELS.map((lv) => {
      const r = stats.levels[lv];
      const rate = r.played ? Math.round((r.won / r.played) * 100) + '%' : '–';
      return '<tr><th scope="row">' + levelName(lv) + '</th><td>' + f(r.played) + '</td><td>' + f(r.won) + '</td><td>' + rate + '</td></tr>';
    }).join('');
  }

  /** Phím mũi tên chọn ô: trái / phải đi lùi / tới một ô, lên / xuống nhảy 7 ô. */
  function moveSel(d) {
    const start = sel >= 0 ? sel : game.players[0].pos;
    sel = (start + d + N) % N;
    renderCells();
    renderInfo();
    $('live').textContent = cellLabel(sel);
  }
  document.addEventListener('keydown', (e) => {
    if (pendingOffer && kit.modal.current() === 'modal-offer') {
      if (e.key === 'y' || e.key === 'Y') answerOffer(true);
      else if (e.key === 'n' || e.key === 'N') answerOffer(false);
      return;
    }
    if (e.altKey || e.metaKey || e.ctrlKey || kit.modal.current() || !game) return;
    const k = e.key;
    const onButton = e.target && e.target.closest && e.target.closest('button, input, select, a');
    const lower = k.length === 1 ? k.toLowerCase() : k;
    if (k === 'ArrowRight') moveSel(1);
    else if (k === 'ArrowLeft') moveSel(-1);
    else if (k === 'ArrowUp') moveSel(7);
    else if (k === 'ArrowDown') moveSel(-7);
    else if ((k === 'Enter' || k === ' ') && !onButton) {
      if (mode && sel >= 0) onCell(sel);
      else runCtl('main');
    } else if (k === 'Escape' && (mode || sel >= 0)) {
      mode = null;
      sel = -1;
      render();
    } else if (lower === 'r' && canAct() && (game.phase === 'roll' || game.phase === 'jail')) humanAct({ type: 'roll' });
    else if (lower === 'b' && canAct() && game.phase === 'buy') humanAct({ type: 'buy' });
    else if (lower === 's' && canAct() && game.phase === 'buy') humanAct({ type: 'skip' });
    else if (lower === 'e' && canAct() && game.phase === 'end') humanAct({ type: 'end' });
    else if (lower === 'j' && canAct() && game.phase === 'jail') humanAct({ type: 'payJail' });
    else if (lower === 'c' && canAct() && game.phase === 'jail') humanAct({ type: 'useCard' });
    else if (lower === 'a' && canAct() && game.phase === 'debt') humanAct(E.autoRaise(game));
    else if (lower === 'h') toggleMode('build');
    else if (lower === 'm') toggleMode('mort');
    else if (lower === 'n') requestNew();
    else return;
    e.preventDefault();
  });

  kit.onLeave(persist);
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe($('stage'));

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  buildBoard();
  const saved = kit.store.read(keys.save, null);
  const okSave = saved && saved.v === 1 && LEVELS.indexOf(saved.level) >= 0 && typeof saved.acted === 'boolean';
  const restored = okSave ? E.fromJSON(saved.game) : null;
  if (restored && !restored.over && restored.endSeat === 0) {
    game = restored;
    cur = { level: saved.level, acted: saved.acted, ended: false };
    logList = Array.isArray(saved.log) ? saved.log.filter((e) => e && typeof e === 'object' && LOGGED[e.t]).slice(-LOG_KEEP) : [];
    syncShown();
    setDice(game.dice);
    kit.sdk.start(cur.level, true);
    kit.toast(t('toast.saved'));
    layout();
    render();
    writeSummary();
    schedule();
  } else {
    newGame();
  }
  // Lần đầu mở game: hiện Cách chơi
  if (!kit.settings.get().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
})();
