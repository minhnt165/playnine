# Kim Tự Tháp

Game Kim Tự Tháp (Pyramid Solitaire) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (kit chung và bộ bài `cards.js` / `cards.css`, xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- 28 lá xếp thành kim tự tháp 7 hàng; mỗi lá ở hàng dưới đè lên hai lá ở hàng trên. 24 lá còn lại là **chồng rút**.
- Lá **chơi được**: lá tháp không còn lá nào đè, lá trên cùng của chồng rút và lá trên cùng của **chồng bỏ**. Lá chơi được có viền vàng mảnh, lá bị đè tối đi một chút.
- Bỏ hai lá chơi được có tổng **13** (A = 1, J = 11, Q = 12). Lá K (13) bỏ một mình. Hai lá có thể cùng ở tháp, một ở tháp một ở chồng, hoặc lá trên cùng của hai chồng.
- **Rút lá**: lá trên cùng chồng rút sang chồng bỏ (lá tiếp theo của chồng rút lật lên). Hết chồng rút thì **quay vòng**: chồng bỏ lật lại thành chồng rút (giữ thứ tự rút), tối đa 2 lần, tức 3 lượt qua chồng rút.
- **Thắng** khi dọn sạch 28 lá của tháp (chồng rút / chồng bỏ còn lá cũng được).
- **Thua** khi không còn cặp nào, không còn lá để rút và hết lượt quay vòng.
- **Hoàn tác** 3 lần mỗi ván (không tính là trợ giúp; không hoàn tác sau khi ván đã kết thúc).
- **Gợi ý** chạy bộ giải từ trạng thái hiện tại và chỉ nước đầu của lời giải (sáng viền cặp lá, hoặc nháy nút Rút lá). Từ đây không còn đường thắng thì báo "thử hoàn tác" và chỉ một nước đi được. Dùng gợi ý thì ván tính là có trợ giúp (`assisted: true`).

### Ván nào cũng thắng được

Ván được chia theo seed (`PNCards.rng`): xáo bộ bài, chạy bộ giải, chỉ giữ ván đầu tiên mà bộ giải chứng minh dọn được tháp trong 3 lượt; không thì xáo tiếp (khoảng 2/3 ván xáo ngẫu nhiên giải được). Bộ giải là DFS có nhớ trạng thái (mặt nạ lá tháp còn lại, mặt nạ lá chồng còn lại, vị trí lá trên cùng chồng rút, số lần quay vòng còn lại), bỏ K ngay khi chơi được, và cắt nhánh khi một cặp bậc (r, 13 − r) không còn cách ghép cho mọi lá tháp (lá bù nằm trong vùng đè của nhau thì không bao giờ cùng chơi được). Mỗi ván tối đa 40 000 trạng thái; quá giới hạn coi như không chứng minh được và xáo ván khác. Sau 80 lần xáo vẫn không ra (thực tế không xảy ra) thì dùng một ván dự phòng đã giải được, đổi chất ngẫu nhiên.

## Điều khiển

- Chạm hai lá cộng lại bằng 13 (lá đang chọn được nhấc lên), hoặc kéo lá này thả lên lá kia. Lá K chạm một mình. Chạm lại lá đang chọn để bỏ chọn; chạm hai lá không đủ 13 thì lá cũ lắc nhẹ và chọn lá mới.
- Nút **Rút lá** (hoặc mũi tên giữa hai chồng trên màn hình dọc); hết chồng rút thì nút thành **Quay vòng** (chạm ô chồng rút trống cũng được).
- Màn hình dọc: chồng rút / chồng bỏ nằm dưới tháp, lá to hơn. Màn hình rộng hoặc thấp: hai chồng nằm ở góc trái trên, cạnh đỉnh tháp. Điện thoại xoay ngang: bàn bên trái, số liệu và nút bên phải.

## Mode và ghi điểm trên cổng

| Mode | Điểm | Luật chống gian lận |
| --- | --- | --- |
| `classic` (Cổ điển) | 6 | `min_duration_ms` 15000 |

- Metric `wins`, điểm game 6. Ván mới: `kit.sdk.start('classic')`; mở lại ván lưu dở: `kit.sdk.start('classic', true)`.
- Dọn sạch tháp: `kit.sdk.end({ mode, won: true, timeMs, assisted })`. Hết nước: `won: false`. Bỏ ván đã đi ít nhất một nước (Ván mới, có hỏi xác nhận): `won: false`; ván chưa đi nước nào thì không gửi gì.
- `timeMs` tính từ nước đầu tiên, cộng dồn khi mở lại ván lưu.
- Vì sao 15 giây: dọn 28 lá cần ít nhất 14 lần bỏ lá (mỗi lần tối đa 2 lá, mỗi cặp là 2 lần chạm hoặc một lần kéo). Ván thật còn phải rút lá: lời giải của bộ giải trên 200 ván chia sẵn dài ít nhất 30 nước / 49 lần chạm (trung vị 50 nước / 72 lần chạm). Người chơi rất nhanh khoảng 3 lần chạm mỗi giây vẫn cần trên 15 giây; ván nhanh hơn thế gần như chắc chắn là gửi giả.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-kimtuthap-settings-v1` | Cài đặt: giao diện, bài bốn màu (`fourColor`) |
| `playnine-kimtuthap-stats-v1` | Thống kê: đã chơi, thắng, chuỗi thắng, chuỗi dài nhất, thời gian nhanh nhất (ván không dùng gợi ý) |
| `playnine-kimtuthap-save-v1` | Ván đang chơi dở (chỉ khi đã đi ít nhất một nước): `{ v, game, elapsed }`, `game` gồm tháp, chồng rút, chồng bỏ, số lần quay vòng, số nước, lượt hoàn tác còn lại, lịch sử hoàn tác, cờ trợ giúp |
| `playnine-kimtuthap-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng (lá lạ hoặc trùng, ô đã gỡ mà lá đè lên nó còn, lá đã bỏ không cân theo cặp 13, số liệu ngoài khoảng) hoặc khác phiên bản thì bị bỏ và chia ván mới.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `→` `↑` `↓` | Di chuyển giữa các lá chơi được |
| `Space` / `Enter` | Chọn / ghép lá đang trỏ |
| `D` | Rút lá (hết chồng rút thì quay vòng) |
| `U` / `Ctrl+Z` | Hoàn tác |
| `H` | Gợi ý |
| `N` | Ván mới |
| `Esc` | Bỏ chọn / đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test engine phủ hình tháp và vùng đè, lá chơi được, luật ghép 13 và K, rút lá / quay vòng tối đa 2 lần, thắng / thua, hoàn tác 3 lần, gợi ý, bộ giải (ván dựng sẵn giải được và không giải được, giới hạn quay vòng, đối chiếu với tìm kiếm không cắt nhánh, lời giải đi lại đúng luật engine), ván chia theo seed luôn giải được, ván dự phòng, lưu / khôi phục và từ chối ván hỏng. Test trong cổng: `e2e.spec.ts` (ván thắng, ván hết nước, bỏ ván).
