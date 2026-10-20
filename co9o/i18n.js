/* =====================================================================
 * Cờ 9 Ô - Đa ngôn ngữ: tiếng Anh (mặc định) + tiếng Việt
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
      'meta.title': 'Ultimate Tic-Tac-Toe',
      'meta.description': 'Ultimate Tic-Tac-Toe: nine small tic-tac-toe boards inside one big board. Play the computer at 3 levels or a friend, with an illustrated guide and autosave.',
      'game.name': 'Ultimate Tic-Tac-Toe',

      'top.help': 'How to play',
      'top.helpKey': 'How to play (H)',
      'top.stats': 'Statistics',
      'top.settings': 'Settings',

      'info.players': 'Players',
      'info.boardsWon': 'Small boards won',
      'info.boardsWonN': { one: '1 small board won', other: '{n} small boards won' },
      'board.label': 'Ultimate Tic-Tac-Toe board. Use the arrow keys to move and Enter to play.',
      'board.drawn': 'Draw',

      'controls.label': 'Controls',
      'controls.undo': 'Undo',
      'controls.undoKey': 'Undo (Z)',
      'controls.swap': 'Swap sides',
      'controls.swapKey': 'Swap sides (S)',
      'controls.swapAiOnly': 'Only available against the computer',
      'controls.new': 'New game',
      'controls.newKey': 'New game (N)',

      'side.label': 'Rule reminder',
      'side.rule': '<b>Remember:</b> the cell you play inside a small board is the board your opponent must play next. Win 3 small boards in a row to win.',
      'side.keys': 'Shortcuts: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> select cell · <kbd>Enter</kbd> play · <kbd>Z</kbd> undo · <kbd>S</kbd> swap sides · <kbd>N</kbd> new game · <kbd>H</kbd> how to play',

      'mode.ai': 'vs Computer',
      'mode.pvp': 'Two players',
      'mode.aiLevel': 'vs Computer · {level}',
      'level.easy': 'Easy',
      'level.medium': 'Medium',
      'level.hard': 'Hard',
      'levelDesc.easy': 'Thinks quickly and blunders now and then. Good for learning the rules.',
      'levelDesc.medium': 'Thinks about 1 second per move. A solid opponent to practise against.',
      'levelDesc.hard': 'Thinks about 2 seconds per move and is very hard to beat.',

      'new.title': 'New game',
      'new.warning': 'The current game will be abandoned and won\'t count in your statistics.',
      'new.mode': 'Mode',
      'new.level': 'Computer level',
      'new.side': 'You play',
      'new.sideX': 'X · goes first',
      'new.sideO': 'O · goes second',
      'new.pvpDesc': 'Two players take turns on the same device. X goes first.',
      'new.start': 'Start',
      'common.cancel': 'Cancel',
      'common.close': 'Close',
      'common.done': 'Done',

      'help.title': 'How to play',
      'help.steps': 'Steps',
      'help.prev': 'Back',
      'help.next': 'Next',
      'help.play': 'Let\'s play!',
      'help.step': 'Step {i}/{n}',
      'help.dot': 'Step {i}',
      'help.s1.title': 'Nine tic-tac-toe boards in one',
      'help.s1.text': 'The big board is made of <b>9 small boards</b>, each a 3×3 grid. Players take turns placing X and O in the cells. <b>X goes first</b> and may play in any cell.',
      'help.s1.alt': 'The big board with 9 small boards, all highlighted because X may play anywhere',
      'help.s2.title': 'Your cell decides where your opponent plays',
      'help.s2.text': 'X plays the <b>top right</b> cell of the center board, so O <b>must</b> play next in the <b>top right</b> board of the big board. The board you must play in is always highlighted.',
      'help.s2.alt': 'X plays the top right cell of the center board, an arrow points to the highlighted top right board',
      'help.s3.title': 'Win a small board to claim it',
      'help.s3.text': 'Get <b>3 in a row</b> inside a small board to claim it, and the board shows your big mark. A full board with no winner is a <b>drawn board</b> and counts for nobody.',
      'help.s3.alt': 'The top left board belongs to X, the bottom right board is drawn',
      'help.s4.title': 'Sent to a finished board? Play anywhere',
      'help.s4.text': 'If the board you are sent to <b>has already been won or is full</b>, you may play in <b>any open board</b>. All of those boards light up.',
      'help.s4.alt': 'O plays the top left cell and sends X to the finished top left board, so X may pick any open board',
      'help.s5.title': 'Claim 3 boards in a row to win',
      'help.s5.text': 'Whoever claims <b>3 small boards in a row</b> (across, down or diagonally) on the big board wins. If no moves are left and nobody has done it, the game is a <b>draw</b>.<br><b>Tip:</b> before you play, check which board that cell will send your opponent to.',
      'help.s5.alt': 'O claims three boards diagonally from top right to bottom left and wins',
      'fig.drawn': 'DRAW',

      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'settings.language': 'Language',
      'settings.help': 'Show how to play',
      'settings.version': 'Ultimate Tic-Tac-Toe · PlayNine · version',
      'theme.auto': 'Auto',
      'theme.light': 'Light',
      'theme.dark': 'Dark',

      'stats.title': 'Statistics',
      'stats.won': 'Wins vs computer',
      'stats.streak': 'Win streak',
      'stats.best': 'Best streak',
      'stats.byLevel': 'vs Computer by level',
      'stats.level': 'Level',
      'stats.played': 'Games',
      'stats.wins': 'Won',
      'stats.lost': 'Lost',
      'stats.drawn': 'Draws',
      'stats.pvp': 'Two players',
      'stats.none': 'No games yet.',
      'stats.pvpLine': { one: '1 game · X won {x} · O won {o} · {d} drawn', other: '{n} games · X won {x} · O won {o} · {d} drawn' },
      'stats.reset': 'Reset',
      'stats.resetConfirm': 'Tap again to clear',

      'result.youWin': 'You win!',
      'result.aiWins': 'Computer wins',
      'result.markWins': '{mark} wins!',
      'result.draw': 'Draw',
      'result.drawSub': 'No moves are left and nobody claimed 3 small boards in a row.',
      'result.youWinSub': 'You claimed 3 small boards in a row against the {level} computer.',
      'result.aiWinsSub': 'The computer claimed 3 small boards in a row. Try again!',
      'result.pvpSub': '{player} claimed 3 small boards in a row.',
      'result.lineAi': '{level}: {won} won · {lost} lost · {drawn} drawn',
      'result.lineStreak': ' · {n}-game win streak',
      'result.linePvp': 'Two players: X won {x} · O won {o} · {d} drawn',
      'result.viewBoard': 'View board',
      'result.playAgain': 'Play again',

      'pos.0': 'top left',
      'pos.1': 'top center',
      'pos.2': 'top right',
      'pos.3': 'middle left',
      'pos.4': 'center',
      'pos.5': 'middle right',
      'pos.6': 'bottom left',
      'pos.7': 'bottom center',
      'pos.8': 'bottom right',

      'player.you': 'You',
      'player.ai': 'Computer',
      'player.p1': 'Player 1',
      'player.p2': 'Player 2',
      'player.first': 'Goes first',
      'player.second': 'Goes second',
      'player.level': '{level} level',
      'player.thinking': 'Thinking…',

      'status.draw': '<b>Draw.</b> No moves left and nobody has 3 boards in a row',
      'status.youWin': '<b>You win!</b> 3 small boards in a row',
      'status.aiWins': '<b>Computer wins.</b> Try again',
      'status.markWins': '<b>{mark} wins!</b> 3 small boards in a row',
      'status.thinking': 'Computer is thinking',
      'status.yourTurn': 'Your turn',
      'status.markTurn': '<b>{mark}</b> to move',
      'status.anyCell': 'play any cell',
      'status.forced': 'play in the <b>{pos}</b> board',
      'status.anyBoard': 'pick any highlighted board',

      'cell.label': 'Board {board}, cell {cell}: {value}',
      'cell.empty': 'empty',
      'cell.boardOf': '. Board won by {mark}',
      'cell.boardDrawn': '. Board drawn',
      'cell.playable': '. Playable',
      'cell.last': '. Last move',

      'toast.thinking': 'The computer is thinking, please wait',
      'toast.forced': 'You must play in the highlighted {pos} board',
      'toast.closed': 'That board is finished, pick a highlighted board',
      'toast.swap': 'You now play {mark}',
      'toast.statsReset': 'Statistics reset',

      'summary.note': 'Won {won} of {n} vs computer · {level}',
      'summary.notePvp': { one: '1 two-player game · no computer games yet', other: '{n} two-player games · no computer games yet' },
      'summary.noteNone': 'No games yet · try playing the computer',
      'summary.won': 'Wins vs computer',
      'summary.played': 'Games played',
      'summary.best': 'Best win streak',
      'summary.boardsBoth': 'X won {x}, O won {o} small boards',
      'summary.boardsOne': { one: '{mark} has won 1 small board', other: '{mark} has won {n} small boards' },
      'summary.moves': { one: '1 move played', other: '{n} moves played' },
      'summary.yourTurn': 'your turn',
      'summary.aiTurn': 'computer\'s turn',
      'summary.markTurn': '{mark} to move',
      'summary.titleAi': 'Ultimate Tic-Tac-Toe vs computer · {level}',
      'summary.titlePvp': 'Ultimate Tic-Tac-Toe · two players',
    },
    vi: {
      'meta.title': 'Cờ 9 Ô',
      'meta.description': 'Cờ 9 Ô (Ultimate Tic-Tac-Toe) tiếng Việt: 9 bàn ca-rô nhỏ trong một bàn lớn. Đấu máy 3 mức hoặc hai người, có hướng dẫn minh họa, tự lưu ván.',
      'game.name': 'Cờ 9 Ô',

      'top.help': 'Cách chơi',
      'top.helpKey': 'Cách chơi (H)',
      'top.stats': 'Thống kê',
      'top.settings': 'Cài đặt',

      'info.players': 'Người chơi',
      'info.boardsWon': 'Số bàn nhỏ đã thắng',
      'info.boardsWonN': '{n} bàn nhỏ đã thắng',
      'board.label': 'Bàn cờ 9 ô. Dùng phím mũi tên để di chuyển, Enter để đánh.',
      'board.drawn': 'Hòa',

      'controls.label': 'Điều khiển',
      'controls.undo': 'Đi lại',
      'controls.undoKey': 'Đi lại (Z)',
      'controls.swap': 'Đổi bên',
      'controls.swapKey': 'Đổi bên (S)',
      'controls.swapAiOnly': 'Chỉ dùng khi đấu máy',
      'controls.new': 'Ván mới',
      'controls.newKey': 'Ván mới (N)',

      'side.label': 'Nhắc luật',
      'side.rule': '<b>Nhớ luật:</b> vị trí ô bạn đánh trong bàn nhỏ là bàn mà đối thủ phải đánh tiếp. Chiếm 3 bàn nhỏ thẳng hàng để thắng.',
      'side.keys': 'Phím tắt: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> chọn ô · <kbd>Enter</kbd> đánh · <kbd>Z</kbd> đi lại · <kbd>S</kbd> đổi bên · <kbd>N</kbd> ván mới · <kbd>H</kbd> cách chơi',

      'mode.ai': 'Người vs Máy',
      'mode.pvp': 'Hai người',
      'mode.aiLevel': 'Đấu máy · {level}',
      'level.easy': 'Dễ',
      'level.medium': 'Vừa',
      'level.hard': 'Khó',
      'levelDesc.easy': 'Máy nghĩ nhanh và thỉnh thoảng đi hớ. Hợp để làm quen luật.',
      'levelDesc.medium': 'Máy nghĩ khoảng 1 giây mỗi nước, đối thủ vững để luyện tập.',
      'levelDesc.hard': 'Máy nghĩ khoảng 2 giây mỗi nước và rất khó thắng.',

      'new.title': 'Ván mới',
      'new.warning': 'Ván đang chơi sẽ bị bỏ và không tính vào thống kê.',
      'new.mode': 'Chế độ',
      'new.level': 'Mức của máy',
      'new.side': 'Bạn cầm',
      'new.sideX': 'X · đi trước',
      'new.sideO': 'O · đi sau',
      'new.pvpDesc': 'Hai người thay phiên nhau trên cùng một máy. X đi trước.',
      'new.start': 'Bắt đầu',
      'common.cancel': 'Hủy',
      'common.close': 'Đóng',
      'common.done': 'Xong',

      'help.title': 'Cách chơi',
      'help.steps': 'Các bước',
      'help.prev': 'Trước',
      'help.next': 'Tiếp',
      'help.play': 'Chơi thôi!',
      'help.step': 'Bước {i}/{n}',
      'help.dot': 'Bước {i}',
      'help.s1.title': '9 bàn ca-rô trong một bàn lớn',
      'help.s1.text': 'Bàn lớn gồm <b>9 bàn nhỏ</b>, mỗi bàn là một lưới 3×3. Hai bên lần lượt đánh X và O vào các ô. <b>X đi trước</b> và được đánh ở bất kỳ ô nào.',
      'help.s1.alt': 'Bàn lớn gồm 9 bàn nhỏ, tất cả đang sáng vì X được đánh bất kỳ đâu',
      'help.s2.title': 'Ô bạn đánh chỉ đường cho đối thủ',
      'help.s2.text': 'X đánh vào ô <b>trên phải</b> của bàn giữa, nên O <b>bắt buộc</b> đánh tiếp trong bàn <b>trên phải</b> của bàn lớn. Bàn phải đánh luôn được làm sáng.',
      'help.s2.alt': 'X đánh ô trên phải của bàn giữa, mũi tên chỉ sang bàn trên phải đang sáng',
      'help.s3.title': 'Thắng bàn nhỏ để chiếm bàn đó',
      'help.s3.text': 'Có <b>3 quân thẳng hàng</b> trong một bàn nhỏ là chiếm được bàn đó, bàn hiện dấu lớn của bạn. Bàn đầy mà không ai thắng là <b>bàn hòa</b>, không tính cho ai.',
      'help.s3.alt': 'Bàn trên trái thuộc về X, bàn dưới phải hòa',
      'help.s4.title': 'Bị gửi tới bàn đã xong? Chọn tự do',
      'help.s4.text': 'Nếu bàn bạn bị gửi tới <b>đã có người thắng hoặc đã đầy</b>, bạn được đánh vào <b>bất kỳ bàn nào còn mở</b>. Các bàn đó cùng sáng lên.',
      'help.s4.alt': 'O đánh ô trên trái, gửi X tới bàn trên trái đã xong nên X được chọn mọi bàn còn mở',
      'help.s5.title': 'Chiếm 3 bàn thẳng hàng để thắng',
      'help.s5.text': 'Ai chiếm được <b>3 bàn nhỏ thẳng hàng</b> (ngang, dọc hoặc chéo) trên bàn lớn thì thắng. Hết nước đi mà không ai làm được thì <b>hòa</b>.<br><b>Mẹo:</b> trước khi đánh, hãy xem ô đó sẽ gửi đối thủ tới bàn nào.',
      'help.s5.alt': 'O chiếm ba bàn chéo từ trên phải xuống dưới trái và thắng',
      'fig.drawn': 'HÒA',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'settings.language': 'Ngôn ngữ',
      'settings.help': 'Xem lại cách chơi',
      'settings.version': 'Cờ 9 Ô · PlayNine · phiên bản',
      'theme.auto': 'Tự động',
      'theme.light': 'Sáng',
      'theme.dark': 'Tối',

      'stats.title': 'Thống kê',
      'stats.won': 'Thắng máy',
      'stats.streak': 'Chuỗi thắng',
      'stats.best': 'Chuỗi dài nhất',
      'stats.byLevel': 'Đấu máy theo mức',
      'stats.level': 'Mức',
      'stats.played': 'Ván',
      'stats.wins': 'Thắng',
      'stats.lost': 'Thua',
      'stats.drawn': 'Hòa',
      'stats.pvp': 'Hai người',
      'stats.none': 'Chưa có ván nào.',
      'stats.pvpLine': '{n} ván · X thắng {x} · O thắng {o} · hòa {d}',
      'stats.reset': 'Đặt lại',
      'stats.resetConfirm': 'Bấm lần nữa để xóa',

      'result.youWin': 'Bạn thắng!',
      'result.aiWins': 'Máy thắng',
      'result.markWins': '{mark} thắng!',
      'result.draw': 'Hòa',
      'result.drawSub': 'Hết nước đi mà không ai chiếm được 3 bàn nhỏ thẳng hàng.',
      'result.youWinSub': 'Bạn chiếm 3 bàn nhỏ thẳng hàng trước máy mức {level}.',
      'result.aiWinsSub': 'Máy chiếm 3 bàn nhỏ thẳng hàng. Thử lại nhé!',
      'result.pvpSub': '{player} chiếm 3 bàn nhỏ thẳng hàng.',
      'result.lineAi': 'Mức {level}: thắng {won} · thua {lost} · hòa {drawn}',
      'result.lineStreak': ' · chuỗi {n} ván thắng',
      'result.linePvp': 'Hai người: X thắng {x} · O thắng {o} · hòa {d}',
      'result.viewBoard': 'Xem bàn cờ',
      'result.playAgain': 'Chơi tiếp',

      'pos.0': 'trên trái',
      'pos.1': 'trên giữa',
      'pos.2': 'trên phải',
      'pos.3': 'giữa trái',
      'pos.4': 'chính giữa',
      'pos.5': 'giữa phải',
      'pos.6': 'dưới trái',
      'pos.7': 'dưới giữa',
      'pos.8': 'dưới phải',

      'player.you': 'Bạn',
      'player.ai': 'Máy',
      'player.p1': 'Người 1',
      'player.p2': 'Người 2',
      'player.first': 'Đi trước',
      'player.second': 'Đi sau',
      'player.level': 'Mức {level}',
      'player.thinking': 'Đang nghĩ…',

      'status.draw': '<b>Hòa.</b> Hết nước đi mà không ai có 3 bàn thẳng hàng',
      'status.youWin': '<b>Bạn thắng!</b> 3 bàn nhỏ thẳng hàng',
      'status.aiWins': '<b>Máy thắng.</b> Thử lại nhé',
      'status.markWins': '<b>{mark} thắng!</b> 3 bàn nhỏ thẳng hàng',
      'status.thinking': 'Máy đang nghĩ',
      'status.yourTurn': 'Lượt của bạn',
      'status.markTurn': 'Lượt của <b>{mark}</b>',
      'status.anyCell': 'đánh ô bất kỳ',
      'status.forced': 'đánh vào bàn <b>{pos}</b>',
      'status.anyBoard': 'chọn bàn bất kỳ đang sáng',

      'cell.label': 'Bàn {board}, ô {cell}: {value}',
      'cell.empty': 'trống',
      'cell.boardOf': '. Bàn của {mark}',
      'cell.boardDrawn': '. Bàn hòa',
      'cell.playable': '. Đánh được',
      'cell.last': '. Nước vừa đi',

      'toast.thinking': 'Máy đang nghĩ, chờ chút nhé',
      'toast.forced': 'Phải đánh vào bàn {pos} đang sáng',
      'toast.closed': 'Bàn này đã xong, chọn bàn khác đang sáng',
      'toast.swap': 'Bạn chuyển sang cầm {mark}',
      'toast.statsReset': 'Đã đặt lại thống kê',

      'summary.note': 'Thắng máy {won}/{n} ván · mức {level}',
      'summary.notePvp': '{n} ván hai người · chưa đấu máy',
      'summary.noteNone': 'Chưa chơi ván nào · thử đấu máy nhé',
      'summary.won': 'Thắng máy',
      'summary.played': 'Ván đã chơi',
      'summary.best': 'Chuỗi thắng dài nhất',
      'summary.boardsBoth': 'X thắng {x}, O thắng {o} bàn nhỏ',
      'summary.boardsOne': '{mark} đã thắng {n} bàn nhỏ',
      'summary.moves': 'Đã đi {n} nước',
      'summary.yourTurn': 'đến lượt bạn',
      'summary.aiTurn': 'đến lượt máy',
      'summary.markTurn': 'đến lượt {mark}',
      'summary.titleAi': 'Cờ 9 Ô với máy · {level}',
      'summary.titlePvp': 'Cờ 9 Ô hai người',
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
