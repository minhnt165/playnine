// Kiểm thử engine và AI của Cờ Caro. Chạy: node test.js
'use strict';
const E = require('./engine.js');
const { X, O, idx } = E;

// ---- Tiện ích kiểm thử -------------------------------------------------------
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e)); }
}
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || ''} mong đợi ${b}, nhận ${a}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg || 'điều kiện sai'); };
const name = (i) => 'ABCDEFGHIJKLMNO'[E.colOf(i)] + (E.rowOf(i) + 1);
const names = (arr) => arr.map(name).join(', ');

// PRNG có seed để kết quả lặp lại được
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Dựng bàn cờ từ danh sách [hàng, cột, quân]
function boardOf(stones) {
  const b = E.createBoard();
  for (const [r, c, p] of stones) b[idx(r, c)] = p;
  return b;
}
// n quân liên tiếp từ (r, c) theo hướng (dr, dc)
function run(r, c, dr, dc, n, p) {
  const out = [];
  for (let k = 0; k < n; k++) out.push([r + k * dr, c + k * dc, p]);
  return out;
}
const ON = { blockedBoth: true, overline: true };
const OFF = { blockedBoth: false, overline: true };
const NO_OVER = { blockedBoth: true, overline: false };
const LEVELS = ['easy', 'medium', 'hard'];
const ai = (board, player, level, extra) => E.bestMove(board, player, Object.assign({ level, rules: ON, rng: mulberry32(7) }, extra));

console.log('Luật thắng');

test('năm quân thắng theo cả 4 hướng', () => {
  const dirs = [[0, 1, 'ngang'], [1, 0, 'dọc'], [1, 1, 'chéo xuống'], [1, -1, 'chéo ngược']];
  for (const [dr, dc, label] of dirs) {
    const stones = run(5, 7, dr, dc, 5, X);
    const b = boardOf(stones);
    for (const [r, c] of stones) {
      const line = E.checkWin(b, idx(r, c), ON);
      ok(line && line.length === 5, `${label}: đặt tại ${name(idx(r, c))} phải thắng`);
    }
  }
});

test('bốn quân chưa thắng, năm quân bị đứt quãng chưa thắng', () => {
  eq(E.checkWin(boardOf(run(7, 3, 0, 1, 4, X)), idx(7, 3), ON), null);
  const b = boardOf([...run(7, 2, 0, 1, 2, X), ...run(7, 5, 0, 1, 3, X)]);
  eq(E.checkWin(b, idx(7, 5), ON), null);
});

test('chặn hai đầu BẬT: năm quân bị chặn cả hai đầu không thắng', () => {
  const b = boardOf([[7, 2, O], ...run(7, 3, 0, 1, 5, X), [7, 8, O]]);
  eq(E.checkWin(b, idx(7, 5), ON), null);
  // Chéo cũng vậy
  const d = boardOf([[2, 2, O], ...run(3, 3, 1, 1, 5, X), [8, 8, O]]);
  eq(E.checkWin(d, idx(5, 5), ON), null);
});

test('chặn hai đầu BẬT: chỉ bị chặn một đầu vẫn thắng', () => {
  const b = boardOf([[7, 2, O], ...run(7, 3, 0, 1, 5, X)]);
  ok(E.checkWin(b, idx(7, 3), ON), 'chặn một đầu vẫn phải thắng');
});

test('chặn hai đầu BẬT: mép bàn không tính là quân chặn', () => {
  const b = boardOf([...run(7, 0, 0, 1, 5, X), [7, 5, O]]);
  ok(E.checkWin(b, idx(7, 0), ON), 'mép bàn + một quân chặn vẫn thắng');
});

test('chặn hai đầu TẮT: năm quân bị chặn hai đầu vẫn thắng', () => {
  const b = boardOf([[7, 2, O], ...run(7, 3, 0, 1, 5, X), [7, 8, O]]);
  ok(E.checkWin(b, idx(7, 5), OFF), 'tắt luật thì phải thắng');
});

test('sáu quân trở lên: BẬT thì thắng, TẮT thì không', () => {
  const b6 = boardOf(run(7, 2, 0, 1, 6, X));
  ok(E.checkWin(b6, idx(7, 4), ON), '6 quân, luật bật: thắng');
  eq(E.checkWin(b6, idx(7, 4), NO_OVER), null, '6 quân, luật tắt:');
  const b7 = boardOf(run(2, 2, 1, 1, 7, O));
  ok(E.checkWin(b7, idx(5, 5), ON), '7 quân chéo, luật bật: thắng');
  eq(E.checkWin(b7, idx(5, 5), NO_OVER), null, '7 quân chéo, luật tắt:');
  // Luật tắt nhưng đúng 5 quân vẫn thắng
  ok(E.checkWin(boardOf(run(7, 2, 0, 1, 5, X)), idx(7, 2), NO_OVER), 'đúng 5 quân vẫn thắng');
});

test('sáu quân bị chặn hai đầu (chặn hai đầu bật) không thắng', () => {
  const b = boardOf([[7, 1, O], ...run(7, 2, 0, 1, 6, X), [7, 8, O]]);
  eq(E.checkWin(b, idx(7, 4), ON), null);
});

test('replay dựng lại ván, phát hiện thắng và nước không hợp lệ', () => {
  // X: hàng 7 cột 3..7, O: hàng 9
  const moves = [];
  for (let k = 0; k < 5; k++) { moves.push(idx(7, 3 + k)); if (k < 4) moves.push(idx(9, 3 + k)); }
  const g = E.replay(moves, ON);
  ok(g.over && g.winner === X && g.line.length === 5, 'X phải thắng');
  let threw = false;
  try { E.replay([idx(7, 7), idx(7, 7)], ON); } catch (e) { threw = true; }
  ok(threw, 'đi trùng ô phải báo lỗi');
  eq(E.replay([idx(7, 7)], ON).toMove, O);
});

console.log('Mẫu thế cờ theo luật');

test('bốn bị chặn sẵn một đầu + chặn hai đầu: không còn là mối đe dọa', () => {
  // O X X X X _ O: điền vào sẽ thành năm bị chặn hai đầu
  const b = boardOf([[7, 2, O], ...run(7, 3, 0, 1, 4, X), [7, 8, O]]);
  eq(E.shapeAt(b, idx(7, 7), 0, X, ON), 'none', 'luật bật:');
  eq(E.shapeAt(b, idx(7, 7), 0, X, OFF), 'five', 'luật tắt:');
});

test('ba mở / bốn mở được nhận đúng', () => {
  const b = boardOf(run(7, 5, 0, 1, 3, X)); // _ X X X _
  eq(E.shapeAt(b, idx(7, 4), 0, X, ON), 'open4');
  const b2 = boardOf(run(7, 5, 0, 1, 2, X));
  eq(E.shapeAt(b2, idx(7, 7), 0, X, ON), 'open3');
});

console.log('AI');

test('AI luôn đi nước thắng ngay (cả 3 mức)', () => {
  // Máy (O) có bốn quân hàng 3; người (X) cũng có bốn, nhưng máy tới lượt nên thắng trước
  const b = boardOf([...run(3, 4, 0, 1, 4, O), [3, 3, X], ...run(10, 4, 0, 1, 4, X), [10, 3, O]]);
  for (const lv of LEVELS) {
    const r = ai(b, O, lv);
    eq(r.move, idx(3, 8), `mức ${lv}:`);
  }
});

test('AI thắng ngay theo đường chéo có ô trống ở giữa', () => {
  const b = boardOf([[2, 2, X], [3, 3, X], [5, 5, X], [6, 6, X], [7, 7, O], [1, 4, O], [9, 2, O]]);
  for (const lv of LEVELS) eq(ai(b, X, lv).move, idx(4, 4), `mức ${lv}:`);
});

test('AI chặn bốn của đối phương (cả 3 mức)', () => {
  // X có O X X X X _ : máy (O) phải chặn ô còn lại
  const b = boardOf([[6, 2, O], ...run(6, 3, 0, 1, 4, X), [9, 9, O]]);
  for (const lv of LEVELS) eq(ai(b, O, lv).move, idx(6, 7), `mức ${lv}:`);
  // Bốn đứt quãng X X _ X X theo cột
  const b2 = boardOf([[3, 10, X], [4, 10, X], [6, 10, X], [7, 10, X], [8, 8, O]]);
  for (const lv of LEVELS) eq(ai(b2, O, lv).move, idx(5, 10), `mức ${lv} (bốn đứt):`);
});

test('AI chặn bốn mở của đối phương (cả 3 mức)', () => {
  const b = boardOf([...run(7, 5, 1, 1, 4, X), [2, 2, O], [12, 2, O]]); // chéo (7,5)…(10,8)
  for (const lv of LEVELS) {
    const m = ai(b, O, lv).move;
    ok(m === idx(6, 4) || m === idx(11, 9), `mức ${lv}: phải chặn một đầu, nhận ${name(m)}`);
  }
});

test('AI chặn ba mở ở mức Vừa và Khó', () => {
  // _ _ X X X _ _ ở hàng 7, máy chỉ có vài quân rời rạc
  const b = boardOf([...run(7, 6, 0, 1, 3, X), [3, 3, O], [11, 12, O]]);
  const ends = [idx(7, 5), idx(7, 9)];
  for (const lv of ['medium', 'hard']) {
    const m = ai(b, O, lv).move;
    ok(ends.includes(m), `mức ${lv}: phải chặn đầu ba mở (${names(ends)}), nhận ${name(m)}`);
  }
  // Ba mở theo cột
  const b2 = boardOf([...run(4, 3, 1, 0, 3, X), [10, 10, O], [1, 13, O]]);
  const ends2 = [idx(3, 3), idx(7, 3)];
  for (const lv of ['medium', 'hard']) {
    const m = ai(b2, O, lv).move;
    ok(ends2.includes(m), `mức ${lv} (cột): phải chặn ${names(ends2)}, nhận ${name(m)}`);
  }
});

test('AI chặn ba mở đứt quãng (X X _ X) ở mức Khó', () => {
  const b = boardOf([[7, 5, X], [7, 6, X], [7, 8, X], [2, 12, O], [12, 2, O]]);
  const good = [idx(7, 4), idx(7, 7), idx(7, 9)];
  const m = ai(b, O, 'hard').move;
  ok(good.includes(m), `phải chặn ${names(good)}, nhận ${name(m)}`);
});

test('AI ưu tiên thắng hơn chặn', () => {
  // Máy (X) có ba mở + đối phương có ba mở; máy tới lượt: tạo bốn mở là thắng
  const b = boardOf([...run(4, 5, 0, 1, 3, X), ...run(10, 5, 0, 1, 3, O)]);
  const m = ai(b, X, 'hard').move;
  ok([idx(4, 4), idx(4, 8)].includes(m), `phải tạo bốn mở, nhận ${name(m)}`);
});

test('AI mức Khó tìm được chuỗi bốn liên tục (VCF)', () => {
  // Không có nước nào thắng ngay hay tạo bốn mở, nhưng có chuỗi: đi bốn → đối phương
  // buộc chặn → đi bốn tiếp thành hai đường bốn.
  const b = boardOf([
    [3, 1, O], [3, 2, X], [3, 3, X], [3, 4, X], // O X X X _ _ (hàng 3)
    [4, 5, X], [5, 5, X], [7, 5, O],            // _ X X _ O (cột 5)
    [6, 1, O], [6, 2, X], [6, 3, X], [6, 4, X], // O X X X _ _ (hàng 6)
    [11, 11, O], [12, 3, O],
  ]);
  const r = ai(b, X, 'hard');
  eq(r.reason, 'vcf', 'lý do:');
  ok(r.score >= 1e8, `phải thấy thắng, nhận điểm ${r.score}, nước ${name(r.move)}`);
  // Đi theo chuỗi đó thật sự thắng được trước mọi cách chặn của máy (mức Khó)
  const g = Int8Array.from(b);
  let p = X, won = false;
  for (let ply = 0; ply < 20 && !won; ply++) {
    const m = E.bestMove(g, p, { level: p === X ? 'hard' : 'hard', rules: ON, rng: mulberry32(ply) }).move;
    g[m] = p;
    if (E.checkWin(g, m, ON)) { eq(p, X, 'người thắng:'); won = true; }
    p = 3 - p;
  }
  ok(won, 'X phải thắng sau chuỗi bốn');
});

test('AI trả về nước hợp lệ trong giới hạn thời gian (mức Khó ~1.5s)', () => {
  // Thế cờ giữa ván dày quân, sinh ngẫu nhiên có seed, không bên nào có ba mở / bốn
  // (để máy phải tìm kiếm thật thay vì đi nước ép buộc)
  const rng = mulberry32(2024);
  const b = E.createBoard();
  const strong = new Set(['open3', 'four', 'open4', 'five']);
  let p = X, placed = 0, tries = 0;
  while (placed < 36 && tries++ < 20000) {
    const r = 3 + Math.floor(rng() * 9), c = 3 + Math.floor(rng() * 9), i = idx(r, c);
    if (b[i]) continue;
    let bad = false;
    for (let d = 0; d < 4 && !bad; d++) if (strong.has(E.shapeAt(b, i, d, p, ON))) bad = true;
    if (bad) continue;
    b[i] = p; p = 3 - p; placed++;
  }
  ok(placed === 36, 'không sinh được thế cờ thử');
  for (const lv of LEVELS) {
    const t0 = Date.now();
    const res = E.bestMove(b, X, { level: lv, rules: ON });
    const ms = Date.now() - t0;
    ok(res.move >= 0 && res.move < 225 && b[res.move] === 0, `mức ${lv}: nước không hợp lệ ${res.move}`);
    ok(ms <= E.LEVELS[lv].time + 400, `mức ${lv}: mất ${ms}ms, vượt giới hạn ${E.LEVELS[lv].time}ms`);
    console.log(`       mức ${lv}: ${name(res.move)} · ${ms}ms · độ sâu ${res.depth} · ${res.nodes} nút · ${res.reason}`);
  }
});

test('AI dừng đúng hạn khi hết giờ giữa chừng và vẫn trả nước hợp lệ', () => {
  // Thế cờ đầu ván yên tĩnh (không có nước ép buộc) để máy phải tìm kiếm
  const b = boardOf([[7, 7, X], [7, 8, O], [8, 7, X], [6, 9, O], [9, 9, X], [8, 9, O]]);
  for (const limit of [3, 15, 1500]) {
    const t0 = Date.now();
    const res = E.bestMove(b, X, { level: 'hard', rules: ON, timeLimit: limit });
    const ms = Date.now() - t0;
    ok(res.move >= 0 && b[res.move] === 0, `giới hạn ${limit}ms: nước không hợp lệ`);
    ok(ms <= limit + 150, `giới hạn ${limit}ms: mất ${ms}ms`);
    console.log(`       giới hạn ${limit}ms: ${name(res.move)} · ${ms}ms · độ sâu ${res.depth} · ${res.nodes} nút · ${res.reason}`);
  }
});

test('AI đi nước đầu ở giữa bàn và luôn đi được khi bàn gần đầy', () => {
  eq(E.bestMove(E.createBoard(), X, { level: 'hard' }).move, E.CENTER);
  // Bàn đầy trừ một ô (xếp xen kẽ để không có năm quân)
  const b = E.createBoard();
  for (let i = 0; i < 225; i++) b[i] = ((E.rowOf(i) >> 1) + E.colOf(i)) % 2 ? X : O;
  b[idx(14, 14)] = 0;
  eq(E.bestMove(b, O, { level: 'medium' }).move, idx(14, 14));
});

test('Máy vs máy: mọi nước hợp lệ, ván kết thúc đúng luật; Khó thắng Dễ', () => {
  for (const rules of [ON, NO_OVER]) {
    const moves = [];
    const b = E.createBoard();
    let p = X, winner = 0;
    const lv = { [X]: 'hard', [O]: 'easy' };
    const rng = mulberry32(99);
    while (moves.length < 225) {
      const r = E.bestMove(b, p, { level: lv[p], rules, timeLimit: 250, rng });
      ok(r.move >= 0 && b[r.move] === 0, `nước không hợp lệ ở lượt ${moves.length + 1}`);
      b[r.move] = p; moves.push(r.move);
      if (E.checkWin(b, r.move, rules)) { winner = p; break; }
      p = 3 - p;
    }
    const g = E.replay(moves, rules);
    eq(g.winner, winner, 'replay phải cho cùng kết quả:');
    eq(winner, X, `luật ${JSON.stringify(rules)}: Khó (X) phải thắng Dễ, ván dài ${moves.length} nước;`);
  }
});

console.log('Worker / nạp mã');

test('serve(): nhận lệnh kiểu Web Worker và trả kết quả', () => {
  let posted = null;
  const scope = { postMessage: (m) => { posted = m; } };
  E.serve(scope);
  const b = boardOf(run(7, 3, 0, 1, 4, X));
  scope.onmessage({ data: { id: 42, board: Array.from(b), player: X, opts: { level: 'easy', rules: ON } } });
  ok(posted && posted.id === 42, 'phải trả lại đúng id');
  ok([idx(7, 2), idx(7, 7)].includes(posted.res.move), 'phải thắng ngay');
});

test('factorySource dựng lại được engine (cách app tạo Blob worker)', () => {
  const vm = require('vm');
  const posted = [];
  const ctx = vm.createContext({ self: null, postMessage: (m) => posted.push(m) });
  ctx.self = ctx;
  vm.runInContext('var CaroEngine = (' + E.factorySource + ')();\nCaroEngine.serve(self);', ctx);
  ok(typeof ctx.CaroEngine.bestMove === 'function', 'thiếu bestMove');
  ctx.onmessage({ data: { id: 1, board: new Array(225).fill(0), player: 1, opts: { level: 'medium' } } });
  eq(posted[0].res.move, E.CENTER);
});

test('engine.js nạp được trong môi trường kiểu worker (importScripts)', () => {
  const vm = require('vm');
  const fs = require('fs');
  const posted = [];
  const ctx = vm.createContext({ importScripts() {}, postMessage: (m) => posted.push(m) });
  ctx.self = ctx;
  vm.runInContext(fs.readFileSync(require('path').join(__dirname, 'engine.js'), 'utf8'), ctx);
  ok(ctx.CaroEngine && typeof ctx.onmessage === 'function', 'engine phải tự gắn onmessage trong worker');
  ctx.onmessage({ data: { id: 3, board: new Array(225).fill(0), player: 1, opts: { level: 'easy', rng: undefined } } });
  ok(posted[0].res.move >= 0, 'phải trả nước');
});

console.log(`\n${passed} đạt, ${failed} lỗi`);
process.exit(failed ? 1 : 0);
