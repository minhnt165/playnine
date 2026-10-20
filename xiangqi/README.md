# Cờ Tướng (Xiangqi)

Game cờ tướng chạy trên trình duyệt, gói gọn trong một file `index.html` (HTML + CSS + JavaScript thuần, không thư viện ngoài).

## Tính năng

- Bàn cờ 9x10 vẽ bằng SVG, có sông và cung tướng, quân cờ chữ Hán.
- Luật đi đầy đủ: Tướng/Sĩ trong cung, Tượng không qua sông và bị cản mắt, Mã bị cản chân, Pháo ăn qua đúng một ngòi, Tốt qua sông mới được đi ngang, hai tướng không được đối mặt, không được tự đưa tướng vào thế bị chiếu.
- Phát hiện chiếu tướng, chiếu bí, hết nước đi và thông báo người thắng.
- Luật lặp và hòa: chiếu mãi thì bên chiếu thua; lặp thế cờ 3 lần, 60 nước không ăn quân, hoặc hai bên không còn quân tấn công thì hòa.
- Chơi với máy (người cầm Đỏ) hoặc hai người trên cùng máy.
- AI negamax + alpha-beta + tìm kiếm tĩnh, tìm kiếm sâu dần theo giới hạn thời gian, chạy trong Web Worker nên không treo giao diện. 3 mức độ khó (0,3 s / 1 s / 3 s).
- Highlight nước đi hợp lệ, đánh dấu nước vừa đi, undo (kể cả khi máy đang nghĩ), ván mới, đổi chế độ.
- Xem lại ván: bấm vào nước trong biên bản hoặc dùng nút ⏮ ◀ ▶ ⏭ (phím Home / ← / → / End).
- Responsive, chơi được trên điện thoại và máy tính.
- Icon tab đổi theo trạng thái ván (đến lượt bạn, máy đang nghĩ, bị chiếu, thắng / thua / hòa), tiêu đề tab đổi theo. Có icon màn hình chính cho iOS (`icon-180.png`) và Android (`manifest.webmanifest`).

## Chạy

Mở `index.html` bằng trình duyệt, hoặc bật GitHub Pages cho repo này (Settings → Pages → Deploy from branch `main`, folder `/`).

## Kiểm thử

```
node test.js
```

Trích hai khối `rules` và `ai` từ `index.html` để chạy perft, kiểm tra Zobrist hash, luật lặp / hòa và AI (giới hạn thời gian, tìm nước thắng, tránh chiếu mãi).

## Tạo lại icon

Các file `icon-*.png` và `favicon-32.png` được vẽ từ hàm `Favicon.svg()` trong `index.html`. Sau khi sửa hình icon, chạy (cần Google Chrome và `npm i playwright-core`):

```
node tools/make-icons.js
```

## Cấu trúc mã

`index.html` gồm ba khối `<script>` độc lập:

| Khối | Nội dung |
| --- | --- |
| `rules` | Biểu diễn bàn cờ, sinh nước đi, kiểm tra chiếu, nước hợp lệ, Zobrist hash, luật lặp / hòa, trạng thái ván |
| `ai` | Lượng giá (bảng điểm vị trí), negamax alpha-beta, quiescence, tìm kiếm sâu dần có giới hạn thời gian, lọc nước thua theo luật ở gốc |
| `ui` | Vẽ SVG, âm thanh, Web Worker (tạo từ Blob ghép hai khối trên), xử lý click, điều khiển ván, undo, xem lại ván, chế độ chơi |

Bộ sinh nước đi đã được kiểm tra bằng perft từ thế ban đầu: 44 / 1920 / 79666 / 3290240 (độ sâu 1–4), khớp với số liệu chuẩn của cờ tướng.
