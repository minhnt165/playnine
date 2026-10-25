# Cờ Tỷ Phú

Game Cờ Tỷ Phú (tiếng Anh: Tycoon) của PlayNine: cờ mua bán đất rút gọn cho điện thoại, bạn đấu 3 máy, ván khoảng 15 phút. Viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

Bàn, tên ô, thẻ và tiền tệ (¤) đều tự thiết kế: ô đất là địa danh Việt Nam và thế giới, thẻ Cơ hội / Vận may có nội dung tự viết, không dùng tên, hình hay bố cục của bất kỳ trò chơi thương mại nào.

## Luật

- 4 người (bạn + 3 máy cùng mức), mỗi người ¤1.500. Bàn vòng **28 ô**: Xuất phát (đi qua hoặc dừng nhận ¤200), Trại giam, Trạm nghỉ, Bị bắt (vào thẳng Trại giam), **16 ô đất chia 7 nhóm màu** (2–3 ô / nhóm), 2 cảng (thuê ¤50 / ¤100 theo số cảng cùng chủ), 2 xưởng (thuê 4× / 10× tổng xúc xắc), 1 ô thuế ¤150, 3 ô thẻ (Cơ hội ×2, Vận may ×1; mỗi bộ 12 thẻ, xáo theo seed, rút xong đặt xuống đáy, thẻ ra trại giữ tới khi dùng).
- Gieo 2 xúc xắc; **đôi** được gieo tiếp, **3 lần đôi** liền thì vào trại.
- Dừng ở đất trống: **mua** hoặc **bỏ qua**. Dừng ở đất người khác (không cầm cố): trả tiền thuê. Đủ cả nhóm: thuê ×2 và được **xây nhà** (xây đều trong nhóm, tối đa 4 nhà rồi khách sạn; nhóm có ô cầm cố thì không xây).
- **Cầm cố** lấy nửa giá (không thu thuê; nhóm còn nhà thì không cầm cố được), **chuộc** bằng nửa giá + 10% (làm tròn 5). Bán nhà lấy nửa giá xây (bán đều).
- **Trại giam:** trả ¤50, dùng thẻ ra trại, hoặc gieo tìm đôi; trượt lần thứ ba thì buộc trả ¤50 rồi đi theo lần gieo đó.
- **Nợ:** thiếu tiền thì phải bán nhà / cầm cố; bán hết vẫn không đủ thì **phá sản**: nợ người chơi → tiền, đất (giữ trạng thái cầm cố), thẻ về chủ nợ (nhà bán lại ngân hàng nửa giá, tiền cũng về chủ nợ); nợ ngân hàng → đất thành đất trống, thẻ về chồng.
- **Hỏi mua đất:** trong lượt của mình, đề nghị mua bằng tiền một ô của người khác (nhóm chưa có nhà), tối đa 2 lần / lượt, mỗi ô 1 lần. Máy đánh giá đề nghị theo mức; máy cũng có thể hỏi mua đất của bạn (hộp thoại Bán / Từ chối).
- **Kết thúc:** hết **30 vòng** hoặc chỉ còn một người. Xếp hạng theo **tổng tài sản** = tiền + giá đất (đất cầm cố tính nửa giá) + nhà theo giá xây; bằng nhau thì xét tiền mặt rồi thứ tự ghế. **Thắng khi về nhất.** Bạn phá sản là hết ván (thua) ngay.

### Những chỗ rút gọn so với cờ tỷ phú đầy đủ

- **Không đấu giá** khi bỏ qua đất: đấu giá 4 người trên điện thoại chậm và nhiều thao tác; đất bỏ qua vẫn để trống cho người sau.
- **Không giới hạn số nhà của ngân hàng**: bàn nhỏ, ván ngắn nên hiếm khi hết nhà, bỏ để luật gọn.
- **Giao dịch chỉ là mua đất bằng tiền** (không đổi đất lấy đất, không kèm thẻ): đủ để gom nhóm (đây là chỗ thể hiện kỹ năng chính của máy Khó), giữ giao diện một nút.
- Không có lãi khi nhận đất cầm cố từ người phá sản.

## Điều khiển

- **Chạm** một ô để xem thẻ chi tiết ở giữa bàn (giá, bảng tiền thuê, chủ, nút Xây / Bán nhà / Cầm cố / Chuộc với đất của bạn, hoặc ô Hỏi mua với đất của máy).
- Nút dưới bàn: nút chính đổi theo pha (**Gieo / Gieo tiếp / Gieo tìm đôi / Mua / Kết thúc lượt / Trả / Tự xoay tiền / Phá sản**), nút phụ (**Bỏ qua**, **Trả ¤50**, **Dùng thẻ**), **Xây** và **Cầm cố** bật chế độ chạm ô sáng để xây / cầm cố / chuộc.
- **Tự xoay tiền** (khi nợ): cầm cố / bán nhà từng bước theo cách của máy Vừa (đất lẻ rẻ trước, nhóm đủ bộ sau cùng).
- Nhật ký ngắn dưới bảng tiền; số tiền thay đổi bay lên / xuống cạnh tên người chơi.
- Cài đặt: mức máy, **tốc độ** (Thường / Nhanh), giao diện, ngôn ngữ, âm thanh. Giảm chuyển động: quân nhảy thẳng tới ô, xúc xắc không lăn, không có hiệu ứng trang trí.

## Máy

Máy chạy trong engine (`E.aiAction(g, mức)` trả từng thao tác một, tất định theo trạng thái ván), "nghĩ" ~0,55 s mỗi thao tác (Nhanh ~0,25 s).

| Mức | Mua đất | Xây / chuộc | Xoay tiền | Trại giam | Mua bán đất |
| --- | --- | --- | --- | --- | --- |
| Dễ | 75% khi đủ tiền, không giữ dự trữ | xây bừa tới hết tiền, không chuộc | cầm cố / bán nhà ngẫu nhiên | dùng thẻ, hoặc trả / gieo ngẫu nhiên | không hỏi mua; bán nếu giá ≥ 1,25 × giá gốc |
| Vừa | giữ dự trữ ¤150; ô hoàn thành / chặn nhóm thì mua nếu đủ tiền | xây khi còn ≥ ¤150 sau khi xây, ưu tiên tiền thuê cao; chuộc khi dư | đất lẻ rẻ trước, rồi nhà, nhóm đủ bộ sau cùng | trả sớm ở 40% đầu ván, sau đó ngồi gieo | hỏi mua ô hoàn thành nhóm giá 2× (rồi 2,6×); bán ô lẻ ≥ 1,6×, ô giúp người mua đủ nhóm ≥ 3×, không phá nhóm của mình |
| Khó | tính **xác suất dừng ô** (chuỗi Markov 2 xúc xắc + thẻ + Bị bắt) và dự trữ theo tiền thuê kỳ vọng của đối thủ; cầm cố đất lẻ để mua ô hoàn thành nhóm | xây ô có thu nhập kỳ vọng / giá cao nhất, cầm cố đất lẻ để xây (cầm cố không làm giảm tài sản); chuộc khi thu nhập bù được lãi | chọn bước mất ít thu nhập kỳ vọng nhất trên mỗi đồng | bàn đã nguy hiểm thì ngồi trong trại cho an toàn | hỏi mua ô hoàn thành nhóm với giá người bán chịu (giá trị với người bán + phần thiệt khi người mua đủ nhóm), trả cao dần ×1,3; bán khi giá ≥ giá trị đó |

Máy không hỏi dồn dập: mỗi ô tối đa 2 lần, cách nhau ≥ 3 vòng.

Tỉ lệ về nhất đo trong `node test.js` (xoay ghế để khử lợi thế đi trước, 400 ván mỗi cặp, mốc ngẫu nhiên là 25%):

| Cặp | Tỉ lệ về nhất |
| --- | --- |
| Khó vs 3 Dễ | 65% |
| Khó vs 3 Vừa | 53% |
| Vừa vs 3 bot ngẫu nhiên hợp lệ (200 ván) | 96% |
| Vừa vs 3 Dễ | 83% |
| Dễ vs 3 Vừa | 7% |

Độ dài ván (mô phỏng 400 ván, bạn đánh như máy Vừa): trung bình ~25 vòng với máy Dễ / Khó (có phá sản giữa chừng), ~28 vòng với máy Vừa. Đo trong Chromium: tốc độ Thường ~26 s / vòng (người chơi nghĩ 1,5 s mỗi quyết định) → 30 vòng ≈ 13–16 phút; Nhanh ~12 s / vòng.

## Ghi điểm trên cổng

- `metric: wins`, mode theo mức máy: `easy` 10 điểm, `medium` 15, `hard` 25. Thắng = về nhất trong 4 người (khó hơn đấu một máy) và ván dài ~15 phút nên giữ mức chuẩn dù xúc xắc có may rủi.
- `min_duration_ms` 15000 cho cả ba mode: ván thắng nhanh nhất có thể là ba máy phá sản sớm. Mô phỏng 9 000 ván (Khó vs 3 Dễ / Vừa / Khó), ván thắng-do-phá-sản sớm nhất kết thúc ở vòng 9 sau 56 thao tác của máy (22 lần gieo); mỗi thao tác máy nghĩ tối thiểu 0,25 s (tốc độ Nhanh) + gieo / đi quân ≥ 0,4 s mỗi lần gieo → ≥ ~25 s. Lấy 15 s để có biên an toàn cho các ván may mắn hơn.
- Ván mới `kit.sdk.start(mức)`, mở lại ván dở `kit.sdk.start(mức, true)`; hết ván `kit.sdk.end({ mode, won: về nhất, assisted: false })`. Bỏ ván khi đã gieo ít nhất một lần: `won: false`; chưa gieo lần nào thì không gửi. Đổi mức khi chưa gieo thì chia lại ngay (gửi `start` với mức mới), đang dở thì áp dụng từ ván sau.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-cotyphu-settings-v1` | Cài đặt (mức máy, tốc độ, giao diện, đã xem hướng dẫn) |
| `playnine-cotyphu-stats-v1` | Thống kê theo mức (ván, về nhất), chuỗi thắng, tài sản cao nhất |
| `playnine-cotyphu-save-v1` | Ván đang chơi: `{ v, level, acted, game, log }` (lưu ngay sau mỗi thao tác, trước hoạt cảnh, nên tải lại không gieo lại được) |
| `playnine-cotyphu-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng / khác phiên bản bị `fromJSON` từ chối và game chia ván mới.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `Space` / `Enter` | Nút chính (gieo / mua / kết thúc lượt / trả nợ…); trong chế độ Xây / Cầm cố: làm với ô đang chọn |
| `R` | Gieo |
| `B` / `S` | Mua / Bỏ qua |
| `E` | Kết thúc lượt |
| `H` / `M` | Bật / tắt chế độ Xây / Cầm cố |
| `J` / `C` | Trả ¤50 ra trại / Dùng thẻ ra trại |
| `A` | Tự xoay tiền (khi nợ) |
| `←` `→` / `↑` `↓` | Chọn ô (lùi / tới 1 ô, 7 ô) để xem chi tiết |
| `Y` / `N` | Bán / Từ chối khi máy hỏi mua đất |
| `N` | Ván mới |
| `Esc` | Bỏ chọn / thoát chế độ / đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

31 test, khoảng 10 s: bàn, xúc xắc / thẻ tất định theo seed, đi vòng + lương, mua / bỏ qua, tiền thuê (đất, nhóm, nhà, cảng, xưởng, cầm cố), đôi và 3 lần đôi, ra trại 3 cách + hết 3 lượt, xây đều / bán đều, cầm cố / chuộc, nợ + phá sản (cho người chơi / ngân hàng), từng loại thẻ, mua lại đất, hết vòng + xếp hạng tài sản, 120 ván toàn máy (mọi nước hợp lệ, tiền chỉ đổi qua ngân hàng, trạng thái giữa ván lưu / khôi phục được), máy tất định, mức mạnh dần, lưu / khôi phục và từ chối dữ liệu hỏng.

`e2e.spec.ts` (chạy trong cổng): về nhất ở vòng cuối báo `won: true`; phá sản báo `won: false`; bỏ ván đã gieo báo `won: false`; đổi mức trước khi gieo gửi lại `pn:start`.
