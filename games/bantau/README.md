# Bắn Tàu

Game Bắn Tàu (Sea Battle, thể loại "đánh chìm tàu" cổ điển) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Mỗi bên có vùng biển 10×10 (cột A–J, hàng 1–10) và năm tàu: Tàu sân bay 5, Thiết giáp hạm 4, Tuần dương hạm 3, Tàu ngầm 3, Khu trục hạm 2 (17 ô).
- Tàu nằm thẳng, ngang hoặc dọc, **không chạm nhau kể cả chéo góc** (luật phổ biến ở châu Âu / Việt Nam; giúp suy luận rõ ràng hơn).
- Bạn bắn trước, sau đó hai bên **luân phiên mỗi lượt một phát**, bắn trúng cũng không được bắn tiếp (luật quốc tế cổ điển). Lý do chọn: nhịp ván đều, người chơi không phải ngồi chờ máy bắn một chuỗi dài; so sánh mức máy bằng số phát trung bình là công bằng; thời gian tối thiểu của ván dễ ước lượng (xem phần ghi điểm).
- Mỗi phát được báo: trượt, trúng hay chìm. Tàu bị đánh chìm hiện ra (hai bên đều thấy).
- Vì tàu không chạm nhau nên các ô **chéo** cạnh ô trúng và **mọi ô quanh tàu đã chìm** chắc chắn là nước: game tự đánh chấm nhỏ cho cả hai bên và không cho bắn vào đó.
- **Thắng:** đánh chìm cả năm tàu địch trước. Không có hòa (bên bắn phát chìm cuối cùng thắng ngay). Không có đi lại / gợi ý.

## Điều khiển

**Xếp tàu** (đầu mỗi ván, đội tàu được xếp ngẫu nhiên sẵn):

- Kéo tàu để dời chỗ; thả vào chỗ chạm tàu khác thì tàu bay về (ô xem trước đỏ / xanh khi kéo). Thả về bến để cất tàu.
- Chạm một tàu để chọn, chạm lần nữa để xoay (chật thì tìm chỗ gần nhất xoay được). Đang chọn một tàu, chạm ô biển trống để dời tàu tới đó.
- Nút **Xoay**, **Ngẫu nhiên**, **Dọn** (cất hết về bến, rồi kéo từ bến ra biển hoặc chạm tàu ở bến để đặt), chọn mức máy, **Vào trận** (chỉ bật khi đủ năm tàu hợp lệ).

**Trận:** chạm / bấm một ô ở vùng biển địch để bắn. Máy "ngắm" (hồng tâm đỏ trên vùng biển của bạn) rồi bắn lại. Ô trượt: chấm trắng có vòng sóng; ô trúng: quả cầu lửa; tàu chìm cháy sẫm. Phát vừa bắn của mỗi bên có viền vàng.

**Hoạt cảnh:** té nước (vòng sóng + giọt nước) khi trượt, quả cầu lửa + tia lửa khi trúng, lưới rung khi chìm. Bật giảm chuyển động thì không có hoạt cảnh trang trí, nhịp lượt rút ngắn (vẫn giữ quãng nghỉ để đọc kết quả).

**Bố cục:** điện thoại dọc (390×844) không đủ chỗ cho hai lưới cạnh nhau, nên lưới địch to ở trên, lưới của bạn **thu nhỏ** (bỏ nhãn tọa độ) ở dưới, cạnh bảng số phát / tàu địch còn lại; không cuộn, không phải chuyển qua lại. Màn ngang và máy tính: hai lưới cạnh nhau (lưới mình bên trái, nhỏ hơn).

## Máy và mode

Chọn ở màn xếp tàu hoặc **Cài đặt**. Chưa bắn phát nào thì đổi mức có hiệu lực ngay (gửi lại `start` với mode mới, không gửi `end`); đã bắn thì áp dụng từ ván sau.

| Mode | Máy |
| --- | --- |
| `easy` (Dễ) | Bắn ngẫu nhiên vào ô chưa biết (tự tránh ô chắc chắn trống). |
| `medium` (Vừa) | Săn - mục tiêu: săn ngẫu nhiên; trúng thì bắn 4 ô kề, có hai ô trúng thẳng hàng thì bắn nối dài hai đầu tới khi chìm. |
| `hard` (Khó) | Bản đồ mật độ xác suất: với mỗi tàu chưa chìm, đếm mọi vị trí còn có thể (không đè ô trượt / chắc chắn trống / tàu chìm, không sát ô trúng của tàu khác vì luật không chạm); có ô trúng chưa chìm thì chỉ tính vị trí đi qua ô trúng (trọng số 40^số ô trúng đi qua). Bắn ô có điểm cao nhất. |

Máy chỉ nhìn `viewOf` (dấu bắn + tàu đã chìm), không bao giờ đọc tàu chưa lộ của bạn (có test). Nước của máy tất định theo seed của ván và số phát đã bắn; tính trong vài ms nên không cần Web Worker, app cho máy "ngắm" 450–850 ms cho tự nhiên.

**Đo độ mạnh** (trong `node test.js`, 150 đội tàu ngẫu nhiên):

| | Dễ | Vừa | Khó |
| --- | --- | --- | --- |
| Số phát trung bình để đánh chìm cả đội | 73,9 | 49,6 | 37,8 |

Đấu đối kháng (luân phiên, đổi bên đi trước mỗi ván, 150 ván): Vừa thắng Dễ 97%, Khó thắng Dễ 100%, Khó thắng Vừa 83%.

## Ghi điểm trên cổng

Metric `wins` (số ván thắng), 10 điểm mặc định; mode theo mức máy: `easy` **5** điểm, `medium` **10** điểm, `hard` **20** điểm (thấp hơn mức 10 / 15 / 25 của bảng 4.8), mỗi mode luật `min_duration_ms` **12000**.

- **Vì sao điểm thấp hơn:** game có phần may rủi lớn. Mô phỏng một người chơi bắn kiểu săn - mục tiêu (đi trước) thắng Dễ ~98% (gần như chắc thắng, ván chừng 1,5 phút nên Dễ chỉ 5 điểm), thắng Vừa ~50%, thắng Khó ~20–30%; kể cả chơi tối ưu (ngang mức Khó) cũng chỉ thắng Khó ~53%, còn người chơi kém vẫn có thể thắng Khó nhờ may (phân bố số phát của Khó: 10% nhanh nhất ≤ 31 phát, 10% chậm nhất ≥ 47).
- **Vì sao 12 s:** thắng cần ít nhất 17 phát (trúng hết), xen giữa là 16 lượt của máy. Mỗi vòng app khóa bàn: hoạt cảnh phát của bạn + máy ngắm + hoạt cảnh phát của máy = 700 + ≥450 + 700 ms (≥ 1,85 s), giảm chuyển động 250 + 300 + 250 = 800 ms. 16 × 0,8 s = 12,8 s, lấy tròn xuống 12 000 ms (thời gian xếp tàu tính thêm vào ván vì `start` gửi ngay từ lúc xếp).
- Ván mới (lúc bắt đầu xếp tàu): `kit.sdk.start(level)`; mở lại trận lưu dở: `kit.sdk.start(level, true)`.
- Hết ván: `kit.sdk.end({ mode: level, won, assisted: false })`, gửi ngay ở phát quyết định (hộp kết quả chờ hết hoạt cảnh). Thua gửi `won: false`.
- Bỏ ván đã bắn ít nhất một phát (Ván mới → xác nhận): gửi `won: false`. Chưa bắn phát nào (đang xếp tàu hoặc vừa vào trận) thì không gửi gì.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-bantau-settings-v1` | Cài đặt: giao diện, `level` (`easy` / `medium` / `hard`) |
| `playnine-bantau-stats-v1` | Thống kê: `levels.<mức>.{played, won, lost, shots, hits}`, `streak`, `best` (chuỗi thắng dài nhất), `fewest` (ít phát nhất để thắng) |
| `playnine-bantau-save-v1` | Trận đang dở (đã bắn ≥ 1 phát) `{ v: 1, level, last, game }`; `game` là `toJSON` của engine: `seed`, `ply`, `turn`, `winner`, `fleets` (mỗi tàu `[hàng, cột, độ dài, dọc 0/1]`), `marks` (hai chuỗi 100 ký tự `0` chưa bắn / `1` trượt / `2` trúng / `3` chắc chắn trống; ô `3` được suy lại khi nạp). Ván hỏng / sai luật / lệch lượt bị bỏ |
| `playnine-bantau-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Đang dở trận mà rời trang (kể cả lúc máy sắp bắn) thì mở lại vào đúng lượt đó. Rời trang lúc đang xếp tàu thì lần sau xếp lại từ đầu.

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `1`–`5` | Xếp tàu: chọn tàu (tàu đang ở bến thì đặt ra biển) |
| `←` `↑` `→` `↓` | Xếp tàu: dời tàu đang chọn; trận: di chuyển con trỏ trên vùng biển địch |
| `R` | Xoay tàu đang chọn (cả lúc đang kéo) |
| `X` | Xếp ngẫu nhiên |
| `Backspace` / `Delete` | Cất tàu đang chọn về bến |
| `S` | Vào trận |
| `Enter` / `Space` | Bắn ô dưới con trỏ |
| `N` | Ván mới |
| `Esc` | Bỏ chọn tàu; đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test engine phủ: đội tàu chuẩn, ô của tàu, `canPlace` (trong bàn, không chồng, không chạm cạnh / chéo, đúng độ dài), `fleetValid`, xếp ngẫu nhiên 500 seed đều hợp lệ / tất định / đa dạng, xếp ngẫu nhiên phần còn lại, PRNG lưu / nạp trạng thái; bắn trượt / trúng / chìm và dấu chắc chắn trống, lượt xen kẽ (trúng không bắn tiếp), từ chối phát sai, thắng / thua; `viewOf` không lộ tàu; máy mọi mức luôn bắn ô hợp lệ và đánh chìm hết, tất định, không phụ thuộc tàu chưa lộ, Vừa / Khó bắn quanh và nối dài ô trúng, Khó loại khe quá hẹp; mức mạnh dần (số phát trung bình và đấu đối kháng); lưu / khôi phục (cả ván đã kết thúc) và từ chối 20 dạng dữ liệu hỏng. Test Playwright trong cổng nằm ở `e2e.spec.ts` (thắng, thua, bỏ ván, đổi mức trước phát đầu; chạy cùng `npm run e2e` sau khi build và ghép).
