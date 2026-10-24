# Gõ Nhanh

Game Gõ Nhanh (Typing Speed) của PlayNine: bài kiểm tra tốc độ gõ với các từ tiếng Anh phổ biến. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

Giao diện song ngữ Anh / Việt; **từ cần gõ luôn là tiếng Anh** (không có chế độ tiếng Việt).

## Luật

- Màn hình hiện dãy từ tiếng Anh (3 dòng, tự cuộn từng dòng). Gõ đúng từng chữ; đồng hồ chạy từ **phím đầu tiên**, bài dài **60 giây** hoặc **30 giây**.
- Chữ chưa gõ mờ, gõ đúng sáng lên, gõ sai đỏ, gõ thừa (quá độ dài từ, tối đa 8 chữ) đỏ sẫm. Con trỏ trượt mượt tới chữ kế tiếp.
- `Space` chuyển sang từ sau. Space khi từ chưa gõ đủ thì bỏ dở từ đó (phần thiếu tính là lỗi); từ gõ sai bị gạch chân đỏ. Space khi từ còn trống thì bỏ qua.
- `Backspace` chỉ sửa trong **từ đang gõ**, không lùi về từ trước; `Ctrl` / `Alt` + `Backspace` xóa cả từ đang gõ.
- Dãy từ sinh từ hạt giống (mulberry32), không lặp lại trong 3 từ gần nhất; sinh sẵn 6 từ mỗi giây của bài (360 / 180 từ ≈ 465 WPM, không ai gõ hết; nếu gõ hết thì bài kết thúc sớm).

### Cách tính

- **Ký tự đúng** = số chữ đúng vị trí trong mọi từ đã gõ và từ đang gõ, cộng một dấu cách sau mỗi từ gõ đúng hoàn toàn.
- **WPM** = ký tự đúng ÷ 5 ÷ số phút của bài (60 hoặc 30 giây). **Điểm** = WPM làm tròn.
- **WPM thô** = mọi phím ký tự đã gõ (kể cả sai, kể cả dấu cách) ÷ 5 ÷ số phút.
- **Độ chính xác** = (số phím − số phím sai) ÷ số phím. Phím sai là chữ không khớp lúc gõ, chữ thừa, và Space khi từ còn thiếu; sửa lại bằng Backspace vẫn tính là đã sai.
- **Ký tự** ở màn kết quả: đúng / sai / thừa / thiếu (không tính dấu cách).
- **Biểu đồ** (SVG): WPM cộng dồn ở cuối mỗi giây (đường liền), WPM thô của riêng từng giây (đường đứt), dấu × ở giây có lỗi. Rê chuột / chạm vào biểu đồ để xem số của từng giây.

### Chống dán và gõ tự động

- Ô nhập chặn dán / kéo thả (`paste`, `drop`, `insertFromPaste`…) và mọi lần chèn từ 2 ký tự trở lên cùng lúc (tự sửa chính tả, gợi ý từ, gõ vuốt trên điện thoại): bỏ qua và báo.
- Engine đo nhịp gõ trên thời điểm phím thật (`event.timeStamp` của keydown) và **gắn cờ** bài khi:
  - ký tự đến đồng loạt: 5 ký tự liên tiếp cách nhau dưới 3 ms, hoặc từ 15 lần "dưới 3 ms" trở lên và chiếm ≥ 10% số phím;
  - quá 40 ký tự trong một giây (≈ 480 WPM).
- Bot "người gõ cực giỏi" (khoảng cách phím ngẫu nhiên quanh 40–80 ms, 3% phím gần như cùng lúc kiểu rollover, 2% gõ sai rồi sửa) trên 300 hạt giống mỗi mode không bị gắn cờ lần nào; nhiều nhất 34 ký tự / giây, tỉ lệ "dưới 3 ms" tối đa 5,9%. Test `người gõ rất nhanh thật … không bị gắn cờ` khóa điều này.
- Bài bị gắn cờ dừng ngay, hiện thông báo "không được tính", không ghi kỷ lục.

## Điều khiển

- Máy tính: gõ bằng bàn phím, không cần bấm vào ô nào (nếu ô gõ mất focus, phím chữ tiếp theo tự đưa focus về).
- Điện thoại: chạm Bắt đầu hoặc chạm vào dãy từ để mở bàn phím hệ thống (một ô nhập ẩn, tắt tự sửa / tự viết hoa / gợi ý). Khi bàn phím bật, khung game co theo `visualViewport` (phần màn hình còn nhìn thấy), ẩn dòng hướng dẫn để dãy từ luôn hiện đủ 3 dòng.
- Nút tạm dừng ở ô số liệu; tự tạm dừng khi trang ẩn hoặc mở hộp thoại. Không dùng phím chữ (P, N) làm phím tắt trong lúc gõ vì chúng là chữ cần gõ.

## Mode

| Mode | Thời lượng | Điểm cổng |
| --- | --- | --- |
| `60s` (60 giây, mặc định) | 60 s | 5 |
| `30s` (30 giây) | 30 s | 3 |

Chọn mode ở màn chờ hoặc màn kết quả (lưu trong cài đặt).

## Ghi điểm trên cổng

- `metric: score_high`, điểm = WPM làm tròn.
- Bấm **Bắt đầu** (`#btn-start`, Space / Enter hoặc chạm lớp phủ cũng được): `kit.sdk.start(mode)`; mở lại bài lưu dở: `kit.sdk.start(mode, true)`.
- Hết giờ: `kit.sdk.end({ mode, won: false, score, assisted: false })` (bài kiểm tra không có thắng / thua).
- Bị gắn cờ gõ tự động: `kit.sdk.end({ mode, won: false, score: 0, assisted: true })`.
- Bỏ bài (nút Ván mới, `Tab`) khi đã có ký tự đúng hoặc đã gõ ≥ 1 giây: hỏi lại, rồi gửi `won: false` với điểm hiện có (WPM tính trên thời gian đã gõ). Chưa tới mức đó thì gõ lại luôn, không gửi gì.
- Luật chống gian lận (`rules`):
  - `min_duration_ms`: 58000 (`60s`) / 28000 (`30s`) = thời lượng bài trừ 2 giây cho trễ mạng. Đồng hồ cổng tính từ lúc bấm Bắt đầu, còn bài tính từ phím đầu, nên bài thật luôn dài hơn ngưỡng.
  - `max_score`: 250 (`60s`) / 275 (`30s`). Kỷ lục gõ bền của người ~ 200–215 WPM; người gõ giỏi nhất trên các trang thử tốc độ đạt ~ 250 WPM ở bài 60 giây với từ ngắn hơn bộ từ này (từ ở đây dài trung bình 5,46 chữ). Bài 30 giây cho phép bùng nổ cao hơn khoảng 10% nên trần 275.
  - Không đặt `max_score_per_sec`: điểm là tốc độ (WPM), không cộng dồn theo thời gian, và `min_duration_ms` đã khóa thời lượng, nên `max_score` ÷ thời lượng tối thiểu (250 ÷ 58 ≈ 4,3 điểm/giây; 275 ÷ 28 ≈ 9,8) đã là trần theo giây. Bot người gõ cực giỏi (48 ms / phím ≈ 250 WPM thô) đạt 257 / 261 điểm; bot 60 ms / phím đạt 206 / 209.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-gonhanh-settings-v1` | Cài đặt: giao diện, mode (`60s` / `30s`), tiếng phím (tắt mặc định), rung khi gõ sai (bật mặc định), `guideSeen` |
| `playnine-gonhanh-stats-v1` | Thống kê: số bài, kỷ lục từng mode, độ chính xác cao nhất (bài ≥ 20 phím), tổng số từ gõ đúng, 10 bài gần nhất |
| `playnine-gonhanh-save-v1` | Bài đang gõ dở `{ v: 1, game }` (mode, hạt giống, dãy từ, chữ đã gõ, đồng hồ, lịch sử theo giây, bộ đếm chống gõ tự động). Ghi khi tạm dừng / rời trang; mở lại thì ở trạng thái tạm dừng |
| `playnine-gonhanh-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| Chữ, `Space` | Gõ, sang từ sau |
| `Backspace` / `Ctrl`+`Backspace` | Xóa một chữ / cả từ đang gõ |
| `Esc` | Tạm dừng / gõ tiếp (đóng hộp thoại nếu đang mở) |
| `Tab` | Gõ lại bài mới (đang gõ dở thì hỏi trước) |
| `Space` / `Enter` | Bắt đầu, gõ tiếp, chơi lại (ngoài lúc gõ) |
| `N` | Bài mới (ở màn chờ, tạm dừng, kết quả) |

## Danh sách từ

- Nguồn: SCOWL (Spell Checker Oriented Word Lists, Kevin Atkinson) qua gói npm `wordlist-english` 1.2.1 (MIT), file `english-words-10.json` (mức 10 = phổ biến nhất). Giấy phép trong `WORDS-LICENSE.txt`.
- `tools/build-words.mjs` lọc từ a–z dài 1–7 chữ, bỏ từ viết tắt / mảnh từ (cs, hes, re…) và một danh sách nhỏ từ nhạy cảm, ghi ra `words.js` (2515 từ, ~16 KB). Chạy lại: `node tools/build-words.mjs <thư mục package của wordlist-english>`.

## Kiểm tra

```bash
node test.js
```

Test engine phủ: danh sách từ hợp lệ; dãy từ tất định theo hạt giống, không lặp liền nhau, đủ dài; gõ đúng / sai / thừa / bỏ dở; Backspace chỉ trong từ hiện tại, xóa cả từ; đồng hồ từ phím đầu, hết giờ thì dừng; WPM, WPM thô, độ chính xác, điểm khi bỏ dở; biểu đồ theo giây; gắn cờ khi ký tự đến đồng loạt hoặc quá nhanh, người gõ rất nhanh thật không bị gắn cờ; lưu / khôi phục và từ chối dữ liệu hỏng.

`e2e.spec.ts` (chạy trong cổng cùng e2e chung): bài lưu dở còn 0,6 giây, gõ tiếp tới hết giờ báo `pn:end` với `won: false` và đúng điểm; bỏ bài sau khi gõ báo `won: false`, bỏ trước khi gõ không báo gì.
