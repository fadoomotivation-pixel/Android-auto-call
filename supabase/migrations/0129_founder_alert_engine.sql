-- Instant alerts for the four things a founder actually wants woken up for.
--
-- The Daily Pulse is a report you read at 7pm. A booking is news at 3:40pm, and
-- so is a customer who walked the site this morning and has not been rung back.
-- Those cannot wait for the evening, and by the evening they are buried in a
-- report next to eight things that do not matter as much.
--
-- The entire risk of this feature is spam. A founder who gets pinged for every
-- lead movement mutes the number inside a week, and then the ONE booking alert
-- that mattered arrives silently. So the table below is not a log — it is the
-- thing that stops a second message ever being sent about the same milestone.
--
--   · one row per company + lead + kind, enforced by a unique index. The
--     function inserts BEFORE it sends and lets the constraint decide: if the
--     insert conflicts, that alert has already gone out and nothing is sent.
--     A retry, a double cron tick, a lead flipping booked → negotiation →
--     booked again — none of them can produce a second WhatsApp.
--   · four kinds and no more. Every "wouldn't it also be useful to know…" is
--     one step towards the muted number.
--   · alerts_on per recipient, so a sales head can take the daily report and
--     leave the interruptions to the owner.
create table if not exists public.founder_alerts (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  -- booking_confirmed  — the deal closed. Never not worth sending.
  -- sale_closed        — token became full payment / registry done.
  -- site_visit_fixed   — a customer agreed to come and see it.
  -- site_visit_done    — they came, and nobody has asked them what they thought.
  kind       text not null check (kind in (
    'booking_confirmed', 'sale_closed', 'site_visit_fixed', 'site_visit_done'
  )),
  detail     text,
  sent_at    timestamptz not null default now()
);

-- The anti-spam rule, as a constraint rather than as code that has to remember.
create unique index if not exists founder_alerts_once
  on public.founder_alerts(company_id, contact_id, kind);
create index if not exists founder_alerts_recent
  on public.founder_alerts(company_id, sent_at desc);

alter table public.founder_alerts enable row level security;

-- Read-only, and only for the people who can already see the company's numbers.
-- Writes come from the edge function on the service key, which bypasses RLS.
drop policy if exists founder_alerts_read on public.founder_alerts;
create policy founder_alerts_read on public.founder_alerts for select
  using ((company_id = public.current_company_id() and public.is_admin()) or public.is_super_admin());

-- Existing recipients keep getting the daily report and start getting alerts;
-- switching them off is one column, per person, without unsubscribing them
-- from the 7pm pulse they may still want.
alter table public.pulse_subscribers
  add column if not exists alerts_on boolean not null default true;

-- Every 15 minutes. Not every minute: a booking that reaches the founder eight
-- minutes late costs nothing, and four wake-ups an hour across every company on
-- the platform is a cron job that shows up on the bill. The function itself
-- refuses to send outside 9am-9pm IST — an alert that buzzes a phone at 2am is
-- the fastest way to get the whole feature turned off.
select cron.unschedule('founder-alerts-15min')
 where exists (select 1 from cron.job where jobname = 'founder-alerts-15min');

select cron.schedule(
  'founder-alerts-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/founder-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
