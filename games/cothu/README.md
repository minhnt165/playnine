# Cờ Thú

Game Cờ Thú (Animal Chess, còn gọi là Jungle / Đấu Thú Kỳ) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Bàn 7 cột × 9 hàng. Hai sông, mỗi sông 3 hàng × 2 cột, ở giữa bàn. Mỗi bên có một **hang** ở giữa hàng cuối và ba **bẫy** quanh hang.
- Mỗi bên tám con, bậc từ cao xuống thấp: Voi 8, Sư Tử 7, Hổ 6, Báo 5, Sói 4, Chó 3, Mèo 2, Chuột 1. Đỏ ở dưới, đi trước.
- Mỗi lượt đi một con một ô lên, xuống, trái hoặc phải.
- Ăn quân địch **cùng bậc hoặc thấp hơn**. **Chuột ăn được Voi**, **Voi không ăn được Chuột**.
- Chỉ Chuột xuống nước. Chuột dưới nước không ăn quân trên cạn và quân trên cạn (kể cả Chuột) không ăn Chuột dưới nước; hai Chuột cùng dưới nước thì ăn nhau được.
- **Sư Tử** và **Hổ** nhảy thẳng qua sông (ngang qua 2 ô hoặc dọc qua 3 ô nước) tới ô cạn bên kia, ăn được quân ở đó theo bậc; bị chặn nếu có Chuột (bên nào cũng vậy) dưới nước trên đường nhảy.
- Quân đứng trong **bẫy của đối thủ** có bậc 0 khi bị ăn: quân nào của đối thủ cũng ăn được. Quân đó vẫn ăn quân khác theo bậc của nó. Đứng trong bẫy của mình thì giữ nguyên bậc.
- Không được vào hang của mình.
- **Thắng:** vào hang đối thủ, hoặc ăn hết quân đối thủ, hoặc đối thủ tới lượt mà không còn nước đi hợp lệ.
- **Hòa:** cùng một thế cờ (kể cả bên tới lượt) xuất hiện lần thứ ba, hoặc 200 nước liền không ai ăn quân.
- Không có đi lại.

## Điều khiển

- **Chuột / cảm ứng:** chạm một quân của mình để chọn (quân nhấc lên, ô đi được hiện chấm, ô ăn được có vòng cam), chạm ô sáng để đi. Chạm lại quân đang chọn hoặc chạm chỗ khác để bỏ chọn.
- **Bàn phím:** mũi tên di chuyển con trỏ trên bàn, `Enter` / `Space` chọn quân và đi, `Esc` bỏ chọn.
- Nước vừa đi (của bạn hoặc của máy) tô vàng ô đi và ô đến. Lúc máy nghĩ, thanh của máy hiện "Đang nghĩ…" và bàn không nhận nước.
- Phe của bạn luôn ở phía dưới (cầm Xanh thì bàn xoay 180°). Quân đã ăn được hiện nhỏ ở bên phải thanh người chơi.
- Bật giảm chuyển động (`prefers-reduced-motion`) thì quân đổi chỗ tức thì, không có hiệu ứng nhấc quân và chấm "đang nghĩ".

## Máy và mode

Chọn trong **Cài đặt**. Chưa đi nước nào thì đổi mức / phe là chơi ván mới ngay (gửi lại `start` với mode mới, không gửi `end`); đã đi rồi thì áp dụng từ ván sau.

| Mode | Máy |
| --- | --- |
| `easy` (Dễ) | Vào hang khi được; 80% có nước ăn thì ăn (ưu tiên quân to), còn lại đi ngẫu nhiên, hơi thích tiến lên. |
| `medium` (Vừa) | Alpha-beta độ sâu 3 + tìm kiếm tĩnh các nước ăn quân; chấm từng nước gốc rồi cộng nhiễu nhỏ (0–40) nên đôi khi chọn nước kém hơn chút. |
| `hard` (Khó) | Đào sâu dần tới độ sâu 5 (giới hạn 3,5 giây), sắp nước: vào hang > ăn quân to bằng quân nhỏ > nước sát thủ > bảng lịch sử; tìm kiếm tĩnh; đang hơn thì tránh lặp thế cờ. |

Hàm đánh giá: giá trị quân (Chuột 450, Mèo 250, Chó 300, Sói 400, Báo 500, Hổ 800, Sư Tử 900, Voi 1000), thưởng tiến gần hang địch theo khoảng cách, thưởng lớn khi đứng sát hang địch, trừ khi đứng trong bẫy địch, giữ nhà (quân phòng thủ quanh hang mình khi địch áp sát), Chuột dưới sông chặn đường nhảy. Máy nghĩ trong Web Worker dựng từ mã nguồn engine (`GameEngine.factory`), không làm đơ giao diện; không tạo được worker thì tính bằng `setTimeout`. Máy đi sai luật (không xảy ra) thì app thay bằng một nước hợp lệ.

## Ghi điểm trên cổng

Metric `wins` (số ván thắng), 15 điểm mặc định; mode theo mức máy: `easy` 10 điểm, `medium` 15 điểm, `hard` 25 điểm, mỗi mode luật `min_duration_ms` 3000 (bảng 4.8 của lộ trình: đối kháng với máy).

- Ván mới: `kit.sdk.start(level)`; mở lại ván lưu dở: `kit.sdk.start(level, true)`.
- Hết ván: `kit.sdk.end({ mode: level, won, assisted: false })`; `won` là `true` chỉ khi bạn thắng, thua hoặc hòa gửi `won: false`.
- Bỏ ván đã đi ít nhất một nước (bấm Ván mới rồi xác nhận): gửi `won: false`. Chưa đi nước nào thì không gửi gì.
- Không có đi lại hay gợi ý nên `assisted` luôn `false`.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-cothu-settings-v1` | Cài đặt: giao diện, `level` (`easy` / `medium` / `hard`), `side` (`red` / `blue`) |
| `playnine-cothu-stats-v1` | Thống kê: `levels.<mức>.{played, won, lost, drawn}`, `streak`, `best` |
| `playnine-cothu-save-v1` | Ván đang chơi dở `{ v: 1, level, human, humanMoves, game }`; `game` là `toJSON` của engine: `board` (63 ký tự, `RCDWPTLE` chữ hoa là Đỏ, chữ thường là Xanh, `.` ô trống), `turn`, `ply`, `quiet`, `seen` (các thế cờ từ lần ăn quân gần nhất, để xét lặp lại), `last` |
| `playnine-cothu-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `→` `↓` | Di chuyển con trỏ trên bàn |
| `Enter` / `Space` | Chọn quân / đi tới ô dưới con trỏ |
| `Esc` | Bỏ chọn quân; đóng hộp thoại |
| `N` | Ván mới |

## Kiểm tra

```bash
node test.js
```

Test engine phủ: bàn và bày quân, perft thế đầu (24 nước, 576 ở độ sâu 2) và thế tự bày đã đếm tay, đi một ô, sông chỉ Chuột xuống, Sư Tử / Hổ nhảy ngang / dọc và bị Chuột (cả phe mình) chặn, ăn theo bậc, Chuột ăn Voi / Voi không ăn Chuột, ranh giới nước / cạn, bẫy hạ bậc về 0 (bẫy của mình thì không), không vào hang mình, thắng bằng hang / ăn hết / hết nước, hòa lặp lại và 200 nước, từ chối nước sai luật, lưu / khôi phục và từ chối dữ liệu hỏng, máy mọi mức luôn đi đúng luật, vào hang khi được, chặn đòn vào hang, ăn quân không được bảo vệ, 40 ván ngẫu nhiên đều kết thúc. Test Playwright trong cổng nằm ở `e2e.spec.ts` (chạy cùng `npm run e2e` sau khi build và ghép).
