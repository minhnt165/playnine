/* =====================================================================
 * Chạy Vô Tận - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Thế giới nhìn ngang, một làn: cao WORLD_H đơn vị, mặt đất ở GROUND_Y (y tăng xuống dưới).
 *     Nhân vật đứng ở x = quãng đã chạy, chân ở y; tốc độ cuộn tăng theo quãng đường (speedAt) rồi dừng ở trần
 *   - Mô phỏng theo bước cố định DT = 1/120 s: cùng seed + cùng chuỗi input mỗi bước ({ jump, down } đang giữ)
 *     thì ra cùng kết quả, máy nhanh / chậm như nhau (app chỉ đổi thời gian thật thành số bước bằng ticksFor)
 *   - Nhảy: giữ lâu nhảy cao hơn (trọng lực nhẹ khi còn giữ và đang lên), coyote time (vừa rời mép vẫn nhảy được)
 *     và đệm nhảy (bấm sớm một chút trước khi chạm đất thì nhảy ngay lúc chạm). Nhặt lông vũ được nhảy đôi một lúc.
 *     Giữ xuống: trượt (thấp người chui dưới vật bay); trên không thì rơi nhanh
 *   - Đường chạy ghép từ các "khúc" (chunk) thiết kế sẵn: PRNG mulberry32 theo seed chọn khúc theo độ khó (tăng
 *     theo quãng đường), kích thước ngang tính theo tốc độ lúc đó nên luôn vượt được (test bằng bot hoàn hảo).
 *     Khúc sinh tuần tự, lười, cache theo seed: trạng thái ván chỉ cần seed + vị trí nhân vật
 *   - Va chạm: hộp nhân vật và hộp chướng ngại đều nhỏ hơn hình vẽ một chút (công bằng)
 *   - Điểm = số mét (UNITS_PER_M đơn vị = 1 m) + COIN_PTS × số xu
 *   - Hàm thuần: nhận trạng thái cũ, trả trạng thái mới; toJSON / fromJSON để lưu ván
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu hoặc đổi luật sinh đường (ván lưu cũ sẽ bị bỏ)

  /* ---------------- Hằng số (đơn vị thế giới, giây; bước = tick) ---------------- */
  const HZ = 120;
  const DT = 1 / HZ;
  const TICK_MS = 1000 / HZ;
  const MAX_FRAME_MS = 100; // khung hình dài hơn (tab vừa quay lại, máy khựng) chỉ tính bằng chừng này
  const WORLD_H = 360;
  const GROUND_Y = 300; // mặt đất thường
  const UNITS_PER_M = 25;
  const COIN_PTS = 5;
  // Tốc độ: V0 lúc đầu, tăng tuyến tính theo quãng đường tới VMAX ở RAMP_X (≈ 95 giây chạy)
  const V0 = 330;
  const VMAX = 660;
  const RAMP_X = 45000;
  const DIFF_X = 60000; // độ khó (0 → 1) tăng tuyến tính tới quãng này (2400 m)
  // Nhảy
  const JUMP_V = 760;
  const DJ_V = 640; // nhảy lần hai (khi có lông vũ)
  const G_HOLD = 1900; // trọng lực khi còn giữ phím và đang lên
  const G_FALL = 3800; // trọng lực thường
  const G_DROP = 9000; // giữ xuống khi đang ở trên không: rơi nhanh
  const MAX_FALL = 1200;
  const MAX_HOLD = 48; // giữ tối đa 0,4 s thì hết tác dụng
  const COYOTE = 12; // 0,1 s sau khi rời mép vẫn nhảy được
  const BUFFER = 14; // bấm nhảy trước khi chạm đất tối đa ≈ 0,117 s vẫn được tính
  const DJ_TICKS = 15 * HZ; // lông vũ cho nhảy đôi trong 15 giây
  // Hộp va chạm nhân vật (hình vẽ to hơn một chút)
  const HW = 11;
  const H_STAND = 40;
  const HW_SLIDE = 13;
  const H_SLIDE = 20;
  const SNAP = 8; // bậc thấp hơn chừng này thì tự bước lên / tiếp đất được
  const PIT_KILL = 40; // chân rơi sâu dưới mặt đất chừng này là rơi xuống hố (lâu hơn coyote time)
  // Chướng ngại (hộp va chạm; app vẽ to hơn)
  const STEP_LOW = 36;
  const STEP_HIGH = 70;
  const POST_HW = 9;
  const POST_H = 42;
  const FLY_HW = 15;
  const FLY_TOP = 60; // vật bay chiếm [mặt - 60, mặt - 32]: đứng thì chạm đầu, trượt thì lọt
  const FLY_BOTTOM = 32;
  const COIN_R = 12; // nhặt xu dễ hơn hình vẽ (bán kính vẽ 10)
  const ITEM_R = 14;
  // Cỡ hình vẽ (app dùng): mọi hộp va chạm ở trên đều nhỏ hơn hình tương ứng
  const SPRITE = { runW: 30, runH: 48, slideW: 36, slideH: 24, postW: 26, postH: 48, flyW: 46, flyH: 34, flyY: 46 };
  const MAX_ITEMS = 32; // số xu tối đa một khúc (id = khúc × 64 + thứ tự; lông vũ = khúc × 64 + 63)
  const GEN_AHEAD = 2400; // luôn sinh sẵn đường tới trước nhân vật chừng này
  const START_X0 = -600; // khúc đầu bắt đầu sau lưng nhân vật (để vẽ)
  const START_LEN = 1200; // khúc đầu: đường bằng dài ≈ 1,8 s trước mặt
  const CAUSES = ['post', 'flyer', 'wall', 'pit'];
  const MAX_TICK = HZ * 3600 * 3; // ván lưu chạy quá 3 giờ coi như hỏng

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const r1 = (v) => Math.round(v * 10) / 10;

  /** Tốc độ cuộn ở quãng x. */
  const speedAt = (x) => (x <= 0 ? V0 : x >= RAMP_X ? VMAX : V0 + ((VMAX - V0) * x) / RAMP_X);
  /** Độ khó 0..1 ở quãng x. */
  const difficultyAt = (x) => clamp(x / DIFF_X, 0, 1);
  /** Một bước tiến ngang (dùng chung cho step / xAtTick nên khớp từng bit). */
  const advance = (x) => x + speedAt(x) * DT;
  /** Quãng sau n bước chạy (tính lại đúng như step). */
  function xAtTick(n) {
    let x = 0;
    for (let i = 0; i < n; i++) x = advance(x);
    return x;
  }

  /* ---------------- PRNG mulberry32 ---------------- */
  function rand(s) {
    const state = (s + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return { state, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  }
  /** Bọc PRNG thành hàm r() → [0, 1), giữ trạng thái trong obj.rng. */
  const roller = (obj) => () => {
    const r = rand(obj.rng);
    obj.rng = r.state;
    return r.value;
  };

  /* ---------------- Khúc đường thiết kế sẵn ----------------
   * Mỗi khúc: đoạn đường bằng "nghỉ" (lead, ngắn dần theo độ khó) + mẫu chướng ngại + đuôi bằng.
   * Kích thước ngang tính bằng giây × tốc độ lúc bắt đầu khúc (T), nên khúc vượt được ở mọi tốc độ.
   * Độ cao tuyệt đối: nhảy chạm nhẹ cao ≈ 76, giữ hết cao ≈ 152; bậc thấp 36, bậc cao 70, cột 42.
   */
  function builder(v) {
    const b = { v, solid: [], steps: [], hz: [], coins: [] };
    b.T = (s) => s * v;
    b.post = (x, base) => b.hz.push({ k: 'post', x, base: base == null ? GROUND_Y : base });
    b.flyer = (x, base) => b.hz.push({ k: 'flyer', x, base: base == null ? GROUND_Y : base });
    b.step = (x0, x1, h) => b.steps.push({ x0, x1, top: GROUND_Y - h });
    b.pit = (x0, w) => b.solid.push([x0, x0 + w]); // đoạn khoét khỏi mặt đất
    b.coin = (x, y) => { if (b.coins.length < MAX_ITEMS) b.coins.push({ x, y: r1(y) }); };
    /** Hàng xu nằm ngang từ x0, n xu cách nhau gap, tâm cao y. */
    b.line = (x0, n, gap, y) => { for (let i = 0; i < n; i++) b.coin(x0 + i * gap, y); };
    /** Vòng cung xu quanh xc, rộng w, cao thêm h so với tầm thân người đứng trên mặt base. */
    b.arc = (xc, w, h, n, base) => {
      const y0 = (base == null ? GROUND_Y : base) - 22;
      for (let i = 0; i < n; i++) {
        const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
        b.coin(xc + (u * w) / 2, y0 - h * (1 - u * u));
      }
    };
    return b;
  }
  const pitW = (v, kind) => (kind === 'wide' ? 0.5 * v + 30 : 0.28 * v + 30);

  /* Mỗi mẫu: (b, rnd, d) → độ dài mẫu (không gồm lead). Tọa độ tính từ đầu mẫu. */
  const PATTERNS = {
    run(b) {
      b.line(b.T(0.1), 6, b.T(0.1), GROUND_Y - 22);
      return b.T(0.75);
    },
    post(b) {
      const x = b.T(0.15);
      b.post(x);
      b.arc(x, b.T(0.36), 52, 5);
      return x + b.T(0.4);
    },
    pit(b) {
      const a = b.T(0.12);
      const w = pitW(b.v);
      b.pit(a, w);
      b.arc(a + w / 2, w + b.T(0.12), 50, 5);
      return a + w + b.T(0.35);
    },
    flyer(b) {
      const x = b.T(0.25);
      b.flyer(x);
      b.line(x - b.T(0.15), 4, b.T(0.1), GROUND_Y - 11);
      return x + b.T(0.4);
    },
    stepLow(b, rnd, d) {
      const s = b.T(0.15);
      const len = b.T(1.05);
      b.step(s, s + len, STEP_LOW);
      if (d >= 0.3 && rnd() < 0.5) {
        b.post(s + len * 0.55, GROUND_Y - STEP_LOW);
        b.arc(s + len * 0.55, b.T(0.36), 52, 5, GROUND_Y - STEP_LOW);
      } else {
        b.line(s + b.T(0.25), 5, b.T(0.13), GROUND_Y - STEP_LOW - 22);
      }
      return s + len + b.T(0.35);
    },
    post2(b) {
      const x1 = b.T(0.15);
      const x2 = x1 + b.T(0.62);
      b.post(x1);
      b.post(x2);
      b.arc(x1, b.T(0.32), 48, 4);
      b.arc(x2, b.T(0.32), 48, 4);
      return x2 + b.T(0.4);
    },
    pitWide(b) {
      const a = b.T(0.12);
      const w = pitW(b.v, 'wide');
      b.pit(a, w);
      b.arc(a + w / 2, w, 95, 6);
      return a + w + b.T(0.35);
    },
    stepHigh(b) {
      const s = b.T(0.18);
      const len = b.T(1.0);
      b.step(s, s + len, STEP_HIGH);
      b.line(s + b.T(0.3), 5, b.T(0.12), GROUND_Y - STEP_HIGH - 22);
      return s + len + b.T(0.4);
    },
    flyerPost(b) {
      const f = b.T(0.2);
      const p = f + b.T(0.72);
      b.flyer(f);
      b.line(f - b.T(0.1), 3, b.T(0.1), GROUND_Y - 11);
      b.post(p);
      b.arc(p, b.T(0.32), 50, 4);
      return p + b.T(0.4);
    },
    postFlyer(b) {
      const p = b.T(0.15);
      const f = p + b.T(0.78);
      b.post(p);
      b.arc(p, b.T(0.32), 50, 4);
      b.flyer(f);
      b.line(f - b.T(0.1), 3, b.T(0.1), GROUND_Y - 11);
      return f + b.T(0.4);
    },
    pitPit(b) {
      const a = b.T(0.12);
      const w = pitW(b.v);
      const c = a + w + b.T(0.5);
      b.pit(a, w);
      b.pit(c, w);
      b.arc(a + w / 2, w + b.T(0.1), 48, 4);
      b.arc(c + w / 2, w + b.T(0.1), 48, 4);
      return c + w + b.T(0.35);
    },
    stairs(b) {
      const s = b.T(0.15);
      const m = s + b.T(0.6);
      const e = m + b.T(0.75);
      const w = 0.3 * b.v + 40;
      b.step(s, m, STEP_LOW);
      b.step(m, e, STEP_HIGH);
      b.pit(e, w);
      b.line(m + b.T(0.2), 4, b.T(0.12), GROUND_Y - STEP_HIGH - 22);
      return e + w + b.T(0.4);
    },
    flyer2(b) {
      const f = b.T(0.2);
      b.flyer(f);
      b.flyer(f + b.T(0.3));
      b.line(f - b.T(0.1), 6, b.T(0.1), GROUND_Y - 11);
      return f + b.T(0.7);
    },
    stepPost(b) {
      const s = b.T(0.15);
      const len = b.T(1.3);
      b.step(s, s + len, STEP_LOW);
      b.post(s + len * 0.5, GROUND_Y - STEP_LOW);
      b.arc(s + len * 0.5, b.T(0.34), 50, 4, GROUND_Y - STEP_LOW);
      const f = s + len + b.T(0.5);
      b.flyer(f);
      return f + b.T(0.4);
    },
    pitFlyer(b) {
      const a = b.T(0.12);
      const w = pitW(b.v);
      b.pit(a, w);
      b.arc(a + w / 2, w + b.T(0.1), 50, 4);
      const f = a + w + b.T(0.6);
      b.flyer(f);
      b.line(f - b.T(0.1), 3, b.T(0.1), GROUND_Y - 11);
      return f + b.T(0.4);
    },
    gauntlet(b) {
      const p = b.T(0.15);
      const a = p + b.T(0.6);
      const w = pitW(b.v);
      const f = a + w + b.T(0.6);
      b.post(p);
      b.pit(a, w);
      b.flyer(f);
      b.arc(p, b.T(0.3), 48, 3);
      b.arc(a + w / 2, w, 48, 3);
      return f + b.T(0.4);
    },
  };
  /** [tên, độ khó tối thiểu, trọng số] */
  const CATALOG = [
    ['run', 0, 1],
    ['post', 0, 3],
    ['pit', 0, 3],
    ['flyer', 0.04, 2],
    ['stepLow', 0, 2],
    ['post2', 0.12, 2],
    ['pitWide', 0.15, 2],
    ['stepHigh', 0.2, 2],
    ['flyerPost', 0.3, 2],
    ['postFlyer', 0.35, 2],
    ['pitPit', 0.4, 2],
    ['stairs', 0.45, 2],
    ['flyer2', 0.5, 2],
    ['stepPost', 0.55, 2],
    ['pitFlyer', 0.65, 2],
    ['gauntlet', 0.8, 2],
  ];
  const TYPES = CATALOG.map((c) => c[0]);
  /** Đoạn nghỉ đầu khúc (giây): 1,0 s lúc đầu, 0,5 s ở độ khó tối đa. */
  const leadFor = (d) => 1.0 - 0.5 * d;

  /** Dựng khúc thứ i loại `type` bắt đầu ở x0 (đơn vị tuyệt đối). feather: có lông vũ ở đoạn nghỉ. */
  function buildChunk(i, type, x0, rnd, feather) {
    const v = speedAt(x0);
    const d = difficultyAt(x0);
    const b = builder(v);
    const lead = b.T(leadFor(d));
    const len = lead + PATTERNS[type](b, rnd, d);
    const X = (x) => r1(x0 + lead + x);
    const x1 = r1(x0 + len);
    // Mặt đất của khúc trừ các hố
    const blocks = [];
    let from = x0;
    b.solid.slice().sort((p, q) => p[0] - q[0]).forEach(([a, c]) => {
      if (X(a) > from) blocks.push({ x0: from, x1: X(a), top: GROUND_Y });
      from = X(c);
    });
    blocks.push({ x0: from, x1, top: GROUND_Y });
    b.steps.forEach((s) => blocks.push({ x0: X(s.x0), x1: X(s.x1), top: s.top }));
    const hz = b.hz.map((h) => {
      const x = X(h.x);
      return h.k === 'post'
        ? { k: 'post', x, base: h.base, x0: x - POST_HW, x1: x + POST_HW, y0: h.base - POST_H, y1: h.base }
        : { k: 'flyer', x, base: h.base, x0: x - FLY_HW, x1: x + FLY_HW, y0: h.base - FLY_TOP, y1: h.base - FLY_BOTTOM };
    });
    const coins = b.coins.map((c, k) => ({ id: i * 64 + k, x: X(c.x), y: c.y })).sort((p, q) => p.x - q.x);
    const item = feather ? { id: i * 64 + 63, x: r1(x0 + lead * 0.55), y: GROUND_Y - 78 } : null;
    return { i, type, x0, x1, v, d, blocks, hz, coins, item };
  }

  /** Khúc 0: đường bằng để khởi động, vài xu cuối khúc. */
  function startChunk() {
    const coins = [];
    for (let k = 0; k < 5; k++) coins.push({ id: k, x: 380 + k * 40, y: GROUND_Y - 22 });
    return { i: 0, type: 'start', x0: START_X0, x1: START_X0 + START_LEN, v: V0, d: 0, blocks: [{ x0: START_X0, x1: START_X0 + START_LEN, top: GROUND_Y }], hz: [], coins, item: null };
  }
  /** Khúc bằng phẳng (đường dựng tay của test). */
  const flatChunk = (i, x0, len) => ({ i, type: 'flat', x0, x1: x0 + len, v: speedAt(x0), d: difficultyAt(x0), blocks: [{ x0, x1: x0 + len, top: GROUND_Y }], hz: [], coins: [], item: null });

  /* ---------------- Đường chạy theo seed (sinh lười, cache) ---------------- */
  const cache = new Map(); // seed → level (giữ tối đa CACHE_MAX seed gần nhất)
  const CACHE_MAX = 12;
  const custom = new Map(); // khóa test → level dựng tay

  function levelOf(seed) {
    if (custom.has(seed)) return custom.get(seed);
    let L = cache.get(seed);
    if (L) {
      cache.delete(seed); // đưa lên cuối (mới dùng)
      cache.set(seed, L);
      return L;
    }
    L = { seed, rng: seed >>> 0 || 1, chunks: [startChunk()], lastType: 'start', lastFeather: 0, fixed: false };
    cache.set(seed, L);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return L;
  }

  /** Sinh thêm khúc cho tới khi đường dài quá x. */
  function ensure(L, x) {
    while (L.chunks[L.chunks.length - 1].x1 < x) {
      const last = L.chunks[L.chunks.length - 1];
      const i = last.i + 1;
      if (L.fixed) {
        // Đường dựng tay: hết khúc thì là đường bằng vô tận
        L.chunks.push(flatChunk(i, last.x1, 2000));
        continue;
      }
      const rnd = roller(L);
      const d = difficultyAt(last.x1);
      const pool = CATALOG.filter((c) => c[1] <= d);
      const pick = () => {
        let total = 0;
        pool.forEach((c) => { total += c[2]; });
        let r = rnd() * total;
        for (const c of pool) {
          r -= c[2];
          if (r < 0) return c[0];
        }
        return pool[pool.length - 1][0];
      };
      let type = pick();
      if (type === L.lastType) type = pick(); // hạn chế lặp một kiểu liên tiếp
      const feather = d >= 0.08 && i - L.lastFeather >= 10 && rnd() < 0.08;
      if (feather) L.lastFeather = i;
      L.lastType = type;
      L.chunks.push(buildChunk(i, type, last.x1, rnd, feather));
    }
  }

  /** Dựng đường bằng tay cho test: specs = [{ type, rng?, feather? }...] nối nhau sau một đoạn bằng kết thúc ở x0
   *  (bỏ trống x0: sau khúc khởi động như ván thật). Trả level, dùng newGame(key) / startAt(key, k) để chạy. */
  function makeLevel(key, specs, x0) {
    const chunks = [x0 == null ? startChunk() : flatChunk(0, x0 - 1200, 1200)];
    specs.forEach((s, k) => {
      const holder = { rng: s.rng >>> 0 || 1 };
      const last = chunks[chunks.length - 1];
      chunks.push(buildChunk(k + 1, s.type, last.x1, roller(holder), !!s.feather));
    });
    const L = { seed: key, chunks, fixed: true };
    custom.set(key, L);
    return L;
  }

  /** Chỉ số khúc chứa x (tìm nhị phân). */
  function chunkIndexAt(L, x) {
    const c = L.chunks;
    let lo = 0;
    let hi = c.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (c[mid].x0 <= x) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  /** Các khúc giao với [a, b] (để vẽ). */
  function chunksIn(seed, a, b) {
    const L = levelOf(seed);
    ensure(L, b + 10);
    const out = [];
    for (let i = chunkIndexAt(L, a); i < L.chunks.length && L.chunks[i].x0 <= b; i++) out.push(L.chunks[i]);
    return out;
  }
  /** n khúc đầu (sau khúc khởi động) của seed, cho test. */
  function generate(seed, n) {
    const L = levelOf(seed);
    while (L.chunks.length < n + 1) ensure(L, L.chunks[L.chunks.length - 1].x1 + 1);
    return L.chunks.slice(1, n + 1);
  }

  /* ---------------- Va chạm ---------------- */
  function near(L, x) {
    const i = chunkIndexAt(L, x);
    const c = L.chunks;
    return [c[i - 1], c[i], c[i + 1]];
  }
  /** Mặt cao nhất (y nhỏ nhất) dưới đoạn [a, b]; Infinity nếu là hố. */
  function surface(chs, a, b) {
    let top = Infinity;
    for (const ch of chs) {
      if (!ch) continue;
      for (const k of ch.blocks) if (k.x0 < b && k.x1 > a && k.top < top) top = k.top;
    }
    return top;
  }
  /** Hộp va chạm nhân vật [x0, y0, x1, y1]. */
  function body(g) {
    const hw = g.sliding ? HW_SLIDE : HW;
    return [g.x - hw, g.y - (g.sliding ? H_SLIDE : H_STAND), g.x + hw, g.y];
  }
  const overlap = (bx, h) => h.x0 < bx[2] && h.x1 > bx[0] && h.y0 < bx[3] && h.y1 > bx[1];
  /** Hình tròn (cx, cy, r) chạm hộp bx không. */
  function circleHits(bx, cx, cy, r) {
    const dx = cx - clamp(cx, bx[0], bx[2]);
    const dy = cy - clamp(cy, bx[1], bx[3]);
    return dx * dx + dy * dy < r * r;
  }
  /** Có vật bay đè lên tư thế đứng không (thì phải cúi tiếp). */
  function blockedAbove(chs, g) {
    const bx = [g.x - HW, g.y - H_STAND, g.x + HW, g.y];
    for (const ch of chs) if (ch) for (const h of ch.hz) if (h.k === 'flyer' && overlap(bx, h)) return true;
    return false;
  }

  /* ---------------- Ván ---------------- */
  function blank(seed, x, tick) {
    return {
      seed,
      phase: 'run',
      tick,
      x,
      y: GROUND_Y,
      vy: 0,
      grounded: true,
      sliding: false,
      coyote: 0,
      buffer: 0,
      holding: false,
      hold: 0,
      prevJump: false,
      dj: 0, // số bước còn nhảy đôi
      usedDouble: false,
      coins: 0,
      jumps: 0,
      taken: [], // id xu / lông vũ đã nhặt ở các khúc quanh nhân vật (id khúc đã lùi xa được bỏ)
      cause: null,
    };
  }

  /** Ván mới ở vạch xuất phát. seed: số nguyên 32 bit (hoặc khóa đường dựng tay của test). */
  function newGame(seed) {
    const s = typeof seed === 'number' ? seed >>> 0 || 1 : seed;
    ensure(levelOf(s), GEN_AHEAD);
    return blank(s, 0, 0);
  }

  /** Ván đứng ở đầu khúc thứ k (bước đầu tiên có x ≥ x0 của khúc; đầu khúc luôn là đường bằng). Cho test / bot. */
  function startAt(seed, k) {
    const g0 = newGame(seed);
    const L = levelOf(g0.seed);
    while (L.chunks.length <= k) ensure(L, L.chunks[L.chunks.length - 1].x1 + 1);
    const target = L.chunks[k].x0;
    let x = 0;
    let tick = 0;
    while (x < target) {
      x = advance(x);
      tick++;
    }
    ensure(L, x + GEN_AHEAD);
    return blank(g0.seed, x, tick);
  }

  const NO_INPUT = { jump: false, down: false };

  /** Một bước mô phỏng DT với input đang giữ { jump, down }. Hết ván thì không đổi gì. */
  function step(g, input) {
    if (g.phase !== 'run') return g;
    const inp = input || NO_INPUT;
    const jump = !!inp.jump;
    const down = !!inp.down;
    const L = levelOf(g.seed);
    const n = Object.assign({}, g);
    n.tick = g.tick + 1;
    const pressed = jump && !g.prevJump;
    n.prevJump = jump;
    if (n.dj > 0) n.dj--;
    if (pressed) n.buffer = BUFFER;
    else if (n.buffer > 0) n.buffer--;

    // Bắt đầu nhảy: trên mặt đất / trong coyote time (có cả đệm nhảy); trên không thì nhảy đôi nếu có lông vũ
    if (n.buffer > 0 && (n.grounded || n.coyote > 0)) {
      n.vy = -JUMP_V;
      n.grounded = false;
      n.sliding = false;
      n.coyote = 0;
      n.buffer = 0;
      n.holding = jump;
      n.hold = 0;
      n.jumps = g.jumps + 1;
    } else if (pressed && !n.grounded && n.dj > 0 && !n.usedDouble) {
      n.vy = -DJ_V;
      n.usedDouble = true;
      n.buffer = 0;
      n.holding = true;
      n.hold = 0;
      n.jumps = g.jumps + 1;
    }
    if (!jump) n.holding = false;

    // Trục đứng
    const prevY = n.y;
    if (!n.grounded) {
      if (n.holding && (n.vy >= 0 || n.hold >= MAX_HOLD)) n.holding = false;
      let gr = G_FALL;
      if (down) {
        gr = G_DROP;
        n.holding = false;
      } else if (n.holding) {
        gr = G_HOLD;
        n.hold++;
      }
      n.vy = Math.min(n.vy + gr * DT, MAX_FALL);
      n.y += n.vy * DT;
      if (n.coyote > 0) n.coyote--;
    }

    // Trục ngang
    n.x = advance(g.x);
    const chs = near(L, n.x);
    const hw = n.sliding ? HW_SLIDE : HW;
    const top = surface(chs, n.x - hw, n.x + hw);
    if (n.grounded) {
      if (top > n.y + 1e-6) {
        // Hết đất dưới chân: bắt đầu rơi, còn coyote time
        n.grounded = false;
        n.sliding = false;
        n.vy = 0;
        n.coyote = COYOTE;
      } else if (top < n.y && n.y - top <= SNAP) {
        n.y = top; // bậc rất thấp: tự bước lên
      }
    } else if (n.vy >= 0 && top !== Infinity && n.y >= top && prevY <= top + SNAP) {
      // Tiếp đất
      n.y = top;
      n.vy = 0;
      n.grounded = true;
      n.usedDouble = false;
      n.coyote = 0;
      n.holding = false;
    }

    // Trượt: chỉ trên mặt đất; buông phím mà vật bay còn đè trên đầu thì vẫn cúi
    if (n.grounded) {
      if (down) n.sliding = true;
      else if (n.sliding && !blockedAbove(chs, n)) n.sliding = false;
    }

    // Rơi xuống hố / đâm vào thành bậc / chạm chướng ngại
    if (!n.grounded && n.y > GROUND_Y + PIT_KILL) return over(n, 'pit');
    const bx = body(n);
    for (const ch of chs) {
      if (!ch) continue;
      for (const k of ch.blocks) {
        if (k.x0 < bx[2] && k.x1 > bx[0] && k.top < n.y - SNAP) return over(n, n.y > GROUND_Y ? 'pit' : 'wall');
      }
      for (const h of ch.hz) if (overlap(bx, h)) return over(n, h.k);
    }

    // Nhặt xu / lông vũ
    for (const ch of chs) {
      if (!ch) continue;
      for (const c of ch.coins) {
        if (c.x - COIN_R > bx[2]) break;
        if (circleHits(bx, c.x, c.y, COIN_R) && n.taken.indexOf(c.id) < 0) {
          n.taken = insert(n.taken, c.id);
          n.coins++;
        }
      }
      const it = ch.item;
      if (it && circleHits(bx, it.x, it.y, ITEM_R) && n.taken.indexOf(it.id) < 0) {
        n.taken = insert(n.taken, it.id);
        n.dj = DJ_TICKS;
        n.usedDouble = false;
      }
    }
    // Bỏ id của khúc đã lùi xa
    if (n.taken.length) {
      const min = (chunkIndexAt(L, n.x - 400) - 1) * 64;
      if (n.taken[0] < min) n.taken = n.taken.filter((id) => id >= min);
    }
    if ((n.tick & 31) === 0) ensure(L, n.x + GEN_AHEAD);
    return n;
  }

  /** Mảng id mới đã sắp tăng dần có thêm id. */
  function insert(arr, id) {
    const out = arr.concat(id);
    out.sort((a, b) => a - b);
    return out;
  }

  function over(n, cause) {
    n.phase = 'over';
    n.cause = cause;
    if (cause === 'pit') n.sliding = false;
    return n;
  }

  const meters = (g) => Math.max(0, Math.floor(g.x / UNITS_PER_M));
  const scoreOf = (g) => meters(g) + COIN_PTS * g.coins;

  /** Đổi thời gian thật thành số bước cố định: trả { ticks, acc } (acc: phần dư ms mang sang khung sau). */
  function ticksFor(acc, frameMs) {
    const total = acc + Math.min(Math.max(0, frameMs), MAX_FRAME_MS);
    const ticks = Math.floor(total / TICK_MS + 1e-9);
    return { ticks, acc: Math.max(0, total - ticks * TICK_MS) };
  }

  /** Mô phỏng từ g với input theo bước: inputs[i] là { jump, down } ở bước thứ i (thiếu = không bấm). */
  function run(g, inputs, maxTicks) {
    let s = g;
    const n = maxTicks == null ? inputs.length : maxTicks;
    for (let i = 0; i < n && s.phase === 'run'; i++) s = step(s, inputs[i]);
    return s;
  }

  /* ---------------- Bot tìm đường (test "luôn vượt được" + đo ngưỡng điểm) ----------------
   * Ở mặt đất, trạng thái chỉ phụ thuộc số bước và đang cúi hay không (x chỉ phụ thuộc số bước), nên tìm sâu
   * với ghi nhớ nút chết là đủ. Mỗi nút thử: chạy tiếp 1 bước, nhảy giữ h bước (rồi buông tới khi chạm đất),
   * cúi. Không dùng nhảy đôi. Trả mảng input từng bước tới khi qua goalX, hoặc null nếu không có đường.
   * opts: { holds, grid (chỉ bắt đầu nhảy / cúi ở bước chia hết cho grid), prefer: 'run' | 'coins', maxNodes,
   *         landed: chỉ tính là tới đích khi đã đứng trên mặt đất (không dừng giữa cú nhảy) }
   */
  function plan(g0, goalX, opts) {
    const o = opts || {};
    const holds = o.holds || [1, 8, 16, 24, 36, 48];
    const grid = o.grid || 1;
    const maxNodes = o.maxNodes || 400000;
    const done = (g) => g.x >= goalX && (!o.landed || g.grounded);
    const dead = new Set();
    let nodes = 0;
    const JUMP = { jump: true, down: false };
    const DOWN = { jump: false, down: true };

    /** Chạy không bấm gì cho tới khi đứng lại trên mặt đất (hoặc qua đích / chết). */
    function settle(g, inputs) {
      let s = g;
      let guard = 0;
      while (s.phase === 'run' && !s.grounded && !(s.x >= goalX && !o.landed) && guard++ < 600) {
        s = step(s, NO_INPUT);
        inputs.push(NO_INPUT);
      }
      return s.phase === 'run' ? s : null;
    }
    function trans(g, kind, h) {
      const inputs = [];
      let s = g;
      if (kind === 'jump') {
        for (let i = 0; i < h && s.phase === 'run'; i++) {
          s = step(s, JUMP);
          inputs.push(JUMP);
        }
      } else {
        const inp = kind === 'down' ? DOWN : NO_INPUT;
        s = step(s, inp);
        inputs.push(inp);
      }
      s = s.phase === 'run' ? settle(s, inputs) : null;
      return s ? { g: s, inputs, gain: s.coins - g.coins } : null;
    }
    function options(g) {
      const onGrid = g.tick % grid === 0;
      if (o.prefer === 'coins') {
        const all = [];
        const kinds = [g.sliding ? ['down'] : ['run']];
        if (g.sliding) kinds.push(['run']);
        if (onGrid) {
          holds.forEach((h) => kinds.push(['jump', h]));
          if (!g.sliding) kinds.push(['down']);
        }
        kinds.forEach((k, idx) => {
          const t = trans(g, k[0], k[1]);
          if (t) {
            t.order = idx;
            all.push(t);
          }
        });
        all.sort((a, b) => b.gain - a.gain || a.order - b.order);
        return all;
      }
      // Ưu tiên chạy tiếp (đang cúi thì cúi tiếp), rồi nhảy thấp → cao, rồi cúi
      const list = [g.sliding ? ['down'] : ['run']];
      if (g.sliding) list.push(['run']);
      if (onGrid) {
        holds.forEach((h) => list.push(['jump', h]));
        if (!g.sliding) list.push(['down']);
      }
      return list;
    }
    const key = (g) => g.tick * 2 + (g.sliding ? 1 : 0);

    // Tìm sâu bằng ngăn xếp (đường có thể dài hàng nghìn bước)
    const stack = [{ g: g0, opts: null, idx: 0, inputs: [] }];
    while (stack.length) {
      const f = stack[stack.length - 1];
      if (done(f.g)) {
        const out = [];
        stack.forEach((s) => { for (const i of s.inputs) out.push(i); });
        return out;
      }
      if (!f.opts) {
        if (++nodes > maxNodes) return null;
        f.opts = options(f.g);
      }
      if (f.idx >= f.opts.length) {
        dead.add(key(f.g));
        stack.pop();
        continue;
      }
      const op = f.opts[f.idx++];
      const t = Array.isArray(op) ? trans(f.g, op[0], op[1]) : op;
      if (!t || (!done(t.g) && dead.has(key(t.g)))) continue;
      stack.push({ g: t.g, opts: null, idx: 0, inputs: t.inputs });
    }
    return null;
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  const FIELDS = ['seed', 'phase', 'tick', 'x', 'y', 'vy', 'grounded', 'sliding', 'coyote', 'buffer', 'holding', 'hold', 'prevJump', 'dj', 'usedDouble', 'coins', 'jumps', 'taken', 'cause'];
  function toJSON(g) {
    const o = { v: VERSION };
    FIELDS.forEach((k) => { o[k] = k === 'taken' ? g.taken.slice() : g[k]; });
    return o;
  }

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const isUint = (v) => Number.isInteger(v) && v >= 0;
  const isBool = (v) => typeof v === 'boolean';

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const g = {};
    for (const k of FIELDS) {
      if (!(k in raw)) return null;
      g[k] = raw[k];
    }
    if (!isUint(g.seed) || g.seed < 1 || g.seed > 0xffffffff) return null;
    if (g.phase !== 'run' && g.phase !== 'over') return null;
    if (!isUint(g.tick) || g.tick > MAX_TICK || !isNum(g.x) || !isNum(g.y) || !isNum(g.vy)) return null;
    if (![g.grounded, g.sliding, g.holding, g.prevJump, g.usedDouble].every(isBool)) return null;
    if (![g.coyote, g.buffer, g.hold, g.dj, g.coins, g.jumps].every(isUint)) return null;
    if (g.coyote > COYOTE || g.buffer > BUFFER || g.hold > MAX_HOLD || g.dj > DJ_TICKS) return null;
    if (g.vy < -JUMP_V || g.vy > MAX_FALL || g.y < GROUND_Y - 400 || g.y > GROUND_Y + PIT_KILL + 20) return null;
    if ((g.phase === 'over') !== (g.cause !== null) || (g.cause !== null && CAUSES.indexOf(g.cause) < 0)) return null;
    if (g.sliding && !g.grounded) return null;
    // Quãng phải đúng bằng quãng sau `tick` bước (không sửa tay được)
    if (g.x !== xAtTick(g.tick)) return null;
    const L = levelOf(g.seed);
    ensure(L, g.x + GEN_AHEAD);
    // Xu: không nhiều hơn số xu có trên đoạn đã chạy; id đã nhặt phải có thật, không trùng, tăng dần
    let total = 0;
    const ids = new Set();
    for (let i = 0; i < L.chunks.length && L.chunks[i].x0 <= g.x + 50; i++) {
      const ch = L.chunks[i];
      total += ch.coins.length;
      ch.coins.forEach((c) => ids.add(c.id));
      if (ch.item) ids.add(ch.item.id);
    }
    if (g.coins > total) return null;
    if (!Array.isArray(g.taken) || g.taken.length > 200) return null;
    for (let i = 0; i < g.taken.length; i++) {
      if (!ids.has(g.taken[i]) || (i > 0 && g.taken[i] <= g.taken[i - 1])) return null;
    }
    g.taken = g.taken.slice();
    return g;
  }

  const api = {
    VERSION, HZ, DT, TICK_MS, MAX_FRAME_MS, WORLD_H, GROUND_Y, UNITS_PER_M, COIN_PTS, V0, VMAX, RAMP_X, DIFF_X,
    JUMP_V, DJ_V, G_HOLD, G_FALL, G_DROP, MAX_FALL, MAX_HOLD, COYOTE, BUFFER, DJ_TICKS, HW, H_STAND, HW_SLIDE, H_SLIDE,
    SNAP, PIT_KILL, STEP_LOW, STEP_HIGH, POST_HW, POST_H, FLY_HW, FLY_TOP, FLY_BOTTOM, COIN_R, ITEM_R, SPRITE, TYPES, CATALOG,
    speedAt, difficultyAt, leadFor, xAtTick, levelOf, makeLevel, chunksIn, generate, newGame, startAt, step, run, body,
    meters, scoreOf, ticksFor, plan, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
