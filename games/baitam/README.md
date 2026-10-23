# Bài Tám

Game Bài Tám (Crazy Eights) của PlayNine: bạn đấu ba người máy, đánh lá cùng chất hoặc cùng bậc, lá 8 đổi chất tùy ý, hết bài trước để ăn điểm bài còn trên tay đối thủ. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (kit + bộ bài `cards.js` / `cards.css`, xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo trận qua SDK.

## Luật chơi

Crazy Eights chuẩn, 4 người, bộ 52 lá. Bạn ngồi dưới, ba máy Tây (trái), Bắc (trên), Đông (phải); đi theo chiều kim đồng hồ.

- Mỗi người 5 lá. Lật một lá mở chồng bài đã đánh; lật ra lá 8 thì trộn lá đó lại vào nọc và lật lá khác.
- Tới lượt: đánh một lá **cùng chất** hoặc **cùng bậc** với lá trên cùng, hoặc **lá 8 bất kỳ** rồi gọi chất người tiếp theo phải theo.
- Không đánh được, hoặc không muốn đánh: **rút một lá**. Lá vừa rút hợp lệ thì được đánh ngay (hoặc bỏ lượt); không hợp lệ thì bỏ lượt. Mỗi lượt rút tối đa một lá.
- Hết nọc: trộn chồng bài đã đánh (trừ lá trên cùng) làm nọc mới. Nọc rỗng và chồng chỉ còn một lá thì không rút được: ai không có lá đánh được thì bỏ lượt (luôn có người cầm lá 8 nên ván không bị kẹt).
- Ai hết bài trước thắng ván và ăn điểm bài còn trên tay ba người kia: **8 = 50**, K / Q / J = 10, A = 1, còn lại theo số.
- Trận chơi tới mốc 50 / 100 (mặc định) / 200 điểm. Chỉ người thắng ván được cộng điểm, nên mỗi lần chỉ một người có thể chạm mốc: **bạn chạm trước là thắng trận**, máy chạm trước là thua.
- Ván 1 bạn đi trước; mỗi ván sau người chia xoay sang trái, người bên trái người chia đi trước.

Engine (`engine.js`) là hàm thuần: `newMatch`, `isLegal`, `legalPlays`, `canDraw`, `canPass`, `play`, `draw`, `pass`, `nextRound`, `apply`, `aiAction`, `bestSuit`, `toJSON` / `fromJSON`. Lá lưu bằng id của `cards.js` (`'AS'`, `'10H'`); xáo bài bằng PRNG mulberry32 của `cards.js`, trạng thái PRNG nằm trong ván lưu nên tải lại trang vẫn rút đúng lá cũ.

### Máy

- **Dễ**: đánh ngẫu nhiên một lá hợp lệ (lá 8 thì gọi chất ngẫu nhiên); không có lá thì rút, rút được lá hợp lệ thì đánh.
- **Khó**: giữ lá 8 tới khi không còn lá nào khác đánh được; chấm điểm từng lá: đánh xong còn nhiều lá cùng chất mới thì tốt, chất mà người kế tiếp đã lộ là không theo được (họ phải rút) thì cộng thêm; khi có đối thủ chỉ còn 1–2 lá thì ưu tiên xả lá điểm cao. Lá 8 gọi chất mình có nhiều nhất.
- Trong test, một máy Khó đấu ba máy Dễ thắng khoảng 46% số trận (máy Dễ ở cùng ghế khoảng 24%).

## Điều khiển

- Bài trên tay xòe ở dưới; tới lượt bạn thì lá đánh được **nhô lên** (viền hổ phách), lá khác tối đi. Chạm lá nhô lên để đánh; lá 8 mở hộp chọn chất (gợi ý chất bạn có nhiều nhất).
- Chạm nọc hoặc nút **Rút** để rút; rút rồi thì nút thành **Bỏ lượt**. Lá vừa rút không đánh được thì game tự bỏ lượt sau một nhịp.
- Máy cầm lá úp, huy hiệu tím là số lá; dòng trạng thái trên bàn nói ai vừa đánh gì, gọi chất gì. Huy hiệu tròn cạnh chồng bài là chất đang phải theo (viền hổ phách khi vừa được gọi bằng lá 8). Mở hộp thoại thì máy tạm dừng.
- Hết ván hiện bảng điểm: bài còn lại của từng người, điểm ăn được, tổng điểm.

## Cài đặt

| Cài đặt | Giá trị |
| --- | --- |
| Mức máy | Dễ (mặc định) / Khó |
| Mốc thắng trận | 50 / 100 (mặc định) / 200 |
| Tốc độ máy | Chậm / Vừa (mặc định) / Nhanh |
| Giao diện, Ngôn ngữ, Âm thanh | của kit |

Đổi mức hoặc mốc khi bạn chưa đi nước nào thì chia lại trận ngay; giữa trận thì áp dụng từ trận sau (trận đang chơi giữ mức đã báo cho cổng).

## Báo trận cho cổng

- Metric `wins` (số trận thắng), điểm game 8; hai mode theo mức máy: `easy` (Dễ, 6 điểm) và `hard` (Khó, 10 điểm), mỗi mode luật `min_duration_ms: 6000` (trận thắng nhanh nhất ở mốc 50 điểm, tốc độ Nhanh có khoảng 13 lượt máy × 0,5 giây).
- Một trận (tới mốc điểm) là một lần chơi. Chia trận mới: `kit.sdk.start(level)`; mở lại trận lưu dở: `kit.sdk.start(level, true)`.
- Có người chạm mốc: `kit.sdk.end({ mode: level, won, timeMs, assisted: false })`, `won` là bạn chạm trước.
- Bỏ trận (nút Ván mới) khi bạn đã đi ít nhất một nước (đánh, rút hoặc bỏ lượt): hỏi xác nhận rồi gửi `won: false`; chưa đi nước nào thì không gửi gì.
- Chống gian lận: mô phỏng trong `test.js` cho thấy trận bạn thắng ngắn nhất (mốc 50, thắng ngay ván đầu) vẫn có ít nhất 12–14 lượt máy xen giữa 5 nước của bạn; trung vị khoảng 40 lượt máy ở mốc 50 và 120 ở mốc 100. Mỗi lượt máy mất ít nhất khoảng 0,5 s ở tốc độ Nhanh và hơn 1 s ở tốc độ Vừa.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-baitam-settings-v1` | Cài đặt (giao diện, `level`, `target`, `speed`) |
| `playnine-baitam-stats-v1` | Thống kê: số trận, số trận thắng, số ván thắng |
| `playnine-baitam-save-v1` | Trận đang chơi dở (`{ v, game, elapsed }`, lưu cả lúc đang xem bảng điểm giữa hai ván; ván hỏng / sai luật bị bỏ) |
| `playnine-baitam-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` / `→` | Chọn lá trên tay |
| `1`–`9` | Chọn lá đánh được thứ 1–9 (số hiện trên lá nhô lên) |
| `Enter` | Đánh lá đang chọn |
| `D` | Rút (hoặc Bỏ lượt sau khi đã rút) |
| `S` `H` `D` `C` / mũi tên | Gọi chất trong hộp chọn chất |
| `N` | Trận mới |
| `Esc` | Đóng hộp thoại (hủy đánh lá 8) |

## Kiểm tra

```bash
node test.js
```

Test engine: chia bài, luật lá mở đầu (lá 8 trộn lại), luật đánh, lá 8 và gọi chất, rút / bỏ lượt, trộn lại khi hết nọc, tính điểm ván, sang ván, hết trận, máy Dễ / Khó luôn đi nước hợp lệ và đúng chiến thuật, mô phỏng 3000 trận toàn máy (trận nào cũng kết thúc, đúng một người chạm mốc, 52 lá luôn đủ), lưu / khôi phục và từ chối dữ liệu hỏng.

Test riêng trong cổng: `e2e.spec.ts` (thắng trận, thua khi máy chạm mốc trước, bỏ trận) chạy cùng `npm run e2e` sau khi build và ghép.
