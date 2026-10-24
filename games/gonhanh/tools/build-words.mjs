/* =====================================================================
 * Gõ Nhanh - Sinh danh sách từ cho bài gõ (chạy: node tools/build-words.mjs [thư mục gói wordlist-english])
 *   - Nguồn: SCOWL qua gói npm wordlist-english 1.2.1 (MIT), file english-words-10.json
 *     (mức 10 = phổ biến nhất, gồm 1000 từ thông dụng nhất của Moby Words II).
 *   - Chỉ giữ từ a–z dài 1–7 chữ (bài gõ tốc độ dùng từ ngắn, quen), bỏ từ viết tắt / mảnh từ
 *     còn lại sau khi SCOWL bỏ dấu nháy (cs, hes, re…) và từ nhạy cảm (danh sách EXCLUDE bên dưới).
 *   - Ghi ra ../words.js: window.WORDS = [...] trên trình duyệt, module.exports trong Node (test).
 * ===================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) {
  console.error('Cách dùng: node tools/build-words.mjs <thư mục package của wordlist-english>');
  process.exit(1);
}

const LEVEL = 10;
const MIN_LEN = 1;
const MAX_LEN = 7;

// Từ viết tắt, mảnh từ do bỏ dấu nháy, và từ thô tục / nhạy cảm: không đưa vào bài gõ
const EXCLUDE = new Set([
  'cs', 'hes', 'shes', 'im', 'ive', 'id', 'ill', 'ok', 'pi', 're', 'etc', 'ie', 'eg', 'mod', 'doe', 'err', 'via',
  'sex', 'sexual', 'sexy', 'naked', 'nude', 'porn', 'rape', 'raped', 'suicide', 'murder', 'kill', 'killed', 'kills',
  'drug', 'drugs', 'damn', 'hell', 'gun', 'guns', 'abuse', 'abused', 'racist', 'racism', 'nazi', 'terror', 'bomb',
  'bombs', 'dead', 'death', 'die', 'died', 'dies', 'shit', 'fuck', 'ass', 'bitch', 'god', 'jesus', 'christ', 'church',
  'bible', 'pray', 'slave', 'slaves', 'war', 'wars', 'weapon', 'weapons', 'crime', 'prison', 'victim', 'victims',
  'abortion', 'alcohol', 'beer', 'wine', 'drunk', 'blood', 'cancer', 'disease', 'fat', 'ugly', 'stupid', 'idiot',
]);

const raw = JSON.parse(readFileSync(join(src, 'english-words-' + LEVEL + '.json'), 'utf8'));
const words = Array.from(new Set(raw))
  .filter((w) => /^[a-z]+$/.test(w) && w.length >= MIN_LEN && w.length <= MAX_LEN && !EXCLUDE.has(w))
  .sort();

const body =
  '/* Gõ Nhanh - danh sách từ cho bài gõ (' + words.length + ' từ). FILE SINH TỰ ĐỘNG bằng tools/build-words.mjs, đừng sửa tay.\n' +
  ' * Nguồn: SCOWL mức ' + LEVEL + ' (gói npm wordlist-english 1.2.1), giấy phép trong WORDS-LICENSE.txt. */\n' +
  '(function (root) {\n' +
  "  'use strict';\n" +
  '  var W = ' + JSON.stringify(words.join(' ')) + ".split(' ');\n" +
  "  if (typeof module !== 'undefined' && module.exports) module.exports = W;\n" +
  '  else root.WORDS = W;\n' +
  "})(typeof window !== 'undefined' ? window : this);\n";

writeFileSync(join(here, '..', 'words.js'), body);
console.log('words.js: ' + words.length + ' từ, ' + body.length + ' byte');
