-- Multi-project interest per buyer
--
-- Today's buyer shops several projects at once, so a single overall "stage" on
-- the contact doesn't capture the journey. This adds per-project interest rows
-- (stage, budget, temperature, site visit) hanging off a contact, so one lead
-- can be at "site_visit" on Project A and "new" on Project B simultaneously.
-- The contact's own status remains the primary/overall stage.

create table if not exists public.lead_project_interests (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  project       text not null,
  stage         public.contact_status not null default 'new',
  budget        text,
  temperature   text,
  site_visit_at timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_lpi_company_contact on public.lead_project_interests(company_id, contact_id);
create index if not exists idx_lpi_contact         on public.lead_project_interests(contact_id);
-- One interest row per (contact, project) — case-insensitive on project name.
create unique index if not exists uq_lpi_contact_project
  on public.lead_project_interests(contact_id, lower(project));

alter table public.lead_project_interests enable row level security;

-- Same scoping as contacts: company admin sees all; a rep sees interests for the
-- contacts they own. Access is derived from the parent contact.
drop policy if exists lpi_select on public.lead_project_interests;
create policy lpi_select on public.lead_project_interests for select to authenticated
  using (
    company_id = public.current_company_id()
    and (public.is_admin() or exists (
      select 1 from public.contacts c
      where c.id = lead_project_interests.contact_id and c.salesperson_id = auth.uid()
    ))
  );

drop policy if exists lpi_insert on public.lead_project_interests;
create policy lpi_insert on public.lead_project_interests for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.contacts c
      where c.id = lead_project_interests.contact_id
        and c.company_id = public.current_company_id()
        and (public.is_admin() or c.salesperson_id = auth.uid())
    )
  );

drop policy if exists lpi_update on public.lead_project_interests;
create policy lpi_update on public.lead_project_interests for update to authenticated
  using (
    company_id = public.current_company_id()
    and (public.is_admin() or exists (
      select 1 from public.contacts c
      where c.id = lead_project_interests.contact_id and c.salesperson_id = auth.uid()
    ))
  )
  with check (company_id = public.current_company_id());

drop policy if exists lpi_delete on public.lead_project_interests;
create policy lpi_delete on public.lead_project_interests for delete to authenticated
  using (
    company_id = public.current_company_id()
    and (public.is_admin() or exists (
      select 1 from public.contacts c
      where c.id = lead_project_interests.contact_id and c.salesperson_id = auth.uid()
    ))
  );
