# Giai đoạn 3 — Sự kiện, bộ sưu tập, huy hiệu và trang admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm sự kiện (giải đấu có thời hạn, bảng riêng, huy hiệu cho top N), bộ sưu tập game theo chủ đề, ẩn game, và trang `#/admin` cho chủ dự án quản lý game, sự kiện, bộ sưu tập, ván và người chơi. Khi chưa cấu hình Supabase, site vẫn chạy y như giai đoạn 2.

**Architecture:** Dữ liệu mới nằm trong 4 bảng (`events`, `event_results`, `badges`, `collections`), ai cũng đọc được. Mọi thao tác ghi đi qua RPC admin `security definer`, và mỗi RPC kiểm tra `role = 'admin'` ngay ở đầu hàm.
- Bảng xếp hạng sự kiện được tính trực tiếp từ `runs` khi sự kiện chưa đóng, và đọc từ bản chụp `event_results` sau khi đóng.
- Một job `pg_cron` chạy mỗi 5 phút để đóng sự kiện (chụp kết quả, phát huy hiệu). Migration chỉ tạo job khi môi trường có `pg_cron`: Supabase có, PGlite thì không.
- Giai đoạn của sự kiện (sắp diễn ra / đang diễn ra / đã kết thúc) được suy ra từ giờ hiện tại ở cả SQL lẫn client. Nhờ vậy giao diện không phụ thuộc việc cron đã chạy hay chưa.
- Cổng mở rộng `ServerApi` và thêm các trang `#/events`, `#/events/<id>`, `#/admin`.

**Tech Stack:** Như giai đoạn 2: Supabase (Postgres, `pg_cron`), `@supabase/supabase-js` v2, PGlite + Vitest cho database, React 19 + Vite + Vitest + Testing Library cho cổng, Playwright cho e2e.

**Spec:** [docs/superpowers/specs/2026-10-20-portal-platform-design.md](../specs/2026-10-20-portal-platform-design.md). Plan này làm các mục: 2 (mục tiêu 7, 8), 6.2 (banner sự kiện, bộ sưu tập, tab sự kiện, huy hiệu trên hồ sơ, `#/events`, `#/admin`, game ẩn), 7.2 (`events`, `event_results`, `badges`, `collections`, `agg`), 7.3 (đóng sự kiện, tính lại, RPC admin), 7.5, 10 (giai đoạn 3), 11 (test đóng sự kiện, huy hiệu, RLS admin).

## Global Constraints

- Mọi ràng buộc chung của plan giai đoạn 2 vẫn áp dụng: gói Free, không dùng Edge Functions, chỉ dùng anon key, RLS bật trên mọi bảng, quy tắc `postMessage`, chuỗi giao diện mới thêm vào `dict.ts` ở cả `en` và `vi`, và chữ do người dùng nhập luôn render dạng text.
- Cổng không có `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` thì:
  - trang chủ không có banner sự kiện hay hàng bộ sưu tập;
  - `#/events`, `#/events/<id>` và `#/admin` hiện thông báo "chưa khả dụng";
  - không gọi mạng; e2e hiện có phải qua mà không cần sửa.
- Bảng mới đều đọc công khai (anon + authenticated): `events`, `event_results`, `badges`, `collections`. Không cấp quyền ghi trực tiếp cho `anon`/`authenticated`; mọi ghi đi qua RPC.
- Mọi RPC `admin_*` gọi `public._require_admin()` ở dòng đầu. Hàm này `raise exception 'forbidden'` khi `auth.uid()` không có profile `role = 'admin'`.
- Một ván thuộc sự kiện khi cùng game, cùng mode, `status = 'finished'`, và cả `started_at` lẫn `ended_at` nằm trong `[starts_at, ends_at]`.
- Kết quả đã chụp là kết quả chính thức. Từ chối ván hay khóa người chơi sau đó không tự đổi kết quả; chỉ nút "Tính lại kết quả" mới chụp lại.
- Game `time_low` chỉ cho `agg = 'best'`.
- Thời gian lưu dạng `timestamptz`. Giao diện hiển thị theo giờ máy người xem (`Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeStyle: 'short' })`); admin nhập bằng `<input type="datetime-local">` theo giờ máy của admin, rồi gửi lên dạng ISO UTC.
- Game ẩn biến khỏi trang chủ (lưới game, ô "Hôm nay", bộ sưu tập), nhưng `#/play/<id>`, phím số và link trực tiếp vẫn chạy.
- CSS mới đặt ở file mới `portal/src/styles/events.css` và `portal/src/styles/admin.css` (import trong `main.tsx`). Không sửa `portal.css`.
- **Không format lại file có sẵn**: diff của file cũ chỉ chứa dòng cần đổi; chỉ chạy Prettier trên file mới và luôn truyền đường dẫn cụ thể. Trước mỗi commit, xem `git diff --stat`.
- README/comment viết tiếng Việt. Commit message tiếng Anh, kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Cài package bằng `--registry=https://registry.npmjs.org/`.

## Review Focus

1. **Cron trễ hoặc không chạy** (PGlite, `pg_cron` chưa bật, project vừa được đánh thức): sự kiện đã quá `ends_at` nhưng vẫn `live` trong bảng.
   - Mong đợi: giao diện hiện "Đã kết thúc"; bảng xếp hạng sự kiện vẫn đúng cửa sổ thời gian (không nhận ván sau `ends_at`); huy hiệu chỉ phát khi đóng.
   - Test: Task 1 (`event_leaderboard` của sự kiện quá hạn chưa đóng trùng kết quả sau khi tick) và Task 3 (`eventPhase`).
2. **Ván nằm vắt qua mốc của sự kiện**: bắt đầu trước `starts_at` rồi kết thúc trong sự kiện, hoặc bắt đầu trong sự kiện rồi kết thúc sau `ends_at`.
   - Mong đợi: ván không được tính.
   - Test: Task 1.
3. **Đóng hoặc tính lại nhiều lần, hoặc admin sửa sự kiện sai thời điểm**: tick chạy hai lần; bấm tính lại hai lần; đổi `starts_at` sau khi sự kiện đã bắt đầu; hủy sự kiện đã đóng.
   - Mong đợi: kết quả và huy hiệu không bị nhân đôi; các thao tác sai bị từ chối với mã lỗi rõ ràng.
   - Test: Task 1 và Task 2.
4. **Người không phải admin gọi thẳng RPC admin** (bỏ qua giao diện), hoặc khách/người chơi mở `#/admin`.
   - Mong đợi: RPC trả `forbidden`; trang hiện "Không có quyền" và không gọi RPC admin nào.
   - Test: Task 2 và Task 6.
5. **Đồng hồ đếm ngược chạm 0 khi trang đang mở.**
   - Mong đợi: banner tự chuyển trạng thái hoặc biến mất mà không cần tải lại, và không hiện số âm.
   - Test: Task 4 (fake timers).

---

## File Structure

```
supabase/migrations/20261021000400_events.sql   events, event_results, badges, collections, RLS, is_admin,
                                                 _event_phase, _event_board, event_leaderboard, profile_badges,
                                                 _close_event, _tick_events, tick_events, lịch pg_cron (nếu có)
supabase/migrations/20261021000500_admin.sql    _require_admin + mọi RPC admin_*
supabase/tests/events.test.ts, supabase/tests/admin.test.ts
supabase/README.md                               thêm bước bật pg_cron và kiểm tra job
portal/src/server/types.ts, api.ts, supabaseApi.ts (+test), fakeApi.ts, ServerProvider.tsx
portal/src/events/model.ts (+test)               eventPhase, liveEventsFor, activeCollections, formatCountdown, localized
portal/src/events/useNow.ts                      đồng hồ dùng chung (1s)
portal/src/events/EventsPage.tsx (+test)         #/events
portal/src/events/EventPage.tsx (+test)          #/events/<id>
portal/src/events/EventBoard.tsx                 danh sách xếp hạng sự kiện (dùng ở trang sự kiện và tab Leaderboard)
portal/src/home/EventBanner.tsx (+test)          banner trên trang chủ
portal/src/home/CollectionRows.tsx (+test)       hàng bộ sưu tập trên trang chủ
portal/src/admin/AdminPage.tsx (+test)           #/admin: kiểm tra quyền + tab
portal/src/admin/AdminGames.tsx, AdminPlayers.tsx, AdminRuns.tsx, AdminEvents.tsx, AdminCollections.tsx (+test từng file)
portal/src/admin/forms.ts (+test)                validateEvent, validateCollection, rulesFromForm, toLocalInput, fromLocalInput
portal/src/player/route.ts (+test), portal/src/App.tsx, portal/src/player/Leaderboard.tsx (+test)
portal/src/home/Home.tsx, GameGrid.tsx, todayTiles.ts, AuthButton.tsx, portal/src/profile/ProfilePage.tsx
portal/src/styles/events.css, portal/src/styles/admin.css, portal/src/main.tsx, portal/src/i18n/dict.ts
e2e/portal.spec.ts                               thêm test các trang mới khi không có server
```

---

### Task 1: Database sự kiện, bộ sưu tập, huy hiệu và đóng sự kiện

**Files:**
- Create: `supabase/migrations/20261021000400_events.sql`, `supabase/tests/events.test.ts`
- Modify: `supabase/README.md` (mục mới "Bật pg_cron", thêm sau bước 4: Database → Extensions → bật `pg_cron` trước khi `db push`; sau khi push thì kiểm tra `select jobname, schedule from cron.job;` có `playnine-events` `*/5 * * * *`. Sửa bước 7 (đặt admin) để nói rằng giai đoạn 3 dùng nó cho `#/admin`.)

**Interfaces:**
- Consumes: `runs`, `profiles`, `games`, harness (`createDb`, `newUser`, `asUser`, `asAnon`), và cách xếp hạng của `_board_at` (giai đoạn 2, bản trong `…000300_harden.sql`).
- Produces (SQL, schema `public`):
  - `events(id uuid pk default gen_random_uuid(), title jsonb not null, description jsonb not null default '{}', game_id text not null references games, mode text not null, agg text not null check (agg in ('best','sum')), starts_at timestamptz not null, ends_at timestamptz not null check (ends_at > starts_at), award_top int not null default 3 check (award_top between 0 and 100), status text not null default 'scheduled' check (status in ('scheduled','live','closed','cancelled')), created_at timestamptz not null default now())`. `title`/`description` có dạng `{en, vi?}`.
  - `event_results(event_id uuid references events on delete cascade, user_id uuid references profiles on delete cascade, rank int not null, value bigint not null, achieved_at timestamptz, primary key (event_id, user_id))`.
  - `badges(user_id uuid references profiles on delete cascade, event_id uuid references events on delete cascade, rank int not null, awarded_at timestamptz not null default now(), primary key (user_id, event_id))`.
  - `collections(id uuid pk default gen_random_uuid(), title jsonb not null, game_ids text[] not null default '{}', starts_at timestamptz not null, ends_at timestamptz null, sort int not null default 0)`. `ends_at` null nghĩa là hiển thị không thời hạn.
  - RLS bật trên cả 4 bảng; mỗi bảng có policy `select` cho anon + authenticated. `revoke all` rồi chỉ `grant select`.
  - `is_admin() returns boolean`: `security definer`, `stable`, grant anon + authenticated; anon trả `false`.
  - `_event_phase(e events, p_now timestamptz) returns text` (nội bộ, `immutable`). Trả `'cancelled'` nếu `status = 'cancelled'`; `'ended'` nếu `status = 'closed'` hoặc `p_now >= ends_at`; `'live'` nếu `p_now >= starts_at`; còn lại `'upcoming'`.
  - `_event_board(p_event_id uuid) returns table(rank int, user_id uuid, value bigint, achieved_at timestamptz)` (nội bộ). Tính trực tiếp từ `runs` theo cửa sổ của sự kiện (Global Constraints), loại người bị khóa.
    - `agg = 'best'`: dùng giá trị và cách xếp như `_board_at` theo `metric` của game.
    - `agg = 'sum'`: với `score_high` là `sum(score)`, `achieved_at = max(ended_at)`; với `wins` là số ván `won and not assisted`.
    - Hạng tính bằng `row_number()`; hòa thì ai có `achieved_at` sớm hơn đứng trên, rồi tới `user_id`.
  - `event_leaderboard(p_event_id uuid, p_limit int default 50) returns table(rank int, user_id uuid, display_name text, avatar_url text, value bigint, achieved_at timestamptz)`: anon + authenticated.
    - Sự kiện `closed`: đọc `event_results` join `profiles` (giữ cả người đã bị khóa sau khi chụp).
    - Sự kiện `cancelled`: 0 hàng.
    - Còn lại: `_event_board`.
    - `p_limit` kẹp trong 1..100.
  - `profile_badges(p_user_id uuid) returns table(event_id uuid, rank int, awarded_at timestamptz, title jsonb, game_id text, mode text)`: anon + authenticated, sắp theo `awarded_at desc`.
  - `_close_event(p_event_id uuid) returns void` (nội bộ, chạy lại được nhiều lần): xóa `event_results` và `badges` của sự kiện; chèn `event_results` từ `_event_board`; chèn `badges` cho các hàng `rank <= award_top` (`awarded_at = now()`); đặt `status = 'closed'`.
  - `_tick_events(p_now timestamptz) returns int` (nội bộ; trả số sự kiện vừa đóng):
    - `scheduled` có `starts_at <= p_now < ends_at` → `live`;
    - `scheduled`/`live` có `ends_at <= p_now` → `_close_event`;
    - không đụng tới `cancelled` và `closed`.
  - `tick_events() returns int` = `_tick_events(now())`; `revoke` khỏi `public`, `anon`, `authenticated` (cron chạy bằng `postgres`).
  - Cuối migration, chỉ tạo lịch khi có `pg_cron`:
    ```sql
    do $$ begin
      if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
        execute 'create extension if not exists pg_cron';
        execute $c$select cron.schedule('playnine-events', '*/5 * * * *', 'select public.tick_events()')$c$;
      end if;
    end $$;
    ```

- [ ] **Step 1: Viết test** (`events.test.ts`). Mỗi test gọi `createDb()` mới. Thêm helper `addEvent(db, { game, mode, agg, startsAgo, endsIn, awardTop, status })` (insert bằng superuser, thời gian tương đối với `now()`) và helper `addRun` như trong `runs.test.ts`, nhận `startedAgo`/`endedAgo`.
  - `anyone reads events, results, badges and collections; nobody writes them directly`: `asAnon`/`asUser` select được; `insert`/`update`/`delete` trên cả 4 bảng đều lỗi quyền.
  - `is_admin is true only for admins`: anon → `false`; player → `false`; sau `update profiles set role='admin'` → `true`.
  - `event board counts only runs fully inside the window`: sự kiện `2048/4x4 best` từ 2 giờ trước đến 1 giờ sau.
    - A: ván trong cửa sổ 500;
    - B: ván bắt đầu trước `starts_at`, kết thúc trong cửa sổ, 900;
    - C: ván mode `3x3` 800;
    - D: ván `rejected` 999;
    - → kết quả chỉ có `[A 500]`.
  - `sum adds scores and counts wins`: `2048/4x4 sum`, A có hai ván 100 và 300 → A 400. Với `caro/easy sum`: A thắng 2 ván, thua 1, thắng `assisted` 1 → A 2.
  - `time_low best keeps the fastest unassisted win` (minesweeper/easy).
  - `ties go to whoever got there first`.
  - `tick moves scheduled to live and closes ended events once`:
    - `_tick_events(now())` → sự kiện đã bắt đầu thành `live`; sự kiện đã hết giờ thành `closed`, có `event_results`, và có `badges` cho đúng `award_top` người;
    - gọi lại `_tick_events` → trả 0, số hàng `event_results`/`badges` không đổi.
  - `closed results are frozen`: sau khi đóng, đặt một ván của A thành `rejected` và khóa B → `event_leaderboard` vẫn trả kết quả đã chụp. Gọi `_close_event` lần nữa → kết quả mới loại A và B, huy hiệu không trùng.
  - `an overdue event that is not closed yet ranks the same as after closing`: sự kiện `live` có `ends_at` 10 phút trước, có một ván kết thúc sau `ends_at`.
    - `event_leaderboard` trước khi tick bằng đúng kết quả sau khi tick;
    - ván kết thúc sau `ends_at` không được tính.
  - `cancelled events have no board and are never closed`.
  - `award_top 0 gives no badges`.
  - `profile_badges lists a player's badges with the event title`.
  - `_event_phase covers each phase`: các trường hợp `upcoming`, `live`, `ended` (theo giờ), `ended` (theo `status = 'closed'`), `cancelled`.
  - `migration works without pg_cron`: bảo đảm bằng chính việc `createDb()` chạy được trên PGlite; thêm assert rằng `select count(*) from pg_namespace where nspname = 'cron'` = 0.

- [ ] **Step 2: Chạy `npm test -w supabase`** → FAIL (chưa có migration).
- [ ] **Step 3: Viết `20261021000400_events.sql`** theo phần Interfaces. Mọi function: `revoke execute … from public, anon, authenticated` rồi grant đúng role; function `security definer` phải có `set search_path = public`.
- [ ] **Step 4: Chạy `npm test -w supabase`** → PASS.
- [ ] **Step 5: Cập nhật `supabase/README.md`** như ở phần Files.
- [ ] **Step 6: Commit** `Add events, collections and badges with cron-driven closing`.

---

### Task 2: RPC admin

**Files:**
- Create: `supabase/migrations/20261021000500_admin.sql`, `supabase/tests/admin.test.ts`

**Interfaces:**
- Consumes: bảng và các hàm nội bộ của Task 1, `games.modes[].rules` (giai đoạn 2).
- Produces. Tất cả đều `security definer`, `set search_path = public`, chỉ grant `authenticated`, và gọi `perform public._require_admin();` ở dòng đầu.
  - `_require_admin() returns void` (nội bộ).
  - `admin_update_game(p_game_id text, p_hidden boolean, p_rules jsonb) returns void`.
    - `p_rules` có dạng `{ "<mode key>": { min_duration_ms?, max_score?, max_score_per_sec?, min_time_ms? } }`; chỉ thay `rules` của các mode có trong `p_rules`, giữ nguyên `key`/`label`.
    - Lỗi trả về: game lạ → `unknown_game`; mode lạ → `unknown_mode`; khóa luật lạ, giá trị không phải số, hoặc số < 0 → `bad_rules`.
    - `p_hidden` null thì giữ nguyên.
  - `admin_save_event(p_event jsonb) returns uuid`: tạo mới khi không có `id`, ngược lại là sửa.
    - Các trường: `id?`, `title {en, vi?}`, `description {en?, vi?}`, `game_id`, `mode`, `agg`, `starts_at`, `ends_at`, `award_top`.
    - Kiểm tra theo thứ tự:
      - `title.en` sau khi cắt khoảng trắng rỗng → `bad_title`;
      - game hoặc mode lạ → `unknown_game_or_mode`;
      - `agg` sai, hoặc `sum` với `time_low` → `bad_agg`;
      - `ends_at <= starts_at` → `bad_time`;
      - `award_top` ngoài 0..100 → `bad_award`.
    - Khi sửa, giai đoạn lấy theo `_event_phase(e, now())`:
      - `upcoming`: sửa được mọi trường;
      - `live`: chỉ sửa được `title`, `description`, `award_top`, và `ends_at` (phải `> now()`); đổi trường khác → `event_started`;
      - `ended`/`cancelled`: chỉ sửa được `title`, `description`; đổi trường khác → `event_locked`.
    - `id` không tồn tại → `not_found`.
  - `admin_cancel_event(p_event_id uuid) returns void`: chỉ khi `status in ('scheduled','live')`, đặt `cancelled`; trạng thái khác → `event_locked`.
  - `admin_recompute_event(p_event_id uuid) returns void`: chỉ khi `status = 'closed'`, gọi `_close_event`; trạng thái khác → `not_closed`.
  - `admin_save_collection(p_collection jsonb) returns uuid`: trường `id?`, `title {en, vi?}`, `game_ids text[]`, `starts_at`, `ends_at?`, `sort?`.
    - Lỗi: `title.en` rỗng → `bad_title`; id game không có trong `games` → `unknown_game`; `ends_at <= starts_at` → `bad_time`.
    - Bỏ id trùng nhưng giữ thứ tự.
  - `admin_delete_collection(p_id uuid) returns void`.
  - `admin_runs(p_game_id text default null, p_mode text default null, p_user_id uuid default null, p_status text default null, p_before timestamptz default null, p_limit int default 50)`:
    - trả `table(id uuid, user_id uuid, display_name text, game_id text, mode text, started_at timestamptz, ended_at timestamptz, score bigint, time_ms bigint, won boolean, assisted boolean, status text, reject_reason text)`;
    - sắp `started_at desc`; `p_before` lọc `started_at < p_before` (để phân trang); `p_limit` kẹp trong 1..200.
  - `admin_reject_run(p_run_id uuid, p_reason text default null) returns void`: đặt `status = 'rejected'`, `reject_reason = coalesce(nullif(btrim(p_reason), ''), 'admin')`; chạy được cả với ván `started` hoặc `finished`. Không tồn tại → `not_found`.
  - `admin_players(p_query text default null, p_limit int default 50)`:
    - trả `table(id uuid, display_name text, avatar_url text, role text, banned boolean, created_at timestamptz, runs bigint)`;
    - `p_query` là uuid thì tìm đúng id; ngược lại `display_name ilike '%' || p_query || '%'` (escape `%`, `_`, `\`); rỗng thì trả người mới nhất trước.
  - `admin_set_banned(p_user_id uuid, p_banned boolean) returns void`: tự khóa chính mình → `cannot_ban_self`; không tồn tại → `not_found`.

- [ ] **Step 1: Viết test** (`admin.test.ts`; helper `makeAdmin(db)` dùng `newUser` rồi `update profiles set role='admin'` bằng superuser).
  - `every admin RPC refuses anon and players`: lặp qua cả 10 RPC (tham số hợp lệ tối thiểu); `asAnon` → lỗi quyền execute; `asUser(player)` → lỗi chứa `forbidden`.
  - `admin_update_game hides a game and replaces one mode's rules`: các mode khác giữ nguyên `rules`; `label` không đổi; các trường hợp `unknown_mode`, `bad_rules` (`{"4x4":{"max_score":-1}}`, `{"4x4":{"foo":1}}`, `{"4x4":{"max_score":"x"}}`).
  - `admin_save_event creates and validates`: từng mã lỗi `bad_title`, `unknown_game_or_mode`, `bad_agg` (`minesweeper` + `sum`), `bad_time`, `bad_award`; tạo hợp lệ → hàng có `status = 'scheduled'`.
  - `editing an event follows its phase`:
    - `upcoming` đổi được `starts_at`, `game_id`;
    - `live` đổi `starts_at` → `event_started`, đổi `ends_at` sang thời điểm trong quá khứ → `bad_time`, đổi `title`/`ends_at` tương lai → OK;
    - `closed` đổi `award_top` → `event_locked`, đổi `title` → OK.
  - `cancel only scheduled or live events`: hủy sự kiện `closed` → `event_locked`; sự kiện đã hủy không bị `_tick_events` đóng.
  - `recompute only closed events and keeps badges unique`: gọi hai lần → số huy hiệu bằng `award_top`.
  - `collections CRUD`: lưu, bỏ id trùng, `unknown_game`, `bad_time`, xóa.
  - `admin_runs filters and pages`: lọc theo game, mode, người chơi, trạng thái; `p_before` lấy trang tiếp, không trùng, không sót.
  - `admin_reject_run hides the run from every board`: ván đang đứng hạng 1 → `leaderboard` và `event_leaderboard` (sự kiện đang live) không còn ván đó; `reject_reason = 'admin'`.
  - `admin_players searches by name or id and escapes wildcards`: query `%` không trả tất cả mọi người.
  - `admin_set_banned bans and unbans, never self`: người bị khóa → `start_run` lỗi `banned`, và biến khỏi `leaderboard`.

- [ ] **Step 2: Chạy `npm test -w supabase`** → FAIL.
- [ ] **Step 3: Viết `20261021000500_admin.sql`.**
- [ ] **Step 4: Chạy `npm test -w supabase`** → PASS.
- [ ] **Step 5: Commit** `Add admin RPCs for games, events, collections, runs and players`.

---

### Task 3: Lớp server của cổng, định tuyến và mô hình sự kiện

**Files:**
- Modify:
  - `portal/src/server/types.ts`, `api.ts`, `supabaseApi.ts` (+`supabaseApi.test.ts`), `fakeApi.ts`;
  - `portal/src/player/route.ts` (+`route.test.ts`);
  - `portal/src/App.tsx`: thay `profileId` bằng `page: Route` cho các route không phải `play`, render trang tương ứng; trong task này `EventsPage`/`EventPage`/`AdminPage` chỉ là component tạm hiện tiêu đề, Task 4 và 6 thay bằng bản thật;
  - `portal/src/home/AuthButton.tsx` (+test): menu có mục Admin khi `user.isAdmin`;
  - `portal/src/i18n/dict.ts`.
- Create: `portal/src/events/model.ts` (+`model.test.ts`), `portal/src/events/useNow.ts`

**Interfaces:**
- Produces (`types.ts`; giữ nguyên các kiểu cũ, chỉ tách `Profile` khỏi `AuthUser`):
  ```ts
  export type Profile = { id: string; displayName: string; avatarUrl: string | null }
  export type AuthUser = Profile & { isAdmin?: boolean }
  export type Rules = { min_duration_ms?: number; max_score?: number; max_score_per_sec?: number; min_time_ms?: number }
  export type ModeMeta = { key: string; label: { en: string; vi: string }; rules?: Rules }
  export type Text = { en: string; vi?: string }
  export type EventAgg = 'best' | 'sum'
  export type EventStatus = 'scheduled' | 'live' | 'closed' | 'cancelled'
  export type EventPhase = 'upcoming' | 'live' | 'ended' | 'cancelled'
  export type GameEvent = { id: string; title: Text; description: Partial<Text>; gameId: string; mode: string; agg: EventAgg; startsAt: string; endsAt: string; awardTop: number; status: EventStatus }
  export type EventInput = Omit<GameEvent, 'id' | 'status'> & { id?: string }
  export type Collection = { id: string; title: Text; gameIds: string[]; startsAt: string; endsAt: string | null; sort: number }
  export type CollectionInput = Omit<Collection, 'id'> & { id?: string }
  export type Badge = { eventId: string; rank: number; awardedAt: string; title: Text; gameId: string; mode: string }
  export type RunStatusDb = 'started' | 'finished' | 'rejected'
  export type AdminRun = { id: string; userId: string; displayName: string; gameId: string; mode: string; startedAt: string; endedAt: string | null; score: number | null; timeMs: number | null; won: boolean | null; assisted: boolean; status: RunStatusDb; rejectReason: string | null }
  export type RunFilter = { gameId?: string; mode?: string; userId?: string; status?: RunStatusDb; before?: string; limit?: number }
  export type AdminPlayer = { id: string; displayName: string; avatarUrl: string | null; role: 'player' | 'admin'; banned: boolean; createdAt: string; runs: number }
  ```
- Produces (thêm vào `ServerApi`; mỗi RPC ném `Error` có `message` chứa mã lỗi SQL, ví dụ `forbidden`, `event_started`):
  ```ts
  events(): Promise<GameEvent[]>                       // select * from events, mọi trạng thái
  eventLeaderboard(eventId: string, limit?: number): Promise<LeaderRow[]>
  collections(): Promise<Collection[]>                 // mọi bộ sưu tập; client tự lọc theo thời gian
  profileBadges(userId: string): Promise<Badge[]>
  adminUpdateGame(gameId: string, hidden: boolean | null, rules: Record<string, Rules>): Promise<void>
  adminSaveEvent(e: EventInput): Promise<string>
  adminCancelEvent(id: string): Promise<void>
  adminRecomputeEvent(id: string): Promise<void>
  adminSaveCollection(c: CollectionInput): Promise<string>
  adminDeleteCollection(id: string): Promise<void>
  adminRuns(f: RunFilter): Promise<AdminRun[]>
  adminRejectRun(runId: string, reason?: string): Promise<void>
  adminPlayers(query: string): Promise<AdminPlayer[]>
  adminSetBanned(userId: string, banned: boolean): Promise<void>
  ```
  - `supabaseApi`:
    - `userOf` gọi thêm `rpc('is_admin')` (lỗi thì coi là `false`) và trả `isAdmin`;
    - `gameMeta` giữ `rules` của từng mode;
    - đổi tên trường snake_case ↔ camelCase ở cả hai chiều; `bigint` dùng `Number(...)`.
  - `fakeApi`:
    - `FakeState` thêm `events: GameEvent[]`, `eventBoards: Record<string, LeaderRow[]>`, `collections: Collection[]`, `badges: Record<string, Badge[]>`, `adminRuns: AdminRun[]`, `adminPlayers: AdminPlayer[]`;
    - admin method ghi vào `calls` và cập nhật `state` ở mức tối thiểu đủ cho test giao diện (lưu sự kiện thì thêm hoặc thay trong `state.events`, khóa người chơi thì đổi `banned`…).
- Produces (`route.ts`):
  - `Route` thêm `{ name: 'events' }`, `{ name: 'event'; eventId: string }`, `{ name: 'admin' }`;
  - `#/events` → `events`; `#/events/<uuid>` → `event`; `#/events/<không phải uuid>` → `events`; `#/admin` → `admin`;
  - export `eventHref(id: string): string`.
- Produces (`events/model.ts`, hàm thuần, `now` tính bằng ms):
  - `eventPhase(e: GameEvent, now: number): EventPhase`: cùng quy tắc với `_event_phase`.
  - `liveEventsFor(events: GameEvent[], gameId: string | null, now: number): GameEvent[]`: lọc sự kiện `live` (của `gameId` nếu có), sắp theo `endsAt` tăng dần.
  - `groupEvents(events, now): { live: GameEvent[]; upcoming: GameEvent[]; ended: GameEvent[] }`: bỏ `cancelled`. `upcoming` sắp `startsAt` tăng dần; `ended` sắp `endsAt` giảm dần.
  - `activeCollections(list: Collection[], now: number, visibleIds: Set<string>): Collection[]`:
    - giữ bộ có `startsAt <= now < (endsAt ?? ∞)`;
    - chỉ giữ `gameIds` có trong `visibleIds` (có trong catalog và không ẩn);
    - bỏ bộ rỗng; sắp theo `sort`, rồi `title.en`.
  - `formatCountdown(ms: number, t: TFn): string`:
    - `ms <= 0` → `'00:00:00'`;
    - dưới 1 ngày → `hh:mm:ss`;
    - từ 1 ngày → `t('ev.daysLeft', { d, hms })`.
  - `localized(x: Partial<Text>, lang: Lang): string`: lấy `x[lang]` sau khi cắt khoảng trắng, rỗng thì lấy `x.en`, vẫn rỗng thì `''`.
  - `useNow(intervalMs = 1000): number` (`useNow.ts`): giá trị `Date.now()` cập nhật theo chu kỳ; dừng khi unmount.
- Khóa DICT mới:
  - `auth.admin` ("Admin" / "Quản trị");
  - `ev.daysLeft` ("{d}d {hms}" / "{d} ngày {hms}").

- [ ] **Step 1: Viết test:**
  - `model.test.ts`:
    - mỗi nhánh của `eventPhase`, gồm đúng mốc `startsAt` (→ `live`) và đúng mốc `endsAt` (→ `ended`);
    - `groupEvents` bỏ sự kiện đã hủy và sắp đúng thứ tự;
    - `activeCollections`: bộ hết hạn, bộ chưa tới giờ, bộ chỉ có game ẩn/lạ đều bị bỏ; `endsAt` null vẫn giữ;
    - `formatCountdown(-5)` = `'00:00:00'`, `formatCountdown(3_723_000)` = `'01:02:03'`, `formatCountdown(90_061_000)` với `en` = `'1d 01:01:01'`;
    - `localized({ en: 'Cup', vi: '  ' }, 'vi')` = `'Cup'`.
  - `route.test.ts`: bốn dạng địa chỉ mới, và `#/events/abc` → `events`.
  - `supabaseApi.test.ts` (client giả có sẵn):
    - `events` đổi `starts_at` → `startsAt`;
    - `adminSaveEvent` gửi `p_event` có `game_id`, `starts_at`, `award_top`;
    - `adminRuns` gửi đúng `p_*` và bỏ tham số `undefined`;
    - `currentUser` có `isAdmin: true` khi `is_admin` trả `true`, và `false` khi RPC lỗi;
    - `gameMeta` giữ `rules`.
  - `AuthButton.test.tsx`: `isAdmin` → có mục menu `#/admin`; người chơi thường → không có.
  - `App` (thêm vào test hiện có của `Home` hoặc file mới `App.test.tsx`): đặt `location.hash = '#/events'` → render trang sự kiện tạm; `#/play/2048` vẫn mở Player như trước.
- [ ] **Step 2: Chạy `npm test -w portal`** → FAIL.
- [ ] **Step 3: Viết code.** `fakeApi.ts` vẫn chỉ được import từ test.
- [ ] **Step 4: Chạy `npm test`, `npm run build`** → PASS. `grep` bản build không chứa `fakeApi`.
- [ ] **Step 5: Commit** `Extend the portal server layer and routes for events and admin`.

---

### Task 4: Trang sự kiện, banner trang chủ và tab sự kiện trên bảng xếp hạng

**Files:**
- Create: `portal/src/events/EventsPage.tsx`, `EventPage.tsx`, `EventBoard.tsx`, `portal/src/home/EventBanner.tsx`, `portal/src/styles/events.css`; test `EventsPage.test.tsx`, `EventPage.test.tsx`, `portal/src/home/EventBanner.test.tsx`
- Modify:
  - `portal/src/App.tsx`: thay component tạm của `events`/`event`;
  - `portal/src/home/Home.tsx`: chèn `<EventBanner />` ngay sau `<Hero />`;
  - `portal/src/player/Leaderboard.tsx` (+test);
  - `portal/src/main.tsx`: import `events.css`;
  - `portal/src/i18n/dict.ts`.

**Interfaces:**
- Consumes: `ServerApi.events/eventLeaderboard`; `eventPhase`, `groupEvents`, `liveEventsFor`, `formatCountdown`, `localized`, `useNow` (Task 3); `formatValue` (giai đoạn 2); `gameById` (catalog).
- Produces:
  - `EventBoard({ event, limit })`: danh sách giống `Leaderboard`. Gồm hạng, tên (link `#/u/<id>`), giá trị qua `formatValue(metric của game, value)`; với `agg = 'sum'` và `score_high` thì hiện tổng điểm. Đánh dấu hàng của mình. Lỗi → `lb.error`; rỗng → `lb.empty`.
  - `EventsPage()`: ba mục "Đang diễn ra", "Sắp diễn ra", "Đã kết thúc" (mục rỗng thì ẩn; cả ba rỗng → `ev.none`).
    - Mỗi thẻ có tên sự kiện, icon và tên game, nhãn mode, thời gian, và đếm ngược cho sự kiện đang hoặc sắp diễn ra;
    - mỗi thẻ là link `eventHref(id)`;
    - không có server → `ev.unavailable`; tải lỗi → `ev.error`;
    - `document.title = t('ev.title') + ' · PlayNine'`.
  - `EventPage({ eventId })`:
    - tiêu đề, mô tả (dạng text, giữ xuống dòng bằng CSS `white-space: pre-line`);
    - luật: game, mode, cách tính (`ev.agg.best` / `ev.agg.sum`), số người nhận huy hiệu;
    - thời gian bắt đầu/kết thúc, đếm ngược, `EventBoard`;
    - nút "Chơi ngay" (`#/play/<gameId>`) khi đang diễn ra;
    - khi đã kết thúc: dòng `ev.provisional` nếu `status` chưa phải `closed`, và mục "Nhận huy hiệu" liệt kê các hàng `rank <= awardTop` khi đã `closed`;
    - sự kiện đã hủy → `ev.cancelled`; không tìm thấy → `ev.notFound`.
  - `EventBanner()`: chỉ render khi có server.
    - Với mỗi sự kiện `live` (tối đa 3, theo `liveEventsFor`): tên, tên game, đếm ngược `ev.endsIn`, link tới trang sự kiện;
    - luôn có link `ev.all` → `#/events`;
    - khi đếm ngược chạm 0, sự kiện tự rời banner ở nhịp `useNow` kế tiếp.
  - `Leaderboard`: tải `api.events()` một lần.
    - Nếu có sự kiện `live` của game và mode đang chọn trùng `event.mode`: hàng tab kỳ có thêm tab `ev.tab` (đặt cuối hàng). Chọn tab này thì hiện `EventBoard` cùng dòng đếm ngược và link `ev.details`.
    - Chưa có mode đã lưu trong `playnine-lb-mode-<gameId>` mà có sự kiện `live` → mode mặc định là mode của sự kiện.
- Khóa DICT mới:
  - `ev.title` ("Events" / "Sự kiện");
  - `ev.live` ("Live now" / "Đang diễn ra"), `ev.upcoming` ("Upcoming" / "Sắp diễn ra"), `ev.ended` ("Ended" / "Đã kết thúc");
  - `ev.none`, `ev.unavailable`, `ev.error`, `ev.notFound`, `ev.cancelled`;
  - `ev.startsIn` ("Starts in {time}" / "Bắt đầu sau {time}"), `ev.endsIn` ("Ends in {time}" / "Kết thúc sau {time}");
  - `ev.starts`, `ev.ends`;
  - `ev.agg.best` ("Best result counts" / "Tính kết quả tốt nhất"), `ev.agg.sum` ("All results add up" / "Cộng dồn mọi ván");
  - `ev.awardTop` ("Top {n} earn a badge" / "Top {n} nhận huy hiệu");
  - `ev.rules`, `ev.play` ("Play now" / "Chơi ngay");
  - `ev.winners` ("Badge winners" / "Nhận huy hiệu");
  - `ev.provisional` ("Final results are being tallied" / "Đang chốt kết quả");
  - `ev.all` ("All events" / "Tất cả sự kiện"), `ev.tab` ("Event" / "Sự kiện"), `ev.details` ("Details" / "Chi tiết"), `ev.back`.

- [ ] **Step 1: Viết test** (fake api, `vi.useFakeTimers()` + `vi.setSystemTime`):
  - `EventsPage.test.tsx`:
    - ba mục đúng thứ tự, sự kiện đã hủy không hiện;
    - tên sự kiện chứa `<img src=x onerror=alert(1)>` hiện dạng text;
    - lang `vi` dùng `title.vi`, `vi` rỗng thì dùng `en`;
    - không server → `ev.unavailable`; `events` lỗi → `ev.error`.
  - `EventPage.test.tsx`:
    - sự kiện live → đếm ngược, nút `ev.play` trỏ `#/play/2048`, `EventBoard` hiện 3 hàng đã định dạng;
    - quá `endsAt` nhưng `status` vẫn `live` → `ev.ended` + `ev.provisional`, không có nút chơi;
    - `closed` với `awardTop` 2 → mục `ev.winners` có đúng 2 người;
    - id lạ → `ev.notFound`.
  - `EventBanner.test.tsx`:
    - một sự kiện còn 5 giây; `vi.advanceTimersByTime(6000)` → banner không còn sự kiện đó, không có chữ `-`;
    - không server → không render gì; luôn có link `#/events` khi có server.
  - `Leaderboard.test.tsx`:
    - có sự kiện live `2048/4x4` và mode đang chọn là `4x4` → có tab `ev.tab`, bấm vào thì gọi `eventLeaderboard`;
    - mode `3x3` → không có tab;
    - không có mode đã lưu → mặc định chọn mode của sự kiện;
    - `events` lỗi → bảng thường vẫn chạy.
- [ ] **Step 2: Chạy `npm test -w portal`** → FAIL.
- [ ] **Step 3: Viết code.** Tái dùng class `.lb-list`/`.lb-tabs` có sẵn cho `EventBoard` và tab mới; style riêng (thẻ sự kiện, banner) đặt trong `events.css`.
- [ ] **Step 4: Chạy `npm test`, `npm run build`, `npm run assemble`, `npm run e2e`** → PASS. Chụp màn hình trang chủ có banner bằng Playwright ở viewport `Pixel 7` và `Desktop Chrome` (dev server với `portal/.env.local` trỏ tới project dev, hoặc fake server trong một test tạm không commit), rồi kiểm tra bằng mắt: menu tài khoản không bị banner đè, không cuộn ngang.
- [ ] **Step 5: Commit** `Add event pages, a live event banner and the event leaderboard tab`.

---

### Task 5: Bộ sưu tập, game ẩn và huy hiệu trên hồ sơ

**Files:**
- Create: `portal/src/home/CollectionRows.tsx`, test `portal/src/home/CollectionRows.test.tsx`
- Modify:
  - `portal/src/home/Home.tsx`: chèn `<CollectionRows />` sau `<Today />`;
  - `portal/src/home/GameGrid.tsx` và `portal/src/home/todayTiles.ts` (+test): lọc game ẩn;
  - `portal/src/profile/ProfilePage.tsx` (+test);
  - `portal/src/styles/events.css`, `portal/src/i18n/dict.ts`.

**Interfaces:**
- Consumes: `ServerApi.collections/profileBadges`, `useServer().games[id].hidden`, `activeCollections`, `localized` (Task 3), `GAMES`/`gameById`.
- Produces:
  - `isHidden(games: Record<string, GameMeta>, id: string): boolean`, export từ `portal/src/events/model.ts`: trả `games[id]?.hidden === true`. Không có metadata thì coi như không ẩn.
  - `GameGrid`: bỏ hẳn thẻ của game ẩn khỏi DOM (không dùng thuộc tính `hidden`); số đếm ở nút lọc tính lại theo danh sách đã lọc. `buildTodayTiles` nhận thêm `hiddenIds: Set<string>` và bỏ ô của game ẩn.
  - `CollectionRows()`: chỉ render khi có server và tải `collections()` thành công.
    - Mỗi bộ trong `activeCollections(...)` là một `<section>` có `<h2>` tên bộ và một hàng cuộn ngang các link `#/play/<id>` (icon + tên game theo ngôn ngữ), giữ đúng thứ tự `gameIds`;
    - tải lỗi → không render gì.
  - `ProfilePage`: thêm mục `profile.badges` trước kỷ lục. Mỗi huy hiệu gồm hạng (`#1`), tên sự kiện và tên game, link tới `eventHref(eventId)`. Không có huy hiệu thì ẩn cả mục; `profileBadges` lỗi thì ẩn mục, phần còn lại của trang vẫn hiện.
- Khóa DICT mới: `profile.badges` ("Badges" / "Huy hiệu"), `profile.badgeRank` ("#{rank}").

- [ ] **Step 1: Viết test:**
  - `CollectionRows.test.tsx`:
    - hai bộ đúng thứ tự `sort`, game đúng thứ tự `gameIds`;
    - game ẩn và id lạ bị bỏ; bộ chỉ còn game ẩn thì không hiện;
    - tên bộ chứa HTML hiện dạng text;
    - không server hoặc `collections` lỗi → không có `section`.
  - `Home.test.tsx`: fake `games` đánh dấu `2048` ẩn → lưới không có thẻ 2048, nút lọc "Tất cả" đếm 16, ô "Hôm nay" không nhắc 2048. Không server → vẫn 17.
  - `todayTiles.test.ts`: `hiddenIds` bỏ ô tương ứng.
  - `ProfilePage.test.tsx`: hai huy hiệu hiện hạng và tên sự kiện theo ngôn ngữ; `profileBadges` lỗi → không có mục huy hiệu nhưng kỷ lục vẫn hiện.
  - e2e hiện có: mở thẳng `#/play/2048` vẫn chạy (bảo đảm game ẩn vẫn chơi được qua link; test đã có sẵn).
- [ ] **Step 2: Chạy `npm test -w portal`** → FAIL.
- [ ] **Step 3: Viết code.**
- [ ] **Step 4: Chạy `npm test`, `npm run build`, `npm run assemble`, `npm run e2e`** → PASS.
- [ ] **Step 5: Commit** `Show collections, hide games from the home page and list profile badges`.

---

### Task 6: Trang admin — khung, game, người chơi, ván

**Files:**
- Create: `portal/src/admin/AdminPage.tsx`, `AdminGames.tsx`, `AdminPlayers.tsx`, `AdminRuns.tsx`, `portal/src/admin/forms.ts`, `portal/src/styles/admin.css`; test `AdminPage.test.tsx`, `AdminGames.test.tsx`, `AdminPlayers.test.tsx`, `AdminRuns.test.tsx`, `forms.test.ts`
- Modify: `portal/src/App.tsx` (thay component tạm `admin`), `portal/src/main.tsx` (import `admin.css`), `portal/src/i18n/dict.ts`

**Interfaces:**
- Consumes: các phương thức `admin*` và `gameMeta` (Task 3); `useServer().user.isAdmin`; `gameById`.
- Produces:
  - `AdminPage()`:
    - không server → `admin.unavailable`;
    - `!authReady` → không render nội dung;
    - chưa đăng nhập hoặc `!user.isAdmin` → `admin.forbidden` và **không gọi** phương thức `admin*` nào;
    - admin → tab `Game | Sự kiện | Bộ sưu tập | Ván | Người chơi` (`role="tablist"`). Tab đang chọn lưu ở `sessionStorage['playnine-admin-tab']`.
    - `document.title = 'Admin · PlayNine'`.
  - Mọi màn admin: khi RPC lỗi thì hiện `admin.error` kèm mã lỗi (phần `message` sau dấu `: ` cuối), không ném lỗi chưa bắt. Lưu thành công thì hiện `admin.saved` (vùng `role="status"`).
  - `AdminGames()`: bảng 17 game theo thứ tự catalog.
    - Mỗi game có checkbox `admin.hidden`; mỗi mode có 4 ô số (`min_duration_ms`, `max_score`, `max_score_per_sec`, `min_time_ms`, nhãn tiếng Anh giữ nguyên tên trường); ô trống nghĩa là không có luật.
    - Nút lưu theo từng game gọi `adminUpdateGame(id, hidden, rulesFromForm(...))`; lưu xong gọi lại `gameMeta` để làm mới `useServer().games`.
    - Để làm được việc làm mới, `ServerCtx` thêm `refreshGames(): Promise<void>` (sửa `ServerProvider.tsx` + test).
  - `forms.ts`:
    - `rulesFromForm(values: Record<string, Record<keyof Rules, string>>): { ok: true; rules: Record<string, Rules> } | { ok: false; mode: string; field: keyof Rules }`: ô trống thì bỏ qua; phải là số nguyên ≥ 0 (riêng `max_score_per_sec` cho phép số thập phân ≥ 0).
    - `toLocalInput(iso: string): string`: trả `YYYY-MM-DDTHH:mm` theo giờ máy.
    - `fromLocalInput(v: string): string | null`: trả ISO UTC; chuỗi hỏng → `null`.
  - `AdminPlayers()`:
    - ô tìm (gửi khi bấm Tìm hoặc Enter) gọi `adminPlayers(q)`;
    - bảng gồm tên (link hồ sơ), vai trò, số ván, ngày tạo, trạng thái, và nút `admin.ban`/`admin.unban` có `confirm()` trước khi gọi `adminSetBanned`;
    - không hiện nút khóa cho chính mình.
  - `AdminRuns()`:
    - bộ lọc game (select theo catalog), mode (select theo `games[gameId].modes`), id người chơi, trạng thái;
    - bảng 50 ván, mỗi ván có giờ bắt đầu/kết thúc, người chơi, game/mode, giá trị đã định dạng, trạng thái và lý do;
    - nút `admin.reject` có `prompt()` hỏi lý do (hủy prompt thì không gọi) gọi `adminRejectRun`, xong thì cập nhật hàng thành `rejected`;
    - nút `admin.more` gọi tiếp với `before = startedAt` của hàng cuối; ẩn khi trang trả ít hơn 50 hàng.
- Khóa DICT mới:
  - `admin.title`, `admin.unavailable`, `admin.forbidden` ("You don't have permission to view this page." / "Bạn không có quyền xem trang này.");
  - `admin.error` ("Failed: {code}" / "Lỗi: {code}"), `admin.saved`;
  - `admin.tab.games`, `admin.tab.events`, `admin.tab.collections`, `admin.tab.runs`, `admin.tab.players`;
  - `admin.hidden`, `admin.save`, `admin.search`, `admin.ban`, `admin.unban`, `admin.banConfirm`, `admin.banned`;
  - `admin.reject`, `admin.rejectPrompt`, `admin.more`, `admin.filter.*`, `admin.col.*`.
  - Đây là giao diện cho admin nên được phép ngắn gọn, nhưng vẫn phải có đủ `en`/`vi`.

- [ ] **Step 1: Viết test** (fake api):
  - `AdminPage.test.tsx`:
    - khách → `admin.forbidden`; người chơi thường → `admin.forbidden`; cả hai trường hợp `calls` không có method nào bắt đầu bằng `admin`;
    - không server → `admin.unavailable`;
    - admin → 5 tab; đổi tab ghi `sessionStorage`.
  - `forms.test.ts`:
    - `rulesFromForm` bỏ ô trống; `'-1'` và `'abc'` → `{ ok: false, mode, field }`; `'1.5'` chỉ hợp lệ ở `max_score_per_sec`;
    - `fromLocalInput(toLocalInput(iso))` giữ nguyên thời điểm (làm tròn phút); `fromLocalInput('')` → `null`.
  - `AdminGames.test.tsx`: bỏ trống `max_score` của `4x4` rồi lưu → `adminUpdateGame('2048', false, { '3x3': …, '4x4': { min_duration_ms: … } , … })`; ô sai → hiện lỗi tại ô đó và không gọi API; `adminUpdateGame` lỗi `forbidden` → `Lỗi: forbidden`.
  - `AdminPlayers.test.tsx`:
    - tìm `'an'` gọi `adminPlayers('an')`;
    - khóa (stub `confirm` trả `true`) gọi `adminSetBanned(id, true)` rồi nút đổi thành `admin.unban`;
    - `confirm` trả `false` → không gọi;
    - hàng của chính mình không có nút.
  - `AdminRuns.test.tsx`:
    - lọc gửi đúng `RunFilter`;
    - từ chối với `prompt` trả `'cheat'` → `adminRejectRun(id, 'cheat')`, hàng đổi trạng thái; `prompt` trả `null` → không gọi;
    - `admin.more` gửi `before` là `startedAt` của hàng cuối và nối thêm hàng.
- [ ] **Step 2: Chạy `npm test -w portal`** → FAIL.
- [ ] **Step 3: Viết code.**
- [ ] **Step 4: Chạy `npm test`, `npm run build`, `npm run assemble`, `npm run e2e`** → PASS.
- [ ] **Step 5: Commit** `Add the admin page with game, player and run management`.

---

### Task 7: Trang admin — sự kiện và bộ sưu tập; kiểm tra toàn bộ

**Files:**
- Create: `portal/src/admin/AdminEvents.tsx`, `AdminCollections.tsx`; test `AdminEvents.test.tsx`, `AdminCollections.test.tsx`
- Modify:
  - `portal/src/admin/forms.ts` (+test), `portal/src/admin/AdminPage.tsx`, `portal/src/i18n/dict.ts`;
  - `e2e/portal.spec.ts`: thêm test `#/events` và `#/admin` khi không có server hiện thông báo "chưa khả dụng", không có `pageerror`;
  - `README.md` (gốc): mục server thêm một đoạn ngắn về sự kiện, admin và `pg_cron`, kèm link `supabase/README.md`.

**Interfaces:**
- Consumes: `adminSaveEvent/adminCancelEvent/adminRecomputeEvent/adminSaveCollection/adminDeleteCollection`, `events()`, `collections()`, `eventPhase`, `toLocalInput`/`fromLocalInput` (Task 3, 6).
- Produces:
  - `validateEvent(input: EventInput, games: Record<string, GameMeta>): (keyof EventInput)[]`: trả danh sách trường sai, kiểm tra cùng quy tắc với `admin_save_event` (`title.en` rỗng, game/mode lạ, `sum` với `time_low`, `endsAt <= startsAt`, `awardTop` không phải số nguyên trong 0..100).
  - `validateCollection(input: CollectionInput): (keyof CollectionInput)[]`: `title.en` rỗng, `gameIds` rỗng, `endsAt <= startsAt`.
  - `editableFields(phase: EventPhase): Set<keyof EventInput>`: khớp quy tắc theo giai đoạn của Task 2.
  - `AdminEvents()`:
    - danh sách mọi sự kiện (kể cả đã hủy), sắp `startsAt` giảm dần, mỗi dòng có nhãn giai đoạn;
    - nút `admin.newEvent` mở form. Form gồm: tên en/vi, mô tả en/vi (`textarea`), game (select catalog), mode (select theo `games[gameId].modes`), cách tính (`best`/`sum`; ẩn `sum` khi game là `time_low`), bắt đầu/kết thúc (`datetime-local`), số người nhận huy hiệu;
    - sửa: trường không nằm trong `editableFields(eventPhase(e, now))` thì `disabled`;
    - nút `admin.cancelEvent` (có `confirm`) chỉ hiện khi `status` là `scheduled`/`live`; nút `admin.recompute` (có `confirm`) chỉ hiện khi `closed`;
    - lưu xong thì tải lại danh sách.
  - `AdminCollections()`:
    - danh sách mọi bộ sưu tập; form gồm tên en/vi, thời gian bắt đầu, kết thúc (để trống = không hạn), thứ tự (`sort`), chọn game;
    - phần chọn game gồm danh sách checkbox 17 game, các game đã chọn có nút ↑/↓ để đổi thứ tự;
    - nút xóa (có `confirm`).
- Khóa DICT mới: `admin.newEvent`, `admin.newCollection`, `admin.edit`, `admin.cancelEvent`, `admin.cancelConfirm`, `admin.recompute`, `admin.recomputeConfirm`, `admin.delete`, `admin.deleteConfirm`, `admin.field.*`, `admin.phase.*`, `admin.invalid` ("Check the highlighted fields" / "Kiểm tra các ô được đánh dấu").

- [ ] **Step 1: Viết test:**
  - `forms.test.ts`:
    - `validateEvent` trả đúng trường cho từng lỗi; input hợp lệ → `[]`;
    - `editableFields('live')` = `title, description, awardTop, endsAt`; `editableFields('ended')` = `title, description`.
  - `AdminEvents.test.tsx`:
    - tạo sự kiện hợp lệ → `adminSaveEvent` nhận `startsAt` dạng ISO UTC đúng với giờ đã nhập;
    - chọn game `minesweeper` → không còn lựa chọn `sum`;
    - sự kiện đang live: ô `startsAt` và `gameId` bị `disabled`;
    - sự kiện `closed` có nút tính lại, không có nút hủy;
    - `adminSaveEvent` lỗi `event_started` → `Lỗi: event_started`;
    - input sai → `admin.invalid`, không gọi API.
  - `AdminCollections.test.tsx`: chọn 3 game, đưa game thứ 3 lên đầu bằng ↑ → `adminSaveCollection` nhận `gameIds` đúng thứ tự mới; xóa có `confirm` → `adminDeleteCollection`.
  - `e2e/portal.spec.ts`: `#/events` và `#/admin` khi không có server.
- [ ] **Step 2: Chạy `npm test -w portal` và `npx playwright test e2e/portal.spec.ts`** → FAIL.
- [ ] **Step 3: Viết code và cập nhật `README.md`.**
- [ ] **Step 4: Kiểm tra toàn bộ:** `npm test` (gốc: scripts, sdk, portal, supabase), `npm run build`, `npm run assemble`, `npm run e2e`, `node test.js` của 17 game → PASS. `git diff --stat main...HEAD`: file có sẵn không có hunk nào chỉ đổi định dạng.
- [ ] **Step 5: Commit** `Add admin event and collection editors`.

---

## Sau giai đoạn 3

Để bật trên môi trường thật, chủ dự án cần làm tay ba việc:
1. Bật `pg_cron` rồi `db push` hai migration mới cho cả dev và prod, theo `supabase/README.md`.
2. Đặt tài khoản của mình làm admin bằng câu SQL ở bước 7 trong README.
3. Push `main` để deploy.

Giai đoạn 4 (template game mới `games/_template`) sẽ có kế hoạch riêng.
