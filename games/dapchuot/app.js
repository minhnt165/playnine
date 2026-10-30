/* =====================================================================
 * Đập Chuột - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vẽ bằng DOM + SVG: 9 hang là nút, chuột là SVG dựng sẵn trong mỗi hang, chỉ đổi lớp và translateY.
 *   - Vòng lặp requestAnimationFrame, dt giới hạn 100 ms (tab vừa quay lại), tiến engine theo bước cố định 10 ms.
 *   - Trạng thái: 'idle' (màn chờ) | 'playing' | 'paused' | 'over'. Tự tạm dừng khi trang ẩn hoặc mở hộp thoại.
 *   Báo ván cho cổng (metric score_high, mode classic):
 *   - Ván mới: kit.sdk.start(MODE) khi bấm Bắt đầu; mở lại ván lưu dở: kit.sdk.start(MODE, true)
 *   - Hết 60 giây: kit.sdk.end({ mode, won: false, score, assisted: false })
 *   - Bỏ ván khi đã có điểm hoặc đã chơi ≥ 1 giây: kit.sdk.end({ mode, won: false, score }); chưa thì không gửi gì
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const STEP = 10; // bước mô phỏng cố định (ms)
  const MAX_DT = 100; // tab vừa quay lại: không nhảy cóc
  const RISE = 120; // ms chuột trồi lên
  const FALL = 140; // ms chuột lặn xuống trước giờ lặn
  const HIT_HOLD = 110; // chuột bị đập đứng choáng một chút rồi mới lặn
  const HIT_SINK = 220;
  const OVER_DELAY = 650; // hết giờ: chờ một chút rồi mới hiện bảng kết quả

  const kit = PNKit.init({
    gameId: 'dapchuot',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { vibrate: true, guideSeen: false },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const settings = () => kit.settings.get();
  const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const fmtN = (n) => kit.i18n.fmtNumber(n);

  /* Phím: theo vị trí trên bàn phím (e.code) nên bàn phím AZERTY / QWERTZ vẫn đúng lưới */
  const KEYMAP = {
    KeyQ: 0, KeyW: 1, KeyE: 2, KeyA: 3, KeyS: 4, KeyD: 5, KeyZ: 6, KeyX: 7, KeyC: 8,
    Numpad7: 0, Numpad8: 1, Numpad9: 2, Numpad4: 3, Numpad5: 4, Numpad6: 5, Numpad1: 6, Numpad2: 7, Numpad3: 8,
    Digit7: 0, Digit8: 1, Digit9: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit1: 6, Digit2: 7, Digit3: 8,
  };
  const KEY_LABELS = [['Q', '7'], ['W', '8'], ['E', '9'], ['A', '4'], ['S', '5'], ['D', '6'], ['Z', '1'], ['X', '2'], ['C', '3']];

  const statsDefault = { played: 0, best: null, bestStreak: 0, whacked: 0 };
  const stats = Object.assign({}, statsDefault, kit.store.read(keys.stats, {}) || {});

  let game = null;
  let mode = 'idle';
  let overShown = false;

  /* ---------------- Hình chuột (SVG gốc, vẽ tay) ---------------- */
  // Một SVG cho mọi loại; lớp trên hang (k-mole, k-gold, k-helmet, k-bomb, bare, hurt) quyết định phần nào hiện.
  const MOLE_SVG =
    '<svg class="mole-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
    '<g class="m-mole">' +
    '<circle class="m-fur" cx="23" cy="29" r="8"/><circle class="m-ear-in" cx="23" cy="29" r="4"/>' +
    '<circle class="m-fur" cx="77" cy="29" r="8"/><circle class="m-ear-in" cx="77" cy="29" r="4"/>' +
    '<path class="m-fur" d="M15 104V56C15 27 33 11 50 11S85 27 85 56v48z"/>' +
    '<ellipse class="m-belly" cx="50" cy="82" rx="23" ry="25"/>' +
    '<g class="m-eyes"><ellipse cx="38" cy="43" rx="7.5" ry="8.5" fill="#fff"/><ellipse cx="62" cy="43" rx="7.5" ry="8.5" fill="#fff"/>' +
    '<circle cx="39.5" cy="45" r="4.2" fill="#24160c"/><circle cx="60.5" cy="45" r="4.2" fill="#24160c"/>' +
    '<circle cx="41" cy="43" r="1.5" fill="#fff"/><circle cx="62" cy="43" r="1.5" fill="#fff"/></g>' +
    '<g class="m-eyes-x" stroke="#24160c" stroke-width="3" stroke-linecap="round"><path d="M33 39l9 9M42 39l-9 9M58 39l9 9M67 39l-9 9"/></g>' +
    '<ellipse class="m-cheek" cx="27" cy="58" rx="6" ry="4"/><ellipse class="m-cheek" cx="73" cy="58" rx="6" ry="4"/>' +
    '<path d="M24 57l-12-2M24 61l-12 3M76 57l12-2M76 61l12 3" stroke="#24160c" stroke-opacity=".45" stroke-width="1.6" stroke-linecap="round"/>' +
    '<rect x="45" y="63" width="4.6" height="7" rx="1.4" fill="#fff" stroke="#c9b9a8" stroke-width=".8"/>' +
    '<rect x="50.4" y="63" width="4.6" height="7" rx="1.4" fill="#fff" stroke="#c9b9a8" stroke-width=".8"/>' +
    '<ellipse class="m-nose" cx="50" cy="57" rx="8" ry="6"/><ellipse cx="47.5" cy="55" rx="2.6" ry="1.6" fill="#fff" opacity=".6"/>' +
    '<ellipse class="m-paw" cx="30" cy="94" rx="10" ry="6.5"/><ellipse class="m-paw" cx="70" cy="94" rx="10" ry="6.5"/>' +
    '</g>' +
    '<g class="m-helmet"><path d="M19 37C19 11 81 11 81 37z" fill="#ffc21a" stroke="#b97f00" stroke-width="2"/>' +
    '<path d="M44 14h12v23H44z" fill="#ffdc5e"/><rect x="11" y="33" width="78" height="9" rx="4.5" fill="#f2a900" stroke="#b97f00" stroke-width="2"/>' +
    '<circle cx="50" cy="25" r="5" fill="#fff6c8" stroke="#b97f00" stroke-width="1.5"/></g>' +
    '<g class="m-shine" fill="#fff8c4"><path d="M12 18l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z"/><path d="M88 8l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2z"/><path d="M90 52l1.6 3.6 3.6 1.6-3.6 1.6-1.6 3.6-1.6-3.6-3.6-1.6 3.6-1.6z"/></g>' +
    '<g class="m-bomb">' +
    '<circle cx="50" cy="64" r="31" fill="#2a2e45"/><circle cx="50" cy="64" r="31" fill="none" stroke="#ff4d4d" stroke-width="3" stroke-dasharray="6 6" opacity=".9"/>' +
    '<ellipse cx="38" cy="50" rx="9" ry="6" fill="#fff" opacity=".2" transform="rotate(-30 38 50)"/>' +
    '<rect x="41" y="27" width="18" height="10" rx="3" fill="#5c6380"/>' +
    '<path d="M50 27c0-10 9-12 14-19" fill="none" stroke="#b98a5a" stroke-width="3.5" stroke-linecap="round"/>' +
    '<g class="m-spark"><circle cx="65" cy="7" r="6" fill="#ffb02e"/><circle cx="65" cy="7" r="3" fill="#fff6b0"/></g>' +
    '<path d="M33 55l13 5M67 55l-13 5" stroke="#ff5a4f" stroke-width="4" stroke-linecap="round"/>' +
    '<circle cx="41" cy="66" r="4.5" fill="#fff"/><circle cx="59" cy="66" r="4.5" fill="#fff"/>' +
    '<path d="M42 80q8-6 16 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' +
    '</g>' +
    '<g class="m-stars" fill="#ffd23f" stroke="#b97f00" stroke-width="1"><path d="M30 6l2 4 4.5.6-3.3 3 .8 4.4-4-2.1-4 2.1.8-4.4-3.3-3 4.5-.6z"/><path d="M70 4l2 4 4.5.6-3.3 3 .8 4.4-4-2.1-4 2.1.8-4.4-3.3-3 4.5-.6z"/></g>' +
    '</svg>';

  // Búa gỗ đầu đỏ: đầu búa ở (40, 40), cán chéo xuống góc phải dưới; xoay quanh đuôi cán khi đập
  const HAMMER_SVG =
    '<svg viewBox="0 0 120 120" aria-hidden="true">' +
    '<path d="M44 44l60 60" stroke="#7a4a22" stroke-width="13" stroke-linecap="round"/>' +
    '<path d="M44 44l60 60" stroke="#c98a4b" stroke-width="8" stroke-linecap="round"/>' +
    '<path d="M86 86l18 18" stroke="#3b2a4a" stroke-width="13" stroke-linecap="round"/>' +
    '<g transform="rotate(-45 40 40)">' +
    '<rect x="8" y="24" width="64" height="32" rx="9" fill="#e5483d" stroke="#8e1f1a" stroke-width="3"/>' +
    '<rect x="14" y="28" width="52" height="8" rx="4" fill="#fff" opacity=".3"/>' +
    '<rect x="2" y="21" width="12" height="38" rx="5" fill="#d8dee8" stroke="#5c6380" stroke-width="3"/>' +
    '<rect x="66" y="21" width="12" height="38" rx="5" fill="#d8dee8" stroke="#5c6380" stroke-width="3"/>' +
    '</g></svg>';

  const HAT_SVG =
    '<svg viewBox="8 8 84 38" aria-hidden="true"><path d="M19 37C19 11 81 11 81 37z" fill="#ffc21a" stroke="#b97f00" stroke-width="2"/>' +
    '<path d="M44 14h12v23H44z" fill="#ffdc5e"/><rect x="11" y="33" width="78" height="9" rx="4.5" fill="#f2a900" stroke="#b97f00" stroke-width="2"/></svg>';

  /* ---------------- Dựng bàn ---------------- */
  const field = $('field');
  const board = $('board');
  const fx = $('fx');
  const holes = [];
  for (let h = 0; h < 9; h++) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'hole';
    el.tabIndex = -1;
    el.dataset.hole = String(h);
    el.setAttribute('aria-label', t('hole.label', { n: h + 1, k: KEY_LABELS[h][0] }));
    el.innerHTML =
      '<span class="pit"></span><span class="mole-clip"><span class="mole">' + MOLE_SVG + '</span></span>' +
      '<span class="lip"></span><span class="keycap" aria-hidden="true"><b>' + KEY_LABELS[h][0] + '</b><i>' + KEY_LABELS[h][1] + '</i></span>';
    board.appendChild(el);
    holes.push({ el, mole: el.querySelector('.mole'), cls: '', y: -1 });
  }
  document.querySelectorAll('.legend-art').forEach((el) => {
    el.innerHTML = MOLE_SVG;
    el.classList.add('k-' + el.dataset.kind);
  });

  /* ---------------- Hiệu ứng ---------------- */
  const anim = new Array(9).fill(null); // chuột vừa bị đập: { kind, bare, t } theo giờ trong ván
  const knockAt = new Array(9).fill(-1e9); // lúc hất mũ (giờ trong ván) để chuột nhăn mặt một chút

  function buzz(pattern) {
    if (!settings().vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* bỏ qua */ }
  }

  /** Tâm đầu chuột ở hang h, tính theo khung bàn chơi. */
  function holePoint(h) {
    const f = field.getBoundingClientRect();
    const r = holes[h].el.getBoundingClientRect();
    return { x: r.left - f.left + r.width / 2, y: r.top - f.top + r.height * 0.42, w: r.width };
  }

  function addFx(cls, p, html, life, size) {
    const el = document.createElement('div');
    el.className = 'fx-item ' + cls;
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    if (size) el.style.setProperty('--s', size + 'px');
    if (html) el.innerHTML = html;
    fx.appendChild(el);
    setTimeout(() => el.remove(), reduceMotion.matches ? Math.min(life, 350) : life);
    return el;
  }

  function hammer(h, kind) {
    const p = holePoint(h);
    addFx('hammer' + (kind ? ' hammer-' + kind : ''), p, HAMMER_SVG, 330, Math.round(p.w * 0.95));
    return p;
  }

  function shake(cls) {
    if (reduceMotion.matches) return;
    field.classList.remove('shake', 'shake-big');
    void field.offsetWidth; // chạy lại hiệu ứng
    field.classList.add(cls);
  }

  let bannerTimer = 0;
  function banner(text, cls) {
    const el = $('banner');
    el.textContent = text;
    el.className = 'banner show' + (cls ? ' ' + cls : '');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { el.className = 'banner'; }, 900);
  }

  function clearFx() {
    fx.textContent = '';
    anim.fill(null);
    knockAt.fill(-1e9);
    $('banner').className = 'banner';
    field.classList.remove('shake', 'shake-big');
  }

  const say = (msg) => { $('sr').textContent = msg; };

  /* ---------------- Vẽ ---------------- */
  const easeOut = (x) => 1 - (1 - x) * (1 - x);

  function renderHoles() {
    for (let h = 0; h < 9; h++) {
      let kind = '';
      let y = 1;
      let hurt = false;
      let bare = false;
      const i = game ? E.visibleAt(game, h) : -1;
      if (i >= 0) {
        const s = game.spawns[i];
        kind = s.kind;
        bare = kind === 'helmet' && game.hp[i] > 0;
        hurt = bare && game.t - knockAt[h] < 220;
        const up = Math.max(0, Math.min(1, (game.t - s.at) / RISE, (game.end[i] - game.t) / FALL));
        y = 1 - easeOut(up);
      } else if (anim[h] && game) {
        const a = anim[h];
        const dt = game.t - a.t;
        if (dt >= 0 && dt < HIT_HOLD + HIT_SINK) {
          kind = a.kind;
          bare = a.bare;
          hurt = true;
          y = dt < HIT_HOLD ? 0 : (dt - HIT_HOLD) / HIT_SINK;
          y = y * y;
        } else anim[h] = null;
      }
      const v = holes[h];
      const cls = 'hole' + (kind ? ' k-' + kind : '') + (bare ? ' bare' : '') + (hurt ? ' hurt' : '') + (kind && y < 0.6 ? ' up' : '');
      if (cls !== v.cls) {
        v.el.className = cls;
        v.cls = cls;
      }
      const yy = Math.round(y * 1000) / 10;
      if (yy !== v.y) {
        v.mole.style.transform = 'translateY(' + yy + '%)';
        v.y = yy;
      }
    }
  }

  /** m:ss, làm tròn lên (60 giây đầu hiện 1:00) */
  function fmtTime(ms) {
    const s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  const hud = { score: -1, time: '', mult: -1, streak: -1, best: '', hurry: null, pause: '' };
  function renderHud() {
    const score = game ? game.score : 0;
    const left = game ? E.timeLeft(game) : E.ROUND_MS;
    if (score !== hud.score) {
      $('score').textContent = fmtN(score);
      hud.score = score;
    }
    const time = fmtTime(left);
    if (time !== hud.time) {
      $('time').textContent = time;
      hud.time = time;
    }
    $('time-fill').style.transform = 'scaleX(' + (left / E.ROUND_MS).toFixed(4) + ')';
    const hurry = mode === 'playing' && left <= 5000;
    if (hurry !== hud.hurry) {
      $('time-box').classList.toggle('hurry', hurry);
      hud.hurry = hurry;
    }
    const streak = game ? game.streak : 0;
    const mult = E.multiplier(streak);
    if (mult !== hud.mult || streak !== hud.streak) {
      $('mult').textContent = '×' + mult;
      $('streak').textContent = String(streak);
      $('combo-box').className = 'hud-box hud-combo tier-' + mult;
      hud.mult = mult;
      hud.streak = streak;
    }
    const best = stats.best == null ? '–' : fmtN(stats.best);
    if (best !== hud.best) {
      $('best').textContent = best;
      hud.best = best;
    }
    const open = mode === 'playing' || mode === 'paused';
    const ps = (open ? 'o' : 'c') + mode;
    if (ps !== hud.pause) {
      const btn = $('btn-pause');
      btn.disabled = !open;
      btn.dataset.state = mode === 'paused' ? 'paused' : 'running';
      const label = mode === 'paused' ? t('btn.resume') : t('btn.pause');
      btn.setAttribute('aria-label', label);
      btn.title = t('btn.keySuffix', { label });
      hud.pause = ps;
    }
    $('stun').hidden = !(game && open && E.isStunned(game));
    board.classList.toggle('stunned', !!(game && open && E.isStunned(game)));
  }

  function render() {
    renderHoles();
    renderHud();
  }

  function showOverlay(name) {
    ['start', 'pause', 'over'].forEach((n) => { $('overlay-' + n).hidden = n !== name; });
    overShown = name === 'over';
  }

  /* ---------------- Lưu ---------------- */
  const hasProgress = () => !!game && !E.isOver(game) && (game.score > 0 || game.t >= 1000);
  const inRound = () => (mode === 'playing' || mode === 'paused') && !!game && !E.isOver(game);

  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    const resume = inRound() && game.t > 0;
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: 0,
      note: stats.best == null ? t('summary.none') : t('summary.note', { score: fmtN(stats.best) }),
      stats: stats.best == null ? [] : [{ value: fmtN(stats.best), label: t('hud.best') }],
      resume: resume
        ? { title: t('app.name'), detail: t('summary.resume', { score: fmtN(game.score), time: fmtTime(E.timeLeft(game)) }), pct: game.t / E.ROUND_MS }
        : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inRound() && game.t > 0) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Vòng lặp ---------------- */
  let raf = 0;
  let last = 0;
  let acc = 0;
  let lastSec = 0;

  function kick() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    if (mode === 'playing') {
      if (kit.modal.current() || document.hidden) {
        pause(false);
        return;
      }
      acc += Math.min(MAX_DT, Math.max(0, now - last));
      const ms = Math.floor(acc / STEP) * STEP;
      acc -= ms;
      if (ms > 0) {
        const r = E.advance(game, ms);
        game = r.game;
        onEvents(r.events);
      }
    }
    last = now;
    render();
    if (mode === 'playing') raf = requestAnimationFrame(frame);
  }

  function onEvents(events) {
    events.forEach((ev) => {
      if (ev.type === 'up') {
        const kind = game.spawns[ev.i].kind;
        if (kind === 'gold') kit.sfx('pop', { pitch: 1.6, volume: 0.45 });
        else if (kind === 'bomb') kit.sfx('tick', { pitch: 0.7, volume: 0.35 });
        else kit.sfx('pop', { pitch: 0.9 + ((ev.i * 37) % 30) / 100, volume: 0.22 });
      } else if (ev.type === 'over') finish();
    });
    // Đếm ngược 5 giây cuối
    const sec = Math.ceil(E.timeLeft(game) / 1000);
    if (mode === 'playing' && sec !== lastSec && sec <= 5 && sec > 0) {
      kit.sfx('tick', { pitch: sec === 1 ? 1.3 : 1 });
      if (sec === 5) banner(t('fx.hurry'), 'hurry');
    }
    lastSec = sec;
  }

  /* ---------------- Luồng ván ---------------- */
  function startRound() {
    kit.modal.close('modal-confirm');
    game = E.newGame(Math.floor(Math.random() * 0x100000000) >>> 0);
    mode = 'playing';
    acc = 0;
    lastSec = 60;
    clearFx();
    kit.store.remove(keys.save);
    kit.sdk.start(MODE);
    showOverlay(null);
    banner(t('fx.go'), 'go');
    kit.sfx('start');
    render();
    writeSummary();
    kick();
  }

  function pause(focus) {
    if (mode !== 'playing') return;
    mode = 'paused';
    acc = 0;
    showPaused();
    persist();
    say(t('say.paused'));
    if (focus && !kit.modal.current()) $('btn-resume').focus();
  }

  function showPaused() {
    $('pause-sub').textContent = t('pause.sub', { score: fmtN(game.score), time: fmtTime(E.timeLeft(game)) });
    showOverlay('pause');
    render();
  }

  function resume() {
    if (mode !== 'paused' || kit.modal.current()) return;
    mode = 'playing';
    showOverlay(null);
    kit.sfx('tap', { pitch: 1.15 });
    render();
    kick();
  }

  function togglePause() {
    if (mode === 'playing') pause(true);
    else if (mode === 'paused') resume();
  }

  let overTimer = 0;
  function finish() {
    mode = 'over';
    const score = game.score;
    const record = score > 0 && (stats.best == null || score > stats.best);
    stats.played++;
    stats.whacked += game.whacked;
    stats.bestStreak = Math.max(stats.bestStreak, game.bestStreak);
    if (stats.best == null || score > stats.best) stats.best = score;
    saveStats();
    persist(); // ván đã xong: xóa ván lưu, resume = null
    kit.sdk.end({ mode: MODE, won: false, score, assisted: false });
    kit.sfx(record ? 'win' : 'clear');
    if (record) kit.confetti();
    buzz([40, 40, 80]);
    $('over-score').textContent = fmtN(score);
    $('over-best').hidden = !record;
    $('over-whacked').textContent = fmtN(game.whacked);
    $('over-combo').textContent = fmtN(game.bestStreak);
    const tries = game.whacked + game.whiffs + game.bombs;
    $('over-acc').textContent = tries ? Math.round((game.whacked / tries) * 100) + '%' : '–';
    say(t('say.over', { score: fmtN(score) }));
    clearTimeout(overTimer);
    overTimer = setTimeout(() => {
      if (mode !== 'over') return;
      anim.fill(null);
      render();
      showOverlay('over');
      if (!kit.modal.current()) $('btn-again').focus();
    }, reduceMotion.matches ? 0 : OVER_DELAY);
  }

  /** Ván đang dở (đã có điểm hoặc chơi ≥ 1 giây) thì hỏi trước, vì bỏ ván vẫn báo về cổng. */
  function requestNew() {
    if (inRound() && hasProgress()) {
      pause(false);
      $('confirm-text').textContent = t('confirm.text', { score: fmtN(game.score) });
      kit.modal.open('modal-confirm');
      return;
    }
    startRound();
  }

  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inRound() && hasProgress()) {
      stats.played++;
      stats.whacked += game.whacked;
      stats.bestStreak = Math.max(stats.bestStreak, game.bestStreak);
      saveStats();
      kit.sdk.end({ mode: MODE, won: false, score: game.score, assisted: false });
    }
    startRound();
  }

  /* ---------------- Đập ---------------- */
  function hit(h) {
    if (mode !== 'playing' || !game) return;
    const before = game.streak;
    const r = E.whack(game, h);
    game = r.game;
    const res = r.result;
    if (res.type === 'stunned') {
      kit.sfx('tap', { pitch: 0.5, volume: 0.3 });
      $('stun').classList.remove('wobble');
      void $('stun').offsetWidth;
      $('stun').classList.add('wobble');
      return;
    }
    if (res.type === 'over' || res.type === 'none') return;
    const p = hammer(h, res.type === 'miss' ? 'miss' : '');
    if (res.type === 'hit') {
      anim[h] = { kind: res.kind, bare: res.kind === 'helmet', t: game.t };
      addFx('burst' + (res.kind === 'gold' ? ' burst-gold' : ''), p, '', 420, Math.round(p.w * 0.9));
      addFx('pop-text m' + res.mult + (res.kind === 'gold' ? ' gold' : ''), p, '+' + res.points, 800);
      if (res.kind === 'gold') kit.sfx('coin');
      else kit.sfx('capture', { pitch: 0.9 + 0.12 * res.mult });
      buzz(res.kind === 'gold' ? [20, 30, 20] : 15);
      shake('shake');
      if (E.multiplier(game.streak) > E.multiplier(before)) {
        banner(t('fx.combo', { n: E.multiplier(game.streak) }), 'combo tier-' + E.multiplier(game.streak));
        kit.sfx('combo');
      }
    } else if (res.type === 'helmet') {
      knockAt[h] = game.t;
      addFx('burst burst-metal', p, '', 380, Math.round(p.w * 0.8));
      addFx('hat', { x: p.x, y: p.y - p.w * 0.18 }, HAT_SVG, 700, Math.round(p.w * 0.62));
      kit.sfx('place', { pitch: 1.6 });
      buzz(10);
      if (E.multiplier(game.streak) > E.multiplier(before)) {
        banner(t('fx.combo', { n: E.multiplier(game.streak) }), 'combo tier-' + E.multiplier(game.streak));
        kit.sfx('combo');
      }
    } else if (res.type === 'bomb') {
      addFx('boom', { x: p.x, y: p.y + p.w * 0.1 }, '', 700, Math.round(p.w * 1.5));
      addFx('pop-text bad', p, '−' + res.penalty, 900);
      kit.sfx('error');
      kit.sfx('drop', { pitch: 0.6 });
      buzz([60, 40, 100]);
      shake('shake-big');
      if (before > 0) bumpCombo();
    } else if (res.type === 'miss') {
      addFx('dust', { x: p.x, y: p.y + p.w * 0.36 }, '<i></i><i></i><i></i>', 450, Math.round(p.w * 0.7));
      kit.sfx('tap', { pitch: 0.7, volume: 0.6 });
      if (before > 0) bumpCombo();
    }
    render();
  }

  function bumpCombo() {
    const el = $('combo-box');
    el.classList.remove('lost');
    void el.offsetWidth;
    el.classList.add('lost');
  }

  /* ---------------- Sự kiện ---------------- */
  board.addEventListener('pointerdown', (e) => {
    const el = e.target.closest && e.target.closest('.hole');
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); // không lấy focus, không chọn chữ, không phóng to khi chạm đúp
    hit(Number(el.dataset.hole));
  });
  board.addEventListener('contextmenu', (e) => e.preventDefault());

  $('btn-start').addEventListener('click', startRound);
  $('overlay-start').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    startRound();
  });
  $('btn-resume').addEventListener('click', resume);
  $('btn-again').addEventListener('click', startRound);
  $('btn-pause').addEventListener('click', togglePause);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = fmtN(stats.played);
    $('stats-best').textContent = stats.best == null ? '–' : fmtN(stats.best);
    $('stats-combo').textContent = fmtN(stats.bestStreak);
    $('stats-whacked').textContent = fmtN(stats.whacked);
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const h = KEYMAP[e.code];
    if (h !== undefined) {
      e.preventDefault();
      if (!e.repeat) hit(h);
      return;
    }
    const k = e.key;
    if (k === ' ' || k === 'Enter') {
      // Space / Enter trên một nút đang focus là cú bấm của chính nút đó
      const tgt = e.target;
      if (tgt && tgt.closest && tgt.closest('button, input, a')) return;
      if (mode === 'idle') startRound();
      else if (mode === 'paused') resume();
      else if (mode === 'over' && overShown) startRound();
      else return;
    } else if (k === 'p' || k === 'P' || k === 'Escape') {
      if (mode !== 'playing' && mode !== 'paused') return;
      togglePause();
    } else if (k === 'n' || k === 'N') requestNew();
    else return;
    e.preventDefault();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause(false);
  });
  kit.onLeave(persist);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && !E.isOver(restored) && restored.t > 0) {
    game = restored;
    mode = 'paused';
    lastSec = Math.ceil(E.timeLeft(game) / 1000);
    kit.sdk.start(MODE, true);
    showPaused();
    kit.toast(t('toast.saved'));
  } else {
    kit.store.remove(keys.save);
    showOverlay('start');
    render();
  }
  writeSummary();

  // Lần đầu mở: hướng dẫn ngắn
  if (!settings().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
})();
