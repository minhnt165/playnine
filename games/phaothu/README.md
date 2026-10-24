# Pháo Thủ

Game Pháo Thủ (Artillery, đấu pháo theo lượt) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, vẽ bằng `<canvas>`, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Bản đồ 800 × 500 đơn vị, địa hình đồi núi sinh ngẫu nhiên theo seed (tổng vài sóng sin + một đồi hoặc thung lũng giữa bản đồ). Mỗi bên một khẩu pháo đứng trên nền phẳng: bạn (đỏ) bên trái, đối thủ (xanh) bên phải, cách nhau ít nhất 460 đơn vị.
- Hai bên lần lượt bắn. Mỗi phát chọn **góc** (0°–180°, nòng quay được cả về phía sau), **lực** (0–100) và **loại đạn**.
- Đạn bay theo bước thời gian cố định 1/120 s: trọng lực 250 đơn vị/s² kéo xuống, **gió** là gia tốc ngang 3 đơn vị/s² mỗi nấc, từ −10 đến +10, **đổi mỗi lượt** (theo seed của ván). Lực 100 = 490 đơn vị/s. Đạn bay ra ngoài mép trái / phải bản đồ thì mất, không nổ.
- Đạn chạm đất hoặc chạm pháo thì nổ: **khoét hố tròn** (đất phía trên sập xuống, không khoét được lớp đá đáy), **sát thương** tối đa khi tâm nổ chạm thân pháo, giảm tuyến tính về 0 ở mép bán kính nổ. Bắn trúng chính mình cũng mất máu.
- Đất dưới chân bị khoét thì **pháo rơi** xuống mặt đất mới; rơi quá 12 đơn vị thì mất máu (0,3 mỗi đơn vị vượt, tối đa 15).
- Loại đạn:

  | Đạn | Bán kính nổ | Sát thương tối đa | Số lượng |
  | --- | --- | --- | --- |
  | Thường | 30 | 35 | không giới hạn |
  | Nặng | 46 | 50 | 2 mỗi ván |
  | Chùm | 20 | 22 mỗi viên, 3 viên tỏa ±4° | 2 lần mỗi ván |

- Mỗi pháo 100 máu, hết máu là thua; hai pháo cùng hết máu trong một phát là hòa. Một lượt gây tối đa 66 + 15 = 81 sát thương nên không ai thắng được bằng một phát.
- Quá 60 phát (cả hai bên) thì pháo còn nhiều máu hơn thắng, bằng máu là hòa.
- Đấu với máy thì bạn luôn bắn trước. Không có đi lại.
- **Màn luôn bắn được:** khi sinh ván, engine dò phát bắn cho cả hai bên với gió −10 và +10; bên nào không có phát gây sát thương thì sinh lại địa hình từ dãy số tiếp theo của seed. Test chạy trên 200 seed × 3 mức gió × 2 bên.

## Điều khiển

- **Kéo để ngắm:** chạm / bấm giữ trên bản đồ rồi kéo; hướng từ gốc nòng tới ngón tay là góc, khoảng cách là lực (260 đơn vị = lực 100). Đường chấm ngắn trước nòng cho thấy 0,45 s đầu của quỹ đạo (không tính gió).
- **Bảng ngắm:** thanh trượt Góc (kéo sang trái là nòng quay về bên trái) và Lực, nút `‹` `›` `−` `+` (giữ để chạy liên tục), ba nút loại đạn (có số viên còn lại), nút **Bắn**.
- Dấu × nhỏ cùng màu pháo đánh dấu chỗ đạn của bên đang ngắm rơi lần trước.
- Bảng trên cùng: máu hai bên, gió (mũi tên chỉ hướng, số là độ mạnh, "Lặng" khi không gió). Mây trên trời trôi theo gió.
- Màn hình dọc: bản đồ ở trên, bảng ngắm ở dưới; màn hình ngang đủ rộng: bảng ngắm ở bên phải.
- Bật giảm chuyển động (`prefers-reduced-motion`): không rung màn, không mảnh vỡ, không vệt khói, mây đứng yên, chữ sát thương không bay lên; đường đạn vẫn chạy theo thời gian thật (đó là phần chơi).
- Có chế độ **2 người cùng máy** (Cài đặt → Đối thủ): hai người lần lượt ngắm bằng cùng một bảng ngắm; không báo điểm cho cổng, không tính thống kê.

## Máy và mode

Chọn mức trong **Cài đặt**. Chưa bắn phát nào thì đổi mức / đối thủ là chơi ván mới ngay (gửi lại `start` với mode mới, không gửi `end`); đã bắn thì áp dụng từ ván sau.

Máy chạy trong engine thuần, tất định theo (seed của ván, số phát, bên bắn). Mỗi mức có **lệch tay cả ván** (một độ lệch lực cố định do seed quyết định, máy không biết) và **nhiễu mỗi phát** (phân bố tam giác):

| Mode | Cách ngắm | Lệch tay (lực) | Nhiễu lực / góc |
| --- | --- | --- | --- |
| `easy` (Dễ) | Góc ngẫu nhiên 35°–65°, lực theo công thức ném xiên trên đất phẳng, không tính gió và địa hình; 30% dùng đạn nặng, 20% đạn chùm | ±8 | ±9 / ±5° |
| `medium` (Vừa) | Thử 6 góc ngẫu nhiên 25°–72°, mỗi góc chỉnh lực bằng 4–5 phát mô phỏng (phương pháp dây cung, có gió và địa hình), chọn phát có sát thương ước tính lớn nhất; 50% dùng đạn nặng khi còn | ±5 | ±4,5 / ±2,5° |
| `hard` (Khó) | Quét góc 10°–84° (bước 2°), mỗi góc chia đôi lực 16 lần tới điểm rơi đúng chân đối thủ (có gió, địa hình), chấm theo sát thương thật, phạt tự gây hại. Phát đầu bắn thử bằng đạn thường, sau đó đạn nặng rồi đạn chùm. **Học từ phát trượt:** đọc lại điểm rơi thật của phát trước, dò lực đáng lẽ cho ra điểm rơi đó để ước lượng lệch tay rồi bù vào phát sau | ±4 (được bù dần) | ±0,8 / ±0,4° |

Mọi mức đều không bắn phát nào làm chính mình mất máu (mô phỏng trước, bốc lại nhiễu tối đa 6 lần, không được thì bắn cầu vồng cao). Máy nghĩ trên luồng chính: đo trong Node, Khó trung bình 1,5 ms / phát, Dễ và Vừa dưới 1 ms; sinh ván (cả bước kiểm tra màn bắn được) khoảng 5 ms, nên không cần chia nhỏ hay Web Worker. Máy "ngắm" tối thiểu 750 ms (nòng xoay dần tới góc đã chọn).

**Mức mạnh dần** (máy đấu máy, đổi bên và đổi người bắn trước luân phiên, 2 × 200 ván mỗi cặp): Vừa thắng Dễ ~77%, Khó thắng Dễ ~97%, Khó thắng Vừa ~71%. Trong `node test.js` (60 ván mỗi cặp): Vừa–Dễ 73%, Khó–Dễ 92%, Khó–Vừa 65%. Khó tự bù lệch: khoảng trượt trung bình phát 1 là 73 đơn vị, phát 3 còn 20.

## Ghi điểm trên cổng

Metric `wins` (số ván thắng), 15 điểm mặc định; mode theo mức máy: `easy` 10 điểm, `medium` 15 điểm, `hard` 25 điểm (bảng 4.8 của lộ trình: đối kháng với máy).

- Ván mới: `kit.sdk.start(level)`; mở lại ván lưu dở: `kit.sdk.start(level, true)`.
- Hết ván: `kit.sdk.end({ mode: level, won, assisted: false })`; `won` là `true` chỉ khi bạn thắng, thua hoặc hòa gửi `won: false`.
- Bỏ ván đã bắn ít nhất một phát (bấm Ván mới rồi xác nhận): gửi `won: false`. Chưa bắn phát nào thì không gửi gì.
- Chế độ 2 người không gọi `start` / `end`.
- `min_duration_ms` = 3500 cho cả ba mode. Lập luận: một lượt gây tối đa 81 sát thương và máy không bao giờ tự gây hại, nên thắng cần ít nhất 2 phát của bạn và 1 phát của máy ở giữa. Đạn gây sát thương cho đối thủ bay ít nhất 0,88 s (đo trên 200 seed, gió xuôi mạnh nhất, mọi góc / lực); sau mỗi phát có ít nhất 0,42 s nổ + rơi (giảm chuyển động); máy ngắm ít nhất 0,5 s. Tổng ≥ 0,88 + 0,42 + 0,5 + 0,3 + 0,42 + 0,88 + 0,42 ≈ 3,8 s, lấy 3500 ms để còn biên.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-phaothu-settings-v1` | Cài đặt: giao diện, `level` (`easy` / `medium` / `hard`), `opponent` (`cpu` / `human`), `vibrate`, `guideSeen` |
| `playnine-phaothu-stats-v1` | Thống kê (chỉ ván với máy): `levels.<mức>.{played, won, lost, drawn}`, `streak`, `best`, `shots`, `hits` (tỉ lệ trúng) |
| `playnine-phaothu-save-v1` | Ván đang chơi dở `{ v: 1, mode, level, humanShots, game }`; `game` là `toJSON` của engine: `seed`, `terrain` (401 độ cao, làm tròn 0,01), `tanks` (`x`, `hp`, `angle`, `power`, `ammo`), `turn`, `wind`, `rng` (trạng thái bộ số ngẫu nhiên cho gió), `shots`, `winner`, `last` (phát trước của mỗi bên), `mem` (trí nhớ của máy Khó: lệch ước lượng, phát vừa ngắm) |
| `playnine-phaothu-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Ván được lưu ngay sau mỗi phát (trạng thái sau phát đó); rời trang khi đạn đang bay thì hoạt cảnh kết thúc ngay để ván (và kết quả nếu là phát cuối) được ghi nhận. Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `→` | Xoay nòng sang trái / phải 1° (`Shift` 5°) |
| `↑` `↓` | Tăng / giảm lực 1 (`Shift` 5) |
| `Space` / `Enter` | Bắn |
| `1` `2` `3` | Đạn thường / nặng / chùm |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test engine phủ: địa hình tất định theo seed, nằm trong khung, nền pháo phẳng; màn luôn bắn trúng được (200 seed × gió −10/0/+10 × hai bên); tầm bay khớp công thức ném xiên, quỹ đạo đối xứng, gió lệch đúng ½·a·t², đỉnh quỹ đạo v²/2g, đạn ra ngoài mép thì mất, đồi chắn đường; mô phỏng tất định; khoét hố (thành hố, đất sập, nổ trên không, đá đáy), làm tròn để lưu; sát thương theo khoảng cách; pháo rơi và trần sát thương rơi; một lượt không thể thắng; gió đổi theo lượt; đạn có hạn, đạn chùm 3 viên; từ chối phát bắn sai; thắng / thua / hòa / giới hạn số phát; ghi phát trước; máy mọi mức bắn hợp lệ, tất định, không tự gây hại; Khó học từ phát trượt; mức mạnh dần (Vừa–Dễ, Khó–Dễ, Khó–Vừa); lưu / khôi phục (cả trí nhớ của máy) và từ chối dữ liệu hỏng. Test Playwright trong cổng nằm ở `e2e.spec.ts` (thắng, thua, bỏ ván, đổi mức trước phát đầu; chạy cùng `npm run e2e` sau khi build và ghép).
