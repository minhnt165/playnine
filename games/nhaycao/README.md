# Nhảy Cao

Game Nhảy Cao (Sky Jump) của PlayNine: nhân vật tự nảy trên các bệ, người chơi lái sang trái / phải để leo cao nhất có thể. Viết bằng HTML + CSS + JavaScript thuần trên `<canvas>`, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Nhân vật "Mầm" tự nảy mỗi khi rơi xuống mặt trên một bệ (đi lên thì xuyên qua bệ). Người chơi chỉ lái ngang.
- Màn hình quấn ngang: đi ra mép trái hiện lại ở mép phải và ngược lại.
- Camera chỉ đi lên. Rơi khỏi đáy màn hình là hết ván.
- Điểm = độ cao lớn nhất đạt được, tính bằng mét (25 đơn vị thế giới = 1 m).
- Bệ (độ khó tăng theo độ cao, khoảng hở giữa các bệ rộng dần):
  - **xanh lá**: bệ thường;
  - **lò xo** (từ 20 m): đáp đúng lò xo thì bật cao gần gấp 3;
  - **nâu nứt** (từ 30 m): vỡ khi đáp lên, không nảy;
  - **xanh dương** (từ 60 m): trượt qua lại;
  - **mây giông** (từ 200 m): trôi qua lại, va vào là gục rồi rơi; đáp từ trên xuống thì mây tan và nảy lên.
- Màn sinh ra luôn có đường đi (test chứng minh trên 150 seed tới ~1600 m):
  - khoảng hở dọc giữa hai bệ đỡ được liên tiếp ≤ `MAX_GAP` = 170, thấp hơn độ cao nảy mô phỏng (≈ 221) và còn đủ thời gian bay để lái ngang tới bất kỳ chỗ nào (kể cả bắt đầu đang chạy hết tốc theo hướng ngược lại); bệ vỡ không được tính;
  - quanh mỗi mây giông luôn có một làn bệ tĩnh nằm hẳn ngoài tầm trôi của mây, và không lò xo nào bắn người chơi xuyên qua mây.

## Điều khiển

| Thiết bị | Cách lái |
| --- | --- |
| Bàn phím | `←` `→` hoặc `A` `D`; `Space` / `Enter` bắt đầu, `P` / `Esc` tạm dừng, `N` ván mới |
| Cảm ứng | Giữ nửa trái hoặc nửa phải khung chơi; chạm khung chơi ở màn chờ để bắt đầu |
| Nghiêng máy | Bật "Nghiêng máy để lái" trong Cài đặt (mặc định tắt; iOS sẽ hỏi quyền) |

Game tự tạm dừng khi trang bị ẩn hoặc mở hộp thoại. Lần đầu mở game hiện hộp hướng dẫn (lưu `guideSeen` trong cài đặt).

## Mô phỏng

- `engine.js` thuần, tất định theo seed + chuỗi input: bước cố định `DT = 1/120 s`, trọng lực 1800, nảy 900, lò xo 1500, tốc độ ngang tối đa 380 (gia tốc 3000). App gom thời gian thực vào bước cố định, giới hạn dt 0,1 s khi tab vừa quay lại.
- Khung thế giới 360 × 600 co theo khung trình duyệt (giữ tỉ lệ), nhân `devicePixelRatio`.

## Ghi điểm trên cổng

- Metric `score_high`, một mode `classic` (Cổ điển), 5 điểm/ván.
- `rules`: `min_duration_ms` 5000, `max_score_per_sec` 35.
- Đo bằng bot (nhắm bệ cao nhất kịp tới, ưu tiên lò xo, không trễ phản ứng) trên 1000 seed, xét từ giây thứ 5: tốc độ cao nhất 18,4 m/s (trung vị 14,1 m/s, leo bền ≈ 9 m/s); ngưỡng đặt khoảng ×2. Trần vật lý tuyệt đối là 60 m/s (vận tốc lò xo).
- Bấm Bắt đầu: `start(classic)`; mở lại ván lưu: `start(classic, true)`. Hết ván: `end({ won: false, score })`. Bỏ ván đã có điểm hoặc chơi ≥ 1 s: `end({ won: false, score })` với độ cao hiện có; chưa chơi gì thì không gửi.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-nhaycao-settings-v1` | Giao diện, lái nghiêng, rung, đã xem hướng dẫn |
| `playnine-nhaycao-stats-v1` | Số ván, kỷ lục (m), tổng độ cao đã leo |
| `playnine-nhaycao-save-v1` | Ván đang chơi dở (lưu khi rời trang / tạm dừng, mở lại thì chơi tiếp) |
| `playnine-nhaycao-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `→` / `A` `D` | Lái trái / phải |
| `Space` / `Enter` | Bắt đầu / chơi tiếp |
| `P` / `Esc` | Tạm dừng / chơi tiếp |
| `N` | Ván mới |

## Kiểm tra engine

```bash
node test.js
```

Test phủ: vật lý bước cố định, chỉ nảy khi rơi xuống mặt trên bệ, lò xo, bệ vỡ, bệ di động, quấn ngang, mây giông (va / dẫm), camera, điểm, hết ván, đường đi luôn tồn tại trên nhiều seed, bot leo được, lưu / khôi phục chạy tiếp y hệt và từ chối dữ liệu hỏng. Test "ván kết thúc báo đúng pn:end" chạy trong cổng nằm ở `e2e.spec.ts`.
