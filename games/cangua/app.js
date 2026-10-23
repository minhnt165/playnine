/* =====================================================================
 * Cá Ngựa - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   Người chơi là ghế 0 (xanh dương, chuồng dưới trái), ba máy đi theo chiều kim đồng hồ.
 *   Chạm xúc xắc (Space) để tung, chạm quân đang sáng (phím 1–4) để đi; chỉ có một nước thì tự đi (cài đặt).
 *   Máy tự tung và đi với nhịp đọc kịp (cài đặt tốc độ Vừa / Nhanh); chuỗi hẹn giờ dừng khi đang mở hộp thoại
 *   hoặc trang bị ẩn, và bị hủy khi chia ván mới (biến `gen`).
 *   Báo ván cho cổng (metric wins, một mode classic):
 *   - Chia ván mới: kit.sdk.start('classic'); mở lại ván lưu dở: kit.sdk.start('classic', true)
 *   - Có người về đích đủ 4 quân: kit.sdk.end({ mode, won: bạn về trước, timeMs, assisted: false })
 *   - Bỏ ván đã tung ít nhất một lần: won: false; ván chưa tung lần nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const HUMAN = E.HUMAN;
  // Nhịp chơi (ms): think = máy nghĩ trước khi tung, roll = xúc xắc lăn, show = xem số trước khi máy đi quân,
  // hop = mỗi bước quân, enter = ra quân, pass = đọc thông báo không đi được / đá quân, auto = trước khi tự đi giúp
  const PACE = {
    normal: { think: 340, roll: 520, show: 340, hop: 140, enter: 250, pass: 850, auto: 450 },
    fast: { think: 100, roll: 260, show: 120, hop: 60, enter: 140, pass: 420, auto: 250 },
  };

  const kit = PNKit.init({
    gameId: 'cangua',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { speed: 'normal', autoMove: true },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let game = null;
  let gen = 0; // tăng mỗi khi chia ván mới: các chuỗi hẹn giờ của ván cũ tự dừng
  let busy = false; // đang tung / đang chạy quân / máy đang nghĩ
  let face = 6; // mặt xúc xắc đang hiện
  let faceSeat = HUMAN; // màu viền xúc xắc (người vừa / sắp tung)
  let note = null; // dòng trạng thái tạm (sự kiện vừa xảy ra); null thì tự suy ra từ ván
  let anim = null; // quân đang chạy: { seat, token, rel }
  let endTimer = 0;

  const pace = () => PACE[kit.settings.get().speed === 'fast' ? 'fast' : 'normal'];
  const seatName = (s) => t('seat.' + s);

  /* ---------------- Thống kê ---------------- */
  const stats = (() => {
    const raw = kit.store.read(keys.stats, {}) || {};
    const s = { played: 0, won: 0, caps: 0 };
    if (Number.isInteger(raw.played) && raw.played >= 0) s.played = raw.played;
    if (Number.isInteger(raw.won) && raw.won >= 0) s.won = Math.min(raw.won, s.played);
    if (Number.isInteger(raw.caps) && raw.caps >= 0) s.caps = raw.caps;
    return s;
  })();
  const winRate = () => (stats.played ? Math.round((stats.won / stats.played) * 100) + '%' : '–');

  /* ---------------- Hẹn giờ: dừng khi mở hộp thoại / trang ẩn, bỏ hẳn khi đã sang ván khác ---------------- */
  function sleep(ms) {
    const g0 = gen;
    return new Promise((resolve) => {
      const tick = () => {
        if (g0 !== gen) return; // ván đã đổi: chuỗi này dừng luôn
        if (document.hidden || kit.modal.current()) {
          setTimeout(tick, 250);
          return;
        }
        resolve();
      };
      setTimeout(tick, ms);
    });
  }

  /* ---------------- Dựng bàn (một lần) ---------------- */
  const svgPt = (p) => p[1] + ',' + p[0]; // (y, x) → "x,y"
  function buildBoard() {
    const rect = (y, x, h, w, cls, extra) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" class="' + cls + '"' + (extra || '') + '/>';
    /** Hình chữ nhật của ghế 0 xoay theo ghế s: lấy hai góc đối rồi chuẩn hóa. */
    const rrect = (y, x, h, w, s, cls, extra) => {
      const a = E.rot([y, x], s);
      const b = E.rot([y + h, x + w], s);
      return rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), cls, extra);
    };
    const star = (c, cls) => '<use href="#sym-star" x="' + (c[1] + 0.12) + '" y="' + (c[0] + 0.12) + '" width="0.76" height="0.76" class="b-star ' + cls + '"/>';
    let s = rect(0, 0, 15, 15, 'b-bg', ' rx="0.35"');
    for (let seat = 0; seat < 4; seat++) {
      // Chuồng: khung màu, lòng trắng, 4 chỗ đứng
      s += rrect(9, 0, 6, 6, seat, 'f' + seat);
      s += rrect(10, 1, 4, 4, seat, 'y-in', ' rx="0.5"');
      for (let k = 0; k < 4; k++) {
        const p = E.pointOf(seat, E.BASE, k);
        s += '<circle cx="' + p[1] + '" cy="' + p[0] + '" r="0.6" class="spot s' + seat + '"/>';
      }
      // Đường về đích cùng màu
      for (let rel = E.LAST_TRACK + 1; rel < E.HOME; rel++) {
        const c = E.cellOf(seat, rel);
        s += rect(c[0], c[1], 1, 1, 'b-cell f' + seat);
      }
      // Tam giác đích ở giữa
      s += '<polygon class="f' + seat + '" points="' + [[9, 6], [9, 9], [7.5, 7.5]].map((p) => svgPt(E.rot(p, seat))).join(' ') + '"/>';
    }
    // Đường đua: ô xuất phát tô màu ghế, ô sao (an toàn) có ngôi sao
    E.PATH.forEach((c, i) => {
      const seat = E.START.indexOf(i);
      s += rect(c[0], c[1], 1, 1, 'b-cell' + (seat >= 0 ? ' f' + seat : ''));
      if (seat >= 0) s += star(c, 'on-color');
      else if (E.STARS.indexOf(i) >= 0) s += star(c, '');
    });
    // Mũi tên ở ô rẽ vào đường về đích (ô 50 của mỗi ghế)
    for (let seat = 0; seat < 4; seat++) {
      const a = E.cellOf(seat, E.LAST_TRACK);
      const b = E.cellOf(seat, E.LAST_TRACK + 1);
      const dy = b[0] - a[0];
      const dx = b[1] - a[1];
      const cy = a[0] + 0.5;
      const cx = a[1] + 0.5;
      // chữ V nhỏ chỉ hướng vào đường về đích
      const tip = [cy + dy * 0.25, cx + dx * 0.25];
      const l = [cy - dy * 0.1 + dx * 0.25, cx - dx * 0.1 + dy * 0.25];
      const r = [cy - dy * 0.1 - dx * 0.25, cx - dx * 0.1 - dy * 0.25];
      s += '<polyline class="b-arrow" points="' + [l, tip, r].map(svgPt).join(' ') + '" style="stroke:var(--c' + seat + ')"/>';
    }
    s += '<rect x="6" y="6" width="3" height="3" class="b-center-line"/>';
    $('board-svg').innerHTML = s;
  }

  /** 16 nút quân (một lần); quân của bạn bấm được, quân máy chỉ để xem. */
  function buildTokens() {
    let s = '';
    for (let seat = 0; seat < 4; seat++) {
      for (let k = 0; k < 4; k++) {
        s += '<button type="button" class="token s' + seat + '" data-seat="' + seat + '" data-k="' + k + '" tabindex="-1">' +
          '<svg class="sym" aria-hidden="true"><use href="#sym-' + seat + '"/></svg>' +
          (seat === HUMAN ? '<span class="token-key" aria-hidden="true">' + (k + 1) + '</span>' : '') + '</button>';
      }
    }
    $('tokens').innerHTML = s;
  }

  function buildSeats() {
    for (let seat = 0; seat < 4; seat++) {
      $('seat-' + seat).innerHTML =
        '<span class="seat-glyph" aria-hidden="true"><svg class="sym"><use href="#sym-' + seat + '"/></svg></span>' +
        '<span class="seat-text"><span class="seat-name">' + seatName(seat) + '</span><span class="seat-dots" aria-hidden="true">' +
        '<i></i><i></i><i></i><i></i></span></span>';
    }
  }

  /* ---------------- Bố cục: cỡ bàn theo chỗ trống, màn ngang thì bàn bên trái ---------------- */
  function layout() {
    const stage = $('stage');
    const play = $('play');
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (!W || !H) return;
    const wide = W > H * 1.2;
    play.classList.toggle('wide', wide);
    let size;
    let side = 0;
    if (wide) {
      side = Math.min(380, Math.max(220, W - H - 18));
      size = Math.min(H, W - side - 18);
    } else {
      const other = $('seats-top').offsetHeight + $('seats-bot').offsetHeight + $('status').offsetHeight + 30;
      size = Math.min(W, H - other);
    }
    size = Math.max(150, Math.floor(size));
    play.style.setProperty('--board', size + 'px');
    play.style.setProperty('--side', side + 'px');
    $('board').style.setProperty('--cell', size / 15 + 'px');
  }

  /* ---------------- Vẽ ---------------- */
  const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function renderDie() {
    const die = $('die');
    die.dataset.seat = faceSeat;
    die.dataset.face = face;
    $('pips').innerHTML = PIPS[face].map((i) => '<i class="pip" style="grid-area:' + (Math.floor(i / 3) + 1) + '/' + ((i % 3) + 1) + '"></i>').join('');
  }

  const canHumanRoll = () => game && !busy && game.turn === HUMAN && game.phase === 'roll';
  const humanMoves = () => (game && !busy && game.turn === HUMAN && game.phase === 'move' ? E.legalMoves(game) : []);

  function tokenWhere(seat, rel) {
    if (rel === E.BASE) return t('token.base');
    if (rel === E.HOME) return t('token.home');
    if (rel > E.LAST_TRACK) return t('token.lane');
    return t('token.track', { n: rel });
  }

  function renderTokens() {
    const can = new Set(humanMoves().map((m) => m.token));
    // Gom quân theo chỗ đứng để xếp lệch nhau khi chồng
    const groups = {};
    for (let seat = 0; seat < 4; seat++) {
      for (let k = 0; k < 4; k++) {
        const moving = anim && anim.seat === seat && anim.token === k;
        const rel = moving ? anim.rel : game.pos[seat][k];
        const p = E.pointOf(seat, rel, k);
        const key = p[0].toFixed(2) + ',' + p[1].toFixed(2);
        (groups[key] = groups[key] || []).push({ seat, k, rel, p, moving });
      }
    }
    Object.keys(groups).forEach((key) => {
      const g = groups[key];
      const n = g.length;
      g.forEach((it, i) => {
        let dy = 0;
        let dx = 0;
        let scale = it.rel === E.HOME ? 0.62 : 1;
        if (n > 1) {
          const a = (2 * Math.PI * i) / n - Math.PI / 2;
          const r = n === 2 ? 0.2 : 0.24;
          dy = Math.sin(a) * r;
          dx = Math.cos(a) * r;
          scale = n > 4 ? 0.56 : 0.7;
        }
        const el = $('tokens').querySelector('.token[data-seat="' + it.seat + '"][data-k="' + it.k + '"]');
        el.style.top = ((it.p[0] + dy) / 15) * 100 + '%';
        el.style.left = ((it.p[1] + dx) / 15) * 100 + '%';
        el.style.setProperty('--sc-scale', scale);
        const isCan = it.seat === HUMAN && can.has(it.k);
        el.classList.toggle('can', isCan);
        el.classList.toggle('moving', it.moving);
        el.tabIndex = isCan ? 0 : -1;
        el.setAttribute('aria-disabled', String(!isCan));
        el.setAttribute('aria-label', t('token.label', { color: t('color.' + it.seat), k: it.k + 1, where: tokenWhere(it.seat, it.rel) }) + (isCan ? ' · ' + t('token.move') : ''));
      });
    });
  }

  function statusText() {
    if (note) return note;
    if (E.isOver(game)) return game.winner === HUMAN ? t('status.won') : t('status.lost', { name: seatName(game.winner) });
    if (game.turn !== HUMAN) return t('status.cpu', { name: seatName(game.turn) });
    if (game.phase === 'move') return t('status.pick', { n: game.dice });
    return game.sixes > 0 ? t('status.rollAgain') : t('status.roll');
  }

  function render() {
    if (!game) return;
    if (!busy && !E.isOver(game) && game.phase === 'roll') faceSeat = game.turn;
    // Đang đọc thông báo của lượt vừa rồi (engine đã chuyển lượt) thì vẫn sáng người vừa tung
    const active = busy ? faceSeat : game.turn;
    for (let seat = 0; seat < 4; seat++) {
      const el = $('seat-' + seat);
      const home = E.homeCount(game, seat);
      el.classList.toggle('active', !E.isOver(game) && active === seat);
      el.classList.toggle('winner', game.winner === seat);
      el.querySelectorAll('.seat-dots i').forEach((d, i) => d.classList.toggle('on', i < home));
      el.setAttribute('aria-label', seatName(seat) + ': ' + t('seat.home', { n: home }));
    }
    renderDie();
    const die = $('die');
    const ready = canHumanRoll();
    die.disabled = !ready;
    die.classList.toggle('ready', ready);
    die.setAttribute('aria-label', ready ? t('die.label') : t('die.value', { n: face }));
    $('status').textContent = statusText();
    renderTokens();
  }

  /* ---------------- Lưu ---------------- */
  const inPlay = () => game && game.rolls > 0 && !E.isOver(game);
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    const home = game ? E.homeCount(game, HUMAN) : 0;
    const steps = game ? game.pos[HUMAN].reduce((a, r) => a + (r === E.BASE ? 0 : r + 1), 0) : 0;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: stats.played ? t('summary.note', { won: stats.won, played: stats.played }) : t('summary.none'),
      stats: stats.played ? [{ value: kit.i18n.fmtNumber(stats.won), label: t('summary.wins') }, { value: winRate(), label: t('summary.rate') }] : [],
      resume: inPlay() ? { title: t('app.name'), detail: t('summary.resume', { n: home }), pct: steps / (4 * (E.HOME + 1)) } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game), elapsed: Math.round(clock.elapsed()) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */
  function newGame() {
    gen++;
    busy = false;
    anim = null;
    note = null;
    clearTimeout(endTimer);
    kit.modal.close('modal-end');
    game = E.newGame((Math.random() * 4294967296) >>> 0);
    face = 6;
    faceSeat = HUMAN;
    clock.reset();
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    writeSummary();
    advance();
  }

  /** Tung xúc xắc cho người đang tới lượt: lăn vài mặt rồi dừng ở số của engine. */
  async function doRoll() {
    if (busy || !game || game.phase !== 'roll' || E.isOver(game)) return;
    busy = true;
    const seat = game.turn;
    const p = pace();
    const next = E.roll(game);
    faceSeat = seat;
    note = seat === HUMAN ? null : t('status.cpu', { name: seatName(seat) });
    render();
    kit.sfx('tap');
    const die = $('die');
    if (!reduceMotion) {
      die.classList.add('rolling');
      const until = performance.now() + p.roll;
      while (performance.now() < until) {
        let f = 1 + Math.floor(Math.random() * 6);
        if (f === face) f = (f % 6) + 1;
        face = f;
        renderDie();
        await sleep(70);
      }
      die.classList.remove('rolling');
    } else {
      await sleep(Math.min(200, p.roll));
    }
    if (!game.rolls) clock.resume(); // đồng hồ chạy từ lần tung đầu tiên
    game = next;
    face = next.dice;
    persist();
    const ev = next.last;
    const name = seatName(seat);
    if (ev.outcome === 'forfeit') {
      note = seat === HUMAN ? t('status.forfeitYou') : t('status.forfeit', { name });
      kit.sfx('error');
    } else if (ev.outcome === 'nomove') {
      note = seat === HUMAN ? t('status.noMoveYou', { n: ev.value }) : t('status.noMove', { name, n: ev.value });
      if (seat === HUMAN) kit.sfx('error');
    } else {
      note = seat === HUMAN ? null : t('status.cpuRolled', { name, n: ev.value });
      kit.sfx('drop');
    }
    busy = ev.outcome !== 'move'; // giữ khóa trong lúc đọc thông báo "không đi được"
    render();
    if (ev.outcome !== 'move') {
      // Máy không đi được thì chỉ dừng ngắn; bạn không đi được / mất lượt thì dừng đủ lâu để đọc
      await sleep(seat !== HUMAN && ev.outcome === 'nomove' ? p.show + 150 : p.pass);
      busy = false;
      note = null;
    }
    advance();
  }

  /** Đi quân k của người đang tới lượt: quân nhảy từng ô, tới nơi thì đá quân / về đích. */
  async function doMove(k) {
    if (busy || !game || game.phase !== 'move') return;
    const m = E.legalMoves(game).find((x) => x.token === k);
    if (!m) return;
    busy = true;
    const seat = game.turn;
    const p = pace();
    const next = E.move(game, k);
    note = seat === HUMAN ? null : note;
    const hop = m.from === E.BASE ? p.enter : p.hop;
    const steps = [];
    if (reduceMotion || m.from === E.BASE) steps.push(m.to);
    else for (let r = m.from + 1; r <= m.to; r++) steps.push(r);
    kit.sfx(m.from === E.BASE ? 'place' : 'move');
    const el = $('tokens').querySelector('.token[data-seat="' + seat + '"][data-k="' + k + '"]');
    el.style.setProperty('--hop', hop + 'ms');
    for (const rel of steps) {
      anim = { seat, token: k, rel };
      render();
      await sleep(reduceMotion ? hop * 2 : hop);
    }
    el.style.removeProperty('--hop');
    anim = null;
    // Quân bị đá bay về chuồng chậm hơn để thấy rõ
    const flying = m.captures.map((c) => $('tokens').querySelector('.token[data-seat="' + c.seat + '"][data-k="' + c.token + '"]'));
    flying.forEach((f) => f.classList.add('flying'));
    setTimeout(() => flying.forEach((f) => f.classList.remove('flying')), 600);
    game = next;
    if (m.captures.length) {
      const color = t('color.' + m.captures[0].seat);
      note = seat === HUMAN ? t('status.captureYou', { color }) : t('status.capture', { name: seatName(seat), color });
      kit.sfx('capture');
      if (seat === HUMAN) {
        stats.caps += m.captures.length;
        saveStats();
      }
    } else if (m.to === E.HOME) {
      note = seat === HUMAN ? t('status.homeYou') : null;
      kit.sfx('coin');
    } else if (seat !== HUMAN) {
      note = null;
    }
    persist();
    if (E.isOver(game)) {
      busy = false;
      note = null;
      render();
      finish();
      return;
    }
    render();
    if (m.captures.length || (m.to === E.HOME && seat === HUMAN)) await sleep(p.pass);
    busy = false;
    note = null;
    advance();
  }

  /** Bước kế tiếp của ván: máy tự tung / đi; tới lượt bạn thì chờ (hoặc tự đi khi chỉ có một nước). */
  function advance() {
    render();
    if (!game || busy || E.isOver(game)) return;
    const p = pace();
    const snap = game;
    if (game.turn !== HUMAN) {
      busy = true;
      sleep(game.phase === 'roll' ? p.think : p.show).then(() => {
        busy = false;
        if (game !== snap) return;
        if (game.phase === 'roll') doRoll();
        else doMove(E.chooseMove(game).token);
      });
      return;
    }
    if (game.phase === 'move' && kit.settings.get().autoMove) {
      const moves = E.legalMoves(game);
      // Nhiều quân trong chuồng ra cùng một ô vẫn tính là một nước
      if (new Set(moves.map((m) => m.from + '>' + m.to)).size === 1) {
        sleep(p.auto).then(() => {
          if (game === snap && !busy) doMove(moves[0].token);
        });
      }
    }
  }

  function humanRoll() {
    if (canHumanRoll() && !kit.modal.current()) doRoll();
  }
  function humanMove(k) {
    if (!game || busy || kit.modal.current() || game.turn !== HUMAN || game.phase !== 'move') return;
    if (E.legalMoves(game).some((m) => m.token === k)) doMove(k);
    else kit.sfx('error');
  }

  function finish() {
    clock.pause();
    const won = game.winner === HUMAN;
    stats.played++;
    if (won) stats.won++;
    saveStats();
    persist();
    kit.sdk.end({ mode: MODE, won, timeMs: Math.round(clock.elapsed()), assisted: false });
    if (won) {
      kit.sfx('win');
      kit.confetti();
    } else {
      kit.sfx('lose');
    }
    const name = seatName(game.winner);
    $('end-title').textContent = won ? t('end.won') : t('end.lost', { name });
    $('end-text').textContent = (won ? t('end.wonText') : t('end.lostText', { name })) + ' ' + t('end.rolls', { n: game.rolls, caps: game.caps[HUMAN] });
    $('end-standings').innerHTML = [0, 1, 2, 3].map((s) =>
      '<li class="s' + s + (s === game.winner ? ' win' : '') + '"><span class="seat-glyph" aria-hidden="true"><svg class="sym"><use href="#sym-' + s + '"/></svg></span>' +
      t('end.row', { name: seatName(s), n: E.homeCount(game, s) }) + '</li>').join('');
    clearTimeout(endTimer);
    endTimer = setTimeout(() => kit.modal.open('modal-end'), reduceMotion ? 300 : 900);
  }

  /** Ván đang dở (đã tung) thì hỏi trước, vì bỏ ván tính là thua. */
  function requestNew() {
    if (inPlay()) kit.modal.open('modal-confirm');
    else {
      kit.sfx('start');
      newGame();
    }
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inPlay()) {
      clock.pause();
      stats.played++;
      saveStats();
      kit.sdk.end({ mode: MODE, won: false, timeMs: Math.round(clock.elapsed()), assisted: false });
    }
    newGame();
  }

  /* ---------------- Sự kiện ---------------- */
  $('die').addEventListener('click', humanRoll);
  $('tokens').addEventListener('click', (e) => {
    const b = e.target.closest('.token');
    if (b && Number(b.dataset.seat) === HUMAN) humanMove(Number(b.dataset.k));
  });
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', () => {
    kit.sfx('start');
    newGame();
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = kit.i18n.fmtNumber(stats.played);
    $('stats-won').textContent = kit.i18n.fmtNumber(stats.won);
    $('stats-rate').textContent = winRate();
    $('stats-caps').textContent = kit.i18n.fmtNumber(stats.caps);
  });
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key;
    const btn = e.target.closest && e.target.closest('button');
    const own = btn && (btn.id === 'die' || btn.classList.contains('token'));
    if (k === ' ' || k === 'Spacebar') {
      if (btn && !own) return; // Space trên nút khác (Trợ giúp, Cài đặt…) vẫn bấm nút đó
      humanRoll();
    } else if (k === 'Enter') {
      if (btn) return; // Enter trên xúc xắc / quân đang focus: để trình duyệt bấm nút
      humanRoll();
    } else if (/^[1-4]$/.test(k)) humanMove(Number(k) - 1);
    else if (k === 'n' || k === 'N') requestNew();
    else return;
    e.preventDefault();
  });
  kit.onLeave(persist);
  window.addEventListener('resize', layout);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  buildBoard();
  buildTokens();
  buildSeats();
  layout();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && E.fromJSON(saved.game);
  if (restored && restored.rolls > 0 && !E.isOver(restored)) {
    game = restored;
    face = game.dice || 6;
    faceSeat = game.turn;
    clock.set(saved.elapsed);
    clock.resume(); // ván đã bắt đầu: đồng hồ chạy tiếp ngay
    kit.sdk.start(MODE, true);
    kit.toast(t('toast.saved'));
    writeSummary();
    advance();
  } else {
    newGame();
  }
  layout();
})();
