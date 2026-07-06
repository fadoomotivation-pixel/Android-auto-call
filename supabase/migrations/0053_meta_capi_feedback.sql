-- Close the Meta loop: send qualification/conversion signals BACK to Meta via
-- the Conversions API (CAPI). We already CAPTURE Instant-Form leads (0024) and
-- manage their pipeline; this teaches Meta which of those leads actually became
-- qualified / booked, so its lead-ads optimization finds more people like them.
--
-- Each Meta-sourced contact carries lead_source='facebook' + lead_source_id
-- (the leadgen_id). When such a lead crosses a mapped funnel stage we POST an
-- event to the dataset (pixel), keyed on the Meta lead_id so it ties straight
-- back to the ad — no PII matching needed (hashed phone/email sent as backup).
-- Fires server-side from a DB trigger, so no telecaller app update is needed.

-- 1. CAPI config on the existing per-company integration row. -----------------
alter table public.facebook_integrations
  add column if not exists dataset_id           text,          -- pixel / dataset id
  add column if not exists capi_token_secret_id uuid,          -- CAPI token (Vault)
  add column if not exists capi_enabled         boolean not null default false,
  add column if not exists capi_event_map       jsonb;         -- stage -> event_name (null = defaults)

-- 2. Store the CAPI access token in Vault (admin / super-admin only). ----------
create or replace function public.set_facebook_capi(
  p_company    uuid,
  p_dataset_id text,
  p_token      text,
  p_event_map  jsonb,
  p_enabled    boolean
) returns void
language plpgsql security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
  v_name text := 'facebook_capi_token:' || p_company::text;
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
      v_id := vault.create_secret(p_token, v_name, 'Facebook Conversions API token');
    else
      perform vault.update_secret(v_id, p_token);
    end if;
  end if;

  update public.facebook_integrations
     set dataset_id     = p_dataset_id,
         capi_event_map = p_event_map,
         capi_enabled   = coalesce(p_enabled, false),
         capi_token_secret_id = coalesce(v_id, capi_token_secret_id),
         updated_at     = now()
   where company_id = p_company;
end $$;

revoke all on function public.set_facebook_capi(uuid, text, text, jsonb, boolean) from public, anon;
grant execute on function public.set_facebook_capi(uuid, text, text, jsonb, boolean) to authenticated;

-- 3. Service-role getter: dataset + decrypted token + map + enabled. -----------
create or replace function public.get_facebook_capi(p_company uuid)
returns jsonb
language plpgsql security definer
set search_path = public, vault
as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'dataset_id', fi.dataset_id,
    'enabled',    fi.capi_enabled,
    'event_map',  fi.capi_event_map,
    'token',      (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.id = fi.capi_token_secret_id)
  ) into v
  from public.facebook_integrations fi
  where fi.company_id = p_company;
  return v;
end $$;

revoke all on function public.get_facebook_capi(uuid) from public, anon, authenticated;
grant execute on function public.get_facebook_capi(uuid) to service_role;

-- 4. Audit + de-dup log of what we sent to Meta. ------------------------------
create table if not exists public.capi_events (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  event_name  text not null,
  meta_lead_id text,
  ok          boolean,
  response    text,
  created_at  timestamptz not null default now(),
  unique (contact_id, event_name)   -- one signal of each kind per lead
);

alter table public.capi_events enable row level security;

-- Admins can see their own company's CAPI activity; platform admins see all.
create policy "capi_events_select" on public.capi_events
  for select to authenticated
  using (
    (company_id = public.current_company_id() and public.is_admin())
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

-- 5. Fire the CAPI forwarder when a Meta lead crosses a stage. ----------------
create or replace function public.forward_capi_on_stage()
returns trigger
language plpgsql
security definer
set search_path = public, vault, net
as $$
begin
  if new.lead_source = 'facebook'
     and new.lead_source_id is not null
     and (tg_op = 'INSERT' or new.status is distinct from old.status)
     and exists (
       select 1 from public.facebook_integrations fi
       where fi.company_id = new.company_id
         and fi.capi_enabled = true
         and fi.dataset_id is not null
     )
  then
    perform net.http_post(
      url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/meta-capi',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
      ),
      body := jsonb_build_object('contact_id', new.id, 'status', new.status)
    );
  end if;
  return null;
end $$;

drop trigger if exists trg_forward_capi on public.contacts;
create trigger trg_forward_capi
  after insert or update of status on public.contacts
  for each row execute function public.forward_capi_on_stage();
