-- Security hardening: move Facebook page access tokens into Supabase Vault
-- (mirrors the WhatsApp 0028 pattern). Table is empty → no data migration.

alter table public.facebook_integrations
  add column if not exists page_access_token_secret_id uuid;

create or replace function public.set_facebook_token(p_company uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
  v_name text := 'facebook_token:' || p_company::text;
begin
  if not (
    exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin' and pr.company_id = p_company)
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  ) then
    raise exception 'not authorized';
  end if;

  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    v_id := vault.create_secret(p_token, v_name, 'Facebook page access token');
  else
    perform vault.update_secret(v_id, p_token);
  end if;

  update public.facebook_integrations set page_access_token_secret_id = v_id where company_id = p_company;
end $$;

revoke all on function public.set_facebook_token(uuid, text) from public, anon;
grant execute on function public.set_facebook_token(uuid, text) to authenticated;

create or replace function public.get_facebook_token(p_company uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare v_token text;
begin
  select ds.decrypted_secret into v_token
  from public.facebook_integrations fi
  join vault.decrypted_secrets ds on ds.id = fi.page_access_token_secret_id
  where fi.company_id = p_company;
  return v_token;
end $$;

revoke all on function public.get_facebook_token(uuid) from public, anon, authenticated;
grant execute on function public.get_facebook_token(uuid) to service_role;

alter table public.facebook_integrations drop column if exists page_access_token;
