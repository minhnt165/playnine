/* =====================================================================
 * Mê Cung Ma - Chuỗi giao diện tiếng Anh (mặc định) + tiếng Việt
 *   - Kit đọc ngôn ngữ ở khóa dùng chung với cổng: localStorage['playnine-lang']
 *   - Chuỗi chung (Cài đặt, Đóng, Giao diện…) có sẵn trong kit với khóa kit.*; khóa trùng tên ở đây sẽ đè
 *   - Chuỗi số nhiều: { one, other }, chọn theo params.n
 * ===================================================================== */
window.GAME_DICT = {
  en: {
    'meta.title': 'Ghost Maze',
    'meta.description': 'Ghost Maze: guide the firefly through the maze, eat every light and outsmart four ghosts.',
    'app.name': 'Ghost Maze',
    'hud.score': 'Score',
    'hud.best': 'Best',
    'hud.level': 'Maze',
    'hud.lives': 'Lives',
    'hud.livesLabel': { one: '{n} life left', other: '{n} lives left' },
    'board.label': 'Ghost Maze board',
    'board.ready': 'Ready!',
    'board.maze': 'Maze {n}',
    'start.sub': 'Eat every light in the maze and dodge the four ghosts.',
    'start.button': 'Start',
    'start.continue': 'Continue',
    'start.restored': 'Game restored · maze {level} · {score} points',
    'start.hint': 'Space / Enter or tap to start',
    'guide.move': 'Swipe or arrow keys: turn at the next corner',
    'guide.dots': 'Eat every light to clear the maze',
    'guide.power': 'Big orbs scare the ghosts: eat them!',
    'guide.fruit': 'Fruit appears twice per maze',
    'pause.title': 'Paused',
    'pause.button': 'Pause',
    'pause.resume': 'Continue',
    'pause.sub': 'Maze {level} · {score} points',
    'over.title': 'Game over',
    'over.sub': 'You reached maze {n}.',
    'over.record': 'New record!',
    'dir.up': 'Up',
    'dir.down': 'Down',
    'dir.left': 'Left',
    'dir.right': 'Right',
    'help.keys': '<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> / <kbd>WASD</kbd> move · <kbd>P</kbd> pause · <kbd>N</kbd> new game',
    'help.touch': 'Swipe anywhere to turn · tap the pause button to rest',
    'help.text':
      '<p>You are a little firefly in a haunted maze. Eat every light to move on to the next maze, which is faster.</p>' +
      '<ul>' +
      '<li><b>Light</b> 10 points, <b>big orb</b> 50 points. A big orb scares the ghosts for a few seconds: catch them for 200, 400, 800, then 1600 points in a row.</li>' +
      '<li><b>Fruit</b> appears below the ghost house twice per maze, worth more in later mazes.</li>' +
      '<li>The side <b>tunnels</b> lead to the other edge; ghosts slow down inside.</li>' +
      '<li>You have <b>3 lives</b>, plus one bonus life at 10,000 points.</li>' +
      '</ul>' +
      '<p><b>The ghosts</b> take turns roaming to their corners and hunting you:</p>' +
      '<ul>' +
      '<li><span class="ghost-dot" style="background:#ff6b3d"></span><b>Blaze</b> chases you directly.</li>' +
      '<li><span class="ghost-dot" style="background:#b57bff"></span><b>Lurk</b> heads for the spot just ahead of you.</li>' +
      '<li><span class="ghost-dot" style="background:#2ec4b6"></span><b>Mist</b> teams up with Blaze to cut you off.</li>' +
      '<li><span class="ghost-dot" style="background:#5b8cff"></span><b>Dizzy</b> chases from afar but wanders off when close.</li>' +
      '</ul>' +
      '<p>Controls: swipe anywhere or use the arrow keys / WASD. Turn early: the firefly remembers your turn and takes it at the next corner. <kbd>P</kbd> / <kbd>Esc</kbd> to pause.</p>',
    'confirm.title': 'Start a new game?',
    'confirm.text': 'This game ends here and your current score is recorded.',
    'stats.played': 'Games',
    'stats.best': 'Best',
    'stats.level': 'Furthest maze',
    'stats.ghosts': 'Ghosts eaten',
    'settings.dpad': 'On-screen D-pad',
    'settings.dpadDesc': 'Arrow buttons below the maze (swiping always works)',
    'settings.vibrate': 'Vibration',
    'settings.vibrateDesc': 'Short buzz when a ghost catches you (on supported phones)',
    'summary.note': 'Best: {n} points',
    'summary.none': 'Eat the lights, dodge the ghosts',
    'summary.resume': 'Maze {level} · {score} points',
    'toast.saved': 'Game restored',
    'toast.life': 'Bonus life!',
    'live.level': 'Maze {n}',
    'live.over': 'Game over. {n} points.',
  },
  vi: {
    'meta.title': 'Mê Cung Ma',
    'meta.description': 'Mê Cung Ma: dẫn đom đóm đi khắp mê cung, ăn hết đốm sáng và qua mặt bốn con ma.',
    'app.name': 'Mê Cung Ma',
    'hud.score': 'Điểm',
    'hud.best': 'Kỷ lục',
    'hud.level': 'Màn',
    'hud.lives': 'Mạng',
    'hud.livesLabel': 'Còn {n} mạng',
    'board.label': 'Bàn chơi Mê Cung Ma',
    'board.ready': 'Sẵn sàng!',
    'board.maze': 'Màn {n}',
    'start.sub': 'Ăn hết đốm sáng trong mê cung và né bốn con ma.',
    'start.button': 'Bắt đầu',
    'start.continue': 'Chơi tiếp',
    'start.restored': 'Đã khôi phục ván · màn {level} · {score} điểm',
    'start.hint': 'Space / Enter hoặc chạm để bắt đầu',
    'guide.move': 'Vuốt hoặc phím mũi tên: rẽ ở góc kế tiếp',
    'guide.dots': 'Ăn hết đốm sáng để qua màn',
    'guide.power': 'Đốm lớn làm ma sợ: ăn luôn ma!',
    'guide.fruit': 'Mỗi màn có hai lần trái cây',
    'pause.title': 'Tạm dừng',
    'pause.button': 'Tạm dừng',
    'pause.resume': 'Chơi tiếp',
    'pause.sub': 'Màn {level} · {score} điểm',
    'over.title': 'Hết ván',
    'over.sub': 'Bạn đã tới màn {n}.',
    'over.record': 'Kỷ lục mới!',
    'dir.up': 'Lên',
    'dir.down': 'Xuống',
    'dir.left': 'Trái',
    'dir.right': 'Phải',
    'help.keys': '<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> / <kbd>WASD</kbd> di chuyển · <kbd>P</kbd> tạm dừng · <kbd>N</kbd> ván mới',
    'help.touch': 'Vuốt ở đâu cũng được để rẽ · chạm nút tạm dừng để nghỉ',
    'help.text':
      '<p>Bạn là chú đom đóm nhỏ lạc vào mê cung có ma. Ăn hết đốm sáng để sang mê cung tiếp theo, nhanh hơn.</p>' +
      '<ul>' +
      '<li><b>Đốm sáng</b> 10 điểm, <b>đốm lớn</b> 50 điểm. Đốm lớn làm ma sợ trong vài giây: bắt được chúng liên tiếp lần lượt 200, 400, 800 rồi 1600 điểm.</li>' +
      '<li><b>Trái cây</b> hiện dưới chuồng ma hai lần mỗi màn, màn càng xa càng nhiều điểm.</li>' +
      '<li><b>Đường hầm</b> hai bên dẫn sang mép bên kia; ma đi vào hầm bị chậm lại.</li>' +
      '<li>Có <b>3 mạng</b>, thêm một mạng thưởng khi đạt 10.000 điểm.</li>' +
      '</ul>' +
      '<p><b>Bốn con ma</b> lúc thì tản về góc riêng, lúc thì săn bạn:</p>' +
      '<ul>' +
      '<li><span class="ghost-dot" style="background:#ff6b3d"></span><b>Lửa</b> đuổi thẳng theo bạn.</li>' +
      '<li><span class="ghost-dot" style="background:#b57bff"></span><b>Rình</b> nhắm chỗ ngay trước mặt bạn để chặn đầu.</li>' +
      '<li><span class="ghost-dot" style="background:#2ec4b6"></span><b>Sương</b> phối hợp với Lửa để bọc đường.</li>' +
      '<li><span class="ghost-dot" style="background:#5b8cff"></span><b>Lơ Ngơ</b> ở xa thì đuổi, lại gần thì đi lang thang chỗ khác.</li>' +
      '</ul>' +
      '<p>Điều khiển: vuốt ở bất kỳ đâu hoặc dùng phím mũi tên / WASD. Bấm sớm cũng được: đom đóm nhớ hướng và rẽ ở góc kế tiếp. <kbd>P</kbd> / <kbd>Esc</kbd> để tạm dừng.</p>',
    'confirm.title': 'Chơi ván mới?',
    'confirm.text': 'Ván này dừng ở đây và điểm hiện tại được ghi nhận.',
    'stats.played': 'Số ván',
    'stats.best': 'Kỷ lục',
    'stats.level': 'Màn xa nhất',
    'stats.ghosts': 'Ma đã ăn',
    'settings.dpad': 'Phím điều hướng trên màn hình',
    'settings.dpadDesc': 'Nút mũi tên bên dưới mê cung (vuốt vẫn luôn dùng được)',
    'settings.vibrate': 'Rung',
    'settings.vibrateDesc': 'Rung nhẹ khi bị ma bắt (trên điện thoại hỗ trợ)',
    'summary.note': 'Kỷ lục: {n} điểm',
    'summary.none': 'Ăn đốm sáng, né ma',
    'summary.resume': 'Màn {level} · {score} điểm',
    'toast.saved': 'Đã khôi phục ván',
    'toast.life': 'Thêm một mạng!',
    'live.level': 'Màn {n}',
    'live.over': 'Hết ván. {n} điểm.',
  },
};
