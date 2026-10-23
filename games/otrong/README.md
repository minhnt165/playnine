# Ô Trống

Game Ô Trống (FreeCell) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)) và bộ bài chung `../_kit/cards.js` + `cards.css` (mặt lá, ô trống, kéo thả). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- 52 lá chia ngửa hết vào 8 cột (7, 7, 7, 7, 6, 6, 6, 6 lá). Góc trái trên là 4 **ô trống**, góc phải trên là 4 **ô đích** (♠ ♥ ♦ ♣).
- Thắng khi cả 52 lá lên ô đích, mỗi chất từ A lên K.
- **Cột**: đặt lá lên lá lớn hơn đúng một bậc và khác màu (9♥ lên 10♠). Cột trống nhận lá bất kỳ.
- **Ô trống**: mỗi ô giữ một lá bất kỳ. Không chuyển ô trống sang ô trống. Lá đã lên đích không lấy xuống.
- Mỗi lần đi một lá; một **dãy** (giảm dần, xen màu) đi cùng nhau được nếu đủ chỗ trung chuyển: tối đa (số ô trống + 1) × 2^(số cột trống) lá, chuyển vào cột trống thì cột đó không tính (còn một nửa).
- **Tự lên đích** (bật mặc định, tắt được trong Cài đặt): sau mỗi nước, lá nào không còn lá nào cần đến thì tự lên đích. Lá an toàn: A, 2, hoặc lá có hai chất khác màu đã lên tới bậc ngay dưới nó.
- **Xếp nốt**: khi mọi cột đã giảm dần từ dưới lên, nút "Xếp nốt" đưa hết lá lên đích.
- **Hoàn tác** không giới hạn (một lần hoàn tác trả cả nước của người chơi và các lá tự lên đích theo sau); không tính là trợ giúp.
- **Gợi ý** lấy nước đầu tiên từ lời giải của solver (tìm kiếm tốt nhất trước, chạy từng phần bằng `setTimeout` nên không đơ giao diện); đi đúng nước gợi ý thì lần gợi ý sau trả lời ngay. Đã xem gợi ý thì ván tính `assisted: true` và không ghi kỷ lục.

### Số ván

Chia bài theo thuật toán công khai của "Microsoft FreeCell" (LCG `seed × 214013 + 2531011`), nên ván #1 … #32000 trùng với các ván đánh số nổi tiếng (test khóa ván #1 và #617 từng lá). Ván mới chọn ngẫu nhiên trong 1..32000, bỏ ván #11982 (ván duy nhất không giải được). Cài đặt có ô nhập số ván để chơi ván bất kỳ.

## Điều khiển

- **Chạm / bấm** một lá: lá (và các lá phía trên nếu là dãy) tự tìm chỗ theo thứ tự ô đích → cột có lá → cột trống → ô trống. Không có chỗ thì lá rung; dãy dài quá số lá được chuyển thì báo "chỉ chuyển được n lá".
- **Kéo thả** (chuột, cảm ứng): kéo lá hoặc cả dãy tới cột, ô trống, ô đích; chỗ thả được sáng viền khi kéo tới, thả sai thì lá bay về.
- Đang có gợi ý: chạm đúng lá được gợi ý là đi theo gợi ý.
- Ván không còn nước đi: báo "Hết nước đi" (hoàn tác hoặc ván mới).
- Bố cục: điện thoại dọc (thanh trên, HUD, bàn, nút), máy tính, điện thoại ngang (HUD và nút sang cột phải). Cỡ lá tính theo khung, cột dài thì lá xếp sát lại.

## Mode

Một mode `classic` (Classic / Cổ điển).

## Ghi điểm trên cổng

- `metric: time_low` (thời gian giải nhanh nhất), điểm game 8, mode `classic` 8 điểm.
- Chống gian lận `min_time_ms: 12000`. Đồng hồ chạy từ nước đầu tiên. Lời giải của solver cho 500 ván đầu cần 30–80 nước của người chơi (trung vị 52) khi bật tự lên đích, chưa kể 52 lá phải lên đích; với "Xếp nốt" phần cuối gói thành một nước. Một ván rất gọn vẫn cần khoảng 30 nước quyết định, mỗi nước (nhìn bàn + chạm) nhanh nhất cỡ 0,4 s → khoảng 12 s; dưới mức đó gần như chắc chắn là gửi kết quả giả. Tắt tự lên đích thì cần ≥ 60 thao tác nên ngưỡng càng an toàn.
- Chia ván mới: `kit.sdk.start('classic')`; mở lại ván lưu dở: `kit.sdk.start('classic', true)`.
- Thắng: `kit.sdk.end({ mode: 'classic', won: true, timeMs, assisted })` (`assisted` true nếu đã xem gợi ý).
- Bỏ ván đã đi ít nhất một nước (ván mới, chọn số ván khác): gửi `won: false`; ván chưa đi nước nào thì không gửi gì.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-otrong-settings-v1` | Cài đặt: giao diện, tự lên đích (`auto`), bài 4 màu (`fourColor`) |
| `playnine-otrong-stats-v1` | Đã chơi, giải xong, kỷ lục thời gian (không tính ván dùng gợi ý), chuỗi thắng hiện tại / dài nhất |
| `playnine-otrong-save-v1` | Ván đang chơi dở `{ v, game: { v, deal, hist }, elapsed, assisted }`; lưu sau mỗi nước và khi rời trang. Chỉ lưu số ván + lịch sử nước đi, khôi phục bằng cách đi lại từ đầu (nước sai luật → bỏ ván lưu) |
| `playnine-otrong-summary-v1` | Tóm tắt cho thẻ game trên cổng (kỷ lục, tỉ lệ thắng, ván dở) |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Mở lại ván dở thì đồng hồ chạy tiếp ngay (tải lại trang không dừng được giờ).

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `1` … `8` | Nhấc dãy trên cùng của cột đó / đặt lá đang nhấc vào cột đó |
| `Q` `W` `E` `R` | Nhấc lá ở ô trống 1–4 / đặt lá đang nhấc vào ô trống đó |
| `F` | Đặt lá đang nhấc lên ô đích |
| Cùng phím hai lần | Lá tự tìm chỗ (như chạm) |
| `Tab`, mũi tên + `Enter` / `Space` | Chọn chồng bằng bàn phím, nhấc và đặt |
| `Esc` | Đặt lại lá đang nhấc (đóng hộp thoại nếu đang mở) |
| `Z` / `Ctrl+Z` / `Backspace` | Hoàn tác |
| `G` | Gợi ý |
| `A` | Xếp nốt (khi có nút) |
| `N` | Ván mới (hỏi trước nếu ván đã đi) |

## Kiểm tra

```bash
node test.js
```

Test engine: chia ván #1 và #617 khớp bảng ván cổ điển, bỏ ván #11982, luật cột / ô trống / ô đích, giới hạn chuyển nhiều lá, lá an toàn và tự lên đích, chạm lá tự tìm chỗ, xếp nốt, hoàn tác về đúng ván đầu, solver giải 40 ván (gồm các ván khó) trong giới hạn thời gian với lời giải đúng luật, solver chạy từng phần và giải tiếp từ giữa ván, lưu / khôi phục và từ chối dữ liệu hỏng, ván lưu dựng sẵn của e2e hợp lệ. Test trong cổng: `e2e.spec.ts` (ván thắng, thắng có gợi ý, bỏ ván).
