# Rót Nước

Game Rót Nước (Water Sort) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Mỗi ống chứa tối đa 4 lớp nước màu.
- Chạm một ống (ống nổi lên), rồi chạm ống khác để rót: **cả khối cùng màu trên cùng** được rót sang, miễn ống đích trống hoặc có màu trên cùng giống, và chỉ rót tới khi ống đích đầy (phần còn lại ở lại ống nguồn).
- Qua màn khi mọi ống trống hoặc đủ 4 lớp cùng một màu (ống xong được đậy nút bần).
- Không ống nào nhận thêm nước được nữa thì hiện hộp **Hết nước đi**: dùng trợ giúp còn lại hoặc chơi lại màn.
- Rót sai (khác màu, ống đầy) thì ống đích rung và kêu báo lỗi, ống đang chọn hạ xuống.

## Cấp độ và trợ giúp

- Màn 1–2 có 3 màu, cứ 2 màn thêm 1 màu, tối đa 12 màu (từ màn 19); luôn có thêm 2 ống trống.
- Màn sinh ngẫu nhiên: xáo 4 lớp mỗi màu vào các ống đầy, bỏ màn có ống xong sẵn hoặc khối 3 lớp cùng màu, rồi chạy solver (DFS có nhớ trạng thái) và chỉ nhận màn giải được. Nếu 200 lần xáo đều hỏng (gần như không xảy ra) thì sinh bằng các bước "rót ngược" từ bàn đã xong, cách này luôn giải được.
- Mỗi màn: **Hoàn tác** 3 lần (không tính là trợ giúp), **+1 ống** 1 lần (thêm một ống trống; dùng thì lượt chơi màn đó tính là có trợ giúp).
- **Chơi lại** đưa màn về bố cục ban đầu (cùng bố cục), trợ giúp đầy lại.
- Ký hiệu trên mỗi màu (tròn, vuông, tam giác…) giúp người mù màu phân biệt; bật / tắt trong Cài đặt (mặc định bật).
- Hiệu ứng rót: ống nguồn bay tới trên ống đích, nghiêng, dòng nước chảy xuống và nước dâng dần. Bật giảm chuyển động thì rót tức thì.

## Ghi điểm trên cổng

- Mỗi lần chơi một màn là một ván, mode `classic`, metric `wins` (4 điểm mỗi màn qua), luật chống gian lận `min_duration_ms: 3000`.
- Màn mới / chơi lại màn: `kit.sdk.start('classic')`; mở lại màn đang dở: `kit.sdk.start('classic', true)`.
- Qua màn: `kit.sdk.end({ mode: 'classic', won: true, timeMs, assisted })`, `assisted` là `true` nếu đã dùng +1 ống.
- Chơi lại màn khi đã rót ít nhất một lần (có hỏi xác nhận): gửi `won: false`. Kẹt mà hết trợ giúp: gửi `won: false` ngay (một lần). Chưa rót lần nào thì không gửi gì.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-rotnuoc-settings-v1` | Cài đặt: giao diện, ký hiệu màu (`symbols`) |
| `playnine-rotnuoc-stats-v1` | `{ played, won, level }`: số lượt chơi, số màn đã qua, màn đang tới |
| `playnine-rotnuoc-save-v1` | Màn đang chơi dở (đã rót ít nhất một lần): `{ v, game, elapsed, reported }` |
| `playnine-rotnuoc-summary-v1` | Tóm tắt cho thẻ game trên cổng |

`game` là ván của engine (`toJSON`): cấp, seed, bố cục ban đầu, các ống, số lượt rót, lịch sử hoàn tác, lượt trợ giúp còn lại, `assisted`. Ván lưu hỏng (sai số màu, ống quá 4 lớp, thiếu ống…) bị bỏ qua và chia màn mới. Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Điều khiển

| Phím | Chức năng |
| --- | --- |
| Chạm / bấm chuột | Chọn ống, rồi chọn ống để rót vào |
| `1`–`9`, `0` | Chọn ống 1–10 |
| Mũi tên + `Enter` / `Space` | Di chuyển giữa các ống và chọn |
| `U` / `Z` | Hoàn tác |
| `T` / `+` | Thêm một ống trống |
| `R` | Chơi lại màn |
| `Esc` | Bỏ chọn ống / đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test engine phủ luật rót, thắng / hết nước, hoàn tác, +1 ống, chơi lại, sinh màn (288 màn ở 24 cấp được solver giải và phát lại bằng luật thật), tốc độ sinh màn 12 màu, lưu / khôi phục và từ chối dữ liệu hỏng. Test Playwright trong cổng: `e2e.spec.ts` (chạy cùng `npm run e2e`).
