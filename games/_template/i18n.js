/* =====================================================================
 * {{nameVi}} - Chuỗi giao diện tiếng Anh (mặc định) + tiếng Việt
 *   - Kit đọc ngôn ngữ ở khóa dùng chung với cổng: localStorage['playnine-lang']
 *   - Chuỗi chung (Cài đặt, Đóng, Giao diện…) có sẵn trong kit với khóa kit.*; khóa trùng tên ở đây sẽ đè
 *   - Chuỗi số nhiều: { one, other }, chọn theo params.n
 * ===================================================================== */
window.GAME_DICT = {
  en: {
    'meta.title': '{{nameEn}}',
    'meta.description': '{{nameEn}}: tap the button 10 times as fast as you can.',
    'app.name': '{{nameEn}}',
    'hud.time': 'Time',
    'hud.taps': 'Taps',
    'hud.best': 'Best',
    'board.tap': 'Tap!',
    'board.label': 'Tap button. Tap it {n} times.',
    'help.keys': '<kbd>Space</kbd> tap · <kbd>N</kbd> new game',
    'help.touch': 'Tap the button 10 times',
    'help.text': 'Tap the big button 10 times. The clock starts on your first tap. Beat your best time!',
    'win.title': 'Done!',
    'win.time': 'Your time',
    'win.best': 'New best time!',
    'confirm.title': 'Start a new game?',
    'confirm.text': 'This game will count as a loss.',
    'stats.played': 'Played',
    'stats.won': 'Finished',
    'summary.note': 'Best {time}',
    'summary.none': 'Tap 10 times as fast as you can',
    'toast.saved': 'Game restored',
  },
  vi: {
    'meta.title': '{{nameVi}}',
    'meta.description': '{{nameVi}}: chạm nút 10 lần nhanh nhất có thể.',
    'app.name': '{{nameVi}}',
    'hud.time': 'Thời gian',
    'hud.taps': 'Lần chạm',
    'hud.best': 'Kỷ lục',
    'board.tap': 'Chạm!',
    'board.label': 'Nút chạm. Chạm {n} lần.',
    'help.keys': '<kbd>Space</kbd> chạm · <kbd>N</kbd> ván mới',
    'help.touch': 'Chạm nút 10 lần',
    'help.text': 'Chạm nút lớn 10 lần. Đồng hồ chạy từ lần chạm đầu tiên. Phá kỷ lục của bạn!',
    'win.title': 'Xong!',
    'win.time': 'Thời gian của bạn',
    'win.best': 'Kỷ lục mới!',
    'confirm.title': 'Chơi ván mới?',
    'confirm.text': 'Ván này sẽ tính là thua.',
    'stats.played': 'Đã chơi',
    'stats.won': 'Hoàn thành',
    'summary.note': 'Kỷ lục {time}',
    'summary.none': 'Chạm 10 lần nhanh nhất có thể',
    'toast.saved': 'Đã khôi phục ván',
  },
};
