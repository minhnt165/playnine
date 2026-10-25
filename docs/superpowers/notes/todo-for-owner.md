# Việc cần chủ dự án làm

Ghi lại trong lúc Claude chạy lộ trình 100 game không dừng. Làm xong mục nào thì đánh dấu `[x]` (hoặc xóa dòng).

## Supabase (áp migration qua SQL Editor vì Supabase CLI bị chặn ở mạng công ty)

- [x] `supabase/migrations/20261021001700_new_games.sql` — thêm Trượt Số, Lật Thẻ, Bắn Bóng (game 19–21). Chưa áp thì 3 game này không ghi điểm.

- [x] `supabase/migrations/20261023000100_batch1.sql` — đợt 1, game 22–29: Tắt Đèn, Tháp Hà Nội, Đẩy Thùng, Rót Nước, Nối Màu, Nổ Khối, Xếp Khối, Đoán Mã.

- [x] `supabase/migrations/20261023000200_batch2.sql` — đợt 2, game 30–37: Cá Ngựa, Tangram, Cờ Thú, Cờ Đơn, Hoa Dung Đạo, Rắn Leo Thang, Cờ Chín Quân, Xí Ngầu.

- [x] `supabase/migrations/20261023000300_batch3.sql` — đợt 3, game 38–45: Xì Dách, Xếp Bài Nhện, Ô Trống, Kim Tự Tháp, Ba Đỉnh, Bài Tám, Poker Rút, Đô-mi-nô.

- [x] `supabase/migrations/20261023000400_batch4.sql` — đợt 4, game 46–53: Chim Bay, Nhảy Cao, Qua Đường, Đập Chuột, Xếp Tầng, Bóng Bàn, Bắn Phi Thuyền, Thiên Thạch.

- [x] `supabase/migrations/20261023000500_batch5.sql` — đợt 5, game 54–61: Kakuro, Ô Số Tính, Cầu Nối, Vòng Kín, Nhị Phân, Lều Trại, Hitori, Chia Ô.

- [x] `supabase/migrations/20261023000600_batch6.sql` — đợt 6, game 62–69: Đoán Chữ, Tìm Chữ, Ghép Chữ, Tính Nhẩm, Tính 24, Nhớ Nhịp, Gõ Nhanh, Dãy Số.

- [x] `supabase/migrations/20261023000700_batch7.sql` — đợt 7, game 70–77: Bắn Tàu, Ô Vuông, Cờ Lục Giác, Cờ Nhảy, Xoay Cờ, Vệt Sáng, Khúc Côn Cầu, Pháo Thủ.
- [x] `supabase/migrations/20261023000800_batch8.sql` — đợt 8, game 78–85: Xì Tố, Gin Rummy, Bài Bích, Cờ Vây, Cờ Tào Cáo, Bi-a, Mạt Chược Ghép, Bài Tim.
- [x] `supabase/migrations/20261023000900_batch9.sql` — đợt 9, game 86–93: Mê Cung, Ghép Ba, Mê Cung Ma, Hạ Cánh, Chạy Vô Tận, Ghép Hình, Phòng Không, Thoát Xe.
- [ ] `supabase/migrations/20261023001000_batch10.sql` — đợt 10, game 94–100: Sao Chiến, Masyu, Bất Đẳng, Phản Xạ, Pinball, Cột Ngọc, Cờ Tỷ Phú.
- [ ] `supabase/migrations/20261023001100_milestone100.sql` — mốc 100: bài viết "PlayNine đã có 100 game" (ghim, đăng 25/10) và sự kiện "Mừng 100 game: Ghép Ba" (26/10 8:00 → 2/11 8:00, giờ VN; sửa được trong admin trước khi bắt đầu).

Đợt 0 (nền tảng) không có migration. Áp các file theo đúng thứ tự tên file.

## Repo

- [x] Working tree `C:/Users/MinhNT165/Workspace/games` đang có phần "báo có bản mới" (UpdateNotice, version.json) của phiên `games-fe`, chưa commit. `main` trên GitHub đã đi trước nhiều commit (đợt 0): `git pull --rebase` trước khi commit phần đó. Các chỗ cùng sửa (App.tsx, dict.ts, vite.config.ts, README.md, e2e/portal.spec.ts) nằm ở dòng khác nhau, rebase sẽ không conflict.
- [ ] Đợt 0 được làm trong worktree `C:/Users/MinhNT165/Workspace/games-batch0` (nhánh `batch0-platform`, luôn bằng `origin/main` sau mỗi lần đẩy). Các đợt game tiếp theo cũng làm ở đây; xong lộ trình thì xóa bằng `git worktree remove ../games-batch0`.

- [ ] Xem tab Actions trên GitHub: các lần đẩy đợt 0 (từ `34fe71f` tới `397eb86`) có workflow Deploy xanh không. Máy làm việc không có `gh` và không gọi được GitHub API nên Claude chưa kiểm tra được CI; ở máy local toàn bộ `npm test` và e2e (93 test) đều xanh.

- [ ] Thử **Gõ Nhanh** trên điện thoại thật (iOS và Android/Gboard): bàn phím ảo bật lên khung có co vừa không, gõ có bị chặn nhầm là "dán / gõ tự động" khi bàn phím gợi ý từ hay tự sửa không. Máy làm việc chỉ giả lập được.

- [ ] **Chơi thử máy ở các game đợt 8** (test tự động chỉ đo máy đấu máy): **Xì Tố** — máy Khó thắng 3 máy ngẫu nhiên chỉ 72% (poker may rủi; tay đôi 93%), cần xem máy Dễ có quá lỳ, máy Khó tháu cáy/bỏ bài hợp lý không, giải có dài quá 20 phút không; **Cờ Vây** — cảm giác và độ mạnh mức Khó, nhất là trên điện thoại; **Bi-a** — máy Khó vào bi ~75% số cú, có thể quá khó với người chơi thường, và cảm giác ngắm trên điện thoại; **Mạt Chược Ghép** — độ dễ đọc bàn Rùa trên điện thoại dọc (mặc định điện thoại dọc mở bàn Tháp).

- [ ] **Liên kết Google cho tài khoản khách**: trong Supabase → Authentication → Sign In / Providers, kiểm tra đã bật **Allow manual linking** (thiếu thì nút "Liên kết tài khoản Google" báo "chưa được bật"). Nếu tài khoản Google đó đã từng đăng nhập PlayNine thì Supabase không cho liên kết vào tài khoản khách: cổng giờ báo rõ và hướng dẫn chọn "Đã có tài khoản: đăng nhập bằng Google" (điểm của tài khoản khách hiện tại không chuyển sang). Nếu vẫn lỗi, gửi mình nguyên URL sau khi quay về từ Google hoặc dòng chữ báo lỗi.

- [ ] **Chơi thử Cờ Tỷ Phú và Pinball**: Cờ Tỷ Phú — ván 30 vòng khoảng 13–16 phút ở tốc độ Thường, máy mỗi lượt 5–7 s (chậm thì giảm `pace()` trong `games/cotyphu/app.js`); máy Khó về nhất 65% trước 3 máy Dễ. Pinball — cảm giác flipper và độ khó bàn "Tinh Vân" trên điện thoại.

## Cần bạn quyết định

- [ ] **Cá Ngựa dài:** theo luật quốc tế chuẩn, một ván trung bình khoảng 480 lần tung (vài phút ở tốc độ Nhanh). Có muốn rút ngắn không, ví dụ cho tung thêm khi đá quân hoặc khi về đích? Hiện giữ luật chuẩn.

- [ ] **Ô "Hằng ngày" trên trang chủ mở game ở mode mặc định**, người chơi phải tự chuyển sang đề hằng ngày trong game (Ghép Ba, Mê Cung, Ghép Hình, Mạt Chược Ghép…). Cổng chưa có cách mở thẳng một mode (ví dụ `#/play/<id>?mode=daily`). Đề xuất: thêm tham số mode vào route play và kit đọc nó; nếu chưa làm thì giữ như hiện tại.

## Quyết định đã tự chốt (xem lại khi rảnh)

- Nhãn "Mới" giờ tính theo `addedAt` (14 ngày), nên Sudoku cũng có nhãn "Mới" tới 03/11/2026 như các game ra mắt cùng đợt.
- Thể loại chưa có game (Bài, Chữ và số) không hiện nút trên bộ lọc cho tới khi có game đầu tiên.
- Đô-mi-nô: ngưỡng chống gian lận 8 giây thay vì 20 giây đã dự kiến, vì mô phỏng 100.000 trận cho thấy 1,5–3,7% trận thắng thật tới 50 điểm xong dưới 20 giây; 8 giây là mức sàn chứng minh được từ nhịp máy.
- Nút "Game" ở sidebar vẫn mở menu nhanh; trang `#/games` vào từ nút "Xem tất cả N game" dưới lưới trang chủ (hiện khi có hơn 24 game).
- Hiệu năng (mốc 50 game): màn chờ lúc tải lần đầu giờ hiện logo PlayNine ngay (vòng xoay vẫn hiện sau 0,3 s); khối Spotlight đầu trang chỉ trượt lên, không còn mờ dần; trang chủ chỉ dựng 24 thẻ thay vì dựng hết rồi ẩn. Mục đích: Lighthouse điện thoại từ ~60 lên 85–87.
- Điểm cổng một số game đối kháng thấp hơn mức 10/15/25 của lộ trình: Bắn Tàu 5/10/20 (may rủi nhiều, người chơi bình thường gần như chắc thắng máy Dễ), Vệt Sáng 6/10/16 (trận 1–2 phút, ngang Bóng Bàn).
- Cờ Lục Giác bật luật đổi bên (pie rule) mặc định, tắt được trong Cài đặt: không có nó thì đặt giữa bàn ở nước đầu là thắng máy quá dễ.
- Bài Bích: mốc thắng trận mặc định 300 (tùy chọn 500), hai mốc cùng điểm cổng; đồng đội của bạn luôn là máy Khó, mức trong Cài đặt chỉ áp cho đối thủ.
- Cờ Tào Cáo: trận một ván, bỏ doubling cube (gấp đôi để máy bỏ sẽ kết thúc ván quá sớm, mà cổng chỉ ghi thắng/thua); gammon/backgammon vẫn hiện trong kết quả.
- Cờ Vây: có thêm bàn 13×13 và chế độ 2 người (không gửi điểm); luật khu vực + siêu ko, không có bước đánh dấu quân chết (để không sửa được kết quả ván xếp hạng).
- Mạt Chược Ghép: gợi ý và xáo lại gửi `assisted: true` (không phạt cộng giây vì máy chủ từ chối `timeMs` lệch thời gian thật).
- Thoát Xe: tên tiếng Anh "Traffic Jam" (tên chung của thể loại; "Rush Hour" là nhãn hiệu ThinkFun), đề sinh tự động; metric `wins` theo bàn — chơi lại bàn dễ vẫn được tính thắng nhưng đã bị chặn bởi luật sẵn có "20 ván đầu mỗi người/game/ngày".
- Cờ Tỷ Phú: bàn 28 ô tự thiết kế (địa danh VN và thế giới, tiền ảo ¤), bỏ đấu giá, giao dịch chỉ là mua đất bằng tiền, hết ván sau 30 vòng tính theo tài sản; không dùng tên/tài sản Monopoly.
- Phản Xạ: thêm mode `reaction` (đo phản ứng 5 lần, điểm = 1000 − ms trung bình, 2 điểm cổng) bên cạnh `classic` (ngắm bắn 60 s).
- Cổng cho 100 game: thanh đổi game trong màn chơi chỉ còn 8 game (đang chơi, gần đây, yêu thích), mục Games ở thanh bên mở trang Tất cả game (bỏ popup tìm game), trang Tất cả game mặc định xem gọn, nhãn "Mới" chỉ cho 12 game mới nhất.
- Ghép Hình: bàn vuông 4×4 / 6×6 / 8×8, không xoay mảnh; "Xem hình" không tính trợ giúp. Mê Cung Ma: nhân vật đom đóm, ma và mê cung tự thiết kế (không dùng tài sản Pac-Man).
