/* =====================================================================
 * Nối Màu - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Bàn vuông size x size, ô đánh số r * size + c; mỗi màu có hai chấm cần nối bằng một đường
 *   - Sinh màn có seed: dựng một đường rắn đi qua mọi ô, xáo bằng phép "backbite", rồi cắt thành các đoạn ≥ 3 ô;
 *     hai đầu mỗi đoạn là hai chấm, nên các đoạn đó chính là một lời giải phủ kín bàn (màn luôn giải được)
 *   - Người chơi có thể tìm lời giải khác: thắng khi mọi cặp được nối và mọi ô được phủ (checkSolution)
 *   - Hàm thuần: nhận trạng thái cũ, trả trạng thái mới (không đổi gì thì trả lại đúng đối tượng cũ)
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const MIN_PATH = 3; // đường ngắn nhất (số ô, tính cả hai chấm)
  const MIN_SIZE = 3;
  const MAX_SIZE = 12;
  const CANDIDATES = 12; // số màn đạt chuẩn dựng thử cho mỗi seed, giữ màn đẹp nhất

  // Mode trên cổng: cỡ bàn và khoảng số màu
  const MODES = {
    '5x5': { size: 5, colors: [4, 6] },
    '7x7': { size: 7, colors: [6, 8] },
    '9x9': { size: 9, colors: [9, 12] },
  };

  /* ---------------- Tiện ích ---------------- */

  /** PRNG mulberry32: cùng seed cho cùng dãy số trong [0, 1). */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const isCell = (size, i) => Number.isInteger(i) && i >= 0 && i < size * size;

  /** Hai ô kề nhau theo hàng / cột (không tính chéo). */
  function adjacent(size, a, b) {
    const ra = Math.floor(a / size);
    const rb = Math.floor(b / size);
    return (ra === rb && Math.abs(a - b) === 1) || Math.abs(a - b) === size;
  }

  function neighbors(size, i) {
    const r = Math.floor(i / size);
    const c = i % size;
    const out = [];
    if (r > 0) out.push(i - size);
    if (r < size - 1) out.push(i + size);
    if (c > 0) out.push(i - 1);
    if (c < size - 1) out.push(i + 1);
    return out;
  }

  /* ---------------- Sinh màn ---------------- */

  /** Đường đi qua mọi ô một lần (đường Hamilton): bắt đầu bằng hình rắn theo hàng rồi xáo bằng backbite. */
  function hamiltonPath(size, rand) {
    const n = size * size;
    const path = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) path.push(r * size + (r % 2 ? size - 1 - c : c));
    }
    const pos = new Array(n);
    const reindex = (from) => { for (let i = from; i < n; i++) pos[path[i]] = i; };
    reindex(0);
    const steps = n * 40;
    for (let s = 0; s < steps; s++) {
      // Backbite: lấy một đầu, nối nó với một ô kề (ô nào cũng nằm trên đường), đảo khúc đuôi phía sau ô đó
      if (rand() < 0.5) {
        path.reverse();
        reindex(0);
      }
      const end = path[n - 1];
      const nb = neighbors(size, end).filter((x) => x !== path[n - 2]);
      const x = nb[Math.floor(rand() * nb.length)];
      const i = pos[x];
      for (let a = i + 1, b = n - 1; a < b; a++, b--) {
        const tmp = path[a];
        path[a] = path[b];
        path[b] = tmp;
      }
      reindex(i + 1);
    }
    return path;
  }

  /** Chia n ô thành k đoạn, mỗi đoạn ≥ MIN_PATH; phần dư rải ngẫu nhiên theo trọng số để độ dài đa dạng. */
  function splitLengths(n, k, rand) {
    const lens = new Array(k).fill(MIN_PATH);
    const weights = lens.map(() => 0.25 + rand());
    const total = weights.reduce((s, w) => s + w, 0);
    for (let extra = n - MIN_PATH * k; extra > 0; extra--) {
      let x = rand() * total;
      let j = 0;
      while (j < k - 1 && x >= weights[j]) x -= weights[j++];
      lens[j]++;
    }
    return lens;
  }

  /** Màn đạt chuẩn: đủ màu, mỗi đường ≥ MIN_PATH ô, hai chấm cùng màu không sát nhau. */
  function goodPuzzle(size, paths, minColors) {
    return paths.length >= minColors &&
      paths.every((p) => p.length >= MIN_PATH && !adjacent(size, p[0], p[p.length - 1]));
  }

  /** Số ô vuông 2x2 nằm trọn trong một đường: càng nhiều thì đường càng uốn khúc thành mảng, càng nhiều cách giải. */
  function blockCount(size, paths) {
    const col = new Array(size * size);
    paths.forEach((p, k) => p.forEach((c) => { col[c] = k; }));
    let n = 0;
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const i = r * size + c;
        if (col[i] === col[i + 1] && col[i] === col[i + size] && col[i] === col[i + size + 1]) n++;
      }
    }
    return n;
  }

  /**
   * Màn theo cỡ bàn và seed: { size, dots: [[a, b], ...], solution: [[ô...], ...] }.
   * Dựng CANDIDATES màn đạt chuẩn rồi giữ màn ít ô vuông 2x2 cùng màu nhất (đường mảnh, giống câu đố viết tay hơn).
   */
  function generate(size, seed) {
    const rand = rng(seed);
    const mode = MODES[size + 'x' + size];
    const n = size * size;
    const [lo, hi] = mode ? mode.colors : [Math.max(1, Math.floor(n / 8)), Math.max(1, Math.floor(n / 5))];
    let best = null;
    let bestScore = Infinity;
    let found = 0;
    for (let attempt = 0; attempt < 2000 && found < CANDIDATES; attempt++) {
      const ham = hamiltonPath(size, rand);
      const k = lo + Math.floor(rand() * (hi - lo + 1));
      const lens = splitLengths(n, k, rand);
      const cand = [];
      let at = 0;
      lens.forEach((len) => {
        cand.push(ham.slice(at, at + len));
        at += len;
      });
      if (!best) best = cand; // phòng khi không màn nào đạt chuẩn (không xảy ra với các mode hiện có)
      if (!goodPuzzle(size, cand, lo)) continue;
      found++;
      const score = blockCount(size, cand);
      if (score < bestScore) {
        best = cand;
        bestScore = score;
      }
    }
    return { size, dots: best.map((p) => [p[0], p[p.length - 1]]), solution: best };
  }

  /* ---------------- Ván chơi ---------------- */

  // Một chỗ dựng ván để thứ tự khóa luôn giống nhau (so sánh / lưu)
  const make = (size, dots, paths, moves, last) => ({ size, dots, paths, moves, last });

  /** Ván trống từ một màn bất kỳ { size, dots }. */
  function fromPuzzle(p) {
    return make(p.size, p.dots.map((d) => d.slice()), p.dots.map(() => []), 0, -1);
  }

  /** Ván mới theo mode ('5x5'…) hoặc cỡ bàn. */
  function newGame(mode, seed) {
    const size = MODES[mode] ? MODES[mode].size : mode;
    return fromPuzzle(generate(size, seed));
  }

  /** Màu có chấm ở ô i, -1 nếu không phải chấm. */
  function dotColor(g, i) {
    for (let k = 0; k < g.dots.length; k++) if (g.dots[k][0] === i || g.dots[k][1] === i) return k;
    return -1;
  }

  /** Màu đang chiếm ô i (đường có ≥ 1 ô), -1 nếu trống. */
  function pathColor(g, i) {
    for (let k = 0; k < g.paths.length; k++) if (g.paths[k].indexOf(i) >= 0) return k;
    return -1;
  }

  /** Đường màu k đã nối hai chấm của nó. */
  function isConnected(g, k) {
    const p = g.paths[k];
    const [a, b] = g.dots[k];
    return p.length >= 2 && ((p[0] === a && p[p.length - 1] === b) || (p[0] === b && p[p.length - 1] === a));
  }

  const connectedCount = (g) => g.dots.reduce((s, d, k) => s + (isConnected(g, k) ? 1 : 0), 0);

  /** Số ô được phủ bởi đường (đường chỉ có một chấm chưa tính). */
  const filledCount = (g) => g.paths.reduce((s, p) => s + (p.length >= 2 ? p.length : 0), 0);

  /**
   * Lời giải phủ kín hợp lệ: mỗi màu một đường đi từ chấm này tới chấm kia qua các ô kề nhau,
   * không ô nào dùng hai lần (kể cả giữa hai đường, nên không cắt nhau và không đi qua chấm màu khác), phủ mọi ô.
   */
  function checkSolution(puzzle, paths) {
    const { size, dots } = puzzle;
    if (!Array.isArray(paths) || paths.length !== dots.length) return false;
    const used = new Set();
    for (let k = 0; k < dots.length; k++) {
      const p = paths[k];
      if (!Array.isArray(p) || p.length < 2) return false;
      const [a, b] = dots[k];
      const s = p[0];
      const e = p[p.length - 1];
      if (!((s === a && e === b) || (s === b && e === a))) return false;
      for (let i = 0; i < p.length; i++) {
        if (!isCell(size, p[i]) || used.has(p[i])) return false;
        if (i > 0 && !adjacent(size, p[i - 1], p[i])) return false;
        used.add(p[i]);
      }
    }
    return used.size === size * size;
  }

  const isWon = (g) => checkSolution(g, g.paths);

  /** Đặt đường màu k; tính một nước khi đổi đường của màu khác màu vừa vẽ. */
  function setPath(g, k, path, paths) {
    const next = (paths || g.paths).slice();
    next[k] = path;
    const moves = g.moves + (k !== g.last ? 1 : 0);
    return make(g.size, g.dots, next, moves, k);
  }

  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  /**
   * Chạm ô i để bắt đầu vẽ: { game, color }.
   * - Chấm: xóa đường cũ của màu đó, vẽ lại từ chấm này
   * - Ô trên một đường: cắt đường tới ô đó (ô cuối thì giữ nguyên) rồi vẽ tiếp
   * - Ô trống hoặc ván đã thắng: color = -1
   */
  function touch(g, i) {
    if (!isCell(g.size, i) || isWon(g)) return { game: g, color: -1 };
    const d = dotColor(g, i);
    if (d >= 0) return { game: same(g.paths[d], [i]) ? g : setPath(g, d, [i]), color: d };
    const k = pathColor(g, i);
    if (k < 0) return { game: g, color: -1 };
    const p = g.paths[k];
    const idx = p.indexOf(i);
    return { game: idx === p.length - 1 ? g : setPath(g, k, p.slice(0, idx + 1)), color: k };
  }

  /**
   * Kéo đầu đường màu k sang ô kề i.
   * - Ô đã có trên chính đường đó: lùi lại tới ô đó
   * - Đường đã nối xong: chỉ được lùi
   * - Chấm màu khác: chặn; chấm thứ hai cùng màu: nối xong
   * - Ô thuộc đường màu khác: cắt đường kia từ ô đó (còn mỗi chấm thì xóa hẳn)
   */
  function extend(g, k, i) {
    if (!isCell(g.size, i) || k < 0 || k >= g.paths.length || isWon(g)) return g;
    const p = g.paths[k];
    if (!p.length || !adjacent(g.size, p[p.length - 1], i)) return g;
    const own = p.indexOf(i);
    if (own >= 0) return setPath(g, k, p.slice(0, own + 1));
    if (isConnected(g, k)) return g;
    const d = dotColor(g, i);
    if (d >= 0 && d !== k) return g;
    let paths = g.paths;
    const other = pathColor(g, i);
    if (other >= 0) {
      paths = paths.slice();
      const cut = paths[other].slice(0, paths[other].indexOf(i));
      paths[other] = cut.length > 1 ? cut : [];
    }
    return setPath(g, k, p.concat([i]), paths);
  }

  /** Xóa đoạn cuối của đường màu k (còn mỗi chấm thì xóa hẳn). */
  function undo(g, k) {
    if (k < 0 || k >= g.paths.length || isWon(g) || !g.paths[k].length) return g;
    const p = g.paths[k].slice(0, -1);
    return setPath(g, k, p.length > 1 ? p : []);
  }

  /** Xóa mọi đường (giữ số nước đã đi). */
  function reset(g) {
    if (isWon(g) || g.paths.every((p) => !p.length)) return g;
    return make(g.size, g.dots, g.dots.map(() => []), g.moves, -1);
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const toJSON = (g) => ({ v: VERSION, size: g.size, dots: g.dots, paths: g.paths, moves: g.moves, last: g.last });

  /** Đường đang vẽ dở hợp lệ: bắt đầu ở một chấm của màu, đi qua ô kề, không lặp ô, dừng khi tới chấm kia. */
  function validPartial(size, dots, k, p, used) {
    if (!Array.isArray(p)) return false;
    if (!p.length) return true;
    const [a, b] = dots[k];
    if (p[0] !== a && p[0] !== b) return false;
    const target = p[0] === a ? b : a;
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (!isCell(size, c) || used.has(c)) return false;
      if (i > 0 && !adjacent(size, p[i - 1], c)) return false;
      if (c === target && i !== p.length - 1) return false;
      // Không đi qua chấm màu khác
      if (dots.some((d, j) => j !== k && (d[0] === c || d[1] === c))) return false;
      used.add(c);
    }
    return true;
  }

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { size, dots, paths, moves, last } = raw;
    if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) return null;
    if (!Array.isArray(dots) || dots.length < 1 || dots.length * 2 > size * size) return null;
    const seen = new Set();
    for (const d of dots) {
      if (!Array.isArray(d) || d.length !== 2) return null;
      for (const c of d) {
        if (!isCell(size, c) || seen.has(c)) return null;
        seen.add(c);
      }
    }
    if (!Array.isArray(paths) || paths.length !== dots.length) return null;
    const used = new Set();
    for (let k = 0; k < paths.length; k++) if (!validPartial(size, dots, k, paths[k], used)) return null;
    if (!Number.isInteger(moves) || moves < 0) return null;
    if (!Number.isInteger(last) || last < -1 || last >= dots.length) return null;
    return make(size, dots.map((d) => d.slice()), paths.map((p) => p.slice()), moves, last);
  }

  const api = {
    VERSION, MIN_PATH, MODES,
    rng, adjacent, generate, fromPuzzle, newGame,
    dotColor, pathColor, isConnected, connectedCount, filledCount, checkSolution, isWon,
    touch, extend, undo, reset, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
