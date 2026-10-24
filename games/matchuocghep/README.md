# Mạt Chược Ghép

Game Mạt Chược Ghép (Mahjong Solitaire, kiểu Shanghai) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

Bàn có các quân mạt chược xếp chồng nhiều tầng. Mỗi lượt chọn **hai quân tự do giống nhau** để gỡ khỏi bàn; gỡ hết là thắng.

- **Quân tự do**: không quân nào đè lên nó (kể cả đè một phần, như quân đỉnh lệch nửa ô của bàn Rùa) **và** còn trống cạnh trái hoặc cạnh phải (cùng tầng). Quân tự do sáng, quân bị chặn tối hơn một chút.
- **Ghép**: hai quân giống hệt nhau. Riêng **hoa** ghép với hoa bất kỳ, **mùa** ghép với mùa bất kỳ (hoa không ghép với mùa).
- **Hết nước**: còn quân mà không cặp tự do nào ghép được. Game báo và cho chọn hoàn tác, xáo lại hoặc ván mới.

Bộ quân chuẩn 144 quân: 3 chất số tròn / văn / vạn 1–9 (mỗi quân ×4), 4 gió ×4, 3 rồng ×4, 4 hoa (mai, lan, cúc, sen) và 4 mùa (xuân, hạ, thu, đông) mỗi quân một. Bàn nhỏ hơn lấy ngẫu nhiên một số cặp từ bộ này.

Mặt quân vẽ hoàn toàn bằng SVG tự làm trong `faces.js` (không dùng font hay ảnh có bản quyền): chữ số Hán của chất vạn và chữ "vạn" là nét vẽ tay giản lược; gió có la bàn + chữ cái theo ngôn ngữ (en: E S W N, vi: Đ N T B); rồng đỏ hình chữ "trung", rồng xanh viên ngọc thoi, rồng trắng khung đôi xanh dương; hoa có khung hồng đứt nét, mùa có khung ngọc đứt nét để thấy ngay là cùng nhóm. Tùy chọn **Mặt quân** trong Cài đặt: Tự động (mặc định, chuyển sang kiểu Đơn giản khi quân hẹp hơn 40 px), Cổ điển, Đơn giản (số / chữ to theo màu chất: tròn xanh dương, văn xanh lá, vạn đỏ, kèm dấu chất ở dưới).

## Điều khiển

- Chạm / bấm quân tự do để chọn (viền xanh sáng), chạm quân thứ hai giống nó để gỡ (cặp bay lên rồi biến mất). Chạm lại quân đang chọn để bỏ chọn; chạm quân tự do khác loại thì chuyển chọn sang quân đó; chạm quân bị chặn thì quân lắc nhẹ.
- **Hoàn tác** không giới hạn (cả lần xáo), lịch sử lưu cùng ván dở.
- **Gợi ý**: tô viền hổ phách một cặp gỡ được trong 3 giây, ưu tiên cặp nằm trên một đường gỡ hết (bộ giải chạy trong engine); nếu bộ giải chứng minh được các quân còn lại không thể gỡ hết thì báo nên hoàn tác.
- **Xáo lại**: chỉ bật khi hết nước. Các quân còn lại được xáo sao cho bàn mới **vẫn gỡ hết được**; nếu các vị trí còn lại không thể gỡ hết dù xáo thế nào (ví dụ hai quân chồng lên nhau) thì chỉ còn hoàn tác / ván mới.
- Đồng hồ chạy từ lúc chia bàn, dừng khi mở hộp thoại hoặc ẩn tab; lúc dừng vì hộp thoại thì bàn bị làm mờ.
- Màn hình ngang: bàn bên trái, số liệu + chọn bàn + nút bên phải. Màn hình dọc **không xoay bàn** (xoay thì luật trái / phải thành trên / dưới, dễ nhầm); thay vào đó điện thoại dọc mở lần đầu mặc định bàn Tháp, quân to gấp đôi bàn Rùa.

## Bàn (mode)

| Mode | Bàn | Quân | Tầng | Điểm trên cổng | `min_time_ms` |
| --- | --- | --- | --- | --- | --- |
| `turtle` (mặc định máy tính) | Rùa cổ điển 87 / 36 / 16 / 4 / 1 | 144 | 5 | 8 | 21000 |
| `tower` (mặc định điện thoại dọc) | Tháp 6 × 8, dáng đứng | 84 | 4 | 5 | 12000 |
| `mini` | Nhỏ 4 × 6, ván nhanh | 36 | 3 | 3 | 5000 |
| `daily` | Bàn Rùa theo seed ngày, mỗi ngày một bàn chung | 144 | 5 | 8 | 21000 |

Đổi bàn bằng thanh chọn dưới HUD. Ván đang dở (đã gỡ ít nhất một cặp) thì hỏi trước vì bỏ ván tính là thua. **Bàn ngày** mỗi ngày chơi một lần (thắng hoặc bỏ đều tính là đã chơi): chọn lại trong ngày chỉ báo "mai quay lại"; thắng thì cộng chuỗi ngày (hiện trong Thống kê và trên thẻ cổng qua `summary.daily`). Ván ngày đang dở qua nửa đêm vẫn chơi tiếp đúng bàn của ngày đó.

## Sinh bàn luôn gỡ hết được

Theo seed (PRNG mulberry32, đề ngày dùng seed = FNV-1a của `matchuocghep-daily-v1-YYYY-MM-DD`):

1. Trên bàn "trắng" (chưa có mặt quân), lặp lại: chọn ngẫu nhiên hai vị trí đang tự do rồi bỏ đi. Tìm sâu có quay lui (nhớ các tập vị trí đã biết là bế tắc) nên không bao giờ kẹt ở trạng thái chỉ còn một quân tự do.
2. Thứ tự bỏ đó chính là một lời giải. Gán lần lượt từng cặp mặt quân (cặp cùng mặt, hoa–hoa, mùa–mùa) vào từng cặp vị trí.

Xáo lại dùng cùng cách cho các vị trí còn trên bàn rồi ghép lại các mặt quân còn lại theo cặp, nên bàn sau khi xáo cũng gỡ hết được.

Bộ giải (gợi ý, test): nhiều lượt tìm sâu ngắn có khởi động lại ngẫu nhiên; đi ngay nước "an toàn" (mọi quân còn lại của một loại đều tự do), cắt nhánh "loại còn 2 quân mà quân này nằm trên quân kia", thử trước cặp giải phóng nhiều quân.

Tốc độ đo trong Node (máy bàn): sinh bàn Rùa trung bình 0,4 ms (chậm nhất 2 ms), Tháp 0,13 ms, Nhỏ 0,02 ms; điện thoại chậm (chậm hơn ~10 lần) vẫn dưới 30 ms, xa mục tiêu 300 ms. Bộ giải trên bàn Rùa mới chia: trung bình ~5 ms, chậm nhất ~100 ms, tìm ra lời giải ở 297 / 300 seed (còn lại hết ngân sách thì gợi ý lấy cặp theo trọng số vị trí).

## Ghi điểm trên cổng

- Metric `time_low`, mỗi bàn một mode, cộng mode `daily`. Ván mới: `kit.sdk.start(mode)`; mở lại ván lưu dở: `kit.sdk.start(mode, true)`.
- Thắng: `kit.sdk.end({ mode, won: true, timeMs, assisted })`.
- Bỏ ván đã gỡ ít nhất một cặp (Ván mới, đổi bàn, có hỏi xác nhận): `won: false`. Ván chưa gỡ cặp nào thì không gửi gì.
- **Trợ giúp**: hoàn tác miễn phí (chỉ tốn thời gian). Gợi ý hoặc xáo lại → `assisted: true` (cổng không xếp hạng, máy không ghi kỷ lục). Không dùng cách phạt cộng giây vì máy chủ từ chối `timeMs` lớn hơn thời gian thật của ván quá 5 giây (`time_mismatch`), người chơi nhanh có dùng xáo sẽ bị từ chối cả ván.
- `min_time_ms` = số lần chạm tối thiểu × ~150 ms, làm tròn xuống: mỗi cặp hai lần chạm → Rùa 144 × 150 = 21,6 s → 21000; Tháp 84 × 150 = 12,6 s → 12000; Nhỏ 36 × 150 = 5,4 s → 5000. Thời gian thật của người còn phải tìm cặp trên bàn nên cao hơn nhiều.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-matchuocghep-settings-v1` | Cài đặt: giao diện, bàn `mode` (`turtle` / `tower` / `mini` / `daily`), mặt quân `faces` (`auto` / `classic` / `simple`), đã xem hướng dẫn `guideSeen` |
| `playnine-matchuocghep-stats-v1` | Thống kê: đã chơi, đã gỡ hết, kỷ lục từng bàn (chỉ ván không trợ giúp), kết quả bàn ngày theo ngày `daily[YYYY-MM-DD] = { won, ms }`, chuỗi ngày dài nhất |
| `playnine-matchuocghep-save-v1` | Ván đang dở (chỉ khi đã gỡ ít nhất một cặp): `{ v, game, elapsed }`, `game` gồm mode, seed, ngày, mặt quân theo vị trí, quân đã gỡ, lịch sử hoàn tác (cặp đã gỡ, mặt quân trước mỗi lần xáo), số nước / gợi ý / lần xáo |
| `playnine-matchuocghep-summary-v1` | Tóm tắt cho thẻ game trên cổng (kèm `daily`: bàn hôm nay đã chơi chưa, chuỗi ngày) |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng, khác phiên bản hoặc bị sửa (bộ mặt quân khác bộ đã chia theo seed, lịch sử không khớp quân đã gỡ, seed bàn ngày không khớp ngày…) thì bị bỏ và chia bàn mới.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `↑` `↓` `←` `→` | Chuyển giữa các quân tự do (quân gần nhất theo hướng) |
| `Enter` / `Space` | Chọn / gỡ quân đang focus |
| `Esc` | Bỏ chọn / đóng hộp thoại |
| `Z` / `U` / `Backspace` / `Ctrl+Z` | Hoàn tác |
| `H` | Gợi ý |
| `S` | Xáo lại (khi hết nước) |
| `N` | Ván mới |

## Kiểm tra

```bash
node test.js
```

Test engine phủ: hình các bàn (số quân mỗi tầng, không chồng lấn, quân tầng trên luôn có quân đỡ), bộ 144 quân chuẩn, luật ghép (hoa / mùa), luật quân tự do (bị đè một phần, bị chặn hai bên, gỡ quân chặn), sinh bàn giải được (phát lại thứ tự gỡ trên 150 seed mỗi bàn + bộ giải độc lập), tất định theo seed, đề ngày, tốc độ sinh, gỡ / hoàn tác, thắng, gợi ý đúng (cặp gỡ được, giữ bàn giải được, tránh cặp dẫn vào ngõ cụt), hết nước, xáo vẫn giải được (cả trên ván kẹt thật sau khi đi ngẫu nhiên) và không xáo được khi vị trí còn lại bế tắc, lưu / khôi phục và từ chối ván hỏng / bị sửa. Test trong cổng: `e2e.spec.ts` (ván thắng từ ván lưu còn một cặp, bỏ ván, đổi bàn trước cặp đầu).
