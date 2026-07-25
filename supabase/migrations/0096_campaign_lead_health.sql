-- Per-campaign follow-up health: were this campaign's leads actually WORKED?
--
-- Without this, an ad advisor judges a campaign by outcomes that depend on
-- whether anyone picked up the phone — and tells you to pause a perfectly good
-- ad because the team never called its leads. This joins each Meta campaign
-- (contacts.extra->>'campaign_id', stamped at import) to how fast, and whether,
-- its leads were called — so "bad ad" can be told apart from "bad follow-up".
--
-- Isolation: security definer, re-checks the caller — super admin sees all
-- companies, a company admin only their own.
create or replace function public.campaign_lead_health(p_days int default 30)
returns table (
  campaign_id text,
  leads bigint,
  never_called bigint,
  called_in_30m bigint,
  median_minutes numeric,
  advanced bigint
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
  ),
  base as (
    select
      c.extra->>'campaign_id' as campaign_id,
      c.status::text as status,
      (select min(cl.started_at) from public.call_logs cl
        where cl.contact_id = c.id and coalesce(cl.off_crm, false) = false) as first_at,
      c.created_at
    from public.contacts c
    cross join scope s
    where c.created_at >= now() - make_interval(days => greatest(p_days, 1))
      and c.extra->>'campaign_id' is not null
      and (s.is_super or (s.is_adm and c.company_id = s.cid))
  )
  select
    campaign_id,
    count(*) as leads,
    count(*) filter (where first_at is null) as never_called,
    count(*) filter (
      where first_at is not null
        and extract(epoch from (first_at - created_at)) / 60.0 <= 30
    ) as called_in_30m,
    round(percentile_cont(0.5) within group (
      order by extract(epoch from (first_at - created_at)) / 60.0
    ) filter (where first_at is not null)::numeric, 1) as median_minutes,
    count(*) filter (
      where status in ('interested','site_visit','negotiation','proposal','token_paid','booked')
    ) as advanced
  from base
  group by campaign_id
$$;

grant execute on function public.campaign_lead_health(int) to authenticated;
