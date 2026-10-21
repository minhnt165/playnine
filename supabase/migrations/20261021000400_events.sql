-- Giai đoạn 3: sự kiện, bộ sưu tập, huy hiệu và đóng sự kiện theo lịch.
-- Bảng mới đều đọc công khai; mọi ghi đi qua RPC (admin RPC ở migration sau) hoặc cron.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title jsonb not null,
  description jsonb not null default '{}',
  game_id text not null references public.games,
  mode text not null,
  agg text not null check (agg in ('best', 'sum')),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  award_top int not null default 3 check (award_top between 0 and 100),
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'closed', 'cancelled')),
  created_at timestamptz not null default now()
);
create index events_status_idx on public.events (status, ends_at);

-- Kết quả đã chụp khi đóng: là kết quả chính thức, không đổi theo ván bị từ chối hay người bị khóa sau đó.
create table public.event_results (
  event_id uuid references public.events on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  rank int not null,
  value bigint not null,
  achieved_at timestamptz,
  primary key (event_id, user_id)
);

create table public.badges (
  user_id uuid references public.profiles on delete cascade,
  event_id uuid references public.events on delete cascade,
  rank int not null,
  awarded_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index badges_event_idx on public.badges (event_id);

-- ends_at null: hiển thị không thời hạn.
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  title jsonb not null,
  game_ids text[] not null default '{}',
  starts_at timestamptz not null,
  ends_at timestamptz null,
  sort int not null default 0
);

alter table public.events enable row level security;
alter table public.event_results enable row level security;
alter table public.badges enable row level security;
alter table public.collections enable row level security;

revoke all on public.events, public.event_results, public.badges, public.collections from anon, authenticated;
grant select on public.events, public.event_results, public.badges, public.collections to anon, authenticated;

create policy events_read on public.events for select to anon, authenticated using (true);
create policy event_results_read on public.event_results for select to anon, authenticated using (true);
create policy badges_read on public.badges for select to anon, authenticated using (true);
create policy collections_read on public.collections for select to anon, authenticated using (true);

-- Người gọi có phải admin không (anon luôn false).
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select pr.role = 'admin' from public.profiles pr where pr.id = auth.uid()), false)
$$;
revoke execute on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- Pha hiển thị của sự kiện tại thời điểm p_now.
create function public._event_phase(e public.events, p_now timestamptz) returns text
language sql immutable set search_path = public as $$
  select case
    when e.status = 'cancelled' then 'cancelled'
    when e.status = 'closed' or p_now >= e.ends_at then 'ended'
    when p_now >= e.starts_at then 'live'
    else 'upcoming'
  end
$$;
revoke execute on function public._event_phase(public.events, timestamptz) from public, anon, authenticated;

-- Bảng xếp hạng tính trực tiếp từ runs theo cửa sổ sự kiện: cùng game, cùng mode, finished,
-- cả started_at lẫn ended_at nằm trong [starts_at, ends_at]; loại người bị khóa.
create function public._event_board(p_event_id uuid)
returns table (rank int, user_id uuid, value bigint, achieved_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  ev public.events;
  mt text;
begin
  select * into ev from public.events where id = p_event_id;
  if not found then return; end if;
  select g.metric into mt from public.games g where g.id = ev.game_id;
  if mt is null then return; end if;
  return query
  with b as (
    select r.user_id, r.score, r.time_ms, r.won, r.assisted, r.ended_at
    from public.runs r join public.profiles pr on pr.id = r.user_id
    where r.game_id = ev.game_id and r.mode = ev.mode and r.status = 'finished' and not pr.banned
      and r.started_at >= ev.starts_at and r.started_at <= ev.ends_at
      and r.ended_at >= ev.starts_at and r.ended_at <= ev.ends_at
  ),
  v as (
    (select distinct on (x.user_id) x.user_id, x.score as value, x.ended_at as achieved_at
       from b x where mt = 'score_high' and ev.agg = 'best' and x.score is not null
       order by x.user_id, x.score desc, x.ended_at)
    union all
    (select x.user_id, sum(x.score)::bigint, max(x.ended_at)
       from b x where mt = 'score_high' and ev.agg = 'sum' and x.score is not null group by x.user_id)
    union all
    (select distinct on (x.user_id) x.user_id, x.time_ms, x.ended_at
       from b x where mt = 'time_low' and ev.agg = 'best' and x.won and not x.assisted and x.time_ms is not null
       order by x.user_id, x.time_ms, x.ended_at)
    union all
    (select x.user_id, count(*)::bigint, max(x.ended_at)
       from b x where mt = 'wins' and x.won and not x.assisted group by x.user_id)
  )
  select (row_number() over (
            order by case when mt = 'time_low' then v.value end asc,
                     case when mt <> 'time_low' then v.value end desc,
                     v.achieved_at, v.user_id
          ))::int,
         v.user_id, v.value, v.achieved_at
  from v;
end $$;
revoke execute on function public._event_board(uuid) from public, anon, authenticated;

-- Sự kiện đã đóng đọc kết quả đã chụp; đã hủy không có hàng; còn lại tính trực tiếp.
create function public.event_leaderboard(p_event_id uuid, p_limit int default 50)
returns table (rank int, user_id uuid, display_name text, avatar_url text, value bigint, achieved_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  st text;
  lim int := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  select e.status into st from public.events e where e.id = p_event_id;
  if st is null or st = 'cancelled' then return; end if;
  if st = 'closed' then
    return query
    select er.rank, er.user_id, pr.display_name, pr.avatar_url, er.value, er.achieved_at
    from public.event_results er join public.profiles pr on pr.id = er.user_id
    where er.event_id = p_event_id
    order by er.rank
    limit lim;
  else
    return query
    select b.rank, b.user_id, pr.display_name, pr.avatar_url, b.value, b.achieved_at
    from public._event_board(p_event_id) b join public.profiles pr on pr.id = b.user_id
    order by b.rank
    limit lim;
  end if;
end $$;
revoke execute on function public.event_leaderboard(uuid, int) from public, anon, authenticated;
grant execute on function public.event_leaderboard(uuid, int) to anon, authenticated;

create function public.profile_badges(p_user_id uuid)
returns table (event_id uuid, rank int, awarded_at timestamptz, title jsonb, game_id text, mode text)
language sql stable security definer set search_path = public as $$
  select b.event_id, b.rank, b.awarded_at, e.title, e.game_id, e.mode
  from public.badges b join public.events e on e.id = b.event_id
  where b.user_id = p_user_id
  order by b.awarded_at desc, b.event_id
$$;
revoke execute on function public.profile_badges(uuid) from public, anon, authenticated;
grant execute on function public.profile_badges(uuid) to anon, authenticated;

-- Chụp kết quả và phát huy hiệu; chạy lại nhiều lần được (xóa rồi chụp lại).
create function public._close_event(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  top int;
  st text;
begin
  select e.award_top, e.status into top, st from public.events e where e.id = p_event_id for update;
  if not found then return; end if;
  -- Sự kiện đã hủy (kể cả hủy xen giữa lúc tick chọn nó) thì không đóng, không phát huy hiệu.
  if st = 'cancelled' then return; end if;
  delete from public.event_results where event_id = p_event_id;
  delete from public.badges where event_id = p_event_id;
  insert into public.event_results (event_id, user_id, rank, value, achieved_at)
  select p_event_id, b.user_id, b.rank, b.value, b.achieved_at from public._event_board(p_event_id) b;
  insert into public.badges (user_id, event_id, rank, awarded_at)
  select er.user_id, p_event_id, er.rank, now()
  from public.event_results er where er.event_id = p_event_id and er.rank <= top;
  update public.events set status = 'closed' where id = p_event_id;
end $$;
revoke execute on function public._close_event(uuid) from public, anon, authenticated;

-- Chuyển scheduled -> live và đóng sự kiện hết giờ; không đụng cancelled/closed. Trả số sự kiện vừa đóng.
create function public._tick_events(p_now timestamptz) returns int
language plpgsql security definer set search_path = public as $$
declare
  eid uuid;
  n int := 0;
begin
  update public.events set status = 'live'
  where status = 'scheduled' and starts_at <= p_now and p_now < ends_at;
  for eid in
    select e.id from public.events e where e.status in ('scheduled', 'live') and e.ends_at <= p_now
  loop
    perform public._close_event(eid);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public._tick_events(timestamptz) from public, anon, authenticated;

-- Cron chạy bằng postgres nên không cấp quyền cho anon/authenticated.
create function public.tick_events() returns int
language sql security definer set search_path = public as $$
  select public._tick_events(now())
$$;
revoke execute on function public.tick_events() from public, anon, authenticated;

-- Chỉ tạo lịch khi có pg_cron (PGlite dùng cho test thì không có).
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute $c$select cron.schedule('playnine-events', '*/5 * * * *', 'select public.tick_events()')$c$;
  end if;
end $$;
