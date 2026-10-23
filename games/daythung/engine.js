/* =====================================================================
 * Đẩy Thùng - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Màn chơi lưu dạng chuỗi gọn theo ký hiệu chuẩn, các hàng nối bằng '|':
 *     '#' tường, '@' người, '$' thùng, '.' đích, '*' thùng trên đích, '+' người trên đích, ' ' sàn
 *   - Ván = màn + chuỗi nước đi kiểu LURD (chữ thường: bước đi, chữ hoa: đẩy thùng)
 *   - Hàm thuần: nhận ván cũ, trả ván mới; toJSON / fromJSON lưu ván bằng số màn + chuỗi nước đi
 *   - solve(): BFS theo số lần đẩy (tối ưu số lần đẩy), dùng trong test để chứng minh mọi màn giải được
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  // Màn tự thiết kế bằng máy (sinh phòng ngẫu nhiên, kéo ngược thùng từ đích để tìm thế khó nhất),
  // xếp theo độ khó tăng dần. Ghi chú cuối dòng: số thùng / số lần đẩy tối thiểu.
  const LEVELS = [
    '####|#  #|#$ #|# @#|#  #|#. #|####', // 1: 1 / 3
    ' ####|## .#|# @ ##|# $  #|###  #|  #  #|  ####', // 2: 1 / 5
    ' ####| #  #| #  #|##  #|# $###|#    #|#@  .#|######', // 3: 1 / 8
    '####|#  #|#  ####|#   $.#|## .$@#| ######', // 4: 2 / 8
    '########|#    $.#|#   ##@#|####.$ #|   #   #|   #####', // 5: 2 / 8
    '  ######| ##    #| #.$##@#|##  ## #|#.   $ #|#    ###|######', // 6: 2 / 9
    '#######|# $  .##|#     @#|##$ #. ##| #  ##  #| #####  #|     ####', // 7: 2 / 12
    '######|#.@  ###|#.  $  #|#  #   #|#####$ #|    #  #|    ####', // 8: 2 / 12
    ' ######| #.   #|##  #$#|#  .  ##|#  ##$ #|#      #|# @    #|########', // 9: 2 / 17
    ' ####| #. ##| # $@#|## $.#|# .# #|#  #$#|#    #|######', // 10: 3 / 14
    '#######|# $. .#|#  #  #|#@ $$ #|##.  ##| #####', // 11: 3 / 14
    ' #######| # .@$ #|##$##  #|#  ### #|#    $ #|# ..   #|########', // 12: 3 / 14
    ' ######|##    #|# $ $ #|# $.###|#  #  #|#.    #|###  @#|  ## .#|   ####', // 13: 3 / 19
    ' ######| #    #|## $  ####|#  # $   #|#  # $ .@#|#### .# .#|   #######', // 14: 3 / 22
    ' ####| #  #####|##  $ $ #|# $ #   #|#@ ##  ##|#  ... #|########', // 15: 3 / 22
    ' ########| #.  .  #|##$ # # #|#   #   #|#.# $ $ #|#    ##@#|# ##### #|#       #|#########', // 16: 3 / 20
    ' ####|##  ##|#.   #|#   $##|#.#@  #|#   # ##|#.# $$ #|#      #|########', // 17: 3 / 25
    ' ######| #    ###|##.#    #|#    #$ #|#.   #@##|###  .$#| #  $  #| #   ###| #####', // 18: 3 / 25
    '  #######| ##     #| #@$ $  #|##$##.#.#|#  ##$  #|# . .   #|#########', // 19: 4 / 20
    '########|#   # .#|#   .$ #|## $ # #| ###  .#|   #$$.#|   # @##|   ####', // 20: 4 / 24
    '#######|#.    #|# $   #|##  ###|##$ #|# $$#|#.+.#|#####', // 21: 4 / 23
    '  #####|  #   ##|  #$ $.#|  # .#.#|### ## #|# @   .#|# $# $ #|#    ###|######', // 22: 4 / 22
    '######|#    ####|# #  # .#|#  $$ $ #|#  #    ##|### . #$ #|  #.  #.@#|  ##  ####|   ####', // 23: 4 / 26
    '######|#  . #|# $ .####|### .#  #|  # $#$ ##|  #    $+#|  #  ##  #|  ########', // 24: 4 / 30
    '########|# @.#. #|#     .#|##$#  ###| # #  $ #| # #  # #| # $ $  #| #. #   #| ########', // 25: 4 / 26
    '   ####|####  #|#.    #|#  $ ###|# ###. ###|#   $$@  #|#    .$ .#|#  #######|####', // 26: 4 / 26
    '#########|#    #  #|#     . #|#.#   ###|#.#$####|#    $ #|#.#$ $@#|#   ####|#####', // 27: 4 / 31
    '     ####|     #  #|  ####  #| ##@$ $.#|## $ $  #|#  ###  ##|# .      #|# .. #   #|##########', // 28: 4 / 33
    '     ####|    ##  #|#####   #|#. $ .  #|# $ $.###|##  #.#|# $ #.##|#   #$ #|#####@ #|    ####', // 29: 5 / 28
    '########|#..$ . #|# $  . #|#. ##  #|#  ### #|# $$ $ #|##@  ###| #####', // 30: 5 / 29
    '######|#   .#|# ## ###|#   $$ ####|##   ..$ @#| #$ ##. $ #| # . ##  ##| ##  #####|  ####', // 31: 5 / 32
    '   ######| ###..$ #| #   .  #| # $.####|##  #  #|# $ $.@#|# # $  #|#    ###|######', // 32: 5 / 32
    '########|#   #  ###|#   #$ $@#|# #    $.#|#.##$ ####|#     ####|#  .   . #|#####. $ #|    ######', // 33: 5 / 32
    '  #########|###   ##  #|# $$ .   .#|# $ ## .#.#|# #  $    #|#. @  $ ###|#########', // 34: 5 / 30
    '####|#. #####|# $$   ##|#     . #|##$## $ #| #@$. ###| ###   #|   #.. #|   #####', // 35: 5 / 40
    '###########|#@.$ ##   #|# ##  #$# #|# #      .#|# #$   ####|# $  # #|## # # ####| # #$    .#| #.     . #| ##########', // 36: 5 / 37
  ];

  // Hướng: 0 lên, 1 phải, 2 xuống, 3 trái (chữ LURD: u r d l)
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];
  const LETTERS = 'urdl';

  /* ---------------- Đọc màn ---------------- */

  const cache = new Map();

  /**
   * Đọc chuỗi màn thành bản đồ tĩnh + vị trí ban đầu. Màn sai thì ném lỗi kèm lý do:
   * đúng một người, số thùng bằng số đích (≥ 1), vùng người đi được (coi thùng là sàn) kín tường.
   */
  function parseLevel(str) {
    if (cache.has(str)) return cache.get(str);
    if (typeof str !== 'string' || !str.length) throw new Error('empty level');
    const rows = str.split('|');
    const h = rows.length;
    const w = Math.max.apply(null, rows.map((r) => r.length));
    const n = w * h;
    const wall = new Uint8Array(n);
    const goal = new Uint8Array(n);
    const boxes = [];
    let player = -1;
    let players = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = rows[y][x] || ' ';
        const i = y * w + x;
        if ('#@+$*. '.indexOf(c) < 0) throw new Error('bad char ' + JSON.stringify(c));
        if (c === '#') wall[i] = 1;
        if (c === '.' || c === '*' || c === '+') goal[i] = 1;
        if (c === '$' || c === '*') boxes.push(i);
        if (c === '@' || c === '+') {
          player = i;
          players++;
        }
      }
    }
    if (players !== 1) throw new Error('need exactly one player, got ' + players);
    // Vùng trong: loang từ người qua mọi ô không phải tường; chạm mép lưới là màn hở
    const floor = new Uint8Array(n);
    const stack = [player];
    floor[player] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % w;
      const y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) throw new Error('level is not closed by walls');
      for (let d = 0; d < 4; d++) {
        const j = i + DY[d] * w + DX[d];
        if (!wall[j] && !floor[j]) {
          floor[j] = 1;
          stack.push(j);
        }
      }
    }
    const goals = [];
    for (let i = 0; i < n; i++) if (goal[i]) goals.push(i);
    if (!boxes.length) throw new Error('no boxes');
    if (boxes.length !== goals.length) throw new Error(boxes.length + ' boxes but ' + goals.length + ' goals');
    if (boxes.some((b) => !floor[b]) || goals.some((g) => !floor[g])) throw new Error('box or goal outside the room');
    const map = { w, h, wall, floor, goal, goals, start: { boxes, player } };
    cache.set(str, map);
    return map;
  }

  /** null nếu màn hợp lệ, ngược lại chuỗi lý do. */
  function validateLevel(str) {
    try {
      parseLevel(str);
      return null;
    } catch (e) {
      return e.message;
    }
  }

  /* ---------------- Ván ---------------- */

  /** Ván mới ở màn `level` (chỉ số trong LEVELS), hoặc từ chuỗi màn tùy ý `str` (level = null). */
  function newGame(level, str) {
    const src = str != null ? str : LEVELS[level];
    const map = parseLevel(src);
    return { level: str != null ? null : level, src, map, boxes: map.start.boxes.slice(), player: map.start.player, hist: '' };
  }

  const with_ = (g, boxes, player, hist) => ({ level: g.level, src: g.src, map: g.map, boxes, player, hist });
  const boxAt = (g, i) => g.boxes.indexOf(i);
  const isWon = (g) => g.boxes.every((b) => g.map.goal[b] === 1);
  const onGoal = (g) => g.boxes.reduce((s, b) => s + g.map.goal[b], 0);
  const moves = (g) => g.hist.length;
  const pushes = (g) => g.hist.replace(/[a-z]/g, '').length;
  const dirOf = (ch) => LETTERS.indexOf(String(ch).toLowerCase());

  /** Một bước theo hướng d (0–3 hoặc chữ u/r/d/l). Bị chặn (tường, hai thùng liền, đã thắng) thì trả về chính g. */
  function move(g, dir) {
    const d = typeof dir === 'number' ? dir : dirOf(dir);
    if (!(d >= 0 && d <= 3) || isWon(g)) return g;
    const { w, floor } = g.map;
    const step = DY[d] * w + DX[d];
    const to = g.player + step;
    if (!floor[to]) return g;
    const bi = boxAt(g, to);
    if (bi < 0) return with_(g, g.boxes, to, g.hist + LETTERS[d]);
    const beyond = to + step;
    if (!floor[beyond] || boxAt(g, beyond) >= 0) return g;
    const boxes = g.boxes.slice();
    boxes[bi] = beyond; // giữ thứ tự thùng để giao diện biết thùng nào vừa di chuyển
    return with_(g, boxes, to, g.hist + LETTERS[d].toUpperCase());
  }

  /** Đi lại chuỗi nước LURD từ đầu màn; nước nào không hợp lệ (bị chặn, sai chữ hoa / thường) thì trả null. */
  function replay(g0, hist) {
    let g = with_(g0, g0.map.start.boxes.slice(), g0.map.start.player, '');
    for (const ch of hist) {
      const next = move(g, ch);
      if (next === g || next.hist[next.hist.length - 1] !== ch) return null;
      g = next;
    }
    return g;
  }

  /** Về đầu màn (không tính là trợ giúp). */
  const restart = (g) => replay(g, '');

  /**
   * Hoàn tác lần đẩy gần nhất cùng mọi bước đi sau nó: người đứng lại chỗ ngay trước khi đẩy.
   * Chưa đẩy lần nào thì về chỗ xuất phát. Không giới hạn số lần, không tính là trợ giúp.
   */
  function undo(g) {
    if (!g.hist) return g;
    let h = g.hist.replace(/[a-z]+$/, '');
    if (h) h = h.slice(0, -1);
    return replay(g, h);
  }

  /** Đường đi ngắn nhất (chuỗi chữ thường) tới ô `target` mà không đẩy thùng; không tới được thì null. */
  function pathTo(g, target) {
    const { w, h, floor } = g.map;
    if (target === g.player) return '';
    if (!floor[target] || boxAt(g, target) >= 0) return null;
    const prev = new Int32Array(w * h).fill(-1);
    const blocked = new Uint8Array(w * h);
    g.boxes.forEach((b) => { blocked[b] = 1; });
    prev[g.player] = g.player;
    const queue = [g.player];
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      for (let d = 0; d < 4; d++) {
        const j = i + DY[d] * w + DX[d];
        if (!floor[j] || blocked[j] || prev[j] >= 0) continue;
        prev[j] = i;
        if (j === target) {
          let path = '';
          for (let k = j; k !== g.player; k = prev[k]) {
            const diff = k - prev[k];
            path = LETTERS[diff === -w ? 0 : diff === 1 ? 1 : diff === w ? 2 : 3] + path;
          }
          return path;
        }
        queue.push(j);
      }
    }
    return null;
  }

  /* ---------------- Lưu / khôi phục ---------------- */

  const toJSON = (g) => ({ v: VERSION, level: g.level, hist: g.hist });

  /** Ván lưu hỏng, khác phiên bản, sai số màn hoặc có nước đi không hợp lệ thì trả null. */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { level, hist } = raw;
    if (!Number.isInteger(level) || level < 0 || level >= LEVELS.length) return null;
    if (typeof hist !== 'string' || hist.length > 100000 || !/^[urdlURDL]*$/.test(hist)) return null;
    return replay(newGame(level), hist);
  }

  /* ---------------- Giải màn (BFS theo số lần đẩy) ---------------- */

  /** Ô "chết": thùng đứng đó không bao giờ tới được đích nào (kéo ngược thùng từ mọi đích để tìm ô sống). */
  function deadCells(map) {
    const { w, h, floor, goals } = map;
    const live = new Uint8Array(w * h);
    const stack = goals.slice();
    goals.forEach((i) => { live[i] = 1; });
    while (stack.length) {
      const i = stack.pop();
      for (let d = 0; d < 4; d++) {
        const s = DY[d] * w + DX[d];
        // Kéo thùng từ i sang i+s: người đứng ở i+s rồi lùi về i+2s
        if (floor[i + s] && floor[i + 2 * s] && !live[i + s]) {
          live[i + s] = 1;
          stack.push(i + s);
        }
      }
    }
    const dead = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) dead[i] = floor[i] && !live[i] ? 1 : 0;
    return dead;
  }

  /**
   * Giải từ trạng thái của ván g (hoặc chuỗi màn). Trả chuỗi LURD ít lần đẩy nhất; null nếu không giải được
   * hoặc vượt `opts.maxStates`. `opts.stats` (nếu có) nhận { states, pushes }.
   */
  function solve(gOrStr, opts) {
    const g = typeof gOrStr === 'string' ? newGame(null, gOrStr) : gOrStr;
    const o = opts || {};
    const maxStates = o.maxStates || 3000000;
    const { w, h, floor, goal } = g.map;
    const n = w * h;
    const dead = deadCells(g.map);
    if (isWon(g)) return '';
    if (g.boxes.some((b) => dead[b] && !goal[b])) return null;

    const occ = new Uint8Array(n); // thùng của trạng thái đang xét
    const mark = new Int32Array(n);
    const queue = new Int32Array(n);
    let stamp = 0;
    // Loang vùng người đi được từ p (không đẩy); trả ô nhỏ nhất của vùng để chuẩn hóa trạng thái
    function reach(p) {
      stamp++;
      mark[p] = stamp;
      queue[0] = p;
      let len = 1;
      let min = p;
      for (let q = 0; q < len; q++) {
        const i = queue[q];
        for (let d = 0; d < 4; d++) {
          const j = i + DY[d] * w + DX[d];
          if (floor[j] && !occ[j] && mark[j] !== stamp) {
            mark[j] = stamp;
            queue[len++] = j;
            if (j < min) min = j;
          }
        }
      }
      return min;
    }
    const isBlock = (i) => !floor[i] || occ[i] === 1;
    // Kẹt 2x2: ô vừa đẩy tới nằm trong khối vuông toàn tường / thùng có thùng chưa ở đích
    function frozen(t) {
      for (const a of [t, t - 1, t - w, t - w - 1]) {
        const sq = [a, a + 1, a + w, a + w + 1];
        if (sq.every(isBlock) && sq.some((i) => occ[i] && !goal[i])) return true;
      }
      return false;
    }
    const enc = (arr, p) => String.fromCharCode.apply(null, arr) + String.fromCharCode(p);

    const start = g.boxes.slice().sort((a, b) => a - b);
    start.forEach((b) => { occ[b] = 1; });
    const visited = new Set([enc(start, reach(g.player))]);
    start.forEach((b) => { occ[b] = 0; });
    const states = [{ boxes: start, player: g.player, parent: -1, box: -1, dir: -1 }];
    const area = new Uint8Array(n); // vùng đi được của trạng thái đang xét
    let found = -1;
    for (let s = 0; s < states.length && found < 0 && states.length <= maxStates; s++) {
      const st = states[s];
      st.boxes.forEach((b) => { occ[b] = 1; });
      reach(st.player);
      for (let i = 0; i < n; i++) area[i] = mark[i] === stamp ? 1 : 0;
      for (let k = 0; k < st.boxes.length && found < 0; k++) {
        const b = st.boxes[k];
        for (let d = 0; d < 4; d++) {
          const step = DY[d] * w + DX[d];
          const t = b + step;
          if (!area[b - step] || !floor[t] || occ[t] || dead[t]) continue;
          occ[b] = 0;
          occ[t] = 1;
          let key = null;
          let nb = null;
          if (!frozen(t)) {
            nb = st.boxes.slice();
            nb[k] = t;
            nb.sort((x, y) => x - y);
            key = enc(nb, reach(b));
          }
          occ[t] = 0;
          occ[b] = 1;
          if (key == null || visited.has(key)) continue;
          visited.add(key);
          states.push({ boxes: nb, player: b, parent: s, box: b, dir: d });
          if (nb.every((i) => goal[i])) {
            found = states.length - 1;
            break;
          }
        }
      }
      st.boxes.forEach((b) => { occ[b] = 0; });
    }
    if (o.stats) o.stats.states = states.length;
    if (found < 0) return null;
    // Dựng lại chuỗi LURD: đi tới phía sau thùng rồi đẩy
    const chain = [];
    for (let s = found; s > 0; s = states[s].parent) chain.push(states[s]);
    chain.reverse();
    let cur = with_(g, g.boxes.slice(), g.player, '');
    for (const st of chain) {
      const walk = pathTo(cur, st.box - (DY[st.dir] * w + DX[st.dir]));
      for (const ch of walk) cur = move(cur, ch);
      cur = move(cur, st.dir);
    }
    if (o.stats) o.stats.pushes = chain.length;
    return cur.hist;
  }

  const api = {
    VERSION, LEVELS, DX, DY, LETTERS,
    parseLevel, validateLevel, newGame, move, replay, restart, undo, pathTo,
    isWon, onGoal, moves, pushes, boxAt, toJSON, fromJSON, deadCells, solve,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
