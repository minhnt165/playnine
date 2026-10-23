# Nối Màu

Game Nối Màu (Color Link, thể loại "number link") của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Bàn vuông có các cặp chấm cùng màu. Nối hai chấm của mỗi màu bằng một đường đi qua các ô kề nhau theo hàng / cột (không đi chéo).
- Bắt đầu vẽ từ một chấm, hoặc từ đầu của một đường đang vẽ dở. Chạm lại một chấm thì vẽ lại đường của màu đó từ chấm này; chạm giữa một đường thì cắt đường đó tới ô vừa chạm rồi vẽ tiếp.
- Kéo lùi trên chính đường đang vẽ thì xóa phần phía sau. Đường đã tới chấm thứ hai thì chỉ được lùi.
- Các đường không được cắt nhau: vẽ đè lên đường màu khác sẽ cắt đường đó từ ô bị đè (còn mỗi chấm thì xóa hẳn). Không đi qua chấm màu khác.
- **Thắng** khi mọi cặp đã nối và mọi ô đều được phủ. Cách giải nào thỏa cả hai điều kiện đều được tính, không cần trùng lời giải của bộ sinh.
- **Nước**: mỗi lần chuyển sang vẽ một màu khác màu vừa vẽ tính là một nước. Số nước bằng số màu là ván hoàn hảo.
- Đồng hồ chạy từ nước đầu tiên; thời gian giải nhanh nhất lưu riêng cho từng cỡ bàn.

## Sinh màn

Engine (`engine.js`) sinh màn theo seed (PRNG mulberry32):

1. Dựng một đường đi qua mọi ô đúng một lần (đường rắn theo hàng), xáo nó bằng phép "backbite" vài nghìn lần.
2. Cắt đường đó thành các đoạn, mỗi đoạn ≥ 3 ô, số đoạn nằm trong khoảng màu của mode. Hai đầu mỗi đoạn là hai chấm.
3. Bỏ màn có hai chấm cùng màu nằm sát nhau. Trong 12 màn đạt chuẩn, giữ màn có ít ô vuông 2x2 cùng màu nhất (đường mảnh, ít lối giải tắt).

Các đoạn ở bước 2 chính là một lời giải phủ kín bàn, nên mọi màn đều giải được; `test.js` kiểm tra điều này cho hàng trăm seed ở mỗi mode.

## Cấp độ (mode)

Chọn trong **Cài đặt → Cỡ bàn** (hoặc bấm nhãn cỡ bàn cạnh tên game). Chưa đi nước nào thì đổi ngay; đang giải dở thì áp dụng từ màn sau.

| Mode | Bàn | Số màu | Điểm / màn |
| --- | --- | --- | --- |
| `5x5` | 5×5 | 4–6 | 3 |
| `7x7` | 7×7 | 6–8 | 5 |
| `9x9` | 9×9 | 9–12 | 8 |

## Ghi điểm trên cổng

- Metric `wins` (số màn giải được), điểm game 5; điểm từng mode như bảng trên.
- Luật chống gian lận: `min_duration_ms` 3000 cho 5x5 và 7x7, 6000 cho 9x9 (người giải nhanh nhất cũng cần vài giây để kéo hết các đường).
- Mỗi màn là một ván: màn mới `kit.sdk.start(mode)`, mở lại màn dở `kit.sdk.start(mode, true)`.
- Giải xong: `kit.sdk.end({ mode, won: true, timeMs, assisted: false })`, rồi mời chơi "Màn tiếp".
- Bỏ màn đã đi ít nhất một nước (Ván mới / phím N, có hỏi xác nhận): gửi `won: false`; chưa đi nước nào thì không gửi gì.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-noimau-settings-v1` | Cài đặt: giao diện, cỡ bàn (`mode`) |
| `playnine-noimau-stats-v1` | Thống kê theo cỡ bàn: đã chơi, đã giải, nhanh nhất, hoàn hảo |
| `playnine-noimau-save-v1` | Màn đang giải dở (chấm, các đường, số nước, thời gian) |
| `playnine-noimau-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Màn lưu hỏng (đường nhảy ô, chồng nhau, đi qua chấm màu khác…) bị bỏ và chia màn mới.

## Điều khiển và phím tắt

Chuột / chạm: kéo từ chấm hoặc đầu đường qua các ô; nút **Hoàn tác** xóa đoạn cuối của đường vừa vẽ, **Xóa hết** xóa mọi đường.

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `↓` `→` | Di chuyển con trỏ; đang vẽ thì kéo đường theo con trỏ |
| `Space` / `Enter` | Bắt đầu vẽ từ chấm / đầu đường dưới con trỏ, hoặc kết thúc đường đang vẽ |
| `Backspace` | Xóa đoạn cuối |
| `R` | Xóa mọi đường |
| `N` | Màn mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test e2e trong cổng (`e2e.spec.ts`): ván lưu 5x5 còn thiếu một ô, kéo nốt đoạn cuối thì cổng nhận `pn:end` thắng; bỏ màn đã đi nước thì nhận `pn:end` thua.
