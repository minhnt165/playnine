# Cờ Lục Giác

Game Cờ Lục Giác (Hex) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Bàn hình thoi n × n ô lục giác, chọn cỡ **7×7**, **9×9** (mặc định) hoặc **11×11**. Hai cạnh đối diện tô đỏ, hai cạnh còn lại tô xanh.
- **Đỏ** đi trước, phải nối hai cạnh đỏ; **Xanh** nối hai cạnh xanh. Mỗi lượt đặt một quân vào một ô trống bất kỳ; quân không di chuyển, không bị ăn.
- Ai nối được hai cạnh của mình bằng một chuỗi ô liền nhau trước là **thắng**. Hex **không có hòa**: bàn đầy thì luôn đúng một bên đã nối được.
- **Luật đổi bên** (swap / pie rule, bật mặc định, tắt được trong Cài đặt): sau quân đầu tiên của Đỏ, Xanh có thể "lấy" quân đó thay cho nước đi. Quân Đỏ ở (hàng r, cột c) thành quân Xanh ở (hàng c, cột r), tức đối xứng qua đường chéo dài, rồi tới lượt Đỏ. Mỗi bên giữ nguyên màu và cạnh của mình.
  - Lý do bật mặc định: người đi trước trong Hex có lợi thế rất lớn (đặt giữa bàn gần như chắc thắng với người chơi giỏi). Đổi bên buộc Đỏ mở đầu bằng nước "vừa phải", ván cân bằng hơn và chống việc cầm Đỏ đặt giữa bàn để thắng máy dễ dàng.
  - Vẫn cho tắt vì người mới chơi thường chưa quen luật này; tắt thì máy cầm Đỏ chiếm tâm.
- Không có đi lại.

## Điều khiển

- **Chuột / cảm ứng:** chạm một ô trống để đặt quân. Khi được đổi bên, thanh của bạn có nút **Đổi bên** (lần đầu có lời nhắc).
- **Bàn phím:** mũi tên di chuyển con trỏ tới ô kề theo đúng hướng trên màn hình (bàn có thể xoay; khi hai ô cách đều thì đi xen kẽ để giữ hướng thẳng), `Enter` / `Space` đặt quân, `S` đổi bên, `Esc` ẩn con trỏ, `N` ván mới.
- Nước vừa đi có chấm trắng trên quân. Hết ván, chuỗi thắng viền vàng, các quân khác mờ đi. Lúc máy nghĩ, thanh của máy hiện "Đang nghĩ…" và bàn không nhận nước.
- Bàn vẽ bằng SVG và tự **xoay** cho ô to nhất: màn hình đứng thì đường chéo dài nằm dọc, màn hình rộng / ngang thì nằm ngang. Ở 390×844 ô rộng khoảng 44 px (7×7), 35 px (9×9), 30 px (11×11).
- Bật giảm chuyển động (`prefers-reduced-motion`) thì quân hiện ngay, không có hiệu ứng thả quân, nút Đổi bên không nhấp nháy, dấu "đang nghĩ" đứng yên.
- Lần đầu mở game tự hiện hộp **Cách chơi** (lưu `guideSeen` trong cài đặt).

## Máy, chế độ và mode

Chọn trong **Cài đặt**: đối thủ (Máy / 2 người), mức máy, phe (Đỏ đi trước / Xanh đi sau), cỡ bàn, luật đổi bên. Chưa đi nước nào (hoặc ván đã xong) thì đổi cài đặt là chơi ván mới ngay (gửi lại `start` với mode mới, không gửi `end`); đang dở thì áp dụng từ ván sau.

| Mode | Máy |
| --- | --- |
| `easy` (Dễ) | Thắng ngay khi được (85%), chặn đòn thắng của bạn một nửa số lần; còn lại chọn ngẫu nhiên có trọng số: thích ô gần tâm, gần quân mình và quân bạn. Chỉ đổi bên khi quân đầu nằm sát tâm. |
| `medium` (Vừa) | Thắng ngay / chặn đòn thắng duy nhất; còn lại thử mọi ô trống và chấm bằng **hai-khoảng cách** (two-distance, như Queenbee): tiềm năng = min trên ô trống của tổng hai-khoảng cách tới hai cạnh, điểm = 100 × (tiềm năng đối thủ − tiềm năng mình) + chênh số ô đạt tiềm năng, cộng nhiễu nhỏ. Đổi bên mọi quân đầu không nằm trên cạnh. |
| `hard` (Khó) | Thắng ngay / chặn như Vừa; còn lại **MCTS + RAVE**: mô phỏng lấp đầy bàn ngẫu nhiên có **giữ cầu** (đối thủ chen vào cầu thì đặt ô còn lại), kết quả xét trên bàn đầy, AMAF lấy theo màu ô trên bàn đầy. Nghĩ 1,2 s (7×7), 1,8 s (9×9), 2,6 s (11×11), tối đa 200.000 vòng, tối đa 9.000 nút cây. |

Khi máy cầm Đỏ đi trước: có đổi bên thì máy Vừa / Khó mở đầu trên cạnh của Xanh (cột đầu hoặc cuối, không ở góc) để bạn đổi bên không lợi nhiều; không có đổi bên thì chiếm tâm. Máy Dễ mở đầu ngẫu nhiên.

Máy nghĩ trong Web Worker dựng từ mã nguồn engine (`GameEngine.factory`), không làm đơ giao diện; không tạo được worker thì `planMove` trả đối tượng tìm kiếm và app chạy MCTS từng khúc 25 ms bằng `setTimeout` (rút còn tối đa 1,2 s). Máy "nghĩ" ít nhất 500 ms. Máy đi sai luật (không xảy ra) thì app thay bằng một nước hợp lệ.

**Mức mạnh dần** (đo trong `test.js` và bằng script tạm, đổi màu xen kẽ, có đổi bên, Khó tính theo số vòng để tất định):

| Cặp | Bàn | Kết quả (mức cao thắng) |
| --- | --- | --- |
| Vừa – Dễ | 7×7 / 9×9 | 20/20 / 20/20 |
| Khó (3.000 vòng) – Dễ | 7×7 | 20/20 |
| Khó (20.000 vòng) – Vừa | 7×7 | 11/12 |
| Khó (30.000 / 100.000 vòng) – Vừa | 9×9 | 14/16 / 15/16 |
| Khó (60.000 vòng) – Vừa | 11×11 | 6/8 |

Trong trình duyệt Khó chạy khoảng 100.000–200.000 vòng mỗi nước (tùy máy và cỡ bàn) nên mạnh hơn số liệu trên. Vừa nghĩ dưới 15 ms mỗi nước (đo trong Node, 11×11).

**2 người cùng máy:** hai người lần lượt đặt quân trên cùng thiết bị (thanh trên là Xanh, thanh dưới là Đỏ), có đổi bên nếu bật. Chế độ này không gửi gì cho cổng (không `start` / `end`) và có thống kê riêng.

## Ghi điểm trên cổng

Metric `wins` (số ván thắng), 15 điểm mặc định; mode theo mức máy (cỡ bàn chọn tự do, không đổi mode): `easy` 10 điểm, `medium` 15 điểm, `hard` 25 điểm (bảng 4.8 của lộ trình), mỗi mode luật `min_duration_ms` 4000.

- Ngưỡng 4000 ms: bàn nhỏ nhất 7×7 cần ít nhất 7 quân của bạn để thắng, giữa chúng máy đi ít nhất 6 lần, mỗi lần nghĩ ≥ 500 ms (≥ 3 s), cộng 7 lần chạm (≥ 0,2 s mỗi lần) là khoảng 4,4 s trở lên. Cầm Xanh hay có đổi bên thì máy đi nhiều lần hơn nên còn lâu hơn.
- Ván mới: `kit.sdk.start(level)`; mở lại ván lưu dở: `kit.sdk.start(level, true)`.
- Hết ván: `kit.sdk.end({ mode: level, won, assisted: false })`; thắng `won: true`, thua `won: false` (Hex không có hòa).
- Bỏ ván đã đi ít nhất một nước (bấm Ván mới rồi xác nhận): gửi `won: false`. Chưa đi nước nào thì không gửi gì.
- Không có đi lại hay gợi ý nên `assisted` luôn `false`. Chế độ 2 người không gửi gì.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-colucgiac-settings-v1` | Cài đặt: giao diện, `opp` (`ai` / `pvp`), `level` (`easy` / `medium` / `hard`), `side` (`red` / `blue`), `size` (`'7'` / `'9'` / `'11'`), `swap` (true / false), `guideSeen` |
| `playnine-colucgiac-stats-v1` | Thống kê: `levels.<mức>.{played, won, lost}`, `streak`, `best`, `pvp.{played, red, blue}` |
| `playnine-colucgiac-save-v1` | Ván đang chơi dở `{ v: 1, opp, level, human (1 Đỏ / 2 Xanh), humanMoves, seed (hạt giống của máy), game }`; `game` là `toJSON` của engine: `{ v: 1, n, swap, moves }`, `moves` là chỉ số ô (`r * n + c`) hoặc `-1` cho nước đổi bên. Khi mở lại, engine đi lại từng nước nên ván lưu sai luật bị bỏ |
| `playnine-colucgiac-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `→` `↓` | Di chuyển con trỏ trên bàn |
| `Enter` / `Space` | Đặt quân ở ô dưới con trỏ |
| `S` | Đổi bên (khi được) |
| `Esc` | Ẩn con trỏ; đóng hộp thoại |
| `N` | Ván mới |

## Kiểm tra

```bash
node test.js
```

Test engine phủ: hình học bàn (số láng giềng ở góc nhọn / góc tù / giữa, quan hệ kề đối xứng, thứ tự vòng), union-find, phát hiện thắng (Đỏ trên–dưới, Xanh trái–phải, đường ngoằn ngoèo, đường chéo không liền, thiếu một ô), bàn đầy ngẫu nhiên luôn đúng một bên thắng ở mọi cỡ, nước hợp lệ / sai luật, hết ván không đi tiếp, đường thắng, luật đổi bên (đối xứng, lượt, chỉ ở nước hai, tắt luật), lưu / khôi phục và từ chối dữ liệu hỏng, hai-khoảng cách, máy mọi mức luôn đi đúng luật, thắng ngay, chặn đòn thắng, quyết định đổi bên, nước mở đầu, tất định theo seed, MCTS chạy từng khúc và dừng theo hạn giờ, và ba test **mức mạnh dần** (bảng trên). Chạy khoảng 15 giây. Test Playwright trong cổng nằm ở `e2e.spec.ts` (chạy cùng `npm run e2e` sau khi build và ghép).
