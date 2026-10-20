/* =====================================================================
 * Dò Mìn - Đa ngôn ngữ: tiếng Anh (mặc định) + tiếng Việt
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
      'meta.title': 'Minesweeper',
      'meta.appTitle': 'Minesweeper',
      'meta.description': 'Minesweeper: three levels plus Custom, a daily board, a safe first click, long-press to flag, chording, statistics and autosave.',
      'app.name': 'Minesweeper',

      'top.stats': 'Statistics',
      'top.settings': 'Settings',
      'hud.label': 'Game status',
      'hud.minesLeft': 'Mines left',
      'hud.restart': 'Restart at the same level',
      'hud.restartTitle': 'New game, same level (N)',
      'board.label': 'Minefield. Use the arrow keys to move, Space or Enter to open, F to flag.',
      'tool.flagTitle': 'Tap to flag instead of opening cells',
      'tool.flag': 'Flag',
      'tool.on': 'On',
      'tool.off': 'Off',
      'tool.newTitle': 'Choose a game',
      'tool.new': 'New game',
      'tool.zoomIn': 'Zoom in on the board',
      'tool.zoomOut': 'Zoom out of the board',
      'tool.zoomTitle': 'Zoom in / out',
      'hint.keys': 'Shortcuts: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> move · <kbd>Space</kbd>/<kbd>Enter</kbd> open · <kbd>F</kbd> flag · <kbd>N</kbd> new game · Right-click to flag, click a number to chord',
      'toast.flagMode': 'Tap to flag · long-press to open',
      'toast.openMode': 'Tap to open · long-press to flag',
      'toast.statsReset': 'Statistics reset',

      'level.easy': 'Easy',
      'level.medium': 'Medium',
      'level.hard': 'Hard',
      'level.custom': 'Custom',
      'level.daily': 'Daily',
      'level.customSize': 'Custom {w}x{h}',

      'cell.exploded': 'Exploded mine',
      'cell.empty': 'Empty',
      'cell.number': { one: '1 adjacent mine', other: '{n} adjacent mines' },
      'cell.wrongFlag': 'Wrong flag',
      'cell.mine': 'Mine',
      'cell.flag': 'Flagged',
      'cell.question': 'Question mark',
      'cell.hidden': 'Unopened',
      'cell.aria': 'Row {r}, column {c}: {label}',

      'new.title': 'Choose a game',
      'new.warning': 'The current game will be lost.',
      'new.width': 'Width',
      'new.height': 'Height',
      'new.mines': 'Mines',
      'new.start': 'Start',
      'new.cancel': 'Cancel',
      'new.daily': 'Daily board',
      'new.mineCount': { one: '1 mine', other: '{n} mines' },
      'new.streak': '{n}-day streak',
      'new.badgeNew': 'New',
      'new.badgeBest': 'Best {time}',
      'new.customHint': 'Sides {min}–{max} cells, up to {maxMines} mines ({pct}% of the board).',

      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'settings.themeAuto': 'Auto',
      'settings.themeLight': 'Light',
      'settings.themeDark': 'Dark',
      'settings.question': '"?" marks',
      'settings.questionDesc': 'Flag a flagged cell again to turn it into a "?" (unsure).',
      'settings.vibrate': 'Vibrate on flag',
      'settings.vibrateDesc': 'Vibrate briefly when long-pressing to flag (if supported).',
      'settings.language': 'Language',
      'settings.hint': 'Tap to open a cell, long-press to flag. Tap a number whose flags are all placed to open the remaining cells around it.',
      'settings.done': 'Done',
      'settings.version': 'version',

      'stats.title': 'Statistics',
      'stats.daily': 'Daily board',
      'stats.streak': 'Day streak',
      'stats.dailyWon': 'Won',
      'stats.best': 'Best',
      'stats.byLevel': 'By level',
      'stats.colLevel': 'Level',
      'stats.colPlayed': 'Played',
      'stats.colWon': 'Won',
      'stats.colBest': 'Best',
      'stats.colAvg': 'Avg',
      'stats.avgHint': 'Avg: average time of won games.',
      'stats.reset': 'Reset',
      'stats.resetConfirm': 'Tap to confirm',
      'stats.close': 'Close',

      'result.win': 'You win!',
      'result.record': 'New record!',
      'result.lose': 'You hit a mine!',
      'result.level': 'Level',
      'result.time': 'Time',
      'result.best': 'Best',
      'result.streak': 'Day streak',
      'result.mines': 'Mines',
      'result.cleared': 'Cleared',
      'result.wonDaily': 'You cleared the daily board.',
      'result.wonBoard': 'You found every mine on the board.',
      'result.lostText': '{pct}% of the board cleared.',
      'result.wrongFlags': { one: '1 wrong flag.', other: '{n} wrong flags.' },
      'result.dailyNote': '{n}-day streak · come back tomorrow!',
      'result.view': 'View board',
      'result.retry': 'Retry',
      'result.new': 'New game',

      'summary.noGames': 'No games played yet · today\'s board {w}x{h}',
      'summary.noWins': { one: '1 game played · no wins yet', other: '{n} games played · no wins yet' },
      'summary.winsBest': { one: '1 win · {level} best {time}', other: '{n} wins · {level} best {time}' },
      'summary.wins': { one: '1 win', other: '{n} wins' },
      'summary.statWins': 'Wins',
      'summary.statRate': 'Win rate',
      'summary.statBest': '{level} best',
      'summary.statStreak': 'Day streak',
      'summary.resumeDaily': 'Daily Minesweeper',
      'summary.resume': 'Minesweeper · {level}',
      'summary.resumeDetail': '{pct}% cleared · {time}',
      'summary.dailyTitle': 'Today\'s board: {w}x{h}',
    },
    vi: {
      'meta.title': 'Dò Mìn',
      'meta.appTitle': 'Dò Mìn',
      'meta.description': 'Dò Mìn tiếng Việt: 3 mức chơi và Tùy chỉnh, ván hằng ngày, cú mở đầu luôn an toàn, cắm cờ bằng nhấn giữ, mở nhanh, thống kê, tự lưu ván.',
      'app.name': 'Dò Mìn',

      'top.stats': 'Thống kê',
      'top.settings': 'Cài đặt',
      'hud.label': 'Trạng thái ván',
      'hud.minesLeft': 'Mìn còn',
      'hud.restart': 'Chơi lại ván mới cùng mức',
      'hud.restartTitle': 'Ván mới cùng mức (N)',
      'board.label': 'Bàn mìn. Dùng phím mũi tên để di chuyển, Space hoặc Enter để mở, F để cắm cờ.',
      'tool.flagTitle': 'Chạm để cắm cờ thay vì mở ô',
      'tool.flag': 'Cắm cờ',
      'tool.on': 'Bật',
      'tool.off': 'Tắt',
      'tool.newTitle': 'Chọn ván chơi',
      'tool.new': 'Ván mới',
      'tool.zoomIn': 'Phóng to bàn mìn',
      'tool.zoomOut': 'Thu nhỏ bàn mìn',
      'tool.zoomTitle': 'Phóng to / thu nhỏ',
      'hint.keys': 'Phím tắt: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> di chuyển · <kbd>Space</kbd>/<kbd>Enter</kbd> mở · <kbd>F</kbd> cắm cờ · <kbd>N</kbd> ván mới · Chuột phải cắm cờ, nhấn vào số để mở nhanh',
      'toast.flagMode': 'Chạm để cắm cờ · nhấn giữ để mở ô',
      'toast.openMode': 'Chạm để mở ô · nhấn giữ để cắm cờ',
      'toast.statsReset': 'Đã đặt lại thống kê',

      'level.easy': 'Dễ',
      'level.medium': 'Vừa',
      'level.hard': 'Khó',
      'level.custom': 'Tùy chỉnh',
      'level.daily': 'Hằng ngày',
      'level.customSize': 'Tùy chỉnh {w}x{h}',

      'cell.exploded': 'Mìn nổ',
      'cell.empty': 'Ô trống',
      'cell.number': '{n} mìn xung quanh',
      'cell.wrongFlag': 'Cờ cắm sai',
      'cell.mine': 'Mìn',
      'cell.flag': 'Cắm cờ',
      'cell.question': 'Dấu hỏi',
      'cell.hidden': 'Chưa mở',
      'cell.aria': 'Hàng {r}, cột {c}: {label}',

      'new.title': 'Chọn ván chơi',
      'new.warning': 'Ván đang chơi sẽ bị bỏ.',
      'new.width': 'Rộng',
      'new.height': 'Cao',
      'new.mines': 'Số mìn',
      'new.start': 'Bắt đầu',
      'new.cancel': 'Hủy',
      'new.daily': 'Ván hằng ngày',
      'new.mineCount': '{n} mìn',
      'new.streak': 'chuỗi {n} ngày',
      'new.badgeNew': 'Mới',
      'new.badgeBest': 'Kỷ lục {time}',
      'new.customHint': 'Cạnh {min}–{max} ô, tối đa {maxMines} mìn ({pct}% bàn).',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'settings.themeAuto': 'Tự động',
      'settings.themeLight': 'Sáng',
      'settings.themeDark': 'Tối',
      'settings.question': 'Dấu "?"',
      'settings.questionDesc': 'Cắm cờ lần nữa trên ô có cờ để đổi thành dấu "?" (ô nghi ngờ).',
      'settings.vibrate': 'Rung khi cắm cờ',
      'settings.vibrateDesc': 'Rung nhẹ khi nhấn giữ để cắm cờ (nếu máy hỗ trợ).',
      'settings.language': 'Ngôn ngữ',
      'settings.hint': 'Chạm để mở ô, nhấn giữ để cắm cờ. Chạm vào ô số đã đủ cờ xung quanh để mở nhanh các ô còn lại.',
      'settings.done': 'Xong',
      'settings.version': 'phiên bản',

      'stats.title': 'Thống kê',
      'stats.daily': 'Ván hằng ngày',
      'stats.streak': 'Chuỗi ngày',
      'stats.dailyWon': 'Đã thắng',
      'stats.best': 'Tốt nhất',
      'stats.byLevel': 'Theo mức chơi',
      'stats.colLevel': 'Mức',
      'stats.colPlayed': 'Chơi',
      'stats.colWon': 'Thắng',
      'stats.colBest': 'Tốt nhất',
      'stats.colAvg': 'TB',
      'stats.avgHint': 'TB: thời gian trung bình của các ván thắng.',
      'stats.reset': 'Đặt lại',
      'stats.resetConfirm': 'Bấm lần nữa để xóa',
      'stats.close': 'Đóng',

      'result.win': 'Bạn thắng!',
      'result.record': 'Kỷ lục mới!',
      'result.lose': 'Trúng mìn!',
      'result.level': 'Mức',
      'result.time': 'Thời gian',
      'result.best': 'Kỷ lục',
      'result.streak': 'Chuỗi ngày',
      'result.mines': 'Số mìn',
      'result.cleared': 'Đã mở',
      'result.wonDaily': 'Bạn đã phá xong ván hằng ngày.',
      'result.wonBoard': 'Bạn đã dò hết mìn trên bàn.',
      'result.lostText': 'Đã mở {pct}% bàn mìn.',
      'result.wrongFlags': 'Có {n} cờ cắm sai.',
      'result.dailyNote': 'Chuỗi {n} ngày · quay lại vào ngày mai nhé!',
      'result.view': 'Xem bàn',
      'result.retry': 'Thử lại',
      'result.new': 'Ván mới',

      'summary.noGames': 'Chưa chơi ván nào · đề hôm nay {w}x{h}',
      'summary.noWins': '{n} ván đã chơi · chưa thắng ván nào',
      'summary.winsBest': '{n} ván thắng · kỷ lục {level} {time}',
      'summary.wins': '{n} ván thắng',
      'summary.statWins': 'Ván thắng',
      'summary.statRate': 'Tỉ lệ thắng',
      'summary.statBest': 'Kỷ lục {level}',
      'summary.statStreak': 'Chuỗi ngày',
      'summary.resumeDaily': 'Dò Mìn hằng ngày',
      'summary.resume': 'Dò Mìn {level}',
      'summary.resumeDetail': 'Đã mở {pct}% · {time}',
      'summary.dailyTitle': 'Đề hôm nay: {w}x{h}',
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
