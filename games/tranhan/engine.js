/* =====================================================================
 * Tranh Ẩn (Nonogram) - Engine (chạy được cả trong trình duyệt lẫn Node, không đụng DOM)
 *   - Tính gợi ý số của hàng / cột
 *   - Bộ giải theo dòng (line solver): suy ra ô chắc chắn tô / chắc chắn trống trên một dòng
 *   - Đếm nghiệm (lan truyền theo dòng + quay lui) để kiểm tra đề có nghiệm duy nhất
 *   - Bộ tranh vẽ sẵn (chuỗi ký tự), tranh ngẫu nhiên, tranh hằng ngày (PRNG có seed)
 *   - Trạng thái ván: tô / đánh dấu X, hoàn tác / làm lại, tự gạch dòng xong, gợi ý
 * Trạng thái ván là object thuần (mảng số) nên JSON.stringify được ngay.
 * ===================================================================== */
const Nonogram = (() => {
  /* Trạng thái từng ô của người chơi */
  const EMPTY = 0;
  const FILL = 1;
  const CROSS = 2;
  /** X do tô sai khi bật "Kiểm tra lỗi" (hiển thị màu đỏ, về logic giống CROSS). */
  const MISS = 3;

  /* Giá trị ô trong bộ giải: -1 chưa biết, 0 trống, 1 tô */
  const UNKNOWN = -1;

  const SIZES = [5, 10, 15];
  const SIZE_LABELS = { 5: 'Nhỏ', 10: 'Vừa', 15: 'Lớn' };
  const DAILY_SIZE = 10;
  const HINTS_PER_PUZZLE = 3;
  const HISTORY_LIMIT = 400;
  /** Mật độ ô tô của tranh ngẫu nhiên theo cỡ (dày hơn thì dễ có nghiệm duy nhất hơn). */
  const RANDOM_DENSITY = { 5: 0.5, 10: 0.5, 15: 0.52 };
  const GENERATE_TRIES = 600;

  /* ---------------- Ngẫu nhiên ---------------- */

  /** PRNG mulberry32: cùng seed thì cho cùng dãy số trên mọi máy. */
  function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Băm chuỗi thành số 32 bit không dấu (FNV-1a). */
  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /** Seed của tranh hằng ngày, dateKey dạng 'YYYY-MM-DD'. */
  function dailySeed(dateKey) {
    return hashString('playnine-tranhan-daily-' + dateKey);
  }

  /* ---------------- Gợi ý số ---------------- */

  /** Gợi ý của một dòng: độ dài các đoạn ô tô liên tiếp. Dòng trống cho mảng rỗng. */
  function lineClue(line) {
    const out = [];
    let run = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === 1) run++;
      else if (run) {
        out.push(run);
        run = 0;
      }
    }
    if (run) out.push(run);
    return out;
  }

  /** Lấy hàng r / cột c của lưới phẳng rộng w (cao h). */
  function rowOf(grid, w, r) {
    return grid.slice(r * w, r * w + w);
  }
  function colOf(grid, w, h, c) {
    const out = new Array(h);
    for (let r = 0; r < h; r++) out[r] = grid[r * w + c];
    return out;
  }

  /** Gợi ý của mọi hàng và cột từ lời giải (mảng 0/1). */
  function cluesOf(sol, w, h) {
    const rows = [];
    const cols = [];
    for (let r = 0; r < h; r++) rows.push(lineClue(rowOf(sol, w, r)));
    for (let c = 0; c < w; c++) cols.push(lineClue(colOf(sol, w, h, c)));
    return { rows, cols };
  }

  const sameClue = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  /* ---------------- Bộ giải theo dòng ---------------- */

  /**
   * Giải một dòng: clue là mảng độ dài đoạn, line là mảng -1/0/1.
   * Trả về mảng mới chứa mọi ô suy ra được (giao của mọi cách đặt hợp lệ),
   * hoặc null nếu dòng mâu thuẫn (không có cách đặt nào).
   * Quy hoạch động tiến / lùi: O(n * k).
   */
  function solveLine(clue, line) {
    const n = line.length;
    const k = clue.length;
    // zeros[i]: số ô đã biết là trống trong [0, i) để kiểm tra nhanh một đoạn có đặt được không
    const zeros = new Array(n + 1).fill(0);
    for (let i = 0; i < n; i++) zeros[i + 1] = zeros[i] + (line[i] === 0 ? 1 : 0);
    const fits = (s, len) => s + len <= n && zeros[s + len] - zeros[s] === 0;

    // fw[i][j]: [0, i) đặt được đúng j đoạn đầu, và ô i - 1 (nếu có) không thuộc đoạn đang mở
    const fw = [];
    for (let i = 0; i <= n; i++) fw.push(new Array(k + 1).fill(false));
    fw[0][0] = true;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= k; j++) {
        if (!fw[i][j]) continue;
        if (line[i] !== 1) fw[i + 1][j] = true;
        if (j < k && fits(i, clue[j])) {
          const e = i + clue[j];
          if (e === n) fw[n][j + 1] = true;
          else if (line[e] !== 1) fw[e + 1][j + 1] = true;
        }
      }
    }
    if (!fw[n][k]) return null;

    // bw[i][j]: [i, n) đặt được các đoạn j..k-1
    const bw = [];
    for (let i = 0; i <= n; i++) bw.push(new Array(k + 1).fill(false));
    bw[n][k] = true;
    for (let i = n - 1; i >= 0; i--) {
      for (let j = k; j >= 0; j--) {
        let ok = line[i] !== 1 && bw[i + 1][j];
        if (!ok && j < k && fits(i, clue[j])) {
          const e = i + clue[j];
          ok = e === n ? bw[n][j + 1] : line[e] !== 1 && bw[e + 1][j + 1];
        }
        bw[i][j] = ok;
      }
    }

    const canEmpty = new Array(n).fill(false);
    const fillDiff = new Array(n + 1).fill(0);
    for (let i = 0; i < n; i++) {
      if (line[i] === 1) continue;
      for (let j = 0; j <= k; j++) {
        if (fw[i][j] && bw[i + 1][j]) {
          canEmpty[i] = true;
          break;
        }
      }
    }
    for (let j = 0; j < k; j++) {
      const len = clue[j];
      for (let s = 0; s + len <= n; s++) {
        if (!fw[s][j] || !fits(s, len)) continue;
        const e = s + len;
        const after = e === n ? bw[n][j + 1] : line[e] !== 1 && bw[e + 1][j + 1];
        if (!after) continue;
        fillDiff[s]++;
        fillDiff[e]--;
        if (e < n) canEmpty[e] = true; // ô ngăn cách ngay sau đoạn
      }
    }
    const out = new Array(n);
    let run = 0;
    for (let i = 0; i < n; i++) {
      run += fillDiff[i];
      const canFill = run > 0;
      if (!canFill && !canEmpty[i]) return null;
      out[i] = canFill && canEmpty[i] ? UNKNOWN : canFill ? 1 : 0;
    }
    return out;
  }

  /**
   * Lan truyền theo dòng tới điểm dừng. grid (mảng -1/0/1) bị sửa tại chỗ.
   * Trả về false nếu gặp mâu thuẫn.
   */
  function propagate(clues, w, h, grid) {
    // Hàng đợi dòng cần xét lại: 0..h-1 là hàng, h..h+w-1 là cột
    const queued = new Array(h + w).fill(true);
    const queue = [];
    for (let i = 0; i < h + w; i++) queue.push(i);
    while (queue.length) {
      const id = queue.shift();
      queued[id] = false;
      const isRow = id < h;
      const idx = isRow ? id : id - h;
      const len = isRow ? w : h;
      const line = new Array(len);
      for (let t = 0; t < len; t++) line[t] = grid[isRow ? idx * w + t : t * w + idx];
      if (line.indexOf(UNKNOWN) < 0) {
        if (!sameClue(lineClue(line), isRow ? clues.rows[idx] : clues.cols[idx])) return false;
        continue;
      }
      const res = solveLine(isRow ? clues.rows[idx] : clues.cols[idx], line);
      if (!res) return false;
      for (let t = 0; t < len; t++) {
        if (line[t] !== UNKNOWN || res[t] === UNKNOWN) continue;
        const cell = isRow ? idx * w + t : t * w + idx;
        grid[cell] = res[t];
        const other = isRow ? h + t : t; // dòng vuông góc đi qua ô vừa biết
        if (!queued[other]) {
          queued[other] = true;
          queue.push(other);
        }
      }
    }
    return true;
  }

  /** Giải chỉ bằng suy luận theo dòng. Trả về { grid, ok, done }. */
  function lineSolve(clues, w, h, start) {
    const grid = start ? start.slice() : new Array(w * h).fill(UNKNOWN);
    const ok = propagate(clues, w, h, grid);
    return { grid, ok, done: ok && grid.indexOf(UNKNOWN) < 0 };
  }

  /** Lời giải có giải được hoàn toàn bằng suy luận theo dòng không (kéo theo nghiệm duy nhất). */
  function isLineSolvable(sol, w, h) {
    return lineSolve(cluesOf(sol, w, h), w, h).done;
  }

  /**
   * Đếm số nghiệm (dừng khi đạt limit): lan truyền theo dòng, kẹt thì thử cả hai giá trị
   * của một ô chưa biết. Trả về { count, solution } (solution là nghiệm đầu tiên tìm được).
   */
  function countSolutions(clues, w, h, limit) {
    const max = limit || 2;
    let count = 0;
    let first = null;
    const search = (grid) => {
      if (count >= max) return;
      if (!propagate(clues, w, h, grid)) return;
      const u = grid.indexOf(UNKNOWN);
      if (u < 0) {
        count++;
        if (!first) first = grid.slice();
        return;
      }
      for (const v of [1, 0]) {
        const next = grid.slice();
        next[u] = v;
        search(next);
        if (count >= max) return;
      }
    };
    search(new Array(w * h).fill(UNKNOWN));
    return { count, solution: first };
  }

  /** Đề có đúng một nghiệm không. */
  function isUnique(sol, w, h) {
    return countSolutions(cluesOf(sol, w, h), w, h, 2).count === 1;
  }

  /* ---------------- Bộ tranh vẽ sẵn ---------------- */
  /* Mỗi tranh: id, tên (chỉ hiện khi giải xong), lưới ký tự ('.' là ô trống, chữ cái là ô tô
   * theo màu trong bảng màu của tranh; ký tự không có trong bảng màu thì dùng màu nhấn). */
  const PICTURES = [
    /* ----- Bộ 5x5 ----- */
    {
      id: 'tim', title: 'Trái tim', palette: { a: '#d64545' },
      rows: [
        '.a.a.',
        'aaaaa',
        'aaaaa',
        '.aaa.',
        '..a..',
      ],
    },
    {
      id: 'ngoi-sao', title: 'Ngôi sao', palette: { a: '#f0b429' },
      rows: [
        '..a..',
        'aaaaa',
        '.aaa.',
        '.a.a.',
        'a...a',
      ],
    },
    {
      id: 'ngoi-nha', title: 'Ngôi nhà', palette: { a: '#c0392b', b: '#d9a066' },
      rows: [
        '..a..',
        '.aaa.',
        'aaaaa',
        '.b.b.',
        '.bbb.',
      ],
    },
    {
      id: 'mat-trang', title: 'Mặt trăng', palette: { a: '#f2d16b' },
      rows: [
        '.aaa.',
        'aa...',
        'a....',
        'aa...',
        '.aaa.',
      ],
    },
    {
      id: 'not-nhac', title: 'Nốt nhạc', palette: { a: '#5b4b8a' },
      rows: [
        '..aa.',
        '..a.a',
        '..a..',
        'aaa..',
        'aa...',
      ],
    },
    {
      id: 'chiec-la', title: 'Chiếc lá', palette: { a: '#4caf50', b: '#7a5a2a' },
      rows: [
        '..aaa',
        '.aaaa',
        'aaaa.',
        'aaaa.',
        'b....',
      ],
    },
    {
      id: 'cai-coc', title: 'Cái cốc', palette: { a: '#3f88c5', b: '#b9ab96' },
      rows: [
        'b.b..',
        'aaaa.',
        'aaa.a',
        'aaaa.',
        '.aa..',
      ],
    },
    {
      id: 'cay-thong', title: 'Cây thông', palette: { a: '#2e7d32', b: '#7a4a1f' },
      rows: [
        '..a..',
        '.aaa.',
        'aaaaa',
        '..b..',
        '.bbb.',
      ],
    },

    /* ----- Bộ 10x10 ----- */
    {
      id: 'non-la', title: 'Nón lá', palette: { a: '#e3c27a', b: '#c0392b', c: '#8d6e3f' },
      rows: [
        '....aa....',
        '...aaaa...',
        '...aaaa...',
        '..aaaaaa..',
        '..abbbba..',
        '.aaaaaaaa.',
        '.aaaaaaaa.',
        'aaaaaaaaaa',
        '.c......c.',
        '..cccccc..',
      ],
    },
    {
      id: 'qua-xoai', title: 'Quả xoài', palette: { a: '#f2b632', b: '#7a5a2a', c: '#4caf50', d: '#9bc53d' },
      rows: [
        '.....b.cc.',
        '.....bccc.',
        '...aaaa...',
        '..aaaaaaa.',
        '.aaaaaaaa.',
        '.aaaaaaaaa',
        'aaaaaaaaad',
        'aaaaaaaad.',
        'aaaaaaad..',
        '..aaaa....',
      ],
    },
    {
      id: 'den-long', title: 'Đèn lồng', palette: { b: '#d4a017', c: '#d63a2f' },
      rows: [
        '....bb....',
        '..bbbbbb..',
        '.cc.cc.cc.',
        'ccc.cc.ccc',
        'ccc.cc.ccc',
        'ccc.cc.ccc',
        '.cc.cc.cc.',
        '..bbbbbb..',
        '....bb....',
        '...b..b...',
      ],
    },
    {
      id: 'banh-chung', title: 'Bánh chưng', palette: { a: '#3c8d40', b: '#c9a45c' },
      rows: [
        '...bbbb...',
        '...b..b...',
        'aaa.aa.aaa',
        'aaa.aa.aaa',
        '..........',
        'aaa.aa.aaa',
        'aaa.aa.aaa',
        '..........',
        'aaa.aa.aaa',
        'aaa.aa.aaa',
      ],
    },
    {
      id: 'ca-phe-phin', title: 'Cà phê phin', palette: { a: '#9aa3ad', b: '#b9b2a6', c: '#5a3a22' },
      rows: [
        '....aa....',
        '..aaaaaa..',
        '...aaaa...',
        '...aaaa...',
        'aaaaaaaaaa',
        '.b......b.',
        '.bccccccb.',
        '.bccccccb.',
        '..cccccc..',
        '..bbbbbb..',
      ],
    },
    {
      id: 'chiec-o', title: 'Chiếc ô', palette: { a: '#3f88c5', b: '#5a3a22' },
      rows: [
        '....aa....',
        '..aaaaaa..',
        '.aaaaaaaa.',
        'aaaaaaaaaa',
        'a.aa..aa.a',
        '.....b....',
        '.....b....',
        '.....b....',
        '...b.b....',
        '....bb....',
      ],
    },
    {
      id: 'con-meo', title: 'Con mèo', palette: { a: '#e08a3c', b: '#1d1711' },
      rows: [
        '.a......a.',
        '.aa....aa.',
        '.aaaaaaaa.',
        'aaaaaaaaaa',
        'aa.aaaa.aa',
        'aaaaaaaaaa',
        'aaaa..aaaa',
        '.aaaaaaaa.',
        '..aaaaaa..',
        '..........',
      ],
    },
    {
      id: 'con-thuyen', title: 'Con thuyền', palette: { a: '#c0392b', b: '#8d5a2b', c: '#3f88c5' },
      rows: [
        '.....a....',
        '.....aa...',
        '.....aaa..',
        '.....aaaa.',
        '.....aaaaa',
        '.....b....',
        'bbbbbbbbbb',
        '.bbbbbbbb.',
        '..bbbbbb..',
        'cc..cc..cc',
      ],
    },
    {
      id: 'qua-tao', title: 'Quả táo', palette: { a: '#d64545', b: '#7a5a2a', c: '#4caf50' },
      rows: [
        '....b.....',
        '....bcc...',
        '.aaa.aaaa.',
        'aaaaaaaaaa',
        'aaaaaaaaaa',
        'aaaaaaaaaa',
        'aaaaaaaaaa',
        '.aaaaaaaa.',
        '.aaaaaaaa.',
        '..aa..aa..',
      ],
    },
    {
      id: 'chia-khoa', title: 'Chìa khoá', palette: { a: '#d4a017' },
      rows: [
        '...aaaa...',
        '..aa..aa..',
        '..a....a..',
        '..aa..aa..',
        '...aaaa...',
        '....aa....',
        '....aa....',
        '....aaaa..',
        '....aa....',
        '....aaa...',
      ],
    },
    {
      id: 'con-rua', title: 'Con rùa', palette: { a: '#4f8a3c', b: '#8fbf5a', c: '#7a9a4a' },
      rows: [
        '....cc....',
        '....cc....',
        '.c.aaaa.c.',
        '..aabbaa..',
        '..abbbba..',
        '..abbbba..',
        '..aabbaa..',
        '.c.aaaa.c.',
        '....aa....',
        '.....a....',
      ],
    },
    {
      id: 'con-oc', title: 'Con ốc', palette: { a: '#b5651d', c: '#8a9a5b', b: '#c9b37a' },
      rows: [
        '....aaaa..',
        '...a....a.',
        '..a.aaa..a',
        '..a.a..a.a',
        '..a.a.a..a',
        '..a..a..a.',
        'c..a...aa.',
        '.c..aaa...',
        '.bbbbbbbbb',
        '..........',
      ],
    },
    {
      id: 'bong-hoa', title: 'Bông hoa', palette: { a: '#e86a92', b: '#f2c94c', c: '#4caf50' },
      rows: [
        '..aa..aa..',
        '.aaaaaaaa.',
        '..aabbaa..',
        '.aaabbaaa.',
        '..aa..aa..',
        '....cc....',
        '.cc.cc.cc.',
        '..cccccc..',
        '....cc....',
        '....cc....',
      ],
    },
    {
      id: 'ngon-nui', title: 'Ngọn núi', palette: { a: '#6d7f8c', b: '#cfd8dc', c: '#f0b429', e: '#3f88c5' },
      rows: [
        '........cc',
        '...b....cc',
        '..bbb.....',
        '.aaaaa.b..',
        'aaaaaabbb.',
        'aaaaaaaaaa',
        'aaaaaaaaaa',
        'aaaaaaaaaa',
        '..........',
        'ee.eeee.ee',
      ],
    },
    {
      id: 'may-bay', title: 'Máy bay', palette: { a: '#5c7c99' },
      rows: [
        '....aa....',
        '....aa....',
        '...aaaa...',
        '.aaaaaaaa.',
        'aaaaaaaaaa',
        '....aa....',
        '....aa....',
        '....aa....',
        '..aaaaaa..',
        '...a..a...',
      ],
    },
    {
      id: 'bat-pho', title: 'Bát phở', palette: { a: '#d6cab4', b: '#8d5a2b', c: '#b9b2a6', d: '#3f88c5' },
      rows: [
        '........bb',
        '.c..c..bb.',
        '..c..cbb..',
        '.c..cbb...',
        'aaaaaaaaaa',
        'adadadadaa',
        '.aaaaaaaa.',
        '..aaaaaa..',
        '...aaaa...',
        '..aaaaaa..',
      ],
    },

    /* ----- Bộ 15x15 ----- */
    {
      id: 'ao-dai', title: 'Áo dài', palette: { a: '#c0392b', b: '#d4a017' },
      rows: [
        '......bbb......',
        '....aaaaaaa....',
        '...aaaaaaaaa...',
        '..aa.aaaaa.aa..',
        '.aa..aaaaa..aa.',
        '.aa..aaaaa..aa.',
        'aa...aaaaa...aa',
        '....aaaaaaa....',
        '....aaa.aaa....',
        '...aaa...aaa...',
        '...aaa...aaa...',
        '..aaa.....aaa..',
        '..aaa.....aaa..',
        '.aaaa.....aaaa.',
        '.aaa.......aaa.',
      ],
    },
    {
      id: 'hoa-sen', title: 'Hoa sen', palette: { a: '#e86a92', b: '#4f8a3c', c: '#3c8d40' },
      rows: [
        '.......a.......',
        '......aaa......',
        '.....aaaaa.....',
        '..a..aaaaa..a..',
        '..aa.aaaaa.aa..',
        '..aaa.aaa.aaa..',
        '...aaa.a.aaa...',
        '.aa.aaaaaaa.aa.',
        '.aaa.aaaaa.aaa.',
        '..aaaaaaaaaaa..',
        '....aaaaaaa....',
        '.......b.......',
        '.......b.......',
        '..ccc..b..ccc..',
        '.ccccc.b.ccccc.',
      ],
    },
    {
      id: 'con-trau', title: 'Con trâu', palette: { a: '#5b5552', b: '#cdbf9f' },
      rows: [
        'bb...........bb',
        'bb...........bb',
        '.bb.........bb.',
        '..bbb.....bbb..',
        '...aaaaaaaaa...',
        '..aaaaaaaaaaa..',
        '.aa.aaaaaaa.aa.',
        '....a.aaa.a....',
        '....aaaaaaa....',
        '.....aaaaa.....',
        '.....aaaaa.....',
        '....aaaaaaa....',
        '....a.aaa.a....',
        '....aaaaaaa....',
        '.....aaaaa.....',
      ],
    },
    {
      id: 'cay-tre', title: 'Cây tre', palette: { a: '#6b9e3a', b: '#4caf50' },
      rows: [
        '..aa...aa....bb',
        '..aa...aa..bbb.',
        '.......aabbb...',
        '..aa...........',
        '..aa...aa......',
        'bb.....aa..aa..',
        '.bbaa..aa..aa..',
        '...aa.......bb.',
        '...aa..aa..aa.b',
        '.......aa..aa..',
        '..aa...aa......',
        '..aa.......aa..',
        '..aa...aa..aa..',
        '..aa...aa..aa..',
        'bbbbbbbbbbbbbbb',
      ],
    },
    {
      id: 'chua-mot-cot', title: 'Chùa Một Cột', palette: { a: '#a33a2c', b: '#d9a066', c: '#8d5a2b', d: '#9aa3ad', e: '#3f88c5' },
      rows: [
        '.......a.......',
        '......aaa......',
        'aa...aaaaa...aa',
        '.aaaaaaaaaaaaa.',
        '...aaaaaaaaa...',
        '...b.b.b.b.b...',
        '...bbbbbbbbb...',
        '..ccccccccccc..',
        '......ddd......',
        '.......d.......',
        '.......d.......',
        '.......d.......',
        '...e...d...e...',
        'eeeeeeeeeeeeeee',
        '.eeee.eeee.eeee',
      ],
    },
    {
      id: 'xe-dap', title: 'Xe đạp', palette: { a: '#c0392b', b: '#3a2c22', c: '#5a5a5a', d: '#9aa3ad' },
      rows: [
        '...............',
        '..bbb......bbb.',
        '....a......a.b.',
        '....aaaaaaaa...',
        '.....a....aa...',
        '.....a....aa...',
        '......a..a.a...',
        '......a..a.a...',
        '.cccc..aa.cacc.',
        'cc..cc.aacca.cc',
        'c.ddaaaaac.dd.c',
        'c.dd.c...c.dd.c',
        'cc..cc...cc..cc',
        '.cccc.....cccc.',
        '...............',
      ],
    },
    {
      id: 'o-to', title: 'Ô tô', palette: { a: '#d63a2f', b: '#9ad1f5', c: '#1d1711', d: '#f0b429', e: '#9aa3ad' },
      rows: [
        '............dd.',
        '...........dddd',
        '............dd.',
        '...............',
        '....aaaaaaa....',
        '...ab.bb.bba...',
        '..ab..bb..bba..',
        '.aaaaaaaaaaaaa.',
        'aaaaaaaaaaaaaaa',
        'aaaaaaaaaaaaaaa',
        'aa.ccc...ccc.aa',
        '..ccccc.ccccc..',
        '...ccc...ccc...',
        '...............',
        'eee.eee.eee.eee',
      ],
    },
    {
      id: 'ca-chep', title: 'Cá chép', palette: { a: '#e4572e', b: '#f0b429', c: '#1d1711' },
      rows: [
        '.....bbb.......',
        '....bbbbb......',
        '...aaaaaaa.....',
        '..aaaaaaaaa..bb',
        '.aaaaaaaaaaa.bb',
        'aa.aaaaaaaaaabb',
        'aaaaaaaaaaaaab.',
        'aaaaaaaaaaaaa..',
        '.aaaaaaaaaaaab.',
        'c.aaaaaaaaaa.bb',
        '.c.aaaaaaaa..bb',
        '.....bb.bb..bbb',
        '....bb...bb....',
        '...............',
        '...............',
      ],
    },
    {
      id: 'cay-dua', title: 'Cây dừa', palette: { a: '#4caf50', b: '#7a4a1f', c: '#8d6e3f', d: '#f2d16b', e: '#3f88c5' },
      rows: [
        '..aaa.....aaa..',
        '.aaaaa...aaaaa.',
        'aa...aa.aa...aa',
        'a.....aaa.....a',
        '....aaabaaa....',
        '...aa.bbb.aa...',
        '..a....cc....a.',
        '.......cc......',
        '......cc.......',
        '......cc.......',
        '......cc.......',
        '.......cc......',
        '.......cc......',
        '...ddddccdddd..',
        'eeeeeeeeeeeeeee',
      ],
    },
  ];

  /** Chuyển tranh dạng chuỗi thành { id, title, size, w, h, sol, colors }. */
  function parsePicture(def) {
    const rows = def.rows;
    const h = rows.length;
    const w = rows[0].length;
    const sol = [];
    const colors = [];
    const pal = def.palette || {};
    for (let r = 0; r < h; r++) {
      if (rows[r].length !== w) throw new Error(`Tranh ${def.id}: hàng ${r} sai độ dài`);
      for (let c = 0; c < w; c++) {
        const ch = rows[r][c];
        const on = ch !== '.';
        sol.push(on ? 1 : 0);
        colors.push(on ? pal[ch] || null : null);
      }
    }
    return { id: def.id, title: def.title, size: w, w, h, sol, colors };
  }

  let parsedCache = null;
  /** Mọi tranh vẽ sẵn đã chuyển đổi, theo thứ tự trong bộ. */
  function pictures() {
    if (!parsedCache) parsedCache = PICTURES.map(parsePicture);
    return parsedCache;
  }
  function pictureById(id) {
    return pictures().find((p) => p.id === id) || null;
  }
  /** Các tranh theo cỡ (một "bộ"). */
  function pack(size) {
    return pictures().filter((p) => p.size === size);
  }

  /* ---------------- Tranh ngẫu nhiên ---------------- */

  /** Lưới ngẫu nhiên mật độ p, làm mượt một lượt để các đoạn dài hơn (dễ có nghiệm duy nhất). */
  function randomGrid(w, h, rng, p) {
    const n = w * h;
    const g = new Array(n);
    for (let i = 0; i < n; i++) g[i] = rng() < p ? 1 : 0;
    // Làm mượt nhẹ: ô bị đa số hàng xóm (4 hướng) "bao vây" thì đổi theo, xác suất 50%
    const out = g.slice();
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        let on = 0;
        let all = 0;
        if (r > 0) { all++; on += g[(r - 1) * w + c]; }
        if (r < h - 1) { all++; on += g[(r + 1) * w + c]; }
        if (c > 0) { all++; on += g[r * w + c - 1]; }
        if (c < w - 1) { all++; on += g[r * w + c + 1]; }
        const roll = rng();
        if (on === all && roll < 0.5) out[r * w + c] = 1;
        else if (on === 0 && roll < 0.5) out[r * w + c] = 0;
      }
    }
    return out;
  }

  /**
   * Sinh tranh ngẫu nhiên w x h giải được bằng suy luận theo dòng (nên có nghiệm duy nhất).
   * Thử tối đa GENERATE_TRIES lần; nếu vẫn không được (rất hiếm) thì lấy một tranh vẽ sẵn cùng cỡ.
   * Trả về { w, h, sol, tries, fallback }.
   */
  function generate(w, h, rng) {
    const p = RANDOM_DENSITY[w] || 0.6;
    for (let t = 1; t <= GENERATE_TRIES; t++) {
      const sol = randomGrid(w, h, rng, p);
      if (isLineSolvable(sol, w, h)) return { w, h, sol, tries: t, fallback: false };
    }
    const same = pictures().filter((pic) => pic.w === w && pic.h === h);
    const pic = same.length ? same[Math.floor(rng() * same.length)] : pictures()[0];
    return { w: pic.w, h: pic.h, sol: pic.sol.slice(), tries: GENERATE_TRIES, fallback: true };
  }

  /** Tranh hằng ngày của ngày dateKey: tranh ngẫu nhiên DAILY_SIZE có seed, mọi máy như nhau. */
  function dailyPuzzle(dateKey) {
    const rng = seededRandom(dailySeed(dateKey));
    return generate(DAILY_SIZE, DAILY_SIZE, rng);
  }

  /* ---------------- Ván chơi ---------------- */

  /** Tạo ván từ lời giải. */
  function createGame(puzzle) {
    const n = puzzle.w * puzzle.h;
    return {
      v: 1,
      w: puzzle.w,
      h: puzzle.h,
      sol: puzzle.sol.slice(),
      cells: new Array(n).fill(EMPTY),
      mistakes: 0,
      past: [], // mỗi phần tử là một thao tác: [[ô, giá trị cũ, giá trị mới], ...]
      future: [],
      solved: false,
    };
  }

  const isCrossLike = (v) => v === CROSS || v === MISS;

  /** Đặt giá trị cho các ô (list: [[ô, giá trị], ...]). Trả về các thay đổi thật sự: [[ô, cũ, mới]]. */
  function setCells(game, list) {
    const changes = [];
    for (const [i, v] of list) {
      const from = game.cells[i];
      if (from === v) continue;
      game.cells[i] = v;
      changes.push([i, from, v]);
    }
    return changes;
  }

  /** Lưu một thao tác vào lịch sử hoàn tác (xóa nhánh làm lại). */
  function commit(game, changes) {
    if (!changes.length) return;
    game.past.push(changes);
    if (game.past.length > HISTORY_LIMIT) game.past.shift();
    game.future = [];
    game.solved = isSolved(game);
  }

  /** Hoàn tác thao tác gần nhất. Trả về các thay đổi đã đảo ngược, hoặc null. */
  function undo(game) {
    if (game.solved || !game.past.length) return null;
    const changes = game.past.pop();
    for (let t = changes.length - 1; t >= 0; t--) game.cells[changes[t][0]] = changes[t][1];
    game.future.push(changes);
    return changes;
  }

  /** Làm lại thao tác vừa hoàn tác. */
  function redo(game) {
    if (game.solved || !game.future.length) return null;
    const changes = game.future.pop();
    for (const [i, , to] of changes) game.cells[i] = to;
    game.past.push(changes);
    game.solved = isSolved(game);
    return changes;
  }

  /** Các ô của hàng r / cột c. */
  function lineCells(game, axis, k) {
    const out = [];
    if (axis === 'row') for (let c = 0; c < game.w; c++) out.push(k * game.w + c);
    else for (let r = 0; r < game.h; r++) out.push(r * game.w + k);
    return out;
  }

  /** Gợi ý mục tiêu của dòng. */
  function targetClue(game, axis, k) {
    const idxs = lineCells(game, axis, k);
    return lineClue(idxs.map((i) => game.sol[i]));
  }

  /** Dòng đã "xong": các ô người chơi tô tạo đúng dãy gợi ý (dù có thể khác lời giải). */
  function isLineDone(game, axis, k) {
    const idxs = lineCells(game, axis, k);
    const mine = lineClue(idxs.map((i) => (game.cells[i] === FILL ? 1 : 0)));
    return sameClue(mine, targetClue(game, axis, k));
  }

  /**
   * Tự đánh dấu X các ô còn trống trên những dòng đã xong đi qua các ô vừa đổi.
   * Trả về danh sách thay đổi (để gộp vào cùng một thao tác hoàn tác).
   */
  function autoCross(game, touched) {
    const rows = new Set();
    const cols = new Set();
    touched.forEach((i) => {
      rows.add(Math.floor(i / game.w));
      cols.add(i % game.w);
    });
    const list = [];
    const scan = (axis, k) => {
      if (!isLineDone(game, axis, k)) return;
      lineCells(game, axis, k).forEach((i) => {
        if (game.cells[i] === EMPTY) list.push([i, CROSS]);
      });
    };
    rows.forEach((r) => scan('row', r));
    cols.forEach((c) => scan('col', c));
    return setCells(game, list);
  }

  /** Đã giải xong: mọi ô cần tô đã tô và không tô thừa ô nào (X không tính). */
  function isSolved(game) {
    for (let i = 0; i < game.sol.length; i++) {
      if ((game.cells[i] === FILL) !== (game.sol[i] === 1)) return false;
    }
    return true;
  }

  /** Số ô đã tô (bất kể đúng sai). */
  function filledCount(game) {
    let k = 0;
    for (const v of game.cells) if (v === FILL) k++;
    return k;
  }

  /** Tiến độ 0..1: tỉ lệ ô cần tô đã tô đúng. */
  function progress(game) {
    let need = 0;
    let ok = 0;
    for (let i = 0; i < game.sol.length; i++) {
      if (game.sol[i] !== 1) continue;
      need++;
      if (game.cells[i] === FILL) ok++;
    }
    return need ? ok / need : 1;
  }

  /** Người chơi đã có thao tác nào chưa. */
  function hasActions(game) {
    return game.past.length > 0 || game.cells.some((v) => v !== EMPTY);
  }

  /**
   * Gợi ý: trả về { idx, value, fix } với value là FILL hoặc CROSS, luôn đúng với lời giải.
   *  1. Có ô sai (tô ô trống / X ô cần tô) thì sửa ô sai đó trước (fix = true).
   *  2. Không thì chạy bộ giải theo dòng một lượt trên những gì người chơi đã biết, lấy ô
   *     mà suy luận sẽ tìm ra kế tiếp: ưu tiên dòng suy ra được nhiều ô nhất, ưu tiên ô cần tô.
   * Trả về null nếu đã giải xong.
   */
  function hint(game) {
    if (isSolved(game)) return null;
    const { w, h, sol, cells } = game;
    for (let i = 0; i < sol.length; i++) {
      if (cells[i] === FILL && sol[i] === 0) return { idx: i, value: CROSS, fix: true };
    }
    for (let i = 0; i < sol.length; i++) {
      if (isCrossLike(cells[i]) && sol[i] === 1) return { idx: i, value: FILL, fix: true };
    }
    const known = cells.map((v) => (v === FILL ? 1 : isCrossLike(v) ? 0 : UNKNOWN));
    const clues = cluesOf(sol, w, h);
    let best = null;
    for (let id = 0; id < h + w; id++) {
      const isRow = id < h;
      const k = isRow ? id : id - h;
      const idxs = isRow ? lineCells(game, 'row', k) : lineCells(game, 'col', k);
      const line = idxs.map((i) => known[i]);
      if (line.indexOf(UNKNOWN) < 0) continue;
      const res = solveLine(isRow ? clues.rows[k] : clues.cols[k], line);
      if (!res) continue;
      const fills = [];
      const empties = [];
      for (let t = 0; t < idxs.length; t++) {
        if (line[t] !== UNKNOWN || res[t] === UNKNOWN) continue;
        if (res[t] !== sol[idxs[t]]) continue; // phòng hờ: không bao giờ gợi ý sai
        if (res[t] === 1) fills.push(idxs[t]);
        else empties.push(idxs[t]);
      }
      const score = fills.length * 2 + empties.length;
      if (!score) continue;
      if (fills.length && (!best || !best.fill || score > best.score)) {
        best = { score, fill: true, idx: fills[0] };
      } else if (!fills.length && !best) {
        best = { score, fill: false, idx: empties[0] };
      }
    }
    if (best) return { idx: best.idx, value: best.fill ? FILL : CROSS, fix: false };
    // Dự phòng (đề không giải được bằng suy luận theo dòng): mở một ô cần tô còn thiếu
    for (let i = 0; i < sol.length; i++) {
      if (sol[i] === 1 && cells[i] !== FILL) return { idx: i, value: FILL, fix: false };
    }
    return null;
  }

  const isBits = (a, n) => Array.isArray(a) && a.length === n && a.every((x) => x === 0 || x === 1);
  const isChange = (c, n) => Array.isArray(c) && c.length === 3 && Number.isInteger(c[0]) && c[0] >= 0 && c[0] < n
    && [0, 1, 2, 3].indexOf(c[1]) >= 0 && [0, 1, 2, 3].indexOf(c[2]) >= 0;
  const isHistory = (a, n) => Array.isArray(a) && a.every((step) => Array.isArray(step) && step.every((c) => isChange(c, n)));

  /** Khôi phục ván từ object đã lưu (JSON.parse). Dữ liệu hỏng thì trả về null. */
  function restore(obj) {
    if (!obj || typeof obj !== 'object' || obj.v !== 1) return null;
    const { w, h } = obj;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 2 || h < 2 || w > 30 || h > 30) return null;
    const n = w * h;
    if (!isBits(obj.sol, n)) return null;
    if (!Array.isArray(obj.cells) || obj.cells.length !== n || !obj.cells.every((x) => [0, 1, 2, 3].indexOf(x) >= 0)) return null;
    const game = {
      v: 1,
      w,
      h,
      sol: obj.sol.slice(),
      cells: obj.cells.slice(),
      mistakes: Number.isInteger(obj.mistakes) && obj.mistakes >= 0 ? obj.mistakes : 0,
      past: isHistory(obj.past, n) ? obj.past.slice(-HISTORY_LIMIT) : [],
      future: isHistory(obj.future, n) ? obj.future.slice(-HISTORY_LIMIT) : [],
      solved: false,
    };
    game.solved = isSolved(game);
    return game;
  }

  return {
    EMPTY,
    FILL,
    CROSS,
    MISS,
    UNKNOWN,
    SIZES,
    SIZE_LABELS,
    DAILY_SIZE,
    HINTS_PER_PUZZLE,
    PICTURES,
    seededRandom,
    hashString,
    dailySeed,
    lineClue,
    cluesOf,
    solveLine,
    propagate,
    lineSolve,
    isLineSolvable,
    countSolutions,
    isUnique,
    parsePicture,
    pictures,
    pictureById,
    pack,
    randomGrid,
    generate,
    dailyPuzzle,
    createGame,
    setCells,
    commit,
    undo,
    redo,
    lineCells,
    targetClue,
    isLineDone,
    autoCross,
    isSolved,
    isCrossLike,
    filledCount,
    progress,
    hasActions,
    hint,
    restore,
  };
})();

if (typeof window !== 'undefined') window.Nonogram = Nonogram;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Nonogram;
}
