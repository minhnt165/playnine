# PlayNine

Cổng game PlayNine (17 game JavaScript thuần) triển khai trên GitHub Pages:
https://minhnt165.github.io/playnine/

## Cấu trúc thư mục

```
.
├── games/<dir>/        # mỗi game một thư mục, được copy ra dist/<dir>/
├── brand/              # tài sản thương hiệu, copy ra dist/brand/
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
npm run build              # build portal (và các workspace khác) -> portal/dist/
npm run assemble           # gom portal/dist + games thành dist/ (cần build trước)
npm run e2e                # test Playwright (cần assemble trước; serve dist/ tại :4173/playnine/)
```

Lần đầu chạy e2e cần cài trình duyệt: `npx playwright install chromium`.

## Thêm một game vào portal

1. Đặt game vào `games/<dir>/` (có `index.html`; nếu có `package.json` thì assemble lấy `dist/` của game).
2. Khai báo game trong `portal/src/games/catalog.ts` (id, dir, tên, mô tả, nhãn, icon, ...) theo mẫu các game có sẵn.
3. `npm run build && npm run assemble && npm run e2e` để kiểm tra; URL game luôn là `/playnine/<dir>/`.

## Deploy

Workflow `.github/workflows/deploy.yml` chạy khi push lên `main` (hoặc chạy tay):
`build` (test, build, assemble, upload `dist/`) và `e2e` chạy song song, sau đó `deploy` lên Pages.

## Việc làm tay trước khi merge vào `main`

Vào **Settings → Pages → Source** và đổi sang **"GitHub Actions"**.

Nếu chưa đổi, sau khi merge Pages vẫn deploy từ gốc nhánh `main`; mà nhánh này không còn
thư mục game ở gốc (đã chuyển vào `games/`), nên site sẽ trả 404 cho các game.
