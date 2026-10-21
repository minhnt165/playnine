-- Giai đoạn 2: RPC ván chơi và bảng xếp hạng. Mọi ghi của người chơi đi qua đây.

-- Luật của một mode (jsonb, rỗng nếu không có).
create function public._mode_rules(p_game_id text, p_mode text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select m->'rules' from public.games g, jsonb_array_elements(g.modes) m
                   where g.id = p_game_id and m->>'key' = p_mode limit 1), '{}'::jsonb)
$$;
revoke execute on function public._mode_rules(text, text) from public, anon, authenticated;

create function public.start_run(p_game_id text, p_mode text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof public.profiles;
  rid uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into prof from public.profiles where id = uid;
  if not found then raise exception 'no_profile'; end if;
  if prof.banned then raise exception 'banned'; end if;
  if not exists (
    select 1 from public.games g, jsonb_array_elements(g.modes) m
    where g.id = p_game_id and m->>'key' = p_mode
  ) then
    raise exception 'unknown_game_or_mode';
  end if;
  insert into public.runs (user_id, game_id, mode) values (uid, p_game_id, p_mode) returning id into rid;
  return rid;
end $$;
revoke execute on function public.start_run(text, text) from public, anon, authenticated;
grant execute on function public.start_run(text, text) to authenticated;

-- Bảng xếp hạng đầy đủ (chưa cắt, chưa join profile) tại thời điểm p_now. Nội bộ.
create function public._board_at(p_game_id text, p_mode text, p_period text, p_now timestamptz)
returns table (rank int, user_id uuid, value bigint, achieved_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  tz constant text := 'Asia/Ho_Chi_Minh';
  loc timestamp := p_now at time zone tz;
  lo timestamptz;
  hi timestamptz;
  mt text;
begin
  if p_period not in ('day', 'week', 'all') then raise exception 'bad_period'; end if;
  select g.metric into mt from public.games g where g.id = p_game_id;
  if mt is null then return; end if;
  if p_period = 'day' then
    lo := date_trunc('day', loc) at time zone tz;
    hi := (date_trunc('day', loc) + interval '1 day') at time zone tz;
  elsif p_period = 'week' then
    lo := date_trunc('week', loc) at time zone tz;
    hi := (date_trunc('week', loc) + interval '7 days') at time zone tz;
  end if;
  return query
  with b as (
    select r.user_id, r.score, r.time_ms, r.won, r.assisted, r.ended_at
    from public.runs r join public.profiles pr on pr.id = r.user_id
    where r.game_id = p_game_id and r.mode = p_mode and r.status = 'finished' and not pr.banned
      and (p_period = 'all' or (r.ended_at >= lo and r.ended_at < hi))
  ),
  v as (
    (select distinct on (x.user_id) x.user_id, x.score as value, x.ended_at as achieved_at
       from b x where mt = 'score_high' and x.score is not null
       order by x.user_id, x.score desc, x.ended_at)
    union all
    (select distinct on (x.user_id) x.user_id, x.time_ms, x.ended_at
       from b x where mt = 'time_low' and x.won and not x.assisted and x.time_ms is not null
       order by x.user_id, x.time_ms, x.ended_at)
    union all
    (select x.user_id, count(*)::bigint, max(x.ended_at)
       from b x where mt = 'wins' and x.won and not x.assisted group by x.user_id)
  )
  select (row_number() over (
            order by case when mt = 'time_low' then v.value else -v.value end, v.achieved_at, v.user_id
          ))::int,
         v.user_id, v.value, v.achieved_at
  from v;
end $$;
revoke execute on function public._board_at(text, text, text, timestamptz) from public, anon, authenticated;

create function public._leaderboard_at(p_game_id text, p_mode text, p_period text, p_limit int, p_now timestamptz)
returns table (rank int, user_id uuid, display_name text, avatar_url text, value bigint, achieved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.rank, b.user_id, pr.display_name, pr.avatar_url, b.value, b.achieved_at
  from public._board_at(p_game_id, p_mode, p_period, p_now) b
  join public.profiles pr on pr.id = b.user_id
  order by b.rank
  limit greatest(1, least(100, coalesce(p_limit, 50)))
$$;
revoke execute on function public._leaderboard_at(text, text, text, int, timestamptz) from public, anon, authenticated;

create function public.leaderboard(p_game_id text, p_mode text, p_period text, p_limit int default 50)
returns table (rank int, user_id uuid, display_name text, avatar_url text, value bigint, achieved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select * from public._leaderboard_at(p_game_id, p_mode, p_period, p_limit, now())
$$;
revoke execute on function public.leaderboard(text, text, text, int) from public, anon, authenticated;
grant execute on function public.leaderboard(text, text, text, int) to anon, authenticated;

create function public.my_rank(p_game_id text, p_mode text, p_period text)
returns table (rank int, value bigint)
language sql stable security definer set search_path = public as $$
  select b.rank, b.value from public._board_at(p_game_id, p_mode, p_period, now()) b
  where b.user_id = auth.uid()
$$;
revoke execute on function public.my_rank(text, text, text) from public, anon, authenticated;
grant execute on function public.my_rank(text, text, text) to authenticated;

create function public.finish_run(
  p_run_id uuid, p_score bigint, p_time_ms bigint, p_won boolean, p_assisted boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  run public.runs;
  gm public.games;
  rules jsonb;
  banned_now boolean;
  t_end timestamptz := now();
  elapsed_ms bigint;
  reason text;
  v_won boolean := coalesce(p_won, false);
  v_asst boolean := coalesce(p_assisted, false);
  ranks jsonb := '{}'::jsonb;
  rk int;
  on_board boolean;
begin
  select * into run from public.runs where id = p_run_id and user_id = uid and status = 'started' for update;
  if not found or uid is null then
    return jsonb_build_object('status', 'rejected', 'reason', 'not_open', 'ranks', '{}'::jsonb);
  end if;
  select * into gm from public.games where id = run.game_id;
  rules := public._mode_rules(run.game_id, run.mode);
  select pr.banned into banned_now from public.profiles pr where pr.id = uid;
  elapsed_ms := (extract(epoch from (t_end - run.started_at)) * 1000)::bigint;

  if coalesce(banned_now, false) then
    reason := 'banned';
  elsif t_end - run.started_at > interval '24 hours' then
    reason := 'expired';
  elsif rules ? 'min_duration_ms' and elapsed_ms < (rules->>'min_duration_ms')::bigint then
    reason := 'too_fast';
  elsif (gm.metric = 'score_high' and p_score is null)
     or (gm.metric = 'time_low' and v_won and p_time_ms is null) then
    reason := 'missing_value';
  elsif gm.metric = 'time_low' and v_won and p_time_ms > elapsed_ms + 5000 then
    reason := 'time_mismatch';
  elsif gm.metric = 'time_low' and v_won and rules ? 'min_time_ms' and p_time_ms < (rules->>'min_time_ms')::bigint then
    reason := 'time_too_low';
  elsif p_score is not null and rules ? 'max_score' and p_score > (rules->>'max_score')::bigint then
    reason := 'score_too_high';
  elsif p_score is not null and rules ? 'max_score_per_sec'
     and p_score::numeric / greatest(1, elapsed_ms / 1000.0) > (rules->>'max_score_per_sec')::numeric then
    reason := 'score_rate';
  end if;

  update public.runs set
    ended_at = t_end, score = p_score, time_ms = p_time_ms, won = v_won, assisted = v_asst,
    status = case when reason is null then 'finished' else 'rejected' end,
    reject_reason = reason
  where id = run.id;

  if reason is not null then
    return jsonb_build_object('status', 'rejected', 'reason', reason, 'ranks', '{}'::jsonb);
  end if;

  on_board := case gm.metric when 'score_high' then p_score is not null else v_won and not v_asst end;
  if on_board then
    if run.mode = 'daily' then
      select b.rank into rk from public._board_at(run.game_id, run.mode, 'day', t_end) b where b.user_id = uid;
      if rk is not null then ranks := ranks || jsonb_build_object('day', rk); end if;
    else
      select b.rank into rk from public._board_at(run.game_id, run.mode, 'week', t_end) b where b.user_id = uid;
      if rk is not null then ranks := ranks || jsonb_build_object('week', rk); end if;
      rk := null;
      select b.rank into rk from public._board_at(run.game_id, run.mode, 'all', t_end) b where b.user_id = uid;
      if rk is not null then ranks := ranks || jsonb_build_object('all', rk); end if;
    end if;
  end if;
  return jsonb_build_object('status', 'finished', 'reason', null, 'ranks', ranks);
end $$;
revoke execute on function public.finish_run(uuid, bigint, bigint, boolean, boolean) from public, anon, authenticated;
grant execute on function public.finish_run(uuid, bigint, bigint, boolean, boolean) to authenticated;

create function public.profile_bests(p_user_id uuid)
returns table (game_id text, mode text, metric text, value bigint, achieved_at timestamptz)
language sql stable security definer set search_path = public as $$
  with b as (
    select r.game_id, r.mode, g.metric, r.score, r.time_ms, r.won, r.assisted, r.ended_at
    from public.runs r
    join public.games g on g.id = r.game_id
    join public.profiles pr on pr.id = r.user_id
    where r.user_id = p_user_id and r.status = 'finished' and not pr.banned
  )
  (select distinct on (x.game_id, x.mode) x.game_id, x.mode, x.metric, x.score, x.ended_at
     from b x where x.metric = 'score_high' and x.score is not null
     order by x.game_id, x.mode, x.score desc, x.ended_at)
  union all
  (select distinct on (x.game_id, x.mode) x.game_id, x.mode, x.metric, x.time_ms, x.ended_at
     from b x where x.metric = 'time_low' and x.won and not x.assisted and x.time_ms is not null
     order by x.game_id, x.mode, x.time_ms, x.ended_at)
  union all
  (select x.game_id, x.mode, x.metric, count(*)::bigint, max(x.ended_at)
     from b x where x.metric = 'wins' and x.won and not x.assisted group by x.game_id, x.mode, x.metric)
$$;
revoke execute on function public.profile_bests(uuid) from public, anon, authenticated;
grant execute on function public.profile_bests(uuid) to anon, authenticated;
