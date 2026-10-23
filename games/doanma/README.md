# Đoán Mã

Game Đoán Mã (Code Breaker) của PlayNine: phá mã màu bí mật của máy trong số lượt cho phép, càng nhanh càng tốt. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Máy giấu một mã gồm các chốt màu. Người chơi điền đủ một hàng rồi bấm **Kiểm tra**.
- Mỗi lần đoán được chấm bằng các chấm nhỏ (không xếp theo thứ tự chốt):
  - **chấm đặc**: một chốt đúng màu, đúng chỗ;
  - **chấm rỗng**: một chốt đúng màu nhưng sai chỗ.
- Khi có màu lặp, mỗi chốt của mã chỉ được ghép một lần: số chấm đặc + rỗng của một màu không vượt quá số lần màu đó có trong mã lẫn trong lần đoán (ví dụ mã `đỏ xanh vàng tím`, đoán `đỏ đỏ đỏ đỏ` chỉ được một chấm đặc).
- Đoán trúng cả mã là thắng; hết lượt thì thua và mã được lật ra.
- Mỗi màu có thêm ký hiệu riêng (tam giác, vuông, sao, thoi, tròn, chữ thập, tim, trăng khuyết) nên chơi được mà không cần phân biệt màu.
- Đồng hồ chạy từ chốt đầu tiên được điền.

## Điều khiển

- Chạm một màu ở bảng màu: điền vào ô trống đầu tiên của hàng đang nhập.
- Chạm một chốt ở hàng đang nhập: xóa chốt đó. Nút ⌫: xóa chốt cuối.
- **Kiểm tra**: nộp hàng (chỉ bấm được khi hàng đầy). Ván xong thì nút thành **Chơi lại**.
- Mức Dễ không cho điền một màu hai lần trong cùng hàng (mã không bao giờ lặp màu), màu đã dùng bị mờ đi.

## Mức độ (mode)

Chọn trong Cài đặt. Ván chưa điền chốt nào (hoặc đã xong) thì đổi là chia ván mới ngay; ván đang dở thì áp dụng từ ván sau.

| Mode | Chốt | Màu | Lặp màu | Lượt |
| --- | --- | --- | --- | --- |
| `easy` (Dễ) | 4 | 6 | không | 10 |
| `hard` (Khó) | 5 | 8 | có | 12 |

Mã sinh bằng PRNG seed được (mulberry32); `test.js` chạy solver "đoán mã còn khớp" để chứng minh mọi mã Dễ (360 mã) và 300 mã Khó đều phá được trong số lượt cho phép.

## Báo ván cho cổng

- Metric `time_low` (thời gian phá mã thấp nhất), điểm game 4; mode `easy` 3 điểm, `hard` 6 điểm.
- Chia ván mới: `kit.sdk.start(mode)`; mở lại ván lưu dở: `kit.sdk.start(mode, true)`.
- Phá được mã: `kit.sdk.end({ mode, won: true, timeMs, assisted: false })`; hết lượt: `won: false`.
- Bỏ ván (nút Ván mới) khi đã điền ít nhất một chốt: hỏi xác nhận rồi gửi `won: false`; chưa điền chốt nào thì không gửi gì.
- Luật chống gian lận `min_time_ms`: Dễ 1500, Khó 1900. Đồng hồ chạy từ chốt đầu tiên, nên phá mã ngay lần đoán đầu cần thêm 3 (Dễ) / 4 (Khó) lần chạm chốt và một lần bấm Kiểm tra; khoảng 0,4 s mỗi thao tác là 1,6 s / 2,0 s, ngưỡng đặt thấp hơn một chút.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-doanma-settings-v1` | Cài đặt (giao diện, `mode`) |
| `playnine-doanma-stats-v1` | Thống kê: số ván, số ván phá được, kỷ lục từng mode |
| `playnine-doanma-save-v1` | Ván đang chơi dở (`{ v, game, elapsed }`; phản hồi được chấm lại khi khôi phục) |
| `playnine-doanma-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `1`–`6` (Dễ) / `1`–`8` (Khó) | Điền màu |
| `Backspace` / `Delete` | Xóa chốt cuối |
| `Enter` | Kiểm tra (ván xong: chơi lại) |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test riêng trong cổng: `e2e.spec.ts` (thắng, thua khi hết lượt, bỏ ván) chạy cùng `npm run e2e` sau khi build và ghép.
