/* Kiểm tra engine Đô-mi-nô: chạy `node test.js`
 * - Bộ 28 quân đôi-sáu, chia 7 / 7 / nọc 14, luật mở ván (đôi lớn nhất, không có thì quân lớn nhất)
 * - Đánh hợp lệ ở hai đầu (kể cả quân đôi), quay quân đúng chiều, bốc nọc / bỏ lượt chỉ khi bắt buộc
 * - Hết quân và tắc: tính điểm; trận đủ điểm thì xong; ván (hand) tiếp theo giữ điểm
 * - Máy (dễ / khó) luôn đi nước hợp lệ, máy khó chặn chấm đối thủ thiếu và thắng máy dễ đa số
 * - Hàng nghìn trận mô phỏng đều kết thúc; bố cục dây không chồng quân, nằm trong khung
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

/** Mã quân theo hai chấm */
const T = (a, b) => E.TILES.findIndex((t) => t[0] === Math.min(a, b) && t[1] === Math.max(a, b));
const ALL = E.TILES.map((_, i) => i);

/** Dựng trạng thái tay: dây cho trước (mảng [l, r]), tay hai bên, nọc là phần còn lại (hoặc cho trước) */
function make({ line = [], h0, h1, boneyard, turn = 0, scores = [0, 0], target = 100, lead }) {
  const lineObjs = line.map(([l, r]) => ({ id: T(l, r), l, r }));
  const used = new Set(lineObjs.map((t) => t.id).concat(h0, h1));
  const bone = boneyard || ALL.filter((i) => !used.has(i));
  const s = {
    v: 1, target, seed: 1, handNo: 1, scores,
    hands: [h0.slice().sort((a, b) => a - b), h1.slice().sort((a, b) => a - b)],
    boneyard: bone, line: lineObjs, turn,
    lead: lineObjs.length ? -1 : lead,
    lacks: [Array(7).fill(false), Array(7).fill(false)],
    phase: 'play', result: null, winner: -1,
  };
  const r = E.fromJSON(s);
  if (!r) throw new Error('trạng thái dựng sẵn không hợp lệ');
  return r;
}

/* ---------------- Bộ quân, chia bài ---------------- */
test('bộ đôi-sáu có đúng 28 quân khác nhau, 7 quân đôi, tổng 168 chấm', () => {
  eq(E.TILES.length, 28);
  eq(new Set(E.TILES.map((t) => t.join('|'))).size, 28);
  ok(E.TILES.every((t) => t[0] >= 0 && t[0] <= t[1] && t[1] <= 6));
  eq(ALL.filter(E.isDouble).length, 7);
  eq(E.sumPips(ALL), 168);
  for (let a = 0; a <= 6; a++) eq(E.TILES.filter((t) => t[0] === a || t[1] === a).length, 7, 'chấm ' + a);
});

test('chia: mỗi bên 7 quân, nọc 14, đủ 28 quân không trùng', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const s = E.newMatch({ target: 100, seed });
    eq([s.hands[0].length, s.hands[1].length, s.boneyard.length, s.line.length], [7, 7, 14, 0]);
    eq(new Set(s.hands[0].concat(s.hands[1], s.boneyard)).size, 28);
    eq([s.phase, s.scores, s.handNo, s.target], ['play', [0, 0], 1, 100]);
  }
});

test('chia theo seed: cùng seed cùng bài, khác seed khác bài', () => {
  eq(E.newMatch({ seed: 42 }), E.newMatch({ seed: 42 }));
  ok(JSON.stringify(E.newMatch({ seed: 42 }).hands) !== JSON.stringify(E.newMatch({ seed: 43 }).hands));
});

test('mục tiêu trận: 50 / 100 / 150, giá trị lạ thì 100', () => {
  eq([50, 100, 150, 77, undefined].map((t) => E.newMatch({ target: t, seed: 1 }).target), [50, 100, 150, 100, 100]);
});

test('mở ván: người giữ quân đôi lớn nhất đi trước và chỉ được đánh quân đó', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const s = E.newMatch({ seed });
    const doubles = s.hands[0].concat(s.hands[1]).filter(E.isDouble);
    if (!doubles.length) continue;
    const top = Math.max(...doubles);
    eq(s.lead, top, 'seed ' + seed);
    ok(s.hands[s.turn].indexOf(top) >= 0, 'người đi trước giữ quân mở');
    eq(E.legalMoves(s), [{ type: 'play', tile: top, end: 'L' }]);
  }
});

test('mở ván: không ai có quân đôi thì quân lớn nhất đi trước; [3|6] thắng [4|5] vì đầu lớn hơn', () => {
  const h0 = [T(0, 1), T(2, 3), T(1, 6), T(0, 5), T(1, 2), T(0, 3), T(2, 4)];
  const h1 = [T(4, 5), T(3, 6), T(0, 2), T(1, 3), T(0, 4), T(1, 4), T(2, 5)];
  eq(E.leadTile([h0, h1]), T(3, 6));
  eq(E.leadTile([h0.concat([T(2, 2)]), h1]), T(2, 2));
});

/* ---------------- Đánh quân ---------------- */
test('đánh khớp đầu trái / phải, quay quân cho chấm chạm nhau bằng nhau', () => {
  const s = make({ line: [[3, 5]], h0: [T(1, 3), T(5, 6), T(0, 0)], h1: [T(2, 2), T(4, 4)] });
  eq(E.legalPlays(s), [{ tile: T(1, 3), end: 'L' }, { tile: T(5, 6), end: 'R' }].sort((a, b) => a.tile - b.tile));
  const a = E.apply(s, { type: 'play', tile: T(1, 3), end: 'L' });
  eq(a.line.map((t) => [t.l, t.r]), [[1, 3], [3, 5]]);
  eq(E.ends(a), { L: 1, R: 5 });
  eq(a.turn, 1);
  const b = E.apply(s, { type: 'play', tile: T(5, 6), end: 'R' });
  eq(b.line.map((t) => [t.l, t.r]), [[3, 5], [5, 6]]);
});

test('đánh sai đầu, quân không khớp, quân không có trên tay, không phải lượt: đều bị từ chối', () => {
  const s = make({ line: [[3, 5]], h0: [T(1, 3), T(0, 0)], h1: [T(2, 2), T(5, 5)] });
  eq(E.apply(s, { type: 'play', tile: T(1, 3), end: 'R' }), null);
  eq(E.apply(s, { type: 'play', tile: T(0, 0), end: 'L' }), null);
  eq(E.apply(s, { type: 'play', tile: T(5, 5), end: 'R' }), null, 'quân của đối thủ');
  eq(E.apply(s, { type: 'draw' }), null, 'còn quân đánh được thì không được bốc');
  eq(E.apply(s, { type: 'pass' }), null);
  eq(E.apply(s, null), null);
  eq(E.apply(s, { type: 'play', tile: 99, end: 'L' }), null);
});

test('quân khớp cả hai đầu được chọn đầu; quân đôi khớp đầu cùng chấm và giữ nguyên chấm ở đầu', () => {
  const s = make({ line: [[2, 3], [3, 4]], h0: [T(2, 4), T(2, 6), T(4, 4), T(6, 6)], h1: [T(0, 0)] });
  eq(E.fitsOf(s, T(2, 4)), ['L', 'R']);
  eq(E.fitsOf(s, T(2, 6)), ['L']);
  eq(E.fitsOf(s, T(4, 4)), ['R']);
  eq(E.fitsOf(s, T(6, 6)), []);
  const l = E.apply(s, { type: 'play', tile: T(2, 4), end: 'L' });
  eq(l.line.map((t) => [t.l, t.r]), [[4, 2], [2, 3], [3, 4]]);
  const r = E.apply(s, { type: 'play', tile: T(2, 4), end: 'R' });
  eq(r.line.map((t) => [t.l, t.r]), [[2, 3], [3, 4], [4, 2]]);
  const d = E.apply(s, { type: 'play', tile: T(4, 4), end: 'R' });
  eq(E.ends(d), { L: 2, R: 4 });
});

test('quân mở ván: chỉ đánh được quân mở, sau đó hết ràng buộc', () => {
  const s = make({ h0: [T(6, 6), T(1, 2)], h1: [T(5, 6), T(0, 0)], lead: T(6, 6) });
  eq(E.legalMoves(s), [{ type: 'play', tile: T(6, 6), end: 'L' }]);
  eq(E.apply(s, { type: 'play', tile: T(1, 2), end: 'L' }), null);
  const a = E.apply(s, { type: 'play', tile: T(6, 6), end: 'L' });
  eq([a.lead, a.turn, E.ends(a)], [-1, 1, { L: 6, R: 6 }]);
  eq(E.legalPlays(a), [{ tile: T(5, 6), end: 'L' }, { tile: T(5, 6), end: 'R' }]);
});

/* ---------------- Bốc / bỏ lượt ---------------- */
test('không đánh được: phải bốc từng quân tới khi đánh được, quân bốc vào tay đã sắp xếp', () => {
  const bone = [T(6, 6), T(1, 5), T(4, 6)]; // bốc từ cuối: [4|6] rồi [1|5] rồi [6|6]
  const used = new Set([T(2, 3), T(0, 0), T(1, 1), T(2, 2)].concat(bone));
  const rest = ALL.filter((i) => !used.has(i));
  // Phần còn lại chia cho đối thủ để nọc đúng như cho
  const s = make({ line: [[2, 3]], h0: [T(0, 0), T(1, 1)], h1: rest.concat([T(2, 2)]), boneyard: bone });
  eq(E.mustDraw(s), true);
  eq(E.legalMoves(s), [{ type: 'draw' }]);
  const a = E.apply(s, { type: 'draw' });
  eq([a.turn, a.boneyard.length, a.hands[0]], [0, 2, [T(0, 0), T(1, 1), T(4, 6)].sort((x, y) => x - y)]);
  eq(E.mustDraw(a), true);
  eq([a.lacks[0][2], a.lacks[0][3]], [true, true], 'lộ thiếu chấm 2 và 3');
  const b = E.apply(a, { type: 'draw' });
  eq(E.mustDraw(b), true);
  const c = E.apply(b, { type: 'draw' });
  eq([E.mustDraw(c), E.mustPass(c)], [false, true], '[6|6] cũng không khớp, nọc hết thì bỏ lượt');
});

test('bốc được quân khớp thì phải đánh, không được bốc thêm', () => {
  const bone = [T(3, 4)];
  const used = new Set([T(2, 3), T(0, 0), T(1, 1)].concat(bone));
  const s = make({ line: [[2, 3]], h0: [T(0, 0)], h1: ALL.filter((i) => !used.has(i)).concat([T(1, 1)]), boneyard: bone });
  const a = E.apply(s, { type: 'draw' });
  eq(E.legalMoves(a), [{ type: 'play', tile: T(3, 4), end: 'R' }]);
  eq(E.apply(a, { type: 'draw' }), null);
});

test('nọc hết và không đánh được: bỏ lượt, sang lượt đối thủ', () => {
  const s = make({ line: [[2, 3]], h0: [T(0, 0), T(1, 1)], h1: ALL.filter((i) => [T(2, 3), T(0, 0), T(1, 1)].indexOf(i) < 0), boneyard: [] });
  eq(E.mustPass(s), true);
  eq(E.legalMoves(s), [{ type: 'pass' }]);
  eq(E.apply(s, { type: 'draw' }), null);
  const a = E.apply(s, { type: 'pass' });
  eq([a.turn, a.phase], [1, 'play']);
  eq([a.lacks[0][2], a.lacks[0][3]], [true, true]);
});

/* ---------------- Kết thúc ván / trận ---------------- */
test('hết quân: ăn tổng chấm trên tay đối thủ', () => {
  const s = make({ line: [[2, 3]], h0: [T(3, 6)], h1: [T(5, 5), T(4, 6), T(0, 1)], scores: [10, 20] });
  const a = E.apply(s, { type: 'play', tile: T(3, 6), end: 'R' });
  eq(a.phase, 'hand');
  eq(a.result, { winner: 0, reason: 'domino', points: 10 + 10 + 1, pips: [0, 21] });
  eq(a.scores, [31, 20]);
});

test('tắc (ván ngẫu nhiên): nọc hết, không ai đánh được; ít chấm hơn thắng phần chênh lệch, bằng nhau 0 điểm', () => {
  let seen = 0;
  for (let seed = 1; seed <= 4000 && seen < 30; seed++) {
    let s = E.newMatch({ seed, target: 150 });
    const rng = E.mulberry32(seed);
    while (s.phase === 'play') {
      const before = s;
      s = E.apply(s, E.chooseMove(s, { level: 'easy', rng }));
      if (s.phase !== 'play' && s.result.reason === 'blocked') {
        seen++;
        const [p0, p1] = s.result.pips;
        ok(s.boneyard.length === 0, 'tắc thì nọc phải hết');
        ok(!E.canPlay(Object.assign({}, s, { phase: 'play' }), 0) && !E.canPlay(Object.assign({}, s, { phase: 'play' }), 1), 'không ai đánh được');
        if (p0 === p1) eq([s.result.winner, s.result.points], [-1, 0]);
        else eq([s.result.winner, s.result.points], [p0 < p1 ? 0 : 1, Math.abs(p0 - p1)]);
        eq(s.scores[0] + s.scores[1], before.scores[0] + before.scores[1] + s.result.points);
      }
    }
  }
  ok(seen >= 10, 'phải gặp đủ ván tắc, gặp ' + seen);
});

// Dây chứa đủ 7 quân có chấm 6, hai đầu đều là 6 sau khi đánh [5|6] vào đầu phải; nọc trống → tắc ngay
const SIX_LINE = [[6, 0], [0, 1], [1, 6], [6, 6], [6, 2], [2, 3], [3, 6], [6, 4], [4, 5]]; // đầu 6 và 5
const SIX_REST = ALL.filter((i) => SIX_LINE.every(([a, b]) => T(a, b) !== i) && i !== T(5, 6)); // 18 quân, 90 chấm
function sixBlock(h0Rest) {
  const h1 = SIX_REST.filter((i) => h0Rest.indexOf(i) < 0);
  const s = make({ line: SIX_LINE, h0: h0Rest.concat([T(5, 6)]), h1, boneyard: [] });
  return E.apply(s, { type: 'play', tile: T(5, 6), end: 'R' });
}

test('tắc dựng tay: hai đầu 6 / 6, không ai còn chấm 6, nọc hết → xong ván ngay', () => {
  eq(E.sumPips(SIX_REST), 90);
  const a = sixBlock([T(0, 0), T(1, 1)]); // người 0 còn 2 chấm, máy 88
  eq([a.phase, a.result], ['hand', { winner: 0, reason: 'blocked', points: 86, pips: [2, 88] }]);
  eq(a.scores, [86, 0]);
  const b = sixBlock(SIX_REST.filter((i) => i !== T(0, 0))); // máy chỉ còn [0|0]
  eq([b.result.winner, b.result.points, b.scores], [1, 90, [0, 90]]);
  const tie = sixBlock([T(5, 5), T(4, 4), T(3, 5), T(3, 4), T(2, 5), T(0, 5)]); // 45 / 45
  eq([tie.result.winner, tie.result.points, tie.scores, tie.phase], [-1, 0, [0, 0], 'hand']);
});

test('tắc ngay khi bốc quân cuối mà không ai đánh được (không cần bỏ lượt)', () => {
  // Dây đủ 7 quân chấm 6, hai đầu 6 / 6; nọc còn đúng [0|0]. Người 0 phải bốc, bốc xong không ai có chấm 6 → tắc.
  const line = SIX_LINE.concat([[5, 6]]);
  const h0 = [T(1, 1), T(2, 2)];
  const h1 = SIX_REST.filter((i) => h0.indexOf(i) < 0 && i !== T(0, 0));
  const s = make({ line, h0, h1, boneyard: [T(0, 0)] });
  eq(E.legalMoves(s), [{ type: 'draw' }]);
  const a = E.apply(s, { type: 'draw' });
  eq([a.phase, a.result], ['hand', { winner: 0, reason: 'blocked', points: 78, pips: [6, 84] }]);
  // Thế "đang chơi" mà đã tắc là dữ liệu hỏng
  eq(E.fromJSON(Object.assign({}, E.toJSON(a), { phase: 'play', result: null })), null);
});

test('trận: đủ điểm mục tiêu thì xong trận, có người thắng', () => {
  const s = make({ line: [[2, 3]], h0: [T(3, 6)], h1: [T(5, 5), T(4, 6)], scores: [90, 95], target: 100 });
  const a = E.apply(s, { type: 'play', tile: T(3, 6), end: 'R' });
  eq([a.phase, a.winner, a.scores], ['match', 0, [110, 95]]);
  eq(E.nextHand(a), null, 'xong trận thì không chia tiếp');
  eq(E.legalMoves(a), []);
  eq(E.apply(a, { type: 'pass' }), null);
});

test('ván tiếp theo: giữ điểm, tăng số ván, chia lại đủ 28 quân', () => {
  const s = make({ line: [[2, 3]], h0: [T(3, 6)], h1: [T(5, 5)], scores: [10, 0] });
  const a = E.apply(s, { type: 'play', tile: T(3, 6), end: 'R' });
  eq(a.phase, 'hand');
  const n = E.nextHand(a);
  eq([n.phase, n.handNo, n.scores, n.line.length, n.hands[0].length, n.hands[1].length, n.boneyard.length], ['play', 2, [20, 0], 0, 7, 7, 14]);
  eq(E.nextHand(n), null, 'đang chơi thì không chia lại');
});

/* ---------------- Máy ---------------- */
test('máy dễ và khó luôn trả nước hợp lệ (2000 thế ngẫu nhiên)', () => {
  let n = 0;
  for (let seed = 1; n < 2000; seed++) {
    let s = E.newMatch({ seed });
    const rng = E.mulberry32(seed * 7);
    while (s.phase === 'play' && n < 2000) {
      ['easy', 'hard'].forEach((level) => ok(E.isLegal(s, E.chooseMove(s, { level, rng })), level + ' seed ' + seed));
      s = E.apply(s, E.chooseMove(s, { level: seed % 2 ? 'easy' : 'hard', rng }));
      n++;
    }
  }
});

test('máy khó đánh quân cuối để thắng ván', () => {
  const t = make({ line: [[2, 3]], h0: [T(0, 0), T(6, 6)], h1: [T(1, 2)], turn: 1 });
  eq(E.chooseMove(t, { level: 'hard', rng: E.mulberry32(1) }), { type: 'play', tile: T(1, 2), end: 'L' });
});

test('máy khó chặn chấm đối thủ đã lộ là thiếu (khi bốc / bỏ lượt)', () => {
  // Hai đầu 5 / 5. Máy cầm [5|6], [2|5], [1|2], [2|2]. Đối thủ đã lộ thiếu 5 và 6:
  // đánh [5|6] để hai đầu 5 / 6 đều là chấm đối thủ không có, dù [2|5] giữ được nhiều chấm 2 hơn.
  const base = make({ line: [[5, 5]], h0: [T(0, 0), T(0, 1)], h1: [T(5, 6), T(2, 5), T(1, 2), T(2, 2)], turn: 1 });
  const raw = E.toJSON(base);
  raw.lacks[0][5] = true;
  raw.lacks[0][6] = true;
  const s = E.fromJSON(raw);
  for (let seed = 1; seed <= 20; seed++) eq(E.chooseMove(s, { level: 'hard', rng: E.mulberry32(seed) }).tile, T(5, 6));
});

test('máy khó suy ra chấm đối thủ không thể có (đủ 7 quân chấm đó đã thấy)', () => {
  // Hai đầu 3 / 3; dây đã có [0|5],[5|5],[1|5],[2|5],[4|5]. Máy cầm [3|5], [3|6], [5|6].
  // Không tính suy luận thì [3|6] nhỉnh hơn (nặng hơn); nhưng đánh [3|5] thì đủ 7 quân chấm 5 đã thấy → đầu 5 chặn chắc.
  const line = [[3, 0], [0, 5], [5, 5], [5, 1], [1, 2], [2, 5], [5, 4], [4, 3]];
  const s = make({ line, h0: [T(0, 0), T(1, 1)], h1: [T(3, 5), T(3, 6), T(5, 6)], turn: 1 });
  for (let seed = 1; seed <= 20; seed++) eq(E.chooseMove(s, { level: 'hard', rng: E.mulberry32(seed) }).tile, T(3, 5));
});

test('máy khó thắng máy dễ phần lớn số trận (300 trận tới 100)', () => {
  let hardWins = 0;
  for (let seed = 1; seed <= 300; seed++) {
    let s = E.newMatch({ seed, target: 100 });
    const rng = E.mulberry32(seed * 31);
    const hardSide = seed % 2; // đổi bên để công bằng
    while (s.phase !== 'match') {
      if (s.phase === 'hand') s = E.nextHand(s);
      else s = E.apply(s, E.chooseMove(s, { level: s.turn === hardSide ? 'hard' : 'easy', rng }));
    }
    if (s.winner === hardSide) hardWins++;
  }
  ok(hardWins >= 180, 'máy khó thắng ' + hardWins + '/300');
});

/* ---------------- Mô phỏng ---------------- */
test('5000 trận mô phỏng (mọi mục tiêu, mọi mức) đều kết thúc, điểm và quân luôn nhất quán', () => {
  let hands = 0;
  for (let seed = 1; seed <= 5000; seed++) {
    const target = E.TARGETS[seed % 3];
    let s = E.newMatch({ seed, target });
    const rng = E.mulberry32(seed);
    let steps = 0;
    while (s.phase !== 'match') {
      if (++steps > 20000) throw new Error('trận không kết thúc, seed ' + seed);
      if (s.phase === 'hand') {
        hands++;
        s = E.nextHand(s);
        continue;
      }
      const m = E.chooseMove(s, { level: (seed + s.turn) % 2 ? 'hard' : 'easy', rng });
      const n = E.apply(s, m);
      if (!n) throw new Error('nước không hợp lệ, seed ' + seed);
      const total = n.hands[0].length + n.hands[1].length + n.boneyard.length + n.line.length;
      if (total !== 28) throw new Error('mất quân, seed ' + seed);
      s = n;
    }
    ok(s.scores[s.winner] >= target && s.scores[1 - s.winner] < target, 'điểm cuối trận, seed ' + seed);
  }
  ok(hands > 5000);
});

/* ---------------- Bố cục dây ---------------- */
function overlap(a, b) {
  const e = 1e-9;
  return a.x < b.x + b.w - e && b.x < a.x + a.w - e && a.y < b.y + b.h - e && b.y < a.y + a.h - e;
}

test('bố cục dây: không chồng quân, nằm trong bề rộng, nửa quân chạm nhau đúng chấm', () => {
  for (let seed = 1; seed <= 300; seed++) {
    let s = E.newMatch({ seed });
    const rng = E.mulberry32(seed);
    while (s.phase === 'play') s = E.apply(s, E.chooseMove(s, { level: 'easy', rng }));
    [4, 5, 8, 11, 16, 23, 40].forEach((W) => {
      const L = E.layoutLine(s.line, W);
      eq(L.items.length, s.line.length);
      ok(L.width <= W + 1e-9, 'rộng ' + L.width + ' > ' + W);
      L.items.forEach((a, i) => {
        ok(a.x >= -1e-9 && a.y >= -1e-9 && a.x + a.w <= L.width + 1e-9 && a.y + a.h <= L.height + 1e-9, 'ra ngoài khung');
        for (let j = i + 1; j < L.items.length; j++) ok(!overlap(a, L.items[j]), 'chồng quân ' + i + ' / ' + j + ' (W=' + W + ', seed ' + seed + ')');
        // Hai quân liền nhau: nửa sau của quân trước và nửa trước của quân sau kề nhau (khoảng cách tâm 1 đơn vị, hoặc
        // 1,5 khi một bên là quân đôi vắt ngang)
        if (i > 0) {
          const p = L.items[i - 1];
          const d = Math.abs(p.h2.x - a.h1.x) + Math.abs(p.h2.y - a.h1.y);
          ok(d <= 1.5 + 1e-9 && d >= 1 - 1e-9, 'quân ' + i + ' không nối với quân trước (d=' + d + ')');
        }
      });
    });
  }
});

test('bố cục dây: dây ngắn nằm một hàng; dây dài rẽ nhiều hàng', () => {
  const short = [{ id: T(6, 6), l: 6, r: 6 }, { id: T(5, 6), l: 6, r: 5 }];
  const a = E.layoutLine(short, 20);
  eq([a.width, a.height], [3, 2]);
  eq(a.dir, 1);
  eq(E.layoutLine([], 10), { items: [], width: 0, height: 0, dir: 1 });
  // Dây 7 quân thường trong bề rộng 6: hàng đầu 3 quân, quân góc, hàng hai 2 quân (chạy ngược), quân góc
  const chain = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]].map(([l, r]) => ({ id: T(l, r), l, r }));
  const b = E.layoutLine(chain, 6);
  eq(b.items.map((it) => !!it.turn), [false, false, false, true, false, false, true]);
  eq(b.dir, 1);
  ok(b.height > 4, 'nhiều hàng');
});

/* ---------------- Lưu / khôi phục ---------------- */
test('lưu rồi khôi phục giữ nguyên ván, chơi tiếp ra cùng kết quả', () => {
  let s = E.newMatch({ seed: 7, target: 50 });
  const rng = E.mulberry32(5);
  for (let i = 0; i < 9; i++) s = E.apply(s, E.chooseMove(s, { level: 'hard', rng }));
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(s))));
  eq(back, s);
  // Ván đã xong (chờ ván tiếp) và trận đã xong cũng lưu được
  let h = s;
  while (h.phase === 'play') h = E.apply(h, E.chooseMove(h, { level: 'easy', rng }));
  eq(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(h)))), h);
  eq(E.nextHand(E.fromJSON(E.toJSON(h))), E.nextHand(h), 'seed PRNG được lưu nên ván sau giống hệt');
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(E.newMatch({ seed: 3 }));
  ok(E.fromJSON(good), 'ván tốt phải đọc được');
  const bad = [
    null, 1, 'x', {}, [],
    Object.assign({}, good, { v: 2 }),
    Object.assign({}, good, { target: 70 }),
    Object.assign({}, good, { seed: -1 }),
    Object.assign({}, good, { handNo: 0 }),
    Object.assign({}, good, { scores: [0] }),
    Object.assign({}, good, { scores: [0, -3] }),
    Object.assign({}, good, { turn: 2 }),
    Object.assign({}, good, { hands: [good.hands[0].slice(1), good.hands[1]] }), // mất một quân
    Object.assign({}, good, { hands: [good.hands[0].concat([good.hands[1][0]]), good.hands[1]] }), // trùng quân
    Object.assign({}, good, { hands: [good.hands[0].map(() => 'a'), good.hands[1]] }),
    Object.assign({}, good, { boneyard: good.boneyard.slice(0, 13).concat([40]) }),
    Object.assign({}, good, { lead: -1 }), // dây trống mà không có quân mở
    Object.assign({}, good, { lead: good.hands[1 - good.turn][0] }), // quân mở không nằm trong tay người đi
    Object.assign({}, good, { lacks: [[], []] }),
    Object.assign({}, good, { phase: 'x' }),
    Object.assign({}, good, { phase: 'match', winner: 0 }),
    Object.assign({}, good, { result: { winner: 0, reason: 'domino', points: 1, pips: [0, 0] } }),
  ];
  bad.forEach((raw, i) => eq(E.fromJSON(raw), null, 'mẫu ' + i));
  // Dây không liền chấm hoặc mặt quân sai
  const s = make({ line: [[2, 3], [3, 4]], h0: [T(0, 0)], h1: [T(1, 1)] });
  const j = E.toJSON(s);
  eq(E.fromJSON(Object.assign({}, j, { line: [{ id: T(2, 3), l: 2, r: 3 }, { id: T(3, 4), l: 4, r: 3 }] })), null, 'dây đứt');
  eq(E.fromJSON(Object.assign({}, j, { line: [{ id: T(2, 3), l: 2, r: 5 }, { id: T(3, 4), l: 3, r: 4 }] })), null, 'mặt quân sai');
  eq(E.fromJSON(Object.assign({}, j, { lead: T(0, 0) })), null, 'đã có dây thì không còn quân mở');
  // Kết quả ván không khớp tay bài
  const done = E.apply(make({ line: [[2, 3]], h0: [T(3, 6)], h1: [T(5, 5)] }), { type: 'play', tile: T(3, 6), end: 'R' });
  const dj = E.toJSON(done);
  ok(E.fromJSON(dj));
  eq(E.fromJSON(Object.assign({}, dj, { result: Object.assign({}, dj.result, { points: 99 }) })), null, 'điểm ván sai');
  eq(E.fromJSON(Object.assign({}, dj, { phase: 'play', result: null })), null, 'đang chơi mà một bên hết quân');
  // Getter ném lỗi cũng không làm vỡ
  const evil = Object.assign({}, good);
  Object.defineProperty(evil, 'hands', { get() { throw new Error('x'); }, enumerable: true });
  eq(E.fromJSON(evil), null);
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
