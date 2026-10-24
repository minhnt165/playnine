# Đập Chuột

Game Đập Chuột (Whack a Mole) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

Vẽ bằng DOM + SVG (không dùng canvas): 9 hang là 9 nút, chuột là SVG vẽ tay dựng sẵn trong mỗi hang, mỗi khung hình chỉ đổi lớp CSS và `translateY`.

## Luật

- Lưới 3 × 3 hang, mỗi ván **60 giây**. Chuột trồi lên trong chốc lát rồi lặn; đập trúng khi chuột còn ở trên.
- Càng về cuối càng nhanh: khoảng cách giữa hai lần trồi giảm từ 950 ms xuống 400 ms, thời gian hiện giảm từ 1,5 s xuống 0,7 s.
- Loại (xuất hiện dần theo thời gian):

| Loại | Điểm | Ghi chú |
| --- | --- | --- |
| Chuột thường | +1 | từ đầu ván |
| Chuột vàng | +5 | hiện ngắn (×0,6), từ lượt thứ 9 |
| Chuột đội mũ | +2 | cần 2 cú: cú đầu hất mũ (0 điểm, vẫn tính combo), cú hai mới hạ; từ lượt 17. Hất mũ sát giờ lặn thì chuột ở lại thêm tối đa 0,5 s |
| Bom | −5 | đừng đập! Mất combo và bị choáng 1,2 s (đập không có tác dụng); từ lượt 25. Điểm không xuống dưới 0 |

- **Combo**: đập trúng liên tiếp không trượt thì nhân điểm ×1 (5 cú đầu), ×2 (từ cú thứ 6), ×3 (từ cú thứ 11, tối đa). Đập vào hang trống hoặc đập bom thì combo về 0. Chuột tự trốn không làm mất combo.
- Lịch trồi sinh từ hạt giống: mỗi ván có **đúng 90 lượt** (52 thường, 10 vàng, 13 đội mũ, 15 bom), chia nhóm 8 lượt có thành phần cố định rồi xáo thứ tự trong nhóm, chọn hang ngẫu nhiên trong các hang đang rảnh, lệch giờ ±15%. Vì vậy mọi ván công bằng như nhau và trần điểm cố định.
- Engine tất định: cùng hạt giống + cùng chuỗi cú đập (thời điểm, hang) thì cùng kết quả; app tiến engine theo bước cố định 10 ms.

## Điều khiển

- Chạm / bấm chuột vào hang (bắt ngay khi nhấn xuống, nhiều ngón cùng lúc được). Máy tính có con trỏ hình búa.
- Bàn phím theo đúng vị trí lưới (theo phím vật lý nên bàn phím AZERTY / QWERTZ vẫn đúng), nhãn phím hiện ở góc mỗi hang:

| Hàng | Chữ | Bàn phím số |
| --- | --- | --- |
| Trên | `Q` `W` `E` | `7` `8` `9` |
| Giữa | `A` `S` `D` | `4` `5` `6` |
| Dưới | `Z` `X` `C` | `1` `2` `3` |

## Màn hình và luồng ván

- Màn chờ có chú giải bốn loại và nút **Bắt đầu** (`#btn-start`); Space / Enter hoặc chạm vào lớp phủ cũng bắt đầu. Lần đầu mở hiện hướng dẫn (lưu `guideSeen` trong cài đặt).
- Tự tạm dừng khi trang ẩn hoặc mở hộp thoại; nút tạm dừng ở ô số liệu, phím `P` / `Esc`.
- Hết giờ: bảng kết quả (điểm, kỷ lục mới, số chuột đã đập, combo dài nhất, độ chính xác), kỷ lục mới thì có pháo giấy.
- Cài đặt: giao diện, ngôn ngữ, âm thanh, **rung** (bật mặc định, chỉ có tác dụng trên điện thoại).

## Ghi điểm trên cổng

- `metric: score_high`, một mode `classic` (Cổ điển), 5 điểm mỗi ván.
- Ván mới: `kit.sdk.start('classic')` khi bấm Bắt đầu; mở lại ván lưu dở: `kit.sdk.start('classic', true)`.
- Hết 60 giây: `kit.sdk.end({ mode: 'classic', won: false, score, assisted: false })` (game tính điểm, không có thắng).
- Bỏ ván (nút Ván mới / phím `N`) khi đã có điểm hoặc đã chơi ≥ 1 giây: hỏi lại, rồi gửi `won: false` với điểm hiện có. Chưa tới 1 giây và chưa có điểm thì chơi lại luôn, không gửi gì.
- Luật chống gian lận (`rules`):
  - `min_duration_ms: 55000`: một ván thật kéo dài 60 giây.
  - `max_score: 384`: trần tuyệt đối, bằng tổng điểm gốc của mọi mục tiêu (trừ bom) nhân ×3 (`E.MAX_SCORE`, như nhau ở mọi hạt giống). Chơi hoàn hảo thật sự chỉ được 369 (`E.perfectScore`) vì 10 cú đầu chưa đủ ×3.
  - `max_score_per_sec: 13`: bot đập mọi mục tiêu với phản ứng 220–320 ms, di chuyển 120 ms, trên 300 hạt giống, đạt cao nhất 6,43 điểm/giây (xét từ giây thứ 5); đặt khoảng ×2.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-dapchuot-settings-v1` | Cài đặt (giao diện, rung, `guideSeen`) |
| `playnine-dapchuot-stats-v1` | Thống kê: số ván, điểm cao nhất, combo dài nhất, tổng số chuột đã đập |
| `playnine-dapchuot-save-v1` | Ván đang chơi dở `{ v: 1, game }` (hạt giống + giờ + điểm + kết quả từng lượt; lịch trồi dựng lại từ hạt giống). Ghi khi tạm dừng / rời trang, mở lại thì ở trạng thái tạm dừng |
| `playnine-dapchuot-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `Q W E / A S D / Z X C`, bàn phím số `7–9 / 4–6 / 1–3` | Đập hang tương ứng |
| `Space` / `Enter` | Bắt đầu, chơi tiếp, chơi lại |
| `P` / `Esc` | Tạm dừng / chơi tiếp |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra

```bash
node test.js
```

Test engine phủ: lịch trồi tất định và công bằng theo hạt giống, không chồng hang, nhịp tăng dần, loại đặc biệt xuất hiện dần; cửa sổ nhìn thấy; đập trúng / trượt; chuột đội mũ 2 cú; bom trừ điểm và choáng; combo và reset; đồng hồ 60 giây; điểm cuối và trần điểm; lưu / khôi phục và từ chối dữ liệu hỏng.

`e2e.spec.ts` (chạy trong cổng cùng e2e chung): ván lưu dở ở giây 59,2 chơi tiếp tới hết giờ báo `pn:end` với `won: false, score: 42`; bỏ ván sau 1 giây báo `won: false`, bỏ trước 1 giây không báo gì.
