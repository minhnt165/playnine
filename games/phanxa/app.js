/* =====================================================================
 * Phản Xạ - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Vẽ bằng canvas (nhân devicePixelRatio). Sân ngắm bắn giữ tỉ lệ đã chốt lúc bắt đầu ván, co theo khung;
 *     đo phản ứng dùng cả khung làm vùng chạm.
 *   - Vòng lặp requestAnimationFrame, dt giới hạn 100 ms (tab vừa quay lại), tiến engine theo bước cố định 10 ms.
 *     Cú chạm lấy thời điểm từ event.timeStamp (cùng gốc với performance.now) rồi quy ra giờ trong ván, nên
 *     kết quả không phụ thuộc khung hình. Đo phản ứng tính từ khung hình đầu tiên vẽ màu xanh.
 *   - Trạng thái: 'idle' (màn chờ) | 'playing' | 'paused' | 'over'. Tự tạm dừng khi trang ẩn hoặc mở hộp thoại.
 *   Báo ván cho cổng (metric score_high):
 *   - Ván mới: kit.sdk.start(mode) khi bấm Bắt đầu; mở lại ván ngắm bắn lưu dở: kit.sdk.start('classic', true)
 *   - Hết ván: kit.sdk.end({ mode, won: false, score, assisted: false }); đo phản ứng gửi điểm 1000 − trung bình (ms)
 *   - Bỏ ván khi đã chạm hoặc đã chơi ≥ 1 giây: gửi won: false với điểm hiện có (đo phản ứng chưa xong: 0)
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const STEP = 10; // bước mô phỏng cố định (ms)
  const MAX_DT = 100; // tab vừa quay lại: không nhảy cóc
  const OVER_DELAY = 600; // hết ván: chờ một chút rồi mới hiện bảng kết quả
  const MODES = ['classic', 'reaction'];

  const kit = PNKit.init({
    gameId: 'phanxa',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { vibrate: true, guideSeen: false, mode: 'classic' },
    onSetting(key) {
      if (key === 'theme') readColors();
      if (key === 'mode') onModePicked();
    },
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const settings = () => kit.settings.get();
  const mq = (q) => (window.matchMedia ? matchMedia(q) : { matches: false, addEventListener() {} });
  const reduceMotion = mq('(prefers-reduced-motion: reduce)');
  const fmtN = (n) => kit.i18n.fmtNumber(n);
  const fmtMs = (n) => t('unit.ms', { n: fmtN(n) });

  const app = $('app');
  const stage = $('stage');
  const field = $('field');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  const statsDefault = { played: 0, best: null, bestStreak: 0, hits: 0, taps: 0, rxPlayed: 0, rxBest: null };
  const stats = Object.assign({}, statsDefault, kit.store.read(keys.stats, {}) || {});

  let game = null;
  let state = 'idle';
  let overShown = false;

  const pickedMode = () => (settings().mode === 'reaction' ? 'reaction' : 'classic');
  const curMode = () => (game ? game.mode : pickedMode());
  const inRound = () => (state === 'playing' || state === 'paused') && !!game && !E.isOver(game);

  function buzz(pattern) {
    if (!settings().vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* bỏ qua */ }
  }
  const say = (msg) => { $('sr').textContent = msg; };

  /* ================================================================
   * Bố cục: sân ngắm bắn lớn nhất vừa .stage theo đúng tỉ lệ; đo phản ứng phủ cả khung
   * ================================================================ */
  let dpr = 1;
  let fw = 0; // cỡ sân (px CSS)
  let fh = 0;
  let unit = 1; // px CSS trên một đơn vị sân

  function arena() {
    if (game && game.mode === 'classic') return { w: game.w, h: game.h };
    return E.shape(stage.clientWidth, stage.clientHeight);
  }

  function layout() {
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    if (!sw || !sh) return;
    let w = sw;
    let h = sh;
    if (curMode() === 'classic') {
      const a = arena();
      const s = Math.min(sw / a.w, sh / a.h);
      w = a.w * s;
      h = a.h * s;
      unit = s;
    }
    fw = Math.max(1, Math.floor(w));
    fh = Math.max(1, Math.floor(h));
    field.style.width = fw + 'px';
    field.style.height = fh + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(fw * dpr);
    canvas.height = Math.round(fh * dpr);
    draw(performance.now());
  }
  if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);
  window.addEventListener('resize', layout);

  /* ================================================================
   * Vẽ
   * ================================================================ */
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    colors = {
      grid: v('--grid'), ring: v('--tgt-ring'), a: v('--tgt-a'), b: v('--tgt-b'), edge: v('--tgt-edge'), miss: v('--fx-miss'),
      text: v('--fx-text'), stroke: v('--fx-stroke'), gold: v('--gold'), hot: v('--hot'),
      red: v('--rx-red'), green: v('--rx-green'), idle: v('--rx-idle'), foul: v('--rx-foul'), ink: v('--rx-ink'),
      font: v('--font') || 'system-ui, sans-serif',
    };
    draw(performance.now());
  }
  mq('(prefers-color-scheme: dark)').addEventListener('change', readColors);

  /* Hiệu ứng theo giờ thật (ms của performance.now): vòng trúng, chữ điểm, dấu trượt, mục tiêu tắt, dòng chữ giữa sân */
  let fx = [];
  let banner = null;
  const addFx = (o) => fx.push(Object.assign({ t0: performance.now() }, o));
  function showBanner(text, color, dur) {
    banner = { text, color: color || colors.text, t0: performance.now(), dur: dur || 900 };
    kick();
  }

  const font = (px, w) => (w || 800) + ' ' + Math.round(px) + 'px ' + colors.font;

  function textOut(str, x, y, px, fill, alpha) {
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.font = font(px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, px * 0.14);
    ctx.strokeStyle = colors.stroke;
    ctx.strokeText(str, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }

  function drawTarget(o, rr) {
    const x = o.x * unit;
    const y = o.y * unit;
    const R = rr * unit;
    // Vòng mờ cỡ lúc hiện: cho thấy mục tiêu đã co bao nhiêu
    ctx.beginPath();
    ctx.arc(x, y, o.r * unit, 0, Math.PI * 2);
    ctx.strokeStyle = colors.ring;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (R <= 0.5) return;
    const rings = [[1, colors.a], [0.7, colors.b], [0.42, colors.a], [0.16, colors.b]];
    rings.forEach(([k, c]) => {
      ctx.beginPath();
      ctx.arc(x, y, R * k, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
    });
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.strokeStyle = colors.edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawClassic(now) {
    // Lưới chấm nhẹ (trang trí)
    ctx.fillStyle = colors.grid;
    const step = 10 * unit;
    for (let gx = step; gx < fw - 1; gx += step) {
      for (let gy = step; gy < fh - 1; gy += step) ctx.fillRect(Math.round(gx) - 1, Math.round(gy) - 1, 2, 2);
    }
    if (game && game.mode === 'classic') {
      const simNow = game.t + (state === 'playing' ? Math.min(acc, STEP) : 0);
      game.targets.forEach((o) => drawTarget(o, E.radiusAt(o, simNow)));
    }
    const still = reduceMotion.matches;
    fx = fx.filter((f) => now - f.t0 < f.dur);
    fx.forEach((f) => {
      const k = Math.max(0, Math.min(1, (now - f.t0) / f.dur));
      const x = f.x * unit;
      const y = f.y * unit;
      if (f.type === 'hit') {
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.arc(x, y, f.r * unit * (still ? 1 : 1 + 0.6 * k), 0, Math.PI * 2);
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.type === 'text') {
        const px = Math.max(16, Math.min(30, 5.2 * unit));
        textOut(f.text, x, y - (still ? 0 : 14 * k) - f.r * unit * 0.2, px, f.color, k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
      } else if (f.type === 'miss') {
        const s = Math.max(6, 2.2 * unit);
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = colors.miss;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - s, y - s);
        ctx.lineTo(x + s, y + s);
        ctx.moveTo(x + s, y - s);
        ctx.lineTo(x - s, y + s);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.type === 'expire') {
        ctx.globalAlpha = 0.6 * (1 - k);
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(3, f.r * unit * 0.35), 0, Math.PI * 2);
        ctx.strokeStyle = colors.miss;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    });
  }

  function drawReaction() {
    const g = game && game.mode === 'reaction' ? game : null;
    const phase = g ? g.phase : 'idle';
    const bg = { red: colors.red, green: colors.green, foul: colors.foul }[phase] || colors.idle;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, fw, fh);
    const big = Math.max(26, Math.min(64, Math.min(fw, fh) * 0.13));
    const small = Math.max(14, big * 0.36);
    let line1 = '';
    let line2 = '';
    if (g) {
      const n = Math.min(E.REACTION.TRIALS, g.trials.length + (phase === 'result' || phase === 'done' ? 0 : 1));
      const tryText = t('rx.try', { n: Math.max(1, n) });
      if (phase === 'red') {
        line1 = t('rx.wait');
        line2 = tryText;
      } else if (phase === 'green') {
        line1 = t('rx.tap');
        line2 = tryText;
      } else if (phase === 'foul') {
        line1 = g.last && g.last.kind === 'guess' ? t('rx.guess') : t('rx.early');
        line2 = g.last && g.last.kind === 'guess'
          ? t('rx.guessSub', { ms: E.REACTION.TOO_FAST }) + ' · ' + t('rx.foulSub', { p: E.REACTION.PENALTY })
          : t('rx.foulSub', { p: E.REACTION.PENALTY });
      } else if (phase === 'result' || phase === 'done') {
        const last = g.last || { kind: 'ok', ms: 0 };
        line1 = last.kind === 'slow' ? t('rx.slow') : fmtMs(last.ms);
        line2 = phase === 'done' ? '' : t('rx.next');
      }
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors.ink;
    ctx.font = font(big);
    ctx.fillText(line1, fw / 2, fh / 2 - small * 0.6, fw * 0.92);
    ctx.font = font(small, 600);
    ctx.globalAlpha = 0.9;
    ctx.fillText(line2, fw / 2, fh / 2 + big * 0.55, fw * 0.92);
    ctx.globalAlpha = 1;
    // Các lần đã đo, ở mép dưới
    if (g && g.trials.length) {
      ctx.font = font(Math.max(13, small * 0.9), 700);
      const parts = g.trials.map((ms) => fmtN(ms));
      ctx.globalAlpha = 0.85;
      ctx.fillText(parts.join('  ·  '), fw / 2, fh - Math.max(18, small * 1.4), fw * 0.92);
      ctx.globalAlpha = 1;
    }
  }

  function draw(now) {
    if (!fw || !colors.font) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, fw, fh);
    if (curMode() === 'reaction') drawReaction();
    else drawClassic(now);
    if (banner) {
      const k = (now - banner.t0) / banner.dur;
      if (k >= 1) banner = null;
      else {
        const px = Math.max(28, Math.min(60, Math.min(fw, fh) * 0.12));
        const s = reduceMotion.matches ? 1 : Math.min(1, 0.6 + k * 3);
        ctx.save();
        ctx.translate(fw / 2, fh / 2);
        ctx.scale(s, s);
        textOut(banner.text, 0, 0, px, banner.color, k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
        ctx.restore();
      }
    }
  }

  /* ---------------- Ô số liệu ---------------- */

  /** m:ss, làm tròn lên (60 giây đầu hiện 1:00) */
  function fmtTime(ms) {
    const s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  const hud = { mode: '', v1: null, v2: null, v3: null, v4: null, hurry: null, pause: '', tier: -1 };
  function setText(id, key, v) {
    if (hud[key] === v) return;
    $(id).textContent = v;
    hud[key] = v;
  }

  function renderHud() {
    const mode = curMode();
    if (mode !== hud.mode) {
      const labels = mode === 'classic' ? ['hud.score', 'hud.time', 'hud.streak', 'hud.best'] : ['hud.trial', 'hud.avg', 'hud.fouls', 'hud.best'];
      labels.forEach((k, i) => { $('h' + (i + 1) + '-label').textContent = t(k); });
      app.classList.toggle('mode-classic', mode === 'classic');
      app.classList.toggle('mode-reaction', mode === 'reaction');
      hud.mode = mode;
      hud.v1 = hud.v2 = hud.v3 = hud.v4 = null;
    }
    if (mode === 'classic') {
      const g = game && game.mode === 'classic' ? game : null;
      const left = g ? E.timeLeft(g) : E.ROUND_MS;
      setText('h1', 'v1', fmtN(g ? g.score : 0));
      setText('h2', 'v2', fmtTime(left));
      $('time-fill').style.transform = 'scaleX(' + (left / E.ROUND_MS).toFixed(4) + ')';
      const streak = g ? g.streak : 0;
      const mult = E.multiplier(streak);
      setText('h3', 'v3', '×' + mult + ' · ' + streak);
      if (mult !== hud.tier) {
        $('h3-box').dataset.tier = String(mult);
        hud.tier = mult;
      }
      setText('h4', 'v4', stats.best == null ? '–' : fmtN(stats.best));
      const hurry = state === 'playing' && left <= 5000;
      if (hurry !== hud.hurry) {
        $('h2-box').classList.toggle('hurry', hurry);
        hud.hurry = hurry;
      }
    } else {
      const g = game && game.mode === 'reaction' ? game : null;
      const done = g ? g.trials.length : 0;
      const n = g && !g.over && (g.phase === 'red' || g.phase === 'green' || g.phase === 'foul') ? done + 1 : Math.max(done, 0);
      setText('h1', 'v1', Math.min(E.REACTION.TRIALS, n) + '/' + E.REACTION.TRIALS);
      const avg = g ? E.reactionAvg(g) : null;
      setText('h2', 'v2', avg == null ? '–' : fmtMs(avg));
      setText('h3', 'v3', fmtN(g ? g.fouls : 0));
      setText('h4', 'v4', stats.rxBest == null ? '–' : fmtMs(stats.rxBest));
      if (hud.hurry) {
        $('h2-box').classList.remove('hurry');
        hud.hurry = false;
      }
      if (hud.tier !== 1) {
        $('h3-box').dataset.tier = '1';
        hud.tier = 1;
      }
    }
    const open = state === 'playing' || state === 'paused';
    const ps = (open ? 'o' : 'c') + state;
    if (ps !== hud.pause) {
      const btn = $('btn-pause');
      btn.disabled = !open;
      btn.dataset.state = state === 'paused' ? 'paused' : 'running';
      const label = state === 'paused' ? t('btn.resume') : t('btn.pause');
      btn.setAttribute('aria-label', label);
      btn.title = t('btn.keySuffix', { label });
      hud.pause = ps;
    }
  }

  function bumpStreak() {
    const el = $('h3-box');
    el.classList.remove('lost');
    void el.offsetWidth; // chạy lại hiệu ứng
    el.classList.add('lost');
  }

  function showOverlay(name) {
    ['start', 'pause', 'over'].forEach((n) => { $('overlay-' + n).hidden = n !== name; });
    overShown = name === 'over';
  }

  /* ================================================================
   * Lưu: chỉ ván ngắm bắn dở (đo phản ứng ngắn, không lưu); thống kê; tóm tắt cho cổng
   * ================================================================ */
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    const resume = inRound() && game.mode === 'classic' && game.t > 0;
    const list = [];
    if (stats.best != null) list.push({ value: fmtN(stats.best), label: t('hud.best') });
    if (stats.rxBest != null) list.push({ value: fmtMs(stats.rxBest), label: t('summary.rx') });
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played + stats.rxPlayed,
      won: 0,
      note: stats.best == null ? t('summary.none') : t('summary.note', { score: fmtN(stats.best) }),
      stats: list,
      resume: resume
        ? { title: t('app.name'), detail: t('summary.resume', { score: fmtN(game.score), time: fmtTime(E.timeLeft(game)) }), pct: game.t / E.ROUND_MS }
        : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (inRound() && game.mode === 'classic' && game.t > 0) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ================================================================
   * Vòng lặp: bước cố định; giờ trong ván = game.t + acc ứng với giờ thật `last`
   * ================================================================ */
  let raf = 0;
  let last = 0;
  let acc = 0;
  let lastSec = 60;
  let greenReal = null; // giờ thật của khung hình đầu tiên vẽ màu xanh (đo phản ứng)

  function kick() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    if (state === 'playing') {
      if (kit.modal.current() || document.hidden) {
        pause(false);
        return;
      }
      if (game.mode === 'reaction' && game.phase === 'green' && greenReal != null) {
        // Đang xanh: giờ trong ván bám theo khung hình đã vẽ xanh, để mốc đo trùng với lúc người chơi thấy
        const r = E.advance(game, Math.min(game.t + MAX_DT, game.greenAt + (now - greenReal)));
        game = r.game;
        acc = 0;
        onEvents(r.events, now);
      } else {
        acc += Math.min(MAX_DT, Math.max(0, now - last));
        const ms = Math.floor(acc / STEP) * STEP;
        acc -= ms;
        if (ms > 0) {
          const r = E.advance(game, game.t + ms);
          game = r.game;
          onEvents(r.events, now);
        }
      }
    }
    last = now;
    draw(now);
    renderHud();
    if (state === 'playing' || fx.length || banner) raf = requestAnimationFrame(frame);
  }

  function onEvents(events, now) {
    events.forEach((ev) => {
      if (ev.type === 'spawn') kit.sfx('tick', { pitch: 1.5, volume: 0.12 });
      else if (ev.type === 'expire') {
        addFx({ type: 'expire', x: ev.x, y: ev.y, r: ev.r, dur: 320 });
        kit.sfx('drop', { pitch: 1.4, volume: 0.2 });
        if (ev.lost) bumpStreak();
      } else if (ev.type === 'green') {
        greenReal = now;
        say(t('say.green'));
      } else if (ev.type === 'red') {
        greenReal = null;
      } else if (ev.type === 'trial' && ev.kind === 'slow') {
        greenReal = null;
        kit.sfx('tap', { pitch: 0.6, volume: 0.5 });
        say(t('rx.slow'));
      } else if (ev.type === 'over') finish();
    });
    // Đếm ngược 5 giây cuối (ngắm bắn)
    if (game.mode === 'classic') {
      const sec = Math.ceil(E.timeLeft(game) / 1000);
      if (state === 'playing' && sec !== lastSec && sec <= 5 && sec > 0) {
        kit.sfx('tick', { pitch: sec === 1 ? 1.3 : 1 });
        if (sec === 5) showBanner(t('fx.hurry'), colors.hot);
      }
      lastSec = sec;
    }
  }

  /** event.timeStamp → giờ performance.now (trình duyệt cũ dùng giờ epoch thì lấy giờ hiện tại). */
  function evTime(ts) {
    const now = performance.now();
    return typeof ts === 'number' && ts > 0 && Math.abs(now - ts) < 10000 ? ts : now;
  }

  /** Giờ trong ván ứng với giờ thật ts. */
  function simTime(ts) {
    return Math.max(game.t, game.t + acc + Math.min(MAX_DT, ts - last));
  }

  /** Sau khi engine nhảy tới giờ chạm: giữ đúng quan hệ game.t + acc ↔ last. */
  function syncClock(oldT, oldAcc) {
    const base = oldT + oldAcc;
    if (game.t > base) {
      last += game.t - base;
      acc = 0;
    } else acc = base - game.t;
  }

  /* ================================================================
   * Chạm
   * ================================================================ */
  function act(ts, cx, cy) {
    if (state !== 'playing' || !game || kit.modal.current()) return;
    const when = evTime(ts);
    const oldT = game.t;
    const oldAcc = acc;
    if (game.mode === 'classic') {
      const rect = field.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = ((cx - rect.left) / rect.width) * game.w;
      const y = ((cy - rect.top) / rect.height) * game.h;
      const before = E.multiplier(game.streak);
      const r = E.tap(game, simTime(when), x, y);
      game = r.game;
      syncClock(oldT, oldAcc);
      onEvents(r.events, when);
      const res = r.result;
      if (res.type === 'hit') {
        const mult = res.mult;
        const color = mult >= 4 ? colors.hot : mult >= 2 ? colors.gold : colors.text;
        addFx({ type: 'hit', x: res.x, y: res.y, r: res.r, dur: 320, color: colors.a });
        addFx({ type: 'text', x: res.x, y: res.y, r: res.r, dur: 750, text: '+' + fmtN(res.points), color });
        kit.sfx('pop', { pitch: 0.95 + 0.08 * mult + 0.25 * res.acc });
        buzz(12);
        const now = E.multiplier(game.streak);
        if (now > before) {
          showBanner(t('fx.streak', { n: now }), now >= 4 ? colors.hot : colors.gold);
          kit.sfx('combo');
        }
      } else if (res.type === 'miss') {
        addFx({ type: 'miss', x: res.x, y: res.y, dur: 420 });
        kit.sfx('tap', { pitch: 0.6, volume: 0.5 });
        if (res.lost) bumpStreak();
      }
    } else {
      // Đo phản ứng: đang xanh thì tính theo mốc khung hình xanh, còn lại theo đồng hồ ván
      let simT = game.phase === 'green' && greenReal != null ? game.greenAt + (when - greenReal) : simTime(when);
      // Màn còn đỏ (chưa khung hình nào vẽ xanh): người chơi chưa thể thấy xanh, chạm lúc này là sớm
      if (game.phase === 'red') simT = Math.min(simT, game.greenAt - 1);
      const r = E.press(game, simT);
      game = r.game;
      syncClock(oldT, oldAcc);
      onEvents(r.events, when);
      const res = r.result;
      if (res.type === 'ok') {
        greenReal = null;
        kit.sfx(res.ms < 250 ? 'coin' : 'tap');
        buzz(12);
        say(t('say.trial', { ms: res.ms }));
      } else if (res.type === 'early' || res.type === 'guess') {
        greenReal = null;
        kit.sfx('error');
        buzz([30, 30, 30]);
        say(res.type === 'guess' ? t('rx.guess') : t('rx.early'));
      }
    }
    draw(performance.now());
    renderHud();
    kick();
  }

  field.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); // không lấy focus, không chọn chữ, không phóng to khi chạm đúp
    act(e.timeStamp, e.clientX, e.clientY);
  });
  field.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ================================================================
   * Luồng ván
   * ================================================================ */
  function startRound() {
    kit.modal.close('modal-confirm');
    // Nút vừa bấm sắp ẩn: bỏ focus để Space sau đó là cú chạm (đo phản ứng), không bấm lại nút
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
    const mode = pickedMode();
    const seed = Math.floor(Math.random() * 0x100000000) >>> 0;
    if (mode === 'classic') {
      const sh = E.shape(stage.clientWidth, stage.clientHeight);
      game = E.newGame(seed, { w: sh.w, h: sh.h });
    } else game = E.newGame(seed, { mode: 'reaction' });
    state = 'playing';
    acc = 0;
    lastSec = 60;
    greenReal = null;
    fx = [];
    banner = null;
    clearTimeout(overTimer);
    kit.store.remove(keys.save);
    kit.sdk.start(mode);
    showOverlay(null);
    layout();
    if (mode === 'classic') showBanner(t('fx.go'), colors.text, 700);
    kit.sfx('start');
    renderHud();
    writeSummary();
    kick();
  }

  function pause(focus) {
    if (state !== 'playing') return;
    state = 'paused';
    acc = 0;
    if (game.mode === 'reaction') {
      game = E.interrupt(game); // lần đang đo làm lại từ đầu, không tính lỗi
      greenReal = null;
    }
    showPaused();
    persist();
    say(t('say.paused'));
    if (focus && !kit.modal.current()) $('btn-resume').focus();
  }

  function showPaused() {
    $('pause-sub').textContent = game.mode === 'classic'
      ? t('pause.sub', { score: fmtN(game.score), time: fmtTime(E.timeLeft(game)) })
      : t('pause.subRx', { n: Math.min(E.REACTION.TRIALS, game.trials.length + 1) });
    showOverlay('pause');
    draw(performance.now());
    renderHud();
  }

  function resume() {
    if (state !== 'paused' || kit.modal.current()) return;
    state = 'playing';
    showOverlay(null);
    kit.sfx('tap', { pitch: 1.15 });
    renderHud();
    kick();
  }

  function togglePause() {
    if (state === 'playing') pause(true);
    else if (state === 'paused') resume();
  }

  let overTimer = 0;
  function finish() {
    state = 'over';
    const mode = game.mode;
    const score = E.score(game);
    let record;
    if (mode === 'classic') {
      const s = E.summary(game);
      record = score > 0 && (stats.best == null || score > stats.best);
      stats.played++;
      stats.hits += s.hits;
      stats.taps += s.hits + s.misses;
      stats.bestStreak = Math.max(stats.bestStreak, s.bestStreak);
      if (record) stats.best = score;
      $('over-title').textContent = t('over.title');
      $('over-score').textContent = fmtN(score);
      $('over-sub').hidden = true;
      $('over-best').textContent = t('over.best');
      $('over-acc').textContent = s.accuracy == null ? '–' : Math.round(s.accuracy * 100) + '%';
      $('over-react').textContent = s.avgMs == null ? '–' : fmtMs(s.avgMs);
      $('over-streak').textContent = fmtN(s.bestStreak);
      $('over-stats').hidden = false;
      $('over-trials').hidden = true;
      say(t('say.over', { score: fmtN(score) }));
    } else {
      const avg = E.reactionAvg(game);
      record = stats.rxBest == null || avg < stats.rxBest;
      stats.rxPlayed++;
      if (record) stats.rxBest = avg;
      $('over-title').textContent = t('over.titleRx');
      $('over-score').textContent = fmtMs(avg);
      const p = game.fouls * E.REACTION.PENALTY;
      $('over-sub').textContent = game.fouls
        ? t('over.rxFouls', { score: fmtN(score), n: game.fouls, p })
        : t('over.rxSub', { score: fmtN(score) });
      $('over-sub').hidden = false;
      $('over-best').textContent = t('over.bestRx');
      $('over-stats').hidden = true;
      const list = $('over-trials');
      list.textContent = '';
      game.trials.forEach((ms) => {
        const li = document.createElement('li');
        li.textContent = fmtN(ms);
        if (ms >= E.REACTION.TIMEOUT) li.className = 'slow';
        list.appendChild(li);
      });
      list.hidden = false;
      say(t('say.overRx', { ms: avg }));
    }
    $('over-best').hidden = !record;
    saveStats();
    persist(); // ván đã xong: xóa ván lưu, resume = null
    kit.sdk.end({ mode, won: false, score, assisted: false });
    kit.sfx(record ? 'win' : 'clear');
    if (record) kit.confetti();
    buzz([40, 40, 80]);
    clearTimeout(overTimer);
    overTimer = setTimeout(() => {
      if (state !== 'over') return;
      showOverlay('over');
      if (!kit.modal.current()) $('btn-again').focus();
    }, reduceMotion.matches ? 0 : OVER_DELAY);
  }

  /** Ván đang dở (đã chạm hoặc chơi ≥ 1 giây) thì hỏi trước, vì bỏ ván vẫn báo về cổng. */
  function requestNew() {
    if (inRound() && E.hasProgress(game)) {
      pause(false);
      $('confirm-text').textContent = game.mode === 'classic' ? t('confirm.text', { score: fmtN(game.score) }) : t('confirm.textRx');
      kit.modal.open('modal-confirm');
      return;
    }
    startRound();
  }

  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inRound() && E.hasProgress(game)) {
      if (game.mode === 'classic') {
        const s = E.summary(game);
        stats.played++;
        stats.hits += s.hits;
        stats.taps += s.hits + s.misses;
        stats.bestStreak = Math.max(stats.bestStreak, s.bestStreak);
      } else stats.rxPlayed++;
      saveStats();
      kit.sdk.end({ mode: game.mode, won: false, score: game.mode === 'classic' ? game.score : 0, assisted: false });
    }
    startRound();
  }

  /** Về màn chờ để chọn chế độ khác. */
  function toMenu() {
    clearTimeout(overTimer);
    game = null;
    state = 'idle';
    fx = [];
    banner = null;
    onModePicked();
    showOverlay('start');
    $('btn-start').focus();
  }

  function onModePicked() {
    $('start-sub').textContent = t(pickedMode() === 'classic' ? 'start.classic' : 'start.reaction');
    if (state === 'idle') {
      renderHud();
      layout();
    }
  }

  /* ================================================================
   * Sự kiện
   * ================================================================ */
  $('btn-start').addEventListener('click', startRound);
  $('overlay-start').addEventListener('click', (e) => {
    if (e.target.closest('button, .segmented, .overlay-card')) return;
    startRound();
  });
  $('btn-resume').addEventListener('click', resume);
  $('btn-again').addEventListener('click', startRound);
  $('btn-menu').addEventListener('click', toMenu);
  $('btn-pause').addEventListener('click', togglePause);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = fmtN(stats.played);
    $('stats-best').textContent = stats.best == null ? '–' : fmtN(stats.best);
    $('stats-acc').textContent = stats.taps ? Math.round((stats.hits / stats.taps) * 100) + '%' : '–';
    $('stats-streak').textContent = fmtN(stats.bestStreak);
    $('stats-rx-played').textContent = fmtN(stats.rxPlayed);
    $('stats-rx-best').textContent = stats.rxBest == null ? '–' : fmtMs(stats.rxBest);
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current()) return;
    const k = e.key;
    const onControl = () => e.target && e.target.closest && e.target.closest('button, input, a, .segmented');
    if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
      // Đo phản ứng: Space là cú chạm (Enter không, để khỏi lỡ tay khi vừa bấm nút)
      if (state === 'playing' && game.mode === 'reaction' && k !== 'Enter') {
        e.preventDefault();
        if (!e.repeat) act(e.timeStamp, 0, 0);
        return;
      }
      // Space / Enter trên một nút đang focus là cú bấm của chính nút đó
      if (onControl()) return;
      if (state === 'idle') startRound();
      else if (state === 'paused') resume();
      else if (state === 'over' && overShown) startRound();
      else if (state !== 'playing') return;
    } else if (k === 'p' || k === 'P') {
      if (state !== 'playing' && state !== 'paused') return;
      togglePause();
    } else if (k === 'Escape') {
      if (state !== 'playing') return;
      pause(true);
    } else if (k === 'n' || k === 'N') requestNew();
    else return;
    e.preventDefault();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause(false);
  });
  kit.onLeave(persist);

  /* ================================================================
   * Khởi động: mở lại ván ngắm bắn dở nếu có
   * ================================================================ */
  readColors();
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 ? E.fromJSON(saved.game) : null;
  if (restored && restored.mode === 'classic' && !E.isOver(restored) && restored.t > 0) {
    game = restored;
    state = 'paused';
    lastSec = Math.ceil(E.timeLeft(game) / 1000);
    kit.sdk.start('classic', true);
    onModePicked();
    layout();
    showPaused();
    kit.toast(t('toast.saved'));
  } else {
    kit.store.remove(keys.save);
    onModePicked();
    showOverlay('start');
    layout();
    renderHud();
  }
  writeSummary();
  if (MODES.indexOf(settings().mode) < 0) kit.settings.set({ mode: 'classic' });

  // Lần đầu mở: hướng dẫn ngắn
  if (!settings().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
})();
