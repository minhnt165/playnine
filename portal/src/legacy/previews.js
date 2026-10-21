// Chép từ cổng cũ (index.html). Chỉ đổi phụ thuộc: Player.current -> opts.isPlaying(), reduceMotion -> opts.reduceMotion,
// document -> root, thêm hàm dọn.
/**
 * Chạy pv_<id> cho mọi `.preview[data-game]` trong `root`; trả hàm dọn.
 * @param {HTMLElement} root
 * @param {{ isPlaying(): boolean, reduceMotion: boolean }} opts
 * @returns {() => void}
 */
export function mountPreviews(root, opts) {
  const Previews = {
    timers: [],
    injected: [],
    mount() {
      this.timers.forEach(clearInterval);
      this.timers = [];
      this.injected = [];
      if (this.io) this.io.disconnect();
      // Chỉ chạy ô xem trước đang nằm trong màn hình (tiết kiệm pin trên điện thoại)
      this.io = 'IntersectionObserver' in window
        ? new IntersectionObserver((entries) => entries.forEach((e) => { e.target.vis = e.isIntersecting; }))
        : null;
      root.querySelectorAll('.preview[data-game]').forEach((el) => {
        el.vis = !this.io;
        if (this.io) this.io.observe(el);
        const before = new Set(el.childNodes);
        const fn = this['pv_' + el.dataset.game];
        if (fn) fn.call(this, el);
        // Ghi lại phần tử preview vừa chèn để dọn khi gỡ (không đụng tới con do React quản lý)
        el.childNodes.forEach((n) => { if (!before.has(n)) this.injected.push(n); });
      });
      return () => this.stop();
    },
    /** Dọn: dừng mọi interval, ngắt IntersectionObserver, gỡ phần tử preview đã chèn. */
    stop() {
      this.timers.forEach(clearInterval);
      this.timers = [];
      if (this.io) this.io.disconnect();
      this.io = null;
      this.injected.forEach((n) => n.remove());
      this.injected = [];
    },
    idle(host) { return document.hidden || opts.isPlaying() || !host.vis; },
    pv_sudoku(host) { this.sudoku(host); },
    pv_xiangqi(host) { this.xiangqi(host); },

    /** Chạy `tick` theo nhịp, tạm dừng khi tab ẩn hoặc đang chơi game. */
    loop(host, ms, tick) {
      if (opts.reduceMotion) return;
      this.timers.push(setInterval(() => { if (!this.idle(host)) tick(); }, ms));
    },

    // Cờ 9 Ô: hai bên đi ngẫu nhiên theo đúng luật, bàn nhỏ phải đi được tô sáng
    pv_co9o(host) {
      const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
      const winner = (a) => { for (const [x, y, z] of LINES) if (a[x] && a[x] < 3 && a[x] === a[y] && a[y] === a[z]) return a[x]; return 0; };
      const grid = document.createElement('div');
      grid.className = 'mini-u';
      const boards = [], cells = [];
      for (let b = 0; b < 9; b++) {
        const el = document.createElement('div');
        el.className = 'b';
        for (let c = 0; c < 9; c++) { const s = document.createElement('span'); s.className = 'c'; el.appendChild(s); cells.push(s); }
        boards.push(el);
        grid.appendChild(el);
      }
      host.appendChild(grid);
      let cell, small, next, turn, over;
      const legal = () => {
        const out = [];
        for (let b = 0; b < 9; b++) {
          if (small[b] || (next >= 0 && next !== b)) continue;
          for (let c = 0; c < 9; c++) if (!cell[b * 9 + c]) out.push(b * 9 + c);
        }
        return out;
      };
      const paint = (last) => {
        for (let i = 0; i < 81; i++) {
          const v = cell[i];
          cells[i].textContent = v === 1 ? '✕' : v === 2 ? '○' : '';
          cells[i].className = 'c' + (v === 1 ? ' x' : v === 2 ? ' o' : '') + (i === last ? ' last' : '');
        }
        boards.forEach((el, b) => {
          el.classList.toggle('on', !over && !small[b] && (next < 0 || next === b));
          if (small[b]) el.dataset.w = small[b] === 1 ? 'X' : small[b] === 2 ? 'O' : '–';
          else delete el.dataset.w;
        });
      };
      const reset = () => { cell = new Array(81).fill(0); small = new Array(9).fill(0); next = -1; turn = 1; over = 0; paint(-1); };
      reset();
      let pause = 0;
      this.loop(host, 420, () => {
        if (pause > 0) { if (--pause === 0) reset(); return; }
        const moves = legal();
        if (!moves.length || over) { pause = 6; over = 1; paint(-1); return; }
        const m = moves[Math.floor(Math.random() * moves.length)];
        const b = Math.floor(m / 9), c = m % 9;
        cell[m] = turn;
        const sub = cell.slice(b * 9, b * 9 + 9);
        const w = winner(sub);
        if (w) small[b] = w;
        else if (sub.every(Boolean)) small[b] = 3;
        if (winner(small)) over = 1;
        next = small[c] ? -1 : c;
        turn = 3 - turn;
        paint(m);
        if (over) pause = 7;
      });
    },

    // Dò mìn: mở loang từ một ô trống rồi cắm cờ lên mìn
    pv_minesweeper(host) {
      const N = 9;
      const MINES = [2, 7, 15, 31, 40, 52, 58, 66, 73, 79];
      const isMine = new Array(N * N).fill(false);
      MINES.forEach((i) => { isMine[i] = true; });
      const around = (i) => {
        const r = Math.floor(i / N), c = i % N, out = [];
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if ((dr || dc) && rr >= 0 && rr < N && cc >= 0 && cc < N) out.push(rr * N + cc);
        }
        return out;
      };
      const count = isMine.map((_, i) => around(i).filter((j) => isMine[j]).length);
      // Thứ tự mở: loang từ ô trống ở góc dưới trái, sau đó các ô an toàn còn lại, cuối cùng cắm cờ
      const start = 72 - N * 2;
      const order = [], seen = new Set([start]), queue = [start];
      while (queue.length) {
        const i = queue.shift();
        order.push(i);
        if (count[i] === 0) around(i).forEach((j) => { if (!seen.has(j) && !isMine[j]) { seen.add(j); queue.push(j); } });
      }
      for (let i = 0; i < N * N; i++) if (!isMine[i] && !seen.has(i)) order.push(i);
      const steps = order.map((i) => ({ i, flag: false })).concat(MINES.map((i) => ({ i, flag: true })));

      const grid = document.createElement('div');
      grid.className = 'mini-ms';
      const cells = [];
      for (let i = 0; i < N * N; i++) { const s = document.createElement('span'); cells.push(s); grid.appendChild(s); }
      host.appendChild(grid);
      let k = 0, pause = 0;
      const reset = () => { cells.forEach((s) => { s.className = ''; s.textContent = ''; }); k = 0; };
      if (opts.reduceMotion) { steps.slice(0, 30).forEach(({ i }) => { cells[i].className = 'open' + (count[i] ? ' n' + count[i] : ''); cells[i].textContent = count[i] || ''; }); return; }
      this.loop(host, 110, () => {
        if (pause > 0) { if (--pause === 0) reset(); return; }
        // Mỗi nhịp mở vài ô để vùng loang trông tự nhiên
        for (let n = 0; n < 2 && k < steps.length; n++, k++) {
          const { i, flag } = steps[k];
          if (flag) cells[i].className = 'flag';
          else { cells[i].className = 'open' + (count[i] ? ' n' + count[i] : ''); cells[i].textContent = count[i] || ''; }
        }
        if (k >= steps.length) pause = 22;
      });
    },

    // Cờ Caro: một ván ngắn, X thắng năm quân chéo
    pv_caro(host) {
      const N = 10, S = 18, P = 9;
      // Ván mẫu [x, y], X đi trước, kết thúc bằng 5 quân X chéo (3,6) → (7,2); O chỉ chặn được một đầu
      const MOVES = [[5, 4], [5, 5], [4, 5], [6, 5], [6, 3], [4, 4], [5, 6], [3, 3], [3, 6], [2, 7], [7, 2]];
      let lines = '';
      for (let i = 0; i <= N; i++) {
        lines += '<line x1="' + P + '" y1="' + (P + i * S) + '" x2="' + (P + N * S) + '" y2="' + (P + i * S) + '"/>';
        lines += '<line x1="' + (P + i * S) + '" y1="' + P + '" x2="' + (P + i * S) + '" y2="' + (P + N * S) + '"/>';
      }
      const W = P * 2 + N * S;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + W);
      svg.setAttribute('class', 'mini-caro');
      svg.innerHTML = '<rect width="' + W + '" height="' + W + '" rx="8" fill="#f3e6c8"/><g stroke="#b99a62" stroke-width=".8">' + lines + '</g><g class="stones"></g>';
      host.appendChild(svg);
      const layer = svg.querySelector('.stones');
      const cx = (x) => P + x * S + S / 2;
      const board = {};
      const five = (x, y, who) => {
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
          const run = [[x, y]];
          for (let s = 1; board[(x + dx * s) + ',' + (y + dy * s)] === who; s++) run.push([x + dx * s, y + dy * s]);
          for (let s = 1; board[(x - dx * s) + ',' + (y - dy * s)] === who; s++) run.unshift([x - dx * s, y - dy * s]);
          if (run.length >= 5) return run;
        }
        return null;
      };
      let k = 0, pause = 0;
      const reset = () => { layer.innerHTML = ''; for (const key in board) delete board[key]; k = 0; };
      const place = ([x, y], who) => {
        board[x + ',' + y] = who;
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'st');
        g.innerHTML = who === 1
          ? '<path d="M' + (cx(x) - 5) + ' ' + (cx(y) - 5) + 'l10 10m0-10l-10 10" stroke="#b3261e" stroke-width="2.6" stroke-linecap="round"/>'
          : '<circle cx="' + cx(x) + '" cy="' + cx(y) + '" r="5.4" fill="none" stroke="#1d1711" stroke-width="2.4"/>';
        layer.appendChild(g);
      };
      const step = () => {
        if (k >= MOVES.length) return true;
        const who = k % 2 === 0 ? 1 : 2;
        const m = MOVES[k++];
        if (board[m[0] + ',' + m[1]]) return false;
        place(m, who);
        const run = five(m[0], m[1], who);
        if (run) {
          const a = run[0], b = run[run.length - 1];
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('class', 'win');
          line.setAttribute('x1', cx(a[0])); line.setAttribute('y1', cx(a[1]));
          line.setAttribute('x2', cx(b[0])); line.setAttribute('y2', cx(b[1]));
          layer.appendChild(line);
          return true;
        }
        return false;
      };
      if (opts.reduceMotion) { while (!step()); return; }
      this.loop(host, 600, () => {
        if (pause > 0) { if (--pause === 0) reset(); return; }
        if (step()) pause = 6;
      });
    },

    // Ô Ăn Quan: hai bên lần lượt rải quân, ăn theo luật cơ bản (ô trống rồi ô có quân thì ăn)
    pv_oanquan(host) {
      // 12 ô theo chiều kim đồng hồ: 0 quan trái, 1–5 hàng trên trái→phải, 6 quan phải, 7–11 hàng dưới phải→trái
      const C = [[32, 55]];
      for (let k = 0; k < 5; k++) C.push([70 + 40 * k, 32]);
      C.push([268, 55]);
      for (let k = 0; k < 5; k++) C.push([230 - 40 * k, 78]);
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 300 110');
      svg.setAttribute('class', 'mini-oq');
      let frame = '<rect x="50" y="10" width="200" height="90" rx="4" fill="#d9b77a" stroke="#6b4a1f" stroke-width="2.5"/>' +
        '<path d="M50 10A40 45 0 0 0 50 100M250 10A40 45 0 0 1 250 100" fill="#d9b77a" stroke="#6b4a1f" stroke-width="2.5"/>' +
        '<path d="M50 55H250" stroke="#6b4a1f" stroke-width="2"/>';
      for (let k = 1; k < 5; k++) frame += '<path d="M' + (50 + 40 * k) + ' 10V100" stroke="#6b4a1f" stroke-width="2"/>';
      svg.innerHTML = '<g>' + frame + '</g><g class="hls"></g><g class="stones"></g>';
      host.appendChild(svg);
      const hls = svg.querySelector('.hls'), layer = svg.querySelector('.stones');
      // Vị trí sỏi lệch ngẫu nhiên cố định cho mỗi ô
      const JIT = C.map(() => Array.from({ length: 14 }, (_, i) => [((i % 4) - 1.5) * 7 + (Math.random() - 0.5) * 3, (Math.floor(i / 4) - 1.5) * 6 + (Math.random() - 0.5) * 3]));
      let cnt, big, turn, hand, pos, dir, phase, turns, pause = 0, mark = -1, capMark = -1;
      const isQuan = (i) => i === 0 || i === 6;
      const reset = () => { cnt = [0, 5, 5, 5, 5, 5, 0, 5, 5, 5, 5, 5]; big = { 0: true, 6: true }; turn = 0; hand = 0; phase = 'pick'; turns = 0; mark = capMark = -1; paint(); };
      const paint = () => {
        let s = '';
        C.forEach(([x, y], i) => {
          if (big[i]) s += '<ellipse cx="' + x + '" cy="' + (y - 14) + '" rx="9" ry="7" fill="#5a4636" stroke="#2b1f15"/>';
          for (let k = 0; k < Math.min(cnt[i], 14); k++) {
            const [dx, dy] = JIT[i][k];
            s += '<circle cx="' + (x + dx) + '" cy="' + (y + dy + (isQuan(i) ? 6 : 0)) + '" r="2.6" fill="#f3ead8" stroke="#8a7350" stroke-width=".6"/>';
          }
          if (cnt[i] > 14) s += '<text x="' + x + '" y="' + (y + 18) + '" text-anchor="middle" font-size="8" font-weight="700" fill="#3b2a14">' + cnt[i] + '</text>';
        });
        layer.innerHTML = s;
        const box = (i, cls) => isQuan(i)
          ? '<ellipse class="' + cls + '" cx="' + (i === 0 ? 42 : 258) + '" cy="55" rx="24" ry="40"/>'
          : '<rect class="' + cls + '" x="' + (C[i][0] - 20) + '" y="' + (C[i][1] < 55 ? 10 : 55) + '" width="40" height="45"/>';
        hls.innerHTML = (mark >= 0 ? box(mark, 'hl') : '') + (capMark >= 0 ? box(capMark, 'cap') : '');
      };
      const nextOf = (i) => (i + dir + 12) % 12;
      const startTurn = () => {
        const mine = turn === 0 ? [7, 8, 9, 10, 11] : [1, 2, 3, 4, 5];
        const opts = mine.filter((i) => cnt[i] > 0);
        if (!opts.length || turns > 24 || (!big[0] && !big[6] && !cnt[0] && !cnt[6])) { pause = 6; return; }
        pos = opts[Math.floor(Math.random() * opts.length)];
        dir = Math.random() < 0.5 ? 1 : -1;
        hand = cnt[pos]; cnt[pos] = 0; mark = pos; phase = 'sow'; turns++;
      };
      const endTurn = () => { turn = 1 - turn; phase = 'pick'; };
      reset();
      this.loop(host, 240, () => {
        if (pause > 0) { if (--pause === 0) reset(); return; }
        capMark = -1;
        if (phase === 'pick') startTurn();
        else if (phase === 'sow') {
          pos = nextOf(pos); cnt[pos]++; hand--; mark = pos;
          if (hand === 0) phase = 'after';
        } else if (phase === 'after') {
          const n = nextOf(pos);
          if (isQuan(n)) endTurn();
          else if (cnt[n] > 0) { hand = cnt[n]; cnt[n] = 0; pos = n; mark = n; phase = 'sow'; }
          else {
            const a = nextOf(n);
            if (cnt[a] > 0 || big[a]) { cnt[a] = 0; big[a] = false; capMark = a; pos = a; mark = -1; phase = 'chain'; }
            else endTurn();
          }
        } else if (phase === 'chain') {
          // Sau ô vừa ăn (pos): lại gặp một ô trống rồi một ô có quân thì ăn tiếp
          const e = nextOf(pos), t = (e + dir + 12) % 12;
          if (cnt[e] === 0 && !big[e] && (cnt[t] > 0 || big[t])) { cnt[t] = 0; big[t] = false; capMark = t; pos = t; }
          else endTurn();
        }
        paint();
      });
    },

    // Tranh Ẩn: tô dần hình trái tim theo gợi ý số, xong thì tranh đổi màu
    pv_tranhan(host) {
      const PIC = ['........', '.XX..XX.', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '...XX...'];
      const N = 8;
      const runs = (line) => { const r = line.match(/X+/g); return r ? r.map((s) => s.length) : [0]; };
      const rowClue = PIC.map((r) => runs(r).join(' '));
      const colClue = Array.from({ length: N }, (_, c) => runs(PIC.map((r) => r[c]).join('')).join('\n'));
      const grid = document.createElement('div');
      grid.className = 'mini-nono';
      const cells = [], rowEls = [], colEls = [];
      grid.appendChild(document.createElement('span')).className = 'clue';
      colClue.forEach((t) => { const s = document.createElement('span'); s.className = 'clue'; s.textContent = t; colEls.push(s); grid.appendChild(s); });
      for (let r = 0; r < N; r++) {
        const s = document.createElement('span'); s.className = 'clue'; s.textContent = rowClue[r]; rowEls.push(s); grid.appendChild(s);
        for (let c = 0; c < N; c++) { const cell = document.createElement('span'); cells.push(cell); grid.appendChild(cell); }
      }
      host.appendChild(grid);
      const fills = [], blanks = [];
      PIC.forEach((r, ri) => [...r].forEach((ch, ci) => (ch === 'X' ? fills : blanks).push(ri * N + ci)));
      let order, k, pause = 0, state;
      const lineDone = (idxs) => idxs.every((i) => (PIC[Math.floor(i / N)][i % N] === 'X') === (state[i] === 1));
      const paint = () => {
        cells.forEach((el, i) => { el.className = state[i] === 1 ? 'f' : state[i] === 2 ? 'x' : ''; });
        rowEls.forEach((el, r) => el.classList.toggle('ok', lineDone(Array.from({ length: N }, (_, c) => r * N + c))));
        colEls.forEach((el, c) => el.classList.toggle('ok', lineDone(Array.from({ length: N }, (_, r) => r * N + c))));
      };
      const reset = () => {
        state = new Array(N * N).fill(0);
        // Tô theo hàng từ trên xuống, xen vài dấu X như người chơi thật
        order = fills.map((i) => ({ i, v: 1 })).concat(blanks.filter(() => Math.random() < 0.35).map((i) => ({ i, v: 2 })));
        order.sort((a, b) => a.i - b.i + (Math.random() - 0.5) * 6);
        k = 0;
        grid.classList.remove('done');
        paint();
      };
      reset();
      if (opts.reduceMotion) { fills.forEach((i) => { state[i] = 1; }); grid.classList.add('done'); paint(); return; }
      this.loop(host, 130, () => {
        if (pause > 0) { if (--pause === 0) reset(); return; }
        if (k < order.length) { const { i, v } = order[k++]; state[i] = v; paint(); return; }
        grid.classList.add('done');
        pause = 22;
      });
    },

    // Xếp Gạch: khối rơi vào chỗ tốt nhất theo cách chấm đơn giản, đầy hàng thì ăn
    pv_xepgach(host) {
      const W = 8, H = 14;
      const COLORS = ['#5fd0d0', '#e0b964', '#c39bff', '#5fd08f', '#e5534b', '#7aa2ff', '#f2a65a'];
      const BASE = [[[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [2, 0], [1, 1]], [[1, 0], [2, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]], [[0, 0], [0, 1], [1, 1], [2, 1]], [[2, 0], [0, 1], [1, 1], [2, 1]]];
      const norm = (cs) => { const mx = Math.min(...cs.map((c) => c[0])), my = Math.min(...cs.map((c) => c[1])); return cs.map(([x, y]) => [x - mx, y - my]); };
      const ROTS = BASE.map((b) => { const out = [b]; for (let r = 1; r < 4; r++) out.push(norm(out[r - 1].map(([x, y]) => [-y, x]))); return out; });
      const grid = document.createElement('div');
      grid.className = 'mini-tet';
      const cells = [];
      for (let i = 0; i < W * H; i++) { const s = document.createElement('span'); cells.push(s); grid.appendChild(s); }
      host.appendChild(grid);
      let board, piece, target, flash = [];
      const fits = (shape, px, py) => shape.every(([x, y]) => { const X = px + x, Y = py + y; return X >= 0 && X < W && Y < H && (Y < 0 || !board[Y * W + X]); });
      const choose = () => {
        const t = Math.floor(Math.random() * 7);
        let best = null;
        ROTS[t].forEach((shape) => {
          const w = Math.max(...shape.map((c) => c[0])) + 1;
          for (let x = 0; x + w <= W; x++) {
            if (!fits(shape, x, 0)) continue;
            let y = 0;
            while (fits(shape, x, y + 1)) y++;
            const tmp = board.slice();
            shape.forEach(([cx, cy]) => { tmp[(y + cy) * W + x + cx] = 1; });
            let lines = 0, holes = 0;
            for (let r = 0; r < H; r++) if (tmp.slice(r * W, r * W + W).every(Boolean)) lines++;
            shape.forEach(([cx, cy]) => { const below = (y + cy + 1) * W + x + cx; if (y + cy + 1 < H && !tmp[below]) holes++; });
            const score = shape.reduce((s, c) => s + y + c[1], 0) + lines * 12 - holes * 5 + Math.random();
            if (!best || score > best.score) best = { score, shape, x, y };
          }
        });
        if (!best) return false;
        piece = { t, shape: best.shape, x: best.x, y: 0 };
        target = best.y;
        return true;
      };
      const paint = () => {
        cells.forEach((el, i) => { el.style.background = board[i] ? COLORS[board[i] - 1] : 'rgba(255,255,255,.05)'; el.className = flash.includes(Math.floor(i / W)) ? 'clr' : ''; });
        if (piece) piece.shape.forEach(([x, y]) => { const Y = piece.y + y; if (Y >= 0) cells[Y * W + piece.x + x].style.background = COLORS[piece.t]; });
      };
      const reset = () => { board = new Array(W * H).fill(0); piece = null; flash = []; };
      reset();
      // Dựng sẵn vài hàng đáy để ăn hàng sớm
      for (let r = H - 3; r < H; r++) for (let c = 0; c < W; c++) if (Math.random() < 0.7 && c !== (r * 3) % W) board[r * W + c] = 1 + Math.floor(Math.random() * 7);
      if (opts.reduceMotion) { paint(); return; }
      this.loop(host, 120, () => {
        if (flash.length) {
          // Xóa các hàng đầy rồi dồn xuống
          flash.sort((a, b) => a - b).forEach((r) => { board.splice(r * W, W); board.unshift(...new Array(W).fill(0)); });
          flash = [];
        } else if (!piece) {
          if (!choose()) { reset(); }
        } else if (piece.y < target) piece.y++;
        else {
          piece.shape.forEach(([x, y]) => { board[(piece.y + y) * W + piece.x + x] = piece.t + 1; });
          piece = null;
          for (let r = 0; r < H; r++) if (board.slice(r * W, r * W + W).every(Boolean)) flash.push(r);
        }
        paint();
      });
      paint();
    },

    // Rắn Săn Mồi: rắn tìm đường ngắn nhất tới mồi (BFS), kẹt thì chơi lại
    pv_ran(host) {
      const W = 12, H = 10;
      const grid = document.createElement('div');
      grid.className = 'mini-snake';
      const cells = [];
      for (let i = 0; i < W * H; i++) { const s = document.createElement('span'); cells.push(s); grid.appendChild(s); }
      host.appendChild(grid);
      let snake, food, pause = 0;
      const free = (i, body) => !body.includes(i);
      const nbrs = (i) => {
        const x = i % W, y = Math.floor(i / W), out = [];
        if (x > 0) out.push(i - 1); if (x < W - 1) out.push(i + 1);
        if (y > 0) out.push(i - W); if (y < H - 1) out.push(i + W);
        return out;
      };
      const placeFood = () => {
        const empty = [];
        for (let i = 0; i < W * H; i++) if (!snake.includes(i)) empty.push(i);
        food = empty[Math.floor(Math.random() * empty.length)];
      };
      const step = () => {
        const head = snake[0];
        const body = snake.slice(0, -1); // đuôi sẽ rời đi
        const prev = new Map([[head, -1]]), q = [head];
        while (q.length) {
          const c = q.shift();
          if (c === food) break;
          nbrs(c).forEach((n) => { if (!prev.has(n) && free(n, body)) { prev.set(n, c); q.push(n); } });
        }
        let next;
        if (prev.has(food)) { next = food; while (prev.get(next) !== head) next = prev.get(next); }
        else next = nbrs(head).find((n) => free(n, body));
        if (next === undefined) return false;
        snake.unshift(next);
        if (next === food) placeFood(); else snake.pop();
        return snake.length < 34;
      };
      const paint = () => {
        cells.forEach((el) => { el.className = ''; el.style.opacity = ''; });
        cells[food].className = 'f';
        snake.forEach((i, k) => { cells[i].className = k === 0 ? 'h' : 'b'; if (k) cells[i].style.opacity = String(1 - (k / snake.length) * 0.55); });
      };
      const reset = () => { snake = [W * 5 + 4, W * 5 + 3, W * 5 + 2]; placeFood(); paint(); };
      reset();
      this.loop(host, 140, () => {
        if (pause > 0) { if (--pause === 0) reset(); return; }
        if (!step()) pause = 8;
        paint();
      });
    },

    // Nối Hình: lần lượt đưa ô xuống khay, đủ 3 ô cùng hình thì biến mất
    pv_noihinh(host) {
      const ICONS = ['💄', '🧺', '🎮', '🦆'];
      // 12 ô (4 hình x 3), ô thứ k trên bàn mang hình BOARD[k]; ORDER là thứ tự chạm
      const BOARD = [0, 1, 2, 3, 2, 0, 3, 1, 1, 3, 0, 2];
      const ORDER = [0, 5, 1, 10, 7, 2, 8, 4, 3, 11, 6, 9];
      const grid = document.createElement('div');
      grid.className = 'mini-nh';
      const board = document.createElement('div');
      board.className = 'b';
      const tray = document.createElement('div');
      tray.className = 't';
      const tiles = BOARD.map((type) => { const s = document.createElement('span'); s.textContent = ICONS[type]; board.appendChild(s); return s; });
      const slots = [];
      for (let i = 0; i < 7; i++) { const s = document.createElement('span'); tray.appendChild(s); slots.push(s); }
      grid.append(board, tray);
      host.appendChild(grid);
      let k = 0, inTray = [], pause = 0;
      const paintTray = () => slots.forEach((s, i) => { s.textContent = inTray[i] != null ? ICONS[inTray[i]] : ''; s.className = inTray[i] != null ? 'on' : ''; });
      const reset = () => { tiles.forEach((s) => { s.className = ''; }); inTray = []; k = 0; paintTray(); };
      if (opts.reduceMotion) return;
      this.loop(host, 520, () => {
        if (pause > 0) { if (--pause === 0) reset(); return; }
        // Bộ ba đã đủ ở nhịp trước: xoá khỏi khay
        const full = [0, 1, 2, 3].find((t) => inTray.filter((x) => x === t).length === 3);
        if (full != null) { inTray = inTray.filter((x) => x !== full); paintTray(); return; }
        if (k >= ORDER.length) { pause = 4; return; }
        const i = ORDER[k++];
        tiles[i].className = 'gone';
        const type = BOARD[i];
        const at = inTray.lastIndexOf(type);
        inTray.splice(at < 0 ? inTray.length : at + 1, 0, type);
        paintTray();
      });
    },

    // 2048: tự chơi theo thứ tự ưu tiên trái → xuống → phải → lên
    pv_2048(host) {
      const COLORS = { 2: '#f3e6c8', 4: '#efd9a6', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f', 64: '#e8622c', 128: '#edcf72', 256: '#e0b964', 512: '#d9a13a', 1024: '#c9902d', 2048: '#b3261e' };
      const grid = document.createElement('div');
      grid.className = 'mini-2048';
      const cells = [];
      for (let i = 0; i < 16; i++) { const s = document.createElement('span'); cells.push(s); grid.appendChild(s); }
      host.appendChild(grid);
      let b;
      const spawn = () => {
        const empty = [];
        b.forEach((v, i) => { if (!v) empty.push(i); });
        if (!empty.length) return -1;
        const i = empty[Math.floor(Math.random() * empty.length)];
        b[i] = Math.random() < 0.9 ? 2 : 4;
        return i;
      };
      const paint = (popped) => {
        cells.forEach((s, i) => {
          const v = b[i];
          s.textContent = v || '';
          s.style.background = v ? COLORS[Math.min(v, 2048)] : '';
          s.style.color = v >= 8 ? '#fff' : '#1d1711';
          s.className = popped.has(i) ? 'pop' : '';
          void s.offsetWidth; // chạy lại hiệu ứng pop
        });
      };
      // Gộp một hàng 4 ô về đầu hàng; trả về danh sách vị trí vừa gộp
      const slide = (idx) => {
        const vals = idx.map((i) => b[i]).filter(Boolean);
        const out = [], merged = [];
        for (let i = 0; i < vals.length; i++) {
          if (vals[i] === vals[i + 1]) { out.push(vals[i] * 2); merged.push(out.length - 1); i++; }
          else out.push(vals[i]);
        }
        let moved = false;
        idx.forEach((cellIdx, k) => { const v = out[k] || 0; if (b[cellIdx] !== v) moved = true; b[cellIdx] = v; });
        return { moved, merged: merged.map((k) => idx[k]) };
      };
      const LINES = {
        left: [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => r * 4 + c)),
        right: [0, 1, 2, 3].map((r) => [3, 2, 1, 0].map((c) => r * 4 + c)),
        up: [0, 1, 2, 3].map((c) => [0, 1, 2, 3].map((r) => r * 4 + c)),
        down: [0, 1, 2, 3].map((c) => [3, 2, 1, 0].map((r) => r * 4 + c)),
      };
      const reset = () => { b = new Array(16).fill(0); spawn(); spawn(); paint(new Set()); };
      reset();
      let pause = 0;
      this.loop(host, 520, () => {
        if (pause > 0) { if (--pause === 0) reset(); return; }
        for (const dir of ['left', 'down', 'right', 'up']) {
          const before = b.slice();
          let moved = false;
          const popped = new Set();
          LINES[dir].forEach((line) => { const r = slide(line); moved = moved || r.moved; r.merged.forEach((i) => popped.add(i)); });
          if (!moved) { b = before; continue; }
          popped.add(spawn());
          paint(popped);
          if (Math.max(...b) >= 256) pause = 6;
          return;
        }
        pause = 4; // hết nước
      });
    },

    /** Trượt quân / lá bài trong SVG tới (x, y). Dùng animate thay transition để vẫn trượt khi vừa đưa phần tử lên trên cùng. */
    slide(el, x, y) {
      const to = 'translate(' + x + 'px,' + y + 'px)';
      const from = el.style.transform;
      el.style.transform = to;
      if (!opts.reduceMotion && from && from !== to) el.animate([{ transform: from }, { transform: to }], { duration: 560, easing: 'cubic-bezier(.3, 1.2, .4, 1)' });
    },
    /** Lật quân / lá bài: co ngang về 0 rồi mở ra, màu mới đổi ở giữa nhờ transition trễ trong CSS. */
    flip(el) {
      if (!opts.reduceMotion) el.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 420, easing: 'ease-in-out' });
    },

    // Cờ Gánh: vài nước đi đúng luật, nước cuối chen vào giữa hai quân Đỏ nên gánh đổi màu cả hai
    pv_coganh(host) {
      const S = 30, P = 14, W = P * 2 + S * 4;
      const q = (k) => P + k * S;
      // [hàng, cột]: Đen ở trên, Đỏ ở dưới, Đỏ đi trước
      const DARK = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 0], [1, 4], [2, 0]];
      const RED = [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [3, 0], [3, 4], [2, 4]];
      const MOVES = [[[4, 1], [3, 1]], [[1, 0], [1, 1]], [[2, 4], [1, 3]], [[0, 2], [1, 2]], [[4, 3], [3, 3]], [[1, 1], [2, 2]]];
      let lines = '';
      for (let i = 0; i < 5; i++) lines += 'M' + q(0) + ' ' + q(i) + 'H' + q(4) + 'M' + q(i) + ' ' + q(0) + 'V' + q(4);
      // Đường chéo chỉ đi qua các điểm có hàng + cột chẵn
      lines += 'M' + q(0) + ' ' + q(0) + 'L' + q(4) + ' ' + q(4) + 'M' + q(4) + ' ' + q(0) + 'L' + q(0) + ' ' + q(4) +
        'M' + q(2) + ' ' + q(0) + 'L' + q(4) + ' ' + q(2) + 'L' + q(2) + ' ' + q(4) + 'L' + q(0) + ' ' + q(2) + 'Z';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + W);
      svg.setAttribute('class', 'mini-cg');
      svg.innerHTML = '<rect width="' + W + '" height="' + W + '" rx="8" fill="#d9b77a" stroke="#6b4a1f" stroke-width="2"/>' +
        '<path d="' + lines + '" fill="none" stroke="#6b4a1f" stroke-width="1.6"/><g class="pieces"></g>';
      host.appendChild(svg);
      const layer = svg.querySelector('.pieces');
      let pieces, k, caught, pause = 0;
      const at = (r, c) => pieces.find((p) => p.r === r && p.c === c);
      const paint = (p) => p.el.setAttribute('class', 'pc ' + (p.red ? 'r' : 'd'));
      const reset = () => {
        layer.innerHTML = '';
        pieces = DARK.map(([r, c]) => ({ r, c, red: false })).concat(RED.map(([r, c]) => ({ r, c, red: true })));
        pieces.forEach((p) => {
          p.el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          p.el.innerHTML = '<circle r="10"/>';
          paint(p);
          this.slide(p.el, q(p.c), q(p.r));
          layer.appendChild(p.el);
        });
        k = 0;
        caught = null;
      };
      // Quân vừa đi đứng giữa hai quân đối phương trên cùng một đường thì gánh cả hai
      const ganh = (p) => {
        const out = [];
        [[0, 1], [1, 0]].concat((p.r + p.c) % 2 ? [] : [[1, 1], [1, -1]]).forEach(([dr, dc]) => {
          const a = at(p.r - dr, p.c - dc), b = at(p.r + dr, p.c + dc);
          if (a && b && a.red !== p.red && b.red !== p.red) out.push(a, b);
        });
        return out.length ? out : null;
      };
      const step = () => {
        if (caught) {
          caught.forEach((p) => { p.red = !p.red; paint(p); this.flip(p.el.firstChild); });
          caught = null;
          return true;
        }
        const [[fr, fc], [tr, tc]] = MOVES[k++];
        const p = at(fr, fc);
        pieces.forEach((x) => x.el.classList.remove('moving'));
        p.r = tr; p.c = tc;
        layer.appendChild(p.el); // đưa lên trên cùng khi di chuyển
        p.el.classList.add('moving');
        this.slide(p.el, q(tc), q(tr));
        caught = ganh(p);
        return k >= MOVES.length && !caught;
      };
      reset();
      if (opts.reduceMotion) { while (!step()); return; }
      this.loop(host, 900, () => {
        if (pause > 0) { if (--pause === 0) reset(); return; }
        if (step()) pause = 5;
      });
    },

    // Cờ Vua: thế chiếu hết bốn nước, quân trượt trên bàn, nước vừa đi được tô sáng
    pv_covua(host) {
      const S = 20, P = 4, W = P * 2 + S * 8;
      // Hình quân rút gọn từ covua/index.html (khung 100 x 100, bỏ nét chi tiết)
      const SHAPE = {
        p: '<path d="M41 50c-.5 11-5 20-13 28h44c-8-8-12.5-17-13-28z"/><path d="M36 48c0-3.6 6-6.5 14-6.5s14 2.9 14 6.5-6 4.5-14 4.5-14-.9-14-4.5z"/><circle cx="50" cy="28" r="12"/>',
        r: '<path d="M31 77l3-8V42h32v27l3 8z"/><path d="M26 16h10v7h9v-7h10v7h9v-7h10v17l-6 7H32l-6-7z"/>',
        n: '<path d="M34 78c-1-13 3-21 11-28 4-3.6 6-7.6 6-12-3.6 3.4-8 5.2-13 5.6l-6 6.6c-2.6 1.6-5 1-6.8-.8l-3-3c-1.4-1.6-1.6-3.6-.4-5.4L36 26c2-3 3-5.6 3-9l4-5 3.4 6.6c2.6-.6 5-.6 7.6 0l2.6-7 4.4 7.6C73 25 80 39 79 56c-.4 8-1.6 15-3 22z"/>',
        b: '<path d="M36 63h28l-2.5 7h-23z"/><path d="M50 22c11 6.5 18 16 18 27 0 6.6-2.6 11-5.6 14H37.6C34.6 60 32 55.6 32 49c0-11 7-20.5 18-27z"/><circle cx="50" cy="16.5" r="5"/>',
        q: '<path d="M32 70L21 35l13 19 2-25 9 23 5-27 5 27 9-23 2 25 13-19-11 35 2 7H30z"/><circle cx="21" cy="31" r="4.4"/><circle cx="36" cy="25" r="4.4"/><circle cx="50" cy="20" r="4.4"/><circle cx="64" cy="25" r="4.4"/><circle cx="79" cy="31" r="4.4"/>',
        k: '<path d="M32 70c-7-6-11-12.5-11-20 0-8.6 6.6-14.6 15.6-14.6 5.6 0 10.4 2.4 14.4 7.6 4-5.2 8.8-7.6 14.4-7.6C74.4 35.4 79 41.4 79 50c0 7.5-4 14-11 20z"/><path d="M47 9h6v8h8v6h-8v15h-6V23h-8v-6h8z"/><path d="M32 70h36l2 7H30z"/>',
      };
      const BASE = '<rect x="22" y="77" width="56" height="12" rx="4"/>';
      const START = [];
      for (let x = 0; x < 8; x++) START.push([x, 0, 'rnbqkbnr'[x], 0], [x, 1, 'p', 0], [x, 6, 'p', 1], [x, 7, 'rnbqkbnr'[x], 1]);
      // Ván mẫu [cột, hàng], hàng 0 là hàng 8 bên Đen: e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#
      const MOVES = [[[4, 6], [4, 4]], [[4, 1], [4, 3]], [[5, 7], [2, 4]], [[1, 0], [2, 2]], [[3, 7], [7, 3]], [[6, 0], [5, 2]], [[7, 3], [5, 1]]];
      let dark = '';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) dark += 'M' + (P + x * S) + ' ' + (P + y * S) + 'h' + S + 'v' + S + 'h-' + S + 'z';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + W);
      svg.setAttribute('class', 'mini-cv');
      svg.innerHTML = '<rect width="' + W + '" height="' + W + '" rx="6" fill="#6b4a1f"/>' +
        '<rect x="' + P + '" y="' + P + '" width="' + S * 8 + '" height="' + S * 8 + '" fill="#f3e6c8"/><path d="' + dark + '" fill="#c9a061"/>' +
        '<g class="hl"></g><g class="pieces"></g>';
      host.appendChild(svg);
      const hl = svg.querySelector('.hl'), layer = svg.querySelector('.pieces');
      const box = (x, y, cls) => '<rect class="' + cls + '" x="' + (P + x * S) + '" y="' + (P + y * S) + '" width="' + S + '" height="' + S + '"/>';
      let pieces, k, pause = 0;
      const reset = () => {
        layer.innerHTML = '';
        hl.innerHTML = '';
        k = 0;
        pieces = START.map(([x, y, t, white]) => {
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          g.setAttribute('class', 'pc');
          g.innerHTML = '<g transform="translate(1 1) scale(.18)" fill="' + (white ? '#fffaf0' : '#2a1f16') + '" stroke="' + (white ? '#2a1f16' : '#0e0b09') +
            '" stroke-width="5" stroke-linejoin="round">' + SHAPE[t] + BASE + '</g>';
          this.slide(g, P + x * S, P + y * S);
          layer.appendChild(g);
          return { x, y, el: g };
        });
      };
      const step = () => {
        const [[fx, fy], [tx, ty]] = MOVES[k++];
        const victim = pieces.find((p) => p.x === tx && p.y === ty);
        if (victim) { victim.el.style.opacity = '0'; pieces = pieces.filter((p) => p !== victim); }
        const mover = pieces.find((p) => p.x === fx && p.y === fy);
        mover.x = tx; mover.y = ty;
        layer.appendChild(mover.el);
        this.slide(mover.el, P + tx * S, P + ty * S);
        const done = k >= MOVES.length;
        hl.innerHTML = box(fx, fy, 'last') + box(tx, ty, 'last') + (done ? box(4, 0, 'mate') : ''); // hết nước: tô đỏ ô Vua Đen
        return done;
      };
      reset();
      if (opts.reduceMotion) { while (!step()); return; }
      this.loop(host, 1000, () => {
        if (pause > 0) { if (--pause === 0) reset(); return; }
        if (step()) pause = 5;
      });
    },

    // Cờ Lật: hai bên đặt quân ngẫu nhiên đúng luật, quân bị kẹp lật sang màu bên vừa đi
    pv_colat(host) {
      const N = 8, S = 19, P = 5, W = P * 2 + S * N;
      const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
      let grid = '', dots = '';
      for (let i = 1; i < N; i++) grid += 'M' + (P + i * S) + ' ' + P + 'v' + S * N + 'M' + P + ' ' + (P + i * S) + 'h' + S * N;
      [2, 6].forEach((a) => [2, 6].forEach((b) => { dots += '<circle cx="' + (P + a * S) + '" cy="' + (P + b * S) + '" r="1.8" fill="#6b4a1f"/>'; }));
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + W);
      svg.setAttribute('class', 'mini-rv');
      svg.innerHTML = '<rect width="' + W + '" height="' + W + '" rx="8" fill="#c9a061" stroke="#6b4a1f" stroke-width="2"/>' +
        '<path d="' + grid + '" stroke="#6b4a1f" stroke-width=".8"/>' + dots + '<g class="discs"></g>';
      host.appendChild(svg);
      const layer = svg.querySelector('.discs');
      let b, discs, turn, pause = 0;
      // Các quân bị lật nếu `who` đặt vào ô i (rỗng nghĩa là không đặt được)
      const flipsOf = (i, who) => {
        if (b[i]) return [];
        const r = Math.floor(i / N), c = i % N, out = [];
        for (const [dr, dc] of DIRS) {
          const run = [];
          let rr = r + dr, cc = c + dc;
          while (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === 3 - who) { run.push(rr * N + cc); rr += dr; cc += dc; }
          if (run.length && rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === who) out.push(...run);
        }
        return out;
      };
      const paint = (i) => discs[i].setAttribute('class', b[i] === 1 ? 'k' : 'w');
      const put = (i, who) => {
        b[i] = who;
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', P + (i % N) * S + S / 2);
        c.setAttribute('cy', P + Math.floor(i / N) * S + S / 2);
        c.setAttribute('r', 7.6);
        discs[i] = c;
        paint(i);
        layer.appendChild(c);
        return c;
      };
      const reset = () => { b = new Array(N * N).fill(0); discs = []; layer.innerHTML = ''; turn = 1; put(27, 2); put(28, 1); put(35, 1); put(36, 2); };
      const movesOf = (who) => b.map((_, i) => i).filter((i) => flipsOf(i, who).length);
      const step = () => {
        let moves = movesOf(turn);
        if (!moves.length) { turn = 3 - turn; moves = movesOf(turn); } // mất lượt
        if (!moves.length || b.filter(Boolean).length >= 54) return true;
        const i = moves[Math.floor(Math.random() * moves.length)];
        const flips = flipsOf(i, turn);
        const c = put(i, turn);
        if (!opts.reduceMotion) c.animate([{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 280, easing: 'cubic-bezier(.2, 1.4, .4, 1)' });
        flips.forEach((j) => { b[j] = turn; paint(j); this.flip(discs[j]); });
        turn = 3 - turn;
        return false;
      };
      reset();
      if (opts.reduceMotion) { for (let n = 0; n < 24; n++) step(); return; }
      this.loop(host, 650, () => {
        if (pause > 0) { if (--pause === 0) reset(); return; }
        if (step()) pause = 6;
      });
    },

    // Cờ Đam: Đỏ dụ được quân rồi ăn liên tiếp hai quân, chạm cuối bàn thì lên vua
    pv_codam(host) {
      const S = 20, P = 4, W = P * 2 + S * 8;
      // [hàng, cột] trên các ô tối; Đỏ đi lên, Kem đi xuống
      const RED = [[5, 0], [5, 2], [6, 3], [7, 4], [5, 6], [6, 7]];
      const CREAM = [[0, 1], [1, 2], [2, 3], [1, 4], [1, 6], [2, 5]];
      // Mỗi nước là các điểm dừng; nhảy hai ô là ăn quân ở giữa
      const MOVES = [[[5, 2], [4, 3]], [[1, 6], [2, 7]], [[6, 3], [5, 2]], [[2, 5], [3, 4]], [[4, 3], [2, 5], [0, 3]]];
      let dark = '';
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2) dark += 'M' + (P + c * S) + ' ' + (P + r * S) + 'h' + S + 'v' + S + 'h-' + S + 'z';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + W);
      svg.setAttribute('class', 'mini-cd');
      svg.innerHTML = '<rect width="' + W + '" height="' + W + '" rx="6" fill="#6b4a1f"/>' +
        '<rect x="' + P + '" y="' + P + '" width="' + S * 8 + '" height="' + S * 8 + '" fill="#f3e6c8"/><path d="' + dark + '" fill="#8a5a2b"/><g class="pieces"></g>';
      host.appendChild(svg);
      const layer = svg.querySelector('.pieces');
      const at = (r, c) => [P + c * S + S / 2, P + r * S + S / 2];
      let pieces, k, h, pause = 0;
      const reset = () => {
        layer.innerHTML = '';
        k = h = 0;
        pieces = RED.map(([r, c]) => ({ r, c, red: true })).concat(CREAM.map(([r, c]) => ({ r, c, red: false })));
        pieces.forEach((p) => {
          p.el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          p.el.setAttribute('class', 'pc');
          const edge = p.red ? '#f3e6c8' : '#8a7350';
          p.el.innerHTML = '<circle r="8.2" fill="' + (p.red ? '#b3261e' : '#f3e6c8') + '" stroke="' + (p.red ? '#5c120e' : '#8a7350') + '" stroke-width="1"/>' +
            '<circle r="5" fill="none" stroke="' + edge + '" stroke-width=".9" opacity=".6"/>' +
            '<path class="crown" d="M-4.5 2.5l-.8-5.5 2.7 2.4L0-4l2.6 3.4 2.7-2.4-.8 5.5z" fill="#e0b964" stroke="#6b4a1f" stroke-width=".5"/>';
          this.slide(p.el, ...at(p.r, p.c));
          layer.appendChild(p.el);
        });
      };
      // Mỗi nhịp đi một chặng, ăn liên tiếp thì thành nhiều nhịp
      const step = () => {
        const path = MOVES[k];
        const [fr, fc] = path[h], [tr, tc] = path[h + 1];
        const p = pieces.find((x) => x.r === fr && x.c === fc);
        if (Math.abs(tr - fr) === 2) {
          const v = pieces.find((x) => x.r === (fr + tr) / 2 && x.c === (fc + tc) / 2);
          v.el.classList.add('gone');
          pieces = pieces.filter((x) => x !== v);
        }
        p.r = tr; p.c = tc;
        layer.appendChild(p.el);
        this.slide(p.el, ...at(tr, tc));
        if (tr === (p.red ? 0 : 7)) p.el.classList.add('king');
        if (++h >= path.length - 1) { k++; h = 0; }
        return k >= MOVES.length;
      };
      reset();
      if (opts.reduceMotion) { while (!step()); return; }
      this.loop(host, 800, () => {
        if (pause > 0) { if (--pause === 0) reset(); return; }
        if (step()) pause = 6;
      });
    },

    // Bốn Liên Tiếp: quân rơi xuống cột theo một ván mẫu, Đỏ thắng bằng bốn quân chéo
    pv_bonlientiep(host) {
      const C = 7, R = 6, S = 20, P = 6, TOP = 22;
      const W = P * 2 + C * S, H = TOP + P * 2 + R * S;
      const MOVES = [3, 4, 4, 5, 6, 5, 5, 6, 2, 6, 6]; // cột, Đỏ đi trước
      const cx = (c) => P + c * S + S / 2, cy = (r) => TOP + P + (R - 1 - r) * S + S / 2; // hàng tính từ đáy
      let holes = '';
      for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) holes += 'M' + (cx(c) - 7.5) + ' ' + cy(r) + 'a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0-15 0z';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('class', 'mini-c4');
      svg.innerHTML = '<rect y="' + TOP + '" width="' + W + '" height="' + (H - TOP) + '" rx="8" fill="rgba(0, 0, 0, .4)"/><g class="discs"></g>' +
        '<path d="M0 ' + (TOP + 8) + 'a8 8 0 0 1 8-8h' + (W - 16) + 'a8 8 0 0 1 8 8v' + (H - TOP - 8) + 'h-' + W + 'z' + holes + '" fill="#b07d1f" fill-rule="evenodd" stroke="#6b4a1f" stroke-width="1.2"/>' +
        '<g class="fx"></g>';
      host.appendChild(svg);
      const layer = svg.querySelector('.discs'), fx = svg.querySelector('.fx');
      let h, cell, k, pause = 0;
      const reset = () => { h = new Array(C).fill(0); cell = {}; k = 0; layer.innerHTML = ''; fx.innerHTML = ''; };
      const four = (c, r, who) => {
        for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
          const run = [[c, r]];
          for (let s = 1; cell[(c + dc * s) + ',' + (r + dr * s)] === who; s++) run.push([c + dc * s, r + dr * s]);
          for (let s = 1; cell[(c - dc * s) + ',' + (r - dr * s)] === who; s++) run.unshift([c - dc * s, r - dr * s]);
          if (run.length >= 4) return run;
        }
        return null;
      };
      const step = () => {
        const c = MOVES[k], who = k % 2 ? 2 : 1, r = h[c]++;
        k++;
        cell[c + ',' + r] = who;
        const d = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        d.setAttribute('cx', cx(c));
        d.setAttribute('cy', cy(r));
        d.setAttribute('r', 8.2);
        d.setAttribute('fill', who === 1 ? '#b3261e' : '#e0b964');
        layer.appendChild(d);
        // Rơi nhanh dần từ trên khung xuống rồi nảy nhẹ
        if (!opts.reduceMotion) {
          d.animate([
            { transform: 'translateY(' + (TOP / 2 - cy(r)) + 'px)', easing: 'cubic-bezier(.5, 0, 1, .5)' },
            { transform: 'none', offset: 0.8, easing: 'ease-out' },
            { transform: 'translateY(-3px)', offset: 0.9, easing: 'ease-in' },
            { transform: 'none' },
          ], { duration: 300 + (R - r) * 60 });
        }
        const run = four(c, r, who);
        if (run) {
          const a = run[0], b = run[run.length - 1];
          fx.innerHTML = '<line class="win" x1="' + cx(a[0]) + '" y1="' + cy(a[1]) + '" x2="' + cx(b[0]) + '" y2="' + cy(b[1]) + '"/>';
          return true;
        }
        return k >= MOVES.length;
      };
      reset();
      if (opts.reduceMotion) { while (!step()); return; }
      this.loop(host, 750, () => {
        if (pause > 0) { if (--pause === 0) reset(); return; }
        if (step()) pause = 6;
      });
    },

    // Xếp Bài: lá đỏ đặt lên lá đen, lật lá úp, đưa Át và 2 lên ô đích
    pv_xepbai(host) {
      // Chất bài vẽ bằng path khung 10 x 10: bích, cơ, rô, chuồn
      const SUIT = [
        'M5 0C3 2.6 0 4 0 6.2a2.4 2.4 0 0 0 4.2 1.6L3.6 10h2.8l-.6-2.2A2.4 2.4 0 0 0 10 6.2C10 4 7 2.6 5 0z',
        'M5 9.6C2 7.2 0 5.4 0 3.2a2.6 2.6 0 0 1 5-1 2.6 2.6 0 0 1 5 1c0 2.2-2 4-5 6.4z',
        'M5 0l4 5-4 5-4-5z',
        'M5 .2a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 1 0 0-4.4zM2.6 3.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 1 0 0-4.4zM7.4 3.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 1 0 0-4.4zM4.5 5.5h1l1 4.5h-3z',
      ];
      const DECK = { ks: ['K', 0], c7: ['7', 3], h6: ['6', 1], da: ['A', 2], d2: ['2', 2], s5: ['5', 0], hq: ['Q', 1], cj: ['J', 3], d9: ['9', 2] };
      // [cột lấy, cột đặt]; chỉ có cột lấy nghĩa là lật lá trên cùng
      const STEPS = [['t2', 't1'], ['t2'], ['t2', 'f'], ['w', 'f'], ['t3', 't1'], ['t3'], ['t3', 't0'], ['t3'], ['t3', 't0']];
      const TX = (i) => 13 + i * 46, FX = (i) => 95 + i * 34;
      const BACK = '<g class="bk"><rect width="30" height="42" rx="3" fill="#b3261e" stroke="#fffaf0" stroke-width="1.2"/>' +
        '<rect x="3.5" y="3.5" width="23" height="35" rx="2" fill="none" stroke="#e0b964" stroke-width=".8"/></g>';
      const face = (id) => {
        const d = DECK[id];
        const col = d && d[1] % 3 ? '#b3261e' : '#1d1711';
        return '<g class="in"><rect width="30" height="42" rx="3" fill="#fffaf0" stroke="rgba(20, 16, 13, .3)" stroke-width=".6"/>' +
          (d ? '<text x="3.2" y="10" font-size="9" font-weight="800" fill="' + col + '">' + d[0] + '</text>' +
            '<path d="' + SUIT[d[1]] + '" fill="' + col + '" transform="translate(3.6 12.4) scale(.5)"/>' +
            '<path d="' + SUIT[d[1]] + '" fill="' + col + '" transform="translate(8 18.5) scale(1.4)"/>' : '') +
          BACK + '</g>';
      };
      let slots = '<rect x="13" y="6" width="30" height="42" rx="3"/>';
      for (let i = 0; i < 4; i++) slots += '<rect x="' + FX(i) + '" y="6" width="30" height="42" rx="3"/>';
      for (let i = 0; i < 5; i++) slots += '<rect x="' + TX(i) + '" y="58" width="30" height="42" rx="3"/>';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 240 150');
      svg.setAttribute('class', 'mini-sol');
      svg.innerHTML = '<g fill="rgba(255, 255, 255, .05)" stroke="rgba(255, 255, 255, .22)" stroke-width=".8">' + slots + '</g>' +
        '<g transform="translate(13 6)">' + BACK + '</g><g class="cards"></g>';
      host.appendChild(svg);
      const layer = svg.querySelector('.cards');
      let piles, up, cards, k, pause = 0;
      const layout = () => {
        Object.keys(piles).forEach((key) => {
          const x = key === 'w' ? 49 : key === 'f' ? FX(0) : TX(+key[1]);
          let y = key[0] === 't' ? 58 : 6;
          piles[key].forEach((id) => {
            cards[id].classList.toggle('up', up.has(id));
            this.slide(cards[id], x, y);
            if (key[0] === 't') y += up.has(id) ? 11 : 5; // lá úp xếp sát, lá ngửa so le để thấy số
          });
        });
      };
      const reset = () => {
        piles = { w: ['d2'], f: [], t0: ['ks'], t1: ['x1', 'c7'], t2: ['x2', 'da', 'h6'], t3: ['cj', 'hq', 's5'], t4: ['x3', 'x4', 'd9'] };
        up = new Set(['d2', 'ks', 'c7', 'h6', 's5', 'd9']);
        layer.innerHTML = '';
        cards = {};
        k = 0;
        Object.values(piles).forEach((ids) => ids.forEach((id) => {
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          g.setAttribute('class', 'cd');
          g.innerHTML = face(id);
          cards[id] = g;
          layer.appendChild(g);
        }));
        layout();
      };
      const step = () => {
        const [from, to] = STEPS[k++];
        const id = piles[from][piles[from].length - 1];
        if (to) { piles[from].pop(); piles[to].push(id); layer.appendChild(cards[id]); }
        else { up.add(id); this.flip(cards[id].firstChild); }
        layout();
        return k >= STEPS.length;
      };
      reset();
      if (opts.reduceMotion) { while (!step()); return; }
      this.loop(host, 950, () => {
        if (pause > 0) { if (--pause === 0) reset(); return; }
        if (step()) pause = 5;
      });
    },

    // Phá Gạch: bóng nảy phá tường gạch, thanh trượt tự đỡ bóng, phá hết thì xây lại
    pv_phagach(host) {
      const W = 180, H = 150, COLS = 8, ROWS = 4, BW = 19, BH = 8, GAP = 2, PW = 34, PY = H - 14, R = 3.2;
      const X0 = (W - COLS * (BW + GAP) + GAP) / 2, Y0 = 16;
      const COLORS = ['#b3261e', '#e8622c', '#e0b964', '#f3e6c8'];
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('class', 'mini-bk');
      svg.innerHTML = '<rect x=".5" y=".5" width="' + (W - 1) + '" height="' + (H - 1) + '" rx="8" fill="rgba(0, 0, 0, .35)" stroke="rgba(255, 255, 255, .14)"/>' +
        '<g class="bricks"></g><rect class="pad" y="' + PY + '" width="' + PW + '" height="5" rx="2.5" fill="#e0b964"/><circle class="ball" r="' + R + '" fill="#fffaf0"/>';
      host.appendChild(svg);
      const wall = svg.querySelector('.bricks'), pad = svg.querySelector('.pad'), ball = svg.querySelector('.ball');
      let bricks, b, px, aim, pause = 0;
      const reset = () => {
        wall.innerHTML = '';
        bricks = [];
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          const x = X0 + c * (BW + GAP), y = Y0 + r * (BH + GAP);
          el.setAttribute('class', 'br');
          el.setAttribute('x', x); el.setAttribute('y', y);
          el.setAttribute('width', BW); el.setAttribute('height', BH);
          el.setAttribute('rx', 1.5); el.setAttribute('fill', COLORS[r]);
          wall.appendChild(el);
          bricks.push({ x, y, el, alive: true });
        }
        b = { x: W / 2, y: PY - 20, vx: 1.1, vy: -1.6 };
        px = (W - PW) / 2;
        aim = 0;
      };
      const paint = () => { ball.setAttribute('cx', b.x); ball.setAttribute('cy', b.y); pad.setAttribute('x', px); };
      // Một bước bóng; trả về false khi lọt xuống đáy
      const move = () => {
        const oy = b.y;
        b.x += b.vx; b.y += b.vy;
        if (b.x < R || b.x > W - R) { b.vx = -b.vx; b.x = Math.max(R, Math.min(W - R, b.x)); }
        if (b.y < R) b.vy = Math.abs(b.vy);
        // Chạm thanh trượt: nảy lên, góc lệch theo chỗ chạm
        if (b.vy > 0 && b.y + R >= PY && oy + R <= PY + 1 && b.x > px - R && b.x < px + PW + R) {
          b.vx = Math.max(-1.6, Math.min(1.6, ((b.x - px - PW / 2) / (PW / 2)) * 1.6));
          b.vy = -Math.sqrt(4.2 - b.vx * b.vx);
          aim = (Math.random() - 0.5) * PW * 0.8; // lần sau đỡ lệch chỗ khác để bóng đổi hướng
        }
        for (const k of bricks) {
          if (!k.alive || b.x < k.x - R || b.x > k.x + BW + R || b.y < k.y - R || b.y > k.y + BH + R) continue;
          k.alive = false;
          k.el.classList.add('hit');
          if (oy < k.y - R || oy > k.y + BH + R) b.vy = -b.vy; else b.vx = -b.vx;
          break;
        }
        return b.y < H + R;
      };
      reset();
      paint();
      if (opts.reduceMotion) {
        bricks.forEach((k, i) => { if (i % 3 === 1 || i > 25) k.el.classList.add('hit'); });
        b.x = 70; b.y = 80; paint();
        return;
      }
      this.loop(host, 30, () => {
        if (pause > 0) { if (--pause === 0) { reset(); paint(); } return; }
        if (!move()) { pause = 10; return; }
        px = Math.max(0, Math.min(W - PW, px + Math.max(-2.4, Math.min(2.4, b.x - PW / 2 + aim - px))));
        paint();
        if (bricks.every((k) => !k.alive)) pause = 40;
      });
    },

    sudoku(host) {
      const SOL = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
      const GIV = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
      const grid = document.createElement('div');
      grid.className = 'mini-sudoku';
      const cells = [];
      for (let i = 0; i < 81; i++) {
        const c = document.createElement('span');
        cells.push(c);
        grid.appendChild(c);
      }
      host.appendChild(grid);
      let blanks = [];
      const reset = () => {
        cells.forEach((c, i) => { c.textContent = GIV[i] === '0' ? '' : GIV[i]; c.className = ''; });
        blanks = [];
        for (let i = 0; i < 81; i++) if (GIV[i] === '0') blanks.push(i);
        blanks.sort(() => Math.random() - 0.5);
      };
      reset();
      if (opts.reduceMotion) return;
      let pause = 0;
      this.timers.push(setInterval(() => {
        if (this.idle(host)) return;
        if (pause > 0) { if (--pause === 0) reset(); return; }
        cells.forEach((c) => c.classList.remove('hl'));
        const i = blanks.pop();
        if (i === undefined) { pause = 8; return; }
        const r = Math.floor(i / 9), col = i % 9;
        for (let k = 0; k < 9; k++) { cells[r * 9 + k].classList.add('hl'); cells[k * 9 + col].classList.add('hl'); }
        cells[i].textContent = SOL[i];
        cells[i].className = 'fill';
      }, 260));
    },

    xiangqi(host) {
      const S = 22, PAD = 14; // khoảng cách ô, lề
      const W = PAD * 2 + S * 8, H = PAD * 2 + S * 9;
      const px = (x) => PAD + x * S, py = (y) => PAD + y * S;
      const START = [
        // [x, y, chữ, đỏ?]
        [0, 0, '車', 0], [1, 0, '馬', 0], [2, 0, '象', 0], [3, 0, '士', 0], [4, 0, '將', 0], [5, 0, '士', 0], [6, 0, '象', 0], [7, 0, '馬', 0], [8, 0, '車', 0],
        [1, 2, '砲', 0], [7, 2, '砲', 0], [0, 3, '卒', 0], [2, 3, '卒', 0], [4, 3, '卒', 0], [6, 3, '卒', 0], [8, 3, '卒', 0],
        [0, 9, '車', 1], [1, 9, '馬', 1], [2, 9, '相', 1], [3, 9, '仕', 1], [4, 9, '帥', 1], [5, 9, '仕', 1], [6, 9, '相', 1], [7, 9, '馬', 1], [8, 9, '車', 1],
        [1, 7, '炮', 1], [7, 7, '炮', 1], [0, 6, '兵', 1], [2, 6, '兵', 1], [4, 6, '兵', 1], [6, 6, '兵', 1], [8, 6, '兵', 1],
      ];
      // Khai cuộc Pháo đầu đối Bình phong mã
      const MOVES = [[[7, 7], [4, 7]], [[7, 0], [6, 2]], [[7, 9], [6, 7]], [[8, 0], [7, 0]], [[8, 9], [7, 9]], [[6, 3], [6, 4]], [[4, 7], [4, 3]]];

      let lines = '';
      for (let y = 0; y < 10; y++) lines += '<line x1="' + px(0) + '" y1="' + py(y) + '" x2="' + px(8) + '" y2="' + py(y) + '"/>';
      for (let x = 0; x < 9; x++) {
        if (x === 0 || x === 8) lines += '<line x1="' + px(x) + '" y1="' + py(0) + '" x2="' + px(x) + '" y2="' + py(9) + '"/>';
        else lines += '<line x1="' + px(x) + '" y1="' + py(0) + '" x2="' + px(x) + '" y2="' + py(4) + '"/><line x1="' + px(x) + '" y1="' + py(5) + '" x2="' + px(x) + '" y2="' + py(9) + '"/>';
      }
      lines += '<path d="M' + px(3) + ' ' + py(0) + 'L' + px(5) + ' ' + py(2) + 'M' + px(5) + ' ' + py(0) + 'L' + px(3) + ' ' + py(2) +
        'M' + px(3) + ' ' + py(7) + 'L' + px(5) + ' ' + py(9) + 'M' + px(5) + ' ' + py(7) + 'L' + px(3) + ' ' + py(9) + '"/>';

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('class', 'mini-xq');
      svg.innerHTML =
        '<rect x="2" y="2" width="' + (W - 4) + '" height="' + (H - 4) + '" rx="8" fill="var(--board)" stroke="var(--board-line)" stroke-width="2"/>' +
        '<g stroke="var(--board-line)" stroke-width="1" fill="none">' + lines + '</g>' +
        '<text x="' + W / 2 + '" y="' + (py(4.5) + 4) + '" text-anchor="middle" font-size="10" fill="var(--board-line)" opacity=".75" letter-spacing="14">楚河  漢界</text>' +
        '<g class="pieces"></g>';
      host.appendChild(svg);
      const layer = svg.querySelector('.pieces');

      let pieces = [];
      const place = (p) => { p.el.setAttribute('transform', 'translate(' + px(p.x) + ' ' + py(p.y) + ')'); p.el.style.transform = 'translate(' + px(p.x) + 'px,' + py(p.y) + 'px)'; };
      const reset = () => {
        layer.innerHTML = '';
        pieces = START.map(([x, y, ch, red]) => {
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          g.setAttribute('class', 'pc');
          g.innerHTML =
            '<circle r="9.5" fill="#f6e3bd" stroke="' + (red ? '#b3261e' : '#2a2018') + '" stroke-width="1.4"/>' +
            '<circle r="7.6" fill="none" stroke="' + (red ? '#b3261e' : '#2a2018') + '" stroke-width=".6"/>' +
            '<text y="3.6" text-anchor="middle" font-size="10" font-weight="700" fill="' + (red ? '#b3261e' : '#2a2018') + '" font-family="KaiTi, STKaiti, serif">' + ch + '</text>';
          const p = { x, y, el: g };
          place(p);
          layer.appendChild(g);
          return p;
        });
      };
      reset();
      if (opts.reduceMotion) return;
      let step = 0, pause = 0;
      this.timers.push(setInterval(() => {
        if (this.idle(host)) return;
        pieces.forEach((p) => p.el.classList.remove('moving'));
        if (pause > 0) { if (--pause === 0) { reset(); step = 0; } return; }
        if (step >= MOVES.length) { pause = 3; return; }
        const [[fx, fy], [tx, ty]] = MOVES[step++];
        const victim = pieces.find((p) => p.x === tx && p.y === ty);
        if (victim) { victim.el.remove(); pieces = pieces.filter((p) => p !== victim); }
        const mover = pieces.find((p) => p.x === fx && p.y === fy);
        if (!mover) return;
        mover.x = tx; mover.y = ty;
        layer.appendChild(mover.el); // đưa lên trên cùng khi di chuyển
        mover.el.classList.add('moving');
        place(mover);
      }, 1100));
    },
  };
  return Previews.mount();
}
