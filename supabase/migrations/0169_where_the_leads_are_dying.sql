-- Where the leads are dying — the super admin's early warning, across every company.
--
-- WHY THIS EXISTS AND WHY PLATFORM HQ DOES NOT ALREADY COVER IT
--
-- super_hq answers "how busy was each company today": calls, talk time,
-- recordings, funnel. It is an ACTIVITY report, and activity hides decay. On the
-- day this was written the numbers were:
--
--   Manas property   880 leads,  799 going nowhere (91%) — 739 never called at
--                    all, 460 with no owner, every one of them over a week old
--   ankit            327 leads,  282 going nowhere (86%)
--   Fanbe            439 leads,  189 going nowhere (43%) — but almost all of it
--                    is 182 BROKEN CALLBACK PROMISES, not untouched leads
--
-- Both of the top two could make twenty calls tomorrow and look perfectly
-- healthy on HQ. Nothing anywhere says a tenant is sitting on 739 leads it has
-- never once dialled. That is the churn warning the platform owner never gets,
-- and it is what this file is for.
--
-- Fanbe is the reason the buckets are kept apart rather than summed into one
-- "bad leads" figure. Their disease is the opposite of Manas's: they DO call,
-- they just break the promise to call back. Same headline number, completely
-- different thing to say to the admin. A single score would have hidden that.
--
-- COUNTED DISTINCT, NEVER SUMMED
--
-- A lead with no owner is usually also a lead nobody called. Adding the buckets
-- gives Manas 1,271 bad leads out of 880 — a number that is not merely wrong but
-- obviously wrong, which is how a report stops being read. at_risk counts each
-- lead ONCE no matter how many ways it is failing.

-- ── every company, ranked by what is rotting ────────────────────────────────
create or replace function public.super_leaks(
  -- Never called AND older than this is inexcusable rather than merely new.
  p_cold_days int default 7,
  -- A telecaller who has not dialled in this long is not working.
  p_silent_days int default 3
)
returns table (
  company_id uuid,
  company_name text,
  leads_total int,
  -- Distinct leads in at least one bad state. The headline.
  at_risk int,
  at_risk_pct int,
  -- The three diseases, kept apart because each needs a different conversation.
  no_owner int,
  cold int,
  broken_promises int,
  -- Who is meant to be working these.
  telecallers int,
  silent_reps int,
  -- Is this company alive at all?
  last_call_at timestamptz,
  -- WhatsApp observation, as it rolls out. watched = sessions that exist,
  -- stale = sessions that exist but have not reported in two hours.
  wa_watched int,
  wa_stale int
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;

  return query
  with bad as (
    select
      ct.company_id as cid,
      (ct.salesperson_id is null) as f_no_owner,
      (not exists (select 1 from public.call_logs l where l.contact_id = ct.id)
        and ct.created_at < now() - make_interval(days => p_cold_days)) as f_cold,
      exists (
        select 1 from public.follow_ups f
        where f.contact_id = ct.id
          and f.due_at < now() - interval '24 hours'
          and coalesce(f.status, '') not in ('done', 'cancelled')
      ) as f_broken
    from public.contacts ct
  ),
  agg as (
    select cid,
      count(*)::int as t_total,
      count(*) filter (where f_no_owner or f_cold or f_broken)::int as t_at_risk,
      count(*) filter (where f_no_owner)::int as t_no_owner,
      count(*) filter (where f_cold)::int as t_cold,
      count(*) filter (where f_broken)::int as t_broken
    from bad group by cid
  )
  select
    c.id,
    c.name,
    coalesce(a.t_total, 0),
    coalesce(a.t_at_risk, 0),
    -- Share of this company's own book, so a small tenant that is 100% broken
    -- is as visible as a large one that is 20% broken. Both are churn.
    (round(100.0 * coalesce(a.t_at_risk, 0) / greatest(coalesce(a.t_total, 0), 1)))::int,
    coalesce(a.t_no_owner, 0),
    coalesce(a.t_cold, 0),
    coalesce(a.t_broken, 0),
    (select count(*) from public.profiles p
       where p.company_id = c.id and p.role = 'salesperson')::int,
    (select count(*) from public.profiles p
       where p.company_id = c.id and p.role = 'salesperson'
         and not exists (
           select 1 from public.call_logs l
           where l.salesperson_id = p.id
             and coalesce(l.started_at, l.created_at) >= now() - make_interval(days => p_silent_days)
         ))::int,
    (select max(coalesce(l.started_at, l.created_at)) from public.call_logs l
       where l.company_id = c.id and coalesce(l.off_crm, false) = false),
    (select count(*) from public.wa_rep_sessions s where s.company_id = c.id)::int,
    (select count(*) from public.wa_rep_sessions s
       where s.company_id = c.id
         and (s.last_seen_at is null or s.last_seen_at < now() - interval '2 hours'))::int
  from public.companies c
  left join agg a on a.cid = c.id
  order by 4 desc, 2;
end
$function$;

revoke all on function public.super_leaks(int, int) from public, anon;
grant execute on function public.super_leaks(int, int) to authenticated;

-- ── one company's telecallers, so the founder knows WHO to name ─────────────
--
-- "Manas property has 739 uncalled leads" is a fact. "Shweta has 400 of them and
-- has not dialled in six days" is something an admin can act on this afternoon.
create or replace function public.super_leaks_reps(
  p_company uuid,
  p_cold_days int default 7,
  p_silent_days int default 3
)
returns table (
  rep_id uuid,
  rep_name text,
  is_active boolean,
  leads_assigned int,
  cold int,
  broken_promises int,
  calls_7d int,
  last_call_at timestamptz,
  silent boolean,
  -- null when this rep has no observer session at all, so the page can tell
  -- "not watched" apart from "watched and quiet".
  wa_last_seen_at timestamptz
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;

  return query
  select
    p.id,
    p.full_name,
    coalesce(p.is_active, true),
    (select count(*) from public.contacts ct where ct.salesperson_id = p.id)::int,
    (select count(*) from public.contacts ct
       where ct.salesperson_id = p.id
         and ct.created_at < now() - make_interval(days => p_cold_days)
         and not exists (select 1 from public.call_logs l where l.contact_id = ct.id))::int,
    (select count(*) from public.contacts ct
       where ct.salesperson_id = p.id
         and exists (
           select 1 from public.follow_ups f
           where f.contact_id = ct.id
             and f.due_at < now() - interval '24 hours'
             and coalesce(f.status, '') not in ('done', 'cancelled')
         ))::int,
    (select count(*) from public.call_logs l
       where l.salesperson_id = p.id
         and coalesce(l.started_at, l.created_at) >= now() - interval '7 days')::int,
    (select max(coalesce(l.started_at, l.created_at)) from public.call_logs l
       where l.salesperson_id = p.id),
    not exists (
      select 1 from public.call_logs l
      where l.salesperson_id = p.id
        and coalesce(l.started_at, l.created_at) >= now() - make_interval(days => p_silent_days)
    ),
    (select s.last_seen_at from public.wa_rep_sessions s where s.salesperson_id = p.id)
  from public.profiles p
  where p.company_id = p_company and p.role = 'salesperson'
  order by 5 desc, 6 desc, 2;
end
$function$;

revoke all on function public.super_leaks_reps(uuid, int, int) from public, anon;
grant execute on function public.super_leaks_reps(uuid, int, int) to authenticated;
