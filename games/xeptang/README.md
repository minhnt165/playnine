# Xếp Tầng

Game Xếp Tầng (Tower Stack) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Một khối trượt qua lại phía trên tháp, lần lượt theo hai hướng chéo (trục x rồi trục z). Chạm hoặc nhấn `Space` để thả.
- Phần chìa ra ngoài mép tầng dưới bị cắt và rơi xuống; phần chồng lên thành tầng mới, khối kế tiếp chỉ rộng bằng phần đó.
- Thả lệch không quá 3 đơn vị (cạnh đế là 100; khối hẹp thì không quá 1/4 bề rộng) là **Hoàn hảo**: khối hít khớp đúng vị trí tầng dưới, không mất gì.
- Hoàn hảo liên tiếp: từ lần thứ 2 được thưởng +1 điểm mỗi lần; từ lần thứ 3 khối to lại 6 đơn vị theo hướng vừa trượt (không quá cỡ đế).
- Thả trượt hẳn khỏi tháp là hết ván (game vô tận, không có thắng).
- Điểm = số tầng xếp được + điểm thưởng hoàn hảo (mỗi tầng tối đa 2 điểm).
- Tốc độ trượt tăng chậm: 100 đơn vị/giây, thêm 2 mỗi tầng, trần 220 (từ tầng 60). Khối mới luôn hiện ra ngoài tháp (cách tâm 125) và phải trượt ít nhất 400 ms mới thả được.

Engine (`engine.js`) là hàm thuần, mô phỏng theo bước cố định 8 ms; vị trí khối là hàm của thời gian kể từ lúc khối hiện ra, nên ván tất định theo seed + thời điểm thả.

## Điều khiển

- Chạm bất kỳ đâu trên bàn chơi: bắt đầu / thả khối / chơi tiếp / chơi lại (hết ván phải chờ khoảng 1 giây mới chạm để chơi lại được, tránh bấm nhầm).
- Nút tạm dừng ở góc bàn chơi. Game tự tạm dừng khi trang bị ẩn, mất focus hoặc mở hộp thoại.
- Lần đầu mở game hiện hộp Cách chơi (ghi `guideSeen` vào cài đặt).

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `Space` / `Enter` | Bắt đầu, thả khối, chơi tiếp, chơi lại |
| `P` / `Esc` | Tạm dừng / chơi tiếp |
| `N` | Ván mới (đang chơi có điểm thì hỏi trước) |
| `Esc` | Đóng hộp thoại |

## Mode và ghi điểm trên cổng

Một mode `classic` (Cổ điển), metric `score_high`, 5 điểm mỗi ván.

- Bấm Chơi: `kit.sdk.start('classic')`; mở lại ván dở: `kit.sdk.start('classic', true)`.
- Hết ván: `kit.sdk.end({ mode: 'classic', won: false, score })`.
- Bỏ ván (nút Ván mới) khi đã có điểm hoặc đã chơi ≥ 1 giây: gửi `won: false` với điểm hiện có; chưa đạt thì không gửi gì.
- Luật chống gian lận: `min_duration_ms` 5000, `max_score_per_sec` 5. Đo bằng bot thả đúng giữa với sai lệch thời điểm kiểu người giỏi (σ 15 ms) trên 50 seed: cao nhất 2,37 điểm/giây (xét sau giây thứ 5); bot không sai lệch chút nào cũng chỉ đạt 3,38 (trần lý thuyết 2 điểm mỗi 568 ms ≈ 3,52 ở tốc độ trần). Ngưỡng 5 ≈ ×2 mức người giỏi.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-xeptang-settings-v1` | Cài đặt: giao diện, rung, `guideSeen` |
| `playnine-xeptang-stats-v1` | Thống kê: số ván, điểm cao nhất, chuỗi hoàn hảo dài nhất, tổng số tầng |
| `playnine-xeptang-save-v1` | Ván đang chơi dở (ghi sau mỗi lần thả và khi rời trang; mở lại ở trạng thái tạm dừng) |
| `playnine-xeptang-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Kiểm tra

```bash
node test.js
```

Test engine: cắt khối lệch trái / phải trên hai trục, khớp đúng, hít khớp trong dung sai, trượt hẳn; luật mọc lại và trần; điểm thưởng; tốc độ; khoảng thả tối thiểu; tất định theo seed + thời điểm thả; bot thả đúng chơi 300 tầng không thua; lưu / khôi phục và từ chối dữ liệu hỏng.

E2e trong cổng: `games/xeptang/e2e.spec.ts` (chạy cùng `npm run e2e` sau khi build + assemble).
