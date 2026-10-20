# 2048

Game 2048 chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài. Mở `index.html` là chơi được. Là một game của cổng PlayNine (chạy trong iframe dưới thanh của cổng), nhưng cũng chạy độc lập.

## Tính năng

- Lưới 4x4 (mặc định), chọn thêm 3x3 hoặc 5x5 trong Cài đặt. Mỗi kích thước có điểm cao nhất riêng.
- Mỗi nước đi sinh một ô mới: 90% là 2, 10% là 4. Nước đi không làm thay đổi gì thì không sinh ô.
- Luật gộp chuẩn: mỗi ô chỉ gộp một lần trong một lượt (`[2,2,2,2]` → `[4,4,0,0]`, `[2,2,4,4]` → `[4,8,0,0]`).
- Điều khiển: phím mũi tên hoặc WASD; vuốt trên bàn chơi (pointer events, ngưỡng 24px, bỏ qua thao tác hai ngón trở lên). Bàn chơi đặt `touch-action: none` nên vuốt không cuộn trang.
- Hiệu ứng mượt: ô trượt bằng `transform`, ô vừa gộp nảy lên, ô mới hiện ra sau khi các ô trượt xong. Render theo id ô (mỗi ô giữ một phần tử DOM suốt đời), không vẽ lại cả lưới.
- Điểm có hiệu ứng "+N" bay lên khi gộp, kèm điểm cao nhất của kích thước đang chơi.
- Hoàn tác: tối đa 3 lần mỗi ván, hiển thị số lượt còn lại trên nút. Hoàn tác được cả khi đã hết nước đi.
- Chạm 2048: lớp phủ chúc mừng, chọn "Chơi tiếp" hoặc "Ván mới". Hết nước đi: lớp phủ hiện điểm, ô lớn nhất, cho hoàn tác (nếu còn lượt) hoặc ván mới.
- Thống kê: số ván đã chơi, số lần đạt 2048, ô lớn nhất từng có, điểm cao nhất (tổng và theo từng kích thước). Nút "Đặt lại" phải bấm hai lần để tránh xóa nhầm.
- Hỏi lại trước khi bỏ ván đang dở (bấm Ván mới hoặc đổi kích thước).
- Tự lưu ván đang chơi vào `localStorage` sau mỗi nước, mở lại trang thì tiếp tục (kể cả lớp phủ thắng / thua).
- Màu ô tông gỗ / vàng / hổ phách / đỏ theo bảng màu PlayNine, mỗi giá trị một màu tới 2048, các ô lớn hơn dùng đỏ sẫm viền vàng. Cỡ chữ tự nhỏ lại với số 3, 4, 5, 6 chữ số.
- Giao diện tiếng Anh (mặc định) / tiếng Việt, dark mode theo hệ thống hoặc chọn thủ công (Tự động / Sáng / Tối, áp trước khi vẽ trang để không nháy màu).
- Tối ưu mobile: bàn chơi là hình vuông lớn nhất vừa phần còn lại của màn hình (`100dvh` + container query) nên không phải cuộn khi chơi; chạy được ở bề rộng 360px; nút bấm tối thiểu 40px; tôn trọng safe-area (tai thỏ); layout riêng khi xoay ngang (điểm bên trái, bàn chơi bên phải); modal dạng bottom sheet trên màn hình hẹp.
- Truy cập bằng bàn phím: mọi nút đều Tab tới được, viền focus rõ ràng, modal giữ focus bên trong và đóng bằng `Esc`, thông báo thắng / thua / hoàn tác qua vùng `aria-live`. Tôn trọng `prefers-reduced-motion` (tắt trượt, nảy, "+N").

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| Phím mũi tên / `W` `A` `S` `D` | Dồn các ô theo hướng |
| `Z` / `U` | Hoàn tác |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại |

## Cấu trúc

```
index.html   Khung trang, lớp phủ thắng / thua, modal Cài đặt / Thống kê / Xác nhận
style.css    Giao diện, bảng màu PlayNine, màu ô, dark mode, responsive, hiệu ứng
engine.js    Engine thuần (không đụng DOM): trượt / gộp, sinh ô, hết nước, hoàn tác, khôi phục state
app.js       Render theo id ô, bàn phím, vuốt, lưu trữ, thống kê, tóm tắt cho cổng (cần engine.js nạp trước)
i18n.js      Từ điển tiếng Anh / tiếng Việt và hàm dịch I18N (nạp trước engine.js, app.js)
test.js      Test engine chạy bằng Node
icon.svg     Icon app 64x64, dùng luôn làm favicon
```

`engine.js` gắn vào `window.Game2048` khi chạy trong trình duyệt và `module.exports` khi chạy trong Node. Mọi hàm nhận state và trả về state mới, không sửa state cũ. `move(state, dir)` trả về thêm danh sách ô trượt (`slides`), ô gộp (`merges`) và ô mới (`spawned`) để giao diện chạy hiệu ứng.

Phiên bản app nằm ở hằng `APP_VERSION` đầu `app.js` (hiển thị trong modal Cài đặt). Khi phát hành bản mới, tăng số này và sửa tham số `?v=` của `style.css`, `i18n.js`, `engine.js`, `app.js` trong `index.html` để trình duyệt tải file mới thay vì dùng bản cache. Số lượt hoàn tác (`MAX_UNDO`), ô thắng (`WIN_VALUE`), tỉ lệ ô 4 (`FOUR_CHANCE`) và các kích thước lưới (`SIZES`) nằm ở đầu `engine.js`; ngưỡng vuốt (`SWIPE_MIN`) ở đầu `app.js`.

## Ngôn ngữ / Language

Giao diện có tiếng Anh (mặc định) và tiếng Việt, chọn ở hàng **Language / Ngôn ngữ** trong Cài đặt. Ngôn ngữ lưu ở khóa dùng chung với cổng PlayNine `localStorage['playnine-lang']` (`'en'` hoặc `'vi'`; thiếu hoặc sai thì dùng `'en'`, không tự đoán theo trình duyệt). Đổi ngôn ngữ thì game lưu ván rồi tải lại trang; cổng hoặc tab khác đổi khóa này thì game cũng tự tải lại (sự kiện `storage`).

`i18n.js` định nghĩa biến toàn cục `I18N`: `t(key, params)` tra chuỗi (thiếu thì lấy tiếng Anh, `{tên}` thay bằng `params`, chuỗi số nhiều tiếng Anh dạng `{ one, other }` chọn theo `params.n`), `apply()` điền các phần tử có `data-i18n` / `data-i18n-html` / `data-i18n-attr`, `set(lang)`, `fmtNumber(n)` (`en-US` / `vi-VN`). Chữ tĩnh trong `index.html` viết sẵn bằng tiếng Anh nên không nháy chữ khi tải. `engine.js` không chứa chữ hiển thị. Tóm tắt cho cổng (`note`, `stats[].label`, `resume`) ghi theo ngôn ngữ đang chọn và được ghi lại mỗi lần mở trang.

## Dữ liệu lưu trong trình duyệt

Mọi khóa đều có tiền tố `playnine-2048-`, mọi truy cập `localStorage` đều bọc `try/catch` (chế độ ẩn danh hoặc bị chặn bộ nhớ thì game vẫn chơi được, chỉ không lưu).

| Khóa | Nội dung |
| --- | --- |
| `playnine-2048-settings-v1` | `{ theme: 'auto' \| 'light' \| 'dark', size: 3 \| 4 \| 5 }` |
| `playnine-2048-game-v1` | Ván đang chơi: `{ game: <state engine>, counted }` |
| `playnine-2048-stats-v1` | `{ played, won, bestTile, best: { 3, 4, 5 } }` |
| `playnine-2048-summary-v1` | Tóm tắt cho thẻ game ở cổng PlayNine (xem dưới) |

Tóm tắt cho cổng được ghi lại khi bắt đầu ván mới, sau mỗi nước đi (kể cả khi chạm 2048 hoặc hết nước), khi hoàn tác và khi rời trang:

```json
{
  "v": 1,
  "updatedAt": 1792464015482,
  "played": 38,
  "won": 4,
  "note": "Điểm cao nhất 123.456 · ô lớn nhất 16384",
  "stats": [
    { "value": "123.456", "label": "Điểm cao nhất" },
    { "value": "16384", "label": "Ô lớn nhất" },
    { "value": "4", "label": "Lần đạt 2048" }
  ],
  "resume": { "title": "Tiếp tục 2048", "detail": "Điểm 20 · ô lớn nhất 8", "pct": null },
  "daily": null
}
```

`resume` chỉ khác `null` khi có ván đang dở (đã đi ít nhất một nước và chưa hết nước). Ván 3x3 / 5x5 thêm kích thước vào đầu `detail`, ví dụ `5x5 · Điểm 3.204 · ô lớn nhất 256`. Một ván được tính vào `played` khi đi nước đầu tiên; `won` tăng một lần mỗi ván chạm 2048.

## Kiểm tra engine

```bash
node test.js
```

Script kiểm tra: luật trượt / gộp một dãy (mỗi ô chỉ gộp một lần), đủ bốn hướng trên lưới 3x3 / 4x4 / 5x5, không sinh ô khi nước đi không đổi gì, tỉ lệ ô 4 xấp xỉ 10%, id ô không trùng, cộng điểm, phát hiện hết nước, chạm 2048, hoàn tác (khôi phục đúng, tối đa 3 lần), khôi phục state từ JSON, và 500 ván chơi ngẫu nhiên luôn hợp lệ.

## Chạy cục bộ

Mở trực tiếp `index.html` bằng trình duyệt, hoặc chạy một static server bất kỳ:

```bash
npx serve .
```

## Deploy lên GitHub Pages

1. Push code lên GitHub, nhánh `main`.
2. Vào repo trên GitHub: **Settings → Pages**.
3. Ở mục **Build and deployment**, chọn **Source: Deploy from a branch**.
4. Chọn **Branch: `main`**, thư mục **`/ (root)`**, bấm **Save**.
5. Đợi khoảng 1 phút, trang sẽ có tại `https://<tên-user>.github.io/<tên-repo>/`.

Mọi đường dẫn trong dự án đều là đường dẫn tương đối nên chạy được ở bất kỳ sub-path nào.
