/* =====================================================================
 * Cờ Thú - Chuỗi giao diện tiếng Anh (mặc định) + tiếng Việt
 *   - Kit đọc ngôn ngữ ở khóa dùng chung với cổng: localStorage['playnine-lang']
 *   - Chuỗi chung (Cài đặt, Đóng, Giao diện…) có sẵn trong kit với khóa kit.*; khóa trùng tên ở đây sẽ đè
 *   - Chuỗi số nhiều: { one, other }, chọn theo params.n
 * ===================================================================== */
window.GAME_DICT = {
  en: {
    'meta.title': 'Animal Chess',
    'meta.description': 'Animal Chess (Jungle): lead eight animals across the rivers into the enemy den. Play the computer at three levels.',
    'app.name': 'Animal Chess',

    'piece.1': 'Rat',
    'piece.2': 'Cat',
    'piece.3': 'Dog',
    'piece.4': 'Wolf',
    'piece.5': 'Leopard',
    'piece.6': 'Tiger',
    'piece.7': 'Lion',
    'piece.8': 'Elephant',
    'side.0': 'Red',
    'side.1': 'Blue',
    'level.easy': 'Easy',
    'level.medium': 'Medium',
    'level.hard': 'Hard',

    'bar.you': 'You',
    'bar.ai': 'Computer',
    'bar.youSub': '{side}',
    'bar.aiSub': '{side} · {level}',
    'bar.turn': 'Your move',
    'bar.thinking': 'Thinking',

    'board.label': 'Animal Chess board. Arrow keys move the cursor, Enter picks a piece and moves it.',
    'cell.water': 'water',
    'cell.trap': 'trap',
    'cell.den': 'den',
    'cell.piece': '{side} {piece} {rank}',
    'cell.target': 'can move here',

    'help.keys': '<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> pick / move · <kbd>N</kbd> new game',
    'help.touch': 'Tap a piece, then tap a highlighted square',
    'help.goal': 'Move one of your animals into the <b>enemy den</b> (the arch in the middle of the far row), or capture every enemy piece. Each turn, move one animal one square up, down, left or right.',
    'help.rules':
      '<li>An animal captures an enemy of the <b>same or lower rank</b> (the number on the piece).</li>' +
      '<li>The <b>Rat</b> captures the Elephant, but the Elephant cannot capture the Rat.</li>' +
      '<li>Only the Rat can swim. A Rat in the water cannot capture a piece on land, and the other way round.</li>' +
      '<li>The <b>Lion</b> and <b>Tiger</b> jump straight across a river, unless a Rat is in the water on their path.</li>' +
      '<li>An enemy standing on one of <b>your traps</b> (spikes next to your den) has rank 0: any of your animals can capture it.</li>' +
      '<li>You cannot enter your own den. If you have no legal move, you lose.</li>' +
      '<li>Draw: the same position three times, or 200 moves in a row without a capture.</li>',

    'result.win': 'You win!',
    'result.lose': 'You lose',
    'result.draw': 'Draw',
    'result.view': 'View board',
    'reason.den.win': 'Your {piece} walked into the enemy den.',
    'reason.den.lose': 'The computer’s {piece} walked into your den.',
    'reason.wipe.win': 'You captured every enemy animal.',
    'reason.wipe.lose': 'The computer captured all your animals.',
    'reason.stuck.win': 'The computer has no legal move left.',
    'reason.stuck.lose': 'You have no legal move left.',
    'reason.repeat': 'The same position came up three times.',
    'reason.quiet': '200 moves in a row without a capture.',

    'confirm.title': 'Start a new game?',
    'confirm.text': 'This game will count as a loss.',

    'stats.played': 'Played',
    'stats.won': 'Won',
    'stats.streak': 'Win streak',
    'stats.best': 'Best streak',
    'stats.level': 'Level',
    'stats.games': 'Games',
    'stats.wins': 'Won',
    'stats.lost': 'Lost',
    'stats.drawn': 'Draws',

    'settings.level': 'Computer level',
    'settings.side': 'You play',
    'settings.red': 'Red · first',
    'settings.blue': 'Blue · second',
    'settings.note': 'Changes start a new game if you have not moved yet; otherwise they apply from the next game.',

    'toast.saved': 'Game restored',
    'toast.next': 'Applies from the next game',
    'toast.thinking': 'The computer is thinking…',
    'toast.notYours': 'That is the computer’s piece',
    'toast.noMove': 'This piece has no legal move',

    'live.move': '{who}: {piece} {from} to {to}',
    'live.capture': ', captures {piece}',

    'summary.note': { one: '{n} win vs computer', other: '{n} wins vs computer' },
    'summary.none': 'Reach the enemy den to win',
    'summary.resume': '{level} · move {n}',
  },
  vi: {
    'meta.title': 'Cờ Thú',
    'meta.description': 'Cờ Thú (Đấu Thú Kỳ): dẫn tám con vật vượt sông vào hang đối thủ. Đấu với máy ở ba mức.',
    'app.name': 'Cờ Thú',

    'piece.1': 'Chuột',
    'piece.2': 'Mèo',
    'piece.3': 'Chó',
    'piece.4': 'Sói',
    'piece.5': 'Báo',
    'piece.6': 'Hổ',
    'piece.7': 'Sư Tử',
    'piece.8': 'Voi',
    'side.0': 'Đỏ',
    'side.1': 'Xanh',
    'level.easy': 'Dễ',
    'level.medium': 'Vừa',
    'level.hard': 'Khó',

    'bar.you': 'Bạn',
    'bar.ai': 'Máy',
    'bar.youSub': '{side}',
    'bar.aiSub': '{side} · {level}',
    'bar.turn': 'Tới lượt bạn',
    'bar.thinking': 'Đang nghĩ',

    'board.label': 'Bàn Cờ Thú. Phím mũi tên di chuyển con trỏ, Enter chọn quân và đi.',
    'cell.water': 'nước',
    'cell.trap': 'bẫy',
    'cell.den': 'hang',
    'cell.piece': '{piece} {side} {rank}',
    'cell.target': 'đi được tới đây',

    'help.keys': '<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> di chuyển · <kbd>Enter</kbd> chọn / đi · <kbd>N</kbd> ván mới',
    'help.touch': 'Chạm một quân, rồi chạm ô được tô sáng',
    'help.goal': 'Đưa một con vật vào <b>hang đối thủ</b> (cửa hang giữa hàng cuối bên kia), hoặc ăn hết quân đối thủ. Mỗi lượt đi một con một ô lên, xuống, trái hoặc phải.',
    'help.rules':
      '<li>Con vật ăn được quân địch <b>cùng bậc hoặc bậc thấp hơn</b> (số trên quân).</li>' +
      '<li><b>Chuột</b> ăn được Voi, nhưng Voi không ăn được Chuột.</li>' +
      '<li>Chỉ Chuột bơi được. Chuột dưới nước không ăn quân trên cạn và ngược lại.</li>' +
      '<li><b>Sư Tử</b> và <b>Hổ</b> nhảy thẳng qua sông, trừ khi có Chuột dưới nước chắn đường.</li>' +
      '<li>Quân địch đứng trên <b>bẫy của bạn</b> (gai cạnh hang bạn) có bậc 0: con nào của bạn cũng ăn được.</li>' +
      '<li>Không được vào hang của mình. Hết nước đi hợp lệ là thua.</li>' +
      '<li>Hòa: cùng một thế cờ lặp lại ba lần, hoặc 200 nước liền không ai ăn quân.</li>',

    'result.win': 'Bạn thắng!',
    'result.lose': 'Bạn thua',
    'result.draw': 'Hòa',
    'result.view': 'Xem bàn cờ',
    'reason.den.win': '{piece} của bạn đã vào hang đối thủ.',
    'reason.den.lose': '{piece} của máy đã vào hang của bạn.',
    'reason.wipe.win': 'Bạn đã ăn hết quân của máy.',
    'reason.wipe.lose': 'Máy đã ăn hết quân của bạn.',
    'reason.stuck.win': 'Máy không còn nước đi hợp lệ.',
    'reason.stuck.lose': 'Bạn không còn nước đi hợp lệ.',
    'reason.repeat': 'Cùng một thế cờ lặp lại ba lần.',
    'reason.quiet': '200 nước liền không ai ăn quân.',

    'confirm.title': 'Chơi ván mới?',
    'confirm.text': 'Ván này sẽ tính là thua.',

    'stats.played': 'Đã chơi',
    'stats.won': 'Thắng',
    'stats.streak': 'Chuỗi thắng',
    'stats.best': 'Chuỗi dài nhất',
    'stats.level': 'Mức',
    'stats.games': 'Ván',
    'stats.wins': 'Thắng',
    'stats.lost': 'Thua',
    'stats.drawn': 'Hòa',

    'settings.level': 'Mức của máy',
    'settings.side': 'Bạn cầm',
    'settings.red': 'Đỏ · đi trước',
    'settings.blue': 'Xanh · đi sau',
    'settings.note': 'Chưa đi nước nào thì đổi là chơi ván mới ngay; đã đi rồi thì áp dụng từ ván sau.',

    'toast.saved': 'Đã khôi phục ván',
    'toast.next': 'Áp dụng từ ván sau',
    'toast.thinking': 'Máy đang nghĩ…',
    'toast.notYours': 'Đó là quân của máy',
    'toast.noMove': 'Quân này không có nước đi',

    'live.move': '{who}: {piece} {from} tới {to}',
    'live.capture': ', ăn {piece}',

    'summary.note': 'Thắng máy {n} ván',
    'summary.none': 'Vào hang đối thủ để thắng',
    'summary.resume': '{level} · nước {n}',
  },
};
