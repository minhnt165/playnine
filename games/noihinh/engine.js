/* =====================================================================
 * Nối Hình - Engine thuần (không đụng DOM)
 *   - Các ô xếp chồng nhiều lớp; toạ độ tính theo đơn vị 1/8 cạnh ô (ô rộng 8 x 8)
 *   - Ô bị che khi có ô ở lớp cao hơn chồng lên (lệch dưới 8 đơn vị theo cả hai chiều)
 *   - Chạm ô không bị che: ô xuống khay; khay có 3 ô cùng hình thì 3 ô biến mất
 *   - Khay đầy (mặc định 7 chỗ) mà không ăn được bộ ba nào thì thua
 *   - Trợ giúp: Lấy ra (3 ô đầu khay ra hàng chờ), Hoàn tác, Xáo trộn, Thêm ô khay
 * ===================================================================== */
(function (root) {
  'use strict';

  const TILE = 8; // cạnh ô theo đơn vị toạ độ
  const TRAY_SIZE = 7;
  const MAX_TRAY = 8; // sau khi dùng "Thêm ô"
  const HOLD_SIZE = 3; // số ô "Lấy ra" mang ra hàng chờ
  const BOOSTERS = { out: 1, undo: 3, shuffle: 1, slot: 1 }; // lượt trợ giúp mỗi lần chơi một cấp độ

  /* ---------------- PRNG ---------------- */

  function seededRandom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleInPlace(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /* ---------------- Cấp độ ---------------- */

  /**
   * Cấu hình cấp độ n (từ 1): số cột / hàng của lớp dưới cùng, số lớp, số loại hình,
   * tỉ lệ lấp ô, số ô mỗi chồng bên, cỡ cửa sổ trộn hình (càng lớn càng khó).
   */
  function levelConfig(n) {
    n = Math.max(1, Math.floor(n) || 1);
    if (n === 1) return { level: 1, cols: 3, rows: 3, layers: 1, types: 3, fill: 1, pile: 0, window: 3 };
    if (n === 2) return { level: 2, cols: 6, rows: 5, layers: 2, types: 6, fill: 0.9, pile: 0, window: 6 };
    return {
      level: n,
      cols: 7,
      rows: Math.min(8, 6 + Math.floor((n - 3) / 3)),
      layers: Math.min(6, 3 + Math.floor((n - 3) / 2)),
      types: Math.min(18, 8 + (n - 3)),
      fill: Math.min(0.9, 0.62 + (n - 3) * 0.03),
      pile: Math.min(10, 3 + (n - 3)),
      window: n < 6 ? 6 : 9,
    };
  }

  /* ---------------- Che / mở ---------------- */

  const overlaps = (a, b) => Math.abs(a.x - b.x) < TILE && Math.abs(a.y - b.y) < TILE;

  /** Ô `t` không bị ô nào trong `list` (lớp cao hơn) che. */
  function isFreeAmong(t, list) {
    for (const o of list) if (o !== t && o.z > t.z && overlaps(o, t)) return false;
    return true;
  }

  /* ---------------- Sinh màn ---------------- */

  /** Vị trí các ô (chưa có hình) cho cấp độ theo cấu hình. */
  function layoutFor(cfg, rng) {
    const pos = [];
    const W = cfg.cols * TILE;
    for (let z = 0; z < cfg.layers; z++) {
      // Lớp lẻ lệch nửa ô và ít hơn một cột / hàng, giống kiểu xếp gạch
      const off = z % 2 ? TILE / 2 : 0;
      const cols = cfg.cols - (z % 2);
      const rows = cfg.rows - (z % 2);
      // Lớp càng cao càng thưa; đối xứng trái-phải cho đẹp
      const p = z === 0 ? cfg.fill : Math.max(0.3, cfg.fill - z * 0.1);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < Math.ceil(cols / 2); c++) {
          if (rng() >= p) continue;
          const mirror = cols - 1 - c;
          pos.push({ x: off + c * TILE, y: off + r * TILE, z });
          if (mirror !== c) pos.push({ x: off + mirror * TILE, y: off + r * TILE, z });
        }
      }
    }
    if (cfg.pile) {
      // Hai chồng dưới bàn: chồng trái lộ ô phải nhất, chồng phải lộ ô trái nhất
      const y = cfg.rows * TILE + TILE / 2;
      for (let k = 0; k < cfg.pile; k++) {
        pos.push({ x: k, y, z: k, pile: 'L' });
        pos.push({ x: W - TILE - k, y, z: k, pile: 'R' });
      }
    }
    // Bớt ô ở lớp trên cùng cho tổng chia hết cho 3 (bớt ô không làm hỏng thứ tự giải)
    pos.sort((a, b) => a.z - b.z);
    while (pos.length % 3 || pos.length < 3) {
      if (pos.length < 3) pos.push({ x: pos.length * TILE, y: 0, z: 0 });
      else pos.pop();
    }
    return pos.map((p, id) => Object.assign({ id }, p));
  }

  /**
   * Màn chơi cấp độ n. Bảo đảm giải được: chọn trước một thứ tự gỡ hợp lệ (luôn gỡ ô không bị che),
   * rồi gán hình theo bộ ba trong từng cửa sổ của thứ tự đó. Trả về { tiles, solution }.
   */
  function generateLevel(n, rng) {
    rng = rng || Math.random;
    const cfg = levelConfig(n);
    const tiles = layoutFor(cfg, rng);

    // Thứ tự gỡ ngẫu nhiên: mỗi bước lấy một ô đang không bị che
    const left = tiles.slice();
    const order = [];
    while (left.length) {
      const free = left.filter((t) => isFreeAmong(t, left));
      const t = free[Math.floor(rng() * free.length)];
      order.push(t);
      left.splice(left.indexOf(t), 1);
    }

    // Gán hình: mỗi cửa sổ (bội của 3) gồm các bộ ba, trộn trong cửa sổ.
    // Đi theo thứ tự này thì khay không bao giờ quá TRAY_SIZE ô.
    const typeCycle = shuffleInPlace(Array.from({ length: cfg.types }, (_, i) => i), rng);
    let next = 0;
    for (let s = 0; s < order.length; s += cfg.window) {
      const chunk = order.slice(s, s + cfg.window);
      const kinds = [];
      for (let k = 0; k < chunk.length / 3; k++) {
        const t = typeCycle[next++ % typeCycle.length];
        kinds.push(t, t, t);
      }
      shuffleInPlace(kinds, rng);
      chunk.forEach((tile, k) => {
        tile.type = kinds[k];
      });
    }
    return { tiles, solution: order.map((t) => t.id) };
  }

  /* ---------------- Ván chơi ---------------- */

  /** Trạng thái chơi một cấp độ. tile.at: 'board' | 'tray' | 'hold' | 'gone'. */
  function createGame(n, rng) {
    const { tiles } = generateLevel(n, rng);
    tiles.forEach((t) => {
      t.at = 'board';
    });
    return {
      level: Math.max(1, Math.floor(n) || 1),
      tiles,
      tray: [],
      hold: [],
      cap: TRAY_SIZE,
      boosters: Object.assign({}, BOOSTERS),
      history: [], // id các ô đã cho xuống khay, để hoàn tác
      status: 'playing', // playing | won | lost
    };
  }

  const tileById = (g, id) => g.tiles[id];
  const onBoard = (g) => g.tiles.filter((t) => t.at === 'board');

  /** Ô chạm được: trên bàn và không bị che, hoặc đang ở hàng chờ. */
  function isFree(g, id) {
    const t = tileById(g, id);
    if (!t) return false;
    if (t.at === 'hold') return true;
    if (t.at !== 'board') return false;
    return isFreeAmong(t, onBoard(g));
  }

  function freeIds(g) {
    const board = onBoard(g);
    return board.filter((t) => isFreeAmong(t, board)).map((t) => t.id);
  }

  const remaining = (g) => g.tiles.filter((t) => t.at !== 'gone').length;

  /** Vị trí ô id sẽ vào khay: ngay sau ô cùng hình cuối cùng (hoặc cuối khay). */
  function insertPosition(g, id) {
    const type = tileById(g, id).type;
    for (let i = g.tray.length - 1; i >= 0; i--) if (tileById(g, g.tray[i]).type === type) return i + 1;
    return g.tray.length;
  }

  function insertTray(g, id) {
    g.tray.splice(insertPosition(g, id), 0, id);
  }

  /**
   * Chạm ô id. Trả về null nếu không chạm được; ngược lại { cleared: [id...] }.
   * Sau đó g.status có thể thành 'won' hoặc 'lost'.
   */
  function pick(g, id) {
    if (g.status !== 'playing' || !isFree(g, id)) return null;
    const t = tileById(g, id);
    if (t.at === 'hold') g.hold.splice(g.hold.indexOf(id), 1);
    t.at = 'tray';
    insertTray(g, id);
    g.history.push(id);

    const same = g.tray.filter((x) => tileById(g, x).type === t.type);
    let cleared = [];
    if (same.length >= 3) {
      cleared = same.slice(0, 3);
      g.tray = g.tray.filter((x) => cleared.indexOf(x) < 0);
      cleared.forEach((x) => {
        tileById(g, x).at = 'gone';
      });
      // Ô đã ăn thì không hoàn tác được nữa
      g.history = g.history.filter((x) => cleared.indexOf(x) < 0);
    }
    if (remaining(g) === 0) g.status = 'won';
    else if (g.tray.length >= g.cap) g.status = 'lost';
    return { cleared };
  }

  /** Hoàn tác: đưa ô vừa xuống khay (chưa bị ăn) về chỗ cũ. Trả về id hoặc null. */
  function undo(g) {
    if (g.status !== 'playing' || g.boosters.undo <= 0 || !g.history.length) return null;
    const id = g.history.pop();
    const t = tileById(g, id);
    g.tray.splice(g.tray.indexOf(id), 1);
    t.at = t.fromHold ? 'hold' : 'board';
    if (t.at === 'hold') g.hold.push(id);
    g.boosters.undo--;
    return id;
  }

  /** Lấy ra: đưa tối đa 3 ô đầu khay ra hàng chờ (chỉ khi hàng chờ trống). Cứu được cả ván vừa thua. */
  function moveOut(g) {
    if (g.boosters.out <= 0 || !g.tray.length || g.hold.length || g.status === 'won') return null;
    const ids = g.tray.splice(0, HOLD_SIZE);
    ids.forEach((id) => {
      const t = tileById(g, id);
      t.at = 'hold';
      t.fromHold = true;
    });
    g.hold = ids.slice();
    g.history = g.history.filter((x) => ids.indexOf(x) < 0);
    g.boosters.out--;
    g.status = 'playing';
    return ids;
  }

  /** Thêm một ô cho khay (tối đa MAX_TRAY). Cứu được ván vừa thua. */
  function addSlot(g) {
    if (g.boosters.slot <= 0 || g.cap >= MAX_TRAY || g.status === 'won') return false;
    g.cap++;
    g.boosters.slot--;
    g.status = 'playing';
    return true;
  }

  /** Xáo trộn hình của các ô còn trên bàn (giữ vị trí). */
  function shuffle(g, rng) {
    if (g.status !== 'playing' || g.boosters.shuffle <= 0) return false;
    rng = rng || Math.random;
    const board = onBoard(g);
    const types = shuffleInPlace(board.map((t) => t.type), rng);
    board.forEach((t, k) => {
      t.type = types[k];
    });
    g.history = [];
    g.boosters.shuffle--;
    return true;
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  function toJSON(g) {
    return {
      level: g.level,
      cap: g.cap,
      tray: g.tray.slice(),
      hold: g.hold.slice(),
      history: g.history.slice(),
      boosters: Object.assign({}, g.boosters),
      tiles: g.tiles.map((t) => [t.x, t.y, t.z, t.type, t.at, t.pile || '', t.fromHold ? 1 : 0]),
    };
  }

  /** Dựng lại ván từ JSON; dữ liệu hỏng trả null. */
  function fromJSON(o) {
    try {
      if (!o || typeof o !== 'object' || !Array.isArray(o.tiles) || !o.tiles.length || o.tiles.length > 600) return null;
      const AT = ['board', 'tray', 'hold', 'gone'];
      const int = (x) => Number.isInteger(x);
      const tiles = o.tiles.map((a, id) => {
        if (!Array.isArray(a) || !int(a[0]) || !int(a[1]) || !int(a[2]) || !int(a[3]) || a[3] < 0 || AT.indexOf(a[4]) < 0) throw 0;
        const t = { id, x: a[0], y: a[1], z: a[2], type: a[3], at: a[4] };
        if (a[5]) t.pile = String(a[5]);
        if (a[6]) t.fromHold = true;
        return t;
      });
      const ids = (arr, at) => {
        if (!Array.isArray(arr)) throw 0;
        arr.forEach((id) => {
          if (!int(id) || !tiles[id] || tiles[id].at !== at) throw 0;
        });
        return arr.slice();
      };
      const tray = ids(o.tray, 'tray');
      const hold = ids(o.hold, 'hold');
      if (tray.length !== tiles.filter((t) => t.at === 'tray').length) throw 0;
      if (hold.length !== tiles.filter((t) => t.at === 'hold').length) throw 0;
      const cap = int(o.cap) && o.cap >= TRAY_SIZE && o.cap <= MAX_TRAY ? o.cap : TRAY_SIZE;
      if (tray.length >= cap) throw 0;
      const level = int(o.level) && o.level >= 1 ? o.level : 1;
      const boosters = {};
      Object.keys(BOOSTERS).forEach((k) => {
        const v = o.boosters && o.boosters[k];
        boosters[k] = int(v) && v >= 0 ? Math.min(v, BOOSTERS[k]) : 0;
      });
      const history = Array.isArray(o.history) ? o.history.filter((id) => int(id) && tiles[id] && tiles[id].at === 'tray') : [];
      const g = { level, tiles, tray, hold, cap, boosters, history, status: 'playing' };
      if (remaining(g) === 0) return null;
      return g;
    } catch (e) {
      return null;
    }
  }

  const api = {
    TILE,
    TRAY_SIZE,
    MAX_TRAY,
    HOLD_SIZE,
    BOOSTERS,
    seededRandom,
    levelConfig,
    generateLevel,
    createGame,
    isFree,
    freeIds,
    remaining,
    insertPosition,
    pick,
    undo,
    moveOut,
    addSlot,
    shuffle,
    toJSON,
    fromJSON,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NoiHinh = api;
})(typeof window !== 'undefined' ? window : this);
