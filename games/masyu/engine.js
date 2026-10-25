/* =====================================================================
 * Masyu - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Bàn n×n ô; vòng đi qua tâm ô. Ô (r,c) = r*n + c. Cạnh nối hai ô kề:
 *     cạnh ngang trước: h(r,c) = r*(n-1) + c nối (r,c)-(r,c+1); cạnh dọc sau: v(r,c) = NH + r*n + c nối (r,c)-(r+1,c), NH = n*(n-1)
 *   - "Mặt" là ô vuông nhỏ giữa 4 tâm ô kề nhau: (n-1)×(n-1) mặt + phía ngoài bàn (dùng cho suy luận trong / ngoài vòng)
 *   - Hạt: pearls[i] = 0 không có / 1 trắng / 2 đen
 *     + trắng: vòng đi thẳng qua ô, và rẽ ở ít nhất một trong hai ô kề trước / sau
 *     + đen: vòng rẽ tại ô, và đi thẳng qua ô kế tiếp ở cả hai nhánh
 *   - Solver: lan truyền ràng buộc trên cạnh (bậc 0/2 của ô, ô có hạt bậc 2, không khép vòng sớm, luật hạt dạng
 *     "các mẫu cạnh hợp lệ quanh hạt"), thêm trong / ngoài vòng khi đếm nghiệm, thử-sai một bước + quay lui, dừng ở `limit`
 *   - Sinh đề: vùng mặt ngẫu nhiên liền, không lỗ, không chạm chéo → biên là một vòng; đặt hạt ở mọi ô thỏa luật,
 *     rồi gỡ dần khi đề vẫn giải được bằng suy luận ở mức của mode (suy luận đúng tới hết = nghiệm duy nhất)
 *   - Ván: edges[e] = 0 trống / 1 đường / 2 dấu ×; hoàn tác / làm lại theo bước (một nét kéo = một bước)
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  /** Mode: cỡ bàn + mức suy luận dùng khi gỡ hạt (0 = chỉ lan truyền, 1 = thêm thử-sai một bước). */
  const MODES = {
    s: { n: 6, logic: 0 },
    m: { n: 8, logic: 1 },
    l: { n: 10, logic: 1 },
    daily: { n: 8, logic: 1 },
  };

  /* ---------------- PRNG, ngày ---------------- */

  /** Băm chuỗi thành số 32 bit không dấu. */
  function hash(str) {
    let a = 0;
    for (let i = 0; i < str.length; i++) a = Math.imul(a ^ str.charCodeAt(i), 2654435761);
    return a >>> 0;
  }

  /** mulberry32; seed là số hoặc chuỗi. Cùng seed cho cùng dãy trên mọi máy. */
  function rng(seed) {
    let a = typeof seed === 'string' ? hash(seed) : (Number(seed) || 0) >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const pad = (x) => String(x).padStart(2, '0');
  /** Khóa ngày theo giờ máy: 'YYYY-MM-DD'. */
  const dateKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  /** 'YYYY-MM-DD' có phải ngày có thật không. */
  function isDateKey(key) {
    const m = typeof key === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }

  /** Seed của đề hằng ngày (mọi người cùng ngày cùng đề). */
  const dailySeed = (key) => hash('masyu-daily-' + key);

  /* ---------------- Hình học lưới ---------------- */

  const U = 0;
  const D = 1;
  const L = 2;
  const R = 3;

  const GEO = {};
  /** Bảng tra cứu cho bàn n×n (tính một lần mỗi cỡ). */
  function geom(n) {
    if (GEO[n]) return GEO[n];
    const V = n * n;
    const NH = n * (n - 1);
    const E = 2 * NH;
    const m = n - 1;
    const F = m * m; // số mặt; mặt F = phía ngoài bàn
    const ea = new Int16Array(E); // ô đầu của cạnh
    const eb = new Int16Array(E); // ô cuối
    const ef = new Int16Array(2 * E); // hai mặt hai bên cạnh (F = ngoài bàn)
    const dirE = new Int16Array(4 * V).fill(-1); // cạnh theo hướng U/D/L/R của ô (-1 = mép bàn)
    const nb = new Int16Array(4 * V).fill(-1); // ô kề theo hướng
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < m; c++) {
        const e = r * m + c;
        ea[e] = r * n + c;
        eb[e] = r * n + c + 1;
        ef[2 * e] = r > 0 ? (r - 1) * m + c : F;
        ef[2 * e + 1] = r < m ? r * m + c : F;
      }
    }
    for (let r = 0; r < m; r++) {
      for (let c = 0; c < n; c++) {
        const e = NH + r * n + c;
        ea[e] = r * n + c;
        eb[e] = (r + 1) * n + c;
        ef[2 * e] = c > 0 ? r * m + c - 1 : F;
        ef[2 * e + 1] = c < m ? r * m + c : F;
      }
    }
    for (let e = 0; e < E; e++) {
      const a = ea[e];
      const b = eb[e];
      if (b === a + 1) {
        dirE[4 * a + R] = e;
        dirE[4 * b + L] = e;
        nb[4 * a + R] = b;
        nb[4 * b + L] = a;
      } else {
        dirE[4 * a + D] = e;
        dirE[4 * b + U] = e;
        nb[4 * a + D] = b;
        nb[4 * b + U] = a;
      }
    }
    GEO[n] = { n, V, E, NH, F, ea, eb, ef, dirE, nb };
    return GEO[n];
  }

  const hEdge = (n, r, c) => r * (n - 1) + c;
  const vEdge = (n, r, c) => n * (n - 1) + r * n + c;

  /** Cạnh nối hai ô kề nhau, -1 nếu không kề. */
  function edgeBetween(n, a, b) {
    if (a < 0 || b < 0 || a >= n * n || b >= n * n) return -1;
    const ra = Math.floor(a / n);
    const ca = a % n;
    const rb = Math.floor(b / n);
    const cb = b % n;
    if (ra === rb && Math.abs(ca - cb) === 1) return hEdge(n, ra, Math.min(ca, cb));
    if (ca === cb && Math.abs(ra - rb) === 1) return vEdge(n, Math.min(ra, rb), ca);
    return -1;
  }

  /* ---------------- Luật ---------------- */

  /**
   * Kiểm tra độc lập với solver: các cạnh đường (1) có tạo đúng một vòng kín, không rẽ nhánh, đi qua mọi hạt
   * và thỏa luật từng hạt không?
   */
  function checkLoop(n, pearls, lines) {
    const G = geom(n);
    if (!lines || lines.length !== G.E || !pearls || pearls.length !== G.V) return false;
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
    for (let v = 0; v < G.V; v++) {
      if (deg[v] !== 0 && deg[v] !== 2) return false;
      if (pearls[v] && deg[v] !== 2) return false;
    }
    // Đi dọc vòng: phải quay về ô xuất phát sau đúng `count` cạnh (một vòng duy nhất)
    let prev = start;
    let v = G.eb[start];
    let walked = 1;
    while (v !== G.ea[start]) {
      let next = -1;
      for (let d = 0; d < 4; d++) {
        const e = G.dirE[4 * v + d];
        if (e >= 0 && e !== prev && lines[e] === 1) next = e;
      }
      if (next < 0 || ++walked > count) return false;
      v = G.ea[next] === v ? G.eb[next] : G.ea[next];
      prev = next;
    }
    if (walked !== count) return false;
    const on = (x, d) => {
      const e = G.dirE[4 * x + d];
      return e >= 0 && lines[e] === 1;
    };
    const straight = (x) => (on(x, U) && on(x, D)) || (on(x, L) && on(x, R));
    for (let x = 0; x < G.V; x++) {
      if (!pearls[x]) continue;
      if (pearls[x] === 1) {
        if (!straight(x)) return false;
        const ds = on(x, U) ? [U, D] : [L, R];
        if (straight(G.nb[4 * x + ds[0]]) && straight(G.nb[4 * x + ds[1]])) return false;
      } else {
        if (straight(x)) return false;
        for (let d = 0; d < 4; d++) if (on(x, d) && !straight(G.nb[4 * x + d])) return false;
      }
    }
    return true;
  }

  /** Ô nào trên vòng có thể đặt hạt: 1 trắng / 2 đen / 0 không đặt được. */
  function candidates(n, lines) {
    const G = geom(n);
    const on = (x, d) => {
      const e = G.dirE[4 * x + d];
      return e >= 0 && lines[e] === 1;
    };
    const straight = (x) => (on(x, U) && on(x, D)) || (on(x, L) && on(x, R));
    const out = new Array(G.V).fill(0);
    for (let x = 0; x < G.V; x++) {
      const ds = [];
      for (let d = 0; d < 4; d++) if (on(x, d)) ds.push(d);
      if (ds.length !== 2) continue;
      const a = G.nb[4 * x + ds[0]];
      const b = G.nb[4 * x + ds[1]];
      if (straight(x)) out[x] = !straight(a) || !straight(b) ? 1 : 0;
      else out[x] = straight(a) && straight(b) ? 2 : 0;
    }
    return out;
  }

  /* ---------------- Solver ---------------- */

  /**
   * Bộ giải cho một đề (n, pearls). Trạng thái là một Int16Array (chép nhanh khi rẽ nhánh), gồm lần lượt:
   *   cạnh (0 chưa biết / 1 đường / 2 không) · số đường tại ô · số "không" tại ô · đầu bên kia của đoạn (ở ô là đầu đoạn) ·
   *   độ dài đoạn · tổng số đường · cờ khép vòng · tổng đường ở lần quét luật khép vòng · union-find trong / ngoài của các mặt
   * Luật hạt: mỗi hạt có danh sách cạnh liên quan + các mẫu hợp lệ (1 đường / 2 không / 0 tùy); lan truyền giữ các mẫu
   * còn khớp, cạnh nào mọi mẫu khớp đều cùng giá trị thì gán luôn.
   * parity = true: dùng thêm suy luận trong / ngoài — đường giữa hai mặt ⇔ hai mặt khác phía.
   */
  function createSolver(n, pearls, parity) {
    const G = geom(n);
    const { E, V, F, ea, eb, ef, dirE, nb } = G;
    const VON = E;
    const VOFF = VON + V;
    const PART = VOFF + V;
    const CLEN = PART + V;
    const ONC = CLEN + V;
    const CLOSED = ONC + 1;
    const SCAN = CLOSED + 1;
    const UF = SCAN + 1;
    const UP = UF + F + 1;
    const SIZE = UP + F + 1;
    const queue = []; // ô v hoặc hạt V + k cần xét lại
    const vDeg = new Uint8Array(V);
    for (let v = 0; v < V; v++) for (let d = 0; d < 4; d++) if (dirE[4 * v + d] >= 0) vDeg[v]++;

    /* Dựng mẫu cho từng hạt */
    const pearlCells = [];
    const pE = []; // cạnh liên quan của hạt k
    const pPat = []; // các mẫu (mảng cùng độ dài pE[k])
    const pAgree = []; // bản nháp khi lan truyền
    const ePearls = []; // các hạt liên quan tới cạnh e
    for (let e = 0; e < E; e++) ePearls.push([]);
    const de = (x, d) => (x < 0 ? -1 : dirE[4 * x + d]);
    const dn = (x, d) => (x < 0 ? -1 : nb[4 * x + d]);
    for (let x = 0; x < V; x++) {
      if (!pearls[x]) continue;
      const k = pearlCells.length;
      pearlCells.push(x);
      const edges = [];
      for (let d = 0; d < 4; d++) {
        const e = de(x, d);
        if (e >= 0) edges.push(e);
        const c = de(dn(x, d), d);
        if (c >= 0) edges.push(c);
      }
      const pats = [];
      const mk = (pairs) => {
        const p = new Int8Array(edges.length);
        for (let i = 0; i < pairs.length; i += 2) if (pairs[i] >= 0) p[edges.indexOf(pairs[i])] = pairs[i + 1];
        pats.push(p);
      };
      if (pearls[x] === 2) {
        // Đen: rẽ (một cạnh dọc + một cạnh ngang), mỗi nhánh đi thẳng qua ô kế tiếp
        for (const dv of [U, D]) {
          for (const dh of [L, R]) {
            const c1 = de(dn(x, dv), dv);
            const c2 = de(dn(x, dh), dh);
            if (c1 < 0 || c2 < 0) continue;
            mk([de(x, dv), 1, c1, 1, de(x, dv ^ 1), 2, de(x, dh), 1, c2, 1, de(x, dh ^ 1), 2]);
          }
        }
      } else {
        // Trắng: đi thẳng theo một trục; ít nhất một ô kề trên trục đó rẽ (cạnh đi tiếp của nó là "không")
        for (const [d1, d2, p1, p2] of [[L, R, U, D], [U, D, L, R]]) {
          const e1 = de(x, d1);
          const e2 = de(x, d2);
          if (e1 < 0 || e2 < 0) continue;
          const base = [e1, 1, e2, 1, de(x, p1), 2, de(x, p2), 2];
          const c1 = de(dn(x, d1), d1);
          const c2 = de(dn(x, d2), d2);
          if (c1 < 0 || c2 < 0) mk(base);
          else {
            mk(base.concat([c1, 2]));
            mk(base.concat([c1, 1, c2, 2]));
          }
        }
      }
      pE.push(edges);
      pPat.push(pats);
      pAgree.push(new Int8Array(edges.length));
      edges.forEach((e) => ePearls[e].push(k));
    }
    const P = pearlCells.length;
    const isPearl = new Uint8Array(V);
    pearlCells.forEach((x) => { isPearl[x] = 1; });

    /* Union-find có chẵn lẻ trên các mặt: find trả gốc, ghi độ lệch (0 cùng phía / 1 khác phía) vào `off` */
    let off = 0;
    function find(s, x) {
      let r = x;
      let p = 0;
      while (s[UF + r] !== r) {
        p ^= s[UP + r];
        r = s[UF + r];
      }
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

    /** Gán cạnh e = val (1 đường / 2 không). Trả false nếu mâu thuẫn. */
    function set(s, e, val) {
      const cur = s[e];
      if (cur) return cur === val;
      s[e] = val;
      const a = ea[e];
      const b = eb[e];
      if (val === 1) {
        if (s[CLOSED]) return false; // vòng đã khép: không thêm đường nào nữa
        const da = s[VON + a] + 1;
        const db = s[VON + b] + 1;
        if (da > 2 || db > 2) return false;
        s[VON + a] = da;
        s[VON + b] = db;
        const onc = s[ONC] + 1;
        s[ONC] = onc;
        // Nối đoạn: da / db = 1 là ô vừa thành đầu đoạn mới, = 2 là đầu của một đoạn cũ được nối dài
        if (da === 1 && db === 1) {
          s[PART + a] = b;
          s[PART + b] = a;
          s[CLEN + a] = 1;
          s[CLEN + b] = 1;
        } else if (da === 2 && db === 1) {
          const o = s[PART + a];
          const len = s[CLEN + a] + 1;
          s[PART + a] = -1;
          s[PART + o] = b;
          s[PART + b] = o;
          s[CLEN + o] = len;
          s[CLEN + b] = len;
        } else if (da === 1 && db === 2) {
          const o = s[PART + b];
          const len = s[CLEN + b] + 1;
          s[PART + b] = -1;
          s[PART + o] = a;
          s[PART + a] = o;
          s[CLEN + o] = len;
          s[CLEN + a] = len;
        } else if (s[PART + a] === b) {
          // Khép vòng: chỉ hợp lệ khi vòng chứa mọi đường đã có
          if (s[CLEN + a] + 1 !== onc) return false;
          s[PART + a] = -1;
          s[PART + b] = -1;
          s[CLOSED] = 1;
        } else {
          const pa = s[PART + a];
          const pb = s[PART + b];
          const len = s[CLEN + a] + s[CLEN + b] + 1;
          s[PART + a] = -1;
          s[PART + b] = -1;
          s[PART + pa] = pb;
          s[PART + pb] = pa;
          s[CLEN + pa] = len;
          s[CLEN + pb] = len;
        }
      } else {
        s[VOFF + a]++;
        s[VOFF + b]++;
      }
      if (parity && !union(s, ef[2 * e], ef[2 * e + 1], val === 1 ? 1 : 0)) return false;
      queue.push(a, b);
      const ks = ePearls[e];
      for (let i = 0; i < ks.length; i++) queue.push(V + ks[i]);
      return true;
    }

    /** Khép vòng bằng cạnh nối a-b: mọi hạt phải đã nằm trên vòng (bậc 2 sau khi thêm cạnh). */
    function closingOk(s, a, b) {
      for (let k = 0; k < P; k++) {
        const x = pearlCells[k];
        if (s[VON + x] + (x === a || x === b ? 1 : 0) !== 2) return false;
      }
      return true;
    }

    /** Ở đầu đoạn v: cạnh nối thẳng tới đầu kia của chính đoạn sẽ khép vòng, chỉ giữ khi đó có thể là lời giải. */
    function closureRule(s, v) {
      const p = s[PART + v];
      for (let d = 0; d < 4; d++) {
        const e = dirE[4 * v + d];
        if (e < 0 || s[e] || nb[4 * v + d] !== p) continue;
        if ((s[CLEN + v] !== s[ONC] || !closingOk(s, v, p)) && !set(s, e, 2)) return false;
      }
      return true;
    }

    function checkVertex(s, v) {
      const on = s[VON + v];
      const unk = vDeg[v] - on - s[VOFF + v];
      if (on > 2) return false;
      if (isPearl[v] && on + unk < 2) return false;
      if (unk === 0) return on !== 1;
      const base = 4 * v;
      if (on === 2) {
        for (let k = 0; k < 4; k++) {
          const e = dirE[base + k];
          if (e >= 0 && !s[e] && !set(s, e, 2)) return false;
        }
      } else if (on === 1) {
        if (!closureRule(s, v)) return false;
        if (unk === 1) {
          for (let k = 0; k < 4; k++) {
            const e = dirE[base + k];
            if (e >= 0 && !s[e]) return set(s, e, 1);
          }
        }
      } else if (isPearl[v] && unk === 2) {
        // Ô có hạt phải có đúng 2 đường: còn đúng 2 hướng thì cả hai là đường
        for (let k = 0; k < 4; k++) {
          const e = dirE[base + k];
          if (e >= 0 && !s[e] && !set(s, e, 1)) return false;
        }
      } else if (unk === 1) {
        for (let k = 0; k < 4; k++) {
          const e = dirE[base + k];
          if (e >= 0 && !s[e]) return set(s, e, 2);
        }
      }
      return true;
    }

    /** Luật hạt k: giữ các mẫu còn khớp; cạnh chưa biết mà mọi mẫu khớp cùng giá trị thì gán. */
    function checkPearl(s, k) {
      const edges = pE[k];
      const pats = pPat[k];
      const agree = pAgree[k];
      agree.fill(-1);
      let alive = 0;
      for (let j = 0; j < pats.length; j++) {
        const p = pats[j];
        let fit = true;
        for (let i = 0; i < edges.length && fit; i++) {
          const v = s[edges[i]];
          if (v && p[i] && v !== p[i]) fit = false;
        }
        if (!fit) continue;
        alive++;
        for (let i = 0; i < edges.length; i++) {
          if (s[edges[i]]) continue;
          if (agree[i] === -1) agree[i] = p[i];
          else if (agree[i] !== p[i]) agree[i] = 0;
        }
      }
      if (!alive) return false;
      for (let i = 0; i < edges.length; i++) {
        if (agree[i] > 0 && !s[edges[i]] && !set(s, edges[i], agree[i])) return false;
      }
      return true;
    }

    /** Lan truyền tới điểm dừng. false = mâu thuẫn. */
    function propagate(s) {
      for (;;) {
        while (queue.length) {
          const x = queue.pop();
          if (!(x < V ? checkVertex(s, x) : checkPearl(s, x - V))) {
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
        if (parity) {
          // Hai mặt đã biết cùng / khác phía → cạnh giữa chúng là "không" / đường
          for (let e = 0; e < E; e++) {
            if (s[e]) continue;
            const ra = find(s, ef[2 * e]);
            const pa = off;
            if (ra !== find(s, ef[2 * e + 1])) continue;
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
      if (!P) return null; // đề không có hạt nào: không xét (vòng nào cũng được)
      const s = new Int16Array(SIZE);
      s.fill(-1, PART, PART + V);
      for (let i = 0; i <= F; i++) s[UF + i] = i;
      for (let v = 0; v < V; v++) queue.push(v);
      for (let k = 0; k < P; k++) queue.push(V + k);
      return propagate(s) ? s : null;
    }

    const solved = (s) => s[CLOSED] === 2;

    /** Cạnh để rẽ nhánh: cạnh trống ở đầu đoạn ít lựa chọn nhất; không có thì cạnh trống quanh hạt chưa đủ đường. */
    function pick(s) {
      let best = -1;
      let bestLeft = 9;
      for (let v = 0; v < V && bestLeft > 2; v++) {
        if (s[VON + v] !== 1) continue;
        let left = 0;
        let first = -1;
        for (let k = 0; k < 4; k++) {
          const e = dirE[4 * v + k];
          if (e >= 0 && !s[e]) {
            left++;
            if (first < 0) first = e;
          }
        }
        if (first >= 0 && left < bestLeft) {
          best = first;
          bestLeft = left;
        }
      }
      if (best >= 0) return best;
      for (let k = 0; k < P; k++) {
        const x = pearlCells[k];
        for (let d = 0; d < 4; d++) {
          const e = dirE[4 * x + d];
          if (e >= 0 && !s[e]) return e;
        }
      }
      for (let e = 0; e < E; e++) if (!s[e]) return e;
      return -1;
    }

    /** Mọi đường đã có và mọi hạt phải còn nối được với nhau qua các cạnh chưa bị loại. */
    const seen = new Uint8Array(V);
    const walk = [];
    function connected(s) {
      const start = pearlCells[0];
      seen.fill(0);
      seen[start] = 1;
      walk.push(start);
      while (walk.length) {
        const v = walk.pop();
        for (let d = 0; d < 4; d++) {
          const e = dirE[4 * v + d];
          if (e < 0 || s[e] === 2) continue;
          const w = nb[4 * v + d];
          if (!seen[w]) {
            seen[w] = 1;
            walk.push(w);
          }
        }
      }
      for (let v = 0; v < V; v++) if ((s[VON + v] || isPearl[v]) && !seen[v]) return false;
      return true;
    }

    /**
     * Thử-sai một bước trên trạng thái s (sửa tại chỗ): giả sử từng cạnh trống là đường / không rồi lan truyền,
     * nhánh nào mâu thuẫn thì cạnh mang giá trị còn lại. Lặp tới khi không suy thêm được. false = s mâu thuẫn.
     */
    let scratch = null;
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
            if (!(set(s, e, 3 - val) && propagate(s))) return false;
            progress = true;
            break;
          }
        }
      }
      return true;
    }

    /** Đếm nghiệm (dừng ở limit); onSolution(s) được gọi với từng nghiệm. Mọi suy luận đều đúng nên số nghiệm không đổi. */
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

    /**
     * Suy luận không đoán, xuất phát từ các cạnh đã biết `fixed` ([[cạnh, 1|2], …], có thể bỏ trống).
     * level 0: chỉ lan truyền; level 1: thêm thử-sai một bước. Trả trạng thái (null = mâu thuẫn).
     */
    function logic(level, fixed) {
      const s = init();
      if (!s) return null;
      if (fixed && fixed.length) {
        for (let i = 0; i < fixed.length; i++) {
          if (!set(s, fixed[i][0], fixed[i][1])) {
            queue.length = 0;
            return null;
          }
        }
        if (!propagate(s)) return null;
      }
      if (level < 1) return s;
      return probe(s) ? s : null;
    }

    const lines = (s) => Array.from(s.subarray(0, E), (x) => (x === 1 ? 1 : 0));
    const known = (s) => Array.from(s.subarray(0, E));
    return { count, logic, solved, lines, known };
  }

  /** Số nghiệm của đề (dừng ở limit, mặc định 2). */
  function countSolutions(n, pearls, limit) {
    return createSolver(n, pearls, true).count(limit || 2);
  }

  /** Một nghiệm (mảng 0/1 theo cạnh) hoặc null. */
  function solve(n, pearls) {
    const S = createSolver(n, pearls, true);
    let out = null;
    S.count(1, (s) => { out = S.lines(s); });
    return out;
  }

  /** Giải bằng suy luận ở mức `level`; trả lời giải nếu suy ra được hết, không thì null. */
  function logicSolve(n, pearls, level) {
    const S = createSolver(n, pearls);
    const s = S.logic(level);
    return s && S.solved(s) ? S.lines(s) : null;
  }

  /** Các cạnh suy ra được (0 chưa biết / 1 đường / 2 không) từ hạt + cạnh đã biết `fixed`; null nếu mâu thuẫn. */
  function deduce(n, pearls, fixed, level) {
    const S = createSolver(n, pearls);
    const s = S.logic(level, fixed);
    return s ? S.known(s) : null;
  }

  /* ---------------- Sinh đề ---------------- */

  /**
   * Vùng mặt ngẫu nhiên trên lưới m×m: liền nhau, phần ngoài (nối ra viền) cũng liền, không có hai mặt chạm chéo
   * kiểu bàn cờ → biên của vùng là đúng một vòng kín không tự chạm. Ưu tiên mặt chỉ kề một mặt để vòng ngoằn ngoèo.
   */
  function makeRegion(m, r) {
    const C = m * m;
    const inside = new Uint8Array(C);
    const at = (row, col) => (row < 0 || col < 0 || row >= m || col >= m ? 0 : inside[row * m + col]);
    const target = Math.round(C * (0.42 + r() * 0.18));
    let size = 1;
    inside[Math.floor(r() * C)] = 1;
    const seen = new Uint8Array(C);
    const stack = [];

    function okToAdd(x) {
      const xr = Math.floor(x / m);
      const xc = x % m;
      inside[x] = 1;
      let good = true;
      // Không tạo góc bàn cờ ở 4 đỉnh của mặt (vòng sẽ tự chạm tại tâm ô đó)
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
        // Phần ngoài phải nối được ra viền (vùng không có lỗ)
        seen.fill(0);
        let outside = 0;
        let reached = 0;
        for (let i = 0; i < C; i++) {
          if (inside[i]) continue;
          outside++;
          const ir = Math.floor(i / m);
          const ic = i % m;
          if (ir === 0 || ic === 0 || ir === m - 1 || ic === m - 1) {
            seen[i] = 1;
            reached++;
            stack.push(i);
          }
        }
        while (stack.length) {
          const i = stack.pop();
          const ir = Math.floor(i / m);
          const ic = i % m;
          const nbs = [ir > 0 ? i - m : -1, ir < m - 1 ? i + m : -1, ic > 0 ? i - 1 : -1, ic < m - 1 ? i + 1 : -1];
          for (let k = 0; k < 4; k++) {
            const j = nbs[k];
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
      // Rút thăm có trọng số trong các mặt kề vùng: kề 1 mặt nặng 4, kề nhiều mặt nặng 1
      const pool = [];
      for (let i = 0; i < C; i++) {
        if (inside[i]) continue;
        const ir = Math.floor(i / m);
        const ic = i % m;
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

  /** Biên của vùng mặt = các cạnh nằm giữa mặt trong và mặt ngoài (ngoài bàn tính là ngoài). */
  function regionLoop(n, inside) {
    const G = geom(n);
    const out = new Array(G.E).fill(0);
    const val = (f) => (f === G.F ? 0 : inside[f]);
    for (let e = 0; e < G.E; e++) out[e] = val(G.ef[2 * e]) !== val(G.ef[2 * e + 1]) ? 1 : 0;
    return out;
  }

  /** Điểm phạt của vòng: ô trên vòng không đặt được hạt + ô vòng không đi qua (cả hai để lại chỗ cho lời giải khác). */
  function loopPenalty(n, inside) {
    const G = geom(n);
    const sol = regionLoop(n, inside);
    const cand = candidates(n, sol);
    let bad = 0;
    for (let v = 0; v < G.V; v++) {
      if (cand[v]) continue;
      bad++; // ô không có hạt nào khả dĩ: hoặc vòng không đi qua, hoặc đi qua mà không ràng buộc được
    }
    return bad;
  }

  /**
   * Nắn vùng cho hợp Masyu (leo đồi): lật thử một mặt ngẫu nhiên (thêm / bớt), giữ vùng hợp lệ
   * (liền, không lỗ, không chạm chéo), nhận nếu điểm phạt không tăng (thỉnh thoảng nhận cả bước xấu để thoát kẹt).
   * Vòng sau khi nắn đi qua hầu hết các ô và gần như ô nào trên vòng cũng đặt được hạt → đề đủ hạt hầu như luôn duy nhất.
   */
  function shapeRegion(n, inside, r) {
    const m = n - 1;
    const C = m * m;
    const at = (row, col) => (row < 0 || col < 0 || row >= m || col >= m ? 0 : inside[row * m + col]);
    const seen = new Uint8Array(C);
    const stack = [];
    /** Các mặt mang giá trị `want` có liền nhau không (want = 0: phần ngoài, tính từ viền bàn). */
    function linked(want) {
      seen.fill(0);
      let total = 0;
      let reached = 0;
      for (let i = 0; i < C; i++) {
        if (inside[i] !== want) continue;
        total++;
        const ir = Math.floor(i / m);
        const ic = i % m;
        const seed = want ? !stack.length && !reached : ir === 0 || ic === 0 || ir === m - 1 || ic === m - 1;
        if (seed) {
          seen[i] = 1;
          reached++;
          stack.push(i);
        }
      }
      while (stack.length) {
        const i = stack.pop();
        const ir = Math.floor(i / m);
        const ic = i % m;
        if (ir > 0) visit(i - m);
        if (ir < m - 1) visit(i + m);
        if (ic > 0) visit(i - 1);
        if (ic < m - 1) visit(i + 1);
      }
      function visit(j) {
        if (inside[j] === want && !seen[j]) {
          seen[j] = 1;
          reached++;
          stack.push(j);
        }
      }
      return total > 0 && reached === total;
    }
    function valid(x) {
      const xr = Math.floor(x / m);
      const xc = x % m;
      for (let dr = 0; dr <= 1; dr++) {
        for (let dc = 0; dc <= 1; dc++) {
          const a = at(xr + dr - 1, xc + dc - 1);
          const b = at(xr + dr - 1, xc + dc);
          const c = at(xr + dr, xc + dc - 1);
          const d = at(xr + dr, xc + dc);
          if (a === d && b === c && a !== b) return false;
        }
      }
      // Thêm mặt: phần ngoài phải còn liền; bớt mặt: phần trong phải còn liền (mặt bớt ra luôn kề phần ngoài hoặc viền)
      if (inside[x]) {
        const k = at(xr - 1, xc) + at(xr + 1, xc) + at(xr, xc - 1) + at(xr, xc + 1);
        return k > 0 && linked(0);
      }
      const edge = xr === 0 || xc === 0 || xr === m - 1 || xc === m - 1;
      const out = !at(xr - 1, xc) || !at(xr + 1, xc) || !at(xr, xc - 1) || !at(xr, xc + 1);
      return (edge || out) && linked(1);
    }
    let cur = loopPenalty(n, inside);
    const iters = 6 * n * n;
    for (let it = 0; it < iters; it++) {
      const x = Math.floor(r() * C);
      inside[x] ^= 1;
      if (!valid(x)) {
        inside[x] ^= 1;
        continue;
      }
      const s = loopPenalty(n, inside);
      if (s <= cur || r() < 0.02) cur = s;
      else inside[x] ^= 1;
    }
  }

  function same(a, b) {
    if (!a || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /** Sinh đề cho mode theo seed: { n, pearls (0 / 1 trắng / 2 đen), sol (0/1 theo cạnh) }. */
  function generate(mode, seed) {
    const cfg = MODES[mode];
    const n = cfg.n;
    const r = rng(seed);
    for (;;) {
      const inside = makeRegion(n - 1, r);
      shapeRegion(n, inside, r);
      const sol = regionLoop(n, inside);
      const pearls = candidates(n, sol);
      // Đặt đủ hạt mà vẫn chưa suy ra được hết ở mức của mode: bỏ vòng này, sinh vòng khác
      if (!same(logicSolve(n, pearls, cfg.logic), sol)) continue;
      const order = [];
      for (let i = 0; i < n * n; i++) if (pearls[i]) order.push(i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        const t = order[i];
        order[i] = order[j];
        order[j] = t;
      }
      for (let k = 0; k < order.length; k++) {
        const i = order[k];
        const keep = pearls[i];
        pearls[i] = 0;
        if (!same(logicSolve(n, pearls, cfg.logic), sol)) pearls[i] = keep;
      }
      return { n, pearls, sol };
    }
  }

  /* ---------------- Ván chơi ---------------- */

  function fromPuzzle({ mode, n, seed, date, pearls, sol }) {
    return {
      mode,
      n,
      seed,
      date: date || null,
      pearls: pearls.slice(),
      sol: Array.from(sol),
      edges: new Array(geom(n).E).fill(0),
      undo: [],
      redo: [],
      moves: 0,
      hints: 0,
    };
  }

  /** Ván mới: mode thường theo seed; 'daily' theo ngày (seed suy từ ngày). */
  function newGame({ mode, seed, date }) {
    const daily = mode === 'daily';
    const s = daily ? dailySeed(date) : seed >>> 0;
    const p = generate(mode, s);
    return fromPuzzle({ mode, n: p.n, seed: s, date: daily ? date : null, pearls: p.pearls, sol: p.sol });
  }

  const isSolved = (g) => checkLoop(g.n, g.pearls, g.edges);

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

  /** Chạm một cạnh: trống → đường → × → trống; reverse (dấu ×): × → trống, còn lại → ×. */
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
   * Phân tích để vẽ (chỉ dựa vào luật, không so với lời giải):
   *   cell[i]: '' / 'branch' (≥ 3 đường) / 'dead' (một đường mà các hướng khác đều bị chặn)
   *   pearl[i]: '' / 'ok' (đã thỏa) / 'bad' (chắc chắn vi phạm với các đường và dấu × hiện có)
   *   badLoop + loopEdges: vòng con đã khép khi chưa thắng; lines: số đường; solved
   */
  function analyze(g) {
    const G = geom(g.n);
    const s = g.edges;
    const st = (v, d) => {
      const e = v < 0 ? -1 : G.dirE[4 * v + d];
      return e < 0 ? 3 : s[e]; // 3 = mép bàn (như bị chặn)
    };
    const on = (v, d) => st(v, d) === 1;
    const blocked = (v, d) => st(v, d) >= 2;
    const nbOf = (v, d) => G.nb[4 * v + d];
    const deg = new Uint8Array(G.V);
    let lines = 0;
    for (let e = 0; e < G.E; e++) {
      if (s[e] !== 1) continue;
      deg[G.ea[e]]++;
      deg[G.eb[e]]++;
      lines++;
    }
    const cell = new Array(G.V).fill('');
    for (let v = 0; v < G.V; v++) {
      if (deg[v] >= 3) cell[v] = 'branch';
      else if (deg[v] === 1) {
        let free = 0;
        for (let d = 0; d < 4; d++) if (st(v, d) === 0) free++;
        if (!free) cell[v] = 'dead';
      }
    }
    const turns = (v) => (on(v, U) || on(v, D)) && (on(v, L) || on(v, R));
    const pearl = new Array(G.V).fill('');
    for (let x = 0; x < G.V; x++) {
      const p = g.pearls[x];
      if (!p) continue;
      let bad = deg[x] >= 3;
      let ok = false;
      if (p === 1) {
        if (turns(x)) bad = true;
        // Hai trục đều bị chặn ít nhất một phía: không thể đi thẳng
        if ((blocked(x, U) || blocked(x, D)) && (blocked(x, L) || blocked(x, R))) bad = true;
        for (const [d1, d2] of [[U, D], [L, R]]) {
          if (!(on(x, d1) || on(x, d2))) continue;
          if (blocked(x, d1) || blocked(x, d2)) bad = true;
          if (on(x, d1) && on(x, d2)) {
            const a = nbOf(x, d1);
            const b = nbOf(x, d2);
            if (on(a, d1) && on(b, d2)) bad = true; // cả hai ô kề đều đi thẳng
            else if (turns(a) || turns(b) || blocked(a, d1) || blocked(b, d2)) ok = true;
          }
        }
      } else {
        if ((on(x, U) && on(x, D)) || (on(x, L) && on(x, R))) bad = true;
        // Mỗi trục cần ít nhất một hướng còn đi được: cạnh và cạnh đi tiếp không bị chặn, ô kề chưa rẽ
        const viable = (d) => {
          const a = nbOf(x, d);
          return !blocked(x, d) && !blocked(a, d) && !turns(a);
        };
        if ((!viable(U) && !viable(D)) || (!viable(L) && !viable(R))) bad = true;
        let good = 0;
        for (let d = 0; d < 4; d++) {
          if (!on(x, d)) continue;
          const a = nbOf(x, d);
          if (blocked(a, d) || turns(a)) bad = true;
          else if (on(a, d)) good++;
        }
        ok = good === 2;
      }
      pearl[x] = bad ? 'bad' : ok ? 'ok' : '';
    }
    const solved = isSolved(g);
    // Thành phần liên thông của các đường: thành phần mà mọi ô đều bậc 2 là một vòng kín
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
          for (let d = 0; d < 4; d++) {
            if (!on(v, d)) continue;
            const w = nbOf(v, d);
            if (comp[w] < 0) {
              comp[w] = v0;
              stack.push(w);
            }
          }
        }
        if (closed) for (let e = 0; e < G.E; e++) if (s[e] === 1 && comp[G.ea[e]] === v0) loopEdges.push(e);
      }
    }
    return { cell, pearl, lines, solved, badLoop: loopEdges.length > 0, loopEdges };
  }

  /**
   * Gợi ý một cạnh { e, to }: sửa đường sai, rồi sửa × sai; không có lỗi thì một cạnh suy ra được từ những gì đã đúng
   * (ưu tiên lan truyền luật cơ bản, rồi thử-sai một bước; ưu tiên đường nối dài đoạn đang có), cuối cùng là một cạnh của lời giải.
   */
  function hint(g) {
    if (isSolved(g)) return null;
    const G = geom(g.n);
    const s = g.edges;
    for (let e = 0; e < G.E; e++) if (s[e] === 1 && !g.sol[e]) return { e, to: 2 };
    for (let e = 0; e < G.E; e++) if (s[e] === 2 && g.sol[e]) return { e, to: 1 };
    const fixed = [];
    for (let e = 0; e < G.E; e++) if (s[e]) fixed.push([e, s[e]]);
    const touches = (v) => {
      for (let d = 0; d < 4; d++) {
        const e = G.dirE[4 * v + d];
        if (e >= 0 && s[e] === 1) return true;
      }
      return false;
    };
    /** Trong các cạnh đường mà `known` khẳng định nhưng người chơi chưa vẽ, chọn cạnh nối dài đoạn đang có trước. */
    function choose(known) {
      let first = -1;
      for (let e = 0; e < G.E; e++) {
        if (known[e] !== 1 || s[e] === 1) continue;
        if (first < 0) first = e;
        if (touches(G.ea[e]) || touches(G.eb[e])) return e;
      }
      return first;
    }
    for (let level = 0; level <= 1; level++) {
      const known = deduce(g.n, g.pearls, fixed, level);
      if (!known) break;
      const e = choose(known);
      if (e >= 0) return { e, to: 1 };
    }
    const e = choose(g.sol);
    return e >= 0 ? { e, to: 1 } : null;
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
    date: g.date,
    pearls: g.pearls.join(''),
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
    if (raw.n !== n || !Number.isInteger(raw.seed) || raw.seed < 0) return null;
    const daily = raw.mode === 'daily';
    if (daily ? !isDateKey(raw.date) || raw.seed !== dailySeed(raw.date) : raw.date !== null) return null;
    const G = geom(n);
    const { pearls, sol, edges } = raw;
    if (typeof pearls !== 'string' || pearls.length !== G.V || !/^[012]+$/.test(pearls)) return null;
    if (typeof sol !== 'string' || sol.length !== G.E || !/^[01]+$/.test(sol)) return null;
    if (typeof edges !== 'string' || edges.length !== G.E || !/^[012]+$/.test(edges)) return null;
    const pearlArr = Array.from(pearls, Number);
    const solArr = Array.from(sol, Number);
    if (!pearlArr.some((p) => p) || !checkLoop(n, pearlArr, solArr)) return null; // lời giải phải là vòng hợp lệ với mọi hạt
    if (!isCount(raw.moves) || !isCount(raw.hints) || !validSteps(raw.undo, G.E) || !validSteps(raw.redo, G.E)) return null;
    return {
      mode: raw.mode,
      n,
      seed: raw.seed,
      date: daily ? raw.date : null,
      pearls: pearlArr,
      sol: solArr,
      edges: Array.from(edges, Number),
      undo: raw.undo.map((st) => st.map((c) => c.slice())),
      redo: raw.redo.map((st) => st.map((c) => c.slice())),
      moves: raw.moves,
      hints: raw.hints,
    };
  }

  const api = {
    VERSION, MODES, rng, hash, dateKey, isDateKey, dailySeed, geom, hEdge, vEdge, edgeBetween, checkLoop, candidates,
    countSolutions, solve, logicSolve, deduce, generate,
    fromPuzzle, newGame, isSolved, apply, cycle, undo, redo, analyze, hint, useHint, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
