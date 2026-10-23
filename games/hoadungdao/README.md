# Hoa Dung Đạo

Game Hoa Dung Đạo (Sliding Blocks) của PlayNine: trò trượt khối cổ điển trong khay 4×5, đưa khối vuông lớn ra lối ra. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Khay 4 cột × 5 hàng chứa các khối chữ nhật: một khối lớn 2×2, khối dọc 1×2, khối ngang 2×1, khối nhỏ 1×1, và đúng hai ô trống.
- Các khối chỉ được trượt trong khay qua ô trống (lên / xuống / trái / phải), không được nhấc lên hay xoay.
- Thắng khi khối lớn tới lối ra ở giữa cạnh đáy, tức chiếm cột 2–3, hàng 4–5 (theo engine: góc trên trái ở `(1, 3)`, cột 1..2, hàng 3..4 tính từ 0). Khối lớn sau đó trượt ra khỏi khay qua lối ra.
- **Đếm nước** theo cách chuẩn của trò này:
  - một khối trượt tới chỗ mới qua các ô trống là **một nước**, dù đi bao xa và rẽ góc bao nhiêu lần trong một lần kéo;
  - đi tiếp ngay **chính khối đó** (không có khối nào khác đi xen giữa) vẫn tính chung nước ấy, dù bằng lần kéo / chạm / phím khác;
  - nếu khối quay về đúng chỗ trước nước đó thì nước ấy bị xóa (số nước giảm lại).

  Đây cũng chính là định nghĩa solver dùng, nên số nước tối thiểu của từng thế so được trực tiếp với số nước của người chơi.
- Mỗi thế hiện số nước tối thiểu (do solver BFS tính). Kỷ lục của thế là số nước ít nhất bạn từng giải; giải đúng số tối thiểu được đánh dấu ★.
- **Hoàn tác** (không giới hạn) lấy lại nguyên nước gần nhất; **Chơi lại** đưa thế về ban đầu. Cả hai là một phần của trò chơi, không tính là trợ giúp.

## Các thế

- 24 thế, sắp theo số nước tối thiểu tăng dần: 4, 7, 10, 13, 16, 19, 23, 27, 31, 35, 40, 45, 50, 56, 62, 68, 74, **81 (thế 18: thế cổ điển Hoành đao lập mã)**, 88, 96, 105, 116, 127, 138.
- Thế 18 là thế mở đầu kinh điển; các thế khác được sinh bằng máy rồi chọn tay: với mỗi bộ khối (số khối dọc / ngang / nhỏ), lấy một trạng thái ngẫu nhiên, duyệt trọn thành phần liên thông của nó, BFS ngược từ mọi thế thắng để có khoảng cách tới lối ra của từng trạng thái, rồi chọn thế có số nước mong muốn, ưu tiên khối lớn ở hàng trên cùng như thế cổ điển. Thế 24 (138 nước) là trạng thái xa lối ra nhất trong thành phần của nó.
- Lưu trong `engine.js` (`LEVELS`), mỗi thế `{ layout, min }`: `layout` là 5 hàng × 4 ký tự nối bằng `|`, `B` khối lớn, `V` khối dọc, `H` khối ngang, `S` khối nhỏ, `.` ô trống. Chuỗi chỉ ghi hình khối ở từng ô: dãy `V` trong một cột được cắt cặp từ trên xuống, dãy `H` trong một hàng cắt cặp từ trái sang, nên cách đọc là duy nhất.
- Chọn màn: mọi thế đều mở sẵn; bảng chọn màn đánh dấu thế đã giải, kỷ lục và ★ khi giải tối thiểu.

## Điều khiển

- Chuột / chạm:
  - **kéo** một khối: khối đi theo con trỏ từng ô, rẽ góc được (bị chặn theo trục chính thì thử trục kia);
  - **vuốt ngắn** trên khối: trượt một ô theo hướng vuốt;
  - **chạm** khối nằm cạnh ô trống: trượt một ô về phía đó (nhiều hướng thì chọn hướng gần điểm chạm so với tâm khối);
  - **chạm ô trống** mà chỉ một khối trượt một ô vào được: đi khối đó.
- Bàn phím: `Tab` / `Shift+Tab` hoặc phím mũi tên để chọn khối; `Enter` / `Space` nhấc khối, phím mũi tên trượt, `Enter` / `Space` / `Esc` đặt xuống. `Shift` + mũi tên trượt ngay khối đang chọn.
- Nút dưới khay: Hoàn tác, Chơi lại (khi đã đi thì bấm hai lần trong 2,5 giây), Chọn màn. Ô "Màn" trên thanh số liệu cũng mở bảng chọn màn.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `Tab` / `Shift+Tab`, `←` `↑` `→` `↓` | Chọn khối |
| `Enter` / `Space` | Nhấc / đặt khối đang chọn |
| `←` `↑` `→` `↓` (khi đã nhấc) / `Shift` + mũi tên | Trượt khối một ô |
| `Z` / `U` / `Backspace` / `Ctrl+Z` | Hoàn tác nước gần nhất |
| `R` | Chơi lại thế (bấm hai lần khi đã đi) |
| `L` | Chọn màn |
| `N` | Thế tiếp theo (sau khi thắng) |
| `Esc` | Đặt khối xuống / đóng hộp thoại |

## Ghi điểm trên cổng

- Metric `wins`, một mode `classic` (Classic / Cổ điển), 5 điểm mỗi lần giải một thế (điểm game cũng là 5); luật chống gian lận `min_duration_ms: 5000` (ván ngắn hơn 5 giây không được tính).
- Mỗi lần chơi một thế là một ván: hiện thế thì `kit.sdk.start('classic')`; mở lại ván lưu dở thì `kit.sdk.start('classic', true)`.
- Khối lớn tới lối ra: `kit.sdk.end({ mode: 'classic', won: true, assisted: false })`.
- Chơi lại hoặc chuyển sang thế khác khi ván đã đi ít nhất một nước (kể cả đã hoàn tác hết): `won: false`. Chưa đi nước nào thì không gửi gì.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-hoadungdao-settings-v1` | Cài đặt (giao diện) |
| `playnine-hoadungdao-stats-v1` | Thế đã giải (`solved`), kỷ lục từng thế (`best[thế] = số nước`), thế đang chơi (`current`), số lượt chơi / lần giải |
| `playnine-hoadungdao-save-v1` | Ván đang chơi dở: `{ v, game: { v, level, hist } }`, `hist` là danh sách nước `[khối, x, y]` (khối số mấy theo thứ tự đọc của thế, tới góc trên trái nào); khi mở lại, engine đi lại từng nước và bỏ ván nếu có nước sai |
| `playnine-hoadungdao-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Kiểm tra engine

```bash
node test.js
```

Test phủ đọc thế (và từ chối thế sai), luật trượt, rẽ góc trong một nước, gộp nước cùng khối, xóa nước khi khối về chỗ cũ, hoàn tác, thắng, lưu / khôi phục và từ chối dữ liệu hỏng. Với **mọi thế**, test chạy solver BFS (trạng thái chuẩn hóa theo hình khối, không theo danh tính, chính là chuỗi 20 ô) để chứng minh thế giải được và số nước tối thiểu đúng bằng `min` lưu trong thế (thế cổ điển: 81), rồi chạy lại lời giải bằng `moveTo()` phải thắng sau đúng `min` nước. Cả 24 thế giải trong khoảng 2 giây.

Test "ván thắng" trong cổng: `e2e.spec.ts` (chạy cùng `npm run e2e` sau khi build).
