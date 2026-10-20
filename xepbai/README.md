# Xếp Bài

Game Xếp Bài (Klondike Solitaire) chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài, không ảnh ngoài (lá bài vẽ bằng CSS + SVG). Mở `index.html` là chơi được. Là một game trong cổng PlayNine (chạy trong iframe dưới thanh của cổng).

## Luật chơi

Game dùng luật Klondike chuẩn:

- Bộ 52 lá. Chia 7 cột: cột 1 có 1 lá, cột 2 có 2 lá, … cột 7 có 7 lá (tổng 28 lá), chỉ lá trên cùng mỗi cột ngửa. 24 lá còn lại úp thành chồng rút.
- Mục tiêu: đưa cả 52 lá lên 4 ô đích, mỗi ô một chất, xếp từ A lên K.
- Trên cột, đặt lá nhỏ hơn đúng 1 bậc và khác màu (đỏ: cơ, rô; đen: bích, nhép) lên lá trên cùng. Được chuyển cả một dãy lá ngửa đã xếp đúng.
- Cột trống chỉ đặt được K (hoặc dãy bắt đầu bằng K).
- Chuyển hết lá ngửa khỏi cột thì lá úp trên cùng tự lật lên.
- Chạm chồng rút để lật 1 lá (hoặc 3 lá) sang chồng thải; chỉ lá trên cùng chồng thải được dùng. Hết chồng rút thì chạm lần nữa để lật úp cả chồng thải lại thành chồng rút (chia lại), thứ tự giữ nguyên.
- Lá trên ô đích được kéo xuống cột nếu hợp lệ.
- Điểm (kiểu Windows): chồng thải xuống cột +5, lên ô đích +10 (từ chồng thải hoặc từ cột), lật lá úp +5, từ ô đích xuống cột −15, chuyển giữa các cột 0.

### Các điểm luật game tự chọn

- Chia lại chồng rút không giới hạn số vòng, ở cả rút 1 lá và rút 3 lá, và không trừ điểm khi chia lại.
- Điểm không xuống dưới 0. Không có thưởng thời gian; thời gian chỉ dùng để xếp hạng "Nhanh nhất".
- Lá úp được lật tự động (và cộng điểm) ngay khi lộ ra, không cần chạm.
- Ô đích nào cũng nhận được Át của bất kỳ chất nào; sau đó ô đó chỉ nhận đúng chất ấy.
- Rút 3 lá: chồng thải xòe tối đa 3 lá của lần rút gần nhất; lấy lá trên cùng đi thì lá kế tiếp trong nhóm đó dùng được.
- Không chỉ chia ván giải được: ván ngẫu nhiên và ván hằng ngày đều là bộ bài xáo ngẫu nhiên (Fisher-Yates), nên có ván không thể thắng. Khi không còn nước có ích, game báo "Hết nước đi có ích" và gợi ý Đi lại hoặc Ván mới.
- Đi lại (hoàn tác) không giới hạn và trả về đúng trạng thái trước đó, kể cả điểm và số nước. Đi lại không bị trừ điểm.

## Tính năng

- Hai kiểu ván: Ván ngẫu nhiên (rút 1 lá hoặc 3 lá) và Ván hằng ngày (chung cho mọi người, xem bên dưới). Ván mới còn có "Chơi lại ván này" để chia lại đúng bộ bài đang chơi.
- Lá bài vẽ bằng CSS, bốn chất là path SVG nội tuyến nên trông giống nhau trên mọi hệ điều hành. Dải trên mỗi lá có bậc (A, 2..10, J, Q, K) và chất nhỏ, đọc được khi lá bị đè; lá J/Q/K có khung vàng. Mặt sau nâu – vàng kiểu PlayNine. Mặt lá giữ màu sáng ở giao diện tối.
- Cỡ lá tính theo khung để 7 cột vừa bề rộng 360 px; cột dài tự ép độ xòe (ép phần lá úp trước) để không bao giờ phải cuộn trang.
- Kéo thả (pointer events, chạy với chuột lẫn cảm ứng): thả vào chồng hợp lệ chồng lấn nhiều nhất, không hợp lệ thì lá bay về chỗ cũ.
- Chạm để đi (mặc định): chạm một lá, lá tự tới chỗ hợp lệ tốt nhất (ô đích trước, rồi các cột có bài tính từ bên phải, cuối cùng một cột trống); chạm lại đúng lá đó để đổi sang đích kế tiếp (nước trước được đi lại rồi đi đích mới, nên điểm luôn đúng). Chạm đúp khi lá đã lên ô đích thì giữ nguyên trên ô đích. Lá không đi được thì rung nhẹ.
- Chế độ "Chọn rồi đặt" (Cài đặt): chạm lá để cầm, chạm chỗ muốn đặt; chạm đúp vào lá đang cầm để đưa lên ô đích.
- Chạm chồng rút để rút; hết chồng thì hiện biểu tượng chia lại. Có số lá còn lại trên chồng rút.
- Đi lại không giới hạn, Gợi ý (nhấp nháy lá nên đi và chỗ đặt, kèm câu mô tả), Tự xếp (hiện khi mọi lá trên cột đã ngửa và chắc chắn xếp được hết, các lá lần lượt bay lên ô đích).
- Thắng: các lá nảy khỏi ô đích kiểu Solitaire cổ điển, sau đó hiện bảng kết quả có pháo giấy (chạm để bỏ qua hiệu ứng). Tắt khi hệ thống bật giảm chuyển động hoặc tốc độ hiệu ứng "Tắt".
- Hiệu ứng chia bài, lật lá, lá bay tới chỗ mới; tốc độ Chậm / Vừa / Nhanh / Tắt.
- Thanh trạng thái: điểm, số nước, đồng hồ (chạy từ nước đi đầu tiên, dừng khi ẩn tab).
- Hướng dẫn "Cách chơi" 6 bước có hình minh họa SVG, tự mở ở lần đầu vào game, sau đó mở bằng nút "?" (hoặc phím `H`).
- Thống kê: đã chơi, đã thắng, tỉ lệ thắng, nhanh nhất, điểm cao nhất, chuỗi thắng hiện tại, chuỗi thắng dài nhất, chuỗi ngày (ván hằng ngày), số ngày đã thắng; bảng theo kiểu chơi (Rút 1 lá, Rút 3 lá, Hằng ngày). Đặt lại phải bấm hai lần.
- Tự lưu ván (bộ bài + danh sách nước đi) sau mỗi nước, định kỳ 5 giây và khi ẩn trang; mở lại trang thì chơi tiếp.
- Cài đặt: giao diện Tự động / Sáng / Tối (áp trước khi vẽ trang để không nháy màu), chạm vào lá (Tự đi / Chọn rồi đặt), tốc độ hiệu ứng, số lá mỗi lần rút (áp dụng từ ván mới; ván chưa đi nước nào thì áp ngay).
- Tối ưu mobile: dùng `100dvh`, không cuộn trang ở 360 x 640 dọc, modal dạng bottom sheet, layout ngang (bàn bên trái, cột điểm / nút / phím tắt bên phải) khi màn hình rộng hoặc điện thoại xoay ngang, tôn trọng safe-area.
- Điều khiển bằng bàn phím với khung con trỏ vàng hiển thị rõ; có thông báo cho trình đọc màn hình (tên lá đọc tiếng Việt: Át, Bồi, Đầm, Già; bích, cơ, rô, nhép).

### Thống kê: cách tính ván

- Ván chỉ tính là "đã chơi" từ nước đi đầu tiên (rút bài cũng tính). Mở ván rồi bỏ ngay không làm giảm tỉ lệ thắng.
- Bỏ một ván đã đi ít nhất một nước để sang ván khác (Ván mới, Chơi lại ván này) thì ván đó là ván chưa thắng và chuỗi thắng về 0. Đóng trang rồi mở lại không tính là bỏ ván.
- "Nhanh nhất" và "Điểm cao nhất" chỉ tính trên các ván thắng.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `Tab` / `Shift+Tab` | Chuyển giữa 13 chồng bài (chồng rút, chồng thải, 4 ô đích, 7 cột) |
| `←` / `→` | Sang chồng bên trái / phải |
| `↑` / `↓` | Trên cột: chọn thêm / bớt lá trong dãy ngửa; hết dãy thì lên hàng trên. Hàng trên: `↓` xuống cột bên dưới |
| `Enter` | Cầm lá (dãy) đang chọn; đang cầm thì đặt vào chồng đang chọn; trên chồng rút thì rút bài |
| `Space` | Rút bài |
| `Esc` | Bỏ cầm, đóng hộp thoại |
| `Z` / `Ctrl+Z` | Đi lại |
| `G` | Gợi ý |
| `A` | Tự xếp (khi có) |
| `N` | Ván mới |
| `H` / `?` | Cách chơi |

## Cấu trúc

```
index.html  Khung trang, modal, bốn chất SVG dùng chung
style.css   Giao diện, màu PlayNine, lá bài, dark mode, responsive
engine.js   Luật Klondike, xáo bài có seed, gợi ý, tự xếp; không đụng DOM (chạy trong trình duyệt và Node)
app.js      Logic game, bố cục bàn, kéo thả, bàn phím, hiệu ứng, render (cần engine.js nạp trước)
test.js     Test engine chạy bằng Node
icon.svg    Icon app 64x64, dùng làm favicon
```

`engine.js` gắn đối tượng `XepBai` vào `window` khi chạy trên trình duyệt và xuất qua `module.exports` khi chạy trong Node. Lá bài là số 0..51 (chất = số / 13 theo thứ tự bích, cơ, rô, nhép; bậc = số % 13 + 1). Nước đi là object thuần `{ t: 'draw' }` hoặc `{ t: 'move', from, n, to }` với mã chồng `waste`, `f0`..`f3`, `t0`..`t6`. Ván được lưu dưới dạng bộ bài + danh sách nước và dựng lại bằng `XepBai.replay`, nên Đi lại và khôi phục ván luôn khớp luật.

`app.js` dựng sẵn 52 phần tử lá bài và 13 ô chồng; mỗi lần render chỉ đổi `transform` của lá, transition CSS lo phần lá bay. Lá đang bay được nâng tầng tạm thời; bàn dùng `isolation: isolate` để tầng của lá không đè lên modal.

Phiên bản app nằm ở hằng `APP_VERSION` đầu `app.js` (hiển thị trong modal Cài đặt). Khi phát hành bản mới, tăng số này và sửa tham số `?v=` của `style.css`, `engine.js`, `app.js` trong `index.html`. Tốc độ hiệu ứng (`SPEED`, `AUTO_STEP`), ngưỡng kéo (`DRAG_START`), thời gian chạm đúp (`DOUBLE_TAP_MS`) và cỡ lá tối đa (`MAX_CW`) ở đầu `app.js`. Điểm từng loại nước nằm trong `SCORE` ở `engine.js`.

## Ván hằng ngày

Seed sinh từ chuỗi `playnine-xepbai-daily-YYYY-MM-DD` (theo ngày giờ máy, băm FNV-1a) và đưa vào PRNG mulberry32 để xáo bộ bài, nên cùng ngày thì mọi máy được chia giống hệt nhau. Ván hằng ngày luôn rút 1 lá (`DAILY_DRAW`) để mọi người cùng một đề. Chơi lại được bao nhiêu lần cũng được; thắng thì ngày đó được tính vào chuỗi ngày (thời gian tốt nhất của ngày được giữ lại). Ván hằng ngày đang chơi dở được giữ qua nửa đêm; thắng sau nửa đêm vẫn ghi cho ngày của đề.

## Dữ liệu lưu trong trình duyệt

Mọi khóa đều có tiền tố `playnine-xepbai-`, mọi lần đọc / ghi đều bọc `try/catch`.

| Khóa `localStorage` | Nội dung |
| --- | --- |
| `playnine-xepbai-settings-v1` | Giao diện, số lá mỗi lần rút, kiểu chạm, tốc độ hiệu ứng, đã xem hướng dẫn chưa |
| `playnine-xepbai-save-v1` | Ván đang chơi (kiểu ván, ngày, số lá rút, bộ bài, danh sách nước, thời gian); xóa khi thắng |
| `playnine-xepbai-stats-v1` | Thống kê theo kiểu chơi, các ngày đã thắng ván hằng ngày, chuỗi thắng |
| `playnine-xepbai-summary-v1` | Tóm tắt cho thẻ game trên cổng PlayNine |

Tóm tắt cho cổng được ghi khi bắt đầu ván, sau mỗi nước, khi thắng, mỗi 5 giây khi đang chơi và khi ẩn trang. Định dạng:

```json
{
  "v": 1,
  "updatedAt": 1792472880529,
  "played": 9,
  "won": 4,
  "note": "4 ván thắng · nhanh nhất 03:08",
  "stats": [
    { "value": "4", "label": "Ván thắng" },
    { "value": "44%", "label": "Tỉ lệ thắng" },
    { "value": "03:08", "label": "Nhanh nhất" }
  ],
  "resume": { "title": "Xếp Bài · rút 1 lá", "detail": "17/52 lá lên đích · 215 điểm · 04:12", "pct": 0.327 },
  "daily": { "date": "2026-10-20", "title": "Ván chia hôm nay · rút 1 lá", "done": false, "streak": 3 }
}
```

`resume` chỉ khác `null` khi có ván đang chơi dở (đã đi ít nhất một nước và chưa thắng); `pct` là số lá trên ô đích / 52.

## Kiểm tra engine

```bash
node test.js
```

Kiểm tra: chia bài (28 lá trên cột, 24 lá chồng rút, đúng lá ngửa, đúng thứ tự chia theo hàng), ván hằng ngày tất định (cùng ngày cùng bộ bài, 365 ngày khác nhau), nước đi trên cột hợp lệ / sai màu / sai bậc, chỉ K vào cột trống, chuyển dãy và không bốc lá úp, tự lật lá úp, ô đích theo chất từ A, rút 1 lá và rút 3 lá qua nhiều vòng chia lại, tính điểm từng loại nước và điểm không âm, đi lại bằng replay khớp từng bước, replay từ chối dữ liệu hỏng, nhận biết thắng, tự xếp (kể cả 300 ván chơi bằng gợi ý tới khi lật hết bài), thứ tự đích của chạm để đi, gợi ý, bảo toàn đủ 52 lá khác nhau qua 2000 ván nước đi ngẫu nhiên, nước sai luật không bao giờ đổi trạng thái.

## Chạy cục bộ

Mở trực tiếp `index.html` bằng trình duyệt, hoặc chạy một static server bất kỳ:

```bash
npx serve .
```

Mọi đường dẫn trong dự án đều là đường dẫn tương đối nên chạy được ở bất kỳ sub-path nào, kể cả trong iframe của cổng PlayNine.
