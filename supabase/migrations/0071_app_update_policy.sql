-- One-click "force update" per app channel, controlled from the web dashboard.
-- The app reads its channel's policy and, if force is on (or its build is below
-- min_version_code), makes the update prompt mandatory. Everyone can READ (the
-- app needs it); only the super-admin writes it (via the service role).
create table if not exists public.app_update_policy (
  channel          text primary key,   -- e.g. android-latest, android-sndeveloper
  force            boolean not null default false,
  min_version_code integer not null default 0,
  updated_at       timestamptz not null default now()
);

alter table public.app_update_policy enable row level security;

drop policy if exists app_update_policy_read on public.app_update_policy;
create policy app_update_policy_read on public.app_update_policy
  for select to authenticated, anon using (true);
