/* =====================================================================
 * Hoa Dung Đạo - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Khay 4 cột × 5 hàng, các khối chữ nhật: B (2×2, khối lớn), V (1×2 dọc), H (2×1 ngang), S (1×1); đúng hai ô trống
 *   - Thắng khi khối lớn tới lối ra ở giữa đáy: góc trên trái tại (1, 3), tức chiếm cột 1..2, hàng 3..4
 *   - Đếm nước theo cách chuẩn: một khối trượt qua các ô trống tới chỗ mới (đi bao xa, rẽ góc bao nhiêu lần cũng được)
 *     là MỘT nước; di chuyển liên tiếp cùng một khối gộp vào nước đó; khối quay về đúng chỗ cũ thì nước đó bị xóa
 *   - Màn viết bằng chuỗi 5 hàng × 4 ký tự (B V H S .) nối bằng '|'. Chuỗi chỉ ghi HÌNH khối ở từng ô, không ghi danh tính:
 *     dãy V liền nhau trong một cột được cắt thành cặp từ trên xuống, dãy H trong một hàng cắt cặp từ trái sang,
 *     nên cách đọc là duy nhất; chính chuỗi 20 ô (bỏ '|') là khóa chuẩn hóa trạng thái cho solver BFS
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const W = 4;
  const H = 5;
  const N = W * H;
  const SIZE = { B: [2, 2], V: [1, 2], H: [2, 1], S: [1, 1] };
  const EXIT = { x: 1, y: 3 };
  const DX = [0, 1, 0, -1]; // 0 lên, 1 phải, 2 xuống, 3 trái
  const DY = [-1, 0, 1, 0];
  const MAX_HIST = 5000; // chặn ván lưu phình bất thường

  /*
   * Các màn: sắp theo số nước tối thiểu tăng dần. `min` do solver BFS tính và test.js kiểm lại từng màn.
   * Màn có `classic` là thế mở đầu kinh điển (Hoành đao lập mã); các màn còn lại sinh bằng máy rồi chọn tay
   * (xem README): duyệt trọn không gian trạng thái của một bộ khối, BFS ngược từ mọi thế thắng, lấy thế có
   * khoảng cách mong muốn, ưu tiên khối lớn ở hàng trên cùng như thế cổ điển.
   */
  const LEVELS = [
    // Ghi chú cuối dòng: bộ khối (dọc / ngang / vuông nhỏ)
    { layout: '.SSS|VHHV|VBBV|VBBV|V.SV', min: 4 }, // 4/1/4
    { layout: 'HHHH|VBBS|VBBS|V..V|VSSV', min: 7 }, // 3/2/4
    { layout: 'HHSV|VBBV|VBBV|VS.V|VSS.', min: 10 }, // 4/1/4
    { layout: 'HHHH|VBBS|VBBV|V.SV|VS.S', min: 13 }, // 3/2/4
    { layout: 'BBHH|BBHH|V.SS|VVSV|.VSV', min: 16 }, // 3/2/4
    { layout: 'HHBB|VSBB|VSVV|VSVV|VS..', min: 19 }, // 4/1/4
    { layout: '.BBS|.BBS|HHHH|HHHH|SSHH', min: 23 }, // 0/5/4
    { layout: 'BBHH|BBVS|S.VS|V.VV|VSVV', min: 27 }, // 4/1/4
    { layout: 'SBB.|SBB.|HHHH|VVSS|VVHH', min: 31 }, // 2/3/4
    { layout: 'SBBV|SBBV|HHVS|VVV.|VVS.', min: 35 }, // 4/1/4
    { layout: '.BBS|SBBS|SVHH|VVHH|V.HH', min: 40 }, // 2/3/4
    { layout: 'VBBS|VBB.|SVVS|VVV.|VHHS', min: 45 }, // 4/1/4
    { layout: '.BBS|.BBS|SVHH|VVSV|VHHV', min: 50 }, // 3/2/4
    { layout: 'VBBS|VBB.|VSV.|VSVV|SHHV', min: 56 }, // 4/1/4
    { layout: 'VBBS|VBBV|HH.V|HHSV|.SSV', min: 62 }, // 3/2/4
    { layout: '.BBS|VBBS|VVVV|SVVV|HH.S', min: 68 }, // 4/1/4
    { layout: 'VBBV|VBBV|S.SS|V.HH|VHHS', min: 74 }, // 3/2/4
    { layout: 'VBBV|VBBV|VHHV|VSSV|S..S', min: 81, classic: true }, // 4/1/4: Hoành đao lập mã
    { layout: 'VBB.|VBBV|HHVV|SSVS|.SHH', min: 88 }, // 3/2/4
    { layout: 'SBBS|.BBV|VHHV|VSHH|.SHH', min: 96 }, // 2/3/4
    { layout: 'VBB.|VBBS|SVHH|VVHH|V.SS', min: 105 }, // 3/2/4
    { layout: 'SBB.|VBB.|VHHS|SHHV|HHSV', min: 116 }, // 2/3/4
    { layout: 'SBB.|VBBS|VHHS|HHVS|HHV.', min: 127 }, // 2/3/4
    { layout: 'SSSV|BBVV|BBVV|SHHV|HH..', min: 138 }, // 3/2/4: thế xa lối ra nhất trong thành phần liên thông của nó
  ];

  /* ---------------- Đọc chuỗi màn / khóa trạng thái ---------------- */

  /** Chuỗi 20 ô (đã bỏ '|') → danh sách khối [{ t, x, y }] theo thứ tự đọc; sai thì null. */
  function parseKey(key) {
    if (typeof key !== 'string' || key.length !== N) return null;
    const used = new Uint8Array(N);
    const blocks = [];
    let empty = 0;
    let big = 0;
    for (let i = 0; i < N; i++) {
      if (used[i]) continue;
      const c = key[i];
      if (c === '.') {
        empty++;
        continue;
      }
      const sz = SIZE[c];
      if (!sz) return null;
      const x = i % W;
      const y = (i / W) | 0;
      if (x + sz[0] > W || y + sz[1] > H) return null;
      for (let dy = 0; dy < sz[1]; dy++) {
        for (let dx = 0; dx < sz[0]; dx++) {
          const j = (y + dy) * W + x + dx;
          if (used[j] || key[j] !== c) return null;
          used[j] = 1;
        }
      }
      if (c === 'B') big++;
      blocks.push({ t: c, x, y });
    }
    if (big !== 1 || empty !== 2) return null;
    return blocks;
  }

  /** Chuỗi màn 'VBBV|VBBV|…' → danh sách khối, sai thì null. */
  function parseLayout(s) {
    if (typeof s !== 'string') return null;
    const rows = s.split('|');
    if (rows.length !== H || rows.some((r) => r.length !== W)) return null;
    return parseKey(rows.join(''));
  }

  /** Danh sách khối → khóa 20 ô (chỉ hình, không danh tính). */
  function keyOf(blocks) {
    const a = new Array(N).fill('.');
    for (const b of blocks) {
      const [w, h] = SIZE[b.t];
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) a[(b.y + dy) * W + b.x + dx] = b.t;
    }
    return a.join('');
  }
  const layoutOf = (blocks) => keyOf(blocks).replace(/(.{4})(?!$)/g, '$1|');
  /** Thế thắng: khối lớn chiếm ô (1,3) (2,3) (1,4) (2,4). */
  const keyWon = (k) => k[13] === 'B' && k[14] === 'B' && k[17] === 'B' && k[18] === 'B';

  /* ---------------- Hình học ---------------- */

  /** Mảng 20 ô: chỉ số khối đang chiếm ô, -1 là trống. */
  function occupancy(blocks) {
    const occ = new Int8Array(N).fill(-1);
    blocks.forEach((b, k) => {
      const [w, h] = SIZE[b.t];
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) occ[(b.y + dy) * W + b.x + dx] = k;
    });
    return occ;
  }

  /** Khối k (hình t) đặt ở (x, y) có nằm gọn trong khay và chỉ đè ô trống hoặc ô của chính nó không. */
  function fits(occ, t, k, x, y) {
    const [w, h] = SIZE[t];
    if (x < 0 || y < 0 || x + w > W || y + h > H) return false;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const o = occ[(y + dy) * W + x + dx];
        if (o !== -1 && o !== k) return false;
      }
    }
    return true;
  }

  /** Mọi chỗ khối k trượt tới được qua ô trống (các khối khác đứng yên), không kể chỗ hiện tại: [[x, y], …]. */
  function reachOf(blocks, k, occ) {
    const b = blocks[k];
    const o = occ || occupancy(blocks);
    const seen = new Uint8Array(N);
    seen[b.y * W + b.x] = 1;
    const out = [];
    const queue = [[b.x, b.y]];
    for (let q = 0; q < queue.length; q++) {
      const [x, y] = queue[q];
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (!fits(o, b.t, k, nx, ny) || seen[ny * W + nx]) continue;
        seen[ny * W + nx] = 1;
        out.push([nx, ny]);
        queue.push([nx, ny]);
      }
    }
    return out;
  }

  /* ---------------- Solver BFS (trạng thái chuẩn hóa theo hình khối) ---------------- */

  /** Các trạng thái (khóa) đi được trong một nước từ khóa `key`. */
  function neighbours(key) {
    const blocks = parseKey(key);
    const occ = occupancy(blocks);
    const out = [];
    for (let k = 0; k < blocks.length; k++) {
      const b = blocks[k];
      for (const [x, y] of reachOf(blocks, k, occ)) {
        blocks[k] = { t: b.t, x, y };
        out.push(keyOf(blocks));
      }
      blocks[k] = b;
    }
    return out;
  }

  /**
   * BFS từ màn `layout` (chuỗi có '|' hoặc khóa 20 ô) tới thế thắng gần nhất.
   * Trả { min, keys: [khóa từ đầu tới thắng], states: số trạng thái đã gặp }, hoặc null nếu không giải được,
   * màn sai, hoặc vượt `maxStates`.
   */
  function solve(layout, maxStates) {
    const blocks = parseLayout(layout) || parseKey(layout);
    if (!blocks) return null;
    const start = keyOf(blocks);
    if (keyWon(start)) return { min: 0, keys: [start], states: 1 };
    const parent = new Map([[start, null]]);
    const limit = maxStates || 2e6;
    const trace = (k) => {
      const keys = [];
      for (let c = k; c != null; c = parent.get(c)) keys.unshift(c);
      return keys;
    };
    let frontier = [start];
    let depth = 0;
    while (frontier.length) {
      depth++;
      const next = [];
      for (const k of frontier) {
        for (const n of neighbours(k)) {
          if (parent.has(n)) continue;
          parent.set(n, k);
          if (keyWon(n)) return { min: depth, keys: trace(n), states: parent.size };
          next.push(n);
        }
      }
      if (parent.size > limit) return null;
      frontier = next;
    }
    return null;
  }

  /* ---------------- Ván chơi ---------------- */
  // game = { level, blocks: [{ t, x, y }], hist: [{ b, x0, y0, x, y }] }; mỗi phần tử hist là một nước

  function fromLayout(level, layout) {
    const blocks = parseLayout(layout);
    return blocks ? { level, blocks, hist: [] } : null;
  }

  function newGame(level) {
    const L = LEVELS[level];
    return L ? fromLayout(level, L.layout) : null;
  }

  const moves = (g) => g.hist.length;
  const bigIndex = (g) => g.blocks.findIndex((b) => b.t === 'B');
  function isWon(g) {
    const b = g.blocks[bigIndex(g)];
    return b.x === EXIT.x && b.y === EXIT.y;
  }
  const reach = (g, k) => (g.blocks[k] && !isWon(g) ? reachOf(g.blocks, k) : []);

  /** Khối k trượt được một ô theo hướng d không. */
  function canStep(g, k, d) {
    const b = g.blocks[k];
    return !!b && !isWon(g) && fits(occupancy(g.blocks), b.t, k, b.x + DX[d], b.y + DY[d]);
  }

  /**
   * Đưa khối k tới (x, y) nếu trượt tới được. Cùng khối với nước trước thì gộp vào nước đó (về đúng chỗ cũ thì
   * xóa nước); khác khối thì thêm một nước. Không đi được (hoặc đã thắng) thì trả lại chính `g`.
   */
  function moveTo(g, k, x, y) {
    const b = g.blocks[k];
    if (!b || isWon(g) || (b.x === x && b.y === y)) return g;
    if (!reachOf(g.blocks, k).some((p) => p[0] === x && p[1] === y)) return g;
    const blocks = g.blocks.slice();
    blocks[k] = { t: b.t, x, y };
    const hist = g.hist.slice();
    const last = hist[hist.length - 1];
    if (last && last.b === k) {
      if (last.x0 === x && last.y0 === y) hist.pop();
      else hist[hist.length - 1] = { b: k, x0: last.x0, y0: last.y0, x, y };
    } else {
      hist.push({ b: k, x0: b.x, y0: b.y, x, y });
    }
    return { level: g.level, blocks, hist };
  }

  function step(g, k, d) {
    if (!canStep(g, k, d)) return g;
    const b = g.blocks[k];
    return moveTo(g, k, b.x + DX[d], b.y + DY[d]);
  }

  /** Hoàn tác nguyên một nước (khối về chỗ trước nước đó). */
  function undo(g) {
    const last = g.hist[g.hist.length - 1];
    if (!last) return g;
    const blocks = g.blocks.slice();
    blocks[last.b] = { t: blocks[last.b].t, x: last.x0, y: last.y0 };
    return { level: g.level, blocks, hist: g.hist.slice(0, -1) };
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const toJSON = (g) => ({ v: VERSION, level: g.level, hist: g.hist.map((r) => [r.b, r.x, r.y]) });

  /** Đi lại các nước đã lưu từ thế đầu của màn; nước nào sai / thừa / gộp được (lưu hỏng) thì trả null. */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { level, hist } = raw;
    if (!Number.isInteger(level) || level < 0 || level >= LEVELS.length) return null;
    if (!Array.isArray(hist) || hist.length > MAX_HIST) return null;
    let g = newGame(level);
    for (const r of hist) {
      if (!Array.isArray(r) || r.length !== 3 || !r.every(Number.isInteger)) return null;
      const n = moveTo(g, r[0], r[1], r[2]);
      if (n === g || n.hist.length !== g.hist.length + 1) return null;
      g = n;
    }
    return g;
  }

  const api = {
    W, H, SIZE, EXIT, DX, DY, LEVELS,
    parseKey, parseLayout, keyOf, layoutOf, keyWon, occupancy, neighbours, solve,
    newGame, fromLayout, moves, isWon, bigIndex, reach, canStep, moveTo, step, undo, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
