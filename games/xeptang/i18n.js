/* =====================================================================
 * Xếp Tầng - Chuỗi giao diện tiếng Anh (mặc định) + tiếng Việt
 *   - Kit đọc ngôn ngữ ở khóa dùng chung với cổng: localStorage['playnine-lang']
 *   - Chuỗi chung (Cài đặt, Đóng, Giao diện…) có sẵn trong kit với khóa kit.*; khóa trùng tên ở đây sẽ đè
 *   - Chuỗi số nhiều: { one, other }, chọn theo params.n
 * ===================================================================== */
window.GAME_DICT = {
  en: {
    'meta.title': 'Tower Stack',
    'meta.description': 'Tower Stack: drop the sliding block on the tower, trim the overhang and stack as high as you can. Perfect drops grow the block back.',
    'app.name': 'Tower Stack',
    'hud.score': 'Score',
    'hud.combo': 'Perfect',
    'hud.best': 'Best',
    'board.label': 'Tower Stack. Press Space or tap to drop the sliding block.',
    'btn.pause': 'Pause (P)',
    'start.text': 'Drop the sliding block right on top of the tower. Whatever hangs over is sliced off.',
    'start.play': 'Play',
    'start.best': 'Best: {n}',
    'pause.title': 'Paused',
    'pause.text': 'Tap or press Space to continue.',
    'pause.resume': 'Continue',
    'over.title': 'Tower down!',
    'over.score': 'Score',
    'over.best': 'Best: {n}',
    'over.newBest': 'New record!',
    'over.detail': { one: '{n} block · {p} perfect · best combo ×{s}', other: '{n} blocks · {p} perfect · best combo ×{s}' },
    'over.again': 'Play again',
    'fx.perfect': 'Perfect',
    'fx.grow': 'Grow!',
    'help.text':
      '<ul class="help-list">' +
      '<li>A block slides back and forth above the tower. <b>Tap</b> or press <kbd>Space</kbd> to drop it.</li>' +
      '<li>The part hanging over the edge is sliced off: the next block is only as wide as what is left.</li>' +
      '<li>Land it almost exactly on top for a <b>Perfect</b>: it snaps into place. From the 2nd perfect in a row you get +1 bonus, from the 3rd the block grows back a little.</li>' +
      '<li>Miss the tower completely and the game is over. The block speeds up slowly as the tower grows.</li>' +
      '<li>Score = blocks stacked + perfect bonuses.</li>' +
      '</ul>',
    'help.keys': '<kbd>Space</kbd> drop · <kbd>P</kbd> pause · <kbd>N</kbd> new game',
    'help.touch': 'Tap anywhere on the tower to drop',
    'confirm.title': 'Start a new game?',
    'confirm.text': 'The current tower ends here and is recorded with its score.',
    'stats.played': 'Played',
    'stats.best': 'Best score',
    'stats.streak': 'Best combo',
    'stats.blocks': 'Blocks stacked',
    'setting.vibrate': 'Vibration',
    'setting.vibrateDesc': 'Short buzz on each drop (phones)',
    'summary.note': 'Best {n}',
    'summary.none': 'Stack the tower as high as you can',
    'summary.resume': 'Score {n}',
    'toast.saved': 'Game restored',
    'sr.place': 'Score {n}',
    'sr.perfect': 'Perfect! Score {n}',
    'sr.over': 'Tower down. Score {n}',
  },
  vi: {
    'meta.title': 'Xếp Tầng',
    'meta.description': 'Xếp Tầng: thả khối đang trượt lên đỉnh tháp, phần chìa ra bị cắt rơi, xếp càng cao càng tốt. Thả khớp liên tiếp để khối to lại.',
    'app.name': 'Xếp Tầng',
    'hud.score': 'Điểm',
    'hud.combo': 'Hoàn hảo',
    'hud.best': 'Kỷ lục',
    'board.label': 'Xếp Tầng. Nhấn Space hoặc chạm để thả khối đang trượt.',
    'btn.pause': 'Tạm dừng (P)',
    'start.text': 'Thả khối đang trượt khớp lên đỉnh tháp. Phần nào chìa ra ngoài sẽ bị cắt rơi.',
    'start.play': 'Chơi',
    'start.best': 'Kỷ lục: {n}',
    'pause.title': 'Tạm dừng',
    'pause.text': 'Chạm hoặc nhấn Space để chơi tiếp.',
    'pause.resume': 'Chơi tiếp',
    'over.title': 'Tháp đổ!',
    'over.score': 'Điểm',
    'over.best': 'Kỷ lục: {n}',
    'over.newBest': 'Kỷ lục mới!',
    'over.detail': '{n} tầng · {p} lần hoàn hảo · chuỗi dài nhất ×{s}',
    'over.again': 'Chơi lại',
    'fx.perfect': 'Hoàn hảo',
    'fx.grow': 'To ra!',
    'help.text':
      '<ul class="help-list">' +
      '<li>Một khối trượt qua lại phía trên tháp. <b>Chạm</b> hoặc nhấn <kbd>Space</kbd> để thả.</li>' +
      '<li>Phần chìa ra ngoài mép bị cắt rơi: khối kế tiếp chỉ rộng bằng phần còn lại.</li>' +
      '<li>Thả gần như khớp hẳn là <b>Hoàn hảo</b>: khối tự hít vào đúng chỗ. Từ lần hoàn hảo thứ 2 liên tiếp được thưởng +1, từ lần thứ 3 khối to lại một chút.</li>' +
      '<li>Thả trượt hẳn khỏi tháp là hết ván. Tháp càng cao khối trượt càng nhanh dần.</li>' +
      '<li>Điểm = số tầng xếp được + điểm thưởng hoàn hảo.</li>' +
      '</ul>',
    'help.keys': '<kbd>Space</kbd> thả · <kbd>P</kbd> tạm dừng · <kbd>N</kbd> ván mới',
    'help.touch': 'Chạm bất kỳ đâu trên tháp để thả',
    'confirm.title': 'Chơi ván mới?',
    'confirm.text': 'Tháp hiện tại kết thúc ở đây và được ghi với số điểm đang có.',
    'stats.played': 'Đã chơi',
    'stats.best': 'Điểm cao nhất',
    'stats.streak': 'Chuỗi dài nhất',
    'stats.blocks': 'Tổng số tầng',
    'setting.vibrate': 'Rung',
    'setting.vibrateDesc': 'Rung nhẹ mỗi lần thả (điện thoại)',
    'summary.note': 'Kỷ lục {n}',
    'summary.none': 'Xếp tháp cao nhất có thể',
    'summary.resume': 'Điểm {n}',
    'toast.saved': 'Đã khôi phục ván',
    'sr.place': 'Điểm {n}',
    'sr.perfect': 'Hoàn hảo! Điểm {n}',
    'sr.over': 'Tháp đổ. Điểm {n}',
  },
};
