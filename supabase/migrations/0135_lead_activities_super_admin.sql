-- lead_activities was invisible — and unwritable — to the super admin outside
-- their own company.
--
-- The three policies were all written as `company_id = current_company_id()`,
-- which for the platform super admin means "the ankit tenant" and nothing else.
-- Two consequences, both silent:
--
--   · Remind Rep in the Action Center inserts a lead_activities row. Pressed on
--     a lead belonging to any other company, the insert failed the WITH CHECK
--     and the reminder was never recorded — while the push still went out. The
--     rep got told twice and the UI said they had never been reminded.
--   · The Automation Center's "last reminded" read the same table, so it
--     reported "never" for every company except one.
--
-- Regular admins are untouched: they stay pinned to their own company, which is
-- the whole point of the original expression. Only is_super_admin() is added.
-- actor_id = auth.uid() is kept on insert — cross-company does not mean
-- writing activity in somebody else's name.

drop policy if exists lead_activities_select on public.lead_activities;
create policy lead_activities_select on public.lead_activities
  for select using (
    is_super_admin()
    or (
      company_id = current_company_id()
      and (
        is_admin()
        or actor_id = auth.uid()
        or exists (
          select 1 from public.contacts c
          where c.id = lead_activities.contact_id and c.salesperson_id = auth.uid()
        )
      )
    )
  );

drop policy if exists lead_activities_insert on public.lead_activities;
create policy lead_activities_insert on public.lead_activities
  for insert with check (
    actor_id = auth.uid()
    and (company_id = current_company_id() or is_super_admin())
  );

drop policy if exists lead_activities_delete on public.lead_activities;
create policy lead_activities_delete on public.lead_activities
  for delete using (
    is_super_admin()
    or (company_id = current_company_id() and is_admin())
  );
