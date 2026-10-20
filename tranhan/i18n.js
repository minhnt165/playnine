/* =====================================================================
 * Tranh Ẩn - Đa ngôn ngữ (tiếng Anh mặc định + tiếng Việt).
 * Ngôn ngữ dùng chung cả cổng PlayNine: localStorage['playnine-lang'] = 'en' | 'vi'.
 * Nạp TRƯỚC engine.js / app.js. Gắn đối tượng I18N vào window.
 * ===================================================================== */
(function () {
  'use strict';

  var LANG_KEY = 'playnine-lang';

  var DICT = {
    en: {
      'meta.title': 'Nonogram',
      'meta.desc': 'Nonogram: fill cells by the number clues to reveal the hidden picture. Hand-drawn picture packs with Vietnamese themes, random puzzles, a daily picture, hints, undo, statistics and autosave.',
      'app.name': 'Nonogram',

      'top.new': 'Choose picture',
      'top.newTitle': 'Choose picture (N)',
      'top.stats': 'Statistics',
      'top.settings': 'Settings',

      'hud.aria': 'Puzzle status',
      'hud.pack': 'Picture pack',
      'hud.filled': 'Filled',
      'hud.mistakes': 'Mistakes',
      'hud.time': 'Time',
      'hud.daily': 'Daily picture',
      'hud.random': 'Random {size}',
      'hud.solved': 'Solved',

      'board.aria': 'Picture grid. Arrow keys to move, Space to fill, X to mark X.',
      'cell.aria': 'Row {r} ({rc}), column {c} ({cc}): {state}',
      'cell.empty': 'Empty',
      'cell.filled': 'Filled',
      'cell.crossed': 'Marked X',
      'cell.miss': 'Wrong fill, marked X',
      'cell.pic': 'Picture cell',
      'cell.bg': 'Background',

      'tools.aria': 'Tools',
      'mode.aria': 'Tap mode',
      'mode.fill': 'Fill',
      'mode.fillTitle': 'Tap to fill (M to switch)',
      'mode.cross': 'Mark X',
      'mode.crossShort': 'Mark X',
      'mode.crossTitle': 'Tap to mark X (M to switch)',
      'tool.undo': 'Undo',
      'tool.undoTitle': 'Undo (Z)',
      'tool.redo': 'Redo',
      'tool.redoTitle': 'Redo (Y)',
      'tool.hint': 'Hint',
      'tool.hintTitle': 'Hint (H)',
      'tool.hintLeft': 'Hint ({n} left)',
      'tool.zoomIn': 'Zoom in grid',
      'tool.zoomOut': 'Zoom out grid',
      'tool.zoomTitle': 'Zoom in / out',
      'kbd.hint': 'Shortcuts: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> move · <kbd>Space</kbd> fill · <kbd>X</kbd> mark · <kbd>Z</kbd>/<kbd>Y</kbd> undo/redo · <kbd>H</kbd> hint · <kbd>N</kbd> choose picture · Drag to fill a whole line, right-click to mark X',

      'common.cancel': 'Cancel',
      'common.close': 'Close',
      'common.done': 'Done',

      'new.title': 'Choose a picture',
      'new.warning': 'The picture in progress will be discarded.',
      'new.packs': 'Picture packs',
      'new.random': 'Random',
      'new.daily': 'Daily picture',
      'new.dailyStreak': ' · {n}-day streak',
      'new.badgeNew': 'New',
      'new.packDesc': '{size} · {total} pictures · {k} solved',
      'new.packDone': '✓ Done',
      'new.randomAria': 'Random picture {size}',

      'size.5': 'Small',
      'size.10': 'Medium',
      'size.15': 'Large',
      'pack.name': '{label} pack',
      'pack.fullName': '{label} pack {size}',
      'pack.tabsAria': 'Picture size',
      'pack.progress': 'Solved {k}/{n} pictures · unsolved pictures show "?"',
      'pack.current': 'In progress',
      'pack.unsolved': 'Unsolved',
      'pack.ariaSolved': 'Picture #{n}: {title}, solved',
      'pack.ariaCurrent': 'Picture #{n}, in progress',
      'pack.ariaUnsolved': 'Picture #{n}, unsolved',

      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'theme.auto': 'Auto',
      'theme.light': 'Light',
      'theme.dark': 'Dark',
      'settings.lang': 'Language',
      'settings.check': 'Check mistakes',
      'settings.checkDesc': 'Filling an empty cell by mistake is flagged at once (red X) and counts as a mistake.',
      'settings.autoX': 'Auto-mark X',
      'settings.autoXDesc': 'When a row / column matches its clue, its remaining empty cells are marked X.',
      'settings.vibrate': 'Vibrate on long press',
      'settings.vibrateDesc': 'Vibrate lightly when you long-press to mark X (if supported).',
      'settings.rules': 'Each number is the length of a run of filled cells in that row / column, in order, with at least one empty cell between runs. Tap to fill, long-press to mark X, drag to fill a whole line.',
      'settings.version': 'Nonogram · version',

      'stats.title': 'Statistics',
      'stats.daily': 'Daily picture',
      'stats.streak': 'Day streak',
      'stats.solved': 'Solved',
      'stats.best': 'Best',
      'stats.bySize': 'By size',
      'stats.size': 'Size',
      'stats.played': 'Played',
      'stats.avg': 'Avg',
      'stats.avgNote': 'Avg: average time of solved pictures.',
      'stats.note': 'Picture packs: {k}/{n} pictures solved. Avg: average time of solved pictures (packs and random).',
      'stats.reset': 'Reset',
      'stats.resetConfirm': 'Tap again to clear',
      'stats.resetDone': 'Statistics reset',

      'result.kicker': 'You solved',
      'result.record': 'New record!',
      'result.time': 'Time',
      'result.best': 'Best',
      'result.bestSize': 'Best {size}',
      'result.hints': 'Hints',
      'result.view': 'View picture',
      'result.next': 'Next picture',
      'result.viewPack': 'View pack',
      'result.newRandom': 'New picture',
      'result.choose': 'Choose picture',
      'result.random': 'Random picture',
      'result.packText': 'Picture #{n} · {pack}',
      'result.dailyText': '{date} · {size}',
      'result.randomText': '{size} · every random picture has exactly one solution',
      'result.packNote': 'Solved {k}/{n} pictures in this pack',
      'result.dailyNote': '{n}-day streak · come back tomorrow!',

      'toast.noHints': 'All {n} hints used for this picture',
      'toast.hintFix': 'Row {r}, column {c} was wrong — fixed',
      'toast.hintFill': 'Hint: fill row {r}, column {c}',
      'toast.hintCross': 'Hint: mark X at row {r}, column {c}',
      'toast.modeFill': 'Tap to fill · long-press to mark X',
      'toast.modeCross': 'Tap to mark X · long-press to fill',
      'toast.flagged': { one: '1 wrong cell — marked with a red X', other: '{n} wrong cells — marked with a red X' },
      'toast.zoom': 'One finger to fill · two fingers (or drag the clues) to pan',

      'sum.none': 'No pictures solved yet · today\'s picture {size}',
      'sum.playedOnly': { one: '1 picture played · none solved yet', other: '{n} pictures played · none solved yet' },
      'sum.wonBest': { one: '1 picture solved · best {label} {time}', other: '{n} pictures solved · best {label} {time}' },
      'sum.won': { one: '1 picture solved', other: '{n} pictures solved' },
      'sum.statSolved': 'Pictures solved',
      'sum.statPacks': 'Picture packs',
      'sum.resumeDaily': 'Daily Nonogram',
      'sum.resumeSize': 'Nonogram {size}',
      'sum.resumeDetail': '{pct}% filled · {time}',
      'sum.dailyTitle': 'Today\'s picture: {size}',

      // Tên tranh trong bộ, khóa theo id của tranh trong engine.js
      'pic.tim': 'Heart',
      'pic.ngoi-sao': 'Star',
      'pic.ngoi-nha': 'House',
      'pic.mat-trang': 'Moon',
      'pic.not-nhac': 'Music note',
      'pic.chiec-la': 'Leaf',
      'pic.cai-coc': 'Cup',
      'pic.cay-thong': 'Pine tree',
      'pic.non-la': 'Conical hat',
      'pic.qua-xoai': 'Mango',
      'pic.den-long': 'Lantern',
      'pic.banh-chung': 'Chung cake',
      'pic.ca-phe-phin': 'Phin coffee',
      'pic.chiec-o': 'Umbrella',
      'pic.con-meo': 'Cat',
      'pic.con-thuyen': 'Boat',
      'pic.qua-tao': 'Apple',
      'pic.chia-khoa': 'Key',
      'pic.con-rua': 'Turtle',
      'pic.con-oc': 'Snail',
      'pic.bong-hoa': 'Flower',
      'pic.ngon-nui': 'Mountain',
      'pic.may-bay': 'Airplane',
      'pic.bat-pho': 'Bowl of pho',
      'pic.ao-dai': 'Ao dai',
      'pic.hoa-sen': 'Lotus',
      'pic.con-trau': 'Water buffalo',
      'pic.cay-tre': 'Bamboo',
      'pic.chua-mot-cot': 'One Pillar Pagoda',
      'pic.xe-dap': 'Bicycle',
      'pic.o-to': 'Car',
      'pic.ca-chep': 'Carp',
      'pic.cay-dua': 'Coconut tree',
    },

    vi: {
      'meta.title': 'Tranh Ẩn',
      'meta.desc': 'Tranh Ẩn (Nonogram) tiếng Việt: tô ô theo gợi ý số để lộ bức tranh. Bộ tranh vẽ sẵn chủ đề Việt Nam, tranh ngẫu nhiên, tranh hằng ngày, gợi ý, hoàn tác, thống kê, tự lưu ván.',
      'app.name': 'Tranh Ẩn',

      'top.new': 'Chọn tranh',
      'top.newTitle': 'Chọn tranh (N)',
      'top.stats': 'Thống kê',
      'top.settings': 'Cài đặt',

      'hud.aria': 'Trạng thái tranh',
      'hud.pack': 'Bộ tranh',
      'hud.filled': 'Đã tô',
      'hud.mistakes': 'Lỗi',
      'hud.time': 'Thời gian',
      'hud.daily': 'Tranh hằng ngày',
      'hud.random': 'Ngẫu nhiên {size}',
      'hud.solved': 'Đã giải',

      'board.aria': 'Lưới tranh. Phím mũi tên để di chuyển, Space để tô, X để đánh dấu X.',
      'cell.aria': 'Hàng {r} ({rc}), cột {c} ({cc}): {state}',
      'cell.empty': 'Trống',
      'cell.filled': 'Đã tô',
      'cell.crossed': 'Đánh dấu X',
      'cell.miss': 'Tô sai, đã đánh dấu X',
      'cell.pic': 'Ô tranh',
      'cell.bg': 'Nền',

      'tools.aria': 'Công cụ',
      'mode.aria': 'Chế độ chạm',
      'mode.fill': 'Tô',
      'mode.fillTitle': 'Chạm để tô (M để đổi)',
      'mode.cross': 'Đánh dấu X',
      'mode.crossShort': 'Dấu X',
      'mode.crossTitle': 'Chạm để đánh dấu X (M để đổi)',
      'tool.undo': 'Hoàn tác',
      'tool.undoTitle': 'Hoàn tác (Z)',
      'tool.redo': 'Làm lại',
      'tool.redoTitle': 'Làm lại (Y)',
      'tool.hint': 'Gợi ý',
      'tool.hintTitle': 'Gợi ý (H)',
      'tool.hintLeft': 'Gợi ý (còn {n})',
      'tool.zoomIn': 'Phóng to lưới',
      'tool.zoomOut': 'Thu nhỏ lưới',
      'tool.zoomTitle': 'Phóng to / thu nhỏ',
      'kbd.hint': 'Phím tắt: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> di chuyển · <kbd>Space</kbd> tô · <kbd>X</kbd> đánh dấu · <kbd>Z</kbd>/<kbd>Y</kbd> hoàn tác/làm lại · <kbd>H</kbd> gợi ý · <kbd>N</kbd> chọn tranh · Kéo để tô cả dòng, chuột phải để đánh dấu X',

      'common.cancel': 'Hủy',
      'common.close': 'Đóng',
      'common.done': 'Xong',

      'new.title': 'Chọn tranh',
      'new.warning': 'Tranh đang giải dở sẽ bị bỏ.',
      'new.packs': 'Bộ tranh',
      'new.random': 'Ngẫu nhiên',
      'new.daily': 'Tranh hằng ngày',
      'new.dailyStreak': ' · chuỗi {n} ngày',
      'new.badgeNew': 'Mới',
      'new.packDesc': '{size} · {total} tranh · đã giải {k}',
      'new.packDone': '✓ Xong',
      'new.randomAria': 'Tranh ngẫu nhiên {size}',

      'size.5': 'Nhỏ',
      'size.10': 'Vừa',
      'size.15': 'Lớn',
      'pack.name': 'Bộ {label}',
      'pack.fullName': 'Bộ {label} {size}',
      'pack.tabsAria': 'Cỡ tranh',
      'pack.progress': 'Đã giải {k}/{n} tranh · tranh chưa giải hiện dấu "?"',
      'pack.current': 'Đang giải',
      'pack.unsolved': 'Chưa giải',
      'pack.ariaSolved': 'Tranh #{n}: {title}, đã giải',
      'pack.ariaCurrent': 'Tranh #{n}, đang giải',
      'pack.ariaUnsolved': 'Tranh #{n}, chưa giải',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'theme.auto': 'Tự động',
      'theme.light': 'Sáng',
      'theme.dark': 'Tối',
      'settings.lang': 'Ngôn ngữ',
      'settings.check': 'Kiểm tra lỗi',
      'settings.checkDesc': 'Tô nhầm ô trống thì báo ngay (ô hiện X đỏ) và tính một lỗi.',
      'settings.autoX': 'Tự đánh dấu X',
      'settings.autoXDesc': 'Khi một hàng / cột đủ số, tự đánh dấu X các ô còn trống của dòng đó.',
      'settings.vibrate': 'Rung khi nhấn giữ',
      'settings.vibrateDesc': 'Rung nhẹ khi nhấn giữ để đánh dấu X (nếu máy hỗ trợ).',
      'settings.rules': 'Mỗi số là độ dài một đoạn ô tô liền nhau trên hàng / cột, theo đúng thứ tự, giữa các đoạn có ít nhất một ô trống. Chạm để tô, nhấn giữ để đánh dấu X, kéo để tô cả dòng.',
      'settings.version': 'Tranh Ẩn · phiên bản',

      'stats.title': 'Thống kê',
      'stats.daily': 'Tranh hằng ngày',
      'stats.streak': 'Chuỗi ngày',
      'stats.solved': 'Đã giải',
      'stats.best': 'Tốt nhất',
      'stats.bySize': 'Theo cỡ tranh',
      'stats.size': 'Cỡ',
      'stats.played': 'Chơi',
      'stats.avg': 'TB',
      'stats.avgNote': 'TB: thời gian trung bình của các tranh đã giải.',
      'stats.note': 'Bộ tranh: đã giải {k}/{n} tranh. TB: thời gian trung bình của các tranh đã giải (bộ tranh và ngẫu nhiên).',
      'stats.reset': 'Đặt lại',
      'stats.resetConfirm': 'Bấm lần nữa để xóa',
      'stats.resetDone': 'Đã đặt lại thống kê',

      'result.kicker': 'Bạn đã giải xong',
      'result.record': 'Kỷ lục mới!',
      'result.time': 'Thời gian',
      'result.best': 'Kỷ lục',
      'result.bestSize': 'Kỷ lục {size}',
      'result.hints': 'Gợi ý',
      'result.view': 'Xem tranh',
      'result.next': 'Tranh tiếp',
      'result.viewPack': 'Xem bộ tranh',
      'result.newRandom': 'Tranh mới',
      'result.choose': 'Chọn tranh',
      'result.random': 'Tranh ngẫu nhiên',
      'result.packText': 'Tranh #{n} · {pack}',
      'result.dailyText': 'Ngày {date} · {size}',
      'result.randomText': '{size} · mỗi tranh ngẫu nhiên đều có đúng một lời giải',
      'result.packNote': 'Đã giải {k}/{n} tranh của bộ',
      'result.dailyNote': 'Chuỗi {n} ngày · quay lại vào ngày mai nhé!',

      'toast.noHints': 'Đã dùng hết {n} gợi ý cho tranh này',
      'toast.hintFix': 'Ô hàng {r}, cột {c} tô sai — đã sửa lại',
      'toast.hintFill': 'Gợi ý: tô ô hàng {r}, cột {c}',
      'toast.hintCross': 'Gợi ý: đánh dấu X ô hàng {r}, cột {c}',
      'toast.modeFill': 'Chạm để tô · nhấn giữ để đánh dấu X',
      'toast.modeCross': 'Chạm để đánh dấu X · nhấn giữ để tô',
      'toast.flagged': 'Có {n} ô tô sai — đã đánh dấu X đỏ',
      'toast.zoom': 'Một ngón để tô · hai ngón (hoặc kéo vùng số) để di chuyển',

      'sum.none': 'Chưa giải tranh nào · tranh hôm nay {size}',
      'sum.playedOnly': '{n} tranh đã chơi · chưa giải xong tranh nào',
      'sum.wonBest': '{n} tranh đã giải · kỷ lục {label} {time}',
      'sum.won': '{n} tranh đã giải',
      'sum.statSolved': 'Tranh đã giải',
      'sum.statPacks': 'Bộ tranh',
      'sum.resumeDaily': 'Tranh Ẩn hằng ngày',
      'sum.resumeSize': 'Tranh Ẩn {size}',
      'sum.resumeDetail': 'Đã tô {pct}% · {time}',
      'sum.dailyTitle': 'Tranh hôm nay: {size}',

      'pic.tim': 'Trái tim',
      'pic.ngoi-sao': 'Ngôi sao',
      'pic.ngoi-nha': 'Ngôi nhà',
      'pic.mat-trang': 'Mặt trăng',
      'pic.not-nhac': 'Nốt nhạc',
      'pic.chiec-la': 'Chiếc lá',
      'pic.cai-coc': 'Cái cốc',
      'pic.cay-thong': 'Cây thông',
      'pic.non-la': 'Nón lá',
      'pic.qua-xoai': 'Quả xoài',
      'pic.den-long': 'Đèn lồng',
      'pic.banh-chung': 'Bánh chưng',
      'pic.ca-phe-phin': 'Cà phê phin',
      'pic.chiec-o': 'Chiếc ô',
      'pic.con-meo': 'Con mèo',
      'pic.con-thuyen': 'Con thuyền',
      'pic.qua-tao': 'Quả táo',
      'pic.chia-khoa': 'Chìa khoá',
      'pic.con-rua': 'Con rùa',
      'pic.con-oc': 'Con ốc',
      'pic.bong-hoa': 'Bông hoa',
      'pic.ngon-nui': 'Ngọn núi',
      'pic.may-bay': 'Máy bay',
      'pic.bat-pho': 'Bát phở',
      'pic.ao-dai': 'Áo dài',
      'pic.hoa-sen': 'Hoa sen',
      'pic.con-trau': 'Con trâu',
      'pic.cay-tre': 'Cây tre',
      'pic.chua-mot-cot': 'Chùa Một Cột',
      'pic.xe-dap': 'Xe đạp',
      'pic.o-to': 'Ô tô',
      'pic.ca-chep': 'Cá chép',
      'pic.cay-dua': 'Cây dừa',
    },
  };

  /* Ngôn ngữ hiện tại: thiếu / sai thì dùng tiếng Anh (không tự đoán theo trình duyệt) */
  function readLang() {
    try {
      var v = localStorage.getItem(LANG_KEY);
      return v === 'vi' || v === 'en' ? v : 'en';
    } catch (e) {
      return 'en';
    }
  }

  var lang = readLang();
  var locale = lang === 'vi' ? 'vi-VN' : 'en-US';
  document.documentElement.lang = lang;

  var plural = null;
  try {
    plural = new Intl.PluralRules(locale);
  } catch (e) { /* trình duyệt cũ: dùng so sánh n === 1 */ }

  function lookup(l, key) {
    var d = DICT[l];
    return d && Object.prototype.hasOwnProperty.call(d, key) ? d[key] : undefined;
  }

  /** Dịch khóa key, thay {tên} bằng params; thiếu thì lấy tiếng Anh, rồi tới chính khóa. */
  function t(key, params) {
    var s = lookup(lang, key);
    if (s === undefined) s = lookup('en', key);
    if (s === undefined) return key;
    var p = params || {};
    if (typeof s === 'object') {
      // Số nhiều đơn giản: { one, other } chọn theo p.n
      var form = 'other';
      if (typeof p.n === 'number') form = plural ? plural.select(p.n) : (p.n === 1 ? 'one' : 'other');
      s = s[form] !== undefined ? s[form] : s.other;
    }
    return String(s).replace(/\{(\w+)\}/g, function (m, name) {
      return Object.prototype.hasOwnProperty.call(p, name) ? String(p[name]) : m;
    });
  }

  /** Điền chữ vào [data-i18n], [data-i18n-html], [data-i18n-attr] trong root. */
  function apply(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    root.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var i = pair.indexOf(':');
        if (i < 0) return;
        var attr = pair.slice(0, i).trim();
        var key = pair.slice(i + 1).trim();
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });
    if (root === document) {
      document.title = t('meta.title');
      var desc = document.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute('content', t('meta.desc'));
      var apple = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (apple) apple.setAttribute('content', t('meta.title'));
    }
  }

  /** Lưu ván (nếu game đã đăng ký I18N.onSave) trước khi tải lại trang. */
  function saveGame() {
    if (typeof api.onSave === 'function') {
      try {
        api.onSave();
      } catch (e) { /* bỏ qua */ }
    }
  }

  /** Đổi ngôn ngữ: lưu ván, ghi khóa dùng chung rồi tải lại trang. */
  function set(next) {
    if (next !== 'en' && next !== 'vi') return;
    saveGame();
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch (e) { /* bỏ qua */ }
    location.reload();
  }

  function fmtNumber(n) {
    try {
      return Number(n).toLocaleString(locale);
    } catch (e) {
      return String(n);
    }
  }

  function fmtDate(d, opts) {
    try {
      return d.toLocaleDateString(locale, opts);
    } catch (e) {
      return d.toDateString();
    }
  }

  // Trang khác (cổng hoặc tab khác) đổi ngôn ngữ thì trang này đi theo
  window.addEventListener('storage', function (e) {
    if (e.key !== LANG_KEY) return;
    if (readLang() === lang) return;
    saveGame();
    location.reload();
  });

  var api = {
    lang: lang,
    locale: locale,
    t: t,
    apply: apply,
    set: set,
    fmtNumber: fmtNumber,
    fmtDate: fmtDate,
    onSave: null,
  };
  window.I18N = api;
})();
