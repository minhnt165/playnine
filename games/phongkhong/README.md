# Phòng Không

Game phòng thủ tên lửa (Missile Defense) của PlayNine, viết bằng HTML + CSS + JavaScript thuần trên `<canvas>`, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK. Hình vẽ nét neon tối giản, tự vẽ riêng cho game này.

## Luật chơi

- Đáy sân có **6 thành phố** và **3 bệ phóng** (trái, giữa, phải). Tên lửa địch rơi xiên từ mép trên xuống, mỗi quả nhắm một thành phố hoặc một bệ còn đứng.
- Chạm / nhấp một điểm trên trời: **bệ gần nhất còn đạn** bắn một đạn chặn bay thẳng tới đó rồi nổ thành **quả cầu** nở ra (0,3 giây), giữ (0,2 giây) rồi co lại (0,4 giây). Tên lửa / máy bay nào chạm quả cầu thì nổ và để lại quả cầu nhỏ hơn, có thể **nổ dây chuyền**.
- Mỗi bệ có **10 đạn mỗi đợt**. Bệ bị trúng thì mất hết đạn tới hết đợt (đợt sau được dựng lại đủ đạn). Thành phố bị trúng thì mất hẳn.
- Đợt sau nhanh hơn và nhiều tên lửa hơn. Từ đợt 3 có **tên lửa tách đầu** (tới một độ cao thì tách thêm 1–2 đầu đạn, từ đợt 7 là 1–3); từ đợt 4 có **máy bay ném bom** bay ngang, thả tối đa 3 quả bom.
- Hết đợt (không còn gì trên trời): thưởng điểm theo đạn còn và thành phố còn, nghỉ 3 giây rồi sang đợt mới.
- Mất hết thành phố (và không còn thành phố thưởng để dựng lại) là hết ván. Game vô tận, không có thắng: xếp hạng theo điểm.

### Điểm

| | Điểm |
| --- | --- |
| Tên lửa / đầu đạn / bom | 25 × hệ số |
| Máy bay ném bom | 100 × hệ số |
| Thưởng cuối đợt: mỗi viên đạn còn | 5 × hệ số |
| Thưởng cuối đợt: mỗi thành phố còn | 100 × hệ số |

Hệ số theo đợt: ×1 (đợt 1–2), ×2 (3–4), ×3 (5–6), ×4 (7–8), ×5 (9–10), ×6 (từ đợt 11). Mỗi **10.000 điểm** được một thành phố thưởng: đầu đợt sau dựng lại một thành phố đã mất (đủ 6 thì để dành, hiện ở góc phải trên sân).

## Điều khiển

- **Chuột:** tâm ngắm theo con trỏ, nhấp trái là bắn từ bệ gần nhất còn đạn. `1` `2` `3` (hoặc `A` `S` `D`) bắn từ bệ trái / giữa / phải tới chỗ con trỏ.
- **Chỉ bàn phím:** mũi tên di chuyển tâm ngắm (giữ lâu thì nhanh dần), `Space` / `Enter` bắn từ bệ gần nhất; `1` `2` `3` / `A` `S` `D` bắn từ bệ chọn sẵn.
- **Cảm ứng:** chạm vào chỗ muốn nổ; nhiều ngón cùng lúc là nhiều phát. Chạm ngoài bàn chơi thì kẹp vào mép bàn.
- `P` / `Esc` / nút tạm dừng: tạm dừng. Tự tạm dừng khi ẩn trang, mất focus hoặc mở hộp thoại. Lần đầu mở game hiện hướng dẫn ngắn.
- Cài đặt: giao diện, ngôn ngữ, rung (điện thoại), âm thanh (trong cổng).

## Ghi điểm trên cổng

- Metric `score_high`, một mode `classic` (Cổ điển), 5 điểm tham gia.
- Bấm Bắt đầu: `kit.sdk.start('classic')`; mở lại ván lưu dở: `kit.sdk.start('classic', true)`.
- Hết ván: `kit.sdk.end({ mode: 'classic', won: false, score })`.
- Bỏ ván (Ván mới) khi đã có điểm hoặc đã chơi ≥ 1 giây: hỏi xác nhận rồi gửi như hết ván với điểm hiện có; chưa chơi gì thì chia lại, không gửi.
- Luật chống gian lận: `min_duration_ms` 5000, `max_score_per_sec` 360. Đo bằng bot (script tạm) ngắm đón đầu hoàn hảo, chọn điểm nổ trúng nhiều tên lửa nhất, ưu tiên máy bay, nhìn trạng thái trễ 100–250 ms và bắn tối đa ~6–15 phát / giây, trên 20–30 hạt giống, chơi tới hết ván (10 phút): điểm ÷ thời gian từ đầu ván, xét từ giây thứ 5, cao nhất **179 điểm/giây** (trung bình cả ván 150–155; bot thua ở đợt 10–13 sau 4–6 phút). Thưởng cuối đợt làm điểm nhảy bậc nhưng chỉ chiếm phần nhỏ so với tốc độ hạ tên lửa ở hệ số ×6. Trần lý thuyết: cùng bot nhưng thành phố không bao giờ mất (đủ thưởng thành phố mọi đợt) chơi 40 phút đạt tốc độ ổn định ~260–290 điểm/giây. Đặt 360 ≈ 2 × 179 và vẫn trên trần lý thuyết, nên không chặn oan người chơi rất giỏi chơi rất lâu.

## Kỹ thuật

- `engine.js`: luật thuần, sân logic 240 × 360, bước cố định 60 tick/giây; `step(game, { shots: [{ x, y, base? }] })` trả mảng sự kiện cho giao diện (phóng, nổ, hạ, tách đầu, trúng thành phố / bệ, hết đợt, hết ván…). Tất định theo hạt giống + chuỗi input có thời điểm (PRNG mulberry32 nằm trong trạng thái ván).
- `app.js`: canvas nhân `devicePixelRatio`, co theo khung tỉ lệ 2:3 (dọc điện thoại: bàn chơi tràn ngang; ngang: thanh trên + điểm sang cột trái). Màu sân lấy từ biến `--pk-*` trong `style.css`: giao diện sáng là trời rạng sáng nét đậm, tối là trời đêm neon có sao. `prefers-reduced-motion`: quả cầu nổ là hình tròn đặc một màu có viền (vẫn thấy rõ vùng nổ theo thời gian), không đổi màu nhấp nháy, không tia lửa, không rung / chớp sáng; sao đứng yên.
- Âm thanh qua `kit.sfx` (phóng `tap`, nổ `pop`, hạ `capture` / nổ dây chuyền `combo`, tách đầu `flip`, máy bay `move` / hạ máy bay `coin`, mất thành phố `error`, trúng bệ `drop`, hết đạn `error`, dựng lại thành phố `place`, xong đợt `clear`, vào đợt `levelup`, hết ván `lose`); kỷ lục mới thì `kit.confetti()`. Rung nhẹ khi mất thành phố / bệ (tắt được trong Cài đặt).

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-phongkhong-settings-v1` | Cài đặt (giao diện, rung, `guideSeen`) |
| `playnine-phongkhong-stats-v1` | Số ván, điểm cao nhất, đợt xa nhất, tổng số tên lửa bắn hạ |
| `playnine-phongkhong-save-v1` | Ván đang chơi dở (lưu mỗi 5 giây, khi tạm dừng, xong đợt và khi rời trang; mở lại ở trạng thái tạm dừng) |
| `playnine-phongkhong-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| Nhấp chuột | Bắn từ bệ gần nhất tới con trỏ |
| `1` `2` `3` / `A` `S` `D` | Bắn từ bệ trái / giữa / phải tới con trỏ / tâm ngắm |
| `←` `↑` `→` `↓` | Di chuyển tâm ngắm |
| `Space` / `Enter` | Bắn tới tâm ngắm; bắt đầu / chơi tiếp |
| `P` / `Esc` | Tạm dừng / chơi tiếp |
| `N` | Ván mới |
| `H` / `?` | Cách chơi |

## Chạy test

```bash
node test.js
```

Test engine phủ: đạn chặn bay thẳng đúng tốc độ tới điểm ngắm rồi nổ đúng chỗ, kẹp điểm ngắm, bán kính quả cầu nở - giữ - co theo thời gian, va chạm tên lửa / máy bay với quả cầu theo bán kính lúc đó, nổ dây chuyền, chọn bệ gần nhất còn đạn / bệ chỉ định / hết đạn, bệ và thành phố bị trúng, mục tiêu chỉ chọn trong cái còn sống, MIRV tách đúng độ cao và đầu đạn hạ được, hết đợt + thưởng (và điều kiện chưa hết đợt), hệ số điểm, thành phố thưởng (dựng lại / để dành), hết ván (và còn thành phố thưởng thì chơi tiếp), độ khó tăng theo đợt, đợt 1 không có MIRV / máy bay còn đợt giữa có, tất định theo hạt giống + chuỗi input, bot có độ trễ phản ứng qua được 3 đợt đầu trên 8 hạt giống, lưu / khôi phục và từ chối dữ liệu hỏng.

E2e riêng: `e2e.spec.ts` (chạy trong cổng sau `npm run build && npm run assemble`): ván lưu dựng sẵn chỉ còn một thành phố với tên lửa ngay trên đầu, chơi tiếp thì hết ván và cổng nhận `pn:end` với `won: false` và đúng điểm; bỏ ván sau hơn 1 giây chơi gửi `won: false`.
