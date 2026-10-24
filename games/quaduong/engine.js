/* =====================================================================
 * Qua Đường - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Lưới COLS cột, hàng (làn) đánh số tăng dần về phía trước; vịt con xuất phát ở hàng 0
 *   - Bốn loại làn: cỏ (có cây chắn), đường (xe chạy), sông (gỗ / thuyền trôi), đường ray (tàu + đèn báo)
 *   - Mô phỏng bước thời gian cố định 60 bước / giây: step(g) đổi trực tiếp trạng thái g
 *   - Vị trí xe / gỗ / tàu là hàm đóng của (làn, bước t): không phải lưu, tải lại ván vẫn khớp
 *   - Làn sinh tuần tự theo seed (mulberry32): cùng seed luôn ra cùng con đường
 * Toạ độ: x tính theo ô, cột c có tâm ở c + 0,5, bàn chơi là đoạn [0, COLS].
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  const COLS = 9;
  const SPS = 60; // bước mô phỏng mỗi giây
  const STEP_MS = 1000 / SPS;
  const HOP_STEPS = 9; // một bước nhảy 150 ms: cũng là trần tốc độ nhập (1 bước / 9 bước mô phỏng)
  const PAD = 4; // xe / gỗ chạy vòng ra ngoài mép PAD ô; dài nhất cũng chỉ PAD ô nên quay vòng không lộ
  const LOW = -6; // hàng thấp nhất được sinh (sau lưng điểm xuất phát, toàn cây)
  const BACK_LIMIT = 4; // lùi quá chừng này hàng so với kỷ lục là đại bàng bắt
  const CAP_ROW = 200; // độ khó tăng dần tới hàng này rồi giữ nguyên
  const WARN_STEPS = 72; // đèn báo tàu sáng 1,2 giây trước khi đầu tàu vào màn
  const TRAIN_SPEED = 20; // ô / giây
  const TRAIN_LEN = 10;
  const HALF_W = 0.3; // nửa bề ngang thân vịt khi xét va chạm xe / tàu
  const LOG_TOL = 0.06; // dung sai đứng trên mép gỗ (bù sai số cộng dồn khi trôi)
  // Đảm bảo qua được: chờ một khúc gỗ đi tới cột bất kỳ không quá chừng này (giây)
  const MAX_RIVER_WAIT = 2.5;

  /* ---------------- Số ngẫu nhiên có seed ---------------- */
  function rng(seed) {
    let s = seed >>> 0;
    const r = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let x = s;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (n) => Math.floor(r() * n);
    r.range = (a, b) => a + r() * (b - a);
    return r;
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const round2 = (v) => Math.round(v * 20) / 20; // làm tròn 0,05 cho số đẹp, vẫn tất định

  /** Độ khó 0..1 theo hàng: tăng tuyến tính tới CAP_ROW rồi giữ nguyên. */
  function difficulty(row) {
    return clamp((row - 4) / CAP_ROW, 0, 1);
  }

  /** Thông số theo độ khó (tách riêng để test kiểm tra trần). */
  function params(d) {
    return {
      // tỉ lệ chọn nhóm làn
      wGrass: 0.34 - 0.12 * d,
      wRoad: 0.36 + 0.06 * d,
      wRiver: 0.2 + 0.04 * d,
      wRail: 0.1 + 0.02 * d,
      roadRun: 2 + Math.round(2 * d), // số làn đường liền nhau tối đa
      riverRun: 2 + Math.round(d), // số làn sông liền nhau tối đa
      tree: 0.12 + 0.18 * d, // xác suất một ô cỏ có cây
      roadSpeed: [1.2 + 1.0 * d, 2.2 + 1.4 * d], // ô / giây
      roadGap: [3.5 - 1.0 * d, 7.5 - 3.0 * d], // khoảng trống giữa hai xe (ô)
      riverSpeed: [0.9 + 0.5 * d, 1.4 + 0.8 * d],
      logLen: [3 - Math.round(d), 4 - Math.round(d)],
      logGap: [1, 2 + Math.floor(d * 1.999)],
      trainPeriod: [Math.round(480 - 180 * d), Math.round(600 - 240 * d)], // bước giữa hai chuyến tàu
      edgeSpeed: 0.4 + 0.25 * d, // hàng / giây: tốc độ "màn hình đuổi theo"
    };
  }

  /* ---------------- Sinh làn ---------------- */
  // Bộ sinh dùng chung cho mọi bản sao của một ván (làn sinh ra rồi không đổi nữa)
  function makeGen(seed) {
    return { r: rng(seed ^ 0x51ed270b), rows: [], groupType: null, groupLeft: 0, lastGroup: null };
  }

  const allTrue = () => new Array(COLS).fill(true);

  function genGrass(gen, row, prev) {
    const r = gen.r;
    const lane = { row, type: 'grass', trees: new Array(COLS).fill(false), deco: r.int(1 << 20) };
    if (row < 0) {
      lane.trees.fill(true); // sau lưng điểm xuất phát là rừng cây
      lane.reach = new Array(COLS).fill(false);
      return lane;
    }
    if (row >= 2) {
      const p = params(difficulty(row)).tree;
      for (let c = 0; c < COLS; c++) lane.trees[c] = r() < p;
    } else if (row === 1) {
      lane.trees[0] = lane.trees[COLS - 1] = true; // vài cây trang trí ở mép
    }
    // Vào được từ làn trước ở những cột nào: làn cỏ thì theo vùng đi được của nó, làn khác thì cột nào cũng được
    const fromGrass = !!prev && prev.type === 'grass' && prev.row >= 0;
    const entry = fromGrass ? prev.reach : allTrue();
    // Cỏ nối cỏ: mỗi đoạn trống đi được của làn trước phải có ít nhất một lối lên làn này (không để ngõ cụt)
    if (fromGrass) {
      for (let c = 0; c < COLS; ) {
        if (!entry[c]) {
          c++;
          continue;
        }
        let e = c;
        while (e + 1 < COLS && entry[e + 1]) e++;
        let open = false;
        for (let k = c; k <= e; k++) if (!lane.trees[k]) open = true;
        if (!open) lane.trees[c + r.int(e - c + 1)] = false;
        c = e + 1;
      }
    }
    const reach = () => {
      const out = new Array(COLS).fill(false);
      for (let c = 0; c < COLS; c++) out[c] = entry[c] && !lane.trees[c];
      // loang ngang trong làn qua các ô trống
      for (let c = 1; c < COLS; c++) if (out[c - 1] && !lane.trees[c]) out[c] = true;
      for (let c = COLS - 2; c >= 0; c--) if (out[c + 1] && !lane.trees[c]) out[c] = true;
      return out;
    };
    const free = () => lane.trees.filter((v) => !v).length;
    let rch = reach();
    // Không bao giờ chắn kín: chặt cây ở một cột vào được cho tới khi có lối, và giữ ít nhất 3 ô trống
    while (!rch.some(Boolean) || free() < 3) {
      let pool = [];
      for (let c = 0; c < COLS; c++) if (lane.trees[c] && entry[c]) pool.push(c);
      if (!pool.length) for (let c = 0; c < COLS; c++) if (lane.trees[c]) pool.push(c);
      lane.trees[pool[r.int(pool.length)]] = false;
      rch = reach();
    }
    lane.reach = rch;
    return lane;
  }

  /** Xếp vật thể nối đuôi nhau thành một vòng dài loop ô (loop ≥ COLS + PAD để quay vòng không lộ). */
  function fillLoop(r, pick) {
    const objs = [];
    let total = 0;
    while (total < COLS + PAD + 3 || objs.length < 2) {
      const o = pick();
      objs.push({ x0: total, len: o.len, gap: o.gap, kind: o.kind });
      total += o.len + o.gap;
    }
    const shift = r() * total;
    objs.forEach((o) => {
      o.x0 += shift;
      o.color = r.int(6);
    });
    return { objs, loop: total };
  }

  function genRoad(gen, row) {
    const r = gen.r;
    const p = params(difficulty(row));
    const dir = r() < 0.5 ? -1 : 1;
    const speed = round2(r.range(p.roadSpeed[0], p.roadSpeed[1]));
    // Làn xe máy (nhỏ, nhanh hơn) hoặc làn ô tô / xe tải
    const moto = r() < 0.3;
    const { objs, loop } = fillLoop(r, () => {
      const gap = round2(r.range(p.roadGap[0], p.roadGap[1]));
      if (moto) return { len: 0.8, gap, kind: 'moto' };
      const truck = r() < 0.25;
      return { len: truck ? 2.6 : 1.5, gap, kind: truck ? 'truck' : 'car' };
    });
    return { row, type: 'road', speed: dir * (moto ? round2(speed * 1.25) : speed), objs, loop };
  }

  function genRiver(gen, row, prev) {
    const r = gen.r;
    const p = params(difficulty(row));
    // Hai làn sông liền nhau luôn trôi ngược chiều: gỗ hai làn luôn trượt qua nhau nên luôn có lúc nhảy sang được
    const dir = prev && prev.type === 'river' ? -Math.sign(prev.speed) : r() < 0.5 ? -1 : 1;
    // Khe dài nhất / tốc độ chậm nhất ≤ MAX_RIVER_WAIT: mọi cột đều có gỗ trôi tới trong thời gian chờ giới hạn
    const speed = Math.max(round2(r.range(p.riverSpeed[0], p.riverSpeed[1])), Math.ceil((p.logGap[1] / (MAX_RIVER_WAIT - 0.1)) * 20) / 20);
    const boat = r() < 0.25;
    const { objs, loop } = fillLoop(r, () => ({
      len: boat ? 2 : p.logLen[0] + r.int(p.logLen[1] - p.logLen[0] + 1),
      gap: p.logGap[0] + r.int(p.logGap[1] - p.logGap[0] + 1),
      kind: boat ? 'boat' : 'log',
    }));
    return { row, type: 'river', speed: dir * speed, objs, loop };
  }

  function genRail(gen, row) {
    const r = gen.r;
    const p = params(difficulty(row));
    const period = p.trainPeriod[0] + r.int(p.trainPeriod[1] - p.trainPeriod[0] + 1);
    const dir = r() < 0.5 ? -1 : 1;
    const pass = Math.ceil(((COLS + TRAIN_LEN) / TRAIN_SPEED) * SPS); // số bước tàu chạy qua hết màn
    return { row, type: 'rail', period, offset: r.int(period), pass, dir };
  }

  function pickGroup(gen, row) {
    const r = gen.r;
    const p = params(difficulty(row));
    // Hai nhóm liền nhau luôn khác loại (đường rồi tới sông, cỏ…)
    const w = [['grass', p.wGrass], ['road', p.wRoad], ['river', p.wRiver], ['rail', p.wRail]].filter(([k]) => k !== gen.lastGroup);
    const sum = w.reduce((a, b) => a + b[1], 0);
    let x = r() * sum;
    let type = w[w.length - 1][0];
    for (const [k, v] of w) {
      if (x < v) {
        type = k;
        break;
      }
      x -= v;
    }
    const max = type === 'road' ? p.roadRun : type === 'river' ? p.riverRun : 2;
    gen.groupType = type;
    gen.groupLeft = 1 + r.int(max);
    gen.lastGroup = type;
  }

  function genNext(gen) {
    const row = LOW + gen.rows.length;
    const prev = gen.rows[gen.rows.length - 1] || null;
    let lane;
    if (row < 3) lane = genGrass(gen, row, prev);
    else {
      if (gen.groupLeft <= 0) pickGroup(gen, row);
      gen.groupLeft--;
      const t = gen.groupType;
      if (t === 'road') lane = genRoad(gen, row);
      else if (t === 'river') lane = genRiver(gen, row, prev);
      else if (t === 'rail') lane = genRail(gen, row);
      else lane = genGrass(gen, row, prev);
    }
    if (!lane.reach) lane.reach = allTrue();
    gen.rows.push(lane);
    return lane;
  }

  /** Làn ở hàng row (sinh thêm nếu chưa có). Hàng dưới LOW coi như rừng cây. */
  function laneAt(g, row) {
    const gen = g.gen;
    if (row < LOW) return gen.rows[0] || genNext(gen);
    while (LOW + gen.rows.length <= row) genNext(gen);
    return gen.rows[row - LOW];
  }

  /* ---------------- Vị trí vật thể theo thời gian ---------------- */
  /** Mép trái của vật thể ở bước t, nằm trong [-PAD, loop - PAD). */
  function objX(lane, o, t) {
    const v = o.x0 + (lane.speed * t) / SPS + PAD;
    return (((v % lane.loop) + lane.loop) % lane.loop) - PAD;
  }

  /** Danh sách { x, len, kind, color } của làn đường / sông ở bước t. */
  function objects(lane, t) {
    if (!lane.objs) return [];
    return lane.objs.map((o) => ({ x: objX(lane, o, t), len: o.len, kind: o.kind, color: o.color }));
  }

  /** Đường ray ở bước t: { warn, x0, x1 } (x0..x1 là thân tàu, null khi chưa có tàu). */
  function train(lane, t) {
    const phase = (((t + lane.offset) % lane.period) + lane.period) % lane.period;
    const arrive = lane.period - lane.pass;
    const warn = phase >= arrive - WARN_STEPS;
    if (phase < arrive) return { warn, x0: null, x1: null, phase, arrive };
    const s = ((phase - arrive) / SPS) * TRAIN_SPEED;
    if (lane.dir > 0) return { warn, x0: s - TRAIN_LEN, x1: s, phase, arrive };
    return { warn, x0: COLS - s, x1: COLS - s + TRAIN_LEN, phase, arrive };
  }

  /** Khúc gỗ / thuyền dưới chân ở vị trí x (null = rơi xuống nước). */
  function floatAt(lane, x, t) {
    for (const o of lane.objs) {
      const ox = objX(lane, o, t);
      if (x >= ox - LOG_TOL && x <= ox + o.len + LOG_TOL) return o;
    }
    return null;
  }

  /** Có xe / tàu chạm thân vịt (tâm x) ở làn này, bước t không. */
  function hitAt(lane, x, t) {
    if (lane.type === 'road') {
      for (const o of lane.objs) {
        const ox = objX(lane, o, t);
        if (x + HALF_W > ox + 0.08 && x - HALF_W < ox + o.len - 0.08) return true;
      }
      return false;
    }
    if (lane.type === 'rail') {
      const tr = train(lane, t);
      return tr.x0 != null && x + HALF_W > tr.x0 && x - HALF_W < tr.x1;
    }
    return false;
  }

  /* ---------------- Ván ---------------- */
  function newGame(seed) {
    const s = (Number.isInteger(seed) ? seed : Math.floor(Math.random() * 2147483647)) >>> 0;
    return {
      seed: s,
      t: 0,
      x: Math.floor(COLS / 2) + 0.5,
      y: 0,
      hop: null,
      queue: null,
      best: 0,
      edge: -BACK_LIMIT - 0.5,
      over: false,
      cause: null,
      events: [],
      gen: makeGen(s),
    };
  }

  const DIRS = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };

  /** Hàng đang tính va chạm: từ giữa cú nhảy là đã sang hàng đích. */
  function curRow(g) {
    return g.hop && g.hop.k * 2 >= HOP_STEPS ? g.hop.y1 : g.y;
  }
  function curX(g) {
    if (!g.hop) return g.x;
    return g.hop.x0 + ((g.hop.x1 - g.hop.x0) * g.hop.k) / HOP_STEPS;
  }

  function die(g, cause) {
    g.over = true;
    g.cause = cause;
    g.hop = null;
    g.queue = null;
    g.events.push({ type: 'die', cause });
    return g;
  }

  function bump(g, dir) {
    g.events.push({ type: 'bump', dir });
    return false;
  }

  /** Bắt đầu nhảy nếu được; trả false khi bị cây / mép bàn chắn (không tốn lượt). */
  function tryHop(g, dir) {
    const d = DIRS[dir];
    const ty = g.y + d[1];
    const lane = laneAt(g, ty);
    let tx;
    if (lane.type === 'river') {
      // nhảy lên / trên mặt sông giữ nguyên toạ độ liên tục (gỗ không thẳng hàng với lưới)
      tx = g.x + d[0];
      if (tx < 0 || tx > COLS) return bump(g, dir);
    } else {
      // lên bờ / đường: rơi đúng vào ô đang đứng (hoặc ô bên cạnh)
      const col = Math.floor(g.x + d[0]);
      if (col < 0 || col >= COLS) return bump(g, dir);
      if (lane.type === 'grass' && (ty < 0 || lane.trees[col])) return bump(g, dir);
      tx = col + 0.5;
    }
    g.hop = { x0: g.x, y0: g.y, x1: tx, y1: ty, k: 0, dir };
    g.events.push({ type: 'hop', dir });
    return true;
  }

  /** Nhận một lệnh nhảy. Đang nhảy thì giữ lại một lệnh, nhảy tiếp ngay khi chạm đất. */
  function input(g, dir) {
    if (g.over || !DIRS[dir]) return false;
    if (g.hop) {
      g.queue = dir;
      return true;
    }
    return tryHop(g, dir);
  }

  /** Tiến một bước mô phỏng (1/60 giây). Đổi trực tiếp g, trả g. */
  function step(g) {
    if (g.over) return g;
    g.t++;
    if (g.hop) {
      g.hop.k++;
      if (g.hop.k >= HOP_STEPS) {
        // chạm đất
        g.x = g.hop.x1;
        g.y = g.hop.y1;
        g.hop = null;
        g.events.push({ type: 'land' });
        if (g.y > g.best) {
          g.best = g.y;
          g.events.push({ type: 'score', score: g.best });
        }
        const lane = laneAt(g, g.y);
        if (lane.type === 'river' && !floatAt(lane, g.x, g.t)) return die(g, 'water');
        if (g.queue) {
          const q = g.queue;
          g.queue = null;
          tryHop(g, q);
        }
      }
    } else {
      const lane = laneAt(g, g.y);
      if (lane.type === 'river') {
        // đứng trên gỗ: trôi theo; bị gỗ đưa ra khỏi mép bàn là mất lượt
        if (!floatAt(lane, g.x, g.t - 1)) return die(g, 'water');
        g.x += lane.speed / SPS;
        if (g.x < 0 || g.x > COLS) return die(g, 'off');
      }
    }
    // xe / tàu
    const row = curRow(g);
    const lane = laneAt(g, row);
    if (hitAt(lane, curX(g), g.t)) return die(g, lane.type === 'rail' ? 'train' : 'car');
    // màn hình đuổi theo: đứng yên quá lâu hoặc lùi quá xa là đại bàng bắt
    g.edge = Math.max(g.edge + params(difficulty(g.best)).edgeSpeed / SPS, g.best - BACK_LIMIT - 0.5);
    if (Math.min(row, g.y) < g.edge) die(g, 'eagle');
    return g;
  }

  /** Lấy và xoá danh sách sự kiện (app đọc để phát âm thanh / hiệu ứng). */
  function drain(g) {
    const ev = g.events;
    g.events = [];
    return ev;
  }

  /** Vị trí vẽ vịt: x, y (hàng, lẻ khi đang nhảy), z (độ cao 0..1), k (tiến độ nhảy). */
  function pose(g) {
    if (!g.hop) return { x: g.x, y: g.y, z: 0, k: 1, dir: null };
    const k = g.hop.k / HOP_STEPS;
    return {
      x: g.hop.x0 + (g.hop.x1 - g.hop.x0) * k,
      y: g.hop.y0 + (g.hop.y1 - g.hop.y0) * k,
      z: Math.sin(Math.PI * k),
      k,
      dir: g.hop.dir,
    };
  }

  const score = (g) => g.best;

  /** Bản sao rẻ (dùng chung bộ sinh làn) cho bot / mô phỏng thử. */
  function clone(g) {
    return {
      seed: g.seed, t: g.t, x: g.x, y: g.y,
      hop: g.hop ? Object.assign({}, g.hop) : null,
      queue: g.queue, best: g.best, edge: g.edge, over: g.over, cause: g.cause,
      events: [], gen: g.gen,
    };
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  function toJSON(g) {
    return {
      v: VERSION, seed: g.seed, t: g.t, x: g.x, y: g.y,
      hop: g.hop ? Object.assign({}, g.hop) : null,
      queue: g.queue, best: g.best, edge: g.edge, over: g.over, cause: g.cause,
    };
  }

  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const int = (v) => Number.isInteger(v);
  const CAUSES = ['car', 'train', 'water', 'off', 'eagle'];

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { seed, t, x, y, hop, queue, best, edge, over } = raw;
    const cause = raw.cause == null ? null : raw.cause;
    if (!int(seed) || seed < 0 || seed > 0xffffffff) return null;
    if (!int(t) || t < 0 || !num(x) || x < 0 || x > COLS || !int(y) || y < 0) return null;
    if (!int(best) || best < y || y < best - BACK_LIMIT || !num(edge) || edge > best) return null;
    if (typeof over !== 'boolean' || (cause !== null && CAUSES.indexOf(cause) < 0) || over !== (cause !== null)) return null;
    if (queue != null && !DIRS[queue]) return null;
    let h = null;
    if (hop != null) {
      if (typeof hop !== 'object' || over) return null;
      const ok = num(hop.x0) && num(hop.x1) && int(hop.y0) && int(hop.y1) && int(hop.k) && hop.k >= 0 && hop.k < HOP_STEPS &&
        !!DIRS[hop.dir] && hop.y0 === y && hop.x0 === x && Math.abs(hop.y1 - hop.y0) <= 1 && Math.abs(hop.x1 - hop.x0) <= 1 &&
        hop.x1 >= 0 && hop.x1 <= COLS && hop.y1 >= 0;
      if (!ok) return null;
      h = { x0: hop.x0, y0: hop.y0, x1: hop.x1, y1: hop.y1, k: hop.k, dir: hop.dir };
    }
    return {
      seed, t, x, y, hop: h, queue: queue || null, best, edge, over, cause,
      events: [], gen: makeGen(seed),
    };
  }

  const api = {
    VERSION, COLS, SPS, STEP_MS, HOP_STEPS, PAD, LOW, BACK_LIMIT, CAP_ROW, WARN_STEPS, TRAIN_SPEED, TRAIN_LEN, HALF_W, MAX_RIVER_WAIT,
    rng, difficulty, params, newGame, laneAt, objects, train, floatAt, hitAt, input, step, drain, pose, score, clone, curRow,
    toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
