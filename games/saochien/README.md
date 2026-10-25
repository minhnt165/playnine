# Sao Chiến

Game Sao Chiến (Star Battle) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

Lưới n x n chia thành n vùng (tô màu nhạt, viền dày). Đặt sao sao cho:

1. Mỗi hàng và mỗi cột có đúng k sao (k ghi trên nút cỡ đề: 1★ hoặc 2★).
2. Mỗi vùng cũng có đúng k sao.
3. Hai sao không chạm nhau, kể cả chạm góc.

Đặt đủ sao đúng ba luật là thắng (đề có đúng một lời giải nên đó chính là lời giải). Dấu chấm chỉ là ghi chú "ô này không có sao", không ảnh hưởng thắng thua.

## Điều khiển

- Chạm / bấm một ô: trống → **chấm** → **sao** → trống. Cài đặt "Khi chạm một ô" = "Ra sao ngay" đổi thành trống → sao → chấm → trống.
- **Kéo** qua nhiều ô: đánh chấm cả loạt (bắt đầu từ ô có chấm thì xóa chấm); sao không bị đụng tới. Cả lần kéo là một nước (một lần hoàn tác).
- Chuột phải: bật / tắt chấm.
- **Tự chấm quanh sao** (Cài đặt, mặc định bật): đặt sao thì 8 ô quanh được chấm (chấm tự động, nhạt hơn); gỡ sao thì các chấm tự động không còn kề sao nào khác cũng được gỡ.
- **Hoàn tác / Làm lại** không giới hạn (lịch sử lưu cùng ván dở).
- **Gợi ý**: sửa một lỗi trước (sao sai → chấm, chấm đè lên sao của lời giải → sao); không có lỗi thì đặt một sao suy ra được bằng suy luận lan truyền từ các dấu hiện có; không suy ra được thì đặt một sao của lời giải ở hàng / cột / vùng còn ít chỗ nhất. Ván có dùng gợi ý gửi `assisted: true` và không tính kỷ lục trong máy.
- **Báo lỗi** (Cài đặt, mặc định bật): sao chạm nhau hoặc nằm trong hàng / cột / vùng thừa sao tô đỏ; vùng thừa sao hoặc đã hết ô trống để đặt đủ sao có sọc đỏ; số đếm ở mép đỏ khi hàng / cột thừa sao hoặc hết chỗ.
- Số nhỏ ở mép phải (theo hàng) và mép dưới (theo cột): số sao còn thiếu; ✓ khi đủ, `+1` khi thừa.
- Đồng hồ chạy từ lúc đề hiện ra, dừng khi mở hộp thoại hoặc ẩn tab; lúc dừng vì hộp thoại thì bàn bị làm mờ để không xem đề "miễn phí".
- Vùng phân biệt chủ yếu bằng viền dày (vẽ bằng lớp SVG phủ trên lưới), màu nhạt chỉ để phụ: người mù màu vẫn đọc được bàn.

## Cỡ đề (mode)

| Mode | Cỡ | Sao mỗi hàng / cột / vùng | Mức | Điểm trên cổng | `min_time_ms` |
| --- | --- | --- | --- | --- | --- |
| `5` (mặc định) | 5x5 | 1 | Dễ | 3 | 700 |
| `8` | 8x8 | 1 | Vừa | 6 | 1100 |
| `10` | 10x10 | 2 | Khó | 10 | 2800 |
| `daily` | 8x8 | 1 | Đề hằng ngày | 6 | 1100 |

Đổi cỡ bằng thanh chọn ngay dưới HUD (hoặc phím `1`–`4`). Đề đang dở (đã đi ít nhất một nước) thì hỏi trước vì bỏ đề tính là thua.

**Đề hằng ngày**: seed = băm FNV-1a của `saochien-daily-YYYY-MM-DD` (ngày theo giờ máy người chơi), mọi người cùng một đề mỗi ngày. Giải xong thì nút "Hằng ngày" hiện ✓ + thời gian, chọn lại chỉ báo thời gian đã giải; thống kê có chuỗi ngày liên tiếp, tóm tắt cho cổng có mục `daily`.

## Sinh đề

Theo seed (PRNG mulberry32), tất định:

1. Đặt sao hợp lệ ngẫu nhiên (quay lui theo hàng: mỗi hàng k cột không kề nhau, không kề sao hàng trên, cột không quá k sao).
2. Dựng vùng lớn dần ngẫu nhiên quanh các sao: k = 1 thì mỗi sao là hạt của một vùng; k = 2 thì dựng 2n vùng con rồi ghép cặp các vùng con kề nhau (quay lui) thành n vùng, mỗi vùng đúng 2 sao.
3. Bộ giải đếm nghiệm (dừng ở 2). Còn nghiệm khác thì lấy một ô có sao trong nghiệm lạ mà lời giải không có, chuyển ô đó sang một vùng kề (vùng cũ vẫn liên thông): nghiệm lạ hỏng, lời giải gốc vẫn đúng. Lặp tới khi đúng một nghiệm (quá 6n lần thì dựng vùng lại).

Bộ giải: suy luận lan truyền (sao → 8 ô quanh trống; hàng / cột / vùng đủ k sao → ô còn lại trống; số ô chưa biết vừa đủ → tất cả là sao) rồi rẽ nhánh ở ô đầu của hàng / cột / vùng còn ít lựa chọn nhất. Đếm nghiệm một đề 10x10 hai sao mất khoảng 1 ms.

**Bộ đề sinh sẵn cho 10x10.** Sinh ngay 10x10 hai sao trung bình ~29 ms nhưng có đề tới ~230 ms trên máy bàn (điện thoại chậm gấp ~10 lần, vượt mục tiêu 300 ms). Vì vậy cỡ này lấy từ `puzzles.js`: 400 đề do `tools/build-puzzles.js` sinh bằng chính bộ sinh trên (seed 1, 2, 3…, bỏ đề trùng kể cả sau xoay / lật). Seed của ván chọn một đề và một trong 8 phép xoay / lật (giữ nguyên tính một nghiệm), nên có 3200 bàn khác nhau; engine chạy lại bộ giải để lấy lời giải. Sinh lại bộ đề: `node tools/build-puzzles.js [số đề]` (khoảng 10 giây cho 400 đề).

Tốc độ đo trong Node (máy bàn, `node test.js`):

| Cỡ | Cách lấy đề | Trung bình | Chậm nhất |
| --- | --- | --- | --- |
| 5x5 | sinh ngay (1000 seed) | 0,03 ms | 0,2 ms |
| 8x8 / hằng ngày | sinh ngay (300 seed) | 0,84 ms | 7 ms |
| 10x10 | bộ đề + xoay / lật + giải lại (300 seed) | 1,0 ms | 5 ms |

Điện thoại chậm (chậm hơn khoảng 10 lần) vẫn dưới 100 ms ở mọi cỡ.

## Ghi điểm trên cổng

- Metric `time_low`, mỗi cỡ một mode + `daily`. Đề mới: `kit.sdk.start(mode)`; mở lại đề lưu dở: `kit.sdk.start(mode, true)`.
- Thắng: `kit.sdk.end({ mode, won: true, timeMs, assisted })` (`assisted` = đã dùng gợi ý).
- Bỏ đề đã đi ít nhất một nước (Ván mới hoặc đổi cỡ, có hỏi xác nhận): `won: false`. Đề chưa đi nước nào thì không gửi gì.
- `min_time_ms` = số sao của lời giải × 150 ms (thao tác tối thiểu: chế độ "Ra sao ngay" mỗi sao một lần chạm, chấm không bắt buộc), làm tròn xuống một chút: 5 / 8 / 20 sao → 750 / 1200 / 3000 ms → đặt 700 / 1100 / 2800 ms; đề hằng ngày 8x8 như 8x8.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-saochien-settings-v1` | Cài đặt: giao diện, cỡ đề gần nhất `size` (`'5'` / `'8'` / `'10'`), báo lỗi `errors`, tự chấm quanh sao `auto`, thứ tự chạm `order` (`'dot'` / `'star'`), đã xem hướng dẫn `guideSeen` |
| `playnine-saochien-stats-v1` | Thống kê: đã chơi, đã giải, chuỗi thắng, kỷ lục từng mode (chỉ đề không dùng gợi ý), thời gian đề hằng ngày theo ngày (giữ 400 ngày) |
| `playnine-saochien-save-v1` | Đề đang dở (chỉ khi đã đi ít nhất một nước): `{ v, game, elapsed }`, `game` gồm mode, seed, ngày, bảng vùng, dấu, số nước, số gợi ý, lịch sử hoàn tác / làm lại |
| `playnine-saochien-summary-v1` | Tóm tắt cho thẻ game trên cổng (có mục `daily`) |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng, khác phiên bản, bảng vùng sai (thiếu ô, vùng rời) hoặc không có đúng một nghiệm (engine giải lại khi mở), hay đề hằng ngày có seed không khớp ngày thì bị bỏ và chia đề mới.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `↑` `↓` `←` `→` | Di chuyển ô đang chọn |
| `Space` / `Enter` | Chạm ô đang chọn (xoay vòng dấu theo Cài đặt) |
| `S` / `*` | Bật / tắt sao |
| `X` / `.` | Bật / tắt chấm |
| `Backspace` / `Delete` / `0` | Xóa dấu |
| `Z` / `U` / `Ctrl+Z` | Hoàn tác |
| `Y` / `R` / `Ctrl+Y` / `Ctrl+Shift+Z` | Làm lại |
| `H` | Gợi ý |
| `1` – `4` | Chọn 5x5 / 8x8 / 10x10 / Hằng ngày |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test engine phủ luật, bộ đếm nghiệm trên đề tay biết trước (1 / 2 / 0 nghiệm) và so với vét cạn trên 300 bảng vùng ngẫu nhiên, sinh đề một nghiệm trên nhiều seed cho mọi cỡ và đề hằng ngày, từng đề trong bộ đề sinh sẵn, tính tất định, tốc độ sinh đề, chơi (xoay vòng hai thứ tự, chấm tự động, kéo chấm, hoàn tác / làm lại), báo lỗi, thắng, gợi ý (tới khi thắng), lưu / khôi phục và từ chối ván hỏng. Test trong cổng: `e2e.spec.ts` (ván thắng, bỏ đề, đổi cỡ trước nước đầu).
