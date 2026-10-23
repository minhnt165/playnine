# Đẩy Thùng

Game Đẩy Thùng (Box Pusher) của PlayNine: giải đố nhà kho, đẩy mọi thùng vào đích. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Bàn gồm tường, sàn, thùng và đích (vòng tròn). Số thùng bằng số đích.
- Người đi lên / xuống / trái / phải một ô. Đi vào ô có thùng thì đẩy thùng tiến một ô theo hướng đó, nếu phía sau thùng là sàn trống.
- Chỉ đẩy được, không kéo được; không đẩy được hai thùng liền nhau hay thùng sát tường.
- Qua màn khi mọi thùng nằm trên đích (thùng chuyển màu xanh lá).
- Đếm số bước (mọi lần đi) và số lần đẩy. Mỗi màn lưu kỷ lục là kết quả ít bước nhất (bằng bước thì ít lần đẩy hơn).
- **Hoàn tác** (không giới hạn) lấy lại lần đẩy gần nhất cùng các bước đi sau nó; chưa đẩy lần nào thì về chỗ xuất phát. **Chơi lại** bắt đầu lại màn. Cả hai là một phần của trò chơi, không tính là trợ giúp.

## Màn chơi

- 36 màn tự thiết kế, xếp theo độ khó tăng dần: 1 thùng (màn 1–3), 2 thùng (4–9), 3 thùng (10–18), 4 thùng (19–28), 5 thùng (29–36).
- Màn được sinh bằng máy rồi chọn tay: dựng phòng ngẫu nhiên, đặt đích, kéo ngược thùng từ đích (BFS) để tìm thế cần nhiều lần đẩy nhất, rồi chọn theo số lần đẩy tối thiểu và độ rộng không gian tìm kiếm. Không chép bộ màn của bên thứ ba.
- Lưu trong `engine.js` (`LEVELS`) dạng chuỗi theo ký hiệu chuẩn, các hàng nối bằng `|`: `#` tường, `@` người, `$` thùng, `.` đích, `*` thùng trên đích, `+` người trên đích, dấu cách là sàn. Ghi chú cuối mỗi dòng: số thùng / số lần đẩy tối thiểu.
- Chọn màn: mở được mọi màn đã giải và màn chưa giải đầu tiên. Giải xong một màn thì màn tiếp theo được mở.

## Điều khiển

- Bàn phím: phím mũi tên hoặc `WASD` để đi.
- Chuột / chạm: vuốt trên bàn để đi một bước; chạm một ô sàn để tự đi tới đó theo đường ngắn nhất (không đẩy thùng); chạm thùng ngay cạnh người để đẩy nó.
- Nút dưới bàn: Hoàn tác, Chơi lại (khi đã đi thì bấm hai lần trong 2,5 giây), Chọn màn. Ô "Màn" trên thanh số liệu cũng mở bảng chọn màn.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `→` `↓` / `W` `A` `S` `D` | Đi / đẩy |
| `Z` / `U` / `Backspace` / `Ctrl+Z` | Hoàn tác lần đẩy gần nhất |
| `R` | Chơi lại màn (bấm hai lần khi đã đi) |
| `L` | Chọn màn |
| `N` | Màn tiếp theo (sau khi qua màn) |
| `Esc` | Đóng hộp thoại |

## Ghi điểm trên cổng

- Metric `wins`, một mode `classic` (Classic / Cổ điển), 6 điểm mỗi lần qua màn; luật chống gian lận `min_duration_ms: 3000` (ván ngắn hơn 3 giây không được tính).
- Mỗi lần chơi một màn là một ván: hiện màn thì `kit.sdk.start('classic')`; mở lại ván lưu dở thì `kit.sdk.start('classic', true)`.
- Qua màn: `kit.sdk.end({ mode: 'classic', won: true, assisted: false })`.
- Chơi lại hoặc rời sang màn khác khi ván đã đi ít nhất một bước (kể cả đã hoàn tác hết): `won: false`. Chưa đi bước nào thì không gửi gì.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-daythung-settings-v1` | Cài đặt (giao diện) |
| `playnine-daythung-stats-v1` | Màn đã giải, kỷ lục từng màn (`best[màn] = { m: bước, p: lần đẩy }`), màn đang chơi, số lượt chơi / qua màn / tổng bước |
| `playnine-daythung-save-v1` | Ván đang chơi dở: `{ v, game: { v, level, hist } }`, `hist` là chuỗi nước LURD (chữ hoa là lần đẩy); khi mở lại, engine đi lại chuỗi này và bỏ ván nếu có nước sai |
| `playnine-daythung-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Kiểm tra engine

```bash
node test.js
```

Test phủ luật đi / đẩy, hoàn tác, chơi lại, đường đi tự động, lưu / khôi phục và từ chối dữ liệu hỏng. Mọi màn được kiểm tra hợp lệ (một người, số thùng bằng số đích, kín tường) và **giải được**: solver BFS theo số lần đẩy trong `engine.js` tìm lời giải cho từng màn trong giới hạn 5 giây (cả 36 màn mất khoảng 1 giây), rồi chạy lại lời giải bằng `move()` phải thắng.

Test "ván thắng" trong cổng: `e2e.spec.ts` (chạy cùng `npm run e2e` sau khi build).
