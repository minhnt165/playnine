# Ghép Chữ

Game Ghép Chữ (Anagrams) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

Giao diện song ngữ Anh / Việt, nhưng **từ cần ghép luôn là từ tiếng Anh**. Vẽ bằng DOM (ô chữ là nút), không dùng canvas.

## Luật

- Mỗi vòng **90 giây**, cho **6 hoặc 7 chữ cái** lấy từ một "từ gốc" tiếng Anh phổ biến đã bị xáo.
- Ghép càng nhiều **từ tiếng Anh từ 3 chữ trở lên** càng tốt. Mỗi chữ dùng tối đa số lần nó có trong bộ chữ.
- Điểm theo độ dài, từ đã tìm gửi lại không tính:

| Độ dài | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- |
| Điểm | 100 | 400 | 1.200 | 2.000 | 3.000 |

- Vòng nào cũng có ít nhất **25 từ hợp lệ** và luôn có từ dùng hết các chữ (chính từ gốc).
- Hết giờ: bảng kết quả với điểm, số từ đã tìm / tổng số từ, danh sách **từ đã tìm** và **từ bỏ lỡ** (mọi từ hợp lệ của vòng, dài trước rồi theo ABC).
- Vòng sinh tất định theo hạt giống (`E.newGame(seed)`: chọn từ gốc rồi xáo chữ bằng mulberry32).

## Bộ từ

- Nguồn: SCOWL (Kevin Atkinson) qua gói npm `wordlist-english` 1.2.1 (MIT); giấy phép ở [WORDS-LICENSE.txt](WORDS-LICENSE.txt). Game không tải gì từ mạng.
- `words.js` do script sinh ra, không sửa tay: `node tools/build-words.mjs [thư mục package của wordlist-english]`.
  - **Từ hợp lệ**: chỉ a–z, dài 3–7, SCOWL mức ≤ 50 (english + american + british, nên `color` và `colour` đều được), bỏ một danh sách chặn nhỏ (thô tục, miệt thị, tình dục, vài mảnh viết tắt 3 chữ như `hes`, `nth`).
  - **Từ gốc**: dài 6–7, SCOWL mức ≤ 20 (english), không thuộc chủ đề nhạy cảm (bạo lực, chất gây nghiện…), ghép được ≥ 25 từ hợp lệ, tổng điểm mọi từ trong khoảng 15.000–40.000 (để vòng 6 chữ và 7 chữ có tiềm năng điểm gần nhau), mỗi bộ chữ chỉ một từ gốc (`master` / `stream` chỉ giữ một).
  - Chỉ giữ những từ hợp lệ ghép được từ ít nhất một từ gốc: 7.818 từ, 1.154 từ gốc (323 từ 6 chữ, 831 từ 7 chữ), `words.js` ≈ 47 KB.
- Đổi bộ từ là đổi vòng của mọi hạt giống: tăng `VERSION` trong `engine.js` (ván lưu cũ bị bỏ), sinh lại ván lưu trong `e2e.spec.ts`, cập nhật `MAX_SCORE` và `max_score` trong `game.json` (test kiểm cả hai).

## Điều khiển

- **Chạm / bấm chữ** ở hàng dưới để ghép (bắt ngay khi nhấn xuống, không lấy focus). Chạm một chữ trong hàng từ đang ghép để bỏ chữ đó.
- Nút **Xáo** (trộn lại hàng chữ, giữ nguyên từ đang ghép), **Xóa** (bỏ chữ cuối), **Gửi**.
- **Bàn phím vật lý**: gõ chữ a–z (lấy ô chưa dùng đầu tiên có chữ đó; chữ không có thì rung nhẹ), `Enter` gửi, `Backspace` xóa chữ cuối, `Delete` xóa cả từ, `Space` xáo, `Esc` tạm dừng. Hàng chữ trên màn hình là bàn phím ảo cho điện thoại.
- Gửi sai thì hàng từ rung và báo lý do (ít hơn 3 chữ / không có trong danh sách từ / đã tìm rồi — từ cũ trong danh sách chớp lên). Sai ngắn thì giữ từ để gõ tiếp, các lỗi khác thì xóa từ.

## Màn hình và luồng ván

- Màn chờ có bảng điểm theo độ dài, kỷ lục và nút **Bắt đầu** (`#btn-start`); Enter / Space hoặc chạm vào lớp phủ cũng bắt đầu. Lần đầu mở hiện hướng dẫn (lưu `guideSeen` trong cài đặt).
- Tự tạm dừng khi trang ẩn hoặc mở hộp thoại; nút tạm dừng ở ô số liệu, phím `Esc`. Lớp phủ tạm dừng che kín hàng chữ để không ngồi nghĩ khi đồng hồ đứng.
- 10 giây cuối đồng hồ chuyển đỏ, 5 giây cuối có tiếng tích tắc. Kỷ lục mới thì có pháo giấy.
- Cài đặt: giao diện, ngôn ngữ, âm thanh, **rung** (bật mặc định, chỉ có tác dụng trên điện thoại).

## Ghi điểm trên cổng

- `metric: score_high`, một mode `classic` (Cổ điển), 5 điểm mỗi ván.
- Vòng mới: `kit.sdk.start('classic')` khi bấm Bắt đầu; mở lại vòng lưu dở: `kit.sdk.start('classic', true)`.
- Hết 90 giây: `kit.sdk.end({ mode: 'classic', won: false, score, assisted: false })` (game tính điểm, không có thắng).
- Bỏ vòng (nút Ván mới) khi đã có điểm hoặc đã chơi ≥ 1 giây: hỏi lại, rồi gửi `won: false` với điểm hiện có. Chưa tới 1 giây và chưa có điểm thì chơi lại luôn, không gửi gì.
- Luật chống gian lận (`rules`):
  - `min_duration_ms: 85000`: chỉ nhận vòng chơi đủ giờ (vòng thật kéo dài 90 giây cộng thời gian tạm dừng; chừa 5 giây cho lệch giờ / mạng). Vòng bỏ giữa chừng trước 85 giây bị máy chủ bỏ qua.
  - `max_score: 40000`: trần tuyệt đối, bằng tổng điểm mọi từ hợp lệ của vòng "giàu" nhất trong bộ từ gốc (`obtains`, 69 từ) — `E.MAX_SCORE`, test tính lại trên mọi từ gốc.
  - `max_score_per_sec: 950`: bot biết hết mọi từ, gửi từ dài trước, mỗi từ nghĩ 450 ms + 90 ms mỗi phím (kể cả Enter), chạy 3.000 hạt giống: tìm hết mọi từ trước giây 85 ở mọi vòng, cao nhất 470,6 điểm/giây xét từ giây 85 (thời điểm sớm nhất một vòng được nhận); đặt ×2. (Xét từ giây thứ 5 bot đạt 2.430 điểm/giây, nhưng vòng ngắn hơn 85 giây đã bị `min_duration_ms` chặn.) Thực tế `max_score` là ngưỡng chặn chính.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-ghepchu-settings-v1` | Cài đặt (giao diện, rung, `guideSeen`) |
| `playnine-ghepchu-stats-v1` | Thống kê: số vòng, điểm cao nhất, tổng số từ đã tìm, từ dài nhất từng tìm |
| `playnine-ghepchu-save-v1` | Vòng đang chơi dở `{ v: 1, game: { v, seed, base, letters, found, t } }` (điểm tính lại từ `found`). Ghi khi tạm dừng / gửi từ đúng / rời trang, mở lại thì ở trạng thái tạm dừng |
| `playnine-ghepchu-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `A`–`Z` | Gõ chữ |
| `Enter` | Gửi từ; ngoài vòng chơi: bắt đầu, chơi tiếp, chơi lại |
| `Backspace` | Xóa chữ cuối |
| `Delete` | Xóa cả từ đang ghép |
| `Space` | Xáo chữ; ngoài vòng chơi: như `Enter` |
| `Esc` | Tạm dừng / chơi tiếp; đóng hộp thoại |

Không có phím `N` / `P` vì mọi chữ cái đều dùng để gõ từ; ván mới bằng nút trên thanh trên.

## Kiểm tra

```bash
node test.js
```

Test engine phủ: bộ từ (chỉ a–z, đúng độ dài, sắp xếp, không có từ bị chặn), từ gốc (6–7 chữ, không trùng bộ chữ), **mọi** từ gốc cho ≥ 25 từ hợp lệ và chứa chính nó, trần điểm khớp `game.json`; điểm theo độ dài; ghép được / không ghép được (chữ lặp); vòng tất định theo hạt giống và chữ đã xáo; gửi từ đúng / trùng / ngắn / sai chữ / không phải từ / hết giờ; đồng hồ 90 giây; xáo chữ; lưu / khôi phục (cả đồng hồ lẻ mili giây) và từ chối dữ liệu hỏng.

`e2e.spec.ts` (chạy trong cổng cùng e2e chung): vòng lưu dở ở giây 89,2 chơi tiếp tới hết giờ báo `pn:end` với `won: false, score: 3100` và hiện 2 từ đã tìm / 30 từ bỏ lỡ; gõ từ dài nhất được điểm, bỏ vòng có điểm báo `won: false` với điểm đó, bỏ trước 1 giây không báo gì.
