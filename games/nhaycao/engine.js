/* =====================================================================
 * Nhảy Cao - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Thế giới: rộng W đơn vị (quấn ngang), trục y hướng lên, khung nhìn cao VIEW_H; camera chỉ đi lên
 *   - Mô phỏng theo bước cố định DT (1/120 s): step(state, input) với input ∈ [-1, 1] (trái / phải, nghiêng máy)
 *     step sửa trực tiếp state (vòng lặp 120 lần/giây, không sao chép) và ghi sự kiện của bước vào state.ev
 *   - Tất định theo seed + chuỗi input: cùng seed, cùng phím thì cùng kết quả (để test và để bot đo điểm)
 *   - Bệ: thường (n), di động (m), vỡ (b, không đỡ), lò xo (s); mây giông (va thì gục, dẫm từ trên thì tan)
 *   - Sinh màn luôn có đường đi: khoảng hở dọc giữa hai bệ đỡ được ≤ MAX_GAP (< độ cao nảy, đủ thời gian lái
 *     ngang tới mọi chỗ); quanh mỗi đám mây luôn có làn bệ tĩnh nằm ngoài tầm mây, không lò xo nào bắn vào mây
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  /* ---------------- Hằng số vật lý (đơn vị thế giới, giây) ---------------- */
  const W = 360; // bề rộng thế giới = bề rộng màn hình
  const VIEW_H = 600; // chiều cao khung nhìn
  const DT = 1 / 120; // bước mô phỏng cố định
  const G = 1800; // trọng lực
  const JUMP_V = 900; // vận tốc nảy thường
  const SPRING_V = 1500; // vận tốc bật lò xo
  const MAX_VX = 380; // tốc độ ngang tối đa
  const ACC = 3000; // gia tốc ngang
  const PW = 64; // bề rộng bệ
  const PLAT_H = 12; // bề dày bệ (chỉ để vẽ; va chạm xét mặt trên)
  const PHW = 14; // nửa bề rộng thân / chân người chơi (hộp va chạm)
  const PH = 40; // chiều cao người chơi
  const SPRING_W = 22; // bề rộng lò xo
  const MR = 20; // bán kính mây giông (vẽ + tính làn an toàn)
  const MR_HIT = 17; // bán kính va chạm của mây (dễ chịu hơn hình vẽ một chút)
  const MA = 60; // biên độ trôi ngang tối đa của mây
  const UNIT = 25; // 25 đơn vị = 1 m
  const CAM_FRAC = 0.45; // camera giữ đỉnh cao nhất ở 45% chiều cao màn hình tính từ đáy
  const START_Y = 40; // mặt bệ xuất phát
  const H_MAX = (JUMP_V * JUMP_V) / (2 * G); // chặn trên độ cao nảy (Euler bán ẩn cho ít hơn một chút)
  const SPRING_H_MAX = (SPRING_V * SPRING_V) / (2 * G); // chặn trên độ cao lò xo
  const MAX_GAP = 170; // khoảng hở dọc tối đa giữa hai bệ đỡ được (test chứng minh luôn tới được)
  const AHEAD = VIEW_H + 700; // sinh bệ trước phía trên đáy camera bấy nhiêu
  const PRUNE = 80; // bỏ bệ / mây đã rơi xuống dưới đáy camera bấy nhiêu
  const TAU = Math.PI * 2;

  /* ---------------- Tiện ích ---------------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  /** Đưa x về [0, W) (màn hình quấn ngang). */
  function wrap(x) {
    let r = ((x % W) + W) % W;
    if (r >= W) r = 0;
    return r;
  }
  /** Độ lệch ngang ngắn nhất có tính quấn: kết quả trong [-W/2, W/2). */
  const wrapDelta = (d) => ((((d + W / 2) % W) + W) % W) - W / 2;

  /** mulberry32: số ngẫu nhiên [0, 1), trạng thái số nguyên 32 bit nằm trong s.rng (lưu được). */
  function rand(s) {
    s.rng = (s.rng + 0x6d2b79f5) | 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const monsterX = (m) => m.cx + m.a * Math.sin(m.ph);

  /* ---------------- Vật lý thuần (dùng chung cho step và cho test chứng minh) ---------------- */

  /** Độ cao lớn nhất đạt được khi bật lên với vận tốc v0, mô phỏng đúng bộ tích phân của step. */
  function riseHeight(v0) {
    let y = 0;
    let vy = v0;
    let top = 0;
    while (vy > 0) {
      vy -= G * DT;
      y += vy * DT;
      if (y > top) top = y;
    }
    return top;
  }

  /** Thời gian (s) từ lúc bật lên với v0 tới lúc rơi xuống ngang độ cao d; không tới được d thì null. */
  function descentTime(v0, d) {
    let y = 0;
    let vy = v0;
    let top = 0;
    for (let n = 1; n < 100000; n++) {
      vy -= G * DT;
      y += vy * DT;
      if (y > top) top = y;
      if (vy < 0 && y <= d) return top >= d ? n * DT : null;
    }
    return null;
  }

  /** Quãng đường ngang đi được trong t giây khi bắt đầu chạy hết tốc theo hướng ngược lại (trường hợp xấu nhất). */
  function reachDistance(t) {
    let x = 0;
    let vx = -MAX_VX;
    const n = Math.floor(t / DT + 1e-9);
    for (let i = 0; i < n; i++) {
      vx += clamp(MAX_VX - vx, -ACC * DT, ACC * DT);
      x += vx * DT;
    }
    return x;
  }

  /* ---------------- Sinh màn ---------------- */

  function addPlatform(s, p) {
    p.id = s.nextId++;
    s.platforms.push(p);
    return p;
  }

  /**
   * Sinh bệ chính tiếp theo (cách bệ chính trước gap ≤ MAX_GAP) và có thể thêm một bệ phụ ở giữa khoảng hở.
   * Độ khó theo độ cao h (m): khoảng hở rộng dần; từ 20 m có lò xo, 30 m bệ vỡ, 60 m bệ di động, 200 m mây giông.
   */
  function genNext(s) {
    const g = s.gen;
    const h = (g.y - START_Y) / UNIT;
    const k = Math.min(1, h / 700);
    const lo = 34 + 76 * k;
    const hi = 72 + (MAX_GAP - 72) * k;
    const gap = lo + rand(s) * (hi - lo);
    const y = g.y + gap;

    // Mây giông: đặt đủ cao để mọi bệ chính từ arc.lo trở lên (tới khi qua hẳn mây) nằm ngoài tầm mây,
    // và đủ xa lò xo gần nhất bên dưới để không lò xo nào bắn người chơi xuyên qua mây
    if (!g.arc && h >= 200 && rand(s) < 0.08) {
      const ym = Math.max(
        g.y + MR + H_MAX + PH + 12,
        g.spring + SPRING_H_MAX + PH + MR + 12,
        g.mon + MR + H_MAX + PH + 6,
      );
      const a = 40 + rand(s) * (MA - 40);
      const reach = a + MR + PHW;
      const cx = reach + rand(s) * (W - 2 * reach);
      s.monsters.push({ id: s.nextId++, cx, y: ym, a, w: 1.2 + rand(s) * 0.8, ph: rand(s) * TAU });
      g.arc = { lo: ym - MR - H_MAX - PH - 6, hi: ym + MR + 6, dLo: cx - reach, dHi: cx + reach };
    }

    let p;
    if (g.arc && y >= g.arc.lo) {
      // Trong vùng mây: bệ tĩnh nằm hẳn ngoài khoảng nguy hiểm [dLo, dHi] (bên trái hoặc bên phải)
      const lenL = Math.max(0, g.arc.dLo - PW);
      const lenR = Math.max(0, W - PW - g.arc.dHi);
      const u = rand(s) * (lenL + lenR);
      p = { k: 'n', x: u <= lenL ? u : g.arc.dHi + (u - lenL), y };
    } else {
      const x = rand(s) * (W - PW);
      const pm = h < 60 ? 0 : Math.min(0.4, 0.08 + (h - 60) / 1500);
      const ps = h < 20 || g.arc ? 0 : 0.06;
      const r = rand(s);
      if (r < pm) {
        const span = 100 + rand(s) * (W - PW - 100);
        const mlo = clamp(x - rand(s) * span, 0, W - PW - span);
        const sp = 50 + Math.min(100, h / 12) * (0.7 + 0.3 * rand(s));
        p = { k: 'm', x: clamp(x, mlo, mlo + span), y, lo: mlo, hi: mlo + span, sp, d: rand(s) < 0.5 ? 1 : -1 };
      } else if (r < pm + ps) {
        p = { k: 's', x, y, sx: rand(s) * (PW - SPRING_W), st: -1 };
        g.spring = y;
      } else {
        p = { k: 'n', x, y };
      }
    }
    addPlatform(s, p);
    if (g.arc && y > g.arc.hi) {
      g.mon = g.arc.hi + MAX_GAP + 150; // mây kế tiếp phải cách xa vùng này
      g.arc = null;
    }

    // Bệ phụ giữa khoảng hở: bệ vỡ (bẫy) hoặc bệ thường (đầu ván dày, lên cao thưa dần)
    if (gap >= 44) {
      const pb = h < 30 ? 0 : Math.min(0.45, 0.15 + h / 2000);
      const pe = Math.max(0.08, 0.55 - h / 400);
      const r = rand(s);
      const y2 = g.y + gap * (0.35 + 0.3 * rand(s));
      const x2 = rand(s) * (W - PW);
      if (r < pb) addPlatform(s, { k: 'b', x: x2, y: y2, br: false, fv: 0 });
      else if (r < pb + pe) addPlatform(s, { k: 'n', x: x2, y: y2 });
    }
    g.y = y;
  }

  /** Sinh bệ cho tới khi bệ chính cao nhất vượt độ cao y (test dùng để sinh màn rất cao, không cắt bớt). */
  function generateTo(s, y) {
    while (s.gen.y < y) genNext(s);
    return s;
  }

  /* ---------------- Ván ---------------- */

  function newGame(seed) {
    const sd = Number(seed) >>> 0;
    const s = {
      v: VERSION,
      seed: sd,
      rng: sd | 0,
      t: 0,
      player: { x: W / 2, y: START_Y, vx: 0, vy: JUMP_V, face: 1 },
      platforms: [{ id: 1, k: 'n', x: W / 2 - PW / 2, y: START_Y }],
      monsters: [],
      nextId: 2,
      cam: 0,
      maxY: START_Y,
      score: 0,
      dead: false,
      over: false,
      gen: { y: START_Y, spring: -100000, mon: 0, arc: null },
      ev: [],
    };
    return generateTo(s, AHEAD);
  }

  /** Một bước mô phỏng DT với input ∈ [-1, 1]. Sửa trực tiếp s; sự kiện của bước nằm trong s.ev. */
  function step(s, input) {
    s.ev = [];
    if (s.over) return s;
    s.t++;
    const p = s.player;

    // Lái ngang: tiến dần về tốc độ mục tiêu theo gia tốc ACC; gục thì buông tay
    const dir = s.dead ? 0 : clamp(Number(input) || 0, -1, 1);
    p.vx += clamp(dir * MAX_VX - p.vx, -ACC * DT, ACC * DT);
    if (dir > 0.05) p.face = 1;
    else if (dir < -0.05) p.face = -1;
    p.x = wrap(p.x + p.vx * DT);

    // Rơi (Euler bán ẩn: cập nhật vận tốc trước rồi vị trí)
    const prev = p.y;
    p.vy -= G * DT;
    p.y += p.vy * DT;

    // Bệ di động chạy qua lại trong [lo, hi]; bệ đã vỡ rơi xuống
    for (const q of s.platforms) {
      if (q.k === 'm') {
        q.x += q.sp * q.d * DT;
        if (q.x > q.hi) {
          q.x = Math.max(q.lo, 2 * q.hi - q.x);
          q.d = -1;
        } else if (q.x < q.lo) {
          q.x = Math.min(q.hi, 2 * q.lo - q.x);
          q.d = 1;
        }
      } else if (q.k === 'b' && q.br) {
        q.fv += G * DT;
        q.y -= q.fv * DT;
      }
    }
    for (const m of s.monsters) m.ph = (m.ph + m.w * DT) % TAU;

    // Đáp bệ: chỉ khi đang rơi và chân đi qua mặt trên bệ trong bước này (xét cả đoạn nên không xuyên bệ)
    if (!s.dead && p.vy < 0) {
      const hits = [];
      for (const q of s.platforms) {
        if (q.br || prev < q.y || p.y > q.y) continue;
        if (Math.abs(wrapDelta(q.x + PW / 2 - p.x)) < PW / 2 + PHW) hits.push(q);
      }
      hits.sort((a, b) => b.y - a.y);
      for (const q of hits) {
        if (q.k === 'b') {
          // Bệ vỡ: vụn ra, không đỡ; rơi tiếp xuống bệ bên dưới (nếu có trong cùng bước)
          q.br = true;
          q.fv = 0;
          s.ev.push({ k: 'break', x: q.x + PW / 2, y: q.y });
          continue;
        }
        p.y = q.y;
        if (q.k === 's' && Math.abs(wrapDelta(q.x + q.sx + SPRING_W / 2 - p.x)) < SPRING_W / 2 + PHW) {
          p.vy = SPRING_V;
          q.st = s.t;
          s.ev.push({ k: 'spring', x: p.x, y: q.y });
        } else {
          p.vy = JUMP_V;
          s.ev.push({ k: 'jump', x: p.x, y: q.y });
        }
        break;
      }
    }

    // Mây giông: hộp người chơi giao hình tròn của mây. Đang rơi và chân còn trên tâm mây = dẫm (mây tan, nảy lên)
    if (!s.dead) {
      for (let i = 0; i < s.monsters.length; i++) {
        const m = s.monsters[i];
        const dx = wrapDelta(monsterX(m) - p.x);
        const ex = dx - clamp(dx, -PHW, PHW);
        const ey = m.y - clamp(m.y, p.y, p.y + PH);
        if (ex * ex + ey * ey > MR_HIT * MR_HIT) continue;
        if (p.vy < 0 && prev >= m.y) {
          s.monsters.splice(i, 1);
          p.vy = JUMP_V;
          s.ev.push({ k: 'stomp', x: p.x + dx, y: m.y });
        } else {
          s.dead = true;
          if (p.vy > 0) p.vy = 0;
          s.ev.push({ k: 'hit', x: p.x + dx, y: m.y });
        }
        break;
      }
    }

    // Điểm = độ cao lớn nhất (m); camera chỉ đi lên theo đỉnh cao nhất
    if (!s.dead && p.y > s.maxY) {
      s.maxY = p.y;
      s.score = Math.floor((s.maxY - START_Y) / UNIT);
    }
    const camT = s.maxY - CAM_FRAC * VIEW_H;
    if (camT > s.cam) s.cam = camT;

    // Cả người rơi khỏi đáy màn hình: hết ván
    if (p.y + PH < s.cam) {
      s.over = true;
      s.ev.push({ k: 'over', x: p.x, y: p.y });
    }

    // Sinh thêm phía trên, bỏ những gì đã ở dưới đáy
    if (s.gen.y < s.cam + AHEAD) generateTo(s, s.cam + AHEAD);
    const cut = s.cam - PRUNE;
    if (s.platforms.some((q) => q.y < cut)) s.platforms = s.platforms.filter((q) => q.y >= cut);
    if (s.monsters.some((m) => m.y < cut)) s.monsters = s.monsters.filter((m) => m.y >= cut);
    return s;
  }

  const isOver = (s) => !!s.over;
  /** Thời gian đã chơi (ms) theo số bước mô phỏng. */
  const elapsedMs = (s) => Math.round(s.t * DT * 1000);

  /* ---------------- Lưu / khôi phục ---------------- */

  const copyPlat = (q) => {
    const o = { id: q.id, k: q.k, x: q.x, y: q.y };
    if (q.k === 'm') Object.assign(o, { lo: q.lo, hi: q.hi, sp: q.sp, d: q.d });
    if (q.k === 's') Object.assign(o, { sx: q.sx, st: q.st });
    if (q.k === 'b') Object.assign(o, { br: q.br, fv: q.fv });
    return o;
  };
  const copyMon = (m) => ({ id: m.id, cx: m.cx, y: m.y, a: m.a, w: m.w, ph: m.ph });

  function toJSON(s) {
    const g = s.gen;
    return {
      v: VERSION,
      seed: s.seed,
      rng: s.rng,
      t: s.t,
      player: { x: s.player.x, y: s.player.y, vx: s.player.vx, vy: s.player.vy, face: s.player.face },
      platforms: s.platforms.map(copyPlat),
      monsters: s.monsters.map(copyMon),
      nextId: s.nextId,
      cam: s.cam,
      maxY: s.maxY,
      score: s.score,
      dead: s.dead,
      over: s.over,
      gen: { y: g.y, spring: g.spring, mon: g.mon, arc: g.arc ? { lo: g.arc.lo, hi: g.arc.hi, dLo: g.arc.dLo, dHi: g.arc.dHi } : null },
    };
  }

  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const int = (v) => Number.isInteger(v);
  const obj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  function validPlat(q) {
    if (!obj(q) || !int(q.id) || q.id < 1 || !num(q.x) || !num(q.y)) return false;
    if (q.k === 'n') return q.x >= 0 && q.x <= W - PW;
    if (q.k === 'm') {
      return num(q.lo) && num(q.hi) && num(q.sp) && (q.d === 1 || q.d === -1) &&
        q.lo >= 0 && q.lo <= q.hi && q.hi <= W - PW && q.x >= q.lo && q.x <= q.hi && q.sp >= 0 && q.sp < MAX_VX;
    }
    if (q.k === 's') return q.x >= 0 && q.x <= W - PW && num(q.sx) && q.sx >= 0 && q.sx <= PW - SPRING_W && int(q.st);
    if (q.k === 'b') return q.x >= 0 && q.x <= W - PW && typeof q.br === 'boolean' && num(q.fv) && q.fv >= 0;
    return false;
  }
  const validMon = (m) => obj(m) && int(m.id) && m.id >= 1 && [m.cx, m.y, m.a, m.w, m.ph].every(num) && m.a >= 0 && m.a <= MA;

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!obj(raw) || raw.v !== VERSION) return null;
    const { player: p, platforms, monsters, gen: g } = raw;
    if (!int(raw.seed) || raw.seed < 0 || raw.seed > 0xffffffff) return null;
    if (!int(raw.rng) || raw.rng < -0x80000000 || raw.rng > 0x7fffffff) return null;
    if (!int(raw.t) || raw.t < 0 || !int(raw.nextId) || raw.nextId < 2) return null;
    if (!obj(p) || ![p.x, p.y, p.vx, p.vy].every(num) || p.x < 0 || p.x >= W || Math.abs(p.vx) > MAX_VX) return null;
    if (p.face !== 1 && p.face !== -1) return null;
    if (!Array.isArray(platforms) || platforms.length > 500 || !platforms.every(validPlat)) return null;
    if (!Array.isArray(monsters) || monsters.length > 50 || !monsters.every(validMon)) return null;
    if (platforms.some((q) => q.id >= raw.nextId) || monsters.some((m) => m.id >= raw.nextId)) return null;
    if (!num(raw.cam) || raw.cam < 0 || !num(raw.maxY) || raw.maxY < START_Y) return null;
    if (!int(raw.score) || raw.score !== Math.floor((raw.maxY - START_Y) / UNIT)) return null;
    if (typeof raw.dead !== 'boolean' || typeof raw.over !== 'boolean') return null;
    if (!obj(g) || !num(g.y) || !num(g.spring) || !num(g.mon)) return null;
    const a = g.arc;
    if (a !== null && !(obj(a) && [a.lo, a.hi, a.dLo, a.dHi].every(num))) return null;
    const s = toJSON({
      seed: raw.seed,
      rng: raw.rng,
      t: raw.t,
      player: p,
      platforms,
      monsters,
      nextId: raw.nextId,
      cam: raw.cam,
      maxY: raw.maxY,
      score: raw.score,
      dead: raw.dead,
      over: raw.over,
      gen: g,
    });
    s.ev = [];
    return s;
  }

  const api = {
    VERSION, W, VIEW_H, DT, G, JUMP_V, SPRING_V, MAX_VX, ACC, PW, PLAT_H, PHW, PH, SPRING_W, MR, MR_HIT, MA,
    UNIT, CAM_FRAC, START_Y, H_MAX, SPRING_H_MAX, MAX_GAP,
    newGame, step, generateTo, isOver, elapsedMs, monsterX, wrapDelta, riseHeight, descentTime, reachDistance,
    toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
