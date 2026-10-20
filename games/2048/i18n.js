/* =====================================================================
 * 2048 - Đa ngôn ngữ: tiếng Anh (mặc định) + tiếng Việt
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
      'meta.title': '2048',
      'meta.appTitle': '2048',
      'meta.description': '2048: swipe to merge matching tiles and reach the 2048 tile. 3x3, 4x4 and 5x5 grids, undo, statistics, autosave.',

      'top.stats': 'Statistics',
      'top.settings': 'Settings',
      'top.newGame': 'New game',
      'top.newGameTitle': 'New game (N)',
      'hud.score': 'Score',
      'hud.best': 'Best',
      'hud.undo': 'Undo',
      'hud.undoTitle': 'Undo (Z)',
      'hud.undoLeft': 'undos left',
      'hud.undoAria': 'Undo, {n} left',
      'hud.undoNone': ', nothing to undo yet',

      'board.role': '2048 board',
      'board.label': '2048 board. Use the arrow keys or W A S D to slide the tiles.',
      'help.touch': 'Swipe on the board to slide the tiles. Two tiles with the same number merge when they touch.',
      'help.keys': 'Use <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to slide · <kbd>Z</kbd> undo · <kbd>N</kbd> new game',

      'win.title': 'You reached 2048!',
      'win.continue': 'Keep going',
      'win.sub': { one: 'Score {score} · 1 move', other: 'Score {score} · {n} moves' },
      'over.title': 'No moves left',
      'game.scoreTile': 'Score {score} · max tile {tile}',
      'game.score': 'Score {score}',

      'announce.over': 'No moves left. Score {score}',
      'announce.won': 'You reached the 2048 tile!',
      'announce.undone': { one: 'Undone. 1 undo left', other: 'Undone. {n} undos left' },
      'toast.nothingToUndo': 'Nothing to undo yet',
      'toast.noUndosLeft': 'No undos left',
      'toast.statsReset': 'Statistics reset',

      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'settings.themeAuto': 'Auto',
      'settings.themeLight': 'Light',
      'settings.themeDark': 'Dark',
      'settings.size': 'Grid size',
      'settings.sizeDesc': 'Changing the size starts a new game. Each size has its own best score.',
      'settings.language': 'Language',
      'settings.done': 'Done',
      'settings.version': 'version',

      'stats.title': 'Statistics',
      'stats.played': 'Games played',
      'stats.won': 'Reached 2048',
      'stats.bestTile': 'Best tile',
      'stats.bestScore': 'Best score',
      'stats.bySize': 'Best score by size',
      'stats.grid': '{n}x{n} grid',
      'stats.current': 'current',
      'stats.reset': 'Reset',
      'stats.resetConfirm': 'Tap to confirm',
      'stats.close': 'Close',

      'confirm.newTitle': 'Start a new game?',
      'confirm.sizeTitle': 'Switch to the {n}x{n} grid?',
      'confirm.lost': 'The current game will be lost.',
      'confirm.text': 'The current game (score {score}) will be lost and a new {n}x{n} game will start.',
      'confirm.cancel': 'Cancel',

      'summary.note': 'Swipe to merge matching tiles and reach 2048',
      'summary.noteBest': 'Best score {score} · best tile {tile}',
      'summary.resume': 'Continue 2048',
    },
    vi: {
      'meta.title': '2048',
      'meta.appTitle': '2048',
      'meta.description': '2048 tiếng Việt: vuốt để ghép các ô cùng số, chạm tới ô 2048. Lưới 3x3, 4x4, 5x5, hoàn tác, thống kê, tự lưu ván chơi.',

      'top.stats': 'Thống kê',
      'top.settings': 'Cài đặt',
      'top.newGame': 'Ván mới',
      'top.newGameTitle': 'Ván mới (N)',
      'hud.score': 'Điểm',
      'hud.best': 'Cao nhất',
      'hud.undo': 'Hoàn tác',
      'hud.undoTitle': 'Hoàn tác (Z)',
      'hud.undoLeft': 'lượt còn lại',
      'hud.undoAria': 'Hoàn tác, còn {n} lượt',
      'hud.undoNone': ', chưa có nước để hoàn tác',

      'board.role': 'bàn chơi 2048',
      'board.label': 'Bàn chơi 2048. Dùng phím mũi tên hoặc W A S D để dồn các ô.',
      'help.touch': 'Vuốt trên bàn chơi để dồn các ô. Hai ô cùng số chạm nhau sẽ gộp lại.',
      'help.keys': 'Phím <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> hoặc <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> để dồn ô · <kbd>Z</kbd> hoàn tác · <kbd>N</kbd> ván mới',

      'win.title': 'Bạn đạt 2048!',
      'win.continue': 'Chơi tiếp',
      'win.sub': 'Điểm {score} · {n} nước',
      'over.title': 'Hết nước đi',
      'game.scoreTile': 'Điểm {score} · ô lớn nhất {tile}',
      'game.score': 'Điểm {score}',

      'announce.over': 'Hết nước đi. Điểm {score}',
      'announce.won': 'Bạn đã đạt ô 2048!',
      'announce.undone': 'Đã hoàn tác. Còn {n} lượt hoàn tác',
      'toast.nothingToUndo': 'Chưa có nước để hoàn tác',
      'toast.noUndosLeft': 'Đã hết lượt hoàn tác',
      'toast.statsReset': 'Đã đặt lại thống kê',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'settings.themeAuto': 'Tự động',
      'settings.themeLight': 'Sáng',
      'settings.themeDark': 'Tối',
      'settings.size': 'Kích thước lưới',
      'settings.sizeDesc': 'Đổi kích thước sẽ bắt đầu ván mới. Mỗi kích thước có điểm cao nhất riêng.',
      'settings.language': 'Ngôn ngữ',
      'settings.done': 'Xong',
      'settings.version': 'phiên bản',

      'stats.title': 'Thống kê',
      'stats.played': 'Ván đã chơi',
      'stats.won': 'Lần đạt 2048',
      'stats.bestTile': 'Ô lớn nhất',
      'stats.bestScore': 'Điểm cao nhất',
      'stats.bySize': 'Điểm cao nhất theo kích thước',
      'stats.grid': 'Lưới {n}x{n}',
      'stats.current': 'đang chơi',
      'stats.reset': 'Đặt lại',
      'stats.resetConfirm': 'Bấm lần nữa để xóa',
      'stats.close': 'Đóng',

      'confirm.newTitle': 'Bắt đầu ván mới?',
      'confirm.sizeTitle': 'Đổi sang lưới {n}x{n}?',
      'confirm.lost': 'Ván đang chơi sẽ bị bỏ.',
      'confirm.text': 'Ván đang chơi (điểm {score}) sẽ bị bỏ và bắt đầu ván mới {n}x{n}.',
      'confirm.cancel': 'Hủy',

      'summary.note': 'Vuốt để ghép các ô cùng số, chạm tới ô 2048',
      'summary.noteBest': 'Điểm cao nhất {score} · ô lớn nhất {tile}',
      'summary.resume': 'Tiếp tục 2048',
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
    fmtDate: (d, opts) => new Date(d).toLocaleDateString(LOCALES[lang], opts),
  };
})();
