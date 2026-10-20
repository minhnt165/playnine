# Phá Gạch

Game phá gạch chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài. Mở `index.html` là chơi được. Là một game của cổng PlayNine (chạy trong iframe dưới thanh của cổng), nhưng cũng chạy độc lập.

## Tính năng

- Thanh đỡ ở đáy, bóng, tường gạch. Đập vỡ hết gạch phá được để qua màn; bóng rơi khỏi đáy là mất một mạng. Ván có 3 mạng (tối đa 5).
- Sân logic cố định 400 x 560 (tỉ lệ 5:7), co giãn vừa khung và vẽ trên `<canvas>` theo `devicePixelRatio` nên nét sắc trên màn hình độ phân giải cao. Gạch vẽ sẵn ra một lớp riêng, chỉ vẽ lại khi có viên gạch đổi.
- **10 màn vẽ tay** (mảng chuỗi trong `engine.js`): Khởi động, Kim tự tháp, Gạch cứng, Tường thép, Bàn cờ, Pháo đài, Mắt lưới, Trái tim, Hành lang, Thành trì. Hết màn 10 là **phá đảo**, trò chơi quay lại màn 1 ("vòng 2") với bóng nhanh hơn.
- Ba loại gạch:
  - **Gạch thường** (7 màu lấy từ bộ màu khối của Xếp Gạch): vỡ sau 1 lần đập.
  - **Gạch cứng**: 2 hoặc 3 lần đập, hiện vết nứt sau mỗi lần (vết nứt cố định theo vị trí viên gạch).
  - **Gạch thép**: không vỡ, không cần phá để qua màn.
- Góc nảy theo vị trí chạm thanh: giữa thanh bóng đi thẳng lên, mép thanh nảy lệch 60° so với phương thẳng đứng (tuyến tính ở giữa). Bóng chờ trên thanh lúc đầu mỗi mạng, phóng bằng `Space` / chạm / nhấp chuột.
- Tốc độ bóng 320 px/giây ở màn 1, mỗi màn nhanh hơn 6%; trong một màn mỗi lần chạm thanh nhanh thêm 0,6% (tối đa +12%); trần 640 px/giây.
- **Va chạm chắc chắn**: bóng (hình tròn) được quét theo quãng đường đi trong mỗi bước với hình chữ nhật của gạch / thanh (tổng Minkowski: 4 cạnh dịch ra bán kính bóng và 4 cung tròn ở góc), lấy va chạm sớm nhất, nảy, rồi đi tiếp phần thời gian còn lại (tối đa 8 lần va chạm mỗi bước). Bóng nhanh mấy cũng không xuyên gạch. Góc gạch cho pháp tuyến chéo; khe giữa hai viên kề nhau nảy phẳng; góc trong (hai viên vuông góc) nảy cả hai trục.
- Bóng luôn lệch khỏi phương ngang ít nhất 15° (không chạy gần như ngang mãi giữa hai tường). Nếu bóng nảy 24 lần liền giữa tường / thép mà không chạm thanh hay gạch phá được, hướng bóng bị bẻ ngẫu nhiên 8–16°.
- **5 vật phẩm** rơi từ gạch vỡ (gạch thường có 12% rơi, một số viên đánh dấu trong dữ liệu màn luôn rơi; tối đa 3 vật phẩm cùng rơi). Đỡ bằng thanh để nhận (+25 điểm):
  - **Mở rộng thanh**: thanh 72 → 112 px trong 15 giây.
  - **Nhiều bóng**: mỗi bóng tách thành ba (lệch ±25°), tối đa 12 bóng. Còn một bóng trên sân là chưa mất mạng.
  - **Bóng chậm**: còn 65% tốc độ trong 12 giây.
  - **Bóng xuyên**: trong 8 giây bóng phá ngay mọi gạch phá được (kể cả gạch cứng) và đi xuyên qua, chỉ nảy ở thép; bóng đổi màu lửa, có vệt sau.
  - **Thêm mạng**: +1 mạng (tối đa 5; đủ 5 mạng thì không rơi loại này).
  - Vật phẩm có thời hạn hiện ở góc trên phải sân: biểu tượng, thanh thời gian còn lại, số giây; nhấp nháy 2 giây cuối. Mất mạng hoặc qua màn thì mọi vật phẩm hết tác dụng.
- Điểm: gạch thường 10, gạch cứng 30 / 50, đập nứt gạch cứng 5, vật phẩm 25, qua màn thưởng 100 x số màn. **Chuỗi**: đập gạch liên tiếp mà bóng chưa về thanh thì nhân điểm x2 từ lần đập thứ 5, x3 từ lần thứ 9..., tối đa x5 (hiện "Chuỗi x3" ở giữa dải trên).
- Hiệu ứng: mảnh vỡ màu viên gạch, rung màn hình nhẹ khi vỡ gạch và mạnh hơn khi mất mạng, điểm bay lên tại viên gạch (màu vàng khi có nhân chuỗi), dòng chữ "Màn 3 · Tường thép" khi vào màn và "Qua màn 3!" khi qua màn (dừng 1,5 giây rồi sang màn mới), điểm thưởng bay lên ở ô Điểm. Rung máy khi đỡ vật phẩm, qua màn, mất mạng (`navigator.vibrate`, tắt được).
- Vòng lặp bước cố định: vật lý chạy đúng 120 bước / giây bất kể tần số màn hình, tối đa 12 bước mỗi khung hình (máy giật thì bỏ bớt, không dồn).
- Tự tạm dừng khi trang bị ẩn (chuyển tab, khóa máy, rời cổng) hoặc mất focus, và khi mở Cách chơi / Cài đặt / Thống kê. Lớp phủ tạm dừng có Tiếp tục / Ván mới. Hỏi lại trước khi bỏ ván đang dở.
- Tự lưu ván (gạch còn lại, bóng, vật phẩm đang rơi, thời gian vật phẩm, điểm, mạng, seed) khi tạm dừng, khi rời trang và mỗi 4 giây khi đang chơi; mở lại trang thì ván hiện ở trạng thái tạm dừng. Số ngẫu nhiên lấy từ PRNG có seed lưu trong state nên ván khôi phục rơi vật phẩm giống hệt ván gốc.
- Thống kê: số ván đã chơi, điểm cao nhất, màn cao nhất, tổng số gạch đã phá, chuỗi dài nhất, số lần phá đảo. Nút "Đặt lại" phải bấm hai lần để tránh xóa nhầm.
- "Cách chơi" tự mở ở lần đầu vào game, xem lại bằng nút **?** hoặc trong Cài đặt.
- Giao diện tiếng Việt, dark mode theo hệ thống hoặc chọn thủ công (Tự động / Sáng / Tối, áp trước khi vẽ trang để không nháy màu). Màu sân, gạch, thanh, bóng, vật phẩm lấy từ biến CSS nên đổi theo giao diện.
- Tối ưu mobile: sân là hình chữ nhật 5:7 lớn nhất vừa phần còn lại của màn hình (`100dvh` + container query) nên không phải cuộn khi chơi; chạy được ở 360 x 640; tôn trọng safe-area (tai thỏ); layout riêng khi xoay ngang (thanh trên và điểm bên trái, sân bên phải); modal dạng bottom sheet trên màn hình hẹp.
- Truy cập bằng bàn phím: mọi nút đều Tab tới được, viền focus rõ ràng, modal giữ focus bên trong và đóng bằng `Esc`, thông báo vào màn / qua màn / mất mạng / vật phẩm / kết thúc qua vùng `aria-live`. Tôn trọng `prefers-reduced-motion`: tắt mảnh vỡ, rung màn hình, điểm bay, vệt bóng xuyên, nhấp nháy và các hiệu ứng mờ dần (bóng vẫn chạy mượt vì đó là chuyển động chính của trò chơi).

## Điều khiển

| Phím | Chức năng |
| --- | --- |
| `←` `→` / `A` `D` | Di chuyển thanh (giữ phím) |
| `Space` / `Enter` | Phóng bóng (khi tạm dừng: chơi tiếp) |
| `P` | Tạm dừng / chơi tiếp |
| `Esc` | Tạm dừng |
| `N` | Ván mới |
| `H` / `?` | Cách chơi |

**Chuột**: thanh đi theo vị trí chuột trên vùng bàn chơi, nhấp để phóng bóng. Bấm phím mũi tên thì phím giành quyền điều khiển cho tới khi rê chuột lại.

**Cảm ứng**: kéo ngang ở bất kỳ đâu trên vùng bàn chơi, thanh đi theo **khoảng kéo** (tương đối, không cần chạm đúng thanh nên ngón tay không che bóng); kéo quá tường thì mốc được dời để kéo ngược lại là thanh đi ngay. Chạm nhẹ (dưới 0,3 giây, lệch dưới 10px) để phóng bóng. Độ nhạy khi kéo chọn trong Cài đặt: Chậm / Vừa / Nhanh (1 px ngón tay = 1,1 / 1,5 / 2,1 px sân theo bề ngang).

## Cấu trúc

```
index.html   Khung trang, lớp phủ bắt đầu / tạm dừng / kết thúc, modal Cách chơi / Cài đặt / Thống kê / Xác nhận
i18n.js      Từ điển tiếng Anh / tiếng Việt và đối tượng I18N (nạp trước engine.js)
style.css    Giao diện, bảng màu PlayNine, màu gạch / vật phẩm, dark mode, bố cục dọc / ngang, hiệu ứng
engine.js    Engine thuần (không đụng DOM): dữ liệu 10 màn, va chạm quét, bóng, thanh, gạch, vật phẩm, mạng, điểm, khôi phục state
app.js       Vẽ canvas, vòng lặp bước cố định, bàn phím / chuột / cảm ứng, hiệu ứng, lưu trữ, thống kê, tóm tắt cho cổng (cần engine.js nạp trước)
test.js      Test engine chạy bằng Node
icon.svg     Icon app 64x64, dùng luôn làm favicon
```

`engine.js` gắn vào `window.PhaGach` khi chạy trong trình duyệt và `module.exports` khi chạy trong Node. Giống Xếp Gạch, các hàm thao tác (`step`, `launch`, `nextLevel`, `applyPower`) **sửa trực tiếp** state truyền vào vì game chạy 120 bước mỗi giây. State là object thuần, `JSON.stringify` được. `step(state, { dir, target, launch })` chạy một bước 1/120 giây và trả về các sự kiện của bước đó (gạch vỡ / nứt kèm toạ độ và điểm, chạm thép, chạm thanh, vật phẩm đỡ được / hết hạn, mất bóng, mất mạng, hết ván, qua màn và điểm thưởng) để app chạy hiệu ứng.

Dữ liệu màn là mảng chuỗi 10 ký tự mỗi hàng (tối đa 12 hàng): `.` ô trống, `r o y g c b p` gạch thường theo màu, chữ hoa cùng màu là gạch chắc chắn rơi vật phẩm, `2` / `3` gạch cứng, `#` thép. Thêm màn mới: thêm một mảng vào `LEVELS`, một tên vào `LEVEL_NAMES` và tên hiển thị `level.N` (tiếng Anh và tiếng Việt) trong `i18n.js`; `node test.js` kiểm tra kích thước, ký tự, và mọi viên gạch phá được đều tới được (thép không bao kín).

Phiên bản app nằm ở hằng `APP_VERSION` đầu `app.js` (hiển thị trong modal Cài đặt). Khi phát hành bản mới, tăng số này và sửa tham số `?v=` của `style.css`, `i18n.js`, `engine.js`, `app.js` trong `index.html` để trình duyệt tải file mới thay vì dùng bản cache. Tốc độ, kích thước, điểm, tỉ lệ rơi và thời hạn vật phẩm nằm ở đầu `engine.js`; thời gian qua màn, chu kỳ lưu và độ nhạy kéo ở đầu `app.js`. Màu gạch là biến CSS `--b-r` … `--b-p`, `--b-strong`, `--b-strong3`, `--b-steel`; màu vật phẩm là `--pw-*` trong `style.css`.

## Ngôn ngữ / Language

Game có tiếng Anh (mặc định) và tiếng Việt. Toàn bộ chữ hiển thị nằm trong `i18n.js` (nạp trước `engine.js` và `app.js`), dạng từ điển `{ en: {...}, vi: {...} }` với key ngắn kiểu `settings.theme`, `banner.cleared`. `i18n.js` tạo đối tượng `I18N`: `I18N.t(key, params)` (thiếu key ở `vi` thì lấy `en`, thay `{tên}` bằng `params`, số nhiều tiếng Anh dạng `{ one, other }` theo `params.n`), `I18N.apply()` điền chữ cho `[data-i18n]`, `[data-i18n-html]`, `[data-i18n-attr]` và cập nhật `<title>` / meta description, `I18N.set(lang)` lưu ngôn ngữ rồi tải lại trang, `I18N.fmtNumber` định dạng số theo `en-US` / `vi-VN`.

Ngôn ngữ lưu ở khóa dùng chung `playnine-lang` (`'en'` hoặc `'vi'`, thiếu / sai thì là `'en'`), chung cho cổng PlayNine và mọi game. Đổi trong Cài đặt (hàng "Language", hai lựa chọn English / Tiếng Việt) thì game tạm dừng, lưu ván rồi tải lại; đổi ở cổng hoặc trang khác thì game nhận sự kiện `storage` và tự tải lại theo. Chữ vẽ trên canvas (chuỗi `Combo x2`, tên vật phẩm bay lên khi đỡ được) và dòng chữ vào màn / qua màn cũng lấy từ `i18n.js`. Tóm tắt cho cổng (`note`, nhãn thống kê, `resume`) được ghi theo ngôn ngữ hiện tại và ghi lại mỗi lần mở game. `POWER_NAMES` / `LEVEL_NAMES` trong `engine.js` không còn được app dùng để hiển thị; tên màn và tên vật phẩm lấy từ `level.N` và `power.*` trong `i18n.js`.

## Dữ liệu lưu trong trình duyệt

Mọi khóa đều có tiền tố `playnine-phagach-`, mọi truy cập `localStorage` đều bọc `try/catch` (chế độ ẩn danh hoặc bị chặn bộ nhớ thì game vẫn chơi được, chỉ không lưu).

| Khóa | Nội dung |
| --- | --- |
| `playnine-phagach-settings-v1` | `{ theme: 'auto' \| 'light' \| 'dark', sens: 'low' \| 'normal' \| 'high', vibrate, guideSeen }` |
| `playnine-phagach-save-v1` | Ván đang dở: `{ game: <state engine>, counted, bestAtStart }`. Xóa khi ván kết thúc hoặc bị bỏ |
| `playnine-phagach-stats-v1` | `{ played, best, highestLevel, bricks, bestChain, won }` |
| `playnine-phagach-summary-v1` | Tóm tắt cho thẻ game ở cổng PlayNine (xem dưới) |

Tóm tắt cho cổng được ghi khi mở trang, khi bắt đầu ván, mỗi 4 giây khi đang chơi, khi qua màn, khi mất mạng, khi tạm dừng (kể cả tự dừng khi ẩn trang), khi rời trang và khi kết thúc ván:

```json
{
  "v": 1,
  "updatedAt": 1792467354697,
  "played": 12,
  "won": 1,
  "note": "Điểm cao nhất 8.430 · tới màn 7",
  "stats": [
    { "value": "8.430", "label": "Điểm cao nhất" },
    { "value": "7", "label": "Màn cao nhất" },
    { "value": "1.204", "label": "Gạch đã phá" }
  ],
  "resume": { "title": "Tiếp tục Phá Gạch", "detail": "Màn 4 · 2.150 điểm · 2 mạng", "pct": null },
  "daily": null
}
```

`resume` chỉ khác `null` khi có ván đang dở (đã phóng bóng ít nhất một lần và chưa hết mạng). Một ván được tính vào `played` khi phóng bóng lần đầu. `won` là số lần phá đảo (qua đủ 10 màn trong một ván). `stats` chỉ gồm các mục đã có số liệu (0 đến 3 mục); chưa chơi ván nào thì `note` là dòng giới thiệu.

Đăng ký game ở cổng: thêm một mục vào mảng `GAMES` trong `index.html` của cổng, ví dụ:

```js
{
  id: 'phagach',
  name: 'Phá Gạch',
  en: 'Brick Breaker',
  dir: 'phagach/',
  cat: 'arcade',
  isNew: true,
  desc: 'Đỡ bóng bằng thanh trượt, phá hết tường gạch qua 10 màn. Có gạch cứng, gạch thép và 5 loại vật phẩm.',
  tags: ['Phản xạ', '1 người', 'Kỷ lục'],
  note: 'Đập gạch liên tiếp để nhân điểm',
  icon: svgIcon,
},
```

## Kiểm tra engine

```bash
node test.js
```

Script kiểm tra: dữ liệu 10 màn (kích thước, ký tự, có gạch phá được, không có hàng thép kín, mọi viên gạch phá được đều tới được), ba loại gạch và gạch đánh dấu rơi vật phẩm, bóng chờ đi theo thanh và thanh dừng ở tường, phóng bóng, góc nảy theo vị trí chạm thanh (giữa thẳng, mép 60°, đối xứng, kẹp ngoài mép) cả khi bóng rơi thật vào thanh, chạm thanh ngắt chuỗi và tăng tốc có giới hạn, nảy tường trái / phải / trần / góc sân, góc tối thiểu 15° (cả khi chạy step 1.200 bước), bẻ hướng khi bóng nảy mãi giữa thép và trần, đập gạch từ dưới / trên / trái / phải, đập vào góc (pháp tuyến chéo) và sượt qua góc, khe giữa hai viên kề nhau, góc trong, gạch cứng 2 / 3 lần đập và điểm, gạch thép không vỡ và không tính khi qua màn, nhân điểm theo chuỗi, **không xuyên gạch** (300 lần bóng 2.000–30.000 px/giây nảy trong lưới gạch bị nhốt bởi sàn thép, kiểm tra từng bước), **không xuyên thanh** (500 lần bóng 1.000–60.000 px/giây lao xuống thanh theo hướng ngẫu nhiên), thanh trượt ngang vào bóng, từng vật phẩm (đỡ / rơi mất, mở rộng thanh và hết hạn đúng 15 giây, bóng chậm, bóng xuyên phá gạch cứng nhưng nảy ở thép, nhiều bóng và giới hạn 12, thêm mạng và giới hạn 5), tỉ lệ rơi khoảng 12% và đủ 5 loại, mất bóng phụ không mất mạng, mất mạng (xóa vật phẩm, bóng mới chờ), hết mạng, qua màn (thưởng, sang màn kế, quay vòng sau màn 10), tốc độ tăng dần theo màn có trần, lưu và khôi phục qua JSON (chơi tiếp giống hệt ván gốc), từ chối dữ liệu hỏng, và 200 ván tự chơi luôn hợp lệ.

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
