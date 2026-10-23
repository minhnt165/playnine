/* =====================================================================
 * Bắn Bóng - Đa ngôn ngữ: tiếng Anh (mặc định) + tiếng Việt
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
      'meta.title': 'Bubble Shooter',
      'meta.appTitle': 'Bubble Shooter',
      'meta.description': 'Bubble Shooter: aim, bounce off the walls and match 3 or more bubbles of the same colour. Drop whole clusters for bonus points, clear the board for a big bonus. Endless, autosave.',
      'app.name': 'Bubble Shooter',

      // Thanh trên + bảng điểm
      'top.help': 'How to play',
      'top.helpKey': 'How to play (H)',
      'top.stats': 'Statistics',
      'top.settings': 'Settings',
      'btn.new': 'New game',
      'btn.newKey': 'New game (N)',
      'btn.pause': 'Pause',
      'btn.resume': 'Resume',
      'btn.keySuffix': '{label} (P)',
      'btn.close': 'Close',
      'btn.cancel': 'Cancel',
      'hud.label': 'Score',
      'hud.score': 'Score',
      'hud.best': 'Best',
      'hud.board': 'Board',

      'board.role': 'bubble shooter board',
      'board.label': 'Bubble Shooter board. Left and right arrows to aim, Space to shoot, X to swap bubbles, P to pause.',
      'help.touch': 'Drag to aim · release to shoot · tap the next bubble to swap',
      'help.keys': 'Mouse or <kbd>←</kbd><kbd>→</kbd> aim · <kbd>Space</kbd> shoot · <kbd>X</kbd> swap · <kbd>P</kbd> pause',

      // Chữ vẽ trên canvas
      'canvas.next': 'Next',
      'canvas.push': 'New row in {n}',
      'canvas.combo': 'Combo x{n}',
      'canvas.drop': 'Drop +{n}',

      // Lớp phủ
      'start.sub': 'Aim, bounce off the walls and match 3 or more bubbles of the same colour. Cut a cluster loose to drop it for bonus points.',
      'start.go': 'Start',
      'start.best': 'Best: <b>{score}</b> pts',
      'pause.title': 'Paused',
      'pause.hint': 'Press <kbd>P</kbd> or <kbd>Space</kbd> to resume',
      'detail': 'Board {level} · {score} pts',
      'over.title': 'Game over',
      'over.record': 'New record!',
      'over.score': 'Score',
      'over.best': 'Best',
      'over.board': 'Board',
      'over.again': 'Play again',

      'banner.clear': 'Board cleared!',
      'banner.bonus': 'Bonus +{n}',
      'banner.board': 'Board {n}',

      // Thông báo đọc màn hình
      'say.newGame': 'New game. Aim with the arrow keys and press Space to shoot.',
      'say.paused': 'Paused',
      'say.popped': { one: 'Popped 1 bubble, {points} points', other: 'Popped {n} bubbles, {points} points' },
      'say.dropped': { one: ', 1 bubble dropped', other: ', {n} bubbles dropped' },
      'say.pushed': 'A new row pushed down.',
      'say.cleared': 'Board cleared! Bonus {n} points.',
      'say.over': 'Game over. Score {score}',
      'say.overRecord': '. New record!',
      'say.swap': 'Swapped bubbles',

      // Tóm tắt cho cổng
      'sum.best': 'Best score',
      'sum.boards': 'Boards cleared',
      'sum.popped': 'Bubbles popped',
      'sum.note': 'Match 3 bubbles, drop clusters, clear the board',
      'sum.noteBest': 'Best score {score}',
      'sum.resume': 'Continue Bubble Shooter',

      // Cách chơi
      'help.title': 'How to play',
      'help.intro': 'Shoot bubbles from the bottom. When a bubble touches the ceiling or another bubble it sticks. <b>3 or more connected bubbles of the same colour pop</b>, and every bubble no longer connected to the ceiling <b>drops</b> for bonus points.',
      'help.controls': 'Controls',
      'help.phone': '<b>Phone:</b> drag your finger above the shooter to aim (a dotted guide shows the path with one wall bounce), release to shoot. Drag back down to the shooter to cancel. Tap the next bubble (or the shooter) to swap them.',
      'help.computer': '<b>Computer:</b> point with the mouse and click to shoot, or <kbd>←</kbd><kbd>→</kbd> to aim and <kbd>Space</kbd> / <kbd>Enter</kbd> / <kbd>↑</kbd> to shoot. <kbd>X</kbd> swaps, <kbd>P</kbd> / <kbd>Esc</kbd> pauses.',
      'help.walls': 'Bubbles bounce off the side walls: use the bounce to reach gaps behind other bubbles.',
      'help.pressure': 'Pressure',
      'help.press1': 'Every few <b>misses</b> (shots that pop nothing) a new row pushes the board down. The dots by the shooter count down to the next row; the higher your score, the fewer misses it takes.',
      'help.press2': 'If any bubble reaches the <b>dashed line</b> near the shooter, the game is over.',
      'help.press3': 'You only get colours that are still on the board.',
      'help.scoring': 'Scoring',
      'help.score1': '10 points per popped bubble. Popping on consecutive shots is a <b>combo</b>: +5 per bubble on the 2nd shot, +10 from the 3rd.',
      'help.score2': 'Dropped bubbles are worth 20, 40, then 60 points each.',
      'help.score3': '<b>Clear the board</b> for a bonus of 500 points (more on each later board, up to 2,000) and a fresh, denser board. The game is endless.',
      'help.play': "Let's play!",

      // Cài đặt
      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'settings.themeAuto': 'Auto',
      'settings.themeLight': 'Light',
      'settings.themeDark': 'Dark',
      'settings.lang': 'Language',
      'settings.sound': 'Sound',
      'settings.soundDesc': 'Sound effects for shots, pops, drops and new rows.',
      'settings.vibrate': 'Vibration',
      'settings.vibrateDesc': 'Vibrate gently when bubbles drop, a row pushes down or the board is cleared (if supported).',
      'settings.replayHelp': 'Show how to play',
      'settings.done': 'Done',
      'settings.version': 'Bubble Shooter · version',

      // Thống kê
      'stats.title': 'Statistics',
      'stats.played': 'Games played',
      'stats.best': 'Best score',
      'stats.boards': 'Boards cleared',
      'stats.popped': 'Bubbles popped',
      'stats.dropped': 'Bubbles dropped',
      'stats.combo': 'Best combo',
      'stats.reset': 'Reset',
      'stats.resetConfirm': 'Tap to confirm',
      'toast.statsReset': 'Statistics reset',

      // Xác nhận ván mới
      'confirm.title': 'Start a new game?',
      'confirm.text': 'The current game will end with its score so far ({detail}).',
    },
    vi: {
      'meta.title': 'Bắn Bóng',
      'meta.appTitle': 'Bắn Bóng',
      'meta.description': 'Bắn Bóng: ngắm, nảy tường và ghép từ 3 bóng cùng màu để nổ. Cắt rời cả chùm cho bóng rơi để ăn thưởng, dọn sạch bàn được thưởng lớn. Chơi vô tận, tự lưu.',
      'app.name': 'Bắn Bóng',

      'top.help': 'Cách chơi',
      'top.helpKey': 'Cách chơi (H)',
      'top.stats': 'Thống kê',
      'top.settings': 'Cài đặt',
      'btn.new': 'Ván mới',
      'btn.newKey': 'Ván mới (N)',
      'btn.pause': 'Tạm dừng',
      'btn.resume': 'Tiếp tục',
      'btn.keySuffix': '{label} (P)',
      'btn.close': 'Đóng',
      'btn.cancel': 'Hủy',
      'hud.label': 'Điểm',
      'hud.score': 'Điểm',
      'hud.best': 'Kỷ lục',
      'hud.board': 'Bàn',

      'board.role': 'bàn bắn bóng',
      'board.label': 'Bàn Bắn Bóng. Mũi tên trái phải để ngắm, Space để bắn, X để đổi bóng, P để tạm dừng.',
      'help.touch': 'Kéo để ngắm · thả tay để bắn · chạm bóng kế để đổi',
      'help.keys': 'Chuột hoặc <kbd>←</kbd><kbd>→</kbd> ngắm · <kbd>Space</kbd> bắn · <kbd>X</kbd> đổi bóng · <kbd>P</kbd> tạm dừng',

      'canvas.next': 'Kế',
      'canvas.push': 'Thêm hàng sau {n}',
      'canvas.combo': 'Chuỗi x{n}',
      'canvas.drop': 'Rơi +{n}',

      'start.sub': 'Ngắm, nảy tường và ghép từ 3 bóng cùng màu để nổ. Cắt rời một chùm để bóng rơi và ăn điểm thưởng.',
      'start.go': 'Bắt đầu',
      'start.best': 'Kỷ lục: <b>{score}</b> điểm',
      'pause.title': 'Tạm dừng',
      'pause.hint': 'Bấm <kbd>P</kbd> hoặc <kbd>Space</kbd> để chơi tiếp',
      'detail': 'Bàn {level} · {score} điểm',
      'over.title': 'Hết ván',
      'over.record': 'Kỷ lục mới!',
      'over.score': 'Điểm',
      'over.best': 'Kỷ lục',
      'over.board': 'Bàn',
      'over.again': 'Chơi lại',

      'banner.clear': 'Dọn sạch bàn!',
      'banner.bonus': 'Thưởng +{n}',
      'banner.board': 'Bàn {n}',

      'say.newGame': 'Ván mới. Ngắm bằng phím mũi tên, bấm Space để bắn.',
      'say.paused': 'Tạm dừng',
      'say.popped': 'Nổ {n} bóng, {points} điểm',
      'say.dropped': ', rơi {n} bóng',
      'say.pushed': 'Bàn bị đẩy xuống một hàng.',
      'say.cleared': 'Dọn sạch bàn! Thưởng {n} điểm.',
      'say.over': 'Hết ván. Điểm {score}',
      'say.overRecord': '. Kỷ lục mới!',
      'say.swap': 'Đã đổi bóng',

      'sum.best': 'Điểm cao nhất',
      'sum.boards': 'Bàn đã dọn',
      'sum.popped': 'Bóng đã nổ',
      'sum.note': 'Ghép 3 bóng, làm rơi cả chùm, dọn sạch bàn',
      'sum.noteBest': 'Điểm cao nhất {score}',
      'sum.resume': 'Tiếp tục Bắn Bóng',

      'help.title': 'Cách chơi',
      'help.intro': 'Bắn bóng từ dưới lên. Bóng chạm trần hoặc chạm bóng khác thì dính lại. <b>Từ 3 bóng cùng màu liền nhau trở lên thì nổ</b>, và mọi bóng không còn nối với trần sẽ <b>rơi</b> và được điểm thưởng.',
      'help.controls': 'Điều khiển',
      'help.phone': '<b>Điện thoại:</b> kéo ngón tay phía trên súng để ngắm (đường chấm cho thấy đường bay, có một lần nảy tường), thả tay để bắn. Kéo ngược xuống súng để hủy. Chạm bóng kế (hoặc bóng trên súng) để đổi hai bóng.',
      'help.computer': '<b>Máy tính:</b> rê chuột để ngắm, nhấp để bắn; hoặc <kbd>←</kbd><kbd>→</kbd> để ngắm, <kbd>Space</kbd> / <kbd>Enter</kbd> / <kbd>↑</kbd> để bắn. <kbd>X</kbd> đổi bóng, <kbd>P</kbd> / <kbd>Esc</kbd> tạm dừng.',
      'help.walls': 'Bóng nảy ở hai tường bên: dùng cú nảy để luồn vào khe phía sau các bóng khác.',
      'help.pressure': 'Áp lực',
      'help.press1': 'Cứ vài phát <b>trượt</b> (không nổ được bóng nào) thì một hàng mới đẩy cả bàn xuống. Các chấm cạnh súng đếm ngược tới hàng mới; điểm càng cao thì càng ít phát trượt.',
      'help.press2': 'Có bóng nào chạm <b>vạch đứt</b> gần súng là hết ván.',
      'help.press3': 'Bạn chỉ nhận được màu còn trên bàn.',
      'help.scoring': 'Tính điểm',
      'help.score1': 'Mỗi bóng nổ 10 điểm. Nổ được ở nhiều phát liên tiếp là <b>chuỗi</b>: phát thứ 2 thêm 5 điểm mỗi bóng, từ phát thứ 3 thêm 10.',
      'help.score2': 'Bóng rơi được 20, 40, rồi 60 điểm mỗi bóng.',
      'help.score3': '<b>Dọn sạch bàn</b> được thưởng 500 điểm (các bàn sau nhiều hơn, tối đa 2.000) và một bàn mới dày hơn. Trò chơi không có hồi kết.',
      'help.play': 'Chơi thôi!',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'settings.themeAuto': 'Tự động',
      'settings.themeLight': 'Sáng',
      'settings.themeDark': 'Tối',
      'settings.lang': 'Ngôn ngữ',
      'settings.sound': 'Âm thanh',
      'settings.soundDesc': 'Hiệu ứng âm thanh khi bắn, nổ bóng, bóng rơi và thêm hàng.',
      'settings.vibrate': 'Rung',
      'settings.vibrateDesc': 'Rung nhẹ khi bóng rơi, bàn bị đẩy xuống hoặc dọn sạch bàn (nếu máy hỗ trợ).',
      'settings.replayHelp': 'Xem lại cách chơi',
      'settings.done': 'Xong',
      'settings.version': 'Bắn Bóng · phiên bản',

      'stats.title': 'Thống kê',
      'stats.played': 'Ván đã chơi',
      'stats.best': 'Điểm cao nhất',
      'stats.boards': 'Bàn đã dọn',
      'stats.popped': 'Bóng đã nổ',
      'stats.dropped': 'Bóng đã rơi',
      'stats.combo': 'Chuỗi dài nhất',
      'stats.reset': 'Đặt lại',
      'stats.resetConfirm': 'Bấm lần nữa để xóa',
      'toast.statsReset': 'Đã đặt lại thống kê',

      'confirm.title': 'Bắt đầu ván mới?',
      'confirm.text': 'Ván đang chơi sẽ kết thúc với số điểm hiện có ({detail}).',
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
    // Chỉ dùng cho chuỗi trong từ điển (tin cậy) có thẻ như <kbd>, <b>
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
