# PlayNine Kit

Phần dùng chung cho **game mới** (JS thuần, không bước build): bảng màu sáng/tối của PlayNine, thanh trên, nút, modal, toast, cài đặt, lưu trữ, đa ngôn ngữ, SDK, âm thanh, đồng hồ. Game cũ (21 game đầu) không dùng kit và không phải sửa.

`npm run assemble` chép thư mục này ra `dist/_kit/`, nên game nạp bằng đường dẫn tương đối `../_kit/`. Trang mẫu: `_kit/demo.html` (dev: http://localhost:5180/playnine/_kit/demo.html).

## Nhúng vào game

```html
<head>
  <script>/* áp theme đã lưu trước khi vẽ: đọc playnine-<id>-settings-v1 .theme */</script>
  <link rel="stylesheet" href="../_kit/kit.css?v=1">
  <link rel="stylesheet" href="style.css?v=1.0.0">
</head>
<body>
  ...
  <script src="../_kit/kit.js?v=1"></script>
  <script src="i18n.js?v=1.0.0"></script>      <!-- window.GAME_DICT = { en: {...}, vi: {...} } -->
  <script src="engine.js?v=1.0.0"></script>
  <script src="../sdk/playnine.js?v=2"></script>
  <script src="app.js?v=1.0.0"></script>
</body>
```

`style.css` của game đè token trong `:root` (ví dụ `--accent`, `--bg`) và thêm phần riêng (bàn chơi, quân…). Xem `games/_template/` để có khung đầy đủ.

## API

Phần thuần (có trên `window.PNKit`, và `require('./kit.js')` trong Node để test):

| Hàm | Tác dụng |
| --- | --- |
| `createStore({ gameId, storage })` | `{ keys: { save, stats, settings, summary }, read(key, fallback), write(key, value), remove(key) }`; JSON, nuốt mọi lỗi storage |
| `createTimer({ now })` | `{ running, elapsed(), start(), pause(), resume(), reset(), set(ms) }` (ms cộng dồn) |
| `createI18n({ dict, lang, kitDict })` | `{ lang, t(key, params), fmtNumber(n) }`; thiếu khóa lấy tiếng Anh rồi chính khóa; `{ one, other }` chọn theo `params.n` |
| `buildSummary({ played, won, note, stats, resume, daily, now })` | Tóm tắt cho thẻ game trên cổng (ghi vào `store.keys.summary`) |

`PNKit.init({ gameId, version, dict, defaults, onSetting })` (gọi một lần, cuối `<body>`) trả về `kit`:

| Thuộc tính | Tác dụng |
| --- | --- |
| `kit.store` | như `createStore` với localStorage của trang |
| `kit.settings.get()` / `kit.settings.set(patch)` | cài đặt lưu ở `settings` (luôn có `theme`); `set` gọi `onSetting(key, value)` |
| `kit.theme.apply()` / `kit.theme.set('auto' \| 'light' \| 'dark')` | giao diện; tự theo hệ thống khi `auto` |
| `kit.i18n`, `kit.t` | dịch; `kit.i18n.apply(root?)` điền `data-i18n`, `data-i18n-html`, `data-i18n-attr="attr:key;…"`; `kit.i18n.set('vi')` lưu `playnine-lang` rồi tải lại trang |
| `kit.sdk.start(mode, resume)` / `kit.sdk.end({ mode, won, score?, timeMs?, assisted? })` | báo ván cho cổng; không có SDK thì im lặng |
| `kit.sfx(name, opts)`, `kit.confetti()` | âm thanh / pháo giấy của SDK |
| `kit.modal.open(id)` / `close(id)` / `closeAll()` / `current()` | modal `.modal[hidden]`; Esc đóng (trừ modal có `data-locked`), Tab quẩn trong modal, đóng thì trả focus; nút có `data-open="<id>"` / `data-close="<id>"` tự hoạt động |
| `kit.toast(msg, ms = 1800)` | thông báo nhanh ở `#toast` (tự tạo nếu thiếu) |
| `kit.onLeave(fn)` | gọi khi trang ẩn / đóng / trước khi tải lại vì đổi ngôn ngữ (lưu ván ở đây) |
| `kit.timer()` | `createTimer` theo `performance.now`, tự dừng khi trang ẩn |

Cài đặt tự gắn: `.segmented[data-setting="theme"]`, `.segmented[data-setting="lang"]`, `.segmented[data-setting="<khóa riêng>"]` (nút có `data-value`), `input.switch[data-setting]`, hàng âm thanh `#setting-sound` + `#sw-sound` (ẩn khi không có SDK). `#app-version` nhận chữ "Phiên bản …".

Chuỗi chung của kit có khóa `kit.*` (xem `KIT_DICT` trong `kit.js`); game đè được bằng khóa cùng tên. Game cần `meta.title` và `meta.description` trong dict.

## Đổi kit

Kit dùng chung cho mọi game mới: đổi gì cũng phải giữ tương thích, tăng `KIT_VERSION` và `?v=` trong mọi game dùng kit. Test: `node games/_kit/kit.test.js` và `npx playwright test e2e/kit.spec.ts`.
