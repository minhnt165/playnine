# Khúc Côn Cầu

Game Khúc Côn Cầu (Air Hockey) của PlayNine: đấu chày một chọi một với máy trên bàn khúc côn cầu trên không. Viết bằng HTML + CSS + JavaScript thuần, vẽ bằng `<canvas>`, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo trận qua SDK.

## Luật

- Chày của bạn (đỏ) ở dưới, chày của máy (xanh) ở trên; màn hình ngang rộng thì bạn bên trái, máy bên phải. Mỗi chày chỉ đi trong nửa sân của mình.
- Đánh đĩa vào khe khung thành của đối phương là ghi bàn. Đĩa dội thành bên và hai đầu bàn (ngoài miệng khung), va cột khung thì bật ra.
- Va chạm chày – đĩa theo xung lượng của hệ hai vật (chày nặng gấp 8 lần đĩa, hệ số hồi phục 0,9): vung chày càng nhanh đĩa bay càng mạnh. Thành bàn dội với hệ số 0,9, ma sát nhẹ (tốc độ còn khoảng 74% sau 1 s), trần tốc độ đĩa 1700 đơn vị/giây trên bàn 360 × 640.
- Đầu trận tung đồng xu chọn bên giao đĩa; sau mỗi bàn, bên thủng lưới được giao đĩa. Đĩa đứng yên ở nửa sân bên được giao 1 s (vòng đếm quanh đĩa) rồi mới được đánh; nghỉ 1,5 s sau mỗi bàn.
- Chống câu giờ: đĩa nằm một nửa sân quá 7 s thì bên kia được giao đĩa.
- Ai tới 7 bàn trước thì thắng (không có hòa).

## Điều khiển

- Chuột: rê chuột, chày theo con trỏ (có trần tốc độ, không ra khỏi nửa sân).
- Chạm: kéo ở bất kỳ đâu trên bàn, chày theo ngón tay; chày nằm hơi phía trên đầu ngón tay để ngón tay không che chày.
- Bàn phím: giữ `←` `→` `↑` `↓` (hoặc `W` `A` `S` `D`) theo hướng trên màn hình, cả khi bàn nằm ngang.

## Mức của máy

Chọn ở màn chờ hoặc trong Cài đặt. Đổi mức khi trận chưa thả đĩa thì chia lại trận với mức mới; đã thả thì áp dụng từ trận sau.

| Mức | Trễ phản ứng | Tốc độ chày | Đoán đường đĩa | Lối chơi |
| --- | --- | --- | --- | --- |
| Dễ | 0,33 s | 300 | không (nhìn chỗ đĩa đang ở) | chỉ đỡ trước khung, đẩy đĩa chậm ra khỏi sân mình |
| Vừa | 0,22 s | 600 | đường thẳng, không tính dội thành | đỡ + phản công khi đĩa ở nửa sân mình, nhắm thẳng khung |
| Khó | 0,18 s | 760 | có dội thành và ma sát | đỡ + phản công, chọn đánh thẳng hay dội thành bên nào xa chày bạn nhất |

Mỗi lượt đĩa tới, máy có sai số chỗ đứng (40 / 24 / 18 đơn vị) và sai số góc đánh. Máy không bao giờ vượt tốc độ chày và độ trễ của mức (có test).

Tỉ lệ thắng đo trong `node test.js` (16 trận mỗi cặp; "bot người" là người chơi khá: phản ứng 0,25 s, đoán được đường dội thành):

| Cặp (bên dưới – máy) | Bên dưới thắng | Tỉ số cộng dồn | Thời gian trung bình |
| --- | --- | --- | --- |
| Bot người – Dễ | 16/16 | 112–24 | ~1 phút 46 |
| Bot người – Vừa | 14/16 | 109–61 | ~4 phút 25 |
| Bot người – Khó | 5/16 | 83–101 | ~5 phút |
| Khó – Dễ | 16/16 | 112–8 | ~1 phút 48 |
| Vừa – Dễ | 16/16 | 112–7 | ~2 phút |
| Khó – Vừa | 15/16 | 111–30 | ~8 phút |

## Ghi điểm trên cổng

- `metric: wins`; mode là mức máy: `easy` (10 điểm), `medium` (15 điểm), `hard` (25 điểm).
- Bấm Bắt đầu: `kit.sdk.start(level)`; mở lại trận lưu dở: `kit.sdk.start(level, true)` ngay khi tải trang.
- Hết trận: `kit.sdk.end({ mode, won, assisted: false })`; thắng là `won: true`, thua là `won: false` (không có hòa).
- Bỏ trận (Trận mới) sau lần thả đĩa đầu tiên: gửi `won: false`; chưa thả đĩa (dưới 1 s) thì không gửi gì.
- Chống gian lận: `min_duration_ms` 15000 cho mọi mức. Trận 7-0 nhanh nhất có thể = 7 lần giao đĩa (1 s) + 7 quãng đĩa từ chỗ giao gần khung máy nhất (190 đơn vị) tới vạch khung ở trần tốc độ (0,11 s) + 6 lần nghỉ sau bàn (1,5 s) ≈ 16,8 s (`fastestWin()` trong engine, có test). Trận thật với bot giỏi dài 1–8 phút.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-khucconcau-settings-v1` | Cài đặt: giao diện, mức máy (`level`), rung (`vibrate`), đã xem hướng dẫn (`guideSeen`) |
| `playnine-khucconcau-stats-v1` | Thống kê: số trận, thắng, bàn đã ghi, chuỗi thắng, số trận / thắng theo mức |
| `playnine-khucconcau-save-v1` | Trận đang dở (sau lần thả đĩa đầu). Mở lại thì giao đĩa lại ở tỉ số đã lưu cho bên đang giữ đĩa |
| `playnine-khucconcau-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `→` `↑` `↓` / `W` `A` `S` `D` | Di chuyển chày |
| `Space` / `Enter` | Bắt đầu, chơi tiếp |
| `P` / `Esc` | Tạm dừng / chơi tiếp |
| `N` | Trận mới (đang chơi dở thì hỏi trước, tính là thua) |

Game tự tạm dừng khi trang bị ẩn hoặc mở hộp thoại.

## Kiểm tra engine

```bash
node test.js
```

Engine (`engine.js`) chạy bước cố định 1/120 s (mỗi bước 4 bước con chống xuyên), tất định theo seed + chuỗi input. Test phủ ma sát, dội thành / cột khung, va chạm chày theo công thức xung lượng (kiểm cả bảo toàn động lượng), thành phần tiếp tuyến, chống xuyên, trần tốc độ, đĩa kẹt góc không bị bơm năng lượng, giới hạn chày người chơi, giao đĩa, ghi bàn, chống câu giờ, thắng ở 7 bàn, cận dưới thời gian trận, tốc độ / độ trễ của máy, đoán quỹ đạo có dội thành, mức mạnh dần (bot người và máy đấu máy), lưu / khôi phục, từ chối dữ liệu hỏng và hai ván lưu dùng trong `e2e.spec.ts`. `e2e.spec.ts` chạy trong cổng (thắng, thua, bỏ trận, chọn mức).
