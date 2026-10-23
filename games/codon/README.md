# Cờ Đơn

Game Cờ Đơn (Peg Solitaire) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Mọi lỗ trên bàn đều có quân, trừ một lỗ trống lúc đầu.
- Một nước: cho một quân nhảy qua một quân nằm sát bên vào lỗ trống ngay phía sau; quân bị nhảy qua bị nhấc khỏi bàn.
- Còn đúng **một quân** là thắng. Ở bàn Kiểu Anh, quân cuối nằm ở **tâm** là ván hoàn hảo (ghi riêng trong thống kê).
- Hết nước nhảy mà còn nhiều quân là kẹt: hiện số quân còn lại, người chơi chọn **Đi lại** để thử tiếp hoặc **Ván mới** (tính thua).
- **Đi lại** (không giới hạn) và **Từ đầu** (về thế ban đầu) vẫn là cùng ván, không tính là trợ giúp.
- **Gợi ý** chỉ ra một nước vẫn dẫn tới một quân (quân và lỗ đích viền vàng). Đã xem gợi ý thì ván tính là có trợ giúp (`assisted: true`). Nếu từ thế hiện tại không còn đường về một quân, gợi ý báo vậy (cũng tính là trợ giúp); nếu bộ giải chưa kết luận kịp trong 2 giây thì báo "chưa tìm ra", không tính trợ giúp, bấm lại sẽ tìm tiếp.

## Bàn chơi (mode)

| Mode | Bàn | Lỗ trống lúc đầu | Hướng nhảy | Điểm trên cổng |
| --- | --- | --- | --- | --- |
| `english` (mặc định) | Chữ thập 33 lỗ | Tâm | Lên, xuống, trái, phải | 6 |
| `european` | Bát giác 37 lỗ | Lỗ trái của hàng trên cùng (hàng 1, cột 3) | Lên, xuống, trái, phải | 8 |
| `triangle` | Tam giác 15 lỗ, 5 hàng | Đỉnh | Ngang và hai đường chéo của hàng (6 hướng) | 4 |

- Bàn Kiểu Pháp bỏ trống ở tâm thì không bao giờ về được một quân (bất biến chẵn lẻ theo lớp đường chéo), nên lỗ trống lúc đầu là lỗ góc của cạnh trên; `test.js` chứng minh bằng bộ giải rằng thế đầu của cả ba bàn đều giải được.
- Đổi bàn ở ô **Bàn chơi** trên HUD hoặc trong Cài đặt. Đổi khi đang chơi dở sẽ hỏi trước và tính thua.

## Bộ giải và gợi ý

- `engine.js` có `createSolver(board)`: DFS, nhớ các thế "chết" theo dạng chuẩn hóa đối xứng (8 phép cho bàn vuông, 6 cho tam giác), thử nước theo thứ tự cố định ưu tiên dọn quân xa tâm. Thế đầu giải trong khoảng 1–100 ms.
- Gợi ý chạy trong Web Worker (`worker.js`), không chặn giao diện; mỗi lần tìm tối đa 2 giây, thế chết đã chứng minh được nhớ suốt phiên nên bấm lại sẽ đi tiếp. Worker giải trước thế đầu khi chia bàn, và nhớ mọi thế trên lời giải đã tìm, nên đi theo gợi ý thì gợi ý sau trả lời ngay.
- Không tạo được worker (mở bằng `file://`) thì bộ giải chạy ngay trên trang với hạn 0,7 giây.

## Ghi điểm trên cổng

- Metric `wins`: mỗi ván là một lần chơi một bàn. Ván mới: `kit.sdk.start(mode)`; mở lại ván lưu dở: `kit.sdk.start(mode, true)`.
- Còn một quân: `kit.sdk.end({ mode, won: true, timeMs, assisted })` (`timeMs` tính từ nước đầu, dừng khi kẹt).
- Kẹt rồi chọn Ván mới, hoặc bỏ ván đã đi ít nhất một nước (Ván mới / đổi bàn, có hỏi xác nhận; kể cả khi đã đi lại về thế đầu): `won: false`. Ván chưa đi nước nào thì không gửi gì.
- Luật chống gian lận của cả ba mode: `min_duration_ms` 8000. Lời giải ngắn nhất cần 13 nước (tam giác), 31 (Kiểu Anh), 35 (Kiểu Pháp); mỗi nước là hai lần chạm (hoặc một lần kéo) cộng hiệu ứng nhảy ~0,3 giây, nên người thật thuộc lòng lời giải tam giác cũng cần khoảng 8 giây trở lên; hai bàn lớn cần lâu hơn nhiều.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-codon-settings-v1` | Cài đặt (giao diện, bàn `board`) |
| `playnine-codon-stats-v1` | Thống kê: đã chơi, đã giải, hoàn hảo, chuỗi thắng, ít quân nhất còn lại theo từng bàn |
| `playnine-codon-save-v1` | Ván đang chơi dở (đã đi ít nhất một nước, chưa thắng; kể cả đang kẹt): `{ v, game: { v, board, history, made, assisted }, elapsed }` |
| `playnine-codon-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Ván lưu chỉ giữ lịch sử nước đi; khi mở lại game đi lại từ thế đầu, nước nào không hợp lệ thì bỏ ván lưu và chia bàn mới. Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Điều khiển và phím tắt

Chạm một quân (lỗ đích hợp lệ nhấp nháy tím) rồi chạm lỗ đích, hoặc kéo quân thả vào lỗ đích. Quân vừa nhảy mà còn nhảy tiếp được thì vẫn được chọn sẵn.

| Phím | Chức năng |
| --- | --- |
| `↑` `↓` `←` `→` | Di chuyển con trỏ trên bàn |
| `Enter` / `Space` | Chọn quân / nhảy vào lỗ đang trỏ |
| `Z` / `U` / `Ctrl+Z` | Đi lại một nước |
| `H` | Gợi ý |
| `R` | Về thế ban đầu |
| `N` | Ván mới |
| `Esc` | Bỏ chọn / đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test engine phủ hình bàn và phép đối xứng, luật nhảy (cả 6 hướng của tam giác), đi lại / từ đầu, thắng / kẹt / hoàn hảo, bộ giải (chứng minh thế đầu của cả ba bàn giải được, Kiểu Anh giải được về tâm, Kiểu Pháp trống ở tâm là thế chết, hạn mức, gợi ý luôn dẫn tới thắng) và lưu / khôi phục / từ chối ván hỏng. Test trong cổng: `e2e.spec.ts` (ván thắng hoàn hảo, gợi ý làm ván thành assisted, kẹt rồi bỏ, bỏ ván đã đi).
