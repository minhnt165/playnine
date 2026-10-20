# Tranh Ẩn

Game Tranh Ẩn (Nonogram / Picross) chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài. Mở `index.html` là chơi được. Là một game trong cổng PlayNine (chạy trong iframe dưới thanh của cổng).

## Cách chơi

Mỗi hàng và mỗi cột có một dãy số. Mỗi số là độ dài một đoạn ô tô liền nhau, theo đúng thứ tự từ trái sang phải (hoặc trên xuống dưới), giữa hai đoạn có ít nhất một ô trống. Tô đúng mọi ô thì bức tranh hiện ra.

## Tính năng

- **Bộ tranh**: 33 tranh pixel vẽ tay, chia thành 3 bộ theo cỡ, tên tranh chỉ hiện khi giải xong.
  - Bộ Nhỏ 5x5 (8 tranh): Trái tim, Ngôi sao, Ngôi nhà, Mặt trăng, Nốt nhạc, Chiếc lá, Cái cốc, Cây thông.
  - Bộ Vừa 10x10 (16 tranh): Nón lá, Quả xoài, Đèn lồng, Bánh chưng, Cà phê phin, Chiếc ô, Con mèo, Con thuyền, Quả táo, Chìa khoá, Con rùa, Con ốc, Bông hoa, Ngọn núi, Máy bay, Bát phở.
  - Bộ Lớn 15x15 (9 tranh): Áo dài, Hoa sen, Con trâu, Cây tre, Chùa Một Cột, Xe đạp, Ô tô, Cá chép, Cây dừa.
- Mọi tranh trong bộ đều giải được chỉ bằng suy luận theo từng dòng (không phải đoán) và có đúng một lời giải. `test.js` kiểm tra điều này.
- Màn hình bộ tranh: tranh đã giải hiện hình màu và thời gian tốt nhất, tranh chưa giải hiện dấu "?", tranh đang giải được đánh dấu.
- **Ngẫu nhiên** 5x5 / 10x10 / 15x15: sinh lưới ngẫu nhiên rồi chỉ giữ lưới giải được bằng suy luận theo dòng (nên có nghiệm duy nhất). Thử tối đa 600 lần; trên thực tế trung bình 1–3 lần là được. Nếu vẫn không được thì dùng một tranh vẽ sẵn cùng cỡ.
- **Tranh hằng ngày**: mỗi ngày một tranh 10x10 chung cho mọi người, tính chuỗi ngày giải liên tiếp.
- Chạm (hoặc nhấp trái) để tô, nhấn giữ ~380 ms (hoặc nhấp phải) để đánh dấu X. Nút **Tô / Dấu X** đổi việc chạm thành đánh dấu X (khi đó nhấn giữ sẽ tô).
- Kéo để tô cả dòng trong một lần: nét kéo khóa theo hàng hoặc cột của ô xuất phát. Ô xuất phát quyết định hành động: ô trống thì tô, ô đã tô thì xóa; nét chỉ đổi những ô có cùng trạng thái với ô xuất phát. Cả nét là một bước hoàn tác.
- Hoàn tác / làm lại không giới hạn trong một tranh (giữ tối đa 400 bước gần nhất, lưu cùng ván).
- Dòng đã đủ số thì gợi ý của dòng đó chuyển xám. Cài đặt **Tự đánh dấu X** (tắt mặc định) tự đánh dấu X các ô còn trống của dòng đó.
- Cài đặt **Kiểm tra lỗi** (tắt mặc định): tô nhầm ô trống thì ô đó hiện X đỏ ngay, tính một lỗi và dừng nét kéo. Bật giữa chừng thì các ô đang tô sai cũng bị đánh dấu và tính lỗi.
- **Gợi ý** (3 lần mỗi tranh): nếu có ô sai thì sửa ô sai trước; nếu không thì chạy bộ giải theo dòng trên những gì bạn đã biết và mở ô mà suy luận sẽ tìm ra kế tiếp (ưu tiên dòng suy ra được nhiều ô nhất, ưu tiên ô cần tô). Gợi ý không bao giờ mở sai ô.
- Tô sáng hàng + cột đang chọn (theo con trỏ, ô vừa chạm, hoặc chuột rê qua), cả dải gợi ý tương ứng. Đường kẻ đậm mỗi 5 ô. Góc trên trái xem trước các ô đã tô.
- Gợi ý số co giãn theo cỡ ô (tối thiểu 11px). Ô nhỏ hơn 24px (15x15 trên điện thoại) thì hiện nút phóng to: lưới to ra, dải gợi ý dính mép trên / trái khi cuộn, một ngón để tô, hai ngón (hoặc kéo trên vùng số) để di chuyển.
- Giải xong: các ô lật lần lượt theo đường chéo và đổi sang màu của tranh (tranh ngẫu nhiên / hằng ngày dùng màu nhấn), rồi hiện tên tranh, thời gian, kỷ lục, số gợi ý đã dùng (hoặc số lỗi khi bật Kiểm tra lỗi). Hoạt ảnh tắt khi hệ thống bật giảm chuyển động.
- Thống kê theo cỡ: số tranh đã chơi, đã giải, thời gian tốt nhất và trung bình; tranh hằng ngày: chuỗi ngày, số ngày đã giải, thời gian tốt nhất; số tranh đã giải trong bộ. Có nút đặt lại (bấm hai lần để xác nhận).
- Tự lưu tranh đang giải vào `localStorage`, mở lại trang thì giải tiếp. Đồng hồ chạy từ thao tác đầu tiên và dừng khi chuyển tab / ẩn trang.
- Mở trang khi không có ván lưu: vào tranh chưa giải kế tiếp của bộ gần nhất (người mới bắt đầu từ Trái tim 5x5).
- Cài đặt: giao diện Tự động / Sáng / Tối (áp trước khi vẽ trang để không nháy màu), Kiểm tra lỗi, Tự đánh dấu X, rung khi nhấn giữ.
- Giao diện tiếng Anh (mặc định) và tiếng Việt, mobile first (chạy được ở bề rộng 360px, không cuộn trang khi chơi nhờ `100dvh`), nút bấm tối thiểu 40px, tôn trọng safe-area, modal dạng bottom sheet trên điện thoại, layout riêng khi xoay ngang.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| Phím mũi tên | Di chuyển con trỏ trên lưới |
| `Space` / `Enter` / `F` | Tô / bỏ tô ô tại con trỏ |
| `X` | Đánh dấu X / bỏ dấu X |
| `Z` hoặc `Ctrl+Z` | Hoàn tác |
| `Y`, `Ctrl+Y` hoặc `Ctrl+Shift+Z` | Làm lại |
| `H` | Gợi ý |
| `M` | Đổi chế độ chạm Tô / Dấu X |
| `N` | Chọn tranh |
| `Esc` | Đóng hộp thoại |

Lưới là một điểm dừng Tab duy nhất; con trỏ chỉ hiện khi điều khiển bằng phím.

## Cấu trúc

```
index.html  Khung trang, modal, biểu tượng SVG dùng chung
i18n.js     Từ điển en / vi và hàm dịch I18N (nạp trước engine.js, app.js)
style.css   Giao diện, bảng màu PlayNine, dark mode, responsive
engine.js   Engine thuần (không đụng DOM): gợi ý số, bộ giải theo dòng, đếm nghiệm,
            bộ tranh, tranh ngẫu nhiên / hằng ngày, trạng thái ván, hoàn tác, gợi ý
app.js      Vẽ lưới + xử lý thao tác (cần engine.js nạp trước)
test.js     Test engine chạy bằng Node
icon.svg    Icon app 64x64, dùng luôn làm favicon
```

`engine.js` gắn đối tượng `Nonogram` vào `window` khi chạy trên trình duyệt và xuất qua `module.exports` khi chạy trong Node.

Phiên bản app nằm ở hằng `APP_VERSION` đầu `app.js` (hiển thị trong modal Cài đặt). Khi phát hành bản mới, tăng số này và sửa tham số `?v=` của `style.css`, `i18n.js`, `engine.js`, `app.js` trong `index.html`. Thời gian nhấn giữ (`LONG_PRESS_MS`), ngưỡng hiện nút phóng to (`ZOOM_THRESHOLD`) và cỡ ô khi phóng to (`ZOOM_CELL`) ở đầu `app.js`. Số gợi ý mỗi tranh (`HINTS_PER_PUZZLE`), cỡ tranh hằng ngày (`DAILY_SIZE`) và mật độ tranh ngẫu nhiên (`RANDOM_DENSITY`) ở đầu `engine.js`.

## Thêm tranh vào bộ

Tranh nằm trong mảng `PICTURES` của `engine.js`. Mỗi tranh là một lưới chuỗi: `.` là ô trống, chữ cái là ô tô, màu lấy theo `palette` của tranh (chữ không có trong bảng màu thì dùng màu nhấn). Cỡ phải là 5x5, 10x10 hoặc 15x15. Sau khi thêm, chạy `node test.js`: test báo tranh nào chưa giải được bằng suy luận theo dòng. Cách sửa thường gặp là thêm / bớt một ô ở vùng bị kẹt (ví dụ nối chiếc lá vào thân cây), hoặc lật một cặp ô đối xứng để giữ tranh cân đối.

Đổi lưới của một tranh đã phát hành thì ván đang lưu của tranh đó bị bỏ (app so lời giải khi khôi phục).

## Tranh hằng ngày

Seed sinh từ chuỗi `playnine-tranhan-daily-YYYY-MM-DD` (băm FNV-1a) và đưa vào PRNG mulberry32. Tranh là một lưới ngẫu nhiên 10x10 sinh bằng PRNG đó, thử lại (vẫn bằng PRNG đó) tới khi giải được bằng suy luận theo dòng, nên cùng ngày thì mọi máy có cùng một tranh. Giải xong thì tính vào chuỗi ngày.

## Dữ liệu lưu trong trình duyệt

Mọi khóa đều có tiền tố `playnine-tranhan-`, mọi lần đọc / ghi đều bọc `try/catch`.

| Khóa | Nội dung |
| --- | --- |
| `playnine-tranhan-settings-v1` | Cài đặt: giao diện, Kiểm tra lỗi, Tự đánh dấu X, rung, bộ tranh và cỡ ngẫu nhiên gần nhất |
| `playnine-tranhan-stats-v1` | Thống kê theo cỡ, tranh hằng ngày, thời gian tốt nhất của từng tranh trong bộ |
| `playnine-tranhan-save-v1` | Tranh đang giải dở, kèm lịch sử hoàn tác (xóa khi giải xong) |
| `playnine-tranhan-summary-v1` | Tóm tắt cho thẻ game trên cổng PlayNine |

Tóm tắt cho cổng được ghi lại khi bắt đầu tranh, ở thao tác đầu tiên, khi giải xong, mỗi 5 giây khi đồng hồ đang chạy và khi ẩn trang. Định dạng:

```json
{
  "v": 1,
  "updatedAt": 1792468148677,
  "played": 16,
  "won": 14,
  "note": "14 tranh đã giải · kỷ lục 15x15 09:05",
  "stats": [
    { "value": "14", "label": "Tranh đã giải" },
    { "value": "9/33", "label": "Bộ tranh" },
    { "value": "09:05", "label": "Kỷ lục 15x15" }
  ],
  "resume": { "title": "Tranh Ẩn 10x10", "detail": "Đã tô 42% · 03:10", "pct": 0.42 },
  "daily": { "date": "2026-10-20", "title": "Tranh hôm nay: 10x10", "done": false, "streak": 3 }
}
```

`resume` chỉ khác `null` khi có tranh đang giải dở (đã có ít nhất một thao tác và chưa giải xong). "Đã tô" là số ô đã tô so với tổng số ô cần tô (không lộ ô nào đúng / sai). Các trường chữ (`note`, `stats[].label`, `resume.title`, `resume.detail`, `daily.title`) viết theo ngôn ngữ đang chọn (ví dụ trên là tiếng Việt) và được ghi lại mỗi lần mở trang.

## Ngôn ngữ / Language

Giao diện có tiếng Anh (mặc định) và tiếng Việt. Ngôn ngữ lưu ở khóa dùng chung của cả cổng PlayNine `localStorage['playnine-lang']` (`'en'` hoặc `'vi'`; thiếu / sai thì dùng tiếng Anh, không tự đoán theo trình duyệt).

- `i18n.js` chứa từ điển `{ en, vi }` và đối tượng `I18N`: `I18N.t(khóa, tham số)` (thiếu bản dịch thì lấy tiếng Anh, rồi tới chính khóa; hỗ trợ số nhiều đơn giản `{ one, other }`), `I18N.apply()` điền chữ vào các phần tử có `data-i18n`, `data-i18n-html`, `data-i18n-attr`, `I18N.set(lang)` lưu ván rồi tải lại trang.
- Chữ tĩnh trong `index.html` viết sẵn bằng tiếng Anh nên không nháy chữ khi tải.
- Tên tranh trong bộ được dịch theo id tranh (khóa `pic.<id>`); `engine.js` vẫn giữ tên tiếng Việt và không phụ thuộc ngôn ngữ. Tranh mới chưa có bản dịch thì hiện tên trong `engine.js`.
- Đổi ngôn ngữ trong Cài đặt (hàng **Ngôn ngữ**: English / Tiếng Việt) hoặc từ cổng: trang lưu ván đang giải rồi tải lại, giữ nguyên tranh và các ô đã tô.

## Kiểm tra engine

```bash
node test.js
```

Kiểm tra: tính gợi ý số; bộ giải theo dòng trên các dòng đã biết đáp án (chồng lấn, vừa khít, dùng ô đã biết) và phát hiện dòng mâu thuẫn; đếm nghiệm cho đề một nghiệm, đề nhiều nghiệm và đề một nghiệm nhưng cần đoán; mọi tranh trong bộ giải được bằng suy luận theo dòng và có đúng một nghiệm; 450 tranh ngẫu nhiên (3 cỡ) đều có nghiệm duy nhất; tranh hằng ngày tất định và khác nhau giữa các ngày; gợi ý không bao giờ mở sai ô và tự giải hết được tranh từ trạng thái có ô sai; hoàn tác / làm lại; xám dòng và tự đánh dấu X; khôi phục ván từ JSON và từ chối dữ liệu hỏng.

## Chạy cục bộ

Mở trực tiếp `index.html` bằng trình duyệt, hoặc chạy một static server bất kỳ:

```bash
npx serve .
```

Mọi đường dẫn trong dự án đều là đường dẫn tương đối nên chạy được ở bất kỳ sub-path nào, kể cả trong iframe của cổng PlayNine.
