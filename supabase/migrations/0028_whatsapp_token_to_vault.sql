-- Security hardening: move WhatsApp Cloud API access tokens out of a plaintext
-- DB column into Supabase Vault (encrypted at rest). Table is currently empty,
-- so no data migration is needed.

alter table public.whatsapp_integrations
  add column if not exists access_token_secret_id uuid;

-- Writer: only an admin of the company (or a platform admin) may set the token.
-- Stores it in Vault and keeps just the secret id on the row.
create or replace function public.set_whatsapp_token(p_company uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
  v_name text := 'whatsapp_token:' || p_company::text;
begin
  if not (
    exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin' and pr.company_id = p_company)
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  ) then
    raise exception 'not authorized';
  end if;

  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    v_id := vault.create_secret(p_token, v_name, 'WhatsApp Cloud API access token');
  else
    perform vault.update_secret(v_id, p_token);
  end if;

  update public.whatsapp_integrations set access_token_secret_id = v_id where company_id = p_company;
end $$;

revoke all on function public.set_whatsapp_token(uuid, text) from public, anon;
grant execute on function public.set_whatsapp_token(uuid, text) to authenticated;

-- Reader: service role only (edge functions). Never exposed to browser clients.
create or replace function public.get_whatsapp_token(p_company uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare v_token text;
begin
  select ds.decrypted_secret into v_token
  from public.whatsapp_integrations wi
  join vault.decrypted_secrets ds on ds.id = wi.access_token_secret_id
  where wi.company_id = p_company;
  return v_token;
end $$;

revoke all on function public.get_whatsapp_token(uuid) from public, anon, authenticated;
grant execute on function public.get_whatsapp_token(uuid) to service_role;

-- Remove the plaintext column entirely (empty table → safe).
alter table public.whatsapp_integrations drop column if exists access_token;
