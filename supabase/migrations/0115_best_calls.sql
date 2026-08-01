-- Best call per rep, per day or per week.
--
-- Deliberately NOT a new score. The AI Coach already rates every call it
-- reviews an honest 1-5 and stores it in coach_feedback, together with what
-- went well and what could improve. Inventing a second "best call" metric
-- would mean two numbers that disagree about the same call, which is exactly
-- the kind of duplicate logic that makes a dashboard untrustworthy. This reads
-- the rating that already exists.
--
-- One row per rep per period: their highest-rated call, longest call breaking a
-- tie (between two 5s, the one they held the customer on is the better piece of
-- work). It carries the coach's own "good" line, so the manager can see WHY it
-- was the best call without opening anything.
--
-- Scope follows the platform rule: the super admin sees every company, an admin
-- sees only their own. Periods are cut in IST, because that is the working day
-- the reps actually have.
create or replace function public.best_calls(p_period text default 'day', p_days int default 14)
returns table(
  company_id uuid,
  company_name text,
  salesperson_id uuid,
  rep_name text,
  period_start date,
  call_id uuid,
  rating smallint,
  started_at timestamptz,
  duration_seconds int,
  contact_id uuid,
  contact_name text,
  phone text,
  good text,
  improve text,
  has_recording boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with scope as (
    select public.is_super_admin() as is_super,
           public.is_admin()       as is_adm,
           public.current_company_id() as cid
  ),
  win as (select now() - make_interval(days => greatest(p_days, 1)) as since),
  base as (
    select
      cf.company_id, cf.salesperson_id, cf.call_id, cf.rating, cf.good, cf.improve,
      cl.started_at, cl.duration_seconds, cl.contact_id, cl.phone,
      (cl.recording_status = 'ready') as has_rec,
      case
        when p_period = 'week'
          then (date_trunc('week', cl.started_at at time zone 'Asia/Kolkata'))::date
        else (cl.started_at at time zone 'Asia/Kolkata')::date
      end as period_start
    from public.coach_feedback cf
    join public.call_logs cl on cl.id = cf.call_id
    cross join scope s
    where cf.rating is not null
      and cl.started_at >= (select since from win)
      and (s.is_super or (s.is_adm and cf.company_id = s.cid))
  )
  select distinct on (b.salesperson_id, b.period_start)
    b.company_id,
    co.name::text,
    b.salesperson_id,
    p.full_name::text,
    b.period_start,
    b.call_id,
    b.rating,
    b.started_at,
    b.duration_seconds,
    b.contact_id,
    c.name::text,
    b.phone,
    b.good,
    b.improve,
    b.has_rec
  from base b
  left join public.companies co on co.id = b.company_id
  left join public.profiles  p  on p.id  = b.salesperson_id
  left join public.contacts  c  on c.id  = b.contact_id
  order by b.salesperson_id, b.period_start desc, b.rating desc, b.duration_seconds desc nulls last
$$;

grant execute on function public.best_calls(text, int) to authenticated;
