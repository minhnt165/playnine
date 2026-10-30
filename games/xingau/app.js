/* =====================================================================
 * Xí Ngầu - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Bảng điểm hai cột (phần trên / phần dưới), mỗi ô trống hiện trước điểm sẽ nhận với bộ xúc xắc hiện tại
 *   - Chạm xúc xắc để giữ, chạm ô để ghi; ghi nhầm thì hoàn tác được cho tới lần lắc kế tiếp
 *     (hoàn tác không lộ thêm thông tin ngẫu nhiên nào vì chưa lắc lại)
 *   Báo ván cho cổng (metric score_high, mode classic):
 *   - Chia ván mới: kit.sdk.start(MODE); mở lại ván lưu dở: kit.sdk.start(MODE, true)
 *   - Hết 13 ô: kit.sdk.end({ mode, won: điểm >= 250, score, assisted: false })
 *   - Bỏ ván đã lắc ít nhất một lần: kit.sdk.end({ mode, won: false, score: điểm hiện có }); chưa lắc thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const kit = PNKit.init({ gameId: 'xingau', version: '1.0.1', dict: window.GAME_DICT });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let game = null;
  let undoState = null; // trạng thái trước lần ghi điểm gần nhất (chỉ giữ tới lần lắc kế tiếp)
  let busy = false; // đang chạy hiệu ứng lắc
  const stats = Object.assign({ played: 0, won: 0, best: null, games: 0, sum: 0, yachts: 0, bonus: 0 }, kit.store.read(keys.stats, {}) || {});

  const PIPS = '<i class="pip"></i>'.repeat(9);
  const num = (n) => kit.i18n.fmtNumber(n);
  const catName = (c) => t('cat.' + c);

  /* ---------------- Dựng bảng điểm và khay xúc xắc ---------------- */
  const rows = {};
  function buildSheet() {
    E.CATS.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cat';
      b.dataset.cat = c;
      const ico = i < 6 ? '<span class="mini face" data-face="' + (i + 1) + '" aria-hidden="true">' + PIPS + '</span>' : '';
      b.innerHTML = ico + '<span class="cat-name"></span><span class="cat-val"></span>';
      b.querySelector('.cat-name').textContent = catName(c);
      b.addEventListener('click', () => pick(c));
      $(i < 6 ? 'col-upper' : 'col-lower').appendChild(b);
      rows[c] = b;
    });
    const foot = (col, label, id, cls) => {
      const d = document.createElement('div');
      d.className = 'sheet-foot' + (cls ? ' ' + cls : '');
      d.innerHTML = '<span></span><b id="' + id + '"></b>';
      d.firstChild.textContent = label;
      $(col).appendChild(d);
    };
    foot('col-upper', t('sheet.bonus'), 'upper-bonus');
    foot('col-upper', t('sheet.total'), 'grand', 'total');
    foot('col-lower', t('sheet.extra'), 'extra');
  }

  const dieEls = [];
  function buildDice() {
    for (let i = 0; i < E.DICE; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'die';
      b.dataset.i = String(i);
      b.innerHTML = '<span class="face">' + PIPS + '</span><span class="die-hold" aria-hidden="true"></span>';
      b.querySelector('.die-hold').textContent = t('dice.hold');
      b.addEventListener('click', () => hold(i));
      $('dice').appendChild(b);
      dieEls.push(b);
    }
  }

  /* ---------------- Vẽ ---------------- */
  function render() {
    const rolled = game.rolls > 0;
    $('round').textContent = E.round(game) + '/' + E.CATS.length;
    $('score').textContent = num(E.total(game));
    $('best').textContent = stats.best == null ? '–' : num(stats.best);

    E.CATS.forEach((c) => {
      const b = rows[c];
      const v = game.scores[c];
      const p = E.potential(game, c);
      const val = b.querySelector('.cat-val');
      b.classList.toggle('used', v !== null);
      b.classList.toggle('can', p !== null && !busy);
      b.classList.toggle('zero', p === 0);
      b.classList.toggle('locked', v === null && rolled && p === null);
      b.disabled = v !== null;
      if (v !== null) {
        val.textContent = num(v);
        b.setAttribute('aria-label', t('cat.scored', { cat: catName(c), n: v }));
      } else if (p !== null && !busy) {
        val.textContent = num(p);
        b.setAttribute('aria-label', t('cat.preview', { cat: catName(c), n: p }));
      } else {
        val.textContent = rolled && !busy ? '–' : '';
        b.setAttribute('aria-label', t(rolled ? 'cat.locked' : 'cat.open', { cat: catName(c) }));
      }
    });
    const up = E.upperSum(game);
    const upDone = E.UPPER.every((c) => game.scores[c] !== null);
    $('upper-sum').textContent = num(up);
    $('lower-sum').textContent = num(E.lowerSum(game));
    const ub = $('upper-bonus');
    ub.textContent = E.upperBonus(game) ? '+' + E.UPPER_BONUS : upDone ? '0' : num(up) + '/' + E.UPPER_TARGET;
    ub.classList.toggle('hit', !!E.upperBonus(game));
    const ex = $('extra');
    ex.textContent = game.bonus ? '+' + num(E.yachtBonus(game)) : '0';
    ex.classList.toggle('hit', game.bonus > 0);
    $('grand').textContent = num(E.total(game));

    const canHold = rolled && E.canRoll(game);
    dieEls.forEach((el, i) => {
      if (!el.classList.contains('rolling')) el.querySelector('.face').dataset.face = String(game.dice[i]);
      el.classList.toggle('held', !!game.held[i]);
      el.classList.toggle('idle', !rolled);
      el.classList.toggle('fixed', rolled && !canHold);
      el.setAttribute('aria-pressed', String(!!game.held[i]));
      el.setAttribute('aria-label', t(game.held[i] ? 'dice.held' : 'dice.die', { i: i + 1, face: game.dice[i] }));
    });

    const left = E.MAX_ROLLS - game.rolls;
    const roll = $('btn-roll');
    roll.disabled = busy || !E.canRoll(game);
    $('roll-text').textContent = t(E.canRoll(game) || E.isDone(game) ? 'ctl.roll' : 'ctl.pick');
    roll.setAttribute('aria-label', E.canRoll(game) ? t('ctl.rollAria', { n: left }) : t('ctl.pick'));
    Array.from($('roll-pips').children).forEach((p, i) => p.classList.toggle('on', i < left && !E.isDone(game)));
    $('btn-undo').hidden = !undoState;
    $('sheet').classList.toggle('waiting', !rolled);
  }

  /* ---------------- Lưu ---------------- */
  const inPlay = () => game && E.started(game) && !E.isDone(game);
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    const avg = stats.games ? Math.round(stats.sum / stats.games) : null;
    const st = [];
    if (stats.best != null) st.push({ value: num(stats.best), label: t('hud.best') });
    if (avg != null) st.push({ value: num(avg), label: t('summary.avg') });
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: stats.won,
      note: stats.best == null ? t('summary.none') : t('summary.note', { n: num(stats.best) }),
      stats: st,
      resume: inPlay() ? { title: t('app.name'), detail: t('summary.resume', { r: E.round(game), n: num(E.total(game)) }), pct: E.filled(game) / E.CATS.length } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Hiệu ứng lắc: viên bay lộn vài vòng, mặt đổi liên tục rồi dừng ở kết quả ---------------- */
  function tumble(indices) {
    return new Promise((resolve) => {
      if (reduced() || !indices.length) return resolve();
      const els = indices.map((i) => dieEls[i]);
      els.forEach((el, k) => {
        el.classList.remove('land');
        el.style.setProperty('--spin', (Math.random() < 0.5 ? -1 : 1) * (300 + Math.floor(Math.random() * 160)) + 'deg');
        el.style.setProperty('--hop', -(14 + Math.floor(Math.random() * 14)) + 'px');
        el.style.setProperty('--delay', k * 35 + 'ms');
        el.classList.add('rolling');
      });
      const face = (el) => el.querySelector('.face');
      const timer = setInterval(() => {
        els.forEach((el) => { face(el).dataset.face = String(1 + Math.floor(Math.random() * 6)); });
      }, 70);
      setTimeout(() => {
        clearInterval(timer);
        els.forEach((el) => {
          el.classList.remove('rolling');
          void el.offsetWidth; // chạy lại hiệu ứng chạm bàn
          el.classList.add('land');
        });
        resolve();
      }, 620);
    });
  }

  /* ---------------- Luồng ván ---------------- */
  function newGame() {
    game = E.newGame((Math.random() * 4294967296) >>> 0);
    undoState = null;
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    render();
    writeSummary();
  }

  async function doRoll() {
    if (busy || !game || !E.canRoll(game) || kit.modal.current()) return;
    const prev = game;
    game = E.roll(game);
    undoState = null;
    persist(); // lưu ngay kết quả lắc: tải lại trang không lắc lại được
    const moving = [0, 1, 2, 3, 4].filter((i) => prev.rolls === 0 || !prev.held[i]);
    kit.sfx('flip');
    busy = !reduced();
    render();
    await tumble(moving);
    busy = false;
    kit.sfx('drop');
    render();
    if (game.dice.every((d) => d === game.dice[0])) {
      kit.sfx('combo');
      kit.toast(t('toast.yacht'));
    }
  }

  function hold(i) {
    if (busy || !game || kit.modal.current()) return;
    if (game.rolls === 0) return hint('toast.rollFirst');
    if (!E.canRoll(game)) return hint('toast.noRolls');
    game = E.toggleHold(game, i);
    kit.sfx('tap');
    persist();
    render();
  }

  function hint(key, params) {
    kit.sfx('error');
    kit.toast(t(key, params));
  }

  function pick(cat) {
    if (busy || !game || kit.modal.current() || E.isDone(game)) return;
    if (game.rolls === 0) return hint('toast.rollFirst');
    if (game.scores[cat] !== null) return hint('toast.used');
    if (!E.legal(game, cat)) {
      const face = E.UPPER[game.dice[0] - 1];
      return game.scores[face] === null ? hint('toast.joker', { cat: catName(face) }) : hint('toast.jokerLower');
    }
    const before = game;
    game = E.score(game, cat);
    undoState = E.isDone(game) ? null : before;
    const pts = game.scores[cat];
    if (game.bonus > before.bonus) {
      kit.sfx('coin');
      kit.toast(t('toast.extra'));
    } else if (!E.upperBonus(before) && E.upperBonus(game)) {
      kit.sfx('levelup');
      kit.toast(t('toast.bonus'));
    } else if (cat === 'yacht' && pts) {
      kit.sfx('combo');
    } else {
      kit.sfx(pts ? 'place' : 'drop');
    }
    const row = rows[cat];
    row.classList.remove('just');
    void row.offsetWidth;
    row.classList.add('just');
    persist();
    render();
    if (E.isDone(game)) finish();
  }

  function undo() {
    if (!undoState || busy || kit.modal.current()) return;
    game = undoState;
    undoState = null;
    kit.sfx('move');
    persist();
    render();
  }

  function finish() {
    const total = E.total(game);
    const won = total >= E.WIN_SCORE;
    const best = stats.best == null || total > stats.best;
    stats.played++;
    stats.games++;
    stats.sum += total;
    if (won) stats.won++;
    if (best) stats.best = total;
    if (game.scores.yacht === 50) stats.yachts += 1 + game.bonus;
    if (E.upperBonus(game)) stats.bonus++;
    saveStats();
    persist();
    kit.sdk.end({ mode: MODE, won, score: total, assisted: false });
    $('end-total').textContent = num(total);
    $('end-upper').textContent = num(E.upperSum(game));
    $('end-bonus').textContent = num(E.upperBonus(game));
    $('end-lower').textContent = num(E.lowerSum(game));
    $('end-extra').textContent = num(E.yachtBonus(game));
    const badge = $('end-badge');
    badge.hidden = !won && !best;
    badge.textContent = t(won && best ? 'end.wonBest' : won ? 'end.won' : 'end.best');
    badge.classList.toggle('good', won);
    render();
    const ended = game;
    setTimeout(() => {
      if (game !== ended) return; // đã bấm ván mới trong lúc chờ
      kit.sfx(won ? 'win' : 'clear');
      if (won) kit.confetti();
      kit.modal.open('modal-end');
    }, reduced() ? 0 : 500);
  }

  /** Ván đang dở (đã lắc) thì hỏi trước, vì bỏ ván là kết thúc với điểm hiện có. */
  function requestNew() {
    if (busy) return;
    if (inPlay()) {
      $('confirm-text').textContent = t('confirm.text', { n: num(E.total(game)) });
      kit.modal.open('modal-confirm');
    } else newGame();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inPlay()) {
      stats.played++;
      saveStats();
      kit.sdk.end({ mode: MODE, won: false, score: E.total(game), assisted: false });
    }
    newGame();
  }

  function fillStats() {
    $('stats-played').textContent = num(stats.played);
    $('stats-won').textContent = num(stats.won);
    $('stats-best').textContent = stats.best == null ? '–' : num(stats.best);
    $('stats-avg').textContent = stats.games ? num(Math.round(stats.sum / stats.games)) : '–';
    $('stats-yachts').textContent = num(stats.yachts);
    $('stats-bonus').textContent = num(stats.bonus);
  }

  /* ---------------- Sự kiện ---------------- */
  buildSheet();
  buildDice();
  $('btn-roll').addEventListener('click', doRoll);
  $('btn-undo').addEventListener('click', undo);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-end');
    newGame();
  });
  $('btn-stats').addEventListener('click', fillStats);
  document.addEventListener('keydown', (e) => {
    if (kit.modal.current()) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.altKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const onButton = e.target.closest && e.target.closest('.cat, #btn-roll, #btn-undo');
    // Space trên ô / nút đang focus là cú bấm của trình duyệt (ghi ô, lắc, hoàn tác): không lắc thêm
    if (k === ' ' && !onButton) doRoll();
    else if (k === 'r') doRoll();
    else if (k >= '1' && k <= '5' && k.length === 1) hold(Number(k) - 1);
    else if (k === 'u') undo();
    else if (k === 'n') requestNew();
    else return;
    e.preventDefault();
  });
  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && E.fromJSON(saved.game);
  if (restored && E.started(restored) && !E.isDone(restored)) {
    game = restored;
    kit.sdk.start(MODE, true);
    kit.toast(t('toast.saved'));
    render();
    writeSummary();
  } else {
    newGame();
  }
})();
