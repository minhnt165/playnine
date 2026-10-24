/* Kiểm tra engine Bắn Tàu: chạy `node test.js`
 * - Xếp tàu: trong bàn, không chồng, không chạm nhau kể cả chéo; xếp ngẫu nhiên luôn hợp lệ và tất định theo seed
 * - Bắn: trượt / trúng / chìm, đánh dấu ô chắc chắn trống (chéo ô trúng, quanh tàu chìm), lượt xen kẽ, thắng / thua
 * - Máy: chỉ thấy những gì người chơi thấy, luôn bắn ô hợp lệ, mức mạnh dần (số phát trung bình, đấu đối kháng)
 * - Lưu / khôi phục và từ chối dữ liệu hỏng
 */
const E = require('./engine.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e));
  }
}

function eq(a, b, msg) {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error((msg ? msg + ': ' : '') + x + ' !== ' + y);
}
function ok(v, msg) {
  if (!v) throw new Error(msg || 'expected truthy');
}

const ship = (r, c, len, v) => ({ r, c, len, v: !!v });
/** Đội tàu cố định: tàu k nằm ngang ở hàng 2k, từ cột 0 (dài 5, 4, 3, 3, 2). */
const ROWS = () => E.FLEET.map((len, k) => ship(2 * k, 0, len, false));
/** Đội tàu cố định khác: tàu dọc ở cột 2k, từ hàng 0. */
const COLS = () => E.FLEET.map((len, k) => ship(0, 2 * k, len, true));
const I = (r, c) => E.idx(r, c);
const cellsOf = (fleet) => [].concat(...fleet.map(E.shipCells));
const waterOf = (fleet) => {
  const s = new Set(cellsOf(fleet));
  const out = [];
  for (let i = 0; i < 100; i++) if (!s.has(i)) out.push(i);
  return out;
};

/** Bắn lần lượt: mỗi phát của người chơi xen một phát của máy (theo danh sách cho trước). */
function play(g, humanShots, aiCells) {
  let k = 0;
  for (const i of humanShots) {
    if (g.winner != null) break;
    const r = E.fire(g, i);
    if (!r) throw new Error('phát bắn bị từ chối ở ô ' + i);
    g = r.game;
    if (g.winner != null) break;
    const a = E.fire(g, aiCells[k++]);
    if (!a) throw new Error('phát của máy bị từ chối ở ô ' + aiCells[k - 1]);
    g = a.game;
  }
  return g;
}

/* ======================= Xếp tàu ======================= */

test('đội tàu chuẩn 5-4-3-3-2 trên lưới 10×10', () => {
  eq([E.N, E.FLEET], [10, [5, 4, 3, 3, 2]]);
  eq(E.FLEET.reduce((a, b) => a + b, 0), 17);
});

test('ô của tàu theo hướng ngang / dọc', () => {
  eq(E.shipCells(ship(1, 2, 3, false)), [12, 13, 14]);
  eq(E.shipCells(ship(1, 2, 3, true)), [12, 22, 32]);
});

test('canPlace: trong bàn, không chồng, không chạm cạnh, không chạm chéo', () => {
  const ships = [ship(0, 0, 5, false), null, null, null, null];
  ok(E.canPlace(ships, 1, ship(2, 0, 4, false)), 'cách một hàng thì được');
  ok(!E.canPlace(ships, 1, ship(1, 0, 4, false)), 'chạm cạnh');
  ok(!E.canPlace(ships, 1, ship(1, 5, 4, false)), 'chạm chéo ở góc (0,4)-(1,5)');
  ok(E.canPlace(ships, 1, ship(0, 6, 4, false)), 'cùng hàng, cách một ô');
  ok(!E.canPlace(ships, 1, ship(0, 5, 4, false)), 'cùng hàng, sát đuôi');
  ok(!E.canPlace(ships, 1, ship(0, 3, 4, true)), 'chồng lên');
  ok(!E.canPlace(ships, 1, ship(0, 7, 4, false)), 'tràn ra ngoài bên phải');
  ok(!E.canPlace(ships, 1, ship(7, 9, 4, true)), 'tràn ra ngoài phía dưới');
  ok(E.canPlace(ships, 1, ship(6, 9, 4, true)), 'sát mép dưới');
  ok(!E.canPlace(ships, 1, ship(-1, 0, 4, true)), 'âm');
  ok(!E.canPlace(ships, 1, ship(2, 0, 3, false)), 'sai độ dài của tàu số 1');
  ok(E.canPlace(ships, 0, ship(0, 1, 5, false)), 'dịch chính tàu đó thì bỏ qua vị trí cũ của nó');
});

test('fleetValid nhận đội tàu đúng và từ chối đội thiếu / chạm / sai độ dài', () => {
  ok(E.fleetValid(ROWS()));
  ok(E.fleetValid(COLS()));
  const touch = ROWS();
  touch[1] = ship(1, 5, 4, false); // chạm chéo tàu 0 ở (0,4)
  ok(!E.fleetValid(touch));
  const missing = ROWS();
  missing[4] = null;
  ok(!E.fleetValid(missing));
  ok(!E.fleetValid(ROWS().slice(0, 4)));
  const wrong = ROWS();
  wrong[4] = ship(8, 0, 3, false);
  ok(!E.fleetValid(wrong));
  ok(!E.fleetValid(null));
});

test('xếp ngẫu nhiên: 500 seed đều hợp lệ, tất định theo seed, đủ đa dạng', () => {
  const seen = new Set();
  for (let s = 1; s <= 500; s++) {
    const f = E.randomFleet(E.rng(s));
    ok(E.fleetValid(f), 'seed ' + s);
    seen.add(JSON.stringify(f));
  }
  eq(E.randomFleet(E.rng(42)), E.randomFleet(E.rng(42)));
  ok(seen.size > 490, 'các seed cho cách xếp khác nhau: ' + seen.size);
});

test('xếp ngẫu nhiên phần còn lại giữ nguyên tàu đã đặt', () => {
  const part = [ship(4, 4, 5, true), null, null, ship(0, 0, 3, false), null];
  for (let s = 1; s <= 100; s++) {
    const f = E.randomFleet(E.rng(s), part);
    ok(E.fleetValid(f), 'seed ' + s);
    eq(f[0], part[0]);
    eq(f[3], part[3]);
  }
});

test('placements: mọi vị trí liệt kê ra đều đúng luật', () => {
  const ships = ROWS();
  const list = E.placements(ships, 4);
  ok(list.length > 0);
  for (const p of list) ok(E.canPlace(ships, 4, p));
});

test('PRNG tất định, lưu / nạp trạng thái chạy tiếp đúng dãy', () => {
  const a = E.rng(7);
  const b = E.rng(7);
  for (let i = 0; i < 5; i++) eq(a(), b());
  const st = a.getState();
  const x = [a(), a()];
  const c = E.rng(1);
  c.setState(st);
  eq([c(), c()], x);
  for (let i = 0; i < 1000; i++) {
    const v = a.int(10);
    ok(v >= 0 && v < 10 && Number.isInteger(v));
  }
});

/* ======================= Bắn ======================= */

test('ván mới: người chơi bắn trước, đội tàu máy sinh theo seed', () => {
  const g = E.newGame({ seed: 99, fleet: ROWS() });
  eq([g.turn, g.winner, g.ply], [0, null, 0]);
  ok(E.fleetValid(g.fleets[1]));
  eq(E.newGame({ seed: 99, fleet: ROWS() }), g);
  ok(JSON.stringify(E.newGame({ seed: 98, fleet: ROWS() }).fleets[1]) !== JSON.stringify(g.fleets[1]));
});

test('ván mới từ chối đội tàu sai luật', () => {
  const bad = ROWS();
  bad[1] = ship(1, 0, 4, false);
  eq(E.newGame({ seed: 1, fleet: bad }), null);
});

test('trượt: đánh dấu 1, đổi lượt, không đụng ván cũ', () => {
  const g = E.newGame({ seed: 1, fleet: ROWS() });
  g.fleets[1] = ROWS(); // máy cũng xếp theo hàng để biết trước kết quả
  const r = E.fire(g, I(1, 0));
  eq([r.res, r.ship, r.game.marks[1][I(1, 0)], r.game.turn, r.game.ply], ['miss', -1, 1, 1, 1]);
  eq(g.marks[1][I(1, 0)], 0);
  eq(g.turn, 0);
});

test('trúng: đánh dấu 2, ô chéo thành "chắc chắn trống", vẫn đổi lượt (không bắn tiếp)', () => {
  const g = E.newGame({ seed: 1, fleet: ROWS() });
  g.fleets[1] = ROWS();
  const r = E.fire(g, I(2, 1)); // tàu 4 ô ở hàng 2
  eq([r.res, r.ship, r.game.turn], ['hit', 1, 1]);
  eq(r.game.marks[1][I(2, 1)], 2);
  eq([I(1, 0), I(1, 2), I(3, 0), I(3, 2)].map((i) => r.game.marks[1][i]), [3, 3, 3, 3]);
  eq(r.auto.slice().sort((a, b) => a - b), [I(1, 0), I(1, 2), I(3, 0), I(3, 2)]);
  eq(r.game.marks[1][I(2, 0)], 0, 'ô cạnh vẫn chưa biết');
});

test('chìm: mọi ô quanh tàu thành "chắc chắn trống", báo đúng tàu', () => {
  let g = E.newGame({ seed: 1, fleet: ROWS() });
  g.fleets[1] = ROWS();
  g = play(g, [I(8, 0)], [I(9, 9)]);
  const r = E.fire(g, I(8, 1));
  eq([r.res, r.ship], ['sunk', 4]);
  for (const i of [I(7, 0), I(7, 1), I(7, 2), I(8, 2), I(9, 0), I(9, 1), I(9, 2)]) eq(r.game.marks[1][i], 3, 'ô ' + i);
  ok(E.isSunk(r.game, 1, 4));
  ok(!E.isSunk(r.game, 1, 3));
  eq(E.shipsLeft(r.game, 1), 4);
});

test('từ chối bắn ô đã bắn, ô chắc chắn trống, ô ngoài bàn, sau khi hết ván', () => {
  let g = E.newGame({ seed: 1, fleet: ROWS() });
  g.fleets[1] = ROWS();
  g = play(g, [I(2, 1)], [I(9, 9)]);
  eq(E.fire(g, I(2, 1)), null, 'ô đã bắn');
  eq(E.fire(g, I(1, 0)), null, 'ô chéo đã biết trống');
  eq(E.fire(g, -1), null);
  eq(E.fire(g, 100), null);
  eq(E.fire(g, 1.5), null);
});

test('thắng khi đánh chìm cả đội; ván dừng, không bắn thêm được', () => {
  let g = E.newGame({ seed: 3, fleet: COLS() });
  g.fleets[1] = ROWS();
  g = play(g, cellsOf(ROWS()), waterOf(COLS()));
  eq([g.winner, E.shipsLeft(g, 1), E.shotsBy(g, 0), E.hitsBy(g, 0), E.shotsBy(g, 1)], [0, 0, 17, 17, 16]);
  eq(E.fire(g, I(9, 9)), null);
});

test('thua khi máy đánh chìm hết tàu của mình trước', () => {
  let g = E.newGame({ seed: 3, fleet: ROWS() });
  g.fleets[1] = COLS();
  g = play(g, waterOf(COLS()), cellsOf(ROWS()));
  eq(g.winner, 1);
  eq(E.shipsLeft(g, 0), 0);
});

test('viewOf chỉ lộ dấu bắn và tàu đã chìm, không lộ tàu còn sống', () => {
  let g = E.newGame({ seed: 1, fleet: ROWS() });
  g.fleets[1] = ROWS();
  g = play(g, [I(8, 0), I(8, 1)], [I(9, 9), I(9, 8)]);
  const v = E.viewOf(g, 1);
  eq(Object.keys(v).sort(), ['left', 'marks', 'sunk']);
  eq(v.left, [5, 4, 3, 3]);
  eq(v.sunk, [[I(8, 0), I(8, 1)]]);
  ok(v.marks !== g.marks[1], 'bản sao');
});

/* ======================= Máy ======================= */

/** Một mức bắn vào đội tàu `fleet` tới khi chìm hết; trả số phát. */
function shotsToSink(level, fleet, seed) {
  let g = E.newGame({ seed, fleet });
  g.turn = 1; // chỉ máy bắn vào bàn của người chơi (bàn 0)
  const rand = E.rng(seed * 7919 + 1);
  let n = 0;
  while (g.winner == null) {
    const i = E.chooseShot(E.viewOf(g, 0), level, rand);
    const r = E.fire(g, i);
    if (!r) throw new Error(level + ' bắn ô không hợp lệ ' + i);
    g = r.game;
    g.turn = 1;
    n++;
    if (n > 100) throw new Error('không dừng');
  }
  return n;
}

test('máy mọi mức luôn bắn ô chưa biết và đánh chìm hết đội tàu', () => {
  for (const lv of E.LEVELS) {
    for (let s = 1; s <= 20; s++) {
      const n = shotsToSink(lv, E.randomFleet(E.rng(1000 + s)), s);
      ok(n >= 17 && n <= 100, lv + ': ' + n);
    }
  }
});

test('aiMove tất định theo seed + số phát; không đọc tàu chưa lộ của người chơi', () => {
  let g = E.newGame({ seed: 77, fleet: ROWS() });
  g = E.fire(g, I(9, 9)).game;
  for (const lv of E.LEVELS) {
    const a = E.aiMove(g, lv);
    eq(E.aiMove(g, lv), a);
    ok(a >= 0 && a < 100 && g.marks[0][a] === 0);
    // Đổi đội tàu (chưa bị bắn phát nào) của người chơi không đổi nước của máy
    const g2 = Object.assign({}, g, { fleets: [COLS(), g.fleets[1]] });
    eq(E.aiMove(g2, lv), a, lv);
  }
});

test('Vừa / Khó: có ô trúng chưa chìm thì bắn ô kề theo hàng dọc / ngang', () => {
  for (const lv of ['medium', 'hard']) {
    for (let s = 1; s <= 20; s++) {
      const marks = new Array(100).fill(0);
      marks[I(5, 5)] = 2;
      for (const i of [I(4, 4), I(4, 6), I(6, 4), I(6, 6)]) marks[i] = 3;
      const i = E.chooseShot({ marks, sunk: [], left: E.FLEET.slice() }, lv, E.rng(s));
      ok([I(4, 5), I(6, 5), I(5, 4), I(5, 6)].indexOf(i) >= 0, lv + ' bắn ' + i);
    }
  }
});

test('Vừa / Khó: hai ô trúng thẳng hàng thì bắn nối dài hàng đó', () => {
  for (const lv of ['medium', 'hard']) {
    for (let s = 1; s <= 20; s++) {
      const marks = new Array(100).fill(0);
      marks[I(5, 4)] = 2;
      marks[I(5, 5)] = 2;
      for (const i of [I(4, 3), I(4, 4), I(4, 5), I(4, 6), I(6, 3), I(6, 4), I(6, 5), I(6, 6)]) marks[i] = 3;
      const i = E.chooseShot({ marks, sunk: [], left: E.FLEET.slice() }, lv, E.rng(s));
      ok([I(5, 3), I(5, 6)].indexOf(i) >= 0, lv + ' bắn ' + i);
    }
  }
});

test('Khó: chỉ còn tàu 5 ô thì không bắn vào khe hẹp hơn 5', () => {
  const marks = new Array(100).fill(1);
  // Khe ngang dài 5 ở hàng 0 (cột 0..4) và khe 3 ô ở hàng 9: tàu 5 ô chỉ có thể nằm ở hàng 0
  for (let c = 0; c < 5; c++) marks[I(0, c)] = 0;
  for (let c = 0; c < 3; c++) marks[I(9, c)] = 0;
  for (let s = 1; s <= 10; s++) {
    const i = E.chooseShot({ marks, sunk: [], left: [5] }, 'hard', E.rng(s));
    ok(i >= 0 && i < 5, 'bắn ' + i);
  }
});

/** Đấu đối kháng: hai mức bắn xen kẽ vào đội tàu ngẫu nhiên của nhau, đổi bên đi trước mỗi ván. */
function duel(a, b, games) {
  let winsA = 0;
  for (let s = 1; s <= games; s++) {
    const fa = E.randomFleet(E.rng(5000 + s));
    const fb = E.randomFleet(E.rng(9000 + s));
    const na = shotsToSink(a, fb, s);
    const nb = shotsToSink(b, fa, s + 333);
    // Bên đi trước thắng khi cần số phát ≤ bên kia; bên đi sau phải cần ít hơn hẳn
    const aFirst = s % 2 === 1;
    if (aFirst ? na <= nb : na < nb) winsA++;
  }
  return winsA / games;
}

test('mức mạnh dần: số phát trung bình để đánh chìm cả đội Dễ > Vừa > Khó', () => {
  const avg = {};
  for (const lv of E.LEVELS) {
    let sum = 0;
    const n = 150;
    for (let s = 1; s <= n; s++) sum += shotsToSink(lv, E.randomFleet(E.rng(20000 + s)), s);
    avg[lv] = sum / n;
  }
  console.log('       số phát trung bình: Dễ ' + avg.easy.toFixed(1) + ', Vừa ' + avg.medium.toFixed(1) + ', Khó ' + avg.hard.toFixed(1));
  ok(avg.easy > avg.medium + 15, 'Dễ phải kém Vừa rõ rệt');
  ok(avg.medium > avg.hard + 4, 'Vừa phải kém Khó');
});

test('mức mạnh dần: đấu đối kháng Vừa vs Dễ, Khó vs Dễ, Khó vs Vừa', () => {
  const me = duel('medium', 'easy', 150);
  const he = duel('hard', 'easy', 150);
  const hm = duel('hard', 'medium', 150);
  console.log('       tỉ lệ thắng: Vừa vs Dễ ' + (me * 100).toFixed(0) + '%, Khó vs Dễ ' + (he * 100).toFixed(0) + '%, Khó vs Vừa ' + (hm * 100).toFixed(0) + '%');
  ok(me > 0.85, 'Vừa thắng Dễ phần lớn');
  ok(he > 0.9, 'Khó thắng Dễ phần lớn');
  ok(hm > 0.55, 'Khó nhỉnh hơn Vừa');
});

/* ======================= Lưu / khôi phục ======================= */

test('lưu rồi khôi phục giữ nguyên ván (kể cả dấu chắc chắn trống)', () => {
  let g = E.newGame({ seed: 1234, fleet: COLS() });
  const aiCells = E.shipCells(g.fleets[1][4]);
  g = E.fire(g, aiCells[0]).game;
  g = E.fire(g, E.aiMove(g, 'hard')).game;
  g = E.fire(g, aiCells[1]).game;
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  ok(E.isSunk(back, 1, 4));
  eq(back.turn, 1);
});

test('ván đã kết thúc vẫn lưu / khôi phục được', () => {
  let g = E.newGame({ seed: 3, fleet: COLS() });
  g.fleets[1] = ROWS();
  g = play(g, cellsOf(ROWS()), waterOf(COLS()));
  eq(E.fromJSON(E.toJSON(g)), g);
});

test('từ chối dữ liệu hỏng', () => {
  const g0 = E.newGame({ seed: 5, fleet: ROWS() });
  const water = waterOf(g0.fleets[1])[0];
  const g = E.fire(g0, water).game; // người chơi bắn trượt một phát, tới lượt máy
  const good = E.toJSON(g);
  ok(E.fromJSON(good) !== null);
  const mut = (fn) => {
    const x = JSON.parse(JSON.stringify(good));
    fn(x);
    return x;
  };
  const setMark = (s, i, ch) => s.slice(0, i) + ch + s.slice(i + 1);
  const bad = [
    null, 1, 'x', {}, [],
    mut((x) => { x.v = 2; }),
    mut((x) => { x.seed = -1; }),
    mut((x) => { x.seed = 1.5; }),
    mut((x) => { x.turn = 2; }),
    mut((x) => { x.turn = 0; }), // người chơi đã bắn một phát, phải tới lượt máy
    mut((x) => { x.winner = 0; }), // chưa ai chìm hết
    mut((x) => { x.fleets = [x.fleets[0]]; }),
    mut((x) => { x.fleets[0][1] = [1, 0, 4, 0]; }), // chạm tàu 0
    mut((x) => { x.fleets[1][0][2] = 4; }), // sai độ dài
    mut((x) => { x.fleets[1][0][3] = 2; }), // hướng sai
    mut((x) => { x.marks[0] = x.marks[0].slice(1); }),
    mut((x) => { x.marks[1] = setMark(x.marks[1], water === 0 ? 1 : 0, '7'); }),
    mut((x) => { x.marks[1] = setMark(x.marks[1], water === 0 ? 1 : 0, '1'); x.ply = 2; }), // thêm một phát: lệch lượt
    mut((x) => { x.marks[0] = setMark(x.marks[0], I(1, 0), '2'); x.turn = 0; x.ply = 2; }), // trúng ở ô nước
    mut((x) => { x.marks[0] = setMark(x.marks[0], I(0, 0), '1'); x.turn = 0; x.ply = 2; }), // trượt ở ô có tàu
    mut((x) => { x.marks[0] = setMark(x.marks[0], I(0, 0), '3'); }), // "chắc chắn trống" ở ô có tàu
    mut((x) => { x.ply = 5; }),
  ];
  bad.forEach((raw, k) => eq(E.fromJSON(raw), null, 'mẫu hỏng #' + k));
  // Hai mẫu đối chứng: sửa đúng cách thì nhận
  ok(E.fromJSON(mut((x) => { x.marks[0] = setMark(x.marks[0], I(1, 0), '1'); x.turn = 0; x.ply = 2; })) !== null, 'đối chứng trượt');
  ok(E.fromJSON(mut((x) => { x.marks[0] = setMark(x.marks[0], I(0, 0), '2'); x.turn = 0; x.ply = 2; })) !== null, 'đối chứng trúng');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
