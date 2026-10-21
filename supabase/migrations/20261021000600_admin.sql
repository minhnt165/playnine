-- Giai đoạn 3: RPC cho admin. Mọi hàm admin_* gọi _require_admin() ở dòng đầu và chỉ cấp cho authenticated.

-- Ném 'forbidden' khi người gọi không phải admin (anon cũng vậy). Nội bộ.
create function public._require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
end $$;
revoke execute on function public._require_admin() from public, anon, authenticated;

-- Ẩn/hiện game và thay luật của từng mode có trong p_rules (giữ nguyên key/label). p_hidden null thì giữ nguyên.
create function public.admin_update_game(p_game_id text, p_hidden boolean, p_rules jsonb) returns void
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
  p_rules := coalesce(p_rules, '{}'::jsonb);
  if jsonb_typeof(p_rules) <> 'object' then raise exception 'bad_rules'; end if;
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
  update public.games
  set hidden = coalesce(p_hidden, hidden),
      modes = (
        select coalesce(jsonb_agg(
          case when p_rules ? (m->>'key') then jsonb_set(m, '{rules}', p_rules->(m->>'key')) else m end
          order by o), '[]'::jsonb)
        from jsonb_array_elements(g.modes) with ordinality t(m, o)
      )
  where id = p_game_id;
end $$;
revoke execute on function public.admin_update_game(text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_game(text, boolean, jsonb) to authenticated;

-- Tạo (không có id) hoặc sửa sự kiện. Khi sửa, trường nào thiếu trong p_event thì giữ giá trị cũ.
-- Quyền sửa theo pha: upcoming sửa hết; live chỉ title/description/award_top/ends_at; ended/cancelled chỉ title/description.
create function public.admin_save_event(p_event jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  old public.events;
  eid uuid;
  src jsonb;
  d jsonb;
  v_title jsonb;
  v_desc jsonb;
  v_game text;
  v_mode text;
  v_agg text;
  v_start timestamptz;
  v_end timestamptz;
  v_award int;
  mt text;
  ph text;
  ms constant text := 'milliseconds';
begin
  perform public._require_admin();
  p_event := coalesce(p_event, '{}'::jsonb);
  if nullif(p_event->>'id', '') is not null then
    begin
      eid := (p_event->>'id')::uuid;
    exception when others then
      raise exception 'not_found';
    end;
    select * into old from public.events where id = eid for update;
    if not found then raise exception 'not_found'; end if;
  end if;

  src := coalesce(p_event->'title', old.title);
  v_title := jsonb_strip_nulls(jsonb_build_object(
    'en', btrim(coalesce(src->>'en', '')),
    'vi', nullif(btrim(coalesce(src->>'vi', '')), '')));
  if coalesce(v_title->>'en', '') = '' then raise exception 'bad_title'; end if;
  d := p_event->'description';
  if d is null then
    v_desc := coalesce(old.description, '{}'::jsonb);
  else
    v_desc := jsonb_strip_nulls(jsonb_build_object(
      'en', nullif(btrim(coalesce(d->>'en', '')), ''),
      'vi', nullif(btrim(coalesce(d->>'vi', '')), '')));
  end if;

  v_game := coalesce(p_event->>'game_id', old.game_id);
  v_mode := coalesce(p_event->>'mode', old.mode);
  select g.metric into mt from public.games g, jsonb_array_elements(g.modes) m
  where g.id = v_game and m->>'key' = v_mode limit 1;
  if mt is null then raise exception 'unknown_game_or_mode'; end if;

  v_agg := coalesce(p_event->>'agg', old.agg);
  if v_agg is null or v_agg not in ('best', 'sum') or (v_agg = 'sum' and mt = 'time_low') then
    raise exception 'bad_agg';
  end if;

  begin
    v_start := coalesce((p_event->>'starts_at')::timestamptz, old.starts_at);
    v_end := coalesce((p_event->>'ends_at')::timestamptz, old.ends_at);
  exception when others then
    v_start := null;
    v_end := null;
  end;
  if v_start is null or v_end is null or v_end <= v_start then raise exception 'bad_time'; end if;

  begin
    v_award := coalesce((p_event->>'award_top')::int, old.award_top, 3);
  exception when others then
    v_award := -1;
  end;
  if v_award not between 0 and 100 then raise exception 'bad_award'; end if;

  if eid is null then
    insert into public.events (title, description, game_id, mode, agg, starts_at, ends_at, award_top)
    values (v_title, v_desc, v_game, v_mode, v_agg, v_start, v_end, v_award)
    returning id into eid;
    return eid;
  end if;

  ph := public._event_phase(old, now());
  if ph = 'live' then
    if v_game <> old.game_id or v_mode <> old.mode or v_agg <> old.agg
       or date_trunc(ms, v_start) <> date_trunc(ms, old.starts_at) then
      raise exception 'event_started';
    end if;
    if v_end <= now() then raise exception 'bad_time'; end if;
  elsif ph <> 'upcoming' then
    if v_game <> old.game_id or v_mode <> old.mode or v_agg <> old.agg or v_award <> old.award_top
       or date_trunc(ms, v_start) <> date_trunc(ms, old.starts_at)
       or date_trunc(ms, v_end) <> date_trunc(ms, old.ends_at) then
      raise exception 'event_locked';
    end if;
  end if;
  update public.events
  set title = v_title, description = v_desc, game_id = v_game, mode = v_mode, agg = v_agg,
      starts_at = v_start, ends_at = v_end, award_top = v_award
  where id = eid;
  return eid;
end $$;
revoke execute on function public.admin_save_event(jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_event(jsonb) to authenticated;

-- Hủy sự kiện chưa đóng. Kết quả đã chụp (nếu có) không bị đụng tới.
create function public.admin_cancel_event(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  e public.events;
begin
  perform public._require_admin();
  select * into e from public.events where id = p_event_id for update;
  if not found then raise exception 'not_found'; end if;
  -- Đã quá hạn mà cron chưa đóng: kết quả đã đạt được, không cho hủy.
  if e.status not in ('scheduled', 'live') or public._event_phase(e, now()) = 'ended' then raise exception 'event_locked'; end if;
  update public.events set status = 'cancelled' where id = p_event_id;
end $$;
revoke execute on function public.admin_cancel_event(uuid) from public, anon, authenticated;
grant execute on function public.admin_cancel_event(uuid) to authenticated;

-- Chụp lại kết quả của sự kiện đã đóng (nút "Tính lại kết quả").
create function public.admin_recompute_event(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  st text;
begin
  perform public._require_admin();
  select e.status into st from public.events e where e.id = p_event_id;
  if not found then raise exception 'not_found'; end if;
  if st <> 'closed' then raise exception 'not_closed'; end if;
  perform public._close_event(p_event_id);
end $$;
revoke execute on function public.admin_recompute_event(uuid) from public, anon, authenticated;
grant execute on function public.admin_recompute_event(uuid) to authenticated;

-- Tạo hoặc sửa bộ sưu tập; bỏ id game trùng nhưng giữ thứ tự xuất hiện đầu tiên.
-- Khi sửa: ends_at có mặt trong p_collection (kể cả null) thì ghi đè, thiếu thì giữ; title/starts_at/sort thiếu thì giữ.
create function public.admin_save_collection(p_collection jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  old public.collections;
  cid uuid;
  src jsonb;
  v_title jsonb;
  v_ids text[];
  v_start timestamptz;
  v_end timestamptz;
  v_sort int;
begin
  perform public._require_admin();
  p_collection := coalesce(p_collection, '{}'::jsonb);
  if nullif(p_collection->>'id', '') is not null then
    begin
      cid := (p_collection->>'id')::uuid;
    exception when others then
      raise exception 'not_found';
    end;
    select * into old from public.collections where id = cid for update;
    if not found then raise exception 'not_found'; end if;
  end if;

  src := coalesce(p_collection->'title', old.title);
  v_title := jsonb_strip_nulls(jsonb_build_object(
    'en', btrim(coalesce(src->>'en', '')),
    'vi', nullif(btrim(coalesce(src->>'vi', '')), '')));
  if coalesce(v_title->>'en', '') = '' then raise exception 'bad_title'; end if;

  if p_collection ? 'game_ids' and jsonb_typeof(p_collection->'game_ids') = 'array' then
    select coalesce(array_agg(s.g order by s.o), '{}') into v_ids
    from (select t.g, min(t.o) as o from jsonb_array_elements_text(p_collection->'game_ids') with ordinality t(g, o) group by t.g) s;
  elsif p_collection ? 'game_ids' and jsonb_typeof(p_collection->'game_ids') <> 'null' then
    raise exception 'unknown_game';
  else
    v_ids := coalesce(old.game_ids, '{}');
  end if;
  if exists (select 1 from unnest(v_ids) u(g) where not exists (select 1 from public.games gm where gm.id = u.g)) then
    raise exception 'unknown_game';
  end if;

  begin
    v_start := coalesce((p_collection->>'starts_at')::timestamptz, old.starts_at);
    if p_collection ? 'ends_at' then
      v_end := (p_collection->>'ends_at')::timestamptz;
    else
      v_end := old.ends_at;
    end if;
  exception when others then
    v_start := null;
    v_end := null;
  end;
  if v_start is null or (v_end is not null and v_end <= v_start) then raise exception 'bad_time'; end if;

  begin
    v_sort := coalesce((p_collection->>'sort')::int, old.sort, 0);
  exception when others then
    v_sort := 0;
  end;

  if cid is null then
    insert into public.collections (title, game_ids, starts_at, ends_at, sort)
    values (v_title, v_ids, v_start, v_end, v_sort) returning id into cid;
  else
    update public.collections
    set title = v_title, game_ids = v_ids, starts_at = v_start, ends_at = v_end, sort = v_sort
    where id = cid;
  end if;
  return cid;
end $$;
revoke execute on function public.admin_save_collection(jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_collection(jsonb) to authenticated;

create function public.admin_delete_collection(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  delete from public.collections where id = p_id;
  if not found then raise exception 'not_found'; end if;
end $$;
revoke execute on function public.admin_delete_collection(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_collection(uuid) to authenticated;

-- Danh sách ván cho admin, mới nhất trước; phân trang bằng p_before (started_at của hàng cuối trang trước).
create function public.admin_runs(
  p_game_id text default null,
  p_mode text default null,
  p_user_id uuid default null,
  p_status text default null,
  p_before timestamptz default null,
  p_limit int default 50
)
returns table (
  id uuid, user_id uuid, display_name text, game_id text, mode text, started_at timestamptz, ended_at timestamptz,
  score bigint, time_ms bigint, won boolean, assisted boolean, status text, reject_reason text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public._require_admin();
  return query
  select r.id, r.user_id, pr.display_name, r.game_id, r.mode, r.started_at, r.ended_at,
         r.score, r.time_ms, r.won, r.assisted, r.status, r.reject_reason
  from public.runs r join public.profiles pr on pr.id = r.user_id
  where (p_game_id is null or r.game_id = p_game_id)
    and (p_mode is null or r.mode = p_mode)
    and (p_user_id is null or r.user_id = p_user_id)
    and (p_status is null or r.status = p_status)
    and (p_before is null or r.started_at < p_before)
  order by r.started_at desc, r.id
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end $$;
revoke execute on function public.admin_runs(text, text, uuid, text, timestamptz, int) from public, anon, authenticated;
grant execute on function public.admin_runs(text, text, uuid, text, timestamptz, int) to authenticated;

-- Từ chối một ván (đang chơi hay đã xong). Kết quả sự kiện đã chụp không đổi.
create function public.admin_reject_run(p_run_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.runs
  set status = 'rejected', reject_reason = coalesce(nullif(btrim(p_reason), ''), 'admin')
  where id = p_run_id;
  if not found then raise exception 'not_found'; end if;
end $$;
revoke execute on function public.admin_reject_run(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_reject_run(uuid, text) to authenticated;

-- Tìm người chơi: p_query là uuid thì khớp đúng id, ngược lại tìm theo tên (đã escape %, _, \); rỗng thì người mới nhất trước.
create function public.admin_players(p_query text default null, p_limit int default 50)
returns table (id uuid, display_name text, avatar_url text, role text, banned boolean, created_at timestamptz, runs bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  q text;
begin
  perform public._require_admin();
  q := btrim(coalesce(p_query, ''));
  return query
  select pr.id, pr.display_name, pr.avatar_url, pr.role, pr.banned, pr.created_at,
         (select count(*) from public.runs r where r.user_id = pr.id)
  from public.profiles pr
  where case
          when q = '' then true
          when q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then pr.id = q::uuid
          else pr.display_name ilike '%' || replace(replace(replace(q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
        end
  order by pr.created_at desc, pr.id
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end $$;
revoke execute on function public.admin_players(text, int) from public, anon, authenticated;
grant execute on function public.admin_players(text, int) to authenticated;

create function public.admin_set_banned(p_user_id uuid, p_banned boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_user_id = auth.uid() then raise exception 'cannot_ban_self'; end if;
  update public.profiles set banned = coalesce(p_banned, false) where id = p_user_id;
  if not found then raise exception 'not_found'; end if;
end $$;
revoke execute on function public.admin_set_banned(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_banned(uuid, boolean) to authenticated;
