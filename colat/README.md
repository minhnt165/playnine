# Cờ Lật

Game Cờ Lật (cờ lật quân 8 x 8, họ Reversi) chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài. Mở `index.html` là chơi được.

## Luật chơi

Game dùng luật chuẩn của cờ lật quân 8 x 8:

- Bàn 8 x 8, cột a–h từ trái sang phải, hàng 1–8 từ trên xuống. Đầu ván có 4 quân ở giữa: d4, e5 Trắng; e4, d5 Đen.
- Đen đi trước, hai bên lần lượt đặt một quân màu mình vào ô trống.
- Nước đi hợp lệ phải kẹp được ít nhất một hàng quân đối thủ nằm liền nhau giữa quân vừa đặt và một quân có sẵn của mình, theo một trong 8 hướng (ngang, dọc, chéo). Mọi hàng bị kẹp (ở mọi hướng) đều lật sang màu người vừa đi.
- Đến lượt mà không có nước hợp lệ thì mất lượt, đối thủ đi tiếp. Game báo "Bên X không có nước, mất lượt" trên bàn và trong nhật ký.
- Hết ván khi cả hai bên đều không đi được (bàn đầy, hoặc bị chặn hết khi bàn chưa đầy). Bên nhiều quân hơn thắng, bằng nhau là hòa.

### Các điểm luật game tự chọn

- Tính điểm bằng đúng số quân trên bàn lúc hết ván; ô trống (nếu ván dừng sớm) không cộng cho ai.
- Mất lượt xảy ra tự động, không cần bấm "bỏ lượt". Ván được lưu chỉ gồm các ô đã đặt.
- Ký hiệu ô theo thói quen phổ biến của cờ lật quân: hàng 1 ở trên cùng, nên nước mở đầu của Đen là d3, c4, f5 hoặc e6.

## Tính năng

- Hai chế độ: Người vs Máy (chọn cầm Đen đi trước hoặc Trắng đi sau) và Hai người trên cùng máy (Người 1 cầm Đen).
- AI negamax cắt tỉa alpha-beta, chạy trong Web Worker nên không treo giao diện. Hàm đánh giá gồm bảng trọng số vị trí (góc rất quý, ô chéo / ô cạnh sát góc bị trừ khi góc còn trống), độ cơ động (số nước đi được của hai bên), quân ổn định nối từ góc dọc theo cạnh, và số quân ở cuối ván. 3 mức: Dễ (tính 1–2 nước, cộng nhiễu ngẫu nhiên nên hay chọn lệch), Vừa (tính 4 nước), Khó (đào sâu dần trong khoảng 1,5 giây; còn từ 14 ô trống trở xuống thì tìm tới hết ván, chọn nước tối ưu tuyệt đối theo hiệu số quân). Máy bắt đầu nghĩ ngay trong lúc hiệu ứng của bạn đang chạy, hiện "Máy đang nghĩ…", rồi đánh dấu ô nó chọn trước khi đặt quân.
- Bàn gỗ ấm có viền khung, vạch kẻ nâu, 4 chấm sao và nhãn cột / hàng. Không dùng nền xanh lá kiểu sòng bài vì lệch hẳn với bảng màu nâu / vàng / đỏ của PlayNine; mặt ô gỗ tông trung bình giữ được độ tương phản rõ cho cả quân Đen lẫn quân Trắng, ở giao diện tối thì quân Đen có thêm viền sáng mảnh.
- Quân hai mặt lật 3D bằng CSS: quân mới bật lên, các quân bị kẹp lật lan dần từ ô vừa đặt ra xa. Tốc độ Chậm / Vừa / Nhanh / Tắt; đang lật thì chạm bất kỳ đâu trên sân (hoặc `Space`) để bỏ qua.
- Chấm gợi ý ở các ô đặt được (bật / tắt trong Cài đặt), rê chuột lên ô thì hiện bóng quân; chấm đỏ đánh dấu nước vừa đi; số quân của hai bên cập nhật trực tiếp trên thẻ người chơi.
- Nhật ký nước đi ("Bạn: d3, lật 1", nước chiếm góc in đậm), kể cả lần mất lượt và tổng kết cuối ván.
- Đi lại: khi đấu máy thì gỡ nước gần nhất của bạn cùng mọi nước máy đi sau đó (kể cả khi máy đi liền nhiều nước vì bạn mất lượt, hoặc khi máy đang nghĩ). Ván mới chọn chế độ, mức máy, màu quân.
- Hướng dẫn "Cách chơi" 5 bước có hình minh họa vẽ bằng SVG, tự mở ở lần đầu vào game, sau đó mở bằng nút "?" (hoặc phím `H`).
- Thống kê theo mức máy: số ván, thắng, thua, hòa; chuỗi thắng dài nhất; thắng đậm nhất (hiệu số quân); số ván hai người. Có nút đặt lại (bấm hai lần để xác nhận). Ván bỏ dở không tính vào thống kê.
- Tự lưu ván đang chơi, mở lại trang thì tiếp tục (kể cả khi đang tới lượt máy).
- Cài đặt giao diện Tự động / Sáng / Tối, áp trước khi vẽ trang để không nháy màu.
- Tối ưu mobile: dùng `100dvh`, không cuộn trang khi chơi ở 360 x 640 (ô cờ khoảng 39 px), hai thẻ người chơi nằm cạnh nhau trên bàn, modal dạng bottom sheet, layout ngang (bàn bên trái, cột người chơi / lượt / nhật ký / nút bên phải) khi màn hình rộng, tôn trọng safe-area.
- Điều khiển bằng bàn phím với tiêu điểm hiển thị rõ; tắt chuyển động khi hệ thống bật giảm chuyển động (quân đổi màu ngay, thông báo mất lượt vẫn hiện).

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `→` `↓` | Di chuyển giữa 64 ô (bàn chỉ có một điểm dừng Tab) |
| `Home` / `End` | Về đầu / cuối hàng |
| `Enter` / `Space` | Đặt quân ở ô đang chọn |
| `Space` / `Esc` khi đang lật | Bỏ qua hiệu ứng |
| `Z` / `Ctrl+Z` | Đi lại |
| `N` | Ván mới |
| `H` / `?` | Cách chơi |
| `Esc` | Đóng hộp thoại |

## Ngôn ngữ / Language

Game có hai ngôn ngữ: tiếng Anh (mặc định) và tiếng Việt, đổi ở dòng "Language / Ngôn ngữ" trong Cài đặt. Toàn bộ chữ hiển thị (nút, modal, dòng trạng thái, thông báo, hướng dẫn, nhãn cho trình đọc màn hình, tóm tắt cho cổng PlayNine) nằm trong từ điển `{ en, vi }` của `i18n.js`; app.js không còn chữ giao diện viết cứng.

- Ngôn ngữ lưu ở khóa `localStorage` dùng chung `playnine-lang` (`en` / `vi`), cổng PlayNine và mọi game cùng đọc. Thiếu hoặc sai thì dùng tiếng Anh, không tự đoán theo trình duyệt.
- `I18N.t(key, params)` tra chuỗi (thiếu thì lấy bản `en`), thay `{tên}` bằng tham số, hỗ trợ số ít / số nhiều tiếng Anh (`{ one, other }`). `I18N.apply()` điền các phần tử có `data-i18n`, `data-i18n-html`, `data-i18n-attr` và đổi `<title>`, mô tả trang. HTML gốc viết sẵn tiếng Anh nên không bị nháy chữ khi tải.
- Đổi ngôn ngữ (trong game, hoặc từ trang khác qua sự kiện `storage`): game lưu ván và cài đặt rồi tải lại trang, ván đang chơi giữ nguyên. Tóm tắt cho cổng được ghi lại khi mở game nên đi theo ngôn ngữ mới.
- Tên bên (Đen / Trắng), nhật ký nước đi, thông báo mất lượt, điểm số và kết quả ván đều được dịch. Nhật ký được dựng lại từ danh sách nước khi mở game, nên đổi ngôn ngữ giữa ván thì cả các dòng cũ cũng hiện theo ngôn ngữ mới.

## Cấu trúc

```
index.html  Khung trang, modal
style.css   Giao diện, màu PlayNine, bàn gỗ, quân lật 3D, dark mode, responsive
i18n.js     Từ điển tiếng Anh / tiếng Việt và hàm dịch I18N (nạp trước engine.js)
engine.js   Luật chơi + AI alpha-beta, không đụng DOM (chạy trong trình duyệt, Node và Web Worker)
app.js      Logic game, hiệu ứng, render (cần i18n.js và engine.js nạp trước)
test.js     Test engine và AI chạy bằng Node
icon.svg    Icon app, dùng làm favicon
```

Toàn bộ engine nằm trong hàm `CoLatFactory`. `app.js` dựng Web Worker từ Blob chứa `CoLat.factory.toString()`, nên máy vẫn nghĩ trong worker khi mở game bằng `file://`. Nếu trình duyệt không tạo được worker, máy tính trên luồng chính.

`CoLat.play(state, move, events)` trả về diễn biến từng bước (`place`, `flip` với các ô bị lật sắp theo khoảng cách, `pass`, `over`) để giao diện vẽ lại hiệu ứng. Ván được lưu dưới dạng danh sách ô đã đặt và dựng lại bằng `fromMoves`, nên Đi lại và khôi phục ván luôn khớp luật. Khi tìm kiếm, AI đặt và gỡ quân tại chỗ trên một bản sao của bàn (không sao chép trạng thái ở mỗi nút).

Phiên bản app nằm ở hằng `APP_VERSION` đầu `app.js` (hiển thị trong modal Cài đặt). Khi phát hành bản mới, tăng số này và sửa tham số `?v=` của `style.css`, `i18n.js`, `engine.js`, `app.js` trong `index.html`. Độ sâu, nhiễu, thời gian nghĩ và ngưỡng giải đúng cuối ván của từng mức máy nằm trong `LEVELS` ở `engine.js`; trọng số đánh giá là bảng `W` và các hằng `MOB_WEIGHT`, `STABLE_WEIGHT`.

## Dữ liệu lưu trong trình duyệt

| Khóa `localStorage` | Nội dung |
| --- | --- |
| `playnine-colat-settings-v1` | Giao diện, tốc độ lật, gợi ý nước đi, chế độ, mức máy, màu quân của bạn, đã xem hướng dẫn chưa |
| `playnine-colat-save-v1` | Ván đang chơi (chế độ, mức, màu quân + danh sách ô đã đặt) |
| `playnine-colat-stats-v1` | Thống kê theo mức, chuỗi thắng, thắng đậm nhất, ván hai người |
| `playnine-colat-summary-v1` | Tóm tắt cho thẻ game trên cổng PlayNine (`v`, `updatedAt`, `played`, `won`, `note`, `stats`, `resume` có `pct` là phần bàn đã kín) |

## Kiểm tra engine

```bash
node test.js
```

Kiểm tra thế đầu ván và 4 nước mở đầu, ký hiệu ô, lật đủ 8 hướng trong một nước, từng hướng riêng lẻ, lật nhiều hàng dài khác nhau cùng lúc (thứ tự lật gần trước xa sau), không lật hàng không bị kẹp, không vòng qua mép bàn, từ chối nước sai (ô có quân, ô không lật được gì, số ngoài bàn), mất lượt, hết ván khi bàn chưa đầy, thắng / thua / hòa 32 – 32, dựng lại ván từ danh sách nước (kể cả có mất lượt), 500 ván ngẫu nhiên (số quân luôn bằng 4 + số nước, `legalMoves` khớp `isLegal`, ván luôn kết thúc), AI trả nước hợp lệ ở mọi mức, biết chiếm góc, không sửa trạng thái gốc, mức Khó trả nước trong khoảng 1,5 giây, giải đúng cuối ván khớp tìm kiếm vét cạn, Khó thắng Dễ và Vừa thắng Dễ phần lớn các ván.

## Chạy cục bộ

Mở trực tiếp `index.html` bằng trình duyệt, hoặc chạy một static server bất kỳ:

```bash
npx serve .
```

Mọi đường dẫn trong dự án đều là đường dẫn tương đối nên chạy được ở bất kỳ sub-path nào.
