/* =====================================================================
 * Cờ Đam - Engine
 * Chạy được trong trình duyệt (window.CoDam), trong Node (module.exports)
 * và trong Web Worker (self.CoDam). Không đụng tới DOM.
 *
 * Bàn 8x8, ô đánh số sq = hàng * 8 + cột, hàng 0 là hàng 1 (phía quân Đen),
 * cột 0 là cột a. Quân chỉ đứng trên ô tối: (hàng + cột) chẵn, a1 là ô tối.
 *
 *     8  . x . x . x . x        x: quân Trắng (bên 1), đi xuống
 *     7  x . x . x . x .
 *     6  . x . x . x . x
 *     ...
 *     3  o . o . o . o .        o: quân Đen (bên 0), đi lên, đi trước
 *     2  . o . o . o . o
 *     1  o . o . o . o .
 *        a b c d e f g h
 *
 *   - Giá trị ô: 0 trống, 1 / 2 quân thường / vua Đen, -1 / -2 quân thường / vua Trắng
 *   - Nước đi: { from, to, path: [ô đi, ô đáp 1, ô đáp 2...], caps: [ô bị ăn...],
 *     capVals, piece, promoteAt } . path xác định duy nhất một nước, nên ván được
 *     lưu dưới dạng danh sách path và dựng lại bằng fromMoves
 *   - Hai bộ luật: 'intl' (Quốc tế 8x8 kiểu Nga/Brazil, vua bay, quân thường ăn
 *     lùi, phong vua giữa chuỗi ăn thì ăn tiếp như vua) và 'english' (Mỹ/Anh)
 *   - AI: negamax cắt tỉa alpha-beta, bảng chuyển vị, đào sâu dần, tìm tiếp các
 *     nước ăn ở lá (ăn quân là bắt buộc nên không "đứng yên" được)
 *
 * Toàn bộ engine nằm trong hàm CoDamFactory để app.js dựng lại mã nguồn cho
 * Web Worker qua CoDam.factory.toString() (chạy được cả khi mở bằng file://).
 * ===================================================================== */
function CoDamFactory() {
  'use strict';

  const N = 64;
  const DRAW = 2; // winner = 2 khi hòa
  const TAKEN = 9; // đánh dấu tạm quân đã bị ăn trong lúc dò chuỗi ăn (vẫn chắn đường, không ăn lại được)
  const KING_DRAW_PLIES = 60; // 30 nước mỗi bên chỉ đi vua, không ăn quân: hòa
  const FILES = 'abcdefgh';

  // Hai bộ luật
  //   backCapture: quân thường được ăn lùi; flyingKing: vua đi / ăn xa
  //   promoteContinues: phong vua giữa chuỗi ăn thì ăn tiếp như vua (không thì hết lượt)
  const RULES = {
    intl: { id: 'intl', backCapture: true, flyingKing: true, promoteContinues: true, man: 100, king: 320 },
    english: { id: 'english', backCapture: false, flyingKing: false, promoteContinues: false, man: 100, king: 165 },
  };

  // Cấu hình các mức máy
  //   depth: độ sâu tối đa; noise: nhiễu cộng vào điểm từng nước ở gốc (đơn vị: 100 = một quân)
  //   timeMs: trần thời gian (đào sâu dần); maxNodes: trần số nút để không nghĩ quá lâu
  const LEVELS = {
    easy: { depth: 2, noise: 70 },
    medium: { depth: 6, noise: 0, maxNodes: 400000 },
    hard: { depth: 40, noise: 0, timeMs: 1500 },
  };

  const rowOf = (sq) => sq >> 3;
  const colOf = (sq) => sq & 7;
  const isDark = (sq) => ((sq >> 3) + (sq & 7)) % 2 === 0;
  const isKing = (v) => v === 2 || v === -2;
  const isOwn = (v, side) => (side === 0 ? v > 0 && v < 3 : v < 0);
  const sideOfPiece = (v) => (v > 0 ? 0 : 1);
  const manOf = (side) => (side === 0 ? 1 : -1);
  const kingOf = (side) => (side === 0 ? 2 : -2);
  const lastRow = (side) => (side === 0 ? 7 : 0);
  const rulesOf = (id) => RULES[id] || RULES.intl;

  // 4 hướng chéo: 0 lên trái, 1 lên phải (phía trước của Đen), 2 xuống trái, 3 xuống phải (phía trước của Trắng)
  const DIRS = [[1, -1], [1, 1], [-1, -1], [-1, 1]];
  const isFwd = (side, d) => (side === 0 ? d < 2 : d >= 2);
  // RAYS[ô][hướng]: các ô lần lượt theo đường chéo tới mép bàn
  const RAYS = [];
  const DARK = [];
  for (let sq = 0; sq < N; sq++) {
    RAYS[sq] = DIRS.map(([dr, dc]) => {
      const out = [];
      let r = rowOf(sq) + dr, c = colOf(sq) + dc;
      while (r >= 0 && r < 8 && c >= 0 && c < 8) { out.push(r * 8 + c); r += dr; c += dc; }
      return out;
    });
    if (isDark(sq)) DARK.push(sq);
  }

  /* ---------------- Ký hiệu ---------------- */
  const sqName = (sq) => FILES[colOf(sq)] + (rowOf(sq) + 1);
  function parseSq(t) {
    const c = FILES.indexOf(t[0]), r = +t.slice(1) - 1;
    return c >= 0 && r >= 0 && r < 8 ? r * 8 + c : -1;
  }
  // "c3-d4" (đi thường) hoặc "c3×e5×g7" (ăn quân)
  const moveText = (m) => m.path.map(sqName).join(m.caps.length ? '×' : '-');
  // Dựng path từ chuỗi ký hiệu (dùng trong test): "c3-d4", "c3x e5 x g7"...
  const pathOf = (txt) => txt.split(/[-x×:\s]+/).filter(Boolean).map(parseSq);

  /* ---------------- Băm Zobrist (nhận ra thế cờ lặp lại) ---------------- */
  // Hai số 32 bit ghép lại thành khóa ~53 bit; bảng sinh từ seed cố định nên
  // luồng chính và worker cho cùng một khóa
  const pieceIdx = (v) => (v === 1 ? 0 : v === 2 ? 1 : v === -1 ? 2 : 3);
  const Z1 = new Int32Array(4 * N), Z2 = new Int32Array(4 * N);
  let ZS1 = 0, ZS2 = 0;
  {
    const rng = mulberry32(0xc0da2026);
    const r32 = () => (rng() * 4294967296) | 0;
    for (let i = 0; i < 4 * N; i++) { Z1[i] = r32(); Z2[i] = r32(); }
    ZS1 = r32();
    ZS2 = r32();
  }
  const keyOf = (h1, h2) => (h1 >>> 0) * 2097152 + (h2 >>> 11);
  function hashBoard(board, turn) {
    let h1 = turn ? ZS1 : 0, h2 = turn ? ZS2 : 0;
    for (const sq of DARK) {
      const v = board[sq];
      if (v) { h1 ^= Z1[pieceIdx(v) * N + sq]; h2 ^= Z2[pieceIdx(v) * N + sq]; }
    }
    return [h1, h2];
  }

  /* ---------------- Trạng thái ván ---------------- */
  // board[64]; turn: bên đang đi (0 Đen, 1 Trắng); rules: 'intl' | 'english'
  // over / winner: -1 đang chơi, 0 / 1 bên thắng, 2 hòa
  // endReason: 'nopieces' | 'nomoves' | 'repetition' | 'kings'
  // quiet: số lượt liên tiếp chỉ đi vua, không ăn (đi quân thường hoặc ăn thì về 0)
  // hist: khóa thế cờ sau từng lượt (kể cả thế đầu) để xét lặp 3 lần
  function createState(opts) {
    opts = opts || {};
    const board = new Int8Array(N);
    for (const sq of DARK) {
      const r = rowOf(sq);
      if (r <= 2) board[sq] = 1;
      else if (r >= 5) board[sq] = -1;
    }
    const s = {
      board,
      turn: 0,
      rules: RULES[opts.rules] ? opts.rules : 'intl',
      over: false,
      winner: -1,
      endReason: '',
      ply: 0,
      quiet: 0,
      hist: [],
    };
    const [h1, h2] = hashBoard(board, 0);
    s.hist.push(keyOf(h1, h2));
    return s;
  }

  function cloneState(s) {
    return {
      board: s.board.slice(),
      turn: s.turn,
      rules: s.rules,
      over: s.over,
      winner: s.winner,
      endReason: s.endReason,
      ply: s.ply,
      quiet: s.quiet,
      hist: s.hist.slice(),
    };
  }

  // Số quân thường / vua của một bên
  function countPieces(board, side) {
    let men = 0, kings = 0;
    for (const sq of DARK) {
      const v = board[sq];
      if (!isOwn(v, side)) continue;
      if (isKing(v)) kings++; else men++;
    }
    return { men, kings, total: men + kings };
  }

  /* ---------------- Sinh nước đi ---------------- */
  // Ăn quân là bắt buộc: có nước ăn thì chỉ trả về các nước ăn (được chọn chuỗi
  // ăn bất kỳ, không bắt phải ăn nhiều nhất). Không thì trả về các nước đi thường.
  function genMoves(board, side, R) {
    const caps = genCaptures(board, side, R);
    return caps.length ? caps : genQuiet(board, side, R);
  }

  function genCaptures(board, side, R) {
    const out = [];
    for (const sq of DARK) {
      const v = board[sq];
      if (!isOwn(v, side)) continue;
      board[sq] = 0; // nhấc quân lên: ô xuất phát coi như trống (được đi qua / đáp lại)
      const st = { piece: v, path: [sq], caps: [], capVals: [], promoteAt: -1 };
      capDfs(board, side, R, sq, isKing(v), st, out);
      board[sq] = v;
    }
    return out;
  }

  // Dò mọi chuỗi ăn từ ô sq. Quân bị ăn được đánh dấu TAKEN tới hết chuỗi:
  // vẫn nằm trên bàn (chắn đường), không nhảy qua lần hai. Trả về true nếu ăn được ít nhất một quân.
  function capDfs(board, side, R, sq, king, st, out) {
    let any = false;
    const rays = RAYS[sq];
    for (let d = 0; d < 4; d++) {
      if (!king && !R.backCapture && !isFwd(side, d)) continue;
      const ray = rays[d];
      if (king && R.flyingKing) {
        // Vua bay: lướt qua các ô trống, gặp quân đối thủ mà sau đó có ô trống thì ăn
        let i = 0;
        while (i < ray.length && board[ray[i]] === 0) i++;
        if (i >= ray.length - 1) continue;
        const t = ray[i], tv = board[t];
        if (tv === TAKEN || !isOwn(tv, 1 - side) || board[ray[i + 1]] !== 0) continue;
        const lands = [];
        for (let j = i + 1; j < ray.length && board[ray[j]] === 0; j++) lands.push(ray[j]);
        any = true;
        board[t] = TAKEN;
        st.caps.push(t);
        st.capVals.push(tv);
        // Luật Nga: nếu từ một ô đáp nào đó ăn tiếp được thì bắt buộc đáp vào ô đó
        const cont = lands.filter((l) => canCaptureFrom(board, side, R, l, true));
        const list = cont.length ? cont : lands;
        for (const l of list) {
          st.path.push(l);
          if (!cont.length || !capDfs(board, side, R, l, true, st, out)) out.push(record(st));
          st.path.pop();
        }
        st.caps.pop();
        st.capVals.pop();
        board[t] = tv;
      } else {
        // Quân thường và vua đi ngắn: nhảy qua quân đối thủ đứng sát, đáp ô ngay sau
        if (ray.length < 2) continue;
        const t = ray[0], l = ray[1], tv = board[t];
        if (tv === TAKEN || !isOwn(tv, 1 - side) || board[l] !== 0) continue;
        any = true;
        board[t] = TAKEN;
        st.caps.push(t);
        st.capVals.push(tv);
        st.path.push(l);
        const promo = !king && rowOf(l) === lastRow(side);
        const prev = st.promoteAt;
        if (promo) st.promoteAt = st.path.length - 1;
        if (promo && !R.promoteContinues) out.push(record(st)); // Mỹ/Anh: lên vua là hết lượt
        else if (!capDfs(board, side, R, l, king || promo, st, out)) out.push(record(st));
        st.promoteAt = prev;
        st.path.pop();
        st.caps.pop();
        st.capVals.pop();
        board[t] = tv;
      }
    }
    return any;
  }

  // Từ ô sq (quân đang "đứng" ở đó, ô vẫn trống trên bàn) có ăn được quân nào không
  function canCaptureFrom(board, side, R, sq, king) {
    const rays = RAYS[sq];
    for (let d = 0; d < 4; d++) {
      if (!king && !R.backCapture && !isFwd(side, d)) continue;
      const ray = rays[d];
      let i = 0;
      if (king && R.flyingKing) while (i < ray.length && board[ray[i]] === 0) i++;
      if (i >= ray.length - 1) continue;
      const tv = board[ray[i]];
      if (tv !== TAKEN && isOwn(tv, 1 - side) && board[ray[i + 1]] === 0) return true;
    }
    return false;
  }

  function record(st) {
    return {
      from: st.path[0],
      to: st.path[st.path.length - 1],
      path: st.path.slice(),
      caps: st.caps.slice(),
      capVals: st.capVals.slice(),
      piece: st.piece,
      promoteAt: st.promoteAt,
    };
  }

  function genQuiet(board, side, R) {
    const out = [];
    for (const sq of DARK) {
      const v = board[sq];
      if (!isOwn(v, side)) continue;
      const king = isKing(v);
      for (let d = 0; d < 4; d++) {
        if (!king && !isFwd(side, d)) continue;
        const ray = RAYS[sq][d];
        const far = king && R.flyingKing ? ray.length : Math.min(1, ray.length);
        for (let i = 0; i < far && board[ray[i]] === 0; i++) {
          const to = ray[i];
          out.push({ from: sq, to, path: [sq, to], caps: [], capVals: [], piece: v, promoteAt: !king && rowOf(to) === lastRow(side) ? 1 : -1 });
        }
      }
    }
    return out;
  }

  // Đi / gỡ nước trên mảng bàn (dùng trong tìm kiếm của AI)
  function doMove(board, m) {
    board[m.from] = 0;
    for (let i = 0; i < m.caps.length; i++) board[m.caps[i]] = 0;
    board[m.to] = m.promoteAt >= 0 ? kingOf(sideOfPiece(m.piece)) : m.piece;
  }
  function undoMove(board, m) {
    board[m.to] = 0;
    for (let i = 0; i < m.caps.length; i++) board[m.caps[i]] = m.capVals[i];
    board[m.from] = m.piece;
  }

  /* ---------------- Luật ---------------- */
  function legalMoves(s) {
    return s.over ? [] : genMoves(s.board, s.turn, rulesOf(s.rules));
  }

  const samePath = (a, b) => {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };
  function findMove(s, path) {
    if (!Array.isArray(path)) return null;
    return legalMoves(s).find((m) => samePath(m.path, path)) || null;
  }
  const isLegal = (s, path) => !!findMove(s, path);

  // Số lần thế hiện tại (cùng bên đi) đã xuất hiện kể từ nước không đảo ngược được gần nhất
  function repetitions(s) {
    const h = s.hist, last = h.length - 1, key = h[last];
    let n = 0;
    for (let i = last; i >= 0 && i >= last - s.quiet; i -= 2) if (h[i] === key) n++;
    return n;
  }

  // Đi nước m (object lấy từ legalMoves) cho bên đang đi, sửa trực tiếp s.
  // ev (mảng, tùy chọn) nhận diễn biến để giao diện vẽ lại từng bước:
  //   { t: 'step', from, to, cap, promote }  quân trượt từ from tới to, cap: ô bị ăn (-1 nếu không), promote: lên vua ở bước này
  //   { t: 'remove', squares }              hết chuỗi ăn, nhấc các quân bị ăn khỏi bàn
  //   { t: 'over', reason, winner }
  function play(s, m, ev) {
    const side = s.turn;
    doMove(s.board, m);
    if (ev) {
      for (let i = 1; i < m.path.length; i++) {
        ev.push({ t: 'step', from: m.path[i - 1], to: m.path[i], cap: m.caps.length ? m.caps[i - 1] : -1, promote: m.promoteAt === i });
      }
      if (m.caps.length) ev.push({ t: 'remove', squares: m.caps.slice() });
    }
    s.quiet = m.caps.length || !isKing(m.piece) ? 0 : s.quiet + 1;
    s.turn = 1 - side;
    s.ply++;
    const [h1, h2] = hashBoard(s.board, s.turn);
    s.hist.push(keyOf(h1, h2));
    checkEnd(s, ev);
    return s;
  }

  // Hết ván: bên sắp đi hết quân / hết nước thì thua; lặp thế 3 lần hoặc
  // 60 lượt liền chỉ đi vua thì hòa
  function checkEnd(s, ev) {
    if (!genMoves(s.board, s.turn, rulesOf(s.rules)).length) {
      s.winner = 1 - s.turn;
      s.endReason = countPieces(s.board, s.turn).total === 0 ? 'nopieces' : 'nomoves';
    } else if (repetitions(s) >= 3) {
      s.winner = DRAW;
      s.endReason = 'repetition';
    } else if (s.quiet >= KING_DRAW_PLIES) {
      s.winner = DRAW;
      s.endReason = 'kings';
    } else return;
    s.over = true;
    if (ev) ev.push({ t: 'over', reason: s.endReason, winner: s.winner });
  }

  // Đi nước có path cho trước trên bản sao, ném lỗi nếu nước không hợp lệ
  function applyMove(s, path, ev) {
    const m = findMove(s, path);
    if (!m) throw new Error('Nước đi không hợp lệ: ' + path);
    return play(cloneState(s), m, ev);
  }

  // Dựng lại ván từ danh sách path (khôi phục ván đã lưu, Đi lại, Worker)
  function fromMoves(paths, opts) {
    const s = createState(opts);
    for (let i = 0; i < paths.length; i++) {
      const m = findMove(s, paths[i]);
      if (!m) throw new Error('Nước thứ ' + (i + 1) + ' không hợp lệ: ' + paths[i]);
      play(s, m);
    }
    return s;
  }

  // Dựng thế cờ tùy ý (test, hình minh họa): pieces = { 'c3': 'o', 'd4': 'X', ... }
  // o / O: quân thường / vua Đen; x / X: quân thường / vua Trắng
  function setup(pieces, opts) {
    opts = opts || {};
    const s = createState(opts);
    s.board.fill(0);
    for (const name in pieces) {
      const sq = parseSq(name);
      s.board[sq] = { o: 1, O: 2, x: -1, X: -2 }[pieces[name]];
    }
    s.turn = opts.turn === 1 ? 1 : 0;
    const [h1, h2] = hashBoard(s.board, s.turn);
    s.hist = [keyOf(h1, h2)];
    if (opts.check !== false) checkEnd(s);
    return s;
  }

  /* ---------------- Số ngẫu nhiên ---------------- */
  // mulberry32: PRNG có seed để test chạy lặp lại được
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const now = typeof performance !== 'undefined' && performance.now ? () => performance.now() : () => Date.now();

  /* ---------------- AI: đánh giá thế cờ ---------------- */
  const WIN = 100000;
  const MAX_PLY = 90;
  // Điểm vị trí theo hàng đã tiến (tính từ hàng xuất phát của bên đó)
  const ADV = [0, 2, 4, 7, 10, 14, 19, 0];
  const BACK = 9; // quân thường còn giữ hàng cuối: chặn đối thủ lên vua
  const CENTER = new Int8Array(N);
  const KING_POS = new Int8Array(N);
  for (const sq of DARK) {
    const r = rowOf(sq), c = colOf(sq);
    const inner = c >= 2 && c <= 5 && r >= 2 && r <= 5;
    CENTER[sq] = inner ? (c >= 3 && c <= 4 && r >= 3 && r <= 4 ? 7 : 4) : (c === 0 || c === 7 ? -2 : 0);
    // Vua đứng giữa hoặc trên đường chéo lớn a1–h8 kiểm soát nhiều đường hơn
    KING_POS[sq] = (inner ? 6 : 0) + (r === c ? 6 : 0) + (r === 0 || r === 7 || c === 0 || c === 7 ? -4 : 0);
  }

  // Điểm của thế cờ theo góc nhìn bên side (100 = một quân thường)
  // = vật chất (vua đáng giá hơn) + tiến quân + giữ trung tâm + giữ hàng cuối
  function evaluate(board, side, R) {
    let m0 = 0, m1 = 0, p0 = 0, p1 = 0, n0 = 0, n1 = 0;
    for (const sq of DARK) {
      const v = board[sq];
      if (!v) continue;
      const r = sq >> 3;
      if (v === 1) { m0 += R.man; p0 += ADV[r] + CENTER[sq] + (r === 0 ? BACK : 0); n0++; }
      else if (v === -1) { m1 += R.man; p1 += ADV[7 - r] + CENTER[sq] + (r === 7 ? BACK : 0); n1++; }
      else if (v === 2) { m0 += R.king; p0 += KING_POS[sq]; n0++; }
      else { m1 += R.king; p1 += KING_POS[sq]; n1++; }
    }
    let sc = m0 - m1 + p0 - p1;
    // Đang hơn quân thì đổi quân có lợi: bàn càng thưa, lợi thế càng lớn
    if (m0 !== m1) sc += ((m0 - m1) * (24 - n0 - n1)) / 40;
    return side === 0 ? sc : -sc;
  }

  /* ---------------- AI: tìm kiếm ---------------- */
  // Bảng chuyển vị dùng chung giữa các lần gọi (xóa đầu mỗi lần chọn nước)
  const TT_SIZE = 1 << 18, TT_MASK = TT_SIZE - 1;
  let tt = null;
  function ttReset() {
    if (!tt) tt = { key: new Int32Array(TT_SIZE), depth: new Int8Array(TT_SIZE), flag: new Int8Array(TT_SIZE), val: new Int32Array(TT_SIZE), move: new Int16Array(TT_SIZE) };
    else tt.flag.fill(0);
  }
  // Điểm thắng / thua lưu theo khoảng cách tới nút đang xét để đọc lại đúng ở độ cao khác
  const toTT = (v, ply) => (v > WIN - 1000 ? v + ply : v < -WIN + 1000 ? v - ply : v);
  const fromTT = (v, ply) => (v > WIN - 1000 ? v - ply : v < -WIN + 1000 ? v + ply : v);

  function Aborted() {}

  // ctx: { board, R, h1, h2, keys, quiet, stack, nodes, deadline, maxNodes }
  function make(ctx, m, side) {
    let h1 = ctx.h1 ^ ZS1, h2 = ctx.h2 ^ ZS2;
    let k = pieceIdx(m.piece) * N + m.from;
    h1 ^= Z1[k]; h2 ^= Z2[k];
    for (let i = 0; i < m.caps.length; i++) {
      k = pieceIdx(m.capVals[i]) * N + m.caps[i];
      h1 ^= Z1[k]; h2 ^= Z2[k];
    }
    const fin = m.promoteAt >= 0 ? kingOf(side) : m.piece;
    k = pieceIdx(fin) * N + m.to;
    h1 ^= Z1[k]; h2 ^= Z2[k];
    doMove(ctx.board, m);
    ctx.stack.push(ctx.h1, ctx.h2, ctx.quiet);
    ctx.h1 = h1;
    ctx.h2 = h2;
    ctx.quiet = m.caps.length || !isKing(m.piece) ? 0 : ctx.quiet + 1;
    ctx.keys.push(keyOf(h1, h2));
  }
  function unmake(ctx, m) {
    undoMove(ctx.board, m);
    ctx.keys.pop();
    ctx.quiet = ctx.stack.pop();
    ctx.h2 = ctx.stack.pop();
    ctx.h1 = ctx.stack.pop();
  }
  // Trong cây tìm kiếm, thế cờ lặp lại dù chỉ một lần cũng coi là hòa
  function isRepeat(ctx) {
    const k = ctx.keys, last = k.length - 1, key = k[last];
    for (let i = last - 2; i >= 0 && i >= last - ctx.quiet; i -= 2) if (k[i] === key) return true;
    return false;
  }

  // Thứ tự xét nước: nước tốt nhất đã lưu trước, rồi nước ăn nhiều, nước lên vua
  function orderMoves(moves, first) {
    const idx = moves.map((m, i) => i);
    if (moves.length < 2) return idx;
    const sc = moves.map((m, i) => (i === first ? 1e6 : 0) + m.caps.length * 100 + (m.promoteAt >= 0 ? 50 : 0) + m.capVals.reduce((a, v) => a + (isKing(v) ? 20 : 0), 0));
    return idx.sort((a, b) => sc[b] - sc[a]);
  }

  function negamax(ctx, side, depth, alpha, beta, ply) {
    if ((++ctx.nodes & 1023) === 0 && (now() >= ctx.deadline || ctx.nodes >= ctx.maxNodes)) throw new Aborted();
    if (ctx.quiet >= KING_DRAW_PLIES || isRepeat(ctx)) return 0;
    const moves = genMoves(ctx.board, side, ctx.R);
    if (!moves.length) return -WIN + ply; // hết quân / hết nước: thua
    const capture = moves[0].caps.length > 0;
    // Hết độ sâu: chỉ dừng ở thế "yên" (không có nước ăn bắt buộc)
    if ((depth <= 0 && !capture) || ply >= MAX_PLY) return evaluate(ctx.board, side, ctx.R);

    const a0 = alpha;
    let first = -1;
    const slot = ctx.h1 & TT_MASK;
    const useTT = depth > 0;
    if (useTT && tt.flag[slot] && tt.key[slot] === ctx.h2) {
      first = tt.move[slot] - 1;
      if (tt.depth[slot] >= depth) {
        const v = fromTT(tt.val[slot], ply), f = tt.flag[slot];
        if (f === 1) return v;
        if (f === 2 && v > alpha) alpha = v;
        else if (f === 3 && v < beta) beta = v;
        if (alpha >= beta) return v;
      }
    }

    const order = orderMoves(moves, first);
    let best = -Infinity, bestI = order[0];
    for (let k = 0; k < order.length; k++) {
      const m = moves[order[k]];
      make(ctx, m, side);
      const v = -negamax(ctx, 1 - side, depth - 1, -beta, -alpha, ply + 1);
      unmake(ctx, m);
      if (v > best) { best = v; bestI = order[k]; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    if (useTT) {
      tt.key[slot] = ctx.h2;
      tt.depth[slot] = Math.min(depth, 127);
      tt.flag[slot] = best <= a0 ? 3 : best >= beta ? 2 : 1;
      tt.val[slot] = toTT(best, ply);
      tt.move[slot] = bestI + 1;
    }
    return best;
  }

  // Tìm ở gốc với độ sâu cho trước, trả về điểm từng nước theo thứ tự order.
  // exact: tính đúng điểm mọi nước (cần khi cộng nhiễu); không thì nước kém hơn
  // nước tốt nhất chỉ cần biết là "không hơn" (cắt tỉa nhiều hơn).
  function searchRoot(ctx, side, moves, order, depth, exact) {
    const vals = [];
    let alpha = -Infinity;
    for (let k = 0; k < order.length; k++) {
      const m = moves[order[k]];
      make(ctx, m, side);
      const v = -negamax(ctx, 1 - side, depth - 1, -Infinity, exact ? Infinity : -alpha, 1);
      unmake(ctx, m);
      vals.push(v);
      if (v > alpha) alpha = v;
    }
    return vals;
  }

  // Chọn nước cho bên đang đi.
  // opts: { level, depth, timeMs, noise, seed, rng }
  // Trả về { move: path, depth, nodes, value, timeMs, reason }
  function chooseMove(s, opts) {
    opts = opts || {};
    const t0 = now();
    const lv = LEVELS[opts.level] || LEVELS.medium;
    const rng = opts.rng || (opts.seed != null ? mulberry32(opts.seed) : Math.random);
    const done = (move, reason, extra) => Object.assign({ move, reason, depth: 0, nodes: 0, value: null, timeMs: Math.round(now() - t0) }, extra || {});
    const moves = legalMoves(s);
    if (!moves.length) return done(null, 'over');
    if (moves.length === 1) return done(moves[0].path, 'only');

    const R = rulesOf(s.rules);
    const noise = opts.noise != null ? opts.noise : lv.noise;
    const timeMs = opts.timeMs != null ? opts.timeMs : lv.timeMs;
    const maxDepth = opts.depth != null ? opts.depth : lv.depth;
    const timed = timeMs != null;
    const ctx = {
      board: s.board.slice(),
      R,
      h1: 0,
      h2: 0,
      keys: s.hist.slice(),
      quiet: s.quiet,
      stack: [],
      nodes: 0,
      deadline: timed ? t0 + timeMs : Infinity,
      // Trần số nút: phòng khi đồng hồ không chạy (môi trường giả lập thời gian)
      maxNodes: timed ? Math.max(30000, timeMs * 2000) : lv.maxNodes || Infinity,
    };
    [ctx.h1, ctx.h2] = hashBoard(ctx.board, s.turn);
    ttReset();

    // Thứ tự ban đầu: theo đánh giá tĩnh sau một nước
    const stat = moves.map((m) => { doMove(ctx.board, m); const v = -evaluate(ctx.board, 1 - s.turn, R); undoMove(ctx.board, m); return v; });
    let order = moves.map((m, i) => i).sort((a, b) => stat[b] - stat[a]);
    let bestVals = null;
    let reached = 0;
    // Đào sâu dần: hết giờ / hết số nút giữa chừng thì dùng kết quả độ sâu trước
    for (let depth = 1; depth <= maxDepth; depth++) {
      let vals;
      try { vals = searchRoot(ctx, s.turn, moves, order, depth, noise > 0); } catch (e) {
        if (e instanceof Aborted) break;
        throw e;
      }
      bestVals = order.map((i, k) => ({ i, v: vals[k] }));
      reached = depth;
      order = bestVals.slice().sort((a, b) => b.v - a.v).map((x) => x.i);
      const top = Math.max(...vals);
      if (Math.abs(top) > WIN - 1000) break; // đã thấy thắng / thua chắc chắn
      if (timed && now() - t0 > timeMs * 0.5) break; // lần sau gần chắc chắn không kịp
    }
    if (!bestVals) return done(moves[order[0]].path, 'static', { nodes: ctx.nodes });
    // Chọn nước có điểm cao nhất (cộng nhiễu ở mức Dễ)
    let best = null, bestScore = -Infinity;
    for (const x of bestVals) {
      const sc = x.v + (noise > 0 ? rng() * noise : 0);
      if (sc > bestScore) { bestScore = sc; best = x; }
    }
    return done(moves[best.i].path, 'search', { depth: reached, nodes: ctx.nodes, value: best.v });
  }

  return {
    N, DRAW, KING_DRAW_PLIES, RULES, LEVELS, FILES, DARK, RAYS,
    rowOf, colOf, isDark, isKing, isOwn, sideOfPiece, manOf, kingOf, lastRow,
    sqName, parseSq, moveText, pathOf, samePath,
    createState, cloneState, setup, countPieces, genMoves, doMove, undoMove,
    legalMoves, findMove, isLegal, repetitions, play, applyMove, fromMoves,
    evaluate, chooseMove, mulberry32,
  };
}

(function (root) {
  const api = CoDamFactory();
  api.factory = CoDamFactory; // để app.js dựng Web Worker từ mã nguồn
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CoDam = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
