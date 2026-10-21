-- Giả lập phần Supabase cần cho test cục bộ (PGlite). KHÔNG dùng trong migration.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}',
  -- Như Supabase thật: signInAnonymously tạo hàng is_anonymous = true; linkIdentity cập nhật chính hàng đó về false.
  is_anonymous boolean not null default false
);
-- Danh tính đã liên kết (Google...): GoTrue chèn hàng ở đây khi linkIdentity; identity_data chứa full_name, avatar_url...
create table auth.identities (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  user_id uuid not null references auth.users on delete cascade,
  identity_data jsonb not null,
  provider text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- Mô phỏng default privileges của Supabase để test quyền có ý nghĩa.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
