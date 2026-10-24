/* =====================================================================
 * Đoán Chữ - Sinh words.js từ SCOWL (gói npm wordlist-english 1.2.1, MIT)
 *   node tools/build-words.mjs <thư mục gói wordlist-english>
 *   (bỏ trống thì dùng node_modules/wordlist-english ở gốc repo)
 *   - Đáp án: từ 5 chữ a–z ở mức ≤ 20 (english, không lấy chính tả riêng Mỹ / Anh),
 *     bỏ số nhiều / chia động từ (-s, -es, -ed) khi gốc là từ có thật, bỏ từ trong danh sách loại trừ.
 *   - Từ hợp lệ khi đoán: mọi từ 5 chữ a–z ở mức ≤ 70 (english + american + british) cộng đáp án.
 *   Đổi danh sách là đổi đề hằng ngày và ván lưu cũ: chạy lại `node test.js` (có test khóa đề).
 * ===================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(here, '..');
const src = path.resolve(process.argv[2] || path.join(gameDir, '../../node_modules/wordlist-english'));
const LEVELS = [10, 20, 35, 40, 50, 55, 60, 70];

/** Gộp các mức ≤ max của những biến thể đã cho (file english-words-<mức>.json là từ THÊM vào ở mức đó). */
function load(max, variants) {
  const set = new Set();
  for (const lv of LEVELS) {
    if (lv > max) break;
    for (const v of variants) {
      const file = path.join(src, v + '-words-' + lv + '.json');
      JSON.parse(fs.readFileSync(file, 'utf8')).forEach((w) => set.add(w));
    }
  }
  return set;
}

const FIVE = /^[a-z]{5}$/; // bỏ chữ hoa (tên riêng, viết tắt), dấu, gạch nối, nháy
const all = load(70, ['english', 'american', 'british']);
const common = load(20, ['english']);

/** Số nhiều / ngôi ba (-s, -es, -ies) và quá khứ (-ed, -ied, gấp đôi phụ âm) của một từ có thật. */
function inflected(w) {
  if (w.endsWith('s') && !/(ss|us|is)$/.test(w)) {
    if (all.has(w.slice(0, -1))) return true;
    if (w.endsWith('es') && all.has(w.slice(0, -2))) return true;
    if (w.endsWith('ies') && all.has(w.slice(0, -3) + 'y')) return true;
  }
  if (w.endsWith('ed')) {
    if (all.has(w.slice(0, -2)) || all.has(w.slice(0, -1))) return true;
    if (w.endsWith('ied') && all.has(w.slice(0, -3) + 'y')) return true;
    if (w[1] === w[2] && all.has(w.slice(0, 2))) return true;
  }
  return false;
}

// Từ trông như dạng chia nhưng là từ gốc: vẫn giữ làm đáp án
const KEEP = new Set(['breed', 'greed', 'creed']);
// Không làm đáp án: thô tục / xúc phạm / nhạy cảm, tên riêng viết thường, viết tắt, từ quá lạ hoặc chỉ là dạng chia
const EXCLUDE = new Set([
  'bigot', 'idiot', 'moron', 'slave', 'bible', 'naked', 'vomit', 'drunk', 'dying', 'death', 'abort', 'deity',
  'roman', 'thous', 'pends', 'datum', 'ditto', 'circa', 'fiver', 'inter', 'leach', 'lorry', 'menus', 'sigma',
]);

const answers = [...common].filter((w) => FIVE.test(w) && (KEEP.has(w) || !inflected(w)) && !EXCLUDE.has(w)).sort();
const valid = [...new Set([...all].filter((w) => FIVE.test(w)).concat(answers))].sort();

const out = [
  '/* Danh sách từ của Đoán Chữ - FILE SINH TỰ ĐỘNG bằng `node tools/build-words.mjs`, đừng sửa tay.',
  ' * Nguồn: SCOWL (wordlist.aspell.net) qua gói npm wordlist-english 1.2.1; giấy phép xem WORDS-LICENSE.txt.',
  ' * answers: ' + answers.length + ' đáp án (mức ≤ 20); valid: ' + valid.length + ' từ đoán hợp lệ (mức ≤ 70). */',
  '(function (root) {',
  "  'use strict';",
  '  const WORDS = {',
  "    answers: '" + answers.join(' ') + "',",
  "    valid: '" + valid.join(' ') + "',",
  '  };',
  "  if (typeof module !== 'undefined' && module.exports) module.exports = WORDS;",
  '  else root.WORDS = WORDS;',
  "})(typeof window !== 'undefined' ? window : this);",
  '',
].join('\n');
fs.writeFileSync(path.join(gameDir, 'words.js'), out);
fs.copyFileSync(path.join(src, 'Copyright'), path.join(gameDir, 'WORDS-LICENSE.txt'));
console.log('answers ' + answers.length + ', valid ' + valid.length + ', words.js ' + (out.length / 1024).toFixed(1) + ' KB');
