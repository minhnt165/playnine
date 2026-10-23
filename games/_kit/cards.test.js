/* Kiểm tra phần thuần của bộ bài dùng chung: chạy `node cards.test.js`
 * - id: đủ 52 lá đi vòng toId -> fromId, nhận chữ thường và 'T', id sai trả null
 * - Bộ bài: 52 lá, 104 lá Nhện 1 / 2 / 4 chất, thứ tự cố định, tham số sai thì báo lỗi
 * - Xáo: là hoán vị, không đụng mảng vào, cùng hạt giống thì cùng kết quả
 * - rng: lưu trạng thái rồi khôi phục thì chạy tiếp đúng dãy số; hạt giống chuỗi
 * - Nhãn, màu, tên lá; chuỗi HTML của lá (chạy được không cần DOM)
 */
const C = require('./cards.js');

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
  if (!v) throw new Error(msg || 'expected truthy');
}
function throws(fn, msg) {
  try {
    fn();
  } catch (e) {
    return;
  }
  throw new Error((msg || 'expected throw') + ' (không ném lỗi)');
}

/** Đếm theo id: { 'AS': 2, ... } */
function tally(cards) {
  const m = {};
  cards.forEach((c) => { const k = C.toId(c); m[k] = (m[k] || 0) + 1; });
  return m;
}
const sortedIds = (cards) => cards.map(C.toId).sort();

// Kết quả xáo 52 lá với rng(42): khóa lại để không ai vô tình đổi thuật toán (vỡ ván lưu / thử thách ngày)
const GOLDEN_42 = ['3C', '9C', '2H', 'KH', 'KC', '9D', '7S', 'JC'];

console.log('Mã lá');
test('toId theo quy ước A, 2..10, J, Q, K + chất', () => {
  eq(C.toId({ rank: 1, suit: 'S' }), 'AS');
  eq(C.toId({ rank: 10, suit: 'H' }), '10H');
  eq(C.toId({ rank: 13, suit: 'D' }), 'KD');
  eq(C.toId({ rank: 11, suit: 'C' }), 'JC');
});
test('52 lá đi vòng toId -> fromId không đổi', () => {
  C.newDeck().forEach((c) => eq(C.fromId(C.toId(c)), c));
});
test('fromId nhận chữ thường, khoảng trắng và T = 10', () => {
  eq(C.fromId('qh'), { rank: 12, suit: 'H' });
  eq(C.fromId(' 10d '), { rank: 10, suit: 'D' });
  eq(C.fromId('TS'), { rank: 10, suit: 'S' });
});
test('fromId sai định dạng trả null', () => {
  ['', '1S', '11H', 'AX', 'A', 'S', 'KDD', null, undefined, 42].forEach((x) => eq(C.fromId(x), null, String(x)));
});
test('isCard', () => {
  ok(C.isCard({ rank: 1, suit: 'C' }));
  ok(!C.isCard({ rank: 0, suit: 'C' }));
  ok(!C.isCard({ rank: 14, suit: 'C' }));
  ok(!C.isCard({ rank: 5, suit: 'X' }));
  ok(!C.isCard(null));
});

console.log('Bộ bài');
test('mặc định 52 lá, mỗi lá đúng một lần', () => {
  const d = C.newDeck();
  eq(d.length, 52);
  const t = tally(d);
  eq(Object.keys(t).length, 52);
  ok(Object.keys(t).every((k) => t[k] === 1));
});
test('thứ tự cố định: chất S H D C, bậc A..K', () => {
  const d = C.newDeck();
  eq(d.slice(0, 3).map(C.toId), ['AS', '2S', '3S']);
  eq(C.toId(d[12]), 'KS');
  eq(C.toId(d[13]), 'AH');
  eq(C.toId(d[51]), 'KC');
});
test('2 bộ: 104 lá, mỗi lá hai lần', () => {
  const d = C.newDeck({ decks: 2 });
  eq(d.length, 104);
  const t = tally(d);
  eq(Object.keys(t).length, 52);
  ok(Object.keys(t).every((k) => t[k] === 2));
});
test('Nhện 1 chất: 104 lá bích, mỗi bậc 8 lá', () => {
  const d = C.newDeck({ decks: 2, suits: ['S'] });
  eq(d.length, 104);
  ok(d.every((c) => c.suit === 'S'));
  const t = tally(d);
  eq(Object.keys(t).length, 13);
  ok(Object.keys(t).every((k) => t[k] === 8));
  eq(C.newDeck({ decks: 2, suits: 1 }), d, 'suits: 1 giống [\'S\']');
});
test('Nhện 2 chất: 104 lá bích + cơ, mỗi lá 4 lần', () => {
  const d = C.newDeck({ decks: 2, suits: ['S', 'H'] });
  eq(d.length, 104);
  const t = tally(d);
  eq(Object.keys(t).length, 26);
  ok(Object.keys(t).every((k) => /[SH]$/.test(k) && t[k] === 4));
  eq(C.newDeck({ decks: 2, suits: 2 }), d, 'suits: 2 giống [\'S\',\'H\']');
});
test('Nhện 4 chất: 104 lá, giống 2 bộ thường', () => {
  const d = C.newDeck({ decks: 2, suits: 4 });
  eq(d.length, 104);
  eq(sortedIds(d), sortedIds(C.newDeck({ decks: 2 })));
});
test('1 bộ, 1 chất: 52 lá (mỗi bậc 4 lá)', () => {
  const d = C.newDeck({ suits: ['H'] });
  eq(d.length, 52);
  ok(Object.values(tally(d)).every((n) => n === 4));
});
test('tham số sai: báo lỗi', () => {
  throws(() => C.newDeck({ decks: 0 }), 'decks 0');
  throws(() => C.newDeck({ decks: 1.5 }), 'decks 1.5');
  throws(() => C.newDeck({ suits: [] }), 'suits rỗng');
  throws(() => C.newDeck({ suits: ['X'] }), 'chất lạ');
  throws(() => C.newDeck({ suits: ['S', 'H', 'D'] }), '3 chất với 1 bộ');
});
test('mỗi lần gọi trả lá mới (sửa không ảnh hưởng lần sau)', () => {
  const a = C.newDeck();
  a[0].rank = 99;
  eq(C.newDeck()[0].rank, 1);
});

console.log('Xáo bài');
test('là hoán vị và không đụng mảng vào', () => {
  const d = C.newDeck({ decks: 2 });
  const before = JSON.stringify(d);
  const s = C.shuffle(d, C.rng(7));
  eq(JSON.stringify(d), before, 'mảng vào giữ nguyên');
  eq(s.length, d.length);
  eq(sortedIds(s), sortedIds(d));
  ok(s.map(C.toId).join() !== d.map(C.toId).join(), 'phải đổi thứ tự');
});
test('cùng hạt giống: cùng kết quả; khác hạt giống: khác', () => {
  const d = C.newDeck();
  eq(C.shuffle(d, C.rng(123)), C.shuffle(d, C.rng(123)));
  eq(C.shuffle(d, C.rng('2026-10-23')), C.shuffle(d, C.rng('2026-10-23')));
  ok(JSON.stringify(C.shuffle(d, C.rng(123))) !== JSON.stringify(C.shuffle(d, C.rng(124))));
});
test('kết quả cố định theo hạt giống (đổi thuật toán là vỡ ván lưu / thử thách ngày)', () => {
  eq(C.shuffle(C.newDeck(), C.rng(42)).slice(0, 8).map(C.toId), GOLDEN_42);
});
test('không truyền rng: dùng Math.random, vẫn là hoán vị', () => {
  const d = C.newDeck();
  eq(sortedIds(C.shuffle(d)), sortedIds(d));
});
test('phân bố đều (vị trí đầu, 13 000 lần xáo 13 lá)', () => {
  const r = C.rng(1);
  const cnt = new Array(13).fill(0);
  const d = C.newDeck({ suits: ['S'] }).slice(0, 13);
  for (let i = 0; i < 13000; i++) cnt[C.shuffle(d, r)[0].rank - 1]++;
  ok(cnt.every((n) => n > 850 && n < 1150), JSON.stringify(cnt));
});

console.log('Số ngẫu nhiên có hạt giống');
test('trong [0, 1) và int(n) trong 0..n-1', () => {
  const r = C.rng(99);
  for (let i = 0; i < 2000; i++) {
    const x = r();
    ok(x >= 0 && x < 1);
    const k = r.int(7);
    ok(Number.isInteger(k) && k >= 0 && k < 7);
  }
});
test('lưu trạng thái rồi khôi phục: chạy tiếp đúng dãy', () => {
  const r = C.rng(2024);
  for (let i = 0; i < 10; i++) r();
  const saved = JSON.parse(JSON.stringify(r.getState())); // đi qua JSON như ván lưu
  const next = [r(), r(), r(), r(), r()];
  const r2 = C.rng(1);
  r2.setState(saved);
  eq([r2(), r2(), r2(), r2(), r2()], next);
  r.setState(saved);
  eq([r(), r(), r(), r(), r()], next, 'khôi phục trên chính nó');
});
test('trạng thái là số nguyên 32 bit không dấu', () => {
  const r = C.rng(-5);
  r();
  const s = r.getState();
  ok(Number.isInteger(s) && s >= 0 && s < 4294967296, String(s));
});
test('xáo tiếp sau khi khôi phục giống hệt', () => {
  const r = C.rng(5);
  C.shuffle(C.newDeck(), r);
  const st = r.getState();
  const a = C.shuffle(C.newDeck(), r);
  const r2 = C.rng(0);
  r2.setState(st);
  eq(C.shuffle(C.newDeck(), r2), a);
});
test('hạt giống chuỗi và số cố định; bỏ trống thì ngẫu nhiên', () => {
  eq(C.rng('abc')(), C.rng('abc')());
  ok(C.rng('abc')() !== C.rng('abd')());
  ok(C.rng()() !== C.rng()() || C.rng()() !== C.rng()());
});

console.log('Nhãn và màu');
test('rankLabel nhận lá hoặc số', () => {
  eq(C.RANKS.map(C.rankLabel), ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
  eq(C.rankLabel({ rank: 12, suit: 'S' }), 'Q');
  eq(C.rankLabel(0), '');
});
test('suitSymbol nhận lá hoặc chữ chất', () => {
  eq(C.SUITS.map(C.suitSymbol).join(''), '♠♥♦♣');
  eq(C.suitSymbol({ rank: 1, suit: 'D' }), '♦');
});
test('isRed / color', () => {
  eq(C.SUITS.map(C.isRed), [false, true, true, false]);
  eq(C.color({ rank: 3, suit: 'H' }), 'red');
  eq(C.color('C'), 'black');
});
test('cardName en / vi, lá úp', () => {
  eq(C.cardName({ rank: 12, suit: 'H' }, 'en'), 'Queen of hearts');
  eq(C.cardName({ rank: 1, suit: 'S' }, 'vi'), 'Át bích');
  eq(C.cardName({ rank: 10, suit: 'C' }, 'vi'), '10 nhép');
  eq(C.cardName(null, 'vi'), 'Lá úp');
  eq(C.cardName({ rank: 13, suit: 'D' }, 'xx'), 'King of diamonds');
});

console.log('HTML của lá (không cần DOM)');
const count = (s, re) => (s.match(re) || []).length;
test('lá ngửa: data-id, lớp chất / màu, nhãn đọc màn hình', () => {
  const h = C.html({ rank: 10, suit: 'H' }, { size: 48 });
  ok(h.indexOf('data-id="10H"') > 0, h);
  ok(/class="pnc pnc-s-H pnc-red pnc-up"/.test(h), h);
  ok(h.indexOf('--card-w:48px') > 0);
  ok(h.indexOf('aria-label="10 of hearts"') > 0);
});
test('lá 2..10 có đúng số chấm; A có chất lớn; J Q K có khung và hình', () => {
  for (let r = 2; r <= 10; r++) eq(count(C.html({ rank: r, suit: 'S' }), /pnc-p[ "]/g), r, 'lá ' + r);
  ok(C.html({ rank: 1, suit: 'S' }).indexOf('pnc-ace') > 0);
  ['J', 'Q', 'K'].forEach((k, i) => {
    const h = C.html({ rank: 11 + i, suit: 'D' });
    ok(h.indexOf('pnc-court') > 0 && h.indexOf('#pnc-' + k) > 0, k);
  });
});
test('lá úp vẫn có mặt (để lật), không có pnc-up, nhãn là lá úp', () => {
  const h = C.html({ rank: 5, suit: 'C' }, { faceUp: false, label: undefined });
  ok(h.indexOf('pnc-up') < 0 && h.indexOf('pnc-face') > 0 && h.indexOf('pnc-back') > 0);
  ok(h.indexOf('aria-label="Face-down card"') > 0);
});
test('lá null: chỉ có lưng, không có data-id', () => {
  const h = C.html(null);
  ok(h.indexOf('data-id') < 0 && h.indexOf('pnc-face') < 0 && h.indexOf('pnc-back') > 0);
});
test('nhãn riêng / tắt nhãn; className; size dạng chuỗi', () => {
  ok(C.html({ rank: 1, suit: 'H' }, { label: 'X "1"' }).indexOf('aria-label="X &quot;1&quot;" data-label') > 0);
  ok(C.html({ rank: 1, suit: 'H' }, { label: false }).indexOf('aria-label') < 0);
  ok(C.html({ rank: 1, suit: 'H' }, { className: 'pnc-selected' }).indexOf('pnc-up pnc-selected"') > 0);
  ok(C.html({ rank: 1, suit: 'H' }, { size: '12vw' }).indexOf('--card-w:12vw') > 0);
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
