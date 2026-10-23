/* =====================================================================
 * Bắn Bóng - Logic giao diện (cần i18n.js, engine.js nạp trước)
 *   - Vẽ sân trên <canvas> theo DPR: sân logic 352 x 440 co giãn vừa khung, bóng vẽ sẵn ra sprite theo màu
 *   - Engine tính trọn phát bắn ngay khi bắn; app chỉ diễn hoạt: bóng bay theo đường (có nảy tường),
 *     trong lúc bay vẫn vẽ bàn cũ, chạm đích thì đổi sang bàn mới + nổ / rơi / đẩy hàng
 *   - Vòng lặp requestAnimationFrame theo dt, chỉ chạy khi có gì chuyển động
 *   - Điều khiển: rê chuột / kéo ngón tay để ngắm, nhấp / thả tay để bắn; ←/→ ngắm, Space / Enter / ↑ bắn,
 *     X đổi bóng, P / Esc tạm dừng (tự dừng khi ẩn trang)
 *   - Lưu ván, cài đặt, thống kê vào localStorage; ghi tóm tắt cho cổng PlayNine
 * ===================================================================== */
(function () {
  'use strict';
  const PN = window.PlayNine || null; // SDK PlayNine: chỉ có khi chạy trong cổng
  PN && PN.init({ gameId: 'banbong' });

  const APP_VERSION = '1.0.0';
  const MODE = 'classic';
  const E = window.BanBong;
  const I18N = window.I18N;
  const t = I18N.t;
  // Chữ tĩnh trong trang theo ngôn ngữ đã chọn, trước khi vẽ nội dung động
  I18N.apply();

  // Mọi khóa localStorage đều có tiền tố playnine-banbong- (cổng đồng bộ save / stats / settings / summary lên tài khoản)
  const KEYS = {
    settings: 'playnine-banbong-settings-v1',
    save: 'playnine-banbong-save-v1',
    stats: 'playnine-banbong-stats-v1',
    summary: 'playnine-banbong-summary-v1',
  };
  const SHOT_SPEED = 1000; // px logic / giây
  const AIM_SPEED = 1.6; // rad / giây khi giữ phím ←/→
  const POP_MS = 240; // bóng nổ phình ra rồi mờ đi
  const PUSH_MS = 280; // hàng mới trượt xuống
  const NEWBOARD_MS = 650; // bàn mới rơi từ trên xuống sau khi dọn sạch
  const OVER_DELAY = 650; // chờ trước khi hiện lớp phủ hết ván
  const BANNER_MS = 1500;
  const GRAVITY = 1500; // bóng rơi (px logic / giây²)
  const THEMES = ['auto', 'light', 'dark'];
  // Bóng kế (chạm để đổi) và các chấm đếm phát trượt, toạ độ px logic
  const NEXT_X = E.SX - 76;
  const NEXT_Y = E.SY + 12;
  const NEXT_SCALE = 0.78;
  const DOTS_X = E.SX + 52;
  const DOTS_Y = E.SY + 12;
  const AIM_MIN_DY = E.R * 0.6; // ngón tay / chuột phải cao hơn súng chừng này mới tính là ngắm

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fmt = (n) => I18N.fmtNumber(n);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const fxOn = () => !reduceMotion.matches; // hiệu ứng trang trí (mảnh vỡ, điểm bay); chuyển động chính luôn chạy
  // Âm thanh / pháo giấy của SDK: SDK cũ hoặc thiếu thì bỏ qua, không bao giờ làm hỏng game
  const sfx = (name, o) => {
    try {
      PN && PN.sfx && PN.sfx.play(name, o);
    } catch (e) { /* bỏ qua */ }
  };
  const confetti = () => {
    try {
      PN && PN.fx && PN.fx.confetti();
    } catch (e) { /* bỏ qua */ }
  };

  /* ---------------- localStorage (mọi truy cập đều bọc try/catch) ---------------- */
  function readJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }
  function removeKey(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }

  /* ---------------- Cài đặt ---------------- */
  function loadSettings() {
    const s = readJSON(KEYS.settings) || {};
    return {
      theme: THEMES.includes(s.theme) ? s.theme : 'auto',
      vibrate: s.vibrate !== false,
      guideSeen: s.guideSeen === true,
    };
  }
  const settings = loadSettings();
  const saveSettings = () => writeJSON(KEYS.settings, settings);

  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    const meta = $('theme-color');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#f3f4fb';
    readColors();
    draw();
  }

  /* ---------------- Thống kê ---------------- */
  function emptyStats() {
    return { played: 0, best: 0, boards: 0, popped: 0, dropped: 0, bestCombo: 0 };
  }
  function loadStats() {
    const s = readJSON(KEYS.stats);
    const out = emptyStats();
    if (!s || typeof s !== 'object') return out;
    Object.keys(out).forEach((k) => (out[k] = Number.isInteger(s[k]) && s[k] >= 0 ? s[k] : 0));
    return out;
  }
  let stats = loadStats();
  const saveStats = () => writeJSON(KEYS.stats, stats);

  /* ---------------- Trạng thái ván ----------------
   * mode: 'idle' (lớp phủ bắt đầu, bàn mẫu làm nền) | 'playing' | 'paused' | 'over'
   * counted: ván đã được tính vào "ván đã chơi" chưa (tính ở phát bắn đầu tiên)
   * runOpen / reported: đã báo cổng bắt đầu ván / đã gửi kết quả ván hiện tại
   * shownScore: điểm đang hiện (chỉ cộng khi bóng chạm đích, engine thì cộng ngay lúc bắn) */
  let game = E.newGame();
  let mode = 'idle';
  let counted = false;
  let bestAtStart = 0;
  let runOpen = false;
  let reported = false;
  let shownScore = 0;
  let aim = 0; // góc ngắm (radian, 0 = thẳng lên)

  const hasOpenGame = () => !!game && !game.over && (mode === 'playing' || mode === 'paused');
  const inProgress = () => hasOpenGame() && counted;

  function loadGame() {
    const saved = readJSON(KEYS.save);
    const g = saved && E.restore(saved.game);
    if (!g || g.over) return false;
    game = g;
    counted = saved.counted === true;
    bestAtStart = Number.isInteger(saved.bestAtStart) ? saved.bestAtStart : stats.best;
    shownScore = game.score;
    return true;
  }
  function saveGame() {
    if (inProgress()) writeJSON(KEYS.save, { v: 1, game: E.toJSON(game), counted, bestAtStart });
    else removeKey(KEYS.save);
  }

  /** Tóm tắt cho thẻ game ở cổng PlayNine. */
  function writeSummary() {
    const list = [];
    if (stats.best > 0) list.push({ value: fmt(stats.best), label: t('sum.best') });
    if (stats.boards > 0) list.push({ value: fmt(stats.boards), label: t('sum.boards') });
    if (stats.popped > 0) list.push({ value: fmt(stats.popped), label: t('sum.popped') });
    const note = stats.best > 0 ? t('sum.noteBest', { score: fmt(stats.best) }) : t('sum.note');
    writeJSON(KEYS.summary, {
      v: 1,
      updatedAt: Date.now(),
      played: stats.played,
      won: 0,
      note,
      stats: list,
      resume: inProgress() ? { title: t('sum.resume'), detail: detailText(), pct: null } : null,
      daily: null,
    });
  }

  function persist() {
    saveGame();
    saveStats();
    writeSummary();
  }

  /** Cập nhật kỷ lục theo ván đang chơi. */
  function updateRecords() {
    if (!counted) return;
    if (game.score > stats.best) stats.best = game.score;
    if (game.bestCombo > stats.bestCombo) stats.bestCombo = game.bestCombo;
  }

  /* ---------------- Cổng PlayNine: mỗi ván một lần start / end ---------------- */
  function beginRun(resume) {
    runOpen = true;
    reported = false;
    PN && PN.gameStart(resume ? { mode: MODE, resume: true } : { mode: MODE });
  }
  /** Gửi kết quả ván (trò chơi tính điểm vô tận: won luôn false). Bỏ ván giữa chừng khi chưa có điểm thì
   *  không gửi (ván mới ghi đè ván cũ ở cổng), để không có ván 0 điểm vô nghĩa. */
  function endRun() {
    if (runOpen && !reported && (game.over || game.score > 0)) {
      reported = true;
      PN && PN.gameEnd({ mode: MODE, won: false, score: game.score });
    }
    runOpen = false;
  }

  /* ---------------- DOM ---------------- */
  const boardEl = $('board');
  const boardArea = $('board-area');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  const pauseBtn = $('btn-pause');
  const overlays = { start: $('overlay-start'), pause: $('overlay-pause'), over: $('overlay-over') };

  /* ---------------- Màu (đọc từ biến CSS để theo giao diện sáng / tối) ---------------- */
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name, def) => cs.getPropertyValue(name).trim() || def;
    colors = {
      bg: v('--board-bg', '#e9edfa'),
      bg2: v('--board-bg2', '#d9dff4'),
      line: v('--board-line', 'rgba(0,0,0,0.07)'),
      danger: v('--danger', '#d6455d'),
      guide: v('--guide', 'rgba(0,0,0,0.5)'),
      shooter: v('--shooter', '#5a3be0'),
      shooter2: v('--shooter-2', '#8b6cff'),
      text: v('--text', '#14162b'),
      muted: v('--muted', '#5d6285'),
      accent: v('--accent', '#6a4cf5'),
      surface: v('--surface', '#ffffff'),
      ball: [null],
    };
    for (let i = 1; i <= E.NCOLORS; i++) colors.ball.push(v('--bb-' + i, '#888888'));
    sprites = [];
  }

  /* ---------------- Canvas: kích thước theo DPR ---------------- */
  let dpr = 1;
  let scale = 1; // px canvas trên mỗi px logic

  function resize() {
    const w = boardEl.clientWidth;
    const h = boardEl.clientHeight;
    if (!w || !h) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const Wc = Math.max(1, Math.round(w * dpr));
    const Hc = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== Wc || canvas.height !== Hc) {
      canvas.width = Wc;
      canvas.height = Hc;
      sprites = [];
    }
    scale = Wc / E.W;
    draw();
  }

  /* ---------------- Sprite bóng (vẽ sẵn mỗi màu một lần theo cỡ hiện tại) ---------------- */
  let sprites = [];
  /** Ký hiệu trắng riêng cho từng màu để không phải dựa vào màu sắc. */
  function glyph(c, k, x, y, s) {
    c.beginPath();
    if (k === 1) {
      c.arc(x, y, s * 0.55, 0, Math.PI * 2);
      c.fill();
    } else if (k === 2) {
      c.moveTo(x, y - s * 0.75);
      c.lineTo(x + s * 0.72, y + s * 0.5);
      c.lineTo(x - s * 0.72, y + s * 0.5);
      c.closePath();
      c.fill();
    } else if (k === 3) {
      c.rect(x - s * 0.55, y - s * 0.55, s * 1.1, s * 1.1);
      c.fill();
    } else if (k === 4) {
      c.moveTo(x, y - s * 0.8);
      c.lineTo(x + s * 0.65, y);
      c.lineTo(x, y + s * 0.8);
      c.lineTo(x - s * 0.65, y);
      c.closePath();
      c.fill();
    } else if (k === 5) {
      c.rect(x - s * 0.22, y - s * 0.75, s * 0.44, s * 1.5);
      c.rect(x - s * 0.75, y - s * 0.22, s * 1.5, s * 0.44);
      c.fill();
    } else {
      c.lineWidth = s * 0.34;
      c.arc(x, y, s * 0.55, 0, Math.PI * 2);
      c.stroke();
    }
  }

  function sprite(k) {
    if (sprites[k]) return sprites[k];
    const r = E.R * scale;
    const size = Math.ceil(r * 2) + 2;
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const c = cv.getContext('2d');
    const cx = size / 2;
    const base = colors.ball[k] || '#888888';
    // Thân bóng: màu gốc, tối dần về mép dưới phải, viền mảnh
    c.fillStyle = base;
    c.beginPath();
    c.arc(cx, cx, r - 0.5, 0, Math.PI * 2);
    c.fill();
    const shade = c.createRadialGradient(cx - r * 0.35, cx - r * 0.4, r * 0.1, cx, cx, r);
    shade.addColorStop(0, 'rgba(255,255,255,0.38)');
    shade.addColorStop(0.45, 'rgba(255,255,255,0.05)');
    shade.addColorStop(1, 'rgba(0,0,0,0.28)');
    c.fillStyle = shade;
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.22)';
    c.lineWidth = Math.max(1, r * 0.06);
    c.stroke();
    // Ký hiệu + vệt sáng
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    glyph(c, k, cx + r * 0.05, cx + r * 0.08, r * 0.42);
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.beginPath();
    c.ellipse(cx - r * 0.42, cx - r * 0.45, r * 0.22, r * 0.13, -0.7, 0, Math.PI * 2);
    c.fill();
    sprites[k] = cv;
    return cv;
  }

  /** Vẽ một bóng màu k, tâm (x, y) px logic, phóng to theo s. */
  function drawBall(k, x, y, s, alpha) {
    if (!k) return;
    const sp = sprite(k);
    const size = (sp.width / scale) * (s || 1);
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.drawImage(sp, x - size / 2, y - size / 2, size, size);
    if (alpha != null) ctx.globalAlpha = 1;
  }

  /* ---------------- Hiệu ứng ---------------- */
  let flight = null; // { ev, snap, lens: quãng đường tới từng điểm của đường bay, total, dist, bounced }
  let drag = null; // kéo / bấm trên bàn: { id, swap, cancel }
  let pops = []; // bóng nổ: { x, y, k, life }
  let falls = []; // bóng rơi: { x, y, vx, vy, k }
  let particles = []; // mảnh vỡ trang trí
  let popups = []; // chữ bay lên
  let shift = null; // bàn trượt xuống: { from, life, dur } (đẩy hàng / bàn mới)

  function burst(x, y, k, n) {
    if (!fxOn()) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 140;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0, max: 0.35 + Math.random() * 0.3, size: 2 + Math.random() * 2.5, k });
    }
    if (particles.length > 300) particles.splice(0, particles.length - 300);
  }

  function popup(x, y, text, color) {
    if (!fxOn()) return;
    popups.push({ x, y, text, color: color || colors.text, life: 0, max: 0.9 });
    if (popups.length > 20) popups.shift();
  }

  function updateFx(s) {
    pops = pops.filter((p) => (p.life += s) < POP_MS / 1000);
    falls = falls.filter((f) => {
      f.vy += GRAVITY * s;
      f.x += f.vx * s;
      f.y += f.vy * s;
      if (f.x < E.R || f.x > E.W - E.R) f.vx = -f.vx * 0.6;
      return f.y < E.H + E.R * 2;
    });
    particles = particles.filter((p) => {
      p.life += s;
      p.vy += 600 * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      return p.life < p.max;
    });
    popups = popups.filter((p) => {
      p.life += s;
      p.y -= 30 * s;
      return p.life < p.max;
    });
    if (shift && (shift.life += s * 1000) >= shift.dur) shift = null;
  }
  const fxActive = () => !!flight || !!shift || pops.length > 0 || falls.length > 0 || particles.length > 0 || popups.length > 0;

  function resetEffects() {
    flight = null;
    pops = [];
    falls = [];
    particles = [];
    popups = [];
    shift = null;
    hideBanner();
  }

  /* ---------------- Đường ngắm ---------------- */
  let guideCache = null; // { key, tr }
  let boardVersion = 0; // tăng mỗi khi bàn đổi để tính lại đường ngắm
  function guide() {
    const key = boardVersion + ':' + aim.toFixed(4);
    if (!guideCache || guideCache.key !== key) guideCache = { key, tr: E.trace(game, aim) };
    return guideCache.tr;
  }

  /* ---------------- Vẽ một khung hình ---------------- */
  /** Bàn đang hiện: khi bóng còn bay thì vẽ bàn trước phát bắn. */
  const view = () => (flight ? flight.snap : game);

  function drawBoard() {
    const v = view();
    let oy = 0;
    if (shift) oy = shift.from * (1 - easeOut(Math.min(1, shift.life / shift.dur)));
    for (let r = 0; r < v.rows.length; r++) {
      const row = v.rows[r];
      for (let c = 0; c < E.COLS; c++) {
        if (!row[c]) continue;
        const p = E.cellXY(v, r, c);
        drawBall(row[c], p.x, p.y + oy);
      }
    }
  }

  /** Vạch nguy hiểm: đậm hơn khi bóng thấp nhất còn cách 2 hàng trở xuống. */
  function drawDanger() {
    const v = view();
    let low = -1;
    v.rows.forEach((row, r) => row.some((x) => x) && (low = r));
    const near = low >= E.DANGER_ROW - 2;
    ctx.save();
    ctx.strokeStyle = colors.danger;
    ctx.globalAlpha = near ? 0.95 : 0.4;
    ctx.lineWidth = near ? 2.2 : 1.4;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(6, E.DANGER_Y);
    ctx.lineTo(E.W - 6, E.DANGER_Y);
    ctx.stroke();
    ctx.restore();
  }

  function drawGuide() {
    if (mode !== 'playing' || flight || (drag && drag.cancel) || modalOpen()) return;
    const tr = guide();
    // Chỉ vẽ tới lần nảy tường thứ hai (một lần nảy)
    const pts = tr.points.slice(0, Math.min(tr.points.length, 3));
    const full = tr.bounces <= 1;
    ctx.fillStyle = colors.guide;
    const skip = E.R + 8; // bỏ đoạn đè lên bóng trên súng
    let carry = 0;
    const STEP = 13;
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      let d = carry;
      while (d <= len) {
        const along = total + d;
        if (along >= skip) {
          const k = d / (len || 1);
          ctx.globalAlpha = clamp(1 - along / 620, 0.25, 0.9);
          ctx.beginPath();
          ctx.arc(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        d += STEP;
      }
      carry = d - len;
      total += len;
    }
    ctx.globalAlpha = 1;
    // Đường bay hiện trọn (không nảy quá một lần): vẽ vòng mờ ở ô sẽ dính
    if (full && tr.cell) {
      const p = E.cellXY(game, tr.cell.r, tr.cell.c);
      ctx.strokeStyle = colors.ball[game.current];
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, E.R - 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  function drawShooter() {
    const x = E.SX;
    const y = E.SY;
    // Đế súng: nửa hình tròn ở đáy
    ctx.fillStyle = colors.line;
    ctx.beginPath();
    ctx.arc(x, E.H + 6, 58, Math.PI, 0);
    ctx.fill();
    // Nòng: mũi tên theo góc ngắm
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(aim);
    const g = ctx.createLinearGradient(0, 0, 0, -E.R - 20);
    g.addColorStop(0, colors.shooter);
    g.addColorStop(1, colors.shooter2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-6, -E.R + 2);
    ctx.lineTo(6, -E.R + 2);
    ctx.lineTo(6, -E.R - 10);
    ctx.lineTo(11, -E.R - 10);
    ctx.lineTo(0, -E.R - 22);
    ctx.lineTo(-11, -E.R - 10);
    ctx.lineTo(-6, -E.R - 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Vòng quanh bóng chờ
    ctx.strokeStyle = colors.shooter;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, E.R + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Bóng chờ / bóng kế: trong lúc bóng bay, bóng kế trượt lên súng và bóng kế mới hiện dần
    const p = flight ? easeOut(Math.min(1, flight.dist / Math.max(1, flight.total))) : 1;
    drawBall(game.current, NEXT_X + (x - NEXT_X) * p, NEXT_Y + (y - NEXT_Y) * p, NEXT_SCALE + (1 - NEXT_SCALE) * p);
    drawBall(game.next, NEXT_X, NEXT_Y, NEXT_SCALE * p);
    // Nhãn "Kế" + mũi tên đổi bóng
    ctx.font = '700 10px "Be Vietnam Pro", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors.muted;
    ctx.fillText(t('canvas.next'), NEXT_X, NEXT_Y - E.R - 6);
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc((NEXT_X + x) / 2 - 4, y + 2, 9, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc((NEXT_X + x) / 2 - 4, y + 2, 9, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Các chấm đếm phát trượt còn lại trước khi thêm hàng. */
  function drawMisses() {
    const limit = E.missLimit(game.score);
    const used = Math.min(game.misses, limit);
    const gap = 11;
    const x0 = DOTS_X;
    for (let i = 0; i < limit; i++) {
      const x = x0 + i * gap;
      ctx.beginPath();
      ctx.arc(x, DOTS_Y, 3.6, 0, Math.PI * 2);
      if (i < used) {
        ctx.fillStyle = colors.danger;
        ctx.fill();
      } else {
        ctx.strokeStyle = colors.muted;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.font = '700 10px "Be Vietnam Pro", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors.muted;
    ctx.fillText(t('canvas.push', { n: limit - used }), x0 - 4, DOTS_Y - E.R - 6);
  }

  function drawFlight() {
    if (!flight) return;
    const pos = flightPos(flight.dist);
    drawBall(flight.ev.color, pos[0], pos[1]);
  }

  function drawFx() {
    pops.forEach((p) => {
      const k = p.life / (POP_MS / 1000);
      if (fxOn()) drawBall(p.k, p.x, p.y, 1 + k * 0.35, 1 - k);
    });
    falls.forEach((f) => drawBall(f.k, f.x, f.y));
    particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
      ctx.fillStyle = colors.ball[p.k];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    popups.forEach((p) => {
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
      ctx.font = '800 14px "Be Vietnam Pro", system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = colors.bg;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    });
    ctx.globalAlpha = 1;
  }

  function draw() {
    if (!game || !canvas.width) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, colors.bg);
    g.addColorStop(1, colors.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // Trần: một dải mờ ở mép trên
    ctx.fillStyle = colors.line;
    ctx.fillRect(0, 0, E.W, 3);
    drawDanger();
    drawBoard();
    drawGuide();
    drawFx();
    drawFlight();
    drawShooter();
    drawMisses();
  }

  /* ---------------- HUD ---------------- */
  const hudEls = { score: $('score'), best: $('best'), level: $('level') };
  const hudCache = {};
  function setText(key, text) {
    if (hudCache[key] === text) return;
    hudCache[key] = text;
    hudEls[key].textContent = text;
  }
  function bumpScore() {
    if (reduceMotion.matches) return;
    const el = hudEls.score;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
  function updateHud() {
    setText('score', fmt(shownScore));
    setText('best', fmt(Math.max(stats.best, counted ? shownScore : 0)));
    setText('level', String(flight ? flight.ev.level : game.level));
    pauseBtn.disabled = !hasOpenGame();
    const paused = mode === 'paused';
    pauseBtn.dataset.state = paused ? 'paused' : 'running';
    const label = paused ? t('btn.resume') : t('btn.pause');
    pauseBtn.setAttribute('aria-label', label);
    pauseBtn.title = t('btn.keySuffix', { label });
  }

  function floatScore(n) {
    if (!n || reduceMotion.matches) return;
    const el = document.createElement('span');
    el.className = 'score-float';
    el.textContent = '+' + fmt(n);
    el.setAttribute('aria-hidden', 'true');
    $('score-box').appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    setTimeout(() => el.remove(), 1200);
  }

  function announce(text) {
    const el = $('announcer');
    el.textContent = '';
    setTimeout(() => (el.textContent = text), 30);
  }

  let toastTimer = 0;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 1800);
  }

  let bannerTimer = 0;
  function showBanner(title, sub) {
    const el = $('banner');
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub || '';
    // Khởi động lại animation
    el.hidden = true;
    void el.offsetWidth;
    el.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => (el.hidden = true), BANNER_MS);
  }
  function hideBanner() {
    clearTimeout(bannerTimer);
    $('banner').hidden = true;
  }

  function vibrate(pattern) {
    if (!settings.vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) {}
  }

  /* ---------------- Lớp phủ ---------------- */
  function showOverlay(name) {
    Object.keys(overlays).forEach((k) => (overlays[k].hidden = k !== name));
  }
  function detailText() {
    return t('detail', { level: game.level, score: fmt(game.score) });
  }
  function renderStartBest() {
    const el = $('start-best');
    el.hidden = !stats.best;
    el.innerHTML = t('start.best', { score: fmt(stats.best) });
  }

  /* ---------------- Luồng chơi ---------------- */
  function startNewGame() {
    closeModal();
    clearTimeout(overTimer);
    endRun(); // bỏ ván đang dở: gửi điểm hiện có
    game = E.newGame();
    beginRun(false);
    sfx('start');
    counted = false;
    bestAtStart = stats.best;
    shownScore = 0;
    aim = 0;
    mode = 'playing';
    boardVersion++;
    resetEffects();
    releaseInput();
    showOverlay(null);
    updateHud();
    persist();
    if (!reduceMotion.matches) shift = { from: -E.levelConfig(1).rows * E.RH, life: 0, dur: NEWBOARD_MS };
    draw();
    boardEl.focus({ preventScroll: true });
    kick();
    announce(t('say.newGame'));
  }

  /** Ván mới: hỏi lại nếu đang dở ván. */
  function requestNewGame() {
    if (!inProgress()) {
      startNewGame();
      return;
    }
    pause(false);
    $('confirm-text').textContent = t('confirm.text', { detail: detailText().toLowerCase() });
    confirmAction = startNewGame;
    openModal('modal-confirm', $('btn-confirm-ok'));
  }

  function pause(focus) {
    if (mode !== 'playing') return;
    mode = 'paused';
    if (focus) sfx('tap', { pitch: 0.85 });
    releaseInput();
    $('pause-sub').textContent = detailText();
    showOverlay('pause');
    updateHud();
    persist();
    draw();
    if (focus && !modalOpen()) $('btn-resume').focus();
    announce(t('say.paused'));
  }

  function resume() {
    if (mode !== 'paused' || modalOpen()) return;
    mode = 'playing';
    sfx('tap', { pitch: 1.15 });
    showOverlay(null);
    releaseInput();
    updateHud();
    boardEl.focus({ preventScroll: true });
    draw();
    kick();
  }

  function togglePause() {
    if (mode === 'playing') pause(true);
    else if (mode === 'paused') resume();
  }

  let overTimer = 0;
  function gameOver() {
    mode = 'over';
    releaseInput();
    hideBanner();
    const record = counted && game.score > bestAtStart && game.score > 0;
    $('over-new-best').hidden = !record;
    $('over-score').textContent = fmt(game.score);
    $('over-best').textContent = fmt(Math.max(stats.best, game.score));
    $('over-board').textContent = String(game.level);
    sfx('lose');
    vibrate([70, 50, 110]);
    updateHud();
    announce(t('say.over', { score: fmt(game.score) }) + (record ? t('say.overRecord') : ''));
    clearTimeout(overTimer);
    overTimer = setTimeout(
      () => {
        if (mode !== 'over') return;
        showOverlay('over');
        if (!modalOpen()) $('btn-again').focus();
      },
      reduceMotion.matches ? 0 : OVER_DELAY
    );
  }

  /** Bắn bóng đang chờ theo góc ngắm. Engine tính xong ngay; phần còn lại là diễn hoạt. */
  function fire() {
    if (mode !== 'playing' || flight || modalOpen() || game.over) return;
    const snap = { rows: game.rows.map((r) => r.slice()), parity: game.parity };
    const ev = E.shoot(game, aim);
    if (!ev) return;
    boardVersion++;
    if (!counted) {
      counted = true;
      stats.played++;
    }
    stats.popped += ev.popped.length;
    stats.dropped += ev.dropped.length;
    if (ev.cleared) stats.boards++;
    updateRecords();
    // Hết ván: báo cổng và xoá ván lưu ngay (không đợi bóng bay xong, lỡ người chơi đóng trang)
    if (ev.over) endRun();
    persist();
    // Đường bay: tính quãng đường tới từng điểm để nội suy vị trí và phát tiếng nảy tường
    const lens = [0];
    for (let i = 1; i < ev.path.length; i++) {
      const [x0, y0] = ev.path[i - 1];
      const [x1, y1] = ev.path[i];
      lens.push(lens[i - 1] + Math.hypot(x1 - x0, y1 - y0));
    }
    flight = { ev, snap, lens, total: lens[lens.length - 1], dist: 0, bounced: 0 };
    sfx('move', { pitch: 1.2 });
    kick();
  }

  /** Vị trí bóng bay sau quãng đường d. */
  function flightPos(d) {
    const { ev, lens } = flight;
    let i = 1;
    while (i < lens.length - 1 && lens[i] < d) i++;
    const seg = lens[i] - lens[i - 1] || 1;
    const k = clamp((d - lens[i - 1]) / seg, 0, 1);
    const [x0, y0] = ev.path[i - 1];
    const [x1, y1] = ev.path[i];
    return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
  }

  /** Bóng chạm đích: đổi sang bàn mới, nổ / rơi / đẩy hàng / dọn bàn / hết ván. */
  function impact() {
    const ev = flight.ev;
    flight = null;
    shownScore = game.score;
    if (ev.popped.length) {
      const pitch = 1 + Math.min(ev.combo - 1, 4) * 0.1;
      sfx('pop', { pitch });
      if (ev.combo >= 3) sfx('combo', { pitch: 0.9 + Math.min(ev.combo - 3, 4) * 0.08 });
      let sx = 0;
      let sy = 0;
      ev.popped.forEach((b) => {
        pops.push({ x: b.x, y: b.y, k: b.color, life: 0 });
        burst(b.x, b.y, b.color, 5);
        sx += b.x;
        sy += b.y;
      });
      sx /= ev.popped.length;
      sy /= ev.popped.length;
      popup(sx, sy, '+' + fmt(ev.popPoints), colors.text);
      if (ev.combo >= 2) popup(sx, sy - 18, t('canvas.combo', { n: ev.combo }), colors.accent);
      bumpScore();
      floatScore(ev.points);
      let announceText = t('say.popped', { n: ev.popped.length, points: fmt(ev.points) });
      if (ev.dropped.length) {
        let dx = 0;
        let dy = 0;
        ev.dropped.forEach((b) => {
          falls.push({ x: b.x, y: b.y, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 120, k: b.color });
          dx += b.x;
          dy += b.y;
        });
        popup(dx / ev.dropped.length, dy / ev.dropped.length, t('canvas.drop', { n: fmt(ev.dropPoints) }), colors.accent);
        setTimeout(() => sfx(ev.dropped.length >= 5 ? 'coin' : 'drop'), 110);
        vibrate(20);
        announceText += t('say.dropped', { n: ev.dropped.length });
      }
      announce(announceText);
    } else {
      sfx('place');
    }
    if (ev.pushed) {
      shift = { from: -E.RH, life: 0, dur: PUSH_MS };
      setTimeout(() => sfx('drop', { pitch: 0.6 }), 60);
      vibrate(40);
      announce(t('say.pushed'));
    }
    if (ev.cleared) {
      sfx('levelup');
      confetti();
      vibrate([30, 50, 30]);
      showBanner(t('banner.clear'), t('banner.bonus', { n: fmt(ev.clearBonus) }));
      announce(t('say.cleared', { n: fmt(ev.clearBonus) }));
      if (!reduceMotion.matches) shift = { from: -E.levelConfig(game.level).rows * E.RH, life: 0, dur: NEWBOARD_MS };
    }
    updateHud();
    if (ev.over) gameOver();
  }

  /** Đổi bóng chờ với bóng kế. */
  function doSwap() {
    if (mode !== 'playing' || flight || modalOpen()) return;
    if (!E.swap(game)) return;
    sfx('flip');
    persist();
    draw();
    announce(t('say.swap'));
  }

  /* ---------------- Điều khiển ---------------- */
  const keysDown = new Set(); // 'left' | 'right'
  function releaseInput() {
    keysDown.clear();
    drag = null;
  }

  /** Toạ độ px logic của sự kiện chuột / chạm. */
  function logical(e) {
    const rect = boardEl.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / (rect.width || 1)) * E.W,
      y: ((e.clientY - rect.top) / (rect.height || 1)) * E.H,
    };
  }
  function aimAt(p) {
    const dy = Math.max(AIM_MIN_DY, E.SY - p.y);
    aim = clamp(Math.atan2(p.x - E.SX, dy), -E.MAX_ANGLE, E.MAX_ANGLE);
  }
  const inSwapZone = (p) => Math.hypot(p.x - NEXT_X, p.y - NEXT_Y) < 26 || Math.hypot(p.x - E.SX, p.y - E.SY) < E.R + 6;
  const aboveShooter = (p) => p.y < E.SY - AIM_MIN_DY;

  /* ---------------- Vòng lặp ---------------- */
  let raf = 0;
  let lastT = 0;

  const running = () => mode === 'playing' && !modalOpen() && document.visibilityState !== 'hidden';

  function frame(now) {
    raf = 0;
    const dt = lastT ? Math.min(now - lastT, 100) : 16;
    lastT = now;
    const s = dt / 1000;
    const live = running();
    if (live) {
      const dir = (keysDown.has('right') ? 1 : 0) - (keysDown.has('left') ? 1 : 0);
      if (dir) aim = clamp(aim + dir * AIM_SPEED * s, -E.MAX_ANGLE, E.MAX_ANGLE);
      if (flight) {
        flight.dist += SHOT_SPEED * s;
        // Tiếng nảy tường khi bóng đi qua từng điểm nảy (các điểm giữa của đường bay, trừ điểm chạm)
        const bounceIdx = flight.bounced + 1;
        if (bounceIdx <= flight.ev.bounces && flight.dist >= flight.lens[bounceIdx]) {
          flight.bounced++;
          sfx('tick');
        }
        if (flight.dist >= flight.total) impact();
      }
    }
    // Hiệu ứng vẫn chạy nốt khi tạm dừng / hết ván cho đẹp, trừ khi trang bị ẩn
    if (document.visibilityState !== 'hidden') updateFx(live || !flight ? s : 0);
    draw();
    const holdingKey = live && keysDown.size > 0;
    if ((live && (flight || holdingKey)) || (fxActive() && !(flight && !live))) raf = requestAnimationFrame(frame);
    else lastT = 0;
  }

  function kick() {
    if (raf) return;
    lastT = 0;
    raf = requestAnimationFrame(frame);
  }

  /* ---------------- Modal ---------------- */
  let openId = null;
  let returnFocus = null;
  let confirmAction = null;
  function modalOpen() {
    return openId !== null;
  }

  function openModal(id, focusEl) {
    pause(false);
    if (openId && openId !== id) $(openId).hidden = true;
    else returnFocus = document.activeElement;
    openId = id;
    const m = $(id);
    m.hidden = false;
    // Mặc định focus vào khung hộp thoại (không vào nút "Đặt lại" để tránh bấm nhầm bằng Enter)
    const card = m.querySelector('.modal-card');
    card.tabIndex = -1;
    (focusEl || card).focus();
    draw();
  }

  function closeModal() {
    if (!openId) return;
    if (openId === 'modal-help' && !settings.guideSeen) {
      settings.guideSeen = true;
      saveSettings();
    }
    $(openId).hidden = true;
    openId = null;
    const focusTarget =
      mode === 'paused' ? $('btn-resume') : mode === 'over' && !overlays.over.hidden ? $('btn-again') : mode === 'idle' ? $('btn-start') : null;
    if (focusTarget) focusTarget.focus();
    else if (returnFocus && document.body.contains(returnFocus) && !returnFocus.closest('[hidden]')) returnFocus.focus();
    else boardEl.focus({ preventScroll: true });
    returnFocus = null;
    updateHud();
    draw();
    kick();
  }

  function trapFocus(e) {
    const items = Array.from(
      $(openId).querySelectorAll('.modal-card button:not([disabled]), .modal-card input:not([disabled])')
    ).filter((b) => b.tabIndex >= 0);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (!items.includes(document.activeElement)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close]');
    if (closer) closeModal();
  });

  /* ---------------- Cài đặt ---------------- */
  function syncSettingsUI() {
    document.querySelectorAll('[role="radiogroup"][data-setting]').forEach((group) => {
      const cur = group.dataset.setting === 'lang' ? I18N.lang : String(settings[group.dataset.setting]);
      group.querySelectorAll('button[data-value]').forEach((b) => {
        const on = b.dataset.value === cur;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
    });
    document.querySelectorAll('.switch[data-setting]').forEach((sw) => (sw.checked = !!settings[sw.dataset.setting]));
  }

  function chooseSetting(key, value) {
    if (key === 'theme' && THEMES.includes(value)) {
      settings.theme = value;
      applyTheme();
    } else if (key === 'lang') {
      I18N.set(value); // lưu ván (onBeforeReload) rồi tải lại theo ngôn ngữ mới
      return;
    } else {
      return;
    }
    saveSettings();
    syncSettingsUI();
  }

  document.querySelectorAll('[role="radiogroup"][data-setting]').forEach((group) => {
    const key = group.dataset.setting;
    group.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-value]');
      if (b) chooseSetting(key, b.dataset.value);
    });
    // Phím mũi tên di chuyển trong nhóm radio (và chọn luôn)
    group.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const btns = Array.from(group.querySelectorAll('button[data-value]'));
      const i = btns.indexOf(document.activeElement);
      const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
      const next = btns[(i + step + btns.length) % btns.length];
      chooseSetting(key, next.dataset.value);
      next.focus();
    });
  });

  document.querySelectorAll('.switch[data-setting]').forEach((sw) => {
    sw.addEventListener('change', () => {
      settings[sw.dataset.setting] = sw.checked;
      saveSettings();
      if (sw.dataset.setting === 'vibrate' && sw.checked) vibrate(20);
    });
  });

  /* ---------------- Âm thanh: công tắc trong Cài đặt, dùng chung trạng thái tắt tiếng với cổng (playnine-sound-v1) ---------------- */
  const SFX = PN && PN.sfx;
  if (SFX && typeof SFX.isMuted === 'function' && typeof SFX.setMuted === 'function') {
    const sw = $('sound-switch');
    const sync = () => {
      sw.checked = !SFX.isMuted();
    };
    $('setting-sound').hidden = false;
    sync();
    if (typeof SFX.onChange === 'function') SFX.onChange(sync);
    sw.addEventListener('change', () => {
      SFX.setMuted(!sw.checked);
      if (sw.checked) sfx('tap');
    });
  }

  /* ---------------- Thống kê (modal) ---------------- */
  function renderStats() {
    $('st-played').textContent = fmt(stats.played);
    $('st-best').textContent = fmt(stats.best);
    $('st-boards').textContent = fmt(stats.boards);
    $('st-combo').textContent = fmt(stats.bestCombo);
    $('st-popped').textContent = fmt(stats.popped);
    $('st-dropped').textContent = fmt(stats.dropped);
  }

  let resetArmed = false;
  let resetTimer = 0;
  const resetBtn = $('btn-stats-reset');
  function disarmReset() {
    resetArmed = false;
    clearTimeout(resetTimer);
    resetBtn.textContent = t('stats.reset');
    resetBtn.classList.remove('btn-danger');
  }
  resetBtn.addEventListener('click', () => {
    if (!resetArmed) {
      // Bấm hai lần để tránh xóa nhầm
      resetArmed = true;
      resetBtn.textContent = t('stats.resetConfirm');
      resetBtn.classList.add('btn-danger');
      resetTimer = setTimeout(disarmReset, 3500);
      return;
    }
    disarmReset();
    stats = emptyStats();
    counted = false; // ván đang dở sẽ được tính lại ở phát bắn sau
    bestAtStart = 0;
    persist();
    renderStats();
    renderStartBest();
    updateHud();
    toast(t('toast.statsReset'));
  });

  /* ---------------- Nút bấm ---------------- */
  $('btn-new').addEventListener('click', requestNewGame);
  $('btn-start').addEventListener('click', startNewGame);
  $('btn-again').addEventListener('click', startNewGame);
  $('btn-resume').addEventListener('click', resume);
  $('btn-pause-new').addEventListener('click', requestNewGame);
  pauseBtn.addEventListener('click', togglePause);
  $('btn-confirm-ok').addEventListener('click', () => {
    const fn = confirmAction;
    confirmAction = null;
    if (fn) fn();
    else closeModal();
  });
  $('btn-settings').addEventListener('click', () => {
    syncSettingsUI();
    openModal('modal-settings');
  });
  $('btn-stats').addEventListener('click', () => {
    disarmReset();
    renderStats();
    openModal('modal-stats');
  });
  // Focus vào nút đóng ở đầu hộp thoại để nội dung hiện từ trên xuống (không cuộn tới nút cuối)
  const openHelp = () => openModal('modal-help', document.querySelector('#modal-help .help-head .btn-icon'));
  $('btn-help').addEventListener('click', openHelp);
  $('btn-settings-help').addEventListener('click', openHelp);

  /* ---------------- Bàn phím ---------------- */
  const KEY_DIRS = { ArrowLeft: 'left', ArrowRight: 'right', a: 'left', d: 'right', A: 'left', D: 'right' };

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (modalOpen()) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      } else if (e.key === 'Tab') {
        trapFocus(e);
      }
      return;
    }
    const onControl = e.target.closest && e.target.closest('button, input');
    // Enter / Space trên nút đang focus: để nút tự xử lý
    if (onControl && (e.key === ' ' || e.key === 'Enter')) return;

    const dir = KEY_DIRS[e.key];
    if (dir) {
      if (mode !== 'playing') return;
      e.preventDefault();
      if (!keysDown.has(dir)) {
        // Nhấp phím ngắn cũng xoay được một nấc nhỏ (1°)
        aim = clamp(aim + (dir === 'right' ? 1 : -1) * (Math.PI / 180), -E.MAX_ANGLE, E.MAX_ANGLE);
        keysDown.add(dir);
      }
      kick();
      return;
    }
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      if (e.repeat) return;
      if (mode === 'playing') fire();
      else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') return;
      else if (mode === 'paused') resume();
      else if (mode === 'idle' || (mode === 'over' && !overlays.over.hidden)) startNewGame();
      return;
    }
    if (e.repeat) return;
    if (e.key === 'x' || e.key === 'X') {
      e.preventDefault();
      doSwap();
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      togglePause();
    } else if (e.key === 'Escape') {
      if (mode === 'playing') pause(true);
    } else if (e.key === 'n' || e.key === 'N') {
      requestNewGame();
    } else if (e.key === 'h' || e.key === 'H' || e.key === '?') {
      openHelp();
    }
  });
  document.addEventListener('keyup', (e) => {
    const dir = KEY_DIRS[e.key];
    if (dir) keysDown.delete(dir);
  });

  /* ---------------- Chuột / cảm ứng trên vùng bàn chơi ----------------
   * Chuột: rê để ngắm (ngắm theo vị trí con trỏ), nhấp để bắn.
   * Cảm ứng / bút: chạm và kéo phía trên súng để ngắm, thả tay để bắn; kéo xuống ngang súng rồi thả là hủy.
   * Chạm bóng kế hoặc bóng trên súng: đổi bóng. */
  boardArea.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.overlay, button')) return; // để nút trên lớp phủ bấm bình thường
    if (mode !== 'playing' || modalOpen()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (drag) return; // ngón thứ hai: bỏ qua
    boardEl.focus({ preventScroll: true });
    const p = logical(e);
    if (inSwapZone(p)) {
      drag = { id: e.pointerId, swap: true, cancel: false };
    } else {
      drag = { id: e.pointerId, swap: false, cancel: !aboveShooter(p) };
      if (aboveShooter(p)) aimAt(p);
      draw();
    }
    try {
      boardArea.setPointerCapture(e.pointerId);
    } catch (err) {}
  });

  boardArea.addEventListener('pointermove', (e) => {
    if (mode !== 'playing' || modalOpen()) return;
    const p = logical(e);
    if (!drag) {
      // Chuột rê (không bấm): ngắm theo con trỏ khi con trỏ ở trên súng
      if (e.pointerType === 'mouse' && aboveShooter(p) && !keysDown.size) {
        aimAt(p);
        draw();
      }
      return;
    }
    if (drag.id !== e.pointerId || drag.swap) return;
    drag.cancel = !aboveShooter(p);
    if (!drag.cancel) aimAt(p);
    draw();
  });

  function endPointer(e, cancelled) {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag;
    drag = null;
    if (cancelled || mode !== 'playing') {
      draw();
      return;
    }
    const p = logical(e);
    if (d.swap) {
      if (inSwapZone(p)) doSwap();
    } else if (!d.cancel && aboveShooter(p)) {
      aimAt(p);
      fire();
    }
    draw();
  }
  boardArea.addEventListener('pointerup', (e) => endPointer(e, false));
  boardArea.addEventListener('pointercancel', (e) => endPointer(e, true));
  boardArea.addEventListener('contextmenu', (e) => e.preventDefault());
  // Chặn cuộn trang bằng cảm ứng khi kéo (dự phòng cho trình duyệt cũ)
  boardArea.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  /* ---------------- Tự dừng / lưu khi rời trang ---------------- */
  window.addEventListener('pagehide', () => {
    pause(false);
    persist();
  });
  // Đổi ngôn ngữ (ở đây hoặc ở cổng): tạm dừng và lưu ván trước khi tải lại
  I18N.onBeforeReload(() => {
    pause(false);
    persist();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      pause(false); // tự tạm dừng khi ẩn trang
      persist();
    } else {
      draw();
    }
  });

  const onSchemeChange = () => {
    if (settings.theme === 'auto') applyTheme();
  };
  const schemeMQ = window.matchMedia('(prefers-color-scheme: dark)');
  if (schemeMQ.addEventListener) schemeMQ.addEventListener('change', onSchemeChange);

  if (window.ResizeObserver) new ResizeObserver(resize).observe(boardEl);
  window.addEventListener('resize', resize);
  // Font tải xong thì vẽ lại chữ trên canvas
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);

  /* ---------------- Khởi động ---------------- */
  $('app-version').textContent = APP_VERSION;
  readColors();
  syncSettingsUI();
  applyTheme();
  if (loadGame()) {
    // Có ván đang dở: mở lại ở trạng thái tạm dừng
    mode = 'paused';
    beginRun(true);
    $('pause-sub').textContent = detailText();
    showOverlay('pause');
  } else {
    removeKey(KEYS.save);
    renderStartBest();
    showOverlay('start');
  }
  updateHud();
  resize();
  writeSummary();
  if (!settings.guideSeen) openHelp();
  else (mode === 'paused' ? $('btn-resume') : $('btn-start')).focus({ preventScroll: true });
})();
