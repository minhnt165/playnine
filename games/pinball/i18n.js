/* =====================================================================
 * Pinball - Chuỗi giao diện tiếng Anh (mặc định) + tiếng Việt
 *   - Kit đọc ngôn ngữ ở khóa dùng chung với cổng: localStorage['playnine-lang']
 *   - Chuỗi chung (Cài đặt, Đóng, Giao diện…) có sẵn trong kit với khóa kit.*; khóa trùng tên ở đây sẽ đè
 *   - Chuỗi số nhiều: { one, other }, chọn theo params.n
 * ===================================================================== */
window.GAME_DICT = {
  en: {
    'meta.title': 'Pinball',
    'meta.description': 'Pinball: launch the ball, work the flippers and light up the Nebula table — bumpers, drop targets, an orbit ramp and multiball.',
    'app.name': 'Pinball',
    'hud.label': 'Score',
    'hud.score': 'Score',
    'hud.best': 'Best {score}',
    'hud.ball': 'Ball',
    'hud.mult': 'Bonus',
    'hud.ballLabel': 'Ball {n} of {total}',
    'board.label': 'Pinball table',
    'btn.pauseKey': 'Pause (P)',
    'btn.resumeKey': 'Resume (P)',
    'btn.newKey': 'New game (N)',
    'btn.new': 'New game',
    'btn.resume': 'Resume',
    'start.sub': 'Hold to pull the plunger, release to launch. Keep the ball alive with the flippers.',
    'start.go': 'Start',
    'start.best': 'Best: {score}',
    'start.hint': '<kbd>Space</kbd> / <kbd>Enter</kbd> to start',
    'pause.title': 'Paused',
    'pause.sub': 'Ball {ball}/3 · {score} points',
    'pause.hint': '<kbd>P</kbd> / <kbd>Enter</kbd> to resume',
    'over.title': 'Game over',
    'over.record': 'New record!',
    'over.score': 'Score',
    'over.ramps': 'Orbits',
    'over.banks': 'Meteor banks',
    'confirm.title': 'Start a new game?',
    'confirm.text': 'This game ends now and {score} points are recorded.',
    'help.ok': 'Got it',
    'help.text':
      '<p><b>Launch:</b> hold <kbd>Space</kbd> / <kbd>↓</kbd> (or pull down in the bottom-right corner) to compress the plunger — longer hold, stronger launch — then release.</p>' +
      '<p><b>Flippers:</b> <kbd>←</kbd> <kbd>Z</kbd> <kbd>Left Shift</kbd> and <kbd>→</kbd> <kbd>M</kbd> <kbd>Right Shift</kbd>. On a touch screen, hold the left or right half. Hold a flipper up to catch the ball, then let it roll and aim.</p>' +
      '<ul class="help-list">' +
      '<li><b>Planets</b> (bumpers): 100 · <b>slingshots</b>: 50</li>' +
      '<li><b>U F O lanes</b>: light all three for the next bonus multiplier (up to ×5). Flippers move the lit lanes.</li>' +
      '<li><b>Meteors</b> (drop targets): drop all four for 10,000 and 20 s of <b>Super planets</b> (500 each).</li>' +
      '<li><b>Orbit ramp</b>: 5,000. The third orbit starts a 2-ball <b>multiball</b>; each orbit during it is a 25,000 <b>jackpot</b>.</li>' +
      '<li><b>Skill shot</b>: land in the blinking lane right after the launch for 15,000.</li>' +
      '<li><b>Ball save</b>: for 8 s after the launch a drained ball comes back. 3 balls per game.</li>' +
      '</ul>',
    'help.keys': '<kbd>←</kbd>/<kbd>Z</kbd> <kbd>→</kbd>/<kbd>M</kbd> flippers · hold <kbd>Space</kbd> launch · <kbd>P</kbd> pause',
    'help.touch': 'Hold left / right half for the flippers · pull down bottom-right to launch',
    'tc.pull': 'Pull',
    'banner.super': 'Super planets!',
    'banner.superSub': 'Planets 500 for 20 s',
    'banner.mult': 'Bonus ×{n}',
    'banner.multMax': 'Max bonus!',
    'banner.ramp': 'Orbit {n}/3',
    'banner.multiball': 'Multiball!',
    'banner.multiballSub': 'Orbits score a jackpot',
    'banner.jackpot': 'Jackpot!',
    'banner.skill': 'Skill shot!',
    'banner.save': 'Ball saved',
    'banner.ball': 'Ball {n}',
    'banner.launch': 'Pull and release the plunger',
    'announce.ball': 'Ball {n} of 3. Score {score}.',
    'announce.over': 'Game over. Score {score}.',
    'announce.event': '{what}, {pts} points',
    'stats.played': 'Played',
    'stats.best': 'Best score',
    'stats.avg': 'Average score',
    'stats.ramps': 'Orbits',
    'stats.banks': 'Meteor banks',
    'stats.jackpots': 'Jackpots',
    'set.vibrate': 'Vibration',
    'set.vibrateDesc': 'Short buzz on hits and lost balls (phones that support it)',
    'summary.note': 'Best {score}',
    'summary.none': 'Launch, flip and light the Nebula table',
    'summary.detail': 'Ball {ball}/3 · {score}',
    'toast.saved': 'Game restored, paused',
  },
  vi: {
    'meta.title': 'Pinball',
    'meta.description': 'Pinball: phóng bi, điều khiển flipper và thắp sáng bàn Tinh Vân — bumper, target, ramp quỹ đạo và multiball.',
    'app.name': 'Pinball',
    'hud.label': 'Điểm',
    'hud.score': 'Điểm',
    'hud.best': 'Kỷ lục {score}',
    'hud.ball': 'Bi',
    'hud.mult': 'Hệ số',
    'hud.ballLabel': 'Bi {n} trên {total}',
    'board.label': 'Bàn pinball',
    'btn.pauseKey': 'Tạm dừng (P)',
    'btn.resumeKey': 'Chơi tiếp (P)',
    'btn.newKey': 'Ván mới (N)',
    'btn.new': 'Ván mới',
    'btn.resume': 'Chơi tiếp',
    'start.sub': 'Giữ để kéo lò xo, thả để phóng bi. Dùng flipper giữ bi trên bàn càng lâu càng tốt.',
    'start.go': 'Bắt đầu',
    'start.best': 'Kỷ lục: {score}',
    'start.hint': '<kbd>Space</kbd> / <kbd>Enter</kbd> để bắt đầu',
    'pause.title': 'Tạm dừng',
    'pause.sub': 'Bi {ball}/3 · {score} điểm',
    'pause.hint': '<kbd>P</kbd> / <kbd>Enter</kbd> để chơi tiếp',
    'over.title': 'Hết ván',
    'over.record': 'Kỷ lục mới!',
    'over.score': 'Điểm',
    'over.ramps': 'Quỹ đạo',
    'over.banks': 'Dãy thiên thạch',
    'confirm.title': 'Chơi ván mới?',
    'confirm.text': 'Ván này kết thúc ngay và ghi nhận {score} điểm.',
    'help.ok': 'Đã hiểu',
    'help.text':
      '<p><b>Phóng bi:</b> giữ <kbd>Space</kbd> / <kbd>↓</kbd> (hoặc kéo xuống ở góc dưới phải) để nén lò xo — giữ càng lâu bắn càng mạnh — rồi thả ra.</p>' +
      '<p><b>Flipper:</b> <kbd>←</kbd> <kbd>Z</kbd> <kbd>Shift trái</kbd> và <kbd>→</kbd> <kbd>M</kbd> <kbd>Shift phải</kbd>. Trên màn cảm ứng, giữ nửa trái hoặc nửa phải. Giữ flipper dựng lên để đỡ bi nằm yên, rồi thả cho bi lăn và ngắm.</p>' +
      '<ul class="help-list">' +
      '<li><b>Hành tinh</b> (bumper): 100 · <b>slingshot</b>: 50</li>' +
      '<li><b>Làn U F O</b>: thắp cả ba làn để tăng hệ số điểm (tối đa ×5). Bấm flipper để dời các làn đang sáng.</li>' +
      '<li><b>Thiên thạch</b> (target): hạ đủ bốn được 10.000 và 20 giây <b>Siêu hành tinh</b> (500 mỗi lần).</li>' +
      '<li><b>Ramp quỹ đạo</b>: 5.000. Lần thứ ba mở <b>multiball</b> 2 bi; trong multiball mỗi vòng quỹ đạo là <b>jackpot</b> 25.000.</li>' +
      '<li><b>Skill shot</b>: bi rơi vào làn đang nhấp nháy ngay sau khi phóng được 15.000.</li>' +
      '<li><b>Ball save</b>: trong 8 giây sau khi phóng, bi rơi sẽ được trả lại. Mỗi ván 3 bi.</li>' +
      '</ul>',
    'help.keys': '<kbd>←</kbd>/<kbd>Z</kbd> <kbd>→</kbd>/<kbd>M</kbd> flipper · giữ <kbd>Space</kbd> phóng bi · <kbd>P</kbd> tạm dừng',
    'help.touch': 'Giữ nửa trái / phải để bật flipper · kéo xuống ở góc dưới phải để phóng bi',
    'tc.pull': 'Kéo',
    'banner.super': 'Siêu hành tinh!',
    'banner.superSub': 'Hành tinh 500 điểm trong 20 giây',
    'banner.mult': 'Hệ số ×{n}',
    'banner.multMax': 'Hệ số tối đa!',
    'banner.ramp': 'Quỹ đạo {n}/3',
    'banner.multiball': 'Multiball!',
    'banner.multiballSub': 'Mỗi vòng quỹ đạo là jackpot',
    'banner.jackpot': 'Jackpot!',
    'banner.skill': 'Skill shot!',
    'banner.save': 'Đã cứu bi',
    'banner.ball': 'Bi {n}',
    'banner.launch': 'Kéo lò xo rồi thả để phóng bi',
    'announce.ball': 'Bi {n} trên 3. Điểm {score}.',
    'announce.over': 'Hết ván. Điểm {score}.',
    'announce.event': '{what}, {pts} điểm',
    'stats.played': 'Đã chơi',
    'stats.best': 'Kỷ lục',
    'stats.avg': 'Điểm trung bình',
    'stats.ramps': 'Vòng quỹ đạo',
    'stats.banks': 'Dãy thiên thạch',
    'stats.jackpots': 'Jackpot',
    'set.vibrate': 'Rung',
    'set.vibrateDesc': 'Rung nhẹ khi va chạm và khi mất bi (máy có hỗ trợ)',
    'summary.note': 'Kỷ lục {score}',
    'summary.none': 'Phóng bi, bật flipper, thắp sáng bàn Tinh Vân',
    'summary.detail': 'Bi {ball}/3 · {score}',
    'toast.saved': 'Đã khôi phục ván, đang tạm dừng',
  },
};
