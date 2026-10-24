/* =====================================================================
 * Vòng Kín (Slitherlink) - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Lưới n×n ô, (n+1)×(n+1) điểm. Cạnh ngang trước: h(r,c) = r*n + c (r 0..n, c 0..n-1);
 *     cạnh dọc sau: v(r,c) = NH + r*(n+1) + c (r 0..n-1, c 0..n), NH = (n+1)*n. Điểm (r,c) = r*(n+1) + c
 *   - Solver: lan truyền ràng buộc (số của ô, bậc 0/2 của điểm, không khép vòng sớm; thêm trong / ngoài vòng khi đếm nghiệm)
 *     + thử-sai một bước ở mỗi nút + quay lui, đếm nghiệm dừng ở `limit`
 *   - Suy luận "như người" (logicSolve): mức 0 chỉ lan truyền; mức 1 thêm thử-sai một bước (giả sử cạnh rồi lan truyền)
 *   - Sinh đề: vùng ô ngẫu nhiên liền, không lỗ, không chạm chéo → biên là một vòng; ghi đủ số rồi gỡ dần
 *     khi đề vẫn giải được bằng suy luận ở mức của mode (suy luận đúng tới hết = nghiệm duy nhất)
 *   - Ván: edges[e] = 0 trống / 1 đường / 2 dấu ×; hoàn tác / làm lại theo bước (một nét kéo = một bước)
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  /** Mode: cỡ bàn + mức suy luận dùng khi gỡ số (0 = chỉ lan truyền, 1 = thêm thử-sai một bước). */
  const MODES = {
    s: { n: 5, logic: 0 },
    m: { n: 7, logic: 1 },
    l: { n: 10, logic: 1 },
  };

  /* ---------------- PRNG ---------------- */

  /** mulberry32; seed là số hoặc chuỗi. Cùng seed cho cùng dãy trên mọi máy. */
  function rng(seed) {
    let a = 0;
    if (typeof seed === 'string') {
      for (let i = 0; i < seed.length; i++) a = Math.imul(a ^ seed.charCodeAt(i), 2654435761);
    } else a = Number(seed) || 0;
    a >>>= 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- Hình học lưới ---------------- */

  const GEO = {};
  /** Bảng tra cứu cho lưới n×n (tính một lần mỗi cỡ). */
  function geom(n) {
    if (GEO[n]) return GEO[n];
    const N1 = n + 1;
    const NH = N1 * n;
    const E = 2 * n * N1;
    const V = N1 * N1;
    const C = n * n;
    const ea = new Int16Array(E); // điểm đầu của cạnh
    const eb = new Int16Array(E); // điểm cuối
    const ec = new Int16Array(2 * E).fill(-1); // hai ô hai bên cạnh (-1 = ngoài bàn)
    const vE = new Int16Array(4 * V).fill(-1); // các cạnh tại điểm
    const vDeg = new Uint8Array(V);
    const cE = new Int16Array(4 * C); // 4 cạnh của ô: trên, dưới, trái, phải
    for (let r = 0; r <= n; r++) {
      for (let c = 0; c < n; c++) {
        const e = r * n + c;
        ea[e] = r * N1 + c;
        eb[e] = r * N1 + c + 1;
        if (r > 0) ec[2 * e] = (r - 1) * n + c;
        if (r < n) ec[2 * e + 1] = r * n + c;
      }
    }
    for (let r = 0; r < n; r++) {
      for (let c = 0; c <= n; c++) {
        const e = NH + r * N1 + c;
        ea[e] = r * N1 + c;
        eb[e] = (r + 1) * N1 + c;
        if (c > 0) ec[2 * e] = r * n + c - 1;
        if (c < n) ec[2 * e + 1] = r * n + c;
      }
    }
    for (let e = 0; e < E; e++) {
      vE[4 * ea[e] + vDeg[ea[e]]++] = e;
      vE[4 * eb[e] + vDeg[eb[e]]++] = e;
    }
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        cE[4 * i] = r * n + c;
        cE[4 * i + 1] = (r + 1) * n + c;
        cE[4 * i + 2] = NH + r * N1 + c;
        cE[4 * i + 3] = NH + r * N1 + c + 1;
      }
    }
    GEO[n] = { n, N1, NH, E, V, C, ea, eb, ec, vE, vDeg, cE };
    return GEO[n];
  }

  const hEdge = (n, r, c) => r * n + c;
  const vEdge = (n, r, c) => (n + 1) * n + r * (n + 1) + c;

  /** Cạnh nối hai điểm kề nhau, -1 nếu không kề. */
  function edgeBetween(n, a, b) {
    const N1 = n + 1;
    const ra = Math.floor(a / N1);
    const ca = a % N1;
    const rb = Math.floor(b / N1);
    const cb = b % N1;
    if (ra === rb && Math.abs(ca - cb) === 1) return hEdge(n, ra, Math.min(ca, cb));
    if (ca === cb && Math.abs(ra - rb) === 1) return vEdge(n, Math.min(ra, rb), ca);
    return -1;
  }

  /** Số cạnh thuộc vòng quanh từng ô. */
  function cluesOf(n, lines) {
    const G = geom(n);
    const out = new Array(G.C).fill(0);
    for (let c = 0; c < G.C; c++) for (let k = 0; k < 4; k++) out[c] += lines[G.cE[4 * c + k]] === 1 ? 1 : 0;
    return out;
  }

  /** Các cạnh (1 = đường) có tạo đúng một vòng kín, không rẽ nhánh, thỏa mọi số không? */
  function checkLoop(n, clues, lines) {
    const G = geom(n);
    if (!lines || lines.length !== G.E) return false;
    const deg = new Uint8Array(G.V);
    let count = 0;
    let start = -1;
    for (let e = 0; e < G.E; e++) {
      if (lines[e] !== 1) continue;
      count++;
      deg[G.ea[e]]++;
      deg[G.eb[e]]++;
      start = e;
    }
    if (!count) return false;
    for (let v = 0; v < G.V; v++) if (deg[v] !== 0 && deg[v] !== 2) return false;
    for (let c = 0; c < G.C; c++) {
      if (clues[c] < 0) continue;
      let k = 0;
      for (let j = 0; j < 4; j++) if (lines[G.cE[4 * c + j]] === 1) k++;
      if (k !== clues[c]) return false;
    }
    // Đi dọc vòng từ một cạnh: phải quay về điểm xuất phát sau đúng `count` cạnh (một vòng duy nhất)
    let prev = start;
    let v = G.eb[start];
    let walked = 1;
    while (v !== G.ea[start]) {
      let next = -1;
      for (let j = 0; j < G.vDeg[v]; j++) {
        const e = G.vE[4 * v + j];
        if (e !== prev && lines[e] === 1) next = e;
      }
      if (next < 0 || ++walked > count) return false;
      v = G.ea[next] === v ? G.eb[next] : G.ea[next];
      prev = next;
    }
    return walked === count;
  }

  /* ---------------- Solver ---------------- */

  /**
   * Bộ giải cho một đề (n, clues). Trạng thái là một Int16Array (chép nhanh khi rẽ nhánh), gồm lần lượt:
   *   cạnh (0 chưa biết / 1 đường / 2 không) · số đường tại điểm · số "không" tại điểm · số đường quanh ô ·
   *   số "không" quanh ô · đầu bên kia của đoạn (chỉ có ở điểm là đầu đoạn) · độ dài đoạn · tổng số đường · cờ khép vòng ·
   *   union-find "trong / ngoài vòng" của các ô (ô C = phía ngoài bàn): cha + chẵn lẻ so với cha
   * parity = true: dùng thêm suy luận trong / ngoài — đường giữa hai ô ⇔ hai ô khác phía; hai ô đã biết cùng / khác phía
   * qua chuỗi quan hệ thì cạnh giữa chúng suy ra được (bắt cả mâu thuẫn kiểu vòng con bao kín một số).
   */
  function createSolver(n, clues, parity) {
    const G = geom(n);
    const { E, V, C, ea, eb, ec, vE, vDeg, cE } = G;
    const VON = E;
    const VOFF = VON + V;
    const CON = VOFF + V;
    const COFF = CON + C;
    const PART = COFF + C;
    const CLEN = PART + V;
    const ONC = CLEN + V;
    const CLOSED = ONC + 1;
    const SCAN = CLOSED + 1; // tổng số đường ở lần quét luật khép vòng gần nhất
    const UF = SCAN + 1;
    const UP = UF + C + 1;
    const SIZE = UP + C + 1;
    const queue = []; // điểm v hoặc ô V + c cần xét lại
    const clueCells = [];
    for (let c = 0; c < C; c++) if (clues[c] >= 0) clueCells.push(c);

    /* Union-find có chẵn lẻ: find trả gốc, ghi độ lệch (0 cùng phía / 1 khác phía) so với gốc vào `off` */
    let off = 0;
    function find(s, x) {
      let r = x;
      let p = 0;
      while (s[UF + r] !== r) {
        p ^= s[UP + r];
        r = s[UF + r];
      }
      // Nén đường đi: mọi nút trên đường trỏ thẳng về gốc
      let y = x;
      let py = p;
      while (y !== r && s[UF + y] !== r) {
        const next = s[UF + y];
        const pn = py ^ s[UP + y];
        s[UF + y] = r;
        s[UP + y] = py;
        y = next;
        py = pn;
      }
      off = p;
      return r;
    }
    function union(s, a, b, rel) {
      const ra = find(s, a);
      const pa = off;
      const rb = find(s, b);
      const pb = off;
      if (ra === rb) return (pa ^ pb) === rel;
      s[UF + ra] = rb;
      s[UP + ra] = pa ^ pb ^ rel;
      return true;
    }
    const sideOf = (c) => (c < 0 ? C : c);

    /** Gán cạnh e = val (1 đường / 2 không). Trả false nếu mâu thuẫn. */
    function set(s, e, val) {
      const cur = s[e];
      if (cur) return cur === val;
      s[e] = val;
      const a = ea[e];
      const b = eb[e];
      const c0 = ec[2 * e];
      const c1 = ec[2 * e + 1];
      if (val === 1) {
        if (s[CLOSED]) return false; // vòng đã khép: không thêm đường nào nữa
        const da = s[VON + a] + 1;
        const db = s[VON + b] + 1;
        if (da > 2 || db > 2) return false;
        s[VON + a] = da;
        s[VON + b] = db;
        if (c0 >= 0) s[CON + c0]++;
        if (c1 >= 0) s[CON + c1]++;
        const onc = s[ONC] + 1;
        s[ONC] = onc;
        // Nối đoạn: da / db = 1 là điểm vừa thành đầu đoạn mới, = 2 là đầu của một đoạn cũ được nối dài
        if (da === 1 && db === 1) {
          s[PART + a] = b;
          s[PART + b] = a;
          s[CLEN + a] = 1;
          s[CLEN + b] = 1;
        } else if (da === 2 && db === 1) {
          const o = s[PART + a];
          const L = s[CLEN + a] + 1;
          s[PART + a] = -1;
          s[PART + o] = b;
          s[PART + b] = o;
          s[CLEN + o] = L;
          s[CLEN + b] = L;
        } else if (da === 1 && db === 2) {
          const o = s[PART + b];
          const L = s[CLEN + b] + 1;
          s[PART + b] = -1;
          s[PART + o] = a;
          s[PART + a] = o;
          s[CLEN + o] = L;
          s[CLEN + a] = L;
        } else if (s[PART + a] === b) {
          // Khép vòng: chỉ hợp lệ khi vòng chứa mọi đường đã có
          if (s[CLEN + a] + 1 !== onc) return false;
          s[PART + a] = -1;
          s[PART + b] = -1;
          s[CLOSED] = 1;
        } else {
          const pa = s[PART + a];
          const pb = s[PART + b];
          const L = s[CLEN + a] + s[CLEN + b] + 1;
          s[PART + a] = -1;
          s[PART + b] = -1;
          s[PART + pa] = pb;
          s[PART + pb] = pa;
          s[CLEN + pa] = L;
          s[CLEN + pb] = L;
        }
      } else {
        s[VOFF + a]++;
        s[VOFF + b]++;
        if (c0 >= 0) s[COFF + c0]++;
        if (c1 >= 0) s[COFF + c1]++;
      }
      if (parity && !union(s, sideOf(c0), sideOf(c1), val === 1 ? 1 : 0)) return false;
      queue.push(a, b);
      if (c0 >= 0) queue.push(V + c0);
      if (c1 >= 0) queue.push(V + c1);
      return true;
    }

    /** Khép vòng bằng cạnh e có thỏa mọi số không? */
    function closingOk(s, e) {
      const c0 = ec[2 * e];
      const c1 = ec[2 * e + 1];
      for (let i = 0; i < clueCells.length; i++) {
        const c = clueCells[i];
        if (s[CON + c] + (c === c0 || c === c1 ? 1 : 0) !== clues[c]) return false;
      }
      return true;
    }

    /** Ở đầu đoạn v: cạnh nối thẳng tới đầu kia của chính đoạn sẽ khép vòng, chỉ giữ khi đó là lời giải. */
    function closureRule(s, v) {
      const p = s[PART + v];
      for (let j = 0; j < vDeg[v]; j++) {
        const e = vE[4 * v + j];
        if (s[e] || (ea[e] === v ? eb[e] : ea[e]) !== p) continue;
        if ((s[CLEN + v] !== s[ONC] || !closingOk(s, e)) && !set(s, e, 2)) return false;
      }
      return true;
    }

    function checkVertex(s, v) {
      const on = s[VON + v];
      const d = vDeg[v];
      const unk = d - on - s[VOFF + v];
      if (on > 2) return false;
      if (unk === 0) return on !== 1;
      const base = 4 * v;
      if (on === 2) {
        for (let j = 0; j < d; j++) {
          const e = vE[base + j];
          if (!s[e] && !set(s, e, 2)) return false;
        }
      } else if (on === 1) {
        if (!closureRule(s, v)) return false;
        const left = d - 1 - s[VOFF + v];
        if (left === 0) return false;
        if (left === 1) {
          for (let j = 0; j < d; j++) {
            const e = vE[base + j];
            if (!s[e]) return set(s, e, 1);
          }
        }
      } else if (unk === 1) {
        for (let j = 0; j < d; j++) {
          const e = vE[base + j];
          if (!s[e]) return set(s, e, 2);
        }
      }
      return true;
    }

    function checkCell(s, c) {
      const k = clues[c];
      if (k < 0) return true;
      const on = s[CON + c];
      const unk = 4 - on - s[COFF + c];
      if (on > k || on + unk < k) return false;
      if (!unk) return true;
      const val = on === k ? 2 : on + unk === k ? 1 : 0;
      if (!val) return true;
      const base = 4 * c;
      for (let j = 0; j < 4; j++) {
        const e = cE[base + j];
        if (!s[e] && !set(s, e, val)) return false;
      }
      return true;
    }

    /** Lan truyền tới điểm dừng. false = mâu thuẫn. */
    function propagate(s) {
      for (;;) {
        while (queue.length) {
          const x = queue.pop();
          if (!(x < V ? checkVertex(s, x) : checkCell(s, x - V))) {
            queue.length = 0;
            return false;
          }
        }
        if (s[CLOSED] === 1) {
          // Vòng vừa khép: mọi cạnh còn lại là "không"
          s[CLOSED] = 2;
          for (let e = 0; e < E; e++) {
            if (!s[e] && !set(s, e, 2)) {
              queue.length = 0;
              return false;
            }
          }
          continue;
        }
        // Hai ô đã biết cùng / khác phía → cạnh giữa chúng là "không" / đường
        if (parity) {
          for (let e = 0; e < E; e++) {
            if (s[e]) continue;
            const ra = find(s, sideOf(ec[2 * e]));
            const pa = off;
            if (ra !== find(s, sideOf(ec[2 * e + 1]))) continue;
            if (!set(s, e, (pa ^ off) === 1 ? 1 : 2)) {
              queue.length = 0;
              return false;
            }
          }
          if (queue.length) continue;
        }
        // Tổng số đường đổi thì luật khép vòng ở mọi đầu đoạn có thể áp dụng thêm
        if (s[SCAN] === s[ONC]) return true;
        s[SCAN] = s[ONC];
        for (let v = 0; v < V; v++) {
          if (s[VON + v] === 1 && !closureRule(s, v)) {
            queue.length = 0;
            return false;
          }
        }
        if (!queue.length) return true;
      }
    }

    function init() {
      const s = new Int16Array(SIZE);
      s.fill(-1, PART, PART + V);
      for (let i = 0; i <= C; i++) s[UF + i] = i;
      for (let v = 0; v < V; v++) queue.push(v);
      for (let i = 0; i < clueCells.length; i++) queue.push(V + clueCells[i]);
      return propagate(s) ? s : null;
    }

    const solved = (s) => s[CLOSED] === 2;

    /** Cạnh để rẽ nhánh: cạnh trống ở đầu đoạn ít lựa chọn nhất; chưa có đường thì quanh ô còn thiếu nhiều cạnh nhất. */
    function pick(s) {
      let best = -1;
      let bestLeft = 9;
      for (let v = 0; v < V && bestLeft > 2; v++) {
        if (s[VON + v] !== 1) continue;
        const left = vDeg[v] - 1 - s[VOFF + v];
        if (left >= bestLeft) continue;
        for (let j = 0; j < vDeg[v]; j++) {
          const e = vE[4 * v + j];
          if (!s[e]) {
            best = e;
            bestLeft = left;
            break;
          }
        }
      }
      if (best >= 0) return best;
      let need = -1;
      for (let i = 0; i < clueCells.length; i++) {
        const c = clueCells[i];
        const want = clues[c] - s[CON + c];
        if (want <= need) continue;
        for (let j = 0; j < 4; j++) {
          const e = cE[4 * c + j];
          if (!s[e]) {
            best = e;
            need = want;
            break;
          }
        }
      }
      if (best >= 0) return best;
      for (let e = 0; e < E; e++) if (!s[e]) return e;
      return -1;
    }

    /** Mọi đường đã có phải còn nối được với nhau qua các cạnh chưa bị loại (không thì không thể thành một vòng). */
    const seen = new Uint8Array(V);
    const walk = [];
    function connected(s) {
      let start = -1;
      for (let v = 0; v < V && start < 0; v++) if (s[VON + v]) start = v;
      if (start < 0) return true;
      seen.fill(0);
      seen[start] = 1;
      walk.push(start);
      while (walk.length) {
        const v = walk.pop();
        for (let j = 0; j < vDeg[v]; j++) {
          const e = vE[4 * v + j];
          if (s[e] === 2) continue;
          const w = ea[e] === v ? eb[e] : ea[e];
          if (!seen[w]) {
            seen[w] = 1;
            walk.push(w);
          }
        }
      }
      for (let v = 0; v < V; v++) if (s[VON + v] && !seen[v]) return false;
      return true;
    }

    /**
     * Thử-sai một bước trên trạng thái s (sửa tại chỗ): giả sử từng cạnh trống là đường / không rồi lan truyền,
     * nhánh nào mâu thuẫn thì cạnh mang giá trị còn lại. Lặp tới khi không suy thêm được. false = s mâu thuẫn.
     */
    let scratch = null; // bản nháp dùng lại cho mỗi lần thử (chép nhanh, không cấp phát mảng mới)
    function probe(s) {
      if (!scratch) scratch = new Int16Array(SIZE);
      const t = scratch;
      let progress = true;
      while (progress && !solved(s)) {
        progress = false;
        for (let e = 0; e < E && !solved(s); e++) {
          if (s[e]) continue;
          for (let val = 1; val <= 2; val++) {
            t.set(s);
            if (set(t, e, val) && propagate(t)) continue;
            queue.length = 0;
            // Giả sử val dẫn tới mâu thuẫn → cạnh này chắc chắn mang giá trị còn lại
            if (!(set(s, e, 3 - val) && propagate(s))) return false;
            progress = true;
            break;
          }
        }
      }
      return true;
    }

    /**
     * Đếm nghiệm (dừng ở limit); onSolution(s) được gọi với từng nghiệm.
     * Mỗi nút: lan truyền + thử-sai một bước (cắt nhánh rất mạnh), rồi rẽ nhánh; mọi suy luận đều đúng nên số nghiệm không đổi.
     */
    function count(limit, onSolution) {
      const s0 = init();
      if (!s0) return 0;
      let found = 0;
      (function dfs(s) {
        if (!probe(s)) return;
        if (solved(s)) {
          found++;
          if (onSolution) onSolution(s);
          return;
        }
        if (!connected(s)) return;
        const e = pick(s);
        if (e < 0) return;
        for (let val = 1; val <= 2 && found < limit; val++) {
          const t = s.slice();
          if (set(t, e, val) && propagate(t)) dfs(t);
          else queue.length = 0;
        }
      })(s0);
      return found;
    }

    /** Suy luận không đoán. level 0: chỉ lan truyền; level 1: thêm thử-sai một bước. Trả trạng thái (null = mâu thuẫn). */
    function logic(level) {
      const s = init();
      if (!s || level < 1) return s;
      return probe(s) ? s : null;
    }

    const lines = (s) => Array.from(s.subarray(0, E), (x) => (x === 1 ? 1 : 0));
    return { count, logic, solved, lines };
  }

  /** Số nghiệm của đề (dừng ở limit, mặc định 2). */
  function countSolutions(n, clues, limit) {
    return createSolver(n, clues, true).count(limit || 2);
  }

  /** Một nghiệm (mảng 0/1 theo cạnh) hoặc null. */
  function solve(n, clues) {
    const S = createSolver(n, clues, true);
    let out = null;
    S.count(1, (s) => { out = S.lines(s); });
    return out;
  }

  /** Giải bằng suy luận ở mức `level`; trả lời giải nếu suy ra được hết, không thì null. */
  function logicSolve(n, clues, level) {
    const S = createSolver(n, clues);
    const s = S.logic(level);
    return s && S.solved(s) ? S.lines(s) : null;
  }

  /* ---------------- Sinh đề ---------------- */

  /**
   * Vùng ô ngẫu nhiên: liền nhau, phần ngoài (nối ra viền bàn) cũng liền, không có hai ô chạm chéo kiểu bàn cờ
   * → biên của vùng là đúng một vòng kín không tự chạm. Ưu tiên ô chỉ kề một ô của vùng để vòng ngoằn ngoèo.
   */
  function makeRegion(n, r) {
    const C = n * n;
    const inside = new Uint8Array(C);
    const at = (row, col) => (row < 0 || col < 0 || row >= n || col >= n ? 0 : inside[row * n + col]);
    const target = Math.round(C * (0.4 + r() * 0.18));
    let size = 1;
    inside[Math.floor(r() * C)] = 1;
    const seen = new Uint8Array(C);
    const stack = [];

    function okToAdd(x) {
      const xr = Math.floor(x / n);
      const xc = x % n;
      inside[x] = 1;
      let good = true;
      // Không tạo điểm bàn cờ ở 4 góc của ô (vòng sẽ tự chạm ở điểm đó)
      for (let dr = 0; dr <= 1 && good; dr++) {
        for (let dc = 0; dc <= 1 && good; dc++) {
          const a = at(xr + dr - 1, xc + dc - 1);
          const b = at(xr + dr - 1, xc + dc);
          const c = at(xr + dr, xc + dc - 1);
          const d = at(xr + dr, xc + dc);
          if (a === d && b === c && a !== b) good = false;
        }
      }
      if (good) {
        // Phần ngoài phải nối được ra viền bàn (vùng không có lỗ)
        seen.fill(0);
        let outside = 0;
        let reached = 0;
        for (let i = 0; i < C; i++) {
          if (inside[i]) continue;
          outside++;
          const ir = Math.floor(i / n);
          const ic = i % n;
          if (ir === 0 || ic === 0 || ir === n - 1 || ic === n - 1) {
            seen[i] = 1;
            reached++;
            stack.push(i);
          }
        }
        while (stack.length) {
          const i = stack.pop();
          const ir = Math.floor(i / n);
          const ic = i % n;
          const nb = [ir > 0 ? i - n : -1, ir < n - 1 ? i + n : -1, ic > 0 ? i - 1 : -1, ic < n - 1 ? i + 1 : -1];
          for (let k = 0; k < 4; k++) {
            const j = nb[k];
            if (j >= 0 && !inside[j] && !seen[j]) {
              seen[j] = 1;
              reached++;
              stack.push(j);
            }
          }
        }
        good = reached === outside;
      }
      inside[x] = 0;
      return good;
    }

    while (size < target) {
      // Rút thăm có trọng số trong các ô kề vùng: kề 1 ô nặng 4, kề nhiều ô nặng 1
      const pool = [];
      for (let i = 0; i < C; i++) {
        if (inside[i]) continue;
        const ir = Math.floor(i / n);
        const ic = i % n;
        const k = at(ir - 1, ic) + at(ir + 1, ic) + at(ir, ic - 1) + at(ir, ic + 1);
        if (!k) continue;
        for (let w = k === 1 ? 4 : 1; w > 0; w--) pool.push(i);
      }
      let added = false;
      while (pool.length) {
        const x = pool[Math.floor(r() * pool.length)];
        if (okToAdd(x)) {
          inside[x] = 1;
          size++;
          added = true;
          break;
        }
        for (let k = pool.length - 1; k >= 0; k--) if (pool[k] === x) pool.splice(k, 1);
      }
      if (!added) break;
    }
    return inside;
  }

  /** Biên của vùng ô = các cạnh nằm giữa ô trong và ô ngoài (ngoài bàn tính là ngoài). */
  function regionLoop(n, inside) {
    const G = geom(n);
    const out = new Array(G.E).fill(0);
    for (let e = 0; e < G.E; e++) {
      const a = G.ec[2 * e];
      const b = G.ec[2 * e + 1];
      out[e] = (a >= 0 ? inside[a] : 0) !== (b >= 0 ? inside[b] : 0) ? 1 : 0;
    }
    return out;
  }

  function same(a, b) {
    if (!a || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /** Sinh đề cho mode theo seed: { n, clues (-1 = ô trống), sol (0/1 theo cạnh) }. */
  function generate(mode, seed) {
    const cfg = MODES[mode];
    const n = cfg.n;
    const r = rng(seed);
    for (;;) {
      const sol = regionLoop(n, makeRegion(n, r));
      const clues = cluesOf(n, sol);
      // Hiếm khi đề đủ số vẫn cần đoán ở mức suy luận của mode: bỏ vòng này, sinh vòng khác
      if (!same(logicSolve(n, clues, cfg.logic), sol)) continue;
      const order = [];
      for (let i = 0; i < n * n; i++) order.push(i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        const t = order[i];
        order[i] = order[j];
        order[j] = t;
      }
      for (let k = 0; k < order.length; k++) {
        const i = order[k];
        const keep = clues[i];
        clues[i] = -1;
        if (!same(logicSolve(n, clues, cfg.logic), sol)) clues[i] = keep;
      }
      return { n, clues, sol };
    }
  }

  /* ---------------- Ván chơi ---------------- */

  function fromPuzzle({ mode, n, seed, clues, sol }) {
    return {
      mode,
      n,
      seed,
      clues: clues.slice(),
      sol: Array.from(sol),
      edges: new Array(geom(n).E).fill(0),
      undo: [],
      redo: [],
      moves: 0,
      hints: 0,
    };
  }

  function newGame({ mode, seed }) {
    const p = generate(mode, seed);
    return fromPuzzle({ mode, n: p.n, seed, clues: p.clues, sol: p.sol });
  }

  const isSolved = (g) => checkLoop(g.n, g.clues, g.edges);

  /** Áp một bước gồm nhiều thay đổi [[cạnh, trạng thái mới], …] (một nét kéo = một bước hoàn tác). */
  function apply(g, changes) {
    if (isSolved(g)) return g;
    const E = g.edges.length;
    const edges = g.edges.slice();
    const step = [];
    for (let i = 0; i < changes.length; i++) {
      const e = changes[i][0];
      const to = changes[i][1];
      if (!Number.isInteger(e) || e < 0 || e >= E || (to !== 0 && to !== 1 && to !== 2) || edges[e] === to) continue;
      step.push([e, edges[e], to]);
      edges[e] = to;
    }
    if (!step.length) return g;
    return Object.assign({}, g, { edges, undo: g.undo.concat([step]), redo: [], moves: g.moves + 1 });
  }

  /** Chạm một cạnh: trống → đường → × → trống; reverse (chuột phải): × → trống, còn lại → ×. */
  function cycle(g, e, reverse) {
    const cur = g.edges[e];
    const next = reverse ? (cur === 2 ? 0 : 2) : (cur + 1) % 3;
    return apply(g, [[e, next]]);
  }

  function undo(g) {
    if (!g.undo.length || isSolved(g)) return g;
    const step = g.undo[g.undo.length - 1];
    const edges = g.edges.slice();
    for (let i = step.length - 1; i >= 0; i--) edges[step[i][0]] = step[i][1];
    return Object.assign({}, g, { edges, undo: g.undo.slice(0, -1), redo: g.redo.concat([step]) });
  }

  function redo(g) {
    if (!g.redo.length || isSolved(g)) return g;
    const step = g.redo[g.redo.length - 1];
    const edges = g.edges.slice();
    for (let i = 0; i < step.length; i++) edges[step[i][0]] = step[i][2];
    return Object.assign({}, g, { edges, undo: g.undo.concat([step]), redo: g.redo.slice(0, -1) });
  }

  /**
   * Phân tích để vẽ: trạng thái số ('' / 'done' đủ cạnh / 'over' thừa / 'short' không thể đủ vì bị × quá nhiều),
   * điểm ('' / 'branch' ≥ 3 đường / 'dead' đầu cụt), vòng con khép sớm (badLoop + loopEdges), đã thắng chưa.
   */
  function analyze(g) {
    const G = geom(g.n);
    const s = g.edges;
    const cell = new Array(G.C).fill('');
    for (let c = 0; c < G.C; c++) {
      const k = g.clues[c];
      if (k < 0) continue;
      let on = 0;
      let free = 0;
      for (let j = 0; j < 4; j++) {
        const x = s[G.cE[4 * c + j]];
        if (x === 1) on++;
        else if (x === 0) free++;
      }
      // Số 0 chỉ mờ khi cả 4 cạnh đã đánh × (không thì mờ ngay từ đầu, khó nhìn)
      cell[c] = on > k ? 'over' : on === k && (k > 0 || !free) ? 'done' : on + free < k ? 'short' : '';
    }
    const vertex = new Array(G.V).fill('');
    const deg = new Uint8Array(G.V);
    let ends = 0;
    for (let v = 0; v < G.V; v++) {
      let on = 0;
      let free = 0;
      for (let j = 0; j < G.vDeg[v]; j++) {
        const x = s[G.vE[4 * v + j]];
        if (x === 1) on++;
        else if (x === 0) free++;
      }
      deg[v] = on;
      ends += on;
      if (on >= 3) vertex[v] = 'branch';
      else if (on === 1 && !free) vertex[v] = 'dead';
    }
    const lines = ends / 2;
    const solved = isSolved(g);
    // Thành phần liên thông của các đường: thành phần mà mọi điểm đều bậc 2 là một vòng kín
    const loopEdges = [];
    if (!solved && lines) {
      const comp = new Int16Array(G.V).fill(-1);
      for (let v0 = 0; v0 < G.V; v0++) {
        if (!deg[v0] || comp[v0] >= 0) continue;
        const stack = [v0];
        comp[v0] = v0;
        let closed = true;
        while (stack.length) {
          const v = stack.pop();
          if (deg[v] !== 2) closed = false;
          for (let j = 0; j < G.vDeg[v]; j++) {
            const e = G.vE[4 * v + j];
            if (s[e] !== 1) continue;
            const w = G.ea[e] === v ? G.eb[e] : G.ea[e];
            if (comp[w] < 0) {
              comp[w] = v0;
              stack.push(w);
            }
          }
        }
        if (closed) for (let e = 0; e < G.E; e++) if (s[e] === 1 && comp[G.ea[e]] === v0) loopEdges.push(e);
      }
    }
    return { cell, vertex, lines, solved, badLoop: loopEdges.length > 0, loopEdges };
  }

  /** Gợi ý một cạnh { e, to }: sửa đường sai, rồi sửa × sai, rồi thêm một cạnh của lời giải (ưu tiên nối dài đường đang có). */
  function hint(g) {
    if (isSolved(g)) return null;
    const G = geom(g.n);
    const s = g.edges;
    for (let e = 0; e < G.E; e++) if (s[e] === 1 && !g.sol[e]) return { e, to: 2 };
    for (let e = 0; e < G.E; e++) if (s[e] === 2 && g.sol[e]) return { e, to: 1 };
    const touches = (v) => {
      for (let j = 0; j < G.vDeg[v]; j++) if (s[G.vE[4 * v + j]] === 1) return true;
      return false;
    };
    let first = -1;
    for (let e = 0; e < G.E; e++) {
      if (!g.sol[e] || s[e] === 1) continue;
      if (first < 0) first = e;
      if (touches(G.ea[e]) || touches(G.eb[e])) return { e, to: 1 };
    }
    return first >= 0 ? { e: first, to: 1 } : null;
  }

  function useHint(g) {
    const h = hint(g);
    if (!h) return g;
    const next = apply(g, [[h.e, h.to]]);
    return next === g ? g : Object.assign(next, { hints: g.hints + 1 });
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const toJSON = (g) => ({
    v: VERSION,
    mode: g.mode,
    n: g.n,
    seed: g.seed,
    clues: g.clues.slice(),
    sol: g.sol.join(''),
    edges: g.edges.join(''),
    undo: g.undo,
    redo: g.redo,
    moves: g.moves,
    hints: g.hints,
  });

  const isCount = (x) => Number.isInteger(x) && x >= 0;
  const isState = (x) => x === 0 || x === 1 || x === 2;

  /** Danh sách bước hoàn tác / làm lại: mỗi bước là mảng khác rỗng các [cạnh, trước, sau]. */
  function validSteps(list, E) {
    return Array.isArray(list) && list.every((step) => Array.isArray(step) && step.length > 0 && step.every((c) =>
      Array.isArray(c) && c.length === 3 && Number.isInteger(c[0]) && c[0] >= 0 && c[0] < E && isState(c[1]) && isState(c[2]) && c[1] !== c[2]));
  }

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION || !Object.prototype.hasOwnProperty.call(MODES, raw.mode)) return null;
    const n = MODES[raw.mode].n;
    if (raw.n !== n || !Number.isInteger(raw.seed)) return null;
    const G = geom(n);
    const { clues, sol, edges } = raw;
    if (!Array.isArray(clues) || clues.length !== G.C || !clues.every((c) => Number.isInteger(c) && c >= -1 && c <= 3)) return null;
    if (typeof sol !== 'string' || sol.length !== G.E || !/^[01]+$/.test(sol)) return null;
    if (typeof edges !== 'string' || edges.length !== G.E || !/^[012]+$/.test(edges)) return null;
    const solArr = Array.from(sol, Number);
    if (!checkLoop(n, clues, solArr)) return null; // lời giải phải là vòng hợp lệ khớp mọi số
    if (!isCount(raw.moves) || !isCount(raw.hints) || !validSteps(raw.undo, G.E) || !validSteps(raw.redo, G.E)) return null;
    return {
      mode: raw.mode,
      n,
      seed: raw.seed,
      clues: clues.slice(),
      sol: solArr,
      edges: Array.from(edges, Number),
      undo: raw.undo.map((st) => st.map((c) => c.slice())),
      redo: raw.redo.map((st) => st.map((c) => c.slice())),
      moves: raw.moves,
      hints: raw.hints,
    };
  }

  const api = {
    VERSION, MODES, rng, geom, hEdge, vEdge, edgeBetween, cluesOf, checkLoop,
    countSolutions, solve, logicSolve, generate,
    fromPuzzle, newGame, isSolved, apply, cycle, undo, redo, analyze, hint, useHint, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
