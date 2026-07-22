-- A super admin manages leads for EVERY company (they already SELECT across all
-- companies via the contacts_super policy). But the INSERT/UPDATE/DELETE policies
-- only allowed the caller's OWN company, so a super admin importing/assigning
-- leads INTO a tenant company hit "new row violates row-level security policy".
-- These are additive PERMISSIVE policies — they OR with the existing per-company
-- ones, so regular admins and telecallers are completely unaffected; only a
-- platform super admin gains cross-company write.
drop policy if exists contacts_insert_super on public.contacts;
create policy contacts_insert_super on public.contacts
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists contacts_update_super on public.contacts;
create policy contacts_update_super on public.contacts
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists contacts_delete_super on public.contacts;
create policy contacts_delete_super on public.contacts
  for delete to authenticated
  using (public.is_super_admin());
