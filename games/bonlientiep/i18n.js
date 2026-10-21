/* =====================================================================
 * Bốn Liên Tiếp - Đa ngôn ngữ: tiếng Anh (mặc định) + tiếng Việt
 *   - Ngôn ngữ dùng chung cả PlayNine: localStorage['playnine-lang'] = 'en' | 'vi'
 *   - I18N.t(key, params): tra từ điển, thiếu thì lấy tiếng Anh, thiếu nữa thì trả về key;
 *     {tên} thay bằng params.tên; giá trị dạng { one, other } chọn số ít / số nhiều theo params.n
 *   - I18N.apply(root): điền [data-i18n], [data-i18n-html], [data-i18n-attr="attr:key;attr:key"]
 *   - I18N.set(lang): lưu ngôn ngữ rồi tải lại trang (ván đã được lưu trước đó)
 *   - Trang khác (cổng, iframe khác) đổi ngôn ngữ thì trang này tải lại theo
 * ===================================================================== */
var I18N = (() => {
  'use strict';

  const KEY = 'playnine-lang';
  const LOCALE = { en: 'en-US', vi: 'vi-VN' };

  const DICT = {
    en: {
      'meta.title': 'Four in a Row',
      'meta.description': 'Four in a Row: drop discs into 7 columns and line up 4 horizontally, vertically or diagonally to win. Play the computer at 3 levels or with two players, with an illustrated guide and autosave.',
      'app.name': 'Four in a Row',

      'btn.help': 'How to play',
      'btn.helpKey': 'How to play (H)',
      'btn.stats': 'Statistics',
      'btn.settings': 'Settings',
      'btn.undo': 'Undo',
      'btn.undoKey': 'Undo (Z)',
      'btn.new': 'New game',
      'btn.newKey': 'New game (N)',
      'btn.close': 'Close',
      'btn.cancel': 'Cancel',
      'btn.start': 'Start',
      'btn.prev': 'Back',
      'btn.next': 'Next',
      'btn.letsPlay': "Let's play!",
      'btn.done': 'Done',
      'btn.reset': 'Reset',
      'btn.resetConfirm': 'Tap again to clear',
      'btn.viewBoard': 'View board',
      'btn.playAgain': 'Play again',

      'board.label': 'Board with 7 columns. Use the left and right arrow keys to pick a column, Enter or the down arrow to drop a disc, or press 1 to 7.',
      'log.title': 'Moves',
      'log.label': 'Move log, newest first',
      'log.empty': 'No moves yet.',
      'controls.label': 'Controls',
      'kbd.hint': 'Shortcuts: <kbd>←</kbd><kbd>→</kbd> pick column · <kbd>Enter</kbd> / <kbd>↓</kbd> drop disc · <kbd>1</kbd>–<kbd>7</kbd> drop straight into a column · <kbd>Z</kbd> undo · <kbd>N</kbd> new game · <kbd>H</kbd> how to play',

      'new.title': 'New game',
      'new.warning': "The current game will be abandoned and won't count toward your statistics.",
      'new.mode': 'Mode',
      'new.modeAi': 'vs Computer',
      'new.modePvp': 'Two players',
      'new.level': 'Computer level',
      'new.first': 'First move',
      'new.firstYou': 'You go first',
      'new.firstAi': 'Computer goes first',
      'new.pvpDesc': 'Two players take turns on the same device. Player 1 plays yellow and moves first.',
      'new.aiDesc': 'You always play yellow; the computer plays red.',

      'level.easy': 'Easy',
      'level.medium': 'Medium',
      'level.hard': 'Hard',
      'levelDesc.easy': 'The computer looks only 1–2 moves ahead, often strays and sometimes forgets to block. Good for getting started.',
      'levelDesc.medium': 'The computer looks 6 moves ahead and always blocks your immediate winning threats.',
      'levelDesc.hard': 'The computer searches as deep as it can in about 1.5 seconds per move. Very hard to beat.',

      'help.title': 'How to play',
      'help.steps': 'Steps',
      'help.step': 'Step {i}/{n}',
      'help.dot': 'Step {i}',
      'help.1.title': 'Drop a disc into a column',
      'help.1.text': 'The board has <b>7 columns and 6 rows</b>. On your turn, tap a column: the disc <b>falls to the lowest empty cell</b> in it. Keyboard: <b>←</b> <b>→</b> pick a column, <b>Enter</b> or <b>↓</b> to drop, or press <b>1</b>–<b>7</b>.',
      'help.1.alt': 'A yellow disc above column 4 falls to the lowest empty cell, right on top of a red disc',
      'help.2.title': 'Connect four to win',
      'help.2.text': 'Line up <b>4 discs of the same color</b> horizontally, vertically or diagonally to win at once. Against the computer you play <b>yellow</b> and the computer plays <b>red</b>.',
      'help.2.alt': 'Four yellow discs connected diagonally from column 2 up to column 5',
      'help.3.title': 'Block your opponent',
      'help.3.text': 'Does your opponent have <b>3 in a row</b> with a reachable fourth cell? Drop into that column right away to <b>block</b> it. Medium and Hard never miss this move.',
      'help.3.alt': 'Three red discs in a row on the bottom row; yellow drops into column 5 to block',
      'help.4.title': "Don't set up your opponent",
      'help.4.text': "If the cell your opponent needs is <b>right above</b> an empty cell, don't drop into that empty cell: your disc would become the <b>stepping stone</b> they drop onto to win.",
      'help.4.alt': 'Three red discs on the second row; the fourth cell needs a disc beneath it, and the cell below is crossed out',
      'help.5.title': 'Draws and tips',
      'help.5.text': "If all <b>42 cells</b> fill up and nobody has four, it's a <b>draw</b>. Tips: hold the <b>center column</b> (it lies on the most lines of four) and create <b>two winning spots at once</b> so your opponent can't block both.",
      'help.5.alt': 'Three yellow discs in the middle of the bottom row with both ends open, so the opponent can block only one end',

      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'settings.themeAuto': 'Auto',
      'settings.themeLight': 'Light',
      'settings.themeDark': 'Dark',
      'settings.lang': 'Language',
      'settings.speed': 'Drop speed',
      'settings.speedSlow': 'Slow',
      'settings.speedMedium': 'Medium',
      'settings.speedFast': 'Fast',
      'settings.speedOff': 'Off',
      'settings.speedDesc': 'When off, discs appear in place instantly with no drop animation.',
      'settings.sound': 'Sound',
      'settings.soundOn': 'On',
      'settings.soundOff': 'Off',
      'settings.replayHelp': 'Show how to play again',
      'settings.version': 'Four in a Row · PlayNine · version',

      'stats.title': 'Statistics',
      'stats.won': 'Wins vs computer',
      'stats.best': 'Longest streak',
      'stats.fast': 'Fastest win',
      'stats.byLevel': 'vs Computer by level',
      'stats.level': 'Level',
      'stats.played': 'Played',
      'stats.wins': 'Won',
      'stats.losses': 'Lost',
      'stats.draws': 'Drawn',
      'stats.fastest': 'Fastest',
      'stats.fastDesc': 'Fastest: the number of discs you dropped in your shortest win.',
      'stats.pvp': 'Two players',
      'stats.none': 'No games yet.',
      'stats.pvpLine': { one: '1 game · Player 1 won {p0} · Player 2 won {p1} · drawn {d}', other: '{n} games · Player 1 won {p0} · Player 2 won {p1} · drawn {d}' },
      'moves': { one: '1 move', other: '{n} moves' },

      'who.you': 'You',
      'who.ai': 'Computer',
      'who.p1': 'Player 1',
      'who.p2': 'Player 2',
      'color.0': 'yellow',
      'color.1': 'red',
      'dir.0': 'horizontally',
      'dir.1': 'vertically',
      'dir.2': 'diagonally',
      'dir.3': 'diagonally',
      'win.you': 'You win!',
      'win.ai': 'Computer wins.',
      'win.name': '{name} wins!',
      'wins.you': 'You win',
      'wins.name': '{name} wins',

      'log.move': '{name}: column {c}',
      'log.full': 'Board full · draw',
      'log.win': '{wins} · four connected {dir}',

      'toast.over': 'Game over · tap New game to play again',
      'toast.thinking': 'The computer is thinking, hang on',
      'toast.colFull': 'Column {c} is full, pick another one',
      'toast.undone': 'Move undone',
      'toast.statsReset': 'Statistics reset',

      'summary.note': 'Won {won}/{played} vs computer · {level}',
      'summary.notePvp': { one: '1 two-player game · no computer games yet', other: '{n} two-player games · no computer games yet' },
      'summary.noteNone': 'No games yet · try the computer',
      'summary.won': 'Wins vs computer',
      'summary.played': 'Games played',
      'summary.fast': 'Fastest win',
      'summary.turnYou': 'your turn',
      'summary.turnAi': "computer's turn",
      'summary.turnName': "{name}'s turn",
      'summary.titleAi': 'Four in a Row vs computer · {level}',
      'summary.titlePvp': 'Four in a Row · two players',
      'summary.detail': '{ply}/{cells} discs dropped · {turn}',

      'col.label': 'Column {c}: {state}',
      'col.full': 'full',
      'col.empty': 'empty',
      'col.free': { one: '1 empty cell left', other: '{n} empty cells left' },
      'col.top': ', top disc {color}',
      'left.label': { one: '1 {color} disc left', other: '{n} {color} discs left' },
      'left.title': { one: '1 disc left', other: '{n} discs left' },

      'mode.ai': 'vs Computer · {level}',
      'mode.pvp': 'Two players',
      'sub.ai': '{level} level',
      'sub.first': 'Goes first',
      'sub.second': 'Goes second',
      'sub.thinking': 'Thinking…',

      'turn.last': '{name} dropped in column {c}',
      'turn.draw': '<b>Draw.</b> All 42 cells are filled and nobody connected four',
      'turn.over': '<b>{who}</b> Four connected {dir}',
      'turn.thinking': 'Computer is thinking',
      'turn.aiLast': 'Computer dropped in column {c} · ',
      'turn.you': '<b>Your turn</b>',
      'turn.tapCol': ' · tap a column to drop a disc',
      'turn.name': "<b>{name}</b>'s turn · {color}",

      'result.draw': 'Draw',
      'result.drawSub': 'All 42 cells are filled and nobody lined up four in a row.',
      'result.aiWins': 'Computer wins',
      'result.subWin': 'Four connected {dir} in {moves}, beating the {level} computer.',
      'result.subLose': 'The computer connected four {dir}. Try again!',
      'result.subPvp': 'Four {color} discs connected {dir} in {moves}.',
      'result.lineAi': '{level}: won {won} · lost {lost} · drawn {d}',
      'result.streak': ' · {n}-game win streak',
      'result.record': 'New record: beat {level} in just {moves}! ',
      'result.linePvp': 'Two players: Player 1 won {p0} · Player 2 won {p1} · drawn {d}',
    },

    vi: {
      'meta.title': 'Bốn Liên Tiếp',
      'meta.description': 'Bốn Liên Tiếp: thả quân vào 7 cột, xếp 4 quân liền nhau theo hàng ngang, dọc hoặc chéo để thắng. Đấu máy 3 mức hoặc hai người, có hướng dẫn minh họa, tự lưu ván.',
      'app.name': 'Bốn Liên Tiếp',

      'btn.help': 'Cách chơi',
      'btn.helpKey': 'Cách chơi (H)',
      'btn.stats': 'Thống kê',
      'btn.settings': 'Cài đặt',
      'btn.undo': 'Đi lại',
      'btn.undoKey': 'Đi lại (Z)',
      'btn.new': 'Ván mới',
      'btn.newKey': 'Ván mới (N)',
      'btn.close': 'Đóng',
      'btn.cancel': 'Hủy',
      'btn.start': 'Bắt đầu',
      'btn.prev': 'Trước',
      'btn.next': 'Tiếp',
      'btn.letsPlay': 'Chơi thôi!',
      'btn.done': 'Xong',
      'btn.reset': 'Đặt lại',
      'btn.resetConfirm': 'Bấm lần nữa để xóa',
      'btn.viewBoard': 'Xem bàn',
      'btn.playAgain': 'Chơi tiếp',

      'board.label': 'Bàn 7 cột. Dùng phím mũi tên trái phải để chọn cột, Enter hoặc mũi tên xuống để thả quân, hoặc bấm số 1 đến 7.',
      'log.title': 'Diễn biến',
      'log.label': 'Nhật ký nước đi, mới nhất ở trên',
      'log.empty': 'Chưa có nước đi nào.',
      'controls.label': 'Điều khiển',
      'kbd.hint': 'Phím tắt: <kbd>←</kbd><kbd>→</kbd> chọn cột · <kbd>Enter</kbd> / <kbd>↓</kbd> thả quân · <kbd>1</kbd>–<kbd>7</kbd> thả thẳng vào cột · <kbd>Z</kbd> đi lại · <kbd>N</kbd> ván mới · <kbd>H</kbd> cách chơi',

      'new.title': 'Ván mới',
      'new.warning': 'Ván đang chơi sẽ bị bỏ và không tính vào thống kê.',
      'new.mode': 'Chế độ',
      'new.modeAi': 'Người vs Máy',
      'new.modePvp': 'Hai người',
      'new.level': 'Mức của máy',
      'new.first': 'Lượt đi đầu',
      'new.firstYou': 'Bạn đi trước',
      'new.firstAi': 'Máy đi trước',
      'new.pvpDesc': 'Hai người thay phiên nhau trên cùng một máy. Người 1 cầm quân vàng và đi trước.',
      'new.aiDesc': 'Bạn luôn cầm quân vàng, máy cầm quân đỏ.',

      'level.easy': 'Dễ',
      'level.medium': 'Vừa',
      'level.hard': 'Khó',
      'levelDesc.easy': 'Máy chỉ nhìn 1–2 nước, hay đi lệch và đôi khi quên chặn. Hợp để làm quen.',
      'levelDesc.medium': 'Máy tính trước 6 nước, luôn chặn đường thắng trước mắt của bạn.',
      'levelDesc.hard': 'Máy tính sâu nhất có thể trong khoảng 1,5 giây mỗi nước. Rất khó thắng.',

      'help.title': 'Cách chơi',
      'help.steps': 'Các bước',
      'help.step': 'Bước {i}/{n}',
      'help.dot': 'Bước {i}',
      'help.1.title': 'Thả quân vào một cột',
      'help.1.text': 'Bàn có <b>7 cột, 6 hàng</b>. Đến lượt, chạm vào một cột: quân <b>rơi xuống ô trống thấp nhất</b> của cột đó. Bàn phím: <b>←</b> <b>→</b> chọn cột, <b>Enter</b> hoặc <b>↓</b> để thả, hoặc bấm số <b>1</b>–<b>7</b>.',
      'help.1.alt': 'Quân vàng ở phía trên cột 4 rơi xuống ô trống thấp nhất, ngay trên quân đỏ',
      'help.2.title': 'Bốn quân liền nhau là thắng',
      'help.2.text': 'Xếp được <b>4 quân cùng màu liền nhau</b> theo hàng ngang, hàng dọc hoặc đường chéo là thắng ngay. Đấu máy thì bạn cầm <b>quân vàng</b>, máy cầm <b>quân đỏ</b>.',
      'help.2.alt': 'Bốn quân vàng nối nhau theo đường chéo từ cột 2 lên cột 5',
      'help.3.title': 'Chặn đường thắng của đối thủ',
      'help.3.text': 'Đối thủ đã có <b>3 quân liền nhau</b> và ô thứ tư thả tới được? Thả ngay vào cột đó để <b>chặn</b>. Mức Vừa và Khó không bao giờ bỏ sót nước này.',
      'help.3.alt': 'Ba quân đỏ liền nhau ở hàng dưới, quân vàng thả vào cột 5 để chặn',
      'help.4.title': 'Đừng kê bệ cho đối thủ',
      'help.4.text': 'Nếu ô đối thủ cần nằm <b>ngay trên</b> một ô trống, đừng thả vào ô trống đó: quân của bạn sẽ thành <b>bệ đỡ</b> để đối thủ thả lên và thắng.',
      'help.4.alt': 'Ba quân đỏ ở hàng thứ hai, ô thứ tư cần một quân kê bên dưới; ô bên dưới bị gạch chéo',
      'help.5.title': 'Hòa và mẹo nhỏ',
      'help.5.text': 'Kín cả <b>42 ô</b> mà chưa ai có bốn quân thì <b>hòa</b>. Mẹo: giữ <b>cột giữa</b> (nằm trên nhiều đường bốn nhất) và tạo <b>hai chỗ thắng cùng lúc</b> để đối thủ không chặn kịp.',
      'help.5.alt': 'Ba quân vàng ở giữa hàng dưới, hai đầu đều trống nên đối thủ chỉ chặn được một đầu',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'settings.themeAuto': 'Tự động',
      'settings.themeLight': 'Sáng',
      'settings.themeDark': 'Tối',
      'settings.lang': 'Ngôn ngữ',
      'settings.speed': 'Tốc độ quân rơi',
      'settings.speedSlow': 'Chậm',
      'settings.speedMedium': 'Vừa',
      'settings.speedFast': 'Nhanh',
      'settings.speedOff': 'Tắt',
      'settings.speedDesc': 'Tắt thì quân hiện ngay vào ô, không có hiệu ứng rơi.',
      'settings.sound': 'Âm thanh',
      'settings.soundOn': 'Bật',
      'settings.soundOff': 'Tắt',
      'settings.replayHelp': 'Xem lại cách chơi',
      'settings.version': 'Bốn Liên Tiếp · PlayNine · phiên bản',

      'stats.title': 'Thống kê',
      'stats.won': 'Thắng máy',
      'stats.best': 'Chuỗi dài nhất',
      'stats.fast': 'Thắng nhanh nhất',
      'stats.byLevel': 'Đấu máy theo mức',
      'stats.level': 'Mức',
      'stats.played': 'Ván',
      'stats.wins': 'Thắng',
      'stats.losses': 'Thua',
      'stats.draws': 'Hòa',
      'stats.fastest': 'Nhanh nhất',
      'stats.fastDesc': 'Nhanh nhất: số quân bạn thả trong ván thắng ngắn nhất.',
      'stats.pvp': 'Hai người',
      'stats.none': 'Chưa có ván nào.',
      'stats.pvpLine': '{n} ván · Người 1 thắng {p0} · Người 2 thắng {p1} · hòa {d}',
      'moves': '{n} nước',

      'who.you': 'Bạn',
      'who.ai': 'Máy',
      'who.p1': 'Người 1',
      'who.p2': 'Người 2',
      'color.0': 'vàng',
      'color.1': 'đỏ',
      'dir.0': 'hàng ngang',
      'dir.1': 'hàng dọc',
      'dir.2': 'đường chéo',
      'dir.3': 'đường chéo',
      'win.you': 'Bạn thắng!',
      'win.ai': 'Máy thắng.',
      'win.name': '{name} thắng!',
      'wins.you': 'Bạn thắng',
      'wins.name': '{name} thắng',

      'log.move': '{name}: cột {c}',
      'log.full': 'Kín bàn · hòa',
      'log.win': '{wins} · bốn quân {dir}',

      'toast.over': 'Ván đã kết thúc · bấm Ván mới để chơi tiếp',
      'toast.thinking': 'Máy đang nghĩ, chờ chút nhé',
      'toast.colFull': 'Cột {c} đã đầy, chọn cột khác',
      'toast.undone': 'Đã đi lại',
      'toast.statsReset': 'Đã đặt lại thống kê',

      'summary.note': 'Thắng máy {won}/{played} ván · mức {level}',
      'summary.notePvp': '{n} ván hai người · chưa đấu máy',
      'summary.noteNone': 'Chưa chơi ván nào · thử đấu máy nhé',
      'summary.won': 'Thắng máy',
      'summary.played': 'Ván đã chơi',
      'summary.fast': 'Thắng nhanh nhất',
      'summary.turnYou': 'đến lượt bạn',
      'summary.turnAi': 'đến lượt máy',
      'summary.turnName': 'đến lượt {name}',
      'summary.titleAi': 'Bốn Liên Tiếp với máy · {level}',
      'summary.titlePvp': 'Bốn Liên Tiếp hai người',
      'summary.detail': 'Đã thả {ply}/{cells} quân · {turn}',

      'col.label': 'Cột {c}: {state}',
      'col.full': 'đã đầy',
      'col.empty': 'trống',
      'col.free': 'còn {n} ô trống',
      'col.top': ', quân trên cùng màu {color}',
      'left.label': 'Còn {n} quân {color}',
      'left.title': 'Còn {n} quân',

      'mode.ai': 'Đấu máy · {level}',
      'mode.pvp': 'Hai người',
      'sub.ai': 'Mức {level}',
      'sub.first': 'Đi trước',
      'sub.second': 'Đi sau',
      'sub.thinking': 'Đang nghĩ…',

      'turn.last': '{name} thả cột {c}',
      'turn.draw': '<b>Hòa.</b> Kín cả 42 ô mà chưa ai có bốn quân',
      'turn.over': '<b>{who}</b> Bốn quân {dir}',
      'turn.thinking': 'Máy đang nghĩ',
      'turn.aiLast': 'Máy thả cột {c} · ',
      'turn.you': '<b>Lượt của bạn</b>',
      'turn.tapCol': ' · chạm vào một cột để thả quân',
      'turn.name': 'Lượt của <b>{name}</b> · quân {color}',

      'result.draw': 'Hòa',
      'result.drawSub': 'Kín cả 42 ô mà chưa ai xếp được bốn quân liền nhau.',
      'result.aiWins': 'Máy thắng',
      'result.subWin': 'Bốn quân {dir} sau {moves}, thắng máy mức {level}.',
      'result.subLose': 'Máy xếp được bốn quân {dir}. Thử lại nhé!',
      'result.subPvp': 'Bốn quân {color} {dir} sau {moves}.',
      'result.lineAi': 'Mức {level}: thắng {won} · thua {lost} · hòa {d}',
      'result.streak': ' · chuỗi {n} ván thắng',
      'result.record': 'Kỷ lục mới: thắng mức {level} chỉ với {moves}! ',
      'result.linePvp': 'Hai người: Người 1 thắng {p0} · Người 2 thắng {p1} · hòa {d}',
    },
  };

  let lang = 'en';
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'en' || v === 'vi') lang = v;
  } catch (e) {}
  document.documentElement.lang = lang;

  function t(key, params) {
    const p = params || {};
    let v = DICT[lang][key];
    if (v == null) v = DICT.en[key];
    if (v == null) return key;
    if (typeof v === 'object') v = p.n === 1 && v.one != null ? v.one : v.other;
    return String(v).replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? String(p[k]) : m));
  }

  function apply(root) {
    const r = root || document;
    for (const el of r.querySelectorAll('[data-i18n]')) el.textContent = t(el.getAttribute('data-i18n'));
    // Chỉ dùng cho chuỗi trong từ điển có thẻ đánh dấu (<b>, <kbd>)
    for (const el of r.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.getAttribute('data-i18n-html'));
    for (const el of r.querySelectorAll('[data-i18n-attr]')) {
      for (const pair of el.getAttribute('data-i18n-attr').split(';')) {
        const i = pair.indexOf(':');
        if (i > 0) el.setAttribute(pair.slice(0, i).trim(), t(pair.slice(i + 1).trim()));
      }
    }
    if (r === document) {
      document.title = t('meta.title');
      const desc = document.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute('content', t('meta.description'));
      const appTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (appTitle) appTitle.setAttribute('content', t('app.name'));
    }
  }

  const api = {
    lang,
    t,
    apply,
    set,
    fmtNumber: (n) => Number(n).toLocaleString(LOCALE[lang]),
    fmtDate: (d, opts) => new Date(d).toLocaleDateString(LOCALE[lang], opts),
    onBeforeReload: null, // game gán hàm lưu ván để gọi trước khi tải lại
  };

  function beforeReload() {
    if (typeof api.onBeforeReload === 'function') {
      try { api.onBeforeReload(); } catch (e) {}
    }
  }

  // Đổi ngôn ngữ ngay trong game: lưu ván, ghi ngôn ngữ, tải lại trang
  function set(next) {
    const l = next === 'vi' ? 'vi' : 'en';
    if (l === lang) return;
    beforeReload();
    try { localStorage.setItem(KEY, l); } catch (e) {}
    location.reload();
  }

  // Cổng PlayNine hoặc trang khác đổi ngôn ngữ: tải lại để theo
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    if ((e.newValue === 'vi' ? 'vi' : 'en') === lang) return;
    beforeReload();
    location.reload();
  });

  return api;
})();
