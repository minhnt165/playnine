# Hitori

Game Hitori của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

Lưới số n x n. Tô đen một số ô sao cho:

1. Giữa các ô không tô, không số nào lặp lại trong một hàng hay một cột.
2. Hai ô đen không kề nhau theo cạnh (chạm góc thì được).
3. Mọi ô không tô liền thành một khối (đi qua cạnh).

Đúng cả ba luật là thắng. Ô khoanh tròn chỉ là ghi chú "chắc chắn trắng", tính như ô trắng.

**Một lời giải.** Engine đếm nghiệm theo ba luật cộng điều kiện "ô đen nào cũng cần thiết" (số của nó còn ở một ô trắng cùng hàng / cột, tức bỏ tô ô đó sẽ sinh số trùng); đề sinh ra có đúng một nghiệm như vậy. Hệ quả: mọi cách tô hợp ba luật đều chứa đúng các ô đen của lời giải, có thể thêm vài ô tô thừa vô hại (bỏ dần các ô thừa vẫn giữ ba luật và về lời giải duy nhất). Vì thế game chấp nhận mọi cách tô đúng ba luật là thắng, và người chơi không bao giờ kẹt ở trạng thái "đúng luật mà chưa thắng".

## Điều khiển

- Chạm / bấm một ô: bình thường → **tô đen** → **khoanh tròn** → bình thường.
- Chuột phải hoặc nhấn giữ (điện thoại): bật / tắt khoanh tròn ngay.
- **Hoàn tác / Làm lại** không giới hạn (lịch sử lưu cùng ván dở).
- **Gợi ý**: sửa một ô đánh dấu sai (đen mà phải trắng → khoanh tròn; khoanh tròn mà phải đen → tô đen), không có ô sai thì tô một ô đen còn thiếu. Ván có dùng gợi ý gửi `assisted: true` và không tính kỷ lục trong máy.
- **Báo lỗi** (Cài đặt, mặc định bật): ô đen kề nhau và hai ô khoanh tròn trùng số tô đỏ; ô trắng bị tách khỏi khối lớn nhất có sọc đỏ; số còn trùng có chấm hổ phách nhỏ; ô trùng số với một ô khoanh tròn (chắc chắn phải tô) có số và viền hổ phách.
- Đồng hồ chạy từ lúc đề hiện ra, dừng khi mở hộp thoại hoặc ẩn tab; lúc dừng vì hộp thoại thì bàn bị làm mờ để không xem đề "miễn phí".

## Cỡ đề (mode)

| Mode | Cỡ | Mức | Ô đen trong lời giải | Điểm trên cổng | `min_time_ms` |
| --- | --- | --- | --- | --- | --- |
| `5` (mặc định) | 5x5 | Dễ | 5–9 | 4 | 700 |
| `7` | 7x7 | Vừa | 12–16 | 6 | 1700 |
| `9` | 9x9 | Khó | 20–25 | 9 | 2800 |

Đổi cỡ bằng thanh chọn ngay dưới HUD. Đề đang dở (đã đi ít nhất một nước) thì hỏi trước vì bỏ đề tính là thua.

## Sinh đề

Theo seed (PRNG mulberry32): hình vuông Latin ngẫu nhiên → chọn ô đen ngẫu nhiên (không kề nhau, phần trắng liên thông, khoảng 27–36% số ô) → đổi số ở mỗi ô đen thành số của một ô trắng cùng hàng / cột → bộ giải đếm nghiệm (dừng ở 2), chỉ nhận đề một nghiệm; không được thì đổi số / đổi mẫu ô đen / đổi hình vuông Latin.

Bộ giải: suy luận lan truyền (ô đen → ô kề trắng; ô trắng → ô cùng số cùng hàng / cột đen; ô đen cần thiết; ô không trùng số với ai thì trắng) + Tarjan cho luật liên thông (ô chưa biết là điểm khớp ngăn hai ô trắng thì phải trắng, ô không nối được tới vùng trắng thì phải đen), rồi rẽ nhánh.

Tốc độ đo trong Node (máy bàn, 5000 seed mỗi cỡ): 5x5 trung bình 0,04 ms, 7x7 0,1 ms, 9x9 0,22 ms / đề, chậm nhất khoảng 1 ms. Điện thoại chậm (chậm hơn khoảng 10 lần) vẫn dưới 15 ms, xa mục tiêu 300 ms nên không cần `puzzles.js` sinh sẵn.

## Ghi điểm trên cổng

- Metric `time_low`, mỗi cỡ một mode. Đề mới: `kit.sdk.start(mode)`; mở lại đề lưu dở: `kit.sdk.start(mode, true)`.
- Thắng: `kit.sdk.end({ mode, won: true, timeMs, assisted })` (`assisted` = đã dùng gợi ý).
- Bỏ đề đã đi ít nhất một nước (Ván mới hoặc đổi cỡ, có hỏi xác nhận): `won: false`. Đề chưa đi nước nào thì không gửi gì.
- `min_time_ms` = số thao tác tối thiểu × 150 ms, làm tròn xuống một chút: lời giải ít ô đen nhất gặp trong 5000 seed là 5 / 12 / 20 ô (mỗi ô một lần chạm, khoanh tròn không bắt buộc) → 750 / 1800 / 3000 ms → đặt 700 / 1700 / 2800 ms.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-hitori-settings-v1` | Cài đặt: giao diện, cỡ đề `size` (`'5'` / `'7'` / `'9'`), báo lỗi `errors`, đã xem hướng dẫn `guideSeen` |
| `playnine-hitori-stats-v1` | Thống kê: đã chơi, đã giải, chuỗi thắng, kỷ lục từng cỡ (chỉ đề không dùng gợi ý) |
| `playnine-hitori-save-v1` | Đề đang dở (chỉ khi đã đi ít nhất một nước): `{ v, game, elapsed }`, `game` gồm lưới, dấu, số nước, số gợi ý, lịch sử hoàn tác / làm lại |
| `playnine-hitori-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng, khác phiên bản hoặc lưới không có đúng một nghiệm (engine giải lại khi mở) thì bị bỏ và chia đề mới.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `↑` `↓` `←` `→` | Di chuyển ô đang chọn |
| `Space` / `Enter` | Chạm ô đang chọn (đen → khoanh tròn → xóa) |
| `X` / `B` / `1` | Bật / tắt tô đen |
| `O` / `C` / `2` | Bật / tắt khoanh tròn |
| `Backspace` / `Delete` / `0` | Xóa dấu |
| `Z` / `U` / `Ctrl+Z` | Hoàn tác |
| `Y` / `R` / `Ctrl+Y` / `Ctrl+Shift+Z` | Làm lại |
| `H` | Gợi ý |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test engine phủ luật (xoay vòng dấu, hoàn tác / làm lại, vi phạm), thắng / chưa thắng, bộ đếm nghiệm so với vét cạn trên 400 lưới 4x4, sinh đề một nghiệm trên nhiều seed cho cả ba cỡ, gợi ý, tốc độ sinh đề, lưu / khôi phục và từ chối ván hỏng (kể cả lưới bị sửa thành nhiều nghiệm). Test trong cổng: `e2e.spec.ts` (ván thắng, bỏ đề, đổi cỡ trước nước đầu).
