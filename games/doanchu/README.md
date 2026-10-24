# Đoán Chữ

Game Đoán Chữ (Word Guess) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK. Giao diện song ngữ Anh / Việt, nhưng **từ cần đoán luôn là từ tiếng Anh**.

## Luật

- Đoán một từ tiếng Anh 5 chữ trong 6 lượt. Mỗi lượt phải là từ có trong danh sách từ hợp lệ; từ lạ bị từ chối ("Không có trong danh sách từ"), hàng lắc, không mất lượt.
- Sau mỗi lượt, ô đổi màu: **xanh** = chữ có trong từ và đúng chỗ, **vàng** = có trong từ nhưng sai chỗ, **xám** = không có.
- Chữ lặp: ô xanh được xét trước; chữ còn lại chỉ tô vàng tối đa bằng số lần chữ đó còn lại trong đáp án (đoán `GEESE` khi đáp án có một chữ E thì chỉ một ô E được tô).
- Bàn phím ảo tô theo màu tốt nhất mỗi chữ đã có (xanh > vàng > xám).
- Thắng khi đoán đúng; hết 6 lượt chưa đúng là thua, game hiện đáp án.
- **Chế độ khó** (tùy chọn trong Cài đặt): chữ xanh phải giữ đúng chỗ, chữ vàng (đủ số lần đã lộ) phải có trong các lượt sau. Chỉ đổi được trước lượt đoán đầu tiên; đổi giữa ván thì áp dụng từ ván sau. Kết quả chia sẻ có dấu `*`.
- **Chế độ người mù màu** (Cài đặt): cam = đúng chỗ, xanh dương = có trong từ (cả trên bàn, bàn phím và ô chia sẻ).

## Mode

| Mode | Cách chọn đề | Ghi chú |
| --- | --- | --- |
| `daily` (Hằng ngày) | Một từ mỗi ngày theo **giờ địa phương** của máy; đề #1 là ngày 2026-10-24. Thứ tự đề là một hoán vị cố định của danh sách đáp án (PRNG mulberry32, seed băm từ `doanchu-daily-v1`), đi hết vòng ~855 ngày mới lặp. | Mỗi ngày chơi một lần; lưu kết quả ngày, chuỗi ngày thắng, chia sẻ ô màu (văn bản, chép vào clipboard). Đã chơi xong thì mở lại thấy kết quả và đếm ngược tới từ mới. |
| `free` (Tự do) | Seed ngẫu nhiên 32 bit; đáp án = `ANSWERS[rng(hash('doanchu-free-' + seed))]`. | Chơi bao nhiêu từ cũng được. |

Mỗi lúc chỉ có một ván đang chơi (cổng giữ một ván cho mỗi game). Mở game: còn ván dở thì chơi tiếp; chưa chơi từ hôm nay thì vào từ hằng ngày; đã chơi thì hiện lại kết quả hôm nay, bấm "Chơi tự do" để chơi tiếp. Đổi mode hoặc ván mới khi đang dở (đã đoán ≥ 1 lượt) phải xác nhận, và ván đó tính là thua (bỏ từ hằng ngày là mất từ của hôm đó).

## Danh sách từ

- Nguồn: SCOWL (http://wordlist.aspell.net/) qua gói npm `wordlist-english` 1.2.1 (MIT). Giấy phép SCOWL chép ở [WORDS-LICENSE.txt](WORDS-LICENSE.txt).
- `words.js` sinh bằng script, **đừng sửa tay**:

  ```bash
  node tools/build-words.mjs <thư mục gói wordlist-english>
  ```

- Đáp án (855 từ): từ 5 chữ a–z ở mức SCOWL ≤ 20 (biến thể `english`, không lấy chính tả riêng Mỹ / Anh), bỏ dạng số nhiều / ngôi ba / quá khứ (-s, -es, -ies, -ed) khi gốc là từ có thật, bỏ danh sách loại trừ nhỏ trong script (từ xúc phạm, nhạy cảm, tên riêng viết thường, viết tắt, từ quá lạ).
- Từ hợp lệ khi đoán (6476 từ): mọi từ 5 chữ a–z ở mức ≤ 70 (english + american + british) cộng đáp án. `words.js` ≈ 44 KB.
- Đổi danh sách là đổi đề hằng ngày đã phát và làm hỏng ván lưu: test "khóa đề" trong `test.js` sẽ đỏ, cập nhật cả đáp án seed 12345 trong `e2e.spec.ts`.

## Điều khiển

- Chạm / bấm chuột các phím của bàn phím ảo QWERTY (Đoán, Xóa ở hàng dưới).
- Bàn phím máy tính: gõ chữ, `Enter` đoán, `Backspace` xóa.
- Nút trên thanh trên: Cách chơi, Thống kê, Cài đặt, Từ mới (chơi tự do).
- Hết ván: thanh dưới bàn hiện đáp án, nút Kết quả (chia sẻ) và nút chơi tiếp.

## Ghi điểm trên cổng

- `metric: wins`; mode `daily` 6 điểm, `free` 3 điểm; luật `min_duration_ms: 3000` cho cả hai (người đoán trúng ngay lượt đầu vẫn mất vài giây gõ 5 chữ và xem ô lật; ván kết thúc nhanh hơn coi là bất thường).
- Ván mới: `kit.sdk.start(mode)`; mở lại ván lưu dở: `kit.sdk.start(mode, true)`.
- Thắng: `kit.sdk.end({ mode, won: true, assisted: false })`; hết 6 lượt: `won: false`. Kết quả gửi ngay khi đoán xong lượt cuối (trước hiệu ứng lật).
- Bỏ ván đã đoán ≥ 1 lượt (đổi mode, Từ mới): gửi `won: false`; chưa đoán lượt nào thì không gửi gì.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-doanchu-settings-v1` | Cài đặt: giao diện, `hard`, `contrast`, `guideSeen` |
| `playnine-doanchu-stats-v1` | `played`, `won`, `dist` (số ván thắng theo lượt 1–6), `daily` (kết quả từng ngày: thắng / số lượt / các từ đã đoán, ngày cũ hơn 60 ngày chỉ giữ thắng / thua), `maxDaily`, `lastN` |
| `playnine-doanchu-save-v1` | Ván đang chơi dở: `{ v, game: { v, mode, seed \| date, answer, guesses, hard }, typed }` |
| `playnine-doanchu-summary-v1` | Tóm tắt cho thẻ game trên cổng (có `daily`: ngày, đã chơi chưa, chuỗi ngày) |

Ván lưu được kiểm tra lại khi mở (đáp án khớp seed / ngày, từ hợp lệ, không đoán sau khi thắng, đúng luật chế độ khó); hỏng thì bỏ.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `A`–`Z` | Gõ chữ |
| `Enter` | Đoán |
| `Backspace` | Xóa chữ |
| `Esc` | Đóng hộp thoại |

## Kiểm tra engine

```bash
node test.js
```

Test phủ: tô màu (cả chữ lặp), luật lượt, thắng / thua, chế độ khó, màu bàn phím, ngày địa phương và số đề, đề hằng ngày không lặp trong cả vòng, khóa đề, đề tự do theo seed, chia sẻ ô màu, lưu / khôi phục và từ chối dữ liệu hỏng. Test "giải được" chạy một solver (lượt đầu `RAISE`, sau đó chọn từ còn khả dĩ chia ứng viên nhiều nhóm nhất) trên **mọi** đáp án ở chế độ khó: thắng hết trong ≤ 6 lượt (trung bình 3,2 lượt).

Test Playwright trong cổng: `e2e.spec.ts` (thắng, thua sau 6 lượt, bỏ từ hằng ngày đã đoán).
