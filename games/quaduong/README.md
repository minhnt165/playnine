# Qua Đường

Game Qua Đường (Road Crossing) của PlayNine: dẫn vịt con băng qua con đường vô tận gồm đường xe chạy, sông có gỗ trôi và đường ray có tàu hỏa. Viết bằng HTML + CSS + JavaScript thuần, vẽ bằng `<canvas>`, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo lượt qua SDK.

## Luật

- Bàn chơi rộng 9 cột, các làn nối tiếp nhau về phía trước. Mỗi lần nhảy đi đúng một ô (150 ms).
- **Điểm** = hàng xa nhất từng tới (lùi lại không mất điểm).
- **Bãi cỏ**: an toàn, cây cối chắn lối (nhảy vào cây thì đứng yên, không mất lượt).
- **Đường**: ô tô, xe tải, xe máy chạy hai chiều với tốc độ khác nhau; chạm xe là hết lượt (kể cả khi đang nhảy).
- **Sông**: phải đứng trên khúc gỗ / thuyền và trôi theo nó. Rơi xuống nước, hoặc bị gỗ đưa ra khỏi mép màn hình, là hết lượt.
- **Đường ray**: đèn đỏ nhấp nháy 1,2 giây trước khi tàu tới; tàu chạy rất nhanh.
- **Đại bàng**: màn hình luôn trôi lên chậm. Đứng yên quá lâu (khoảng 11 giây lúc đầu, nhanh dần) hoặc lùi quá 4 hàng sau kỷ lục của lượt là đại bàng sà xuống bắt.
- Độ khó tăng dần theo quãng đường (xe nhanh hơn và dày hơn, gỗ ngắn hơn, khe sông rộng hơn, tàu dày hơn, nhiều cây hơn) rồi giữ nguyên từ hàng 204.

### Bảo đảm luôn có đường qua (có test trong `test.js`)

- Làn sinh tuần tự theo seed (mulberry32), cùng seed luôn ra cùng con đường.
- Cỏ: luôn còn ít nhất 3 ô trống, luôn có lối đi lên từ vùng đi được của làn trước, và hai làn cỏ liền nhau không tạo ngõ cụt.
- Sông: gỗ dài 2–4 ô, khe 1–3 ô, tốc độ được chặn dưới để mọi cột đều có gỗ trôi tới trong tối đa 2,5 giây; hai làn sông liền nhau luôn trôi ngược chiều.
- Đường: khe giữa hai xe luôn dài hơn 3 lần thời gian một cú nhảy.
- Ray: giữa hai chuyến tàu có ít nhất 1,5 giây yên sau khi tắt đèn.
- Test còn cho một bot tìm đường (BFS trên bản sao ván, môi trường tất định) đi hết 260 hàng trên 8 seed.

## Điều khiển

- Chạm vào bàn chơi: nhảy lên trước. Vuốt: nhảy theo hướng vuốt (nhảy ngay khi ngón tay vượt ngưỡng).
- Bàn phím: phím mũi tên hoặc WASD. Bấm trong lúc đang nhảy thì lệnh được giữ lại và nhảy tiếp ngay khi chạm đất.
- Tự tạm dừng khi trang bị ẩn hoặc mở hộp thoại.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `↑` `↓` `←` `→` / `W` `A` `S` `D` | Nhảy |
| `Space` / `Enter` | Bắt đầu, chơi tiếp, chơi lại |
| `P` / `Esc` | Tạm dừng / chơi tiếp |
| `N` | Lượt mới |
| `Esc` | Đóng hộp thoại |

## Mode và ghi điểm trên cổng

Một mode `classic` (Cổ điển), metric `score_high`, 5 điểm mỗi lượt.

- Bấm Bắt đầu: `kit.sdk.start('classic')`; mở lại lượt lưu dở: `kit.sdk.start('classic', true)`.
- Hết lượt: `kit.sdk.end({ mode: 'classic', won: false, score, assisted: false })` (game vô tận, không có thắng).
- Bỏ lượt giữa chừng (nút Ván mới) khi đã có điểm hoặc đã chơi ≥ 1 giây: gửi `won: false` với điểm hiện có; chưa có gì thì không gửi.
- Luật chống gian lận: `min_duration_ms` 5000, `max_score_per_sec` 8. Một hàng cần ít nhất một cú nhảy 9 bước mô phỏng (150 ms), nên trần cứng của engine là 6,67 hàng / giây; bot đi đường giỏi nhất nhịp bấm 150 ms đo được tối đa 6,4 hàng / giây (sau giây thứ 5), bot nhịp bấm người thật 250 ms đo được 3,83 hàng / giây. Ngưỡng 8 ≈ trần engine × 1,2 ≈ bot nhịp người × 2.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-quaduong-settings-v1` | Cài đặt (giao diện, rung, `guideSeen`) |
| `playnine-quaduong-stats-v1` | Thống kê: số lượt, kỷ lục, tổng số hàng |
| `playnine-quaduong-save-v1` | Lượt đang chơi dở (seed, bước thời gian, vị trí vịt, kỷ lục lượt, "bờ" đại bàng); xe / gỗ / tàu tính lại từ seed |
| `playnine-quaduong-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Cấu trúc

- `engine.js`: luật thuần (không DOM), bước thời gian cố định 60 bước / giây, sinh làn theo seed, `toJSON` / `fromJSON` (từ chối dữ liệu hỏng).
- `app.js`: vòng lặp `requestAnimationFrame` (giới hạn dt), vẽ canvas theo `devicePixelRatio`, camera, âm thanh `kit.sfx`, rung (tắt được trong Cài đặt).
- `e2e.spec.ts`: lượt kết thúc báo đúng `pn:end` (lượt lưu dở sắp bị đại bàng bắt) và bỏ lượt có điểm.

## Kiểm tra engine

```bash
node test.js
```
