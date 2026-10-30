/* =====================================================================
 * Ô Vuông - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   Đấu máy 3 mức (easy / medium / hard = mode trên cổng) hoặc 2 người cùng máy (không báo cổng).
 *   Cài đặt: đối thủ, cỡ bàn (3×3, 4×4, 5×5 ô), ai đi trước (khi đấu máy).
 *   Điều khiển: chạm vào khe giữa hai điểm để kẻ cạnh (vùng chạm là hình thoi quanh cạnh, phủ kín bàn);
 *   bàn phím: mũi tên di con trỏ, Enter / Space kẻ, N ván mới.
 *   Máy nghĩ trong Web Worker (dựng từ mã nguồn engine qua Blob), không có worker thì tính trên luồng chính.
 *   Báo ván cho cổng (metric wins, chỉ khi đấu máy):
 *   - Chia ván mới: kit.sdk.start(level); mở lại ván lưu dở: kit.sdk.start(level, true)
 *   - Thắng: kit.sdk.end({ mode: level, won: true, timeMs }); thua / hòa: won: false
 *   - Bỏ ván khi người chơi đã kẻ ít nhất một cạnh: won: false; chưa kẻ cạnh nào thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const LEVELS = ['easy', 'medium', 'hard'];
  const kit = PNKit.init({
    gameId: 'ovuong',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { level: 'easy', size: '4', first: 'you' },
    onSetting: (key) => { if (key === 'level' || key === 'size' || key === 'first') changeSetting(); },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const clock = kit.timer();
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const settingLevel = () => {
    const lv = kit.settings.get().level;
    return LEVELS.indexOf(lv) >= 0 || lv === 'pvp' ? lv : 'easy';
  };
  const settingSize = () => {
    const n = Number(kit.settings.get().size);
    return E.SIZES.indexOf(n) >= 0 ? n : 4;
  };
  const settingHuman = () => (kit.settings.get().first === 'cpu' ? 2 : 1);

  /* ---------------- Thống kê (chỉ ván đấu máy; ván 2 người chỉ đếm số ván) ---------------- */
  const stats = (() => {
    const raw = kit.store.read(keys.stats, {}) || {};
    const n = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
    const s = { played: n(raw.played), won: n(raw.won), drawn: n(raw.drawn), lost: n(raw.lost), pvp: n(raw.pvp), levels: {} };
    LEVELS.forEach((lv) => {
      const r = (raw.levels && raw.levels[lv]) || {};
      s.levels[lv] = { played: n(r.played), won: Math.min(n(r.won), n(r.played)) };
    });
    return s;
  })();
  function record(level, result) {
    if (level === 'pvp') stats.pvp++;
    else {
      stats.played++;
      stats[result]++;
      stats.levels[level].played++;
      if (result === 'won') stats.levels[level].won++;
    }
    kit.store.write(keys.stats, stats);
  }

  /* ---------------- Máy nghĩ trong Web Worker ---------------- */
  // Worker dựng từ chính mã nguồn OVuongFactory (qua Blob) nên chạy được cả khi mở bằng file://
  const AI = {
    worker: null,
    nextId: 0,
    pending: null, // { id, cb, state, level, seed }
    source() {
      return 'var GameEngine = (' + E.factory.toString() + ')();\n' +
        'self.onmessage = function (e) {\n' +
        '  var d = e.data;\n' +
        '  var s = GameEngine.fromJSON(d.state);\n' +
        '  var m = s ? GameEngine.chooseMove(s, { level: d.level, rng: GameEngine.mulberry32(d.seed) }) : -1;\n' +
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
        cb(s ? E.chooseMove(s, { level, rng: E.mulberry32(seed) }) : -1);
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
  // game: { s: trạng thái engine, level: easy|medium|hard|pvp, human: 1|2 (0 khi 2 người), humanMoves, recorded }
  let game = null;
  let cursor = 0; // cạnh dưới con trỏ bàn phím
  let kbd = false; // chỉ hiện con trỏ khi đang dùng bàn phím
  let thinking = false;
  let token = 0; // đổi mỗi ván: bỏ kết quả máy của ván cũ
  let fx = false; // lần vẽ kế tiếp có hiệu ứng cho cạnh / ô vừa kẻ
  let endTimer = 0;

  const pvp = () => game && game.level === 'pvp';
  const isHuman = (p) => pvp() || p === game.human;
  const humanTurn = () => game && !game.s.over && isHuman(game.s.turn) && !thinking;
  const inPlay = () => game && !game.s.over && game.humanMoves > 0;
  const nameOf = (p) => (pvp() ? t('player.p' + p) : p === game.human ? t('player.you') : t('player.cpu'));

  /* ---------------- Bàn SVG ---------------- */
  const f = (x) => Math.round(x * 1000) / 1000;
  /** Vùng chạm của cạnh: hình thoi nối hai đầu cạnh với tâm hai ô hai bên (ở viền thì nhô ra ngoài nửa ô).
   *  Các hình thoi lát kín bàn nên chạm chỗ nào cũng trúng cạnh gần nhất. */
  function hitPoints(xy) {
    const [x1, y1, x2, y2] = xy;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const horiz = y1 === y2;
    const a = horiz ? [mx, my - 0.5] : [mx - 0.5, my];
    const b = horiz ? [mx, my + 0.5] : [mx + 0.5, my];
    return [[x1, y1], a, [x2, y2], b].map((p) => f(p[0]) + ',' + f(p[1])).join(' ');
  }
  /** Dấu chủ ô: người 1 hình tròn, người 2 hình thoi (phân biệt được cả khi không nhìn màu) */
  function ownerMark(p, cx, cy) {
    if (p === 1) return '<circle class="omark" cx="' + f(cx) + '" cy="' + f(cy) + '" r="0.13"/>';
    const r = 0.16;
    return '<path class="omark" d="M' + f(cx) + ' ' + f(cy - r) + 'L' + f(cx + r) + ' ' + f(cy) + 'L' + f(cx) + ' ' + f(cy + r) + 'L' + f(cx - r) + ' ' + f(cy) + 'Z"/>';
  }

  let builtN = 0;
  function buildBoard(n) {
    if (builtN === n) return;
    builtN = n;
    const g = E.geometry(n);
    const pad = 0.42;
    $('board').setAttribute('viewBox', '-0.5 -0.5 ' + (n + 1) + ' ' + (n + 1));
    const bg = $('board-bg');
    bg.setAttribute('x', -pad);
    bg.setAttribute('y', -pad);
    bg.setAttribute('width', n + 2 * pad);
    bg.setAttribute('height', n + 2 * pad);
    let dots = '';
    for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) dots += '<circle class="dot" cx="' + x + '" cy="' + y + '" r="0.085"/>';
    $('dots').innerHTML = dots;
    let edges = '';
    for (let e = 0; e < g.E; e++) {
      const [x1, y1, x2, y2] = g.edgeXY[e];
      edges += '<g class="edge" data-e="' + e + '">' +
        '<polygon class="hit" points="' + hitPoints(g.edgeXY[e]) + '"/>' +
        '<line class="slot" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>' +
        '<line class="ln" pathLength="1" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>' +
        '</g>';
    }
    $('edges').innerHTML = edges;
  }

  function renderBoard() {
    const s = game.s;
    const n = s.n;
    buildBoard(n);
    const g = E.geometry(n);
    const newBoxes = fx ? E.lastBoxes(s) : [];
    const my = humanTurn();
    $('board').classList.toggle('can-play', my);
    $('board').dataset.turn = s.turn;
    const els = $('edges').children;
    for (let e = 0; e < g.E; e++) {
      const el = els[e];
      const p = s.lines[e];
      el.setAttribute('class', 'edge' + (p ? ' on p' + p : '') + (e === s.last ? ' last' : '') + (fx && e === s.last ? ' new' : '') +
        (kbd && e === cursor ? ' cursor' : ''));
      el.setAttribute('aria-label', edgeLabel(e, p));
      if (my && !p) el.setAttribute('role', 'button');
      else el.removeAttribute('role');
    }
    let boxes = '';
    for (let b = 0; b < g.B; b++) {
      const o = s.boxes[b];
      if (!o) continue;
      const x = b % n;
      const y = Math.floor(b / n);
      boxes += '<g class="box p' + o + (newBoxes.indexOf(b) >= 0 ? ' new' : '') + '">' +
        '<rect class="fill" x="' + (x + 0.06) + '" y="' + (y + 0.06) + '" width="0.88" height="0.88" rx="0.08"/>' +
        ownerMark(o, x + 0.5, y + 0.5) + '</g>';
    }
    $('boxes').innerHTML = boxes;
  }

  function edgeLabel(e, p) {
    const [x1, y1, x2, y2] = E.geometry(game.s.n).edgeXY[e];
    const where = t(y1 === y2 ? 'edge.h' : 'edge.v', { r: y1 + 1, c: x1 + 1 });
    return p ? t('edge.drawn', { where, name: nameOf(p) }) : where;
  }

  function renderPlayers() {
    const s = game.s;
    [1, 2].forEach((p) => {
      const card = $('player-' + p);
      const cpu = !isHuman(p);
      const think = thinking && cpu;
      card.querySelector('.pname').textContent = nameOf(p);
      card.querySelector('.psub').textContent = think ? t('player.thinking') : cpu ? t('level.' + game.level) : pvp() ? '' : t('player.human');
      card.querySelector('.pscore').textContent = s.score[p - 1];
      card.classList.toggle('turn', !s.over && s.turn === p);
      card.classList.toggle('thinking', think);
      card.classList.toggle('winner', !!s.over && s.over.winner === p);
      card.setAttribute('aria-label', t('player.label', { name: nameOf(p), n: s.score[p - 1] }));
    });
  }

  function renderStatus() {
    const s = game.s;
    let text;
    let tone = '';
    if (s.over) {
      const w = s.over.winner;
      if (w === 0) {
        text = t('status.draw');
        tone = 'draw';
      } else if (pvp()) {
        text = t('status.pWins', { name: nameOf(w) });
        tone = 'won';
      } else {
        text = t(w === game.human ? 'status.won' : 'status.lost');
        tone = w === game.human ? 'won' : 'lost';
      }
    } else {
      const again = E.lastBoxes(s).length > 0; // vừa khép ô: cùng bên đi tiếp
      if (!isHuman(s.turn)) {
        text = again ? t('status.cpuAgain') : thinking ? t('status.thinking') : t('status.cpuTurn');
        tone = 'cpu';
      } else if (pvp()) text = t(again ? 'status.pAgain' : 'status.pTurn', { name: nameOf(s.turn) });
      else text = t(again ? 'status.again' : 'status.turn');
    }
    const left = s.lines.length - s.plies;
    const chip = $('chip');
    chip.textContent = s.over ? t('chip.over') : t('chip.left', { n: left, size: s.n + '×' + s.n });
    chip.dataset.tone = tone;
    $('status-text').textContent = text;
    $('status').dataset.tone = tone;
    $('status').dataset.turn = s.over ? '' : s.turn;
    $('status').classList.toggle('thinking', thinking);
  }

  function render() {
    $('level-badge').textContent = t('level.' + game.level) + ' · ' + game.s.n + '×' + game.s.n;
    renderBoard();
    renderPlayers();
    renderStatus();
    fx = false;
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
            title: t('app.name') + ' · ' + t('level.' + game.level) + ' · ' + game.s.n + '×' + game.s.n,
            detail: pvp()
              ? t('summary.resumePvp', { a: game.s.score[0], b: game.s.score[1] })
              : t('summary.resume', { you: game.s.score[game.human - 1], cpu: game.s.score[2 - game.human] }),
            pct: Math.min(0.95, game.s.plies / game.s.lines.length),
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
    fx = false;
  }

  function newGame() {
    resetUi();
    kit.modal.close('modal-end');
    const level = settingLevel();
    const human = level === 'pvp' ? 0 : settingHuman();
    game = { s: E.newGame(settingSize(), 1), level, human, humanMoves: 0, recorded: false };
    cursor = Math.floor(game.s.n / 2); // cạnh giữa hàng trên cùng
    clock.reset();
    clock.start();
    kit.store.remove(keys.save);
    if (!pvp()) kit.sdk.start(level);
    render();
    writeSummary();
    aiTurn(true);
  }

  /** Kẻ cạnh e (người hoặc máy) */
  function commit(e, byAi) {
    const prev = game.s;
    const next = E.play(prev, e);
    if (!next) return false;
    game.s = next;
    if (!byAi) game.humanMoves++;
    fx = true;
    const closed = E.lastBoxes(next).length;
    if (closed) {
      kit.sfx(closed > 1 ? 'combo' : 'capture', byAi ? { pitch: 0.85 } : undefined);
      if (!byAi && navigator.vibrate) try { navigator.vibrate(12); } catch (err) { /* bỏ qua */ }
    } else kit.sfx('place', byAi ? { pitch: 0.82, volume: 0.8 } : pvp() && prev.turn === 2 ? { pitch: 1.12 } : undefined);
    render();
    if (next.over) finish();
    persist();
    if (!next.over) aiTurn(!closed);
    return true;
  }

  function fail(key) {
    kit.sfx('error', { volume: 0.6 });
    if (key) kit.toast(t(key));
  }

  /** Chạm / Enter vào cạnh e */
  function act(e) {
    if (!game || kit.modal.current() || game.s.over) return;
    if (!humanTurn()) return fail(thinking ? 'toast.wait' : null);
    if (game.s.lines[e]) return fail('toast.taken');
    commit(e, false);
  }

  /** Đến lượt máy thì cho máy nghĩ (không chặn giao diện). Nước đầu của lượt "nghĩ" lâu hơn cho tự nhiên;
   *  các nước tiếp theo sau khi máy khép ô đi nhanh hơn nhưng vẫn đủ chậm để nhìn theo. */
  function aiTurn(firstOfTurn) {
    if (!game || pvp() || game.s.over || game.s.turn === game.human || thinking) return;
    thinking = true;
    const my = token;
    const t0 = performance.now();
    const minWait = firstOfTurn ? (reduceMotion ? 300 : 550) : reduceMotion ? 150 : 320;
    renderPlayers();
    renderStatus();
    const seed = (Math.random() * 4294967296) >>> 0;
    AI.think(E.toJSON(game.s), game.level, seed, (m) => {
      if (my !== token) return;
      const wait = Math.max(0, minWait - (performance.now() - t0));
      setTimeout(() => {
        if (my !== token) return;
        thinking = false;
        // Kết quả lạ (worker hỏng…) thì kẻ cạnh trống đầu tiên để ván không bị kẹt
        commit(E.isLegal(game.s, m) ? m : E.legalMoves(game.s)[0], true);
      }, wait);
    });
  }

  function finish() {
    if (game.recorded) return;
    game.recorded = true;
    clock.pause();
    const s = game.s;
    const w = s.over.winner;
    const result = w === 0 ? 'drawn' : pvp() || w === game.human ? 'won' : 'lost';
    record(game.level, result);
    if (!pvp()) kit.sdk.end({ mode: game.level, won: result === 'won', timeMs: Math.round(clock.elapsed()), assisted: false });
    if (result === 'won') {
      kit.sfx('win');
      kit.confetti();
    } else kit.sfx(result === 'drawn' ? 'draw' : 'lose');
    $('end-title').textContent = w === 0 ? t('end.draw') : pvp() ? t('end.pWins', { name: nameOf(w) }) : t(result === 'won' ? 'end.won' : 'end.lost');
    const first = pvp() ? 1 : game.human; // bên đứng trước trong bảng điểm: người chơi (hoặc người 1)
    [first, 3 - first].forEach((p, i) => {
      $('end-s' + (i + 1)).textContent = s.score[p - 1];
      $('end-l' + (i + 1)).textContent = nameOf(p);
      $('end-side-' + (i + 1)).dataset.p = p;
    });
    $('end-meta').textContent = t('end.meta', { level: t('level.' + game.level), size: s.n + '×' + s.n });
    $('end-mark').dataset.result = result;
    endTimer = setTimeout(() => kit.modal.open('modal-end'), reduceMotion ? 300 : 1000);
  }

  /** Ván đang dở (người đã kẻ) thì hỏi trước, vì bỏ ván đấu máy tính là thua. */
  function requestNew() {
    if (inPlay()) {
      $('confirm-text').textContent = t(pvp() ? 'confirm.textPvp' : 'confirm.text');
      kit.modal.open('modal-confirm');
    } else {
      kit.sfx('start');
      newGame();
    }
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inPlay() && !game.recorded && !pvp()) {
      game.recorded = true;
      clock.pause();
      record(game.level, 'lost');
      kit.sdk.end({ mode: game.level, won: false, timeMs: Math.round(clock.elapsed()), assisted: false });
    }
    newGame();
  }

  /** Đổi đối thủ / cỡ bàn / ai đi trước: ván chưa kẻ cạnh nào (hoặc đã xong) thì chia lại ngay,
   *  đang dở thì áp dụng từ ván sau */
  function changeSetting() {
    renderSettingDesc();
    if (!game) return;
    const same = game.level === settingLevel() && game.s.n === settingSize() && (pvp() || game.human === settingHuman());
    if (same) return;
    if (inPlay()) kit.toast(t('toast.nextGame'), 2600);
    else newGame();
  }
  function renderSettingDesc() {
    $('level-desc').textContent = t('settings.levelDesc.' + settingLevel());
    $('size-desc').textContent = t('settings.sizeDesc.' + settingSize());
    $('setting-first').hidden = settingLevel() === 'pvp';
  }

  /* ---------------- Bàn phím: con trỏ trên các cạnh ----------------
   * Trung điểm cạnh ngang nằm trên hàng y = r, cạnh dọc trên hàng y = r + 0,5.
   * Trái / phải: đi trong cùng hàng; lên / xuống: sang hàng kế (xen kẽ ngang / dọc), giữ cột gần nhất. */
  function moveCursor(dx, dy) {
    const g = E.geometry(game.s.n);
    const mid = (e) => [(g.edgeXY[e][0] + g.edgeXY[e][2]) / 2, (g.edgeXY[e][1] + g.edgeXY[e][3]) / 2];
    const [x0, y0] = mid(cursor);
    const horiz = g.edgeXY[cursor][1] === g.edgeXY[cursor][3];
    let best = cursor;
    let bs = Infinity;
    for (let e = 0; e < g.E; e++) {
      const [x, y] = mid(e);
      let sc;
      if (dx) {
        if (y !== y0 || (x - x0) * dx <= 0) continue;
        sc = Math.abs(x - x0);
      } else {
        if ((y - y0) * dy <= 0) continue;
        // Hàng gần nhất trước, rồi cột gần nhất; hòa thì từ ngang sang dọc lệch trái, từ dọc sang ngang lệch phải
        sc = Math.abs(y - y0) * 100 + Math.abs(x - x0) * 2 + ((x - x0) * (horiz ? 1 : -1) > 0 ? 0.5 : 0);
      }
      if (sc < bs) {
        bs = sc;
        best = e;
      }
    }
    cursor = best;
  }

  /* ---------------- Sự kiện ---------------- */
  $('edges').addEventListener('click', (e) => {
    const g = e.target.closest('.edge');
    if (!g) return;
    kbd = false;
    cursor = Number(g.dataset.e);
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
    $('stats-pvp').textContent = t('stats.pvp', { n: stats.pvp });
  });
  const DIRS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key;
    if (DIRS[k]) {
      // Đang điều khiển bàn bằng phím: bỏ focus khỏi nút (vd. nút vừa đóng hộp thoại) để Enter thao tác trên bàn
      const fe = document.activeElement;
      if (fe && fe !== document.body && fe.closest && fe.closest('button')) fe.blur();
      if (kbd) moveCursor(DIRS[k][0], DIRS[k][1]);
      kbd = true;
      renderBoard();
    } else if (k === 'Enter' || k === ' ') {
      // Space / Enter trên nút đang focus là cú bấm nút của trình duyệt
      if (e.target && e.target.closest && e.target.closest('button')) return;
      if (!kbd) {
        kbd = true;
        renderBoard();
      } else act(cursor);
    } else if (k === 'n' || k === 'N') requestNew();
    else return;
    e.preventDefault();
  });
  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  renderSettingDesc();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && typeof saved === 'object' && saved.v === 1 && E.fromJSON(saved.game);
  const okLevel = saved && (LEVELS.indexOf(saved.level) >= 0 ? saved.human === 1 || saved.human === 2 : saved.level === 'pvp' && saved.human === 0);
  if (restored && !restored.over && okLevel && Number.isInteger(saved.humanMoves) && saved.humanMoves > 0) {
    game = { s: restored, level: saved.level, human: saved.human, humanMoves: saved.humanMoves, recorded: false };
    cursor = Math.floor(restored.n / 2);
    clock.set(Number.isFinite(saved.elapsed) && saved.elapsed > 0 ? saved.elapsed : 0);
    clock.start();
    if (!pvp()) kit.sdk.start(game.level, true);
    kit.toast(t('toast.saved'));
    render();
    writeSummary();
    aiTurn(true);
  } else {
    newGame();
  }
})();
