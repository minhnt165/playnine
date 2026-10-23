/* =====================================================================
 * Cờ Đơn - Web Worker chạy bộ giải cho nút Gợi ý, ngoài luồng giao diện
 *   - Mỗi bàn một bộ giải, sống suốt phiên: nhớ thế chết và các lời giải đã tìm, nên gợi ý sau nhanh dần
 *   - { type: 'warm', board }: giải trước thế đầu (gợi ý ở nước đầu và khi đi theo lời giải là tức thì)
 *   - { type: 'hint', id, board, pegs, maxMs } → { id, status: 'solved' | 'dead' | 'unknown', move? }
 * ===================================================================== */
/* global importScripts, GameEngine */
importScripts('engine.js?v=1.0.0');

const solvers = {};
const solverFor = (id) => solvers[id] || (solvers[id] = GameEngine.createSolver(id));
const now = () => performance.now();

self.onmessage = (e) => {
  const d = e.data || {};
  if (!GameEngine.board(d.board)) return;
  if (d.type === 'warm') {
    solverFor(d.board).hint(GameEngine.newGame(d.board).pegs, { maxMs: 4000, now });
  } else if (d.type === 'hint') {
    const r = solverFor(d.board).hint(d.pegs, { maxMs: d.maxMs || 2000, now });
    self.postMessage({ id: d.id, status: r.status, move: r.move });
  }
};
