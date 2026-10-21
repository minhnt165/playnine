-- Điểm theo từng mức độ (mode): mỗi phần tử games.modes có thể có khóa "points" (số nguyên 0..1000).
-- Mode không có "points" dùng games.points (mức mặc định của game). Ván thắng không trợ giúp vẫn x2, vẫn chỉ 20 ván/ngày.
-- Đổi điểm của một mode thì điểm các ván cũ của mode đó cũng được tính lại (như khi đổi games.points).

-- Điểm mỗi ván của p_mode trong danh sách mode; không có hoặc không phải số thì p_default. Nội bộ.
create function public._mode_points(p_modes jsonb, p_mode text, p_default int) returns int
language sql immutable set search_path = public as $$
  select coalesce(
    (select (m->>'points')::int from jsonb_array_elements(p_modes) m
      where m->>'key' = p_mode and jsonb_typeof(m->'points') = 'number' limit 1),
    p_default)
$$;
revoke execute on function public._mode_points(jsonb, text, int) from public, anon, authenticated;

-- Giữ chữ ký và kết quả; điểm mỗi ván lấy theo mode của ván.
create or replace function public._counted_runs_at(p_period text, p_now timestamptz, p_user_id uuid default null, p_game_id text default null)
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
           (public._mode_points(g.modes, r.mode, g.points) * case when r.won and not r.assisted then 2 else 1 end)::bigint as pts,
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

-- Mức điểm mặc định theo độ khó / độ dài ván. Khóa mode không có trong game thì bỏ qua.
do $$
declare
  cfg constant jsonb := '{
    "2048": {"3x3": 4, "4x4": 5, "5x5": 6},
    "bonlientiep": {"easy": 6, "medium": 10, "hard": 16},
    "caro": {"easy": 10, "medium": 15, "hard": 25},
    "co9o": {"easy": 10, "medium": 15, "hard": 25},
    "codam": {"easy": 10, "medium": 15, "hard": 25},
    "coganh": {"easy": 10, "medium": 15, "hard": 25},
    "colat": {"easy": 10, "medium": 15, "hard": 25},
    "covua": {"easy": 10, "medium": 15, "hard": 25},
    "oanquan": {"easy": 10, "medium": 15, "hard": 25},
    "xiangqi": {"easy": 10, "medium": 15, "hard": 25},
    "minesweeper": {"easy": 3, "medium": 6, "hard": 10, "daily": 8},
    "noihinh": {"classic": 5},
    "phagach": {"default": 5},
    "ran": {"classic-slow": 4, "classic-normal": 5, "classic-fast": 7, "wrap-slow": 3, "wrap-normal": 4, "wrap-fast": 6,
            "maze-slow": 5, "maze-normal": 6, "maze-fast": 8},
    "sudoku": {"easy": 5, "medium": 8, "hard": 12, "expert": 16, "extreme": 20, "daily": 10},
    "tranhan": {"s5": 5, "s10": 10, "s15": 15},
    "xepbai": {"draw1": 8, "draw3": 12, "daily": 10},
    "xepgach": {"lv1": 4, "lv5": 6, "lv10": 8}
  }';
  gid text;
  pts jsonb;
begin
  for gid, pts in select * from jsonb_each(cfg) loop
    update public.games g
    set modes = (
      select coalesce(jsonb_agg(
        case when pts ? (m->>'key') then m || jsonb_build_object('points', pts->(m->>'key')) else m end
        order by o), '[]'::jsonb)
      from jsonb_array_elements(g.modes) with ordinality t(m, o)
    )
    where g.id = gid;
  end loop;
end $$;

-- Thêm p_mode_points: {modeKey: số 0..1000 | null}; null bỏ điểm riêng của mode (về mức mặc định của game).
-- Mode không nêu trong p_mode_points giữ nguyên.
drop function public.admin_update_game(text, boolean, jsonb, int);
create function public.admin_update_game(p_game_id text, p_hidden boolean, p_rules jsonb, p_points int default null, p_mode_points jsonb default null)
returns void
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
  p_mode_points := coalesce(p_mode_points, '{}'::jsonb);
  if jsonb_typeof(p_mode_points) <> 'object' then raise exception 'bad_points'; end if;
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
  for k, v in select * from jsonb_each(p_mode_points) loop
    if not exists (select 1 from jsonb_array_elements(g.modes) m where m->>'key' = k) then
      raise exception 'unknown_mode';
    end if;
    -- Số nguyên 0..1000 (chuỗi chữ số tối đa 4 ký tự trước khi ép kiểu) hoặc null.
    if jsonb_typeof(v) <> 'null' and (jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^\d{1,4}$' or (v #>> '{}')::int > 1000) then
      raise exception 'bad_points';
    end if;
  end loop;
  update public.games
  set hidden = coalesce(p_hidden, hidden),
      points = coalesce(p_points, points),
      modes = (
        select coalesce(jsonb_agg(x.m order by x.o), '[]'::jsonb)
        from (
          select t.o,
                 case
                   when not p_mode_points ? (r.m->>'key') then r.m
                   when jsonb_typeof(p_mode_points->(r.m->>'key')) = 'null' then r.m - 'points'
                   else jsonb_set(r.m, '{points}', p_mode_points->(r.m->>'key'))
                 end as m
          from jsonb_array_elements(g.modes) with ordinality t(m0, o)
          cross join lateral (
            select case when p_rules ? (t.m0->>'key') then jsonb_set(t.m0, '{rules}', p_rules->(t.m0->>'key')) else t.m0 end as m
          ) r
        ) x
      )
  where id = p_game_id;
end $$;
revoke execute on function public.admin_update_game(text, boolean, jsonb, int, jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_game(text, boolean, jsonb, int, jsonb) to authenticated;
