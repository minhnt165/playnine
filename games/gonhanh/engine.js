/* =====================================================================
 * Gõ Nhanh - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Bài gõ: dãy từ tiếng Anh sinh từ hạt giống; gõ trong 60 hoặc 30 giây, đồng hồ chạy từ phím đầu tiên.
 *   - Mọi hàm nhận trạng thái cũ + thời điểm `at` (ms tính từ phím đầu tiên), trả trạng thái mới (không sửa cái cũ).
 *   - Space chuyển sang từ sau (từ bỏ dở: phần thiếu tính là lỗi); Backspace / xóa cả từ chỉ trong từ hiện tại.
 *   - WPM = ký tự đúng / 5 / phút. Ký tự đúng: chữ đúng vị trí + dấu cách sau mỗi từ gõ đúng hoàn toàn.
 *   - Chặn gõ tự động: ký tự đến đồng loạt (dán, script) hoặc tốc độ vượt xa người thật thì gắn cờ và dừng ván.
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const MODES = { '60s': 60000, '30s': 30000 };
  const WORDS_PER_SEC = 6; // số từ sinh sẵn mỗi giây của mode: 6 từ/giây ≈ 465 WPM, không ai gõ hết
  const MAX_EXTRA = 8; // số ký tự thừa tối đa sau một từ

  /* Chống gõ tự động (đo trên thời điểm phím thật, xem README):
   * - "đồng loạt": khoảng cách giữa hai ký tự dưới BURST_GAP ms. Người thật thỉnh thoảng có (hai phím gần như cùng lúc),
   *   nhưng không bao giờ RUN_MAX lần liên tiếp (5 ký tự trong vài ms), và không chiếm tới BURST_SHARE số phím.
   * - "tốc độ": hơn RATE_MAX ký tự trong RATE_WINDOW ms (40 ký tự/giây ≈ 480 WPM; người gõ ~250 WPM đo được tối đa 30 ký tự trong một giây). */
  const BURST_GAP = 3;
  const RUN_MAX = 4;
  const BURST_MIN = 15;
  const BURST_SHARE = 0.1;
  const RATE_WINDOW = 1000;
  const RATE_MAX = 40;
  const FLAGS = ['burst', 'rate'];
  const ENDS = ['time', 'words', 'flagged'];

  /* ---------------- PRNG ---------------- */
  /** mulberry32: hạt giống số nguyên 32 bit → hàm r() trong [0, 1). */
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** n từ ngẫu nhiên theo hạt giống, không lặp lại trong 3 từ gần nhất. */
  function genWords(seed, n, list) {
    const r = rng(seed);
    const out = [];
    while (out.length < n) {
      const w = list[Math.floor(r() * list.length)];
      if (list.length > 4 && out.slice(-3).indexOf(w) >= 0) continue;
      out.push(w);
    }
    return out;
  }

  /* ---------------- Trạng thái ---------------- */
  // Mọi trạng thái dựng theo đúng thứ tự khóa này (để so sánh / lưu ổn định)
  function make(o) {
    return {
      mode: o.mode,
      seed: o.seed,
      words: o.words,
      i: o.i, // chỉ số từ đang gõ
      typed: o.typed, // các từ đã gõ xong (đã bấm Space), đúng như người chơi gõ
      cur: o.cur, // phần đang gõ của từ hiện tại
      started: o.started,
      t: o.t, // ms tính từ phím đầu tiên
      over: o.over,
      end: o.end, // null | 'time' | 'words' | 'flagged'
      flagged: o.flagged, // null | 'burst' | 'rate'
      keys: o.keys, // số phím ký tự đã gõ (kể cả dấu cách, không kể Backspace)
      errors: o.errors, // số phím gõ sai lúc gõ (sửa lại vẫn tính)
      cum: o.cum, // ký tự đúng cộng dồn ở cuối mỗi giây đã qua
      kps: o.kps, // số phím trong từng giây
      eps: o.eps, // số lỗi trong từng giây
      lastAt: o.lastAt, // thời điểm phím trước (-1 = chưa có)
      run: o.run, // số lần "đồng loạt" liên tiếp hiện tại
      bursts: o.bursts, // tổng số lần "đồng loạt"
      recent: o.recent, // thời điểm của tối đa RATE_MAX phím gần nhất
    };
  }
  const set = (g, patch) => make(Object.assign({}, g, patch));

  function newGame(seed, mode, list) {
    if (!Object.prototype.hasOwnProperty.call(MODES, mode)) throw new Error('mode lạ: ' + mode);
    if (!Array.isArray(list) || !list.length) throw new Error('danh sách từ rỗng');
    const secs = MODES[mode] / 1000;
    return make({
      mode,
      seed: seed >>> 0,
      words: genWords(seed >>> 0, secs * WORDS_PER_SEC, list),
      i: 0,
      typed: [],
      cur: '',
      started: false,
      t: 0,
      over: false,
      end: null,
      flagged: null,
      keys: 0,
      errors: 0,
      cum: [],
      kps: new Array(secs).fill(0),
      eps: new Array(secs).fill(0),
      lastAt: -1,
      run: 0,
      bursts: 0,
      recent: [],
    });
  }

  const duration = (g) => MODES[g.mode];
  const timeLeft = (g) => Math.max(0, duration(g) - g.t);

  /* ---------------- Chấm chữ ---------------- */
  /** Số chữ đúng vị trí giữa chữ gõ và từ đích. */
  function matchCount(typed, word) {
    let n = 0;
    const m = Math.min(typed.length, word.length);
    for (let j = 0; j < m; j++) if (typed[j] === word[j]) n++;
    return n;
  }

  /** Ký tự đúng: chữ đúng vị trí ở mọi từ đã gõ + từ đang gõ, cộng một dấu cách sau mỗi từ gõ đúng hoàn toàn. */
  function correctChars(g) {
    let n = 0;
    for (let k = 0; k < g.typed.length; k++) {
      n += matchCount(g.typed[k], g.words[k]);
      if (g.typed[k] === g.words[k]) n++;
    }
    if (g.i < g.words.length) n += matchCount(g.cur, g.words[g.i]);
    return n;
  }

  const wordOk = (g, k) => k < g.typed.length && g.typed[k] === g.words[k];

  /**
   * Trạng thái từng chữ của từ k để tô màu: 'ok' | 'bad' | 'todo' (chưa gõ) | 'miss' (bỏ qua khi Space) | 'extra' (gõ thừa).
   * Chữ thừa nối sau các chữ của từ.
   */
  function letterStates(g, k) {
    const word = g.words[k];
    const done = k < g.typed.length;
    const typed = done ? g.typed[k] : k === g.i ? g.cur : '';
    const out = [];
    for (let j = 0; j < word.length; j++) {
      if (j < typed.length) out.push(typed[j] === word[j] ? 'ok' : 'bad');
      else out.push(done ? 'miss' : 'todo');
    }
    for (let j = word.length; j < typed.length; j++) out.push('extra');
    return out;
  }

  /** Thống kê ký tự kiểu bài gõ thường gặp: đúng / sai / thừa / thiếu (không tính dấu cách). */
  function charStats(g) {
    const s = { correct: 0, incorrect: 0, extra: 0, missed: 0 };
    const last = Math.min(g.i, g.words.length - 1);
    for (let k = 0; k <= last; k++) {
      if (k === g.i && !g.cur) break;
      letterStates(g, k).forEach((x) => {
        if (x === 'ok') s.correct++;
        else if (x === 'bad') s.incorrect++;
        else if (x === 'extra') s.extra++;
        else if (x === 'miss') s.missed++;
      });
    }
    return s;
  }

  /* ---------------- Đồng hồ ---------------- */
  /** Cho thời gian trôi tới `at`: ghi ký tự đúng cộng dồn ở mỗi mốc giây, hết giờ thì kết thúc. Chưa gõ phím nào thì đứng yên. */
  function advance(g, at) {
    if (!g.started || g.over) return g;
    const dur = duration(g);
    const now = Math.min(dur, Math.max(g.t, at));
    const secs = Math.floor(now / 1000);
    let cum = g.cum;
    if (secs > cum.length) {
      const c = correctChars(g);
      cum = cum.slice();
      while (cum.length < secs) cum.push(c);
    }
    if (now >= dur) return set(g, { t: dur, cum, over: true, end: 'time' });
    if (now === g.t && cum === g.cum) return g;
    return set(g, { t: now, cum });
  }

  /** Ghi một phím vào bộ đếm chống gõ tự động; trả cờ nếu phát hiện. */
  function watch(g, at) {
    let run = g.run;
    let bursts = g.bursts;
    if (g.lastAt >= 0 && at - g.lastAt < BURST_GAP) {
      run++;
      bursts++;
    } else run = 0;
    const recent = g.recent.concat([at]);
    if (recent.length > RATE_MAX + 1) recent.shift();
    let flag = null;
    if (run >= RUN_MAX || (bursts >= BURST_MIN && bursts >= (g.keys + 1) * BURST_SHARE)) flag = 'burst';
    else if (recent.length > RATE_MAX && at - recent[0] < RATE_WINDOW) flag = 'rate';
    return { run, bursts, recent, lastAt: at, flag };
  }

  /** Chuẩn bị cho một thao tác ở thời điểm at: bắt đầu ván nếu là phím đầu, cho đồng hồ trôi tới at. */
  function begin(g, at) {
    let x = g;
    if (!x.started) x = set(x, { started: true, t: Math.max(0, at) });
    return advance(x, at);
  }

  /** Gõ một ký tự (' ' = chuyển từ). Trả { game, result: { type: 'char'|'space'|'ignored'|'over'|'flagged', ok } }. */
  function type(g, ch, at) {
    if (g.over) return { game: g, result: { type: 'over' } };
    if (typeof ch !== 'string' || ch.length !== 1) return { game: g, result: { type: 'ignored' } };
    const word = g.words[g.i];
    // Space khi từ còn trống, hoặc gõ quá số ký tự thừa cho phép: bỏ qua (không bắt đầu ván, không tính phím)
    if (ch === ' ' ? !g.cur : g.cur.length >= word.length + MAX_EXTRA) return { game: g, result: { type: 'ignored' } };
    let x = begin(g, at);
    if (x.over) return { game: x, result: { type: 'over' } };
    const now = x.t;
    const w = watch(x, Math.max(now, at));
    const sec = Math.min(x.kps.length - 1, Math.floor(now / 1000));
    let ok;
    let patch;
    if (ch === ' ') {
      ok = x.cur.length >= word.length; // bỏ dở từ: phím Space này là lỗi
      const typed = x.typed.concat([x.cur]);
      const i = x.i + 1;
      patch = { typed, i, cur: '' };
      if (i >= x.words.length) Object.assign(patch, { over: true, end: 'words' });
    } else {
      ok = x.cur.length < word.length && word[x.cur.length] === ch;
      patch = { cur: x.cur + ch };
    }
    const kps = x.kps.slice();
    kps[sec]++;
    const eps = ok ? x.eps : x.eps.slice();
    if (!ok) eps[sec]++;
    Object.assign(patch, {
      keys: x.keys + 1,
      errors: x.errors + (ok ? 0 : 1),
      kps,
      eps,
      lastAt: w.lastAt,
      run: w.run,
      bursts: w.bursts,
      recent: w.recent,
    });
    if (w.flag) Object.assign(patch, { over: true, end: 'flagged', flagged: w.flag });
    x = set(x, patch);
    if (w.flag) return { game: x, result: { type: 'flagged', flag: w.flag } };
    return { game: x, result: { type: ch === ' ' ? 'space' : 'char', ok } };
  }

  /** Xóa chữ cuối của từ đang gõ (không lùi về từ trước). */
  function backspace(g, at) {
    if (g.over) return { game: g, result: { type: 'over' } };
    if (!g.cur || !g.started) return { game: g, result: { type: 'ignored' } };
    const x = advance(g, at);
    if (x.over) return { game: x, result: { type: 'over' } };
    return { game: set(x, { cur: x.cur.slice(0, -1) }), result: { type: 'back' } };
  }

  /** Xóa cả từ đang gõ (Ctrl / Alt + Backspace). */
  function clearWord(g, at) {
    if (g.over) return { game: g, result: { type: 'over' } };
    if (!g.cur || !g.started) return { game: g, result: { type: 'ignored' } };
    const x = advance(g, at);
    if (x.over) return { game: x, result: { type: 'over' } };
    return { game: set(x, { cur: '' }), result: { type: 'back' } };
  }

  /* ---------------- Điểm ---------------- */
  /** Số phút dùng để chia: hết ván thì trọn thời lượng mode, đang dở thì thời gian đã gõ (tối thiểu 1 giây). */
  function minutes(g) {
    return (g.over && g.end !== 'flagged' ? duration(g) : Math.max(1000, g.t)) / 60000;
  }
  function wpm(g) {
    if (g.flagged) return 0;
    const c = correctChars(g);
    return c ? c / 5 / minutes(g) : 0;
  }
  const rawWpm = (g) => (g.keys ? g.keys / 5 / minutes(g) : 0);
  const score = (g) => Math.round(wpm(g));
  const accuracy = (g) => (g.keys ? (g.keys - g.errors) / g.keys : null);

  /** Dữ liệu biểu đồ: mỗi giây đã qua → WPM cộng dồn, WPM thô của riêng giây đó, số lỗi trong giây đó. */
  function chart(g) {
    return g.cum.map((c, s) => ({ s: s + 1, wpm: c / 5 / ((s + 1) / 60), raw: g.kps[s] * 12, err: g.eps[s] }));
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  function toJSON(g) {
    return Object.assign({ v: VERSION }, g);
  }

  const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
  const isNum = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
  const isWord = (w) => typeof w === 'string' && /^[a-z]{1,20}$/.test(w);
  const isTyped = (s) => typeof s === 'string' && s.length <= 20 + MAX_EXTRA && s.indexOf(' ') < 0;

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    if (!Object.prototype.hasOwnProperty.call(MODES, raw.mode)) return null;
    const dur = MODES[raw.mode];
    const secs = dur / 1000;
    const r = raw;
    if (!isInt(r.seed, 0, 0xffffffff)) return null;
    if (!Array.isArray(r.words) || r.words.length !== secs * WORDS_PER_SEC || !r.words.every(isWord)) return null;
    if (!isInt(r.i, 0, r.words.length)) return null;
    if (!Array.isArray(r.typed) || r.typed.length !== r.i || !r.typed.every(isTyped)) return null;
    if (!isTyped(r.cur) || (r.i < r.words.length ? r.cur.length > r.words[r.i].length + MAX_EXTRA : r.cur !== '')) return null;
    if (typeof r.started !== 'boolean' || typeof r.over !== 'boolean') return null;
    if (!isNum(r.t, 0, dur) || (!r.started && r.t !== 0)) return null;
    if (r.end !== null && ENDS.indexOf(r.end) < 0) return null;
    if (r.flagged !== null && FLAGS.indexOf(r.flagged) < 0) return null;
    if (r.over !== (r.end !== null) || (r.end === 'flagged') !== (r.flagged !== null)) return null;
    if (!isInt(r.keys, 0, 1e6) || !isInt(r.errors, 0, r.keys)) return null;
    const ints = (a, n) => Array.isArray(a) && a.length === n && a.every((x) => isInt(x, 0, 1e6));
    if (!ints(r.cum, Math.floor(r.t / 1000)) || !ints(r.kps, secs) || !ints(r.eps, secs)) return null;
    if (!isNum(r.lastAt, -1, dur + 1000) || !isInt(r.run, 0, 1e6) || !isInt(r.bursts, 0, r.keys)) return null;
    if (!Array.isArray(r.recent) || r.recent.length > RATE_MAX + 1 || !r.recent.every((x) => isNum(x, 0, dur + 1000))) return null;
    return make({
      mode: r.mode,
      seed: r.seed,
      words: r.words.slice(),
      i: r.i,
      typed: r.typed.slice(),
      cur: r.cur,
      started: r.started,
      t: r.t,
      over: r.over,
      end: r.end,
      flagged: r.flagged,
      keys: r.keys,
      errors: r.errors,
      cum: r.cum.slice(),
      kps: r.kps.slice(),
      eps: r.eps.slice(),
      lastAt: r.lastAt,
      run: r.run,
      bursts: r.bursts,
      recent: r.recent.slice(),
    });
  }

  const api = {
    VERSION, MODES, WORDS_PER_SEC, MAX_EXTRA, BURST_GAP, RUN_MAX, RATE_WINDOW, RATE_MAX,
    rng, genWords, newGame, duration, timeLeft, advance, type, backspace, clearWord,
    correctChars, wordOk, letterStates, charStats, wpm, rawWpm, score, accuracy, chart, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
