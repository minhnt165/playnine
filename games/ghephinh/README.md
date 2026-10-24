# Ghép Hình

Game Ghép Hình (Jigsaw) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

Ghép lại một bức tranh vuông bị cắt thành các mảnh jigsaw có **tai** và **lõm** thật (đường cong Bezier). Mảnh ban đầu nằm xáo trộn trong khay.

- Kéo mảnh lên bàn. Thả mảnh trong phạm vi **30% cạnh mảnh** quanh chỗ đúng thì mảnh tự hút vào và **khóa** (không kéo được nữa).
- Thả chỗ khác thì mảnh **nằm rời** trên bàn. Hai mảnh kề nhau (chung một cạnh) đặt đúng vị trí tương đối với nhau (sai lệch ≤ 30% cạnh mảnh) ở bất kỳ đâu trên bàn thì **dính thành nhóm**, căn thẳng và đi cùng nhau; kéo nhóm về gần đúng chỗ thì cả nhóm khóa. Một lần thả có thể nối nhiều nhóm.
- Thả một mảnh rời (đứng một mình) vào khay để cất lại; nhóm nhiều mảnh không cất được.
- Ghép đủ mảnh là thắng; xếp hạng theo thời gian.
- **Không xoay mảnh**: trên màn hình cảm ứng nhỏ, xoay cần thêm cử chỉ (hai ngón / chạm đúp) dễ nhầm với kéo và làm ván 64 mảnh dài gấp mấy lần; phần lớn game ghép hình trên máy cũng mặc định không xoay.

## Bức tranh (vẽ bằng code)

Không dùng ảnh nào: `scenes.js` vẽ 10 cảnh bằng canvas 2D, tất định theo seed (seed đổi bảng màu, dáng núi, vị trí nhà, hoa, cá, khinh khí cầu…): hồ núi lúc hoàng hôn, thành phố về đêm, vườn hoa, hoa văn hình học, rạn san hô, bầu trời sao, khinh khí cầu, ruộng bậc thang, đảo nhiệt đới, làng mùa đông. Mỗi cảnh có nền chuyển màu theo độ cao và chi tiết rải khắp để vùng nào cũng khác vùng khác, ghép được bằng mắt.

**Thời gian vẽ** (Chromium, máy bàn, 6 seed mỗi cảnh, trung bình / chậm nhất): ở cỡ ảnh lớn nhất 1600 px (giới hạn `MAX_PX` trong `app.js`) chậm nhất là bầu trời sao 31,7 / 38,5 ms, vườn hoa 26,2 / 33,5 ms, ruộng bậc thang 21,9 / 31,9 ms, các cảnh khác dưới 26 ms; ở 1100 px (điện thoại 360 px × dpr 3) chậm nhất 24,9 ms. Điện thoại chậm (~5–10 lần) mất khoảng 0,2–0,4 s, chỉ một lần lúc chia ván / đổi cỡ khung. Thời gian vẽ ván hiện tại ghi ở `data-draw-ms` trên `#app`.

## Mảnh ghép

- Engine (`engine.js`) sinh mọi cạnh trong theo seed (PRNG mulberry32): mỗi cạnh là 3 đoạn Bezier bậc ba (cổ thắt + đầu tròn) với hướng tai ngẫu nhiên và độ lệch ±0,04; hai mảnh kề dùng chung đúng một cạnh (đi ngược chiều) nên tai bên này luôn khớp lõm bên kia; cạnh ngoài là đoạn thẳng. Tai cao tối đa 0,34 cạnh mảnh, mỗi mảnh vẽ trong ô vuông có lề 0,36.
- `app.js` vẽ bức tranh một lần vào canvas ẩn rồi cắt từng mảnh bằng `Path2D` (clip) thành một `<canvas>` riêng, thêm viền nổi (sáng trên trái, tối dưới phải). Mảnh đã khóa vẽ thẳng vào canvas bàn; khi xong vệt sáng chạy chéo qua bức tranh (tắt khi giảm chuyển động).
- Chạm vào mảnh kiểm tra đúng đường viền (`isPointInPath`), không tính góc trong suốt.

## Điều khiển

- **Kéo thả** (chuột / chạm): kéo mảnh từ khay lên bàn, kéo mảnh / nhóm rời trên bàn. Điện thoại dọc: khay cuộn ngang ở dưới, **vuốt ngang khay để cuộn, kéo lên để nhấc mảnh**; màn hình ngang / máy tính: khay cuộn dọc ở cột phải, kéo ngang để nhấc mảnh. Lăn chuột trên khay ngang thì cuộn ngang.
- **Chạm chọn rồi chạm đích**: chạm một mảnh (khay hoặc bàn) để chọn, chạm chỗ trống trên bàn để đặt mảnh (tâm mảnh nằm ở chỗ chạm) — không cần kéo.
- **Xem hình** (giữ nút, hoặc giữ phím `V`): hiện mờ bức tranh gốc trên bàn.
- **Mảnh viền** (nút, phím `E`): khay chỉ còn mảnh viền.
- **Bàn phím**: `←` `→` (hoặc `↑` `↓`) chọn mảnh (mảnh trong khay theo bộ lọc, rồi mỗi nhóm rời một mảnh), `Enter` / `Space` cầm lên → khung ô đích nét đứt hiện trên bàn kèm bóng mờ của mảnh; mũi tên dời ô đích, `Enter` đặt: **chỉ nhận đúng ô của mảnh** (sai thì báo "Không phải ô này", không tính nước), đặt mảnh của nhóm rời thì khóa cả nhóm. `Esc` bỏ cầm / bỏ chọn. Ô đích lần sau bắt đầu ở ô vừa đặt. Trình đọc màn hình được báo mảnh đang chọn, ô đích, kết quả.
- Đồng hồ chạy từ lúc bức tranh hiện ra, dừng khi mở hộp thoại hoặc ẩn tab; lúc dừng vì hộp thoại thì bàn và khay bị làm mờ để không ngắm hình "miễn phí".
- Cài đặt riêng: **Lưới trên bàn** (đường kẻ mờ đánh dấu ô của từng mảnh, mặc định bật).

## Cỡ (mode)

| Mode | Bàn | Điểm trên cổng | `min_time_ms` |
| --- | --- | --- | --- |
| `easy` (mặc định) | 4×4 = 16 mảnh | 3 | 6400 |
| `medium` | 6×6 = 36 mảnh | 5 | 14400 |
| `hard` | 8×8 = 64 mảnh | 8 | 25600 |
| `daily` | 6×6, chung một bức tranh cho cả ngày | 5 | 14400 |

Tranh vuông để cùng một bố cục vừa cả điện thoại dọc (bàn 360 px ở trên, khay ở dưới) lẫn màn hình ngang. Ở 390×844, mảnh cỡ Khó rộng 45 px, cỡ Dễ 90 px. Đổi cỡ bằng thanh dưới HUD (hoặc phím `1`–`4`); ván đang dở (đã đặt ít nhất một mảnh) thì hỏi trước vì bỏ ván tính là thua.

**Đề hằng ngày:** seed = băm chuỗi `ghephinh-daily-YYYY-MM-DD` theo ngày giờ địa phương (chọn cảnh, đường cắt, thứ tự khay); ghép xong thì nút "Hằng ngày" hiện thời gian, bấm lại chỉ báo "mai có tranh mới". Thống kê có chuỗi ngày liên tiếp; tóm tắt cho cổng có `daily: { date, done, title, streak }`.

## Ghi điểm trên cổng

- Metric `time_low`, mỗi cỡ một mode, đề hằng ngày mode `daily`. Ván mới: `kit.sdk.start(mode)`; mở lại ván lưu dở: `kit.sdk.start(mode, true)`.
- Thắng: `kit.sdk.end({ mode, won: true, timeMs, assisted: false })`. **Xem hình gốc không tính là trợ giúp**: hình mẫu trên hộp là một phần của trò ghép hình, và xem hình chỉ giúp đoán vùng chứ không đặt hộ mảnh nào. Không có gợi ý / tự giải nên `assisted` luôn `false`.
- Bỏ ván đã đặt ít nhất một mảnh (Ván mới hoặc đổi cỡ, có hỏi xác nhận): `won: false`. Chưa đặt mảnh nào thì không gửi gì.
- **`min_time_ms` = số mảnh × 400 ms** (`MIN_MS_PER_PIECE` trong engine, test kiểm tra khớp `game.json`): mảnh nào cũng bắt đầu trong khay và không có cách nào đưa mảnh ra khỏi khay ngoài một lần kéo thả (hoặc chạm chọn + chạm đích, hoặc chọn + cầm + đặt bằng phím) — ghép nhóm chỉ gộp các mảnh *đã* ra khỏi khay — nên ván nào cũng cần ít nhất N thao tác đặt. Một lần kéo thả của người thật gồm nhìn tìm mảnh, nhấn, kéo 200–400 px, thả: thực tế ≥ 0,8–1 s; lấy 400 ms (gần giới hạn vận động thuần) để còn dưới người nhanh nhất một chút → 6,4 s / 14,4 s / 25,6 s (hằng ngày như cỡ Vừa). Bot tự động trong lúc tự kiểm tra (kéo tức thì, 6 bước chuột) ghép 16 mảnh hết ~5,4 s, dưới ngưỡng nên bị cổng loại.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-ghephinh-settings-v1` | Cài đặt: giao diện, cỡ gần nhất `size`, lưới bàn `grid`, lọc mảnh viền `edges`, đã xem hướng dẫn `guideSeen` |
| `playnine-ghephinh-stats-v1` | Thống kê: đã chơi, đã ghép xong, kỷ lục từng mode, thời gian đề hằng ngày theo ngày (giữ 400 ngày) |
| `playnine-ghephinh-save-v1` | Ván đang dở (chỉ khi đã đặt ít nhất một mảnh): `{ v, game, elapsed }`, `game` = `{ v, mode, seed, date, tray: [id], loose: [{ dx, dy, m: [id] }], done: [id], moves }` (bức tranh và đường cắt sinh lại từ seed; nhóm rời lưu độ lệch so với chỗ đúng) |
| `playnine-ghephinh-summary-v1` | Tóm tắt cho thẻ game trên cổng (kèm `daily`) |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng hoặc khác phiên bản (mode lạ, seed sai kiểu, seed đề ngày không khớp ngày, mảnh trùng / thiếu / ngoài phạm vi, độ lệch không phải số hoặc quá xa, nhóm rỗng hay không liền cạnh…) thì bị bỏ và chia ván mới. Đổi thuật toán / tham số sinh phải tăng `VERSION` trong `engine.js` (test khóa dấu vân tay ván seed 1).

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `→` `↑` `↓` | Chọn mảnh; khi đang cầm mảnh: dời ô đích |
| `Enter` / `Space` | Cầm mảnh đang chọn / đặt vào ô đích (chỉ nhận đúng ô) |
| `Esc` | Bỏ cầm, bỏ chọn; đóng hộp thoại |
| giữ `V` | Xem hình gốc |
| `E` | Bật / tắt lọc mảnh viền |
| `1` `2` `3` `4` | Dễ / Vừa / Khó / Hằng ngày |
| `N` | Ván mới |

## Kiểm tra

```bash
node test.js
```

Test engine phủ: cỡ / mode, xáo khay và chọn cảnh tất định theo seed (khóa dấu vân tay), đề hằng ngày theo ngày; hình học mảnh (mảnh viền phẳng ở cạnh ngoài, hai mảnh kề một tai một lõm, cạnh chung trùng nhau từng điểm khi đi ngược chiều, hướng tai trên hình khớp `sides()`, đường viền khép kín và nằm trong lề); hút + khóa trong dung sai, không hút ngoài dung sai (kể cả đường chéo), mảnh đã khóa không kéo được, dữ liệu thả vô lý; ghép nhóm (căn thẳng, không ghép khi lệch xa / không kề / chéo góc), nhóm đi cùng nhau, khóa cả nhóm, chuỗi ghép nhiều nhóm, về khay; thắng khi đủ mảnh, ván nào cũng giải được (mọi cỡ, nhiều seed); lưu / khôi phục và từ chối dữ liệu hỏng; `scenes.js` vẽ đủ 10 cảnh không lỗi, tất định theo seed (trên ngữ cảnh canvas giả); ngưỡng `min_time_ms` trong `game.json`. Test trong cổng: `e2e.spec.ts` (ván thắng từ ván lưu dựng sẵn bằng bàn phím, bỏ ván sau khi kéo một mảnh, đổi cỡ trước mảnh đầu).
