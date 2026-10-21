# Supabase cho PlayNine

Thư mục này chứa migration (`migrations/`), test của cơ sở dữ liệu (`tests/`, chạy bằng `npm test -w supabase`) và cấu hình Supabase CLI (`config.toml`).
Làm lần lượt 8 bước dưới đây. Dùng gói Free, không cần thẻ; chỉ dùng Postgres + RPC + Auth (không dùng Edge Functions).

Quy ước: `<ref>` là Project ref của project Supabase (chuỗi trong URL `https://<ref>.supabase.co`).

## 1. Tạo hai project Supabase

1. Vào https://supabase.com/dashboard → **New project**.
2. Tạo `playnine-dev` và `playnine-prod`, **Region: Southeast Asia (Singapore)**, đặt mật khẩu database và lưu lại.
3. Với mỗi project, ghi lại:
   - `Project URL`: **Project Settings → API → Project URL**.
   - `anon key`: **Project Settings → API Keys** (khóa `anon` / publishable). Không dùng `service_role` key ở bất cứ đâu trong repo hay client.

## 2. Bật đăng nhập Google

Làm cho từng project (dev và prod đều cần).

1. Vào https://console.cloud.google.com → tạo (hoặc chọn) một project.
2. **APIs & Services → OAuth consent screen**: chọn **External**, điền tên ứng dụng, email hỗ trợ, rồi lưu.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, loại **Web application**.
4. Ở **Authorized redirect URIs** thêm `https://<ref>.supabase.co/auth/v1/callback` (thay `<ref>` bằng ref của project; thêm cả hai URI nếu dùng chung một OAuth client cho dev và prod).
5. Lấy **Client ID** và **Client secret**.
6. Trong Supabase: **Authentication → Providers → Google** → bật **Enable Sign in with Google**, dán Client ID/Secret, **Save**.

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

Chạy từ thư mục `supabase/`, lần lượt cho từng project (dev rồi prod):

```bash
cd supabase
npx --registry=https://registry.npmjs.org/ supabase login
npx --registry=https://registry.npmjs.org/ supabase link --project-ref <ref>
npx --registry=https://registry.npmjs.org/ supabase db push
```

- `login` mở trình duyệt để lấy access token (làm một lần).
- `link` hỏi mật khẩu database của project đó; chạy lại với `<ref>` kia để chuyển sang project còn lại.
- `db push` áp các file trong `migrations/` lên project đang link.
- Mạng công ty chặn TLS (lỗi chứng chỉ): thêm `--strict-ssl=false` vào lệnh `npx`, chỉ khi thật sự bị lỗi.

## 5. GitHub secrets (prod)

Trong GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**:

- `SUPABASE_URL`: Project URL của `playnine-prod`.
- `SUPABASE_ANON_KEY`: anon key của `playnine-prod`.

Hai secret này được dùng bởi `deploy.yml` (truyền vào build thành `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`) và `keepalive.yml` (gọi `ping()` mỗi ngày để project Free không bị tạm dừng). Chưa đặt secret thì build vẫn chạy như giai đoạn 1 (không có nút đăng nhập) và keep-alive tự bỏ qua kèm cảnh báo.

## 6. Chạy local (dev)

Tạo `portal/.env.local` (file này đã nằm ngoài git) với giá trị của `playnine-dev`:

```
VITE_SUPABASE_URL=https://<ref-dev>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key của dev>
```

Rồi `npm run dev -w portal` và mở `http://localhost:5180/playnine/`. Để trống hai biến thì cổng không hiện nút đăng nhập và không gọi mạng.

## 7. Đặt admin (dùng ở giai đoạn 3)

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
