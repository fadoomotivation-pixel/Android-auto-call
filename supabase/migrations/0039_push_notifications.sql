-- ============================================================
-- Push notifications (FCM)
--   device_tokens: each rep's Android FCM tokens, so notify-rep can
--   target a specific user's phones. The Firebase service-account key
--   lives in Vault (set out-of-band, never in the repo); get_fcm_service_account
--   hands it to the edge function (service_role only).
-- ============================================================

create table if not exists public.device_tokens (
  token       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete cascade,
  platform    text not null default 'android',
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists idx_device_tokens_user on public.device_tokens(user_id);
create index if not exists idx_device_tokens_company on public.device_tokens(company_id);

alter table public.device_tokens enable row level security;

-- A user manages only their own device tokens. The edge function reads them
-- with the service role (which bypasses RLS).
drop policy if exists dt_select on public.device_tokens;
create policy dt_select on public.device_tokens for select to authenticated
  using (user_id = auth.uid());
drop policy if exists dt_insert on public.device_tokens;
create policy dt_insert on public.device_tokens for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists dt_update on public.device_tokens;
create policy dt_update on public.device_tokens for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists dt_delete on public.device_tokens;
create policy dt_delete on public.device_tokens for delete to authenticated
  using (user_id = auth.uid());

-- Returns the Firebase service-account JSON from Vault (secret name
-- 'fcm_service_account'). Service role only — used by the notify-rep function
-- to mint an FCM HTTP v1 access token.
create or replace function public.get_fcm_service_account()
returns text language plpgsql security definer set search_path = public, vault as $$
declare v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = 'fcm_service_account';
  return v;
end $$;
revoke all on function public.get_fcm_service_account() from public, anon, authenticated;
grant execute on function public.get_fcm_service_account() to service_role;
