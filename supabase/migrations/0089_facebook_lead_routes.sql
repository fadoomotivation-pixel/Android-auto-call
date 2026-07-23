-- Facebook lead-form -> company routing.
--
-- The platform runs ONE central Facebook business (Call Pro AI) whose ad
-- campaigns generate leads for MANY companies (e.g. a "Jewar Airport" form is
-- really Manas Property's, "samaypur" is another company's). The webhook used to
-- route a lead by the PAGE it came from, so every lead landed in the one company
-- whose page was connected. This table lets the super admin map each lead FORM
-- to the company (and optionally the exact rep) it belongs to, so leads flow to
-- the right team regardless of which page/business ran the ad.

create table if not exists public.facebook_lead_routes (
  form_id        text primary key,
  company_id     uuid not null references public.companies(id) on delete cascade,
  salesperson_id uuid references public.profiles(id) on delete set null,
  form_name      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists facebook_lead_routes_company_idx
  on public.facebook_lead_routes (company_id);

alter table public.facebook_lead_routes enable row level security;

-- Super admin (platform_admins) manages every route.
drop policy if exists fb_routes_super_all on public.facebook_lead_routes;
create policy fb_routes_super_all on public.facebook_lead_routes
  for all to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()))
  with check (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));

-- A company admin may READ the routes that point at their own company.
drop policy if exists fb_routes_company_read on public.facebook_lead_routes;
create policy fb_routes_company_read on public.facebook_lead_routes
  for select to authenticated
  using (company_id = (select company_id from public.profiles where id = auth.uid()));
