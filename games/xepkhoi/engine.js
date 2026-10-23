/* =====================================================================
 * Xếp Khối - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Bàn 10×10, mỗi ô là 0 (trống) hoặc số màu 1..COLORS
 *   - Khay ba khối (không xoay); đặt hết ba khối thì chia ba khối mới
 *   - Hàng / cột đầy thì xóa; điểm = số ô đặt + 10 × L × L (L = số đường ăn cùng lúc)
 *   - Hết chỗ cho mọi khối còn lại trong khay thì thua
 *   - PRNG mulberry32 lưu trạng thái trong ván, nên ván lưu chơi tiếp ra đúng chuỗi khối cũ
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const SIZE = 10;
  const COLORS = 8;
  const DEAL_TRIES = 30; // số lần rút lại bộ khối khi cả ba đều không vừa

  /* ---------------- Bộ khối ---------------- */
  // Mỗi họ: màu, trọng số cả họ (chia đều cho các hướng), các hướng vẽ bằng chuỗi ('#' = ô)
  const FAMILIES = [
    { id: 'o1', color: 8, weight: 2, shapes: { o1: ['#'] } },
    { id: 'i2', color: 2, weight: 3, shapes: { i2h: ['##'], i2v: ['#', '#'] } },
    { id: 'i3', color: 2, weight: 3, shapes: { i3h: ['###'], i3v: ['#', '#', '#'] } },
    { id: 'i4', color: 2, weight: 3, shapes: { i4h: ['####'], i4v: ['#', '#', '#', '#'] } },
    { id: 'i5', color: 2, weight: 2, shapes: { i5h: ['#####'], i5v: ['#', '#', '#', '#', '#'] } },
    { id: 'o2', color: 1, weight: 3, shapes: { o2: ['##', '##'] } },
    { id: 'o3', color: 1, weight: 1.5, shapes: { o3: ['###', '###', '###'] } },
    { id: 'c3', color: 3, weight: 3, shapes: { c3a: ['##', '#.'], c3b: ['##', '.#'], c3c: ['#.', '##'], c3d: ['.#', '##'] } },
    { id: 'c5', color: 4, weight: 2, shapes: { c5a: ['###', '#..', '#..'], c5b: ['###', '..#', '..#'], c5c: ['#..', '#..', '###'], c5d: ['..#', '..#', '###'] } },
    {
      id: 'l4', color: 5, weight: 3,
      shapes: {
        l4a: ['#.', '#.', '##'], l4b: ['.#', '.#', '##'], l4c: ['##', '#.', '#.'], l4d: ['##', '.#', '.#'],
        l4e: ['###', '#..'], l4f: ['###', '..#'], l4g: ['#..', '###'], l4h: ['..#', '###'],
      },
    },
    { id: 't4', color: 6, weight: 2, shapes: { t4a: ['###', '.#.'], t4b: ['.#.', '###'], t4c: ['#.', '##', '#.'], t4d: ['.#', '##', '.#'] } },
    { id: 's4', color: 7, weight: 2, shapes: { s4a: ['.##', '##.'], s4b: ['##.', '.##'], s4c: ['#.', '##', '.#'], s4d: ['.#', '##', '#.'] } },
  ];

  const PIECES = {};
  FAMILIES.forEach((f) => {
    const keys = Object.keys(f.shapes);
    keys.forEach((k) => {
      const rows = f.shapes[k];
      const cells = [];
      rows.forEach((row, r) => row.split('').forEach((ch, c) => { if (ch === '#') cells.push([r, c]); }));
      PIECES[k] = { key: k, family: f.id, color: f.color, weight: f.weight / keys.length, cells, h: rows.length, w: rows[0].length };
    });
  });
  const KEYS = Object.keys(PIECES);
  const TOTAL_WEIGHT = KEYS.reduce((s, k) => s + PIECES[k].weight, 0);

  /* ---------------- PRNG ---------------- */
  /** mulberry32: trạng thái uint32 vào, { value ∈ [0,1), state } ra (thuần, để lưu được trong ván). */
  function rand(state) {
    const s = (state + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: s };
  }

  function pickPiece(state) {
    const r = rand(state);
    let x = r.value * TOTAL_WEIGHT;
    for (const k of KEYS) {
      x -= PIECES[k].weight;
      if (x < 0) return { key: k, state: r.state };
    }
    return { key: KEYS[KEYS.length - 1], state: r.state };
  }

  /* ---------------- Bàn ---------------- */
  function canPlace(board, key, r, c) {
    const p = PIECES[key];
    if (!p || !Number.isInteger(r) || !Number.isInteger(c)) return false;
    if (r < 0 || c < 0 || r + p.h > SIZE || c + p.w > SIZE) return false;
    for (const [dr, dc] of p.cells) if (board[(r + dr) * SIZE + c + dc]) return false;
    return true;
  }

  function fitsAnywhere(board, key) {
    const p = PIECES[key];
    if (!p) return false;
    for (let r = 0; r + p.h <= SIZE; r++) for (let c = 0; c + p.w <= SIZE; c++) if (canPlace(board, key, r, c)) return true;
    return false;
  }

  /** Hàng / cột đầy trên bàn. */
  function fullLines(board) {
    const rows = [];
    const cols = [];
    for (let i = 0; i < SIZE; i++) {
      let row = true;
      let col = true;
      for (let j = 0; j < SIZE; j++) {
        if (!board[i * SIZE + j]) row = false;
        if (!board[j * SIZE + i]) col = false;
      }
      if (row) rows.push(i);
      if (col) cols.push(i);
    }
    return { rows, cols };
  }

  /**
   * Đặt khối lên bàn (không kiểm tra hợp lệ, gọi sau canPlace): trả bàn mới đã xóa đường đầy,
   * ô vừa đặt, hàng / cột ăn được, các ô bị xóa kèm màu cũ (để app vẽ hiệu ứng).
   */
  function applyPiece(board, key, r, c) {
    const p = PIECES[key];
    const next = board.slice();
    const cells = p.cells.map(([dr, dc]) => (r + dr) * SIZE + c + dc);
    cells.forEach((i) => { next[i] = p.color; });
    const { rows, cols } = fullLines(next);
    const clear = new Set();
    rows.forEach((y) => { for (let x = 0; x < SIZE; x++) clear.add(y * SIZE + x); });
    cols.forEach((x) => { for (let y = 0; y < SIZE; y++) clear.add(y * SIZE + x); });
    const cleared = Array.from(clear).sort((a, b) => a - b).map((i) => ({ i, color: next[i] }));
    clear.forEach((i) => { next[i] = 0; });
    return { board: next, cells, rows, cols, cleared };
  }

  const scoreFor = (cells, lines) => cells + 10 * lines * lines;

  /* ---------------- Ván ---------------- */
  /** Chia ba khối mới; rút lại cả bộ nếu không khối nào vừa (bàn còn ô trống thì ô đơn luôn vừa: phương án cuối). */
  function deal(g) {
    let state = g.rng >>> 0;
    let pieces = null;
    for (let t = 0; t < DEAL_TRIES; t++) {
      const set = [];
      for (let i = 0; i < 3; i++) {
        const p = pickPiece(state);
        state = p.state;
        set.push(p.key);
      }
      pieces = set;
      if (set.some((k) => fitsAnywhere(g.board, k))) break;
      if (t === DEAL_TRIES - 1) pieces[0] = 'o1';
    }
    const next = Object.assign({}, g, { rng: state, pieces });
    next.over = isOver(next);
    return next;
  }

  function newGame(seed) {
    const s = Number.isFinite(seed) ? seed >>> 0 : (Math.random() * 4294967296) >>> 0;
    return deal({ seed: s, rng: s, board: new Array(SIZE * SIZE).fill(0), pieces: [null, null, null], score: 0, moves: 0, lines: 0, over: false });
  }

  /** Khối trong từng ô khay còn chỗ đặt không (ô trống = false). */
  const playable = (g) => g.pieces.map((k) => !!k && fitsAnywhere(g.board, k));
  const isOver = (g) => !playable(g).some(Boolean);

  /** Xem trước: ô sẽ lấp và hàng / cột sẽ ăn; vị trí không hợp lệ thì null. */
  function preview(g, slot, r, c) {
    const key = g.pieces[slot];
    if (g.over || !key || !canPlace(g.board, key, r, c)) return null;
    const res = applyPiece(g.board, key, r, c);
    return { cells: res.cells, rows: res.rows, cols: res.cols };
  }

  /**
   * Đặt khối ở ô khay `slot` với góc trên trái tại (r, c). Sai thì null; đúng thì
   * { game, cells, rows, cols, cleared, lines, gained, dealt }.
   */
  function place(g, slot, r, c) {
    const key = g.pieces[slot];
    if (g.over || !key || !canPlace(g.board, key, r, c)) return null;
    const res = applyPiece(g.board, key, r, c);
    const lines = res.rows.length + res.cols.length;
    const gained = scoreFor(res.cells.length, lines);
    const pieces = g.pieces.slice();
    pieces[slot] = null;
    let game = Object.assign({}, g, { board: res.board, pieces, score: g.score + gained, moves: g.moves + 1, lines: g.lines + lines });
    const dealt = pieces.every((k) => !k);
    if (dealt) game = deal(game);
    else game.over = isOver(game);
    return { game, cells: res.cells, rows: res.rows, cols: res.cols, cleared: res.cleared, lines, gained, dealt };
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  const toJSON = (g) => ({ v: VERSION, seed: g.seed, rng: g.rng, board: g.board.slice(), pieces: g.pieces.slice(), score: g.score, moves: g.moves, lines: g.lines });

  const isCount = (n) => Number.isInteger(n) && n >= 0;
  const isU32 = (n) => Number.isInteger(n) && n >= 0 && n < 4294967296;

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). Cờ thua tính lại từ bàn. */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { seed, rng, board, pieces, score, moves, lines } = raw;
    if (!isU32(seed) || !isU32(rng) || !isCount(score) || !isCount(moves) || !isCount(lines)) return null;
    if (!Array.isArray(board) || board.length !== SIZE * SIZE) return null;
    if (!board.every((v) => Number.isInteger(v) && v >= 0 && v <= COLORS)) return null;
    const full = fullLines(board);
    if (full.rows.length || full.cols.length) return null;
    if (!Array.isArray(pieces) || pieces.length !== 3) return null;
    if (!pieces.every((k) => k === null || (typeof k === 'string' && PIECES[k]))) return null;
    if (!pieces.some(Boolean)) return null;
    const g = { seed, rng, board: board.slice(), pieces: pieces.slice(), score, moves, lines, over: false };
    g.over = isOver(g);
    return g;
  }

  const api = { SIZE, COLORS, PIECES, newGame, deal, canPlace, fitsAnywhere, applyPiece, scoreFor, preview, place, playable, isOver, toJSON, fromJSON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
