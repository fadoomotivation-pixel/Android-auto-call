-- The website form (website.callproai.in) writes only its answers.
--
-- 1. BASELINE. site999_onboarding, site999_config, the notify trigger and the
--    site999-uploads bucket were created in production on 2026-10-21 by two
--    hand-applied migrations (site999_onboarding, site999_notify_admin) that
--    were never written to this folder. They are restated here, idempotent, so
--    a fresh database matches production. NO SECRET VALUES: site999_config
--    keys are created empty and never overwritten; the admin password hash and
--    hook secret already set in production are left alone.
--
-- 2. HARDENING (new).
--    a) anon could INSERT every column, so a forged row could arrive already
--       'won', with notes, or with notified_at set (which silently skips the
--       email alert). anon now inserts only the columns the form sends:
--       id, name, whatsapp, email, city, brand, data.
--    b) The upload bucket accepted any file type. The form only uploads images
--       (logo + photos, shrunk to JPEG in the browser), so the bucket now
--       accepts image/* only. Size limit unchanged (10 MB).
--    c) A row's answers are capped at 256 KB (the real form sends a few KB),
--       and the short columns at sane lengths, so the open insert cannot be
--       used to park junk in the database.
--
-- NOT YET APPLIED TO PRODUCTION. Safe to apply: the table is empty today and
-- the v4 form (site999/index.html send()) inserts exactly these columns.

create table if not exists public.site999_onboarding (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text, whatsapp text, email text, city text, brand text,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'new'
);
alter table public.site999_onboarding
  add column if not exists notified_at timestamptz,
  add column if not exists notify_error text,
  add column if not exists notes text,
  add column if not exists follow_up_at timestamptz;
alter table public.site999_onboarding enable row level security;

create table if not exists public.site999_config (key text primary key, value text);
alter table public.site999_config enable row level security;
revoke all on public.site999_config from anon, authenticated;
insert into public.site999_config (key, value) values
  ('admin_pass_sha256', ''), ('hook_secret', ''), ('notify_email', ''),
  ('resend_api_key', ''), ('from_email', 'onboarding@resend.dev')
on conflict (key) do nothing;

create or replace function public.site999_notify_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/site999',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('action', 'notify', 'id', new.id,
      'hook', (select value from site999_config where key = 'hook_secret')));
  return new;
exception when others then return new;
end $$;
revoke all on function public.site999_notify_trg() from public, anon, authenticated;
drop trigger if exists site999_notify on public.site999_onboarding;
create trigger site999_notify after insert on public.site999_onboarding
  for each row execute function public.site999_notify_trg();

-- 2a. anon inserts answers only.
drop policy if exists site999_anon_insert on public.site999_onboarding;
create policy site999_anon_insert on public.site999_onboarding
  for insert to anon with check (status = 'new');
revoke all on public.site999_onboarding from anon, authenticated;
grant insert (id, name, whatsapp, email, city, brand, data) on public.site999_onboarding to anon;

-- 2c. size caps.
alter table public.site999_onboarding drop constraint if exists site999_sizes;
alter table public.site999_onboarding add constraint site999_sizes check (
  pg_column_size(data) <= 262144
  and coalesce(length(name), 0) <= 200 and coalesce(length(whatsapp), 0) <= 40
  and coalesce(length(email), 0) <= 200 and coalesce(length(city), 0) <= 200
  and coalesce(length(brand), 0) <= 200);

-- 2b. images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site999-uploads', 'site999-uploads', false, 10485760, array['image/*'])
on conflict (id) do update set public = false, allowed_mime_types = array['image/*'];
drop policy if exists site999_anon_upload on storage.objects;
create policy site999_anon_upload on storage.objects
  for insert to anon with check (bucket_id = 'site999-uploads');
