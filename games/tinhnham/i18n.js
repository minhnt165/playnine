/* =====================================================================
 * Tính Nhẩm - Chuỗi giao diện tiếng Anh (mặc định) + tiếng Việt
 *   - Kit đọc ngôn ngữ ở khóa dùng chung với cổng: localStorage['playnine-lang']
 *   - Chuỗi chung (Cài đặt, Đóng, Giao diện…) có sẵn trong kit với khóa kit.*; khóa trùng tên ở đây sẽ đè
 *   - Chuỗi số nhiều: { one, other }, chọn theo params.n
 * ===================================================================== */
window.GAME_DICT = {
  en: {
    'meta.title': 'Quick Math',
    'meta.description': 'Quick Math: solve as many sums as you can in 60 seconds. Plus, minus, times and divide, harder and worth more with every right answer in a row.',
    'app.name': 'Quick Math',
    'hud.score': 'Score',
    'hud.time': 'Time',
    'hud.combo': 'Combo',
    'hud.best': 'Best',
    'hud.level': 'Level',
    'btn.pause': 'Pause',
    'btn.resume': 'Resume',
    'btn.keySuffix': '{label} (P)',
    'card.label': 'Question',
    'keypad.label': 'Number pad',
    'keypad.back': 'Delete',
    'keypad.enter': 'Check',
    'start.sub': 'Solve as many sums as you can in 60 seconds.',
    'start.btn': 'Start',
    'start.hint': 'or press <kbd>Space</kbd>',
    'legend.auto': 'Type the answer: it checks itself',
    'legend.streak': 'Right in a row: harder and worth more',
    'legend.wrong': 'Wrong: the streak starts over',
    'pause.title': 'Paused',
    'pause.sub': '{score} pts · {time} left',
    'pause.hint': 'Press <kbd>P</kbd> or <kbd>Space</kbd> to resume',
    'over.title': 'Time’s up!',
    'over.best': 'New best!',
    'over.correct': 'Correct',
    'over.acc': 'Accuracy',
    'over.streak': 'Best streak',
    'over.level': 'Top level',
    'fx.go': 'Go!',
    'fx.level': 'Level {n}!',
    'fx.hurry': '5 seconds!',
    'help.keys': '<kbd>0</kbd>–<kbd>9</kbd> answer · <kbd>⌫</kbd> delete · <kbd>P</kbd> pause · <kbd>N</kbd> new round',
    'help.touch': 'Tap the digits · the answer checks itself',
    'help.text':
      '<p class="modal-text">Solve as many sums as you can in <b>60 seconds</b>. Type the answer with the number pad or your keyboard.</p>' +
      '<ul class="help-list">' +
      '<li><b>No Enter needed</b>: as soon as you have typed as many digits as the answer has (the boxes show how many), it is checked and the next sum appears. <kbd>Enter</kbd> or ✓ checks early.</li>' +
      '<li><b>Harder as you go</b>: every 3 right answers in a row move you up a level (9 levels): bigger numbers, then times and divide.</li>' +
      '<li><b>Points</b>: level × combo. The combo is ×2 from 5 right in a row and ×3 from 10.</li>' +
      '<li><b>Wrong answer</b>: no points lost and no time lost, but the streak starts over, back to level 1.</li>' +
      '<li>All answers are whole numbers above zero; divisions always come out even.</li>' +
      '</ul>' +
      '<p class="modal-text"><kbd>Backspace</kbd> deletes a digit. <kbd>P</kbd> or <kbd>Esc</kbd> pauses (the sum is hidden while paused).</p>',
    'confirm.title': 'Quit this round?',
    'confirm.text': 'The round ends now with {score} points.',
    'stats.played': 'Rounds',
    'stats.best': 'Best score',
    'stats.streak': 'Best streak',
    'stats.solved': 'Sums solved',
    'settings.vibrate': 'Vibration',
    'settings.vibrateDesc': 'Buzz on a wrong answer (phones)',
    'summary.note': 'Best {score}',
    'summary.none': '60 seconds of mental math',
    'summary.resume': '{score} pts · {time} left',
    'toast.saved': 'Round restored',
    'say.q': '{a} {op} {b}',
    'say.right': 'Right, plus {n}.',
    'say.wrong': 'Wrong. {a} {op} {b} is {ans}.',
    'say.paused': 'Paused',
    'say.over': 'Time’s up. {score} points.',
    'op.+': 'plus',
    'op.-': 'minus',
    'op.×': 'times',
    'op.÷': 'divided by',
  },
  vi: {
    'meta.title': 'Tính Nhẩm',
    'meta.description': 'Tính Nhẩm: giải thật nhiều phép tính trong 60 giây. Cộng, trừ, nhân, chia, càng đúng liên tiếp càng khó và càng nhiều điểm.',
    'app.name': 'Tính Nhẩm',
    'hud.score': 'Điểm',
    'hud.time': 'Thời gian',
    'hud.combo': 'Combo',
    'hud.best': 'Kỷ lục',
    'hud.level': 'Mức',
    'btn.pause': 'Tạm dừng',
    'btn.resume': 'Chơi tiếp',
    'btn.keySuffix': '{label} (P)',
    'card.label': 'Câu hỏi',
    'keypad.label': 'Bàn phím số',
    'keypad.back': 'Xóa',
    'keypad.enter': 'Chấm',
    'start.sub': 'Giải thật nhiều phép tính trong 60 giây.',
    'start.btn': 'Bắt đầu',
    'start.hint': 'hoặc nhấn <kbd>Space</kbd>',
    'legend.auto': 'Gõ đáp án là tự chấm',
    'legend.streak': 'Đúng liên tiếp: khó hơn, nhiều điểm hơn',
    'legend.wrong': 'Sai: chuỗi đúng tính lại từ đầu',
    'pause.title': 'Tạm dừng',
    'pause.sub': '{score} điểm · còn {time}',
    'pause.hint': 'Nhấn <kbd>P</kbd> hoặc <kbd>Space</kbd> để chơi tiếp',
    'over.title': 'Hết giờ!',
    'over.best': 'Kỷ lục mới!',
    'over.correct': 'Câu đúng',
    'over.acc': 'Chính xác',
    'over.streak': 'Chuỗi dài nhất',
    'over.level': 'Mức cao nhất',
    'fx.go': 'Bắt đầu!',
    'fx.level': 'Mức {n}!',
    'fx.hurry': 'Còn 5 giây!',
    'help.keys': '<kbd>0</kbd>–<kbd>9</kbd> gõ số · <kbd>⌫</kbd> xóa · <kbd>P</kbd> tạm dừng · <kbd>N</kbd> ván mới',
    'help.touch': 'Chạm các số · gõ đủ là tự chấm',
    'help.text':
      '<p class="modal-text">Giải thật nhiều phép tính trong <b>60 giây</b>. Gõ đáp án bằng bàn phím số trên màn hình hoặc bàn phím máy tính.</p>' +
      '<ul class="help-list">' +
      '<li><b>Không cần Enter</b>: gõ đủ số chữ số của đáp án (số ô trống cho biết) là tự chấm và sang câu mới. <kbd>Enter</kbd> hoặc ✓ để chấm sớm.</li>' +
      '<li><b>Khó dần</b>: cứ 3 câu đúng liên tiếp lên một mức (9 mức): số lớn dần, rồi có nhân và chia.</li>' +
      '<li><b>Điểm</b>: mức × combo. Combo ×2 từ 5 câu đúng liên tiếp, ×3 từ 10 câu.</li>' +
      '<li><b>Trả lời sai</b>: không mất điểm, không mất giờ, nhưng chuỗi đúng tính lại từ đầu, về mức 1.</li>' +
      '<li>Mọi đáp án là số nguyên dương; phép chia luôn chia hết.</li>' +
      '</ul>' +
      '<p class="modal-text"><kbd>Backspace</kbd> xóa một chữ số. <kbd>P</kbd> hoặc <kbd>Esc</kbd> tạm dừng (phép tính được che khi tạm dừng).</p>',
    'confirm.title': 'Bỏ ván này?',
    'confirm.text': 'Ván kết thúc ngay với {score} điểm.',
    'stats.played': 'Số ván',
    'stats.best': 'Điểm cao nhất',
    'stats.streak': 'Chuỗi dài nhất',
    'stats.solved': 'Phép đã giải',
    'settings.vibrate': 'Rung',
    'settings.vibrateDesc': 'Rung nhẹ khi trả lời sai (điện thoại)',
    'summary.note': 'Kỷ lục {score}',
    'summary.none': '60 giây tính nhẩm',
    'summary.resume': '{score} điểm · còn {time}',
    'toast.saved': 'Đã khôi phục ván',
    'say.q': '{a} {op} {b}',
    'say.right': 'Đúng, cộng {n}.',
    'say.wrong': 'Sai. {a} {op} {b} bằng {ans}.',
    'say.paused': 'Tạm dừng',
    'say.over': 'Hết giờ. {score} điểm.',
    'op.+': 'cộng',
    'op.-': 'trừ',
    'op.×': 'nhân',
    'op.÷': 'chia',
  },
};
