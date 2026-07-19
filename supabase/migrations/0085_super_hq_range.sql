-- Platform HQ was hard-scoped to "today (IST)", so the whole board read 0
-- whenever no calls had been made yet on the current day. Add a time range
-- (today / 7d / 30d / all) so the super admin always sees real numbers, with
-- "today" staying the default. The latest-calls RPC is already range-free
-- (it's just the newest N), so only the two scoreboard RPCs change.

drop function if exists public.super_hq();
drop function if exists public.super_hq_reps(uuid);

-- Maps a range label to its lower bound. 'all' → epoch; default → today IST.
create or replace function public.hq_since(p_range text)
returns timestamptz language sql immutable as $$
  select case lower(coalesce(p_range, 'today'))
    when 'all'  then 'epoch'::timestamptz
    when '30d'  then now() - interval '30 days'
    when '7d'   then now() - interval '7 days'
    else ((now() at time zone 'Asia/Kolkata')::date) at time zone 'Asia/Kolkata'
  end
$$;

create or replace function public.super_hq(p_range text default 'today')
returns table (
  company_id uuid, company_name text, telecallers int,
  leads_total int, leads_new int,
  calls_today int, connected_today int, talk_today int, recordings_today int,
  last_call_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
declare d timestamptz := public.hq_since(p_range);
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  select c.id, c.name,
    (select count(*) from public.profiles p where p.company_id = c.id and p.role = 'salesperson')::int,
    (select count(*) from public.contacts ct where ct.company_id = c.id)::int,
    (select count(*) from public.contacts ct where ct.company_id = c.id and ct.status in ('new', 'queued'))::int,
    (select count(*) from public.call_logs cl where cl.company_id = c.id and cl.created_at >= d)::int,
    (select count(*) from public.call_logs cl where cl.company_id = c.id and cl.created_at >= d and cl.outcome = 'connected')::int,
    coalesce((select sum(cl.duration_seconds) from public.call_logs cl where cl.company_id = c.id and cl.created_at >= d), 0)::int,
    (select count(*) from public.call_logs cl where cl.company_id = c.id and cl.created_at >= d and cl.recording_status = 'ready')::int,
    (select max(cl.created_at) from public.call_logs cl where cl.company_id = c.id)
  from public.companies c
  order by 6 desc, 2;
end $$;

create or replace function public.super_hq_reps(p_company uuid, p_range text default 'today')
returns table (
  rep_id uuid, rep_name text, rep_phone text, is_active boolean,
  leads_assigned int, calls_today int, connected_today int, talk_today int,
  recordings_today int, last_call_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
declare d timestamptz := public.hq_since(p_range);
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  select p.id, p.full_name, p.phone, p.is_active,
    (select count(*) from public.contacts ct where ct.salesperson_id = p.id)::int,
    (select count(*) from public.call_logs cl where cl.salesperson_id = p.id and cl.created_at >= d)::int,
    (select count(*) from public.call_logs cl where cl.salesperson_id = p.id and cl.created_at >= d and cl.outcome = 'connected')::int,
    coalesce((select sum(cl.duration_seconds) from public.call_logs cl where cl.salesperson_id = p.id and cl.created_at >= d), 0)::int,
    (select count(*) from public.call_logs cl where cl.salesperson_id = p.id and cl.created_at >= d and cl.recording_status = 'ready')::int,
    (select max(cl.created_at) from public.call_logs cl where cl.salesperson_id = p.id)
  from public.profiles p
  where p.company_id = p_company and p.role = 'salesperson'
  order by 6 desc, 2;
end $$;

revoke execute on function public.super_hq(text) from public, anon;
revoke execute on function public.super_hq_reps(uuid, text) from public, anon;
grant execute on function public.super_hq(text) to authenticated;
grant execute on function public.super_hq_reps(uuid, text) to authenticated;
