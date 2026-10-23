# Đô-mi-nô

Game Đô-mi-nô (Dominoes, kiểu domino bốc) của PlayNine: người đấu máy với bộ đôi-sáu 28 quân, chơi tới 50 / 100 / 150 điểm. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo trận qua SDK.

## Luật chơi

- Bộ đôi-sáu: 28 quân, mỗi quân hai nửa 0–6 chấm (7 quân đôi). Mỗi bên bốc 7 quân, 14 quân còn lại là **nọc**.
- **Mở ván**: ai giữ quân đôi lớn nhất thì đánh chính quân đó trước; không ai có quân đôi thì quân nhiều chấm nhất (bằng chấm thì quân có đầu lớn hơn, ví dụ [3|6] trước [4|5]). Luật này áp dụng cho mọi ván trong trận. Sau đó hai bên lần lượt đánh.
- **Đánh quân**: quân phải có một nửa khớp với một trong hai đầu dây; hai nửa cùng chấm chạm nhau. Quân đôi đặt vắt ngang (chỉ là cách vẽ, dây vẫn chỉ có hai đầu).
- **Bốc / bỏ lượt**: không quân nào khớp thì phải bốc nọc từng quân tới khi có quân khớp (rồi đánh); có quân khớp thì không được bốc. Nọc hết mà vẫn không đánh được thì bỏ lượt.
- **Hết quân**: ai đánh hết quân trước thắng ván, được cộng tổng chấm còn trên tay đối thủ.
- **Tắc**: nọc hết và không ai đánh được (nhận ra ngay sau nước làm tắc, kể cả lần bốc quân cuối): bên ít chấm hơn thắng ván, được cộng phần chênh lệch; bằng nhau thì không ai được điểm.
- **Trận**: chơi nhiều ván tới khi một bên đạt mục tiêu (50 / 100 / 150, mặc định 100).

## Điều khiển

- Lượt bạn, các quân đánh được sáng viền vàng và nhô lên; quân không khớp mờ đi.
- Chạm quân đang sáng là đánh luôn nếu nó chỉ khớp một đầu (hoặc hai đầu cùng chấm, như nhau). Khớp hai đầu khác nhau thì quân được chọn và hai đầu dây hiện vòng "+": chạm vòng ở đầu muốn đặt. Chạm lại quân để bỏ chọn.
- Kéo quân từ tay thả lên bàn: quân nối vào đầu khớp gần chỗ thả nhất (vòng của đầu đó sáng lên khi kéo tới).
- Nút **Bốc** chỉ bật khi bắt buộc bốc; nút **Bỏ lượt** chỉ hiện khi nọc đã hết và không đánh được.
- Dây xếp hình rắn trong bàn: hết hàng thì rẽ xuống bằng một quân dựng dọc và chạy ngược lại; dây dài thì tự thu nhỏ để luôn vừa khung (390×844 không cuộn). Quân vừa đánh có viền cam.
- Hết ván: hộp thoại cho biết ai thắng, vì sao, số điểm, và lật quân còn lại của hai bên; bấm **Ván tiếp** (hoặc nút cùng tên ở khay) để chia ván sau.
- Máy đi theo nhịp cố định để dễ theo dõi: nghĩ 1–1,4 s trước khi đánh, bốc từng quân cách nhau 0,55 s, bốc xong đánh sau 0,65 s, bỏ lượt sau 0,9 s.

## Mức độ (mode) và mục tiêu

Chọn trong Cài đặt. Trận chưa thao tác gì (hoặc đã xong) thì đổi là chia trận mới ngay; trận đang dở thì áp dụng từ trận sau. Mục tiêu điểm không phải là mode.

| Mode | Máy |
| --- | --- |
| `easy` (Dễ) | Đánh bừa một nước hợp lệ (quân bừa, đầu bừa) |
| `hard` (Khó) | Chấm điểm từng nước: xả quân nặng sớm, xả quân đôi, giữ nhiều loại chấm, giữ đầu dây mình theo được; chặn chấm đối thủ thiếu (đã lộ khi đối thủ bốc / bỏ lượt, hoặc suy ra khi đủ 7 quân chấm đó đã nằm trên dây và trong tay máy); nọc hết thì biết chính xác tay đối thủ nên chỉ làm tắc khi thắng |

Máy chỉ dùng thông tin công khai (không nhìn quân của người). Trên 1000 trận mô phỏng tới 100 điểm, máy Khó thắng máy Dễ khoảng 91%.

## Báo trận cho cổng

- Một **trận** là một lần chơi. Metric `wins` (số trận thắng), điểm game 8; mode `easy` 6 điểm, `hard` 10 điểm; mỗi mode luật `min_duration_ms: 8000`.
- Chia trận mới: `kit.sdk.start(level)`; mở lại trận lưu dở: `kit.sdk.start(level, true)`.
- Hết trận: `kit.sdk.end({ mode: level, won, timeMs, assisted: false })`, `won` là người thắng trận.
- Bỏ trận (nút Ván mới) sau khi người chơi đã đánh / bốc / bỏ lượt ít nhất một lần: hỏi xác nhận rồi gửi `won: false`; chưa làm gì thì không gửi (kể cả khi máy đã mở ván).
- Vì sao 8 s: trận ngắn nhất là thắng ngay ván đầu khi chơi tới 50. Người phải đánh hết 7 quân nên máy có ít nhất 6 lượt (mỗi lượt ≥ 1 s); máy phải còn ≥ 50 chấm trên tay, tức ≥ 5 quân (4 quân nặng nhất chỉ có 43 chấm), nên phải bốc ≥ 4 quân (mỗi lần ≥ 0,55 s). Chỉ riêng nhịp máy đã là ≥ 6 × 1 + 4 × 0,55 = 8,2 s, chưa tính thao tác của người. Không đặt 20 s: mô phỏng 100 000 trận tới 50 cho thấy 1,5–3,7% số trận người thắng thật (thắng gọn trong một ván, người bấm 0,4–0,8 s mỗi lượt) xong dưới 20 s, trận nhanh nhất 11,1 s.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-domino-settings-v1` | Cài đặt (giao diện, `level`, `target`) |
| `playnine-domino-stats-v1` | Thống kê: số trận, thắng, thua, số ván thắng; số trận thắng / đã chơi theo từng mức |
| `playnine-domino-save-v1` | Trận đang chơi dở (`{ v, game, level, acts, elapsed }`; `game` là trạng thái engine gồm cả seed chia bài; chỉ lưu khi người chơi đã thao tác ít nhất một lần) |
| `playnine-domino-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `1`–`9` | Chọn quân thứ 1–9 trên tay |
| `↑` / `↓` | Chọn quân trước / sau |
| `←` / `→` | Chọn đầu trái / phải (khi quân khớp cả hai đầu); nếu không thì chọn quân trước / sau |
| `Enter` / `Space` | Đánh quân đang chọn; hết ván thì sang ván tiếp |
| `D` | Bốc (khi bắt buộc) |
| `P` | Bỏ lượt (khi nọc hết và không đánh được) |
| `N` | Trận mới |
| `Esc` | Bỏ chọn quân; đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

`test.js` phủ: bộ 28 quân, chia 7 / 7 / nọc 14 theo seed, luật mở ván (đôi lớn nhất, không có thì quân lớn nhất), đánh ở hai đầu và quay quân đúng chiều (kể cả quân đôi, quân khớp cả hai đầu), từ chối nước sai, bốc từng quân / bỏ lượt chỉ khi bắt buộc, tính điểm khi hết quân và khi tắc (thắng, thua, hòa; tắc ngay sau lần bốc quân cuối), hết trận và ván tiếp giữ điểm, máy dễ / khó luôn đi nước hợp lệ, máy khó đánh quân cuối, chặn chấm đã lộ, suy ra chấm cạn và thắng máy dễ đa số, 5000 trận mô phỏng đều kết thúc với điểm và quân nhất quán, bố cục dây hình rắn không chồng quân và luôn trong bề rộng, lưu / khôi phục (cả seed chia ván sau) và từ chối dữ liệu hỏng. Game không có màn đố nên không có phần "màn giải được"; mọi ván đều chơi được tới cuối (đã chứng minh bằng mô phỏng).

Test riêng trong cổng: `e2e.spec.ts` (thắng trận, thua trận, bỏ trận) chạy cùng `npm run e2e` sau khi build và ghép.
