-- ============================================================
-- Platform HQ (super admin in the Android app)
--
-- The super admin's daily oversight loop, phone-first: one RPC per screen so
-- the app gets everything in a single round trip. All three are SECURITY
-- DEFINER but hard-gated on is_super_admin() — a company admin or telecaller
-- calling them gets an error, never data.
-- ============================================================

-- Per-company scoreboard: who's alive today, across the whole platform.
create or replace function public.super_hq()
returns table (
  company_id uuid, company_name text, telecallers int,
  leads_total int, leads_new int,
  calls_today int, connected_today int, talk_today int, recordings_today int,
  last_call_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
declare d timestamptz := ((now() at time zone 'Asia/Kolkata')::date) at time zone 'Asia/Kolkata';
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

-- One company's telecallers: today's work per rep.
create or replace function public.super_hq_reps(p_company uuid)
returns table (
  rep_id uuid, rep_name text, rep_phone text, is_active boolean,
  leads_assigned int, calls_today int, connected_today int, talk_today int,
  recordings_today int, last_call_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
declare d timestamptz := ((now() at time zone 'Asia/Kolkata')::date) at time zone 'Asia/Kolkata';
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

-- One company's latest calls, ready to play (rep + lead names resolved).
create or replace function public.super_hq_calls(p_company uuid, p_limit int default 30)
returns table (
  call_id uuid, rep_name text, lead_name text, phone text,
  direction text, outcome text, duration_seconds int,
  recording_status text, off_crm boolean, summary text, started_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  select cl.id, p.full_name, ct.name, cl.phone,
    cl.direction, cl.outcome, cl.duration_seconds,
    cl.recording_status, cl.off_crm, cl.summary, coalesce(cl.started_at, cl.created_at)
  from public.call_logs cl
  left join public.profiles p on p.id = cl.salesperson_id
  left join public.contacts ct on ct.id = cl.contact_id
  where cl.company_id = p_company
  order by coalesce(cl.started_at, cl.created_at) desc
  limit least(greatest(p_limit, 1), 100);
end $$;

revoke execute on function public.super_hq() from public, anon;
revoke execute on function public.super_hq_reps(uuid) from public, anon;
revoke execute on function public.super_hq_calls(uuid, int) from public, anon;
grant execute on function public.super_hq() to authenticated;
grant execute on function public.super_hq_reps(uuid) to authenticated;
grant execute on function public.super_hq_calls(uuid, int) to authenticated;
