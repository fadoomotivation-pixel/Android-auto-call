-- ============================================================
-- Platform HQ extras (super admin only):
--  1. super_hq_funnel  — lead conversion funnel (snapshot by stage)
--  2. super_hq_rep_trend — per-rep daily call counts for a mini trend chart
-- Both SECURITY DEFINER, hard-gated on is_super_admin().
-- ============================================================

-- Cumulative funnel: total → contacted → interested+ → site-visit+ → booked.
-- p_company NULL = whole platform; otherwise one company.
create or replace function public.super_hq_funnel(p_company uuid default null)
returns table (leads_total int, contacted int, interested int, site_visit int, booked int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  select
    count(*)::int,
    count(*) filter (where ct.last_contacted_at is not null or ct.status not in ('new','queued'))::int,
    count(*) filter (where ct.status in ('interested','site_visit','negotiation','proposal','token_paid','booked'))::int,
    count(*) filter (where ct.status in ('site_visit','negotiation','proposal','token_paid','booked'))::int,
    count(*) filter (where ct.status = 'booked')::int
  from public.contacts ct
  where p_company is null or ct.company_id = p_company;
end $$;

-- Per-rep daily call counts over the last p_days (IST days). Only days with
-- calls are returned; the client fills the rest with zero.
create or replace function public.super_hq_rep_trend(p_company uuid, p_days int default 7)
returns table (rep_id uuid, day date, calls int)
language plpgsql stable security definer set search_path = public as $$
declare lo timestamptz := (((now() at time zone 'Asia/Kolkata')::date) - (greatest(p_days, 1) - 1))::timestamp at time zone 'Asia/Kolkata';
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  select cl.salesperson_id, ((cl.created_at at time zone 'Asia/Kolkata')::date), count(*)::int
  from public.call_logs cl
  join public.profiles p on p.id = cl.salesperson_id
  where p.company_id = p_company and p.role = 'salesperson' and cl.created_at >= lo
  group by cl.salesperson_id, 2;
end $$;

revoke execute on function public.super_hq_funnel(uuid) from public, anon;
revoke execute on function public.super_hq_rep_trend(uuid, int) from public, anon;
grant execute on function public.super_hq_funnel(uuid) to authenticated;
grant execute on function public.super_hq_rep_trend(uuid, int) to authenticated;
