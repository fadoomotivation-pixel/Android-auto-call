-- ============================================================
-- Soft-delete campaigns (contacts + notes survive) and a rich
-- contact-details view for admins / super admins.
-- ============================================================
alter table public.campaigns add column if not exists deleted_at timestamptz;

create or replace view public.v_campaign_stats
with (security_invoker = true) as
select
  c.id as campaign_id, c.company_id, c.salesperson_id, c.name, c.gap_seconds, c.created_at,
  count(ct.id)                                                            as total,
  count(ct.id) filter (where ct.status <> 'new' and ct.status <> 'queued') as completed
from public.campaigns c
left join public.contacts ct on ct.campaign_id = c.id
where c.deleted_at is null
group by c.id;

create or replace view public.v_contact_details
with (security_invoker = true) as
select
  ct.id, ct.company_id, co.name as company_name,
  ct.campaign_id, ca.name as campaign_name, (ca.deleted_at is not null) as campaign_deleted,
  ct.salesperson_id, p.full_name as salesperson_name,
  ct.name, ct.phone, ct.email, ct.company_name as contact_company,
  ct.status, ct.notes, ct.created_at
from public.contacts ct
left join public.companies co on co.id = ct.company_id
left join public.campaigns ca on ca.id = ct.campaign_id
left join public.profiles  p  on p.id  = ct.salesperson_id;

grant select on public.v_contact_details to authenticated;
