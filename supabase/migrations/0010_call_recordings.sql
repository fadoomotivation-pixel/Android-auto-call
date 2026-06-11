-- Call recording: store a Drive file reference + status on each call log, a
-- per-company storage integration (owner's Google Drive), and a company-level
-- "recording on" switch. Visibility reuses the existing call_logs RLS
-- (telecaller = own, admin = company, super-admin = all).

-- 1. Recording reference on call_logs.
alter table public.call_logs add column if not exists recording_path    text;
alter table public.call_logs add column if not exists recording_status  text not null default 'none';
alter table public.call_logs add column if not exists recording_seconds integer;
alter table public.call_logs add column if not exists recording_source  text;       -- 'sip' | 'sim'
-- recording_status: none | recording | uploading | ready | failed | deleted | expired

create index if not exists call_logs_recording_idx
  on public.call_logs (company_id, recording_status, created_at desc);

-- 2. Company-level recording switch (on by default, admin-controlled).
alter table public.companies add column if not exists recording_enabled boolean not null default true;

-- 3. Per-company storage integration (owner's Google Drive). Refresh token is
--    sensitive: super-admin only, read server-side by edge functions (service role).
create table if not exists public.storage_integrations (
  company_id    uuid primary key references public.companies(id) on delete cascade,
  provider      text not null default 'gdrive',
  refresh_token text,
  folder_id     text,
  account_email text,
  updated_at    timestamptz not null default now()
);
alter table public.storage_integrations enable row level security;
drop policy if exists si_super on public.storage_integrations;
create policy si_super on public.storage_integrations for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
