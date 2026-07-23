-- Ads Manager (read mode + CRM attribution).
--
-- The platform runs ONE central Facebook business (see 0089). This adds the ad
-- ACCOUNT side of it so the super admin can see spend/impressions/clicks per
-- campaign & ad in one place — and, uniquely, join it to our own CRM outcomes
-- (which of those ad leads became Interested / Booked), which Meta itself can't
-- show. Read-only for now; the ads token + account id live per (hub) company,
-- same pattern as the CAPI token.

alter table public.facebook_integrations
  add column if not exists ad_account_id        text,   -- e.g. act_1234567890 (with or without act_)
  add column if not exists ads_token_secret_id  uuid;   -- Marketing-API token (Vault)

-- Store the ads (Marketing API) token in Vault. Admin of that company or any
-- platform super admin may set it. Mirrors set_facebook_capi.
create or replace function public.set_facebook_ads(
  p_company       uuid,
  p_ad_account_id text,
  p_token         text
) returns void
language plpgsql security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
  v_name text := 'facebook_ads_token:' || p_company::text;
begin
  if not (
    exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin' and pr.company_id = p_company)
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  ) then
    raise exception 'not authorized';
  end if;

  -- token is optional on update (blank = keep existing)
  if p_token is not null and length(trim(p_token)) > 0 then
    select id into v_id from vault.secrets where name = v_name;
    if v_id is null then
      v_id := vault.create_secret(p_token, v_name, 'Facebook Marketing API (ads) token');
    else
      perform vault.update_secret(v_id, p_token);
    end if;
  end if;

  update public.facebook_integrations
     set ad_account_id       = nullif(trim(p_ad_account_id), ''),
         ads_token_secret_id = coalesce(v_id, ads_token_secret_id),
         updated_at          = now()
   where company_id = p_company;
end $$;

revoke all on function public.set_facebook_ads(uuid, text, text) from public, anon;
grant execute on function public.set_facebook_ads(uuid, text, text) to authenticated;

-- Service-role getter: account id + decrypted token (used by the ads-insights fn).
create or replace function public.get_facebook_ads(p_company uuid)
returns jsonb
language plpgsql security definer
set search_path = public, vault
as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'ad_account_id', fi.ad_account_id,
    'token', (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.id = fi.ads_token_secret_id)
  ) into v
  from public.facebook_integrations fi
  where fi.company_id = p_company;
  return v;
end $$;

revoke all on function public.get_facebook_ads(uuid) from public, anon, authenticated;
grant execute on function public.get_facebook_ads(uuid) to service_role;
