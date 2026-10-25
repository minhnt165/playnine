# Cột Ngọc

Game Cột Ngọc (Jewel Columns, thể loại "Columns") của PlayNine: thả các cột ba viên ngọc vào giếng, xếp từ ba viên cùng màu thành hàng để xóa và tạo dây chuyền. Viết bằng HTML + CSS + JavaScript thuần (vẽ bằng `<canvas>`), dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Giếng 6 cột × 13 hàng. Khối rơi là một cột dọc 3 viên ngọc, xuất hiện ở cột thứ 3 (chỉ thấy viên dưới cùng, hai viên trên còn khuất trên miệng giếng). Khối kế tiếp hiện ở cột bên phải.
- 6 màu ngọc, mỗi màu một hình riêng để người mù màu vẫn phân biệt được: hồng ngọc (tròn), hổ phách (tam giác), hoàng ngọc (thoi), lục bảo (vuông vát góc), lam ngọc (lục giác), thạch anh tím (sao).
- Dịch trái / phải, xoay vòng thứ tự 3 viên (kiểu cổ điển: mỗi viên xuống một ô, viên dưới cùng lên đầu; có phím xoay ngược), rơi nhanh, thả thẳng.
- Chạm đáy hoặc đè lên ngọc: sau trễ khóa 0,5 giây thì khóa (dịch / xoay khi đang chạm đặt lại bộ đếm, tối đa 15 lần mỗi độ cao mới); thả thẳng khóa ngay.
- Sau khi khóa, **mọi** hàng ≥ 3 viên cùng màu theo ngang, dọc và hai đường chéo bị xóa cùng lúc (hàng dài hơn 3 lấy trọn, hàng giao nhau tính mỗi viên một lần). Ngọc phía trên rơi xuống; nếu tạo hàng mới thì xóa tiếp: **dây chuyền**. Mỗi đợt xóa kéo dài 0,4 giây.
- **Ngọc ma thuật** (tùy chọn của spec, có làm): từ khối thứ 21, mỗi khối có xác suất 1/40 là cột ngọc ma thuật cầu vồng. Đáp lên viên màu nào thì mọi viên màu đó trong giếng biến mất (tính là đợt 1 của dây chuyền); đáp thẳng xuống đáy thì biến mất, không có điểm. Lý do giữ: là nét đặc trưng của thể loại, cứu ván khi giếng gần đầy, hiếm nên không phá cân bằng; luật đơn giản, đã có test.
- **Hết ván**: ô xuất hiện (cột 3, hàng trên cùng) bị chiếm khi ra khối mới, hoặc sau khi xóa xong vẫn còn ngọc nằm trên miệng giếng (khóa khối khi cột gần đầy mà không tạo được hàng).
- Sinh ngọc: túi 18 viên (6 màu × 3) xáo bằng PRNG mulberry32 theo seed, mỗi khối rút 3 viên → màu luôn cân (mỗi 6 khối đủ mỗi màu 3 viên).
- Mô phỏng theo bước cố định 1/60 giây, tất định theo seed + chuỗi thao tác có thời điểm; app đổi thời gian thật thành số bước (khung hình dài quá 100 ms chỉ tính 100 ms), khối đang rơi vẽ mượt giữa hai bước.

## Điểm và cấp độ

- Điểm mỗi đợt xóa = số viên × 10 × cấp × bậc dây chuyền (1, 2, 3…). Rơi nhanh +1 mỗi hàng, thả thẳng +2 mỗi hàng.
- Cấp = 1 + ⌊số viên đã xóa / 30⌋, tối đa 20. Tốc độ rơi: cấp 1 là 0,8 giây / hàng (48 bước), mỗi cấp nhanh hơn ×0,82, tới cấp 20 là 2 bước / hàng.

## Điều khiển

- **Bàn phím**: `←` `→` (hoặc `A` `D`) dịch, giữ để trượt (DAS 10 bước ≈ 167 ms, rồi ARR 2 bước ≈ 33 ms; đếm trong vòng lặp bước cố định); `↑` / `X` / `W` xoay; `Z` xoay ngược; `↓` / `S` rơi nhanh (giữ); `Space` thả thẳng; `P` / `Esc` tạm dừng; `N` ván mới. Không phím nào làm hai việc trong lúc chơi (Space chỉ thả thẳng, ↑ chỉ xoay).
- **Cảm ứng**: hàng nút lớn dưới giếng (◀ ▼ ▶ bên trái, ⤓ thả thẳng và ↻ xoay bên phải; giữ ◀ ▶ để trượt, giữ ▼ để rơi nhanh); chạm vào giếng cũng xoay. Điện thoại xoay ngang: nút trái nằm bên trái giếng, nút phải bên phải. Chọn nút ảo thay cho vuốt vì vuốt dễ nhầm hướng / nhầm thả thẳng trong game rơi khối và không giữ được để trượt hay rơi nhanh; nút cho cùng cảm giác DAS như bàn phím, một ngón mỗi tay là đủ.
- Nút cảm ứng chỉ hiện khi máy có màn cảm ứng (`any-pointer: coarse`); máy tính thấy dòng phím tắt.
- Màn chờ: nút **Chơi** (`#btn-start`), Space / Enter hoặc chạm giếng cũng bắt đầu.
- Tự tạm dừng khi trang bị ẩn hoặc mở hộp thoại (Cách chơi, Thống kê, Cài đặt). Lần đầu mở game hiện hộp Cách chơi (ghi `guideSeen` trong cài đặt).
- Cài đặt: giao diện, ngôn ngữ, âm thanh (của cổng), **bóng chỗ đáp** (bật mặc định) và **rung** (khi có dây chuyền và khi hết ván).

## Mode và ghi điểm trên cổng

Một mode `classic` (Cổ điển), metric `score_high`, 5 điểm tham gia.

- Bấm Chơi / Chơi lại / Ván mới: `kit.sdk.start('classic')`; mở lại ván lưu dở: `kit.sdk.start('classic', true)`.
- Hết ván: `kit.sdk.end({ mode: 'classic', won: false, score, assisted: false })` (game vô tận, không có thắng).
- Bỏ ván (nút Ván mới, `N`, Ván mới trong lớp tạm dừng) khi đã có điểm hoặc đã chơi ≥ 1 giây: hỏi xác nhận rồi gửi `won: false` với điểm hiện có. Chưa đủ thì chia ván mới, không gửi gì.
- Luật chống gian lận: `min_duration_ms` 5000, `max_score_per_sec` 3000. Không đặt `max_score` vì game vô tận.
  - Đo bằng bot (script tạm): mỗi khối tìm 2 lớp (khối hiện tại × khối kế, 6 cột × 3 cách xoay, tính đủ dây chuyền) rồi thao tác như người giỏi: chờ phản ứng sau khi khối ra, mỗi phím cách nhau một khoảng, xong thì thả thẳng. Điểm / thời gian tính từ đầu ván, xét từ giây thứ 5, 30 seed × tối đa 30 phút.
  - Phản ứng 200 ms, 12 phím / giây: cao nhất **1291** điểm/s; phản ứng 133 ms, 15 phím / giây: cao nhất **1395** điểm/s; phản ứng 250 ms, 8,6 phím / giây: **1091** điểm/s. Tốc độ tăng dần theo cấp và chững lại ở cấp 20: đo riêng phút 10–30 của bot nhanh được ~1390–1430 điểm/s, nên điểm / thời gian cả ván không vượt quá ~1450. Đặt 3000 (≈ ×2 của mức trần đo được).

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-cotngoc-settings-v1` | Cài đặt: giao diện, `ghost`, `vibrate`, `guideSeen` |
| `playnine-cotngoc-stats-v1` | Thống kê: số ván, kỷ lục, tổng điểm (tính trung bình), tổng ngọc đã xóa, dây chuyền dài nhất, cấp cao nhất |
| `playnine-cotngoc-save-v1` | Ván đang chơi dở (`{ v: 1, game }`, `game` là `toJSON` của engine, gồm cả trạng thái PRNG và túi ngọc): ghi khi tạm dừng / rời trang, mở lại ở trạng thái tạm dừng |
| `playnine-cotngoc-summary-v1` | Tóm tắt cho thẻ game trên cổng (kỷ lục, ván dở) |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng (sai phiên bản, ô / màu ngoài phạm vi, túi quá 3 viên một màu, cấp không khớp số viên đã xóa, khối đè lên ngọc, còn ngọc trên miệng giếng khi đang rơi, ô đánh dấu xóa trống…) bị bỏ qua.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `→` / `A` `D` | Dịch trái / phải (giữ để trượt) |
| `↑` / `X` / `W` | Xoay vòng 3 viên |
| `Z` | Xoay ngược |
| `↓` / `S` | Rơi nhanh (giữ) |
| `Space` | Thả thẳng; ở màn chờ thì bắt đầu, khi tạm dừng thì chơi tiếp, ở bảng kết quả thì chơi lại |
| `Enter` | Bắt đầu / chơi tiếp / chơi lại |
| `P` / `Esc` | Tạm dừng / chơi tiếp (`Esc` đóng hộp thoại nếu đang mở) |
| `N` | Ván mới |

## Kiểm tra

```bash
node test.js
```

Test engine phủ: sinh khối tất định theo seed, túi 18 viên cân màu, ngọc ma thuật không xuất hiện sớm và hiếm; dịch, va tường, va ngọc; xoay vòng hai chiều; rơi theo cấp, rơi nhanh; trễ khóa và giới hạn đặt lại; thả thẳng; phát hiện hàng ngang / dọc / hai đường chéo, hàng dài hơn 3, hàng giao nhau (chữ thập, chữ X); xóa đồng thời; trọng lực; dây chuyền 3 bậc và điểm theo cấp × bậc; `settle` (tính nhanh cho bot) khớp chạy từng bước; lên cấp; ngọc ma thuật; hết ván (ô xuất hiện bị chiếm, tràn miệng giếng, hàng xóa cứu khối chạm miệng giếng); tất định (chuỗi thao tác có thời điểm; chia khung hình 30 / 60 / 144 Hz / giật ra cùng ván); lưu / khôi phục (chạy tiếp ra đúng kết quả, cả trong pha xóa) và từ chối dữ liệu hỏng; bot tham lam chơi ≥ 150 khối trên nhiều seed.

`e2e.spec.ts` chạy trong cổng: ván lưu dựng sẵn (1234 điểm, cột giữa đầy) khóa xong báo đúng `pn:end` với điểm; ván mới thả thẳng liên tục tới hết ván báo `pn:end`; bỏ ván ngay sau khi bắt đầu thì không báo.
