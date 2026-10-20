/* =====================================================================
 * Bốn Liên Tiếp - Engine
 * Chạy được trong trình duyệt (window.BonLienTiep), trong Node (module.exports)
 * và trong Web Worker (self.BonLienTiep). Không đụng tới DOM.
 *
 * Bàn 7 cột x 6 hàng. Ô được đánh số từ dưới lên: idx = hàng * 7 + cột,
 * hàng 0 là hàng dưới cùng, cột 0 là cột trái nhất trên màn hình.
 *
 *     35 36 37 38 39 40 41     <- hàng 5 (trên cùng)
 *     ...
 *      7  8  9 10 11 12 13
 *      0  1  2  3  4  5  6     <- hàng 0 (dưới cùng)
 *
 *   - Nước đi là số cột 0..6, quân rơi xuống ô trống thấp nhất của cột
 *   - Ô trên bàn: 0 trống, 1 quân của người chơi 0, 2 quân của người chơi 1
 *   - Luật: 4 quân liền nhau theo ngang / dọc / chéo là thắng, kín bàn là hòa
 *   - AI: negamax cắt tỉa alpha-beta (PVS), bảng chuyển vị (Zobrist), xếp nước
 *     giữa trước, đánh giá theo "cửa sổ" 4 ô và chẵn lẻ của ô đe dọa, cập nhật dần
 *
 * Toàn bộ engine nằm trong hàm BonLienTiepFactory để app.js dựng lại mã nguồn
 * cho Web Worker qua BonLienTiep.factory.toString() (chạy được cả khi mở bằng file://).
 * ===================================================================== */
function BonLienTiepFactory() {
  'use strict';

  const COLS = 7;
  const ROWS = 6;
  const CELLS = COLS * ROWS;
  const DRAW = 2; // winner = 2 khi hòa
  // Thứ tự xét cột: giữa trước, ra dần hai bên (cột giữa nằm trong nhiều đường 4 nhất)
  const CENTER_ORDER = [3, 2, 4, 1, 5, 0, 6];
  const WIN = 100000; // điểm thắng; thắng càng sớm điểm càng cao (WIN - số quân trên bàn)

  // Cấu hình các mức máy
  //   depth: độ sâu tìm kiếm cố định; depthMin + missRate: tỉ lệ chỉ nhìn 1 nước (bỏ sót đe dọa),
  //   khi đó dùng nhiễu missNoise
  //   shallow: ở lá không xét đe dọa trước mắt; noise: nhiễu cộng vào điểm từng nước ở gốc
  //   timeMs: trần thời gian (đào sâu dần)
  const LEVELS = {
    easy: { label: 'Dễ', depthMin: 1, depth: 2, missRate: 0.5, missNoise: 70, shallow: true, noise: 18 },
    medium: { label: 'Vừa', depth: 6, noise: 2 },
    hard: { label: 'Khó', depth: CELLS, noise: 0, timeMs: 1500 },
  };

  const idxOf = (row, col) => row * COLS + col;
  const rowOf = (idx) => (idx / COLS) | 0;
  const colOf = (idx) => idx % COLS;

  /* ---------------- Cửa sổ 4 ô ---------------- */
  // Mọi đoạn 4 ô liền nhau trên bàn (69 đoạn). Hướng: 0 ngang, 1 dọc,
  // 2 chéo lên phải (/), 3 chéo xuống phải (\)
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const WIN_CELLS = [];
  const WIN_DIR = [];
  for (let d = 0; d < 4; d++) {
    const dc = DIRS[d][0], dr = DIRS[d][1];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const r3 = r + 3 * dr, c3 = c + 3 * dc;
        if (c3 >= COLS || r3 < 0 || r3 >= ROWS) continue;
        for (let k = 0; k < 4; k++) WIN_CELLS.push(idxOf(r + k * dr, c + k * dc));
        WIN_DIR.push(d);
      }
    }
  }
  const NW = WIN_DIR.length;
  // Các cửa sổ đi qua từng ô
  const CELL_WINS = [];
  for (let i = 0; i < CELLS; i++) CELL_WINS.push([]);
  for (let w = 0; w < NW; w++) for (let k = 0; k < 4; k++) CELL_WINS[WIN_CELLS[w * 4 + k]].push(w);
  for (let i = 0; i < CELLS; i++) CELL_WINS[i] = Int16Array.from(CELL_WINS[i]);

  // Giá trị một cửa sổ theo góc nhìn người chơi 0: a quân của 0, b quân của 1.
  // Cửa sổ có quân cả hai bên thì vô dụng. Đủ 4 quân là hết ván nên không cần điểm.
  const W_OPEN = [0, 1, 4, 14, 0];
  const WV = new Int16Array(25);
  for (let a = 0; a <= 4; a++) {
    for (let b = 0; b <= 4; b++) WV[a * 5 + b] = a && b ? 0 : a ? W_OPEN[a] : -W_OPEN[b];
  }
  // Ô đe dọa (cửa sổ có 3 quân một bên, ô còn lại trống): ở Bốn Liên Tiếp, người đi trước
  // cần ô đe dọa ở hàng lẻ (hàng 1, 3, 5 tính từ đáy), người đi sau cần ô ở hàng chẵn,
  // vì cuối ván các cột lấp dần và lượt đi quyết định ai được thả vào ô đó.
  const T_GOOD = 22, T_BAD = 7;

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

  // Khóa Zobrist hai nửa 32 bit: nửa thấp chọn ô trong bảng chuyển vị, nửa cao để đối chiếu
  const ZL = new Int32Array(CELLS * 2);
  const ZH = new Int32Array(CELLS * 2);
  {
    const rng = mulberry32(0x5eed4);
    for (let i = 0; i < CELLS * 2; i++) { ZL[i] = (rng() * 4294967296) | 0; ZH[i] = (rng() * 4294967296) | 0; }
  }
  const SIDE_L = 0x2545f491 | 0, SIDE_H = 0x6c8e9cf5 | 0; // khóa lượt đi: có khi đến lượt người chơi 1

  /* ---------------- Trạng thái ván ---------------- */
  // board[42]: 0 trống, 1 / 2 quân của người chơi 0 / 1
  // heights[7]: số quân đang có trong từng cột
  // cnt[69 * 2]: số quân mỗi bên trong từng cửa sổ (để đánh giá và phát hiện thắng nhanh)
  // h: điểm đánh giá tĩnh theo góc nhìn người chơi 0, cập nhật dần sau mỗi nước
  // hl, hh: khóa Zobrist; turn: bên đang đi; ply: số quân đã thả
  // over: hết ván; winner: -1 đang chơi, 0 / 1 bên thắng, 2 hòa
  // win: { cells, segs } các ô thắng và đoạn thẳng để vẽ (khi có người thắng)
  // last: ô vừa thả (-1 khi chưa có)
  function createState(opts) {
    opts = opts || {};
    const turn = opts.first === 1 ? 1 : 0;
    return {
      board: new Int8Array(CELLS),
      heights: new Int8Array(COLS),
      cnt: new Int8Array(NW * 2),
      h: 0,
      hl: turn ? SIDE_L : 0,
      hh: turn ? SIDE_H : 0,
      first: turn,
      turn,
      ply: 0,
      over: false,
      winner: -1,
      win: null,
      last: -1,
    };
  }

  function cloneState(s) {
    return {
      board: s.board.slice(),
      heights: s.heights.slice(),
      cnt: s.cnt.slice(),
      h: s.h,
      hl: s.hl,
      hh: s.hh,
      first: s.first,
      turn: s.turn,
      ply: s.ply,
      over: s.over,
      winner: s.winner,
      win: s.win ? { cells: s.win.cells.slice(), segs: s.win.segs.map((x) => Object.assign({}, x)) } : null,
      last: s.last,
    };
  }

  /* ---------------- Thả / gỡ quân (dùng chung cho luật và AI) ---------------- */
  // Điểm ô đe dọa của cửa sổ w (theo góc nhìn người chơi 0), dựa trên bàn hiện tại
  function threatVal(s, w, a, b) {
    let q;
    if (a === 3 && b === 0) q = 0;
    else if (b === 3 && a === 0) q = 1;
    else return 0;
    let e = WIN_CELLS[w * 4];
    for (let k = 1; k < 4 && s.board[e] !== 0; k++) e = WIN_CELLS[w * 4 + k];
    const odd = ((e / COLS) | 0) % 2 === 0; // hàng lẻ tính từ 1
    const v = odd === (q === s.first) ? T_GOOD : T_BAD;
    return q === 0 ? v : -v;
  }

  // Điểm tĩnh tính lại từ đầu trên cả bàn (để test đối chiếu với điểm cập nhật dần s.h)
  function scoreFromScratch(s) {
    let h = 0;
    for (let w = 0; w < NW; w++) {
      const a = s.cnt[w * 2], b = s.cnt[w * 2 + 1];
      h += WV[a * 5 + b];
      if (a + b === 3) h += threatVal(s, w, a, b);
    }
    return h;
  }

  // Cộng (sign = 1) hoặc trừ (sign = -1) điểm của mọi cửa sổ đi qua ô idx
  function windowsScore(s, idx, sign) {
    const ws = CELL_WINS[idx];
    const cnt = s.cnt;
    let h = 0;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      const a = cnt[w * 2], b = cnt[w * 2 + 1];
      h += WV[a * 5 + b];
      if (a + b === 3) h += threatVal(s, w, a, b);
    }
    s.h += sign * h;
  }

  // Thả quân của bên đang đi vào cột c (cột phải còn chỗ). Trả về true nếu thành 4.
  function make(s, c) {
    const p = s.turn;
    const idx = s.heights[c] * COLS + c;
    windowsScore(s, idx, -1);
    s.board[idx] = p + 1;
    s.heights[c]++;
    s.ply++;
    const ws = CELL_WINS[idx];
    const cnt = s.cnt;
    let won = false;
    for (let i = 0; i < ws.length; i++) {
      const k = ws[i] * 2 + p;
      if (cnt[k] === 3) won = true;
      cnt[k]++;
    }
    windowsScore(s, idx, 1);
    s.hl ^= ZL[idx * 2 + p] ^ SIDE_L;
    s.hh ^= ZH[idx * 2 + p] ^ SIDE_H;
    s.turn = 1 - p;
    return won;
  }

  // Gỡ quân trên cùng của cột c (ngược lại với make)
  function unmake(s, c) {
    s.heights[c]--;
    const idx = s.heights[c] * COLS + c;
    const p = s.board[idx] - 1;
    windowsScore(s, idx, -1);
    s.board[idx] = 0;
    s.ply--;
    const ws = CELL_WINS[idx];
    const cnt = s.cnt;
    for (let i = 0; i < ws.length; i++) cnt[ws[i] * 2 + p]--;
    windowsScore(s, idx, 1);
    s.hl ^= ZL[idx * 2 + p] ^ SIDE_L;
    s.hh ^= ZH[idx * 2 + p] ^ SIDE_H;
    s.turn = p;
  }

  // Bên p thả vào ô trống idx thì có thành 4 không
  function winsAt(s, idx, p) {
    const ws = CELL_WINS[idx];
    const cnt = s.cnt;
    for (let i = 0; i < ws.length; i++) {
      const k = ws[i] * 2;
      if (cnt[k + p] === 3 && cnt[k + 1 - p] === 0) return true;
    }
    return false;
  }

  /* ---------------- Luật ---------------- */
  function isLegal(s, c) {
    return !s.over && typeof c === 'number' && c === (c | 0) && c >= 0 && c < COLS && s.heights[c] < ROWS;
  }

  function legalMoves(s) {
    const res = [];
    if (s.over) return res;
    for (let c = 0; c < COLS; c++) if (s.heights[c] < ROWS) res.push(c);
    return res;
  }

  // Các cột bên p thả vào là thắng ngay (dùng cho gợi ý và test)
  function winningCols(s, p) {
    const res = [];
    for (let c = 0; c < COLS; c++) if (s.heights[c] < ROWS && winsAt(s, s.heights[c] * COLS + c, p)) res.push(c);
    return res;
  }

  // Đi nước c cho bên đang đi, sửa trực tiếp s. Trả về { col, row, idx, p }.
  function play(s, c) {
    const p = s.turn;
    const row = s.heights[c];
    const won = make(s, c);
    s.last = row * COLS + c;
    if (won) {
      s.over = true;
      s.winner = p;
      s.win = winInfo(s, s.last, p);
    } else if (s.ply >= CELLS) {
      s.over = true;
      s.winner = DRAW;
    }
    return { col: c, row, idx: s.last, p };
  }

  // Ô thắng và các đoạn thẳng để vẽ: gộp các cửa sổ thắng cùng hướng thành một đoạn
  // (5 quân liền nhau là một đoạn dài), khác hướng thì thành nhiều đoạn
  function winInfo(s, idx, p) {
    const cells = new Set();
    const byDir = [null, null, null, null];
    const ws = CELL_WINS[idx];
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (s.cnt[w * 2 + p] !== 4) continue;
      const d = WIN_DIR[w];
      byDir[d] = byDir[d] || [];
      for (let k = 0; k < 4; k++) { const x = WIN_CELLS[w * 4 + k]; cells.add(x); byDir[d].push(x); }
    }
    const segs = [];
    for (let d = 0; d < 4; d++) {
      if (!byDir[d]) continue;
      // Thứ tự dọc theo hướng: theo cột (ngang, chéo) hoặc theo hàng (dọc)
      const key = (x) => (d === 1 ? rowOf(x) : colOf(x));
      const sorted = byDir[d].slice().sort((x, y) => key(x) - key(y));
      segs.push({ dir: d, from: sorted[0], to: sorted[sorted.length - 1] });
    }
    return { cells: Array.from(cells).sort((x, y) => x - y), segs };
  }

  // Đi nước c trên bản sao, ném lỗi nếu nước không hợp lệ
  function applyMove(s, c) {
    if (!isLegal(s, c)) throw new Error('Nước đi không hợp lệ: ' + c);
    const t = cloneState(s);
    play(t, c);
    return t;
  }

  // Dựng lại ván từ danh sách nước (khôi phục ván đã lưu, Đi lại, Worker)
  function fromMoves(moves, opts) {
    const s = createState(opts);
    for (let i = 0; i < moves.length; i++) {
      if (!isLegal(s, moves[i])) throw new Error('Nước thứ ' + (i + 1) + ' không hợp lệ: ' + moves[i]);
      play(s, moves[i]);
    }
    return s;
  }

  const now = typeof performance !== 'undefined' && performance.now ? () => performance.now() : () => Date.now();

  /* ---------------- AI: negamax + alpha-beta + bảng chuyển vị ---------------- */
  // Điểm tĩnh của thế cờ theo góc nhìn bên p
  function evaluate(s, p) {
    if (s.over) return s.winner === DRAW ? 0 : s.winner === p ? WIN - s.ply : -(WIN - s.ply);
    return p === 0 ? s.h : -s.h;
  }

  // Bảng chuyển vị: 2^19 ô, mỗi ô lưu khóa đối chiếu, điểm và
  // meta = độ sâu (8 bit) | loại cận (2 bit) << 8 | (nước tốt nhất + 1) << 10
  const TT_BITS = 19;
  const TT_MASK = (1 << TT_BITS) - 1;
  const EXACT = 1, LOWER = 2, UPPER = 3;
  let ttCheck = null, ttVal = null, ttMeta = null;
  function ensureTT() {
    if (ttCheck) return;
    ttCheck = new Int32Array(1 << TT_BITS);
    ttVal = new Int32Array(1 << TT_BITS);
    ttMeta = new Int32Array(1 << TT_BITS);
  }
  function clearTT() { if (ttMeta) ttMeta.fill(0); }

  const ABORT = { aborted: true }; // ném ra khi hết giờ để thoát khỏi đệ quy

  // Tìm kiếm negamax trên s (sửa tại chỗ bằng make / unmake).
  // ctx: { deadline, maxNodes, nodes, shallow, buf, keys }
  function negamax(s, depth, alpha, beta, ctx) {
    if ((++ctx.nodes & 1023) === 0 && (now() >= ctx.deadline || ctx.nodes >= ctx.maxNodes)) throw ABORT;
    const p = s.turn, o = 1 - p, H = s.heights, ply = s.ply;
    // Mức Dễ: ở lá chỉ nhìn điểm tĩnh, không xét đe dọa trước mắt
    if (depth <= 0 && ctx.shallow) return p === 0 ? s.h : -s.h;

    // 1. Thả là thắng ngay
    for (let c = 0; c < COLS; c++) if (H[c] < ROWS && winsAt(s, H[c] * COLS + c, p)) return WIN - ply - 1;
    // Còn đúng một ô (hoặc kín bàn) mà không thắng được: hòa
    if (ply >= CELLS - 1) return 0;

    // 2. Đối thủ dọa thắng: hai chỗ trở lên thì thua chắc, một chỗ thì buộc phải chặn
    let forced = -1, threats = 0;
    for (let c = 0; c < COLS; c++) if (H[c] < ROWS && winsAt(s, H[c] * COLS + c, o)) { threats++; forced = c; }
    if (threats >= 2) return -(WIN - ply - 2);

    // 3. Chỉ xét nước không thua ngay: không thả ngay dưới ô thắng của đối thủ
    const moves = ctx.buf[ply];
    let n = 0;
    if (forced >= 0) {
      if (H[forced] < ROWS - 1 && winsAt(s, (H[forced] + 1) * COLS + forced, o)) return -(WIN - ply - 2);
      moves[n++] = forced;
    } else {
      for (let i = 0; i < COLS; i++) {
        const c = CENTER_ORDER[i];
        if (H[c] >= ROWS) continue;
        if (H[c] < ROWS - 1 && winsAt(s, (H[c] + 1) * COLS + c, o)) continue;
        moves[n++] = c;
      }
      if (n === 0) return -(WIN - ply - 2);
    }

    // 4. Không thắng ngay được thì sớm nhất là thắng ở quân thứ ply + 3: hạ cận trên
    const maxV = WIN - ply - 3;
    if (beta > maxV) { beta = maxV; if (alpha >= beta) return beta; }

    if (depth <= 0) return p === 0 ? s.h : -s.h;

    // 5. Bảng chuyển vị (bỏ qua ở mức Dễ vì lá được tính khác)
    const useTT = !ctx.shallow;
    const slot = s.hl & TT_MASK;
    let ttMove = -1;
    if (useTT && ttMeta[slot] !== 0 && ttCheck[slot] === s.hh) {
      const meta = ttMeta[slot];
      ttMove = (meta >> 10) - 1;
      if ((meta & 255) >= depth) {
        const v = ttVal[slot];
        const flag = (meta >> 8) & 3;
        if (flag === EXACT) return v;
        if (flag === LOWER) { if (v > alpha) alpha = v; } else if (v < beta) beta = v;
        if (alpha >= beta) return v;
      }
    }

    // 6. Xếp nước: nước tốt nhất lần trước lên đầu, còn lại theo điểm tĩnh sau nước đi
    // (sắp xếp ổn định nên khi bằng điểm vẫn giữ thứ tự giữa trước)
    if (n > 1) {
      const keys = ctx.keys[ply];
      for (let i = 0; i < n; i++) {
        const c = moves[i];
        if (c === ttMove) { keys[i] = 1e9; continue; }
        make(s, c);
        keys[i] = p === 0 ? s.h : -s.h;
        unmake(s, c);
      }
      for (let i = 1; i < n; i++) {
        const c = moves[i], k = keys[i];
        let j = i - 1;
        while (j >= 0 && keys[j] < k) { moves[j + 1] = moves[j]; keys[j + 1] = keys[j]; j--; }
        moves[j + 1] = c;
        keys[j + 1] = k;
      }
    }

    const alpha0 = alpha;
    let best = -Infinity, bestMove = moves[0];
    for (let i = 0; i < n; i++) {
      const c = moves[i];
      make(s, c);
      // PVS: nước đầu tìm đủ cửa sổ, các nước sau chỉ thử "có hơn alpha không" bằng cửa sổ hẹp,
      // hơn thật thì mới tìm lại với cửa sổ đủ
      let v;
      if (i === 0) v = -negamax(s, depth - 1, -beta, -alpha, ctx);
      else {
        v = -negamax(s, depth - 1, -alpha - 1, -alpha, ctx);
        if (v > alpha && v < beta) v = -negamax(s, depth - 1, -beta, -alpha, ctx);
      }
      unmake(s, c);
      if (v > best) { best = v; bestMove = c; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }

    if (useTT) {
      const flag = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT;
      ttCheck[slot] = s.hh;
      ttVal[slot] = best;
      ttMeta[slot] = Math.min(depth, 255) | (flag << 8) | ((bestMove + 1) << 10);
    }
    return best;
  }

  // Tìm ở gốc với độ sâu cho trước, trả về điểm từng nước (theo thứ tự order).
  // exact: tính đúng điểm mọi nước (cần khi cộng nhiễu); không thì nước kém hơn
  // nước tốt nhất chỉ cần biết là "không hơn" (cắt tỉa nhiều hơn).
  function searchRoot(s, order, depth, ctx, exact) {
    const vals = [];
    let alpha = -Infinity;
    for (let i = 0; i < order.length; i++) {
      const c = order[i];
      let v;
      if (winsAt(s, s.heights[c] * COLS + c, s.turn)) v = WIN - s.ply - 1;
      else {
        make(s, c);
        v = s.ply >= CELLS ? 0 : -negamax(s, depth - 1, -Infinity, exact ? Infinity : -alpha, ctx);
        unmake(s, c);
      }
      vals.push(v);
      if (v > alpha) alpha = v;
    }
    return vals;
  }

  // Bộ nhớ đệm theo tầng cho danh sách nước và điểm xếp nước (tránh cấp phát trong đệ quy)
  function makeBuffers() {
    const buf = [], keys = [];
    for (let i = 0; i <= CELLS; i++) { buf.push(new Int8Array(COLS)); keys.push(new Float64Array(COLS)); }
    return { buf, keys };
  }
  let buffers = null;

  // Chọn nước cho bên đang đi.
  // opts: { level, depth, timeMs, nodes, noise, shallow, seed, rng }
  //   nodes: trần số nút thay cho trần thời gian (đào sâu dần, kết quả lặp lại được, dùng cho test)
  // Trả về { move, depth, nodes, value, timeMs, reason }
  function chooseMove(s, opts) {
    opts = opts || {};
    const t0 = now();
    const lv = LEVELS[opts.level] || LEVELS.medium;
    const rng = opts.rng || (opts.seed != null ? mulberry32(opts.seed) : Math.random);
    const done = (move, reason, extra) => Object.assign({ move, reason, depth: 0, nodes: 0, value: null, timeMs: Math.round(now() - t0) }, extra || {});
    if (s.over) return done(-1, 'over');
    const moves = legalMoves(s);
    if (moves.length === 1) return done(moves[0], 'only');
    // Nước đầu ván: cột giữa là nước mở đầu duy nhất giữ được thắng (đã được giải trọn)
    const noise0 = opts.noise != null ? opts.noise : lv.noise;
    if (s.ply === 0 && noise0 <= 2) return done(3, 'book');

    let noise = noise0;
    const timeMs = opts.timeMs != null ? opts.timeMs : lv.timeMs;
    const shallow = opts.shallow != null ? !!opts.shallow : !!lv.shallow;
    let maxDepth = opts.depth != null ? opts.depth : lv.depth;
    if (opts.depth == null && lv.depthMin && rng() < lv.missRate) {
      maxDepth = lv.depthMin;
      if (opts.noise == null && lv.missNoise) noise = lv.missNoise;
    }
    maxDepth = Math.max(1, Math.min(maxDepth, CELLS - s.ply));
    // Có trần thời gian hoặc trần số nút: đào sâu dần. Không có: tìm thẳng ở độ sâu cố định
    const budget = opts.nodes != null ? opts.nodes : null;
    const timed = timeMs != null || budget != null;
    ensureTT();
    if (!buffers) buffers = makeBuffers();
    const ctx = {
      deadline: timeMs != null ? t0 + timeMs : Infinity,
      // Trần số nút: theo opts.nodes, hoặc phòng khi đồng hồ không chạy (môi trường giả lập thời gian)
      maxNodes: budget != null ? budget : timed ? Math.max(100000, timeMs * 10000) : Infinity,
      nodes: 0,
      shallow,
      buf: buffers.buf,
      keys: buffers.keys,
    };

    let order = CENTER_ORDER.filter((c) => s.heights[c] < ROWS);
    let bestVals = null;
    let reached = 0;
    for (let depth = timed ? 1 : maxDepth; depth <= maxDepth; depth++) {
      // Tìm trên bản sao: nếu hết giờ giữa chừng, bản sao dở dang bị bỏ đi
      const w = cloneState(s);
      let vals;
      try { vals = searchRoot(w, order, depth, ctx, noise > 0); } catch (e) {
        if (e === ABORT) break;
        throw e;
      }
      bestVals = order.map((m, i) => ({ m, v: vals[i] }));
      reached = depth;
      // Đưa nước tốt nhất lên đầu cho lần đào sâu sau (sắp xếp ổn định)
      const sorted = bestVals.slice().sort((a, b) => b.v - a.v);
      order = sorted.map((x) => x.m);
      if (Math.abs(sorted[0].v) >= WIN - CELLS) break; // đã thấy thắng / thua chắc
      if (timeMs != null && now() - t0 > timeMs * 0.5) break; // lần sau gần chắc chắn không kịp
      if (budget != null && ctx.nodes > budget * 0.5) break;
    }
    if (!bestVals) { // hết giờ ngay từ độ sâu 1: thắng ngay được thì thắng, không thì cột giữa
      const win = order.find((c) => winsAt(s, s.heights[c] * COLS + c, s.turn));
      return done(win != null ? win : order[0], 'static', { nodes: ctx.nodes });
    }
    // Chọn nước có điểm cao nhất (cộng nhiễu ở mức Dễ / Vừa; nhiễu không lật được điểm thắng thua)
    let best = null, bestScore = -Infinity;
    for (const x of bestVals) {
      const sc = x.v + (noise > 0 ? rng() * noise : 0);
      if (sc > bestScore) { bestScore = sc; best = x; }
    }
    return done(best.m, 'search', { depth: reached, nodes: ctx.nodes, value: best.v });
  }

  return {
    COLS, ROWS, CELLS, DRAW, WIN, LEVELS, CENTER_ORDER, DIRS,
    idxOf, rowOf, colOf,
    createState, cloneState, isLegal, legalMoves, winningCols, play, applyMove, fromMoves,
    evaluate, scoreFromScratch, chooseMove, clearTT, mulberry32,
  };
}

(function (root) {
  const api = BonLienTiepFactory();
  api.factory = BonLienTiepFactory; // để app.js dựng Web Worker từ mã nguồn
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BonLienTiep = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
