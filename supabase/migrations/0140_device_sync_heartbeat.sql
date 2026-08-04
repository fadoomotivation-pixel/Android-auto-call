-- The phone reports on itself.
--
-- call_capture_health() already grades every rep's phone, and it does it by
-- inference: looking at the shape of the call_logs rows that arrived and
-- deducing what must be wrong. That works for some failures and is structurally
-- incapable of catching the worst one — you cannot infer missing rows from the
-- rows that are missing.
--
-- It missed a real day. A telecaller made roughly fifteen calls between 1:40pm
-- and 3:40pm; the CRM received ONE. Eleven of the numbers she dialled were her
-- own assigned leads. Her app was still talking to Supabase at 5:05pm, so
-- nothing looked broken from here: her device token was fresh, the crons were
-- green, the Automation Center was all lights. The dashboard simply showed a
-- rep who had made one call, and the only way anyone found out was the founder
-- picking up her phone and comparing it to the screen.
--
-- The cause is that Repository.syncCallLogs() has three silent exits — no
-- READ_CALL_LOG permission, a null cursor, an empty contact map — and each one
-- returns having recorded nothing anywhere. Silence from the phone and silence
-- from a rep who did nothing are the same signal, and the CRM believed the
-- wrong one.
--
-- So the phone now says what happened on EVERY run, including the runs where it
-- did nothing and why. One row per telecaller, overwritten each time: this is a
-- current-state heartbeat, not a log, and nobody needs the history of a
-- fifteen-minute worker.

create table if not exists public.device_sync_health (
  salesperson_id      uuid primary key references public.profiles(id) on delete cascade,
  company_id          uuid not null references public.companies(id) on delete cascade,

  -- The worker started. Set on every run, whatever the outcome.
  last_run_at         timestamptz not null default now(),
  -- The worker got all the way through a scan. The gap between this and
  -- last_run_at is the whole diagnosis.
  last_ok_at          timestamptz,

  -- Why a run stopped, in the worker's own words:
  --   ok            — scanned the phone's call log and reconciled it
  --   no_permission — READ_CALL_LOG is not granted; the app is blind
  --   no_cursor     — the OS refused the call-log query
  --   no_contacts   — no CRM leads to match against
  --   error         — threw; detail carries the message
  outcome             text not null default 'ok'
                        check (outcome in ('ok','no_permission','no_cursor','no_contacts','error')),
  detail              text,

  -- What it saw. native_seen is the count in the PHONE's own log for the
  -- window; backfilled is how many the CRM was missing. A healthy phone
  -- reports native_seen > 0 and backfilled near 0 — a phone reporting
  -- native_seen 15 and backfilled 14 every run is a phone whose live capture
  -- is dead and whose safety net is carrying the whole load.
  native_seen         int not null default 0,
  backfilled          int not null default 0,
  contacts_loaded     int not null default 0,

  app_version         text,
  device_model        text,
  android_sdk         int,
  updated_at          timestamptz not null default now()
);

create index if not exists device_sync_health_company on public.device_sync_health (company_id);

alter table public.device_sync_health enable row level security;

-- A rep writes only their own heartbeat, and cannot claim to be in another
-- company. Everything else is read-only to the people who manage them.
drop policy if exists device_sync_health_write on public.device_sync_health;
create policy device_sync_health_write on public.device_sync_health
  for all
  using (salesperson_id = auth.uid())
  with check (
    salesperson_id = auth.uid()
    and company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists device_sync_health_read on public.device_sync_health;
create policy device_sync_health_read on public.device_sync_health
  for select using (
    salesperson_id = auth.uid()
    or is_super_admin()
    or (is_admin() and company_id = current_company_id())
  );

-- ---------- what the heartbeat means ----------
--
-- Deliberately a view over the raw table rather than a status column written by
-- the phone. The phone reports FACTS — permission granted, rows seen, when it
-- ran. Whether that adds up to "healthy" is a judgement that changes as we
-- learn, and a judgement baked into rows written by an app release is a
-- judgement you cannot correct without shipping a new APK.
create or replace view public.v_device_sync_health as
  select
    p.id            as salesperson_id,
    p.company_id,
    p.full_name,
    c.name          as company_name,
    h.last_run_at,
    h.last_ok_at,
    h.outcome,
    h.detail,
    h.native_seen,
    h.backfilled,
    h.app_version,
    h.device_model,
    h.android_sdk,
    case
      -- No row at all. Either the rep has never opened a build that reports,
      -- or the app has not run since. Both are "we do not know", which is a
      -- state in its own right and must never be shown as healthy.
      when h.salesperson_id is null then 'never_reported'
      when h.outcome = 'no_permission' then 'no_permission'
      when h.outcome in ('no_cursor', 'error') then 'broken'
      when h.outcome = 'no_contacts' then 'no_leads'
      -- The worker runs every 15 minutes. Three hours of silence on a working
      -- day is the OEM battery manager having killed it.
      when h.last_ok_at is null or h.last_ok_at < now() - interval '3 hours' then 'stale'
      else 'ok'
    end::text       as state,
    -- Whether today's numbers for this rep can be believed. The daily score
    -- reads THIS, so a rep whose phone is not reporting is never sent a low
    -- score for a day the CRM simply did not see.
    (h.salesperson_id is not null
      and h.outcome = 'ok'
      and h.last_ok_at >= now() - interval '3 hours') as trustworthy
  from public.profiles p
  join public.companies c on c.id = p.company_id
  left join public.device_sync_health h on h.salesperson_id = p.id
  where p.role = 'salesperson'
    and coalesce(p.is_active, true);

alter view public.v_device_sync_health set (security_invoker = on);

comment on view public.v_device_sync_health is
  'Every telecaller''s phone and whether it is actually feeding the CRM, from the phone''s own '
  'report rather than inferred from the rows that did arrive. `trustworthy` gates the daily score.';

-- ---------- enrolment now carries trust ----------
--
-- The daily review and the heartbeat have to travel together. A rep whose phone
-- is not reporting has numbers the CRM cannot vouch for, and sending them a low
-- score for a day it simply did not see is the fastest way to make the whole
-- feature something reps argue with instead of act on. So the recipients view —
-- the one thing that decides who gets a message — carries the device state, and
-- the sender skips anyone it cannot stand behind.
-- Dropped and recreated, not replaced: the new columns land in the middle of
-- the column list and Postgres will not rename a view column in place.
drop view if exists public.v_rep_review_recipients;
create view public.v_rep_review_recipients as
  select
    p.id            as salesperson_id,
    p.company_id,
    p.full_name,
    p.phone,
    c.name          as company_name,
    c.rep_review_hour_ist,
    (coalesce(p.phone, '') <> '')                                as has_phone,
    (not c.rep_review_off)                                       as company_on,
    (select a.rep_review_on from public.platform_automation a)   as platform_on,
    coalesce(d.state, 'never_reported')                          as device_state,
    coalesce(d.trustworthy, false)                               as device_trustworthy,
    (
      coalesce(p.phone, '') <> ''
      and not c.rep_review_off
      and (select a.rep_review_on from public.platform_automation a)
    )                                                            as enrolled
  from public.profiles p
  join public.companies c on c.id = p.company_id
  left join public.v_device_sync_health d on d.salesperson_id = p.id
  where p.role = 'salesperson'
    and coalesce(p.is_active, true);

alter view public.v_rep_review_recipients set (security_invoker = on);
