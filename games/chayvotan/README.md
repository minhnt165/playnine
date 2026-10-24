# Chạy Vô Tận

Game Chạy Vô Tận (Endless Runner) của PlayNine: nhân vật tự chạy trên đường cuộn ngang, nhanh dần; nhảy qua cột và hố, nhảy lên bậc, trượt dưới vật bay và nhặt xu. Viết bằng HTML + CSS + JavaScript thuần (vẽ bằng `<canvas>`), dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Thế giới nhìn ngang, một làn, cao 360 đơn vị (mặt đất ở 300). Nhân vật tự chạy; tốc độ tăng tuyến tính theo quãng đường từ 330 lên 660 đơn vị/giây (đạt trần ở 1800 m, khoảng 95 giây chạy).
- **Chướng ngại**: cột thấp (phải nhảy), hố (rơi là thua; hố rộng phải giữ nhảy lâu), vật bay ngang tầm đầu (trượt để chui qua, hoặc nhảy thật cao), bậc thấp (36) và bậc cao (70) phải nhảy lên rồi chạy trên mặt bậc. Chạm cột, vật bay, thành bậc hoặc rơi xuống hố là hết ván.
- **Nhảy**: giữ phím lâu thì nhảy cao hơn (chạm nhẹ cao ≈ 76, giữ hết 0,4 s cao ≈ 149; bay 0,40 → 0,68 s). Coyote time 0,1 s (vừa hụt chân khỏi mép vẫn nhảy được), đệm nhảy ≈ 0,12 s (bấm sớm trước khi chạm đất thì nhảy ngay lúc chạm). Giữ phím không tự nhảy lại. Giữ xuống khi đang bay thì rơi nhanh.
- **Trượt**: giữ xuống khi ở mặt đất, người thấp còn một nửa. Buông ra mà vật bay còn ở trên đầu thì vẫn cúi tới khi qua hẳn.
- **Lông vũ** (thỉnh thoảng xuất hiện ở đoạn nghỉ, phải nhảy để lấy): được nhảy đôi trong 15 giây (một lần mỗi lượt bay).
- **Vùng va chạm** của nhân vật và chướng ngại đều nhỏ hơn hình vẽ (nhân vật 22 × 40 so với hình 30 × 48; cột 18 × 42 so với 26 × 48; vật bay 30 × 28 so với 46 × 34), xu nhặt dễ hơn hình. Bậc thấp hơn 8 đơn vị thì tự bước lên.
- **Điểm** = số mét (25 đơn vị = 1 m) + 5 × số xu.
- **Đường chạy** ghép từ 16 kiểu "khúc" thiết kế sẵn (`run`, `post`, `pit`, `flyer`, `stepLow`, `post2`, `pitWide`, `stepHigh`, `flyerPost`, `postFlyer`, `pitPit`, `stairs`, `flyer2`, `stepPost`, `pitFlyer`, `gauntlet`). PRNG mulberry32 theo seed chọn khúc (trọng số, hạn chế lặp một kiểu liên tiếp) trong số các kiểu đã mở theo độ khó; độ khó tăng tuyến tính tới 2400 m, kiểu khó mở dần, đoạn nghỉ đầu khúc ngắn dần từ 1,0 s xuống 0,5 s. Kích thước ngang của khúc tính theo tốc độ lúc đó (giây × tốc độ) nên luôn vượt được — test chứng minh bằng bot hoàn hảo.
- Mô phỏng theo bước cố định 1/120 giây (engine thuần, tất định theo seed + chuỗi input `{ jump, down }` mỗi bước); app đổi thời gian thật thành số bước (khung hình dài quá 100 ms chỉ tính 100 ms), nội suy hình vẽ giữa hai bước. Khung nhìn luôn rộng ít nhất 640 đơn vị (điện thoại dọc thì thu nhỏ, thêm trời phía trên) để thấy trước chướng ngại ≥ 0,83 s ở tốc độ tối đa.
- Nền nhiều lớp thị sai tự vẽ: núi tuyết, mây, đồi, hàng cây, mặt đất có sỏi; cột mốc mỗi 100 m và cờ kỷ lục quãng đường. Giao diện sáng là ban ngày (mặt trời), tối là ban đêm (trăng khuyết, sao lấp lánh).

## Điều khiển

- **Bàn phím**: `Space` / `↑` / `W` nhảy (giữ = cao hơn), `↓` / `S` trượt (giữ).
- **Cảm ứng**: chạm **nửa phải** màn để nhảy (giữ = cao hơn), giữ **nửa trái** để trượt; có nhãn "Trượt" / "Nhảy" ở hai góc dưới, sáng lên khi đang giữ. Chọn chạm hai nửa thay cho vuốt vì vuốt không giữ được (không chỉnh được độ cao nhảy, không giữ trượt) và phải chờ ngón tay di chuyển mới nhận ra hướng (trễ thêm vài chục ms); hai nửa màn là vùng chạm rất lớn, một ngón là đủ.
- Phím / chạm ngắn hơn một bước mô phỏng vẫn được ghi (chốt tới bước kế tiếp).
- Màn chờ: nút **Chơi** (`#btn-start`), Space / Enter hoặc chạm cũng bắt đầu. Sau đó nhân vật đứng ở vạch xuất phát; lần bấm / chạm đầu tiên chỉ để bắt đầu chạy (không tính là nhảy).
- Nút tạm dừng cạnh ô điểm, phím `P` / `Esc`. Tự tạm dừng khi trang bị ẩn, cửa sổ mất focus hoặc mở hộp thoại. Chơi tiếp thì đếm 3-2-1 (1,5 s) rồi mới chạy.
- Lần đầu mở game hiện hộp Cách chơi (ghi `guideSeen` trong cài đặt).
- Cài đặt: giao diện, ngôn ngữ, âm thanh (của cổng) và **rung** (khi va chạm và khi nhặt lông vũ).

## Mode và ghi điểm trên cổng

Một mode `classic` (Cổ điển), metric `score_high`, 5 điểm tham gia.

- Bấm Chơi / Chơi lại / Ván mới: `kit.sdk.start('classic')`; mở lại lượt lưu dở: `kit.sdk.start('classic', true)`.
- Hết ván: `kit.sdk.end({ mode: 'classic', won: false, score, assisted: false })` (game vô tận, không có thắng).
- Bỏ lượt (nút Ván mới, `N`, Ván mới trong lớp tạm dừng) khi đã có điểm hoặc đã chạy ≥ 1 giây: hỏi xác nhận rồi gửi `won: false` với điểm hiện có. Chưa bắt đầu chạy thì chia lượt mới, không gửi gì.
- Luật chống gian lận: `min_duration_ms` 5000, `max_score_per_sec` 80.
  - Đo bằng bot (script tạm, không nằm trong repo): bot tìm đường chỉ biết đường tới `x(t − 250 ms) + 550` đơn vị (thời gian phản ứng người + khung nhìn hẹp nhất), quyết định trên lưới 25 ms, ưu tiên nhặt xu. 30 seed × 10 phút: 29 seed sống đủ 10 phút; tốc độ điểm (điểm / thời gian từ đầu ván, xét sau giây thứ 5) cao nhất **38,8 điểm/s** (≈ 26,4 m/s tốc độ trần + ≈ 2,5 xu/s × 5). Bot hoàn hảo (không trễ, biết hết đường, tham xu) 5 seed × 10 phút: 38,0 điểm/s.
  - Trần lý thuyết nếu nhặt được **mọi** xu trên đường: 41,6 điểm/s (50 seed × 10 phút).
  - Đặt 80 (≈ ×2 số đo). Không đặt `max_score` vì game vô tận.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-chayvotan-settings-v1` | Cài đặt: giao diện, `vibrate`, `guideSeen` |
| `playnine-chayvotan-stats-v1` | Thống kê: số lượt, điểm cao nhất, quãng xa nhất (m), tổng điểm (tính trung bình), tổng quãng đường, tổng xu |
| `playnine-chayvotan-save-v1` | Lượt đang chạy dở (`{ v: 1, game }`, `game` là `toJSON` của engine: seed, số bước, vị trí, trạng thái nhảy / trượt, xu…): ghi khi tạm dừng / rời trang, mở lại ở trạng thái tạm dừng |
| `playnine-chayvotan-summary-v1` | Tóm tắt cho thẻ game trên cổng (kỷ lục, quãng xa nhất, lượt dở) |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng bị bỏ qua: sai phiên bản, thiếu trường, số không hữu hạn, quãng đường không khớp đúng số bước đã chạy (đường chạy tính lại từ seed), nhiều xu hơn số xu có trên đoạn đã chạy, id xu không có thật / trùng, nguyên nhân thua không khớp trạng thái…

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `Space` / `↑` / `W` | Nhảy (giữ = cao hơn); ở màn chờ thì bắt đầu; khi tạm dừng thì chơi tiếp |
| `↓` / `S` | Trượt (giữ); trên không thì rơi nhanh |
| `Enter` | Bắt đầu / chơi tiếp / chơi lại ở bảng kết quả |
| `P` / `Esc` | Tạm dừng / chơi tiếp (`Esc` đóng hộp thoại nếu đang mở) |
| `N` | Ván mới |

## Kiểm tra

```bash
node test.js
```

Test engine (29 test, < 1 s) phủ: tốc độ tăng rồi dừng ở trần; độ cao nhảy theo thời gian giữ, giữ phím không tự nhảy lại, coyote time, đệm nhảy, rơi nhanh, nhảy đôi và nhặt lông vũ; trượt và tự cúi dưới vật bay; va chạm cột / vật bay / thành bậc / hố, hộp va chạm nhỏ hơn hình (hình chạm mà hộp chưa chạm thì không chết), hố rộng cần giữ nhảy; xu (không nhặt trùng) và công thức điểm; sinh khúc tất định theo seed, khúc nối liền, độ khó tăng theo quãng; **luôn vượt được**: bot hoàn hảo (tìm sâu trên các nút ở mặt đất) qua mọi kiểu khúc ở 4 mức tốc độ × 4 biến thể, và qua 60 khúc liên tiếp ở đầu ván lẫn lúc tốc độ tối đa trên 4 seed (chạy lại đường của bot bằng engine để xác nhận); tất định (cùng seed + input; 30 / 60 / 144 Hz và khung giật ra cùng số bước); lưu / khôi phục (chạy tiếp ra đúng kết quả) và từ chối dữ liệu hỏng.

`e2e.spec.ts` chạy trong cổng: lượt lưu dựng sẵn (39 điểm, ngay trước một cái cột) chơi tiếp không bấm gì thì báo đúng `pn:end` 58 điểm, lượt mới không nhảy thì báo `pn:end` đúng điểm trên bảng kết quả, bỏ lượt trước khi chạy thì không báo.
