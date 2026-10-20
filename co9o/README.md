# Cờ 9 Ô (Ultimate Tic-Tac-Toe)

Game Cờ 9 Ô chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài. Mở `index.html` là chơi được. Đây là game đại diện của cổng PlayNine.

## Luật chơi

- Bàn lớn gồm 9 bàn nhỏ, mỗi bàn nhỏ là một lưới ca-rô 3x3. X đi trước và được đánh ở bất kỳ ô nào.
- Vị trí ô bạn đánh trong bàn nhỏ quyết định bàn nhỏ mà đối thủ phải đánh tiếp (đánh ô trên phải thì đối thủ phải đánh trong bàn trên phải).
- Nếu bàn bị gửi tới đã có người thắng hoặc đã đầy, đối thủ được đánh vào bất kỳ bàn nào còn mở.
- 3 quân thẳng hàng trong một bàn nhỏ thì chiếm được bàn đó. Bàn đầy mà không ai thắng là bàn hòa, không tính cho ai.
- Chiếm 3 bàn nhỏ thẳng hàng trên bàn lớn thì thắng. Hết nước đi mà không ai làm được thì hòa.

## Tính năng

- Hai chế độ: Người vs Máy (chọn cầm X hoặc O) và Hai người trên cùng máy.
- AI Monte Carlo Tree Search (UCT) chạy trong Web Worker nên không treo giao diện. 3 mức: Dễ (khoảng 0,2 s, thỉnh thoảng đi bừa), Vừa (khoảng 0,8 s), Khó (khoảng 2 s). Mọi mức đều đi ngay nước thắng cả ván và tránh nước để đối thủ thắng ngay ở nước sau (khi còn lựa chọn khác).
- Bàn phải đánh sáng viền theo màu bên đang đi, có nhịp sáng nhẹ; bàn còn mở nhưng không được đánh bị làm mờ. Khi được chọn tự do, mọi bàn còn mở cùng sáng.
- Bàn nhỏ đã thắng hiện dấu X / O lớn (vẽ dần), bàn hòa hiện nhãn "Hòa". Đường thắng trên bàn lớn được vẽ dần khi kết thúc ván.
- Đánh dấu nước vừa đi, thẻ người chơi hiện lượt đi và số bàn nhỏ đã chiếm, dòng trạng thái nói rõ phải đánh vào bàn nào, "Máy đang nghĩ…" khi máy tính nước.
- Đi lại: khi đấu máy thì gỡ nước của bạn cùng nước đáp của máy (kể cả khi máy đang nghĩ). Đổi bên: giữa ván thì bạn cầm quân bên kia và máy tiếp quản phía còn lại; sau khi hết ván thì mở ván mới với bên đã đổi.
- Hướng dẫn "Cách chơi" 5 bước có hình minh họa vẽ bằng SVG, tự mở ở lần đầu vào game, sau đó mở bằng nút "?" (hoặc phím `H`).
- Thống kê theo mức máy: số ván, thắng, thua, hòa; chuỗi thắng hiện tại và dài nhất; số ván hai người. Có nút đặt lại (bấm hai lần để xác nhận). Ván bỏ dở không tính vào thống kê.
- Tự lưu ván đang chơi, mở lại trang thì tiếp tục (kể cả khi đang tới lượt máy).
- Cài đặt giao diện Tự động / Sáng / Tối, áp trước khi vẽ trang để không nháy màu.
- Tối ưu mobile: bàn cờ co theo chiều cao khung (`100dvh`) để không phải cuộn khi chơi, ô tối thiểu khoảng 32 px ở bề rộng 360 px, modal dạng bottom sheet, layout ngang (bàn cờ trái, bảng điều khiển phải) khi màn hình rộng, tôn trọng safe-area.
- Điều khiển bằng bàn phím với tiêu điểm hiển thị rõ; tắt hiệu ứng khi hệ thống bật giảm chuyển động.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| Phím mũi tên | Di chuyển giữa 81 ô (bàn cờ chỉ có một điểm dừng Tab) |
| `Enter` / `Space` | Đánh vào ô đang chọn |
| `Z` / `Ctrl+Z` | Đi lại |
| `S` | Đổi bên |
| `N` | Ván mới |
| `H` / `?` | Cách chơi |
| `Esc` | Đóng hộp thoại |

## Cấu trúc

```
index.html  Khung trang, modal
style.css   Giao diện, màu PlayNine, dark mode, responsive
engine.js   Luật chơi + AI MCTS, không đụng DOM (chạy trong trình duyệt, Node và Web Worker)
app.js      Logic game + render (cần engine.js nạp trước)
test.js     Test engine và AI chạy bằng Node
icon.svg    Icon app, dùng làm favicon
```

Toàn bộ engine nằm trong hàm `Co9oFactory`. `app.js` dựng Web Worker từ Blob chứa `Co9o.factory.toString()`, nên máy vẫn nghĩ trong worker khi mở game bằng `file://`. Nếu trình duyệt không tạo được worker, máy tính trên luồng chính.

Phiên bản app nằm ở hằng `APP_VERSION` đầu `app.js` (hiển thị trong modal Cài đặt). Khi phát hành bản mới, tăng số này và sửa tham số `?v=` của `style.css`, `engine.js`, `app.js` trong `index.html`. Thời gian nghĩ và xác suất đi bừa của từng mức máy nằm trong `LEVELS` ở `engine.js`.

## Dữ liệu lưu trong trình duyệt

| Khóa `localStorage` | Nội dung |
| --- | --- |
| `playnine-co9o-settings-v1` | Giao diện, chế độ, mức máy, bên cầm, đã xem hướng dẫn chưa |
| `playnine-co9o-save-v1` | Ván đang chơi (danh sách nước đi) |
| `playnine-co9o-stats-v1` | Thống kê theo mức và ván hai người |
| `playnine-co9o-summary-v1` | Tóm tắt cho thẻ game trên cổng PlayNine (`v`, `played`, `won`, `note`, `stats`, `resume`, `daily`) |

## Kiểm tra engine

```bash
node test.js
```

Kiểm tra luật bàn bắt buộc, chọn tự do khi bàn đích đã thắng hoặc đã đầy, thắng / hòa bàn nhỏ, thắng bàn lớn, hòa khi hết nước, 200 ván ngẫu nhiên không sinh trạng thái sai luật, AI đi ngay nước thắng, chặn nước thắng của đối thủ, trả nước hợp lệ trong thời gian cho phép của từng mức.

## Chạy cục bộ

Mở trực tiếp `index.html` bằng trình duyệt, hoặc chạy một static server bất kỳ:

```bash
npx serve .
```

Mọi đường dẫn trong dự án đều là đường dẫn tương đối nên chạy được ở bất kỳ sub-path nào.
