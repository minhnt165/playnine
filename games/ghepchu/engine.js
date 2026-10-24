/* =====================================================================
 * Ghép Chữ - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Mỗi vòng: một từ gốc 6–7 chữ (chọn theo hạt giống) bị xáo chữ; 90 giây ghép càng nhiều từ tiếng Anh càng tốt.
 *   - Từ hợp lệ: ≥ 3 chữ, có trong bộ từ (SCOWL ≤ 50, xem words.js), mỗi chữ cái dùng tối đa số lần nó có.
 *   - Điểm theo độ dài: 3 = 100, 4 = 400, 5 = 1200, 6 = 2000, 7 = 3000. Từ trùng không tính.
 *   - Hàm thuần: nhận ván cũ, trả ván mới (không sửa ván cũ). Thời gian do app đẩy vào bằng advance(ms).
 *   Ván: { seed, base, letters, found: [từ theo thứ tự tìm], score, t (ms đã chơi) }
 * ===================================================================== */
(function (root) {
  'use strict';

  const W = typeof module !== 'undefined' && module.exports ? require('./words.js') : root.GHEPCHU_WORDS;

  const VERSION = 1; // tăng khi đổi dạng ván lưu hoặc bộ từ (ván lưu cũ sẽ bị bỏ)
  const ROUND_MS = 90000;
  const MIN_LEN = 3;
  const MIN_WORDS = 25; // mỗi từ gốc cho ít nhất chừng này từ (tools/build-words.mjs lọc, test kiểm)
  const POINTS = { 3: 100, 4: 400, 5: 1200, 6: 2000, 7: 3000 };
  // Trần điểm: tổng điểm mọi từ của vòng "giàu" nhất trong bộ từ gốc (test tính lại và so khớp)
  const MAX_SCORE = 40000;

  /* ---------------- Bộ từ ---------------- */
  /** Tách chuỗi nối liền thành mảng các từ dài n. */
  function split(s, n) {
    const out = [];
    for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
    return out;
  }
  const LIST = []; // mọi từ hợp lệ, dài trước rồi theo ABC (thứ tự hiện danh sách)
  [7, 6, 5, 4, 3].forEach((n) => { LIST.push(...split(W.words[n] || '', n)); });
  const WORDSET = new Set(LIST);
  const BASES = split(W.bases[6] || '', 6).concat(split(W.bases[7] || '', 7));

  const isWord = (w) => typeof w === 'string' && WORDSET.has(w);
  const pointsFor = (w) => POINTS[w.length] || 0;
  const totalPoints = (words) => words.reduce((s, w) => s + pointsFor(w), 0);

  /** Đếm số lần mỗi chữ a–z; có ký tự ngoài a–z thì trả null. */
  function counts(s) {
    const c = new Array(26).fill(0);
    for (let i = 0; i < s.length; i++) {
      const k = s.charCodeAt(i) - 97;
      if (k < 0 || k > 25) return null;
      c[k]++;
    }
    return c;
  }

  /** Từ w có ghép được từ các chữ của letters không (mỗi chữ dùng tối đa số lần nó có). */
  function canForm(letters, w) {
    const c = counts(letters);
    const need = counts(w);
    if (!c || !need) return false;
    for (let i = 0; i < 26; i++) if (need[i] > c[i]) return false;
    return true;
  }

  /** Mọi từ hợp lệ ghép được từ letters, dài trước rồi theo ABC. */
  function wordsFor(letters) {
    const c = counts(letters);
    if (!c) return [];
    const out = [];
    const need = new Array(26);
    for (const w of LIST) {
      if (w.length > letters.length) continue;
      need.fill(0);
      let fit = true;
      for (let i = 0; i < w.length; i++) {
        const k = w.charCodeAt(i) - 97;
        if (++need[k] > c[k]) { fit = false; break; }
      }
      if (fit) out.push(w);
    }
    return out;
  }

  /* ---------------- Hạt giống ---------------- */
  /** mulberry32: hàm r() → [0, 1) tất định theo hạt giống 32 bit. */
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

  /** Xáo chữ (Fisher–Yates) cho tới khi khác thứ tự cũ (bộ chữ toàn một loại thì thôi). */
  function scramble(s, rand) {
    const allSame = s.split('').every((ch) => ch === s[0]);
    for (let tries = 0; tries < 50; tries++) {
      const a = s.split('');
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const x = a[i];
        a[i] = a[j];
        a[j] = x;
      }
      const out = a.join('');
      if (out !== s || allSame) return out;
    }
    return s.slice(1) + s[0]; // gần như không xảy ra: xoay vòng một chữ
  }

  const baseOf = (seed) => BASES[Math.floor(rng(seed)() * BASES.length)];

  /* ---------------- Vòng ---------------- */
  function newGame(seed) {
    seed = seed >>> 0;
    const rand = rng(seed);
    const base = BASES[Math.floor(rand() * BASES.length)];
    return { seed, base, letters: scramble(base, rand), found: [], score: 0, t: 0 };
  }

  const timeLeft = (g) => Math.max(0, ROUND_MS - g.t);
  const isOver = (g) => g.t >= ROUND_MS;

  /** Đẩy đồng hồ thêm ms (bỏ qua giá trị âm, chặn ở 90 giây). */
  function advance(g, ms) {
    if (isOver(g) || !(ms > 0)) return g;
    return Object.assign({}, g, { t: Math.min(ROUND_MS, g.t + ms) });
  }

  /** Đổi thứ tự chữ (rand: hàm [0, 1), app dùng Math.random). */
  function shuffle(g, rand) {
    return Object.assign({}, g, { letters: scramble(g.letters, rand || Math.random) });
  }

  /**
   * Gửi một từ. Trả { game, result: { type, word, points, all } }; type:
   *   'ok' (cộng điểm) | 'short' (< 3 chữ) | 'letters' (không ghép được từ các chữ) | 'invalid' (không phải từ)
   *   | 'dup' (đã tìm) | 'over' (hết giờ). Chỉ 'ok' mới đổi ván.
   */
  function submit(g, word) {
    const w = typeof word === 'string' ? word.toLowerCase() : '';
    const res = (type, points) => ({ type, word: w, points: points || 0, all: type === 'ok' && w.length === g.letters.length });
    if (isOver(g)) return { game: g, result: res('over') };
    if (w.length < MIN_LEN) return { game: g, result: res('short') };
    if (!canForm(g.letters, w)) return { game: g, result: res('letters') };
    if (!WORDSET.has(w)) return { game: g, result: res('invalid') };
    if (g.found.includes(w)) return { game: g, result: res('dup') };
    const pts = pointsFor(w);
    const game = Object.assign({}, g, { found: g.found.concat(w), score: g.score + pts });
    return { game, result: res('ok', pts) };
  }

  const allWords = (g) => wordsFor(g.base);
  const roundMax = (g) => totalPoints(allWords(g));
  /** Các từ hợp lệ chưa tìm (dài trước rồi theo ABC). */
  function missed(g) {
    const f = new Set(g.found);
    return allWords(g).filter((w) => !f.has(w));
  }

  /* ---------------- Lưu ---------------- */
  const toJSON = (g) => ({ v: VERSION, seed: g.seed, base: g.base, letters: g.letters, found: g.found.slice(), t: Math.min(ROUND_MS, Math.round(g.t)) });

  /** Ván lưu hỏng, khác phiên bản hoặc khác bộ từ thì trả null (app chia ván mới). Điểm tính lại từ danh sách từ. */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { seed, base, letters, found, t } = raw;
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
    if (typeof base !== 'string' || base !== baseOf(seed)) return null;
    if (typeof letters !== 'string' || letters.length !== base.length || letters.split('').sort().join('') !== base.split('').sort().join('')) return null;
    if (!Number.isInteger(t) || t < 0 || t > ROUND_MS) return null;
    if (!Array.isArray(found)) return null;
    const seen = new Set();
    for (const w of found) {
      if (typeof w !== 'string' || w.length < MIN_LEN || seen.has(w) || !WORDSET.has(w) || !canForm(base, w)) return null;
      seen.add(w);
    }
    return { seed, base, letters, found: found.slice(), score: totalPoints(found), t };
  }

  const api = {
    VERSION, ROUND_MS, MIN_LEN, MIN_WORDS, POINTS, MAX_SCORE, BASES, WORD_COUNT: LIST.length,
    rng, isWord, pointsFor, totalPoints, canForm, wordsFor,
    newGame, advance, shuffle, submit, timeLeft, isOver, allWords, roundMax, missed, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
