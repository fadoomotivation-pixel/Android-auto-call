-- ============================================================
-- Campaigns: a named batch of contacts a salesperson auto-dials.
-- ============================================================
create table if not exists public.campaigns (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  salesperson_id uuid not null references public.profiles(id) on delete cascade,
  name           text not null,
  gap_seconds    integer not null default 5,
  status         text not null default 'active',
  created_at     timestamptz not null default now()
);
create index if not exists idx_campaigns_company on public.campaigns(company_id);
create index if not exists idx_campaigns_sales   on public.campaigns(salesperson_id);

alter table public.contacts  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
alter table public.call_logs add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
create index if not exists idx_contacts_campaign on public.contacts(campaign_id);
create index if not exists idx_calllogs_campaign on public.call_logs(campaign_id);

alter table public.campaigns enable row level security;

drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns for select to authenticated
  using (company_id = public.current_company_id()
         and (public.is_admin() or salesperson_id = auth.uid()));

drop policy if exists campaigns_insert on public.campaigns;
create policy campaigns_insert on public.campaigns for insert to authenticated
  with check (company_id = public.current_company_id() and salesperson_id = auth.uid());

drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns for update to authenticated
  using (company_id = public.current_company_id()
         and (public.is_admin() or salesperson_id = auth.uid()));

drop policy if exists campaigns_delete on public.campaigns;
create policy campaigns_delete on public.campaigns for delete to authenticated
  using (company_id = public.current_company_id()
         and (public.is_admin() or salesperson_id = auth.uid()));

create or replace view public.v_campaign_stats
with (security_invoker = true) as
select
  c.id             as campaign_id,
  c.company_id,
  c.salesperson_id,
  c.name,
  c.gap_seconds,
  c.created_at,
  count(ct.id)                                                            as total,
  count(ct.id) filter (where ct.status <> 'new' and ct.status <> 'queued') as completed
from public.campaigns c
left join public.contacts ct on ct.campaign_id = c.id
group by c.id;

grant select on public.v_campaign_stats to authenticated;
