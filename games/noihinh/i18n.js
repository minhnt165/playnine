/* =====================================================================
 * Nối Hình - Đa ngôn ngữ: tiếng Anh (mặc định) + tiếng Việt
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
      'meta.title': 'Tile Match',
      'meta.appTitle': 'Tile Match',
      'meta.description': 'Tile Match: tap uncovered tiles to drop them into the tray, three of a kind clear. Layered levels, side piles, undo, shuffle and more.',
      'app.name': 'Tile Match',

      'top.stats': 'Statistics',
      'top.settings': 'Settings',
      'level.title': 'Level {n}',
      'level.clear': 'Level {n} complete',
      'board.label': 'Tile board. Tap an uncovered tile to drop it into the tray.',
      'tray.label': 'Tray',
      'tray.add': 'Add a tray slot',
      'tile.free': 'Tile {name}',

      'tool.out': 'Take out',
      'tool.outTitle': 'Move the first 3 tray tiles out of the tray (O)',
      'tool.undo': 'Undo',
      'tool.undoTitle': 'Put the last tile back (Z)',
      'tool.shuffle': 'Shuffle',
      'tool.shuffleTitle': 'Shuffle the tiles on the board (S)',
      'hint.keys': 'Shortcuts: <kbd>Z</kbd> undo · <kbd>O</kbd> take out · <kbd>S</kbd> shuffle · <kbd>+</kbd> add a slot · <kbd>R</kbd> restart level',

      'toast.none': 'No uses left on this level',
      'toast.outNeedsTiles': 'The tray is empty',
      'toast.outBusy': 'Clear the waiting tiles first',
      'toast.undoNone': 'Nothing to undo',
      'toast.slotMax': 'The tray is already at full size',
      'toast.statsReset': 'Statistics reset',

      'lost.title': 'The tray is full!',
      'lost.text': 'Use a helper to keep going, or try this level again.',
      'lost.out': 'Take out 3',
      'lost.slot': 'Add a slot',
      'lost.retry': 'Try again',

      'retry.title': 'Restart this level?',
      'retry.text': 'You get a new board for level {n}.',
      'retry.confirm': 'Restart',
      'retry.cancel': 'Keep playing',

      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'settings.themeAuto': 'Auto',
      'settings.themeLight': 'Light',
      'settings.themeDark': 'Dark',
      'settings.language': 'Language',
      'settings.vibrate': 'Vibrate',
      'settings.vibrateDesc': 'Vibrate briefly when three tiles clear (if supported).',
      'settings.restart': 'Restart level',
      'settings.restartDesc': 'Get a new board for the current level.',
      'settings.hint': 'Tap a tile that nothing covers to drop it into the tray. Three identical tiles in the tray clear. Clear the whole board before the tray fills up. Each attempt gets 1 Take out, 3 Undo, 1 Shuffle and 1 extra slot.',
      'settings.done': 'Done',
      'settings.version': 'version',

      'stats.title': 'Statistics',
      'stats.level': 'Current level',
      'stats.cleared': 'Levels cleared',
      'stats.played': 'Attempts',
      'stats.reset': 'Reset',
      'stats.resetConfirm': 'Tap to confirm',
      'stats.close': 'Close',

      'summary.noGames': 'Start from level 1',
      'summary.at': 'Up to level {n}',
      'summary.statLevel': 'Level',
      'summary.statCleared': 'Cleared',
      'summary.resume': 'Tile Match · level {n}',
      'summary.resumeDetail': '{n} tiles left',
    },
    vi: {
      'meta.title': 'Nối Hình',
      'meta.appTitle': 'Nối Hình',
      'meta.description': 'Nối Hình: chạm ô không bị che để đưa xuống khay, đủ 3 hình giống nhau thì biến mất. Nhiều lớp ô, chồng bên, hoàn tác, xáo trộn.',
      'app.name': 'Nối Hình',

      'top.stats': 'Thống kê',
      'top.settings': 'Cài đặt',
      'level.title': 'Cấp độ {n}',
      'level.clear': 'Hoàn thành Cấp độ {n}',
      'board.label': 'Bàn hình. Chạm ô không bị che để đưa xuống khay.',
      'tray.label': 'Khay',
      'tray.add': 'Thêm một ô khay',
      'tile.free': 'Ô {name}',

      'tool.out': 'Lấy ra',
      'tool.outTitle': 'Đưa 3 ô đầu khay ra ngoài (O)',
      'tool.undo': 'Hoàn tác',
      'tool.undoTitle': 'Trả ô vừa chọn về chỗ cũ (Z)',
      'tool.shuffle': 'Xáo trộn',
      'tool.shuffleTitle': 'Xáo trộn các ô trên bàn (S)',
      'hint.keys': 'Phím tắt: <kbd>Z</kbd> hoàn tác · <kbd>O</kbd> lấy ra · <kbd>S</kbd> xáo trộn · <kbd>+</kbd> thêm ô khay · <kbd>R</kbd> chơi lại cấp độ',

      'toast.none': 'Đã hết lượt ở cấp độ này',
      'toast.outNeedsTiles': 'Khay đang trống',
      'toast.outBusy': 'Dùng hết các ô đang chờ trước đã',
      'toast.undoNone': 'Không có gì để hoàn tác',
      'toast.slotMax': 'Khay đã đủ ô tối đa',
      'toast.statsReset': 'Đã đặt lại thống kê',

      'lost.title': 'Khay đầy rồi!',
      'lost.text': 'Dùng trợ giúp để chơi tiếp, hoặc chơi lại cấp độ này.',
      'lost.out': 'Lấy ra 3 ô',
      'lost.slot': 'Thêm ô khay',
      'lost.retry': 'Chơi lại',

      'retry.title': 'Chơi lại cấp độ này?',
      'retry.text': 'Bạn sẽ có bàn mới cho cấp độ {n}.',
      'retry.confirm': 'Chơi lại',
      'retry.cancel': 'Chơi tiếp',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'settings.themeAuto': 'Tự động',
      'settings.themeLight': 'Sáng',
      'settings.themeDark': 'Tối',
      'settings.language': 'Ngôn ngữ',
      'settings.vibrate': 'Rung',
      'settings.vibrateDesc': 'Rung nhẹ khi ăn được 3 ô (nếu máy hỗ trợ).',
      'settings.restart': 'Chơi lại cấp độ',
      'settings.restartDesc': 'Lấy bàn mới cho cấp độ đang chơi.',
      'settings.hint': 'Chạm ô không bị ô nào che để đưa xuống khay. Khay có 3 hình giống nhau thì 3 ô biến mất. Dọn sạch bàn trước khi khay đầy. Mỗi lần chơi có 1 lượt Lấy ra, 3 lượt Hoàn tác, 1 lượt Xáo trộn và 1 lần thêm ô khay.',
      'settings.done': 'Xong',
      'settings.version': 'phiên bản',

      'stats.title': 'Thống kê',
      'stats.level': 'Cấp độ hiện tại',
      'stats.cleared': 'Cấp độ đã qua',
      'stats.played': 'Lượt chơi',
      'stats.reset': 'Đặt lại',
      'stats.resetConfirm': 'Bấm lần nữa để xóa',
      'stats.close': 'Đóng',

      'summary.noGames': 'Bắt đầu từ cấp độ 1',
      'summary.at': 'Đã tới cấp độ {n}',
      'summary.statLevel': 'Cấp độ',
      'summary.statCleared': 'Đã qua',
      'summary.resume': 'Nối Hình · cấp độ {n}',
      'summary.resumeDetail': 'Còn {n} ô',
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
