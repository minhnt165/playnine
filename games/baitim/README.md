# Bài Tim

Game Bài Tim (Hearts) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (kit + bộ bài `cards.js` / `cards.css`, xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo trận qua SDK.

## Luật

- 4 người: bạn (Nam) và ba máy Mai (Tây), Khoa (Bắc), Linh (Đông), đi theo chiều kim đồng hồ. Chia hết bộ 52 lá, mỗi người 13 lá.
- **Chuyền bài:** đầu mỗi ván, mỗi người chọn 3 lá chuyền đi cùng lúc: ván 1 sang trái, ván 2 sang phải, ván 3 sang đối diện, ván 4 không chuyền, rồi lặp lại.
- Ai cầm **2♣** mở nước đầu bằng lá đó. Phải **ra theo chất** được mở nếu còn; hết chất thì ra lá bất kỳ.
- Nước đầu không được đổ lá cơ hay Q♠ (trừ khi trên tay chỉ toàn lá điểm).
- Không được mở nước bằng cơ khi **cơ chưa vỡ** (chưa ai ra cơ), trừ khi trên tay chỉ còn cơ. Mở bằng Q♠ thì được.
- Lá cao nhất của chất được mở ăn nước (A cao nhất); người ăn mở nước sau.
- Mỗi lá **cơ** ăn được 1 điểm, **Q♠** 13 điểm (cả ván 26 điểm).
- **Bắn trăng:** ăn đủ 13 lá cơ và Q♠ thì người đó 0 điểm, ba người kia mỗi người +26 (luôn cộng cho người khác, không có lựa chọn tự trừ 26).
- Hết ván mà có người **≥ 100** điểm thì hết trận, người **ít điểm nhất** thắng. Nếu điểm thấp nhất đang bằng nhau thì đánh thêm ván cho tới khi chỉ còn một người thấp nhất (nên bạn thắng là thắng một mình, không có đồng hạng).

## Điều khiển

- Lúc chuyền: chạm 3 lá (lá đã chọn nhô lên, viền tím; chạm lại để bỏ chọn), rồi bấm **Chuyền**. Lá nhận được có chấm vàng tới khi bạn ra lá đầu tiên của ván.
- Lúc đánh: tới lượt bạn thì lá ra được nhô lên và sáng viền, lá không ra được mờ đi; chạm lá để ra. Chạm lá mờ thì lá rung và dòng trạng thái nói lý do.
- Bấm "Ván N ←" ở thanh dưới để xem **bảng điểm từng ván** (hết mỗi ván bảng này cũng tự hiện).
- Màn dọc hẹp: bài trên tay xếp hai hàng cho lá đủ to để chạm; màn ngang: một hàng, Tây / Đông hai bên bàn.

## Máy

| Mức | Chuyền | Ra lá |
| --- | --- | --- |
| Dễ | 3 lá ngẫu nhiên | lá hợp lệ ngẫu nhiên |
| Vừa | lá to nhất, ưu tiên Q♠ / K♠ / A♠ | lọt dưới lá đang thắng, ra cuối nước không điểm thì xả lá to, hết chất thì đổ Q♠ rồi cơ to; chỉ nhìn nước đang đánh |
| Khó | Q♠ / K♠ / A♠ khi ít bích nhỏ che, cơ to, dọn sạch chất ngắn (nhép / rô) để tạo chất trống; tay rất mạnh thì giữ lá to để bắn trăng | đếm lá đã ra, nhớ ai hết chất nào, ước lượng khả năng phải ăn nước khi mở, ép Q♠ bằng bích nhỏ, thử bắn trăng khi bài còn lại toàn lá chắc ăn, chặn người đang ôm hết điểm (ăn một nước có cơ, không đổ điểm cho họ) |

Máy nghĩ 450–850 ms mỗi lá ở tốc độ Vừa (Cài đặt: Chậm / Vừa / Nhanh), lá bay từ chỗ ngồi ra giữa bàn; đủ 4 lá thì dừng cho thấy ai ăn rồi gom lá về người đó. Máy tất định theo trạng thái trận (máy Dễ dùng PRNG suy ra từ seed + số nước).

Tỉ lệ đo bằng `node test.js` (200 trận mỗi dòng, ghế 0 đấu ba máy cùng mức):

| Ghế 0 | Ba máy | Điểm TB mỗi ván của ghế 0 | Ghế 0 thắng trận |
| --- | --- | --- | --- |
| Khó | Dễ | 1,78 | 95% |
| Vừa | Dễ | 2,05 | 95% |
| Khó | Vừa | 5,30 (ngang sức ≈ 6,5) | 49% (ngang sức 25%) |
| Dễ | Dễ (đối chứng) | 6,81 | 22% |

## Ghi điểm trên cổng

- `metric: wins`, mode theo mức máy: `easy` (Dễ, 8 điểm), `medium` (Vừa, 10), `hard` (Khó, 12). Một trận (tới 100) là một lần chơi.
- Chia trận mới: `kit.sdk.start(level)`; mở lại trận lưu dở: `kit.sdk.start(level, true)`.
- Hết trận: `kit.sdk.end({ mode, won, timeMs, assisted: false })`, `won` là bạn ít điểm nhất. Không có hoàn tác.
- Bỏ trận khi bạn đã đi ít nhất một nước (chuyền hoặc ra lá): gửi `won: false`; chưa đi nước nào thì không gửi gì.
- `rules.min_duration_ms: 20000`: một trận đủ cần ít nhất 4 ván (một ván tối đa cộng 26 cho một người, hoặc 26 cho ba người khi bắn trăng, nên 3 ván chưa tới 100), mỗi ván 13 nước × 3 lá máy; ở tốc độ Nhanh + giảm chuyển động một ván vẫn ≥ 17 s, cả trận ≥ ~70 s (đo thật: 6 ván ≈ 140 s). Ngưỡng để thấp hơn nhiều vì trận mở lại từ ván lưu tính thời gian lại từ lúc mở, có thể chỉ còn một hai ván.
- Đổi mức khi bạn chưa đi nước nào thì chia lại trận ngay (mode mới); đã đi rồi thì áp dụng từ trận sau.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-baitim-settings-v1` | Cài đặt (giao diện, mức máy, tốc độ máy) |
| `playnine-baitim-stats-v1` | Thống kê: số trận, trận thắng, điểm thắng tốt nhất, số lần bắn trăng, số ván |
| `playnine-baitim-save-v1` | Trận đang chơi dở (`E.toJSON`: bài trên tay, nước đang đánh, lá đã ra, điểm từng ván, PRNG…) + thời gian, lưu sau mỗi lá |
| `playnine-baitim-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng / sai luật (thiếu lá, trùng lá, điểm không khớp bảng điểm…) bị bỏ, chia trận mới.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `→` | Chọn lá trên tay |
| `1`–`9` | Chọn lá ra được thứ N |
| `Enter` / `Space` | Ra lá đang chọn (lúc chuyền: chọn / bỏ chọn lá) |
| `P` | Chuyền 3 lá đã chọn |
| `S` | Bảng điểm |
| `N` | Trận mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Phủ: chia bài tất định theo seed, hướng chuyền, chuyền 3 lá, luật ra lá (2♣ mở, theo chất, nước đầu, cơ chưa vỡ), ăn nước, tính điểm cả bắn trăng, hết trận ≥ 100 và đồng hạng, máy mọi mức luôn hợp lệ trên 300 trận, các hành vi chính của máy, mức máy mạnh dần (bảng trên), lưu / khôi phục và từ chối dữ liệu hỏng. `e2e.spec.ts` (chạy trong cổng): trận thắng, trận thua, bỏ trận gửi đúng `pn:end`.
