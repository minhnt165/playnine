-- Giai đoạn 4: chấm sao game (1..5). Mỗi người một đánh giá cho mỗi game; khách (anonymous user) cũng chấm được.
-- Bảng không đọc/ghi trực tiếp; mọi thao tác đi qua RPC.

create table public.game_ratings (
  user_id uuid references public.profiles (id) on delete cascade,
  game_id text references public.games (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (user_id, game_id)
);
create index game_ratings_game_idx on public.game_ratings (game_id);

alter table public.game_ratings enable row level security;
revoke all on public.game_ratings from anon, authenticated;

-- Chấm (hoặc đổi) số sao của người gọi; p_stars null = xóa đánh giá. Game ẩn coi như không tồn tại.
create function public.rate_game(p_game_id text, p_stars int) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof public.profiles;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into prof from public.profiles where id = uid;
  if not found then raise exception 'no_profile'; end if;
  if prof.banned then raise exception 'banned'; end if;
  if not exists (select 1 from public.games g where g.id = p_game_id and not g.hidden) then
    raise exception 'unknown_game';
  end if;
  if p_stars is null then
    delete from public.game_ratings where user_id = uid and game_id = p_game_id;
    return;
  end if;
  if p_stars not between 1 and 5 then raise exception 'bad_stars'; end if;
  insert into public.game_ratings (user_id, game_id, stars) values (uid, p_game_id, p_stars)
  on conflict (user_id, game_id) do update set stars = excluded.stars, updated_at = now();
end $$;
revoke execute on function public.rate_game(text, int) from public, anon, authenticated;
grant execute on function public.rate_game(text, int) to authenticated;

-- Điểm trung bình (làm tròn 1 chữ số) và số lượt chấm của từng game không ẩn; bỏ đánh giá của người bị khóa.
-- Game chưa có lượt chấm nào thì không có hàng.
create function public.game_rating_summary()
returns table (game_id text, average numeric, count int)
language sql stable security definer set search_path = public as $$
  select gr.game_id, round(avg(gr.stars)::numeric, 1), count(*)::int
  from public.game_ratings gr
  join public.games g on g.id = gr.game_id
  join public.profiles pr on pr.id = gr.user_id
  where not g.hidden and not pr.banned
  group by gr.game_id
  order by gr.game_id
$$;
revoke execute on function public.game_rating_summary() from public, anon, authenticated;
grant execute on function public.game_rating_summary() to anon, authenticated;

create function public.my_ratings()
returns table (game_id text, stars int)
language sql stable security definer set search_path = public as $$
  select gr.game_id, gr.stars::int from public.game_ratings gr
  where gr.user_id = auth.uid()
  order by gr.game_id
$$;
revoke execute on function public.my_ratings() from public, anon, authenticated;
grant execute on function public.my_ratings() to authenticated;
