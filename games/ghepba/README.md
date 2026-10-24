# Ghép Ba

Game Ghép Ba (Match Three) của PlayNine: match-3 cổ điển trên bàn 8×8, ghi điểm cao nhất trong 30 nước, không tính giờ. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Bàn 8×8, sáu loại viên, mỗi loại một **hình và màu riêng** (tròn đỏ, vuông xanh dương, tam giác vàng, thoi xanh lá, lục giác tím, sao xanh ngọc) nên người mù màu vẫn chơi được. Viên vẽ bằng canvas, không dùng ảnh ngoài.
- Đổi chỗ hai viên kề nhau (ngang / dọc). Nước chỉ hợp lệ nếu tạo được hàng ≥ 3 viên cùng loại; không thì hai viên đổi rồi trả lại chỗ cũ và không mất nước.
- Hàng bị xóa, viên phía trên rơi xuống, viên mới rơi vào từ trên (PRNG mulberry32 theo seed, trạng thái lưu trong ván). Viên rơi tạo hàng mới thì xóa tiếp (dây chuyền).
- **Viên đặc biệt** (vẫn ghép hàng theo loại của nó):
  - hàng 4 → **viên sọc** cùng hướng với hàng: sọc ngang xóa cả hàng, sọc dọc xóa cả cột;
  - hàng hình L / T (một hàng ngang và một hàng dọc chung ô) → **bom**: nổ 3×3;
  - hàng ≥ 5 → **cầu vồng**: đổi với viên nào thì xóa mọi viên cùng loại đó. Cầu vồng bị trúng hiệu ứng khác thì xóa loại đang nhiều nhất trên bàn.
  - Viên đặc biệt mới đặt ở ô người chơi vừa kéo tới (trong dây chuyền: ô giao của L / T, hoặc ô giữa hàng). Viên đặc biệt bị xóa thì nổ tiếp, lan trong cùng một bậc.
- **Kết hợp hai viên đặc biệt** (đổi hai viên đặc biệt với nhau luôn hợp lệ, kể cả không tạo hàng): sọc + sọc → hàng + cột qua ô kéo tới; sọc + bom → 3 hàng + 3 cột; bom + bom → nổ 5×5; cầu vồng + sọc / bom → mọi viên cùng loại biến thành sọc (xen kẽ ngang / dọc theo ô) / bom rồi cùng nổ; cầu vồng + cầu vồng → xóa cả bàn. Chọn đúng bộ luật quen thuộc của thể loại để người chơi không phải học lại, và mọi kết hợp đều mạnh hơn hai viên nổ riêng.
- **Điểm**: mỗi bậc xóa được `(số viên bị xóa × 10 + thưởng) × bậc`, thưởng 20 cho mỗi viên sọc, 30 cho bom, 50 cho cầu vồng tạo ra trong bậc đó; bậc đầu ×1, dây chuyền ×2, ×3…
- Bàn mới sinh không có hàng sẵn và luôn có ít nhất một nước. Sau một nước mà bàn hết nước đổi thì bàn tự xáo (hoán vị các viên hiện có, giữ viên đặc biệt) tới khi không có hàng sẵn và có nước.
- Hết 30 nước thì hết ván.

## Điều khiển

- **Vuốt / kéo** viên sang ô kề (kéo quá khoảng 1/3 ô là đổi).
- **Chạm rồi chạm**: chạm một viên (viền tím), rồi chạm viên kề để đổi; chạm lại viên đang chọn để bỏ chọn, chạm viên khác (không kề) để chọn viên đó.
- **Bàn phím**: mũi tên hiện / di con trỏ (viền đứt), Enter / Space chọn viên (có mũi tên nhỏ quanh viên), rồi mũi tên để đổi theo hướng đó; Esc bỏ chọn.
- **Gợi ý**: sau 5 giây không đi, hai viên của một nước hợp lệ nhấp nháy viền vàng (giảm chuyển động: viền đứng yên). Tắt được trong Cài đặt; phím `H` hiện gợi ý ngay. Gợi ý **không** đánh dấu `assisted`: nó chỉ chỉ ra một nước hợp lệ mà người chơi tự tìm được, không đổi điểm, không thêm nước, không cho biết viên mới sắp rơi.
- Hoạt cảnh: đổi chỗ 160 ms, xóa 260 ms, rơi 300 ms mỗi bậc, xáo 520 ms. **Giảm chuyển động**: 70 / 90 / 110 / 160 ms và tắt điểm bay lên, nhấp nháy gợi ý; kết quả do engine tính trước nên logic giống hệt. Không nhận nước mới khi hoạt cảnh đang chạy.
- Rung nhẹ khi nổ lớn (máy có `navigator.vibrate`), tắt được trong Cài đặt.

## Chế độ và ghi điểm trên cổng

Metric `score_high` (điểm cao nhất), 5 điểm tham gia, hai mode:

| Mode | Nhãn | Nội dung |
| --- | --- | --- |
| `classic` | Classic / Cổ điển | Bàn ngẫu nhiên, 30 nước |
| `daily` | Daily / Hằng ngày | Mọi người cùng một bàn theo ngày (giờ máy, seed = băm `ghepba-daily-YYYY-MM-DD`), mỗi ngày chơi một lần; có chuỗi ngày |

- Mở trang không có ván lưu: chia ván Cổ điển ngay, `kit.sdk.start('classic')`; mở lại ván lưu dở: `kit.sdk.start(mode, true)`. Chọn chế độ ở nút gạt dưới số liệu; đang có ván dở thì hỏi trước.
- Hết 30 nước: `kit.sdk.end({ mode, won: false, score, assisted: false })`, gửi ngay khi nước cuối được tính (hộp kết quả hiện sau hoạt cảnh). Thể loại không có "thắng" nên luôn `won: false`, như các game điểm khác.
- Bỏ ván đã đi ít nhất một nước (Ván mới / đổi chế độ → xác nhận): gửi `won: false` với điểm hiện có. Chưa đi nước nào thì không gửi gì.
- Không có màn chờ / `#btn-start`: game theo lượt, không đồng hồ, nên ván bắt đầu ngay khi mở (giống Xếp Khối); lần đầu mở hiện hộp Cách chơi (`guideSeen` trong cài đặt).
- Luật chống gian lận (cả hai mode): `min_duration_ms` 8000, `max_score` 80000.
  - `min_duration_ms`: 30 nước × hoạt cảnh ngắn nhất của một nước khi giảm chuyển động (70 + 90 + 110 = 270 ms) = 8,1 s, chưa tính thời gian người bấm; đặt 8000.
  - `max_score`: đo bằng bot (script tạm, không nằm trong repo) chơi bằng engine thật, nên bot **thấy trước viên mới rơi** (mạnh hơn người):

    | Bot | Số seed | Trung bình | p50 | p90 | p99 | Cao nhất |
    | --- | --- | --- | --- | --- | --- | --- |
    | Ngẫu nhiên (nước hợp lệ) | 1000 | 2 541 | 2 420 | 3 500 | 4 730 | 7 000 |
    | Tham lam (điểm nước này cao nhất) | 5000 | 7 825 | 7 680 | 10 650 | 13 600 | 20 860 |
    | Nhìn trước 1 nước (nước này + nước sau tốt nhất) | 2600 | ≈ 16 660 | 16 600 | 20 920 | 25 010 | 31 670 |

    Một nước cao nhất đo được 10 780 điểm. Đặt 80 000 ≈ 2,5 lần ván cao nhất của bot nhìn trước (vốn biết trước viên rơi) và ≈ 10 lần trung vị của bot tham lam: ván rất may (nhiều cầu vồng + dây chuyền dài) vẫn qua, còn điểm bịa cỡ trăm nghìn bị chặn.
  - Không đặt `max_score_per_sec`: điểm bị giới hạn bởi 30 nước chứ không theo thời gian; người chơi nhanh tay chỉ rút ngắn thời gian, nên tỉ lệ điểm / giây chỉ phạt người chơi nhanh mà không chặn thêm gì ngoài `max_score` + `min_duration_ms`.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-ghepba-settings-v1` | Cài đặt: giao diện, gợi ý (`hint`), rung (`vibrate`), đã xem hướng dẫn (`guideSeen`) |
| `playnine-ghepba-stats-v1` | Thống kê: số ván, kỷ lục, tổng điểm (tính trung bình), dây chuyền dài nhất, số viên đặc biệt đã tạo, điểm bàn hằng ngày theo ngày (`daily`, giữ ~400 ngày) |
| `playnine-ghepba-save-v1` | Ván đang chơi dở (`{ v: 1, game }`, `game` là `toJSON` của engine: mode, ngày, seed, trạng thái PRNG, bàn, điểm, số nước) |
| `playnine-ghepba-summary-v1` | Tóm tắt cho thẻ game trên cổng (kỷ lục, ván dở, bàn hằng ngày + chuỗi ngày) |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng (sai kích thước, viên lạ, bàn có hàng sẵn, bàn hết nước khi ván chưa xong, điểm không khớp số nước, seed ngày sai…) bị bỏ qua và chia ván mới. Ván được lưu ngay sau mỗi nước (trước hoạt cảnh), nên rời trang giữa hoạt cảnh vẫn không mất nước.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `→` `↓` | Hiện / di con trỏ; sau khi chọn viên: đổi chỗ theo hướng đó |
| `Enter` / `Space` | Chọn viên dưới con trỏ (bấm lại để bỏ chọn) |
| `Esc` | Bỏ chọn; đóng hộp thoại |
| `H` | Hiện gợi ý ngay |
| `N` | Ván mới |

## Kiểm tra

```bash
node test.js
```

Test engine phủ PRNG, phát hiện hàng (ngang, dọc, L, T, 5), viên đặc biệt sinh ra và chỗ đặt, hiệu ứng sọc / bom / cầu vồng và lan dây chuyền, mọi kết hợp hai viên đặc biệt, đổi chỗ hợp lệ / không hợp lệ, rơi + viên mới + dây chuyền nhân điểm, bàn mới không có hàng sẵn và có nước (300 seed), xáo khi hết nước, chơi hết 30 nước trên 100 seed (bàn luôn yên, còn nước, điểm cộng đúng), chơi lại tất định, bàn hằng ngày, lưu / khôi phục và từ chối dữ liệu hỏng. `e2e.spec.ts` chạy trong cổng: ván lưu dựng sẵn còn 1 nước báo đúng `pn:end` kèm điểm, bỏ ván đã đi báo `won: false`, ván chưa đi thì không báo và chuyển sang mode `daily`.
