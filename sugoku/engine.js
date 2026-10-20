/* =====================================================================
 * Sudoku - Engine (chạy được cả trong trình duyệt lẫn Node)
 *   - Bảng tra cứu hàng / cột / vùng / peers / đơn vị
 *   - Bộ sinh số ngẫu nhiên có seed (dùng cho ván hằng ngày)
 *   - Solver backtracking + kiểm tra nghiệm duy nhất
 *   - Solver theo kỹ thuật (single, pointing, naked/hidden pair, triple,
 *     X-Wing) dùng để chấm độ khó và sinh gợi ý có giải thích
 *   - Sinh đề theo mức kỹ thuật yêu cầu
 * ===================================================================== */
const Sudoku = (() => {
  const N = 9;
  const CELLS = 81;
  const ALL = 0x1ff; // 9 bit, bit (d-1) = số d khả dụng

  /* ---------------- Bảng tra cứu ---------------- */
  const ROW = new Array(CELLS);
  const COL = new Array(CELLS);
  const BOX = new Array(CELLS);
  const PEERS = new Array(CELLS);
  for (let i = 0; i < CELLS; i++) {
    ROW[i] = Math.floor(i / N);
    COL[i] = i % N;
    BOX[i] = Math.floor(ROW[i] / 3) * 3 + Math.floor(COL[i] / 3);
  }
  for (let i = 0; i < CELLS; i++) {
    const set = [];
    for (let j = 0; j < CELLS; j++) {
      if (j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])) set.push(j);
    }
    PEERS[i] = set;
  }

  const ROW_UNITS = [];
  const COL_UNITS = [];
  const BOX_UNITS = [];
  const UNITS = [];
  for (let u = 0; u < N; u++) {
    const row = [];
    const col = [];
    const box = [];
    for (let k = 0; k < N; k++) {
      row.push(u * N + k);
      col.push(k * N + u);
      box.push((Math.floor(u / 3) * 3 + Math.floor(k / 3)) * N + (u % 3) * 3 + (k % 3));
    }
    ROW_UNITS.push({ type: 'row', index: u, cells: row });
    COL_UNITS.push({ type: 'col', index: u, cells: col });
    BOX_UNITS.push({ type: 'box', index: u, cells: box });
  }
  for (let u = 0; u < N; u++) UNITS.push(ROW_UNITS[u], COL_UNITS[u], BOX_UNITS[u]);
  const CELL_UNITS = [];
  for (let i = 0; i < CELLS; i++) CELL_UNITS.push([ROW_UNITS[ROW[i]], COL_UNITS[COL[i]], BOX_UNITS[BOX[i]]]);

  /* ---------------- Ngẫu nhiên ---------------- */
  let random = Math.random;

  /** PRNG mulberry32: cùng seed thì cho cùng dãy số trên mọi máy. */
  function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Băm chuỗi thành số 32 bit (FNV-1a). */
  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /** Chạy `body` với nguồn ngẫu nhiên `fn`, xong khôi phục lại. */
  function withRandom(fn, body) {
    const prev = random;
    random = fn;
    try {
      return body();
    } finally {
      random = prev;
    }
  }

  function randInt(max) {
    return Math.floor(random() * max);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function bitCount(x) {
    let c = 0;
    while (x) {
      x &= x - 1;
      c++;
    }
    return c;
  }

  function digitsOf(mask) {
    const out = [];
    for (let d = 1; d <= N; d++) if (mask & (1 << (d - 1))) out.push(d);
    return out;
  }

  /* ---------------- Solver backtracking ---------------- */
  function buildCandidates(grid) {
    const rows = new Array(N).fill(0);
    const cols = new Array(N).fill(0);
    const boxes = new Array(N).fill(0);
    for (let i = 0; i < CELLS; i++) {
      const v = grid[i];
      if (v) {
        const bit = 1 << (v - 1);
        if ((rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & bit) return null;
        rows[ROW[i]] |= bit;
        cols[COL[i]] |= bit;
        boxes[BOX[i]] |= bit;
      }
    }
    return { rows, cols, boxes };
  }

  /** Đếm số nghiệm, dừng khi đạt `limit`. Chọn ô ít ứng viên nhất (MRV). */
  function countSolutions(grid, limit = 2) {
    const g = grid.slice();
    const units = buildCandidates(g);
    if (!units) return 0;
    const { rows, cols, boxes } = units;
    let count = 0;

    function search() {
      let best = -1;
      let bestMask = 0;
      let bestCount = 10;
      for (let i = 0; i < CELLS; i++) {
        if (g[i]) continue;
        const mask = ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
        const c = bitCount(mask);
        if (c === 0) return;
        if (c < bestCount) {
          bestCount = c;
          bestMask = mask;
          best = i;
          if (c === 1) break;
        }
      }
      if (best === -1) {
        count++;
        return;
      }
      const r = ROW[best];
      const c = COL[best];
      const b = BOX[best];
      for (let d = 0; d < N; d++) {
        const bit = 1 << d;
        if (!(bestMask & bit)) continue;
        g[best] = d + 1;
        rows[r] |= bit;
        cols[c] |= bit;
        boxes[b] |= bit;
        search();
        rows[r] &= ~bit;
        cols[c] &= ~bit;
        boxes[b] &= ~bit;
        g[best] = 0;
        if (count >= limit) return;
      }
    }

    search();
    return count;
  }

  /** Giải lưới, trả về mảng 81 phần tử hoặc null nếu vô nghiệm. */
  function solve(grid) {
    const g = grid.slice();
    const units = buildCandidates(g);
    if (!units) return null;
    const { rows, cols, boxes } = units;

    function search() {
      let best = -1;
      let bestMask = 0;
      let bestCount = 10;
      for (let i = 0; i < CELLS; i++) {
        if (g[i]) continue;
        const mask = ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
        const c = bitCount(mask);
        if (c === 0) return false;
        if (c < bestCount) {
          bestCount = c;
          bestMask = mask;
          best = i;
          if (c === 1) break;
        }
      }
      if (best === -1) return true;
      const r = ROW[best];
      const c = COL[best];
      const b = BOX[best];
      for (let d = 0; d < N; d++) {
        const bit = 1 << d;
        if (!(bestMask & bit)) continue;
        g[best] = d + 1;
        rows[r] |= bit;
        cols[c] |= bit;
        boxes[b] |= bit;
        if (search()) return true;
        rows[r] &= ~bit;
        cols[c] &= ~bit;
        boxes[b] &= ~bit;
        g[best] = 0;
      }
      return false;
    }

    return search() ? g : null;
  }

  /* ---------------- Sinh đề ---------------- */
  function generateFullGrid() {
    const g = new Array(CELLS).fill(0);
    const rows = new Array(N).fill(0);
    const cols = new Array(N).fill(0);
    const boxes = new Array(N).fill(0);

    function fill(i) {
      if (i === CELLS) return true;
      const r = ROW[i];
      const c = COL[i];
      const b = BOX[i];
      const used = rows[r] | cols[c] | boxes[b];
      const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      for (const d of digits) {
        const bit = 1 << (d - 1);
        if (used & bit) continue;
        g[i] = d;
        rows[r] |= bit;
        cols[c] |= bit;
        boxes[b] |= bit;
        if (fill(i + 1)) return true;
        rows[r] &= ~bit;
        cols[c] &= ~bit;
        boxes[b] &= ~bit;
        g[i] = 0;
      }
      return false;
    }

    fill(0);
    return g;
  }

  /** Xóa dần ô theo thứ tự ngẫu nhiên, chỉ giữ thao tác xóa nếu đề vẫn có đúng một nghiệm. */
  function carve(solution, targetGivens) {
    const puzzle = solution.slice();
    let givens = CELLS;
    const order = shuffle([...Array(CELLS).keys()]);
    for (const idx of order) {
      if (givens <= targetGivens) break;
      const backup = puzzle[idx];
      puzzle[idx] = 0;
      if (countSolutions(puzzle, 2) === 1) {
        givens--;
      } else {
        puzzle[idx] = backup;
      }
    }
    return { puzzle, givens };
  }

  /* ---------------- Solver theo kỹ thuật ---------------- */
  // level: mức kỹ thuật, dùng để chấm độ khó. LEVEL_ADVANCED = cần kỹ thuật ngoài danh sách.
  const TECHNIQUES = {
    'naked-single': { level: 1, label: 'Ô chỉ còn một số' },
    'hidden-single': { level: 1, label: 'Số chỉ có một vị trí' },
    pointing: { level: 2, label: 'Cặp chỉ hướng' },
    claiming: { level: 2, label: 'Rút gọn theo hàng/cột' },
    'naked-pair': { level: 2, label: 'Cặp trần' },
    'hidden-pair': { level: 3, label: 'Cặp ẩn' },
    'naked-triple': { level: 3, label: 'Bộ ba trần' },
    'hidden-triple': { level: 3, label: 'Bộ ba ẩn' },
    'x-wing': { level: 3, label: 'X-Wing' },
    'xy-wing': { level: 3, label: 'XY-Wing' },
    swordfish: { level: 3, label: 'Swordfish' },
  };
  const LEVEL_ADVANCED = 4;

  /** Lưới ứng viên: vals[i] = số đã điền (0 = trống), cands[i] = bitmask số còn có thể điền. */
  function makeGrid(board) {
    const vals = board.slice();
    const cands = new Array(CELLS).fill(0);
    for (let i = 0; i < CELLS; i++) {
      if (vals[i]) continue;
      let used = 0;
      for (const p of PEERS[i]) if (vals[p]) used |= 1 << (vals[p] - 1);
      cands[i] = ALL & ~used;
    }
    return { vals, cands };
  }

  function applyStep(g, step) {
    if (step.type === 'place') {
      const bit = 1 << (step.value - 1);
      g.vals[step.idx] = step.value;
      g.cands[step.idx] = 0;
      for (const p of PEERS[step.idx]) g.cands[p] &= ~bit;
    } else {
      for (const e of step.eliminations) g.cands[e.idx] &= ~(1 << (e.digit - 1));
    }
  }

  /** Các ô trong `cells` còn ứng viên `bit`. */
  function spots(g, cells, bit) {
    const s = [];
    for (const c of cells) if (g.cands[c] & bit) s.push(c);
    return s;
  }

  /** Danh sách {idx, digit} có thể loại: ứng viên trong `mask` ở các ô `cells` (trừ `skip`). */
  function elimsOf(g, cells, mask, skip) {
    const out = [];
    for (const c of cells) {
      if (skip && skip.includes(c)) continue;
      const hit = g.cands[c] & mask;
      if (!hit) continue;
      for (const d of digitsOf(hit)) out.push({ idx: c, digit: d });
    }
    return out;
  }

  function union(a, b) {
    const s = a.slice();
    for (const x of b) if (!s.includes(x)) s.push(x);
    return s;
  }

  function nakedSingleAt(g, idx) {
    const m = g.cands[idx];
    if (g.vals[idx] || !m || m & (m - 1)) return null;
    const value = 31 - Math.clz32(m) + 1;
    const reason = PEERS[idx].filter((p) => g.vals[p] !== 0);
    return { type: 'place', technique: 'naked-single', idx, value, reason, unit: PEERS[idx] };
  }

  function findNakedSingle(g) {
    for (let i = 0; i < CELLS; i++) {
      const s = nakedSingleAt(g, i);
      if (s) return s;
    }
    return null;
  }

  function hiddenSingleIn(g, unit, d) {
    const bit = 1 << (d - 1);
    if (unit.cells.some((c) => g.vals[c] === d)) return null;
    const s = spots(g, unit.cells, bit);
    if (s.length !== 1) return null;
    const idx = s[0];
    const reason = [];
    for (const c of unit.cells) {
      if (g.vals[c] || c === idx) continue;
      const blocker = PEERS[c].find((p) => g.vals[p] === d);
      if (blocker !== undefined && !reason.includes(blocker)) reason.push(blocker);
    }
    return { type: 'place', technique: 'hidden-single', idx, value: d, digit: d, reason, unit: unit.cells, unitRef: unit };
  }

  function findHiddenSingle(g) {
    for (const unit of UNITS) {
      for (let d = 1; d <= N; d++) {
        const s = hiddenSingleIn(g, unit, d);
        if (s) return s;
      }
    }
    return null;
  }

  /** Single (naked hoặc hidden) tại đúng ô idx, nếu có. */
  function singleAt(g, idx) {
    if (g.vals[idx]) return null;
    const ns = nakedSingleAt(g, idx);
    if (ns) return ns;
    for (const unit of CELL_UNITS[idx]) {
      for (const d of digitsOf(g.cands[idx])) {
        const hs = hiddenSingleIn(g, unit, d);
        if (hs && hs.idx === idx) return hs;
      }
    }
    return null;
  }

  /** Trong vùng, số d chỉ nằm trên một hàng/cột → loại d khỏi phần còn lại của hàng/cột đó. */
  function findPointing(g) {
    for (const box of BOX_UNITS) {
      for (let d = 1; d <= N; d++) {
        const bit = 1 << (d - 1);
        const s = spots(g, box.cells, bit);
        if (s.length < 2) continue;
        for (const [lines, lineIdx] of [
          [ROW_UNITS, ROW],
          [COL_UNITS, COL],
        ]) {
          const li = lineIdx[s[0]];
          if (!s.every((c) => lineIdx[c] === li)) continue;
          const line = lines[li];
          const eliminations = elimsOf(
            g,
            line.cells.filter((c) => BOX[c] !== box.index),
            bit
          );
          if (eliminations.length) {
            return {
              type: 'eliminate',
              technique: 'pointing',
              digit: d,
              eliminations,
              reason: s,
              unit: union(box.cells, line.cells),
              boxUnit: box,
              lineUnit: line,
            };
          }
        }
      }
    }
    return null;
  }

  /** Trong hàng/cột, số d chỉ nằm trong một vùng → loại d khỏi phần còn lại của vùng. */
  function findClaiming(g) {
    for (const line of ROW_UNITS.concat(COL_UNITS)) {
      const lineIdx = line.type === 'row' ? ROW : COL;
      for (let d = 1; d <= N; d++) {
        const bit = 1 << (d - 1);
        const s = spots(g, line.cells, bit);
        if (s.length < 2) continue;
        const b = BOX[s[0]];
        if (!s.every((c) => BOX[c] === b)) continue;
        const box = BOX_UNITS[b];
        const eliminations = elimsOf(
          g,
          box.cells.filter((c) => lineIdx[c] !== line.index),
          bit
        );
        if (eliminations.length) {
          return {
            type: 'eliminate',
            technique: 'claiming',
            digit: d,
            eliminations,
            reason: s,
            unit: union(box.cells, line.cells),
            boxUnit: box,
            lineUnit: line,
          };
        }
      }
    }
    return null;
  }

  /** Hai ô trong một đơn vị có cùng đúng hai ứng viên → loại hai số đó khỏi các ô khác. */
  function findNakedPair(g) {
    for (const unit of UNITS) {
      const two = unit.cells.filter((c) => bitCount(g.cands[c]) === 2);
      for (let i = 0; i < two.length; i++) {
        for (let j = i + 1; j < two.length; j++) {
          const a = two[i];
          const b = two[j];
          if (g.cands[a] !== g.cands[b]) continue;
          const mask = g.cands[a];
          const eliminations = elimsOf(g, unit.cells, mask, [a, b]);
          if (eliminations.length) {
            return {
              type: 'eliminate',
              technique: 'naked-pair',
              cells: [a, b],
              digits: digitsOf(mask),
              eliminations,
              reason: [a, b],
              unit: unit.cells,
              unitRef: unit,
            };
          }
        }
      }
    }
    return null;
  }

  /** Hai số chỉ xuất hiện ở đúng hai ô của đơn vị → hai ô đó không chứa số nào khác. */
  function findHiddenPair(g) {
    for (const unit of UNITS) {
      for (let d1 = 1; d1 <= N; d1++) {
        const s1 = spots(g, unit.cells, 1 << (d1 - 1));
        if (s1.length !== 2) continue;
        for (let d2 = d1 + 1; d2 <= N; d2++) {
          const s2 = spots(g, unit.cells, 1 << (d2 - 1));
          if (s2.length !== 2 || s2[0] !== s1[0] || s2[1] !== s1[1]) continue;
          const mask = (1 << (d1 - 1)) | (1 << (d2 - 1));
          const eliminations = elimsOf(g, s1, ALL & ~mask);
          if (eliminations.length) {
            return {
              type: 'eliminate',
              technique: 'hidden-pair',
              cells: s1,
              digits: [d1, d2],
              eliminations,
              reason: s1,
              unit: unit.cells,
              unitRef: unit,
            };
          }
        }
      }
    }
    return null;
  }

  /** Ba ô trong đơn vị chỉ chứa tổng cộng ba ứng viên → loại ba số đó khỏi các ô khác. */
  function findNakedTriple(g) {
    for (const unit of UNITS) {
      const cs = unit.cells.filter((c) => {
        const n = bitCount(g.cands[c]);
        return n === 2 || n === 3;
      });
      for (let i = 0; i < cs.length; i++) {
        for (let j = i + 1; j < cs.length; j++) {
          for (let k = j + 1; k < cs.length; k++) {
            const mask = g.cands[cs[i]] | g.cands[cs[j]] | g.cands[cs[k]];
            if (bitCount(mask) !== 3) continue;
            const cells = [cs[i], cs[j], cs[k]];
            const eliminations = elimsOf(g, unit.cells, mask, cells);
            if (eliminations.length) {
              return {
                type: 'eliminate',
                technique: 'naked-triple',
                cells,
                digits: digitsOf(mask),
                eliminations,
                reason: cells,
                unit: unit.cells,
                unitRef: unit,
              };
            }
          }
        }
      }
    }
    return null;
  }

  /** X-Wing: số d ở hai hàng chỉ có thể nằm ở cùng hai cột → loại d khỏi phần còn lại của hai cột (và ngược lại). */
  function findXWing(g) {
    for (let d = 1; d <= N; d++) {
      const bit = 1 << (d - 1);
      for (const [lines, cross, lineIdx, crossIdx] of [
        [ROW_UNITS, COL_UNITS, ROW, COL],
        [COL_UNITS, ROW_UNITS, COL, ROW],
      ]) {
        const pairs = [];
        for (const line of lines) {
          const s = spots(g, line.cells, bit);
          if (s.length === 2) pairs.push({ line, s, k1: crossIdx[s[0]], k2: crossIdx[s[1]] });
        }
        for (let i = 0; i < pairs.length; i++) {
          for (let j = i + 1; j < pairs.length; j++) {
            const p = pairs[i];
            const q = pairs[j];
            if (p.k1 !== q.k1 || p.k2 !== q.k2) continue;
            const eliminations = [];
            for (const k of [p.k1, p.k2]) {
              for (const c of cross[k].cells) {
                if (lineIdx[c] === p.line.index || lineIdx[c] === q.line.index) continue;
                if (g.cands[c] & bit) eliminations.push({ idx: c, digit: d });
              }
            }
            if (eliminations.length) {
              return {
                type: 'eliminate',
                technique: 'x-wing',
                digit: d,
                eliminations,
                reason: p.s.concat(q.s),
                unit: union(cross[p.k1].cells, cross[p.k2].cells),
                lines: [p.line, q.line],
                crossLines: [cross[p.k1], cross[p.k2]],
              };
            }
          }
        }
      }
    }
    return null;
  }

  /** Ba số chỉ xuất hiện trong đúng ba ô của đơn vị → ba ô đó không chứa số nào khác. */
  function findHiddenTriple(g) {
    for (const unit of UNITS) {
      const sp = [];
      for (let d = 1; d <= N; d++) {
        const s = spots(g, unit.cells, 1 << (d - 1));
        sp.push(s.length >= 2 && s.length <= 3 ? s : null);
      }
      for (let a = 1; a <= N; a++) {
        if (!sp[a - 1]) continue;
        for (let b = a + 1; b <= N; b++) {
          if (!sp[b - 1]) continue;
          for (let c = b + 1; c <= N; c++) {
            if (!sp[c - 1]) continue;
            const cells = union(union(sp[a - 1], sp[b - 1]), sp[c - 1]);
            if (cells.length !== 3) continue;
            const mask = (1 << (a - 1)) | (1 << (b - 1)) | (1 << (c - 1));
            const eliminations = elimsOf(g, cells, ALL & ~mask);
            if (eliminations.length) {
              return {
                type: 'eliminate',
                technique: 'hidden-triple',
                cells,
                digits: [a, b, c],
                eliminations,
                reason: cells,
                unit: unit.cells,
                unitRef: unit,
              };
            }
          }
        }
      }
    }
    return null;
  }

  /** XY-Wing: ô trụ {x,y}, hai ô cánh {x,z} và {y,z} cùng nhìn thấy trụ → loại z khỏi ô nhìn thấy cả hai cánh. */
  function findXYWing(g) {
    for (let pivot = 0; pivot < CELLS; pivot++) {
      const pm = g.cands[pivot];
      if (bitCount(pm) !== 2) continue;
      const wings = PEERS[pivot].filter((w) => bitCount(g.cands[w]) === 2 && g.cands[w] !== pm && (g.cands[w] & pm));
      for (let i = 0; i < wings.length; i++) {
        for (let j = i + 1; j < wings.length; j++) {
          const w1 = wings[i];
          const w2 = wings[j];
          const m1 = g.cands[w1];
          const m2 = g.cands[w2];
          if ((m1 & pm) === (m2 & pm)) continue; // hai cánh phải lấy hai số khác nhau của trụ
          const z = m1 & m2 & ~pm;
          if (!z || bitCount(z) !== 1) continue;
          const eliminations = [];
          for (const c of PEERS[w1]) {
            if (c === w2 || c === pivot || !(g.cands[c] & z)) continue;
            if (PEERS[w2].includes(c)) eliminations.push({ idx: c, digit: digitsOf(z)[0] });
          }
          if (eliminations.length) {
            return {
              type: 'eliminate',
              technique: 'xy-wing',
              pivot,
              wings: [w1, w2],
              digit: digitsOf(z)[0],
              pivotDigits: digitsOf(pm),
              eliminations,
              reason: [pivot, w1, w2],
              unit: union(PEERS[w1], PEERS[w2]),
            };
          }
        }
      }
    }
    return null;
  }

  /** Swordfish: số d ở ba hàng chỉ nằm trong cùng ba cột → loại d khỏi phần còn lại của ba cột (và ngược lại). */
  function findSwordfish(g) {
    for (let d = 1; d <= N; d++) {
      const bit = 1 << (d - 1);
      for (const [lines, cross, lineIdx, crossIdx] of [
        [ROW_UNITS, COL_UNITS, ROW, COL],
        [COL_UNITS, ROW_UNITS, COL, ROW],
      ]) {
        const cand = [];
        for (const line of lines) {
          const s = spots(g, line.cells, bit);
          if (s.length === 2 || s.length === 3) cand.push({ line, s, keys: s.map((c) => crossIdx[c]) });
        }
        for (let i = 0; i < cand.length; i++) {
          for (let j = i + 1; j < cand.length; j++) {
            for (let k = j + 1; k < cand.length; k++) {
              const keys = union(union(cand[i].keys, cand[j].keys), cand[k].keys);
              if (keys.length !== 3) continue;
              const base = [cand[i].line.index, cand[j].line.index, cand[k].line.index];
              const eliminations = [];
              for (const key of keys) {
                for (const c of cross[key].cells) {
                  if (base.includes(lineIdx[c])) continue;
                  if (g.cands[c] & bit) eliminations.push({ idx: c, digit: d });
                }
              }
              if (eliminations.length) {
                return {
                  type: 'eliminate',
                  technique: 'swordfish',
                  digit: d,
                  eliminations,
                  reason: cand[i].s.concat(cand[j].s, cand[k].s),
                  unit: keys.reduce((acc, key) => union(acc, cross[key].cells), []),
                  lines: [cand[i].line, cand[j].line, cand[k].line],
                  crossLines: keys.map((key) => cross[key]),
                };
              }
            }
          }
        }
      }
    }
    return null;
  }

  const FINDERS = [
    findNakedSingle,
    findHiddenSingle,
    findPointing,
    findClaiming,
    findNakedPair,
    findHiddenPair,
    findNakedTriple,
    findHiddenTriple,
    findXWing,
    findXYWing,
    findSwordfish,
  ];

  /** Bước suy luận tiếp theo (kỹ thuật dễ nhất áp dụng được), hoặc null nếu bế tắc. */
  function nextStep(g) {
    for (const f of FINDERS) {
      const s = f(g);
      if (s) return s;
    }
    return null;
  }

  /**
   * Chấm độ khó: giải bằng các kỹ thuật theo thứ tự dễ → khó, trả về mức
   * kỹ thuật cao nhất phải dùng. Bế tắc → LEVEL_ADVANCED.
   */
  function grade(puzzle) {
    const g = makeGrid(puzzle);
    let level = 0;
    const counts = {};
    for (;;) {
      let done = true;
      for (let i = 0; i < CELLS; i++) {
        if (g.vals[i]) continue;
        done = false;
        if (!g.cands[i]) return { level: LEVEL_ADVANCED, counts, solved: false };
      }
      if (done) return { level, counts, solved: true };
      const step = nextStep(g);
      if (!step) return { level: LEVEL_ADVANCED, counts, solved: false };
      const t = TECHNIQUES[step.technique];
      if (t.level > level) level = t.level;
      counts[step.technique] = (counts[step.technique] || 0) + 1;
      applyStep(g, step);
    }
  }

  /**
   * Sinh đề theo yêu cầu: spec = { givens, minLevel, maxLevel }.
   * Thử nhiều lần cho tới khi mức kỹ thuật nằm trong [minLevel, maxLevel];
   * nếu hết lượt thì trả về đề gần yêu cầu nhất.
   */
  function generatePuzzle(spec, maxAttempts = 40) {
    if (typeof spec === 'number') spec = { givens: spec };
    const minLevel = spec.minLevel || 1;
    const maxLevel = spec.maxLevel || LEVEL_ADVANCED;
    let best = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const solution = generateFullGrid();
      const { puzzle, givens } = carve(solution, spec.givens);
      const level = grade(puzzle).level;
      const miss = level < minLevel ? minLevel - level : level > maxLevel ? level - maxLevel : 0;
      const cand = { puzzle, solution, givens, level, attempts: attempt + 1 };
      if (miss === 0) return cand;
      if (!best || miss < best.miss) best = { ...cand, miss };
    }
    return best;
  }

  return {
    CELLS,
    ROW,
    COL,
    BOX,
    PEERS,
    UNITS,
    ROW_UNITS,
    COL_UNITS,
    BOX_UNITS,
    CELL_UNITS,
    TECHNIQUES,
    LEVEL_ADVANCED,
    seededRandom,
    hashString,
    withRandom,
    digitsOf,
    countSolutions,
    solve,
    generateFullGrid,
    generatePuzzle,
    makeGrid,
    applyStep,
    nextStep,
    singleAt,
    grade,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Sudoku;
}
