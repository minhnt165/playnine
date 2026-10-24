/* =====================================================================
 * Bi-a - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Bàn 1000 × 500 đơn vị (mặt băng trong), bi bán kính 15, 6 lỗ (4 góc + 2 giữa cạnh dài)
 *   - Vật lý 2D tự viết: bước cố định 1/240 s; trong mỗi bước tìm va chạm sớm nhất theo thời gian
 *     tiếp xúc chính xác (bi–bi, bi–băng, bi–mũi băng) nên không xuyên bi / xuyên băng dù đánh mạnh;
 *     va chạm bi–bi đàn hồi (khối lượng bằng nhau, hệ số nảy 0,95), băng nảy 0,75, ma sát lăn
 *     (giảm tốc đều + cản nhẹ theo vận tốc), bi rơi khi tâm lọt vào vùng miệng lỗ
 *   - Xoáy đơn giản cho bi cái: xoáy trên (theo) / xoáy dưới (kéo), cộng vào bi cái ở va chạm đầu tiên
 *   - Luật 8 bi rút gọn (xem README): phá bi, chia nhóm trơn / sọc, phạm lỗi → đối phương có bi trong tay,
 *     vào bi 8 đúng lúc thì thắng, vào sớm / cùng lúc phạm lỗi thì thua
 *   - Máy: dựng ứng viên (bi hợp lệ × lỗ, ngắm theo "bi ma"), mô phỏng bằng chính engine để chấm;
 *     chạy theo từng phần (createPlanner().step) để giao diện không bị đơ
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  /* ---------------- Kích thước bàn và hằng số vật lý ---------------- */
  const W = 1000;
  const H = 500;
  const R = 15; // bán kính bi
  const D = 2 * R;
  const HEAD_X = W / 4; // vạch phát bi: cú phá đặt bi cái phía trái vạch này
  const FOOT_X = (W * 3) / 4; // điểm đặt bi: đỉnh tam giác xếp bi
  const CG = 46; // băng góc dừng cách góc bàn chừng này (miệng lỗ góc)
  const SG = 32; // nửa miệng lỗ giữa
  const STEP = 1 / 240; // bước mô phỏng (s)
  const REC = 4; // ghi một khung hình mỗi 4 bước = 60 khung / s
  const VMAX = 3200; // vận tốc bi cái ở lực 100%
  const MIN_POWER = 0.02;
  const DECEL = 200; // giảm tốc do ma sát lăn (đơn vị / s²)
  const DRAG = 0.25; // cản theo vận tốc (1 / s)
  const E_BALL = 0.95; // hệ số nảy bi–bi
  const E_RAIL = 0.75; // hệ số nảy bi–băng
  const RAIL_KEEP = 0.96; // phần vận tốc dọc băng còn lại sau khi chạm băng
  const STOP_V = 4; // chậm hơn thế thì dừng hẳn
  const SPIN_K = 0.5; // xoáy 100% cộng / trừ 50% vận tốc bi cái trước va chạm đầu tiên
  const SPIN_FADE = 1500; // xoáy yếu dần theo quãng bi cái lăn trước khi chạm bi
  const MAX_T = 40; // chặn an toàn (s); thực tế bi dừng trước 7 s
  const MAX_EVENTS = 200; // số va chạm tối đa xử lý trong một bước
  // Cú phá: bi trong tam giác chạm nhau cùng lúc, va chạm từng cặp sẽ dồn hết lực vào một dây bi.
  // Nên khi bi cái chạm tam giác, engine chuyển sang tiếp xúc "mềm" (lò xo cứng + giảm chấn, bước 10 µs)
  // cho tới khi các bi tách nhau, rồi quay lại va chạm tức thời.
  const SOFT_K = 3e7;
  const SOFT_ZETA = 0.016; // ứng với hệ số nảy ≈ 0,95
  const SOFT_DT = 1e-5;
  const N = 16; // bi 0 (bi cái) … 15
  const LEVELS = ['easy', 'medium', 'hard'];
  const SOLID = 'solid';
  const STRIPE = 'stripe';

  /* ---------------- Lỗ và băng ---------------- */
  // Mỗi lỗ: tâm vùng rơi (x, y, r), điểm ngắm cho máy (ax, ay), hướng vào lỗ (dx, dy), loại góc / giữa
  const S2 = Math.SQRT1_2;
  const POCKETS = [
    { x: -6, y: -6, r: 26, ax: 10, ay: 10, dx: -S2, dy: -S2, side: false },
    { x: W / 2, y: -14, r: 24, ax: W / 2, ay: -2, dx: 0, dy: -1, side: true },
    { x: W + 6, y: -6, r: 26, ax: W - 10, ay: 10, dx: S2, dy: -S2, side: false },
    { x: -6, y: H + 6, r: 26, ax: 10, ay: H - 10, dx: -S2, dy: S2, side: false },
    { x: W / 2, y: H + 14, r: 24, ax: W / 2, ay: H + 2, dx: 0, dy: 1, side: true },
    { x: W + 6, y: H + 6, r: 26, ax: W - 10, ay: H - 10, dx: S2, dy: S2, side: false },
  ];
  // Mép băng (đoạn thẳng); đầu đoạn là mũi băng tròn.
  const SEGMENTS = (function () {
    const segs = [];
    const add = (ax, ay, bx, by) => {
      const L = Math.hypot(bx - ax, by - ay);
      segs.push({ ax, ay, bx, by, ux: (bx - ax) / L, uy: (by - ay) / L, L });
    };
    // Băng dài trên / dưới (mỗi cạnh hai đoạn, chừa lỗ giữa), băng ngắn trái / phải
    [0, H].forEach((y) => {
      add(CG, y, W / 2 - SG, y);
      add(W / 2 + SG, y, W - CG, y);
    });
    [0, W].forEach((x) => add(x, CG, x, H - CG));
    // Thành lỗ góc: song song đường chéo, dẫn bi vào vùng rơi
    [[1, 1, 0, 0], [-1, 1, W, 0], [1, -1, 0, H], [-1, -1, W, H]].forEach(([sx, sy, ox, oy]) => {
      add(ox + sx * CG, oy, ox + sx * (CG - 30), oy - sy * 30);
      add(ox, oy + sy * CG, ox - sx * 30, oy + sy * (CG - 30));
    });
    // Thành lỗ giữa: hơi khép vào trong
    [[0, -1], [H, 1]].forEach(([y, s]) => {
      add(W / 2 - SG, y, W / 2 - SG + 6, y + s * 24);
      add(W / 2 + SG, y, W / 2 + SG - 6, y + s * 24);
    });
    return segs;
  })();

  /* ---------------- Tiện ích ---------------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const groupOf = (n) => (n >= 1 && n <= 7 ? SOLID : n >= 9 && n <= 15 ? STRIPE : null);
  const otherGroup = (g) => (g === SOLID ? STRIPE : SOLID);
  const round3 = (v) => Math.round(v * 1000) / 1000;

  /** mulberry32: số ngẫu nhiên tất định theo seed. */
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** Băm vài giá trị thành seed 32 bit (FNV-1a). */
  function hash(...xs) {
    let h = 2166136261 >>> 0;
    xs.forEach((x) => {
      const s = String(x);
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      h ^= 0x9e37;
      h = Math.imul(h, 16777619) >>> 0;
    });
    return h >>> 0;
  }
  /** Phân bố chuẩn (Box–Muller) từ rng. */
  function gauss(rng) {
    const u = Math.max(1e-12, rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  }

  /* ---------------- Ván mới: xếp tam giác ---------------- */
  /** Vị trí 15 ô trong tam giác: đỉnh ở điểm đặt bi, hàng sau xa dần về cuối bàn (khe rất nhỏ 0,01 giữa các bi). */
  function rackSpots() {
    const spots = [];
    const gap = D + 0.01;
    const dx = (gap * Math.sqrt(3)) / 2;
    for (let row = 0; row < 5; row++) {
      for (let j = 0; j <= row; j++) spots.push({ x: FOOT_X + row * dx, y: H / 2 + (j - row / 2) * gap });
    }
    return spots; // chỉ số 4 = giữa hàng 3 (bi 8), 10 và 14 = hai góc hàng cuối
  }

  /**
   * Ván mới theo seed: bi 8 giữa hàng ba, hai góc hàng cuối một trơn một sọc, còn lại xáo ngẫu nhiên.
   * opts: { seed, first } (first = bên phá bi, mặc định 0)
   */
  function newGame(opts) {
    const o = opts || {};
    const seed = (Number.isFinite(o.seed) ? o.seed : (Math.random() * 4294967296) >>> 0) >>> 0;
    const rng = makeRng(hash('rack', seed));
    const spots = rackSpots();
    const solids = [1, 2, 3, 4, 5, 6, 7];
    const stripes = [9, 10, 11, 12, 13, 14, 15];
    const pickFrom = (arr) => arr.splice(Math.floor(rng() * arr.length), 1)[0];
    const order = new Array(15).fill(0);
    order[4] = 8;
    const s = pickFrom(solids);
    const st = pickFrom(stripes);
    if (rng() < 0.5) {
      order[10] = s;
      order[14] = st;
    } else {
      order[10] = st;
      order[14] = s;
    }
    const rest = solids.concat(stripes);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = rest[i];
      rest[i] = rest[j];
      rest[j] = t;
    }
    let k = 0;
    for (let i = 0; i < 15; i++) if (!order[i]) order[i] = rest[k++];
    const balls = new Array(N);
    balls[0] = { x: HEAD_X - 40, y: H / 2, on: true };
    spots.forEach((p, i) => {
      // lệch rất nhỏ theo seed (không đè nhau) để mỗi ván phá bi một khác
      balls[order[i]] = { x: round3(p.x + (rng() - 0.5) * 0.004), y: round3(p.y + (rng() - 0.5) * 0.004), on: true };
    });
    return {
      seed,
      balls,
      turn: o.first === 1 ? 1 : 0,
      groups: null, // null = bàn mở; ['solid', 'stripe'] = nhóm của bên 0, bên 1
      isBreak: true,
      ballInHand: true, // cú phá: đặt bi cái phía sau vạch phát bi
      kitchen: true,
      shots: 0,
      winner: null,
      last: null,
    };
  }

  const isOver = (g) => g.winner === 0 || g.winner === 1;
  const ownGroupBalls = (group) => (group === SOLID ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15]);
  /** Số bi còn trên bàn của một nhóm. */
  function remaining(g, group) {
    let n = 0;
    ownGroupBalls(group).forEach((b) => { if (g.balls[b].on) n++; });
    return n;
  }
  /** Bên p đã hết nhóm, đang đánh bi 8. */
  const onEight = (g, p) => !!g.groups && remaining(g, g.groups[p]) === 0;
  /** Bi được phép chạm đầu tiên của bên p. */
  function legalTargets(g, p) {
    if (g.isBreak) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].filter((n) => g.balls[n].on);
    if (!g.groups) return [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15].filter((n) => g.balls[n].on);
    if (onEight(g, p)) return [8];
    return ownGroupBalls(g.groups[p]).filter((n) => g.balls[n].on);
  }
  function isLegalFirst(g, p, n) {
    if (n == null) return false;
    if (g.isBreak) return true;
    if (!g.groups) return n !== 8;
    if (onEight(g, p)) return n === 8;
    return groupOf(n) === g.groups[p];
  }

  /** Đặt được bi cái ở (x, y)? Trong bàn, không đè bi khác; cú phá thì phải sau vạch phát bi. */
  function canPlace(g, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x < R || x > W - R || y < R || y > H - R) return false;
    if (g.kitchen && x > HEAD_X) return false;
    for (let n = 1; n < N; n++) {
      const b = g.balls[n];
      if (b.on && (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) < D * D - 1e-6) return false;
    }
    return true;
  }
  /** Chỗ trống gần (x, y) nhất (dò theo vòng xoắn), dùng khi đặt lại bi cái / bi 8. */
  function nearestFree(g, x, y, ignoreKitchen) {
    const test = (px, py) => {
      if (ignoreKitchen) {
        const k = g.kitchen;
        g.kitchen = false;
        const ok = canPlace(g, px, py);
        g.kitchen = k;
        return ok;
      }
      return canPlace(g, px, py);
    };
    if (test(x, y)) return { x, y };
    for (let r = 4; r < 1200; r += 4) {
      const steps = Math.max(8, Math.round(r / 3));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const px = round3(x + Math.cos(a) * r);
        const py = round3(y + Math.sin(a) * r);
        if (test(px, py)) return { x: px, y: py };
      }
    }
    return { x: R, y: R };
  }

  /* ---------------- Mô phỏng ---------------- */
  /**
   * Mô phỏng một cú đánh tới khi mọi bi dừng.
   * balls: mảng 16 { x, y, on }; vx, vy: vận tốc đầu bi cái; spin ∈ [-1, 1]
   * opts.record: ghi khung hình (60 / s) cho hoạt cảnh; opts.soft: cú phá (tiếp xúc mềm khi bi cái chạm bi đầu tiên)
   * Trả { balls, firstHit, railAfter, potted: [{ n, p, t }], events, frames, time, stopped }
   */
  function simulate(balls0, vx0, vy0, spin, opts) {
    const record = !!(opts && opts.record);
    const soft = !!(opts && opts.soft);
    const px = new Float64Array(N);
    const py = new Float64Array(N);
    const vx = new Float64Array(N);
    const vy = new Float64Array(N);
    const on = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      px[i] = balls0[i].x;
      py[i] = balls0[i].y;
      on[i] = balls0[i].on ? 1 : 0;
    }
    vx[0] = vx0;
    vy[0] = vy0;
    let spinLeft = clamp(Number(spin) || 0, -1, 1);
    let cueTravel = 0;
    let firstHit = null;
    let railAfter = false;
    const potted = [];
    const events = [];
    const frames = [];
    let time = 0;
    const NS = SEGMENTS.length;

    const moving = (i) => on[i] && (vx[i] !== 0 || vy[i] !== 0);
    const snap = () => {
      const f = new Float32Array(N * 2);
      for (let i = 0; i < N; i++) {
        f[i * 2] = on[i] ? px[i] : NaN;
        f[i * 2 + 1] = on[i] ? py[i] : NaN;
      }
      frames.push(f);
    };
    if (record) snap();

    function potCheck(t) {
      for (let i = 0; i < N; i++) {
        if (!on[i]) continue;
        let hit = -1;
        for (let k = 0; k < 6; k++) {
          const P = POCKETS[k];
          const dx = px[i] - P.x;
          const dy = py[i] - P.y;
          if (dx * dx + dy * dy < P.r * P.r) {
            hit = k;
            break;
          }
        }
        // An toàn: lọt ra ngoài khung bàn thì coi như rơi lỗ gần nhất
        if (hit < 0 && (px[i] < -40 || px[i] > W + 40 || py[i] < -40 || py[i] > H + 40)) {
          let best = Infinity;
          for (let k = 0; k < 6; k++) {
            const d = Math.hypot(px[i] - POCKETS[k].x, py[i] - POCKETS[k].y);
            if (d < best) {
              best = d;
              hit = k;
            }
          }
        }
        if (hit >= 0) {
          on[i] = 0;
          const sp = Math.hypot(vx[i], vy[i]);
          vx[i] = 0;
          vy[i] = 0;
          potted.push({ n: i, p: hit, t });
          events.push({ t, k: 'pot', n: i, p: hit, s: sp, x: px[i], y: py[i] });
        }
      }
    }

    /** Pha tiếp xúc mềm (chỉ ở cú phá): lò xo cho mọi cặp bi đang đè nhau, tới khi tách hẳn. Trả thời gian đã qua. */
    function softPhase() {
      const c = 2 * SOFT_ZETA * Math.sqrt(SOFT_K * 0.5);
      const fx = new Float64Array(N);
      const fy = new Float64Array(N);
      let t = 0;
      let quiet = 0;
      while (t < 0.02 && quiet < 0.0005) {
        fx.fill(0);
        fy.fill(0);
        let contacts = 0;
        for (let i = 0; i < N; i++) {
          if (!on[i]) continue;
          for (let j = i + 1; j < N; j++) {
            if (!on[j]) continue;
            const rx = px[j] - px[i];
            const ry = py[j] - py[i];
            const d2 = rx * rx + ry * ry;
            if (d2 >= D * D) continue;
            const d = Math.sqrt(d2) || 1e-9;
            const nx = rx / d;
            const ny = ry / d;
            const un = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny;
            let f = SOFT_K * (D - d) - c * un;
            if (f <= 0) continue;
            contacts++;
            fx[i] -= f * nx;
            fy[i] -= f * ny;
            fx[j] += f * nx;
            fy[j] += f * ny;
          }
        }
        for (let i = 0; i < N; i++) {
          if (!on[i]) continue;
          vx[i] += fx[i] * SOFT_DT;
          vy[i] += fy[i] * SOFT_DT;
          px[i] += vx[i] * SOFT_DT;
          py[i] += vy[i] * SOFT_DT;
        }
        t += SOFT_DT;
        quiet = contacts ? 0 : quiet + SOFT_DT;
      }
      return t;
    }

    function advance(h, tBase) {
      let rem = h;
      let guard = 0;
      while (rem > 1e-12) {
        let tmin = rem;
        let ev = 0; // 0: không, 1: bi–bi, 2: bi–băng / mũi băng
        let ei = -1;
        let ej = -1;
        let enx = 0;
        let eny = 0;
        if (guard < MAX_EVENTS) {
          for (let i = 0; i < N; i++) {
            if (!on[i]) continue;
            const mi = vx[i] !== 0 || vy[i] !== 0;
            // Bi–bi (mỗi cặp một lần; ít nhất một bi đang lăn)
            for (let j = i + 1; j < N; j++) {
              if (!on[j]) continue;
              if (!mi && vx[j] === 0 && vy[j] === 0) continue;
              const rx = px[j] - px[i];
              const ry = py[j] - py[i];
              const wx = vx[j] - vx[i];
              const wy = vy[j] - vy[i];
              const b = rx * wx + ry * wy;
              if (b >= 0) continue; // không lại gần nhau
              const c = rx * rx + ry * ry - D * D;
              const a = wx * wx + wy * wy;
              let t;
              if (c <= 0) t = 0;
              else {
                // loại nhanh: khoảng cách còn xa hơn quãng tương đối đi được trong phần bước còn lại
                if (a * tmin * tmin < c && Math.sqrt(c + D * D) - D > Math.sqrt(a) * tmin) continue;
                const disc = b * b - a * c;
                if (disc < 0) continue;
                t = (-b - Math.sqrt(disc)) / a;
                if (t < 0) t = 0;
              }
              if (t < tmin) {
                tmin = t;
                ev = 1;
                ei = i;
                ej = j;
              }
            }
            if (!mi) continue;
            // Bi–băng (đoạn thẳng) và mũi băng (đầu đoạn)
            const bvx = vx[i];
            const bvy = vy[i];
            const reach = Math.hypot(bvx, bvy) * tmin;
            for (let s = 0; s < NS; s++) {
              const sg = SEGMENTS[s];
              const rx = px[i] - sg.ax;
              const ry = py[i] - sg.ay;
              const nx = -sg.uy;
              const ny = sg.ux;
              let dn = rx * nx + ry * ny;
              let sgn = 1;
              if (dn < 0) {
                dn = -dn;
                sgn = -1;
              }
              if (dn - R > reach) continue; // còn xa băng này
              const vn = (bvx * nx + bvy * ny) * sgn;
              if (vn < 0) {
                const t = dn <= R ? 0 : (dn - R) / -vn;
                if (t < tmin) {
                  const sh = rx * sg.ux + ry * sg.uy + t * (bvx * sg.ux + bvy * sg.uy);
                  if (sh >= 0 && sh <= sg.L) {
                    tmin = t;
                    ev = 2;
                    ei = i;
                    enx = nx * sgn;
                    eny = ny * sgn;
                  }
                }
              }
              // hai đầu đoạn: điểm tĩnh, va khi cách tâm bi đúng R
              for (let e = 0; e < 2; e++) {
                const qx = px[i] - (e ? sg.bx : sg.ax);
                const qy = py[i] - (e ? sg.by : sg.ay);
                const b = qx * bvx + qy * bvy;
                if (b >= 0) continue;
                const c = qx * qx + qy * qy - R * R;
                const a = bvx * bvx + bvy * bvy;
                let t;
                if (c <= 0) t = 0;
                else {
                  const disc = b * b - a * c;
                  if (disc < 0) continue;
                  t = (-b - Math.sqrt(disc)) / a;
                  if (t < 0) t = 0;
                }
                if (t < tmin) {
                  tmin = t;
                  ev = 2;
                  ei = i;
                  const cx = qx + bvx * t;
                  const cy = qy + bvy * t;
                  const l = Math.hypot(cx, cy) || 1;
                  enx = cx / l;
                  eny = cy / l;
                }
              }
            }
          }
        }
        // Đi tới thời điểm va chạm (hoặc hết bước)
        if (tmin > 0) {
          for (let i = 0; i < N; i++) {
            if (!on[i] || (vx[i] === 0 && vy[i] === 0)) continue;
            px[i] += vx[i] * tmin;
            py[i] += vy[i] * tmin;
          }
          if (spinLeft && firstHit == null) cueTravel += Math.hypot(vx[0], vy[0]) * tmin;
        }
        rem -= tmin;
        const tNow = tBase + (h - rem);
        if (ev === 1) {
          guard++;
          const i = ei;
          const j = ej;
          let nx = px[j] - px[i];
          let ny = py[j] - py[i];
          const l = Math.hypot(nx, ny) || 1;
          nx /= l;
          ny /= l;
          const un = (vx[i] - vx[j]) * nx + (vy[i] - vy[j]) * ny;
          if (un > 0 && soft && i === 0 && firstHit == null) {
            // cú phá: bi cái chạm tam giác → tiếp xúc mềm
            firstHit = j;
            events.push({ t: tNow, k: 'ball', a: i, b: j, s: un });
            const ts = softPhase();
            rem = Math.max(0, rem - ts);
          } else if (un > 0) {
            const J = ((1 + E_BALL) / 2) * un;
            const cueVx = vx[0];
            const cueVy = vy[0];
            const before = [vx[i], vy[i], vx[j], vy[j]];
            vx[i] -= J * nx;
            vy[i] -= J * ny;
            vx[j] += J * nx;
            vy[j] += J * ny;
            if (i === 0 && firstHit == null) {
              firstHit = j;
              // Xoáy: cộng (theo) hoặc trừ (kéo) một phần vận tốc cũ của bi cái theo hướng cũ
              if (spinLeft) {
                const k = SPIN_K * spinLeft * Math.exp(-cueTravel / SPIN_FADE);
                vx[0] += k * cueVx;
                vy[0] += k * cueVy;
                spinLeft = 0;
              }
            }
            // ghi vận tốc trước / sau (test bảo toàn động lượng)
            events.push({ t: tNow, k: 'ball', a: i, b: j, s: un, before, after: [vx[i], vy[i], vx[j], vy[j]] });
          }
        } else if (ev === 2) {
          guard++;
          const i = ei;
          const vn = vx[i] * enx + vy[i] * eny;
          if (vn < 0) {
            const tx = vx[i] - vn * enx;
            const ty = vy[i] - vn * eny;
            vx[i] = tx * RAIL_KEEP - E_RAIL * vn * enx;
            vy[i] = ty * RAIL_KEEP - E_RAIL * vn * eny;
            if (firstHit != null) railAfter = true;
            events.push({ t: tNow, k: 'rail', n: i, s: -vn });
          }
        }
        potCheck(tNow);
      }
    }

    let steps = 0;
    while (true) {
      let any = false;
      for (let i = 0; i < N; i++) if (moving(i)) any = true;
      if (!any) break;
      advance(STEP, time);
      time += STEP;
      steps++;
      // Ma sát lăn
      for (let i = 0; i < N; i++) {
        if (!moving(i)) continue;
        const sp = Math.hypot(vx[i], vy[i]);
        const ns = sp - DECEL * STEP - DRAG * sp * STEP;
        if (ns <= STOP_V) {
          vx[i] = 0;
          vy[i] = 0;
        } else {
          vx[i] *= ns / sp;
          vy[i] *= ns / sp;
        }
      }
      if (record && steps % REC === 0) snap();
      if (time > MAX_T) break;
    }
    if (record && steps % REC !== 0) snap();
    const stopped = time <= MAX_T;
    const out = [];
    for (let i = 0; i < N; i++) out.push({ x: round3(px[i]), y: round3(py[i]), on: !!on[i] });
    return { balls: out, firstHit, railAfter, potted, events, frames, time, stopped };
  }

  /* ---------------- Một cú đánh: kiểm tra, mô phỏng, áp luật ---------------- */
  const cloneBalls = (bs) => bs.map((b) => ({ x: b.x, y: b.y, on: b.on }));
  function cloneGame(g) {
    return {
      seed: g.seed,
      balls: cloneBalls(g.balls),
      turn: g.turn,
      groups: g.groups ? g.groups.slice() : null,
      isBreak: g.isBreak,
      ballInHand: g.ballInHand,
      kitchen: g.kitchen,
      shots: g.shots,
      winner: g.winner,
      last: g.last ? JSON.parse(JSON.stringify(g.last)) : null,
    };
  }

  /** Cú đánh hợp lệ? shot: { angle (rad), power (0..1], spin [-1, 1], cue?: { x, y } khi có bi trong tay } */
  function checkShot(g, shot) {
    if (!g || isOver(g) || !shot || typeof shot !== 'object') return false;
    if (!Number.isFinite(shot.angle) || !Number.isFinite(shot.power)) return false;
    if (shot.power < MIN_POWER || shot.power > 1) return false;
    if (shot.spin != null && (!Number.isFinite(shot.spin) || shot.spin < -1 || shot.spin > 1)) return false;
    if (shot.cue != null) {
      if (!g.ballInHand || typeof shot.cue !== 'object' || !canPlace(g, shot.cue.x, shot.cue.y)) return false;
    } else if (!g.balls[0].on) return false;
    return true;
  }

  /**
   * Áp luật lên kết quả mô phỏng. g: ván trước cú đánh (bi cái đã ở chỗ đánh), sim: kết quả simulate.
   * Trả ván mới (đã đổi lượt / có bi trong tay / thắng thua) và tóm tắt cú đánh trong .last
   */
  function applyRules(g, sim) {
    const p = g.turn;
    const o = 1 - p;
    const next = cloneGame(g);
    next.balls = cloneBalls(sim.balls);
    next.shots = g.shots + 1;
    const pottedNums = sim.potted.map((x) => x.n);
    const scratch = pottedNums.indexOf(0) >= 0;
    const eight = pottedNums.indexOf(8) >= 0;
    const obj = pottedNums.filter((n) => n !== 0 && n !== 8);
    let foul = null;
    if (scratch) foul = 'scratch';
    else if (sim.firstHit == null) foul = 'miss';
    else if (!isLegalFirst(g, p, sim.firstHit)) foul = 'wrong';
    else if (!sim.railAfter && pottedNums.length === 0) foul = 'norail';
    const last = { by: p, foul, potted: pottedNums, first: sim.firstHit, assigned: null, cont: false, eight: null, brk: g.isBreak };
    next.isBreak = false;
    next.kitchen = false;
    next.ballInHand = false;

    if (eight && !g.isBreak) {
      // Bi 8 rơi ngoài cú phá: thắng nếu đã hết nhóm và không phạm lỗi, ngược lại thua
      const win = onEight(g, p) && !foul;
      next.winner = win ? p : o;
      last.eight = win ? 'win' : 'lose';
      next.last = last;
      return next;
    }
    if (eight) {
      // Bi 8 rơi khi phá: đặt lại ở điểm đặt bi, ván chơi tiếp
      const spot = nearestFree(next, FOOT_X, H / 2, true);
      next.balls[8] = { x: spot.x, y: spot.y, on: true };
      last.eight = 'spot';
    }
    if (foul) {
      next.turn = o;
      next.ballInHand = true;
      if (!next.balls[0].on) {
        const spot = nearestFree(next, HEAD_X, H / 2, true);
        next.balls[0] = { x: spot.x, y: spot.y, on: true };
      }
    } else {
      let cont = false;
      if (!g.groups && obj.length) {
        // Bàn mở: bi đầu tiên rơi quyết định nhóm của người đánh
        const gp = groupOf(obj[0]);
        next.groups = p === 0 ? [gp, otherGroup(gp)] : [otherGroup(gp), gp];
        last.assigned = gp;
        cont = true;
      } else if (g.groups) {
        cont = obj.some((n) => groupOf(n) === g.groups[p]);
      }
      if (last.eight === 'spot') cont = true;
      last.cont = cont;
      next.turn = cont ? p : o;
    }
    next.last = last;
    return next;
  }

  /** Vận tốc đầu của bi cái theo góc / lực. */
  const cueVelocity = (shot) => {
    const v = clamp(shot.power, 0, 1) * VMAX;
    return [Math.cos(shot.angle) * v, Math.sin(shot.angle) * v];
  };

  /**
   * Đánh: trả { state, sim, start } hoặc null nếu cú đánh không hợp lệ.
   * opts.record: ghi khung hình để phát lại hoạt cảnh
   */
  function shoot(g, shot, opts) {
    if (!checkShot(g, shot)) return null;
    const before = cloneGame(g);
    if (shot.cue) before.balls[0] = { x: round3(shot.cue.x), y: round3(shot.cue.y), on: true };
    else if (g.ballInHand && !canPlace(g, g.balls[0].x, g.balls[0].y)) return null;
    const [vx, vy] = cueVelocity(shot);
    const sim = simulate(before.balls, vx, vy, shot.spin || 0, { record: !!(opts && opts.record), soft: g.isBreak });
    const state = applyRules(before, sim);
    return { state, sim, start: before.balls };
  }

  /* ---------------- Đường ngắm dự đoán ---------------- */
  /**
   * Tia từ bi cái theo góc: va chạm đầu tiên với bi (khoảng cách tâm 2R) hoặc băng (spin: xoáy của cú đánh).
   * Bi: { x, y (tâm bi cái lúc chạm), ball, ox, oy (hướng bi bị chạm), cx, cy (hướng bi cái sau chạm), dist, cut }
   * Băng: { x, y, ball: null, rx, ry (hướng bật ra), dist }; lọt lỗ: { x, y, ball: null, pocket, dist }
   */
  function predict(g, angle, cuePos, spin) {
    const c = cuePos || g.balls[0];
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best = Infinity;
    let hit = null;
    let railN = null;
    for (let n = 1; n < N; n++) {
      const b = g.balls[n];
      if (!b.on) continue;
      const rx = b.x - c.x;
      const ry = b.y - c.y;
      const along = rx * dx + ry * dy;
      if (along <= 0) continue;
      const perp2 = rx * rx + ry * ry - along * along;
      if (perp2 >= D * D) continue;
      const t = Math.max(0, along - Math.sqrt(D * D - perp2));
      if (t < best) {
        best = t;
        hit = n;
      }
    }
    SEGMENTS.forEach((sg) => {
      const nx = -sg.uy;
      const ny = sg.ux;
      const rx = c.x - sg.ax;
      const ry = c.y - sg.ay;
      let dn = rx * nx + ry * ny;
      let sgn = 1;
      if (dn < 0) {
        dn = -dn;
        sgn = -1;
      }
      const vn = (dx * nx + dy * ny) * sgn;
      if (vn < 0) {
        const t = Math.max(0, (dn - R) / -vn);
        const sh = rx * sg.ux + ry * sg.uy + t * (dx * sg.ux + dy * sg.uy);
        if (sh >= 0 && sh <= sg.L && t < best) {
          best = t;
          hit = null;
          railN = { x: nx * sgn, y: ny * sgn };
        }
      }
      [[sg.ax, sg.ay], [sg.bx, sg.by]].forEach(([qx, qy]) => {
        const ex = qx - c.x;
        const ey = qy - c.y;
        const along = ex * dx + ey * dy;
        if (along <= 0) return;
        const perp2 = ex * ex + ey * ey - along * along;
        if (perp2 >= R * R) return;
        const t = along - Math.sqrt(R * R - perp2);
        if (t < best) {
          best = t;
          hit = null;
          const hx = c.x + dx * t - qx;
          const hy = c.y + dy * t - qy;
          const l = Math.hypot(hx, hy) || 1;
          railN = { x: hx / l, y: hy / l };
        }
      });
    });
    // Lọt vào vùng rơi của lỗ trước khi chạm gì khác
    let pocket = null;
    POCKETS.forEach((P, k) => {
      const ex = P.x - c.x;
      const ey = P.y - c.y;
      const along = ex * dx + ey * dy;
      if (along <= 0) return;
      const perp2 = ex * ex + ey * ey - along * along;
      if (perp2 >= P.r * P.r) return;
      const t = Math.max(0, along - Math.sqrt(P.r * P.r - perp2));
      if (t < best) {
        best = t;
        hit = null;
        pocket = k;
      }
    });
    if (!Number.isFinite(best)) return null;
    const x = c.x + dx * best;
    const y = c.y + dy * best;
    if (pocket != null) return { x, y, ball: null, pocket, dist: best };
    if (hit != null) {
      const b = g.balls[hit];
      const ox = (b.x - x) / D;
      const oy = (b.y - y) / D;
      // bi cái: giữ phần tiếp tuyến (và chút phần pháp tuyến do nảy chưa trọn), cộng xoáy theo / kéo
      const dot = dx * ox + dy * oy;
      const k = SPIN_K * clamp(Number(spin) || 0, -1, 1) * Math.exp(-best / SPIN_FADE);
      let cx = dx - ((1 + E_BALL) / 2) * dot * ox + k * dx;
      let cy = dy - ((1 + E_BALL) / 2) * dot * oy + k * dy;
      const l = Math.hypot(cx, cy);
      if (l > 1e-6) {
        cx /= l;
        cy /= l;
      } else {
        cx = 0;
        cy = 0;
      }
      return { x, y, ball: hit, ox, oy, cx, cy, dist: best, cut: Math.acos(clamp(dot, -1, 1)) };
    }
    if (!railN) return null;
    const vn = dx * railN.x + dy * railN.y;
    return { x, y, ball: null, rx: dx - 2 * vn * railN.x, ry: dy - 2 * vn * railN.y, dist: best };
  }

  /* ---------------- Máy ---------------- */
  const LEVEL_CFG = {
    // cands: số ứng viên vào lỗ được mô phỏng; mults: hệ số lực; spins: xoáy thử; noise: lệch góc (độ) / lực (tỉ lệ)
    // robust: số cú tốt nhất được đánh thử lại với lệch tay (±1,5 lần nhiễu) để tránh cú dễ hỏng (ví dụ làm rơi bi 8)
    easy: { cands: 3, mults: [2.0], spins: [0], aNoise: 1.5, pNoise: 0.12, pos: false, safety: 4, kick: 12, place: 2, breakPow: 0.8, robust: 0 },
    medium: { cands: 7, mults: [1.5, 2.3], spins: [0], aNoise: 0.55, pNoise: 0.06, pos: true, safety: 8, kick: 24, place: 4, breakPow: 0.9, robust: 3 },
    hard: { cands: 12, mults: [1.35, 1.9, 2.8], spins: [-0.6, 0, 0.6], aNoise: 0.15, pNoise: 0.025, pos: true, safety: 14, kick: 36, place: 6, breakPow: 1, robust: 4 },
  };

  /** Đoạn thẳng A→B có bị bi nào (trừ các bi trong `skip`) chắn không (khoảng cách tâm < lim)? */
  function pathClear(g, ax, ay, bx, by, skip, lim) {
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy || 1;
    for (let n = 0; n < N; n++) {
      if (skip.indexOf(n) >= 0) continue;
      const b = g.balls[n];
      if (!b.on) continue;
      const t = clamp(((b.x - ax) * dx + (b.y - ay) * dy) / L2, 0, 1);
      const qx = ax + dx * t - b.x;
      const qy = ay + dy * t - b.y;
      if (qx * qx + qy * qy < lim * lim) return false;
    }
    return true;
  }

  /**
   * Các cú vào lỗ trực tiếp từ vị trí bi cái `cue` (bỏ trống = bi cái hiện tại) cho bên p:
   * với mỗi bi hợp lệ × mỗi lỗ, ngắm bi ma, kiểm tra đường đi thông, góc cắt không quá gắt.
   * Trả [{ n, k, angle, cut, dCG, dTP, ease }] xếp theo độ dễ giảm dần.
   */
  function potCandidates(g, p, cue) {
    const c = cue || g.balls[0];
    const out = [];
    legalTargets(g, p).forEach((n) => {
      const T = g.balls[n];
      POCKETS.forEach((P, k) => {
        let ux = P.ax - T.x;
        let uy = P.ay - T.y;
        const dTP = Math.hypot(ux, uy);
        if (dTP < 1) return;
        ux /= dTP;
        uy /= dTP;
        // góc vào lỗ: lỗ giữa chỉ nhận bi đi gần vuông góc với băng, lỗ góc nhận trong khoảng ±50° quanh đường chéo
        const into = ux * P.dx + uy * P.dy;
        if (into < (P.side ? 0.6 : 0.64)) return;
        const gx = T.x - ux * D;
        const gy = T.y - uy * D;
        if (gx < R - 2 || gx > W - R + 2 || gy < R - 2 || gy > H - R + 2) return;
        let dx = gx - c.x;
        let dy = gy - c.y;
        const dCG = Math.hypot(dx, dy);
        if (dCG < 1) return;
        dx /= dCG;
        dy /= dCG;
        const cosCut = dx * ux + dy * uy;
        if (cosCut < 0.2) return; // cắt quá mỏng (> ~78°)
        if (!pathClear(g, c.x, c.y, gx, gy, [0, n], D - 0.5)) return;
        if (!pathClear(g, T.x, T.y, P.ax, P.ay, [0, n], D - 0.5)) return;
        const ease = cosCut * cosCut * (1 / (1 + (dCG + 1.6 * dTP) / 900)) * (P.side ? 0.85 : 1);
        out.push({ n, k, angle: Math.atan2(dy, dx), cut: Math.acos(clamp(cosCut, -1, 1)), dCG, dTP, ease });
      });
    });
    out.sort((a, b) => b.ease - a.ease);
    return out;
  }

  /** Lực cần để bi mục tiêu tới lỗ (nhân `mult` để dư). */
  function powerFor(cand, mult) {
    const vObj = Math.sqrt(2 * DECEL * cand.dTP + 160 * 160);
    const vHit = vObj / Math.max(0.2, Math.cos(cand.cut) * ((1 + E_BALL) / 2));
    const v0 = Math.sqrt(vHit * vHit + 2 * DECEL * cand.dCG);
    return clamp((v0 * mult) / VMAX, 0.08, 1);
  }

  /** Độ "dễ" của cú tốt nhất bên p có từ ván g (0 = không có cú vào lỗ nào). */
  function bestEase(g, p) {
    const c = potCandidates(g, p);
    return c.length ? c[0].ease : 0;
  }

  /** Chấm ván sau cú đánh theo góc nhìn bên p. */
  function evaluate(after, p, cfg) {
    const o = 1 - p;
    if (after.winner === p) return 1e6;
    if (after.winner === o) return -1e6;
    const L = after.last;
    let v = 0;
    let own = 0;
    let opp = 0;
    L.potted.forEach((n) => {
      const gp = groupOf(n);
      if (!gp || !after.groups) return;
      if (gp === after.groups[p]) own++;
      else opp++;
    });
    v += own * 60 - opp * 15;
    if (L.foul) v -= 400;
    if (after.turn === p) {
      v += 300;
      if (cfg.pos) {
        // vị trí bi cái cho cú sau: có cú dễ thì cộng nhiều
        const cands = potCandidates(after, p);
        v += (cands.length ? cands[0].ease * 260 : -60) + Math.min(cands.length, 5) * 8;
      }
    } else {
      // tới lượt đối thủ: phạt theo cú dễ nhất của họ (có bi trong tay thì coi như dễ)
      v -= after.ballInHand ? 220 : cfg.pos ? bestEase(after, o) * 200 : 0;
    }
    return v;
  }

  /** Vị trí bi cái thử khi có bi trong tay: đặt sau bi ma của vài cú vào lỗ, cộng vài chỗ dự phòng. */
  function placements(g, p, count) {
    const spots = [];
    const seen = new Set();
    const add = (x, y) => {
      x = round3(x);
      y = round3(y);
      const key = Math.round(x / 6) + ',' + Math.round(y / 6);
      if (seen.has(key) || !canPlace(g, x, y)) return;
      seen.add(key);
      spots.push({ x, y });
    };
    const opts = [];
    legalTargets(g, p).forEach((n) => {
      const T = g.balls[n];
      POCKETS.forEach((P) => {
        let ux = P.ax - T.x;
        let uy = P.ay - T.y;
        const dTP = Math.hypot(ux, uy);
        ux /= dTP;
        uy /= dTP;
        if (ux * P.dx + uy * P.dy < (P.side ? 0.6 : 0.64)) return;
        if (!pathClear(g, T.x, T.y, P.ax, P.ay, [0, n], D - 0.5)) return;
        opts.push({ T, ux, uy, dTP });
      });
    });
    opts.sort((a, b) => a.dTP - b.dTP);
    opts.slice(0, count * 2).forEach(({ T, ux, uy }) => {
      [150, 240, 100].forEach((L) => {
        [0, 0.3, -0.3].forEach((rot) => {
          const cs = Math.cos(rot);
          const sn = Math.sin(rot);
          const bx = ux * cs - uy * sn;
          const by = ux * sn + uy * cs;
          add(T.x - ux * D - bx * L, T.y - uy * D - by * L);
        });
      });
    });
    if (g.balls[0].on) add(g.balls[0].x, g.balls[0].y);
    const head = nearestFree(g, HEAD_X - 40, H / 2);
    add(head.x, head.y);
    return spots;
  }

  /**
   * Máy chọn cú đánh theo từng phần để không làm đơ giao diện.
   * createPlanner(g, level) → { step(maxJobs) → true khi xong, result() → shot }
   * Kết quả tất định theo (ván, mức). Cú đánh trả về đã cộng nhiễu tay theo mức.
   */
  function createPlanner(g0, level) {
    const lv = LEVELS.indexOf(level) >= 0 ? level : 'medium';
    const cfg = LEVEL_CFG[lv];
    const g = cloneGame(g0);
    const p = g.turn;
    const rng = makeRng(hash('ai', g.seed, g.shots, p, lv));
    let best = null; // { score, shot }
    let done = false;
    let count = 0; // số phần đã chạy
    const scored = [];

    const tryShot = (shot) => {
      const out = shoot(g, shot);
      if (!out) return;
      const score = evaluate(out.state, p, cfg) + rng() * 0.5; // phá thế hòa nhẹ, tất định
      scored.push({ score, shot });
      if (!best || score > best.score) best = { score, shot };
    };

    // Các pha chạy lần lượt; mỗi pha dựng danh sách việc khi tới lượt (dựa trên kết quả các pha trước)
    const phases = [];
    if (isOver(g)) {
      done = true;
    } else if (g.isBreak) {
      // Cú phá: đặt bi cái gần giữa vạch, đánh thẳng vào bi đỉnh tam giác
      const y = H / 2 + (rng() - 0.5) * 60;
      const cue = nearestFree(g, HEAD_X - 30, y);
      let apex = null;
      for (let n = 1; n < N; n++) if (g.balls[n].on && (apex == null || g.balls[n].x < g.balls[apex].x)) apex = n;
      const ang = Math.atan2(g.balls[apex].y - cue.y, g.balls[apex].x - cue.x);
      best = { score: 0, shot: { angle: ang, power: cfg.breakPow, spin: 0, cue } };
    } else {
      const cues = g.ballInHand ? placements(g, p, cfg.place) : [g.balls[0]];
      const c0 = cues[0];
      const cueOf = (c) => (g.ballInHand ? c : undefined);
      // 1. Ứng viên vào lỗ từ mọi vị trí bi cái thử, lấy những cú dễ nhất × các mức lực × xoáy
      phases.push(() => {
        let cands = [];
        cues.forEach((c) => potCandidates(g, p, c).forEach((x) => cands.push(Object.assign({ cue: c }, x))));
        cands.sort((a, b) => b.ease - a.ease);
        cands = cands.slice(0, cfg.cands * (g.ballInHand ? 2 : 1));
        const list = [];
        cands.forEach((cd) => {
          cfg.mults.forEach((m) => {
            cfg.spins.forEach((sp) => list.push(() => tryShot({ angle: cd.angle, power: powerFor(cd, m), spin: sp, cue: cueOf(cd.cue) })));
          });
        });
        return list;
      });
      // 2. Không có cú vào lỗ tốt: chạm thẳng (hoặc hơi mỏng) bi hợp lệ gần nhất với vài mức lực (phòng thủ)
      phases.push(() => {
        if (best && best.score > 200) return [];
        const list = [];
        legalTargets(g, p)
          .slice()
          .sort((a, b) => Math.hypot(g.balls[a].x - c0.x, g.balls[a].y - c0.y) - Math.hypot(g.balls[b].x - c0.x, g.balls[b].y - c0.y))
          .slice(0, cfg.safety)
          .forEach((n) => {
            const T = g.balls[n];
            if (!pathClear(g, c0.x, c0.y, T.x, T.y, [0, n], D - 0.5)) return;
            const base = Math.atan2(T.y - c0.y, T.x - c0.x);
            const dist = Math.hypot(T.x - c0.x, T.y - c0.y);
            [0, 0.6, -0.6].forEach((off) => {
              const ang = base + Math.asin(clamp((off * D) / Math.max(dist, D), -1, 1));
              [0.3, 0.55].forEach((pw) => list.push(() => tryShot({ angle: ang, power: pw, spin: 0, cue: cueOf(c0) })));
            });
          });
        return list;
      });
      // 3. Vẫn chưa có cú nào không phạm lỗi (bị chắn hết): quét đều hướng quanh bi cái (đánh băng)
      phases.push(() => {
        if (best && best.score > -300) return [];
        const list = [];
        for (let i = 0; i < cfg.kick; i++) {
          const ang = (i / cfg.kick) * Math.PI * 2 + rng() * 0.05;
          list.push(() => tryShot({ angle: ang, power: 0.6, spin: 0, cue: cueOf(c0) }));
        }
        return list;
      });
      // 4. Thử lại vài cú tốt nhất với lệch tay (±1,5 lần nhiễu), chọn cú có điểm trung bình cao nhất
      let top = [];
      phases.push(() => {
        if (!cfg.robust) return [];
        top = scored.slice().sort((a, b) => b.score - a.score).slice(0, cfg.robust);
        const da = (cfg.aNoise * 1.5 * Math.PI) / 180;
        const dp = cfg.pNoise * 1.5;
        const list = [];
        top.forEach((cd) => {
          cd.sum = cd.score;
          cd.cnt = 1;
          [[da, 0], [-da, 0], [0, dp], [0, -dp]].forEach(([a, q]) => {
            list.push(() => {
              const sh = Object.assign({}, cd.shot, { angle: cd.shot.angle + a, power: clamp(cd.shot.power * (1 + q), MIN_POWER, 1) });
              const out = shoot(g, sh);
              cd.sum += out ? evaluate(out.state, p, cfg) : -1e6;
              cd.cnt++;
            });
          });
        });
        list.push(() => {
          let pick = null;
          top.forEach((cd) => { if (!pick || cd.sum / cd.cnt > pick.sum / pick.cnt) pick = cd; });
          if (pick) best = { score: pick.sum / pick.cnt, shot: pick.shot };
        });
        return list;
      });
    }

    let phase = -1;
    let queue = [];
    function step(maxJobs) {
      const lim = maxJobs == null ? Infinity : maxJobs;
      let k = 0;
      while (!done && k < lim) {
        if (!queue.length) {
          phase++;
          if (phase >= phases.length) {
            done = true;
            break;
          }
          queue = phases[phase]();
          continue;
        }
        queue.shift()();
        count++;
        k++;
      }
      return done;
    }
    function result() {
      if (isOver(g)) return null;
      const shot = best
        ? best.shot
        : { angle: rng() * Math.PI * 2, power: 0.5, spin: 0, cue: g.ballInHand ? nearestFree(g, HEAD_X - 40, H / 2) : undefined };
      // Nhiễu tay theo mức (tất định theo ván)
      const a = shot.angle + (gauss(rng) * cfg.aNoise * Math.PI) / 180;
      const pw = clamp(shot.power * (1 + gauss(rng) * cfg.pNoise), MIN_POWER, 1);
      const res = { angle: a, power: pw, spin: shot.spin || 0 };
      if (shot.cue) res.cue = { x: shot.cue.x, y: shot.cue.y };
      return res;
    }
    return {
      step,
      result,
      get done() { return done; },
      get jobs() { return count; },
    };
  }

  /** Chọn cú đánh một lần (dùng trong test và khi không cần chia nhỏ). */
  function chooseShot(g, level) {
    const pl = createPlanner(g, level);
    while (!pl.step(1000));
    return pl.result();
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  function toJSON(g) {
    return {
      v: VERSION,
      seed: g.seed,
      balls: g.balls.map((b) => [round3(b.x), round3(b.y), b.on ? 1 : 0]),
      turn: g.turn,
      groups: g.groups ? g.groups.slice() : null,
      isBreak: g.isBreak,
      ballInHand: g.ballInHand,
      kitchen: g.kitchen,
      shots: g.shots,
      winner: g.winner,
      last: g.last ? JSON.parse(JSON.stringify(g.last)) : null,
    };
  }

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    if (!Number.isInteger(raw.seed) || raw.seed < 0 || raw.seed > 4294967295) return null;
    if (!Array.isArray(raw.balls) || raw.balls.length !== N) return null;
    const balls = [];
    for (let i = 0; i < N; i++) {
      const b = raw.balls[i];
      if (!Array.isArray(b) || b.length !== 3) return null;
      const [x, y, o] = b;
      if (!Number.isFinite(x) || !Number.isFinite(y) || (o !== 0 && o !== 1)) return null;
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) return null;
      balls.push({ x, y, on: o === 1 });
    }
    // bi trên bàn không được đè nhau
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        if (balls[i].on && balls[j].on && Math.hypot(balls[i].x - balls[j].x, balls[i].y - balls[j].y) < D - 0.5) return null;
      }
    }
    if (raw.turn !== 0 && raw.turn !== 1) return null;
    let groups = null;
    if (raw.groups != null) {
      if (!Array.isArray(raw.groups) || raw.groups.length !== 2) return null;
      const [a, b] = raw.groups;
      if (!((a === SOLID && b === STRIPE) || (a === STRIPE && b === SOLID))) return null;
      groups = [a, b];
    }
    if (typeof raw.isBreak !== 'boolean' || typeof raw.ballInHand !== 'boolean' || typeof raw.kitchen !== 'boolean') return null;
    if (!Number.isInteger(raw.shots) || raw.shots < 0) return null;
    if (raw.winner !== null && raw.winner !== 0 && raw.winner !== 1) return null;
    if (raw.winner === null && (!balls[8].on || !balls[0].on)) return null; // bi 8 / bi cái rơi mà chưa có kết quả
    if (raw.isBreak && raw.shots !== 0) return null;
    if (raw.last != null && typeof raw.last !== 'object') return null;
    return {
      seed: raw.seed,
      balls,
      turn: raw.turn,
      groups,
      isBreak: raw.isBreak,
      ballInHand: raw.ballInHand,
      kitchen: raw.kitchen,
      shots: raw.shots,
      winner: raw.winner,
      last: raw.last ? JSON.parse(JSON.stringify(raw.last)) : null,
    };
  }

  const api = {
    VERSION, W, H, R, D, HEAD_X, FOOT_X, VMAX, STEP, REC, MIN_POWER, LEVELS, POCKETS, SEGMENTS, SOLID, STRIPE, E_BALL, LEVEL_CFG,
    newGame, isOver, groupOf, remaining, onEight, legalTargets, isLegalFirst, canPlace, nearestFree,
    simulate, shoot, checkShot, applyRules, predict, potCandidates, createPlanner, chooseShot,
    toJSON, fromJSON, makeRng, hash, rackSpots, cloneGame,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
