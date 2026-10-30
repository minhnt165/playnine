# PlayNine Kit

Phần dùng chung cho **game mới** (JS thuần, không bước build): bảng màu sáng/tối của PlayNine, thanh trên, nút, modal, toast, cài đặt, lưu trữ, đa ngôn ngữ, SDK, âm thanh, đồng hồ. Game cũ (21 game đầu) không dùng kit; 20 game trong số đó nạp `skin.css` sau `style.css` của mình để có cùng phong cách casual game (font, nút nổi, popup, nền cảnh) mà vẫn giữ màu riêng. Cờ Tướng (`xiangqi`, một file) tự chép phong cách đó vào khối `<style>`. Sửa phong cách ở `kit.css` thì xem lại `skin.css` cho khớp.

`npm run assemble` chép thư mục này ra `dist/_kit/`, nên game nạp bằng đường dẫn tương đối `../_kit/`. Trang mẫu: `_kit/demo.html` (dev: http://localhost:5180/playnine/_kit/demo.html).

## Nhúng vào game

```html
<head>
  <script>/* áp theme đã lưu trước khi vẽ: đọc playnine-<id>-settings-v1 .theme */</script>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="../_kit/kit.css?v=3">
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

Giao diện theo phong cách casual game: tiêu đề, số liệu HUD, nút và tiêu đề popup dùng font Baloo 2 (`--font-display`), chữ thường dùng Be Vietnam Pro (`--font`); nút và ô HUD nổi có gờ đáy (`--edge`, `--accent-edge`), bấm thì lún xuống; popup bật ra giữa màn hình; `#modal-win` có ba ngôi sao. Mỗi game đặt `--scene` (màu nhận diện, lấy màu `rgba` đầu tiên trong `preview.bg` của `game.json`) để tô nền cảnh: `:root { --scene: #ffc83d; }`. Không đặt thì nền theo `--accent`.

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

## Bài tây (cards.js)

Phần dùng chung cho game bài (Xì Dách, Xếp Bài Nhện, Ô Trống, Kim Tự Tháp, Ba Đỉnh, Bài Tám, Poker Rút…): mô hình lá, bộ bài, xáo có hạt giống, vẽ mặt / lưng lá, ô trống, lật lá, kéo thả. Trang mẫu: `_kit/cards-demo.html` (mọi mặt lá ở 3 cỡ, lưng, trạng thái, chồng lá, lật, kéo thả, sáng / tối, 4 màu). Test: `node games/_kit/cards.test.js`.

```html
<link rel="stylesheet" href="../_kit/kit.css?v=1">
<link rel="stylesheet" href="../_kit/cards.css?v=1">
<link rel="stylesheet" href="style.css?v=1.0.0">
...
<script src="../_kit/kit.js?v=1"></script>
<script src="../_kit/cards.js?v=1"></script>   <!-- window.PNCards -->
```

Engine của game (chạy trong Node để test) lấy phần thuần bằng: `const C = typeof require === 'function' ? require('../_kit/cards.js') : window.PNCards;`.

### Mô hình lá

- Lá là `{ rank: 1..13, suit: 'S' | 'H' | 'D' | 'C' }` (A = 1, J = 11, Q = 12, K = 13; bích, cơ, rô, nhép). Lưu ván bằng mảng lá hoặc mảng id.
- Id: `'AS'`, `'10H'`, `'KD'` (bậc `A 2..10 J Q K` + chất).
- Nhiều bộ thì id trùng nhau; cần khóa duy nhất (ví dụ phần tử DOM của Nhện) thì dùng chỉ số trong mảng ban đầu.

### Phần thuần (`window.PNCards`, `require('./cards.js')`)

| Hàm | Tác dụng |
| --- | --- |
| `SUITS`, `RANKS` | `['S','H','D','C']`, `[1..13]` |
| `toId(card)` | `{ rank: 10, suit: 'H' }` → `'10H'` |
| `fromId(id)` | `'10H'` → lá; nhận chữ thường, `'T'` = 10; sai định dạng → `null` |
| `isCard(x)` | lá hợp lệ hay không (kiểm ván lưu) |
| `newDeck({ decks = 1, suits = 4 })` | bộ bài CHƯA xáo, tổng `52 × decks` lá, thứ tự cố định bộ → chất → A..K. `suits`: mảng chất hoặc số `1` (bích) / `2` (bích + cơ) / `4`; ít chất thì lặp cho đủ lá. Nhện: `newDeck({ decks: 2, suits: 1 })` (hoặc `2`, `4`) = 104 lá. `4 × decks` phải chia hết cho số chất, sai thì ném lỗi |
| `shuffle(cards, rng = Math.random)` | Fisher–Yates, trả **mảng mới** (không đụng mảng vào) |
| `rng(seed)` | mulberry32; `seed` là số, chuỗi (ví dụ ngày `'2026-10-23'` cho thử thách ngày) hoặc bỏ trống (ngẫu nhiên). Trả hàm `r()` → `[0, 1)`, kèm `r.int(n)` → `0..n-1`, `r.getState()` → số nguyên 32 bit (ghi vào ván lưu), `r.setState(s)` → chạy tiếp đúng dãy số |
| `isRed(x)`, `color(x)` | cơ / rô là đỏ; `color` → `'red'` hoặc `'black'`. Nhận lá hoặc chữ chất. Luật màu luôn theo hàm này, kể cả khi bật bài 4 màu |
| `rankLabel(x)` | `1` → `'A'`, `10` → `'10'`, `13` → `'K'` (nhận lá hoặc số) |
| `suitSymbol(x)` | `'S'` → `'♠'` (nhận lá hoặc chữ chất) |
| `cardName(card, lang)` | tên cho trình đọc màn hình: `'Queen of hearts'` / `'Đầm cơ'`; `card` null → `'Face-down card'` / `'Lá úp'` |

Kết quả `shuffle(newDeck(), rng(seed))` đã khóa trong test: đổi thuật toán là vỡ ván lưu và thử thách ngày. Lưu ván đang dùng rng: ghi `r.getState()`; mở lại thì `const r = PNCards.rng(); r.setState(saved.rng);`.

### Vẽ lá

| Hàm | Tác dụng |
| --- | --- |
| `render(card, { faceUp = true, size, label, className })` | trả **phần tử** `<div class="pnc …">` (khuyên dùng). `card` null → lá úp không biết mặt (lá tẩy của nhà cái), không lật lên được |
| `html(card, opts)` | cùng cấu trúc nhưng là **chuỗi HTML**, cho game dựng bàn bằng `innerHTML` |
| `slot({ label, size, className })` | ô trống cùng cỡ lá, viền đứt; `label` mờ ở giữa (`'A'`, `'K'`, `'♥'`…) |
| `cardOf(el)` | đọc lá từ phần tử (hoặc phần tử con) qua `data-id`; lá null → `null` |
| `flip(el, faceUp?, { duration = 300 })` | lật (bỏ trống `faceUp` = đảo), trả `Promise<el>`; giảm chuyển động thì đổi ngay. Chỉ animate phần con, không đụng `transform` của `.pnc` (game đặt vị trí bằng transform vẫn được). Nhãn đọc màn hình tự đổi theo mặt |
| `drag(container, opts)` | kéo thả, xem bên dưới |
| `ensureSprite()` | chèn sprite hình chất vào trang; tự gọi khi tải và khi vẽ, chỉ cần gọi lại nếu game xóa sạch `<body>` |

- `size`: số (px) hoặc chuỗi CSS (`'12vw'`), đặt `--card-w` trên chính lá. Thường để trống và đặt `--card-w` một lần trên bàn chơi (tính theo khung như `xepbai`).
- `label`: mặc định là tên lá theo `<html lang>` (`en` / `vi`), lá úp là "Lá úp"; truyền chuỗi để dùng nhãn riêng (flip không đổi nhãn riêng); `false` để không gắn `role="img"` / `aria-label`.
- Cấu trúc: `.pnc` (+ `.pnc-up` khi ngửa, `.pnc-s-S|H|D|C`, `.pnc-red|black`, `data-id`) chứa `.pnc-face` và `.pnc-back`. Ngửa / úp chỉ là lớp `pnc-up`: đổi bằng `classList` cũng được (không hiệu ứng).
- Cỡ: rộng `var(--card-w, 72px)`, cao = 1,4 × rộng (`aspect-ratio`); mọi chi tiết bên trong tính theo cqw nên cân đối ở mọi cỡ.
- Dải trên (bậc bên trái, chất nhỏ bên phải) nằm trọn trong `0,36 × --card-w`: chồng lá ngửa lệch nhau ít nhất `0,36 × rộng` là đọc được; lá úp lệch khoảng `0,14 × rộng`.
- Lá hẹp hơn 70px vẽ một chất lớn (đọc rõ từ 40px); từ 70px vẽ chấm như bài thật. J / Q / K: khung viền vàng, hình mũ / vương miện và chất. Thêm `.cards-simple` trên phần tử cha để luôn vẽ chất lớn.
- Mặt lá luôn sáng (dịu hơn ở giao diện tối); chất đỏ / đen / xanh đều đạt tương phản ≥ 5,3 : 1 với mặt lá. Lưng lá tím PlayNine, lưới chéo, viền trong, sao ở giữa.

### Lớp trạng thái và tùy chọn

| Lớp | Đặt ở | Tác dụng |
| --- | --- | --- |
| `pnc-selected` | `.pnc` | viền tím + nhấc nhẹ (lá đang chọn / đang cầm) |
| `pnc-highlight` | `.pnc` | viền hổ phách phát sáng (gợi ý, lá đi được) |
| `pnc-disabled` | `.pnc` | phủ tối, không đổi độ trong (lá bị khóa, không đi được) |
| `pnc-over` | đích thả bất kỳ | viền tím; `drag` tự gắn / gỡ khi đang kéo tới |
| `cards-4color` | `<html>` hoặc bàn chơi | bài 4 màu (rô xanh dương, nhép xanh lá), chỉ đổi màu hiển thị |
| `cards-simple` | `<html>` hoặc bàn chơi | luôn vẽ một chất lớn thay cho chấm |

Biến màu game đè được trong `style.css`: `--pnc-face`, `--pnc-edge`, `--pnc-black`, `--pnc-red`, `--pnc-blue`, `--pnc-green`, `--pnc-gold`, `--pnc-back-1`, `--pnc-back-2`, `--pnc-ring` (mặc định `--accent`), `--pnc-hl`…

### Kéo thả

```js
const dnd = PNCards.drag(boardEl, {
  canPick: (el) => canPickHere(el) && stackFrom(el),            // false | true | [el, ...lá phía trên]
  canDrop: (el, target, els) => canMoveTo(el, target.dataset.drop),
  onDrop: (el, target, els) => { applyMove(el, target); render(); }, // trả false = từ chối, lá bay về
  onCancel: (el, els) => kit.sfx('nope'),
});
```

`drag(container, opts)` → `{ cancel(), destroy(), active }`:

- Pointer events (chuột, cảm ứng, bút), chỉ ngón / nút chính. Di chuyển dưới `opts.threshold` (6px) là chạm: `click` chạy bình thường (game xử lý chạm để chọn lá). Đã kéo thì `click` ngay sau đó bị nuốt.
- `canPick(el, ev)`: `false` không nhấc; `true` nhấc lá đó; mảng phần tử thì nhấc cả nhóm (chồng lá). Bỏ trống = nhấc được mọi lá.
- Lá được nhấc ẩn đi (`pnc-lifted`), bản sao (`.pnc-ghost`) đi theo ngón tay, nghiêng nhẹ, bóng sâu.
- Đích: phần tử khớp `opts.targets` (mặc định `[data-drop]`) trong `container`, thường là cột / ô của game. Ngón tay nằm trên đích hợp lệ thì chọn đích đó; không thì chọn đích hợp lệ giao nhiều nhất với lá đầu (≥ 20% diện tích lá). `canDrop` trả `false` thì đích bị bỏ qua.
- `onDrop(el, target, els)`: game cập nhật ván và vẽ lại; trả `false` là từ chối. Nhận: nếu `el` còn trong trang thì bản sao bay tới chỗ mới, game dựng lại phần tử khác thì bản sao biến mất. Từ chối, thả ra ngoài, Esc, `pointercancel`: bản sao bay về chỗ cũ và gọi `onCancel`.
- `opts.cards` (mặc định `.pnc`) đổi selector phần tử kéo được; `opts.onStart(el, els)` gọi khi bắt đầu kéo.
- Trong `container`, lá có `touch-action: none` (vuốt trên lá không cuộn trang). Giảm chuyển động: không bay, không nghiêng.
- Vẫn nên có cách chơi không cần kéo (chạm chọn rồi chạm đích, bàn phím) như `xepbai`.

### Đổi cards.js

Bảy game đợt 3 dựa vào API trên: chỉ được thêm, không đổi nghĩa hay tên lớp. Đổi gì cũng tăng `CARDS_VERSION` và `?v=` ở mọi game dùng, chạy `node games/_kit/cards.test.js` và mở `cards-demo.html` kiểm tra bằng mắt.
