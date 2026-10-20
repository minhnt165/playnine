/* =====================================================================
 * Cờ Caro - Đa ngôn ngữ: tiếng Anh (mặc định) + tiếng Việt
 * Nạp trước engine.js và app.js. Dùng chung khóa localStorage 'playnine-lang'
 * với cổng PlayNine và các game khác ('en' | 'vi', thiếu hoặc sai thì 'en').
 *   I18N.t(key, params)  tra chuỗi theo ngôn ngữ hiện tại (thiếu thì lấy 'en', rồi trả lại key),
 *                        thay {tên} bằng params; chuỗi dạng { one, other } chọn số ít / nhiều theo params.n
 *   I18N.apply(root)     điền [data-i18n] (text), [data-i18n-html] (HTML tin cậy trong từ điển),
 *                        [data-i18n-attr="aria-label:key;title:key"], cùng tiêu đề và mô tả trang
 *   I18N.set(lang)       lưu ngôn ngữ rồi tải lại trang (gọi I18N.beforeReload trước để lưu ván)
 * ===================================================================== */
(function () {
  'use strict';

  var KEY = 'playnine-lang';
  var LOCALES = { en: 'en-US', vi: 'vi-VN' };

  var DICT = {
    en: {
      'meta.title': 'Gomoku',
      'meta.description': 'Gomoku on a 15x15 board: play the computer at 3 levels or a friend on one device, with the blocked-ends rule, undo, statistics and autosave.',
      'game.name': 'Gomoku',

      'top.stats': 'Statistics',
      'top.settings': 'Settings',
      'top.new': 'New game',

      'status.label': 'Game status',
      'board.label': 'Gomoku board, 15 x 15. Use the arrow keys to move and Enter to place a piece.',
      'tools.label': 'Tools',
      'tools.undo': 'Undo',
      'tools.undoKey': 'Undo (Z)',
      'tools.swap': 'Swap sides',
      'tools.swapKey': 'Swap sides (S)',
      'tools.swapAiOnly': 'Only available against the computer',
      'tools.numbers': 'Numbers',
      'tools.numbersKey': 'Show move numbers (M)',
      'tools.zoomTitle': 'Zoom the board',
      'tools.zoomIn': 'Zoom in',
      'tools.zoomOut': 'Zoom out',
      'help.rules': 'Five in a row horizontally, vertically or diagonally wins. This game: {blocked} · {overline}.',
      'help.blockedOn': 'lines blocked at both ends don\'t count',
      'help.blockedOff': 'no blocked-ends rule',
      'help.overlineOn': 'six or more also wins',
      'help.overlineOff': 'exactly five only',
      'help.keys': 'Shortcuts: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> place · <kbd>Z</kbd> undo · <kbd>N</kbd> new game · <kbd>M</kbd> move numbers · <kbd>S</kbd> swap sides',

      'mode.ai': 'vs Computer',
      'mode.pvp': 'Two players',
      'level.easy': 'Easy',
      'level.medium': 'Medium',
      'level.hard': 'Hard',

      'new.title': 'New game',
      'new.mode': 'Mode',
      'new.level': 'Computer level',
      'new.side': 'You play',
      'new.sideX': 'X · goes first',
      'new.sideO': 'O · goes second',
      'new.warning': 'The current game against the computer will count as a loss.',
      'new.rules': 'Rules: {blocked} · {overline}. Change the rules in Settings.',
      'new.blockedOn': 'blocked at both ends doesn\'t win',
      'new.blockedOff': 'no blocked-ends rule',
      'new.overlineOn': 'six still wins',
      'new.overlineOff': 'exactly five only',
      'new.start': 'Start',
      'common.cancel': 'Cancel',
      'common.close': 'Close',
      'common.done': 'Done',
      'common.ok': 'OK',

      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'settings.language': 'Language',
      'theme.auto': 'Auto',
      'theme.light': 'Light',
      'theme.dark': 'Dark',
      'settings.rules': 'Rules · apply from the next game',
      'settings.blocked': 'Block both ends',
      'settings.blockedDesc': 'A line blocked by the opponent at both ends doesn\'t win. The board edge doesn\'t count as a block.',
      'settings.overline': 'Six or more in a row also wins',
      'settings.overlineDesc': 'When off, only exactly 5 in a row wins.',
      'settings.display': 'Display',
      'settings.numbers': 'Show move numbers',
      'settings.numbersDesc': 'On a computer, hovering over a piece also shows its move number.',
      'settings.version': 'Gomoku · version',

      'stats.title': 'Statistics',
      'stats.hint': 'Games against the computer. Abandoned games count as losses.',
      'stats.level': 'Level',
      'stats.played': 'Games',
      'stats.wins': 'Won',
      'stats.lost': 'Lost',
      'stats.drawn': 'Draws',
      'stats.total': 'Total',
      'stats.reset': 'Reset',
      'stats.resetConfirm': 'Tap again to clear',

      'confirm.swapTitle': 'Swap sides?',
      'confirm.swapText': 'Swapping sides starts a new game.',
      'confirm.swapPenalty': 'Swapping sides starts a new game where you play {mark}. The current game will count as a loss.',

      'result.youWin': 'You win!',
      'result.aiWins': 'Computer wins',
      'result.markWins': '{mark} wins!',
      'result.draw': 'Draw!',
      'result.drawText': 'The board is full and nobody has five in a row.',
      'result.youWinText': 'You beat the computer on {level}.',
      'result.aiWinsText': 'The computer got five in a row. Try again!',
      'result.markText': '{mark} got five in a row.',
      'result.moves': 'Moves',
      'result.level': 'Level',
      'result.levelRecord': 'Level record',
      'result.winner': 'Winner',
      'result.mode': 'Mode',
      'result.twoPlayers': '2 players',
      'result.viewBoard': 'View board',

      'player.you': 'You',
      'player.ai': 'Computer',
      'player.mark': 'Player {mark}',
      'player.first': 'Goes first',
      'player.second': 'Goes second',
      'player.level': '{level} level',

      'turn.yours': 'Your turn',
      'turn.ai': 'Computer\'s turn',
      'turn.mark': '{mark} to move',
      'turn.thinking': 'Thinking…',
      'turn.move': 'Move {n}',
      'turn.moves': { one: '1 move', other: '{n} moves' },

      'cell.piece': '{cell}: {mark}, move {n}',
      'cell.empty': '{cell}: empty',
      'cell.last': ', last move',

      'say.newAi': 'New game against the computer, {level} level. You play {mark}.',
      'say.newPvp': 'New two-player game. X goes first.',
      'say.move': '{who} played {cell}.',
      'say.undo': 'Move undone.',

      'toast.thinking': 'The computer is thinking, please wait',
      'toast.swapFirst': 'You play {mark} (goes first)',
      'toast.swapSecond': 'You play {mark} (goes second)',
      'toast.rulesSame': 'The rules match the current game',
      'toast.rulesNext': 'New rules apply from the next game',
      'toast.statsCleared': 'Statistics cleared',

      'summary.note': 'Won {won} of {n} vs computer · {level}',
      'summary.notePvp': 'Playing two players on one device',
      'summary.noteNone': 'No games against the computer yet · {level}',
      'summary.won': 'Wins vs computer',
      'summary.rate': 'Win rate',
      'summary.level': 'Level',
      'summary.aiThinking': 'Move {n} · computer is thinking',
      'summary.yourTurn': 'Move {n} · your turn',
      'summary.markTurn': 'Move {n} · {mark} to move',
      'summary.titleAi': 'Gomoku vs computer · {level}',
      'summary.titlePvp': 'Gomoku · two players',
    },
    vi: {
      'meta.title': 'Cờ Caro',
      'meta.description': 'Cờ Caro 15x15 tiếng Việt: đấu máy 3 mức hoặc hai người trên một máy, luật chặn hai đầu, đi lại, thống kê, tự lưu ván.',
      'game.name': 'Cờ Caro',

      'top.stats': 'Thống kê',
      'top.settings': 'Cài đặt',
      'top.new': 'Ván mới',

      'status.label': 'Trạng thái ván',
      'board.label': 'Bàn cờ caro 15 x 15. Dùng phím mũi tên để di chuyển, Enter để đặt quân.',
      'tools.label': 'Công cụ',
      'tools.undo': 'Đi lại',
      'tools.undoKey': 'Đi lại (Z)',
      'tools.swap': 'Đổi bên',
      'tools.swapKey': 'Đổi bên (S)',
      'tools.swapAiOnly': 'Chỉ dùng khi đấu với máy',
      'tools.numbers': 'Số nước',
      'tools.numbersKey': 'Hiện số nước (M)',
      'tools.zoomTitle': 'Phóng to bàn cờ',
      'tools.zoomIn': 'Phóng to',
      'tools.zoomOut': 'Thu nhỏ',
      'help.rules': 'Năm quân liên tiếp theo hàng, cột hoặc đường chéo là thắng. Ván này: {blocked} · {overline}.',
      'help.blockedOn': 'chặn hai đầu không tính',
      'help.blockedOff': 'không xét chặn hai đầu',
      'help.overlineOn': 'sáu quân trở lên vẫn thắng',
      'help.overlineOff': 'chỉ đúng năm quân',
      'help.keys': 'Phím tắt: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> di chuyển · <kbd>Enter</kbd> đặt quân · <kbd>Z</kbd> đi lại · <kbd>N</kbd> ván mới · <kbd>M</kbd> số nước · <kbd>S</kbd> đổi bên',

      'mode.ai': 'Người vs Máy',
      'mode.pvp': 'Hai người',
      'level.easy': 'Dễ',
      'level.medium': 'Vừa',
      'level.hard': 'Khó',

      'new.title': 'Ván mới',
      'new.mode': 'Chế độ',
      'new.level': 'Mức máy',
      'new.side': 'Bạn cầm quân',
      'new.sideX': 'X · đi trước',
      'new.sideO': 'O · đi sau',
      'new.warning': 'Ván đang chơi với máy sẽ bị tính là thua.',
      'new.rules': 'Luật: {blocked} · {overline}. Đổi luật trong Cài đặt.',
      'new.blockedOn': 'chặn hai đầu',
      'new.blockedOff': 'không chặn hai đầu',
      'new.overlineOn': 'sáu quân vẫn thắng',
      'new.overlineOff': 'chỉ đúng năm quân',
      'new.start': 'Bắt đầu',
      'common.cancel': 'Hủy',
      'common.close': 'Đóng',
      'common.done': 'Xong',
      'common.ok': 'Đồng ý',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'settings.language': 'Ngôn ngữ',
      'theme.auto': 'Tự động',
      'theme.light': 'Sáng',
      'theme.dark': 'Tối',
      'settings.rules': 'Luật chơi · áp dụng từ ván mới',
      'settings.blocked': 'Chặn hai đầu',
      'settings.blockedDesc': 'Dãy quân bị quân đối phương chặn cả hai đầu thì không tính thắng. Mép bàn không tính là chặn.',
      'settings.overline': 'Sáu quân trở lên vẫn thắng',
      'settings.overlineDesc': 'Tắt thì chỉ đúng 5 quân liên tiếp mới thắng.',
      'settings.display': 'Hiển thị',
      'settings.numbers': 'Hiện số thứ tự nước đi',
      'settings.numbersDesc': 'Trên máy tính, rê chuột lên quân cờ cũng thấy số nước.',
      'settings.version': 'Cờ Caro · phiên bản',

      'stats.title': 'Thống kê',
      'stats.hint': 'Các ván đấu với máy. Ván bỏ dở giữa chừng tính là thua.',
      'stats.level': 'Mức',
      'stats.played': 'Ván',
      'stats.wins': 'Thắng',
      'stats.lost': 'Thua',
      'stats.drawn': 'Hòa',
      'stats.total': 'Tổng',
      'stats.reset': 'Đặt lại',
      'stats.resetConfirm': 'Nhấn lần nữa để xóa',

      'confirm.swapTitle': 'Đổi bên?',
      'confirm.swapText': 'Đổi bên sẽ bắt đầu ván mới.',
      'confirm.swapPenalty': 'Đổi bên sẽ bắt đầu ván mới, bạn cầm quân {mark}. Ván đang chơi sẽ bị tính là thua.',

      'result.youWin': 'Bạn thắng!',
      'result.aiWins': 'Máy thắng',
      'result.markWins': '{mark} thắng!',
      'result.draw': 'Hòa!',
      'result.drawText': 'Bàn cờ đã kín mà chưa ai có năm quân.',
      'result.youWinText': 'Bạn đã thắng máy mức {level}.',
      'result.aiWinsText': 'Máy đã xếp được năm quân. Thử lại nhé!',
      'result.markText': 'Quân {mark} xếp được năm quân liên tiếp.',
      'result.moves': 'Số nước',
      'result.level': 'Mức',
      'result.levelRecord': 'Thắng mức này',
      'result.winner': 'Người thắng',
      'result.mode': 'Chế độ',
      'result.twoPlayers': '2 người',
      'result.viewBoard': 'Xem bàn cờ',

      'player.you': 'Bạn',
      'player.ai': 'Máy',
      'player.mark': 'Quân {mark}',
      'player.first': 'Đi trước',
      'player.second': 'Đi sau',
      'player.level': 'Mức {level}',

      'turn.yours': 'Đến lượt bạn',
      'turn.ai': 'Lượt máy',
      'turn.mark': 'Lượt {mark}',
      'turn.thinking': 'Máy đang nghĩ…',
      'turn.move': 'Nước {n}',
      'turn.moves': '{n} nước',

      'cell.piece': '{cell}: quân {mark}, nước {n}',
      'cell.empty': '{cell}: trống',
      'cell.last': ', nước vừa đi',

      'say.newAi': 'Ván mới với máy, mức {level}. Bạn cầm quân {mark}.',
      'say.newPvp': 'Ván mới hai người. Quân X đi trước.',
      'say.move': '{who} đi {cell}.',
      'say.undo': 'Đã đi lại.',

      'toast.thinking': 'Máy đang nghĩ, chờ chút nhé',
      'toast.swapFirst': 'Bạn cầm quân {mark} (đi trước)',
      'toast.swapSecond': 'Bạn cầm quân {mark} (đi sau)',
      'toast.rulesSame': 'Luật đã khớp với ván đang chơi',
      'toast.rulesNext': 'Luật mới áp dụng từ ván sau',
      'toast.statsCleared': 'Đã xóa thống kê',

      'summary.note': 'Thắng máy {won}/{n} ván · mức {level}',
      'summary.notePvp': 'Đang chơi hai người trên một máy',
      'summary.noteNone': 'Chưa đấu máy ván nào · mức {level}',
      'summary.won': 'Thắng máy',
      'summary.rate': 'Tỉ lệ thắng',
      'summary.level': 'Mức',
      'summary.aiThinking': 'Nước {n} · máy đang nghĩ',
      'summary.yourTurn': 'Nước {n} · đến lượt bạn',
      'summary.markTurn': 'Nước {n} · lượt {mark}',
      'summary.titleAi': 'Caro với máy · {level}',
      'summary.titlePvp': 'Caro hai người',
    },
  };

  function readLang() {
    try {
      var v = localStorage.getItem(KEY);
      return v === 'vi' || v === 'en' ? v : 'en';
    } catch (e) { return 'en'; }
  }
  var lang = readLang();
  document.documentElement.lang = lang;

  function t(key, params) {
    var s = DICT[lang][key];
    if (s == null) s = DICT.en[key];
    if (s == null) return key;
    if (typeof s === 'object') s = params && params.n === 1 && s.one != null ? s.one : s.other;
    if (!params) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return params[k] != null ? String(params[k]) : m; });
  }

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
      if (app) app.setAttribute('content', t('meta.title'));
    }
  }

  function fmtNumber(n, opts) {
    try { return new Intl.NumberFormat(LOCALES[lang], opts).format(n); } catch (e) { return String(n); }
  }
  function fmtDate(d, opts) {
    try { return new Intl.DateTimeFormat(LOCALES[lang], opts).format(d instanceof Date ? d : new Date(d)); } catch (e) { return String(d); }
  }

  var api = {
    lang: lang,
    locale: LOCALES[lang],
    t: t,
    apply: apply,
    set: set,
    fmtNumber: fmtNumber,
    fmtDate: fmtDate,
    beforeReload: null, // app.js gán hàm lưu ván để gọi trước khi tải lại trang
  };

  function reload() {
    if (typeof api.beforeReload === 'function') { try { api.beforeReload(); } catch (e) {} }
    location.reload();
  }
  function set(next) {
    if (next !== 'en' && next !== 'vi') return;
    try { localStorage.setItem(KEY, next); } catch (e) {}
    if (next !== lang) reload();
  }

  // Cổng hoặc trang khác đổi ngôn ngữ: tải lại để theo
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && readLang() !== lang) reload();
  });

  window.I18N = api;
})();
