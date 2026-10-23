# Xí Ngầu

Game Xí Ngầu (Dice Poker, họ game "Yacht") của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

Chơi một mình, 13 vòng. Mỗi vòng:

1. Lắc 5 xúc xắc, tối đa **3 lần**. Giữa các lần lắc, chạm viên nào để **giữ** viên đó (chạm lần nữa để bỏ giữ); lần lắc đầu của vòng luôn lắc cả 5 viên.
2. Ghi bộ xúc xắc vào **một ô trống** trên bảng điểm. Mỗi ô dùng đúng một lần; ô không đạt vẫn được ghi 0 (gạch ô).

Bảng điểm hiện trước số điểm từng ô trống sẽ nhận với bộ xúc xắc đang có, cùng tổng phần trên, phần dưới và tổng ván.

| Ô | Điều kiện | Điểm |
| --- | --- | --- |
| Mặt 1 … Mặt 6 | – | Tổng các viên đúng mặt đó |
| Thưởng phần trên | Tổng phần trên ≥ 63 | +35 |
| Bộ ba | Ít nhất 3 viên giống nhau | Tổng cả 5 viên |
| Tứ quý | Ít nhất 4 viên giống nhau | Tổng cả 5 viên |
| Cù lũ | Đúng 3 viên một mặt + 2 viên một mặt khác | 25 |
| Sảnh nhỏ | 4 số liên tiếp (viên trùng không làm đứt sảnh) | 30 |
| Sảnh lớn | 5 số liên tiếp | 40 |
| Ngũ quý | Cả 5 viên giống nhau | 50 |
| Cơ hội | Bộ nào cũng được | Tổng cả 5 viên |

**Ngũ quý thêm và joker** (theo luật chuẩn, dạng joker bắt buộc):

- Lắc ra ngũ quý khi ô Ngũ quý đã ghi 50: **+100** mỗi lần (không giới hạn số lần, tối đa 12 trong một ván).
- Khi ô Ngũ quý đã dùng (50 hay 0), ngũ quý là **joker**: phải ghi vào ô cùng mặt ở phần trên nếu ô đó còn trống; không thì ghi vào ô trống bất kỳ ở phần dưới, cù lũ / sảnh nhỏ / sảnh lớn được đủ 25 / 30 / 40; phần dưới cũng đầy thì ghi 0 vào một ô trống ở phần trên. Ô gạch 0 thì vẫn có joker nhưng không có +100.
- Ô Ngũ quý còn trống thì ngũ quý chỉ là bộ thường: không phải cù lũ, không phải sảnh (ghi vào Cù lũ được 0).

Ván kết thúc sau khi điền đủ 13 ô. Đạt **250 điểm** trở lên là thắng ván (pháo giấy, tính vào "Ván 250+"). Điểm cao nhất có thể là **1575**.

Ghi nhầm ô thì bấm **Hoàn tác** được cho tới lần lắc kế tiếp (không lộ thêm thông tin ngẫu nhiên nào, nên không thành mẹo). Ô cuối cùng của ván thì không hoàn tác được.

## Điều khiển

- Chuột / chạm: chạm xúc xắc để giữ, nút **Lắc** (chấm bên cạnh là số lần lắc còn lại), chạm ô trên bảng để ghi điểm.
- Màn hình dọc: bảng điểm ở giữa, khay xúc xắc + nút lắc ở dưới (gần ngón cái). Màn hình ngang thấp: khay bên trái, bảng bên phải.
- Lắc có hiệu ứng xúc xắc bay lộn rồi chạm bàn; bật "giảm chuyển động" thì xúc xắc ra kết quả ngay.

## Ghi điểm trên cổng

- Metric `score_high`, một mode `classic` (Cổ điển), 5 điểm mỗi ván (ván thắng không trợ giúp được x2 theo luật chung của cổng).
- Chia ván mới: `kit.sdk.start('classic')`; mở lại ván lưu dở: `kit.sdk.start('classic', true)`.
- Hết 13 ô: `kit.sdk.end({ mode: 'classic', won: điểm >= 250, score: điểm, assisted: false })`.
- Bỏ ván đã lắc ít nhất một lần: `won: false` kèm điểm hiện có; chưa lắc lần nào thì không gửi gì.
- Luật chống gian lận: `min_duration_ms` 30000 (13 vòng, mỗi vòng ít nhất một lần lắc có hiệu ứng + một lần ghi ô: ván thật dưới 30 giây gần như chỉ có khi bấm bừa), `max_score` 1575 = 340 (mọi ô tối đa: 105 phần trên + 235 phần dưới) + 35 (thưởng phần trên) + 12 × 100 (ngũ quý thêm; ô Ngũ quý phải giữ 50 trước nên chỉ còn 12 ô). Đạt được bằng 13 lần ngũ quý ghi theo thứ tự joker (có test).
- Mốc thắng 250: bot đơn giản trong `test.js` trung bình khoảng 196 điểm và chỉ khoảng 14% ván đạt 250; người chơi tốt đạt thường xuyên hơn, nên "thắng" là mục tiêu có kỹ năng chứ không phải điểm tham gia.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-xingau-settings-v1` | Cài đặt (giao diện) |
| `playnine-xingau-stats-v1` | Thống kê: đã chơi, ván 250+, kỷ lục, tổng điểm + số ván xong (để tính trung bình), số ngũ quý, số lần có thưởng phần trên |
| `playnine-xingau-save-v1` | Ván đang chơi dở (gồm trạng thái PRNG: lưu ngay sau mỗi lần lắc, tải lại trang không lắc lại được) |
| `playnine-xingau-summary-v1` | Tóm tắt cho thẻ game trên cổng (kỷ lục, trung bình, vòng đang chơi) |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `Space` / `R` | Lắc |
| `1` – `5` | Giữ / bỏ giữ viên thứ 1–5 |
| `Tab` rồi `Enter` | Chọn ô trên bảng điểm để ghi |
| `U` / `Ctrl+Z` | Hoàn tác lần ghi ô vừa rồi |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra engine

```bash
node test.js
```

Phủ: điểm từng ô và case biên (sảnh có viên trùng, cù lũ và ngũ quý, joker ba bước, ô Ngũ quý gạch 0), thưởng phần trên, tổng, giới hạn 3 lần lắc, giữ xúc xắc, hết ván sau 13 ô, `MAX_SCORE` (chặn trên + một ván đạt đúng 1575), PRNG seed được và phân bố đều, lưu / khôi phục và từ chối dữ liệu hỏng, mô phỏng 3000 ván bằng bot (in ra phân bố điểm).

Test trong cổng: `games/xingau/e2e.spec.ts` (ván xong báo `pn:end` kèm điểm, thắng khi ≥ 250; bỏ ván sau khi lắc báo thua; chưa lắc thì không báo).
