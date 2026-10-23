# Đợt 0 — Nền tảng cho 100 game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biến "thêm một game" thành "thêm một thư mục": manifest `game.json` trong thư mục game thay cho sửa catalog/preview/CSS/migration/test đếm; bộ dùng chung `_kit` và lệnh tạo khung để game mới còn ~1.500 dòng; e2e tự sinh; cổng chịu được 100 game.

**Architecture:** Cổng đọc mọi `games/*/game.json` bằng `import.meta.glob` và xếp theo `games/order.json`; `catalog.ts` chỉ còn kiểu và `gameById`. Server config (metric, mode, điểm, luật) cũng nằm trong manifest, test Supabase so bảng `games` với manifest, và `scripts/seed-sql.mjs` sinh SQL từ manifest. Preview của game mới là `preview.svg` tĩnh, hiện bằng `<img loading="lazy">`; 21 preview JS cũ giữ nguyên. `games/_kit/` chứa CSS token + JS dùng chung (store, theme, modal, toast, timer, i18n runtime, SDK wrapper), game cũ không đổi. E2e chung đọc manifest.

**Tech Stack:** Như hiện tại: React 19 + Vite 7 + Vitest (portal), PGlite + Vitest (supabase), `node --test` (scripts), Playwright 1.63 (e2e), JS thuần không build cho game và `_kit`.

**Spec:** [docs/superpowers/specs/2026-10-23-100-games-roadmap.md](../specs/2026-10-23-100-games-roadmap.md), mục 4 (4.1–4.8) và mục 8 "Sau đợt 0".

## Global Constraints

- Hoàn thành và merge xong đợt 0 trước khi thêm game thứ 22. Cổng chạy được sau mỗi task; `npm test` xanh sau mỗi task.
- **Không format lại file có sẵn**: diff của file cũ chỉ chứa dòng cần đổi. File có sẵn dùng CRLF (`core.autocrlf=true`): sửa bằng Edit, không serialize lại cả file. Không chạy Prettier (repo không có cấu hình).
- Game cũ (21 thư mục hiện có) **không sửa code**; chỉ thêm `game.json` (và không thêm `preview.svg`).
- Khóa localStorage của game giữ quy ước `playnine-<id>-(save|stats|settings|summary)-v1`; ngôn ngữ ở `playnine-lang`; âm thanh ở `playnine-sound-v1`.
- `Cat` = `'puzzle' | 'versus' | 'arcade' | 'card' | 'brain'`. Nhãn: `cat.card` = "Cards" / "Bài", `cat.brain` = "Words & numbers" / "Chữ và số".
- Nhãn "Mới" suy từ `addedAt`: `NEW_DAYS = 14`.
- Thư mục bắt đầu bằng `_` trong `games/` không phải game (bị bỏ qua ở catalog, assemble game, e2e); riêng `_kit` được assemble chép ra `dist/_kit/`.
- Mọi chuỗi giao diện mới của cổng thêm vào `portal/src/i18n/dict.ts` ở cả `en` và `vi`. README và comment tiếng Việt; commit message tiếng Anh, kết thúc bằng `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Không dùng Supabase CLI (mạng công ty chặn); migration áp qua SQL Editor. Đợt 0 **không** cần migration mới (không đổi schema, không thêm game).
- Commit theo task rồi push thẳng `main` (cách làm của repo), không mở PR.

## Review Focus

1. **Manifest hỏng** (thiếu `vi`, `cat` lạ, hai thư mục cùng `id`, id có trong manifest nhưng không có trong `order.json` hoặc ngược lại): build và test phải fail với thông báo nêu đúng tên file; cổng không được âm thầm bỏ qua game. — Test ở Task 1 (`parseManifest`) và Task 2 (`order.json` khớp manifest).
2. **Thư mục game không có `game.json`** (ai đó chép game vào mà quên manifest): test catalog fail nêu tên thư mục; assemble vẫn chép thư mục (không đổi hành vi). — Test ở Task 2.
3. **`addedAt` sai định dạng hoặc ở tương lai**: `parseManifest` từ chối định dạng sai; ngày tương lai hợp lệ nhưng `isNewGame` trả `false` (không bao giờ "mới" mãi). — Test ở Task 3.
4. **Chuỗi có dấu nháy đơn trong manifest** (ví dụ label "Hold'em", desc có `'`): SQL sinh ra phải chạy được trên Postgres, không vỡ câu lệnh. — Test ở Task 6.
5. **Lưới trang chủ giới hạn 24 thẻ**: phím số 1–9 vẫn mở đúng game theo thứ tự `order.json`; đang tìm kiếm thì không giới hạn; game bị admin ẩn không chiếm suất trong 24. — Test ở Task 10.

---

## File Structure

```
games/order.json                          thứ tự hiển thị: mảng id
games/<dir>/game.json                     manifest (21 file cho game hiện có, sinh từ catalog + DB)
games/_kit/kit.css                        token màu sáng/tối, .app, .topbar, .btn*, .modal*, .toast, .segmented, .switch, reduced-motion
games/_kit/kit.js                         window.PNKit; phần thuần export cho Node (createStore, createTimer, createI18n, buildSummary)
games/_kit/kit.test.js                    test Node cho phần thuần
games/_kit/demo.html                      trang mẫu dùng kit (cũng là trang để e2e kit.spec.ts chạy)
games/_template/{index.html,style.css,app.js,engine.js,i18n.js,test.js,icon.svg,preview.svg,README.md,game.json}
                                          khung game mới dùng kit, có placeholder {{id}} {{nameEn}} {{nameVi}} {{date}}
scripts/seed-sql.mjs (+ .test.mjs)        in SQL insert public.games từ manifest
scripts/new-game.mjs (+ .test.mjs)        chép _template -> games/<dir>, điền placeholder, thêm id vào order.json
scripts/test-games.mjs                    chạy node test.js của mọi game và _kit
scripts/assemble.mjs                      thêm: chép games/_kit -> dist/_kit
e2e/manifests.ts                          đọc manifest cho e2e
e2e/games.spec.ts                         mỗi game: mở <dir>/ không SDK, không pageerror (chromium + mobile)
e2e/games-sdk.spec.ts                     mỗi game có SDK: hello + start với mode hợp lệ
e2e/kit.spec.ts                           modal, toast, theme, đổi ngôn ngữ trên _kit/demo.html
e2e/sdk-games.spec.ts                     bỏ các test hello/start/standalone trùng, giữ test ván thắng
e2e/legacy-urls.spec.ts                   xóa (gộp vào games.spec.ts)
playwright.config.ts                      testDir '.', testMatch e2e/**/*.spec.ts + games/*/e2e.spec.ts
portal/vite.config.ts                     server.fs.allow repoRoot
portal/tsconfig.json                      resolveJsonModule
portal/src/games/cats.ts                  Cat, CATS (tách khỏi catalog.ts để manifest.ts không import vòng)
portal/src/games/manifest.ts (+ .test.ts) kiểu GameManifest, parseManifest, toGameDef, isNewGame
portal/src/games/catalog.ts               GameDef, GAMES từ glob + order.json, gameById
portal/src/home/GameCard.tsx              preview.svg khi manifest có preview
portal/src/home/GameMenu.tsx              nền icon từ preview.bg
portal/src/home/GameGrid.tsx              prop limit + nút "Xem tất cả"
portal/src/home/GamesPage.tsx (+ .test)   trang #/games: lọc, tìm, sắp xếp, lưới đầy đủ
portal/src/home/sortGames.ts (+ .test)    sắp xếp thuần
portal/src/home/ribbon.ts, todayTiles.ts  isNewGame thay g.isNew
portal/src/player/route.ts                route 'games'
portal/src/player/Player.tsx              ô lọc + nhóm theo cat trong menu đổi game
portal/src/admin/AdminGames.tsx           ô lọc tên + chọn cat
portal/src/App.tsx                        GamesPage
portal/src/styles/portal.css              .games-more, .pv-img, .games-page (thêm cuối file, không sửa dòng cũ)
supabase/tests/manifests.ts               readManifests() cho test DB
supabase/tests/core.test.ts               so bảng games với manifest
supabase/tests/seed_sql.test.ts           SQL sinh ra chạy được và cho đúng dòng
README.md                                 mục "Thêm một game vào portal" viết lại
```

---

### Task 1: Kiểu manifest và `parseManifest`

**Files:**
- Create: `portal/src/games/cats.ts`, `portal/src/games/manifest.ts`, `portal/src/games/manifest.test.ts`
- Modify: `portal/src/games/catalog.ts` (dời `Cat`, `CATS` sang `cats.ts`, re-export để chỗ khác không đổi import)

**Interfaces:**
- Produces (`cats.ts`): `export type Cat = 'puzzle' | 'versus' | 'arcade' | 'card' | 'brain'`; `export const CATS: Record<Cat, string>` (khóa DICT `cat.<cat>`).
- Produces (`manifest.ts`):
  ```ts
  export type Metric = 'score_high' | 'time_low' | 'wins'
  export type ServerMode = { key: string; label: Localized<string>; points?: number; rules?: Record<string, number> }
  export type ServerSpec = { metric: Metric; points: number; modes: ServerMode[] }
  export type GameManifest = {
    id: string; cat: Cat; addedAt: string
    name: Localized<string>; sub: Localized<string>; desc: Localized<string>; tags: Localized<string[]>
    note?: Localized<string>; daily?: Localized<string>
    keepAlive?: boolean; sdk?: boolean
    preview?: { bg: string }
    e2e?: { start?: string }
    server: ServerSpec
  }
  /** Ném Error có message bắt đầu bằng `${file}: ` khi sai. */
  export function parseManifest(raw: unknown, file: string): GameManifest
  export const NEW_DAYS = 14
  /** addedAt trong [now - 14 ngày, now]; ngày tương lai -> false. */
  export function isNewGame(g: { addedAt: string }, now: number): boolean
  ```
- Luật kiểm tra trong `parseManifest`: `id` khớp `/^[a-z0-9]{2,24}$/`; `cat` ∈ `CATS`; `addedAt` khớp `/^\d{4}-\d{2}-\d{2}$/` và `Date.parse` hợp lệ; `name`/`sub`/`desc` có `en` và `vi` là chuỗi không rỗng; `tags.en`/`tags.vi` là mảng 1–5 chuỗi không rỗng; `note`/`daily` nếu có thì như `name`; `keepAlive`/`sdk` nếu có là boolean; `preview.bg` chuỗi không rỗng; `e2e.start` chuỗi; `server.metric` ∈ Metric; `server.points` số nguyên 0..1000; `server.modes` mảng ≥ 1, `key` khớp `/^[a-z0-9-]{1,24}$/` và không trùng, `label` en/vi, `points` nếu có 0..1000, `rules` nếu có chỉ gồm khóa trong `['min_duration_ms','max_score','max_score_per_sec','min_time_ms']` với giá trị số hữu hạn ≥ 0. Mọi khóa lạ ở cấp cao nhất bị từ chối (bắt lỗi gõ sai tên trường).

- [ ] **Step 1: Viết test `manifest.test.ts`**

```ts
const ok = (): unknown => ({ id: 'abc', cat: 'puzzle', addedAt: '2026-10-23', name: { en: 'A', vi: 'Á' }, sub: { en: 'a', vi: 'á' },
  desc: { en: 'd', vi: 'đ' }, tags: { en: ['x'], vi: ['y'] }, server: { metric: 'wins', points: 5, modes: [{ key: 'classic', label: { en: 'C', vi: 'C' } }] } })
it('nhận manifest hợp lệ', () => expect(parseManifest(ok(), 'f')).toMatchObject({ id: 'abc' }))
it.each([
  ['thiếu vi', (m) => { m.name = { en: 'A' } }, /f: name\.vi/],
  ['cat lạ', (m) => { m.cat = 'sport' }, /f: cat/],
  ['addedAt sai', (m) => { m.addedAt = '23/10/2026' }, /f: addedAt/],
  ['mode trùng key', (m) => { m.server.modes.push({ key: 'classic', label: { en: 'C', vi: 'C' } }) }, /f: server\.modes\[1\]\.key/],
  ['rule lạ', (m) => { m.server.modes[0].rules = { max_lives: 3 } }, /f: server\.modes\[0\]\.rules\.max_lives/],
  ['points ngoài khoảng', (m) => { m.server.points = 1001 }, /f: server\.points/],
  ['trường lạ', (m) => { m.isNew = true }, /f: isNew/],
])('từ chối: %s', (_, mutate, re) => { const m = ok() as any; mutate(m); expect(() => parseManifest(m, 'f')).toThrow(re) })
it('isNewGame: trong 14 ngày là mới, quá 14 ngày hoặc tương lai thì không', () => {
  const now = Date.parse('2026-10-23T12:00:00Z')
  expect(isNewGame({ addedAt: '2026-10-23' }, now)).toBe(true)
  expect(isNewGame({ addedAt: '2026-10-09' }, now)).toBe(true)
  expect(isNewGame({ addedAt: '2026-10-08' }, now)).toBe(false)
  expect(isNewGame({ addedAt: '2026-10-24' }, now)).toBe(false)
})
```

- [ ] **Step 2: Chạy test, xác nhận fail** — `npx vitest run src/games/manifest.test.ts` (trong `portal/`); mong đợi: "Cannot find module './manifest'".
- [ ] **Step 3: Tạo `cats.ts`; dời `Cat`/`CATS` từ `catalog.ts` sang đó, `catalog.ts` giữ `export { CATS, type Cat } from './cats'`; viết `manifest.ts` theo Interfaces.** Thông báo lỗi dạng `f: <đường dẫn trường>: <lý do>` (ví dụ `f: name.vi: thiếu`).
- [ ] **Step 4: Chạy test, xác nhận pass** — `npx vitest run src/games/manifest.test.ts`.
- [ ] **Step 5: `npm test -w portal` xanh, `npx tsc -b` (trong `portal/`) không lỗi. Commit** — `git commit -m "Add the game manifest type and parser"`.

---

### Task 2: Catalog đọc manifest; sinh 21 `game.json` và `order.json`

**Files:**
- Create: `games/order.json`, `games/<dir>/game.json` × 21, (tạm) `supabase/tests/export-manifests.tmp.test.ts`
- Modify: `portal/src/games/catalog.ts`, `portal/src/games/catalog.test.ts`, `portal/vite.config.ts`, `portal/tsconfig.json`

**Interfaces:**
- Consumes: `parseManifest`, `GameManifest` (Task 1).
- Produces (`catalog.ts`):
  ```ts
  export type GameDef = Omit<GameManifest, 'id'> & { id: string; dir: string; icon(base: string): string }   // không còn isNew
  export const GAMES: GameDef[]            // theo games/order.json
  export const gameById: (id: string) => GameDef | undefined
  export function toGameDef(m: GameManifest, dir: string): GameDef   // dir = '<thư mục>/', icon = svgIcon
  ```
- Cách nạp: `const files = import.meta.glob<unknown>(['../../../games/*/game.json', '!../../../games/_*/game.json'], { eager: true, import: 'default' })`; khóa là đường dẫn, tên thư mục lấy từ phần `games/<dir>/game.json`. `import order from '../../../games/order.json'` (mảng string). Lỗi nếu: id trùng giữa hai manifest; id trong `order.json` không có manifest; manifest không có trong `order.json`. Lỗi ném ở lúc nạp module với message nêu tên file.

- [ ] **Step 1: Sinh manifest cho 21 game bằng test tạm** — Tạo `supabase/tests/export-manifests.tmp.test.ts`: `createDb()` (harness), `select id, metric, modes, points from games`; import `GAMES` cũ từ `../../portal/src/games/catalog`; với mỗi game ghi `games/<dir>/game.json` (JSON 2 khoảng trắng, LF, xuống dòng cuối) gồm các trường của `GameDef` trừ `icon`, `dir`, `isNew`, thêm `addedAt` và `server: { metric, points, modes }` (mode giữ nguyên `key`, `label`, `rules`, `points` từ DB, bỏ khóa `undefined`). `addedAt`: `noihinh` = `2026-10-21`; `truotso`, `latthe`, `banbong` = `2026-10-23`; 17 game còn lại = `2026-10-20`. Ghi `games/order.json` = mảng id theo thứ tự `GAMES` hiện tại. Chạy `npx vitest run tests/export-manifests.tmp.test.ts` (trong `supabase/`) rồi **xóa file test tạm**.
- [ ] **Step 2: Sửa `catalog.test.ts`** — thay test đếm cứng bằng:
```ts
const dirs = fs.readdirSync(gamesDir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name)
it('mỗi thư mục game có game.json và có mặt trong GAMES; id duy nhất', () => {
  expect(GAMES.map((g) => g.dir.replace(/\/$/, '')).sort()).toEqual([...dirs].sort())
  expect(new Set(GAMES.map((g) => g.id)).size).toBe(GAMES.length)
})
it('thứ tự GAMES là order.json', () => expect(GAMES.map((g) => g.id)).toEqual(JSON.parse(fs.readFileSync(path.join(gamesDir, 'order.json'), 'utf8'))))
it('gameById tìm đúng game', ...)   // giữ: sudoku -> 'sugoku/'
it('icon trả về chuỗi HTML', ...)   // giữ
it('manifest có server với ít nhất một mode', () => GAMES.forEach((g) => expect(g.server.modes.length).toBeGreaterThan(0)))
```
- [ ] **Step 3: Chạy test, xác nhận fail** — `npx vitest run src/games/catalog.test.ts`: fail vì `GAMES` chưa có `server`/`dir` từ manifest.
- [ ] **Step 4: Viết lại `catalog.ts`** theo Interfaces (xóa 21 mục khai báo tay). Thêm `"resolveJsonModule": true` vào `portal/tsconfig.json`; thêm `fs: { allow: [repoRoot] }` vào `server` trong `portal/vite.config.ts`.
- [ ] **Step 5: Chạy test, xác nhận pass** — `npx vitest run src/games/catalog.test.ts`; rồi `npm test -w portal` (các test khác vẫn xanh vì dữ liệu giống hệt; test dùng `g.isNew` sẽ lỗi type → tạm để Task 3, nếu `tsc` chặn thì làm Task 3 trước khi commit).
- [ ] **Step 6: Kiểm tra dev server đọc được manifest** — `npm run dev -w portal` rồi mở `http://localhost:5180/playnine/`, trang chủ hiện 21 game (hoặc `npm run build -w portal` thành công).
- [ ] **Step 7: Commit** — `git add games/*/game.json games/order.json portal` → `git commit -m "Load the game catalog from per-game manifests"`.

---

### Task 3: "Mới" theo `addedAt`; test đếm số game đọc từ `GAMES`

**Files:**
- Modify: `portal/src/home/ribbon.ts`, `portal/src/home/ribbon.test.ts`, `portal/src/home/todayTiles.ts`, `portal/src/home/todayTiles.test.ts`, `portal/src/home/Home.test.tsx`, `portal/src/home/Storefront.test.tsx`, `portal/src/legacy/previews.test.ts`, `portal/src/player/Player.test.tsx`, `e2e/portal.spec.ts`

**Interfaces:**
- Consumes: `isNewGame(g, now)` (Task 1). `ribbonFor` đã nhận `ctx.now`; `buildTodayTiles` đã nhận `now: Date`.

- [ ] **Step 1: Viết test** — `ribbon.test.ts`: `it('game thêm trong 14 ngày và chưa chơi: ruy băng Mới; quá 14 ngày: không')` với `addedAt: '2026-10-20'`, `now` = 2026-10-23 → `['New','New']`; `now` = 2026-11-10 → `null`. `todayTiles.test.ts`: ô "Thử game mới" chỉ xuất hiện khi còn game `isNewGame` chưa chơi (dùng `now`).
- [ ] **Step 2: Chạy test, xác nhận fail.**
- [ ] **Step 3: Sửa `ribbon.ts`** (`g.isNew` → `isNewGame(g, now ?? Date.now())`) **và `todayTiles.ts`** (`GAMES.filter((g) => isNewGame(g, now.getTime()) && !rec[g.id])`).
- [ ] **Step 4: Thay số cứng bằng `GAMES.length`** trong `Home.test.tsx` (21 → `GAMES.length`, 20 → `GAMES.length - 1`, cả trong tên test dùng template string), `Storefront.test.tsx`, `previews.test.ts`, `Player.test.tsx`; `e2e/portal.spec.ts` đọc `games/order.json` bằng `fs` để lấy số. (Test Supabase sửa ở Task 6.)
- [ ] **Step 5: `npm test -w portal` xanh, `npx tsc -b` sạch. Commit** — `"Derive the New ribbon and game counts from manifests"`.

---

### Task 4: Hai thể loại mới `card`, `brain`

**Files:**
- Modify: `portal/src/games/cats.ts` (đã có 5 cat từ Task 1 — xác nhận), `portal/src/i18n/dict.ts`, `portal/src/i18n/i18n.test.tsx` (nếu có test đủ khóa), `portal/src/home/Filters.test.tsx` hoặc `Home.test.tsx`

- [ ] **Step 1: Viết test** — `Home.test.tsx`: `it('bộ lọc có 6 nút: Tất cả + 5 thể loại, mỗi nút có số đếm')` kiểm `#filters button` dài 6 và nút `Cards` đếm `0` (chưa có game bài).
- [ ] **Step 2: Chạy test, xác nhận fail.**
- [ ] **Step 3: Thêm `cat.card`, `cat.brain` vào `dict.ts` ở cả `en` và `vi`** đúng chuỗi ở Global Constraints (thêm ngay sau `cat.arcade` của mỗi ngôn ngữ).
- [ ] **Step 4: Test pass. Commit** — `"Add card and brain game categories"`.

---

### Task 5: Preview tĩnh `preview.svg`

**Files:**
- Modify: `portal/src/home/GameCard.tsx`, `portal/src/home/GameCard.test.tsx` (tạo nếu chưa có), `portal/src/home/GameMenu.tsx`, `portal/src/legacy/previews.test.ts`, `portal/src/styles/portal.css` (thêm cuối file)

**Interfaces:**
- Manifest có `preview: { bg }` ⇒ thẻ hiện `<img className="pv-img" src={g.dir + 'preview.svg'} alt="" loading="lazy" decoding="async">` trong `.preview`, `.preview` có `style={{ background: g.preview.bg }}` và **không** có `data-game` (để `mountPreviews` bỏ qua). Không có `preview` ⇒ như hiện nay (`pv-<id>` + `data-game`).
- `GameMenu.Row`: `.gmenu-icon` có `style={{ background: g.preview?.bg }}` khi có.
- CSS thêm cuối `portal.css`: `.pv-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }`.
- Yêu cầu với file `preview.svg` (ghi vào README Task 8): tự chứa, `viewBox` 4:3, hoạt hình bằng CSS/SMIL bên trong, có `@media (prefers-reduced-motion: reduce)` tắt hoạt hình, không font ngoài, ≤ 30 KB.

- [ ] **Step 1: Viết test `GameCard.test.tsx`** — render `GameCard` với `game = { ...gameById('2048')!, id: 'demo', dir: 'demo/', preview: { bg: 'red' } }` → có `img.pv-img[src="demo/preview.svg"][loading="lazy"]`, `.preview` không có `data-game`; với `gameById('2048')` thật → có `.preview[data-game="2048"]`, không có `img.pv-img`.
- [ ] **Step 2: Fail. Step 3: Sửa `GameCard.tsx`, `GameMenu.tsx`, thêm CSS. Step 4: Pass.**
- [ ] **Step 5: `previews.test.ts`**: số host = `GAMES.filter((g) => !g.preview).length` (hiện bằng `GAMES.length`). Commit — `"Show static preview.svg cards for manifest-declared previews"`.

---

### Task 6: Supabase so với manifest; `scripts/seed-sql.mjs`

**Files:**
- Create: `supabase/tests/manifests.ts`, `supabase/tests/seed_sql.test.ts`, `scripts/seed-sql.mjs`, `scripts/seed-sql.test.mjs`
- Modify: `supabase/tests/core.test.ts`, `supabase/tests/points.test.ts`, root `package.json` (script `seed-sql`)

**Interfaces:**
- `supabase/tests/manifests.ts`: `export function readManifests(): { dir: string; m: GameManifest }[]` — đọc `games/*/game.json` bằng `fs` (bỏ `_*`), parse qua `parseManifest` import từ `../../portal/src/games/manifest`.
- `scripts/seed-sql.mjs`:
  ```js
  /** @param {{ id: string, server: { metric, points, modes } }[]} manifests */
  export function seedSql(manifests) // -> string: một câu `insert into public.games (id, metric, modes, points) values\n(...),\n(...);` ; mỗi dòng `('<id>', '<metric>', '<json modes>'::jsonb, <points>)`; json là JSON.stringify của modes giữ đúng thứ tự khóa key, label, rules, points; dấu `'` trong chuỗi nhân đôi thành `''`
  export function readManifest(root, idOrDir) // tìm games/*/game.json có id trùng
  // CLI: node scripts/seed-sql.mjs <id>... -> in SQL ra stdout; thiếu id -> exit 1 kèm cách dùng
  ```
- root `package.json`: `"seed-sql": "node scripts/seed-sql.mjs"`.

- [ ] **Step 1: Viết `scripts/seed-sql.test.mjs`** (node:test): `seedSql([{ id: 'xito', server: { metric: 'wins', points: 5, modes: [{ key: 'classic', label: { en: "Hold'em", vi: 'Xì Tố' }, rules: { min_duration_ms: 5000 }, points: 5 }] } }])` bằng đúng chuỗi mong đợi (có `Hold''em`); hai manifest → hai dòng ngăn bằng `,\n`; `readManifest(fixtureRoot, 'sudoku')` tìm được thư mục `sugoku`.
- [ ] **Step 2: Fail. Step 3: Viết `seed-sql.mjs`. Step 4: `node --test scripts/seed-sql.test.mjs` pass.**
- [ ] **Step 5: Viết `supabase/tests/seed_sql.test.ts`** — tạo db, chạy `db.exec(seedSql([fixture với label "Hold'em"]))` trên một id mới `zz1`, `select` lại: `metric`, `points`, `modes` bằng fixture (label có dấu nháy nguyên vẹn).
- [ ] **Step 6: Viết lại `core.test.ts`** — bỏ `MODES`/`METRICS` cứng; `it('bảng games khớp manifest của mọi game')`: tập id bằng nhau; với mỗi game `metric`, `points`, `modes.map(key)` theo thứ tự, `label`, `rules` (so bằng `toEqual` với manifest sau khi bỏ khóa `undefined`), `points` của mode. `points.test.ts`: `got` so với `Object.fromEntries(readManifests().map(({m}) => [m.id, m.server.points]))`. Giữ các test còn lại.
- [ ] **Step 7: `npm test -w supabase` xanh (141 + 2 test). Commit** — `"Check the games table against manifests and generate seed SQL from them"`.

---

### Task 7: Bộ dùng chung `games/_kit/`

**Files:**
- Create: `games/_kit/kit.css`, `games/_kit/kit.js`, `games/_kit/kit.test.js`, `games/_kit/demo.html`, `games/_kit/README.md`, `e2e/kit.spec.ts`
- Modify: `scripts/assemble.mjs`, `scripts/assemble.test.mjs`, root `package.json` (test chạy `kit.test.js` — gộp ở Task 8 qua `test-games.mjs`)

**Interfaces (`kit.js`, phiên bản `KIT_VERSION = '1.0.0'`, nhúng `../_kit/kit.js?v=1`):**
```js
// Phần thuần (export cho Node qua module.exports, và có trên window.PNKit):
createStore({ gameId, storage })            // -> { keys: { save, stats, settings, summary }, read(key, fallback), write(key, value), remove(key) }  JSON + try/catch, không ném
createTimer({ now = () => performance.now(), onTick })  // -> { start(), pause(), resume(), reset(), elapsed(), running }  ms; tự pause khi document ẩn (chỉ ở DOM)
createI18n({ dict, lang, kitDict })         // -> { lang, t(key, params), apply(root), fmtNumber(n), set(lang), onBeforeReload(fn) }  API giống I18N của noihinh; dict game đè kitDict
buildSummary({ played, won, note, stats, resume, daily, now })  // -> object { v: 1, updatedAt, ... } đúng dạng readSummary của cổng
// Phần DOM (chỉ khi có document):
PNKit.init({ gameId, version, dict, defaults: { theme: 'auto' } })
// -> kit = { store, settings: { get(), set(patch) }, theme: { apply(), set(v) }, i18n, sdk: { start(mode, resume), end(result) },
//            modal: { open(id), close(id), closeAll(), current() }, toast(msg, ms = 1800), sfx(name, opts), confetti(),
//            bindSettings(root = document), onLeave(fn), timer: createTimer }
// init tự: áp theme trước khi vẽ (đọc settings), gọi PlayNine.init nếu có SDK, i18n.apply(), gắn [data-close], Esc, bẫy focus trong modal.
```
- `kit.css`: token `--bg --surface --surface-2 --text --muted --accent --accent-strong --accent-text --accent-soft --red --line --overlay --shadow --shadow-sm --radius --radius-sm --font` cho sáng và tối (`:root:not([data-theme="light"])` trong `prefers-color-scheme: dark`, và `:root[data-theme="dark"]`), các lớp `.app .topbar .btn-round .btn .btn-primary .modal .modal-backdrop .modal-card .modal-actions .modal-stack .toast .segmented .switch .kbd-hint .app-version`, safe-area, `@media (prefers-reduced-motion: reduce)`.
- `assemble.mjs`: sau vòng game, `cp(games/_kit, out/_kit)` nếu tồn tại.
- `demo.html`: trang dùng kit đầy đủ (topbar, nút mở modal cài đặt/thống kê/hướng dẫn, toast, đổi theme, đổi ngôn ngữ), id `btn-settings`, `modal-settings`, `btn-toast`, `toast`, `sw-theme` (segmented).

- [ ] **Step 1: Viết `kit.test.js`** (harness như `games/noihinh/test.js`, `require('./kit.js')`): store đọc JSON hỏng trả fallback và không ném; store ghi vào storage giả ném lỗi cũng không ném; timer `elapsed` cộng dồn qua start/pause/resume với `now` giả; i18n `t` thiếu khóa rơi về en rồi về chính khóa, `t('x', {n: 2})` chọn `other`, dict game đè kitDict; `buildSummary` ra `v: 1` và `updatedAt = now`.
- [ ] **Step 2: Fail. Step 3: Viết `kit.js` (phần thuần trước), `kit.css`, rồi phần DOM, `demo.html`, `README.md` (API + cách nhúng + thứ tự script: `../_kit/kit.js`, `i18n.js`, `engine.js`, `../sdk/playnine.js?v=2`, `app.js`). Step 4: `node games/_kit/kit.test.js` pass.**
- [ ] **Step 5: `assemble.test.mjs`**: `it('copies _kit to dist/_kit but still skips other underscore folders')`. Sửa `assemble.mjs`. Pass.
- [ ] **Step 6: Viết `e2e/kit.spec.ts`** trên `_kit/demo.html`: mở modal bằng nút, đóng bằng Esc, focus quay về nút; toast hiện rồi ẩn sau 2 giây; chọn theme `dark` → `html[data-theme=dark]` và `settings` lưu `theme: 'dark'`; đổi ngôn ngữ `vi` → trang tải lại, `playnine-lang = 'vi'`; không `pageerror` khi chặn SDK. Build + assemble + `npx playwright test e2e/kit.spec.ts` pass.
- [ ] **Step 7: Commit** — `"Add the shared game kit"`.

---

### Task 8: `games/_template/`, `scripts/new-game.mjs`, `scripts/test-games.mjs`, README

**Files:**
- Create: `games/_template/*` (10 file ở File Structure), `scripts/new-game.mjs`, `scripts/new-game.test.mjs`, `scripts/test-games.mjs`
- Modify: root `package.json` (scripts `new-game`, `test`), `README.md`

**Interfaces:**
- `scripts/new-game.mjs`: `export async function createGame({ root, dir, nameEn, nameVi, cat = 'puzzle', today })` — chép `games/_template` → `games/<dir>`, thay `{{id}}` (= dir), `{{nameEn}}`, `{{nameVi}}`, `{{cat}}`, `{{date}}` trong mọi file text, đổi tên không cần; thêm `dir` vào cuối `games/order.json`; từ chối nếu thư mục đã tồn tại, `dir` không khớp `/^[a-z0-9]{2,24}$/`, hoặc `cat` lạ. CLI: `node scripts/new-game.mjs <dir> --en "Name" --vi "Tên" [--cat puzzle]`.
- `scripts/test-games.mjs`: chạy `node test.js` (cwd = thư mục game) cho `games/_kit` và mọi `games/*/test.js`, in tên và kết quả, exit 1 nếu có game fail. Root `package.json`: `"test": "node --test \"scripts/*.test.mjs\" && node scripts/test-games.mjs && npm test -w sdk && npm test -w portal && npm test -w supabase"`, `"new-game": "node scripts/new-game.mjs"`.
- Template là một game chơi được: "Chạm Nhanh" — bấm nút 10 lần, đồng hồ từ lần bấm đầu, `metric: time_low`, mode `classic`, `min_time_ms: 500`, lưu/khôi phục ván, thắng gửi `kit.sdk.end({ mode, won: true, timeMs, assisted: false })`, có settings/help/stats modal từ kit, `preview.svg` hoạt hình (nút nảy), `e2e: {}` (không nút bắt đầu). `game.json` của template có `id: "{{id}}"`, `addedAt: "{{date}}"`. README template mô tả cấu trúc và việc cần thay.

- [ ] **Step 1: Viết `new-game.test.mjs`** (tmp root có `games/_template` giả 2 file chứa placeholder và `order.json = ["a"]`): tạo `xyz` → file có `xyz`, `order.json` = `["a","xyz"]`; tạo lại `xyz` → ném lỗi "đã tồn tại"; `dir = 'Bad Name'` → ném lỗi; `cat = 'sport'` → ném lỗi.
- [ ] **Step 2: Fail. Step 3: Viết `new-game.mjs`, `test-games.mjs`. Step 4: `node --test scripts/new-game.test.mjs` pass.**
- [ ] **Step 5: Viết `_template`** (kit-based). Kiểm tra: `node games/_template/test.js` pass; mở `http://localhost:5180/playnine/_template/` ở dev chơi thắng được; chụp 390×844 không cuộn.
- [ ] **Step 6: Sửa `README.md`** mục "Thêm một game vào portal": `npm run new-game -- <dir> --en --vi --cat` → viết game trong `games/<dir>/` (kit, manifest, `preview.svg` theo yêu cầu Task 5) → `npm test` → `npm run seed-sql -- <id> > supabase/migrations/<ts>_<id>.sql` → áp qua SQL Editor → `npm run build && npm run assemble && npm run e2e`. Cập nhật đoạn SDK (`?v=2`), mục "Cấu trúc thư mục" thêm `_kit`, `_template`, `order.json`.
- [ ] **Step 7: `npm test` (root) xanh — gồm test mọi game. Commit** — `"Add the game template, new-game and test-games scripts"`.

---

### Task 9: E2e chung sinh từ manifest

**Files:**
- Create: `e2e/manifests.ts`, `e2e/games.spec.ts`, `e2e/games-sdk.spec.ts`
- Modify: `playwright.config.ts`, `e2e/sdk-games.spec.ts`; Delete: `e2e/legacy-urls.spec.ts`

**Interfaces:**
- `e2e/manifests.ts`: `export function manifests(): { dir: string; id: string; sdk: boolean; modes: string[]; start?: string }[]` (đọc `games/*/game.json`, bỏ `_*`, không import portal).
- `games.spec.ts` (chạy ở cả hai project): với mỗi game: chặn `**/sdk/playnine.js*`, `goto('<dir>/')` status 200, `title` không rỗng, chờ 500 ms, không `pageerror`.
- `games-sdk.spec.ts` (chromium): với mỗi game `sdk !== false`: `captureMessages`, đặt `playnine-<id>-settings-v1 = {"guideSeen":true}`, `goto('#/play/<id>')`, poll có `pn:hello` đúng `gameId`; nếu có `start` thì click trong iframe; poll có `pn:start` với `mode ∈ modes`.
- `playwright.config.ts`: `testDir: '.'`, `testMatch: ['e2e/**/*.spec.ts', 'games/*/e2e.spec.ts']`, `testIgnore: ['**/node_modules/**', 'dist/**', 'portal/**', 'sdk/**', 'supabase/**']`; project `mobile` `testMatch: /e2e[\\/]games\.spec\.ts$/`.
- `sdk-games.spec.ts`: xóa hai vòng `boardGames`, hai vòng `arcadeGames` và các test "reports hello and start" / "plays standalone" của `noihinh`, `truotso`, `latthe` (đều trùng với test chung); giữ `captureMessages`/`messages`/`Msg` và mọi test ván thắng/đặc thù. Thêm `start` cho 4 game arcade + banbong vào manifest (`"e2e": { "start": "#btn-start" }`) — sửa `game.json` của `xepgach`, `ran`, `phagach`, `banbong`.

- [ ] **Step 1: Viết `manifests.ts`, `games.spec.ts`, `games-sdk.spec.ts`, sửa config, sửa 4 manifest, xóa `legacy-urls.spec.ts`, cắt `sdk-games.spec.ts`.**
- [ ] **Step 2: `npm run build && npm run assemble && npm run e2e`** (build với `VITE_SUPABASE_URL`/`ANON_KEY` rỗng để test "không server" pass): mọi test xanh; số test ≈ 21 + 21 (mobile) + 21 + test còn lại của `sdk-games` + `portal.spec` + `kit.spec`.
- [ ] **Step 3: Commit** — `"Generate the per-game e2e checks from manifests"`.

---

### Task 10: Lưới 24 thẻ + trang `#/games`

**Files:**
- Create: `portal/src/home/sortGames.ts`, `portal/src/home/sortGames.test.ts`, `portal/src/home/GamesPage.tsx`, `portal/src/home/GamesPage.test.tsx`
- Modify: `portal/src/home/GameGrid.tsx`, `portal/src/home/Home.tsx`, `portal/src/home/Home.test.tsx`, `portal/src/player/route.ts`, `portal/src/player/route.test.ts`, `portal/src/App.tsx`, `portal/src/home/Sidebar.tsx`, `portal/src/i18n/dict.ts`, `portal/src/styles/portal.css` (thêm cuối)

**Interfaces:**
- `sortGames.ts`: `export type SortKey = 'order' | 'newest' | 'plays' | 'rating' | 'name'`; `export function sortGames(list: GameDef[], key: SortKey, ctx: { totals: Record<string, number>; ratings: Record<string, RatingSummary>; lang: Lang }): GameDef[]` — ổn định; `newest` theo `addedAt` giảm dần rồi thứ tự gốc; `plays` giảm dần (thiếu = 0); `rating` theo `average` giảm dần rồi `count`; `name` theo `loc(name)` với `localeCompare(lang)`.
- `GameGrid` thêm prop `limit?: number`: sau lọc cat + tìm, nếu `limit` và số thẻ hiện > limit thì thẻ từ thứ `limit+1` có `hidden`, và render `<a className="games-more" href="#/games">{t('games.seeAll', { n })}</a>` dưới lưới (`n` = tổng sau lọc). Không áp `limit` khi `query` khác rỗng. `Home` truyền `limit={24}`.
- `route.ts`: thêm `{ name: 'games' }` cho `#/games`; `Sidebar.sectionOf` trả `'games'` cho `#/games` và nút Games có `aria-current="page"` khi đó.
- `GamesPage({ onThemeApplied })`: `Topbar` với `SearchBox`, tiêu đề `t('games.all')`, `Filters`, `<select aria-label={t('games.sort')}>` 5 lựa chọn, lưới dùng `GameGrid` không `limit` với danh sách đã `sortGames`; lưu sort ở `game-portal-sort-v1`. `App.tsx` render khi `page.name === 'games'`.
- Dict (en / vi): `games.all` "All games" / "Tất cả game"; `games.seeAll` "See all {n} games" / "Xem tất cả {n} game"; `games.sort` "Sort by" / "Sắp xếp"; `games.sortOrder` "Featured" / "Mặc định"; `games.sortNewest` "Newest" / "Mới nhất"; `games.sortPlays` "Most played" / "Chơi nhiều"; `games.sortRating` "Top rated" / "Đánh giá cao"; `games.sortName` "Name" / "Tên".
- CSS cuối `portal.css`: `.games-more` (nút rộng, căn giữa, kiểu `.profile-btn`), `.games-page .section-head` (tiêu đề + bộ lọc + select).

- [ ] **Step 1: Viết `sortGames.test.ts`** (5 khóa, ổn định khi bằng nhau, thiếu totals/ratings) và `route.test.ts` (`#/games` → `{ name: 'games' }`; `#/games/x` → `games`).
- [ ] **Step 2: Fail. Step 3: Viết `sortGames.ts`, sửa `route.ts`. Step 4: Pass.**
- [ ] **Step 5: Viết test `Home.test.tsx`**: dựng `GAMES` giả 30 game (mock module `../games/catalog` với `vi.mock`) → `#games > li:not([hidden])` = 24 và có `a.games-more[href="#/games"]` chứa "30"; gõ tìm kiếm khớp 26 game → 26 thẻ hiện, không có `.games-more`; 1 game bị ẩn (server) → vẫn 24 thẻ hiện và nút ghi 29. Phím `9` vẫn mở game thứ 9 của `order.json` (có sẵn test shortcut: giữ xanh).
- [ ] **Step 6: Fail. Step 7: Sửa `GameGrid.tsx`, `Home.tsx`. Step 8: Pass.**
- [ ] **Step 9: Viết `GamesPage.test.tsx`**: hiện đủ `GAMES.length` thẻ; chọn sort `name` thì thẻ đầu là game có tên en đứng đầu bảng chữ cái; chọn filter `versus` chỉ còn game versus; `document.title` = "All games · PlayNine".
- [ ] **Step 10: Fail. Step 11: Viết `GamesPage.tsx`, nối `App.tsx`, `Sidebar.tsx`, dict, CSS. Step 12: Pass; `npx tsc -b` sạch.**
- [ ] **Step 13: Commit** — `"Cap the home grid at 24 games and add the all-games page"`.

---

### Task 11: Menu đổi game trong khi chơi và bảng admin chịu được 100 game

**Files:**
- Modify: `portal/src/player/Player.tsx`, `portal/src/player/Player.test.tsx`, `portal/src/admin/AdminGames.tsx`, `portal/src/admin/AdminGames.test.tsx`, `portal/src/i18n/dict.ts`, `portal/src/styles/portal.css` hoặc `admin.css` (thêm cuối)

**Interfaces:**
- `Player` `#p-menu-list`: thêm `<input className="pmenu-search" type="search" aria-label={t('games.search')}>`; có chữ thì lọc bằng `matchesQuery`; không có chữ thì nhóm theo `CATS` với tiêu đề `<h3>` (giống `GameMenu`). Dải icon `#p-switch` giữ nguyên.
- `AdminGames`: trên danh sách thêm `<input type="search" aria-label={t('admin.filterGames')}>` lọc theo `id` hoặc tên (en/vi, không phân biệt hoa thường) và `<select aria-label={t('admin.filterCat')}>` (`all` + 5 cat). Dict: `admin.filterGames` "Filter games" / "Lọc game"; `admin.filterCat` "Category" / "Thể loại".

- [ ] **Step 1: Viết test** — `Player.test.tsx`: `it('menu đổi game có ô tìm: gõ "sudo" chỉ còn nút Sudoku; để trống thì nhóm theo thể loại')`. `AdminGames.test.tsx`: gõ `caro` chỉ còn hàng Gomoku; chọn cat `arcade` chỉ còn game arcade.
- [ ] **Step 2: Fail. Step 3: Sửa hai component + dict + CSS. Step 4: Pass. Commit** — `"Add quick filters to the in-game switcher and the admin games table"`.

---

### Task 12: Kiểm tra "sau đợt 0" và chốt

**Files:**
- Modify (tạm): tạo rồi xóa `games/demo/`; Modify: `docs/superpowers/specs/2026-10-23-100-games-roadmap.md` (đánh dấu mục 8 "Sau đợt 0" đã đạt, một dòng)

- [ ] **Step 1: Tạo game thử** — `npm run new-game -- demo --en "Demo" --vi "Thử"`; `git status --short` chỉ hiện `games/demo/` và `games/order.json` (không file nào khác của cổng).
- [ ] **Step 2: `npm test` xanh** (test game chạy cả `demo`); `npm run seed-sql -- demo` in ra một câu insert hợp lệ (không ghi file).
- [ ] **Step 3: `npm run build && npm run assemble && npm run e2e`** (env Supabase rỗng): e2e chung tự có 3 test cho `demo`, tất cả xanh; trang chủ hiện 22 thẻ (≤ 24, chưa có nút Xem tất cả); `#/games` hiện 22.
- [ ] **Step 4: Xóa `games/demo/` và dòng `demo` trong `order.json`**; `git status` sạch ngoài roadmap.
- [ ] **Step 5: Cập nhật roadmap** mục 8 dòng "Sau đợt 0": thêm "— đạt ngày YYYY-MM-DD". Commit — `"Mark batch 0 of the 100-game roadmap as done"`. Push `main`.
