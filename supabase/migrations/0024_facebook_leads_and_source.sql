-- ============================================================
-- Facebook Lead Ads Integration
-- Adds lead_source tracking and a table for Meta API credentials
-- ============================================================

-- Add lead source tracking to contacts
alter table public.contacts 
  add column if not exists lead_source text,
  add column if not exists lead_source_id text;

-- Index for querying by source
create index if not exists idx_contacts_lead_source on public.contacts(lead_source);
create index if not exists idx_contacts_lead_source_id on public.contacts(lead_source_id);

-- Facebook Integrations table
create table if not exists public.facebook_integrations (
  company_id        uuid primary key references public.companies(id) on delete cascade,
  page_id           text not null,
  page_access_token text not null,
  verify_token      text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.facebook_integrations enable row level security;

-- Only admins can manage the integration for their company
create policy "fb_integration_select" on public.facebook_integrations
  for select to authenticated
  using (company_id = public.current_company_id() and public.is_admin());

create policy "fb_integration_insert" on public.facebook_integrations
  for insert to authenticated
  with check (company_id = public.current_company_id() and public.is_admin());

create policy "fb_integration_update" on public.facebook_integrations
  for update to authenticated
  using (company_id = public.current_company_id() and public.is_admin())
  with check (company_id = public.current_company_id());

create policy "fb_integration_delete" on public.facebook_integrations
  for delete to authenticated
  using (company_id = public.current_company_id() and public.is_admin());

-- Webhook needs to look up company by page_id (using service role)
create index if not exists idx_fb_integration_page on public.facebook_integrations(page_id);
