-- Speed-to-lead engine: for every lead, how long until the FIRST real call, and
-- what became of it. This is the single biggest lever in lead-gen sales — a lead
-- called in 5 minutes converts many times better than one called next day — and
-- nothing in the CRM measured it until now. Powers the Sales Velocity page via
-- the sales-velocity edge function.
--
-- Isolation: security definer, but it re-checks the caller — a platform super
-- admin sees every company, a company admin only their own, anyone else nothing.
create or replace function public.lead_velocity(p_days int default 30)
returns table (
  company_id uuid,
  company_name text,
  salesperson_id uuid,
  rep_name text,
  lead_id uuid,
  source text,
  created_at timestamptz,
  first_call_at timestamptz,
  minutes_to_first_call numeric,
  calls int,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
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
    c.status::text
  from public.contacts c
  cross join scope s
  left join public.companies co on co.id = c.company_id
  left join public.profiles p on p.id = c.salesperson_id
  left join lateral (
    select min(cl.started_at) as first_at, count(*)::int as n
    from public.call_logs cl
    where cl.contact_id = c.id
      and coalesce(cl.off_crm, false) = false
  ) fc on true
  where c.created_at >= now() - make_interval(days => greatest(p_days, 1))
    and (s.is_super or (s.is_adm and c.company_id = s.cid))
$$;

grant execute on function public.lead_velocity(int) to authenticated;
