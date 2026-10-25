# Phản Xạ

Game Phản Xạ (Reflex, luyện ngắm và đo phản ứng) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

### Ngắm bắn 60 giây (mode `classic`)

- Mục tiêu tròn hiện ở vị trí ngẫu nhiên (theo hạt giống của ván), **co đều tới 0 rồi biến mất**. Chạm / nhấp trúng khi khoảng cách tới tâm ≤ bán kính **tại thời điểm chạm**.
- Điểm mỗi lần trúng = (10 + tới 45 điểm **chính xác** theo khoảng cách tới tâm so với cỡ lúc hiện + tới 45 điểm **tốc độ** theo phần đời còn lại) × **hệ số chuỗi**. Trúng tâm ngay khi hiện = 100.
- Chuỗi trúng liên tiếp: ×1 cho 5 lần đầu, ×2 từ lần thứ 6, ×3 từ lần 11, ×4 từ lần 16, ×5 từ lần 21.
- **Trượt** (chạm ra ngoài mọi mục tiêu, kể cả khi sân trống) hoặc để mục tiêu **biến mất** thì chuỗi về 0. Không có điểm âm.
- Nhịp tăng dần trong 60 giây: bán kính lúc hiện 9,5 → 5,5 đơn vị, tuổi thọ 1500 → 800 ms, đợt sau chậm nhất sau 1000 → 550 ms (dọn sạch sân thì đợt sau tới sớm sau 260 → 160 ms), từ giây 15 có đợt **hai mục tiêu cùng lúc** (12% → 50%), tối đa 3 mục tiêu trên sân.
- Hết 60 giây là hết ván; bảng tổng kết: điểm, độ chính xác (trúng / số lần chạm), thời gian phản ứng trung bình (từ lúc hiện tới lúc trúng), chuỗi dài nhất.

### Đo phản ứng (mode `reaction`)

- Màn **đỏ** → chờ ngẫu nhiên 1,5–4 s → **xanh**: chạm (hoặc `Space`) càng nhanh càng tốt. Đo 5 lần; kết quả là thời gian trung bình.
- **Phạm lỗi**: chạm khi còn đỏ, hoặc dưới 100 ms sau khi xanh (đoán trước). Lần đó **đo lại** và **cộng 50 ms** vào trung bình. Chọn "làm lại + phạt" vì: chỉ làm lại thì người chơi đoán bừa không mất gì; chỉ phạt mà không làm lại thì một lần đoán trúng may mắn vẫn được tính.
- Xanh quá 1,5 s không chạm: ghi "chậm quá" = 1500 ms.
- Tạm dừng / ẩn trang khi đang đỏ hoặc xanh: lần đó đo lại, không tính lỗi.
- Thời gian đo từ **khung hình đầu tiên vẽ màu xanh** tới `event.timeStamp` của cú chạm / phím.

### Sân và thời gian

- Sân ngắm bắn tính bằng đơn vị: cạnh ngắn 100, cạnh dài 100–160 theo tỉ lệ khung lúc bắt đầu ván (ghi trong ván lưu). Ở 390×844 mục tiêu nhỏ nhất (cuối ván) ≈ 40 px, ở 844×390 ≈ 41 px, ở 1280×800 ≈ 70 px.
- Engine (`engine.js`) mô phỏng theo sự kiện đúng tới từng ms: cùng hạt giống + cùng chuỗi (thời điểm, tọa độ) chạm thì cùng kết quả, bất kể bước đồng hồ. App tiến đồng hồ theo bước cố định 10 ms (dt tối đa 100 ms khi tab vừa quay lại) và quy `event.timeStamp` của cú chạm ra giờ trong ván.

## Điều khiển

| Thao tác | Chức năng |
| --- | --- |
| Chạm / nhấp chuột | Bắn mục tiêu (ngắm bắn), chạm khi xanh (đo phản ứng) |
| `Space` | Chạm khi xanh (đo phản ứng); bắt đầu / chơi tiếp / chơi lại ở các màn chờ |
| `Enter` | Bắt đầu / chơi tiếp / chơi lại |
| `P` | Tạm dừng / chơi tiếp |
| `Esc` | Tạm dừng; đóng hộp thoại |
| `N` | Ván mới (đang chơi dở thì hỏi trước) |

Game tự tạm dừng khi trang ẩn hoặc mở hộp thoại. Rung nhẹ khi trúng (tắt được trong Cài đặt). Lần đầu mở hiện hướng dẫn (`guideSeen` trong `settings`).

## Ghi điểm trên cổng

`metric: score_high`, `points` 5, hai mode:

| Mode | Điểm gửi | Luật chống gian lận | Điểm tham gia |
| --- | --- | --- | --- |
| `classic` (Ngắm bắn 60s) | tổng điểm | `min_duration_ms` 58000, `max_score` 60000, `max_score_per_sec` 1300 | 5 |
| `reaction` (Đo phản ứng) | 1000 − trung bình (ms), không âm | `min_duration_ms` 11000, `max_score` 900 | 2 |

- Ván ngắm bắn luôn dài 60 giây, nên `min_duration_ms` 58000 (chừa 2 s cho trễ mạng) và `max_score` là chặn chính.
- Bot đo trên 300 hạt giống (sân 140×100 và 100×160), phản ứng + thời gian di chuột theo luật Fitts, sai số vị trí Gauss theo bán kính:
  - bot giỏi (phản ứng 150–200 ms, sai số 0,3 × bán kính): trung bình ≈ 32 800, cao nhất 38 761, tốc độ điểm cao nhất sau giây 5 ≈ 647/s;
  - bot rất giỏi (150–170 ms, sai số 0,2): cao nhất 46 956; bot "siêu người" (150 ms, di chuột rất nhanh, sai số 0,1): cao nhất 58 097;
  - người chơi trung bình (250–320 ms, sai số 0,45): ≈ 8 000.
  - `max_score` 60000 ≈ 1,55 × bot giỏi (và trên cả bot siêu người); `max_score_per_sec` 1300 ≈ 2 × 647. Bot bấm ngay lập tức (gian lận) đạt ≈ 120 000 và bị chặn.
- Đo phản ứng: trần 900 vì dưới 100 ms là đoán trước; ván ngắn nhất có thể = 5 × (1,5 s + 0,1 s) + 4 × 1 s = 12 s nên `min_duration_ms` 11000. Điểm tham gia 2 (ván chỉ ~15 giây).
- Ván mới: `kit.sdk.start(mode)`; mở lại ván ngắm bắn lưu dở: `kit.sdk.start('classic', true)`.
- Hết ván: `kit.sdk.end({ mode, won: false, score, assisted: false })` (game không có thắng / thua).
- Bỏ ván khi đã chạm hoặc đã chơi ≥ 1 giây: gửi `won: false` với điểm hiện có (đo phản ứng chưa xong: 0); chưa thì không gửi gì.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-phanxa-settings-v1` | Cài đặt: giao diện, chế độ đang chọn (`mode`), rung, đã xem hướng dẫn (`guideSeen`) |
| `playnine-phanxa-stats-v1` | Thống kê: số ván, điểm cao nhất, chuỗi dài nhất, số lần trúng / chạm; số lần đo và phản ứng nhanh nhất |
| `playnine-phanxa-save-v1` | Ván ngắm bắn đang dở (lưu khi tạm dừng / rời trang; mở lại ở trạng thái tạm dừng). Đo phản ứng ngắn nên không lưu |
| `playnine-phanxa-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Kiểm tra

```bash
node test.js
```

Test engine: cỡ sân, sinh mục tiêu tất định (trong sân, không chồng nhau, mọi mục tiêu đều bắn trúng được), vòng đời co / biến mất, trúng / trượt theo bán kính lúc chạm, điểm chính xác + tốc độ + chuỗi, nhịp tăng dần, hết 60 giây, đo phản ứng (chạm sớm, đoán trước < 100 ms, quá chậm, trung bình + phạt, ngắt giữa chừng), tất định, lưu / khôi phục và từ chối dữ liệu hỏng, và bot ngắm giỏi không vượt ngưỡng trong `game.json`.

`e2e.spec.ts` (chạy trong cổng cùng e2e chung): ván ngắm bắn hết giờ báo `pn:end` đúng điểm, bỏ ván giữa chừng, và đo phản ứng đủ 5 lần báo `pn:end` mode `reaction`.
