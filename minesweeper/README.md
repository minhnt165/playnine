# Dò Mìn

Game Dò Mìn (Minesweeper) chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài. Mở `index.html` là chơi được. Là một game trong cổng PlayNine (chạy trong iframe dưới thanh của cổng).

## Tính năng

- 3 mức chơi: Dễ (9x9, 10 mìn), Vừa (16x16, 40 mìn), Khó (30x16, 99 mìn), và Tùy chỉnh (cạnh 5–40 ô, tối đa `rộng x cao - 9` mìn).
- Cú mở đầu luôn an toàn và mở ra một vùng trống: mìn chỉ được đặt sau cú mở đầu, tránh ô được mở và 8 ô xung quanh.
- Ván hằng ngày: mỗi ngày một bàn Vừa chung cho mọi người, tính chuỗi ngày thắng liên tiếp.
- Mở ô (chạm / nhấp trái), cắm cờ (nhấp phải, hoặc nhấn giữ ~350 ms trên màn hình cảm ứng, có rung nếu máy hỗ trợ). Nút "Cắm cờ" đổi chạm thành cắm cờ (khi đó nhấn giữ sẽ mở ô).
- Mở nhanh (chording): chạm / nhấp vào ô số đã đủ cờ xung quanh để mở các ô kề còn lại. Chưa đủ cờ thì các ô kề nháy nhẹ để báo. Chuột giữa cũng mở nhanh.
- Dấu "?" (tắt mặc định, bật trong Cài đặt): cắm cờ lần nữa trên ô có cờ để đổi thành dấu "?".
- Bộ đếm mìn còn lại (tổng mìn trừ số cờ, có thể âm), đồng hồ, nút mặt cười để chơi lại ván mới cùng mức.
- Thua: hiện mọi mìn, đánh dấu cờ cắm sai, ô nổ tô đỏ, bàn rung nhẹ, mìn hiện lan dần từ ô nổ. Thắng: tự cắm cờ lên mọi mìn, sóng sáng lan từ ô mở cuối. Hoạt ảnh tắt khi hệ thống bật giảm chuyển động.
- Thống kê theo mức: số ván chơi, thắng, thời gian tốt nhất và trung bình (của các ván thắng); ván hằng ngày: chuỗi ngày, số ngày đã thắng, thời gian tốt nhất. Có nút đặt lại (bấm hai lần để xác nhận).
- Tự lưu ván đang chơi vào `localStorage`, mở lại trang thì chơi tiếp. Đồng hồ dừng khi chuyển tab / ẩn trang.
- Cài đặt: giao diện Tự động / Sáng / Tối (áp trước khi vẽ trang để không nháy màu), dấu "?", rung khi cắm cờ.
- Bàn mìn tự co theo chiều cao khung (`100dvh`) nên không phải cuộn khi chơi. Bàn dài hơn rộng (Khó) trên màn hình dọc tự xoay thành 16 cột x 30 hàng. Ô quá nhỏ thì hiện nút phóng to: bàn to ra và kéo để xem trong khung, trang vẫn không cuộn.
- Màu số 1–8 khác nhau rõ và đủ tương phản ở cả giao diện sáng lẫn tối.
- Giao diện tiếng Anh (mặc định) / tiếng Việt, mobile first (chạy được ở bề rộng 360px), nút bấm tối thiểu 40px, tôn trọng safe-area (tai thỏ), modal dạng bottom sheet trên điện thoại, layout riêng khi xoay ngang.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| Phím mũi tên | Di chuyển con trỏ trên bàn mìn |
| `Space` / `Enter` | Mở ô (trên ô số: mở nhanh) |
| `F` | Cắm cờ / gỡ cờ (trên ô số: mở nhanh) |
| `N` | Ván mới cùng mức |
| `Esc` | Đóng hộp thoại |

Bàn mìn là một điểm dừng Tab duy nhất; con trỏ chỉ hiện khi điều khiển bằng bàn phím.

## Cấu trúc

```
index.html  Khung trang, modal, biểu tượng SVG dùng chung
style.css   Giao diện, bảng màu PlayNine, dark mode, responsive
engine.js   Engine thuần (không đụng DOM): đặt mìn, mở ô, loang, mở nhanh, cờ, thắng / thua, PRNG có seed
app.js      Logic game + render (cần engine.js nạp trước)
i18n.js     Từ điển tiếng Anh / tiếng Việt và hàm dịch I18N (nạp trước engine.js, app.js)
test.js     Test engine chạy bằng Node
icon.svg    Icon app 64x64, dùng luôn làm favicon
```

`engine.js` gắn đối tượng `Minesweeper` vào `window` khi chạy trên trình duyệt và xuất qua `module.exports` khi chạy trong Node.

Phiên bản app nằm ở hằng `APP_VERSION` đầu `app.js` (hiển thị trong modal Cài đặt). Khi phát hành bản mới, tăng số này và sửa tham số `?v=` của `style.css`, `i18n.js`, `engine.js`, `app.js` trong `index.html`. Thời gian nhấn giữ (`LONG_PRESS_MS`), ngưỡng hiện nút phóng to (`ZOOM_THRESHOLD`) và cỡ ô khi phóng to (`ZOOM_CELL`) ở đầu `app.js`. Kích thước các mức và giới hạn Tùy chỉnh nằm trong `LEVELS` / `CUSTOM_LIMITS` ở `engine.js`.

## Ngôn ngữ / Language

Giao diện có tiếng Anh (mặc định) và tiếng Việt, chọn ở hàng **Language / Ngôn ngữ** trong Cài đặt. Ngôn ngữ lưu ở khóa dùng chung với cổng PlayNine `localStorage['playnine-lang']` (`'en'` hoặc `'vi'`; thiếu hoặc sai thì dùng `'en'`, không tự đoán theo trình duyệt). Đổi ngôn ngữ thì game lưu ván rồi tải lại trang; cổng hoặc tab khác đổi khóa này thì game cũng tự tải lại (sự kiện `storage`).

`i18n.js` định nghĩa biến toàn cục `I18N`: `t(key, params)` tra chuỗi (thiếu thì lấy tiếng Anh, `{tên}` thay bằng `params`, chuỗi số nhiều tiếng Anh dạng `{ one, other }` chọn theo `params.n`), `apply()` điền các phần tử có `data-i18n` / `data-i18n-html` / `data-i18n-attr`, `set(lang)`, `fmtDate(d, opts)` (`en-US` / `vi-VN`; tiếng Việt giữ ngày dạng `dd/mm`). Chữ tĩnh trong `index.html` viết sẵn bằng tiếng Anh nên không nháy chữ khi tải. `engine.js` không chứa chữ hiển thị (tên mức Dễ / Vừa / Khó nằm ở khóa `level.<key>` trong `i18n.js`). Tóm tắt cho cổng (`note`, `stats[].label`, `resume`, `daily.title`) ghi theo ngôn ngữ đang chọn và được ghi lại mỗi lần mở trang; ví dụ dưới là bản tiếng Việt.

## Ván hằng ngày

Seed sinh từ chuỗi `playnine-minesweeper-daily-YYYY-MM-DD` (băm FNV-1a) và đưa vào PRNG mulberry32, nên cùng ngày thì mọi máy có cùng vị trí mìn. Mìn được đặt sẵn theo seed ngay khi tạo ván. Ở cú mở đầu, các mìn nằm trong ô được mở và 8 ô xung quanh được dời sang ô trống khác, ô đích chọn bằng một PRNG khác cũng lấy từ seed. Vì vậy cùng ngày và cùng ô mở đầu thì luôn ra cùng một bàn. Ván hằng ngày luôn ở mức Vừa; thua thì được thử lại cùng bàn. Thắng thì tính vào chuỗi ngày.

## Dữ liệu lưu trong trình duyệt

Mọi khóa đều có tiền tố `playnine-minesweeper-`, mọi lần đọc / ghi đều bọc `try/catch`.

| Khóa | Nội dung |
| --- | --- |
| `playnine-minesweeper-settings-v1` | Cài đặt: giao diện, dấu "?", rung, mức chơi gần nhất, kích thước Tùy chỉnh |
| `playnine-minesweeper-stats-v1` | Thống kê theo mức và ván hằng ngày |
| `playnine-minesweeper-save-v1` | Ván đang chơi dở (xóa khi ván kết thúc) |
| `playnine-minesweeper-summary-v1` | Tóm tắt cho thẻ game trên cổng PlayNine |

Tóm tắt cho cổng được ghi lại khi bắt đầu ván, khi mở ô đầu tiên, khi thắng / thua, mỗi 5 giây khi đang chơi và khi ẩn trang. Định dạng:

```json
{
  "v": 1,
  "updatedAt": 1792464326786,
  "played": 12,
  "won": 7,
  "note": "7 ván thắng · kỷ lục Vừa 02:41",
  "stats": [
    { "value": "7", "label": "Ván thắng" },
    { "value": "58%", "label": "Tỉ lệ thắng" },
    { "value": "02:41", "label": "Kỷ lục Vừa" }
  ],
  "resume": { "title": "Dò Mìn Vừa", "detail": "Đã mở 35% · 01:12", "pct": 0.352 },
  "daily": { "date": "2026-10-20", "title": "Đề hôm nay: 16x16", "done": false, "streak": 3 }
}
```

`resume` chỉ khác `null` khi có ván đang chơi dở (đã mở ít nhất một ô và chưa kết thúc).

## Kiểm tra engine

```bash
node test.js
```

Kiểm tra: đặt đúng số mìn và cú mở đầu an toàn ở mọi mức (kể cả góc bàn và bàn Tùy chỉnh dày mìn nhất), loang vùng trống, không mở ô cắm cờ, trúng mìn thì thua, mở nhanh (đủ cờ / thiếu cờ / cờ sai), phát hiện thắng, cắm cờ và dấu "?", ván hằng ngày tất định (cùng ngày cùng đề, cùng ô mở đầu cùng bàn, mìn ngoài vùng an toàn giữ nguyên), khôi phục ván từ JSON và từ chối dữ liệu hỏng.

## Chạy cục bộ

Mở trực tiếp `index.html` bằng trình duyệt, hoặc chạy một static server bất kỳ:

```bash
npx serve .
```

Mọi đường dẫn trong dự án đều là đường dẫn tương đối nên chạy được ở bất kỳ sub-path nào, kể cả trong iframe của cổng PlayNine.
