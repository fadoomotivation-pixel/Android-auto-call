-- ============================================================
-- Recording: single platform (super-admin) Drive + AI call summaries.
--   • platform_storage: ONE super-admin Drive used as the default for every
--     company that hasn't connected its own. Recordings go into a per-company
--     subfolder (tracked on storage_integrations.platform_subfolder_id).
--   • call_logs gains transcript / summary / summary_status for AI summaries.
-- ============================================================

-- 1. Platform-wide default Drive (single row, super-admin only).
create table if not exists public.platform_storage (
  id            boolean primary key default true check (id),
  provider      text not null default 'gdrive',
  refresh_token text,
  folder_id     text,
  account_email text,
  updated_at    timestamptz not null default now()
);
alter table public.platform_storage enable row level security;
drop policy if exists ps_super on public.platform_storage;
create policy ps_super on public.platform_storage for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Per-company subfolder id created under the platform Drive (set by the
-- upload edge function via the service role).
alter table public.storage_integrations
  add column if not exists platform_subfolder_id text;

-- Non-secret platform status for the super admin UI.
create or replace function public.platform_storage_status()
returns table (connected boolean, account_email text)
language sql stable security definer set search_path = public as $$
  select (refresh_token is not null) as connected, account_email
  from public.platform_storage where id = true;
$$;
grant execute on function public.platform_storage_status() to authenticated;
revoke execute on function public.platform_storage_status() from public, anon;

-- 2. AI call summary fields.
alter table public.call_logs
  add column if not exists transcript     text,
  add column if not exists summary        text,
  add column if not exists summary_status text not null default 'none';
-- summary_status: none | processing | ready | failed
