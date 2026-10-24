/* =====================================================================
 * Qua Đường - Chuỗi giao diện tiếng Anh (mặc định) + tiếng Việt
 *   - Kit đọc ngôn ngữ ở khóa dùng chung với cổng: localStorage['playnine-lang']
 *   - Chuỗi chung (Cài đặt, Đóng, Giao diện…) có sẵn trong kit với khóa kit.*; khóa trùng tên ở đây sẽ đè
 *   - Chuỗi số nhiều: { one, other }, chọn theo params.n
 * ===================================================================== */
window.GAME_DICT = {
  en: {
    'meta.title': 'Road Crossing',
    'meta.description': 'Road Crossing: hop across endless roads, rivers and railways. How far can you go?',
    'app.name': 'Road Crossing',
    'hud.score': 'Score',
    'hud.best': 'Best',
    'board.label': 'Road Crossing board',
    'start.sub': 'Hop across roads, rivers and railways. Every new row is a point.',
    'start.button': 'Start',
    'start.continue': 'Continue',
    'start.restored': 'Run restored · score {n}',
    'start.hint': 'Space / Enter or tap to start',
    'guide.tap': 'Tap or ↑: hop forward',
    'guide.swipe': 'Swipe or arrow keys: hop that way',
    'guide.river': 'Ride the logs, never touch the water',
    'guide.train': 'Red light flashing: a train is coming',
    'guide.eagle': 'Don’t dawdle, the eagle is watching',
    'pause.title': 'Paused',
    'pause.button': 'Pause',
    'pause.resume': 'Continue',
    'pause.sub': 'Score {n}',
    'over.title': 'Game over',
    'over.record': 'New record!',
    'cause.car': 'Hit by a vehicle.',
    'cause.train': 'Hit by the train.',
    'cause.water': 'Splash! Ducklings can’t swim here.',
    'cause.off': 'The log carried you away.',
    'cause.eagle': 'Too slow: the eagle caught you.',
    'help.keys': '<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> / <kbd>WASD</kbd> hop · <kbd>P</kbd> pause · <kbd>N</kbd> new run',
    'help.touch': 'Tap to hop forward, swipe to hop sideways or back',
    'help.text':
      '<p>Guide the duckling as far forward as you can. Each new row you reach is one point.</p>' +
      '<ul>' +
      '<li><b>Roads</b>: cars, trucks and motorbikes drive at different speeds. Wait for a gap.</li>' +
      '<li><b>Rivers</b>: hop onto logs and boats and ride them. Falling in the water or drifting off the edge ends the run.</li>' +
      '<li><b>Railways</b>: when the red light flashes, a fast train arrives a moment later.</li>' +
      '<li><b>Grass</b> is safe, but trees block the way.</li>' +
      '<li>Don’t wait too long or go back too far: the screen keeps moving and an eagle swoops in.</li>' +
      '</ul>' +
      '<p>Controls: tap = hop forward, swipe = hop in that direction. Keyboard: arrow keys or WASD, <kbd>P</kbd> / <kbd>Esc</kbd> to pause.</p>',
    'confirm.title': 'Start a new run?',
    'confirm.text': 'This run ends here and your current score is recorded.',
    'stats.played': 'Runs',
    'stats.best': 'Best',
    'stats.avg': 'Average',
    'stats.total': 'Rows crossed',
    'settings.vibrate': 'Vibration',
    'settings.vibrateDesc': 'Short buzz when you get caught (on supported phones)',
    'summary.note': 'Best: {n} rows',
    'summary.none': 'Hop across roads and rivers',
    'summary.resume': 'Score {n}',
    'toast.saved': 'Run restored',
    'live.over': 'Game over. Score {n}.',
  },
  vi: {
    'meta.title': 'Qua Đường',
    'meta.description': 'Qua Đường: nhảy qua đường, qua sông, qua đường ray không có điểm dừng. Bạn đi được bao xa?',
    'app.name': 'Qua Đường',
    'hud.score': 'Điểm',
    'hud.best': 'Kỷ lục',
    'board.label': 'Bàn chơi Qua Đường',
    'start.sub': 'Nhảy qua đường, qua sông, qua đường ray. Mỗi hàng mới là một điểm.',
    'start.button': 'Bắt đầu',
    'start.continue': 'Chơi tiếp',
    'start.restored': 'Đã khôi phục lượt chơi · {n} điểm',
    'start.hint': 'Space / Enter hoặc chạm để bắt đầu',
    'guide.tap': 'Chạm hoặc ↑: nhảy lên trước',
    'guide.swipe': 'Vuốt hoặc phím mũi tên: nhảy theo hướng đó',
    'guide.river': 'Đứng trên gỗ mà qua sông, đừng chạm nước',
    'guide.train': 'Đèn đỏ nhấp nháy: tàu sắp tới',
    'guide.eagle': 'Đừng chần chừ, đại bàng đang rình',
    'pause.title': 'Tạm dừng',
    'pause.button': 'Tạm dừng',
    'pause.resume': 'Chơi tiếp',
    'pause.sub': '{n} điểm',
    'over.title': 'Hết lượt',
    'over.record': 'Kỷ lục mới!',
    'cause.car': 'Bị xe tông.',
    'cause.train': 'Bị tàu hỏa tông.',
    'cause.water': 'Tõm! Vịt con chưa biết bơi ở khúc này.',
    'cause.off': 'Khúc gỗ đã cuốn bạn đi mất.',
    'cause.eagle': 'Chậm quá: đại bàng đã tóm được bạn.',
    'help.keys': '<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> / <kbd>WASD</kbd> nhảy · <kbd>P</kbd> tạm dừng · <kbd>N</kbd> lượt mới',
    'help.touch': 'Chạm để nhảy lên, vuốt để nhảy ngang hoặc lùi',
    'help.text':
      '<p>Dẫn vịt con đi xa nhất có thể. Mỗi hàng mới bạn tới được là một điểm.</p>' +
      '<ul>' +
      '<li><b>Đường</b>: ô tô, xe tải, xe máy chạy nhanh chậm khác nhau. Chờ có khoảng trống rồi nhảy.</li>' +
      '<li><b>Sông</b>: nhảy lên khúc gỗ, chiếc thuyền và đi theo nó. Rơi xuống nước hoặc bị cuốn ra khỏi màn là hết lượt.</li>' +
      '<li><b>Đường ray</b>: đèn đỏ nhấp nháy thì chỉ chốc lát sau tàu hỏa lao tới.</li>' +
      '<li><b>Bãi cỏ</b> an toàn, nhưng cây cối chắn lối.</li>' +
      '<li>Đừng đứng chờ quá lâu hay lùi quá xa: màn hình vẫn trôi và đại bàng sẽ sà xuống.</li>' +
      '</ul>' +
      '<p>Điều khiển: chạm = nhảy lên trước, vuốt = nhảy theo hướng vuốt. Bàn phím: phím mũi tên hoặc WASD, <kbd>P</kbd> / <kbd>Esc</kbd> để tạm dừng.</p>',
    'confirm.title': 'Bắt đầu lượt mới?',
    'confirm.text': 'Lượt này dừng ở đây và điểm hiện tại được ghi nhận.',
    'stats.played': 'Số lượt',
    'stats.best': 'Kỷ lục',
    'stats.avg': 'Trung bình',
    'stats.total': 'Tổng số hàng',
    'settings.vibrate': 'Rung',
    'settings.vibrateDesc': 'Rung nhẹ khi bị bắt (trên điện thoại hỗ trợ)',
    'summary.note': 'Kỷ lục: {n} hàng',
    'summary.none': 'Nhảy qua đường, qua sông',
    'summary.resume': '{n} điểm',
    'toast.saved': 'Đã khôi phục lượt chơi',
    'live.over': 'Hết lượt. {n} điểm.',
  },
};
