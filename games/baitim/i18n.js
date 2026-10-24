/* =====================================================================
 * Bài Tim - Chuỗi giao diện tiếng Anh (mặc định) + tiếng Việt
 *   - Kit đọc ngôn ngữ ở khóa dùng chung với cổng: localStorage['playnine-lang']
 *   - Chuỗi chung (Cài đặt, Đóng, Giao diện…) có sẵn trong kit với khóa kit.*; khóa trùng tên ở đây sẽ đè
 *   - Chuỗi số nhiều: { one, other }, chọn theo params.n
 * ===================================================================== */
window.GAME_DICT = {
  en: {
    'meta.title': 'Hearts',
    'meta.description': 'Hearts: pass three cards, follow suit and dodge every heart and the queen of spades against three computer players. Lowest score wins.',
    'app.name': 'Hearts',

    'seat.0': 'You',
    'seat.1': 'Ava',
    'seat.2': 'Ben',
    'seat.3': 'Cleo',
    'suit.S': 'spades',
    'suit.H': 'hearts',
    'suit.D': 'diamonds',
    'suit.C': 'clubs',
    'level.easy': 'Easy',
    'level.medium': 'Medium',
    'level.hard': 'Hard',
    'dir.1': 'left',
    'dir.3': 'right',
    'dir.2': 'across',
    'dir.0': 'no pass',

    'table.label': 'Card table',
    'hand.label': 'Your hand',
    'trick.label': 'Current trick: {cards}',
    'trick.empty': 'Current trick: empty',
    'seat.cards': { one: '{n} card', other: '{n} cards' },
    'seat.aria': '{name}: {cards}, {score} points, {round} this round',
    'card.playable': 'playable',
    'card.picked': 'chosen to pass',
    'card.received': 'received',
    'me.score': '{n} pts',
    'info.round': 'Round {n}{dir}',
    'info.pass': 'pass {dir}',

    'act.pass': 'Pass {n}/3',

    'status.pick': 'Choose 3 cards to pass {dir} to {name}',
    'status.pickReady': 'Ready: pass these 3 cards to {name}',
    'status.lead2C': 'You hold 2♣: lead it to start',
    'status.lead': 'Your lead',
    'status.leadNoHearts': 'Your lead (hearts are not broken yet)',
    'status.follow': 'Follow {suit}',
    'status.discard': 'No {suit}: play any card',
    'status.discardFirst': 'No {suit}: play any card except hearts and Q♠',
    'status.cpu': '{name} is thinking…',
    'status.roundOver': 'Round over',
    'status.matchOver': 'Match over',
    'status.bad': 'You must follow {suit}',
    'status.badHearts': 'Hearts are not broken yet: lead another suit',
    'status.badFirst': 'No hearts or Q♠ on the first trick',
    'status.bad2C': 'Lead 2♣ first',
    'status.max3': 'Three cards chosen. Tap one to put it back',

    'log.passed': 'You passed {cards} to {name}',
    'log.noPass': 'Round {n}: no passing this time',
    'log.youPlay': 'You played {card}',
    'log.play': '{name} played {card}',
    'log.trick': '{name} took the trick',
    'log.trickPts': { one: '{name} took the trick (+{n} point)', other: '{name} took the trick (+{n} points)' },
    'log.youTrick': 'You took the trick',
    'log.youTrickPts': { one: 'You took the trick (+{n} point)', other: 'You took the trick (+{n} points)' },
    'toast.broken': 'Hearts are broken!',
    'toast.queen': '{name} took the Q♠',
    'toast.received': 'From {name}: {cards}',

    'round.title': 'Round {n} over',
    'round.moon': '{name} shot the moon!',
    'round.moonYou': 'You shot the moon!',
    'round.moonText': 'All 26 points in one hand: everyone else gets +26.',
    'round.text': 'Next round: {dir}.',
    'round.tie': 'Someone passed 100, but the lowest score is tied: one more round.',
    'round.next': 'Next round',
    'match.won': 'You win the match!',
    'match.lost': '{name} wins the match',
    'match.text': '{name} reached {max} points. Lowest score wins.',
    'scores.title': 'Score sheet',
    'scores.round': 'Rd',
    'scores.total': 'Total',
    'scores.now': 'Now',
    'scores.text': 'Round {n} · {dir} · {level} computers. The match ends when someone reaches 100; lowest score wins.',
    'scores.moon': 'shot the moon',

    'help.keys': '<kbd>←</kbd> <kbd>→</kbd> / <kbd>1</kbd>–<kbd>9</kbd> select · <kbd>Enter</kbd> play / choose · <kbd>P</kbd> pass · <kbd>S</kbd> scores · <kbd>N</kbd> new',
    'help.touch': 'Tap a raised card to play it',
    'help.text':
      '<p>You play against three computers, clockwise. Every card in the deck is dealt: 13 each. Score as <b>few</b> points as you can.</p>' +
      '<ul>' +
      '<li><b>Passing:</b> before each round choose 3 cards to pass: left, then right, then across, then no pass, and again.</li>' +
      '<li>Whoever holds <b>2♣</b> leads it. You must <b>follow the suit</b> led if you can; otherwise play any card.</li>' +
      '<li>The highest card of the suit led wins the trick (ace is high) and leads next.</li>' +
      '<li>Each <b>heart</b> you take is 1 point, the <b>Q♠</b> is 13. No hearts or Q♠ on the first trick.</li>' +
      '<li>You cannot lead hearts until a heart has been played (<b>hearts are broken</b>), unless you only have hearts.</li>' +
      '<li><b>Shoot the moon:</b> take all 13 hearts and the Q♠ and you score 0 while everyone else gets 26.</li>' +
      '<li>When someone reaches <b>100</b>, the match ends and the <b>lowest</b> score wins. If the lowest score is tied, play another round.</li>' +
      '</ul>' +
      '<p><b>Easy</b> computers play any legal card. <b>Medium</b> ones duck under the winning card and dump the Q♠ and high hearts. <b>Hard</b> ones count cards, remember who is out of a suit, flush out the Q♠, try to shoot the moon and stop you from shooting it.</p>',

    'settings.level': 'Computer level',
    'settings.levelDesc': 'A new level applies at once if you have not moved yet, otherwise from the next match.',
    'settings.speed': 'Computer speed',
    'settings.slow': 'Slow',
    'settings.normal': 'Normal',
    'settings.fast': 'Fast',

    'confirm.title': 'Start a new match?',
    'confirm.text': 'This match will count as a loss.',
    'stats.played': 'Matches',
    'stats.won': 'Matches won',
    'stats.rate': 'Win rate',
    'stats.best': 'Best winning score',
    'stats.moons': 'Moons shot',
    'stats.rounds': 'Rounds played',
    'summary.note': 'Won {won} of {played} matches',
    'summary.none': 'Dodge the hearts and the Q♠, lowest score wins',
    'summary.wins': 'Wins',
    'summary.rate': 'Win rate',
    'summary.resume': 'Round {n} · {score} pts',
    'toast.saved': 'Match restored',
    'toast.nextMatch': 'Applies from the next match',
  },
  vi: {
    'meta.title': 'Bài Tim',
    'meta.description': 'Bài Tim (Hearts): chuyền 3 lá, ra theo chất, né mọi lá cơ và Q♠ khi đấu ba người máy. Ít điểm nhất thắng.',
    'app.name': 'Bài Tim',

    'seat.0': 'Bạn',
    'seat.1': 'Mai',
    'seat.2': 'Khoa',
    'seat.3': 'Linh',
    'suit.S': 'bích',
    'suit.H': 'cơ',
    'suit.D': 'rô',
    'suit.C': 'nhép',
    'level.easy': 'Dễ',
    'level.medium': 'Vừa',
    'level.hard': 'Khó',
    'dir.1': 'sang trái',
    'dir.3': 'sang phải',
    'dir.2': 'sang đối diện',
    'dir.0': 'không chuyền',

    'table.label': 'Bàn chơi',
    'hand.label': 'Bài của bạn',
    'trick.label': 'Nước đang đánh: {cards}',
    'trick.empty': 'Nước đang đánh: chưa có lá',
    'seat.cards': { one: '{n} lá', other: '{n} lá' },
    'seat.aria': '{name}: {cards}, {score} điểm, ván này {round}',
    'card.playable': 'ra được',
    'card.picked': 'đã chọn để chuyền',
    'card.received': 'vừa nhận',
    'me.score': '{n} điểm',
    'info.round': 'Ván {n}{dir}',
    'info.pass': 'chuyền {dir}',

    'act.pass': 'Chuyền {n}/3',

    'status.pick': 'Chọn 3 lá chuyền {dir} cho {name}',
    'status.pickReady': 'Đủ 3 lá: bấm Chuyền để đưa cho {name}',
    'status.lead2C': 'Bạn cầm 2♣: ra lá này để mở ván',
    'status.lead': 'Lượt bạn mở nước',
    'status.leadNoHearts': 'Lượt bạn mở nước (cơ chưa vỡ)',
    'status.follow': 'Ra theo chất {suit}',
    'status.discard': 'Hết {suit}: ra lá bất kỳ',
    'status.discardFirst': 'Hết {suit}: ra lá bất kỳ trừ cơ và Q♠',
    'status.cpu': '{name} đang nghĩ…',
    'status.roundOver': 'Hết ván',
    'status.matchOver': 'Hết trận',
    'status.bad': 'Phải ra theo chất {suit}',
    'status.badHearts': 'Cơ chưa vỡ: mở bằng chất khác',
    'status.badFirst': 'Nước đầu không được ra cơ hay Q♠',
    'status.bad2C': 'Phải mở bằng 2♣',
    'status.max3': 'Đã chọn đủ 3 lá. Chạm một lá để bỏ chọn',

    'log.passed': 'Bạn chuyền {cards} cho {name}',
    'log.noPass': 'Ván {n}: ván này không chuyền',
    'log.youPlay': 'Bạn ra {card}',
    'log.play': '{name} ra {card}',
    'log.trick': '{name} ăn nước',
    'log.trickPts': { one: '{name} ăn nước (+{n} điểm)', other: '{name} ăn nước (+{n} điểm)' },
    'log.youTrick': 'Bạn ăn nước',
    'log.youTrickPts': { one: 'Bạn ăn nước (+{n} điểm)', other: 'Bạn ăn nước (+{n} điểm)' },
    'toast.broken': 'Cơ đã vỡ!',
    'toast.queen': '{name} ăn Q♠',
    'toast.received': 'Nhận từ {name}: {cards}',

    'round.title': 'Hết ván {n}',
    'round.moon': '{name} bắn trăng!',
    'round.moonYou': 'Bạn bắn trăng!',
    'round.moonText': 'Ăn trọn 26 điểm: ba người còn lại mỗi người +26.',
    'round.text': 'Ván sau: {dir}.',
    'round.tie': 'Đã có người qua 100 nhưng điểm thấp nhất đang bằng nhau: đánh thêm một ván.',
    'round.next': 'Ván tiếp',
    'match.won': 'Bạn thắng trận!',
    'match.lost': '{name} thắng trận',
    'match.text': '{name} chạm {max} điểm. Điểm thấp nhất thắng.',
    'scores.title': 'Bảng điểm',
    'scores.round': 'Ván',
    'scores.total': 'Tổng',
    'scores.now': 'Đang',
    'scores.text': 'Ván {n} · {dir} · máy {level}. Trận hết khi có người chạm 100; điểm thấp nhất thắng.',
    'scores.moon': 'bắn trăng',

    'help.keys': '<kbd>←</kbd> <kbd>→</kbd> / <kbd>1</kbd>–<kbd>9</kbd> chọn lá · <kbd>Enter</kbd> ra / chọn · <kbd>P</kbd> chuyền · <kbd>S</kbd> bảng điểm · <kbd>N</kbd> ván mới',
    'help.touch': 'Chạm lá đang nhô lên để ra',
    'help.text':
      '<p>Bạn đấu với ba người máy, đi theo chiều kim đồng hồ. Chia hết bộ bài: mỗi người 13 lá. Mục tiêu là ăn <b>ít</b> điểm nhất.</p>' +
      '<ul>' +
      '<li><b>Chuyền bài:</b> đầu mỗi ván chọn 3 lá chuyền đi: sang trái, rồi sang phải, rồi sang đối diện, rồi một ván không chuyền, rồi lặp lại.</li>' +
      '<li>Ai cầm <b>2♣</b> mở nước đầu bằng lá đó. Phải <b>ra theo chất</b> được mở nếu còn; hết chất thì ra lá bất kỳ.</li>' +
      '<li>Lá cao nhất của chất được mở ăn nước (A cao nhất) và mở nước sau.</li>' +
      '<li>Mỗi lá <b>cơ</b> ăn được là 1 điểm, <b>Q♠</b> là 13 điểm. Nước đầu không được ra cơ hay Q♠.</li>' +
      '<li>Chưa ai ra cơ (<b>cơ chưa vỡ</b>) thì không được mở nước bằng cơ, trừ khi trên tay chỉ còn cơ.</li>' +
      '<li><b>Bắn trăng:</b> ăn đủ 13 lá cơ và Q♠ thì bạn 0 điểm, ba người kia mỗi người +26.</li>' +
      '<li>Khi có người chạm <b>100</b> điểm, trận kết thúc và người <b>ít điểm nhất</b> thắng. Nếu điểm thấp nhất bằng nhau thì đánh thêm ván.</li>' +
      '</ul>' +
      '<p>Máy <b>Dễ</b> ra lá hợp lệ bất kỳ. Máy <b>Vừa</b> lọt dưới lá đang thắng, đổ Q♠ và cơ to. Máy <b>Khó</b> đếm lá, nhớ ai hết chất nào, ép Q♠ ra, thử bắn trăng và chặn bạn bắn trăng.</p>',

    'settings.level': 'Mức máy',
    'settings.levelDesc': 'Đổi mức khi bạn chưa đi nước nào thì áp dụng ngay, không thì từ trận sau.',
    'settings.speed': 'Tốc độ máy',
    'settings.slow': 'Chậm',
    'settings.normal': 'Vừa',
    'settings.fast': 'Nhanh',

    'confirm.title': 'Chơi trận mới?',
    'confirm.text': 'Trận đang chơi sẽ tính là thua.',
    'stats.played': 'Số trận',
    'stats.won': 'Trận thắng',
    'stats.rate': 'Tỉ lệ thắng',
    'stats.best': 'Điểm thắng tốt nhất',
    'stats.moons': 'Lần bắn trăng',
    'stats.rounds': 'Số ván đã chơi',
    'summary.note': 'Thắng {won}/{played} trận',
    'summary.none': 'Né cơ và Q♠, ít điểm nhất thắng',
    'summary.wins': 'Thắng',
    'summary.rate': 'Tỉ lệ thắng',
    'summary.resume': 'Ván {n} · {score} điểm',
    'toast.saved': 'Đã khôi phục trận',
    'toast.nextMatch': 'Áp dụng từ trận sau',
  },
};
