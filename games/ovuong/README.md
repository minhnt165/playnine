# Ô Vuông

Game Ô Vuông (Dots and Boxes) của PlayNine: kẻ cạnh nối các điểm, khép ô để ghi điểm. Đấu máy ba mức hoặc hai người trên cùng máy. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Bàn là lưới điểm n×n ô ((n+1)×(n+1) điểm). Hai bên lần lượt kẻ một cạnh nối hai điểm kề nhau còn trống.
- Kẻ **cạnh thứ tư** của một ô thì ô đó thuộc về mình và **được đi tiếp**. Một cạnh có thể khép hai ô cùng lúc (được 2 điểm).
- Kẻ hết cạnh thì bên nhiều ô hơn thắng; bằng nhau là hòa (chỉ có ở bàn 4×4).

## Cỡ bàn

| Cỡ | Ô / cạnh | Ghi chú |
| --- | --- | --- |
| 3×3 | 9 ô, 24 cạnh | Ván nhanh (~1 phút), không hòa |
| 4×4 (mặc định) | 16 ô, 40 cạnh | Vừa đủ chuỗi dài để có chiến thuật, có thể hòa 8–8 |
| 5×5 | 25 ô, 60 cạnh | Chuỗi dài, tàn cuộc sâu; trên điện thoại 390 px mỗi ô vẫn ~60 px nên dễ chạm |

Không làm 6×6 trở lên: trên màn 390 px ô nhỏ dưới 50 px và ván kéo dài; ba cỡ trên đã đủ từ ván nhanh tới ván chiến thuật. Cỡ bàn không tách mode trên cổng (mode là mức máy).

## Điều khiển

- Chạm / bấm vào khe giữa hai điểm để kẻ cạnh. Vùng chạm của mỗi cạnh là hình thoi nối hai đầu cạnh với tâm hai ô hai bên; các hình thoi lát kín bàn nên chạm chỗ nào cũng trúng cạnh gần nhất.
- Rê chuột (máy tính) hiện trước nét mờ màu của bên đang đi. Cạnh vừa kẻ có quầng nhạt; ô đã khép tô màu chủ ô kèm dấu tròn (bên đi trước, xanh tím) hoặc dấu thoi (bên đi sau, cam), phân biệt được cả khi không nhìn màu. Khi chọn máy đi trước, máy cầm màu xanh tím.
- Dòng trạng thái báo lượt, "Khép ô! Kẻ thêm một cạnh", và số cạnh còn lại.
- Máy nghĩ trong Web Worker (không chặn giao diện): nước đầu mỗi lượt chờ tối thiểu 0,55 s, các nước tiếp theo sau khi máy khép ô 0,32 s để kịp nhìn theo (giảm chuyển động: 0,3 s / 0,15 s).

## Đối thủ (mode) và cài đặt

Chọn trong Cài đặt: đối thủ (Dễ / Vừa / Khó / 2 người), cỡ bàn, ai đi trước (khi đấu máy). Ván chưa kẻ cạnh nào (hoặc đã xong) thì đổi là chia ván mới ngay; ván đang dở thì áp dụng từ ván sau.

| Mode | Máy |
| --- | --- |
| `easy` (Dễ) | Khép được ô thì khép, còn lại kẻ bừa |
| `medium` (Vừa) | Khép ô khi được (luôn ăn hết chuỗi được nhường); còn cạnh an toàn thì không kẻ cạnh thứ ba cho ô nào; hết cạnh an toàn thì nhường phần ít ô nhất (chuỗi 2 thì nhường ở giữa) |
| `hard` (Khó) | Như dưới đây |

Máy Khó dùng mô hình "dây và xu" (ô chưa khép là xu, cạnh trống là dây):

- Ăn ngay ô "miễn phí" (khép được mà không làm ô kế bên thành 3 cạnh).
- Bị nhường chuỗi / vòng: chỉ xét ăn tiếp hoặc **double-deal** (chừa 2 ô cuối của chuỗi, 4 ô cuối của vòng) để giữ quyền kiểm soát.
- Thế chỉ còn chuỗi / vòng rời nhau: tính thẳng bằng công thức đệ quy của tàn cuộc chuỗi đơn (đếm chuỗi): mở chuỗi k thì đối thủ chọn max(k + g(R), k − 4 − g(R)), vòng k: max(k + g(R), k − 8 − g(R)).
- Còn lại: negamax alpha-beta + bảng chuyển vị trên tập cạnh đã kẻ, chuỗi đơn chỉ xét mở ở một đầu (chuỗi 2 thêm cạnh giữa), vòng chỉ một cạnh. Bộ giải chạy khi hết cạnh an toàn hoặc còn ≤ 10 cạnh an toàn, giới hạn 120 000 nút; quá giới hạn thì kẻ cạnh an toàn theo luật chuỗi dài (ước lượng thô).
- Nước bằng điểm nhau được xáo theo seed nên máy không đi lặp lại; mọi mức tất định theo seed (test được).

**2 người**: hai người thay phiên trên cùng máy (Người 1 xanh tím đi trước, Người 2 cam). Không gửi gì cho cổng (không gọi `sdk.start` / `sdk.end`), không tính vào thống kê thắng / thua (chỉ đếm số ván).

### Mức mạnh dần (đo bằng `node test.js`)

Mỗi cặp đấu nhiều ván, đổi bên đi trước mỗi ván:

| Bàn | Khó vs Dễ | Khó vs Vừa | Vừa vs Dễ |
| --- | --- | --- | --- |
| 3×3 (100 ván) | 96% thắng | 90% thắng | 93% thắng |
| 4×4 (100 ván) | 99% thắng, 1 hòa | 89% thắng, 8 hòa | 98% thắng, 2 hòa |
| 5×5 (60 ván) | 100% thắng | 97% thắng | 100% thắng |

Nước lâu nhất của Khó trong Node: ~170 ms (bàn 5×5); trên điện thoại chậm hơn vài lần nhưng chạy trong Worker nên giao diện không đơ.

## Báo ván cho cổng

- Metric `wins` (số ván thắng), điểm game 15; mode `easy` 10 điểm, `medium` 15, `hard` 25; mỗi mode luật `min_duration_ms: 4000`.
- Chia ván mới: `kit.sdk.start(level)`; mở lại ván lưu dở: `kit.sdk.start(level, true)`.
- Thắng: `kit.sdk.end({ mode, won: true, timeMs, assisted: false })`; thua hoặc **hòa: `won: false`** (hòa không phải thắng nên không cộng điểm thắng; thống kê vẫn ghi riêng số ván hòa).
- Bỏ ván (nút Ván mới) khi người chơi đã kẻ ít nhất một cạnh: hỏi xác nhận rồi gửi `won: false`; chưa kẻ cạnh nào thì không gửi gì (kể cả khi máy đã đi trước).
- Không có hoàn tác nên luôn `assisted: false`.
- Ngưỡng 4 s: bàn nhỏ nhất 3×3 có 24 cạnh; mô phỏng 1 200 ván người chơi giỏi (máy Khó cầm thay) thắng máy ở cả ba mức, ván thắng "nhanh nhất" vẫn có 8 lượt máy + 1 nước máy đi tiếp + 15 nước người chơi. Tính theo thời gian chờ ngắn nhất của máy (0,3 s mỗi lượt, 0,15 s mỗi nước đi tiếp khi giảm chuyển động) và ~0,15 s mỗi cú chạm của người, ván thắng thật không dưới ~4,8 s; đặt 4 s để có biên an toàn mà vẫn chặn kết quả giả gửi ngay sau khi bắt đầu.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-ovuong-settings-v1` | Cài đặt (giao diện, `level`: easy / medium / hard / pvp, `size`: "3" / "4" / "5", `first`: you / cpu) |
| `playnine-ovuong-stats-v1` | Thống kê: số ván, thắng, hòa, thua (đấu máy); số ván thắng / đã chơi theo từng mức; số ván hai người (`pvp`) |
| `playnine-ovuong-save-v1` | Ván đang chơi dở (`{ v, game, level, human, humanMoves, elapsed }`; `game` là `{ v, n, lines, boxes, turn, last }` với `lines` / `boxes` là chuỗi chữ số 0 / 1 / 2; `human` = 0 khi hai người; chỉ lưu khi đã kẻ ít nhất một cạnh) |
| `playnine-ovuong-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `→` | Di con trỏ trong cùng hàng cạnh |
| `↑` `↓` | Sang hàng kế (xen kẽ hàng cạnh ngang / dọc) |
| `Enter` / `Space` | Kẻ cạnh tại con trỏ |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra

```bash
node test.js          # đầy đủ (~25 s, gồm mô phỏng mức mạnh dần)
node test.js --quick  # bỏ phần mô phỏng dài
```

`test.js` phủ hình học lưới (đánh số cạnh / ô, cạnh viền / trong), luật (kẻ cạnh, khép ô đi tiếp, một cạnh khép hai ô, kết thúc thắng / thua / hòa 8–8, nước không hợp lệ, ván ngẫu nhiên luôn kết thúc), cạnh an toàn, máy trả nước hợp lệ ở mọi mức / cỡ, Dễ ăn ô, Vừa không tạo cạnh thứ ba và nhường chuỗi ngắn nhất, Khó double-cross và ăn hết chuỗi cuối, **bộ giải khớp tìm kiếm vét cạn không rút gọn** trên hơn 150 thế ngẫu nhiên (bàn 2×2, 3×3) và các thế tàn cuộc chỉ còn chuỗi / vòng, máy tất định theo seed, thời gian nghĩ, mức mạnh dần, lưu / khôi phục và từ chối dữ liệu hỏng. Bàn luôn trống lúc đầu nên không có phần "màn giải được".

Test riêng trong cổng: `e2e.spec.ts` (thắng, thua, hòa 8–8, bỏ ván, ván hai người không báo cổng) chạy cùng `npm run e2e` sau khi build và ghép.
