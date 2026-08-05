-- Sales Velocity gets a drill-down, from the SAME rows the chart is built from.
--
-- The bands on that page — 0-5 min, 5-30, 30 min-2 hrs, 2-24 hrs, 24 hrs+, and
-- "never called" — are bucketed in TypeScript inside the sales-velocity edge
-- function, from the per-lead rows this function returns. So the honest way to
-- make the bands clickable is to hand the page the same rows and let it apply
-- the same rule, NOT to write a second query that filters by band.
--
-- A separate "give me the leads in bucket 3" function would be a second
-- definition of what bucket 3 means. The first time someone changed a boundary
-- the chart would say 45 leads and the drill-down would list 47, and there is
-- no way to tell from the screen which one is lying.
--
-- Four columns are added, and nothing existing changes:
--
--   name, phone   — a lead the manager can recognise and ring. The chart never
--                   needed them; a list of leads is useless without them.
--   last_call_at  — first_call_at answers "how fast did we start", this answers
--                   "when did anyone last try". A lead called once on day one
--                   and forgotten looks identical to a healthy one otherwise.
--   next_due_at   — the next booked follow-up, which is the actual "next
--                   action". Null here on a lead that has been called is the
--                   real leak: someone spoke to them and booked nothing.
--
-- DROP then CREATE, because a RETURNS TABLE signature cannot be changed by
-- CREATE OR REPLACE. The gap is one statement inside one transaction; the edge
-- function retries on its next load.

drop function if exists public.lead_velocity(integer);

create function public.lead_velocity(p_days integer default 30)
returns table(
  company_id uuid,
  company_name text,
  salesperson_id uuid,
  rep_name text,
  lead_id uuid,
  source text,
  created_at timestamptz,
  first_call_at timestamptz,
  minutes_to_first_call numeric,
  calls integer,
  status text,
  -- added for the drill-down
  name text,
  phone text,
  last_call_at timestamptz,
  next_due_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with scope as (
    select public.is_super_admin() as is_super,
           public.is_admin() as is_adm,
           public.current_company_id() as cid
  )
  select
    c.company_id,
    co.name::text,
    c.salesperson_id,
    p.full_name::text,
    c.id,
    coalesce(c.lead_source, 'manual')::text,
    c.created_at,
    fc.first_at,
    case when fc.first_at is not null
         then round((extract(epoch from (fc.first_at - c.created_at)) / 60.0)::numeric, 1)
    end,
    coalesce(fc.n, 0)::int,
    c.status::text,
    c.name::text,
    c.phone::text,
    fc.last_at,
    nf.due_at
  from public.contacts c
  cross join scope s
  left join public.companies co on co.id = c.company_id
  left join public.profiles p on p.id = c.salesperson_id
  left join lateral (
    -- One pass for first, last and count. off_crm calls are excluded exactly as
    -- before: a rep's personal call to their own number is not lead contact.
    select min(cl.started_at) as first_at,
           max(cl.started_at) as last_at,
           count(*)::int as n
    from public.call_logs cl
    where cl.contact_id = c.id
      and coalesce(cl.off_crm, false) = false
  ) fc on true
  left join lateral (
    -- The NEXT thing booked, not the last thing promised. A completed callback
    -- is history; this column answers "is anything scheduled".
    select min(f.due_at) as due_at
    from public.follow_ups f
    where f.contact_id = c.id and f.completed_at is null
  ) nf on true
  where c.created_at >= now() - make_interval(days => greatest(p_days, 1))
    and (s.is_super or (s.is_adm and c.company_id = s.cid))
$function$;

comment on function public.lead_velocity(integer) is
  'Per-lead response times for Sales Velocity. The chart buckets these rows in the sales-velocity '
  'edge function and the drill-down filters the same rows with the same rule — there is deliberately '
  'no second, band-filtered query that could disagree with the chart above it.';
