/* Kiểm tra engine Tháp Hà Nội: chạy `node test.js`
 * - Ván mới: cả chồng đĩa ở cọc trái, số nước tối thiểu 2^n − 1
 * - Luật: mỗi lần một đĩa (đĩa trên cùng), không đặt đĩa lớn lên đĩa nhỏ, không bốc từ cọc trống
 * - Thắng khi cả chồng sang cọc phải; giải được từ mọi trạng thái hợp lệ (solver trong engine)
 * - Lưu / khôi phục ván từ JSON và từ chối dữ liệu hỏng
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
    console.log('  FAIL ' + name + '\n       ' + e.message);
  }
}

function eq(a, b, msg) {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error((msg ? msg + ': ' : '') + x + ' !== ' + y);
}

/** Chơi lần lượt các nước [from, to]; nước nào sai luật thì báo lỗi. */
function play(g, moves) {
  return moves.reduce((s, [from, to]) => {
    const next = E.move(s, from, to);
    if (!next) throw new Error('nước sai luật ' + from + '→' + to);
    return next;
  }, g);
}

/** PRNG nhỏ để đi bừa có lặp lại được (chỉ dùng trong test). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('ván mới: cả chồng ở cọc trái, lớn dưới nhỏ trên, chưa đi nước nào', () => {
  const g = E.newGame(4);
  eq(g.pegs, [[4, 3, 2, 1], [], []]);
  eq([g.n, g.moves, E.isWon(g)], [4, 0, false]);
});

test('số nước tối thiểu là 2^n − 1', () => {
  eq([4, 5, 6, 7].map(E.minMoves), [15, 31, 63, 127]);
});

test('chỉ nhận số đĩa trong danh sách mode', () => {
  eq(E.DISKS, [4, 5, 6, 7]);
  [0, 3, 8, 4.5, '5', null].forEach((n) => {
    let threw = false;
    try {
      E.newGame(n);
    } catch (e) {
      threw = true;
    }
    eq(threw, true, String(n));
  });
});

test('đi một nước: đĩa trên cùng sang cọc trống, đếm nước, không đổi ván cũ', () => {
  const g = E.newGame(4);
  const h = E.move(g, 0, 2);
  eq(h.pegs, [[4, 3, 2], [], [1]]);
  eq(h.moves, 1);
  eq(g.pegs, [[4, 3, 2, 1], [], []], 'ván cũ giữ nguyên');
  eq(E.top(h, 0), 2);
  eq(E.top(h, 1), 0);
});

test('không đặt đĩa lớn lên đĩa nhỏ', () => {
  const g = E.move(E.newGame(4), 0, 1); // đĩa 1 sang giữa
  eq(E.canMove(g, 0, 1), false);
  eq(E.move(g, 0, 1), null);
  eq(E.canMove(g, 1, 0), true, 'nhỏ lên lớn thì được');
});

test('không bốc từ cọc trống, không đặt lại chính cọc đó, cọc ngoài 0..2 thì sai', () => {
  const g = E.newGame(5);
  eq(E.canMove(g, 1, 2), false);
  eq(E.canMove(g, 0, 0), false);
  eq(E.canMove(g, 0, 3), false);
  eq(E.canMove(g, -1, 0), false);
  eq(E.canMove(g, '0', 1), false);
  eq(E.move(g, 2, 0), null);
});

test('lời giải tối ưu thắng đúng 2^n − 1 nước cho mọi mode', () => {
  E.DISKS.forEach((n) => {
    const g0 = E.newGame(n);
    const sol = E.solve(g0);
    eq(sol.length, E.minMoves(n), 'n=' + n);
    const g = play(g0, sol);
    eq(E.isWon(g), true, 'n=' + n);
    eq(g.pegs, [[], [], g0.pegs[0]]);
    eq(g.moves, E.minMoves(n));
  });
});

test('chồng ở cọc giữa chưa tính là thắng', () => {
  let g = E.newGame(4);
  g = play(g, E.solve(g, 1)); // đưa cả chồng sang cọc giữa
  eq(g.pegs[1], [4, 3, 2, 1]);
  eq(E.isWon(g), false);
});

test('giải được từ mọi trạng thái đi bừa (500 ván, mỗi ván tới 200 nước), không dài hơn 2^n − 1', () => {
  const r = rng(42);
  for (let i = 0; i < 500; i++) {
    const n = E.DISKS[i % E.DISKS.length];
    let g = E.newGame(n);
    const steps = Math.floor(r() * 200);
    for (let k = 0; k < steps && !E.isWon(g); k++) {
      const legal = [];
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (E.canMove(g, a, b)) legal.push([a, b]);
      const [a, b] = legal[Math.floor(r() * legal.length)];
      g = E.move(g, a, b);
    }
    const sol = E.solve(g);
    eq(E.isWon(play(g, sol)), true, 'ván ' + i);
    if (sol.length > E.minMoves(n)) throw new Error('lời giải dài hơn 2^n − 1: ' + sol.length);
  }
});

test('ván đã thắng không nhận thêm nước', () => {
  const g0 = E.newGame(4);
  const g = play(g0, E.solve(g0));
  eq(E.canMove(g, 2, 0), false);
  eq(E.move(g, 2, 0), null);
  eq(E.solve(g), []);
});

test('lưu rồi khôi phục giữ nguyên ván', () => {
  const g = play(E.newGame(6), [[0, 1], [0, 2], [1, 2]]);
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(back, g);
  eq(E.move(back, 0, 1).pegs, E.move(g, 0, 1).pegs);
});

test('từ chối dữ liệu hỏng', () => {
  const ok = E.toJSON(E.newGame(4));
  const bad = [
    null,
    1,
    'x',
    {},
    Object.assign({}, ok, { v: 2 }),
    Object.assign({}, ok, { n: 3, pegs: [[3, 2, 1], [], []] }), // số đĩa không có trong mode
    Object.assign({}, ok, { n: '4' }),
    Object.assign({}, ok, { moves: -1 }),
    Object.assign({}, ok, { moves: 1.5 }),
    Object.assign({}, ok, { pegs: [[4, 3, 2, 1], []] }), // thiếu cọc
    Object.assign({}, ok, { pegs: [[4, 3, 2, 1], [], [], []] }), // thừa cọc
    Object.assign({}, ok, { pegs: [[4, 3, 1, 2], [], []] }), // lớn trên nhỏ
    Object.assign({}, ok, { pegs: [[4, 3, 2], [], []] }), // mất một đĩa
    Object.assign({}, ok, { pegs: [[4, 3, 2, 1], [1], []] }), // trùng đĩa
    Object.assign({}, ok, { pegs: [[4, 3, 2, 5], [], []] }), // đĩa lạ
    Object.assign({}, ok, { pegs: [[4, 3, 2, '1'], [], []] }),
    Object.assign({}, ok, { pegs: 'abc' }),
    Object.assign({}, ok, { pegs: [[4, 3, 2], [1], []], moves: 0 }), // đĩa đã rời cọc trái mà chưa đi nước nào
  ];
  bad.forEach((raw) => eq(E.fromJSON(raw), null, JSON.stringify(raw)));
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
