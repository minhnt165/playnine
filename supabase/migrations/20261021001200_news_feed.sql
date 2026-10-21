-- Tin game tự động: script scripts/crawl-news.mjs (GitHub Actions, mỗi 6 giờ) đọc RSS của các trang tin
-- rồi gọi ingest_news() bằng service role. Chỉ lưu tiêu đề, tóm tắt ngắn, ảnh và link về bài gốc;
-- không chép nội dung. Tin không bị ẩn đọc công khai; admin ẩn/hiện qua admin_hide_news(). Giữ 30 ngày.

create table public.news_feed (
  id uuid primary key default gen_random_uuid(),
  url text not null unique check (url ~ '^https://' and char_length(url) <= 600),
  source text not null check (char_length(source) between 1 and 40),
  lang text not null check (lang in ('en', 'vi')),
  title text not null check (char_length(title) between 1 and 300),
  summary text null check (char_length(summary) <= 400),
  image_url text null check (image_url ~ '^https://' and char_length(image_url) <= 600),
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  hidden boolean not null default false
);
create index news_feed_published_idx on public.news_feed (published_at desc);

alter table public.news_feed enable row level security;
revoke all on public.news_feed from anon, authenticated;
grant select on public.news_feed to anon, authenticated;
create policy news_feed_read_visible on public.news_feed for select to anon, authenticated
  using (not hidden);

-- Ép kiểu thời gian, sai định dạng thì null thay vì làm hỏng cả lô. Nội bộ.
create function public._try_timestamptz(p_value text) returns timestamptz
language plpgsql immutable set search_path = public as $$
begin
  return p_value::timestamptz;
exception when others then
  return null;
end $$;
revoke execute on function public._try_timestamptz(text) from public, anon, authenticated;

-- Thêm tin mới (trùng url thì bỏ qua, giữ nguyên cờ ẩn), bỏ mục không hợp lệ, xóa tin quá 30 ngày.
-- Giờ đăng ở tương lai bị kẹp về now(). Trả số tin đã thêm. Chỉ service role gọi được.
create function public.ingest_news(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'invalid_items'; end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'too_many_items'; end if;
  with src as (
    select btrim(x->>'url') as url, btrim(x->>'source') as source, x->>'lang' as lang,
      btrim(x->>'title') as title, nullif(btrim(coalesce(x->>'summary', '')), '') as summary,
      nullif(btrim(coalesce(x->>'image_url', '')), '') as image_url,
      least(coalesce(public._try_timestamptz(x->>'published_at'), now()), now()) as published_at
    from jsonb_array_elements(p_items) x
    where jsonb_typeof(x) = 'object'
  )
  insert into public.news_feed (url, source, lang, title, summary, image_url, published_at)
  select distinct on (s.url) s.url, s.source, s.lang, s.title, left(s.summary, 400),
    case when s.image_url ~ '^https://' and char_length(s.image_url) <= 600 then s.image_url end,
    s.published_at
  from src s
  where s.url ~ '^https://' and char_length(s.url) <= 600
    and char_length(coalesce(s.source, '')) between 1 and 40
    and s.lang in ('en', 'vi')
    and char_length(coalesce(s.title, '')) between 1 and 300
    and s.published_at > now() - interval '30 days'
  order by s.url, s.published_at desc
  on conflict (url) do nothing;
  get diagnostics n = row_count;
  delete from public.news_feed where published_at < now() - interval '30 days';
  return n;
end $$;
revoke execute on function public.ingest_news(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.ingest_news(jsonb) to service_role';
  end if;
end $$;

-- Mọi tin (kể cả đã ẩn), mới nhất trước.
create function public.admin_news_feed(p_limit int default 100) returns setof public.news_feed
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
  select * from public.news_feed f
  order by f.published_at desc, f.id
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;
revoke execute on function public.admin_news_feed(int) from public, anon, authenticated;
grant execute on function public.admin_news_feed(int) to authenticated;

create function public.admin_hide_news(p_id uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_hidden is null then raise exception 'invalid_hidden'; end if;
  update public.news_feed set hidden = p_hidden where id = p_id;
  if not found then raise exception 'not_found'; end if;
end $$;
revoke execute on function public.admin_hide_news(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_hide_news(uuid, boolean) to authenticated;
