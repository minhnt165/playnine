-- Giai đoạn 4: tin tức (bài viết do admin soạn). Bài đã đăng (published_at <= now()) đọc công khai;
-- bản nháp (published_at null) và bài hẹn giờ (published_at tương lai) chỉ admin thấy qua admin_posts().

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (char_length(slug) between 3 and 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title jsonb not null check (jsonb_typeof(title) = 'object'),
  summary jsonb not null default '{}' check (jsonb_typeof(summary) = 'object'),
  body jsonb not null default '{}' check (jsonb_typeof(body) = 'object'),
  game_id text null references public.games (id) on delete set null,
  tags text[] not null default '{}' check (cardinality(tags) <= 6),
  pinned boolean not null default false,
  published_at timestamptz null,
  author_id uuid null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_published_idx on public.posts (published_at desc);

alter table public.posts enable row level security;
revoke all on public.posts from anon, authenticated;
grant select on public.posts to anon, authenticated;
create policy posts_read_published on public.posts for select to anon, authenticated
  using (published_at is not null and published_at <= now());

-- Chuẩn hóa chữ song ngữ {en, vi}: cắt khoảng trắng, bỏ khóa rỗng, bỏ khóa lạ.
-- Trả null khi không hợp lệ (không phải object, giá trị không phải chuỗi, hoặc dài quá p_max). Nội bộ.
create function public._i18n_text(p_value jsonb, p_max int) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  en text;
  vi text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then return '{}'::jsonb; end if;
  if jsonb_typeof(p_value) <> 'object' then return null; end if;
  if coalesce(jsonb_typeof(p_value->'en'), 'null') not in ('string', 'null')
     or coalesce(jsonb_typeof(p_value->'vi'), 'null') not in ('string', 'null') then
    return null;
  end if;
  en := nullif(btrim(coalesce(p_value->>'en', '')), '');
  vi := nullif(btrim(coalesce(p_value->>'vi', '')), '');
  if char_length(en) > p_max or char_length(vi) > p_max then return null; end if;
  return jsonb_strip_nulls(jsonb_build_object('en', en, 'vi', vi));
end $$;
revoke execute on function public._i18n_text(jsonb, int) from public, anon, authenticated;

-- Mọi bài (kể cả nháp, hẹn giờ), mới nhất trước.
create function public.admin_posts() returns setof public.posts
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
  select * from public.posts p
  order by coalesce(p.published_at, p.updated_at) desc, p.id;
end $$;
revoke execute on function public.admin_posts() from public, anon, authenticated;
grant execute on function public.admin_posts() to authenticated;

-- Tạo (không có id) hoặc sửa bài. Sửa là thay toàn bộ trường soạn được: khóa nào thiếu thì về mặc định
-- (summary/body {}, tags rỗng, pinned false, game_id/published_at null). author_id/created_at giữ nguyên.
create function public.admin_save_post(p_post jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  v_slug text;
  v_title jsonb;
  v_summary jsonb;
  v_body jsonb;
  v_game text;
  v_tags text[];
  v_pinned boolean;
  v_pub timestamptz;
  t jsonb;
begin
  perform public._require_admin();
  p_post := coalesce(p_post, '{}'::jsonb);
  if jsonb_typeof(p_post) <> 'object' then raise exception 'bad_post'; end if;
  if nullif(p_post->>'id', '') is not null then
    begin
      pid := (p_post->>'id')::uuid;
    exception when others then
      raise exception 'not_found';
    end;
    perform 1 from public.posts where id = pid for update;
    if not found then raise exception 'not_found'; end if;
  end if;

  v_slug := btrim(coalesce(p_post->>'slug', ''));
  if char_length(v_slug) not between 3 and 80 or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'bad_slug';
  end if;
  if exists (select 1 from public.posts p where p.slug = v_slug and p.id is distinct from pid) then
    raise exception 'slug_taken';
  end if;

  v_title := public._i18n_text(p_post->'title', 120);
  if v_title is null or coalesce(v_title->>'en', '') = '' then raise exception 'bad_title'; end if;
  v_summary := public._i18n_text(p_post->'summary', 300);
  if v_summary is null then raise exception 'bad_summary'; end if;
  v_body := public._i18n_text(p_post->'body', 20000);
  if v_body is null then raise exception 'bad_body'; end if;

  v_game := nullif(btrim(coalesce(p_post->>'game_id', '')), '');
  if v_game is not null and not exists (select 1 from public.games g where g.id = v_game) then
    raise exception 'unknown_game';
  end if;

  -- tags: mảng chuỗi, mỗi thẻ 1..24 ký tự sau khi cắt, bỏ trùng (giữ thứ tự đầu), tối đa 6.
  t := p_post->'tags';
  if t is null or jsonb_typeof(t) = 'null' then
    v_tags := '{}';
  elsif jsonb_typeof(t) <> 'array'
     or exists (select 1 from jsonb_array_elements(t) e where jsonb_typeof(e) <> 'string'
                  or char_length(btrim(e #>> '{}')) not between 1 and 24) then
    raise exception 'bad_tags';
  else
    select coalesce(array_agg(s.tag order by s.o), '{}') into v_tags
    from (select btrim(e #>> '{}') as tag, min(o) as o
          from jsonb_array_elements(t) with ordinality x(e, o) group by btrim(e #>> '{}')) s;
    if cardinality(v_tags) > 6 then raise exception 'bad_tags'; end if;
  end if;

  if p_post->'pinned' is null or jsonb_typeof(p_post->'pinned') = 'null' then
    v_pinned := false;
  elsif jsonb_typeof(p_post->'pinned') = 'boolean' then
    v_pinned := (p_post->'pinned')::boolean;
  else
    raise exception 'bad_pinned';
  end if;

  begin
    v_pub := nullif(btrim(coalesce(p_post->>'published_at', '')), '')::timestamptz;
  exception when others then
    raise exception 'bad_time';
  end;

  begin
    if pid is null then
      insert into public.posts (slug, title, summary, body, game_id, tags, pinned, published_at, author_id)
      values (v_slug, v_title, v_summary, v_body, v_game, v_tags, v_pinned, v_pub, auth.uid())
      returning id into pid;
    else
      update public.posts
      set slug = v_slug, title = v_title, summary = v_summary, body = v_body, game_id = v_game,
          tags = v_tags, pinned = v_pinned, published_at = v_pub, updated_at = now()
      where id = pid;
    end if;
  exception when unique_violation then
    raise exception 'slug_taken';
  end;
  return pid;
end $$;
revoke execute on function public.admin_save_post(jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_post(jsonb) to authenticated;

create function public.admin_delete_post(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  delete from public.posts where id = p_id;
  if not found then raise exception 'not_found'; end if;
end $$;
revoke execute on function public.admin_delete_post(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_post(uuid) to authenticated;

-- Bốn bài mẫu đã đăng (tác giả null). Nội dung bám README của từng game.
insert into public.posts (slug, title, summary, body, game_id, tags, pinned, published_at) values
(
  'playnine-moi-diem-thuong-tai-khoan-khach',
  jsonb_build_object(
    'vi', 'PlayNine mới: giao diện mới, điểm thưởng và chơi ngay không cần đăng nhập',
    'en', 'The new PlayNine: a fresh look, reward points and instant guest play'),
  jsonb_build_object(
    'vi', 'Trang chủ được làm lại, mỗi ván chơi giờ đều cộng điểm, và bạn có thể vào chơi ngay bằng tài khoản khách rồi liên kết Google sau mà không mất gì.',
    'en', 'A redesigned home page, points for every game you finish, and guest accounts that let you play right away and link Google later without losing anything.'),
  jsonb_build_object(
    'vi', $vi$PlayNine vừa có bản cập nhật lớn nhất từ trước tới nay. Dưới đây là ba thay đổi chính bạn sẽ thấy ngay khi mở cổng game.

## Giao diện mới

Trang chủ được sắp xếp lại để bạn tìm game nhanh hơn: thanh bên chia game theo nhóm, ô tìm kiếm lọc ngay khi gõ, và mục nổi bật giới thiệu những game đang được chơi nhiều. Mục **Tin tức** (chính là nơi bạn đang đọc) sẽ cập nhật mẹo chơi và các thay đổi mới.

## Điểm thưởng

Mỗi ván chơi xong đều được cộng điểm, tùy theo game:

- **5 điểm**: Rắn Săn Mồi, Xếp Gạch, Phá Gạch, 2048, Dò Mìn, Nối Hình.
- **10 điểm**: Sudoku, Tranh Ẩn, Xếp Bài, Bốn Liên Tiếp.
- **15 điểm**: Cờ Vua, Cờ Tướng, Cờ 9 Ô, Cờ Caro, Cờ Đam, Cờ Gánh, Cờ Lật, Ô Ăn Quan.

Thắng mà **không dùng trợ giúp** thì điểm của ván đó được **nhân đôi**. Huy hiệu sự kiện cộng thêm từ 50 đến 300 điểm: hạng 1 được 300, hạng 2 được 200, hạng 3 được 100, các hạng khác có huy hiệu được 50.

Để công bằng, mỗi game chỉ tính điểm cho **20 ván đầu tiên mỗi ngày** (theo giờ Việt Nam). Bạn vẫn chơi tiếp bình thường, chỉ là các ván sau không cộng thêm điểm. Bảng xếp hạng của từng game và bảng xếp hạng chung đều xếp theo điểm, với ba mục: hôm nay, tuần này và mọi lúc.

## Chơi ngay bằng tài khoản khách

Bạn không cần đăng nhập để bắt đầu. Khi vào chơi, PlayNine tạo cho bạn một tài khoản khách tên dạng **Guest-1A2B**. Tài khoản khách được ghi điểm, lên bảng xếp hạng và đổi tên như mọi người chơi khác.

Khi muốn giữ thành tích lâu dài hoặc chơi trên máy khác, hãy **liên kết Google**: toàn bộ ván chơi, điểm và huy hiệu vẫn giữ nguyên. Nếu bạn chưa đổi tên khách, tên sẽ tự đổi sang tên tài khoản Google của bạn.

Chúc bạn chơi vui và hẹn gặp trên bảng xếp hạng!$vi$,
    'en', $en$PlayNine just got its biggest update so far. Here are the three changes you will notice as soon as you open the portal.

## A fresh look

The home page has been reorganised so you can find a game faster: a sidebar groups the games, the search box filters as you type, and a spotlight shows what people are playing most. The **News** section (where you are reading this) will bring tips and updates.

## Reward points

Every game you finish now earns points, depending on the game:

- **5 points**: Snake, Falling Blocks, Brick Breaker, 2048, Minesweeper, Tile Match.
- **10 points**: Sudoku, Nonogram, Solitaire, Four in a Row.
- **15 points**: Chess, Xiangqi, Ultimate Tic-Tac-Toe, Gomoku, Checkers, Co Ganh, Reversi, O An Quan.

Win **without using help** and that game's points are **doubled**. Event badges add 50 to 300 points: 300 for 1st place, 200 for 2nd, 100 for 3rd and 50 for any other badge rank.

To keep things fair, each game only counts the **first 20 finished games per day** (Vietnam time). You can keep playing as usual; later games just stop adding points. Each game's leaderboard and the overall leaderboard both rank by points, with three tabs: today, this week and all time.

## Play instantly as a guest

You no longer need to sign in to start. When you play, PlayNine creates a guest account named like **Guest-1A2B**. Guests earn points, appear on leaderboards and can rename themselves like every other player.

When you want to keep your progress for good or play on another device, **link your Google account**: every game, point and badge stays with you. If you never renamed your guest, it picks up your Google name automatically.

Have fun, and see you on the leaderboard!$en$),
  null,
  array['update', 'points', 'guest'],
  true,
  '2026-10-21 08:00:00+07'
),
(
  'meo-choi-noi-hinh',
  jsonb_build_object(
    'vi', 'Nối Hình: 5 mẹo giữ khay luôn thoáng',
    'en', 'Tile Match: 5 tips to keep your tray clear'),
  jsonb_build_object(
    'vi', 'Khay chỉ có 7 chỗ. Biết lên kế hoạch bộ ba và dùng trợ giúp đúng lúc là cách qua những cấp độ nhiều lớp mà không bị đầy khay.',
    'en', 'The tray only has 7 slots. Planning your triples and using help at the right moment is how you clear the many-layered levels without filling up.'),
  jsonb_build_object(
    'vi', $vi$Nối Hình nghe đơn giản: chạm ô, gom đủ 3 ô cùng hình trong khay là chúng biến mất. Nhưng khay chỉ có **7 chỗ**, và khay đầy mà không ăn được bộ ba nào là thua. Đây là những mẹo giúp bạn đi xa hơn.

## 1. Nhìn bàn trước khi chạm

Ô bị ô lớp trên che (dù chỉ một phần) sẽ tối màu và chưa chạm được. Trước khi chạm, hãy đếm xem mỗi hình đang có bao nhiêu ô **sáng** trên bàn. Hình nào đã lộ đủ 3 ô thì gom ngay, vừa không tốn chỗ lâu trong khay vừa mở ra lớp bên dưới.

## 2. Đừng để khay chứa quá nhiều loại hình

Khay có 7 chỗ: 3 loại hình, mỗi loại 2 ô, đã chiếm 6 chỗ. Một nguyên tắc dễ nhớ:

- Giữ trong khay **tối đa 2–3 loại hình đang chờ**.
- Ưu tiên chạm ô cùng hình với ô đã có trong khay.
- Chỉ đưa thêm loại mới khi biết chắc sẽ lấy được ô thứ ba của nó.

## 3. Ưu tiên ô đang che nhiều ô khác

Khi có nhiều lựa chọn ngang nhau, hãy chạm ô đang đè lên nhiều ô nhất. Từ cấp 3 trở đi bàn có 3–6 lớp và thêm hai chồng ô ở dưới bàn, nên mở được lớp dưới sớm sẽ cho bạn nhiều lựa chọn hơn ở các bước sau. Tin vui là mọi bàn đều **luôn có cách giải**, chỉ cần đi đúng thứ tự.

## 4. Dùng trợ giúp đúng lúc

Mỗi lần chơi một cấp độ, bạn có:

- **Hoàn tác** (3 lượt, phím `Z`): trả ô vừa chọn về chỗ cũ. Hợp để sửa một lần chạm vội, nhưng không lấy lại được ô đã bị ăn.
- **Lấy ra** (1 lượt, phím `O`): đưa 3 ô đầu khay lên hàng chờ phía trên, chạm lại được bất cứ lúc nào. Để dành cho lúc khay sắp đầy.
- **Xáo trộn** (1 lượt, phím `S`): đổi hình giữa các ô còn trên bàn. Dùng khi các hình lộ ra quá rời rạc.
- **Thêm ô khay** (1 lượt, nút **+**): khay tăng từ 7 lên 8 chỗ.

Khay đầy mà vẫn còn Lấy ra hoặc Thêm ô khay thì bạn vẫn cứu được ván, nên đừng dùng hết quá sớm.

## 5. Điểm thưởng

Mỗi cấp độ là một ván trên PlayNine. Qua cấp được **10 điểm** (5 điểm của game, nhân đôi vì thắng). Trợ giúp là một phần của trò chơi nên dùng chúng **không làm mất phần nhân đôi**.$vi$,
    'en', $en$Tile Match sounds simple: tap a tile, collect 3 matching tiles in the tray and they vanish. But the tray only has **7 slots**, and if it fills up with no triple to clear, you lose. These tips will take you further.

## 1. Read the board before you tap

A tile covered by a tile above it (even partly) is dimmed and cannot be tapped yet. Before tapping, count how many **bright** tiles each picture has on the board. If a picture already shows all 3, take them now: they leave the tray at once and open up the layer below.

## 2. Don't let too many pictures wait in the tray

The tray holds 7 tiles: 3 pictures with 2 tiles each already take 6 slots. An easy rule:

- Keep **no more than 2–3 waiting pictures** in the tray.
- Prefer tiles that match one already in the tray.
- Only start a new picture when you know you can reach its third tile.

## 3. Prefer tiles that cover many others

When choices look equal, tap the tile sitting on top of the most tiles. From level 3 on, boards have 3–6 layers plus two side stacks below the board, so opening lower layers early gives you more options later. The good news: every board **can always be solved** if you pick the right order.

## 4. Use help at the right moment

Each time you play a level you get:

- **Undo** (3 uses, `Z`): puts the last tile back. Great for fixing a hasty tap, but it cannot bring back tiles that were already cleared.
- **Take out** (1 use, `O`): moves the first 3 tray tiles up to a holding row, where you can tap them again any time. Save it for when the tray is nearly full.
- **Shuffle** (1 use, `S`): swaps the pictures of the tiles left on the board. Use it when the visible pictures are too scattered.
- **Extra slot** (1 use, the **+** button): the tray grows from 7 to 8 slots.

If the tray fills while you still have Take out or Extra slot, you can still save the level, so don't spend them too early.

## 5. Points

Each level is one game on PlayNine. Clearing a level earns **10 points** (the game's 5 points, doubled for the win). Help is part of the game, so using it **does not cost you the double**.$en$),
  'noihinh',
  array['tips', 'tile-match'],
  false,
  '2026-10-18 09:00:00+07'
),
(
  'sudoku-5-ky-thuat-giai-nhanh',
  jsonb_build_object(
    'vi', 'Sudoku: 5 kỹ thuật để giải nhanh hơn',
    'en', 'Sudoku: 5 techniques to solve faster'),
  jsonb_build_object(
    'vi', 'Từ ô chỉ còn một số tới cặp chỉ hướng: những kỹ thuật mà đề Sudoku trên PlayNine thực sự đòi hỏi, và vì sao bạn không bao giờ phải đoán.',
    'en', 'From naked singles to pointing pairs: the techniques PlayNine''s Sudoku puzzles actually require, and why you never need to guess.'),
  jsonb_build_object(
    'vi', $vi$Mọi đề Sudoku trên PlayNine đều có **đúng một nghiệm**, và độ khó được chấm theo kỹ thuật suy luận cần dùng chứ không chỉ theo số ô cho trước. Nắm 5 kỹ thuật dưới đây là bạn giải được phần lớn đề từ Dễ tới Khó, và nhanh hơn hẳn.

## 1. Ô chỉ còn một số (naked single)

Xét một ô trống: loại bỏ mọi số đã có trong cùng hàng, cùng cột và cùng vùng 3x3. Nếu chỉ còn đúng một số, đó là đáp án. Hãy bật **ghi chú** (phím `N`) để ghi các số còn khả năng; khi bạn điền đúng một số, game tự xóa ghi chú của số đó trong hàng, cột và vùng liên quan.

## 2. Số chỉ có một vị trí (hidden single)

Đảo ngược câu hỏi: trong một hàng (hoặc cột, hoặc vùng), số 7 có thể nằm ở đâu? Nếu chỉ còn một ô nhận được số 7 thì điền ngay, dù ô đó vẫn còn ghi chú các số khác. Đề **Dễ** và **Trung bình** chỉ cần hai kỹ thuật đầu này.

## 3. Cặp trần (naked pair)

Hai ô trong cùng một hàng chỉ còn đúng hai số giống nhau, ví dụ cả hai đều là **{3, 8}**. Khi đó 3 và 8 chắc chắn nằm ở hai ô này, nên bạn xóa 3 và 8 khỏi mọi ô khác của hàng đó. Kỹ thuật này mở khóa rất nhiều đề **Khó**.

## 4. Cặp chỉ hướng (pointing)

Trong một vùng 3x3, nếu mọi vị trí có thể của số 5 đều nằm trên cùng một hàng, thì số 5 của hàng đó phải nằm trong vùng này. Bạn được xóa số 5 khỏi các ô cùng hàng ở **những vùng khác**. Cách làm tương tự với cột.

## 5. Đừng đoán

Đoán rồi sửa vừa chậm vừa dễ mất lượt: mặc định ván thua khi sai **3 lỗi**. Khi bí, hãy quét lại theo thứ tự: single theo từng số 1–9, rồi cặp trần, rồi cặp chỉ hướng. Đề **Chuyên gia** còn cần cặp ẩn, X-Wing hay XY-Wing, nhưng vẫn giải được hoàn toàn bằng suy luận.

Nếu thật sự kẹt, nút **Gợi ý** (1 lượt mỗi ván) sẽ giải thích bước tiếp theo bằng chính các kỹ thuật này. Lưu ý: dùng gợi ý hoặc tắt giới hạn 3 lỗi thì ván thắng tính là có trợ giúp, nên không được nhân đôi **10 điểm** của Sudoku.$vi$,
    'en', $en$Every Sudoku on PlayNine has **exactly one solution**, and difficulty is graded by the logic you need, not just by the number of givens. Master the 5 techniques below and you can solve most puzzles from Easy to Hard, much faster.

## 1. Naked single

Take an empty cell and rule out every digit already in its row, column and 3x3 box. If exactly one digit is left, that is the answer. Turn on **notes** (key `N`) to pencil in the candidates; when you place a correct digit, the game clears that digit from the notes in the related row, column and box.

## 2. Hidden single

Flip the question: in a row (or column, or box), where can the 7 go? If only one cell can take a 7, place it, even if that cell still has other candidates. **Easy** and **Medium** puzzles only need these first two techniques.

## 3. Naked pair

Two cells in the same row have exactly the same two candidates, say **{3, 8}**. Then 3 and 8 must sit in those two cells, so you can remove 3 and 8 from every other cell in that row. This unlocks a lot of **Hard** puzzles.

## 4. Pointing

In a 3x3 box, if every possible place for a 5 lies on one row, then that row's 5 must be inside this box. You can remove 5 from the cells of that row in **the other boxes**. The same works for columns.

## 5. Don't guess

Guessing and fixing is slow and costly: by default the game ends after **3 mistakes**. When stuck, sweep again in order: singles for each digit 1–9, then naked pairs, then pointing. **Expert** puzzles also need hidden pairs, X-Wing or XY-Wing, but they can still be solved by pure logic.

If you are truly stuck, the **Hint** button (1 per game) explains the next step using these same techniques. Note: using a hint, or turning off the 3-mistake limit, marks the win as assisted, so Sudoku's **10 points** are not doubled.$en$),
  'sudoku',
  array['tips', 'sudoku'],
  false,
  '2026-10-16 09:00:00+07'
),
(
  'co-ganh-luat-choi-va-khai-cuoc',
  jsonb_build_object(
    'vi', 'Cờ Gánh: luật chơi và mẹo khai cuộc',
    'en', 'Co Ganh: rules recap and opening tips'),
  jsonb_build_object(
    'vi', 'Trò chơi dân gian Việt Nam không ăn quân mà "đổi màu" quân: ôn lại luật gánh, vây và vài mẹo để không bị lật cả hàng ngay từ đầu ván.',
    'en', 'A Vietnamese folk game where pieces are converted, not captured: a recap of carrying and surrounding, plus tips to avoid losing a whole row early.'),
  jsonb_build_object(
    'vi', $vi$Cờ Gánh là trò chơi dân gian Việt Nam trên bàn 5 x 5 điểm giao. Điểm đặc biệt: quân bị "ăn" không rời bàn mà **đổi sang màu của bạn**, nên thế cờ có thể lật ngược chỉ sau một nước.

## Ôn lại luật

- Mỗi bên có **8 quân**. Đến lượt, bạn đi một quân **một bước** dọc theo đường kẻ tới điểm trống kề bên. Đường chéo chỉ có ở các điểm có (hàng + cột) chẵn.
- **Gánh**: quân vừa đi tới một điểm mà hai điểm kề hai bên trên cùng một đường thẳng đều là quân đối thủ thì cả hai quân đó đổi màu. Một nước có thể gánh nhiều đường cùng lúc.
- Tự đi vào giữa hai quân đối thủ thì **không** bị ăn: chỉ quân vừa đi mới gánh.
- **Vây (chẹt)**: sau khi gánh, nhóm quân đối thủ nào không còn điểm trống kề bên thì đổi màu cả nhóm.
- Thắng khi đối thủ không còn quân. Hòa khi một thế cờ lặp lại lần thứ 3, hoặc 60 nước liên tiếp không ai ăn được quân.

Trong Cài đặt còn có **Luật Mở** (mặc định tắt): nếu nước trước vừa bỏ trống một điểm và bạn có nước đi vào đó mà gánh được, bạn bắt buộc phải đi một trong các nước ấy.

## Mẹo khai cuộc

- **Đừng để hai quân của mình cách nhau đúng một điểm trống** trên cùng một đường. Đó chính là "hai đầu gánh": đối thủ chỉ cần bước vào điểm trống là lật cả hai.
- **Giữ quân liền khối**. Quân đứng cạnh nhau khó bị gánh hơn, nhưng đừng dồn vào góc: nhóm quân hết điểm trống kề bên sẽ bị vây.
- **Chiếm các điểm có đường chéo**, nhất là điểm giữa bàn. Từ đó quân đi được nhiều hướng và gánh được trên nhiều đường hơn.
- **Đếm trước khi đi**: chạm một quân để xem các điểm đến. Vòng đỏ ghi "+2" cho biết đi tới đó ăn được bao nhiêu quân. Đừng quên kiểm tra nước đáp của đối thủ ngay sau đó.

## Chơi với máy

Máy có ba mức Dễ, Vừa và Khó; ở mức Khó máy tính sâu dần trong khoảng 1,5 giây mỗi nước. Bạn có thể **Đi lại** (phím `Z`), nhưng ván thắng có dùng Đi lại thì tính là có trợ giúp và không được nhân đôi **15 điểm** của Cờ Gánh.$vi$,
    'en', $en$Co Ganh is a Vietnamese folk game played on a 5 x 5 grid of points. Its twist: captured pieces never leave the board, they **switch to your colour**, so a single move can turn the game around.

## Rules recap

- Each side has **8 pieces**. On your turn, move one piece **one step** along a line to an empty neighbouring point. Diagonals only exist at points where (row + column) is even.
- **Ganh (carry)**: if the piece you just moved lands between two enemy pieces on the same straight line, both of them switch colour. One move can carry along several lines at once.
- Stepping between two enemy pieces yourself is **safe**: only the piece that just moved can carry.
- **Vay (surround)**: after carrying, any enemy group with no empty point next to it switches colour as a whole.
- You win when your opponent has no pieces left. The game is a draw when a position repeats for the 3rd time, or after 60 moves in a row without a capture.

Settings also offer the **Mo (open) rule** (off by default): if the last move emptied a point and you can move into it with a carry, you must play one of those moves.

## Opening tips

- **Never leave two of your pieces one empty point apart** on the same line. That is a ready-made carry: your opponent only needs to step into the gap to flip both.
- **Keep your pieces connected**. Neighbouring pieces are harder to carry, but don't crowd into a corner: a group with no empty neighbour gets surrounded.
- **Take the points with diagonals**, especially the centre. From there a piece reaches more directions and can carry along more lines.
- **Count before you move**: tap a piece to see its destinations. A red ring marked "+2" shows how many pieces that move wins. Then check your opponent's best reply.

## Playing the computer

The computer has three levels, Easy, Medium and Hard; on Hard it searches deeper for about 1.5 seconds per move. You can **Undo** (key `Z`), but a win that used Undo counts as assisted and does not double Co Ganh's **15 points**.$en$),
  'coganh',
  array['rules', 'tips', 'board-game'],
  false,
  '2026-10-14 09:00:00+07'
);
