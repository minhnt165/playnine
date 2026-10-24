# Tính Nhẩm

Game Tính Nhẩm (Quick Math) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

Vẽ bằng DOM (không dùng canvas): thẻ câu hỏi (phép tính + ô đáp án) và bàn phím số 3 × 4. Đồng hồ chạy bằng vòng lặp `requestAnimationFrame`, tiến engine theo bước cố định 10 ms.

## Luật

- Mỗi ván **60 giây**. Lần lượt hiện phép tính cộng, trừ, nhân, chia với số nguyên dương; gõ đáp án.
- **Tự chấm, không cần Enter**: ô đáp án có đúng bằng số chữ số của đáp án; gõ đủ là chấm ngay và sang câu mới. `Enter` / nút ✓ chấm sớm (thiếu chữ số là sai). Không nhận số 0 đứng đầu.
- Mọi đáp án là số nguyên dương, tối đa 4 chữ số: phép trừ luôn ra số dương, phép chia luôn chia hết (sinh ngược từ phép nhân).
- **Độ khó theo chuỗi đúng liên tiếp**: cứ 3 câu đúng liên tiếp lên một mức, 9 mức (hiện là Mức 1–9):

| Mức | Phép | Cộng / trừ (số hạng, số trừ và hiệu) | Nhân / chia (thừa số 1 hoặc số chia × thừa số 2 hoặc thương) |
| --- | --- | --- | --- |
| 1 | + + − | 1–9 | – |
| 2 | + − × | 2–15 | 2–5 × 2–9 |
| 3 | + − × ÷ | 5–25 | 2–9 × 2–9 |
| 4 | + − × ÷ | 10–49 | 2–9 × 3–12 |
| 5 | + − × ÷ | 10–99 | 3–12 × 3–12 |
| 6 | + − × ÷ | 20–199 | 4–15 × 6–15 |
| 7 | + − × ÷ | 50–299 | 6–19 × 6–19 |
| 8 | + − × ÷ | 100–499 | 11–25 × 3–25 |
| 9 | + − × ÷ | 100–999 | 12–40 × 3–30 |

- **Điểm mỗi câu đúng** = mức × hệ số chuỗi: ×1 khi chuỗi đang dưới 5, ×2 từ 5 câu đúng liên tiếp, ×3 từ 10. Tối đa 9 × 3 = 27 điểm một câu.
- **Trả lời sai**: không trừ điểm, không trừ giờ; chuỗi về 0 nên hệ số về ×1 và câu sau về Mức 1. Màn hình hiện lại phép tính vừa sai kèm đáp án đúng, thẻ rung nhẹ, điện thoại rung (tắt được).
  - Lý do chọn reset chuỗi thay vì trừ giờ: trừ giờ làm ván ngắn hơn 60 giây, lệch với luật `min_duration_ms` trên cổng và làm ván của người hay sai khó so sánh; trừ điểm thì người mới dễ âm điểm, nản. Reset chuỗi đã là hình phạt rõ (mất hệ số và mất mức khó, tức mất điểm cao), và gõ bừa không có lợi gì.
- Không hỏi lại đúng câu vừa hỏi. Dãy câu sinh từ hạt giống bằng PRNG mulberry32: cùng hạt giống + cùng chuỗi phím thì cùng dãy câu (test được).

## Điều khiển

- Chạm / bấm bàn phím số trên màn hình (bắt ngay khi nhấn xuống, phím nhún khi bấm). Bố cục kiểu điện thoại: `1 2 3` ở trên, hàng dưới `⌫  0  ✓`.
- Bàn phím máy tính: chữ số hàng trên hoặc bàn phím số (cả khi tắt Num Lock), `Backspace` / `Delete` xóa, `Enter` chấm sớm. Phím ảo tương ứng nhún theo.

## Màn hình và luồng ván

- Màn chờ có tóm tắt luật và nút **Bắt đầu** (`#btn-start`); Space / Enter hoặc chạm vào lớp phủ cũng bắt đầu. Lần đầu mở hiện hướng dẫn (lưu `guideSeen` trong cài đặt).
- Tự tạm dừng khi trang ẩn hoặc mở hộp thoại; nút tạm dừng ở ô số liệu, phím `P` / `Esc`. Khi tạm dừng (và ở màn chờ) phép tính bị làm mờ để không nghĩ trước được.
- 5 giây cuối có tiếng tích tắc. Hết giờ: bảng kết quả (điểm, kỷ lục mới, số câu đúng, độ chính xác, chuỗi dài nhất, mức cao nhất), kỷ lục mới thì có pháo giấy.
- Khung ngang thấp (điện thoại xoay ngang): thẻ câu hỏi bên trái, bàn phím bên phải.
- Cài đặt: giao diện, ngôn ngữ, âm thanh, **rung** (bật mặc định, chỉ có tác dụng trên điện thoại).

## Ghi điểm trên cổng

- `metric: score_high`, một mode `classic` (Cổ điển), 5 điểm mỗi ván.
- Ván mới: `kit.sdk.start('classic')` khi bấm Bắt đầu; mở lại ván lưu dở: `kit.sdk.start('classic', true)`.
- Hết 60 giây: `kit.sdk.end({ mode: 'classic', won: false, score, assisted: false })` (game tính điểm, không có thắng).
- Bỏ ván (nút Ván mới / phím `N`) khi đã trả lời ít nhất một câu hoặc đã chơi ≥ 1 giây: hỏi lại, rồi gửi `won: false` với điểm hiện có. Chưa thì chơi lại luôn, không gửi gì.
- Luật chống gian lận (`rules`):
  - `min_duration_ms: 55000`: một ván thật luôn đủ 60 giây (sai không trừ giờ), chừa 5 giây cho sai lệch đồng hồ.
  - `max_score_per_sec: 42`: bot luôn trả lời đúng với phản ứng của người rất nhanh (nghĩ 400 ms + 60 ms mỗi mức, gõ 110 ms mỗi chữ số) trên 500 hạt giống đạt cao nhất **20,68 điểm/giây** (xét từ giây thứ 5; cao nhất ở cuối ván khi đã ×3 ở mức 9), đặt khoảng ×2. Để so sánh: bot "siêu nhanh" (300 ms + 40 ms/mức, 90 ms/phím) đạt 29,04; bot "giỏi" (700 ms + 150 ms/mức, 150 ms/phím) đạt 9,67 (khoảng 550 điểm một ván).
  - `max_score: 2520` = 42 × 60: điểm không có trần cứng (phụ thuộc tốc độ), nhưng ván chỉ có 60 giây chơi, nên trần này chặn ván bị kéo dài thời gian thực bằng tạm dừng để lách `max_score_per_sec`.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-tinhnham-settings-v1` | Cài đặt (giao diện, rung, `guideSeen`) |
| `playnine-tinhnham-stats-v1` | Thống kê: số ván, điểm cao nhất, chuỗi dài nhất, số phép đã giải, số câu đã trả lời |
| `playnine-tinhnham-save-v1` | Ván đang chơi dở `{ v: 1, game }` (hạt giống, trạng thái PRNG, giờ, điểm, chuỗi, câu đang hỏi, chữ số đang gõ). Ghi khi tạm dừng / rời trang, mở lại thì ở trạng thái tạm dừng |
| `playnine-tinhnham-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `0`–`9` (hàng số hoặc bàn phím số) | Gõ chữ số |
| `Backspace` / `Delete` | Xóa chữ số cuối |
| `Enter` | Chấm sớm (khi đang chơi); bắt đầu / chơi tiếp / chơi lại (ngoài lúc chơi) |
| `Space` | Bắt đầu, chơi tiếp, chơi lại |
| `P` / `Esc` | Tạm dừng / chơi tiếp |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test engine phủ: dãy câu tất định theo hạt giống; mọi câu ở mọi mức có đáp án nguyên dương ≤ 4 chữ số, chia hết, đúng phạm vi và đủ các phép của mức; không lặp câu liền nhau; độ khó tăng theo mức; mức và hệ số theo chuỗi; tự chấm khi đủ chữ số, Enter chấm sớm, xóa lùi, số 0 đứng đầu; đúng / sai (sai không trừ điểm, không trừ giờ, về mức 1); đồng hồ 60 giây; tất định theo chuỗi phím; lưu / khôi phục và từ chối dữ liệu hỏng.

`e2e.spec.ts` (chạy trong cổng cùng e2e chung): ván lưu dở ở giây 59,2 chơi tiếp tới hết giờ báo `pn:end` với `won: false, score: 42`; trả lời 4 câu bằng bàn phím ảo (đọc phép tính từ DOM) được 5 điểm, bỏ ván báo `won: false, score: 5`, bỏ trước khi trả lời và trước 1 giây không báo gì.
