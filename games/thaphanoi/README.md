# Tháp Hà Nội

Game Tháp Hà Nội (Tower of Hanoi) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật

- Ba cọc. Ván mới: cả chồng đĩa (lớn dưới, nhỏ trên) nằm ở cọc trái.
- Mỗi nước chuyển **một đĩa trên cùng** của một cọc sang cọc khác, **không bao giờ đặt đĩa lớn lên đĩa nhỏ**.
- Thắng khi cả chồng sang **cọc phải** (cọc có cờ). Chồng ở cọc giữa chưa tính.
- Số nước ít nhất là 2ⁿ − 1 (4 đĩa: 15, 5 đĩa: 31, 6 đĩa: 63, 7 đĩa: 127). HUD hiện số nước đã đi / tối thiểu.
- Đồng hồ chạy từ nước đầu tiên. Không có hoàn tác.

## Điều khiển

- **Chạm / bấm chuột:** chạm một cọc để nhấc đĩa trên cùng (đĩa nổi lên trên cọc, các cọc đặt được sáng lên), chạm cọc đích để đặt; chạm lại chính cọc đó để đặt xuống.
- **Kéo thả:** kéo đĩa trên cùng sang cọc khác rồi thả; thả ở chỗ cũ là hủy.
- Đặt sai luật: đĩa lắc, cọc đích nháy đỏ, có tiếng báo lỗi. Chạm sai thì đĩa vẫn được nhấc để chọn cọc khác; kéo sai thì đĩa về chỗ cũ.
- Bàn đã giải xong: chạm bàn mở lại bảng kết quả.

## Mode

Chọn số đĩa trong Cài đặt (hoặc nút "4 đĩa ▾" trên bàn, nút "Thử n đĩa" ở bảng thắng): `d4`, `d5`, `d6`, `d7`. Đổi số đĩa giữa ván (đã đi ít nhất một nước) phải xác nhận và ván đó tính là thua.

## Ghi điểm trên cổng

- `metric: time_low` (thời gian thấp nhất), điểm game 3; mode `d4` 2 điểm, `d5` 3, `d6` 5, `d7` 7.
- Chống gian lận `min_time_ms`: 3000 / 7000 / 15000 / 30000. Đồng hồ chỉ chạy từ khi xong nước đầu, nên phần tính giờ là 2ⁿ − 2 nước (14 / 30 / 62 / 126). Người rất nhanh, đi tối ưu, mất khoảng 0,25 s mỗi nước (hai lần bấm phím) → 3,5 / 7,5 / 15,5 / 31,5 s; ngưỡng đặt dưới mức đó một chút (≈ 0,21–0,24 s mỗi nước).
- Chia ván mới: `kit.sdk.start(mode)`; mở lại ván lưu dở: `kit.sdk.start(mode, true)`.
- Thắng: `kit.sdk.end({ mode, won: true, timeMs, assisted: false })`.
- Bỏ ván đã đi ít nhất một nước (ván mới, `R`, đổi số đĩa): gửi `won: false`; ván chưa đi nước nào thì không gửi gì.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-thaphanoi-settings-v1` | Cài đặt: giao diện, số đĩa (`mode`) |
| `playnine-thaphanoi-stats-v1` | Đã chơi, giải xong, số lần giải tối ưu, thời gian tốt nhất theo mode |
| `playnine-thaphanoi-save-v1` | Ván đang chơi dở (`{ v, mode, game, elapsed }`), lưu sau mỗi nước và khi rời trang |
| `playnine-thaphanoi-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `1` `2` `3` | Nhấc đĩa ở cọc đó / đặt đĩa đang nhấc lên cọc đó |
| `Esc` | Đặt đĩa đang nhấc về chỗ cũ (đóng hộp thoại nếu đang mở) |
| `R` (hoặc `N`) | Chơi lại (hỏi trước nếu ván đã đi) |
| `Tab` + `Enter` / `Space` | Chọn cọc bằng bàn phím |

## Kiểm tra

```bash
node test.js
```

Test engine: luật đi, thắng, lời giải tối ưu 2ⁿ − 1 nước cho mọi mode, giải được từ 500 trạng thái đi bừa, lưu / khôi phục và từ chối dữ liệu hỏng. Test trong cổng: `e2e.spec.ts` (ván thắng, bỏ ván).
