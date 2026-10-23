/* =====================================================================
 * Cờ Chín Quân - Chuỗi giao diện tiếng Anh (mặc định) + tiếng Việt
 *   - Kit đọc ngôn ngữ ở khóa dùng chung với cổng: localStorage['playnine-lang']
 *   - Chuỗi chung (Cài đặt, Đóng, Giao diện…) có sẵn trong kit với khóa kit.*; khóa trùng tên ở đây sẽ đè
 *   - Chuỗi số nhiều: { one, other }, chọn theo params.n
 * ===================================================================== */
window.GAME_DICT = {
  en: {
    'meta.title': 'Mill',
    'meta.description': 'Mill (Nine men\'s morris) against the computer: place nine pieces, line up three to form a mill and take your opponent\'s pieces.',
    'app.name': 'Mill',

    'level.easy': 'Easy',
    'level.medium': 'Medium',
    'level.hard': 'Hard',
    'side.white': 'White',
    'side.black': 'Black',

    'player.you': 'You',
    'player.cpu': 'Computer',
    'player.counts': 'Hand {hand} · Board {board}',
    'player.thinking': 'Thinking…',
    'player.label': '{name}, {color}: {hand} in hand, {board} on board, {lost} lost',

    'phase.place': 'Place · {n} left',
    'phase.move': 'Move',
    'phase.fly': 'Fly',
    'phase.remove': 'Remove a piece',
    'phase.over': 'Game over',

    'status.place': 'Your turn: tap an empty point',
    'status.move': 'Your turn: tap a piece to move',
    'status.moveTo': 'Tap a marked point to move there',
    'status.fly': 'Three pieces left: fly to any empty point',
    'status.flyTo': 'Tap any empty point to fly there',
    'status.remove': 'Mill! Take a marked piece',
    'status.thinking': 'Computer is thinking',
    'status.cpuTurn': 'Computer to move',
    'status.won': 'You win!',
    'status.lost': 'The computer wins',
    'status.draw': 'Draw',

    'board.label': 'Mill board',
    'point.empty': 'Point {n}, empty',
    'point.white': 'Point {n}, white piece',
    'point.black': 'Point {n}, black piece',

    'help.keys': '<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> cursor · <kbd>Enter</kbd> place / move / take · <kbd>Esc</kbd> cancel · <kbd>N</kbd> new game',
    'help.touch': 'Tap a point to place · tap a piece, then where to go',
    'help.text': '<p>Two players, nine pieces each, on 24 points joined by lines. White moves first.</p>' +
      '<ol class="help-list">' +
      '<li><b>Place:</b> take turns putting your pieces on empty points until all 18 are down.</li>' +
      '<li><b>Move:</b> slide one piece along a line to the next empty point.</li>' +
      '<li><b>Fly:</b> when you are down to three pieces, a piece may jump to any empty point.</li>' +
      '</ol>' +
      '<p>Three of your pieces in a row on one line make a <b>mill</b>: take one of your opponent\'s pieces. Pieces inside a mill are safe unless every piece is in a mill.</p>' +
      '<p>You lose with fewer than three pieces or no legal move. Fifty moves each without a mill, or the same position three times, is a draw.</p>',
    'help.controls': 'Choose your colour and the computer\'s level in Settings.',

    'end.won': 'You win!',
    'end.lost': 'You lose',
    'end.draw': 'Draw',
    'end.pieces.won': 'The computer is down to two pieces.',
    'end.pieces.lost': 'You are down to two pieces.',
    'end.blocked.won': 'The computer has no legal move.',
    'end.blocked.lost': 'You have no legal move.',
    'end.fifty': 'Fifty moves each without a mill.',
    'end.repetition': 'The same position came up three times.',
    'end.meta': '{level} · {moves} moves',
    'end.view': 'View board',

    'confirm.title': 'Start a new game?',
    'confirm.text': 'This game will count as a loss.',

    'settings.level': 'Computer',
    'settings.levelDesc.easy': 'Looks two moves ahead and slips up now and then.',
    'settings.levelDesc.medium': 'Looks four moves ahead.',
    'settings.levelDesc.hard': 'Looks six or more moves ahead and plans double mills.',
    'settings.side': 'Your colour',
    'settings.sideDesc': 'White moves first.',

    'stats.played': 'Played',
    'stats.won': 'Won',
    'stats.drawn': 'Drawn',
    'stats.lost': 'Lost',
    'stats.level': '{won} / {played}',
    'stats.byLevel': 'Wins by level',

    'summary.note': 'Won {won} of {played}',
    'summary.none': 'Line up three, take a piece',
    'summary.resume': 'You {you} · Computer {cpu}',
    'summary.wins': 'Wins · {level}',

    'toast.saved': 'Game restored',
    'toast.nextGame': 'The new setting applies from the next game',
    'toast.wait': 'Wait for the computer',
    'toast.take': 'Take one of the marked pieces',
    'toast.stuck': 'That piece cannot move',
    'toast.occupied': 'That point is taken',
    'toast.notYours': 'Pick one of your own pieces',
    'toast.far': 'Pieces move along a line to the next point',
  },
  vi: {
    'meta.title': 'Cờ Chín Quân',
    'meta.description': 'Cờ Chín Quân (Mill) đấu với máy: đặt chín quân, xếp ba quân thẳng hàng thành mill để ăn quân đối thủ.',
    'app.name': 'Cờ Chín Quân',

    'level.easy': 'Dễ',
    'level.medium': 'Vừa',
    'level.hard': 'Khó',
    'side.white': 'Trắng',
    'side.black': 'Đen',

    'player.you': 'Bạn',
    'player.cpu': 'Máy',
    'player.counts': 'Tay {hand} · Bàn {board}',
    'player.thinking': 'Đang nghĩ…',
    'player.label': '{name}, quân {color}: {hand} trên tay, {board} trên bàn, mất {lost}',

    'phase.place': 'Đặt quân · còn {n}',
    'phase.move': 'Đi quân',
    'phase.fly': 'Bay',
    'phase.remove': 'Ăn một quân',
    'phase.over': 'Hết ván',

    'status.place': 'Lượt bạn: chạm một điểm trống',
    'status.move': 'Lượt bạn: chạm quân muốn đi',
    'status.moveTo': 'Chạm điểm được đánh dấu để đi tới',
    'status.fly': 'Còn ba quân: được bay tới điểm trống bất kỳ',
    'status.flyTo': 'Chạm điểm trống bất kỳ để bay tới',
    'status.remove': 'Mill! Ăn một quân được đánh dấu',
    'status.thinking': 'Máy đang nghĩ',
    'status.cpuTurn': 'Lượt máy',
    'status.won': 'Bạn thắng!',
    'status.lost': 'Máy thắng',
    'status.draw': 'Hòa',

    'board.label': 'Bàn Cờ Chín Quân',
    'point.empty': 'Điểm {n}, trống',
    'point.white': 'Điểm {n}, quân trắng',
    'point.black': 'Điểm {n}, quân đen',

    'help.keys': '<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> con trỏ · <kbd>Enter</kbd> đặt / đi / ăn · <kbd>Esc</kbd> bỏ chọn · <kbd>N</kbd> ván mới',
    'help.touch': 'Chạm điểm để đặt · chạm quân rồi chạm nơi đến',
    'help.text': '<p>Hai người, mỗi người chín quân, trên 24 điểm nối bằng các đường kẻ. Trắng đi trước.</p>' +
      '<ol class="help-list">' +
      '<li><b>Đặt quân:</b> lần lượt đặt quân vào điểm trống cho tới khi đủ 18 quân.</li>' +
      '<li><b>Đi quân:</b> đẩy một quân theo đường kẻ sang điểm kề còn trống.</li>' +
      '<li><b>Bay:</b> khi chỉ còn ba quân, quân được nhảy tới điểm trống bất kỳ.</li>' +
      '</ol>' +
      '<p>Ba quân của bạn thẳng hàng trên một đường là một <b>mill</b>: được ăn một quân đối thủ. Quân nằm trong mill không bị ăn, trừ khi mọi quân đều nằm trong mill.</p>' +
      '<p>Còn dưới ba quân hoặc không còn nước đi là thua. Năm mươi nước mỗi bên không lập mill, hoặc một thế lặp lại ba lần, là hòa.</p>',
    'help.controls': 'Chọn màu quân và mức của máy trong Cài đặt.',

    'end.won': 'Bạn thắng!',
    'end.lost': 'Bạn thua',
    'end.draw': 'Hòa',
    'end.pieces.won': 'Máy chỉ còn hai quân.',
    'end.pieces.lost': 'Bạn chỉ còn hai quân.',
    'end.blocked.won': 'Máy không còn nước đi.',
    'end.blocked.lost': 'Bạn không còn nước đi.',
    'end.fifty': 'Năm mươi nước mỗi bên không ai lập mill.',
    'end.repetition': 'Một thế cờ lặp lại ba lần.',
    'end.meta': '{level} · {moves} nước',
    'end.view': 'Xem bàn',

    'confirm.title': 'Chơi ván mới?',
    'confirm.text': 'Ván này sẽ tính là thua.',

    'settings.level': 'Mức của máy',
    'settings.levelDesc.easy': 'Nhìn trước hai nước, thỉnh thoảng đi hớ.',
    'settings.levelDesc.medium': 'Nhìn trước bốn nước.',
    'settings.levelDesc.hard': 'Nhìn trước sáu nước trở lên, biết dựng mill kép.',
    'settings.side': 'Màu quân của bạn',
    'settings.sideDesc': 'Trắng đi trước.',

    'stats.played': 'Đã chơi',
    'stats.won': 'Thắng',
    'stats.drawn': 'Hòa',
    'stats.lost': 'Thua',
    'stats.level': '{won} / {played}',
    'stats.byLevel': 'Số ván thắng theo mức',

    'summary.note': 'Thắng {won} / {played} ván',
    'summary.none': 'Xếp ba quân thẳng hàng, ăn quân đối thủ',
    'summary.resume': 'Bạn {you} · Máy {cpu}',
    'summary.wins': 'Thắng · {level}',

    'toast.saved': 'Đã khôi phục ván',
    'toast.nextGame': 'Cài đặt mới áp dụng từ ván sau',
    'toast.wait': 'Chờ máy đi',
    'toast.take': 'Ăn một trong các quân được đánh dấu',
    'toast.stuck': 'Quân này không đi được',
    'toast.occupied': 'Điểm này đã có quân',
    'toast.notYours': 'Chọn một quân của bạn',
    'toast.far': 'Quân đi theo đường kẻ sang điểm kề',
  },
};
