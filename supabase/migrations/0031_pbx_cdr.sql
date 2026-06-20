-- Cloud-calling via self-hosted PBX (FreeSWITCH or Asterisk). The PBX records
-- every call server-side and POSTs a CDR + the recording to the pbx-cdr edge
-- function, which logs the call and stores the recording in Google Drive.

create table if not exists public.pbx_config (
  company_id uuid primary key references public.companies(id) on delete cascade,
  pbx_type text not null default 'freeswitch' check (pbx_type in ('freeswitch','asterisk')),
  cdr_secret text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pbx_config enable row level security;
drop policy if exists pbx_config_rw on public.pbx_config;
create policy pbx_config_rw on public.pbx_config
  for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.company_id=pbx_config.company_id)
    or exists (select 1 from public.platform_admins pa where pa.user_id=auth.uid())
  )
  with check (
    exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.company_id=pbx_config.company_id)
    or exists (select 1 from public.platform_admins pa where pa.user_id=auth.uid())
  );

alter table public.call_logs add column if not exists pbx_call_id text;
create unique index if not exists call_logs_pbx_call_id_key on public.call_logs (pbx_call_id);
