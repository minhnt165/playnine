/* =====================================================================
 * Hạ Cánh - Chuỗi giao diện tiếng Anh (mặc định) + tiếng Việt
 *   - Kit đọc ngôn ngữ ở khóa dùng chung với cổng: localStorage['playnine-lang']
 *   - Chuỗi chung (Cài đặt, Đóng, Giao diện…) có sẵn trong kit với khóa kit.*; khóa trùng tên ở đây sẽ đè
 *   - Chuỗi số nhiều: { one, other }, chọn theo params.n
 * ===================================================================== */
window.GAME_DICT = {
  en: {
    'meta.title': 'Lunar Lander',
    'meta.description': 'Lunar Lander: fight gravity and wind, save fuel and set the lander down gently on a landing pad. Narrow pads score up to ×5.',
    'app.name': 'Lunar Lander',

    'hud.label': 'Score',
    'hud.score': 'Score',
    'hud.best': 'Best',
    'hud.level': 'Level',
    'hud.ships': 'Ships',
    'hud.shipsLabel': { one: '{n} ship left', other: '{n} ships left' },

    'g.alt': 'Alt',
    'g.vx': 'H-speed',
    'g.vy': 'V-speed',
    'g.angle': 'Angle',
    'g.fuel': 'Fuel',
    'g.wind': 'Wind',

    'btn.new': 'New game',
    'btn.newKey': 'New game (N)',
    'btn.pauseKey': 'Pause (P)',
    'btn.resumeKey': 'Resume (P)',
    'btn.resume': 'Resume',

    'board.label': 'Landing zone. Up arrow or Space fires the main engine, Left and Right rotate the lander, P pauses.',

    'start.sub': 'Set the lander down gently on a flat pad. Narrow pads score more.',
    'start.go': 'Start',
    'start.best': 'Best: {score}',
    'start.hint': '<kbd>Space</kbd> or <kbd>Enter</kbd> to start',

    'pause.title': 'Paused',
    'pause.sub': 'Level {level} · {score} pts',
    'pause.hint': '<kbd>P</kbd> or <kbd>Enter</kbd> to resume',

    'over.title': 'Game over',
    'over.record': 'New record!',
    'over.score': 'Score',
    'over.level': 'Level',
    'over.lands': 'Landings',
    'over.noShips': 'All ships lost',
    'over.noFuel': 'Out of fuel',

    'banner.level': 'Level {n}',
    'banner.levelSub': 'Gravity ×{g}',
    'banner.levelWind': 'Gravity ×{g} · wind {dir}',
    'banner.land': 'Landed! +{points}',
    'banner.landSub': '×{mult} pad {base} · soft {soft} · fuel {fuel}',
    'banner.crash': 'Crashed',
    'banner.fast': 'Coming down too fast',
    'banner.drift': 'Drifting sideways too fast',
    'banner.tilt': 'Not upright',
    'banner.rough': 'Missed the pad',
    'banner.hull': 'Hit the terrain',
    'banner.low': 'Low fuel',
    'banner.empty': 'Out of fuel!',
    'wind.left': '←',
    'wind.right': '→',

    'tc.thrust': 'Thrust',

    'help.keys': '<kbd>↑</kbd>/<kbd>Space</kbd> thrust · <kbd>←</kbd><kbd>→</kbd> rotate · <kbd>P</kbd> pause',
    'help.touch': 'Left thumb rotates, right thumb fires the engine.',
    'help.ok': 'Got it',
    'help.text':
      '<p>Gravity pulls the lander down. The <b>main engine</b> pushes along the nose: point straight up to slow your fall, tilt to move sideways. Every burn uses fuel.</p>' +
      '<p>Touch down on a <b>flat pad</b> with both legs. To land safely you need, at the moment of contact:</p>' +
      '<ul class="help-list">' +
      '<li>falling no faster than <b>20</b></li>' +
      '<li>drifting sideways no faster than <b>12</b></li>' +
      '<li>tilted no more than <b>10°</b></li>' +
      '</ul>' +
      '<p>The gauges turn <span class="ok">green</span> when a value is safe. Anything else, or touching the rocks, and the lander explodes.</p>' +
      '<p><b>Score</b> = 50 × pad multiplier (<b>×2</b>, <b>×3</b> or <b>×5</b>: the narrower the pad, the higher) + up to 50 for a soft landing + up to 50 for the fuel left. ' +
      'Each landing tops up your fuel and takes you to a new level with stronger gravity and wind. ' +
      'You have 3 ships; losing all of them or crashing with an empty tank ends the game.</p>' +
      '<p><b>Keyboard:</b> <kbd>↑</kbd>, <kbd>W</kbd> or <kbd>Space</kbd> thrust, <kbd>←</kbd><kbd>→</kbd> (<kbd>A</kbd><kbd>D</kbd>) rotate, <kbd>P</kbd> or <kbd>Esc</kbd> pause.</p>' +
      '<p><b>Touch:</b> rotate with the two buttons on the left (slide between them), thrust with the big button on the right. ' +
      'Turn on <b>Auto-level</b> in Settings and the lander swings back upright whenever you are not rotating, so one thumb is enough. It does not change your score.</p>',

    'set.buttons': 'On-screen buttons',
    'set.buttonsDesc': 'Auto shows them on touch screens',
    'set.auto': 'Auto',
    'set.on': 'Show',
    'set.off': 'Hide',
    'set.assist': 'Auto-level',
    'set.assistDesc': 'The lander turns back upright when you are not rotating. No effect on score.',
    'set.vibrate': 'Vibration',
    'set.vibrateDesc': 'Short buzz on landing and crashing (phones)',

    'stats.played': 'Played',
    'stats.best': 'Best score',
    'stats.level': 'Best level',
    'stats.avg': 'Average score',
    'stats.lands': 'Safe landings',
    'stats.x5': 'Landings on ×5',

    'confirm.title': 'End this run?',
    'confirm.text': 'Your score of {score} will be recorded and a new game starts.',

    'summary.note': 'Best {score} · level {level}',
    'summary.none': 'Land gently, save fuel',
    'summary.detail': 'Level {level} · {score} pts',

    'toast.saved': 'Game restored. Press Resume to continue.',
    'announce.level': 'Level {n}',
    'announce.land': 'Landed on the times {mult} pad. {points} points.',
    'announce.crash': 'Crashed. {why}.',
    'announce.over': 'Game over. Score {score}.',
  },
  vi: {
    'meta.title': 'Hạ Cánh',
    'meta.description': 'Hạ Cánh: chống lại trọng lực và gió, tiết kiệm nhiên liệu và đặt tàu đổ bộ thật êm xuống bãi đáp. Bãi càng hẹp điểm càng cao, tới ×5.',
    'app.name': 'Hạ Cánh',

    'hud.label': 'Điểm',
    'hud.score': 'Điểm',
    'hud.best': 'Kỷ lục',
    'hud.level': 'Màn',
    'hud.ships': 'Tàu',
    'hud.shipsLabel': 'Còn {n} tàu',

    'g.alt': 'Độ cao',
    'g.vx': 'Ngang',
    'g.vy': 'Dọc',
    'g.angle': 'Góc',
    'g.fuel': 'Nhiên liệu',
    'g.wind': 'Gió',

    'btn.new': 'Ván mới',
    'btn.newKey': 'Ván mới (N)',
    'btn.pauseKey': 'Tạm dừng (P)',
    'btn.resumeKey': 'Chơi tiếp (P)',
    'btn.resume': 'Chơi tiếp',

    'board.label': 'Vùng hạ cánh. Mũi tên lên hoặc Space bật động cơ, mũi tên trái phải xoay tàu, P tạm dừng.',

    'start.sub': 'Đặt tàu thật êm xuống một bãi phẳng. Bãi càng hẹp càng nhiều điểm.',
    'start.go': 'Bắt đầu',
    'start.best': 'Kỷ lục: {score}',
    'start.hint': '<kbd>Space</kbd> hoặc <kbd>Enter</kbd> để bắt đầu',

    'pause.title': 'Tạm dừng',
    'pause.sub': 'Màn {level} · {score} điểm',
    'pause.hint': '<kbd>P</kbd> hoặc <kbd>Enter</kbd> để chơi tiếp',

    'over.title': 'Hết ván',
    'over.record': 'Kỷ lục mới!',
    'over.score': 'Điểm',
    'over.level': 'Màn',
    'over.lands': 'Lần đáp',
    'over.noShips': 'Đã mất hết tàu',
    'over.noFuel': 'Hết nhiên liệu',

    'banner.level': 'Màn {n}',
    'banner.levelSub': 'Trọng lực ×{g}',
    'banner.levelWind': 'Trọng lực ×{g} · gió {dir}',
    'banner.land': 'Đáp an toàn! +{points}',
    'banner.landSub': 'Bãi ×{mult} {base} · êm {soft} · nhiên liệu {fuel}',
    'banner.crash': 'Nổ tàu',
    'banner.fast': 'Rơi quá nhanh',
    'banner.drift': 'Trôi ngang quá nhanh',
    'banner.tilt': 'Tàu chưa thẳng đứng',
    'banner.rough': 'Trượt khỏi bãi đáp',
    'banner.hull': 'Đâm vào núi',
    'banner.low': 'Sắp hết nhiên liệu',
    'banner.empty': 'Hết nhiên liệu!',
    'wind.left': '←',
    'wind.right': '→',

    'tc.thrust': 'Đẩy',

    'help.keys': '<kbd>↑</kbd>/<kbd>Space</kbd> đẩy · <kbd>←</kbd><kbd>→</kbd> xoay · <kbd>P</kbd> tạm dừng',
    'help.touch': 'Ngón trái xoay tàu, ngón phải bật động cơ.',
    'help.ok': 'Đã hiểu',
    'help.text':
      '<p>Trọng lực kéo tàu xuống. <b>Động cơ chính</b> đẩy theo hướng mũi tàu: dựng thẳng để rơi chậm lại, nghiêng để dạt sang ngang. Mỗi lần đẩy đều tốn nhiên liệu.</p>' +
      '<p>Đặt cả hai chân xuống một <b>bãi phẳng</b>. Đáp an toàn khi, lúc chạm đất:</p>' +
      '<ul class="help-list">' +
      '<li>tốc độ rơi không quá <b>20</b></li>' +
      '<li>tốc độ trôi ngang không quá <b>12</b></li>' +
      '<li>tàu nghiêng không quá <b>10°</b></li>' +
      '</ul>' +
      '<p>Đồng hồ chuyển <span class="ok">xanh</span> khi số đó đã an toàn. Sai một điều, hoặc chạm vào núi đá, là tàu nổ.</p>' +
      '<p><b>Điểm</b> = 50 × hệ số bãi (<b>×2</b>, <b>×3</b> hoặc <b>×5</b>: bãi càng hẹp càng cao) + tối đa 50 cho cú đáp êm + tối đa 50 cho nhiên liệu còn lại. ' +
      'Mỗi lần đáp được nạp thêm nhiên liệu và sang màn mới, trọng lực và gió mạnh dần. ' +
      'Bạn có 3 tàu; mất hết tàu, hoặc nổ khi bình đã cạn, là hết ván.</p>' +
      '<p><b>Bàn phím:</b> <kbd>↑</kbd>, <kbd>W</kbd> hoặc <kbd>Space</kbd> đẩy, <kbd>←</kbd><kbd>→</kbd> (<kbd>A</kbd><kbd>D</kbd>) xoay, <kbd>P</kbd> hoặc <kbd>Esc</kbd> tạm dừng.</p>' +
      '<p><b>Cảm ứng:</b> xoay bằng hai nút bên trái (trượt ngón qua lại được), đẩy bằng nút lớn bên phải. ' +
      'Bật <b>Tự cân bằng góc</b> trong Cài đặt thì tàu tự dựng thẳng lại khi bạn không xoay, chơi một ngón cũng được. Tùy chọn này không ảnh hưởng điểm.</p>',

    'set.buttons': 'Nút trên màn hình',
    'set.buttonsDesc': 'Tự động: hiện trên màn hình cảm ứng',
    'set.auto': 'Tự động',
    'set.on': 'Hiện',
    'set.off': 'Ẩn',
    'set.assist': 'Tự cân bằng góc',
    'set.assistDesc': 'Không xoay thì tàu tự quay về thẳng đứng. Không ảnh hưởng điểm.',
    'set.vibrate': 'Rung',
    'set.vibrateDesc': 'Rung nhẹ khi đáp và khi nổ (điện thoại)',

    'stats.played': 'Đã chơi',
    'stats.best': 'Điểm cao nhất',
    'stats.level': 'Màn xa nhất',
    'stats.avg': 'Điểm trung bình',
    'stats.lands': 'Lần đáp an toàn',
    'stats.x5': 'Lần đáp bãi ×5',

    'confirm.title': 'Kết thúc ván này?',
    'confirm.text': 'Điểm {score} của bạn sẽ được ghi nhận và bắt đầu ván mới.',

    'summary.note': 'Kỷ lục {score} · màn {level}',
    'summary.none': 'Đáp thật êm, tiết kiệm nhiên liệu',
    'summary.detail': 'Màn {level} · {score} điểm',

    'toast.saved': 'Đã khôi phục ván. Bấm Chơi tiếp để tiếp tục.',
    'announce.level': 'Màn {n}',
    'announce.land': 'Đáp an toàn xuống bãi nhân {mult}. {points} điểm.',
    'announce.crash': 'Nổ tàu. {why}.',
    'announce.over': 'Hết ván. {score} điểm.',
  },
};
