# Rắn Săn Mồi

Game rắn săn mồi chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài. Mở `index.html` là chơi được. Là một game của cổng PlayNine (chạy trong iframe dưới thanh của cổng), nhưng cũng chạy độc lập.

## Tính năng

- Màn hình bắt đầu: chọn chế độ, bản đồ (khi chơi Mê cung), tốc độ, kích thước bàn rồi bấm **Bắt đầu**. Hiện điểm cao nhất của tổ hợp chế độ + tốc độ đang chọn. Lựa chọn được nhớ cho lần sau.
- Ba chế độ:
  - **Cổ điển**: chạm tường là thua (viền bàn là tường liền).
  - **Xuyên tường**: đi qua mép bàn để sang phía đối diện (viền bàn là nét đứt).
  - **Mê cung**: có chướng ngại vật và tường. Bốn bản đồ cố định: Bốn góc, Hành lang, Cột đôi, Pháo đài. Bản đồ tính theo kích thước bàn nên dùng được cho cả 15x15, 20x20, 25x25; luôn chừa chỗ xuất phát và mọi ô trống đều thông nhau.
- Bàn 15x15, 20x20 (mặc định), 25x25. Vẽ trên `<canvas>` theo `devicePixelRatio` nên nét sắc trên màn hình độ phân giải cao.
- Tốc độ Chậm / Vừa / Nhanh (170 / 125 / 88 ms mỗi bước). Bật **Tăng tốc dần** (mặc định bật) thì mỗi mồi ăn được rút ngắn bước 1,8%, tối đa còn 55% thời gian ban đầu.
- Rắn trượt mượt giữa hai bước (nội suy vị trí đầu và đuôi theo thời gian), thân bo tròn, chuyển màu từ vàng (đầu) sang xanh lá (đuôi), thon dần về đuôi; đầu có mắt nhìn theo hướng đi, thè lưỡi khi đang chạy, mắt thành dấu "x" khi thua. Ở chế độ Xuyên tường thân rắn vắt qua mép hiện liền mạch ở cả hai phía.
- Mồi là **quả xoài** vẽ trên canvas (không dùng emoji): +10 điểm, dài thêm 1 đốt.
- **Quả vải thưởng** xuất hiện sau mỗi 5–8 quả xoài, tồn tại 5 giây, có vòng đếm ngược quanh quả (chuyển đỏ và nhấp nháy khi sắp hết giờ): +50 điểm, dài thêm 2 đốt.
- Hàng đợi hướng: giữ tối đa 2 lần đổi hướng giữa hai bước, nên bấm nhanh "lên rồi trái" để quay đầu chữ U không bị mất lệnh. Lệnh quay ngược vào cổ (so với lệnh cuối trong hàng đợi) bị bỏ qua.
- Đi vào ô mà đuôi đang rời đi là hợp lệ (trừ khi rắn đang mọc dài, lúc đó đuôi đứng yên).
- Phủ kín mọi ô trống là thắng ("Lấp kín cả bàn!").
- Điều khiển:
  - Bàn phím: phím mũi tên hoặc WASD để lái, `Space` / `P` tạm dừng hoặc chơi tiếp, `Esc` tạm dừng, `N` ván mới.
  - Cảm ứng: vuốt ở bất kỳ đâu trên vùng bàn chơi. Hướng đổi ngay khi ngón tay đi đủ 18px (không đợi nhả tay), và có thể vuốt tiếp sang hướng khác trong cùng một lần chạm.
  - Nút điều hướng trên màn hình (4 nút lớn dạng chữ T ngược, `touch-action: manipulation`, nhận lệnh ngay lúc chạm). Mặc định hiện trên máy cảm ứng, bật / tắt trong Cài đặt.
  - Rung khi ăn mồi và khi thua (bật / tắt trong Cài đặt, nếu máy hỗ trợ).
- Sau khi bấm Bắt đầu, rắn đứng chờ đến khi người chơi bấm hướng đầu tiên (hoặc `Space`) để kịp đặt tay.
- Tạm dừng: lớp phủ "Tạm dừng" với Tiếp tục / Ván mới. Tự tạm dừng khi ẩn trang (chuyển tab, khóa máy) và khi mở Cài đặt / Thống kê.
- Thua: lớp phủ hiện nguyên nhân (đâm tường / tự cắn / đâm chướng ngại), điểm, độ dài, điểm cao nhất, nhãn "Kỷ lục mới!" nếu phá kỷ lục, nút **Chơi lại** (cùng chế độ) và **Đổi chế độ** (về màn hình bắt đầu). Lớp phủ hiện sau 0,65 giây để kịp thấy chỗ va chạm.
- Tự lưu ván đang dở khi tạm dừng, khi ẩn / rời trang và mỗi 4 giây khi đang chơi; mở lại trang thì ván hiện ở trạng thái tạm dừng.
- Hỏi lại trước khi bỏ ván đang dở (bấm Ván mới).
- Điểm cao nhất riêng cho từng tổ hợp chế độ + tốc độ (9 ô). Thống kê: số ván đã chơi, tổng số mồi đã ăn, rắn dài nhất, điểm cao nhất, bảng điểm cao nhất theo chế độ và tốc độ. Nút "Đặt lại" phải bấm hai lần để tránh xóa nhầm.
- Giao diện tiếng Việt, dark mode theo hệ thống hoặc chọn thủ công (Tự động / Sáng / Tối, áp trước khi vẽ trang để không nháy màu). Màu bàn chơi, chướng ngại và rắn lấy từ biến CSS nên đổi theo giao diện.
- Tối ưu mobile: bàn chơi là hình vuông lớn nhất vừa phần còn lại của màn hình (`100dvh` + container query) nên không phải cuộn khi chơi; chạy được ở bề rộng 360px; tôn trọng safe-area (tai thỏ); layout riêng khi xoay ngang (HUD và nút điều hướng bên trái, bàn chơi bên phải); modal dạng bottom sheet trên màn hình hẹp.
- Truy cập bằng bàn phím: mọi nút đều Tab tới được, viền focus rõ ràng, nhóm lựa chọn là radio group (phím mũi tên để chọn), modal giữ focus bên trong và đóng bằng `Esc`, thông báo bắt đầu / tạm dừng / thua / mồi thưởng qua vùng `aria-live`. Tôn trọng `prefers-reduced-motion`: tắt nhịp phồng của mồi, hiệu ứng ăn mồi, lưỡi rắn, "+N", nhấp nháy và các hiệu ứng mờ dần (rắn vẫn trượt mượt vì đó là chuyển động chính của trò chơi).

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| Phím mũi tên / `W` `A` `S` `D` | Lái rắn (bấm lần đầu để bắt đầu) |
| `Space` / `P` | Tạm dừng / chơi tiếp |
| `Esc` | Tạm dừng; đóng hộp thoại |
| `N` | Ván mới |

## Cấu trúc

```
i18n.js      Từ điển tiếng Anh / tiếng Việt và hàm dịch I18N (nạp trước engine.js)
index.html   Khung trang, màn hình bắt đầu, lớp phủ tạm dừng / thua, nút điều hướng, modal Cài đặt / Thống kê / Xác nhận
style.css    Giao diện, bảng màu PlayNine, màu bàn chơi / rắn, dark mode, responsive
engine.js    Engine thuần (không đụng DOM): bước đi, hàng đợi hướng, va chạm, sinh mồi, mồi thưởng, tốc độ, bản đồ, khôi phục state
app.js       Vẽ canvas (nội suy chuyển động), vòng lặp, bàn phím, vuốt, nút điều hướng, lưu trữ, thống kê, tóm tắt cho cổng (cần engine.js nạp trước)
test.js      Test engine chạy bằng Node
icon.svg     Icon app 64x64, dùng luôn làm favicon
```

`engine.js` gắn vào `window.GameRan` khi chạy trong trình duyệt và `module.exports` khi chạy trong Node. Mọi hàm nhận state và trả về state mới, không sửa state cũ. State là object thuần (lưu thẳng bằng `JSON.stringify`). Thân rắn là mảng chỉ số ô (`hàng * n + cột`), phần tử đầu là đầu rắn. `step(state)` đi một bước và trả về thêm các sự kiện (`ate`, `gained`, `died`, `won`, `bonusSpawned`, `bonusExpired`) để giao diện chạy hiệu ứng; `turn(state, dir)` thêm lệnh vào hàng đợi; `tickMs(state)` cho biết độ dài bước hiện tại. Vòng lặp trong `app.js` dùng `requestAnimationFrame` với bộ đếm thời gian tích lũy, xử lý tối đa 4 bước mỗi khung hình khi máy giật.

Phiên bản app nằm ở hằng `APP_VERSION` đầu `app.js` (hiển thị trong modal Cài đặt). Khi phát hành bản mới, tăng số này và sửa tham số `?v=` của `style.css`, `i18n.js`, `engine.js`, `app.js` trong `index.html` để trình duyệt tải file mới thay vì dùng bản cache. Tốc độ (`BASE_MS`, `ACCEL_STEP`, `ACCEL_MIN`), điểm (`FOOD_POINTS`, `BONUS_POINTS`), mồi thưởng (`BONUS_MS`, `BONUS_EVERY_MIN`, `BONUS_EVERY_MAX`, `BONUS_GROW`), kích thước bàn (`SIZES`) và mã bản đồ (`MAPS`) nằm ở đầu `engine.js`; ngưỡng vuốt (`SWIPE_MIN`), chu kỳ lưu (`SAVE_EVERY`) ở đầu `app.js`.

## Ngôn ngữ / Language

Giao diện có tiếng Anh (mặc định) và tiếng Việt. Toàn bộ chữ hiển thị nằm trong từ điển `{ en, vi }` của `i18n.js`; `engine.js` chỉ giữ mã chế độ / tốc độ / bản đồ, không chứa chữ. `index.html` viết sẵn bằng tiếng Anh và gắn `data-i18n` (chữ), `data-i18n-html` (chuỗi có `<b>` / `<kbd>`), `data-i18n-attr` (`aria-label`, `title`...); `app.js` gọi `I18N.apply()` lúc khởi động và dùng `I18N.t(key, params)` cho mọi chữ sinh bằng JS (trạng thái, thông báo, lớp phủ, thống kê, tóm tắt cho cổng). Số định dạng theo `en-US` / `vi-VN` qua `I18N.fmtNumber`.

Ngôn ngữ lưu ở khóa dùng chung `playnine-lang` (`en` | `vi`, thiếu hoặc sai thì là `en`), dùng chung với cổng PlayNine và các game khác. Đổi ở mục **Ngôn ngữ** trong Cài đặt: game lưu ván (ván đang dở mở lại ở trạng thái tạm dừng) rồi tải lại trang. Khi trang khác đổi khóa này, sự kiện `storage` làm game lưu ván rồi tải lại theo. Tóm tắt cho cổng được ghi lại ngay khi mở game nên chữ trong đó luôn theo ngôn ngữ hiện tại.

## Dữ liệu lưu trong trình duyệt

Mọi khóa đều có tiền tố `playnine-ran-`, mọi truy cập `localStorage` đều bọc `try/catch` (chế độ ẩn danh hoặc bị chặn bộ nhớ thì game vẫn chơi được, chỉ không lưu).

| Khóa | Nội dung |
| --- | --- |
| `playnine-ran-settings-v1` | `{ theme, mode, speed, size, map, accel, dpad, vibrate }` (`dpad` là `null` khi chưa chọn: theo loại màn hình) |
| `playnine-ran-game-v1` | Ván đang dở: `{ game: <state engine>, counted }`. Xóa khi ván kết thúc hoặc bị bỏ |
| `playnine-ran-stats-v1` | `{ played, food, longest, bestFood, bestFoodMode, best: { 'classic-slow', ..., 'maze-fast' } }` |
| `playnine-ran-summary-v1` | Tóm tắt cho thẻ game ở cổng PlayNine (xem dưới) |

Tóm tắt cho cổng được ghi khi bắt đầu ván, mỗi 4 giây khi đang chơi, khi tạm dừng, khi thua / thắng và khi rời trang:

```json
{
  "v": 1,
  "updatedAt": 1792467354697,
  "played": 37,
  "won": 0,
  "note": "Kỷ lục 84 mồi · chế độ Cổ điển",
  "stats": [
    { "value": "2.310", "label": "Điểm cao nhất" },
    { "value": "64", "label": "Rắn dài nhất" },
    { "value": "812", "label": "Mồi đã ăn" }
  ],
  "resume": { "title": "Tiếp tục Rắn Săn Mồi", "detail": "Dài 23 · 1.240 điểm", "pct": null },
  "daily": null
}
```

`resume` chỉ khác `null` khi có ván đang dở (rắn đã chạy ít nhất một bước và chưa thua). Chế độ Xuyên tường / Mê cung thêm tên chế độ vào đầu `detail`, ví dụ `Mê cung · Dài 9 · 1.240 điểm`. Một ván được tính vào `played` khi rắn bắt đầu chạy. `won` luôn là `0` (trò chơi không có khái niệm thắng / thua theo ván; lấp kín bàn gần như không xảy ra). `note` lấy kỷ lục số mồi ăn được trong một ván và chế độ của ván đó.

## Kiểm tra engine

```bash
node test.js
```

Script kiểm tra: đi đủ bốn hướng, bỏ qua lệnh quay ngược vào cổ và lệnh trùng hướng, hàng đợi tối đa 2 lệnh (lệnh thứ hai so với lệnh trước trong hàng đợi), ăn mồi dài ra và cộng điểm, mồi thưởng (điểm, dài thêm 2, hết hạn đúng số bước, xuất hiện sau 5–8 mồi), tăng tốc dần có giới hạn, đâm tường cả bốn cạnh ở Cổ điển, xuyên tường cả bốn cạnh, đâm chướng ngại ở Mê cung (mọi bản đồ ở mọi kích thước chừa chỗ xuất phát và thông nhau), tự cắn mình, đi vào ô đuôi đang rời đi là hợp lệ (và là cắn đuôi khi đang mọc dài), mồi / mồi thưởng không bao giờ sinh trên thân rắn hay chướng ngại (2.000 lần trên bàn gần kín, 30 ván Mê cung ăn liên tục), phủ kín bàn là thắng, lưu và khôi phục qua JSON (đi tiếp giống hệt), dữ liệu hỏng trả về `null`, và 300 ván chơi ngẫu nhiên luôn hợp lệ.

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
