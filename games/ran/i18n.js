/* =====================================================================
 * Rắn Săn Mồi - Đa ngôn ngữ (tiếng Anh mặc định + tiếng Việt)
 *   - Khóa dùng chung với cổng PlayNine: localStorage['playnine-lang'] = 'en' | 'vi'
 *   - I18N.t(key, params): tra từ điển ngôn ngữ hiện tại, thiếu thì lấy 'en', thiếu nữa thì trả về key
 *   - I18N.apply(root): điền [data-i18n], [data-i18n-html], [data-i18n-attr]
 *   - I18N.set(lang): lưu rồi tải lại trang (app.js lưu ván trước khi gọi)
 *   - Nạp trước engine.js và app.js
 * ===================================================================== */
(function () {
  'use strict';

  const KEY = 'playnine-lang';
  const LANGS = ['en', 'vi'];
  const LOCALES = { en: 'en-US', vi: 'vi-VN' };

  const DICT = {
    en: {
      'meta.title': 'Snake',
      'meta.description':
        'Snake: steer the snake to eat mangoes while dodging the walls and your own tail. Three modes (Classic, Wrap, Maze), three speeds, swipe or arrow keys, auto-saves your game.',
      'app.name': 'Snake',

      'top.stats': 'Statistics',
      'top.settings': 'Settings',
      'top.newTitle': 'New game (N)',
      'common.newGame': 'New game',

      'start.title': 'New game',
      'start.sub': 'Steer the snake to eat mangoes. The longer it gets, the harder it is. Don’t bite yourself!',
      'start.mode': 'Mode',
      'start.map': 'Map',
      'start.speed': 'Speed',
      'start.size': 'Board size',
      'start.best': 'Best in this mode: <b>—</b>',
      'start.start': 'Start',

      'mode.classic': 'Classic',
      'mode.wrap': 'Wrap',
      'mode.maze': 'Maze',
      'modeDesc.classic': 'Touch a wall and you lose.',
      'modeDesc.wrap': 'Go off one edge to come back on the opposite side.',
      'modeDesc.maze': 'Dodge the obstacles. Walls still end the game.',
      'speed.slow': 'Slow',
      'speed.normal': 'Normal',
      'speed.fast': 'Fast',
      'map.corners': 'Corners',
      'map.corridor': 'Corridor',
      'map.pillars': 'Pillars',
      'map.fortress': 'Fortress',

      'hud.score': 'Score',
      'hud.best': 'Best',
      'hud.length': 'Length',
      'hud.pause': 'Pause',
      'hud.start': 'Start',
      'hud.resume': 'Resume',
      'hud.keyHint': '{label} (Space / P)',
      'hud.badge': '{mode} · {speed}',

      'board.role': 'snake game board',
      'board.label': 'Snake game board. Use the arrow keys or W A S D to steer, Space or P to pause.',
      'ready.touch': 'Swipe or tap a direction button to start',
      'ready.keys': 'Press an arrow key to start',

      'pause.title': 'Paused',
      'pause.sub': { one: 'Length {len} · 1 point', other: 'Length {len} · {score} points' },
      'pause.resume': 'Resume',
      'pause.hint': 'Press <kbd>Space</kbd> or <kbd>P</kbd> to resume',

      'over.wall': 'The snake hit the wall',
      'over.self': 'The snake bit itself',
      'over.obstacle': 'The snake hit an obstacle',
      'over.won': 'You filled the whole board!',
      'over.end': 'Game over',
      'over.newBest': 'New best!',
      'over.menu': 'Change mode',
      'over.again': 'Play again',

      'dpad.label': 'Direction buttons',
      'dpad.up': 'Up',
      'dpad.left': 'Left',
      'dpad.down': 'Down',
      'dpad.right': 'Right',

      'help.touch': 'Swipe anywhere on the board to change direction.',
      'help.keys':
        '<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to steer · <kbd>Space</kbd> / <kbd>P</kbd> pause · <kbd>N</kbd> new game',

      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'settings.themeAuto': 'Auto',
      'settings.themeLight': 'Light',
      'settings.themeDark': 'Dark',
      'settings.language': 'Language',
      'settings.accel': 'Gradual speed-up',
      'settings.accelDesc': 'The snake gets a little faster with every bite.',
      'settings.dpad': 'Direction buttons',
      'settings.dpadDesc': 'Show four large arrow buttons below the board. Swiping still works.',
      'settings.vibrate': 'Vibration',
      'settings.vibrateDesc': 'Vibrate lightly when eating and when you lose (if supported).',
      'settings.done': 'Done',
      'settings.version': 'Snake · version <span id="app-version">—</span>',

      'stats.title': 'Statistics',
      'stats.played': 'Games played',
      'stats.food': 'Food eaten',
      'stats.longest': 'Longest snake',
      'stats.best': 'Best score',
      'stats.bestCaption': 'Best score by mode and speed',
      'stats.mode': 'Mode',
      'stats.current': 'Current mode',
      'stats.reset': 'Reset',
      'stats.resetConfirm': 'Tap to confirm',
      'stats.resetDone': 'Statistics reset',
      'stats.close': 'Close',

      'confirm.title': 'Abandon this game?',
      'confirm.textShort': 'The current game will be discarded.',
      'confirm.text': {
        one: 'The current game (length {len}, 1 point) will be discarded so you can pick a new one.',
        other: 'The current game (length {len}, {score} points) will be discarded so you can pick a new one.',
      },
      'confirm.cancel': 'Cancel',

      'announce.newGame': 'New game: {mode}, {speed} speed. Press any direction to start.',
      'announce.resumed': 'Resumed',
      'announce.paused': 'Paused',
      'announce.bonus': 'A bonus lychee appeared. Eat it before time runs out!',
      'announce.over': '{title}. Score {score}, length {len}',
      'announce.newBest': '. New best!',

      'summary.note': 'Eat, grow longer, and don’t bite yourself',
      'summary.record': 'Record {food} eaten · {mode} mode',
      'summary.best': 'Best score',
      'summary.longest': 'Longest snake',
      'summary.food': 'Food eaten',
      'summary.resume': 'Continue Snake',
      'summary.mode': '{mode} · ',
      'summary.detail': { one: 'Length {len} · 1 point', other: 'Length {len} · {score} points' },
    },

    vi: {
      'meta.title': 'Rắn Săn Mồi',
      'meta.description':
        'Rắn Săn Mồi tiếng Việt: lái rắn ăn xoài, né tường và chính mình. Ba chế độ Cổ điển, Xuyên tường, Mê cung; ba tốc độ; vuốt hoặc phím mũi tên; tự lưu ván chơi.',
      'app.name': 'Rắn Săn Mồi',

      'top.stats': 'Thống kê',
      'top.settings': 'Cài đặt',
      'top.newTitle': 'Ván mới (N)',
      'common.newGame': 'Ván mới',

      'start.title': 'Ván mới',
      'start.sub': 'Lái rắn ăn xoài, càng dài càng khó. Đừng cắn vào mình!',
      'start.mode': 'Chế độ',
      'start.map': 'Bản đồ',
      'start.speed': 'Tốc độ',
      'start.size': 'Kích thước bàn',
      'start.best': 'Cao nhất ở chế độ này: <b>—</b>',
      'start.start': 'Bắt đầu',

      'mode.classic': 'Cổ điển',
      'mode.wrap': 'Xuyên tường',
      'mode.maze': 'Mê cung',
      'modeDesc.classic': 'Chạm tường là thua.',
      'modeDesc.wrap': 'Đi qua mép bàn để sang phía đối diện.',
      'modeDesc.maze': 'Né chướng ngại vật. Chạm tường cũng thua.',
      'speed.slow': 'Chậm',
      'speed.normal': 'Vừa',
      'speed.fast': 'Nhanh',
      'map.corners': 'Bốn góc',
      'map.corridor': 'Hành lang',
      'map.pillars': 'Cột đôi',
      'map.fortress': 'Pháo đài',

      'hud.score': 'Điểm',
      'hud.best': 'Cao nhất',
      'hud.length': 'Độ dài',
      'hud.pause': 'Tạm dừng',
      'hud.start': 'Bắt đầu',
      'hud.resume': 'Tiếp tục',
      'hud.keyHint': '{label} (Space / P)',
      'hud.badge': '{mode} · {speed}',

      'board.role': 'bàn chơi rắn săn mồi',
      'board.label': 'Bàn chơi Rắn Săn Mồi. Dùng phím mũi tên hoặc W A S D để lái rắn, Space hoặc P để tạm dừng.',
      'ready.touch': 'Vuốt hoặc bấm nút hướng để bắt đầu',
      'ready.keys': 'Bấm phím mũi tên để bắt đầu',

      'pause.title': 'Tạm dừng',
      'pause.sub': 'Dài {len} · {score} điểm',
      'pause.resume': 'Tiếp tục',
      'pause.hint': 'Nhấn <kbd>Space</kbd> hoặc <kbd>P</kbd> để chơi tiếp',

      'over.wall': 'Rắn đâm vào tường',
      'over.self': 'Rắn tự cắn vào mình',
      'over.obstacle': 'Rắn đâm vào chướng ngại',
      'over.won': 'Lấp kín cả bàn!',
      'over.end': 'Kết thúc',
      'over.newBest': 'Kỷ lục mới!',
      'over.menu': 'Đổi chế độ',
      'over.again': 'Chơi lại',

      'dpad.label': 'Nút điều hướng',
      'dpad.up': 'Lên',
      'dpad.left': 'Trái',
      'dpad.down': 'Xuống',
      'dpad.right': 'Phải',

      'help.touch': 'Vuốt ở bất kỳ đâu trên bàn chơi để đổi hướng.',
      'help.keys':
        '<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> hoặc <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> để lái · <kbd>Space</kbd> / <kbd>P</kbd> tạm dừng · <kbd>N</kbd> ván mới',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'settings.themeAuto': 'Tự động',
      'settings.themeLight': 'Sáng',
      'settings.themeDark': 'Tối',
      'settings.language': 'Ngôn ngữ',
      'settings.accel': 'Tăng tốc dần',
      'settings.accelDesc': 'Rắn chạy nhanh hơn một chút sau mỗi mồi ăn được.',
      'settings.dpad': 'Nút điều hướng',
      'settings.dpadDesc': 'Hiện bốn nút mũi tên lớn dưới bàn chơi. Vẫn vuốt được như thường.',
      'settings.vibrate': 'Rung',
      'settings.vibrateDesc': 'Rung nhẹ khi ăn mồi và khi thua (nếu máy hỗ trợ).',
      'settings.done': 'Xong',
      'settings.version': 'Rắn Săn Mồi · phiên bản <span id="app-version">—</span>',

      'stats.title': 'Thống kê',
      'stats.played': 'Ván đã chơi',
      'stats.food': 'Mồi đã ăn',
      'stats.longest': 'Rắn dài nhất',
      'stats.best': 'Điểm cao nhất',
      'stats.bestCaption': 'Điểm cao nhất theo chế độ và tốc độ',
      'stats.mode': 'Chế độ',
      'stats.current': 'Chế độ đang chọn',
      'stats.reset': 'Đặt lại',
      'stats.resetConfirm': 'Bấm lần nữa để xóa',
      'stats.resetDone': 'Đã đặt lại thống kê',
      'stats.close': 'Đóng',

      'confirm.title': 'Bỏ ván đang chơi?',
      'confirm.textShort': 'Ván đang chơi sẽ bị bỏ.',
      'confirm.text': 'Ván đang chơi (dài {len}, {score} điểm) sẽ bị bỏ để chọn ván mới.',
      'confirm.cancel': 'Hủy',

      'announce.newGame': 'Ván mới: {mode}, tốc độ {speed}. Bấm hướng bất kỳ để bắt đầu.',
      'announce.resumed': 'Tiếp tục',
      'announce.paused': 'Tạm dừng',
      'announce.bonus': 'Có quả vải thưởng, ăn nhanh trước khi hết giờ!',
      'announce.over': '{title}. Điểm {score}, dài {len}',
      'announce.newBest': '. Kỷ lục mới!',

      'summary.note': 'Lái rắn ăn mồi, càng dài càng khó',
      'summary.record': 'Kỷ lục {food} mồi · chế độ {mode}',
      'summary.best': 'Điểm cao nhất',
      'summary.longest': 'Rắn dài nhất',
      'summary.food': 'Mồi đã ăn',
      'summary.resume': 'Tiếp tục Rắn Săn Mồi',
      'summary.mode': '{mode} · ',
      'summary.detail': 'Dài {len} · {score} điểm',
    },
  };

  function readLang() {
    try {
      const v = localStorage.getItem(KEY);
      return LANGS.includes(v) ? v : 'en';
    } catch (e) {
      return 'en';
    }
  }

  const lang = readLang();
  const locale = LOCALES[lang];

  /** Tra từ điển; giá trị dạng { one, other } chọn theo params.n (tiếng Việt không có số nhiều). */
  function t(key, params) {
    let s = DICT[lang][key];
    if (s === undefined) s = DICT.en[key];
    if (s === undefined) return key;
    if (s && typeof s === 'object') {
      const n = params && Number(params.n);
      s = n === 1 && s.one !== undefined ? s.one : s.other;
    }
    if (!params) return s;
    return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
  }

  function apply(root) {
    const r = root || document;
    r.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    // Chỉ dùng cho chuỗi trong từ điển (tin cậy) có thẻ như <b>, <kbd>
    r.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    r.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      el.getAttribute('data-i18n-attr').split(';').forEach((pair) => {
        const i = pair.indexOf(':');
        if (i < 1) return;
        el.setAttribute(pair.slice(0, i).trim(), t(pair.slice(i + 1).trim()));
      });
    });
    if (r === document) {
      document.documentElement.lang = lang;
      document.title = t('meta.title');
      const desc = document.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute('content', t('meta.description'));
      const appTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (appTitle) appTitle.setAttribute('content', t('meta.title'));
    }
  }

  /** Đổi ngôn ngữ: lưu khóa dùng chung rồi tải lại trang (gọi sau khi đã lưu ván). */
  function set(next) {
    if (!LANGS.includes(next)) return;
    try {
      localStorage.setItem(KEY, next);
    } catch (e) {}
    location.reload();
  }

  const fmtNumber = (n) => Number(n || 0).toLocaleString(locale);
  const fmtDate = (d, opts) => new Date(d).toLocaleString(locale, opts);

  const I18N = { lang, locale, t, apply, set, fmtNumber, fmtDate, beforeReload: null };

  // Trang khác (cổng PlayNine hoặc game khác) đổi ngôn ngữ: lưu ván rồi tải lại để đi theo
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    try {
      if (typeof I18N.beforeReload === 'function') I18N.beforeReload();
    } catch (err) {}
    location.reload();
  });

  document.documentElement.lang = lang;
  window.I18N = I18N;
})();
