# Nhị Phân

Game Nhị Phân (Binary Grid, thể loại Takuzu / Binairo) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

Điền 0 hoặc 1 vào mọi ô của lưới N×N (N chẵn) sao cho:

1. Không quá hai ô giống nhau liền nhau theo hàng hoặc cột (không có `000`, `111`).
2. Mỗi hàng và mỗi cột có số 0 bằng số 1 (N/2 mỗi loại).
3. Không có hai hàng giống nhau, không có hai cột giống nhau.

- Ô cho sẵn tô đặc, không đổi được; ô người chơi điền tô nhạt có viền. 0 màu cam, 1 màu xanh dương, và luôn hiện chữ số, nên người mù màu vẫn phân biệt được.
- **Báo lỗi** (Cài đặt): ô vi phạm luật có viền nét đứt + sọc chéo đỏ (ba ô liền nhau; mọi ô của giá trị bị thừa trong một đường; mọi ô của hai hàng / cột đầy trùng nhau). Mặc định *Tự động*: chỉ bật ở 6×6 (Dễ); chọn *Bật* / *Tắt* cho mọi cỡ.
- Hoàn tác / làm lại không giới hạn (lưu cả trong ván dở).
- **Gợi ý**: nếu có ô điền sai so với lời giải thì sửa ô đó trước; không thì điền một ô suy ra được từ lưới hiện tại và nói lý do (cặp, kẹp giữa, đủ số, suy luận cả đường). Ván có dùng gợi ý vẫn tính thắng nhưng gửi `assisted: true` và không ghi kỷ lục.
- Đồng hồ chạy từ lúc đề hiện ra (không chờ nước đầu, để không nhìn đề trước rồi mới bấm giờ); dừng khi tab ẩn hoặc mở hộp thoại, và lúc đó lưới bị che.
- Lần đầu mở game hiện hộp Cách chơi (lưu `helpSeen` trong cài đặt).

## Cỡ lưới (mode)

| Mode | Mức | Suy luận cần dùng | Ô trống (đo 3.000 đề) | `min_time_ms` | Điểm |
| --- | --- | --- | --- | --- | --- |
| `6` | Dễ | cơ bản | 21–30, tb 26,7 | 3.000 | 3 |
| `8` | Vừa | cơ bản | 43–52, tb 47,6 | 6.000 | 5 |
| `10` | Khó | cơ bản + cả đường | 71–85, tb 78 | 10.000 | 7 |
| `12` | Rất khó | cơ bản + cả đường | 105–121, tb 112,5 (1.000 đề) | 15.000 | 10 |

Chọn cỡ ở nút **Ván mới** (biểu tượng xoay) hoặc nút *Đổi cỡ* trong hộp thắng; cỡ đã chọn lưu trong cài đặt (`size`).

### Sinh đề

1. Lời giải ngẫu nhiên theo seed (PRNG mulberry32): dựng từng hàng từ các dãy hợp lệ của một đường (đủ N/2 số 1, không ba bit giống nhau liền nhau), giữ luật theo cột, quay lui khi bí. Quay lui có giới hạn số nút mỗi lần thử rồi làm lại với dãy ngẫu nhiên tiếp theo (cắt đuôi dài, vẫn tất định theo seed).
2. Bỏ dần ô cho sẵn theo thứ tự ngẫu nhiên; chỉ bỏ khi đề vẫn **giải được hết bằng suy luận** ở mức của cỡ đó:
   - mức 1 (cơ bản): cặp (`00_` → 1), kẹp giữa (`0_0` → 1), đủ số (đường đã đủ N/2 của một giá trị);
   - mức 2 (thêm cả đường): liệt kê mọi dãy hợp lệ khớp các ô đã điền và khác mọi đường đầy cùng chiều; ô nào mọi dãy đều cùng giá trị thì điền.
   Mọi bước suy luận đều là hệ quả bắt buộc của luật, nên đi hết lưới nghĩa là đề có **đúng một lời giải**.
3. `test.js` kiểm lại bằng solver đếm nghiệm độc lập (quay lui + lan truyền luật cơ bản, dừng ở 2) trên 40 / 30 / 15 / 8 seed cho 6 / 8 / 10 / 12.

Thời gian sinh đề đo trong Node (máy dev, 3.000 đề mỗi cỡ, 1.000 đề 12×12): 6×6 tb 0,1 ms; 8×8 tb 0,6 ms; 10×10 tb 2,8 ms (tối đa 9 ms); 12×12 tb 10,7 ms (tối đa 31 ms). Máy điện thoại chậm gấp ~5 lần vẫn dưới 300 ms, nên không cần đề sinh sẵn.

## Ghi điểm trên cổng

- Metric `time_low`, mỗi cỡ lưới một mode (`6`, `8`, `10`, `12`). Đề mới: `kit.sdk.start(mode)`; mở lại ván lưu dở: `kit.sdk.start(mode, true)`.
- Thắng: `kit.sdk.end({ mode, won: true, timeMs, assisted })`, `assisted` = đã dùng gợi ý.
- Bỏ đề đã đi ít nhất một nước (chọn đề mới khi đang dở, hộp chọn có cảnh báo): `won: false`. Đề chưa đi nước nào thì không gửi gì (đổi cỡ ngay sau khi mở không tính thua).
- `min_time_ms` = số ô trống ít nhất đo được × ~150 ms rồi làm tròn xuống: mỗi ô trống cần ít nhất một thao tác (chạm 1 lần cho 0, 2 lần cho 1; bàn phím cần thêm phím mũi tên), chưa tính thời gian nghĩ. Ví dụ 6×6: 21 ô × 150 ms ≈ 3.150 → 3.000.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-nhiphan-settings-v1` | Cài đặt: giao diện, cỡ lưới `size`, báo lỗi `errors` (`auto` / `on` / `off`), `helpSeen` |
| `playnine-nhiphan-stats-v1` | Thống kê: đã chơi, đã giải, chuỗi thắng; theo từng cỡ: đã chơi, đã giải, kỷ lục (chỉ ván không gợi ý) |
| `playnine-nhiphan-save-v1` | Ván dở (chỉ khi đã đi ít nhất một nước): `{ v, game, elapsed }`, `game` gồm đề, lời giải, lưới hiện tại, lịch sử hoàn tác / làm lại, số nước, số gợi ý |
| `playnine-nhiphan-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng, khác phiên bản, lời giải sai luật hoặc lệch đề thì bị bỏ và chia đề mới.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `↑` `↓` `←` `→` | Di chuyển ô đang chọn |
| `0` / `1` | Điền 0 / 1 |
| `Space` / `Enter` | Xoay ô: trống → 0 → 1 → trống |
| `Backspace` / `Delete` | Xóa ô |
| `Z` / `Ctrl+Z` | Hoàn tác |
| `Y` / `Ctrl+Y` / `Ctrl+Shift+Z` | Làm lại |
| `H` | Gợi ý |
| `N` | Đề mới (chọn cỡ) |
| `Esc` | Đóng hộp thoại |

Chuột / chạm: chạm ô để xoay trống → 0 → 1 → trống; chuột phải xoay ngược lại.

## Kiểm tra

```bash
node test.js
```

Test engine phủ ba luật (ba ô liền nhau, thừa số, hai hàng / cột trùng), thao tác chạm / đặt / xóa, ô cho sẵn, hoàn tác / làm lại, thắng, gợi ý (sửa ô sai, điền ô suy ra được, giải hết bằng gợi ý không cần đoán), PRNG và sinh đề tất định, solver đếm nghiệm, đề duy nhất nghiệm trên nhiều seed cho mọi cỡ, đề giải được bằng suy luận đúng mức, tốc độ sinh đề, lưu / khôi phục / từ chối ván hỏng. Test trong cổng: `e2e.spec.ts` (ván thắng, bỏ đề, đổi cỡ trước nước đầu).
