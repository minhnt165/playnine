# Trượt Số

Game Trượt Số (Sliding Puzzle, họ "15-puzzle") chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài. Mở `index.html` là chơi được. Là một game trong cổng PlayNine (chạy trong iframe dưới thanh của cổng), nhưng cũng chạy độc lập.

## Luật chơi

- Bàn n x n có n²-1 ô số và một ô trống. Mục tiêu: xếp các số theo thứ tự 1, 2, ..., n²-1 (đọc theo hàng), ô trống ở góc dưới phải.
- Chỉ ô cùng hàng hoặc cùng cột với ô trống mới trượt được. Chạm một ô không kề ô trống thì cả đoạn từ ô đó tới ô trống trượt theo; trượt cả đoạn chỉ tính **một nước**.
- Ba kích thước (mode): `3x3`, `4x4` (mặc định), `5x5`. Đổi trong Cài đặt hoặc bấm nhãn kích thước cạnh tên game; mỗi kích thước có kỷ lục và bảng xếp hạng riêng.
- Đồng hồ chạy từ nước đi đầu tiên, tạm dừng khi ẩn tab. Xếp xong thì hiện lớp phủ với thời gian, số nước, kỷ lục mới (nếu có), nút **Chơi lại** và **Đổi kích thước**.
- Ô đã nằm đúng chỗ đổi màu xanh lơ, có vạch nhỏ dưới số.

**Luôn giải được:** `shuffle()` trong `engine.js` lấy một hoán vị ngẫu nhiên (Fisher-Yates); nếu không giải được thì đổi chỗ hai ô số đầu tiên (đổi tính chẵn lẻ của số nghịch thế). Bàn đã xếp xong hoặc quá gần đích (tổng khoảng cách Manhattan < n²) thì xáo lại. Điều kiện giải được: cạnh lẻ thì số nghịch thế chẵn; cạnh chẵn thì số nghịch thế + số thứ tự hàng của ô trống tính từ dưới lên (bắt đầu từ 1) là số lẻ.

## Điều khiển

| Thao tác | Chức năng |
| --- | --- |
| Chạm / bấm ô | Trượt ô (hoặc cả đoạn) về phía ô trống |
| Vuốt trên bàn | Bắt đầu trên một ô cùng hàng / cột và vuốt về phía ô trống: trượt cả đoạn từ ô đó; vuốt ở chỗ khác: đưa ô theo hướng vuốt vào ô trống |
| Phím mũi tên / `W` `A` `S` `D` | Đưa ô theo hướng phím vào ô trống (vd. `←`: ô bên phải ô trống trượt sang trái) |
| `N` | Ván mới (hỏi lại nếu đang dở ván) |
| `Esc` | Đóng hộp thoại |

Vuốt dùng pointer events (ngưỡng 24px, bỏ qua thao tác hai ngón trở lên); bàn chơi đặt `touch-action: none` nên vuốt không cuộn trang. Ô trượt bằng `transform`; người chơi chọn giảm chuyển động (`prefers-reduced-motion`) thì không có hiệu ứng trượt / nảy.

## Ghi điểm trên cổng

Mỗi bàn là một ván, `mode` là kích thước (`'3x3'`, `'4x4'`, `'5x5'`), bảng xếp hạng theo thời gian thấp nhất (`time_low`):

- Bắt đầu bàn mới: `PlayNine.gameStart({ mode })`. Mở lại trang khi bàn đã đi ít nhất một nước: `resume: true`; bàn chưa đi nước nào thì coi như ván mới (không có `resume`).
- Xếp xong: `PlayNine.gameEnd({ mode, won: true, timeMs, assisted: false })`, `timeMs` là thời gian trên đồng hồ (từ nước đầu tiên, không tính lúc ẩn tab).
- Bỏ bàn đã đi ít nhất một nước (Ván mới, đổi kích thước): `gameEnd({ mode, won: false })`.

Không có trợ giúp nên `assisted` luôn là `false`. Không có SDK (mở thẳng thư mục game) thì vẫn chơi bình thường, chỉ không ghi điểm.

## Lưu tiến độ

Mọi khóa đều có tiền tố `playnine-truotso-` và khớp mẫu khóa mà cổng đồng bộ lên tài khoản. Mọi truy cập `localStorage` đều bọc `try/catch` (ẩn danh hoặc bị chặn bộ nhớ thì vẫn chơi được, chỉ không lưu).

| Khóa | Nội dung |
| --- | --- |
| `playnine-truotso-settings-v1` | `{ theme: 'auto' \| 'light' \| 'dark', mode: '3x3' \| '4x4' \| '5x5' }` |
| `playnine-truotso-save-v1` | Bàn đang chơi dở: `{ v: 1, game: { v, size, tiles, moves }, elapsed, counted, savedAt }` (xóa khi xếp xong) |
| `playnine-truotso-stats-v1` | `{ played, solved, modes: { '4x4': { played, solved, bestMs, bestMoves }, ... } }` |
| `playnine-truotso-summary-v1` | Tóm tắt cho thẻ game trên cổng PlayNine (kỷ lục, số lần giải, ván dở) |

Ván dở được lưu sau mỗi nước, mỗi 5 giây khi đồng hồ chạy, khi ẩn tab và khi rời trang. `restore()` từ chối bàn hỏng (không phải hoán vị, sai kích thước, không giải được, đã xếp xong); khi đó game mở bàn mới. Ngôn ngữ dùng khóa chung của cổng `playnine-lang` (`'en'` mặc định, `'vi'`); đổi ngôn ngữ thì game lưu ván rồi tải lại trang. Bật / tắt tiếng dùng khóa chung `playnine-sound-v1` qua `PlayNine.sfx` (không có SDK thì ẩn hàng Âm thanh).

**Test e2e:** không có hook riêng cho test. Test ghi sẵn vào `playnine-truotso-save-v1` một bàn 4x4 chỉ còn một nước (`[1..14, 0, 15]`, `moves: 40`, `elapsed: 60000`) bằng `addInitScript`, rồi bấm ô `15` để thắng.

## Cấu trúc

```
index.html  Khung trang, lớp phủ thắng, modal Cài đặt / Thống kê / Xác nhận
style.css   Giao diện (bảng màu PlayNine, bàn tím than, ô trắng sữa), dark mode, responsive, giảm chuyển động
engine.js   Engine thuần (không đụng DOM): xáo, kiểm tra giải được, trượt ô / cả đoạn, thắng, khôi phục state
app.js      Render theo số trên ô, chạm / vuốt / bàn phím, đồng hồ, lưu trữ, thống kê, SDK, tóm tắt cho cổng
i18n.js     Từ điển tiếng Anh / tiếng Việt và hàm dịch I18N (nạp trước engine.js, app.js)
test.js     Test engine chạy bằng Node
icon.svg    Icon app 64x64, dùng luôn làm favicon
```

`engine.js` gắn vào `window.TruotSo` khi chạy trong trình duyệt và `module.exports` khi chạy trong Node. Phiên bản app ở hằng `APP_VERSION` đầu `app.js` (hiện trong modal Cài đặt); khi phát hành bản mới, tăng số này và tham số `?v=` của các file trong `index.html`.

## Chạy test

```bash
node test.js
```

Kiểm tra: xáo bàn ở cả ba kích thước luôn ra hoán vị hợp lệ, giải được, chưa xếp xong và không quá gần đích; tính giải được (bàn sinh bằng nước đi hợp lệ luôn giải được, đổi chỗ hai ô thì không); nước đi (chỉ ô cùng hàng / cột, trượt cả hàng / cột tính một nước, phím hướng); phát hiện thắng và chặn đi tiếp khi đã xong; lưu / khôi phục qua JSON và từ chối dữ liệu hỏng.
