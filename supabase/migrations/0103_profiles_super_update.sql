-- Same gap that companies had: the super admin could SEE every telecaller but
-- could only EDIT the ones inside their own HQ tenant. So a per-rep setting like
-- speaks_as was unfixable from the platform-wide Telecallers page for every
-- company except one.
--
-- Company admins are unchanged: still their own company's people only.
drop policy if exists profiles_update_super on public.profiles;
create policy profiles_update_super on public.profiles
  for update
  using (public.is_super_admin())
  with check (public.is_super_admin());
