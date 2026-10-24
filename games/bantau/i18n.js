/* =====================================================================
 * Bắn Tàu - Chuỗi giao diện tiếng Anh (mặc định) + tiếng Việt
 *   - Kit đọc ngôn ngữ ở khóa dùng chung với cổng: localStorage['playnine-lang']
 *   - Chuỗi chung (Cài đặt, Đóng, Giao diện…) có sẵn trong kit với khóa kit.*; khóa trùng tên ở đây sẽ đè
 *   - Chuỗi số nhiều: { one, other }, chọn theo params.n
 * ===================================================================== */
window.GAME_DICT = {
  en: {
    'meta.title': 'Sea Battle',
    'meta.description': 'Sea Battle: place your fleet, then trade shots with the computer and sink all five enemy ships first.',
    'app.name': 'Sea Battle',

    'sea.enemy': 'Enemy waters',
    'sea.own': 'Your fleet',
    'sea.enemyLabel': 'Enemy waters, 10 by 10. Pick a square to fire.',
    'sea.ownLabel': 'Your waters, 10 by 10',

    'ship.0': 'Carrier',
    'ship.1': 'Battleship',
    'ship.2': 'Cruiser',
    'ship.3': 'Submarine',
    'ship.4': 'Destroyer',

    'info.shots': 'Shots',
    'info.hits': 'Hits',
    'info.acc': 'Accuracy',
    'info.rate': 'Hit %',
    'info.enemy': 'Enemy ships',
    'info.own': 'Your ships',

    'setup.tip': 'Drag ships to move them, tap a ship twice to rotate. Ships may not touch, not even at the corners.',
    'setup.dock': 'Ships not yet placed',
    'setup.rotate': 'Rotate',
    'setup.random': 'Random',
    'setup.clear': 'Clear',
    'setup.start': 'Start battle',

    'level.easy': 'Easy',
    'level.medium': 'Medium',
    'level.hard': 'Hard',
    'chip.level': 'CPU: {level}',

    'status.place': 'Place your fleet',
    'status.left': { one: '1 ship left to place', other: '{n} ships left to place' },
    'status.ready': 'Fleet ready. Start the battle!',
    'status.yourTurn': 'Your turn: fire!',
    'status.wait': 'Shell in the air…',
    'status.aiAim': 'Computer is aiming…',
    'status.won': 'Victory!',
    'status.lost': 'Defeat',

    'event.start': 'You fire first. Pick a square in enemy waters.',
    'event.youMiss': 'You missed at {cell}',
    'event.youHit': 'Hit at {cell}!',
    'event.youSunk': 'You sank the {ship}!',
    'event.aiMiss': 'Computer missed at {cell}',
    'event.aiHit': 'Computer hit you at {cell}',
    'event.aiSunk': 'Computer sank your {ship}',

    'cell.miss': 'miss',
    'cell.hit': 'hit',
    'cell.sunk': 'sunk ship',
    'cell.empty': 'surely empty',
    'cell.unknown': 'unknown',

    'legend.miss': 'Miss',
    'legend.hit': 'Hit',
    'legend.empty': 'Surely empty',

    'help.keys': '<kbd>1</kbd>–<kbd>5</kbd> pick ship · <kbd>←↑→↓</kbd> move · <kbd>R</kbd> rotate · <kbd>S</kbd> start · <kbd>Enter</kbd> fire · <kbd>N</kbd> new game',
    'help.touch': 'Drag ships, tap twice to rotate · Tap enemy waters to fire',
    'help.goal': 'Place your fleet of five ships, then take turns firing at the computer\'s hidden fleet. <b>Sink all five enemy ships first</b> to win.',
    'help.rules': '<li>Each side has a 10×10 sea and five ships: <b>Carrier 5</b>, <b>Battleship 4</b>, <b>Cruiser 3</b>, <b>Submarine 3</b>, <b>Destroyer 2</b>.</li>' +
      '<li>Ships lie straight (across or down) and <b>never touch</b>, not even diagonally.</li>' +
      '<li>You fire first, then turns alternate <b>one shot each</b>, even after a hit.</li>' +
      '<li>Every shot is reported: miss, hit, or sunk (the ship is then shown).</li>' +
      '<li>Because ships never touch, the corners next to a hit and every square around a sunk ship are <b>surely empty</b> and get a small dot for both sides.</li>' +
      '<li>Levels: Easy fires at random, Medium hunts and then finishes off ships it has hit, Hard fires where enemy ships are most likely to be.</li>',

    'result.win': 'Victory!',
    'result.lose': 'Your fleet was sunk',
    'result.winText': 'You sank the whole enemy fleet in {n} shots ({acc}% accuracy).',
    'result.loseText': { one: 'The computer got there first. 1 enemy ship was still afloat.', other: 'The computer got there first. {n} enemy ships were still afloat.' },
    'result.view': 'View board',

    'confirm.title': 'Start a new game?',
    'confirm.text': 'This battle will count as a loss.',

    'settings.level': 'Computer level',
    'settings.note': 'Changing the level applies right away if you have not fired yet; otherwise from the next game.',

    'stats.played': 'Played',
    'stats.won': 'Won',
    'stats.streak': 'Win streak',
    'stats.fewest': 'Fewest shots to win',
    'stats.fewestShort': 'Fewest shots',
    'stats.level': 'Level',
    'stats.games': 'Games',
    'stats.wins': 'Won',
    'stats.lost': 'Lost',

    'summary.note': { one: '1 battle won', other: '{n} battles won' },
    'summary.none': 'Sink the enemy fleet before it sinks yours',
    'summary.resume': '{level} · {n} shots',

    'toast.saved': 'Battle restored',
    'toast.wait': 'Wait for the computer',
    'toast.known': 'You already fired there',
    'toast.empty': 'That square is surely empty',
    'toast.notReady': 'Place all five ships first',
    'toast.noRoom': 'No room for this ship',
    'toast.noRotate': 'Not enough room to rotate',
    'toast.cantPlace': 'Ships cannot touch there',
    'toast.next': 'The new level applies from the next game',
  },
  vi: {
    'meta.title': 'Bắn Tàu',
    'meta.description': 'Bắn Tàu: xếp hạm đội, rồi lần lượt đấu pháo với máy và đánh chìm cả năm tàu địch trước.',
    'app.name': 'Bắn Tàu',

    'sea.enemy': 'Vùng biển địch',
    'sea.own': 'Hạm đội của bạn',
    'sea.enemyLabel': 'Vùng biển địch, 10 x 10. Chọn một ô để bắn.',
    'sea.ownLabel': 'Vùng biển của bạn, 10 x 10',

    'ship.0': 'Tàu sân bay',
    'ship.1': 'Thiết giáp hạm',
    'ship.2': 'Tuần dương hạm',
    'ship.3': 'Tàu ngầm',
    'ship.4': 'Khu trục hạm',

    'info.shots': 'Phát',
    'info.hits': 'Trúng',
    'info.acc': 'Chính xác',
    'info.rate': 'Tỉ lệ',
    'info.enemy': 'Tàu địch',
    'info.own': 'Tàu của bạn',

    'setup.tip': 'Kéo tàu để dời chỗ, chạm hai lần để xoay. Các tàu không được chạm nhau, kể cả ở góc.',
    'setup.dock': 'Tàu chưa đặt',
    'setup.rotate': 'Xoay',
    'setup.random': 'Ngẫu nhiên',
    'setup.clear': 'Dọn',
    'setup.start': 'Vào trận',

    'level.easy': 'Dễ',
    'level.medium': 'Vừa',
    'level.hard': 'Khó',
    'chip.level': 'Máy: {level}',

    'status.place': 'Xếp hạm đội của bạn',
    'status.left': 'Còn {n} tàu chưa đặt',
    'status.ready': 'Hạm đội đã sẵn sàng. Vào trận thôi!',
    'status.yourTurn': 'Lượt bạn: khai hỏa!',
    'status.wait': 'Đạn đang bay…',
    'status.aiAim': 'Máy đang ngắm…',
    'status.won': 'Chiến thắng!',
    'status.lost': 'Thất bại',

    'event.start': 'Bạn bắn trước. Chọn một ô ở vùng biển địch.',
    'event.youMiss': 'Bạn bắn trượt ở {cell}',
    'event.youHit': 'Trúng ở {cell}!',
    'event.youSunk': 'Bạn đã bắn chìm {ship}!',
    'event.aiMiss': 'Máy bắn trượt ở {cell}',
    'event.aiHit': 'Máy bắn trúng bạn ở {cell}',
    'event.aiSunk': 'Máy đã bắn chìm {ship} của bạn',

    'cell.miss': 'trượt',
    'cell.hit': 'trúng',
    'cell.sunk': 'tàu đã chìm',
    'cell.empty': 'chắc chắn trống',
    'cell.unknown': 'chưa biết',

    'legend.miss': 'Trượt',
    'legend.hit': 'Trúng',
    'legend.empty': 'Chắc chắn trống',

    'help.keys': '<kbd>1</kbd>–<kbd>5</kbd> chọn tàu · <kbd>←↑→↓</kbd> dời · <kbd>R</kbd> xoay · <kbd>S</kbd> vào trận · <kbd>Enter</kbd> bắn · <kbd>N</kbd> ván mới',
    'help.touch': 'Kéo tàu, chạm hai lần để xoay · Chạm biển địch để bắn',
    'help.goal': 'Xếp hạm đội năm tàu, rồi lần lượt bắn vào hạm đội đang ẩn của máy. <b>Đánh chìm cả năm tàu địch trước</b> là thắng.',
    'help.rules': '<li>Mỗi bên có vùng biển 10×10 và năm tàu: <b>Tàu sân bay 5</b>, <b>Thiết giáp hạm 4</b>, <b>Tuần dương hạm 3</b>, <b>Tàu ngầm 3</b>, <b>Khu trục hạm 2</b>.</li>' +
      '<li>Tàu nằm thẳng (ngang hoặc dọc) và <b>không chạm nhau</b>, kể cả chéo góc.</li>' +
      '<li>Bạn bắn trước, sau đó hai bên luân phiên <b>mỗi lượt một phát</b>, bắn trúng cũng không được bắn tiếp.</li>' +
      '<li>Mỗi phát đều được báo: trượt, trúng hay chìm (tàu chìm sẽ hiện ra).</li>' +
      '<li>Vì tàu không chạm nhau, các ô chéo cạnh ô trúng và mọi ô quanh tàu đã chìm là <b>chắc chắn trống</b>, được đánh chấm nhỏ cho cả hai bên.</li>' +
      '<li>Mức máy: Dễ bắn ngẫu nhiên, Vừa săn rồi bắn dứt điểm tàu đã trúng, Khó bắn vào nơi tàu địch có khả năng nằm cao nhất.</li>',

    'result.win': 'Chiến thắng!',
    'result.lose': 'Hạm đội của bạn đã chìm',
    'result.winText': 'Bạn đánh chìm cả hạm đội địch sau {n} phát (chính xác {acc}%).',
    'result.loseText': 'Máy đã nhanh hơn. Địch vẫn còn {n} tàu nổi.',
    'result.view': 'Xem bàn',

    'confirm.title': 'Chơi ván mới?',
    'confirm.text': 'Trận này sẽ tính là thua.',

    'settings.level': 'Mức của máy',
    'settings.note': 'Chưa bắn phát nào thì đổi mức có hiệu lực ngay; đã bắn thì áp dụng từ ván sau.',

    'stats.played': 'Đã chơi',
    'stats.won': 'Thắng',
    'stats.streak': 'Chuỗi thắng',
    'stats.fewest': 'Ít phát nhất để thắng',
    'stats.fewestShort': 'Ít phát nhất',
    'stats.level': 'Mức',
    'stats.games': 'Ván',
    'stats.wins': 'Thắng',
    'stats.lost': 'Thua',

    'summary.note': 'Đã thắng {n} trận',
    'summary.none': 'Đánh chìm hạm đội địch trước khi bị đánh chìm',
    'summary.resume': '{level} · {n} phát',

    'toast.saved': 'Đã khôi phục trận',
    'toast.wait': 'Chờ máy bắn xong',
    'toast.known': 'Bạn đã bắn ô này rồi',
    'toast.empty': 'Ô này chắc chắn trống',
    'toast.notReady': 'Hãy đặt đủ năm tàu trước',
    'toast.noRoom': 'Không còn chỗ cho tàu này',
    'toast.noRotate': 'Không đủ chỗ để xoay',
    'toast.cantPlace': 'Đặt ở đây tàu sẽ chạm nhau',
    'toast.next': 'Mức mới áp dụng từ ván sau',
  },
};
