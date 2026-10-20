# Cờ Gánh

Game Cờ Gánh (trò chơi dân gian Việt Nam, chơi trên bàn kiểu Alquerque 5 x 5) chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài. Mở `index.html` là chơi được.

## Luật chơi

- Bàn có 5 x 5 điểm giao (25 điểm). Mọi điểm nối với điểm kề bên theo hàng ngang và hàng dọc. Đường chéo chỉ đi qua các điểm có (hàng + cột) chẵn, tạo thành hai đường chéo lớn và hình thoi nối trung điểm bốn cạnh.
- Mỗi bên 8 quân, tổng 16 quân. Bạn (hoặc Người 1) cầm quân đỏ phía dưới: cả hàng 1, cùng a2, e2, e3. Máy (hoặc Người 2) cầm quân xanh phía trên: cả hàng 5, cùng a4, e4, a3. 9 điểm còn lại để trống.
- Đến lượt, đi một quân của mình một bước dọc theo đường kẻ tới điểm trống kề bên.
- Gánh: quân vừa đi tới điểm P, xét từng đường thẳng đi qua P (ngang, dọc và hai đường chéo nếu P có đường chéo). Nếu hai điểm kề P ở hai phía đối nhau trên đường đó đều là quân đối thủ thì cả hai đổi sang màu của người vừa đi. Một nước có thể gánh nhiều đường cùng lúc. Chỉ quân vừa đi mới gánh; tự đi vào giữa hai quân đối thủ thì không bị ăn.
- Vây (chẹt): gánh xong, mọi nhóm quân đối thủ (các quân nối nhau theo đường kẻ) không còn điểm trống nào kề bên thì đổi màu hết. Sau mỗi nước chỉ xét nhóm quân của đối thủ, không xét quân của người vừa đi.
- Luật Mở (tùy chọn, mặc định tắt): nếu nước trước vừa bỏ trống điểm P và bên đang đi có nước đi vào P mà gánh được, thì bên đó bắt buộc phải chọn một trong các nước ấy. Khi bật, quân phải đi nhấp nháy và dòng lượt đi ghi "Luật Mở: phải đi vào … để gánh".
- Thắng khi đối thủ không còn quân nào. Đến lượt mà không còn nước đi thì thua.
- Hòa khi cùng một thế cờ với cùng bên đi xuất hiện lần thứ 3, hoặc 60 nước (tính cả hai bên) liên tiếp không ai ăn được quân.

### Các điểm luật game tự chọn

- Vây chỉ xét sau khi gánh xong, và chỉ xét quân đối thủ của người vừa đi. Quân của người vừa đi dù bị kẹt cũng giữ nguyên, tới lượt đối thủ đi xong mới bị xét.
- Luật Mở chỉ bắt khi nước vào điểm vừa bỏ trống gánh được (vây không tính). Nếu có nhiều quân đi vào được điểm đó thì người chơi chọn quân nào cũng được. Luật Mở lưu cùng ván, đổi giữa chừng chỉ áp dụng từ ván sau (ván chưa đi nước nào thì áp ngay).
- Hết nước đi thì thua. Thực tế gần như không gặp: vây luôn đổi màu mọi nhóm quân hết đường thoát, nên sau mỗi nước bên sắp đi còn ít nhất một nước. Luật vẫn có trong engine để xử lý mọi thế cờ.
- Xét hết ván theo thứ tự: hết quân, hết nước đi, lặp thế 3 lần, 60 nước không ăn quân. Thế cờ để tính lặp gồm vị trí quân và bên đang đi (không tính trạng thái Luật Mở).
- Mốc 60 nước không ăn quân tính từ đầu ván, nên ván mà hai bên cùng giữ thế quá lâu từ khai cuộc cũng hòa.

## Tính năng

- Hai chế độ: Người vs Máy (chọn bạn đi trước hoặc máy đi trước) và Hai người trên cùng máy.
- AI minimax cắt tỉa alpha-beta, chạy trong Web Worker nên không treo giao diện. Hàm đánh giá: hiệu số quân là chính, cộng độ cơ động (số nước đi được), vị trí (điểm nhiều đường kẻ) và độ an toàn (số quân bên sắp đi gánh được ngay / đang bị dọa gánh). Lợi thế thế cờ nhạt dần khi gần mốc 60 nước không ăn, và máy coi hòa là hơi thiệt, nên máy chủ động tìm nước ăn thay vì đi lòng vòng. 3 mức: Dễ (tính 1–2 nước, cộng nhiễu ngẫu nhiên nên hay chọn lệch), Vừa (tính 4 nước), Khó (đào sâu dần trong khoảng 1,5 giây). Máy bắt đầu nghĩ ngay trong lúc hiệu ứng nước của bạn đang chạy, hiện "Máy đang nghĩ…", rồi cho thấy quân nó cầm và điểm đến trước khi đi.
- Bàn gỗ vuông, đường kẻ vẽ bằng SVG, quân tròn vẽ bằng CSS; quân xanh có vòng tròn, quân đỏ có chấm để phân biệt không chỉ bằng màu. Có nhãn cột a–e và hàng 1–5.
- Chạm quân của mình để hiện các điểm đến: chấm vàng là đi được, vòng đỏ ghi "+2" là đi tới đó ăn được bao nhiêu quân. Chạm điểm đến để đi, hoặc kéo quân thả vào điểm đến.
- Hiệu ứng quân trượt theo đường kẻ, quân bị gánh / vây sáng đỏ rồi lật màu. Nước vừa đi được đánh dấu bằng đường vàng nối điểm đi – điểm đến, viền vàng ở quân vừa đi, vòng nét đứt ở các quân vừa đổi màu. Tốc độ Chậm / Vừa / Nhanh / Tắt hiệu ứng; đang chạy hiệu ứng thì chạm bất kỳ đâu trên sân (hoặc `Space`) để bỏ qua.
- Thẻ người chơi hiện số quân trên bàn, tổng số quân đã ăn và lượt đi.
- Nhật ký nước đi bằng tọa độ ("Bạn: b2 → c3, gánh 2", "Máy: d4 → c5 (bắt buộc), gánh 2, vây 1"), kèm dòng tổng kết cuối ván.
- Đi lại: khi đấu máy thì gỡ nước của bạn cùng nước đáp của máy (kể cả khi máy đang nghĩ hoặc đang đi). Ván mới chọn chế độ, mức máy, lượt đi đầu.
- Hướng dẫn "Cách chơi" 7 bước có hình minh họa vẽ bằng SVG (bàn cờ, đi quân, gánh, gánh nhiều đường, vây, Luật Mở, thắng thua hòa), tự mở ở lần đầu vào game, sau đó mở bằng nút "?" (hoặc phím `H`).
- Thống kê theo mức máy: số ván, thắng, thua, hòa; chuỗi thắng dài nhất; số ván hai người. Có nút đặt lại (bấm hai lần để xác nhận). Ván bỏ dở không tính vào thống kê.
- Tự lưu ván đang chơi, mở lại trang thì tiếp tục (kể cả khi đang tới lượt máy).
- Cài đặt giao diện Tự động / Sáng / Tối, áp trước khi vẽ trang để không nháy màu.
- Tối ưu mobile: dùng `100dvh`, không cuộn trang khi chơi ở 360 x 640, khoảng cách giữa hai điểm khoảng 50 px ở bề rộng 360 px, modal dạng bottom sheet, layout ngang (bàn bên trái, cột lượt / nút / nhật ký bên phải) khi màn hình rộng, tôn trọng safe-area.
- Điều khiển bằng bàn phím với tiêu điểm hiển thị rõ; tắt chuyển động khi hệ thống bật giảm chuyển động (vẫn đi từng bước nhưng quân không trượt, không lật).

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `→` `↓` | Di chuyển giữa 25 điểm trên bàn (bàn chỉ có một điểm dừng Tab) |
| `Enter` / `Space` | Cầm quân đang chọn (bấm lại để bỏ), hoặc đi tới điểm đến đang chọn |
| `Esc` | Bỏ chọn quân, đóng hộp thoại |
| `Space` khi đang có hiệu ứng | Bỏ qua hiệu ứng |
| `Z` / `Ctrl+Z` | Đi lại |
| `N` | Ván mới |
| `H` / `?` | Cách chơi |

## Cấu trúc

```
index.html  Khung trang, modal
style.css   Giao diện, màu PlayNine, bàn gỗ, dark mode, responsive
engine.js   Luật chơi + AI minimax, không đụng DOM (chạy trong trình duyệt, Node và Web Worker)
i18n.js     Từ điển tiếng Anh / tiếng Việt và hàm I18N (nạp trước engine.js, app.js)
app.js      Logic game, hiệu ứng, render (cần engine.js nạp trước)
test.js     Test engine và AI chạy bằng Node
icon.svg    Icon app, dùng làm favicon
```

Toàn bộ engine nằm trong hàm `CoGanhFactory`. `app.js` dựng Web Worker từ Blob chứa `CoGanh.factory.toString()`, nên máy vẫn nghĩ trong worker khi mở game bằng `file://`. Nếu trình duyệt không tạo được worker, máy tính trên luồng chính.

Điểm được đánh số `i = hàng * 5 + cột` (hàng 0 ở trên cùng), nước đi mã hóa thành `từ * 25 + đến`. `CoGanh.play(state, move, events)` trả về diễn biến từng bước (`move`, `ganh`, `vay`, `over`) để giao diện vẽ lại hiệu ứng. Ván được lưu dưới dạng danh sách nước đi và dựng lại bằng `fromMoves`, nên Đi lại và khôi phục ván luôn khớp luật (kể cả đếm lặp thế).

Phiên bản app nằm ở hằng `APP_VERSION` đầu `app.js` (hiển thị trong modal Cài đặt). Khi phát hành bản mới, tăng số này và sửa tham số `?v=` của `style.css`, `i18n.js`, `engine.js`, `app.js` trong `index.html`. Độ sâu, nhiễu và thời gian nghĩ của từng mức máy nằm trong `LEVELS` ở `engine.js`.

## Ngôn ngữ / Language

Giao diện có tiếng Anh (mặc định) và tiếng Việt. Toàn bộ chữ nằm trong từ điển `{ en, vi }` ở `i18n.js`; `engine.js` không chứa chữ hiển thị.

- Ngôn ngữ lưu ở khóa dùng chung `localStorage['playnine-lang']` (`'en'` hoặc `'vi'`, thiếu hoặc sai thì là `'en'`), chung cho cổng PlayNine và mọi game.
- `I18N.t(key, params)` tra chữ theo ngôn ngữ hiện tại (thiếu thì lấy tiếng Anh), thay `{tên}` bằng tham số, hỗ trợ số nhiều `{ one, other }` cho tiếng Anh. `I18N.apply()` điền chữ cho các phần tử có `data-i18n`, `data-i18n-html`, `data-i18n-attr` trong `index.html` (chữ gốc trong HTML là tiếng Anh).
- Đổi ngôn ngữ ở Cài đặt → Ngôn ngữ: game lưu ván rồi tải lại trang, ván đang chơi giữ nguyên. Trang khác đổi khóa `playnine-lang` thì game nhận sự kiện `storage` và tự tải lại. Tóm tắt cho cổng được ghi lại bằng ngôn ngữ hiện tại mỗi lần mở game.
- Thuật ngữ trong tiếng Anh giữ tên gốc không dấu: Ganh (carry), Vay (surround), Mo (open).

## Dữ liệu lưu trong trình duyệt

| Khóa `localStorage` | Nội dung |
| --- | --- |
| `playnine-coganh-settings-v1` | Giao diện, tốc độ hiệu ứng, Luật Mở, chế độ, mức máy, lượt đi đầu, đã xem hướng dẫn chưa |
| `playnine-coganh-save-v1` | Ván đang chơi (luật của ván + danh sách nước đi) |
| `playnine-coganh-stats-v1` | Thống kê theo mức, chuỗi thắng, ván hai người |
| `playnine-coganh-summary-v1` | Tóm tắt cho thẻ game trên cổng PlayNine (`v`, `played`, `won`, `note`, `stats`, `resume`, `daily` luôn là `null`) |

## Kiểm tra engine

```bash
node test.js
```

Kiểm tra bày quân, tọa độ, sinh nước đi (kể cả luật đường chéo), gánh một đường, gánh hai đường, gánh trên đường chéo, điểm lẻ không gánh chéo, đi vào giữa hai quân đối thủ không bị ăn, vây một quân, vây cả nhóm, gánh trước vây, không xét vây quân của bên vừa đi, Luật Mở bật / tắt, thắng khi ăn hết quân, thua khi hết nước, hòa do lặp thế 3 lần, hòa do 60 nước không ăn, dựng lại ván bằng `fromMoves`, 300 ván ngẫu nhiên luôn đủ 16 quân và đều kết thúc, AI trả nước hợp lệ ở mọi mức, AI chọn nước gánh hai đường, mức Khó trả nước trong khoảng 2 giây, Khó không thua Dễ.

## Chạy cục bộ

Mở trực tiếp `index.html` bằng trình duyệt, hoặc chạy một static server bất kỳ:

```bash
npx serve .
```

Mọi đường dẫn trong dự án đều là đường dẫn tương đối nên chạy được ở bất kỳ sub-path nào.
