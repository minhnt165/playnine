# Nhớ Nhịp

Game Nhớ Nhịp (Echo Pattern) của PlayNine: trò nhớ chuỗi màu và âm. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Máy cho các ô lần lượt sáng lên, mỗi ô kèm một nốt nhạc riêng. Khi máy phát xong, người chơi bấm lại **đúng các ô đó theo đúng thứ tự**.
- Lặp đúng cả chuỗi thì được điểm, chuỗi phát lại **dài thêm một bước** (các bước cũ giữ nguyên) và **nhanh hơn một chút**.
- Bấm sai một ô là **hết ván**: ô bấm sai có dấu ✕, ô đúng sáng đứng yên với viền đứt, rồi hiện bảng kết quả.
- **Điểm = độ dài chuỗi dài nhất đã lặp lại đúng.** Không giới hạn thời gian nhập (đây là trò nhớ, không phải trò phản xạ).
- Tạm dừng rồi chơi tiếp (hoặc mở lại ván lưu) thì vòng hiện tại **phát lại từ đầu** và nhập lại từ bước đầu; điểm giữ nguyên.

### Mức chơi (mode)

| Mode | Số ô | Nhịp phát (sáng + nghỉ mỗi bước) |
| --- | --- | --- |
| `classic` (Cổ điển) | 4 ô, bàn tròn chia bốn | vòng 1: 460 + 220 ms, mỗi vòng ngắn đi 20 + 10 ms, sàn 240 + 120 ms (từ vòng 12) |
| `hard` (Khó) | 6 ô, lưới 3×2 (2×3 trên điện thoại dọc) | vòng 1: 360 + 180 ms, mỗi vòng ngắn đi 16 + 8 ms, sàn 220 + 120 ms (từ vòng 10) |

Trước nốt đầu của ván / lần phát lại nghỉ 700 ms; giữa lúc bấm xong vòng và nốt đầu vòng sau nghỉ 800 ms (Khó: 650 ms).

### Trợ năng và an toàn

- Mỗi ô có **hình riêng ngoài màu** (tròn, tam giác, sao, vuông, chữ thập, tim) để người mù màu phân biệt được, kèm tên đọc cho trình đọc màn hình; vùng `aria-live` báo "tới lượt bạn", điểm, ô đúng khi sai.
- **An toàn động kinh**: chu kỳ phát ngắn nhất 340 ms, tức **dưới 3 lần sáng mỗi giây** (test kiểm tra mọi vòng tới 500). Chuỗi không bao giờ có ba bước liền nhau trùng một ô. Hết ván không nhấp nháy: ô đúng sáng đứng yên.
- **Giảm chuyển động** (`prefers-reduced-motion`): ô đổi màu tức thì, không quầng sáng lan ra ngoài, không hiệu ứng trang trí (chấm "đang phát", vòng sáng khi qua vòng, lớp phủ mờ dần).

### Âm thanh

Nốt của từng ô tự tổng hợp bằng Web Audio trong `app.js` (sóng tam giác + bồi âm, dài đúng bằng thời gian ô sáng) vì `kit.sfx` chỉ có tiếng ngắn cố định. Cổ điển dùng hợp âm La trưởng (Mi, La, Đô♯, Mi), Khó dùng ngũ cung Đô (Đô, Rê, Mi, Sol, La, Đô) nên bấm lộn xộn vẫn nghe êm. Nốt **chỉ phát khi có âm thanh của PlayNine và người chơi chưa tắt tiếng** (cùng công tắc `playnine-sound-v1` với cổng, hàng "Âm thanh" trong Cài đặt). Các tiếng khác (bắt đầu, qua vòng, sai, kỷ lục) qua `kit.sfx`, pháo giấy `kit.confetti()` khi lập kỷ lục.

## Điều khiển

- Chuột / chạm: bấm vào ô (nhận ngay lúc nhấn xuống). Màn chờ: chọn mức rồi bấm **Bắt đầu** (`#btn-start`), hoặc chạm vào nền màn chờ.
- Rung nhẹ khi bấm và khi sai (điện thoại), tắt được trong Cài đặt.
- Lần đầu mở game hiện hộp Cách chơi (lưu `guideSeen` trong cài đặt).

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `1` – `4` / `Q` `W` `A` `S` | Bấm ô (Cổ điển, theo vị trí 2×2) |
| `1` – `6` / `Q` `W` `E` `A` `S` `D` | Bấm ô (Khó, theo vị trí 3×2) |
| `Space` / `Enter` | Bắt đầu / chơi tiếp / chơi lại |
| `←` `→` | Chọn mức ở màn chờ |
| `P` / `Esc` | Tạm dừng / chơi tiếp |
| `N` | Ván mới (đang có điểm thì hỏi trước) |

Phím theo vị trí (`e.code`) nên bàn phím AZERTY / QWERTZ vẫn đúng chỗ; phím số hàng trên và bàn phím số đều dùng được.

## Ghi điểm trên cổng

`game.json` → `server`: `metric: score_high`, hai mode `classic` (5 điểm) và `hard` (8 điểm).

- Ván mới: `kit.sdk.start(mode)` khi bấm Bắt đầu; mở lại ván lưu dở: `kit.sdk.start(mode, true)`.
- Bấm sai (hết ván): `kit.sdk.end({ mode, won: false, score, assisted: false })`.
- Bỏ ván khi đã có điểm hoặc đã chơi ≥ 1 giây: gửi `won: false` với điểm hiện có; chưa thì không gửi gì.

Luật chống gian lận (`rules`) suy ra từ lịch phát của engine:

| Mode | `min_duration_ms` | `max_score_per_sec` | Lý do |
| --- | --- | --- | --- |
| `classic` | 1000 | 1.8 | Lần bấm sớm nhất có thể là lúc nốt đầu tắt (700 + 460 = 1160 ms) nên ván thật nào cũng ≥ 1 giây. Điểm không thể tăng nhanh hơn máy phát: bấm tức thì, đạt điểm s sớm nhất ở `minTimeForScore(s)` → trần lý thuyết 0,862 điểm/giây (điểm 1 ở 1,16 s), nhân 2 |
| `hard` | 1000 | 1.9 | Như trên: 700 + 360 = 1060 ms; trần lý thuyết 0,943 điểm/giây, nhân 2 |

Bot không bao giờ sai, phản ứng như người (220–300 ms cho lần bấm đầu, 140–220 ms giữa các lần bấm), 200 hạt giống: tối đa 0,44 điểm/giây (Cổ điển) và 0,51 (Khó) sau giây thứ 5. Điểm không có trần nên không đặt `max_score`. `test.js` kiểm tra ngưỡng trong `game.json` luôn ≥ 2 × trần lý thuyết (và không rộng quá 0,1).

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-nhonhip-settings-v1` | Cài đặt: giao diện, mức đang chọn (`mode`), rung, đã xem hướng dẫn |
| `playnine-nhonhip-stats-v1` | Thống kê: số ván, tổng số vòng đã qua, kỷ lục từng mức |
| `playnine-nhonhip-save-v1` | Ván đang chơi dở: `{ v, game: { v, mode, seed, t, score } }` (chỉ hạt giống, chuỗi sinh lại từ hạt giống) |
| `playnine-nhonhip-summary-v1` | Tóm tắt cho thẻ game trên cổng (kỷ lục từng mức, ván dở) |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng, khác phiên bản hoặc có điểm cao hơn mức máy phát kịp (giờ trong ván nhỏ hơn `minTimeForScore`) bị bỏ.

## Cấu trúc

- `engine.js`: luật thuần (không DOM), tất định theo hạt giống: `newGame(mode, seed)`, `advance(g, ms)` (phát nốt theo lịch, sự kiện `note` / `turn`), `press(g, pad)`, `replay(g)`, `litPad(g)`, `sequence(seed, pads, n)` (mulberry32), `timing(mode, n)`, `minTimeForScore`, `maxScorePerSec`, `toJSON` / `fromJSON`.
- `app.js`: vòng lặp `requestAnimationFrame` với bước cố định 10 ms (dt tối đa 100 ms khi tab quay lại), tự tạm dừng khi trang ẩn hoặc mở hộp thoại; vẽ bằng DOM, nốt nhạc Web Audio.
- `e2e.spec.ts`: ván lưu dựng sẵn (hạt giống 12345) → bấm sai → `pn:end` đúng điểm; mức Khó bấm đúng một vòng rồi sai; bỏ ván có điểm / ván vừa mở.

## Kiểm tra engine

```bash
node test.js
```
