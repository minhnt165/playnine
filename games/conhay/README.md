# Cờ Nhảy

Game Cờ Nhảy (Star Checkers, tức Chinese checkers / Halma sao) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Bàn sao sáu cánh 121 lỗ (lục giác giữa 61 lỗ + sáu góc 10 lỗ). Mỗi bên 10 quân xếp kín một góc ("góc nhà"); **góc đích** là góc đối diện.
- Đấu 1 máy: bạn cầm Đỏ ở góc dưới, máy cầm Xanh ở góc trên. Bạn luôn đi trước.
- Mỗi lượt đi một quân:
  - **bước** sang một lỗ kề còn trống, hoặc
  - **nhảy** qua một quân kề (của ai cũng được) sang lỗ trống ngay sau nó, theo đường thẳng. Nhảy được thì **nhảy tiếp** nhiều lần liền, đổi hướng tùy ý, dừng sau lần nào cũng được.
  - Không được bước rồi mới nhảy; không nhảy qua lỗ trống hay qua hai quân liền; không ăn quân. Trong lúc nhảy, lỗ xuất phát coi như trống (không quay về chỗ cũ).
- Quân đã vào góc đích chỉ được dừng trong góc đích (có thể nhảy ra rồi quay vào trong cùng một nước).
- Có quân nào đi được thì phải đi; bên tới lượt không còn nước nào thì bỏ lượt (vẫn tính một lượt).
- **Thắng:** người đầu tiên lấp đầy cả 10 lỗ của góc đích.
- **Chống chiếm góc** (quy tắc chọn, theo cách xử lý "spoiling" phổ biến của luật thi đấu): từ **lượt thứ 30** của một bên, quân bên đó còn nằm trong góc nhà của mình được tính **như quân của đối thủ** khi xét góc đích của đối thủ (chính là góc nhà đó) đã đầy chưa. Tức là đối thủ chỉ cần lấp các lỗ còn lại là thắng. Luật được xét sau mọi nước, nên nếu bạn đã lấp đủ các lỗ khác thì thắng ngay khi bên chiếm góc đi lượt thứ 30. Ở chế độ 3 người, góc đích của mỗi người không phải góc nhà của ai nên luật này không áp dụng. Bạn còn quân ở nhà ở lượt 20 và 25 thì game nhắc bằng thông báo, thẻ người chơi tô đỏ "còn N quân ở nhà".
- **Hòa:** mỗi bên đã đi 200 lượt mà chưa ai thắng, hoặc không bên nào còn đi được.
- Không có đi lại.

## Chế độ

| Đối thủ (Cài đặt) | Mô tả | Xếp hạng |
| --- | --- | --- |
| `1 máy` | Bạn (Đỏ, góc dưới) đấu máy (Xanh, góc trên) | Có (mode = mức máy) |
| `2 máy` | Ba người: bạn ở góc dưới, Máy 1 (Xanh) góc trên trái, Máy 2 (Lục) góc trên phải; ba góc đích trống lúc đầu; thứ tự lượt bạn → Máy 1 → Máy 2; ai lấp đầy góc đích trước thắng, ván dừng ngay | Không |
| `2 người` | Hai người chơi chung máy: Đỏ dưới, Xanh trên | Không |

Chế độ không xếp hạng không gọi `sdk.start` / `sdk.end`; ván 2 máy có thống kê riêng (dòng "2 máy" trong bảng thống kê).

## Điều khiển

- **Chuột / cảm ứng:** chạm một quân của mình để chọn: mọi lỗ nó tới được (cả lỗ cuối chuỗi nhảy) hiện chấm. Rê chuột lên chấm thấy đường nhảy từng bước (nét đứt vàng). Chạm chấm để đi; quân nhảy từng bước có hoạt cảnh nảy lên và tiếng "pop" cao dần. Chạm lại quân hoặc chỗ khác để bỏ chọn. Chạm gần lỗ (trong 0,6 ô) cũng nhận.
- **Bàn phím:** mũi tên di chuyển con trỏ (trái / phải theo hàng, lên / xuống sang hàng kề giữ cột gần nhất), `Enter` / `Space` chọn quân và đi, `Esc` bỏ chọn.
- Nước vừa đi (của ai cũng vậy) vẽ nét đứt màu người đi qua các điểm dừng, vòng đứt ở lỗ xuất phát. Góc nhà tô màu chủ góc, góc đích của từng người viền nét đứt màu người đó.
- Thẻ người chơi: lượt của ai, "Đang nghĩ…", số quân đã vào góc đích (x/10).
- Bật giảm chuyển động (`prefers-reduced-motion`) thì quân đổi chỗ tức thì, không chấm "đang nghĩ"; máy vẫn chờ tối thiểu 300 ms.

## Máy và mode

Chọn trong **Cài đặt**. Chưa đi nước nào thì đổi mức / đối thủ là chơi ván mới ngay (đấu 1 máy: gửi lại `start` với mode mới, không gửi `end`); đã đi rồi thì áp dụng từ ván sau.

| Mode | Máy |
| --- | --- |
| `easy` (Dễ) | Tham lam: chọn nước làm giảm "chi phí về đích" nhiều nhất (bằng nhau thì ngẫu nhiên theo hạt giống). Hay bỏ quân tụt lại / quân ở nhà. |
| `medium` (Vừa) | Nhìn trước hai nước của mình (coi như đối thủ đứng yên): mỗi nước đầu được chấm bằng chi phí sau nước tiếp theo tốt nhất (xét 14 nước tốt nhất), cộng nhiễu nhỏ. |
| `hard` (Khó) | Negamax alpha-beta độ sâu 4 (mình – đối thủ – mình – đối thủ); gốc xét mọi nước, nút trong chỉ xét 10 nước giảm chi phí nhiều nhất (cắt tỉa). Đánh giá = 0,85 × chi phí đối thủ − chi phí mình, có **phạt quân tụt lại** và **phạt quân còn ở nhà** (tăng dần từ lượt 12 tới mốc 30). Ở chế độ 3 người dùng cách nhìn trước hai nước của Vừa nhưng có các khoản phạt. |

"Chi phí về đích" của một bên: quân trong góc đích tính khoảng cách tới đỉnh góc; quân ngoài tính đường ngắn nhất qua một lỗ đích chưa có quân mình (khoảng cách tới lỗ + độ sâu của lỗ); lỗ bị quân chiếm góc giữ sau lượt 30 coi như đã lấp. Mức nào cũng đi nước thắng ngay nếu có. Trọng số 0,85 < 1 cho chi phí đối thủ giúp máy Khó ưu tiên tự tiến thay vì đứng chặn mãi (tránh hai bên cùng chặn nhau tới hòa).

Máy tất định theo hạt giống của ván (`seed`, lưu trong ván) và số nước đã đi. Máy nghĩ trong Web Worker dựng từ mã nguồn engine (`GameEngine.factory`), không làm đơ giao diện; không tạo được worker thì tính bằng `setTimeout`. Thời gian nghĩ đo trong Node: Dễ < 1 ms, Vừa ≤ 7 ms, Khó ≤ 36 ms mỗi nước; máy luôn "nghĩ" tối thiểu 500 ms (300 ms khi giảm chuyển động).

**Mức mạnh dần** (máy đấu máy, đổi bên đi trước mỗi ván, 40 ván mỗi cặp): Khó – Dễ 40 – 0, Vừa – Dễ 40 – 0, Khó – Vừa 35 – 3 (2 hòa). `node test.js` chạy 12 ván mỗi cặp và yêu cầu Khó thắng Dễ ≥ 75 %, Vừa thắng Dễ ≥ 70 %, Khó thắng Vừa ≥ 60 % (lần chạy gần nhất: 11 – 1, 10 – 2, 11 – 1).

## Ghi điểm trên cổng

Metric `wins` (số ván thắng), 15 điểm mặc định; mode theo mức máy: `easy` 10 điểm, `medium` 15 điểm, `hard` 25 điểm; mỗi mode luật `min_duration_ms` 12000.

- Ngưỡng 12 giây: muốn thắng phải đưa 10 quân sang góc đối diện; tìm kiếm beam một mình (không có đối thủ cản) cần 29 nước, thực tế ván thắng nhanh nhất của máy Khó là 30 lượt. Lấy cận dưới an toàn 25 nước của người: 24 lượt máy × ≥ 300 ms nghĩ tối thiểu ≈ 7,2 s, cộng 25 nước × 2 lần chạm × ~150 ms ≈ 7,5 s → ~14,7 s; đặt 12 s để có biên.
- Ván mới: `kit.sdk.start(level)`; mở lại ván lưu dở: `kit.sdk.start(level, true)`.
- Hết ván: `kit.sdk.end({ mode: level, won, assisted: false })`; `won` là `true` chỉ khi bạn thắng (kể cả thắng nhờ luật chống chiếm góc); thua hoặc hòa gửi `won: false`.
- Bỏ ván đã đi ít nhất một nước (bấm Ván mới rồi xác nhận): gửi `won: false`. Chưa đi nước nào thì không gửi gì.
- Không có đi lại hay gợi ý nên `assisted` luôn `false`.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-conhay-settings-v1` | Cài đặt: giao diện, `level` (`easy` / `medium` / `hard`), `opp` (`ai1` / `ai2` / `pvp`) |
| `playnine-conhay-stats-v1` | Thống kê: `levels.<mức>.{played, won, lost, drawn}` (đấu 1 máy), `multi.{played, won, drawn}` (2 máy), `streak`, `best` |
| `playnine-conhay-save-v1` | Ván đang chơi dở `{ v: 1, level, opp, humanMoves, game }`; `game` là `toJSON` của engine: `players` (2 / 3), `board` (121 ký tự: `.` trống, `0`/`1`/`2` quân của người đó; ô theo hàng từ trên xuống, trái sang phải), `turn`, `ply`, `turns` (số lượt mỗi người, dùng cho luật chống chiếm góc), `last` (`{ p, path }` nước vừa đi), `winner`, `reason`, `seed` (hạt giống của máy) |
| `playnine-conhay-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `→` `↓` | Di chuyển con trỏ trên bàn |
| `Enter` / `Space` | Chọn quân / đi tới lỗ dưới con trỏ |
| `Esc` | Bỏ chọn quân; đóng hộp thoại |
| `N` | Ván mới |

## Kiểm tra

```bash
node test.js
```

Test engine phủ: bàn 121 lỗ (số lỗ từng hàng, sáu góc, láng giềng đối xứng), bày quân 2 / 3 người, 14 nước mở đầu (đếm tay), bước, nhảy một lần, nhảy chuỗi đổi hướng và đường đi từng bước, nhảy qua quân của ai cũng được, không nhảy qua lỗ trống / hai quân / bước rồi nhảy, lỗ xuất phát coi như trống, quân trong góc đích không ra được, bỏ lượt khi hết nước, thắng khi lấp đầy góc đích, luật chống chiếm góc (trước / đúng / sau lượt 30, chỉ tính quân chủ góc), hòa 200 lượt, lưu / khôi phục và từ chối dữ liệu hỏng, máy mọi mức đi đúng luật / tất định / đi nước thắng ngay (kể cả nhảy chuỗi), mức mạnh dần, ván 3 người luôn kết thúc. Test Playwright trong cổng nằm ở `e2e.spec.ts` (chạy cùng `npm run e2e` sau khi build và ghép).
