# Lều Trại

Game Lều Trại (Tents and Trees) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Bàn là lưới ô vuông, một số ô có cây. Người chơi dựng lều vào các ô trống.
- Mỗi cây ghép với **đúng một lều** nằm ngay cạnh nó (trên, dưới, trái, phải) và mỗi lều thuộc về đúng một cây. Lều nằm chéo với cây không tính.
- Hai lều **không được chạm nhau**, kể cả chéo góc.
- Số ở đầu mỗi hàng / cột là số lều trong hàng / cột đó. Đủ số thì số mờ đi, thừa thì số chuyển đỏ.
- Đặt đủ lều thỏa mọi luật là thắng. Ô cỏ chỉ là ghi chú của người chơi ("ở đây không có lều"), không ảnh hưởng thắng thua.
- Đề sinh ngẫu nhiên theo seed và **luôn có đúng một lời giải** (solver đếm nghiệm, dừng ở 2), nên giải được hoàn toàn bằng suy luận.

## Điều khiển

- **Chạm / bấm ô**: trống → lều → cỏ → trống. Chuột phải đi theo chiều ngược lại (trống → cỏ → lều).
- **Kéo qua nhiều ô**: tô cỏ nhanh lên các ô trống (lều và cây giữ nguyên). Bắt đầu kéo từ một ô cỏ thì là xóa cỏ. Cả nét kéo là một bước hoàn tác.
- **Chạm số đầu hàng / cột đã đủ lều**: tô cỏ mọi ô còn trống của hàng / cột đó. Chưa đủ lều thì không làm gì và báo nhắc.
- **Hoàn tác / Làm lại** không giới hạn (ván lưu giữ 1000 bước gần nhất).
- **Gợi ý**: gỡ một lều đặt sai, hoặc đổi ô cỏ đang đè lên chỗ có lều, hoặc dựng giúp một lều (ưu tiên hàng / cột còn thiếu ít lều nhất). Ván có dùng gợi ý vẫn tính là giải được nhưng gửi `assisted: true` và không tính kỷ lục.
- **Báo lỗi** (Cài đặt): tô đỏ lều chạm nhau, lều không cạnh cây nào, cây không còn ô nào để dựng lều, và hàng / cột không còn đủ chỗ cho số lều. Chưa chọn thì mặc định bật ở mức Dễ, tắt ở Vừa / Khó; đã bật / tắt thì áp cho mọi cỡ. Báo lỗi chỉ dựa trên luật (không so với lời giải) nên không tính là trợ giúp. Số hàng / cột thừa lều thì luôn đỏ.
- Đồng hồ chạy từ lúc chia đề, dừng khi tab ẩn hoặc khi mở hộp thoại; lúc mở hộp thoại bàn bị làm mờ.

## Cỡ bàn (mode)

| Mode | Bàn | Số cây | Điểm trên cổng | `min_time_ms` |
| --- | --- | --- | --- | --- |
| `s` (mặc định) | 6×6, Dễ | 7 | 4 | 1000 |
| `m` | 8×8, Vừa | 12 | 6 | 1800 |
| `l` | 12×12, Khó | 28 | 9 | 4000 |

- Đổi cỡ trong Cài đặt hoặc chạm ô cỡ bàn (ô đầu tiên của HUD) để chuyển Dễ → Vừa → Khó. Đề đang dở thì hỏi trước vì bỏ đề tính là thua.
- Sinh đề (Node 24, 300 seed mỗi cỡ): 6×6 trung bình 0,03 ms; 8×8 0,04 ms; 12×12 trung bình 0,22 ms, p95 0,6 ms, chậm nhất 3,3 ms (trung bình 1,7 lần thử bố cục). Máy điện thoại chậm gấp 10–20 lần vẫn dưới 100 ms, nên không cần đề sinh sẵn.

## Ghi điểm trên cổng

- Metric `time_low`, mỗi cỡ bàn một mode. Đề mới: `kit.sdk.start(mode)`; mở lại ván lưu dở: `kit.sdk.start(mode, true)`.
- Giải xong: `kit.sdk.end({ mode, won: true, timeMs, assisted })`, `assisted` = đã dùng gợi ý.
- Bỏ đề đã đi ít nhất một nước (Ván mới hoặc đổi cỡ, có hỏi xác nhận): `won: false`. Đề chưa đi nước nào thì không gửi gì.
- `min_time_ms` = số thao tác tối thiểu (mỗi lều một lần chạm, không cần tô cỏ) × 150 ms, làm tròn xuống: dưới mức nhanh nhất của người thật (cần thêm thời gian đọc đề).

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-leutrai-settings-v1` | Cài đặt: giao diện, cỡ bàn `size`, báo lỗi `errors` (chưa chọn thì không có) |
| `playnine-leutrai-stats-v1` | Thống kê: đã chơi, đã giải, chuỗi thắng, kỷ lục từng cỡ (ms, chỉ ván không dùng gợi ý) |
| `playnine-leutrai-save-v1` | Ván đang dở (chỉ khi đã đi ít nhất một nước): `{ v, game, elapsed }`, `game` gồm đề (cây, số hàng / cột, seed), dấu của người chơi, lịch sử hoàn tác / làm lại, số nước, số gợi ý |
| `playnine-leutrai-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Lời giải không lưu mà tính lại bằng solver khi mở; ván lưu hỏng, khác phiên bản, sai cỡ hoặc đề không còn đúng một nghiệm thì bị bỏ và chia đề mới.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `↑` `↓` `←` `→` | Di chuyển ô đang chọn (giữ `Shift` để tô cỏ ô vừa tới) |
| `Space` / `Enter` | Đổi ô đang chọn (trống → lều → cỏ; `Shift` đi ngược) |
| `T` / `1` | Dựng / gỡ lều |
| `G` / `X` / `2` | Tô / xóa cỏ |
| `Backspace` / `Delete` / `0` | Xóa ô |
| `Z` / `Ctrl+Z` | Hoàn tác |
| `Y` / `Ctrl+Y` / `Ctrl+Shift+Z` | Làm lại |
| `H` | Gợi ý |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại |

Trên điện thoại: chạm để đổi ô, kéo để tô cỏ.

## Kiểm tra

```bash
node test.js
```

Test engine phủ PRNG, luật (vòng chạm, hàng / cột, lều chạm nhau, ghép cây - lều, lỗi trên bàn), thắng, sinh đề 40 seed mỗi cỡ có đúng một nghiệm, đối chiếu solver với duyệt vét cạn ở 6×6 (cả bố cục nhiều nghiệm), tốc độ sinh đề, hoàn tác / làm lại, gợi ý, lưu / khôi phục và từ chối ván hỏng. Test trong cổng: `e2e.spec.ts` (ván thắng, thắng nhờ gợi ý, bỏ đề, đổi cỡ trước nước đầu).
