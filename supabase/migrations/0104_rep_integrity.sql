-- Integrity check: the handful of patterns in a telecaller's own work that are
-- worth an owner's attention.
--
-- Every flag is a QUESTION, never a verdict. Each one has an innocent
-- explanation as often as not — a rep whose recorder broke, a buyer who really
-- did say no after ten minutes, a site visit logged from the office because the
-- phone had no signal. So the function returns the evidence (how many, which
-- lead, when) rather than a score, and the page says out loud that a flag means
-- "go listen to this call", not "this person is stealing".
--
-- It only looks at work the company already records: calls on the work phone,
-- funnel changes, site visits, and calls to numbers outside the CRM on a company
-- that has record-all-calls switched on. It cannot see a rep's personal
-- WhatsApp, and nothing here tries to.
--
-- Isolation: security definer, but it re-checks the caller — a platform super
-- admin sees every company, a company admin only their own, anyone else nothing.
create or replace function public.rep_integrity(p_days int default 30)
returns table (
  company_id uuid,
  company_name text,
  salesperson_id uuid,
  rep_name text,
  flag text,
  n int,
  sample text,
  last_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (
    select public.is_super_admin() as is_super,
           public.is_admin()       as is_adm,
           public.current_company_id() as cid
  ),
  since as (select now() - make_interval(days => greatest(p_days, 1)) as t),
  reps as (
    select p.id, p.full_name::text as name, p.company_id, c.name::text as company_name
    from public.profiles p
    cross join scope s
    left join public.companies c on c.id = p.company_id
    where p.role = 'salesperson'
      and p.company_id is not null
      and (s.is_super or (s.is_adm and p.company_id = s.cid))
  ),

  -- 1. Talked for a full minute and wrote nothing down. The lead looks untouched
  --    to everyone else, which is how a good lead gets quietly kept aside.
  talked as (
    select r.id as rep, 'talked_no_outcome' as flag, count(*)::int as n,
           max(cl.started_at) as last_at,
           (array_agg(coalesce(ct.name, cl.phone) order by cl.started_at desc))[1] as sample
    from reps r
    join public.call_logs cl on cl.salesperson_id = r.id
    join public.contacts ct on ct.id = cl.contact_id
    where cl.started_at >= (select t from since)
      and coalesce(cl.duration_seconds, 0) >= 60
      and (ct.handled_at is null or ct.handled_at < cl.started_at)
    group by r.id
  ),

  -- 2. A long conversation that ends as "not interested". Sometimes true, but it
  --    is also exactly what parking a live lead looks like.
  killed as (
    select r.id as rep, 'long_call_then_dead' as flag, count(*)::int as n,
           max(cl.started_at) as last_at,
           (array_agg(coalesce(ct.name, cl.phone) order by cl.started_at desc))[1] as sample
    from reps r
    join public.call_logs cl on cl.salesperson_id = r.id
    join public.contacts ct on ct.id = cl.contact_id
    where cl.started_at >= (select t from since)
      and coalesce(cl.duration_seconds, 0) >= 120
      and ct.status::text in ('not_interested', 'lost', 'dnc')
      and ct.updated_at >= cl.started_at
      and ct.updated_at <= cl.started_at + interval '1 day'
    group by r.id
  ),

  -- 3. Site visit claimed, GPS never confirmed it. Visits are what incentives
  --    are paid on, so an unverified one is worth asking about.
  visits as (
    select r.id as rep, 'visit_unverified' as flag, count(*)::int as n,
           max(ct.site_visit_at) as last_at,
           (array_agg(coalesce(ct.name, ct.phone) order by ct.site_visit_at desc))[1] as sample
    from reps r
    join public.contacts ct on ct.salesperson_id = r.id
    where ct.site_visit_at >= (select t from since)
      and coalesce(ct.site_visit_verified, false) = false
    group by r.id
  ),

  -- 4. Connected calls with no recording, but ONLY for reps whose recorder
  --    demonstrably works — otherwise this just re-reports a broken phone, which
  --    Phone Health already covers.
  works as (
    select cl.salesperson_id as rep, count(*)::int as ok
    from public.call_logs cl
    where cl.started_at >= (select t from since) and cl.recording_status = 'ready'
    group by cl.salesperson_id
  ),
  norec as (
    select r.id as rep, 'missing_recording' as flag, count(*)::int as n,
           max(cl.started_at) as last_at,
           (array_agg(coalesce(ct.name, cl.phone) order by cl.started_at desc))[1] as sample
    from reps r
    join works w on w.rep = r.id and w.ok >= 3
    join public.call_logs cl on cl.salesperson_id = r.id
    left join public.contacts ct on ct.id = cl.contact_id
    where cl.started_at >= (select t from since)
      and coalesce(cl.duration_seconds, 0) >= 60
      and cl.recording_status <> 'ready'
    group by r.id
  ),

  -- 5. The same number outside the CRM, called again and again, at length. One
  --    personal call is nobody's business; a number worked like a lead is.
  offcrm as (
    select rep, 'offcrm_repeat' as flag, count(*)::int as n,
           max(last_at) as last_at,
           (array_agg(phone order by last_at desc))[1] as sample
    from (
      select cl.salesperson_id as rep, cl.phone,
             count(*) as calls, sum(coalesce(cl.duration_seconds, 0)) as secs,
             max(cl.started_at) as last_at
      from public.call_logs cl
      join reps r on r.id = cl.salesperson_id
      where cl.started_at >= (select t from since)
        and coalesce(cl.off_crm, false)
      group by cl.salesperson_id, cl.phone
      having count(*) >= 3 and sum(coalesce(cl.duration_seconds, 0)) >= 300
    ) t
    group by rep
  ),

  -- 6. A booking with no call behind it anywhere in the CRM.
  ghost as (
    select r.id as rep, 'booked_without_calls' as flag, count(*)::int as n,
           max(ct.updated_at) as last_at,
           (array_agg(coalesce(ct.name, ct.phone) order by ct.updated_at desc))[1] as sample
    from reps r
    join public.contacts ct on ct.salesperson_id = r.id
    where ct.status::text in ('booked', 'token_paid')
      and ct.updated_at >= (select t from since)
      and not exists (select 1 from public.call_logs cl where cl.contact_id = ct.id)
    group by r.id
  ),

  all_flags as (
    select * from talked
    union all select * from killed
    union all select * from visits
    union all select * from norec
    union all select * from offcrm
    union all select * from ghost
  )
  select r.company_id, r.company_name, r.id, r.name, f.flag, f.n, f.sample, f.last_at
  from all_flags f
  join reps r on r.id = f.rep
  where f.n > 0
$$;

grant execute on function public.rep_integrity(int) to authenticated;
