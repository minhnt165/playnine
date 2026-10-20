# Ô Ăn Quan

Game Ô Ăn Quan (trò chơi dân gian Việt Nam họ mancala) chạy trên web, viết bằng HTML + CSS + JavaScript thuần. Không framework, không bước build, không thư viện ngoài. Mở `index.html` là chơi được.

## Luật chơi

Game dùng bộ luật phổ biến hiện nay:

- Bàn có 2 hàng, mỗi hàng 5 ô dân, hai đầu là 2 ô quan hình bán nguyệt (12 ô). Đầu ván mỗi ô dân có 5 dân, mỗi ô quan có 1 viên quan lớn. Dân tính 1 điểm, quan tính 10 điểm (đổi được 5 / 10 / 15 trong Cài đặt).
- Hàng dưới là của bạn (hoặc Người 1), hàng trên của máy (hoặc Người 2).
- Đến lượt, chọn một ô dân còn quân ở hàng mình (không bao giờ chọn ô quan) và một hướng. Bốc hết quân trong ô, rải lần lượt mỗi ô một viên theo hướng đó, đi qua ô quan cũng thả một viên.
- Rải xong viên cuối, xét ô ngay sau:
  - Là ô dân còn quân: bốc ô đó lên, rải tiếp cùng hướng.
  - Là ô dân trống và ô kế tiếp có quân: ăn hết ô đó (kể cả ô quan, ăn ô quan là được cả viên quan). Nếu sau ô vừa ăn lại là một ô dân trống rồi một ô có quân thì ăn tiếp (ăn dây), cứ thế tới khi không ăn được nữa.
  - Là ô quan (còn hay hết quân đều vậy), hoặc hai ô trống liền nhau: hết lượt.
- Quan non (bật mặc định, tắt được trong Cài đặt): ô quan còn viên quan mà có ít hơn 5 dân thì chưa được ăn, lượt kết thúc ngay tại đó. Ô quan đã mất quan thì không còn là quan non.
- Rải quân: đến lượt mà cả 5 ô của mình đều trống, người chơi lấy 5 dân đã ăn rải lại mỗi ô một viên (từ trái sang phải). Có ít hơn 5 dân thì vay đối thủ phần còn thiếu; nợ được trừ vào điểm của bên vay và cộng cho bên cho vay khi hết ván. Hai bên vay qua lại thì trừ bù cho nhau.
- Hết ván khi cả hai ô quan không còn quân (đã mất quan và không còn dân). Mỗi bên thu số dân còn trên hàng mình. Ai nhiều điểm hơn thắng, bằng điểm thì hòa.

### Các điểm luật game tự chọn

- Ô quan không bao giờ được coi là "ô trống" để ăn cách: gặp ô quan ngay sau viên cuối thì hết lượt, trong lúc ăn dây gặp ô quan ở vị trí ô trống thì dừng. Ô quan chỉ có thể là ô bị ăn.
- Ô dân có thể là ô của bất kỳ bên nào khi rải tiếp và khi ăn.
- Rải quân chỉ dùng dân đã ăn, không đổi quan ra dân. Vay chỉ vay dân của đối thủ.
- Nếu đến lượt mà hàng mình trống, cả mình lẫn đối thủ đều không còn dân đã ăn để rải (rất hiếm) thì ván dừng: mỗi bên thu dân trên hàng mình, phần còn trong ô quan không tính cho ai.
- Một lượt rải tiếp quá 120 lần thì dừng (chống vòng lặp vô tận, thực tế gần như không gặp).

## Tính năng

- Hai chế độ: Người vs Máy (chọn bạn đi trước hoặc máy đi trước) và Hai người trên cùng máy.
- AI minimax cắt tỉa alpha-beta trên hiệu số điểm, chạy trong Web Worker nên không treo giao diện. 3 mức: Dễ (tính 1–2 lượt, cộng nhiễu ngẫu nhiên nên hay chọn lệch), Vừa (tính 4 lượt), Khó (đào sâu dần trong khoảng 1,5 giây). Máy bắt đầu nghĩ ngay trong lúc hiệu ứng rải của bạn đang chạy, hiện "Máy đang nghĩ…", rồi cho thấy ô và hướng nó chọn trước khi rải.
- Bàn gỗ khắc ô, sỏi dân vẽ bằng CSS rải ngẫu nhiên nhưng cố định theo từng ô, viên quan to hơn hẳn; mọi ô đều có số đếm.
- Chạm một ô của mình, hai nút mũi tên lớn hiện ngay trên ô để chọn hướng (hoặc phím `←` / `→`).
- Hiệu ứng rải từng viên (khoảng 180 ms/viên), có chip số quân đang cầm; ô bị ăn sáng đỏ và số điểm bay về thẻ người chơi; báo rõ vì sao hết lượt (gặp ô quan, hai ô trống, quan non). Tốc độ Chậm / Vừa / Nhanh / Tắt hiệu ứng; đang rải thì chạm bất kỳ đâu trên sân (hoặc `Space`) để bỏ qua.
- Thẻ người chơi hiện số quan, số dân đã ăn, số nợ (nếu có), tổng điểm và lượt đi.
- Nhật ký nước đi ("Bạn: ô 3 → phải, ăn 7"), kể cả lần rải quân, vay và tổng kết cuối ván. Ô được đánh số 1–5 từ trái sang phải trên màn hình, hướng trái / phải cũng theo màn hình.
- Đi lại: khi đấu máy thì gỡ nước của bạn cùng nước đáp của máy (kể cả khi máy đang nghĩ hoặc đang rải). Ván mới chọn chế độ, mức máy, lượt đi đầu.
- Hướng dẫn "Cách chơi" 6 bước có hình minh họa vẽ bằng SVG, tự mở ở lần đầu vào game, sau đó mở bằng nút "?" (hoặc phím `H`).
- Thống kê theo mức máy: số ván, thắng, thua, hòa; chuỗi thắng dài nhất; điểm cao nhất khi đấu máy; số ván hai người. Có nút đặt lại (bấm hai lần để xác nhận). Ván bỏ dở không tính vào thống kê.
- Tự lưu ván đang chơi, mở lại trang thì tiếp tục (kể cả khi đang tới lượt máy). Luật (quan non, giá trị quan) lưu cùng ván nên đổi luật giữa chừng chỉ áp dụng từ ván sau.
- Cài đặt giao diện Tự động / Sáng / Tối, áp trước khi vẽ trang để không nháy màu.
- Tối ưu mobile: dùng `100dvh`, không cuộn trang khi chơi ở 360 x 640, ô dân khoảng 44 px ở bề rộng 360 px, modal dạng bottom sheet, layout ngang (bàn bên trái, cột lượt / nút / nhật ký bên phải) khi màn hình rộng, tôn trọng safe-area.
- Điều khiển bằng bàn phím với tiêu điểm hiển thị rõ; tắt chuyển động khi hệ thống bật giảm chuyển động (vẫn rải từng bước nhưng không bay, không nhấp nháy).

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` / `→` | Di chuyển giữa 5 ô của bạn (hàng chỉ có một điểm dừng Tab) |
| `Enter` / `Space` | Cầm ô đang chọn (bấm lại để bỏ) |
| `←` / `→` khi đang cầm ô | Rải sang trái / phải |
| `Esc` | Bỏ chọn ô, đóng hộp thoại |
| `Space` khi đang rải | Bỏ qua hiệu ứng |
| `Z` / `Ctrl+Z` | Đi lại |
| `N` | Ván mới |
| `H` / `?` | Cách chơi |

## Cấu trúc

```
index.html  Khung trang, modal
style.css   Giao diện, màu PlayNine, bàn gỗ, dark mode, responsive
engine.js   Luật chơi + AI minimax, không đụng DOM (chạy trong trình duyệt, Node và Web Worker)
app.js      Logic game, hiệu ứng, render (cần engine.js nạp trước)
test.js     Test engine và AI chạy bằng Node
icon.svg    Icon app, dùng làm favicon
```

Toàn bộ engine nằm trong hàm `OanQuanFactory`. `app.js` dựng Web Worker từ Blob chứa `OanQuan.factory.toString()`, nên máy vẫn nghĩ trong worker khi mở game bằng `file://`. Nếu trình duyệt không tạo được worker, máy tính trên luồng chính.

`OanQuan.play(state, move, events)` trả về diễn biến từng bước (`pick`, `drop`, `capture`, `stop`, `scatter`, `collect`, `over`) để giao diện vẽ lại hiệu ứng. Ván được lưu dưới dạng danh sách nước đi và dựng lại bằng `fromMoves`, nên Đi lại và khôi phục ván luôn khớp luật.

Phiên bản app nằm ở hằng `APP_VERSION` đầu `app.js` (hiển thị trong modal Cài đặt). Khi phát hành bản mới, tăng số này và sửa tham số `?v=` của `style.css`, `engine.js`, `app.js` trong `index.html`. Độ sâu, nhiễu và thời gian nghĩ của từng mức máy nằm trong `LEVELS` ở `engine.js`.

## Dữ liệu lưu trong trình duyệt

| Khóa `localStorage` | Nội dung |
| --- | --- |
| `playnine-oanquan-settings-v1` | Giao diện, tốc độ rải, quan non, giá trị quan, chế độ, mức máy, lượt đi đầu, đã xem hướng dẫn chưa |
| `playnine-oanquan-save-v1` | Ván đang chơi (luật của ván + danh sách nước đi) |
| `playnine-oanquan-stats-v1` | Thống kê theo mức, chuỗi thắng, điểm cao nhất, ván hai người |
| `playnine-oanquan-summary-v1` | Tóm tắt cho thẻ game trên cổng PlayNine (`v`, `played`, `won`, `note`, `stats`, `resume`, `daily`) |

## Kiểm tra engine

```bash
node test.js
```

Kiểm tra rải theo hai hướng, đi qua ô quan, rải tiếp, ăn một ô, ăn dây, dừng khi gặp ô quan (còn hay hết quân), hai ô trống, quan non bật / tắt, giá trị quan, rải quân khi hết dân, vay và trả nợ, trừ bù nợ, ván kẹt, hết ván và thu quân, hòa, dựng lại ván từ danh sách nước, 500 ván ngẫu nhiên bảo toàn đủ 50 dân và 2 quan, AI chọn nước ăn dây được quan, mức Khó trả nước hợp lệ trong khoảng 1,5 giây, Khó không thua Dễ.

## Chạy cục bộ

Mở trực tiếp `index.html` bằng trình duyệt, hoặc chạy một static server bất kỳ:

```bash
npx serve .
```

Mọi đường dẫn trong dự án đều là đường dẫn tương đối nên chạy được ở bất kỳ sub-path nào.
