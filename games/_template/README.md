# {{nameVi}}

Game {{nameVi}} ({{nameEn}}) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

> Thư mục này được tạo bằng `npm run new-game` từ `games/_template` (game mẫu "chạm 10 lần"). Thay luật, giao diện và các dòng `TODO` theo các bước bên dưới, rồi xóa ghi chú này.

## Việc cần làm khi biến khung này thành game thật

1. `engine.js` + `test.js`: viết luật game dạng hàm thuần (trạng thái cũ vào, trạng thái mới ra), `toJSON` / `fromJSON` cho ván lưu; test trước (`node test.js`).
2. `index.html`, `style.css`, `app.js`: phần chơi trong `<main class="stage">`; giữ thanh trên, các modal Cài đặt / Cách chơi / Thống kê. Đè token màu của kit trong `:root` của `style.css` nếu cần.
3. `i18n.js`: chuỗi tiếng Anh và tiếng Việt (bắt buộc `meta.title`, `meta.description`, `app.name`).
4. `game.json`: điền `sub`, `desc`, `tags`, `note`, nền `preview.bg`, thể loại, và phần `server`:
   - `metric`: `time_low` (nhanh nhất), `score_high` (điểm cao nhất) hoặc `wins` (số ván thắng);
   - mỗi mode có `key`, `label`, `points` và luật chống gian lận `rules` (`min_time_ms`, `min_duration_ms`, `max_score`, `max_score_per_sec`) theo bảng ở mục 4.8 của [lộ trình](../../docs/superpowers/specs/2026-10-23-100-games-roadmap.md);
   - game có nút phải bấm mới bắt đầu ván thì khai `"e2e": { "start": "#id-nút" }` để e2e chung bấm được.
5. `icon.svg` (64×64) và `preview.svg` (khung 4:3, nền trong suốt, hoạt hình bằng CSS bên trong file, có `@media (prefers-reduced-motion: reduce)` tắt hoạt hình, không dùng font ngoài, ≤ 30 KB).
6. `npm run -s seed-sql -- {{id}} > supabase/migrations/<thời điểm>_{{id}}.sql`, rồi áp file đó qua SQL Editor của Supabase.
7. `npm test`, `npm run build && npm run assemble && npm run e2e`. Game có cách thắng xác định được thì thêm `e2e.spec.ts` trong thư mục game (xem các test "won run" trong `e2e/sdk-games.spec.ts`).

## Báo ván cho cổng

- Chia ván mới: `kit.sdk.start(MODE)`; mở lại ván lưu dở: `kit.sdk.start(MODE, true)`.
- Kết thúc: `kit.sdk.end({ mode, won, timeMs | score, assisted })`.
- Bỏ ván đã đi ít nhất một nước: gửi `won: false`; ván chưa đi nước nào thì không gửi gì (tránh đổi bàn liên tục để lấy điểm).

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-{{id}}-settings-v1` | Cài đặt (giao diện…) |
| `playnine-{{id}}-stats-v1` | Thống kê |
| `playnine-{{id}}-save-v1` | Ván đang chơi dở |
| `playnine-{{id}}-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `Space` / `Enter` | Chạm |
| `N` | Ván mới |
| `Esc` | Đóng hộp thoại |

## Kiểm tra engine

```bash
node test.js
```
