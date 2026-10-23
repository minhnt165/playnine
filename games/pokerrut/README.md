# Poker Rút

Game Poker Rút (Video Poker, luật Jacks or Better) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (kit + bộ bài tây `cards.js` / `cards.css`, xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

Một **phiên** gồm 25 tay, vốn 100 xu. Mỗi tay:

1. Đặt cược 1–5 xu (**Cược 1** tăng 1 xu, quá 5 thì về 1; **Cược tối đa** đặt 5 xu và chia luôn), bấm **Chia**: tiền cược bị trừ, 5 lá được chia từ một bộ 52 lá **mới xáo** (mỗi tay một bộ, có hạt giống).
2. Chạm những lá muốn giữ (nhãn **GIỮ**, chạm lần nữa để bỏ), bấm **Rút**: các lá không giữ được thay bằng lá kế tiếp của **cùng bộ bài** đó (lá đã bỏ không quay lại).
3. Bài cuối trả thưởng theo bảng (đã gồm tiền cược, nhân với số xu cược):

| Tay | Mỗi xu | Cược 5 xu |
| --- | --- | --- |
| Thùng phá sảnh lớn (10-J-Q-K-A cùng chất) | 250 | **4000** (800 / xu) |
| Thùng phá sảnh | 50 | 250 |
| Tứ quý | 25 | 125 |
| Cù lũ | 9 | 45 |
| Thùng | 6 | 30 |
| Sảnh | 4 | 20 |
| Sám cô | 3 | 15 |
| Thú (hai đôi) | 2 | 10 |
| Đôi J trở lên (J, Q, K, A) | 1 | 5 |

- Sảnh A thấp (A-2-3-4-5) được tính; sảnh không vòng qua A (Q-K-A-2-3 không là sảnh). Đôi 2…10 không ăn.
- Đây là bảng 9/6 "trả đủ": chơi tối ưu với cược 5 xu, tỉ lệ trả là **99,54%**.
- Còn ít xu hơn mức cược thì cược tự hạ xuống số xu còn lại. Phiên kết thúc sau 25 tay hoặc khi hết xu. Kết thúc với **hơn 100 xu** là thắng.

Bảng trả luôn hiện trên màn: cột của mức cược hiện tại sáng lên, hàng của bài đang cầm sáng nhẹ, hàng vừa thắng nhấp nháy rồi giữ nền vàng; các lá làm nên tay ăn tiền có viền hổ phách.

### Gợi ý giữ bài (Cài đặt)

Bật **Gợi ý giữ bài** thì mỗi tay tô sáng cách giữ có kỳ vọng cao nhất (kèm nút "Giữ theo gợi ý"). Kỳ vọng được **tính chính xác** cho cả 32 cách giữ (không phải bảng chiến thuật gần đúng), theo đúng mức cược đang đặt (thùng phá sảnh lớn 250 hay 800 / xu). Phiên có dùng gợi ý (bật khi đang có tay chia ra) được đánh dấu **Trợ giúp** và gửi `assisted: true`.

## Điều khiển

- Chuột / chạm: chạm lá để giữ, nút **Cược 1**, **Cược tối đa**, **Chia / Rút**.
- Lá lật khi chia và khi rút (lá giữ đứng yên); bật "giảm chuyển động" thì lá đổi ngay, bảng trả không nhấp nháy.
- Màn hình dọc: bảng trả trên, bài và nút dưới. Màn hình ngang thấp: bảng trả bên trái, bài và nút bên phải.

## Ghi điểm trên cổng

- Metric `score_high` (số xu cuối phiên), một mode `classic` (Cổ điển), 5 điểm mỗi ván.
- Phiên mới: `kit.sdk.start('classic')`; mở lại phiên lưu dở: `kit.sdk.start('classic', true)`.
- Hết 25 tay hoặc hết xu: `kit.sdk.end({ mode: 'classic', won: xu > 100, score: xu, assisted })`.
- Bỏ phiên đã chia ít nhất một tay: `won: false` kèm số xu hiện có (tay đang dở thì tiền cược đã bị trừ); chưa chia tay nào thì không gửi gì.
- Luật chống gian lận:
  - `max_score` **99975** = 100 + 25 × (4000 − 5): lãi lớn nhất của một tay là cược 5 xu ra thùng phá sảnh lớn (4000 − 5 = 3995; tay khác hoặc cược nhỏ hơn đều lãi ít hơn), phiên có đúng 25 tay và bắt đầu với 100 xu. Đạt được khi cả 25 tay đều ra thùng phá sảnh lớn (có test).
  - `min_duration_ms` 15000: 25 tay, mỗi tay một lần chia + một lần rút. Người bật giảm chuyển động (lá đổi ngay) và bấm liên tục có thể xong phiên dưới 30 giây, nên ngưỡng đặt 15 giây để không từ chối nhầm phiên thật.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-pokerrut-settings-v1` | Cài đặt (giao diện, gợi ý giữ bài) |
| `playnine-pokerrut-stats-v1` | Thống kê: số phiên, phiên thắng, kỷ lục, tổng xu + số phiên xong (để tính trung bình), số tay, số lần ra thùng phá sảnh lớn |
| `playnine-pokerrut-save-v1` | Phiên đang chơi dở: xu, cược, số tay, lá đang cầm + lá giữ, trạng thái PRNG. Lưu ngay sau mỗi lần chia / rút nên tải lại trang không chia lại được. Không lưu bộ bài: tay đang chơi được dựng lại từ trạng thái PRNG trước lần xáo và phải khớp đúng bài đã lưu (không khớp là dữ liệu hỏng). |
| `playnine-pokerrut-summary-v1` | Tóm tắt cho thẻ game trên cổng (kỷ lục, trung bình, tay đang chơi) |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `Space` / `Enter` | Chia / Rút (khi đang Tab tới một nút thì bấm nút đó) |
| `1` – `5` | Giữ / bỏ giữ lá thứ 1–5 |
| `B` | Cược 1 (xoay 1 → 5 → 1) |
| `M` | Cược tối đa và chia |
| `N` | Phiên mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra engine

```bash
node test.js
```

Phủ: chấm đủ 9 loại tay và case biên (sảnh A thấp, thùng phá sảnh lớn vs thùng phá sảnh, thú vs cù lũ, đôi nhỏ không ăn, sảnh vòng không tính), tiền trả ở mọi mức cược kể cả 4000 khi cược 5, chia / rút cùng một bộ bài không trùng lá (300 tay), giữ lá, hạ cược khi ít xu, hết 25 tay, hết xu, đánh dấu trợ giúp, lưu / khôi phục (rút sau khi khôi phục ra đúng bài cũ) và từ chối dữ liệu hỏng, `MAX_SCORE`, kỳ vọng nhanh khớp duyệt hết lá rút, các tình huống chiến thuật kinh điển, Monte Carlo 20000 tay với cách giữ tối ưu (ra khoảng 99,5–100%, ngưỡng ±2%) và 400 phiên mô phỏng. Chạy khoảng 15–20 giây.

Kiểm chứng thêm (không nằm trong test vì chạy khoảng 1 phút): duyệt đủ 134.459 lớp tay theo hoán vị chất (đại diện cho cả 2.598.960 tay) với `bestHold` ra đúng **99,5439%**, khớp tỉ lệ trả lý thuyết của bảng 9/6.

Test trong cổng: `games/pokerrut/e2e.spec.ts` (phiên xong báo `pn:end` kèm số xu, thắng khi > 100; bỏ phiên sau khi chia báo thua với số xu hiện có; chưa chia thì không báo).
