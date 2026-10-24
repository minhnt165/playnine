# Xoay Cờ

Game Xoay Cờ (Twist Five, cờ xoay năm quân) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Bàn 6×6 gồm bốn góc 3×3 xoay được. Trắng đi trước, mỗi bên 18 quân.
- Mỗi lượt hai bước: **đặt** một quân vào ô trống bất kỳ, rồi **xoay** một góc bất kỳ 90° sang phải (theo chiều kim đồng hồ) hoặc sang trái. Lượt nào cũng phải xoay, kể cả góc không có quân của mình hay góc trống.
- **Thắng:** có 5 quân liền hàng (ngang, dọc, chéo) **sau khi xoay**. Có 5 quân ngay sau khi đặt nhưng cú xoay làm vỡ hàng thì chưa thắng (người chơi luôn chọn được một góc không chạm hàng đó nên thực tế không mất gì).
- Cú xoay làm **chỉ đối thủ** có 5 quân thì đối thủ thắng.
- **Hòa:** sau một cú xoay cả hai bên cùng có 5 quân; hoặc bàn đầy (36 quân) mà không ai có 5.
- Không có đi lại.

## Điều khiển

- **Chuột / cảm ứng:** chạm lỗ trống để đặt quân (quân có vòng vàng nhấp nháy). Chạm lại quân đó để nhấc ra, chạm lỗ khác để dời quân. Sau đó chạm một trong 8 mũi tên quanh bàn: mỗi góc có hai mũi tên ở sát góc ngoài, mũi tên chạy theo chiều góc sẽ quay ở chỗ đó (↻ sang phải, ↺ sang trái). Rê chuột / focus vào mũi tên thì góc nghiêng nhẹ về chiều sẽ xoay.
- **Bàn phím:** mũi tên di chuyển con trỏ, `Enter` / `Space` đặt quân (hoặc nhấc quân vừa đặt), `Q` / `E` xoay góc dưới con trỏ sang trái / phải (không có con trỏ thì góc chứa quân vừa đặt), `Esc` nhấc quân vừa đặt. Các mũi tên cũng là nút, Tab tới được.
- Góc xoay có hoạt cảnh 0,42 giây; nước của máy: đặt quân, mũi tên sẽ dùng sáng cam, rồi góc xoay. Nước vừa đi có chấm cam trên quân và viền cam ở mũi tên vừa dùng. Hết ván, các quân trên đường 5 sáng vàng.
- Bật giảm chuyển động (`prefers-reduced-motion`) thì góc đổi tức thì, không nghiêng, không nhấp nháy.

## Máy và mode

Chọn trong **Cài đặt**: đối thủ (Máy / 2 người), mức máy, phe (Trắng đi trước / Đen đi sau). Chưa đi nước nào thì đổi là chơi ván mới ngay (gửi lại `start` với mode mới, không gửi `end`); đã đi rồi thì áp dụng từ ván sau.

| Mode | Máy |
| --- | --- |
| `easy` (Dễ) | Có nước thắng ngay thì đi; bỏ các nước tự xoay ra 5 cho đối thủ; đối thủ đang dọa thắng ngay thì chọn ngẫu nhiên một nước chặn được; còn lại ngẫu nhiên. |
| `medium` (Vừa) | Alpha-beta độ sâu 2 (nước mình + mọi nước đáp), cộng nhiễu nhỏ (0–12) ở gốc nên đôi khi chọn nước kém hơn chút. |
| `hard` (Khó) | Đào sâu dần (thường xong độ sâu 3–4) trong giới hạn 1,5 giây; mọi nút từ độ sâu 2 sắp nước theo đánh giá tĩnh của thế con (nước thắng lên đầu), gốc xếp theo kết quả độ sâu trước. |

- Nước sinh ra đã bỏ trùng: xoay góc đối xứng 90° (trống, chỉ có quân giữa…) như không xoay, góc đối xứng 180° thì xoay trái = phải. Bàn trống còn 100 nước thay vì 288.
- Đánh giá chuỗi: trên 32 đường 5 ô, đường chưa có quân đối thủ được 1 / 6 / 32 / 180 điểm theo số quân 1–4; bên tới lượt có đường 4 quân còn ô trống coi như gần thắng; đối thủ có từ hai đường 4 thì trừ nặng.
- Máy nghĩ trong Web Worker dựng từ mã nguồn engine (`GameEngine.factory`), không làm đơ giao diện; không tạo được worker thì tính bằng `setTimeout` (mức Khó rút còn 0,5 giây). Máy "nghĩ" ít nhất 0,55 giây. Hạt giống của máy lưu trong ván (`seed`), mỗi nước dùng hạt giống suy từ đó và số nước.
- **2 người cùng máy:** hai người lần lượt đi trên một thiết bị, không báo điểm cho cổng, không tính vào thống kê.

**Mức mạnh dần** (test `node test.js`, 20 ván mỗi cặp, đổi bên đi trước mỗi ván, hai nước đầu ngẫu nhiên; Khó trong test cố định độ sâu 3, không giới hạn giờ, nên yếu hơn Khó trong game):

| Cặp | Thắng | Thua | Hòa |
| --- | --- | --- | --- |
| Vừa vs Dễ | 20 | 0 | 0 |
| Khó vs Dễ | 20 | 0 | 0 |
| Khó vs Vừa | 16 | 3 | 1 |

## Ghi điểm trên cổng

Metric `wins` (số ván thắng), 15 điểm mặc định; mode theo mức máy: `easy` 10 điểm, `medium` 15 điểm, `hard` 25 điểm (bảng 4.8 của lộ trình: đối kháng với máy). Mỗi mode luật `min_duration_ms` 4000: thắng cần ít nhất 5 nước của người, xen giữa là ít nhất 4 nước của máy, mỗi nước máy tốn ≥ 0,55 giây nghĩ + 0,25 giây (giảm chuyển động) đến 0,8 giây đặt quân và xoay, tức ≥ 3,2 giây, cộng 10 lần chạm của người.

- Ván mới (đấu máy): `kit.sdk.start(level)`; mở lại ván lưu dở: `kit.sdk.start(level, true)`.
- Hết ván: `kit.sdk.end({ mode: level, won, assisted: false })`; `won` là `true` chỉ khi bạn thắng, thua hoặc **hòa** gửi `won: false`.
- Bỏ ván đã đi ít nhất một nước (bấm Ván mới rồi xác nhận): gửi `won: false`. Chưa đi nước nào thì không gửi gì.
- Không có đi lại hay gợi ý nên `assisted` luôn `false`. Chế độ 2 người không gọi `start` / `end`.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-xoayco-settings-v1` | Cài đặt: giao diện, `opponent` (`ai` / `pvp`), `level` (`easy` / `medium` / `hard`), `side` (`white` / `black`) |
| `playnine-xoayco-stats-v1` | Thống kê (chỉ ván đấu máy): `levels.<mức>.{played, won, lost, drawn}`, `streak`, `best` |
| `playnine-xoayco-save-v1` | Ván đang chơi dở `{ v: 1, mode, level, human, humanMoves, seed, game }`; `game` là `toJSON` của engine: `board` (36 ký tự, hàng trên trước: `.` trống, `W` Trắng, `B` Đen; lượt suy ra từ số quân), `last` (`{ cell, q, dir }` nước vừa đi hoặc `null`). Quân đặt mà chưa xoay không được lưu. |
| `playnine-xoayco-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `→` `↓` | Di chuyển con trỏ trên bàn |
| `Enter` / `Space` | Đặt quân ở ô dưới con trỏ / nhấc quân vừa đặt |
| `Q` / `E` | Xoay góc dưới con trỏ sang trái / sang phải |
| `Esc` | Nhấc quân vừa đặt; đóng hộp thoại |
| `N` | Ván mới |

## Kiểm tra

```bash
node test.js
```

Test engine phủ: bàn và 4 góc, 32 đường 5 ô, luật xoay (phải / trái đúng chiều, chỉ đổi góc được chọn, bốn lần xoay về như cũ, quân vừa đặt xoay theo góc), đặt quân chỉ vào ô trống và đổi lượt, nước bỏ trùng phủ đủ mọi thế, thắng ngang / dọc / chéo / nhờ xoay, 5 trước khi xoay bị xoay phá thì chưa thắng, tự xoay ra 5 cho đối thủ là thua, cả hai cùng 5 là hòa, đầy bàn là hòa, 200 ván ngẫu nhiên đều kết thúc trong 36 nước, lưu / khôi phục và từ chối dữ liệu hỏng (cả ván đã kết thúc), máy mọi mức luôn đi đúng luật, thắng ngay khi được, chặn đòn thắng ngay, không tự xoay ra 5 cho đối thủ, mức Khó có giới hạn giờ đi đúng hạn, và ba cặp đấu mức mạnh dần ở trên (chạy khoảng 35 giây). Test Playwright trong cổng nằm ở `e2e.spec.ts` (chạy cùng `npm run e2e` sau khi build và ghép).
