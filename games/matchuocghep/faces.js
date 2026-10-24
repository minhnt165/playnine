/* =====================================================================
 * Mạt Chược Ghép - Mặt quân vẽ bằng SVG tự làm (không dùng font / ảnh có bản quyền)
 *   - window.MJFaces.sprite(lang) trả chuỗi <svg> chứa các <symbol> (khung 60 × 80):
 *     mj-f<n> = mặt cổ điển, mj-s<n> = mặt đơn giản (số to theo màu chất, dùng khi quân nhỏ)
 *   - n theo engine: 0–8 tròn, 9–17 văn, 18–26 vạn, 27–30 gió Đ/N/T/B, 31–33 rồng đỏ/xanh/trắng, 34–37 hoa, 38–41 mùa
 *   - Chữ trên quân gió theo ngôn ngữ (en: E S W N, vi: Đ N T B); chữ số dùng font của trang
 * ===================================================================== */
(function (root) {
  'use strict';

  const C = {
    blue: '#1d4fa8',
    green: '#17803d',
    red: '#c8262b',
    ink: '#1e2a4a',
    gold: '#d99a12',
    pink: '#d94f86',
    purple: '#7b4bc4',
    teal: '#0e8a8a',
    orange: '#e0661c',
  };
  const B = C.blue;
  const G = C.green;
  const R = C.red;

  /* ---------------- Tròn (dots) ---------------- */

  function dot(cx, cy, r, color) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + color + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.6).toFixed(2) + '" fill="none" stroke="#fff" stroke-width="' + (r * 0.2).toFixed(2) + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.2).toFixed(2) + '" fill="#fff"/>';
  }
  const DOTS = {
    2: [[30, 23, 12, G], [30, 57, 12, B]],
    3: [[15, 17, 9.5, B], [30, 40, 9.5, R], [45, 63, 9.5, G]],
    4: [[18, 23, 10.5, B], [42, 23, 10.5, G], [18, 57, 10.5, G], [42, 57, 10.5, B]],
    5: [[16, 19, 9.5, B], [44, 19, 9.5, G], [30, 40, 9.5, R], [16, 61, 9.5, G], [44, 61, 9.5, B]],
    6: [[19, 16, 9, G], [41, 16, 9, G], [19, 40, 9, R], [41, 40, 9, R], [19, 64, 9, R], [41, 64, 9, R]],
    7: [[14, 12, 7, G], [30, 20, 7, G], [46, 28, 7, G], [19, 48, 8.5, R], [41, 48, 8.5, R], [19, 67, 8.5, R], [41, 67, 8.5, R]],
    8: [[19, 12, 8, B], [41, 12, 8, B], [19, 31, 8, B], [41, 31, 8, B], [19, 50, 8, B], [41, 50, 8, B], [19, 69, 8, B], [41, 69, 8, B]],
    9: [[14, 16, 8.5, B], [30, 16, 8.5, B], [46, 16, 8.5, B], [14, 40, 8.5, R], [30, 40, 8.5, R], [46, 40, 8.5, R], [14, 64, 8.5, G], [30, 64, 8.5, G], [46, 64, 8.5, G]],
  };
  function dotsFace(n) {
    if (n === 1) {
      // Một tròn: bông tròn lớn nhiều vòng
      return '<circle cx="30" cy="40" r="22" fill="' + G + '"/>' +
        '<circle cx="30" cy="40" r="18" fill="#fff"/>' +
        '<circle cx="30" cy="40" r="15" fill="' + B + '"/>' +
        '<circle cx="30" cy="40" r="10" fill="none" stroke="#fff" stroke-width="2.2" stroke-dasharray="3 2.2"/>' +
        '<circle cx="30" cy="40" r="6.5" fill="' + R + '"/>' +
        '<circle cx="30" cy="40" r="2.2" fill="#fff"/>';
    }
    return DOTS[n].map(([x, y, r, c]) => dot(x, y, r, c)).join('');
  }

  /* ---------------- Văn (bamboo) ---------------- */

  function stick(cx, cy, h, color) {
    const w = 6.6;
    const x = cx - w / 2;
    const y = cy - h / 2;
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3.3" fill="' + color + '"/>' +
      '<path d="M' + x + ' ' + cy + 'h' + w + 'M' + x + ' ' + (y + 2.6) + 'h' + w + 'M' + x + ' ' + (y + h - 2.6) + 'h' + w + '" stroke="rgba(0,0,0,.35)" stroke-width="1.3"/>' +
      '<path d="M' + (cx - 1.1) + ' ' + (y + 4) + 'V' + (cy - 2) + 'M' + (cx - 1.1) + ' ' + (cy + 2) + 'V' + (y + h - 4) + '" stroke="rgba(255,255,255,.45)" stroke-width="1.2" stroke-linecap="round"/>';
  }
  const STICKS = {
    2: [[30, 22, 24, G], [30, 58, 24, G]],
    3: [[30, 22, 24, G], [19, 58, 24, G], [41, 58, 24, G]],
    4: [[19, 22, 24, G], [41, 22, 24, G], [19, 58, 24, G], [41, 58, 24, G]],
    5: [[15, 22, 24, G], [45, 22, 24, G], [30, 40, 24, R], [15, 58, 24, G], [45, 58, 24, G]],
    6: [[15, 22, 24, G], [30, 22, 24, G], [45, 22, 24, G], [15, 58, 24, R], [30, 58, 24, R], [45, 58, 24, R]],
    7: [[30, 14, 19, R], [15, 40, 19, G], [30, 40, 19, G], [45, 40, 19, G], [15, 65, 19, G], [30, 65, 19, G], [45, 65, 19, G]],
    8: [[12, 22, 24, G], [24, 22, 24, R], [36, 22, 24, R], [48, 22, 24, G], [12, 58, 24, G], [24, 58, 24, R], [36, 58, 24, R], [48, 58, 24, G]],
    9: [[15, 14, 20, G], [30, 14, 20, R], [45, 14, 20, G], [15, 40, 20, G], [30, 40, 20, R], [45, 40, 20, G], [15, 66, 20, G], [30, 66, 20, R], [45, 66, 20, G]],
  };
  function bambooFace(n) {
    if (n === 1) {
      // Một văn: cây trúc lớn có lá, mặt trời đỏ
      return '<circle cx="45" cy="16" r="6" fill="' + R + '"/>' +
        '<rect x="25" y="10" width="10" height="62" rx="5" fill="' + G + '"/>' +
        '<path d="M25 28h10M25 46h10M25 62h10" stroke="rgba(0,0,0,.35)" stroke-width="1.6"/>' +
        '<path d="M28.5 14V26M28.5 31V44M28.5 49V60" stroke="rgba(255,255,255,.45)" stroke-width="1.5" stroke-linecap="round"/>' +
        '<path d="M35 30q12-8 18 2q-11 3-18-2zM25 50q-12-8-18 2q11 3 18-2zM35 56q10-4 15 4q-9 1-15-4z" fill="#2fa35a"/>';
    }
    return STICKS[n].map(([x, y, h, c]) => stick(x, y, h, c)).join('');
  }

  /* ---------------- Vạn (characters) ---------------- */

  const NUMERAL = {
    1: 'M11 22H49',
    2: 'M17 14H43M10 30H50',
    3: 'M17 9H43M19 20H41M10 32H50',
    4: 'M12 10V35M12 10H48V35M12 33H48M25 11Q25 23 18 27M35 11V22Q35 26 41 26',
    5: 'M13 9H47M29 9L25 33M17 20H42V33M8 33H52',
    6: 'M30 4L32 10M9 15H51M24 21L14 34M36 21L46 34',
    7: 'M8 20L52 14M24 6V27Q24 34 32 34H48V28',
    8: 'M25 9Q24 26 10 34M35 9Q37 26 52 34',
    9: 'M9 16H35Q37 16 36 23L34 31Q34 35 40 34H48V28M27 5Q25 26 9 35',
  };
  // Chữ "vạn" giản lược, màu đỏ
  const WAN = 'M10 44H50M22 39V49M38 39V49M17 52H43V62H17ZM30 52V62M17 57H43M13 77V66H47V73Q47 77 42 77M30 62V71M22 72L39 69';
  function charsFace(n) {
    return '<path d="' + NUMERAL[n] + '" fill="none" stroke="' + C.ink + '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + WAN + '" fill="none" stroke="' + R + '" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>';
  }

  /* ---------------- Gió, rồng ---------------- */

  const WIND_LETTERS = { en: ['E', 'S', 'W', 'N'], vi: ['Đ', 'N', 'T', 'B'] };
  const WIND_ANGLE = [90, 180, 270, 0]; // Đông, Nam, Tây, Bắc: mũi tên chỉ hướng
  function arrow(n, cx, cy, s) {
    return '<path transform="translate(' + cx + ' ' + cy + ') scale(' + s + ') rotate(' + WIND_ANGLE[n - 1] + ')" d="M0 -15L9 6L0 1L-9 6Z" fill="' + C.ink + '"/>';
  }
  function windFace(n, lang) {
    const letter = (WIND_LETTERS[lang] || WIND_LETTERS.en)[n - 1];
    return '<circle cx="30" cy="27" r="19" fill="none" stroke="' + C.ink + '" stroke-width="2.6"/>' +
      '<path d="M30 6v5M30 43v5M9 27h5M46 27h5" stroke="' + C.ink + '" stroke-width="2.4" stroke-linecap="round"/>' +
      arrow(n, 30, 27, 1) +
      '<text x="30" y="74" text-anchor="middle" font-size="25" font-weight="800" fill="' + C.ink + '">' + letter + '</text>';
  }
  function dragonFace(n) {
    if (n === 1) {
      // Rồng đỏ (Trung): khung chữ nhật có nét dọc xuyên giữa
      return '<rect x="12" y="25" width="36" height="27" rx="4" fill="none" stroke="' + R + '" stroke-width="6.5"/>' +
        '<path d="M30 8V72" stroke="' + R + '" stroke-width="7" stroke-linecap="round"/>';
    }
    if (n === 2) {
      // Rồng xanh (Phát): viên ngọc hình thoi
      return '<path d="M30 7L53 40L30 73L7 40Z" fill="' + G + '"/>' +
        '<path d="M30 20L44 40L30 60L16 40Z" fill="none" stroke="#fff" stroke-width="3.2"/>' +
        '<circle cx="30" cy="40" r="5" fill="#fff"/>';
    }
    // Rồng trắng (Bạch): khung đôi màu xanh dương
    return '<rect x="8" y="8" width="44" height="64" rx="5" fill="none" stroke="' + B + '" stroke-width="4.5"/>' +
      '<rect x="16.5" y="16.5" width="27" height="47" rx="2.5" fill="none" stroke="' + B + '" stroke-width="2.6"/>';
  }

  /* ---------------- Hoa, mùa ---------------- */

  // Khung đứt nét chung cho cả nhóm (hồng = hoa, ngọc = mùa) để thấy ngay là ghép được với nhau
  const frame = (color) => '<rect x="4" y="4" width="52" height="72" rx="7" fill="none" stroke="' + color + '" stroke-width="2.4" stroke-dasharray="5 3.5"/>';
  const ring = (cx, cy, r, k, fn) => Array.from({ length: k }, (_, i) => fn(cx + r * Math.cos((i / k) * Math.PI * 2 - Math.PI / 2), cy + r * Math.sin((i / k) * Math.PI * 2 - Math.PI / 2), (i / k) * 360)).join('');
  const r1 = (v) => Math.round(v * 10) / 10;

  function flowerFace(n) {
    let art = '';
    if (n === 1) {
      // Mai: năm cánh tròn hồng
      art = ring(30, 38, 11, 5, (x, y) => '<circle cx="' + r1(x) + '" cy="' + r1(y) + '" r="8.5" fill="' + C.pink + '"/>') +
        '<circle cx="30" cy="38" r="5" fill="' + C.gold + '"/><path d="M30 52V70" stroke="#7a4a2a" stroke-width="3" stroke-linecap="round"/>';
    } else if (n === 2) {
      // Lan: ba cánh dài tím + lá
      art = '<path d="M30 60Q14 70 8 50M30 60Q46 70 52 50" fill="none" stroke="' + G + '" stroke-width="3" stroke-linecap="round"/>' +
        [-55, 0, 55].map((a) => '<ellipse cx="30" cy="22" rx="6.5" ry="15" fill="' + C.purple + '" transform="rotate(' + a + ' 30 38)"/>').join('') +
        '<circle cx="30" cy="38" r="5" fill="#f4d35e"/><path d="M30 43V66" stroke="' + G + '" stroke-width="3" stroke-linecap="round"/>';
    } else if (n === 3) {
      // Cúc: nhiều cánh mảnh vàng
      art = ring(30, 36, 0, 12, (x, y, a) => '<ellipse cx="30" cy="24" rx="3.6" ry="11" fill="' + C.gold + '" transform="rotate(' + a + ' 30 36)"/>') +
        '<circle cx="30" cy="36" r="6.5" fill="' + C.orange + '"/><path d="M30 50V71M30 62q-8-6-12 0" fill="none" stroke="' + G + '" stroke-width="3" stroke-linecap="round"/>';
    } else {
      // Sen: cánh nhọn hồng trên lá
      art = '<path d="M10 62Q30 74 50 62Q30 56 10 62Z" fill="' + G + '"/>' +
        '<path d="M30 16Q40 34 30 56Q20 34 30 16Z" fill="' + C.pink + '"/>' +
        '<path d="M14 30Q30 36 30 56Q16 50 14 30Z" fill="#e98ab0"/><path d="M46 30Q30 36 30 56Q44 50 46 30Z" fill="#e98ab0"/>';
    }
    return frame('#e7a1c0') + art;
  }

  function seasonFace(n) {
    let art = '';
    if (n === 1) {
      // Xuân: chồi non
      art = '<path d="M30 70V34" stroke="' + G + '" stroke-width="3.4" stroke-linecap="round"/>' +
        '<path d="M30 48Q14 46 12 30Q28 30 30 48ZM30 40Q46 38 48 22Q32 22 30 40Z" fill="#2fa35a"/>' +
        '<circle cx="30" cy="27" r="6" fill="' + C.pink + '"/>';
    } else if (n === 2) {
      // Hạ: mặt trời
      art = ring(30, 40, 19, 8, (x, y, a) => '<rect x="' + r1(x - 2.5) + '" y="' + r1(y - 6) + '" width="5" height="12" rx="2.5" fill="' + C.orange + '" transform="rotate(' + a + ' ' + r1(x) + ' ' + r1(y) + ')"/>') +
        '<circle cx="30" cy="40" r="11" fill="' + C.gold + '"/>';
    } else if (n === 3) {
      // Thu: lá phong
      art = '<path d="M30 12L35 26L46 21L42 34L53 37L42 45L46 56L33 51L31 66L29 66L27 51L14 56L18 45L7 37L18 34L14 21L25 26Z" fill="' + C.orange + '"/>' +
        '<path d="M30 30V72" stroke="#8a3b12" stroke-width="2.6" stroke-linecap="round"/>';
    } else {
      // Đông: bông tuyết
      const arm = (a) => '<g transform="rotate(' + a + ' 30 40)"><path d="M30 40V17M30 24l-6-6M30 24l6-6M30 32l-5-4M30 32l5-4" fill="none" stroke="' + C.blue + '" stroke-width="3" stroke-linecap="round"/></g>';
      art = [0, 60, 120, 180, 240, 300].map(arm).join('') + '<circle cx="30" cy="40" r="3.5" fill="' + C.blue + '"/>';
    }
    return frame('#6cc7c2') + art;
  }

  /* ---------------- Mặt đơn giản ---------------- */

  const SUIT_COLOR = { dots: B, bamboo: G, chars: R };
  function simpleSuit(suit, rank) {
    const color = SUIT_COLOR[suit];
    let mark;
    if (suit === 'dots') mark = '<circle cx="30" cy="67" r="7" fill="none" stroke="' + color + '" stroke-width="3.6"/><circle cx="30" cy="67" r="2" fill="' + color + '"/>';
    else if (suit === 'bamboo') mark = '<rect x="20" y="59" width="6" height="16" rx="3" fill="' + color + '"/><rect x="34" y="59" width="6" height="16" rx="3" fill="' + color + '"/>';
    else mark = '<rect x="21" y="59" width="18" height="16" rx="3" fill="' + color + '"/><path d="M25 65h10M30 62v10" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>';
    return '<text x="30" y="50" text-anchor="middle" font-size="50" font-weight="800" fill="' + color + '">' + rank + '</text>' + mark;
  }
  function simpleWind(n, lang) {
    const letter = (WIND_LETTERS[lang] || WIND_LETTERS.en)[n - 1];
    return '<text x="30" y="52" text-anchor="middle" font-size="48" font-weight="800" fill="' + C.ink + '">' + letter + '</text>' + arrow(n, 30, 66, 0.55);
  }

  /** Mặt cổ điển của quân f. */
  function classic(f, lang) {
    if (f < 9) return dotsFace(f + 1);
    if (f < 18) return bambooFace(f - 8);
    if (f < 27) return charsFace(f - 17);
    if (f < 31) return windFace(f - 26, lang);
    if (f < 34) return dragonFace(f - 30);
    if (f < 38) return flowerFace(f - 33);
    return seasonFace(f - 37);
  }
  /** Mặt đơn giản: số / chữ to; rồng, hoa, mùa vốn đã dễ đọc nên giữ hình cổ điển. */
  function simple(f, lang) {
    if (f < 9) return simpleSuit('dots', f + 1);
    if (f < 18) return simpleSuit('bamboo', f - 8);
    if (f < 27) return simpleSuit('chars', f - 17);
    if (f < 31) return simpleWind(f - 26, lang);
    return classic(f, lang);
  }

  /** Sprite SVG đủ 42 mặt × 2 kiểu, chèn một lần vào trang (ẩn), quân dùng <use href="#mj-f12">. */
  function sprite(lang) {
    let out = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>';
    for (let f = 0; f < 42; f++) {
      out += '<symbol id="mj-f' + f + '" viewBox="0 0 60 80">' + classic(f, lang) + '</symbol>';
      out += '<symbol id="mj-s' + f + '" viewBox="0 0 60 80">' + simple(f, lang) + '</symbol>';
    }
    return out + '</defs></svg>';
  }

  const api = { sprite, classic, simple };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJFaces = api;
})(typeof window !== 'undefined' ? window : this);
