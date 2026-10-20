/* =====================================================================
 * Cờ Caro - Engine (logic thuần + AI, không đụng tới DOM)
 *   1. Bàn cờ 15x15, kiểm tra thắng theo luật (chặn hai đầu, sáu quân)
 *   2. Bảng mẫu thế cờ trên một đường (năm, bốn mở/đóng, ba, hai…)
 *   3. Đánh giá ô ứng viên + tìm nước: alpha-beta có cắt tỉa và
 *      tìm chuỗi nước bốn liên tục (VCF) ở mức Khó
 *   4. Chạy được ở trình duyệt (window.CaroEngine), Node (module.exports)
 *      và trong Web Worker (CaroEngine.serve(self))
 *
 * Toàn bộ engine nằm trong hàm `factory` để app có thể dựng lại mã nguồn
 * (factory.toString()) thành Blob cho Web Worker, chạy được cả từ file://.
 * ===================================================================== */
(function (root, factory) {
  'use strict';
  var api = factory();
  api.factorySource = factory.toString();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) {
    root.CaroEngine = api;
    // Nạp bằng importScripts() bên trong một worker: tự nhận lệnh luôn
    if (typeof root.importScripts === 'function' && typeof root.document === 'undefined' && !root.__caroNoServe) {
      api.serve(root);
    }
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function factory() {
  'use strict';

  /* ---------------- Hằng số bàn cờ ---------------- */
  var N = 15;
  var NN = N * N;
  var EMPTY = 0, X = 1, O = 2;
  var CENTER = (N >> 1) * N + (N >> 1);
  var DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]]; // ngang, dọc, chéo xuống, chéo ngược
  var DEFAULT_RULES = { blockedBoth: true, overline: true };

  // Hàng xóm trên 4 hướng, lệch -5..-1 và +1..+5 (10 ô, ô giữa bỏ ra).
  // NB[(i * 4 + d) * 10 + k] = chỉ số ô, hoặc -1 nếu ra ngoài bàn.
  var OFFS = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5];
  var NB = new Int16Array(NN * 40);
  // Các ô trong hình vuông bán kính 2 quanh mỗi ô: dùng để giữ tập ô ứng viên
  var BOX = [];
  (function init() {
    for (var i = 0; i < NN; i++) {
      var r = (i / N) | 0, c = i % N;
      for (var d = 0; d < 4; d++) {
        for (var k = 0; k < 10; k++) {
          var rr = r + DIRS[d][0] * OFFS[k], cc = c + DIRS[d][1] * OFFS[k];
          NB[(i * 4 + d) * 10 + k] = rr >= 0 && rr < N && cc >= 0 && cc < N ? rr * N + cc : -1;
        }
      }
      var box = [];
      for (var dr = -2; dr <= 2; dr++) {
        for (var dc = -2; dc <= 2; dc++) {
          if (!dr && !dc) continue;
          var r2 = r + dr, c2 = c + dc;
          if (r2 >= 0 && r2 < N && c2 >= 0 && c2 < N) box.push(r2 * N + c2);
        }
      }
      BOX.push(box);
    }
  })();

  function idx(r, c) { return r * N + c; }
  function rowOf(i) { return (i / N) | 0; }
  function colOf(i) { return i % N; }
  function inside(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }

  function normRules(rules) {
    rules = rules || {};
    return {
      blockedBoth: rules.blockedBoth !== undefined ? !!rules.blockedBoth : DEFAULT_RULES.blockedBoth,
      overline: rules.overline !== undefined ? !!rules.overline : DEFAULT_RULES.overline,
    };
  }

  function createBoard() { return new Int8Array(NN); }

  /* ---------------- Kiểm tra thắng trên bàn thật ----------------
   * Trả về mảng các ô của đường thắng (đi qua ô i) hoặc null.
   * - overline = false: dãy 6 quân trở lên không tính thắng.
   * - blockedBoth = true: dãy bị quân đối phương chặn cả hai đầu không tính.
   *   Mép bàn KHÔNG tính là quân chặn (chỉ quân đối phương mới chặn). */
  function checkWin(board, i, rules) {
    var p = board[i];
    if (p !== X && p !== O) return null;
    rules = normRules(rules);
    var r0 = rowOf(i), c0 = colOf(i);
    for (var d = 0; d < 4; d++) {
      var dr = DIRS[d][0], dc = DIRS[d][1];
      var a = 0, b = 0;
      while (inside(r0 - (a + 1) * dr, c0 - (a + 1) * dc) && board[idx(r0 - (a + 1) * dr, c0 - (a + 1) * dc)] === p) a++;
      while (inside(r0 + (b + 1) * dr, c0 + (b + 1) * dc) && board[idx(r0 + (b + 1) * dr, c0 + (b + 1) * dc)] === p) b++;
      var len = a + b + 1;
      if (len < 5) continue;
      if (len > 5 && !rules.overline) continue;
      if (rules.blockedBoth) {
        var lr = r0 - (a + 1) * dr, lc = c0 - (a + 1) * dc;
        var rr = r0 + (b + 1) * dr, rc = c0 + (b + 1) * dc;
        var opp = 3 - p;
        var leftBlocked = inside(lr, lc) && board[idx(lr, lc)] === opp;
        var rightBlocked = inside(rr, rc) && board[idx(rr, rc)] === opp;
        if (leftBlocked && rightBlocked) continue;
      }
      var line = [];
      for (var k = -a; k <= b; k++) line.push(idx(r0 + k * dr, c0 + k * dc));
      return line;
    }
    return null;
  }

  function isFull(board) {
    for (var i = 0; i < NN; i++) if (board[i] === EMPTY) return false;
    return true;
  }

  /* Dựng lại ván từ danh sách nước đi (X luôn đi trước).
   * Trả về { board, toMove, winner (0 = chưa / hòa), line, over, draw }. */
  function replay(moves, rules) {
    var board = createBoard();
    var res = { board: board, toMove: X, winner: 0, line: null, over: false, draw: false };
    for (var k = 0; k < moves.length; k++) {
      var m = moves[k];
      if (res.over || !(m >= 0 && m < NN) || board[m] !== EMPTY) throw new Error('Nước đi không hợp lệ ở lượt ' + (k + 1));
      var p = k % 2 === 0 ? X : O;
      board[m] = p;
      var line = checkWin(board, m, rules);
      if (line) { res.over = true; res.winner = p; res.line = line; }
      else if (k === NN - 1) { res.over = true; res.draw = true; }
    }
    res.toMove = moves.length % 2 === 0 ? X : O;
    return res;
  }

  /* ---------------- Bảng mẫu thế cờ trên một đường ----------------
   * Một "mẫu" là 10 ô quanh ô đang xét trên một hướng, mỗi ô 2 bit:
   * 0 trống, 1 quân mình, 2 quân đối phương, 3 ngoài bàn. Ô giữa coi là quân mình.
   * Hình dạng được tính theo đúng luật đang dùng nên luật chặn hai đầu và
   * sáu quân tự động phản ánh vào AI. */
  var SH_NONE = 0, SH_ONE = 1, SH_TWO = 2, SH_OPEN2 = 3, SH_THREE = 4, SH_OPEN3 = 5, SH_FOUR = 6, SH_OPEN4 = 7, SH_FIVE = 8;
  var SHAPE_NAMES = ['none', 'one', 'two', 'open2', 'three', 'open3', 'four', 'open4', 'five'];
  // Thêm một quân vào hình dạng con thì hình dạng hiện tại được "nâng" thành gì
  var PROMOTE = [SH_NONE, SH_NONE, SH_NONE, SH_ONE, SH_TWO, SH_OPEN2, SH_THREE, SH_OPEN3, SH_NONE];
  var TABLE_SIZE = 1 << 20;
  var tables = {};

  function rulesKey(rules) { return (rules.blockedBoth ? 'b' : '-') + (rules.overline ? 'o' : '-'); }
  function tableFor(rules) {
    var key = rulesKey(rules);
    if (!tables[key]) { var t = new Int8Array(TABLE_SIZE); t.fill(-1); tables[key] = t; }
    return tables[key];
  }

  // L: mảng 11 ô, L[5] là ô đang xét (quân mình). Dãy quân mình qua L[5] có thắng không?
  function lineWin(L, rules) {
    var l = 5, r = 5;
    while (l > 0 && L[l - 1] === 1) l--;
    while (r < 10 && L[r + 1] === 1) r++;
    var len = r - l + 1;
    if (len < 5) return false;
    if (len > 5 && !rules.overline) return false;
    if (rules.blockedBoth) {
      var le = l > 0 ? L[l - 1] : 0, re = r < 10 ? L[r + 1] : 0; // ngoài cửa sổ: coi như không bị chặn
      if (le === 2 && re === 2) return false;
    }
    return true;
  }

  function decode(code) {
    var L = new Array(11);
    L[5] = 1;
    for (var k = 0; k < 10; k++) L[k < 5 ? k : k + 1] = (code >> (2 * k)) & 3;
    return L;
  }

  function patShape(T, rules, code) {
    var v = T[code];
    if (v >= 0) return v;
    var L = decode(code);
    var res;
    if (lineWin(L, rules)) res = SH_FIVE;
    else {
      var fp = 0, k, pos;
      for (k = 0; k < 10; k++) {
        if (((code >> (2 * k)) & 3) !== 0) continue;
        pos = k < 5 ? k : k + 1;
        L[pos] = 1;
        if (lineWin(L, rules)) fp++;
        L[pos] = 0;
      }
      if (fp >= 2) {
        // Có ≥ 2 ô thành năm, nhưng với luật chặn hai đầu một quân chặn đặt khéo vẫn có thể
        // vô hiệu hóa tất cả: khi đó chỉ là "bốn" thường.
        res = SH_OPEN4;
        for (k = 0; k < 10 && res === SH_OPEN4; k++) {
          if (((code >> (2 * k)) & 3) !== 0) continue;
          pos = k < 5 ? k : k + 1;
          L[pos] = 2;
          var left = 0;
          for (var k2 = 0; k2 < 10; k2++) {
            if (((code >> (2 * k2)) & 3) !== 0 || k2 === k) continue;
            var pos2 = k2 < 5 ? k2 : k2 + 1;
            L[pos2] = 1;
            if (lineWin(L, rules)) left++;
            L[pos2] = 0;
          }
          L[pos] = 0;
          if (!left) res = SH_FOUR;
        }
      } else if (fp === 1) res = SH_FOUR;
      else {
        res = SH_NONE;
        for (k = 0; k < 10 && res < SH_OPEN3; k++) {
          if (((code >> (2 * k)) & 3) !== 0) continue;
          var m = PROMOTE[patShape(T, rules, code + (1 << (2 * k)))];
          if (m > res) res = m;
        }
      }
    }
    T[code] = res;
    return res;
  }

  function lineCode(board, i, d, p) {
    var base = (i * 4 + d) * 10, code = 0;
    for (var k = 0; k < 10; k++) {
      var j = NB[base + k], v;
      if (j < 0) v = 3;
      else { var b = board[j]; v = b === 0 ? 0 : (b === p ? 1 : 2); }
      code |= v << (2 * k);
    }
    return code;
  }

  // Hình dạng nếu quân p đặt vào ô i, theo hướng d
  function shapeAt(board, i, d, p, rules) {
    rules = normRules(rules);
    return SHAPE_NAMES[patShape(tableFor(rules), rules, lineCode(board, i, d, p))];
  }

  /* ---------------- Điểm của một ô ứng viên ---------------- */
  var SC_FIVE = 10000000; // đặt vào là thắng
  var SC_OPEN4 = 1000000; // tạo bốn mở hoặc hai đường bốn: chắc thắng nếu đối phương không có bốn
  var SC_43 = 200000; // bốn + ba mở
  var SC_33 = 50000; // hai đường ba mở
  var BASE = [0, 8, 25, 120, 140, 1500, 1800, 0, 0];
  var hasFourFlag = false; // biến phụ: ô vừa chấm có tạo được "bốn" theo hướng nào không

  function cellScore(board, i, p, T, rules) {
    var five = 0, open4 = 0, four = 0, open3 = 0, sum = 0;
    for (var d = 0; d < 4; d++) {
      var s = patShape(T, rules, lineCode(board, i, d, p));
      if (s === SH_FIVE) five++;
      else if (s === SH_OPEN4) open4++;
      else if (s === SH_FOUR) four++;
      else if (s === SH_OPEN3) open3++;
      sum += BASE[s];
    }
    hasFourFlag = five + open4 + four > 0;
    if (five) return SC_FIVE;
    if (open4 || four >= 2) return SC_OPEN4;
    if (four && open3) return SC_43;
    if (open3 >= 2) return SC_33;
    return sum;
  }

  /* ---------------- Trạng thái tìm kiếm ---------------- */
  function makeState(board, rules, deadline) {
    var st = {
      board: Int8Array.from(board),
      near: new Int16Array(NN),
      count: 0,
      rules: rules,
      T: tableFor(rules),
      deadline: deadline,
      nodes: 0,
      aborted: false,
    };
    for (var i = 0; i < NN; i++) {
      if (st.board[i] !== EMPTY) {
        st.count++;
        var bx = BOX[i];
        for (var k = 0; k < bx.length; k++) st.near[bx[k]]++;
      }
    }
    return st;
  }
  function place(st, i, p) {
    st.board[i] = p; st.count++;
    var bx = BOX[i];
    for (var k = 0; k < bx.length; k++) st.near[bx[k]]++;
  }
  function unplace(st, i) {
    st.board[i] = EMPTY; st.count--;
    var bx = BOX[i];
    for (var k = 0; k < bx.length; k++) st.near[bx[k]]--;
  }

  // Phân tích mọi ô ứng viên (trống, cách quân gần nhất ≤ 2 ô) cho bên s đang tới lượt
  function analyze(st, s) {
    var b = st.board, near = st.near, T = st.T, rules = st.rules, o = 3 - s;
    var A = {
      cands: [], ms: {}, mo: {}, sFive: -1, oFive: [], sMax: 0, oMax: 0,
      sumS: 0, sumO: 0, sFour: [], oHasFour: false,
    };
    for (var i = 0; i < NN; i++) {
      if (b[i] !== EMPTY || near[i] === 0) continue;
      var vs = cellScore(b, i, s, T, rules);
      var sf = hasFourFlag;
      var vo = cellScore(b, i, o, T, rules);
      var of = hasFourFlag;
      A.cands.push(i);
      A.ms[i] = vs; A.mo[i] = vo;
      if (vs >= SC_FIVE && A.sFive < 0) A.sFive = i;
      if (vo >= SC_FIVE) A.oFive.push(i);
      if (sf) A.sFour.push(i);
      if (of) A.oHasFour = true;
      if (vs > A.sMax) A.sMax = vs;
      if (vo > A.oMax) A.oMax = vo;
      A.sumS += vs < 6000 ? vs : 6000;
      A.sumO += vo < 6000 ? vo : 6000;
    }
    return A;
  }

  /* Danh sách nước nên xét, đã sắp xếp. Có ép buộc:
   * - đối phương có ô thành năm → chỉ được chặn ô đó;
   * - đối phương sắp tạo bốn mở (đang có ba mở…) → chỉ xét ô chặn hoặc ô tạo bốn phản công. */
  function orderMoves(A, width, defW) {
    var list;
    if (A.oFive.length) list = A.oFive.slice();
    else if (A.oMax >= SC_OPEN4 && A.sMax < SC_OPEN4) {
      list = [];
      for (var k = 0; k < A.cands.length; k++) {
        var c = A.cands[k];
        if (A.mo[c] >= 1500 || A.sFour.indexOf(c) >= 0) list.push(c);
      }
    } else list = A.cands.slice();
    var pr = {};
    for (var j = 0; j < list.length; j++) pr[list[j]] = A.ms[list[j]] + A.mo[list[j]] * defW;
    list.sort(function (a, b) { return pr[b] - pr[a]; });
    if (list.length > width) list.length = width;
    return list;
  }

  var WIN = 1000000000;
  var INF = 2000000000;

  function now() { return Date.now(); }

  function evalLeaf(A) {
    var e = A.sumS * 1.15 - A.sumO;
    if (A.oMax >= SC_OPEN4) e -= 3000; // đối phương đang đe dọa bốn mở, phải chặn
    return e;
  }

  // Negamax alpha-beta. Trả về điểm theo góc nhìn bên s (đang tới lượt).
  function negamax(st, s, depth, alpha, beta, ply, ext, cfg) {
    st.nodes++;
    if ((st.nodes & 255) === 0 && now() > st.deadline) st.aborted = true;
    if (st.aborted) return 0;
    if (st.count >= NN) return 0; // hết chỗ: hòa
    var A = analyze(st, s);
    if (A.sFive >= 0) return WIN - ply;
    var o = 3 - s, moves;
    if (A.oFive.length) {
      // Đối phương có ô thành năm: chỉ được đi các nước chặn
      moves = defensesAgainst(st, s, A.oFive);
      if (!moves.length) return -(WIN - ply - 1);
      if (depth <= 0) {
        if (ext >= 6) return evalLeaf(A);
        // Nước chặn bắt buộc: đi tiếp, không trừ độ sâu (giới hạn số lần kéo dài)
        var fb = -INF;
        for (var q = 0; q < moves.length; q++) {
          place(st, moves[q], s);
          var fv = -negamax(st, o, 0, -beta, -alpha, ply + 1, ext + 1, cfg);
          unplace(st, moves[q]);
          if (fv > fb) fb = fv;
        }
        return fb;
      }
    } else {
      if (A.sMax >= SC_OPEN4 && !A.oHasFour) return WIN - ply - 2;
      if (depth <= 0) return evalLeaf(A);
      var width = Math.max(cfg.minWidth, cfg.width - 2 * ply);
      moves = orderMoves(A, width, cfg.defense);
    }
    if (!moves.length) return evalLeaf(A);
    var best = -INF;
    for (var k = 0; k < moves.length; k++) {
      var m = moves[k];
      place(st, m, s);
      var v = -negamax(st, o, depth - 1, -beta, -alpha, ply + 1, ext, cfg);
      unplace(st, m);
      if (st.aborted) return 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  /* ---------------- VCF: chuỗi nước bốn liên tục dẫn tới thắng ----------------
   * Mỗi nước của bên s đều tạo "bốn" nên đối phương buộc phải chặn đúng một ô. */
  function fivePointsNear(st, c, p) {
    var pts = [], b = st.board;
    for (var d = 0; d < 4; d++) {
      var base = (c * 4 + d) * 10;
      for (var k = 0; k < 10; k++) {
        var e = NB[base + k];
        if (e < 0 || b[e] !== EMPTY || pts.indexOf(e) >= 0) continue;
        b[e] = p;
        if (checkWin(b, e, st.rules)) pts.push(e);
        b[e] = EMPTY;
      }
    }
    return pts;
  }

  /* Các ô bên `def` có thể đặt để vô hiệu hóa MỌI ô thành năm `pts` của đối phương.
   * Thường chỉ là chính ô thành năm; với luật chặn hai đầu còn có thể là ô ngay sau
   * đầu dãy năm (biến dãy năm thành dãy bị chặn hai đầu). Rỗng = không chặn được. */
  function defensesAgainst(st, def, pts) {
    var b = st.board, att = 3 - def, cand = pts.slice(), k, j;
    if (st.rules.blockedBoth) {
      for (k = 0; k < pts.length; k++) {
        var f = pts[k];
        b[f] = att;
        var line = checkWin(b, f, st.rules);
        b[f] = EMPTY;
        if (!line || line.length < 2) continue;
        var dr = rowOf(line[1]) - rowOf(line[0]), dc = colOf(line[1]) - colOf(line[0]);
        var a = line[0], z = line[line.length - 1];
        var ends = [[rowOf(a) - dr, colOf(a) - dc], [rowOf(z) + dr, colOf(z) + dc]];
        for (j = 0; j < 2; j++) {
          if (!inside(ends[j][0], ends[j][1])) continue;
          var e = idx(ends[j][0], ends[j][1]);
          if (b[e] === EMPTY && cand.indexOf(e) < 0) cand.push(e);
        }
      }
    }
    var defs = [];
    for (k = 0; k < cand.length; k++) {
      var c = cand[k];
      b[c] = def;
      var still = false;
      for (j = 0; j < pts.length && !still; j++) {
        var p = pts[j];
        if (p === c) continue;
        b[p] = att;
        if (checkWin(b, p, st.rules)) still = true;
        b[p] = EMPTY;
      }
      b[c] = EMPTY;
      if (!still) defs.push(c);
    }
    return defs;
  }

  function vcf(st, s, depth) {
    if (depth <= 0) return -1;
    st.nodes++;
    if ((st.nodes & 63) === 0 && now() > st.deadline) st.aborted = true;
    if (st.aborted) return -1;
    var b = st.board, T = st.T, rules = st.rules, o = 3 - s;
    var cands = [];
    for (var i = 0; i < NN; i++) {
      if (b[i] !== EMPTY || st.near[i] === 0) continue;
      var v = cellScore(b, i, s, T, rules);
      if (v >= SC_FIVE) return i;
      if (hasFourFlag) cands.push({ i: i, v: v });
    }
    cands.sort(function (a, c) { return c.v - a.v; });
    for (var k = 0; k < cands.length; k++) {
      var m = cands[k].i, ok = false;
      place(st, m, s);
      var pts = fivePointsNear(st, m, s);
      if (pts.length) {
        var defs = defensesAgainst(st, o, pts);
        if (!defs.length) ok = true; // không chặn được: thắng
        else if (defs.length <= 3) {
          ok = true;
          for (var q = 0; q < defs.length && ok; q++) {
            var blk = defs[q];
            place(st, blk, o);
            // Nước chặn không được làm đối phương thành năm hoặc tạo bốn ngược lại
            if (checkWin(st.board, blk, rules) || fivePointsNear(st, blk, o).length) ok = false;
            else ok = vcf(st, s, depth - 1) >= 0;
            unplace(st, blk);
          }
        }
      }
      unplace(st, m);
      if (ok) return m;
      if (st.aborted) return -1;
    }
    return -1;
  }

  /* ---------------- Mức độ AI ---------------- */
  var LEVELS = {
    easy: { depth: 1, width: 8, minWidth: 6, time: 400, defense: 0.5, noise: 320, vcf: 0 },
    medium: { depth: 2, width: 10, minWidth: 6, time: 900, defense: 0.9, noise: 0, vcf: 0 },
    hard: { depth: 4, width: 18, minWidth: 10, time: 1500, defense: 0.9, noise: 0, vcf: 16 },
  };

  /* Chọn nước cho bên `player`.
   * opts: { level: 'easy'|'medium'|'hard', rules, timeLimit (ms), rng () => [0,1) }
   * Trả về { move, score, depth, nodes, ms, reason }. */
  function bestMove(board, player, opts) {
    opts = opts || {};
    var cfg = LEVELS[opts.level] || LEVELS.medium;
    var rules = normRules(opts.rules);
    var rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    var t0 = now();
    var limit = opts.timeLimit > 0 ? opts.timeLimit : cfg.time;
    var st = makeState(board, rules, t0 + limit);
    var s = player, o = 3 - player;
    function done(move, reason, score, depth) {
      return { move: move, reason: reason, score: score || 0, depth: depth || 0, nodes: st.nodes, ms: now() - t0 };
    }

    if (st.count === 0) {
      // Nước đầu: giữa bàn (mức Dễ lệch ngẫu nhiên một chút)
      var first = CENTER;
      if (cfg.noise) first = idx(5 + Math.floor(rng() * 5), 5 + Math.floor(rng() * 5));
      return done(first, 'opening');
    }
    if (st.count >= NN) return done(-1, 'full');

    var A = analyze(st, s);
    if (!A.cands.length) {
      for (var e = 0; e < NN; e++) if (st.board[e] === EMPTY) return done(e, 'any');
    }
    // 1. Thắng ngay
    if (A.sFive >= 0) return done(A.sFive, 'win', WIN);
    // 2. Chặn ô thành năm của đối phương (bốn, bốn mở)
    if (A.oFive.length) {
      var defs = defensesAgainst(st, s, A.oFive);
      if (!defs.length) defs = A.oFive.slice(); // không cứu được, vẫn chặn một đầu
      var blk = defs[0];
      for (var q = 1; q < defs.length; q++) {
        var c = defs[q];
        if ((A.ms[c] || 0) + (A.mo[c] || 0) > (A.ms[blk] || 0) + (A.mo[blk] || 0)) blk = c;
      }
      return done(blk, 'block');
    }
    // 3. Mức Dễ: chỉ nhìn một nước, có nhiễu ngẫu nhiên, ít để ý phòng thủ
    if (cfg.noise) {
      var bestE = -1, bestV = -INF;
      for (var k = 0; k < A.cands.length; k++) {
        var ci = A.cands[k];
        var v = A.ms[ci] + cfg.defense * Math.min(A.mo[ci], 2000) + rng() * cfg.noise;
        if (v > bestV) { bestV = v; bestE = ci; }
      }
      return done(bestE, 'easy', bestV, 1);
    }
    // 4. Tạo bốn mở / hai đường bốn khi đối phương không có bốn để phản công
    if (A.sMax >= SC_OPEN4 && !A.oHasFour) {
      var wm = -1, wv = -1;
      for (var w = 0; w < A.cands.length; w++) if (A.ms[A.cands[w]] > wv) { wv = A.ms[A.cands[w]]; wm = A.cands[w]; }
      return done(wm, 'open4', WIN - 2);
    }
    // 5. Mức Khó: tìm chuỗi bốn liên tục (dành tối đa 1/3 thời gian)
    if (cfg.vcf) {
      var saved = st.deadline;
      st.deadline = t0 + limit / 3;
      var vm = vcf(st, s, cfg.vcf);
      st.deadline = saved;
      st.aborted = false;
      if (vm >= 0) return done(vm, 'vcf', WIN - 3);
    }
    // 6. Alpha-beta, đào sâu dần trong giới hạn thời gian
    var rootMoves = orderMoves(A, cfg.width + 4, cfg.defense);
    if (rootMoves.length === 1) return done(rootMoves[0], 'forced');
    // Đầu ván: xáo nhẹ các nước ngang điểm để mỗi ván một khác
    if (st.count <= 2) {
      for (var z = rootMoves.length - 1; z > 0; z--) {
        var y = Math.floor(rng() * (z + 1)), tmp = rootMoves[z];
        rootMoves[z] = rootMoves[y]; rootMoves[y] = tmp;
      }
    }
    var best = rootMoves[0], bestScore = -INF, reached = 0;
    for (var depth = 1; depth <= cfg.depth; depth++) {
      var alpha = -INF, iterBest = -1, scores = {};
      for (var r = 0; r < rootMoves.length; r++) {
        var m = rootMoves[r];
        place(st, m, s);
        var sc = -negamax(st, o, depth - 1, -INF, -alpha, 1, 0, cfg);
        unplace(st, m);
        if (st.aborted) break;
        scores[m] = sc;
        if (sc > alpha) { alpha = sc; iterBest = m; }
      }
      if (st.aborted) {
        // Vòng dở dang: chỉ nhận nước tốt hơn nếu nước tốt nhất cũ đã được xét xong
        if (iterBest >= 0 && scores[rootMoves[0]] !== undefined) best = iterBest;
        break;
      }
      best = iterBest; bestScore = alpha; reached = depth;
      rootMoves.sort(function (a, b2) { return scores[b2] - scores[a]; });
      if (alpha >= WIN - 100 || alpha <= -(WIN - 100)) break;
    }
    return done(best, 'search', bestScore, reached);
  }

  /* ---------------- Web Worker ---------------- */
  // Nhận { id, board, player, opts } → trả { id, res }
  function serve(scope) {
    scope.onmessage = function (e) {
      var d = e.data || {};
      var res;
      try { res = bestMove(d.board, d.player, d.opts); }
      catch (err) { res = { move: -1, error: String(err && err.message || err) }; }
      scope.postMessage({ id: d.id, res: res });
    };
  }

  return {
    SIZE: N,
    CELLS: NN,
    EMPTY: EMPTY,
    X: X,
    O: O,
    CENTER: CENTER,
    DEFAULT_RULES: DEFAULT_RULES,
    LEVELS: LEVELS,
    idx: idx,
    rowOf: rowOf,
    colOf: colOf,
    normRules: normRules,
    createBoard: createBoard,
    checkWin: checkWin,
    isFull: isFull,
    replay: replay,
    shapeAt: shapeAt,
    bestMove: bestMove,
    serve: serve,
  };
});
