# Giai đoạn 2 — Server, SDK và bảng xếp hạng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm Supabase (database, RPC kiểm tra điểm, đăng nhập Google), SDK cho game, bảng xếp hạng và trang hồ sơ trong cổng, gắn SDK vào 17 game — site vẫn chạy y như cũ khi chưa cấu hình Supabase hoặc khi Supabase sập.

**Architecture:** Game chỉ nói chuyện với SDK (`window.PlayNine`), SDK `postMessage` lên cổng; cổng giữ phiên đăng nhập và gọi các RPC `security definer` của Supabase. Database được viết bằng migration SQL và test trong Node bằng PGlite (Postgres chạy WASM) với một lớp giả lập `auth` của Supabase, nên không cần Docker hay tài khoản để test. Cổng truy cập server qua một interface `ServerApi`; bản thật bọc `supabase-js`, test dùng bản giả; thiếu biến môi trường thì không có server và cổng chạy như giai đoạn 1.

**Tech Stack:** Supabase (Postgres 15+, Auth Google, PKCE), `@supabase/supabase-js` v2, `@electric-sql/pglite`, Supabase CLI (`npx supabase`), Vite library mode cho SDK, Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-10-20-portal-platform-design.md](../specs/2026-10-20-portal-platform-design.md) — mục 5, 6.2 (trừ sự kiện, bộ sưu tập, admin, huy hiệu: giai đoạn 3), 7.1–7.5, 8, 10 (giai đoạn 2), 11.

## Global Constraints

- Gói Free, không gắn thẻ; không dùng Edge Functions; chỉ Postgres + RPC + Auth.
- Mở thẳng link game (không qua cổng, không mạng, không có `sdk/playnine.js`, Supabase sập) vẫn chơi được như bây giờ, chỉ không ghi điểm. Mọi lời gọi SDK trong game đi qua `window.PlayNine` có kiểm tra tồn tại.
- Cổng không có `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` thì không hiện nút đăng nhập, không gọi mạng, hành vi y như giai đoạn 1 (e2e hiện có phải qua không sửa).
- Game không bao giờ gọi server. Client chỉ dùng anon key; service role key không nằm trong repo/client.
- `runs` không đọc/ghi trực tiếp được; mọi ghi của người chơi đi qua RPC. Bật RLS cho mọi bảng.
- Tuần: thứ Hai 00:00 → hết Chủ nhật theo `Asia/Ho_Chi_Minh`; mode `daily` chỉ có kỳ `day` (ngày theo `Asia/Ho_Chi_Minh`).
- Đăng nhập chỉ Google (spec mục 2). OAuth dùng `flowType: 'pkce'` (cổng định tuyến bằng `#/…`, luồng implicit trả token trong hash sẽ đụng router).
- Tin nhắn `postMessage` chỉ nhận khi `event.origin === location.origin` (cả hai phía) và (phía cổng) `event.source` là `contentWindow` của iframe game đang mở.
- Game cũ: chỉ thêm đúng các dòng gắn SDK, không format lại; tăng `?v=` của `app.js` (và thêm `?v=` cho SDK) trong `index.html` để trình duyệt tải bản mới. Không gọi SDK trong `engine.js` hay khối `rules`/`ai` của xiangqi (test Node đọc các phần đó).
- Khóa `localStorage` cũ giữ nguyên; khóa mới: `playnine-run-<gameId>` (ván đang mở). `sessionStorage` `playnine-play-<gameId>` (chặn đếm lượt).
- Chuỗi giao diện mới thêm vào `portal/src/i18n/dict.ts` ở cả `en` và `vi` (chỉ thêm khóa, không sửa khóa cũ). Chữ do người chơi/ game nhập (tên hiển thị…) luôn render dạng text.
- CSS mới nằm ở file mới `portal/src/styles/server.css`, không sửa `portal.css`.
- README/comment tiếng Việt; commit message tiếng Anh kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Cài package bằng `--registry=https://registry.npmjs.org/` (thêm `--strict-ssl=false` chỉ khi lỗi TLS). Bash trên máy này hỏng: dùng PowerShell.

## Review Focus

1. Game mở ngoài cổng hoặc `../sdk/playnine.js` không tải được (404, file://) → game vẫn chạy, không lỗi console. Test e2e ở Task 8–10 (chặn request SDK rồi mở game trực tiếp).
2. Người chơi đăng nhập/đăng xuất giữa ván → ván đã bắt đầu khi chưa đăng nhập không ghi điểm và không lỗi; đăng xuất giữa ván thì `gameEnd` không gọi server. Test ở Task 5.
3. Supabase trả lỗi/timeout (mạng chập chờn, project bị tạm dừng) ở `start_run`/`finish_run`/`leaderboard` → game không bị chặn, cổng hiện "Ván này không tính điểm"/ẩn bảng xếp hạng, không ném lỗi chưa bắt. Test ở Task 5 và Task 6.
4. Tên hiển thị chứa HTML (`<img onerror>`) hoặc toàn khoảng trắng → hiển thị dạng text ở bảng xếp hạng/hồ sơ; server từ chối tên sau khi cắt khoảng trắng dài < 2 hoặc > 24. Test ở Task 1 (constraint) và Task 6/7 (render).
5. Mở cùng một game ở hai tab, hoặc tải lại trang khi ván đã kết thúc → `finish_run` lần hai trên cùng `run_id` bị từ chối êm (không ghi đôi, không lỗi). Test ở Task 2 và Task 5.

---

## File Structure

```
supabase/                         workspace @playnine/db
  package.json                    vitest + @electric-sql/pglite + supabase (CLI)
  config.toml                     do `npx supabase init` tạo
  migrations/20261021000100_core.sql      profiles, games (+seed 17 game), runs, play_counts, RLS, ping, record_play, play_totals
  migrations/20261021000200_runs.sql      start_run, finish_run, leaderboard, my_rank, profile_bests
  tests/harness.ts                 createDb(), asUser(), asAnon(), newUser()
  tests/supabase-shim.sql          schema auth giả lập: auth.users, auth.uid(), role anon/authenticated
  tests/core.test.ts, tests/runs.test.ts
  README.md                        checklist làm tay (Supabase, Google, GitHub secrets, migration, admin)
sdk/                              workspace @playnine/sdk
  package.json, vite.config.ts, tsconfig.json
  src/protocol.ts                  kiểu tin nhắn dùng chung với cổng
  src/sdk.ts                       createPlayNine()
  src/global.ts                    gắn window.PlayNine (entry IIFE)
  src/sdk.test.ts
  dist/playnine.js (IIFE), dist/playnine.mjs (ESM)  — không commit
portal/src/server/
  types.ts                         AuthUser, Profile, GameMeta, Metric, Period, LeaderRow, FinishResult, BestRow, RunResult
  api.ts                           interface ServerApi
  supabaseApi.ts                   createSupabaseApi(url, key): ServerApi
  fakeApi.ts                       createFakeApi(): ServerApi & { calls, … } cho test
  ServerProvider.tsx               ServerProvider, useServer()
  runs.ts                          createRunManager()
  playCount.ts                     recordPlayThrottled()
portal/src/player/bridge.ts        useGameBridge()
portal/src/player/Leaderboard.tsx  bảng xếp hạng trên trang game
portal/src/player/Toast.tsx        thông báo sau ván
portal/src/home/AuthButton.tsx     nút đăng nhập / avatar + menu
portal/src/profile/ProfilePage.tsx trang #/u/<id>
portal/src/styles/server.css
games/<17 thư mục>/index.html, app.js (xiangqi: index.html)   — chỉ thêm dòng gắn SDK
e2e/sdk-games.spec.ts
.github/workflows/deploy.yml       thêm env VITE_SUPABASE_*
.github/workflows/keepalive.yml    cron gọi ping
```

---

### Task 1: Database nền — workspace `supabase/`, harness PGlite, bảng, RLS, đếm lượt chơi

**Files:**
- Create: `supabase/package.json` (name `@playnine/db`, script `test` = `vitest run`), `supabase/config.toml` (bằng `npx supabase init`, giữ mặc định), `supabase/migrations/20261021000100_core.sql`, `supabase/tests/supabase-shim.sql`, `supabase/tests/harness.ts`, `supabase/tests/core.test.ts`
- Modify: `package.json` gốc (`workspaces` thêm `"supabase"`; `test` chạy thêm `npm test -w supabase`)

**Interfaces:**
- Produces (SQL, schema `public`):
  - `profiles(id uuid pk references auth.users on delete cascade, display_name text not null check (char_length(btrim(display_name)) between 2 and 24 and display_name = btrim(display_name)), avatar_url text, role text not null default 'player' check (role in ('player','admin')), banned boolean not null default false, created_at timestamptz not null default now())`
  - Trigger `on auth.users insert` → tạo `profiles` với `display_name` = `left(btrim(coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email,'@',1))), 24)` (nếu < 2 ký tự thì `'Player'`), `avatar_url` = `raw_user_meta_data->>'avatar_url'`.
  - `games(id text pk, metric text not null check (metric in ('score_high','time_low','wins')), modes jsonb not null, hidden boolean not null default false)`; `modes` = mảng `{ key, label: {en, vi}, rules: { min_duration_ms?, max_score?, max_score_per_sec?, min_time_ms? } }`.
  - `runs(id uuid pk default gen_random_uuid(), user_id uuid not null references profiles, game_id text not null references games, mode text not null, started_at timestamptz not null default now(), ended_at timestamptz, score bigint, time_ms bigint, won boolean, assisted boolean not null default false, status text not null default 'started' check (status in ('started','finished','rejected')), reject_reason text)` + index `(game_id, mode, status, ended_at)` và `(user_id)`.
  - `play_counts(game_id text references games, day date, count bigint not null default 0, primary key (game_id, day))`.
  - RLS bật trên cả 4 bảng. Policy: `games`, `play_counts` đọc công khai (anon + authenticated); `profiles` đọc công khai; `profiles` update chỉ khi `id = auth.uid()`, và chỉ cột `display_name` được grant update cho `authenticated`. `runs`: không policy nào, revoke mọi quyền của `anon`/`authenticated`.
  - `ping() returns int` (trả 1; anon được gọi).
  - `record_play(p_game_id text) returns void` (`security definer`; anon + authenticated; game không tồn tại thì không làm gì; tăng `play_counts` ngày `(now() at time zone 'Asia/Ho_Chi_Minh')::date` bằng upsert).
  - `play_totals() returns table(game_id text, total bigint)` (anon + authenticated).
  - Mọi function: `revoke execute … from public` rồi grant đúng role; `set search_path = public` cho function `security definer`.
  - Seed `games` cho 17 game theo bảng dưới (label en/vi tự đặt ngắn gọn; `rules` rộng tay, chỉ chặn điều bất khả thi — ví dụ `min_duration_ms` 3000 cho game thắng máy, `max_score_per_sec` gấp ~5 lần mức kỷ lục thực tế ước lượng).

  | id (catalog) | metric | mode keys |
  |---|---|---|
  | 2048 | score_high | `3x3`, `4x4`, `5x5` |
  | xepgach | score_high | `lv1`, `lv5`, `lv10` |
  | ran | score_high | `classic-slow`, `classic-normal`, `classic-fast`, `wrap-slow`, `wrap-normal`, `wrap-fast`, `maze-slow`, `maze-normal`, `maze-fast` |
  | phagach | score_high | `default` |
  | minesweeper | time_low | `easy`, `medium`, `hard`, `daily` |
  | sudoku | time_low | `easy`, `medium`, `hard`, `expert`, `extreme`, `daily` |
  | tranhan | wins | `s5`, `s10`, `s15` |
  | xepbai | wins | `draw1`, `draw3`, `daily` |
  | co9o, caro, xiangqi, covua, colat, codam, coganh, oanquan, bonlientiep | wins | `easy`, `medium`, `hard` |

- Produces (TS, `supabase/tests/harness.ts`):
  - `createDb(): Promise<PGlite>` — PGlite mới, chạy `supabase-shim.sql` rồi mọi file `migrations/*.sql` theo tên.
  - `newUser(db, meta?: { full_name?: string; avatar_url?: string; email?: string }): Promise<string>` — chèn `auth.users` (trigger tạo profile), trả uuid.
  - `asUser<T>(db, userId, fn: () => Promise<T>): Promise<T>` — `set role authenticated` + `set request.jwt.claim.sub`, chạy `fn`, `reset role` (kể cả khi lỗi).
  - `asAnon<T>(db, fn): Promise<T>` — tương tự với role `anon`.
- `supabase-shim.sql`: tạo role `anon`, `authenticated` (nologin), schema `auth`, bảng `auth.users(id uuid pk default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}')`, `auth.uid()` = `nullif(current_setting('request.jwt.claim.sub', true), '')::uuid`, grant usage schema public cho hai role. Shim chỉ dùng trong test; migration không được tạo schema `auth`.

- [ ] **Step 1: Spike PGlite.** Trong `core.test.ts`, test đầu tiên `pglite supports roles, RLS and the Asia/Ho_Chi_Minh zone`: tạo bảng có RLS + policy, `set role authenticated` thì không thấy hàng bị chặn; `select now() at time zone 'Asia/Ho_Chi_Minh'` chạy được. Nếu PGlite không làm được một trong hai thì dừng, báo BLOCKED kèm lỗi (phương án dự phòng là Supabase CLI local cần Docker — controller quyết).

- [ ] **Step 2: Viết test** (`core.test.ts`, mỗi test `createDb()` mới):
  - `seeds 17 games with metrics and modes` — đủ 17 id ở bảng trên, đúng metric, `modes` của `2048` có key `3x3,4x4,5x5`, mọi mode có `label.en`, `label.vi`.
  - `creates a profile from Google metadata` — `newUser({ full_name: '  Minh Nguyen  ', avatar_url: 'https://a/b.png' })` → profile `display_name = 'Minh Nguyen'`, `avatar_url` đúng, `role = 'player'`, `banned = false`; không có `full_name` → phần trước `@` của email; tên 1 ký tự → `'Player'`.
  - `anyone reads games, play_counts and profiles` — `asAnon` select được ba bảng.
  - `runs are not directly readable or writable` — `asUser` và `asAnon`: `select * from runs` lỗi quyền hoặc 0 hàng; `insert into runs …` lỗi.
  - `a player renames only themself` — `asUser(a)` update `display_name` của mình thành `'An'` được; update của `b` → 0 hàng đổi; update `role = 'admin'` của mình → lỗi quyền; tên `' '` hoặc 25 ký tự → lỗi check.
  - `record_play counts guests and players per day` — `asAnon` gọi 2 lần + `asUser` 1 lần cho `2048` → `play_totals()` trả `2048 = 3`; game lạ `'nope'` → không lỗi, không thêm hàng.
  - `ping returns 1 for anon`.

- [ ] **Step 3: Chạy `npm test -w supabase`** → FAIL (chưa có migration).

- [ ] **Step 4: Viết `20261021000100_core.sql`** theo Interfaces.

- [ ] **Step 5: Chạy `npm test -w supabase`** → PASS; chạy `npm test` ở gốc → PASS.

- [ ] **Step 6: Commit** `Add Supabase core schema with PGlite-tested RLS and play counts`.

---

### Task 2: RPC ván chơi và bảng xếp hạng

**Files:**
- Create: `supabase/migrations/20261021000200_runs.sql`, `supabase/tests/runs.test.ts`

**Interfaces:**
- Consumes: bảng và harness của Task 1.
- Produces (tất cả `security definer`, `set search_path = public`, chỉ grant `authenticated` trừ khi ghi khác):
  - `start_run(p_game_id text, p_mode text) returns uuid` — cần `auth.uid()` có profile, không `banned` (banned → `raise exception 'banned'`), game + mode tồn tại (sai → `raise exception 'unknown_game_or_mode'`). Tạo `runs` `status='started'`.
  - `finish_run(p_run_id uuid, p_score bigint, p_time_ms bigint, p_won boolean, p_assisted boolean) returns jsonb` — trả `{ "status": "finished"|"rejected", "reason": text|null, "ranks": { "week"?: int, "all"?: int, "day"?: int } }`. Ván không thuộc người gọi hoặc không ở `started` → trả `{status:'rejected', reason:'not_open', ranks:{}}` và **không** đổi gì. Ngược lại ghi `ended_at = now()`, các giá trị, rồi kiểm tra theo thứ tự, gặp lỗi đầu tiên thì `status='rejected'`, `reject_reason`:
    - `banned` — người chơi bị khóa.
    - `expired` — `now() - started_at > interval '24 hours'`.
    - `too_fast` — `ended_at - started_at < rules.min_duration_ms`.
    - `missing_value` — `score_high` mà `p_score` null; `time_low` + `p_won` mà `p_time_ms` null.
    - `time_mismatch` — `time_low`: `p_time_ms > (thời gian server tính bằng ms) + 5000`.
    - `time_too_low` — `time_low`: `p_time_ms < rules.min_time_ms`.
    - `score_too_high` — `p_score > rules.max_score`.
    - `score_rate` — `p_score / greatest(1, giây server) > rules.max_score_per_sec`.
    - `ranks`: mode `daily` → chỉ `day`; mode khác → `week` và `all`; ván `rejected` hoặc ván không lên bảng (time_low/wins mà thua hoặc `assisted`) → `{}`.
  - `leaderboard(p_game_id text, p_mode text, p_period text, p_limit int default 50) returns table(rank int, user_id uuid, display_name text, avatar_url text, value bigint, achieved_at timestamptz)` — anon + authenticated. Chỉ ván `finished` của người không `banned`, trong kỳ (`day`/`week` theo giờ `Asia/Ho_Chi_Minh`, `all`). Giá trị mỗi người: `score_high` = max `score`; `time_low` = min `time_ms` của ván `won and not assisted`; `wins` = số ván `won and not assisted`. Thứ hạng: `score_high`/`wins` giảm dần, `time_low` tăng dần; hòa thì ai đạt trước (`achieved_at` sớm hơn — với `wins` là `ended_at` của ván thắng cuối cùng) đứng trên. `rank` = `row_number()`. `p_limit` kẹp trong 1..100.
  - `my_rank(p_game_id text, p_mode text, p_period text) returns table(rank int, value bigint)` — hàng của `auth.uid()` theo cùng cách xếp; không có thì 0 hàng.
  - `profile_bests(p_user_id uuid) returns table(game_id text, mode text, metric text, value bigint, achieved_at timestamptz)` — anon + authenticated; giá trị "mọi lúc" của người đó cho từng game/mode có dữ liệu.

- [ ] **Step 1: Viết test** (`runs.test.ts`; dùng `update runs set started_at = now() - interval '…'` bằng superuser để giả thời gian):
  - `start_run creates an open run` — trả uuid; mode sai → lỗi `unknown_game_or_mode`; anon → lỗi quyền; người bị khóa → lỗi `banned`.
  - `finish_run accepts a plausible score and returns ranks` — `2048/4x4` bắt đầu 60s trước, score 5000 → `finished`, `ranks.week = 1`, `ranks.all = 1`.
  - `finish_run rejects each implausible run` — một test con cho mỗi lý do: `too_fast`, `missing_value`, `time_mismatch`, `time_too_low`, `score_too_high`, `score_rate`, `expired`, `banned`; mỗi cái kiểm tra `status`, `reason` và hàng `runs` có `status='rejected'`.
  - `finish_run twice is a no-op` — lần hai trả `reason:'not_open'`, giá trị lần một giữ nguyên.
  - `finish_run of another player's run is refused` — `not_open`, ván của người kia vẫn `started`.
  - `score_high board keeps each player's best` — A: 100, 300; B: 200 → `[A 300, B 200]`.
  - `time_low board ignores losses and assisted runs` — A thắng 90000, A thắng `assisted` 30000, B thua → chỉ `[A 90000]`.
  - `wins board counts wins in the period` — A 2 thắng tuần này + 1 tuần trước, B 1 thắng → tuần: `[A 2, B 1]`, mọi lúc: `[A 3, B 1]`.
  - `ties go to whoever got there first` — A và B cùng 500, B đạt trước → B hạng 1.
  - `week starts Monday in Asia/Ho_Chi_Minh` — ván kết thúc Chủ nhật 23:30 giờ VN (= 16:30 UTC) không thuộc tuần bắt đầu thứ Hai kế tiếp; dùng ngày cố định bằng cách đặt `ended_at` và gọi một hàm nội bộ nhận `p_now` (cho phép: `leaderboard` gọi `_leaderboard_at(…, now())`; test gọi `_leaderboard_at` trực tiếp bằng superuser).
  - `daily mode ranks by day` — `sudoku/daily`: ván hôm qua không vào bảng `day`; `finish_run` trả `ranks` chỉ có `day`.
  - `banned and rejected runs are hidden` — khóa A sau khi A có điểm → A biến khỏi `leaderboard`.
  - `my_rank returns the caller's row` và `profile_bests lists each game/mode`.

- [ ] **Step 2: Chạy `npm test -w supabase`** → FAIL.

- [ ] **Step 3: Viết `20261021000200_runs.sql`.**

- [ ] **Step 4: Chạy `npm test -w supabase`** → PASS.

- [ ] **Step 5: Commit** `Add run validation and leaderboard RPCs`.

---

### Task 3: SDK cho game

**Files:**
- Create: `sdk/package.json` (name `@playnine/sdk`, `exports`: `"./protocol"` → `./src/protocol.ts`; scripts `build` = `vite build`, `test` = `vitest run`), `sdk/tsconfig.json`, `sdk/vite.config.ts` (library mode: entry `src/global.ts` → `dist/playnine.js` định dạng IIFE; entry `src/sdk.ts` → `dist/playnine.mjs` ESM; `test.environment = 'jsdom'`), `sdk/src/protocol.ts`, `sdk/src/sdk.ts`, `sdk/src/global.ts`, `sdk/src/sdk.test.ts`
- Modify: `package.json` gốc (`workspaces` thêm `"sdk"`, `test` chạy thêm `npm test -w sdk`; `build` chạy `sdk` trước `portal`: `npm run build -w sdk && npm run build -w portal`), `scripts/assemble.mjs` + `scripts/assemble.test.mjs` (chép `sdk/dist/` → `out/sdk/`; thiếu `sdk/dist/playnine.js` thì báo lỗi rõ như với portal), `portal/vite/serve-games.ts` + test (dev: `/playnine/sdk/*` → `<repo>/sdk/dist/*`, cùng kiểm tra chứa trong thư mục), `README.md` (lệnh build SDK, cách game gắn SDK)

**Interfaces:**
- Produces (`sdk/src/protocol.ts`, cổng import qua `@playnine/sdk/protocol`):
  ```ts
  export const PROTOCOL_VERSION = 1
  export type GameResult = { score?: number; timeMs?: number; won: boolean; assisted?: boolean }
  export type GameToPortal =
    | { type: 'pn:hello'; v: 1; gameId: string }
    | { type: 'pn:start'; v: 1; gameId: string; mode: string; resume: boolean }
    | { type: 'pn:end'; v: 1; gameId: string; mode: string } & GameResult
  export type PortalToGame = { type: 'pn:ready'; v: 1 }
  export function isGameToPortal(x: unknown): x is GameToPortal   // kiểm tra kiểu chặt: type, v === 1, gameId/mode là chuỗi khác rỗng, số hữu hạn ≥ 0 nếu có, won là boolean
  ```
- Produces (`sdk/src/sdk.ts`):
  - `createPlayNine(env: { win: Window; parent: Window | null; timeoutMs?: number }): PlayNineApi` (mặc định `timeoutMs` 1500; `parent` null hoặc `=== win` → độc lập ngay).
  - `type PlayNineApi = { init(o: { gameId: string }): void; gameStart(o: { mode: string; resume?: boolean }): void; gameEnd(o: { mode: string } & GameResult): void; isConnected(): boolean }`.
  - `export const PlayNine: PlayNineApi = createPlayNine({ win: window, parent: window.parent === window ? null : window.parent })` khi có `window`.
  - `global.ts`: `window.PlayNine = PlayNine`.
- Hành vi:
  - `init` gửi `pn:hello` tới `parent` với `targetOrigin = win.location.origin`; chờ `pn:ready` (chỉ nhận khi `event.source === parent` và `event.origin === win.location.origin`).
  - Trước khi bắt tay xong, `gameStart`/`gameEnd` được xếp hàng (tối đa 20) và gửi theo thứ tự khi có `pn:ready`; hết `timeoutMs` không có `pn:ready` → chế độ độc lập, bỏ hàng đợi.
  - `gameEnd` không có `gameStart` trước đó (cùng mode, chưa kết thúc) → bỏ qua. `gameStart` khi đang có ván mở → ván cũ coi như bỏ, ván mới mở.
  - Mọi hàm không bao giờ ném lỗi (bọc try/catch), kể cả khi gọi trước `init` (bỏ qua) hoặc `postMessage` lỗi.

- [ ] **Step 1: Viết test** (`sdk.test.ts`, `parent` giả có `postMessage` là `vi.fn()`, `vi.useFakeTimers`):
  - `standalone when not framed` — `parent: null`: mọi hàm chạy, không `postMessage`, `isConnected() === false`.
  - `hello then ready connects` — `init({gameId:'2048'})` gửi `{type:'pn:hello',v:1,gameId:'2048'}`; phát `MessageEvent('message',{data:{type:'pn:ready',v:1}, source: parent, origin: location.origin})` → `isConnected() === true`.
  - `queues calls until ready` — `gameStart({mode:'4x4'})` trước `pn:ready` không gửi; sau `pn:ready` gửi `pn:start` với `resume:false`.
  - `drops the queue after the timeout` — 1500ms không `pn:ready` → `isConnected() === false`, `gameStart` sau đó không gửi, hàng đợi không bao giờ được gửi.
  - `ignores ready from another origin or source`.
  - `gameEnd without gameStart is ignored`; `gameEnd` sau `gameStart` gửi `pn:end` đủ trường; `gameEnd` lần hai bị bỏ.
  - `never throws` — `parent.postMessage` ném lỗi → các hàm vẫn không ném.
  - `isGameToPortal rejects malformed messages` — thiếu `gameId`, `v: 2`, `score: -1`, `score: NaN`, `won: 'yes'` → false.
  - Test assemble mới: `copies sdk/dist to out/sdk`, `fails when sdk build is missing`. Test serve-games: `/playnine/sdk/playnine.js` → `sdk/dist/playnine.js`; `/playnine/sdk/../package.json` → null.

- [ ] **Step 2: Chạy `npm test -w sdk` và `node --test "scripts/*.test.mjs"`** → FAIL.

- [ ] **Step 3: Viết SDK, cập nhật assemble và serve-games.**

- [ ] **Step 4: Chạy `npm test` (gốc), `npm run build`, `npm run assemble`, `npm run e2e`** → PASS; `dist/sdk/playnine.js` tồn tại và định nghĩa `window.PlayNine` (kiểm tra bằng `node -e` đọc file thấy chuỗi `PlayNine`).

- [ ] **Step 5: Commit** `Add the PlayNine game SDK and ship it with the site`.

---

### Task 4: Lớp server của cổng và đăng nhập Google

**Files:**
- Create: `portal/src/server/types.ts`, `portal/src/server/api.ts`, `portal/src/server/supabaseApi.ts`, `portal/src/server/fakeApi.ts`, `portal/src/server/ServerProvider.tsx`, `portal/src/home/AuthButton.tsx`, `portal/src/styles/server.css`, `portal/.env.example`, tests `portal/src/server/ServerProvider.test.tsx`, `portal/src/home/AuthButton.test.tsx`
- Modify: `portal/package.json` (dependency `@supabase/supabase-js`, `@playnine/sdk` `"*"`), `portal/src/main.tsx` (bọc `ServerProvider`, import `server.css`), `portal/src/home/Topbar.tsx` (chèn `<AuthButton />` trong `.top-actions` trước `#lang-btn`), `portal/src/i18n/dict.ts` (khóa mới), `.github/workflows/deploy.yml` (env `VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}`, `VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}` cho bước build ở cả hai job), `.gitignore` (`portal/.env.local`)

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type Metric = 'score_high' | 'time_low' | 'wins'
  export type Period = 'day' | 'week' | 'all'
  export type AuthUser = { id: string; displayName: string; avatarUrl: string | null }
  export type Profile = AuthUser
  export type ModeMeta = { key: string; label: { en: string; vi: string } }
  export type GameMeta = { id: string; metric: Metric; modes: ModeMeta[]; hidden: boolean }
  export type LeaderRow = { rank: number; userId: string; displayName: string; avatarUrl: string | null; value: number; achievedAt: string }
  export type RunResult = { score?: number; timeMs?: number; won: boolean; assisted: boolean }
  export type FinishResult = { status: 'finished' | 'rejected'; reason: string | null; ranks: Partial<Record<Period, number>> }
  export type BestRow = { gameId: string; mode: string; metric: Metric; value: number; achievedAt: string }
  ```
- Produces (`api.ts`):
  ```ts
  export interface ServerApi {
    currentUser(): Promise<AuthUser | null>
    onAuthChange(cb: (u: AuthUser | null) => void): () => void
    signInWithGoogle(): Promise<void>
    signOut(): Promise<void>
    gameMeta(): Promise<GameMeta[]>
    playTotals(): Promise<Record<string, number>>
    recordPlay(gameId: string): Promise<void>
    startRun(gameId: string, mode: string): Promise<string>
    finishRun(runId: string, r: RunResult): Promise<FinishResult>
    leaderboard(gameId: string, mode: string, period: Period, limit?: number): Promise<LeaderRow[]>
    myRank(gameId: string, mode: string, period: Period): Promise<{ rank: number; value: number } | null>
    profile(userId: string): Promise<Profile | null>
    profileBests(userId: string): Promise<BestRow[]>
    updateDisplayName(name: string): Promise<void>
  }
  ```
  - `createSupabaseApi(url: string, anonKey: string): ServerApi` — `createClient(url, anonKey, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } })`; `signInWithGoogle` dùng `redirectTo = location.origin + location.pathname` (giữ `/playnine/`, bỏ hash); `AuthUser` lấy từ bảng `profiles` (không lấy từ metadata Google) để tên đã đổi được dùng; lỗi RPC → ném `Error` (bên gọi tự bắt).
  - `createFakeApi(seed?: Partial<FakeState>): ServerApi & { state: FakeState; calls: { method: string; args: unknown[] }[]; fail(method: keyof ServerApi, err?: Error): void }` — giữ dữ liệu trong bộ nhớ đủ cho test cổng (user, games, runs, leaderboard trả từ `state.boards`).
  - `ServerProvider({ api?: ServerApi | null, children })` — mặc định `api` = `createSupabaseApi(...)` nếu có `import.meta.env.VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`, ngược lại `null`.
  - `useServer(): { api: ServerApi | null; user: AuthUser | null; authReady: boolean; games: Record<string, GameMeta>; refreshUser(): Promise<void> }` — `games` tải một lần (lỗi → `{}`).
- Khóa DICT mới (en / vi): `auth.signIn` ("Sign in with Google" / "Đăng nhập bằng Google"), `auth.signOut`, `auth.profile`, `auth.menu` (aria), `auth.failed`.

- [ ] **Step 1: Viết test:**
  - `ServerProvider.test.tsx`: `api = null` → `useServer()` trả `api null`, `user null`, `authReady true`, không gọi mạng; với `createFakeApi({ user: A })` → `user` = A sau khi tải, `games` có metadata; `onAuthChange` phát `null` → `user null`; `gameMeta` lỗi → `games = {}` và không ném.
  - `AuthButton.test.tsx`: không có server → không render gì; có server, chưa đăng nhập → nút `auth.signIn`, bấm gọi `signInWithGoogle`; đã đăng nhập → avatar (hoặc chữ cái đầu khi `avatarUrl` null) với `aria-label` chứa tên, bấm mở menu có liên kết `#/u/<id>` và nút đăng xuất gọi `signOut`; tên `<img src=x onerror=alert(1)>` hiện dạng text.
  - Test e2e hiện có (`npm run e2e`) vẫn qua không sửa (build không có biến môi trường).

- [ ] **Step 2: Chạy `npm test -w portal`** → FAIL.

- [ ] **Step 3: Viết code.** `fakeApi.ts` chỉ được import từ test.

- [ ] **Step 4: Chạy `npm test`, `npm run build`, `npm run assemble`, `npm run e2e`** → PASS; `grep` bản build không chứa `fakeApi`.

- [ ] **Step 5: Commit** `Add the portal server layer and Google sign-in`.

---

### Task 5: Cầu nối game ↔ cổng, quản lý ván, đếm lượt chơi

**Files:**
- Create: `portal/src/player/bridge.ts`, `portal/src/server/runs.ts`, `portal/src/server/playCount.ts`, `portal/src/player/Toast.tsx`, tests `portal/src/player/bridge.test.ts`, `portal/src/server/runs.test.ts`, `portal/src/server/playCount.test.ts`
- Modify: `portal/src/player/Player.tsx` (gắn bridge cho iframe đang mở, hiện Toast và dòng trạng thái), `portal/src/App.tsx` (gọi `recordPlayThrottled` khi mở game), `portal/src/i18n/dict.ts`

**Interfaces:**
- Consumes: `isGameToPortal`, `GameToPortal` (`@playnine/sdk/protocol`); `ServerApi`, `useServer` (Task 4).
- Produces:
  - `useGameBridge(opts: { frame: HTMLIFrameElement | null; gameId: string | null; onMessage(m: GameToPortal): void }): void` — lắng nghe `message` trên `window`; chỉ nhận khi `origin === location.origin`, `source === frame.contentWindow`, `isGameToPortal(data)` và `data.gameId === gameId`; nhận `pn:hello` thì trả `{type:'pn:ready',v:1}` về `source` với `targetOrigin = location.origin`; các tin còn lại chuyển cho `onMessage`.
  - `createRunManager(deps: { api: ServerApi | null; getUser(): AuthUser | null; storage?: Storage; now?: () => number }): RunManager`
    - `type RunStatus = { kind: 'idle' } | { kind: 'scored' } | { kind: 'unscored'; why: 'guest' | 'no_resume' | 'error' | 'no_server' }`
    - `type EndOutcome = { kind: 'saved'; result: FinishResult } | { kind: 'rejected'; result: FinishResult } | { kind: 'skipped' } | { kind: 'error' }`
    - `RunManager = { start(gameId: string, mode: string, resume: boolean): Promise<RunStatus>; end(gameId: string, mode: string, r: RunResult): Promise<EndOutcome> }`
    - `start`: không server → `no_server`; chưa đăng nhập → `guest`; `resume` → đọc `playnine-run-<gameId>` = `{ runId, mode, userId, startedAt }`, hợp lệ khi cùng `mode`, cùng `userId`, `now - startedAt < 24h` → `scored` (dùng lại), ngược lại `no_resume`; không `resume` → `api.startRun` rồi lưu khóa → `scored`; lỗi → `error`. Gọi `start` khi đang có ván mở cho game đó thì ghi đè (ván cũ bỏ).
    - `end`: không có ván mở hợp lệ cho game/mode, hoặc người dùng hiện tại khác `userId` đã lưu → `skipped`; ngược lại `api.finishRun`, xóa khóa (kể cả khi `rejected`); lỗi mạng → `error` và giữ khóa (để tải lại trang vẫn kết thúc được).
  - `recordPlayThrottled(api: ServerApi | null, gameId: string, deps?: { storage?: Storage; now?: () => number }): void` — mỗi game tối đa một lần mỗi 30 phút mỗi tab (`sessionStorage['playnine-play-<gameId>']`), lỗi nuốt im.
  - `Toast` — vùng `role="status"` `aria-live="polite"`, tự ẩn sau 4s.
  - Trên thanh của Player (không đổi bố cục `.pbar`; thêm phần tử mới ngay dưới `.pbar`, style ở `server.css`): khi có server — khách: dòng `play.signInToScore` có nút đăng nhập; `unscored` (`no_resume`, `error`) → `play.unscored`. Sau `end`: `saved` → toast `play.saved` (`{rank}` của `week`, hoặc `day` với mode `daily`, hoặc `play.savedNoRank` nếu ván không lên bảng); `rejected` → `play.rejected`; `error` → `play.saveFailed`.
- Khóa DICT mới: `play.signInToScore` ("Sign in to save your scores" / "Đăng nhập để ghi điểm"), `play.unscored` ("This game isn't scored" / "Ván này không tính điểm"), `play.saved` ("Score saved · #{rank} this week" / "Đã ghi điểm · hạng #{rank} tuần này"), `play.savedToday` (… "hôm nay"), `play.savedNoRank`, `play.rejected`, `play.saveFailed`.

- [ ] **Step 1: Viết test:**
  - `bridge.test.ts`: tạo `iframe` thật trong jsdom; tin từ `contentWindow` đúng origin → `pn:hello` được trả `pn:ready` (spy `contentWindow.postMessage`), `pn:start` tới `onMessage`; tin từ cửa sổ khác, origin khác, `gameId` khác, hoặc sai dạng → bỏ qua.
  - `runs.test.ts` (dùng `createFakeApi`, `storage` giả, `now` giả):
    - `guest runs are unscored`; `no server → no_server`.
    - `start then end saves and clears the stored run` — kiểm tra `finishRun` nhận đúng `RunResult`, khóa `playnine-run-2048` bị xóa.
    - `resume reuses a stored run within 24h for the same mode and user`; `resume after 24h, other mode or other user → no_resume, end → skipped`.
    - `signed out mid-game → end skipped, no server call`; `signed in mid-game (start was guest) → end skipped`.
    - `startRun failure → error status, end skipped`; `finishRun network failure → error, key kept`; `finishRun rejected → rejected, key cleared`.
    - `ending twice → second end skipped`.
  - `playCount.test.ts`: lần đầu gọi `recordPlay`; lần hai trong 30 phút không gọi; sau 30 phút gọi lại; game khác gọi riêng; `recordPlay` lỗi không ném; `api null` không làm gì.
  - Thêm vào `Player.test.tsx`: với fake server và người dùng đã đăng nhập, mô phỏng `pn:start` rồi `pn:end` từ iframe → toast chứa `Đã ghi điểm · hạng #1` (lang vi); khách → dòng `play.signInToScore`; `finishRun` lỗi → toast `play.saveFailed`, không có lỗi chưa bắt.

- [ ] **Step 2: Chạy `npm test -w portal`** → FAIL.

- [ ] **Step 3: Viết code.** `RunManager` tạo một lần trong `Player` (hoặc `App`) và đọc người dùng hiện tại qua ref để không tạo lại khi `user` đổi.

- [ ] **Step 4: Chạy `npm test`, `npm run build`, `npm run assemble`, `npm run e2e`** → PASS.

- [ ] **Step 5: Commit** `Bridge game SDK messages to scored runs and count plays`.

---

### Task 6: Bảng xếp hạng trên trang game và số lượt chơi trên thẻ

**Files:**
- Create: `portal/src/player/Leaderboard.tsx`, `portal/src/player/leaderboardModel.ts`, tests `portal/src/player/leaderboardModel.test.ts`, `portal/src/player/Leaderboard.test.tsx`, `portal/src/lib/format.ts` + test
- Modify: `portal/src/player/Player.tsx` (gắn `Leaderboard`; tải lại bảng sau ván `saved`), `portal/src/home/GameCard.tsx` + `GameGrid.tsx` (hiện lượt chơi), `portal/src/styles/server.css`, `portal/src/i18n/dict.ts`

**Interfaces:**
- Consumes: `useServer().games`, `ServerApi.leaderboard/myRank/playTotals`.
- Produces:
  - `periodsFor(mode: string): Period[]` — `'daily'` → `['day']`; còn lại `['week','all']`.
  - `formatValue(metric: Metric, value: number, fmtNumber: (n: number) => string): string` — `score_high` → số có phân cách; `time_low` → `fmtDuration(value/1000)` (dạng `mm:ss`/`h:mm:ss` của `lib/time.ts`, làm tròn xuống giây… dưới 60s hiện thêm 1 chữ số thập phân: `00:42.3`); `wins` → số.
  - `formatCount(n: number, locale: string): string` — `Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })` (en `1.2K`, vi `1,2 N`).
  - `Leaderboard({ gameId, refreshKey })` — chỉ render khi có server và `games[gameId]`; tab mode (nhãn `label[lang]`, nhớ mode chọn gần nhất mỗi game trong `localStorage['playnine-lb-mode-<gameId>']`), tab kỳ theo `periodsFor`; top 50; nếu người dùng đã đăng nhập và nằm ngoài danh sách thì thêm dòng của mình (`myRank`) sau dấu `…`; hàng của mình được đánh dấu; lỗi tải → ẩn danh sách, hiện `lb.error`; rỗng → `lb.empty`. Màn rộng (≥ 900px): ngăn bên phải cạnh `#frames`; màn hẹp: nút `lb.open` trên thanh dưới `.pbar` mở bottom sheet (đóng bằng nút, Escape, chạm nền).
  - Thẻ game: dưới `.card-note` thêm `<span class="plays">` = `t('card.plays', { n: formatCount(total) })` khi có số (`playTotals` tải một lần ở `GameGrid`).
- Khóa DICT mới: `lb.title`, `lb.week` ("This week"/"Tuần này"), `lb.all` ("All time"/"Mọi lúc"), `lb.day` ("Today"/"Hôm nay"), `lb.empty`, `lb.error`, `lb.you` ("You"/"Bạn"), `lb.open`, `lb.close`, `card.plays` ("{n} plays"/"{n} lượt chơi").

- [ ] **Step 1: Viết test:**
  - `leaderboardModel.test.ts`: `periodsFor('daily')`, `periodsFor('4x4')`; `formatValue('time_low', 83000)` = `'01:23'`, `formatValue('time_low', 42300)` = `'00:42.3'`, `formatValue('score_high', 12345, fmt)` dùng `fmt`.
  - `format.test.ts`: `formatCount(1234,'en-US') === '1.2K'`, `formatCount(999,'en-US') === '999'`.
  - `Leaderboard.test.tsx` (fake api): hiện tab mode theo metadata với nhãn đúng ngôn ngữ; mode `daily` chỉ có tab `lb.day`; danh sách 3 hàng đúng thứ tự và giá trị đã định dạng; người dùng hạng 72 → có dòng `…` và hàng của mình; tên chứa HTML hiện dạng text; `leaderboard` lỗi → `lb.error`, không lỗi chưa bắt; không server → không render; đổi tab mode lưu `playnine-lb-mode-2048`.
  - Thêm vào `Home.test.tsx`: fake `playTotals { '2048': 1234 }` → thẻ 2048 có `1.2K plays`; không server → không có `.plays`.

- [ ] **Step 2: Chạy `npm test -w portal`** → FAIL.

- [ ] **Step 3: Viết code.**

- [ ] **Step 4: Chạy `npm test`, `npm run build`, `npm run assemble`, `npm run e2e`** → PASS.

- [ ] **Step 5: Commit** `Show leaderboards on the game page and play counts on cards`.

---

### Task 7: Trang hồ sơ `#/u/<id>`

**Files:**
- Create: `portal/src/profile/ProfilePage.tsx`, test `portal/src/profile/ProfilePage.test.tsx`
- Modify: `portal/src/player/route.ts` (+ test: thêm `{ name: 'profile'; userId: string }` cho `#/u/<uuid>`; chuỗi không phải uuid → `home`), `portal/src/App.tsx` (render `ProfilePage` thay `Home` khi route `profile`; Player vẫn giữ iframe như khi về trang chủ), `portal/src/styles/server.css`, `portal/src/i18n/dict.ts`

**Interfaces:**
- Consumes: `ServerApi.profile/profileBests/updateDisplayName`, `useServer().games`, `formatValue` (Task 6), catalog (`gameById` để lấy tên/icon game).
- Produces: `ProfilePage({ userId })` — tên, avatar, danh sách kỷ lục theo game → mode (nhãn mode theo ngôn ngữ, giá trị qua `formatValue`), nút quay về trang chủ (`#/`); là chính mình thì có ô sửa tên (cắt khoảng trắng, 2–24 ký tự kiểm tra ở client trước khi gửi, lỗi server hiện `profile.nameError`), lưu xong gọi `refreshUser()`. Không có server → `profile.unavailable`; không tìm thấy → `profile.notFound`. `document.title = <tên> · PlayNine`.
- Khóa DICT mới: `profile.bests`, `profile.none`, `profile.edit`, `profile.save`, `profile.nameRule` ("2–24 characters"/"2–24 ký tự"), `profile.nameError`, `profile.notFound`, `profile.unavailable`, `profile.back`.

- [ ] **Step 1: Viết test:** `route.test.ts` thêm `#/u/7c9e6679-7425-40de-944b-e07fc1f90ae7` → profile, `#/u/abc` → home; `ProfilePage.test.tsx` (fake api): hiện tên và 2 kỷ lục đã định dạng với tên game theo ngôn ngữ; người khác → không có ô sửa; chính mình → sửa `'  An  '` gửi `'An'`, `'A'` không gửi và hiện `profile.nameRule`; `updateDisplayName` lỗi → `profile.nameError`; profile null → `profile.notFound`; tên HTML hiện dạng text.

- [ ] **Step 2: Chạy `npm test -w portal`** → FAIL.

- [ ] **Step 3: Viết code.**

- [ ] **Step 4: Chạy `npm test`, `npm run build`, `npm run assemble`, `npm run e2e`** → PASS.

- [ ] **Step 5: Commit** `Add player profile pages with editable display names`.

---

### Task 8: Gắn SDK vào 9 game đấu máy

**Files:**
- Modify: `games/{bonlientiep,caro,co9o,codam,coganh,colat,covua,oanquan}/index.html` + `app.js`; `games/xiangqi/index.html`
- Create: `e2e/sdk-games.spec.ts` (Task 9, 10 thêm test vào file này)

**Interfaces:**
- Consumes: `window.PlayNine` (Task 3); id game theo catalog (`co9o`, `caro`, `xiangqi`, `covua`, `colat`, `codam`, `coganh`, `oanquan`, `bonlientiep`); mode key `easy|medium|hard`.
- Quy tắc chung mỗi game (tên hàm/dòng tham khảo ở bảng):
  - `index.html`: thêm `<script src="../sdk/playnine.js?v=1"></script>` ngay trước thẻ `app.js`; tăng `?v=` của `app.js` thêm 1 ở chữ số cuối. xiangqi: thêm trước `<script id="ui">`.
  - Trong `app.js` (xiangqi: khối `ui`), đầu IIFE: `const PN = window.PlayNine || null;` và `PN && PN.init({ gameId: '<id>' })`. Mọi lời gọi sau đều qua `PN &&`.
  - Chỉ ván `mode === 'ai'` mới gọi SDK. `gameStart({ mode: level })` khi bắt đầu ván mới; `gameStart({ mode: level, resume: true })` khi khôi phục ván đang dở lúc tải trang. `gameEnd({ mode: level, won: <người thắng là người chơi>, assisted })` đúng một lần khi ván kết thúc (hòa = `won: false`).
  - `assisted` = đã dùng hoàn tác trong ván (thêm cờ `usedUndo` vào đối tượng ván, lưu cùng ván để còn đúng sau khi tải lại); co9o thêm: đã `swapSides`; xiangqi thêm: đổi chế độ hoặc mức máy giữa ván.
  - Ván hai người trên một máy, hoặc bỏ ván giữa chừng: không gọi `gameEnd`.

  | game | bắt đầu / khôi phục | kết thúc | người chơi thắng khi |
  |---|---|---|---|
  | bonlientiep | `startGame` :214 / `loadGame` :173 (dùng :1075) | `recordResult` :351 | `game.state.winner === 0` |
  | caro | `newGame` :138 / `restore` :154 (dùng :836) | `finishGame` :203 | `winner === game.human` |
  | co9o | `startGame` :174 / `loadGame` :158 | `onGameOver` :297 | `winner === game.human` |
  | codam | `startGame` :252 / `loadGame` :202 | `recordResult` :427 | `winner === game.human` |
  | coganh | `startGame` :244 / `loadGame` :168 | `recordResult` :419 | `winner === 0` |
  | colat | `startGame` :238 / `loadGame` :178 | `recordResult` :386 | `winner === game.you` |
  | covua | `startGame` :217 / `loadGame` :193 | `recordResult` :380 | `winner === game.human` |
  | oanquan | `startGame` :240 / `loadGame` :170 | `recordResult` :397 | `winner === 0` |
  | xiangqi | `newGame` :1592 (không có khôi phục) | `playMove` :1655 khi `st.over` | `st.winner === RED` |

- [ ] **Step 1: Viết e2e** `e2e/sdk-games.spec.ts`:
  - Helper `captureMessages(page)`: `page.addInitScript` chỉ ở khung trên cùng (`if (window === window.top)`) lắng nghe `message` và đẩy `e.data` vào `window.__pn`.
  - Với mỗi game trong 9 game: mở `#/play/<id>` (localStorage trống, chế độ mặc định) → trong 5s `window.__pn` có `{type:'pn:hello', gameId:'<id>'}`; nếu chế độ mặc định của game là `ai` thì có `pn:start` với `mode` thuộc `easy|medium|hard` (nếu mặc định là `pvp`, bấm chọn đấu máy theo giao diện game rồi bắt đầu ván).
  - `<id> plays standalone without the SDK`: `page.route('**/sdk/playnine.js*', r => r.abort())`, mở `/playnine/<dir>/`, đi một nước (hoặc chỉ tải) → không có `pageerror`.
  - Một test kết thúc ván: chọn một game trong nhóm có thể đưa về gần cuối bằng ván lưu trong `localStorage` (ví dụ `bonlientiep` với bàn còn một nước thắng), tải `#/play/<id>`, đi nước thắng → có `pn:end` với `won: true`, `assisted: false`.
- [ ] **Step 2: Chạy `npm run assemble && npx playwright test e2e/sdk-games.spec.ts`** → FAIL.
- [ ] **Step 3: Sửa 9 game theo quy tắc.** Không chạy formatter; diff mỗi file chỉ gồm dòng thêm (và dòng `?v=`).
- [ ] **Step 4: Chạy lại spec + `npm run e2e` + `node test.js` của 9 game** → PASS. Kiểm `git diff --stat` từng game: số dòng nhỏ, không có hunk chỉ đổi định dạng.
- [ ] **Step 5: Commit** `Report vs-computer results from board games through the SDK`.

---

### Task 9: Gắn SDK vào 4 game tính điểm

**Files:**
- Modify: `games/{2048,xepgach,ran,phagach}/index.html` + `app.js`; `e2e/sdk-games.spec.ts`

**Interfaces:**
- Cùng quy tắc `index.html` / `PN` như Task 8.

  | game (id) | mode | bắt đầu / khôi phục | kết thúc → `gameEnd` |
  |---|---|---|---|
  | 2048 | `game.size + 'x' + game.size` | `startNewGame` :306 / `loadGame` :92 (dùng :641) | trong `doMove` :316 khi `game.over` :334: `{ score: game.score, won: maxTile ≥ 2048, assisted: false }` (spec: hoàn tác 2048 không tính trợ giúp). Đạt 2048 rồi chơi tiếp thì chưa gọi; chỉ gọi khi hết nước hoặc khi người chơi bấm Ván mới sau khi đã đạt 2048 (gọi `gameEnd` trước khi bắt đầu ván mới). |
  | xepgach | `'lv' + game.startLevel` | `startNewGame` :539 / `loadGame` :112 (dùng :1205) | `gameOver` :592: `{ score: game.score, won: false }` |
  | ran | `game.mode + '-' + game.speed` | `startGame` :764 / `loadGame` :125 (dùng :1340) | `gameOver` (~:876): `{ score: game.score, won: !!game.won }` |
  | phagach | `'default'` | `startNewGame` :764 / `loadGame` :115 (dùng :1343) | `gameOver` :827: `{ score: game.score, won: game.level >= E.LEVELS.length }` |

  - Game mở lại ở trạng thái tạm dừng: gọi `gameStart({ mode, resume: true })` ngay khi khôi phục (không đợi bấm tiếp tục).
  - `ran`: ván dùng `size`/`map`/`accel` khác mặc định vẫn tính chung mode (theo `bestKey` hiện có).

- [ ] **Step 1: Viết e2e** (thêm vào `sdk-games.spec.ts`): mỗi game → `pn:hello`; thao tác tối thiểu để bắt đầu ván (2048: tự bắt đầu; xepgach/ran/phagach: nhấn phím/nút bắt đầu của game) → `pn:start` với mode đúng mặc định (`4x4`, `lv1`, `classic-normal`, `default`); chạy độc lập khi chặn SDK → không `pageerror`; `2048 game over reports the score`: seed `localStorage` ván 2048 4x4 còn đúng một nước rồi hết (đọc định dạng `persist()`/`loadGame()` trong `games/2048/app.js`), nhấn phím → `pn:end` có `score` bằng điểm hiển thị.
- [ ] **Step 2: Chạy spec** → FAIL.
- [ ] **Step 3: Sửa 4 game.**
- [ ] **Step 4: Chạy spec + `npm run e2e` + `node test.js` của 4 game** → PASS.
- [ ] **Step 5: Commit** `Report arcade and 2048 scores through the SDK`.

---

### Task 10: Gắn SDK vào 4 game giải đố

**Files:**
- Modify: `games/{minesweeper,sugoku,tranhan,xepbai}/index.html` + `app.js`; `e2e/sdk-games.spec.ts`

**Interfaces:**

  | game (id) | mode | bắt đầu / khôi phục | kết thúc → `gameEnd` | `assisted` |
  |---|---|---|---|---|
  | minesweeper | `session.daily ? 'daily' : session.kind`; **không gọi gì** khi `kind === 'custom'` | `newGame` :208 / `restoreSession` :246 (dùng :1217-1223) | `onWin` :618: `{ timeMs: elapsedMs(), won: true }`; `onLose` :645: `{ won: false }` | `false` |
  | sudoku (dir `sugoku`) | `state.daily ? 'daily' : state.difficulty` | `newGame` :935, `retryGame` :968 (ván mới) / `load` :223 trong `init` | `finishWin` :990: `{ timeMs: state.seconds * 1000, won: true }`; `finishLose` :1018: `{ won: false }` | `state.hintsUsed > 0 \|\| !settings.mistakeLimit` |
  | tranhan | `'s' + session.size` | `newGame` :236 / `restoreSession` :284 (dùng :1649) | `onSolved` :928: `{ timeMs: elapsedMs(), won: true }` | `session.hintsUsed > 0 \|\| settings.check \|\| settings.autoX` (đọc tại lúc kết thúc) |
  | xepbai | `session.kind === 'daily' ? 'daily' : 'draw' + session.draw` | `startGame` :194 / `restoreSession` :446 (dùng :1680) | `onWin` :348: `{ timeMs: sec * 1000, won: true }` | đã dùng `showHint` :767 hoặc `undo` :278 trong ván — thêm cờ `usedAssist` vào `session`, lưu cùng phiên |

  - Bỏ ván giữa chừng (bắt đầu ván mới khi đang chơi): không gọi `gameEnd`.
  - `timeMs` lấy từ đồng hồ của game (đã dừng khi ẩn tab), số nguyên ms.

- [ ] **Step 1: Viết e2e:** mỗi game → `pn:hello` + `pn:start` với mode mặc định đúng sau thao tác bắt đầu tối thiểu; chạy độc lập khi chặn SDK → không `pageerror`; `minesweeper custom game sends nothing`: chọn Tùy chỉnh → không có `pn:start` mới; một test kết thúc: `xepbai` hoặc `tranhan` seed ván gần xong trong `localStorage` (đọc định dạng lưu trong `app.js`), thực hiện nước cuối → `pn:end` `won: true`, `timeMs > 0`, `assisted: false`.
- [ ] **Step 2: Chạy spec** → FAIL.
- [ ] **Step 3: Sửa 4 game.**
- [ ] **Step 4: Chạy spec + `npm run e2e` + test Node của 4 game (`sugoku`: `node sudoku-test.js`)** → PASS.
- [ ] **Step 5: Commit** `Report puzzle results through the SDK`.

---

### Task 11: Giữ Supabase hoạt động và checklist cho chủ dự án

**Files:**
- Create: `.github/workflows/keepalive.yml`, `supabase/README.md`
- Modify: `README.md` (mục server: biến môi trường `portal/.env.local`, lệnh `npm test -w supabase`, link `supabase/README.md`)

**Interfaces:**
- `keepalive.yml`: `schedule: cron '17 3 * * *'` + `workflow_dispatch`; một job `curl -fsS -X POST "$SUPABASE_URL/rest/v1/rpc/ping" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{}'` với secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`; bỏ qua (thành công) nếu secret trống, in cảnh báo.
- `supabase/README.md` (tiếng Việt, từng bước có ảnh chụp đường dẫn menu bằng chữ):
  1. Tạo 2 project Supabase `playnine-dev`, `playnine-prod` (region Singapore), ghi `Project URL` + `anon key`.
  2. Google Cloud Console: tạo OAuth consent screen (External) và OAuth client (Web) với Authorized redirect URI `https://<ref>.supabase.co/auth/v1/callback` cho mỗi project; nhập Client ID/Secret vào Supabase → Authentication → Providers → Google.
  3. Supabase → Authentication → URL Configuration: Site URL `https://minhnt165.github.io/playnine/` (prod) / `http://localhost:5180/playnine/` (dev); Redirect URLs thêm cả hai.
  4. Áp migration: `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push` cho từng project (từ thư mục `supabase/`).
  5. GitHub → Settings → Secrets and variables → Actions: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (của prod).
  6. Local: `portal/.env.local` với `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` của dev.
  7. Đặt admin (dùng ở giai đoạn 3): đăng nhập một lần rồi chạy `update profiles set role = 'admin' where id = (select id from auth.users where email = '<email>');` trong SQL Editor.
  8. Kiểm tra: mở site, đăng nhập, chơi một ván 2048 đến hết, thấy toast "Đã ghi điểm" và tên mình trên bảng.

- [ ] **Step 1: Viết `keepalive.yml`** và kiểm tra bằng `npx --yes @action-validator/cli .github/workflows/keepalive.yml` → không lỗi.
- [ ] **Step 2: Viết `supabase/README.md` và cập nhật `README.md`.**
- [ ] **Step 3: Chạy toàn bộ:** `npm test`, `npm run build`, `npm run assemble`, `npm run e2e`, test Node của 17 game → PASS.
- [ ] **Step 4: Commit** `Add Supabase keep-alive workflow and setup checklist`.

---

## Sau giai đoạn 2

Code chạy được ngay cả khi chưa cấu hình Supabase (cổng y như giai đoạn 1). Để bật server, chủ dự án làm theo `supabase/README.md` (cần tài khoản Supabase, Google Cloud, quyền repo), rồi push lại `main` để build có biến môi trường. Giai đoạn 3 (sự kiện, bộ sưu tập, huy hiệu, admin, `pg_cron`) có kế hoạch riêng.
