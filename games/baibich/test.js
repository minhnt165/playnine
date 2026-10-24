/* Kiểm tra engine Bài Bích: chạy `node test.js`
 * - Chia bài tất định theo seed, vòng báo, luật ra bài (theo chất, bích là chủ, bích chưa vỡ không được dẫn)
 * - Người ăn nước, tính điểm ván (hợp đồng, túi, phạt 10 túi, Nil), hết trận (mốc, −200, bằng điểm)
 * - Máy: báo hợp lý, luôn ra lá hợp lệ, đúng chiến thuật cơ bản, mức mạnh dần, đội máy Khó hơn hẳn bot ngẫu nhiên
 * - Lưu / khôi phục ván từ JSON và từ chối dữ liệu hỏng / sai luật
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
function ok(c, msg) {
  if (!c) throw new Error(msg || 'expected true');
}
function throws(fn, msg) {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
  }
  if (!threw) throw new Error(msg || 'expected throw');
}

const sorted = (a) => a.slice().sort();

/** Ván đang đánh dựng tay: bốn tay bài (thiếu lá thì không sao với các hàm luật), báo sẵn. */
function mk(hands, extra) {
  const g = E.newMatch({ seed: 1 });
  return Object.assign(g, { hands, bids: [3, 3, 3, 3], phase: 'play', turn: 0, lead: 0, trick: [], broken: false }, extra || {});
}

/** Chơi hết một trận toàn máy; levels[seat] = mức cho từng ghế (bỏ trống = mức theo ghế). */
function runMatch(seed, levels, opts) {
  let g = E.newMatch(Object.assign({ seed, level: 'hard', target: 300 }, opts || {}));
  let steps = 0;
  const lv = (s) => (levels ? levels[s] : undefined);
  while (g.phase !== 'over') {
    const s = g.turn;
    if (g.phase === 'play') {
      const card = E.aiPlay(g, lv(s));
      if (E.legalPlays(g).indexOf(card) < 0) throw new Error('máy ra lá sai luật: ' + card);
    }
    g = E.aiStep(g, lv(g.turn));
    if (++steps > 20000) throw new Error('trận không kết thúc');
  }
  return g;
}

/* ---------------- Chia bài, báo ---------------- */

test('chia bài: 13 lá mỗi người, đủ 52 lá khác nhau, tất định theo seed', () => {
  const g = E.newMatch({ seed: 42 });
  eq(g.hands.map((h) => h.length), [13, 13, 13, 13]);
  eq(new Set([].concat(...g.hands)).size, 52);
  eq(E.newMatch({ seed: 42 }).hands, g.hands);
  ok(JSON.stringify(E.newMatch({ seed: 43 }).hands) !== JSON.stringify(g.hands), 'seed khác ra bài khác');
  eq([g.phase, g.turn, g.lead, g.dealer, g.handNo, g.level, g.target], ['bid', 0, 0, 3, 1, 'medium', 300]);
  eq(E.newMatch({ seed: 1, level: 'hard', target: 500 }).target, 500);
  eq(E.newMatch({ seed: 1, level: 'x', target: 7 }).level, 'medium');
});

test('vòng báo: lần lượt từ bên trái người chia, Nil = 0, báo xong thì người dẫn nước đầu đi trước', () => {
  let g = E.newMatch({ seed: 5 });
  throws(() => E.bid(g, 14));
  throws(() => E.bid(g, -1));
  throws(() => E.bid(g, 2.5));
  g = E.bid(g, 0);
  eq([g.turn, g.bids, g.phase, g.humanMoves, g.moves], [1, [0, null, null, null], 'bid', 1, 1]);
  g = E.bid(E.bid(E.bid(g, 4), 3), 5);
  eq([g.phase, g.turn, g.lead, g.bids, g.humanMoves], ['play', 0, 0, [0, 4, 3, 5], 1]);
  throws(() => E.bid(g, 3), 'hết vòng báo');
});

test('ván sau: người chia xoay sang trái, người bên trái người chia báo và dẫn trước, điểm giữ nguyên', () => {
  let g = E.newMatch({ seed: 9 });
  while (g.phase !== 'hand' && g.phase !== 'over') g = E.aiStep(g);
  ok(g.phase === 'hand', 'một ván chưa thể hết trận');
  throws(() => E.bid(g, 3));
  const scores = g.scores.slice();
  const h = E.nextHand(g);
  eq([h.handNo, h.dealer, h.turn, h.lead, h.phase, h.scores, h.done.length, h.broken], [2, 0, 1, 1, 'bid', scores, 0, false]);
  eq(h.hands.map((x) => x.length), [13, 13, 13, 13]);
  throws(() => E.nextHand(h));
});

/* ---------------- Luật ra bài ---------------- */

test('phải ra theo chất được dẫn nếu có', () => {
  const g = mk([['2H', 'KH', 'AS', '3C'], ['5H'], ['6H'], ['7H']], { trick: ['QH', '4H', '9H'], lead: 1, turn: 0 });
  eq(sorted(E.legalPlays(g)), ['2H', 'KH']);
  throws(() => E.play(g, 'AS'), 'không được cắt khi còn chất dẫn');
});

test('hết chất được dẫn thì ra lá bất kỳ (kể cả bích, và bích vỡ)', () => {
  const g = mk([['AS', '3C', '4D'], ['5H'], ['6H'], ['7H']], { trick: ['QH', '4H', '9H'], lead: 1, turn: 0 });
  eq(sorted(E.legalPlays(g)), ['3C', '4D', 'AS']);
  const h = E.play(g, 'AS');
  eq([h.broken, h.tricks[0], h.done[0].win, h.turn, h.lead], [true, 1, 0, 0, 0]);
});

test('bích chưa vỡ: không được dẫn bích, trừ khi trên tay chỉ còn bích', () => {
  const g = mk([['AS', '2S', '3C', '4D'], [], [], []]);
  eq(sorted(E.legalPlays(g)), ['3C', '4D']);
  throws(() => E.play(g, 'AS'));
  eq(sorted(E.legalPlays(Object.assign({}, g, { broken: true }))), ['2S', '3C', '4D', 'AS']);
  eq(sorted(E.legalPlays(mk([['AS', '2S'], [], [], []]))), ['2S', 'AS']);
});

test('người ăn nước: lá to nhất chất dẫn, A to nhất, lá khác chất không ăn, bích to nhất ăn khi có bích', () => {
  eq(E.winningIndex(['10H', 'AH', 'KH', '2H']), 1);
  eq(E.winningIndex(['10H', 'AD', 'AC', '2H']), 0);
  eq(E.winningIndex(['10H', '2S', 'AH', '3S']), 3);
  eq(E.winningIndex(['5S', 'AH', '4S', '9S']), 3);
  eq(E.trickWinner(2, ['10H', 'AH', 'KH', '2H']), 3);
});

test('đánh đủ bốn lá: người ăn dẫn nước sau, số nước cộng đúng, lượt đi theo chiều kim đồng hồ', () => {
  let g = mk([['KH', '2C'], ['AH', '3C'], ['5H', '4C'], ['6H', '5C']]);
  g = E.play(g, 'KH');
  eq([g.turn, g.trick], [1, ['KH']]);
  g = E.play(E.play(E.play(g, 'AH'), '5H'), '6H');
  eq([g.trick, g.turn, g.lead, g.tricks], [[], 1, 1, [0, 1, 0, 0]]);
  eq(g.done[0], { lead: 0, cards: ['KH', 'AH', '5H', '6H'], win: 1 });
  throws(() => E.play(g, '2C'), 'không phải lượt ghế 0');
});

/* ---------------- Tính điểm ---------------- */

test('điểm: đạt hợp đồng +10 × báo, nước thừa là túi +1; trượt −10 × báo', () => {
  const r = E.scoreHand([3, 2, 4, 3], [4, 2, 2, 5], [0, 0]);
  eq([r[0].bid, r[0].took, r[0].made, r[0].base, r[0].over, r[0].delta, r[0].bags], [7, 6, false, -70, 0, -70, 0]);
  eq([r[1].bid, r[1].took, r[1].made, r[1].base, r[1].over, r[1].delta, r[1].bags], [5, 7, true, 50, 2, 52, 2]);
});

test('điểm: gom đủ 10 túi thì −100 và trừ 10 túi', () => {
  const r = E.scoreHand([2, 1, 2, 1], [5, 1, 3, 4], [7, 0]);
  // đội 0: báo 4, ăn 8 → +40 + 4 túi; 7 + 4 = 11 túi → −100, còn 1
  eq([r[0].base, r[0].over, r[0].penalty, r[0].delta, r[0].bags], [40, 4, -100, -56, 1]);
  eq([r[1].delta, r[1].bags], [23, 3]);
});

test('điểm Nil: +100 nếu không ăn nước nào, −100 nếu ăn; nước của người Nil vẫn tính cho đội', () => {
  const r = E.scoreHand([0, 4, 5, 0], [0, 6, 5, 2], [0, 0]);
  eq([r[0].bid, r[0].made, r[0].nil, r[0].delta, r[0].nils], [5, true, 100, 150, [{ seat: 0, ok: true }]]);
  eq([r[1].bid, r[1].took, r[1].made, r[1].over, r[1].nil, r[1].delta], [4, 8, true, 4, -100, -56]);
});

test('điểm: cả hai cùng Nil thì nước ăn được đều là túi', () => {
  const r = E.scoreHand([0, 6, 0, 4], [0, 9, 1, 3], [9, 0]);
  eq([r[0].bid, r[0].made, r[0].base, r[0].over, r[0].nil, r[0].penalty, r[0].delta, r[0].bags], [0, null, 0, 1, 0, -100, -99, 0]);
});

test('hết ván cộng điểm vào trận; có đội chạm mốc / tụt tới −200 thì hết trận, bằng điểm thì đánh tiếp', () => {
  eq(E.winnerOf([300, 120], 300), 0);
  eq(E.winnerOf([299, 120], 300), null);
  eq(E.winnerOf([310, 320], 300), 1);
  eq(E.winnerOf([310, 310], 300), null);
  eq(E.winnerOf([-200, 50], 500), 1);
  eq(E.winnerOf([-210, -250], 500), 0);
  // Ván cuối: đội bạn đang 290, báo 2 + 1 và ăn đủ → 320, thắng trận
  const filler = Array.from({ length: 12 }, () => ({ lead: 0, cards: ['2C', '3C', '4C', '5C'], win: 0 }));
  let g = mk([['AH'], ['2H'], ['3H'], ['4H']], { bids: [2, 1, 1, 1], scores: [290, 100], tricks: [1, 3, 1, 7], done: filler });
  g = E.play(E.play(E.play(E.play(g, 'AH'), '2H'), '3H'), '4H');
  eq([g.phase, g.scores, g.result.winner, g.result.teams[0].delta], ['over', [320, 128], 0, 30]);
});

/* ---------------- Máy ---------------- */

test('ước lượng báo: tay mạnh báo nhiều, tay yếu gợi ý Nil, gợi ý không bao giờ vượt 13', () => {
  const strong = ['AS', 'KS', 'QS', 'JS', '10S', 'AH', 'KH', 'AD', 'KD', 'AC', '2C', '3C', '4C'];
  const weak = ['2S', '3S', '2H', '4H', '6H', '3D', '5D', '7D', '9D', '2C', '4C', '6C', '8C'];
  ok(E.estimate(strong) >= 9, 'tay mạnh: ' + E.estimate(strong));
  ok(E.estimate(weak) < 1, 'tay yếu: ' + E.estimate(weak));
  ok(E.nilRisk(weak) <= 3, 'tay yếu ít rủi ro Nil');
  const g = E.newMatch({ seed: 3 });
  const s1 = E.suggestBid(Object.assign({}, g, { hands: [strong, [], [], []] }));
  const s2 = E.suggestBid(Object.assign({}, g, { hands: [weak, [], [], []] }));
  ok(s1.bid >= 8 && s1.bid <= 13 && !s1.nil, JSON.stringify(s1));
  eq([s2.bid, s2.nil], [0, true]);
  // Đồng đội đã báo Nil thì không gợi ý Nil nữa
  const s3 = E.suggestBid(Object.assign({}, g, { hands: [[], [], weak, []], turn: 2, bids: [0, 2, null, null] }));
  ok(!s3.nil && s3.bid >= 1, JSON.stringify(s3));
});

test('máy báo trong 1–13 hoặc Nil; máy Dễ không báo Nil', () => {
  for (let seed = 1; seed <= 300; seed++) {
    let g = E.newMatch({ seed, level: 'easy' });
    for (let k = 0; k < 4; k++) {
      ['easy', 'medium', 'hard'].forEach((lv) => {
        const b = E.aiBid(g, lv);
        ok(Number.isInteger(b) && b >= 0 && b <= 13, lv + ' báo ' + b);
        if (lv === 'easy') ok(b >= 1, 'Dễ không báo Nil');
      });
      g = E.bid(g, E.aiBid(g, 'hard'));
    }
  }
});

test('máy theo nước: đồng đội đang thắng chắc thì không đè, đối thủ đang thắng thì ra cuối bằng lá nhỏ nhất đủ ăn', () => {
  // Ghế 0 dẫn A♥ (đồng đội của ghế 2), ghế 1 ra 5♥; ghế 2 chỉ cần lót lá nhỏ
  const g = mk([[], [], ['QH', '3H', '7C'], []], { bids: [3, 3, 3, 3], trick: ['AH', '5H'], lead: 0, turn: 2 });
  eq(E.aiPlay(g, 'medium'), '3H');
  eq(E.aiPlay(g, 'hard'), '3H');
  // Đối thủ đang thắng: ra cuối thì lấy lá nhỏ nhất đủ ăn
  const h = mk([[], [], [], ['QH', 'KH', '3H']], { trick: ['JH', '5H', '2H'], lead: 0, turn: 3 });
  eq(E.aiPlay(h, 'medium'), 'QH');
  eq(E.aiPlay(h, 'hard'), 'QH');
});

test('máy báo Nil: ra lá to nhất mà vẫn thua; dẫn thì ra lá nhỏ nhất', () => {
  const g = mk([[], ['2H', '9H', 'KH'], [], []], { bids: [3, 0, 3, 3], trick: ['10H'], lead: 0, turn: 1 });
  eq(E.aiPlay(g, 'medium'), '9H');
  eq(E.aiPlay(g, 'hard'), '9H');
  const h = mk([[], ['5C', '2H', 'KD'], [], []], { bids: [3, 0, 3, 3], lead: 1, turn: 1 });
  eq(E.aiPlay(h, 'hard'), '2H');
});

test('máy che Nil cho đồng đội: đồng đội Nil đang thắng thì đè lên', () => {
  const g = mk([[], [], ['4H', 'QH', 'AH'], []], { bids: [0, 3, 3, 3], trick: ['2H', '9H', '3H'], lead: 3, turn: 2 });
  // ghế 3 dẫn 2♥, bạn (Nil) ra 9♥ đang thắng, Tây ra 3♥; Bắc phải đè bằng lá nhỏ nhất đủ ăn
  eq(E.aiPlay(g, 'hard'), 'QH');
});

test('máy Khó đếm lá: K là lá to nhất còn lại (A đã ra) thì dẫn K', () => {
  const g = mk([[], [], [], ['KD', '4D', '6C', '7C', '8C']], {
    bids: [3, 3, 3, 3],
    lead: 3,
    turn: 3,
    tricks: [0, 0, 0, 1],
    done: [{ lead: 1, cards: ['AD', '2D', '3D', '5D'], win: 1 }],
  });
  // done không khớp người dẫn, nhưng aiPlay chỉ dùng để đếm lá
  eq(E.aiPlay(g, 'hard'), 'KD');
  ok(E.aiPlay(g, 'medium') !== 'KD', 'máy Vừa không đếm lá nên không dẫn K');
});

test('máy luôn hợp lệ: 400 trận toàn máy ở mọi mức (kể cả bot ngẫu nhiên), mỗi trận kết thúc đúng luật', () => {
  const mixes = [undefined, ['easy', 'easy', 'easy', 'easy'], ['medium', 'random', 'hard', 'easy'], ['random', 'random', 'random', 'random']];
  let n = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const lv = mixes[seed % mixes.length];
    const g = runMatch(seed, lv, { level: E.LEVELS[seed % 3], target: seed % 2 ? 300 : 500 });
    const w = E.matchWinner(g);
    ok(w === 0 || w === 1, 'có đội thắng');
    ok(Math.max(...g.scores) >= g.target || Math.min(...g.scores) <= E.FLOOR, 'điểm đã chạm mốc');
    ok(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g)))) !== null, 'trận đã xong vẫn lưu / khôi phục được');
    n++;
  }
  eq(n, 400);
});

/** Tỉ lệ thắng trận của đội 0 (ghế 0 + 2) với mức a đấu đội 1 (ghế 1 + 3) mức b. */
function winRate(a, b, matches, seed0) {
  let won = 0;
  for (let i = 0; i < matches; i++) {
    const g = runMatch((seed0 || 1000) + i, [a, b, a, b]);
    if (E.matchWinner(g) === 0) won++;
  }
  return won / matches;
}

const RATES = {};
test('đội máy Khó thắng hơn hẳn đội bot ra lá ngẫu nhiên (≥ 90%)', () => {
  RATES.hardRandom = winRate('hard', 'random', 200);
  ok(RATES.hardRandom >= 0.9, 'Khó vs ngẫu nhiên: ' + RATES.hardRandom);
});

test('mức mạnh dần: Vừa thắng Dễ, Khó thắng Dễ, Khó không thua Vừa', () => {
  RATES.mediumEasy = winRate('medium', 'easy', 200, 5000);
  RATES.hardEasy = winRate('hard', 'easy', 200, 7000);
  RATES.hardMedium = winRate('hard', 'medium', 300, 9000);
  ok(RATES.mediumEasy >= 0.65, 'Vừa vs Dễ: ' + RATES.mediumEasy);
  ok(RATES.hardEasy >= 0.75, 'Khó vs Dễ: ' + RATES.hardEasy);
  ok(RATES.hardMedium >= 0.52, 'Khó vs Vừa: ' + RATES.hardMedium);
  ok(RATES.hardEasy >= RATES.mediumEasy, 'Khó vs Dễ mạnh hơn Vừa vs Dễ');
});

test('trận ngắn nhất (để đặt min_duration_ms): ít nhất một ván trọn, tức ≥ 39 lượt máy ra lá', () => {
  let minHands = Infinity;
  let minCpu = Infinity;
  for (let seed = 1; seed <= 300; seed++) {
    let g = E.newMatch({ seed, level: E.LEVELS[seed % 3], target: 300 });
    let cpu = 0;
    while (g.phase !== 'over') {
      if (g.phase === 'play' && g.turn !== E.HUMAN) cpu++;
      g = E.aiStep(g, g.turn === E.HUMAN ? 'hard' : undefined);
    }
    if (E.matchWinner(g) === 0) {
      minHands = Math.min(minHands, g.handNo);
      minCpu = Math.min(minCpu, cpu);
    }
  }
  RATES.minHands = minHands;
  RATES.minCpu = minCpu;
  ok(minHands >= 1 && minCpu >= 39, minHands + ' ván, ' + minCpu + ' lượt máy');
});

/* ---------------- Lưu / khôi phục ---------------- */

/** Các trạng thái mẫu ở mọi giai đoạn của một trận toàn máy. */
function samples() {
  const out = [];
  let g = E.newMatch({ seed: 77, level: 'hard', target: 300 });
  out.push(g);
  let i = 0;
  while (g.phase !== 'over') {
    g = E.aiStep(g);
    if (i++ % 7 === 0 || g.phase !== 'play') out.push(g);
  }
  out.push(g);
  return out;
}

test('lưu rồi khôi phục giữ nguyên ván ở mọi giai đoạn (báo, đang đánh dở nước, hết ván, hết trận)', () => {
  const all = samples();
  const phases = new Set(all.map((g) => g.phase));
  eq([...phases].sort(), ['bid', 'hand', 'over', 'play']);
  all.forEach((g) => {
    const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
    ok(back !== null, 'khôi phục được ' + g.phase + ' ' + g.done.length + '/' + g.trick.length);
    eq(back, g);
  });
});

test('từ chối dữ liệu hỏng / sai luật', () => {
  const base = samples().filter((g) => g.phase === 'play' && g.trick.length === 2 && g.done.length > 2)[0];
  ok(base, 'có mẫu giữa ván');
  const raw = () => JSON.parse(JSON.stringify(E.toJSON(base)));
  const bad = [
    null, 1, 'x', [], {},
    Object.assign(raw(), { v: 2 }),
    Object.assign(raw(), { level: 'god' }),
    Object.assign(raw(), { target: 1000 }),
    Object.assign(raw(), { phase: 'win' }),
    Object.assign(raw(), { bags: [10, 0] }),
    Object.assign(raw(), { scores: [1, 2, 3] }),
    Object.assign(raw(), { turn: (base.turn + 1) % 4 }),
    Object.assign(raw(), { broken: !base.broken }),
    Object.assign(raw(), { humanMoves: base.moves + 1 }),
    Object.assign(raw(), { bids: [14, 1, 1, 1] }),
    Object.assign(raw(), { bids: [null, 1, 1, 1] }),
    Object.assign(raw(), { tricks: base.tricks.map((n, i) => (i === 0 ? n + 1 : n)) }),
    Object.assign(raw(), { rng: -1 }),
    Object.assign(raw(), { result: { teams: [], winner: null } }),
  ];
  // Lá trùng: đổi một lá trên tay thành lá đã ra
  const dup = raw();
  dup.hands[0][0] = dup.done[0].cards[0];
  bad.push(dup);
  // Sai người ăn nước
  const win = raw();
  win.done[0].win = (win.done[0].win + 1) % 4;
  bad.push(win);
  // Lá lạ
  const odd = raw();
  odd.hands[1][0] = 'ZZ';
  bad.push(odd);
  // Chuyển một lá từ tay người này sang người khác (sai số lá)
  const move = raw();
  move.hands[2].push(move.hands[3].pop());
  bad.push(move);
  bad.forEach((r, i) => eq(E.fromJSON(r), null, 'mẫu hỏng #' + i));

  // Kết quả ván bị sửa điểm
  const end = samples().filter((g) => g.phase === 'hand')[0];
  const fake = JSON.parse(JSON.stringify(E.toJSON(end)));
  fake.result.teams[0].delta += 50;
  eq(E.fromJSON(fake), null, 'sửa kết quả ván');
  const fake2 = JSON.parse(JSON.stringify(E.toJSON(end)));
  fake2.phase = 'over';
  eq(E.fromJSON(fake2), null, 'hết trận khi chưa ai chạm mốc');
  // Đang báo nhưng sai thứ tự
  const b = JSON.parse(JSON.stringify(E.toJSON(E.newMatch({ seed: 4 }))));
  b.bids = [null, 3, null, null];
  eq(E.fromJSON(b), null, 'báo sai thứ tự');
});

console.log('\nTỉ lệ thắng trận (đội 0 vs đội 1): ' + JSON.stringify(RATES));
console.log(passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
