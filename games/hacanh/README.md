# Hạ Cánh

Game Hạ Cánh (Lunar Lander) của PlayNine: điều khiển tàu đổ bộ chống lại trọng lực và gió bằng một động cơ chính, đặt tàu thật êm xuống bãi phẳng giữa vùng núi. Bãi càng hẹp điểm càng cao (×2, ×3, ×5); mỗi lần đáp được nạp thêm nhiên liệu và sang màn khó hơn. Vẽ trên canvas, camera phóng to khi tàu xuống gần mặt đất. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Thế giới rộng 800 đơn vị, **xuyên mép ngang** (bay ra mép này hiện lại ở mép kia), trục y hướng lên. Tàu xuất hiện ở độ cao 560, trôi ngang 15–45 đơn vị/giây; trên 720 là trần.
- **Vật lý** (bước cố định 1/60 giây): trọng lực kéo xuống; động cơ chính đẩy **theo hướng mũi tàu** với gia tốc 44, tốn 1 nhiên liệu mỗi bước (bình 1000 = ~17 giây đẩy). Xoay 2,4 rad/giây (~138°/giây), nghiêng tối đa 90° mỗi bên. Hết nhiên liệu thì bấm đẩy không có tác dụng.
- **Địa hình**: đường gấp khúc tuần hoàn sinh từ hạt giống của màn (dịch điểm giữa), cao 20–380, có đúng **3 bãi phẳng**: ×2 rộng 80, ×3 rộng 54, ×5 rộng 36 (tàu rộng 22). Bãi ×5 nằm trên cao hoặc trong khe giữa hai vách. Cột trời phía trên mỗi bãi luôn trống nên tàu thẳng đứng hạ thẳng xuống được.
- **Va chạm**: thân tàu là đa giác lồi 6 đỉnh, hai đỉnh dưới là chân. Đỉnh nào của thân xuống dưới mặt đất, hoặc đỉnh núi nhọn lọt vào giữa thân, là đâm núi. Chỉ chân chạm đất thì xét đáp:
  - **an toàn** khi cả hai chân trên cùng một bãi, tốc độ rơi ≤ 20, tốc độ ngang ≤ 12, nghiêng ≤ 10°;
  - không thì nổ (rơi quá nhanh / trôi ngang quá nhanh / chưa thẳng / trượt khỏi bãi / đâm núi).
- **Điểm mỗi lần đáp** = 50 × hệ số bãi + thưởng độ êm (tối đa 50: 50 × (1 − tỉ lệ lớn nhất trong ba ngưỡng tốc độ rơi, tốc độ ngang, góc)) + thưởng nhiên liệu (nhiên liệu còn lúc chạm ÷ 20, tối đa 50). Một lần đáp nhiều nhất 350 điểm.
- **Sang màn**: đáp xong chờ 2 giây, nạp thêm 400 nhiên liệu (tối đa 1000), địa hình mới. Trọng lực màn n = 16 × (1 + 0,1 × (n − 1)), tối đa ×1,6 (từ màn 7). Gió ngang từ màn 2: 2 + 1,2 × (n − 2), tối đa 6, chiều ngẫu nhiên theo màn, giật ±40% theo chu kỳ 5 giây.
- **Tàu**: 3 tàu. Nổ thì mất một tàu, ~1,7 giây sau tàu mới xuất hiện trên cùng địa hình (nhiên liệu giữ nguyên). **Hết ván** khi mất hết tàu, hoặc nổ khi bình đã cạn. Hết nhiên liệu giữa trời mà vẫn đáp an toàn được thì được nạp lại và chơi tiếp.
- Game vô tận, không có thắng; nhiên liệu cạn dần khi trọng lực và gió tăng nên ván nào cũng kết thúc. Bot giỏi trung bình qua ~9 màn (~2300 điểm).
- Engine tất định: PRNG mulberry32; cùng seed + cùng chuỗi input ra cùng một ván. Địa hình, gió của màn sinh lại được hoàn toàn từ `lvSeed` nên ván lưu không chép địa hình.

## Điều khiển

- **Bàn phím**: xem bảng phím tắt.
- **Chạm** (hiện tự động trên màn hình cảm ứng; Cài đặt → Nút trên màn hình: Tự động / Hiện / Ẩn): góc dưới trái hai nút xoay trái / phải (trượt ngón qua lại không cần nhấc tay), góc dưới phải nút **Đẩy** lớn. Giữ được nhiều nút cùng lúc bằng nhiều ngón. Màn hình dọc: nút ở dải dưới vùng chơi; ngang: nút ở hai bên.
- **Tự cân bằng góc** (Cài đặt, mặc định tắt): không bấm xoay thì tàu tự quay về thẳng đứng với đúng tốc độ xoay thường, chơi một ngón (chỉ giữ Đẩy) được. **Không ảnh hưởng điểm, không tính `assisted`**: nó chỉ làm thay việc bấm xoay ngược (cùng tốc độ, người chơi bàn phím làm y hệt được), không đổi vật lý, ngưỡng đáp hay cách tính điểm; brief yêu cầu chơi chạm tốt ngang bàn phím mà không bắt buộc giữ hai ngón, nên đây là trợ năng điều khiển chứ không phải lợi thế.
- **Đồng hồ bay** trên vùng chơi: độ cao (chân tàu so với mặt đất ngay dưới), vận tốc ngang / dọc (mũi tên chỉ chiều), góc nghiêng; ba số sau **xanh** khi đã trong ngưỡng đáp an toàn, **đỏ** khi chưa. Thanh nhiên liệu (đỏ khi dưới 20%) và gió hiện tại (từ màn 2).
- **Camera**: luôn giữ tàu ở giữa theo chiều ngang. Xa đất thì thấy cả màn (màn hình dọc thấy ~55% bề ngang, bãi ngoài khung có mũi tên ở mép), xuống dưới ~130 đơn vị thì phóng to quanh tàu (1,5–3,5 lần tùy cỡ màn hình).
- Tự tạm dừng khi trang ẩn hoặc mở hộp thoại; nút / phím tạm dừng. Lần đầu mở có hướng dẫn (lưu `guideSeen`).
- Rung nhẹ khi đáp / nổ, tắt được trong Cài đặt. Giảm chuyển động: không hạt khói / nổ / bụi, không rung màn hình, lửa động cơ không nhấp nháy, camera chuyển tầm ngay không lướt.

## Mode và ghi điểm trên cổng

Một mode `classic` (Cổ điển), metric `score_high` (điểm cao nhất), 5 điểm tham gia.

- Bấm Bắt đầu: `kit.sdk.start('classic')`; mở lại ván lưu dở: `kit.sdk.start('classic', true)`.
- Hết ván: `kit.sdk.end({ mode: 'classic', won: false, score, assisted: false })`.
- Bỏ ván (Ván mới → xác nhận) khi đã có điểm hoặc đã chơi ≥ 1 giây: gửi `won: false` với điểm hiện có. Chưa thì không gửi gì.
- Luật chống gian lận: `min_duration_ms` 5000, `max_score_per_sec` 75.
  - Đo bằng bot PD (script tạm, bản rút gọn nằm trong `test.js`): nhìn trạng thái trễ 200 ms rồi tự dự đoán tới hiện tại bằng các phím đã bấm, quyết định lại mỗi 50 ms, bay theo hành lang trên núi tới bãi ×5, hãm gấp theo độ cao, chạm thẳng đứng. 1000 seed, tốc độ = điểm / thời gian từ đầu ván, chỉ xét từ giây thứ 5: **cao nhất 39,1 điểm/giây** (luôn rơi vào lần đáp đầu, ~8–9 giây với ~340 điểm; trung bình bot qua 9,2 màn, 2327 điểm); bot phản xạ 100 ms quyết định mỗi 33 ms: 39,2; bot chọn bãi theo điểm / thời gian: 39,1.
  - Trần lý thuyết: lần đáp nhanh nhất có thể là tàu xuất hiện ngay trên bãi ×5 cao nhất (320), rơi tự do rồi hãm hết ga chạm đúng 20 → ~6,1 giây cho ~295 điểm (êm 0, nhiên liệu 44) ≈ 50 điểm/giây; các màn sau còn mất thêm 2 giây chờ mỗi màn.
  - Đặt 75 (≈ 1,9 lần mức bot, cao hơn trần lý thuyết) để người chơi thật không bao giờ bị chặn oan.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-hacanh-settings-v1` | Cài đặt: giao diện, nút trên màn hình (`auto` / `on` / `off`), tự cân bằng góc, rung, đã xem hướng dẫn |
| `playnine-hacanh-stats-v1` | Thống kê: số ván, kỷ lục, màn xa nhất, tổng điểm (tính trung bình), số lần đáp an toàn, số lần đáp bãi ×5 |
| `playnine-hacanh-save-v1` | Ván đang chơi dở (`{ v: 1, game }`, `game` là `toJSON` của engine, không chép địa hình), ghi khi tạm dừng / rời trang; mở lại ở trạng thái tạm dừng |
| `playnine-hacanh-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng (sai phiên bản, số không hợp lệ, pha / tàu không khớp, số lần đáp nhiều hơn số màn…) bị bỏ qua.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `↑` / `W` / `Space` | Đẩy (giữ); ở màn chờ / hết ván: `Space` bắt đầu |
| `←` / `→` (`A` / `D`) | Xoay trái / phải |
| `P` / `Esc` | Tạm dừng (`P` / `Enter` / `Space` để chơi tiếp) |
| `Enter` | Bắt đầu / chơi tiếp |
| `N` | Ván mới |

## Kiểm tra

```bash
node test.js
```

Test engine phủ trọng lực, đẩy theo góc mũi tàu, xoay / giới hạn nghiêng / tự cân bằng góc, tiêu hao nhiên liệu và báo sắp hết / hết, hết nhiên liệu không đẩy được, xuyên mép, trần, gió giật; độ cao địa hình trên đường gấp khúc (nội suy, tuần hoàn, đỉnh giữa hai mẫu), va chạm (hai chân trên bãi, một chân ngoài bãi, thân chạm sườn, đỉnh nhọn đâm vào giữa thân); điểm + hệ số bãi, đáp an toàn sát ngưỡng, năm kiểu nổ, sang màn (nạp nhiên liệu, địa hình mới, trọng lực / gió tăng), ra tàu mới, hết ván (hết tàu / nổ khi cạn bình), đáp được khi đã cạn bình; địa hình 500 seed luôn có 3 bãi ×2 ×3 ×5 phẳng, đủ rộng, cách nhau, cột trời trên bãi trống; bot phản xạ 200 ms đáp được cả ba bãi ở màn 1 (30 seed) và bãi ×2, ×3 ở độ khó tối đa (20 seed), chơi trọn ván tới hết nhiên liệu; tất định theo seed + input; lưu / khôi phục ở mọi pha và chạy tiếp y hệt; từ chối dữ liệu hỏng. `e2e.spec.ts` chạy trong cổng: ván lưu còn 1 tàu đang lao xuống báo đúng `pn:end` kèm điểm, bỏ ván đã có điểm báo `won: false` rồi `pn:start` ván mới.
