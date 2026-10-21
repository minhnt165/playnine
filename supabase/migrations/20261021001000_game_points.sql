-- Giai đoạn 4: bảng xếp hạng từng game theo ĐIỂM kiếm được trong game đó (không còn tách theo mode/độ khó).
-- Luật tính điểm từng ván dùng chung một helper với điểm toàn cổng; điểm game không gồm huy hiệu.

-- Các ván được tính điểm trong kỳ tại p_now: finished, game không ẩn, ended_at trong kỳ;
-- chỉ 20 ván đầu mỗi (người, game, ngày giờ Việt Nam) theo ended_at, id; điểm = games.points, x2 nếu thắng và không trợ giúp.
-- p_user_id / p_game_id null = không lọc. Không lọc người bị khóa. Nội bộ.
create function public._counted_runs_at(p_period text, p_now timestamptz, p_user_id uuid default null, p_game_id text default null)
returns table (user_id uuid, game_id text, ended_at timestamptz, pts bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  tz constant text := 'Asia/Ho_Chi_Minh';
  lo timestamptz;
  hi timestamptz;
begin
  select pr.lo, pr.hi into lo, hi from public._period_range(p_period, p_now) pr;
  return query
  select x.user_id, x.game_id, x.ended_at, x.pts
  from (
    select r.user_id, r.game_id, r.ended_at,
           (g.points * case when r.won and not r.assisted then 2 else 1 end)::bigint as pts,
           row_number() over (
             partition by r.user_id, r.game_id, (r.ended_at at time zone tz)::date
             order by r.ended_at, r.id
           ) as n
    from public.runs r join public.games g on g.id = r.game_id
    where r.status = 'finished' and not g.hidden and r.ended_at is not null
      and (p_user_id is null or r.user_id = p_user_id)
      and (p_game_id is null or r.game_id = p_game_id)
      and (p_period = 'all' or (r.ended_at >= lo and r.ended_at < hi))
  ) x
  where x.n <= 20;
end $$;
revoke execute on function public._counted_runs_at(text, timestamptz, uuid, text) from public, anon, authenticated;

-- Điểm toàn cổng: giữ chữ ký và kết quả, phần ván chuyển sang _counted_runs_at.
create or replace function public._points_at(p_period text, p_now timestamptz, p_user_id uuid default null)
returns table (user_id uuid, value bigint, achieved_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  lo timestamptz;
  hi timestamptz;
begin
  select pr.lo, pr.hi into lo, hi from public._period_range(p_period, p_now) pr;
  return query
  with items as (
    select c.user_id, c.pts, c.ended_at as at from public._counted_runs_at(p_period, p_now, p_user_id, null) c
    union all
    select b.user_id,
           (case b.rank when 1 then 300 when 2 then 200 when 3 then 100 else 50 end)::bigint,
           b.awarded_at
    from public.badges b
    where (p_user_id is null or b.user_id = p_user_id)
      and (p_period = 'all' or (b.awarded_at >= lo and b.awarded_at < hi))
  )
  select i.user_id, sum(i.pts)::bigint, max(i.at) filter (where i.pts > 0)
  from items i
  group by i.user_id;
end $$;
revoke execute on function public._points_at(text, timestamptz, uuid) from public, anon, authenticated;

-- Bảng điểm đầy đủ của một game (chưa cắt, chưa join tên): bỏ người bị khóa và người 0 điểm.
-- Game ẩn: rỗng; game không tồn tại: 'unknown_game'. Hòa: điểm giảm dần, ai đạt tổng đó sớm hơn, rồi user_id. Nội bộ.
create function public._game_points_rank_at(p_game_id text, p_period text, p_now timestamptz)
returns table (rank int, user_id uuid, value bigint, achieved_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  hid boolean;
begin
  select g.hidden into hid from public.games g where g.id = p_game_id;
  if not found then raise exception 'unknown_game'; end if;
  perform public._period_range(p_period, p_now);
  if hid then return; end if;
  return query
  select (row_number() over (order by v.value desc, v.achieved_at, v.user_id))::int, v.user_id, v.value, v.achieved_at
  from (
    select c.user_id, sum(c.pts)::bigint as value, max(c.ended_at) filter (where c.pts > 0) as achieved_at
    from public._counted_runs_at(p_period, p_now, null, p_game_id) c
    group by c.user_id
  ) v
  join public.profiles pr on pr.id = v.user_id
  where not pr.banned and v.value > 0;
end $$;
revoke execute on function public._game_points_rank_at(text, text, timestamptz) from public, anon, authenticated;

create function public._game_points_board_at(p_game_id text, p_period text, p_limit int, p_now timestamptz)
returns table (rank int, user_id uuid, display_name text, avatar_url text, value bigint, achieved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.rank, b.user_id, pr.display_name, pr.avatar_url, b.value, b.achieved_at
  from public._game_points_rank_at(p_game_id, p_period, p_now) b
  join public.profiles pr on pr.id = b.user_id
  order by b.rank
  limit greatest(1, least(100, coalesce(p_limit, 50)))
$$;
revoke execute on function public._game_points_board_at(text, text, int, timestamptz) from public, anon, authenticated;

create function public.game_points_board(p_game_id text, p_period text, p_limit int default 50)
returns table (rank int, user_id uuid, display_name text, avatar_url text, value bigint, achieved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select * from public._game_points_board_at(p_game_id, p_period, p_limit, now())
$$;
revoke execute on function public.game_points_board(text, text, int) from public, anon, authenticated;
grant execute on function public.game_points_board(text, text, int) to anon, authenticated;

-- Hạng và điểm của người gọi trong một game; rỗng khi 0 điểm hoặc bị khóa.
create function public.my_game_points(p_game_id text, p_period text)
returns table (rank int, value bigint)
language sql stable security definer set search_path = public as $$
  select b.rank, b.value from public._game_points_rank_at(p_game_id, p_period, now()) b
  where b.user_id = auth.uid()
$$;
revoke execute on function public.my_game_points(text, text) from public, anon, authenticated;
grant execute on function public.my_game_points(text, text) to authenticated;

-- top_boards giữ chữ ký và cột trả về; giờ lấy top theo điểm của từng game không ẩn, cột mode luôn là 'points'.
create or replace function public._top_boards_at(p_period text, p_limit int, p_now timestamptz)
returns table (game_id text, mode text, rank int, user_id uuid, display_name text, avatar_url text, value bigint, achieved_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  lim int := greatest(1, least(10, coalesce(p_limit, 3)));
begin
  perform public._period_range(p_period, p_now);
  return query
  select g.id, 'points'::text, b.rank, b.user_id, pr.display_name, pr.avatar_url, b.value, b.achieved_at
  from public.games g
  cross join lateral public._game_points_rank_at(g.id, p_period, p_now) b
  join public.profiles pr on pr.id = b.user_id
  where not g.hidden and b.rank <= lim
  order by g.id, b.rank;
end $$;
revoke execute on function public._top_boards_at(text, int, timestamptz) from public, anon, authenticated;
