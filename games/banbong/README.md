# Bắn Bóng

Game bắn bóng (Bubble Shooter) chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài. Mở `index.html` là chơi được. Là một game trong cổng PlayNine (chạy trong iframe dưới thanh của cổng), nhưng cũng chạy độc lập.

## Luật chơi

- Bàn là lưới lục giác lệch hàng 11 cột (hàng dài 11 ô, hàng ngắn 10 ô lệch nửa ô). Súng ở đáy bắn bóng lên; bóng nảy ở hai tường bên, chạm trần hoặc chạm bóng khác thì dính vào ô trống gần nhất.
- Từ **3 bóng cùng màu liền nhau** trở lên thì nổ. Mọi bóng không còn nối (trực tiếp hay gián tiếp) với trần thì **rơi** và được điểm thưởng.
- Có bóng chờ trên súng và bóng kế; đổi hai bóng cho nhau bất cứ lúc nào. Chỉ chia màu **còn trên bàn**; nổ hết một màu thì bóng chờ / bóng kế mang màu đó được chia lại.
- **Áp lực**: cứ đủ N phát trượt (phát không nổ được bóng nào) thì một hàng mới đẩy cả bàn xuống. N = 6 khi điểm dưới 2.000, 5 dưới 5.000, 4 dưới 10.000, rồi 3. Các chấm cạnh súng đếm ngược tới hàng mới.
- Có bóng chạm **vạch đứt** gần súng (hàng 12) là hết ván.
- **Dọn sạch bàn**: thưởng lớn rồi sang bàn mới dày hơn, nhiều màu hơn (bàn 1: 5 hàng, 4 màu; bàn 2: 6 hàng, 5 màu; bàn 3: 7 hàng, 6 màu; từ bàn 4: 8 hàng, 6 màu). Trò chơi không có hồi kết.
- Bàn sinh ngẫu nhiên: mỗi ô có 45% lấy màu một ô kề đã có bóng (tạo cụm), còn lại chọn ngẫu nhiên. Số ngẫu nhiên lấy từ PRNG có seed lưu trong state nên ván khôi phục chia bóng giống hệt ván gốc.

## Điều khiển

| Phím / thao tác | Chức năng |
| --- | --- |
| Rê chuột | Ngắm theo con trỏ (khi con trỏ ở trên súng) |
| Nhấp chuột | Bắn |
| `←` `→` / `A` `D` | Xoay góc ngắm (giữ phím; nhấp ngắn xoay 1°) |
| `Space` / `Enter` / `↑` / `W` | Bắn (khi tạm dừng: `Space` / `Enter` chơi tiếp) |
| `X` | Đổi bóng chờ và bóng kế |
| `P` | Tạm dừng / chơi tiếp |
| `Esc` | Tạm dừng; đóng hộp thoại |
| `N` | Ván mới (đang dở ván thì hỏi lại) |
| `H` / `?` | Cách chơi |

**Cảm ứng**: chạm và kéo phía trên súng để ngắm, thả tay để bắn; kéo xuống ngang súng rồi thả là hủy. Chạm bóng kế (hoặc bóng trên súng) để đổi bóng.

Đường ngắm chấm chấm hiện tới lần nảy tường thứ hai (một lần nảy). Khi đường bay hiện trọn (không nảy quá một lần) thì có thêm vòng mờ ở ô bóng sẽ dính. Góc ngắm tối đa 80° so với phương thẳng đứng.

## Tính điểm

| Sự kiện | Điểm |
| --- | --- |
| Mỗi bóng nổ | 10 |
| Chuỗi (nổ ở các phát liên tiếp) | phát thứ 2 thêm 5 mỗi bóng nổ, từ phát thứ 3 thêm 10 (tối đa 20 mỗi bóng) |
| Bóng rơi thứ i trong một phát | 10 × 2^i, tối đa 60: 20, 40, 60, 60... |
| Dọn sạch bàn N | 500 + 250 × (N − 1), tối đa 2.000 |

Phát trượt đưa chuỗi về 0. Điểm cộng ngay khi engine tính phát bắn, nhưng ô Điểm chỉ tăng khi bóng chạm đích.

Mức tính điểm được chọn để tốc độ ghi điểm thấp, an toàn cho luật chống gian lận `max_score_per_sec` của server: một bot ngắm hoàn hảo (thử mọi góc, có đổi bóng) bắn mỗi phát sau 0,6 giây được trung bình khoảng 90 điểm/giây (cao nhất ~125); xét mọi thời điểm từ giây thứ 5 (điểm / thời gian từ đầu ván, đúng cách server kiểm tra) thì cao nhất khoảng 420 điểm/giây ở các ván mở đầu may mắn. Người chơi thật chậm hơn và không ngắm hoàn hảo nên thường dưới 100 điểm/giây.

## Ghi điểm trên cổng

Game xếp hạng theo điểm cao nhất (`score_high`), một mode `classic`:

- Bắt đầu ván (nút Bắt đầu / Chơi lại / Ván mới): `PlayNine.gameStart({ mode: 'classic' })`. Mở lại trang khi có ván đang dở: `PlayNine.gameStart({ mode: 'classic', resume: true })`, ván mở ở trạng thái tạm dừng.
- Hết ván: `PlayNine.gameEnd({ mode: 'classic', won: false, score })`, gửi ngay lúc engine tính ra phát bắn thua (không đợi bóng bay xong, lỡ người chơi đóng trang). Trò chơi vô tận nên `won` luôn là `false`, giống Xếp Gạch.
- Bỏ ván giữa chừng (Ván mới khi đang chơi): ván cũ được kết thúc với số điểm hiện có (`won: false`) trước khi bắt đầu ván mới. Ván chưa có điểm thì không gửi (ván mới ghi đè ván cũ ở cổng).

Mọi lời gọi đều qua `window.PlayNine` có kiểm tra tồn tại; không có file SDK (mở thẳng thư mục) thì game vẫn chơi bình thường, chỉ không ghi điểm. Âm thanh dùng `PlayNine.sfx` (tắt / bật chung với cổng qua khóa `playnine-sound-v1`), pháo giấy khi dọn sạch bàn dùng `PlayNine.fx.confetti`.

## Lưu tiến độ

Mọi khóa đều có tiền tố `playnine-banbong-`, mọi truy cập `localStorage` đều bọc `try/catch` (chế độ ẩn danh hoặc bị chặn bộ nhớ thì game vẫn chơi được, chỉ không lưu). Các khóa khớp mẫu `^playnine-[a-z0-9]+-(save|game|settings|stats|summary|progress)-v\d+$` nên cổng đồng bộ chúng lên tài khoản người chơi.

| Khóa | Nội dung |
| --- | --- |
| `playnine-banbong-save-v1` | Ván đang dở: `{ v: 1, game: <state engine>, counted, bestAtStart }`. State gồm bàn (`rows`, `parity`), bóng chờ / bóng kế, điểm, bộ đếm phát trượt, chuỗi, số bàn, seed PRNG. Xóa khi hết ván hoặc bỏ ván |
| `playnine-banbong-stats-v1` | `{ played, best, boards, popped, dropped, bestCombo }` |
| `playnine-banbong-settings-v1` | `{ theme: 'auto' \| 'light' \| 'dark', vibrate, guideSeen }` |
| `playnine-banbong-summary-v1` | Tóm tắt cho thẻ game ở cổng (điểm cao nhất, số bàn đã dọn, số bóng đã nổ, `resume` khi có ván dở) |

Ván được lưu sau mỗi phát bắn, khi đổi bóng, khi tạm dừng (kể cả tự dừng khi ẩn trang), khi rời trang và trước khi tải lại vì đổi ngôn ngữ. Một ván được tính vào `played` ở phát bắn đầu tiên. `E.restore()` kiểm tra kỹ dữ liệu (kích thước hàng, màu, ô thừa cuối hàng ngắn, các số không âm, seed) và trả về `null` khi hỏng; khi đó game bỏ ván lưu và hiện màn bắt đầu.

## Cấu trúc

```
index.html  Khung trang, lớp phủ bắt đầu / tạm dừng / hết ván, modal Cách chơi / Cài đặt / Thống kê / Xác nhận
i18n.js     Từ điển tiếng Anh / tiếng Việt và đối tượng I18N (nạp trước engine.js, app.js)
style.css   Giao diện theo bảng màu PlayNine, màu bóng --bb-1..--bb-6, dark mode, bố cục dọc / ngang, hiệu ứng
engine.js   Engine thuần (không đụng DOM): lưới lục giác, ô kề, quét đường bay + nảy tường, dính ô, loang cụm,
            tìm bóng lơ lửng, điểm, đẩy hàng, vạch thua, dọn bàn, chia màu, lưu / khôi phục, PRNG có seed
app.js      Vẽ canvas theo DPR, vòng lặp requestAnimationFrame theo dt, chuột / cảm ứng / bàn phím, hiệu ứng,
            lưu trữ, thống kê, tóm tắt và SDK của cổng (cần engine.js nạp trước)
test.js     Test engine chạy bằng Node
icon.svg    Icon app 64x64, dùng luôn làm favicon
```

`engine.js` gắn vào `window.BanBong` khi chạy trong trình duyệt và `module.exports` khi chạy trong Node. `shoot(state, angle)` tính trọn một phát bắn ngay lập tức và trả về sự kiện (đường bay, ô dính, bóng nổ / rơi kèm toạ độ, điểm, chuỗi, phát trượt, đẩy hàng, dọn bàn, hết ván). App chụp lại bàn trước phát bắn để vẽ trong lúc bóng bay, tới đích mới chuyển sang bàn mới và chạy hiệu ứng; nhờ vậy state luôn nhất quán và lưu được bất cứ lúc nào.

Sân logic 352 x 440 (tỉ lệ 4:5) là hình chữ nhật lớn nhất vừa phần còn lại của màn hình (`100dvh` + container query), không phải cuộn khi chơi; trên điện thoại dọc sân tràn viền. Bóng vẽ sẵn ra sprite theo màu và cỡ hiện tại; mỗi màu có một ký hiệu riêng (chấm, tam giác, vuông, thoi, chữ thập, vòng) để không phải dựa vào màu sắc. Tôn trọng `prefers-reduced-motion`: tắt mảnh vỡ, bóng nổ phình, điểm bay và hiệu ứng bàn trượt; bóng bay và bóng rơi vẫn chạy vì là chuyển động chính.

Phiên bản app nằm ở hằng `APP_VERSION` đầu `app.js` (hiển thị trong Cài đặt). Khi phát hành bản mới, tăng số này và tham số `?v=` của các file trong `index.html`.

## Ngôn ngữ / Language

Game có tiếng Anh (mặc định, "Bubble Shooter") và tiếng Việt ("Bắn Bóng"). Ngôn ngữ lưu ở khóa dùng chung với cổng `localStorage['playnine-lang']`; đổi trong Cài đặt thì game tạm dừng, lưu ván rồi tải lại; đổi ở cổng thì game nhận sự kiện `storage` và tự tải lại theo. Chữ vẽ trên canvas (Kế, Thêm hàng sau N, Chuỗi xN, Rơi +N) cũng lấy từ `i18n.js`.

## Chạy test

```bash
node test.js
```

Kiểm tra: kích thước lưới và toạ độ tâm ô; ô kề của hàng dài / hàng ngắn ở cả hai parity, tính đối xứng và khoảng cách đúng một đường kính; đường bay thẳng lên trần, nảy tường phải, kẹp góc ±80°; dính vào ô trống kề bóng bị chạm (gần điểm chạm nhất); nổ cụm 3 (không nổ cụm 2, phát trượt tăng bộ đếm); loang cụm theo 6 hướng; bóng lơ lửng rơi sau khi nổ và điểm rơi; đẩy hàng (parity đảo, toạ độ ngang của bóng cũ giữ nguyên) sau đúng N phát trượt, N giảm theo điểm; thua khi bóng dính hoặc bị đẩy chạm vạch; dọn sạch bàn sang bàn dày hơn; chỉ chia màu còn trên bàn và chia lại khi hết màu; điểm nổ / chuỗi / rơi / thưởng dọn bàn; lưu và khôi phục qua JSON (chơi tiếp giống hệt ván gốc), từ chối dữ liệu hỏng; 300 ván tự chơi ngẫu nhiên luôn hợp lệ và luôn kết thúc.

Test e2e của cổng dựng sẵn một ván lưu sát vạch (12 hàng đầy, bóng chờ khác màu) trong `localStorage`: mở game là ván ở trạng thái tạm dừng, bấm Tiếp tục rồi `Space` bắn thẳng lên là hết ván và gửi `pn:end` có điểm. Không cần cờ URL riêng cho test.
