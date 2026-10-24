# Vệt Sáng

Game Vệt Sáng (Light Trails) của PlayNine: đấu xe ánh sáng một chọi một với máy, kiểu "light cycles" cổ điển. Viết bằng HTML + CSS + JavaScript thuần, vẽ bằng `<canvas>`, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo trận qua SDK.

## Luật

- Đấu trường lưới 40 × 40 ô. Bạn lái xe xanh (xuất phát phía dưới, đi lên), máy lái xe hồng (phía trên, đi xuống); vị trí xuất phát lệch ngang ngẫu nhiên, luôn đối xứng tâm.
- Mỗi tick hai xe cùng đi một ô; ô đã đi qua thành vệt sáng đặc. Không quay đầu được.
- Đâm vào tường hoặc bất kỳ vệt nào (kể cả vệt của mình) là thua hiệp, bên kia được 1 hiệp.
- Hai xe đâm trong cùng một tick (lao vào cùng một ô, đổi chỗ cho nhau, hay mỗi xe đâm một chỗ) là **hòa**: không ai được hiệp, hiệp đó đấu lại từ đầu.
- Ai thắng 3 hiệp trước thắng trận (trận luôn có người thắng, hòa chỉ làm trận dài thêm).
- Tốc độ tăng theo thời gian của hiệp: 8 ô/giây lúc đầu, +0,12 ô/giây mỗi giây, tối đa 14 ô/giây. Trước mỗi hiệp đếm ngược 3-2-1 (1,8 s), sau mỗi hiệp nghỉ 1,2 s.

## Điều khiển

- Bàn phím: `←` `↑` `→` `↓` hoặc `W` `A` `S` `D` (hướng tuyệt đối). Bấm nhanh được xếp hàng (tối đa 3 lệnh): rẽ hai lần trước một tick thì dùng ở hai tick liên tiếp, không mất phím. Lệnh quay đầu / trùng hướng bị bỏ qua.
- Vuốt trên đấu trường: mỗi đoạn vuốt đủ dài theo một trục là một lệnh rẽ (vuốt chữ L liền một hơi = hai lệnh).
- Nút rẽ trái / phải lớn (Cài đặt → Nút rẽ; mặc định bật trên màn hình cảm ứng): rẽ tương đối theo hướng xe, rẽ ngay khi chạm xuống. Màn hình dọc nút nằm dưới đấu trường, màn hình ngang nằm hai bên.
- Có thể rẽ trước trong lúc đếm ngược.

## Mức của máy

Chọn ở màn chờ hoặc trong Cài đặt. Đổi mức khi hiệp đầu chưa chạy thì chia lại trận với mức mới; đã chạy thì áp dụng từ trận sau.

| Mức | Cách chọn hướng | Sai sót / phản ứng |
| --- | --- | --- |
| Dễ | chỉ nhìn ô ngay trước mặt: bị chặn thì rẽ sang bên trống | 7% tick "không nhìn" (đi thẳng), 5% rẽ ngẫu nhiên khi đang thoáng |
| Vừa | flood fill: chọn hướng có vùng trống lớn nhất | 2% tick chọn bừa một hướng an toàn; không để ý đối thủ |
| Khó | còn chung vùng với bạn: phân vùng Voronoi + tìm kiếm 2 lượt (máy, bạn) có cắt tỉa; đã tách vùng: lấp vùng của mình (vùng lớn nhất, bám vệt) | nhìn bạn trễ 2 tick (thời gian phản ứng); phản xạ tránh ô bạn có thể lao vào ngay |

Tỉ lệ thắng khi cho máy đấu máy (`node test.js`, seed cố định): Vừa thắng Dễ 100% (30 trận), Khó thắng Dễ 100% (20 trận), Khó thắng Vừa ~80% (30 trận; 82% trên 60 trận). Trận máy–máy dài trung bình 45–120 s. Một lần chọn hướng của mức Khó mất trung bình 0,25 ms, chậm nhất ~6 ms (máy tính), không cần chia nhỏ theo khung.

## Ghi điểm trên cổng

- `metric: wins`; mode là mức máy: `easy` (6 điểm), `medium` (10 điểm), `hard` (16 điểm). Thấp hơn mức 10/15/25 của lộ trình vì trận chỉ 1–2 phút (ngang Bóng Bàn, cũng 6/10/16).
- Bấm Bắt đầu: `kit.sdk.start(level)`; mở lại trận lưu dở: `kit.sdk.start(level, true)` ngay khi tải trang.
- Hết trận: `kit.sdk.end({ mode, won, assisted: false })`. Thua trận gửi `won: false`; hòa chỉ có ở từng hiệp (đấu lại), không có trận hòa.
- Bỏ trận (Trận mới) sau khi hiệp đầu đã chạy: gửi `won: false`; còn đang đếm ngược hiệp đầu thì không gửi gì.
- Chống gian lận: `min_duration_ms` 9000 cho mọi mức. Trận thắng nhanh nhất có thể: 3 lần đếm ngược (3 × 1,8 s) + 2 lần nghỉ (2 × 1,2 s) + 3 hiệp mà máy đâm sớm nhất. Một xe không thể đâm trước tick thứ 4 (quanh ô xuất phát trống, tường cách ≥ 5 ô, đối thủ cách ≥ 25 ô), 4 tick ở 8 ô/giây ≈ 0,5 s ⇒ ≈ 9,3 s (test mô phỏng máy tự đâm nhanh nhất ra đúng 9300 ms).

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-vetsang-settings-v1` | Cài đặt: giao diện, mức máy (`level`), nút rẽ (`pad`), rung (`vibrate`), đã xem hướng dẫn (`guideSeen`) |
| `playnine-vetsang-stats-v1` | Thống kê: số trận, thắng, số hiệp thắng, chuỗi thắng, số trận / thắng theo mức |
| `playnine-vetsang-save-v1` | Trận đang dở (sau khi hiệp đầu đã chạy), lưu cả giữa hiệp: tỉ số, đường đi của hai xe (các điểm góc), hàng đợi rẽ, PRNG của máy. Mở lại thì đếm ngược rồi chạy tiếp đúng chỗ |
| `playnine-vetsang-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `→` `↓` / `W` `A` `S` `D` | Lái |
| `Space` / `Enter` | Bắt đầu, chơi tiếp |
| `P` / `Esc` | Tạm dừng / chơi tiếp (chơi tiếp giữa hiệp có đếm ngược) |
| `N` | Trận mới (đã chạy hiệp đầu thì hỏi trước, tính là thua) |

Game tự tạm dừng khi trang bị ẩn hoặc mở hộp thoại.

## Kiểm tra engine

```bash
node test.js
```

Engine (`engine.js`) chạy bước cố định 1/120 s, tất định theo seed + chuỗi input (lệnh rẽ). Test phủ đếm ngược, di chuyển, tốc độ, hàng đợi rẽ, đâm tường / vệt, hòa đối đầu, thắng 3 hiệp, tất định, máy từng mức (tránh tường, tránh ngõ cụt, tránh ô đối đầu), mức cao thắng mức thấp, trận thắng nhanh nhất ≥ 9 s, ván lưu dựng sẵn của e2e, lưu / khôi phục giữa hiệp và từ chối dữ liệu hỏng (khoảng 10 s). `e2e.spec.ts` chạy trong cổng (thắng, thua, bỏ trận, chọn mức).
