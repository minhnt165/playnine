/* Kiểm tra engine Ghép Hình: chạy `node test.js`
 * - Cỡ / mode, đề hằng ngày, tất định theo seed
 * - Hình học mảnh: tai / lõm khớp nhau giữa hai mảnh kề, mảnh viền phẳng ở cạnh ngoài, đường viền khép kín, nằm trong lề
 * - Thả mảnh: hút + khóa trong dung sai, không hút ngoài dung sai, mảnh đã khóa không kéo được
 * - Nhóm: hai mảnh kề đặt đúng tương đối thì ghép thành nhóm, nhóm đi cùng nhau, nhóm đặt gần chỗ đúng thì khóa cả nhóm
 * - Thắng khi đủ mảnh, ván nào cũng giải được (đặt từng mảnh / ghép nhóm rồi đặt)
 * - Lưu / khôi phục và từ chối dữ liệu hỏng
 * - Cảnh vẽ (scenes.js): đủ số cảnh, vẽ không lỗi, tất định theo seed (chạy trên ngữ cảnh canvas giả)
 * - Ngưỡng min_time_ms trong game.json
 */
const E = require('./engine.js');
const S = require('./scenes.js');
const manifest = require('./game.json');

// Dấu vân tay ván Dễ seed 1: [cảnh, thứ tự khay, cạnh của mảnh 5, đoạn đầu đường viền mảnh 5]
const FINGERPRINT = [6, '7,0,4,8,15,1,13,12,11,5,9,14,10,2,3,6', '-1,1,-1,1', 'C,0.2000,0.0396,0.4675,-0.1009,0.3964,0.0991'];

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
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-9);

const game = (mode, seed) => E.newGame({ mode: mode || 'easy', seed: seed == null ? 1 : seed });
const idOf = (g, c, r) => r * g.cols + c;
const where = (g, id) => (g.done[id] ? 'done' : g.tray.indexOf(id) >= 0 ? 'tray' : E.groupOf(g, id) ? 'loose' : '?');

/** Mọi điểm (đầu + điều khiển + cuối) của một cạnh, theo thứ tự đi, tọa độ tuyệt đối trên bàn. */
function pointsOf(range, path, c, r) {
  const [from, to] = range;
  const prev = path[from - 1];
  const out = [[prev[prev.length - 2] + c, prev[prev.length - 1] + r]];
  for (let k = from; k < to; k++) {
    const s = path[k];
    for (let j = 1; j < s.length; j += 2) out.push([s[j] + c, s[j + 1] + r]);
  }
  return out;
}
const round = (p) => [Math.round(p[0] * 1e9) / 1e9, Math.round(p[1] * 1e9) / 1e9];

/* ---------------- Cỡ, mode, seed ---------------- */

test('bốn mode: 4x4 / 6x6 / 8x8 và đề hằng ngày 6x6', () => {
  eq(E.MODES, ['easy', 'medium', 'hard', 'daily']);
  eq(E.MODES.map((m) => E.pieceCount(m)), [16, 36, 64, 36]);
  const g = game('hard', 5);
  eq([g.cols, g.rows, g.tray.length, g.loose.length, g.done.filter(Boolean).length, g.moves], [8, 8, 64, 0, 0, 0]);
});

test('ván mới: mọi mảnh ở khay, thứ tự khay là hoán vị xáo theo seed', () => {
  const g = game('medium', 77);
  eq(g.tray.slice().sort((a, b) => a - b), Array.from({ length: 36 }, (_, i) => i));
  ok(g.tray.some((id, i) => id !== i), 'khay phải được xáo');
  eq(E.isWon(g), false);
  eq(E.progress(g), 0);
});

test('tất định theo seed: cùng seed cùng cảnh, cùng khay, cùng đường cắt', () => {
  const a = game('hard', 123456);
  const b = game('hard', 123456);
  eq([a.scene, a.sceneSeed, a.tray], [b.scene, b.sceneSeed, b.tray]);
  for (let id = 0; id < 64; id++) eq(E.piecePath(a, id), E.piecePath(b, id));
  const c = game('hard', 123457);
  ok(JSON.stringify(E.piecePath(a, 9)) !== JSON.stringify(E.piecePath(c, 9)), 'seed khác phải cắt khác');
  ok(a.tray.join() !== c.tray.join(), 'seed khác phải xáo khác');
});

test('khóa dấu vân tay seed 1 (đổi thuật toán phải tăng VERSION)', () => {
  const g = game('easy', 1);
  const fp = [g.scene, g.tray.join(','), E.sides(g, 5).join(','), E.piecePath(g, 5)[1].map((v) => (typeof v === 'number' ? v.toFixed(4) : v)).join(',')];
  if (!FINGERPRINT) throw new Error('chưa khóa: ' + JSON.stringify(fp));
  eq(fp, FINGERPRINT);
});

test('đề hằng ngày: seed theo ngày, cỡ vừa, cả ngày chung một đề', () => {
  const a = E.newGame({ mode: 'daily', seed: 99, date: '2026-10-24' });
  const b = E.newGame({ mode: 'daily', seed: 12345, date: '2026-10-24' });
  const c = E.newGame({ mode: 'daily', seed: 99, date: '2026-10-25' });
  eq([a.cols, a.seed, a.scene, a.tray], [6, b.seed, b.scene, b.tray]);
  eq(a.seed, E.dailySeed('2026-10-24'));
  ok(a.seed !== c.seed, 'ngày khác đề khác');
});

test('cảnh chọn theo seed phủ đủ mọi cảnh', () => {
  const seen = new Set();
  for (let s = 0; s < 400; s++) seen.add(game('easy', s).scene);
  eq(seen.size, E.SCENES);
});

/* ---------------- Hình học mảnh ---------------- */

test('mảnh viền phẳng ở cạnh ngoài, mảnh trong có tai / lõm ở cả bốn cạnh', () => {
  [1, 2, 3].forEach((seed) => {
    const g = game('hard', seed);
    for (let id = 0; id < 64; id++) {
      const { c, r } = E.cellOf(g, id);
      const s = E.sides(g, id); // [trên, phải, dưới, trái]: 1 = tai lồi ra, -1 = lõm vào, 0 = phẳng
      eq([s[0] === 0, s[1] === 0, s[2] === 0, s[3] === 0], [r === 0, c === 7, r === 7, c === 0], 'mảnh ' + id);
      eq(E.isEdge(g, id), r === 0 || c === 0 || r === 7 || c === 7);
      // Cạnh viền là một đoạn thẳng nằm đúng trên mép ô
      const segs = E.sideSegments(g, id);
      [0, 1, 2, 3].forEach((k) => {
        if (s[k]) return;
        eq(segs[k][1] - segs[k][0], 1, 'cạnh viền một đoạn');
        eq(E.piecePath(g, id)[segs[k][0]][0], 'L');
      });
    }
  });
});

test('hai mảnh kề: một bên tai, một bên lõm', () => {
  for (let seed = 0; seed < 20; seed++) {
    const g = game('hard', seed);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const id = idOf(g, c, r);
        if (c < 7) eq(E.sides(g, id)[1], -E.sides(g, id + 1)[3], 'ngang ' + id);
        if (r < 7) eq(E.sides(g, id)[2], -E.sides(g, id + 8)[0], 'dọc ' + id);
      }
    }
  }
});

test('tai / lõm khớp đúng hình: cạnh chung của hai mảnh kề trùng nhau từng điểm (ngược chiều)', () => {
  [42, 43].forEach((seed) => {
    const g = game('hard', seed);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const id = idOf(g, c, r);
        const p = E.piecePath(g, id);
        const segs = E.sideSegments(g, id);
        if (c < 7) {
          const mine = pointsOf(segs[1], p, c, r).map(round);
          const theirs = pointsOf(E.sideSegments(g, id + 1)[3], E.piecePath(g, id + 1), c + 1, r).reverse().map(round);
          eq(mine, theirs, 'phải-trái ' + id);
        }
        if (r < 7) {
          const mine = pointsOf(segs[2], p, c, r).map(round);
          const theirs = pointsOf(E.sideSegments(g, id + 8)[0], E.piecePath(g, id + 8), c, r + 1).reverse().map(round);
          eq(mine, theirs, 'dưới-trên ' + id);
        }
      }
    }
  });
});

test('hướng tai trên hình khớp với sides(): tai lồi ra ngoài ô, lõm thụt vào trong ô', () => {
  const g = game('hard', 7);
  for (let id = 0; id < 64; id++) {
    const { c, r } = E.cellOf(g, id);
    const segs = E.sideSegments(g, id);
    const s = E.sides(g, id);
    const p = E.piecePath(g, id);
    [0, 1, 2, 3].forEach((k) => {
      if (!s[k]) return;
      // Điểm xa nhất khỏi đường thẳng của cạnh, dương = ra ngoài ô
      let far = 0;
      pointsOf(segs[k], p, c, r).forEach(([x, y]) => {
        const d = k === 0 ? r - y : k === 1 ? x - (c + 1) : k === 2 ? y - (r + 1) : c - x;
        if (Math.abs(d) > Math.abs(far)) far = d;
      });
      ok(Math.abs(far) > 0.2, 'tai đủ to ' + id + '/' + k);
      eq(Math.sign(far), s[k], 'mảnh ' + id + ' cạnh ' + k);
    });
  }
});

test('đường viền khép kín, nằm trong lề MARGIN quanh ô', () => {
  for (let seed = 0; seed < 30; seed++) {
    const g = game('hard', seed);
    for (let id = 0; id < 64; id++) {
      const p = E.piecePath(g, id);
      eq(p[0][0], 'M');
      const last = p[p.length - 1];
      ok(near(last[last.length - 2], p[0][1]) && near(last[last.length - 1], p[0][2]), 'khép kín ' + id);
      p.forEach((s) => {
        for (let k = 1; k < s.length; k++) ok(s[k] >= -E.MARGIN && s[k] <= 1 + E.MARGIN, 'trong lề ' + id + ': ' + s[k]);
      });
    }
  }
});

/* ---------------- Thả, hút, khóa ---------------- */

test('thả trong dung sai thì hút vào và khóa', () => {
  let g = game('easy', 3);
  const id = g.tray[0];
  const { c, r } = E.cellOf(g, id);
  const res = E.drop(g, id, c + E.SNAP * 0.7, r - E.SNAP * 0.7);
  eq(res.result, 'lock');
  eq(res.members, [id]);
  g = res.game;
  eq([where(g, id), g.moves, g.tray.length], ['done', 1, 15]);
  eq(E.progress(g), 1 / 16);
  eq(E.positionOf(g, id), { x: c, y: r });
});

test('thả ngoài dung sai thì không hút: mảnh nằm rời trên bàn đúng chỗ thả', () => {
  const g0 = game('easy', 3);
  const id = g0.tray[0];
  const { c, r } = E.cellOf(g0, id);
  const res = E.drop(g0, id, c + E.SNAP * 1.05, r);
  eq(res.result, 'move');
  const g = res.game;
  eq(where(g, id), 'loose');
  const grp = E.groupOf(g, id);
  ok(near(grp.dx, E.SNAP * 1.05) && near(grp.dy, 0), 'vị trí giữ nguyên');
  eq(g.done[id], false);
  // Đường chéo: mỗi trục trong dung sai nhưng khoảng cách vượt dung sai thì cũng không hút
  const d = E.SNAP * 0.8;
  eq(E.drop(g0, id, c + d, r + d).result, 'move');
});

test('ván cũ không bị sửa (hàm thuần)', () => {
  const g = game('easy', 3);
  const before = JSON.stringify(E.toJSON(g));
  E.drop(g, g.tray[0], 0, 0);
  E.drop(g, g.tray[1], 2.5, 1.5);
  eq(JSON.stringify(E.toJSON(g)), before);
});

test('mảnh đã khóa không kéo / thả được nữa', () => {
  let g = game('easy', 4);
  const id = g.tray[2];
  const { c, r } = E.cellOf(g, id);
  g = E.drop(g, id, c, r).game;
  const again = E.drop(g, id, c + 2, r + 2);
  eq(again.result, 'none');
  ok(again.game === g, 'trả về đúng ván cũ');
  ok(E.toTray(g, id, 0).game === g, 'không về khay');
});

test('dữ liệu thả vô lý bị bỏ qua (NaN, mảnh không tồn tại)', () => {
  const g = game('easy', 4);
  eq(E.drop(g, g.tray[0], NaN, 1).result, 'none');
  eq(E.drop(g, 99, 0, 0).result, 'none');
  eq(E.drop(g, -1, 0, 0).result, 'none');
  eq(E.drop(g, 1.5, 0, 0).result, 'none');
});

test('mảnh rời đem về khay; nhóm nhiều mảnh thì không', () => {
  let g = game('easy', 5);
  const a = idOf(g, 1, 1);
  const b = idOf(g, 2, 1);
  g = E.drop(g, a, 1 + 2, 1 + 2).game; // lệch (2, 2): rời
  eq(where(g, a), 'loose');
  let res = E.toTray(g, a, 0);
  eq(res.ok, true);
  eq([res.game.tray[0], where(res.game, a), res.game.moves, res.game.loose.length], [a, 'tray', 2, 0]);
  eq(E.toTray(g, a, 999).game.tray.slice(-1), [a], 'chỉ số quá lớn thì về cuối khay');
  g = E.drop(g, b, 2 + 2.05, 1 + 1.97).game; // kề phải, lệch gần như cùng → ghép
  eq(E.groupOf(g, a).members, [a, b]);
  res = E.toTray(g, a, 0);
  eq(res.ok, false);
  ok(res.game === g, 'nhóm không về khay');
});

/* ---------------- Nhóm ---------------- */

test('hai mảnh kề đặt đúng tương đối (trong dung sai) ghép thành nhóm, căn thẳng hàng', () => {
  let g = game('medium', 8);
  const a = idOf(g, 2, 3);
  const b = idOf(g, 2, 4); // ngay dưới a
  g = E.drop(g, a, 2 - 1.5, 3 - 2).game; // lệch (-1.5, -2)
  const res = E.drop(g, b, 2 - 1.5 + 0.2, 4 - 2 - 0.15);
  eq(res.result, 'merge');
  g = res.game;
  const grp = E.groupOf(g, a);
  eq(grp, E.groupOf(g, b));
  eq(grp.members, [a, b]);
  ok(near(grp.dx, -1.5) && near(grp.dy, -2), 'mảnh thả căn theo nhóm có sẵn');
  eq(g.loose.length, 1);
});

test('không ghép khi lệch tương đối vượt dung sai, hoặc khi không kề nhau', () => {
  let g = game('medium', 8);
  const a = idOf(g, 2, 3);
  const b = idOf(g, 2, 4);
  const far = idOf(g, 4, 3); // cách a một ô
  g = E.drop(g, a, 2 - 1.5, 3 - 2).game;
  eq(E.drop(g, b, 2 - 1.5 + E.SNAP * 1.1, 4 - 2).result, 'move');
  eq(E.drop(g, far, 4 - 1.5, 3 - 2).result, 'move'); // cùng độ lệch nhưng không kề
  const diag = idOf(g, 3, 4); // chéo góc không tính là kề
  eq(E.drop(g, diag, 3 - 1.5, 4 - 2).result, 'move');
});

test('nhóm di chuyển cùng nhau và giữ nguyên hình dạng', () => {
  let g = game('medium', 9);
  const a = idOf(g, 0, 0);
  const b = idOf(g, 1, 0);
  const c = idOf(g, 1, 1);
  g = E.drop(g, a, 3, 3).game;
  g = E.drop(g, b, 4, 3).game;
  g = E.drop(g, c, 4, 4).game;
  eq(E.groupOf(g, a).members, [a, b, c]);
  // Kéo nhóm bằng mảnh c tới chỗ mới (còn xa chỗ đúng)
  const res = E.drop(g, c, 2.5, 2.5);
  eq(res.result, 'move');
  eq(res.members, [a, b, c]);
  const grp = E.groupOf(res.game, b);
  ok(near(grp.dx, 1.5) && near(grp.dy, 1.5), 'cả nhóm dời theo');
  [a, b, c].forEach((id) => {
    const p = E.positionOf(res.game, id);
    const q = E.cellOf(res.game, id);
    ok(near(p.x - q.c, 1.5) && near(p.y - q.r, 1.5), 'mảnh ' + id);
  });
  // Nhóm vừa kéo nằm trên cùng
  eq(res.game.loose[res.game.loose.length - 1].members, [a, b, c]);
});

test('nhóm đặt gần chỗ đúng thì khóa cả nhóm', () => {
  let g = game('medium', 10);
  const a = idOf(g, 3, 3);
  const b = idOf(g, 4, 3);
  g = E.drop(g, a, 3 + 2, 3 + 1).game;
  g = E.drop(g, b, 4 + 2, 3 + 1).game;
  const res = E.drop(g, a, 3 + 0.1, 3 - 0.12);
  eq(res.result, 'lock');
  eq(res.members, [a, b]);
  eq([res.game.done[a], res.game.done[b], res.game.loose.length], [true, true, 0]);
});

test('một lần thả nối được nhiều nhóm (chuỗi ghép)', () => {
  let g = game('medium', 11);
  const L = idOf(g, 1, 2);
  const M = idOf(g, 2, 2);
  const R = idOf(g, 3, 2);
  g = E.drop(g, L, 1 + 1, 2 + 2).game;
  g = E.drop(g, R, 3 + 1.1, 2 + 1.9).game; // không kề L
  eq(g.loose.length, 2);
  const res = E.drop(g, M, 2 + 1.05, 2 + 2.05);
  eq(res.result, 'merge');
  eq(res.game.loose.length, 1);
  eq(E.groupOf(res.game, M).members, [L, M, R]);
});

test('mảnh kề mảnh đã khóa: thả gần đúng chỗ là khóa', () => {
  let g = game('easy', 12);
  const a = idOf(g, 0, 0);
  const b = idOf(g, 1, 0);
  g = E.drop(g, a, 0, 0).game;
  eq(E.drop(g, b, 1.1, 0.1).result, 'lock');
});

/* ---------------- Thắng, giải được ---------------- */

test('thắng khi đủ mảnh; thả sau khi thắng không đổi gì', () => {
  let g = game('easy', 13);
  g.tray.slice().forEach((id, i) => {
    eq(E.isWon(g), false);
    const { c, r } = E.cellOf(g, id);
    g = E.drop(g, id, c + 0.05, r).game;
    eq(E.progress(g), (i + 1) / 16);
  });
  eq(E.isWon(g), true);
  eq(g.moves, 16);
  ok(E.drop(g, 0, 3, 3).game === g, 'không đổi');
});

test('ván nào cũng giải được: ghép mọi mảnh thành một nhóm rồi đặt nhóm, mọi cỡ, nhiều seed', () => {
  E.MODES.forEach((mode) => {
    for (let seed = 0; seed < 15; seed++) {
      let g = E.newGame({ mode, seed, date: mode === 'daily' ? '2026-10-24' : null });
      const n = g.cols * g.rows;
      let st = seed * 7919 + 1;
      const rand = () => (st = (st * 1103515245 + 12345) % 2147483648) / 2147483648;
      const off = { x: 1.5 + rand(), y: 1.5 + rand() };
      // Thả mọi mảnh theo thứ tự khay ở cùng một độ lệch (± 0,1): mảnh kề nhau tự ghép thành nhóm
      g.tray.slice().forEach((id) => {
        const { c, r } = E.cellOf(g, id);
        g = E.drop(g, id, c + off.x + (rand() - 0.5) * 0.2, r + off.y + (rand() - 0.5) * 0.2).game;
      });
      eq(g.loose.length, 1, mode + ' seed ' + seed + ': một nhóm');
      eq(E.isWon(g), false);
      g = E.drop(g, 0, 0.1, -0.1).game;
      eq(E.isWon(g), true, mode + ' seed ' + seed);
      eq(g.done.filter(Boolean).length, n);
    }
  });
});

/* ---------------- Lưu / khôi phục ---------------- */

function midGame() {
  let g = game('medium', 21);
  g = E.drop(g, idOf(g, 0, 0), 0, 0).game;
  g = E.drop(g, idOf(g, 3, 3), 3 + 1.25, 3 + 0.5).game;
  g = E.drop(g, idOf(g, 4, 3), 4 + 1.25, 3 + 0.5).game;
  g = E.drop(g, idOf(g, 5, 5), 5 - 2.3333, 5 - 1.6667).game;
  return g;
}

test('lưu rồi khôi phục giữ nguyên ván (cả nhóm, khay, mảnh đã khóa)', () => {
  const g = midGame();
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  ok(back, 'khôi phục được');
  eq(E.toJSON(back), E.toJSON(g));
  eq([back.cols, back.scene, back.sceneSeed, back.moves], [6, g.scene, g.sceneSeed, 4]);
  eq(E.piecePath(back, 7), E.piecePath(g, 7));
  // Chơi tiếp được sau khi khôi phục
  const res = E.drop(back, idOf(back, 3, 3), 3, 3);
  eq(res.result, 'lock');
  eq(res.members.length, 2);
});

test('khôi phục đề hằng ngày', () => {
  let g = E.newGame({ mode: 'daily', seed: 0, date: '2026-01-02' });
  g = E.drop(g, g.tray[0], 9, 9).game;
  const back = E.fromJSON(JSON.parse(JSON.stringify(E.toJSON(g))));
  eq([back.mode, back.date, back.seed], ['daily', '2026-01-02', E.dailySeed('2026-01-02')]);
});

test('từ chối dữ liệu hỏng', () => {
  const good = E.toJSON(midGame());
  const bad = (patch) => Object.assign(JSON.parse(JSON.stringify(good)), patch);
  const cases = [
    null, 1, 'x', [], {},
    bad({ v: 99 }),
    bad({ mode: 'giant' }),
    bad({ seed: -1 }), bad({ seed: 1.5 }), bad({ seed: '21' }), bad({ seed: 2 ** 32 }),
    bad({ date: '2026-10-24' }), // ván thường không có ngày
    bad({ mode: 'daily', date: '2026-10-24' }), // seed không khớp ngày
    bad({ mode: 'daily', date: 'hôm nay', seed: E.dailySeed('hôm nay') }),
    bad({ moves: -1 }), bad({ moves: 'a' }),
    bad({ tray: 'abc' }), bad({ done: null }), bad({ loose: {} }),
    bad({ tray: good.tray.concat([good.tray[0]]) }), // trùng mảnh
    bad({ tray: good.tray.slice(1) }), // thiếu mảnh
    bad({ tray: good.tray.concat([36]) }), // mảnh ngoài phạm vi
    bad({ done: good.done.concat([1.5]) }),
    bad({ loose: good.loose.concat([{ dx: 1, dy: 1, m: [] }]) }), // nhóm rỗng
    bad({ loose: [Object.assign({}, good.loose[0], { dx: 'x' })].concat(good.loose.slice(1)) }),
    bad({ loose: [Object.assign({}, good.loose[0], { dy: 1e9 })].concat(good.loose.slice(1)) }),
    bad({ loose: [null].concat(good.loose.slice(1)) }),
  ];
  cases.forEach((raw, i) => eq(E.fromJSON(raw), null, 'ca ' + i + ': ' + JSON.stringify(raw).slice(0, 80)));
});

test('từ chối nhóm không liền (mảnh trong nhóm không nối nhau qua cạnh kề)', () => {
  let g = game('medium', 30);
  const a = idOf(g, 0, 3);
  const far = idOf(g, 4, 3);
  g = E.drop(g, a, 2, 5).game;
  const raw = JSON.parse(JSON.stringify(E.toJSON(g)));
  raw.tray = raw.tray.filter((id) => id !== far);
  raw.loose[0].m = [a, far];
  eq(E.fromJSON(raw), null);
  raw.loose[0].m = [a];
  raw.tray.push(far);
  ok(E.fromJSON(raw), 'bản sửa lại hợp lệ');
});

/* ---------------- Cảnh vẽ (scenes.js) ---------------- */

/** Ngữ cảnh canvas giả: ghi lại mọi lệnh vẽ (số làm tròn) để so tất định. */
function mockCtx() {
  const log = [];
  const num = (a) => (typeof a === 'number' ? String(Math.round(a * 100) / 100) : typeof a === 'string' ? a : '#');
  const rec = (name) => (...args) => {
    args.forEach((a) => {
      if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(name + ': số không hữu hạn');
    });
    log.push(name + '(' + args.map(num).join(',') + ')');
  };
  const grad = () => ({ addColorStop: rec('stop') });
  return new Proxy({}, {
    get(t, k) {
      if (k === 'log') return log;
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...a) => { rec(k)(...a); return grad(); };
      if (k in t) return t[k];
      return rec(String(k));
    },
    set(t, k, v) {
      t[k] = v;
      log.push(String(k) + '=' + num(v));
      return true;
    },
  });
}

test('scenes.js có đủ số cảnh như engine, mỗi cảnh có khóa tên riêng', () => {
  eq(S.COUNT, E.SCENES);
  eq(S.KEYS.length, E.SCENES);
  eq(new Set(S.KEYS).size, E.SCENES);
});

test('mọi cảnh vẽ không lỗi, đủ chi tiết, tất định theo seed; seed khác thì hình khác', () => {
  for (let i = 0; i < S.COUNT; i++) {
    const a = mockCtx();
    const b = mockCtx();
    const c = mockCtx();
    S.draw(a, i, 512, 1234);
    S.draw(b, i, 512, 1234);
    S.draw(c, i, 512, 98765);
    ok(a.log.length > 300, S.KEYS[i] + ': đủ chi tiết (' + a.log.length + ' lệnh)');
    ok(a.log.join(';') === b.log.join(';'), S.KEYS[i] + ': tất định');
    ok(a.log.join(';') !== c.log.join(';'), S.KEYS[i] + ': seed khác phải khác');
  }
});

/* ---------------- Ngưỡng điểm trên cổng ---------------- */

test('game.json: mỗi cỡ một mode, min_time_ms = số mảnh × 400 ms, điểm 3/5/8, hằng ngày 5', () => {
  const sv = manifest.server;
  eq(sv.metric, 'time_low');
  eq(sv.modes.map((m) => m.key), E.MODES);
  eq(sv.modes.map((m) => m.points), [3, 5, 8, 5]);
  eq(E.MIN_MS_PER_PIECE, 400);
  sv.modes.forEach((m) => eq(m.rules.min_time_ms, E.pieceCount(m.key) * E.MIN_MS_PER_PIECE, m.key));
  ok(!JSON.stringify(manifest).includes('TODO'), 'không còn TODO');
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
