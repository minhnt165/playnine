# Supabase cho PlayNine

Thư mục này chứa migration (`migrations/`), test của cơ sở dữ liệu (`tests/`, chạy bằng `npm test -w supabase`) và cấu hình Supabase CLI (`config.toml`).
Làm lần lượt 8 bước dưới đây. Dùng gói Free, không cần thẻ; chỉ dùng Postgres + RPC + Auth (không dùng Edge Functions).

Quy ước: `<ref>` là Project ref của project Supabase (chuỗi trong URL `https://<ref>.supabase.co`).

## 1. Tạo hai project Supabase

1. Vào https://supabase.com/dashboard → **New project**.
2. Tạo `playnine-dev` và `playnine-prod`, **Region: Southeast Asia (Singapore)**, đặt mật khẩu database và lưu lại.
3. Với mỗi project, ghi lại:
   - `Project URL`: **Project Settings → API → Project URL**.
   - `anon key`: **Project Settings → API Keys**. Tên khóa tùy giao diện: khóa `anon` (legacy) hoặc khóa `publishable` đều dùng được, cả hai đều là khóa công khai. Không bao giờ dùng `service_role` hay khóa secret ở bất cứ đâu trong repo hay client.

## 2. Bật đăng nhập Google

Làm cho từng project (dev và prod đều cần).

1. Vào https://console.cloud.google.com → tạo (hoặc chọn) một project.
2. **APIs & Services → OAuth consent screen**: chọn **External**, điền tên ứng dụng, email hỗ trợ, rồi lưu.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, loại **Web application**.
4. Ở **Authorized redirect URIs** thêm `https://<ref>.supabase.co/auth/v1/callback` (thay `<ref>` bằng ref của project; thêm cả hai URI nếu dùng chung một OAuth client cho dev và prod).
5. Lấy **Client ID** và **Client secret**.
6. Trong Supabase: **Authentication → Providers → Google** → bật **Enable Sign in with Google**, dán Client ID/Secret, **Save**.
7. Vào **Google Auth Platform → Audience** (hoặc OAuth consent screen → Publishing status) và bấm **Publish app** để chuyển sang **In production**. App chỉ dùng scope `openid`, `email`, `profile` nên không cần Google xác minh. Nếu để ở **Testing** thì chỉ các test user đã thêm mới đăng nhập được.
8. Nên dùng **một OAuth client duy nhất** cho cả hai project: thêm cả hai redirect URI (`https://<ref-dev>.supabase.co/auth/v1/callback` và `https://<ref-prod>.supabase.co/auth/v1/callback`) vào client đó, rồi dán cùng Client ID/Secret vào Provider Google của cả hai project.
9. Trong Supabase: **Authentication → Providers → Email** → tắt (disable). Chỉ dùng đăng nhập Google.
10. Trong Supabase: **Authentication → Sign In / Providers** → bật **Allow anonymous sign-ins** (cổng tự tạo tài khoản khách cho người chưa đăng nhập) và bật **Allow manual linking** (để khách liên kết Google mà giữ điểm). Nên bật thêm CAPTCHA hoặc giữ rate limit cho anonymous sign-ins vì ai cũng tạo được tài khoản khách.

## 3. URL Configuration

Trong Supabase: **Authentication → URL Configuration**.

| Project | Site URL |
| --- | --- |
| `playnine-prod` | `https://minhnt165.github.io/playnine/` |
| `playnine-dev` | `http://localhost:5180/playnine/` |

Ở **Redirect URLs** thêm cả hai địa chỉ (cho mỗi project):

- `https://minhnt165.github.io/playnine/`
- `http://localhost:5180/playnine/`

Cổng dev chạy cố định ở cổng 5180 (`strictPort`), nên địa chỉ dev luôn là `http://localhost:5180/playnine/`.

## 4. Áp migration

Chạy từ thư mục `supabase/`, lần lượt cho từng project (dev rồi prod). Trước khi `db push`, bật `pg_cron` theo mục "Bật pg_cron" ngay bên dưới:

```bash
cd supabase
npx --registry=https://registry.npmjs.org/ supabase login
npx --registry=https://registry.npmjs.org/ supabase link --project-ref <ref>
npx --registry=https://registry.npmjs.org/ supabase db push
```

- `login` mở trình duyệt để lấy access token (làm một lần).
- `link` hỏi **mật khẩu database** của project đó (đặt ở bước 1; quên thì đặt lại ở **Project Settings → Database**); chạy lại với `<ref>` kia để chuyển sang project còn lại.
- `db push` áp các file trong `migrations/` lên project đang link.
- Luôn `db push` **trước** khi deploy cổng: cổng mới gọi các hàm của migration mới (điểm, bảng điểm theo game, tin tức, đánh giá); deploy cổng trước thì các mục đó báo lỗi tải.
- Mạng công ty chặn TLS (lỗi chứng chỉ): thêm `--strict-ssl=false` vào lệnh `npx`, chỉ khi thật sự bị lỗi.

## Bật pg_cron

Sự kiện được đóng tự động bởi `pg_cron` (mỗi 5 phút). Làm cho từng project, **trước** khi `db push` ở bước 4:

1. Vào **Database → Extensions** → bật `pg_cron`.
2. Sau khi `db push`, kiểm tra lịch đã được tạo: trong **SQL Editor** chạy `select jobname, schedule from cron.job;` phải thấy `playnine-events` với lịch `*/5 * * * *`.

Migration tự bật `pg_cron` và tạo lịch nếu project có extension này; nên bật trước trong Dashboard để chắc chắn. Nếu `cron.job` không có `playnine-events` thì sự kiện sẽ không tự chuyển sang live/closed.

## 5. GitHub secrets (prod)

Trong GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**:

- `SUPABASE_URL`: Project URL của `playnine-prod`.
- `SUPABASE_ANON_KEY`: anon key của `playnine-prod`.

- `SUPABASE_SERVICE_ROLE_KEY`: service_role key của `playnine-prod` (**Project Settings → API Keys**). Chỉ `crawl-news.yml` dùng; key này bỏ qua RLS nên tuyệt đối không đưa vào build cổng.

Hai secret đầu được dùng bởi `deploy.yml` (truyền vào build thành `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`) và `keepalive.yml` (gọi `ping()` mỗi ngày để project Free không bị tạm dừng). Job e2e cố ý không nhận hai biến này để test chạy trên bản không có server và không ghi dữ liệu lên prod. Chưa đặt secret thì build vẫn chạy như giai đoạn 1 (không có nút đăng nhập) và keep-alive tự bỏ qua kèm cảnh báo.

`crawl-news.yml` chạy `scripts/crawl-news.mjs` mỗi 6 giờ: đọc RSS các trang tin game (danh sách ở `SOURCES` trong script), bỏ tin khớp bộ lọc `BLOCKED` (18+, cờ bạc…) rồi gọi `ingest_news()` để thêm tin mới vào bảng `news_feed` (giữ 30 ngày). Chỉ lưu tiêu đề, tóm tắt ngắn, ảnh và link bài gốc. Chạy tay: **Actions → Crawl game news → Run workflow**. Thiếu `SUPABASE_URL` hoặc `SUPABASE_SERVICE_ROLE_KEY` thì job tự bỏ qua kèm cảnh báo. Admin ẩn tin không phù hợp ở tab **Bài viết**.

## 6. Chạy local (dev)

Tạo `portal/.env.local` (file này đã nằm ngoài git) với giá trị của `playnine-dev`:

```
VITE_SUPABASE_URL=https://<ref-dev>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key của dev>
```

Build SDK trước (`npm run build -w sdk`) để game tải được `sdk/playnine.js`, rồi `npm run dev -w portal` và mở `http://localhost:5180/playnine/`. Để trống hai biến thì cổng không hiện nút đăng nhập và không gọi mạng.

## 7. Đặt admin (giai đoạn 3 dùng cho `#/admin`)

Đăng nhập vào site bằng Google một lần để tạo hồ sơ, rồi vào Supabase → **SQL Editor** (của project cần đặt admin) chạy:

```sql
update profiles set role = 'admin' where id = (select id from auth.users where email = '<email>');
```

## 8. Kiểm tra

1. Mở site (prod `https://minhnt165.github.io/playnine/` hoặc dev `http://localhost:5180/playnine/`).
2. Bấm đăng nhập bằng Google.
3. Chơi một ván 2048 đến hết.
4. Thấy toast "Đã ghi điểm" và tên mình trên bảng xếp hạng là xong.

Kiểm tra keep-alive: GitHub → **Actions → Supabase keep-alive → Run workflow**, job phải xanh.

Lưu ý: GitHub tự tắt workflow chạy theo lịch (`schedule`) sau 60 ngày repo không có hoạt động. Nếu keep-alive bị tắt, vào tab **Actions → Supabase keep-alive** và bấm **Enable workflow** (project Free bị tạm dừng sau 7 ngày không có truy cập).
