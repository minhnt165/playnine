# Tangram

Game Tangram của PlayNine: xếp 7 mảnh cổ điển lấp kín một hình bóng. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Bộ 7 mảnh trên lưới đơn vị: 2 tam giác lớn (cạnh góc vuông 2), 1 tam giác vừa (cạnh huyền 2), 2 tam giác nhỏ (cạnh góc vuông 1), 1 hình vuông cạnh 1, 1 hình bình hành (cạnh 1 và √2). Tổng diện tích 8.
- Dùng cả 7 mảnh lấp kín hình bóng xám: không mảnh nào chồng lên mảnh khác, không phần nào thò ra ngoài. Cách xếp khác lời giải gốc mà vẫn lấp kín đúng hình cũng được tính là thắng.
- Mảnh xoay theo nấc 45°; chỉ hình bình hành cần lật (các mảnh khác lật chỉ là xoay).
- Thả mảnh là mảnh tự hít vào chỗ: ưu tiên khớp một đỉnh của mảnh vào đỉnh của hình bóng hoặc của mảnh khác (trong bán kính 0,36 ô), nếu không thì một đỉnh rơi vào lưới nửa ô.
- Gợi ý đặt đúng một mảnh còn thiếu theo lời giải và khóa mảnh đó lại (mảnh khác đang đè chỗ đó về khay). Giải có dùng gợi ý vẫn tính thắng nhưng đánh dấu là được trợ giúp.

### Hình học chính xác

Mọi tọa độ có dạng `a + b·s` với `s = √2/2`, `a`, `b` là số hữu tỉ nhị phân (double biểu diễn đúng), nên xoay 45° không bao giờ có sai số. Kiểm tra thắng: diện tích giao từng cặp mảnh bằng 0 và tổng diện tích giao giữa mảnh và hình mục tiêu đúng bằng 8; vì hình mục tiêu cũng có diện tích 8 nên hợp các mảnh trùng hình mục tiêu. Mọi cạnh đi theo 4 phương (0°, 45°, 90°, 135°) nên khi cắt đa giác chỉ phải chia cho 1 hoặc 2, kết quả vẫn chính xác tuyệt đối.

## Màn chơi

42 màn, mỗi màn được viết bằng **lời giải** (vị trí 7 mảnh) nên hình bóng sinh ra từ lời giải và màn nào cũng giải được:

| Thể loại | Màn |
| --- | --- |
| Con vật (12) | cá, mèo, thỏ, chim bay, cáo, lạc đà, vịt, rùa, cú mèo, bướm, cá voi, chó |
| Người (9) | vũ công, người nhảy, vẫy chào, đi bộ, chạy, tung cước, ngồi, quỳ, ngồi thiền |
| Đồ vật (12) | nhà, thuyền buồm, mũi tên, cây thông, nấm, cái ô, đồng hồ cát, hình vuông, tam giác, hình chữ nhật, hình thang, lục giác |
| Chữ cái (5) | A, L, T, V, Y |
| Chữ số (4) | 2, 6, 7, 9 |

Danh sách màn ở `DEFS` trong `engine.js`, viết gọn `loại.kiểu x y` (xem chú thích ở `FORMS`). Màn đã giải có dấu tích trong danh sách chọn màn (vàng nếu giải nhờ gợi ý).

## Điều khiển

- **Chuột / chạm**: kéo mảnh để di chuyển; chạm vào mảnh đang chọn để xoay 45°; nút Xoay, Lật, Gợi ý, Xếp lại ở thanh dưới bàn. Chạm ô tên màn hoặc nút lưới trên thanh trên để chọn màn.
- Bàn tự đổi bố cục theo khung: màn dọc thì khay mảnh ở dưới, màn ngang thì khay ở bên phải.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `1`–`7` | Chọn mảnh (L L M S S Q P) |
| `Tab` / `Shift`+`Tab` (khi bàn đang focus) | Chọn lần lượt các mảnh |
| Mũi tên | Dời mảnh đang chọn nửa ô (rồi hít như khi thả) |
| `R` / `Shift`+`R`, `Space` / `Enter` (khi bàn focus) | Xoay 45° thuận / ngược chiều kim đồng hồ |
| `F` | Lật hình bình hành |
| `H` | Gợi ý |
| `X` | Xếp lại: mảnh chưa khóa về khay |
| `P` | Mở danh sách màn |
| `N` | Màn sau (đang xếp dở thì hỏi trước) |
| `Esc` | Bỏ chọn mảnh / đóng hộp thoại |

## Ghi điểm trên cổng

- Metric `wins`, một mode `classic` (Cổ điển), 4 điểm mỗi lần thắng, luật chống gian lận `min_duration_ms: 5000`.
- Một lần xếp một màn là một ván: mở màn gọi `kit.sdk.start('classic')`, mở lại màn xếp dở gọi `kit.sdk.start('classic', true)`.
- Lấp kín hình: `kit.sdk.end({ mode: 'classic', won: true, timeMs, assisted })`, `assisted: true` nếu đã dùng gợi ý.
- Bỏ màn (chọn màn khác, `N`) khi đã di chuyển ít nhất một mảnh: hỏi xác nhận rồi gửi `won: false`; chưa đụng mảnh nào thì không gửi gì.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-tangram-settings-v1` | Cài đặt (giao diện, chấm lưới) |
| `playnine-tangram-stats-v1` | Số lượt chơi, số lần thắng, số lần thắng không gợi ý, màn đã giải (`1` tự giải, `2` nhờ gợi ý), màn mở gần nhất |
| `playnine-tangram-save-v1` | Màn đang xếp dở (vị trí chính xác của 7 mảnh, mảnh khóa, số nước, số gợi ý, thời gian) |
| `playnine-tangram-summary-v1` | Tóm tắt cho thẻ game trên cổng (số màn đã giải, màn đang xếp dở) |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Kiểm tra engine

```bash
node test.js
```

Test phủ: số `a + b·s` chính xác, diện tích và cắt đa giác; từng màn đủ 7 mảnh đúng loại, tổng diện tích đúng 8, không chồng, nằm trong khung, lời giải được chấp nhận; kiểm tra thắng từ chối các lệch nhỏ (dời nửa ô, dời 1/64, xoay 45°, lật, một mảnh còn trong khay) và chấp nhận cách xếp khác; hít đúng tọa độ lời giải khi thả gần; gợi ý, xếp lại, đổi bố cục; lưu / khôi phục và từ chối dữ liệu hỏng.

Test trong cổng: `games/tangram/e2e.spec.ts` (ván thắng, thắng nhờ gợi ý, bỏ màn), chạy cùng `npm run e2e` sau khi build.
