/* =====================================================================
 * Bắn Phi Thuyền - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vẽ sân 240 x 360 (logic) lên <canvas> theo devicePixelRatio, co theo khung (tỉ lệ 2:3)
 *   - Vòng lặp: requestAnimationFrame + bước cố định 60 bước / giây của engine (giới hạn dt khi tab quay lại)
 *   - Điều khiển: ←/→ A/D, chuột (tàu theo con trỏ, nhấp / giữ để bắn), kéo tương đối ở bất kỳ đâu (cảm ứng),
 *     Space bắn, tự bắn (mặc định bật trên màn cảm ứng), P / Esc tạm dừng, N ván mới
 *   - Hiệu ứng: nền sao nhiều lớp trôi lệch nhau (parallax), nổ có mảnh vỡ, rung màn hình khi mất tàu;
 *     giảm chuyển động thì sao đứng yên, nổ chỉ là một chớp hình, không rung
 *   - Luật báo ván cho cổng (metric score_high, mode classic):
 *     bấm Bắt đầu: kit.sdk.start(MODE); mở lại ván lưu dở: kit.sdk.start(MODE, true)
 *     hết ván: kit.sdk.end({ mode, won: false, score }); bỏ ván khi đã có điểm hoặc đã chơi ≥ 1 giây: như hết ván
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const MODE = 'classic';
  const VERSION = '1.0.1';
  const coarse = window.matchMedia('(pointer: coarse)');
  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  const kit = PNKit.init({
    gameId: 'banphithuyen',
    version: VERSION,
    dict: window.GAME_DICT,
    defaults: { autofire: coarse.matches, vibrate: true, guideSeen: false },
    onSetting: (key) => {
      if (key === 'autofire') syncAuto();
    },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const settings = () => kit.settings.get();
  const fmt = (n) => kit.i18n.fmtNumber(n);
  const reduced = () => reduceMQ.matches;

  const MAX_CATCHUP = 8; // số bước mô phỏng tối đa trong một khung hình (máy giật thì bỏ bớt)
  const SAVE_EVERY = 5000; // ms, chu kỳ lưu ván khi đang chơi
  const LATCH = 12; // tick: một lần bấm bắn được "nhớ" chừng này để không lỡ khi đạn cũ vừa bay ra
  const DRAG_SENS = 1.5; // kéo cảm ứng: 1px ngón tay = 1,5px sân (theo bề ngang bàn)
  const MIN_PLAY_TICKS = 60; // bỏ ván sau ≥ 1 giây chơi (hoặc đã có điểm) thì tính là một ván

  // Bảng màu neon (sân luôn tối nên dùng chung cho cả giao diện sáng / tối)
  const COLORS = {
    alien: ['#37f0ff', '#ff5ad9', '#d4ff3a'],
    ufo: '#ff4d6d',
    player: '#4dff9c',
    shield: '#3cff8a',
    bullet: '#eafcff',
    bomb: '#ffb03a',
    ground: '#3cff8a',
    text: '#d9fbff',
  };

  /* ---------------- Hình điểm ảnh (vẽ riêng cho game này) ---------------- */
  const ART = {
    alien: [
      // 10 điểm (12 x 8): sứa
      [
        ['....####....', '..########..', '.##########.', '##..####..##', '############', '.#.#.##.#.#.', '.#.#.##.#.#.', '#..#....#..#'],
        ['....####....', '..########..', '.##########.', '##..####..##', '############', '.#.#.##.#.#.', '#..#.##.#..#', '.#..#..#..#.'],
      ],
      // 20 điểm (11 x 8): bọ kim cương
      [
        ['.....#.....', '....###....', '..#######..', '.##.#.#.##.', '###########', '..#.#.#.#..', '.#.#...#.#.', '#.........#'],
        ['.....#.....', '....###....', '..#######..', '.##.#.#.##.', '###########', '..#.#.#.#..', '..#.#.#.#..', '.#.......#.'],
      ],
      // 30 điểm (8 x 8): con mắt
      [
        ['...##...', '..####..', '.##..##.', '##.##.##', '.##..##.', '..####..', '.#.##.#.', '#......#'],
        ['...##...', '..####..', '.##..##.', '##.##.##', '.##..##.', '..####..', '.#.##.#.', '.#....#.'],
      ],
    ],
    player: ['.......#.......', '......###......', '......###......', '..#..#####..#..', '.#############.', '###############', '###############', '##.##.....##.##'],
    ufo: ['......####......', '....########....', '..############..', '.#.##.####.##.#.', '################', '.##############.', '...##......##...'],
    burst: ['#...#.#...#', '.#.......#.', '..#.#.#.#..', '##.......##', '..#.#.#.#..', '.#.......#.', '#...#.#...#'],
    bomb: [
      [['.#.', '#..', '.#.', '..#', '.#.', '#..', '.#.'], ['.#.', '..#', '.#.', '#..', '.#.', '..#', '.#.']],
      [['.#.', '.#.', '.#.', '.#.', '.#.', '###', '.#.'], ['.#.', '###', '.#.', '.#.', '.#.', '.#.', '.#.']],
      [['.#.', '###', '.#.', '.#.', '###', '.#.', '.#.'], ['.#.', '.#.', '###', '.#.', '.#.', '###', '.#.']],
    ],
  };

  /* ---------------- Trạng thái ---------------- */
  const statsRaw = kit.store.read(keys.stats, {}) || {};
  const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const stats = { played: num(statsRaw.played), best: num(statsRaw.best), bestWave: num(statsRaw.bestWave), kills: num(statsRaw.kills) };

  let game = null;
  let mode = 'ready'; // ready | playing | paused | over
  let recorded = false; // ván này đã báo kết thúc cho cổng chưa
  let overTimer = 0;

  // Input
  const keysDown = new Set();
  let target = null; // x đích của tàu (chuột / chạm), null = theo phím
  let fireHeld = false;
  let fireLatch = 0;
  let drag = null; // { id, x0, px0 }

  /* ---------------- Âm thanh, rung, thông báo ---------------- */
  const sfxLast = {};
  function sfx(name, opts, gap) {
    const now = performance.now();
    if (now - (sfxLast[name] || 0) < (gap || 40)) return;
    sfxLast[name] = now;
    kit.sfx(name, opts);
  }
  function vibrate(p) {
    if (!settings().vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(p);
    } catch (e) { /* bỏ qua */ }
  }
  function announce(text) {
    $('announcer').textContent = text;
  }
  let bannerTimer = 0;
  function banner(title, sub) {
    const el = $('banner');
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub || '';
    el.hidden = true;
    void el.offsetWidth; // chạy lại hiệu ứng
    el.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { el.hidden = true; }, 1600);
  }
  function hideBanner() {
    clearTimeout(bannerTimer);
    $('banner').hidden = true;
  }

  /* ---------------- Lưu ---------------- */
  const inPlay = () => !!game && (mode === 'playing' || mode === 'paused') && game.tick > 0 && !E.isOver(game);
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: 0,
      note: stats.best ? t('summary.note', { n: fmt(stats.best) }) : t('summary.none'),
      stats: stats.best
        ? [{ value: fmt(stats.best), label: t('hud.best') }, { value: fmt(stats.bestWave), label: t('hud.wave') }]
        : [],
      resume: inPlay() ? { title: t('app.name'), detail: t('summary.resume', { wave: game.wave, score: fmt(game.score) }) } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- HUD, lớp phủ ---------------- */
  let shownScore = -1;
  function updateHud() {
    if (!game) return;
    const sc = $('score');
    if (game.score !== shownScore) {
      sc.textContent = fmt(game.score);
      if (shownScore >= 0 && game.score > shownScore && !reduced()) {
        sc.classList.remove('bump');
        void sc.offsetWidth;
        sc.classList.add('bump');
      }
      shownScore = game.score;
    }
    $('best').textContent = fmt(Math.max(stats.best, recorded ? 0 : game.score));
    $('wave').textContent = fmt(game.wave);
    const pb = $('btn-pause');
    pb.disabled = !(mode === 'playing' || mode === 'paused');
    pb.dataset.state = mode === 'paused' ? 'paused' : 'playing';
    pb.setAttribute('aria-label', mode === 'paused' ? t('btn.resume') : t('btn.pause'));
  }
  function syncAuto() {
    $('btn-auto').setAttribute('aria-pressed', String(!!settings().autofire));
  }
  function showOverlay(name) {
    ['start', 'pause', 'over'].forEach((n) => { $('overlay-' + n).hidden = n !== name; });
  }
  function renderStartBest() {
    const el = $('start-best');
    el.hidden = !stats.best;
    if (stats.best) el.innerHTML = t('start.best', { n: '<b>' + fmt(stats.best) + '</b>' });
  }
  function focusBoard() {
    try {
      $('board').focus({ preventScroll: true });
    } catch (e) { /* bỏ qua */ }
  }

  /* ---------------- Luồng ván ---------------- */
  function newGame() {
    clearTimeout(overTimer);
    game = E.newGame({ seed: (Math.random() * 4294967296) >>> 0 });
    recorded = false;
    shownScore = -1;
    resetFx();
    hideBanner();
    shieldsDirty = true;
  }

  function startPlaying() {
    if (mode !== 'ready' && mode !== 'over') return;
    if (mode === 'over' || !game || game.tick > 0) newGame();
    mode = 'playing';
    releaseInput();
    showOverlay(null);
    kit.sdk.start(MODE);
    kit.sfx('start');
    banner(t('banner.wave', { n: game.wave }));
    announce(t('sr.wave', { n: game.wave }));
    updateHud();
    persist();
    focusBoard();
    kick();
  }

  function pause() {
    if (mode !== 'playing') return;
    mode = 'paused';
    releaseInput();
    $('pause-sub').textContent = t('pause.detail', { wave: fmt(game.wave), score: fmt(game.score) });
    showOverlay('pause');
    announce(t('sr.paused'));
    updateHud();
    persist();
  }
  function resume() {
    if (mode !== 'paused' || kit.modal.current()) return;
    mode = 'playing';
    showOverlay(null);
    updateHud();
    focusBoard();
    kick();
  }
  const togglePause = () => (mode === 'playing' ? pause() : resume());

  /** Ghi thống kê + báo cổng đúng một lần cho mỗi ván. Trả true nếu là kỷ lục mới. */
  function recordEnd() {
    if (recorded) return false;
    recorded = true;
    const best = game.score > stats.best;
    stats.played++;
    stats.kills += game.kills;
    if (best) stats.best = game.score;
    stats.bestWave = Math.max(stats.bestWave, game.wave);
    saveStats();
    kit.sdk.end({ mode: MODE, won: false, score: game.score, assisted: false });
    return best;
  }

  function gameOver(reason) {
    mode = 'over';
    releaseInput();
    const best = recordEnd() && game.score > 0;
    persist();
    kit.sfx('lose');
    vibrate([70, 50, 120]);
    announce(t('sr.over', { n: fmt(game.score) }));
    updateHud();
    $('over-score').textContent = fmt(game.score);
    $('over-wave').textContent = fmt(game.wave);
    $('over-kills').textContent = fmt(game.kills);
    $('over-record').hidden = !best;
    $('over-reason').hidden = reason !== 'invaded';
    clearTimeout(overTimer);
    overTimer = setTimeout(() => {
      if (mode !== 'over') return;
      hideBanner();
      showOverlay('over');
      $('btn-again').focus({ preventScroll: true });
      if (best) {
        kit.sfx('win');
        kit.confetti();
      }
    }, reduced() ? 500 : 1200);
  }

  /** Ván đang dở (đã có điểm hoặc đã chơi ≥ 1 giây) thì hỏi trước, vì bỏ ván là chốt điểm luôn. */
  function requestNew() {
    if (inPlay() && (game.score > 0 || game.tick >= MIN_PLAY_TICKS)) {
      pause();
      kit.modal.open('modal-confirm');
      return;
    }
    if (mode === 'playing' || mode === 'paused') mode = 'ready'; // chưa chơi gì: chia lại, không báo cổng
    if (mode === 'ready') newGame();
    startPlaying();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inPlay()) recordEnd();
    mode = 'over';
    startPlaying();
  }

  /* ---------------- Sự kiện từ engine → âm thanh, hiệu ứng ---------------- */
  const MARCH_PITCH = [1, 0.92, 0.84, 0.92];
  function handleEvents(ev) {
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      switch (e.type) {
        case 'shoot':
          fireLatch = 0;
          sfx('tap', { volume: 0.3, pitch: 1.7 });
          break;
        case 'kill':
          explode(e.x, e.y, COLORS.alien[e.kind], 14, 60);
          sfx('pop', { pitch: [1, 1.15, 1.3][e.kind] });
          break;
        case 'ufoKill':
          explode(e.x, e.y, COLORS.ufo, 26, 80);
          popup(e.x, e.y, '+' + e.pts, COLORS.ufo);
          sfx('coin');
          vibrate(25);
          break;
        case 'bombShot':
          explode(e.x, e.y, COLORS.bomb, 6, 40);
          sfx('capture', { volume: 0.5 });
          break;
        case 'shield':
          shieldsDirty = true;
          debris(e.x, e.y, COLORS.shield, 4);
          sfx('drop', { volume: 0.22 }, 90);
          break;
        case 'ground':
          debris(e.x, e.y - 1, COLORS.bomb, 3);
          break;
        case 'hit':
          explode(e.x, e.y, COLORS.player, 34, 90);
          explode(e.x, e.y, '#ffffff', 10, 40);
          shake(5, 0.4);
          flash(0.35);
          if (e.lives > 0) {
            kit.sfx('error');
            vibrate([60, 40, 90]);
            banner(t('banner.lost'), t('banner.livesLeft', { n: e.lives }));
            announce(t('sr.lost', { n: e.lives }));
          }
          break;
        case 'march':
          sfx('tick', { volume: 0.26, pitch: MARCH_PITCH[e.n] }, 110);
          break;
        case 'ufo':
          sfx('move', { volume: 0.5 });
          break;
        case 'extraLife':
          banner(t('banner.extra'));
          announce(t('sr.extra'));
          kit.sfx('combo');
          break;
        case 'clear':
          banner(t('banner.clear'));
          kit.sfx('clear');
          break;
        case 'wave':
          shieldsDirty = true;
          banner(t('banner.wave', { n: e.wave }));
          announce(t('sr.wave', { n: e.wave }));
          kit.sfx('levelup');
          persist();
          break;
        case 'over':
          gameOver(e.reason);
          break;
        default:
          break;
      }
    }
  }

  /* ---------------- Vòng lặp ---------------- */
  let raf = 0;
  let lastT = 0;
  let acc = 0;
  let saveAcc = 0;
  let clock = 0; // giây, cho sao lấp lánh / trôi

  function simTick() {
    const dir = (keysDown.has('right') ? 1 : 0) - (keysDown.has('left') ? 1 : 0);
    const fire = !!settings().autofire || fireHeld || fireLatch > 0;
    const ev = E.step(game, { dir, target: dir ? null : target, fire });
    if (fireLatch > 0) fireLatch--;
    handleEvents(ev);
  }

  function frame(now) {
    raf = 0;
    const dt = lastT ? Math.min(now - lastT, 100) : 16.7; // tab vừa quay lại: không dồn cả quãng
    lastT = now;
    if (mode === 'playing' && (kit.modal.current() || document.hidden)) pause();
    if (mode === 'playing') {
      acc += dt;
      let n = 0;
      while (acc >= E.STEP_MS && n < MAX_CATCHUP && mode === 'playing') {
        acc -= E.STEP_MS;
        n++;
        simTick();
      }
      if (acc > E.STEP_MS) acc = 0; // máy quá chậm: bỏ bớt, không dồn bước
      saveAcc += dt;
      if (saveAcc >= SAVE_EVERY) {
        saveAcc = 0;
        persist();
      }
      clock += dt / 1000;
      updateHud();
    }
    updateFx(dt / 1000);
    draw();
    if (mode === 'playing' || fxActive()) raf = requestAnimationFrame(frame);
    else lastT = 0;
  }
  function kick() {
    if (raf) return;
    lastT = 0;
    acc = 0;
    raf = requestAnimationFrame(frame);
  }

  /* ---------------- Canvas ---------------- */
  const boardArea = $('board-area');
  const boardEl = $('board');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  let S = 1; // px canvas trên mỗi px logic
  let sprites = null;
  let shieldLayer = null;
  let shieldsDirty = true;

  function resize() {
    const w = boardEl.clientWidth;
    const h = boardEl.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = Math.max(1, Math.round(w * dpr));
    const ch = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      sprites = null;
      shieldsDirty = true;
    }
    S = cw / E.W;
    draw();
  }

  /** Vẽ hình điểm ảnh ra canvas riêng (có quầng sáng neon), vẽ lại khi đổi cỡ. */
  function makeSprite(rows, color, glow) {
    const w = rows[0].length;
    const h = rows.length;
    const pad = Math.ceil(4 * S);
    const shape = document.createElement('canvas');
    shape.width = Math.ceil(w * S) + 2 * pad;
    shape.height = Math.ceil(h * S) + 2 * pad;
    const c = shape.getContext('2d');
    c.fillStyle = color;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (rows[y][x] !== '#') continue;
        const x0 = Math.round(pad + x * S);
        const y0 = Math.round(pad + y * S);
        c.fillRect(x0, y0, Math.round(pad + (x + 1) * S) - x0, Math.round(pad + (y + 1) * S) - y0);
      }
    }
    if (!glow) return { img: shape, pad };
    const out = document.createElement('canvas');
    out.width = shape.width;
    out.height = shape.height;
    const o = out.getContext('2d');
    o.shadowColor = color;
    o.shadowBlur = 3.2 * S;
    o.drawImage(shape, 0, 0);
    o.shadowBlur = 0;
    o.drawImage(shape, 0, 0);
    return { img: out, pad };
  }
  const burstCache = {};
  function buildSprites() {
    sprites = {
      alien: ART.alien.map((frames, k) => frames.map((rows) => makeSprite(rows, COLORS.alien[k], true))),
      player: makeSprite(ART.player, COLORS.player, true),
      ufo: makeSprite(ART.ufo, COLORS.ufo, true),
      bomb: ART.bomb.map((frames) => frames.map((rows) => makeSprite(rows, COLORS.bomb, true))),
    };
    Object.keys(burstCache).forEach((k) => delete burstCache[k]);
  }
  function burstSprite(color) {
    if (!burstCache[color]) burstCache[color] = makeSprite(ART.burst, color, true);
    return burstCache[color];
  }
  function blit(spr, x, y) {
    ctx.drawImage(spr.img, Math.round(x * S) - spr.pad, Math.round(y * S) - spr.pad);
  }

  /** Lớp khiên: vẽ lại khi khiên bị bào (không phải mỗi khung hình). */
  function buildShields() {
    shieldsDirty = false;
    if (!shieldLayer) shieldLayer = document.createElement('canvas');
    const pad = Math.ceil(4 * S);
    shieldLayer.width = canvas.width;
    shieldLayer.height = Math.ceil(E.SHIELD_H * S) + 2 * pad;
    shieldLayer.pad = pad;
    const c = shieldLayer.getContext('2d');
    c.clearRect(0, 0, shieldLayer.width, shieldLayer.height);
    c.fillStyle = COLORS.shield;
    game.shields.forEach((cells, s) => {
      const sx = E.SHIELD_X[s];
      for (let r = 0; r < E.SHIELD_ROWS; r++) {
        for (let k = 0; k < E.SHIELD_COLS; k++) {
          if (!cells[r * E.SHIELD_COLS + k]) continue;
          const x0 = Math.round((sx + k * E.SHIELD_CELL) * S);
          const y0 = Math.round(r * E.SHIELD_CELL * S) + pad;
          c.fillRect(x0, y0, Math.round((sx + (k + 1) * E.SHIELD_CELL) * S) - x0, Math.round((r + 1) * E.SHIELD_CELL * S) + pad - y0);
        }
      }
    });
  }

  /* ---------------- Nền sao (3 lớp, lớp gần trôi nhanh hơn và lệch theo tàu nhiều hơn) ---------------- */
  const STAR_LAYERS = [
    { n: 46, size: 0.55, speed: 3, par: 0.02, alpha: 0.45 },
    { n: 26, size: 0.85, speed: 8, par: 0.05, alpha: 0.7 },
    { n: 12, size: 1.25, speed: 16, par: 0.1, alpha: 0.95 },
  ];
  const stars = STAR_LAYERS.map((L) =>
    Array.from({ length: L.n }, () => ({ x: Math.random() * E.W, y: Math.random() * E.H, tw: Math.random() * Math.PI * 2, blue: Math.random() < 0.3 })),
  );
  function drawStars() {
    const off = game ? E.W / 2 - game.px : 0;
    STAR_LAYERS.forEach((L, li) => {
      const drift = reduced() ? 0 : clock * L.speed;
      const shift = reduced() ? 0 : off * L.par;
      stars[li].forEach((st) => {
        const x = (((st.x + shift) % E.W) + E.W) % E.W;
        const y = (st.y + drift) % E.H;
        const a = reduced() ? L.alpha : L.alpha * (0.75 + 0.25 * Math.sin(clock * 2.2 + st.tw));
        ctx.globalAlpha = a;
        ctx.fillStyle = st.blue ? '#9fd8ff' : '#ffffff';
        const s = Math.max(1, L.size * S);
        ctx.fillRect(Math.round(x * S), Math.round(y * S), s, s);
      });
    });
    ctx.globalAlpha = 1;
  }

  /* ---------------- Hiệu ứng: mảnh vỡ, chớp nổ, điểm bay, rung, chớp sáng ---------------- */
  let parts = [];
  let bursts = [];
  let popups = [];
  let shakeT = 0;
  let shakeAmp = 0;
  let flashT = 0;
  function resetFx() {
    parts = [];
    bursts = [];
    popups = [];
    shakeT = 0;
    flashT = 0;
  }
  function explode(x, y, color, n, speed) {
    bursts.push({ x, y, color, life: reduced() ? 0.3 : 0.16 });
    if (reduced()) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.8);
      const life = 0.35 + Math.random() * 0.45;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: 0.8 + Math.random() * 1.1 });
    }
  }
  function debris(x, y, color, n) {
    if (reduced()) return;
    for (let i = 0; i < n; i++) {
      const life = 0.25 + Math.random() * 0.25;
      parts.push({ x, y, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50, life, max: life, color, size: 1 });
    }
  }
  function popup(x, y, text, color) {
    popups.push({ x, y, text, color, life: 1.1 });
  }
  function shake(amp, dur) {
    if (reduced()) return;
    shakeAmp = amp;
    shakeT = dur;
  }
  function flash(a) {
    if (!reduced()) flashT = a;
  }
  const fxActive = () => parts.length > 0 || bursts.length > 0 || popups.length > 0 || shakeT > 0 || flashT > 0;
  function updateFx(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy = p.vy * 0.96 + 30 * dt;
    }
    bursts = bursts.filter((b) => (b.life -= dt) > 0);
    popups = popups.filter((p) => {
      p.life -= dt;
      if (!reduced()) p.y -= 14 * dt;
      return p.life > 0;
    });
    if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
    if (flashT > 0) flashT = Math.max(0, flashT - dt * 1.2);
  }

  /* ---------------- Vẽ một khung hình ---------------- */
  function draw() {
    if (!game || !canvas.width) return;
    if (!sprites) buildSprites();
    if (shieldsDirty) buildShields();
    const g = game;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (shakeT > 0) {
      const k = shakeT * shakeAmp * S;
      ctx.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    }
    drawStars();

    // Đĩa bay
    if (g.ufo) blit(sprites.ufo, g.ufo.x, E.UFO_Y);

    // Đội hình
    for (let i = 0; i < E.TOTAL; i++) {
      if (!g.alive[i]) continue;
      const a = E.alienRect(g, i);
      blit(sprites.alien[a.type][g.anim], a.x, a.y);
    }

    // Khiên
    ctx.drawImage(shieldLayer, 0, Math.round(E.SHIELD_Y * S) - shieldLayer.pad);

    // Bom
    const bf = (g.tick >> 3) & 1;
    g.bombs.forEach((m) => blit(sprites.bomb[m.k][bf], m.x - E.BOMB_W / 2, m.y));

    // Đạn
    if (g.bullet) {
      ctx.save();
      ctx.shadowColor = '#37f0ff';
      ctx.shadowBlur = 4 * S;
      ctx.fillStyle = COLORS.bullet;
      ctx.fillRect(Math.round((g.bullet.x - 0.5) * S), Math.round(g.bullet.y * S), Math.max(1, Math.round(S)), Math.round(E.BULLET_H * S));
      ctx.restore();
    }

    // Tàu
    if (g.phase === 'play' || g.phase === 'clear') blit(sprites.player, g.px - E.PLAYER_W / 2, E.PLAYER_Y);

    // Mặt đất + số tàu còn lại
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, Math.round(E.GROUND_Y * S), canvas.width, Math.max(1, Math.round(S * 0.6)));
    ctx.globalAlpha = 1;
    const lives = g.phase === 'dying' ? g.lives : Math.max(0, g.lives - 1); // tàu dự bị
    const iw = sprites.player.img.width * 0.62;
    const ih = sprites.player.img.height * 0.62;
    for (let k = 0; k < Math.min(lives, 5); k++) {
      ctx.drawImage(sprites.player.img, Math.round((6 + k * 13) * S) - sprites.player.pad * 0.62, Math.round((E.GROUND_Y + 6) * S) - sprites.player.pad * 0.62, iw, ih);
    }
    ctx.font = '700 ' + Math.round(8 * S) + 'px "Be Vietnam Pro", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.text;
    ctx.globalAlpha = 0.85;
    ctx.fillText('♥ ' + g.lives, Math.round((E.W - 6) * S), Math.round((E.GROUND_Y + 11) * S));
    ctx.globalAlpha = 1;

    // Mảnh vỡ, chớp nổ, điểm bay
    parts.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      const s = Math.max(1, p.size * S);
      ctx.fillRect(Math.round(p.x * S), Math.round(p.y * S), s, s);
    });
    ctx.globalAlpha = 1;
    bursts.forEach((b) => {
      const spr = burstSprite(b.color);
      blit(spr, b.x - ART.burst[0].length / 2, b.y - ART.burst.length / 2);
    });
    ctx.textAlign = 'center';
    popups.forEach((p) => {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6 * S;
      ctx.fillText(p.text, Math.round(p.x * S), Math.round(p.y * S));
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;

    if (flashT > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(255, 255, 255, ' + (flashT * 0.6).toFixed(3) + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  /* ---------------- Bàn phím ---------------- */
  const KEY_DIRS = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
  function releaseInput() {
    keysDown.clear();
    fireHeld = false;
    fireLatch = 0;
    drag = null;
  }
  const onButton = (e) => !!(e.target && e.target.closest && e.target.closest('button, input, a'));

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented || kit.modal.current()) return;
    const k = e.key;
    if (KEY_DIRS[k]) {
      if (mode !== 'playing') return;
      e.preventDefault();
      keysDown.add(KEY_DIRS[k]);
      target = null;
      return;
    }
    if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
      // Đang chơi: Space / Enter là bắn (kể cả khi focus còn ở nút). Ngoài lúc chơi: để nút đang focus tự xử lý
      if (mode === 'playing') {
        e.preventDefault();
        if (!e.repeat) fireLatch = LATCH;
        fireHeld = true;
        return;
      }
      if (onButton(e) || e.repeat) return;
      e.preventDefault();
      if (mode === 'paused') resume();
      else if (mode === 'ready' || (mode === 'over' && !$('overlay-over').hidden)) startPlaying();
      return;
    }
    if (e.repeat) return;
    const low = k.toLowerCase();
    if (low === 'p') {
      e.preventDefault();
      togglePause();
    } else if (k === 'Escape') {
      if (mode === 'playing') {
        e.preventDefault();
        pause();
      }
    } else if (low === 'n') {
      e.preventDefault();
      requestNew();
    } else if (low === 'h' || k === '?') {
      e.preventDefault();
      pause();
      kit.modal.open('modal-help');
    }
  });
  document.addEventListener('keyup', (e) => {
    if (KEY_DIRS[e.key]) keysDown.delete(KEY_DIRS[e.key]);
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') fireHeld = false;
  });

  /* ---------------- Chuột / cảm ứng ----------------
   * Chuột: tàu đi theo con trỏ (tuyệt đối), nhấp / giữ để bắn.
   * Cảm ứng / bút: kéo TƯƠNG ĐỐI ở bất kỳ đâu trong vùng bàn chơi, nên ngón tay không che tàu;
   * tắt tự bắn thì mỗi lần chạm là một phát. */
  const pxToLogic = () => E.W / (boardEl.clientWidth || 1);
  function mouseX(e) {
    const rect = boardEl.getBoundingClientRect();
    return Math.max(E.PX_MIN, Math.min(E.PX_MAX, ((e.clientX - rect.left) / (rect.width || 1)) * E.W));
  }
  boardArea.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    if (mode === 'ready' && e.target.closest('#overlay-start')) {
      startPlaying();
      return;
    }
    if (e.target.closest('.overlay') || mode !== 'playing' || kit.modal.current()) return;
    focusBoard();
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return;
      target = mouseX(e);
      fireHeld = true;
      fireLatch = LATCH;
      return;
    }
    if (drag) return; // ngón thứ hai: bỏ qua
    drag = { id: e.pointerId, x0: e.clientX, px0: game.px };
    target = game.px;
    keysDown.clear();
    if (!settings().autofire) fireLatch = LATCH;
    try {
      boardArea.setPointerCapture(e.pointerId);
    } catch (err) { /* bỏ qua */ }
  });
  boardArea.addEventListener('pointermove', (e) => {
    if (mode !== 'playing') return;
    if (e.pointerType === 'mouse') {
      if (!keysDown.size) target = mouseX(e);
      return;
    }
    if (!drag || drag.id !== e.pointerId) return;
    const want = drag.px0 + (e.clientX - drag.x0) * pxToLogic() * DRAG_SENS;
    // Kéo quá mép thì dời mốc, để kéo ngược lại là tàu đi ngay
    if (want < E.PX_MIN || want > E.PX_MAX) {
      const tx = Math.max(E.PX_MIN, Math.min(E.PX_MAX, want));
      drag.x0 = e.clientX;
      drag.px0 = tx;
      target = tx;
    } else {
      target = want;
    }
  });
  function endPointer(e) {
    if (e.pointerType === 'mouse') fireHeld = false;
    if (drag && drag.id === e.pointerId) drag = null;
  }
  boardArea.addEventListener('pointerup', endPointer);
  boardArea.addEventListener('pointercancel', endPointer);
  boardArea.addEventListener('contextmenu', (e) => e.preventDefault());
  boardArea.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  /* ---------------- Nút ---------------- */
  $('btn-start').addEventListener('click', startPlaying);
  $('btn-again').addEventListener('click', () => {
    if (mode === 'over') startPlaying();
  });
  $('btn-resume').addEventListener('click', resume);
  $('btn-pause-new').addEventListener('click', requestNew);
  $('btn-pause').addEventListener('click', togglePause);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-auto').addEventListener('click', () => {
    const on = !settings().autofire;
    kit.settings.set({ autofire: on });
    kit.toast(t(on ? 'toast.autoOn' : 'toast.autoOff'));
    if (mode === 'playing') focusBoard();
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = fmt(stats.played);
    $('stats-best').textContent = fmt(stats.best);
    $('stats-wave').textContent = fmt(stats.bestWave);
    $('stats-kills').textContent = fmt(stats.kills);
  });

  /* ---------------- Tự dừng / lưu khi rời trang ---------------- */
  kit.onLeave(() => {
    pause();
    persist();
  });
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) draw();
  });
  reduceMQ.addEventListener && reduceMQ.addEventListener('change', () => {
    resetFx();
    draw();
  });
  if (window.ResizeObserver) new ResizeObserver(resize).observe(boardEl);
  window.addEventListener('resize', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  syncAuto();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && restored.tick > 0 && !E.isOver(restored)) {
    game = restored;
    mode = 'paused';
    kit.sdk.start(MODE, true);
    kit.toast(t('toast.saved'));
    $('pause-sub').textContent = t('pause.detail', { wave: fmt(game.wave), score: fmt(game.score) });
    showOverlay('pause');
  } else {
    kit.store.remove(keys.save);
    newGame();
    mode = 'ready';
    renderStartBest();
    showOverlay('start');
  }
  updateHud();
  resize();
  writeSummary();
  if (!settings().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  } else {
    (mode === 'paused' ? $('btn-resume') : $('btn-start')).focus({ preventScroll: true });
  }
})();
