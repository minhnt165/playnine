# Pinball

Game Pinball của PlayNine: một bàn pinball dọc tự thiết kế, chủ đề **Tinh Vân** (vũ trụ), vật lý 2D tự viết. Phóng bi bằng lò xo, giữ bi bằng hai flipper, đập hành tinh (bumper), hạ dãy thiên thạch (target), thắp làn U F O, chạy ramp quỹ đạo để mở multiball. Viết bằng HTML + CSS + JavaScript thuần, vẽ bằng `<canvas>`, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Bàn chơi

Bàn 600 × 1000 đơn vị (y hướng xuống), bi bán kính 13.

| Thành phần | Mô tả | Điểm (× hệ số) |
| --- | --- | --- |
| Lò xo (làn phải) | Giữ để nén (1 giây là nén hết), thả để phóng: tốc độ 500 → 2400 theo độ nén. Cửa một chiều ở đầu làn: bi đã vào bàn không rơi lại làn phóng | |
| 2 flipper | Dài 88, quay 58° (30° dưới → 28° trên), bật 30 rad/s, hạ 14 rad/s | |
| 3 hành tinh (bumper) | Bật bi ra ít nhất 950 đơn vị/s | 100 (500 khi Siêu hành tinh) |
| 2 slingshot | Mặt trong đá bi ra ≥ 820 khi bi va mạnh hơn 120 | 50 |
| 4 thiên thạch (target hạ được) | Ở tường trái. Hạ hết → thưởng 10.000 và 20 giây **Siêu hành tinh**, dãy dựng lại sau 1,2 giây | 750 mỗi target |
| 3 làn U F O | Qua làn chưa sáng +500 (đã sáng +100). Sáng cả ba → hệ số +1 (tối đa ×5) và +5.000; đã ×5 thì +20.000. **Bấm flipper dời các làn đang sáng** (trái: xoay trái, phải: xoay phải) như máy thật | |
| Ramp quỹ đạo | Miệng ở giữa phải, đường cong vòng qua đỉnh bàn rồi thả bi xuống inlane trái. Bi chạy theo đường cong, chậm dần khi leo dốc (cần ~1.200 đơn vị/s ở miệng); thiếu lực thì lăn ngược ra | 5.000 |
| Multiball | Vòng quỹ đạo thứ 3 mở multiball 2 bi (bi thứ hai tự phóng, 10 giây ball save). Trong multiball mỗi vòng quỹ đạo là **jackpot** | 25.000 |
| Skill shot | Sau khi phóng, bi rơi vào làn đang nhấp nháy (chọn theo seed) trong 5 giây đầu | 15.000 |
| Inlane / outlane | Inlane dẫn bi về flipper, outlane rơi thẳng xuống lỗ | 1.000 / 2.500 |
| Ball save | 8 giây đầu sau khi phóng mỗi bi: bi rơi được trả lại (tự phóng) | |

- Mỗi ván 3 bi. Mất bi thì hệ số về ×1, các làn tắt, Siêu hành tinh dừng; số vòng quỹ đạo (tiến tới multiball) và dãy target giữ nguyên.
- **Tìm bi**: bi đứng yên quá 5 giây ở chỗ không phải flipper / làn phóng thì được đẩy nhẹ ra (an toàn, thực tế không gặp trong 40 ván thử).
- **Không có nghiêng bàn (nudge / tilt)**: trên điện thoại hai nửa màn hình đã dành cho flipper và góc dưới phải cho lò xo, thêm cử chỉ lắc bàn sẽ dễ bấm nhầm; tilt còn làm điểm phụ thuộc thao tác khó kiểm soát. Bỏ để giữ điều khiển gọn.

## Vật lý

- Nhịp cố định 1/120 giây (đọc input), mỗi nhịp 4 bước con 1/480 giây. Trọng lực theo độ nghiêng bàn 6,5°: `g · sin 6,5°`, 1 m = 1200 đơn vị (≈ 1333 đơn vị/s²). Tích phân kiểu leapfrog (nửa cú hích trọng lực đầu và cuối bước con) nên rơi tự do đúng `½·g·t²`.
- **Va chạm liên tục**: trong mỗi bước con tìm va chạm sớm nhất theo thời gian tiếp xúc rồi đi tới đúng lúc đó, xử lý, đi tiếp phần còn lại. Tường (đoạn thẳng và hai đầu đoạn), cột / bumper (hình tròn), bi – bi: giải phương trình bậc hai. Flipper đang quay: khoảng cách chính xác tới vỏ lồi hai hình tròn (gốc r 12, đầu r 6,5) + "tiến bảo thủ" (mỗi lần tiến một khoảng không thể vượt quá khoảng cách hiện tại / (|v| + |ω|·tầm với)). Nhờ vậy bi không xuyên flipper / tường kể cả ở tốc độ tối đa 3200 đơn vị/s.
- Phản xạ theo vận tốc tương đối với mặt chạm: flipper truyền vận tốc điểm chạm `ω × r` vào bi (đánh gần đầu flipper mạnh hơn gần gốc). Hệ số nảy: tường 0,45, cao su 0,7, flipper 0,4, target 0,4, bi – bi 0,9. Va chậm (< 40) thì không nảy, không mất vận tốc tiếp tuyến: bi lăn theo dốc ray / flipper tự nhiên và nằm yên được trong khe flipper (đỡ bi).
- Tất định: PRNG mulberry32 lưu trong ván (làn skill shot, cú đẩy "tìm bi"); cùng seed + cùng chuỗi input theo nhịp ra cùng một ván.

## Điều khiển

| Phím | Chức năng |
| --- | --- |
| `←` / `Z` / `Shift` trái | Flipper trái |
| `→` / `M` / `Shift` phải | Flipper phải |
| `↓` / `Space` (giữ) | Nén lò xo, thả để phóng; ở màn chờ / hết ván: bắt đầu |
| `P` / `Esc` | Tạm dừng (`P` / `Enter` / `Space` để chơi tiếp) |
| `Enter` | Bắt đầu / chơi tiếp |
| `N` | Ván mới |

- **Chạm**: giữ nửa trái / nửa phải (tính theo giữa bàn) là flipper tương ứng, đa chạm (giữ cả hai cùng lúc được). Cả vùng chơi nhận chạm, kể cả hai cột HUD khi màn hình ngang. Khi bi nằm chờ trên lò xo, chạm vào góc dưới phải là lò xo: kéo xuống (16% chiều cao bàn = nén hết, kéo lùi thì nhả bớt) hoặc giữ yên (nén dần như phím) rồi thả để phóng; có mũi tên "Kéo" gợi ý.
- Tự tạm dừng khi trang ẩn hoặc mở hộp thoại; cửa sổ mất focus thì nhả hết phím / chạm đang giữ. Lần đầu mở có hướng dẫn (lưu `guideSeen`).
- Âm thanh qua `kit.sfx` (flip, pop, tap, place, combo, tick, levelup, coin, win, start, move, clear, drop, error, lose). Rung nhẹ khi trúng bumper / slingshot, mất bi, jackpot… tắt được trong Cài đặt.
- Giao diện sáng / tối: màu bàn lấy từ token CSS (`--pf-*`, `--c-*`). Giảm chuyển động: không hạt, không nhấp nháy đèn (đèn sáng đứng yên), chữ không bay; vật lý giữ nguyên.
- Màn hình dọc: HUD một hàng trên bàn; ngang: bàn ở giữa, HUD hai bên. Bàn giữ tỉ lệ 3 : 5, co theo khung (390 × 844 không cuộn).

## Mode và ghi điểm trên cổng

Một mode `classic` (Cổ điển), metric `score_high`, 5 điểm tham gia.

- Bấm Bắt đầu: `kit.sdk.start('classic')`; mở lại ván lưu dở: `kit.sdk.start('classic', true)`.
- Hết 3 bi: `kit.sdk.end({ mode: 'classic', won: false, score, assisted: false })` (game vô tận, không có thắng).
- Bỏ ván (Ván mới → xác nhận) khi đã có điểm hoặc đã chơi ≥ 1 giây: gửi `won: false` với điểm hiện có. Chưa thì không gửi gì.
- Luật chống gian lận: `min_duration_ms` 5000, `max_score_per_sec` 20000 (số đo bên dưới).

### Đo `max_score_per_sec`

Bot (script tạm, không nằm trong repo) chơi bằng chính engine: lập kế hoạch bằng mô phỏng thử nhiều thời điểm bật flipper (đỡ bi, thả cho lăn rồi bật để ngắm ramp / target, chọn lực lò xo để ăn skill shot) nhưng **phản xạ trễ 167 ms** (quyết định lúc t chỉ đổi tay được từ t + 20 nhịp) và lệch tay ±8 ms. Tốc độ = điểm / thời gian từ đầu ván, xét từ giây thứ 5, lấy cao nhất trên cả ván. Điểm có bậc nhảy (skill shot 15.000 ngay đầu ván, dãy target 10.000, jackpot 25.000 × hệ số tới ×5) nên ngưỡng đặt rộng. Kết quả 24 seed (ván tới 214 giây, điểm 39.800 → 1.189.250): tốc độ cao nhất **8.245 điểm/s** (giây 143 của ván có 3 multiball, hệ số cao); đầu ván cao nhất 4.720 điểm/s ở giây thứ 5 (skill shot). Tốc độ tăng dần theo hệ số (×5 nhân cả jackpot) nên ván dài của người giỏi hơn bot có thể vượt mức bot; đặt **20.000** (≈ 2,4 lần mức đo) để không chặn oan.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-pinball-settings-v1` | Cài đặt: giao diện, rung, đã xem hướng dẫn |
| `playnine-pinball-stats-v1` | Thống kê: số ván, kỷ lục, tổng điểm (tính trung bình), số vòng quỹ đạo, số dãy thiên thạch, số jackpot |
| `playnine-pinball-save-v1` | Ván đang chơi dở (`{ v: 1, game }`, `game` là `toJSON` của engine: vị trí / vận tốc từng bi, góc flipper, lò xo, đèn, đồng hồ, PRNG), ghi khi tạm dừng / rời trang; mở lại ở trạng thái tạm dừng |
| `playnine-pinball-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng (sai phiên bản, số không hợp lệ, bi ra ngoài bàn / quá nhanh, flipper sai góc…) bị bỏ qua.

## Kiểm tra

```bash
node test.js
```

Test engine phủ: trọng lực theo độ nghiêng, rơi tự do và ném xiên đúng công thức; nảy tường / cột cao su theo hệ số; bi rơi vào flipper đứng yên nảy theo pháp tuyến; flipper đang đánh truyền vận tốc đúng hướng (lệch về phía đối diện, gần đầu nhanh hơn, hai bên đối xứng); flipper giơ lên đỡ được bi nằm yên; **không xuyên** flipper (hàng trăm cú tốc độ tối đa vào flipper đứng yên / đang bật / đang hạ, kiểm từng nhịp cả lấn vật lẫn đổi mặt), tường / vòm / bumper / slingshot / target (400 cú mọi hướng) và trong 6 ván bấm ngẫu nhiên dài có multiball; bumper / slingshot đẩy ra và cộng điểm (chạm nhẹ không đá); target hạ hết → thưởng + Siêu hành tinh + dựng lại; rollover → hệ số, trần ×5; flipper dời làn sáng; lò xo theo thời gian nén (phím) và theo độ kéo (cảm ứng); cửa một chiều; skill shot; ramp đủ / thiếu lực; multiball + jackpot; ball save; mất bi; hết 3 bi → hết ván; tất định; lưu / khôi phục chạy tiếp y hệt; từ chối dữ liệu hỏng.

`e2e.spec.ts` chạy trong cổng: ván lưu bi cuối đang rơi qua khe giữa hai flipper báo đúng `pn:end` kèm điểm; bỏ ván đã có điểm báo `won: false` rồi `pn:start` ván mới.
