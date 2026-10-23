/* =====================================================================
 * Nổ Khối - Chuỗi giao diện tiếng Anh (mặc định) + tiếng Việt
 *   - Kit đọc ngôn ngữ ở khóa dùng chung với cổng: localStorage['playnine-lang']
 *   - Chuỗi chung (Cài đặt, Đóng, Giao diện…) có sẵn trong kit với khóa kit.*; khóa trùng tên ở đây sẽ đè
 *   - Chuỗi số nhiều: { one, other }, chọn theo params.n
 * ===================================================================== */
window.GAME_DICT = {
  en: {
    'meta.title': 'Block Pop',
    'meta.description': 'Block Pop: pop groups of same-coloured blocks. Bigger groups score far more, and clearing the board earns a 1000-point bonus.',
    'app.name': 'Block Pop',
    'hud.score': 'Score',
    'hud.left': 'Blocks',
    'hud.best': 'Best',
    'board.label': 'Block board. Arrow keys move, Space pops the group.',
    'board.group': { one: '1 block, cannot pop', other: 'Group of {n}: {pts} points' },
    'board.popped': 'Popped {n} blocks, +{pts}. Score {score}',
    'board.noMoves': 'No more moves',
    'board.clearedBanner': 'Board cleared!',
    'help.keys': '<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> move · <kbd>Space</kbd> pop · <kbd>N</kbd> new game',
    'help.touch': 'Tap a group to see its value, tap again to pop',
    'help.touchOne': 'Tap a group to pop it',
    'help.text':
      '<ul>' +
      '<li>Pop a group of <b>2 or more</b> touching blocks of the same colour (side by side, not diagonal).</li>' +
      '<li>A group of <b>n</b> blocks scores <b>(n − 2)²</b>: 2 blocks give 0, 5 give 9, 12 give 100. Let groups grow before you pop them.</li>' +
      '<li>Blocks above fall down; an empty column closes up to the left.</li>' +
      '<li>The game ends when no group of 2 is left. Leftover blocks cost nothing.</li>' +
      '<li>Clear the whole board for a <b>+1000</b> bonus.</li>' +
      '<li>Mouse: point to see a group and its value, click to pop. Touch: the first tap shows the value, the second tap pops (Settings can switch to one tap). Keyboard: arrows move, Space or Enter pops. There is no undo.</li>' +
      '</ul>',
    'settings.singleTap': 'One-tap pop',
    'settings.singleTapDesc': 'On touch screens, pop a group with the first tap instead of tapping twice',
    'over.title': 'No more moves',
    'over.cleared': 'Board cleared!',
    'over.left': { one: '1 block left on the board.', other: '{n} blocks left on the board.' },
    'over.bonus': 'Every block popped: +1000 bonus included.',
    'over.best': 'New best score!',
    'confirm.title': 'Start a new game?',
    'confirm.text': { one: 'This game ends now with 1 point.', other: 'This game ends now with {score} points.' },
    'stats.played': 'Played',
    'stats.best': 'Best score',
    'stats.avg': 'Average',
    'stats.cleared': 'Boards cleared',
    'summary.note': 'Best {score} points',
    'summary.none': 'Pop big groups, clear the board',
    'summary.resume': '{score} points · {left} blocks left',
    'toast.saved': 'Game restored',
  },
  vi: {
    'meta.title': 'Nổ Khối',
    'meta.description': 'Nổ Khối: nổ các nhóm khối cùng màu. Nhóm càng lớn điểm càng cao, dọn sạch bàn được thưởng 1000 điểm.',
    'app.name': 'Nổ Khối',
    'hud.score': 'Điểm',
    'hud.left': 'Khối',
    'hud.best': 'Kỷ lục',
    'board.label': 'Bàn khối. Phím mũi tên để di chuyển, Space để nổ nhóm.',
    'board.group': { one: '1 khối, không nổ được', other: 'Nhóm {n} khối: {pts} điểm' },
    'board.popped': 'Nổ {n} khối, +{pts}. Điểm {score}',
    'board.noMoves': 'Hết nước đi',
    'board.clearedBanner': 'Sạch bàn!',
    'help.keys': '<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> di chuyển · <kbd>Space</kbd> nổ · <kbd>N</kbd> ván mới',
    'help.touch': 'Chạm một nhóm để xem điểm, chạm lần nữa để nổ',
    'help.touchOne': 'Chạm một nhóm để nổ',
    'help.text':
      '<ul>' +
      '<li>Nổ một nhóm từ <b>2 khối</b> cùng màu nằm sát nhau (chung cạnh, không tính đường chéo).</li>' +
      '<li>Nhóm <b>n</b> khối được <b>(n − 2)²</b> điểm: 2 khối được 0, 5 khối được 9, 12 khối được 100. Hãy để nhóm lớn dần rồi mới nổ.</li>' +
      '<li>Khối phía trên rơi xuống; cột trống thì các cột bên phải dồn sang trái.</li>' +
      '<li>Hết nhóm 2 khối là hết ván. Khối còn lại không bị trừ điểm.</li>' +
      '<li>Dọn sạch bàn được thưởng <b>+1000</b> điểm.</li>' +
      '<li>Chuột: trỏ vào để xem nhóm và số điểm, bấm để nổ. Cảm ứng: chạm lần đầu xem điểm, chạm lần hai để nổ (đổi sang một chạm trong Cài đặt). Bàn phím: mũi tên di chuyển, Space hoặc Enter để nổ. Không có đi lại.</li>' +
      '</ul>',
    'settings.singleTap': 'Nổ bằng một chạm',
    'settings.singleTapDesc': 'Trên màn hình cảm ứng, chạm một lần là nổ ngay, không cần chạm hai lần',
    'over.title': 'Hết nước đi',
    'over.cleared': 'Sạch bàn!',
    'over.left': { one: 'Còn 1 khối trên bàn.', other: 'Còn {n} khối trên bàn.' },
    'over.bonus': 'Nổ hết mọi khối: đã cộng 1000 điểm thưởng.',
    'over.best': 'Kỷ lục mới!',
    'confirm.title': 'Chơi ván mới?',
    'confirm.text': 'Ván này kết thúc ngay với {score} điểm.',
    'stats.played': 'Đã chơi',
    'stats.best': 'Điểm cao nhất',
    'stats.avg': 'Trung bình',
    'stats.cleared': 'Lần sạch bàn',
    'summary.note': 'Kỷ lục {score} điểm',
    'summary.none': 'Nổ nhóm lớn, dọn sạch bàn',
    'summary.resume': '{score} điểm · còn {left} khối',
    'toast.saved': 'Đã khôi phục ván',
  },
};
