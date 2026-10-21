-- Giai đoạn 4: điểm thưởng. Mỗi game có một mức điểm cố định; ván thắng (không trợ giúp) được gấp đôi;
-- huy hiệu sự kiện cộng thêm theo hạng. Chống cày: mỗi người, mỗi game, mỗi ngày (giờ Việt Nam) chỉ 20 ván đầu được tính.

alter table public.games add column points int not null default 10 check (points between 0 and 1000);
-- games đã grant select cả bảng cho anon/authenticated nên cột mới đọc công khai như các cột khác.

update public.games set points = 5 where id in ('ran', 'xepgach', 'phagach', '2048', 'minesweeper', 'noihinh');
update public.games set points = 10 where id in ('sudoku', 'tranhan', 'xepbai', 'bonlientiep');
update public.games set points = 15 where id in ('covua', 'xiangqi', 'co9o', 'caro', 'codam', 'coganh', 'colat', 'oanquan');

-- Điểm của từng người trong kỳ tại p_now (p_user_id null = mọi người). Không lọc người bị khóa. Nội bộ.
-- Ván: finished, game không ẩn, ended_at trong kỳ; 20 ván đầu mỗi (người, game, ngày) theo ended_at; điểm game x2 nếu thắng
-- và không trợ giúp. Huy hiệu: hạng 1/2/3 = 300/200/100, hạng khác 50, tính theo awarded_at trong kỳ.
-- achieved_at: thời điểm mục có điểm cuối cùng (dùng để phân định hòa).
create function public._points_at(p_period text, p_now timestamptz, p_user_id uuid default null)
returns table (user_id uuid, value bigint, achieved_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  tz constant text := 'Asia/Ho_Chi_Minh';
  lo timestamptz;
  hi timestamptz;
begin
  select pr.lo, pr.hi into lo, hi from public._period_range(p_period, p_now) pr;
  return query
  with rr as (
    select r.user_id, r.ended_at,
           g.points * case when r.won and not r.assisted then 2 else 1 end as pts,
           row_number() over (
             partition by r.user_id, r.game_id, (r.ended_at at time zone tz)::date
             order by r.ended_at, r.id
           ) as n
    from public.runs r join public.games g on g.id = r.game_id
    where r.status = 'finished' and not g.hidden and r.ended_at is not null
      and (p_user_id is null or r.user_id = p_user_id)
      and (p_period = 'all' or (r.ended_at >= lo and r.ended_at < hi))
  ),
  items as (
    select x.user_id, x.pts::bigint as pts, x.ended_at as at from rr x where x.n <= 20
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

-- Bảng xếp hạng người chơi đầy đủ (chưa cắt, chưa join tên) tại p_now; loại người bị khóa. Nội bộ.
-- Kind: runs, wins, badges (chỉ 'all'), points (bỏ người 0 điểm).
-- Hòa: giá trị giảm dần, rồi ai đạt giá trị đó sớm hơn, rồi user_id.
create function public._player_rank_at(p_kind text, p_period text, p_now timestamptz)
returns table (rank int, user_id uuid, value bigint, achieved_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  lo timestamptz;
  hi timestamptz;
begin
  if p_kind is null or p_kind not in ('runs', 'wins', 'badges', 'points') then raise exception 'bad_kind'; end if;
  select pr.lo, pr.hi into lo, hi from public._period_range(p_period, p_now) pr;
  if p_kind = 'badges' and p_period <> 'all' then raise exception 'bad_period'; end if;
  if p_kind = 'points' then
    return query
    select (row_number() over (order by v.value desc, v.achieved_at, v.user_id))::int, v.user_id, v.value, v.achieved_at
    from public._points_at(p_period, p_now, null) v join public.profiles pr on pr.id = v.user_id
    where not pr.banned and v.value > 0;
    return;
  end if;
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
  )
  select (row_number() over (order by v.value desc, v.achieved_at, v.user_id))::int, v.user_id, v.value, v.achieved_at
  from v join public.profiles pr on pr.id = v.user_id
  where not pr.banned;
end $$;
revoke execute on function public._player_rank_at(text, text, timestamptz) from public, anon, authenticated;

-- Giữ nguyên chữ ký và kết quả; thêm kind 'points'.
create or replace function public._player_board_at(p_kind text, p_period text, p_limit int, p_now timestamptz)
returns table (rank int, user_id uuid, display_name text, avatar_url text, value bigint)
language sql stable security definer set search_path = public as $$
  select b.rank, b.user_id, pr.display_name, pr.avatar_url, b.value
  from public._player_rank_at(p_kind, p_period, p_now) b
  join public.profiles pr on pr.id = b.user_id
  order by b.rank
  limit greatest(1, least(100, coalesce(p_limit, 50)))
$$;
revoke execute on function public._player_board_at(text, text, int, timestamptz) from public, anon, authenticated;

-- Điểm và hạng của một người cho ba kỳ day/week/all. Hạng null khi 0 điểm hoặc bị khóa. Nội bộ (test truyền thời điểm).
create function public._player_points_at(p_user_id uuid, p_now timestamptz)
returns table (period text, points bigint, rank int)
language sql stable security definer set search_path = public as $$
  select per.p,
         coalesce((select v.value from public._points_at(per.p, p_now, p_user_id) v where v.user_id = p_user_id), 0)::bigint,
         (select b.rank from public._player_rank_at('points', per.p, p_now) b where b.user_id = p_user_id)
  from unnest(array['day', 'week', 'all']) with ordinality per(p, o)
  order by per.o
$$;
revoke execute on function public._player_points_at(uuid, timestamptz) from public, anon, authenticated;

create function public.player_points(p_user_id uuid)
returns table (period text, points bigint, rank int)
language sql stable security definer set search_path = public as $$
  select * from public._player_points_at(p_user_id, now())
$$;
revoke execute on function public.player_points(uuid) from public, anon, authenticated;
grant execute on function public.player_points(uuid) to anon, authenticated;

-- Thêm p_points (null = giữ nguyên, 0..1000). Đổi chữ ký sẽ tạo overload nên xóa bản cũ trước.
drop function public.admin_update_game(text, boolean, jsonb);
create function public.admin_update_game(p_game_id text, p_hidden boolean, p_rules jsonb, p_points int default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  g public.games;
  k text;
  v jsonb;
  rk text;
  rv jsonb;
  bad boolean;
begin
  perform public._require_admin();
  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'unknown_game'; end if;
  if p_points is not null and (p_points < 0 or p_points > 1000) then raise exception 'bad_points'; end if;
  p_rules := coalesce(p_rules, '{}'::jsonb);
  if jsonb_typeof(p_rules) <> 'object' then raise exception 'bad_rules'; end if;
  for k, v in select * from jsonb_each(p_rules) loop
    if not exists (select 1 from jsonb_array_elements(g.modes) m where m->>'key' = k) then
      raise exception 'unknown_mode';
    end if;
    if jsonb_typeof(v) <> 'object' then raise exception 'bad_rules'; end if;
    for rk, rv in select * from jsonb_each(v) loop
      -- Ba khóa số nguyên: chuỗi chữ số tối đa 18 ký tự (finish_run ép ::bigint, giá trị lớn hơn
      -- hoặc có phần thập phân sẽ làm mọi lần nộp điểm của mode đó lỗi). max_score_per_sec: số >= 0, <= 1e9.
      -- CASE lồng nhau để phép ép numeric chỉ chạy sau khi đã chắc là số.
      bad := case
           when rk not in ('min_duration_ms', 'max_score', 'max_score_per_sec', 'min_time_ms') then true
           when jsonb_typeof(rv) <> 'number' then true
           when rk = 'max_score_per_sec' then (rv #>> '{}')::numeric < 0 or (rv #>> '{}')::numeric > 1000000000
           else (rv #>> '{}') !~ '^\d{1,18}$'
         end;
      if bad then raise exception 'bad_rules'; end if;
    end loop;
  end loop;
  update public.games
  set hidden = coalesce(p_hidden, hidden),
      points = coalesce(p_points, points),
      modes = (
        select coalesce(jsonb_agg(
          case when p_rules ? (m->>'key') then jsonb_set(m, '{rules}', p_rules->(m->>'key')) else m end
          order by o), '[]'::jsonb)
        from jsonb_array_elements(g.modes) with ordinality t(m, o)
      )
  where id = p_game_id;
end $$;
revoke execute on function public.admin_update_game(text, boolean, jsonb, int) from public, anon, authenticated;
grant execute on function public.admin_update_game(text, boolean, jsonb, int) to authenticated;
