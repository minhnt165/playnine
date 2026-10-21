/* =====================================================================
 * Cờ Đam - Đa ngôn ngữ: tiếng Anh (mặc định) + tiếng Việt
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
      'meta.title': 'Checkers',
      'meta.description': 'Checkers (draughts) 8x8: International rules with flying kings or American/English rules, mandatory captures, multi-jumps. Play the computer at 3 levels or with two players, with an illustrated guide and autosave.',
      'app.name': 'Checkers',

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

      'board.label': 'Checkers board, 8x8. Use the arrow keys to move between squares, Enter to pick a piece and then a destination, Esc to deselect.',
      'log.title': 'Moves',
      'log.label': 'Move log, newest first',
      'log.empty': 'No moves yet.',
      'controls.label': 'Controls',
      'kbd.hint': 'Shortcuts: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> move between squares · <kbd>Enter</kbd> pick piece / destination · <kbd>Esc</kbd> deselect · <kbd>Space</kbd> skip animation · <kbd>Z</kbd> undo · <kbd>N</kbd> new game · <kbd>H</kbd> how to play',

      'new.title': 'New game',
      'new.warning': "The current game will be abandoned and won't count toward your statistics.",
      'new.mode': 'Mode',
      'new.modeAi': 'vs Computer',
      'new.modePvp': 'Two players',
      'new.rules': 'Rules',
      'new.level': 'Computer level',
      'new.side': 'You play',
      'new.sideBlack': 'Black · first',
      'new.sideWhite': 'White · second',
      'new.pvpDesc': 'Two players take turns on the same device. Player 1 plays Black at the bottom and moves first.',

      'level.easy': 'Easy',
      'level.medium': 'Medium',
      'level.hard': 'Hard',
      'levelDesc.easy': 'The computer looks only 2 moves ahead and often slips up. Good for learning the rules.',
      'levelDesc.medium': 'The computer looks about 6 moves ahead: a solid sparring partner.',
      'levelDesc.hard': 'The computer searches as deep as it can in about 1.5 seconds per move.',
      'rules.intl': 'International 8x8 (flying kings)',
      'rules.english': 'American/English',
      'rulesShort.intl': 'International',
      'rulesShort.english': 'American/English',
      'rulesTiny.intl': 'Intl.',
      'rulesTiny.english': 'US/UK',
      'rulesDesc.intl': 'Men move forward but capture both forward and backward. Flying kings move and capture along whole diagonals. Capturing is mandatory; you may choose any capture route.',
      'rulesDesc.english': 'Men move and capture forward only. Kings move and capture one square in any direction. Capturing is mandatory; being crowned ends the turn.',

      'help.title': 'How to play',
      'help.steps': 'Steps',
      'help.step': 'Step {i}/{n}',
      'help.dot': 'Step {i}',
      'help.1.title': 'The board and pieces',
      'help.1.text': 'An 8x8 board; play only on the <b>dark squares</b>. Each side has <b>12 pieces</b> on its first 3 rows. <b>Black moves first</b>, then players alternate, moving one piece per turn. Choose International 8x8 or American/English rules when you tap <b>New game</b>.',
      'help.1.alt': 'Starting position: 12 Black pieces on the bottom 3 rows and 12 White pieces on the top 3 rows, all on dark squares',
      'help.2.title': 'Moving',
      'help.2.text': 'A man moves <b>one square diagonally forward</b> to an empty dark square. Tap a piece to see where it can go (marked with a <b>yellow dot</b>), then tap that square, or <b>drag and drop</b> the piece there.',
      'help.2.alt': 'Black man on d4 moves diagonally to c5 or e5',
      'help.3.title': 'Capturing is mandatory',
      'help.3.text': 'If an opponent piece is diagonally next to yours and the square right behind it is empty, <b>jump over it to capture</b>. When a capture is available you <b>must take it</b> (pieces that must capture have a <b>red ring</b>); if there are several, pick any. International rules: men can <b>also capture backward</b>.',
      'help.3.alt': 'The c3 man jumps over d4 to e5; under International rules the g5 man captures backward over f4 to e3',
      'help.3.tagCap': 'take',
      'help.3.tagBack': 'backward',
      'help.4.title': 'Multi-jumps',
      'help.4.text': 'If the piece <b>can capture again from its new square, it must keep going</b> in the same turn. Captured pieces are removed only <b>after the sequence ends</b>, and no piece can be jumped twice. With several routes, tap <b>each landing square</b> in turn.',
      'help.4.alt': 'The c3 man captures d4 landing on e5, then captures f6 landing on g7 in the same turn',
      'help.5.title': 'Crowning',
      'help.5.text': 'A man reaching the <b>far row</b> becomes a <b>king</b> (shown with a crown). <b>International</b>: flying kings move any number of squares diagonally, capture from a distance and land on any empty square beyond; a man crowned mid-sequence keeps capturing as a king. <b>American/English</b>: kings move and capture one square in any direction, and crowning ends the turn.',
      'help.5.alt': 'The c7 man moves to d8 and is crowned; the a1 king flies over d4 and lands on e5, f6, g7 or h8',
      'help.5.tagCrown': 'king',
      'help.5.tagFly': 'flying king',
      'help.6.title': 'Win, lose or draw',
      'help.6.text': 'You win when your opponent has <b>no pieces left</b> or <b>no legal moves</b> (every piece is blocked). The game is a draw when <b>the same position occurs 3 times</b>, or after <b>30 moves in a row by each side with kings only</b> and no captures.',
      'help.6.alt': 'The White man on a3 is blocked: b2 holds a Black piece and c1 is occupied too, so it can neither move nor capture',
      'help.6.tagStuck': 'stuck',

      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'settings.themeAuto': 'Auto',
      'settings.themeLight': 'Light',
      'settings.themeDark': 'Dark',
      'settings.lang': 'Language',
      'settings.speed': 'Animation speed',
      'settings.speedSlow': 'Slow',
      'settings.speedMedium': 'Medium',
      'settings.speedFast': 'Fast',
      'settings.speedOff': 'Off',
      'settings.speedDesc': 'While a piece is moving, tap the board (or press <kbd>Space</kbd>) to skip the animation.',
      'settings.coords': 'Show coordinates',
      'settings.coordsDesc': 'Letters a–h and numbers 1–8 along the board edges, matching the move log.',
      'settings.rulesNote': 'The rules (International 8x8 or American/English) are chosen when you tap <b>New game</b> and are saved with the game.',
      'settings.replayHelp': 'Show how to play again',
      'settings.version': 'Checkers · PlayNine · version',

      'stats.title': 'Statistics',
      'stats.won': 'Wins vs computer',
      'stats.best': 'Longest streak',
      'stats.pvpTotal': 'Two-player games',
      'stats.byLevel': 'vs Computer by level',
      'stats.level': 'Level',
      'stats.played': 'Played',
      'stats.wins': 'Won',
      'stats.losses': 'Lost',
      'stats.draws': 'Drawn',
      'stats.pvp': 'Two players',
      'stats.none': 'No games yet.',
      'stats.pvpLine': { one: '1 game · Player 1 won {p0} · Player 2 won {p1} · drawn {d}', other: '{n} games · Player 1 won {p0} · Player 2 won {p1} · drawn {d}' },

      'who.you': 'You',
      'who.ai': 'Computer',
      'who.p1': 'Player 1',
      'who.p2': 'Player 2',
      'side.0': 'Black',
      'side.1': 'White',
      'end.nopieces': 'ran out of pieces',
      'end.nomoves': 'ran out of moves',
      'end.repetition': 'threefold repetition',
      'end.kings': '30 king-only moves each',
      'win.you': 'You win!',
      'win.ai': 'Computer wins.',
      'win.name': '{name} wins!',
      'wins.you': 'You win',
      'wins.name': '{name} wins',

      'log.move': '{name}: {move}',
      'log.crowned': ' · crowned',
      'log.draw': 'Draw · {reason}',
      'log.over': '{loser} {reason} · {wins}',

      'toast.over': 'Game over · tap New game to play again',
      'toast.thinking': 'The computer is thinking, hang on',
      'toast.mustCapture': 'Capturing is mandatory · pick a piece with a red ring',
      'toast.cantMove': "This piece can't move right now",
      'toast.aiPiece': "That's the computer's piece · pick one of yours",
      'toast.notYourTurn': "It's {name}'s turn · {side} pieces",
      'toast.manyRoutes': 'Several capture routes end here · tap each landing square in turn',
      'toast.undone': 'Move undone',
      'toast.badTarget': "Can't move to that square",
      'toast.statsReset': 'Statistics reset',

      'summary.note': 'Won {won}/{played} vs computer · {level}',
      'summary.notePvp': { one: '1 two-player game · no computer games yet', other: '{n} two-player games · no computer games yet' },
      'summary.noteNone': 'No games yet · try the computer',
      'summary.won': 'Wins vs computer',
      'summary.played': 'Games played',
      'summary.best': 'Longest win streak',
      'summary.turnYou': 'your turn',
      'summary.turnAi': "computer's turn",
      'summary.turnName': "{name}'s turn",
      'summary.titleAi': 'Checkers vs computer · {level}',
      'summary.titlePvp': 'Checkers · two players',
      'summary.detail': '{rules} · {me} {c1} – {other} {c2} · {turn}',
      'pieces': { one: '1 piece', other: '{n} pieces' },

      'sq.light': '{sq}, light square',
      'sq.empty': 'empty',
      'sq.man': '{side} man',
      'sq.king': '{side} king',
      'sq.selected': 'selected',
      'sq.must': 'must capture',
      'sq.final': 'final landing square',
      'sq.target': 'reachable',
      'sq.willCap': 'will be captured',
      'score.left': { one: '1 piece left', other: '{n} pieces left' },
      'count.men': { one: '1 man', other: '{n} men' },
      'count.kings': { one: '1 king', other: '{n} kings' },

      'mode.ai': 'vs AI · {level}',
      'mode.pvp': 'Two players',
      'sub.ai': '{level} level · {side}',
      'sub.first': '{side} · moves first',
      'sub.second': '{side} · moves second',
      'sub.thinking': 'Thinking…',

      'turn.moving': '<b>{name}</b> plays {move}',
      'turn.movingYou': '<b>You</b> play {move}',
      'turn.skip': '· tap to skip',
      'turn.draw': '<b>Draw.</b> {reason}',
      'turn.over': '<b>{who}</b> {loser} {reason}',
      'turn.aiPicks': '<b>Computer</b> picks {move}',
      'turn.thinking': 'Computer is thinking',
      'turn.chain': 'Keep capturing · tap the <b>next landing square</b>',
      'turn.selCapture': '{sq} · tap a square with a <b>dot</b> to capture',
      'turn.selMove': '{sq} · tap a square with a <b>dot</b> to move',
      'turn.you': '<b>Your turn</b>',
      'turn.name': "<b>{name}</b>'s turn ({side})",
      'turn.must': ' · <b>you must capture</b>',
      'turn.tapPiece': ' · tap a piece to move',

      'result.draw': 'Draw',
      'result.drawRepetition': 'The same position occurred 3 times.',
      'result.drawKings': 'Both sides made 30 king-only moves in a row without a capture.',
      'result.aiWins': 'Computer wins',
      'result.subWin': 'The {level} computer {reason}.',
      'result.subLose': 'You {reason}. Try again!',
      'result.subPvp': '{loser} ({side}) {reason}.',
      'result.pieces': '{men} · {kings}',
      'result.lineAi': '{rules} · {level}: won {won} · lost {lost} · drawn {d}',
      'result.streak': ' · {n}-game win streak',
      'result.linePvp': '{rules} · Player 1 won {p0} · Player 2 won {p1} · drawn {d}',
    },

    vi: {
      'meta.title': 'Cờ Đam',
      'meta.description': 'Cờ Đam (checkers) 8x8: luật Quốc tế vua bay hoặc kiểu Mỹ/Anh, bắt buộc ăn quân, ăn liên tiếp. Đấu máy 3 mức hoặc hai người, có hướng dẫn minh họa, tự lưu ván.',
      'app.name': 'Cờ Đam',

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

      'board.label': 'Bàn cờ đam 8x8. Dùng phím mũi tên để di chuyển giữa các ô, Enter để chọn quân rồi chọn ô đến, Esc để bỏ chọn.',
      'log.title': 'Nước đi',
      'log.label': 'Nhật ký nước đi, mới nhất ở trên',
      'log.empty': 'Chưa có nước đi nào.',
      'controls.label': 'Điều khiển',
      'kbd.hint': 'Phím tắt: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> di chuyển ô · <kbd>Enter</kbd> chọn quân / ô đến · <kbd>Esc</kbd> bỏ chọn · <kbd>Space</kbd> bỏ qua hiệu ứng · <kbd>Z</kbd> đi lại · <kbd>N</kbd> ván mới · <kbd>H</kbd> cách chơi',

      'new.title': 'Ván mới',
      'new.warning': 'Ván đang chơi sẽ bị bỏ và không tính vào thống kê.',
      'new.mode': 'Chế độ',
      'new.modeAi': 'Người vs Máy',
      'new.modePvp': 'Hai người',
      'new.rules': 'Luật',
      'new.level': 'Mức của máy',
      'new.side': 'Bạn cầm quân',
      'new.sideBlack': 'Đen · đi trước',
      'new.sideWhite': 'Trắng · đi sau',
      'new.pvpDesc': 'Hai người thay phiên nhau trên cùng một máy. Người 1 cầm quân Đen ở phía dưới và đi trước.',

      'level.easy': 'Dễ',
      'level.medium': 'Vừa',
      'level.hard': 'Khó',
      'levelDesc.easy': 'Máy chỉ tính trước 2 nước và hay chọn lệch. Hợp để làm quen luật.',
      'levelDesc.medium': 'Máy tính trước khoảng 6 nước, đối thủ vững để luyện tập.',
      'levelDesc.hard': 'Máy tính sâu nhất có thể trong khoảng 1,5 giây mỗi nước.',
      'rules.intl': 'Quốc tế 8x8',
      'rules.english': 'Kiểu Mỹ/Anh',
      'rulesShort.intl': 'Quốc tế',
      'rulesShort.english': 'Mỹ/Anh',
      'rulesTiny.intl': 'Quốc tế',
      'rulesTiny.english': 'Mỹ/Anh',
      'rulesDesc.intl': 'Quân thường đi tới, ăn được cả tới lẫn lùi. Vua bay: đi và ăn xa theo đường chéo. Bắt buộc ăn, được chọn đường ăn bất kỳ.',
      'rulesDesc.english': 'Quân thường chỉ đi và ăn về phía trước. Vua đi và ăn 1 ô theo mọi hướng. Bắt buộc ăn; lên vua là hết lượt.',

      'help.title': 'Cách chơi',
      'help.steps': 'Các bước',
      'help.step': 'Bước {i}/{n}',
      'help.dot': 'Bước {i}',
      'help.1.title': 'Bàn cờ và quân cờ',
      'help.1.text': 'Bàn 8x8, chỉ đi trên <b>ô tối</b>. Mỗi bên <b>12 quân</b> xếp trên 3 hàng đầu. Bên <b>Đen đi trước</b>, hai bên thay phiên, mỗi lượt đi một quân. Luật Quốc tế 8x8 hay Kiểu Mỹ/Anh chọn khi bấm <b>Ván mới</b>.',
      'help.1.alt': 'Bàn cờ đầu ván: 12 quân Đen ở 3 hàng dưới, 12 quân Trắng ở 3 hàng trên, đều trên ô tối',
      'help.2.title': 'Đi quân',
      'help.2.text': 'Quân thường đi <b>chéo 1 ô về phía trước</b> sang ô tối còn trống. Chạm một quân để thấy các ô đi được (có <b>chấm vàng</b>), chạm ô đó để đi, hoặc <b>kéo thả</b> quân tới ô đó.',
      'help.2.alt': 'Quân Đen ở d4 đi chéo lên c5 hoặc e5',
      'help.3.title': 'Ăn quân là bắt buộc',
      'help.3.text': 'Quân đối thủ đứng sát chéo mà ô ngay sau còn trống thì <b>nhảy qua để ăn</b>. Có nước ăn thì <b>bắt buộc phải ăn</b> (quân phải ăn có <b>viền đỏ</b>); có nhiều cách thì chọn cách nào cũng được. Luật Quốc tế: quân thường <b>ăn được cả về phía sau</b>.',
      'help.3.alt': 'Quân c3 nhảy qua d4 sang e5; theo luật Quốc tế quân g5 ăn lùi qua f4 sang e3',
      'help.3.tagCap': 'ăn',
      'help.3.tagBack': 'ăn lùi',
      'help.4.title': 'Ăn liên tiếp',
      'help.4.text': 'Ăn xong mà từ ô mới <b>còn ăn được thì phải ăn tiếp</b> trong cùng lượt. Quân bị ăn chỉ nhấc ra <b>sau khi hết chuỗi</b> và không được nhảy qua một quân hai lần. Có nhiều đường ăn thì chạm lần lượt <b>từng ô đáp</b>.',
      'help.4.alt': 'Quân c3 ăn d4 sang e5 rồi ăn tiếp f6 sang g7 trong cùng lượt',
      'help.5.title': 'Lên vua',
      'help.5.text': 'Quân thường tới <b>hàng cuối</b> bên kia thì lên <b>vua</b> (có vương miện). <b>Quốc tế</b>: vua bay đi xa bao nhiêu ô chéo cũng được, ăn quân ở xa rồi đáp ô trống bất kỳ phía sau; lên vua giữa chuỗi ăn thì ăn tiếp như vua. <b>Mỹ/Anh</b>: vua đi và ăn 1 ô theo mọi hướng, lên vua là hết lượt.',
      'help.5.alt': 'Quân c7 lên d8 thành vua; vua a1 bay qua d4 và đáp e5, f6, g7 hoặc h8',
      'help.5.tagCrown': 'lên vua',
      'help.5.tagFly': 'vua bay',
      'help.6.title': 'Thắng, thua và hòa',
      'help.6.text': 'Bạn thắng khi đối thủ <b>hết quân</b> hoặc <b>không còn nước đi</b> (mọi quân bị chặn). Hòa khi <b>một thế cờ lặp lại 3 lần</b>, hoặc <b>30 nước liền mỗi bên chỉ đi vua</b> mà không ai ăn quân.',
      'help.6.alt': 'Quân Trắng a3 bị chặn: b2 có quân Đen và c1 cũng có quân nên không đi, không ăn được',
      'help.6.tagStuck': 'hết nước',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'settings.themeAuto': 'Tự động',
      'settings.themeLight': 'Sáng',
      'settings.themeDark': 'Tối',
      'settings.lang': 'Ngôn ngữ',
      'settings.speed': 'Tốc độ hiệu ứng',
      'settings.speedSlow': 'Chậm',
      'settings.speedMedium': 'Vừa',
      'settings.speedFast': 'Nhanh',
      'settings.speedOff': 'Tắt',
      'settings.speedDesc': 'Đang đi quân, chạm vào bàn (hoặc nhấn <kbd>Space</kbd>) để bỏ qua hiệu ứng.',
      'settings.coords': 'Hiện tọa độ',
      'settings.coordsDesc': 'Chữ a–h và số 1–8 ở mép bàn, khớp với nhật ký nước đi.',
      'settings.rulesNote': 'Luật chơi (Quốc tế 8x8 hoặc Kiểu Mỹ/Anh) chọn khi bấm <b>Ván mới</b> và được lưu cùng ván.',
      'settings.replayHelp': 'Xem lại cách chơi',
      'settings.version': 'Cờ Đam · PlayNine · phiên bản',

      'stats.title': 'Thống kê',
      'stats.won': 'Thắng máy',
      'stats.best': 'Chuỗi dài nhất',
      'stats.pvpTotal': 'Ván hai người',
      'stats.byLevel': 'Đấu máy theo mức',
      'stats.level': 'Mức',
      'stats.played': 'Ván',
      'stats.wins': 'Thắng',
      'stats.losses': 'Thua',
      'stats.draws': 'Hòa',
      'stats.pvp': 'Hai người',
      'stats.none': 'Chưa có ván nào.',
      'stats.pvpLine': '{n} ván · Người 1 thắng {p0} · Người 2 thắng {p1} · hòa {d}',

      'who.you': 'Bạn',
      'who.ai': 'Máy',
      'who.p1': 'Người 1',
      'who.p2': 'Người 2',
      'side.0': 'Đen',
      'side.1': 'Trắng',
      'end.nopieces': 'hết quân',
      'end.nomoves': 'hết nước đi',
      'end.repetition': 'lặp thế 3 lần',
      'end.kings': '30 nước mỗi bên chỉ đi vua',
      'win.you': 'Bạn thắng!',
      'win.ai': 'Máy thắng.',
      'win.name': '{name} thắng!',
      'wins.you': 'Bạn thắng',
      'wins.name': '{name} thắng',

      'log.move': '{name}: {move}',
      'log.crowned': ' · lên vua',
      'log.draw': 'Hòa · {reason}',
      'log.over': '{loser} {reason} · {wins}',

      'toast.over': 'Ván đã kết thúc · bấm Ván mới để chơi tiếp',
      'toast.thinking': 'Máy đang nghĩ, chờ chút nhé',
      'toast.mustCapture': 'Bắt buộc ăn quân · chọn quân có viền đỏ',
      'toast.cantMove': 'Quân này chưa đi được',
      'toast.aiPiece': 'Đó là quân của máy · chọn quân của bạn',
      'toast.notYourTurn': 'Đến lượt {name} · quân {side}',
      'toast.manyRoutes': 'Có nhiều đường ăn tới ô này · chạm từng ô đáp một',
      'toast.undone': 'Đã đi lại',
      'toast.badTarget': 'Không đi được tới ô đó',
      'toast.statsReset': 'Đã đặt lại thống kê',

      'summary.note': 'Thắng máy {won}/{played} ván · mức {level}',
      'summary.notePvp': '{n} ván hai người · chưa đấu máy',
      'summary.noteNone': 'Chưa chơi ván nào · thử đấu máy nhé',
      'summary.won': 'Thắng máy',
      'summary.played': 'Ván đã chơi',
      'summary.best': 'Chuỗi thắng dài nhất',
      'summary.turnYou': 'đến lượt bạn',
      'summary.turnAi': 'đến lượt máy',
      'summary.turnName': 'đến lượt {name}',
      'summary.titleAi': 'Cờ Đam với máy · {level}',
      'summary.titlePvp': 'Cờ Đam hai người',
      'summary.detail': '{rules} · {me} {c1} – {other} {c2} · {turn}',
      'pieces': '{n} quân',

      'sq.light': '{sq}, ô sáng',
      'sq.empty': 'trống',
      'sq.man': 'quân {side}',
      'sq.king': 'vua {side}',
      'sq.selected': 'đang chọn',
      'sq.must': 'phải ăn quân',
      'sq.final': 'ô dừng cuối',
      'sq.target': 'ô đến được',
      'sq.willCap': 'sẽ bị ăn',
      'score.left': 'Còn {n} quân',
      'count.men': '{n} quân thường',
      'count.kings': '{n} vua',

      'mode.ai': 'Đấu máy · {level}',
      'mode.pvp': 'Hai người',
      'sub.ai': 'Mức {level} · quân {side}',
      'sub.first': 'Quân {side} · đi trước',
      'sub.second': 'Quân {side} · đi sau',
      'sub.thinking': 'Đang nghĩ…',

      'turn.moving': '<b>{name}</b> đi {move}',
      'turn.movingYou': '<b>{name}</b> đi {move}',
      'turn.skip': '· chạm để bỏ qua',
      'turn.draw': '<b>Hòa.</b> {reason}',
      'turn.over': '<b>{who}</b> {loser} {reason}',
      'turn.aiPicks': '<b>Máy</b> chọn {move}',
      'turn.thinking': 'Máy đang nghĩ',
      'turn.chain': 'Ăn tiếp · chạm <b>ô đáp kế tiếp</b>',
      'turn.selCapture': '{sq} · chạm ô có <b>chấm</b> để ăn quân',
      'turn.selMove': '{sq} · chạm ô có <b>chấm</b> để đi',
      'turn.you': '<b>Lượt của bạn</b>',
      'turn.name': 'Lượt <b>{name}</b> ({side})',
      'turn.must': ' · <b>bắt buộc ăn quân</b>',
      'turn.tapPiece': ' · chạm một quân để đi',

      'result.draw': 'Hòa',
      'result.drawRepetition': 'Một thế cờ đã lặp lại 3 lần.',
      'result.drawKings': 'Hai bên đi vua 30 nước liền mà không ai ăn quân.',
      'result.aiWins': 'Máy thắng',
      'result.subWin': 'Máy mức {level} {reason}.',
      'result.subLose': 'Bạn {reason}. Thử lại nhé!',
      'result.subPvp': '{loser} (quân {side}) {reason}.',
      'result.pieces': '{men} · {kings}',
      'result.lineAi': '{rules} · mức {level}: thắng {won} · thua {lost} · hòa {d}',
      'result.streak': ' · chuỗi {n} ván thắng',
      'result.linePvp': '{rules} · Người 1 thắng {p0} · Người 2 thắng {p1} · hòa {d}',
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
