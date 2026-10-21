-- Giai đoạn 2: bảng nền, RLS, đếm lượt chơi. Chạy được trên Supabase thật và PGlite (test).

-- Hàm mới trong public mặc định không cấp execute cho anon/authenticated; migration sau phải grant tường minh.
alter default privileges in schema public revoke execute on functions from anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 24 and display_name = btrim(display_name)),
  avatar_url text,
  role text not null default 'player' check (role in ('player', 'admin')),
  banned boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.games (
  id text primary key,
  metric text not null check (metric in ('score_high', 'time_low', 'wins')),
  modes jsonb not null,
  hidden boolean not null default false
);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  game_id text not null references public.games,
  mode text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  score bigint,
  time_ms bigint,
  won boolean,
  assisted boolean not null default false,
  status text not null default 'started' check (status in ('started', 'finished', 'rejected')),
  reject_reason text
);
create index runs_board_idx on public.runs (game_id, mode, status, ended_at);
create index runs_user_idx on public.runs (user_id);

create table public.play_counts (
  game_id text references public.games,
  day date,
  count bigint not null default 0,
  primary key (game_id, day)
);

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.runs enable row level security;
alter table public.play_counts enable row level security;

-- Quyền bảng: mặc định thu hết rồi cấp lại đúng phần cần.
revoke all on public.profiles, public.games, public.runs, public.play_counts from anon, authenticated;
grant select on public.games, public.play_counts, public.profiles to anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy games_read on public.games for select to anon, authenticated using (true);
create policy play_counts_read on public.play_counts for select to anon, authenticated using (true);
create policy profiles_read on public.profiles for select to anon, authenticated using (true);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- runs: không có policy nào -> không đọc/ghi trực tiếp; mọi ghi đi qua RPC.

-- Tạo profile khi có người dùng mới (Google metadata).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  nm text;
begin
  nm := left(btrim(coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(coalesce(new.email, ''), '@', 1)
  )), 24);
  nm := btrim(nm);
  if char_length(nm) < 2 then nm := 'Player'; end if;
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, nm, new.raw_user_meta_data->>'avatar_url');
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.ping() returns int
language sql stable as $$ select 1 $$;
revoke execute on function public.ping() from public, anon, authenticated;
grant execute on function public.ping() to anon, authenticated;

create function public.record_play(p_game_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.games where id = p_game_id) then
    return;
  end if;
  insert into public.play_counts (game_id, day, count)
  values (p_game_id, (now() at time zone 'Asia/Ho_Chi_Minh')::date, 1)
  on conflict (game_id, day) do update set count = public.play_counts.count + 1;
end $$;
revoke execute on function public.record_play(text) from public, anon, authenticated;
grant execute on function public.record_play(text) to anon, authenticated;

create function public.play_totals() returns table (game_id text, total bigint)
language sql stable security definer set search_path = public as $$
  select pc.game_id, sum(pc.count)::bigint from public.play_counts pc group by pc.game_id order by pc.game_id
$$;
revoke execute on function public.play_totals() from public, anon, authenticated;
grant execute on function public.play_totals() to anon, authenticated;

-- Seed 17 game. Luật chống gian lận rộng tay, chỉ chặn điều bất khả thi.
create function pg_temp.m(k text, en text, vi text, r jsonb) returns jsonb
language sql as $$ select jsonb_build_object('key', k, 'label', jsonb_build_object('en', en, 'vi', vi), 'rules', r) $$;

insert into public.games (id, metric, modes) values
('2048', 'score_high', jsonb_build_array(
  pg_temp.m('3x3', '3x3', '3x3', '{"min_duration_ms":2000,"max_score_per_sec":2000}'),
  pg_temp.m('4x4', '4x4', '4x4', '{"min_duration_ms":2000,"max_score_per_sec":2000}'),
  pg_temp.m('5x5', '5x5', '5x5', '{"min_duration_ms":2000,"max_score_per_sec":3000}'))),
('xepgach', 'score_high', jsonb_build_array(
  pg_temp.m('lv1', 'Level 1', 'Cấp 1', '{"min_duration_ms":3000,"max_score_per_sec":2000}'),
  pg_temp.m('lv5', 'Level 5', 'Cấp 5', '{"min_duration_ms":3000,"max_score_per_sec":4000}'),
  pg_temp.m('lv10', 'Level 10', 'Cấp 10', '{"min_duration_ms":3000,"max_score_per_sec":8000}'))),
('ran', 'score_high', jsonb_build_array(
  pg_temp.m('classic-slow', 'Classic - Slow', 'Cổ điển - Chậm', '{"min_duration_ms":2000,"max_score_per_sec":50}'),
  pg_temp.m('classic-normal', 'Classic - Normal', 'Cổ điển - Vừa', '{"min_duration_ms":2000,"max_score_per_sec":80}'),
  pg_temp.m('classic-fast', 'Classic - Fast', 'Cổ điển - Nhanh', '{"min_duration_ms":2000,"max_score_per_sec":120}'),
  pg_temp.m('wrap-slow', 'Wrap - Slow', 'Xuyên tường - Chậm', '{"min_duration_ms":2000,"max_score_per_sec":50}'),
  pg_temp.m('wrap-normal', 'Wrap - Normal', 'Xuyên tường - Vừa', '{"min_duration_ms":2000,"max_score_per_sec":80}'),
  pg_temp.m('wrap-fast', 'Wrap - Fast', 'Xuyên tường - Nhanh', '{"min_duration_ms":2000,"max_score_per_sec":120}'),
  pg_temp.m('maze-slow', 'Maze - Slow', 'Mê cung - Chậm', '{"min_duration_ms":2000,"max_score_per_sec":50}'),
  pg_temp.m('maze-normal', 'Maze - Normal', 'Mê cung - Vừa', '{"min_duration_ms":2000,"max_score_per_sec":80}'),
  pg_temp.m('maze-fast', 'Maze - Fast', 'Mê cung - Nhanh', '{"min_duration_ms":2000,"max_score_per_sec":120}'))),
('phagach', 'score_high', jsonb_build_array(
  pg_temp.m('default', 'Default', 'Mặc định', '{"min_duration_ms":2000,"max_score_per_sec":2000}'))),
('minesweeper', 'time_low', jsonb_build_array(
  pg_temp.m('easy', 'Easy', 'Dễ', '{"min_time_ms":800}'),
  pg_temp.m('medium', 'Medium', 'Vừa', '{"min_time_ms":3000}'),
  pg_temp.m('hard', 'Hard', 'Khó', '{"min_time_ms":8000}'),
  pg_temp.m('daily', 'Daily', 'Hằng ngày', '{"min_time_ms":800}'))),
('sudoku', 'time_low', jsonb_build_array(
  pg_temp.m('easy', 'Easy', 'Dễ', '{"min_time_ms":10000}'),
  pg_temp.m('medium', 'Medium', 'Vừa', '{"min_time_ms":15000}'),
  pg_temp.m('hard', 'Hard', 'Khó', '{"min_time_ms":20000}'),
  pg_temp.m('expert', 'Expert', 'Chuyên gia', '{"min_time_ms":25000}'),
  pg_temp.m('extreme', 'Extreme', 'Cực khó', '{"min_time_ms":30000}'),
  pg_temp.m('daily', 'Daily', 'Hằng ngày', '{"min_time_ms":10000}'))),
('tranhan', 'wins', jsonb_build_array(
  pg_temp.m('s5', '5 ships', '5 tàu', '{"min_duration_ms":3000}'),
  pg_temp.m('s10', '10 ships', '10 tàu', '{"min_duration_ms":3000}'),
  pg_temp.m('s15', '15 ships', '15 tàu', '{"min_duration_ms":3000}'))),
('xepbai', 'wins', jsonb_build_array(
  pg_temp.m('draw1', 'Draw 1', 'Rút 1', '{"min_duration_ms":3000}'),
  pg_temp.m('draw3', 'Draw 3', 'Rút 3', '{"min_duration_ms":3000}'),
  pg_temp.m('daily', 'Daily', 'Hằng ngày', '{"min_duration_ms":3000}')));

insert into public.games (id, metric, modes)
select g, 'wins', jsonb_build_array(
  pg_temp.m('easy', 'Easy', 'Dễ', '{"min_duration_ms":3000}'),
  pg_temp.m('medium', 'Medium', 'Vừa', '{"min_duration_ms":3000}'),
  pg_temp.m('hard', 'Hard', 'Khó', '{"min_duration_ms":3000}'))
from unnest(array['co9o','caro','xiangqi','covua','colat','codam','coganh','oanquan','bonlientiep']) as g;