# Xếp Gạch

Game xếp khối rơi chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài. Mở `index.html` là chơi được. Là một game của cổng PlayNine (chạy trong iframe dưới thanh của cổng), nhưng cũng chạy độc lập.

## Tính năng

- Bàn 10 cột x 20 hàng, thêm 2 hàng ẩn phía trên làm chỗ xuất phát. Vẽ bằng `<canvas>`, nét theo `devicePixelRatio`; mỗi viên gạch được dựng sẵn thành ảnh nhỏ theo màu và cỡ ô nên mỗi khung hình chỉ cần `drawImage`.
- 7 khối I, O, T, S, Z, J, L chia theo **túi 7**: mỗi túi có đủ 7 khối, mỗi khối đúng một lần, thứ tự xáo ngẫu nhiên.
- Xoay theo SRS kèm bảng đá tường (wall kick) 5 độ đá cho mỗi chiều xoay; khối I có bảng riêng. Xoay được cả hai chiều.
- Bóng khối (bật / tắt trong Cài đặt), giữ khối (mỗi lượt rơi một lần, khối giữ hiện mờ khi chưa giữ lại được), xem trước 3 khối kế tiếp.
- Thả nhanh (1 hàng mỗi 35ms, +1 điểm mỗi hàng) và thả thẳng (+2 điểm mỗi hàng, có vệt rơi ngắn).
- Trễ khóa 500ms: di chuyển hoặc xoay khi khối đang chạm đáy thì đặt lại, tối đa 15 lần; rơi xuống độ cao mới thì được tính lại từ đầu.
- Giữ phím / nút ◀ ▶: đi 1 ô ngay, giữ 160ms thì tự lặp mỗi 40ms (DAS / ARR).
- Điểm kiểu guideline: xóa 1 / 2 / 3 / 4 hàng được 100 / 300 / 500 / 800 x cấp. Thêm combo (xóa hàng liên tiếp: +50 x số combo x cấp) và thưởng liên tiếp (xếp 4 hàng hai lần liền nhau: x1,5).
- Lên cấp mỗi 10 hàng, khối rơi nhanh dần theo công thức guideline (cấp 1: 1 giây / hàng, cấp 5: khoảng 0,36 giây, cấp 10: khoảng 0,06 giây), nhanh nhất 1 hàng mỗi khung hình. Chọn cấp bắt đầu 1, 5 hoặc 10.
- Hiệu ứng xóa hàng: các hàng nháy sáng rồi phần phía trên sập xuống. Xếp 4 hàng hiện dòng chữ "Xếp 4 hàng!", lên cấp và combo từ 2 trở lên cũng có dòng chữ nhỏ. Điểm cộng thêm bay lên ở ô Điểm. Rung nhẹ khi xóa hàng (`navigator.vibrate`, tắt được).
- Kết thúc ván khi khối mới không có chỗ xuất phát, hoặc khi khối khóa hoàn toàn trong vùng ẩn. Lớp phủ kết thúc hiện điểm, số hàng, cấp, báo "Kỷ lục mới!" và cho chọn lại cấp bắt đầu.
- Tự tạm dừng khi trang bị ẩn (chuyển tab, khóa máy, rời cổng) hoặc mất focus. Lớp phủ tạm dừng có Tiếp tục / Ván mới. Mở Cài đặt / Thống kê cũng tạm dừng.
- Tự lưu ván (bàn, khối đang rơi, túi khối, khối giữ, điểm, trạng thái trễ khóa, seed) khi tạm dừng, khi rời trang và mỗi 5 giây; mở lại trang thì ván hiện lại ở trạng thái tạm dừng.
- Thống kê: số ván đã chơi, điểm cao nhất, hàng nhiều nhất, cấp cao nhất, tổng số hàng, số lần xếp 4 hàng. Nút "Đặt lại" phải bấm hai lần để tránh xóa nhầm.
- Màu khối tông ấm hợp bảng màu PlayNine, mỗi khối một màu, có bộ màu riêng cho giao diện tối: I xanh ngọc, O vàng nghệ, T tím mận, S xanh ô liu, Z đỏ gạch, J xanh chàm, L cam.
- Giao diện tiếng Anh (mặc định) / tiếng Việt (xem mục Ngôn ngữ), dark mode theo hệ thống hoặc chọn thủ công (Tự động / Sáng / Tối, áp trước khi vẽ trang để không nháy màu).
- Tối ưu mobile: bàn chơi chiếm hết phần còn lại giữa thanh điểm và cụm nút bấm (`100dvh`, cỡ ô tính lại khi đổi kích thước), không cuộn trang khi chơi, chạy được ở bề rộng 360px, tôn trọng safe-area (tai thỏ). Xoay ngang hoặc màn hình rộng: bàn chơi ở giữa, hai bên là ô giữ / điểm / phím tắt và khối kế tiếp; nút bấm tách thành hai cụm hai bên. Modal dạng bottom sheet trên màn hình hẹp.
- Truy cập bằng bàn phím: mọi nút đều Tab tới được, viền focus rõ ràng, modal giữ focus bên trong và đóng bằng `Esc`, thông báo xếp 4 hàng / lên cấp / kết thúc qua vùng `aria-live`. Tôn trọng `prefers-reduced-motion` (tắt nháy / sập hàng, vệt rơi, điểm bay, chữ hiện tĩnh).

## Điều khiển

| Phím | Chức năng |
| --- | --- |
| `←` `→` | Di chuyển (giữ để lặp) |
| `↓` | Thả nhanh (giữ) |
| `Space` | Thả thẳng |
| `↑` / `X` | Xoay phải |
| `Z` | Xoay trái |
| `C` / `Shift` | Giữ khối |
| `P` / `Esc` | Tạm dừng / tiếp tục |

**Nút bấm cảm ứng** (luôn hiện trên máy cảm ứng, máy tính bật được trong Cài đặt "Luôn hiện nút bấm"): cụm trái cho ngón cái trái là ⤓ thả thẳng ở trên, ◀ ▼ ▶ ở dưới (giống cụm phím mũi tên); cụm phải là Giữ, ⟲ xoay trái và nút ⟳ xoay phải lớn. Mỗi nút tối thiểu 48px, phản hồi ngay khi chạm (`pointerdown`), giữ ◀ ▶ để lặp, giữ ▼ để thả nhanh, không bị zoom khi chạm hai lần.

**Cử chỉ trên bàn chơi** (tắt mặc định, bật trong Cài đặt): chạm để xoay phải, kéo ngang để khối đi theo ngón tay từng ô, kéo chậm xuống để thả nhanh, vuốt nhanh xuống để thả thẳng, vuốt lên để giữ khối.

## Cấu trúc

```
i18n.js      Từ điển tiếng Anh / tiếng Việt và hàm I18N (nạp trước các file JS khác)
index.html   Khung trang, lớp phủ bắt đầu / tạm dừng / kết thúc, nút bấm cảm ứng, modal Cài đặt / Thống kê / Xác nhận
style.css    Giao diện, bảng màu PlayNine, màu khối, dark mode, bố cục dọc / ngang, hiệu ứng
engine.js    Engine thuần (không đụng DOM): túi 7, xoay SRS, va chạm, trọng lực, trễ khóa, xóa hàng, điểm, giữ khối, khôi phục state
app.js       Vẽ canvas, vòng lặp, bàn phím, nút bấm, cử chỉ, lưu trữ, thống kê, tóm tắt cho cổng (cần engine.js nạp trước)
test.js      Test engine chạy bằng Node
icon.svg     Icon app 64x64, dùng luôn làm favicon
```

`engine.js` gắn vào `window.XepGach` khi chạy trong trình duyệt và `module.exports` khi chạy trong Node. Khác 2048, các hàm thao tác (`move`, `rotate`, `softDrop`, `hardDrop`, `hold`, `update`) **sửa trực tiếp** state truyền vào vì game chạy 60 khung hình mỗi giây; cần giữ bản cũ thì gọi `clone()`. State là object thuần, `JSON.stringify` được. Số ngẫu nhiên lấy từ PRNG có seed lưu trong state, nên ván khôi phục ra đúng thứ tự khối như ván gốc và test chạy tất định. `hardDrop` và `update` trả về kết quả khóa khối (các hàng bị xóa, bàn trước khi xóa để chạy hiệu ứng, điểm, combo, thưởng liên tiếp, lên cấp, thua).

Phiên bản app nằm ở hằng `APP_VERSION` đầu `app.js` (hiển thị trong modal Cài đặt). Khi phát hành bản mới, tăng số này và sửa tham số `?v=` của `style.css`, `engine.js`, `app.js` trong `index.html` để trình duyệt tải file mới thay vì dùng bản cache. Trễ khóa (`LOCK_MS`), số lần đặt lại (`MAX_RESETS`), tốc độ thả nhanh (`SOFT_MS`), bảng điểm (`LINE_SCORES`) và các cấp bắt đầu (`START_LEVELS`) nằm ở đầu `engine.js`; DAS / ARR (`DAS_MS`, `ARR_MS`) và thời gian hiệu ứng ở đầu `app.js`. Màu khối là biến CSS `--p-i` … `--p-l` trong `style.css`.

## Dữ liệu lưu trong trình duyệt

Mọi khóa đều có tiền tố `playnine-xepgach-`, mọi truy cập `localStorage` đều bọc `try/catch` (chế độ ẩn danh hoặc bị chặn bộ nhớ thì game vẫn chơi được, chỉ không lưu).

| Khóa | Nội dung |
| --- | --- |
| `playnine-xepgach-settings-v1` | `{ theme: 'auto' \| 'light' \| 'dark', startLevel: 1 \| 5 \| 10, ghost, showPad, gestures, vibrate }` |
| `playnine-xepgach-game-v1` | Ván đang dở: `{ game: <state engine>, counted, bestAtStart }`. Xóa khi ván kết thúc |
| `playnine-xepgach-stats-v1` | `{ played, best, mostLines, highestLevel, totalLines, quads }` |
| `playnine-xepgach-summary-v1` | Tóm tắt cho thẻ game ở cổng PlayNine (xem dưới) |

Tóm tắt cho cổng được ghi lại khi mở trang, khi bắt đầu ván, mỗi 5 giây khi đang chơi, khi tạm dừng (kể cả tự dừng khi ẩn trang), khi rời trang và khi kết thúc ván:

```json
{
  "v": 1,
  "updatedAt": 1792464015482,
  "played": 23,
  "won": 0,
  "note": "Điểm cao nhất 48.200 · 132 hàng",
  "stats": [
    { "value": "48.200", "label": "Điểm cao nhất" },
    { "value": "132", "label": "Hàng nhiều nhất" },
    { "value": "12", "label": "Cấp cao nhất" }
  ],
  "resume": { "title": "Tiếp tục Xếp Gạch", "detail": "Điểm 12.400 · cấp 6", "pct": null },
  "daily": null
}
```

`resume` chỉ khác `null` khi có ván đang chơi hoặc đang tạm dừng (chưa kết thúc). Một ván được tính vào `played` khi khóa khối đầu tiên. Game không có khái niệm thắng nên `won` luôn là 0. `stats` chỉ gồm các mục đã có số liệu (0 đến 3 mục); chưa chơi ván nào thì `note` là dòng giới thiệu.

Đăng ký game ở cổng: thêm một mục vào mảng `GAMES` trong `index.html` của cổng, ví dụ:

```js
{
  id: 'xepgach',
  name: 'Xếp Gạch',
  en: 'Falling blocks',
  dir: 'xepgach/',
  cat: 'puzzle',
  isNew: true,
  desc: 'Xếp các khối rơi cho kín hàng ngang để xóa hàng. Giữ khối, xem trước 3 khối, nút bấm cảm ứng.',
  tags: ['Giải đố', '1 người', 'Chơi nhanh'],
  note: 'Chọn cấp bắt đầu 1, 5 hoặc 10',
  icon: svgIcon,
},
```

## Ngôn ngữ / Language

Giao diện có tiếng Anh (mặc định) và tiếng Việt. Toàn bộ chữ hiển thị nằm trong `i18n.js` (nạp trước `engine.js` và `app.js`), là global `I18N` gồm từ điển `{ en, vi }`, `I18N.t(key, params)` (thiếu bản dịch thì dùng tiếng Anh; `{ one, other }` cho số nhiều tiếng Anh), `I18N.apply()` điền các phần tử có `data-i18n` / `data-i18n-attr`, `I18N.fmtNumber()` định dạng số theo `en-US` / `vi-VN`. Chữ tĩnh trong `index.html` viết sẵn bằng tiếng Anh nên không nháy chữ khi chưa chạy JS. `engine.js` không chứa chữ hiển thị.

Ngôn ngữ lưu ở khóa dùng chung cho cả cổng PlayNine `localStorage['playnine-lang']` (`'en'` | `'vi'`, thiếu hoặc sai thì là `'en'`, không tự đoán theo trình duyệt). Đổi ngôn ngữ trong Cài đặt (hàng "Language" / "Ngôn ngữ") hoặc ở cổng (sự kiện `storage`) thì game tạm dừng, lưu ván rồi tải lại trang; ván đang dở hiện lại ở trạng thái tạm dừng. Tóm tắt cho cổng (`note`, nhãn `stats`, `resume`) được ghi lại theo ngôn ngữ hiện tại mỗi lần mở trang.

## Kiểm tra engine

```bash
node test.js
```

Script kiểm tra: túi 7 (mỗi nhóm 7 khối có đủ 7 loại, 20 seed), vị trí xuất phát, va chạm với tường / đáy / ô đã có, xoay SRS (4 hướng của T, xoay trái là nghịch đảo xoay phải, O không đổi), đá tường của khối I sát tường trái và phải, xoay T vào khe kiểu T-spin bằng độ đá cuối rồi xóa 3 hàng, xóa 1 đến 4 hàng và hàng phía trên dồn xuống (cả khi các hàng xóa không liền nhau), điểm theo cấp 1 / 5 / 10, combo, thưởng liên tiếp, lên cấp, trọng lực theo cấp, quãng rơi và điểm thả thẳng, thả nhanh, luật giữ khối, trễ khóa 500ms và giới hạn 15 lần đặt lại, thua do block out / lock out, lưu và khôi phục qua JSON (chơi tiếp ra đúng như ván gốc), từ chối dữ liệu hỏng, và 200 ván chơi ngẫu nhiên luôn hợp lệ.

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
