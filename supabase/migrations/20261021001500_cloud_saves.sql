-- Lưu tiến độ chơi lên tài khoản: cổng đồng bộ các khóa localStorage của game (ván dở, thống kê, chuỗi ngày, cài đặt...)
-- với bảng này để đổi máy vẫn còn. Mỗi khóa một hàng; value null = đã xóa trên máy (giữ lại để máy khác cũng xóa theo).
-- Ghi đè theo updated_at (giờ sửa trên máy): bản nào mới hơn thì thắng. synced_at là giờ server nhận, dùng để máy khác
-- kéo phần mới (một máy có thể đẩy bản cũ chưa từng đồng bộ với updated_at rất xa). Bảng không đọc/ghi trực tiếp; mọi thao tác đi qua RPC.

create table public.user_saves (
  user_id uuid references public.profiles (id) on delete cascade,
  key text not null check (key ~ '^[A-Za-z0-9._:-]{1,100}$'),
  value text null check (char_length(value) <= 200000),
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_saves enable row level security;
revoke all on public.user_saves from anon, authenticated;

-- Các khóa của người gọi server nhận sau p_since (so với synced_at; null = tất cả), kể cả khóa đã xóa (value null).
create function public.my_saves(p_since timestamptz default null)
returns table (key text, value text, updated_at timestamptz, synced_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.key, s.value, s.updated_at, s.synced_at
  from public.user_saves s
  where s.user_id = auth.uid() and (p_since is null or s.synced_at > p_since)
  order by s.synced_at, s.key
$$;
revoke execute on function public.my_saves(timestamptz) from public, anon, authenticated;
grant execute on function public.my_saves(timestamptz) to authenticated;

-- Ghi một lô [{key, value: chuỗi | null, updated_at}]. Mỗi khóa chỉ ghi khi updated_at mới hơn bản trên server;
-- updated_at ở tương lai bị kẹp về now(). Tối đa 100 mục mỗi lần, 400 khóa và 2 MB mỗi người.
-- Trả về số khóa đã ghi.
create function public.put_saves(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'no_profile'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'invalid_items'; end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'too_many_items'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where jsonb_typeof(x) <> 'object'
       or coalesce(x->>'key', '') !~ '^[A-Za-z0-9._:-]{1,100}$'
       or jsonb_typeof(x->'value') not in ('string', 'null')
       or char_length(coalesce(x->>'value', '')) > 200000
  ) then
    raise exception 'invalid_items';
  end if;

  with src as (
    select distinct on (x->>'key') x->>'key' as key, x->>'value' as value,
           least(coalesce(public._try_timestamptz(x->>'updated_at'), now()), now()) as at
    from jsonb_array_elements(p_items) x
    order by x->>'key', least(coalesce(public._try_timestamptz(x->>'updated_at'), now()), now()) desc
  )
  insert into public.user_saves as s (user_id, key, value, updated_at, synced_at)
  select uid, src.key, src.value, src.at, now() from src
  on conflict (user_id, key) do update
    set value = excluded.value, updated_at = excluded.updated_at, synced_at = now()
    where excluded.updated_at > s.updated_at;
  get diagnostics n = row_count;

  if (select count(*) from public.user_saves where user_id = uid) > 400 then raise exception 'too_many_keys'; end if;
  if (select coalesce(sum(char_length(value)), 0) from public.user_saves where user_id = uid) > 2000000 then
    raise exception 'too_large';
  end if;
  return n;
end $$;
revoke execute on function public.put_saves(jsonb) from public, anon, authenticated;
grant execute on function public.put_saves(jsonb) to authenticated;
