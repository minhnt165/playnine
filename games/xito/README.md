# Xì Tố

Game Xì Tố (Hold'em Poker) của PlayNine: Texas Hold'em không giới hạn (no-limit), bạn đấu với ba người máy trong một giải 4 người dùng chip ảo. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (kit + bộ bài `cards.js`, xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo giải qua SDK.

Không có tiền thật, không cá cược, không mua chip: mỗi giải ai cũng bắt đầu lại với 1000 chip ảo.

## Luật

- 4 người (bạn ở ghế dưới, ba máy Mai / Tùng / Lan theo chiều kim đồng hồ), mỗi người 1000 chip, tổng 4000.
- **Mù** tăng sau mỗi 6 ván: 10/20, 15/30, 20/40, 30/60, 40/80, 50/100, 75/150, 100/200, 150/300, 200/400, 300/600 … tới 2000/4000. Với 4000 chip, giải thường xong sau 25–45 ván (khoảng 10–20 phút).
- **Nút dealer** xoay sang người còn chip kế tiếp mỗi ván. Hai người bên trái nút đặt mù nhỏ, mù lớn; người sau mù lớn nói trước ở pre-flop, người đầu tiên bên trái nút nói trước ở các vòng sau. Còn 2 người thì nút đặt mù nhỏ, nói trước ở pre-flop và nói sau ở các vòng sau.
- Mỗi người 2 lá tẩy; 5 lá chung lật làm ba vòng: flop (3), turn (1), river (1) (có đốt 1 lá trước mỗi vòng). Bốn vòng cược: pre-flop, flop, turn, river.
- **Hành động**: bỏ bài (fold, chỉ khi đang bị cược), xem (check, khi không phải theo), theo (call), cược (bet) / tố (raise) và all-in. Mức tố tối thiểu = mức tố liền trước (ít nhất 1 mù lớn). All-in thiếu (chưa đủ một lần tố) không mở lại quyền tố cho người đã nói. Không đủ chip để theo thì theo là all-in. Mù lớn thiếu chip thì người khác vẫn phải theo đủ mức mù lớn.
- **Pot phụ**: chia theo từng mức góp; mỗi pot chỉ người còn bài đã góp đủ mức đó mới được tranh. Phần cược không ai theo nổi được trả lại.
- **So bài**: 5 lá tốt nhất từ 7 lá (2 lá tẩy + 5 lá chung). Thứ tự: thùng phá sảnh lớn > thùng phá sảnh > tứ quý > cù lũ > thùng > sảnh > sám cô > thú > đôi > mậu thầu; A-2-3-4-5 là sảnh nhỏ nhất, không vòng qua A (Q-K-A-2-3 không là sảnh). Bằng nhau thì chia đều; chip lẻ cho người thắng ngồi gần bên trái nút nhất.
- **Hết giải**: bạn hết chip là bị loại (thua, hạng = 1 + số máy còn chip); bạn ăn hết 4000 chip là vô địch (thắng).

## Điều khiển

- Đến lượt bạn: chọn mức bằng thanh trượt hoặc ½ pot / Pot / All-in, rồi bấm **Cược / Tố lên …**; hoặc **Bỏ**, **Xem / Theo …**.
- ½ pot / Pot: tố = theo đủ rồi cộng thêm ½ / cả pot sau khi theo; làm tròn bội số mù nhỏ.
- Hết ván: lá của người còn bài lật lên, 5 lá thắng được tô sáng, bấm **Ván tiếp**.
- Máy nghĩ 400–1400 ms tùy **Tốc độ máy** trong Cài đặt (Chậm / Vừa / Nhanh). Mỗi vòng lật bài chung dừng ít nhất 700 ms; ván cuối của giải giữ bàn 2 giây trước khi hiện kết quả. Giảm chuyển động chỉ tắt hiệu ứng trang trí (chia lá bay, lật lá, vòng sáng máy đang nghĩ), không đổi nhịp chơi.
- Cài đặt khác: mức máy (áp dụng từ giải sau), bài 4 màu, giao diện, ngôn ngữ, âm thanh.

## Mức máy (mode)

| Mode | Máy chơi |
| --- | --- |
| `easy` (Dễ) | Không tính toán: theo rộng ở pre-flop, chỉ tố với ~7% bài tẩy mạnh nhất; sau flop chỉ cược khi đã thành bộ (thú trở lên), theo khi có đôi, bỏ khi bị cược lớn mà chưa có gì. Dễ đoán: tố = có bài. |
| `medium` (Vừa) | Xác suất thắng ước lượng bằng Monte Carlo (300 lần, đối thủ bài bất kỳ) so với tỉ lệ pot: cược / tố khi mạnh hơn hẳn mức trung bình, theo khi đủ pot odds, không tháu cáy. |
| `hard` (Khó) | Monte Carlo 800 lần có **đoán dải bài**: đối thủ ít tố cả giải mà tố trong ván thì bài tẩy được rút lại theo phân vị Chen, cược / tố ở vòng này thì phải đã thành bộ. Thêm **vị thế** (nói sau thì nới ngưỡng), **push/fold** khi còn ≤ 12 mù lớn, **thận trọng giải đấu** (đòi lợi thế lớn hơn khi phải bỏ phần lớn stack vào pot), **tháu cáy có tần suất** (theo vòng, vị thế và tỉ lệ bỏ bài của đối thủ; semi-bluff với bài đang chờ), **sizing** theo pot (½–¾ pot, tố ~0,8 pot, all-in khi phần còn lại nhỏ). |

Máy chạy trong `engine.js` (thuần, tất định theo hạt `ai` lưu trong ván), mỗi nước < 1 ms trên máy tính (Monte Carlo 800 lần, 4 người ≈ 0,8 ms), nên không cần Web Worker.

### Độ mạnh đo bằng mô phỏng (`node test.js`)

Giải 4 máy, ghế 0 là mức cần đo, ba ghế còn lại cùng một mức; tỉ lệ ghế 0 vô địch (ngẫu nhiên đều nhau là 25 %). Hạt giống cố định nên con số lặp lại được:

| Trận | Tỉ lệ vô địch |
| --- | --- |
| Khó vs 3 Dễ (150 giải) | 46 % |
| Vừa vs 3 Dễ (150 giải) | 34 % |
| Dễ vs 3 Khó (150 giải) | 3 % |
| Khó vs 3 Vừa (120 giải) | 47 % |
| Khó vs 3 máy ngẫu nhiên (150 giải) | 72 % |
| Khó vs 1 máy ngẫu nhiên, tay đôi 2000/2000 (120 giải) | 93 % |

"Máy ngẫu nhiên" chọn đều giữa bỏ (khi bị cược) / xem-theo / tố tối thiểu. Đo thêm bằng script tạm (không nằm trong test): Khó vs 3 máy ngẫu nhiên tố bất kỳ mức tới cỡ pot ≈ 66 %, tố bất kỳ mức tới all-in ≈ 54 %. Máy ngẫu nhiên all-in càng nhiều thì giải càng giống tung đồng xu (Khó chỉ quyết được lúc theo hay bỏ, mỗi lần all-in vẫn thua 30–40 %), nên 4 người không đạt "gần như luôn luôn"; đấu tay đôi thì đạt (93 %).

## Ghi điểm trên cổng

`game.json` → `server`: `metric: wins`, mode `easy` / `medium` / `hard` = 8 / 10 / 12 điểm (mục 4.8 lộ trình: "Bài, có kỹ năng" 8–12). Một giải = một lần chơi:

- Bấm **Bắt đầu giải**: `kit.sdk.start(level)`; mở lại giải lưu dở: `kit.sdk.start(level, true)`.
- Hết giải: `kit.sdk.end({ mode: level, won, timeMs, assisted: false })`, `won` = ăn hết chip.
- Bỏ giải (nút Ván mới) sau khi đã nói ít nhất một lần hoặc đã xong ván đầu: hỏi trước rồi gửi `won: false`; chưa nói lần nào thì về màn chờ, không gửi gì.

`rules.min_duration_ms` = 5000 cho cả ba mode: giải ngắn nhất có thể là 1 ván (bạn all-in, cả 3 máy theo và thua). Ván đó cần ≥ 3 lần máy nghĩ (≥ 400 ms mỗi lần, ở mọi tốc độ) + lật flop / turn / river (≥ 700 ms mỗi vòng) + lật bài so + giữ bàn 2 s trước khi báo kết thúc ≈ 5,5–6 s, không tính thời gian bạn bấm (đo: từ lúc bấm Theo ở ván cuối tới `pn:end` là 5,9 s ở tốc độ Nhanh). Nhịp này không bị giảm chuyển động rút ngắn.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-xito-settings-v1` | Cài đặt (mức máy, tốc độ máy, bài 4 màu, giao diện) |
| `playnine-xito-stats-v1` | Thống kê: số giải, vô địch (theo mức), số ván, số pot đã ăn, pot lớn nhất |
| `playnine-xito-save-v1` | Giải đang chơi dở, lưu sau mỗi nước (cả mức máy, hạt máy, hồ sơ hành vi đối thủ, đồng hồ) |
| `playnine-xito-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Ván lưu không chứa bộ bài: bộ bài dựng lại từ `handRng` (`fromJSON` kiểm tra `rng` đúng là trạng thái sau lần xáo đó, tổng chip đúng 4000, cược / pot / lượt nói hợp lệ), nên không đọc được bài máy hay lá sắp lật trong localStorage. Lưu giữa hai ván thì mở lại sẽ chia ván sau luôn.

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `F` | Bỏ bài |
| `C` | Xem / theo |
| `R` | Cược / tố với mức đang chọn |
| `H` / `P` / `A` | Chọn mức ½ pot / pot / all-in |
| `←` `→` (hoặc `-` `+`) | Giảm / tăng mức một mù lớn |
| `Enter` / `Space` | Bắt đầu giải (màn chờ), ván tiếp (hết ván) |
| `N` | Giải mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra engine

```bash
node test.js
```

26 test, khoảng 15–20 s (phần mô phỏng giải đấu chiếm phần lớn): bảng tay chuẩn, so kicker, 5 lá tốt nhất từ 7 lá, khớp duyệt hết 21 tổ hợp, tần suất loại tay trên 40.000 tay 7 lá khớp bảng xác suất chuẩn; chia bài tất định; mù / nút / thứ tự nói (4 người, tay đôi); luật cược và nước sai; pot phụ, trả tiền thừa, chia pot và chip lẻ; hết giải; máy luôn đi nước hợp lệ và giữ tổng chip; mức mạnh dần; lưu / khôi phục và từ chối dữ liệu hỏng.

`e2e.spec.ts` (chạy trong cổng): giải thắng (ván lưu ván cuối, bấm Theo), giải thua (ván lưu, máy theo all-in của bạn), bỏ giải trước / sau nước đầu.
