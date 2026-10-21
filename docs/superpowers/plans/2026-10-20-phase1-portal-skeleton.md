# Giai đoạn 1 — Khung mới (cổng React ngang bằng cổng cũ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dời 17 game vào `games/`, dựng npm workspaces + build/deploy bằng GitHub Actions, và viết lại cổng thành app React ngang bằng `index.html` hiện tại — kết thúc giai đoạn site chạy y như bây giờ, chưa có server.

**Architecture:** Mã nguồn chia `portal/` (React + TS + Vite), `games/<thư mục>/` (game cũ, chép nguyên khi deploy) và `scripts/` (ghép `dist/`). Bước ghép đặt cổng ở gốc `dist/` và mỗi game ở `dist/<thư mục>/`, nên URL không đổi. Bộ test Playwright viết trước, chạy trên cổng cũ, rồi dùng làm thước đo "ngang bằng" cho cổng React.

**Tech Stack:** Node 24, npm workspaces, React 19, TypeScript 5, Vite 7, Vitest 3 + Testing Library + jsdom, Playwright, GitHub Actions (`actions/upload-pages-artifact`, `actions/deploy-pages`).

**Spec:** [docs/superpowers/specs/2026-10-20-portal-platform-design.md](../specs/2026-10-20-portal-platform-design.md) — mục 4.1, 4.2, 6.1, 10 (giai đoạn 1).

## Global Constraints

- Base path production: `/playnine/` (`https://minhnt165.github.io/playnine/`).
- URL không được đổi: `/playnine/<thư mục>/` cho cả 17 game (gồm `sugoku/` cho id `sudoku`, `xiangqi/`), và `/playnine/#/play/<id>`.
- Game cũ: chỉ `git mv`, **không sửa một dòng nào** trong giai đoạn này, không chạy formatter trên chúng.
- Formatter (Prettier) chỉ chạy trên file mới, truyền đường dẫn cụ thể.
- Khóa `localStorage` giữ nguyên: `playnine-lang`, `game-portal-theme-v1`, `game-portal-recent-v1`, `game-portal-filter-v1`, `playnine-<id>-summary-v1`, `sudoku-vn-stats-v1`, `sudoku-vn-save-v1`, `xiangqi.level`.
- Mọi đọc/ghi `localStorage` bọc try/catch; lỗi thì coi như không có dữ liệu.
- Cổng React giữ **nguyên id và class** của DOM cổng cũ (`#games`, `#today`, `#filters`, `#stats`, `#lang-btn`, `#theme-btn`, `#player`, `#p-back`, `#p-title`, `#p-chip`, `#p-switch`, `#p-menu`, `#p-menu-list`, `#p-newtab`, `#p-full`, `#frames`, `#p-loading`, `.card`, `.tile`, `.preview.pv-<id>`, `.reveal`, `body.playing`, `body.revealed`…) vì CSS được chép nguyên và e2e dùng chúng.
- Chuỗi giao diện: chép nguyên `DICT` en/vi từ `index.html` cũ. Chuỗi từ DICT là tin cậy (được render HTML); chữ do game ghi (`summary`) luôn render dạng text.
- README, comment: tiếng Việt. Commit message: tiếng Anh, kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Không phát sinh chi phí; không thêm dịch vụ ngoài.

## Review Focus

1. `localStorage` ném lỗi (Safari private, bị chặn) → cổng vẫn vẽ đủ trang chủ với dữ liệu trống. Test ở Task 3.
2. Dữ liệu game ghi bị hỏng (JSON lỗi, sai kiểu, `v` khác 1) → bỏ qua game đó, không vỡ trang. Test ở Task 4.
3. `#/play/<id-không-tồn-tại>` → hiện trang chủ, không lỗi. Test ở Task 7.
4. Mở thẳng `#/play/2048` lần đầu rồi bấm nút Back trên thanh → về trang chủ của cổng (không rời site). Test e2e ở Task 1 (chạy lại ở Task 8).
5. Đổi ngôn ngữ bên trong game (sự kiện `storage`) khi đang chơi → thanh cổng đổi chữ tại chỗ, iframe không bị tải lại. Test ở Task 7.

---

## File Structure

```
package.json                     workspaces: ["portal"]; scripts build / assemble / e2e / test
scripts/assemble.mjs             ghép dist/ (hàm assemble + CLI)
scripts/assemble.test.mjs        node:test cho assemble
scripts/serve-dist.mjs           server tĩnh: phục vụ dist/ tại /playnine/ (cho e2e và xem thử)
playwright.config.ts             webServer = serve-dist
e2e/legacy-urls.spec.ts          17 URL game cũ
e2e/portal.spec.ts               hành vi cổng (ngang bằng)
.github/workflows/deploy.yml     build + assemble + deploy Pages
games/<17 thư mục>/              dời từ gốc, không sửa
README.md                        mới: cấu trúc repo, lệnh, việc làm tay (đổi nguồn Pages)
portal/
  package.json, tsconfig.json, vite.config.ts, index.html
  vite/serve-games.ts            plugin dev: /playnine/<thư mục>/ và /playnine/brand/ → file trong repo
  src/main.tsx, src/App.tsx
  src/styles/portal.css          chép nguyên CSS cổng cũ
  src/lib/storage.ts             readJSON, readRaw, write
  src/lib/time.ts                pad2, dateKeyOf, fmtDuration, fmtAgo, greetingKey
  src/i18n/dict.ts               DICT chép nguyên
  src/i18n/i18n.tsx              I18nProvider, useI18n (t, loc, lang, setLang, fmtDate, fmtNumber)
  src/theme/useTheme.ts          auto/light/dark
  src/games/catalog.ts           GAMES, CATS, kiểu GameDef
  src/data/*.ts                  sudoku, xiangqi, summary, recent
  src/home/*.tsx|ts              Topbar, Hero, Today (+ buildTodayTiles), GameGrid, Filters, GameCard (+ ribbonFor), Stats (+ buildStats), Footer
  src/legacy/previews.js         chép Previews cũ, đổi phần phụ thuộc
  src/legacy/glyphs.js           chép Glyphs cũ, đổi phần phụ thuộc
  src/player/route.ts            parseRoute, playHref, gameHref
  src/player/Player.tsx          thanh + iframe
  src/player/frames.ts           quyết định giữ/gỡ iframe
  src/**/*.test.ts(x)
```

---

### Task 1: Dời game, ghép `dist/`, và bộ e2e trên cổng cũ

Cổng trong task này vẫn là `index.html` cũ ở gốc repo; bước ghép chép nó vào `dist/`. Bộ e2e viết ở đây chính là định nghĩa "ngang bằng" cho cả giai đoạn.

**Files:**
- Move: 17 thư mục `2048 bonlientiep caro co9o codam coganh colat covua minesweeper oanquan phagach ran sugoku tranhan xepbai xepgach xiangqi` → `games/`
- Create: `package.json`, `scripts/assemble.mjs`, `scripts/assemble.test.mjs`, `scripts/serve-dist.mjs`, `playwright.config.ts`, `e2e/legacy-urls.spec.ts`, `e2e/portal.spec.ts`, `.gitignore` (`node_modules/`, `dist/`, `portal/dist/`, `test-results/`, `playwright-report/`)

**Interfaces:**
- Produces:
  - `assemble({ root: string, out: string, portalDir: string }): Promise<void>` — xóa rồi tạo `out`; chép mọi file của `portalDir` vào `out/`; với mỗi thư mục `games/<d>`: nếu có `package.json` thì chép `games/<d>/dist/` sang `out/<d>/`, ngược lại chép nguyên `games/<d>/`; bỏ qua thư mục bắt đầu bằng `_`; chép `brand/` sang `out/brand/`; tạo `out/.nojekyll`. CLI: `node scripts/assemble.mjs [--portal <dir>]`, mặc định `--portal` là thư mục chỉ chứa `index.html` gốc (task này: tạo `out/index.html` từ `<root>/index.html`).
  - `serve-dist.mjs`: `node scripts/serve-dist.mjs [port=4173]` phục vụ `dist/` tại `/playnine/`, `/` chuyển hướng sang `/playnine/`, thư mục trả `index.html`.
  - Lệnh npm gốc: `build` (workspaces build, task này chưa có gì), `assemble`, `test` (= `node --test scripts/` + `npm test -w portal` khi có), `e2e` (= `playwright test`).

- [ ] **Step 1: `git mv` 17 thư mục vào `games/`.** Chạy `git status` thấy chỉ có rename (R100), không có modify.

- [ ] **Step 2: Viết test cho `assemble`** (`scripts/assemble.test.mjs`, `node:test`, dựng cây giả trong thư mục tạm):
  - `copies legacy game folders verbatim` — `games/abc/index.html` → `out/abc/index.html` cùng nội dung.
  - `uses dist of games with package.json` — `games/neo/package.json` + `games/neo/dist/index.html` → `out/neo/index.html`; `out/neo/package.json` không tồn tại.
  - `skips underscore folders` — `games/_template/` không có trong `out`.
  - `copies portal, brand and writes .nojekyll` — `out/index.html`, `out/brand/icon.svg`, `out/.nojekyll` tồn tại.
  - `clears stale output` — file cũ trong `out` bị xóa.

- [ ] **Step 3: Chạy `node --test scripts/`** → FAIL (chưa có module).

- [ ] **Step 4: Viết `scripts/assemble.mjs`** (dùng `fs.cp` recursive) và `scripts/serve-dist.mjs` (`node:http`, không thêm dependency; content-type theo đuôi file: html, js, css, svg, png, json, webmanifest, woff2).

- [ ] **Step 5: Chạy `node --test scripts/`** → PASS.

- [ ] **Step 6: Viết e2e.** `playwright.config.ts`: `webServer: { command: 'node scripts/serve-dist.mjs 4173', url: 'http://localhost:4173/playnine/' }`, `baseURL: 'http://localhost:4173/playnine/'`, project Chromium desktop và một project mobile (`devices['Pixel 7']`) chỉ chạy `legacy-urls`.
  - `e2e/legacy-urls.spec.ts`: với mỗi thư mục trong 17 thư mục, `goto('<d>/')` → status 200, `document.title` khác rỗng, không có `pageerror`.
  - `e2e/portal.spec.ts` (tên test là hợp đồng, giữ nguyên ở Task 8):
    - `home lists 17 games` — `#games > li` có 17 phần tử.
    - `filter persists after reload` — bấm nút lọc thứ 2 trong `#filters` → `aria-pressed="true"`; reload → vẫn `true`; số `li:not([hidden])` bằng số trong thẻ `<b>` của nút.
    - `language toggle` — bấm `#lang-btn` → `h1` chứa "chơi gì?", `html[lang="vi"]`; bấm lại → "play today?".
    - `theme toggle cycles` — bấm `#theme-btn` lần lượt → `html[data-theme]` = `light`, `dark`, rồi không còn thuộc tính.
    - `resume tile from summary` — `addInitScript` ghi `playnine-2048-summary-v1` = `{ v: 1, updatedAt: Date.now(), played: 3, won: 1, resume: { title: '<b>x</b> 1234', detail: 'd' } }` → trong `#today` có `.tile-title` với **text** đúng `<b>x</b> 1234`.
    - `play route opens iframe` — `goto('#/play/2048')` → `body.playing`, `#frames iframe.on` có `src` kết thúc bằng `2048/index.html`, `document.title` = `2048 · PlayNine`.
    - `back from deep link goes home` — `goto('#/play/2048')`, bấm `#p-back` → URL không còn `#/play`, `body` không có `playing`, `#games` hiển thị.
    - `switch game keeps history` — từ trang chủ bấm thẻ 2048, rồi trong `#p-switch` bấm game khác → `goBack()` một lần về trang chủ.
    - `number shortcut opens game` — ở trang chủ nhấn `1` → URL `#/play/co9o`.
    - `unknown game id shows home` — `goto('#/play/khongco')` → `#games` hiển thị, không `pageerror`.

- [ ] **Step 7: Chạy `npm install`, `npx playwright install chromium`, `npm run assemble && npm run e2e`** → PASS toàn bộ trên cổng cũ. Test nào fail ở đây là test viết sai, sửa test (không sửa `index.html`).

- [ ] **Step 8: Commit** — `git add -A` rồi commit `Move games into games/ and assemble dist with e2e coverage of the current portal`.

---

### Task 2: Workflow deploy GitHub Pages

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`

**Interfaces:**
- Consumes: lệnh `npm run build`, `npm run assemble`, `npm test` của Task 1.

- [ ] **Step 1: Viết `deploy.yml`:** trigger `push` lên `main` + `workflow_dispatch`; `permissions: { contents: read, pages: write, id-token: write }`; `concurrency: pages`. Job `build`: `actions/checkout`, `actions/setup-node` (node 24, cache npm), `npm ci`, `npm test`, `npm run build`, `npm run assemble`, `actions/upload-pages-artifact` với `path: dist`. Job `deploy` (needs build): `actions/deploy-pages`, `environment: github-pages`. Thêm job `e2e` song song trước deploy: cài Chromium, `npm run e2e`; `deploy` cần cả `build` và `e2e`.

- [ ] **Step 2: Kiểm tra cú pháp:** `npx --yes @action-validator/cli .github/workflows/deploy.yml` (hoặc `actionlint` nếu có) → không lỗi.

- [ ] **Step 3: Viết `README.md` gốc:** cấu trúc thư mục; lệnh `npm install`, `npm run dev -w portal`, `npm test`, `npm run assemble`, `npm run e2e`; mục **Việc làm tay trước khi merge vào `main`**: Settings → Pages → Source = "GitHub Actions" (nếu chưa đổi, merge xong site sẽ trả 404 cho game vì nhánh không còn thư mục game ở gốc).

- [ ] **Step 4: Commit** `Add GitHub Pages deploy workflow and repo README`.

---

### Task 3: Khung cổng React, thư viện nền (storage, thời gian, i18n, giao diện)

**Files:**
- Create: `portal/package.json` (name `@playnine/portal`, scripts `dev`, `build` = `tsc -b && vite build`, `test` = `vitest run`), `portal/tsconfig.json` (strict, `allowJs: true`, `checkJs: false`), `portal/vite.config.ts`, `portal/vite/serve-games.ts`, `portal/index.html`, `portal/src/main.tsx`, `portal/src/App.tsx`, `portal/src/styles/portal.css`, `portal/src/lib/storage.ts`, `portal/src/lib/time.ts`, `portal/src/i18n/dict.ts`, `portal/src/i18n/i18n.tsx`, `portal/src/theme/useTheme.ts`
- Modify: `package.json` gốc (`workspaces: ["portal"]`)
- Test: `portal/src/lib/storage.test.ts`, `portal/src/lib/time.test.ts`, `portal/src/i18n/i18n.test.tsx`, `portal/src/theme/useTheme.test.ts`

**Interfaces:**
- Produces:
  - `readJSON<T = unknown>(key: string): T | null`, `readRaw(key: string): string | null`, `write(key: string, value: string): void`
  - `pad2(n: number): string`, `dateKeyOf(d: Date): string` (`YYYY-MM-DD` giờ máy), `fmtDuration(sec: number): string`, `fmtAgo(ts: number, t: TFn, now?: number): string`, `greetingKey(d: Date): 'greet.late'|'greet.morning'|'greet.noon'|'greet.afternoon'|'greet.evening'`
  - `type Lang = 'en' | 'vi'`; `type Localized<T> = T | { en: T; vi?: T }`; `type TFn = (key: string, params?: Record<string, string | number>) => string`
  - `I18nProvider`, `useI18n(): { lang: Lang; setLang(l: Lang): void; t: TFn; loc<T>(v: Localized<T>): T; fmtDate(d: Date, o: Intl.DateTimeFormatOptions): string; fmtNumber(n: number): string; weekdayOf(d: Date): string }`
  - `LANG_KEY = 'playnine-lang'`, `THEME_KEY = 'game-portal-theme-v1'`
  - `useTheme(): { theme: 'auto'|'light'|'dark'; cycle(): void }`

- [ ] **Step 1: Scaffold.** `vite.config.ts`: `base: '/playnine/'`, plugin React, plugin `serveGames()`, `test: { environment: 'jsdom', setupFiles: ['src/test-setup.ts'] }`. `serveGames()` chỉ chạy ở dev: middleware map `/playnine/brand/*` → `<repo>/brand/*` và `/playnine/<d>/*` → `<repo>/games/<d>/*` khi `games/<d>` tồn tại (yêu cầu kết thúc bằng `/` thì trả `index.html`). `portal/index.html`: chép phần `<head>` cũ (meta, icon, manifest, preconnect + font không chặn vẽ, script áp theme/lang trước khi vẽ) với đường dẫn `brand/...` (nếu Vite cố bundle các đường dẫn này và báo lỗi, đổi thành `%BASE_URL%brand/...` để Vite để nguyên); body có `<canvas id="bg" aria-hidden="true">` và `<div id="root">`. `portal.css`: chép nguyên nội dung giữa `<style>` và `</style>` của `index.html` cũ (dòng 29–708), không sửa. Chạy `npm run dev -w portal`, mở `http://localhost:5173/playnine/2048/` → game chạy.

- [ ] **Step 2: Viết test thư viện nền:**
  - `storage`: `readJSON returns null when getItem throws` (spy `Storage.prototype.getItem` ném lỗi) ; `readJSON returns null on invalid JSON`; `write swallows setItem errors`.
  - `time`: `fmtDuration(59) === '00:59'`, `fmtDuration(3725) === '1:02:05'`, `fmtDuration(-3) === '00:00'`; `fmtAgo` với `now - 30s` → key `ago.now`, `now - 5 phút` → `ago.min` n=5, `now - 25h` → `ago.yesterday`, `now - 3 ngày` → `ago.day` n=3; `greetingKey` giờ 4/10/12/17/20 → late/morning/noon/afternoon/evening.
  - `i18n`: mặc định `en` khi khóa trống hoặc giá trị lạ; `t('cat.all')` = `All`/`Tất cả`; `t('missing.key')` = `'missing.key'`; thay `{n}`; dạng `{ one, other }` chọn `one` khi `n === 1`; `setLang('vi')` ghi `localStorage['playnine-lang'] = 'vi'` và đặt `document.documentElement.lang = 'vi'`; **phát sự kiện `storage` với key `playnine-lang`, newValue `vi` → `lang` thành `vi` mà không cần `setLang`**; `loc({ en: 'A' })` khi `vi` → `'A'`.
  - `useTheme`: giá trị lưu lạ → `auto`; `cycle()` auto→light→dark→auto, ghi `THEME_KEY`, `light`/`dark` đặt `data-theme`, `auto` gỡ thuộc tính; sau khi đổi, `meta#theme-color` nhận giá trị `--bg` tính được.

- [ ] **Step 3: Chạy `npm test -w portal`** → FAIL.

- [ ] **Step 4: Viết các module.** `dict.ts`: chép nguyên `DICT` cũ (dòng 788–954 của `index.html`), export `DICT` có kiểu `Record<Lang, Record<string, string | { one: string; other: string }>>`. `I18nProvider` cập nhật `<meta name="description">` theo `meta.description` như cũ.

- [ ] **Step 5: Chạy `npm test -w portal`** → PASS. `npm run build -w portal` → không lỗi TS.

- [ ] **Step 6: Commit** `Scaffold React portal with storage, time, i18n and theme foundations`.

---

### Task 4: Danh mục game và bộ đọc dữ liệu game

**Files:**
- Create: `portal/src/games/catalog.ts`, `portal/src/data/sudoku.ts`, `portal/src/data/xiangqi.ts`, `portal/src/data/summary.ts`, `portal/src/data/recent.ts`
- Test: `portal/src/data/*.test.ts`, `portal/src/games/catalog.test.ts`

**Interfaces:**
- Consumes: `readJSON`, `readRaw`, `write`, `dateKeyOf`, `Localized` (Task 3).
- Produces:
  - `type Cat = 'puzzle'|'versus'|'arcade'`; `CATS: Record<Cat, string>` (giá trị là khóa DICT `cat.*`)
  - `type GameDef = { id: string; dir: string; cat: Cat; name: Localized<string>; sub: Localized<string>; desc: Localized<string>; tags: Localized<string[]>; note?: Localized<string>; daily?: Localized<string>; isNew?: boolean; keepAlive?: boolean; icon(base: string): string }`
  - `GAMES: GameDef[]` (đúng thứ tự cũ), `gameById(id: string): GameDef | undefined`
  - `type SudokuData = { won: number; lost: number; best: { key: string; time: number } | null; streak: number; current: { label: string; pct: number; seconds: number; mistakes: number } | null; totalDaily: number; today: { diff: string; time: number | null } }` — `sudokuData(t: TFn, now?: Date): SudokuData`; export `SUDOKU_DIFF`, `SUDOKU_DIFF_ORDER`, `SUDOKU_DAILY_BY_WEEKDAY`
  - `xiangqiData(): { level: 'easy'|'medium'|'hard' | null }`; export `XQ_LEVEL`
  - `type Summary = { updatedAt: number; played: number; won: number; note: string; stats: { value: string|number; label: string }[]; resume: { title: string; detail?: string; pct?: number } | null; daily: { date: string; done?: boolean; title?: string; streak?: number } | null }` — `readSummary(id: string): Summary | null`, `summaries(): Record<string, Summary>`
  - `recent(): Record<string, number>`, `markPlayed(id: string, now?: number): void` (khóa `game-portal-recent-v1`)

- [ ] **Step 1: Viết test:**
  - `catalog`: 17 game; id duy nhất; `gameById('sudoku').dir === 'sugoku/'`; mọi `dir` trùng một thư mục thật trong `games/` (đọc bằng `fs.readdirSync` từ test).
  - `summary`: JSON hỏng → `null`; `v: 2` → `null`; `stats` lọc phần tử thiếu `value`/`label`; `resume` thiếu `title` → `null`; số dạng chuỗi `'3'` → `3`.
  - `sudoku`: không có dữ liệu → `won 0, streak 0, current null, today.diff` theo `SUDOKU_DAILY_BY_WEEKDAY[now.getDay()]`; streak đếm ngày liên tiếp kể cả khi hôm nay chưa làm (hôm qua + hôm kia có → 2); `best` lấy độ khó cao nhất có `bestTime`; `current.pct` = số ô trống điền đúng / số ô trống; save `status: 'won'` → `current null`.
  - `xiangqi`: `'hard'` → `hard`; `'x'` → `null`.
  - `recent`: `markPlayed('2048', 5)` rồi `recent()['2048'] === 5`; giá trị lưu không phải object → `{}`.

- [ ] **Step 2: Chạy test** → FAIL.

- [ ] **Step 3: Viết module.** `catalog.ts`: chép nguyên mảng `GAMES` cũ (dòng 1004–1261), giữ comment; `svgIcon` và các icon SVG inline giữ dạng chuỗi HTML. Logic `sudokuData`/`readSummary` chép từ cổng cũ, đổi `t(...)` thành tham số.

- [ ] **Step 4: Chạy test** → PASS.

- [ ] **Step 5: Commit** `Port game catalog and local game data readers to the portal`.

---

### Task 5: Trang chủ (thanh trên, chào, Hôm nay, danh sách game, thành tích, chân trang)

**Files:**
- Create: `portal/src/home/Home.tsx`, `Topbar.tsx`, `Hero.tsx`, `Today.tsx`, `todayTiles.ts`, `GameGrid.tsx`, `Filters.tsx`, `GameCard.tsx`, `ribbon.ts`, `Stats.tsx`, `stats.ts`, `Footer.tsx`, `useReveal.ts`
- Modify: `portal/src/App.tsx`
- Test: `portal/src/home/todayTiles.test.ts`, `ribbon.test.ts`, `stats.test.ts`, `Home.test.tsx`

**Interfaces:**
- Consumes: Task 3, Task 4.
- Produces:
  - `type TodayTile = { game: GameDef; badge: 'play'|'daily'|'done'|'new'; kicker: string; title: TileText; meta: TileText; bar?: number }`, `type TileText = { html: string } | { text: string }` (html chỉ từ DICT; text cho chữ do game ghi)
  - `buildTodayTiles(input: { sd: SudokuData; xq: XqData; rec: Record<string, number>; sums: Record<string, Summary>; now: Date; i18n: I18nApi }): TodayTile[]` — tối đa `MAX_TODAY = 3`
  - `ribbonFor(g: GameDef, ctx: { openIds: Set<string>; lastId?: string; rec: Record<string, number>; t: TFn; now?: number }): [string, string] | null`
  - `type StatItem = { n?: number; suffix?: string; text?: string; label: string }`; `buildStats(sd: SudokuData, sums: Record<string, Summary>, i18n: I18nApi): StatItem[]` — tối đa `MAX_STATS = 10`
  - `Home` nhận prop `openIds: Set<string>` (game đang giữ iframe, cho ruy băng "đang mở") và `refreshKey: number` (đổi thì đọc lại localStorage).

- [ ] **Step 1: Viết test hàm thuần** (chép đúng thứ tự ưu tiên của `renderToday` cũ):
  - `todayTiles`: không dữ liệu → 3 thẻ: Sudoku hằng ngày (`daily`), game `isNew` chưa chơi đầu tiên (`new`), Cờ Tướng (`play`); có 2 ván dở → hai thẻ `play` đứng đầu, mới hơn trước; Sudoku hôm nay đã làm → badge `done` xếp sau các thẻ `daily` chưa làm; game có `daily` nhưng hôm nay chưa mở → thẻ `daily` với tiêu đề `loc(g.daily)`; `resume.pct` 1.7 → `bar` 1; `resume.title` là `{ text }` (không phải html).
  - `ribbon`: game trong `openIds` → `ribbon.open`; game chơi gần nhất → `ribbon.last`; `isNew` chưa chơi → `ribbon.new`; còn lại `null`.
  - `stats`: không dữ liệu → `[]`; cộng `played`/`won` của Sudoku và summary; mỗi game góp tối đa 2 chỉ số, game cập nhật gần nhất trước; cắt ở 10.

- [ ] **Step 2: Viết `Home.test.tsx`:** render `<I18nProvider><Home …/></I18nProvider>` → 17 `#games > li`; summary có `resume.title = '<img src=x onerror=alert(1)>'` → `#today` không chứa phần tử `img` mà chứa đúng chuỗi đó dạng text; bấm nút lọc `versus` → `li[data-cat="arcade"]` có `hidden` và `localStorage['game-portal-filter-v1'] === 'versus'`; **`localStorage.getItem` ném lỗi → trang vẫn render 17 thẻ và `#stats` hiện `stats.empty`**.

- [ ] **Step 3: Chạy test** → FAIL.

- [ ] **Step 4: Viết các component** theo đúng markup cũ (class, id, `--i` cho `.reveal`, `aria-*`, `aria-pressed` cho nút lọc, `.kbd` 1–9, `.ribbon` với `.r-long`/`.r-short`, nghiêng thẻ khi hover theo `attachTilt`, thanh tiến độ `.bar > i` chạy rộng sau 2 khung hình, `countUp` 900ms ease-out bậc 3 và bỏ khi `prefers-reduced-motion`). Lần render thứ hai trở đi thêm `body.revealed` (không chạy lại hiệu ứng xuất hiện). `Footer` chỉ hiện gợi ý phím tắt khi `(hover: hover) and (pointer: fine)`.

- [ ] **Step 5: Chạy test** → PASS.

- [ ] **Step 6: Commit** `Build portal home page at parity with the legacy portal`.

---

### Task 6: Xem trước chuyển động và nền chữ trôi

**Files:**
- Create: `portal/src/legacy/previews.js`, `portal/src/legacy/glyphs.js`, `portal/src/legacy/legacy.d.ts`
- Modify: `portal/src/home/GameGrid.tsx` (gọi `mountPreviews` sau khi vẽ), `portal/src/App.tsx` (gọi `startGlyphs`), `portal/src/theme/useTheme.ts` (gọi `recolor` sau khi đổi giao diện)
- Test: `portal/src/legacy/previews.test.ts`

**Interfaces:**
- Produces:
  - `mountPreviews(root: HTMLElement, opts: { isPlaying(): boolean; reduceMotion: boolean }): () => void` — chạy `pv_<id>` cho mọi `.preview[data-game]` trong `root`, trả hàm dọn (clearInterval + ngắt IntersectionObserver)
  - `startGlyphs(canvas: HTMLCanvasElement, opts: { isPlaying(): boolean; reduceMotion: boolean }): { recolor(): void; stop(): void }`

- [ ] **Step 1: Viết test** (`vi.useFakeTimers`, jsdom, không có IntersectionObserver): tạo 17 `div.preview[data-game=<id>]` theo `GAMES` → sau `mountPreviews` mỗi div có ít nhất một phần tử con; tiến 10s timer khi `isPlaying() === true` → DOM các preview không đổi; gọi hàm dọn rồi tiến timer → không còn interval chạy (`vi.getTimerCount() === 0`).

- [ ] **Step 2: Chạy test** → FAIL.

- [ ] **Step 3: Chép `Previews` (dòng 1703–2778) và `Glyphs` (dòng 2779–2851) từ `index.html` cũ** sang hai file `.js`. Chỉ đổi: `Player.current` → `opts.isPlaying()`, `reduceMotion` → `opts.reduceMotion`, `$('bg')` → tham số `canvas`, `document.querySelectorAll('.preview[data-game]')` → `root.querySelectorAll(...)`, thêm `stop()`/hàm dọn. Giữ nguyên phần vẽ từng game.

- [ ] **Step 4: Chạy test** → PASS.

- [ ] **Step 5: Commit** `Port animated game previews and floating glyph background`.

---

### Task 7: Khung chơi game và định tuyến

**Files:**
- Create: `portal/src/player/route.ts`, `portal/src/player/frames.ts`, `portal/src/player/Player.tsx`, `portal/src/player/useShortcuts.ts`
- Modify: `portal/src/App.tsx`
- Test: `portal/src/player/route.test.ts`, `frames.test.ts`, `Player.test.tsx`

**Interfaces:**
- Consumes: Task 3–5.
- Produces:
  - `type Route = { name: 'home' } | { name: 'play'; game: GameDef }` — `parseRoute(hash: string): Route` (id lạ → `home`); `playHref(g: GameDef): string` (`'#/play/' + id`); `gameHref(g: GameDef): string` (`g.dir + 'index.html'`)
  - `nextFrameIds(held: string[], prev: GameDef | null, next: GameDef | null): string[]` — bỏ `prev` khỏi danh sách nếu `prev` khác `next` và `!prev.keepAlive`; thêm `next` nếu chưa có
  - `Player` props: `{ game: GameDef | null; heldIds: string[]; portalSeen: boolean }`
  - `App` giữ state `route`, `heldIds`, `portalSeen`, `refreshKey`; lắng nghe `hashchange` và `pageshow` (`persisted` → tăng `refreshKey`).

- [ ] **Step 1: Viết test:**
  - `route`: `''` → home; `'#/play/2048'` → play 2048; `'#/play/khongco'` → home; `'#/play/2048?x'` → play 2048 (khớp `^#\/play\/([\w-]+)` như cũ).
  - `frames`: rời game `keepAlive: false` sang trang chủ → bị bỏ; `keepAlive: true` (xiangqi) → còn giữ; chuyển từ xiangqi sang 2048 → giữ cả hai.
  - `Player.test.tsx`: mở 2048 → một `iframe` có `title` = tên game, `src` kết thúc `2048/index.html`, `allow="fullscreen"`; `#p-loading` có class `on` đến khi iframe `load`; `#p-switch` có 17 nút, nút 2048 `aria-current="true"`; `#p-chip` ẩn khi streak 0 và hiện `player.streak` khi summary `daily.streak = 4`; bấm `#p-menu` → `#p-menu-list` hiện, `Escape` → ẩn; **đang mở 2048, phát sự kiện `storage` key `playnine-lang` = `vi` → `#p-back` có `aria-label` "Về PlayNine", và vẫn là đúng phần tử `iframe` cũ (so tham chiếu)**; bấm `#p-back` khi `portalSeen = false` → `location.hash === ''`.

- [ ] **Step 2: Chạy test** → FAIL.

- [ ] **Step 3: Viết module.** Hành vi chép từ `Player` cũ: `markPlayed` khi mở; `document.title = <tên> · PlayNine`, về trang chủ thì `PlayNine`; `body.playing`; focus iframe sau khi tải; chuyển game bằng `location.replace(playHref(x))`; `#p-full` ẩn khi `!document.fullscreenEnabled`, bấm thì `requestFullscreen` trên `#player`, về trang chủ thì thoát toàn màn hình; `#p-newtab` trỏ `gameHref`; Back: `portalSeen ? history.back() : location.hash = ''`. Iframe render bằng React với `key = id` để không bị tạo lại khi đổi ngôn ngữ. `useShortcuts`: khi không chơi và không có Ctrl/Meta/Alt và không ở input — `1`–`9` mở game theo thứ tự, `t` đổi giao diện, `l` đổi ngôn ngữ.

- [ ] **Step 4: Chạy test** → PASS.

- [ ] **Step 5: Commit** `Add in-portal game player with hash routing and shortcuts`.

---

### Task 8: Thay cổng cũ bằng cổng React

**Files:**
- Delete: `index.html` (gốc)
- Modify: `package.json` gốc (`assemble` dùng `--portal portal/dist`), `scripts/assemble.mjs` (bỏ mặc định chép `index.html` gốc), `scripts/assemble.test.mjs`, `README.md`

- [ ] **Step 1: Sửa mặc định của `assemble`** thành `portal/dist`; báo lỗi rõ ràng nếu thư mục đó không có `index.html`. Cập nhật test `copies portal…` cho mặc định mới và thêm `fails when portal build is missing`. Chạy `node --test scripts/` → PASS.

- [ ] **Step 2: `git rm index.html`**, chạy `npm run build && npm run assemble && npm run e2e`. Toàn bộ test của Task 1 phải PASS **không sửa test**. Test nào fail thì sửa cổng React cho đến khi pass.

- [ ] **Step 3: So sánh trực quan bằng mắt:** chụp trang chủ (desktop 1280px và mobile 390px, cả sáng và tối) của bản build cũ (`git stash`/checkout commit Task 2, assemble) và bản mới bằng Playwright `page.screenshot`, đặt cạnh nhau trong scratchpad; ghi lại khác biệt còn lại vào mô tả commit nếu có lý do giữ.

- [ ] **Step 4: Chạy toàn bộ:** `npm test` (node + portal), `for d in games/*/; do (cd $d && [ -f test.js ] && node test.js); done` (và `games/sugoku/sudoku-test.js`) → tất cả pass, xác nhận game cũ không bị đụng.

- [ ] **Step 5: `git diff --stat main...HEAD -- games/`** → chỉ có rename, 0 dòng thêm/xóa.

- [ ] **Step 6: Cập nhật README** (bỏ ghi chú cổng cũ, mô tả cách thêm game vào `catalog.ts`). Commit `Replace legacy portal page with the React portal`.

---

## Sau giai đoạn 1

Trước khi merge `portal-platform` vào `main`: chủ dự án đổi Settings → Pages → Source sang "GitHub Actions" (README, Task 2). Giai đoạn 2 (Supabase, SDK, bảng xếp hạng) có kế hoạch riêng.
