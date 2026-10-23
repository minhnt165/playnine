# Xì Dách

Game Xì Dách (Blackjack, luật chuẩn sòng bài, một người chơi với nhà cái) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (kit + bài tây `cards.js` / `cards.css`, xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

Thắng nhà cái: tổng điểm gần 21 hơn mà không quá 21. Lá số tính đúng số, J / Q / K tính 10, át tính 1 hoặc 11. Bài có át đang tính 11 là bài "mềm", hiện cả hai cách tính: `A,6 = 7/17`.

- **Phiên:** 1000 chip, 10 ván. Trước mỗi ván chọn mức cược bằng các chip 10 / 25 / 50 / 100 (tối thiểu 10, tối đa 200, không quá số chip đang có) rồi **Chia bài**; **Cược lại** chia ngay với mức cược ván trước.
- **Chia:** người, nhà cái, người, nhà cái; lá thứ hai của nhà cái úp.
- **Nước đi:** **Rút** (thêm một lá), **Dừng**, **Gấp đôi** (với 2 lá đầu bất kỳ, kể cả sau khi tách: cược x2, nhận đúng một lá rồi dừng), **Tách** (hai lá cùng điểm, kể cả hai lá 10 điểm khác bậc như K + Q: hai tay, cược thứ hai bằng cược gốc; chỉ tách một lần; tách đôi át thì mỗi tay nhận đúng một lá). Rút tới đúng 21 thì tự dừng.
- **Nhà cái:** hộp 6 bộ (312 lá), chia ván mới mà còn dưới 25% (78 lá) thì xáo lại; hộp bài đi tiếp từ phiên này sang phiên sau như bàn thật. Nhà cái rút tới khi đủ 17 và dừng ở mọi 17, kể cả 17 mềm (S17). Nhà cái xem lá úp ngay khi chia: có Xì Dách thì lật luôn và ván kết thúc (người chơi cũng Xì Dách thì hòa). Mọi tay của người chơi đều quắc thì nhà cái chỉ lật lá úp, không rút.
- **Trả thưởng:** Xì Dách (át + lá 10 điểm ở 2 lá đầu, không phải tay tách) ăn 3:2, làm tròn xuống chip nguyên (cược 25 ăn 37); thắng thường 1:1; hòa trả lại cược; quắc (quá 21) mất cược. Tách rồi ra 21 chỉ là 21 thường.
- Không có bảo hiểm, không đầu hàng (ghi rõ trong Cách chơi).
- **Hết phiên:** chơi đủ 10 ván, hoặc còn dưới 10 chip (cháy chip) thì hết sớm.

Bot chiến thuật cơ bản trong `test.js` (1 000 000 ván, cược 10) cho lợi thế nhà cái khoảng 0,6% cược ban đầu, đúng tầm 0,5–1% của luật này; khoảng 45% phiên kết thúc có lãi.

## Điều khiển

- Chuột / chạm: chạm chip để cộng cược (chip vượt mức tối đa thì mờ đi), **Xóa** để đặt lại, **Chia bài** / **Cược lại**; trong ván bốn nút **Rút**, **Dừng**, **Gấp đôi**, **Tách** (nút không đi được thì mờ).
- Bàn nỉ: nhà cái ở trên (tổng điểm chỉ tính lá ngửa cho tới khi lật lá úp), người chơi ở dưới, hộp bài góc phải trên kèm vạch còn lại (vạch trắng là mốc xáo lại 25%). Tách thì hai tay nằm cạnh nhau, tay đang tới lượt có viền vàng.
- HUD: số chip (kèm lãi / lỗ của phiên), ván thứ mấy / 10, mức cược; dải 10 ô bên dưới ghi lãi / lỗ từng ván (xanh thắng, vàng Xì Dách, xám hòa, đỏ thua).
- Hiệu ứng: lá bay từ hộp bài rồi lật lên, lá úp của nhà cái lật ở cuối, nhà cái rút từng lá, dọn bài khi chia ván mới. Bật "giảm chuyển động" thì lá hiện ngửa ngay (không bay, không lật) nhưng vẫn ra từng lá theo nhịp.
- Đang diễn thì các nút bị khóa; mỗi ván mất ít nhất khoảng 3 giây kể cả khi giảm chuyển động.
- Cài đặt có thêm **Bài 4 màu** (rô xanh dương, nhép xanh lá).
- Màn hình ngang thấp: bàn bên trái, HUD + nút bên phải.

## Ghi điểm trên cổng

- Metric `wins`, một mode `classic` (Cổ điển), 8 điểm mỗi ván. Một **phiên 10 ván** là một ván của cổng.
- Phiên mới (khi mở trang hoặc bấm Phiên mới): `kit.sdk.start('classic')`; mở lại phiên dở: `kit.sdk.start('classic', true)`.
- Hết phiên: `kit.sdk.end({ mode: 'classic', won: chip > 1000, timeMs, assisted: false })`. Hòa vốn (đúng 1000) hoặc cháy chip là thua. Báo ngay khi engine tính xong ván cuối (trước khi diễn xong), nên tắt trang giữa chừng không mất kết quả.
- Bỏ phiên đã chia ít nhất một ván: `won: false`; chưa chia ván nào thì không gửi gì.
- Luật chống gian lận `min_duration_ms` 30000: một phiên thắng phải chơi đủ 10 ván, mỗi ván có nhịp chia và giữ kết quả cố định (chia 4 lá cách nhau 0,3 giây, nhà cái rút cách nhau 0,5 giây, giữ kết quả 1,1 giây) nên kể cả bấm nhanh nhất với giảm chuyển động một ván vẫn mất khoảng 3 giây; người thật chơi 10 ván dưới 30 giây gần như không có.
- 8 điểm: thuộc nhóm "bài, có kỹ năng" (8–12) ở mục 4.8 của lộ trình, lấy mức thấp vì may rủi chiếm phần lớn (bot chơi đúng chiến thuật cũng chỉ thắng khoảng 45% phiên).

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-xidach-settings-v1` | Cài đặt (giao diện, bài 4 màu) |
| `playnine-xidach-stats-v1` | Thống kê: số phiên, phiên có lãi, kỷ lục chip cuối phiên, số ván, ván thắng, số lần Xì Dách |
| `playnine-xidach-save-v1` | Phiên hiện tại (cả khi đã xong, để hộp bài đi tiếp sang phiên sau): chip, ván, bài trên bàn, nhật ký 10 ván, mức cược đang chọn; hộp bài lưu dạng hạt giống + vị trí, mở lại thì dựng lại đúng thứ tự. Chỉ phiên đang dở mới được mở lại |
| `playnine-xidach-summary-v1` | Tóm tắt cho thẻ game trên cổng (kỷ lục, tỉ lệ phiên có lãi, ván / chip của phiên đang dở) |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `H` | Rút |
| `S` | Dừng |
| `D` | Gấp đôi |
| `P` | Tách |
| `Enter` | Chia bài (đã chọn chip) / Cược lại (chưa chọn chip) / Phiên mới (khi hết phiên) |
| `1` – `4` | Thêm chip 10 / 25 / 50 / 100 |
| `Backspace` | Xóa cược |
| `N` | Phiên mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra engine

```bash
node test.js
```

Phủ: điểm bài và át mềm (nhãn `7/17`), Xì Dách khác 21 thường (21 ba lá, tay tách), nhà cái S17; trả thưởng thắng 1:1, Xì Dách 3:2 (cả làm tròn), hòa, thua, quắc, nhà cái quắc, nhà cái có Xì Dách; gấp đôi (thắng / thua, chỉ 2 lá đầu, đủ chip); tách (hai tay, gấp đôi sau khi tách, tách một lần, hai lá 10 điểm khác bậc, thiếu chip, tách át, tay tách chạm 21, mọi tay quắc); mức cược; hộp 6 bộ (312 lá, hạt giống, xáo lại dưới 25%, đi tiếp sang phiên sau); phiên 10 ván, thắng / thua phiên, cháy chip; lưu / khôi phục giữa ván, sau khi tách, phiên đã xong, từ chối dữ liệu hỏng; bot chiến thuật cơ bản 100 000 phiên (in lợi thế nhà cái, tỉ lệ phiên có lãi, tỉ lệ Xì Dách, số lần xáo).

Test trong cổng: `games/xidach/e2e.spec.ts` (ván 10 kết thúc với hơn 1000 chip báo thắng, 500 chip báo thua; bỏ phiên sau khi chia báo thua; chưa chia thì không báo).
