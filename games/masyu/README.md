# Masyu

Game Masyu (thể loại "Masyu", vòng ngọc trai) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Bàn là lưới ô vuông; một số ô có hạt trắng hoặc hạt đen.
- Vẽ **một vòng khép kín duy nhất** đi qua tâm các ô, chỉ theo hướng ngang / dọc: không tự cắt, không tự chạm, không rẽ nhánh. Vòng không cần đi qua mọi ô nhưng **phải đi qua mọi hạt**.
- **Hạt trắng**: vòng đi thẳng qua ô có hạt, và rẽ ở ít nhất một trong hai ô ngay trước / ngay sau hạt.
- **Hạt đen**: vòng rẽ tại ô có hạt, và đi thẳng qua ô kế tiếp ở cả hai nhánh.
- **Thắng** khi các đoạn đã vẽ tạo đúng một vòng kín thỏa mọi hạt (dấu × không ảnh hưởng). Mỗi đề chỉ có một lời giải.
- Đồng hồ chạy từ lúc đề hiện ra, dừng khi mở hộp thoại hoặc ẩn tab; kỷ lục lưu riêng cho từng mode. Ván có dùng gợi ý không tính kỷ lục.

## Điều khiển

- **Kéo** ngón tay / chuột qua các ô để vẽ nhiều đoạn một lúc (cả nét là một bước hoàn tác). Nét bắt đầu trên một đoạn đã vẽ thì thành nét xóa; kéo lùi lại thì hoàn đoạn vừa vẽ. Ngón tay phải vào khá sâu trong ô mới tính (tránh rung ở ranh giới); đi chéo thì chờ tới ô cùng hàng / cột.
- **Chạm ranh giới giữa hai ô**: trống → đoạn → dấu × ("vòng không đi đây") → trống. Chạm giữa ô chỉ đặt con trỏ.
- **Dấu ×**: chạm lâu (cảm ứng, rung nhẹ), chuột phải, hoặc bật nút **Dấu ×** (chạm và kéo khi đó đều đánh / gỡ ×).
- Hạt đã thỏa luật có viền xanh ngọc; ô có từ 3 đoạn trở lên luôn hiện chấm đỏ.
- **Báo lỗi** (Cài đặt, mặc định "Chỉ mức Dễ"): tô đỏ hạt chắc chắn sai luật với các đoạn / dấu × hiện có (trắng bị rẽ, trắng có hai ô kề cùng đi thẳng, đen đi thẳng, nhánh của đen gặp ô rẽ / bị chặn, hạt không còn hướng hợp lệ), đầu cụt, vòng con đã khép khi chưa thắng. Chỉ dựa vào luật, không so với lời giải nên không tính là trợ giúp.
- **Gợi ý**: sửa một đoạn vẽ sai (thành ×), hoặc một dấu × đặt nhầm lên lời giải; không có lỗi thì thêm một đoạn **suy ra được** từ những gì đã vẽ (thử lan truyền luật cơ bản trước, rồi thử-sai một bước; ưu tiên đoạn nối dài nét đang có). Đoạn đó nháy vàng. Ván có gợi ý gửi `assisted: true`.
- Hoàn tác / làm lại không giới hạn, lưu cả trong ván dở. Thắng thì vòng chuyển xanh ngọc, sáng lên và các hạt nảy lần lượt theo vòng (tắt khi giảm chuyển động), rồi pháo giấy.

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `↓` `→` | Di chuyển con trỏ ô |
| `Shift` + mũi tên | Vẽ đoạn theo hướng đó (xóa nếu đã có) và đi theo nó |
| `X` + mũi tên | Bật / tắt dấu × trên cạnh theo hướng đó (giữ `X` hoặc bấm `X` một lần rồi bấm mũi tên) |
| `Z` / `Ctrl+Z` | Hoàn tác |
| `Y` / `Ctrl+Y` / `Ctrl+Shift+Z` | Làm lại |
| `H` | Gợi ý |
| `N` | Đề mới |
| `Esc` | Đóng hộp thoại / bỏ chế độ × của phím X |

## Mode

Chọn trong **Cài đặt → Đề** hoặc bấm ô cỡ trên HUD (xoay vòng Dễ → Vừa → Khó → Hằng ngày, bỏ qua đề ngày nếu hôm nay đã chơi). Chưa đi nước nào thì đổi ngay; đang giải dở thì hỏi trước (bỏ đề tính là thua).

| Mode | Bàn | Suy luận cần dùng | Số hạt trung bình | Điểm / đề |
| --- | --- | --- | --- | --- |
| `s` Dễ | 6×6 | Lan truyền luật cơ bản, không phải thử | ~7 | 3 |
| `m` Vừa | 8×8 | Thêm "thử một cạnh, thấy mâu thuẫn thì loại" | ~14 | 5 |
| `l` Khó | 10×10 | Như Vừa, bàn lớn | ~22 | 8 |
| `daily` Hằng ngày | 8×8 | Như Vừa | ~14 | 5 |

**Đề hằng ngày**: seed suy từ ngày giờ máy (`masyu-daily-YYYY-MM-DD`), mọi người cùng ngày cùng đề. Mỗi ngày chơi một lần: giải xong hoặc bỏ giữa chừng đều ghi kết quả ngày, sau đó chọn lại "Hằng ngày" chỉ báo kết quả. Có chuỗi ngày thắng (Thống kê, hộp thắng, ô "Hôm nay" trên cổng qua `summary.daily`). Giải xong đề ngày thì nút tiếp theo quay về cỡ thường chơi gần nhất.

## Sinh đề

`engine.js` sinh đề theo seed (PRNG mulberry32), ngay trên máy người chơi:

1. **Vòng ngẫu nhiên**: nuôi một vùng "mặt" liền nhau (mặt = ô vuông nhỏ giữa 4 tâm ô) không lỗ, không chạm chéo; biên của vùng là một vòng kín không tự chạm đi qua tâm các ô.
2. **Nắn vòng cho hợp Masyu** (leo đồi, 6·n² bước): lật thử một mặt, giữ vùng hợp lệ, nhận nếu số ô "không đặt được hạt" (ô vòng không đi qua, hoặc ô trên vòng mà không thỏa luật trắng / đen) không tăng. Không có bước này thì vòng thường có đoạn thẳng dài / bậc thang và vùng trống lớn, đặt hạt ở mọi chỗ có thể vẫn còn nhiều lời giải (thử 200 vòng 8×8 / 10×10: không vòng nào duy nhất); sau khi nắn, khoảng 2/3 vòng cho đề duy nhất ngay.
3. **Đặt hạt ở mọi ô thỏa luật** rồi kiểm tra đề giải được tới hết bằng suy luận ở mức của mode (không thì bỏ vòng, sinh vòng khác); sau đó **gỡ hạt theo thứ tự ngẫu nhiên**, gỡ được (vẫn suy ra hết) thì bỏ hẳn. Suy luận chỉ dùng luật đúng nên suy ra hết = lời giải duy nhất.

**Solver** (`createSolver`): lan truyền ràng buộc trên cạnh (đoạn / không) — bậc 0 hoặc 2 ở mỗi ô, ô có hạt bậc 2, luật hạt dạng "các mẫu cạnh hợp lệ quanh hạt" (giữ mẫu còn khớp, cạnh mọi mẫu đồng ý thì gán), không khép vòng sớm (theo dõi hai đầu của từng đoạn, chỉ khép khi vòng chứa mọi đoạn và mọi hạt). Mức Vừa / Khó thêm thử-sai một bước. **Đếm nghiệm** (`countSolutions`, dừng ở `limit`): thêm suy luận trong / ngoài vòng (union-find chẵn lẻ trên các mặt), kiểm tra mọi đoạn + hạt còn nối được với nhau, rồi quay lui. `test.js` đối chiếu solver với vét cạn mọi vòng trên bàn 4×4 và 5×5 (400 đề ngẫu nhiên), đề tay 1 / 4 / 0 nghiệm, rồi kiểm tra nghiệm duy nhất của đề sinh ra ở mọi mode (60 / 40 / 20 seed + 4 ngày; khi viết đã chạy thêm 1000 / 400 / 200 seed, không đề nào có hai nghiệm).

Thời gian sinh một đề ("chậm ×4 / ×6" là Chromium giả lập CPU chậm 4 / 6 lần; trung vị / p95 / chậm nhất):

| Mode | Node 24 (1000 / 400 / 200 seed) | Chromium | Chromium chậm ×4 | Chromium chậm ×6 |
| --- | --- | --- | --- | --- |
| `s` 6×6 | 0,8 / 1,9 / 8 ms | 1 / 3 / 3 ms | 4 / 8 / 9 ms | 5 / 11 / 14 ms |
| `m` 8×8 (cả `daily`) | 4,9 / 9,2 / 14,5 ms | 6 / 10 / 12 ms | 22 / 49 / 50 ms | 40 / 75 / 78 ms |
| `l` 10×10 | 17 / 28 / 51 ms | 18 / 26 / 32 ms | 79 / 109 / 115 ms | 126 / 174 / 251 ms |

Đủ nhanh (< 300 ms ở máy chậm ×6) nên không cần đề sinh sẵn (`puzzles.js`).

## Ghi điểm trên cổng

- Metric `time_low` (giải nhanh nhất), điểm game 5; điểm từng mode như bảng trên.
- `min_time_ms`: Dễ 800, Vừa / Hằng ngày 1500, Khó 3500. Lập luận: kéo một nét dài vẽ được nhiều đoạn rất nhanh (~40 ms mỗi ô), nên giới hạn thật là số **chỗ rẽ** (mỗi chỗ rẽ = đổi hướng ngón tay, ~150 ms kể cả khi đã biết sẵn đáp án). Vòng ít chỗ rẽ nhất mà bộ sinh tạo ra (đo trên 1000 / 400 / 200 seed và các seed của `test.js`): 6×6 có 4 chỗ rẽ (vòng chữ nhật 14 đoạn), 8×8 có 14 (34 đoạn), 10×10 có 28 (62 đoạn) → khoảng 600 + ~300 ms phản xạ / 2100 / 4200 ms, chưa tính thời gian đọc đề. Đặt ngưỡng thấp hơn một chút để không chặn oan: 800 / 1500 / 3500 ms.
- Mỗi đề là một ván: đề mới `kit.sdk.start(mode)`, mở lại đề dở `kit.sdk.start(mode, true)`.
- Giải xong: `kit.sdk.end({ mode, won: true, timeMs, assisted })` (`assisted` = đã dùng gợi ý).
- Bỏ đề đã đi ít nhất một nước (Đề mới / đổi mode, có hỏi xác nhận): gửi `won: false`; chưa đi nước nào thì không gửi gì.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-masyu-settings-v1` | Cài đặt: giao diện, mode (`mode`), cỡ thường gần nhất (`size`), báo lỗi (`errors`: `auto` / `on` / `off`), đã xem hướng dẫn (`guideSeen`) |
| `playnine-masyu-stats-v1` | Đã chơi, đã giải, chuỗi thắng, kỷ lục từng mode, kết quả đề ngày (120 ngày gần nhất), chuỗi ngày dài nhất |
| `playnine-masyu-save-v1` | Đề đang giải dở: mode, seed / ngày, hạt, lời giải, trạng thái các cạnh, lịch sử hoàn tác / làm lại, số gợi ý, thời gian |
| `playnine-masyu-summary-v1` | Tóm tắt cho thẻ game trên cổng (kèm `daily`: ngày, đã chơi chưa, chuỗi ngày) |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng (sai cỡ, hạt không khớp lời giải, lời giải không phải một vòng hợp lệ, seed đề ngày không khớp ngày, lịch sử sai dạng…) bị bỏ và chia đề mới. Đề ngày đã có kết quả thì không mở lại từ ván lưu.

## Kiểm tra

```bash
node test.js
```

Test e2e trong cổng (`e2e.spec.ts`): ván lưu 6×6 (bốn hạt đen ở góc, vòng quanh viền) còn thiếu một đoạn, chạm nốt thì cổng nhận `pn:end` thắng; bỏ đề đã đi nước thì nhận `pn:end` thua; đổi cỡ trước nước đầu thì chỉ có `pn:start` mới.
