/* Kiểm tra engine Cờ Tỷ Phú: chạy `node test.js` (khoảng 20–30 s)
 * - Bàn, xúc xắc / thẻ tất định theo seed, đi vòng + lương
 * - Mua / bỏ qua, tiền thuê (đất, đủ nhóm, nhà, cảng, xưởng, cầm cố)
 * - Đôi được gieo tiếp, 3 lần đôi vào trại; ra trại: trả tiền / thẻ / đổ đôi / hết 3 lượt
 * - Xây đều / bán đều, cầm cố / chuộc, nợ + phá sản (chuyển tài sản cho chủ nợ / ngân hàng)
 * - Thẻ Cơ hội / Vận may, mua lại đất qua thỏa thuận
 * - Kết thúc theo số vòng + xếp hạng theo tài sản, ghế người chơi phá sản là hết ván
 * - Máy luôn đi nước hợp lệ (nhiều ván toàn máy), tiền chỉ đổi qua ngân hàng, mức mạnh dần
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
  if (!v) throw new Error(msg || 'expected true');
}

const idx = (id) => E.BOARD.findIndex((sq) => sq.id === id);
const SAPA = idx('sapa');
const HAGIANG = idx('hagiang');
const HUE = idx('hue');
const HOIAN = idx('hoian');
const DALAT = idx('dalat');
const PHUQUOC = idx('phuquoc');
const SAIGON = idx('saigon');
const HAIPHONG = idx('haiphong');
const SOLAR = idx('solar');
const WATER = idx('water');
const TOKYO = idx('tokyo');

/** Ván mới đã chỉnh tay (trạng thái là JSON thuần nên sửa trực tiếp được). */
function setup(fn, opts) {
  const g = E.newGame(Object.assign({ seed: 1 }, opts || {}));
  if (fn) fn(g);
  return g;
}
function must(g, a) {
  const n = E.act(g, a);
  if (!n) throw new Error('thao tác bị từ chối: ' + JSON.stringify(a) + ' (pha ' + g.phase + ')');
  return n;
}
const totalCash = (g) => g.players.reduce((s, p) => s + p.cash, 0);
/** Dòng tiền với ngân hàng trong sự kiện của một thao tác (+ = ngân hàng chi ra). */
function bankFlow(ev) {
  let f = 0;
  for (const e of ev) {
    if (e.t !== 'pay') continue;
    if (e.from === -1) f += e.amt;
    if (e.to === -1) f -= e.amt;
  }
  return f;
}

/* ---------------- Bàn ---------------- */

test('bàn 28 ô: 4 góc, 7 nhóm 2–3 ô, 2 cảng, 2 xưởng, thuế, 3 ô thẻ', () => {
  eq(E.BOARD.length, 28);
  eq([0, 7, 14, 21].map((i) => E.BOARD[i].k), ['start', 'jail', 'rest', 'goto']);
  eq(E.GROUP_LOTS.length, 7);
  ok(E.GROUP_LOTS.every((l) => l.length >= 2 && l.length <= 3), 'nhóm 2–3 ô');
  eq([E.PORTS.length, E.UTILS.length], [2, 2]);
  eq(E.BOARD.filter((s) => s.k === 'tax').length, 1);
  eq(E.BOARD.filter((s) => s.k === 'chance' || s.k === 'fortune').length, 3);
  for (const sq of E.BOARD.filter((s) => s.k === 'lot')) ok(sq.rent.every((r, k) => k === 0 || r > sq.rent[k - 1]), sq.id);
});

test('xác suất dừng ô (cho máy Khó) cộng lại bằng 1, ô Bị bắt bằng 0, Trại giam cao nhất', () => {
  const s = E.LAND.reduce((a, b) => a + b, 0);
  ok(Math.abs(s - 1) < 1e-9, 'tổng ' + s);
  eq(E.LAND[E.GOTO], 0);
  ok(E.LAND[E.JAIL] === Math.max(...E.LAND));
});

/* ---------------- Tất định theo seed ---------------- */

test('cùng seed thì cùng xúc xắc và cùng thứ tự thẻ; khác seed thì khác', () => {
  const rolls = (seed) => {
    let g = E.newGame({ seed });
    const out = [g.decks.c.join(','), g.decks.f.join(',')];
    for (let k = 0; k < 12; k++) {
      while (g.phase !== 'roll' && g.phase !== 'jail') {
        let a = E.aiAction(g, 'easy');
        g = must(g, a);
      }
      g = must(g, { type: 'roll' });
      out.push(g.dice.join(''));
    }
    return out.join('|');
  };
  eq(rolls(42), rolls(42));
  ok(rolls(42) !== rolls(43));
  const g = E.newGame({ seed: 'abc' });
  eq(g.decks.c.slice().sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i));
  eq(g.decks.f.slice().sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i));
});

test('xúc xắc đều 1..6 (10 000 mặt)', () => {
  let g = setup((s) => { s.players[0].pos = 14; });
  const cnt = [0, 0, 0, 0, 0, 0, 0];
  for (let k = 0; k < 5000; k++) {
    const n = must(g, { type: 'roll' });
    cnt[n.dice[0]]++;
    cnt[n.dice[1]]++;
    g.rng = n.rng;
  }
  for (let v = 1; v <= 6; v++) ok(cnt[v] > 1500 && cnt[v] < 1850, 'mặt ' + v + ': ' + cnt[v]);
});

/* ---------------- Đi vòng, lương ---------------- */

test('gieo đi đúng số ô; qua hoặc dừng Xuất phát nhận lương 200', () => {
  let g = must(setup(), { type: 'roll', dice: [3, 4] });
  eq([g.players[0].pos, g.players[0].cash], [7, 1500]);
  g = must(setup((s) => { s.players[0].pos = 25; s.own[3] = 0; }), { type: 'roll', dice: [2, 4] });
  eq([g.players[0].pos, g.players[0].cash], [3, 1700]);
  ok(g.ev.some((e) => e.t === 'pay' && e.why === 'salary' && e.amt === 200 && e.to === 0 && e.from === -1));
  g = must(setup((s) => { s.players[0].pos = 24; }), { type: 'roll', dice: [1, 3] });
  eq([g.players[0].pos, g.players[0].cash], [0, 1700]);
});

test('kết thúc lượt chuyển sang người kế (bỏ qua người phá sản), hết ghế 3 thì sang vòng mới', () => {
  let g = must(setup((s) => { s.turn = 3; s.phase = 'end'; }), { type: 'end' });
  eq([g.turn, g.round, g.phase], [0, 2, 'roll']);
  g = must(setup((s) => { s.phase = 'end'; s.players[1].out = true; s.players[1].cash = 0; s.outOrder = [1]; }), { type: 'end' });
  eq(g.turn, 2);
  g = must(setup((s) => { s.phase = 'end'; s.players[1].pos = E.JAIL; s.players[1].jail = true; }), { type: 'end' });
  eq([g.turn, g.phase], [1, 'jail']);
});

/* ---------------- Mua / bỏ qua ---------------- */

test('đến đất trống: mua (trừ tiền, thành chủ) hoặc bỏ qua (đất vẫn trống, không đấu giá)', () => {
  const g = must(setup(), { type: 'roll', dice: [2, 3] });
  eq([g.phase, g.players[0].pos], ['buy', HUE]);
  ok(!E.act(g, { type: 'end' }), 'chưa quyết thì chưa được kết thúc lượt');
  const b = must(g, { type: 'buy' });
  eq([b.own[HUE], b.players[0].cash, b.phase], [0, 1400, 'end']);
  const s = must(g, { type: 'skip' });
  eq([s.own[HUE], s.players[0].cash, s.phase], [-1, 1500, 'end']);
  const poor = setup((st) => { st.phase = 'buy'; st.players[0].pos = HUE; st.players[0].cash = 99; });
  ok(!E.act(poor, { type: 'buy' }), 'không đủ tiền thì không mua được');
});

/* ---------------- Tiền thuê ---------------- */

test('tiền thuê đất: thường, đủ nhóm ×2, theo số nhà, cầm cố thì không thu', () => {
  const g = setup((s) => { s.own[HUE] = 1; });
  eq(E.rentOf(g, HUE), 8);
  g.own[HOIAN] = 1;
  eq(E.rentOf(g, HUE), 16);
  g.houses[HUE] = 3;
  g.houses[HOIAN] = 3;
  eq(E.rentOf(g, HUE), 300);
  g.houses[HUE] = 5;
  eq(E.rentOf(g, HUE), 600);
  eq(E.rentOf(setup((s) => { s.own[HUE] = 1; s.mort[HUE] = true; }), HUE), 0);
  const r = must(setup((s) => { s.own[HUE] = 1; s.own[HOIAN] = 1; }), { type: 'roll', dice: [1, 4] });
  eq([r.players[0].cash, r.players[1].cash, r.phase], [1484, 1516, 'end']);
  const own = must(setup((s) => { s.own[HUE] = 0; }), { type: 'roll', dice: [1, 4] });
  eq([own.players[0].cash, own.phase], [1500, 'end'], 'đất của mình không trả');
});

test('tiền thuê cảng theo số cảng, xưởng theo tổng xúc xắc × 4 / × 10', () => {
  const g = setup((s) => { s.own[SAIGON] = 2; });
  eq(E.rentOf(g, SAIGON), 50);
  g.own[HAIPHONG] = 2;
  eq(E.rentOf(g, SAIGON), 100);
  g.own[SOLAR] = 3;
  eq(E.rentOf(g, SOLAR, 9), 36);
  g.own[WATER] = 3;
  eq(E.rentOf(g, SOLAR, 9), 90);
  const r = must(setup((s) => { s.own[SOLAR] = 3; s.own[WATER] = 3; s.players[0].pos = 4; }), { type: 'roll', dice: [2, 3] });
  eq([r.players[0].pos, r.players[3].cash], [SOLAR, 1550]);
});

/* ---------------- Đôi, trại giam ---------------- */

test('gieo đôi được gieo tiếp; ba lần đôi liền thì vào trại giam', () => {
  let g = must(setup(), { type: 'roll', dice: [2, 2] }); // ô 4: thuế
  eq([g.phase, g.turn, g.players[0].cash], ['roll', 0, 1350], 'đôi: còn lượt gieo');
  g = must(g, { type: 'roll', dice: [1, 1] });
  if (g.phase === 'buy') g = must(g, { type: 'skip' });
  eq(g.phase, 'roll');
  g = must(g, { type: 'roll', dice: [3, 3] });
  eq([g.players[0].pos, g.players[0].jail, g.phase], [E.JAIL, true, 'end']);
});

test('ô Bị bắt đưa thẳng vào trại, không qua Xuất phát; vào trại thì hết lượt dù vừa đổ đôi', () => {
  const g = must(setup((s) => { s.players[0].pos = 15; }), { type: 'roll', dice: [3, 3] });
  eq([g.players[0].pos, g.players[0].jail, g.phase, g.players[0].cash], [E.JAIL, true, 'end', 1500]);
});

test('ra trại: trả 50, dùng thẻ, hoặc đổ đôi (đi luôn, không gieo tiếp)', () => {
  const jailed = (s) => { s.players[0].pos = E.JAIL; s.players[0].jail = true; s.phase = 'jail'; };
  let g = must(setup(jailed), { type: 'payJail' });
  eq([g.players[0].cash, g.players[0].jail, g.phase], [1450, false, 'roll']);
  g = setup((s) => { jailed(s); s.decks.c = s.decks.c.filter((x) => x !== 7); s.players[0].cards = ['c7']; });
  ok(!!E.fromJSON(E.toJSON(g)), 'ván có thẻ đang giữ hợp lệ');
  g = must(g, { type: 'useCard' });
  eq([g.players[0].cards, g.players[0].jail, g.decks.c[g.decks.c.length - 1]], [[], false, 7]);
  g = must(setup(jailed), { type: 'roll', dice: [4, 4] });
  eq([g.players[0].jail, g.players[0].pos], [false, E.JAIL + 8]);
  if (g.phase === 'buy') g = must(g, { type: 'skip' });
  eq(g.phase, 'end', 'đổ đôi ra trại không được gieo tiếp');
});

test('ra trại: hai lần không đôi thì ngồi lại, lần thứ ba buộc trả 50 rồi đi', () => {
  let g = setup((s) => { s.players[0].pos = E.JAIL; s.players[0].jail = true; s.phase = 'jail'; });
  g = must(g, { type: 'roll', dice: [1, 2] });
  eq([g.players[0].jail, g.players[0].tries, g.phase, g.players[0].pos], [true, 1, 'end', E.JAIL]);
  g.phase = 'jail';
  g = must(g, { type: 'roll', dice: [1, 3] });
  eq(g.players[0].tries, 2);
  g.phase = 'jail';
  g = must(g, { type: 'roll', dice: [2, 5] });
  eq([g.players[0].jail, g.players[0].pos, g.players[0].cash], [false, E.JAIL + 7, 1450]);
  // không đủ tiền phí: vào pha nợ, trả xong mới đi
  let p = setup((s) => { s.players[0].pos = E.JAIL; s.players[0].jail = true; s.players[0].tries = 2; s.phase = 'jail'; s.players[0].cash = 20; s.own[HUE] = 0; });
  p = must(p, { type: 'roll', dice: [1, 3] });
  eq([p.phase, p.debt.amt, p.players[0].pos], ['debt', 50, E.JAIL]);
  ok(!!E.fromJSON(E.toJSON(p)), 'nợ có bước đi tiếp lưu được');
  p = must(p, { type: 'mortgage', pos: HUE });
  p = must(p, { type: 'pay' });
  eq([p.players[0].pos, p.players[0].cash], [E.JAIL + 4, 20]);
});

/* ---------------- Xây nhà, cầm cố ---------------- */

test('xây nhà: phải đủ nhóm, không cầm cố, xây đều; tối đa 4 nhà + khách sạn; bán đều nửa giá', () => {
  let g = setup((s) => { s.own[HUE] = 0; });
  ok(!E.act(g, { type: 'build', pos: HUE }), 'chưa đủ nhóm');
  g.own[HOIAN] = 0;
  g = must(g, { type: 'build', pos: HUE });
  eq([g.houses[HUE], g.players[0].cash], [1, 1450]);
  ok(!E.act(g, { type: 'build', pos: HUE }), 'phải xây đều');
  for (let k = 0; k < 9; k++) g = must(g, { type: 'build', pos: k % 2 ? HUE : HOIAN });
  eq([g.houses[HUE], g.houses[HOIAN]], [5, 5]);
  ok(!E.act(g, { type: 'build', pos: HUE }), 'khách sạn là tối đa');
  eq(g.players[0].cash, 1000);
  ok(!E.act(g, { type: 'mortgage', pos: HUE }), 'nhóm còn nhà thì không cầm cố được');
  g = must(g, { type: 'sell', pos: HOIAN });
  ok(!E.act(g, { type: 'sell', pos: HOIAN }), 'phải bán đều');
  eq(g.players[0].cash, 1025);
  ok(!E.act(setup((s) => { s.own[HUE] = 0; s.own[HOIAN] = 0; s.mort[HOIAN] = true; }), { type: 'build', pos: HUE }), 'nhóm có ô cầm cố thì không xây');
  ok(!E.act(setup((s) => { s.own[HUE] = 0; s.own[HOIAN] = 0; s.phase = 'buy'; s.players[0].pos = 1; }), { type: 'build', pos: HUE }), 'đang quyết mua thì chưa xây');
});

test('cầm cố nhận nửa giá, chuộc trả nửa giá + 10%; không đụng đất người khác', () => {
  let g = must(setup((s) => { s.own[TOKYO] = 0; }), { type: 'mortgage', pos: TOKYO });
  eq([g.mort[TOKYO], g.players[0].cash], [true, 1620]);
  ok(!E.act(g, { type: 'mortgage', pos: TOKYO }));
  g = must(g, { type: 'unmortgage', pos: TOKYO });
  eq([g.mort[TOKYO], g.players[0].cash, E.unmortCost(TOKYO)], [false, 1485, 135], '240 × 0,55 = 132 → làm tròn 135');
  ok(!E.act(setup((s) => { s.own[TOKYO] = 1; }), { type: 'mortgage', pos: TOKYO }));
});

/* ---------------- Nợ, phá sản ---------------- */

test('nợ: phải xoay tiền nếu còn xoay được; không được phá sản khi đủ sức trả', () => {
  const g = must(setup((s) => {
    s.own[HUE] = 1; s.own[HOIAN] = 1; s.houses[HUE] = 5; s.houses[HOIAN] = 5;
    s.players[0].cash = 100; s.own[TOKYO] = 0; s.players[0].pos = 1;
  }), { type: 'roll', dice: [1, 3] });
  eq([g.phase, g.debt.amt, g.debt.to], ['debt', 600, 1]);
  ok(!E.act(g, { type: 'pay' }), 'chưa đủ tiền');
  ok(!E.act(g, { type: 'end' }));
  ok(!!E.act(g, { type: 'bankrupt' }), '100 + 120 (cầm cố Tokyo) < 600 → được phá sản');
  const rich = JSON.parse(JSON.stringify(g));
  rich.players[0].cash = 500;
  ok(!E.act(rich, { type: 'bankrupt' }), '500 + 120 ≥ 600: phải cầm cố');
  let r = must(rich, E.autoRaise(rich));
  eq(r.mort[TOKYO], true);
  eq(E.autoRaise(r), null, 'đủ tiền rồi thì không xoay nữa');
  r = must(r, { type: 'pay' });
  eq([r.players[0].cash, r.players[1].cash, r.phase], [20, 2100, 'end']);
});

test('phá sản vì nợ người chơi: tiền + nhà (bán nửa giá) + đất (giữ cầm cố) + thẻ về chủ nợ', () => {
  let g = must(setup((s) => {
    s.own[HUE] = 1; s.own[HOIAN] = 1; s.houses[HUE] = 5; s.houses[HOIAN] = 5;
    s.players[0].cash = 100; s.players[0].pos = 1;
    s.own[SAPA] = 0; s.own[HAGIANG] = 0; s.houses[SAPA] = 1; s.houses[HAGIANG] = 1;
    s.own[TOKYO] = 0; s.mort[TOKYO] = true;
    s.decks.f = s.decks.f.filter((x) => x !== 3); s.players[0].cards = ['f3'];
  }), { type: 'roll', dice: [1, 3] });
  const before = totalCash(g);
  g = must(g, { type: 'bankrupt' });
  eq(g.players[0].out, true);
  eq([g.own[SAPA], g.own[HAGIANG], g.own[TOKYO], g.mort[TOKYO], g.houses[SAPA]], [1, 1, 1, true, 0]);
  eq(g.players[1].cash, 1500 + 100 + 50, 'tiền mặt + 2 nhà bán nửa giá (25 × 2)');
  eq(g.players[1].cards, ['f3']);
  eq(totalCash(g) - before, bankFlow(g.ev));
  eq([g.turn, g.outOrder], [1, [0]]);
});

test('phá sản vì nợ ngân hàng: đất về ngân hàng thành đất trống, thẻ về chồng', () => {
  let g = must(setup((s) => {
    s.players[0].cash = 10; s.players[0].pos = 2; s.own[TOKYO] = 0; s.mort[TOKYO] = true;
    s.decks.c = s.decks.c.filter((x) => x !== 7); s.players[0].cards = ['c7'];
  }), { type: 'roll', dice: [1, 1] });
  eq([g.phase, g.debt.to, g.debt.amt], ['debt', -1, 150]);
  g = must(g, { type: 'bankrupt' });
  eq([g.own[TOKYO], g.mort[TOKYO], g.players[0].out, g.players[0].cash], [-1, false, true, 0]);
  ok(g.decks.c.indexOf(7) >= 0, 'thẻ ra trại về chồng');
  ok(E.fromJSON(E.toJSON(g)) !== null);
});

test('ghế người chơi (endSeat) phá sản thì kết thúc ván ngay; còn một người thì người đó về nhất', () => {
  let g = setup((s) => { s.players[0].cash = 10; s.players[0].pos = 2; }, { endSeat: 0 });
  g = must(must(g, { type: 'roll', dice: [1, 1] }), { type: 'bankrupt' });
  eq([g.over, g.phase, E.ranking(g)[3]], [true, 'over', 0]);
  let h = setup((s) => {
    for (const k of [1, 2]) { s.players[k].out = true; s.players[k].cash = 0; }
    s.outOrder = [2, 1];
    s.turn = 3; s.players[3].cash = 10; s.players[3].pos = 2;
  });
  h = must(must(h, { type: 'roll', dice: [1, 1] }), { type: 'bankrupt' });
  eq([h.over, E.ranking(h)], [true, [0, 3, 1, 2]]);
});

/* ---------------- Thẻ ---------------- */

test('thẻ: đi tới ô (qua Xuất phát có lương), lùi 3 ô, tới cảng gần nhất, vào trại, thẻ ra trại, nhận / trả, sửa nhà', () => {
  // đặt thẻ cần thử lên đầu chồng; Cơ hội ở ô 16 (từ ô 14 gieo 1+1), Vận may ở ô 12 (từ ô 8 gieo 1+3)
  const draw = (deck, id, fn) => setup((s) => {
    s.decks[deck] = [id].concat(s.decks[deck].filter((x) => x !== id));
    s.players[0].pos = deck === 'c' ? 14 : 8;
    if (fn) fn(s);
  });
  let g = must(draw('c', 0), { type: 'roll', dice: [1, 1] });
  eq([g.players[0].pos, g.players[0].cash], [0, 1700], 'về Xuất phát');
  g = must(draw('c', 5), { type: 'roll', dice: [1, 1] });
  eq([g.players[0].pos, g.phase], [PHUQUOC, 'buy'], 'lùi 3 ô');
  g = must(draw('c', 4), { type: 'roll', dice: [1, 1] });
  eq(g.players[0].pos, HAIPHONG, 'cảng gần nhất');
  g = must(draw('c', 6), { type: 'roll', dice: [1, 1] });
  eq([g.players[0].pos, g.players[0].jail], [E.JAIL, true]);
  g = must(draw('c', 7), { type: 'roll', dice: [1, 1] });
  eq([g.players[0].cards, g.decks.c.indexOf(7)], [['c7'], -1], 'thẻ ra trại được giữ');
  g = must(draw('c', 1), { type: 'roll', dice: [1, 1] });
  eq([g.players[0].pos, g.players[0].cash], [TOKYO, 1500], 'tới Tokyo, không qua Xuất phát');
  g = must(draw('c', 3, (s) => { s.players[0].pos = 0; }), { type: 'roll', dice: [1, 1] });
  eq(g.players[0].pos, 22, 'tới Paris');
  g = must(draw('c', 2), { type: 'roll', dice: [1, 1] });
  eq([g.players[0].pos, g.players[0].cash], [DALAT, 1700], 'tới Đà Lạt, qua Xuất phát');
  g = must(draw('c', 8, (s) => { s.own[HUE] = 0; s.own[HOIAN] = 0; s.houses[HUE] = 5; s.houses[HOIAN] = 4; }), { type: 'roll', dice: [1, 1] });
  eq(g.players[0].cash, 1500 - (90 + 4 * 20), 'sửa nhà: khách sạn 90 + 4 nhà × 20');
  g = must(draw('f', 0), { type: 'roll', dice: [1, 3] });
  eq(g.players[0].cash, 1600);
  g = must(draw('f', 7), { type: 'roll', dice: [1, 3] });
  eq(g.players[0].cash, 1420);
  eq(g.decks.f[g.decks.f.length - 1], 7, 'thẻ thường quay về đáy chồng');
  eq(g.card, { d: 'f', id: 7 });
  g = must(draw('f', 1, (s) => { s.players[0].cash = 10; }), { type: 'roll', dice: [1, 3] });
  eq([g.phase, g.debt.amt, g.debt.why], ['debt', 60, 'card'], 'thẻ phạt khi thiếu tiền thì vào pha nợ');
});

/* ---------------- Mua lại đất ---------------- */

test('mua lại đất: đồng ý thì chuyển đất + tiền; từ chối thì không đổi; tối đa 2 lần / lượt, mỗi ô 1 lần', () => {
  const g = setup((s) => { s.own[HUE] = 1; s.own[SAIGON] = 2; s.own[TOKYO] = 3; s.own[SAPA] = 2; s.own[HAGIANG] = 2; s.houses[SAPA] = 1; s.houses[HAGIANG] = 1; });
  ok(!E.act(g, { type: 'offer', pos: HUE, amt: 150 }), 'thiếu câu trả lời ok');
  const y = must(g, { type: 'offer', pos: HUE, amt: 150, ok: true });
  eq([y.own[HUE], y.players[0].cash, y.players[1].cash], [0, 1350, 1650]);
  const n = must(g, { type: 'offer', pos: HUE, amt: 150, ok: false });
  eq([n.own[HUE], n.players[0].cash, n.offers], [1, 1500, [HUE]]);
  ok(!E.act(n, { type: 'offer', pos: HUE, amt: 300, ok: true }), 'mỗi ô một lần mỗi lượt');
  const n2 = must(n, { type: 'offer', pos: SAIGON, amt: 300, ok: false });
  ok(!E.act(n2, { type: 'offer', pos: TOKYO, amt: 300, ok: true }), 'tối đa 2 lần / lượt');
  ok(!E.act(g, { type: 'offer', pos: SAPA, amt: 300, ok: true }), 'nhóm có nhà thì không mua lại');
  ok(!E.act(g, { type: 'offer', pos: HUE, amt: 2000, ok: true }), 'không trả quá tiền mặt');
  ok(!E.act(g, { type: 'offer', pos: DALAT, amt: 100, ok: true }), 'đất trống thì không mua lại');
  const nx = must(Object.assign({}, n2, { phase: 'end' }), { type: 'end' });
  eq(nx.offers, [], 'sang lượt mới thì đếm lại');
});

test('máy đánh giá đề nghị: Dễ chỉ nhìn giá, Vừa / Khó không bán rẻ ô giúp người mua đủ nhóm', () => {
  // Người chơi có Hội An, máy có Huế: mua Huế sẽ giúp người chơi đủ nhóm
  const g = setup((s) => { s.own[HUE] = 1; s.own[HOIAN] = 0; s.own[DALAT] = 2; });
  ok(E.aiAccept(g, HUE, 130, 'easy'), 'Dễ: 1,3 × giá là bán');
  ok(!E.aiAccept(g, HUE, 130, 'medium'), 'Vừa: ô hoàn thành nhóm cần ≥ 3 × giá');
  ok(E.aiAccept(g, HUE, 300, 'medium'));
  ok(!E.aiAccept(g, HUE, 130, 'hard'));
  ok(E.aiAccept(g, HUE, 5000, 'hard'), 'Khó: giá đủ cao thì bán');
  ok(E.aiAccept(g, DALAT, 230, 'medium') && !E.aiAccept(g, DALAT, 200, 'medium'), 'ô lẻ: Vừa bán từ 1,6 × giá');
  ok(E.valueToBuyer(g, 0, HUE) / 100 > E.valueToBuyer(g, 0, DALAT) / 140, 'người mua thấy ô hoàn thành nhóm đáng giá hơn');
  // máy Vừa / Khó đề nghị mua ô hoàn thành nhóm của mình; Dễ không đề nghị
  const want = setup((s) => { s.own[HUE] = 0; s.own[HOIAN] = 1; s.round = 3; });
  eq(E.aiAction(want, 'medium'), { type: 'offer', pos: HOIAN, amt: 240 });
  eq(E.aiAction(want, 'hard').type, 'offer');
  eq(E.aiAction(want, 'easy').type, 'roll');
});

/* ---------------- Kết thúc ván, tài sản ---------------- */

test('hết số vòng thì kết thúc; xếp hạng theo tài sản (đất cầm cố tính nửa giá, nhà theo giá xây)', () => {
  let g = setup((s) => {
    s.round = 3; s.turn = 3; s.phase = 'end';
    s.own[TOKYO] = 1; s.mort[TOKYO] = true; s.players[1].cash = 1400;
    s.own[HUE] = 2; s.own[HOIAN] = 2; s.houses[HUE] = 1; s.houses[HOIAN] = 1; s.players[2].cash = 1300;
    s.players[3].cash = 1501;
  }, { maxRounds: 3 });
  eq([E.netWorth(g, 1), E.netWorth(g, 2), E.netWorth(g, 3), E.netWorth(g, 0)], [1520, 1620, 1501, 1500]);
  g = must(g, { type: 'end' });
  eq([g.over, g.phase, g.round], [true, 'over', 3]);
  eq(E.ranking(g), [2, 1, 3, 0]);
  ok(!E.act(g, { type: 'roll' }), 'hết ván không thao tác được');
  eq(E.legalActions(g), []);
});

/* ---------------- Máy ---------------- */

/** Bot ngẫu nhiên: chọn bất kỳ thao tác hợp lệ (nghiêng về gieo / kết thúc để ván không kéo dài vô tận). */
function randomAction(g) {
  const acts = E.legalActions(g);
  const r = E.rng(g.rng ^ Math.imul(g.acts + 1, 2654435761));
  const main = acts.filter((a) => a.type === 'roll' || a.type === 'end' || a.type === 'pay' || a.type === 'bankrupt');
  if (main.length && r() < 0.5) return main[0];
  return acts[r.int(acts.length)];
}
/** Một ván toàn máy; check(g, a, next) chạy sau mỗi thao tác. Đề nghị mua đất thì hỏi máy chủ đất. */
function playGame(seed, levels, opts, check) {
  let g = E.newGame(Object.assign({ seed }, opts || {}));
  let n = 0;
  while (!g.over) {
    const lv = levels[g.turn];
    let a = lv === 'random' ? randomAction(g) : E.aiAction(g, lv);
    if (a && a.type === 'offer') {
      const ownerLv = levels[g.own[a.pos]];
      const yes = ownerLv === 'random' ? E.rng(g.rng ^ g.acts)() < 0.5 : E.aiAccept(g, a.pos, a.amt, ownerLv);
      a = Object.assign({}, a, { ok: yes });
    }
    const nx = E.act(g, a);
    if (!nx) throw new Error('seed ' + seed + ': máy ' + lv + ' đi nước không hợp lệ ' + JSON.stringify(a) + ' ở pha ' + g.phase);
    if (check) check(g, a, nx);
    g = nx;
    if (++n > 20000) throw new Error('seed ' + seed + ': ván không kết thúc');
  }
  return g;
}

test('máy luôn đi nước hợp lệ; tiền chỉ đổi qua ngân hàng; trạng thái giữa ván lưu / khôi phục được (120 ván toàn máy)', () => {
  const mixes = [['easy', 'medium', 'hard', 'easy'], ['hard', 'hard', 'hard', 'hard'], ['medium', 'easy', 'random', 'hard'], ['random', 'random', 'random', 'random']];
  let acts = 0;
  const phases = new Set();
  for (let s = 0; s < 120; s++) {
    const g = playGame(1000 + s, mixes[s % mixes.length], {}, (prev, a, nx) => {
      acts++;
      phases.add(prev.phase);
      if (a.type !== 'offer') {
        const legal = E.legalActions(prev);
        ok(legal.some((l) => l.type === a.type && (l.pos === undefined || l.pos === a.pos)), 'ngoài danh sách hợp lệ: ' + JSON.stringify(a));
      }
      eq(totalCash(nx) - totalCash(prev), bankFlow(nx.ev), 'bảo toàn tiền');
      ok(nx.players.every((p) => p.cash >= 0), 'tiền âm');
      if (acts % 5 === 0) ok(E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(nx)))), 'trạng thái hợp lệ không khôi phục được ở pha ' + nx.phase);
    });
    ok(g.round <= g.maxRounds);
    eq(E.ranking(g).slice().sort(), [0, 1, 2, 3]);
  }
  ok(acts > 10000, 'đủ nhiều thao tác: ' + acts);
  eq(Array.from(phases).sort(), ['buy', 'debt', 'end', 'jail', 'roll'], 'đi qua đủ các pha');
});

test('máy tất định: cùng seed và cùng mức thì cùng ván', () => {
  const lv = ['hard', 'medium', 'easy', 'hard'];
  eq(E.toJSON(playGame(77, lv)), E.toJSON(playGame(77, lv)));
});

test('máy Vừa / Khó giữ tiền dự trữ, xây khi đủ nhóm, xoay tiền bằng cách ít thiệt nhất', () => {
  const g = setup((s) => { s.own[HUE] = 0; s.own[HOIAN] = 0; });
  eq(E.aiAction(g, 'medium').type, 'build');
  eq(E.aiAction(g, 'hard').type, 'build');
  eq(E.aiAction(setup((s) => { s.own[HUE] = 0; s.own[HOIAN] = 0; s.players[0].cash = 160; }), 'medium').type, 'roll', 'Vừa giữ 150');
  const debt = setup((s) => {
    s.own[HUE] = 0; s.own[HOIAN] = 0; s.own[TOKYO] = 0; s.own[SAPA] = 0;
    s.phase = 'debt'; s.players[0].cash = 0; s.debt = { amt: 20, to: -1, why: 'tax', pos: 4, then: null };
  });
  eq(E.aiAction(debt, 'medium'), { type: 'mortgage', pos: SAPA });
  const hd = E.aiAction(debt, 'hard');
  ok(hd.type === 'mortgage' && hd.pos !== HUE && hd.pos !== HOIAN, 'Khó không cầm cố nhóm đủ bộ khi còn đất lẻ: ' + JSON.stringify(hd));
});

test('máy mua ô hoàn thành nhóm; Khó ngồi lại trong trại khi bàn đã nhiều nhà của đối thủ', () => {
  const g = setup((s) => { s.own[HUE] = 1; s.turn = 1; s.phase = 'buy'; s.players[1].pos = HOIAN; s.players[1].cash = 200; });
  eq(E.aiAction(g, 'medium').type, 'buy');
  eq(E.aiAction(g, 'hard').type, 'buy');
  const j = setup((s) => {
    s.phase = 'jail'; s.players[0].pos = E.JAIL; s.players[0].jail = true;
    for (const i of E.GROUP_LOTS[2]) { s.own[i] = 1; s.houses[i] = 5; }
  });
  eq(E.aiAction(j, 'hard').type, 'roll');
  const early = setup((s) => { s.phase = 'jail'; s.players[0].pos = E.JAIL; s.players[0].jail = true; });
  eq(E.aiAction(early, 'hard').type, 'payJail', 'đầu ván, bàn trống: trả tiền ra sớm để mua đất');
});

/* ---------------- Mức mạnh dần ---------------- */

/** Tỉ lệ mức `main` về nhất khi đấu 3 máy `other`, xoay ghế để khử lợi thế đi trước. */
function winRate(main, other, games, seed0) {
  let w = 0;
  for (let s = 0; s < games; s++) {
    const seat = s % 4;
    const lv = [other, other, other];
    lv.splice(seat, 0, main);
    if (E.ranking(playGame(seed0 + s * 13, lv))[0] === seat) w++;
  }
  return w / games;
}
const rates = {};
test('mức mạnh dần: Khó vs 3 Dễ thắng rõ hơn 25% (≥ 45%), Khó vs 3 Vừa ≥ 35%', () => {
  rates.hardEasy = winRate('hard', 'easy', 400, 50000);
  rates.hardMedium = winRate('hard', 'medium', 400, 60000);
  ok(rates.hardEasy >= 0.45, 'Khó vs Dễ ' + rates.hardEasy);
  ok(rates.hardMedium >= 0.35, 'Khó vs Vừa ' + rates.hardMedium);
});
test('mức mạnh dần: Vừa vs 3 bot ngẫu nhiên thắng phần lớn (≥ 60%), Vừa vs 3 Dễ ≥ 45%, Dễ vs 3 Vừa < 25%', () => {
  rates.mediumRandom = winRate('medium', 'random', 200, 70000);
  rates.mediumEasy = winRate('medium', 'easy', 400, 80000);
  rates.easyMedium = winRate('easy', 'medium', 400, 90000);
  ok(rates.mediumRandom >= 0.6, 'Vừa vs ngẫu nhiên ' + rates.mediumRandom);
  ok(rates.mediumEasy >= 0.45, 'Vừa vs Dễ ' + rates.mediumEasy);
  ok(rates.easyMedium < 0.25, 'Dễ vs Vừa ' + rates.easyMedium);
});

/* ---------------- Lưu / khôi phục ---------------- */

test('lưu rồi khôi phục giữ nguyên ván, chơi tiếp ra đúng kết quả', () => {
  let g = E.newGame({ seed: 5 });
  for (let k = 0; k < 150 && !g.over; k++) {
    let a = E.aiAction(g, 'medium');
    if (a.type === 'offer') a = Object.assign({}, a, { ok: false });
    g = must(g, a);
  }
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq(E.toJSON(back), E.toJSON(g));
  const step = (x) => {
    const a = E.aiAction(x, 'hard');
    return must(x, a.type === 'offer' ? Object.assign({}, a, { ok: true }) : a);
  };
  eq(E.toJSON(step(back)), E.toJSON(step(g)));
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(setup((s) => { s.own[HUE] = 1; s.own[HOIAN] = 1; s.houses[HUE] = 1; }));
  ok(E.fromJSON(JSON.parse(JSON.stringify(good))) !== null, 'mẫu hợp lệ');
  const bad = [
    null, 1, 'x', {}, [],
    (s) => { s.v = 2; },
    (s) => { s.round = 0; },
    (s) => { s.round = s.maxRounds + 1; },
    (s) => { s.turn = 4; },
    (s) => { s.phase = 'dance'; },
    (s) => { s.players.pop(); },
    (s) => { s.players[0].cash = -5; },
    (s) => { s.players[0].cash = 1.5; },
    (s) => { s.players[0].pos = 28; },
    (s) => { s.players[0].jail = true; }, // ở trại mà không đứng ô trại
    (s) => { s.own[0] = 1; }, // ô Xuất phát không có chủ
    (s) => { s.own[HUE] = 7; },
    (s) => { s.houses[HUE] = 3; }, // xây không đều
    (s) => { s.houses[SAPA] = 1; }, // nhà trên đất không đủ nhóm
    (s) => { s.mort[HUE] = true; }, // cầm cố trong nhóm có nhà
    (s) => { s.decks.c.push(0); }, // thẻ trùng
    (s) => { s.decks.f.pop(); }, // thiếu thẻ
    (s) => { s.players[1].cards = ['c0']; }, // giữ thẻ không phải thẻ ra trại
    (s) => { s.phase = 'debt'; }, // nợ mà không có khoản nợ
    (s) => { s.debt = { amt: 5, to: -1, why: 'tax', pos: -1, then: null }; }, // có khoản nợ ngoài pha nợ
    (s) => { s.phase = 'buy'; }, // ô Xuất phát không mua được
    (s) => { s.players[0].out = true; s.players[0].cash = 0; }, // người tới lượt đã phá sản
    (s) => { s.offers = [HUE, HOIAN, TOKYO]; },
    (s) => { s.asked = [[0, 0, 1, 10]]; },
    (s) => { s.over = true; },
    (s) => { s.dice = [0, 7]; },
    (s) => { delete s.mort; },
  ];
  for (const b of bad) {
    let raw = b;
    if (typeof b === 'function') {
      raw = JSON.parse(JSON.stringify(good));
      b(raw);
    }
    eq(E.fromJSON(raw), null, typeof b === 'function' ? b.toString() : JSON.stringify(b));
  }
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (Object.keys(rates).length) {
  const pct = (x) => (x === undefined ? '–' : Math.round(x * 100) + '%');
  console.log('Tỉ lệ về nhất (xoay ghế): Khó vs 3 Dễ ' + pct(rates.hardEasy) + ' · Khó vs 3 Vừa ' + pct(rates.hardMedium) +
    ' · Vừa vs 3 ngẫu nhiên ' + pct(rates.mediumRandom) + ' · Vừa vs 3 Dễ ' + pct(rates.mediumEasy) + ' · Dễ vs 3 Vừa ' + pct(rates.easyMedium));
}
if (failed) process.exit(1);
