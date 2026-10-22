-- Game yêu thích (đồng bộ giữa các máy của cùng tài khoản, kể cả khách) và lịch sử chơi của chính người gọi.
-- Bảng favorites không đọc/ghi trực tiếp; mọi thao tác đi qua RPC.

create table public.favorites (
  user_id uuid references public.profiles (id) on delete cascade,
  game_id text references public.games (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

alter table public.favorites enable row level security;
revoke all on public.favorites from anon, authenticated;

-- Game yêu thích của người gọi, mới thêm trước. Game ẩn không trả về (vẫn giữ trong bảng, hiện lại khi game mở lại).
create function public.my_favorites() returns setof text
language sql stable security definer set search_path = public as $$
  select f.game_id
  from public.favorites f join public.games g on g.id = f.game_id
  where f.user_id = auth.uid() and not g.hidden
  order by f.created_at desc, f.game_id
$$;
revoke execute on function public.my_favorites() from public, anon, authenticated;
grant execute on function public.my_favorites() to authenticated;

-- Thêm (p_on true) hoặc bỏ (false) một game yêu thích. Thêm lại game đã có thì giữ thời điểm cũ. Tối đa 100 game.
create function public.set_favorite(p_game_id text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'no_profile'; end if;
  if p_on is null then raise exception 'invalid_on'; end if;
  if not p_on then
    delete from public.favorites where user_id = uid and game_id = p_game_id;
    return;
  end if;
  if not exists (select 1 from public.games g where g.id = p_game_id and not g.hidden) then
    raise exception 'unknown_game';
  end if;
  if (select count(*) from public.favorites where user_id = uid) >= 100
     and not exists (select 1 from public.favorites where user_id = uid and game_id = p_game_id) then
    raise exception 'too_many';
  end if;
  insert into public.favorites (user_id, game_id) values (uid, p_game_id) on conflict do nothing;
end $$;
revoke execute on function public.set_favorite(text, boolean) from public, anon, authenticated;
grant execute on function public.set_favorite(text, boolean) to authenticated;

-- Lịch sử ván của người gọi (finished và rejected; ván bỏ dở không hiện), mới nhất trước, phân trang theo p_before
-- (ended_at của ván cuối trang trước). points: điểm ván đó thật sự được cộng, theo đúng luật của _counted_runs_at
-- (điểm mode, x2 thắng không trợ giúp, 20 ván đầu mỗi game mỗi ngày giờ Việt Nam, game ẩn = 0).
create function public.my_runs(p_game_id text default null, p_before timestamptz default null, p_limit int default 30)
returns table (
  id uuid, game_id text, mode text, status text, started_at timestamptz, ended_at timestamptz,
  score bigint, time_ms bigint, won boolean, assisted boolean, reject_reason text, points int
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  tz constant text := 'Asia/Ho_Chi_Minh';
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  return query
  with fin as (
    select r.id,
           case when g.hidden then 0
                else public._mode_points(g.modes, r.mode, g.points) * case when r.won and not r.assisted then 2 else 1 end
           end as pts,
           row_number() over (
             partition by r.game_id, (r.ended_at at time zone tz)::date
             order by r.ended_at, r.id
           ) as n
    from public.runs r join public.games g on g.id = r.game_id
    where r.user_id = uid and r.status = 'finished' and r.ended_at is not null
  )
  select r.id, r.game_id, r.mode, r.status, r.started_at, r.ended_at, r.score, r.time_ms, r.won, r.assisted,
         r.reject_reason,
         coalesce(case when f.n <= 20 then f.pts else 0 end, 0)::int
  from public.runs r
  left join fin f on f.id = r.id
  where r.user_id = uid and r.status in ('finished', 'rejected') and r.ended_at is not null
    and (p_game_id is null or r.game_id = p_game_id)
    and (p_before is null or r.ended_at < p_before)
  order by r.ended_at desc, r.id
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end $$;
revoke execute on function public.my_runs(text, timestamptz, int) from public, anon, authenticated;
grant execute on function public.my_runs(text, timestamptz, int) to authenticated;
