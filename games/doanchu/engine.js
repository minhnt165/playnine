/* =====================================================================
 * Đoán Chữ - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Đoán một từ tiếng Anh 5 chữ trong 6 lượt; mỗi lượt tô: c = đúng chỗ, p = có trong từ, a = không có
 *   - Đề hằng ngày theo ngày giờ địa phương (đề #1 = 2026-10-24), đề tự do theo seed (PRNG mulberry32)
 *   - Chế độ khó: chữ xanh phải giữ chỗ, chữ vàng (đủ số lần) phải có trong lượt sau
 *   - Ván là đối tượng thuần { mode, seed | date, answer, guesses[], hard }; mọi hàm trả ván mới
 * ===================================================================== */
(function (root) {
  'use strict';

  const W = typeof require === 'function' && typeof module !== 'undefined' ? require('./words.js') : root.WORDS;

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const LEN = 5;
  const MAX = 6;
  const MODES = ['daily', 'free'];
  const EPOCH = Date.UTC(2026, 9, 24); // ngày ra mắt = đề #1
  const DAY = 86400000;

  const ANSWERS = W.answers.split(' ');
  const VALID = new Set(W.valid.split(' '));
  ANSWERS.forEach((w) => VALID.add(w));

  /* ---------------- Ngẫu nhiên theo seed ---------------- */

  /** mulberry32: hàm r() → [0, 1), tất định theo seed (số nguyên 32 bit). */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Băm chuỗi thành số 32 bit (FNV-1a). */
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  }

  // Thứ tự đề hằng ngày: hoán vị cố định của danh sách đáp án, đi hết vòng mới lặp lại
  const DAILY_ORDER = (function () {
    const a = ANSWERS.slice();
    const r = rng(hash('doanchu-daily-v1'));
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  })();

  /* ---------------- Ngày ---------------- */

  const pad = (n) => String(n).padStart(2, '0');
  /** 'YYYY-MM-DD' theo giờ địa phương của máy. */
  const dateKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  /** Kiểm tra 'YYYY-MM-DD' là ngày có thật; trả [y, m, d] hoặc null. */
  function parseDate(key) {
    const m = typeof key === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!m) return null;
    const y = +m[1];
    const mo = +m[2];
    const d = +m[3];
    const t = new Date(Date.UTC(y, mo - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
    return [y, mo, d];
  }

  /** Số thứ tự đề của một ngày (tính theo lịch, không theo giờ nên không lệch khi đổi giờ mùa hè). */
  function dayNumber(key) {
    const p = parseDate(key);
    if (!p) return NaN;
    return Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - EPOCH) / DAY) + 1;
  }

  function dailyAnswer(key) {
    const n = dayNumber(key);
    const len = DAILY_ORDER.length;
    return DAILY_ORDER[(((n - 1) % len) + len) % len];
  }

  const freeAnswer = (seed) => ANSWERS[Math.floor(rng(hash('doanchu-free-' + (seed >>> 0)))() * ANSWERS.length)];

  /* ---------------- Luật ---------------- */

  const norm = (w) => (typeof w === 'string' ? w.toLowerCase() : '');
  const isValid = (w) => VALID.has(norm(w));

  /** Tô một lượt: chuỗi 5 ký tự c / p / a. Xanh xét trước; chữ còn lại mới tô vàng, không quá số lần có trong đáp án. */
  function score(guess, answer) {
    const g = norm(guess);
    const res = ['a', 'a', 'a', 'a', 'a'];
    const left = {};
    for (let i = 0; i < LEN; i++) {
      if (g[i] === answer[i]) res[i] = 'c';
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < LEN; i++) {
      if (res[i] === 'c') continue;
      if (left[g[i]] > 0) {
        res[i] = 'p';
        left[g[i]]--;
      }
    }
    return res.join('');
  }

  const isWon = (g) => g.guesses.length > 0 && g.guesses[g.guesses.length - 1] === g.answer;
  const isOver = (g) => isWon(g) || g.guesses.length >= MAX;
  const status = (g) => (isWon(g) ? 'won' : isOver(g) ? 'lost' : 'play');

  function newGame(opts) {
    const mode = opts.mode === 'daily' ? 'daily' : 'free';
    const base = mode === 'daily'
      ? { mode, date: opts.date, answer: dailyAnswer(opts.date) }
      : { mode, seed: opts.seed >>> 0, answer: freeAnswer(opts.seed) };
    return Object.assign(base, { guesses: [], hard: !!opts.hard });
  }

  /** Bật / tắt chế độ khó: chỉ được khi chưa đoán lượt nào. */
  const setHard = (g, on) => (g.guesses.length ? g : Object.assign({}, g, { hard: !!on }));

  /** Gợi ý đã lộ: vị trí xanh và số lần tối thiểu của mỗi chữ (xanh + vàng) qua các lượt. */
  function hints(guesses, answer) {
    const pos = {};
    const min = {};
    guesses.forEach((w) => {
      const s = score(w, answer);
      const cnt = {};
      for (let i = 0; i < LEN; i++) {
        if (s[i] === 'c') pos[i] = w[i];
        if (s[i] !== 'a') cnt[w[i]] = (cnt[w[i]] || 0) + 1;
      }
      Object.keys(cnt).forEach((ch) => { min[ch] = Math.max(min[ch] || 0, cnt[ch]); });
    });
    return { pos, min };
  }

  /** Chế độ khó: lượt đoán có dùng lại gợi ý đã lộ không. null = được; không thì báo lỗi đầu tiên. */
  function hardCheck(g, word) {
    if (!g.hard) return null;
    const w = norm(word);
    const h = hints(g.guesses, g.answer);
    for (let i = 0; i < LEN; i++) if (h.pos[i] && w[i] !== h.pos[i]) return { error: 'hardPos', letter: h.pos[i], pos: i };
    const keys = Object.keys(h.min);
    for (let k = 0; k < keys.length; k++) {
      const ch = keys[k];
      if (w.split(ch).length - 1 < h.min[ch]) return { error: 'hardHas', letter: ch };
    }
    return null;
  }

  /** Đoán một từ: { ok: true, game } hoặc { ok: false, error: 'over' | 'short' | 'unknown' | 'hardPos' | 'hardHas', ... }. */
  function guess(g, word) {
    if (isOver(g)) return { ok: false, error: 'over' };
    const w = norm(word);
    if (w.length !== LEN) return { ok: false, error: 'short' };
    if (!VALID.has(w)) return { ok: false, error: 'unknown' };
    const h = hardCheck(g, w);
    if (h) return Object.assign({ ok: false }, h);
    return { ok: true, game: Object.assign({}, g, { guesses: g.guesses.concat([w]) }) };
  }

  /** Màu tốt nhất của mỗi chữ đã đoán (cho bàn phím): { a: 'c' | 'p' | 'a' }. */
  function keyStates(g) {
    const rank = { a: 1, p: 2, c: 3 };
    const out = {};
    g.guesses.forEach((w) => {
      const s = score(w, g.answer);
      for (let i = 0; i < LEN; i++) if (!out[w[i]] || rank[s[i]] > rank[out[w[i]]]) out[w[i]] = s[i];
    });
    return out;
  }

  /* ---------------- Chia sẻ ---------------- */

  /** Lưới ô màu (mỗi lượt một dòng) để chép chia sẻ; không lộ chữ. */
  function shareGrid(g, opts) {
    const o = opts || {};
    const sq = { c: o.contrast ? '🟧' : '🟩', p: o.contrast ? '🟦' : '🟨', a: o.dark ? '⬛' : '⬜' };
    return g.guesses.map((w) => score(w, g.answer).split('').map((c) => sq[c]).join('')).join('\n');
  }
  /** '3/6', 'X/6' khi thua; thêm '*' khi chơi chế độ khó. */
  const resultLabel = (g) => (isWon(g) ? g.guesses.length : 'X') + '/' + MAX + (g.hard ? '*' : '');

  /* ---------------- Lưu ván ---------------- */

  function toJSON(g) {
    const o = { v: VERSION, mode: g.mode, answer: g.answer, guesses: g.guesses.slice(), hard: g.hard };
    if (g.mode === 'daily') o.date = g.date;
    else o.seed = g.seed;
    return o;
  }

  /** Ván lưu hỏng, khác phiên bản hoặc không nhất quán (đáp án, từ, chế độ khó) thì trả null. */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION || MODES.indexOf(raw.mode) < 0) return null;
    if (typeof raw.hard !== 'boolean' || !Array.isArray(raw.guesses) || raw.guesses.length > MAX) return null;
    let g;
    if (raw.mode === 'daily') {
      if (!parseDate(raw.date)) return null;
      g = newGame({ mode: 'daily', date: raw.date, hard: raw.hard });
    } else {
      if (!Number.isInteger(raw.seed) || raw.seed < 0 || raw.seed > 0xffffffff) return null;
      g = newGame({ mode: 'free', seed: raw.seed, hard: raw.hard });
    }
    if (raw.answer !== g.answer) return null;
    for (let i = 0; i < raw.guesses.length; i++) {
      const r = guess(g, raw.guesses[i]);
      if (!r.ok || raw.guesses[i] !== norm(raw.guesses[i])) return null;
      g = r.game;
    }
    return g;
  }

  const api = {
    LEN, MAX, ANSWERS, VALID, rng, hash, dateKey, dayNumber, dailyAnswer, freeAnswer, isValid, score,
    newGame, setHard, guess, hardCheck, keyStates, isWon, isOver, status, shareGrid, resultLabel, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
