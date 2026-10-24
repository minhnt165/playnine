/* =====================================================================
 * Cờ Nhảy - Chuỗi giao diện tiếng Anh (mặc định) + tiếng Việt
 *   - Kit đọc ngôn ngữ ở khóa dùng chung với cổng: localStorage['playnine-lang']
 *   - Chuỗi chung (Cài đặt, Đóng, Giao diện…) có sẵn trong kit với khóa kit.*; khóa trùng tên ở đây sẽ đè
 *   - Chuỗi số nhiều: { one, other }, chọn theo params.n
 * ===================================================================== */
window.GAME_DICT = {
  en: {
    'meta.title': 'Star Checkers',
    'meta.description': 'Star Checkers (Chinese checkers): hop your ten pieces across the six-pointed star into the opposite corner before the computer does. Three computer levels.',
    'app.name': 'Star Checkers',

    'side.0': 'Red',
    'side.1': 'Blue',
    'side.2': 'Green',
    'level.easy': 'Easy',
    'level.medium': 'Medium',
    'level.hard': 'Hard',
    'opp.ai1': '1 computer',
    'opp.ai2': '2 computers',
    'opp.pvp': '2 players',

    'bar.you': 'You',
    'bar.ai': 'Computer',
    'bar.aiN': 'CPU {n}',
    'bar.turn': 'Your turn',
    'bar.turnOf': 'To move',
    'bar.thinking': 'Thinking',
    'bar.winner': 'Winner!',
    'bar.turnNo': 'Turn {n}',
    'bar.homeLeft': { one: '{n} piece still home', other: '{n} pieces still home' },
    'bar.inGoal': 'Pieces in the goal corner',

    'board.label': 'Star board. Arrow keys move the cursor, Enter picks a piece and moves it.',
    'cell.name': 'row {row}, hole {n}',
    'cell.piece': '{name} piece',
    'cell.target': 'you can move here',
    'live.step': '{who}: {from} to {to}',
    'live.jump': { one: '{who}: jump from {from} to {to}', other: '{who}: {n} jumps from {from} to {to}' },

    'help.keys': '<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> pick / move · <kbd>Esc</kbd> drop · <kbd>N</kbd> new game',
    'help.touch': 'Tap a red piece, then tap a dot',
    'help.goal': 'Move all ten of your <b>red</b> pieces from the bottom corner into the opposite corner at the top before your opponent fills your corner.',
    'help.rules':
      '<li>On your turn move one piece: <b>step</b> into an empty neighbouring hole, or <b>jump</b> over one neighbouring piece (anyone\'s) into the empty hole right behind it.</li>' +
      '<li>Jumps can be <b>chained</b> in any direction and you may stop after any of them. You cannot step and then jump. Nothing is captured.</li>' +
      '<li>Tap a piece to see every hole it can reach (including the end of jump chains). Hover a dot to see the route.</li>' +
      '<li>A piece that has reached the goal corner can only move inside it.</li>' +
      '<li><b>Win</b> by filling every hole of the goal corner first.</li>' +
      '<li><b>No blocking:</b> from a player\'s 30th turn on, their pieces still sitting in their home corner count as the opponent\'s. Fill the rest of your goal corner and you win.</li>' +
      '<li><b>Draw</b> when both sides have played 200 turns.</li>' +
      '<li>Only games against 1 computer are ranked. 2 computers (three players, you go first) and 2 players on one device are for fun.</li>',

    'result.win': 'You win!',
    'result.lose': 'You lose',
    'result.draw': 'Draw',
    'result.pvp': '{side} wins!',
    'result.view': 'View board',
    'reason.home.win': 'All ten of your pieces reached the goal corner first.',
    'reason.home.lose': '{name} filled its goal corner first.',
    'reason.home.pvp': '{side} filled the goal corner first.',
    'reason.squat.win': 'Your opponent kept pieces in its home corner after turn 30, so they count as yours: your goal corner is full.',
    'reason.squat.lose': 'You kept pieces in your home corner after turn 30, so they count for {name}: its goal corner is full.',
    'reason.squat.pvp': '{other} kept pieces at home after turn 30, so they count for {side}.',
    'reason.limit': 'Both sides played 200 turns without filling their corner.',
    'reason.stuck': 'Nobody can move any more.',

    'confirm.title': 'Start a new game?',
    'confirm.text': 'This game will count as a loss.',
    'confirm.textFree': 'This game is not ranked; it will just be dropped.',

    'settings.level': 'Computer level',
    'settings.opp': 'Opponents',
    'settings.note': 'Only 1 computer is ranked. Changes start a new game if you have not moved yet; otherwise they apply from the next game.',

    'stats.played': 'Played',
    'stats.won': 'Won',
    'stats.streak': 'Win streak',
    'stats.best': 'Best streak',
    'stats.level': 'Opponent',
    'stats.games': 'Games',
    'stats.wins': 'Won',
    'stats.lost': 'Lost',
    'stats.drawn': 'Draws',
    'stats.note': 'Played, won and streaks count ranked games against 1 computer.',

    'summary.note': { one: '{n} win against the computer', other: '{n} wins against the computer' },
    'summary.none': 'Race ten pieces across the star',
    'summary.resume': '{mode} · {n}/10 home',

    'toast.saved': 'Game restored',
    'toast.thinking': 'Wait for the computer',
    'toast.noMove': 'This piece cannot move',
    'toast.notYours': 'Pick one of your red pieces',
    'toast.notTurn': '{side} to move',
    'toast.next': 'Applies from the next game',
    'toast.home': { one: '{n} piece is still in your home corner: move it out within {left} turns or it counts for your opponent.', other: '{n} pieces are still in your home corner: move them out within {left} turns or they count for your opponent.' },
  },
  vi: {
    'meta.title': 'Cờ Nhảy',
    'meta.description': 'Cờ Nhảy (Chinese checkers): nhảy cả mười quân qua bàn sao sáu cánh sang góc đối diện trước máy. Máy có ba mức.',
    'app.name': 'Cờ Nhảy',

    'side.0': 'Đỏ',
    'side.1': 'Xanh',
    'side.2': 'Lục',
    'level.easy': 'Dễ',
    'level.medium': 'Vừa',
    'level.hard': 'Khó',
    'opp.ai1': '1 máy',
    'opp.ai2': '2 máy',
    'opp.pvp': '2 người',

    'bar.you': 'Bạn',
    'bar.ai': 'Máy',
    'bar.aiN': 'Máy {n}',
    'bar.turn': 'Lượt của bạn',
    'bar.turnOf': 'Tới lượt',
    'bar.thinking': 'Đang nghĩ',
    'bar.winner': 'Thắng!',
    'bar.turnNo': 'Lượt {n}',
    'bar.homeLeft': '{n} quân còn ở nhà',
    'bar.inGoal': 'Số quân đã vào góc đích',

    'board.label': 'Bàn sao. Phím mũi tên di chuyển con trỏ, Enter chọn quân và đi.',
    'cell.name': 'hàng {row}, lỗ {n}',
    'cell.piece': 'quân {name}',
    'cell.target': 'đi tới được',
    'live.step': '{who}: {from} sang {to}',
    'live.jump': '{who}: nhảy {n} lần từ {from} tới {to}',

    'help.keys': '<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> di chuyển · <kbd>Enter</kbd> chọn / đi · <kbd>Esc</kbd> bỏ chọn · <kbd>N</kbd> ván mới',
    'help.touch': 'Chạm quân đỏ, rồi chạm chấm sáng',
    'help.goal': 'Đưa cả mười quân <b>đỏ</b> của bạn từ góc dưới sang góc đối diện ở trên trước khi đối thủ lấp đầy góc của bạn.',
    'help.rules':
      '<li>Mỗi lượt đi một quân: <b>bước</b> sang một lỗ kề còn trống, hoặc <b>nhảy</b> qua một quân kề (của ai cũng được) sang lỗ trống ngay sau nó.</li>' +
      '<li>Nhảy được <b>liên tiếp</b> nhiều lần, đổi hướng tùy ý và dừng sau lần nào cũng được. Không được bước rồi mới nhảy. Không ăn quân.</li>' +
      '<li>Chạm một quân để thấy mọi lỗ nó tới được (kể cả cuối chuỗi nhảy). Rê chuột lên chấm để xem đường nhảy.</li>' +
      '<li>Quân đã vào góc đích chỉ được đi trong góc đích.</li>' +
      '<li><b>Thắng:</b> lấp đầy mọi lỗ của góc đích trước.</li>' +
      '<li><b>Chống chiếm góc:</b> từ lượt thứ 30 của một bên, quân bên đó còn nằm trong góc nhà được tính là quân của đối thủ. Bạn lấp nốt các lỗ còn lại của góc đích là thắng.</li>' +
      '<li><b>Hòa</b> khi mỗi bên đã đi 200 lượt.</li>' +
      '<li>Chỉ ván đấu 1 máy được xếp hạng. 2 máy (ba người, bạn đi trước) và 2 người cùng máy để chơi vui.</li>',

    'result.win': 'Bạn thắng!',
    'result.lose': 'Bạn thua',
    'result.draw': 'Hòa',
    'result.pvp': '{side} thắng!',
    'result.view': 'Xem bàn',
    'reason.home.win': 'Cả mười quân của bạn đã vào góc đích trước.',
    'reason.home.lose': '{name} lấp đầy góc đích trước.',
    'reason.home.pvp': '{side} lấp đầy góc đích trước.',
    'reason.squat.win': 'Đối thủ để quân trong góc nhà quá lượt 30 nên quân đó tính cho bạn: góc đích của bạn đã đầy.',
    'reason.squat.lose': 'Bạn để quân trong góc nhà quá lượt 30 nên quân đó tính cho {name}: góc đích của máy đã đầy.',
    'reason.squat.pvp': '{other} để quân ở nhà quá lượt 30 nên quân đó tính cho {side}.',
    'reason.limit': 'Mỗi bên đã đi 200 lượt mà chưa ai lấp đầy góc đích.',
    'reason.stuck': 'Không bên nào còn đi được.',

    'confirm.title': 'Chơi ván mới?',
    'confirm.text': 'Ván này sẽ tính là thua.',
    'confirm.textFree': 'Ván này không xếp hạng, chỉ bỏ ván đang chơi.',

    'settings.level': 'Mức của máy',
    'settings.opp': 'Đối thủ',
    'settings.note': 'Chỉ đấu 1 máy được xếp hạng. Chưa đi nước nào thì đổi là chơi ván mới ngay; đã đi thì áp dụng từ ván sau.',

    'stats.played': 'Đã chơi',
    'stats.won': 'Thắng',
    'stats.streak': 'Chuỗi thắng',
    'stats.best': 'Chuỗi dài nhất',
    'stats.level': 'Đối thủ',
    'stats.games': 'Ván',
    'stats.wins': 'Thắng',
    'stats.lost': 'Thua',
    'stats.drawn': 'Hòa',
    'stats.note': 'Số ván, số thắng và chuỗi thắng tính các ván xếp hạng đấu 1 máy.',

    'summary.note': 'Thắng máy {n} ván',
    'summary.none': 'Đua mười quân qua bàn sao',
    'summary.resume': '{mode} · {n}/10 quân về đích',

    'toast.saved': 'Đã khôi phục ván',
    'toast.thinking': 'Chờ máy đi',
    'toast.noMove': 'Quân này không đi được',
    'toast.notYours': 'Chọn một quân đỏ của bạn',
    'toast.notTurn': 'Tới lượt {side}',
    'toast.next': 'Áp dụng từ ván sau',
    'toast.home': 'Còn {n} quân trong góc nhà: đưa ra trong {left} lượt nữa, nếu không sẽ bị tính cho đối thủ.',
  },
};
