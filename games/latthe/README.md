# Lật Thẻ

Game Lật Thẻ (Memory Match, trò "lật hình tìm cặp") chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài. Mở `index.html` là chơi được. Là một game trong cổng PlayNine (chạy trong iframe dưới thanh của cổng).

## Luật chơi

- Các thẻ úp mặt trên bàn; mỗi hình có đúng 2 thẻ.
- Mỗi lượt lật 2 thẻ. Hai thẻ cùng hình thì giữ mở (ghép cặp); khác hình thì cả hai úp lại sau khoảng 0,9 giây. Trong lúc cặp sai còn mở, bàn bị khóa, không lật thêm được.
- Ghép hết các cặp là thắng. Đồng hồ chạy từ lần lật đầu tiên; thời gian càng ngắn càng tốt.
- Bộ hình mang chất Việt (đèn lồng, nón lá, hoa sen, bát phở, bánh chưng, cà phê phin, thuyền buồm, trống đồng, xoài, thanh long, con trâu, cây tre, cánh diều, đèn ông sao, bánh mì, trái dừa, ấm trà, quạt giấy), vẽ bằng SVG nên mọi máy hiện giống nhau.

## Độ khó

| Mức | `mode` | Số thẻ | Số cặp |
| --- | --- | --- | --- |
| Dễ | `easy` | 12 | 6 |
| Vừa | `medium` | 16 | 8 |
| Khó | `hard` | 30 | 15 |

Mỗi bàn chọn ngẫu nhiên số hình cần dùng trong 18 hình rồi xáo. Lưới không cố định: `app.js` chọn cách xếp cho thẻ to nhất trong khung màn hình (ví dụ mức Khó là 5 cột x 6 hàng trên điện thoại dọc, 6 x 5 trên máy tính, 10 x 3 khi điện thoại xoay ngang). Đổi độ khó khi đang chơi dở sẽ hỏi lại trước.

## Điều khiển

| Thao tác | Chức năng |
| --- | --- |
| Chạm / bấm thẻ | Lật thẻ |
| Phím mũi tên, `Home`, `End` | Di chuyển giữa các thẻ |
| `Enter` / `Space` | Lật thẻ đang chọn |
| `1` `2` `3` | Chọn độ khó Dễ / Vừa / Khó |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại |

## Ghi điểm trên cổng

Mỗi bàn là một ván, xếp hạng theo thời gian (`time_low`, nhanh nhất đứng đầu), `mode` là `easy` / `medium` / `hard`:

- Chia bàn mới: `PlayNine.gameStart({ mode })`. Mở lại trang khi đang chơi dở: `resume: true`.
- Ghép hết các cặp: `PlayNine.gameEnd({ mode, won: true, timeMs, assisted: false })`, `timeMs` là thời gian từ lần lật đầu (không tính lúc trang bị ẩn).
- Bỏ bàn đã lật ít nhất một thẻ (bấm Ván mới hoặc đổi độ khó): gửi `won: false`. Bàn chưa lật thẻ nào thì không gửi gì.

Game không có trợ giúp nên luôn gửi `assisted: false`. Chạy không có SDK (mở thẳng thư mục) vẫn chơi bình thường, chỉ không ghi điểm.

## Lưu tiến độ

| Khóa | Nội dung |
| --- | --- |
| `playnine-latthe-settings-v1` | Cài đặt: độ khó đang chọn, giao diện, rung |
| `playnine-latthe-stats-v1` | Mỗi độ khó: số bàn đã chơi, số bàn hoàn thành, kỷ lục thời gian, ít lượt nhất |
| `playnine-latthe-save-v1` | Bàn đang chơi dở và thời gian đã chơi (xóa khi thắng) |
| `playnine-latthe-summary-v1` | Tóm tắt cho thẻ game trên cổng PlayNine |

Các khóa theo mẫu `playnine-<id>-(save|settings|stats|summary)-v1` nên cổng tự đồng bộ vào tài khoản người chơi. Mọi lần đọc / ghi đều bọc `try/catch`; dữ liệu hỏng thì bỏ qua và chia bàn mới. Cặp sai đang chờ úp lúc lưu thì khi mở lại coi như đã úp.

## Ngôn ngữ / Language

Giao diện có tiếng Anh (mặc định, tên "Memory Match") và tiếng Việt ("Lật Thẻ"). Ngôn ngữ lưu ở khóa dùng chung với cổng PlayNine `localStorage['playnine-lang']`; đổi ngôn ngữ thì game lưu ván rồi tải lại trang.

## Cấu trúc

```
index.html  Khung trang, modal (thắng, xác nhận, cài đặt, thống kê)
style.css   Giao diện (nền giấy dó, lưng thẻ sơn mài đỏ viền vàng), lật thẻ 3D, dark mode, responsive
engine.js   Engine thuần (không đụng DOM): chia bài, lật / ghép / khóa, lưu / khôi phục, PRNG có seed
app.js      Logic game + render (cần engine.js nạp trước); bộ hình SVG ở đầu file (ICONS)
i18n.js     Từ điển tiếng Anh / tiếng Việt và hàm dịch I18N (nạp trước engine.js, app.js)
test.js     Test engine chạy bằng Node
icon.svg    Icon app 64x64, dùng luôn làm favicon
```

Mỗi thẻ là một `<button class="card" data-i data-face>`; `data-face` là số hình (0–17), cặp nào cùng `data-face` là một cặp. Âm thanh và pháo giấy dùng chung của SDK (`PlayNine.sfx`, `PlayNine.fx`); tắt tiếng ở cổng thì game cũng im. Bật "giảm chuyển động" của hệ thống thì thẻ lật tức thì, không có hiệu ứng.

## Chạy test

```bash
node test.js
```

Kiểm tra: số thẻ mỗi mức độ, mỗi hình đúng 2 thẻ, cùng seed thì cùng bàn, lật thẻ đầu, ghép cặp, cặp sai khóa bàn tới khi úp lại, thắng khi ghép hết (chơi không sai thì số lượt bằng số cặp), lưu / khôi phục và từ chối JSON hỏng.
