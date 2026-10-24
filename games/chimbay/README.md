# Chim Bay

Game Chim Bay (Flappy Flight) của PlayNine: chạm để vỗ cánh, đưa chú chim nhỏ lách qua khe giữa các cặp thân tre. Viết bằng HTML + CSS + JavaScript thuần (vẽ bằng `<canvas>`), dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Chim rơi theo trọng lực; mỗi lần vỗ cánh đặt vận tốc đứng về một giá trị cố định (bay lên một đoạn rồi rơi lại).
- Các cặp thân tre cuộn từ phải sang với tốc độ không đổi (150 đơn vị/giây, thế giới cao 640 đơn vị). Chạm thân tre hoặc mặt đất là hết lượt; sau va chạm chim rơi xuống đất rồi hiện bảng kết quả.
- Đỉnh trời chặn chim lại (không chết), nhưng thân tre phía trên kéo dài lên tận trời nên không thể bay vòng qua.
- **Điểm**: +1 khi chim đi qua tâm một cặp tre (mỗi cặp một lần; bước va chạm không được tính).
- **Độ khó**: khe bắt đầu 190, hẹp 1 đơn vị mỗi cặp tới 150; khoảng cách giữa hai cặp bắt đầu 300, giảm 1,75 mỗi cặp tới 230. Cả hai chạm trần ở cặp thứ 40 rồi giữ nguyên. Tâm khe hai cặp liền nhau lệch tối đa 170, khe luôn cách trời và đất ít nhất 70.
- **Huy chương** khi hết lượt: đồng 10, bạc 20, vàng 40, bạch kim 80.
- Mô phỏng theo bước cố định 1/120 giây (engine thuần, tất định theo seed + chuỗi tick vỗ cánh); app đổi thời gian thật thành số bước (khung hình dài quá 100 ms chỉ tính 100 ms) và nội suy hình vẽ giữa hai bước, nên máy nhanh / chậm, màn 60 / 144 Hz chơi như nhau.

## Điều khiển

- **Chạm / nhấp** bất kỳ đâu trên bầu trời để vỗ cánh. Màn chờ: nút **Chơi** (`#btn-start`), chạm ra ngoài thẻ, Space hoặc Enter cũng bắt đầu.
- Sau khi bấm Chơi (hoặc Chơi tiếp sau tạm dừng), chim đứng chờ giữa trời cho tới lần vỗ cánh đầu tiên.
- Nút tạm dừng cạnh ô điểm, phím `P` / `Esc`. Game tự tạm dừng khi trang bị ẩn hoặc mở hộp thoại (Cách chơi, Thống kê, Cài đặt).
- Lần đầu mở game hiện hộp Cách chơi (ghi `guideSeen` trong cài đặt).
- Cài đặt: giao diện, ngôn ngữ, âm thanh (của cổng) và **rung** (khi va chạm và khi đạt mốc huy chương).

## Mode và ghi điểm trên cổng

Một mode `classic` (Cổ điển), metric `score_high`, 5 điểm tham gia.

- Bấm Chơi / Chơi lại / Ván mới: `kit.sdk.start('classic')`; mở lại lượt lưu dở: `kit.sdk.start('classic', true)`.
- Hết lượt: `kit.sdk.end({ mode: 'classic', won: false, score, assisted: false })` (game vô tận, không có thắng).
- Bỏ lượt (nút Ván mới, `N`, Ván mới trong lớp tạm dừng) khi đã có điểm hoặc đã bay ≥ 1 giây: hỏi xác nhận rồi gửi `won: false` với điểm hiện có. Chưa bay đủ 1 giây và chưa có điểm thì chia lượt mới, không gửi gì.
- Luật chống gian lận: `min_duration_ms` 5000, `max_score_per_sec` 1,3.
  - Trần lý thuyết: tốc độ cuộn không đổi và khoảng cách cặp tre ≥ 230 nên sau t giây điểm ≤ ⌊(150·t − 456) / 230⌋ + 1; tâm cặp đầu ở 456 ≥ 230 nên điểm / giây luôn < 150 / 230 ≈ **0,652** (có test).
  - Đo bằng bot (script tạm, 300 seed, mỗi seed 10 phút, tốc độ = điểm / thời gian từ cú vỗ đầu, xét từ giây thứ 5): bot tối ưu sống cả 300 seed, cao nhất **0,640** điểm/s; bot "người thật" (trễ 0–50 ms, tối đa 10 lần vỗ/giây) cũng 0,640 khi còn sống. Đặt 1,3 (khoảng ×2 trần lý thuyết). Không đặt `max_score` vì game vô tận.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-chimbay-settings-v1` | Cài đặt: giao diện, `vibrate`, `guideSeen` |
| `playnine-chimbay-stats-v1` | Thống kê: số lượt, kỷ lục, tổng số cặp tre đã qua (tính trung bình), số huy chương từng loại |
| `playnine-chimbay-save-v1` | Lượt đang bay dở (`{ v: 1, game }`, `game` là `toJSON` của engine): ghi khi tạm dừng / rời trang, mở lại ở trạng thái tạm dừng |
| `playnine-chimbay-summary-v1` | Tóm tắt cho thẻ game trên cổng (kỷ lục, lượt dở) |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng (sai phiên bản, số không hữu hạn, chim ngoài trời / dưới đất, cột sai khe hoặc sai thứ tự, điểm nhiều hơn số cặp tre có thể qua trong thời gian đã bay…) bị bỏ qua.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `Space` / `Enter` / `↑` / `W` | Vỗ cánh; ở màn chờ thì bắt đầu; khi tạm dừng thì chơi tiếp; ở bảng kết quả thì chơi lại |
| `P` / `Esc` | Tạm dừng / chơi tiếp (`Esc` đóng hộp thoại nếu đang mở) |
| `N` | Ván mới |

Giữ phím không vỗ liên tục (bỏ qua phím lặp).

## Kiểm tra

```bash
node test.js
```

Test engine phủ vỗ cánh, trọng lực, trần, va chạm thân tre trên / dưới / góc / mặt đất, điểm khi qua tâm cột, đường cong độ khó và giới hạn cột sinh ra, tất định (cùng seed + tick vỗ cánh, chia khung hình 30 / 60 / 144 Hz / giật đều ra cùng trạng thái), bot sống 5 phút trên 30 seed (màn luôn qua được), số cột / giây khớp tốc độ cuộn, điểm / giây không vượt trần, huy chương, lưu / khôi phục (chạy tiếp ra đúng kết quả) và từ chối dữ liệu hỏng.

`e2e.spec.ts` chạy trong cổng: lượt lưu dựng sẵn (điểm 5, sắp chạm đất) báo đúng `pn:end` với điểm, lượt mới rơi xuống đất báo `pn:end` điểm 0, bỏ lượt trước khi bay thì không báo.
