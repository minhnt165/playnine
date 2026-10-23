/* =====================================================================
 * Đô-mi-nô - Giao diện + luồng trận (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   Người (người chơi 0) đấu máy (người chơi 1), domino bốc tới 50 / 100 / 150 điểm.
 *   Cài đặt: mức máy (easy / hard = mode trên cổng) và điểm mục tiêu.
 *   Điều khiển: chạm quân đang sáng để đánh; khớp cả hai đầu thì chạm vòng ở đầu muốn đặt; kéo quân thả vào đầu dây cũng được.
 *   Bàn phím: 1–9 / ↑↓ chọn quân, ←→ chọn đầu, Enter đánh, D bốc, P bỏ lượt, N trận mới, Esc bỏ chọn.
 *   Dây vẽ bằng SVG theo đơn vị nửa quân; E.layoutLine xếp dây hình rắn, app chọn tỉ lệ lớn nhất còn vừa khung.
 *   Báo trận cho cổng (metric wins, một trận = một lần chơi):
 *   - Chia trận mới: kit.sdk.start(level); mở lại trận lưu dở: kit.sdk.start(level, true)
 *   - Hết trận: kit.sdk.end({ mode: level, won: người thắng trận, timeMs, assisted: false })
 *   - Bỏ trận khi người chơi đã đánh / bốc / bỏ lượt ít nhất một lần: won: false; chưa làm gì thì không gửi
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const LEVELS = ['easy', 'hard'];
  const kit = PNKit.init({
    gameId: 'domino',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { level: 'easy', target: '100' },
    onSetting: (key) => { if (key === 'level' || key === 'target') changeSetting(); },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SVGNS = 'http://www.w3.org/2000/svg';

  // Nhịp của máy (ms). Cố định, không rút ngắn khi giảm chuyển động: vừa để người chơi theo kịp,
  // vừa là sàn thời gian của luật chống gian lận (xem README: một trận nhanh nhất vẫn ≥ 8,2 s).
  const AI_THINK = 1000; // trước nước đầu của mỗi lượt (đánh, hoặc lần bốc đầu)
  const AI_JITTER = 400; // cộng thêm ngẫu nhiên khi đánh ngay
  const AI_DRAW = 550; // giữa các lần bốc
  const AI_AFTER_DRAW = 650; // bốc xong rồi đánh
  const AI_PASS = 900;

  const settingLevel = () => (LEVELS.indexOf(kit.settings.get().level) >= 0 ? kit.settings.get().level : 'easy');
  const settingTarget = () => {
    const n = Number(kit.settings.get().target);
    return E.TARGETS.indexOf(n) >= 0 ? n : 100;
  };
  const tileText = (id) => E.TILES[id][1] + '|' + E.TILES[id][0];

  /* ---------------- Thống kê ---------------- */
  const stats = (() => {
    const raw = kit.store.read(keys.stats, {}) || {};
    const n = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
    const s = { played: n(raw.played), won: n(raw.won), lost: n(raw.lost), hands: n(raw.hands), levels: {} };
    LEVELS.forEach((lv) => {
      const r = (raw.levels && raw.levels[lv]) || {};
      s.levels[lv] = { played: n(r.played), won: Math.min(n(r.won), n(r.played)) };
    });
    return s;
  })();
  function record(level, won) {
    stats.played++;
    stats[won ? 'won' : 'lost']++;
    stats.levels[level].played++;
    if (won) stats.levels[level].won++;
    kit.store.write(keys.stats, stats);
  }

  /* ---------------- Trạng thái ---------------- */
  // game: { s: trạng thái engine, level, acts: số lần người chơi đánh / bốc / bỏ lượt trong trận, recorded }
  let game = null;
  let sel = -1; // quân đang chọn trên tay
  let chosen = null; // đầu đang chọn bằng bàn phím: 'L' | 'R'
  let aiTimer = 0;
  let aiDrawn = 0; // số quân máy đã bốc trong lượt này
  let modalTimer = 0;
  let token = 0; // đổi khi chia trận / ván mới để bỏ hẹn giờ cũ
  let lastId = -1; // quân vừa đặt lên dây (viền nhấn)
  let fresh = new Set(); // quân vừa bốc vào tay (hiệu ứng rơi)
  let drag = null; // { id, x0, y0, started, ghost, fits }
  let suppressClick = false;

  const inPlay = () => !!game && game.acts > 0 && !game.recorded && game.s.phase !== 'match';
  const myTurn = () => !!game && game.s.phase === 'play' && game.s.turn === 0;

  /* ---------------- Vẽ quân (SVG) ---------------- */
  const POS = { c: [0.5, 0.5], tl: [0.27, 0.27], tr: [0.73, 0.27], bl: [0.27, 0.73], br: [0.73, 0.73], ml: [0.27, 0.5], mr: [0.73, 0.5], tm: [0.5, 0.27], bm: [0.5, 0.73] };
  const PIPS = { 0: [], 1: ['c'], 2: ['tl', 'br'], 3: ['tl', 'c', 'br'], 4: ['tl', 'tr', 'bl', 'br'], 5: ['tl', 'tr', 'c', 'bl', 'br'] };
  function pipsAt(v, ox, oy, horiz) {
    const list = v === 6 ? (horiz ? ['tl', 'tm', 'tr', 'bl', 'bm', 'br'] : ['tl', 'tr', 'ml', 'mr', 'bl', 'br']) : PIPS[v];
    return list.map((k) => '<circle cx="' + (ox + POS[k][0]) + '" cy="' + (oy + POS[k][1]) + '" r="0.092"/>').join('');
  }
  /** Nội dung một quân w×h đơn vị (2×1 nằm ngang hoặc 1×2 dựng dọc), nửa đầu chấm a, nửa sau chấm b */
  function tileInner(w, h, a, b) {
    const horiz = w > h;
    const i = 0.035;
    const face = 'x="' + i + '" width="' + (w - 2 * i) + '" height="' + (h - 2 * i) + '" rx="0.15"';
    return (
      '<rect class="t-shadow" y="' + (i + 0.06) + '" ' + face + '/>' +
      '<rect class="t-face" y="' + i + '" ' + face + '/>' +
      (horiz
        ? '<line class="t-div" x1="1" y1="0.17" x2="1" y2="' + (h - 0.17) + '"/>'
        : '<line class="t-div" x1="0.17" y1="1" x2="' + (w - 0.17) + '" y2="1"/>') +
      '<g class="t-pips">' + pipsAt(a, 0, 0, horiz) + pipsAt(b, horiz ? 1 : 0, horiz ? 0 : 1, horiz) + '</g>'
    );
  }
  /** Quân dựng dọc dạng <svg> độc lập (trên tay, hộp thoại, bóng kéo) */
  function tileSvg(id, cls) {
    const [a, b] = E.TILES[id];
    return '<svg class="' + (cls || 'tile-svg') + '" viewBox="-0.02 -0.02 1.04 2.1" aria-hidden="true">' + tileInner(1, 2, a, b) + '</svg>';
  }

  /* ---------------- Vẽ ---------------- */
  function renderScores() {
    const s = game.s;
    [0, 1].forEach((p) => {
      $('score-' + p).textContent = s.scores[p];
      $('bar-' + p).style.width = Math.min(100, (s.scores[p] / s.target) * 100) + '%';
      const el = $('player-' + p);
      el.classList.toggle('turn', s.phase === 'play' && s.turn === p);
      el.classList.toggle('winner', s.phase === 'match' && s.winner === p);
    });
    $('player-1').classList.toggle('thinking', !!aiTimer);
    $('target').textContent = s.target;
    $('cpu-count').textContent = s.hands[1].length;
    $('cpu-hand').setAttribute('aria-label', t('player.cpu') + ': ' + s.hands[1].length);
    $('level-badge').textContent = t('level.' + game.level);
    $('hand-no').textContent = t('hand.no', { n: s.handNo });
  }

  function renderStatus() {
    const s = game.s;
    let text;
    let tone = 'you';
    if (s.phase === 'match') {
      text = t(s.winner === 0 ? 'status.matchWon' : 'status.matchLost');
      tone = s.winner === 0 ? 'won' : 'lost';
    } else if (s.phase === 'hand') {
      const r = s.result;
      text = r.winner < 0 ? t('status.handTie') : t(r.winner === 0 ? 'status.handWon' : 'status.handLost', { n: r.points });
      tone = r.winner === 0 ? 'won' : r.winner === 1 ? 'lost' : 'draw';
    } else if (s.turn === 1) {
      tone = 'cpu';
      if (!s.line.length) text = t('status.cpuLead', { tile: tileText(s.lead) });
      else if (aiDrawn) text = t('status.cpuDraw', { n: aiDrawn });
      else text = t('status.cpu');
    } else if (!s.line.length) text = t('status.lead', { tile: tileText(s.lead) });
    else if (E.mustDraw(s)) text = t('status.draw');
    else if (E.mustPass(s)) text = t('status.pass');
    else if (sel >= 0 && endChoices(sel).length === 2) text = t('status.choose');
    else text = t('status.play');
    $('status-text').textContent = text;
    $('status').dataset.tone = tone;
    $('status').classList.toggle('thinking', !!aiTimer);
  }

  /** Các đầu người chơi phải chọn giữa khi đánh quân id: hai đầu cùng chấm thì như nhau, chỉ giữ đầu phải */
  function endChoices(id) {
    const s = game.s;
    const fits = E.fitsOf(s, id);
    if (!s.line.length) return [];
    const e = E.ends(s);
    if (fits.length === 2 && e.L === e.R) return ['R'];
    return fits;
  }

  let layout = null; // { L, u, ox, oy } của lần vẽ dây gần nhất
  const tileEls = new Map(); // id → { g, sig }

  /** Chọn tỉ lệ lớn nhất để cả dây (và vòng đánh dấu hai đầu) vừa khung, rồi vẽ */
  function renderBoard() {
    const wrap = $('board-wrap');
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    if (!W || !H) return;
    const s = game.s;
    const PAD = 1.35; // lề (đơn vị) cho vòng đánh dấu đầu dây
    const uMax = Math.max(14, Math.min(32, W / 12, H / 7));
    let u = uMax;
    let L = E.layoutLine(s.line, W / u - 2 * PAD);
    while (u > 4 && ((L.width + 2 * PAD) * u > W || (L.height + 2 * PAD) * u > H)) {
      u -= 0.5;
      L = E.layoutLine(s.line, W / u - 2 * PAD);
    }
    const vbW = W / u;
    const vbH = H / u;
    const ox = (vbW - L.width) / 2;
    const oy = (vbH - L.height) / 2;
    layout = { L, u, ox, oy };
    const svg = $('board');
    svg.setAttribute('viewBox', '0 0 ' + vbW.toFixed(3) + ' ' + vbH.toFixed(3));

    // Quân trên dây: giữ phần tử theo mã quân để dây "chảy" mượt khi xếp lại
    const ids = new Set(L.items.map((it) => it.id));
    tileEls.forEach((v, id) => {
      if (!ids.has(id)) {
        v.g.remove();
        tileEls.delete(id);
      }
    });
    const gTiles = $('tiles');
    L.items.forEach((it) => {
      const sig = it.w + 'x' + it.h + ':' + it.pips.join('');
      let rec = tileEls.get(it.id);
      if (!rec) {
        const g = document.createElementNS(SVGNS, 'g');
        g.setAttribute('class', 'dtile' + (it.id === lastId && !reduceMotion ? ' drop' : ''));
        rec = { g, sig: '' };
        tileEls.set(it.id, rec);
        gTiles.appendChild(g);
      }
      if (rec.sig !== sig) {
        rec.g.innerHTML = '<g class="dtile-in">' + tileInner(it.w, it.h, it.pips[0], it.pips[1]) + '</g>';
        rec.sig = sig;
      }
      rec.g.style.transform = 'translate(' + (ox + it.x) + 'px,' + (oy + it.y) + 'px)';
      rec.g.classList.toggle('last', it.id === lastId);
    });
    renderTargets();

    const hint = $('board-hint');
    if (!s.line.length && s.phase === 'play' && s.turn === 0) {
      hint.textContent = t('board.lead', { tile: tileText(s.lead) });
      hint.hidden = false;
    } else hint.hidden = true;
  }

  /** Tâm vòng đánh dấu đầu dây (đơn vị SVG): ngay ngoài nửa quân ở đầu, theo chiều dây sẽ nối tiếp */
  function endSlot(end) {
    const { L, ox, oy } = layout;
    if (!L.items.length) return null;
    if (end === 'L') {
      const it = L.items[0];
      return { x: ox + it.x - 0.62, y: oy + it.h1.y };
    }
    const it = L.items[L.items.length - 1];
    if (it.turn) return { x: ox + it.h2.x + L.dir * 1.12, y: oy + it.h2.y };
    return { x: ox + (L.dir > 0 ? it.x + it.w + 0.62 : it.x - 0.62), y: oy + it.h2.y };
  }

  /** Vòng đánh dấu đầu dây cho quân đang chọn / đang kéo */
  function renderTargets() {
    const g = $('targets');
    g.innerHTML = '';
    if (!game || !myTurn() || !layout) return;
    const id = drag && drag.started ? drag.id : sel;
    if (id < 0) return;
    const list = endChoices(id);
    const e = E.ends(game.s);
    const hitR = Math.max(1, 24 / layout.u);
    list.forEach((end) => {
      const p = endSlot(end);
      if (!p) return;
      const on = list.length === 1 || chosen === end || (drag && drag.over === end);
      const el = document.createElementNS(SVGNS, 'g');
      el.setAttribute('class', 'end-target' + (on ? ' on' : ''));
      el.setAttribute('data-end', end);
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', t('end.' + end, { n: e[end] }));
      el.setAttribute('transform', 'translate(' + p.x + ' ' + p.y + ')');
      el.innerHTML =
        '<circle class="et-hit" r="' + hitR + '"/>' +
        '<circle class="et-ring" r="0.5"/>' +
        '<path class="et-plus" d="M-0.22 0H0.22M0 -0.22V0.22"/>';
      g.appendChild(el);
    });
  }

  function renderTray() {
    const s = game.s;
    const mine = myTurn();
    $('bone-count').textContent = s.boneyard.length;
    $('boneyard').classList.toggle('empty', !s.boneyard.length);
    const draw = $('btn-draw');
    const pass = $('btn-pass');
    const next = $('btn-next');
    const canDraw = mine && E.mustDraw(s);
    const canPass = mine && E.mustPass(s);
    next.hidden = s.phase !== 'hand';
    pass.hidden = !canPass;
    draw.hidden = canPass || s.phase === 'hand';
    draw.disabled = !canDraw;
    draw.classList.toggle('btn-primary', canDraw);
    draw.classList.toggle('btn-ghost', !canDraw);
    draw.classList.toggle('nudge', canDraw);
    pass.classList.toggle('nudge', canPass);
  }

  /** Cỡ quân trên tay: lớn nhất có thể, xuống hàng khi nhiều quân */
  function sizeHand(n) {
    const hand = $('hand');
    const cw = hand.clientWidth;
    const cs = getComputedStyle(hand);
    const maxW = parseFloat(cs.getPropertyValue('--tw-max')) || 46;
    const minW = parseFloat(cs.getPropertyValue('--tw-min')) || 30;
    const gap = 6;
    let tw = maxW;
    for (let rows = 1; rows <= 4; rows++) {
      const per = Math.ceil(Math.max(1, n) / rows);
      tw = Math.min(maxW, Math.floor((cw - gap * (per - 1)) / per));
      if (tw >= minW) break;
    }
    hand.style.setProperty('--tw', Math.max(18, tw) + 'px');
  }

  function renderHand() {
    const s = game.s;
    const mine = myTurn();
    const hand = $('hand');
    sizeHand(s.hands[0].length);
    hand.innerHTML = s.hands[0]
      .map((id, i) => {
        const can = mine && E.fitsOf(s, id).length > 0;
        const cls = ['htile'];
        if (can) cls.push('can');
        else if (mine) cls.push('dim');
        if (id === sel) cls.push('sel');
        if (fresh.has(id) && !reduceMotion) cls.push('fresh');
        if (drag && drag.started && drag.id === id) cls.push('lifted');
        return (
          '<button type="button" class="' + cls.join(' ') + '" data-id="' + id + '" aria-pressed="' + (id === sel) + '" aria-label="' +
          t('hand.tile', { tile: tileText(id) }) + '">' + tileSvg(id) + (i < 9 ? '<span class="hk">' + (i + 1) + '</span>' : '') + '</button>'
        );
      })
      .join('');
    fresh = new Set();
  }

  function render() {
    renderScores();
    renderStatus();
    renderTray();
    renderHand();
    renderBoard();
  }

  /* ---------------- Lưu ---------------- */
  function fmtTime(ms) {
    const sec = Math.max(0, Math.round(ms / 1000));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }
  function writeSummary() {
    const shown = LEVELS.filter((lv) => stats.levels[lv].played > 0);
    const s = game && game.s;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: stats.played ? t('summary.note', { won: stats.won, played: stats.played }) : t('summary.none'),
      stats: shown.map((lv) => ({ value: stats.levels[lv].won + '/' + stats.levels[lv].played, label: t('summary.wins', { level: t('level.' + lv) }) })),
      resume: inPlay()
        ? {
            title: t('app.name') + ' · ' + t('level.' + game.level),
            detail: t('summary.resume', { you: s.scores[0], cpu: s.scores[1], target: s.target }),
            pct: Math.min(0.95, Math.max(s.scores[0], s.scores[1], 1) / s.target),
          }
        : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inPlay()) {
      kit.store.write(keys.save, { v: 1, game: E.toJSON(game.s), level: game.level, acts: game.acts, elapsed: Math.round(clock.elapsed()) });
    } else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng trận ---------------- */
  function resetUi() {
    clearTimeout(aiTimer);
    clearTimeout(modalTimer);
    aiTimer = 0;
    aiDrawn = 0;
    token++;
    sel = -1;
    chosen = null;
    lastId = -1;
    fresh = new Set();
    cancelDrag();
    tileEls.forEach((v) => v.g.remove());
    tileEls.clear();
  }

  function newMatch() {
    resetUi();
    // Chỉ đóng hộp thoại kết quả: đổi mức / mục tiêu trong Cài đặt cũng chia trận mới mà hộp Cài đặt vẫn mở
    ['modal-end', 'modal-hand', 'modal-confirm'].forEach((id) => kit.modal.close(id));
    game = { s: E.newMatch({ target: settingTarget() }), level: settingLevel(), acts: 0, recorded: false };
    clock.reset();
    clock.start();
    kit.store.remove(keys.save);
    kit.sdk.start(game.level);
    render();
    writeSummary();
    aiTurn();
  }

  function nextHand() {
    if (!game || game.s.phase !== 'hand') return;
    const n = E.nextHand(game.s);
    if (!n) return;
    resetUi();
    kit.modal.close('modal-hand');
    game.s = n;
    kit.sfx('start');
    render();
    persist();
    aiTurn();
  }

  /** Đi hẳn một nước (người hoặc máy) */
  function commit(m, byAi) {
    const prev = game.s;
    const next = E.apply(prev, m);
    if (!next) return false;
    const p = prev.turn;
    game.s = next;
    if (!byAi) game.acts++;
    sel = -1;
    chosen = null;
    if (m.type === 'play') {
      lastId = m.tile;
      kit.sfx('place');
      if (byAi && aiDrawn) kit.toast(t('status.cpuDraw', { n: aiDrawn }));
      if (byAi) aiDrawn = 0;
    } else if (m.type === 'draw') {
      if (p === 0) next.hands[0].forEach((id) => { if (prev.hands[0].indexOf(id) < 0) fresh.add(id); });
      kit.sfx('flip');
    } else {
      kit.sfx('pop');
      kit.toast(t(byAi ? 'toast.cpuPass' : 'toast.youPass'));
      if (byAi) aiDrawn = 0;
    }
    render();
    if (next.phase !== 'play') handOver();
    persist();
    if (next.phase === 'play') aiTurn();
    return true;
  }

  function fail(key, params) {
    kit.sfx('error', { volume: 0.6 });
    if (key) kit.toast(t(key, params));
  }

  /** Lượt máy: một bước mỗi lần hẹn giờ (bốc từng quân một, rồi đánh hoặc bỏ lượt) */
  function aiTurn() {
    if (!game || game.s.phase !== 'play' || game.s.turn !== 1 || aiTimer) return;
    const my = token;
    const type = E.legalMoves(game.s)[0].type;
    let wait;
    if (type === 'draw') wait = aiDrawn ? AI_DRAW : AI_THINK;
    else if (type === 'pass') wait = AI_PASS;
    else wait = aiDrawn ? AI_AFTER_DRAW : AI_THINK + Math.random() * AI_JITTER;
    aiTimer = setTimeout(() => {
      aiTimer = 0;
      if (my !== token || !game || game.s.turn !== 1 || game.s.phase !== 'play') return;
      const m = E.chooseMove(game.s, { level: game.level });
      if (m.type === 'draw') aiDrawn++;
      commit(m, true);
    }, wait);
    renderScores();
    renderStatus();
  }

  /** Hết một ván (hand) hoặc hết trận */
  function handOver() {
    const s = game.s;
    const r = s.result;
    if (r.winner === 0) {
      stats.hands++;
      kit.store.write(keys.stats, stats);
    }
    if (s.phase === 'match') return finish();
    kit.sfx(r.winner === 0 ? 'coin' : r.winner === 1 ? 'drop' : 'draw');
    fillHandModal();
    const my = token;
    modalTimer = setTimeout(() => { if (my === token) kit.modal.open('modal-hand'); }, reduceMotion ? 300 : 900);
  }

  /** Mô tả kết quả ván cuối: dùng cho hộp thoại ván và hộp thoại hết trận */
  function handDetail(r) {
    if (r.reason === 'domino') return t(r.winner === 0 ? 'hand.domino.won' : 'hand.domino.lost', { pips: r.points });
    const p = { mine: r.pips[0], theirs: r.pips[1] };
    return t(r.winner < 0 ? 'hand.blocked.tie' : r.winner === 0 ? 'hand.blocked.won' : 'hand.blocked.lost', p);
  }

  function fillHandModal() {
    const s = game.s;
    const r = s.result;
    $('hand-title').textContent = t(r.winner === 0 ? 'hand.wonTitle' : r.winner === 1 ? 'hand.lostTitle' : 'hand.tieTitle');
    $('hand-text').textContent = handDetail(r);
    [0, 1].forEach((p) => {
      $('reveal-' + p).innerHTML = s.hands[p].length ? s.hands[p].map((id) => tileSvg(id, 'mini')).join('') : '<span class="reveal-empty">' + t('hand.empty') + '</span>';
      $('pips-' + p).textContent = t('hand.pips', { n: r.pips[p] });
    });
    $('hand-score').textContent = t('hand.score', { you: s.scores[0], cpu: s.scores[1], target: s.target });
  }

  function finish() {
    if (game.recorded) return;
    game.recorded = true;
    clock.pause();
    const s = game.s;
    const won = s.winner === 0;
    record(game.level, won);
    kit.sdk.end({ mode: game.level, won, timeMs: Math.round(clock.elapsed()), assisted: false });
    if (won) {
      kit.sfx('win');
      kit.confetti();
    } else kit.sfx('lose');
    $('end-title').textContent = t(won ? 'end.won' : 'end.lost');
    $('end-text').textContent = t('end.text', { detail: handDetail(s.result) });
    $('end-score').textContent = t('hand.score', { you: s.scores[0], cpu: s.scores[1], target: s.target });
    $('end-meta').textContent = t('end.meta', { level: t('level.' + game.level), hands: t('end.hands', { n: s.handNo }), time: fmtTime(clock.elapsed()) });
    $('end-mark').dataset.result = won ? 'won' : 'lost';
    const my = token;
    modalTimer = setTimeout(() => { if (my === token) kit.modal.open('modal-end'); }, reduceMotion ? 300 : 1100);
  }

  /** Trận đang dở (người đã đi) thì hỏi trước, vì bỏ trận tính là thua. */
  function requestNew() {
    if (inPlay()) kit.modal.open('modal-confirm');
    else {
      kit.sfx('start');
      newMatch();
    }
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inPlay()) {
      game.recorded = true;
      clock.pause();
      record(game.level, false);
      kit.sdk.end({ mode: game.level, won: false, timeMs: Math.round(clock.elapsed()), assisted: false });
    }
    newMatch();
  }

  /** Đổi mức máy / mục tiêu: trận chưa đi (hoặc đã xong) thì chia lại ngay, đang dở thì áp dụng từ trận sau */
  function changeSetting() {
    renderLevelDesc();
    if (!game) return;
    if (game.level === settingLevel() && game.s.target === settingTarget()) return;
    if (inPlay()) kit.toast(t('toast.nextMatch'), 2600);
    else newMatch();
  }
  function renderLevelDesc() {
    $('level-desc').textContent = t('settings.levelDesc.' + settingLevel());
  }

  /* ---------------- Thao tác của người ---------------- */
  function canAct() {
    return !!game && !kit.modal.current() && myTurn();
  }

  function playAt(id, end) {
    if (!canAct()) return;
    if (!commit({ type: 'play', tile: id, end }, false)) fail('toast.noFit');
  }

  /** Chạm quân trên tay */
  function tapTile(id) {
    if (!game || kit.modal.current() || game.s.phase !== 'play') return;
    const s = game.s;
    if (s.turn !== 0) return fail('toast.wait');
    const fits = E.fitsOf(s, id);
    if (!fits.length) {
      if (!s.line.length) return fail('toast.mustLead', { tile: tileText(s.lead) });
      return fail(E.mustDraw(s) ? 'toast.mustDraw' : E.mustPass(s) ? 'toast.mustPass' : 'toast.noFit');
    }
    const ends = endChoices(id);
    if (ends.length < 2) return playAt(id, ends[0] || fits[0]);
    if (sel === id) {
      sel = -1;
      chosen = null;
    } else {
      sel = id;
      chosen = null;
    }
    kit.sfx('tap');
    render();
  }

  function doDraw() {
    if (!canAct()) return;
    if (!E.mustDraw(game.s)) return fail(E.canPlay(game.s) ? null : E.mustPass(game.s) ? 'toast.mustPass' : null);
    commit({ type: 'draw' }, false);
  }
  function doPass() {
    if (!canAct()) return;
    if (!E.mustPass(game.s)) return fail(null);
    commit({ type: 'pass' }, false);
  }

  /** Bàn phím: chọn quân theo thứ tự trên tay */
  function selectIndex(i) {
    const hand = game.s.hands[0];
    if (i < 0 || i >= hand.length) return;
    sel = hand[i];
    const ends = endChoices(sel);
    chosen = ends.length === 1 ? ends[0] : null;
    kit.sfx('tap');
    render();
  }
  function moveSel(d) {
    const hand = game.s.hands[0];
    if (!hand.length) return;
    let i = hand.indexOf(sel);
    if (i < 0) {
      // Chưa chọn: nhảy tới quân đánh được đầu tiên (hoặc cuối cùng nếu đi lùi)
      const can = hand.filter((id) => E.fitsOf(game.s, id).length);
      i = hand.indexOf(can.length ? can[d > 0 ? 0 : can.length - 1] : hand[0]);
    } else i = (i + d + hand.length) % hand.length;
    selectIndex(i);
  }
  function enter() {
    const s = game.s;
    if (s.phase === 'hand') return nextHand();
    if (!myTurn()) return fail('toast.wait');
    if (sel < 0) {
      if (E.mustDraw(s)) return doDraw();
      if (E.mustPass(s)) return doPass();
      return moveSel(1);
    }
    const fits = E.fitsOf(s, sel);
    if (!fits.length) return tapTile(sel);
    const ends = endChoices(sel);
    if (ends.length < 2) return playAt(sel, ends[0] || fits[0]);
    if (chosen) return playAt(sel, chosen);
    kit.toast(t('status.choose'));
  }

  /* ---------------- Kéo thả ---------------- */
  function cancelDrag() {
    if (drag && drag.ghost) drag.ghost.remove();
    drag = null;
  }
  function onPointerDown(e) {
    suppressClick = false;
    const b = e.target.closest && e.target.closest('.htile');
    if (!b || !game || e.button > 0) return;
    drag = { id: Number(b.dataset.id), x0: e.clientX, y0: e.clientY, started: false, ghost: null, over: null, w: b.offsetWidth, pointerId: e.pointerId };
  }
  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
      if (!canAct() || !E.fitsOf(game.s, drag.id).length) {
        cancelDrag();
        return;
      }
      drag.started = true;
      const g = document.createElement('div');
      g.className = 'drag-ghost';
      g.style.width = drag.w + 'px';
      g.style.height = drag.w * 2 + 'px';
      g.innerHTML = tileSvg(drag.id);
      document.body.appendChild(g);
      drag.ghost = g;
      sel = -1;
      chosen = null;
      renderHand();
      renderTargets();
    }
    e.preventDefault();
    drag.ghost.style.transform = 'translate(' + (e.clientX - drag.w / 2) + 'px,' + (e.clientY - drag.w) + 'px) rotate(-6deg)';
    const over = dropEnd(e.clientX, e.clientY);
    if (over !== drag.over) {
      drag.over = over;
      renderTargets();
    }
  }
  /** Đầu dây sẽ nhận quân nếu thả ở (x, y): đầu gần nhất trong các đầu khớp; thả ngoài bàn thì null */
  function dropEnd(x, y) {
    const ends = endChoices(drag.id);
    const r = $('board-wrap').getBoundingClientRect();
    const inBoard = x >= r.left - 16 && x <= r.right + 16 && y >= r.top - 16 && y <= r.bottom + 24;
    if (!game.s.line.length) return inBoard ? 'L' : null;
    let best = null;
    let bestD = Infinity;
    const ctm = $('board').getScreenCTM();
    ends.forEach((end) => {
      const p = endSlot(end);
      if (!p || !ctm) return;
      const sx = ctm.a * p.x + ctm.c * p.y + ctm.e;
      const sy = ctm.b * p.x + ctm.d * p.y + ctm.f;
      const d = Math.hypot(sx - x, sy - y);
      if (d < bestD) {
        bestD = d;
        best = end;
      }
    });
    return inBoard || bestD < 72 ? best : null;
  }
  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    if (!d.started) {
      drag = null;
      return;
    }
    const end = dropEnd(e.clientX, e.clientY);
    suppressClick = true;
    cancelDrag();
    if (end) playAt(d.id, end);
    else render();
  }

  /* ---------------- Sự kiện ---------------- */
  const handEl = $('hand');
  handEl.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', () => {
    if (drag && drag.started) render();
    cancelDrag();
  });
  handEl.addEventListener('click', (e) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const b = e.target.closest('.htile');
    if (b) tapTile(Number(b.dataset.id));
  });
  $('targets').addEventListener('click', (e) => {
    const g = e.target.closest('.end-target');
    if (g && sel >= 0) playAt(sel, g.getAttribute('data-end'));
  });
  $('btn-draw').addEventListener('click', doDraw);
  $('btn-pass').addEventListener('click', doPass);
  $('btn-next').addEventListener('click', nextHand);
  $('btn-next-hand').addEventListener('click', nextHand);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', () => {
    kit.sfx('start');
    newMatch();
  });
  $('btn-stats').addEventListener('click', () => {
    ['played', 'won', 'lost', 'hands'].forEach((k) => { $('stats-' + k).textContent = kit.i18n.fmtNumber(stats[k]); });
    LEVELS.forEach((lv) => { $('stats-' + lv).textContent = t('stats.level', { won: stats.levels[lv].won, played: stats.levels[lv].played }); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key;
    const onButton = e.target && e.target.closest && e.target.closest('button');
    if (/^[1-9]$/.test(k)) {
      if (!myTurn()) return fail('toast.wait');
      selectIndex(Number(k) - 1);
    } else if (k === 'ArrowUp' || k === 'ArrowDown') {
      if (!myTurn()) return;
      moveSel(k === 'ArrowDown' ? 1 : -1);
    } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      if (!myTurn()) return;
      if (sel >= 0 && endChoices(sel).length === 2) {
        chosen = k === 'ArrowLeft' ? 'L' : 'R';
        kit.sfx('tap');
        renderTargets();
      } else moveSel(k === 'ArrowRight' ? 1 : -1);
    } else if (k === 'Enter' || k === ' ') {
      // Enter / Space trên nút đang focus là cú bấm nút của trình duyệt
      if (onButton) return;
      enter();
    } else if (k === 'd' || k === 'D') doDraw();
    else if (k === 'p' || k === 'P') doPass();
    else if (k === 'n' || k === 'N') requestNew();
    else if (k === 'Escape') {
      if (sel < 0) return;
      sel = -1;
      chosen = null;
      render();
    } else return;
    e.preventDefault();
  });
  kit.onLeave(persist);
  // Khung đổi cỡ (xoay máy, cửa sổ) thì xếp lại tay và dây
  let resizeRaf = 0;
  const relayout = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      if (!game) return;
      renderHand();
      renderBoard();
    });
  };
  window.addEventListener('resize', relayout);
  if (window.ResizeObserver) new ResizeObserver(relayout).observe($('board-wrap'));

  /* ---------------- Khởi động: mở lại trận dở nếu có ---------------- */
  renderLevelDesc();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && saved.v === 1 && E.fromJSON(saved.game);
  if (restored && restored.phase !== 'match' && LEVELS.indexOf(saved.level) >= 0 && Number.isInteger(saved.acts) && saved.acts > 0) {
    game = { s: restored, level: saved.level, acts: saved.acts, recorded: false };
    clock.set(saved.elapsed);
    clock.start();
    kit.sdk.start(game.level, true);
    kit.toast(t('toast.saved'));
    render();
    writeSummary();
    if (restored.phase === 'hand') {
      fillHandModal();
      kit.modal.open('modal-hand');
    } else aiTurn();
  } else {
    newMatch();
  }
})();
