# Cờ Caro

Game Cờ Caro (Gomoku) 15x15 chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài. Mở `index.html` là chơi được.

## Tính năng

- Bàn cờ 15x15 nền gỗ, quân đặt vào ô (cách chơi caro phổ biến ở Việt Nam). Quân X màu đỏ, quân O màu mực.
- Năm quân liên tiếp theo hàng, cột hoặc đường chéo là thắng. Hai luật bật/tắt trong Cài đặt, áp dụng từ ván mới:
  - **Chặn hai đầu** (mặc định bật): dãy quân bị quân đối phương chặn cả hai đầu thì không tính thắng.
  - **Sáu quân trở lên vẫn thắng** (mặc định bật): tắt thì chỉ đúng 5 quân liên tiếp mới thắng.
- Hai chế độ: **Người vs Máy** (chọn cầm X đi trước hoặc O đi sau) và **Hai người** trên cùng một máy.
- Máy 3 mức Dễ / Vừa / Khó (xem mục "Cách máy chơi"), tính nước trong Web Worker nên giao diện không bị đứng, có chỉ báo "Máy đang nghĩ…".
- Đánh dấu nước vừa đi, tô sáng đường thắng, hiện số thứ tự nước đi (nút "Số nước", phím `M`, hoặc rê chuột lên quân cờ trên máy tính).
- Đi lại: khi đấu máy thì bỏ cả nước trả lời của máy lẫn nước gần nhất của bạn; nếu máy đang nghĩ thì hủy luôn. Ván hai người thì lùi một nước.
- Đổi bên: bắt đầu ván mới với quân còn lại (chỉ khi đấu máy).
- Tự lưu ván đang chơi vào `localStorage`, mở lại trang thì chơi tiếp (kể cả khi đang tới lượt máy).
- Thống kê theo mức: số ván, thắng, thua, hòa (hòa = kín bàn mà chưa ai thắng). Có nút đặt lại (nhấn hai lần để xác nhận). Ván đấu máy bỏ dở giữa chừng (bấm Ván mới / Đổi bên khi bạn đã đi ít nhất một nước) tính là thua; app có cảnh báo trước.
- Cài đặt giao diện Tự động / Sáng / Tối, áp dụng trước khi vẽ trang nên không nháy màu.
- Mobile trước: không cuộn ngang ở bề rộng 360px, bàn cờ tự co theo chiều cao màn hình (`100dvh`) nên không phải cuộn khi chơi, tôn trọng safe-area (tai thỏ), nút bấm ≥ 44px. Màn hình ngang / máy tính: bàn cờ bên trái chiếm trọn chiều cao, bảng điều khiển bên phải.
- Ở bề rộng 360px mỗi ô cờ khoảng 22px. Thêm nút **Phóng to**: bàn cờ phóng lên ô 38px trong khung cố định, kéo để cuộn, bấm lần nữa để thu nhỏ. Trình duyệt vẫn cho phép pinch-zoom (không khóa zoom trang); ô cờ dùng `touch-action: manipulation` để bỏ độ trễ chạm.
- Bàn phím: bàn cờ có một điểm dừng Tab duy nhất, di chuyển bằng phím mũi tên, viền focus rõ. Tôn trọng `prefers-reduced-motion`.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| Phím mũi tên, `Home` / `End`, `PageUp` / `PageDown` | Di chuyển ô đang chọn trên bàn cờ |
| `Enter` / `Space` | Đặt quân vào ô đang chọn |
| `Z` | Đi lại |
| `N` | Ván mới |
| `M` | Bật / tắt số thứ tự nước đi |
| `S` | Đổi bên |
| `Esc` | Đóng hộp thoại |

## Chi tiết luật

- Mép bàn **không** tính là quân chặn. Ví dụ `|XXXXXO` (sát mép trái, đầu kia là O) vẫn thắng.
- Luật chặn hai đầu áp dụng cho cả dãy dài hơn 5 khi bật "Sáu quân trở lên vẫn thắng": `OXXXXXXO` không thắng.
- Luật được lưu cùng ván, nên đổi luật giữa chừng không ảnh hưởng ván đang chơi.

## Cách máy chơi

Engine (`engine.js`) không đụng tới DOM:

1. **Bảng mẫu thế cờ**: mỗi ô xét 10 ô lân cận trên từng hướng (mỗi ô 2 bit: trống / quân mình / quân đối phương / ngoài bàn), tra ra hình dạng năm, bốn mở, bốn, ba mở, ba, hai mở, hai. Bảng tính theo đúng luật đang chơi (chặn hai đầu, sáu quân), tính lười và ghi nhớ, nên AI luôn hiểu luật giống trọng tài.
2. **Điểm ô ứng viên**: chỉ xét ô trống cách quân gần nhất tối đa 2 ô; ghép 4 hướng thành điểm (năm, bốn mở / bốn đôi, bốn-ba, ba-ba, rồi cộng dồn).
3. **Nước ép buộc**: luôn thắng ngay nếu được; luôn chặn ô thành năm của đối phương (bốn, bốn mở); khi đối phương có ba mở thì chỉ xét nước chặn hoặc nước tạo bốn phản công.
4. **Tìm kiếm**: negamax alpha-beta, đào sâu dần trong giới hạn thời gian, kéo dài thêm ở nước chặn bắt buộc.

| Mức | Cách chơi | Giới hạn thời gian |
| --- | --- | --- |
| Dễ | Nhìn 1 nước, cộng nhiễu ngẫu nhiên, ít để ý phòng thủ (vẫn chặn bốn / bốn mở) | 0,4 giây |
| Vừa | Alpha-beta sâu 2 nước, 10 ứng viên | 0,9 giây |
| Khó | Tìm chuỗi bốn liên tục (VCF) trước, rồi alpha-beta sâu 4 nước, 18 ứng viên | 1,5 giây |

Web Worker được dựng từ chính mã nguồn engine (`CaroEngine.factorySource`) qua Blob, nên chạy được cả khi mở `index.html` trực tiếp từ `file://`. Nếu trình duyệt không tạo được worker (hoặc worker không trả lời), máy tính nước trên luồng chính.

## Lưu trữ

Mọi khóa `localStorage` có tiền tố `playnine-caro-`, mọi truy cập đều bọc `try/catch`:

| Khóa | Nội dung |
| --- | --- |
| `playnine-caro-settings-v1` | Giao diện, hai luật, hiện số nước, chế độ / mức / quân chọn gần nhất |
| `playnine-caro-save-v1` | Ván đang chơi (chế độ, mức, quân, luật, danh sách nước). Xóa khi ván kết thúc |
| `playnine-caro-stats-v1` | Thống kê theo mức: `played`, `won`, `lost`, `drawn` |
| `playnine-caro-summary-v1` | Tóm tắt cho cổng PlayNine, ghi lại sau mỗi lần ván đổi (ván mới, mỗi nước, kết thúc) |
| `playnine-lang` | Ngôn ngữ giao diện dùng chung với cổng PlayNine (`en` / `vi`) |

Tóm tắt cho cổng có dạng:

```json
{
  "v": 1,
  "updatedAt": 1792465233759,
  "played": 12,
  "won": 5,
  "note": "Thắng máy 5/12 ván · mức Khó",
  "stats": [
    { "value": "5/12", "label": "Thắng máy" },
    { "value": "42%", "label": "Tỉ lệ thắng" },
    { "value": "Khó", "label": "Mức" }
  ],
  "resume": { "title": "Caro với máy · Khó", "detail": "Nước 23 · đến lượt bạn", "pct": null },
  "daily": null
}
```

`resume` chỉ khác `null` khi đang có ván dở (đã có ít nhất một nước và chưa kết thúc). `stats` rỗng khi chưa đấu máy ván nào. Các chữ trong tóm tắt (`note`, `label`, `title`, `detail`) được ghi bằng ngôn ngữ đang chọn (ví dụ trên là tiếng Việt).

## Ngôn ngữ / Language

Giao diện có tiếng Anh (mặc định) và tiếng Việt. Toàn bộ chuỗi hiển thị nằm trong từ điển `{ en, vi }` của `i18n.js`; `engine.js` không chứa chữ hiển thị. `i18n.js` tạo đối tượng toàn cục `I18N`:

- `I18N.t(key, params)` tra chuỗi theo ngôn ngữ hiện tại (thiếu thì lấy tiếng Anh), thay `{tên}` bằng `params`, hỗ trợ số ít / số nhiều tiếng Anh dạng `{ one, other }` theo `params.n`.
- `I18N.apply()` điền chữ cho phần tử có `data-i18n`, `data-i18n-html`, `data-i18n-attr` trong `index.html`, cùng tiêu đề và mô tả trang. Chữ gốc trong `index.html` là tiếng Anh.
- `I18N.set(lang)` lưu ngôn ngữ rồi tải lại trang (ván đã được lưu trước đó). Đổi trong Cài đặt, dòng "Language / Ngôn ngữ".

Ngôn ngữ lưu ở khóa dùng chung `playnine-lang` (`'en'` hoặc `'vi'`, thiếu thì là `'en'`), chung với cổng PlayNine và các game khác. Khi trang khác (cổng hoặc iframe) đổi khóa này, game tự lưu ván và tải lại theo ngôn ngữ mới. Tóm tắt cho cổng được ghi lại bằng ngôn ngữ hiện tại mỗi lần mở game.

## Cấu trúc

```
index.html   Khung trang, modal (ván mới, cài đặt, thống kê, xác nhận, kết quả)
style.css    Giao diện, dark mode, bố cục dọc / ngang, bàn cờ gỗ
i18n.js      Chuỗi giao diện tiếng Anh / tiếng Việt và hàm I18N (nạp trước engine.js)
engine.js    Engine: luật thắng, bảng mẫu thế cờ, AI (alpha-beta + VCF), phục vụ Web Worker
app.js       Logic game + render (cần engine.js nạp trước)
test.js      Test engine và AI chạy bằng Node
icon.svg     Icon app (cũng là favicon)
```

Phiên bản app nằm ở hằng `APP_VERSION` đầu `app.js` (hiển thị trong modal Cài đặt). Khi phát hành bản mới, tăng số này và sửa tham số `?v=` của `style.css`, `i18n.js`, `engine.js`, `app.js` trong `index.html` để trình duyệt tải file mới thay vì dùng bản cache. Thông số từng mức máy nằm trong hằng `LEVELS` ở `engine.js`.

## Kiểm tra engine

```bash
node test.js
```

Script kiểm tra: thắng theo cả 4 hướng; luật chặn hai đầu bật / tắt (kể cả mép bàn); luật sáu quân; hình dạng thế cờ theo luật; máy luôn đi nước thắng, chặn bốn, chặn bốn mở, chặn ba mở (Vừa / Khó), tìm được chuỗi VCF (Khó); máy trả nước hợp lệ trong giới hạn thời gian và dừng đúng hạn; máy Khó thắng máy Dễ; engine chạy được kiểu Web Worker.

## Chạy cục bộ

Mở trực tiếp `index.html` bằng trình duyệt, hoặc chạy một static server bất kỳ:

```bash
npx serve .
```

Mọi đường dẫn trong dự án đều là đường dẫn tương đối nên chạy được ở bất kỳ sub-path nào, kể cả khi nhúng trong iframe của cổng PlayNine.
