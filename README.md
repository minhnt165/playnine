# PlayNine

Cổng game PlayNine (17 game JavaScript thuần) triển khai trên GitHub Pages:
https://minhnt165.github.io/playnine/

## Cấu trúc thư mục

```
.
├── games/<dir>/        # mỗi game một thư mục, được copy ra dist/<dir>/
├── brand/              # tài sản thương hiệu, copy ra dist/brand/
├── sdk/                # SDK cho game (npm workspace); build ra sdk/dist/playnine.js, assemble chép ra dist/sdk/
├── portal/             # portal React (npm workspace); bản build portal/dist/ được assemble ra gốc dist/
├── scripts/            # assemble.mjs, serve-dist.mjs và test của chúng
├── e2e/                # test Playwright chạy trên dist/
├── docs/               # tài liệu thiết kế và kế hoạch
└── .github/workflows/  # workflow deploy GitHub Pages
```

## Lệnh thường dùng

```bash
npm install                # cài dependency
npm run dev -w portal      # chạy portal ở chế độ dev
npm test                   # test node cho scripts/ + test của portal
npm run build              # build SDK (sdk/dist/) rồi portal (portal/dist/)
npm run assemble           # gom portal/dist + games thành dist/ (cần build trước)
npm run e2e                # test Playwright (cần assemble trước; serve dist/ tại :4173/playnine/)
```

Lần đầu chạy e2e cần cài trình duyệt: `npx playwright install chromium`.

## Thêm một game vào portal

1. Đặt game vào `games/<dir>/` (có `index.html`; nếu có `package.json` thì assemble lấy `dist/` của game).
2. Khai báo game trong `portal/src/games/catalog.ts` (id, dir, tên, mô tả, nhãn, icon, ...) theo mẫu các game có sẵn.
3. `npm run build && npm run assemble && npm run e2e` để kiểm tra; URL game luôn là `/playnine/<dir>/`.

## SDK cho game

Game cũ gắn SDK bằng một thẻ script (đường dẫn tương đối, dev và bản publish đều là `/playnine/sdk/playnine.js`) và luôn gọi qua `window.PlayNine` có kiểm tra tồn tại:

```html
<script src="../sdk/playnine.js?v=1"></script>
```

```js
if (window.PlayNine) {
  PlayNine.init({ gameId: '2048' });
  PlayNine.gameStart({ mode: '4x4' });
  PlayNine.gameEnd({ mode: '4x4', won: true, score: 1234 });
}
```

SDK không bao giờ ném lỗi; mở thẳng link game (không có cổng, không có file SDK) vẫn chơi bình thường, chỉ không ghi điểm.
Build SDK: `npm run build -w sdk` (cần trước `npm run assemble`). Giao thức nằm ở `sdk/src/protocol.ts`.

## Server (đăng nhập và bảng xếp hạng)

Phần server dùng Supabase gói Free (Postgres + RPC + Auth). Cổng chỉ hiện nút đăng nhập khi có hai biến môi trường
`VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`; để trống thì cổng chạy như giai đoạn 1 (không gọi mạng).

- Dev local: đặt hai biến trên trong `portal/.env.local` (mẫu ở `portal/.env.example`), chạy `npm run dev -w portal`, mở http://localhost:5180/playnine/.
- Build/deploy: lấy từ GitHub secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` (xem `deploy.yml`). Workflow `.github/workflows/keepalive.yml` gọi `ping()` mỗi ngày để project không bị tạm dừng.
- Test cơ sở dữ liệu: `npm test -w supabase`.
- Hướng dẫn thiết lập từng bước (tạo project, Google OAuth, migration, secrets, đặt admin): [supabase/README.md](supabase/README.md).

Hiện 2 game (Minesweeper, Sudoku) chưa ghi điểm lên server; 15 game còn lại đã gắn SDK.

## Deploy

Workflow `.github/workflows/deploy.yml` chạy khi push lên `main` (hoặc chạy tay):
`build` (test, build, assemble, upload `dist/`) và `e2e` chạy song song, sau đó `deploy` lên Pages.

Chân trang cổng hiện bản đang chạy: `v<version> · <commit> · <thời điểm build>`, bấm vào để mở commit trên GitHub.
Phiên bản lấy từ trường `version` trong `package.json` gốc; tăng số này khi phát hành thay đổi đáng kể.

## Việc làm tay trước khi merge vào `main`

Vào **Settings → Pages → Source** và đổi sang **"GitHub Actions"**.

Nếu chưa đổi, sau khi merge Pages vẫn deploy từ gốc nhánh `main`; mà nhánh này không còn
thư mục game ở gốc (đã chuyển vào `games/`), nên site sẽ trả 404 cho các game.
