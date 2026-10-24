# Bi-a

Game Bi-a (8-Ball Pool, bi-a 8 bi đấu máy) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, vẽ bằng `<canvas>`, vật lý 2D tự viết (không thư viện), dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi (8 bi, bản rút gọn phổ biến)

- Bàn 2:1 (mặt bàn 1000 × 500 đơn vị), 6 lỗ: 4 lỗ góc, 2 lỗ giữa cạnh dài. 15 bi xếp tam giác ở điểm đặt bi (cuối bàn): bi 8 ở giữa hàng ba, hai góc hàng cuối một bi trơn một bi sọc, còn lại xáo theo seed của ván.
- **Phá bi:** người phá đặt bi cái ở bất kỳ đâu phía sau vạch phát bi (¼ bàn) rồi đánh. Đấu với máy thì bạn luôn phá.
- **Bàn mở → chia nhóm:** bi đầu tiên vào lỗ trong một cú **không phạm lỗi** (tính cả cú phá) quyết định nhóm của người đánh: **bi trơn 1–7** hoặc **bi sọc 9–15**; đối phương nhận nhóm còn lại. Cùng một cú vào cả trơn lẫn sọc thì lấy bi rơi trước.
- **Đánh tiếp:** vào ít nhất một bi nhóm mình (không phạm lỗi) thì được đánh tiếp; không vào, hoặc chỉ vào bi của đối phương, thì đổi lượt (không phải lỗi).
- **Phạm lỗi** — đối phương được **bi trong tay** (đặt bi cái ở bất kỳ chỗ trống nào trên bàn):
  - bi cái rơi lỗ;
  - bi cái không chạm bi nào;
  - bi chạm đầu tiên không hợp lệ: chạm bi của đối phương, hoặc chạm bi 8 khi chưa hết nhóm (bàn mở: chạm bi 8 trước cũng là lỗi; đã hết nhóm: phải chạm bi 8 trước);
  - sau khi chạm bi, không bi nào chạm băng và không bi nào vào lỗ.
  Cú phạm lỗi không chia nhóm và không được đánh tiếp. Bi cái rơi lỗ thì được đặt lại ở chỗ trống gần điểm đầu bàn (người có bi trong tay kéo đi chỗ khác tùy ý).
- **Bi 8:** đưa bi 8 vào lỗ khi **đã hết nhóm trước cú đánh** và **không phạm lỗi** là **thắng**. Vào bi 8 sớm (còn bi nhóm, bàn còn mở, hoặc vào bi cuối nhóm cùng cú với bi 8) hoặc vào bi 8 cùng lúc phạm lỗi là **thua**. Bi 8 rơi khi phá thì đặt lại ở điểm đặt bi (gần nhất còn trống), người phá đánh tiếp nếu không phạm lỗi.
- Không gọi lỗ (không cần báo trước lỗ), không có hòa, không có đánh lại. Chỗ khác luật WPA: không có luật "4 bi chạm băng khi phá", bi trong tay sau lỗi ở cú phá được đặt khắp bàn.

## Vật lý

- Bi bán kính 15; mô phỏng **bước cố định 1/240 s**. Trong mỗi bước engine tìm **thời điểm va chạm chính xác** sớm nhất (giải phương trình bậc hai cho bi–bi, bi–mũi băng; khoảng cách tới đường băng cho bi–băng), đi tới đúng lúc đó, xử lý, rồi tiếp phần còn lại của bước (tối đa 200 va chạm / bước). Vì vậy không có bi xuyên bi hay xuyên băng dù đánh lực 100% (3200 đơn vị/s).
- **Bi–bi:** va chạm đàn hồi, khối lượng bằng nhau, hệ số nảy 0,95 (va chạm thẳng: bi đích nhận 97,5% vận tốc, bi cái còn 2,5%); động lượng bảo toàn tuyệt đối. **Bi–băng:** hệ số nảy 0,75, phần dọc băng giữ 96%. Băng là các đoạn thẳng, hai đầu đoạn là mũi băng tròn; lỗ góc có thành dẫn chéo 45°, lỗ giữa có thành hơi khép.
- **Ma sát lăn:** giảm tốc đều 200 đơn vị/s² cộng cản 0,25·v; chậm hơn 4 đơn vị/s là dừng hẳn. Cú mạnh nhất dừng sau khoảng 6 s.
- **Vào lỗ:** tâm bi lọt vào vùng tròn sau miệng lỗ (bán kính 26 ở lỗ góc, 24 ở lỗ giữa).
- **Cú phá:** 15 bi tam giác chạm nhau cùng lúc; va chạm từng cặp sẽ dồn hết lực vào một dây bi nên khi bi cái chạm tam giác, engine chuyển sang **tiếp xúc mềm** (lò xo cứng + giảm chấn ứng với hệ số nảy 0,95, bước 10 µs) tới khi các bi tách nhau, rồi quay lại va chạm tức thời. Phá lực 100% trung bình vào ~1,5 bi.
- **Xoáy (đơn giản):** chọn từ −100% (kéo) tới +100% (theo). Ở va chạm đầu tiên của bi cái với bi khác, bi cái được cộng thêm `0,5 × xoáy × vận tốc trước va chạm` theo hướng cũ (yếu dần theo quãng đã lăn trước khi chạm). Không có xoáy ngang.
- Mô phỏng hoàn toàn tất định (cùng ván + cùng cú đánh → cùng kết quả). Engine ghi khung hình 60 / s và các sự kiện (va chạm, vào lỗ) để app phát lại và phát âm thanh.

## Điều khiển

- **Ngắm:** chạm / bấm giữ ở bất kỳ đâu trên bàn rồi kéo: gậy chỉ từ bi cái về phía ngón tay. Nút `↺` `↻` xoay 0,1° mỗi lần (giữ để chạy liên tục, nhanh dần).
- **Lực:** thanh Lực (2–100%). Sau cú phá lực tự về 40%.
- **Xoáy:** chạm nửa trên quả bi nhỏ ở bảng đánh để đánh theo, nửa dưới để đánh kéo, giữa để bỏ xoáy (nấc 25%).
- **Đánh:** nút **Đánh**. Khi bi đang lăn: nút ⏩ / chạm bàn / `Space` để tua nhanh ×3.
- **Bi trong tay:** kéo chính bi cái tới chỗ mới (vòng nét đứt quanh bi; đỏ khi chỗ đó không đặt được, thả ra thì bi quay về chỗ hợp lệ gần nhất). Cú phá chỉ đặt được trong vùng sau vạch phát bi (vùng sáng hơn).
- **Đường ngắm dự đoán** (bật / tắt trong Cài đặt, mặc định bật): đường đứt tới chỗ chạm đầu tiên + "bi ma", hướng bi đích sẽ đi (đỏ kèm dấu × nếu bi đó không được chạm trước), hướng bi cái sau va chạm (đã tính xoáy). Độ dài phần sau chỗ chạm theo mức máy: **Dễ** dài nhất (280 / 170 đơn vị), **Vừa** 120 / 70, **Khó** chỉ 50 và không có hướng bi cái; chế độ 2 người dùng độ dài của Vừa. Đường ngắm chỉ là trợ giúp hiển thị, **không ảnh hưởng điểm** (ván luôn gửi `assisted: false`) vì mỗi mức có bảng xếp hạng riêng.
- Màn hình dọc: bàn dựng đứng (đầu bàn ở dưới), bảng đánh ở dưới; màn hình ngang đủ rộng: bàn nằm ngang, bảng đánh bên phải. Canvas co theo khung, không cuộn.
- **Giảm chuyển động** (`prefers-reduced-motion`): bỏ hoạt cảnh gậy thúc và bi lọt lỗ, máy nghĩ / xoay gậy nhanh hơn, phát lại bi lăn nhanh ×2 (vẫn mô phỏng đầy đủ, vẫn tua ×3 được).
- Có chế độ **2 người cùng máy** (Cài đặt → Đối thủ): hai người lần lượt dùng chung bảng đánh; không báo điểm cho cổng, không tính thống kê.

## Máy và mode

Chọn mức trong **Cài đặt**. Chưa đánh cú nào thì đổi mức / đối thủ là chơi ván mới ngay (gửi lại `start` với mode mới, không gửi `end`); đã đánh thì áp dụng từ ván sau.

Máy chạy trong engine thuần, tất định theo (seed của ván, số cú, bên đánh, mức). Mỗi lượt máy:

1. Dựng **ứng viên vào lỗ**: mỗi bi được phép chạm × mỗi lỗ, ngắm theo **bi ma** (điểm bi cái phải chạm để bi đích đi thẳng vào điểm ngắm của lỗ), loại cú bị bi khác chắn đường, cắt quá mỏng (> ~78°) hay góc vào lỗ giữa quá xiên; xếp theo độ dễ (góc cắt, quãng đường). Có bi trong tay thì thử thêm các chỗ đặt bi cái thẳng / lệch ±17° sau bi ma.
2. **Mô phỏng bằng chính engine** từng ứng viên với vài mức lực (tính từ quãng đường + ma sát, nhân hệ số dư) và xoáy, **chấm** ván sau cú đánh: thắng / thua (±10⁶), phạm lỗi (−400), số bi nhóm mình / đối phương vào, được đánh tiếp (+300) cộng **vị trí bi cái** cho cú sau (độ dễ của cú tốt nhất kế tiếp), hoặc nếu mất lượt thì trừ theo cú dễ nhất của đối phương (có bi trong tay thì trừ 220).
3. Không có cú vào lỗ tốt: thử **chạm an toàn** (chạm thẳng / hơi mỏng bi hợp lệ gần nhất, 2 mức lực); bị chắn hết thì **quét hướng** đều quanh bi cái (đánh băng) để tìm cú không phạm lỗi.
4. **Thử lại vài cú tốt nhất với lệch tay** ±1,5 lần nhiễu (góc, lực) và chọn cú có điểm trung bình cao nhất, tránh cú dễ hỏng (ví dụ làm rơi bi 8).
5. Cộng **nhiễu tay** (phân bố chuẩn) theo mức rồi đánh.

| Mode | Ứng viên mô phỏng | Lực × xoáy | Nhiễu góc / lực | Vị trí bi cái | Thử lệch tay |
| --- | --- | --- | --- | --- | --- |
| `easy` (Dễ) | 3 | 1 × 1 | 1,5° / 12% | không tính | không |
| `medium` (Vừa) | 7 | 2 × 1 | 0,55° / 6% | có | 3 cú |
| `hard` (Khó) | 12 | 3 × 3 (kéo / không / theo) | 0,15° / 2,5% | có | 4 cú |

Máy nghĩ theo từng phần (`createPlanner().step`, mỗi lần ≤ 8 ms trong `setTimeout`) nên giao diện không đơ; đo trong Node: Khó ~17 ms / cú, Vừa ~9 ms, Dễ ~1 ms (Chromium không ghi nhận long task nào khi máy Khó nghĩ). Máy "nghĩ" tối thiểu 700 ms rồi xoay gậy tới góc đã chọn trong 450 ms (có bi trong tay thì bi cái trượt tới chỗ đặt).

**Mức mạnh dần** (máy đấu máy, đổi bên và đổi người phá luân phiên, 40 ván mỗi cặp): Khó thắng Dễ 38/40, Vừa thắng Dễ 36/40, Khó thắng Vừa 35/40, Vừa thắng bot ngẫu nhiên 38/40 (hai ván thua do vô tình làm rơi bi 8 ngay cú thứ hai). Tỉ lệ cú vào bi (được đánh tiếp): Dễ ~27%, Vừa ~48%, Khó ~71–75%. Trong `node test.js` (30 ván mỗi cặp): Khó–Dễ 29/30, Vừa–Dễ 28/30, Khó–Vừa 27/30, Vừa–ngẫu nhiên 29/30.

## Ghi điểm trên cổng

Metric `wins` (số ván thắng), 15 điểm mặc định; mode theo mức máy: `easy` 10 điểm, `medium` 15 điểm, `hard` 25 điểm (bảng 4.8 của lộ trình: đối kháng với máy).

- Ván mới: `kit.sdk.start(level)`; mở lại ván lưu dở: `kit.sdk.start(level, true)`.
- Hết ván: `kit.sdk.end({ mode: level, won, assisted: false })`; thua gửi `won: false` (8 bi không có hòa).
- Bỏ ván đã đánh ít nhất một cú (bấm Ván mới rồi xác nhận): gửi `won: false`. Chưa đánh cú nào thì không gửi gì.
- Chế độ 2 người không gọi `start` / `end`.
- `min_duration_ms` = 5000 cho cả ba mode. Lập luận: thắng cần dọn 7 bi rồi vào bi 8, bi 8 rơi khi phá thì được đặt lại, nên ít nhất là cú phá + vài cú vào bi + cú bi 8. Đo 300 ván máy Khó (đóng vai người) đấu máy Dễ: ván thắng nhanh nhất là phá rồi dọn bàn trong 6–7 cú; nếu người chơi bấm Đánh chỉ 0,2 s sau mỗi lượt và bật tua ×3 suốt ván (giảm chuyển động, không có gậy thúc) thì vẫn mất ≥ 5,9 s, ở tốc độ thường ≥ 15,9 s. Lấy 5000 ms (mức sàn của game lớn) để không chặn nhầm ván thật.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-bia-settings-v1` | Cài đặt: giao diện, `level` (`easy` / `medium` / `hard`), `opponent` (`cpu` / `human`), `guide` (đường ngắm), `vibrate`, `guideSeen` |
| `playnine-bia-stats-v1` | Thống kê (chỉ ván với máy): `levels.<mức>.{played, won, lost}`, `streak`, `best`, `shots`, `pots` (tỉ lệ cú đưa được bi nhóm mình vào lỗ, không tính cú phá) |
| `playnine-bia-save-v1` | Ván đang chơi dở `{ v: 1, mode, level, humanShots, aim: { angle, power, spin }, game }`; `game` là `toJSON` của engine: `seed`, `balls` (16 × `[x, y, trên bàn 0/1]`, làm tròn 0,001), `turn`, `groups` (`null` khi bàn mở, hoặc nhóm của bên 0 / bên 1), `isBreak`, `ballInHand`, `kitchen` (bi trong tay chỉ sau vạch phát bi), `shots`, `winner`, `last` (tóm tắt cú vừa đánh: lỗi, bi vào, nhóm vừa chia…) |
| `playnine-bia-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Ván được lưu ngay sau mỗi cú đánh (trạng thái khi bi đã dừng); rời trang khi bi đang lăn thì hoạt cảnh kết thúc ngay để ván (và kết quả nếu là cú cuối) được ghi nhận. Đến lượt máy khi mở lại thì máy nghĩ lại từ đầu (kết quả như cũ vì tất định). Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `→` | Xoay hướng ngắm 0,25° (`Shift` 2°) |
| `↑` `↓` | Tăng / giảm lực 1% (`Shift` 10%) |
| `W` `S` | Xoáy theo / kéo thêm 25% |
| `Space` / `Enter` | Đánh; khi bi đang lăn: bật / tắt tua nhanh |
| `M` | Bi trong tay: bật / tắt chế độ đặt bi cái bằng phím mũi tên (5 đơn vị, `Shift` 25) |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Chạy khoảng 15–20 s. Test engine phủ:

- **Ván mới:** tam giác đúng chuẩn (bi 8 giữa, hai góc khác nhóm, không đè nhau), bi cái sau vạch, tất định theo seed.
- **Vật lý:** va chạm thẳng (bi đích nhận (1 + e)/2, bi cái (1 − e)/2, không lệch hướng); bảo toàn động lượng và động năng không tăng ở **mọi** va chạm bi–bi của 100 cú (phá + ngẫu nhiên); bật băng đúng thời điểm, vận tốc, góc; bi dừng hẳn (mọi cú lực 100% dừng trong < 12 s); **không xuyên băng / xuyên bi** (kiểm từng khung hình của 30 cú lực tối đa với bi rải ngẫu nhiên, 10 cú phá, các cú thẳng / sát băng); bi đi thẳng vào đúng từng lỗ trong 6 lỗ; mô phỏng tất định; xoáy theo / kéo; đường ngắm dự đoán khớp va chạm đầu tiên và hướng bi đích trong mô phỏng.
- **Luật:** vạch phát bi khi phá, bi 8 rơi khi phá được đặt lại; chia nhóm (cả khi phá, cả bên 1, phạm lỗi thì không chia); đánh tiếp / đổi lượt; từng loại lỗi (giả lập và mô phỏng thật) → bi trong tay, bi cái được đặt lại chỗ hợp lệ; đặt bi trong tay hợp lệ / không hợp lệ; thắng / thua bằng bi 8 (đúng lúc, sớm, cùng cú với bi cuối nhóm, kèm lỗi, bàn mở); từ chối cú đánh sai.
- **Máy:** mọi mức luôn đánh hợp lệ (cả cú phá, bi trong tay), tất định; chia nhỏ được (`step(1)`) và cho cùng kết quả; Khó vào bi nhiều hơn Dễ rõ rệt; mức mạnh dần (Khó–Dễ, Vừa–Dễ, Khó–Vừa, Vừa–ngẫu nhiên).
- **Lưu / khôi phục:** giữ nguyên ván qua JSON (máy chọn cùng cú), từ chối 23 kiểu dữ liệu hỏng (sai phiên bản, thiếu bi, bi đè nhau, nhóm sai, bi 8 / bi cái rơi mà chưa xong ván…).

Test Playwright trong cổng nằm ở `e2e.spec.ts` (thắng bằng bi 8, thua vì vào bi 8 sớm, bỏ ván, đổi mức trước cú đầu; chạy cùng `npm run e2e` sau khi build và ghép).
