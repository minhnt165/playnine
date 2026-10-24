# Vòng Kín

Game Vòng Kín (Loop the Loop, thể loại "Slitherlink") của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Bàn là một lưới điểm; một số ô có số 0–3.
- Vẽ **một vòng khép kín duy nhất** đi theo các cạnh của lưới: không tự cắt, không tự chạm, không rẽ nhánh.
- Số trong ô = số cạnh của ô đó nằm trên vòng. Ô không có số thì bao nhiêu cũng được.
- **Thắng** khi các đường đã vẽ tạo đúng một vòng kín thỏa mọi số (dấu × không ảnh hưởng). Mỗi đề chỉ có một lời giải.
- Đồng hồ chạy từ lúc đề hiện ra, dừng khi mở hộp thoại hoặc ẩn tab; thời gian giải nhanh nhất lưu riêng cho từng mức. Ván có dùng gợi ý không tính kỷ lục.

## Điều khiển

- **Chạm một cạnh**: trống → đường → dấu × ("không thuộc vòng") → trống. Chuột phải: trống / đường → ×, × → trống.
- **Kéo** từ điểm này qua các điểm khác để vẽ nhiều cạnh một lúc (cả nét là một bước hoàn tác). Nét bắt đầu trên một đường có sẵn thì thành nét xóa; kéo lùi lại thì hoàn cạnh vừa vẽ. Kéo bằng chuột phải thì đánh dấu × hàng loạt.
- Số đã đủ cạnh mờ đi; điểm có từ 3 đường trở lên luôn hiện đỏ.
- **Báo lỗi** (Cài đặt, mặc định "Chỉ mức Dễ"): tô đỏ số thừa cạnh hoặc không thể đủ (bị × quá nhiều), đầu cụt (điểm có một đường mà các hướng còn lại đều bị chặn), vòng con khép sớm. Chỉ dựa vào luật, không so với lời giải nên không tính là trợ giúp.
- **Gợi ý**: sửa một cạnh vẽ sai, hoặc thêm một cạnh của lời giải (ưu tiên nối dài đường đang có); cạnh đó nháy vàng. Ván có gợi ý gửi `assisted: true`.
- Hoàn tác / làm lại không giới hạn, lưu cả trong ván dở.

| Phím | Chức năng |
| --- | --- |
| `←` `↑` `↓` `→` | Di chuyển con trỏ trên các điểm |
| `Shift` + mũi tên | Vẽ đường theo hướng đó (xóa nếu đã có) và đi theo nó |
| `X` + mũi tên | Bật / tắt dấu × trên cạnh theo hướng đó (giữ `X` hoặc bấm `X` một lần rồi bấm mũi tên) |
| `Z` / `Ctrl+Z` | Hoàn tác |
| `Y` / `Ctrl+Y` / `Ctrl+Shift+Z` | Làm lại |
| `H` | Gợi ý |
| `N` | Đề mới |
| `Esc` | Đóng hộp thoại / bỏ chế độ × |

## Mức (mode)

Chọn trong **Cài đặt → Độ khó** hoặc bấm ô **Mức** trên HUD. Chưa đi nước nào thì đổi ngay; đang giải dở thì hỏi trước (bỏ đề tính là thua).

| Mode | Bàn | Suy luận cần dùng | Số trung bình | Điểm / đề |
| --- | --- | --- | --- | --- |
| `s` Dễ | 5×5 | Lan truyền luật cơ bản, không phải thử | ~12 | 3 |
| `m` Vừa | 7×7 | Thêm "thử một cạnh, thấy mâu thuẫn thì loại" | ~18 | 5 |
| `l` Khó | 10×10 | Như Vừa, bàn lớn | ~37 | 8 |

## Sinh đề

`engine.js` sinh đề theo seed (PRNG mulberry32), ngay trên máy người chơi:

1. **Vòng ngẫu nhiên**: nuôi một vùng ô liền nhau (40–58% bàn), mỗi lần thêm một ô kề vùng (ưu tiên ô chỉ kề một ô để vòng ngoằn ngoèo), giữ điều kiện phần ngoài vẫn nối ra viền (không lỗ) và không có hai ô chạm chéo kiểu bàn cờ. Biên của vùng là đúng một vòng kín không tự chạm.
2. Ghi số cho mọi ô, rồi **gỡ số theo thứ tự ngẫu nhiên**: gỡ một số mà đề vẫn giải được tới hết bằng suy luận ở mức của mode thì bỏ hẳn, không thì trả lại. Suy luận chỉ dùng luật đúng nên giải tới hết = lời giải duy nhất.
3. Suy luận (solver): lan truyền ràng buộc trên cạnh (đường / không) — số của ô, bậc 0 hoặc 2 ở mỗi điểm, không khép vòng sớm (theo dõi hai đầu của từng đoạn đường); mức Vừa / Khó thêm thử-sai một bước.

**Solver đếm nghiệm** (`countSolutions`, dừng ở 2): lan truyền + suy luận trong / ngoài vòng (union-find chẵn lẻ trên các ô) + thử-sai một bước ở mỗi nút + kiểm tra mọi đường còn nối được với nhau, rồi quay lui. `test.js` đối chiếu nó với vét cạn mọi vòng trên bàn 3×3 và 4×4 (400 đề ngẫu nhiên), rồi kiểm tra nghiệm duy nhất của đề sinh ra ở mọi mode (60 / 30 / 15 seed; khi viết đã chạy thêm 1000 / 400 / 200 seed, không đề nào có hai nghiệm).

Thời gian sinh một đề (đo trên Node 24 / Chromium, máy văn phòng; "chậm ×4 / ×6" là Chromium giả lập CPU chậm 4 / 6 lần):

| Mode | Node: trung vị / p95 / chậm nhất | Chromium chậm ×4 | Chromium chậm ×6 |
| --- | --- | --- | --- |
| `s` | 0,2 / 0,3 / 2 ms | 1 / 2 / 3 ms | 1 / 2 / 4 ms |
| `m` | 4 / 7 / 10 ms | 15 / 32 / 36 ms | 24 / 48 / 53 ms |
| `l` | 18 / 32 / 54 ms | 100 / 227 / 235 ms | 151 / 310 / 333 ms |

Vì đủ nhanh nên không cần đề sinh sẵn (`puzzles.js`).

## Ghi điểm trên cổng

- Metric `time_low` (giải nhanh nhất), điểm game 5; điểm từng mode như bảng trên.
- `min_time_ms`: Dễ 2000, Vừa 4000, Khó 8000. Vòng ngắn nhất mà bộ sinh tạo ra dài 14 / 26 / 54 cạnh (đo trên 1000 / 400 / 200 seed); kể cả biết sẵn đáp án và kéo một mạch, mỗi cạnh cũng cần ~150 ms, chưa tính thời gian đọc đề.
- Mỗi đề là một ván: đề mới `kit.sdk.start(mode)`, mở lại đề dở `kit.sdk.start(mode, true)`.
- Giải xong: `kit.sdk.end({ mode, won: true, timeMs, assisted })` (`assisted` = đã dùng gợi ý).
- Bỏ đề đã đi ít nhất một nước (Đề mới / đổi mức, có hỏi xác nhận): gửi `won: false`; chưa đi nước nào thì không gửi gì.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-vongkin-settings-v1` | Cài đặt: giao diện, mức (`mode`), báo lỗi (`errors`: `auto` / `on` / `off`), đã xem hướng dẫn (`guideSeen`) |
| `playnine-vongkin-stats-v1` | Đã chơi, đã giải, chuỗi thắng, kỷ lục từng mức |
| `playnine-vongkin-save-v1` | Đề đang giải dở: số, lời giải, trạng thái các cạnh, lịch sử hoàn tác / làm lại, số gợi ý, thời gian |
| `playnine-vongkin-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng (sai cỡ, số không khớp lời giải, lời giải không phải một vòng hợp lệ, lịch sử sai dạng…) bị bỏ và chia đề mới.

## Kiểm tra

```bash
node test.js
```

Test e2e trong cổng (`e2e.spec.ts`): ván lưu 5×5 còn thiếu một cạnh, chạm nốt thì cổng nhận `pn:end` thắng; bỏ đề đã đi nước thì nhận `pn:end` thua; đổi mức trước nước đầu thì chỉ có `pn:start` mới.
