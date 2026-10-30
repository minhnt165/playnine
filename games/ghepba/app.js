/* =====================================================================
 * Ghép Ba - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Bàn vẽ trên <canvas> (nhân devicePixelRatio, tự co theo khung); viên vẽ sẵn thành ảnh nhỏ theo cỡ ô
 *   - Hoạt cảnh theo thời gian thật: đổi chỗ → xóa (hiệu ứng viên đặc biệt) → rơi → dây chuyền → xáo.
 *     Giảm chuyển động chỉ rút ngắn thời lượng; kết quả do engine tính trước nên logic giống hệt
 *   - Điều khiển: vuốt / kéo viên sang ô kề, hoặc chạm viên rồi chạm viên kề; bàn phím: mũi tên di con trỏ,
 *     Enter / Space chọn rồi mũi tên để đổi, Esc bỏ chọn, H gợi ý, N ván mới
 *   - Báo ván cho cổng (metric score_high, mode classic / daily):
 *     ván mới kit.sdk.start(mode); mở lại ván lưu dở kit.sdk.start(mode, true)
 *     hết 30 nước: kit.sdk.end({ mode, won: false, score }); bỏ ván đã đi ít nhất một nước: cũng gửi won false + điểm hiện có
 *   - Gợi ý (sau 5 s không đi hoặc phím H) không gửi assisted: chỉ chỉ ra một nước hợp lệ mà người chơi tự tìm được,
 *     không đổi điểm, không thêm nước, không xem trước viên mới rơi xuống
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const N = E.N;
  const HINT_MS = 5000;
  const kit = PNKit.init({
    gameId: 'ghepba',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { hint: true, vibrate: true, guideSeen: false },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const settings = kit.settings.get();
  const reduced = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const fmt = (n) => kit.i18n.fmtNumber(n);

  // Thời lượng hoạt cảnh (ms); giảm chuyển động: ngắn hơn hẳn nhưng vẫn đủ thấy viên đổi chỗ / rơi
  const durations = () => (reduced.matches
    ? { swap: 70, back: 120, clear: 90, fall: 110, shuffle: 160 }
    : { swap: 160, back: 300, clear: 260, fall: 300, shuffle: 520 });

  // Màu từng loại viên: sáng, gốc, tối (hình khác nhau nên người mù màu vẫn phân biệt được)
  const TILES = [
    ['#fca5a5', '#ef4444', '#b91c1c'], // tròn đỏ
    ['#93c5fd', '#3b82f6', '#1d4ed8'], // vuông xanh dương
    ['#fde68a', '#f5b301', '#b45309'], // tam giác vàng
    ['#86efac', '#22c55e', '#15803d'], // thoi xanh lá
    ['#d8b4fe', '#a855f7', '#7e22ce'], // lục giác tím
    ['#a5f3fc', '#06b6d4', '#0e7490'], // sao xanh ngọc
  ];

  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  let B = 320; // cạnh bàn (px CSS)
  let pad = 6; // lề trong của bàn
  let cs = 38; // cạnh ô
  let dpr = 1;
  let pal = {};
  const sprites = new Map();

  let game = null;
  let shownScore = 0; // điểm đang hiện (tăng dần theo từng bậc của hoạt cảnh)
  let anim = null; // { phases, i, t0, done }
  let sel = null; // ô đang chọn (chạm hoặc Enter)
  let picked = false; // đã chọn bằng phím: mũi tên tiếp theo là đổi chỗ
  let cursor = 27; // con trỏ bàn phím
  let kbd = false; // đang dùng bàn phím (hiện con trỏ)
  let ptr = null; // ngón tay / chuột đang nhấn: { id, i, sx, sy, used }
  let hint = null; // { a, b, t0 }
  let hintTimer = 0;
  let overTimer = 0;
  let pendingMode = null; // chế độ sẽ chuyển sang sau khi xác nhận bỏ ván
  let raf = 0;

  const stats = loadStats();

  function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const num = (x) => (Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
    const s = { played: num(raw.played), best: num(raw.best), total: num(raw.total), chain: num(raw.chain), specials: num(raw.specials), daily: {} };
    if (raw.daily && typeof raw.daily === 'object') {
      Object.keys(raw.daily).forEach((k) => { if (E.isDate(k) && Number.isFinite(raw.daily[k])) s.daily[k] = raw.daily[k]; });
    }
    return s;
  }

  /* ---------------- Ngày (giờ máy) ---------------- */
  function dateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const today = () => dateKey(new Date());
  const dailyDone = () => stats.daily[today()] != null;
  /** Chuỗi ngày liên tiếp đã chơi bàn hằng ngày, tính tới hôm nay (hoặc hôm qua nếu hôm nay chưa chơi). */
  function dailyStreak() {
    const d = new Date();
    if (!dailyDone()) d.setDate(d.getDate() - 1);
    let n = 0;
    while (stats.daily[dateKey(d)] != null) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  /* ---------------- Cỡ bàn, màu ---------------- */
  function readPalette() {
    const cs2 = getComputedStyle(document.documentElement);
    const v = (name) => cs2.getPropertyValue(name).trim();
    pal = { board: v('--board-bg'), cellA: v('--cell-a'), cellB: v('--cell-b'), sel: v('--sel'), cursor: v('--cursor'), hint: v('--hint') };
  }

  function layout() {
    const st = $('stage');
    const size = Math.max(160, Math.floor(Math.min(st.clientWidth, st.clientHeight)));
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    if (size === B && ratio === dpr && canvas.width === Math.round(B * dpr)) return draw();
    B = size;
    dpr = ratio;
    pad = Math.round(B * 0.02);
    cs = (B - 2 * pad) / N;
    document.documentElement.style.setProperty('--board', B + 'px');
    canvas.width = Math.round(B * dpr);
    canvas.height = Math.round(B * dpr);
    sprites.clear();
    draw();
  }

  /* ---------------- Vẽ viên ---------------- */
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  /** Đa giác bo góc (bán kính r) qua các đỉnh pts. */
  function roundPoly(g, pts, r) {
    const n = pts.length;
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const s = mid(pts[n - 1], pts[0]);
    g.beginPath();
    g.moveTo(s[0], s[1]);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const m = mid(p, pts[(i + 1) % n]);
      g.arcTo(p[0], p[1], m[0], m[1], r);
    }
    g.closePath();
  }
  const ring = (n, rad, start, inner) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = start + (i * Math.PI * 2) / n;
      out.push([Math.cos(a) * rad, Math.sin(a) * rad]);
      if (inner) {
        const b = a + Math.PI / n;
        out.push([Math.cos(b) * inner, Math.sin(b) * inner]);
      }
    }
    return out;
  };
  /** Hình của loại k quanh gốc tọa độ, "bán kính" u: tròn, vuông, tam giác, thoi, lục giác, sao. */
  function shapePath(g, k, u) {
    if (k === 0) {
      g.beginPath();
      g.arc(0, 0, u * 0.95, 0, Math.PI * 2);
    } else if (k === 1) roundRect(g, -u * 0.84, -u * 0.84, u * 1.68, u * 1.68, u * 0.3);
    else if (k === 2) roundPoly(g, [[0, -u * 1.02], [u * 1.02, u * 0.8], [-u * 1.02, u * 0.8]], u * 0.2);
    else if (k === 3) roundPoly(g, [[0, -u * 1.08], [u * 0.86, 0], [0, u * 1.08], [-u * 0.86, 0]], u * 0.16);
    else if (k === 4) roundPoly(g, ring(6, u * 1.0, -Math.PI / 2), u * 0.16);
    else roundPoly(g, ring(5, u * 1.1, -Math.PI / 2, u * 0.5), u * 0.08);
  }
  function fillShape(g, k, u, S) {
    const [light, base, dark] = TILES[k];
    shapePath(g, k, u);
    const gr = g.createLinearGradient(-u, -u, u, u);
    gr.addColorStop(0, light);
    gr.addColorStop(0.5, base);
    gr.addColorStop(1, dark);
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.28)';
    g.shadowBlur = S * 0.05;
    g.shadowOffsetY = S * 0.03;
    g.fillStyle = gr;
    g.fill();
    g.restore();
    g.lineWidth = Math.max(1, S * 0.035);
    g.strokeStyle = dark;
    g.stroke();
    // Bóng sáng phía trên
    g.save();
    g.clip();
    g.globalAlpha = 0.38;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(-u * 0.22, -u * 0.55, u * 0.6, u * 0.28, -0.35, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  /** Vẽ một viên vào ô vuông cạnh S (ảnh dùng lại cho mọi lần vẽ). */
  function drawTile(g, v, S) {
    g.save();
    g.translate(S / 2, S / 2);
    const u = S * 0.37;
    if (E.isRainbow(v)) {
      // Cầu vồng: quả cầu sáu múi màu của sáu loại, tâm trắng, viền trắng
      const R = u * 1.08;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, R, -Math.PI / 2 + (i * Math.PI) / 3, -Math.PI / 2 + ((i + 1) * Math.PI) / 3);
        g.closePath();
        g.fillStyle = TILES[i][1];
        g.fill();
      }
      const rg = g.createRadialGradient(-R * 0.2, -R * 0.25, 0, 0, 0, R);
      rg.addColorStop(0, 'rgba(255,255,255,0.95)');
      rg.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.beginPath();
      g.arc(0, 0, R, 0, Math.PI * 2);
      g.fillStyle = rg;
      g.fill();
      g.lineWidth = Math.max(1.5, S * 0.05);
      g.strokeStyle = '#ffffff';
      g.stroke();
      g.lineWidth = Math.max(1, S * 0.02);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.arc(0, 0, R + S * 0.03, 0, Math.PI * 2);
      g.stroke();
      g.restore();
      return;
    }
    const k = E.kindOf(v);
    const sp = E.spOf(v);
    if (sp === E.SP.BOMB) {
      // Bom: vỏ tròn tối, viền màu của loại, hình nhỏ ở giữa, tia lửa ở góc
      g.beginPath();
      g.arc(0, 0, S * 0.43, 0, Math.PI * 2);
      g.fillStyle = '#262a40';
      g.fill();
      g.lineWidth = S * 0.07;
      g.strokeStyle = TILES[k][1];
      g.stroke();
      g.beginPath();
      g.arc(0, 0, S * 0.47, 0, Math.PI * 2);
      g.lineWidth = Math.max(1, S * 0.025);
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.stroke();
      fillShape(g, k, u * 0.62, S);
      g.fillStyle = '#ffe27a';
      roundPoly(g, ring(4, S * 0.1, -Math.PI / 2, S * 0.035).map(([x, y]) => [x + S * 0.3, y - S * 0.3]), 0.5);
      g.fill();
      g.restore();
      return;
    }
    fillShape(g, k, u, S);
    if (sp === E.SP.ROW || sp === E.SP.COL) {
      // Sọc: ba vạch trắng theo hướng xóa + mũi tên hai đầu
      const across = sp === E.SP.ROW;
      g.save();
      shapePath(g, k, u);
      g.clip();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      for (let j = -1; j <= 1; j++) {
        const o = j * u * 0.52;
        const w = u * 0.2;
        if (across) g.fillRect(-u * 1.2, o - w / 2, u * 2.4, w);
        else g.fillRect(o - w / 2, -u * 1.2, w, u * 2.4);
      }
      g.restore();
      const a = S * 0.1;
      const e = S * 0.47;
      const tri = (pts) => {
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        g.lineTo(pts[1][0], pts[1][1]);
        g.lineTo(pts[2][0], pts[2][1]);
        g.closePath();
        g.fillStyle = '#ffffff';
        g.fill();
        g.lineWidth = Math.max(1, S * 0.025);
        g.strokeStyle = TILES[k][2];
        g.stroke();
      };
      if (across) {
        tri([[-e, 0], [-e + a, -a * 0.9], [-e + a, a * 0.9]]);
        tri([[e, 0], [e - a, -a * 0.9], [e - a, a * 0.9]]);
      } else {
        tri([[0, -e], [-a * 0.9, -e + a], [a * 0.9, -e + a]]);
        tri([[0, e], [-a * 0.9, e - a], [a * 0.9, e - a]]);
      }
    }
    g.restore();
  }
  function sprite(v) {
    let s = sprites.get(v);
    if (s) return s;
    const S = Math.max(8, Math.round(cs * dpr));
    s = document.createElement('canvas');
    s.width = S;
    s.height = S;
    drawTile(s.getContext('2d'), v, S);
    sprites.set(v, s);
    return s;
  }

  /* ---------------- Vẽ bàn ---------------- */
  const cx = (c) => pad + (c + 0.5) * cs;
  const cy = (r) => pad + (r + 0.5) * cs;
  const easeOut = (x) => 1 - (1 - x) * (1 - x) * (1 - x);
  const easeIn = (x) => x * x;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  /** Vẽ viên v với tâm ở (hàng r, cột c) (có thể lẻ), co giãn s, độ mờ a. */
  function tileAt(v, r, c, s, a) {
    if (v < 0 || s <= 0.01) return;
    const size = cs * (s == null ? 1 : s);
    ctx.globalAlpha = a == null ? 1 : a;
    ctx.drawImage(sprite(v), cx(c) - size / 2, cy(r) - size / 2, size, size);
    ctx.globalAlpha = 1;
  }
  function drawBoardTiles(board, skip) {
    for (let i = 0; i < N * N; i++) {
      if (skip && skip.has(i)) continue;
      const [r, c] = E.rc(i);
      tileAt(board[i], r, c, 1, 1);
    }
  }

  function drawPhase(ph, p) {
    if (ph.type === 'swap') {
      const q = ph.back ? (p < 0.5 ? easeOut(p * 2) : easeOut((1 - p) * 2)) : easeOut(p);
      const [ra, ca] = E.rc(ph.a);
      const [rb, cb] = E.rc(ph.b);
      drawBoardTiles(ph.board, new Set([ph.a, ph.b]));
      tileAt(ph.board[ph.b], rb + (ra - rb) * q, cb + (ca - cb) * q, 1, 1);
      tileAt(ph.board[ph.a], ra + (rb - ra) * q, ca + (cb - ca) * q, 1 + 0.08 * Math.sin(q * Math.PI), 1);
    } else if (ph.type === 'clear') {
      const st = ph.step;
      const gone = new Set(st.cleared);
      drawBoardTiles(st.before, gone);
      const shrink = 1 - easeIn(clamp01(p * 1.4));
      st.cleared.forEach((i) => {
        const [r, c] = E.rc(i);
        tileAt(st.before[i], r, c, shrink * (1 + 0.15 * Math.sin(p * Math.PI)), shrink);
      });
      const grow = easeOut(clamp01((p - 0.35) / 0.65));
      st.spawned.forEach((s) => {
        const [r, c] = E.rc(s.i);
        tileAt(s.v, r, c, grow * (1 + 0.2 * Math.sin(grow * Math.PI)), 1);
      });
      drawEffects(st, p);
    } else if (ph.type === 'fall') {
      const st = ph.step;
      const q = easeIn(p);
      for (let i = 0; i < N * N; i++) {
        const [r, c] = E.rc(i);
        const from = st.from[i];
        tileAt(st.after[i], from + (r - from) * q, c, 1, 1);
      }
    } else if (ph.type === 'shuffle') {
      const board = p < 0.5 ? ph.before : ph.after;
      const s = p < 0.5 ? 1 - easeIn(p * 2) : easeOut((p - 0.5) * 2);
      for (let i = 0; i < N * N; i++) {
        const [r, c] = E.rc(i);
        tileAt(board[i], r, c, s, 1);
      }
    }
  }

  /** Vệt sáng của viên đặc biệt khi nổ: tia ngang / dọc, vòng nổ, tia cầu vồng tới các viên bị hút, chớp cả bàn. */
  function drawEffects(st, p) {
    const a = 1 - p;
    ctx.save();
    st.effects.forEach((ef) => {
      const [r, c] = E.rc(ef.i);
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ffffff';
      if (ef.type === 'row') {
        const h = cs * 0.6 * (1 - p * 0.6);
        ctx.fillRect(pad, cy(r) - h / 2, B - 2 * pad, h);
      } else if (ef.type === 'col') {
        const w = cs * 0.6 * (1 - p * 0.6);
        ctx.fillRect(cx(c) - w / 2, pad, w, B - 2 * pad);
      } else if (ef.type === 'bomb') {
        ctx.lineWidth = cs * 0.3 * a + 1;
        ctx.beginPath();
        ctx.arc(cx(c), cy(r), (ef.r + 0.5) * cs * (0.35 + 0.65 * easeOut(p)), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = a * 0.3;
        ctx.fill();
      } else if (ef.type === 'rainbow') {
        ctx.lineWidth = cs * 0.09;
        ctx.lineCap = 'round';
        st.cleared.forEach((i) => {
          if (E.kindOf(st.before[i]) !== ef.k || E.isRainbow(st.before[i])) return;
          const [y, x] = E.rc(i);
          ctx.beginPath();
          ctx.moveTo(cx(c), cy(r));
          ctx.lineTo(cx(c) + (cx(x) - cx(c)) * easeOut(clamp01(p * 2)), cy(r) + (cy(y) - cy(r)) * easeOut(clamp01(p * 2)));
          ctx.stroke();
        });
      } else if (ef.type === 'all') {
        ctx.globalAlpha = a * 0.7;
        ctx.fillRect(pad, pad, B - 2 * pad, B - 2 * pad);
      }
    });
    ctx.restore();
  }

  function ringAt(i, color, width, grow) {
    const [r, c] = E.rc(i);
    const s = cs * (0.96 + (grow || 0));
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    roundRect(ctx, cx(c) - s / 2, cy(r) - s / 2, s, s, cs * 0.2);
    ctx.stroke();
  }

  function draw(now) {
    const time = now || performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, B, B);
    ctx.fillStyle = pal.board;
    roundRect(ctx, 0, 0, B, B, B * 0.035);
    ctx.fill();
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        ctx.fillStyle = (r + c) % 2 ? pal.cellB : pal.cellA;
        roundRect(ctx, pad + c * cs + cs * 0.04, pad + r * cs + cs * 0.04, cs * 0.92, cs * 0.92, cs * 0.16);
        ctx.fill();
      }
    }
    if (!game) return;
    // Viên mới rơi từ trên xuống: chỉ thấy phần nằm trong bàn
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad, B - 2 * pad, B - 2 * pad);
    ctx.clip();
    const ph = anim && anim.phases[anim.i];
    if (ph) drawPhase(ph, clamp01((time - anim.t0) / ph.dur));
    else drawBoardTiles(game.board);
    ctx.restore();
    if (ph) return;

    const over = E.isOver(game);
    if (over) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      roundRect(ctx, 0, 0, B, B, B * 0.035);
      ctx.fill();
      return;
    }
    // Gợi ý: hai viên nhấp nháy (giảm chuyển động: viền đứng yên)
    if (hint) {
      const k = reduced.matches ? 1 : 0.55 + 0.45 * Math.sin(((time - hint.t0) / 1000) * Math.PI * 2.2);
      ctx.globalAlpha = k;
      ringAt(hint.a, pal.hint, Math.max(2, cs * 0.08));
      ringAt(hint.b, pal.hint, Math.max(2, cs * 0.08));
      ctx.globalAlpha = 1;
    }
    const held = ptr && !ptr.used ? ptr.i : null;
    if (sel != null) ringAt(sel, pal.sel, Math.max(2.5, cs * 0.09), 0.02);
    if (held != null && held !== sel) ringAt(held, pal.sel, Math.max(2, cs * 0.06));
    if (kbd) {
      ctx.setLineDash([cs * 0.14, cs * 0.1]);
      ringAt(cursor, pal.cursor, Math.max(2, cs * 0.05), 0.06);
      ctx.setLineDash([]);
      if (picked) {
        // Mũi tên nhỏ quanh viên đã chọn: bấm mũi tên để đổi
        const [r, c] = E.rc(cursor);
        ctx.fillStyle = pal.sel;
        [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => {
          const x = cx(c) + dx * cs * 0.62;
          const y = cy(r) + dy * cs * 0.62;
          const s = cs * 0.1;
          ctx.beginPath();
          ctx.moveTo(x + dx * s, y + dy * s);
          ctx.lineTo(x - dy * s - dx * s * 0.2, y + dx * s - dy * s * 0.2);
          ctx.lineTo(x + dy * s - dx * s * 0.2, y - dx * s - dy * s * 0.2);
          ctx.closePath();
          ctx.fill();
        });
      }
    }
  }

  /** Vẽ khung tiếp theo; vòng lặp chỉ chạy khi có hoạt cảnh hoặc gợi ý nhấp nháy. */
  function frame(now) {
    raf = 0;
    tick(now);
    draw(now);
    if (anim || (hint && !reduced.matches)) raf = requestAnimationFrame(frame);
  }
  function requestDraw() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  /* ---------------- Hoạt cảnh ---------------- */
  const busy = () => !!anim;
  function play(phases, done) {
    anim = { phases, i: 0, t0: performance.now(), done };
    phaseStart(phases[0], false);
    requestDraw();
  }
  function tick(now) {
    if (!anim) return;
    let ph = anim.phases[anim.i];
    while (ph && now - anim.t0 >= ph.dur) {
      const late = now - anim.t0 - ph.dur > 250; // tab vừa quay lại: chạy nhanh qua, không phát âm thanh dồn
      anim.t0 += ph.dur;
      anim.i++;
      ph = anim.phases[anim.i];
      if (ph) phaseStart(ph, late);
    }
    if (!ph) {
      const done = anim.done;
      anim = null;
      if (done) done();
    }
  }
  /** Bắt đầu một đoạn hoạt cảnh: âm thanh, rung, điểm bay lên, điểm trên HUD tăng theo bậc. */
  function phaseStart(ph, late) {
    if (ph.type === 'clear') {
      const st = ph.step;
      shownScore += st.points;
      renderHud();
      if (late) return;
      const big = st.effects.length > 0;
      kit.sfx(st.mult >= 2 ? 'combo' : big ? 'capture' : 'clear');
      if (st.spawned.length) setTimeout(() => kit.sfx(st.spawned.some((s) => E.isRainbow(s.v)) ? 'levelup' : 'pop'), 90);
      if ((big || st.mult >= 3) && settings.vibrate && navigator.vibrate) {
        try { navigator.vibrate(big ? 25 : 12); } catch (e) { /* bỏ qua */ }
      }
      popScore(st);
    } else if (ph.type === 'shuffle' && !late) {
      kit.toast(t('toast.shuffle'));
      kit.sfx('flip');
    }
  }

  function popScore(st) {
    if (reduced.matches) return;
    let sr = 0;
    let sc = 0;
    st.cleared.forEach((i) => {
      sr += E.rc(i)[0];
      sc += E.rc(i)[1];
    });
    const el = document.createElement('div');
    el.className = 'pop';
    el.style.left = cx(sc / st.cleared.length) + 'px';
    el.style.top = cy(sr / st.cleared.length) + 'px';
    el.textContent = '+' + fmt(st.points);
    if (st.mult >= 2) {
      const s = document.createElement('small');
      s.textContent = t('pop.chain', { n: st.mult });
      el.appendChild(s);
    }
    $('fx').appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  /* ---------------- HUD, tóm tắt ---------------- */
  function renderHud() {
    $('score').textContent = fmt(shownScore);
    $('moves').textContent = fmt(game ? E.movesLeft(game) : E.MOVES);
    $('best').textContent = fmt(Math.max(stats.best, shownScore));
    document.querySelectorAll('#modes button').forEach((b) => {
      const on = !!game && b.dataset.mode === game.mode;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }

  const inPlay = () => !!game && game.moves > 0 && !E.isOver(game);
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: stats.played,
      won: 0,
      note: stats.best > 0 ? t('summary.note', { score: fmt(stats.best) }) : t('summary.none'),
      stats: stats.best > 0 ? [{ value: fmt(stats.best), label: t('hud.best') }] : [],
      resume: inPlay()
        ? { title: t('app.name') + ' · ' + t('mode.' + game.mode), detail: t('summary.detail', { score: fmt(game.score), left: E.movesLeft(game) }), pct: game.moves / E.MOVES }
        : null,
      daily: { date: today(), done: dailyDone(), title: t('summary.dailyTitle'), streak: dailyStreak() },
      now: Date.now(),
    }));
  }
  function persist() {
    if (inPlay()) kit.store.write(keys.save, { v: 1, game: E.toJSON(game) });
    else kit.store.remove(keys.save);
    writeSummary();
  }
  /** Ghi ván vừa xong (hết nước hoặc bỏ dở) vào thống kê; trả về có phải kỷ lục mới không. */
  function record() {
    const best = game.score > stats.best;
    stats.played++;
    stats.total += game.score;
    stats.chain = Math.max(stats.chain, game.maxChain);
    stats.specials += game.made;
    if (best) stats.best = game.score;
    if (game.mode === 'daily') {
      stats.daily[game.date] = game.score;
      // Giữ khoảng 400 ngày gần nhất
      const ks = Object.keys(stats.daily).sort();
      while (ks.length > 400) delete stats.daily[ks.shift()];
    }
    saveStats();
    return best;
  }

  /* ---------------- Luồng ván ---------------- */
  function resetView() {
    anim = null;
    sel = null;
    picked = false;
    ptr = null;
    hint = null;
    clearTimeout(overTimer);
    $('over-banner').hidden = true;
    $('fx').textContent = '';
  }

  function newGame(mode) {
    resetView();
    const m = mode === 'daily' && !dailyDone() ? 'daily' : 'classic';
    game = m === 'daily' ? E.newGame({ mode: 'daily', date: today() }) : E.newGame({ mode: 'classic' });
    shownScore = 0;
    kit.store.remove(keys.save);
    kit.sdk.start(game.mode);
    renderHud();
    writeSummary();
    draw();
    idle();
  }

  /** Đổi viên ở a sang ô kề b: hợp lệ thì chạy cả nước (engine tính trước, giao diện diễn lại); không thì đổi rồi trả lại. */
  function trySwap(a, b) {
    if (busy() || !game || E.isOver(game) || b < 0) return;
    sel = null;
    picked = false;
    hint = null;
    const D = durations();
    if (!E.canSwap(game, a, b)) {
      kit.sfx('error');
      $('live').textContent = t('live.invalid');
      play([{ type: 'swap', board: game.board, a, b, back: true, dur: D.back }], idle);
      return;
    }
    const prev = game;
    const res = E.swap(game, a, b);
    game = res.game;
    if (kbd) cursor = b;
    const phases = [{ type: 'swap', board: prev.board, a, b, back: false, dur: D.swap }];
    res.steps.forEach((st) => {
      phases.push({ type: 'clear', step: st, dur: D.clear });
      phases.push({ type: 'fall', step: st, dur: D.fall });
    });
    if (res.shuffle) phases.push({ type: 'shuffle', before: res.shuffle.before, after: res.shuffle.after, dur: D.shuffle });
    kit.sfx('move');
    renderHud();
    // Ván xong thì báo cổng ngay (rời trang giữa hoạt cảnh vẫn đủ), hộp kết quả hiện sau hoạt cảnh
    const over = E.isOver(game);
    const best = over ? record() : false;
    if (over) kit.sdk.end({ mode: game.mode, won: false, score: game.score, assisted: false });
    persist();
    play(phases, () => {
      shownScore = game.score;
      renderHud();
      $('live').textContent = t('live.move', { gained: fmt(res.gained), score: fmt(game.score), left: E.movesLeft(game) });
      if (over) showOver(best);
      else idle();
    });
  }

  /** Hết 30 nước: băng "Hết nước" trên bàn, lát sau mở hộp kết quả. */
  function showOver(best) {
    kit.sfx(best ? 'win' : 'lose');
    $('over-banner').hidden = false;
    $('live').textContent = t('board.over');
    $('over-score').textContent = fmt(game.score);
    $('over-chain').textContent = '×' + game.maxChain;
    $('over-best').hidden = !best;
    const daily = game.mode === 'daily';
    $('over-daily').hidden = !daily;
    if (daily) $('over-daily').textContent = t('over.daily', { n: dailyStreak() });
    $('btn-again').textContent = daily ? t('over.classic') : t('kit.playAgain');
    draw();
    clearTimeout(overTimer);
    overTimer = setTimeout(() => {
      kit.modal.open('modal-over');
      if (best) kit.confetti();
    }, reduced.matches ? 400 : 1200);
  }

  /** Ván mới (nút / phím N): ván đang dở thì hỏi trước, vì bỏ ván sẽ kết thúc và gửi điểm hiện có. */
  function requestNew(mode) {
    if (busy()) return;
    const target = mode || (game ? game.mode : 'classic');
    if (inPlay()) {
      pendingMode = target;
      $('confirm-title').textContent = mode && mode !== game.mode ? t('confirm.titleMode') : t('confirm.title');
      $('confirm-text').textContent = t('confirm.text', { score: fmt(game.score) });
      kit.modal.open('modal-confirm');
    } else {
      kit.modal.closeAll();
      newGame(target);
    }
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inPlay()) {
      record();
      kit.sdk.end({ mode: game.mode, won: false, score: game.score, assisted: false });
    }
    const m = pendingMode;
    pendingMode = null;
    newGame(m || 'classic');
  }

  function switchMode(m) {
    if (busy() || !game) return;
    if (m === game.mode && !E.isOver(game)) return;
    if (m === 'daily' && dailyDone()) {
      kit.toast(t('toast.dailyDone', { score: fmt(stats.daily[today()]) }), 2600);
      return;
    }
    requestNew(m);
  }

  /* ---------------- Gợi ý ---------------- */
  /** Hẹn giờ gợi ý lại từ đầu (mỗi lần người chơi làm gì đó). */
  function idle() {
    clearTimeout(hintTimer);
    if (hint) {
      hint = null;
      requestDraw();
    }
    if (settings.hint && game && !E.isOver(game)) hintTimer = setTimeout(() => showHint(false), HINT_MS);
  }
  /** Nước gợi ý: nước ăn nhiều viên nhất ngay lúc đổi (cầu vồng / hai viên đặc biệt coi như rất nhiều). */
  function bestMove() {
    const moves = E.findMoves(game.board);
    let best = null;
    let bv = -1;
    moves.forEach(([a, b]) => {
      const va = game.board[a];
      const vb = game.board[b];
      let v;
      if (E.isSpecial(va) && E.isSpecial(vb)) v = 100;
      else if (E.isRainbow(va) || E.isRainbow(vb)) v = 50;
      else {
        const bd = game.board.slice();
        bd[a] = vb;
        bd[b] = va;
        v = E.findRuns(bd).reduce((s, r) => s + r.cells.length, 0);
      }
      if (v > bv) {
        bv = v;
        best = [a, b];
      }
    });
    return best;
  }
  function showHint(force) {
    if (!game || E.isOver(game)) return;
    if (busy() || kit.modal.current() || document.hidden) {
      if (!force) hintTimer = setTimeout(() => showHint(false), 1000);
      return;
    }
    const m = bestMove();
    if (!m) return;
    hint = { a: m[0], b: m[1], t0: performance.now() };
    requestDraw();
  }

  /* ---------------- Chạm / kéo ---------------- */
  function cellAt(x, y) {
    const rect = canvas.getBoundingClientRect();
    const k = B / rect.width;
    const c = Math.floor(((x - rect.left) * k - pad) / cs);
    const r = Math.floor(((y - rect.top) * k - pad) / cs);
    return r >= 0 && c >= 0 && r < N && c < N ? E.idx(r, c) : -1;
  }
  function neighbor(i, dr, dc) {
    const [r, c] = E.rc(i);
    return r + dr >= 0 && r + dr < N && c + dc >= 0 && c + dc < N ? E.idx(r + dr, c + dc) : -1;
  }
  function tapCell(i) {
    if (sel == null) {
      sel = i;
      kit.sfx('tap');
    } else if (sel === i) {
      sel = null;
    } else if (E.adjacent(sel, i)) {
      trySwap(sel, i);
      return;
    } else {
      sel = i;
      kit.sfx('tap');
    }
    draw();
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || kit.modal.current() || busy() || !game || E.isOver(game)) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
    kbd = false;
    picked = false;
    ptr = { id: e.pointerId, i, sx: e.clientX, sy: e.clientY, used: false };
    idle();
    draw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!ptr || e.pointerId !== ptr.id || ptr.used) return;
    const k = B / canvas.getBoundingClientRect().width;
    const dx = (e.clientX - ptr.sx) * k;
    const dy = (e.clientY - ptr.sy) * k;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < cs * 0.32) return;
    // Vuốt đủ xa: đổi với ô kề theo hướng vuốt
    ptr.used = true;
    const horiz = Math.abs(dx) > Math.abs(dy);
    const target = neighbor(ptr.i, horiz ? 0 : Math.sign(dy), horiz ? Math.sign(dx) : 0);
    if (target >= 0) trySwap(ptr.i, target);
    else draw();
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    const p = ptr;
    ptr = null;
    if (!p.used) tapCell(p.i);
    else draw();
  });
  canvas.addEventListener('pointercancel', () => {
    ptr = null;
    draw();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------------- Bàn phím ---------------- */
  function tileName(v) {
    if (E.isRainbow(v)) return t('tile.rainbow');
    const name = t('tile.' + E.kindOf(v));
    const sp = E.spOf(v);
    return sp === E.SP.ROW ? t('tile.row', { name }) : sp === E.SP.COL ? t('tile.col', { name }) : sp === E.SP.BOMB ? t('tile.bomb', { name }) : name;
  }
  function announceCursor() {
    const [r, c] = E.rc(cursor);
    $('live').textContent = t('live.cell', { r: r + 1, c: c + 1, name: tileName(game.board[cursor]) });
  }

  const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key;
    const onControl = e.target && e.target.closest && e.target.closest('button, input, a, select');
    if (ARROWS[k]) {
      if (onControl && e.target.closest('.segmented')) return; // mũi tên trong nhóm chế độ
      const [dr, dc] = ARROWS[k];
      if (!kbd) {
        kbd = true;
        if (sel != null) cursor = sel;
      } else if (picked) {
        const to = neighbor(cursor, dr, dc);
        if (to >= 0) trySwap(cursor, to);
      } else {
        const to = neighbor(cursor, dr, dc);
        if (to >= 0) {
          cursor = to;
          kit.sfx('tap', { volume: 0.4 });
        }
      }
      if (!busy()) announceCursor();
    } else if (k === 'Enter' || k === ' ') {
      if (onControl) return; // để trình duyệt bấm nút đang focus
      if (busy() || E.isOver(game)) return e.preventDefault();
      if (!kbd) {
        kbd = true;
        if (sel != null) cursor = sel;
      } else if (picked) {
        picked = false;
        sel = null;
      } else {
        picked = true;
        sel = cursor;
        kit.sfx('tap');
        $('live').textContent = t('live.picked', { name: tileName(game.board[cursor]) });
      }
    } else if (k === 'Escape') {
      if (!picked && sel == null) return;
      picked = false;
      sel = null;
    } else if (k === 'n' || k === 'N') {
      requestNew();
    } else if (k === 'h' || k === 'H') {
      idle();
      showHint(true);
    } else return;
    e.preventDefault();
    if (k !== 'h' && k !== 'H') idle();
    draw();
  });

  /* ---------------- Nút ---------------- */
  $('btn-new').addEventListener('click', () => requestNew());
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', () => {
    kit.modal.close('modal-over');
    newGame('classic');
  });
  document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => switchMode(b.dataset.mode)));
  $('modes').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const other = Array.from(document.querySelectorAll('#modes button')).find((b) => b.getAttribute('aria-checked') !== 'true');
    if (other) other.focus();
  });
  $('btn-stats').addEventListener('click', () => {
    $('stats-played').textContent = fmt(stats.played);
    $('stats-best').textContent = fmt(stats.best);
    $('stats-avg').textContent = fmt(stats.played ? Math.round(stats.total / stats.played) : 0);
    $('stats-chain').textContent = stats.chain ? '×' + stats.chain : '–';
    $('stats-specials').textContent = fmt(stats.specials);
    $('stats-streak').textContent = fmt(dailyStreak());
  });
  if (!navigator.vibrate) $('setting-vibrate').hidden = true;

  function onSetting(key) {
    if (key === 'theme') {
      readPalette();
      draw();
    } else if (key === 'hint') {
      idle();
    }
  }
  if (window.matchMedia) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      readPalette();
      draw();
    });
  }

  /** Hình minh họa các loại viên trong hộp Cách chơi. */
  function drawLegend() {
    const lg = $('legend');
    const g = lg.getContext('2d');
    const r = Math.min(3, window.devicePixelRatio || 1);
    lg.width = 320 * r;
    lg.height = 56 * r;
    const vals = [0, 1, 2, 3, 4, 5, E.make(0, E.SP.ROW), E.make(3, E.SP.BOMB), E.RAINBOW];
    const S = 34 * r;
    vals.forEach((v, i) => {
      const img = document.createElement('canvas');
      img.width = S;
      img.height = S;
      drawTile(img.getContext('2d'), v, S);
      g.drawImage(img, (i * 35.5 + 1) * r, 11 * r, S, S);
    });
  }

  kit.onLeave(persist);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestDraw();
  });
  if (window.ResizeObserver) new ResizeObserver(layout).observe($('stage'));
  window.addEventListener('resize', layout);
  readPalette();
  layout();
  drawLegend();

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const restored = saved && saved.v === 1 && E.fromJSON(saved.game);
  if (restored && restored.moves > 0 && !E.isOver(restored)) {
    game = restored;
    shownScore = game.score;
    kit.sdk.start(game.mode, true);
    kit.toast(t('toast.saved'));
    renderHud();
    writeSummary();
    draw();
    idle();
  } else {
    newGame('classic');
  }
  // Lần đầu mở: hướng dẫn ngắn
  if (!settings.guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
})();
