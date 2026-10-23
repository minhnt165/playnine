# Cờ Chín Quân

Game Cờ Chín Quân (Mill, Nine men's morris) của PlayNine: người đấu máy trên bàn 24 điểm, mỗi bên chín quân. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Bàn có 24 điểm trên ba hình vuông lồng nhau, nối bằng bốn đường ở giữa các cạnh. Trắng đi trước.
- **Đặt quân**: hai bên lần lượt đặt 9 quân vào điểm trống.
- **Đi quân**: đặt hết thì mỗi lượt đẩy một quân theo đường kẻ sang điểm kề còn trống.
- **Bay**: bên nào chỉ còn đúng 3 quân (đã đặt hết) thì quân được nhảy tới điểm trống bất kỳ.
- **Mill**: ba quân cùng màu thẳng hàng trên một đường. Lập mill (khi đặt, đi hoặc bay) thì ăn một quân đối thủ không nằm trong mill; nếu mọi quân đối thủ đều nằm trong mill thì ăn quân nào cũng được. Lập hai mill cùng lúc vẫn chỉ ăn một quân. Đi quân ra khỏi mill rồi đi về lại là lập mill lần nữa.
- **Thua**: còn dưới 3 quân (tính cả quân chưa đặt) hoặc tới lượt mà không còn nước đi.
- **Hòa**: 50 nước mỗi bên (100 nửa nước) ở giai đoạn đi / bay mà không ai ăn quân, hoặc một thế cờ (bàn + lượt + quân trên tay) lặp lại 3 lần.

## Điều khiển

- Chạm điểm trống để đặt quân.
- Giai đoạn đi / bay: chạm quân của mình (các quân đi được có vòng mờ), rồi chạm điểm được đánh dấu. Chạm lại quân đang chọn để bỏ chọn, chạm quân khác để đổi.
- Lập mill: các quân đối thủ ăn được có vòng đỏ nhấp nháy, chạm một quân để ăn. Chạm lại quân vừa đi (hoặc `Esc`) để đi lại bước đó.
- Dòng trạng thái luôn ghi giai đoạn: "Đặt quân · còn 7", "Đi quân", "Bay", "Ăn một quân".
- Nước vừa đi có vòng xanh (điểm cũ có vòng nét đứt, quân bị ăn để lại dấu ×); mill đã thành có vạch vàng dưới quân. Thẻ người chơi có 9 chấm: đậm = còn trên tay, nhạt = trên bàn, vòng nhỏ = đã mất.
- Máy nghĩ trong Web Worker (không chặn giao diện), thẻ máy hiện "Đang nghĩ…".

## Mức độ (mode) và màu quân

Chọn trong Cài đặt. Ván chưa đi nước nào (hoặc đã xong) thì đổi là chia ván mới ngay; ván đang dở thì áp dụng từ ván sau. Cầm Đen thì máy (Trắng) đi trước.

| Mode | Máy |
| --- | --- |
| `easy` (Dễ) | Alpha-beta sâu 2 nửa nước, cộng nhiễu ±90 vào điểm từng nước, 20% số nước đi bừa |
| `medium` (Vừa) | Alpha-beta sâu 4 nửa nước |
| `hard` (Khó) | Đào sâu dần alpha-beta (luôn xong độ sâu 6, thường 8–12 trong ~1,5 s), bảng chuyển vị, sắp xếp nước (ăn quân, chặn mill, tạo mill mở) |

Lượng giá: số quân, mill đã thành, mill mở (dọa thật khi có quân bước / đặt / bay vào được), quân bị chặn, độ linh hoạt, mill kép (quân trong mill bước ra là lập ngay mill khác), dọa hai mill cùng lúc. Máy thấy trước hòa do lặp thế và luật 50 nước.

## Báo ván cho cổng

- Metric `wins` (số ván thắng), điểm game 15; mode `easy` 10 điểm, `medium` 15, `hard` 25; mỗi mode luật `min_duration_ms: 3000`.
- Chia ván mới: `kit.sdk.start(level)`; mở lại ván lưu dở: `kit.sdk.start(level, true)`.
- Thắng: `kit.sdk.end({ mode, won: true, timeMs, assisted: false })`; thua hoặc hòa: `won: false`.
- Bỏ ván (nút Ván mới) khi người chơi đã đi ít nhất một nước: hỏi xác nhận rồi gửi `won: false`; chưa đi nước nào thì không gửi gì (kể cả khi máy đã đi trước).
- Ngưỡng 3 s: ván thắng ngắn nhất cũng phải đặt hết 9 quân mỗi bên (thắng do chặn hết nước ngay sau đó) hoặc ăn 7 quân, tức ít nhất 9–10 nước của người chơi cộng thời gian máy nghĩ (máy hiện "đang nghĩ" tối thiểu 0,65 s mỗi nước), nên ván thật luôn dài hơn nhiều; 3 s chỉ chặn việc gửi kết quả giả ngay sau khi bắt đầu, đúng bảng mục 4.8 cho game đối kháng với máy.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-cochinquan-settings-v1` | Cài đặt (giao diện, `level`, `side`) |
| `playnine-cochinquan-stats-v1` | Thống kê: số ván, thắng, hòa, thua; số ván thắng / đã chơi theo từng mức |
| `playnine-cochinquan-save-v1` | Ván đang chơi dở (`{ v, game, level, human, humanMoves, elapsed }`; chỉ lưu khi người chơi đã đi ít nhất một nước) |
| `playnine-cochinquan-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| Mũi tên | Di con trỏ qua các điểm (theo hàng / cột gần nhất) |
| `Enter` / `Space` | Đặt / chọn quân / đi tới / ăn quân tại con trỏ |
| `Esc` | Bỏ chọn quân, hoặc đi lại bước vừa lập mill; đóng hộp thoại |
| `N` | Ván mới |

## Kiểm tra

```bash
node test.js
```

`test.js` phủ đồ thị kề, 16 mill, đặt / đi / bay, ăn quân (kể cả khi mọi quân đều trong mill, khi đối thủ chưa có quân trên bàn), thắng / thua / hòa 50 nước / lặp thế, so khớp nước sinh ra với luật viết tay trên 40 ván ngẫu nhiên, máy trả nước hợp lệ ở mọi mức, máy đi nước thắng và chặn mill, máy khó đủ sâu, 150 ván ngẫu nhiên đều kết thúc, lưu / khôi phục và từ chối dữ liệu hỏng. Game không sinh màn ngẫu nhiên (bàn luôn trống lúc đầu) nên không có phần "màn giải được".

Test riêng trong cổng: `e2e.spec.ts` (thắng, thua, hòa, bỏ ván) chạy cùng `npm run e2e` sau khi build và ghép.
