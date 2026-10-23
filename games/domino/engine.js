/* =====================================================================
 * Đô-mi-nô - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Domino bốc (Draw dominoes), bộ đôi-sáu 28 quân, 2 người: người chơi 0 (bạn) và 1 (máy).
 *   - Mỗi bên bốc 7 quân, 14 quân còn lại là nọc. Ai giữ quân đôi lớn nhất thì đánh quân đó mở ván
 *     (không ai có quân đôi thì quân lớn nhất: tổng chấm cao nhất, rồi đầu lớn nhất).
 *   - Quân phải khớp một trong hai đầu dây. Không đánh được thì bốc nọc tới khi đánh được; nọc hết thì bỏ lượt.
 *   - Hết quân trước: ăn tổng chấm còn trên tay đối thủ. Tắc (nọc hết, không ai đánh được): ít chấm hơn thắng,
 *     ăn phần chênh lệch; bằng nhau thì không ai được điểm.
 *   - Trận chơi tới `target` điểm (50 / 100 / 150).
 *   Hàm thuần: trạng thái cũ vào, trạng thái mới ra (null nếu nước không hợp lệ); toJSON / fromJSON để lưu ván.
 *   Chia bài bằng PRNG mulberry32 có seed; trạng thái PRNG nằm trong ván nên lưu / mở lại không đổi các ván sau.
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const TARGETS = [50, 100, 150];
  const HAND_SIZE = 7;

  // 28 quân [a, b] với a <= b; mã quân là vị trí trong mảng (0 = [0|0] … 27 = [6|6])
  const TILES = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) TILES.push([a, b]);
  const DOUBLE_ID = [0, 1, 2, 3, 4, 5, 6].map((d) => TILES.findIndex((t) => t[0] === d && t[1] === d));

  const isDouble = (id) => TILES[id][0] === TILES[id][1];
  const tilePips = (id) => TILES[id][0] + TILES[id][1];
  const sumPips = (ids) => ids.reduce((s, id) => s + tilePips(id), 0);
  const hasSuit = (id, v) => TILES[id][0] === v || TILES[id][1] === v;
  const byId = (a, b) => a - b;
  const noLacks = () => [false, false, false, false, false, false, false];

  /* ---------------- PRNG ---------------- */
  /** Một bước mulberry32: trả [số trong [0, 1), trạng thái mới] */
  function rngStep(state) {
    const a = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a >>> 0];
  }
  /** Hàm sinh số ngẫu nhiên có seed (cho máy và cho test) */
  function mulberry32(seed) {
    let s = seed >>> 0;
    return () => {
      const r = rngStep(s);
      s = r[1];
      return r[0];
    };
  }

  /* ---------------- Chia bài ---------------- */
  /** Quân mở ván: quân đôi lớn nhất trên hai tay; không có thì quân lớn nhất (tổng chấm, rồi đầu lớn). */
  function leadTile(hands) {
    for (let d = 6; d >= 0; d--) {
      const id = DOUBLE_ID[d];
      if (hands[0].indexOf(id) >= 0 || hands[1].indexOf(id) >= 0) return id;
    }
    let best = -1;
    hands[0].concat(hands[1]).forEach((id) => {
      if (best < 0 || tilePips(id) > tilePips(best) || (tilePips(id) === tilePips(best) && TILES[id][1] > TILES[best][1])) best = id;
    });
    return best;
  }

  /** Chia một ván (hand) mới; giữ điểm trận. */
  function dealHand(base) {
    let seed = base.seed >>> 0;
    const deck = TILES.map((_, i) => i);
    for (let i = deck.length - 1; i > 0; i--) {
      const r = rngStep(seed);
      seed = r[1];
      const j = Math.floor(r[0] * (i + 1));
      const x = deck[i];
      deck[i] = deck[j];
      deck[j] = x;
    }
    const hands = [deck.slice(0, HAND_SIZE).sort(byId), deck.slice(HAND_SIZE, 2 * HAND_SIZE).sort(byId)];
    const lead = leadTile(hands);
    return {
      target: base.target,
      seed,
      handNo: base.handNo,
      scores: base.scores.slice(),
      hands,
      boneyard: deck.slice(2 * HAND_SIZE),
      line: [],
      turn: hands[0].indexOf(lead) >= 0 ? 0 : 1,
      lead,
      lacks: [noLacks(), noLacks()],
      phase: 'play',
      result: null,
      winner: -1,
    };
  }

  /** Trận mới: { target: 50 | 100 | 150, seed } */
  function newMatch(opts) {
    const o = opts || {};
    const target = TARGETS.indexOf(o.target) >= 0 ? o.target : 100;
    const seed = Number.isInteger(o.seed) ? o.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
    return dealHand({ target, seed, handNo: 1, scores: [0, 0] });
  }

  /** Ván (hand) tiếp theo sau khi ván trước đã tính điểm (trận chưa xong) */
  function nextHand(s) {
    if (s.phase !== 'hand') return null;
    return dealHand({ target: s.target, seed: s.seed, handNo: s.handNo + 1, scores: s.scores });
  }

  /* ---------------- Luật ---------------- */
  /** Hai đầu dây { L, R }; dây trống thì null */
  function ends(s) {
    if (!s.line.length) return null;
    return { L: s.line[0].l, R: s.line[s.line.length - 1].r };
  }

  /** Quân `id` khớp đầu nào: mảng 'L' / 'R' (dây trống: chỉ quân mở ván, ghi là đầu 'L') */
  function fitsOf(s, id) {
    const e = ends(s);
    if (!e) return id === s.lead ? ['L'] : [];
    const out = [];
    if (hasSuit(id, e.L)) out.push('L');
    if (hasSuit(id, e.R)) out.push('R');
    return out;
  }

  /** Mọi nước đánh hợp lệ của người chơi p (mặc định người tới lượt): [{ tile, end }] */
  function legalPlays(s, p) {
    const who = p == null ? s.turn : p;
    if (s.phase !== 'play') return [];
    const out = [];
    s.hands[who].forEach((id) => fitsOf(s, id).forEach((end) => out.push({ tile: id, end })));
    return out;
  }
  const canPlay = (s, p) => legalPlays(s, p).length > 0;
  /** Người tới lượt phải bốc (không quân nào khớp, nọc còn) */
  const mustDraw = (s) => s.phase === 'play' && s.line.length > 0 && !canPlay(s) && s.boneyard.length > 0;
  /** Người tới lượt phải bỏ lượt (không quân nào khớp, nọc hết) */
  const mustPass = (s) => s.phase === 'play' && s.line.length > 0 && !canPlay(s) && s.boneyard.length === 0;

  /** Các nước hợp lệ cho người tới lượt: [{ type: 'play', tile, end }] hoặc [{ type: 'draw' }] hoặc [{ type: 'pass' }] */
  function legalMoves(s) {
    if (s.phase !== 'play') return [];
    const plays = legalPlays(s).map((m) => ({ type: 'play', tile: m.tile, end: m.end }));
    if (plays.length) return plays;
    if (mustDraw(s)) return [{ type: 'draw' }];
    if (mustPass(s)) return [{ type: 'pass' }];
    return [];
  }

  function isLegal(s, m) {
    if (!m || typeof m !== 'object') return false;
    return legalMoves(s).some((x) => x.type === m.type && (x.type !== 'play' || (x.tile === m.tile && x.end === m.end)));
  }

  function clone(s) {
    return {
      target: s.target,
      seed: s.seed,
      handNo: s.handNo,
      scores: s.scores.slice(),
      hands: [s.hands[0].slice(), s.hands[1].slice()],
      boneyard: s.boneyard.slice(),
      line: s.line.map((t) => ({ id: t.id, l: t.l, r: t.r })),
      turn: s.turn,
      lead: s.lead,
      lacks: [s.lacks[0].slice(), s.lacks[1].slice()],
      phase: s.phase,
      result: s.result ? { winner: s.result.winner, reason: s.result.reason, points: s.result.points, pips: s.result.pips.slice() } : null,
      winner: s.winner,
    };
  }

  /** Đặt quân vào dây: quay quân để hai chấm chạm nhau bằng nhau */
  function placeOnLine(line, id, end) {
    const [a, b] = TILES[id];
    if (!line.length) return [{ id, l: a, r: b }];
    if (end === 'L') {
      const v = line[0].l;
      return [b === v ? { id, l: a, r: b } : { id, l: b, r: a }].concat(line);
    }
    const v = line[line.length - 1].r;
    return line.concat([a === v ? { id, l: a, r: b } : { id, l: b, r: a }]);
  }

  /** Kết thúc ván (hand): cộng điểm, xong trận nếu đạt mục tiêu */
  function endHand(s, winner, reason) {
    const pips = [sumPips(s.hands[0]), sumPips(s.hands[1])];
    let w = winner;
    let points = 0;
    if (reason === 'domino') points = pips[1 - w];
    else if (pips[0] === pips[1]) w = -1;
    else {
      w = pips[0] < pips[1] ? 0 : 1;
      points = Math.abs(pips[0] - pips[1]);
    }
    if (w >= 0) s.scores[w] += points;
    s.result = { winner: w, reason, points, pips };
    if (w >= 0 && s.scores[w] >= s.target) {
      s.phase = 'match';
      s.winner = w;
    } else s.phase = 'hand';
    return s;
  }

  /** Tắc: nọc hết và không ai đánh được */
  const isBlocked = (s) => s.line.length > 0 && s.boneyard.length === 0 && !canPlay(s, 0) && !canPlay(s, 1);

  /**
   * Đi một nước cho người tới lượt: { type: 'play', tile, end: 'L' | 'R' } | { type: 'draw' } | { type: 'pass' }.
   * Trả trạng thái mới, hoặc null nếu nước không hợp lệ. Ván tắc được nhận ra ngay sau nước làm tắc
   * (đánh, bốc quân cuối hoặc bỏ lượt), không phải chờ cả hai cùng bỏ lượt.
   */
  function apply(s, m) {
    if (!isLegal(s, m)) return null;
    const n = clone(s);
    const p = n.turn;
    const e = ends(n);
    if (m.type === 'play') {
      n.line = placeOnLine(n.line, m.tile, m.end);
      n.hands[p].splice(n.hands[p].indexOf(m.tile), 1);
      n.lead = -1;
      // Đánh quân có chấm v thì chắc chắn không còn "thiếu" v nữa
      n.lacks[p][TILES[m.tile][0]] = false;
      n.lacks[p][TILES[m.tile][1]] = false;
      if (!n.hands[p].length) return endHand(n, p, 'domino');
      if (isBlocked(n)) return endHand(n, -1, 'blocked');
      n.turn = 1 - p;
      return n;
    }
    if (m.type === 'draw') {
      n.hands[p].push(n.boneyard.pop());
      n.hands[p].sort(byId);
      // Phải bốc nghĩa là đang thiếu cả hai chấm ở đầu dây; quân vừa bốc chưa ai biết nên bỏ các suy luận cũ
      n.lacks[p] = noLacks();
      n.lacks[p][e.L] = true;
      n.lacks[p][e.R] = true;
      if (isBlocked(n)) return endHand(n, -1, 'blocked');
      return n;
    }
    // Bỏ lượt (nọc hết)
    n.lacks[p][e.L] = true;
    n.lacks[p][e.R] = true;
    if (isBlocked(n)) return endHand(n, -1, 'blocked');
    n.turn = 1 - p;
    return n;
  }

  /* ---------------- Máy ---------------- */
  /**
   * Chọn nước cho người tới lượt. Máy chỉ dùng thông tin công khai: quân của mình, dây, số quân đối thủ,
   * số quân nọc và các chấm đối thủ đã lộ là thiếu (khi bốc / bỏ lượt).
   *   easy: đánh bừa một nước hợp lệ (quân bừa, đầu bừa).
   *   hard: chấm điểm từng nước: xả quân nặng sớm, xả quân đôi, giữ nhiều chấm khác nhau, giữ đầu dây mình theo được,
   *         chặn chấm đối thủ thiếu (đã lộ, hoặc suy ra khi đủ 7 quân chấm đó đã nằm trên dây / trong tay mình);
   *         nọc hết thì tay đối thủ chính là các quân chưa thấy, nên biết nước làm tắc là thắng hay thua.
   */
  function chooseMove(s, opts) {
    const o = opts || {};
    const rng = o.rng || Math.random;
    const moves = legalMoves(s);
    if (!moves.length) return null;
    if (moves[0].type !== 'play') return moves[0];
    if (o.level !== 'hard') return moves[Math.floor(rng() * moves.length)];
    let best = null;
    let bestScore = -Infinity;
    moves.forEach((m) => {
      const sc = scoreMove(s, m) + rng() * 0.5;
      if (sc > bestScore) {
        bestScore = sc;
        best = m;
      }
    });
    return best;
  }

  function scoreMove(s, m) {
    const p = s.turn;
    const opp = 1 - p;
    const [a, b] = TILES[m.tile];
    const rest = s.hands[p].filter((id) => id !== m.tile);
    if (!rest.length) return 1e6; // quân cuối: thắng ván
    const line = placeOnLine(s.line, m.tile, m.end);
    const L = line[0].l;
    const R = line[line.length - 1].r;
    const count = [0, 0, 0, 0, 0, 0, 0]; // số quân còn trên tay có chấm v
    rest.forEach((id) => {
      count[TILES[id][0]]++;
      if (!isDouble(id)) count[TILES[id][1]]++;
    });

    // Quân chưa thấy (trong tay đối thủ hoặc nọc); nọc hết thì đó chính là tay đối thủ
    const seen = new Set(rest.concat(line.map((t) => t.id)));
    const unseen = [];
    for (let i = 0; i < TILES.length; i++) if (!seen.has(i)) unseen.push(i);
    const exact = s.boneyard.length === 0;
    const noneLeft = (v) => !unseen.some((id) => hasSuit(id, v));
    const oppLacks = (v) => noneLeft(v) || (!exact && s.lacks[opp][v]);

    let sc = a + b;
    if (a === b) sc += 4;
    sc += count.filter((c) => c > 0).length * 1.5;
    sc += Math.min(count[L], 3) * 1.5 + Math.min(count[R], 3) * 1.5;

    const urgent = s.hands[opp].length <= 2 ? 2 : 1;
    const lackL = oppLacks(L);
    const lackR = oppLacks(R);
    sc += ((lackL ? 1 : 0) + (L !== R && lackR ? 1 : 0)) * 5 * urgent;
    if (lackL && lackR) sc += 6 * urgent;
    // Hai đầu cùng một chấm mà mình không có: dễ bị đối thủ khóa
    if (L === R && count[L] === 0 && !lackL) sc -= 4;

    // Nọc hết, đối thủ không đánh được và mình cũng không: nước này làm tắc, biết trước thắng hay thua
    if (exact && lackL && lackR && !rest.some((id) => hasSuit(id, L) || hasSuit(id, R))) {
      const mine = sumPips(rest);
      const theirs = sumPips(unseen);
      sc += mine < theirs ? 60 + (theirs - mine) : -60;
    }
    return sc;
  }

  /* ---------------- Bố cục dây (thuần, để vẽ) ---------------- */
  /**
   * Xếp dây thành hình rắn trong khung rộng `width` đơn vị (1 đơn vị = nửa quân, tối thiểu 4). Quân thường nằm ngang 2×1,
   * quân đôi dựng dọc 1×2 (vắt ngang dây); hết hàng thì quân kế tiếp dựng dọc xuống dưới cột cuối (góc rẽ) và hàng sau
   * chạy ngược chiều. Trả { items, width, height, dir } (dir: chiều của hàng cuối, 1 = sang phải), toạ độ đã dời về gốc:
   * item = { id, x, y, w, h, vertical, turn?, pips: [nửa trái / trên, nửa phải / dưới], h1, h2 } — h1 / h2 là tâm nửa quân gặp
   * trước / sau theo chiều dây (đầu trái của dây = h1 của quân đầu, đầu phải = h2 của quân cuối; quân đôi: tâm quân).
   */
  function layoutLine(line, width) {
    const W = Math.max(4, Math.floor(width));
    const items = [];
    let dir = 1;
    let x = 0;
    let cy = 0;
    line.forEach((t, i) => {
      const dbl = t.l === t.r;
      const far = x + dir * (dbl ? 1 : 2);
      if (i === 0 || (dir > 0 ? far <= W : far >= 0)) {
        const x0 = Math.min(x, far);
        if (dbl) {
          const c = { x: x0 + 0.5, y: cy };
          items.push({ id: t.id, x: x0, y: cy - 1, w: 1, h: 2, vertical: true, pips: [t.l, t.r], h1: c, h2: c });
        } else {
          items.push({
            id: t.id, x: x0, y: cy - 0.5, w: 2, h: 1, vertical: false,
            pips: dir > 0 ? [t.l, t.r] : [t.r, t.l],
            h1: { x: x + dir * 0.5, y: cy },
            h2: { x: x + dir * 1.5, y: cy },
          });
        }
        x = far;
        return;
      }
      // Góc rẽ: quân dựng dọc dưới cột cuối của hàng, nửa trên chạm quân trước
      const prev = items[items.length - 1];
      const col = dir > 0 ? x - 1 : x;
      const top = prev.y + prev.h;
      items.push({
        id: t.id, x: col, y: top, w: 1, h: 2, vertical: true, turn: true, pips: [t.l, t.r],
        h1: { x: col + 0.5, y: top + 0.5 },
        h2: { x: col + 0.5, y: top + 1.5 },
      });
      cy = top + 1.5;
      dir = -dir;
      x = dir > 0 ? col + 1 : col;
    });
    if (!items.length) return { items, width: 0, height: 0, dir };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    items.forEach((it) => {
      minX = Math.min(minX, it.x);
      minY = Math.min(minY, it.y);
      maxX = Math.max(maxX, it.x + it.w);
      maxY = Math.max(maxY, it.y + it.h);
    });
    items.forEach((it) => {
      it.x -= minX;
      it.y -= minY;
      it.h1 = { x: it.h1.x - minX, y: it.h1.y - minY };
      it.h2 = { x: it.h2.x - minX, y: it.h2.y - minY };
    });
    return { items, width: maxX - minX, height: maxY - minY, dir };
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  const toJSON = (s) => Object.assign({ v: VERSION }, clone(s));

  const isId = (x) => Number.isInteger(x) && x >= 0 && x < TILES.length;
  const isPip = (x) => Number.isInteger(x) && x >= 0 && x <= 6;
  const isNat = (x) => Number.isInteger(x) && x >= 0;

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia trận mới). */
  function fromJSON(raw) {
    try {
      return parse(raw);
    } catch (e) {
      return null;
    }
  }
  function parse(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { target, seed, handNo, scores, hands, boneyard, line, turn, lead, lacks, phase, result, winner } = raw;
    if (TARGETS.indexOf(target) < 0 || !isNat(seed) || seed > 0xffffffff || !Number.isInteger(handNo) || handNo < 1) return null;
    if (!Array.isArray(scores) || scores.length !== 2 || !scores.every(isNat)) return null;
    if (!Array.isArray(hands) || hands.length !== 2 || !hands.every((h) => Array.isArray(h) && h.every(isId))) return null;
    if (!Array.isArray(boneyard) || !boneyard.every(isId)) return null;
    if (!Array.isArray(line) || !line.every((t) => t && typeof t === 'object' && isId(t.id) && isPip(t.l) && isPip(t.r))) return null;
    // Đủ 28 quân, mỗi quân đúng một lần
    const all = hands[0].concat(hands[1], boneyard, line.map((t) => t.id));
    if (all.length !== TILES.length || new Set(all).size !== TILES.length) return null;
    // Quân trên dây đúng mặt và chấm chạm nhau bằng nhau
    for (let i = 0; i < line.length; i++) {
      const [a, b] = TILES[line[i].id];
      if (!((line[i].l === a && line[i].r === b) || (line[i].l === b && line[i].r === a))) return null;
      if (i > 0 && line[i - 1].r !== line[i].l) return null;
    }
    if (turn !== 0 && turn !== 1) return null;
    if (!Array.isArray(lacks) || lacks.length !== 2 || !lacks.every((l) => Array.isArray(l) && l.length === 7 && l.every((x) => typeof x === 'boolean'))) return null;
    if (line.length ? lead !== -1 : !isId(lead) || hands[turn].indexOf(lead) < 0) return null;
    if (['play', 'hand', 'match'].indexOf(phase) < 0) return null;
    const s = {
      target,
      seed,
      handNo,
      scores: scores.slice(),
      hands: [hands[0].slice().sort(byId), hands[1].slice().sort(byId)],
      boneyard: boneyard.slice(),
      line: line.map((t) => ({ id: t.id, l: t.l, r: t.r })),
      turn,
      lead,
      lacks: [lacks[0].slice(), lacks[1].slice()],
      phase,
      result: null,
      winner: -1,
    };
    if (phase === 'play') {
      if (result != null || winner !== -1) return null;
      if (!hands[0].length || !hands[1].length || scores[0] >= target || scores[1] >= target) return null;
      if (isBlocked(s)) return null; // thế đã tắc thì ván phải xong rồi
      return s;
    }
    // Ván (hand) đã xong: kết quả phải khớp tay bài
    if (!result || typeof result !== 'object' || [-1, 0, 1].indexOf(result.winner) < 0 || ['domino', 'blocked'].indexOf(result.reason) < 0) return null;
    if (!isNat(result.points) || !Array.isArray(result.pips) || result.pips.length !== 2) return null;
    if (result.pips[0] !== sumPips(hands[0]) || result.pips[1] !== sumPips(hands[1])) return null;
    if (result.reason === 'domino') {
      if (result.winner < 0 || hands[result.winner].length || result.points !== result.pips[1 - result.winner]) return null;
    } else {
      const [p0, p1] = result.pips;
      const w = p0 === p1 ? -1 : p0 < p1 ? 0 : 1;
      if (result.winner !== w || result.points !== Math.abs(p0 - p1) || boneyard.length) return null;
    }
    s.result = { winner: result.winner, reason: result.reason, points: result.points, pips: result.pips.slice() };
    if (phase === 'match') {
      if ((winner !== 0 && winner !== 1) || winner !== result.winner || scores[winner] < target || scores[1 - winner] >= target) return null;
      s.winner = winner;
    } else if (winner !== -1 || scores[0] >= target || scores[1] >= target) return null;
    return s;
  }

  const api = {
    VERSION, TARGETS, TILES, HAND_SIZE,
    mulberry32, isDouble, tilePips, sumPips,
    newMatch, nextHand, leadTile,
    ends, fitsOf, legalPlays, legalMoves, isLegal, canPlay, mustDraw, mustPass, apply,
    chooseMove, layoutLine, toJSON, fromJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
