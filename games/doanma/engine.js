/* =====================================================================
 * Đoán Mã - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Máy giấu một mã gồm các chốt màu; người chơi đoán từng hàng, mỗi hàng được chấm:
 *   - black (chốt đặc): đúng màu, đúng chỗ
 *   - white (chốt rỗng): đúng màu nhưng sai chỗ (đếm theo số lần màu xuất hiện, không đếm trùng)
 *   Trạng thái ván: { mode, secret, rows: [{ code, black, white }], current: [màu | null], started }
 *   Hàm thuần: nhận trạng thái cũ, trả trạng thái mới (không đổi được thì trả lại đúng đối tượng cũ).
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  // Dễ: 4 chốt, 6 màu, mã không lặp màu, 10 lượt. Khó: 5 chốt, 8 màu, mã có thể lặp, 12 lượt.
  const MODES = {
    easy: { pegs: 4, colors: 6, repeats: false, guesses: 10 },
    hard: { pegs: 5, colors: 8, repeats: true, guesses: 12 },
  };
  const MODE_KEYS = Object.keys(MODES);
  const hasMode = (m) => typeof m === 'string' && Object.prototype.hasOwnProperty.call(MODES, m);

  /** PRNG mulberry32: cùng seed cho cùng dãy số trong [0, 1). */
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

  /** Chấm một lần đoán: black = trùng vị trí; white = tổng min(số lần màu trong mã, trong lần đoán) trừ black. */
  function score(secret, guess) {
    let black = 0;
    let common = 0;
    const left = new Map(); // số chốt mỗi màu của mã chưa được ghép
    for (let i = 0; i < secret.length; i++) {
      if (secret[i] === guess[i]) black++;
      left.set(secret[i], (left.get(secret[i]) || 0) + 1);
    }
    for (let i = 0; i < guess.length; i++) {
      const n = left.get(guess[i]);
      if (n) {
        common++;
        left.set(guess[i], n - 1);
      }
    }
    return { black, white: common - black };
  }

  /** Mã bí mật ngẫu nhiên theo luật mode. Không lặp: xáo bảng màu (Fisher-Yates) rồi lấy đầu dãy. */
  function makeSecret(mode, rand) {
    const m = MODES[mode];
    if (m.repeats) return Array.from({ length: m.pegs }, () => Math.floor(rand() * m.colors));
    const pool = Array.from({ length: m.colors }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const x = pool[i];
      pool[i] = pool[j];
      pool[j] = x;
    }
    return pool.slice(0, m.pegs);
  }

  function newGame(mode, seed) {
    if (!hasMode(mode)) throw new Error('unknown mode ' + mode);
    return {
      mode,
      secret: makeSecret(mode, rng(seed)),
      rows: [],
      current: new Array(MODES[mode].pegs).fill(null),
      started: false,
    };
  }

  function status(g) {
    const last = g.rows[g.rows.length - 1];
    if (last && last.black === MODES[g.mode].pegs) return 'won';
    if (g.rows.length >= MODES[g.mode].guesses) return 'lost';
    return 'play';
  }
  const isOver = (g) => status(g) !== 'play';
  const guessesLeft = (g) => MODES[g.mode].guesses - g.rows.length;
  const isFull = (g) => g.current.every((c) => c !== null);

  /** Màu c có điền được vào hàng đang nhập không (đúng bảng màu, còn ô trống, Dễ thì chưa có trong hàng). */
  function canPlace(g, c) {
    const m = MODES[g.mode];
    if (isOver(g) || !Number.isInteger(c) || c < 0 || c >= m.colors || isFull(g)) return false;
    return m.repeats || g.current.indexOf(c) < 0;
  }

  const withCurrent = (g, current, started) => ({ mode: g.mode, secret: g.secret, rows: g.rows, current, started });

  /** Điền màu vào ô trống đầu tiên; lần điền đầu tiên đánh dấu ván đã bắt đầu. */
  function place(g, c) {
    if (!canPlace(g, c)) return g;
    const current = g.current.slice();
    current[current.indexOf(null)] = c;
    return withCurrent(g, current, true);
  }

  /** Xóa chốt ở ô i của hàng đang nhập. */
  function clear(g, i) {
    if (isOver(g) || !Number.isInteger(i) || i < 0 || i >= g.current.length || g.current[i] === null) return g;
    const current = g.current.slice();
    current[i] = null;
    return withCurrent(g, current, g.started);
  }

  /** Xóa chốt đã điền ở ô xa nhất bên phải (phím Backspace). */
  function backspace(g) {
    for (let i = g.current.length - 1; i >= 0; i--) if (g.current[i] !== null) return clear(g, i);
    return g;
  }

  /** Nộp hàng đang nhập (phải đầy): chấm điểm, thêm vào danh sách, mở hàng mới. */
  function submit(g) {
    if (isOver(g) || !isFull(g)) return g;
    const code = g.current.slice();
    const row = Object.assign({ code }, score(g.secret, code));
    return withCurrent(Object.assign({}, g, { rows: g.rows.concat([row]) }), new Array(code.length).fill(null), true);
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  // Lưu mã của từng lần đoán; phản hồi được chấm lại khi khôi phục (không tin dữ liệu lưu).
  const toJSON = (g) => ({
    v: VERSION,
    mode: g.mode,
    secret: g.secret.slice(),
    rows: g.rows.map((r) => r.code.slice()),
    current: g.current.slice(),
    started: g.started,
  });

  const isColor = (c, m) => Number.isInteger(c) && c >= 0 && c < m.colors;
  const isCode = (code, m) => Array.isArray(code) && code.length === m.pegs && code.every((c) => isColor(c, m));
  const noDup = (arr) => {
    const xs = arr.filter((c) => c !== null);
    return new Set(xs).size === xs.length;
  };

  /** Ván lưu hỏng, sai luật hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION || !hasMode(raw.mode)) return null;
    const m = MODES[raw.mode];
    const { secret, rows, current, started } = raw;
    if (!isCode(secret, m) || (!m.repeats && !noDup(secret))) return null;
    if (!Array.isArray(rows) || rows.length > m.guesses || !rows.every((r) => isCode(r, m))) return null;
    if (!Array.isArray(current) || current.length !== m.pegs) return null;
    if (!current.every((c) => c === null || isColor(c, m)) || (!m.repeats && !noDup(current))) return null;
    if (typeof started !== 'boolean' || (!started && (rows.length > 0 || current.some((c) => c !== null)))) return null;
    const g = { mode: raw.mode, secret: secret.slice(), rows: [], current: current.slice(), started };
    for (let i = 0; i < rows.length; i++) {
      if (i > 0 && status(g) !== 'play') return null; // còn lần đoán sau khi ván đã xong
      g.rows.push(Object.assign({ code: rows[i].slice() }, score(secret, rows[i])));
    }
    if (status(g) !== 'play' && current.some((c) => c !== null)) return null;
    return g;
  }

  const api = { VERSION, MODES, MODE_KEYS, rng, score, newGame, status, isOver, guessesLeft, isFull, canPlace, place, clear, backspace, submit, toJSON, fromJSON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
