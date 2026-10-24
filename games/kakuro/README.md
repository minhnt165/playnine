# Kakuro

Game Kakuro (Cross Sums) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Bàn gồm ô đen và ô trắng. Ô đen có đường chéo mang số gợi ý: số ở góc trên phải là tổng của **đoạn ngang** bên phải nó, số ở góc dưới trái là tổng của **đoạn dọc** bên dưới nó.
- Điền vào mỗi ô trắng một chữ số từ 1 đến 9 sao cho mỗi đoạn có tổng bằng số gợi ý và **không lặp số trong một đoạn**.
- Điền kín bàn, mọi đoạn đúng tổng là thắng. Đề nào cũng có **đúng một lời giải** và giải được bằng suy luận, không phải đoán.

## Điều khiển

- Chạm một ô trắng để chọn (ô cùng đoạn được tô nhạt, số gợi ý của hai đoạn sáng vàng), rồi chạm chữ số ở bàn số. Chạm lại đúng số đang có trong ô thì xóa số đó.
- **Ghi chú**: bật nút Ghi chú (hoặc giữ `Shift` khi gõ số) để viết các số nhỏ cần cân nhắc. Điền một số sẽ tự gạch số đó khỏi ghi chú của các ô cùng đoạn.
- **Hoàn tác / Làm lại** không giới hạn (lưu cả khi đóng trang).
- **Bảng tổ hợp** (dưới bàn chơi, bật / tắt trong Cài đặt): hai dòng cho đoạn ngang và dọc của ô đang chọn, liệt kê mọi bộ chữ số có tổng đúng (ví dụ `16/2` → `79`); bộ nào không chứa đủ các số đã điền thì gạch ngang. Đây chỉ là bảng tra cứu nên **không** tính là trợ giúp.
- **Gợi ý**: điền đúng chữ số vào ô đang chọn (hoặc ô trống / sai đầu tiên). Lần đầu trong ván sẽ hỏi lại; ván đã dùng gợi ý gửi `assisted: true` và không tính kỷ lục trong máy.
- **Báo lỗi** (Cài đặt): tô đỏ số bị lặp trong đoạn và gạch chân số gợi ý của đoạn sai (đầy mà lệch tổng, hoặc chưa đầy đã đạt / vượt tổng). Mặc định "Chỉ mức Dễ"; có thể chọn Luôn bật / Tắt. Báo lỗi chỉ dựa trên luật, không so với lời giải.

## Cỡ đề (mode)

| Mode | Cỡ (tính cả ô gợi ý) | Ô trắng | Đoạn dài nhất | Điểm |
| --- | --- | --- | --- | --- |
| `s` | Dễ 6×6 | 14–20 | 4 | 3 |
| `m` | Vừa 8×8 | 28–38 | 5 | 5 |
| `l` | Khó 10×10 | 46–62 | 6 | 8 |

Đổi cỡ ở huy hiệu cạnh tên game hoặc trong Cài đặt. Đề đang dở (đã đi ít nhất một nước) thì hỏi trước, vì bỏ đề tính là thua.

## Sinh đề

Trong `engine.js`, tất định theo seed (PRNG mulberry32):

1. Dựng khung đối xứng tâm: tô đen ngẫu nhiên từng cặp ô đối xứng, rồi sửa (ô lẻ thì tô đen, đoạn quá dài thì cắt) tới khi mỗi ô trắng thuộc một đoạn ngang và một đoạn dọc dài 2 trở lên, các ô trắng liền một khối và số ô trắng nằm trong khoảng của cỡ đó.
2. Điền số ngẫu nhiên không lặp trong đoạn, mỗi đoạn nghiêng về số nhỏ hoặc số lớn để tổng hay rơi về hai đầu (ít tổ hợp).
3. Leo đồi: đếm các ô mà **chỉ lan truyền** (tổ hợp còn hợp của từng đoạn, chữ số bắt buộc chỉ còn một chỗ, ô chỉ còn một khả năng) chưa suy ra được; đổi một chữ số ở các ô đó, giữ thay đổi nếu số ô chưa suy ra được không tăng. Về 0 thì lan truyền đã giải kín bàn, nên lời giải là duy nhất. Quá số lần thử thì dựng khung khác.

`test.js` kiểm tra bằng bộ giải quay lui đếm nghiệm (dừng ở 2) trên 60 / 40 / 25 seed cho `s` / `m` / `l`: luôn đúng một nghiệm và trùng lời giải.

Thời gian sinh một đề (đo 300 seed trong Node 22 trên máy bàn; và 100 seed trong Chromium giả lập CPU chậm 4 lần):

| Cỡ | Node: trung vị / p90 / p99 / chậm nhất | Chromium CPU ÷4: trung vị / p90 / p98 / chậm nhất |
| --- | --- | --- |
| `s` | 0,4 / 1,3 / 3,3 / 4,4 ms | 2 / 8 / 12 / 16 ms |
| `m` | 1,1 / 4,0 / 7,6 / 8,5 ms | 7 / 25 / 60 / 87 ms |
| `l` | 5,2 / 17 / 32 / 41 ms | 26 / 90 / 144 / 183 ms |

## Báo ván cho cổng

- Mỗi cỡ một mode (`s`, `m`, `l`), metric `time_low`, đồng hồ chạy từ lúc chia đề và dừng khi trang ẩn hoặc đang mở hộp thoại.
- Chia đề mới: `kit.sdk.start(mode)`; mở lại ván lưu dở: `kit.sdk.start(mode, true)`.
- Giải xong: `kit.sdk.end({ mode, won: true, timeMs, assisted })` (`assisted` = đã dùng gợi ý).
- Bỏ đề đã đi ít nhất một nước (đề mới / đổi cỡ): gửi `won: false`; đề chưa đi nước nào thì không gửi gì.
- Chống gian lận: `min_time_ms` = số ô trắng ít nhất của cỡ × 2 thao tác (chọn ô + chạm số) × ~150 ms, làm tròn xuống: `s` 4000, `m` 8000, `l` 13000.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-kakuro-settings-v1` | Cài đặt: giao diện, cỡ đề (`size`), báo lỗi (`errors`: `auto` / `on` / `off`), bảng tổ hợp (`combos`) |
| `playnine-kakuro-stats-v1` | Thống kê: số ván, số ván giải, số ván giải không gợi ý, kỷ lục từng cỡ (chỉ ván không gợi ý) |
| `playnine-kakuro-save-v1` | Ván đang chơi dở: đề, số đã điền, ghi chú, hoàn tác / làm lại, số gợi ý, đồng hồ |
| `playnine-kakuro-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng hoặc sai luật (`fromJSON` trả `null`) thì bỏ và chia đề mới.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `↓` `→` | Chọn ô (nhảy qua ô đen) |
| `1`–`9` | Điền số |
| `Shift` + `1`–`9` | Bật / tắt ghi chú |
| `Space` | Bật / tắt chế độ ghi chú |
| `Backspace` / `Delete` / `0` | Xóa ô |
| `Z` / `Ctrl+Z` | Hoàn tác |
| `Y` / `Ctrl+Y` / `Ctrl+Shift+Z` | Làm lại |
| `H` | Gợi ý |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra

```bash
node test.js          # engine: tổ hợp, khung, bộ giải, sinh đề duy nhất, luật chơi, lưu / khôi phục
```

`e2e.spec.ts` (chạy cùng e2e chung của repo): ván lưu dựng sẵn còn một ô, điền ô đó thì cổng nhận `pn:end` thắng; bỏ đề đã đi nước thì `won: false`; đổi cỡ trước nước đầu thì không gửi `pn:end`.
