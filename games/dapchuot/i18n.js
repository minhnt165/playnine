/* =====================================================================
 * Đập Chuột - Chuỗi giao diện tiếng Anh (mặc định) + tiếng Việt
 *   - Kit đọc ngôn ngữ ở khóa dùng chung với cổng: localStorage['playnine-lang']
 *   - Chuỗi chung (Cài đặt, Đóng, Giao diện…) có sẵn trong kit với khóa kit.*; khóa trùng tên ở đây sẽ đè
 *   - Chuỗi số nhiều: { one, other }, chọn theo params.n
 * ===================================================================== */
window.GAME_DICT = {
  en: {
    'meta.title': 'Whack a Mole',
    'meta.description': 'Whack a Mole: bop the moles as they pop out of their holes. Golden moles, helmets and bombs, combos up to ×3, 60 seconds per round.',
    'app.name': 'Whack a Mole',
    'hud.score': 'Score',
    'hud.time': 'Time',
    'hud.combo': 'Combo',
    'hud.best': 'Best',
    'btn.pause': 'Pause',
    'btn.resume': 'Resume',
    'btn.keySuffix': '{label} (P)',
    'board.label': 'Mole field, 3 by 3 holes',
    'hole.label': 'Hole {n}, key {k}',
    'start.sub': 'Whack the moles before they hide. You have 60 seconds!',
    'start.btn': 'Start',
    'start.hint': 'or press <kbd>Space</kbd>',
    'legend.mole': 'Mole +1',
    'legend.gold': 'Golden +5',
    'legend.helmet': 'Helmet: 2 hits',
    'legend.bomb': 'Bomb: don’t!',
    'pause.title': 'Paused',
    'pause.sub': '{score} pts · {time} left',
    'pause.hint': 'Press <kbd>P</kbd> or <kbd>Space</kbd> to resume',
    'over.title': 'Time’s up!',
    'over.best': 'New best!',
    'over.whacked': 'Whacked',
    'over.combo': 'Best combo',
    'over.acc': 'Accuracy',
    'fx.go': 'Go!',
    'fx.combo': 'Combo ×{n}!',
    'fx.stun': 'Stunned!',
    'fx.hurry': '5 seconds!',
    'help.keys': '<kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd> / <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd> or numpad whack · <kbd>P</kbd> pause · <kbd>N</kbd> new round',
    'help.touch': 'Tap the moles fast · never tap a bomb',
    'help.text':
      '<p class="modal-text">Moles pop out of the 9 holes for a moment. Whack them before they hide. A round lasts <b>60 seconds</b> and gets faster as it goes.</p>' +
      '<ul class="help-list">' +
      '<li><b>Mole</b>: +1.</li>' +
      '<li><b>Golden mole</b>: +5, but it hides quickly.</li>' +
      '<li><b>Helmet mole</b>: the first hit knocks the helmet off, the second scores +2.</li>' +
      '<li><b>Bomb</b>: don’t hit it! −5 and you are stunned for a moment.</li>' +
      '<li><b>Combo</b>: hits in a row without a miss score ×2 from the 6th hit and ×3 from the 11th. Hitting an empty hole or a bomb resets it.</li>' +
      '</ul>' +
      '<p class="modal-text">Keys follow the grid: <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd> / <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd>, or the numpad <kbd>7</kbd><kbd>8</kbd><kbd>9</kbd> / <kbd>4</kbd><kbd>5</kbd><kbd>6</kbd> / <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd>. <kbd>P</kbd> or <kbd>Esc</kbd> pauses.</p>',
    'confirm.title': 'Quit this round?',
    'confirm.text': 'The round ends now with {score} points.',
    'stats.played': 'Rounds',
    'stats.best': 'Best score',
    'stats.combo': 'Best combo',
    'stats.whacked': 'Moles whacked',
    'settings.vibrate': 'Vibration',
    'settings.vibrateDesc': 'Buzz on hits and bombs (phones)',
    'summary.note': 'Best {score}',
    'summary.none': '60 seconds, whack every mole',
    'summary.resume': '{score} pts · {time} left',
    'toast.saved': 'Round restored',
    'say.paused': 'Paused',
    'say.over': 'Time’s up. {score} points.',
  },
  vi: {
    'meta.title': 'Đập Chuột',
    'meta.description': 'Đập Chuột: đập chuột khi chúng trồi lên khỏi hang. Có chuột vàng, chuột đội mũ và bom, combo tới ×3, mỗi ván 60 giây.',
    'app.name': 'Đập Chuột',
    'hud.score': 'Điểm',
    'hud.time': 'Thời gian',
    'hud.combo': 'Combo',
    'hud.best': 'Kỷ lục',
    'btn.pause': 'Tạm dừng',
    'btn.resume': 'Chơi tiếp',
    'btn.keySuffix': '{label} (P)',
    'board.label': 'Bãi chuột, 3 × 3 hang',
    'hole.label': 'Hang {n}, phím {k}',
    'start.sub': 'Đập chuột trước khi chúng trốn mất. Bạn có 60 giây!',
    'start.btn': 'Bắt đầu',
    'start.hint': 'hoặc nhấn <kbd>Space</kbd>',
    'legend.mole': 'Chuột +1',
    'legend.gold': 'Chuột vàng +5',
    'legend.helmet': 'Đội mũ: 2 cú',
    'legend.bomb': 'Bom: đừng đập!',
    'pause.title': 'Tạm dừng',
    'pause.sub': '{score} điểm · còn {time}',
    'pause.hint': 'Nhấn <kbd>P</kbd> hoặc <kbd>Space</kbd> để chơi tiếp',
    'over.title': 'Hết giờ!',
    'over.best': 'Kỷ lục mới!',
    'over.whacked': 'Đã đập',
    'over.combo': 'Combo dài nhất',
    'over.acc': 'Chính xác',
    'fx.go': 'Bắt đầu!',
    'fx.combo': 'Combo ×{n}!',
    'fx.stun': 'Choáng!',
    'fx.hurry': 'Còn 5 giây!',
    'help.keys': '<kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd> / <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd> hoặc bàn phím số để đập · <kbd>P</kbd> tạm dừng · <kbd>N</kbd> ván mới',
    'help.touch': 'Chạm thật nhanh vào chuột · đừng chạm bom',
    'help.text':
      '<p class="modal-text">Chuột trồi lên khỏi 9 cái hang trong chốc lát. Đập chúng trước khi chúng trốn. Mỗi ván <b>60 giây</b>, càng về cuối càng nhanh.</p>' +
      '<ul class="help-list">' +
      '<li><b>Chuột</b>: +1.</li>' +
      '<li><b>Chuột vàng</b>: +5, nhưng trốn rất nhanh.</li>' +
      '<li><b>Chuột đội mũ</b>: cú đầu hất văng mũ, cú thứ hai mới được +2.</li>' +
      '<li><b>Bom</b>: đừng đập! −5 điểm và bị choáng một lúc.</li>' +
      '<li><b>Combo</b>: đập trúng liên tiếp không trượt thì được ×2 từ cú thứ 6, ×3 từ cú thứ 11. Đập vào hang trống hoặc đập bom là mất combo.</li>' +
      '</ul>' +
      '<p class="modal-text">Phím theo đúng lưới: <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd> / <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd>, hoặc bàn phím số <kbd>7</kbd><kbd>8</kbd><kbd>9</kbd> / <kbd>4</kbd><kbd>5</kbd><kbd>6</kbd> / <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd>. <kbd>P</kbd> hoặc <kbd>Esc</kbd> để tạm dừng.</p>',
    'confirm.title': 'Bỏ ván này?',
    'confirm.text': 'Ván sẽ kết thúc ngay với {score} điểm.',
    'stats.played': 'Số ván',
    'stats.best': 'Điểm cao nhất',
    'stats.combo': 'Combo dài nhất',
    'stats.whacked': 'Chuột đã đập',
    'settings.vibrate': 'Rung',
    'settings.vibrateDesc': 'Rung khi đập trúng và khi đập bom (điện thoại)',
    'summary.note': 'Kỷ lục {score}',
    'summary.none': '60 giây, đập thật nhiều chuột',
    'summary.resume': '{score} điểm · còn {time}',
    'toast.saved': 'Đã khôi phục ván',
    'say.paused': 'Tạm dừng',
    'say.over': 'Hết giờ. {score} điểm.',
  },
};
