# Gin Rummy

Game Gin Rummy của PlayNine: bạn đấu một người máy (Dễ / Vừa / Khó), rút và bỏ lá để ghép sám, sảnh, knock khi lá lẻ còn 10 điểm trở xuống hoặc ù gin; ai tới 100 điểm trước thắng trận. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (kit + bộ bài `cards.js` / `cards.css`, xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo trận qua SDK.

## Luật chơi

Gin Rummy chuẩn 2 người, bộ 52 lá.

- **Bộ (meld)**: sám / tứ (3–4 lá cùng bậc) hoặc sảnh (từ 3 lá liên tiếp cùng chất; A là lá nhỏ nhất, không vòng K-A). Lá ngoài bộ là **lá lẻ (deadwood)**: A = 1, lá số theo số, J / Q / K = 10. Một lá chỉ thuộc một bộ.
- Mỗi người 10 lá, lật một **lá mời** lên chồng bỏ. Người không chia được nhặt lá mời hoặc bỏ qua, rồi tới người chia; cả hai bỏ qua thì người không chia rút nọc.
- Mỗi lượt: rút một lá (nọc hoặc lá trên cùng chồng bỏ) rồi bỏ một lá. **Không được bỏ lại lá vừa nhặt** từ chồng bỏ trong cùng lượt.
- **Knock**: khi bỏ lá mà lá lẻ còn lại ≤ 10. Lá lẻ 0 là **gin**. **Big gin** (tùy chọn, mặc định bật): cả 11 lá thành bộ ngay sau khi rút, không cần bỏ lá.
- Bị knock (không phải gin): người kia **ghép lá lẻ (lay off)** vào bộ của người knock, ghép dây chuyền được (ví dụ 7♥ rồi 8♥ vào sảnh 4-5-6♥). Game tự chọn cách xếp và cách ghép tốt nhất cho người bị knock; người knock bày cách xếp tối ưu ít bị ghép nhất.
- **Điểm ván**: knock thắng = chênh lệch lá lẻ; **undercut** (người bị knock có lá lẻ bằng hoặc ít hơn) = chênh lệch + 25 cho người bị knock; gin = 25 + lá lẻ đối thủ; big gin = 31 + lá lẻ đối thủ.
- Nọc còn 2 lá sau một lần bỏ mà chưa ai knock: **ván hòa**, không ai được điểm, người chia cũ chia lại. Ván có người thắng thì đổi người chia; người không chia đi trước. Ván 1 máy chia nên bạn đi trước.
- Ai tới **100 điểm** trước thắng trận. Bảng tổng kết cộng 100 thưởng trận, 25 mỗi ván thắng, người thua không thắng ván nào thì tổng của người thắng nhân đôi (thắng trắng). Thưởng chỉ để hiển thị; cổng chỉ ghi thắng / thua.

Engine (`engine.js`) là hàm thuần: `newMatch`, `legalActions`, `isLegal`, `apply` (nước `{ type: 'pass' | 'draw' | 'discard' | 'knock' | 'bigGin', from?, card? }`), `nextRound`, `analyze` (xếp tay tối ưu), `deadwood`, `deadwoodAfter`, `settle` (tính điểm knock / gin / lay off / undercut), `matchWinner`, `finalScores`, `aiAction`, `toJSON` / `fromJSON`. Lá lưu bằng id của `cards.js` (`'AS'`, `'10H'`); xáo bài bằng PRNG mulberry32 của `cards.js`, trạng thái PRNG nằm trong ván lưu nên tải lại trang vẫn chia đúng lá cũ.

**Xếp tay tối ưu**: quy hoạch động trên mặt nạ bit (≤ 11 lá → ≤ 2048 trạng thái), luôn xét lá có chỉ số nhỏ nhất: hoặc là lá lẻ, hoặc thuộc một bộ mà nó là lá nhỏ nhất. Test so với vét cạn độc lập (mọi tập con, mọi cách chia thành bộ) trên 400 tay ngẫu nhiên 10 / 11 lá, một nửa là tay "dày bộ" chồng chéo.

### Máy

Máy chỉ dùng thông tin công khai: tay mình, chồng bỏ, lá bạn đã nhặt / đã bỏ / đã không nhặt.

- **Dễ (Bé Na)**: nhặt lá mời / lá bỏ chỉ khi nó vào bộ ngay; bỏ lá lẻ cao nhất (giữ bộ); knock ngay khi được.
- **Vừa (Anh Tư)**: thêm nhặt lá giúp knock ngay; theo dõi lá bạn nhặt (đang giữ) và lá bạn đã bỏ / bỏ qua, tránh bỏ lá bạn cần (cùng bậc hoặc kề sảnh); giữ cặp còn nhiều lá "ăn".
- **Khó (Cao Thủ)**: đếm lá "ăn" còn chưa thấy để chọn lá giữ (xác suất cải thiện), ước lượng xác suất bạn ghép được lá nó bỏ (lá đã lộ + xác suất bạn đang giữ cặp ghép được), nhặt lá nhỏ thay lá to đầu ván; knock theo thời điểm: đầu ván knock ngay, về sau ước lượng lá lẻ của bạn (theo số lượt và số lá bạn đã nhặt) và chỉ knock khi khó bị undercut; nọc sắp hết thì knock để khỏi hòa.
- Mọi điều kiện nhặt lá của máy đều làm lá lẻ giảm hẳn nên hai máy không thể đổi lá qua lại mãi.
- Mô phỏng trong `test.js` (600 trận mỗi cặp, đổi ghế xen kẽ): **Vừa thắng Dễ ~60%, Khó thắng Vừa ~65%, Khó thắng Dễ ~71%**; mọi mức thắng bot ngẫu nhiên hợp lệ 100% (40 trận).

## Điều khiển

- Bài của bạn trải ở dưới, **tự xếp thành bộ tối ưu**: lá cùng bộ có vạch màu bên dưới, giữa các bộ có khe, lá lẻ để cuối (vạch xám ngắn). Ô điểm bên trái ghi **tổng lá lẻ** (xanh khi ≤ 10; lúc cầm 11 lá là lá lẻ sau khi bỏ lá đang chọn, hoặc lá tốt nhất).
- Lượt đầu: chạm chồng bỏ để nhặt lá mời, hoặc nút **Bỏ qua**. Các lượt sau: chạm nọc / nút **Rút**, hoặc chạm chồng bỏ để nhặt lá trên cùng (viền hổ phách khi nhặt được).
- Bỏ lá: chạm lá (nhô lên), chạm lần nữa hoặc nút **Bỏ lá**; hoặc **kéo lá vào chồng bỏ**. Lá vừa nhặt từ chồng bỏ bị làm tối (không bỏ được).
- Nút **Knock** hiện khi tới lượt bỏ: knock với lá đang chọn nếu được, không thì với lá tốt nhất (ghi trên nút, ví dụ "Knock 5♦"). Lá lẻ 0 thì nút thành **Gin**, đủ 11 lá thành bộ thì **Big gin**.
- **Kéo lá** sang chỗ khác trên tay để tự sắp xếp (chuyển sang thứ tự riêng, giữ qua các lượt và khi tải lại); nút **Xếp bộ** (biểu tượng cột) xếp lại theo bộ.
- Máy có tên + avatar, ba chấm khi đang nghĩ; dòng "Đã nhặt" dưới tên máy là các lá máy đã nhặt từ chồng bỏ. Mở hộp thoại thì máy tạm dừng. Hết ván: lật bài máy (lá lẻ viền đỏ, lá bạn ghép viền vàng), rồi hiện bảng ván: bộ / lá lẻ / lá ghép của hai bên, điểm, tỉ số; hết trận thêm bảng tổng kết thưởng.

## Cài đặt

| Cài đặt | Giá trị |
| --- | --- |
| Mức máy | Dễ (mặc định) / Vừa / Khó |
| Tốc độ máy | Chậm / Vừa (mặc định) / Nhanh |
| Big gin | Bật (mặc định) / Tắt |
| Giao diện, Ngôn ngữ, Âm thanh | của kit |

Đổi mức hoặc big gin khi bạn chưa đi nước nào thì chia lại trận ngay; giữa trận thì áp dụng từ trận sau (trận đang chơi giữ mức đã báo cho cổng).

## Báo trận cho cổng

- Metric `wins` (số trận thắng), điểm game 10; ba mode theo mức máy: `easy` (Dễ, 8 điểm), `medium` (Vừa, 10 điểm), `hard` (Khó, 12 điểm), mỗi mode luật `min_duration_ms: 12000`.
- Một trận (tới 100 điểm) là một lần chơi. Chia trận mới: `kit.sdk.start(level)`; mở lại trận lưu dở: `kit.sdk.start(level, true)`.
- Có người tới 100: `kit.sdk.end({ mode: level, won, timeMs, assisted: false })`, `won` là bạn tới trước. Không có hòa trận (mỗi ván chỉ một người được điểm). Không có hoàn tác.
- Bỏ trận (nút Ván mới) khi bạn đã đi ít nhất một nước (bỏ qua lá mời, rút, bỏ lá): hỏi xác nhận rồi gửi `won: false`; chưa đi nước nào thì không gửi gì.
- Chống gian lận: mô phỏng 600 trận trong `test.js`, trận ghế đi trước thắng ngắn nhất có 18 nước của người đó / 34 nước cả bàn (khoảng 8 lượt máy), trung bình ~110 nước của người đó. Mỗi lượt máy có hai lá bay + thời gian nghĩ (≥ 1 giây ở tốc độ Nhanh), cộng hiệu ứng chia bài và bảng điểm giữa các ván, nên trận thắng thật khó dưới ~20 giây; 12 giây chừa biên cho trường hợp hiếm (một ván gin ăn hơn 75 điểm).

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-ginrummy-settings-v1` | Cài đặt (giao diện, `level`, `speed`, `bigGin`) |
| `playnine-ginrummy-stats-v1` | Thống kê: số trận, trận thắng, ván thắng, số lần gin, tổng trận cao nhất |
| `playnine-ginrummy-save-v1` | Trận đang chơi dở (`{ v, game, elapsed, order, manual }`: ván, đồng hồ, thứ tự bài tự xếp; lưu sau mỗi nước, cả lúc đang xem bảng điểm giữa hai ván; ván hỏng / sai luật bị bỏ) |
| `playnine-ginrummy-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `S` | Rút nọc |
| `D` | Nhặt lá trên chồng bỏ (hoặc lá mời) |
| `P` | Bỏ qua lá mời |
| `←` / `→` | Chọn lá trên tay |
| `Shift` + `←` / `→` | Dời lá đang chọn (tự sắp xếp) |
| `Enter` | Bỏ lá đang chọn |
| `K` | Knock / Gin / Big gin |
| `A` | Xếp lại theo bộ |
| `N` | Trận mới |
| `Esc` | Đóng hộp thoại, hủy kéo lá |

## Kiểm tra

```bash
node test.js
```

Test engine (~12 giây): điểm lá, bộ hợp lệ, xếp tay tối ưu so với vét cạn, chia bài tất định theo seed, lá mời (nhặt / bỏ qua / cả hai bỏ qua), không bỏ lại lá vừa nhặt, điều kiện knock, ghép lá dây chuyền, undercut (kể cả bằng điểm), gin, big gin bật / tắt, ván hòa và đổi người chia, hết trận + tổng kết, nước sai luật bị từ chối, máy mọi mức luôn đi nước hợp lệ (60 trận, kiểm từng nước), chiến thuật từng mức, thắng bot ngẫu nhiên, mức mạnh dần, độ dài trận, lưu / khôi phục ở mọi pha và từ chối dữ liệu hỏng.

Test riêng trong cổng: `e2e.spec.ts` (thắng trận bằng gin, thua khi máy gin, bỏ trận) chạy cùng `npm run e2e` sau khi build và ghép.
