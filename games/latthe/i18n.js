/* =====================================================================
 * Lật Thẻ - Đa ngôn ngữ: tiếng Anh (mặc định) + tiếng Việt
 *   - Ngôn ngữ lưu ở khóa dùng chung với cổng PlayNine: localStorage['playnine-lang'] = 'en' | 'vi'
 *   - I18N.t(key, params): tra chuỗi, thiếu thì lấy tiếng Anh, thiếu nữa thì trả về chính khóa
 *   - I18N.apply(root): điền [data-i18n], [data-i18n-html], [data-i18n-attr]
 *   - I18N.set(lang): lưu ngôn ngữ rồi tải lại trang (lưu ván trước qua I18N.onBeforeReload)
 *   - Nạp trước engine.js và app.js
 * ===================================================================== */
(function () {
  'use strict';

  const LANG_KEY = 'playnine-lang';
  const LANGS = ['en', 'vi'];
  const LOCALES = { en: 'en-US', vi: 'vi-VN' };

  // Chuỗi số nhiều (tiếng Anh): { one, other }, chọn theo params.n
  const DICT = {
    en: {
      'meta.title': 'Memory Match',
      'meta.appTitle': 'Memory Match',
      'meta.description': 'Memory Match: flip two cards at a time and find every pair. Three board sizes, a timer, move counter and best times.',
      'app.name': 'Memory Match',

      'top.stats': 'Statistics',
      'top.settings': 'Settings',
      'top.newGame': 'New board',
      'top.newGameTitle': 'New board (N)',

      'mode.label': 'Difficulty',
      'mode.easy': 'Easy',
      'mode.medium': 'Medium',
      'mode.hard': 'Hard',
      'mode.pairs': { one: '{n} pair', other: '{n} pairs' },

      'hud.time': 'Time',
      'hud.moves': 'Moves',
      'hud.best': 'Best',

      'board.label': 'Card table. Flip two cards to find a matching pair.',
      'card.down': 'Card {n}, face down',
      'card.up': 'Card {n}: {name}',
      'card.matched': 'Card {n}: {name}, matched',
      'face.names': 'red lantern|conical hat|lotus|noodle soup|square rice cake|drip coffee|sailboat|bronze drum|mango|dragon fruit|water buffalo|bamboo|kite|star lantern|baguette|coconut|teapot|paper fan',
      'say.match': 'Pair found: {name}. {left} left.',
      'say.mismatch': 'No match: {a} and {b}.',

      'help.touch': 'Tap a card to flip it, then find its twin. Matching pairs stay open.',
      'help.keys': 'Arrow keys move · <kbd>Enter</kbd> flip · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> difficulty · <kbd>N</kbd> new board',

      'win.title': 'All pairs found!',
      'win.time': 'Time',
      'win.moves': 'Moves',
      'win.best': 'Best',
      'win.newBest': 'New best time!',
      'win.perfect': 'Perfect memory: no wrong guesses!',
      'win.again': 'Play again',
      'win.harder': 'Try {mode}',

      'confirm.newTitle': 'Start a new board?',
      'confirm.modeTitle': 'Switch to {mode}?',
      'confirm.text': 'The board you are playing will end unfinished.',
      'confirm.cancel': 'Keep playing',
      'confirm.ok': 'New board',

      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'settings.themeAuto': 'Auto',
      'settings.themeLight': 'Light',
      'settings.themeDark': 'Dark',
      'settings.language': 'Language',
      'settings.sound': 'Sound',
      'settings.soundDesc': 'Sound effects for flips, pairs and wins.',
      'settings.vibrate': 'Vibrate',
      'settings.vibrateDesc': 'Vibrate briefly when you find a pair (if supported).',
      'settings.hint': 'Flip two cards per move. A matching pair stays open; otherwise both turn back over. The timer starts on your first flip. Find every pair as fast as you can: each difficulty keeps its own best time.',
      'settings.done': 'Done',
      'settings.version': 'version',

      'stats.title': 'Statistics',
      'stats.played': 'Played',
      'stats.won': 'Cleared',
      'stats.rate': 'Clear rate',
      'stats.byMode': 'Best by difficulty',
      'stats.bestLine': '{time} · {moves}',
      'stats.movesShort': { one: '{n} move', other: '{n} moves' },
      'stats.none': 'No clear yet',
      'stats.reset': 'Reset',
      'stats.resetConfirm': 'Tap to confirm',
      'stats.close': 'Close',

      'toast.statsReset': 'Statistics reset',

      'summary.noGames': 'Find all 6 pairs on the Easy board',
      'summary.noWins': { one: '{n} board played', other: '{n} boards played' },
      'summary.wins': { one: '{n} board cleared', other: '{n} boards cleared' },
      'summary.winsBest': 'Best {mode}: {time}',
      'summary.statWins': 'Cleared',
      'summary.statBest': 'Best {mode}',
      'summary.resume': 'Memory Match · {mode}',
      'summary.resumeDetail': '{done}/{total} pairs · {time}',
    },
    vi: {
      'meta.title': 'Lật Thẻ',
      'meta.appTitle': 'Lật Thẻ',
      'meta.description': 'Lật Thẻ: mỗi lượt lật hai thẻ, tìm hết các cặp giống nhau. Ba cỡ bàn, đồng hồ, đếm lượt và kỷ lục thời gian.',
      'app.name': 'Lật Thẻ',

      'top.stats': 'Thống kê',
      'top.settings': 'Cài đặt',
      'top.newGame': 'Ván mới',
      'top.newGameTitle': 'Ván mới (N)',

      'mode.label': 'Độ khó',
      'mode.easy': 'Dễ',
      'mode.medium': 'Vừa',
      'mode.hard': 'Khó',
      'mode.pairs': '{n} cặp',

      'hud.time': 'Thời gian',
      'hud.moves': 'Lượt',
      'hud.best': 'Kỷ lục',

      'board.label': 'Bàn thẻ. Lật hai thẻ để tìm cặp giống nhau.',
      'card.down': 'Thẻ {n}, đang úp',
      'card.up': 'Thẻ {n}: {name}',
      'card.matched': 'Thẻ {n}: {name}, đã ghép',
      'face.names': 'đèn lồng|nón lá|hoa sen|bát phở|bánh chưng|cà phê phin|thuyền buồm|trống đồng|xoài|thanh long|con trâu|cây tre|cánh diều|đèn ông sao|bánh mì|trái dừa|ấm trà|quạt giấy',
      'say.match': 'Đúng cặp: {name}. Còn {left} cặp.',
      'say.mismatch': 'Không khớp: {a} và {b}.',

      'help.touch': 'Chạm thẻ để lật, rồi tìm thẻ giống nó. Cặp đúng sẽ mở luôn.',
      'help.keys': 'Phím mũi tên để di chuyển · <kbd>Enter</kbd> lật thẻ · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> độ khó · <kbd>N</kbd> ván mới',

      'win.title': 'Đã tìm hết các cặp!',
      'win.time': 'Thời gian',
      'win.moves': 'Lượt',
      'win.best': 'Kỷ lục',
      'win.newBest': 'Kỷ lục thời gian mới!',
      'win.perfect': 'Trí nhớ hoàn hảo: không lật sai lần nào!',
      'win.again': 'Chơi lại',
      'win.harder': 'Thử mức {mode}',

      'confirm.newTitle': 'Chơi ván mới?',
      'confirm.modeTitle': 'Đổi sang mức {mode}?',
      'confirm.text': 'Ván đang chơi sẽ kết thúc dở dang.',
      'confirm.cancel': 'Chơi tiếp',
      'confirm.ok': 'Ván mới',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'settings.themeAuto': 'Tự động',
      'settings.themeLight': 'Sáng',
      'settings.themeDark': 'Tối',
      'settings.language': 'Ngôn ngữ',
      'settings.sound': 'Âm thanh',
      'settings.soundDesc': 'Hiệu ứng âm thanh khi lật thẻ, ghép cặp và thắng.',
      'settings.vibrate': 'Rung',
      'settings.vibrateDesc': 'Rung nhẹ khi ghép đúng cặp (nếu máy hỗ trợ).',
      'settings.hint': 'Mỗi lượt lật hai thẻ. Hai thẻ giống nhau thì mở luôn, khác nhau thì úp lại. Đồng hồ chạy từ lần lật đầu tiên. Tìm hết các cặp càng nhanh càng tốt; mỗi độ khó có kỷ lục riêng.',
      'settings.done': 'Xong',
      'settings.version': 'phiên bản',

      'stats.title': 'Thống kê',
      'stats.played': 'Đã chơi',
      'stats.won': 'Hoàn thành',
      'stats.rate': 'Tỉ lệ',
      'stats.byMode': 'Kỷ lục theo độ khó',
      'stats.bestLine': '{time} · {moves}',
      'stats.movesShort': '{n} lượt',
      'stats.none': 'Chưa hoàn thành',
      'stats.reset': 'Đặt lại',
      'stats.resetConfirm': 'Bấm lần nữa để xóa',
      'stats.close': 'Đóng',

      'toast.statsReset': 'Đã đặt lại thống kê',

      'summary.noGames': 'Tìm 6 cặp thẻ ở bàn Dễ',
      'summary.noWins': 'Đã chơi {n} ván',
      'summary.wins': 'Đã hoàn thành {n} ván',
      'summary.winsBest': 'Kỷ lục {mode}: {time}',
      'summary.statWins': 'Hoàn thành',
      'summary.statBest': 'Kỷ lục {mode}',
      'summary.resume': 'Lật Thẻ · {mode}',
      'summary.resumeDetail': '{done}/{total} cặp · {time}',
    },
  };

  function readLang() {
    try {
      const v = localStorage.getItem(LANG_KEY);
      return LANGS.includes(v) ? v : 'en';
    } catch (e) {
      return 'en';
    }
  }
  const lang = readLang();
  document.documentElement.lang = lang;

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  /** Tra chuỗi theo khóa; {tên} được thay bằng params.tên. */
  function t(key, params) {
    let s = has(DICT[lang], key) ? DICT[lang][key] : has(DICT.en, key) ? DICT.en[key] : key;
    if (s && typeof s === 'object') s = params && params.n === 1 && s.one != null ? s.one : s.other;
    s = String(s);
    if (!params) return s;
    return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
  }

  /** Điền chữ tĩnh trong HTML theo ngôn ngữ hiện tại. */
  function apply(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    // Chỉ dùng cho chuỗi trong từ điển (tin cậy) có thẻ như <kbd>
    root.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      el.getAttribute('data-i18n-attr').split(';').forEach((pair) => {
        const i = pair.indexOf(':');
        if (i > 0) el.setAttribute(pair.slice(0, i).trim(), t(pair.slice(i + 1).trim()));
      });
    });
    if (root === document) {
      document.title = t('meta.title');
      const desc = document.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute('content', t('meta.description'));
      const appTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (appTitle) appTitle.setAttribute('content', t('meta.appTitle'));
    }
  }

  let beforeReload = null;
  function reload() {
    try {
      if (beforeReload) beforeReload();
    } catch (e) {}
    location.reload();
  }

  /** Đổi ngôn ngữ: lưu khóa dùng chung rồi tải lại trang. */
  function set(next) {
    if (!LANGS.includes(next) || next === lang) return;
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch (e) {}
    reload();
  }

  // Cổng hoặc tab khác đổi ngôn ngữ thì trang này đi theo
  window.addEventListener('storage', (e) => {
    if (e.key === LANG_KEY && readLang() !== lang) reload();
  });

  window.I18N = {
    lang,
    t,
    apply,
    set,
    /** Hàm lưu ván, gọi trước khi tải lại trang vì đổi ngôn ngữ. */
    onBeforeReload: (fn) => {
      beforeReload = fn;
    },
    fmtNumber: (n) => Number(n || 0).toLocaleString(LOCALES[lang]),
  };
})();
