/* =====================================================================
 * Cờ Tào Cáo (Backgammon) - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Chạy trong trình duyệt (window.GameEngine), trong Node (module.exports) và trong Web Worker:
 *   toàn bộ engine nằm trong hàm BackgammonFactory để app.js dựng lại mã nguồn cho worker
 *   qua GameEngine.factory.toString().
 *
 * Biểu diễn: mỗi bên một mảng 26 số đếm quân theo góc nhìn của chính bên đó
 *   - a[1..24]: điểm 1..24 (bên đó đi từ 24 về 1, nhà là 1..6)
 *   - a[25]: quân trên thanh (bar), a[0]: quân đã gỡ (bear off)
 *   - Điểm k của bên này là điểm 25 - k của bên kia
 *   - HUMAN = 0 (người chơi, quân trắng), AI = 1 (máy, quân đen)
 * Luật: gieo 2 xúc xắc (đôi thì đi 4 lần), phải dùng tối đa số xúc xắc có thể; chỉ dùng được một con
 *   thì phải dùng con lớn hơn nếu được; có quân trên bar thì phải vào lại trước; điểm có ≥ 2 quân đối thủ
 *   bị chặn; đáp xuống điểm có đúng 1 quân đối thủ (blot) thì đánh quân đó lên bar; gỡ quân khi cả 15 quân
 *   đã ở nhà (số lớn hơn khoảng cách chỉ gỡ được quân xa nhất). Hết ván: thắng thường 1, gammon 2
 *   (đối thủ chưa gỡ quân nào), backgammon 3 (thêm: còn quân trên bar hoặc trong nhà bên thắng).
 * Ván đầu: mỗi bên gieo một con (đều thì gieo lại), bên cao hơn đi trước bằng chính hai số đó.
 * Máy: sinh mọi chuỗi nước khác nhau cho một lần gieo rồi chấm vị trí bằng heuristic
 *   (pip, blot bị lộ tính theo số cách gieo đánh trúng trong 36, điểm đã chiếm, prime, bàn nhà,
 *   quân trên bar). Dễ: heuristic thô + nhiễu lớn; Vừa: heuristic đầy đủ; Khó: lọc vài ứng viên
 *   tốt nhất rồi nhìn trước 1 lượt theo 21 kết quả gieo của đối thủ (đối thủ đáp bằng heuristic Vừa).
 * ===================================================================== */
function BackgammonFactory() {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const LEVELS = ['easy', 'medium', 'hard'];
  const HUMAN = 0, AI = 1;
  const BAR = 25, OFF = 0, CHECKERS = 15;
  const HARD_TOP = 6; // số ứng viên mức Khó xét sâu thêm 1 lượt

  /* ---------------- PRNG (mulberry32) ---------------- */
  function rng(seed) {
    let s = 0;
    if (typeof seed === 'number') s = seed >>> 0;
    else {
      const str = String(seed == null ? Date.now() + ':' + Math.random() : seed);
      for (let i = 0; i < str.length; i++) s = (Math.imul(s ^ str.charCodeAt(i), 2654435761) + 1) >>> 0;
    }
    const r = function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (n) => Math.floor(r() * n);
    r.getState = () => s;
    r.setState = (v) => { s = v >>> 0; };
    return r;
  }
  const isDie = (d) => Number.isInteger(d) && d >= 1 && d <= 6;
  const rollDie = (r) => 1 + r.int(6);
  const rollDice = (r) => [rollDie(r), rollDie(r)];

  /** 21 kết quả gieo khác nhau [a, b, số cách trong 36] (đôi 1, còn lại 2). */
  const ROLLS = [];
  for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) ROLLS.push([a, b, a === b ? 1 : 2]);

  /* ---------------- Vị trí ---------------- */
  function startPoints() {
    const a = new Array(26).fill(0);
    a[24] = 2;
    a[13] = 5;
    a[8] = 3;
    a[6] = 5;
    return a;
  }
  function pip(a) {
    let s = 0;
    for (let k = 1; k <= 25; k++) s += a[k] * k;
    return s;
  }
  /** Mọi quân đã về nhà (1..6) hoặc đã gỡ: được gỡ quân. */
  function allHome(a) {
    for (let k = 7; k <= 25; k++) if (a[k]) return false;
    return true;
  }
  /** Điểm đến khi đi quân ở p bằng xúc xắc d (0 = gỡ quân), -1 nếu không đi được. */
  function target(me, op, p, d) {
    if (!me[p]) return -1;
    if (me[BAR] && p !== BAR) return -1;
    const q = p - d;
    if (q >= 1) return op[25 - q] >= 2 ? -1 : q;
    if (!allHome(me)) return -1;
    if (q === 0) return 0;
    for (let k = p + 1; k <= 6; k++) if (me[k]) return -1; // số dư chỉ gỡ được quân xa nhất
    return 0;
  }
  /** Đi một bước trên bản sao: trả [me, op, hit]. */
  function applyRaw(me, op, p, q) {
    const m = me.slice();
    const o = op.slice();
    let hit = 0;
    m[p]--;
    if (q === 0) m[0]++;
    else {
      if (o[25 - q] === 1) {
        o[25 - q] = 0;
        o[BAR]++;
        hit = 1;
      }
      m[q]++;
    }
    return [m, o, hit];
  }
  const expand = (dice) => (dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]]);
  function keyOf(me, op) {
    let s = '';
    for (let k = 0; k < 26; k++) s += String.fromCharCode(65 + me[k], 65 + op[k]);
    return s;
  }

  /** Số bước tối đa đi được với các xúc xắc còn lại (dừng sớm khi đã dùng hết). */
  function maxPlayable(me, op, left) {
    if (!left.length) return 0;
    let best = 0;
    for (let i = 0; i < left.length; i++) {
      const d = left[i];
      if (left.indexOf(d) < i) continue; // mỗi giá trị xét một lần
      const rest = left.slice(0, i).concat(left.slice(i + 1));
      for (let p = BAR; p >= 1; p--) {
        if (!me[p]) continue;
        const q = target(me, op, p, d);
        if (q < 0) continue;
        const [m2, o2] = applyRaw(me, op, p, q);
        const v = 1 + maxPlayable(m2, o2, rest);
        if (v > best) {
          best = v;
          if (best === left.length) return best;
        }
      }
    }
    return best;
  }

  /**
   * Mọi cách đi trọn một lần gieo, mỗi vị trí cuối một lần: [{ steps: [[from, to, die, hit]…], me, op }]
   * (me là bên đi). Đã áp luật dùng tối đa số xúc xắc và luật con lớn hơn.
   * Không đi được gì: một phần tử với steps rỗng.
   */
  function sequences(me, op, dice) {
    const out = new Map();
    let maxLen = 0;
    const dbl = dice[0] === dice[1];
    const orders = dbl ? [expand(dice)] : [[dice[0], dice[1]], [dice[1], dice[0]]];
    const steps = [];
    function rec(m, o, left, idx, top) {
      let moved = false;
      if (idx < left.length) {
        const d = left[idx];
        // Đôi: chỉ xét nguồn không tăng dần (mọi vị trí cuối vẫn đạt được), bớt trùng lặp
        for (let p = dbl ? top : BAR; p >= 1; p--) {
          if (!m[p]) continue;
          const q = target(m, o, p, d);
          if (q < 0) continue;
          moved = true;
          const [m2, o2, hit] = applyRaw(m, o, p, q);
          steps.push([p, q, d, hit]);
          rec(m2, o2, left, idx + 1, p);
          steps.pop();
        }
      }
      if (moved) return;
      const n = steps.length;
      if (n < maxLen) return;
      if (n > maxLen) {
        maxLen = n;
        out.clear();
      }
      const key = keyOf(m, o);
      const old = out.get(key);
      // Cùng vị trí cuối: giữ cách dùng con lớn hơn (cần cho luật con lớn hơn khi chỉ đi được 1 bước)
      if (!old || (n === 1 && steps[0][2] > old.steps[0][2])) out.set(key, { steps: steps.map((s) => s.slice()), me: m, op: o });
    }
    for (const ord of orders) rec(me, op, ord, 0, BAR);
    let list = Array.from(out.values());
    if (maxLen === 1 && !dbl) {
      const hi = Math.max(dice[0], dice[1]);
      if (list.some((s) => s.steps[0][2] === hi)) list = list.filter((s) => s.steps[0][2] === hi);
    }
    return list;
  }

  /* ---------------- Ván ----------------
   * g: { pts: [a0, a1] (hiện tại), base: [a0, a1] (đầu lượt), turn, dice: [a, b] | null,
   *      steps: [{ from, to, die, hit }], maxLen, mustDie, over, winner, result, opening: [người, máy], ties, turns } */
  const clonePts = (pts) => [pts[0].slice(), pts[1].slice()];

  /** opts: { rng } (gieo mở ván, đều thì gieo lại) hoặc { opening: [người, máy] } (test). */
  function newGame(opts) {
    const o = opts || {};
    let h, a;
    let ties = 0;
    if (o.opening) {
      h = o.opening[0];
      a = o.opening[1];
      if (!isDie(h) || !isDie(a) || h === a) throw new Error('bad opening');
    } else {
      const r = o.rng || rng();
      for (;;) {
        h = rollDie(r);
        a = rollDie(r);
        if (h !== a) break;
        ties++;
      }
    }
    const g = {
      pts: [startPoints(), startPoints()], base: null, turn: h > a ? HUMAN : AI, dice: null, steps: [],
      maxLen: 0, mustDie: 0, over: false, winner: -1, result: 0, opening: [h, a], ties, turns: 0,
    };
    return setDice(g, [h, a]);
  }

  /** Bắt đầu lượt với hai xúc xắc vừa gieo: tính số bước phải đi và con bắt buộc (luật con lớn hơn). */
  function setDice(g, dice) {
    if (!g || g.over || g.dice || !Array.isArray(dice) || dice.length !== 2 || !isDie(dice[0]) || !isDie(dice[1])) return null;
    const me = g.pts[g.turn], op = g.pts[1 - g.turn];
    const maxLen = maxPlayable(me, op, expand(dice));
    let mustDie = 0;
    if (maxLen === 1 && dice[0] !== dice[1]) {
      const hi = Math.max(dice[0], dice[1]);
      let canHi = false;
      for (let p = BAR; p >= 1 && !canHi; p--) if (target(me, op, p, hi) >= 0) canHi = true;
      mustDie = canHi ? hi : Math.min(dice[0], dice[1]);
    }
    return Object.assign({}, g, { base: clonePts(g.pts), dice: dice.slice(), steps: [], maxLen, mustDie });
  }

  /** Xúc xắc chưa dùng của lượt này. */
  function remaining(g) {
    if (!g.dice) return [];
    const left = expand(g.dice);
    for (const s of g.steps) left.splice(left.indexOf(s.die), 1);
    return left;
  }

  /** Các bước đơn hợp lệ ngay lúc này (sau bước đó vẫn đi tiếp được đủ số bước tối đa). */
  function legalSteps(g) {
    if (g.over || !g.dice) return [];
    const need = g.maxLen - g.steps.length;
    if (need <= 0) return [];
    const left = remaining(g);
    const me = g.pts[g.turn], op = g.pts[1 - g.turn];
    const res = [];
    for (let i = 0; i < left.length; i++) {
      const d = left[i];
      if (left.indexOf(d) < i) continue;
      if (g.mustDie && d !== g.mustDie) continue;
      const rest = left.slice(0, i).concat(left.slice(i + 1));
      for (let p = BAR; p >= 1; p--) {
        if (!me[p]) continue;
        const q = target(me, op, p, d);
        if (q < 0) continue;
        const [m2, o2, hit] = applyRaw(me, op, p, q);
        if (1 + maxPlayable(m2, o2, rest) >= need) res.push({ from: p, to: q, die: d, hit: !!hit });
      }
    }
    return res;
  }

  /** Kết quả khi bên `w` vừa gỡ hết: 1 thường, 2 gammon, 3 backgammon. */
  function resultOf(pts, w) {
    const l = pts[1 - w];
    if (l[OFF] > 0) return 1;
    for (let k = 19; k <= 25; k++) if (l[k]) return 3; // còn quân trên bar hoặc trong nhà bên thắng
    return 2;
  }

  /** Đi một bước (phải nằm trong legalSteps), trả ván mới hoặc null nếu sai luật. */
  function applyStep(g, step) {
    if (!step) return null;
    const ok = legalSteps(g).find((s) => s.from === step.from && s.to === step.to && s.die === step.die);
    if (!ok) return null;
    const me = g.pts[g.turn], op = g.pts[1 - g.turn];
    const [m2, o2] = applyRaw(me, op, ok.from, ok.to);
    const pts = g.turn === HUMAN ? [m2, o2] : [o2, m2];
    const n = Object.assign({}, g, { pts, steps: g.steps.concat([ok]) });
    if (m2[OFF] === CHECKERS) {
      n.over = true;
      n.winner = g.turn;
      n.result = resultOf(pts, g.turn);
    }
    return n;
  }

  /** Đi lại từ đầu lượt theo danh sách bước (null nếu có bước sai luật). */
  function replay(g, steps) {
    if (!g.dice) return g;
    let n = Object.assign({}, g, { pts: clonePts(g.base), steps: [], over: false, winner: -1, result: 0 });
    for (const s of steps) {
      n = applyStep(n, s);
      if (!n) return null;
    }
    return n;
  }
  /** Bỏ bước vừa đi trong lượt. */
  function undoStep(g) {
    if (g.over || !g.steps.length) return g;
    return replay(g, g.steps.slice(0, -1));
  }

  /** Đã đi đủ số bước tối đa: được kết thúc lượt. */
  const turnDone = (g) => !!g.dice && !g.over && g.steps.length >= g.maxLen;

  function endTurn(g) {
    if (!turnDone(g)) return null;
    return Object.assign({}, g, { turn: 1 - g.turn, dice: null, base: null, steps: [], maxLen: 0, mustDie: 0, turns: g.turns + 1 });
  }

  /** Đi trọn một chuỗi bước [[from, to, die]…] rồi kết thúc lượt nếu ván chưa xong. */
  function playSequence(g, steps) {
    let n = g;
    for (const s of steps) {
      n = applyStep(n, { from: s[0], to: s[1], die: s[2] });
      if (!n) return null;
    }
    return n.over ? n : endTurn(n);
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  function toJSON(g) {
    return {
      v: VERSION,
      pts: clonePts(g.dice ? g.base : g.pts),
      turn: g.turn,
      dice: g.dice ? g.dice.slice() : null,
      steps: g.steps.map((s) => [s.from, s.to, s.die]),
      opening: g.opening.slice(),
      turns: g.turns,
    };
  }

  function validPts(pts) {
    if (!Array.isArray(pts) || pts.length !== 2) return false;
    for (const a of pts) {
      if (!Array.isArray(a) || a.length !== 26) return false;
      let sum = 0;
      for (const c of a) {
        if (!Number.isInteger(c) || c < 0 || c > CHECKERS) return false;
        sum += c;
      }
      if (sum !== CHECKERS) return false;
    }
    for (let k = 1; k <= 24; k++) if (pts[0][k] && pts[1][25 - k]) return false; // một điểm chỉ một màu
    return true;
  }

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    try {
      if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
      if (!validPts(raw.pts) || (raw.turn !== HUMAN && raw.turn !== AI)) return null;
      const op = raw.opening;
      if (!Array.isArray(op) || op.length !== 2 || !isDie(op[0]) || !isDie(op[1]) || op[0] === op[1]) return null;
      if (!Number.isInteger(raw.turns) || raw.turns < 0 || !Array.isArray(raw.steps)) return null;
      if (raw.pts[0][OFF] === CHECKERS || raw.pts[1][OFF] === CHECKERS) return null; // ván đã xong thì không lưu
      let g = {
        pts: clonePts(raw.pts), base: null, turn: raw.turn, dice: null, steps: [], maxLen: 0, mustDie: 0,
        over: false, winner: -1, result: 0, opening: op.slice(), ties: 0, turns: raw.turns,
      };
      if (raw.dice === null || raw.dice === undefined) return raw.steps.length ? null : g;
      g = setDice(g, raw.dice);
      if (!g) return null;
      for (const s of raw.steps) {
        if (!Array.isArray(s) || s.length !== 3) return null;
        g = applyStep(g, { from: s[0], to: s[1], die: s[2] });
        if (!g) return null;
      }
      return g;
    } catch (e) {
      return null;
    }
  }

  /* ---------------- Blot bị lộ ----------------
   * Quân tấn công tính theo tọa độ của bên đánh (op): quân ở q đánh blot của me ở điểm p (tọa độ op 25 - p)
   * khi đi đúng d = q - (25 - p) bằng một con, tổng hai con (một trong hai điểm giữa còn mở) hoặc bội của đôi. */
  function attackers(op) {
    if (op[BAR]) return [BAR]; // còn quân trên bar thì phải vào trước: chỉ quân trên bar đánh được
    const att = [];
    for (let q = 24; q >= 1; q--) if (op[q]) att.push(q);
    return att;
  }
  function hitsWith(me, att, t, a, b) {
    const open = (x) => me[25 - x] < 2; // điểm x (tọa độ op) không bị me chặn
    for (let i = 0; i < att.length; i++) {
      const q = att[i];
      const d = q - t;
      if (d <= 0) continue;
      if (a === b) {
        if (d % a !== 0 || d / a > 4) continue;
        let clear = true;
        for (let s = 1; s < d / a; s++) {
          if (!open(q - s * a)) {
            clear = false;
            break;
          }
        }
        if (clear) return true;
      } else if (d === a || d === b) return true;
      else if (d === a + b && (open(q - a) || open(q - b))) return true;
    }
    return false;
  }
  /** Số cách gieo (trong 36) đánh trúng quân của me ở điểm p. */
  function shots(me, op, p) {
    const att = attackers(op);
    let n = 0;
    for (const [a, b, w] of ROLLS) if (hitsWith(me, att, 25 - p, a, b)) n += w;
    return n;
  }
  /** Kỳ vọng mất mát vì blot của me bị đánh trong lượt tới của op (đơn vị pip; mỗi cách gieo tính blot đắt nhất). */
  function exposure(me, op, opHome) {
    const blots = [];
    for (let k = 1; k <= 24; k++) if (me[k] === 1) blots.push(k);
    if (!blots.length) return 0;
    const att = attackers(op);
    const mult = 1 + 0.12 * opHome;
    blots.sort((x, y) => x - y); // điểm thấp = đi xa hơn = mất nhiều hơn khi bị đánh
    let total = 0;
    for (const [a, b, w] of ROLLS) {
      for (const p of blots) {
        if (hitsWith(me, att, 25 - p, a, b)) {
          total += (25 - p + 4) * mult * w;
          break;
        }
      }
    }
    return total / 36;
  }

  /* ---------------- Đánh giá vị trí ----------------
   * evaluate(me, op): điểm (đơn vị ≈ pip) cho bên me vừa đi xong, tới lượt op gieo. Cao hơn = tốt hơn cho me. */
  // Giá trị một điểm đã chiếm (≥ 2 quân) theo số điểm của bên đó
  const PV = [0, 0.4, 1.3, 2.1, 2.9, 3.9, 3.6, 3.3, 1.8, 1.2, 0.8, 0.6, 0.4, 0.3, 0.2, 0.2, 0.2, 0.4, 0.9, 1.2, 2.2, 1.8, 0.8, 0.5, 0.4, 0];
  const PRIME = [0, 0, 0.6, 2, 4.5, 8, 13];

  function backOf(a) {
    for (let k = 25; k >= 1; k--) if (a[k]) return k;
    return 0;
  }
  const inContact = (me, op) => backOf(me) + backOf(op) > 25;

  function evaluate(me, op) {
    if (me[OFF] === CHECKERS) return 1000;
    if (op[OFF] === CHECKERS) return -1000;
    let s = pip(op) - pip(me);
    if (!inContact(me, op)) {
      // Đua thuần: pip là chính, cộng số quân đã gỡ (mỗi quân còn lại cần ít nhất một con xúc xắc)
      return s + (me[OFF] - op[OFF]) * 1.2 - 4;
    }
    const ob = backOf(op);
    let myHome = 0, opHome = 0;
    for (let k = 1; k <= 24; k++) {
      if (me[k] >= 2) {
        s += PV[k];
        if (k <= 6) myHome++;
      }
      if (op[k] >= 2) {
        s -= PV[k] * 0.8;
        if (k <= 6) opHome++;
      }
      if (k <= 12 && me[k] > 3) s -= (me[k] - 3) * 0.45; // chồng quá cao
    }
    // Prime (chuỗi điểm liền nhau) có quân đối thủ kẹt phía sau: quân sau cùng của op ở điểm 25 - ob của me
    let run = 0, bestRun = 0;
    for (let k = 1; k <= 12; k++) {
      if (me[k] >= 2) {
        run++;
        if (25 - ob < k - run + 1) bestRun = Math.max(bestRun, run);
      } else run = 0;
    }
    s += PRIME[Math.min(6, bestRun)];
    // Quân trên bar: khó vào lại khi bàn nhà bên kia nhiều điểm
    s += op[BAR] * (2 + myHome * myHome * 0.4);
    s -= me[BAR] * (2 + opHome * opHome * 0.4);
    s -= exposure(me, op, opHome);
    return s;
  }

  /** Heuristic thô của mức Dễ: pip, số điểm chiếm, số blot (không xét ai đánh được). */
  function evaluateEasy(me, op) {
    if (me[OFF] === CHECKERS) return 1000;
    let s = pip(op) - pip(me);
    for (let k = 1; k <= 24; k++) {
      if (me[k] >= 2) s += 1.2;
      else if (me[k] === 1) s -= 1.5;
    }
    return s;
  }

  /* ---------------- Máy ---------------- */
  /** Giá trị trung bình sau 21 cách gieo của đối thủ (đối thủ đáp bằng heuristic Vừa), theo góc nhìn me. */
  function lookahead(me, op) {
    let total = 0;
    for (const [a, b, w] of ROLLS) {
      const seqs = sequences(op, me, [a, b]);
      let best = -Infinity;
      for (const sq of seqs) {
        const v = evaluate(sq.me, sq.op);
        if (v > best) best = v;
        if (v >= 1000) break;
      }
      total += -best * w;
    }
    return total / 36;
  }

  /**
   * Lên kế hoạch cho lượt hiện tại (tính từ đầu lượt). Trả { done, run(deadline, now), best() }:
   * mức Khó tính dần từng ứng viên (run dừng khi quá deadline) để không đơ giao diện.
   */
  function planMove(g, opts) {
    const o = opts || {};
    const level = LEVELS.indexOf(o.level) >= 0 ? o.level : 'medium';
    const r = rng(o.seed == null ? 1 : o.seed);
    const fixed = (steps) => ({ done: true, run() {}, best: () => steps.map((s) => s.slice(0, 3)) });
    const base = g.steps.length ? replay(g, []) : g;
    if (!base || !base.dice || base.over) return fixed([]);
    const seqs = sequences(base.pts[g.turn], base.pts[1 - g.turn], base.dice);
    if (!seqs[0].steps.length) return fixed([]);
    if (seqs.length === 1) return fixed(seqs[0].steps);
    if (level === 'easy') {
      let best = null, bv = -Infinity;
      for (const sq of seqs) {
        const v = evaluateEasy(sq.me, sq.op) + (r() - 0.5) * 14;
        if (v > bv) {
          bv = v;
          best = sq;
        }
      }
      return fixed(best.steps);
    }
    const scored = seqs.map((sq) => ({ sq, v: evaluate(sq.me, sq.op) + r() * 0.01 }));
    scored.sort((x, y) => y.v - x.v);
    if (level === 'medium' || scored[0].v >= 1000) return fixed(scored[0].sq.steps);
    // Khó: xét sâu vài ứng viên tốt nhất; hết tiếp xúc (đua thuần) thì heuristic đã đủ
    const cands = scored.slice(0, HARD_TOP);
    if (!cands.some((c) => inContact(c.sq.me, c.sq.op))) return fixed(scored[0].sq.steps);
    let i = 0, bestIdx = 0, bestV = -Infinity;
    const plan = {
      done: false,
      run(deadline, now) {
        while (i < cands.length) {
          const c = cands[i];
          const v = lookahead(c.sq.me, c.sq.op) + r() * 0.01;
          if (v > bestV) {
            bestV = v;
            bestIdx = i;
          }
          i++;
          if (deadline != null && now() >= deadline) break;
        }
        plan.done = i >= cands.length;
      },
      best: () => cands[bestIdx].sq.steps.map((s) => s.slice(0, 3)),
    };
    return plan;
  }

  /** Chọn trọn chuỗi bước cho lượt hiện tại: [[from, to, die]…] (rỗng nếu không đi được). */
  function chooseMove(g, opts) {
    const plan = planMove(g, opts);
    while (!plan.done) plan.run(null);
    return plan.best();
  }

  return {
    VERSION, LEVELS, HUMAN, AI, BAR, OFF, CHECKERS, ROLLS,
    rng, isDie, rollDie, rollDice, startPoints, pip, allHome, target, applyRaw, expand, maxPlayable, sequences,
    newGame, setDice, remaining, legalSteps, applyStep, undoStep, replay, turnDone, endTurn, playSequence, resultOf,
    toJSON, fromJSON, shots, exposure, evaluate, evaluateEasy, inContact, lookahead, planMove, chooseMove,
  };
}

(function (root) {
  const api = BackgammonFactory();
  api.factory = BackgammonFactory; // để app.js dựng Web Worker từ mã nguồn
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root) root.GameEngine = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
