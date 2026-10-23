# Cá Ngựa

Game Cá Ngựa (Ludo Race) của PlayNine: tung xúc xắc, đua bốn quân xanh dương về đích trước ba người máy (Đỏ, Xanh lá, Vàng). Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

Luật Ludo quốc tế, 4 màu x 4 quân, đi theo chiều kim đồng hồ. Bạn cầm màu xanh dương (chuồng dưới trái) và luôn tung trước; sau bạn là Đỏ (trên trái), Xanh lá (trên phải), Vàng (dưới phải).

- Tung được **6** mới ra quân: quân ra đứng ở ô xuất phát cùng màu.
- Được 6 thì tung thêm lần nữa (kể cả khi lần 6 đó không đi được quân nào). **Ba lần 6 liên tiếp** thì mất lượt, lần 6 thứ ba không được đi.
- Không quân nào đi được với số vừa tung thì qua lượt.
- Đường đua chung 52 ô. Dừng đúng ô có quân đối thủ thì **đá** tất cả quân đối thủ ở ô đó về chuồng. Quân chỉ đi qua (không dừng) thì không đá.
- **Ô an toàn** (không ai bị đá, nhiều màu đứng chung được): 4 ô xuất phát có màu và 4 ô **ngôi sao** (cách ô xuất phát 8 ô). Trên bàn, mọi ô an toàn đều có ngôi sao.
- Quân cùng màu đứng chồng nhau được; không có luật "chặn đường".
- Đi hết 51 ô, quân rẽ vào **đường về đích** 5 ô cùng màu (mũi tên chỉ chỗ rẽ), ở đó không ai đá được. Phải tung **đúng số** mới vào đích; số lớn hơn thì quân đó không đi được.
- Ai đưa đủ 4 quân về đích trước thì thắng và ván dừng ngay: bạn về trước là thắng, bất kỳ máy nào về trước là thua.

Engine (`engine.js`) là hàm thuần: `legalMoves`, `roll`, `move`, `capturesAt`, `isSafe`, `cellOf` / `pointOf` (hình học bàn), `validate`, `toJSON` / `fromJSON`. Xúc xắc dùng PRNG mulberry32, trạng thái PRNG nằm trong ván lưu nên tải lại trang rồi tung lại vẫn ra đúng số cũ.

### Máy

Mỗi nước của máy được chấm điểm: đá quân > về đích > ra quân bằng 6 > vào đường về đích; cứu quân đang bị dọa (có quân đối thủ đứng sau 1–6 ô), trừ điểm khi đứng vào chỗ bị dọa, cộng điểm ô an toàn, đi xa hơn một chút thì tốt hơn. Thêm một chút ngẫu nhiên seed theo trạng thái ván (cùng ván thì cùng nước). Trong test, máy heuristic thắng khoảng 65% khi đấu ba máy chọn ngẫu nhiên.

## Điều khiển

- Chạm xúc xắc (đang nhún nhảy khi tới lượt bạn) để tung.
- Quân đi được có vòng sáng; chạm quân để đi. Chỉ có một nước (hoặc nhiều quân trong chuồng cùng ra một ô) thì game tự đi giúp sau một nhịp ngắn (tắt được ở Cài đặt → Tự đi).
- Máy tự tung và đi; dòng trạng thái dưới bàn nói ai vừa tung gì, ai đá ai. Mở hộp thoại thì máy tạm dừng.

## Cài đặt

| Cài đặt | Giá trị |
| --- | --- |
| Tốc độ của máy | Vừa (mặc định) / Nhanh |
| Tự đi | Bật (mặc định) / Tắt |
| Giao diện, Ngôn ngữ, Âm thanh | của kit |

## Báo ván cho cổng

- Metric `wins` (số ván thắng), điểm game 6; một mode `classic` (Cổ điển) 6 điểm.
- Chia ván mới: `kit.sdk.start('classic')`; mở lại ván lưu dở: `kit.sdk.start('classic', true)`.
- Có người về đích đủ 4 quân: `kit.sdk.end({ mode: 'classic', won, timeMs, assisted: false })`, `won` là bạn về trước.
- Bỏ ván (nút Ván mới) khi đã tung ít nhất một lần: hỏi xác nhận rồi gửi `won: false`; chưa tung lần nào thì không gửi gì.
- Luật chống gian lận `min_duration_ms: 30000`. Mô phỏng 3000 ván toàn máy trong `test.js`: ván ngắn nhất cần 210 lần tung của cả bàn (trung bình khoảng 480). Mỗi lần máy tung ở tốc độ Nhanh mất ít nhất khoảng 0,3 s (nghĩ + xúc xắc lăn, kể cả khi giảm chuyển động) và khoảng 3/4 số lần tung là của máy, nên ván ngắn nhất đã quan sát cũng mất gần 1 phút (chưa kể thời gian quân chạy và lượt của bạn); 30 s để rộng cho trường hợp may mắn hơn mọi ván đã mô phỏng.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-cangua-settings-v1` | Cài đặt (giao diện, `speed`, `autoMove`) |
| `playnine-cangua-stats-v1` | Thống kê: số ván, số ván thắng, số quân bạn đã đá |
| `playnine-cangua-save-v1` | Ván đang chơi dở (`{ v, game, elapsed }`; ván hỏng / sai luật bị bỏ) |
| `playnine-cangua-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `Space` / `Enter` | Tung xúc xắc |
| `1`–`4` | Đi quân số 1–4 (số hiện cạnh quân đi được) |
| `Tab` + `Enter` | Chọn quân đi được bằng bàn phím |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test engine: hình học bàn, xúc xắc seed được, từng luật, máy chọn nước, mô phỏng 3000 ván toàn máy (ván nào cũng kết thúc với đúng một người thắng, trạng thái hợp lệ sau mỗi bước), lưu / khôi phục và từ chối dữ liệu hỏng.

Test riêng trong cổng: `e2e.spec.ts` (thắng, thua khi máy về trước, bỏ ván) chạy cùng `npm run e2e` sau khi build và ghép.
