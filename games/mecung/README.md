# Mê Cung

Game Mê Cung (Maze) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

Đi từ **lối vào** ở cạnh trên tới **lối ra** (lá cờ) ở cạnh dưới của một mê cung sinh mới mỗi ván. Mê cung là mê cung hoàn hảo: mọi ô thông nhau và giữa hai ô bất kỳ có đúng một đường, nên chỉ có một đường đúng từ lối vào tới lối ra.

- Đi tới đâu để lại **vết** tới đó; đi lùi thì vết bị xóa (vết luôn là đường từ lối vào tới chỗ đang đứng). Ô đã từng qua được tô nhạt để nhớ nhánh nào đã thử.
- Tới lối ra là thắng; đồng hồ chạy từ lúc mê cung hiện ra.

## Điều khiển

- **Bàn phím:** mũi tên / WASD đi một ô. **Giữ phím** thì trượt tiếp tới ngã rẽ tiếp theo: dừng ở ô có lối rẽ ngang (ngã ba, ngã tư, khúc quanh), chân tường hoặc lối ra; muốn đi tiếp thì bấm lại.
- **Cảm ứng:** **vuốt** theo hướng để trượt tới ngã rẽ tiếp theo (vuốt tiếp hướng khác trong cùng một lần chạm được); **kéo chấm cam** dọc hành lang thì nhân vật đi theo ngón tay qua các ô kề hợp lệ (ngón tay lướt nhanh bỏ qua một ô vẫn theo kịp; ngón tay vượt tường thì đứng yên).
- **Chạm / bấm một ô:** ô kề (hoặc cách một ô) theo đường đi, hoặc cùng hàng / cột và thông thẳng, thì đi tới đó.
- **Trượt tới ngã rẽ** (Cài đặt, mặc định bật). Tắt: giữ phím đi tiếp tới khi gặp tường, vuốt đi từng ô.
- **Gợi ý:** hiện 6 ô tiếp theo của đường đúng (nét đứt), tính từ chỗ đang đứng (lạc vào nhánh cụt thì gợi ý dẫn quay ra). Ván có dùng gợi ý gửi `assisted: true` và không tính kỷ lục trong máy.
- Đồng hồ dừng khi mở hộp thoại hoặc ẩn tab; lúc dừng vì hộp thoại thì mê cung bị làm mờ để không dò đường "miễn phí".
- Màn hình ngang (điện thoại xoay ngang, máy tính rộng) thì mê cung vẽ chuyển vị (lối vào bên trái, lối ra bên phải) nếu nhờ đó ô to hơn; phím và vuốt đổi hướng theo. Thuộc tính `data-orient` (`normal` / `transposed`) trên `#board` cho biết cách vẽ.

## Cỡ (mode)

| Mode | Cỡ (rộng x cao) | Điểm trên cổng | `min_time_ms` |
| --- | --- | --- | --- |
| `easy` (mặc định) | 10x15 | 3 | 1000 |
| `medium` | 13x21 | 5 | 2000 |
| `hard` | 17x28 | 8 | 4000 |
| `daily` | 13x21, chung một mê cung cho cả ngày | 5 | 2000 |

Bàn dọc chữ nhật để vừa điện thoại cầm đứng: ở 390x844 ô của cỡ Khó rộng khoảng 21 px (đủ để vuốt và kéo), ô Dễ khoảng 36 px. Đổi cỡ bằng thanh dưới HUD (hoặc phím `1`–`4`); ván đang dở (đã đi ít nhất một bước) thì hỏi trước vì bỏ ván tính là thua.

**Đề hằng ngày:** seed = băm chuỗi `mecung-daily-YYYY-MM-DD` theo ngày giờ địa phương; giải xong thì nút "Hằng ngày" hiện thời gian, bấm lại chỉ báo "mai có mê cung mới". Thống kê có chuỗi ngày liên tiếp; tóm tắt cho cổng có `daily: { date, done, title, streak }`.

## Sinh mê cung

Theo seed (PRNG mulberry32), tất định:

1. **Growing tree** thiên về đào sâu: ngăn xếp các ô còn đào được; 88% số bước đào tiếp từ ô mới nhất (như recursive backtracker), 12% từ một ô ngẫu nhiên trên ngăn xếp; 35% giữ nguyên hướng vừa đào khi đi thẳng được. Mỗi lần đào nối một ô mới vào cây nên luôn được mê cung hoàn hảo.
2. Lối vào ở hàng trên, lối ra ở hàng dưới: chọn cặp xa nhau nhất theo đường đi (BFS từ mỗi ô hàng trên).
3. Đường đúng ngắn hơn 30% số ô thì đào lại bằng dòng số tiếp theo của cùng PRNG (tối đa 12 lần, không đạt thì lấy cái dài nhất).

**Vì sao chọn cách này** (đo trên 300 mê cung mỗi cỡ): recursive backtracker thuần cho hành lang dài đẹp, ít ngõ cụt (~10% số ô) nhưng gần một nửa ngõ cụt chỉ dài 1 ô và đường đúng ngoằn ngoèo rất dài, ít ngã rẽ để suy nghĩ; Prim / chọn ngẫu nhiên thuần cho rất nhiều ngõ cụt cụt lủn (~27% số ô, gần một nửa dài 1 ô), nhìn vụn. Pha 12% rẽ nhánh + 35% đi thẳng cho ~13% ngõ cụt, chỉ ~36% trong đó dài 1 ô, ngõ cụt dài trung bình 3 ô, hành lang thẳng dài hơn (hợp với trượt) mà vẫn đủ ngã rẽ.

**Tốc độ** (Node, máy bàn, 300 seed cỡ 17x28 kể cả các lần đào lại): trung bình ~1,4 ms, chậm nhất ~5 ms / mê cung. Điện thoại chậm (chậm hơn ~10 lần) vẫn dưới 60 ms, xa mục tiêu 300 ms.

## Ghi điểm trên cổng

- Metric `time_low`, mỗi cỡ một mode, đề hằng ngày mode `daily`. Mê cung mới: `kit.sdk.start(mode)`; mở lại ván lưu dở: `kit.sdk.start(mode, true)`.
- Thắng: `kit.sdk.end({ mode, won: true, timeMs, assisted })` (`assisted` = đã dùng gợi ý).
- Bỏ ván đã đi ít nhất một bước (Ván mới hoặc đổi cỡ, có hỏi xác nhận): `won: false`. Ván chưa đi bước nào thì không gửi gì.
- **`min_time_ms`:** muốn tới lối ra phải đi hết mọi đoạn thẳng của đường đúng, mỗi đoạn tốn ít nhất một thao tác có chủ ý (bấm phím, vuốt hoặc đổi hướng ngón tay khi kéo; giữ phím và vuốt đều dừng ở mọi khúc quanh nên trượt cũng tốn ít nhất một thao tác mỗi đoạn). Đo trên 20 000 seed mỗi cỡ, đường đúng ít đoạn thẳng nhất là 10 / 21 / 43 đoạn (Dễ / Vừa / Khó), đề hằng ngày 10 năm tới ít nhất 25 đoạn; số lần trượt tối thiểu còn cao hơn (14 / 28 / 51). Lấy ~120 ms mỗi thao tác (nhanh hơn mức 150–250 ms của người thật) → 1200 / 2520 / 5160 ms, hạ thêm cho đuôi seed hiếm chưa gặp → **1000 / 2000 / 4000 ms** (đề hằng ngày như cỡ Vừa: 2000 ms). Người thật còn phải nhìn đường từ lúc mê cung hiện ra nên chậm hơn nhiều. `test.js` kiểm tra lại các ngưỡng này với số đoạn thẳng ít nhất trên 2000 seed / 2 năm đề ngày.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-mecung-settings-v1` | Cài đặt: giao diện, cỡ gần nhất `size` (`'easy'` / `'medium'` / `'hard'`), trượt tới ngã rẽ `slide`, đã xem hướng dẫn `guideSeen` |
| `playnine-mecung-stats-v1` | Thống kê: đã chơi, đã thoát, kỷ lục từng mode (chỉ ván không dùng gợi ý), thời gian đề hằng ngày theo ngày (giữ 400 ngày) |
| `playnine-mecung-save-v1` | Ván đang dở (chỉ khi đã đi ít nhất một bước): `{ v, game, elapsed }`, `game` = `{ v, mode, seed, date, pos, seen, moves, hints }` (mê cung sinh lại từ seed, vết đi suy ra từ vị trí, `seen` là chuỗi hex bit ô đã qua) |
| `playnine-mecung-summary-v1` | Tóm tắt cho thẻ game trên cổng (kèm `daily`) |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng hoặc khác phiên bản (mode lạ, seed đề ngày không khớp ngày, vị trí ngoài bàn, ô trên vết chưa đánh dấu đã qua, số bước ít hơn độ dài vết…) thì bị bỏ và chia mê cung mới. Đổi thuật toán / tham số sinh phải tăng `VERSION` trong `engine.js` (test khóa dấu vân tay mê cung seed 1).

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `↑` `↓` `←` `→` / `W` `A` `S` `D` | Đi một ô; giữ để trượt tới ngã rẽ tiếp theo |
| `H` | Gợi ý |
| `1` `2` `3` `4` | Dễ / Vừa / Khó / Hằng ngày |
| `N` | Mê cung mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test engine phủ: mê cung hoàn hảo (số lối thông = số ô − 1, liên thông, tường hai phía khớp, không thủng khung) trên 300 seed mỗi cỡ; tất định theo seed và theo ngày; lối vào / lối ra là cặp xa nhất giữa hai cạnh; độ dài đường đúng và tỉ lệ ngõ cụt; đi không xuyên tường, vết nối / xóa, kéo ngón tay; trượt dừng đúng chỗ (bàn dựng tay + tính chất trên mê cung ngẫu nhiên); gợi ý đúng đường ngắn nhất; thắng khi tới lối ra; lưu / khôi phục và từ chối dữ liệu hỏng; tốc độ sinh cỡ lớn nhất; ngưỡng `min_time_ms`. Test trong cổng: `e2e.spec.ts` (ván thắng từ ván lưu dựng sẵn, bỏ ván, đổi cỡ trước bước đầu).
