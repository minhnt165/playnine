# Chia Ô

Game Chia Ô (Rectangles, thể loại Shikaku) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Chia toàn bộ lưới thành các hình chữ nhật (hình vuông cũng được), không chồng nhau, không bỏ sót ô.
- Mỗi hình chứa **đúng một số**, và số đó bằng **diện tích** của hình (số 6: hình 1x6 hoặc 2x3).
- Phủ kín lưới bằng các hình đúng luật là thắng. Đề nào cũng có **đúng một lời giải**, giải được bằng suy luận.

## Điều khiển

- **Chuột / chạm:** kéo từ một góc sang góc đối diện để vẽ hình. Khi kéo, khung xem trước hiện diện tích (và kích thước); bật "Báo lỗi" thì khung xanh khi hình đúng luật, đỏ khi sai. Vẽ đè lên hình cũ sẽ thay các hình bị chồng. Chạm vào một hình để xóa nó; chạm ô số 1 còn trống để vẽ hình 1x1.
- **Bàn phím:** phím mũi tên chọn ô, `Enter` / `Space` đặt góc thứ nhất, đi tới góc kia rồi `Enter` lần nữa để vẽ (`Esc` bỏ góc). Hai góc trùng nhau tính như chạm ô.
- Hình đúng luật (một số, đủ diện tích) có màu riêng theo số của nó: 8 màu, hai hình kề nhau của lời giải luôn khác màu, mỗi giao diện sáng / tối một bộ màu. Hình sai luật có sọc đỏ, số trong đó chuyển đỏ (khi bật "Báo lỗi").
- **Hoàn tác / làm lại** không giới hạn (cả vẽ đè, xóa, xóa hết, gợi ý), lưu cùng ván dở.
- **Gợi ý:** đặt giúp một hình của lời giải, ưu tiên sửa chỗ đang sai. Ván có dùng gợi ý gửi `assisted: true` và không ghi kỷ lục.
- Đồng hồ chạy từ khi đề hiện ra, dừng khi tab ẩn hoặc mở hộp thoại (bàn bị làm mờ lúc đó để không nghĩ trước được).

## Cấp độ (mode)

| Mode | Lưới | Số hình (10 000 đề) | Điểm cổng |
| --- | --- | --- | --- |
| `s` Dễ | 7x7 | 7–17, trung bình 11,3 | 4 |
| `m` Vừa | 10x10 | 10–27, trung bình 16,9 | 6 |
| `l` Khó | 13x13 | 15–35, trung bình 23,7 | 8 |

Đổi cỡ bằng huy hiệu cỡ bàn cạnh tên game hoặc trong Cài đặt; đề đang dở thì hỏi trước (bỏ đề tính là thua).

## Sinh đề

`engine.js` sinh đề ngẫu nhiên theo hạt giống (mulberry32):

1. Chia lưới thành các hình ngẫu nhiên (quét ô trống đầu tiên theo hàng, hình lớn dễ được chọn hơn, giới hạn diện tích và độ dẹt theo cỡ; ô lẻ 1x1 được gộp vào hình mảnh kề bên nếu được).
2. Đặt số của mỗi hình ở một ô ngẫu nhiên trong hình.
3. Solver (Algorithm X với dancing links: cột = mỗi số + mỗi ô, hàng = hình ứng viên) đếm nghiệm, dừng ở 2. Còn nghiệm khác thì dời số của một hình khác nhau sang ô chỉ thuộc hình gốc (nghiệm kia hết hợp lệ), lặp đến khi chỉ còn một nghiệm.

Thời gian sinh đề đo trong Node (máy phát triển, 3 000 hạt giống mỗi cỡ): 7x7 trung bình 0,04 ms (chậm nhất 1,9 ms), 10x10 0,08 ms (0,6 ms), 13x13 0,12 ms (1,0 ms). Kể cả máy chậm gấp 20 lần vẫn dưới 30 ms, xa mức 300 ms, nên không cần đề sinh sẵn.

## Ghi điểm trên cổng

- `metric: time_low`, mỗi cỡ một mode (`s`, `m`, `l`), điểm 4 / 6 / 8.
- `min_time_ms`: 1400 / 2000 / 3000 = số hình ít nhất của đề cỡ đó (7 / 10 / 15, đo trên 10 000 đề) × 200 ms cho mỗi lần kéo, tức nhanh hơn cả người đã biết sẵn lời giải.
- Đề mới: `kit.sdk.start(mode)`; mở lại đề lưu dở: `kit.sdk.start(mode, true)`.
- Thắng: `kit.sdk.end({ mode, won: true, timeMs, assisted })` (`assisted` = đã dùng gợi ý).
- Bỏ đề đã đi ít nhất một nước (đề mới, đổi cỡ): `won: false`; chưa đi nước nào thì không gửi gì.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-chiao-settings-v1` | Cài đặt: giao diện, cỡ bàn (`size`), báo lỗi (`errors`, mặc định bật) |
| `playnine-chiao-stats-v1` | Thống kê: số ván, số lần giải, chuỗi thắng, số gợi ý đã dùng, kỷ lục từng cỡ (ms) |
| `playnine-chiao-save-v1` | Đề đang chơi dở: các số, hình đã vẽ, lịch sử hoàn tác / làm lại, số nước, số gợi ý, đồng hồ |
| `playnine-chiao-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Ván lưu hỏng (sai dạng, đề không có lời giải duy nhất, hình chồng nhau, lịch sử không khớp bàn) bị bỏ và chia đề mới. Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `→` `↑` `↓` | Chọn ô (đang đặt góc thì mở rộng hình) |
| `Enter` / `Space` | Đặt góc thứ nhất / vẽ hình |
| `Esc` | Bỏ góc đang đặt; đóng hộp thoại |
| `Delete` / `Backspace` / `X` | Xóa hình ở ô đang chọn |
| `Z` / `Ctrl+Z` | Hoàn tác |
| `Y` / `Ctrl+Y` / `Ctrl+Shift+Z` | Làm lại |
| `H` | Gợi ý |
| `N` | Đề mới |

## Kiểm tra

```bash
node test.js
```

Phủ: solver (đối chứng với một solver vét cạn viết khác trên 400 đề ngẫu nhiên có cả đề vô nghiệm và nhiều nghiệm), luật hình hợp lệ, vẽ đè, xóa, xóa hết, hoàn tác / làm lại, thắng, gợi ý, tô màu, sinh đề duy nhất nghiệm cho cả ba cỡ (40 hạt giống mỗi cỡ), tốc độ sinh đề, lưu / khôi phục và từ chối dữ liệu hỏng.

`e2e.spec.ts` (chạy trong cổng cùng e2e chung): thắng bằng kéo hình cuối từ ván lưu dựng sẵn, thắng có gợi ý (`assisted: true`), bỏ đề đã đi nước (`won: false`), đổi cỡ trước nước đầu không gửi `pn:end`.
