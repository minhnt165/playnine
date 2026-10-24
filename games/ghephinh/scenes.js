/* =====================================================================
 * Ghép Hình - Cảnh vẽ thủ tục (không dùng ảnh): 10 cảnh vuông vẽ bằng canvas 2D, tất định theo seed
 *   - draw(ctx, index, size, seed): vẽ cảnh thứ index vào ô vuông size x size (px) ở gốc tọa độ hiện tại
 *   - Mọi cảnh vẽ trong hệ tọa độ 1000 x 1000; seed đổi bảng màu, bố cục, vị trí chi tiết
 *   - Mỗi vùng của hình phải khác nhau đủ để ghép bằng mắt: nền chuyển màu theo độ cao, chi tiết rải đều,
 *     hạn chế mảng một màu lớn
 *   - Chỉ gọi các lệnh canvas (không đọc thuộc tính của ctx) để test chạy được trên ngữ cảnh giả trong Node
 * ===================================================================== */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const KEYS = ['lake', 'city', 'garden', 'mosaic', 'reef', 'stars', 'balloons', 'terraces', 'beach', 'winter'];

  /* ---------------- Tiện ích ---------------- */

  /** mulberry32 + vài hàm chọn ngẫu nhiên. */
  function makeRand(seed) {
    let a = seed >>> 0;
    const r = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (lo, hi) => lo + (hi - lo) * r();
    r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    r.shuffle = (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const k = Math.floor(r() * (i + 1));
        [out[i], out[k]] = [out[k], out[i]];
      }
      return out;
    };
    return r;
  }

  const fx = (v) => (Math.round(v * 10) / 10).toString();
  /** Màu hsla; h tự quay vòng 0..360. */
  const H = (h, s, l, a) => 'hsla(' + fx(((h % 360) + 360) % 360) + ',' + fx(s) + '%,' + fx(Math.max(0, Math.min(100, l))) + '%,' + (a == null ? 1 : Math.round(a * 1000) / 1000) + ')';

  function lin(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((s) => g.addColorStop(s[0], s[1]));
    return g;
  }
  function rad(ctx, x, y, r0, r1, stops) {
    const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    stops.forEach((s) => g.addColorStop(s[0], s[1]));
    return g;
  }
  function rect(ctx, x, y, w, h, fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }
  function disc(ctx, x, y, r, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
    ctx.fill();
  }
  function ell(ctx, x, y, rx, ry, rot, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
    ctx.fill();
  }
  function trace(ctx, pts) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  }
  function poly(ctx, pts, fill) {
    ctx.fillStyle = fill;
    trace(ctx, pts);
    ctx.closePath();
    ctx.fill();
  }
  function stroke(ctx, pts, color, w) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    trace(ctx, pts);
    ctx.stroke();
  }
  function seg(ctx, x0, y0, x1, y1, color, w) {
    stroke(ctx, [[x0, y0], [x1, y1]], color, w);
  }

  /** Đường sống núi 0..1000 bằng chia đôi ngẫu nhiên (65 điểm). */
  function ridge(R, base, amp, rough) {
    const n = 64;
    const ys = new Array(n + 1);
    ys[0] = base + R.range(-amp, amp) * 0.5;
    ys[n] = base + R.range(-amp, amp) * 0.5;
    (function sub(a, b, d) {
      if (b - a < 2) return;
      const m = (a + b) >> 1;
      ys[m] = (ys[a] + ys[b]) / 2 + R.range(-d, d);
      sub(a, m, d * rough);
      sub(m, b, d * rough);
    })(0, n, amp);
    return ys.map((y, i) => [(i * 1000) / n, y]);
  }
  /** Đường mềm 0..1000: tổng hai sóng sin. */
  function wave(R, base, a1, a2, step) {
    const p1 = R.range(0, TAU);
    const p2 = R.range(0, TAU);
    const f1 = R.range(90, 180);
    const f2 = R.range(35, 70);
    const pts = [];
    for (let x = 0; x <= 1000; x += step || 20) pts.push([x, base + a1 * Math.sin(x / f1 + p1) + a2 * Math.sin(x / f2 + p2)]);
    return pts;
  }
  /** Độ cao của đường (mảng điểm theo x tăng) tại x. */
  function at(pts, x) {
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][0] >= x) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
      }
    }
    return pts[pts.length - 1][1];
  }
  /** Tô vùng giữa đường và đáy. */
  function fillUnder(ctx, pts, bottom, fill) {
    poly(ctx, [[0, bottom]].concat(pts, [[1000, bottom]]), fill);
  }

  function cloud(ctx, R, x, y, w, color, shade) {
    const n = R.int(4, 7);
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const r = w * (0.16 + 0.14 * Math.sin(Math.PI * t)) * R.range(0.85, 1.15);
      disc(ctx, x - w / 2 + w * t, y - r * 0.5, r, color);
    }
    ell(ctx, x, y, w * 0.55, w * 0.1, 0, shade || color);
  }
  /** Cây thông ba tầng, gốc tại (x, y). */
  function pine(ctx, x, y, h, col, snow) {
    rect(ctx, x - h * 0.035, y - h * 0.14, h * 0.07, h * 0.14, col);
    for (let k = 0; k < 3; k++) {
      const top = y - h * (1 - 0.24 * k);
      const bot = top + h * (0.42 + 0.04 * k);
      const hw = h * (0.15 + 0.07 * k);
      poly(ctx, [[x, top], [x + hw, bot], [x - hw, bot]], col);
      if (snow) poly(ctx, [[x, top], [x + hw * 0.5, top + (bot - top) * 0.45], [x + hw * 0.1, top + (bot - top) * 0.36], [x - hw * 0.25, top + (bot - top) * 0.5], [x - hw * 0.45, top + (bot - top) * 0.42]], snow);
    }
  }
  /** Cây tán tròn, gốc tại (x, y). */
  function bush(ctx, R, x, y, h, hue, light) {
    rect(ctx, x - h * 0.05, y - h * 0.45, h * 0.1, h * 0.45, H(28, 35, 28 + light * 0.2));
    for (let k = 0; k < 4; k++) disc(ctx, x + R.range(-0.22, 0.22) * h, y - h * R.range(0.55, 0.85), h * R.range(0.22, 0.3), H(hue + R.range(-8, 8), 45, light + R.range(-6, 4)));
    disc(ctx, x - h * 0.08, y - h * 0.78, h * 0.12, H(hue + 10, 50, light + 12, 0.8));
  }
  function stars(ctx, R, n, y0, y1, maxR) {
    for (let k = 0; k < n; k++) disc(ctx, R.range(0, 1000), R.range(y0, y1), R.range(0.6, maxR), H(R.pick([220, 50, 0]), 60, 95, R.range(0.35, 0.95)));
  }
  function birds(ctx, R, n, x0, x1, y0, y1, color) {
    for (let k = 0; k < n; k++) {
      const x = R.range(x0, x1);
      const y = R.range(y0, y1);
      const s = R.range(7, 15);
      ctx.lineCap = 'round';
      ctx.strokeStyle = color;
      ctx.lineWidth = s * 0.22;
      ctx.beginPath();
      ctx.moveTo(x - s, y - s * 0.35);
      ctx.quadraticCurveTo(x - s * 0.45, y - s * 0.55, x, y);
      ctx.quadraticCurveTo(x + s * 0.45, y - s * 0.55, x + s, y - s * 0.35);
      ctx.stroke();
    }
  }

  /* ---------------- 1. Hồ núi lúc hoàng hôn ---------------- */

  function lake(ctx, R) {
    const hs = R.range(-22, 22);
    const HZ = 560;
    rect(ctx, 0, 0, 1000, HZ, lin(ctx, 0, 0, 0, HZ, [[0, H(238 + hs, 48, 20)], [0.42, H(285 + hs, 42, 40)], [0.76, H(14 + hs, 84, 62)], [1, H(42 + hs, 95, 72)]]));
    stars(ctx, R, 40, 0, 170, 1.8);
    const sx = R.range(260, 740);
    const sy = HZ - R.range(50, 95);
    rect(ctx, 0, 0, 1000, HZ, rad(ctx, sx, sy, 0, 330, [[0, H(48, 100, 82, 0.75)], [0.35, H(28 + hs, 100, 68, 0.28)], [1, H(28, 100, 68, 0)]]));
    disc(ctx, sx, sy, 46, H(50, 100, 88));
    for (let k = 0; k < 8; k++) {
      const y = R.range(60, 400);
      const x = R.range(-60, 1060);
      const w = R.range(120, 300);
      const h = R.range(9, 22);
      ell(ctx, x, y, w, h, 0, H(325 + hs + y * 0.06, 55, 48 + y * 0.07, 0.55));
      ell(ctx, x + R.range(-30, 30), y + h * 0.55, w * 0.75, h * 0.4, 0, H(28 + hs, 95, 74, 0.55));
    }
    birds(ctx, R, R.int(5, 9), 80, 920, 140, 330, H(260 + hs, 40, 18, 0.8));

    const layers = [
      { pts: ridge(R, 335, 150, 0.56), col: H(262 + hs, 22, 63) },
      { pts: ridge(R, 420, 105, 0.58), col: H(256 + hs, 27, 45) },
      { pts: ridge(R, 492, 60, 0.62), col: H(248 + hs, 32, 29) },
    ];
    layers.forEach((L) => L.pts.forEach((p) => { p[1] = Math.min(p[1], HZ - 14); }));
    layers.forEach((L, i) => {
      fillUnder(ctx, L.pts, HZ, L.col);
      if (i === 0) {
        // Tuyết trên đỉnh: tô trong hình núi, mờ dần xuống dưới, ửng hồng phía có mặt trời
        const top = Math.min.apply(null, L.pts.map((p) => p[1]));
        ctx.save();
        trace(ctx, [[0, HZ]].concat(L.pts, [[1000, HZ]]));
        ctx.closePath();
        ctx.clip();
        rect(ctx, 0, top, 1000, 140, lin(ctx, 0, top, 0, top + 140, [[0, 'rgba(255,246,248,0.95)'], [0.5, 'rgba(255,226,236,0.55)'], [1, 'rgba(255,226,236,0)']]));
        rect(ctx, sx - 260, top, 520, 300, rad(ctx, sx, top + 200, 0, 280, [[0, H(25 + hs, 100, 70, 0.35)], [1, H(25, 100, 70, 0)]]));
        ctx.restore();
      }
      // Sương giữa các lớp
      rect(ctx, 0, HZ - 120 + i * 30, 1000, 120, lin(ctx, 0, HZ - 120 + i * 30, 0, HZ, [[0, H(20 + hs, 80, 75, 0)], [1, H(20 + hs, 80, 75, 0.22)]]));
    });
    for (let x = R.range(0, 20); x < 1000; x += R.range(14, 30)) pine(ctx, x, at(layers[2].pts, x) + 8, R.range(28, 58), H(248 + hs, 34, 20));

    // Mặt hồ + bóng núi
    rect(ctx, 0, HZ, 1000, 1000 - HZ, lin(ctx, 0, HZ, 0, 1000, [[0, H(38 + hs, 84, 64)], [0.22, H(305 + hs, 34, 42)], [1, H(240 + hs, 46, 15)]]));
    ctx.save();
    ctx.globalAlpha = 0.38;
    ctx.translate(0, 2 * HZ);
    ctx.scale(1, -1);
    layers.forEach((L) => fillUnder(ctx, L.pts, HZ, L.col));
    ctx.restore();
    for (let k = 0; k < 15; k++) {
      ell(ctx, sx + R.range(-14, 14), HZ + 8 + k * k * 2.1, Math.max(8, 74 - k * 4 + R.range(-10, 10)), 2 + k * 0.3, 0, H(46, 100, 80, Math.max(0.12, 0.75 - k * 0.04)));
    }
    ctx.lineCap = 'round';
    for (let k = 0; k < 140; k++) {
      const y = HZ + R.range(6, 440);
      const t = (y - HZ) / 440;
      const x = R.range(0, 1000);
      seg(ctx, x, y, x + R.range(20, 90) * (0.4 + t), y, H(30 + hs, 80, 85, R.range(0.06, 0.2)), 1.2 + 2.4 * t);
    }
    // Thuyền nhỏ
    const bx = R.range(560, 860);
    const by = R.range(680, 760);
    poly(ctx, [[bx - 48, by], [bx + 48, by], [bx + 34, by + 14], [bx - 34, by + 14]], H(250 + hs, 35, 14));
    disc(ctx, bx + 4, by - 20, 8, H(250 + hs, 35, 14));
    rect(ctx, bx - 2, by - 14, 12, 14, H(250 + hs, 35, 14));
    seg(ctx, bx + 10, by - 10, bx + 60, by + 26, H(250 + hs, 35, 14), 3);
    ell(ctx, bx, by + 22, 70, 4, 0, H(40, 90, 80, 0.25));

    // Bờ trước: đất tối, thông lớn, lau sậy
    const left = R.chance(0.5);
    ctx.save();
    if (!left) {
      ctx.translate(1000, 0);
      ctx.scale(-1, 1);
    }
    const shore = [[0, 790], [90, 800], [190, 850], [280, 900], [360, 960], [400, 1000], [0, 1000]];
    poly(ctx, shore, H(250 + hs, 30, 11));
    for (let k = 0; k < 6; k++) pine(ctx, R.range(10, 250), R.range(860, 990), R.range(120, 250), H(250 + hs, 32, 9 + k));
    for (let k = 0; k < 26; k++) {
      const x = R.range(250, 420);
      const y = 1000 - R.range(0, 70);
      seg(ctx, x, y, x + R.range(-12, 12), y - R.range(40, 110), H(40 + hs, 40, 22), 2.4);
    }
    ctx.restore();
    poly(ctx, [[1000, 940], [880, 960], [800, 1000], [1000, 1000]], H(250 + hs, 28, 13));
  }

  /* ---------------- 2. Thành phố về đêm ---------------- */

  function city(ctx, R) {
    const hs = R.range(-30, 30);
    const B = 700;
    rect(ctx, 0, 0, 1000, B, lin(ctx, 0, 0, 0, B, [[0, H(236 + hs, 60, 8)], [0.5, H(256 + hs, 50, 20)], [0.85, H(300 + hs, 45, 33)], [1, H(330 + hs, 55, 44)]]));
    stars(ctx, R, 170, 0, 480, 2);
    const mx = R.range(120, 880);
    const my = R.range(90, 200);
    rect(ctx, mx - 170, my - 170, 340, 340, rad(ctx, mx, my, 0, 170, [[0, H(50, 60, 90, 0.35)], [1, H(50, 60, 90, 0)]]));
    disc(ctx, mx, my, 44, H(48, 55, 90));
    for (let k = 0; k < 6; k++) disc(ctx, mx + R.range(-28, 28), my + R.range(-28, 28), R.range(4, 10), H(45, 20, 75, 0.5));

    // Dãy nhà xa
    for (let x = -10; x < 1000;) {
      const w = R.range(25, 60);
      const h = R.range(90, 250);
      rect(ctx, x, B - 30 - h, w, h + 30, H(252 + hs, 28, 21));
      for (let k = 0; k < 8; k++) rect(ctx, x + R.range(3, w - 6), B - 30 - h + R.range(6, h), 3, 4, H(45, 80, 70, R.range(0.3, 0.7)));
      x += w + R.range(-6, 3);
    }
    // Nhà gần: cửa sổ sáng / tắt, mái đủ kiểu, biển đèn neon
    const near = [];
    for (let x = -20; x < 1000;) {
      const w = R.range(60, 130);
      const h = R.range(170, 440);
      const hue = R.pick([215, 235, 260, 285, 195, 25]) + hs;
      const top = B - h;
      const body = H(hue, 24, R.range(13, 23));
      rect(ctx, x, top, w, h, body);
      rect(ctx, x, top, 4, h, H(hue, 30, 30, 0.6));
      const roof = R.int(0, 3);
      if (roof === 1) rect(ctx, x + w * 0.2, top - 30, w * 0.6, 30, body);
      if (roof === 2) poly(ctx, [[x + w * 0.15, top], [x + w / 2, top - R.range(50, 110)], [x + w * 0.85, top]], body);
      if (roof !== 2) {
        seg(ctx, x + w * 0.7, top - (roof === 1 ? 30 : 0), x + w * 0.7, top - 70, body, 3);
        disc(ctx, x + w * 0.7, top - 72, 4, H(0, 90, 60));
      }
      const lit = [];
      const hueWin = R.pick([45, 40, 52, 190]);
      for (let yy = top + 14; yy < B - 22; yy += 18) {
        for (let xx = x + 7; xx < x + w - 12; xx += 14) {
          const on = R.chance(0.5);
          const c = on ? H(hueWin + R.range(-6, 6), 90, R.range(62, 80)) : H(hue, 22, 9);
          rect(ctx, xx, yy, 8, 10, c);
          if (on) lit.push([xx, c]);
        }
      }
      if (R.chance(0.4)) {
        const nh = R.pick([330, 180, 290, 50, 140]);
        const ny = top + R.range(20, Math.max(30, h * 0.4));
        rect(ctx, x + w * 0.2 - 6, ny - 6, w * 0.6 + 12, 40, H(nh, 100, 60, 0.25));
        ctx.strokeStyle = H(nh, 100, 65);
        ctx.lineWidth = 4;
        ctx.strokeRect(x + w * 0.2, ny, w * 0.6, 28);
        rect(ctx, x + w * 0.28, ny + 10, w * 0.44, 8, H(nh, 100, 75));
      }
      near.push({ x, w, h, body, lit });
      x += w + R.range(2, 16);
    }
    // Bờ kè + đèn đường
    rect(ctx, 0, B, 1000, 20, H(250 + hs, 15, 22));
    for (let x = R.range(10, 40); x < 1000; x += R.range(55, 75)) {
      seg(ctx, x, B, x, B - 34, H(250, 10, 40), 3);
      rect(ctx, x - 26, B - 60, 52, 52, rad(ctx, x, B - 36, 0, 26, [[0, H(45, 100, 70, 0.5)], [1, H(45, 100, 70, 0)]]));
      disc(ctx, x, B - 36, 4, H(48, 100, 80));
    }
    // Sông + bóng nhà
    rect(ctx, 0, B + 20, 1000, 280, lin(ctx, 0, B + 20, 0, 1000, [[0, H(245 + hs, 45, 18)], [1, H(250 + hs, 55, 7)]]));
    near.forEach((b) => {
      rect(ctx, b.x, B + 20, b.w, b.h * 0.55, lin(ctx, 0, B + 20, 0, B + 20 + b.h * 0.55, [[0, b.body], [1, 'rgba(0,0,0,0)']]));
      for (let k = 0; k < Math.min(14, b.lit.length); k++) {
        const [xx, c] = R.pick(b.lit);
        for (let y = B + 26 + R.range(0, 12); y < B + 20 + b.h * 0.5; y += R.range(10, 18)) rect(ctx, xx + R.range(-3, 3), y, R.range(5, 12), 3, c);
      }
    });
    for (let k = 0; k < 90; k++) {
      const y = R.range(B + 24, 1000);
      const x = R.range(0, 1000);
      seg(ctx, x, y, x + R.range(20, 70), y, H(220, 50, 80, R.range(0.05, 0.14)), 1.5);
    }
    // Cầu treo
    const deck = R.range(830, 880);
    const t1 = R.range(170, 300);
    const t2 = t1 + R.range(420, 560);
    const steel = H(200 + hs, 25, 40);
    [t1, t2].forEach((t) => {
      rect(ctx, t - 9, deck - 210, 18, 230, steel);
      rect(ctx, t - 14, deck - 214, 28, 12, steel);
    });
    rect(ctx, 0, deck, 1000, 14, steel);
    rect(ctx, 0, deck + 14, 1000, 6, H(200 + hs, 20, 22));
    ctx.strokeStyle = steel;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-40, deck - 30);
    ctx.quadraticCurveTo((t1 - 40) / 2, deck - 10, t1, deck - 205);
    ctx.quadraticCurveTo((t1 + t2) / 2, deck + 40, t2, deck - 205);
    ctx.quadraticCurveTo((t2 + 1040) / 2, deck - 10, 1040, deck - 30);
    ctx.stroke();
    const cable = (x) => {
      if (x < t1) { const u = (x + 40) / (t1 + 40); return (1 - u) * (1 - u) * (deck - 30) + 2 * u * (1 - u) * (deck - 10) + u * u * (deck - 205); }
      if (x < t2) { const u = (x - t1) / (t2 - t1); return (1 - u) * (1 - u) * (deck - 205) + 2 * u * (1 - u) * (deck + 40) + u * u * (deck - 205); }
      const u = (x - t2) / (1040 - t2);
      return (1 - u) * (1 - u) * (deck - 205) + 2 * u * (1 - u) * (deck - 10) + u * u * (deck - 30);
    };
    for (let x = 10; x < 1000; x += 24) {
      const y = cable(x);
      if (y < deck - 4) seg(ctx, x, y, x, deck, H(200 + hs, 20, 40, 0.7), 1.2);
      disc(ctx, x, y, 2.6, H(R.pick([45, 0, 200]), 100, 72));
    }
    for (let x = 6; x < 1000; x += 18) disc(ctx, x, deck + 7, 2, H(40, 100, 75));
    // Thuyền có đèn
    const bx = R.range(100, 900);
    poly(ctx, [[bx - 60, 940], [bx + 60, 940], [bx + 44, 962], [bx - 44, 962]], H(0, 0, 10));
    rect(ctx, bx - 30, 920, 60, 20, H(30, 30, 18));
    for (let k = 0; k < 4; k++) rect(ctx, bx - 24 + k * 14, 926, 8, 7, H(45, 100, 72));
  }

  /* ---------------- 3. Vườn hoa ---------------- */

  function garden(ctx, R) {
    const hs = R.range(-15, 15);
    rect(ctx, 0, 0, 1000, 560, lin(ctx, 0, 0, 0, 560, [[0, H(208 + hs, 70, 58)], [1, H(192 + hs, 60, 88)]]));
    const sx = R.pick([150, 850]);
    rect(ctx, sx - 260, 0, 520, 360, rad(ctx, sx, 110, 0, 260, [[0, H(50, 100, 85, 0.7)], [1, H(50, 100, 85, 0)]]));
    disc(ctx, sx, 110, 52, H(50, 100, 72));
    for (let k = 0; k < 4; k++) cloud(ctx, R, R.range(100, 900), R.range(100, 300), R.range(140, 240), 'rgba(255,255,255,0.92)', H(210, 40, 90, 0.9));
    birds(ctx, R, 4, 200, 800, 150, 300, H(220, 30, 30, 0.7));

    const h1 = wave(R, 440, 35, 18);
    fillUnder(ctx, h1, 1000, H(118 + hs, 30, 62));
    for (let x = R.range(0, 40); x < 1000; x += R.range(40, 90)) bush(ctx, R, x, at(h1, x) + 6, R.range(30, 50), 125 + hs, 40);
    const h2 = wave(R, 515, 26, 12);
    fillUnder(ctx, h2, 1000, H(104 + hs, 42, 48));
    // Nhà nhỏ mái đỏ trên đồi
    const hx = R.range(120, 880);
    const hy = at(h2, hx) + 4;
    rect(ctx, hx - 40, hy - 50, 80, 50, H(40, 50, 88));
    poly(ctx, [[hx - 52, hy - 48], [hx, hy - 92], [hx + 52, hy - 48]], H(5, 65, 48));
    rect(ctx, hx - 10, hy - 30, 20, 30, H(25, 45, 35));
    rect(ctx, hx + 18, hy - 40, 14, 14, H(200, 60, 70));
    for (let x = R.range(0, 60); x < 1000; x += R.range(70, 140)) if (Math.abs(x - hx) > 70) bush(ctx, R, x, at(h2, x) + 8, R.range(50, 80), 110 + hs, 32);

    const G = 560;
    rect(ctx, 0, G, 1000, 440, lin(ctx, 0, G, 0, 1000, [[0, H(96 + hs, 48, 44)], [1, H(102 + hs, 55, 26)]]));
    // Hàng rào
    const wood = H(32, 40, 58);
    rect(ctx, 0, G + 14, 1000, 9, wood);
    rect(ctx, 0, G + 40, 1000, 9, wood);
    for (let x = 10; x < 1000; x += 42) {
      poly(ctx, [[x, G - 4], [x + 5, G - 12], [x + 10, G - 4], [x + 10, G + 62], [x, G + 62]], wood);
      rect(ctx, x + 7, G - 4, 3, 66, H(32, 35, 45));
    }
    // Lối đi lát đá uốn cong
    const pc = R.range(380, 620);
    const bend = R.range(-160, 160);
    const pathX = (y) => pc + bend * Math.sin(((y - G) / (1000 - G)) * Math.PI) * 0.6;
    const pathW = (y) => 10 + ((y - G) / (1000 - G)) * 110;
    const left = [];
    const right = [];
    for (let y = G + 60; y <= 1000; y += 20) {
      left.push([pathX(y) - pathW(y), y]);
      right.unshift([pathX(y) + pathW(y), y]);
    }
    poly(ctx, left.concat(right), H(36, 30, 74));
    for (let y = G + 70; y < 1000; y += 14 + (y - G) * 0.04) {
      const w = pathW(y);
      for (let x = pathX(y) - w + 8; x < pathX(y) + w - 8; x += w * 0.45) ell(ctx, x + R.range(-4, 4), y, w * 0.18, 3 + (y - G) * 0.02, 0, H(30, 20, R.range(60, 70)));
    }
    // Luống hoa: màu theo dải dọc (mỗi vùng một màu chủ đạo), hoa to dần về phía trước
    const palette = R.shuffle([355, 22, 48, 280, 320, 205, 10]);
    for (let y = G + 66; y < 1020; y += 9 + (y - G) * 0.07) {
      const s = 5 + (y - G) * 0.055;
      for (let x = R.range(-10, s); x < 1010; x += s * R.range(2.2, 2.9)) {
        if (Math.abs(x - pathX(y)) < pathW(y) + s * 0.8) continue;
        const band = Math.max(0, Math.min(palette.length - 1, Math.floor((x / 1000) * palette.length + R.range(-0.35, 0.35))));
        const hue = palette[band] + R.range(-8, 8);
        const yy = y + R.range(-4, 4);
        seg(ctx, x, yy, x + R.range(-2, 2), yy + s * 1.3, H(110 + hs, 45, 28), Math.max(1, s * 0.12));
        ell(ctx, x + s * 0.4, yy + s * 0.9, s * 0.35, s * 0.15, -0.5, H(110 + hs, 45, 34));
        const n = 5;
        const rot = R.range(0, TAU);
        for (let k = 0; k < n; k++) {
          const a = rot + (k * TAU) / n;
          ell(ctx, x + Math.cos(a) * s * 0.5, yy + Math.sin(a) * s * 0.5, s * 0.46, s * 0.28, a, H(hue, 80, R.range(55, 66)));
        }
        disc(ctx, x, yy, s * 0.24, H(palette[band] === 48 ? 25 : 46, 90, 50));
      }
    }
    // Bướm
    for (let k = 0; k < 5; k++) {
      const x = R.range(60, 940);
      const y = R.range(420, 760);
      const s = R.range(10, 18);
      const c = H(R.pick([30, 200, 300, 55]), 85, 60);
      ell(ctx, x - s * 0.6, y - s * 0.3, s * 0.6, s * 0.45, -0.5, c);
      ell(ctx, x + s * 0.6, y - s * 0.3, s * 0.6, s * 0.45, 0.5, c);
      ell(ctx, x - s * 0.45, y + s * 0.35, s * 0.4, s * 0.3, 0.4, c);
      ell(ctx, x + s * 0.45, y + s * 0.35, s * 0.4, s * 0.3, -0.4, c);
      ell(ctx, x, y, s * 0.12, s * 0.6, 0, H(0, 0, 15));
    }
  }

  /* ---------------- 4. Hoa văn hình học ---------------- */

  function mosaic(ctx, R) {
    const h0 = R.range(0, 360);
    const side = 1000 / 11;
    const th = side * 0.866;
    ctx.lineJoin = 'round';
    for (let j = 0; j * th < 1000; j++) {
      for (let i = -1; i < 24; i++) {
        const up = (i + j) % 2 === 0;
        const x0 = (i * side) / 2;
        const y0 = j * th;
        const pts = up ? [[x0, y0 + th], [x0 + side / 2, y0], [x0 + side, y0 + th]] : [[x0, y0], [x0 + side, y0], [x0 + side / 2, y0 + th]];
        const cx = x0 + side / 2;
        const cy = y0 + th / 2;
        const hue = h0 + cx * 0.2 + cy * 0.11 + R.range(-10, 10);
        const light = 50 + 12 * Math.sin(cx / 95) * Math.cos(cy / 120) + (up ? 6 : -5) + R.range(-5, 5);
        poly(ctx, pts, H(hue, 62, light));
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // Góc: cung tròn đồng tâm, mỗi góc một bộ màu
    [[0, 0], [1000, 0], [0, 1000], [1000, 1000]].forEach(([x, y], k) => {
      const hue = h0 + 90 * k + R.range(-20, 20);
      for (let m = 6; m >= 1; m--) disc(ctx, x, y, m * 34, H(hue + m * 14, 70, 32 + m * 7));
    });
    // Hoa thị giữa hình: các vòng cánh hoa, mỗi vòng một cặp màu
    const cx = 500 + R.range(-40, 40);
    const cy = 500 + R.range(-40, 40);
    const rings = [330, 262, 196, 132, 72];
    disc(ctx, cx, cy, 345, H(h0 + 200, 40, 18, 0.85));
    rings.forEach((ro, m) => {
      const ri = m < rings.length - 1 ? rings[m + 1] * 0.92 : 10;
      const n = 8 + (rings.length - m) * 4;
      const ca = H(h0 + 40 * m + 180, 75, 52 + m * 5);
      const cb = H(h0 + 40 * m + 210, 70, 38 + m * 6);
      const rot = R.range(0, TAU);
      for (let k = 0; k < n; k++) {
        const a = rot + (k * TAU) / n;
        const da = (TAU / n) * 0.5;
        ctx.fillStyle = k % 2 ? ca : cb;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * ri, cy + Math.sin(a) * ri);
        ctx.quadraticCurveTo(cx + Math.cos(a - da) * ro * 1.02, cy + Math.sin(a - da) * ro * 1.02, cx + Math.cos(a) * ro, cy + Math.sin(a) * ro);
        ctx.quadraticCurveTo(cx + Math.cos(a + da) * ro * 1.02, cy + Math.sin(a + da) * ro * 1.02, cx + Math.cos(a) * ri, cy + Math.sin(a) * ri);
        ctx.fill();
        ctx.strokeStyle = H(45, 85, 70, 0.9);
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
      ctx.strokeStyle = H(45, 85, 65);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, ro, 0, TAU);
      ctx.stroke();
      for (let k = 0; k < n; k++) {
        const a = rot + ((k + 0.5) * TAU) / n;
        disc(ctx, cx + Math.cos(a) * ro, cy + Math.sin(a) * ro, 5 + (rings.length - m), H(h0 + 60 * m, 80, 70));
      }
    });
    // Sao tám cánh ở tâm
    const star = [];
    for (let k = 0; k < 16; k++) {
      const rr = k % 2 ? 26 : 62;
      const a = (k * TAU) / 16;
      star.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    poly(ctx, star, H(h0 + 30, 85, 62));
    disc(ctx, cx, cy, 18, H(h0 + 200, 80, 30));
    // Khung viền: dải trám xen màu
    for (let k = 0; k < 4; k++) {
      ctx.save();
      ctx.translate(500, 500);
      ctx.rotate((k * Math.PI) / 2);
      rect(ctx, -500, -500, 1000, 34, H(h0 + 90 * k + 20, 50, 22));
      for (let x = -480; x < 480; x += 40) {
        poly(ctx, [[x, -483], [x + 20, -495], [x + 40, -483], [x + 20, -471]], H(h0 + 90 * k + (x + 480) * 0.15, 80, (x / 40) % 2 ? 62 : 50));
      }
      ctx.restore();
    }
  }

  /* ---------------- 5. Rạn san hô ---------------- */

  function fish(ctx, R, x, y, s, hue, dir) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    const body = H(hue, 85, 55);
    poly(ctx, [[-s * 0.85, 0], [-s * 1.35, -s * 0.45], [-s * 1.25, 0], [-s * 1.35, s * 0.45]], H(hue + 10, 85, 48));
    ell(ctx, 0, 0, s, s * 0.52, 0, body);
    poly(ctx, [[-s * 0.2, -s * 0.45], [s * 0.25, -s * 0.85], [s * 0.35, -s * 0.4]], H(hue + 10, 85, 48));
    const kind = R.int(0, 2);
    if (kind === 0) {
      [-0.35, 0.25].forEach((u) => {
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath();
        ctx.ellipse(s * u, 0, s * 0.11, s * 0.5, 0, 0, TAU);
        ctx.fill();
      });
    } else if (kind === 1) {
      for (let k = 0; k < 3; k++) ell(ctx, -s * 0.45 + k * s * 0.35, 0, s * 0.06, s * 0.42, 0, H(hue + 180, 70, 35, 0.7));
    } else {
      ell(ctx, 0, s * 0.15, s * 0.8, s * 0.22, 0, H(hue + 40, 90, 70, 0.8));
    }
    disc(ctx, s * 0.6, -s * 0.1, s * 0.14, '#fff');
    disc(ctx, s * 0.63, -s * 0.1, s * 0.07, '#111');
    ctx.restore();
  }

  function reef(ctx, R) {
    const hs = R.range(-15, 15);
    rect(ctx, 0, 0, 1000, 1000, lin(ctx, 0, 0, 0, 1000, [[0, H(182 + hs, 72, 62)], [0.45, H(198 + hs, 70, 40)], [1, H(215 + hs, 70, 20)]]));
    // Tia nắng
    for (let k = 0; k < 7; k++) {
      const x = R.range(0, 1000);
      const w = R.range(30, 80);
      const sk = R.range(-260, 260);
      poly(ctx, [[x, 0], [x + w, 0], [x + w + sk + w * 2, 900], [x + sk - w, 900]], 'rgba(255,255,255,' + R.range(0.05, 0.1).toFixed(3) + ')');
    }
    for (let k = 0; k < 6; k++) stroke(ctx, wave(R, 20 + k * 22, 6, 4, 25), 'rgba(255,255,255,0.18)', 3);
    // Bóng rạn xa
    for (let k = 0; k < 9; k++) ell(ctx, R.range(0, 1000), R.range(700, 760), R.range(60, 140), R.range(40, 90), 0, H(200 + hs, 40, 30, 0.6));
    // Rong biển
    for (let k = 0; k < 14; k++) {
      const x = R.range(0, 1000);
      const h = R.range(150, 380);
      const sway = R.range(-60, 60);
      ctx.strokeStyle = H(R.range(100, 150), 55, R.range(30, 42));
      ctx.lineWidth = R.range(7, 13);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, 1000);
      ctx.bezierCurveTo(x + sway, 1000 - h * 0.3, x - sway, 1000 - h * 0.65, x + sway * 0.5, 1000 - h);
      ctx.stroke();
    }
    // Cát
    const sand = wave(R, 860, 18, 8);
    fillUnder(ctx, sand, 1000, lin(ctx, 0, 830, 0, 1000, [[0, H(42, 55, 72)], [1, H(36, 45, 55)]]));
    for (let k = 0; k < 220; k++) {
      const x = R.range(0, 1000);
      disc(ctx, x, R.range(at(sand, x) + 6, 1000), R.range(1.2, 3.2), H(35, 35, R.range(45, 80), 0.7));
    }
    // San hô nhánh
    const branch = (x, y, len, a, w, depth, color, tip) => {
      const x2 = x + Math.cos(a) * len;
      const y2 = y + Math.sin(a) * len;
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (depth <= 0) {
        disc(ctx, x2, y2, w * 0.75, tip);
        return;
      }
      branch(x2, y2, len * 0.74, a - R.range(0.25, 0.6), w * 0.74, depth - 1, color, tip);
      branch(x2, y2, len * 0.74, a + R.range(0.25, 0.6), w * 0.74, depth - 1, color, tip);
    };
    const spots = R.shuffle([90, 230, 370, 510, 650, 790, 920]);
    const kinds = R.shuffle(['branch', 'fan', 'brain', 'tube', 'branch', 'anemone', 'fan']);
    spots.forEach((x, i) => {
      const y = at(sand, x) + 10;
      const hue = R.pick([340, 15, 290, 30, 320, 50]);
      const kind = kinds[i];
      if (kind === 'branch') branch(x, y, R.range(60, 90), -Math.PI / 2 + R.range(-0.2, 0.2), 16, 4, H(hue, 70, 58), H(hue + 15, 90, 75));
      else if (kind === 'fan') {
        const r = R.range(110, 160);
        ctx.strokeStyle = H(hue, 60, 50);
        ctx.lineWidth = 3;
        for (let k = 0; k <= 12; k++) {
          const a = -Math.PI + 0.35 + (k / 12) * (Math.PI - 0.7);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.7, x + Math.cos(a) * r, y + Math.sin(a) * r);
          ctx.stroke();
        }
        for (let m = 1; m <= 4; m++) {
          ctx.beginPath();
          ctx.arc(x, y, (r * m) / 4.3, -Math.PI + 0.35, -0.35);
          ctx.stroke();
        }
      } else if (kind === 'brain') {
        ell(ctx, x, y - 30, 80, 55, 0, H(hue, 50, 55));
        ctx.strokeStyle = H(hue, 50, 38);
        ctx.lineWidth = 3;
        for (let k = 0; k < 6; k++) {
          ctx.beginPath();
          const yy = y - 70 + k * 14;
          ctx.moveTo(x - 66 + Math.abs(k - 2.5) * 6, yy);
          for (let u = 1; u <= 8; u++) ctx.lineTo(x - 66 + Math.abs(k - 2.5) * 6 + u * (16 - Math.abs(k - 2.5) * 1.5), yy + (u % 2 ? -5 : 5));
          ctx.stroke();
        }
      } else if (kind === 'tube') {
        for (let k = 0; k < 4; k++) {
          const tx = x - 45 + k * 28 + R.range(-6, 6);
          const th = R.range(70, 150);
          rect(ctx, tx - 11, y - th, 22, th, H(hue + k * 6, 80, 55));
          ell(ctx, tx, y - th, 11, 5, 0, H(hue, 60, 25));
        }
      } else {
        for (let k = 0; k < 18; k++) {
          const a = -Math.PI + (k / 17) * Math.PI;
          ctx.strokeStyle = H(hue + 20, 80, 68);
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(x, y - 20);
          ctx.quadraticCurveTo(x + Math.cos(a) * 40, y - 20 + Math.sin(a) * 70, x + Math.cos(a) * 70 + R.range(-10, 10), y - 20 + Math.sin(a) * 60);
          ctx.stroke();
        }
        ell(ctx, x, y - 12, 34, 16, 0, H(hue, 70, 45));
      }
    });
    // Rùa biển
    const tx = R.range(200, 800);
    const ty = R.range(330, 480);
    const sk = H(95, 30, 45);
    [[-45, -30, -0.6], [40, -32, 0.6], [-40, 28, 0.5], [38, 30, -0.5]].forEach(([dx, dy, a]) => ell(ctx, tx + dx, ty + dy, 34, 12, a, sk));
    ell(ctx, tx + 70, ty, 22, 16, 0, sk);
    disc(ctx, tx + 80, ty - 4, 3, '#111');
    ell(ctx, tx, ty, 62, 44, 0, H(35, 50, 34));
    for (let k = 0; k < 7; k++) {
      const a = (k * TAU) / 7;
      disc(ctx, tx + Math.cos(a) * 30, ty + Math.sin(a) * 20, 11, H(40, 55, 46));
    }
    disc(ctx, tx, ty, 13, H(40, 55, 48));
    // Cá
    for (let k = 0; k < 16; k++) fish(ctx, R, R.range(40, 960), R.range(80, 820), R.range(14, 34), R.pick([20, 45, 200, 280, 330, 175, 55]), R.chance(0.5) ? 1 : -1);
    // Bong bóng
    ctx.lineWidth = 2;
    for (let k = 0; k < 36; k++) {
      ctx.strokeStyle = 'rgba(255,255,255,' + R.range(0.3, 0.7).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(R.range(0, 1000), R.range(40, 800), R.range(3, 11), 0, TAU);
      ctx.stroke();
    }
  }

  /* ---------------- 6. Bầu trời sao ---------------- */

  function starry(ctx, R) {
    const hs = R.range(-25, 25);
    rect(ctx, 0, 0, 1000, 1000, lin(ctx, 0, 0, 0, 1000, [[0, H(238 + hs, 60, 6)], [0.55, H(232 + hs, 52, 16)], [0.85, H(265 + hs, 40, 30)], [1, H(300 + hs, 40, 36)]]));
    // Dải Ngân Hà chéo
    const ax = R.range(-100, 200);
    const ay = R.range(750, 950);
    const bx = R.range(800, 1100);
    const by = R.range(-50, 200);
    const len = Math.hypot(bx - ax, by - ay);
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    // Ánh chân trời một phía (đổi màu theo vùng cho dễ ghép)
    const gx = R.pick([150, 850]);
    rect(ctx, 0, 250, 1000, 750, rad(ctx, gx, 900, 0, 650, [[0, H(25 + hs, 80, 55, 0.45)], [0.5, H(320 + hs, 60, 45, 0.18)], [1, H(320, 60, 45, 0)]]));
    for (let k = 0; k < 46; k++) {
      const t = k / 45;
      const off = R.range(-80, 80);
      const x = ax + (bx - ax) * t + nx * off;
      const y = ay + (by - ay) * t + ny * off;
      const rr = R.range(70, 160);
      const hue = (t < 0.33 ? 300 : t < 0.66 ? 210 : 265) + R.range(-25, 25) + hs;
      rect(ctx, x - rr, y - rr, rr * 2, rr * 2, rad(ctx, x, y, 0, rr, [[0, H(hue, 65, 62, R.range(0.12, 0.24))], [1, H(hue, 65, 62, 0)]]));
    }
    for (let k = 0; k < 30; k++) {
      const t = R();
      const x = ax + (bx - ax) * t + nx * R.range(-20, 20);
      const y = ay + (by - ay) * t + ny * R.range(-20, 20);
      ell(ctx, x, y, R.range(20, 60), R.range(6, 14), Math.atan2(by - ay, bx - ax), H(40, 60, 90, 0.12));
    }
    for (let k = 0; k < 700; k++) {
      const t = R();
      const off = (R() + R() + R() - 1.5) * 150;
      disc(ctx, ax + (bx - ax) * t + nx * off, ay + (by - ay) * t + ny * off, R.range(0.5, 1.8), H(R.pick([220, 50, 0, 200]), 60, 92, R.range(0.4, 1)));
    }
    stars(ctx, R, 200, 0, 820, 2.2);
    // Sao sáng có tia
    for (let k = 0; k < 12; k++) {
      const x = R.range(30, 970);
      const y = R.range(30, 700);
      const s = R.range(8, 20);
      rect(ctx, x - s * 2, y - s * 2, s * 4, s * 4, rad(ctx, x, y, 0, s * 2, [[0, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]));
      seg(ctx, x - s, y, x + s, y, 'rgba(255,255,255,0.8)', 1.4);
      seg(ctx, x, y - s, x, y + s, 'rgba(255,255,255,0.8)', 1.4);
      disc(ctx, x, y, 2.4, '#fff');
    }
    // Hành tinh có vành
    const px = R.range(150, 850);
    const py = R.range(120, 330);
    const pr = R.range(40, 70);
    const ph = R.pick([25, 200, 330, 45]);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.35);
    ctx.strokeStyle = H(ph + 20, 50, 75, 0.85);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(0, 0, pr * 1.9, pr * 0.45, 0, Math.PI, TAU);
    ctx.stroke();
    disc(ctx, 0, 0, pr, rad(ctx, -pr * 0.4, -pr * 0.4, pr * 0.1, pr * 1.3, [[0, H(ph, 70, 70)], [1, H(ph, 60, 25)]]));
    for (let k = -2; k <= 2; k++) ell(ctx, 0, k * pr * 0.32, pr * Math.sqrt(1 - (k * 0.32) ** 2) * 0.98, pr * 0.07, 0, H(ph + 15, 50, 55, 0.35));
    ctx.strokeStyle = H(ph + 20, 50, 80, 0.95);
    ctx.beginPath();
    ctx.ellipse(0, 0, pr * 1.9, pr * 0.45, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
    // Sao băng
    const sx = R.range(200, 800);
    const sy = R.range(80, 300);
    ctx.lineCap = 'round';
    ctx.strokeStyle = lin(ctx, sx, sy, sx - 220, sy - 90, [[0, 'rgba(255,255,255,0.95)'], [1, 'rgba(255,255,255,0)']]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - 220, sy - 90);
    ctx.stroke();
    // Đồi, rừng thông, lều có ánh lửa, hồ nhỏ phản chiếu
    const hill = wave(R, 830, 30, 12);
    const lakeX = R.range(560, 780);
    fillUnder(ctx, hill, 1000, H(235 + hs, 40, 10));
    ell(ctx, lakeX, 935, 170, 34, 0, H(240 + hs, 45, 22));
    for (let k = 0; k < 30; k++) disc(ctx, lakeX + R.range(-150, 150), 935 + R.range(-22, 22), R.range(0.6, 1.6), 'rgba(255,255,255,0.6)');
    for (let x = R.range(0, 20); x < 1000; x += R.range(18, 46)) {
      if (Math.abs(x - lakeX) < 190 && R.chance(0.7)) continue;
      pine(ctx, x, at(hill, x) + R.range(10, 60), R.range(50, 130), H(235 + hs, 38, R.range(6, 12)));
    }
    const tx = lakeX > 650 ? R.range(150, 380) : R.range(700, 860);
    const ty = at(hill, tx) + 60;
    rect(ctx, tx - 140, ty - 190, 360, 360, rad(ctx, tx + 40, ty - 10, 0, 175, [[0, H(30, 100, 60, 0.5)], [1, H(30, 100, 60, 0)]]));
    poly(ctx, [[tx - 55, ty], [tx, ty - 70], [tx + 55, ty]], H(32, 90, 55));
    poly(ctx, [[tx - 12, ty], [tx, ty - 40], [tx + 12, ty]], H(45, 100, 75));
    poly(ctx, [[tx + 70, ty], [tx + 80, ty - 26], [tx + 90, ty]], H(25, 100, 60));
    disc(ctx, tx + 80, ty - 8, 6, H(50, 100, 80));
    seg(ctx, tx + 64, ty + 2, tx + 96, ty - 4, H(25, 40, 25), 4);
  }

  /* ---------------- 7. Khinh khí cầu ---------------- */

  function balloon(ctx, R, x, y, r, hues) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI * 0.8, Math.PI * 0.2);
    ctx.quadraticCurveTo(x + r * 0.5, y + r * 1.0, x + r * 0.22, y + r * 1.32);
    ctx.lineTo(x - r * 0.22, y + r * 1.32);
    ctx.quadraticCurveTo(x - r * 0.5, y + r * 1.0, x + Math.cos(Math.PI * 0.8) * r, y + Math.sin(Math.PI * 0.8) * r);
    ctx.closePath();
    ctx.fillStyle = H(hues[0], 80, 55);
    ctx.fill();
    ctx.clip();
    for (let k = 4; k >= 1; k--) ell(ctx, x, y + r * 0.25, r * (k / 4.2), r * 1.3, 0, H(hues[k % hues.length], 80, 50 + k * 3));
    rect(ctx, x - r, y + r * 0.3, r * 2, r * 0.14, H(hues[1], 90, 70, 0.85));
    ell(ctx, x - r * 0.35, y - r * 0.4, r * 0.25, r * 0.4, -0.4, 'rgba(255,255,255,0.3)');
    ctx.restore();
    ctx.strokeStyle = 'rgba(60,40,30,0.8)';
    ctx.lineWidth = Math.max(1, r * 0.02);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.2, y + r * 1.32);
    ctx.lineTo(x - r * 0.12, y + r * 1.55);
    ctx.moveTo(x + r * 0.2, y + r * 1.32);
    ctx.lineTo(x + r * 0.12, y + r * 1.55);
    ctx.stroke();
    rect(ctx, x - r * 0.14, y + r * 1.55, r * 0.28, r * 0.2, H(28, 50, 35));
  }

  function balloons(ctx, R) {
    const hs = R.range(-12, 12);
    const HZ = 640;
    rect(ctx, 0, 0, 1000, HZ, lin(ctx, 0, 0, 0, HZ, [[0, H(206 + hs, 68, 58)], [0.7, H(195 + hs, 55, 80)], [1, H(35 + hs, 85, 84)]]));
    const sx = R.range(200, 800);
    rect(ctx, 0, HZ - 340, 1000, 340, rad(ctx, sx, HZ - 40, 0, 300, [[0, H(45, 100, 88, 0.8)], [1, H(45, 100, 88, 0)]]));
    for (let k = 0; k < 6; k++) cloud(ctx, R, R.range(50, 950), R.range(80, 520), R.range(100, 230), 'rgba(255,255,255,0.85)', H(30, 60, 92, 0.8));
    fillUnder(ctx, ridge(R, HZ - 50, 50, 0.55), HZ + 10, H(215 + hs, 30, 70));
    fillUnder(ctx, ridge(R, HZ - 15, 30, 0.5), HZ + 10, H(200 + hs, 30, 58));
    // Ruộng chắp vá phối cảnh
    rect(ctx, 0, HZ, 1000, 1000 - HZ, H(95, 40, 45));
    const rows = [];
    for (let y = HZ, k = 0; y < 1000; k++) {
      const h = 14 + k * 9;
      rows.push([y, Math.min(1000, y + h)]);
      y += h;
    }
    rows.forEach(([y0, y1], k) => {
      let x = -R.range(0, 120);
      while (x < 1000) {
        const w = R.range(80, 220) * (1 + k * 0.25);
        const sk = R.range(-20, 20);
        const hue = R.pick([95, 80, 55, 45, 110, 35]);
        poly(ctx, [[x, y0], [x + w, y0], [x + w + sk, y1], [x + sk, y1]], H(hue + hs, R.range(35, 60), R.range(40, 62)));
        for (let yy = y0 + 4; yy < y1; yy += 5 + k) seg(ctx, x + 3, yy, x + w - 3, yy, H(hue, 40, 35, 0.25), 1);
        seg(ctx, x + w, y0, x + w + sk, y1, H(100, 40, 25, 0.7), 2 + k * 0.5);
        x += w;
      }
      seg(ctx, 0, y1, 1000, y1, H(100, 40, 25, 0.6), 2 + k * 0.6);
    });
    // Sông uốn
    const rx = R.range(250, 750);
    ctx.strokeStyle = H(200, 60, 72);
    ctx.lineCap = 'round';
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.moveTo(rx - 60, HZ + 4);
    ctx.bezierCurveTo(rx + 160, HZ + 90, rx - 260, HZ + 200, rx + 80, 1010);
    ctx.stroke();
    ctx.strokeStyle = H(195, 70, 85, 0.6);
    ctx.lineWidth = 6;
    ctx.stroke();
    for (let k = 0; k < 40; k++) {
      const y = R.range(HZ + 10, 1000);
      bush(ctx, R, R.range(0, 1000), y, 10 + (y - HZ) * 0.09, 120, 26);
    }
    const fx0 = R.range(80, 920);
    const fy0 = R.range(HZ + 120, HZ + 220);
    rect(ctx, fx0 - 30, fy0 - 30, 60, 30, H(40, 40, 85));
    poly(ctx, [[fx0 - 38, fy0 - 28], [fx0, fy0 - 58], [fx0 + 38, fy0 - 28]], H(8, 60, 45));
    // Khinh khí cầu, xa nhỏ gần to
    const sets = [[0, 45, 200], [330, 50, 280], [200, 40, 120], [130, 55, 30], [280, 190, 50], [15, 210, 45], [170, 60, 320]];
    const n = R.int(6, 8);
    const placed = [];
    for (let k = 0; k < n; k++) {
      const r = 26 + (k / (n - 1)) * 95 * R.range(0.8, 1.1);
      let x = 0;
      let y = 0;
      for (let tries = 0; tries < 12; tries++) {
        x = R.range(r + 10, 1000 - r - 10);
        y = R.range(r + 20, HZ + 60 - r * 1.8);
        if (placed.every((p) => Math.hypot(p[0] - x, p[1] - y) > p[2] + r + 20)) break;
      }
      placed.push([x, y, r]);
      balloon(ctx, R, x, y, r, sets[(k + R.int(0, 6)) % sets.length].map((h) => h + hs));
    }
    birds(ctx, R, 5, 100, 900, 80, 400, 'rgba(40,40,60,0.6)');
  }

  /* ---------------- 8. Ruộng bậc thang ---------------- */

  function terraces(ctx, R) {
    const hs = R.range(-12, 12);
    rect(ctx, 0, 0, 1000, 520, lin(ctx, 0, 0, 0, 520, [[0, H(205 + hs, 55, 66)], [1, H(45 + hs, 50, 90)]]));
    const sx = R.range(150, 850);
    rect(ctx, 0, 0, 1000, 520, rad(ctx, sx, 160, 0, 260, [[0, H(48, 100, 92, 0.85)], [1, H(48, 100, 92, 0)]]));
    disc(ctx, sx, 160, 44, H(48, 100, 94));
    for (let k = 0; k < 3; k++) cloud(ctx, R, R.range(80, 920), R.range(60, 230), R.range(140, 260), 'rgba(255,255,255,0.75)');
    birds(ctx, R, 4, 100, 900, 120, 280, 'rgba(40,50,60,0.55)');
    [[300, 120, H(210 + hs, 25, 68)], [380, 90, H(200 + hs, 28, 56)], [440, 70, H(150 + hs, 25, 42)]].forEach(([b, a, c], i) => {
      fillUnder(ctx, ridge(R, b, a, 0.55), 1000, c);
      rect(ctx, 0, b - 30, 1000, 140, lin(ctx, 0, b - 30, 0, b + 110, [[0, 'rgba(255,255,255,0)'], [0.6, 'rgba(255,255,255,' + (0.35 - i * 0.08).toFixed(2) + ')'], [1, 'rgba(255,255,255,0)']]));
    });
    // Các bậc ruộng: dải giữa hai đường sóng, mỗi bậc một màu (lúa xanh, lúa chín, nước soi trời)
    let prev = wave(R, 470, 30, 14, 20);
    const bands = [];
    for (let k = 0; prev[0][1] < 1040 || k < 3; k++) {
      const gap = 26 + k * 4.5;
      const p1 = R.range(0, TAU);
      const next = prev.map(([x, y]) => [x, y + gap + 9 * Math.sin(x / 140 + p1)]);
      bands.push([prev, next, k]);
      prev = next;
      if (k > 40) break;
    }
    bands.forEach(([a, b, k]) => {
      const kind = R.pick(['g', 'g', 'g', 'y', 'w', 'g2']);
      const col = kind === 'y' ? H(50 + hs, 70, 56) : kind === 'w' ? H(195, 45, 76) : kind === 'g2' ? H(80 + hs, 55, 45) : H(100 + hs + R.range(-8, 8), 50, R.range(38, 50));
      poly(ctx, a.concat(b.slice().reverse()), col);
      if (kind === 'w') {
        for (let m = 0; m < 4; m++) {
          const x = R.range(0, 1000);
          seg(ctx, x, at(a, x) + 8, x + 40, at(a, x + 40) + 8, 'rgba(255,255,255,0.5)', 2);
        }
      } else {
        ctx.strokeStyle = H(kind === 'y' ? 45 : 95, 50, 30, 0.35);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let x = R.range(0, 8); x < 1000; x += 7 + k * 0.6) {
          const y = (at(a, x) + at(b, x)) / 2;
          ctx.moveTo(x, y + 4);
          ctx.lineTo(x + 2, y - 4);
        }
        ctx.stroke();
      }
      // Bờ đất (vách bậc) phía dưới mỗi dải
      stroke(ctx, b, H(30, 40, 30, 0.85), 3 + k * 0.35);
      stroke(ctx, a, H(80, 40, 70, 0.5), 1.5);
    });
    // Nhà sàn nhỏ
    const hx = R.range(150, 850);
    const band = bands[Math.min(bands.length - 1, R.int(3, 6))];
    const hy = at(band[1], hx);
    rect(ctx, hx - 50, hy - 46, 100, 30, H(28, 45, 40));
    for (let k = 0; k < 4; k++) rect(ctx, hx - 46 + k * 30, hy - 18, 5, 18, H(28, 45, 28));
    poly(ctx, [[hx - 66, hy - 44], [hx, hy - 96], [hx + 66, hy - 44]], H(38, 50, 55));
    rect(ctx, hx - 12, hy - 40, 24, 18, H(25, 40, 20));
    // Người đội nón lá
    for (let k = 0; k < 4; k++) {
      const b2 = bands[Math.min(bands.length - 1, R.int(6, bands.length - 2))];
      const x = R.range(60, 940);
      const y = (at(b2[0], x) + at(b2[1], x)) / 2;
      const s = 10 + (y - 500) * 0.03;
      rect(ctx, x - s * 0.3, y - s * 1.1, s * 0.6, s * 1.1, H(R.pick([220, 0, 30, 270]), 50, 45));
      poly(ctx, [[x - s, y - s * 1.05], [x, y - s * 1.75], [x + s, y - s * 1.05]], H(45, 60, 82));
    }
    for (let k = 0; k < 5; k++) {
      const x = R.range(0, 1000);
      const b2 = bands[Math.min(bands.length - 1, R.int(1, 5))];
      bush(ctx, R, x, at(b2[0], x) + 4, R.range(40, 70), 115 + hs, 32);
    }
  }

  /* ---------------- 9. Đảo nhiệt đới ---------------- */

  function palm(ctx, R, x, y, h, lean) {
    const tx = x + lean;
    const ty = y - h;
    for (let k = 0; k < 14; k++) {
      const t = k / 14;
      const t2 = (k + 1) / 14;
      const px = x + lean * t * t;
      const py = y - h * t;
      const qx = x + lean * t2 * t2;
      const qy = y - h * t2;
      const w = 14 * (1 - t * 0.45);
      poly(ctx, [[px - w, py], [px + w, py], [qx + w * 0.9, qy], [qx - w * 0.9, qy]], H(30, 35, k % 2 ? 38 : 32));
    }
    for (let k = 0; k < 8; k++) {
      const a = -Math.PI / 2 + ((k - 3.5) / 3.5) * 1.6 + R.range(-0.12, 0.12);
      const len = R.range(110, 160);
      const ex = tx + Math.cos(a) * len;
      const ey = ty + Math.sin(a) * len * 0.45 + len * 0.35;
      const cx = tx + Math.cos(a) * len * 0.5;
      const cy = ty + Math.sin(a) * len * 0.5 - 30;
      ctx.fillStyle = H(R.range(105, 130), 55, R.range(28, 40));
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(cx, cy - 16, ex, ey);
      ctx.quadraticCurveTo(cx, cy + 16, tx, ty);
      ctx.fill();
      ctx.strokeStyle = H(110, 50, 22, 0.6);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(cx, cy, ex, ey);
      ctx.stroke();
    }
    for (let k = 0; k < 3; k++) disc(ctx, tx + R.range(-12, 12), ty + R.range(4, 16), 9, H(30, 50, 30));
  }

  function beach(ctx, R) {
    const hs = R.range(-12, 12);
    const HZ = 470;
    rect(ctx, 0, 0, 1000, HZ, lin(ctx, 0, 0, 0, HZ, [[0, H(205 + hs, 78, 52)], [1, H(190 + hs, 70, 84)]]));
    const sx = R.range(120, 880);
    rect(ctx, sx - 200, 0, 400, 340, rad(ctx, sx, 120, 0, 200, [[0, H(50, 100, 90, 0.8)], [1, H(50, 100, 90, 0)]]));
    disc(ctx, sx, 120, 50, H(50, 100, 80));
    for (let k = 0; k < 5; k++) cloud(ctx, R, R.range(60, 940), R.range(150, 400), R.range(110, 220), 'rgba(255,255,255,0.95)', H(200, 40, 90));
    birds(ctx, R, 6, 100, 900, 60, 300, 'rgba(30,40,60,0.7)');
    rect(ctx, 0, HZ, 1000, 560, lin(ctx, 0, HZ, 0, 800, [[0, H(212 + hs, 70, 32)], [0.5, H(195 + hs, 75, 42)], [1, H(178 + hs, 70, 55)]]));
    // Đảo xa
    const ix = R.range(150, 850);
    ell(ctx, ix, HZ, 130, 26, 0, H(110, 35, 32));
    ell(ctx, ix + 50, HZ - 8, 60, 24, 0, H(110, 35, 38));
    for (let k = 0; k < 3; k++) {
      const px = ix - 60 + k * 50;
      seg(ctx, px, HZ - 10, px + 6, HZ - 50, H(30, 30, 30), 3);
      for (let m = 0; m < 5; m++) seg(ctx, px + 6, HZ - 50, px + 6 + Math.cos(m * 1.2) * 20, HZ - 46 + Math.sin(m * 1.2) * 8, H(120, 40, 25), 3);
    }
    // Sóng
    ctx.lineCap = 'round';
    for (let k = 0; k < 110; k++) {
      const y = R.range(HZ + 10, 780);
      const t = (y - HZ) / 310;
      const x = R.range(0, 1000);
      const w = 14 + t * 50;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.2 + t * 0.4).toFixed(2) + ')';
      ctx.lineWidth = 1 + t * 2.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + w / 2, y - 4 - t * 6, x + w, y);
      ctx.stroke();
    }
    // Thuyền buồm
    const bx = R.range(180, 820);
    const by = R.range(HZ + 60, HZ + 160);
    poly(ctx, [[bx - 60, by], [bx + 60, by], [bx + 42, by + 18], [bx - 42, by + 18]], H(15, 60, 40));
    seg(ctx, bx, by, bx, by - 130, H(30, 30, 25), 3);
    poly(ctx, [[bx + 3, by - 128], [bx + 3, by - 8], [bx + 70, by - 8]], H(0, 0, 98));
    poly(ctx, [[bx - 3, by - 110], [bx - 3, by - 10], [bx - 50, by - 10]], H(R.pick([0, 210, 45]), 70, 55));
    ell(ctx, bx, by + 22, 80, 5, 0, 'rgba(0,30,60,0.25)');
    // Bãi cát + bọt sóng
    const shore = wave(R, 800, 26, 10);
    fillUnder(ctx, shore.map(([x, y]) => [x, y - 10]), 1000, 'rgba(255,255,255,0.75)');
    fillUnder(ctx, shore, 1000, lin(ctx, 0, 780, 0, 1000, [[0, H(45, 70, 80)], [1, H(38, 60, 66)]]));
    for (let k = 0; k < 160; k++) {
      const x = R.range(0, 1000);
      disc(ctx, x, R.range(at(shore, x) + 8, 1000), R.range(1, 2.6), H(35, 40, R.range(55, 75), 0.6));
    }
    // Dù + khăn
    const ux = R.range(380, 620);
    const uy = R.range(880, 930);
    rect(ctx, ux + 30, uy - 10, 120, 50, H(R.pick([200, 330, 50]), 70, 60));
    for (let k = 0; k < 4; k++) rect(ctx, ux + 30, uy - 4 + k * 12, 120, 5, 'rgba(255,255,255,0.7)');
    seg(ctx, ux, uy + 20, ux + 10, uy - 120, H(0, 0, 90), 4);
    const cols = [H(0, 80, 55), H(0, 0, 98)];
    for (let k = 0; k < 6; k++) {
      const a0 = Math.PI + (k * Math.PI) / 6;
      const a1 = a0 + Math.PI / 6;
      ctx.fillStyle = cols[k % 2];
      ctx.beginPath();
      ctx.moveTo(ux + 10, uy - 120);
      ctx.arc(ux + 10, uy - 120, 95, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    // Sao biển, vỏ ốc
    for (let k = 0; k < 6; k++) {
      const x = R.range(40, 960);
      const y = R.range(880, 985);
      if (R.chance(0.5)) {
        const pts = [];
        for (let m = 0; m < 10; m++) {
          const a = (m * TAU) / 10 - Math.PI / 2;
          const rr = m % 2 ? 6 : 16;
          pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
        }
        poly(ctx, pts, H(15, 80, 58));
      } else {
        ell(ctx, x, y, 13, 10, 0, H(20, 50, 85));
        for (let m = -2; m <= 2; m++) seg(ctx, x, y + 9, x + m * 5, y - 8, H(20, 40, 65), 1.5);
      }
    }
    // Dừa
    const side = R.chance(0.5) ? 1 : -1;
    const base = side > 0 ? R.range(60, 180) : R.range(820, 940);
    palm(ctx, R, base, 990, R.range(420, 520), side * R.range(80, 150));
    palm(ctx, R, base + side * R.range(120, 200), 1000, R.range(300, 380), side * R.range(110, 170));
  }

  /* ---------------- 10. Làng mùa đông ---------------- */

  function winter(ctx, R) {
    const hs = R.range(-20, 20);
    rect(ctx, 0, 0, 1000, 600, lin(ctx, 0, 0, 0, 600, [[0, H(225 + hs, 50, 26)], [0.55, H(270 + hs, 35, 50)], [1, H(18 + hs, 70, 76)]]));
    stars(ctx, R, 60, 0, 250, 1.6);
    // Cực quang
    for (let k = 0; k < 4; k++) {
      const pts = wave(R, R.range(90, 220), 40, 18, 25);
      ctx.strokeStyle = H(R.pick([150, 170, 190, 280]), 80, 65, 0.16);
      ctx.lineWidth = R.range(28, 60);
      ctx.lineCap = 'round';
      trace(ctx, pts);
      ctx.stroke();
    }
    const mx = R.range(120, 880);
    rect(ctx, mx - 110, 0, 220, 330, rad(ctx, mx, 140, 0, 110, [[0, H(50, 50, 92, 0.4)], [1, H(50, 50, 92, 0)]]));
    disc(ctx, mx, 140, 34, H(48, 40, 94));
    // Núi tuyết xa
    const m1 = ridge(R, 420, 120, 0.55);
    fillUnder(ctx, m1, 640, H(225 + hs, 25, 82));
    ctx.save();
    trace(ctx, [[0, 640]].concat(m1, [[1000, 640]]));
    ctx.closePath();
    ctx.clip();
    for (let x = 0; x < 1000; x += 64) poly(ctx, [[x, at(m1, x)], [x + 64, at(m1, x + 64)], [x + 90, 640], [x + 30, 640]], H(230 + hs, 35, 68, 0.6));
    ctx.restore();
    // Đồi tuyết gần
    const h1 = wave(R, 600, 26, 10);
    fillUnder(ctx, h1, 1000, lin(ctx, 0, 560, 0, 1000, [[0, H(215 + hs, 35, 92)], [1, H(220 + hs, 40, 80)]]));
    for (let x = R.range(0, 20); x < 1000; x += R.range(16, 36)) pine(ctx, x, at(h1, x) + R.range(4, 20), R.range(40, 80), H(150, 30, R.range(18, 26)), 'rgba(255,255,255,0.9)');
    const h2 = wave(R, 780, 20, 10);
    fillUnder(ctx, h2, 1000, lin(ctx, 0, 760, 0, 1000, [[0, H(210 + hs, 30, 96)], [1, H(225 + hs, 40, 84)]]));
    // Bóng xanh trên tuyết, hồ đóng băng có người trượt, hàng rào gỗ
    for (let k = 0; k < 7; k++) ell(ctx, R.range(0, 1000), R.range(810, 990), R.range(80, 200), R.range(10, 22), R.range(-0.1, 0.1), H(215 + hs, 45, 78, 0.45));
    const px = R.range(250, 750);
    const py = R.range(900, 950);
    ell(ctx, px, py, 190, 46, 0, H(195, 55, 78));
    ell(ctx, px, py, 190, 46, 0, lin(ctx, px - 190, py, px + 190, py, [[0, 'rgba(255,255,255,0.0)'], [0.5, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]));
    for (let k = 0; k < 6; k++) {
      const x = px + R.range(-150, 150);
      seg(ctx, x, py + R.range(-30, 30), x + R.range(30, 70), py + R.range(-30, 30), 'rgba(255,255,255,0.8)', 1.5);
    }
    for (let k = 0; k < 2; k++) {
      const x = px + R.range(-120, 120);
      const y = py + R.range(-12, 18);
      rect(ctx, x - 6, y - 40, 12, 26, H(R.pick([0, 210, 140]), 70, 45));
      disc(ctx, x, y - 48, 8, H(25, 50, 75));
      rect(ctx, x - 9, y - 58, 18, 6, H(R.pick([0, 50, 280]), 80, 55));
      seg(ctx, x - 3, y - 14, x - 7, y, '#334', 4);
      seg(ctx, x + 3, y - 14, x + 8, y, '#334', 4);
    }
    for (let x = R.range(0, 20); x < 1000; x += 38) {
      if (Math.abs(x - px) < 210) continue;
      const y = at(h2, x) + 40;
      rect(ctx, x, y - 34, 7, 36, H(28, 40, 35));
      rect(ctx, x - 2, y - 38, 11, 6, '#fff');
    }
    for (let k = 0; k < 3; k++) {
      const x = R.chance(0.5) ? R.range(0, 120) : R.range(880, 1000);
      pine(ctx, x, 1000 + R.range(0, 30), R.range(180, 260), H(150, 30, R.range(14, 20)), 'rgba(255,255,255,0.92)');
    }
    // Nhà
    const n = R.int(4, 6);
    const xs = [];
    for (let k = 0; k < n; k++) xs.push(80 + (k * 840) / (n - 1) + R.range(-30, 30));
    xs.forEach((x) => {
      const w = R.range(90, 130);
      const h = R.range(60, 90);
      const y = at(h1, x) + R.range(90, 170);
      const wall = H(R.pick([5, 40, 210, 28, 350]), 55, R.range(42, 58));
      rect(ctx, x - w / 2, y - h, w, h, wall);
      seg(ctx, x + w * 0.25, y - h - 30, x + w * 0.25, y - h - 64, H(10, 30, 30), 14);
      for (let k = 0; k < 4; k++) disc(ctx, x + w * 0.25 + k * 10 + R.range(-4, 4), y - h - 84 - k * 22, 10 + k * 5, 'rgba(230,230,240,' + (0.55 - k * 0.1).toFixed(2) + ')');
      poly(ctx, [[x - w / 2 - 14, y - h + 4], [x, y - h - 52], [x + w / 2 + 14, y - h + 4]], H(220, 20, 97));
      poly(ctx, [[x - w / 2 - 14, y - h + 4], [x + w / 2 + 14, y - h + 4], [x + w / 2 + 6, y - h + 14], [x - w / 2 - 6, y - h + 14]], H(215, 30, 85));
      rect(ctx, x - 12, y - 36, 24, 36, H(25, 45, 28));
      [[-0.32, -0.55], [0.3, -0.55]].forEach(([u, v]) => {
        rect(ctx, x + u * w - 12, y + v * h - 12, 24, 22, H(45, 100, 68));
        rect(ctx, x + u * w - 1, y + v * h - 12, 2, 22, H(30, 40, 30));
      });
      rect(ctx, x - w / 2 - 8, y - 6, w + 16, 12, 'rgba(255,255,255,0.95)');
    });
    // Người tuyết + đèn
    const sx = R.range(100, 900);
    const sy = R.range(900, 950);
    disc(ctx, sx, sy, 40, '#fbfdff');
    disc(ctx, sx, sy - 58, 28, '#fbfdff');
    disc(ctx, sx, sy - 98, 20, '#fbfdff');
    rect(ctx, sx - 18, sy - 124, 36, 8, '#222');
    rect(ctx, sx - 12, sy - 150, 24, 28, '#222');
    rect(ctx, sx - 26, sy - 82, 52, 9, H(0, 75, 50));
    rect(ctx, sx + 10, sy - 82, 9, 30, H(0, 75, 50));
    poly(ctx, [[sx, sy - 100], [sx + 24, sy - 96], [sx, sy - 94]], H(25, 90, 55));
    disc(ctx, sx - 7, sy - 104, 3, '#222');
    disc(ctx, sx + 7, sy - 104, 3, '#222');
    for (let k = 0; k < 3; k++) disc(ctx, sx, sy - 66 + k * 14, 3.5, '#333');
    for (let k = 0; k < 3; k++) {
      const lx = R.range(60, 940);
      const ly = at(h2, lx) + R.range(60, 140);
      seg(ctx, lx, ly, lx, ly - 90, H(220, 15, 25), 5);
      rect(ctx, lx - 50, ly - 140, 100, 100, rad(ctx, lx, ly - 92, 0, 50, [[0, H(45, 100, 70, 0.5)], [1, H(45, 100, 70, 0)]]));
      disc(ctx, lx, ly - 94, 8, H(48, 100, 80));
    }
    // Tuyết rơi
    for (let k = 0; k < 230; k++) disc(ctx, R.range(0, 1000), R.range(0, 1000), R.range(1, 3.6), 'rgba(255,255,255,' + R.range(0.45, 0.95).toFixed(2) + ')');
  }

  const SCENES = [lake, city, garden, mosaic, reef, starry, balloons, terraces, beach, winter];

  /** Vẽ cảnh index vào ô vuông size x size (px) tại gốc tọa độ hiện tại của ctx. */
  function draw(ctx, index, size, seed) {
    const i = ((index % SCENES.length) + SCENES.length) % SCENES.length;
    ctx.save();
    ctx.scale(size / 1000, size / 1000);
    ctx.beginPath();
    ctx.rect(0, 0, 1000, 1000);
    ctx.clip();
    SCENES[i](ctx, makeRand(seed));
    ctx.restore();
  }

  const api = { COUNT: SCENES.length, KEYS, draw };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JigsawScenes = api;
})(typeof window !== 'undefined' ? window : this);
