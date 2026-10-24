# Ô Số Tính

Game Ô Số Tính (Math Cages) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Lưới N×N (N = 4..7). Điền số 1..N sao cho **mỗi hàng và mỗi cột có đủ mỗi số đúng một lần**.
- Đường kẻ đậm chia lưới thành các **lồng**. Góc trên trái của lồng ghi kết quả và phép tính: `+` cộng, `−` trừ, `×` nhân, `÷` chia. Các số trong lồng phải cho ra đúng kết quả đó.
- `−` và `÷` chỉ có ở lồng 2 ô: lấy số lớn trừ / chia số nhỏ (thứ tự trong lồng không quan trọng).
- Trong một lồng, một số được lặp lại nếu hai ô đó không cùng hàng hay cùng cột.
- Lồng 1 ô được cho sẵn số (ô cố định, không sửa được).
- Đề nào cũng có **đúng một lời giải**. Điền đủ lưới, không trùng hàng / cột, mọi lồng đúng là thắng.

## Điều khiển

- Chạm / bấm một ô để chọn, rồi chạm số ở bàn số bên dưới. Chạm lại đúng số đang có thì xóa ô.
- **Ghi chú**: bật nút Ghi chú (hoặc `Space`, hoặc giữ `Shift` khi gõ số) để viết số nhỏ dự đoán vào ô trống. Điền một số sẽ tự xóa ghi chú số đó ở cùng hàng và cùng cột.
- **Hoàn tác / làm lại** không giới hạn (cả ghi chú và gợi ý), lưu cùng ván.
- **Gợi ý**: điền đúng số vào ô đang chọn (nếu ô đó trống hoặc sai), không thì vào ô trống đầu tiên. Ván đã dùng gợi ý tính là có trợ giúp (`assisted: true`) và không ghi kỷ lục.
- **Báo lỗi** (Cài đặt, mặc định bật): tô đỏ số trùng hàng / cột và lồng đã đủ ô mà sai kết quả. Tắt đi thì chỉ còn nhãn lồng đúng chuyển sang màu nhạt.
- Ô cùng hàng / cột với ô đang chọn được tô nhạt, ô cùng số được tô tím nhạt; số cho sẵn màu chữ đậm, số người chơi điền màu tím. Nút số đã đủ N lần trên lưới thì mờ đi.
- Đồng hồ chạy từ lúc chia đề, **dừng khi mở hộp thoại** (lưới bị làm mờ để không xem đề lúc dừng) hoặc khi tab ẩn.
- Lần đầu mở game hiện hộp Cách chơi.

## Cỡ lưới (mode)

| Mode | Lưới | Mức | Lồng lớn nhất | Lồng 1 ô tối đa | Điểm trên cổng | `min_time_ms` |
| --- | --- | --- | --- | --- | --- | --- |
| `4` (mặc định) | 4×4 | Dễ | 3 ô | 2 | 3 | 4000 |
| `5` | 5×5 | Vừa | 4 ô | 2 | 5 | 6500 |
| `6` | 6×6 | Khó | 4 ô | 2 | 7 | 10000 |
| `7` | 7×7 | Rất khó | 4 ô | 1 | 10 | 14000 |

Đổi cỡ: nút Ván mới (hoặc huy hiệu cỡ lưới cạnh tên game, hoặc phím `N`) mở hộp chọn cỡ. Cỡ vừa chọn được nhớ trong cài đặt.

Mức khó đến từ cỡ lưới, số ô cho sẵn và cách chọn phép tính: lưới nhỏ hay dùng phép "bó buộc" (ít bộ số khớp, ví dụ `÷`, `×`), lưới lớn chọn phép ngẫu nhiên hơn nên phải suy luận nhiều hơn.

## Sinh đề (engine.js)

1. Hình vuông Latin ngẫu nhiên N×N theo seed (mulberry32, seed là số hoặc chuỗi).
2. Chia lưới thành lồng liền khối theo tỉ lệ cỡ lồng của từng mức; lồng 1 ô thừa được gộp vào lồng kề.
3. Chọn phép tính cho từng lồng (khớp với lời giải).
4. **Solver đếm nghiệm** (dừng ở 2): tìm theo lồng, mỗi bước chọn lồng còn ít bộ số khớp nhất, cắt nhánh khi một hàng / cột không còn cách nào đủ 1..N. Còn nhiều nghiệm thì đổi phép tính của một lồng chứa ô khác nhau giữa hai nghiệm sang phép mà nghiệm lạ không thỏa; hết cách (hoặc một lần đếm vượt 400 nút tìm kiếm) thì chia lồng lại. Chỉ trả đề khi solver đếm đủ và ra đúng 1 nghiệm.

Thời gian sinh đề đo trong Node (2000 seed mỗi cỡ, máy văn phòng):

| Cỡ | Trung bình | p99 | Chậm nhất |
| --- | --- | --- | --- |
| 4×4 | 0,1 ms | 0,7 ms | 2 ms |
| 5×5 | 0,2 ms | 1,1 ms | 2 ms |
| 6×6 | 0,7 ms | 3,5 ms | 7 ms |
| 7×7 | 2,3 ms | 11,7 ms | 23 ms |

Điện thoại chậm khoảng 5–8 lần vẫn dưới mục tiêu 300 ms, nên không cần đề sinh sẵn.

## Ghi điểm trên cổng

- Metric `time_low`, mỗi cỡ lưới một mode. Đề mới: `kit.sdk.start(mode)`; mở lại ván lưu dở: `kit.sdk.start(mode, true)`.
- Thắng: `kit.sdk.end({ mode, won: true, timeMs, assisted })`, `assisted` = đã dùng gợi ý.
- Bỏ ván đã đi ít nhất một nước (chọn cỡ mới trong hộp Ván mới, có dòng cảnh báo): `won: false`. Ván chưa đi nước nào thì không gửi gì.
- `min_time_ms`: số ô phải điền tối thiểu (N² trừ số lồng 1 ô tối đa) × 2 thao tác (chọn ô + số) × 150 ms, làm tròn xuống: 4×4 14 ô → 4,2 s → 4000; 5×5 23 ô → 6,9 s → 6500; 6×6 34 ô → 10,2 s → 10000; 7×7 48 ô → 14,4 s → 14000.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-osotinh-settings-v1` | Cài đặt: giao diện, cỡ lưới `size`, báo lỗi `errors`, đã xem hướng dẫn `guideSeen` |
| `playnine-osotinh-stats-v1` | Thống kê: đã chơi, đã giải, chuỗi thắng, giải không gợi ý, số đề giải và kỷ lục của từng cỡ |
| `playnine-osotinh-save-v1` | Ván đang dở (chỉ khi đã đi ít nhất một nước): `{ v, game, elapsed }`, gồm đề, lời giải, số đã điền, ghi chú, lịch sử hoàn tác / làm lại |
| `playnine-osotinh-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng hoặc khác phiên bản (lồng không phủ đúng lưới, lồng không liền, lời giải không phải hình vuông Latin hoặc không thỏa lồng, ô cố định bị sửa, lịch sử sai dạng…) thì bị bỏ và chia đề mới.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `↑` `↓` `←` `→` | Di chuyển ô đang chọn |
| `1` … `7` | Điền số (trong chế độ ghi chú: ghi chú) |
| `Shift` + số | Ghi chú số đó |
| `Space` | Bật / tắt chế độ ghi chú |
| `Backspace` / `Delete` / `0` | Xóa ô |
| `Z` / `Ctrl+Z` | Hoàn tác |
| `Y` / `Shift+Z` / `Ctrl+Y` | Làm lại |
| `H` | Gợi ý |
| `N` | Ván mới (chọn cỡ) |
| `Esc` | Đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test engine phủ luật lồng, liệt kê bộ số, solver (đối chiếu vét cạn mọi hình vuông Latin 4×4 / 5×5, đề nhiều nghiệm, vô nghiệm, ngân sách nút), sinh đề 60 seed mỗi cỡ (đúng một nghiệm, đúng cấu hình, tất định theo seed, đủ nhanh), điền số / ghi chú / xóa / hoàn tác / làm lại / gợi ý / ô cố định / lỗi / thắng, lưu / khôi phục và từ chối ván hỏng. Test trong cổng: `e2e.spec.ts` (ván thắng, bỏ ván, đổi cỡ trước nước đầu).
