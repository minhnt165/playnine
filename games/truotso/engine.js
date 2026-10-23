/* =====================================================================
 * Trượt Số - Engine (chạy được cả trong trình duyệt lẫn Node)
 *   - Không đụng tới DOM: mọi hàm nhận state và trả về state mới (không sửa state cũ)
 *   - Bàn n x n lưu dạng mảng tiles: tiles[i] là số trên ô thứ i (đọc theo hàng), 0 là ô trống
 *   - Thắng khi các số xếp 1..n²-1 theo thứ tự, ô trống ở góc dưới phải
 *   - Xáo: hoán vị ngẫu nhiên rồi sửa tính chẵn lẻ để luôn giải được, không bao giờ ra bàn đã xếp xong
 *   - Hàm ngẫu nhiên truyền vào được (để test)
 * ===================================================================== */
(function (root) {
  'use strict';

  const SIZES = [3, 4, 5];
  const DEFAULT_SIZE = 4;
  const DIRS = ['up', 'down', 'left', 'right'];

  const modeOf = (size) => size + 'x' + size;
  /** '4x4' -> 4; khóa lạ trả về 0. */
  function sizeOf(mode) {
    const m = /^([345])x\1$/.exec(String(mode));
    return m ? Number(m[1]) : 0;
  }
  const MODES = SIZES.map(modeOf);

  /* ---------------- Tiện ích ---------------- */
  /** PRNG có seed (mulberry32), dùng cho test. */
  function seededRandom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Bàn đã xếp xong: 1, 2, ..., n²-1, rồi ô trống. */
  function solvedTiles(size) {
    const out = [];
    for (let i = 1; i < size * size; i++) out.push(i);
    out.push(0);
    return out;
  }

  function isSolved(tiles) {
    const last = tiles.length - 1;
    for (let i = 0; i < last; i++) if (tiles[i] !== i + 1) return false;
    return tiles[last] === 0;
  }

  /** Số ô đã nằm đúng chỗ (không tính ô trống). */
  function inPlace(tiles) {
    let n = 0;
    for (let i = 0; i < tiles.length; i++) if (tiles[i] && tiles[i] === i + 1) n++;
    return n;
  }

  /** Tổng khoảng cách Manhattan của mọi ô tới chỗ đúng (độ "xa" của bàn). */
  function manhattan(tiles, size) {
    let d = 0;
    tiles.forEach((v, i) => {
      if (!v) return;
      const goal = v - 1;
      d += Math.abs(Math.floor(i / size) - Math.floor(goal / size)) + Math.abs((i % size) - (goal % size));
    });
    return d;
  }

  /**
   * Bàn giải được hay không (đích: ô trống ở góc dưới phải).
   * Cạnh lẻ: số nghịch thế chẵn. Cạnh chẵn: số nghịch thế + số thứ tự hàng của ô trống
   * tính từ dưới lên (bắt đầu từ 1) là số lẻ.
   */
  function isSolvable(tiles, size) {
    const nums = tiles.filter((v) => v);
    let inv = 0;
    for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) if (nums[i] > nums[j]) inv++;
    if (size % 2 === 1) return inv % 2 === 0;
    const rowFromBottom = size - Math.floor(tiles.indexOf(0) / size);
    return (inv + rowFromBottom) % 2 === 1;
  }

  /** Mảng có đúng là một hoán vị của 0..n²-1 không. */
  function isPermutation(tiles, size) {
    if (!Array.isArray(tiles) || tiles.length !== size * size) return false;
    const seen = new Array(size * size).fill(false);
    for (const v of tiles) {
      if (!Number.isInteger(v) || v < 0 || v >= size * size || seen[v]) return false;
      seen[v] = true;
    }
    return true;
  }

  /**
   * Xáo bàn: hoán vị ngẫu nhiên (Fisher-Yates); không giải được thì đổi chỗ hai ô số đầu tiên
   * (đổi tính chẵn lẻ nghịch thế). Bàn quá gần đích (Manhattan < n²) thì xáo lại.
   */
  function shuffle(size, rng) {
    const rand = rng || Math.random;
    const n2 = size * size;
    for (let tries = 0; tries < 200; tries++) {
      const t = solvedTiles(size);
      for (let i = n2 - 1; i > 0; i--) {
        const j = Math.min(i, Math.floor(rand() * (i + 1)));
        const x = t[i];
        t[i] = t[j];
        t[j] = x;
      }
      if (!isSolvable(t, size)) {
        const a = t[0] ? 0 : 1;
        const b = t[a + 1] ? a + 1 : a + 2;
        const x = t[a];
        t[a] = t[b];
        t[b] = x;
      }
      if (!isSolved(t) && manhattan(t, size) >= n2) return t;
    }
    // Dự phòng (gần như không xảy ra): đổi chỗ hai ô cuối bằng một nước hợp lệ ngược lại từ đích
    const t = solvedTiles(size);
    t[n2 - 1] = t[n2 - 2];
    t[n2 - 2] = 0;
    return t;
  }

  /* ---------------- Tạo state ---------------- */
  function newGame(size, rng) {
    const s = SIZES.includes(size) ? size : DEFAULT_SIZE;
    return { v: 1, size: s, tiles: shuffle(s, rng), moves: 0 };
  }

  /** Tạo state từ mảng số cho trước (test, khôi phục). Không kiểm tra hợp lệ. */
  function fromTiles(size, tiles, moves) {
    return { v: 1, size, tiles: tiles.slice(), moves: moves || 0 };
  }

  /* ---------------- Nước đi ---------------- */
  /**
   * Ô idx có đi được không: cùng hàng hoặc cùng cột với ô trống (không phải chính ô trống).
   * Ô không kề ô trống thì cả đoạn từ ô đó tới ô trống trượt theo.
   */
  function canMoveAt(state, idx) {
    const n = state.size;
    if (!Number.isInteger(idx) || idx < 0 || idx >= n * n) return false;
    const g = state.tiles.indexOf(0);
    if (idx === g) return false;
    return Math.floor(idx / n) === Math.floor(g / n) || idx % n === g % n;
  }

  /**
   * Chạm ô idx: các ô từ idx tới ô trống trượt một bước về phía ô trống.
   * Trả về {
   *   moved, state,              // state mới (hoặc state cũ nếu không đi được)
   *   slides: [{ v, from, to }], // ô nào trượt từ đâu tới đâu
   *   dir,                       // hướng các ô trượt
   *   solved                     // nước này xếp xong bàn
   * }
   * Trượt cả đoạn chỉ tính là một nước.
   */
  function moveAt(state, idx) {
    const none = { moved: false, state, slides: [], dir: null, solved: false };
    if (isSolved(state.tiles) || !canMoveAt(state, idx)) return none;
    const n = state.size;
    const g = state.tiles.indexOf(0);
    const sameRow = Math.floor(idx / n) === Math.floor(g / n);
    // step: bước chỉ số từ ô trống đi ngược về phía ô được chạm
    const step = sameRow ? (idx < g ? -1 : 1) : idx < g ? -n : n;
    const tiles = state.tiles.slice();
    const slides = [];
    for (let p = g; p !== idx; p += step) {
      tiles[p] = tiles[p + step];
      slides.push({ v: tiles[p], from: p + step, to: p });
    }
    tiles[idx] = 0;
    const dir = sameRow ? (step === 1 ? 'left' : 'right') : step === n ? 'up' : 'down';
    const next = Object.assign({}, state, { tiles, moves: state.moves + 1 });
    return { moved: true, state: next, slides, dir, solved: isSolved(tiles) };
  }

  /** Ô sẽ trượt vào ô trống theo hướng dir (vd. 'left': ô bên phải ô trống trượt sang trái); -1 nếu không có. */
  function indexForDir(state, dir) {
    if (!DIRS.includes(dir)) throw new Error('Hướng không hợp lệ: ' + dir);
    const n = state.size;
    const g = state.tiles.indexOf(0);
    const r = Math.floor(g / n);
    const c = g % n;
    if (dir === 'left') return c + 1 < n ? g + 1 : -1;
    if (dir === 'right') return c > 0 ? g - 1 : -1;
    if (dir === 'up') return r + 1 < n ? g + n : -1;
    return r > 0 ? g - n : -1;
  }

  /** Phím mũi tên / vuốt: đưa một ô theo hướng dir vào ô trống. */
  function moveDir(state, dir) {
    const idx = indexForDir(state, dir);
    if (idx < 0) return { moved: false, state, slides: [], dir: null, solved: false };
    return moveAt(state, idx);
  }

  /* ---------------- Khôi phục từ localStorage ---------------- */
  /**
   * Kiểm tra và chuẩn hóa state đọc từ bộ nhớ. Dữ liệu hỏng, bàn không giải được
   * hoặc đã xếp xong (không còn là ván dở) thì trả về null.
   */
  function restore(obj) {
    if (!obj || typeof obj !== 'object' || obj.v !== 1 || !SIZES.includes(obj.size)) return null;
    if (!isPermutation(obj.tiles, obj.size)) return null;
    if (!isSolvable(obj.tiles, obj.size) || isSolved(obj.tiles)) return null;
    const moves = Number.isInteger(obj.moves) && obj.moves >= 0 ? obj.moves : 0;
    return { v: 1, size: obj.size, tiles: obj.tiles.slice(), moves };
  }

  const api = {
    SIZES,
    DEFAULT_SIZE,
    DIRS,
    MODES,
    modeOf,
    sizeOf,
    seededRandom,
    solvedTiles,
    isSolved,
    isSolvable,
    isPermutation,
    inPlace,
    manhattan,
    shuffle,
    newGame,
    fromTiles,
    canMoveAt,
    moveAt,
    indexForDir,
    moveDir,
    restore,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TruotSo = api;
})(typeof window !== 'undefined' ? window : null);
