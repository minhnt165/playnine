-- Giai đoạn 4: khách (Supabase anonymous user) và bảng xếp hạng toàn cổng.
-- Khách là người dùng thật (is_anonymous = true): chơi, nộp ván và lên bảng như mọi người; sau đó có thể
-- liên kết Google (linkIdentity) mà giữ nguyên dữ liệu vì vẫn là cùng một hàng auth.users.

-- Tên mặc định của khách: 'Guest-' + 4 ký tự hex đầu của id (viết hoa). Nội bộ.
create function public._guest_name(p_id uuid) returns text
language sql immutable set search_path = public as $$
  select 'Guest-' || upper(left(replace(p_id::text, '-', ''), 4))
$$;
revoke execute on function public._guest_name(uuid) from public, anon, authenticated;

-- Tên lấy từ metadata Google (full_name, name, phần trước @ của email); null nếu không dùng được. Nội bộ.
create function public._auth_display_name(p_meta jsonb, p_email text) returns text
language plpgsql immutable set search_path = public as $$
declare
  nm text;
begin
  nm := left(btrim(coalesce(
    p_meta->>'full_name',
    p_meta->>'name',
    split_part(coalesce(p_email, ''), '@', 1)
  )), 24);
  nm := btrim(nm);
  if char_length(nm) < 2 or nm !~ '[^[:space:] ]' then return null; end if;
  return nm;
end $$;
revoke execute on function public._auth_display_name(jsonb, text) from public, anon, authenticated;

-- Người dùng thường giữ nguyên cách đặt tên cũ (fallback 'Player'); khách nhận tên Guest-XXXX.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  nm text;
begin
  if coalesce(new.is_anonymous, false) then
    nm := public._guest_name(new.id);
  else
    nm := coalesce(public._auth_display_name(new.raw_user_meta_data, new.email), 'Player');
  end if;
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, nm, new.raw_user_meta_data->>'avatar_url');
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Khách liên kết Google: GoTrue cập nhật chính hàng auth.users (email rồi is_anonymous = false); dữ liệu Google
-- nằm ở auth.identities.identity_data, raw_user_meta_data có thể được cập nhật ở lần đăng nhập sau.
-- Vì vậy hàm chạy khi is_anonymous vừa chuyển true -> false, hoặc khi metadata đổi mà hồ sơ vẫn còn tên khách.
-- Chỉ đổi tên nếu hồ sơ vẫn đang mang tên khách mặc định (không ghi đè tên khách tự đặt); avatar chỉ điền khi đang trống.
create function public.handle_user_linked() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  prof public.profiles;
  idd jsonb;
  meta jsonb;
  nm text;
  av text;
  on_guest_name boolean;
begin
  select * into prof from public.profiles where id = new.id;
  if not found then return new; end if;
  on_guest_name := prof.display_name = public._guest_name(new.id);
  if not (old.is_anonymous and not new.is_anonymous) and not on_guest_name then return new; end if;
  -- Không đọc được auth.identities cũng không được làm hỏng việc liên kết: khi đó chỉ dùng metadata của auth.users.
  begin
    select i.identity_data into idd from auth.identities i
    where i.user_id = new.id and i.provider <> 'anonymous'
    order by i.created_at desc nulls last limit 1;
  exception when others then
    idd := null;
  end;
  meta := coalesce(idd, '{}'::jsonb) || coalesce(new.raw_user_meta_data, '{}'::jsonb);
  nm := public._auth_display_name(meta, coalesce(new.email, meta->>'email'));
  av := nullif(btrim(coalesce(meta->>'avatar_url', meta->>'picture', '')), '');
  update public.profiles
  set display_name = case when on_guest_name and nm is not null then nm else display_name end,
      avatar_url = coalesce(avatar_url, av)
  where id = new.id;
  return new;
end $$;
revoke execute on function public.handle_user_linked() from public, anon, authenticated;

create trigger on_auth_user_linked after update on auth.users
  for each row
  when (not new.is_anonymous
        and (old.is_anonymous or new.raw_user_meta_data is distinct from old.raw_user_meta_data))
  execute function public.handle_user_linked();

-- Khoảng [lo, hi) của kỳ 'day'/'week' theo giờ Asia/Ho_Chi_Minh (tuần bắt đầu thứ Hai), giống _board_at;
-- 'all' trả hai giá trị null. Nội bộ.
create function public._period_range(p_period text, p_now timestamptz, out lo timestamptz, out hi timestamptz)
language plpgsql stable set search_path = public as $$
declare
  tz constant text := 'Asia/Ho_Chi_Minh';
  loc timestamp := p_now at time zone tz;
begin
  if p_period is null or p_period not in ('day', 'week', 'all') then raise exception 'bad_period'; end if;
  if p_period = 'day' then
    lo := date_trunc('day', loc) at time zone tz;
    hi := (date_trunc('day', loc) + interval '1 day') at time zone tz;
  elsif p_period = 'week' then
    lo := date_trunc('week', loc) at time zone tz;
    hi := (date_trunc('week', loc) + interval '7 days') at time zone tz;
  end if;
end $$;
revoke execute on function public._period_range(text, timestamptz) from public, anon, authenticated;

-- Đếm ván theo kỳ trên toàn bộ game cần quét theo ended_at.
create index runs_finished_ended_idx on public.runs (ended_at) where status = 'finished';

-- Xếp hạng người chơi toàn cổng tại p_now. Nội bộ (test truyền thời điểm).
--   runs: số ván finished; wins: số ván finished thắng và không trợ giúp (cả hai theo kỳ, bỏ game ẩn);
--   badges: số huy hiệu sự kiện (bảng badges), chỉ kỳ 'all'.
-- Loại người bị khóa. Hòa: ai đạt giá trị đó sớm hơn (ván/huy hiệu cuối cùng sớm hơn) đứng trên, rồi theo user_id.
create function public._player_board_at(p_kind text, p_period text, p_limit int, p_now timestamptz)
returns table (rank int, user_id uuid, display_name text, avatar_url text, value bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  lim int := greatest(1, least(100, coalesce(p_limit, 50)));
  lo timestamptz;
  hi timestamptz;
begin
  if p_kind is null or p_kind not in ('runs', 'wins', 'badges') then raise exception 'bad_kind'; end if;
  select pr.lo, pr.hi into lo, hi from public._period_range(p_period, p_now) pr;
  if p_kind = 'badges' and p_period <> 'all' then raise exception 'bad_period'; end if;
  return query
  with v as (
    (select r.user_id, count(*)::bigint as value, max(r.ended_at) as achieved_at
       from public.runs r join public.games g on g.id = r.game_id
       where p_kind in ('runs', 'wins') and r.status = 'finished' and not g.hidden
         and (p_kind = 'runs' or (r.won and not r.assisted))
         and (p_period = 'all' or (r.ended_at >= lo and r.ended_at < hi))
       group by r.user_id)
    union all
    (select b.user_id, count(*)::bigint, max(b.awarded_at)
       from public.badges b
       where p_kind = 'badges'
       group by b.user_id)
  ),
  ranked as (
    select (row_number() over (order by v.value desc, v.achieved_at, v.user_id))::int as rank,
           v.user_id, pr.display_name, pr.avatar_url, v.value
    from v join public.profiles pr on pr.id = v.user_id
    where not pr.banned
  )
  select x.rank, x.user_id, x.display_name, x.avatar_url, x.value
  from ranked x
  order by x.rank
  limit lim;
end $$;
revoke execute on function public._player_board_at(text, text, int, timestamptz) from public, anon, authenticated;

create function public.player_leaderboard(p_kind text, p_period text, p_limit int default 50)
returns table (rank int, user_id uuid, display_name text, avatar_url text, value bigint)
language sql stable security definer set search_path = public as $$
  select * from public._player_board_at(p_kind, p_period, p_limit, now())
$$;
revoke execute on function public.player_leaderboard(text, text, int) from public, anon, authenticated;
grant execute on function public.player_leaderboard(text, text, int) to anon, authenticated;

-- Top p_limit của mỗi game không ẩn tại p_now, cùng thứ tự với leaderboard. Nội bộ.
-- Mode: kỳ 'day' lấy mode đầu tiên (kể cả 'daily'); 'week'/'all' lấy mode đầu tiên khác 'daily'
-- (bảng 'daily' chỉ có nghĩa theo ngày); game không có mode phù hợp thì bỏ qua.
create function public._top_boards_at(p_period text, p_limit int, p_now timestamptz)
returns table (game_id text, mode text, rank int, user_id uuid, display_name text, avatar_url text, value bigint, achieved_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  lim int := greatest(1, least(10, coalesce(p_limit, 3)));
begin
  perform public._period_range(p_period, p_now);
  return query
  with gm as (
    select g.id as game_id,
           (select m->>'key' from jsonb_array_elements(g.modes) with ordinality t(m, o)
             where p_period = 'day' or m->>'key' <> 'daily'
             order by t.o limit 1) as mode
    from public.games g
    where not g.hidden
  ),
  picked as (select * from gm where gm.mode is not null)
  select p.game_id, p.mode, b.rank, b.user_id, pr.display_name, pr.avatar_url, b.value, b.achieved_at
  from picked p
  cross join lateral public._board_at(p.game_id, p.mode, p_period, p_now) b
  join public.profiles pr on pr.id = b.user_id
  where b.rank <= lim
  order by p.game_id, b.rank;
end $$;
revoke execute on function public._top_boards_at(text, int, timestamptz) from public, anon, authenticated;

create function public.top_boards(p_period text, p_limit int default 3)
returns table (game_id text, mode text, rank int, user_id uuid, display_name text, avatar_url text, value bigint, achieved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select * from public._top_boards_at(p_period, p_limit, now())
$$;
revoke execute on function public.top_boards(text, int) from public, anon, authenticated;
grant execute on function public.top_boards(text, int) to anon, authenticated;
