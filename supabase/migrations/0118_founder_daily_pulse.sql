-- The 7pm report the founder doesn't have to come and get.
--
-- The Pulse page already writes every telecaller's day. But it only exists if
-- someone opens a laptop, and founders don't — they run the day from a phone.
-- So the report that was already being written now goes to them, on WhatsApp,
-- at the hour they pick, without anyone pressing anything.
--
-- Recipients are a table, not a column on companies, for two reasons: a company
-- usually has more than one person who should see it (founder AND sales head),
-- and each of them wants it at a different time — the founder at 7pm when the
-- day is done, a sales head sometimes at 2pm to still be able to change it.
--
-- Company isolation is the whole point of the row: a subscriber belongs to ONE
-- company and only ever receives that company's pulse. The super admin can set
-- one up for any company, which is the only cross-company power here — they
-- never become a recipient of everyone's numbers by accident.
create table if not exists public.pulse_subscribers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  label         text not null default 'Founder',
  -- Digits with country code, no +. Normalised on write so a number typed four
  -- different ways can't become four subscribers all messaging one phone.
  phone         text not null,
  send_hour_ist smallint not null default 19 check (send_hour_ist between 0 and 23),
  active        boolean not null default true,
  -- WhatsApp only allows free text within 24h of the person's last message to
  -- the business number. A 7pm push is outside that window on any normal day,
  -- so an approved template is the reliable path; free text is tried first and
  -- this is the fallback. Null until the company has one approved.
  template_name text,
  last_sent_at  timestamptz,
  last_status   text,
  last_error    text,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null
);

-- One row per number per company: re-adding the same phone updates the existing
-- subscription instead of doubling the messages that phone receives.
create unique index if not exists pulse_subscribers_company_phone
  on public.pulse_subscribers(company_id, phone);
create index if not exists pulse_subscribers_due
  on public.pulse_subscribers(send_hour_ist) where active;

alter table public.pulse_subscribers enable row level security;

-- A company admin manages their own company's recipients; the platform super
-- admin manages every company's. Telecallers have no business here — the report
-- is about them.
drop policy if exists pulse_subscribers_rw on public.pulse_subscribers;
create policy pulse_subscribers_rw on public.pulse_subscribers for all
  using ((company_id = public.current_company_id() and public.is_admin()) or public.is_super_admin())
  with check ((company_id = public.current_company_id() and public.is_admin()) or public.is_super_admin());

-- Hourly, not daily, because each company picks its own hour.
--
-- pg_cron runs on UTC. Every UTC HH:30 is exactly IST (HH+6):00 — the :30 is
-- what cancels India's half-hour offset — so this fires precisely on the IST
-- hour, and pulse-broadcast sends only to subscribers whose chosen hour is the
-- one it currently is in India. A plain '0 * * * *' would have delivered every
-- report at half past.
select cron.unschedule('pulse-broadcast-hourly')
 where exists (select 1 from cron.job where jobname = 'pulse-broadcast-hourly');

select cron.schedule(
  'pulse-broadcast-hourly',
  '30 * * * *',
  $$
  select net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/pulse-broadcast',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
