# Thoát Xe

Game Thoát Xe (Traffic Jam) của PlayNine: đố trượt xe kiểu bãi đỗ 6×6 (thể loại thường gọi là "rush hour puzzle"), đưa xe đỏ ra cửa. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

Tên tiếng Anh là "Traffic Jam", tên chung của thể loại đố này; "Rush Hour" là nhãn hiệu của ThinkFun nên không dùng làm tên game. Bộ đề do máy sinh, không chép đề của ThinkFun hay bên thứ ba nào.

## Luật chơi

- Bãi đỗ 6×6, cửa ra ở mép phải hàng thứ ba. Xe đỏ (dài 2 ô) nằm ngang trên hàng đó.
- Xe con dài 2 ô, xe tải dài 3 ô, nằm ngang hoặc dọc. Xe chỉ trượt tới / lui theo trục của mình, không đi ngang, không vượt qua xe khác, không ra khỏi bãi.
- Thắng khi xe đỏ tới sát cửa ra (cột cuối); xe đỏ chạy ra khỏi bãi.
- **Một nước** = trượt một xe đi bao nhiêu ô cũng được. Trượt cùng một xe nhiều lần liền nhau được gộp thành một nước (đẩy từng ô bằng phím vẫn tính 1); trượt về đúng chỗ cũ thì như chưa đi.
- Thanh số liệu hiện số nước đã đi / số nước tối thiểu của bàn (BFS).
- Sao: đúng số nước tối thiểu 3 sao, không quá 1,5 lần tối thiểu 2 sao, còn lại 1 sao. Mỗi bàn lưu kết quả tốt nhất (nhiều sao hơn, bằng sao thì ít nước hơn).
- **Hoàn tác** không giới hạn (lùi cả cú trượt đã gộp). **Chơi lại** bắt đầu lại bàn (khi đã đi thì bấm hai lần trong 2,5 giây, vì bỏ bàn tính là một lượt thua).
- **Gợi ý**: đi giúp nước tiếp theo của một lời giải ngắn nhất tính từ thế hiện tại (BFS từ thế hiện tại), xe được gợi ý sáng viền vàng. Dùng gợi ý thì ván gửi `assisted: true` và bàn đó chỉ được 1 sao.

## Mức, bàn và đề hằng ngày

| Mức | Số bàn | Số nước tối thiểu |
| --- | --- | --- |
| Dễ (`easy`) | 60 | 5–12 (7–8 bàn mỗi số) |
| Vừa (`medium`) | 60 | 13–24 (5 bàn mỗi số) |
| Khó (`hard`) | 60 | 25–41 (5 bàn mỗi số từ 25 tới 32, rồi các đề sâu nhất tìm được tới 41) |
| Hằng ngày (`daily`) | vòng 120 đề | 14–22 |

- Mỗi mức là chuỗi bàn đánh số 1–60, xếp theo số nước tối thiểu tăng dần. Mở được mọi bàn đã giải và bàn chưa giải đầu tiên; giải xong một bàn thì mở bàn tiếp theo. Tiến độ mỗi mức riêng.
- Đề hằng ngày: mỗi ngày (giờ máy) một đề, giống nhau cho mọi người. Lấy từ vòng 120 đề: thứ tự trong mỗi vòng là hoán vị Fisher–Yates theo PRNG seed `thoatxe-daily-<vòng>`, nên trong 120 ngày liền không trùng đề. Lưu kết quả từng ngày và chuỗi ngày giải liên tiếp.

### Sinh đề

- `engine.generate(seed, band)`: xếp xe ngẫu nhiên tất định theo seed (mulberry32), duyệt cả cụm trạng thái chứa thế đó (mọi nước đều đảo được nên cụm = các thế đi tới được), rồi BFS ngược nhiều nguồn từ mọi thế đã giải trong cụm (đi ngược từ thế giải). Chọn thế xa nhất của cụm nếu nằm trong khoảng mong muốn, cụm sâu hơn thì chọn thế có đúng số nước ở đầu trên của khoảng.
- Sinh lúc chạy quá chậm cho điện thoại (đo trong Node trên máy bàn, 40 seed mỗi mức): Dễ trung vị 12 ms (p90 39 ms), Vừa 97 ms (p90 365 ms, chậm nhất 0,76 s), Khó 0,57 s (p90 4,7 s). Mục tiêu < 300 ms trên điện thoại không đạt từ mức Vừa, nên **mọi bàn dùng bộ đề sinh sẵn** `puzzles.js` (≈ 15 KB, 300 đề), do `tools/build-puzzles.js` sinh bằng chính `engine.generate()` với seed cố định (chạy lại ra đúng file cũ, mất khoảng 4 phút):

```bash
node tools/build-puzzles.js
```

- Dễ / Vừa / hằng ngày: chia hạn ngạch đều cho từng số nước, sinh đúng số nước đó. Khó: duyệt 60 000 bố cục 12–15 xe, lấy thế xa nhất của mỗi cụm (≥ 25 nước), chọn xoay vòng theo số nước để trải đều. Không có đề trùng giữa các mức.
- Đề lưu dạng `'<36 ô theo hàng>:<số nước tối thiểu>'`: `.` ô trống, `A` xe đỏ, chữ khác là xe khác. Test giải lại cả 300 đề bằng BFS (khoảng 1 giây, đề chậm nhất ~20 ms) và so số nước tối thiểu.
- Gợi ý chạy BFS lúc chơi: bàn Khó sâu nhất (41 nước) mất khoảng 4 ms trong Node.

## Điều khiển

- Chuột / chạm: kéo xe dọc theo làn của nó; xe bị chặn ở mép bãi và trước xe khác, thả ra thì dừng đúng ô gần nhất.
- Bàn phím: `Tab` chọn xe lần lượt; mũi tên **dọc trục** xe đang chọn thì trượt một ô, mũi tên **ngang trục** thì chọn xe gần nhất theo hướng đó; `Home` / `End` trượt hết cỡ. Chưa chọn xe thì mũi tên đầu tiên chọn xe đỏ.
- Nút dưới bãi: Hoàn tác, Chơi lại, Gợi ý, Chọn bàn. Ô mức / số bàn trên thanh số liệu cũng mở bảng chọn bàn (có thẻ Dễ / Vừa / Khó / Hằng ngày).
- Xe phân biệt bằng màu (14 màu) + họa tiết (sọc dọc thân, chấm, ô cờ, vạch ngang, zíc zắc, viền) + dáng (xe tải có thùng hàng gân); xe đỏ có mũi tên trên mui. Mỗi xe có nhãn đọc màn hình (tên, trục, hàng, cột).

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `Tab` / `Shift+Tab` | Chọn xe |
| `←` `→` `↑` `↓` | Trượt xe đang chọn một ô (dọc trục) / chọn xe bên cạnh (ngang trục) |
| `Home` / `End` | Trượt xe đang chọn hết cỡ về đầu / cuối làn |
| `Z` / `U` / `Backspace` / `Ctrl+Z` | Hoàn tác |
| `R` | Chơi lại bàn (bấm hai lần khi đã đi) |
| `H` | Gợi ý |
| `L` | Chọn bàn |
| `N` | Bàn tiếp theo (sau khi giải xong) |
| `Esc` | Đóng hộp thoại |

## Ghi điểm trên cổng

- Metric `wins` "theo bàn": mỗi lần giải xong một bàn (hoặc đề ngày) là một ván thắng. Mode theo mức: `easy` (2 điểm), `medium` (4), `hard` (6), `daily` (4).
- `rules.min_duration_ms` = số nước tối thiểu nhỏ nhất của mức × 250 ms (thời gian kéo một xe nhanh nhất), không dưới 3000 ms theo mục 4.8 của lộ trình: Dễ 5 × 250 = 1250 → 3000; Vừa 13 × 250 = 3250; Khó 25 × 250 = 6250; Hằng ngày 14 × 250 = 3500.
- Hiện bàn: `kit.sdk.start(mode)`; mở lại ván lưu dở: `kit.sdk.start(mode, true)`.
- Giải xong: `kit.sdk.end({ mode, won: true, assisted })` (`assisted` = đã dùng Gợi ý).
- Chơi lại hoặc rời sang bàn khác khi ván đã đi ít nhất một nước (kể cả đã hoàn tác hết): `won: false`. Chưa đi nước nào thì không gửi gì.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-thoatxe-settings-v1` | Cài đặt (giao diện) |
| `playnine-thoatxe-stats-v1` | `best[mức][bàn] = { m: số nước, s: sao }`, bàn đang chơi `current`, kết quả đề ngày `daily[ngày] = { m, s, a: có gợi ý }`, số lượt chơi / thắng / tổng nước / lần gợi ý |
| `playnine-thoatxe-save-v1` | Ván đang chơi dở: `{ v, game: { v, level, board, puzzle, min, hist, assisted } }`, `hist` là các nước `[xe, từ, tới]`. Khi mở lại, engine kiểm đề đúng là đề của bàn / ngày đó, giải lại để so `min`, đi lại từng nước và bỏ ván nếu có gì sai |
| `playnine-thoatxe-summary-v1` | Tóm tắt cho thẻ game trên cổng (kèm ô đề hằng ngày) |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Kiểm tra engine

```bash
node test.js
```

Test phủ: đọc đề và từ chối đề sai; luật trượt theo trục, chặn bởi xe khác / mép bãi, gộp nước; thắng khi xe đỏ tới cửa; BFS đúng số nước tối thiểu trên các đề tay biết trước đáp án (0–4 nước) và đề vô nghiệm; BFS khớp phân tích cả cụm; gợi ý luôn bớt đúng một nước còn lại (kể cả sau nước đi lệch); sinh đề tất định theo seed, đúng khoảng mức, giải được; cả bộ đề sinh sẵn đúng khoảng, không trùng, đúng số nước tối thiểu; đề hằng ngày tất định và không trùng trong vòng; sao; hoàn tác; lưu / khôi phục ván và tiến độ bàn, từ chối dữ liệu hỏng; tốc độ gợi ý.

Test "ván thắng" trong cổng: `e2e.spec.ts` (chạy cùng `npm run e2e` sau khi build).
