/* =====================================================================
 * 2048 - Engine (chạy được cả trong trình duyệt lẫn Node)
 *   - Không đụng tới DOM: mọi hàm nhận state và trả về state mới (không sửa state cũ)
 *   - Mỗi ô số mang một id cố định để giao diện biết ô nào trượt đi đâu,
 *     ô nào gộp lại, ô nào mới sinh (render theo id, không vẽ lại cả lưới)
 *   - Sinh ô: 90% là 2, 10% là 4. Hàm ngẫu nhiên truyền vào được (để test)
 *   - Hoàn tác tối đa MAX_UNDO lần mỗi ván
 * ===================================================================== */
(function (root) {
  'use strict';

  const WIN_VALUE = 2048;
  const MAX_UNDO = 3;
  const SIZES = [3, 4, 5];
  const DEFAULT_SIZE = 4;
  const DIRS = ['up', 'down', 'left', 'right'];
  const FOUR_CHANCE = 0.1;

  /* ---------------- Tiện ích ---------------- */
  const isPow2 = (v) => Number.isInteger(v) && v >= 2 && (v & (v - 1)) === 0;
  const copyCells = (cells) => cells.map((t) => (t ? { id: t.id, v: t.v } : null));

  /** Chỉ số các ô của hàng / cột thứ k, xếp theo thứ tự từ phía ô trượt tới. */
  function lineIndices(size, dir, k) {
    const idx = [];
    for (let j = 0; j < size; j++) {
      let r;
      let c;
      if (dir === 'left') { r = k; c = j; }
      else if (dir === 'right') { r = k; c = size - 1 - j; }
      else if (dir === 'up') { r = j; c = k; }
      else { r = size - 1 - j; c = k; }
      idx.push(r * size + c);
    }
    return idx;
  }

  /**
   * Trượt một dãy giá trị về phía đầu mảng (0 = ô trống).
   * Mỗi ô chỉ được gộp một lần trong một lượt: [2,2,2,2] -> [4,4,0,0].
   */
  function slideLine(line) {
    const vals = line.filter((v) => v);
    const out = [];
    const merges = [];
    let score = 0;
    for (let i = 0; i < vals.length; i++) {
      if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
        out.push(vals[i] * 2);
        score += vals[i] * 2;
        merges.push(out.length - 1);
        i++;
      } else {
        out.push(vals[i]);
      }
    }
    while (out.length < line.length) out.push(0);
    const moved = out.some((v, i) => v !== line[i]);
    return { line: out, score, merges, moved };
  }

  /* ---------------- Tạo / đọc state ---------------- */
  function blankState(size) {
    return {
      v: 1,
      size,
      cells: new Array(size * size).fill(null),
      nextId: 1,
      score: 0,
      moves: 0,
      won: false, // đã chạm WIN_VALUE trong ván này (giữ nguyên kể cả khi hoàn tác)
      keepPlaying: false, // đã chọn "Chơi tiếp" sau khi thắng
      over: false,
      undoLeft: MAX_UNDO,
      history: [], // ảnh chụp trước mỗi nước đi, tối đa undoLeft cái
    };
  }

  function emptyCells(state) {
    const out = [];
    state.cells.forEach((t, i) => { if (!t) out.push(i); });
    return out;
  }

  function maxTile(state) {
    let m = 0;
    for (const t of state.cells) if (t && t.v > m) m = t.v;
    return m;
  }

  function values(state) {
    return state.cells.map((t) => (t ? t.v : 0));
  }

  /** Còn nước đi nào không: còn ô trống hoặc còn hai ô kề nhau cùng giá trị. */
  function canMove(state) {
    const n = state.size;
    const c = state.cells;
    for (let i = 0; i < c.length; i++) {
      if (!c[i]) return true;
      const r = Math.floor(i / n);
      const col = i % n;
      if (col + 1 < n && c[i + 1] && c[i + 1].v === c[i].v) return true;
      if (r + 1 < n && c[i + n] && c[i + n].v === c[i].v) return true;
    }
    return false;
  }

  /**
   * Sinh một ô mới vào ô trống ngẫu nhiên. SỬA TRỰC TIẾP state truyền vào
   * (chỉ dùng nội bộ cho state vừa tạo). Trả về { id, v, at } hoặc null nếu hết chỗ.
   */
  function spawnTile(state, rng) {
    const rand = rng || Math.random;
    const empties = emptyCells(state);
    if (!empties.length) return null;
    const at = empties[Math.min(empties.length - 1, Math.floor(rand() * empties.length))];
    const v = rand() < 1 - FOUR_CHANCE ? 2 : 4;
    const id = state.nextId++;
    state.cells[at] = { id, v };
    return { id, v, at };
  }

  function newGame(size, rng) {
    const s = blankState(SIZES.includes(size) ? size : DEFAULT_SIZE);
    spawnTile(s, rng);
    spawnTile(s, rng);
    return s;
  }

  /** Tạo state từ mảng giá trị (0 = trống). Dùng cho test và khôi phục. */
  function fromValues(size, vals, extra) {
    const s = blankState(size);
    vals.forEach((v, i) => {
      if (v) s.cells[i] = { id: s.nextId++, v };
    });
    if (extra) Object.assign(s, extra);
    s.over = !canMove(s);
    if (maxTile(s) >= WIN_VALUE) s.won = true;
    return s;
  }

  /* ---------------- Nước đi ---------------- */
  function snapshot(state) {
    return { cells: copyCells(state.cells), score: state.score, moves: state.moves };
  }

  /**
   * Thực hiện một nước đi theo hướng dir.
   * Trả về {
   *   moved, state,             // state mới (hoặc state cũ nếu không có gì thay đổi)
   *   gained,                   // điểm cộng thêm
   *   slides: [{ id, from, to }],          // mọi ô cũ trượt tới đâu (kể cả ô bị gộp)
   *   merges: [{ id, v, at, from: [idA, idB] }], // ô mới sinh ra từ việc gộp
   *   spawned: { id, v, at } | null,
   *   reached                   // lần đầu chạm WIN_VALUE trong ván
   * }
   * Không có gì thay đổi thì không sinh ô mới.
   */
  function move(state, dir, rng) {
    if (!DIRS.includes(dir)) throw new Error('Hướng không hợp lệ: ' + dir);
    const none = { moved: false, state, gained: 0, slides: [], merges: [], spawned: null, reached: false };
    if (state.over) return none;

    const n = state.size;
    const cells = new Array(n * n).fill(null);
    const slides = [];
    const merges = [];
    let nextId = state.nextId;
    let gained = 0;

    for (let k = 0; k < n; k++) {
      const idx = lineIndices(n, dir, k);
      const tiles = [];
      for (const i of idx) if (state.cells[i]) tiles.push({ t: state.cells[i], from: i });
      let slot = 0;
      for (let j = 0; j < tiles.length; j++) {
        const a = tiles[j];
        const b = tiles[j + 1];
        const to = idx[slot++];
        if (b && b.t.v === a.t.v) {
          const v = a.t.v * 2;
          const id = nextId++;
          cells[to] = { id, v };
          gained += v;
          slides.push({ id: a.t.id, from: a.from, to }, { id: b.t.id, from: b.from, to });
          merges.push({ id, v, at: to, from: [a.t.id, b.t.id] });
          j++; // ô b đã dùng, không gộp tiếp lần nữa
        } else {
          cells[to] = { id: a.t.id, v: a.t.v };
          slides.push({ id: a.t.id, from: a.from, to });
        }
      }
    }

    const moved = merges.length > 0 || slides.some((s) => s.from !== s.to);
    if (!moved) return none;

    // Chỉ giữ số ảnh chụp bằng số lượt hoàn tác còn lại
    const keep = Math.max(0, state.undoLeft);
    const history = keep ? state.history.concat([snapshot(state)]).slice(-keep) : [];

    const next = Object.assign({}, state, {
      cells,
      nextId,
      score: state.score + gained,
      moves: state.moves + 1,
      history,
    });
    const spawned = spawnTile(next, rng);
    const reached = !state.won && maxTile(next) >= WIN_VALUE;
    if (reached) next.won = true;
    next.over = !canMove(next);
    return { moved: true, state: next, gained, slides, merges, spawned, reached };
  }

  /** Hoàn tác một nước. Trả về state mới, hoặc null nếu hết lượt / không có gì để hoàn tác. */
  function undo(state) {
    if (state.undoLeft <= 0 || !state.history.length) return null;
    const snap = state.history[state.history.length - 1];
    return Object.assign({}, state, {
      cells: copyCells(snap.cells),
      score: snap.score,
      moves: snap.moves,
      history: state.history.slice(0, -1),
      undoLeft: state.undoLeft - 1,
      over: false,
    });
  }

  function canUndo(state) {
    return state.undoLeft > 0 && state.history.length > 0;
  }

  /** Chọn "Chơi tiếp" sau khi đạt 2048. */
  function continuePlaying(state) {
    return Object.assign({}, state, { keepPlaying: true });
  }

  /* ---------------- Khôi phục từ localStorage ---------------- */
  function validCells(cells, size, ids) {
    if (!Array.isArray(cells) || cells.length !== size * size) return null;
    const out = [];
    for (const t of cells) {
      if (t === null) { out.push(null); continue; }
      if (!t || !Number.isInteger(t.id) || t.id < 1 || !isPow2(t.v) || ids.has(t.id)) return null;
      ids.add(t.id);
      out.push({ id: t.id, v: t.v });
    }
    return out;
  }

  /** Kiểm tra và chuẩn hóa state đọc từ bộ nhớ. Dữ liệu hỏng thì trả về null. */
  function restore(obj) {
    if (!obj || typeof obj !== 'object' || obj.v !== 1 || !SIZES.includes(obj.size)) return null;
    const ids = new Set();
    const cells = validCells(obj.cells, obj.size, ids);
    if (!cells) return null;
    const history = [];
    if (Array.isArray(obj.history)) {
      for (const h of obj.history.slice(-MAX_UNDO)) {
        const hc = h && validCells(h.cells, obj.size, new Set());
        if (!hc || !Number.isInteger(h.score) || !Number.isInteger(h.moves)) return null;
        hc.forEach((t) => { if (t) ids.add(t.id); });
        history.push({ cells: hc, score: h.score, moves: h.moves });
      }
    }
    const int = (v, min, def) => (Number.isInteger(v) && v >= min ? v : def);
    let maxId = 0;
    ids.forEach((id) => { if (id > maxId) maxId = id; });
    const s = {
      v: 1,
      size: obj.size,
      cells,
      nextId: Math.max(int(obj.nextId, 1, 1), maxId + 1),
      score: int(obj.score, 0, 0),
      moves: int(obj.moves, 0, 0),
      won: obj.won === true,
      keepPlaying: obj.keepPlaying === true,
      over: false,
      undoLeft: Math.min(MAX_UNDO, int(obj.undoLeft, 0, 0)),
      history: [],
    };
    s.history = s.undoLeft ? history.slice(-s.undoLeft) : [];
    if (maxTile(s) >= WIN_VALUE) s.won = true;
    s.over = !canMove(s);
    return s;
  }

  const api = {
    WIN_VALUE,
    MAX_UNDO,
    SIZES,
    DEFAULT_SIZE,
    DIRS,
    FOUR_CHANCE,
    slideLine,
    lineIndices,
    newGame,
    fromValues,
    move,
    undo,
    canUndo,
    canMove,
    continuePlaying,
    spawnTile,
    emptyCells,
    maxTile,
    values,
    restore,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.Game2048 = api;
})(typeof window !== 'undefined' ? window : null);
