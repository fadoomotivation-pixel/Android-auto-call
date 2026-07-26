-- The super admin owns the platform, not one tenant. They could already SEE every
-- company but could only EDIT their own, so a per-company switch like
-- record_all_calls was unfixable from the dashboard for every company except HQ —
-- which is exactly how a new tenant ended up silently not capturing off-CRM calls.
--
-- Company admins are unchanged: still their own company only.
drop policy if exists companies_update_super on public.companies;
create policy companies_update_super on public.companies
  for update
  using (public.is_super_admin())
  with check (public.is_super_admin());
