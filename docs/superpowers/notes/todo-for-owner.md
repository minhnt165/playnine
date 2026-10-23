# Việc cần chủ dự án làm

Ghi lại trong lúc Claude chạy lộ trình 100 game không dừng. Làm xong mục nào thì đánh dấu `[x]` (hoặc xóa dòng).

## Supabase (áp migration qua SQL Editor vì Supabase CLI bị chặn ở mạng công ty)

- [ ] `supabase/migrations/20261021001700_new_games.sql` — thêm Trượt Số, Lật Thẻ, Bắn Bóng (game 19–21). Chưa áp thì 3 game này không ghi điểm.

- [ ] `supabase/migrations/20261023000100_batch1.sql` — đợt 1, game 22–29: Tắt Đèn, Tháp Hà Nội, Đẩy Thùng, Rót Nước, Nối Màu, Nổ Khối, Xếp Khối, Đoán Mã.

Đợt 0 (nền tảng) không có migration. Áp các file theo đúng thứ tự tên file.

## Repo

- [ ] Working tree `C:/Users/MinhNT165/Workspace/games` đang có phần "báo có bản mới" (UpdateNotice, version.json) của phiên `games-fe`, chưa commit. `main` trên GitHub đã đi trước nhiều commit (đợt 0): `git pull --rebase` trước khi commit phần đó. Các chỗ cùng sửa (App.tsx, dict.ts, vite.config.ts, README.md, e2e/portal.spec.ts) nằm ở dòng khác nhau, rebase sẽ không conflict.
- [ ] Đợt 0 được làm trong worktree `C:/Users/MinhNT165/Workspace/games-batch0` (nhánh `batch0-platform`, luôn bằng `origin/main` sau mỗi lần đẩy). Các đợt game tiếp theo cũng làm ở đây; xong lộ trình thì xóa bằng `git worktree remove ../games-batch0`.

- [ ] Xem tab Actions trên GitHub: các lần đẩy đợt 0 (từ `34fe71f` tới `397eb86`) có workflow Deploy xanh không. Máy làm việc không có `gh` và không gọi được GitHub API nên Claude chưa kiểm tra được CI; ở máy local toàn bộ `npm test` và e2e (93 test) đều xanh.

## Quyết định đã tự chốt (xem lại khi rảnh)

- Nhãn "Mới" giờ tính theo `addedAt` (14 ngày), nên Sudoku cũng có nhãn "Mới" tới 03/11/2026 như các game ra mắt cùng đợt.
- Thể loại chưa có game (Bài, Chữ và số) không hiện nút trên bộ lọc cho tới khi có game đầu tiên.
- Nút "Game" ở sidebar vẫn mở menu nhanh; trang `#/games` vào từ nút "Xem tất cả N game" dưới lưới trang chủ (hiện khi có hơn 24 game).
