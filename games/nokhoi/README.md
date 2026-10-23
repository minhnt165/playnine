# Nổ Khối

Game Nổ Khối (Block Pop) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Bàn 10 cột × 12 hàng, khối 4 màu sinh ngẫu nhiên (bàn nào cũng có ít nhất một nước đi).
- Nổ một nhóm từ **2 khối** cùng màu nối nhau theo cạnh (không tính đường chéo).
- Nhóm **n** khối được **(n − 2)²** điểm: 2 khối được 0, 3 khối được 1, 5 khối được 9, 12 khối được 100.
- Khối phía trên rơi xuống chỗ trống; cột trống thì các cột bên phải dồn sang trái.
- Hết nhóm 2 khối là hết ván. Khối còn lại **không bị trừ điểm**.
- Dọn sạch bàn được thưởng **+1000** điểm (ván đó tính là thắng).
- Không có đi lại.

## Điều khiển

- **Chuột:** trỏ vào khối để sáng cả nhóm và hiện số điểm, bấm để nổ.
- **Cảm ứng:** chạm lần đầu chọn nhóm và hiện số điểm, chạm lần nữa vào nhóm đó để nổ; chạm nhóm khác thì chọn nhóm đó. Cài đặt **Nổ bằng một chạm** cho nổ ngay ở lần chạm đầu.
- **Bàn phím:** mũi tên di chuyển con trỏ (nhóm dưới con trỏ sáng lên kèm điểm), `Space` / `Enter` để nổ.
- Khối rơi và cột dồn có hiệu ứng trượt; bật giảm chuyển động (`prefers-reduced-motion`) thì đổi chỗ tức thì, không có điểm bay lên.

## Mode và ghi điểm trên cổng

Một mode `classic` (Cổ điển), metric `score_high` (điểm cao nhất), 5 điểm tham gia mỗi ván.

- Ván mới: `kit.sdk.start('classic')`; mở lại ván lưu dở: `kit.sdk.start('classic', true)`.
- Hết nước: `kit.sdk.end({ mode: 'classic', won, score, assisted: false })`, `won` là `true` chỉ khi đã dọn sạch bàn (điểm đã gồm 1000 thưởng).
- Bỏ ván đã nổ ít nhất một lần (bấm Ván mới rồi xác nhận): gửi `won: false` với điểm hiện tại. Chưa nổ lần nào thì không gửi gì.
- Luật chống gian lận: `min_duration_ms` 5000, `max_score_per_sec` 600. Ngưỡng điểm/giây đo bằng bot nổ mỗi 0,3 giây trên 20.000 seed: bot tham lam (luôn nổ nhóm lớn nhất) đạt tối đa 246 điểm/giây, bot chơi kiểu người giỏi (nổ màu phụ trước để gom màu chính) đạt 370 điểm/giây; 600 chừa biên rộng mà vẫn chặn điểm bịa (bàn 120 khối một màu cũng chỉ được 14.924 điểm).

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-nokhoi-settings-v1` | Cài đặt: giao diện, `singleTap` (nổ bằng một chạm) |
| `playnine-nokhoi-stats-v1` | Thống kê: `played`, `cleared` (số lần sạch bàn), `best`, `total` (tổng điểm để tính trung bình) |
| `playnine-nokhoi-save-v1` | Ván đang chơi dở `{ v: 1, game }` (`game` là `toJSON` của engine: các cột khối `[id, màu]` từ dưới lên, điểm, số lần nổ); chỉ lưu khi đã nổ ít nhất một lần và chưa hết ván |
| `playnine-nokhoi-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `→` `↓` | Di chuyển con trỏ |
| `Space` / `Enter` | Nổ nhóm dưới con trỏ |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test engine phủ sinh bàn theo seed (kích thước, màu, luôn có nước đi trên 500 seed), tìm nhóm, nổ / rơi / dồn cột, công thức điểm, thưởng sạch bàn, hết ván, bot tham lam chơi hết 300 ván, lưu / khôi phục và từ chối dữ liệu hỏng. Test Playwright trong cổng nằm ở `e2e.spec.ts` (chạy cùng `npm run e2e` sau khi build và ghép).
