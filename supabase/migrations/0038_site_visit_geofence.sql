-- ============================================================
-- Site-visit geo-fencing
--   A company's projects each get a pinned location (lat/lng) and a
--   radius. When a rep taps "Arrived at Site" the app compares their GPS
--   to the project's pin and stamps a *verified* arrival on the lead —
--   so a site visit can't be faked from the office.
-- ============================================================

create table if not exists public.project_sites (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  lat         double precision not null,
  lng         double precision not null,
  radius_m    integer not null default 200,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One pin per (company, project name), case-insensitive.
create unique index if not exists uq_project_sites_company_name
  on public.project_sites(company_id, lower(name));

alter table public.project_sites enable row level security;

-- Everyone in the company can read the site list and (pragmatically, for small
-- teams) pin/correct a location; admins can always manage. The geofence value is
-- the verified arrival stamp, not who dropped the pin.
drop policy if exists ps_select on public.project_sites;
create policy ps_select on public.project_sites for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists ps_write on public.project_sites;
create policy ps_write on public.project_sites for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- Verified arrival, stamped on the lead's current site visit.
alter table public.contacts
  add column if not exists site_visit_arrived_at  timestamptz,
  add column if not exists site_visit_arrived_lat double precision,
  add column if not exists site_visit_arrived_lng double precision,
  add column if not exists site_visit_distance_m  integer,
  add column if not exists site_visit_verified    boolean;
