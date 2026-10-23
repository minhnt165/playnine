// Danh mục game của cổng (chép từ cổng cũ index.html).
// `dir`: thư mục của game (tương đối với cổng). `cat`: thể loại để lọc. `note`: dòng mô tả mặc định khi game chưa có dữ liệu.
// Game mới ghi tóm tắt cho cổng vào localStorage['playnine-<id>-summary-v1'] (xem readSummary).
// `name`, `sub` (dòng phụ dưới tên), `desc`, `tags`, `note`, `daily` có dạng { en, vi }, đọc qua loc().
import type { Localized } from '../i18n/types'

export type Cat = 'puzzle' | 'versus' | 'arcade'

export const CATS: Record<Cat, string> = { puzzle: 'cat.puzzle', versus: 'cat.versus', arcade: 'cat.arcade' } // khóa DICT

export type GameDef = {
  id: string
  dir: string
  cat: Cat
  name: Localized<string>
  sub: Localized<string>
  desc: Localized<string>
  tags: Localized<string[]>
  note?: Localized<string>
  daily?: Localized<string> // có đề hằng ngày: hiện ô gợi ý khi hôm nay chưa chơi
  isNew?: boolean
  keepAlive?: boolean
  /** Game đã nối SDK (ghi ván, bảng xếp hạng); chưa nối thì cổng không hiện bảng và lời mời đăng nhập. */
  sdk?: boolean
  /** Trả về HTML tĩnh tin cậy (render bằng innerHTML). */
  icon(base: string): string
}

const svgIcon = (base: string) => '<img src="' + base + 'icon.svg" alt="">'

export const GAMES: GameDef[] = [
  {
    id: 'co9o',
    sdk: true,
    name: { en: 'Ultimate Tic-Tac-Toe', vi: 'Cờ 9 Ô' },
    sub: { en: 'Nine boards in one', vi: 'Ultimate Tic-Tac-Toe' },
    dir: 'co9o/',
    cat: 'versus',
    isNew: true,
    desc: {
      en: 'Nine 3x3 tic-tac-toe boards inside one big board. The cell you play decides which board your opponent must play next.',
      vi: 'Chín bàn ca-rô 3x3 lồng trong một bàn lớn. Ô bạn đánh quyết định bàn nào đối thủ phải đi tiếp.',
    },
    tags: { en: ['PlayNine original', 'Vs computer', '2 players'], vi: ['Đặc sản PlayNine', 'Đấu máy', '2 người'] },
    note: { en: 'Guided tutorial on your first game', vi: 'Lần đầu chơi có hướng dẫn' },
    icon: svgIcon,
  },
  {
    id: 'sudoku',
    sdk: true,
    cat: 'puzzle',
    name: { en: 'Sudoku', vi: 'Sudoku' },
    sub: { en: 'Number puzzle', vi: 'Sudoku' },
    dir: 'sugoku/',
    keepAlive: false, // game tự lưu ván, rời đi thì gỡ iframe (tránh đồng hồ chạy ngầm)
    desc: {
      en: 'Fill the 9x9 grid with 1–9. Every puzzle has exactly one solution, rated by solving technique, with hints that explain themselves.',
      vi: 'Điền số 1–9 vào lưới 9x9. Đề luôn có một nghiệm, chấm độ khó theo kỹ thuật suy luận, gợi ý có giải thích.',
    },
    tags: { en: ['Puzzle', '1 player', '5 difficulties', 'Daily puzzle'], vi: ['Giải đố', '1 người', '5 độ khó', 'Ván hằng ngày'] },
    icon: () => '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#3b6cf6"/><path d="M12 12h40v40H12z" fill="none" stroke="#fff" stroke-width="3"/><path d="M25.3 12v40M38.7 12v40M12 25.3h40M12 38.7h40" stroke="#fff" stroke-width="2" opacity=".8"/></svg>',
  },
  {
    id: 'xiangqi',
    sdk: true,
    name: { en: 'Xiangqi', vi: 'Cờ Tướng' },
    sub: { en: 'Chinese chess', vi: 'Xiangqi' },
    dir: 'xiangqi/',
    keepAlive: true, // game không tự lưu ván, giữ iframe để về cổng rồi quay lại vẫn còn ván
    cat: 'versus',
    desc: {
      en: 'Chinese chess with full rules, including perpetual check and repetition. Play the computer at 3 levels or two players on one device, and replay your games.',
      vi: 'Cờ tướng luật đầy đủ, kể cả chiếu mãi và lặp thế. Đấu máy 3 mức hoặc hai người trên cùng máy, xem lại ván.',
    },
    tags: { en: ['Strategy', 'Vs computer', '2 players'], vi: ['Chiến thuật', 'Đấu máy', '2 người'] },
    icon: (base: string) => '<img src="' + base + 'icon-192.png" alt="">',
  },
  {
    id: 'minesweeper',
    sdk: true,
    name: { en: 'Minesweeper', vi: 'Dò Mìn' },
    sub: { en: 'Classic puzzle', vi: 'Minesweeper' },
    dir: 'minesweeper/',
    cat: 'puzzle',
    isNew: true,
    desc: {
      en: 'Open every safe cell without hitting a mine. The first move is always safe, long-press to flag, and there is a daily board.',
      vi: 'Mở hết ô an toàn mà không đạp mìn. Nước đầu luôn an toàn, nhấn giữ để cắm cờ, có ván hằng ngày.',
    },
    tags: { en: ['Puzzle', '1 player', 'Daily puzzle'], vi: ['Giải đố', '1 người', 'Ván hằng ngày'] },
    note: { en: 'The Easy 9x9 board has only 10 mines', vi: 'Bàn Dễ 9x9 chỉ có 10 quả mìn' },
    daily: { en: 'One shared board for everyone', vi: 'Một bàn chung cho mọi người' }, // có đề hằng ngày: hiện ô gợi ý khi hôm nay chưa chơi
    icon: svgIcon,
  },
  {
    id: 'caro',
    sdk: true,
    name: { en: 'Gomoku', vi: 'Cờ Caro' },
    sub: { en: 'Five in a row', vi: 'Gomoku' },
    dir: 'caro/',
    cat: 'versus',
    isNew: true,
    desc: {
      en: 'Get five in a row to win, with the blocked-ends rule. Play the computer at 3 levels or two players on one device.',
      vi: 'Năm quân liền hàng là thắng, có luật chặn hai đầu. Đấu máy 3 mức hoặc hai người trên cùng máy.',
    },
    tags: { en: ['Versus', 'Vs computer', '2 players'], vi: ['Đối kháng', 'Đấu máy', '2 người'] },
    note: { en: '15x15 board · blocked-ends rule', vi: 'Bàn 15x15 · luật chặn hai đầu' },
    icon: svgIcon,
  },
  {
    id: '2048',
    sdk: true,
    name: { en: '2048', vi: '2048' },
    sub: { en: 'Merge the tiles', vi: 'Gộp số' },
    dir: '2048/',
    cat: 'puzzle',
    isNew: true,
    desc: {
      en: 'Swipe to merge matching tiles and reach the 2048 tile. With undo and board sizes from 3x3 to 5x5.',
      vi: 'Vuốt để gộp các ô cùng số, chạm tới ô 2048. Có hoàn tác và chọn cỡ bàn từ 3x3 đến 5x5.',
    },
    tags: { en: ['Puzzle', '1 player', 'Quick play'], vi: ['Giải đố', '1 người', 'Chơi nhanh'] },
    note: { en: 'Swipe or use the arrow keys', vi: 'Vuốt hoặc dùng phím mũi tên' },
    icon: svgIcon,
  },
  {
    id: 'oanquan',
    sdk: true,
    name: { en: 'O An Quan', vi: 'Ô Ăn Quan' },
    sub: { en: 'Vietnamese mancala', vi: 'Trò chơi dân gian' },
    dir: 'oanquan/',
    cat: 'versus',
    isNew: true,
    desc: {
      en: 'A Vietnamese folk game: sow stones around the board, capture the citizens and the mandarins. Play the computer at 3 levels or two players on one device.',
      vi: 'Trò dân gian Việt: rải quân theo vòng, ăn dân, ăn quan. Đấu máy 3 mức hoặc hai người trên cùng máy.',
    },
    tags: { en: ['Folk game', 'Vs computer', '2 players'], vi: ['Dân gian', 'Đấu máy', '2 người'] },
    note: { en: 'Guided tutorial on your first game', vi: 'Lần đầu chơi có hướng dẫn' },
    icon: svgIcon,
  },
  {
    id: 'coganh',
    sdk: true,
    name: { en: 'Co Ganh', vi: 'Cờ Gánh' },
    sub: { en: 'Vietnamese folk strategy', vi: 'Trò chơi dân gian' },
    dir: 'coganh/',
    cat: 'versus',
    isNew: true,
    desc: {
      en: 'A Vietnamese folk game on a 5x5 board: slip between two pieces to carry them, surround to trap, and win by converting every enemy piece.',
      vi: 'Cờ dân gian Việt trên bàn 5x5: chen vào giữa để gánh, bao kín để vây, đổi màu hết quân đối thủ là thắng.',
    },
    tags: { en: ['Folk game', 'Vs computer', '2 players'], vi: ['Dân gian', 'Đấu máy', '2 người'] },
    note: { en: 'Guided tutorial on your first game', vi: 'Lần đầu chơi có hướng dẫn' },
    icon: svgIcon,
  },
  {
    id: 'tranhan',
    sdk: true,
    name: { en: 'Nonogram', vi: 'Tranh Ẩn' },
    sub: { en: 'Picture logic puzzle', vi: 'Nonogram' },
    dir: 'tranhan/',
    cat: 'puzzle',
    isNew: true,
    desc: {
      en: 'Fill cells by the number clues on each row and column to reveal a picture. Hand-made sets, random pictures and a daily picture.',
      vi: 'Tô ô theo gợi ý số ở hàng và cột để lộ ra bức tranh. Có bộ tranh vẽ sẵn, tranh ngẫu nhiên và tranh hằng ngày.',
    },
    tags: { en: ['Puzzle', '1 player', 'Daily picture'], vi: ['Giải đố', '1 người', 'Tranh hằng ngày'] },
    note: { en: 'Solve it to see what the picture is', vi: 'Giải xong mới biết tranh gì' },
    daily: { en: 'A new picture every day', vi: 'Mỗi ngày một bức tranh mới' },
    icon: svgIcon,
  },
  {
    id: 'xepgach',
    sdk: true,
    name: { en: 'Falling Blocks', vi: 'Xếp Gạch' },
    sub: { en: 'Clear the lines', vi: 'Falling Blocks' },
    dir: 'xepgach/',
    cat: 'arcade',
    isNew: true,
    desc: {
      en: 'Rotate and drop blocks to complete lines. With hold, ghost piece, a 3-piece preview and touch controls.',
      vi: 'Xoay và thả khối cho kín hàng. Có giữ khối, bóng rơi, xem trước 3 khối và nút bấm cảm ứng.',
    },
    tags: { en: ['Arcade', '1 player', 'High score'], vi: ['Phản xạ', '1 người', 'Kỷ lục'] },
    note: { en: 'Clear 4 lines at once for a big score', vi: 'Xếp kín 4 hàng một lúc để ăn đậm' },
    icon: svgIcon,
  },
  {
    id: 'ran',
    sdk: true,
    name: { en: 'Snake', vi: 'Rắn Săn Mồi' },
    sub: { en: 'Classic arcade', vi: 'Snake' },
    dir: 'ran/',
    cat: 'arcade',
    isNew: true,
    desc: {
      en: 'Steer the snake to eat; the more it eats, the longer and faster it gets. Three modes: Classic, Wrap, Maze.',
      vi: 'Điều khiển rắn ăn mồi, càng ăn càng dài và càng nhanh. Ba chế độ: Cổ điển, Xuyên tường, Mê cung.',
    },
    tags: { en: ['Arcade', '1 player', 'Swipe to play'], vi: ['Phản xạ', '1 người', 'Vuốt để chơi'] },
    note: { en: 'Swipe or use the arrow keys', vi: 'Vuốt hoặc dùng phím mũi tên' },
    icon: svgIcon,
  },
  {
    id: 'covua',
    sdk: true,
    name: { en: 'Chess', vi: 'Cờ Vua' },
    sub: { en: 'Classic strategy', vi: 'Chess' },
    dir: 'covua/',
    cat: 'versus',
    isNew: true,
    desc: {
      en: 'Chess with full rules: castling, en passant, promotion. Play the computer at 3 levels or two players on one device.',
      vi: 'Cờ quốc tế luật đầy đủ: nhập thành, bắt tốt qua đường, phong cấp. Đấu máy 3 mức hoặc hai người trên cùng máy.',
    },
    tags: { en: ['Strategy', 'Vs computer', '2 players'], vi: ['Chiến thuật', 'Đấu máy', '2 người'] },
    note: { en: 'Tap or drag pieces · tutorial included', vi: 'Chạm hoặc kéo thả quân · có hướng dẫn' },
    icon: svgIcon,
  },
  {
    id: 'colat',
    sdk: true,
    name: { en: 'Reversi', vi: 'Cờ Lật' },
    sub: { en: 'Flip to win', vi: 'Reversi' },
    dir: 'colat/',
    cat: 'versus',
    isNew: true,
    desc: {
      en: 'Place a disc to sandwich your opponent’s discs and flip them to your color, on an 8x8 board. Play the computer at 3 levels or two players on one device.',
      vi: 'Đặt quân kẹp quân đối thủ để lật sang màu mình, bàn 8x8. Đấu máy 3 mức hoặc hai người trên cùng máy.',
    },
    tags: { en: ['Strategy', 'Vs computer', '2 players'], vi: ['Chiến thuật', 'Đấu máy', '2 người'] },
    note: { en: 'Guided tutorial on your first game', vi: 'Lần đầu chơi có hướng dẫn' },
    icon: svgIcon,
  },
  {
    id: 'codam',
    sdk: true,
    name: { en: 'Checkers', vi: 'Cờ Đam' },
    sub: { en: 'Draughts', vi: 'Checkers' },
    dir: 'codam/',
    cat: 'versus',
    isNew: true,
    desc: {
      en: '8x8 checkers with forced captures, multi-jumps and kings. Choose International flying kings or American/English rules; play the computer at 3 levels or two players.',
      vi: 'Cờ đam 8x8 bắt buộc ăn quân, ăn liên tiếp, lên vua. Chọn luật Quốc tế vua bay hoặc kiểu Mỹ/Anh, đấu máy 3 mức hoặc hai người.',
    },
    tags: { en: ['Strategy', 'Vs computer', '2 players'], vi: ['Chiến thuật', 'Đấu máy', '2 người'] },
    note: { en: 'Guided tutorial on your first game', vi: 'Lần đầu chơi có hướng dẫn' },
    icon: svgIcon,
  },
  {
    id: 'bonlientiep',
    sdk: true,
    name: { en: 'Four in a Row', vi: 'Bốn Liên Tiếp' },
    sub: { en: 'Drop and connect', vi: 'Four in a Row' },
    dir: 'bonlientiep/',
    cat: 'versus',
    isNew: true,
    desc: {
      en: 'Drop discs into a 7-column board; the first to line up 4 horizontally, vertically or diagonally wins. Play the computer at 3 levels or two players.',
      vi: 'Thả quân vào bàn 7 cột, ai xếp được 4 quân liền hàng ngang, dọc hoặc chéo trước là thắng. Đấu máy 3 mức hoặc hai người.',
    },
    tags: { en: ['Versus', 'Vs computer', '2 players'], vi: ['Đối kháng', 'Đấu máy', '2 người'] },
    note: { en: 'A game takes just a few minutes', vi: 'Ván nhanh chừng vài phút' },
    icon: svgIcon,
  },
  {
    id: 'xepbai',
    sdk: true,
    name: { en: 'Solitaire', vi: 'Xếp Bài' },
    sub: { en: 'Klondike', vi: 'Solitaire' },
    dir: 'xepbai/',
    cat: 'puzzle',
    isNew: true,
    desc: {
      en: 'Build all 52 cards onto the four foundations from A to K. Draw 1 or 3, drag or tap to move, unlimited undo.',
      vi: 'Xếp 52 lá lên bốn ô đích từ A đến K. Rút 1 hoặc 3 lá, kéo thả hoặc chạm để đi, đi lại không giới hạn.',
    },
    tags: { en: ['Puzzle', '1 player', 'Daily deal'], vi: ['Giải đố', '1 người', 'Ván hằng ngày'] },
    note: { en: 'Tap a card and it finds its own spot', vi: 'Chạm một lá để nó tự tìm chỗ' },
    daily: { en: 'One shared deal for everyone', vi: 'Một ván chia chung cho mọi người' },
    icon: svgIcon,
  },
  {
    id: 'phagach',
    sdk: true,
    name: { en: 'Brick Breaker', vi: 'Phá Gạch' },
    sub: { en: 'Arcade', vi: 'Brick Breaker' },
    dir: 'phagach/',
    cat: 'arcade',
    isNew: true,
    desc: {
      en: 'Bounce the ball off the paddle and break every wall of bricks across 10 levels. With tough bricks, steel bricks and 5 power-ups.',
      vi: 'Đỡ bóng bằng thanh trượt, phá hết tường gạch qua 10 màn. Có gạch cứng, gạch thép và 5 loại vật phẩm.',
    },
    tags: { en: ['Arcade', '1 player', 'High score'], vi: ['Phản xạ', '1 người', 'Kỷ lục'] },
    note: { en: 'Break bricks back to back to multiply your score', vi: 'Đập gạch liên tiếp để nhân điểm' },
    icon: svgIcon,
  },
  {
    id: 'noihinh',
    sdk: true,
    name: { en: 'Tile Match', vi: 'Nối Hình' },
    sub: { en: 'Match three', vi: 'Tile Match' },
    dir: 'noihinh/',
    cat: 'puzzle',
    isNew: true,
    desc: {
      en: 'Tap uncovered tiles to drop them into a 7-slot tray; three of a kind clear. Clear the layered board before the tray fills up, with Take out, Undo and Shuffle.',
      vi: 'Chạm ô không bị che để đưa xuống khay 7 chỗ, đủ 3 hình giống nhau thì biến mất. Dọn sạch bàn nhiều lớp trước khi khay đầy, có Lấy ra, Hoàn tác và Xáo trộn.',
    },
    tags: { en: ['Puzzle', '1 player', 'Levels'], vi: ['Giải đố', '1 người', 'Qua màn'] },
    note: { en: 'Every level can be cleared', vi: 'Cấp độ nào cũng có cách giải' },
    icon: svgIcon,
  },
  {
    id: 'truotso',
    sdk: true,
    name: { en: 'Sliding Puzzle', vi: 'Trượt Số' },
    sub: { en: '15-puzzle', vi: 'Sliding Puzzle' },
    dir: 'truotso/',
    cat: 'puzzle',
    isNew: true,
    desc: {
      en: 'Slide the numbered tiles back into order with the gap in the bottom corner. Tap a tile to slide a whole row or column, swipe or use the arrow keys. 3x3, 4x4 and 5x5 boards, ranked by fastest time.',
      vi: 'Trượt các ô số về đúng thứ tự, chỗ trống ở góc dưới phải. Chạm một ô để trượt cả hàng hoặc cột, vuốt hoặc dùng phím mũi tên. Bàn 3x3, 4x4, 5x5, xếp hạng theo thời gian nhanh nhất.',
    },
    tags: { en: ['Puzzle', '1 player', 'Speed'], vi: ['Giải đố', '1 người', 'Tốc độ'] },
    note: { en: 'Every board can be solved', vi: 'Bàn nào cũng giải được' },
    icon: svgIcon,
  },
  {
    id: 'latthe',
    sdk: true,
    name: { en: 'Memory Match', vi: 'Lật Thẻ' },
    sub: { en: 'Find the pairs', vi: 'Memory Match' },
    dir: 'latthe/',
    cat: 'puzzle',
    isNew: true,
    desc: {
      en: 'Flip two cards at a time and find every matching pair of Vietnamese icons. Three board sizes, a timer from the first flip and a best time for each.',
      vi: 'Mỗi lượt lật hai thẻ, tìm hết các cặp hình mang chất Việt. Ba cỡ bàn, đồng hồ chạy từ lần lật đầu và kỷ lục riêng cho từng mức.',
    },
    tags: { en: ['Puzzle', '1 player', 'Memory', 'Fastest time'], vi: ['Giải đố', '1 người', 'Trí nhớ', 'Thi tốc độ'] },
    note: { en: 'The Easy board has just 6 pairs', vi: 'Bàn Dễ chỉ có 6 cặp' },
    icon: svgIcon,
  },
  {
    id: 'banbong',
    sdk: true,
    name: { en: 'Bubble Shooter', vi: 'Bắn Bóng' },
    sub: { en: 'Pop and drop', vi: 'Bubble Shooter' },
    dir: 'banbong/',
    cat: 'arcade',
    isNew: true,
    desc: {
      en: 'Aim, bounce off the walls and match 3 or more bubbles of the same colour. Cut clusters loose to drop them, clear the board for a big bonus, and keep the rows from reaching the line.',
      vi: 'Ngắm, nảy tường và ghép từ 3 bóng cùng màu để nổ. Cắt rời cả chùm cho bóng rơi, dọn sạch bàn để nhận thưởng lớn và đừng để bóng chạm vạch.',
    },
    tags: { en: ['Arcade', '1 player', 'High score'], vi: ['Phản xạ', '1 người', 'Kỷ lục'] },
    note: { en: 'Drop whole clusters for bonus points', vi: 'Làm rơi cả chùm bóng để ăn thưởng' },
    icon: svgIcon,
  },
]

export const gameById = (id: string): GameDef | undefined => GAMES.find((g) => g.id === id)
