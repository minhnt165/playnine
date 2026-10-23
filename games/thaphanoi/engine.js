/* =====================================================================
 * Tháp Hà Nội - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   - Ba cọc 0 (trái), 1 (giữa), 2 (phải); mỗi cọc là mảng đĩa từ đáy lên đỉnh, đĩa ghi bằng cỡ 1..n (1 nhỏ nhất)
 *   - Ván mới: cả chồng ở cọc trái; thắng khi cả chồng sang cọc phải
 *   - Mỗi nước chuyển đĩa trên cùng của một cọc sang cọc khác, không đặt đĩa lớn lên đĩa nhỏ
 *   - Bàn xuất phát cố định nên không cần PRNG; solve() cho lời giải tối ưu từ mọi trạng thái hợp lệ
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)
  const DISKS = [4, 5, 6, 7]; // số đĩa của các mode d4..d7
  const GOAL = 2; // cọc đích: cọc phải

  const isPeg = (p) => p === 0 || p === 1 || p === 2;
  const minMoves = (n) => Math.pow(2, n) - 1;

  function newGame(n) {
    if (DISKS.indexOf(n) < 0) throw new Error('số đĩa không hợp lệ: ' + n);
    const stack = [];
    for (let k = n; k >= 1; k--) stack.push(k);
    return { n, pegs: [stack, [], []], moves: 0 };
  }

  /** Cỡ đĩa trên cùng của cọc p, 0 nếu cọc trống. */
  const top = (g, p) => {
    const s = g.pegs[p];
    return s.length ? s[s.length - 1] : 0;
  };

  const isWon = (g) => g.pegs[GOAL].length === g.n;

  /** Đi được từ cọc `from` sang cọc `to` không: cọc nguồn có đĩa, cọc đích trống hoặc đĩa trên cùng lớn hơn. */
  function canMove(g, from, to) {
    if (!isPeg(from) || !isPeg(to) || from === to || isWon(g)) return false;
    const d = top(g, from);
    if (!d) return false;
    const under = top(g, to);
    return under === 0 || under > d;
  }

  /** Ván mới sau nước đi, hoặc null nếu sai luật (ván cũ không đổi). */
  function move(g, from, to) {
    if (!canMove(g, from, to)) return null;
    const pegs = g.pegs.map((s) => s.slice());
    pegs[to].push(pegs[from].pop());
    return { n: g.n, pegs, moves: g.moves + 1 };
  }

  /**
   * Lời giải ngắn nhất đưa cả chồng về cọc `target` (mặc định cọc phải) từ trạng thái bất kỳ: mảng [from, to].
   * Xét từ đĩa lớn nhất: đã ở đích thì bỏ qua; chưa thì dồn các đĩa nhỏ hơn sang cọc còn lại, chuyển nó, rồi dồn lại lên.
   */
  function solve(g, target) {
    const t0 = target == null ? GOAL : target;
    const pos = [];
    g.pegs.forEach((s, p) => s.forEach((k) => { pos[k] = p; }));
    const out = [];
    function tower(k, t) {
      if (k === 0) return;
      if (pos[k] === t) return tower(k - 1, t);
      const from = pos[k];
      tower(k - 1, 3 - from - t);
      out.push([from, t]);
      pos[k] = t;
      tower(k - 1, t);
    }
    tower(g.n, t0);
    return out;
  }

  const toJSON = (g) => ({ v: VERSION, n: g.n, pegs: g.pegs.map((s) => s.slice()), moves: g.moves });

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { n, pegs, moves } = raw;
    if (DISKS.indexOf(n) < 0 || !Number.isInteger(moves) || moves < 0) return null;
    if (!Array.isArray(pegs) || pegs.length !== 3 || !pegs.every(Array.isArray)) return null;
    const seen = [];
    for (const s of pegs) {
      for (let i = 0; i < s.length; i++) {
        const k = s[i];
        if (!Number.isInteger(k) || k < 1 || k > n || seen[k]) return null;
        if (i > 0 && s[i - 1] < k) return null; // đĩa lớn nằm trên đĩa nhỏ
        seen[k] = true;
      }
    }
    if (pegs[0].length + pegs[1].length + pegs[2].length !== n) return null;
    if (moves === 0 && pegs[0].length !== n) return null; // chưa đi nước nào thì cả chồng phải ở cọc trái
    return { n, pegs: pegs.map((s) => s.slice()), moves };
  }

  const api = { VERSION, DISKS, GOAL, minMoves, newGame, top, isWon, canMove, move, solve, toJSON, fromJSON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
