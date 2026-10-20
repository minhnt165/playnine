/* =====================================================================
 * Xếp Bài - Đa ngôn ngữ (tiếng Anh mặc định + tiếng Việt)
 *   - Ngôn ngữ dùng chung cho cả cổng PlayNine: localStorage['playnine-lang'] = 'en' | 'vi'
 *   - I18N.t(key, params): tra từ điển ngôn ngữ hiện tại, thiếu thì lấy tiếng Anh, rồi tới chính key
 *   - I18N.apply(root): điền chữ cho [data-i18n], [data-i18n-html], [data-i18n-attr]
 *   - Đổi ngôn ngữ ở trang khác (cổng / iframe) thì trang này tự tải lại theo
 * ===================================================================== */
(function () {
  'use strict';

  var KEY = 'playnine-lang';

  var DICT = {
    en: {
      'meta.title': 'Solitaire',
      'meta.appTitle': 'Solitaire',
      'meta.description': 'Klondike Solitaire: draw 1 or 3, drag and drop or tap to move, unlimited undo, hints, auto-complete, daily deal, statistics and autosave.',
      'app.name': 'Solitaire',

      // Thanh trên + bảng điểm
      'top.help': 'How to play',
      'top.helpKey': 'How to play (H)',
      'top.stats': 'Statistics',
      'top.settings': 'Settings',
      'hud.label': 'Game status',
      'hud.score': 'Score',
      'hud.moves': 'Moves',
      'hud.time': 'Time',
      'table.label': 'Card table. Tab or arrow keys to choose a pile, Enter to pick up and place, Space to draw.',
      'controls.label': 'Controls',
      'btn.undo': 'Undo',
      'btn.undoKey': 'Undo (Z)',
      'btn.hint': 'Hint',
      'btn.hintKey': 'Hint (G)',
      'btn.auto': 'Finish',
      'btn.autoKey': 'Auto-complete to the foundations (A)',
      'btn.new': 'New game',
      'btn.newKey': 'New game (N)',
      'kbd.hint': 'Shortcuts: <kbd>Tab</kbd>/<kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> choose a pile · <kbd>Enter</kbd> pick up / place · <kbd>Space</kbd> draw · <kbd>Esc</kbd> cancel · <kbd>Z</kbd> undo · <kbd>G</kbd> hint · <kbd>A</kbd> auto-complete · <kbd>N</kbd> new game · <kbd>H</kbd> how to play',

      // Kiểu ván
      'mode.random': 'Random deal',
      'mode.daily': 'Daily {date}',
      'draw.n': 'Draw {n}',
      'draw.opt1': 'Draw 1',
      'draw.opt3': 'Draw 3',
      'bucket.draw1': 'Draw 1',
      'bucket.draw3': 'Draw 3',
      'bucket.daily': 'Daily',

      // Lá bài và chồng bài (đọc cho trình đọc màn hình)
      'card': '{rank} of {suit}',
      'rank.1': 'Ace', 'rank.2': '2', 'rank.3': '3', 'rank.4': '4', 'rank.5': '5', 'rank.6': '6', 'rank.7': '7',
      'rank.8': '8', 'rank.9': '9', 'rank.10': '10', 'rank.11': 'Jack', 'rank.12': 'Queen', 'rank.13': 'King',
      'suit.0': 'spades', 'suit.1': 'hearts', 'suit.2': 'diamonds', 'suit.3': 'clubs',
      'pile.stock': 'stock',
      'pile.waste': 'waste',
      'pile.found': 'foundation {n}',
      'pile.col': 'column {n}',
      'slot.stock': { one: 'Stock: 1 card left. Enter to draw {d}', other: 'Stock: {n} cards left. Enter to draw {d}' },
      'slot.stockRedeal': { one: 'Stock empty. Enter to redeal 1 card', other: 'Stock empty. Enter to redeal {n} cards' },
      'slot.stockEmpty': 'Stock empty',
      'slot.waste': { one: 'Waste: {card} on top, 1 card', other: 'Waste: {card} on top, {n} cards' },
      'slot.wasteEmpty': 'Waste: empty',
      'slot.found': 'Foundation {f}: up to {card}',
      'slot.foundEmpty': 'Foundation {f}: empty',
      'slot.col': 'Column {c}: {cards}',
      'slot.colDown': 'Column {c}: {down} face down, {cards}',
      'slot.colEmpty': 'Column {c}: empty',

      // Thông báo khi chơi
      'say.redeal': 'Stock redealt',
      'say.drew': { one: 'Drew 1 card: {card}', other: 'Drew {n} cards: {card}' },
      'say.flipped': '. New card turned over',
      'move.desc': '{card}{count} → {to}',
      'move.count': ' ({n} cards)',
      'say.undone': 'Undone',
      'say.win': 'You win! All 52 cards are on the foundations',
      'say.held': 'Holding {card}',
      'say.heldMore': { one: ' and 1 more card', other: ' and {n} more cards' },
      'say.heldPlace': '. Choose where to place it, then press Enter',
      'say.select': { one: 'Selected 1 card, from {card}', other: 'Selected {n} cards, from {card}' },
      'say.cantPick': 'Nothing to pick up here',
      'say.released': 'Selection cancelled',
      'toast.empty': 'Stock and waste are both empty',
      'toast.autoReady': 'All cards face up · tap Finish to auto-complete',
      'toast.stuck': 'No useful moves left · try Undo or New game',
      'toast.cantPlace': "Can't place it here",
      'hint.draw': 'Hint: draw a card',
      'hint.redeal': 'Hint: redeal the stock',
      'hint.move': 'Hint: {move}',

      // Tóm tắt cho cổng PlayNine
      'sum.none': 'No games yet · try the daily deal',
      'sum.noWin': { one: '1 game played · no wins yet', other: '{n} games played · no wins yet' },
      'sum.won': { one: '1 win · fastest {time}', other: '{n} wins · fastest {time}' },
      'sum.wins': 'Wins',
      'sum.rate': 'Win rate',
      'sum.fastest': 'Fastest',
      'sum.dailyStreak': 'Daily streak',
      'sum.resumeDaily': 'Daily Solitaire',
      'sum.resumeRandom': 'Solitaire · {draw}',
      'sum.detail': '{n}/52 on foundations · {score} pts · {time}',
      'sum.dailyTitle': "Today's deal · {draw}",

      // Ván mới
      'new.title': 'New game',
      'new.warning': 'The current game will be abandoned: it counts as a loss and ends your win streak.',
      'new.drawLabel': 'Cards per draw in random deals',
      'new.drawDesc': 'Draw 1 is easier. The daily deal is always Draw 1 so everyone plays the same deal.',
      'new.daily': 'Daily deal',
      'new.dailyDesc': '{date} · {draw} · same deal for everyone',
      'new.dailyStreak': ' · {n}-day streak',
      'new.badgeNew': 'New',
      'new.random': 'Random deal',
      'new.randomDesc': 'Fresh shuffle · {draw}',
      'new.restart': 'Replay this deal',
      'new.restartDesc': 'Start this deal over · {draw}',
      'btn.cancel': 'Cancel',

      // Cách chơi
      'help.title': 'How to play',
      'help.steps': 'Steps',
      'help.step': 'Step {i}/{n}',
      'help.dot': 'Step {i}',
      'help.prev': 'Back',
      'help.next': 'Next',
      'help.play': "Let's play!",
      'btn.close': 'Close',
      'help.1.title': 'Goal: move all 52 cards to the 4 foundations',
      'help.1.text': 'Each foundation holds <b>one suit</b>, built <b>from A up to K</b> (A, 2, 3 … 10, J, Q, K). Get all 52 cards onto the foundations to <b>win</b>.',
      'help.1.alt': 'Four foundations: spades up to 3, hearts with an ace, one empty, clubs up to 2; the 2 of hearts is moving onto the hearts pile',
      'help.1.tagUp': 'move up',
      'help.1.tagFour': '4 foundations',
      'help.2.title': 'Tableau: build down, alternating colors',
      'help.2.text': 'On the 7 columns, place a card <b>one rank lower</b> and of the <b>opposite color</b> on the top card: black 9 on red 10, red 8 on black 9…',
      'help.2.alt': 'Column with K of spades, Q of hearts, J of clubs, 10 of diamonds; the 9 of spades fits, the 9 of hearts is also red so it does not',
      'help.2.tagOk': 'fits',
      'help.2.tagBad': 'same color',
      'help.3.title': 'Face-down cards flip · empty columns take only K',
      'help.3.text': 'Move every face-up card off a column and the face-down card below <b>flips over</b>. You can move <b>a whole run</b> that is built correctly. An empty column only takes a <b>K</b> (or a run starting with K).',
      'help.3.alt': 'The run 7 of hearts, 6 of clubs moves onto the 8 of spades to reveal a face-down card; the K of diamonds goes into an empty column',
      'help.3.tagFlip': 'flips',
      'help.3.tagK': 'K only',
      'help.4.title': 'Stock: tap to turn cards',
      'help.4.text': 'Tap the face-down pile at the top left to turn <b>1 card</b> (or <b>3 cards</b>, set in Settings) onto the waste. Only the <b>top card</b> can be played. When the stock runs out, tap it again to <b>redeal</b>, as many times as you like.',
      'help.4.alt': 'Face-down stock on the left, three cards just drawn fanned to the right, the top one is playable',
      'help.4.tagDraw': 'tap to draw',
      'help.4.tagUse': 'playable',
      'help.4.tagRedeal': 'redeal',
      'help.5.title': 'Tap, drag, undo, hint',
      'help.5.text': '<b>Tap</b> a card and it moves to the best legal spot (foundations first); <b>tap again</b> to try another spot. Or <b>drag and drop</b>. You get unlimited <b>Undo</b>, <b>Hint</b>, and <b>Finish</b> (auto-complete) once every card is face up.',
      'help.5.alt': 'Tap the ace of spades and it flies up to a foundation',
      'help.5.tagTap': 'tap a card',
      'help.5.tagUp': 'to foundation',
      'help.6.title': 'Scoring, daily deal, statistics',
      'help.6.text': 'Waste to column <b>+5</b>, to a foundation <b>+10</b>, turning a card <b>+5</b>, foundation back to column <b>−15</b>. Every day there is one <b>daily deal</b>, the same for everyone. A game counts as played from its first move.',
      'help.6.alt': 'Scoring: waste to column plus 5, to a foundation plus 10, turning a card plus 5',
      'help.6.tagWaste': 'waste → column',
      'help.6.tagUp': 'to foundation',
      'help.6.tagFlip': 'turn a card',

      // Cài đặt
      'settings.title': 'Settings',
      'settings.theme': 'Theme',
      'settings.themeAuto': 'Auto',
      'settings.themeLight': 'Light',
      'settings.themeDark': 'Dark',
      'settings.lang': 'Language',
      'settings.tap': 'Tapping a card',
      'settings.tapAuto': 'Auto-move',
      'settings.tapSelect': 'Select & place',
      'settings.tapAutoDesc': 'Tap a card and it moves to the best spot (foundations first); tap again to try another spot. Drag and drop still works.',
      'settings.tapSelectDesc': 'Tap a card to pick it up, then tap where to place it. Double-tap to send a card to a foundation.',
      'settings.speed': 'Animation speed',
      'settings.slow': 'Slow',
      'settings.medium': 'Medium',
      'settings.fast': 'Fast',
      'settings.off': 'Off',
      'settings.rules': 'Rules · apply from the next game',
      'settings.draw': 'Cards per draw',
      'settings.draw1': '1 card',
      'settings.draw3': '3 cards',
      'settings.drawDesc': 'Unlimited redeals, no penalty. The daily deal is always Draw 1.',
      'settings.replayHelp': 'Show how to play',
      'settings.done': 'Done',
      'settings.version': 'Solitaire · PlayNine · version',
      'toast.appliedNow': 'Applied to this game',
      'toast.appliedNext': 'Applies from the next random deal',

      // Thống kê
      'stats.title': 'Statistics',
      'stats.played': 'Played',
      'stats.won': 'Won',
      'stats.rate': 'Win rate',
      'stats.fastest': 'Fastest',
      'stats.bestScore': 'Best score',
      'stats.dailyStreak': 'Daily streak',
      'stats.streak': 'Win streak',
      'stats.bestStreak': 'Best streak',
      'stats.dailyWins': 'Daily wins',
      'stats.byMode': 'By game type',
      'stats.colMode': 'Mode',
      'stats.colPlayed': 'Played',
      'stats.colWon': 'Won',
      'stats.colFastest': 'Fastest',
      'stats.colBest': 'Best',
      'stats.note': 'A game counts as played from its first move. Leaving an unfinished game for another one ends your win streak.',
      'stats.reset': 'Reset',
      'stats.resetConfirm': 'Tap again to clear',
      'toast.statsReset': 'Statistics reset',

      // Thắng ván
      'result.win': 'You win!',
      'result.record': 'New record!',
      'result.subDaily': 'You solved the daily deal for {date}.',
      'result.sub': 'All 52 cards on the foundations · {draw}.',
      'result.time': 'Time',
      'result.score': 'Score',
      'result.moves': 'Moves',
      'result.lineDaily': 'Daily streak <b>{n}</b> · come back tomorrow!',
      'result.line': 'Win streak <b>{s}</b> · won {w}/{p} games',
      'result.view': 'View table',
    },

    vi: {
      'meta.title': 'Xếp Bài',
      'meta.appTitle': 'Xếp Bài',
      'meta.description': 'Xếp Bài (Klondike Solitaire) tiếng Việt: rút 1 hoặc 3 lá, kéo thả hoặc chạm để đi, đi lại không giới hạn, gợi ý, tự hoàn thành, ván hằng ngày, thống kê, tự lưu ván.',
      'app.name': 'Xếp Bài',

      'top.help': 'Cách chơi',
      'top.helpKey': 'Cách chơi (H)',
      'top.stats': 'Thống kê',
      'top.settings': 'Cài đặt',
      'hud.label': 'Trạng thái ván',
      'hud.score': 'Điểm',
      'hud.moves': 'Nước đi',
      'hud.time': 'Thời gian',
      'table.label': 'Bàn bài. Tab hoặc phím mũi tên để chọn chồng bài, Enter để cầm và đặt, Space để rút bài.',
      'controls.label': 'Điều khiển',
      'btn.undo': 'Đi lại',
      'btn.undoKey': 'Đi lại (Z)',
      'btn.hint': 'Gợi ý',
      'btn.hintKey': 'Gợi ý (G)',
      'btn.auto': 'Tự xếp',
      'btn.autoKey': 'Tự xếp nốt lên đích (A)',
      'btn.new': 'Ván mới',
      'btn.newKey': 'Ván mới (N)',
      'kbd.hint': 'Phím tắt: <kbd>Tab</kbd>/<kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> chọn chồng bài · <kbd>Enter</kbd> cầm / đặt · <kbd>Space</kbd> rút bài · <kbd>Esc</kbd> bỏ cầm · <kbd>Z</kbd> đi lại · <kbd>G</kbd> gợi ý · <kbd>A</kbd> tự xếp · <kbd>N</kbd> ván mới · <kbd>H</kbd> cách chơi',

      'mode.random': 'Ván ngẫu nhiên',
      'mode.daily': 'Hằng ngày {date}',
      'draw.n': 'rút {n} lá',
      'draw.opt1': 'Rút 1 lá',
      'draw.opt3': 'Rút 3 lá',
      'bucket.draw1': 'Rút 1 lá',
      'bucket.draw3': 'Rút 3 lá',
      'bucket.daily': 'Hằng ngày',

      'card': '{rank} {suit}',
      'rank.1': 'Át', 'rank.2': '2', 'rank.3': '3', 'rank.4': '4', 'rank.5': '5', 'rank.6': '6', 'rank.7': '7',
      'rank.8': '8', 'rank.9': '9', 'rank.10': '10', 'rank.11': 'Bồi', 'rank.12': 'Đầm', 'rank.13': 'Già',
      'suit.0': 'bích', 'suit.1': 'cơ', 'suit.2': 'rô', 'suit.3': 'nhép',
      'pile.stock': 'chồng rút',
      'pile.waste': 'chồng thải',
      'pile.found': 'ô đích {n}',
      'pile.col': 'cột {n}',
      'slot.stock': 'Chồng rút: còn {n} lá. Enter để rút {d} lá',
      'slot.stockRedeal': 'Hết chồng rút. Enter để chia lại {n} lá',
      'slot.stockEmpty': 'Chồng rút trống',
      'slot.waste': 'Chồng thải: {card} trên cùng, {n} lá',
      'slot.wasteEmpty': 'Chồng thải: trống',
      'slot.found': 'Ô đích {f}: đã tới {card}',
      'slot.foundEmpty': 'Ô đích {f}: trống',
      'slot.col': 'Cột {c}: {cards}',
      'slot.colDown': 'Cột {c}: {down} lá úp, {cards}',
      'slot.colEmpty': 'Cột {c}: trống',

      'say.redeal': 'Chia lại chồng rút',
      'say.drew': 'Rút {n} lá: {card}',
      'say.flipped': '. Lật lá mới',
      'move.desc': '{card}{count} → {to}',
      'move.count': ' ({n} lá)',
      'say.undone': 'Đã đi lại',
      'say.win': 'Thắng rồi! Đã xếp đủ 52 lá lên ô đích',
      'say.held': 'Đang cầm {card}',
      'say.heldMore': ' và {n} lá trên',
      'say.heldPlace': '. Chọn chỗ đặt rồi nhấn Enter',
      'say.select': 'Chọn {n} lá, từ {card}',
      'say.cantPick': 'Không cầm được lá ở đây',
      'say.released': 'Bỏ cầm',
      'toast.empty': 'Chồng rút và chồng thải đều trống',
      'toast.autoReady': 'Mọi lá đã ngửa · bấm Tự xếp để xếp nốt',
      'toast.stuck': 'Hết nước đi có ích · thử Đi lại hoặc Ván mới',
      'toast.cantPlace': 'Không đặt được ở đây',
      'hint.draw': 'Gợi ý: rút bài',
      'hint.redeal': 'Gợi ý: chia lại chồng rút',
      'hint.move': 'Gợi ý: {move}',

      'sum.none': 'Chưa chơi ván nào · thử ván hằng ngày nhé',
      'sum.noWin': '{n} ván đã chơi · chưa thắng ván nào',
      'sum.won': '{n} ván thắng · nhanh nhất {time}',
      'sum.wins': 'Ván thắng',
      'sum.rate': 'Tỉ lệ thắng',
      'sum.fastest': 'Nhanh nhất',
      'sum.dailyStreak': 'Chuỗi ngày',
      'sum.resumeDaily': 'Xếp Bài hằng ngày',
      'sum.resumeRandom': 'Xếp Bài · {draw}',
      'sum.detail': '{n}/52 lá lên đích · {score} điểm · {time}',
      'sum.dailyTitle': 'Ván chia hôm nay · {draw}',

      'new.title': 'Ván mới',
      'new.warning': 'Ván đang chơi sẽ bị bỏ, tính là ván chưa thắng và mất chuỗi thắng.',
      'new.drawLabel': 'Ván ngẫu nhiên rút mấy lá',
      'new.drawDesc': 'Rút 1 lá dễ hơn. Ván hằng ngày luôn rút 1 lá để mọi người cùng một đề.',
      'new.daily': 'Ván hằng ngày',
      'new.dailyDesc': '{date} · {draw} · chung cho mọi người',
      'new.dailyStreak': ' · chuỗi {n} ngày',
      'new.badgeNew': 'Mới',
      'new.random': 'Ván ngẫu nhiên',
      'new.randomDesc': 'Chia bộ bài mới · {draw}',
      'new.restart': 'Chơi lại ván này',
      'new.restartDesc': 'Chia lại đúng bộ bài đang chơi · {draw}',
      'btn.cancel': 'Hủy',

      'help.title': 'Cách chơi',
      'help.steps': 'Các bước',
      'help.step': 'Bước {i}/{n}',
      'help.dot': 'Bước {i}',
      'help.prev': 'Trước',
      'help.next': 'Tiếp',
      'help.play': 'Chơi thôi!',
      'btn.close': 'Đóng',
      'help.1.title': 'Mục tiêu: đưa 52 lá lên 4 ô đích',
      'help.1.text': 'Mỗi ô đích xếp <b>một chất</b>, từ <b>A lên K</b> (A, 2, 3 … 10, J, Q, K). Đưa đủ 52 lá lên ô đích là <b>thắng</b>.',
      'help.1.alt': 'Bốn ô đích: bích đã tới 3, cơ có Át, một ô trống, nhép tới 2; lá 2 cơ đang được đưa lên ô cơ',
      'help.1.tagUp': 'lên ô đích',
      'help.1.tagFour': '4 ô đích',
      'help.2.title': 'Xếp cột: giảm dần, xen kẽ đỏ đen',
      'help.2.text': 'Trên 7 cột, đặt lá <b>nhỏ hơn 1 bậc</b> và <b>khác màu</b> lên lá trên cùng: 9 đen lên 10 đỏ, 8 đỏ lên 9 đen…',
      'help.2.alt': 'Cột K bích, Q cơ, J nhép, 10 rô; lá 9 bích đặt được, lá 9 cơ cùng màu đỏ thì không',
      'help.2.tagOk': 'đặt được',
      'help.2.tagBad': 'cùng màu',
      'help.3.title': 'Lá úp tự lật · cột trống chỉ nhận K',
      'help.3.text': 'Chuyển hết lá ngửa đi thì lá úp bên dưới <b>tự lật lên</b>. Được chuyển <b>cả dãy</b> đã xếp đúng. Cột trống chỉ đặt được <b>K</b> (hoặc dãy bắt đầu bằng K).',
      'help.3.alt': 'Dãy 7 cơ, 6 nhép chuyển sang lá 8 bích để lật lá úp; lá K rô đặt vào cột trống',
      'help.3.tagFlip': 'tự lật',
      'help.3.tagK': 'chỉ K',
      'help.4.title': 'Chồng rút: chạm để lật bài',
      'help.4.text': 'Chạm chồng úp ở góc trái để lật <b>1 lá</b> (hoặc <b>3 lá</b>, đổi trong Cài đặt) sang chồng thải. Chỉ dùng được <b>lá trên cùng</b>. Hết chồng thì chạm lần nữa để <b>chia lại</b>, không giới hạn số vòng.',
      'help.4.alt': 'Chồng rút úp bên trái, ba lá vừa rút xòe sang phải, lá trên cùng dùng được',
      'help.4.tagDraw': 'chạm để rút',
      'help.4.tagUse': 'lá dùng được',
      'help.4.tagRedeal': 'chia lại',
      'help.5.title': 'Chạm, kéo thả, đi lại, gợi ý',
      'help.5.text': '<b>Chạm</b> một lá: lá tự tới chỗ hợp lệ tốt nhất (ô đích trước), <b>chạm lại</b> để đổi sang chỗ khác. Hoặc <b>kéo thả</b>. Có <b>Đi lại</b> không giới hạn, <b>Gợi ý</b>, và <b>Tự xếp</b> khi mọi lá đã ngửa.',
      'help.5.alt': 'Chạm lá Át bích, lá tự bay lên ô đích',
      'help.5.tagTap': 'chạm một lá',
      'help.5.tagUp': 'tự lên đích',
      'help.6.title': 'Điểm, ván hằng ngày, thống kê',
      'help.6.text': 'Thải xuống cột <b>+5</b>, lên ô đích <b>+10</b>, lật lá <b>+5</b>, từ ô đích xuống cột <b>−15</b>. Mỗi ngày có một <b>ván hằng ngày</b> chung cho mọi người. Ván chỉ tính là đã chơi từ nước đi đầu tiên.',
      'help.6.alt': 'Điểm: thải xuống cột cộng 5, lên ô đích cộng 10, lật lá cộng 5',
      'help.6.tagWaste': 'thải → cột',
      'help.6.tagUp': 'lên ô đích',
      'help.6.tagFlip': 'lật lá',

      'settings.title': 'Cài đặt',
      'settings.theme': 'Giao diện',
      'settings.themeAuto': 'Tự động',
      'settings.themeLight': 'Sáng',
      'settings.themeDark': 'Tối',
      'settings.lang': 'Ngôn ngữ',
      'settings.tap': 'Chạm vào lá bài',
      'settings.tapAuto': 'Tự đi',
      'settings.tapSelect': 'Chọn rồi đặt',
      'settings.tapAutoDesc': 'Chạm một lá để nó tự tới chỗ tốt nhất (ô đích trước), chạm lại để đổi chỗ. Kéo thả vẫn dùng được.',
      'settings.tapSelectDesc': 'Chạm một lá để cầm, rồi chạm chỗ muốn đặt. Chạm đúp để đưa lá lên ô đích.',
      'settings.speed': 'Tốc độ hiệu ứng',
      'settings.slow': 'Chậm',
      'settings.medium': 'Vừa',
      'settings.fast': 'Nhanh',
      'settings.off': 'Tắt',
      'settings.rules': 'Luật chơi · áp dụng từ ván mới',
      'settings.draw': 'Mỗi lần rút',
      'settings.draw1': '1 lá',
      'settings.draw3': '3 lá',
      'settings.drawDesc': 'Chia lại chồng rút không giới hạn, không trừ điểm. Ván hằng ngày luôn rút 1 lá.',
      'settings.replayHelp': 'Xem lại cách chơi',
      'settings.done': 'Xong',
      'settings.version': 'Xếp Bài · PlayNine · phiên bản',
      'toast.appliedNow': 'Đã áp dụng cho ván này',
      'toast.appliedNext': 'Áp dụng từ ván ngẫu nhiên sau',

      'stats.title': 'Thống kê',
      'stats.played': 'Đã chơi',
      'stats.won': 'Đã thắng',
      'stats.rate': 'Tỉ lệ thắng',
      'stats.fastest': 'Nhanh nhất',
      'stats.bestScore': 'Điểm cao nhất',
      'stats.dailyStreak': 'Chuỗi ngày',
      'stats.streak': 'Chuỗi thắng',
      'stats.bestStreak': 'Chuỗi dài nhất',
      'stats.dailyWins': 'Ngày đã thắng',
      'stats.byMode': 'Theo kiểu chơi',
      'stats.colMode': 'Kiểu',
      'stats.colPlayed': 'Chơi',
      'stats.colWon': 'Thắng',
      'stats.colFastest': 'Nhanh nhất',
      'stats.colBest': 'Điểm cao',
      'stats.note': 'Ván chỉ tính là đã chơi từ nước đi đầu tiên. Bỏ ván đang chơi dở để sang ván khác thì mất chuỗi thắng.',
      'stats.reset': 'Đặt lại',
      'stats.resetConfirm': 'Bấm lần nữa để xóa',
      'toast.statsReset': 'Đã đặt lại thống kê',

      'result.win': 'Bạn thắng!',
      'result.record': 'Kỷ lục mới!',
      'result.subDaily': 'Bạn đã xếp xong ván hằng ngày {date}.',
      'result.sub': 'Đã xếp đủ 52 lá lên ô đích · {draw}.',
      'result.time': 'Thời gian',
      'result.score': 'Điểm',
      'result.moves': 'Nước đi',
      'result.lineDaily': 'Chuỗi <b>{n}</b> ngày · quay lại vào ngày mai nhé!',
      'result.line': 'Chuỗi thắng <b>{s}</b> · đã thắng {w}/{p} ván',
      'result.view': 'Xem bàn',
    },
  };

  var lang = 'en';
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'vi') lang = saved;
  } catch (e) { /* bỏ qua: bộ nhớ bị chặn thì dùng tiếng Anh */ }
  document.documentElement.lang = lang;
  var LOCALE = lang === 'vi' ? 'vi-VN' : 'en-US';

  function lookup(key) {
    var d = DICT[lang];
    if (d && Object.prototype.hasOwnProperty.call(d, key)) return d[key];
    if (Object.prototype.hasOwnProperty.call(DICT.en, key)) return DICT.en[key];
    return key;
  }

  /** Lấy chuỗi theo key, thay {tên} bằng params; giá trị dạng { one, other } chọn theo params.n. */
  function t(key, params) {
    var s = lookup(key);
    if (s && typeof s === 'object') s = params && params.n === 1 && s.one != null ? s.one : s.other;
    s = String(s);
    if (params) {
      s = s.replace(/\{(\w+)\}/g, function (m, k) {
        return Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m;
      });
    }
    return s;
  }

  /** Điền chữ cho các phần tử có data-i18n / data-i18n-html / data-i18n-attr trong root. */
  function apply(root) {
    root = root || document;
    var i, els;
    els = root.querySelectorAll('[data-i18n]');
    for (i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-i18n'));
    els = root.querySelectorAll('[data-i18n-html]');
    for (i = 0; i < els.length; i++) els[i].innerHTML = t(els[i].getAttribute('data-i18n-html'));
    els = root.querySelectorAll('[data-i18n-attr]');
    for (i = 0; i < els.length; i++) {
      var pairs = els[i].getAttribute('data-i18n-attr').split(';');
      for (var j = 0; j < pairs.length; j++) {
        var p = pairs[j].split(':');
        if (p.length === 2 && p[0].trim()) els[i].setAttribute(p[0].trim(), t(p[1].trim()));
      }
    }
    if (root === document) {
      document.title = t('meta.title');
      var desc = document.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute('content', t('meta.description'));
      var app = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (app) app.setAttribute('content', t('meta.appTitle'));
    }
  }

  function saveBeforeReload() {
    if (typeof I18N.onBeforeReload === 'function') {
      try { I18N.onBeforeReload(); } catch (e) { /* bỏ qua */ }
    }
  }

  /** Đổi ngôn ngữ: lưu khóa dùng chung rồi tải lại trang (game đã tự lưu ván trước đó). */
  function set(next) {
    if (next !== 'en' && next !== 'vi') return;
    if (next === lang) return;
    saveBeforeReload();
    try { localStorage.setItem(KEY, next); } catch (e) { /* bỏ qua */ }
    location.reload();
  }

  var I18N = {
    lang: lang,
    locale: LOCALE,
    t: t,
    apply: apply,
    set: set,
    onBeforeReload: null,
    fmtNumber: function (n) { return Number(n || 0).toLocaleString(LOCALE); },
    fmtDate: function (d, opts) { return d.toLocaleDateString(LOCALE, opts); },
  };

  // Cổng hoặc trang khác đổi ngôn ngữ: tải lại để theo
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    var v = e.newValue === 'vi' ? 'vi' : 'en';
    if (v === lang) return;
    saveBeforeReload();
    location.reload();
  });

  window.I18N = I18N;
})();
