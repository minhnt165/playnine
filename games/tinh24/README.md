# Tính 24

Game Tính 24 (Make 24) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

Mỗi đề có bốn số từ 1 đến 13. Dùng mỗi số **đúng một lần** với + − × ÷ (ngoặc có được nhờ cách ghép từng bước) để ra **24**.

- Chạm một số, một phép tính, rồi một số khác: hai số gộp thành kết quả, nằm ở ô chạm sau (ô kia trống). Kết quả được chọn sẵn để ghép tiếp ngay.
- Lặp lại tới khi còn một số. Bằng 24 là xong đề; khác 24 thì ô đó viền đỏ, phải hoàn tác hoặc làm lại đề.
- Phân số giữ chính xác (engine tính bằng phân số tối giản): 8 ÷ 3 hiện là 8/3 (xếp chồng), số âm hiện dấu −. Chia cho 0 bị từ chối.
- Một ván là một **bộ 5 đề liên tiếp**, thời gian là tổng cả bộ. Ví dụ: 3 3 8 8 → 8 ÷ (3 − 8 ÷ 3) = 24.

## Điều khiển

- **Hoàn tác** từng bước, **Làm lại** đề từ đầu (không giới hạn, chỉ trong đề hiện tại).
- **Gợi ý**: tô sáng hai ô và phép tính của bước kế tiếp trong một lời giải (bộ giải ưu tiên lời giải ít phân số / số âm). Đang đi vào đường cụt thì đề được làm lại trước rồi mới gợi ý. Bộ có dùng gợi ý gửi `assisted: true` và không tính kỷ lục trong máy.
- **Bỏ qua**: đổi sang đề khác cùng mức, **cộng 30 giây** vào đồng hồ, và hiện một cách giải của đề vừa bỏ. Bỏ qua không tính là đã giải, nên vẫn phải giải đủ 5 đề.
- Đồng hồ chạy từ lúc chia bộ, dừng khi mở hộp thoại hoặc ẩn tab; lúc dừng vì hộp thoại thì bàn bị làm mờ để không xem đề "miễn phí".

## Mức (mode)

Độ khó do bộ giải phân loại: đếm số **biểu thức khác nhau** ra 24 (chuẩn hóa giao hoán / kết hợp: a+b = b+a, (a+b)+c = a+(b+c), a−(b−c) = a−b+c, a÷(b÷c) = a×c÷b…) và xem có cách giải chỉ đi qua số nguyên không.

| Mode | Mức | Đề | Số tập 4 số (trên 1820) | Điểm trên cổng | `min_time_ms` |
| --- | --- | --- | --- | --- | --- |
| `easy` (mặc định) | Dễ | ≥ 5 biểu thức khác nhau và có cách giải chỉ dùng số nguyên | 286 | 4 | 5000 |
| `hard` | Khó | đúng 1 biểu thức, hoặc bắt buộc đi qua phân số (3 3 8 8, 1 5 5 5, 1 3 4 6…) | 397 | 8 | 5000 |

Các tập có 2–4 biểu thức không dùng (ranh giới rõ giữa hai mức). Đổi mức bằng thanh chọn dưới HUD; bộ đang dở (đã đi ít nhất một nước) thì hỏi trước vì bỏ bộ tính là thua.

## Sinh đề

Theo seed (PRNG mulberry32; trạng thái PRNG lưu cùng ván nên đề kế / đề thay khi bỏ qua vẫn tất định): rút 4 số ngẫu nhiên 1–13 (giữ thứ tự rút), bỏ tập đã có trong bộ, chạy bộ giải để phân loại, nhận khi đúng mức. Mọi đề sinh ra đều có lời giải (test chạy bộ giải trên 200 bộ × 7 đề mỗi mức, kể cả đề thay khi bỏ qua).

Bộ giải duyệt mọi cách ghép chỉ bằng giá trị phân số (rẻ), chuỗi chuẩn hóa chỉ dựng cho cây ra 24. Tốc độ đo trong Node (máy bàn): phân tích một tập 4 số ~0,3 ms; sinh cả bộ 5 đề trung bình 8 ms, chậm nhất ~20 ms (mỗi lần chia đề chỉ rút một đề, ~2 ms). Điện thoại chậm (chậm hơn khoảng 10 lần) vẫn dưới mục tiêu 300 ms nên không cần đề sinh sẵn.

## Ghi điểm trên cổng

- Metric `time_low`, mỗi mức một mode. Bộ mới: `kit.sdk.start(mode)`; mở lại bộ lưu dở: `kit.sdk.start(mode, true)`.
- Xong 5 đề: `kit.sdk.end({ mode, won: true, timeMs, assisted })` (`timeMs` gồm cả thời gian phạt bỏ qua; `assisted` = đã dùng gợi ý).
- Bỏ bộ đã đi ít nhất một nước (phép tính hoặc bỏ qua; Ván mới hoặc đổi mức, có hỏi xác nhận): `won: false`. Bộ chưa đi nước nào thì không gửi gì.
- `min_time_ms` 5000 cho cả hai mức: mỗi đề cần 3 phép tính; phép đầu 3 chạm (số, phép, số), các phép dùng kết quả vừa gộp chỉ 2 chạm (kết quả được chọn sẵn), nên tối thiểu 7 chạm / đề → 35 chạm / bộ × 150 ms ≈ 5,25 s, chưa kể 4 lần chuyển đề (mỗi lần khóa bàn 0,35–0,75 s). Mức khó cũng cần đúng số chạm đó nên cùng ngưỡng.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-tinh24-settings-v1` | Cài đặt: giao diện, mức `level` (`'easy'` / `'hard'`), đã xem hướng dẫn `guideSeen` |
| `playnine-tinh24-stats-v1` | Thống kê: bộ đã chơi, bộ hoàn thành, số đề đã giải, chuỗi thắng, kỷ lục từng mức (chỉ bộ không dùng gợi ý) |
| `playnine-tinh24-save-v1` | Bộ đang dở (chỉ khi đã đi ít nhất một nước): `{ v, game, elapsed }`, `game` gồm mức, trạng thái PRNG, các đề đã rút, số đề đã giải / bỏ qua / gợi ý / nước, các bước của đề hiện tại |
| `playnine-tinh24-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng, khác phiên bản, đề không giải được hoặc bước không hợp lệ (engine áp lại từng bước khi mở) thì bị bỏ và chia bộ mới.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `1` `2` `3` `4` | Chọn số ở ô 1–4 (trái trên, phải trên, trái dưới, phải dưới) |
| `+` `-` `*` (`x`) `/` (`:`) | Chọn phép tính |
| `↑` `↓` `←` `→` + `Space` / `Enter` | Di chuyển giữa các ô và chạm ô đang chọn |
| `Z` / `U` / `Backspace` / `Ctrl+Z` | Hoàn tác một bước |
| `R` | Làm lại đề |
| `H` | Gợi ý |
| `S` | Bỏ qua đề (+30 giây) |
| `N` | Ván mới |
| `Esc` | Bỏ chọn / đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test engine phủ phân số, bộ giải (so với bộ giải số thực độc lập trên cả 1820 tập 4 số: đúng 1362 tập giải được), đếm biểu thức khác nhau, phân loại độ khó, các bước gợi ý luôn ra 24 (mọi tập giải được, cả từ giữa chừng), viết lời giải thành biểu thức, sinh đề có lời giải và đúng mức trên nhiều seed, tất định theo seed, tốc độ sinh đề, luật ghép / từ chối / xong đề / kẹt / hoàn tác / làm lại / bỏ qua / gợi ý / thắng bộ, lưu / khôi phục và từ chối ván hỏng. Test trong cổng: `e2e.spec.ts` (ván thắng từ ván lưu dựng sẵn, bỏ bộ, đổi mức trước nước đầu).
