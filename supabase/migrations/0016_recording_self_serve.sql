-- ============================================================
-- Simplify recording setup: let a COMPANY ADMIN connect their own company's
-- Google Drive (previously super-admin only), without ever exposing the
-- sensitive refresh_token to the browser.
--   • Admins may INSERT/UPDATE their own company's storage_integrations row
--     (the OAuth callback upserts with return=minimal, so no SELECT needed).
--   • SELECT on the row stays super-admin-only (token secrecy preserved).
--   • A SECURITY DEFINER status function exposes ONLY connected/email/provider
--     for the caller's company.
-- ============================================================

drop policy if exists si_admin_ins on public.storage_integrations;
create policy si_admin_ins on public.storage_integrations for insert to authenticated
  with check (company_id = public.current_company_id() and public.is_admin());

drop policy if exists si_admin_upd on public.storage_integrations;
create policy si_admin_upd on public.storage_integrations for update to authenticated
  using (company_id = public.current_company_id() and public.is_admin())
  with check (company_id = public.current_company_id() and public.is_admin());

-- Non-secret status for the caller's own company (no refresh_token).
create or replace function public.my_storage_status()
returns table (connected boolean, account_email text, provider text)
language sql stable security definer set search_path = public as $$
  select (refresh_token is not null) as connected, account_email, provider
  from public.storage_integrations
  where company_id = public.current_company_id();
$$;

grant execute on function public.my_storage_status() to authenticated;
revoke execute on function public.my_storage_status() from public, anon;
