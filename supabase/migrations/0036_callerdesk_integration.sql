-- CallerDesk cloud-telephony integration.
--
-- CallerDesk is a click-to-call PSTN bridge (not a SIP softphone): our backend
-- asks CallerDesk to ring the agent's own mobile, then bridge the customer; the
-- call is carried + RECORDED on CallerDesk's servers, and a webhook reports the
-- result (status, duration, recording URL) back to us. This removes the in-app
-- SIP/WebRTC audio path entirely and fixes recordings at the source.

-- 1. Per-company config. The authcode (API key) lives in Vault; only the secret
--    id + the (non-secret) deskphone and webhook token sit on the row.
alter table public.company_integrations
  add column if not exists call_provider text not null default 'uro',
  add column if not exists callerdesk_authcode_secret_id uuid,
  add column if not exists callerdesk_deskphone text,
  add column if not exists callerdesk_webhook_token text;

-- Give existing companies a webhook token (used to scope the public webhook URL
-- to one company). New rows get one via the default below.
update public.company_integrations
  set callerdesk_webhook_token = md5(gen_random_uuid()::text)
  where callerdesk_webhook_token is null;
alter table public.company_integrations
  alter column callerdesk_webhook_token set default md5(gen_random_uuid()::text);

-- 2. Correlate a provider call to our log + store the provider's recording URL.
alter table public.call_logs
  add column if not exists provider_call_id text,
  add column if not exists recording_url text;
create index if not exists call_logs_provider_call_id_idx
  on public.call_logs (provider_call_id) where provider_call_id is not null;

-- 3. Raw webhook audit. Every CallerDesk event is stored verbatim so (a) the
--    exact field names are captured on the first real call and (b) nothing is
--    lost even if call-matching fails.
create table if not exists public.callerdesk_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  call_log_id uuid references public.call_logs(id) on delete set null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.callerdesk_events enable row level security;
create policy callerdesk_events_read on public.callerdesk_events
  for select using (
    exists (select 1 from public.profiles pr
            where pr.id = auth.uid() and pr.role = 'admin'
              and pr.company_id = callerdesk_events.company_id)
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

-- 4. Vault-backed authcode (mirror of set_/get_whatsapp_token).
create or replace function public.set_callerdesk_authcode(p_company uuid, p_authcode text)
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid; v_name text := 'callerdesk_authcode:' || p_company::text;
begin
  if not (
    exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin' and pr.company_id = p_company)
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  ) then raise exception 'not authorized'; end if;

  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    v_id := vault.create_secret(p_authcode, v_name, 'CallerDesk API authcode');
  else
    perform vault.update_secret(v_id, p_authcode);
  end if;
  update public.company_integrations set callerdesk_authcode_secret_id = v_id where company_id = p_company;
end $$;
revoke all on function public.set_callerdesk_authcode(uuid, text) from public, anon;
grant execute on function public.set_callerdesk_authcode(uuid, text) to authenticated;

create or replace function public.get_callerdesk_authcode(p_company uuid)
returns text language plpgsql security definer set search_path = public, vault as $$
declare v text;
begin
  select ds.decrypted_secret into v
  from public.company_integrations ci
  join vault.decrypted_secrets ds on ds.id = ci.callerdesk_authcode_secret_id
  where ci.company_id = p_company;
  return v;
end $$;
revoke all on function public.get_callerdesk_authcode(uuid) from public, anon, authenticated;
grant execute on function public.get_callerdesk_authcode(uuid) to service_role;
