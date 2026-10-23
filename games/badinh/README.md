# Ba Đỉnh

Game Ba Đỉnh (TriPeaks) của PlayNine: solitaire ba đỉnh, dọn bài bằng chuỗi lá liền bậc. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (kit + bài tây `cards.js` / `cards.css`, xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo trận qua SDK.

## Luật

- Bộ 52 lá. 28 lá chia thành **ba đỉnh** chồng nhau: hàng 3 / 6 / 9 / 10 lá, mỗi lá bị hai lá hàng ngay dưới đè một nửa. Hàng dưới cùng ngửa; lá khác **tự lật ngửa** khi cả hai lá đè nó đã đi.
- 24 lá còn lại thành nọc; lá đầu nọc lật ra làm **lá đáy** (nọc còn 23 lá úp).
- Đánh lá ngửa trên bàn **hơn hoặc kém lá đáy đúng một bậc** lên đáy (không cần cùng chất; Già và Át nối vòng: K–A, A–2 đều được). Lá vừa đánh thành lá đáy mới.
- Hết nước (hoặc muốn đổi lá đáy) thì **rút nọc**: lá đầu nọc ra đáy. Nọc hết không quay lại.
- **Hết ván** khi dọn sạch 28 lá, hoặc nọc hết mà không còn lá nào đánh được.
- Một **trận 3 ván**, mỗi ván chia bài mới, điểm cộng dồn. Không có hoàn tác.

### Tính điểm

- Mỗi lá dọn được điểm bằng **độ dài chuỗi** hiện tại: lá thứ nhất 1, thứ hai 2, thứ ba 3… Rút nọc là đứt chuỗi (chuỗi cũng về 0 khi sang ván mới).
- Mỗi **lá đỉnh** (3 lá trên cùng) thêm +15.
- **Dọn sạch** ván: +30, cộng +5 cho mỗi lá còn trong nọc.
- Điểm tối đa một ván: 28 lá trong một chuỗi không rút (1 + 2 + … + 28 = 406) + 3 × 15 + 30 + 23 × 5 = **596**; cả trận **1788**. Đạt được (test dựng một ván như vậy): mọi cách khác đều thấp hơn vì rút nọc vừa đứt chuỗi vừa bớt lá thưởng.

## Điều khiển

- **Chạm / bấm** lá đánh được để đánh (rê chuột trên lá đánh được thì lá sáng viền; lá không đánh được thì không, chạm vào lá ngửa sai bậc thì lá lắc). **Chạm nọc** để rút; khi không còn lá nào đánh được, nọc nhấp nháy gợi ý.
- Lá bay từ bàn xuống đáy, lá nọc vừa bay vừa lật; lá bên trên lật ngửa khi lộ ra. Số chuỗi cạnh lá đáy nảy lên mỗi lá, chuyển cam / đỏ khi chuỗi từ 5 / 10; điểm "+N" bay lên trên lá đáy.
- Hết ván (chưa phải ván 3): băng kết quả ván (dọn sạch hay hết nước, điểm ván, thưởng) với nút **Chia ván kế**.
- Hết ván 3: hộp kết quả (điểm, chuỗi dài nhất, điểm từng ván, kỷ lục mới / trận hoàn hảo).
- Giảm chuyển động (`prefers-reduced-motion`): lá đổi chỗ / lật ngay, không chia bài bay, không điểm bay, không lắc.
- Bố cục tự chọn: màn hình dọc thì nọc + đáy dưới ba đỉnh (lá nọc / đáy to hơn khi còn chỗ), màn hình thấp (điện thoại nằm ngang) thì nọc / chuỗi / đáy thành cột bên phải.

## Mode và ghi điểm trên cổng

Một mode `classic` (Cổ điển), metric `score_high` (điểm cao nhất), 5 điểm tham gia.

- Trận mới: `kit.sdk.start('classic')`; mở lại trận lưu dở: `kit.sdk.start('classic', true)`.
- Hết ván 3: `kit.sdk.end({ mode: 'classic', won, score, assisted: false })`, trong đó `won` là `true` chỉ khi **cả 3 ván đều dọn sạch** (trận hoàn hảo), còn lại `false` (game tính điểm).
- Bỏ trận đã đi ít nhất một nước (đánh hoặc rút; nút Trận mới → xác nhận): gửi `won: false` với điểm hiện có. Chưa đi nước nào thì không gửi gì.
- Luật chống gian lận: `min_duration_ms` 20000, `max_score_per_sec` 60, `max_score` 1788.
  - `max_score` = điểm tối đa thật của luật (xem phần Tính điểm).
  - `max_score_per_sec` đo bằng bot tham lam (tìm chuỗi dài nhất có thể đánh liền, hòa thì chọn lá lật được nhiều lá hơn), 3000 trận, mỗi thao tác (đánh, rút, chia ván kế) 0,35 s, tốc độ = điểm / thời gian từ lúc bắt đầu, xét mọi thời điểm từ giây thứ 20: cao nhất 25,6 điểm/s, p99 17,3, trung vị 9,4 (cuối trận: cao nhất 20,9, trung vị 8,2; trận bot ngắn nhất 41,7 s). Đặt 60 (gấp khoảng 2,3 lần) để người chơi nhanh tay (≈ 0,25 s mỗi thao tác) gặp ván đẹp vẫn qua. `test.js` chạy lại bot trên 300 trận và kiểm tra tốc độ luôn dưới ngưỡng trong `game.json`.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-badinh-settings-v1` | Cài đặt (giao diện) |
| `playnine-badinh-stats-v1` | Thống kê: số trận, kỷ lục, tổng điểm (tính trung bình), chuỗi dài nhất, số ván dọn sạch, số trận hoàn hảo |
| `playnine-badinh-save-v1` | Trận đang chơi dở (`{ v: 1, game }`, `game` là `toJSON` của engine: seed, trạng thái rng, ván, pha, bàn, nọc, đáy, điểm, chuỗi, kết quả các ván) |
| `playnine-badinh-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Chia bài bằng PRNG seed được (`PNCards.rng`, trạng thái lưu trong trận nên các ván sau chia đúng như cũ). Trận lưu hỏng hoặc không nhất quán (thiếu / trùng lá, id lá sai, điểm vượt tối đa, pha không khớp số ván đã xong, báo đang chơi mà đã hết nước…) bị bỏ qua và chia trận mới.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `→` (`↑` `↓`) | Chọn lá đánh được (theo vị trí từ trái sang phải) |
| `Enter` | Đánh lá đang chọn (chưa chọn thì chọn lá đầu tiên); giữa hai ván: chia ván kế |
| `Space` | Rút nọc; giữa hai ván: chia ván kế |
| `N` | Trận mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test engine phủ bố cục và quan hệ lá đè, lật lá khi lộ, luật đánh (K–A nối vòng), rút nọc, điểm chuỗi / lá đỉnh / dọn sạch / lá nọc, điểm tối đa (dựng ván đạt 596), hết ván (dọn sạch, hết nước), trận 3 ván, chia bài theo seed, lưu / khôi phục và từ chối dữ liệu hỏng, cùng bot tham lam chơi 300 trận. `e2e.spec.ts` chạy trong cổng: ván lưu dựng sẵn ở ván 3 còn một lá báo đúng `pn:end` (`won: true`, 531 điểm), bỏ trận đã rút một lá báo `won: false`, trận chưa đi nước nào thì không báo.
