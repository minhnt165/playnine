/* =====================================================================
 * Ô Vuông - Chuỗi giao diện tiếng Anh (mặc định) + tiếng Việt
 *   - Kit đọc ngôn ngữ ở khóa dùng chung với cổng: localStorage['playnine-lang']
 *   - Chuỗi chung (Cài đặt, Đóng, Giao diện…) có sẵn trong kit với khóa kit.*; khóa trùng tên ở đây sẽ đè
 *   - Chuỗi số nhiều: { one, other }, chọn theo params.n
 * ===================================================================== */
window.GAME_DICT = {
  en: {
    'meta.title': 'Dots and Boxes',
    'meta.description': 'Dots and Boxes against the computer or a friend: draw lines between dots, close a box to claim it and move again. Most boxes wins.',
    'app.name': 'Dots and Boxes',

    'level.easy': 'Easy',
    'level.medium': 'Medium',
    'level.hard': 'Hard',
    'level.pvp': '2 players',
    'first.you': 'You',
    'first.cpu': 'Computer',

    'player.you': 'You',
    'player.cpu': 'Computer',
    'player.p1': 'Player 1',
    'player.p2': 'Player 2',
    'player.human': 'Your boxes',
    'player.thinking': 'Thinking…',
    'player.label': '{name}: {n} boxes',

    'status.turn': 'Your turn: draw a line',
    'status.again': 'Box closed! Draw another line',
    'status.pTurn': '{name}: draw a line',
    'status.pAgain': '{name} closed a box: go again',
    'status.thinking': 'Computer is thinking',
    'status.cpuTurn': 'Computer to move',
    'status.cpuAgain': 'Computer closed a box and goes again',
    'status.won': 'You win!',
    'status.lost': 'The computer wins',
    'status.pWins': '{name} wins!',
    'status.draw': 'Draw',
    'chip.left': { one: '{size} · 1 line left', other: '{size} · {n} lines left' },
    'chip.over': 'Game over',

    'board.label': 'Dots and Boxes board',
    'edge.h': 'Line along row {r}, column {c}',
    'edge.v': 'Line down column {c}, row {r}',
    'edge.drawn': '{where}, drawn by {name}',

    'help.keys': '<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> cursor · <kbd>Enter</kbd> draw · <kbd>N</kbd> new game',
    'help.touch': 'Tap between two dots to draw a line',
    'help.text': '<p>Take turns drawing a line between two neighbouring dots.</p>' +
      '<ul class="help-list">' +
      '<li>Draw the <b>fourth side</b> of a box to claim it, then <b>draw again</b>. One line can close two boxes.</li>' +
      '<li>When every line is drawn, whoever owns <b>more boxes</b> wins.</li>' +
      '<li>Avoid drawing the third side of a box: your opponent closes it next.</li>' +
      '</ul>' +
      '<p><b>Tip:</b> late in the game, when someone must hand over a long chain of boxes, the taker can keep the last two boxes back (a <i>double-cross</i>) so the other side has to open the next chain. The Hard computer plays this way.</p>' +
      '<p>Choose the opponent, board size and who moves first in Settings. Two-player games are not ranked.</p>',

    'end.won': 'You win!',
    'end.lost': 'You lose',
    'end.draw': 'Draw',
    'end.pWins': '{name} wins!',
    'end.meta': '{level} · {size} board',
    'end.view': 'View board',

    'confirm.title': 'Start a new game?',
    'confirm.text': 'This game will count as a loss.',
    'confirm.textPvp': 'The current two-player game will be dropped.',

    'settings.level': 'Opponent',
    'settings.levelDesc.easy': 'Closes any box it can, otherwise draws at random.',
    'settings.levelDesc.medium': 'Never draws a box\'s third side while it has a safe line.',
    'settings.levelDesc.hard': 'Counts chains and keeps control with double-crosses; plays the end game perfectly.',
    'settings.levelDesc.pvp': 'Two players take turns on this device. Not ranked.',
    'settings.size': 'Board',
    'settings.sizeDesc.3': '9 boxes · quick game.',
    'settings.sizeDesc.4': '16 boxes · a tie (8–8) is possible.',
    'settings.sizeDesc.5': '25 boxes · longer chains, deeper end game.',
    'settings.first': 'First move',

    'stats.played': 'Played',
    'stats.won': 'Won',
    'stats.drawn': 'Drawn',
    'stats.lost': 'Lost',
    'stats.byLevel': 'Wins by level',
    'stats.level': '{won}/{played}',
    'stats.pvp': { one: 'Two-player games: 1', other: 'Two-player games: {n}' },

    'summary.note': '{won} wins in {played} games',
    'summary.none': 'Close more boxes than the computer',
    'summary.wins': 'Wins · {level}',
    'summary.resume': 'You {you} – {cpu} Computer',
    'summary.resumePvp': 'Player 1 {a} – {b} Player 2',

    'toast.saved': 'Game restored',
    'toast.wait': 'Wait for the computer',
    'toast.taken': 'That line is already drawn',
    'toast.nextGame': 'Applies from the next game',
  },
  vi: {
    'meta.title': 'Ô Vuông',
    'meta.description': 'Ô Vuông (Dots and Boxes) đấu máy hoặc hai người: kẻ đoạn nối hai điểm, khép được ô thì ô là của mình và đi tiếp. Nhiều ô hơn là thắng.',
    'app.name': 'Ô Vuông',

    'level.easy': 'Dễ',
    'level.medium': 'Vừa',
    'level.hard': 'Khó',
    'level.pvp': '2 người',
    'first.you': 'Bạn',
    'first.cpu': 'Máy',

    'player.you': 'Bạn',
    'player.cpu': 'Máy',
    'player.p1': 'Người 1',
    'player.p2': 'Người 2',
    'player.human': 'Ô của bạn',
    'player.thinking': 'Đang nghĩ…',
    'player.label': '{name}: {n} ô',

    'status.turn': 'Lượt bạn: kẻ một cạnh',
    'status.again': 'Khép ô! Kẻ thêm một cạnh',
    'status.pTurn': '{name}: kẻ một cạnh',
    'status.pAgain': '{name} khép ô: đi tiếp',
    'status.thinking': 'Máy đang nghĩ',
    'status.cpuTurn': 'Lượt máy',
    'status.cpuAgain': 'Máy khép ô và đi tiếp',
    'status.won': 'Bạn thắng!',
    'status.lost': 'Máy thắng',
    'status.pWins': '{name} thắng!',
    'status.draw': 'Hòa',
    'chip.left': '{size} · còn {n} cạnh',
    'chip.over': 'Hết ván',

    'board.label': 'Bàn Ô Vuông',
    'edge.h': 'Cạnh ngang hàng {r}, cột {c}',
    'edge.v': 'Cạnh dọc cột {c}, hàng {r}',
    'edge.drawn': '{where}, {name} đã kẻ',

    'help.keys': '<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> con trỏ · <kbd>Enter</kbd> kẻ · <kbd>N</kbd> ván mới',
    'help.touch': 'Chạm vào giữa hai điểm để kẻ cạnh',
    'help.text': '<p>Hai bên lần lượt kẻ một cạnh nối hai điểm cạnh nhau.</p>' +
      '<ul class="help-list">' +
      '<li>Kẻ <b>cạnh thứ tư</b> của một ô thì ô đó là của bạn và bạn <b>được đi tiếp</b>. Một cạnh có thể khép hai ô.</li>' +
      '<li>Kẻ hết cạnh thì bên có <b>nhiều ô hơn</b> thắng.</li>' +
      '<li>Tránh kẻ cạnh thứ ba của một ô: đối thủ sẽ khép ô đó ngay.</li>' +
      '</ul>' +
      '<p><b>Mẹo:</b> cuối ván, khi một bên buộc phải nhường cả chuỗi ô dài, bên ăn có thể chừa lại 2 ô cuối (<i>double-cross</i>) để đối thủ phải mở chuỗi tiếp theo. Máy mức Khó chơi theo cách này.</p>' +
      '<p>Chọn đối thủ, cỡ bàn và ai đi trước trong Cài đặt. Ván hai người không tính xếp hạng.</p>',

    'end.won': 'Bạn thắng!',
    'end.lost': 'Bạn thua',
    'end.draw': 'Hòa',
    'end.pWins': '{name} thắng!',
    'end.meta': '{level} · bàn {size}',
    'end.view': 'Xem bàn',

    'confirm.title': 'Chơi ván mới?',
    'confirm.text': 'Ván này sẽ tính là thua.',
    'confirm.textPvp': 'Ván hai người đang chơi sẽ bị bỏ.',

    'settings.level': 'Đối thủ',
    'settings.levelDesc.easy': 'Khép được ô nào là khép, còn lại kẻ bừa.',
    'settings.levelDesc.medium': 'Không kẻ cạnh thứ ba cho ô nào khi còn cạnh an toàn.',
    'settings.levelDesc.hard': 'Đếm chuỗi, giữ quyền kiểm soát bằng double-cross; tàn cuộc chơi không sai.',
    'settings.levelDesc.pvp': 'Hai người thay phiên trên cùng máy. Không tính xếp hạng.',
    'settings.size': 'Cỡ bàn',
    'settings.sizeDesc.3': '9 ô · ván nhanh.',
    'settings.sizeDesc.4': '16 ô · có thể hòa 8–8.',
    'settings.sizeDesc.5': '25 ô · chuỗi dài hơn, tàn cuộc sâu hơn.',
    'settings.first': 'Đi trước',

    'stats.played': 'Đã chơi',
    'stats.won': 'Thắng',
    'stats.drawn': 'Hòa',
    'stats.lost': 'Thua',
    'stats.byLevel': 'Số ván thắng theo mức',
    'stats.level': '{won}/{played}',
    'stats.pvp': 'Ván hai người: {n}',

    'summary.note': 'Thắng {won}/{played} ván',
    'summary.none': 'Khép nhiều ô hơn máy',
    'summary.wins': 'Thắng · {level}',
    'summary.resume': 'Bạn {you} – {cpu} Máy',
    'summary.resumePvp': 'Người 1 {a} – {b} Người 2',

    'toast.saved': 'Đã khôi phục ván',
    'toast.wait': 'Chờ máy đi',
    'toast.taken': 'Cạnh này đã kẻ',
    'toast.nextGame': 'Áp dụng từ ván sau',
  },
};
