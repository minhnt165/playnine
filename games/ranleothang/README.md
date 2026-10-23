# Rắn Leo Thang

Game Rắn Leo Thang (Snakes and Ladders) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Bàn 10 x 10 đánh số zig-zag: ô 1 ở góc dưới trái, hàng chẵn (tính từ dưới) đi trái sang phải, hàng lẻ đi phải sang trái, ô 100 ở góc trên trái.
- Bạn đua với 1 đến 3 máy (chọn trong Cài đặt, mặc định 3). Mọi quân bắt đầu ngoài bàn; bạn luôn tung trước.
- Tung xúc xắc, quân đi đúng bấy nhiêu ô, từng ô một.
- Dừng ở chân **thang** thì leo lên đỉnh thang; dừng ở **đầu rắn** thì trượt xuống đuôi rắn. Đi ngang qua thì không sao.
- Phải tung **vừa đúng số** để về ô 100; thừa thì dội lại phần thừa (ô 97 tung 5: 98, 99, 100, 99, 98). Dội lại trúng đầu rắn vẫn bị cắn.
- Tung được **6** thì được tung tiếp (Cài đặt "Được 6 tung tiếp", mặc định bật). Về đúng 100 bằng con 6 thì thắng luôn, không tung thêm.
- Quân về ô 100 đầu tiên thắng. Game may rủi thuần, máy không có lựa chọn nào: chỉ tự tung theo nhịp.

## Bàn chơi

Bốn bàn cố định trong `engine.js` (`LAYOUTS`): Khu vườn (`garden`), Rừng rậm (`jungle`), Sa mạc (`desert`), Đại dương (`ocean`), mỗi bàn 7 thang và 7-8 rắn, mỗi ván chọn ngẫu nhiên theo seed. Luật của một bàn hợp lệ (`validateLayout`, có test):

- đầu mút nằm trong 2..99 (không rắn ở 100, không thang lên thẳng 100, không gì ở ô 1);
- rắn đi xuống, thang đi lên, hai đầu khác hàng;
- mọi đầu mút khác nhau: không đầu rắn ở chân thang, không nối chuỗi (đuôi rắn / đỉnh thang không phải là chân thang / đầu rắn khác).

Xúc xắc là PRNG mulberry32 nằm trong trạng thái ván (`rng`), nên cùng seed cho cùng bàn và cùng chuỗi xúc xắc, ván lưu khôi phục lặp lại được.

## Điều khiển

- Chạm / bấm xúc xắc để tung khi tới lượt bạn (xúc xắc viền màu quân của người đang tới lượt và nhấp nháy khi tới lượt bạn).
- Lượt máy tự tung. Cài đặt "Tốc độ" (Chậm / Vừa / Nhanh) đổi nhịp máy nghĩ, xúc xắc lăn và quân đi.
- Đổi số máy hoặc luật 6 khi chưa tung lần nào thì chia lại ván ngay; khi đã tung thì áp dụng từ ván sau.
- `prefers-reduced-motion`: xúc xắc không lăn, quân đi nhanh, nhảy thẳng tới cuối rắn / thang, tắt nhấp nháy.

## Ghi điểm trên cổng

| Mode | Nhãn | Metric | Điểm | Luật chống gian lận |
| --- | --- | --- | --- | --- |
| `classic` | Classic / Cổ điển | `wins` | 1 | `min_duration_ms` 10000 |

Theo mục 4.8 của [lộ trình](../../docs/superpowers/specs/2026-10-23-100-games-roadmap.md) (may rủi thuần: 1 điểm, ván ≥ 10 s, không có sự kiện xếp hạng).

- Ván mới: `kit.sdk.start('classic')`; mở lại ván lưu dở: `kit.sdk.start('classic', true)`.
- Bạn về 100 trước: `kit.sdk.end({ mode: 'classic', won: true, timeMs, assisted: false })`; máy về 100 trước: `won: false`. Gửi ngay lúc tung trúng 100 (không chờ hiệu ứng), bảng kết quả hiện sau.
- Bỏ ván (Ván mới) sau lần tung đầu: `won: false`; chưa tung lần nào thì không gửi gì.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-ranleothang-settings-v1` | Cài đặt: giao diện, số máy (`bots`), được 6 tung tiếp (`extraSix`), tốc độ (`speed`) |
| `playnine-ranleothang-stats-v1` | Thống kê: số ván, số ván thắng, ít lần tung nhất khi thắng |
| `playnine-ranleothang-save-v1` | Ván đang chơi dở (sau lần tung đầu): trạng thái engine, dòng nhật ký, mặt xúc xắc, thời gian |
| `playnine-ranleothang-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `Space` / `Enter` | Tung xúc xắc (khi tới lượt bạn) |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test engine: đánh số / tọa độ, mọi bàn hợp lệ, đi quân và dội lại, rắn / thang, tung 6 được tung tiếp, thắng, xúc xắc theo seed, 5000 ván mô phỏng đều kết thúc với đúng một người thắng, lưu / khôi phục và từ chối dữ liệu hỏng. Test trong cổng: `e2e.spec.ts` (thắng, máy thắng, bỏ ván sau lần tung đầu, ván mới trước lần tung đầu).
