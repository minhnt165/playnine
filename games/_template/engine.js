/* =====================================================================
 * {{nameVi}} - Engine thuần (không đụng DOM, chạy được trong Node để test)
 *   Engine mẫu của _template: chạm đủ `target` lần là xong. Thay bằng luật của game thật,
 *   giữ cùng kiểu: hàm thuần nhận trạng thái cũ, trả trạng thái mới; toJSON / fromJSON để lưu ván.
 * ===================================================================== */
(function (root) {
  'use strict';

  const VERSION = 1; // tăng khi đổi dạng ván lưu (ván lưu cũ sẽ bị bỏ)

  function newGame(target) {
    return { target, taps: 0 };
  }

  const isDone = (g) => g.taps >= g.target;

  function tap(g) {
    return isDone(g) ? g : { target: g.target, taps: g.taps + 1 };
  }

  const toJSON = (g) => ({ v: VERSION, target: g.target, taps: g.taps });

  /** Ván lưu hỏng hoặc khác phiên bản thì trả null (app chia ván mới). */
  function fromJSON(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    const { target, taps } = raw;
    if (!Number.isInteger(target) || target < 1 || !Number.isInteger(taps) || taps < 0 || taps > target) return null;
    return { target, taps };
  }

  const api = { newGame, isDone, tap, toJSON, fromJSON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : this);
