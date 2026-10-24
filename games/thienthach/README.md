# Thiên Thạch

Game Thiên Thạch (Asteroid Field) của PlayNine: lái phi thuyền trong bãi thiên thạch không có mép, bắn vỡ đá, né đĩa bay, dọn sạch sân để sang đợt mới. Nét vẽ vector phát sáng trên canvas. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Sân vuông 720×720 đơn vị, **xuyên mép**: bay ra mép này hiện lại ở mép đối diện (tàu, đá, đạn; va chạm cũng tính qua mép). Đĩa bay chỉ xuyên mép trên / dưới.
- Tàu có **quán tính**: đẩy thì tăng tốc theo hướng mũi, thả ra vẫn trôi và chậm dần (ma sát 1,2% mỗi bước), tốc độ tối đa 7 đơn vị / bước.
- Đạn bay theo hướng mũi cộng vận tốc tàu, tầm 48 bước (~0,8 giây), tối đa 4 viên trên sân, giữ nút bắn thì bắn ~6,7 phát / giây. Đạn xét va chạm trên cả đoạn đi trong một bước nên không xuyên qua đá nhỏ.
- Đá: **lớn** (20 điểm) vỡ thành hai **vừa** (50), vừa vỡ thành hai **nhỏ** (100), nhỏ tan hẳn. Hai mảnh giữ 60% vận tốc đá mẹ cộng một phần vận tốc viên đạn, tách về hai phía.
- **Đợt**: đợt 1 có 4 đá lớn, mỗi đợt thêm 2 (tối đa 12), nhanh hơn 5% mỗi đợt (tối đa +50%). Đá mới xuất hiện gần mép, cách tàu ít nhất 220. Dọn sạch sân thì 1,5 giây sau sang đợt mới.
- **Đĩa bay**: lần đầu sau 15–22 giây, sau đó cách nhau ngắn dần theo đợt; bay ngang sân rồi rời đi, đổi hướng dọc thất thường. Đĩa **lớn** (200 điểm) bắn hướng ngẫu nhiên; đĩa **nhỏ** (1000 điểm) bắn nhắm vào tàu (lệch tối đa ±0,35 rad, càng nhiều điểm càng chuẩn), chỉ xuất hiện từ đợt 3 hoặc khi có 10.000 điểm. Đạn đĩa bay làm vỡ đá (không ai được điểm); đĩa đâm đá thì cả hai nổ, không điểm.
- **Mạng**: 3 mạng, cứ 10.000 điểm thêm 1 (tối đa 9). Đâm đá / đĩa bay hay trúng đạn thì nổ (đâm đá vẫn được điểm tảng đá đó). Sau 2 giây tàu hồi sinh ở tâm sân, **chỉ khi** trong bán kính 120 quanh tâm không có đá, đĩa bay hay đạn địch (sân hiện "Chờ tâm sân trống…"), kèm 2,5 giây bất tử (nhấp nháy + vòng khiên).
- **Dịch chuyển**: tàu biến mất 0,6 giây rồi hiện ở chỗ ngẫu nhiên, đứng yên; có rủi ro nổ khi hiện ra (8% + 0,5% mỗi tảng đá trên sân, tối đa 25%). Phải nhả phím mới dịch chuyển lại được, và chờ 0,75 giây.
- Hết mạng là hết ván. Game vô tận, không có thắng; xếp hạng theo điểm.
- Engine tất định: PRNG mulberry32 lưu trong ván, mô phỏng bước cố định 1/60 giây; cùng seed + cùng chuỗi input ra cùng một ván.

## Điều khiển

- **Bàn phím**: xem bảng phím tắt.
- **Chạm, chế độ Nút** (mặc định): góc dưới trái xoay trái / phải, góc dưới phải đẩy + bắn (nút to) và nút dịch chuyển nhỏ. Nút lớn, trong mờ; trượt ngón từ nút này sang nút kia không cần nhấc tay.
- **Chạm, chế độ Cần lái** (Cài đặt → Điều khiển cảm ứng): đặt ngón trái bất kỳ đâu ở nửa trái làm tâm cần; kéo theo hướng nào tàu xoay về hướng đó (cùng tốc độ xoay như phím), kéo xa quá 60% bán kính thì đẩy. Giữ nửa phải để bắn.
- **Tự bắn** (Cài đặt): bắn liên tục không cần giữ nút, chơi được bằng một ngón. Nhịp bắn vẫn như giữ nút nên không lợi điểm.
- Màn hình dọc: sân ở trên, nút ở dải dưới; màn hình ngang: nút ở hai bên sân. Máy không cảm ứng thì ẩn nút.
- Tự tạm dừng khi trang ẩn hoặc mở hộp thoại. Lần đầu mở có hướng dẫn (lưu `guideSeen`).
- Rung nhẹ khi tàu nổ / được thêm mạng, tắt được trong Cài đặt. Giảm chuyển động: không hạt, không rung màn hình, không nhấp nháy, màn chờ đứng yên.

## Mode và ghi điểm trên cổng

Một mode `classic` (Cổ điển), metric `score_high` (điểm cao nhất), 5 điểm tham gia.

- Bấm Bắt đầu: `kit.sdk.start('classic')`; mở lại ván lưu dở: `kit.sdk.start('classic', true)`.
- Hết mạng: `kit.sdk.end({ mode: 'classic', won: false, score, assisted: false })`.
- Bỏ ván (Ván mới → xác nhận) khi đã có điểm hoặc đã chơi ≥ 1 giây: gửi `won: false` với điểm hiện có. Chưa thì không gửi gì.
- Luật chống gian lận: `min_duration_ms` 5000, `max_score_per_sec` 500. Đo bằng bot nhắm đón đầu + né đá, phản xạ 200 ms (chỉ nhìn sân mỗi 12 bước), bắn bằng nhịp tối đa của game, 200 seed, tốc độ = điểm / thời gian từ đầu ván, chỉ xét từ giây thứ 5: cao nhất 266 điểm/s (đỉnh rơi vào giây 5–8, trung bình cả ván ~130). Bot phản xạ 100 ms: 260. Trần lý thuyết của đợt 1 ở giây thứ 5 (phát nào cũng trúng) khoảng 416. Đặt 500 (≈ 1,9 lần mức bot) để người chơi giỏi vẫn qua.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-thienthach-settings-v1` | Cài đặt: giao diện, điều khiển cảm ứng (`buttons` / `stick`), tự bắn, rung, đã xem hướng dẫn |
| `playnine-thienthach-stats-v1` | Thống kê: số ván, kỷ lục, đợt xa nhất, tổng điểm (tính trung bình), số đá đã phá, số đĩa bay hạ được |
| `playnine-thienthach-save-v1` | Ván đang chơi dở (`{ v: 1, game }`, `game` là `toJSON` của engine), ghi khi tạm dừng / rời trang; mở lại ở trạng thái tạm dừng |
| `playnine-thienthach-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng (sai phiên bản, số không hợp lệ, vật ra ngoài sân, quá nhanh, quá nhiều đạn…) bị bỏ qua.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` / `→` (`A` / `D`) | Xoay |
| `↑` (`W`) | Đẩy |
| `Space` (`J` / `K`) | Bắn (giữ để bắn liên tục); ở màn chờ / hết ván: bắt đầu |
| `↓` / `H` (`S`) | Dịch chuyển |
| `P` / `Esc` | Tạm dừng (`P` / `Enter` / `Space` để chơi tiếp) |
| `Enter` | Bắt đầu / chơi tiếp |
| `N` | Ván mới |

## Kiểm tra

```bash
node test.js
```

Test engine phủ xuyên mép, quán tính / ma sát / trần tốc độ, xoay theo `aim`, nhịp bắn / giới hạn / tầm đạn, đạn nhanh không xuyên đá, đá vỡ có điểm và giữ quán tính, va chạm hình tròn qua mép, đĩa bay (lớn bắn bừa, nhỏ nhắm, nhỏ chỉ có về sau, rời sân, điểm 200 / 1000, đạn đĩa bay làm vỡ đá / nổ tàu), đợt mới, mạng thưởng, luật hồi sinh khi tâm trống, dịch chuyển rủi ro, hết ván, tất định theo seed + input, lưu / khôi phục chạy tiếp y hệt, từ chối dữ liệu hỏng, và bot phản xạ 200 ms dọn sạch đợt 1 trên 12 seed (sân chơi được). `e2e.spec.ts` chạy trong cổng: ván lưu còn 1 mạng sắp đâm đá báo đúng `pn:end` kèm điểm, bỏ ván đã có điểm báo `won: false` rồi `pn:start` ván mới.
