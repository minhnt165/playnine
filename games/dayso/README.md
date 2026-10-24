# Dãy Số

Game Dãy Số (Number Path) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Lưới vuông, có thể có vài **ô bị khoét** (ô sọc tối, không thuộc lưới). Gọi N là số ô còn lại.
- Điền các số từ 1 đến N, mỗi ô một số, sao cho chúng nối thành **một dãy liền**: số k + 1 luôn nằm **kề** số k theo một trong 8 hướng (ngang, dọc hoặc chéo).
- Số 1, số N và một phần các số khác đã cho sẵn (nền tím nhạt, không sửa được).
- Điền kín lưới, mọi cặp số liên tiếp đều kề nhau là thắng. Đề nào cũng có **đúng một lời giải** và giải được bằng suy luận, không phải đoán.

## Điều khiển

- **Số tiếp theo**: thanh dưới bàn hiện số cần đặt kế tiếp. Ô chứa số liền trước / liền sau nó được viền hổ phách nhấp nháy để biết dãy đang nối từ đâu.
- **Chạm ô trống**: đặt số tiếp theo vào ô đó; thanh tự chuyển sang số kế (theo chiều đang nối, hết thì nhảy tới số còn thiếu nhỏ nhất phía sau).
- **Chạm một số trên bàn**: nối tiếp dãy từ số đó (số tiếp theo thành k + 1, hoặc k − 1 nếu k + 1 đã có mà k − 1 chưa có).
- **Chọn số**: nút `‹` / `›` lùi / tiến tới số còn thiếu liền trước / liền sau; chạm vào giữa thanh để mở bảng chọn mọi số (số đã có trên bàn bị làm mờ, số cho sẵn gạch chân).
- **Vẽ đường**: kéo từ một số (hoặc từ ô trống vừa chạm) qua các ô kề để đặt tiếp k + 1, k + 2…; đi qua được số đã có đúng thứ tự (ví dụ số cho sẵn); kéo lùi lại ô trước để rút bớt. Cả lần kéo là một lần hoàn tác. Khi kéo, chỉ nhận ô khi ngón tay tới gần tâm ô, nên kéo chéo qua góc không chạm nhầm ô bên cạnh.
- **Ghi chú**: bật nút Ghi chú (hoặc `M`) rồi chạm ô trống để ghi / gỡ số tiếp theo thành số nhỏ (tối đa 4 số mỗi ô); gõ số trên bàn phím cũng ghi / gỡ. Đặt một số sẽ tự gỡ số đó khỏi mọi ghi chú.
- Đặt một số đã có ở ô khác thì số đó **dời** sang ô mới. Số cho sẵn không đặt lại được.
- **Hoàn tác / Làm lại** không giới hạn (lưu cả khi đóng trang). Hoàn tác gỡ số nào thì số tiếp theo quay về số đó.
- **Gợi ý**: đặt số tiếp theo vào đúng ô của nó (bàn đã đủ số thì sửa ô sai đầu tiên). Lần đầu trong ván sẽ hỏi lại; ván đã dùng gợi ý gửi `assisted: true` và không tính kỷ lục trong máy.
- **Báo lỗi** (Cài đặt): tô đỏ số người chơi điền mà số liền trước hoặc liền sau đã có trên bàn nhưng không kề nó. Mặc định "Chỉ mức Dễ"; có thể chọn Luôn bật / Tắt. Báo lỗi chỉ dựa trên luật, không so với lời giải.
- Đường nối màu hồng giữa hai số liên tiếp nằm kề nhau cho thấy các đoạn dãy đã thông.

## Cỡ đề (mode)

| Mode | Cỡ | Ô khoét | Ô phải điền | Số cho sẵn | Điểm |
| --- | --- | --- | --- | --- | --- |
| `s` | Dễ 6×6 | 0–3 | 18 | 15–18 (~47%) | 3 |
| `m` | Vừa 8×8 | 2–6 | 36 | 22–26 (~40%) | 5 |
| `l` | Khó 10×10 | 3–9 | 56 | 35–41 (~40%) | 8 |

Đổi cỡ ở huy hiệu cạnh tên game hoặc trong Cài đặt. Đề đang dở (đã đi ít nhất một nước) thì hỏi trước, vì bỏ đề tính là thua.

## Sinh đề

Trong `engine.js`, tất định theo seed (PRNG mulberry32):

1. Khoét ngẫu nhiên vài ô (số ô theo cỡ), bỏ nếu phần còn lại không liền một khối.
2. Tìm đường đi qua mọi ô còn lại (bước theo 8 hướng) bằng Warnsdorff (luôn đi tới ô còn ít lối ra nhất, hòa thì bốc ngẫu nhiên), rồi xáo hình dạng đường bằng 12·N bước "backbite" (nối đầu đường vào một ô kề trên đường, đảo đoạn phía sau). Đánh số 1..N theo đường.
3. Bỏ dần số cho sẵn (giữ 1 và N) theo thứ tự ngẫu nhiên; chỉ giữ việc bỏ nếu **chỉ lan truyền** (không đoán) vẫn chốt được mọi số, tới khi đủ số ô phải điền của cỡ đó. Một thứ tự không đủ thì thử thứ tự khác (tối đa 3), rồi tới đường khác.
4. Lan truyền: mỗi số k giữ tập ô còn có thể (mặt nạ bit theo hàng); quét xuôi / ngược "ô của k phải kề một ô của k − 1 và một ô của k + 1"; số chỉ còn một ô thì gạch ô đó khỏi số khác; ô chỉ còn một số vào được thì số đó phải ở đó. Lan truyền chốt hết thì lời giải là duy nhất.

`test.js` kiểm tra bằng bộ giải quay lui đếm nghiệm (dừng ở 2) trên 60 / 40 / 30 seed cho `s` / `m` / `l`: luôn đúng một nghiệm, trùng lời giải và không cần đoán lần nào.

Thời gian sinh một đề (300 seed trong Node 22 trên máy bàn; 100 seed trong Chromium giả lập CPU chậm 4 lần):

| Cỡ | Node: trung vị / p90 / p99 / chậm nhất | Chromium CPU ÷4: trung vị / p90 / p98 / chậm nhất |
| --- | --- | --- |
| `s` | 0,4 / 0,7 / 1,7 / 5,6 ms | 2 / 4 / 5 / 7 ms |
| `m` | 1,8 / 5,0 / 9,0 / 14 ms | 10 / 21 / 50 / 58 ms |
| `l` | 5,7 / 8,9 / 25 / 27 ms | 29 / 44 / 132 / 142 ms |

## Báo ván cho cổng

- Mỗi cỡ một mode (`s`, `m`, `l`), metric `time_low`, đồng hồ chạy từ lúc chia đề và dừng khi trang ẩn hoặc đang mở hộp thoại.
- Chia đề mới: `kit.sdk.start(mode)`; mở lại ván lưu dở: `kit.sdk.start(mode, true)`.
- Giải xong: `kit.sdk.end({ mode, won: true, timeMs, assisted })` (`assisted` = đã dùng gợi ý).
- Bỏ đề đã đi ít nhất một nước (đề mới / đổi cỡ): gửi `won: false`; đề chưa đi nước nào thì không gửi gì.
- Chống gian lận: `min_time_ms` = số ô phải điền × 150 ms (nhanh nhất là mỗi ô một thao tác: một chạm hoặc một bước kéo): `s` 2700, `m` 5400, `l` 8400.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-dayso-settings-v1` | Cài đặt: giao diện, cỡ đề (`size`), báo lỗi (`errors`: `auto` / `on` / `off`) |
| `playnine-dayso-stats-v1` | Thống kê: số ván, số ván giải, số ván giải không gợi ý, kỷ lục từng cỡ (chỉ ván không gợi ý) |
| `playnine-dayso-save-v1` | Ván đang chơi dở: đề, số đã điền, ghi chú, hoàn tác / làm lại, số gợi ý, đồng hồ, số tiếp theo |
| `playnine-dayso-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng hoặc sai luật (`fromJSON` trả `null`) thì bỏ và chia đề mới.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `↓` `→` | Chọn ô (nhảy qua ô khoét) |
| `0`–`9` | Gõ số vào ô đang chọn (một hoặc hai chữ số; tự chốt khi không thể thêm chữ số hoặc sau 1 giây). `0` ở ô chưa gõ = xóa ô |
| `Space` / `Enter` | Đặt số tiếp theo vào ô đang chọn (ô có số: nối dãy từ số đó); đang gõ thì chốt |
| `[` / `]` (hoặc `-` / `+`) | Đổi số tiếp theo sang số còn thiếu liền trước / liền sau |
| `Backspace` / `Delete` | Xóa ô (đang gõ thì xóa chữ số cuối) |
| `M` | Bật / tắt chế độ ghi chú |
| `Z` / `Ctrl+Z` | Hoàn tác |
| `Y` / `Ctrl+Y` / `Ctrl+Shift+Z` | Làm lại |
| `H` | Gợi ý |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại / bỏ số đang gõ |

## Kiểm tra

```bash
node test.js          # engine: lưới, đường đi, bộ giải đếm nghiệm, sinh đề duy nhất, luật chơi, lưu / khôi phục
```

`e2e.spec.ts` (chạy cùng e2e chung của repo): ván lưu dựng sẵn còn một ô, chạm ô đó thì cổng nhận `pn:end` thắng; ván còn ba ô, kéo từ số 18 qua ba ô đó cũng thắng; bỏ đề đã đi nước thì `won: false`; đổi cỡ trước nước đầu thì không gửi `pn:end`.
