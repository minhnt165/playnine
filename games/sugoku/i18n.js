/* =====================================================================
 * Sudoku - Đa ngôn ngữ (English mặc định + Tiếng Việt)
 *   - Ngôn ngữ lưu ở localStorage['playnine-lang'] (dùng chung với cổng PlayNine)
 *   - I18N.t(key, params): tra từ điển, thiếu thì lấy bản English, rồi tới chính key
 *   - I18N.apply(root): điền chữ cho [data-i18n], [data-i18n-html], [data-i18n-attr]
 *   - I18N.set(lang): lưu ngôn ngữ rồi tải lại trang (game tự lưu ván trước khi gọi)
 * Nạp trước engine.js / app.js.
 * ===================================================================== */
(function () {
  'use strict';
  var LANG_KEY = 'playnine-lang';

  var DICT = {
    en: {
      'meta.title': 'Sudoku',
      'meta.description': 'Sudoku: 5 difficulty levels graded by technique, a daily puzzle, explained hints, notes, statistics and autosave.',

      'game.new': 'New game',
      'game.cancel': 'Cancel',
      'game.close': 'Close',
      'game.done': 'Done',
      'game.retry': 'Retry',
      'game.pause': 'Pause',
      'game.resume': 'Resume',
      'game.paused': 'Paused',
      'game.tapResume': 'Tap to resume',
      'game.generating': 'Generating puzzle…',
      'game.board': 'Sudoku board',
      'game.numpad': 'Number pad',
      'game.shortcuts': 'Shortcuts: <kbd>1</kbd>–<kbd>9</kbd> enter number · <kbd>⌫</kbd> erase · <kbd>N</kbd> notes · <kbd>Z</kbd> undo · <kbd>H</kbd> hint · <kbd>P</kbd> pause',
      'game.boardFullWrong': 'The board is full but some numbers are wrong. Check again.',

      'status.difficulty': 'Difficulty',
      'status.mistakes': 'Mistakes',
      'status.progress': 'Progress',
      'status.time': 'Time',
      'status.daily': 'Daily',
      'status.dailyName': 'Daily · {label}',

      'tool.undo': 'Undo',
      'tool.erase': 'Erase',
      'tool.notes': 'Notes',
      'tool.hint': 'Hint',
      'tool.on': 'On',
      'tool.off': 'Off',
      'tool.hintsLeft': { one: '{n} hint left', other: '{n} hints left' },
      'tool.noHints': 'No hints left',

      'cell.aria': 'Row {r}, column {c}',
      'cell.name': 'row {r}, column {c}',
      'cell.short': 'R{r}C{c}',
      'num.aria': 'Number {d}',

      'diff.easy': 'Easy',
      'diff.medium': 'Medium',
      'diff.hard': 'Hard',
      'diff.expert': 'Expert',
      'diff.extreme': 'Extreme',
      'diff.easy.desc': 'Many givens, just count the missing numbers',
      'diff.medium.desc': 'Find the only place for each number',
      'diff.hard.desc': 'Needs pointing pairs and naked pairs; notes help',
      'diff.expert.desc': 'Needs hidden pairs, triples, X-Wing, XY-Wing',
      'diff.extreme.desc': 'Beyond the basic techniques, the ultimate challenge',

      'picker.title': 'Choose a game',
      'picker.warning': 'Your current game will be lost.',
      'picker.note': 'Difficulty is graded by the solving techniques required. Win enough games at the current level to unlock the next one.',
      'picker.today': 'Today',
      'picker.daily': 'Daily puzzle',
      'picker.streak': ' · {n}-day streak',
      'picker.dailyAria': 'Daily puzzle {date}, difficulty {label}',
      'picker.locked': 'Locked',
      'picker.lockedAria': '{label} (locked)',
      'picker.unlockDesc': { one: 'Win {n} {label} game to unlock ({have}/{n})', other: 'Win {n} {label} games to unlock ({have}/{n})' },

      'hint.title': 'Hint',
      'hint.close': 'Close hint',
      'hint.legendTarget': 'Target cell',
      'hint.legendReason': 'Related cells',
      'hint.legendElim': 'Eliminated cells',
      'hint.legendUnit': 'Scope',
      'hint.self': 'Do it myself',
      'hint.apply': 'Place',
      'hint.and': ' and ',
      'hint.unitRow': 'row {n}',
      'hint.unitCol': 'column {n}',
      'hint.unitBox': 'the 3x3 box (rows {r1}–{r2}, columns {c1}–{c2})',
      'hint.rows': 'rows',
      'hint.cols': 'columns',
      'hint.nakedSingle': 'The cell at {cell} can only be {v}. The other eight digits ({others}) already appear in the row, column or 3x3 box containing this cell (the yellow cells).',
      'hint.hiddenSingle': 'In {unit}, {v} can only go in the cell at {cell}. Every other empty cell of {unit} shares a row, column or 3x3 box with an existing {v} (the yellow cells) or had {v} eliminated in an earlier step.',
      'hint.pointing': 'In {box}, {d} can only be in the yellow cells, and they all lie in {line}. Since {box} must hold {d} in one of those cells, the rest of {line} cannot be {d}: remove {d} from {targets}.',
      'hint.claiming': 'In {line}, {d} can only be in the yellow cells, and they all lie in {box}. So the other cells of {box} cannot be {d}: remove {d} from {targets}.',
      'hint.nakedPair': 'The two cells {cells} in {unit} can only be {digits}. These two digits must take those two cells, so the other cells in {unit} cannot be {digits}: remove them from {targets}.',
      'hint.hiddenPair': 'In {unit}, the digits {digits} can only be in the two cells {cells}. So these two cells cannot hold any other digit: remove {removed} from {targets}.',
      'hint.nakedTriple': 'The three cells {cells} in {unit} only contain the digits {digits}. These three digits must take those three cells, so the other cells in {unit} cannot be any of them: remove them from {targets}.',
      'hint.hiddenTriple': 'In {unit}, the digits {digits} can only be in the three cells {cells}. So these three cells cannot hold any other digit: remove {removed} from {targets}.',
      'hint.xWing': 'In {l1} and {l2}, {d} can only be in {c1} or {c2} (4 yellow cells). Either way, {d} takes one cell in each of those {cross}, so the other cells of {c1} and {c2} cannot be {d}: remove {d} from {targets}.',
      'hint.xyWing': 'The pivot cell {pivot} can only be {x} or {y}. The two wing cells {wings} both see the pivot, each holding one of those digits plus {d}. Whether the pivot is {x} or {y}, one of the wings must be {d}, so a cell that sees both wings cannot be {d}: remove {d} from {targets}.',
      'hint.swordfish': 'In {lines}, {d} can only be in {cross} (the yellow cells). These three {lineType} take every {d} of those three {crossType}, so their other cells cannot be {d}: remove {d} from {targets}.',
      'hint.placeHidden': '{v} has only one place left in {unit}: the cell at {cell}.',
      'hint.placeNaked': 'the cell at {cell} can only be {v}.',
      'hint.bridgeMore': { one: 'After {n} more similar elimination, ', other: 'After {n} more similar eliminations, ' },
      'hint.bridgeOne': 'After this step, ',
      'hint.wrongTitle': 'Wrong number',
      'hint.wrongText': 'The {wrong} at {cell} is wrong; the answer for this cell is {ans}. Fix the wrong cell before reasoning further.',
      'hint.advancedTitle': 'Advanced technique needed',
      'hint.advancedText': 'No cell can be deduced right now with the common techniques (singles, pairs, triples, X-Wing, XY-Wing, Swordfish). The answer for the cell at {cell} is {ans}.',

      'tech.naked-single': 'Naked single',
      'tech.hidden-single': 'Hidden single',
      'tech.pointing': 'Pointing pair',
      'tech.claiming': 'Box/line reduction',
      'tech.naked-pair': 'Naked pair',
      'tech.hidden-pair': 'Hidden pair',
      'tech.naked-triple': 'Naked triple',
      'tech.hidden-triple': 'Hidden triple',
      'tech.x-wing': 'X-Wing',
      'tech.xy-wing': 'XY-Wing',
      'tech.swordfish': 'Swordfish',

      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'settings.themeAuto': 'Auto',
      'settings.themeLight': 'Light',
      'settings.themeDark': 'Dark',
      'settings.language': 'Language',
      'settings.inputMode': 'Input method',
      'settings.inputModeDesc': 'Number first: tap a number on the pad, then tap the cells to fill.',
      'settings.cellFirst': 'Cell first',
      'settings.numberFirst': 'Number first',
      'settings.checkErrors': 'Instant error check',
      'settings.checkErrorsDesc': 'Mark wrong numbers in red as you enter them and count mistakes. Turn off to check yourself.',
      'settings.mistakeLimit': '3-mistake limit',
      'settings.mistakeLimitDesc': 'You lose after 3 mistakes. Requires "Instant error check".',
      'settings.sound': 'Sound',
      'settings.soundDesc': 'Sound effects when placing numbers, completing a row, column or box, and winning.',
      'settings.version': 'version',

      'stats.title': 'Statistics',
      'stats.daily': 'Daily puzzle',
      'stats.streak': 'Day streak',
      'stats.completed': 'Completed',
      'stats.best': 'Best',
      'stats.byDifficulty': 'By difficulty',
      'stats.level': 'Level',
      'stats.won': 'Won',
      'stats.lost': 'Lost',
      'stats.avg': 'Avg',
      'stats.reset': 'Reset',
      'stats.resetConfirm': 'Delete all statistics and unlock progress?',
      'stats.resetDone': 'Statistics reset.',

      'win.title': 'Excellent!',
      'win.text': 'You completed the Sudoku.',
      'win.daily': '📅 Daily puzzle complete · {n}-day streak',
      'win.record': '🏆 New best time!',
      'win.unlocked': '🔓 Unlocked {label}!',
      'lose.title': 'Out of chances!',
      'lose.text': 'You made 3 mistakes. Retry this puzzle or start a new game.',
    },
    vi: {
      'meta.title': 'Sudoku',
      'meta.description': 'Sudoku tiếng Việt: 5 độ khó chấm theo kỹ thuật, ván hằng ngày, gợi ý có giải thích, ghi chú, thống kê, tự lưu ván chơi.',

      'game.new': 'Ván mới',
      'game.cancel': 'Hủy',
      'game.close': 'Đóng',
      'game.done': 'Xong',
      'game.retry': 'Chơi lại',
      'game.pause': 'Tạm dừng',
      'game.resume': 'Tiếp tục',
      'game.paused': 'Đã tạm dừng',
      'game.tapResume': 'Nhấn để tiếp tục',
      'game.generating': 'Đang tạo đề…',
      'game.board': 'Bàn cờ Sudoku',
      'game.numpad': 'Bàn phím số',
      'game.shortcuts': 'Phím tắt: <kbd>1</kbd>–<kbd>9</kbd> điền số · <kbd>⌫</kbd> xóa · <kbd>N</kbd> ghi chú · <kbd>Z</kbd> hoàn tác · <kbd>H</kbd> gợi ý · <kbd>P</kbd> tạm dừng',
      'game.boardFullWrong': 'Bàn cờ đã đầy nhưng vẫn còn số sai. Hãy kiểm tra lại.',

      'status.difficulty': 'Độ khó',
      'status.mistakes': 'Lỗi',
      'status.progress': 'Tiến độ',
      'status.time': 'Thời gian',
      'status.daily': 'Hằng ngày',
      'status.dailyName': 'Hằng ngày · {label}',

      'tool.undo': 'Hoàn tác',
      'tool.erase': 'Xóa',
      'tool.notes': 'Ghi chú',
      'tool.hint': 'Gợi ý',
      'tool.on': 'Bật',
      'tool.off': 'Tắt',
      'tool.hintsLeft': 'Còn {n} lượt gợi ý',
      'tool.noHints': 'Đã hết lượt gợi ý',

      'cell.aria': 'Hàng {r}, cột {c}',
      'cell.name': 'hàng {r}, cột {c}',
      'cell.short': 'H{r}C{c}',
      'num.aria': 'Số {d}',

      'diff.easy': 'Dễ',
      'diff.medium': 'Trung bình',
      'diff.hard': 'Khó',
      'diff.expert': 'Chuyên gia',
      'diff.extreme': 'Cực khó',
      'diff.easy.desc': 'Nhiều ô cho trước, chỉ cần đếm số còn thiếu',
      'diff.medium.desc': 'Tìm vị trí duy nhất của mỗi số',
      'diff.hard.desc': 'Cần cặp chỉ hướng, cặp trần; nên dùng ghi chú',
      'diff.expert.desc': 'Cần cặp ẩn, bộ ba, X-Wing, XY-Wing',
      'diff.extreme.desc': 'Vượt ngoài các kỹ thuật cơ bản, thử thách tối đa',

      'picker.title': 'Chọn ván chơi',
      'picker.warning': 'Ván hiện tại sẽ bị mất.',
      'picker.note': 'Độ khó được chấm theo kỹ thuật suy luận cần dùng. Thắng đủ số ván ở độ khó hiện tại để mở khóa độ khó tiếp theo.',
      'picker.today': 'Hôm nay',
      'picker.daily': 'Ván hằng ngày',
      'picker.streak': ' · chuỗi {n} ngày',
      'picker.dailyAria': 'Ván hằng ngày {date}, độ khó {label}',
      'picker.locked': 'Khóa',
      'picker.lockedAria': '{label} (đang khóa)',
      'picker.unlockDesc': 'Thắng {n} ván {label} để mở ({have}/{n})',

      'hint.title': 'Gợi ý',
      'hint.close': 'Đóng gợi ý',
      'hint.legendTarget': 'Ô cần điền',
      'hint.legendReason': 'Ô liên quan',
      'hint.legendElim': 'Ô bị loại số',
      'hint.legendUnit': 'Phạm vi xét',
      'hint.self': 'Tự điền',
      'hint.apply': 'Điền số',
      'hint.and': ' và ',
      'hint.unitRow': 'hàng {n}',
      'hint.unitCol': 'cột {n}',
      'hint.unitBox': 'vùng 3x3 (hàng {r1}–{r2}, cột {c1}–{c2})',
      'hint.rows': 'hàng',
      'hint.cols': 'cột',
      'hint.nakedSingle': 'Ô {cell} chỉ có thể là {v}. Tám số còn lại ({others}) đều đã xuất hiện trong hàng, cột hoặc vùng 3x3 chứa ô này (các ô vàng).',
      'hint.hiddenSingle': 'Trong {unit}, số {v} chỉ có thể đặt vào ô {cell}. Mọi ô trống khác của {unit} đều nằm cùng hàng, cột hoặc vùng 3x3 với một số {v} đã có (các ô vàng) hoặc đã bị loại {v} ở bước trước.',
      'hint.pointing': 'Trong {box}, số {d} chỉ có thể nằm ở các ô vàng, và chúng đều thuộc {line}. Vì {box} chắc chắn chứa {d} tại một trong các ô đó, phần còn lại của {line} không thể là {d}: loại {d} khỏi {targets}.',
      'hint.claiming': 'Trong {line}, số {d} chỉ có thể nằm ở các ô vàng, và chúng đều thuộc {box}. Vì vậy các ô khác của {box} không thể là {d}: loại {d} khỏi {targets}.',
      'hint.nakedPair': 'Hai ô {cells} trong {unit} chỉ có thể là {digits}. Hai số này chắc chắn chiếm hai ô đó, nên các ô khác trong {unit} không thể là {digits}: loại khỏi {targets}.',
      'hint.hiddenPair': 'Trong {unit}, hai số {digits} chỉ có thể nằm ở hai ô {cells}. Hai ô này vì thế không thể chứa số nào khác: loại {removed} khỏi {targets}.',
      'hint.nakedTriple': 'Ba ô {cells} trong {unit} chỉ chứa các số {digits}. Ba số này chắc chắn chiếm ba ô đó, nên các ô khác trong {unit} không thể là chúng: loại khỏi {targets}.',
      'hint.hiddenTriple': 'Trong {unit}, ba số {digits} chỉ có thể nằm ở ba ô {cells}. Ba ô này vì thế không thể chứa số nào khác: loại {removed} khỏi {targets}.',
      'hint.xWing': 'Số {d} ở {l1} và {l2} đều chỉ có thể nằm ở {c1} hoặc {c2} (4 ô vàng). Dù xếp cách nào, {d} cũng chiếm một ô ở mỗi {cross} đó, nên các ô khác của {c1} và {c2} không thể là {d}: loại {d} khỏi {targets}.',
      'hint.xyWing': 'Ô trụ {pivot} chỉ có thể là {x} hoặc {y}. Hai ô cánh {wings} cùng nhìn thấy ô trụ, mỗi ô lấy một trong hai số đó kèm số {d}. Dù ô trụ là {x} hay {y}, một trong hai ô cánh chắc chắn là {d}, nên ô nhìn thấy cả hai cánh không thể là {d}: loại {d} khỏi {targets}.',
      'hint.swordfish': 'Số {d} ở {lines} chỉ có thể nằm trong {cross} (các ô vàng). Ba {lineType} này sẽ chiếm trọn {d} của ba {crossType} đó, nên các ô khác của chúng không thể là {d}: loại {d} khỏi {targets}.',
      'hint.placeHidden': 'số {v} chỉ còn một vị trí trong {unit} là ô {cell}.',
      'hint.placeNaked': 'ô {cell} chỉ còn số {v}.',
      'hint.bridgeMore': 'Sau thêm {n} bước loại trừ tương tự, ',
      'hint.bridgeOne': 'Sau bước này, ',
      'hint.wrongTitle': 'Có số sai',
      'hint.wrongText': 'Số {wrong} ở ô {cell} không đúng, đáp án của ô này là {ans}. Hãy sửa ô sai trước khi suy luận tiếp.',
      'hint.advancedTitle': 'Cần kỹ thuật nâng cao',
      'hint.advancedText': 'Ở trạng thái hiện tại không có ô nào suy ra được bằng các kỹ thuật thông dụng (single, cặp, bộ ba, X-Wing, XY-Wing, Swordfish). Đáp án của ô {cell} là {ans}.',

      'tech.naked-single': 'Ô chỉ còn một số',
      'tech.hidden-single': 'Số chỉ có một vị trí',
      'tech.pointing': 'Cặp chỉ hướng',
      'tech.claiming': 'Rút gọn theo hàng/cột',
      'tech.naked-pair': 'Cặp trần',
      'tech.hidden-pair': 'Cặp ẩn',
      'tech.naked-triple': 'Bộ ba trần',
      'tech.hidden-triple': 'Bộ ba ẩn',
      'tech.x-wing': 'X-Wing',
      'tech.xy-wing': 'XY-Wing',
      'tech.swordfish': 'Swordfish',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'settings.themeAuto': 'Tự động',
      'settings.themeLight': 'Sáng',
      'settings.themeDark': 'Tối',
      'settings.language': 'Ngôn ngữ',
      'settings.inputMode': 'Cách nhập số',
      'settings.inputModeDesc': 'Chọn số trước: nhấn một số trên bàn phím rồi chạm vào các ô cần điền.',
      'settings.cellFirst': 'Chọn ô trước',
      'settings.numberFirst': 'Chọn số trước',
      'settings.checkErrors': 'Báo lỗi ngay',
      'settings.checkErrorsDesc': 'Tô đỏ số sai ngay khi nhập và đếm lỗi. Tắt để tự kiểm tra.',
      'settings.mistakeLimit': 'Giới hạn 3 lỗi',
      'settings.mistakeLimitDesc': 'Thua khi mắc 3 lỗi. Cần bật "Báo lỗi ngay".',
      'settings.sound': 'Âm thanh',
      'settings.soundDesc': 'Hiệu ứng âm thanh khi điền số, hoàn thành hàng, cột hoặc vùng, và khi thắng.',
      'settings.version': 'phiên bản',

      'stats.title': 'Thống kê',
      'stats.daily': 'Ván hằng ngày',
      'stats.streak': 'Chuỗi ngày',
      'stats.completed': 'Đã xong',
      'stats.best': 'Tốt nhất',
      'stats.byDifficulty': 'Theo độ khó',
      'stats.level': 'Mức',
      'stats.won': 'Thắng',
      'stats.lost': 'Thua',
      'stats.avg': 'TB',
      'stats.reset': 'Đặt lại',
      'stats.resetConfirm': 'Xóa toàn bộ thống kê và tiến trình mở khóa?',
      'stats.resetDone': 'Đã đặt lại thống kê.',

      'win.title': 'Xuất sắc!',
      'win.text': 'Bạn đã hoàn thành ván Sudoku.',
      'win.daily': '📅 Hoàn thành ván hằng ngày · chuỗi {n} ngày',
      'win.record': '🏆 Kỷ lục thời gian mới!',
      'win.unlocked': '🔓 Đã mở khóa độ khó {label}!',
      'lose.title': 'Hết lượt!',
      'lose.text': 'Bạn đã mắc 3 lỗi. Chơi lại ván này hoặc bắt đầu ván mới.',
    },
  };

  var lang = 'en';
  try {
    var saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'vi') lang = saved;
  } catch (e) {
    /* localStorage không khả dụng: dùng English */
  }
  var locale = lang === 'vi' ? 'vi-VN' : 'en-US';
  document.documentElement.lang = lang;

  function t(key, params) {
    var s = DICT[lang][key];
    if (s === undefined) s = DICT.en[key];
    if (s === undefined) return key;
    // Số nhiều kiểu English: { one, other } theo params.n
    if (typeof s === 'object') s = params && params.n === 1 && s.one !== undefined ? s.one : s.other;
    if (!params) return s;
    return s.replace(/\{(\w+)\}/g, function (m, name) {
      return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m;
    });
  }

  function apply(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    // Chỉ dùng cho chuỗi trong từ điển có thẻ đánh dấu (<kbd>, <b>)
    root.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    root.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var i = pair.indexOf(':');
        if (i > 0) el.setAttribute(pair.slice(0, i).trim(), t(pair.slice(i + 1).trim()));
      });
    });
    if (root === document) {
      document.title = t('meta.title');
      var meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', t('meta.description'));
    }
  }

  function set(next) {
    if (next !== 'en' && next !== 'vi') return;
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch (e) {
      /* ignore */
    }
    if (next !== lang) location.reload();
  }

  function fmtNumber(n, opts) {
    return Number(n).toLocaleString(locale, opts);
  }

  function fmtDate(d, opts) {
    return new Date(d).toLocaleDateString(locale, opts);
  }

  // Ngôn ngữ đổi ở trang khác (cổng hoặc tab khác): tải lại theo ngôn ngữ mới
  window.addEventListener('storage', function (e) {
    if (e.key === LANG_KEY && (e.newValue === 'vi' ? 'vi' : 'en') !== lang) location.reload();
  });

  window.I18N = { lang: lang, locale: locale, t: t, apply: apply, set: set, fmtNumber: fmtNumber, fmtDate: fmtDate };
})();
