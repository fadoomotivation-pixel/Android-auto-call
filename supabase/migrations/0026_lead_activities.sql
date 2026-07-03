-- ============================================================
-- Lead activity timeline
-- Records what a telecaller did on a lead and when (stage change,
-- temperature, note, budget, site visit, follow-up scheduled …) so the
-- lead card can show "kab aayi, kab kya update hua".
-- Same multi-tenant RLS model as the rest of the schema.
-- ============================================================

create table if not exists public.lead_activities (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  contact_id  uuid not null references public.contacts(id)  on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_name  text,
  type        text not null default 'update'
                check (type in ('status','temperature','note','budget','site_visit','follow_up','call','system','update')),
  detail      text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_lead_activities_contact on public.lead_activities(contact_id, created_at desc);
create index if not exists idx_lead_activities_company on public.lead_activities(company_id);

alter table public.lead_activities enable row level security;

-- Anyone in the company who can see the lead can read its history
-- (admins: whole company; telecallers: activity they did or on their own leads).
drop policy if exists lead_activities_select on public.lead_activities;
create policy lead_activities_select on public.lead_activities for select to authenticated
  using (
    company_id = public.current_company_id()
    and (
      public.is_admin()
      or actor_id = auth.uid()
      or exists (
        select 1 from public.contacts c
        where c.id = contact_id and c.salesperson_id = auth.uid()
      )
    )
  );

drop policy if exists lead_activities_insert on public.lead_activities;
create policy lead_activities_insert on public.lead_activities for insert to authenticated
  with check (company_id = public.current_company_id() and actor_id = auth.uid());

-- History is append-only from the app; only admins can prune.
drop policy if exists lead_activities_delete on public.lead_activities;
create policy lead_activities_delete on public.lead_activities for delete to authenticated
  using (company_id = public.current_company_id() and public.is_admin());
