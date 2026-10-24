# Cờ Vây

Game Cờ Vây (Go) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Bàn **9×9** (mặc định) hoặc **13×13**. Hai bên lần lượt đặt quân lên giao điểm trống; **Đen** đi trước, **Trắng** được **komi 6,5** điểm (nên không bao giờ hòa).
- **Khí** của một nhóm là các điểm trống kề nhóm. Nhóm hết khí thì **bị bắt** (nhấc khỏi bàn). Nhóm còn một khí là đang bị atari.
- **Cấm tự sát**: không được đặt quân làm nhóm của mình hết khí, trừ khi nước đó bắt được quân đối thủ.
- **Ko**: dùng **siêu ko theo thế cờ** (positional superko) — cấm mọi nước tạo lại một thế cờ (vị trí quân trên bàn) đã có trong ván. Lý do: luật Trung Quốc / Tromp-Taylor đi kèm siêu ko; nó bao luôn ko đơn (không bắt lại ngay được) và chặn cả các vòng lặp hiếm như ko ba, ko bốn, nên ván luôn kết thúc. Kiểm tra bằng tập các chuỗi thế cờ đã có (chính xác, không băm), đủ nhanh cho ván thật. Trong mô phỏng của máy chỉ dùng ko đơn cho nhanh; con của gốc cây đã được lọc theo siêu ko nên máy không bao giờ đi sai luật.
- **Bỏ lượt** được bất cứ lúc nào; **hai lần bỏ lượt liên tiếp** là hết ván. Có nút **Đầu hàng**.
- **Tính điểm khu vực** (luật Trung Quốc, kiểu Tromp-Taylor): điểm của mỗi bên = số quân trên bàn + số điểm trống chỉ giáp quân của bên đó; Trắng cộng thêm komi. Không có bước đánh dấu quân chết: **quân còn trên bàn đều tính là sống**, nên phải bắt hết quân chết trước khi bỏ lượt (luật khu vực không phạt việc đi vào đất mình nên không mất điểm). Lý do không làm bước đánh dấu quân chết: nếu người chơi được sửa quân chết thì cũng sửa được kết quả ván xếp hạng; chơi tới khi bắt hết quân chết thì kết quả luôn khách quan.
- Hộp **bỏ lượt** hiện điểm tạm tính (Đen, Trắng + komi, ai hơn bao nhiêu) mỗi khi bỏ lượt có thể kết thúc ván (đối thủ vừa bỏ lượt, hoặc máy sẽ bỏ lượt theo), kèm lời nhắc bắt quân chết trước.
- Không có đi lại.

## Điều khiển

- **Chuột:** rê chuột thấy quân mờ ở điểm đang trỏ, bấm để đặt.
- **Cảm ứng:** chạm một điểm hiện quân mờ có viền (chưa đặt), chạm lại đúng điểm đó mới đặt; chạm điểm khác thì đổi điểm chọn. Tránh chạm nhầm trên bàn nhỏ. Tắt được trong Cài đặt ("Chạm hai lần để đặt").
- **Bàn phím:** mũi tên di chuyển con trỏ (bắt đầu ở nước vừa đi hoặc tâm bàn), `Enter` / `Space` đặt quân (không cần xác nhận), `P` bỏ lượt, `Esc` ẩn con trỏ, `N` ván mới.
- Nút **Bỏ lượt** và **Đầu hàng** dưới bàn (màn hình rộng: cột bên phải). Khi đối thủ vừa bỏ lượt, nút Bỏ lượt đổi màu nhấn.
- Bàn gỗ vẽ bằng SVG: lưới, điểm sao (hoshi), tọa độ (chữ A–J/N bỏ chữ I, số đếm từ dưới lên), quân đá có bóng. Nước vừa đi có vòng tròn; quân bị bắt mờ dần. Hai thanh người chơi hiện số quân **đã bắt**, lượt đi, "Đang nghĩ…", "Đã bỏ lượt".
- **Hết ván:** bỏ lượt hai lần thì tô ô vuông nhỏ trên mọi điểm đất theo đúng cách tính điểm; đầu hàng thì tô **ước lượng** lãnh thổ bằng 48 mô phỏng (quân bị coi là chết mờ đi, có ô đất của bên kia), hộp kết quả ghi rõ là ước lượng. Hộp kết quả có bảng điểm và nút **Xem bàn**.
- Ở 390×844 bàn 9×9 rộng khoảng 358 px (ô ~36 px), 13×13 ô ~26 px. Bật giảm chuyển động thì quân hiện / mất ngay, dấu "đang nghĩ" đứng yên.
- Lần đầu mở game tự hiện hộp **Cách chơi** (lưu `guideSeen` trong cài đặt).

## Máy, chế độ và mode

Chọn trong **Cài đặt**: đối thủ (Máy / 2 người), mức máy, phe (Đen đi trước / Trắng +6,5), cỡ bàn. Chưa đi nước nào (hoặc ván đã xong) thì đổi là chơi ván mới ngay (gửi lại `start` với mode mới, không gửi `end`); đang dở thì áp dụng từ ván sau.

Máy là **MCTS nhẹ**: cây UCT, mỗi vòng mô phỏng ngẫu nhiên tới hết ván (không lấp mắt mình, ko đơn), đếm điểm khu vực + komi. Bàn mô phỏng dùng mảng có viền, nhóm là danh sách vòng, khí "giả" có tổng và tổng bình phương để biết nhóm chỉ còn một khí trong O(1). Tốc độ đo trong Node: ~35.000 mô phỏng/giây ở 9×9, ~21.000 ở 13×13.

| Mode | Máy |
| --- | --- |
| `easy` (Dễ) | 300 mô phỏng (tối đa 0,5 s / 0,7 s), mô phỏng **ngẫu nhiên thuần**, UCT không RAVE. Hay bỏ lỡ đòn bắt quân. |
| `medium` (Vừa) | 3.000 mô phỏng (tối đa 1 s / 1,3 s), mô phỏng có **heuristic**: bắt nhóm vừa đi nếu nó chỉ còn một khí, cứu nhóm mình bị atari (chạy ra chỗ rộng / nối / bắt), tránh tự đưa quân vào atari; cây có **RAVE** (AMAF). |
| `hard` (Khó) | Như Vừa, chạy theo **thời gian 1,5 s (9×9) / 2 s (13×13)** (tối đa 100.000 mô phỏng và 150.000 nút cây để worker dùng dưới ~20 MB; máy dev ~60.000 mô phỏng ở 9×9, ~30.000 ở 13×13), thêm **tri thức ban đầu** cho cây: ưu tiên bắt / cứu quân, tránh tự atari, tránh dòng một lúc đầu ván. |

Luật bỏ lượt / đầu hàng của máy (mọi mức, trong `planMove`):

- **Bỏ lượt** khi thế cờ "đã xong" (cả hai màu có quân, mọi vùng trống chỉ giáp một màu và ≤ 1/4 bàn, không nhóm nào còn một khí), hoặc khi bạn vừa bỏ lượt và tính ngay thì máy thắng, hoặc khi không còn nước nào ngoài lấp mắt mình. Bạn vừa bỏ lượt mà máy đang thua thì máy đi tiếp (lấp điểm trung lập, bắt quân chết của bạn…).
- **Xin thua** khi nước tốt nhất có tỉ lệ thắng mô phỏng < 5% (Dễ < 3%) và ván đã đi ít nhất nửa số điểm trên bàn (41 nước ở 9×9, 85 nước ở 13×13).

Máy nghĩ trong **Web Worker** dựng từ mã nguồn engine (`GameEngine.factory`), không làm đơ giao diện; không tạo được worker thì `planMove` trả đối tượng tìm kiếm và app chạy MCTS từng khúc 25 ms bằng `setTimeout` (tối đa 1,2 s). Máy "nghĩ" ít nhất 500 ms. Máy đi sai luật (không xảy ra) thì app thay bằng một nước hợp lệ.

**Bàn 13×13:** giữ, vì máy chạy theo ngân sách thời gian nên không bao giờ chậm hơn 2 s mỗi nước (điện thoại chậm hơn máy dev khoảng 4–5 lần thì Khó ở 13×13 vẫn có ~8.000 mô phỏng mỗi nước, Vừa ~0,7 s), chỉ yếu hơn so với ở 9×9. Mặc định 9×9.

**Mức mạnh dần** (đổi màu xen kẽ; Khó tính theo số mô phỏng để tất định):

| Cặp | Bàn | Kết quả (mức cao thắng) | Nguồn |
| --- | --- | --- | --- |
| Vừa – ngẫu nhiên | 9×9 | 6/6 | `test.js` |
| Khó (3.000 mô phỏng) – Dễ | 9×9 | 6/6 | `test.js` |
| Vừa – Dễ | 9×9 | 4/4 (`test.js`), 12/12 | `test.js`, script tạm |
| Dễ – ngẫu nhiên | 9×9 | 20/20 | script tạm |
| Khó (10.000) – Vừa | 9×9 | 11/12 | script tạm |
| Vừa – Dễ | 13×13 | 4/4 | script tạm |
| Khó (8.000) – Vừa | 13×13 | 3/4 | script tạm |

Trong trình duyệt Khó chạy nhiều mô phỏng hơn các con số trên nên còn mạnh hơn.

**2 người cùng máy:** hai người lần lượt đặt quân (thanh trên là Trắng, thanh dưới là Đen), bỏ lượt / đầu hàng cho bên tới lượt. Chế độ này không gửi gì cho cổng (không `start` / `end`) và có thống kê riêng.

## Ghi điểm trên cổng

Metric `wins` (số ván thắng), 15 điểm mặc định; mode theo mức máy (cỡ bàn chọn tự do, không đổi mode): `easy` 10 điểm, `medium` 15 điểm, `hard` 25 điểm (bảng 4.8 của lộ trình), mỗi mode luật `min_duration_ms` **8000**.

- Lập luận cho 8000 ms: máy không bao giờ bỏ lượt khi đang thua, trừ khi thế cờ đã xong; muốn thắng bạn cần máy xin thua (chỉ sau ≥ 41 nước ở 9×9, tức ≥ 20 lần máy nghĩ × ≥ 0,5 s = 10 s) hoặc một thế đã xong mà Đen hơn: nhanh nhất cũng cần khoảng 13 quân của bạn và 12 nước của máy (bàn chia thành các vùng ≤ 20 điểm), tức ≥ 12 × 0,5 s = 6 s máy nghĩ cộng ≥ 13 lần chạm (cảm ứng có xác nhận là 26 lần chạm) — trên 8 s. 13×13 còn lâu hơn.
- Ván mới: `kit.sdk.start(level)`; mở lại ván lưu dở: `kit.sdk.start(level, true)`.
- Hết ván: `kit.sdk.end({ mode: level, won, assisted: false })`; thắng (tính điểm hoặc máy xin thua) `won: true`, thua hoặc đầu hàng `won: false`. Komi 6,5 nên không có hòa.
- Bỏ ván đã đi ít nhất một nước (kể cả bỏ lượt) rồi bấm Ván mới và xác nhận: gửi `won: false`. Chưa đi nước nào thì không gửi gì. Nút Đầu hàng chỉ bật khi bạn đã đi.
- Không có đi lại hay gợi ý nên `assisted` luôn `false`. Chế độ 2 người không gửi gì.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-covay-settings-v1` | Cài đặt: giao diện, `opp` (`ai` / `pvp`), `level` (`easy` / `medium` / `hard`), `side` (`black` / `white`), `size` (`'9'` / `'13'`), `confirm` (chạm hai lần để đặt, true / false), `guideSeen` |
| `playnine-covay-stats-v1` | Thống kê: `levels.<mức>.{played, won, lost}`, `streak`, `best`, `pvp.{played, black, white}` |
| `playnine-covay-save-v1` | Ván đang chơi dở `{ v: 1, opp, level, human (1 Đen / 2 Trắng), humanMoves, seed (hạt giống của máy), game }`; `game` là `toJSON` của engine: `{ v: 1, n, komi, moves }`, `moves` là chỉ số điểm (`r * n + c`) hoặc `-1` cho bỏ lượt. Khi mở lại, engine đi lại từng nước (kiểm luật, cả siêu ko) nên ván lưu sai luật bị bỏ |
| `playnine-covay-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `→` `↓` | Di chuyển con trỏ trên bàn |
| `Enter` / `Space` | Đặt quân ở điểm dưới con trỏ |
| `P` | Bỏ lượt (hỏi lại nếu có thể hết ván) |
| `Esc` | Ẩn con trỏ / bỏ điểm đang chọn; đóng hộp thoại |
| `N` | Ván mới |

## Kiểm tra

```bash
node test.js
```

Test engine phủ: hình học, tên điểm và điểm sao; bắt một quân, bắt nhóm, bắt ở góc, đếm quân bị bắt; cấm tự sát (một quân, cả nhóm) và nước không khí nhưng bắt được quân; ko (không bắt lại ngay, bắt lại sau khi đi chỗ khác) và siêu ko; bỏ lượt, hai lần bỏ lượt hết ván; tính điểm khu vực + komi (bàn trống, tường, vùng trung lập), đầu hàng, thế "đã xong"; lưu / khôi phục và từ chối dữ liệu hỏng; bàn mô phỏng nhanh khớp luật thật trên 33 ván ngẫu nhiên (bàn, atari, khí còn lại, số quân nhóm, nước hợp lệ, nạp lại); máy mọi mức luôn đi đúng luật ở 9×9 và 13×13, bắt nhóm bị atari, không lấp mắt mình, bỏ lượt / không bỏ lượt / xin thua đúng lúc, tất định theo seed, chạy từng khúc và dừng theo hạn giờ; ước lượng chủ đất; và ba test **mức mạnh dần** (bảng trên). Chạy khoảng 35 giây. Test Playwright trong cổng nằm ở `e2e.spec.ts` (chạy cùng `npm run e2e` sau khi build và ghép): thắng bằng bỏ lượt, máy xin thua, đầu hàng, bỏ ván.
