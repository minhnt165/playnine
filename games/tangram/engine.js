/* =====================================================================
 * Tangram - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - 7 mảnh cổ điển trên lưới đơn vị: 2 tam giác lớn (cạnh góc vuông 2), 1 tam giác vừa (cạnh huyền 2),
 *     2 tam giác nhỏ (cạnh góc vuông 1), 1 hình vuông cạnh 1, 1 hình bình hành (cạnh 1 và √2); tổng diện tích 8
 *   - Tọa độ chính xác: mỗi số có dạng a + b·s với s = √2/2, a và b là số hữu tỉ nhị phân (double biểu diễn đúng).
 *     Xoay 45° (x, y) -> ((x − y)·s, (x + y)·s) vẫn ở dạng đó, nên không bao giờ có sai số làm tròn.
 *   - Một điểm là mảng 4 số [ax, bx, ay, by]: x = ax + bx·s, y = ay + by·s (trục y hướng xuống như SVG)
 *   - Hình mục tiêu sinh từ lời giải đã biết (7 mảnh đặt sẵn), nên màn nào cũng giải được
 *   - Thắng: các mảnh không chồng nhau (diện tích giao từng cặp = 0) và tổng diện tích phần giao
 *     giữa mảnh và hình mục tiêu = 8 (= diện tích hình mục tiêu = tổng diện tích mảnh) -> hợp các mảnh trùng hình mục tiêu
 *   - Hít: góc xoay bội 45°; vị trí hít về lưới nửa đơn vị (một đỉnh của mảnh rơi vào điểm lưới)
 *     hoặc hít đỉnh vào đỉnh của hình mục tiêu / mảnh khác khi đủ gần
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const S = Math.SQRT1_2;
  const AREA = 8; // tổng diện tích 7 mảnh
  const BOX = 3.6; // hình mục tiêu nằm trong [-BOX, BOX]²
  const SNAP_R = 0.36; // bán kính hít đỉnh vào đỉnh (đơn vị lưới)

  /* ---------------- Số a + b·s ---------------- */
  const mul = (p, q) => [p[0] * q[0] + (p[1] * q[1]) / 2, p[0] * q[1] + p[1] * q[0]];
  /** Dấu của a + b·s (so sánh chính xác: |a| với |b|·s ⇔ 2a² với b²). */
  function sign(a, b) {
    if (a >= 0 && b >= 0) return a === 0 && b === 0 ? 0 : 1;
    if (a <= 0 && b <= 0) return -1;
    const d = 2 * a * a - b * b; // khác 0 vì √2 vô tỉ
    return a > 0 ? (d > 0 ? 1 : -1) : d > 0 ? -1 : 1;
  }
  const fx = (p) => p[0] + p[1] * S; // tọa độ x thực
  const fy = (p) => p[2] + p[3] * S; // tọa độ y thực
  const padd = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2], p[3] + q[3]];
  const psub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2], p[3] - q[3]];
  const peq = (p, q) => p[0] === q[0] && p[1] === q[1] && p[2] === q[2] && p[3] === q[3];
  /** Xoay 45° theo chiều kim đồng hồ trên màn hình (trục y xuống). */
  const rot45 = (p) => [(p[1] - p[3]) / 2, p[0] - p[2], (p[1] + p[3]) / 2, p[0] + p[2]];
  /** Tích có hướng của hai vectơ, kết quả [a, b] = a + b·s. */
  const cross = (p, q) => {
    const u = mul([p[0], p[1]], [q[2], q[3]]);
    const v = mul([p[2], p[3]], [q[0], q[1]]);
    return [u[0] - v[0], u[1] - v[1]];
  };

  /* ---------------- Mảnh ---------------- */
  // Thứ tự 7 mảnh trong ván: L L M S S Q P. Hình gốc trên lưới nguyên, đỉnh 0 là điểm neo (gốc xoay).
  const BASE = {
    L: [[0, 0], [2, 0], [0, 2]],
    M: [[0, 0], [2, 0], [1, 1]],
    S: [[0, 0], [1, 0], [0, 1]],
    Q: [[0, 0], [1, 0], [1, 1], [0, 1]],
    P: [[0, 0], [1, 0], [2, 1], [1, 1]],
  };
  const TYPES = ['L', 'L', 'M', 'S', 'S', 'Q', 'P'];
  const PIECE_AREA = { L: 2, M: 1, S: 0.5, Q: 1, P: 1 };

  /** Đỉnh của mảnh `type` xoay r·45°, lật ngang nếu f (chỉ hình bình hành cần), neo tại gốc. */
  function shape(type, r, f) {
    return BASE[type].map(([x, y]) => {
      let p = [f ? -x : x, 0, y, 0].map((n) => n || 0);
      for (let k = 0; k < r; k++) p = rot45(p);
      return p;
    });
  }
  const placed = (type, pc) => shape(type, pc.r, pc.f).map((v) => padd(v, pc.p));

  /* ---------------- Hình học chính xác ---------------- */
  function area2(poly) {
    // 2 × diện tích có dấu (công thức dây giày), dạng [a, b]
    let a = 0;
    let b = 0;
    for (let i = 0; i < poly.length; i++) {
      const c = cross(poly[i], poly[(i + 1) % poly.length]);
      a += c[0];
      b += c[1];
    }
    return [a, b];
  }
  /** Diện tích (không dấu) dạng [a, b]. */
  function area(poly) {
    const [a, b] = area2(poly);
    return sign(a, b) < 0 ? [-a / 2, -b / 2] : [a / 2 || 0, b / 2 || 0];
  }

  /** Hướng nguyên của cạnh (mọi cạnh đều theo 4 phương 0°, 45°, 90°, 135°). */
  function dir(d) {
    const sx = sign(d[0], d[1]);
    const sy = sign(d[2], d[3]);
    if (sx === 0) return [0, sy];
    if (sy === 0) return [sx, 0];
    if (d[0] === d[2] && d[1] === d[3]) return [sx, sx];
    if (d[0] === -d[2] && d[1] === -d[3]) return [sx, -sx];
    throw new Error('cạnh lệch hướng');
  }
  /** u (vectơ nguyên) × (điểm) dạng [a, b]. */
  const crossU = (u, p) => [u[0] * p[2] - u[1] * p[0], u[0] * p[3] - u[1] * p[1]];

  /** Giao của đường qua A hướng u1 với đoạn XY (chỉ chia cho ±1 hoặc ±2 nên vẫn chính xác). */
  function meet(A, u1, X, Y) {
    const u2 = dir(psub(Y, X));
    const c = u1[0] * u2[1] - u1[1] * u2[0];
    const k = crossU(u1, psub(X, A));
    const ta = -k[0] / c;
    const tb = -k[1] / c;
    return [X[0] + ta * u2[0], X[1] + tb * u2[0], X[2] + ta * u2[1], X[3] + tb * u2[1]].map((n) => n || 0);
  }

  /** Cắt đa giác lồi `subj` theo đa giác lồi `clipPoly` (Sutherland–Hodgman), tọa độ chính xác. */
  function clip(subj, clipPoly) {
    const o = sign(...area2(clipPoly));
    let out = subj;
    for (let i = 0; i < clipPoly.length && out.length; i++) {
      const A = clipPoly[i];
      const u1 = dir(psub(clipPoly[(i + 1) % clipPoly.length], A));
      const side = (X) => o * sign(...crossU(u1, psub(X, A)));
      const inp = out;
      out = [];
      for (let j = 0; j < inp.length; j++) {
        const X = inp[(j + inp.length - 1) % inp.length];
        const Y = inp[j];
        const sX = side(X);
        const sY = side(Y);
        if (sY >= 0) {
          if (sX < 0) out.push(meet(A, u1, X, Y));
          out.push(Y);
        } else if (sX >= 0) out.push(meet(A, u1, X, Y));
      }
    }
    return out;
  }
  function bbox(poly) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    poly.forEach((p) => {
      const x = fx(p);
      const y = fy(p);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    });
    return { x0, y0, x1, y1 };
  }
  const apart = (a, b) => a.x1 <= b.x0 + 1e-9 || b.x1 <= a.x0 + 1e-9 || a.y1 <= b.y0 + 1e-9 || b.y1 <= a.y0 + 1e-9;
  /** Diện tích giao của hai đa giác lồi, dạng [a, b] (bỏ qua nhanh khi khung bao rời nhau). */
  function overlap(P, Q) {
    if (apart(bbox(P), bbox(Q))) return [0, 0];
    const c = clip(P, Q);
    return c.length < 3 ? [0, 0] : area(c);
  }
  const isZero = (v) => v[0] === 0 && v[1] === 0;

  /** Hai đa giác trùng nhau (cùng tập đỉnh, không kể thứ tự). */
  function samePoly(P, Q) {
    return P.length === Q.length && P.every((p) => Q.some((q) => peq(p, q)));
  }

  /**
   * Bộ mảnh `ps` phủ đúng hình mục tiêu (danh sách đa giác lồi rời nhau `target`):
   * không cặp mảnh nào chồng nhau và tổng diện tích giao mảnh × mục tiêu = 8.
   */
  function covers(ps, target) {
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) if (!isZero(overlap(ps[i], ps[j]))) return false;
    }
    let a = 0;
    let b = 0;
    ps.forEach((P) => target.forEach((T) => {
      const v = overlap(P, T);
      a += v[0];
      b += v[1];
    }));
    return a === AREA && b === 0;
  }

  /* ---------------- Màn chơi: viết bằng lời giải ---------------- */
  // Mỗi màn là 7 mảnh đặt sẵn, viết gọn "loại.kiểu x y" (x, y: góc trên trái khung bao, dạng "1.5", "2s", "1+s"):
  //   lớp A (cạnh 1 theo trục, đơn vị 1): L.tl/tr/br/bl (góc vuông ở đâu), S.tl…, M.d/u/l/r (đỉnh nhọn hướng nào),
  //     Q, P.h1/h2/v1/v2 (hình bình hành nằm ngang / dọc, hai chiều nghiêng)
  //   lớp B (*, xoay 45°, đơn vị s = √2/2): *S.d/u/l/r, *L.d/u/l/r, *M.tl/tr/br/bl, *Q (hình thoi), *P.h1/h2/v1/v2
  const FORMS = {
    'L.tl': [[0, 0], [2, 0], [0, 2]], 'L.tr': [[0, 0], [2, 0], [2, 2]], 'L.br': [[2, 0], [2, 2], [0, 2]], 'L.bl': [[0, 0], [2, 2], [0, 2]],
    'S.tl': [[0, 0], [1, 0], [0, 1]], 'S.tr': [[0, 0], [1, 0], [1, 1]], 'S.br': [[1, 0], [1, 1], [0, 1]], 'S.bl': [[0, 0], [1, 1], [0, 1]],
    'M.d': [[0, 0], [2, 0], [1, 1]], 'M.u': [[0, 1], [2, 1], [1, 0]], 'M.r': [[0, 0], [0, 2], [1, 1]], 'M.l': [[1, 0], [1, 2], [0, 1]],
    'Q': [[0, 0], [1, 0], [1, 1], [0, 1]],
    'P.h1': [[0, 0], [1, 0], [2, 1], [1, 1]], 'P.h2': [[1, 0], [2, 0], [1, 1], [0, 1]],
    'P.v1': [[0, 0], [1, 1], [1, 2], [0, 1]], 'P.v2': [[1, 0], [1, 1], [0, 2], [0, 1]],
    '*S.d': [[0, 0], [2, 0], [1, 1]], '*S.u': [[0, 1], [2, 1], [1, 0]], '*S.r': [[0, 0], [0, 2], [1, 1]], '*S.l': [[1, 0], [1, 2], [0, 1]],
    '*L.d': [[0, 0], [4, 0], [2, 2]], '*L.u': [[0, 2], [4, 2], [2, 0]], '*L.r': [[0, 0], [0, 4], [2, 2]], '*L.l': [[2, 0], [2, 4], [0, 2]],
    '*M.tl': [[0, 0], [2, 0], [0, 2]], '*M.tr': [[0, 0], [2, 0], [2, 2]], '*M.br': [[2, 0], [2, 2], [0, 2]], '*M.bl': [[0, 0], [2, 2], [0, 2]],
    '*Q': [[1, 0], [2, 1], [1, 2], [0, 1]],
    '*P.h1': [[0, 0], [2, 0], [3, 1], [1, 1]], '*P.h2': [[1, 0], [3, 0], [2, 1], [0, 1]],
    '*P.v1': [[0, 0], [1, 1], [1, 3], [0, 2]], '*P.v2': [[1, 0], [1, 2], [0, 3], [0, 1]],
  };

  /** "1.5-0.5s" -> [1.5, -0.5] */
  function parseNum(str) {
    let a = 0;
    let b = 0;
    String(str).replace(/-/g, '+-').split('+').filter(Boolean).forEach((term) => {
      if (term.slice(-1) === 's') {
        const c = term.slice(0, -1);
        b += c === '' ? 1 : c === '-' ? -1 : Number(c);
      } else a += Number(term);
    });
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('số lỗi: ' + str);
    return [a, b];
  }

  /** Một mảnh viết gọn -> { t, poly } chính xác. */
  function parseToken(tok) {
    const [form, xs, ys] = tok.trim().split(/\s+/);
    const pts = FORMS[form];
    if (!pts) throw new Error('kiểu mảnh lạ: ' + form);
    const B = form[0] === '*';
    const t = form[B ? 1 : 0];
    const ox = parseNum(xs);
    const oy = parseNum(ys);
    const poly = pts.map(([x, y]) => (B ? [ox[0], ox[1] + x, oy[0], oy[1] + y] : [ox[0] + x, ox[1], oy[0] + y, oy[1]]));
    return { t, poly };
  }

  /** Tìm góc xoay, lật và điểm neo để mảnh `t` trùng đa giác `poly`. */
  function placementOf(t, poly) {
    for (let f = 0; f < (t === 'P' ? 2 : 1); f++) {
      for (let r = 0; r < 8; r++) {
        const sh = shape(t, r, f);
        for (let k = 0; k < poly.length; k++) {
          const p = psub(poly[k], sh[0]);
          if (samePoly(sh.map((v) => padd(v, p)), poly)) return { r, f, p };
        }
      }
    }
    throw new Error('mảnh ' + t + ' không khớp hình');
  }

  /** Dựng màn từ lời giải: đặt hình vào giữa khung (dời theo bội 0,5 để giữ lưới), gán mảnh theo thứ tự L L M S S Q P. */
  function buildPuzzle(def) {
    const items = def.sol.split(',').map(parseToken);
    const all = [].concat(...items.map((it) => it.poly));
    const bb = bbox(all);
    const shift = [-Math.round(bb.x0 + bb.x1) / 2, 0, -Math.round(bb.y0 + bb.y1) / 2, 0].map((n) => n || 0);
    const slots = [];
    const used = items.map(() => false);
    TYPES.forEach((t) => {
      const k = items.findIndex((it, i) => !used[i] && it.t === t);
      if (k < 0) throw new Error(def.id + ': thiếu mảnh ' + t);
      used[k] = true;
      const poly = items[k].poly.map((v) => padd(v, shift));
      slots.push(Object.assign({ t, poly }, placementOf(t, poly)));
    });
    if (used.some((u) => !u)) throw new Error(def.id + ': thừa mảnh');
    const verts = [];
    slots.forEach((sl) => sl.poly.forEach((v) => { if (!verts.some((q) => peq(q, v))) verts.push(v); }));
    return { id: def.id, cat: def.cat, slots, target: slots.map((sl) => sl.poly), verts };
  }

  // Thể loại: animal (con vật), people (người), object (đồ vật), letter (chữ cái), number (chữ số)
  // Thứ tự = thứ tự màn trong danh sách chọn màn. Mọi mảnh lớp A neo trên lưới nửa đơn vị.
  const DEFS = [
    { id: 'fish', cat: 'animal', sol: 'L.br 1 0, L.bl 3 0, P.h1 1 2, S.tr 2 2, Q 3 2, S.tl 4 2, M.l 5 1' },
    { id: 'cat', cat: 'animal', sol: '*S.r 2-s 2-3s, *S.l 2 2-3s, *Q 2-s 2-2s, M.u 1 2, L.tr 1 3, L.bl 1 3, P.h2 3 4' },
    { id: 'rabbit', cat: 'animal', sol: '*Q 1.5-s 3-2s, *P.v1 1.5 3-4s, *S.r 1.5-s 3-3s, L.tr 0 3, L.bl 0 3, S.br -1 4, M.r 2 3' },
    { id: 'bird', cat: 'animal', sol: 'L.tr 0 0, L.tl 3 0, M.r 2 0, S.tr 2 0, S.br 2 1, Q 2 -1, P.v1 2 2' },
    { id: 'fox', cat: 'animal', sol: 'L.br 0 2, L.bl 2 2, M.d 1 1, S.bl 1 0, S.br 2 0, P.h2 4 3, Q 5 2' },
    { id: 'camel', cat: 'animal', sol: 'L.br 0 0, L.br 2 0, P.h2 4 1, Q 5 0, S.tl 0 2, S.tr 3 2, M.d 1 2' },
    { id: 'duck', cat: 'animal', sol: 'S.br 0 1, M.d 0 2, Q 1 1, L.br 1 1, S.tl 2 1, L.tl 3 0, P.v2 3 1' },
    { id: 'turtle', cat: 'animal', sol: 'L.br 0 0, L.bl 2 0, S.tl 0 2, S.tr 3 2, P.h2 4 1, Q -1 1.5, M.d 1 2' },
    { id: 'owl', cat: 'animal', sol: 'L.bl 0 0, L.tl 0 2, S.br 0 3, Q 0.5 4, M.l 1 0, P.v2 1 2, S.br 1 3' },
    { id: 'butterfly', cat: 'animal', sol: 'L.bl 0 0, L.tl 0 2, M.l 2 1, S.br 3 0, Q 3 1, S.tr 3 2, P.v1 3 2' },
    { id: 'whale', cat: 'animal', sol: 'M.r -1 0, S.br 0 0, Q 0 1, L.tl 1 0, L.br 1 0, P.v1 3 0, S.bl 3 1' },
    { id: 'dog', cat: 'animal', sol: 'L.tr 1 1, L.bl 1 1, P.h2 3 0, S.tl 5 0, Q 2 3, S.tl 1 3, M.l 0 0' },
    { id: 'dancer', cat: 'people', sol: 'Q 1.5 0, L.tr 0 1, L.tl 2 1, M.u 1 3, S.bl 1 4, P.h1 2 4, S.br -1 0' },
    { id: 'jumper', cat: 'people', sol: 'L.tr 1.5 1, L.bl 1.5 1, Q 2 0, S.tr 0.5 0, S.tl 3.5 0, P.h2 0.5 3, M.l 2.5 3' },
    { id: 'waver', cat: 'people', sol: 'L.tl 1.5 1, L.br 1.5 1, S.tl 1.5 3, M.u 1.5 3, Q 2 0, S.tr 2.5 3, P.v2 3.5 -1' },
    { id: 'walker', cat: 'people', sol: 'S.br 0.5 3, L.tl 1.5 1, L.br 1.5 1, S.tl 1.5 3, Q 2 0, P.h1 2.5 3, M.r 3.5 1' },
    { id: 'runner', cat: 'people', sol: 'S.br 0 3, L.br 1 1, S.tl 1 3, P.h1 2 3, L.tl 3 1, Q 4 0, M.d 5 1' },
    { id: 'kicker', cat: 'people', sol: 'L.tr 1 1, L.bl 1 1, Q 1.5 0, M.d 3 2, S.br 0 1, P.v2 1 3, S.tr 0 4' },
    { id: 'sitter', cat: 'people', sol: 'L.tl 0 1, L.br 0 1, Q 0.5 0, S.tl 2 2, P.h2 2 2, M.l 3 2, S.bl 3 3' },
    { id: 'kneeler', cat: 'people', sol: 'L.tl 0 1, L.br 0 1, S.tl 0 3, M.u 0 3, P.h1 1 3, Q 2 0.5, S.tr 2 3' },
    { id: 'meditator', cat: 'people', sol: 'L.br 0 1, S.tr 0 3, M.d 1 3, S.bl 1 3, Q 1.5 0, L.bl 2 1, P.h2 2 3' },
    { id: 'house', cat: 'object', sol: 'L.br -0.5 0, S.tl 0 2, M.u 0 2, S.tr 1 2, L.bl 1.5 0, P.v1 2 -0.5, Q 2 2' },
    { id: 'boat', cat: 'object', sol: 'L.bl 1 0, L.bl -1 0, P.h1 -1 2, S.tr 0 2, Q 1 2, M.d 2 2, S.bl 2 2' },
    { id: 'arrow', cat: 'object', sol: 'L.bl 2 0, L.tl 2 2, M.d 0 1.5, S.bl 0 1.5, S.br 1 1.5, Q -1 1.5, P.h2 -3 1.5' },
    { id: 'tree', cat: 'object', sol: 'L.br 0 1, M.u 1 0, S.tl 1 1, Q 1.5 3, P.v1 1.5 4, S.tr 2 1, L.bl 2 1' },
    { id: 'mushroom', cat: 'object', sol: 'L.br -0.5 0, S.tl 1.5 0, M.l 1.5 0, P.v1 1.5 1, S.bl 1.5 2, Q 1.5 3, L.bl 2.5 0' },
    { id: 'umbrella', cat: 'object', sol: 'L.br 0 0, S.br 0.5 5, Q 1.5 2, S.tr 1.5 3, M.r 1.5 3, P.v2 1.5 4, L.bl 2 0' },
    { id: 'hourglass', cat: 'object', sol: 'L.tr 0 0, S.br 0 3, M.u 1 2, Q 1 3, L.tl 2 0, P.h1 2 3, S.bl 2 3' },
    { id: 'square', cat: 'object', sol: '*L.r 0 0, *L.d 0 0, *M.br 2s 2s, *Q 2s 1s, *S.l 3s 0, *S.u 1s 2s, *P.h2 0 3s' },
    { id: 'triangle', cat: 'object', sol: 'L.tr 0 0, S.bl 0 0, Q 0 1, S.tl 0 2, P.v2 0 2, M.r 1 1, L.tl 2 0' },
    { id: 'rectangle', cat: 'object', sol: 'L.tl 0 0, L.br 0 0, S.tl 2 0, P.h2 2 0, Q 2 1, M.l 3 0, S.bl 3 1' },
    { id: 'trapezoid', cat: 'object', sol: 'L.br 0 0, L.tl 2 0, S.br 2 1, M.u 3 0, Q 3 1, P.h1 4 1, S.bl 4 1' },
    { id: 'hexagon', cat: 'object', sol: 'S.br 0 0, P.h1 0 1, Q 1 0, S.tr 1 1, L.tl 2 0, L.br 2 0, M.r 4 0' },
    { id: 'a', cat: 'letter', sol: 'L.br -1 1, M.u 1 0, S.tl 1 1, P.v2 1 1, Q 2 1, S.tr 2 2, L.bl 3 1' },
    { id: 'l', cat: 'letter', sol: 'S.tl 0 1, M.l 0 1, P.v1 0 2, L.bl 0 3, Q 1 3, S.tr 1 4, L.bl 2 3' },
    { id: 't', cat: 'letter', sol: 'S.tr 0 0, Q 1 0, L.tl 1.5 1, L.br 1.5 1, M.d 2 0, S.bl 2 0, P.h2 3 0' },
    { id: 'v', cat: 'letter', sol: 'L.tr 0 0, S.bl 2 0, Q 2 1, M.d 2 2, P.v2 3 0, S.br 3 1, L.tl 4 0' },
    { id: 'y', cat: 'letter', sol: 'S.tr 0 0, M.r 1 0, S.br 1 1, L.tl 1 2, L.br 1 2, P.h2 2 0, Q 2 1' },
    { id: 'two', cat: 'number', sol: 'L.br 0 2, S.tl 0 4, P.h2 0 4, S.br 1 4, M.u 2 1, L.tl 2 2, Q 2 4' },
    { id: 'six', cat: 'number', sol: 'M.l -2 -5, S.bl -2 -4, Q -2 -3, L.tl -2 -2, L.br -2 -2, S.tl -1 -5, P.h2 -1 -5' },
    { id: 'seven', cat: 'number', sol: 'S.tl 0 0, M.u 0 0, L.br 0 1, P.h1 1 0, S.tr 2 0, L.tl 2 1, Q 3 0' },
    { id: 'nine', cat: 'number', sol: 'S.br -1 4, L.tl 0 0, L.br 0 0, Q 0 4, S.tr 1 2, M.r 1 2, P.v2 1 3' },
  ];
  const PUZZLES = DEFS.map(buildPuzzle);
  const byId = (id) => PUZZLES.find((p) => p.id === id) || null;

  /* ---------------- Khay mảnh và khung nhìn ---------------- */
  // Hình mục tiêu ở giữa ô [-BOX, BOX]²; khay ở dưới (màn dọc) hoặc bên phải (màn ngang).
  const HOMES = {
    portrait: [[-3.5, 4], [-1, 4], [1.5, 4], [-3.5, 6.5], [-2, 6.5], [-0.5, 6.5], [1.5, 5.5]],
    landscape: [[4, -2.5], [6.5, -2.5], [4, 0], [4, 1.5], [5.5, 1.5], [7, 1.5], [6.5, 0]],
  };
  const VIEW = {
    portrait: { x: -3.8, y: -3.8, w: 7.6, h: 11.8 },
    landscape: { x: -3.8, y: -3.8, w: 13, h: 7.6 },
  };
  const LAYOUTS = Object.keys(HOMES);
  const home = (layout, i) => ({ r: 0, f: 0, p: [HOMES[layout][i][0], 0, HOMES[layout][i][1], 0] });

  /* ---------------- Ván chơi ---------------- */
  function newGame(id, layout) {
    const pz = byId(id) || PUZZLES[0];
    const lay = HOMES[layout] ? layout : 'portrait';
    return { id: pz.id, pieces: TYPES.map((t, i) => home(lay, i)), locked: TYPES.map(() => false), moves: 0, hints: 0 };
  }
  const puzzleOf = (g) => byId(g.id);
  const polyOf = (g, i) => placed(TYPES[i], g.pieces[i]);
  const polys = (g) => TYPES.map((t, i) => polyOf(g, i));
  const isWon = (g) => covers(polys(g), puzzleOf(g).target);

  function centroid(poly) {
    let x = 0;
    let y = 0;
    poly.forEach((p) => {
      x += fx(p);
      y += fy(p);
    });
    return [x / poly.length, y / poly.length];
  }

  /**
   * Vị trí neo chính xác gần (rx, ry) nhất cho mảnh i ở góc xoay r, lật f:
   * ưu tiên khớp một đỉnh của mảnh vào đỉnh hình mục tiêu / mảnh khác trong bán kính SNAP_R,
   * nếu không có thì đưa một đỉnh của mảnh vào điểm lưới nửa đơn vị gần nhất.
   */
  function snap(g, i, r, f, rx, ry) {
    const sh = shape(TYPES[i], r, f);
    const pts = puzzleOf(g).verts.slice();
    g.pieces.forEach((pc, j) => { if (j !== i) placed(TYPES[j], pc).forEach((v) => pts.push(v)); });
    let best = null;
    let bestD = SNAP_R;
    sh.forEach((v) => pts.forEach((q) => {
      const p = psub(q, v);
      const d = Math.hypot(fx(p) - rx, fy(p) - ry);
      if (d < bestD - 1e-9) {
        bestD = d;
        best = p;
      }
    }));
    if (best) return best;
    bestD = Infinity;
    sh.forEach((v) => {
      const gx = Math.round((rx + fx(v)) * 2) / 2;
      const gy = Math.round((ry + fy(v)) * 2) / 2;
      const p = [gx - v[0], -v[1], gy - v[2], -v[3]].map((n) => n || 0);
      const d = Math.hypot(fx(p) - rx, fy(p) - ry);
      if (d < bestD - 1e-9) {
        bestD = d;
        best = p;
      }
    });
    return best;
  }

  /** Giữ tâm mảnh trong khung nhìn (để không kéo mất mảnh ra ngoài). */
  function clampRaw(t, r, f, rx, ry, layout) {
    const v = VIEW[HOMES[layout] ? layout : 'portrait'];
    const c = centroid(shape(t, r, f));
    const cx = Math.min(v.x + v.w - 0.3, Math.max(v.x + 0.3, rx + c[0]));
    const cy = Math.min(v.y + v.h - 0.3, Math.max(v.y + 0.3, ry + c[1]));
    return [cx - c[0], cy - c[1]];
  }

  function withPiece(g, i, pc) {
    const same = pc.r === g.pieces[i].r && pc.f === g.pieces[i].f && peq(pc.p, g.pieces[i].p);
    if (same) return g;
    const pieces = g.pieces.slice();
    pieces[i] = pc;
    return Object.assign({}, g, { pieces, moves: g.moves + 1 });
  }
  const canMove = (g, i) => Number.isInteger(i) && i >= 0 && i < TYPES.length && !g.locked[i];

  /** Thả mảnh i với điểm neo thô (rx, ry) -> hít vào vị trí chính xác. Mảnh bị khóa (gợi ý) thì không đổi. */
  function drop(g, i, rx, ry, layout) {
    if (!canMove(g, i)) return g;
    const pc = g.pieces[i];
    const [x, y] = clampRaw(TYPES[i], pc.r, pc.f, rx, ry, layout);
    return withPiece(g, i, { r: pc.r, f: pc.f, p: snap(g, i, pc.r, pc.f, x, y) });
  }

  /** Đổi hướng mảnh quanh tâm của nó rồi hít lại. */
  function turn(g, i, r, f, layout) {
    const c = centroid(polyOf(g, i));
    const c2 = centroid(shape(TYPES[i], r, f));
    const [x, y] = clampRaw(TYPES[i], r, f, c[0] - c2[0], c[1] - c2[1], layout);
    return withPiece(g, i, { r, f, p: snap(g, i, r, f, x, y) });
  }
  /** Xoay 45° (dir = 1 chiều kim đồng hồ, -1 ngược lại). */
  function rotate(g, i, dir, layout) {
    if (!canMove(g, i)) return g;
    return turn(g, i, (g.pieces[i].r + (dir < 0 ? 7 : 1)) % 8, g.pieces[i].f, layout);
  }
  /** Lật hình bình hành (mảnh khác lật thì chỉ là xoay nên không cần). */
  function flip(g, i, layout) {
    if (!canMove(g, i) || TYPES[i] !== 'P') return g;
    return turn(g, i, g.pieces[i].r, 1 - g.pieces[i].f, layout);
  }

  /** Với mỗi ô lời giải: chỉ số mảnh cùng loại đang nằm đúng chỗ đó (-1 nếu chưa có). */
  function filledSlots(g) {
    const ps = polys(g);
    const used = TYPES.map(() => false);
    return puzzleOf(g).slots.map((sl) => {
      const k = TYPES.findIndex((t, i) => !used[i] && t === sl.t && samePoly(ps[i], sl.poly));
      if (k >= 0) used[k] = true;
      return k;
    });
  }

  /**
   * Gợi ý: đặt đúng một mảnh còn thiếu theo lời giải và khóa lại; mảnh khác đang chồng lên chỗ đó thì về khay.
   * Trả về { game, piece } hoặc null nếu không còn gì để gợi ý.
   */
  function hint(g, layout) {
    const pz = puzzleOf(g);
    const filled = filledSlots(g);
    const j = filled.findIndex((k) => k < 0);
    if (j < 0) return null;
    const sl = pz.slots[j];
    const i = TYPES.findIndex((t, k) => t === sl.t && filled.indexOf(k) < 0 && !g.locked[k]);
    if (i < 0) return null;
    const lay = HOMES[layout] ? layout : 'portrait';
    const pieces = g.pieces.slice();
    pieces[i] = { r: sl.r, f: sl.f, p: sl.p.slice() };
    TYPES.forEach((t, k) => {
      if (k === i || g.locked[k]) return;
      if (!isZero(overlap(placed(t, pieces[k]), sl.poly))) pieces[k] = home(lay, k);
    });
    const locked = g.locked.slice();
    locked[i] = true;
    return { game: Object.assign({}, g, { pieces, locked, moves: g.moves + 1, hints: g.hints + 1 }), piece: i };
  }

  /** Đưa mọi mảnh chưa khóa về khay. */
  function reset(g, layout) {
    const lay = HOMES[layout] ? layout : 'portrait';
    let changed = false;
    const pieces = g.pieces.map((pc, i) => {
      if (g.locked[i]) return pc;
      const h = home(lay, i);
      if (h.r !== pc.r || h.f !== pc.f || !peq(h.p, pc.p)) changed = true;
      return h;
    });
    return changed ? Object.assign({}, g, { pieces, moves: g.moves + 1 }) : g;
  }

  /** Đổi bố cục (xoay máy): mảnh nằm ngoài ô hình mục tiêu về chỗ trong khay mới; không tính là nước đi. */
  function relayout(g, layout) {
    const lay = HOMES[layout] ? layout : 'portrait';
    const pieces = g.pieces.map((pc, i) => {
      const c = centroid(placed(TYPES[i], pc));
      return Math.abs(c[0]) <= BOX && Math.abs(c[1]) <= BOX ? pc : home(lay, i);
    });
    return Object.assign({}, g, { pieces });
  }

  /** Số mảnh đang nằm đúng ô lời giải (để báo tiến độ trên thẻ game). */
  const correctCount = (g) => filledSlots(g).filter((k) => k >= 0).length;

  /* ---------------- Lưu / khôi phục ---------------- */
  const toJSON = (g) => ({
    v: VERSION,
    id: g.id,
    pieces: g.pieces.map((pc) => [pc.r, pc.f].concat(pc.p)),
    locked: g.locked.slice(),
    moves: g.moves,
    hints: g.hints,
  });

  const dyadic = (n) => Number.isFinite(n) && Math.abs(n) < 64 && Number.isInteger(n * 4096);
  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION || !byId(raw.id)) return null;
    const { pieces, locked, moves, hints } = raw;
    if (!Array.isArray(pieces) || pieces.length !== TYPES.length) return null;
    if (!Array.isArray(locked) || locked.length !== TYPES.length || locked.some((b) => typeof b !== 'boolean')) return null;
    if (!Number.isInteger(moves) || moves < 0 || !Number.isInteger(hints) || hints < 0) return null;
    const out = [];
    for (let i = 0; i < TYPES.length; i++) {
      const a = pieces[i];
      if (!Array.isArray(a) || a.length !== 6) return null;
      const [r, f] = a;
      if (!Number.isInteger(r) || r < 0 || r > 7 || (f !== 0 && f !== 1) || (f === 1 && TYPES[i] !== 'P')) return null;
      const p = a.slice(2);
      if (!p.every(dyadic)) return null;
      out.push({ r, f, p });
    }
    return { id: raw.id, pieces: out, locked: locked.slice(), moves, hints };
  }

  /* ---------------- Vẽ: tọa độ thực ---------------- */
  const toFloat = (poly) => poly.map((p) => [fx(p), fy(p)]);

  const api = {
    VERSION, AREA, BOX, TYPES, PIECE_AREA, PUZZLES, HOMES, VIEW, LAYOUTS,
    byId, newGame, polyOf, polys, isWon, drop, rotate, flip, hint, reset, relayout, correctCount, filledSlots,
    toJSON, fromJSON, toFloat, centroid,
    // phần hình học (dùng trong test)
    geo: { sign, rot45, shape, placed, area, clip, overlap, covers, samePoly, parseNum, parseToken, buildPuzzle, placementOf, snap, fx, fy, peq, isZero },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
