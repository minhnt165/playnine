# PlayNine: tách cổng game và game, thêm server

Ngày: 2026-10-20 · Trạng thái: chờ duyệt

## 1. Vì sao làm

PlayNine hiện là 17 game HTML/CSS/JS thuần, không bước build, cùng một cổng là file `index.html` khoảng 3.000 dòng. Tất cả chạy trên GitHub Pages (`https://minhnt165.github.io/playnine/`), không có server, mọi dữ liệu chỉ nằm trong `localStorage` của từng máy.

Chủ dự án muốn sau này làm những game phức tạp và đa dạng hơn, kiểu các game trên CrazyGames/Poki: 2D nhiều hình động, có vật lý, 3D. Đồng thời muốn cổng có các tính năng của một nền tảng: đăng nhập, phân quyền, bảng xếp hạng, sự kiện, đếm lượt chơi. Cách làm hiện tại không đáp ứng được cả hai hướng:

- Cổng là một file HTML khổng lồ, thêm tính năng tài khoản hay xếp hạng vào đó sẽ rất khó.
- Game mới cần engine (Phaser, Three.js…), TypeScript và bước build, nhưng repo hiện không có chỗ cho bước build.
- Không có server thì không có điểm chung, tài khoản hay sự kiện.

Hướng giải quyết: **tách cổng và game thành hai thứ riêng, nối với nhau qua một SDK nhỏ, và dùng Supabase làm server.**

## 2. Mục tiêu, không làm, và những điều tuyệt đối tránh

**Mục tiêu**

1. Viết lại cổng game thành một web app riêng: React + TypeScript + Vite.
2. Mỗi game là một đơn vị độc lập, tự chọn công nghệ. Game cũ giữ JS thuần không build; game mới có thể dùng engine và build riêng.
3. Có một SDK nhỏ để game báo cho cổng biết "bắt đầu ván" và "kết thúc ván kèm kết quả". Game không bao giờ tự gọi server.
4. Đăng nhập bằng Google. Chỉ có hai vai: admin (duy nhất chủ dự án) và người chơi.
5. Có bảng xếp hạng cho từng game và từng chế độ, theo tuần và từ trước đến nay.
6. Có đếm lượt chơi cho từng game.
7. Có sự kiện:
   - Giải đấu theo thời gian, có bảng riêng, top N nhận huy hiệu.
   - Bộ sưu tập game theo chủ đề.
8. Có trang admin để quản lý game, sự kiện, bộ sưu tập, điểm và người chơi.
9. Chuyển cả 17 game hiện có sang dùng SDK.
10. Có một template cho game mới (Vite + TypeScript + SDK) để bắt đầu một game phức tạp mà không phải dựng lại từ đầu.

**Không làm trong đợt này**

- Chơi nhiều người theo thời gian thực. Đấu với người khác chỉ ở mức so điểm.
- Cho người ngoài đăng game. Mọi game do chủ dự án tự làm.
- Nhiệm vụ hằng ngày, tiền ảo, điểm thưởng, giải thưởng thật.
- Chống gian lận nặng, ví dụ chạy lại ván trên server. Chỉ kiểm tra điểm có hợp lý không và cho admin xử lý tay.
- Lưu ván của người chơi lên server (đồng bộ giữa các máy). Ván đang chơi vẫn chỉ lưu trong `localStorage`.
- Đăng nhập bằng email (magic link). Gói Free của Supabase chỉ gửi mail tới thành viên của project. Gửi cho người chơi thì cần SMTP riêng, và các dịch vụ miễn phí tốt đều đòi tên miền riêng. Sẽ thêm khi có tên miền. Code đăng nhập nên viết sao cho thêm phương thức sau này không phải sửa nhiều.
- Viết một game mới phức tạp. Đợt này chỉ làm template.

**Tuyệt đối tránh** (dù chạy được vẫn coi là hỏng)

- Làm hỏng link cũ: `.../playnine/<thư mục game>/` và `.../playnine/#/play/<id>` phải chạy y như trước.
- Làm game phụ thuộc vào cổng. Mở thẳng link game (không qua cổng, không mạng, Supabase sập) thì vẫn phải chơi được như bây giờ, chỉ không ghi điểm.
- Phát sinh chi phí. Mọi thứ phải nằm trong gói miễn phí và không cần gắn thẻ.
- Viết lại game cũ. Mỗi game cũ chỉ được thêm đúng những dòng cần để gắn SDK, **không format lại file có sẵn**.
- Làm mất dữ liệu `localStorage` hiện có của người chơi: điểm cao, thống kê, ván đang dở, ngôn ngữ, giao diện.

## 3. Ràng buộc

- **Hosting:** GitHub Pages của repo `minhnt165/playnine`, base path `/playnine/`. Chỉ phục vụ file tĩnh.
- **Server:** Supabase gói Free.
  - Giới hạn: 500MB database, 50.000 MAU, tối đa 2 project.
  - Project bị tạm dừng nếu 7 ngày không có hoạt động.
  - Không dùng tính năng nào cần gói trả phí.
- **Cùng origin:** cổng và mọi game được phục vụ từ cùng một origin, nên game và cổng đọc chung `localStorage`. Cổng hiện tại đang dựa vào điều này qua các khóa `playnine-<id>-summary-v1`, `playnine-lang` và khóa giao diện.
- **Ngôn ngữ:** Anh (mặc định) và Việt. Khóa chung `localStorage['playnine-lang']` giữ nguyên.
- **Quy ước repo:** README và comment viết tiếng Việt, commit message viết tiếng Anh.

## 4. Kiến trúc

```
Trình duyệt
┌──────────────────────────── cổng (React) ───────────────────────────┐
│  trang chủ · trang game · hồ sơ · admin                             │
│  ┌──────────── iframe: game ────────────┐   ┌── Supabase JS ──┐     │
│  │  game (JS thuần / Phaser / Three…)   │   │ auth, RPC, đọc  │─────┼──► Supabase
│  │  + playnine SDK ── postMessage ──────┼──►│ bảng xếp hạng   │     │   (Postgres,
│  └──────────────────────────────────────┘   └─────────────────┘     │    Auth, pg_cron)
└─────────────────────────────────────────────────────────────────────┘
```

- **Game** chỉ biết SDK. SDK gửi `postMessage` lên cửa sổ cha.
- **Cổng** giữ phiên đăng nhập, nhận tin từ SDK, gọi các RPC của Supabase, rồi hiển thị kết quả.
- **Supabase:** dùng Postgres với các hàm RPC `security definer` để kiểm tra và ghi điểm, Auth để đăng nhập, và `pg_cron` để đóng sự kiện. Không dùng Edge Functions.

### 4.1 Bố cục repo (do người viết tài liệu quyết định)

```
portal/            app React + TS + Vite (cổng)
sdk/               SDK viết bằng TS, build ra một file JS chạy được không cần bundler
games/<thư mục>/   mỗi game một thư mục
  2048/ … xepbai/  17 game cũ, dời vào đây bằng `git mv`, nội dung không đổi ngoài phần gắn SDK
  _template/       template game mới: Vite + TS + SDK, chưa chọn engine
supabase/          migrations SQL, seed, test
brand/             giữ nguyên
.github/workflows/ build + deploy Pages, cron giữ Supabase hoạt động
```

- Dùng npm workspaces để quản lý các phần có `package.json`, gồm `portal`, `sdk`, `_template` và các game mới.
- Game cũ không có `package.json` và không build. Bước deploy chép nguyên thư mục của chúng.
- Tên thư mục game cũ phải giữ nguyên vì đó là URL, kể cả `sugoku/` (id `sudoku`) và `xiangqi/`.

### 4.2 Build và deploy

GitHub Actions chạy mỗi khi push lên `main`, gồm các bước:

1. Build `portal`, `sdk` và các game có `package.json`.
2. Ghép thư mục `dist/` như sau:

```
dist/index.html, assets/…   cổng
dist/sdk/playnine.js        SDK
dist/brand/…                giữ nguyên
dist/<thư mục game>/…       game cũ (chép nguyên) và game mới (bản build)
dist/.nojekyll
```

3. Deploy bằng `actions/deploy-pages`.

**Việc chủ dự án làm tay** (do người viết tài liệu quyết định): người làm không có quyền vào các tài khoản này, nên phải soạn một checklist từng bước trong `supabase/README.md` để chủ dự án tự làm:
- GitHub: vào Settings → Pages, đổi nguồn deploy sang "GitHub Actions". Thêm secret `SUPABASE_URL` và `SUPABASE_ANON_KEY` cho bước build.
- Supabase: tạo 2 project.
- Google Cloud: tạo OAuth client và consent screen, đặt redirect URL cho cả local lẫn `https://minhnt165.github.io/playnine/`.
- Áp migrations: chạy tay bằng `supabase db push` lên dev và prod. CI không chạy migration, nên không cần đưa mật khẩu database vào GitHub secrets.

**Giữ Supabase hoạt động:** một workflow chạy cron mỗi ngày, gọi một RPC nhẹ (`select 1` qua REST) tới project production, để project không bị tạm dừng sau 7 ngày.

### 4.3 Hai môi trường

Gói Free cho 2 project, nên tạo một project `playnine-dev` và một project `playnine-prod`:
- Chạy local (`npm run dev`) thì dùng dev.
- Deploy thì dùng prod.
- Migrations trong `supabase/` được áp lên cả hai bằng Supabase CLI.

## 5. SDK

SDK là một file `sdk/playnine.js` duy nhất, build từ TypeScript, gồm hai dạng:
- **IIFE:** gắn `window.PlayNine`, dành cho game cũ.
- **ESM:** `import { PlayNine } from '@playnine/sdk'`, dành cho game mới, được bundle thẳng vào game.

Game cũ nạp bằng `<script src="../sdk/playnine.js"></script>`.

```ts
PlayNine.init({ gameId: '2048' })            // gọi một lần khi tải game
PlayNine.gameStart({ mode: '4x4', resume?: boolean }) // bắt đầu (hoặc tiếp tục) một ván tính điểm
PlayNine.gameEnd({                           // kết thúc ván
  mode: '4x4',
  score?: number,      // kiểu xếp hạng score_high
  timeMs?: number,     // kiểu xếp hạng time_low (chỉ khi thắng)
  won: boolean,
  assisted?: boolean,  // đã dùng gợi ý hoặc trợ giúp làm sai lệch kết quả
})
PlayNine.isConnected(): boolean              // đang chạy trong cổng và đã bắt tay xong
```

**Hành vi:**

- **Bắt tay:**
  - Lúc `init`, SDK gửi `{ type: 'pn:hello', gameId, v: 1 }` lên `window.parent`.
  - Cổng trả `{ type: 'pn:ready', v: 1 }`.
  - Nếu không chạy trong iframe, hoặc sau 1,5 giây vẫn chưa có `pn:ready`, SDK chuyển sang **chế độ độc lập**: mọi lời gọi đều không làm gì và không bao giờ ném lỗi.
- **Kiểm tra origin:** cả hai phía chỉ chấp nhận tin nhắn từ cùng origin.
- **Thứ tự lời gọi:** SDK không chặn game. `gameStart` và `gameEnd` gửi xong là trả về ngay.
  - Gọi `gameEnd` mà không có `gameStart` trước đó thì bị bỏ qua.
  - Gọi `gameStart` hai lần liên tiếp thì ván trước coi như bỏ dở.
- **Không thay thế cơ chế cũ:** game cũ vẫn tự ghi `playnine-<id>-summary-v1` như hiện tại. SDK không thay thế cơ chế này.
- **Ván mới và ván tiếp tục** (do người viết tài liệu quyết định): cổng nhận `pn:start` thì gọi `start_run`, nhận `pn:end` thì gọi `finish_run` (mục 7.3).
  - Mỗi lần nhận `pn:start`, cổng lưu `run_id` đang mở của từng game vào `localStorage` (`playnine-run-<gameId>`).
  - Khi game tiếp tục ván đã lưu (tải lại trang, hoặc iframe `keepAlive: false` bị gỡ rồi mở lại), game gọi `gameStart({ mode, resume: true })`. Lúc đó cổng **dùng lại `run_id` cũ** nếu nó còn mở, cùng mode và chưa quá 24 giờ, chứ không tạo ván mới. Như vậy `started_at` trên server vẫn là lúc bắt đầu thật, và thời gian theo server luôn lớn hơn hoặc bằng đồng hồ của game (vốn dừng khi rời game). Các kiểm tra ở mục 7.4 vì thế vẫn đúng, và không lách được kiểu "giải xong, tải lại, rồi kết thúc".
  - Nếu không có `run_id` hợp lệ để dùng lại (máy khác, quá 24 giờ, hoặc lúc đầu chưa đăng nhập), ván tiếp tục đó **không được ghi điểm**. Cổng hiện dòng "Ván này không tính điểm".
  - `timeMs` lấy từ đồng hồ của game. Server chỉ dùng thời gian của mình để kiểm tra (mục 7.4).
  - `gameStart` không có `resume` thì luôn tạo ván mới, ván mở trước đó coi như bỏ dở.

## 6. Cổng game

### 6.1 Ngang bằng cổng hiện tại (bắt buộc trước khi thêm tính năng mới)

Đọc kỹ `index.html` hiện tại và mang sang đủ các tính năng sau:

- **Danh sách và lọc:**
  - Danh sách game với tên, dòng phụ, mô tả, tag, icon.
  - Lọc theo thể loại (`puzzle`, `versus`, `arcade`), lưu lựa chọn lọc.
  - Nhãn "mới".
- **Thẻ tóm tắt:** đọc `playnine-<id>-summary-v1` (số ván, số thắng, thống kê, ván dở để chơi tiếp, ván hằng ngày), cùng các bộ đọc riêng như `xiangqiData`.
- **Khung chơi:**
  - Địa chỉ `#/play/<id>`. Nút Back của trình duyệt quay về cổng.
  - Cơ chế `keepAlive` theo từng game.
  - Đánh dấu game đã chơi.
  - Phím số để mở nhanh game.
- **Ngôn ngữ và giao diện:**
  - Đổi ngôn ngữ ngay tại chỗ và đồng bộ với game qua sự kiện `storage`.
  - Sáng/tối/tự động, áp trước khi vẽ trang để không nháy màu.
- **Giao diện chung:** responsive, safe-area, truy cập bằng bàn phím, `prefers-reduced-motion`, manifest và icon trong `brand/`.

**Danh mục game** (tên, mô tả, tag, icon, thư mục, thể loại, `keepAlive`) nằm trong code của cổng, ở file `portal/src/games/catalog.ts`. Thêm game mới đằng nào cũng phải deploy, nên không cần đưa danh mục này lên database.

### 6.2 Tính năng mới

- **Thanh trên cùng:** nút đăng nhập; khi đã đăng nhập thì hiện avatar kèm menu (hồ sơ, đăng xuất, và Admin nếu là admin).
- **Đăng nhập:**
  - Google OAuth qua Supabase Auth.
  - Lần đầu đăng nhập thì tạo `profiles`. Tên hiển thị và avatar lấy từ Google, và người chơi đổi được tên.
  - Tên hiển thị không cần duy nhất. Dài 2–24 ký tự, cắt khoảng trắng hai đầu.
- **Khách:** chơi được mọi game. Trang game hiện một dòng nhắc "Đăng nhập để ghi điểm", không chặn chơi.
- **Trang chủ:**
  - Banner sự kiện đang diễn ra, kèm đồng hồ đếm ngược.
  - Các hàng bộ sưu tập đang trong thời gian hiển thị.
  - Các phần đang có (tiếp tục chơi, theo thể loại, tất cả game).
  - Thẻ game hiện số lượt chơi, ví dụ "1,2K lượt chơi".
- **Trang game** (`#/play/<id>`):
  - Game chiếm phần lớn màn hình.
  - Có thêm bảng xếp hạng: một ngăn bên cạnh trên màn rộng, hoặc một nút mở bottom sheet trên mobile.
  - Bảng xếp hạng có tab chế độ (mode), tab Tuần này / Mọi lúc, top 50, và dòng của chính mình nếu nằm ngoài top.
  - Nếu game đang có sự kiện thì có thêm tab sự kiện.
  - Sau mỗi ván ghi điểm thành công, hiện toast "Đã ghi điểm · hạng #12 tuần này".
- **Hồ sơ** (`#/u/<id>`, ai cũng xem được): tên, avatar, huy hiệu sự kiện, kỷ lục cá nhân theo từng game/mode.
- **Sự kiện** (`#/events`, `#/events/<id>`):
  - Danh sách sắp diễn ra, đang diễn ra, đã kết thúc.
  - Trang chi tiết có luật, thời gian, bảng xếp hạng, và người nhận huy hiệu sau khi kết thúc.
- **Admin** (`#/admin`, chỉ `role = 'admin'`; người khác vào thì báo không có quyền):
  - **Game:** ẩn/hiện, sửa luật hợp lý của từng game/mode (mục 7.4).
  - **Sự kiện:** tạo, sửa, hủy. Chỉ được sửa thời gian bắt đầu khi sự kiện chưa bắt đầu.
  - **Bộ sưu tập:** tạo, sửa, xóa, chọn game và thứ tự.
  - **Ván:** lọc theo game, mode, người chơi, trạng thái. Có thể từ chối một ván (ván đó biến khỏi mọi bảng).
  - **Sự kiện đã đóng:** nút "Tính lại kết quả" (mục 7.3).
  - **Người chơi:** tìm theo tên, khóa và mở khóa. Ván của người bị khóa không lên bảng và ván mới bị từ chối.

**Game ẩn:** biến khỏi trang chủ, nhưng `#/play/<id>` và link trực tiếp vẫn chạy.

**Tài khoản admin đầu tiên:** chủ dự án đăng nhập một lần, rồi chạy tay câu SQL đặt `role = 'admin'` (ghi trong README của `supabase/`).

## 7. Server (Supabase)

### 7.1 Kiểu xếp hạng của từng game

Mỗi game chọn một `metric`:

| metric | Xếp theo | Ván được tính |
|---|---|---|
| `score_high` | điểm cao nhất của mỗi người | mọi ván có `score` |
| `time_low` | thời gian ngắn nhất của mỗi người | chỉ ván thắng, không `assisted` |
| `wins` | số ván thắng (bảng tuần đếm trong tuần) | chỉ ván thắng, không `assisted` |

Gán cho 17 game (do người viết tài liệu quyết định; người làm xác nhận mode thật trong code từng game):

| Game (thư mục) | metric | mode |
|---|---|---|
| 2048 | score_high | kích thước lưới: 3x3, 4x4, 5x5 |
| xepgach, ran, phagach | score_high | theo chế độ hoặc độ khó game đang có; nếu không có thì một mode `default` |
| minesweeper | time_low | easy, medium, hard (không tính `custom`); ván hằng ngày là mode `daily` |
| sugoku (sudoku) | time_low | 5 độ khó; ván hằng ngày là mode `daily` |
| tranhan, xepbai | wins | `default`, hoặc theo kích thước/biến thể nếu game có |
| co9o, caro, xiangqi, covua, colat, codam, coganh, oanquan, bonlientiep | wins | mức máy (ví dụ easy/medium/hard) |

Với game đối kháng, chỉ ván **đấu máy** mới gọi `gameStart`/`gameEnd`. Ván hai người trên cùng máy không tính.

**Tuần** tính từ thứ Hai 00:00 đến hết Chủ nhật, theo giờ `Asia/Ho_Chi_Minh`.

**Mode `daily`** (ván hằng ngày): mỗi ngày là một đề khác nhau và độ khó đổi theo thứ trong tuần, nên so theo tuần hay mọi lúc đều vô nghĩa. Mode này chỉ có kỳ **Hôm nay** (ngày theo `Asia/Ho_Chi_Minh`), thay cho Tuần này / Mọi lúc. Hàm `leaderboard` nhận thêm `period = 'day'` (do người viết tài liệu quyết định).

### 7.2 Bảng dữ liệu

```
profiles     id (= auth.users.id), display_name, avatar_url, role ('player'|'admin'),
             banned bool, created_at
games        id text pk, metric, modes jsonb [{key, label:{en,vi}, rules}], hidden bool
runs         id uuid, user_id, game_id, mode, started_at (giờ server), ended_at (giờ server),
             score int, time_ms int, won bool, assisted bool,
             status ('started'|'finished'|'rejected'), reject_reason text
play_counts  game_id, day date, count int        -- pk (game_id, day)
events       id, title jsonb{en,vi}, description jsonb, game_id, mode, agg ('best'|'sum'),
             starts_at, ends_at, award_top int, status ('scheduled'|'live'|'closed'|'cancelled')
event_results event_id, user_id, rank, value     -- chụp lại lúc đóng sự kiện
badges       user_id, event_id, rank, awarded_at
collections  id, title jsonb{en,vi}, game_ids text[], starts_at, ends_at, sort int
```

**Cách tổng hợp `agg` của sự kiện:**
- `best`: dùng giá trị tốt nhất theo `metric` của game.
- `sum`: cộng `score` (với `score_high`) hoặc đếm số ván thắng (với `wins`).
- Game `time_low` chỉ cho chọn `best`.

**Seed:** bảng `games` được seed từ migration cho cả 17 game.

### 7.3 Hàm RPC (`security definer`), nguồn ghi duy nhất của người chơi

- **`record_play(game_id)`:**
  - Ai cũng gọi được, kể cả khách. Tăng `play_counts` của ngày hôm nay.
  - Một **lượt chơi** là một lần mở game trong cổng (`#/play/<id>`), tính cho mọi người: khách, người đã đăng nhập, ván hai người trên một máy (do người viết tài liệu quyết định). Không phụ thuộc vào `gameStart`.
  - Mở thẳng link game (ngoài cổng) thì không đếm, vì game không gọi server.
  - Chặn spam đơn giản phía cổng: mỗi game tối đa một lần mỗi 30 phút mỗi tab.
  - Số trên thẻ game là tổng mọi lúc.
- **`start_run(game_id, mode)`:**
  - Bắt buộc đã đăng nhập và không bị khóa; `game_id` và `mode` phải tồn tại.
  - Tạo `runs` với `status = 'started'` và `started_at = now()`, rồi trả về `run_id`.
- **`finish_run(run_id, score, time_ms, won, assisted)`:**
  - Ván phải thuộc người gọi và đang ở `started`.
  - Ghi `ended_at = now()`, chạy kiểm tra hợp lý (mục 7.4), rồi đặt `finished` hoặc `rejected` kèm lý do.
  - Trả về hạng tuần và hạng mọi lúc của người gọi.
- **Các hàm đọc:**
  - `leaderboard(game_id, mode, period, limit)`.
  - `my_rank(game_id, mode, period)`.
  - `event_leaderboard(event_id, limit)`.
  - `profile_bests(user_id)`.
  - Tất cả đều bỏ qua ván `rejected` và ván của người bị khóa.
- **Đóng sự kiện:** một job `pg_cron` chạy mỗi 5 phút:
  - Chuyển `scheduled` thành `live` khi đến giờ.
  - Chuyển `live` thành `closed` khi quá `ends_at`.
  - Khi đóng thì chụp `event_results`, rồi phát `badges` cho top `award_top`.
  - Một ván thuộc sự kiện khi `started_at` và `ended_at` đều nằm trong khoảng `[starts_at, ends_at]` của sự kiện.
  - Kết quả đã chụp là kết quả chính thức. Từ chối ván hay khóa người chơi sau đó **không** tự đổi kết quả.
  - Admin có nút **"Tính lại kết quả"** cho sự kiện đã đóng: xóa `event_results` và `badges` của sự kiện đó rồi chụp lại theo dữ liệu hiện tại. Logic đóng sự kiện vì thế phải chạy lại được nhiều lần (do người viết tài liệu quyết định).
- **Admin:** các hàm sau kiểm tra `role = 'admin'` ở đầu hàm:
  - `admin_reject_run`, `admin_set_banned`.
  - CRUD sự kiện và bộ sưu tập.
  - `admin_update_game`.

### 7.4 Kiểm tra hợp lý (`rules` của từng mode)

Mỗi mode trong `games.modes` có `rules`. Mọi trường đều không bắt buộc, admin sửa được:
- `min_duration_ms`: thời gian ván ngắn nhất được chấp nhận.
- `max_score`.
- `max_score_per_sec`.
- `min_time_ms`: dùng cho `time_low`.

`finish_run` từ chối ván khi:
- Thời gian theo đồng hồ server (`ended_at - started_at`) ngắn hơn `min_duration_ms`.
- Với `time_low`: `time_ms` lớn hơn thời gian server cộng 5 giây, hoặc nhỏ hơn `min_time_ms`.
- Vượt `max_score`, hoặc vượt `max_score_per_sec`.
- Người chơi bị khóa.

Giá trị `rules` ban đầu do người làm tự đặt sao cho rộng tay: chỉ chặn những điểm rõ ràng là bất khả thi, không chặn nhầm người chơi giỏi.

### 7.5 Phân quyền (RLS)

- **Đọc công khai:** `games`, `events`, `event_results`, `badges`, `collections`, `play_counts`, và `profiles` (chỉ `id`, `display_name`, `avatar_url`).
- **Bảng `runs`:** không ai đọc hay ghi trực tiếp, mọi truy cập đi qua RPC.
- **Bảng `profiles`:** người chơi chỉ sửa được `display_name` của chính mình.
- **Mọi thao tác ghi khác:** chỉ đi qua RPC admin.
- **Khóa trên client:** client chỉ dùng anon key. Service role key không bao giờ nằm trong client hay trong repo.

## 8. Chuyển 17 game cũ

Với mỗi game:

1. `git mv <thư mục> games/<thư mục>`.
2. Thêm thẻ `<script src="../sdk/playnine.js">` vào `index.html`. Với game có test chạy bằng Node, kiểm tra `test.js` vẫn chạy được.
3. Trong `app.js`:
   - Gọi `PlayNine.init` khi tải.
   - Gọi `gameStart` lúc ván tính điểm bắt đầu. Ván mới thì gọi bình thường; tiếp tục ván đã lưu thì gọi với `resume: true` (mục 5).
   - Gọi `gameEnd` lúc thắng, thua, hoặc hết nước.
   - Nếu game có gợi ý hoặc trợ giúp làm sai lệch kết quả thì gửi `assisted: true`. Ví dụ ở Sudoku là `hintsUsed > 0`. Hoàn tác trong 2048 không tính là trợ giúp.
4. Diff của từng file cũ chỉ chứa những dòng thêm này, không format lại.

**Riêng xiangqi:** game gói trong một `index.html` duy nhất, nên gắn SDK ngay trong file đó, cùng nguyên tắc.

## 9. Template game mới (`games/_template`)

Gồm:
- Vite + TypeScript, đã gắn SDK dạng ESM.
- Khung tách `engine` (logic thuần, có test bằng Vitest) và phần hiển thị, giống quy ước của các game hiện tại.
- Sẵn i18n en/vi đọc khóa `playnine-lang`, và giao diện sáng/tối.
- `base` của Vite đặt sao cho build ra chạy được tại `/playnine/<thư mục>/`.

Template **chưa chọn engine**: README hướng dẫn thêm Phaser (2D) hoặc Three.js (3D) khi tạo game thật.

Tạo game mới bằng cách chép `_template` sang thư mục mới, thêm game vào `catalog.ts` và seed `games`.

## 10. Thứ tự làm

Mỗi giai đoạn deploy được và không làm hỏng giai đoạn trước:

1. **Khung:**
   - Dời game vào `games/`, dựng npm workspaces và workflow build/deploy.
   - Viết cổng React ngang bằng cổng cũ (mục 6.1), chưa có server.
   - Kết thúc giai đoạn: site chạy y như bây giờ.
2. **Server và SDK:**
   - Tạo hai project Supabase, migrations, đăng nhập, `record_play`, `start_run`/`finish_run`, bảng xếp hạng trên trang game, hồ sơ.
   - Viết SDK, gắn SDK vào 17 game.
   - Thêm cron giữ Supabase hoạt động.
3. **Sự kiện và admin:** sự kiện, bộ sưu tập, huy hiệu, `pg_cron`, trang admin.
4. **Template game mới.**

## 11. Kiểm thử

- **SDK:**
  - Unit test cho bắt tay, chế độ độc lập, kiểm tra origin, và thứ tự `gameStart`/`gameEnd`.
  - Test rằng mọi lời gọi ở chế độ độc lập đều không ném lỗi.
- **Database:**
  - Test SQL cho `finish_run`: chấp nhận, các lý do từ chối, ván của người khác, gọi hai lần.
  - Test cho `leaderboard` (tuần, mọi lúc, loại ván bị từ chối hoặc bị khóa).
  - Test cho đóng sự kiện và phát huy hiệu.
  - Test RLS: khách hoặc người chơi không ghi trực tiếp được, và không gọi được RPC admin.
  - Công cụ tùy người làm chọn, ví dụ pgTAP qua Supabase CLI local hoặc chạy trên project dev.
- **Cổng:**
  - Test component cho các phần có logic: đọc tóm tắt, định tuyến `#/play/<id>`, xử lý tin nhắn SDK.
  - Một bộ Playwright nhỏ: mở trang chủ, mở một game qua `#/play/2048`, Back về cổng, đổi ngôn ngữ, mở thẳng `.../2048/` vẫn chơi được.
- **Game cũ:** `node test.js` của từng game vẫn qua.

## 12. Để lại cho người làm quyết định

- Thư viện định tuyến (phải giữ dạng hash `#/…`), quản lý state, CSS, component.
- Thiết kế giao diện chi tiết, miễn bám bảng màu, font Be Vietnam Pro và cảm giác của PlayNine hiện tại.
- SQL cụ thể, index, và cách tính bảng xếp hạng (view, materialized view, hay hàm).
- Giá trị `rules` ban đầu cho từng mode.
- Định dạng cụ thể của các tin nhắn `postMessage` ngoài các trường đã nêu.
- Công cụ test.
