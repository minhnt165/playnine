/* Kiểm tra engine Nối Hình: chạy `node test.js`
 * - Sinh màn: số ô chia hết cho 3, mỗi hình đúng bội của 3, luôn giải được theo lời giải sinh kèm
 * - Che / mở: ô lớp trên chồng lên thì ô dưới bị che, chồng bên chỉ lộ ô trên cùng
 * - Khay: chèn cạnh ô cùng hình, đủ 3 thì ăn, đầy 7 thì thua, dọn sạch thì thắng
 * - Trợ giúp: hoàn tác, lấy ra, thêm ô khay, xáo trộn
 * - Lưu / khôi phục ván từ JSON và từ chối dữ liệu hỏng
 */
const N = require('./engine.js');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (e) {
    failed++;
    failures.push(name);
    console.log('  FAIL ' + name + '\n       ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert thất bại');
}

function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'khác nhau') + `: nhận ${JSON.stringify(a)}, mong đợi ${JSON.stringify(b)}`);
}

/** Ván tự dựng: tiles là [x, y, z, type]. */
function gameOf(list) {
  const tiles = list.map((a, id) => ({ id, x: a[0], y: a[1], z: a[2], type: a[3], at: 'board' }));
  return {
    level: 1,
    tiles,
    tray: [],
    hold: [],
    cap: N.TRAY_SIZE,
    boosters: Object.assign({}, N.BOOSTERS),
    history: [],
    status: 'playing',
  };
}

/** Ô rời nhau trên một hàng, hình theo danh sách. */
const row = (types) => gameOf(types.map((t, i) => [i * 8, 0, 0, t]));

console.log('Nối Hình - kiểm tra engine');

/* ---------------- Sinh màn ---------------- */

test('sinh màn ở cấp 1–30: số ô chia hết cho 3, mỗi hình xuất hiện bội của 3 lần', () => {
  const rng = N.seededRandom(5);
  for (let lv = 1; lv <= 30; lv++) {
    const { tiles } = N.generateLevel(lv, rng);
    eq(tiles.length % 3, 0, 'cấp ' + lv);
    const count = {};
    tiles.forEach((t) => {
      count[t.type] = (count[t.type] || 0) + 1;
    });
    Object.values(count).forEach((n) => eq(n % 3, 0, 'cấp ' + lv + ' hình lẻ bộ'));
  }
});

test('cấp 1 là bàn 3x3 với 3 loại hình, không có ô bị che', () => {
  const g = N.createGame(1, N.seededRandom(1));
  eq(g.tiles.length, 9);
  eq(N.freeIds(g).length, 9);
});

test('cấp độ càng cao càng nhiều ô, từ cấp 3 có chồng bên', () => {
  const rng = N.seededRandom(9);
  const size = (lv) => N.generateLevel(lv, rng).tiles.length;
  assert(size(2) > size(1));
  assert(size(8) > size(3));
  assert(N.generateLevel(3, rng).tiles.some((t) => t.pile === 'L'));
  eq(N.generateLevel(2, rng).tiles.some((t) => t.pile), false);
});

test('đi theo lời giải sinh kèm thì luôn thắng, khay không bao giờ đầy', () => {
  for (let lv = 1; lv <= 25; lv++) {
    for (let seed = 1; seed <= 8; seed++) {
      const rng = N.seededRandom(lv * 100 + seed);
      const { tiles, solution } = N.generateLevel(lv, rng);
      const g = gameOf([]);
      g.tiles = tiles.map((t) => Object.assign({}, t, { at: 'board' }));
      for (const id of solution) {
        assert(N.pick(g, id), `cấp ${lv}: ô ${id} phải chạm được`);
        assert(g.status !== 'lost', `cấp ${lv}: khay đầy`);
      }
      eq(g.status, 'won', 'cấp ' + lv);
    }
  }
});

test('cùng seed thì cùng màn', () => {
  const a = N.generateLevel(7, N.seededRandom(3)).tiles.map((t) => [t.x, t.y, t.z, t.type].join()).join('|');
  const b = N.generateLevel(7, N.seededRandom(3)).tiles.map((t) => [t.x, t.y, t.z, t.type].join()).join('|');
  eq(a, b);
});

/* ---------------- Che / mở ---------------- */

test('ô lớp trên chồng lệch nửa ô thì che ô dưới; lệch đủ một ô thì không', () => {
  const g = gameOf([[0, 0, 0, 0], [4, 4, 1, 1], [16, 0, 0, 2], [24, 0, 1, 2]]);
  eq(N.isFree(g, 0), false, 'bị che');
  eq(N.isFree(g, 1), true);
  eq(N.isFree(g, 2), true, 'cách 8 đơn vị: không che');
  eq(N.isFree(g, 3), true);
});

test('ô lớp cao hơn đi rồi thì ô dưới lộ ra', () => {
  const g = gameOf([[0, 0, 0, 0], [4, 4, 1, 1]]);
  N.pick(g, 1);
  eq(N.isFree(g, 0), true);
});

test('chồng bên: chỉ ô trên cùng chạm được', () => {
  const g = gameOf([[0, 0, 0, 0], [1, 0, 1, 1], [2, 0, 2, 2]]);
  eq(N.freeIds(g).join(), '2');
  eq(N.pick(g, 0), null, 'ô dưới chồng không chạm được');
});

/* ---------------- Khay ---------------- */

test('ô xuống khay được chèn cạnh ô cùng hình', () => {
  const g = row([0, 1, 0]);
  N.pick(g, 0);
  N.pick(g, 1);
  N.pick(g, 2);
  eq(g.tray.join(), '0,2,1');
});

test('đủ 3 ô cùng hình thì ăn, hoàn tác không gọi lại được ô đã ăn', () => {
  const g = row([0, 0, 0, 1, 1, 1]);
  N.pick(g, 0);
  N.pick(g, 1);
  const res = N.pick(g, 2);
  eq(res.cleared.length, 3);
  eq(g.tray.length, 0);
  eq(g.tiles[0].at, 'gone');
  eq(N.undo(g), null);
});

test('khay đầy 7 ô mà không có bộ ba thì thua; dọn sạch thì thắng', () => {
  const g = row([0, 1, 2, 3, 4, 5, 6, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  for (let i = 0; i < 6; i++) N.pick(g, i);
  eq(g.status, 'playing');
  N.pick(g, 6);
  eq(g.status, 'lost');
  eq(N.pick(g, 7), null, 'thua rồi thì không chạm được');

  const w = row([0, 0, 0]);
  N.pick(w, 0);
  N.pick(w, 1);
  N.pick(w, 2);
  eq(w.status, 'won');
});

test('ô thứ 7 ăn được bộ ba thì không thua', () => {
  // Khay: 0 1 2 3 4 5 + 0 = 7 ô thì thua; nhưng 0 1 2 3 4 + 0 + 0 thì ô thứ 7 ăn bộ ba
  const g = row([0, 1, 2, 3, 4, 5, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  for (let i = 0; i < 5; i++) N.pick(g, i);
  N.pick(g, 6);
  eq(g.tray.length, 6);
  N.pick(g, 7);
  eq(g.status, 'playing');
  eq(g.tray.length, 4);
});

/* ---------------- Trợ giúp ---------------- */

test('hoàn tác đưa ô về bàn và trừ lượt', () => {
  const g = row([0, 1, 0, 1, 0, 1]);
  N.pick(g, 0);
  N.pick(g, 1);
  eq(N.undo(g), 1);
  eq(g.tiles[1].at, 'board');
  eq(g.tray.join(), '0');
  eq(g.boosters.undo, N.BOOSTERS.undo - 1);
});

test('lấy ra: 3 ô đầu khay ra hàng chờ, chạm lại được, cứu ván vừa thua', () => {
  const g = row([0, 1, 2, 3, 4, 5, 6, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  for (let i = 0; i < 7; i++) N.pick(g, i);
  eq(g.status, 'lost');
  const out = N.moveOut(g);
  eq(out.length, 3);
  eq(g.status, 'playing');
  eq(g.tray.length, 4);
  eq(g.hold.length, 3);
  assert(N.isFree(g, out[0]), 'ô hàng chờ chạm được');
  eq(N.moveOut(g), null, 'hết lượt');
  N.pick(g, out[0]);
  eq(g.hold.length, 2);
  eq(N.undo(g), out[0]);
  eq(g.tiles[out[0]].at, 'hold', 'hoàn tác về hàng chờ');
});

test('thêm ô khay: sức chứa 8, cứu ván vừa thua, chỉ một lần', () => {
  const g = row([0, 1, 2, 3, 4, 5, 6, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  for (let i = 0; i < 7; i++) N.pick(g, i);
  assert(N.addSlot(g));
  eq(g.cap, 8);
  eq(g.status, 'playing');
  eq(N.addSlot(g), false);
});

test('xáo trộn giữ vị trí và số hình mỗi loại trên bàn', () => {
  const g = N.createGame(6, N.seededRandom(4));
  const before = g.tiles.map((t) => t.type).sort().join();
  const pos = g.tiles.map((t) => [t.x, t.y, t.z].join()).join('|');
  assert(N.shuffle(g, N.seededRandom(8)));
  eq(g.tiles.map((t) => t.type).sort().join(), before);
  eq(g.tiles.map((t) => [t.x, t.y, t.z].join()).join('|'), pos);
  eq(N.shuffle(g), false, 'hết lượt');
});

/* ---------------- Lưu / khôi phục ---------------- */

test('khôi phục ván từ JSON giữ nguyên trạng thái', () => {
  const g = N.createGame(5, N.seededRandom(2));
  N.pick(g, N.freeIds(g)[0]);
  const back = N.fromJSON(JSON.parse(JSON.stringify(N.toJSON(g))));
  assert(back);
  eq(back.tray.join(), g.tray.join());
  eq(back.tiles.map((t) => t.type + t.at).join(), g.tiles.map((t) => t.type + t.at).join());
  eq(back.level, 5);
});

test('từ chối JSON hỏng', () => {
  const g = N.createGame(3, N.seededRandom(2));
  const good = N.toJSON(g);
  eq(N.fromJSON(null), null);
  eq(N.fromJSON({ tiles: [] }), null);
  eq(N.fromJSON(Object.assign({}, good, { tray: [0] })), null, 'ô trong khay không khớp');
  const bad = JSON.parse(JSON.stringify(good));
  bad.tiles[0][4] = 'nowhere';
  eq(N.fromJSON(bad), null);
  const done = JSON.parse(JSON.stringify(good));
  done.tiles.forEach((t) => {
    t[4] = 'gone';
  });
  eq(N.fromJSON(done), null, 'ván đã xong');
});

console.log(`\n${passed} ok, ${failed} lỗi`);
if (failed) {
  console.log('Lỗi: ' + failures.join(' | '));
  process.exit(1);
}
