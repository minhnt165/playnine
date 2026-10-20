# Cờ Đam

Game Cờ Đam (checkers / draughts 8x8) chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài. Mở `index.html` là chơi được.

## Luật chơi

Có hai bộ luật, chọn trong hộp thoại **Ván mới** và được lưu cùng ván:

- Bàn 8x8, chỉ dùng 32 ô tối (ô a1 là ô tối). Mỗi bên 12 quân xếp trên ô tối của 3 hàng đầu. Bên **Đen** đứng ở hàng 1–3 và **đi trước** trong cả hai bộ luật, bên **Trắng** ở hàng 6–8.
- Ăn quân là **bắt buộc**: có nước ăn thì phải ăn. Ăn bằng cách nhảy qua quân đối thủ, đáp xuống ô trống phía sau. Ăn xong mà từ ô mới còn ăn được thì phải ăn tiếp trong cùng lượt (ăn liên tiếp).
- Quân thường tới hàng cuối bên kia thì lên **vua**.
- Thắng khi đối thủ **hết quân** hoặc **không còn nước đi** (mọi quân bị chặn).

### Quốc tế 8x8 (mặc định, kiểu Nga / Brazil)

- Quân thường đi chéo 1 ô về phía trước, **ăn được cả về phía trước lẫn phía sau**.
- Có nhiều cách ăn thì **được chọn cách bất kỳ**, không bắt phải ăn nhiều quân nhất.
- Quân bị ăn chỉ được nhấc khỏi bàn **sau khi hết chuỗi ăn**; trong lúc đó vẫn chắn đường và không được nhảy qua một quân hai lần.
- **Vua bay**: đi bao nhiêu ô chéo cũng được; ăn quân ở xa trên đường chéo (giữa vua và quân bị ăn chỉ có ô trống) và đáp ô trống bất kỳ phía sau quân đó.
- Quân thường tới hàng cuối **giữa chuỗi ăn** thì lên vua ngay và ăn tiếp như vua.

### Kiểu Mỹ/Anh (English draughts)

- Quân thường chỉ đi và ăn **về phía trước**.
- Vua đi và ăn **1 ô** theo cả 4 hướng chéo.
- Lên vua là **hết lượt**, kể cả khi đang ở giữa chuỗi ăn.

### Các điểm luật game tự chọn

- Đen đi trước ở cả hai bộ luật (luật Nga gốc cho Trắng đi trước; game thống nhất một cách để dễ nhớ).
- Vua bay ăn mà có ô đáp từ đó còn ăn tiếp được thì bắt buộc đáp vào ô đó (luật Nga); nếu không ô nào ăn tiếp được thì đáp ô trống bất kỳ.
- Hòa khi **cùng một thế cờ** (cùng vị trí quân, cùng bên đi) **lặp lại 3 lần**.
- Hòa khi **30 nước liền mỗi bên (60 lượt) chỉ đi vua, không ai ăn quân**. Đi quân thường hoặc ăn quân thì đếm lại từ đầu.
- Không có hòa theo thỏa thuận và không có luật cấm "chiếu đi chiếu lại".

## Tính năng

- Hai chế độ: Người vs Máy (chọn cầm quân Đen đi trước hoặc Trắng đi sau; cầm Trắng thì bàn lật để quân của bạn luôn ở phía dưới) và Hai người trên cùng máy (Người 1 cầm Đen ở dưới).
- AI negamax cắt tỉa alpha-beta, có bảng chuyển vị, tìm tiếp các nước ăn ở lá (vì ăn là bắt buộc), nhận ra thế lặp và luật 60 lượt. Đánh giá: vật chất (vua đáng giá hơn quân thường, vua bay đáng giá hơn vua kiểu Mỹ/Anh), tiến quân, giữ trung tâm, giữ hàng cuối, đổi quân khi đang hơn. Chạy trong Web Worker nên không treo giao diện. 3 mức: Dễ (tính 2 nước, cộng nhiễu nên hay chọn lệch), Vừa (khoảng 6 nước), Khó (đào sâu dần trong khoảng 1,5 giây, thường tới độ sâu 10–12). Máy bắt đầu nghĩ ngay trong lúc hiệu ứng nước của bạn đang chạy, hiện "Máy đang nghĩ…", rồi tô quân và đường đi nó chọn trước khi đi.
- Chạm một quân để thấy các ô đến (chấm vàng) và đường đi; ô dừng cuối của chuỗi ăn có vòng tròn, quân sẽ bị ăn có viền đỏ nét đứt. Chạm ô dừng cuối để đi cả chuỗi; khi có nhiều đường ăn thì chạm lần lượt từng ô đáp. Quân bắt buộc phải ăn có viền đỏ nhấp nháy; chỉ một quân ăn được thì quân đó được chọn sẵn. Kéo thả quân cũng được.
- Hiệu ứng quân trượt theo từng bước nhảy, quân bị ăn mờ dần sau khi hết chuỗi, vương miện bật ra khi lên vua; nước vừa đi được tô màu (chuỗi ăn có thêm đường nối). Tốc độ Chậm / Vừa / Nhanh / Tắt; đang đi thì chạm bàn (hoặc `Space`) để bỏ qua.
- Thẻ người chơi hiện số quân thường, số vua và tổng số quân còn lại.
- Nhật ký nước đi theo ký hiệu a1–h8 ("Bạn: c3×e5×g7 · lên vua"), kể cả dòng tổng kết cuối ván. Tọa độ a–h, 1–8 hiện ở mép bàn (tắt được trong Cài đặt).
- Đi lại: khi đấu máy thì gỡ nước của bạn cùng nước đáp của máy (kể cả khi máy đang nghĩ hoặc đang đi).
- Hướng dẫn "Cách chơi" 6 bước có hình minh họa vẽ bằng SVG, tự mở ở lần đầu vào game, sau đó mở bằng nút "?" (hoặc phím `H`).
- Thống kê theo bộ luật và mức máy: số ván, thắng, thua, hòa; chuỗi thắng máy dài nhất; số ván hai người. Có nút đặt lại (bấm hai lần để xác nhận). Ván bỏ dở không tính vào thống kê.
- Tự lưu ván đang chơi, mở lại trang thì tiếp tục (kể cả khi đang tới lượt máy).
- Cài đặt giao diện Tự động / Sáng / Tối, áp trước khi vẽ trang để không nháy màu.
- Tối ưu mobile: dùng `100dvh`, không cuộn trang khi chơi ở 360 x 640, modal dạng bottom sheet, layout ngang (bàn bên trái, cột lượt / nút / nhật ký bên phải) khi màn hình rộng, điện thoại xoay ngang thì bàn chiếm hết chiều cao, tôn trọng safe-area.
- Điều khiển bằng bàn phím với tiêu điểm hiển thị rõ; tắt chuyển động khi hệ thống bật giảm chuyển động (quân vẫn đi từng bước nhưng không trượt).

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `→` `↓` | Di chuyển giữa các ô (cả bàn chỉ có một điểm dừng Tab) |
| `Enter` / `Space` | Chọn quân, rồi chọn ô đến (bấm lại quân đang chọn để bỏ) |
| `Esc` | Bỏ chọn, đóng hộp thoại |
| `Space` khi quân đang đi | Bỏ qua hiệu ứng |
| `Z` / `Ctrl+Z` | Đi lại |
| `N` | Ván mới |
| `H` / `?` | Cách chơi |

## Cấu trúc

```
index.html  Khung trang, modal
style.css   Giao diện, màu PlayNine, bàn gỗ, quân cờ, dark mode, responsive
engine.js   Luật chơi + AI alpha-beta, không đụng DOM (chạy trong trình duyệt, Node và Web Worker)
app.js      Logic game, chọn / kéo thả quân, hiệu ứng, render (cần engine.js nạp trước)
test.js     Test engine và AI chạy bằng Node
icon.svg    Icon app, dùng làm favicon
```

Toàn bộ engine nằm trong hàm `CoDamFactory`. `app.js` dựng Web Worker từ Blob chứa `CoDam.factory.toString()`, nên máy vẫn nghĩ trong worker khi mở game bằng `file://`. Nếu trình duyệt không tạo được worker, máy tính trên luồng chính.

Nước đi là object `{ from, to, path, caps, capVals, piece, promoteAt }`, trong đó `path` là dãy ô đi qua (ô xuất phát rồi từng ô đáp) và xác định duy nhất một nước. Ván được lưu dưới dạng danh sách `path` và dựng lại bằng `fromMoves`, nên Đi lại và khôi phục ván luôn khớp luật. `CoDam.play(state, move, events)` trả về diễn biến từng bước (`step`, `remove`, `over`) để giao diện vẽ hiệu ứng.

Phiên bản app nằm ở hằng `APP_VERSION` đầu `app.js` (hiển thị trong modal Cài đặt). Khi phát hành bản mới, tăng số này và sửa tham số `?v=` của `style.css`, `engine.js`, `app.js` trong `index.html`. Độ sâu, nhiễu và thời gian nghĩ của từng mức máy nằm trong `LEVELS`, giá trị quân thường / vua của từng bộ luật nằm trong `RULES` ở `engine.js`.

## Dữ liệu lưu trong trình duyệt

| Khóa `localStorage` | Nội dung |
| --- | --- |
| `playnine-codam-settings-v1` | Giao diện, tốc độ hiệu ứng, hiện tọa độ, chế độ, luật, mức máy, bên bạn cầm, đã xem hướng dẫn chưa |
| `playnine-codam-save-v1` | Ván đang chơi (chế độ, luật, mức máy, bên bạn cầm + danh sách nước đi) |
| `playnine-codam-stats-v1` | Thống kê theo bộ luật và mức máy, ván hai người, chuỗi thắng |
| `playnine-codam-summary-v1` | Tóm tắt cho thẻ game trên cổng PlayNine (`v`, `played`, `won`, `note`, `stats`, `resume`) |

## Kiểm tra engine

```bash
node test.js
```

Kiểm tra cho từng bộ luật: thế đầu (12 quân mỗi bên, 7 nước đi đầu), bắt buộc ăn, ăn lùi (chỉ Quốc tế), ăn liên tiếp, không nhảy qua một quân hai lần, quân bị ăn vẫn chắn đường, vua bay đi xa và ăn với nhiều ô đáp, luật Nga bắt đáp vào ô ăn tiếp được, vua Mỹ/Anh đi 1 ô, lên vua giữa chuỗi ăn rồi ăn tiếp (Quốc tế) hoặc hết lượt (Mỹ/Anh), thắng khi đối thủ hết quân / hết nước, hòa do lặp thế 3 lần và do 60 lượt chỉ đi vua, dựng lại ván bằng `fromMoves`, 300 ván ngẫu nhiên mỗi luật giữ đúng số quân, AI mọi mức trả nước hợp lệ, AI chọn chuỗi ăn thắng ngay, Khó trả nước trong khoảng 2 giây, Khó thắng Dễ.

## Chạy cục bộ

Mở trực tiếp `index.html` bằng trình duyệt, hoặc chạy một static server bất kỳ:

```bash
npx serve .
```

Mọi đường dẫn trong dự án đều là đường dẫn tương đối nên chạy được ở bất kỳ sub-path nào.
