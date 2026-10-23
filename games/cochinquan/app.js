/* =====================================================================
 * Cờ Chín Quân - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   Người đấu máy. Cài đặt: màu quân (trắng đi trước / đen) và mức máy (easy / medium / hard = mode trên cổng).
 *   Điều khiển: chạm điểm trống để đặt; chạm quân rồi chạm điểm đến để đi / bay; lập mill thì chạm quân
 *   đối thủ được đánh dấu để ăn. Bàn phím: mũi tên di con trỏ, Enter / Space thao tác, Esc bỏ chọn.
 *   Máy nghĩ trong Web Worker (dựng từ mã nguồn engine qua Blob), không có worker thì tính trên luồng chính.
 *   Báo ván cho cổng (metric wins):
 *   - Chia ván mới: kit.sdk.start(level); mở lại ván lưu dở: kit.sdk.start(level, true)
 *   - Thắng: kit.sdk.end({ mode: level, won: true, timeMs }); thua / hòa: won: false
 *   - Bỏ ván khi người chơi đã đi ít nhất một nước: won: false; chưa đi nước nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const LEVELS = ['easy', 'medium', 'hard'];
  const SIDES = { white: E.WHITE, black: E.BLACK };
  const kit = PNKit.init({
    gameId: 'cochinquan',
    version: '1.0.0',
    dict: window.GAME_DICT,
    defaults: { level: 'easy', side: 'white' },
    onSetting: (key) => { if (key === 'level' || key === 'side') changeSetting(); },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SVGNS = 'http://www.w3.org/2000/svg';

  const settingLevel = () => (LEVELS.indexOf(kit.settings.get().level) >= 0 ? kit.settings.get().level : 'easy');
  const settingSide = () => SIDES[kit.settings.get().side] || E.WHITE;

  /* ---------------- Thống kê ---------------- */
  const stats = (() => {
    const raw = kit.store.read(keys.stats, {}) || {};
    const n = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
    const s = { played: n(raw.played), won: n(raw.won), drawn: n(raw.drawn), lost: n(raw.lost), levels: {} };
    LEVELS.forEach((lv) => {
      const r = (raw.levels && raw.levels[lv]) || {};
      s.levels[lv] = { played: n(r.played), won: Math.min(n(r.won), n(r.played)) };
    });
    return s;
  })();
  function record(level, result) {
    stats.played++;
    stats[result]++;
    stats.levels[level].played++;
    if (result === 'won') stats.levels[level].won++;
    kit.store.write(keys.stats, stats);
  }

  /* ---------------- Máy nghĩ trong Web Worker ---------------- */
  // Worker dựng từ chính mã nguồn CoChinQuanFactory (qua Blob) nên chạy được cả khi mở bằng file://
  const AI = {
    worker: null,
    nextId: 0,
    pending: null, // { id, cb, state, level, seed }
    source() {
      return 'var GameEngine = (' + E.factory.toString() + ')();\n' +
        'self.onmessage = function (e) {\n' +
        '  var d = e.data;\n' +
        '  var s = GameEngine.fromJSON(d.state);\n' +
        '  var m = s ? GameEngine.chooseMove(s, { level: d.level, rng: GameEngine.mulberry32(d.seed) }) : null;\n' +
        '  self.postMessage({ id: d.id, move: m });\n' +
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
        this.worker.onerror = (e) => { // worker hỏng: bỏ worker, tính đồng bộ yêu cầu đang chờ
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
      this.pending = { id, cb, state, level, seed };
      if (this.worker) {
        this.worker.postMessage({ id, state, level, seed });
        return;
      }
      setTimeout(() => {
        if (!this.pending || this.pending.id !== id) return;
        this.pending = null;
        const s = E.fromJSON(state);
        cb(s ? E.chooseMove(s, { level, rng: E.mulberry32(seed) }) : null);
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

  /* ---------------- Trạng thái giao diện ---------------- */
  // game: { s: trạng thái engine, level, human: 1 | 2, humanMoves, recorded }
  let game = null;
  let sel = -1; // quân đang chọn (giai đoạn đi / bay)
  let pending = null; // bước vừa lập mill, chờ chọn quân để ăn: { from, to, list }
  let cursor = 4; // con trỏ bàn phím
  let kbd = false; // chỉ hiện con trỏ khi đang dùng bàn phím
  let thinking = false;
  let token = 0; // đổi mỗi ván: bỏ kết quả máy của ván cũ
  let fx = null; // hiệu ứng cho lần vẽ kế tiếp: { drop, slide: { from, to }, ghost: { p, color }, mills: [chỉ số mill mới] }
  let endTimer = 0;

  const opp = (p) => 3 - p;
  const humanTurn = () => game && !game.s.over && game.s.turn === game.human && !thinking;
  const inPlay = () => game && !game.s.over && game.humanMoves > 0;
  const countOn = (board, p) => board.reduce((n, x) => n + (x === p ? 1 : 0), 0);

  /* ---------------- Bàn cờ SVG ---------------- */
  function svg(tag, attrs, parent) {
    const el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(el);
    return el;
  }
  /** Vẽ một lần: ba hình vuông + bốn đường nối giữa các cạnh */
  function buildBoard() {
    const g = $('lines');
    [0, 1, 2].forEach((i) => svg('rect', { x: i, y: i, width: 6 - 2 * i, height: 6 - 2 * i }, g));
    [[3, 0, 3, 2], [3, 4, 3, 6], [0, 3, 2, 3], [4, 3, 6, 3]].forEach(([x1, y1, x2, y2]) => svg('line', { x1, y1, x2, y2 }, g));
  }
  buildBoard();

  /** Điểm gần nhất theo hướng (dx, dy) cho con trỏ bàn phím; ưu tiên điểm cùng hàng / cột */
  function nearest(from, dx, dy) {
    const [x0, y0] = E.COORDS[from];
    let best = from;
    let bs = Infinity;
    E.COORDS.forEach(([x, y], p) => {
      const along = (x - x0) * dx + (y - y0) * dy;
      if (along <= 0) return;
      const side = Math.abs(dx ? y - y0 : x - x0);
      const sc = along + side * 2.5;
      if (sc < bs) {
        bs = sc;
        best = p;
      }
    });
    return best;
  }

  /* ---------------- Vẽ ---------------- */
  /** Một quân: bóng, thân (gradient theo màu trong index.html), rãnh tròn giữa quân */
  const pieceSvg = (x, y) =>
    '<circle class="pc-shadow" cx="' + x + '" cy="' + (y + 0.05) + '" r="0.36"/>' +
    '<circle class="pc-body" cx="' + x + '" cy="' + y + '" r="0.36"/>' +
    '<circle class="pc-groove" cx="' + x + '" cy="' + y + '" r="0.2"/>';

  function shownBoard() {
    return pending ? E.previewBoard(game.s, pending.from, pending.to) : game.s.board;
  }

  function renderBoard() {
    const s = game.s;
    const board = shownBoard();
    const human = game.human;
    const myTurn = humanTurn();
    const ph = E.phase(s);
    const hints = new Set(myTurn && !pending ? (ph === 'place' ? [] : sel >= 0 ? E.targets(s, sel) : []) : []);
    const canMove = new Set(myTurn && !pending && sel < 0 && ph !== 'place' ? E.movable(s) : []);
    const removable = new Set(pending ? pending.list : []);
    const last = pending ? null : s.last;

    // Mill đã thành: vạch màu dưới quân
    let mills = '';
    E.MILLS.forEach((m, i) => {
      const c = board[m[0]];
      if (!c || board[m[1]] !== c || board[m[2]] !== c) return;
      const [x1, y1] = E.COORDS[m[0]];
      const [x2, y2] = E.COORDS[m[2]];
      const isNew = fx && fx.mills && fx.mills.indexOf(i) >= 0;
      mills += '<line class="mill c' + c + (isNew ? ' new' : '') + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>';
    });
    $('mills').innerHTML = mills;

    let html = '';
    for (let p = 0; p < 24; p++) {
      const [x, y] = E.COORDS[p];
      const c = board[p];
      const cls = ['pt'];
      if (hints.has(p)) cls.push('target');
      if (canMove.has(p)) cls.push('can');
      if (removable.has(p)) cls.push('removable');
      if (p === sel) cls.push('selected');
      if (pending && p === pending.to) cls.push('selected');
      if (last && p === last.to) cls.push('last');
      // Điểm bấm được lúc này (con trỏ chuột dạng tay)
      if (myTurn) {
        if (pending ? removable.has(p) || p === pending.to : ph === 'place' ? !c : hints.has(p) || canMove.has(p) || (sel >= 0 && c === human)) cls.push('active');
      }
      const label = t(c === E.WHITE ? 'point.white' : c === E.BLACK ? 'point.black' : 'point.empty', { n: p + 1 });
      let g = '<g class="' + cls.join(' ') + '" data-p="' + p + '" role="button" aria-label="' + label + '">';
      g += '<circle class="hit" cx="' + x + '" cy="' + y + '" r="0.5"/>';
      g += '<circle class="dot" cx="' + x + '" cy="' + y + '" r="0.12"/>';
      if (last && p === last.from) g += '<circle class="from-mark" cx="' + x + '" cy="' + y + '" r="0.2"/>';
      if (last && p === last.remove && !c && !(fx && fx.ghost)) g += '<path class="x-mark" d="M' + (x - 0.13) + ' ' + (y - 0.13) + 'l.26 .26m0 -.26l-.26 .26"/>';
      if (hints.has(p)) g += '<circle class="hint" cx="' + x + '" cy="' + y + '" r="0.17"/>';
      if (c) {
        let pc = 'pc c' + c;
        let style = '';
        if (fx && fx.drop === p) pc += ' drop';
        if (fx && fx.slide && fx.slide.to === p) {
          const [fx0, fy0] = E.COORDS[fx.slide.from];
          pc += ' slide';
          style = ' style="--dx:' + (fx0 - x) + ';--dy:' + (fy0 - y) + '"';
        }
        g += '<g class="' + pc + '"' + style + '>' + pieceSvg(x, y) + '</g>';
      }
      if (fx && fx.ghost && fx.ghost.p === p) {
        g += '<g class="pc c' + fx.ghost.color + ' ghost">' + pieceSvg(x, y) + '</g>';
      }
      g += '<circle class="ring" cx="' + x + '" cy="' + y + '" r="0.47"/>';
      if (kbd && p === cursor) g += '<rect class="cursor" x="' + (x - 0.52) + '" y="' + (y - 0.52) + '" width="1.04" height="1.04" rx="0.2"/>';
      html += g + '</g>';
    }
    $('points').innerHTML = html;
  }

  function renderPlayers() {
    const s = game.s;
    const board = shownBoard();
    [E.WHITE, E.BLACK].forEach((p) => {
      const card = $('player-' + p);
      const isHuman = p === game.human;
      const hand = s.hand[p - 1];
      const on = countOn(board, p);
      const lost = E.PIECES - hand - on;
      const name = isHuman ? t('player.you') : t('player.cpu');
      card.querySelector('.pname').textContent = name;
      let pips = '';
      for (let i = 0; i < E.PIECES; i++) pips += '<i class="pip ' + (i < hand ? 'hand' : i < hand + on ? 'on' : 'lost') + '"></i>';
      card.querySelector('.pips').innerHTML = pips;
      const isThinking = thinking && !isHuman;
      card.querySelector('.psub').textContent = isThinking ? t('player.thinking') : t('player.counts', { hand, board: on });
      card.classList.toggle('turn', !s.over && s.turn === p);
      card.classList.toggle('thinking', isThinking);
      card.classList.toggle('winner', !!s.over && s.over.winner === p);
      card.setAttribute('aria-label', t('player.label', { name, color: t(p === E.WHITE ? 'side.white' : 'side.black'), hand, board: on, lost }));
    });
  }

  function renderStatus() {
    const s = game.s;
    const chip = $('phase');
    const txt = $('status-text');
    let phaseText;
    let text;
    let tone = '';
    if (s.over) {
      phaseText = t('phase.over');
      text = s.over.winner === 0 ? t('status.draw') : s.over.winner === game.human ? t('status.won') : t('status.lost');
      tone = s.over.winner === 0 ? 'draw' : s.over.winner === game.human ? 'won' : 'lost';
    } else if (pending) {
      phaseText = t('phase.remove');
      text = t('status.remove');
      tone = 'remove';
    } else {
      const ph = E.phase(s);
      phaseText = ph === 'place' ? t('phase.place', { n: s.hand[s.turn - 1] }) : t('phase.' + ph);
      if (s.turn !== game.human) text = thinking ? t('status.thinking') : t('status.cpuTurn');
      else if (ph === 'place') text = t('status.place');
      else if (ph === 'fly') text = sel >= 0 ? t('status.flyTo') : t('status.fly');
      else text = sel >= 0 ? t('status.moveTo') : t('status.move');
      if (s.turn !== game.human) tone = 'cpu';
    }
    chip.textContent = phaseText;
    chip.dataset.tone = tone;
    txt.textContent = text;
    $('status').dataset.tone = tone;
    $('status').classList.toggle('thinking', thinking);
  }

  function render() {
    $('level-badge').textContent = t('level.' + game.level);
    renderBoard();
    renderPlayers();
    renderStatus();
    fx = null;
  }

  /* ---------------- Lưu ---------------- */
  function writeSummary() {
    const shown = LEVELS.filter((lv) => stats.levels[lv].played > 0);
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: stats.played ? t('summary.note', { won: stats.won, played: stats.played }) : t('summary.none'),
      stats: shown.map((lv) => ({ value: stats.levels[lv].won + '/' + stats.levels[lv].played, label: t('summary.wins', { level: t('level.' + lv) }) })),
      resume: inPlay()
        ? {
            title: t('app.name') + ' · ' + t('level.' + game.level),
            detail: t('summary.resume', {
              you: countOn(game.s.board, game.human) + game.s.hand[game.human - 1],
              cpu: countOn(game.s.board, opp(game.human)) + game.s.hand[opp(game.human) - 1],
            }),
            pct: Math.min(0.95, game.s.plies / 80),
          }
        : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inPlay()) {
      kit.store.write(keys.save, {
        v: 1,
        game: E.toJSON(game.s),
        level: game.level,
        human: game.human,
        humanMoves: game.humanMoves,
        elapsed: Math.round(clock.elapsed()),
      });
    } else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Luồng ván ---------------- */
  function resetUi() {
    clearTimeout(endTimer);
    AI.cancel();
    thinking = false;
    token++;
    sel = -1;
    pending = null;
    fx = null;
  }

  function newGame() {
    resetUi();
    kit.modal.close('modal-end');
    game = { s: E.newGame(), level: settingLevel(), human: settingSide(), humanMoves: 0, recorded: false };
    clock.reset();
    clock.start();
    kit.store.remove(keys.save);
    kit.sdk.start(game.level);
    render();
    writeSummary();
    aiTurn();
  }

  /** Các mill vừa thành nhờ quân tới điểm `to` */
  function newMills(board, to) {
    const out = [];
    E.MILLS.forEach((m, i) => {
      if (m.indexOf(to) >= 0 && m.every((q) => board[q] === board[to])) out.push(i);
    });
    return out;
  }

  /** Đi hẳn một nước (đã đủ phần ăn quân nếu có) */
  function commit(move, byAi) {
    const prev = game.s;
    const next = E.play(prev, move);
    if (!next) return false;
    game.s = next;
    if (!byAi) game.humanMoves++;
    const wasPending = !!pending;
    sel = -1;
    pending = null;
    fx = {};
    // Nước của người đã hiện bước đặt / đi lúc chờ ăn quân: không chạy lại hiệu ứng đó
    if (!wasPending) {
      if (move.from < 0) fx.drop = move.to;
      else fx.slide = { from: move.from, to: move.to };
      if (move.remove >= 0) fx.mills = newMills(next.board, move.to);
    }
    if (move.remove >= 0) {
      fx.ghost = { p: move.remove, color: prev.board[move.remove] };
      kit.sfx('capture');
    } else kit.sfx(move.from < 0 ? 'place' : 'move');
    render();
    if (next.over) finish();
    persist();
    if (!next.over) aiTurn();
    return true;
  }

  /** Bước đặt / đi của người: lập mill thì chờ chọn quân để ăn */
  function step(from, to) {
    const list = E.removable(game.s, from, to);
    if (!list.length) return commit({ from, to, remove: -1 }, false);
    pending = { from, to, list };
    sel = -1;
    const board = E.previewBoard(game.s, from, to);
    fx = { mills: newMills(board, to) };
    if (from < 0) fx.drop = to;
    else fx.slide = { from, to };
    kit.sfx('combo');
    render();
    return true;
  }

  function fail(key) {
    kit.sfx('error', { volume: 0.6 });
    if (key) kit.toast(t(key));
  }

  /** Chạm / Enter vào điểm p */
  function act(p) {
    if (!game || kit.modal.current()) return;
    if (game.s.over) return;
    if (!humanTurn()) return fail(thinking ? 'toast.wait' : null);
    const s = game.s;
    const me = game.human;
    if (pending) {
      if (pending.list.indexOf(p) >= 0) commit({ from: pending.from, to: pending.to, remove: p }, false);
      else if (p === pending.to) cancelPending();
      else fail('toast.take');
      return;
    }
    const ph = E.phase(s);
    if (ph === 'place') {
      if (s.board[p]) return fail('toast.occupied');
      step(-1, p);
      return;
    }
    if (s.board[p] === me) {
      if (p === sel) sel = -1;
      else if (E.targets(s, p).length) {
        sel = p;
        kit.sfx('tap');
      } else return fail('toast.stuck');
      render();
      return;
    }
    if (sel < 0) return fail(s.board[p] ? 'toast.notYours' : null);
    if (E.targets(s, sel).indexOf(p) >= 0) step(sel, p);
    else fail(s.board[p] ? 'toast.occupied' : 'toast.far');
  }

  /** Bỏ bước đang chờ ăn quân (người chưa chọn quân để ăn): quay về như trước bước đó */
  function cancelPending() {
    if (!pending) return;
    const from = pending.from;
    pending = null;
    sel = from >= 0 ? from : -1;
    kit.sfx('pop');
    render();
  }

  /** Đến lượt máy thì cho máy nghĩ (không chặn giao diện); hiện "đang nghĩ" ít nhất một chút cho tự nhiên */
  function aiTurn() {
    if (!game || game.s.over || game.s.turn === game.human || thinking) return;
    thinking = true;
    const my = token;
    const t0 = performance.now();
    const minWait = reduceMotion ? 250 : 650;
    render();
    const seed = (Math.random() * 4294967296) >>> 0;
    AI.think(E.toJSON(game.s), game.level, seed, (m) => {
      if (my !== token) return;
      const wait = Math.max(0, minWait - (performance.now() - t0));
      setTimeout(() => {
        if (my !== token) return;
        thinking = false;
        // Kết quả lạ (worker hỏng…) thì đi nước hợp lệ đầu tiên để ván không bị kẹt
        const move = m && E.isLegal(game.s, m) ? { from: m.from, to: m.to, remove: m.remove } : E.legalMoves(game.s)[0];
        commit(move, true);
      }, wait);
    });
  }

  function finish() {
    if (game.recorded) return;
    game.recorded = true;
    clock.pause();
    const over = game.s.over;
    const result = over.winner === 0 ? 'drawn' : over.winner === game.human ? 'won' : 'lost';
    record(game.level, result);
    kit.sdk.end({ mode: game.level, won: result === 'won', timeMs: Math.round(clock.elapsed()), assisted: false });
    if (result === 'won') {
      kit.sfx('win');
      kit.confetti();
    } else kit.sfx(result === 'drawn' ? 'draw' : 'lose');
    $('end-title').textContent = t(result === 'won' ? 'end.won' : result === 'lost' ? 'end.lost' : 'end.draw');
    const reason = over.reason === 'pieces' || over.reason === 'blocked' ? 'end.' + over.reason + '.' + (result === 'won' ? 'won' : 'lost') : 'end.' + over.reason;
    $('end-text').textContent = t(reason);
    $('end-meta').textContent = t('end.meta', { level: t('level.' + game.level), moves: game.s.plies });
    $('end-mark').dataset.result = result;
    endTimer = setTimeout(() => kit.modal.open('modal-end'), reduceMotion ? 300 : 1100);
  }

  /** Ván đang dở (người đã đi) thì hỏi trước, vì bỏ ván tính là thua. */
  function requestNew() {
    if (inPlay()) kit.modal.open('modal-confirm');
    else {
      kit.sfx('start');
      newGame();
    }
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inPlay() && !game.recorded) {
      game.recorded = true;
      clock.pause();
      record(game.level, 'lost');
      kit.sdk.end({ mode: game.level, won: false, timeMs: Math.round(clock.elapsed()), assisted: false });
    }
    newGame();
  }

  /** Đổi mức máy / màu quân: ván chưa đi nước nào (hoặc đã xong) thì chia lại ngay, đang dở thì áp dụng từ ván sau */
  function changeSetting() {
    renderLevelDesc();
    if (!game) return;
    if (game.level === settingLevel() && game.human === settingSide()) return;
    if (inPlay()) kit.toast(t('toast.nextGame'), 2600);
    else newGame();
  }
  function renderLevelDesc() {
    $('level-desc').textContent = t('settings.levelDesc.' + settingLevel());
  }

  /* ---------------- Sự kiện ---------------- */
  $('points').addEventListener('click', (e) => {
    const g = e.target.closest('.pt');
    if (!g) return;
    kbd = false;
    cursor = Number(g.dataset.p);
    act(cursor);
  });
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', () => {
    kit.sfx('start');
    newGame();
  });
  $('btn-stats').addEventListener('click', () => {
    ['played', 'won', 'drawn', 'lost'].forEach((k) => { $('stats-' + k).textContent = kit.i18n.fmtNumber(stats[k]); });
    LEVELS.forEach((lv) => { $('stats-' + lv).textContent = t('stats.level', { won: stats.levels[lv].won, played: stats.levels[lv].played }); });
  });
  const DIRS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key;
    if (DIRS[k]) {
      // Đang điều khiển bàn cờ bằng phím: bỏ focus khỏi nút (vd. nút vừa đóng hộp thoại) để Enter thao tác trên bàn
      const fe = document.activeElement;
      if (fe && fe !== document.body && fe.closest && fe.closest('button')) fe.blur();
      if (kbd) cursor = nearest(cursor, DIRS[k][0], DIRS[k][1]);
      kbd = true;
      renderBoard();
    } else if (k === 'Enter' || k === ' ') {
      // Space / Enter trên nút đang focus là cú bấm nút của trình duyệt
      if (e.target && e.target.closest && e.target.closest('button')) return;
      if (!kbd) {
        kbd = true;
        renderBoard();
      } else act(cursor);
    } else if (k === 'Escape') {
      if (pending) cancelPending();
      else if (sel >= 0) {
        sel = -1;
        render();
      } else return;
    } else if (k === 'n' || k === 'N') requestNew();
    else return;
    e.preventDefault();
  });
  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  renderLevelDesc();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && saved.v === 1 && E.fromJSON(saved.game);
  if (restored && !restored.over && LEVELS.indexOf(saved.level) >= 0 && (saved.human === E.WHITE || saved.human === E.BLACK) &&
      Number.isInteger(saved.humanMoves) && saved.humanMoves > 0) {
    game = { s: restored, level: saved.level, human: saved.human, humanMoves: saved.humanMoves, recorded: false };
    clock.set(saved.elapsed);
    clock.start();
    kit.sdk.start(game.level, true);
    kit.toast(t('toast.saved'));
    render();
    writeSummary();
    aiTurn();
  } else {
    newGame();
  }
})();
