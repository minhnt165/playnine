# Mê Cung Ma

Game Mê Cung Ma (Ghost Maze) của PlayNine: thể loại đuổi bắt trong mê cung (maze chase). Chú đom đóm đi khắp mê cung ăn đốm sáng, bốn con ma đuổi theo. Viết bằng HTML + CSS + JavaScript thuần, vẽ bằng `<canvas>`, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

Nhân vật, ma, mê cung, âm thanh đều tự thiết kế (âm thanh qua `kit.sfx`); không dùng tên, hình hay mê cung của trò chơi thương mại nào.

## Luật

- Mê cung 19 × 21 ô, đối xứng trái phải. Có 3 mê cung xoay vòng theo màn (màn 1, 4, 7… mê cung A; 2, 5… B; 3, 6… C).
- **Đốm sáng** 10 điểm, **đốm lớn** (4 cái mỗi màn) 50 điểm. Ăn hết đốm là sang màn mới: đom đóm và ma nhanh hơn, ma sợ ngắn hơn, ma ra chuồng sớm hơn.
- **Đốm lớn** làm ma sợ (6 giây ở màn 1, giảm dần tới tối thiểu 2 giây; 2 giây cuối ma nhấp nháy). Ma sợ đi chậm, quay đầu, rẽ ngẫu nhiên; bắt được thì 200, 400, 800, 1600 điểm liên tiếp (tính lại từ 200 ở đốm lớn kế tiếp). Ma bị ăn chỉ còn đôi mắt chạy về chuồng, hồi sinh rồi ra lại.
- **Trái cây** hiện dưới chuồng ma khi ăn được 30% và 70% số đốm, nằm 9,5 giây: dâu tây 100, cam 300, nho 500, dưa hấu 700, táo 1000, chuối 2000, khế 3000, thanh long 5000 (màn 8 trở đi).
- **Đường hầm** hai bên mép dẫn sang mép kia; ma vào hầm bị chậm lại.
- **3 mạng**, thêm 1 mạng thưởng khi đạt 10.000 điểm (tối đa 5). Chạm ma thường là mất mạng; hết mạng là hết ván.
- Đầu ván 2 giây "Sẵn sàng", sau khi mất mạng / sang màn / chơi tiếp sau tạm dừng 1,5 giây.

### Bốn con ma

Ma chỉ rẽ ở tâm ô, không bao giờ quay đầu trừ lúc đổi chế độ (tản ↔ đuổi) hoặc khi đom đóm ăn đốm lớn. Ở ngã rẽ, ma chọn ô kề gần đích nhất (hòa thì ưu tiên lên, trái, xuống, phải). Lịch tản / đuổi xen kẽ theo giờ (màn 1: tản 7 s, đuổi 20 s, tản 7 s, đuổi 20 s, tản 5 s, đuổi 20 s, tản 5 s rồi đuổi mãi), đồng hồ đứng lại khi ma đang sợ.

| Ma | Màu | Khi đuổi | Góc tản |
| --- | --- | --- | --- |
| Lửa (Blaze) | cam đỏ | nhắm thẳng ô của đom đóm | trên phải |
| Rình (Lurk) | tím | nhắm 4 ô trước mặt đom đóm (chặn đầu) | trên trái |
| Sương (Mist) | xanh ngọc | lấy điểm 2 ô trước mặt đom đóm, đối xứng vị trí của Lửa qua điểm đó (bọc đường) | dưới phải |
| Lơ Ngơ (Dizzy) | xanh dương | xa hơn 8 ô thì đuổi thẳng, gần thì bỏ về góc (lang thang) | dưới trái |

Ma sợ rẽ ngẫu nhiên bằng PRNG mulberry32 có seed, trạng thái PRNG lưu trong ván: cùng seed + cùng chuỗi lệnh luôn ra cùng ván.

## Điều khiển

- Bàn phím: phím mũi tên hoặc WASD. **Đệm hướng**: bấm rẽ trước khi tới ngã rẽ thì lệnh được giữ lại và đom đóm rẽ ở ngã rẽ đầu tiên đi được; bấm quay đầu thì quay ngay; vừa lướt qua tâm ngã rẽ (≤ 0,3 ô) mới bấm vẫn rẽ được.
- Cảm ứng: vuốt ở bất kỳ đâu trong khung game (đệm hướng như phím, vuốt tiếp không nhấc tay vẫn đổi hướng). Phím điều hướng ảo dưới mê cung: bật / tắt trong Cài đặt (mặc định bật trên điện thoại / máy tính bảng).
- Tự tạm dừng khi trang bị ẩn hoặc mở hộp thoại; có nút tạm dừng ở góc bàn chơi.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `↑` `↓` `←` `→` / `W` `A` `S` `D` | Di chuyển |
| `Space` / `Enter` | Bắt đầu, chơi tiếp, chơi lại |
| `P` / `Esc` | Tạm dừng / chơi tiếp |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại |

## Mode và ghi điểm trên cổng

Một mode `classic` (Cổ điển), metric `score_high`, 5 điểm mỗi ván. Không có trần điểm (màn vô tận) nên không đặt `max_score`.

- Bấm Bắt đầu: `kit.sdk.start('classic')`; mở lại ván lưu dở: `kit.sdk.start('classic', true)`.
- Hết ván: `kit.sdk.end({ mode: 'classic', won: false, score, assisted: false })` (game vô tận, không có thắng).
- Bỏ ván giữa chừng (nút Ván mới) khi đã có điểm hoặc đã chơi ≥ 1 giây: gửi `won: false` với điểm hiện có; chưa có gì thì không gửi.
- Luật chống gian lận: `min_duration_ms` 5000, `max_score_per_sec` 500. Đo bằng bot tìm kiếm 2 tầng trên bản sao ván (biết trước tương lai, mỗi tầng 200 ms, nhìn trước 2 giây, đi tham lam tới đốm / ma sợ), tốc độ = điểm ÷ thời gian từ đầu ván, chỉ xét từ giây thứ 5, mỗi ván tối đa 5 phút: phản xạ 200 ms trên 20 seed cao nhất **242,9 điểm/s** (đỉnh rơi vào lúc ăn được chuỗi ma đầu tiên, trung bình cả ván 36–72); phản xạ 100 ms trên 12 seed cao nhất 150,6. Trần lý thuyết khi ăn đủ 4 ma ở cả hai đốm lớn đầu tiên trong ~15 giây đầu khoảng 450/s. Đặt 500 (≈ 2 lần mức bot, vẫn trên trần lý thuyết) để người chơi giỏi không bị chặn oan.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-mecungma-settings-v1` | Cài đặt (giao diện, rung, phím điều hướng ảo `dpad`, `guideSeen`) |
| `playnine-mecungma-stats-v1` | Thống kê: số ván, kỷ lục, màn xa nhất, số ma đã ăn |
| `playnine-mecungma-save-v1` | Ván đang chơi dở (toàn bộ trạng thái engine: màn, mạng, điểm, đốm còn lại, vị trí / hướng / trạng thái từng nhân vật, đồng hồ tản / đuổi / sợ, trái cây, PRNG); lưu khi tạm dừng, rời trang và mỗi 3 giây |
| `playnine-mecungma-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Cấu trúc

- `engine.js`: luật thuần (không DOM), bước cố định 60 bước / giây, toạ độ nguyên (1 ô = 1000 đơn vị), 3 mê cung, AI ma, `toJSON` / `fromJSON` (từ chối dữ liệu hỏng).
- `app.js`: vòng lặp `requestAnimationFrame` (giới hạn dt), vẽ canvas theo `devicePixelRatio` (tường vẽ sẵn ra canvas phụ), vuốt / phím / D-pad, âm thanh `kit.sfx`, rung (tắt được trong Cài đặt).
- `test.js`: test engine + bot dùng chung cho test "chơi được" và đo điểm / giây (`require('./test.js')` lấy `botPlay`, `botChoose`).
- `e2e.spec.ts`: ván kết thúc báo đúng `pn:end` (ván lưu còn 1 mạng sắp chạm ma) và bỏ ván có điểm.

## Kiểm tra engine

```bash
node test.js
```

Test phủ: mê cung đúng cỡ / đối xứng / liên thông / không ngõ cụt / không khối trống 2×2; đi trên lưới, đệm hướng, quay đầu, rẽ trễ tay, va tường, đường hầm; ăn đốm / đốm lớn / chuỗi ăn ma / trái cây / mạng thưởng; mất mạng, hết ván, sang màn; tính cách ma, lịch tản / đuổi, ra chuồng theo giờ, mắt ma về chuồng; ma không xuyên tường và không quay đầu sai luật (chơi ngẫu nhiên nhiều seed); tất định; lưu / khôi phục chạy tiếp y hệt; từ chối dữ liệu hỏng; bot phản xạ 200 ms qua màn 1 trên ít nhất 5/6 seed.
