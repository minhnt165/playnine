# Cờ Vua

Game Cờ Vua (cờ quốc tế) chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài. Mở `index.html` là chơi được.

## Luật chơi

Game dùng luật FIDE đầy đủ:

- Bàn 8 x 8, mỗi bên 16 quân: 1 Vua, 1 Hậu, 2 Xe, 2 Tượng, 2 Mã, 8 Tốt. Trắng luôn đi trước.
- Xe đi ngang, dọc; Tượng đi chéo; Hậu đi cả hai kiểu, không nhảy qua quân khác. Mã đi hình chữ L và nhảy qua được quân khác. Vua đi 1 ô mọi hướng.
- Tốt đi thẳng 1 ô (nước đầu được đi 2 ô), ăn chéo 1 ô về phía trước.
- Nhập thành: Vua đi 2 ô về phía Xe, Xe nhảy qua đứng cạnh Vua. Chỉ được khi Vua và Xe đó chưa đi lần nào, giữa hai quân trống, Vua không đang bị chiếu, không đi qua và không dừng ở ô bị đối phương khống chế.
- Bắt tốt qua đường: Tốt đối phương vừa đi 2 ô và dừng cạnh Tốt của mình thì ngay nước sau được ăn nó như thể nó chỉ đi 1 ô.
- Phong cấp: Tốt tới hàng cuối được đổi thành Hậu, Xe, Tượng hoặc Mã (hộp thoại hỏi chọn quân).
- Không được đi nước để Vua mình bị chiếu. Vua bị chiếu mà không còn nước gỡ là chiếu hết, bên đó thua.
- Hòa khi: bên đến lượt không còn nước đi mà không bị chiếu (pat); một thế cờ lặp lại 3 lần; 50 nước liền (100 nửa nước) không ăn quân và không đi Tốt; hai bên không đủ quân để chiếu hết.

### Các điểm luật game tự chọn

- Lặp lại 3 lần và luật 50 nước được xử hòa tự động, không cần người chơi đòi hòa (FIDE cho phép đòi hòa; game tự áp dụng cho gọn, giống phần lớn ứng dụng cờ).
- Chiếu hết đúng ở nửa nước thứ 100 vẫn tính là chiếu hết, không phải hòa.
- Hai thế cờ chỉ được coi là trùng (để tính lặp lại) khi cùng vị trí quân, cùng bên đi, cùng quyền nhập thành và cùng khả năng bắt tốt qua đường thật sự hợp lệ (Tốt vừa đi 2 ô mà không có nước bắt qua đường hợp lệ thì không làm thế cờ khác đi).
- Không đủ quân chiếu hết gồm: Vua đấu Vua, Vua + 1 Tượng hoặc 1 Mã đấu Vua, và chỉ còn Tượng mà mọi Tượng cùng màu ô. Các thế "không thể chiếu hết" phức tạp hơn (ví dụ tốt khóa chặt) không tự xử hòa.
- Không có đồng hồ, không có nút xin thua / xin hòa. Bỏ ván bằng Ván mới thì ván đó không tính vào thống kê.

## Tính năng

- Hai chế độ: Người vs Máy (chọn cầm Trắng, Đen hoặc ngẫu nhiên) và Hai người trên cùng máy.
- AI alpha-beta dạng PVS chạy trong Web Worker nên không treo giao diện: bảng chuyển vị, sắp nước MVV-LVA (ăn quân to bằng quân nhỏ trước) + nước sát thủ (killer) + điểm lịch sử, tìm kiếm tĩnh (quiescence) cho chuỗi đổi quân, null move, gia hạn khi bị chiếu, bảng điểm vị trí trộn trung cuộc / tàn cuộc, thưởng cặp Tượng, dồn Vua ra mép ở tàn cuộc. 3 mức: Dễ (tính 1–2 nước, cộng nhiễu nên hay đi lệch), Vừa (đào sâu dần tới 3–4 nước), Khó (đào sâu dần trong khoảng 1,5 giây, thường tới 7–10 nước). Vừa và Khó có sách khai cuộc nhỏ để không đi một kiểu.
- Máy bắt đầu nghĩ ngay trong lúc quân của bạn đang trượt, hiện "Máy đang nghĩ…", rồi tô viền đỏ ô đi và ô đến kèm dòng "Máy đi Nf6 · Mã g8 → f6" trước khi đi.
- Quân cờ vẽ bằng SVG (symbol trong `index.html`), hiển thị giống nhau trên mọi hệ điều hành. Bàn có tọa độ a–h / 1–8, tự xoay khi bạn cầm Đen; nút Xoay bàn (phím `F`) đảo lại bất cứ lúc nào. Khi chơi hai người có thể bật "Xoay bàn theo lượt" trong Cài đặt.
- Chạm quân để thấy các ô đi được (chấm tròn; vòng tròn là ăn được) rồi chạm ô đích, hoặc kéo thả quân. Nước vừa đi được tô sáng, Vua bị chiếu có quầng đỏ.
- Thẻ người chơi hiện quân đã ăn được (xếp theo loại) và chênh lệch quân theo thang 1-3-3-5-9 (ví dụ "+3"), báo "Đang bị chiếu!".
- Biên bản ghi theo ký hiệu quốc tế SAN (`e4`, `Nf3`, `exd5`, `O-O`, `e8=Q+`, `Qh4#`), kết quả `1–0` / `0–1` / `½–½`; di chuột vào nước đi để xem diễn giải bằng lời theo ngôn ngữ đang chọn ("Trắng: Mã g1 → f3, chiếu" / "White: Knight g1 → f3, check"). Trên điện thoại biên bản nối thành dòng, trên màn rộng thành bảng ba cột.
- Đi lại: khi đấu máy thì gỡ nước của bạn cùng nước đáp của máy (kể cả khi máy đang nghĩ). Ván mới chọn chế độ, mức máy, màu quân.
- Hướng dẫn "Cách chơi" 7 bước có hình bàn cờ minh họa vẽ bằng SVG, tự mở ở lần đầu vào game, sau đó mở bằng nút "?" (hoặc phím `H`).
- Thống kê theo mức máy: số ván, thắng, thua, hòa; chuỗi thắng hiện tại và dài nhất; số ván hai người (Trắng thắng / Đen thắng / hòa). Có nút đặt lại (bấm hai lần để xác nhận). Ván bỏ dở không tính.
- Tự lưu ván đang chơi, mở lại trang thì tiếp tục (kể cả khi đang tới lượt máy).
- Cài đặt giao diện Tự động / Sáng / Tối (áp trước khi vẽ trang để không nháy màu), tốc độ di quân Chậm / Vừa / Nhanh / Tắt, bật / tắt gợi ý nước đi.
- Tối ưu mobile: dùng `100dvh`, không cuộn trang khi chơi ở 360 x 640 (bàn khoảng 340 px), modal dạng bottom sheet, layout ngang (bàn bên trái, cột lượt / biên bản / nút bên phải) khi màn hình rộng, điện thoại xoay ngang thì bàn cao hết cỡ và hai thẻ người chơi sang cột phải, tôn trọng safe-area.
- Điều khiển bằng bàn phím với tiêu điểm hiển thị rõ; tắt chuyển động khi hệ thống bật giảm chuyển động (quân nhảy thẳng tới ô mới, không có pháo giấy).

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `→` `↓` | Di chuyển tiêu điểm giữa các ô (theo hướng bàn đang hiển thị) |
| `Enter` / `Space` | Cầm quân ở ô đang chọn, hoặc đi quân đang cầm tới ô đó |
| `Esc` | Bỏ chọn quân, đóng hộp thoại |
| `Z` / `Ctrl+Z` | Đi lại |
| `F` | Xoay bàn |
| `N` | Ván mới |
| `H` / `?` | Cách chơi |

## Ngôn ngữ / Language

Game có hai ngôn ngữ: tiếng Anh (mặc định) và tiếng Việt, đổi ở dòng "Language / Ngôn ngữ" trong Cài đặt. Toàn bộ chữ hiển thị (nút, modal, dòng trạng thái, thông báo, hướng dẫn, nhãn cho trình đọc màn hình, tóm tắt cho cổng PlayNine) nằm trong từ điển `{ en, vi }` của `i18n.js`; app.js không còn chữ giao diện viết cứng.

- Ngôn ngữ lưu ở khóa `localStorage` dùng chung `playnine-lang` (`en` / `vi`), cổng PlayNine và mọi game cùng đọc. Thiếu hoặc sai thì dùng tiếng Anh, không tự đoán theo trình duyệt.
- `I18N.t(key, params)` tra chuỗi (thiếu thì lấy bản `en`), thay `{tên}` bằng tham số, hỗ trợ số ít / số nhiều tiếng Anh (`{ one, other }`). `I18N.apply()` điền các phần tử có `data-i18n`, `data-i18n-html`, `data-i18n-attr` và đổi `<title>`, mô tả trang. HTML gốc viết sẵn tiếng Anh nên không bị nháy chữ khi tải.
- Đổi ngôn ngữ (trong game, hoặc từ trang khác qua sự kiện `storage`): game lưu ván và cài đặt rồi tải lại trang, ván đang chơi giữ nguyên. Tóm tắt cho cổng được ghi lại khi mở game nên đi theo ngôn ngữ mới.
- Ký hiệu SAN trong biên bản (`Nf3`, `O-O`, `e8=Q+`) giữ nguyên chữ cái quốc tế ở cả hai ngôn ngữ; tên quân, hộp phong cấp, diễn giải nước đi và lý do kết thúc ván (chiếu hết, pat, lặp lại 3 lần, luật 50 nước, không đủ quân) được dịch.

## Cấu trúc

```
index.html  Khung trang, hình các quân cờ (SVG symbol), modal
style.css   Giao diện, màu PlayNine, bàn cờ, dark mode, responsive
i18n.js     Từ điển tiếng Anh / tiếng Việt và hàm dịch I18N (nạp trước engine.js)
engine.js   Luật chơi + AI alpha-beta, không đụng DOM (chạy trong trình duyệt, Node và Web Worker)
app.js      Logic game, kéo thả, hiệu ứng, render (cần i18n.js và engine.js nạp trước)
test.js     Test engine và AI chạy bằng Node
icon.svg    Icon app, dùng làm favicon
```

Toàn bộ engine nằm trong hàm `CoVuaFactory`. `app.js` dựng Web Worker từ Blob chứa `CoVua.factory.toString()`, nên máy vẫn nghĩ trong worker khi mở game bằng `file://`. Nếu trình duyệt không tạo được worker, máy tính trên luồng chính.

Engine dùng bàn 0x88 (ô = hàng * 16 + cột). `CoVua.play(state, move)` đi một nước hợp lệ và trả về bản ghi (`uci`, `san`, quân đi, quân bị ăn, chiếu, chiếu hết); trạng thái ván (`over`, `winner`, `reason`) được cập nhật ngay. Ván được lưu dưới dạng danh sách nước UCI (`e2e4`, `e7e8q`) và dựng lại bằng `fromMoves`, nên Đi lại và khôi phục ván luôn khớp luật.

Phiên bản app nằm ở hằng `APP_VERSION` đầu `app.js` (hiển thị trong modal Cài đặt). Khi phát hành bản mới, tăng số này và sửa tham số `?v=` của `style.css`, `i18n.js`, `engine.js`, `app.js` trong `index.html`. Độ sâu, nhiễu, thời gian nghĩ và sách khai cuộc của từng mức máy nằm trong `LEVELS` và `BOOK_LINES` ở `engine.js`.

## Dữ liệu lưu trong trình duyệt

| Khóa `localStorage` | Nội dung |
| --- | --- |
| `playnine-covua-settings-v1` | Giao diện, tốc độ di quân, gợi ý nước đi, xoay bàn theo lượt, chế độ, mức máy, màu quân, đã xem hướng dẫn chưa |
| `playnine-covua-save-v1` | Ván đang chơi (chế độ, mức, màu bạn cầm, bàn có đang xoay không, danh sách nước UCI) |
| `playnine-covua-stats-v1` | Thống kê theo mức, chuỗi thắng, ván hai người |
| `playnine-covua-summary-v1` | Tóm tắt cho thẻ game trên cổng PlayNine (`v`, `updatedAt`, `played`, `won`, `note`, `stats`, `resume`; không có ván hằng ngày) |

## Kiểm tra engine

```bash
node test.js
```

Kiểm tra bộ sinh nước bằng perft (thế đầu tới độ sâu 3 = 8902, Kiwipete tới độ sâu 3, ba thế chuẩn khác có bắt tốt qua đường, ghim, phong cấp), đọc / ghi FEN, nhập thành (đủ điều kiện, đang bị chiếu, đi qua hoặc vào ô bị khống chế, quân chắn, mất quyền khi Vua / Xe đi hoặc Xe bị ăn), bắt tốt qua đường (chỉ ngay nước sau, không được khi lộ Vua), phong cấp 4 loại quân, chiếu hết, pat, lặp lại 3 lần, luật 50 nước (kể cả chiếu hết ở nửa nước thứ 100), không đủ quân, ký hiệu SAN (phân biệt theo cột / hàng / cả hai, quân bị ghim), dựng lại 20 ván ngẫu nhiên bằng `fromMoves`, đi / gỡ nước trả đúng thế và khóa, AI mọi mức trả nước hợp lệ mà không đổi thế cờ, Khó trả lời trong khoảng 2 giây, Khó thấy chiếu hết một nước, ăn Hậu bị bỏ không, chiếu hết được Vua + Hậu đấu Vua, sách khai cuộc.

## Chạy cục bộ

Mở trực tiếp `index.html` bằng trình duyệt, hoặc chạy một static server bất kỳ:

```bash
npx serve .
```

Mọi đường dẫn trong dự án đều là đường dẫn tương đối nên chạy được ở bất kỳ sub-path nào.
