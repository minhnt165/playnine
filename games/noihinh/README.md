# Nối Hình

Game Nối Hình (Tile Match, kiểu "xếp 3 hình vào khay" như trên Shopee) chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài. Mở `index.html` là chơi được. Là một game trong cổng PlayNine (chạy trong iframe dưới thanh của cổng).

## Luật chơi

- Các ô xếp chồng nhiều lớp. Ô bị ô lớp trên che (dù chỉ một phần) thì tối màu và chưa chạm được.
- Chạm ô không bị che: ô bay xuống khay 7 chỗ, nằm cạnh ô cùng hình đã có trong khay.
- Khay có 3 ô cùng hình thì 3 ô biến mất. Dọn sạch bàn là qua cấp độ ("Hoàn thành Cấp độ N"), tự sang cấp độ tiếp theo.
- Khay đầy mà không ăn được bộ ba nào là thua. Lúc đó có thể dùng Lấy ra / Thêm ô khay (nếu còn lượt) để chơi tiếp, hoặc chơi lại cấp độ với bàn mới.

## Trợ giúp (mỗi lần chơi một cấp độ)

| Trợ giúp | Lượt | Tác dụng |
| --- | --- | --- |
| Lấy ra | 1 | Đưa 3 ô đầu khay ra hàng chờ phía trên khay; ô ở hàng chờ chạm lại được bất cứ lúc nào. Chỉ dùng khi hàng chờ trống. |
| Hoàn tác | 3 | Trả ô vừa chọn về chỗ cũ (không hoàn tác được ô đã bị ăn). |
| Xáo trộn | 1 | Đổi hình giữa các ô còn trên bàn, giữ nguyên vị trí. |
| Nút **+** trên khay | 1 | Khay thêm một chỗ (7 → 8). |

## Cấp độ

`levelConfig(n)` trong `engine.js`:

- Cấp 1: bàn 3x3, 3 loại hình, một lớp (làm quen).
- Cấp 2: 6x5, hai lớp, 6 loại hình.
- Từ cấp 3: 7 cột, 6–8 hàng, 3–6 lớp, 8–18 loại hình, thêm hai chồng ô ở dưới bàn (chồng trái lộ ô phải nhất, chồng phải lộ ô trái nhất). Cấp càng cao càng nhiều lớp, nhiều loại hình và chồng bên càng dày.

Mỗi lớp lẻ lệch nửa ô so với lớp dưới; vị trí ô trong một lớp đối xứng trái-phải. Toạ độ tính theo đơn vị 1/8 cạnh ô; hai ô che nhau khi lệch dưới 8 đơn vị theo cả hai chiều.

**Luôn giải được:** engine chọn trước một thứ tự gỡ hợp lệ (mỗi bước gỡ một ô đang không bị che), rồi gán hình theo từng cửa sổ 6 hoặc 9 ô của thứ tự đó, mỗi cửa sổ gồm các bộ ba trộn lẫn. Đi đúng thứ tự này thì khay không bao giờ quá 7 ô. Người chơi không thấy thứ tự này; chọn sai vẫn có thể thua.

## Ghi điểm trên cổng

Mỗi lần chơi một cấp độ là một ván (`mode: 'classic'`, xếp hạng theo số ván thắng):

- Bắt đầu cấp độ (kể cả chơi lại): `PlayNine.gameStart({ mode: 'classic' })`. Mở lại trang khi đang chơi dở: `resume: true`.
- Qua cấp độ: `PlayNine.gameEnd({ mode: 'classic', won: true, assisted: false })`.
- Thua: gửi `won: false` khi bấm Chơi lại, hoặc ngay lúc khay đầy nếu không còn trợ giúp nào cứu được.

Trợ giúp là một phần của game nên không tính là `assisted`.

## Cấu trúc

```
index.html  Khung trang, modal
style.css   Giao diện (nền tím pastel, bảng gỗ, khay gỗ, nút xanh lá), dark mode, responsive
engine.js   Engine thuần (không đụng DOM): sinh màn, che / mở, khay, trợ giúp, lưu / khôi phục, PRNG có seed
app.js      Logic game + render (cần engine.js nạp trước)
i18n.js     Từ điển tiếng Anh / tiếng Việt và hàm dịch I18N (nạp trước engine.js, app.js)
test.js     Test engine chạy bằng Node
icon.svg    Icon app 64x64, dùng luôn làm favicon
```

Ô trên bàn, ô ở hàng chờ và ô trong khay đều nằm trong `#layer`, vị trí đặt bằng `transform`, nên ô bay xuống khay bằng transition. Bộ ba bị ăn bay vào khay trước rồi mới biến mất. Hình trên ô là emoji (`ICONS` đầu `app.js`).

## Ngôn ngữ / Language

Giao diện có tiếng Anh (mặc định, tên "Tile Match") và tiếng Việt ("Nối Hình"). Ngôn ngữ lưu ở khóa dùng chung với cổng PlayNine `localStorage['playnine-lang']`; đổi ngôn ngữ thì game lưu ván rồi tải lại trang.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-noihinh-settings-v1` | Cài đặt: giao diện, rung |
| `playnine-noihinh-stats-v1` | Cấp độ đang chơi, số cấp độ đã qua, số lần chơi |
| `playnine-noihinh-save-v1` | Ván đang chơi dở (xóa khi qua cấp độ hoặc khay đầy) |
| `playnine-noihinh-summary-v1` | Tóm tắt cho thẻ game trên cổng PlayNine |

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `Z` | Hoàn tác |
| `O` | Lấy ra |
| `S` | Xáo trộn |
| `+` | Thêm ô khay |
| `R` | Chơi lại cấp độ |
| `Esc` | Đóng hộp thoại |

## Kiểm tra engine

```bash
node test.js
```

Kiểm tra: sinh màn ở mọi cấp (số ô và số hình mỗi loại chia hết cho 3, đi theo lời giải sinh kèm thì luôn thắng ở cấp 1–25), che / mở và chồng bên, chèn khay cạnh ô cùng hình, ăn bộ ba, thua khi khay đầy, ô thứ 7 ăn được bộ ba thì không thua, các trợ giúp, lưu / khôi phục và từ chối JSON hỏng.
