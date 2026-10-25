/* =====================================================================
 * Sao Chiến - Sinh bộ đề sẵn puzzles.js cho cỡ 10x10 hai sao
 *   Chạy: node tools/build-puzzles.js [số đề = 400]
 *   - Dùng chính generate(n, k, seed) của engine với seed 1, 2, 3…, bỏ đề trùng (kể cả trùng sau xoay / lật).
 *   - Mỗi đề lưu là chuỗi 100 chữ số (id vùng từng ô, hàng trên xuống). test.js kiểm từng đề có đúng một nghiệm.
 *   - Tất định: chạy lại ra đúng file cũ (đổi generate thì đổi bộ đề, ván lưu cũ vẫn mở được vì lưu cả bảng vùng).
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const E = require('../engine.js');

const N = 10;
const K = 2;
const COUNT = Number(process.argv[2]) || 400;

const seen = new Set();
const list = [];
let seed = 0;
const t0 = Date.now();
let worst = 0;
while (list.length < COUNT) {
  seed++;
  const t = Date.now();
  const { regions } = E.generate(N, K, seed);
  worst = Math.max(worst, Date.now() - t);
  // Khóa chuẩn: nhỏ nhất trong 8 phép xoay / lật, để không giữ hai đề chỉ khác nhau bởi đối xứng
  let key = null;
  for (let tr = 0; tr < 8; tr++) {
    const s = E.transformRegions(N, regions, tr).join('');
    if (key === null || s < key) key = s;
  }
  if (seen.has(key)) continue;
  seen.add(key);
  list.push(regions.join(''));
}

const out = `/* =====================================================================
 * Sao Chiến - Bộ đề sinh sẵn (tạo bởi tools/build-puzzles.js, đừng sửa tay)
 *   "${N}x${K}": ${list.length} đề ${N}x${N} ${K} sao, mỗi đề là id vùng của từng ô (hàng trên xuống), đều có đúng một nghiệm.
 * ===================================================================== */
(function (root) {
  'use strict';
  const P = {
    '${N}x${K}': [
${list.map((s) => "      '" + s + "',").join('\n')}
    ],
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
  else root.SAOCHIEN_PUZZLES = P;
})(typeof window !== 'undefined' ? window : this);
`;

fs.writeFileSync(path.join(__dirname, '..', 'puzzles.js'), out);
console.log(list.length + ' đề từ ' + seed + ' seed, ' + (Date.now() - t0) + ' ms (chậm nhất ' + worst + ' ms), ' + out.length + ' byte');
