/* =====================================================================
 * Tìm Chữ - Script sinh bộ từ words.js từ SCOWL (gói npm wordlist-english 1.2.1, MIT)
 *   Chạy: node tools/build-words.mjs [thư mục package của wordlist-english]
 *   - Chủ đề: danh sách viết tay bên dưới, chỉ giữ từ có trong SCOWL mức ≤ 35 (english + american)
 *   - Trộn lẫn ("mixed"): từ gốc phổ biến SCOWL mức ≤ 20, bỏ dạng chia (-s, -es, -ed, -ing) khi có từ gốc
 *   - Mọi từ: chỉ a–z, dài 3–10, không đối xứng (đọc xuôi ngược như nhau), không nằm trong danh sách loại trừ
 *   Kết quả ghi đè words.js trong thư mục game (window.TIMCHU_WORDS / module.exports).
 * ===================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] ||
  'C:/Users/MINHNT~1/AppData/Local/Temp/claude/c--Users-MinhNT165-Workspace-games/72899a7c-7144-4c0f-97d3-22db4663768a/scratchpad/words/package';
const OUT = join(here, '..', 'words.js');

/** Gộp các mức ≤ level của english-words và american-words. */
function load(level) {
  const set = new Set();
  for (const lv of [10, 20, 35, 40, 50, 55, 60, 70]) {
    if (lv > level) break;
    for (const kind of ['english', 'american']) {
      for (const w of JSON.parse(readFileSync(join(SRC, kind + '-words-' + lv + '.json'), 'utf8'))) set.add(w);
    }
  }
  return set;
}

// Từ thô tục / nhạy cảm / buồn: không dùng làm đáp án
const EXCLUDE = new Set(`
abuse addict alcohol anal arse ass bastard beer bitch blood bloody bomb bombs booze breast bullet butt cancer cocaine cock corpse crap crime cult
damn dead deadly death devil dick die died dies drug drugs drunk dying execute fart fuck gay genocide gun guns hate hell heroin hitler homo horny
kill killed killer killing kills lesbian liquor lust murder naked nazi nigger nude opium orgasm penis piss poison porn prison prostitute pussy
queer racism racist rape raped rapist rifle satan semen sex sexual sexy shit shoot slave slaves slut smoke smoking sperm stab steal suicide
terror terrorist tits torture toxic urine vagina vodka weapon weapons whisky whiskey whore wine wound
`.trim().split(/\s+/));

// Chủ đề viết tay; từ không có trong SCOWL ≤ 35 bị bỏ (script in ra để biết)
const THEMES = {
  animals: `cat dog horse cow pig sheep goat mouse rabbit tiger lion bear wolf fox deer monkey zebra giraffe camel elephant snake frog turtle
    eagle owl parrot penguin duck goose chicken whale shark dolphin octopus crab spider bee ant butterfly beetle squirrel kangaroo koala panda
    donkey hamster lizard salmon pigeon swan falcon hawk moose otter seal walrus leopard cheetah gorilla ostrich peacock lobster snail worm
    buffalo rhino hippo pony puppy kitten lamb calf bull hen crow robin sparrow badger beaver raccoon hedgehog mole jaguar panther`,
  food: `bread butter cheese apple banana orange grape lemon cherry peach pear plum melon mango carrot potato tomato onion garlic pepper rice
    pasta noodle soup salad pizza burger sandwich cookie cake pie candy honey sugar salt egg milk cream yogurt bacon sausage steak bean corn
    cabbage lettuce spinach mushroom pumpkin cucumber muffin pancake waffle chocolate coffee tea juice biscuit cereal jam toast olive walnut
    peanut almond coconut lime kiwi berry omelet curry taco popcorn pudding`,
  nature: `tree forest river lake ocean mountain hill valley desert island beach rock stone sand cloud rain snow wind storm thunder flower
    grass leaf branch root seed moss sky sun moon star planet volcano canyon meadow pond stream waterfall glacier jungle cave cliff field
    garden rainbow breeze shore wave coral pebble bush petal blossom earth soil mud fog frost ice spring summer autumn winter sunset dawn`,
  body: `head hair face eye ear nose mouth lip tooth tongue neck shoulder arm elbow wrist hand finger thumb chest heart lung stomach back leg
    knee ankle foot toe skin bone brain muscle cheek chin forehead eyebrow throat hip palm heel nail jaw spine rib belly waist eyelash
    kidney liver`,
  home: `house door window roof wall floor kitchen bedroom bathroom garage table chair sofa bed lamp mirror shelf carpet curtain pillow
    blanket closet stairs oven sink shower towel clock vase drawer desk couch basket bucket broom kettle teapot spoon fork knife plate bowl
    cup mug candle ceiling chimney fence garden porch attic cellar hallway doorbell cushion`,
  sports: `soccer tennis golf hockey baseball football rugby boxing cricket cycling skiing surfing rowing sailing archery karate swimming
    running hiking diving racing skating bowling chess goal ball net racket team coach player referee score match medal trophy stadium
    helmet whistle jump sprint relay marathon champion winner league kick pass tackle serve volley`,
  jobs: `doctor nurse teacher farmer pilot chef baker driver lawyer judge police soldier sailor artist writer singer actor dancer dentist
    painter plumber miner engineer banker clerk cashier waiter tailor builder carpenter author editor poet barber butcher guard nanny
    manager pianist surgeon vet florist jeweler mechanic reporter director designer scientist professor librarian fisherman gardener`,
  music: `piano guitar violin drum flute trumpet harp organ bass cello song melody rhythm chord note tune band choir concert opera jazz
    blues rock singer lyric tempo beat volume radio album record stage banjo whistle bugle horn tuba anthem ballad chorus duet solo
    orchestra harmony composer conductor hymn lullaby`,
  travel: `airport ticket passport hotel luggage suitcase map train plane ship bus taxi bicycle station road bridge tunnel city village
    tourist camera holiday journey trip guide museum castle temple harbor ferry cruise cabin tent backpack compass postcard souvenir
    border highway subway voyage island resort beach motel visa`,
  clothes: `shirt dress skirt jacket coat sweater trousers jeans shorts sock shoe boot sandal hat cap scarf glove belt tie button pocket
    collar sleeve zipper uniform apron vest hood ring necklace bracelet watch slipper blouse cardigan mitten bonnet tuxedo gown robe
    raincoat overalls earring sneaker`,
  school: `pencil pen eraser ruler book paper notebook desk teacher student lesson class exam test homework library science history art
    map globe chalk board lunch grade school college reading writing spelling science math alphabet number letter crayon marker glue
    scissors backpack locker classroom diploma quiz essay`,
  shapes: `red blue green yellow purple orange pink brown black white gray silver gold violet circle square triangle oval diamond star heart
    cube sphere cone cylinder line curve arrow cross crescent pyramid prism rectangle hexagon spiral dot stripe beige maroon navy olive
    scarlet crimson indigo turquoise`,
};

const valid = (w) => /^[a-z]{3,10}$/.test(w) && !EXCLUDE.has(w) && w !== w.split('').reverse().join('');

const s35 = load(35);
const s20 = load(20);
const themes = {};
const dropped = [];
for (const [key, text] of Object.entries(THEMES)) {
  const words = [...new Set(text.trim().split(/\s+/))];
  themes[key] = words.filter((w) => {
    const ok = valid(w) && s35.has(w);
    if (!ok) dropped.push(key + ':' + w);
    return ok;
  }).sort();
}

/** Từ gốc phổ biến: bỏ dạng chia khi từ gốc cũng có trong bộ. */
function baseForm(w, set) {
  if (w.endsWith('ies') && set.has(w.slice(0, -3) + 'y')) return false;
  if (w.endsWith('es') && set.has(w.slice(0, -2))) return false;
  if (w.endsWith('s') && !w.endsWith('ss') && set.has(w.slice(0, -1))) return false;
  if (w.endsWith('ed') && (set.has(w.slice(0, -2)) || set.has(w.slice(0, -1)) || (w.length > 4 && w[w.length - 3] === w[w.length - 4] && set.has(w.slice(0, -3))))) return false;
  if (w.endsWith('ied') && set.has(w.slice(0, -3) + 'y')) return false;
  if (w.endsWith('ing') && (set.has(w.slice(0, -3)) || set.has(w.slice(0, -3) + 'e') || (w.length > 5 && w[w.length - 4] === w[w.length - 5] && set.has(w.slice(0, -4))))) return false;
  if (w.endsWith('ly') && set.has(w.slice(0, -2))) return false;
  if (w.endsWith('er') && w.length > 5 && set.has(w.slice(0, -2)) && !s35.has(w)) return false;
  return true;
}
const mixed = [...s20].filter((w) => valid(w) && baseForm(w, s20)).sort();

const lines = [
  '/* Tìm Chữ - Bộ từ (tự sinh bởi tools/build-words.mjs từ SCOWL qua wordlist-english 1.2.1; xem WORDS-LICENSE.txt). Đừng sửa tay. */',
  '(function (root) {',
  "  'use strict';",
  '  const S = (s) => s.split(" ");',
  '  const data = {',
  '    themes: {',
  ...Object.entries(themes).map(([k, ws]) => '      ' + k + ': S("' + ws.join(' ') + '"),'),
  '    },',
  '    mixed: S("' + mixed.join(' ') + '"),',
  '  };',
  "  if (typeof module !== 'undefined' && module.exports) module.exports = data;",
  '  else root.TIMCHU_WORDS = data;',
  "})(typeof window !== 'undefined' ? window : this);",
  '',
];
writeFileSync(OUT, lines.join('\n'));
const size = Buffer.byteLength(lines.join('\n'));
console.log('themes:', Object.entries(themes).map(([k, w]) => k + ' ' + w.length).join(', '));
console.log('mixed:', mixed.length, '· words.js', (size / 1024).toFixed(1), 'KB');
if (dropped.length) console.log('bỏ (không có trong SCOWL ≤ 35 / loại trừ):', dropped.join(' '));
