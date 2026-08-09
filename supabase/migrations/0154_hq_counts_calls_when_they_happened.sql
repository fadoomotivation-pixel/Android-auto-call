-- Platform HQ and the Daily Pulse must not give different answers.
--
-- "Sync heartbeat, daily pulse, call logs, sales velocity, sales xray — inme se
--  ye sab koi apas me jhagad to nahi rahe?"
--
-- Yes. Two of them, badly, and it is visible right now. For Ankita on 8 Aug:
--
--   Platform HQ  →  119 calls today
--   Daily Pulse  →    0 calls today
--   of those 119, NINETY-SEVEN are calls from previous days
--
-- Same rep, same day, same database. A founder reading both is entitled to
-- conclude the CRM is broken, and they would be right.
--
-- TWO DIFFERENT MISTAKES, BOTH IN THE HQ FUNCTIONS.
--
-- 1. created_at instead of started_at. created_at is when the ROW reached the
--    CRM; started_at is when the CALL happened. They are the same thing right
--    up until a phone syncs late — and then they are wildly different, because
--    the call-log sync backfills a week of history in one run and every one of
--    those rows is created today. Ankita's handset did exactly that yesterday:
--    118 calls uploaded in a single sync after three days dark. HQ read that as
--    a 119-call day.
--
--    _shared/pulse.ts already carries this exact warning, written after the
--    same thing happened to the founder's report:
--
--      "started_at, not created_at: the phone's call-log sync backfills a week
--       of history the first time it runs, and every one of those rows is
--       created TODAY — which reported a whole week as one day's work."
--
--    The lesson was learned in the Pulse and never applied to Platform HQ.
--
-- 2. off_crm counted as work. Under record-all-calls a rep's personal calls are
--    logged too, flagged off_crm. The Pulse, lead_velocity and super_hq_calls
--    all exclude them; super_hq, super_hq_reps and super_hq_rep_trend counted
--    them as telecalling.
--
-- coalesce(started_at, created_at) rather than bare started_at: the column is
-- nullable, and a row with no start time should still be counted somewhere
-- rather than silently vanishing from HQ the day this ships. It matches
-- stamp_last_contacted (0081), which resolves "when did this call happen" the
-- same way.
--
-- Signatures are unchanged — same parameters, same return columns, same order —
-- so the Platform HQ page needs no deploy to pick this up.

create or replace function public.super_hq(p_range text default 'today')
returns table(company_id uuid, company_name text, telecallers integer, leads_total integer,
              leads_new integer, calls_today integer, connected_today integer, talk_today integer,
              recordings_today integer, last_call_at timestamp with time zone)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare d timestamptz := public.hq_since(p_range);
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  select c.id, c.name,
    (select count(*) from public.profiles p where p.company_id = c.id and p.role = 'salesperson')::int,
    (select count(*) from public.contacts ct where ct.company_id = c.id)::int,
    (select count(*) from public.contacts ct where ct.company_id = c.id and ct.stage = 'new')::int,
    (select count(*) from public.call_logs cl where cl.company_id = c.id
       and coalesce(cl.started_at, cl.created_at) >= d and coalesce(cl.off_crm, false) = false)::int,
    (select count(*) from public.call_logs cl where cl.company_id = c.id
       and coalesce(cl.started_at, cl.created_at) >= d and coalesce(cl.off_crm, false) = false
       and cl.outcome = 'connected')::int,
    coalesce((select sum(cl.duration_seconds) from public.call_logs cl where cl.company_id = c.id
       and coalesce(cl.started_at, cl.created_at) >= d and coalesce(cl.off_crm, false) = false), 0)::int,
    (select count(*) from public.call_logs cl where cl.company_id = c.id
       and coalesce(cl.started_at, cl.created_at) >= d and coalesce(cl.off_crm, false) = false
       and cl.recording_status = 'ready')::int,
    (select max(coalesce(cl.started_at, cl.created_at)) from public.call_logs cl
       where cl.company_id = c.id and coalesce(cl.off_crm, false) = false)
  from public.companies c
  order by 6 desc, 2;
end $function$;

create or replace function public.super_hq_reps(p_company uuid, p_range text default 'today')
returns table(rep_id uuid, rep_name text, rep_phone text, is_active boolean, leads_assigned integer,
              calls_today integer, connected_today integer, talk_today integer,
              recordings_today integer, last_call_at timestamp with time zone)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare d timestamptz := public.hq_since(p_range);
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  select p.id, p.full_name, p.phone, p.is_active,
    (select count(*) from public.contacts ct where ct.salesperson_id = p.id)::int,
    (select count(*) from public.call_logs cl where cl.salesperson_id = p.id
       and coalesce(cl.started_at, cl.created_at) >= d and coalesce(cl.off_crm, false) = false)::int,
    (select count(*) from public.call_logs cl where cl.salesperson_id = p.id
       and coalesce(cl.started_at, cl.created_at) >= d and coalesce(cl.off_crm, false) = false
       and cl.outcome = 'connected')::int,
    coalesce((select sum(cl.duration_seconds) from public.call_logs cl where cl.salesperson_id = p.id
       and coalesce(cl.started_at, cl.created_at) >= d and coalesce(cl.off_crm, false) = false), 0)::int,
    (select count(*) from public.call_logs cl where cl.salesperson_id = p.id
       and coalesce(cl.started_at, cl.created_at) >= d and coalesce(cl.off_crm, false) = false
       and cl.recording_status = 'ready')::int,
    (select max(coalesce(cl.started_at, cl.created_at)) from public.call_logs cl
       where cl.salesperson_id = p.id and coalesce(cl.off_crm, false) = false)
  from public.profiles p
  where p.company_id = p_company and p.role = 'salesperson'
  order by 6 desc, 2;
end $function$;

-- The 7-day chart had the worst version of this: bucketed by created_at, one
-- late sync puts a whole week of calls on today's bar and leaves the previous
-- six empty — the exact opposite of what a trend line is for.
create or replace function public.super_hq_rep_trend(p_company uuid, p_days integer default 7)
returns table(rep_id uuid, day date, calls integer)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare lo timestamptz := (((now() at time zone 'Asia/Kolkata')::date) - (greatest(p_days, 1) - 1))::timestamp at time zone 'Asia/Kolkata';
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  select cl.salesperson_id,
         ((coalesce(cl.started_at, cl.created_at) at time zone 'Asia/Kolkata')::date),
         count(*)::int
  from public.call_logs cl
  join public.profiles p on p.id = cl.salesperson_id
  where p.company_id = p_company and p.role = 'salesperson'
    and coalesce(cl.started_at, cl.created_at) >= lo
    and coalesce(cl.off_crm, false) = false
  group by cl.salesperson_id, 2;
end $function$;
