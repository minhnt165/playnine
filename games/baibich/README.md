# Bài Bích

Game Bài Bích (Spades) của PlayNine: bạn và đồng đội máy **Bảo** (ngồi đối diện) đấu hai máy **Mai** và **Khoa**. Mỗi ván báo số nước sẽ ăn, ra theo chất, bích luôn là chủ; đội chạm mốc điểm trước thắng trận. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (kit + bộ bài `cards.js` / `cards.css`, xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo trận qua SDK.

## Luật chơi

Spades chuẩn, 4 người chia hai đội, bộ 52 lá. Bạn ngồi dưới (Nam), Mai bên trái (Tây), Bảo trên (Bắc, đồng đội), Khoa bên phải (Đông); đi theo chiều kim đồng hồ.

- Mỗi người 13 lá. Người chia xoay sang trái mỗi ván; ván 1 bạn báo và dẫn trước.
- **Báo**: từ bên trái người chia, mỗi người báo số nước nghĩ mình sẽ ăn (1–13) hoặc **Nil** (hứa không ăn nước nào). Hợp đồng của đội = tổng số báo của hai người (Nil tính 0).
- **Ra bài**: người bên trái người chia dẫn nước đầu. Có chất được dẫn thì phải theo; hết chất thì ra lá bất kỳ. Lá to nhất của chất dẫn ăn nước (A to nhất), nhưng **bích là chủ**: nước có bích thì bích to nhất ăn. Người ăn dẫn nước sau.
- **Bích vỡ**: chưa ai ra bích thì không được dẫn bích, trừ khi trên tay chỉ còn bích.
- **Tính điểm mỗi ván** (theo đội):
  - đạt hợp đồng: +10 × hợp đồng; mỗi nước thừa là một **túi** (+1 điểm);
  - trượt: −10 × hợp đồng;
  - Nil: +100 nếu người báo Nil không ăn nước nào, −100 nếu ăn; nước người Nil ăn vẫn tính cho đội (vào hợp đồng và túi);
  - cả hai cùng Nil: nước nào đội ăn được cũng là túi;
  - gom đủ **10 túi**: −100 và trừ 10 túi (túi dư giữ sang ván sau).
- **Hết trận**: sau mỗi ván, có đội chạm mốc (**300** mặc định, hoặc 500) hoặc tụt tới **−200** thì đội điểm cao hơn thắng; hai đội bằng điểm thì đánh thêm ván.

Engine (`engine.js`) là hàm thuần: `newMatch`, `legalPlays`, `bid`, `play`, `scoreHand`, `winnerOf`, `nextHand`, `estimate`, `suggestBid`, `aiBid`, `aiPlay`, `aiStep`, `toJSON` / `fromJSON`. Lá lưu bằng id của `cards.js` (`'AS'`, `'10H'`); xáo bài bằng PRNG mulberry32 của `cards.js`, trạng thái PRNG nằm trong ván lưu nên tải lại trang vẫn đúng bài cũ. Lựa chọn ngẫu nhiên của máy suy từ trạng thái (cùng ván, cùng nước thì cùng lựa chọn) nên test tất định.

### Máy

Đồng đội Bảo luôn chơi mức **Khó**; mức trong Cài đặt là mức của hai đối thủ.

- **Báo**: đếm lá mạnh và bích (A; K có lá che; Q / J bích khi bích dài; mỗi bích từ lá thứ 5 thêm một nước; chất ngắn + bích nhỏ còn thừa thì cắt được). Dễ: ước thô, lệch ngẫu nhiên tới ±1,5 nước, không báo Nil. Vừa: làm tròn ước lượng, Nil khi bài rất yếu. Khó: ước lượng đã hiệu chỉnh bằng mô phỏng (+0,3), báo Nil khi bài yếu và ít lá nguy hiểm, cộng một nước khi đồng đội báo Nil, bớt một nước khi cả bàn đã báo quá 13.
- **Dễ**: khoảng 30% số lượt ra đại một lá hợp lệ; còn lại thấy ăn được là ra lá to nhất, không để ý đồng đội (đè cả lá đồng đội), dẫn lá to nhất.
- **Vừa**: không đè đồng đội đang thắng chắc, ra cuối thì ăn bằng lá nhỏ nhất đủ ăn, vị trí 2 ra nhỏ / vị trí 3 ra to, dẫn A trước, đủ hợp đồng thì thôi ăn (né túi); biết giữ Nil của mình và che Nil cho đồng đội.
- **Khó**: thêm **đếm lá** (lá chưa lộ, chất từng người đã hết): biết lá nào là lá to nhất còn lại và đối thủ nào có thể cắt; dẫn lá chắc ăn, dẫn chất đồng đội đã hết cho đồng đội cắt, xả lá ở chất ngắn để sớm cắt được, đủ hợp đồng thì né túi trừ khi có cơ hội đánh trượt đối thủ, lót dưới đối thủ báo Nil để họ phải ăn.
- Mô phỏng trong `test.js` (trận tới 300, đội 0 = ghế 0 + 2 đấu đội 1 = ghế 1 + 3): đội Khó thắng đội bot ra lá ngẫu nhiên hợp lệ **99%**; Khó thắng Dễ **~95%**, Vừa thắng Dễ **~80%**, Khó thắng Vừa **~63%**.

## Điều khiển

- **Báo**: bảng báo hiện giữa bàn khi tới lượt bạn: Nil, 1–13, số gợi ý (theo cách máy Khó đếm lá) có viền và được chọn sẵn. Chạm số rồi nút **Báo**, hoặc chạm lại số đang chọn.
- **Ra bài**: bài trên tay xòe ở dưới (điện thoại dọc xếp hai hàng cho lá to dễ chạm), xếp theo chất cơ / nhép / rô / bích. Tới lượt bạn thì lá ra được **nhô lên** (viền hổ phách), lá khác mờ đi; chạm lá không ra được thì lá lắc và dòng trạng thái nói vì sao.
- Lá ra bay vào giữa bàn theo hướng người ra; đủ 4 lá thì lá ăn sáng lên một nhịp rồi cả nước bay về người ăn.
- Bảng điểm hai đội ở trên: điểm, báo / ăn của ván, số túi. Mỗi người có thẻ "ăn x / báo y" (Nil hiện màu riêng, vỡ Nil bị gạch). Huy hiệu bích góc bàn sáng lên khi bích đã vỡ. Mở hộp thoại thì máy tạm dừng.
- Hết ván hiện bảng điểm ván: báo, nước ăn, hợp đồng, Nil, túi, phạt 10 túi, điểm ván, tổng, túi đang gom.

## Cài đặt

| Cài đặt | Giá trị |
| --- | --- |
| Đối thủ | Dễ / Vừa (mặc định) / Khó |
| Mốc thắng trận | 300 (nhanh, mặc định) / 500 (chuẩn) |
| Tốc độ máy | Chậm / Vừa (mặc định) / Nhanh (máy nghĩ 900 / 650 / 400 ms mỗi lượt) |
| Giao diện, Ngôn ngữ, Âm thanh | của kit |

Mốc mặc định 300 thay cho 500 của luật chuẩn: một ván 13 nước mất khoảng 1 phút, trận tới 500 thường 8–12 ván (10–15 phút) là dài cho một lần chơi trên điện thoại; trận tới 300 khoảng 5–7 ván. Ai muốn trận chuẩn thì chọn 500. Đổi mức hoặc mốc khi bạn chưa đi nước nào thì chia lại trận ngay; giữa trận thì áp dụng từ trận sau.

## Báo trận cho cổng

- Metric `wins` (số trận thắng), điểm game 10; ba mode theo mức đối thủ: `easy` (Dễ, 8 điểm), `medium` (Vừa, 10), `hard` (Khó, 12); mỗi mode luật `min_duration_ms: 20000`.
- Một trận (tới mốc) là một lần chơi. Chia trận mới: `kit.sdk.start(level)`; mở lại trận lưu dở: `kit.sdk.start(level, true)`.
- Có đội thắng trận: `kit.sdk.end({ mode: level, won, timeMs, assisted: false })`, `won` là đội bạn thắng. Gợi ý báo luôn hiện cho mọi người nên không tính là trợ giúp.
- Bỏ trận (nút Ván mới) khi bạn đã đi ít nhất một nước (báo hoặc ra lá): hỏi xác nhận rồi gửi `won: false`; chưa đi nước nào thì không gửi gì.
- Chống gian lận: điểm một ván tối đa khoảng 230 (báo 13 + Nil đạt), nên thắng ở mốc 300 cần ít nhất 2 ván; cách thắng nhanh nhất về lý thuyết là đối thủ tụt xuống −200 ngay ván đầu (báo 13 trượt + Nil vỡ). Một ván có 39 lượt máy ra lá + 3 lượt máy báo, mỗi lượt máy nghĩ ít nhất 400 ms (tốc độ Nhanh), cộng 13 lần dừng xem nước ≥ 450 ms: ≥ 22,6 s kể cả khi tắt hiệu ứng. Mô phỏng 300 trận: trận đội bạn thắng ngắn nhất có 3 ván (117 lượt máy ra lá); một ván chơi thật ở tốc độ Nhanh mất khoảng 38 s.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-baibich-settings-v1` | Cài đặt (giao diện, `level`, `target`, `speed`) |
| `playnine-baibich-stats-v1` | Thống kê: số trận, trận thắng, số ván đội đạt hợp đồng, số lần bạn giữ được Nil |
| `playnine-baibich-save-v1` | Trận đang chơi dở (`{ v, game, elapsed }`), lưu sau mỗi lần báo / ra lá và cả lúc đang xem bảng điểm giữa hai ván; ván hỏng / sai luật bị bỏ |
| `playnine-baibich-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` / `→` | Chọn lá trên tay (lúc báo: đổi số báo) |
| `1`–`9` | Chọn lá ra được thứ 1–9 (số hiện trên lá nhô lên); lúc báo: chọn số báo (`0` = Nil) |
| `Enter` | Ra lá đang chọn / báo số đang chọn |
| `N` | Trận mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test engine: chia bài tất định, vòng báo, luật ra bài (theo chất, hết chất, bích chưa vỡ), người ăn nước, tính điểm (đạt / trượt, túi, phạt 10 túi, Nil đạt / vỡ, cả hai Nil), hết trận (mốc, −200, bằng điểm), gợi ý báo, máy báo đúng khoảng, chiến thuật cơ bản (không đè đồng đội, ăn bằng lá nhỏ nhất, giữ Nil, che Nil, đếm lá), 400 trận toàn máy ở mọi mức kể cả bot ngẫu nhiên (mọi lá máy chọn đều hợp lệ, trận nào cũng kết thúc), tỉ lệ thắng giữa các mức, độ dài trận ngắn nhất, lưu / khôi phục ở mọi giai đoạn và từ chối dữ liệu hỏng / sai luật (lá trùng, sai người ăn, sửa kết quả ván…).

Test riêng trong cổng: `e2e.spec.ts` (thắng trận, thua khi đội máy chạm mốc, bỏ trận) chạy cùng `npm run e2e` sau khi build và ghép.
