# Tắt Đèn

Game Tắt Đèn (Lights Out) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Bàn là lưới bóng đèn, mỗi đèn sáng hoặc tắt.
- Chạm một đèn sẽ đảo nó và 4 đèn ngay trên, dưới, trái, phải (đèn ở mép / góc chỉ có 3 hoặc 2 đèn kề).
- Tắt hết đèn là thắng.
- Bàn được sinh bằng cách bấm ngẫu nhiên `par` ô khác nhau lên bàn tắt hết, nên **bàn nào cũng giải được** trong `par` lần bấm hoặc ít hơn. `par` là cận trên, không phải số lần bấm ít nhất. Bàn sinh ra không bao giờ đã tắt sẵn.
- HUD hiện cấp, số nước của lần chơi bàn này và par.

## Cấp độ và cỡ bàn (mode)

| Mode | Lần bấm khi sinh bàn (par) | Điểm trên cổng |
| --- | --- | --- |
| `5x5` (mặc định) | 2 + cấp, tối đa 15 | 4 |
| `7x7` | 4 + cấp, tối đa 30 | 6 |

- Mỗi lần thắng lên một cấp: bàn sau xáo thêm một lần bấm. Mỗi cỡ bàn có cấp riêng, lưu trong thống kê.
- Đổi cỡ bàn trong Cài đặt (nút chọn 5x5 / 7x7) hoặc bấm huy hiệu cỡ bàn cạnh tên game.
- **Chơi lại** đưa bàn về như lúc đầu (số nước về 0), vẫn là cùng ván. **Bàn mới** chia bàn khác cùng cấp.

## Ghi điểm trên cổng

- Metric `wins`: mỗi bàn là một ván. Bàn mới: `kit.sdk.start(mode)`; mở lại bàn lưu dở: `kit.sdk.start(mode, true)`.
- Thắng: `kit.sdk.end({ mode, won: true, timeMs, assisted: false })` (`timeMs` tính từ lần bấm đầu tiên, cộng dồn qua các lần chơi lại).
- Bỏ bàn đã bấm ít nhất một lần (Bàn mới hoặc đổi cỡ bàn, có hỏi xác nhận): `won: false`. Bàn chưa bấm lần nào thì không gửi gì.
- Luật chống gian lận của cả hai mode: `min_duration_ms` 3000.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-tatden-settings-v1` | Cài đặt (giao diện, cỡ bàn `size`) |
| `playnine-tatden-stats-v1` | Thống kê: đã chơi, đã giải, bằng / dưới par, chuỗi thắng, cấp của từng cỡ bàn |
| `playnine-tatden-save-v1` | Bàn đang chơi dở (chỉ khi đã bấm ít nhất một lần): `{ v, game, elapsed }` |
| `playnine-tatden-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google. Ván lưu hỏng, khác phiên bản hoặc bàn không giải được thì bị bỏ và chia bàn mới.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `↑` `↓` `←` `→` | Di chuyển ô đang chọn |
| `Space` / `Enter` | Bấm ô đang chọn |
| `R` | Chơi lại bàn này |
| `N` | Bàn mới |
| `Esc` | Đóng hộp thoại |

Trên điện thoại: chạm thẳng vào đèn.

## Kiểm tra

```bash
node test.js
```

Test engine phủ luật bấm, thắng, chơi lại, sinh bàn theo seed (không tắt sẵn, giải được trong par, khó dần theo cấp), bộ giải GF(2) và lưu / khôi phục / từ chối ván hỏng. Test trong cổng: `e2e.spec.ts` (ván thắng, bỏ bàn, đổi cỡ trước nước đầu).
