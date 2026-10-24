# Cầu Nối

Game Cầu Nối (Bridges, thể loại đố logic "nối đảo") của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Bàn vuông có các **đảo** (vòng tròn có số). Số trên đảo là số cầu phải nối vào đảo đó.
- Cầu chạy thẳng theo hàng ngang hoặc cột dọc giữa hai đảo nhìn thấy nhau (không có đảo nào chắn giữa). Mỗi cặp đảo có **tối đa 2 cầu**.
- Cầu **không được cắt nhau** và không đi qua đảo khác.
- **Thắng** khi mọi đảo đủ đúng số cầu và mọi đảo **liền một khối**. Mỗi đề chỉ có đúng một lời giải.
- Đảo đủ đúng số cầu chuyển sang màu xanh lá. Tùy chọn **Báo lỗi** tô đỏ đảo thừa cầu và nhóm đảo đã đủ cầu nhưng bị tách khỏi phần còn lại.
- Đồng hồ chạy từ nước đầu tiên, dừng khi tab bị ẩn hoặc đang mở hộp thoại; thời gian nhanh nhất lưu riêng cho từng độ khó.

## Điều khiển

Mỗi lần thêm cầu trên một cặp đảo đi theo vòng **0 → 1 → 2 → 0**. Đặt cầu cắt cầu đã có thì bị chặn: cầu đang chặn nháy đỏ.

- **Kéo** từ một đảo về phía đảo kia (chỉ cần kéo đúng hướng, không cần tới tận nơi): hiện cầu nét đứt trước khi thả.
- **Chạm** lần lượt hai đảo nhìn thấy nhau; chạm một đảo khi đang chọn chính nó thì bỏ chọn. Đảo đang chọn có viền tím, các đảo nối được với nó có viền tím mảnh.
- **Chạm mặt nước** giữa hai đảo cũng thêm cầu cho cặp đó.
- Nút **Hoàn tác** / **Làm lại** (không giới hạn, lưu cùng ván dở), **Xóa hết** (gỡ mọi cầu trong một bước, hoàn tác được), **Gợi ý**.
- Vùng chạm của đảo rộng 0,8 ô quanh tâm (rộng hơn hình vẽ) nên bàn 13×13 trên màn hình 390px (~29px mỗi ô) vẫn chạm dễ; trên điện thoại hẹp bàn chơi lấn vào lề hai bên để to thêm. Không cần thu phóng.

## Gợi ý

Mỗi lần gợi ý đưa một cặp đảo về đúng lời giải: ưu tiên gỡ cầu sai (cũng là cầu hay chặn cầu đúng), rồi tới cặp thiếu cầu ở đảo gần đủ nhất. Cặp vừa sửa được tô tím một lúc. Ván đã dùng gợi ý gửi `assisted: true` cho cổng, không tính kỷ lục trong máy (Thống kê có thêm số đề "tự giải, không gợi ý").

## Cấp độ (mode)

Chọn trong **Cài đặt → Độ khó** (hoặc bấm nhãn độ khó cạnh tên game). Chưa đi nước nào thì đổi ngay; đang giải dở thì áp dụng từ đề sau.

| Mode | Bàn | Số đảo | Báo lỗi mặc định | Điểm / đề |
| --- | --- | --- | --- | --- |
| `s` Dễ | 7×7 | 10–13 | bật | 3 |
| `m` Vừa | 10×10 | 20–25 | tắt | 5 |
| `l` Khó | 13×13 | 32–40 | tắt | 8 |

"Báo lỗi" có ba lựa chọn: Tự động (chỉ bật ở mức Dễ), Bật, Tắt.

## Sinh đề

Engine (`engine.js`) sinh đề theo seed (PRNG mulberry32):

1. Đặt một đảo ngẫu nhiên. Lặp: chọn một đảo và một hướng chưa có cầu, đặt đảo mới cách ít nhất 2 ô trên hướng đó (không đè lên cầu, không kề đảo khác theo hàng / cột), nối bằng 1 hoặc 2 cầu; thỉnh thoảng nối thẳng tới đảo đã có trên đường để tạo vòng. Dừng khi đủ số đảo của mode.
2. Số của mỗi đảo = tổng cầu đã nối, nên cấu hình cầu này là một lời giải (liên thông vì mọc từ một đảo).
3. **Solver đếm nghiệm** (dừng ở 2) chạy trên đề; chỉ giữ đề có đúng 1 nghiệm, không thì thử lại với số ngẫu nhiên tiếp theo.

Solver: mỗi cặp đảo có khoảng `[thấp, cao]` trong 0..2, suy luận theo tổng ở từng đảo, cầu cắt nhau, liên thông (mạng còn khả dĩ phải nối hết đảo; nhóm đã chắc nối mà hết lối ra là chết; nhóm còn đúng một lối ra thì lối đó phải có cầu), rồi rẽ nhánh. `test.js` đối chiếu solver với một solver vét cạn độc lập (cả trên bố cục nhiều nghiệm) và kiểm tra đề duy nhất trên 60 / 40 / 25 seed cho `s` / `m` / `l`.

Thời gian sinh đề đo trong Node (máy dev, 60 seed mỗi mode): `s` ~0,1 ms, `m` ~0,4 ms, `l` ~2 ms trung bình, chậm nhất ~12 ms; trên điện thoại chậm (giả sử chậm hơn ~10 lần) vẫn dưới 150 ms, nên không cần đề sinh sẵn.

## Ghi điểm trên cổng

- Metric `time_low` (giải nhanh nhất), điểm game 5; điểm từng mode như bảng trên.
- Luật chống gian lận `min_time_ms`: `s` 1500, `m` 3500, `l` 6000. Lập luận: mỗi cầu cần ít nhất một thao tác (cầu đôi cần hai); trên 300 seed mỗi mode, đề ít cầu nhất có 9 / 22 / 38 cầu, nhân ~150–160 ms mỗi thao tác (chưa tính thời gian suy nghĩ) ra khoảng 1,4 / 3,5 / 6 giây.
- Mỗi đề là một ván: đề mới `kit.sdk.start(mode)`, mở lại đề dở `kit.sdk.start(mode, true)`.
- Giải xong: `kit.sdk.end({ mode, won: true, timeMs, assisted })`, rồi mời chơi "Đề tiếp".
- Bỏ đề đã đi ít nhất một nước (Ván mới / phím N, có hỏi xác nhận): gửi `won: false`; chưa đi nước nào thì không gửi gì.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-caunoi-settings-v1` | Cài đặt: giao diện, độ khó (`mode`), báo lỗi (`errors`: `auto` / `on` / `off`) |
| `playnine-caunoi-stats-v1` | Thống kê theo độ khó: đã chơi, đã giải, nhanh nhất, tự giải không gợi ý |
| `playnine-caunoi-save-v1` | Đề đang giải dở: đảo, lời giải, cầu đã đặt, lịch sử hoàn tác / làm lại, số nước, đã dùng gợi ý, đồng hồ |
| `playnine-caunoi-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng (đảo trùng / kề nhau, lời giải sai luật, hai cầu cắt nhau, lịch sử sai dạng…) bị bỏ và chia đề mới.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `↓` `→` | Chọn đảo (đảo nối được theo hướng đó, không có thì đảo gần nhất phía đó) |
| `Shift` + mũi tên | Thêm cầu từ đảo đang chọn theo hướng đó |
| `Space` / `Enter` rồi mũi tên | Như trên (bấm `Space` để "giương" hướng, viền đảo thành nét đứt) |
| `Z` / `Ctrl+Z` | Hoàn tác |
| `Y` / `Ctrl+Y` / `Ctrl+Shift+Z` | Làm lại |
| `H` | Gợi ý |
| `N` | Đề mới |
| `Esc` | Bỏ chọn / đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test e2e trong cổng (`e2e.spec.ts`): ván lưu 7×7 bốn đảo số 2 còn thiếu một cầu, chạm hai đảo cuối thì cổng nhận `pn:end` thắng; bỏ đề đã đi nước thì nhận `pn:end` thua.
