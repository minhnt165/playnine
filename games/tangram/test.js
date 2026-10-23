/* Kiểm tra engine Tangram: chạy `node test.js`
 * - Số a + b·s chính xác: xoay 45°, diện tích, cắt đa giác (giao hình vuông × hình thoi = 2√2 − 2 đúng tuyệt đối)
 * - Mọi màn: đủ 7 mảnh đúng loại, tổng diện tích đúng 8, không chồng nhau, nằm trong khung, lời giải được chấp nhận
 * - Thắng: chấp nhận lời giải đã lưu và cách xếp khác cùng hình; từ chối khi lệch nửa ô, lệch 1/64, xoay 45°, thiếu mảnh
 * - Hít: thả gần đúng chỗ thì về đúng tọa độ lời giải; thả xa thì một đỉnh rơi vào lưới nửa đơn vị
 * - Xoay / lật, gợi ý (đặt đúng + khóa, đẩy mảnh chồng về khay), đặt lại, đổi bố cục
 * - Lưu / khôi phục và từ chối dữ liệu hỏng
 */
const E = require('./engine.js');

const G = E.geo;
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL ' + name + '\n       ' + e.message);
  }
}

function eq(a, b, msg) {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error((msg ? msg + ': ' : '') + x + ' !== ' + y);
}
function ok(v, msg) {
  if (!v) throw new Error(msg || 'expected true');
}

/** Ván của màn `id` với các mảnh đặt đúng lời giải (mảnh i nhận ô i). */
function solved(id) {
  const g = E.newGame(id, 'portrait');
  const pz = E.byId(id);
  return Object.assign({}, g, { pieces: pz.slots.map((sl) => ({ r: sl.r, f: sl.f, p: sl.p.slice() })) });
}
const withPiece = (g, i, pc) => Object.assign({}, g, { pieces: g.pieces.map((x, k) => (k === i ? pc : x)) });
const shift = (pc, dx, dy) => ({ r: pc.r, f: pc.f, p: [pc.p[0] + dx, pc.p[1], pc.p[2] + dy, pc.p[3]] });
const S = Math.SQRT1_2;

/* ---------------- Số và hình học chính xác ---------------- */

test('dấu của a + b·s đúng tuyệt đối (kể cả khi a, b trái dấu)', () => {
  eq([G.sign(0, 0), G.sign(1, 0), G.sign(0, -1), G.sign(1, -1), G.sign(-1, 2), G.sign(-1.5, 2), G.sign(3, -4), G.sign(-3, 4)], [0, 1, -1, 1, 1, -1, 1, -1]);
});

test('xoay 45° tám lần về đúng chỗ cũ, xoay hai lần là xoay 90° (x, y) -> (-y, x)', () => {
  let p = [1.5, -0.5, 2, 0.25];
  const p0 = p.slice();
  for (let k = 0; k < 8; k++) p = G.rot45(p);
  eq(p, p0);
  eq(G.rot45(G.rot45([1, 0, 2, 0])), [-2, 0, 1, 0]);
});

test('mỗi mảnh ở mọi hướng có đúng diện tích; tổng 7 mảnh = 8', () => {
  let total = 0;
  E.TYPES.forEach((t) => {
    for (let r = 0; r < 8; r++) for (let f = 0; f < 2; f++) eq(G.area(G.shape(t, r, f)), [E.PIECE_AREA[t], 0], t + r + f);
    total += E.PIECE_AREA[t];
  });
  eq(total, E.AREA);
});

test('diện tích giao: chồng nửa ô, chạm cạnh, hình vuông × hình thoi = 2√2 − 2 chính xác', () => {
  const sq = (x, y) => G.placed('Q', { r: 0, f: 0, p: [x, 0, y, 0] });
  eq(G.overlap(sq(0, 0), sq(0.5, 0)), [0.5, 0]);
  eq(G.overlap(sq(0, 0), sq(1, 0)), [0, 0]);
  eq(G.overlap(sq(0, 0), sq(1, 1)), [0, 0]);
  // hình thoi cùng tâm (0.5, 0.5): neo (đỉnh trên) ở (0.5, 0.5 - s)
  const dia = G.placed('Q', { r: 1, f: 0, p: [0.5, 0, 0.5, -1] });
  eq(G.overlap(sq(0, 0), dia), [-2, 4]); // -2 + 4·(√2/2) = 2√2 - 2
  ok(Math.abs(-2 + 4 * S - (2 * Math.SQRT2 - 2)) < 1e-12);
});

test('đọc số "a+bs" và mảnh viết gọn', () => {
  eq(G.parseNum('1.5-0.5s'), [1.5, -0.5]);
  eq(G.parseNum('-s'), [0, -1]);
  eq(G.parseNum('2s'), [0, 2]);
  eq(G.parseNum('3'), [3, 0]);
  eq(G.parseToken('S.br 1 2').poly, [[2, 0, 2, 0], [2, 0, 3, 0], [1, 0, 3, 0]]);
  eq(G.parseToken('*Q 0 1').poly, [[0, 1, 1, 0], [0, 2, 1, 1], [0, 1, 1, 2], [0, 0, 1, 1]]);
});

/* ---------------- Bộ màn ---------------- */

test('có ít nhất 40 màn, id không trùng, đủ 5 thể loại', () => {
  ok(E.PUZZLES.length >= 40, 'chỉ có ' + E.PUZZLES.length);
  eq(new Set(E.PUZZLES.map((p) => p.id)).size, E.PUZZLES.length);
  eq([...new Set(E.PUZZLES.map((p) => p.cat))].sort(), ['animal', 'letter', 'number', 'object', 'people']);
});

E.PUZZLES.forEach((pz) => {
  test('màn ' + pz.id + ': 7 mảnh đúng loại, diện tích đúng 8, không chồng, trong khung, lời giải thắng', () => {
    eq(pz.slots.map((s) => s.t), E.TYPES);
    let a = 0;
    let b = 0;
    pz.target.forEach((poly) => {
      const v = G.area(poly);
      a += v[0];
      b += v[1];
    });
    eq([a, b], [8, 0], 'tổng diện tích');
    for (let i = 0; i < 7; i++) {
      for (let j = i + 1; j < 7; j++) eq(G.overlap(pz.target[i], pz.target[j]), [0, 0], 'chồng ' + i + '-' + j);
    }
    pz.verts.forEach((v) => ok(Math.abs(G.fx(v)) <= E.BOX + 1e-9 && Math.abs(G.fy(v)) <= E.BOX + 1e-9, 'ra ngoài khung'));
    // vị trí lưu trong ô khớp đúng đa giác
    pz.slots.forEach((sl) => ok(G.samePoly(G.placed(sl.t, sl), sl.poly), 'ô ' + sl.t));
    ok(E.isWon(solved(pz.id)), 'lời giải không được chấp nhận');
  });
});

/* ---------------- Kiểm tra thắng ---------------- */

test('ván mới chưa thắng; đủ mảnh đúng chỗ thì thắng (đổi chỗ hai tam giác lớn vẫn thắng)', () => {
  E.PUZZLES.forEach((pz) => {
    ok(!E.isWon(E.newGame(pz.id, 'portrait')), pz.id + ' ván mới');
    const g = solved(pz.id);
    const swapped = Object.assign({}, g, { pieces: [g.pieces[1], g.pieces[0]].concat(g.pieces.slice(2)) });
    ok(E.isWon(swapped), pz.id + ' đổi L');
    const swappedS = Object.assign({}, g, { pieces: g.pieces.slice(0, 3).concat([g.pieces[4], g.pieces[3]], g.pieces.slice(5)) });
    ok(E.isWon(swappedS), pz.id + ' đổi S');
  });
});

test('lệch nhỏ đều bị từ chối: dời nửa ô, dời 1/64, xoay 45°, lật, để một mảnh ngoài khay', () => {
  E.PUZZLES.forEach((pz) => {
    const g = solved(pz.id);
    for (let i = 0; i < 7; i++) {
      const pc = g.pieces[i];
      ok(!E.isWon(withPiece(g, i, shift(pc, 0.5, 0))), pz.id + ' dời x mảnh ' + i);
      ok(!E.isWon(withPiece(g, i, shift(pc, 0, -0.5))), pz.id + ' dời y mảnh ' + i);
      ok(!E.isWon(withPiece(g, i, shift(pc, 1 / 64, 0))), pz.id + ' dời 1/64 mảnh ' + i);
      ok(!E.isWon(withPiece(g, i, { r: (pc.r + 1) % 8, f: pc.f, p: pc.p })), pz.id + ' xoay mảnh ' + i);
      ok(!E.isWon(withPiece(g, i, { r: 0, f: 0, p: [E.HOMES.portrait[i][0], 0, E.HOMES.portrait[i][1], 0] })), pz.id + ' mảnh ' + i + ' trong khay');
    }
    const p = g.pieces[6];
    ok(!E.isWon(withPiece(g, 6, { r: p.r, f: 1 - p.f, p: p.p })), pz.id + ' lật hình bình hành');
  });
});

test('chấp nhận cách xếp khác cho cùng hình (hình chữ nhật 4×2 xếp kiểu khác)', () => {
  const alt = G.buildPuzzle({ id: 'alt', cat: 'object', sol: 'L.tl 0 0, L.br 0 0, S.tl 2 0, P.v2 2 0, M.u 2 1, Q 3 0, S.tr 3 1' });
  const mine = E.byId('rectangle');
  ok(!alt.slots.every((sl, i) => G.samePoly(sl.poly, mine.slots[i].poly)), 'phải là cách xếp khác');
  const g = Object.assign(E.newGame('rectangle', 'portrait'), { pieces: alt.slots.map((sl) => ({ r: sl.r, f: sl.f, p: sl.p })) });
  ok(E.isWon(g));
});

test('mảnh chồng nhau thì không thắng dù tổng diện tích phủ đủ', () => {
  const g = solved('rectangle');
  // đặt hai tam giác nhỏ lên cùng một chỗ
  const bad = withPiece(g, 4, Object.assign({}, g.pieces[3]));
  ok(!E.isWon(bad));
});

/* ---------------- Hít vào lưới / đỉnh ---------------- */

test('thả gần chỗ lời giải thì hít đúng tọa độ chính xác của lời giải (mọi màn, mọi mảnh)', () => {
  E.PUZZLES.forEach((pz) => {
    pz.slots.forEach((sl, i) => {
      let g = E.newGame(pz.id, 'portrait');
      g = withPiece(g, i, { r: sl.r, f: sl.f, p: g.pieces[i].p });
      const x = G.fx(sl.p) + 0.05;
      const y = G.fy(sl.p) - 0.04;
      const g2 = E.drop(g, i, x, y, 'portrait');
      eq(g2.pieces[i].p, sl.p, pz.id + ' mảnh ' + i);
      eq(g2.moves, 1);
    });
  });
});

test('mọi lần thả: một đỉnh rơi vào lưới nửa đơn vị hoặc trùng đỉnh hình mục tiêu / mảnh khác, không xa chỗ thả', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const onGrid = (v) => v[1] === 0 && v[3] === 0 && Number.isInteger(v[0] * 2) && Number.isInteger(v[2] * 2);
  E.PUZZLES.forEach((pz) => {
    let g = E.newGame(pz.id, 'portrait');
    for (let k = 0; k < 12; k++) {
      const i = Math.floor(rnd() * 7);
      g = withPiece(g, i, { r: Math.floor(rnd() * 8), f: i === 6 ? Math.floor(rnd() * 2) : 0, p: g.pieces[i].p });
      const x = rnd() * 6 - 3;
      const y = rnd() * 9 - 3;
      const g2 = E.drop(g, i, x, y, 'portrait');
      const vs = E.polyOf(g2, i);
      const others = pz.verts.concat(...E.polys(g2).filter((p, j) => j !== i));
      ok(vs.some((v) => onGrid(v) || others.some((q) => G.peq(q, v))), pz.id + ' lần ' + k);
      ok(Math.hypot(G.fx(g2.pieces[i].p) - x, G.fy(g2.pieces[i].p) - y) < 0.75, pz.id + ' hít quá xa');
      g = g2;
    }
  });
});

test('thả ra ngoài khung thì mảnh được kéo về trong khung nhìn', () => {
  const g = E.drop(E.newGame('fish', 'portrait'), 0, 50, -40, 'portrait');
  const c = E.centroid(E.polyOf(g, 0));
  const v = E.VIEW.portrait;
  ok(c[0] <= v.x + v.w && c[0] >= v.x && c[1] >= v.y && c[1] <= v.y + v.h, JSON.stringify(c));
});

test('thả đúng chỗ cũ không tính là nước đi', () => {
  const g = E.newGame('fish', 'portrait');
  const p = g.pieces[2].p;
  const g2 = E.drop(g, 2, p[0], p[2], 'portrait');
  ok(g2 === g);
});

/* ---------------- Xoay, lật ---------------- */

test('xoay 8 lần về hướng cũ, tọa độ vẫn chính xác; chỉ hình bình hành lật được', () => {
  let g = E.newGame('cat', 'portrait');
  for (let k = 0; k < 8; k++) {
    g = E.rotate(g, 0, 1, 'portrait');
    ok(g.pieces[0].p.every((n) => Number.isInteger(n * 4096)), 'không chính xác');
  }
  eq(g.pieces[0].r, 0);
  eq(g.moves > 0, true);
  eq(E.rotate(g, 2, -1, 'portrait').pieces[2].r, 7);
  ok(E.flip(g, 0, 'portrait') === g, 'tam giác không lật');
  eq(E.flip(g, 6, 'portrait').pieces[6].f, 1);
});

test('xoay giữ mảnh gần tâm cũ', () => {
  const g = E.newGame('fish', 'portrait');
  const c0 = E.centroid(E.polyOf(g, 0));
  const c1 = E.centroid(E.polyOf(E.rotate(g, 0, 1, 'portrait'), 0));
  ok(Math.hypot(c0[0] - c1[0], c0[1] - c1[1]) < 0.8);
});

/* ---------------- Gợi ý, đặt lại, đổi bố cục ---------------- */

test('gợi ý 7 lần là thắng; mảnh gợi ý bị khóa; hết gì để gợi ý thì trả null', () => {
  E.PUZZLES.forEach((pz) => {
    let g = E.newGame(pz.id, 'landscape');
    for (let k = 0; k < 7; k++) {
      const h = E.hint(g, 'landscape');
      ok(h, pz.id + ' gợi ý ' + k);
      g = h.game;
      ok(g.locked[h.piece]);
      ok(E.drop(g, h.piece, 0, 0, 'landscape') === g, 'mảnh khóa vẫn kéo được');
      ok(E.rotate(g, h.piece, 1, 'landscape') === g, 'mảnh khóa vẫn xoay được');
    }
    ok(E.isWon(g), pz.id + ' chưa thắng');
    eq([g.hints, E.correctCount(g)], [7, 7]);
    eq(E.hint(g, 'landscape'), null);
  });
});

test('gợi ý đẩy mảnh đang chồng lên ô gợi ý về khay', () => {
  const pz = E.byId('fish');
  let g = E.newGame('fish', 'portrait');
  // tam giác vừa (mảnh 2) nằm đè lên ô của tam giác lớn đầu tiên (đặt tâm trùng tâm ô đó)
  const c = E.centroid(pz.slots[0].poly);
  g = withPiece(g, 2, { r: 0, f: 0, p: [Math.round((c[0] - 1) * 4) / 4, 0, Math.round((c[1] - 1 / 3) * 4) / 4, 0] });
  ok(!G.isZero(G.overlap(E.polyOf(g, 2), pz.slots[0].poly)), 'phải chồng');
  const h = E.hint(g, 'portrait');
  eq(h.piece, 0);
  eq(h.game.pieces[2].p, [E.HOMES.portrait[2][0], 0, E.HOMES.portrait[2][1], 0]);
  eq(h.game.moves, 1);
});

test('gợi ý tôn trọng mảnh người chơi đã đặt đúng', () => {
  const pz = E.byId('house');
  let g = E.newGame('house', 'portrait');
  // người chơi đã đặt đúng ô 0 bằng tam giác lớn thứ hai (mảnh 1)
  g = withPiece(g, 1, { r: pz.slots[0].r, f: 0, p: pz.slots[0].p.slice() });
  eq(E.correctCount(g), 1);
  const h = E.hint(g, 'portrait');
  eq(h.piece, 0); // ô kế tiếp còn trống là ô 1 (tam giác lớn), dùng mảnh 0
  ok(G.samePoly(E.polyOf(h.game, 0), pz.slots[1].poly));
  eq(E.correctCount(h.game), 2);
});

test('đặt lại đưa mảnh chưa khóa về khay, mảnh khóa giữ nguyên', () => {
  let g = E.newGame('boat', 'portrait');
  g = E.hint(g, 'portrait').game;
  g = E.drop(g, 3, 0, 0, 'portrait');
  const r = E.reset(g, 'portrait');
  eq(r.pieces[0], g.pieces[0]);
  eq(r.pieces[3].p, [E.HOMES.portrait[3][0], 0, E.HOMES.portrait[3][1], 0]);
  eq(r.moves, g.moves + 1);
  ok(E.reset(r, 'portrait') === r, 'đặt lại lần hai không đổi gì');
});

test('đổi bố cục: mảnh trong khay sang khay mới, mảnh trên hình giữ nguyên, không tính nước', () => {
  let g = E.newGame('boat', 'portrait');
  g = E.drop(g, 5, 0.2, 0.1, 'portrait');
  const r = E.relayout(g, 'landscape');
  eq(r.pieces[5], g.pieces[5]);
  eq(r.pieces[0].p, [E.HOMES.landscape[0][0], 0, E.HOMES.landscape[0][1], 0]);
  eq(r.moves, g.moves);
});

test('khay không đè lên ô hình mục tiêu và nằm trong khung nhìn', () => {
  E.LAYOUTS.forEach((lay) => {
    const g = E.newGame('fish', lay);
    const v = E.VIEW[lay];
    const ps = E.polys(g);
    ps.forEach((poly, i) => {
      E.toFloat(poly).forEach(([x, y]) => {
        ok(x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h, lay + ' mảnh ' + i + ' ra ngoài khung nhìn');
        ok(!(Math.abs(x) < E.BOX && Math.abs(y) < E.BOX), lay + ' mảnh ' + i + ' đè ô mục tiêu');
      });
      for (let j = i + 1; j < 7; j++) eq(G.overlap(poly, ps[j]), [0, 0], lay + ' khay chồng ' + i + '-' + j);
    });
  });
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván (kể cả tọa độ có √2)', () => {
  let g = E.newGame('cat', 'portrait');
  g = E.rotate(g, 0, 1, 'portrait');
  g = E.hint(g, 'portrait').game;
  g = E.flip(g, 6, 'portrait');
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.newGame('fish', 'portrait'));
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  const pieces = (fn) => {
    const p = JSON.parse(JSON.stringify(good.pieces));
    fn(p);
    return bad({ pieces: p });
  };
  [
    null, 1, {}, bad({ v: 2 }), bad({ id: 'khong-co' }), bad({ pieces: good.pieces.slice(1) }), bad({ moves: -1 }), bad({ hints: 1.5 }),
    bad({ locked: [true] }), bad({ locked: [0, 0, 0, 0, 0, 0, 0] }),
    pieces((p) => { p[0][0] = 8; }), pieces((p) => { p[0][1] = 1; }), pieces((p) => { p[6][1] = 2; }),
    pieces((p) => { p[2][2] = 0.1; }), pieces((p) => { p[2][3] = 1e9; }), pieces((p) => { p[3] = [0, 0, 1, 0]; }), pieces((p) => { p[4][5] = 'x'; }),
  ].forEach((raw, k) => eq(E.fromJSON(raw), null, 'mẫu ' + k));
  ok(E.fromJSON(good), 'dữ liệu tốt');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
