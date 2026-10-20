/* =====================================================================
 * Cờ Vua - Đa ngôn ngữ (tiếng Anh mặc định + tiếng Việt)
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
      'meta.title': 'Chess',
      'meta.description': 'Chess with full FIDE rules: castling, en passant, promotion. Play the computer at 3 levels or two players, with an illustrated guide and autosave.',
      'app.name': 'Chess',

      'top.help': 'How to play',
      'top.helpKey': 'How to play (H)',
      'top.stats': 'Statistics',
      'top.settings': 'Settings',

      'board.label': 'Chessboard. Use the arrow keys to choose a square, Enter to pick up a piece or move to that square, Esc to deselect.',
      'log.title': 'Moves',
      'log.label': 'Moves played, in standard notation',
      'log.empty': 'No moves yet · White moves first',
      'controls.label': 'Controls',
      'btn.undo': 'Undo',
      'btn.undoKey': 'Undo (Z)',
      'btn.flip': 'Flip board',
      'btn.flipKey': 'Flip board (F)',
      'btn.new': 'New game',
      'btn.newKey': 'New game (N)',
      'kbd.hint': 'Shortcuts: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> select square · <kbd>Enter</kbd> pick up / move · <kbd>Esc</kbd> deselect · <kbd>Z</kbd> undo · <kbd>F</kbd> flip board · <kbd>N</kbd> new game · <kbd>H</kbd> how to play',

      'new.title': 'New game',
      'new.warning': 'The current game will be abandoned and won\'t count in your statistics.',
      'new.mode': 'Mode',
      'new.modeAi': 'vs Computer',
      'new.modePvp': 'Two players',
      'new.level': 'Computer level',
      'new.color': 'You play',
      'new.random': 'Random',
      'new.colorDesc': 'White always moves first. Play Black and the board turns so your pieces are at the bottom.',
      'new.pvpDesc': 'Two players take turns on the same device. White moves first. To have the board turn with each move, switch it on in Settings.',
      'btn.cancel': 'Cancel',
      'btn.start': 'Start',

      'level.easy': 'Easy',
      'level.medium': 'Medium',
      'level.hard': 'Hard',
      'levelDesc.easy': 'The computer looks 1–2 moves ahead and often slips, sometimes leaving pieces hanging. Good for getting started.',
      'levelDesc.medium': 'The computer looks 3–4 moves ahead, takes free pieces and avoids simple traps.',
      'levelDesc.hard': 'The computer searches as deep as it can in about 1.5 seconds per move.',

      'promo.title': 'Promote pawn to',
      'promo.cancel': 'Cancel this move',
      'promo.to': 'Promote to {piece}',

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
      'settings.speed': 'Move speed',
      'speed.slow': 'Slow',
      'speed.medium': 'Medium',
      'speed.fast': 'Fast',
      'speed.off': 'Off',
      'settings.hints': 'Move hints',
      'settings.hintsDesc': 'Pick up a piece to see dots on the squares it can reach and rings around pieces it can capture.',
      'settings.autoFlip': 'Flip board each turn',
      'settings.autoFlipDesc': 'In two-player games the board turns so the side to move is always at the bottom.',
      'settings.replayHelp': 'Review how to play',
      'settings.done': 'Done',
      'settings.version': 'Chess · PlayNine · version',

      'stats.title': 'Statistics',
      'stats.won': 'Wins vs computer',
      'stats.streak': 'Current streak',
      'stats.best': 'Best streak',
      'stats.byLevel': 'vs Computer by level',
      'stats.level': 'Level',
      'stats.games': 'Games',
      'stats.wins': 'Won',
      'stats.losses': 'Lost',
      'stats.draws': 'Drawn',
      'stats.pvp': 'Two players',
      'stats.none': 'No games yet.',
      'stats.pvpLine': { one: '1 game · White won {w} · Black won {b} · drawn {d}', other: '{n} games · White won {w} · Black won {b} · drawn {d}' },
      'stats.reset': 'Reset',
      'stats.resetConfirm': 'Tap again to clear',
      'stats.close': 'Close',

      'result.view': 'View board',
      'result.again': 'Play again',
      'result.youWin': 'You win!',
      'result.aiWins': 'Computer wins',
      'result.draw': 'Draw',
      'result.drawSub': { one: '{reason} after 1 move.', other: '{reason} after {n} moves.' },
      'result.youWinSub': { one: 'You checkmated the {level} computer in 1 move.', other: 'You checkmated the {level} computer in {n} moves.' },
      'result.youLoseSub': { one: 'You were checkmated after 1 move. Try again!', other: 'You were checkmated after {n} moves. Try again!' },
      'result.colorWins': '{color} wins!',
      'result.mateSub': { one: 'Checkmate after 1 move.', other: 'Checkmate after {n} moves.' },
      'result.caps': { one: 'captured 1 piece', other: 'captured {n} pieces' },
      'result.levelLine': '{level}: won {won} · lost {lost} · drawn {drawn}',
      'result.streak': ' · {n}-game win streak',
      'result.pvpLine': 'Two players: White won {w} · Black won {b} · drawn {d}',

      'who.you': 'You',
      'who.ai': 'Computer',
      'color.0': 'White',
      'color.1': 'Black',
      'colorl.0': 'white',
      'colorl.1': 'black',
      'piece.1': 'Pawn',
      'piece.2': 'Knight',
      'piece.3': 'Bishop',
      'piece.4': 'Rook',
      'piece.5': 'Queen',
      'piece.6': 'King',
      'piecel.1': 'pawn',
      'piecel.2': 'knight',
      'piecel.3': 'bishop',
      'piecel.4': 'rook',
      'piecel.5': 'queen',
      'piecel.6': 'king',
      'reason.checkmate': 'Checkmate',
      'reason.stalemate': 'Stalemate',
      'reason.threefold': 'Threefold repetition',
      'reason.fifty': 'Fifty-move rule',
      'reason.material': 'Insufficient material',

      'toast.randomWhite': 'You play White and move first',
      'toast.randomBlack': 'You play Black; the computer moves first',
      'toast.over': 'The game is over · tap New game to play again',
      'toast.thinking': 'The computer is thinking, hang on',
      'toast.checkStuck': 'You\'re in check · this {piece} can\'t get you out',
      'toast.noMoves': 'This {piece} has no moves yet',
      'toast.aiPiece': 'That\'s the computer\'s piece · pick one of yours',
      'toast.turnOf': '{color} to move',
      'toast.undone': 'Move undone',
      'toast.statsReset': 'Statistics reset',
      'toast.autoFlipPvp': 'Only applies to two-player games',

      'mode.ai': 'vs Computer · {level}',
      'mode.pvp': 'Two players',
      'player.side.0': 'White pieces',
      'player.side.1': 'Black pieces',
      'player.level': '{level} level',
      'player.first': 'Moves first',
      'player.thinking': 'Thinking…',
      'player.checked': 'In check!',
      'player.caps': 'Captured: {list}',
      'player.noCaps': 'No captures yet',
      'player.lead': { one: 'Up 1 point of material', other: 'Up {n} points of material' },

      'turn.draw': '<b>Draw</b> · {reason}',
      'turn.youWin': 'You win!',
      'turn.aiWins': 'Computer wins.',
      'turn.colorWins': '{color} wins!',
      'turn.mate': '<b>Checkmate!</b> {who}',
      'turn.aiPlays': '<b>Computer</b> plays <b>{san}</b> · {desc}',
      'turn.thinking': 'Computer is thinking',
      'turn.check': 'Check!',
      'turn.selected': '<b>{piece} {sq}</b> · choose a square',
      'turn.yours': '<b>Your turn</b> · tap a {color} piece to move',
      'turn.of': '<b>{color}</b> to move',

      'sq.empty': 'empty',
      'sq.piece': '{color} {piece}',
      'sq.selected': ', selected',
      'sq.capture': ', can capture',
      'sq.target': ', can move here',

      'mv.castleK': 'castles kingside',
      'mv.castleQ': 'castles queenside',
      'mv.ep': ', en passant',
      'mv.takes': ', takes {piece}',
      'mv.promo': ', promotes to {piece}',
      'mv.mate': ', checkmate',
      'mv.check': ', check',

      'sum.noteAi': { one: 'Won {won}/1 game vs computer · {level} level', other: 'Won {won}/{n} games vs computer · {level} level' },
      'sum.notePvp': { one: '1 two-player game · no computer games yet', other: '{n} two-player games · no computer games yet' },
      'sum.noteNone': 'No games yet · try playing the computer',
      'sum.won': 'Wins vs computer',
      'sum.played': 'Games played',
      'sum.best': 'Best win streak',
      'sum.turnYou': 'your turn',
      'sum.turnAi': 'computer\'s turn',
      'sum.turnOf': '{color}\'s turn',
      'sum.lead': ' · {who} up {n} in material',
      'sum.titleAi': 'Chess vs computer · {level}',
      'sum.titlePvp': 'Chess · two players',
      'sum.move': 'Move {n}',
      'sum.youPlay': ' · you play {color}',

      'tag.mate': 'checkmate',
      'tag.promo': 'promote',
      'tag.stalemate': 'stalemate',
      'help.1.title': 'Goal: checkmate the enemy King',
      'help.1.text': 'Each side has 16 pieces and <b>White moves first</b>. A King under attack is in <b>check</b> and must get out of it at once. A King in check with no way out is <b>checkmated</b>: that side loses.',
      'help.1.alt': 'The white Rook on d8 checkmates the black King on g8, which is boxed in by its own three pawns',
      'help.2.title': 'Rooks, Bishops and Queens go far',
      'help.2.text': 'The <b>Rook</b> moves along rows and columns; the <b>Bishop</b> moves diagonally; the <b>Queen</b> does both, any number of squares, but none of them can jump over other pieces. Capture by moving onto a square with an enemy piece. Tap a piece to see where it can go (<b>dots</b>; <b>rings</b> mark captures), then tap the square you want or drag the piece.',
      'help.2.alt': 'The white Queen on c3 with its moves: it can capture the black pawn on e5 and is blocked by the white pawn on a3',
      'help.3.title': 'Knights jump in an L, the King steps one square',
      'help.3.text': 'The <b>Knight</b> moves in an L shape (2 squares straight, then 1 to the side) and is the only piece that can <b>jump over</b> others. The <b>King</b> moves 1 square in any direction and may not step onto a square the opponent controls.',
      'help.3.alt': 'The white Knight on d4 has 8 moves, jumping over the pawns around it',
      'help.4.title': 'Pawns move straight, capture diagonally',
      'help.4.text': 'A <b>Pawn</b> moves 1 square straight ahead (2 on its first move) but <b>captures diagonally</b>, 1 square forward. If a piece stands right in front of it, the Pawn cannot move.',
      'help.4.alt': 'Pawn e2 can go to e3 or e4; pawn c4 is blocked but can capture the black pawn on d5 diagonally',
      'help.5.title': 'Castling',
      'help.5.text': 'The King moves <b>2 squares</b> toward a Rook, and the Rook jumps over to stand right beside it. Allowed only if the King and that Rook <b>have not moved yet</b>, no pieces stand between them, the King is <b>not in check</b>, and it does not pass through or land on an attacked square. Tap the King, then tap g1 (or c1).',
      'help.5.alt': 'Kingside castling: King e1 to g1, Rook h1 to f1',
      'help.6.title': 'En passant and promotion',
      'help.6.text': 'If an enemy Pawn has just moved <b>2 squares</b> and landed right beside your Pawn, on the very next move you may capture it as if it had moved only 1 square (<b>en passant</b>). A Pawn that reaches the last row is <b>promoted</b> to a Queen, Rook, Bishop or Knight; the game asks you which.',
      'help.6.alt': 'The black pawn just moved from d7 to d5 and the white pawn on e5 captures it en passant on d6; the white pawn on b7 is about to promote on b8',
      'help.7.title': 'When is it a draw?',
      'help.7.text': 'It is a draw when the side to move has <b>no legal moves</b> but is not in check (stalemate, as shown: Black is stuck), when a position <b>repeats 3 times</b>, after <b>50 moves</b> in a row with no capture and no Pawn move, or when neither side has <b>enough material</b> to checkmate. The game declares draws automatically; no need to claim them.',
      'help.7.alt': 'The black King on h8 is not in check but has no square to go to: stalemate',
    },

    vi: {
      'meta.title': 'Cờ Vua',
      'meta.description': 'Cờ Vua luật quốc tế đầy đủ: nhập thành, bắt tốt qua đường, phong cấp. Đấu máy 3 mức hoặc hai người, có hướng dẫn minh họa, tự lưu ván.',
      'app.name': 'Cờ Vua',

      'top.help': 'Cách chơi',
      'top.helpKey': 'Cách chơi (H)',
      'top.stats': 'Thống kê',
      'top.settings': 'Cài đặt',

      'board.label': 'Bàn cờ. Dùng phím mũi tên để chọn ô, Enter để cầm quân hoặc đi tới ô đó, Esc để bỏ chọn.',
      'log.title': 'Biên bản',
      'log.label': 'Các nước đã đi, ký hiệu quốc tế',
      'log.empty': 'Chưa có nước đi nào · Trắng đi trước',
      'controls.label': 'Điều khiển',
      'btn.undo': 'Đi lại',
      'btn.undoKey': 'Đi lại (Z)',
      'btn.flip': 'Xoay bàn',
      'btn.flipKey': 'Xoay bàn (F)',
      'btn.new': 'Ván mới',
      'btn.newKey': 'Ván mới (N)',
      'kbd.hint': 'Phím tắt: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> chọn ô · <kbd>Enter</kbd> cầm / đi quân · <kbd>Esc</kbd> bỏ chọn · <kbd>Z</kbd> đi lại · <kbd>F</kbd> xoay bàn · <kbd>N</kbd> ván mới · <kbd>H</kbd> cách chơi',

      'new.title': 'Ván mới',
      'new.warning': 'Ván đang chơi sẽ bị bỏ và không tính vào thống kê.',
      'new.mode': 'Chế độ',
      'new.modeAi': 'Người vs Máy',
      'new.modePvp': 'Hai người',
      'new.level': 'Mức của máy',
      'new.color': 'Bạn cầm quân',
      'new.random': 'Ngẫu nhiên',
      'new.colorDesc': 'Bên Trắng luôn đi trước. Cầm Đen thì bàn tự xoay để quân của bạn ở phía dưới.',
      'new.pvpDesc': 'Hai người thay phiên nhau trên cùng một máy. Trắng đi trước. Muốn bàn tự xoay theo lượt thì bật trong Cài đặt.',
      'btn.cancel': 'Hủy',
      'btn.start': 'Bắt đầu',

      'level.easy': 'Dễ',
      'level.medium': 'Vừa',
      'level.hard': 'Khó',
      'levelDesc.easy': 'Máy tính 1–2 nước và hay đi lệch, thỉnh thoảng bỏ quân. Hợp để làm quen.',
      'levelDesc.medium': 'Máy tính trước 3–4 nước, biết ăn quân và tránh bẫy đơn giản.',
      'levelDesc.hard': 'Máy tính sâu nhất có thể trong khoảng 1,5 giây mỗi nước.',

      'promo.title': 'Phong cấp tốt thành',
      'promo.cancel': 'Hủy nước này',
      'promo.to': 'Phong thành {piece}',

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
      'settings.speed': 'Tốc độ di quân',
      'speed.slow': 'Chậm',
      'speed.medium': 'Vừa',
      'speed.fast': 'Nhanh',
      'speed.off': 'Tắt',
      'settings.hints': 'Gợi ý nước đi',
      'settings.hintsDesc': 'Cầm quân lên thì chấm các ô đi được, vòng tròn ở quân ăn được.',
      'settings.autoFlip': 'Xoay bàn theo lượt',
      'settings.autoFlipDesc': 'Khi chơi hai người, bàn tự xoay để bên đang đi luôn ở phía dưới.',
      'settings.replayHelp': 'Xem lại cách chơi',
      'settings.done': 'Xong',
      'settings.version': 'Cờ Vua · PlayNine · phiên bản',

      'stats.title': 'Thống kê',
      'stats.won': 'Thắng máy',
      'stats.streak': 'Chuỗi hiện tại',
      'stats.best': 'Chuỗi dài nhất',
      'stats.byLevel': 'Đấu máy theo mức',
      'stats.level': 'Mức',
      'stats.games': 'Ván',
      'stats.wins': 'Thắng',
      'stats.losses': 'Thua',
      'stats.draws': 'Hòa',
      'stats.pvp': 'Hai người',
      'stats.none': 'Chưa có ván nào.',
      'stats.pvpLine': '{n} ván · Trắng thắng {w} · Đen thắng {b} · hòa {d}',
      'stats.reset': 'Đặt lại',
      'stats.resetConfirm': 'Bấm lần nữa để xóa',
      'stats.close': 'Đóng',

      'result.view': 'Xem bàn',
      'result.again': 'Chơi tiếp',
      'result.youWin': 'Bạn thắng!',
      'result.aiWins': 'Máy thắng',
      'result.draw': 'Hòa',
      'result.drawSub': '{reason} sau {n} nước.',
      'result.youWinSub': 'Bạn chiếu hết máy mức {level} sau {n} nước.',
      'result.youLoseSub': 'Bạn bị chiếu hết sau {n} nước. Thử lại nhé!',
      'result.colorWins': '{color} thắng!',
      'result.mateSub': 'Chiếu hết sau {n} nước.',
      'result.caps': 'ăn {n} quân',
      'result.levelLine': 'Mức {level}: thắng {won} · thua {lost} · hòa {drawn}',
      'result.streak': ' · chuỗi {n} ván thắng',
      'result.pvpLine': 'Hai người: Trắng thắng {w} · Đen thắng {b} · hòa {d}',

      'who.you': 'Bạn',
      'who.ai': 'Máy',
      'color.0': 'Trắng',
      'color.1': 'Đen',
      'colorl.0': 'trắng',
      'colorl.1': 'đen',
      'piece.1': 'Tốt',
      'piece.2': 'Mã',
      'piece.3': 'Tượng',
      'piece.4': 'Xe',
      'piece.5': 'Hậu',
      'piece.6': 'Vua',
      'piecel.1': 'Tốt',
      'piecel.2': 'Mã',
      'piecel.3': 'Tượng',
      'piecel.4': 'Xe',
      'piecel.5': 'Hậu',
      'piecel.6': 'Vua',
      'reason.checkmate': 'Chiếu hết',
      'reason.stalemate': 'Hết nước đi (pat)',
      'reason.threefold': 'Lặp lại thế cờ 3 lần',
      'reason.fifty': 'Luật 50 nước',
      'reason.material': 'Không đủ quân để chiếu hết',

      'toast.randomWhite': 'Bạn cầm quân Trắng, đi trước',
      'toast.randomBlack': 'Bạn cầm quân Đen, máy đi trước',
      'toast.over': 'Ván đã kết thúc · bấm Ván mới để chơi tiếp',
      'toast.thinking': 'Máy đang nghĩ, chờ chút nhé',
      'toast.checkStuck': 'Đang bị chiếu · {piece} này không gỡ được',
      'toast.noMoves': '{piece} này chưa có nước đi',
      'toast.aiPiece': 'Đó là quân của máy · chọn quân của bạn',
      'toast.turnOf': 'Đến lượt {color} đi',
      'toast.undone': 'Đã đi lại',
      'toast.statsReset': 'Đã đặt lại thống kê',
      'toast.autoFlipPvp': 'Chỉ áp dụng khi chơi hai người',

      'mode.ai': 'Đấu máy · {level}',
      'mode.pvp': 'Hai người',
      'player.side.0': 'Quân trắng',
      'player.side.1': 'Quân đen',
      'player.level': 'Mức {level}',
      'player.first': 'Đi trước',
      'player.thinking': 'Đang nghĩ…',
      'player.checked': 'Đang bị chiếu!',
      'player.caps': 'Đã ăn: {list}',
      'player.noCaps': 'Chưa ăn quân nào',
      'player.lead': 'Hơn {n} điểm quân',

      'turn.draw': '<b>Hòa</b> · {reason}',
      'turn.youWin': 'Bạn thắng!',
      'turn.aiWins': 'Máy thắng.',
      'turn.colorWins': '{color} thắng!',
      'turn.mate': '<b>Chiếu hết!</b> {who}',
      'turn.aiPlays': '<b>Máy</b> đi <b>{san}</b> · {desc}',
      'turn.thinking': 'Máy đang nghĩ',
      'turn.check': 'Chiếu!',
      'turn.selected': '<b>{piece} {sq}</b> · chọn ô để đi',
      'turn.yours': '<b>Lượt của bạn</b> · chạm quân {color} để đi',
      'turn.of': 'Lượt của <b>{color}</b>',

      'sq.empty': 'trống',
      'sq.piece': '{piece} {color}',
      'sq.selected': ', đang cầm',
      'sq.capture': ', ăn được',
      'sq.target': ', đi được tới đây',

      'mv.castleK': 'nhập thành cánh vua',
      'mv.castleQ': 'nhập thành cánh hậu',
      'mv.ep': ', bắt tốt qua đường',
      'mv.takes': ', ăn {piece}',
      'mv.promo': ', phong {piece}',
      'mv.mate': ', chiếu hết',
      'mv.check': ', chiếu',

      'sum.noteAi': 'Thắng máy {won}/{n} ván · mức {level}',
      'sum.notePvp': '{n} ván hai người · chưa đấu máy',
      'sum.noteNone': 'Chưa chơi ván nào · thử đấu máy nhé',
      'sum.won': 'Thắng máy',
      'sum.played': 'Ván đã chơi',
      'sum.best': 'Chuỗi thắng dài nhất',
      'sum.turnYou': 'đến lượt bạn',
      'sum.turnAi': 'đến lượt máy',
      'sum.turnOf': 'đến lượt {color}',
      'sum.lead': ' · {who} hơn {n} điểm quân',
      'sum.titleAi': 'Cờ Vua với máy · {level}',
      'sum.titlePvp': 'Cờ Vua hai người',
      'sum.move': 'Nước {n}',
      'sum.youPlay': ' · bạn cầm {color}',

      'tag.mate': 'chiếu hết',
      'tag.promo': 'phong cấp',
      'tag.stalemate': 'pat',
      'help.1.title': 'Mục tiêu: chiếu hết Vua đối phương',
      'help.1.text': 'Mỗi bên 16 quân, <b>Trắng đi trước</b>. Quân nào bị tấn công Vua là bị <b>chiếu</b>, phải gỡ ngay. Vua bị chiếu mà không còn cách gỡ là <b>chiếu hết</b>: bên đó thua.',
      'help.1.alt': 'Xe trắng ở d8 chiếu hết Vua đen ở g8, Vua bị chính ba tốt của mình chắn đường',
      'help.2.title': 'Xe, Tượng, Hậu đi xa',
      'help.2.text': '<b>Xe</b> đi ngang, dọc; <b>Tượng</b> đi chéo; <b>Hậu</b> đi cả hai kiểu, bao nhiêu ô cũng được nhưng không nhảy qua quân khác. Ăn quân bằng cách đi vào ô có quân đối phương. Chạm một quân để thấy các ô đi được (<b>chấm</b>; <b>vòng tròn</b> là ăn được), rồi chạm ô muốn tới hoặc kéo thả quân.',
      'help.2.alt': 'Hậu trắng ở c3 với các ô đi được, ăn được tốt đen ở e5, bị tốt trắng a3 chắn',
      'help.3.title': 'Mã nhảy chữ L, Vua đi một ô',
      'help.3.text': '<b>Mã</b> đi hình chữ L (2 ô thẳng rồi 1 ô ngang) và là quân duy nhất <b>nhảy qua</b> được quân khác. <b>Vua</b> đi 1 ô theo mọi hướng, không được đi vào ô đang bị đối phương khống chế.',
      'help.3.alt': 'Mã trắng ở d4 có 8 ô đi được, nhảy qua các tốt xung quanh',
      'help.4.title': 'Tốt đi thẳng, ăn chéo',
      'help.4.text': '<b>Tốt</b> đi thẳng 1 ô (nước đầu tiên được đi 2 ô) nhưng <b>ăn chéo</b> 1 ô về phía trước. Bị quân chắn ngay trước mặt thì Tốt đứng yên.',
      'help.4.alt': 'Tốt e2 đi được e3 hoặc e4; tốt c4 bị chắn nhưng ăn chéo được tốt đen d5',
      'help.5.title': 'Nhập thành',
      'help.5.text': 'Vua đi <b>2 ô</b> về phía Xe, Xe nhảy qua đứng sát cạnh Vua. Chỉ được khi Vua và Xe <b>chưa đi lần nào</b>, giữa hai quân không có quân nào, Vua <b>không đang bị chiếu</b> và không đi qua hay dừng ở ô bị khống chế. Chạm Vua rồi chạm ô g1 (hoặc c1).',
      'help.5.alt': 'Nhập thành cánh vua: Vua e1 sang g1, Xe h1 sang f1',
      'help.6.title': 'Bắt tốt qua đường và phong cấp',
      'help.6.text': 'Tốt đối phương vừa đi <b>2 ô</b> và dừng ngay cạnh Tốt của bạn: ngay nước sau bạn được ăn nó như thể nó chỉ đi 1 ô (<b>bắt tốt qua đường</b>). Tốt đi tới hàng cuối được <b>phong cấp</b> thành Hậu, Xe, Tượng hoặc Mã, game sẽ hỏi bạn chọn quân.',
      'help.6.alt': 'Tốt đen vừa đi d7 tới d5, tốt trắng e5 bắt qua đường sang d6; tốt trắng b7 sắp phong cấp ở b8',
      'help.7.title': 'Khi nào hòa',
      'help.7.text': 'Hòa khi bên đến lượt <b>không còn nước đi</b> mà không bị chiếu (pat, như hình: Đen hết đường), khi một thế cờ <b>lặp lại 3 lần</b>, sau <b>50 nước</b> liền không ăn quân và không đi Tốt, hoặc khi cả hai bên <b>không đủ quân</b> để chiếu hết. Game tự xử hòa, không cần đòi.',
      'help.7.alt': 'Vua đen h8 không bị chiếu nhưng không còn ô nào để đi: hòa pat',
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
