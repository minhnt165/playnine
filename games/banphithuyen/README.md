# Bắn Phi Thuyền

Game bắn phi thuyền cố định nòng (Space Defenders) của PlayNine, viết bằng HTML + CSS + JavaScript thuần trên `<canvas>`, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK. Hình phi thuyền, tàu, đĩa bay đều vẽ riêng cho game này.

## Luật chơi

- Đội hình 5 hàng × 9 phi thuyền đi ngang; chạm mép sân thì xuống một nấc và quay đầu. Càng ít địch, đội hình càng đi nhanh (còn một con thì đi mỗi tick).
- Tàu của bạn chạy dọc đáy sân. Trên màn hình **chỉ có một viên đạn** của bạn tại một thời điểm; đạn có thể bắn rơi bom.
- Địch thả bom (tối đa 3–5 quả cùng lúc tùy đợt, một phần nhắm thẳng vào tàu). Trúng bom là mất một tàu; tàu nổ thì cả sân dừng lại một lúc rồi tàu mới xuất hiện giữa sân.
- 4 khiên chặn cả bom lẫn đạn của bạn và **bị bào mòn từng ô** sau mỗi lần trúng; địch xuống tới khiên thì xóa khiên dưới thân.
- Đĩa bay thưởng bay ngang trên cùng khoảng 15–35 giây một lần (khi còn từ 8 địch trở lên).
- Hết địch thì qua đợt: đợt mới bắt đầu thấp hơn (lặp lại mỗi 6 đợt), đi nhanh hơn, bom rơi nhanh và dày hơn; khiên được làm mới.
- Hết tàu, hoặc địch xuống tới hàng của tàu, là hết ván. Game vô tận, không có thắng: xếp hạng theo điểm.

### Điểm, mạng

| | Điểm |
| --- | --- |
| Hàng dưới (sứa, 2 hàng) | 10 |
| Hàng giữa (bọ kim cương, 2 hàng) | 20 |
| Hàng trên (con mắt) | 30 |
| Đĩa bay | 50 / 100 / 150 / 300 (ngẫu nhiên) |

Bắt đầu với 3 tàu, thêm một tàu khi đạt 1.500 điểm (một lần mỗi ván).

## Điều khiển

- **Bàn phím:** `←` `→` / `A` `D` lái, `Space` bắn (giữ để bắn liên tục), `P` / `Esc` tạm dừng, `N` ván mới, `H` cách chơi. `Space` / `Enter` cũng bắt đầu ván và chơi tiếp.
- **Chuột:** tàu đi theo con trỏ (tốc độ tàu có giới hạn), nhấp / giữ chuột trái để bắn.
- **Cảm ứng:** kéo ở bất kỳ đâu trong vùng bàn chơi để lái (kéo tương đối nên ngón tay không che tàu). **Tự bắn** bật sẵn trên màn cảm ứng; nút `AUTO` cạnh nút tạm dừng (hoặc Cài đặt) để bật / tắt; tắt thì mỗi lần chạm là một phát.
- Tự tạm dừng khi ẩn trang, mất focus hoặc mở hộp thoại. Lần đầu mở game hiện hướng dẫn ngắn.
- Cài đặt: giao diện, ngôn ngữ, tự bắn, rung (điện thoại), âm thanh (trong cổng).

## Ghi điểm trên cổng

- Metric `score_high`, một mode `classic` (Cổ điển), 5 điểm tham gia.
- Bấm Bắt đầu: `kit.sdk.start('classic')`; mở lại ván lưu dở: `kit.sdk.start('classic', true)`.
- Hết ván: `kit.sdk.end({ mode: 'classic', won: false, score })`.
- Bỏ ván (Ván mới) khi đã có điểm hoặc đã chơi ≥ 1 giây: hỏi xác nhận rồi gửi như hết ván với điểm hiện có; chưa chơi gì thì chia lại, không gửi.
- Luật chống gian lận: `min_duration_ms` 5000, `max_score_per_sec` 80. Ngưỡng đo bằng bot mạnh (ngắm đón đầu hoàn hảo, nhìn trạng thái trễ 200 ms, né bom) trên 20 hạt giống, chơi tới 10 phút: điểm ÷ thời gian từ đầu ván, xét từ giây thứ 5, cao nhất 38,5 điểm/giây (thường 24–30, trung bình cả ván khoảng 19–20). Đặt 80 ≈ ×2.

## Kỹ thuật

- `engine.js`: luật thuần, sân logic 240 × 360, bước cố định 60 tick/giây; `step(game, input)` trả mảng sự kiện cho giao diện. Tất định theo hạt giống + chuỗi input (PRNG mulberry32 nằm trong trạng thái ván).
- `app.js`: canvas nhân `devicePixelRatio`, co theo khung tỉ lệ 2:3; nền sao 3 lớp trôi lệch nhau theo vị trí tàu; nổ có mảnh vỡ, rung màn hình khi mất tàu. `prefers-reduced-motion`: sao đứng yên, nổ chỉ còn một chớp hình, không rung / chớp sáng.
- Âm thanh qua `kit.sfx` (bắn `tap`, hạ địch `pop`, đĩa bay `move` / `coin`, nhịp hành quân `tick`, mất tàu `error`, hết ván `lose`, qua đợt `clear` / `levelup`, thêm tàu `combo`); kỷ lục mới thì `kit.confetti()`.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-banphithuyen-settings-v1` | Cài đặt (giao diện, tự bắn, rung, `guideSeen`) |
| `playnine-banphithuyen-stats-v1` | Số ván, điểm cao nhất, đợt xa nhất, tổng số địch bị hạ |
| `playnine-banphithuyen-save-v1` | Ván đang chơi dở (lưu mỗi 5 giây, khi tạm dừng và khi rời trang; mở lại ở trạng thái tạm dừng) |
| `playnine-banphithuyen-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `→` / `A` `D` | Lái tàu |
| `Space` | Bắn (giữ để bắn liên tục); bắt đầu / chơi tiếp |
| `Enter` | Bắt đầu / chơi tiếp |
| `P` / `Esc` | Tạm dừng / chơi tiếp |
| `N` | Ván mới |
| `H` / `?` | Cách chơi |

## Chạy test

```bash
node test.js
```

Test engine phủ: đội hình đi ngang / xuống nấc / quay đầu theo cột còn địch, tăng tốc khi ít địch và theo đợt, một viên đạn mỗi lần, va chạm đạn – địch / đĩa bay / bom / khiên, bom – tàu / khiên / đất, bào mòn khiên, mất mạng – hồi sinh – hết ván, địch đổ bộ, mạng thưởng 1.500, điểm theo hàng, qua đợt, tất định theo hạt giống, bot qua được đợt 1, lưu / khôi phục và từ chối dữ liệu hỏng.

E2e riêng: `e2e.spec.ts` (chạy trong cổng sau `npm run build && npm run assemble`): ván lưu dựng sẵn còn một tàu với bom ngay trên đầu, chơi tiếp thì hết ván và cổng nhận `pn:end` với `won: false` và đúng điểm; bỏ ván sau hơn 1 giây chơi gửi `won: false`.
