/* =====================================================================
 * Nhớ Nhịp - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Máy phát một chuỗi ô (mỗi ô một nốt), người chơi bấm lặp lại đúng thứ tự; mỗi vòng chuỗi dài thêm một bước.
 *   - Chuỗi tất định theo hạt giống (mulberry32): vòng sau giữ nguyên các bước cũ và nối thêm một bước.
 *   - Ván chạy theo đồng hồ trong ván `t` (ms): advance(g, ms) tiến giờ, phát nốt theo lịch; press(g, pad) nhận một lần bấm.
 *   - Pha: 'show' (máy đang phát, bấm bị bỏ qua) → 'input' (tới lượt người chơi) → 'show' vòng sau … → 'over' (bấm sai).
 *   - Điểm = độ dài chuỗi dài nhất đã lặp lại đúng.
 *   - An toàn động kinh: mọi chu kỳ phát (sáng + tắt) ≥ 340 ms, tức dưới 3 lần sáng mỗi giây (test kiểm tra).
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const MIN_PERIOD = 340; // ms: chu kỳ phát ngắn nhất (≤ 2,94 lần sáng / giây)

  /**
   * Mỗi mode: số ô, thời gian sáng (on) và nghỉ (gap) của một bước ở vòng 1, mức giảm mỗi vòng và mức sàn;
   * lead: nghỉ trước nốt đầu khi bắt đầu ván / phát lại; pause: nghỉ giữa lúc bấm xong vòng và nốt đầu vòng sau.
   */
  const MODES = {
    classic: { pads: 4, on0: 460, onStep: 20, onMin: 240, gap0: 220, gapStep: 10, gapMin: 120, lead: 700, pause: 800 },
    hard: { pads: 6, on0: 360, onStep: 16, onMin: 220, gap0: 180, gapStep: 8, gapMin: 120, lead: 700, pause: 650 },
  };
  const MODE_KEYS = Object.keys(MODES);

  /** Lịch phát của vòng có chuỗi dài n: nhanh dần theo vòng, chạm sàn thì giữ. */
  function timing(mode, n) {
    const m = MODES[mode];
    const k = Math.max(0, n - 1);
    const on = Math.max(m.onMin, m.on0 - m.onStep * k);
    const gap = Math.max(m.gapMin, m.gap0 - m.gapStep * k);
    return { on, gap, period: on + gap };
  }

  /** Thời gian phát trọn chuỗi dài n (từ lúc nốt đầu sáng tới lúc nốt cuối tắt). */
  function showDuration(mode, n) {
    const tm = timing(mode, n);
    return (n - 1) * tm.period + tm.on;
  }

  /* ---------------- Sinh chuỗi ---------------- */

  /** mulberry32: PRNG 32 bit, cùng hạt giống ra cùng dãy. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * n bước đầu của chuỗi theo hạt giống. Không có ba bước liền nhau trùng một ô (ba lần sáng cùng chỗ
   * khó đếm và dễ thành nhấp nháy). Tiền tố luôn giống nhau: sequence(s, p, 5) là đầu của sequence(s, p, 9).
   */
  function sequence(seed, pads, n) {
    const r = mulberry32(seed);
    const out = [];
    while (out.length < n) {
      const i = out.length;
      let x = Math.floor(r() * pads);
      if (i >= 2 && out[i - 1] === x && out[i - 2] === x) x = (x + 1 + Math.floor(r() * (pads - 1))) % pads;
      out.push(x);
    }
    return out;
  }

  /* ---------------- Ván ---------------- */

  function make(mode, seed, t, score, phase, showAt) {
    const n = score + 1;
    return { mode, seed, t, score, n, phase, showAt, pos: 0, played: 0, wrong: null, seq: sequence(seed, MODES[mode].pads, n) };
  }

  /** Ván mới: máy phát nốt đầu sau `lead` ms. */
  function newGame(mode, seed) {
    if (!MODES[mode]) throw new Error('mode lạ: ' + mode);
    return make(mode, seed >>> 0, 0, 0, 'show', MODES[mode].lead);
  }

  const isOver = (g) => g.phase === 'over';
  const padCount = (g) => MODES[g.mode].pads;

  /** Thời điểm (giờ trong ván) pha phát của vòng hiện tại kết thúc và tới lượt người chơi. */
  const showEnd = (g) => g.showAt + showDuration(g.mode, g.n);

  /** Ô đang sáng do máy phát ở giờ hiện tại, hoặc -1. */
  function litPad(g) {
    if (g.phase !== 'show') return -1;
    const dt = g.t - g.showAt;
    if (dt < 0) return -1;
    const tm = timing(g.mode, g.n);
    const k = Math.floor(dt / tm.period);
    if (k >= g.n || dt - k * tm.period >= tm.on) return -1;
    return g.seq[k];
  }

  /**
   * Tiến giờ ms mili giây. Trả { game, events }; events: { type: 'note', pad, i, on } khi một bước bắt đầu sáng
   * (để phát nốt dài `on` ms), { type: 'turn' } khi máy phát xong và tới lượt người chơi.
   * Ván đã xong thì đứng yên; đang chờ người chơi thì chỉ tăng giờ.
   */
  function advance(g, ms) {
    if (g.phase === 'over' || !(ms > 0)) return { game: g, events: [] };
    const t = g.t + ms;
    if (g.phase !== 'show') return { game: Object.assign({}, g, { t }), events: [] };
    const tm = timing(g.mode, g.n);
    const events = [];
    let played = g.played;
    while (played < g.n && g.showAt + played * tm.period <= t) {
      events.push({ type: 'note', pad: g.seq[played], i: played, on: tm.on });
      played++;
    }
    const next = Object.assign({}, g, { t, played });
    if (t >= showEnd(g)) {
      next.phase = 'input';
      next.pos = 0;
      events.push({ type: 'turn' });
    }
    return { game: next, events };
  }

  /**
   * Người chơi bấm ô pad. Trả { game, result }; result.type:
   *   'ignored' (không phải lượt bấm), 'ok' (đúng, chưa hết chuỗi), 'round' (đúng hết chuỗi: được điểm, sang vòng sau),
   *   'wrong' (sai: hết ván; result.expected là ô đúng).
   */
  function press(g, pad) {
    if (g.phase !== 'input' || !Number.isInteger(pad) || pad < 0 || pad >= padCount(g)) return { game: g, result: { type: 'ignored', pad } };
    const expected = g.seq[g.pos];
    if (pad !== expected) {
      return { game: Object.assign({}, g, { phase: 'over', wrong: { pad, expected, at: g.pos } }), result: { type: 'wrong', pad, expected } };
    }
    if (g.pos + 1 < g.n) return { game: Object.assign({}, g, { pos: g.pos + 1 }), result: { type: 'ok', pad, pos: g.pos + 1 } };
    // Xong vòng: điểm = độ dài chuỗi vừa lặp lại; vòng sau phát chuỗi dài thêm một bước sau `pause` ms
    const score = g.n;
    return { game: make(g.mode, g.seed, g.t, score, 'show', g.t + MODES[g.mode].pause), result: { type: 'round', pad, score } };
  }

  /** Phát lại vòng hiện tại từ đầu sau `lead` ms (sau khi tạm dừng / mở lại ván lưu): người chơi nhập lại từ bước đầu. */
  function replay(g) {
    if (g.phase === 'over') return g;
    return Object.assign({}, g, { phase: 'show', showAt: g.t + MODES[g.mode].lead, pos: 0, played: 0 });
  }

  /* ---------------- Chống gian lận: điểm không thể tăng nhanh hơn máy phát ---------------- */

  /**
   * Giờ trong ván sớm nhất có thể đạt điểm s (bấm tức thì, không tốn thời gian nhập):
   * lead + Σ thời gian phát vòng 1..s + (s − 1) lần nghỉ giữa vòng.
   */
  function minTimeForScore(mode, s) {
    const m = MODES[mode];
    let ms = m.lead;
    for (let n = 1; n <= s; n++) ms += showDuration(mode, n) + (n > 1 ? m.pause : 0);
    return ms;
  }

  /** Điểm / giây lớn nhất có thể (ván ≥ minDurationMs), theo cách tính của máy chủ: score / max(1, giây). */
  function maxScorePerSec(mode, minDurationMs) {
    let best = 0;
    for (let s = 1; s <= 300; s++) {
      const sec = Math.max(1, Math.max(minTimeForScore(mode, s), minDurationMs || 0) / 1000);
      best = Math.max(best, s / sec);
    }
    return best;
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  /** Lưu gọn: mode, hạt giống, giờ, điểm. Mở lại thì phát lại vòng đang dở từ đầu. */
  const toJSON = (g) => ({ v: VERSION, mode: g.mode, seed: g.seed, t: Math.round(g.t), score: g.score });

  /** Ván lưu hỏng, khác phiên bản hoặc không thể có thật thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { mode, seed, t, score } = raw;
    if (typeof mode !== 'string' || !Object.prototype.hasOwnProperty.call(MODES, mode)) return null;
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
    if (!Number.isInteger(t) || t < 0 || t > 1e9) return null;
    if (!Number.isInteger(score) || score < 0 || score > 10000) return null;
    // Không thể đạt điểm đó nhanh hơn máy phát
    if (score > 0 && t < minTimeForScore(mode, score)) return null;
    return replay(make(mode, seed, t, score, 'show', 0));
  }

  const api = {
    VERSION, MIN_PERIOD, MODES, MODE_KEYS, timing, showDuration, sequence, newGame, isOver, padCount, showEnd, litPad,
    advance, press, replay, minTimeForScore, maxScorePerSec, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
