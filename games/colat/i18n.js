/* =====================================================================
 * Cờ Lật - Đa ngôn ngữ (tiếng Anh mặc định + tiếng Việt)
 *   Nạp trước engine.js / app.js. Khóa ngôn ngữ dùng chung với cổng PlayNine:
 *   localStorage['playnine-lang'] = 'en' | 'vi'. Thiếu / sai thì dùng 'en'.
 *   I18N.t(key, params)  tra từ điển, thiếu thì lấy bản 'en', rồi trả lại chính khóa
 *   I18N.apply(root)     điền [data-i18n], [data-i18n-html], [data-i18n-attr]
 *   I18N.set(lang)       lưu ngôn ngữ rồi tải lại trang (sau khi game đã lưu ván)
 * ===================================================================== */
(function () {
  'use strict';

  var KEY = 'playnine-lang';
  var LOCALE = { en: 'en-US', vi: 'vi-VN' };

  var DICT = {
    en: {
      'meta.title': 'Reversi',
      'meta.description': 'Reversi: place a disc to trap your opponent\'s discs and flip them to your color, on an 8x8 board. Play the computer at 3 levels or two players, with an illustrated guide and autosave.',
      'app.name': 'Reversi',

      'top.help': 'How to play',
      'top.helpKey': 'How to play (H)',
      'top.stats': 'Statistics',
      'top.settings': 'Settings',

      'board.label': 'Reversi board, 8 x 8, columns a to h, rows 1 to 8. Use the arrow keys to choose a square, Enter to place a disc.',
      'log.title': 'Game log',
      'log.label': 'Move log, newest first',
      'log.empty': 'No moves yet.',
      'controls.label': 'Controls',
      'btn.undo': 'Undo',
      'btn.undoKey': 'Undo (Z)',
      'btn.new': 'New game',
      'btn.newKey': 'New game (N)',
      'kbd.hint': 'Shortcuts: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> select square · <kbd>Enter</kbd> place disc · <kbd>Space</kbd> skip animation · <kbd>Z</kbd> undo · <kbd>N</kbd> new game · <kbd>H</kbd> how to play',

      'new.title': 'New game',
      'new.warning': 'The current game will be abandoned and won\'t count in your statistics.',
      'new.mode': 'Mode',
      'new.modeAi': 'vs Computer',
      'new.modePvp': 'Two players',
      'new.level': 'Computer level',
      'new.color': 'You play',
      'new.black': 'Black · moves first',
      'new.white': 'White · moves second',
      'new.pvpDesc': 'Two players take turns on the same device. Player 1 plays Black and moves first.',
      'btn.cancel': 'Cancel',
      'btn.start': 'Start',

      'level.easy': 'Easy',
      'level.medium': 'Medium',
      'level.hard': 'Hard',
      'levelDesc.easy': 'The computer looks only 1–2 moves ahead and often picks loosely. Good for learning the rules.',
      'levelDesc.medium': 'The computer looks 4 moves ahead, holds on to corners and limits your moves.',
      'levelDesc.hard': 'The computer searches as deep as it can in about 1.5 seconds, and plays the endgame perfectly to the last move.',

      'help.title': 'How to play',
      'btn.close': 'Close',
      'help.steps': 'Steps',
      'help.prev': 'Back',
      'help.next': 'Next',
      'help.play': 'Let\'s play!',
      'help.step': 'Step {i}/{n}',
      'help.dot': 'Step {i}',

      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'settings.auto': 'Auto',
      'settings.light': 'Light',
      'settings.dark': 'Dark',
      'settings.lang': 'Language',
      'settings.speed': 'Flip speed',
      'speed.slow': 'Slow',
      'speed.medium': 'Medium',
      'speed.fast': 'Fast',
      'speed.off': 'Off',
      'settings.speedDesc': 'While discs are flipping, tap the board (or press <kbd>Space</kbd>) to skip the animation.',
      'settings.sound': 'Sound',
      'settings.soundDesc': 'Sound effects for placing, flipping discs and results. Shared with PlayNine.',
      'settings.hints': 'Move hints',
      'settings.hintsDesc': 'Show small dots on the squares where you can place a disc on your turn.',
      'settings.replayHelp': 'Review how to play',
      'settings.done': 'Done',
      'settings.version': 'Reversi · PlayNine · version',

      'stats.title': 'Statistics',
      'stats.won': 'Wins vs computer',
      'stats.best': 'Best streak',
      'stats.margin': 'Biggest win',
      'stats.byLevel': 'vs Computer by level',
      'stats.level': 'Level',
      'stats.games': 'Games',
      'stats.wins': 'Won',
      'stats.losses': 'Lost',
      'stats.draws': 'Drawn',
      'stats.pvp': 'Two players',
      'stats.none': 'No games yet.',
      'stats.pvpLine': { one: '1 game · Player 1 (Black) won {a} · Player 2 (White) won {b} · drawn {d}', other: '{n} games · Player 1 (Black) won {a} · Player 2 (White) won {b} · drawn {d}' },
      'stats.reset': 'Reset',
      'stats.resetConfirm': 'Tap again to clear',
      'stats.close': 'Close',

      'result.view': 'View board',
      'result.again': 'Play again',
      'result.youWin': 'You win!',
      'result.aiWins': 'Computer wins',
      'result.draw': 'Draw',
      'result.drawSub': 'Both sides have the same number of discs.',
      'result.youWinSub': { one: 'You beat the {level} computer by 1 disc.', other: 'You beat the {level} computer by {n} discs.' },
      'result.youLoseSub': { one: 'The computer won by 1 disc. Try again!', other: 'The computer won by {n} discs. Try again!' },
      'result.nameWins': '{name} wins!',
      'result.colorBy': { one: '{color} wins by 1 disc.', other: '{color} wins by {n} discs.' },
      'result.noMoves': 'Both sides ran out of moves before the board was full. ',
      'result.discs': '{color} discs',
      'result.levelLine': '{level}: won {won} · lost {lost} · drawn {drawn}',
      'result.streak': ' · {n}-game win streak',
      'result.pvpLine': 'Two players: Player 1 won {a} · Player 2 won {b} · drawn {d}',

      'who.you': 'You',
      'who.ai': 'Computer',
      'who.p1': 'Player 1',
      'who.p2': 'Player 2',
      'who.youLc': 'you',
      'who.aiLc': 'computer',
      'color.0': 'Black',
      'color.1': 'White',
      'colorl.0': 'black',
      'colorl.1': 'white',

      'pass': '{color} ({who}) has no moves and passes',
      'log.move': '{name}: {sq}, flips {n}',
      'log.corner': ' · takes a corner',
      'log.full': 'Board full',
      'log.noMoves': 'Neither side can move',
      'log.score': ' · Black {a} – White {b}',

      'toast.over': 'The game is over · tap New game to play again',
      'toast.thinking': 'The computer is thinking, hang on',
      'toast.taken': 'That square is already taken',
      'toast.noFlank': '{sq} doesn\'t trap any {color} discs',
      'toast.undone': 'Move undone',
      'toast.statsReset': 'Statistics reset',

      'sum.noteAi': { one: 'Won {won}/1 game vs computer · {level} level', other: 'Won {won}/{n} games vs computer · {level} level' },
      'sum.notePvp': { one: '1 two-player game · no computer games yet', other: '{n} two-player games · no computer games yet' },
      'sum.noteNone': 'No games yet · try playing the computer',
      'sum.won': 'Wins vs computer',
      'sum.played': 'Games played',
      'sum.margin': 'Biggest win',
      'sum.turnYou': 'your turn',
      'sum.turnAi': 'computer\'s turn',
      'sum.turnOf': '{name}\'s turn',
      'sum.titleAi': 'Reversi vs computer · {level}',
      'sum.titlePvp': 'Reversi · two players',
      'sum.detail': '{p0} (Black) {a} – {p1} (White) {b} discs · {turn}',

      'sq.empty': 'empty',
      'sq.playable': ', playable, flips {n}',
      'sq.disc': '{color} disc',
      'sq.last': ', last move',
      'score.label': { one: '1 {color} disc', other: '{n} {color} discs' },

      'mode.ai': 'vs Computer · {level}',
      'mode.pvp': 'Two players',
      'player.sub': '{color}<span class="psub-x"> · {extra}</span>',
      'player.level': '{level} level',
      'player.first': 'moves first',
      'player.second': 'moves second',
      'player.thinking': 'Thinking…',

      'turn.placing': '<b>{name}</b> plays {sq}… <span class="skip-hint">tap to skip</span>',
      'turn.placingYou': '<b>You</b> play {sq}… <span class="skip-hint">tap to skip</span>',
      'turn.draw': '<b>Draw {a} – {b}.</b> Game over',
      'turn.youWin': 'You win!',
      'turn.aiWins': 'Computer wins.',
      'turn.nameWins': '{name} wins!',
      'turn.over': '<b>{who}</b> Black {a} – White {b}',
      'turn.aiPicks': '<b>Computer</b> picks {sq}',
      'turn.thinking': 'Computer is thinking',
      'turn.again': 'Your move again',
      'turn.yours': '<b>Your turn</b> · {hint}',
      'turn.hintDots': 'tap a dotted square',
      'turn.hintFlank': 'tap a square that traps {color} discs',
      'turn.of': '<b>{name}</b> to move ({color})',

      'help.1.title': 'An 8 x 8 board, Black moves first',
      'help.1.text': 'The game starts with <b>4 discs</b> placed diagonally in the center. <b>Black moves first</b>, and the players take turns placing one disc of their color on an empty square. Small dots on the board mark the squares where you <b>can play</b>.',
      'help.1.alt': 'Starting position: d4 and e5 White, e4 and d5 Black; Black can play d3, c4, f5 or e6',
      'help.2.title': 'Trap to flip',
      'help.2.text': 'A new disc must <b>trap</b> at least one unbroken line of opponent discs between it and one of your discs. Every trapped disc <b>flips to your color</b>. For example, Black plays d3 and traps d4 between d3 and d5.',
      'help.2.alt': 'Black plays d3; the White disc on d4 is trapped between d3 and d5, so it flips to Black',
      'help.3.title': 'Flip several lines at once',
      'help.3.text': 'You can trap in all <b>8 directions</b>: horizontally, vertically and diagonally. Every trapped line flips at the same time. An <b>empty square</b> in between or the <b>edge of the board</b> means no trap.',
      'help.3.alt': 'Black plays d5 and flips 5 White discs at once in 4 directions: up, down, left and right',
      'help.4.title': 'No move means you pass',
      'help.4.text': 'If it is your turn and no square traps anything, you <b>pass</b> and your opponent moves again. The game tells you clearly, for example <b>“White has no moves and passes”</b>. Here White has only h7 and cannot trap anything.',
      'help.4.alt': 'White has a single disc on h7 and no square to play; Black moves again and can play h6',
      'help.5.title': 'Game over: count the discs',
      'help.5.text': 'When <b>neither side can move</b> (usually when the board is full), the side with <b>more discs wins</b>; equal counts are a draw. Tip: <b>corners</b> can never be flipped; the squares diagonally next to a corner (red) tend to give the corner away.',
      'help.5.alt': 'The four corners are valuable squares; the four squares diagonally next to them, b2, g2, b7 and g7, are dangerous',
    },

    vi: {
      'meta.title': 'Cờ Lật',
      'meta.description': 'Cờ Lật: đặt quân kẹp quân đối thủ để lật sang màu mình, bàn 8x8. Đấu máy 3 mức hoặc hai người, có hướng dẫn minh họa, tự lưu ván.',
      'app.name': 'Cờ Lật',

      'top.help': 'Cách chơi',
      'top.helpKey': 'Cách chơi (H)',
      'top.stats': 'Thống kê',
      'top.settings': 'Cài đặt',

      'board.label': 'Bàn Cờ Lật 8 x 8, cột a đến h, hàng 1 đến 8. Dùng phím mũi tên để chọn ô, Enter để đặt quân.',
      'log.title': 'Diễn biến',
      'log.label': 'Nhật ký nước đi, mới nhất ở trên',
      'log.empty': 'Chưa có nước đi nào.',
      'controls.label': 'Điều khiển',
      'btn.undo': 'Đi lại',
      'btn.undoKey': 'Đi lại (Z)',
      'btn.new': 'Ván mới',
      'btn.newKey': 'Ván mới (N)',
      'kbd.hint': 'Phím tắt: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> chọn ô · <kbd>Enter</kbd> đặt quân · <kbd>Space</kbd> bỏ qua hiệu ứng · <kbd>Z</kbd> đi lại · <kbd>N</kbd> ván mới · <kbd>H</kbd> cách chơi',

      'new.title': 'Ván mới',
      'new.warning': 'Ván đang chơi sẽ bị bỏ và không tính vào thống kê.',
      'new.mode': 'Chế độ',
      'new.modeAi': 'Người vs Máy',
      'new.modePvp': 'Hai người',
      'new.level': 'Mức của máy',
      'new.color': 'Bạn cầm quân',
      'new.black': 'Đen · đi trước',
      'new.white': 'Trắng · đi sau',
      'new.pvpDesc': 'Hai người thay phiên nhau trên cùng một máy. Người 1 cầm quân Đen và đi trước.',
      'btn.cancel': 'Hủy',
      'btn.start': 'Bắt đầu',

      'level.easy': 'Dễ',
      'level.medium': 'Vừa',
      'level.hard': 'Khó',
      'levelDesc.easy': 'Máy chỉ tính 1–2 nước và hay chọn lệch. Hợp để làm quen luật.',
      'levelDesc.medium': 'Máy tính trước 4 nước, biết giữ góc và hạn chế nước đi của bạn.',
      'levelDesc.hard': 'Máy tính sâu nhất có thể trong khoảng 1,5 giây, cuối ván tính chính xác tới nước cuối.',

      'help.title': 'Cách chơi',
      'btn.close': 'Đóng',
      'help.steps': 'Các bước',
      'help.prev': 'Trước',
      'help.next': 'Tiếp',
      'help.play': 'Chơi thôi!',
      'help.step': 'Bước {i}/{n}',
      'help.dot': 'Bước {i}',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'settings.auto': 'Tự động',
      'settings.light': 'Sáng',
      'settings.dark': 'Tối',
      'settings.lang': 'Ngôn ngữ',
      'settings.speed': 'Tốc độ lật quân',
      'speed.slow': 'Chậm',
      'speed.medium': 'Vừa',
      'speed.fast': 'Nhanh',
      'speed.off': 'Tắt',
      'settings.speedDesc': 'Đang lật, chạm vào bàn (hoặc nhấn <kbd>Space</kbd>) để bỏ qua hiệu ứng.',
      'settings.sound': 'Âm thanh',
      'settings.soundDesc': 'Tiếng đặt quân, lật quân và kết thúc ván. Dùng chung với PlayNine.',
      'settings.hints': 'Gợi ý nước đi',
      'settings.hintsDesc': 'Hiện chấm nhỏ ở các ô đặt được quân trong lượt của bạn.',
      'settings.replayHelp': 'Xem lại cách chơi',
      'settings.done': 'Xong',
      'settings.version': 'Cờ Lật · PlayNine · phiên bản',

      'stats.title': 'Thống kê',
      'stats.won': 'Thắng máy',
      'stats.best': 'Chuỗi dài nhất',
      'stats.margin': 'Thắng đậm',
      'stats.byLevel': 'Đấu máy theo mức',
      'stats.level': 'Mức',
      'stats.games': 'Ván',
      'stats.wins': 'Thắng',
      'stats.losses': 'Thua',
      'stats.draws': 'Hòa',
      'stats.pvp': 'Hai người',
      'stats.none': 'Chưa có ván nào.',
      'stats.pvpLine': '{n} ván · Người 1 (Đen) thắng {a} · Người 2 (Trắng) thắng {b} · hòa {d}',
      'stats.reset': 'Đặt lại',
      'stats.resetConfirm': 'Bấm lần nữa để xóa',
      'stats.close': 'Đóng',

      'result.view': 'Xem bàn',
      'result.again': 'Chơi tiếp',
      'result.youWin': 'Bạn thắng!',
      'result.aiWins': 'Máy thắng',
      'result.draw': 'Hòa',
      'result.drawSub': 'Hai bên bằng số quân.',
      'result.youWinSub': 'Bạn hơn máy mức {level} {n} quân.',
      'result.youLoseSub': 'Máy hơn {n} quân. Thử lại nhé!',
      'result.nameWins': '{name} thắng!',
      'result.colorBy': '{color} hơn {n} quân.',
      'result.noMoves': 'Hai bên đều hết nước đi trước khi bàn đầy. ',
      'result.discs': 'quân {color}',
      'result.levelLine': 'Mức {level}: thắng {won} · thua {lost} · hòa {drawn}',
      'result.streak': ' · chuỗi {n} ván thắng',
      'result.pvpLine': 'Hai người: Người 1 thắng {a} · Người 2 thắng {b} · hòa {d}',

      'who.you': 'Bạn',
      'who.ai': 'Máy',
      'who.p1': 'Người 1',
      'who.p2': 'Người 2',
      'who.youLc': 'bạn',
      'who.aiLc': 'máy',
      'color.0': 'Đen',
      'color.1': 'Trắng',
      'colorl.0': 'Đen',
      'colorl.1': 'Trắng',

      'pass': 'Bên {color} ({who}) không có nước, mất lượt',
      'log.move': '{name}: {sq}, lật {n}',
      'log.corner': ' · chiếm góc',
      'log.full': 'Bàn đầy',
      'log.noMoves': 'Hai bên hết nước',
      'log.score': ' · Đen {a} – Trắng {b}',

      'toast.over': 'Ván đã kết thúc · bấm Ván mới để chơi tiếp',
      'toast.thinking': 'Máy đang nghĩ, chờ chút nhé',
      'toast.taken': 'Ô này đã có quân',
      'toast.noFlank': 'Ô {sq} không kẹp được quân {color} nào',
      'toast.undone': 'Đã đi lại',
      'toast.statsReset': 'Đã đặt lại thống kê',

      'sum.noteAi': 'Thắng máy {won}/{n} ván · mức {level}',
      'sum.notePvp': '{n} ván hai người · chưa đấu máy',
      'sum.noteNone': 'Chưa chơi ván nào · thử đấu máy nhé',
      'sum.won': 'Thắng máy',
      'sum.played': 'Ván đã chơi',
      'sum.margin': 'Thắng đậm nhất',
      'sum.turnYou': 'đến lượt bạn',
      'sum.turnAi': 'đến lượt máy',
      'sum.turnOf': 'đến lượt {name}',
      'sum.titleAi': 'Cờ Lật với máy · {level}',
      'sum.titlePvp': 'Cờ Lật hai người',
      'sum.detail': '{p0} (Đen) {a} – {p1} (Trắng) {b} quân · {turn}',

      'sq.empty': 'trống',
      'sq.playable': ', đặt được, lật {n}',
      'sq.disc': 'quân {color}',
      'sq.last': ', nước vừa đi',
      'score.label': '{n} quân {color}',

      'mode.ai': 'Đấu máy · {level}',
      'mode.pvp': 'Hai người',
      'player.sub': '<span class="psub-x">Quân </span>{color}<span class="psub-x"> · {extra}</span>',
      'player.level': 'mức {level}',
      'player.first': 'đi trước',
      'player.second': 'đi sau',
      'player.thinking': 'Đang nghĩ…',

      'turn.placing': '<b>{name}</b> đặt {sq}… <span class="skip-hint">chạm để bỏ qua</span>',
      'turn.placingYou': '<b>Bạn</b> đặt {sq}… <span class="skip-hint">chạm để bỏ qua</span>',
      'turn.draw': '<b>Hòa {a} – {b}.</b> Hết ván',
      'turn.youWin': 'Bạn thắng!',
      'turn.aiWins': 'Máy thắng.',
      'turn.nameWins': '{name} thắng!',
      'turn.over': '<b>{who}</b> Đen {a} – Trắng {b}',
      'turn.aiPicks': '<b>Máy</b> chọn ô {sq}',
      'turn.thinking': 'Máy đang nghĩ',
      'turn.again': 'Bạn đi tiếp',
      'turn.yours': '<b>Lượt của bạn</b> · {hint}',
      'turn.hintDots': 'chạm ô có chấm',
      'turn.hintFlank': 'chạm ô kẹp được quân {color}',
      'turn.of': 'Lượt của <b>{name}</b> ({color})',

      'help.1.title': 'Bàn 8 x 8, Đen đi trước',
      'help.1.text': 'Đầu ván có <b>4 quân</b> xếp chéo ở giữa. <b>Đen đi trước</b>, hai bên lần lượt đặt một quân màu mình vào ô trống. Chấm nhỏ trên bàn là những ô <b>đặt được</b>.',
      'help.1.alt': 'Bàn đầu ván: d4 và e5 Trắng, e4 và d5 Đen; Đen đặt được ở d3, c4, f5, e6',
      'help.2.title': 'Kẹp để lật',
      'help.2.text': 'Quân mới phải <b>kẹp</b> ít nhất một hàng quân đối thủ nằm liền nhau giữa nó và một quân của bạn. Mọi quân bị kẹp <b>lật sang màu bạn</b>. Ví dụ Đen đặt d3 kẹp d4 giữa d3 và d5.',
      'help.2.alt': 'Đen đặt ở d3, quân Trắng d4 bị kẹp giữa d3 và d5 nên lật sang Đen',
      'help.3.title': 'Lật nhiều hàng cùng lúc',
      'help.3.text': 'Kẹp được theo cả <b>8 hướng</b>: ngang, dọc, chéo. Mọi hàng bị kẹp đều lật cùng lúc. Có <b>ô trống</b> chen giữa hoặc chạm <b>mép bàn</b> thì không kẹp được.',
      'help.3.alt': 'Đen đặt ở d5, lật cùng lúc 5 quân Trắng theo 4 hướng: lên, xuống, trái, phải',
      'help.4.title': 'Không có nước thì mất lượt',
      'help.4.text': 'Đến lượt mà không có ô nào kẹp được, bên đó <b>mất lượt</b> và đối thủ đi tiếp. Game báo rõ, ví dụ <b>“Bên Trắng không có nước, mất lượt”</b>. Ở hình này Trắng chỉ còn h7, không kẹp được gì.',
      'help.4.alt': 'Trắng chỉ còn một quân ở h7, không có ô nào đặt được; Đen đi tiếp và có thể đặt h6',
      'help.5.title': 'Hết ván: đếm quân',
      'help.5.text': 'Khi <b>cả hai bên đều không đi được</b> (thường là lúc bàn đầy), bên <b>nhiều quân hơn thắng</b>, bằng nhau là hòa. Mẹo: <b>góc</b> không bao giờ bị lật; ô chéo sát góc (đỏ) dễ dâng góc cho đối thủ.',
      'help.5.alt': 'Bốn góc là ô quý, bốn ô chéo sát góc b2, g2, b7, g7 là ô nguy hiểm',
    },
  };

  var lang = 'en';
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'vi') lang = saved;
  } catch (e) {}
  document.documentElement.lang = lang;

  function lookup(key) {
    var d = DICT[lang];
    if (d && Object.prototype.hasOwnProperty.call(d, key)) return d[key];
    if (Object.prototype.hasOwnProperty.call(DICT.en, key)) return DICT.en[key];
    return null;
  }

  // Tra chuỗi theo khóa; giá trị dạng { one, other } là số ít / số nhiều theo params.n
  function t(key, params) {
    var v = lookup(key);
    if (v == null) return key;
    if (typeof v === 'object') v = params && params.n === 1 && v.one != null ? v.one : v.other;
    return String(v).replace(/\{(\w+)\}/g, function (m, k) {
      return params && params[k] != null ? String(params[k]) : m;
    });
  }

  function apply(root) {
    root = root || document;
    var i, el, list;
    list = root.querySelectorAll('[data-i18n]');
    for (i = 0; i < list.length; i++) { el = list[i]; el.textContent = t(el.getAttribute('data-i18n')); }
    list = root.querySelectorAll('[data-i18n-html]');
    for (i = 0; i < list.length; i++) { el = list[i]; el.innerHTML = t(el.getAttribute('data-i18n-html')); }
    list = root.querySelectorAll('[data-i18n-attr]');
    for (i = 0; i < list.length; i++) {
      el = list[i];
      var pairs = el.getAttribute('data-i18n-attr').split(';');
      for (var j = 0; j < pairs.length; j++) {
        var p = pairs[j].split(':');
        if (p.length === 2 && p[0].trim()) el.setAttribute(p[0].trim(), t(p[1].trim()));
      }
    }
    if (root === document) {
      document.title = t('meta.title');
      var meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', t('meta.description'));
      var apple = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (apple) apple.setAttribute('content', t('meta.title'));
    }
  }

  // Hàm lưu ván của game, gọi trước khi tải lại trang
  var saveHook = null;
  function beforeReload() {
    if (saveHook) { try { saveHook(); } catch (e) {} }
  }

  function set(next) {
    if (next !== 'en' && next !== 'vi') return;
    beforeReload();
    try { localStorage.setItem(KEY, next); } catch (e) {}
    location.reload();
  }

  // Trang khác (cổng PlayNine hoặc game khác) đổi ngôn ngữ: lưu ván rồi tải lại theo
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) { beforeReload(); location.reload(); }
  });

  function fmtNumber(n, opts) {
    try { return new Intl.NumberFormat(LOCALE[lang], opts).format(n); } catch (e) { return String(n); }
  }
  function fmtDate(d, opts) {
    try { return new Intl.DateTimeFormat(LOCALE[lang], opts).format(d); } catch (e) { return String(d); }
  }

  window.I18N = {
    lang: lang,
    t: t,
    apply: apply,
    set: set,
    onSave: function (fn) { saveHook = fn; },
    fmtNumber: fmtNumber,
    fmtDate: fmtDate,
  };
})();
