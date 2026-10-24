/* =====================================================================
 * Thoát Xe - Sinh bộ đề puzzles.js (chạy: node tools/build-puzzles.js, mất vài phút)
 *   - Mọi đề sinh bằng engine.generate() theo seed cố định nên chạy lại ra đúng file cũ;
 *     không chép đề của bên thứ ba.
 *   - Dễ / Vừa / hằng ngày: mỗi số nước tối thiểu một hạn ngạch, đề sinh đúng số nước đó.
 *   - Khó: duyệt nhiều bố cục 12–15 xe, lấy thế xa nhất của mỗi cụm (≥ 25 nước), rồi chọn
 *     xoay vòng theo số nước để trải đều từ 25 tới đề sâu nhất tìm được.
 *   - Trong mỗi mức, bàn xếp theo số nước tối thiểu tăng dần (Bàn 1 dễ nhất).
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../engine.js');

const BOARDS = 60; // số bàn mỗi mức
const DAILY = 120; // số đề trong vòng xoay đề hằng ngày
const HARD_SEEDS = 60000; // số bố cục thử cho mức Khó
const used = new Set();

/** Mức có khoảng hẹp: chia đều hạn ngạch cho từng số nước, sinh đúng số nước đó. */
function byQuota(name, lo, hi, total) {
  const values = [];
  for (let v = lo; v <= hi; v++) values.push(v);
  const out = [];
  values.forEach((v, k) => {
    // Phần dư dồn cho các số nước lớn (bàn sau khó hơn)
    const quota = Math.floor(total / values.length) + (k >= values.length - (total % values.length) ? 1 : 0);
    for (let j = 0, got = 0; got < quota; j++) {
      const r = E.generate(name + '-' + v + '-' + j, [v, v]);
      if (!r || used.has(r.puzzle)) continue;
      used.add(r.puzzle);
      out.push(r);
      got++;
    }
  });
  return out;
}

/** Mức Khó: gom thế xa nhất của nhiều cụm rồi chọn xoay vòng từ số nước lớn xuống. */
function hard(total) {
  const byMin = new Map();
  const t0 = Date.now();
  for (let s = 0; s < HARD_SEEDS; s++) {
    const r = E.generate('hard-' + s, [25, 99], { maxTries: 1, minCars: 12, maxCars: 15, cap: 80000 });
    if (!r || used.has(r.puzzle)) continue;
    used.add(r.puzzle);
    if (!byMin.has(r.min)) byMin.set(r.min, []);
    byMin.get(r.min).push(r);
    if (s % 10000 === 9999) console.error('  hard ' + (s + 1) + ' bố cục, ' + Math.round((Date.now() - t0) / 1000) + ' s');
  }
  const values = [...byMin.keys()].sort((a, b) => b - a);
  const out = [];
  for (let round = 0; out.length < total; round++) {
    let added = false;
    for (const v of values) {
      const list = byMin.get(v);
      if (round < list.length && out.length < total) {
        out.push(list[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

const sortAsc = (list) => list.sort((a, b) => a.min - b.min);
const t0 = Date.now();
const P = {};
P.easy = sortAsc(byQuota('easy', 5, 12, BOARDS));
console.error('easy xong ' + Math.round((Date.now() - t0) / 1000) + ' s');
P.medium = sortAsc(byQuota('medium', 13, 24, BOARDS));
console.error('medium xong ' + Math.round((Date.now() - t0) / 1000) + ' s');
P.daily = byQuota('daily', E.BANDS.daily[0], E.BANDS.daily[1], DAILY); // thứ tự do PRNG theo ngày quyết định
console.error('daily xong ' + Math.round((Date.now() - t0) / 1000) + ' s');
P.hard = sortAsc(hard(BOARDS));
console.error('hard xong ' + Math.round((Date.now() - t0) / 1000) + ' s');

const line = (list) => list.map((r) => "    '" + r.puzzle + ':' + r.min + "',").join('\n');
const stat = (list) => {
  const h = {};
  list.forEach((r) => { h[r.min] = (h[r.min] || 0) + 1; });
  return Object.keys(h).map((k) => k + '×' + h[k]).join(' ');
};
const out = `/* =====================================================================
 * Thoát Xe - Bộ đề sinh sẵn. FILE SINH TỰ ĐỘNG bởi tools/build-puzzles.js, đừng sửa tay.
 *   Mỗi đề: '<36 ô theo hàng>:<số nước tối thiểu>'. '.' trống, 'A' xe đỏ, chữ khác là xe con / xe tải.
 *   easy / medium / hard: bàn của từng mức theo thứ tự chơi; daily: vòng xoay đề hằng ngày.
 *   easy:   ${stat(P.easy)}
 *   medium: ${stat(P.medium)}
 *   hard:   ${stat(P.hard)}
 *   daily:  ${stat(P.daily)}
 * ===================================================================== */
(function (root) {
  'use strict';
  const P = {
    easy: [
${line(P.easy)}
    ],
    medium: [
${line(P.medium)}
    ],
    hard: [
${line(P.hard)}
    ],
    daily: [
${line(P.daily)}
    ],
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
  else root.THOATXE_PUZZLES = P;
})(typeof window !== 'undefined' ? window : this);
`;
fs.writeFileSync(path.join(__dirname, '..', 'puzzles.js'), out);
console.error('Đã ghi puzzles.js (' + out.length + ' byte) sau ' + Math.round((Date.now() - t0) / 1000) + ' s');
for (const k of ['easy', 'medium', 'hard', 'daily']) console.error('  ' + k + ': ' + P[k].length + ' đề, ' + stat(P[k]));
