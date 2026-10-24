# Tìm Chữ

Game Tìm Chữ (Word Search) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

Giao diện song ngữ Anh / Việt; **các từ cần tìm luôn là tiếng Anh**.

## Luật chơi

Lưới chữ cái n x n giấu một danh sách từ tiếng Anh (theo một chủ đề như Động vật, Đồ ăn, Du lịch… hoặc từ ngẫu nhiên). Mỗi từ nằm trên một đường thẳng (ngang, dọc hoặc chéo 45°) và xuất hiện **đúng một lần** trong lưới. Tìm hết các từ là thắng; xếp hạng theo thời gian.

- Từ tìm được tô một vệt màu riêng trên lưới và bị gạch khỏi danh sách.
- Chọn sai (đoạn thẳng không phải từ trong danh sách) chỉ nháy đỏ, không phạt.
- **Gợi ý**: khoanh chữ đầu của từ chưa tìm đứng đầu danh sách (mỗi từ một lần, thẻ từ đó có viền cam). Ván có dùng gợi ý gửi `assisted: true` và không tính kỷ lục trong máy.
- Đồng hồ chạy từ lúc đề hiện ra, dừng khi mở hộp thoại hoặc ẩn tab; lúc dừng vì hộp thoại thì bàn bị làm mờ để không dò chữ "miễn phí".

## Điều khiển

- **Kéo** (chuột / chạm) từ chữ đầu tới chữ cuối của từ, chiều nào cũng được. Hướng kéo tự bắt về 1 trong 8 hướng gần nhất và độ dài theo hình chiếu, nên ngón tay lệch vài độ vẫn ra đúng đoạn; kéo quá mép lưới thì đoạn dừng ở mép.
- **Chạm chữ đầu rồi chạm chữ cuối** cũng được (chạm lại chữ đầu để bỏ chọn; chạm một ô không thẳng hàng thì ô đó thành chữ đầu mới).
- **Bàn phím**: mũi tên di chuyển ô, `Enter` / `Space` chọn chữ đầu rồi chữ cuối (đang chọn chữ đầu thì có vệt xem trước tới ô hiện tại), `Esc` bỏ chọn.
- Lưới 14x14 trên màn 390x844 có ô khoảng 26 px; nhờ bắt hướng khi kéo, chỉ cần đặt ngón đúng chữ đầu và thả gần chữ cuối.

## Cỡ đề (mode)

| Mode | Lưới | Mức | Số từ | Độ dài từ | Hướng đặt từ | Điểm trên cổng | `min_time_ms` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `s` (mặc định) | 8x8 | Dễ | 6 | 3–7 | ngang, dọc (xuôi) | 3 | 1400 |
| `m` | 11x11 | Vừa | 10 | 3–9 | ngang, dọc, hai chéo xuôi | 5 | 2400 |
| `l` | 14x14 | Khó | 15 | 4–10 | cả 8 hướng, kể cả viết ngược | 8 | 3600 |

Đổi cỡ bằng thanh chọn ngay dưới HUD. Đề đang dở (đã đi ít nhất một nước) thì hỏi trước vì bỏ đề tính là thua.

## Sinh đề

Theo seed (PRNG mulberry32), hoàn toàn tất định:

1. Chọn chủ đề (12 chủ đề + "từ ngẫu nhiên"), xáo kho từ của chủ đề (lọc theo độ dài của mode).
2. Lần lượt đặt từ: bỏ từ "đụng" từ đã chọn (từ này chứa từ kia, xuôi hay ngược, vì như vậy từ ngắn sẽ xuất hiện hai lần); liệt kê mọi chỗ đặt hợp lệ theo các hướng của mode (chỉ được đè lên ô trùng chữ), một nửa số lần ưu tiên chỗ dùng chung chữ với từ đã đặt cho lưới đan xen.
3. Lấp ô trống bằng chữ ngẫu nhiên theo tần suất chữ cái tiếng Anh, rồi quét **cả 8 hướng**: nếu chữ lấp vô tình tạo thêm một bản của từ nào trong danh sách thì lấp lại các ô lấp trên bản thừa; bản thừa nằm trọn trong chữ của các từ đã đặt thì bỏ lần thử, làm lại với dãy số ngẫu nhiên kế tiếp.

Test kiểm tra 400 seed mỗi mode: đúng số từ, đúng hướng, mọi từ xuất hiện đúng một lần theo 8 hướng, không từ nào chứa từ khác. Tốc độ đo trong Node (máy bàn, 200 seed mỗi cỡ): 8x8 trung bình 0,05 ms, 11x11 0,2 ms, 14x14 khoảng 1 ms / đề, chậm nhất khoảng 1,6 ms. Điện thoại chậm (chậm hơn khoảng 10 lần) vẫn dưới 20 ms, xa mục tiêu 300 ms.

## Bộ từ

`words.js` do `tools/build-words.mjs` sinh ra (đừng sửa tay), khoảng 43 KB:

- Nguồn: SCOWL (Spell Checker Oriented Word Lists, Kevin Atkinson) qua gói npm `wordlist-english` 1.2.1 (MIT), các file `english-words-*` và `american-words-*`. Giấy phép SCOWL chép ở [WORDS-LICENSE.txt](WORDS-LICENSE.txt). Game không tải gì từ mạng.
- **Chủ đề**: danh sách viết tay trong script, chỉ giữ từ có trong SCOWL mức ≤ 35.
- **Từ ngẫu nhiên**: từ gốc phổ biến SCOWL mức ≤ 20 (bỏ dạng chia `-s`, `-es`, `-ed`, `-ing`, `-ly` khi có từ gốc), khoảng 5300 từ.
- Mọi từ: chỉ a–z, dài 3–10, không đối xứng (đọc xuôi ngược như nhau sẽ "xuất hiện hai lần"), bỏ từ thô tục / nhạy cảm theo danh sách loại trừ trong script.

Sinh lại: `node tools/build-words.mjs [thư mục package của wordlist-english]`.

## Ghi điểm trên cổng

- Metric `time_low`, mỗi cỡ một mode. Đề mới: `kit.sdk.start(mode)`; mở lại đề lưu dở: `kit.sdk.start(mode, true)`.
- Thắng: `kit.sdk.end({ mode, won: true, timeMs, assisted })` (`assisted` = đã dùng gợi ý).
- Bỏ đề đã đi ít nhất một nước (đã chọn một đoạn thẳng hoặc dùng gợi ý; bấm Ván mới hoặc đổi cỡ, có hỏi xác nhận): `won: false`. Đề chưa đi nước nào thì không gửi gì.
- `min_time_ms` = số từ × 250 ms (một lần kéo nhanh nhất có thể của người thật: nhấn, kéo, nhả, chưa tính thời gian dò chữ), làm tròn xuống một chút: 6 / 10 / 15 từ → 1500 / 2500 / 3750 ms → đặt 1400 / 2400 / 3600 ms.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-timchu-settings-v1` | Cài đặt: giao diện, cỡ đề `size` (`'s'` / `'m'` / `'l'`), đã xem hướng dẫn `guideSeen` |
| `playnine-timchu-stats-v1` | Thống kê: đã chơi, đã giải, chuỗi thắng, kỷ lục từng cỡ (chỉ đề không dùng gợi ý) |
| `playnine-timchu-save-v1` | Đề đang dở (chỉ khi đã đi ít nhất một nước): `{ v, game, elapsed }`, `game` gồm chủ đề, lưới, vị trí các từ, từ đã tìm, từ đã gợi ý, số lượt chọn |
| `playnine-timchu-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng, khác phiên bản hoặc lưới không còn đúng luật (chữ không khớp từ, hướng không có trong mode, từ xuất hiện nhiều hơn một lần…) thì bị bỏ và chia đề mới. Ván lưu chứa nguyên lưới nên đổi bộ từ sau này không làm hỏng ván dở.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `↑` `↓` `←` `→` | Di chuyển ô đang chọn |
| `Enter` / `Space` | Chọn chữ đầu, rồi chữ cuối của từ |
| `Esc` | Bỏ chữ đầu đang chọn / đóng hộp thoại |
| `H` | Gợi ý |
| `N` | Ván mới |

## Kiểm tra

```bash
node test.js
```

Test engine phủ bộ từ (định dạng, cỡ file, giấy phép), đường thẳng giữa hai ô, tìm từ theo 8 hướng, sinh đề tất định và hợp lệ trên 400 seed mỗi cỡ, tốc độ sinh đề, chọn từ xuôi / ngược / sai / chọn lại, thắng, gợi ý, lưu / khôi phục và từ chối ván hỏng (kể cả lưới bị sửa cho một từ xuất hiện hai lần). Test trong cổng: `e2e.spec.ts` (ván thắng từ ván lưu dựng sẵn, bỏ đề, đổi cỡ trước nước đầu).
