/* =====================================================================
 * Thiên Thạch - Chuỗi giao diện tiếng Anh (mặc định) + tiếng Việt
 *   - Kit đọc ngôn ngữ ở khóa dùng chung với cổng: localStorage['playnine-lang']
 *   - Chuỗi chung (Cài đặt, Đóng, Giao diện…) có sẵn trong kit với khóa kit.*; khóa trùng tên ở đây sẽ đè
 *   - Chuỗi số nhiều: { one, other }, chọn theo params.n
 * ===================================================================== */
window.GAME_DICT = {
  en: {
    'meta.title': 'Asteroid Field',
    'meta.description': 'Asteroid Field: steer a ship through a drifting rock field, split every rock and dodge the saucers. Keyboard and touch controls.',
    'app.name': 'Asteroid Field',

    'hud.label': 'Score',
    'hud.score': 'Score',
    'hud.best': 'Best',
    'hud.wave': 'Wave',
    'hud.lives': 'Lives',
    'hud.livesLabel': { one: '{n} life left', other: '{n} lives left' },

    'btn.new': 'New game',
    'btn.newKey': 'New game (N)',
    'btn.pauseKey': 'Pause (P)',
    'btn.resumeKey': 'Resume (P)',
    'btn.resume': 'Resume',

    'board.label': 'Asteroid field. Arrows rotate and thrust, Space fires, Down or H jumps to hyperspace, P pauses.',

    'start.sub': 'Split every rock, dodge the saucers and clear the field for the next wave.',
    'start.go': 'Start',
    'start.best': 'Best: {score}',
    'start.hint': '<kbd>Space</kbd> or <kbd>Enter</kbd> to start',

    'pause.title': 'Paused',
    'pause.sub': 'Wave {wave} · {score} pts',
    'pause.hint': '<kbd>P</kbd> or <kbd>Enter</kbd> to resume',

    'over.title': 'Game over',
    'over.record': 'New record!',
    'over.score': 'Score',
    'over.wave': 'Wave',
    'over.rocks': 'Rocks',

    'banner.wave': 'Wave {n}',
    'banner.waveSub': { one: '{n} rock', other: '{n} rocks' },
    'banner.clear': 'Field cleared',
    'banner.life': 'Extra life!',
    'banner.wait': 'Waiting for a clear space…',
    'banner.small': 'Small saucer!',

    'tc.stick': 'Steer',
    'tc.fireZone': 'Hold to fire',

    'help.keys': '<kbd>←</kbd><kbd>→</kbd> rotate · <kbd>↑</kbd> thrust · <kbd>Space</kbd> fire · <kbd>↓</kbd>/<kbd>H</kbd> hyperspace · <kbd>P</kbd> pause',
    'help.touch': 'Rotate, thrust and fire with the on-screen controls. Twin-stick mode in Settings.',
    'help.ok': 'Got it',
    'help.text':
      '<p>Your ship drifts in a field that wraps around: fly off one edge and you come back on the other. ' +
      'Shoot the rocks: a <b>large</b> rock splits into two medium ones, a <b>medium</b> into two small, and a <b>small</b> rock is destroyed.</p>' +
      '<ul class="help-points">' +
      '<li><span class="hp-rock hp-l"></span>Large <b>20</b></li>' +
      '<li><span class="hp-rock hp-m"></span>Medium <b>50</b></li>' +
      '<li><span class="hp-rock hp-s"></span>Small <b>100</b></li>' +
      '<li><span class="hp-ufo"></span>Saucer <b>200</b> / <b>1000</b></li>' +
      '</ul>' +
      '<p>Saucers fly across and shoot: the big one fires at random, the small one (later waves) aims at you. ' +
      'Clear the field for the next wave with more rocks. You have 3 lives and earn one more every 10,000 points; after a crash you return to the centre once it is clear, shielded for a moment.</p>' +
      '<p><b>Keyboard:</b> <kbd>←</kbd><kbd>→</kbd> rotate, <kbd>↑</kbd> thrust (the ship keeps drifting), <kbd>Space</kbd> fire, <kbd>↓</kbd> or <kbd>H</kbd> hyperspace (risky: you may explode on arrival), <kbd>P</kbd> pause.</p>' +
      '<p><b>Touch:</b> buttons in the bottom corners. In Settings you can switch to twin-stick: the left thumb steers (push further to thrust) and holding the right side fires. Auto-fire lets you play with one thumb.</p>',

    'set.controls': 'Touch controls',
    'set.controlsDesc': 'Buttons: rotate, thrust and fire. Twin-stick: left thumb steers and thrusts, right side fires.',
    'set.buttons': 'Buttons',
    'set.stick': 'Twin-stick',
    'set.autofire': 'Auto-fire',
    'set.autofireDesc': 'Keep firing without holding the fire button',
    'set.vibrate': 'Vibration',
    'set.vibrateDesc': 'Short buzz when your ship is hit (phones)',

    'stats.played': 'Played',
    'stats.best': 'Best score',
    'stats.wave': 'Best wave',
    'stats.avg': 'Average score',
    'stats.rocks': 'Rocks destroyed',
    'stats.saucers': 'Saucers downed',

    'confirm.title': 'End this run?',
    'confirm.text': 'Your score of {score} will be recorded and a new game starts.',

    'summary.note': 'Best {score} · wave {wave}',
    'summary.none': 'Split the rocks, dodge the saucers',
    'summary.detail': 'Wave {wave} · {score} pts',

    'toast.saved': 'Game restored. Press Resume to continue.',
    'announce.wave': 'Wave {n}',
    'announce.over': 'Game over. Score {score}.',
    'announce.life': 'Extra life',
  },
  vi: {
    'meta.title': 'Thiên Thạch',
    'meta.description': 'Thiên Thạch: lái phi thuyền giữa bãi thiên thạch trôi, bắn vỡ từng tảng đá và né đĩa bay. Chơi bằng bàn phím hoặc màn hình cảm ứng.',
    'app.name': 'Thiên Thạch',

    'hud.label': 'Điểm',
    'hud.score': 'Điểm',
    'hud.best': 'Kỷ lục',
    'hud.wave': 'Đợt',
    'hud.lives': 'Mạng',
    'hud.livesLabel': 'Còn {n} mạng',

    'btn.new': 'Ván mới',
    'btn.newKey': 'Ván mới (N)',
    'btn.pauseKey': 'Tạm dừng (P)',
    'btn.resumeKey': 'Chơi tiếp (P)',
    'btn.resume': 'Chơi tiếp',

    'board.label': 'Bãi thiên thạch. Mũi tên để xoay và đẩy, Space để bắn, mũi tên xuống hoặc H để dịch chuyển, P để tạm dừng.',

    'start.sub': 'Bắn vỡ mọi tảng đá, né đĩa bay và dọn sạch sân để sang đợt mới.',
    'start.go': 'Bắt đầu',
    'start.best': 'Kỷ lục: {score}',
    'start.hint': '<kbd>Space</kbd> hoặc <kbd>Enter</kbd> để bắt đầu',

    'pause.title': 'Tạm dừng',
    'pause.sub': 'Đợt {wave} · {score} điểm',
    'pause.hint': '<kbd>P</kbd> hoặc <kbd>Enter</kbd> để chơi tiếp',

    'over.title': 'Hết ván',
    'over.record': 'Kỷ lục mới!',
    'over.score': 'Điểm',
    'over.wave': 'Đợt',
    'over.rocks': 'Đá vỡ',

    'banner.wave': 'Đợt {n}',
    'banner.waveSub': '{n} tảng đá',
    'banner.clear': 'Sạch sân',
    'banner.life': 'Thêm một mạng!',
    'banner.wait': 'Chờ tâm sân trống…',
    'banner.small': 'Đĩa bay nhỏ!',

    'tc.stick': 'Lái',
    'tc.fireZone': 'Giữ để bắn',

    'help.keys': '<kbd>←</kbd><kbd>→</kbd> xoay · <kbd>↑</kbd> đẩy · <kbd>Space</kbd> bắn · <kbd>↓</kbd>/<kbd>H</kbd> dịch chuyển · <kbd>P</kbd> tạm dừng',
    'help.touch': 'Xoay, đẩy, bắn bằng nút trên màn hình. Có chế độ cần lái trong Cài đặt.',
    'help.ok': 'Đã hiểu',
    'help.text':
      '<p>Phi thuyền trôi trong một sân không có mép: bay ra mép này sẽ hiện lại ở mép đối diện. ' +
      'Bắn đá: tảng <b>lớn</b> vỡ thành hai tảng vừa, tảng <b>vừa</b> vỡ thành hai tảng nhỏ, tảng <b>nhỏ</b> thì tan hẳn.</p>' +
      '<ul class="help-points">' +
      '<li><span class="hp-rock hp-l"></span>Lớn <b>20</b></li>' +
      '<li><span class="hp-rock hp-m"></span>Vừa <b>50</b></li>' +
      '<li><span class="hp-rock hp-s"></span>Nhỏ <b>100</b></li>' +
      '<li><span class="hp-ufo"></span>Đĩa bay <b>200</b> / <b>1000</b></li>' +
      '</ul>' +
      '<p>Đĩa bay bay ngang sân và bắn: đĩa lớn bắn bừa, đĩa nhỏ (các đợt sau) nhắm vào bạn. ' +
      'Dọn sạch sân để sang đợt mới nhiều đá hơn. Bạn có 3 mạng, cứ 10.000 điểm được thêm một mạng; sau khi nổ, phi thuyền quay lại giữa sân khi chỗ đó trống và được che chắn một lúc.</p>' +
      '<p><b>Bàn phím:</b> <kbd>←</kbd><kbd>→</kbd> xoay, <kbd>↑</kbd> đẩy (thả ra tàu vẫn trôi), <kbd>Space</kbd> bắn, <kbd>↓</kbd> hoặc <kbd>H</kbd> dịch chuyển (liều: có thể nổ khi hiện ra), <kbd>P</kbd> tạm dừng.</p>' +
      '<p><b>Cảm ứng:</b> các nút ở hai góc dưới. Trong Cài đặt có thể đổi sang cần lái: ngón cái trái lái (đẩy xa để tăng tốc), giữ nửa phải để bắn. Bật tự bắn để chơi bằng một ngón.</p>',

    'set.controls': 'Điều khiển cảm ứng',
    'set.controlsDesc': 'Nút: xoay, đẩy và bắn. Cần lái: ngón trái lái và tăng tốc, nửa phải để bắn.',
    'set.buttons': 'Nút',
    'set.stick': 'Cần lái',
    'set.autofire': 'Tự bắn',
    'set.autofireDesc': 'Bắn liên tục mà không cần giữ nút bắn',
    'set.vibrate': 'Rung',
    'set.vibrateDesc': 'Rung nhẹ khi phi thuyền bị trúng (điện thoại)',

    'stats.played': 'Đã chơi',
    'stats.best': 'Điểm cao nhất',
    'stats.wave': 'Đợt xa nhất',
    'stats.avg': 'Điểm trung bình',
    'stats.rocks': 'Đá đã phá',
    'stats.saucers': 'Đĩa bay hạ được',

    'confirm.title': 'Kết thúc ván này?',
    'confirm.text': 'Điểm {score} của ván này sẽ được ghi nhận và ván mới bắt đầu.',

    'summary.note': 'Kỷ lục {score} · đợt {wave}',
    'summary.none': 'Bắn vỡ đá, né đĩa bay',
    'summary.detail': 'Đợt {wave} · {score} điểm',

    'toast.saved': 'Đã khôi phục ván. Bấm Chơi tiếp để tiếp tục.',
    'announce.wave': 'Đợt {n}',
    'announce.over': 'Hết ván. {score} điểm.',
    'announce.life': 'Thêm một mạng',
  },
};
