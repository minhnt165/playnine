/* =====================================================================
 * Bài Tám - Chuỗi giao diện tiếng Anh (mặc định) + tiếng Việt
 *   - Kit đọc ngôn ngữ ở khóa dùng chung với cổng: localStorage['playnine-lang']
 *   - Chuỗi chung (Cài đặt, Đóng, Giao diện…) có sẵn trong kit với khóa kit.*; khóa trùng tên ở đây sẽ đè
 *   - Chuỗi số nhiều: { one, other }, chọn theo params.n
 * ===================================================================== */
window.GAME_DICT = {
  en: {
    'meta.title': 'Crazy Eights',
    'meta.description': 'Crazy Eights: match the suit or rank, play wild eights and empty your hand before three computer players.',
    'app.name': 'Crazy Eights',

    'seat.0': 'You',
    'seat.1': 'West',
    'seat.2': 'North',
    'seat.3': 'East',
    'suit.S': 'Spades',
    'suit.H': 'Hearts',
    'suit.D': 'Diamonds',
    'suit.C': 'Clubs',
    'level.easy': 'Easy',
    'level.hard': 'Hard',

    'table.label': 'Card table',
    'hand.label': 'Your hand',
    'deck.label': { one: 'Draw pile, {n} card', other: 'Draw pile, {n} cards' },
    'deck.draw': 'Draw a card',
    'pile.label': 'Discard pile: {card}. Suit to follow: {suit}',
    'suit.called': 'Called suit',
    'seat.cards': { one: '{n} card', other: '{n} cards' },
    'seat.aria': '{name}: {cards}, {score} points',
    'seat.thinking': 'Thinking',
    'card.playable': 'playable',
    'me.score': '{n} pts',
    'info.round': 'Round {n} · to {target}',

    'act.draw': 'Draw',
    'act.pass': 'Pass',

    'status.yourTurn': 'Your turn: match {suit} or {rank}, or play an 8',
    'status.noMatch': 'Nothing matches {suit} or {rank}. Draw a card',
    'status.drewPlayable': 'Play the card you drew, or pass',
    'status.drewDead': 'The card you drew does not fit. You pass',
    'status.stuck': 'Nothing to draw and nothing to play. You pass',
    'status.cpu': '{name} is thinking…',
    'status.roundOver': 'Round over',
    'status.matchOver': 'Match over',
    'status.bad': '{card} does not match {suit} or {rank}',

    'log.youPlay': 'You played {card}',
    'log.youPlay8': 'You played {card} and called {suit}',
    'log.youDraw': 'You drew {card}',
    'log.youPass': 'You passed',
    'log.play': '{name} played {card}',
    'log.play8': '{name} played {card} and called {suit}',
    'log.draw': '{name} drew a card',
    'log.pass': '{name} passed',
    'log.reshuffle': 'Discard pile reshuffled into the deck',
    'log.start': 'Round {n}: {card} turned up',

    'suit.title': 'Name a suit',
    'suit.text': 'The next player must follow the suit you call (or play an 8).',
    'suit.have': { one: 'you have {n}', other: 'you have {n}' },

    'round.won': 'You win the round!',
    'round.lost': '{name} wins the round',
    'round.text': '{name} scores {n} points from the cards left in the other hands.',
    'round.textYou': 'You score {n} points from the cards left in the other hands.',
    'round.player': 'Player',
    'round.left': 'Cards left',
    'round.points': 'Points',
    'round.total': 'Total',
    'round.next': 'Next round',
    'match.won': 'You win the match!',
    'match.lost': '{name} wins the match',
    'match.text': 'First to {target} points. Final score:',

    'help.keys': '<kbd>←</kbd> <kbd>→</kbd> / <kbd>1</kbd>–<kbd>9</kbd> select · <kbd>Enter</kbd> play · <kbd>D</kbd> draw / pass · <kbd>N</kbd> new match',
    'help.touch': 'Tap a raised card to play it, or tap the deck to draw',
    'help.text':
      '<p>You play against three computers (West, North, East), clockwise. Each player gets 5 cards; one card is turned up to start the discard pile (an 8 is shuffled back and another card turned).</p>' +
      '<ul>' +
      '<li>On your turn, play a card that matches the <b>suit</b> or the <b>rank</b> of the top card. Playable cards are raised.</li>' +
      '<li><b>Eights are wild</b>: play one at any time and name the suit the next player must follow.</li>' +
      '<li>If you cannot play, or do not want to, <b>draw one card</b>. If it fits you may play it at once; otherwise your turn passes.</li>' +
      '<li>When the deck runs out, the discard pile (except its top card) is shuffled into a new deck.</li>' +
      '<li>The first player to empty their hand wins the round and scores the cards left in the other hands: <b>8 = 50</b>, K Q J = 10, A = 1, others face value.</li>' +
      '<li>The first player to reach the target (50, 100 or 200 points, see Settings) wins the match.</li>' +
      '</ul>' +
      '<p><b>Easy</b> computers play a random legal card. <b>Hard</b> computers save their eights, switch to the suit they hold most of, remember which suits you could not follow and dump high cards when someone is about to go out.</p>',

    'settings.level': 'Computer level',
    'settings.levelDesc': 'Changing level or target during a match applies to the next match.',
    'settings.target': 'Match target',
    'settings.speed': 'Computer speed',
    'settings.slow': 'Slow',
    'settings.normal': 'Normal',
    'settings.fast': 'Fast',

    'confirm.title': 'Start a new match?',
    'confirm.text': 'This match will count as a loss.',
    'stats.played': 'Matches',
    'stats.won': 'Matches won',
    'stats.rate': 'Win rate',
    'stats.rounds': 'Rounds won',
    'summary.note': 'Won {won} of {played} matches',
    'summary.none': 'Match suits and ranks, eights are wild',
    'summary.wins': 'Wins',
    'summary.rate': 'Win rate',
    'summary.resume': 'Round {n} · {score}/{target} pts',
    'toast.saved': 'Match restored',
    'toast.nextMatch': 'Applies from the next match',
  },
  vi: {
    'meta.title': 'Bài Tám',
    'meta.description': 'Bài Tám: đánh lá cùng chất hoặc cùng bậc, lá 8 đổi chất tùy ý, hết bài trước ba người máy để ăn điểm.',
    'app.name': 'Bài Tám',

    'seat.0': 'Bạn',
    'seat.1': 'Tây',
    'seat.2': 'Bắc',
    'seat.3': 'Đông',
    'suit.S': 'Bích',
    'suit.H': 'Cơ',
    'suit.D': 'Rô',
    'suit.C': 'Nhép',
    'level.easy': 'Dễ',
    'level.hard': 'Khó',

    'table.label': 'Bàn chơi',
    'hand.label': 'Bài của bạn',
    'deck.label': { one: 'Nọc, còn {n} lá', other: 'Nọc, còn {n} lá' },
    'deck.draw': 'Rút một lá',
    'pile.label': 'Chồng bài đã đánh: {card}. Chất phải theo: {suit}',
    'suit.called': 'Chất đã gọi',
    'seat.cards': { one: '{n} lá', other: '{n} lá' },
    'seat.aria': '{name}: {cards}, {score} điểm',
    'seat.thinking': 'Đang nghĩ',
    'card.playable': 'đánh được',
    'me.score': '{n} điểm',
    'info.round': 'Ván {n} · tới {target}',

    'act.draw': 'Rút',
    'act.pass': 'Bỏ lượt',

    'status.yourTurn': 'Tới lượt bạn: theo {suit} hoặc {rank}, hoặc đánh lá 8',
    'status.noMatch': 'Không có lá theo {suit} hoặc {rank}. Rút một lá',
    'status.drewPlayable': 'Đánh lá vừa rút, hoặc bỏ lượt',
    'status.drewDead': 'Lá vừa rút không đánh được. Bạn bỏ lượt',
    'status.stuck': 'Hết bài để rút, không có lá đánh được. Bạn bỏ lượt',
    'status.cpu': '{name} đang nghĩ…',
    'status.roundOver': 'Hết ván',
    'status.matchOver': 'Hết trận',
    'status.bad': '{card} không theo {suit} hoặc {rank}',

    'log.youPlay': 'Bạn đánh {card}',
    'log.youPlay8': 'Bạn đánh {card}, gọi chất {suit}',
    'log.youDraw': 'Bạn rút được {card}',
    'log.youPass': 'Bạn bỏ lượt',
    'log.play': '{name} đánh {card}',
    'log.play8': '{name} đánh {card}, gọi chất {suit}',
    'log.draw': '{name} rút một lá',
    'log.pass': '{name} bỏ lượt',
    'log.reshuffle': 'Hết nọc: trộn chồng bài đã đánh làm nọc mới',
    'log.start': 'Ván {n}: lật {card}',

    'suit.title': 'Gọi chất',
    'suit.text': 'Người tiếp theo phải đánh chất bạn gọi (hoặc lá 8).',
    'suit.have': { one: 'bạn có {n}', other: 'bạn có {n}' },

    'round.won': 'Bạn thắng ván!',
    'round.lost': '{name} thắng ván',
    'round.text': '{name} ăn {n} điểm từ bài còn trên tay những người khác.',
    'round.textYou': 'Bạn ăn {n} điểm từ bài còn trên tay những người khác.',
    'round.player': 'Người chơi',
    'round.left': 'Bài còn lại',
    'round.points': 'Điểm',
    'round.total': 'Tổng',
    'round.next': 'Ván tiếp',
    'match.won': 'Bạn thắng trận!',
    'match.lost': '{name} thắng trận',
    'match.text': 'Ai chạm {target} điểm trước thì thắng. Điểm chung cuộc:',

    'help.keys': '<kbd>←</kbd> <kbd>→</kbd> / <kbd>1</kbd>–<kbd>9</kbd> chọn · <kbd>Enter</kbd> đánh · <kbd>D</kbd> rút / bỏ lượt · <kbd>N</kbd> trận mới',
    'help.touch': 'Chạm lá đang nhô lên để đánh, chạm nọc để rút',
    'help.text':
      '<p>Bạn đấu với ba người máy (Tây, Bắc, Đông), đi theo chiều kim đồng hồ. Mỗi người 5 lá; lật một lá mở chồng bài (lật ra lá 8 thì trộn lại vào nọc và lật lá khác).</p>' +
      '<ul>' +
      '<li>Tới lượt, đánh một lá <b>cùng chất</b> hoặc <b>cùng bậc</b> với lá trên cùng. Lá đánh được sẽ nhô lên.</li>' +
      '<li><b>Lá 8 là lá đổi chất</b>: đánh lúc nào cũng được, rồi gọi chất người tiếp theo phải theo.</li>' +
      '<li>Không đánh được, hoặc không muốn đánh, thì <b>rút một lá</b>. Lá đó hợp lệ thì được đánh ngay; không thì bỏ lượt.</li>' +
      '<li>Hết nọc thì trộn chồng bài đã đánh (trừ lá trên cùng) làm nọc mới.</li>' +
      '<li>Ai hết bài trước thắng ván và ăn điểm bài còn trên tay những người khác: <b>lá 8 = 50</b>, K Q J = 10, A = 1, còn lại theo số.</li>' +
      '<li>Ai chạm mốc trước (50, 100 hoặc 200 điểm, chọn trong Cài đặt) thì thắng trận.</li>' +
      '</ul>' +
      '<p>Máy <b>Dễ</b> đánh ngẫu nhiên một lá hợp lệ. Máy <b>Khó</b> giữ lá 8 tới cuối, đổi sang chất mình có nhiều nhất, nhớ chất bạn không theo được và xả lá điểm cao khi có người sắp hết bài.</p>',

    'settings.level': 'Mức máy',
    'settings.levelDesc': 'Đổi mức hoặc mốc giữa trận thì áp dụng từ trận sau.',
    'settings.target': 'Mốc thắng trận',
    'settings.speed': 'Tốc độ máy',
    'settings.slow': 'Chậm',
    'settings.normal': 'Vừa',
    'settings.fast': 'Nhanh',

    'confirm.title': 'Chơi trận mới?',
    'confirm.text': 'Trận này sẽ tính là thua.',
    'stats.played': 'Số trận',
    'stats.won': 'Trận thắng',
    'stats.rate': 'Tỉ lệ thắng',
    'stats.rounds': 'Ván thắng',
    'summary.note': 'Thắng {won}/{played} trận',
    'summary.none': 'Theo chất, theo bậc, lá 8 đổi chất',
    'summary.wins': 'Trận thắng',
    'summary.rate': 'Tỉ lệ thắng',
    'summary.resume': 'Ván {n} · {score}/{target} điểm',
    'toast.saved': 'Đã khôi phục trận',
    'toast.nextMatch': 'Áp dụng từ trận sau',
  },
};
