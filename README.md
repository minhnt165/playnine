# PlayNine

Cổng game PlayNine (17 game JavaScript thuần) triển khai trên GitHub Pages:
https://minhnt165.github.io/playnine/

## Cấu trúc thư mục

```
.
├── index.html          # portal cũ (legacy), được assemble ra gốc dist/
├── games/<dir>/        # mỗi game một thư mục, được copy ra dist/<dir>/
├── brand/              # tài sản thương hiệu, copy ra dist/brand/
├── portal/             # portal React (npm workspace, sẽ thêm ở các task sau)
├── scripts/            # assemble.mjs, serve-dist.mjs và test của chúng
├── e2e/                # test Playwright chạy trên dist/
├── docs/               # tài liệu thiết kế và kế hoạch
└── .github/workflows/  # workflow deploy GitHub Pages
```

## Lệnh thường dùng

```bash
npm install                # cài dependency
npm run dev -w portal      # chạy portal ở chế độ dev (khi workspace portal đã có)
npm test                   # test node cho scripts/
npm run build              # build các workspace (nếu có)
npm run assemble           # gom portal + games thành dist/
npm run e2e                # test Playwright (cần assemble trước; serve dist/ tại :4173/playnine/)
```

Lần đầu chạy e2e cần cài trình duyệt: `npx playwright install chromium`.

## Deploy

Workflow `.github/workflows/deploy.yml` chạy khi push lên `main` (hoặc chạy tay):
`build` (test, build, assemble, upload `dist/`) và `e2e` chạy song song, sau đó `deploy` lên Pages.

## Việc làm tay trước khi merge vào `main`

Vào **Settings → Pages → Source** và đổi sang **"GitHub Actions"**.

Nếu chưa đổi, sau khi merge Pages vẫn deploy từ gốc nhánh `main`; mà nhánh này không còn
thư mục game ở gốc (đã chuyển vào `games/`), nên site sẽ trả 404 cho các game.
