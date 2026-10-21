/* =====================================================================
 * Cờ Gánh - Đa ngôn ngữ (tiếng Anh mặc định, tiếng Việt)
 *   - Ngôn ngữ lưu chung cho cả PlayNine ở localStorage['playnine-lang'] ('en' | 'vi')
 *   - I18N.t(key, params): tra từ điển, thiếu thì lấy tiếng Anh, thiếu nữa thì trả về key
 *   - I18N.apply(root): điền chữ cho [data-i18n], [data-i18n-html], [data-i18n-attr]
 *   - I18N.set(lang): lưu ngôn ngữ rồi tải lại trang (game lưu ván trước qua I18N.onBeforeReload)
 * Nạp trước engine.js và app.js.
 * ===================================================================== */
(function (root) {
  'use strict';

  const KEY = 'playnine-lang';
  const LOCALES = { en: 'en-US', vi: 'vi-VN' };

  const DICT = {
    en: {
      'meta.title': 'Co Ganh',
      'meta.description': 'Co Ganh, a Vietnamese folk strategy game: move along the lines, carry and surround to flip your opponent\'s pieces. Play the computer at 3 levels or two players, with an illustrated tutorial and autosave.',
      'app.name': 'Co Ganh',

      'top.help': 'How to play',
      'top.helpKey': 'How to play (H)',
      'top.stats': 'Statistics',
      'top.settings': 'Settings',

      'level.easy': 'Easy',
      'level.medium': 'Medium',
      'level.hard': 'Hard',
      'level.desc.easy': 'Looks only 1–2 moves ahead and often slips. Good for learning the rules.',
      'level.desc.medium': 'Looks 4 moves ahead. A solid opponent for practice.',
      'level.desc.hard': 'Searches as deep as it can in about 1.5 seconds per move.',

      'name.you': 'You',
      'name.ai': 'Computer',
      'name.p1': 'Player 1',
      'name.p2': 'Player 2',
      'color.0': 'red',
      'color.1': 'blue',
      'side.0': 'Red',
      'side.1': 'Blue',

      'mode.ai': 'vs Computer · {level}',
      'mode.pvp': 'Two players',
      'mode.openRule': ' · Mo',
      'player.level': '{level} level',
      'player.sub': '{side} · {order}',
      'order.first': 'first',
      'order.second': 'second',
      'player.thinking': 'Thinking…',
      'player.onBoard': { one: '1 piece on the board', other: '{n} pieces on the board' },
      'player.took': 'took {n}',
      'player.tookAria': { one: 'Captured 1 piece, {color}', other: 'Captured {n} pieces, {color}' },

      'board.aria': 'Co Ganh board, 5 x 5. Use the arrow keys to move between points, Enter to pick up a piece, then Enter on the destination to move.',
      'point.empty': '{c}: empty',
      'point.mine': '{c}: your {color} piece',
      'point.ai': '{c}: computer\'s {color} piece',
      'point.player': '{c}: {name}\'s {color} piece',
      'point.selected': ', selected',
      'point.gain': { one: ', move here to capture 1 piece', other: ', move here to capture {n} pieces' },
      'point.dest': ', you can move here',

      'turn.yourTurn': 'Your turn',
      'turn.move': '<b>{name}</b>: {from} → {to}',
      'turn.forced': ' (forced)',
      'turn.ganh': '<b>{name}</b>: Ganh captures {pts}',
      'turn.vay': { one: '<b>{name}</b>: Vay captures 1 piece', other: '<b>{name}</b>: Vay captures {n} pieces' },
      'turn.moving': '<b>{name}</b>: moving… <span class="skip-hint">tap to skip</span>',
      'turn.draw': '<b>Draw.</b> {why}',
      'turn.youWin': 'You win!',
      'turn.aiWin': 'Computer wins.',
      'turn.playerWins': '{name} wins!',
      'turn.aiThinking': 'Computer is thinking',
      'turn.mustOpen': '<b>Mo rule:</b> must move to {to} to capture',
      'turn.pickDestCap': 'Pick a destination · <b>red rings</b> capture',
      'turn.pickDest': 'Piece {c} · pick a destination',
      'turn.yours': '<b>Your turn</b> · tap a red piece',
      'turn.pvp': '<b>{name}</b>\'s turn · {color} pieces',
      'join.and': ' and ',

      'log.title': 'Game log',
      'log.aria': 'Move log, newest first',
      'log.empty': 'No moves yet.',
      'log.forced': ' (forced)',
      'log.ganh': ', Ganh +{n}',
      'log.vay': ', Vay +{n}',

      'end.noPieces': '{name} has no pieces left',
      'end.noPieces.you': 'You have no pieces left',
      'end.noMoves': '{name} has no moves left',
      'end.noMoves.you': 'You have no moves left',
      'end.wins': '{name} wins',
      'end.wins.you': 'You win',
      'end.repeat': 'Position repeated 3 times',
      'end.quiet': '{n} moves in a row without a capture',
      'end.draw': '{why} · draw',

      'controls.aria': 'Controls',
      'btn.undo': 'Undo',
      'btn.undoKey': 'Undo (Z)',
      'btn.new': 'New game',
      'btn.newKey': 'New game (N)',
      'kbd.hint': 'Keys: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> select point · <kbd>Enter</kbd> pick up / move · <kbd>Esc</kbd> deselect · <kbd>Space</kbd> skip animation · <kbd>Z</kbd> undo · <kbd>N</kbd> new game · <kbd>H</kbd> how to play',

      'toast.over': 'Game over · tap New game to play again',
      'toast.thinking': 'The computer is thinking, please wait',
      'toast.mustOpen': 'Mo rule: you must move into {to} for a Ganh capture',
      'toast.blocked': 'This piece is blocked, pick another one',
      'toast.oneStep': 'Move one step along a line to an empty point',
      'toast.occupied': 'That point is taken',
      'toast.tapColor': 'Tap a {color} piece first',
      'toast.tapRed': 'Tap one of your red pieces first',
      'toast.pvpTurn': 'It\'s {name}\'s turn · {color} pieces',
      'toast.aiPiece': 'That\'s the computer\'s piece · you play red',
      'toast.undone': 'Move undone',
      'toast.statsReset': 'Statistics reset',
      'toast.rulesNow': 'Applied to this game',
      'toast.rulesNext': 'New rules apply from the next game',

      'new.title': 'New game',
      'new.warning': 'The game in progress will be abandoned and won\'t count in your statistics.',
      'new.mode': 'Mode',
      'new.modeAi': 'vs Computer',
      'new.modePvp': 'Two players',
      'new.level': 'Computer level',
      'new.first': 'First move',
      'new.youFirst': 'You first',
      'new.aiFirst': 'Computer first',
      'new.pvpDesc': 'Two players take turns on the same device. Player 1 plays red at the bottom and moves first.',
      'new.rules': 'Mo rule: {state}. Change it in Settings.',
      'state.on': 'on',
      'state.off': 'off',
      'btn.cancel': 'Cancel',
      'btn.start': 'Start',

      'help.title': 'How to play',
      'help.close': 'Close',
      'help.steps': 'Steps',
      'help.prev': 'Back',
      'help.next': 'Next',
      'help.play': 'Let\'s play!',
      'help.step': 'Step {i}/{n}',
      'help.dot': 'Step {i}',
      'help.s1.title': 'The board: 25 points, 16 pieces',
      'help.s1.text': 'The board has <b>5 x 5 points</b> joined by lines. Each side has <b>8 pieces</b>: you play <b>red</b> at the bottom, your opponent plays blue at the top. Columns are labeled a–e, rows 1–5.',
      'help.s1.alt': 'Starting position: 8 red pieces at the bottom, 8 blue pieces at the top, the 9 middle points empty',
      'help.s2.title': 'Moving: one step along a line',
      'help.s2.text': 'Each turn, move <b>one piece one step</b> along a line to an adjacent <b>empty</b> point. Only points with diagonal lines allow diagonal moves. Tap a piece to see where it can go, or drag it there.',
      'help.s2.alt': 'The piece on b4 has diagonal lines and can move in 8 directions; the piece on d1 has none and can move in only 3',
      'help.s2.tag8': '8 ways',
      'help.s2.tag3': '3 ways',
      'help.s3.title': 'Ganh (carry): step in between to capture',
      'help.s3.text': 'Move into the point <b>between two enemy pieces</b> on the same straight line to make a <b>Ganh (carry) capture</b>: both pieces flip to your color and become yours.',
      'help.s3.alt': 'Red moves from c2 up to c3, between the blue pieces on b3 and d3, and captures both by Ganh',
      'help.s3.tag': 'Ganh',
      'help.s4.title': 'Ganh on several lines at once',
      'help.s4.text': 'One move can capture along <b>several lines</b> at once, diagonals included. Stepping between two enemy pieces yourself is <b>safe</b>: only the piece that just moved captures, so pieces standing still are never taken by Ganh.',
      'help.s4.alt': 'Red moves diagonally from b2 into c3 and captures two blue pieces on the row and two on the column at once',
      'help.s4.tag': 'Ganh 4 pieces',
      'help.s5.title': 'Vay (surround): trapped groups flip',
      'help.s5.text': 'After the Ganh step, any enemy group with <b>no empty point next to it</b> is taken by a <b>Vay (surround) capture</b> and flips color entirely. Only the opponent\'s pieces are checked, not those of the player who just moved.',
      'help.s5.alt': 'The blue piece in corner a5 is surrounded by three red pieces after red moves into b4, so it is taken by Vay',
      'help.s5.tag': 'a5 surrounded',
      'help.s6.title': 'Mo (open) rule (optional)',
      'help.s6.text': 'Turn it on in Settings (off by default). If your opponent just left a point and moving into that exact point would make a <b>Ganh capture</b>, you <b>must</b> make that move. The piece that has to move blinks.',
      'help.s6.alt': 'Blue just moved from c3 up to c4, opening c3 between two blue pieces; red on c2 must move into c3 for a Ganh capture',
      'help.s6.tag': 'just left c3',
      'help.s7.title': 'Win, lose, draw',
      'help.s7.text': '<b>Capture all</b> your opponent\'s pieces to win. If it is your turn and you have no legal move, you lose. The game is a <b>draw</b> if a position repeats 3 times, or after 60 moves in a row with no capture.',
      'help.s7.alt': 'The last two blue pieces are captured by Ganh and red wins',
      'help.s7.tag': 'last pieces',

      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'theme.auto': 'Auto',
      'theme.light': 'Light',
      'theme.dark': 'Dark',
      'settings.language': 'Language',
      'settings.sound': 'Sound effects',
      'settings.soundDesc': 'Also applies to the PlayNine portal and the other games.',
      'settings.speed': 'Animation speed',
      'speed.slow': 'Slow',
      'speed.medium': 'Medium',
      'speed.fast': 'Fast',
      'speed.off': 'Off',
      'settings.speedDesc': 'While an animation is playing, tap the board (or press <kbd>Space</kbd>) to skip it.',
      'settings.rules': 'Rules · apply from the next game',
      'settings.openRule': 'Mo (open) rule',
      'settings.openRuleDesc': 'If your opponent just left a point and moving into it would make a Ganh capture, you must make that move.',
      'settings.review': 'Review how to play',
      'btn.done': 'Done',
      'settings.version': 'Co Ganh · PlayNine · version',

      'stats.title': 'Statistics',
      'stats.won': 'Wins vs computer',
      'stats.best': 'Best win streak',
      'stats.played': 'Games vs computer',
      'stats.byLevel': 'vs Computer by level',
      'stats.level': 'Level',
      'stats.games': 'Games',
      'stats.wins': 'Won',
      'stats.losses': 'Lost',
      'stats.draws': 'Drawn',
      'stats.pvp': 'Two players',
      'stats.none': 'No games yet.',
      'stats.pvpLine': { one: '1 game · Player 1 won {a} · Player 2 won {b} · drawn {d}', other: '{n} games · Player 1 won {a} · Player 2 won {b} · drawn {d}' },
      'stats.reset': 'Reset',
      'stats.resetConfirm': 'Tap again to clear',
      'btn.close': 'Close',

      'result.youWin': 'You win!',
      'result.aiWin': 'Computer wins',
      'result.playerWins': '{name} wins!',
      'result.draw': 'Draw',
      'result.why.wipe': '{name} has no pieces left on the board.',
      'result.why.wipe.you': 'You have no pieces left on the board.',
      'result.why.stuck': '{name} has no legal move on their turn.',
      'result.why.stuck.you': 'You have no legal move on your turn.',
      'result.why.repeat': 'The same position came up 3 times.',
      'result.why.quiet': '{n} moves in a row without a capture.',
      'result.beat': { one: ' You beat the {level} computer in 1 move.', other: ' You beat the {level} computer in {n} moves.' },
      'result.tryAgain': ' Try again!',
      'result.pieces': { one: 'piece · took {t}', other: 'pieces · took {t}' },
      'result.lineAi': '{level}: won {w} · lost {l} · drawn {d}',
      'result.streak': ' · {n}-game win streak',
      'result.linePvp': 'Two players: Player 1 won {a} · Player 2 won {b} · drawn {d}',
      'result.view': 'View board',
      'result.again': 'Play again',

      'summary.note': 'Won {w}/{p} vs computer · {level}',
      'summary.notePvp': { one: '1 two-player game · no computer games yet', other: '{n} two-player games · no computer games yet' },
      'summary.noteNone': 'No games yet · try playing the computer',
      'summary.won': 'Wins vs computer',
      'summary.played': 'Games played',
      'summary.best': 'Best win streak',
      'summary.yourTurn': 'your turn',
      'summary.aiTurn': 'computer\'s turn',
      'summary.turn': '{name}\'s turn',
      'summary.titleAi': 'Co Ganh vs computer · {level}',
      'summary.titlePvp': 'Co Ganh · two players',
      'summary.detail': '{n0} {c0} – {n1} {c1} pieces · {turn}',
    },

    vi: {
      'meta.title': 'Cờ Gánh',
      'meta.description': 'Cờ Gánh, trò chơi dân gian Việt Nam: đi quân theo đường kẻ, gánh và vây để đổi màu quân đối thủ. Đấu máy 3 mức hoặc hai người, có hướng dẫn minh họa, tự lưu ván.',
      'app.name': 'Cờ Gánh',

      'top.help': 'Cách chơi',
      'top.helpKey': 'Cách chơi (H)',
      'top.stats': 'Thống kê',
      'top.settings': 'Cài đặt',

      'level.easy': 'Dễ',
      'level.medium': 'Vừa',
      'level.hard': 'Khó',
      'level.desc.easy': 'Máy chỉ tính 1–2 nước và hay chọn lệch. Hợp để làm quen luật.',
      'level.desc.medium': 'Máy tính trước 4 nước đi, đối thủ vững để luyện tập.',
      'level.desc.hard': 'Máy tính sâu nhất có thể trong khoảng 1,5 giây mỗi nước.',

      'name.you': 'Bạn',
      'name.ai': 'Máy',
      'name.p1': 'Người 1',
      'name.p2': 'Người 2',
      'color.0': 'đỏ',
      'color.1': 'xanh',
      'side.0': 'Quân đỏ',
      'side.1': 'Quân xanh',

      'mode.ai': 'Đấu máy · {level}',
      'mode.pvp': 'Hai người',
      'mode.openRule': ' · Luật Mở',
      'player.level': 'Mức {level}',
      'player.sub': '{side} · {order}',
      'order.first': 'đi trước',
      'order.second': 'đi sau',
      'player.thinking': 'Đang nghĩ…',
      'player.onBoard': '{n} quân trên bàn',
      'player.took': 'ăn {n}',
      'player.tookAria': 'Đã ăn {n} quân, quân {color}',

      'board.aria': 'Bàn Cờ Gánh 5 x 5. Dùng phím mũi tên để di chuyển giữa các điểm, Enter để chọn quân rồi Enter ở điểm đến để đi.',
      'point.empty': '{c}: trống',
      'point.mine': '{c}: quân {color} của bạn',
      'point.ai': '{c}: quân {color} của máy',
      'point.player': '{c}: quân {color} {name}',
      'point.selected': ', đang chọn',
      'point.gain': ', đi tới đây ăn {n} quân',
      'point.dest': ', đi tới đây được',

      'turn.yourTurn': 'Lượt của bạn',
      'turn.move': '<b>{name}</b> đi {from} → {to}',
      'turn.forced': ' (bắt buộc)',
      'turn.ganh': '<b>{name}</b> gánh {pts}',
      'turn.vay': '<b>{name}</b> vây {n} quân',
      'turn.moving': '<b>{name}</b> đang đi… <span class="skip-hint">chạm để bỏ qua</span>',
      'turn.draw': '<b>Hòa.</b> {why}',
      'turn.youWin': 'Bạn thắng!',
      'turn.aiWin': 'Máy thắng.',
      'turn.playerWins': '{name} thắng!',
      'turn.aiThinking': 'Máy đang nghĩ',
      'turn.mustOpen': '<b>Luật Mở:</b> phải đi vào {to} để gánh',
      'turn.pickDestCap': 'Chọn điểm đến · <b>vòng đỏ</b> là ăn được',
      'turn.pickDest': 'Quân {c} · chọn điểm đến',
      'turn.yours': '<b>Lượt của bạn</b> · chạm một quân đỏ',
      'turn.pvp': 'Lượt của <b>{name}</b> · quân {color}',
      'join.and': ' và ',

      'log.title': 'Diễn biến',
      'log.aria': 'Nhật ký nước đi, mới nhất ở trên',
      'log.empty': 'Chưa có nước đi nào.',
      'log.forced': ' (bắt buộc)',
      'log.ganh': ', gánh {n}',
      'log.vay': ', vây {n}',

      'end.noPieces': '{name} hết quân',
      'end.noMoves': '{name} hết nước đi',
      'end.wins': '{name} thắng',
      'end.repeat': 'Thế cờ lặp lại 3 lần',
      'end.quiet': '{n} nước liên tiếp không ai ăn quân',
      'end.draw': '{why} · hòa',

      'controls.aria': 'Điều khiển',
      'btn.undo': 'Đi lại',
      'btn.undoKey': 'Đi lại (Z)',
      'btn.new': 'Ván mới',
      'btn.newKey': 'Ván mới (N)',
      'kbd.hint': 'Phím tắt: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> chọn điểm · <kbd>Enter</kbd> cầm quân / đi · <kbd>Esc</kbd> bỏ chọn · <kbd>Space</kbd> bỏ qua hiệu ứng · <kbd>Z</kbd> đi lại · <kbd>N</kbd> ván mới · <kbd>H</kbd> cách chơi',

      'toast.over': 'Ván đã kết thúc · bấm Ván mới để chơi tiếp',
      'toast.thinking': 'Máy đang nghĩ, chờ chút nhé',
      'toast.mustOpen': 'Luật Mở: phải đi vào {to} để gánh',
      'toast.blocked': 'Quân này đang bị chặn, chọn quân khác',
      'toast.oneStep': 'Chỉ đi một bước theo đường kẻ tới điểm trống',
      'toast.occupied': 'Điểm này đã có quân',
      'toast.tapColor': 'Chạm một quân {color} trước',
      'toast.tapRed': 'Chạm một quân đỏ của bạn trước',
      'toast.pvpTurn': 'Đến lượt {name} · quân {color}',
      'toast.aiPiece': 'Đó là quân của máy · bạn cầm quân đỏ',
      'toast.undone': 'Đã đi lại',
      'toast.statsReset': 'Đã đặt lại thống kê',
      'toast.rulesNow': 'Đã áp dụng cho ván này',
      'toast.rulesNext': 'Luật mới áp dụng từ ván sau',

      'new.title': 'Ván mới',
      'new.warning': 'Ván đang chơi sẽ bị bỏ và không tính vào thống kê.',
      'new.mode': 'Chế độ',
      'new.modeAi': 'Người vs Máy',
      'new.modePvp': 'Hai người',
      'new.level': 'Mức của máy',
      'new.first': 'Lượt đi đầu',
      'new.youFirst': 'Bạn đi trước',
      'new.aiFirst': 'Máy đi trước',
      'new.pvpDesc': 'Hai người thay phiên nhau trên cùng một máy. Người 1 cầm quân đỏ phía dưới và đi trước.',
      'new.rules': 'Luật Mở: {state}. Đổi trong Cài đặt.',
      'state.on': 'bật',
      'state.off': 'tắt',
      'btn.cancel': 'Hủy',
      'btn.start': 'Bắt đầu',

      'help.title': 'Cách chơi',
      'help.close': 'Đóng',
      'help.steps': 'Các bước',
      'help.prev': 'Trước',
      'help.next': 'Tiếp',
      'help.play': 'Chơi thôi!',
      'help.step': 'Bước {i}/{n}',
      'help.dot': 'Bước {i}',
      'help.s1.title': 'Bàn cờ: 25 điểm, 16 quân',
      'help.s1.text': 'Bàn có <b>5 x 5 điểm</b> nối với nhau bằng đường kẻ. Mỗi bên có <b>8 quân</b>: bạn cầm <b>quân đỏ</b> phía dưới, đối thủ cầm quân xanh phía trên. Cột ghi a–e, hàng ghi 1–5.',
      'help.s1.alt': 'Bàn đầu ván: 8 quân đỏ ở dưới, 8 quân xanh ở trên, 9 điểm giữa còn trống',
      'help.s2.title': 'Đi quân: một bước theo đường kẻ',
      'help.s2.text': 'Mỗi lượt đi <b>một quân, một bước</b> dọc theo đường kẻ tới điểm <b>trống</b> kề bên. Chỉ điểm có đường chéo mới đi chéo được. Chạm quân để thấy các điểm đến, hoặc kéo quân thả vào đó.',
      'help.s2.alt': 'Quân ở b4 có đường chéo nên đi được 8 hướng; quân ở d1 không có đường chéo chỉ đi được 3 hướng',
      'help.s2.tag8': '8 hướng',
      'help.s2.tag3': '3 hướng',
      'help.s3.title': 'Gánh: chen vào giữa là ăn',
      'help.s3.text': 'Đi vào điểm nằm <b>giữa hai quân đối thủ</b> trên cùng một đường thẳng thì <b>gánh</b>: cả hai quân đó đổi sang màu của bạn và thành quân của bạn.',
      'help.s3.alt': 'Quân đỏ đi từ c2 lên c3, nằm giữa hai quân xanh ở b3 và d3 nên gánh cả hai',
      'help.s3.tag': 'gánh',
      'help.s4.title': 'Gánh nhiều đường cùng lúc',
      'help.s4.text': 'Một nước có thể gánh <b>nhiều đường</b> một lúc, kể cả đường chéo. Tự đi vào giữa hai quân đối thủ thì <b>an toàn</b>: chỉ quân vừa đi mới gánh, quân đứng yên không bị gánh.',
      'help.s4.alt': 'Quân đỏ đi chéo từ b2 vào c3, gánh cùng lúc hai quân xanh hàng ngang và hai quân xanh hàng dọc',
      'help.s4.tag': 'gánh 4 quân',
      'help.s5.title': 'Vây: hết đường thoát là mất',
      'help.s5.text': 'Gánh xong, nhóm quân đối thủ nào <b>không còn điểm trống kề bên</b> để đi thì bị <b>vây</b> và đổi màu hết. Chỉ xét quân của bên vừa bị đi, không xét quân của người vừa đi.',
      'help.s5.alt': 'Quân xanh ở góc a5 bị ba quân đỏ bao quanh sau khi quân đỏ đi vào b4 nên bị vây',
      'help.s5.tag': 'a5 bị vây',
      'help.s6.title': 'Luật Mở (tùy chọn)',
      'help.s6.text': 'Bật trong Cài đặt, mặc định tắt. Đối thủ vừa rời khỏi một điểm mà bạn đi vào đúng điểm đó <b>gánh được</b> thì <b>bắt buộc</b> phải đi nước đó. Quân phải đi sẽ nhấp nháy.',
      'help.s6.alt': 'Quân xanh vừa rời c3 lên c4, mở ra điểm c3 giữa hai quân xanh; quân đỏ ở c2 bắt buộc đi vào c3 để gánh',
      'help.s6.tag': 'vừa rời c3',
      'help.s7.title': 'Thắng, thua, hòa',
      'help.s7.text': '<b>Ăn hết quân</b> đối thủ là thắng. Đến lượt mà không còn nước đi thì thua. <b>Hòa</b> khi một thế cờ lặp lại 3 lần, hoặc 60 nước liên tiếp không ai ăn được quân.',
      'help.s7.alt': 'Hai quân xanh cuối cùng bị gánh, quân đỏ thắng',
      'help.s7.tag': 'quân cuối',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'theme.auto': 'Tự động',
      'theme.light': 'Sáng',
      'theme.dark': 'Tối',
      'settings.language': 'Ngôn ngữ',
      'settings.sound': 'Âm thanh',
      'settings.soundDesc': 'Áp dụng chung cho cổng PlayNine và các game khác.',
      'settings.speed': 'Tốc độ hiệu ứng',
      'speed.slow': 'Chậm',
      'speed.medium': 'Vừa',
      'speed.fast': 'Nhanh',
      'speed.off': 'Tắt',
      'settings.speedDesc': 'Đang chạy hiệu ứng, chạm vào bàn (hoặc nhấn <kbd>Space</kbd>) để bỏ qua.',
      'settings.rules': 'Luật chơi · áp dụng từ ván mới',
      'settings.openRule': 'Luật Mở',
      'settings.openRuleDesc': 'Đối thủ vừa rời một điểm mà bạn đi vào đó gánh được thì bắt buộc phải đi nước đó.',
      'settings.review': 'Xem lại cách chơi',
      'btn.done': 'Xong',
      'settings.version': 'Cờ Gánh · PlayNine · phiên bản',

      'stats.title': 'Thống kê',
      'stats.won': 'Thắng máy',
      'stats.best': 'Chuỗi dài nhất',
      'stats.played': 'Ván đấu máy',
      'stats.byLevel': 'Đấu máy theo mức',
      'stats.level': 'Mức',
      'stats.games': 'Ván',
      'stats.wins': 'Thắng',
      'stats.losses': 'Thua',
      'stats.draws': 'Hòa',
      'stats.pvp': 'Hai người',
      'stats.none': 'Chưa có ván nào.',
      'stats.pvpLine': '{n} ván · Người 1 thắng {a} · Người 2 thắng {b} · hòa {d}',
      'stats.reset': 'Đặt lại',
      'stats.resetConfirm': 'Bấm lần nữa để xóa',
      'btn.close': 'Đóng',

      'result.youWin': 'Bạn thắng!',
      'result.aiWin': 'Máy thắng',
      'result.playerWins': '{name} thắng!',
      'result.draw': 'Hòa',
      'result.why.wipe': '{name} không còn quân nào trên bàn.',
      'result.why.stuck': '{name} đến lượt mà không còn nước đi.',
      'result.why.repeat': 'Một thế cờ lặp lại 3 lần.',
      'result.why.quiet': '{n} nước liên tiếp không ai ăn được quân.',
      'result.beat': ' Bạn thắng máy mức {level} sau {n} nước.',
      'result.tryAgain': ' Thử lại nhé!',
      'result.pieces': 'quân · đã ăn {t}',
      'result.lineAi': 'Mức {level}: thắng {w} · thua {l} · hòa {d}',
      'result.streak': ' · chuỗi {n} ván thắng',
      'result.linePvp': 'Hai người: Người 1 thắng {a} · Người 2 thắng {b} · hòa {d}',
      'result.view': 'Xem bàn',
      'result.again': 'Chơi tiếp',

      'summary.note': 'Thắng máy {w}/{p} ván · mức {level}',
      'summary.notePvp': '{n} ván hai người · chưa đấu máy',
      'summary.noteNone': 'Chưa chơi ván nào · thử đấu máy nhé',
      'summary.won': 'Thắng máy',
      'summary.played': 'Ván đã chơi',
      'summary.best': 'Chuỗi thắng dài nhất',
      'summary.yourTurn': 'đến lượt bạn',
      'summary.aiTurn': 'đến lượt máy',
      'summary.turn': 'đến lượt {name}',
      'summary.titleAi': 'Cờ Gánh với máy · {level}',
      'summary.titlePvp': 'Cờ Gánh hai người',
      'summary.detail': '{n0} {c0} – {n1} {c1} quân · {turn}',
    },
  };

  function readLang() {
    try {
      const v = localStorage.getItem(KEY);
      if (v === 'en' || v === 'vi') return v;
    } catch (e) {}
    return 'en';
  }

  const lang = readLang();
  document.documentElement.lang = lang;

  // Chuỗi số nhiều dạng { one, other }; tiếng Việt không có số nhiều nên chỉ là chuỗi
  function pick(s, params) {
    if (s && typeof s === 'object') return params && params.n === 1 && s.one != null ? s.one : s.other;
    return s;
  }

  function t(key, params) {
    let s = DICT[lang][key];
    if (s == null) s = DICT.en[key];
    if (s == null) return key;
    s = pick(s, params);
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
    return s;
  }

  // Có key trong đúng ngôn ngữ đang dùng không (không lấy tiếng Anh bù)
  const has = (key) => DICT[lang][key] != null;

  function apply(rootEl) {
    const r = rootEl || document;
    for (const el of r.querySelectorAll('[data-i18n]')) el.textContent = t(el.getAttribute('data-i18n'));
    for (const el of r.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.getAttribute('data-i18n-html'));
    for (const el of r.querySelectorAll('[data-i18n-attr]')) {
      for (const pair of el.getAttribute('data-i18n-attr').split(';')) {
        const k = pair.indexOf(':');
        if (k > 0) el.setAttribute(pair.slice(0, k).trim(), t(pair.slice(k + 1).trim()));
      }
    }
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
    t,
    has,
    apply,
    onBeforeReload: null, // game gán hàm lưu ván vào đây
    reload() {
      try { if (typeof I18N.onBeforeReload === 'function') I18N.onBeforeReload(); } catch (e) {}
      location.reload();
    },
    set(next) {
      if (next !== 'en' && next !== 'vi') return;
      try { localStorage.setItem(KEY, next); } catch (e) {}
      if (next !== lang) I18N.reload();
    },
    fmtNumber(n, opts) {
      try { return Number(n).toLocaleString(LOCALES[lang], opts); } catch (e) { return String(n); }
    },
    fmtDate(d, opts) {
      try { return new Date(d).toLocaleString(LOCALES[lang], opts); } catch (e) { return String(d); }
    },
  };

  // Trang khác (cổng hoặc tab khác) đổi ngôn ngữ: tải lại để theo
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    const v = e.newValue === 'vi' ? 'vi' : 'en';
    if (v !== lang) I18N.reload();
  });

  root.I18N = I18N;
})(window);
