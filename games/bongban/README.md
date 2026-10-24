# Bóng Bàn

Game Bóng Bàn (Table Tennis) của PlayNine: đấu vợt một chọi một với máy, kiểu game vợt và bóng cổ điển. Viết bằng HTML + CSS + JavaScript thuần, vẽ bằng `<canvas>`, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo trận qua SDK.

## Luật

- Vợt của bạn ở dưới (màn hình ngang: bên trái), vợt của máy ở trên (bên phải). Đánh bóng qua vợt của đối thủ để ghi điểm.
- Chỗ bóng chạm vợt quyết định góc bay: giữa vợt bóng đi thẳng, mép vợt bóng lệch tối đa 60°.
- Vừa lia vợt vừa đánh tạo xoáy nhẹ: bóng cong dần theo hướng lia (xoáy tắt dần, chạm cạnh bàn thì hết xoáy).
- Mỗi lần chạm vợt bóng nhanh thêm một chút (360 → tối đa 860 đơn vị/giây trên bàn dài 640).
- Đổi giao mỗi 2 điểm, từ 10–10 đổi mỗi điểm. Trước mỗi quả giao có đếm ngược 3-2-1 (1,5 s); bóng nằm trên vợt người giao và đi theo vợt.
- Ai tới 11 điểm trước và hơn đối thủ 2 điểm thì thắng trận.

## Điều khiển

- Chuột: rê chuột, vợt theo vị trí chuột.
- Chạm: kéo ở bất kỳ đâu trên bàn, vợt theo ngón tay (không cần chạm đúng vào vợt).
- Bàn phím: giữ `←` `→` (hoặc `A` `D`); màn hình ngang dùng `↑` `↓` (hoặc `W` `S`), hai cặp phím đều chạy ở cả hai hướng.

## Mức của máy

Chọn ở màn chờ hoặc trong Cài đặt. Đổi mức khi trận chưa giao quả nào thì chia lại trận với mức mới; đã giao thì áp dụng từ trận sau.

| Mức | Trễ phản ứng | Tốc độ vợt | Đoán điểm rơi | Ghi chú |
| --- | --- | --- | --- | --- |
| Dễ | 0,30 s | 240 | không (chạy theo bóng) | sai số lớn |
| Vừa | 0,20 s | 330 | có (tính cả dội cạnh) | sai số vừa |
| Khó | 0,125 s | 450 | có | sai số nhỏ, cố đánh bóng ra xa bạn |

Sai số điểm chạm của máy tăng theo tốc độ bóng và độ xoáy, nên bóng càng nhanh, càng cong thì máy càng dễ đánh trượt. Máy không bao giờ vượt tốc độ vợt và độ trễ của mức (có test).

## Ghi điểm trên cổng

- `metric: wins`; mode là mức máy: `easy` (6 điểm), `medium` (10 điểm), `hard` (16 điểm).
- Bấm Bắt đầu: `kit.sdk.start(level)`; mở lại trận lưu dở: `kit.sdk.start(level, true)` ngay khi tải trang.
- Hết trận: `kit.sdk.end({ mode, won, assisted: false })`.
- Bỏ trận (Trận mới) sau quả giao đầu tiên: gửi `won: false`; chưa giao quả nào thì không gửi gì.
- Chống gian lận: `min_duration_ms` 30000 cho mọi mức. Điểm nhanh nhất = đếm ngược 1,5 s + quả giao bay hết bàn ≈ 1,68 s; giữa các điểm nghỉ 0,9 s. Trận 11-0 nhanh nhất ≈ 11 × 3,18 + 10 × 0,9 ≈ 44 s (test mô phỏng máy đứng im cũng ra 11-0 sau hơn 30 s). Trận thật với bot giỏi kéo dài 1–5 phút.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-bongban-settings-v1` | Cài đặt: giao diện, mức máy (`level`), rung (`vibrate`), đã xem hướng dẫn (`guideSeen`) |
| `playnine-bongban-stats-v1` | Thống kê: số trận, thắng, chuỗi thắng, loạt chạm dài nhất, số trận / thắng theo mức |
| `playnine-bongban-save-v1` | Trận đang dở (sau quả giao đầu). Mở lại thì giao lại quả đang đánh ở tỉ số đã lưu |
| `playnine-bongban-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `→` / `↑` `↓` / `A` `D` / `W` `S` | Di chuyển vợt |
| `Space` / `Enter` | Bắt đầu, chơi tiếp |
| `P` / `Esc` | Tạm dừng / chơi tiếp |
| `N` | Trận mới (đang đánh dở thì hỏi trước, tính là thua) |

Game tự tạm dừng khi trang bị ẩn hoặc mở hộp thoại.

## Kiểm tra engine

```bash
node test.js
```

Engine (`engine.js`) chạy bước cố định 1/120 s, tất định theo seed + chuỗi input. Test phủ vật lý bóng, dội cạnh, va chạm và góc bật, xoáy, trần tốc độ, luật 11 điểm hơn 2, đổi giao, giới hạn tốc độ / độ trễ của máy, bot thắng được cả ba mức, lưu / khôi phục và từ chối dữ liệu hỏng. `e2e.spec.ts` chạy trong cổng (thắng, thua, bỏ trận, chọn mức).
