-- ============================================================
-- Record-all-calls (workplace monitoring, opt-in per company)
--
-- Real-estate admins can't always trust telecallers not to work company leads
-- on the side or leak numbers. When a company turns this ON, the telecaller's
-- work phone syncs EVERY call — including numbers that aren't in the CRM — so
-- the admin can see off-CRM calling patterns and their recordings.
--
-- This is transparent monitoring, not covert capture: the app shows the
-- telecaller a clear notice that the work phone records all calls when this is
-- enabled. Default OFF; each company decides. Isolation is unchanged — every
-- call_log carries the rep's company_id, so only that company's admin (and the
-- super admin) ever sees it.
-- ============================================================

alter table public.companies
  add column if not exists record_all_calls boolean not null default false;

-- Marks a call log that was captured because record_all_calls is on AND the
-- number is not a known CRM contact (a personal / off-CRM call). Lets the admin
-- UI flag and filter them without guessing from a null contact_id.
alter table public.call_logs
  add column if not exists off_crm boolean not null default false;

create index if not exists idx_call_logs_off_crm
  on public.call_logs(company_id, off_crm) where off_crm;
