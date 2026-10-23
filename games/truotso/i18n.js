/* =====================================================================
 * Trượt Số - Đa ngôn ngữ: tiếng Anh (mặc định) + tiếng Việt
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
      'meta.title': 'Sliding Puzzle',
      'meta.appTitle': 'Sliding Puzzle',
      'meta.description': 'Sliding Puzzle: slide the numbered tiles back into order as fast as you can. 3x3, 4x4 and 5x5 boards, best times, autosave.',
      'brand.name': 'Sliding Puzzle',

      'top.stats': 'Statistics',
      'top.settings': 'Settings',
      'top.newGame': 'New game',
      'top.newGameTitle': 'New game (N)',
      'hud.time': 'Time',
      'hud.moves': 'Moves',
      'hud.best': 'Best',

      'board.role': 'sliding puzzle board',
      'board.label': 'Sliding puzzle board. Use the arrow keys or W A S D to slide a tile into the empty space.',
      'help.touch': 'Tap a tile in the same row or column as the gap, or swipe, to slide it. Put the numbers back in order.',
      'help.keys': 'Click a tile or use <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> / <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to slide · <kbd>N</kbd> new game',
      'help.start': 'The clock starts on your first move',

      'win.title': 'Solved!',
      'win.time': 'Time',
      'win.sub': { one: '1 move · {mode}', other: '{n} moves · {mode}' },
      'win.again': 'Play again',
      'win.size': 'Change size',
      'game.newBest': 'New best time!',

      'announce.solved': 'Solved in {time} with {n} moves',
      'toast.statsReset': 'Statistics reset',

      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'settings.themeAuto': 'Auto',
      'settings.themeLight': 'Light',
      'settings.themeDark': 'Dark',
      'settings.size': 'Board size',
      'settings.sizeDesc': 'Changing the size starts a new game. Each size has its own best time and leaderboard.',
      'settings.sound': 'Sound',
      'settings.soundOn': 'On',
      'settings.soundOff': 'Off',
      'settings.language': 'Language',
      'settings.done': 'Done',
      'settings.version': 'version',

      'stats.title': 'Statistics',
      'stats.played': 'Games played',
      'stats.solved': 'Solved',
      'stats.bySize': 'Best by size',
      'stats.grid': '{n}x{n} board',
      'stats.current': 'current',
      'stats.bestLine': { one: '{time} · 1 move', other: '{time} · {n} moves' },
      'stats.reset': 'Reset',
      'stats.resetConfirm': 'Tap to confirm',
      'stats.close': 'Close',

      'confirm.newTitle': 'Start a new game?',
      'confirm.sizeTitle': 'Switch to the {n}x{n} board?',
      'confirm.lost': 'The current game will be lost.',
      'confirm.text': { one: 'The current game (1 move, {time}) will be lost.', other: 'The current game ({n} moves, {time}) will be lost.' },
      'confirm.cancel': 'Cancel',

      'summary.note': 'Slide the tiles back into order against the clock',
      'summary.noteBest': 'Best {mode} time {time}',
      'summary.bestTime': 'Best {mode}',
      'summary.resume': 'Continue Sliding Puzzle',
      'summary.resumeDetail': { one: '{mode} · 1 move · {time}', other: '{mode} · {n} moves · {time}' },
    },
    vi: {
      'meta.title': 'Trượt Số',
      'meta.appTitle': 'Trượt Số',
      'meta.description': 'Trượt Số: trượt các ô số về đúng thứ tự nhanh nhất có thể. Bàn 3x3, 4x4, 5x5, kỷ lục thời gian, tự lưu ván chơi.',
      'brand.name': 'Trượt Số',

      'top.stats': 'Thống kê',
      'top.settings': 'Cài đặt',
      'top.newGame': 'Ván mới',
      'top.newGameTitle': 'Ván mới (N)',
      'hud.time': 'Thời gian',
      'hud.moves': 'Nước đi',
      'hud.best': 'Kỷ lục',

      'board.role': 'bàn trượt số',
      'board.label': 'Bàn trượt số. Dùng phím mũi tên hoặc W A S D để trượt một ô vào chỗ trống.',
      'help.touch': 'Chạm ô cùng hàng hoặc cùng cột với chỗ trống, hoặc vuốt, để trượt ô. Xếp các số về đúng thứ tự.',
      'help.keys': 'Bấm vào ô hoặc dùng <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> / <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> để trượt · <kbd>N</kbd> ván mới',
      'help.start': 'Đồng hồ chạy từ nước đi đầu tiên',

      'win.title': 'Hoàn thành!',
      'win.time': 'Thời gian',
      'win.sub': '{n} nước · {mode}',
      'win.again': 'Chơi lại',
      'win.size': 'Đổi kích thước',
      'game.newBest': 'Kỷ lục mới!',

      'announce.solved': 'Hoàn thành trong {time} với {n} nước',
      'toast.statsReset': 'Đã đặt lại thống kê',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'settings.themeAuto': 'Tự động',
      'settings.themeLight': 'Sáng',
      'settings.themeDark': 'Tối',
      'settings.size': 'Kích thước bàn',
      'settings.sizeDesc': 'Đổi kích thước sẽ bắt đầu ván mới. Mỗi kích thước có kỷ lục và bảng xếp hạng riêng.',
      'settings.sound': 'Âm thanh',
      'settings.soundOn': 'Bật',
      'settings.soundOff': 'Tắt',
      'settings.language': 'Ngôn ngữ',
      'settings.done': 'Xong',
      'settings.version': 'phiên bản',

      'stats.title': 'Thống kê',
      'stats.played': 'Ván đã chơi',
      'stats.solved': 'Đã giải',
      'stats.bySize': 'Kỷ lục theo kích thước',
      'stats.grid': 'Bàn {n}x{n}',
      'stats.current': 'đang chơi',
      'stats.bestLine': '{time} · {n} nước',
      'stats.reset': 'Đặt lại',
      'stats.resetConfirm': 'Bấm lần nữa để xóa',
      'stats.close': 'Đóng',

      'confirm.newTitle': 'Bắt đầu ván mới?',
      'confirm.sizeTitle': 'Đổi sang bàn {n}x{n}?',
      'confirm.lost': 'Ván đang chơi sẽ bị bỏ.',
      'confirm.text': 'Ván đang chơi ({n} nước, {time}) sẽ bị bỏ.',
      'confirm.cancel': 'Hủy',

      'summary.note': 'Trượt các ô số về đúng thứ tự, đua với đồng hồ',
      'summary.noteBest': 'Kỷ lục {mode}: {time}',
      'summary.bestTime': 'Kỷ lục {mode}',
      'summary.resume': 'Tiếp tục Trượt Số',
      'summary.resumeDetail': '{mode} · {n} nước · {time}',
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
    /** Dấu thập phân theo ngôn ngữ ('.' hoặc ','). */
    decimal: lang === 'vi' ? ',' : '.',
  };
})();
