# Xếp Khối

Game Xếp Khối (Block Fit) của PlayNine: xếp khối vào bàn 10×10, lấp kín hàng hoặc cột để xóa. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Bàn 10×10. Khay luôn có ba khối ngẫu nhiên: ô đơn, thanh thẳng dài 2–5 (ngang / dọc), vuông 2×2 và 3×3, góc 3 ô và góc lớn 5 ô, chữ L, T, S. Khối **không xoay**: mỗi hướng là một khối riêng.
- Đặt khối vào chỗ trống trên bàn. Hàng hoặc cột nào đầy thì được xóa (hàng và cột đầy cùng lúc thì xóa hết, ô giao chỉ xóa một lần).
- Đặt hết ba khối thì có ba khối mới.
- **Hết chỗ**: không khối nào còn lại trong khay đặt vừa bất kỳ đâu trên bàn thì ván kết thúc. Bàn rung, mờ đi, hiện băng "Hết chỗ", khối không vừa trong khay có viền đỏ đứt; lát sau mở hộp kết quả.
- Điểm: +1 mỗi ô đặt xuống; xóa đường được thêm `10 × L × L` với L là số đường xóa cùng lúc (1 đường +10, 2 đường +40, 3 đường +90…).
- Sinh khối bằng PRNG seed được (mulberry32, trạng thái lưu trong ván). Bộ đầu trên bàn trống luôn đặt được hết (test chạy solver trên 300 seed); mỗi bộ mới được rút lại tới 30 lần nếu cả ba khối đều không vừa, cuối cùng thay bằng ô đơn, nên bộ mới luôn có ít nhất một khối đặt được.

## Điều khiển

- **Kéo thả** (chuột / chạm): kéo khối từ khay vào bàn. Trên điện thoại khối nổi phía trên ngón tay để không bị che. Bóng mờ cho thấy chỗ khối sẽ nằm, hàng / cột sắp xóa sáng lên. Thả ở chỗ không hợp lệ thì khối bay về khay.
- **Chạm rồi chạm**: chạm khối trong khay để chọn, rồi chạm ô trên bàn (ô đó là giữa khối). Với chuột, rê trên bàn để ngắm. Chạm lại khối đang chọn để bỏ chọn.
- **Bàn phím**: xem bảng phím tắt.

## Mode và ghi điểm trên cổng

Một mode `classic` (Cổ điển), metric `score_high` (điểm cao nhất), 5 điểm tham gia.

- Ván mới: `kit.sdk.start('classic')`; mở lại ván lưu dở: `kit.sdk.start('classic', true)`.
- Hết chỗ: `kit.sdk.end({ mode: 'classic', won: false, score, assisted: false })`.
- Bỏ ván đã đặt ít nhất một khối (nút Ván mới → xác nhận): gửi `won: false` với điểm hiện có. Chưa đặt khối nào thì không gửi gì.
- Luật chống gian lận: `min_duration_ms` 5000, `max_score_per_sec` 40. Ngưỡng đo bằng bot tham lam (1000 seed, mỗi lần đặt 1 s, tốc độ = điểm / thời gian từ lúc bắt đầu, chỉ xét từ giây thứ 5): cao nhất 17,7 điểm/s, p99 12,6, trung vị 8. Đặt 40 (gấp khoảng 2,3 lần) để người chơi nhanh tay hoặc ăn combo liên tục vẫn qua.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-xepkhoi-settings-v1` | Cài đặt (giao diện) |
| `playnine-xepkhoi-stats-v1` | Thống kê: số ván, kỷ lục, tổng điểm (tính trung bình), tổng số đường đã xóa |
| `playnine-xepkhoi-save-v1` | Ván đang chơi dở (`{ v: 1, game }`, `game` là `toJSON` của engine) |
| `playnine-xepkhoi-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng (sai kích thước, màu lạ, khối lạ, hàng / cột đầy…) bị bỏ qua và chia ván mới.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `1` / `2` / `3` | Chọn khối trong khay |
| `←` `↑` `→` `↓` | Di chuyển khối đang chọn (chưa chọn thì chọn khối đầu tiên còn chỗ) |
| `Enter` / `Space` | Đặt khối |
| `Esc` | Bỏ chọn / hủy kéo; đóng hộp thoại |
| `N` | Ván mới |

## Kiểm tra

```bash
node test.js
```

Test engine phủ bộ khối, PRNG, đặt khối, xóa hàng / cột, điểm combo, chia bộ mới, thua, bộ đầu luôn đặt được (solver), lưu / khôi phục và từ chối dữ liệu hỏng. `e2e.spec.ts` chạy trong cổng: ván lưu dựng sẵn hết chỗ sau một nước báo đúng `pn:end` kèm điểm, bỏ ván đã chơi báo `won: false`, ván chưa đặt khối thì không báo.
