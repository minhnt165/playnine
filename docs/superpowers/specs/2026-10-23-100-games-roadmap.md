# PlayNine: lộ trình lên 100 game

Ngày: 2026-10-23 · Trạng thái: chờ duyệt · Xuất phát: 21 game (commit `979b4e4`)

## 1. Mục tiêu

Cổng có **100 game**, mỗi game đều đạt chuẩn như 21 game hiện tại (mục 3). Không hạ chuẩn để chạy số: một game nửa vời làm người chơi mất tin vào cả cổng.

Cách đạt được: **giảm chi phí mỗi game** thay vì giảm chất lượng. Hôm nay mỗi game tốn khoảng 3.000 dòng và phải sửa 8 file dùng chung của cổng (catalog, preview, CSS, migration, 4 file test đếm số game). Với 79 game nữa, cách này làm `previews.js` lên 6.000 dòng, `portal.css` phình theo, và mỗi lần thêm game lại đụng cùng vài file. Vì vậy làm **đợt 0** trước: biến "thêm game" thành "thêm một thư mục".

**Chỉ chọn game quốc tế:** game có luật phổ biến toàn cầu (cờ, bài, giải đố, arcade kinh điển). Không làm game đặc thù một nước (Tiến Lên, Phỏm, Bầu Cua, Cờ Toán…). Tên hiển thị vẫn đặt tiếng Việt như hiện nay (Chess = Cờ Vua).

**Không làm:** game cần tài nguyên lớn (ảnh bitmap, nhạc nền, bộ dữ liệu ngoài), game nhiều người thời gian thực, game 3D. Những thứ đó để sau mốc 100.

## 2. Số liệu để lên kế hoạch

Đo ở đợt vừa rồi (3 game: Trượt Số, Lật Thẻ, Bắn Bóng, làm song song bằng 3 agent):

| | Mỗi game |
|---|---|
| Thời gian một agent | 30–40 phút |
| Dòng code (game + test + README) | 2.700–3.200 |
| File dùng chung của cổng phải sửa | 8 |
| Test e2e | 3 |

Dự kiến sau đợt 0: dòng code mỗi game còn ~1.500 (bỏ phần topbar, modal, theme, i18n, âm thanh lặp lại), file dùng chung phải sửa còn **0** (manifest nằm trong thư mục game), e2e chung tự sinh.

Nhịp đề xuất: **một đợt 8 game mỗi phiên làm việc** (4 agent song song, 2 lượt), cộng một phiên ngắn để review và chạy e2e. Hai đợt một tuần thì 10 đợt xong trong 5–6 tuần, tức **khoảng đầu tháng 12/2026**. Đây là ước lượng; đợt 8 (game lớn) có thể cần gấp đôi.

## 3. Chuẩn một game ("xong" nghĩa là gì)

Mỗi game, không có ngoại lệ:

1. Thư mục `games/<dir>/` có `game.json` (manifest, mục 4.1), `index.html`, `app.js`, `engine.js` (logic thuần, chạy được trong Node), `i18n.js`, `icon.svg`, `preview.svg`, `README.md` (tiếng Việt), `test.js` (`node test.js` xanh).
2. Gắn SDK: `gameStart`/`gameEnd` đúng luật mục 5; mở thẳng link game không có SDK vẫn chơi được.
3. Song ngữ en/vi, giao diện sáng/tối, phím tắt cho máy tính, chạm/vuốt cho điện thoại, vừa màn hình 390×844 không cuộn.
4. Lưu tiến độ bằng khóa `playnine-<id>-(save|stats|settings|summary)-v1` để đồng bộ lên tài khoản.
5. Tôn trọng `prefers-reduced-motion` cho hiệu ứng trang trí.
6. Manifest có đủ `server` (metric, mode, điểm, luật chống gian lận) để sinh SQL.
7. E2e chung (hello/start/standalone) xanh; game có cách thắng xác định được thì thêm test "ván thắng" riêng.

## 4. Đợt 0: nền tảng cho 100 game

Làm xong và merge trước khi thêm game thứ 22. Mỗi mục là một PR/commit riêng, cổng vẫn chạy sau từng mục.

### 4.1 Manifest `games/<dir>/game.json`

Thay cho việc sửa `catalog.ts` bằng tay. Nội dung chính:

```json
{
  "id": "truotso", "cat": "puzzle", "addedAt": "2026-10-23",
  "name": { "en": "Sliding Puzzle", "vi": "Trượt Số" },
  "sub": { "en": "15-puzzle", "vi": "Sliding Puzzle" },
  "desc": { "en": "...", "vi": "..." },
  "tags": { "en": ["Puzzle", "1 player"], "vi": ["Giải đố", "1 người"] },
  "note": { "en": "...", "vi": "..." },
  "server": {
    "metric": "time_low", "points": 5,
    "modes": [{ "key": "4x4", "label": { "en": "4x4", "vi": "4x4" }, "points": 6, "rules": { "min_time_ms": 3000 } }]
  }
}
```

- Cổng đọc toàn bộ manifest bằng `import.meta.glob('../../../games/*/game.json', { eager: true })`; thứ tự hiển thị lấy từ `games/order.json` (một mảng id). `catalog.ts` chỉ còn kiểu dữ liệu và hàm `gameById`.
- `isNew` không ghi tay nữa: suy ra từ `addedAt` (trong 14 ngày).
- 21 game hiện có được chuyển sang manifest trong cùng một commit (việc cơ học, có test so sánh với catalog cũ trước khi xóa catalog cũ).
- Test đếm số game (`Home.test`, `catalog.test`, `Player.test`, `previews.test`, `core.test`, e2e `portal.spec`) đổi sang đọc `GAMES.length`, không ghi số cứng.

### 4.2 Preview tĩnh `preview.svg`

Hiện preview là JS trong `previews.js` + CSS trong `portal.css`, mỗi game 40–80 dòng ở hai file dùng chung, và 100 preview động cùng chạy trên trang chủ sẽ nặng.

- Game mới đặt `preview.svg` trong thư mục game: SVG tự chứa, hoạt hình bằng CSS/SMIL bên trong file, có `@media (prefers-reduced-motion: reduce)` tắt hoạt hình. Cổng hiện bằng `<img loading="lazy">`, nền thẻ lấy từ `preview.bg` trong manifest.
- 21 preview JS hiện có giữ nguyên; `mountPreviews` chỉ gắn cho game không có `preview.svg`, và chỉ gắn khi thẻ vào khung nhìn (`IntersectionObserver`).

### 4.3 Bộ dùng chung `games/_kit/`

Phần lặp lại giữa các game (thanh trên, nút menu, modal cài đặt/hướng dẫn/thống kê, theme, đọc `playnine-lang`, toast, bật/tắt âm, đồng hồ, helper localStorage có try/catch, wrapper SDK có kiểm tra `window.PlayNine`) gom vào `_kit/kit.css` + `_kit/kit.js`. `assemble.mjs` chép `_kit` ra `dist/_kit/` như `brand/`. Game mới nhúng `../_kit/kit.js?v=1`.

- Game cũ **không** sửa sang kit; kit chỉ phục vụ game mới. Khi đổi kit phải tăng `?v=`.
- Kit có test riêng và một trang `_kit/demo.html` để nhìn.

### 4.4 Lệnh tạo khung `npm run new-game -- <dir>`

`scripts/new-game.mjs` sinh thư mục game từ `games/_template/` (phiên bản JS thuần, dùng kit, không phải Vite như mục 9 của thiết kế 2026-10-20; bản Vite để sau mốc 100), kèm `game.json` trống đúng schema, `test.js` có harness sẵn, README theo mẫu.

### 4.5 Sinh SQL từ manifest

`scripts/seed-sql.mjs <id>...` in ra `insert into public.games ...` từ `server` trong manifest. Mỗi đợt một file migration `supabase/migrations/<ts>_batch<N>.sql` chứa kết quả của lệnh này. Test Supabase `core.test` so bảng `games` với các manifest (metric, mode, điểm) nên không cần sửa test tay mỗi đợt.

### 4.6 E2e chung

`e2e/games.spec.ts` đọc manifest và sinh cho mọi game: (a) hello + start đúng mode mặc định ở `#/play/<id>` (nút bắt đầu, nếu có, khai trong manifest: `"e2e": { "start": "#btn-start" }`); (b) mở `<dir>/` không có SDK, không `pageerror`; (c) URL cũ không đổi. Test "ván thắng" riêng của game đặt ở `games/<dir>/e2e.spec.ts`, thêm `testDir` thứ hai trong `playwright.config.ts`. Bỏ các test trùng trong `sdk-games.spec.ts` và `legacy-urls.spec.ts`.

### 4.7 Cổng chịu được 100 game

- **Thể loại:** `Cat` từ 3 lên 5: `puzzle` (giải đố), `versus` (đối kháng), `arcade` (phản xạ), `card` (bài), `brain` (chữ và số). Chủ đề mềm (cờ bàn, solitaire, logic Nhật…) dùng bộ sưu tập đã có trong admin, không thêm cat.
- **Trang chủ:** lưới hiện tối đa 24 thẻ theo bộ lọc và nút "Xem tất cả" dẫn tới `#/games` (lưới đầy đủ, lọc theo cat, sắp xếp mới nhất / chơi nhiều / đánh giá, ô tìm). Tìm kiếm ở thanh trên vẫn lọc toàn bộ.
- **Menu đổi game trong khi chơi** (`#p-switch`): thêm ô lọc nhanh, nhóm theo cat; phím 1–9 giữ nguyên.
- **Admin:** bảng game có ô tìm và lọc cat.
- **Hiệu năng:** preview lười như 4.2; kiểm tra Lighthouse trang chủ ở điện thoại ≥ 85 sau khi có 50 game.

### 4.8 Luật điểm theo loại game (để agent tự điền manifest)

| Loại | Metric | Điểm/ván | Luật |
|---|---|---|---|
| Đố logic có cấp độ | `wins` | 3–8 theo mức | `min_duration_ms` ≥ 3000 |
| Đố tính giờ | `time_low` | 3–10 theo mức | `min_time_ms` dưới kỷ lục người thật một chút |
| Phản xạ, vô tận | `score_high` | 5 | `min_duration_ms` 5000 + `max_score_per_sec` đo bằng bot |
| Đối kháng với máy | `wins` | 10/15/25 theo mức máy | `min_duration_ms` ≥ 3000 |
| Bài, có kỹ năng | `wins` | 8–12 | `min_duration_ms` ≥ 5000 |
| May rủi thuần (Rắn Leo Thang) | `wins` | 1 | ván ≥ 10 s; không có sự kiện xếp hạng |

Ván bỏ dở khi chưa đi nước nào thì không gửi `gameEnd` (tránh đổi bàn liên tục để lấy điểm tham gia).

## 5. Danh sách 79 game

Toàn bộ là game quốc tế. Tên theo kiểu đặt tên hiện tại: tên Việt thuần, id không dấu, tên tiếng Anh là tên chung của thể loại (không dùng tên thương hiệu). Cỡ: S (≤ 1.200 dòng với kit), M (≤ 2.000), L (hơn, hoặc AI khó). Đợt xếp theo nguyên tắc: dễ và quen trước để có đà, game lớn dồn về sau khi kit đã ổn.

### Đợt 1: nhanh và quen (8, puzzle)

| # | Game | id | Giống | Xếp hạng | Cỡ |
|---|---|---|---|---|---|
| 22 | Tắt Đèn | `tatden` | Lights Out | wins theo cấp | S |
| 23 | Tháp Hà Nội | `thaphanoi` | Tower of Hanoi | time_low theo số đĩa | S |
| 24 | Đẩy Thùng | `daythung` | Sokoban | wins theo cấp | M |
| 25 | Rót Nước | `rotnuoc` | Water sort | wins theo cấp | S |
| 26 | Nối Màu | `noimau` | Flow / number link | wins theo cỡ bàn | M |
| 27 | Nổ Khối | `nokhoi` | SameGame | score_high | S |
| 28 | Xếp Khối | `xepkhoi` | Block puzzle 10×10 | score_high | M |
| 29 | Đoán Mã | `doanma` | Mastermind | time_low | S |

### Đợt 2: cờ bàn và xúc xắc (8)

| # | Game | id | Giống | Xếp hạng | Cỡ |
|---|---|---|---|---|---|
| 30 | Cá Ngựa | `cangua` | Ludo, 4 người (3 máy) | wins | M |
| 31 | Tangram | `tangram` | Tangram, 7 mảnh ghép theo hình | wins theo hình | M |
| 32 | Cờ Thú | `cothu` | Jungle | wins theo mức máy | M |
| 33 | Cờ Đơn | `codon` | Peg solitaire | wins | S |
| 34 | Hoa Dung Đạo | `hoadungdao` | Klotski | wins theo bàn, số nước | S |
| 35 | Rắn Leo Thang | `ranleothang` | Snakes and ladders | may rủi | S |
| 36 | Cờ Chín Quân | `cochinquan` | Nine men's morris | wins theo mức máy | M |
| 37 | Xí Ngầu | `xingau` | Yahtzee | score_high | S |

### Đợt 3: bài (8, cat `card`)

| # | Game | id | Giống | Xếp hạng | Cỡ |
|---|---|---|---|---|---|
| 38 | Xì Dách | `xidach` | Blackjack, luật chuẩn | wins | S |
| 39 | Xếp Bài Nhện | `xepbainhen` | Spider solitaire | time_low theo 1/2/4 chất | M |
| 40 | Ô Trống | `otrong` | FreeCell | time_low | M |
| 41 | Kim Tự Tháp | `kimtuthap` | Pyramid solitaire | wins | S |
| 42 | Ba Đỉnh | `badinh` | TriPeaks | score_high | S |
| 43 | Bài Tám | `baitam` | Crazy Eights, 3 máy | wins | M |
| 44 | Poker Rút | `pokerrut` | Video poker | score_high | S |
| 45 | Đô-mi-nô | `domino` | Dominoes, 1 máy | wins | M |

### Đợt 4: phản xạ (8, arcade)

| # | Game | id | Giống | Xếp hạng | Cỡ |
|---|---|---|---|---|---|
| 46 | Chim Bay | `chimbay` | Flappy | score_high | S |
| 47 | Nhảy Cao | `nhaycao` | Doodle jump | score_high | M |
| 48 | Qua Đường | `quaduong` | Frogger | score_high | M |
| 49 | Đập Chuột | `dapchuot` | Whack-a-mole | score_high | S |
| 50 | Xếp Tầng | `xeptang` | Stack tower | score_high | S |
| 51 | Bóng Bàn | `bongban` | Pong với máy | wins theo mức | S |
| 52 | Bắn Phi Thuyền | `banphithuyen` | Space invaders | score_high | M |
| 53 | Thiên Thạch | `thienthach` | Asteroids | score_high | M |

### Đợt 5: logic kiểu Nhật (8, puzzle)

| # | Game | id | Giống | Xếp hạng | Cỡ |
|---|---|---|---|---|---|
| 54 | Kakuro | `kakuro` | Kakuro | time_low theo cỡ | M |
| 55 | Ô Số Tính | `osotinh` | KenKen | time_low theo cỡ | M |
| 56 | Cầu Nối | `caunoi` | Hashi | time_low | M |
| 57 | Vòng Kín | `vongkin` | Slitherlink | time_low | L (sinh đề) |
| 58 | Nhị Phân | `nhiphan` | Takuzu / Binairo | time_low | S |
| 59 | Lều Trại | `leutrai` | Tents | time_low | M |
| 60 | Hitori | `hitori` | Hitori | time_low | M |
| 61 | Chia Ô | `chiao` | Shikaku | time_low | M |

Mọi game đợt này phải **sinh đề có lời giải duy nhất** trong engine (có test), như Sudoku và Tranh Ẩn đang làm.

### Đợt 6: chữ và số (8, cat `brain`)

| # | Game | id | Giống | Xếp hạng | Cỡ |
|---|---|---|---|---|---|
| 62 | Đoán Chữ | `doanchu` | Wordle, từ tiếng Anh 5 chữ | wins, có đề hằng ngày | M |
| 63 | Tìm Chữ | `timchu` | Word search, tiếng Anh | time_low | M |
| 64 | Ghép Chữ | `ghepchu` | Anagram, tiếng Anh | score_high | S |
| 65 | Tính Nhẩm | `tinhnham` | Mental math, 60 giây | score_high | S |
| 66 | Tính 24 | `tinh24` | 24 game | time_low | S |
| 67 | Nhớ Nhịp | `nhonhip` | Simon | score_high | S |
| 68 | Gõ Nhanh | `gonhanh` | Typing test | score_high (WPM) | S |
| 69 | Dãy Số | `dayso` | Hidato | time_low | M |

Ba game chữ dùng **danh sách từ tiếng Anh** có giấy phép mở (ví dụ bộ từ Wordle gốc hoặc ENABLE, đều public domain), nằm trong thư mục game, ≤ 300 KB. Giao diện vẫn song ngữ; chỉ từ cần đoán là tiếng Anh.

### Đợt 7: đối kháng với máy (8, versus)

| # | Game | id | Giống | Xếp hạng | Cỡ |
|---|---|---|---|---|---|
| 70 | Bắn Tàu | `bantau` | Battleship | wins | M |
| 71 | Ô Vuông | `ovuong` | Dots and boxes | wins theo mức | M |
| 72 | Cờ Lục Giác | `colucgiac` | Hex | wins theo mức | M |
| 73 | Cờ Nhảy | `conhay` | Chinese checkers | wins | M |
| 74 | Xoay Cờ | `xoayco` | Pentago | wins theo mức | M |
| 75 | Vệt Sáng | `vetsang` | Tron light cycles | wins | S |
| 76 | Khúc Côn Cầu | `khucconcau` | Air hockey | wins | M |
| 77 | Pháo Thủ | `phaothu` | Artillery duel | wins | M |

### Đợt 8: game lớn (8, L)

| # | Game | id | Giống | Xếp hạng | Cỡ |
|---|---|---|---|---|---|
| 78 | Xì Tố | `xito` | Texas Hold'em, 3 máy | wins | L |
| 79 | Gin Rummy | `ginrummy` | Gin Rummy, 1 máy | wins | M |
| 80 | Bài Bích | `baibich` | Spades, 3 máy | wins | L |
| 81 | Cờ Vây | `covay` | Go 9×9, máy MCTS nhẹ | wins theo mức | L |
| 82 | Cờ Tào Cáo | `cotaocao` | Backgammon | wins | L |
| 83 | Bi-a | `bia` | 8-ball, vật lý 2D | wins | L |
| 84 | Mạt Chược Ghép | `matchuocghep` | Mahjong solitaire | time_low | M |
| 85 | Bài Tim | `baitim` | Hearts, 3 máy | wins | M |

Đợt này nên chia làm hai phiên; Xì Tố và Cờ Vây cần review máy chơi bằng tay (ván thử với người thật).

### Đợt 9: nốt phản xạ và giải đố (8)

| # | Game | id | Giống | Xếp hạng | Cỡ |
|---|---|---|---|---|---|
| 86 | Mê Cung | `mecung` | Maze, sinh ngẫu nhiên | time_low theo cỡ | S |
| 87 | Ghép Ba | `ghepba` | Match-3 | score_high | M |
| 88 | Mê Cung Ma | `mecungma` | Pac-man kiểu chung | score_high | M |
| 89 | Hạ Cánh | `hacanh` | Lunar lander | score_high | S |
| 90 | Chạy Vô Tận | `chayvotan` | Endless runner | score_high | M |
| 91 | Ghép Hình | `ghephinh` | Jigsaw từ hình SVG sinh sẵn | time_low | M |
| 92 | Phòng Không | `phongkhong` | Missile command | score_high | M |
| 93 | Thoát Xe | `thoatxe` | Rush hour | wins theo bàn | M |

### Đợt 10: về đích (7)

| # | Game | id | Giống | Xếp hạng | Cỡ |
|---|---|---|---|---|---|
| 94 | Sao Chiến | `saochien` | Star battle | time_low | M |
| 95 | Masyu | `masyu` | Masyu | time_low | M |
| 96 | Bất Đẳng | `batdang` | Futoshiki | time_low | S |
| 97 | Phản Xạ | `phanxa` | Aim / reaction trainer | score_high | S |
| 98 | Pinball | `pinball` | Pinball, vật lý 2D | score_high | L |
| 99 | Cột Ngọc | `cotngoc` | Columns | score_high | S |
| 100 | Cờ Tỷ Phú | `cotyphu` | Monopoly rút gọn, 3 máy | wins | L |

### Dự phòng (đổi vào khi một game ở trên bị kẹt)

Golf Mini, Bowling, Phi Tiêu (darts), Shogi, Cribbage, Golf Solitaire, Sudoku Sát Thủ (có thể là mode của Sudoku), Hộp Số (merge), Đua Xe nhìn từ trên, Quiz (cần nội dung).

## 6. Quy trình một đợt

1. Chủ dự án duyệt danh sách đợt (có thể đổi game bằng dự phòng).
2. `npm run new-game` cho từng game, giao mỗi agent một game với brief theo mẫu ở đợt vừa rồi (luật, mode, metric, khóa lưu, chuẩn mục 3); 4 agent song song, 2 lượt.
3. Mỗi agent trả: thư mục game hoàn chỉnh, `game.json` đủ `server`, test xanh, ảnh chụp 390×844 và 1280×800 hai theme đã tự xem.
4. Tích hợp: thêm id vào `games/order.json`, chạy `seed-sql` ra migration của đợt, `npm test`, `npm run build && npm run assemble && npm run e2e`.
5. Review nhanh từng game trên trình duyệt thật (điện thoại + máy tính), chơi một ván mỗi game.
6. Commit một lần cho cả đợt, push thẳng `main` (theo cách làm của repo), áp migration qua SQL Editor.
7. Tạo bộ sưu tập cho đợt trong admin (ví dụ "Cờ bàn", "Bài", "Logic Nhật") và một sự kiện cho game nổi nhất của đợt.

## 7. Rủi ro và cách xử lý

| Rủi ro | Xử lý |
|---|---|
| Máy chơi yếu ở Cờ Vây, Tào Cáo, Xì Tố, Bài Bích làm game chán | Chấp nhận AI "khá" (MCTS/heuristic), ghi rõ mức máy trên UI; sự kiện chỉ dùng mode máy mạnh nhất |
| Trùng tên thương hiệu | Chỉ dùng tên Việt thuần + tên chung tiếng Anh; không dùng Tetris, Wordle, Monopoly, Pac-Man, Uno, Ludo King… |
| Danh sách từ tiếng Anh (đợt 6) | Dùng bộ từ public domain (Wordle gốc, ENABLE); lọc từ nhạy cảm trước khi đưa vào |
| Trang chủ nặng khi có 100 preview | 4.2 và 4.7; đo Lighthouse ở mốc 50 |
| E2e lâu | E2e chung chạy song song; mốc 100 ước ~300 test, dưới 10 phút trên CI |
| Dist lớn | 4,7 MB cho 21 game, ước 20–25 MB cho 100; GitHub Pages cho phép 1 GB |
| Cày điểm ở game may rủi hoặc game quá dễ | Bảng điểm mục 4.8; giới hạn 20 ván/ngày/game đã có |
| Chất lượng game của agent không đều | Chuẩn mục 3 là bắt buộc; mỗi đợt review tay bước 5; game không đạt thì không vào đợt, đổi dự phòng |
| Supabase gói Free: số dòng `runs` | 100 game × người chơi hiện tại vẫn nhỏ; có cron dọn ván `abandoned` cũ nếu vượt 100.000 dòng |

## 8. Mốc kiểm tra

- **Sau đợt 0:** thêm một game thử bằng `new-game` chỉ cần tạo thư mục + một dòng trong `order.json` + chạy `seed-sql`; không file nào khác của cổng thay đổi. — Đạt ngày 2026-10-23 (thử với game `demo`: e2e tự có 3 test, toàn bộ test xanh).
- **Mốc 50 game (sau đợt 4):** Lighthouse trang chủ điện thoại ≥ 85; e2e < 6 phút; xem lại 4.7 có cần thêm gì. — Đạt ngày 2026-10-24 (53 game): Lighthouse 13.5 điện thoại, server có gzip như GitHub Pages, trung vị 5 lần: Performance 85 (simulate) / 87 (devtools), Accessibility 92, Best practices 100, SEO 100; e2e 281 test trong 1,2–2 phút. Lúc đầu chỉ 57–60 (37–42 khi không nén); đã sửa: supabase-js tải lười, trang phụ tải lười, preview game cũ dựng khi cuộn tới, trang chủ chỉ dựng 24 thẻ, React dựng trong transition, bỏ hai chỗ ép tính layout lúc mount, logo màn chờ hiện ngay, Spotlight không mờ dần. 4.7 chưa cần thêm gì.
- **Mốc 100:** cập nhật README, mô tả meta/manifest, bài viết "100 game" trên trang tin, sự kiện kỷ niệm.

## 9. Để lại cho người làm quyết định

- Cấu trúc nội bộ của `_kit` (một file hay vài module) và cách version.
- Cách sinh đề có lời giải duy nhất cho từng game đợt 5 (thuật toán tùy game).
- Mức máy cụ thể cho từng game đối kháng, miễn là có ít nhất hai mức.
- Thứ tự game trong một đợt.
