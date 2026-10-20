# Bốn Liên Tiếp

Game Bốn Liên Tiếp (thả quân xếp bốn quân liền nhau) chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài. Mở `index.html` là chơi được.

## Luật chơi

- Bàn dựng đứng có 7 cột, 6 hàng (42 ô). Mỗi bên có 21 quân: bạn (hoặc Người 1) cầm quân vàng, máy (hoặc Người 2) cầm quân đỏ.
- Đến lượt, chọn một cột còn chỗ và thả một quân. Quân rơi xuống ô trống thấp nhất của cột đó. Cột đã đầy 6 quân thì không thả được nữa.
- Ai xếp được 4 quân của mình liền nhau theo hàng ngang, hàng dọc hoặc đường chéo (cả hai hướng chéo) trước thì thắng ngay.
- Kín cả 42 ô mà chưa ai có 4 quân liền nhau thì hòa.

### Các điểm luật game tự chọn

- Màu quân gắn với người chơi, không gắn với lượt đi: đấu máy thì bạn luôn cầm quân vàng, kể cả khi chọn máy đi trước.
- Năm quân trở lên liền nhau vẫn là thắng (được tô thành một đường dài). Một quân vừa thả hoàn thành hai đường cùng lúc thì tô cả hai.
- Thắng nhanh nhất tính bằng số quân bạn đã thả trong ván thắng (ít nhất là 4).

## Tính năng

- Hai chế độ: Người vs Máy (chọn bạn đi trước hoặc máy đi trước) và Hai người trên cùng máy.
- AI negamax cắt tỉa alpha-beta (PVS), chạy trong Web Worker nên không treo giao diện. Xét cột giữa trước, có bảng chuyển vị (khóa Zobrist), đánh giá thế cờ theo 69 "cửa sổ" 4 ô cộng điểm ô đe dọa theo chẵn lẻ hàng (người đi trước cần ô ở hàng lẻ, người đi sau ở hàng chẵn), cập nhật dần sau từng nước; luôn thấy nước thắng ngay, nước buộc phải chặn, hai đe dọa cùng lúc và không thả ngay dưới ô thắng của đối thủ. Nước đầu ván luôn là cột giữa. 3 mức: Dễ (nhìn 1–2 nước, cộng nhiễu, khoảng một phần tư số lần quên chặn), Vừa (tính 6 nước), Khó (đào sâu dần trong khoảng 1,5 giây, thường tới 16–20 nước; tự đấu 12 ván với Vừa thì thắng 9, hòa 3). Hiện "Máy đang nghĩ…" rồi thả quân.
- Khung gỗ khoét 42 lỗ, quân nằm sau khung nên rơi "vào" lỗ, có nảy nhẹ khi chạm đáy (tốc độ Chậm / Vừa / Nhanh / Tắt). Rê chuột hoặc chọn cột bằng bàn phím thì hiện quân "ma" ở trên cột và vòng nét đứt ở ô quân sẽ rơi vào. Chấm đánh dấu nước vừa đi.
- Thắng thì tô sáng các quân thắng, kẻ đường nối, làm mờ các quân còn lại, rồi hiện bảng kết quả.
- Thẻ người chơi hiện lượt đi và số quân còn trong tay.
- Nhật ký nước đi ("Bạn: cột 4") và dòng kết quả cuối ván.
- Đi lại: khi đấu máy thì gỡ nước của bạn cùng nước đáp của máy (kể cả khi máy đang nghĩ). Ván mới chọn chế độ, mức máy, lượt đi đầu.
- Hướng dẫn "Cách chơi" 5 bước có hình minh họa vẽ bằng SVG, tự mở ở lần đầu vào game, sau đó mở bằng nút "?" (hoặc phím `H`).
- Thống kê theo mức máy: số ván, thắng, thua, hòa, thắng nhanh nhất; chuỗi thắng dài nhất; số ván hai người. Có nút đặt lại (bấm hai lần để xác nhận). Ván bỏ dở không tính vào thống kê.
- Tự lưu ván đang chơi, mở lại trang thì tiếp tục (kể cả khi đang tới lượt máy).
- Cài đặt giao diện Tự động / Sáng / Tối, áp trước khi vẽ trang để không nháy màu.
- Tối ưu mobile: dùng `100dvh`, không cuộn trang khi chơi ở 360 x 640, mỗi cột rộng khoảng 47 px ở bề rộng 360 px và chạm vào bất kỳ đâu trong cột (kể cả hàng thả quân phía trên) đều thả được, modal dạng bottom sheet, layout ngang (bàn bên trái, cột lượt / nút / nhật ký bên phải) khi màn hình rộng, tôn trọng safe-area.
- Điều khiển bằng bàn phím với tiêu điểm hiển thị rõ; tắt chuyển động khi hệ thống bật giảm chuyển động (quân hiện ngay vào ô, đường thắng không nhấp nháy).

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` / `→` | Chọn cột (bàn chỉ có một điểm dừng Tab) |
| `Home` / `End` | Cột đầu / cột cuối |
| `Enter` / `Space` / `↓` | Thả quân vào cột đang chọn |
| `1` – `7` | Thả thẳng vào cột tương ứng |
| `Z` / `Ctrl+Z` | Đi lại |
| `N` | Ván mới |
| `H` / `?` | Cách chơi |
| `Esc` | Đóng hộp thoại |

## Cấu trúc

```
index.html  Khung trang, modal
i18n.js     Từ điển tiếng Anh / tiếng Việt và hàm I18N (nạp trước engine.js)
style.css   Giao diện, màu PlayNine, khung gỗ khoét lỗ, dark mode, responsive
engine.js   Luật chơi + AI negamax, không đụng DOM (chạy trong trình duyệt, Node và Web Worker)
app.js      Logic game, hiệu ứng, render (cần engine.js nạp trước)
test.js     Test engine và AI chạy bằng Node
icon.svg    Icon app, dùng làm favicon
```

Toàn bộ engine nằm trong hàm `BonLienTiepFactory`. `app.js` dựng Web Worker từ Blob chứa `BonLienTiep.factory.toString()`, nên máy vẫn nghĩ trong worker khi mở game bằng `file://`. Nếu trình duyệt không tạo được worker, máy tính trên luồng chính.

Ô được đánh số `idx = hàng * 7 + cột`, hàng 0 ở dưới cùng; nước đi là số cột 0–6. `BonLienTiep.play(state, cột)` trả về ô quân vừa rơi vào; khi có người thắng, `state.win` chứa các ô thắng và các đoạn thẳng để vẽ. Ván được lưu dưới dạng danh sách cột và dựng lại bằng `fromMoves`, nên Đi lại và khôi phục ván luôn khớp luật.

Phiên bản app nằm ở hằng `APP_VERSION` đầu `app.js` (hiển thị trong modal Cài đặt). Khi phát hành bản mới, tăng số này và sửa tham số `?v=` của `style.css`, `i18n.js`, `engine.js`, `app.js` trong `index.html`. Độ sâu, nhiễu, tỉ lệ bỏ sót và thời gian nghĩ của từng mức máy nằm trong `LEVELS` ở `engine.js`; trọng số đánh giá ở `W_OPEN`, `T_GOOD`, `T_BAD`. `chooseMove` nhận thêm `nodes` (trần số nút thay cho trần thời gian) để test cho kết quả lặp lại được.

## Ngôn ngữ / Language

Game có tiếng Anh (mặc định) và tiếng Việt. Toàn bộ chữ hiển thị nằm trong `i18n.js` (từ điển `en` / `vi` + đối tượng toàn cục `I18N`), nạp trước `engine.js` và `app.js`; `engine.js` không chứa chữ hiển thị.

- Ngôn ngữ lưu ở khóa dùng chung `playnine-lang` (`'en'` hoặc `'vi'`, thiếu hay sai thì là `'en'`, không tự đoán theo trình duyệt), chung cho cổng PlayNine và mọi game.
- Chữ tĩnh trong `index.html` viết sẵn bằng tiếng Anh, gắn `data-i18n` (textContent), `data-i18n-html` (chuỗi có `<b>` / `<kbd>`) hoặc `data-i18n-attr="aria-label:key;title:key"`; `I18N.apply()` chạy đầu phần khởi động của `app.js`. Chữ sinh từ JS đi qua `I18N.t(key, params)` (hỗ trợ `{tên}` và số ít / số nhiều tiếng Anh).
- Đổi ngôn ngữ ở modal Cài đặt: lưu ván rồi tải lại trang. Trang khác (cổng, iframe) đổi khóa `playnine-lang` thì game nhận sự kiện `storage` và tự tải lại theo. Tóm tắt cho cổng được ghi lại mỗi lần mở game nên chữ luôn theo ngôn ngữ đang chọn.

## Dữ liệu lưu trong trình duyệt

| Khóa `localStorage` | Nội dung |
| --- | --- |
| `playnine-lang` | Ngôn ngữ dùng chung cả PlayNine (`en` / `vi`) |
| `playnine-bonlientiep-settings-v1` | Giao diện, tốc độ quân rơi, chế độ, mức máy, lượt đi đầu, đã xem hướng dẫn chưa |
| `playnine-bonlientiep-save-v1` | Ván đang chơi (chế độ, mức, lượt đi đầu + danh sách cột đã thả) |
| `playnine-bonlientiep-stats-v1` | Thống kê theo mức (kể cả thắng nhanh nhất), chuỗi thắng, ván hai người |
| `playnine-bonlientiep-summary-v1` | Tóm tắt cho thẻ game trên cổng PlayNine (`v`, `played`, `won`, `note`, `stats`, `resume` có `pct` là phần bàn đã kín) |

## Kiểm tra engine

```bash
node test.js
```

Kiểm tra quân rơi và chồng lên nhau, cột đầy bị từ chối, thắng hàng ngang / hàng dọc / hai hướng chéo, năm quân gộp thành một đường, hòa khi kín bàn, dựng lại ván từ danh sách nước (cả khi máy đi trước), 500 ván ngẫu nhiên giữ khớp khóa và điểm cập nhật dần với điểm tính lại từ đầu, mọi mức đều thắng ngay khi có thể, Vừa và Khó luôn chặn đe dọa ngang / dọc / chéo và không kê bệ cho đối thủ, Dễ thỉnh thoảng quên chặn, Khó trả nước trong khoảng 1,5 giây, Khó thắng Dễ, Khó đi trước thắng Vừa.

## Chạy cục bộ

Mở trực tiếp `index.html` bằng trình duyệt, hoặc chạy một static server bất kỳ:

```bash
npx serve .
```

Mọi đường dẫn trong dự án đều là đường dẫn tương đối nên chạy được ở bất kỳ sub-path nào.
