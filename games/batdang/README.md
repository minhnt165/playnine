# Bất Đẳng

Game Bất Đẳng (Inequality, thể loại Futoshiki) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Lưới N×N (5, 6 hoặc 7). Điền vào mỗi ô một số từ 1 đến N sao cho **mỗi hàng và mỗi cột không có số trùng** (hình vuông Latin).
- Giữa một số cặp ô kề nhau có dấu bất đẳng thức: `<` `>` giữa hai ô cùng hàng, `∧` `∨` giữa hai ô cùng cột. Phía mở của dấu quay về số lớn hơn (`∧`: ô trên nhỏ hơn ô dưới). Mọi dấu phải đúng.
- Vài ô cho sẵn số (nền xám, không sửa được). Điền kín bàn, đúng mọi luật là thắng. Đề nào cũng có **đúng một lời giải** và giải được bằng suy luận, không phải đoán.

## Điều khiển

- Chạm một ô để chọn (hàng, cột của ô được tô nhạt, các ô cùng số sáng lên), rồi chạm số ở bàn số. Chạm lại đúng số đang có trong ô thì xóa số đó.
- **Ghi chú**: bật nút Ghi chú (hoặc phím `N` / `Space`, hoặc giữ `Shift` khi gõ số) để viết nhiều số nhỏ vào một ô. Tùy chọn **Tự xóa ghi chú** (Cài đặt, mặc định bật): điền một số thì xóa số đó khỏi ghi chú cùng hàng, cùng cột.
- **Hoàn tác / Làm lại** không giới hạn (lưu cả khi đóng trang).
- **Gợi ý**: còn ô điền sai (so với lời giải) thì sửa ô đó trước, ưu tiên ô đang chọn; không có ô sai thì điền một ô trống suy ra được sớm nhất từ những gì đang có trên bàn (ưu tiên ô đang chọn nếu nó cũng suy ra được ngay). Lần đầu trong đề sẽ hỏi lại; đề đã dùng gợi ý gửi `assisted: true` và không tính kỷ lục trong máy.
- **Báo lỗi** (Cài đặt): tô đỏ ô trùng số trong hàng / cột và dấu có hai ô đã điền nhưng sai (kể cả hai số bằng nhau). Mặc định "Chỉ mức Dễ"; có thể chọn Luôn bật / Tắt. Báo lỗi chỉ dựa trên luật, không so với lời giải.
- Dấu vẽ bằng hình chữ V (SVG) màu cam, nằm ở khe giữa hai ô nên không lẫn với số; dấu sai chuyển đỏ.
- Lần đầu mở game hiện hộp Cách chơi. Đồng hồ dừng (và bàn mờ đi) khi đang mở hộp thoại hoặc tab bị ẩn.

## Mode

| Mode | Lưới | Mức suy luận cần dùng | Số cho sẵn | Dấu | Ô trống | Điểm | `min_time_ms` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `5` | 5×5 Dễ | mức 1, trả thêm 3 dấu | 1–4 | 8–16 | 21–24 | 3 | 4000 |
| `6` | 6×6 Vừa | mức 1, tối giản | 2–8 | 7–20 | 28–34 | 5 | 5500 |
| `7` | 7×7 Khó | **cần** mức 2 (cặp lộ / cặp ẩn), tối giản | 2–8 | 13–31 | 41–47 | 8 | 8000 |
| `daily` | 6×6, đề chung theo ngày | mức 1, trả thêm 1 dấu | 2–8 | 6–20 | 28–34 | 5 | 5500 |

(Số cho sẵn / dấu / ô trống đo trên 500 seed mỗi mode.) Độ khó còn đo bằng số vòng lan truyền cần để giải kín: trung bình 6 (5×5), 10 (6×6), 18 (7×7); `test.js` kiểm tra thứ tự này.

Chọn mode ở thanh dưới số liệu. Đề đang dở (đã đi ít nhất một nước) thì hỏi trước, vì bỏ đề tính là thua. **Đề hằng ngày**: seed = băm của `batdang:` + ngày giờ địa phương (`YYYY-MM-DD`), mọi người cùng một đề; giải xong thì nút hiện ✓ + thời gian, hôm đó không chơi lại được; thống kê có chuỗi ngày liên tiếp, tóm tắt cho cổng có mục `daily`.

## Sinh đề

Trong `engine.js`, tất định theo seed (PRNG mulberry32):

1. Sinh hình vuông Latin ngẫu nhiên (điền từng ô, thử số theo thứ tự ngẫu nhiên, quay lui khi kẹt).
2. Đặt **mọi** số cho sẵn và **mọi** dấu, rồi bớt dần: trước hết bớt số cho sẵn (trừ `keep` ô giữ lại để đề luôn có vài số), sau đó bớt dấu, theo thứ tự ngẫu nhiên. Mỗi lần bớt chỉ giữ thay đổi nếu đề vẫn **giải kín được bằng suy luận** ở mức của mode. Suy luận chỉ loại bỏ khả năng sai nên giải kín được thì lời giải là duy nhất.
   - Mức 1: ô đã chốt loại số khỏi hàng / cột; số chỉ còn một chỗ trong hàng / cột; kẹp theo dấu (ô nhỏ < số lớn nhất của ô lớn và ngược lại, lặp lại nên lan dọc cả chuỗi dấu).
   - Mức 2: thêm cặp lộ và cặp ẩn trong hàng / cột.
3. Mode Dễ / hằng ngày trả lại vài dấu đã bớt (thêm manh mối không làm mất tính duy nhất).
4. Kiểm độ khó: quá trần số cho sẵn, hoặc mode 7×7 mà mức 1 đã giải xong (đề không cần mức 2), thì đục lại từ đầu (tối đa 7 lần cho điều kiện mức 2).

`test.js` kiểm tra bằng **bộ giải quay lui đếm nghiệm** (lan truyền mức 1 + rẽ nhánh ở ô ít ứng viên nhất, dừng ở 2) trên 60 / 40 / 30 / 15 seed cho `5` / `6` / `7` / `daily`: luôn đúng một nghiệm và trùng lời giải. Bộ giải được đối chiếu với phép đếm vét cạn trên toàn bộ 576 hình vuông Latin 4×4 với 300 bộ manh mối ngẫu nhiên (có đủ đề 0, 1 và nhiều nghiệm).

Thời gian sinh một đề (mục tiêu < 300 ms cho cỡ lớn nhất trên máy chậm):

| Mode | Node 24, máy bàn, 500 seed: trung vị / p90 / p99 / chậm nhất | Chromium giả lập CPU chậm 4 lần, 100 seed: trung vị / p90 / p98 / chậm nhất |
| --- | --- | --- |
| `5` | 0,3 / 0,4 / 0,7 / 3,5 ms | 2 / 6 / 24 / 26 ms |
| `6` | 0,7 / 0,9 / 1,2 / 1,3 ms | 5 / 8 / 11 / 19 ms |
| `7` | 3,4 / 8,0 / 15,9 / 22,1 ms | 23 / 63 / 119 / 124 ms |
| `daily` | 0,7 / 0,8 / 1,3 / 1,4 ms | 7 / 16 / 25 / 42 ms |

## Báo ván cho cổng

- Mỗi cỡ một mode (`5`, `6`, `7`) và `daily`, metric `time_low`; đồng hồ chạy từ lúc chia đề và dừng khi trang ẩn hoặc đang mở hộp thoại.
- Chia đề mới: `kit.sdk.start(mode)`; mở lại ván lưu dở: `kit.sdk.start(mode, true)`.
- Giải xong: `kit.sdk.end({ mode, won: true, timeMs, assisted })` (`assisted` = đã dùng gợi ý).
- Bỏ đề đã đi ít nhất một nước (đề mới / đổi mode): gửi `won: false`; đề chưa đi nước nào thì không gửi gì.
- Chống gian lận: `min_time_ms` = số ô trống ít nhất của mode (N² trừ trần số cho sẵn: 25 − 4 = 21, 36 − 8 = 28, 49 − 9 = 40) × 200 ms mỗi ô (chọn ô + chạm số, khoảng 100 ms mỗi thao tác cho người đã biết sẵn đáp án), làm tròn xuống: `5` 4000, `6` 5500, `7` 8000, `daily` 5500.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-batdang-settings-v1` | Cài đặt: giao diện, cỡ đề gần nhất (`size`), báo lỗi (`errors`: `auto` / `on` / `off`), tự xóa ghi chú (`autoNotes`), đã xem hướng dẫn (`guideSeen`) |
| `playnine-batdang-stats-v1` | Thống kê: số ván, số ván giải, số ván giải không gợi ý, kỷ lục từng mode (chỉ ván không gợi ý), thời gian đề hằng ngày theo ngày (400 ngày gần nhất) |
| `playnine-batdang-save-v1` | Ván đang chơi dở: đề, lời giải, số đã điền, ghi chú, hoàn tác / làm lại, số gợi ý, ngày (đề hằng ngày), đồng hồ |
| `playnine-batdang-summary-v1` | Tóm tắt cho thẻ game trên cổng (kỷ lục, chơi tiếp, đề hằng ngày + chuỗi ngày) |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng hoặc sai luật (`fromJSON` trả `null`: lời giải không phải Latin, manh mối không khớp lời giải, đề không còn nghiệm duy nhất, số ngoài 1..N, sửa ô cho sẵn, lịch sử hỏng…) thì bỏ và chia đề mới.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `↓` `→` | Chọn ô |
| `1`–`7` | Điền số (tới N) |
| `Shift` + số | Bật / tắt ghi chú số đó |
| `N` / `Space` | Bật / tắt chế độ ghi chú |
| `Backspace` / `Delete` / `0` | Xóa ô |
| `Z` / `Ctrl+Z` | Hoàn tác |
| `Y` / `Ctrl+Y` / `Ctrl+Shift+Z` | Làm lại |
| `H` | Gợi ý |
| `Esc` | Đóng hộp thoại |

Đề mới bằng nút ↻ ở thanh trên (phím `N` dành cho ghi chú).

## Kiểm tra

```bash
node test.js          # luật, bộ giải (đối chiếu vét cạn 4×4), sinh đề duy nhất + thời gian, chơi, gợi ý, lưu / khôi phục
```

`e2e.spec.ts` (chạy cùng e2e chung của repo): ván lưu dựng sẵn còn một ô, điền ô đó thì cổng nhận `pn:end` thắng; bỏ đề đã đi nước thì `won: false`; đổi mode trước nước đầu thì không gửi `pn:end`.
