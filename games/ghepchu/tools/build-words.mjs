/* =====================================================================
 * Ghép Chữ - Script sinh bộ từ words.js từ SCOWL (gói npm wordlist-english 1.2.1, MIT)
 *   Chạy: node tools/build-words.mjs [thư mục package của wordlist-english]
 *   - Từ hợp lệ: chỉ a–z, dài 3–7, SCOWL mức ≤ 50 (english + american + british), bỏ danh sách chặn
 *   - Từ gốc của vòng: dài 6–7, SCOWL mức ≤ 20 (english), không nằm trong danh sách nhạy cảm,
 *     ghép được ≥ MIN_WORDS từ hợp lệ và tổng điểm mọi từ trong khoảng [MIN_TOTAL, MAX_TOTAL]
 *     (để vòng 6 chữ và 7 chữ có tiềm năng điểm gần nhau), mỗi bộ chữ cái chỉ một từ gốc
 *   - Chỉ giữ những từ hợp lệ ghép được từ ít nhất một từ gốc (file nhỏ hơn)
 *   Kết quả ghi đè words.js: { words: { 3: 'aceact…', … }, bases: { 6: '…', 7: '…' } } — mỗi nhóm cùng độ dài
 *   nối liền không dấu cách, đã sắp xếp. Dùng window.GHEPCHU_WORDS trong trình duyệt, module.exports trong Node.
 * ===================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] ||
  'C:/Users/MINHNT~1/AppData/Local/Temp/claude/c--Users-MinhNT165-Workspace-games/72899a7c-7144-4c0f-97d3-22db4663768a/scratchpad/words/package';
const OUT = join(here, '..', 'words.js');

// Phải khớp engine.js
const POINTS = { 3: 100, 4: 400, 5: 1200, 6: 2000, 7: 3000 };
const MIN_WORDS = 25;
const MIN_TOTAL = 15000;
const MAX_TOTAL = 40000;

/** Gộp các mức ≤ level của những biến thể đã cho. */
function load(level, kinds) {
  const set = new Set();
  for (const lv of [10, 20, 35, 40, 50, 55, 60, 70]) {
    if (lv > level) break;
    for (const kind of kinds) {
      for (const w of JSON.parse(readFileSync(join(SRC, kind + '-words-' + lv + '.json'), 'utf8'))) set.add(w);
    }
  }
  return set;
}

// Chặn hẳn (không tính là từ hợp lệ, không hiện trong danh sách bỏ lỡ): thô tục, miệt thị, tình dục,
// và vài "từ" 3 chữ là mảnh viết tắt / dạng sở hữu mất dấu nháy trong SCOWL
const BLOCK = new Set(`
fuck fucks fucked fucker fuckers fucking shit shits shitty shitted cunt cunts dick dicks cock cocks piss pissed pisses pissing
slut sluts slutty whore whores whored bitch bitches bitched bitchy bastard bastards nigger niggers nigga niggas niggaz fag fags
fagged fagging faggot faggots dyke dykes rape raped rapes raping rapist rapists porn porno pornos tit tits titty prick pricks
pussy pussies crap craps crappy damn damned damns ass asses arse arses anal anus anuses penis penises vagina vaginas semen sperm
sperms horny slag slags gook gooks chink chinks coon coons retard retards retarded bugger buggers turd turds boob boobs boobies
sexy sex sexes sexed orgasm orgasms erotic nude nudes dildo dildos wank wanks wanker spic spics kike kikes homo homos twat twats
gyp gyps gypped hooker hookers pimp pimps pimped sodomy jism jizz
hes mys pis mes nth pwn hos
`.trim().split(/\s+/));

// Không chọn làm từ gốc (vẫn là từ hợp lệ nếu không bị chặn): chủ đề buồn / bạo lực / chất gây nghiện
const SENSITIVE = /^(kill|murder|suicid|drug|cocaine|heroin|nazi|terror|bomb|weapon|rifle|bullet|corpse|death|dead|dying|torture|slave|racis|prison|crime|crimin|poison|abuse|addict|alcohol|drunk|tobacco|cancer|disease|naked|sexual|victim|violen|assault|hostage|funeral|genocid|wound|blood|devil|satan|warfare|warrior|gunman|gunmen|gunfire|shoot|stab|steal|thief|thieves|robber|hatred|hellish|liquor|whisk|vodka|beer|wine|smok|cigar|gambl|casino)/;

const valid = [...load(50, ['english', 'american', 'british'])].filter((w) => /^[a-z]{3,7}$/.test(w) && !BLOCK.has(w));
const common = [...load(20, ['english'])].filter((w) => /^[a-z]{6,7}$/.test(w) && !BLOCK.has(w) && !SENSITIVE.test(w));

const count = (w) => {
  const c = new Uint8Array(26);
  for (let i = 0; i < w.length; i++) c[w.charCodeAt(i) - 97]++;
  return c;
};
const fits = (cw, cb) => {
  for (let i = 0; i < 26; i++) if (cw[i] > cb[i]) return false;
  return true;
};
const validCounts = valid.map((w) => [w, count(w)]);

/** Mọi từ hợp lệ ghép được từ các chữ của b. */
function subwords(b) {
  const cb = count(b);
  return validCounts.filter(([w, cw]) => w.length <= b.length && fits(cw, cb)).map(([w]) => w);
}

const bases = [];
const keep = new Set();
const seenKey = new Set();
for (const b of common.sort()) {
  const key = b.split('').sort().join('');
  if (seenKey.has(key)) continue; // cùng bộ chữ (master / stream): giữ từ đứng trước theo ABC
  const subs = subwords(b);
  const total = subs.reduce((s, w) => s + POINTS[w.length], 0);
  if (subs.length < MIN_WORDS || total < MIN_TOTAL || total > MAX_TOTAL) continue;
  seenKey.add(key);
  bases.push(b);
  subs.forEach((w) => keep.add(w));
}

/** Nhóm theo độ dài, sắp xếp, nối liền. */
function group(list, lens) {
  const out = {};
  for (const n of lens) out[n] = list.filter((w) => w.length === n).sort().join('');
  return out;
}

const data = { words: group([...keep], [3, 4, 5, 6, 7]), bases: group(bases, [6, 7]) };
const js =
  '/* Ghép Chữ - bộ từ tiếng Anh, SINH TỰ ĐỘNG bằng tools/build-words.mjs từ SCOWL (xem WORDS-LICENSE.txt). Không sửa tay.\n' +
  ' *   words[n]: các từ hợp lệ dài n nối liền (đã sắp xếp); bases[n]: các từ gốc dài n của vòng. */\n' +
  '(function (root) {\n' +
  "  'use strict';\n" +
  '  const WORDS = ' + JSON.stringify(data, null, 1).replace(/\n\s*/g, ' ') + ';\n' +
  "  if (typeof module !== 'undefined' && module.exports) module.exports = WORDS;\n" +
  '  else root.GHEPCHU_WORDS = WORDS;\n' +
  "})(typeof window !== 'undefined' ? window : this);\n";
writeFileSync(OUT, js);

const by = (n) => bases.filter((b) => b.length === n).length;
console.log('từ hợp lệ: ' + keep.size + ' / ' + valid.length + ', từ gốc: ' + bases.length + ' (6 chữ: ' + by(6) + ', 7 chữ: ' + by(7) + ')');
console.log('words.js: ' + (Buffer.byteLength(js) / 1024).toFixed(1) + ' KB');
