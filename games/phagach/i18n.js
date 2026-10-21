/* =====================================================================
 * Phá Gạch - Đa ngôn ngữ (tiếng Anh mặc định + tiếng Việt)
 *   - Ngôn ngữ dùng chung cho cả cổng PlayNine: localStorage['playnine-lang'] = 'en' | 'vi'
 *   - I18N.t(key, params): tra từ điển ngôn ngữ hiện tại, thiếu thì lấy tiếng Anh, rồi tới chính key
 *   - I18N.apply(root): điền chữ cho [data-i18n], [data-i18n-html], [data-i18n-attr]
 *   - Đổi ngôn ngữ ở trang khác (cổng / iframe) thì trang này tự tải lại theo
 * ===================================================================== */
(function () {
  'use strict';

  var KEY = 'playnine-lang';

  var DICT = {
    en: {
      'meta.title': 'Brick Breaker',
      'meta.appTitle': 'Brick Breaker',
      'meta.description': 'Brick Breaker: bounce the ball with the paddle and clear the brick walls across 10 levels. Tough bricks, steel bricks, 5 power-ups, swipe or use mouse / keyboard, autosave.',
      'app.name': 'Brick Breaker',

      // Thanh trên + bảng điểm
      'top.help': 'How to play',
      'top.helpKey': 'How to play (H)',
      'top.stats': 'Statistics',
      'top.settings': 'Settings',
      'btn.new': 'New game',
      'btn.newKey': 'New game (N)',
      'hud.label': 'Score',
      'hud.score': 'Score',
      'hud.best': 'Best',
      'hud.level': 'Level',
      'btn.pause': 'Pause',
      'btn.resume': 'Resume',
      'btn.keySuffix': '{label} (P)',
      'board.role': 'brick breaker board',
      'board.label': 'Brick Breaker board. Left and right arrows or A and D to move the paddle, Space to launch the ball, P to pause.',
      'ready.touch': 'Tap to launch',
      'ready.keys': '<kbd>Space</kbd> or click to launch',
      'help.touch': 'Drag anywhere to move the paddle · tap to launch',
      'help.keys': 'Mouse or <kbd>←</kbd><kbd>→</kbd> / <kbd>A</kbd><kbd>D</kbd> move · <kbd>Space</kbd> launch · <kbd>P</kbd> pause',

      // Lớp phủ
      'start.sub': 'Bounce the ball with the paddle and clear every brick to advance. 10 levels, tough bricks, steel bricks and 5 power-ups.',
      'start.go': 'Start',
      'start.best': 'Best: <b>{score}</b> pts · level <b>{level}</b>',
      'pause.title': 'Paused',
      'pause.hint': 'Press <kbd>P</kbd> or <kbd>Space</kbd> to resume',
      'over.title': 'Game over',
      'over.record': 'New record!',
      'over.score': 'Score',
      'over.level': 'Level',
      'over.bricks': 'Bricks',
      'over.again': 'Play again',
      'detail': { one: 'Level {level} · {score} pts · 1 life', other: 'Level {level} · {score} pts · {n} lives' },

      // Trên sân (canvas + dòng chữ vào màn / qua màn)
      'canvas.combo': 'Combo x{n}',
      'banner.level': 'Level {n}',
      'banner.loop': ' · loop {n}',
      'banner.won': 'All 10 levels cleared!',
      'banner.cleared': 'Level {n} cleared!',
      'banner.bonus': '+{n} bonus points',
      'level.1': 'Warm-up',
      'level.2': 'Pyramid',
      'level.3': 'Tough Bricks',
      'level.4': 'Steel Wall',
      'level.5': 'Checkerboard',
      'level.6': 'Fortress',
      'level.7': 'Lattice',
      'level.8': 'Heart',
      'level.9': 'Corridor',
      'level.10': 'Citadel',
      'power.wide': 'Wide paddle',
      'power.multi': 'Multi-ball',
      'power.slow': 'Slow ball',
      'power.fire': 'Fireball',
      'power.life': 'Extra life',
      'power.expired': '{name} ended',

      // Thông báo cho trình đọc màn hình
      'say.newGame': 'New game, level 1. Press Space or tap to launch the ball.',
      'say.paused': 'Paused',
      'say.over': 'Game over. Score {score}, reached level {level}',
      'say.overRecord': '. New record!',
      'say.level': 'Level {n}: {name}. Press Space or tap to launch the ball.',
      'say.won': 'All 10 levels cleared! ',
      'say.cleared': 'Level {n} cleared. ',
      'say.bonus': 'Bonus {n} points.',
      'say.lifeLost': { one: 'Lost a life, 1 life left. Press Space or tap to launch the ball.', other: 'Lost a life, {n} lives left. Press Space or tap to launch the ball.' },

      // Tóm tắt cho cổng PlayNine
      'sum.best': 'Best score',
      'sum.level': 'Highest level',
      'sum.bricks': 'Bricks broken',
      'sum.note': 'Bounce the ball, clear the bricks through 10 levels',
      'sum.noteBest': 'Best score {score} · reached level {level}',
      'sum.resume': 'Continue Brick Breaker',

      // Cách chơi
      'help.title': 'How to play',
      'btn.close': 'Close',
      'help.intro': 'Bounce the ball with the paddle at the bottom and smash <b>every brick</b> to clear the level. If the ball falls past the bottom you lose a life; you start with <b>3 lives</b>.',
      'help.controls': 'Controls',
      'help.phone': '<b>Phone:</b> drag sideways anywhere on the board and the paddle follows the drag (no need to touch the paddle itself). Tap to launch the ball.',
      'help.computer': '<b>Computer:</b> move the mouse, or <kbd>←</kbd><kbd>→</kbd> / <kbd>A</kbd><kbd>D</kbd>. <kbd>Space</kbd> or click to launch, <kbd>P</kbd> / <kbd>Esc</kbd> to pause.',
      'help.aim': 'A ball that hits the <b>middle of the paddle</b> goes straight up; <b>near the edge</b> it bounces off at an angle. Use the edges to steer.',
      'help.bricks': 'Bricks',
      'help.brickNormal': '<b>Normal brick</b>: breaks in 1 hit.',
      'help.brickTough': '<b>Tough brick</b>: takes 2 or 3 hits, cracking a little more each time.',
      'help.brickSteel': '<b>Steel brick</b>: unbreakable, and not needed to clear the level.',
      'help.powers': 'Power-ups',
      'help.powersIntro': 'Some bricks drop a power-up when they break. Catch it with the paddle; the time left shows at the top right.',
      'help.pwWide': '<b>Wide paddle</b>: a longer paddle for 15 seconds.',
      'help.pwMulti': '<b>Multi-ball</b>: every ball splits into three. As long as one ball is still in play, you keep your life.',
      'help.pwSlow': '<b>Slow ball</b>: the ball slows down for 12 seconds.',
      'help.pwFire': '<b>Fireball</b>: for 8 seconds the ball smashes any brick at once (tough ones too) and passes through, bouncing only off steel.',
      'help.pwLife': '<b>Extra life</b>: +1 life (max 5).',
      'help.scoring': 'Scoring',
      'help.score1': 'Normal brick 10 points, tough brick 30 / 50 points, catching a power-up 25 points. Clearing a level earns 100 × the level number.',
      'help.score2': '<b>Combo:</b> keep breaking bricks before the ball comes back to the paddle and points are multiplied x2 from the 5th brick, x3 from the 9th... up to x5.',
      'help.score3': 'Clear all 10 levels to <b>beat the game</b>; play then loops back to level 1 with a faster ball.',
      'help.play': "Let's play!",

      // Cài đặt
      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'settings.themeAuto': 'Auto',
      'settings.themeLight': 'Light',
      'settings.themeDark': 'Dark',
      'settings.lang': 'Language',
      'settings.sens': 'Drag sensitivity',
      'settings.sensDesc': 'How far the paddle moves when you drag your finger (on touch screens).',
      'settings.sensLow': 'Low',
      'settings.sensNormal': 'Medium',
      'settings.sensHigh': 'High',
      'settings.vibrate': 'Vibration',
      'settings.vibrateDesc': 'Vibrate gently when you catch a power-up, clear a level or lose a life (if supported).',
      'settings.sound': 'Sound',
      'settings.soundDesc': 'Sound effects for bounces, breaking bricks, power-ups and clearing levels.',
      'settings.replayHelp': 'Show how to play',
      'settings.done': 'Done',
      'settings.version': 'Brick Breaker · version',

      // Thống kê
      'stats.title': 'Statistics',
      'stats.played': 'Games played',
      'stats.best': 'Best score',
      'stats.level': 'Highest level',
      'stats.bricks': 'Bricks broken',
      'stats.chain': 'Best combo',
      'stats.won': 'Full clears',
      'stats.reset': 'Reset',
      'stats.resetConfirm': 'Tap again to clear',
      'toast.statsReset': 'Statistics reset',

      // Xác nhận ván mới
      'confirm.title': 'Start a new game?',
      'confirm.text': 'The current game will be abandoned.',
      'confirm.textDetail': 'The current game ({detail}) will be abandoned.',
      'btn.cancel': 'Cancel',
    },

    vi: {
      'meta.title': 'Phá Gạch',
      'meta.appTitle': 'Phá Gạch',
      'meta.description': 'Phá Gạch: đỡ bóng bằng thanh trượt, phá hết tường gạch qua 10 màn. Gạch cứng, gạch thép, 5 loại vật phẩm, kéo ngang hoặc dùng chuột / bàn phím, tự lưu ván chơi.',
      'app.name': 'Phá Gạch',

      'top.help': 'Cách chơi',
      'top.helpKey': 'Cách chơi (H)',
      'top.stats': 'Thống kê',
      'top.settings': 'Cài đặt',
      'btn.new': 'Ván mới',
      'btn.newKey': 'Ván mới (N)',
      'hud.label': 'Điểm số',
      'hud.score': 'Điểm',
      'hud.best': 'Cao nhất',
      'hud.level': 'Màn',
      'btn.pause': 'Tạm dừng',
      'btn.resume': 'Tiếp tục',
      'btn.keySuffix': '{label} (P)',
      'board.role': 'bàn chơi phá gạch',
      'board.label': 'Bàn chơi Phá Gạch. Phím mũi tên trái phải hoặc A D để di chuyển thanh, Space để phóng bóng, P để tạm dừng.',
      'ready.touch': 'Chạm để phóng bóng',
      'ready.keys': '<kbd>Space</kbd> hoặc nhấp chuột để phóng bóng',
      'help.touch': 'Kéo ngang ở bất kỳ đâu để di chuyển thanh · chạm để phóng bóng',
      'help.keys': 'Chuột hoặc <kbd>←</kbd><kbd>→</kbd> / <kbd>A</kbd><kbd>D</kbd> di chuyển · <kbd>Space</kbd> phóng bóng · <kbd>P</kbd> tạm dừng',

      'start.sub': 'Đỡ bóng bằng thanh trượt, phá hết gạch để qua màn. 10 màn, gạch cứng, gạch thép và 5 loại vật phẩm.',
      'start.go': 'Bắt đầu',
      'start.best': 'Kỷ lục: <b>{score}</b> điểm · tới màn <b>{level}</b>',
      'pause.title': 'Tạm dừng',
      'pause.hint': 'Nhấn <kbd>P</kbd> hoặc <kbd>Space</kbd> để chơi tiếp',
      'over.title': 'Hết mạng',
      'over.record': 'Kỷ lục mới!',
      'over.score': 'Điểm',
      'over.level': 'Tới màn',
      'over.bricks': 'Gạch phá',
      'over.again': 'Chơi lại',
      'detail': 'Màn {level} · {score} điểm · {n} mạng',

      'canvas.combo': 'Chuỗi x{n}',
      'banner.level': 'Màn {n}',
      'banner.loop': ' · vòng {n}',
      'banner.won': 'Phá đảo 10 màn!',
      'banner.cleared': 'Qua màn {n}!',
      'banner.bonus': '+{n} điểm thưởng',
      'level.1': 'Khởi động',
      'level.2': 'Kim tự tháp',
      'level.3': 'Gạch cứng',
      'level.4': 'Tường thép',
      'level.5': 'Bàn cờ',
      'level.6': 'Pháo đài',
      'level.7': 'Mắt lưới',
      'level.8': 'Trái tim',
      'level.9': 'Hành lang',
      'level.10': 'Thành trì',
      'power.wide': 'Mở rộng thanh',
      'power.multi': 'Nhiều bóng',
      'power.slow': 'Bóng chậm',
      'power.fire': 'Bóng xuyên',
      'power.life': 'Thêm mạng',
      'power.expired': 'Hết {name}',

      'say.newGame': 'Ván mới, màn 1. Bấm Space hoặc chạm để phóng bóng.',
      'say.paused': 'Tạm dừng',
      'say.over': 'Hết mạng. Điểm {score}, tới màn {level}',
      'say.overRecord': '. Kỷ lục mới!',
      'say.level': 'Màn {n}: {name}. Bấm Space hoặc chạm để phóng bóng.',
      'say.won': 'Phá đảo 10 màn! ',
      'say.cleared': 'Qua màn {n}. ',
      'say.bonus': 'Thưởng {n} điểm.',
      'say.lifeLost': 'Mất một mạng, còn {n} mạng. Bấm Space hoặc chạm để phóng bóng.',

      'sum.best': 'Điểm cao nhất',
      'sum.level': 'Màn cao nhất',
      'sum.bricks': 'Gạch đã phá',
      'sum.note': 'Đỡ bóng, phá hết gạch qua 10 màn',
      'sum.noteBest': 'Điểm cao nhất {score} · tới màn {level}',
      'sum.resume': 'Tiếp tục Phá Gạch',

      'help.title': 'Cách chơi',
      'btn.close': 'Đóng',
      'help.intro': 'Đỡ bóng bằng thanh trượt ở đáy, đập vỡ <b>hết gạch</b> để qua màn. Bóng rơi khỏi đáy là mất một mạng; ván có <b>3 mạng</b>.',
      'help.controls': 'Điều khiển',
      'help.phone': '<b>Điện thoại:</b> kéo ngang ở bất kỳ đâu trên bàn chơi, thanh đi theo khoảng kéo (không cần chạm đúng thanh). Chạm nhẹ để phóng bóng.',
      'help.computer': '<b>Máy tính:</b> rê chuột, hoặc <kbd>←</kbd><kbd>→</kbd> / <kbd>A</kbd><kbd>D</kbd>. <kbd>Space</kbd> hoặc nhấp chuột để phóng bóng, <kbd>P</kbd> / <kbd>Esc</kbd> tạm dừng.',
      'help.aim': 'Bóng chạm <b>giữa thanh</b> thì bay thẳng lên, chạm <b>gần mép</b> thì nảy xiên. Dùng mép thanh để lái bóng.',
      'help.bricks': 'Các loại gạch',
      'help.brickNormal': '<b>Gạch thường</b>: vỡ sau 1 lần đập.',
      'help.brickTough': '<b>Gạch cứng</b>: cần 2 hoặc 3 lần đập, nứt dần sau mỗi lần.',
      'help.brickSteel': '<b>Gạch thép</b>: không vỡ, không cần phá để qua màn.',
      'help.powers': 'Vật phẩm',
      'help.powersIntro': 'Một số viên gạch vỡ ra rơi vật phẩm. Đỡ bằng thanh để nhận; thời gian còn lại hiện ở góc trên phải.',
      'help.pwWide': '<b>Mở rộng thanh</b>: thanh dài hơn trong 15 giây.',
      'help.pwMulti': '<b>Nhiều bóng</b>: mỗi quả bóng tách thành ba. Còn một quả trên sân là chưa mất mạng.',
      'help.pwSlow': '<b>Bóng chậm</b>: bóng chậm lại trong 12 giây.',
      'help.pwFire': '<b>Bóng xuyên</b>: trong 8 giây bóng phá ngay mọi gạch (kể cả gạch cứng) và xuyên qua, chỉ nảy ở thép.',
      'help.pwLife': '<b>Thêm mạng</b>: +1 mạng (tối đa 5).',
      'help.scoring': 'Điểm',
      'help.score1': 'Gạch thường 10 điểm, gạch cứng 30 / 50 điểm, đỡ được vật phẩm 25 điểm. Qua màn thưởng 100 x số màn.',
      'help.score2': '<b>Chuỗi:</b> đập gạch liên tiếp mà bóng chưa về thanh thì điểm nhân x2 từ viên thứ 5, x3 từ viên thứ 9... tối đa x5.',
      'help.score3': 'Qua hết 10 màn là <b>phá đảo</b>; trò chơi quay lại màn 1 với bóng nhanh hơn.',
      'help.play': 'Chơi thôi!',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'settings.themeAuto': 'Tự động',
      'settings.themeLight': 'Sáng',
      'settings.themeDark': 'Tối',
      'settings.lang': 'Ngôn ngữ',
      'settings.sens': 'Độ nhạy khi kéo',
      'settings.sensDesc': 'Kéo ngón tay một đoạn thì thanh đi xa bao nhiêu (trên màn hình cảm ứng).',
      'settings.sensLow': 'Chậm',
      'settings.sensNormal': 'Vừa',
      'settings.sensHigh': 'Nhanh',
      'settings.vibrate': 'Rung',
      'settings.vibrateDesc': 'Rung nhẹ khi đỡ vật phẩm, qua màn và mất mạng (nếu máy hỗ trợ).',
      'settings.sound': 'Âm thanh',
      'settings.soundDesc': 'Hiệu ứng âm thanh khi bóng nảy, phá gạch, đỡ vật phẩm và qua màn.',
      'settings.replayHelp': 'Xem lại cách chơi',
      'settings.done': 'Xong',
      'settings.version': 'Phá Gạch · phiên bản',

      'stats.title': 'Thống kê',
      'stats.played': 'Ván đã chơi',
      'stats.best': 'Điểm cao nhất',
      'stats.level': 'Màn cao nhất',
      'stats.bricks': 'Gạch đã phá',
      'stats.chain': 'Chuỗi dài nhất',
      'stats.won': 'Lần phá đảo',
      'stats.reset': 'Đặt lại',
      'stats.resetConfirm': 'Bấm lần nữa để xóa',
      'toast.statsReset': 'Đã đặt lại thống kê',

      'confirm.title': 'Bắt đầu ván mới?',
      'confirm.text': 'Ván đang chơi sẽ bị bỏ.',
      'confirm.textDetail': 'Ván đang chơi ({detail}) sẽ bị bỏ.',
      'btn.cancel': 'Hủy',
    },
  };

  var lang = 'en';
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'vi') lang = saved;
  } catch (e) { /* bỏ qua: bộ nhớ bị chặn thì dùng tiếng Anh */ }
  document.documentElement.lang = lang;
  var LOCALE = lang === 'vi' ? 'vi-VN' : 'en-US';

  function lookup(key) {
    var d = DICT[lang];
    if (d && Object.prototype.hasOwnProperty.call(d, key)) return d[key];
    if (Object.prototype.hasOwnProperty.call(DICT.en, key)) return DICT.en[key];
    return key;
  }

  /** Lấy chuỗi theo key, thay {tên} bằng params; giá trị dạng { one, other } chọn theo params.n. */
  function t(key, params) {
    var s = lookup(key);
    if (s && typeof s === 'object') s = params && params.n === 1 && s.one != null ? s.one : s.other;
    s = String(s);
    if (params) {
      s = s.replace(/\{(\w+)\}/g, function (m, k) {
        return Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m;
      });
    }
    return s;
  }

  /** Điền chữ cho các phần tử có data-i18n / data-i18n-html / data-i18n-attr trong root. */
  function apply(root) {
    root = root || document;
    var i, els;
    els = root.querySelectorAll('[data-i18n]');
    for (i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-i18n'));
    els = root.querySelectorAll('[data-i18n-html]');
    for (i = 0; i < els.length; i++) els[i].innerHTML = t(els[i].getAttribute('data-i18n-html'));
    els = root.querySelectorAll('[data-i18n-attr]');
    for (i = 0; i < els.length; i++) {
      var pairs = els[i].getAttribute('data-i18n-attr').split(';');
      for (var j = 0; j < pairs.length; j++) {
        var p = pairs[j].split(':');
        if (p.length === 2 && p[0].trim()) els[i].setAttribute(p[0].trim(), t(p[1].trim()));
      }
    }
    if (root === document) {
      document.title = t('meta.title');
      var desc = document.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute('content', t('meta.description'));
      var app = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (app) app.setAttribute('content', t('meta.appTitle'));
    }
  }

  function saveBeforeReload() {
    if (typeof I18N.onBeforeReload === 'function') {
      try { I18N.onBeforeReload(); } catch (e) { /* bỏ qua */ }
    }
  }

  /** Đổi ngôn ngữ: lưu khóa dùng chung rồi tải lại trang (game đã tự lưu ván trước đó). */
  function set(next) {
    if (next !== 'en' && next !== 'vi') return;
    if (next === lang) return;
    saveBeforeReload();
    try { localStorage.setItem(KEY, next); } catch (e) { /* bỏ qua */ }
    location.reload();
  }

  var I18N = {
    lang: lang,
    locale: LOCALE,
    t: t,
    apply: apply,
    set: set,
    onBeforeReload: null,
    fmtNumber: function (n) { return Number(n || 0).toLocaleString(LOCALE); },
    fmtDate: function (d, opts) { return d.toLocaleDateString(LOCALE, opts); },
  };

  // Cổng hoặc trang khác đổi ngôn ngữ: tải lại để theo
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    var v = e.newValue === 'vi' ? 'vi' : 'en';
    if (v === lang) return;
    saveBeforeReload();
    location.reload();
  });

  window.I18N = I18N;
})();
