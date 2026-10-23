# Xếp Bài Nhện

Game Xếp Bài Nhện (Spider Solitaire) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (kit, và bộ bài tây `cards.js` / `cards.css`; xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- 104 lá (hai bộ bài). Chia 10 cột: 4 cột đầu 6 lá, 6 cột sau 5 lá, chỉ lá trên cùng ngửa. 50 lá còn lại là chồng chia (5 lượt).
- Đặt một lá lên lá lớn hơn đúng một bậc, **chất nào cũng được**. Một dãy giảm dần **cùng chất** đi chung được cả dãy, dài bao nhiêu cũng được.
- Cột trống nhận lá hoặc dãy bất kỳ. Lá úp lộ ra trên đỉnh cột tự lật lên.
- Chia bài: mỗi cột nhận một lá ngửa, **chỉ khi không có cột trống** (ngoại lệ: trên bàn còn chưa tới 10 lá, không thể lấp hết cột, thì vẫn được chia).
- Dãy K→A cùng chất (đủ 13 lá ngửa) tự gỡ ra ô đích, kể cả dãy vừa thành sau khi chia. Gỡ đủ **8 dãy** là thắng.
- Điểm cổ điển (chỉ để xem): bắt đầu 500, mỗi lần đi / chia / đi lại trừ 1, mỗi dãy gỡ được cộng 100.
- Ván sinh ra bằng hạt giống (`PNCards.rng`) và xáo `newDeck({ decks: 2, suits })` của kit.

## Điều khiển

- **Chạm một lá ngửa**: cả chồng từ lá đó lên đỉnh tự đi tới chỗ tốt nhất (cùng chất, dãy dài hơn > khác chất > cột trống). Chạm lại ngay lá đó thì chuyển sang chỗ kế tiếp (không tính thêm nước).
- **Kéo thả** chồng lá tới cột muốn đặt (`PNCards.drag`).
- **Chạm chồng chia** hoặc nút *Chia bài* để chia một hàng.
- *Đi lại*: không giới hạn, đi lại được cả lần chia và nước gỡ dãy; **không tính là trợ giúp**.
- *Gợi ý*: sáng chồng lá và chỗ nên đặt (ưu tiên nước gỡ được dãy, lật lá úp, làm trống cột, ghép cùng chất; không còn thì gợi ý chia bài). Dùng gợi ý thì ván bị đánh dấu `assisted: true`.
- Cài đặt: số chất (1 / 2 / 4), giao diện, ngôn ngữ, bài 4 màu (rô xanh dương, nhép xanh lá), âm thanh.

## Mode (số chất)

| Mode | Bộ bài | Điểm trên cổng | `min_time_ms` |
| --- | --- | --- | --- |
| `s1` (mặc định) | 8 bộ bích | 6 | 75 000 |
| `s2` | 4 bộ bích + 4 bộ cơ | 10 | 120 000 |
| `s4` | 2 bộ mỗi chất | 16 | 180 000 |

Đổi số chất trong Cài đặt (hoặc bấm ô *Số chất* trên thanh số liệu). Ván chưa đi nước nào thì chia ngay ván mới; ván đang dở thì hỏi xác nhận (bỏ ván tính là thua).

## Ghi điểm trên cổng

- Metric `time_low` (nhanh nhất), `points` 10. Ván mới: `kit.sdk.start(mode)`; mở lại ván lưu dở: `kit.sdk.start(mode, true)`.
- Thắng: `kit.sdk.end({ mode, won: true, timeMs, assisted })`; đồng hồ chạy từ nước đầu tiên, dừng khi ẩn trang, cộng dồn qua các lần mở lại.
- Bỏ ván đã đi ít nhất một nước (Ván mới hoặc đổi số chất, có hỏi xác nhận): `won: false`. Ván chưa đi nước nào thì không gửi gì.
- `min_time_ms`: bot tìm kiếm trong `test.js` giải 40/40 ván 1 chất với ít nhất 104 nước (trung bình 117). Người chơi cực nhanh, chỉ chạm (≈ 0,7 s / nước, không kịp nghĩ) cần khoảng 75 s cho 104 nước nên `s1` = 75 s. Ván 2 chất cần thêm nhiều nước sắp lại (lời giải bot tìm được dài 129+ nước, người chơi thường 150+ nước và phải nghĩ lâu hơn) nên `s2` = 120 s; 4 chất thường 200+ nước, nhiều lần đi lại nên `s4` = 180 s. Các ngưỡng nằm dưới kỷ lục thực tế của người chơi giỏi (vài phút).

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-xepbainhen-settings-v1` | Cài đặt: giao diện, số chất `mode` (`s1` / `s2` / `s4`), bài 4 màu `fourColor` |
| `playnine-xepbainhen-stats-v1` | Thống kê theo mode: đã chơi, thắng, nhanh nhất (chỉ ván không gợi ý), điểm cao nhất |
| `playnine-xepbainhen-save-v1` | Ván dở (khi đã đi ít nhất một nước): `{ v, game: { v, suits, seed, moves, acts }, elapsed, assisted }`; `acts` là các nước còn hiệu lực (`[cột, vị trí, đích]` hoặc `'d'` = chia) |
| `playnine-xepbainhen-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Khi mở lại, game chơi lại các nước từ hạt giống; ván lưu hỏng, khác phiên bản hoặc có nước sai luật thì bị bỏ và chia ván mới.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `→` | Chọn cột |
| `↑` `↓` | Chọn lá trong dãy đi được của cột |
| `Enter` / `Space` | Nhấc chồng ở con trỏ / đặt chồng đang cầm vào cột con trỏ (đặt vào chính cột của nó = tự đi) |
| `1` … `9`, `0` | Nhấc dãy ở cột 1…10, hoặc đặt chồng đang cầm vào cột đó |
| `D` | Chia bài |
| `Z` / `Backspace` / `Ctrl+Z` | Đi lại |
| `H` | Gợi ý |
| `N` | Ván mới |
| `Esc` | Bỏ chồng đang cầm / đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test engine phủ thành phần bộ bài theo số chất, cách chia, luật bốc / đặt / cột trống, lật lá, gỡ dãy K→A (cả khi chia), luật chia, đi lại mọi loại nước, thắng, điểm, tự đi / gợi ý, lưu / khôi phục / từ chối ván hỏng, và một bot tìm kiếm giải ít nhất 70% ván 1 chất (hiện 20/20). Test trong cổng: `e2e.spec.ts` (ván thắng từ ván lưu còn một nước, bỏ ván, đổi số chất trước nước đầu).
