/* =====================================================================
 * Xếp Gạch - Đa ngôn ngữ (tiếng Anh mặc định + tiếng Việt)
 *   - Khóa chung cho cả cổng PlayNine: localStorage['playnine-lang'] = 'en' | 'vi'
 *   - I18N.t(key, params): tra từ điển ngôn ngữ hiện tại, thiếu thì dùng tiếng Anh, rồi đến chính khóa;
 *     {name} được thay bằng params.name; mục dạng { one, other } chọn theo params.n (số nhiều tiếng Anh)
 *   - I18N.apply(root): điền [data-i18n], [data-i18n-html], [data-i18n-attr="aria-label:key;title:key"]
 *   - I18N.set(lang): gọi I18N.beforeReload (game tự lưu ván) rồi ghi khóa và tải lại trang
 *   - Nạp trước engine.js / app.js
 * ===================================================================== */
(function () {
  'use strict';

  const LANG_KEY = 'playnine-lang';
  const LANGS = ['en', 'vi'];

  const DICT = {
    en: {
      'meta.title': 'Falling Blocks',
      'meta.description':
        'Falling Blocks: stack the falling pieces to fill horizontal lines, clear them and score. Hold, 3-piece preview, ghost piece, touch controls, auto-save.',
      'app.name': 'Falling Blocks',
      'app.version': 'Falling Blocks · version',

      'top.pause': 'Pause (P)',
      'top.resume': 'Resume (P)',
      'top.stats': 'Statistics',
      'top.settings': 'Settings',
      'top.newGame': 'New game',

      'hud.aria': 'Score',
      'hud.score': 'Score',
      'hud.best': 'Best',
      'hud.level': 'Level',
      'hud.lines': 'Lines',

      'panel.holdAria': 'Held piece',
      'panel.hold': 'Hold',
      'panel.nextAria': 'Next pieces',
      'panel.next': 'Next',
      'board.aria': 'Falling Blocks board',

      'start.sub': 'Stack the falling blocks to fill horizontal lines, clear them and score points.',
      'start.level': 'Starting level',
      'start.go': 'Start',
      'pause.title': 'Paused',
      'pause.resume': 'Resume',
      'over.record': 'New high score!',
      'over.title': 'Game over',
      'over.again': 'Play again',

      'help.move': 'Move',
      'help.soft': 'Soft drop',
      'help.hard': 'Hard drop',
      'help.cw': 'Rotate right',
      'help.ccw': 'Rotate left',
      'help.hold': 'Hold',
      'help.pause': 'Pause',

      'pad.hard': 'Hard drop',
      'pad.left': 'Move left',
      'pad.soft': 'Soft drop',
      'pad.right': 'Move right',
      'pad.hold': 'Hold',
      'pad.holdAria': 'Hold piece',
      'pad.ccw': 'Rotate left',
      'pad.cw': 'Rotate right',

      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'settings.themeAuto': 'Auto',
      'settings.themeLight': 'Light',
      'settings.themeDark': 'Dark',
      'settings.language': 'Language',
      'settings.level': 'Starting level',
      'settings.levelDesc': 'Applies from the next game. Higher levels fall faster and score more per line.',
      'settings.level1': 'Level 1',
      'settings.level5': 'Level 5',
      'settings.level10': 'Level 10',
      'settings.ghost': 'Ghost piece',
      'settings.ghostDesc': 'Show where the piece will land.',
      'settings.showPad': 'Always show touch controls',
      'settings.showPadDesc': 'By default, touch controls only appear on touch devices.',
      'settings.gestures': 'Board gestures',
      'settings.gesturesDesc':
        'Tap to rotate, drag sideways to move, drag down slowly to soft drop, swipe down fast to hard drop, swipe up to hold.',
      'settings.sound': 'Sound',
      'settings.soundDesc': 'Sound effects for moves, line clears and level-ups.',
      'settings.vibrate': 'Vibrate on line clear',
      'settings.vibrateDesc': 'Gentle vibration when clearing lines (if supported).',
      'settings.done': 'Done',

      'stats.title': 'Statistics',
      'stats.played': 'Games played',
      'stats.best': 'High score',
      'stats.mostLines': 'Most lines',
      'stats.highestLevel': 'Highest level',
      'stats.totalLines': 'Total lines',
      'stats.quads': 'Four-line clears',
      'stats.reset': 'Reset',
      'stats.resetConfirm': 'Confirm reset',
      'stats.resetDone': 'Statistics reset',
      'stats.close': 'Close',

      'confirm.title': 'Start a new game?',
      'confirm.text': 'The current game will be discarded.',
      'confirm.textDetail': 'The current game ({detail}) will be discarded.',
      'confirm.cancel': 'Cancel',

      'detail.full': 'Score {score} · level {level} · {lines}',
      'detail.rest': 'Level {level} · {lines}',
      'detail.lines': { one: '{n} line', other: '{n} lines' },
      'announce.start': 'New game started at level {level}',
      'announce.over': 'Game over. {detail}',
      'announce.overRecord': 'Game over. {detail}. New high score!',
      'announce.quad': 'Four lines! +{points} points',
      'banner.b2b': 'Back-to-back ×1.5',
      'banner.levelUp': 'Level up to {level}',
      'banner.combo': 'Combo ×{n}',
      'banner.quad': 'Four lines!',
      'banner.level': 'Level {level}',

      'summary.best': 'High score',
      'summary.mostLines': 'Most lines',
      'summary.highestLevel': 'Highest level',
      'summary.intro': 'Stack blocks to fill and clear lines, score points',
      'summary.note': 'High score {score} · {lines}',
      'summary.resumeTitle': 'Continue Falling Blocks',
      'summary.resumeDetail': 'Score {score} · level {level}',
    },
    vi: {
      'meta.title': 'Xếp Gạch',
      'meta.description':
        'Xếp Gạch: xếp các khối rơi cho kín hàng ngang để xóa hàng và ghi điểm. Giữ khối, xem trước 3 khối, bóng khối, nút bấm cảm ứng, tự lưu ván chơi.',
      'app.name': 'Xếp Gạch',
      'app.version': 'Xếp Gạch · phiên bản',

      'top.pause': 'Tạm dừng (P)',
      'top.resume': 'Tiếp tục (P)',
      'top.stats': 'Thống kê',
      'top.settings': 'Cài đặt',
      'top.newGame': 'Ván mới',

      'hud.aria': 'Điểm số',
      'hud.score': 'Điểm',
      'hud.best': 'Cao nhất',
      'hud.level': 'Cấp',
      'hud.lines': 'Hàng',

      'panel.holdAria': 'Khối đang giữ',
      'panel.hold': 'Giữ',
      'panel.nextAria': 'Các khối kế tiếp',
      'panel.next': 'Kế tiếp',
      'board.aria': 'Bàn chơi Xếp Gạch',

      'start.sub': 'Xếp các khối rơi cho kín hàng ngang để xóa hàng và ghi điểm.',
      'start.level': 'Cấp bắt đầu',
      'start.go': 'Bắt đầu',
      'pause.title': 'Tạm dừng',
      'pause.resume': 'Tiếp tục',
      'over.record': 'Kỷ lục mới!',
      'over.title': 'Hết chỗ xếp',
      'over.again': 'Chơi lại',

      'help.move': 'Di chuyển',
      'help.soft': 'Thả nhanh',
      'help.hard': 'Thả thẳng',
      'help.cw': 'Xoay phải',
      'help.ccw': 'Xoay trái',
      'help.hold': 'Giữ',
      'help.pause': 'Tạm dừng',

      'pad.hard': 'Thả thẳng',
      'pad.left': 'Sang trái',
      'pad.soft': 'Thả nhanh',
      'pad.right': 'Sang phải',
      'pad.hold': 'Giữ',
      'pad.holdAria': 'Giữ khối',
      'pad.ccw': 'Xoay trái',
      'pad.cw': 'Xoay phải',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'settings.themeAuto': 'Tự động',
      'settings.themeLight': 'Sáng',
      'settings.themeDark': 'Tối',
      'settings.language': 'Ngôn ngữ',
      'settings.level': 'Cấp bắt đầu',
      'settings.levelDesc': 'Áp dụng từ ván mới. Cấp càng cao khối rơi càng nhanh, điểm mỗi hàng càng nhiều.',
      'settings.level1': 'Cấp 1',
      'settings.level5': 'Cấp 5',
      'settings.level10': 'Cấp 10',
      'settings.ghost': 'Bóng khối',
      'settings.ghostDesc': 'Hiện chỗ khối sẽ rơi xuống.',
      'settings.showPad': 'Luôn hiện nút bấm',
      'settings.showPadDesc': 'Mặc định nút bấm chỉ hiện trên máy cảm ứng.',
      'settings.gestures': 'Cử chỉ trên bàn chơi',
      'settings.gesturesDesc':
        'Chạm để xoay, kéo ngang để di chuyển, kéo chậm xuống để thả nhanh, vuốt nhanh xuống để thả thẳng, vuốt lên để giữ khối.',
      'settings.sound': 'Âm thanh',
      'settings.soundDesc': 'Hiệu ứng âm thanh khi di chuyển, xóa hàng và lên cấp.',
      'settings.vibrate': 'Rung khi xóa hàng',
      'settings.vibrateDesc': 'Rung nhẹ khi xóa hàng (nếu máy hỗ trợ).',
      'settings.done': 'Xong',

      'stats.title': 'Thống kê',
      'stats.played': 'Ván đã chơi',
      'stats.best': 'Điểm cao nhất',
      'stats.mostLines': 'Hàng nhiều nhất',
      'stats.highestLevel': 'Cấp cao nhất',
      'stats.totalLines': 'Tổng số hàng',
      'stats.quads': 'Lần xếp 4 hàng',
      'stats.reset': 'Đặt lại',
      'stats.resetConfirm': 'Bấm lần nữa để xóa',
      'stats.resetDone': 'Đã đặt lại thống kê',
      'stats.close': 'Đóng',

      'confirm.title': 'Bắt đầu ván mới?',
      'confirm.text': 'Ván đang chơi sẽ bị bỏ.',
      'confirm.textDetail': 'Ván đang chơi ({detail}) sẽ bị bỏ.',
      'confirm.cancel': 'Hủy',

      'detail.full': 'Điểm {score} · cấp {level} · {lines}',
      'detail.rest': 'Cấp {level} · {lines}',
      'detail.lines': '{n} hàng',
      'announce.start': 'Bắt đầu ván mới từ cấp {level}',
      'announce.over': 'Hết chỗ xếp. {detail}',
      'announce.overRecord': 'Hết chỗ xếp. {detail}. Kỷ lục mới!',
      'announce.quad': 'Xếp 4 hàng! +{points} điểm',
      'banner.b2b': 'Liên tiếp ×1,5',
      'banner.levelUp': 'Lên cấp {level}',
      'banner.combo': 'Combo ×{n}',
      'banner.quad': 'Xếp 4 hàng!',
      'banner.level': 'Cấp {level}',

      'summary.best': 'Điểm cao nhất',
      'summary.mostLines': 'Hàng nhiều nhất',
      'summary.highestLevel': 'Cấp cao nhất',
      'summary.intro': 'Xếp khối cho kín hàng để xóa hàng, ghi điểm',
      'summary.note': 'Điểm cao nhất {score} · {lines}',
      'summary.resumeTitle': 'Tiếp tục Xếp Gạch',
      'summary.resumeDetail': 'Điểm {score} · cấp {level}',
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
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';
  document.documentElement.lang = lang;

  function lookup(l, key) {
    const d = DICT[l];
    return d && Object.prototype.hasOwnProperty.call(d, key) ? d[key] : undefined;
  }

  function t(key, params) {
    let s = lookup(lang, key);
    if (s === undefined) s = lookup('en', key);
    if (s === undefined) return key;
    const p = params || {};
    // Số nhiều: { one, other } chọn theo p.n (tiếng Việt không có số nhiều nên chỉ là chuỗi)
    if (s && typeof s === 'object') s = Number(p.n) === 1 && s.one !== undefined ? s.one : s.other;
    return String(s).replace(/\{(\w+)\}/g, (m, name) => (p[name] !== undefined ? String(p[name]) : m));
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
      el.getAttribute('data-i18n-attr')
        .split(';')
        .forEach((pair) => {
          const i = pair.indexOf(':');
          if (i < 1) return;
          const attr = pair.slice(0, i).trim();
          const key = pair.slice(i + 1).trim();
          if (attr && key) el.setAttribute(attr, t(key));
        });
    });
    if (r === document) {
      document.title = t('meta.title');
      const desc = document.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute('content', t('meta.description'));
      const appTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (appTitle) appTitle.setAttribute('content', t('meta.title'));
    }
  }

  const I18N = {
    lang,
    locale,
    t,
    apply,
    /** Game gán hàm lưu ván vào đây; được gọi trước mỗi lần tải lại vì đổi ngôn ngữ. */
    beforeReload: null,
    set(next) {
      if (!LANGS.includes(next)) return;
      if (typeof I18N.beforeReload === 'function') {
        try {
          I18N.beforeReload();
        } catch (e) {}
      }
      try {
        localStorage.setItem(LANG_KEY, next);
      } catch (e) {}
      if (next !== lang) location.reload();
    },
    fmtNumber(n) {
      return Number(n || 0).toLocaleString(locale);
    },
    fmtDate(d, opts) {
      return new Date(d).toLocaleString(locale, opts);
    },
  };

  // Trang khác (cổng / iframe khác) đổi ngôn ngữ: lưu ván rồi tải lại để theo
  window.addEventListener('storage', (e) => {
    if (e.key !== LANG_KEY) return;
    if (typeof I18N.beforeReload === 'function') {
      try {
        I18N.beforeReload();
      } catch (err) {}
    }
    location.reload();
  });

  window.I18N = I18N;
})();
