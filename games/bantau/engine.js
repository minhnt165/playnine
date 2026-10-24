/* =====================================================================
 * Bắn Tàu - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Lưới 10×10 mỗi bên, đội tàu 5-4-3-3-2 (FLEET); tàu thẳng ngang / dọc, KHÔNG chạm nhau kể cả chéo
 *   - Ô i = hàng * 10 + cột. Tàu { r, c, len, v } (v = dọc), (r, c) là ô đầu (trên cùng / trái cùng)
 *   - Bàn của người p: fleets[p] (đội tàu) và marks[p] (dấu các phát bắn VÀO bàn đó):
 *     0 chưa biết, 1 trượt, 2 trúng, 3 chắc chắn trống (suy ra từ luật không chạm: ô chéo của ô trúng
 *     và mọi ô quanh tàu đã chìm). Ô 3 không bắn được, hai bên đều thấy như nhau.
 *   - Người chơi (0) bắn trước, lượt xen kẽ mỗi bên một phát (trúng cũng không được bắn tiếp)
 *   - Máy (1) chỉ nhìn "view" của bàn bị bắn (dấu + tàu đã chìm), không bao giờ đọc tàu chưa lộ.
 *     Dễ: ngẫu nhiên ô chưa biết; Vừa: săn - mục tiêu (hunt / target: săn ngẫu nhiên, trúng thì bắn quanh);
 *     Khó: bản đồ mật độ xác suất (đếm mọi vị trí còn có thể của các tàu chưa chìm)
 *   - Tất định: đội tàu máy theo seed, nước của máy theo (seed, số phát đã bắn)
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const N = 10;
  const FLEET = [5, 4, 3, 3, 2];
  const LEVELS = ['easy', 'medium', 'hard'];
  const UNKNOWN = 0;
  const MISS = 1;
  const HIT = 2;
  const EMPTY = 3;

  const idx = (r, c) => r * N + c;
  const rowOf = (i) => Math.floor(i / N);
  const colOf = (i) => i % N;
  const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

  /* ---------------- PRNG mulberry32 (seed số hoặc chuỗi), lưu / nạp được trạng thái ---------------- */
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    return h;
  }
  function rng(seed) {
    let a = typeof seed === 'string' ? hashStr(seed) : seed == null ? (Math.random() * 4294967296) >>> 0 : seed >>> 0;
    const r = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (n) => Math.floor(r() * n);
    r.getState = () => a;
    r.setState = (s) => { a = s >>> 0; };
    return r;
  }

  /* ---------------- Tàu và xếp tàu ---------------- */
  function shipCells(s) {
    const out = [];
    for (let k = 0; k < s.len; k++) out.push(s.v ? idx(s.r + k, s.c) : idx(s.r, s.c + k));
    return out;
  }

  const isShip = (s) => !!s && typeof s === 'object' && Number.isInteger(s.r) && Number.isInteger(s.c) &&
    Number.isInteger(s.len) && typeof s.v === 'boolean';

  /** Tàu thứ k (độ dài FLEET[k]) đặt ở `s` có hợp lệ với các tàu khác trong `ships` không (bỏ qua ships[k]). */
  function canPlace(ships, k, s) {
    if (!isShip(s) || s.len !== FLEET[k]) return false;
    const r2 = s.v ? s.r + s.len - 1 : s.r;
    const c2 = s.v ? s.c : s.c + s.len - 1;
    if (!inside(s.r, s.c) || !inside(r2, c2)) return false;
    for (let j = 0; j < ships.length; j++) {
      const o = ships[j];
      if (j === k || !o) continue;
      const or2 = o.v ? o.r + o.len - 1 : o.r;
      const oc2 = o.v ? o.c : o.c + o.len - 1;
      // Hai hình chữ nhật cách nhau ít nhất một ô (không chồng, không chạm cạnh, không chạm chéo)
      if (s.r <= or2 + 1 && o.r <= r2 + 1 && s.c <= oc2 + 1 && o.c <= c2 + 1) return false;
    }
    return true;
  }

  /** Mọi vị trí hợp lệ cho tàu thứ k khi các tàu khác đứng yên. */
  function placements(ships, k) {
    const out = [];
    const len = FLEET[k];
    for (let v = 0; v < 2; v++) {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const s = { r, c, len, v: v === 1 };
          if (canPlace(ships, k, s)) out.push(s);
        }
      }
    }
    return out;
  }

  /** Đủ 5 tàu, đúng độ dài, không tàu nào chạm tàu nào. */
  function fleetValid(ships) {
    if (!Array.isArray(ships) || ships.length !== FLEET.length) return false;
    for (let k = 0; k < FLEET.length; k++) if (!canPlace(ships, k, ships[k])) return false;
    return true;
  }

  /** Xếp ngẫu nhiên các tàu còn thiếu (null) trong `partial`, giữ nguyên tàu đã đặt. Tàu dài xếp trước. */
  function randomFleet(rand, partial) {
    const base = FLEET.map((_, k) => (partial && partial[k] ? Object.assign({}, partial[k]) : null));
    const order = FLEET.map((_, k) => k).filter((k) => !base[k]);
    for (let attempt = 0; attempt < 200; attempt++) {
      const ships = base.slice();
      let okAll = true;
      for (const k of order) {
        const list = placements(ships, k);
        if (!list.length) {
          okAll = false;
          break;
        }
        ships[k] = list[rand.int(list.length)];
      }
      if (okAll) return ships;
    }
    // Phần đã đặt chặn hết chỗ: bỏ qua phần đã đặt (không xảy ra với ván xếp tay thông thường)
    return partial ? randomFleet(rand) : null;
  }

  /* ---------------- Ván ---------------- */
  const copyShip = (s) => ({ r: s.r, c: s.c, len: s.len, v: s.v });

  /** Ván mới: `fleet` là đội tàu người chơi đã xếp; đội tàu máy sinh từ seed. Sai luật trả null. */
  function newGame({ seed, fleet }) {
    if (!fleetValid(fleet)) return null;
    const s = seed >>> 0;
    const ai = randomFleet(rng(s ^ 0x5eaba7));
    return {
      seed: s,
      ply: 0,
      turn: 0,
      winner: null,
      fleets: [fleet.map(copyShip), ai],
      marks: [new Array(N * N).fill(UNKNOWN), new Array(N * N).fill(UNKNOWN)],
    };
  }

  /** Tàu nào của bàn p nằm ở ô i (-1 nếu là nước). */
  function shipAt(g, p, i) {
    const f = g.fleets[p];
    for (let k = 0; k < f.length; k++) if (shipCells(f[k]).indexOf(i) >= 0) return k;
    return -1;
  }

  const isSunk = (g, p, k) => shipCells(g.fleets[p][k]).every((i) => g.marks[p][i] === HIT);
  const shipsLeft = (g, p) => g.fleets[p].reduce((n, _, k) => n + (isSunk(g, p, k) ? 0 : 1), 0);
  /** Số phát người p đã bắn (vào bàn đối thủ) và số phát trúng. */
  const shotsBy = (g, p) => g.marks[1 - p].reduce((n, m) => n + (m === MISS || m === HIT ? 1 : 0), 0);
  const hitsBy = (g, p) => g.marks[1 - p].reduce((n, m) => n + (m === HIT ? 1 : 0), 0);

  /** Ô quanh (8 hướng) của một ô. */
  function around(i) {
    const r = rowOf(i);
    const c = colOf(i);
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if ((dr || dc) && inside(r + dr, c + dc)) out.push(idx(r + dr, c + dc));
      }
    }
    return out;
  }
  function diagonals(i) {
    const r = rowOf(i);
    const c = colOf(i);
    return [[-1, -1], [-1, 1], [1, -1], [1, 1]].filter(([dr, dc]) => inside(r + dr, c + dc)).map(([dr, dc]) => idx(r + dr, c + dc));
  }

  /**
   * Bên tới lượt bắn vào ô i của bàn đối thủ.
   * Trả { game, res: 'miss' | 'hit' | 'sunk', ship (chỉ số tàu trúng, -1 khi trượt), auto (ô vừa thành "chắc chắn trống") }
   * hoặc null nếu không hợp lệ (hết ván, ô ngoài bàn, ô đã biết).
   */
  function fire(g, i) {
    if (g.winner != null || !Number.isInteger(i) || i < 0 || i >= N * N) return null;
    const shooter = g.turn;
    const target = 1 - shooter;
    if (g.marks[target][i] !== UNKNOWN) return null;
    const marks = g.marks.slice();
    const m = marks[target] = g.marks[target].slice();
    const next = Object.assign({}, g, { marks, ply: g.ply + 1, turn: target });
    const k = shipAt(g, target, i);
    const auto = [];
    const blank = (j) => {
      if (m[j] === UNKNOWN) {
        m[j] = EMPTY;
        auto.push(j);
      }
    };
    let res = 'miss';
    if (k < 0) {
      m[i] = MISS;
    } else {
      m[i] = HIT;
      res = 'hit';
      diagonals(i).forEach(blank);
      if (isSunk(next, target, k)) {
        res = 'sunk';
        shipCells(g.fleets[target][k]).forEach((c) => around(c).forEach(blank));
        if (shipsLeft(next, target) === 0) next.winner = shooter;
      }
    }
    return { game: next, res, ship: k, auto };
  }

  /** Những gì bên bắn thấy về bàn p: dấu bắn, ô của các tàu đã chìm, độ dài các tàu chưa chìm. */
  function viewOf(g, p) {
    const sunk = [];
    const left = [];
    g.fleets[p].forEach((s, k) => {
      if (isSunk(g, p, k)) sunk.push(shipCells(s));
      else left.push(s.len);
    });
    return { marks: g.marks[p].slice(), sunk, left };
  }

  /* ---------------- Máy ---------------- */
  const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  /** Ô trúng thuộc tàu chưa chìm. */
  function openHits(view) {
    const sunkSet = new Set([].concat(...view.sunk));
    const out = [];
    view.marks.forEach((m, i) => { if (m === HIT && !sunkSet.has(i)) out.push(i); });
    return out;
  }

  const pick = (list, rand) => list[rand.int(list.length)];

  /** Dễ: bắn ngẫu nhiên một ô chưa biết (ô chắc chắn trống đã bị loại sẵn). */
  function easyShot(view, rand) {
    const free = [];
    view.marks.forEach((m, i) => { if (m === UNKNOWN) free.push(i); });
    return pick(free, rand);
  }

  /** Vừa: săn - mục tiêu. Có ô trúng chưa chìm thì bắn quanh / nối dài; không thì săn ngẫu nhiên. */
  function mediumShot(view, rand) {
    const hits = openHits(view);
    const m = view.marks;
    if (hits.length) {
      const hitSet = new Set(hits);
      // Lấy một cụm ô trúng nối nhau theo hàng / cột (luật không chạm nên một cụm là một tàu)
      const start = hits[0];
      const cluster = [start];
      const seen = new Set(cluster);
      for (let q = 0; q < cluster.length; q++) {
        const r = rowOf(cluster[q]);
        const c = colOf(cluster[q]);
        for (const [dr, dc] of ORTHO) {
          const j = idx(r + dr, c + dc);
          if (inside(r + dr, c + dc) && hitSet.has(j) && !seen.has(j)) {
            seen.add(j);
            cluster.push(j);
          }
        }
      }
      const cand = [];
      if (cluster.length >= 2) {
        // Đã biết hướng: bắn nối dài hai đầu
        const vertical = colOf(cluster[0]) === colOf(cluster[1]);
        const lo = Math.min(...cluster);
        const hi = Math.max(...cluster);
        const step = vertical ? N : 1;
        const ends = [lo - step, hi + step].filter((j) => j >= 0 && j < N * N && (vertical || rowOf(j) === rowOf(lo)));
        ends.forEach((j) => { if (m[j] === UNKNOWN) cand.push(j); });
      } else {
        const r = rowOf(start);
        const c = colOf(start);
        for (const [dr, dc] of ORTHO) {
          if (inside(r + dr, c + dc) && m[idx(r + dr, c + dc)] === UNKNOWN) cand.push(idx(r + dr, c + dc));
        }
      }
      if (cand.length) return pick(cand, rand);
    }
    // Săn: bắn ngẫu nhiên như mức Dễ (không theo ô bàn cờ, để Vừa còn cách xa Khó)
    return easyShot(view, rand);
  }

  /**
   * Khó: bản đồ mật độ. Với mỗi tàu chưa chìm, xét mọi vị trí còn có thể: không đè ô trượt / chắc chắn trống / tàu đã chìm,
   * và (luật không chạm) không có ô trúng nào nằm sát bên ngoài vị trí đó. Có ô trúng chưa chìm thì chỉ tính vị trí
   * đi qua ô trúng, mỗi ô trúng đi qua nhân trọng số lên nhiều lần. Bắn ô chưa biết có tổng điểm cao nhất.
   */
  function hardShot(view, rand) {
    const m = view.marks;
    const hits = openHits(view);
    const isOpenHit = new Array(N * N).fill(false);
    hits.forEach((i) => { isOpenHit[i] = true; });
    const targetMode = hits.length > 0;
    const score = new Array(N * N).fill(0);
    const lens = view.left.slice();
    let any = false;
    const tally = (needHit) => {
      for (const len of lens) {
        for (let v = 0; v < 2; v++) {
          for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
              const r2 = v ? r + len - 1 : r;
              const c2 = v ? c : c + len - 1;
              if (r2 >= N || c2 >= N) continue;
              let covered = 0;
              let bad = false;
              for (let k = 0; k < len && !bad; k++) {
                const i = v ? idx(r + k, c) : idx(r, c + k);
                const x = m[i];
                if (x === HIT) {
                  if (isOpenHit[i]) covered++;
                  else bad = true;
                } else if (x !== UNKNOWN) bad = true;
              }
              if (bad) continue;
              // Viền quanh vị trí không được có ô trúng (ô trúng đó thuộc tàu khác, sẽ chạm)
              for (let rr = r - 1; rr <= r2 + 1 && !bad; rr++) {
                for (let cc = c - 1; cc <= c2 + 1 && !bad; cc++) {
                  if (!inside(rr, cc) || (rr >= r && rr <= r2 && cc >= c && cc <= c2)) continue;
                  if (m[idx(rr, cc)] === HIT) bad = true;
                }
              }
              if (bad) continue;
              if (needHit && !covered) continue;
              const w = needHit ? Math.pow(40, covered) : 1;
              for (let k = 0; k < len; k++) {
                const i = v ? idx(r + k, c) : idx(r, c + k);
                if (m[i] === UNKNOWN) {
                  score[i] += w;
                  any = true;
                }
              }
            }
          }
        }
      }
    };
    tally(targetMode);
    if (!any && targetMode) tally(false);
    let best = -1;
    let bestList = [];
    score.forEach((s, i) => {
      if (m[i] !== UNKNOWN) return;
      if (s > best) {
        best = s;
        bestList = [i];
      } else if (s === best) bestList.push(i);
    });
    if (best <= 0) return easyShot(view, rand);
    return pick(bestList, rand);
  }

  /** Chọn ô bắn theo mức; `view` = viewOf(ván, bàn bị bắn), `rand` = rng(...). */
  function chooseShot(view, level, rand) {
    if (level === 'easy') return easyShot(view, rand);
    if (level === 'medium') return mediumShot(view, rand);
    return hardShot(view, rand);
  }

  /** Nước của máy (bên 1) trong ván g: tất định theo seed của ván và số phát đã bắn. */
  function aiMove(g, level) {
    const rand = rng((g.seed ^ Math.imul(g.ply + 1, 0x9e3779b1)) >>> 0);
    return chooseShot(viewOf(g, 0), level, rand);
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  const shipToJSON = (s) => [s.r, s.c, s.len, s.v ? 1 : 0];
  /** Dấu bắn lưu dạng chuỗi 100 ký tự '0'..'3' (ô 3 được suy lại khi nạp). */
  const toJSON = (g) => ({
    v: VERSION,
    seed: g.seed,
    ply: g.ply,
    turn: g.turn,
    winner: g.winner,
    fleets: g.fleets.map((f) => f.map(shipToJSON)),
    marks: g.marks.map((m) => m.join('')),
  });

  /** Ván lưu hỏng, sai luật hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { seed, ply, turn, winner } = raw;
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) return null;
    if (!Number.isInteger(ply) || ply < 0 || (turn !== 0 && turn !== 1) || (winner !== null && winner !== 0 && winner !== 1)) return null;
    if (!Array.isArray(raw.fleets) || raw.fleets.length !== 2 || !Array.isArray(raw.marks) || raw.marks.length !== 2) return null;
    const fleets = [];
    for (const f of raw.fleets) {
      if (!Array.isArray(f) || f.length !== FLEET.length) return null;
      const ships = [];
      for (const s of f) {
        if (!Array.isArray(s) || s.length !== 4 || (s[3] !== 0 && s[3] !== 1)) return null;
        ships.push({ r: s[0], c: s[1], len: s[2], v: s[3] === 1 });
      }
      if (!fleetValid(ships)) return null;
      fleets.push(ships);
    }
    const g = { seed, ply, turn, winner, fleets, marks: [] };
    for (let p = 0; p < 2; p++) {
      const s = raw.marks[p];
      if (typeof s !== 'string' || !/^[0-3]{100}$/.test(s)) return null;
      const shipSet = new Set([].concat(...fleets[p].map(shipCells)));
      const m = [];
      for (let i = 0; i < N * N; i++) {
        const x = Number(s[i]);
        if ((x === HIT) !== (x === HIT && shipSet.has(i))) return null; // trúng ở ô nước
        if ((x === MISS || x === EMPTY) && shipSet.has(i)) return null; // trượt / trống ở ô có tàu
        m.push(x === EMPTY ? UNKNOWN : x);
      }
      g.marks.push(m);
    }
    // Suy lại ô chắc chắn trống từ ô trúng và tàu đã chìm
    for (let p = 0; p < 2; p++) {
      const m = g.marks[p];
      const blank = (j) => { if (m[j] === UNKNOWN) m[j] = EMPTY; };
      m.forEach((x, i) => { if (x === HIT) diagonals(i).forEach(blank); });
      fleets[p].forEach((sh, k) => { if (isSunk(g, p, k)) shipCells(sh).forEach((c) => around(c).forEach(blank)); });
    }
    // Số phát khớp lượt (người chơi đi trước, mỗi bên một phát) và khớp kết quả ván
    const s0 = shotsBy(g, 0);
    const s1 = shotsBy(g, 1);
    if (s0 + s1 !== ply || (s0 !== s1 && s0 !== s1 + 1)) return null;
    const dead0 = shipsLeft(g, 0) === 0;
    const dead1 = shipsLeft(g, 1) === 0;
    if (winner === null) {
      if (dead0 || dead1 || turn !== (s0 > s1 ? 1 : 0)) return null;
    } else {
      // Bên thắng vừa bắn phát cuối: lượt đã chuyển sang bên thua
      if (!(winner === 0 ? dead1 && !dead0 && s0 === s1 + 1 : dead0 && !dead1 && s0 === s1) || turn !== 1 - winner) return null;
    }
    return g;
  }

  const api = {
    VERSION, N, FLEET, LEVELS, UNKNOWN, MISS, HIT, EMPTY,
    idx, rowOf, colOf, rng, shipCells, canPlace, placements, fleetValid, randomFleet,
    newGame, fire, shipAt, isSunk, shipsLeft, shotsBy, hitsBy, viewOf, chooseShot, aiMove, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
