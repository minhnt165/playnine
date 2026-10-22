-- Chỉ lưu tiến độ chơi lên tài khoản Google: khách (anonymous) không ghi được user_saves nữa và dữ liệu khách đã lưu
-- bị xóa. Khách liên kết Google thì từ đó cổng mới bắt đầu đẩy tiến độ trên máy lên (giữ nguyên user_id).

delete from public.user_saves s using auth.users u where u.id = s.user_id and u.is_anonymous;

-- Giữ nguyên chữ ký và luật của put_saves (migration 1500); thêm chặn khách.
create or replace function public.put_saves(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'no_profile'; end if;
  -- Chỉ tài khoản Google lưu tiến độ lên server; khách (anonymous) vẫn lưu trên máy.
  if exists (select 1 from auth.users u where u.id = uid and u.is_anonymous) then raise exception 'guest_not_allowed'; end if;
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
