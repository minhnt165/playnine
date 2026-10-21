/* =====================================================================
 * Ô Ăn Quan - Ngôn ngữ (tiếng Anh mặc định + tiếng Việt)
 * Nạp TRƯỚC engine.js / app.js. Khóa dùng chung cả cổng PlayNine:
 * localStorage['playnine-lang'] = 'en' | 'vi' (thiếu / sai thì 'en').
 *   I18N.t(key, params)  tra chuỗi, thiếu thì lấy bản 'en', rồi trả lại key;
 *                        {tên} thay bằng params; số nhiều tiếng Anh { one, other } theo params.n
 *   I18N.apply(root)     điền [data-i18n], [data-i18n-html], [data-i18n-attr="attr:key;..."]
 *   I18N.set(lang)       lưu rồi tải lại trang (gọi I18N.beforeReload trước nếu có)
 * ===================================================================== */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'playnine-lang';
  const LOCALES = { en: 'en-US', vi: 'vi-VN' };

  const DICT = {
    en: {
      'meta.title': 'O An Quan',
      'meta.description': 'O An Quan, the Vietnamese mancala folk game: sow stones, capture citizens and mandarins. Play the computer at 3 levels or with two players, with an illustrated tutorial and autosave.',
      'app.name': 'O An Quan',

      'top.help': 'How to play',
      'top.helpKey': 'How to play (H)',
      'top.stats': 'Statistics',
      'top.settings': 'Settings',

      'player.you': 'You',
      'player.ai': 'Computer',
      'player.p1': 'Player 1',
      'player.p2': 'Player 2',
      'player.level': '{level} level',
      'player.first': 'Moves first',
      'player.second': 'Moves second',
      'player.bottomRow': 'Bottom row · ',
      'player.topRow': 'Top row · ',
      'player.thinking': 'Thinking…',

      'level.easy': 'Easy',
      'level.medium': 'Medium',
      'level.hard': 'Hard',
      'levelDesc.easy': 'The computer looks only 1–2 turns ahead and often picks loosely. Good for learning the rules.',
      'levelDesc.medium': 'The computer looks 4 turns ahead — a solid sparring partner.',
      'levelDesc.hard': 'The computer searches as deep as it can in about 1.5 seconds per move.',

      'mode.ai': 'Vs computer · {level}',
      'mode.pvp': 'Two players',
      'mode.noQuanNon': ' · no young mandarin',

      'board.aria': 'O An Quan board. Use the left and right arrow keys to choose a square, Enter to pick it up, then the left or right arrow to sow.',
      'board.sowLeft': 'Sow left',
      'board.sowRight': 'Sow right',
      'board.sowSquareLeft': 'Sow square {no} to the left',
      'board.sowSquareRight': 'Sow square {no} to the right',
      'board.quanLeft': 'Left mandarin square',
      'board.quanRight': 'Right mandarin square',
      'board.quanHas': { one: '{sq}: mandarin in place, 1 citizen', other: '{sq}: mandarin in place, {n} citizens' },
      'board.quanGone': { one: '{sq}: mandarin taken, 1 citizen', other: '{sq}: mandarin taken, {n} citizens' },
      'board.squareYou': { one: 'Your square {no}: 1 citizen', other: 'Your square {no}: {n} citizens' },
      'board.squareAi': { one: "Computer’s square {no}: 1 citizen", other: "Computer’s square {no}: {n} citizens" },
      'board.squareOf': { one: "{name}’s square {no}: 1 citizen", other: "{name}’s square {no}: {n} citizens" },
      'board.selectedHint': '. Selected, press the left or right arrow to sow',

      'score.points': { one: '1 point', other: '{n} points' },
      'score.dan': '{n} dan',
      'score.debt': 'owes {n}',
      'score.captured': 'Captured {quan} and {dan}',
      'score.owing': ', owing {n}',
      'unit.quan': { one: '1 mandarin', other: '{n} mandarins' },
      'unit.dan': { one: '1 citizen', other: '{n} citizens' },

      'side.left': '← left',
      'side.right': '→ right',

      'turn.yours': 'Your turn',
      'turn.yourTap': '<b>Your turn</b> · tap a square in the bottom row',
      'turn.pvpBottom': "<b>{name}</b>’s turn · pick a square in the bottom row",
      'turn.pvpTop': "<b>{name}</b>’s turn · pick a square in the top row",
      'turn.thinking': 'Computer is thinking',
      'turn.aiPreview': '<b>Computer</b> picks square {no}, sows {side}',
      'turn.selected': { one: 'Square {no} (1 stone) · choose a direction <b>←</b> or <b>→</b>', other: 'Square {no} ({n} stones) · choose a direction <b>←</b> or <b>→</b>' },
      'turn.sowing': '<b>{name}</b>: sowing… <span class="skip-hint">tap to skip</span>',
      'turn.draw': '<b>Draw {a} – {b}.</b> Mandarins gone, rows collected',
      'turn.youWin': 'You win!',
      'turn.aiWins': 'Computer wins.',
      'turn.nameWins': '{name} wins!',
      'turn.overScore': '<b>{who}</b> {a} – {b} points',

      'anim.captureQuan': '<b>{name}</b>: mandarin captured',
      'anim.captureQuanDan': { one: '<b>{name}</b>: mandarin + 1 citizen captured', other: '<b>{name}</b>: mandarin + {n} citizens captured' },
      'anim.captureDan': { one: '<b>{name}</b>: 1 citizen captured', other: '<b>{name}</b>: {n} citizens captured' },
      'anim.scatter': '<b>{name}</b>: out of citizens, {n} re-sown',
      'anim.collect': 'Mandarins gone · each side collects its own row',
      'stop.quan': 'Reached a mandarin square · turn ends',
      'stop.empty2': 'Two empty squares in a row · turn ends',
      'stop.quannon': 'Young mandarin (under 5 citizens) · can’t capture, turn ends',
      'stop.loop': 'Sowing ran too long · turn stopped',

      'log.title': 'Moves',
      'log.aria': 'Move log, newest first',
      'log.empty': 'No moves yet.',
      'log.move': '{name}: square {no} {side}, {what}',
      'log.takeQuan': 'took the mandarin',
      'log.takeQuans': 'took {n} mandarins',
      'log.plusDan': ' + {n}',
      'log.take': 'took {n}',
      'log.quanNon': 'young mandarin, no capture',
      'log.noTake': 'no capture',
      'log.scatter': '{name}: out of citizens, {n} re-sown',
      'log.borrow': ' (borrowed {n})',
      'log.overStuck': 'No stones left to sow',
      'log.overQuan': 'Mandarins gone, rows collected',

      'toast.over': 'Game over · tap New game to play again',
      'toast.thinking': 'The computer is thinking, hold on',
      'toast.noQuan': 'You can’t sow from a mandarin square',
      'toast.pvpBottom': "{name}’s turn · pick a square in the bottom row",
      'toast.pvpTop': "{name}’s turn · pick a square in the top row",
      'toast.pickOwn': 'Pick a square in your bottom row',
      'toast.empty': 'This square is empty, pick one with stones',
      'toast.undone': 'Move undone',
      'toast.statsReset': 'Statistics reset',
      'toast.rulesNow': 'Applied to this game',
      'toast.rulesNext': 'New rules apply from the next game',

      'controls.aria': 'Controls',
      'controls.undo': 'Undo',
      'controls.undoKey': 'Undo (Z)',
      'controls.new': 'New game',
      'controls.newKey': 'New game (N)',
      'controls.kbd': 'Keys: <kbd>←</kbd><kbd>→</kbd> choose square · <kbd>Enter</kbd> pick up · <kbd>←</kbd><kbd>→</kbd> sow · <kbd>Esc</kbd> cancel · <kbd>Space</kbd> skip animation · <kbd>Z</kbd> undo · <kbd>N</kbd> new game · <kbd>H</kbd> how to play',

      'new.title': 'New game',
      'new.warning': 'The current game will be abandoned and won’t count in your statistics.',
      'new.mode': 'Mode',
      'new.modeAi': 'You vs Computer',
      'new.modePvp': 'Two players',
      'new.level': 'Computer level',
      'new.first': 'First move',
      'new.youFirst': 'You first',
      'new.aiFirst': 'Computer first',
      'new.pvpDesc': 'Two players take turns on the same device. Player 1 takes the bottom row and moves first.',
      'new.rulesOn': 'Rules: young mandarin on · 1 mandarin = {v} citizens. Change in Settings.',
      'new.rulesOff': 'Rules: young mandarin off · 1 mandarin = {v} citizens. Change in Settings.',
      'new.cancel': 'Cancel',
      'new.start': 'Start',

      'help.title': 'How to play',
      'help.close': 'Close',
      'help.steps': 'Steps',
      'help.prev': 'Back',
      'help.next': 'Next',
      'help.play': 'Let’s play!',
      'help.step': 'Step {i}/{n}',
      'help.dot': 'Step {i}',
      'help.1.title': 'The board: 10 citizen squares, 2 mandarin squares',
      'help.1.text': 'The bottom row is <b>your 5 squares</b>, the top row is your opponent’s. Each square starts with <b>5 citizens (dan)</b>, small stones worth 1 point each. At each end is a half-moon <b>mandarin square</b> holding <b>1 mandarin (quan)</b>, a big stone worth 10 points by default.',
      'help.1.alt': 'Starting board: each citizen square holds 5 citizens, each mandarin square holds one big mandarin',
      'help.1.tag': 'your row',
      'help.2.title': 'Pick a square and a direction',
      'help.2.text': 'Tap a square with stones in your row, then choose the <b>←</b> or <b>→</b> arrow. Scoop up every stone in it and <b>sow one per square</b> in that direction; passing a mandarin square drops one there too.',
      'help.2.alt': 'Scoop the 5 stones from the middle bottom square and sow right, past the right mandarin square, into the top row',
      'help.2.tag': 'scoop here',
      'help.3.title': 'Next square has stones? Keep sowing',
      'help.3.text': 'After the last stone, look at the <b>very next square</b>. If it is a citizen square with stones, scoop it up and <b>keep sowing</b> in the same direction.',
      'help.3.alt': 'The last stone lands in square 4 of the top row; the next square holds 5, so it is scooped up and sown on',
      'help.3.tag': 'scoop next',
      'help.4.title': 'Skip one empty square to capture',
      'help.4.text': 'If the next square is <b>empty</b> and the one after it has stones, you <b>capture</b> them all. If another empty square and a filled one follow, <b>capture again</b> (a chain capture). Capturing a mandarin square takes its mandarin too.',
      'help.4.alt': 'Sow one stone, skip the empty square to capture the right mandarin square, then capture two more squares in the top row',
      'help.4.tag': 'take',
      'help.5.title': 'When your turn ends',
      'help.5.text': 'Your turn ends when the next square is a <b>mandarin square</b>, or at <b>two empty squares in a row</b>. <b>Young mandarin (quan non)</b> rule: a mandarin square that still has its mandarin but fewer than 5 citizens can’t be captured yet, and your turn stops.',
      'help.5.alt': 'Sowing one stone next to the left mandarin square ends the turn; the right mandarin square has its mandarin but only 3 citizens, a young mandarin',
      'help.5.tagStop': 'turn ends',
      'help.5.tagNon': 'quan non',
      'help.6.title': 'Out of citizens? Re-sow · Mandarins gone? Collect',
      'help.6.text': 'If all 5 of your squares are empty at the start of your turn, put back <b>5 captured citizens</b>, one per square (if you are short, <b>borrow</b> from your opponent and repay at the end). When <b>both mandarin squares are empty</b>, each side collects the citizens on its own row. Most points wins.',
      'help.6.alt': 'Both mandarin squares are empty; the bottom row was just re-sown with one citizen per square',
      'help.6.tag': 're-sow 5',

      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'settings.themeAuto': 'Auto',
      'settings.themeLight': 'Light',
      'settings.themeDark': 'Dark',
      'settings.lang': 'Language',
      'settings.sound': 'Sound effects',
      'settings.soundDesc': 'Also applies to the PlayNine portal and the other games.',
      'settings.speed': 'Sowing speed',
      'settings.speedSlow': 'Slow',
      'settings.speedMedium': 'Medium',
      'settings.speedFast': 'Fast',
      'settings.speedOff': 'Off',
      'settings.speedDesc': 'While sowing, tap the board (or press <kbd>Space</kbd>) to skip the animation.',
      'settings.rules': 'Rules · apply from the next game',
      'settings.quanNon': 'Young mandarin (quan non)',
      'settings.quanNonDesc': 'A mandarin square that still has its mandarin but fewer than 5 citizens can’t be captured yet.',
      'settings.quanValue': 'One mandarin is worth',
      'settings.qv5': '5 citizens',
      'settings.qv10': '10 citizens',
      'settings.qv15': '15 citizens',
      'settings.reviewHelp': 'Review how to play',
      'settings.done': 'Done',
      'settings.version': 'O An Quan · PlayNine · version',

      'stats.title': 'Statistics',
      'stats.won': 'Wins vs computer',
      'stats.best': 'Best win streak',
      'stats.top': 'High score',
      'stats.byLevel': 'Vs computer by level',
      'stats.level': 'Level',
      'stats.played': 'Played',
      'stats.wonCol': 'Won',
      'stats.lost': 'Lost',
      'stats.drawn': 'Drawn',
      'stats.pvp': 'Two players',
      'stats.none': 'No games yet.',
      'stats.pvpLine': { one: '1 game · Player 1 won {p0} · Player 2 won {p1} · drawn {d}', other: '{n} games · Player 1 won {p0} · Player 2 won {p1} · drawn {d}' },
      'stats.reset': 'Reset',
      'stats.resetConfirm': 'Tap again to clear',
      'stats.close': 'Close',

      'result.youWin': 'You win!',
      'result.aiWins': 'Computer wins',
      'result.nameWins': '{name} wins!',
      'result.draw': 'Draw',
      'result.drawSub': 'Both sides are level after collecting.',
      'result.youWinSub': { one: 'You beat the {level} computer by 1 point.', other: 'You beat the {level} computer by {n} points.' },
      'result.aiWinSub': { one: 'The computer won by 1 point. Try again!', other: 'The computer won by {n} points. Try again!' },
      'result.pvpSub': { one: 'By 1 point.', other: 'By {n} points.' },
      'result.stuck': 'No stones left to sow, so the game stopped. ',
      'result.repaid': ' · repaid {n}',
      'result.received': ' · received {n}',
      'result.capLine': '{quan} · {dan}',
      'result.levelLine': '{level}: won {w} · lost {l} · drawn {d}',
      'result.streak': ' · {n}-game win streak',
      'result.pvpLine': 'Two players: Player 1 won {p0} · Player 2 won {p1} · drawn {d}',
      'result.view': 'View board',
      'result.again': 'Play again',
      'result.newGame': 'New game',

      'summary.noteAi': 'Won {won}/{played} vs computer · {level}',
      'summary.notePvp': { one: '1 two-player game · no computer games yet', other: '{n} two-player games · no computer games yet' },
      'summary.noteNone': 'No games yet · try the computer',
      'summary.won': 'Wins vs computer',
      'summary.played': 'Games played',
      'summary.top': 'High score',
      'summary.turnYou': 'your turn',
      'summary.turnAi': 'computer’s turn',
      'summary.turnName': '{name}’s turn',
      'summary.titleAi': 'O An Quan vs computer · {level}',
      'summary.titlePvp': 'O An Quan · two players',
      'summary.detail': '{p0} {a} – {p1} {b} pts · {turn}',
    },

    vi: {
      'meta.title': 'Ô Ăn Quan',
      'meta.description': 'Ô Ăn Quan, trò chơi dân gian Việt Nam: rải quân, ăn dân, ăn quan. Đấu máy 3 mức hoặc hai người, có hướng dẫn minh họa, tự lưu ván.',
      'app.name': 'Ô Ăn Quan',

      'top.help': 'Cách chơi',
      'top.helpKey': 'Cách chơi (H)',
      'top.stats': 'Thống kê',
      'top.settings': 'Cài đặt',

      'player.you': 'Bạn',
      'player.ai': 'Máy',
      'player.p1': 'Người 1',
      'player.p2': 'Người 2',
      'player.level': 'Mức {level}',
      'player.first': 'Đi trước',
      'player.second': 'Đi sau',
      'player.bottomRow': 'Hàng dưới · ',
      'player.topRow': 'Hàng trên · ',
      'player.thinking': 'Đang nghĩ…',

      'level.easy': 'Dễ',
      'level.medium': 'Vừa',
      'level.hard': 'Khó',
      'levelDesc.easy': 'Máy chỉ tính 1–2 lượt và hay chọn lệch. Hợp để làm quen luật.',
      'levelDesc.medium': 'Máy tính trước 4 lượt đi, đối thủ vững để luyện tập.',
      'levelDesc.hard': 'Máy tính sâu nhất có thể trong khoảng 1,5 giây mỗi nước.',

      'mode.ai': 'Đấu máy · {level}',
      'mode.pvp': 'Hai người',
      'mode.noQuanNon': ' · không quan non',

      'board.aria': 'Bàn Ô Ăn Quan. Dùng phím mũi tên trái phải để chọn ô, Enter để chọn, rồi mũi tên trái hoặc phải để rải.',
      'board.sowLeft': 'Rải sang trái',
      'board.sowRight': 'Rải sang phải',
      'board.sowSquareLeft': 'Rải ô {no} sang trái',
      'board.sowSquareRight': 'Rải ô {no} sang phải',
      'board.quanLeft': 'Ô quan trái',
      'board.quanRight': 'Ô quan phải',
      'board.quanHas': '{sq}: còn quan, {n} dân',
      'board.quanGone': '{sq}: đã mất quan, {n} dân',
      'board.squareYou': 'Ô {no} của bạn: {n} dân',
      'board.squareAi': 'Ô {no} của máy: {n} dân',
      'board.squareOf': 'Ô {no} của {name}: {n} dân',
      'board.selectedHint': '. Đang chọn, bấm mũi tên trái hoặc phải để rải',

      'score.points': '{n} điểm',
      'score.dan': '{n} dân',
      'score.debt': 'nợ {n}',
      'score.captured': 'Đã ăn {quan} và {dan}',
      'score.owing': ', đang nợ {n}',
      'unit.quan': '{n} quan',
      'unit.dan': '{n} dân',

      'side.left': '← trái',
      'side.right': '→ phải',

      'turn.yours': 'Lượt của bạn',
      'turn.yourTap': '<b>Lượt của bạn</b> · chạm một ô ở hàng dưới',
      'turn.pvpBottom': 'Lượt của <b>{name}</b> · chọn ô ở hàng dưới',
      'turn.pvpTop': 'Lượt của <b>{name}</b> · chọn ô ở hàng trên',
      'turn.thinking': 'Máy đang nghĩ',
      'turn.aiPreview': '<b>Máy</b> cầm ô {no}, rải {side}',
      'turn.selected': 'Ô {no} ({n} quân) · chọn hướng rải <b>←</b> hoặc <b>→</b>',
      'turn.sowing': '<b>{name}</b> đang rải quân… <span class="skip-hint">chạm để bỏ qua</span>',
      'turn.draw': '<b>Hòa {a} – {b}.</b> Hết quan, thu quân',
      'turn.youWin': 'Bạn thắng!',
      'turn.aiWins': 'Máy thắng.',
      'turn.nameWins': '{name} thắng!',
      'turn.overScore': '<b>{who}</b> {a} – {b} điểm',

      'anim.captureQuan': '<b>{name}</b> ăn quan',
      'anim.captureQuanDan': '<b>{name}</b> ăn quan + {n} dân',
      'anim.captureDan': '<b>{name}</b> ăn {n} dân',
      'anim.scatter': '<b>{name}</b> hết dân, rải lại {n} quân',
      'anim.collect': 'Hết quan · mỗi bên thu dân trên hàng mình',
      'stop.quan': 'Gặp ô quan · hết lượt',
      'stop.empty2': 'Hai ô trống liền nhau · hết lượt',
      'stop.quannon': 'Quan non (dưới 5 dân) · chưa ăn được, hết lượt',
      'stop.loop': 'Rải quá lâu · dừng lượt',

      'log.title': 'Diễn biến',
      'log.aria': 'Nhật ký nước đi, mới nhất ở trên',
      'log.empty': 'Chưa có nước đi nào.',
      'log.move': '{name}: ô {no} {side}, {what}',
      'log.takeQuan': 'ăn quan',
      'log.takeQuans': 'ăn {n} quan',
      'log.plusDan': ' + {n} dân',
      'log.take': 'ăn {n}',
      'log.quanNon': 'gặp quan non',
      'log.noTake': 'không ăn',
      'log.scatter': '{name} hết dân, rải lại {n} quân',
      'log.borrow': ' (vay {n})',
      'log.overStuck': 'Hết quân để rải',
      'log.overQuan': 'Hết quan, thu quân',

      'toast.over': 'Ván đã kết thúc · bấm Ván mới để chơi tiếp',
      'toast.thinking': 'Máy đang nghĩ, chờ chút nhé',
      'toast.noQuan': 'Không được bốc ô quan để rải',
      'toast.pvpBottom': 'Đến lượt {name} · chọn ô ở hàng dưới',
      'toast.pvpTop': 'Đến lượt {name} · chọn ô ở hàng trên',
      'toast.pickOwn': 'Chọn một ô ở hàng dưới của bạn',
      'toast.empty': 'Ô này trống, chọn ô còn quân',
      'toast.undone': 'Đã đi lại',
      'toast.statsReset': 'Đã đặt lại thống kê',
      'toast.rulesNow': 'Đã áp dụng cho ván này',
      'toast.rulesNext': 'Luật mới áp dụng từ ván sau',

      'controls.aria': 'Điều khiển',
      'controls.undo': 'Đi lại',
      'controls.undoKey': 'Đi lại (Z)',
      'controls.new': 'Ván mới',
      'controls.newKey': 'Ván mới (N)',
      'controls.kbd': 'Phím tắt: <kbd>←</kbd><kbd>→</kbd> chọn ô · <kbd>Enter</kbd> cầm ô · <kbd>←</kbd><kbd>→</kbd> rải · <kbd>Esc</kbd> bỏ chọn · <kbd>Space</kbd> bỏ qua hiệu ứng · <kbd>Z</kbd> đi lại · <kbd>N</kbd> ván mới · <kbd>H</kbd> cách chơi',

      'new.title': 'Ván mới',
      'new.warning': 'Ván đang chơi sẽ bị bỏ và không tính vào thống kê.',
      'new.mode': 'Chế độ',
      'new.modeAi': 'Người vs Máy',
      'new.modePvp': 'Hai người',
      'new.level': 'Mức của máy',
      'new.first': 'Lượt đi đầu',
      'new.youFirst': 'Bạn đi trước',
      'new.aiFirst': 'Máy đi trước',
      'new.pvpDesc': 'Hai người thay phiên nhau trên cùng một máy. Người 1 giữ hàng dưới và đi trước.',
      'new.rulesOn': 'Luật: quan non bật · 1 quan = {v} dân. Đổi trong Cài đặt.',
      'new.rulesOff': 'Luật: quan non tắt · 1 quan = {v} dân. Đổi trong Cài đặt.',
      'new.cancel': 'Hủy',
      'new.start': 'Bắt đầu',

      'help.title': 'Cách chơi',
      'help.close': 'Đóng',
      'help.steps': 'Các bước',
      'help.prev': 'Trước',
      'help.next': 'Tiếp',
      'help.play': 'Chơi thôi!',
      'help.step': 'Bước {i}/{n}',
      'help.dot': 'Bước {i}',
      'help.1.title': 'Bàn chơi: 10 ô dân, 2 ô quan',
      'help.1.text': 'Hàng dưới là <b>5 ô của bạn</b>, hàng trên của đối thủ. Mỗi ô dân có <b>5 dân</b> (1 điểm/viên). Hai ô quan hình bán nguyệt ở hai đầu, mỗi ô có <b>1 quan</b> lớn (mặc định 10 điểm).',
      'help.1.alt': 'Bàn đầu ván: mỗi ô dân có 5 dân, mỗi ô quan có một viên quan lớn',
      'help.1.tag': 'hàng của bạn',
      'help.2.title': 'Chọn ô và hướng rải',
      'help.2.text': 'Chạm một ô có quân ở hàng của bạn rồi chọn mũi tên <b>←</b> hoặc <b>→</b>. Bốc hết quân trong ô, <b>rải mỗi ô một viên</b> theo hướng đó, đi qua ô quan cũng thả một viên.',
      'help.2.alt': 'Bốc 5 quân ở ô giữa hàng dưới, rải sang phải qua ô quan phải lên hàng trên',
      'help.2.tag': 'bốc ô này',
      'help.3.title': 'Ô kế tiếp còn quân? Rải tiếp',
      'help.3.text': 'Rải xong viên cuối, nhìn <b>ô ngay sau</b>. Nếu đó là ô dân còn quân, bốc cả ô đó lên và <b>rải tiếp</b> theo cùng hướng.',
      'help.3.alt': 'Viên cuối rơi vào ô 4 hàng trên, ô kế tiếp còn 5 quân nên bốc lên rải tiếp',
      'help.3.tag': 'bốc tiếp',
      'help.4.title': 'Cách một ô trống là ăn',
      'help.4.text': 'Nếu ô ngay sau là <b>ô trống</b> và ô kế đó có quân, bạn <b>ăn hết</b> ô đó. Sau ô vừa ăn lại là một ô trống rồi một ô có quân thì <b>ăn tiếp</b> (ăn dây). Ăn ô quan là được cả viên quan.',
      'help.4.alt': 'Rải một viên, cách ô trống ăn ô quan phải, rồi ăn tiếp hai ô hàng trên',
      'help.4.tag': 'ăn',
      'help.5.title': 'Khi nào hết lượt',
      'help.5.text': 'Hết lượt khi ô ngay sau là <b>ô quan</b>, hoặc gặp <b>hai ô trống liền nhau</b>. Luật <b>quan non</b>: ô quan còn quan mà ít hơn 5 dân thì chưa được ăn, lượt cũng dừng.',
      'help.5.alt': 'Rải một viên vào ô sát ô quan trái nên hết lượt; ô quan phải còn quan mà chỉ có 3 dân là quan non',
      'help.5.tagStop': 'hết lượt',
      'help.5.tagNon': 'quan non',
      'help.6.title': 'Hết dân thì rải quân · hết quan thì thu',
      'help.6.text': 'Đến lượt mà 5 ô của bạn trống hết, lấy <b>5 dân đã ăn</b> rải lại mỗi ô một viên (thiếu thì <b>vay</b> đối thủ, cuối ván trả). Khi <b>cả hai ô quan hết quân</b>, mỗi bên thu dân trên hàng mình. Nhiều điểm hơn thì thắng.',
      'help.6.alt': 'Hai ô quan đã hết, hàng dưới vừa rải lại mỗi ô một dân',
      'help.6.tag': 'rải lại 5 dân',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'settings.themeAuto': 'Tự động',
      'settings.themeLight': 'Sáng',
      'settings.themeDark': 'Tối',
      'settings.lang': 'Ngôn ngữ',
      'settings.sound': 'Âm thanh',
      'settings.soundDesc': 'Áp dụng chung cho cổng PlayNine và các game khác.',
      'settings.speed': 'Tốc độ rải quân',
      'settings.speedSlow': 'Chậm',
      'settings.speedMedium': 'Vừa',
      'settings.speedFast': 'Nhanh',
      'settings.speedOff': 'Tắt',
      'settings.speedDesc': 'Đang rải, chạm vào bàn (hoặc nhấn <kbd>Space</kbd>) để bỏ qua hiệu ứng.',
      'settings.rules': 'Luật chơi · áp dụng từ ván mới',
      'settings.quanNon': 'Quan non',
      'settings.quanNonDesc': 'Ô quan còn quan mà có ít hơn 5 dân thì chưa được ăn.',
      'settings.quanValue': 'Một quan bằng',
      'settings.qv5': '5 dân',
      'settings.qv10': '10 dân',
      'settings.qv15': '15 dân',
      'settings.reviewHelp': 'Xem lại cách chơi',
      'settings.done': 'Xong',
      'settings.version': 'Ô Ăn Quan · PlayNine · phiên bản',

      'stats.title': 'Thống kê',
      'stats.won': 'Thắng máy',
      'stats.best': 'Chuỗi dài nhất',
      'stats.top': 'Điểm cao nhất',
      'stats.byLevel': 'Đấu máy theo mức',
      'stats.level': 'Mức',
      'stats.played': 'Ván',
      'stats.wonCol': 'Thắng',
      'stats.lost': 'Thua',
      'stats.drawn': 'Hòa',
      'stats.pvp': 'Hai người',
      'stats.none': 'Chưa có ván nào.',
      'stats.pvpLine': '{n} ván · Người 1 thắng {p0} · Người 2 thắng {p1} · hòa {d}',
      'stats.reset': 'Đặt lại',
      'stats.resetConfirm': 'Bấm lần nữa để xóa',
      'stats.close': 'Đóng',

      'result.youWin': 'Bạn thắng!',
      'result.aiWins': 'Máy thắng',
      'result.nameWins': '{name} thắng!',
      'result.draw': 'Hòa',
      'result.drawSub': 'Hai bên bằng điểm sau khi thu quân.',
      'result.youWinSub': 'Bạn hơn máy mức {level} {n} điểm.',
      'result.aiWinSub': 'Máy hơn {n} điểm. Thử lại nhé!',
      'result.pvpSub': 'Hơn {n} điểm.',
      'result.stuck': 'Không còn quân để rải nên ván dừng. ',
      'result.repaid': ' · trả nợ {n}',
      'result.received': ' · được trả {n}',
      'result.capLine': '{quan} · {dan}',
      'result.levelLine': 'Mức {level}: thắng {w} · thua {l} · hòa {d}',
      'result.streak': ' · chuỗi {n} ván thắng',
      'result.pvpLine': 'Hai người: Người 1 thắng {p0} · Người 2 thắng {p1} · hòa {d}',
      'result.view': 'Xem bàn',
      'result.again': 'Chơi tiếp',
      'result.newGame': 'Ván mới',

      'summary.noteAi': 'Thắng máy {won}/{played} ván · mức {level}',
      'summary.notePvp': '{n} ván hai người · chưa đấu máy',
      'summary.noteNone': 'Chưa chơi ván nào · thử đấu máy nhé',
      'summary.won': 'Thắng máy',
      'summary.played': 'Ván đã chơi',
      'summary.top': 'Điểm cao nhất',
      'summary.turnYou': 'đến lượt bạn',
      'summary.turnAi': 'đến lượt máy',
      'summary.turnName': 'đến lượt {name}',
      'summary.titleAi': 'Ô Ăn Quan với máy · {level}',
      'summary.titlePvp': 'Ô Ăn Quan hai người',
      'summary.detail': '{p0} {a} – {p1} {b} điểm · {turn}',
    },
  };

  function readLang() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === 'en' || v === 'vi') return v;
    } catch (e) {}
    return 'en';
  }
  const lang = readLang();
  if (root.document) root.document.documentElement.lang = lang;

  // Chuỗi số nhiều { one, other }: chọn theo params.n (tiếng Việt không có số nhiều)
  function pick(v, params) {
    if (v == null || typeof v === 'string') return v;
    const n = params && params.n;
    return n === 1 && v.one != null ? v.one : v.other;
  }
  function t(key, params) {
    let s = pick(DICT[lang][key], params);
    if (s == null) s = pick(DICT.en[key], params);
    if (s == null) return key;
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
    return s;
  }

  function apply(scope) {
    const doc = root.document;
    if (!doc) return;
    const base = scope || doc;
    for (const el of base.querySelectorAll('[data-i18n]')) el.textContent = t(el.getAttribute('data-i18n'));
    for (const el of base.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.getAttribute('data-i18n-html'));
    for (const el of base.querySelectorAll('[data-i18n-attr]')) {
      for (const pair of el.getAttribute('data-i18n-attr').split(';')) {
        const i = pair.indexOf(':');
        if (i > 0) el.setAttribute(pair.slice(0, i).trim(), t(pair.slice(i + 1).trim()));
      }
    }
    if (base === doc) {
      doc.title = t('meta.title');
      const desc = doc.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute('content', t('meta.description'));
      const apple = doc.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (apple) apple.setAttribute('content', t('meta.title'));
    }
  }

  function reload() {
    if (typeof api.beforeReload === 'function') { try { api.beforeReload(); } catch (e) {} }
    root.location.reload();
  }
  function set(next) {
    if (next !== 'en' && next !== 'vi') return;
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    if (next !== lang) reload();
  }

  const fmtNumber = (n, opts) => new Intl.NumberFormat(LOCALES[lang], opts).format(n);
  const fmtDate = (d, opts) => new Intl.DateTimeFormat(LOCALES[lang], opts).format(d);

  const api = { lang, t, apply, set, fmtNumber, fmtDate, beforeReload: null };
  root.I18N = api;

  // Trang khác (cổng hoặc tab khác) đổi ngôn ngữ: tải lại để theo
  if (root.addEventListener) {
    root.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && readLang() !== lang) reload();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
