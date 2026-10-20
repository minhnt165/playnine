/* =====================================================================
 * Cờ Vua - Engine
 * Chạy được trong trình duyệt (window.CoVua), trong Node (module.exports)
 * và trong Web Worker (self.CoVua). Không đụng tới DOM.
 *
 * Bàn cờ dùng kiểu 0x88: ô = hàng * 16 + cột, hàng 0 là hàng 1 (phía Trắng),
 * cột 0 là cột a. Ô nằm ngoài bàn khi (ô & 0x88) != 0, nên kiểm tra biên rất rẻ.
 *
 *     a8 = 112 ... h8 = 119
 *     ...
 *     a1 =   0 ... h1 =   7
 *
 *   - Quân: số có dấu, Trắng dương, Đen âm. 1 Tốt, 2 Mã, 3 Tượng, 4 Xe, 5 Hậu, 6 Vua
 *   - Nước đi mã hóa thành một số: từ | đến << 7 | phong cấp << 14 | cờ << 17
 *   - Luật FIDE đầy đủ: nhập thành (không đi qua ô bị chiếu), bắt tốt qua đường,
 *     phong cấp 4 loại quân, chiếu hết, hết nước đi (pat), lặp lại 3 lần, luật
 *     50 nước, không đủ quân chiếu hết
 *   - AI: alpha-beta (PVS) + bảng chuyển vị, sắp nước MVV-LVA + nước sát thủ,
 *     tìm kiếm tĩnh (quiescence), bảng điểm vị trí, đào sâu dần theo thời gian
 *
 * Toàn bộ engine nằm trong hàm CoVuaFactory để app.js dựng lại mã nguồn cho
 * Web Worker qua CoVua.factory.toString() (chạy được cả khi mở bằng file://).
 * ===================================================================== */
function CoVuaFactory() {
  'use strict';

  const WHITE = 0, BLACK = 1, DRAW = 2; // winner = 2 khi hòa
  const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  // Cờ của nước đi
  const F_CAP = 1, F_EP = 2, F_CASTLE = 4, F_DOUBLE = 8;
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const FILES = 'abcdefgh';
  const SAN_LETTER = ' PNBRQK'; // chữ của quân trong ký hiệu SAN
  const FEN_CHARS = ' pnbrqk';  // chữ của quân trong FEN / UCI (chữ thường)
  const VALUE = [0, 100, 320, 330, 500, 900, 20000]; // dùng cho MVV-LVA và delta pruning

  // Bước đi của từng loại quân trên bàn 0x88
  const N_OFF = [-33, -31, -18, -14, 14, 18, 31, 33];
  const K_OFF = [-17, -16, -15, -1, 1, 15, 16, 17];
  const B_OFF = [-17, -15, 15, 17];
  const R_OFF = [-16, -1, 1, 16];

  // Cấu hình các mức máy
  //   depth: độ sâu tối đa; depthMin: độ sâu thấp nhất (chọn ngẫu nhiên giữa depthMin..depth)
  //   noise: nhiễu (centipawn) cộng vào điểm từng nước ở gốc; timeMs: trần thời gian
  //   book: dùng sách khai cuộc nhỏ cho vài nước đầu
  const LEVELS = {
    easy: { label: 'Dễ', depthMin: 1, depth: 2, noise: 150, book: false },
    medium: { label: 'Vừa', depthMin: 3, depth: 4, noise: 0, timeMs: 1500, book: true },
    hard: { label: 'Khó', depth: 64, noise: 0, timeMs: 1500, book: true },
  };

  const fileOf = (sq) => sq & 7;
  const rankOf = (sq) => sq >> 4;
  const sqOf = (f, r) => r * 16 + f;
  const sqName = (sq) => FILES[sq & 7] + ((sq >> 4) + 1);
  function parseSq(str) {
    if (typeof str !== 'string' || str.length !== 2) return -1;
    const f = FILES.indexOf(str[0]), r = +str[1] - 1;
    return f >= 0 && r >= 0 && r < 8 ? sqOf(f, r) : -1;
  }
  const colorOf = (p) => (p > 0 ? WHITE : BLACK);
  const typeOf = (p) => (p < 0 ? -p : p);

  const encode = (from, to, flags, promo) => from | (to << 7) | ((promo || 0) << 14) | ((flags || 0) << 17);
  const fromOf = (m) => m & 127;
  const toOf = (m) => (m >> 7) & 127;
  const promoOf = (m) => (m >> 14) & 7;
  const flagsOf = (m) => m >>> 17;

  /* ---------------- Bảng điểm vị trí (piece-square tables) ---------------- */
  // Viết theo cách nhìn của Trắng, hàng 8 ở trên cùng (giống sách), mỗi bảng 64 số.
  // Điểm cuối = giá trị quân + điểm vị trí, trộn giữa trung cuộc (mg) và tàn cuộc (eg)
  // theo lượng quân còn trên bàn.
  const MG_VAL = [0, 100, 320, 330, 500, 900, 0];
  const EG_VAL = [0, 120, 300, 320, 520, 920, 0];
  const PHASE_W = [0, 0, 1, 1, 2, 4, 0]; // tổng đầu ván = 24
  const T_PAWN = [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ];
  // Tốt tàn cuộc: càng gần hàng phong cấp càng quý
  const T_PAWN_EG = [
    0, 0, 0, 0, 0, 0, 0, 0,
    90, 90, 90, 90, 90, 90, 90, 90,
    55, 55, 55, 55, 55, 55, 55, 55,
    30, 30, 30, 30, 30, 30, 30, 30,
    15, 15, 15, 15, 15, 15, 15, 15,
    5, 5, 5, 5, 5, 5, 5, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
  ];
  const T_KNIGHT = [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ];
  const T_BISHOP = [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ];
  const T_ROOK = [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ];
  const T_QUEEN = [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ];
  // Vua trung cuộc: nấp sau tốt ở góc; tàn cuộc: ra giữa bàn
  const T_KING = [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ];
  const T_KING_EG = [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50,
  ];
  const TABLES_MG = [null, T_PAWN, T_KNIGHT, T_BISHOP, T_ROOK, T_QUEEN, T_KING];
  const TABLES_EG = [null, T_PAWN_EG, T_KNIGHT, T_BISHOP, T_ROOK, T_QUEEN, T_KING_EG];
  // PSQ_MG[p + 6][ô]: điểm (có dấu, Trắng dương) của quân p đứng ở ô, đã cộng giá trị quân
  const PSQ_MG = [], PSQ_EG = [];
  for (let p = -6; p <= 6; p++) {
    const mg = new Int16Array(128), eg = new Int16Array(128);
    if (p) {
      const t = typeOf(p), sign = p > 0 ? 1 : -1;
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const i = p > 0 ? (7 - r) * 8 + f : r * 8 + f; // Đen: lật bảng theo hàng
          mg[sqOf(f, r)] = sign * (MG_VAL[t] + TABLES_MG[t][i]);
          eg[sqOf(f, r)] = sign * (EG_VAL[t] + TABLES_EG[t][i]);
        }
      }
    }
    PSQ_MG.push(mg);
    PSQ_EG.push(eg);
  }

  /* ---------------- Zobrist (khóa thế cờ) ---------------- */
  // Hai khóa 32 bit độc lập, ghép thành một số 53 bit để so sánh thế cờ lặp lại.
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
  const zr = mulberry32(20240607);
  const rnd32 = () => (zr() * 4294967296) | 0;
  const ZP1 = new Int32Array(13 * 128), ZP2 = new Int32Array(13 * 128);
  for (let i = 0; i < ZP1.length; i++) { ZP1[i] = rnd32(); ZP2[i] = rnd32(); }
  const ZC1 = new Int32Array(16), ZC2 = new Int32Array(16);
  for (let i = 0; i < 16; i++) { ZC1[i] = rnd32(); ZC2[i] = rnd32(); }
  const ZE1 = new Int32Array(8), ZE2 = new Int32Array(8);
  for (let i = 0; i < 8; i++) { ZE1[i] = rnd32(); ZE2[i] = rnd32(); }
  const ZS1 = rnd32(), ZS2 = rnd32();
  const keyOf = (s) => (s.h1 >>> 0) * 2097152 + (s.h2 & 0x1fffff);

  // Quyền nhập thành: 1 Trắng cánh vua, 2 Trắng cánh hậu, 4 Đen cánh vua, 8 Đen cánh hậu.
  // Quân rời hoặc bị ăn ở ô vua / ô xe gốc thì mất quyền tương ứng.
  const CASTLE_MASK = new Uint8Array(128).fill(15);
  CASTLE_MASK[0] = 13; CASTLE_MASK[4] = 12; CASTLE_MASK[7] = 14;
  CASTLE_MASK[112] = 7; CASTLE_MASK[116] = 3; CASTLE_MASK[119] = 11;

  /* ---------------- Trạng thái ván ---------------- */
  // b[128]: quân ở từng ô (0x88); turn: bên đi (0 Trắng, 1 Đen); castle: quyền nhập thành
  // ep: ô có thể bắt tốt qua đường (-1 nếu không); half: số nửa nước từ lần ăn quân / đi tốt
  // gần nhất (luật 50 nước); full: số nước đầy đủ (FEN); king[2]: ô của hai vua
  // h1, h2: khóa Zobrist; mg, eg, phase: điểm vị trí cộng dồn (Trắng trừ Đen); cnt[13]: số quân
  // stack: dữ liệu để gỡ nước; keys: khóa các thế đã qua (xét lặp lại)
  // history: biên bản ván (chỉ ghi khi đi bằng play), over / winner / reason / check: kết quả
  function emptyState() {
    return {
      b: new Int8Array(128), turn: WHITE, castle: 0, ep: -1, half: 0, full: 1,
      king: [-1, -1], h1: 0, h2: 0, mg: 0, eg: 0, phase: 0, cnt: new Int8Array(13),
      stack: [], keys: [], history: [],
      over: false, winner: -1, reason: '', check: false, fen0: START_FEN,
    };
  }

  // Đặt / nhấc quân, cập nhật luôn khóa, điểm vị trí, số quân và ô vua
  function put(s, sq, p) {
    const i = p + 6;
    s.b[sq] = p;
    s.h1 ^= ZP1[i * 128 + sq];
    s.h2 ^= ZP2[i * 128 + sq];
    s.mg += PSQ_MG[i][sq];
    s.eg += PSQ_EG[i][sq];
    s.phase += PHASE_W[typeOf(p)];
    s.cnt[i]++;
    if (p === KING) s.king[WHITE] = sq;
    else if (p === -KING) s.king[BLACK] = sq;
  }
  function remove(s, sq) {
    const p = s.b[sq], i = p + 6;
    s.b[sq] = 0;
    s.h1 ^= ZP1[i * 128 + sq];
    s.h2 ^= ZP2[i * 128 + sq];
    s.mg -= PSQ_MG[i][sq];
    s.eg -= PSQ_EG[i][sq];
    s.phase -= PHASE_W[typeOf(p)];
    s.cnt[i]--;
    return p;
  }

  function fromFEN(fen) {
    const parts = String(fen).trim().split(/\s+/);
    const s = emptyState();
    s.fen0 = parts.join(' ');
    let r = 7, f = 0;
    for (const ch of parts[0]) {
      if (ch === '/') { r--; f = 0; continue; }
      if (ch >= '1' && ch <= '8') { f += +ch; continue; }
      const t = FEN_CHARS.indexOf(ch.toLowerCase());
      if (t < 1 || f > 7 || r < 0) throw new Error('FEN không hợp lệ: ' + fen);
      put(s, sqOf(f, r), ch === ch.toLowerCase() ? -t : t);
      f++;
    }
    if (s.king[WHITE] < 0 || s.king[BLACK] < 0) throw new Error('FEN thiếu vua: ' + fen);
    s.turn = parts[1] === 'b' ? BLACK : WHITE;
    const c = parts[2] || '-';
    s.castle = (c.includes('K') ? 1 : 0) | (c.includes('Q') ? 2 : 0) | (c.includes('k') ? 4 : 0) | (c.includes('q') ? 8 : 0);
    s.ep = parts[3] && parts[3] !== '-' ? parseSq(parts[3]) : -1;
    s.half = parts[4] ? parseInt(parts[4], 10) || 0 : 0;
    s.full = parts[5] ? parseInt(parts[5], 10) || 1 : 1;
    s.h1 ^= ZC1[s.castle];
    s.h2 ^= ZC2[s.castle];
    if (s.ep >= 0) { s.h1 ^= ZE1[s.ep & 7]; s.h2 ^= ZE2[s.ep & 7]; }
    if (s.turn === BLACK) { s.h1 ^= ZS1; s.h2 ^= ZS2; }
    updateStatus(s);
    return s;
  }
  const createState = () => fromFEN(START_FEN);

  function toFEN(s) {
    let out = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = s.b[sqOf(f, r)];
        if (!p) { empty++; continue; }
        if (empty) { out += empty; empty = 0; }
        const ch = FEN_CHARS[typeOf(p)];
        out += p > 0 ? ch.toUpperCase() : ch;
      }
      if (empty) out += empty;
      if (r) out += '/';
    }
    let c = (s.castle & 1 ? 'K' : '') + (s.castle & 2 ? 'Q' : '') + (s.castle & 4 ? 'k' : '') + (s.castle & 8 ? 'q' : '');
    return `${out} ${s.turn === WHITE ? 'w' : 'b'} ${c || '-'} ${s.ep >= 0 ? sqName(s.ep) : '-'} ${s.half} ${s.full}`;
  }

  function cloneState(s) {
    return Object.assign({}, s, {
      b: s.b.slice(), king: s.king.slice(), cnt: s.cnt.slice(),
      stack: s.stack.slice(), keys: s.keys.slice(), history: s.history.slice(),
    });
  }

  /* ---------------- Ô bị tấn công, sinh nước ---------------- */
  // Ô sq có bị bên `by` tấn công không
  function attacked(s, sq, by) {
    const b = s.b;
    let t;
    if (by === WHITE) {
      t = sq - 15; if (!(t & 0x88) && b[t] === PAWN) return true;
      t = sq - 17; if (!(t & 0x88) && b[t] === PAWN) return true;
    } else {
      t = sq + 15; if (!(t & 0x88) && b[t] === -PAWN) return true;
      t = sq + 17; if (!(t & 0x88) && b[t] === -PAWN) return true;
    }
    const sg = by === WHITE ? 1 : -1;
    const kn = KNIGHT * sg, kg = KING * sg, bi = BISHOP * sg, rk = ROOK * sg, qu = QUEEN * sg;
    for (let i = 0; i < 8; i++) {
      t = sq + N_OFF[i];
      if (!(t & 0x88) && b[t] === kn) return true;
      t = sq + K_OFF[i];
      if (!(t & 0x88) && b[t] === kg) return true;
    }
    for (let i = 0; i < 4; i++) {
      const d = B_OFF[i];
      t = sq + d;
      while (!(t & 0x88)) {
        const p = b[t];
        if (p) { if (p === bi || p === qu) return true; break; }
        t += d;
      }
    }
    for (let i = 0; i < 4; i++) {
      const d = R_OFF[i];
      t = sq + d;
      while (!(t & 0x88)) {
        const p = b[t];
        if (p) { if (p === rk || p === qu) return true; break; }
        t += d;
      }
    }
    return false;
  }
  const inCheck = (s) => attacked(s, s.king[s.turn], s.turn ^ 1);

  // Sinh nước giả hợp lệ (chưa xét vua bị chiếu sau khi đi) vào mảng out.
  // capsOnly: chỉ nước ăn quân và phong Hậu (dùng cho tìm kiếm tĩnh).
  function genMoves(s, out, capsOnly) {
    const b = s.b, us = s.turn, sg = us === WHITE ? 1 : -1;
    const fwd = 16 * sg;
    const startRank = us === WHITE ? 1 : 6, lastRank = us === WHITE ? 7 : 0;
    for (let sq = 0; sq < 120; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq] * sg;
      if (p <= 0) continue;
      if (p === PAWN) {
        let t = sq + fwd;
        if (!(t & 0x88) && !b[t]) {
          if ((t >> 4) === lastRank) addPromos(out, sq, t, 0, capsOnly);
          else if (!capsOnly) {
            out.push(encode(sq, t, 0, 0));
            if ((sq >> 4) === startRank && !b[t + fwd]) out.push(encode(sq, t + fwd, F_DOUBLE, 0));
          }
        }
        for (let k = -1; k <= 1; k += 2) {
          t = sq + fwd + k;
          if (t & 0x88) continue;
          if (b[t] * sg < 0) {
            if ((t >> 4) === lastRank) addPromos(out, sq, t, F_CAP, capsOnly);
            else out.push(encode(sq, t, F_CAP, 0));
          } else if (t === s.ep && !b[t]) {
            out.push(encode(sq, t, F_CAP | F_EP, 0));
          }
        }
      } else if (p === KNIGHT || p === KING) {
        const offs = p === KNIGHT ? N_OFF : K_OFF;
        for (let i = 0; i < 8; i++) {
          const t = sq + offs[i];
          if (t & 0x88) continue;
          const q = b[t] * sg;
          if (q > 0) continue;
          if (q < 0) out.push(encode(sq, t, F_CAP, 0));
          else if (!capsOnly) out.push(encode(sq, t, 0, 0));
        }
      } else {
        const offs = p === BISHOP ? B_OFF : p === ROOK ? R_OFF : K_OFF; // Hậu đi như vua nhưng trượt xa
        for (let i = 0; i < offs.length; i++) {
          const d = offs[i];
          let t = sq + d;
          while (!(t & 0x88)) {
            const q = b[t] * sg;
            if (q > 0) break;
            if (q < 0) { out.push(encode(sq, t, F_CAP, 0)); break; }
            if (!capsOnly) out.push(encode(sq, t, 0, 0));
            t += d;
          }
        }
      }
    }
    if (!capsOnly) genCastles(s, out);
  }

  function addPromos(out, from, to, flags, capsOnly) {
    out.push(encode(from, to, flags, QUEEN));
    if (capsOnly) return;
    out.push(encode(from, to, flags, KNIGHT), encode(from, to, flags, ROOK), encode(from, to, flags, BISHOP));
  }

  // Nhập thành: còn quyền, xe còn ở góc, các ô giữa trống, vua không đang bị chiếu,
  // không đi qua ô bị tấn công và không dừng ở ô bị tấn công
  function genCastles(s, out) {
    const b = s.b, us = s.turn, them = us ^ 1;
    const k = us === WHITE ? 4 : 116, sg = us === WHITE ? 1 : -1;
    if (b[k] !== KING * sg) return;
    const kRight = us === WHITE ? 1 : 4, qRight = us === WHITE ? 2 : 8;
    if (!(s.castle & (kRight | qRight))) return;
    if (attacked(s, k, them)) return;
    if ((s.castle & kRight) && b[k + 3] === ROOK * sg && !b[k + 1] && !b[k + 2] &&
        !attacked(s, k + 1, them) && !attacked(s, k + 2, them)) {
      out.push(encode(k, k + 2, F_CASTLE, 0));
    }
    if ((s.castle & qRight) && b[k - 4] === ROOK * sg && !b[k - 1] && !b[k - 2] && !b[k - 3] &&
        !attacked(s, k - 1, them) && !attacked(s, k - 2, them)) {
      out.push(encode(k, k - 2, F_CASTLE, 0));
    }
  }

  /* ---------------- Đi / gỡ nước ---------------- */
  // Đi nước m (giả hợp lệ), sửa trực tiếp s. Gỡ lại bằng undo(s).
  function makeMove(s, m) {
    const from = m & 127, to = (m >> 7) & 127, fl = m >>> 17, pr = (m >> 14) & 7;
    const us = s.turn, sg = us === WHITE ? 1 : -1;
    s.stack.push({ m, cap: 0, castle: s.castle, ep: s.ep, half: s.half, h1: s.h1, h2: s.h2 });
    const rec = s.stack[s.stack.length - 1];
    s.keys.push(keyOf(s));
    if (s.ep >= 0) { s.h1 ^= ZE1[s.ep & 7]; s.h2 ^= ZE2[s.ep & 7]; }
    let cap = 0;
    if (fl & F_EP) cap = remove(s, to - 16 * sg);
    else if (s.b[to]) cap = remove(s, to);
    const p = remove(s, from);
    put(s, to, pr ? pr * sg : p);
    if (fl & F_CASTLE) {
      if (to > from) put(s, from + 1, remove(s, from + 3));
      else put(s, from - 1, remove(s, from - 4));
    }
    s.h1 ^= ZC1[s.castle]; s.h2 ^= ZC2[s.castle];
    s.castle &= CASTLE_MASK[from] & CASTLE_MASK[to];
    s.h1 ^= ZC1[s.castle]; s.h2 ^= ZC2[s.castle];
    s.ep = -1;
    if (fl & F_DOUBLE) {
      // Chỉ ghi ô bắt tốt qua đường khi có tốt đối phương đứng cạnh (thế cờ khác nhau thật)
      const ep = (from + to) >> 1, op = -PAWN * sg;
      if ((!((to - 1) & 0x88) && s.b[to - 1] === op) || (!((to + 1) & 0x88) && s.b[to + 1] === op)) {
        s.ep = ep;
        s.h1 ^= ZE1[ep & 7]; s.h2 ^= ZE2[ep & 7];
      }
    }
    s.half = typeOf(p) === PAWN || cap ? 0 : s.half + 1;
    if (us === BLACK) s.full++;
    s.turn = us ^ 1;
    s.h1 ^= ZS1; s.h2 ^= ZS2;
    rec.cap = cap;
  }

  // Bỏ lượt (chỉ dùng trong tìm kiếm: null move pruning)
  function makeNull(s) {
    s.stack.push({ m: 0, cap: 0, castle: s.castle, ep: s.ep, half: s.half, h1: s.h1, h2: s.h2 });
    s.keys.push(keyOf(s));
    if (s.ep >= 0) { s.h1 ^= ZE1[s.ep & 7]; s.h2 ^= ZE2[s.ep & 7]; s.ep = -1; }
    s.half++;
    s.turn ^= 1;
    s.h1 ^= ZS1; s.h2 ^= ZS2;
  }

  function undo(s) {
    const rec = s.stack.pop();
    s.keys.pop();
    const m = rec.m;
    s.turn ^= 1;
    if (m) {
      const from = m & 127, to = (m >> 7) & 127, fl = m >>> 17, pr = (m >> 14) & 7;
      const us = s.turn, sg = us === WHITE ? 1 : -1;
      if (us === BLACK) s.full--;
      const p = remove(s, to);
      put(s, from, pr ? PAWN * sg : p);
      if (fl & F_CASTLE) {
        if (to > from) put(s, from + 3, remove(s, from + 1));
        else put(s, from - 4, remove(s, from - 1));
      }
      if (rec.cap) put(s, fl & F_EP ? to - 16 * sg : to, rec.cap);
    }
    s.castle = rec.castle;
    s.ep = rec.ep;
    s.half = rec.half;
    s.h1 = rec.h1;
    s.h2 = rec.h2;
  }

  // Các nước hợp lệ của bên đang đi
  function legalMoves(s) {
    const moves = [], res = [];
    genMoves(s, moves, false);
    const us = s.turn;
    for (let i = 0; i < moves.length; i++) {
      makeMove(s, moves[i]);
      if (!attacked(s, s.king[us], us ^ 1)) res.push(moves[i]);
      undo(s);
    }
    return res;
  }
  function hasLegalMove(s) {
    const moves = [];
    genMoves(s, moves, false);
    const us = s.turn;
    for (let i = 0; i < moves.length; i++) {
      makeMove(s, moves[i]);
      const ok = !attacked(s, s.king[us], us ^ 1);
      undo(s);
      if (ok) return true;
    }
    return false;
  }

  // Đếm số thế cờ ở độ sâu d (kiểm tra bộ sinh nước)
  function perft(s, d) {
    if (d === 0) return 1;
    const moves = [];
    genMoves(s, moves, false);
    const us = s.turn;
    let n = 0;
    for (let i = 0; i < moves.length; i++) {
      makeMove(s, moves[i]);
      if (!attacked(s, s.king[us], us ^ 1)) n += d === 1 ? 1 : perft(s, d - 1);
      undo(s);
    }
    return n;
  }

  /* ---------------- Kết thúc ván ---------------- */
  // Không đủ quân để chiếu hết: Vua đấu Vua, Vua + 1 quân nhẹ đấu Vua,
  // hoặc chỉ còn Tượng và mọi Tượng cùng màu ô
  function insufficient(s) {
    const c = s.cnt;
    if (c[5] || c[7] || c[2] || c[10] || c[1] || c[11]) return false; // còn tốt, xe, hậu
    const minors = c[4] + c[3] + c[8] + c[9];
    if (minors <= 1) return true;
    if (c[4] || c[8]) return false; // còn mã cùng quân khác: vẫn có thể chiếu hết
    let colors = 0;
    for (let sq = 0; sq < 120; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      if (typeOf(s.b[sq]) === BISHOP) colors |= 1 << ((fileOf(sq) + rankOf(sq)) & 1);
    }
    return colors !== 3;
  }

  // Số lần thế hiện tại đã xuất hiện (tính cả lần này)
  function repetitions(s) {
    const k = keyOf(s), keys = s.keys;
    let n = 1;
    const stop = Math.max(0, keys.length - s.half);
    for (let i = keys.length - 2; i >= stop; i -= 2) if (keys[i] === k) n++;
    return n;
  }

  // Cập nhật s.over / winner / reason / check. Hòa do lặp lại 3 lần và luật 50 nước
  // được xử tự động (không cần đòi hòa). Chiếu hết ở nước thứ 100 vẫn tính là chiếu hết.
  function updateStatus(s) {
    s.check = inCheck(s);
    s.over = false;
    s.winner = -1;
    s.reason = '';
    if (!hasLegalMove(s)) {
      s.over = true;
      s.reason = s.check ? 'checkmate' : 'stalemate';
      s.winner = s.check ? s.turn ^ 1 : DRAW;
    } else if (insufficient(s)) { s.over = true; s.reason = 'material'; s.winner = DRAW; }
    else if (s.half >= 100) { s.over = true; s.reason = 'fifty'; s.winner = DRAW; }
    else if (repetitions(s) >= 3) { s.over = true; s.reason = 'threefold'; s.winner = DRAW; }
    return s;
  }

  /* ---------------- Ký hiệu nước đi ---------------- */
  function moveToUci(m) {
    const pr = promoOf(m);
    return sqName(fromOf(m)) + sqName(toOf(m)) + (pr ? FEN_CHARS[pr] : '');
  }
  function parseUci(s, str, legal) {
    legal = legal || legalMoves(s);
    for (let i = 0; i < legal.length; i++) if (moveToUci(legal[i]) === str) return legal[i];
    return 0;
  }

  // Ký hiệu SAN của nước m ở thế s (gọi trước khi đi): Nf3, exd5, O-O, e8=Q+, Qh4#
  function san(s, m, legal) {
    const from = fromOf(m), to = toOf(m), fl = flagsOf(m), pr = promoOf(m);
    const p = s.b[from], t = typeOf(p);
    let out;
    if (fl & F_CASTLE) out = to > from ? 'O-O' : 'O-O-O';
    else if (t === PAWN) {
      out = (fl & F_CAP ? FILES[fileOf(from)] + 'x' : '') + sqName(to);
      if (pr) out += '=' + SAN_LETTER[pr];
    } else {
      out = SAN_LETTER[t];
      legal = legal || legalMoves(s);
      // Hai quân cùng loại cùng tới được một ô: ghi thêm cột, hàng, hoặc cả hai
      let same = false, sameFile = false, sameRank = false;
      for (let i = 0; i < legal.length; i++) {
        const o = legal[i], of = fromOf(o);
        if (o === m || toOf(o) !== to || of === from || s.b[of] !== p) continue;
        same = true;
        if (fileOf(of) === fileOf(from)) sameFile = true;
        if (rankOf(of) === rankOf(from)) sameRank = true;
      }
      if (same) {
        if (!sameFile) out += FILES[fileOf(from)];
        else if (!sameRank) out += rankOf(from) + 1;
        else out += sqName(from);
      }
      if (fl & F_CAP) out += 'x';
      out += sqName(to);
    }
    makeMove(s, m);
    if (inCheck(s)) out += hasLegalMove(s) ? '+' : '#';
    undo(s);
    return out;
  }

  /* ---------------- Đi nước trong ván thật ---------------- */
  // Đi nước m (phải hợp lệ) và ghi biên bản. Trả về bản ghi:
  // { uci, san, color, piece, captured, from, to, flags, promo, check, mate }
  function play(s, m) {
    const legal = legalMoves(s);
    if (s.over || legal.indexOf(m) < 0) throw new Error('Nước đi không hợp lệ: ' + (m ? moveToUci(m) : m));
    const from = fromOf(m), to = toOf(m), fl = flagsOf(m);
    const rec = {
      uci: moveToUci(m), san: san(s, m, legal), color: s.turn, piece: s.b[from],
      captured: fl & F_EP ? -s.b[from] : s.b[to], from, to, flags: fl, promo: promoOf(m),
      check: false, mate: false,
    };
    makeMove(s, m);
    // FIDE: ô bắt tốt qua đường chỉ làm thế cờ khác đi khi nước bắt đó hợp lệ thật
    if (s.ep >= 0) {
      const caps = [];
      genMoves(s, caps, true);
      let can = false;
      const us = s.turn;
      for (let i = 0; i < caps.length && !can; i++) {
        if (!(flagsOf(caps[i]) & F_EP)) continue;
        makeMove(s, caps[i]);
        can = !attacked(s, s.king[us], us ^ 1);
        undo(s);
      }
      if (!can) { s.h1 ^= ZE1[s.ep & 7]; s.h2 ^= ZE2[s.ep & 7]; s.ep = -1; }
    }
    updateStatus(s);
    rec.check = s.check;
    rec.mate = s.reason === 'checkmate';
    s.history.push(rec);
    return rec;
  }

  // Đi nước m trên bản sao, ném lỗi nếu nước không hợp lệ
  function applyMove(s, m) {
    const c = cloneState(s);
    play(c, m);
    return c;
  }

  // Dựng lại ván từ danh sách nước UCI (khôi phục ván đã lưu, Đi lại, Worker)
  function fromMoves(list, fen) {
    const s = fen ? fromFEN(fen) : createState();
    for (let i = 0; i < list.length; i++) {
      const m = s.over ? 0 : parseUci(s, list[i]);
      if (!m) throw new Error('Nước thứ ' + (i + 1) + ' không hợp lệ: ' + list[i]);
      play(s, m);
    }
    return s;
  }

  // Chênh lệch quân theo thang 1-3-3-5-9 (Trắng trừ Đen), để hiện "+3" trên thẻ người chơi
  const POINTS = [0, 1, 3, 3, 5, 9, 0];
  function material(s) {
    let v = 0;
    for (let t = 1; t <= 5; t++) v += POINTS[t] * (s.cnt[t + 6] - s.cnt[6 - t]);
    return v;
  }

  /* ---------------- Đánh giá thế cờ ---------------- */
  // Điểm theo góc nhìn bên đang đi (centipawn)
  function evaluate(s) {
    const ph = s.phase > 24 ? 24 : s.phase;
    let v = ((s.mg * ph + s.eg * (24 - ph)) / 24) | 0;
    const c = s.cnt;
    if (c[9] >= 2) v += 30; // cặp Tượng
    if (c[3] >= 2) v -= 30;
    // Tàn cuộc chênh lệch mà bên yếu hết tốt: dồn vua bên yếu ra mép, kéo vua bên mạnh lại gần
    if (ph <= 6 && (v > 250 || v < -250)) {
      const strong = v > 0 ? WHITE : BLACK;
      if (!c[strong === WHITE ? 5 : 7]) {
        const ks = s.king[strong], kw = s.king[strong ^ 1];
        const fw = kw & 7, rw = kw >> 4;
        const edge = Math.max(3 - fw, fw - 4) + Math.max(3 - rw, rw - 4);
        const dist = Math.abs((ks & 7) - fw) + Math.abs((ks >> 4) - rw);
        const bonus = edge * 12 + (14 - dist) * 5;
        v += strong === WHITE ? bonus : -bonus;
      }
    }
    return (s.turn === WHITE ? v : -v) + 10; // +10: lợi thế được đi
  }
  // Bên đang đi còn quân ngoài tốt và vua (tránh null move ở tàn cuộc tốt dễ zugzwang)
  function hasPieces(s, side) {
    const c = s.cnt;
    return side === WHITE ? c[8] + c[9] + c[10] + c[11] > 0 : c[4] + c[3] + c[2] + c[1] > 0;
  }

  /* ---------------- AI: alpha-beta ---------------- */
  const now = typeof performance !== 'undefined' && performance.now ? () => performance.now() : () => Date.now();
  const INF = 1000000, MATE = 100000, MATE_BOUND = MATE - 1000;
  const MAX_PLY = 64;
  const TT_SIZE = 1 << 18, TT_MASK = TT_SIZE - 1;
  const EXACT = 1, LOWER = 2, UPPER = 3;
  let TT = null; // bảng chuyển vị, tạo khi máy nghĩ lần đầu
  function ttClear() {
    if (!TT) {
      TT = { key: new Float64Array(TT_SIZE), move: new Int32Array(TT_SIZE), score: new Int32Array(TT_SIZE), depth: new Int8Array(TT_SIZE), flag: new Uint8Array(TT_SIZE) };
    } else TT.flag.fill(0);
  }

  const ABORT = { aborted: true }; // ném ra khi hết giờ
  function tick(ctx) {
    if ((++ctx.nodes & 1023) === 0 && (now() >= ctx.deadline || ctx.nodes >= ctx.maxNodes)) throw ABORT;
  }

  // Thế cờ lặp lại trong nhánh đang xét hoặc trong ván: coi là hòa
  function isRepeat(s) {
    const k = keyOf(s), keys = s.keys;
    const stop = Math.max(0, keys.length - s.half);
    for (let i = keys.length - 2; i >= stop; i -= 2) if (keys[i] === k) return true;
    return false;
  }

  // Chấm điểm để sắp thứ tự nước: nước từ bảng chuyển vị, ăn quân (MVV-LVA: ăn quân
  // to bằng quân nhỏ trước), phong cấp, nước sát thủ (killer), rồi điểm lịch sử
  function scoreMoves(s, moves, ttMove, ply, ctx) {
    const sc = new Array(moves.length);
    const k0 = ctx.killers[ply * 2], k1 = ctx.killers[ply * 2 + 1];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i], fl = m >>> 17, from = m & 127, to = (m >> 7) & 127;
      if (m === ttMove) sc[i] = 3000000;
      else if (fl & F_CAP) {
        const victim = fl & F_EP ? PAWN : typeOf(s.b[to]);
        sc[i] = 2000000 + victim * 100 - typeOf(s.b[from]) + (promoOf(m) ? 50 : 0);
      } else if (promoOf(m)) sc[i] = 1900000 + promoOf(m);
      else if (m === k0) sc[i] = 1800000;
      else if (m === k1) sc[i] = 1700000;
      else sc[i] = ctx.hist[(s.b[from] + 6) * 128 + to];
    }
    return sc;
  }
  // Đưa nước có điểm cao nhất trong đoạn i.. lên vị trí i (sắp chọn dần)
  function pickNext(moves, sc, i) {
    let bi = i;
    for (let j = i + 1; j < moves.length; j++) if (sc[j] > sc[bi]) bi = j;
    if (bi !== i) {
      const m = moves[i]; moves[i] = moves[bi]; moves[bi] = m;
      const v = sc[i]; sc[i] = sc[bi]; sc[bi] = v;
    }
  }

  // Tìm kiếm tĩnh: chỉ xét nước ăn quân để không dừng giữa chuỗi đổi quân
  function qsearch(s, alpha, beta, ply, ctx) {
    tick(ctx);
    const stand = evaluate(s);
    if (ply >= MAX_PLY || stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const moves = [];
    genMoves(s, moves, true);
    const sc = scoreMoves(s, moves, 0, ply, ctx);
    const us = s.turn;
    let best = stand;
    for (let i = 0; i < moves.length; i++) {
      pickNext(moves, sc, i);
      const m = moves[i];
      if (!promoOf(m)) { // delta pruning: ăn được cũng không kéo lên nổi alpha thì bỏ
        const victim = (m >>> 17) & F_EP ? PAWN : typeOf(s.b[(m >> 7) & 127]);
        if (stand + VALUE[victim] + 200 < alpha) continue;
      }
      makeMove(s, m);
      if (attacked(s, s.king[us], us ^ 1)) { undo(s); continue; }
      const v = -qsearch(s, -beta, -alpha, ply + 1, ctx);
      undo(s);
      if (v > best) {
        best = v;
        if (v > alpha) { alpha = v; if (v >= beta) break; }
      }
    }
    return best;
  }

  // Negamax alpha-beta dạng PVS, có bảng chuyển vị, null move, gia hạn khi bị chiếu
  function search(s, depth, alpha, beta, ply, ctx, canNull) {
    if (ply > 0) {
      if (s.half >= 100 || isRepeat(s) || insufficient(s)) return 0;
      // Cắt theo khoảng cách chiếu hết: đã có đường chiếu hết ngắn hơn thì thôi
      const lo = -MATE + ply, hi = MATE - ply - 1;
      if (alpha < lo) alpha = lo;
      if (beta > hi) beta = hi;
      if (alpha >= beta) return alpha;
    }
    const check = inCheck(s);
    if (check) depth++;
    if (depth <= 0 || ply >= MAX_PLY) return qsearch(s, alpha, beta, ply, ctx);
    tick(ctx);

    const key = keyOf(s), idx = s.h1 & TT_MASK;
    let ttMove = 0;
    if (TT.flag[idx] && TT.key[idx] === key) {
      ttMove = TT.move[idx];
      if (ply > 0 && TT.depth[idx] >= depth) {
        let v = TT.score[idx];
        if (v > MATE_BOUND) v -= ply; else if (v < -MATE_BOUND) v += ply;
        const f = TT.flag[idx];
        if (f === EXACT || (f === LOWER && v >= beta) || (f === UPPER && v <= alpha)) return v;
      }
    }

    // Null move: bỏ lượt mà vẫn vượt beta thì thế này quá tốt, cắt luôn
    if (canNull && !check && depth >= 3 && ply > 0 && beta < MATE_BOUND && hasPieces(s, s.turn) && evaluate(s) >= beta) {
      makeNull(s);
      const v = -search(s, depth - 3, -beta, -beta + 1, ply + 1, ctx, false);
      undo(s);
      if (v >= beta) return beta;
    }

    const moves = [];
    genMoves(s, moves, false);
    const sc = scoreMoves(s, moves, ttMove, ply, ctx);
    const us = s.turn, alpha0 = alpha;
    let best = -INF, bestMove = 0, legal = 0;
    for (let i = 0; i < moves.length; i++) {
      pickNext(moves, sc, i);
      const m = moves[i];
      makeMove(s, m);
      if (attacked(s, s.king[us], us ^ 1)) { undo(s); continue; }
      legal++;
      // Hết giờ thì ABORT bay thẳng lên chooseMove, nơi gỡ hết các nước đang đi thử
      let v;
      if (legal === 1) v = -search(s, depth - 1, -beta, -alpha, ply + 1, ctx, true);
      else {
        v = -search(s, depth - 1, -alpha - 1, -alpha, ply + 1, ctx, true);
        if (v > alpha && v < beta) v = -search(s, depth - 1, -beta, -alpha, ply + 1, ctx, true);
      }
      undo(s);
      if (v > best) {
        best = v;
        bestMove = m;
        if (v > alpha) {
          alpha = v;
          if (alpha >= beta) {
            if (!(m >>> 17 & F_CAP) && !promoOf(m)) { // nước yên tĩnh gây cắt: ghi nhớ
              if (ctx.killers[ply * 2] !== m) { ctx.killers[ply * 2 + 1] = ctx.killers[ply * 2]; ctx.killers[ply * 2] = m; }
              const hi = (s.b[m & 127] + 6) * 128 + ((m >> 7) & 127);
              ctx.hist[hi] += depth * depth;
              if (ctx.hist[hi] > 1000000) for (let j = 0; j < ctx.hist.length; j++) ctx.hist[j] >>= 1;
            }
            break;
          }
        }
      }
    }
    if (!legal) return check ? -MATE + ply : 0; // chiếu hết / hết nước đi

    let stored = best;
    if (stored > MATE_BOUND) stored += ply; else if (stored < -MATE_BOUND) stored -= ply;
    TT.key[idx] = key;
    TT.move[idx] = bestMove;
    TT.score[idx] = stored;
    TT.depth[idx] = depth;
    TT.flag[idx] = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT;
    return best;
  }

  /* ---------------- Sách khai cuộc ---------------- */
  // Vài đường khai cuộc phổ biến để máy đi tự nhiên và không lặp một kiểu. Tra theo khóa
  // thế cờ nên đi đảo thứ tự vẫn khớp.
  const BOOK_LINES = [
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6',
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6',
    'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3',
    'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4',
    'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6',
    'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4',
    'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5',
    'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6',
    'd2d4 g8f6 c2c4 e7e6 g1f3 d7d5',
    'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6',
    'c2c4 e7e5 b1c3 g8f6 g1f3 b8c6',
    'g1f3 d7d5 d2d4 g8f6 c2c4 e7e6',
  ];
  let BOOK = null;
  function bookMoves(s) {
    if (!BOOK) {
      BOOK = new Map();
      for (const line of BOOK_LINES) {
        const t = createState();
        for (const u of line.split(' ')) {
          const k = keyOf(t);
          if (!BOOK.has(k)) BOOK.set(k, []);
          if (BOOK.get(k).indexOf(u) < 0) BOOK.get(k).push(u);
          const m = parseUci(t, u);
          if (!m) break;
          play(t, m);
        }
      }
    }
    return BOOK.get(keyOf(s)) || null;
  }

  // Chọn nước cho bên đang đi. Không làm thay đổi s (đi thử rồi gỡ lại hết).
  // opts: { level, depth, timeMs, noise, seed, rng, book }
  // Trả về { move, uci, depth, nodes, value, timeMs, reason }
  function chooseMove(s, opts) {
    opts = opts || {};
    const t0 = now();
    const lv = LEVELS[opts.level] || LEVELS.medium;
    const rng = opts.rng || (opts.seed != null ? mulberry32(opts.seed) : Math.random);
    const done = (move, reason, extra) => Object.assign({ move, uci: move ? moveToUci(move) : '', reason, depth: 0, nodes: 0, value: null, timeMs: Math.round(now() - t0) }, extra || {});
    if (s.over) return done(0, 'over');
    const legal = legalMoves(s);
    if (!legal.length) return done(0, 'none');
    if (legal.length === 1) return done(legal[0], 'only');

    const useBook = opts.book != null ? opts.book : lv.book;
    if (useBook && opts.depth == null) {
      const list = (bookMoves(s) || []).map((u) => parseUci(s, u, legal)).filter(Boolean);
      if (list.length) return done(list[(rng() * list.length) | 0], 'book');
    }

    const noise = opts.noise != null ? opts.noise : lv.noise;
    const timeMs = opts.timeMs != null ? opts.timeMs : lv.timeMs;
    let maxDepth = opts.depth != null ? opts.depth : lv.depth;
    if (opts.depth == null && lv.depthMin) maxDepth = lv.depthMin + Math.floor(rng() * (lv.depth - lv.depthMin + 1));
    const timed = timeMs != null;
    const ctx = {
      deadline: timed ? t0 + timeMs : Infinity,
      // Trần số nút: phòng khi đồng hồ không chạy (môi trường giả lập thời gian)
      maxNodes: timed ? Math.max(50000, timeMs * 8000) : Infinity,
      nodes: 0,
      killers: new Int32Array(MAX_PLY * 2 + 4),
      hist: new Int32Array(13 * 128),
    };
    ttClear();
    const base = s.stack.length;

    // Thứ tự ban đầu ở gốc: ăn quân trước (MVV-LVA)
    const sc0 = scoreMoves(s, legal, 0, 0, ctx);
    let order = legal.map((m, i) => ({ m, k: sc0[i] })).sort((a, b) => b.k - a.k).map((x) => x.m);
    let result = null;
    // Có nhiễu (mức Dễ): tính đúng điểm mọi nước ở đúng độ sâu đã chọn
    for (let depth = noise > 0 ? maxDepth : 1; depth <= maxDepth; depth++) {
      let alpha = -INF, best = -INF, bestM = 0;
      const vals = [];
      try {
        for (let i = 0; i < order.length; i++) {
          const m = order[i];
          makeMove(s, m);
          let v;
          if (noise > 0) v = -search(s, depth - 1, -INF, INF, 1, ctx, true);
          else if (i === 0) v = -search(s, depth - 1, -INF, -alpha, 1, ctx, true);
          else {
            v = -search(s, depth - 1, -alpha - 1, -alpha, 1, ctx, true);
            if (v > alpha) v = -search(s, depth - 1, -INF, -alpha, 1, ctx, true);
          }
          undo(s);
          vals.push({ m, v });
          if (v > best) { best = v; bestM = m; }
          if (v > alpha) alpha = v;
        }
      } catch (e) {
        if (e !== ABORT) throw e;
        while (s.stack.length > base) undo(s); // hết giờ giữa chừng: gỡ hết nước đang đi thử
        // Đã xét xong ít nhất nước tốt nhất cũ (luôn xét đầu tiên) thì nước tốt nhất
        // của lần đào sâu dở dang đáng tin hơn kết quả lần trước
        if (vals.length) result = { m: bestM, v: best, depth: result ? result.depth : depth, vals: result ? result.vals : vals };
        break;
      }
      result = { m: bestM, v: best, depth, vals };
      // Đưa nước tốt nhất lên đầu cho lần đào sâu sau
      order = vals.slice().sort((a, b) => b.v - a.v).map((x) => x.m);
      if (best > MATE_BOUND) break; // đã thấy đường chiếu hết
      if (timed && now() - t0 > timeMs * 0.5) break; // lần sau gần chắc chắn không kịp
    }
    if (!result) return done(order[0], 'static', { nodes: ctx.nodes });
    let pick = result.m, value = result.v;
    if (noise > 0) {
      let bestScore = -Infinity;
      for (const x of result.vals) {
        const v = x.v + rng() * noise;
        if (v > bestScore) { bestScore = v; pick = x.m; value = x.v; }
      }
    }
    return done(pick, 'search', { depth: result.depth, nodes: ctx.nodes, value });
  }

  return {
    WHITE, BLACK, DRAW, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
    F_CAP, F_EP, F_CASTLE, F_DOUBLE, START_FEN, FILES, LEVELS, MATE, POINTS,
    fileOf, rankOf, sqOf, sqName, parseSq, colorOf, typeOf,
    encode, fromOf, toOf, promoOf, flagsOf,
    createState, fromFEN, toFEN, cloneState, keyOf,
    attacked, inCheck, genMoves, legalMoves, hasLegalMove, makeMove, undo, perft,
    insufficient, repetitions, updateStatus, moveToUci, parseUci, san,
    play, applyMove, fromMoves, material, evaluate, chooseMove, mulberry32,
  };
}

(function (root) {
  const api = CoVuaFactory();
  api.factory = CoVuaFactory; // để app.js dựng Web Worker từ mã nguồn
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CoVua = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
