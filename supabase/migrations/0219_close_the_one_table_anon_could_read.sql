-- The one table in this database that anyone with the anon key could read.
--
-- cb_device_punches_clockfix_backup holds 79 attendance punch rows, kept as a
-- safety copy while a clock-drift fix was applied to cb_device_punches. The
-- copy was never meant to be reachable by anybody — but row-level security was
-- off, so the anon key that ships inside the Android app and sits in the public
-- website's bundle could SELECT it, and write to it.
--
-- Checked the rest of the schema at the same time: every other table in
-- `public` already had RLS on. This was the single hole.
--
-- RLS ON WITH NO POLICIES IS THE RIGHT SHAPE FOR A BACKUP. PostgREST can then
-- reach nothing at all, while the service role — migrations, edge functions,
-- and a restore if that day ever comes — is unaffected, because the service
-- role bypasses RLS by design. No policy is needed and adding one would only
-- widen it again.
--
-- Found by an agent re-measuring production on 4 Oct 2026, not by this
-- codebase noticing. Worth saying plainly: nothing here watches for a table
-- shipping without RLS, and the next one will be found the same way.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-10-04.

alter table public.cb_device_punches_clockfix_backup enable row level security;

comment on table public.cb_device_punches_clockfix_backup is
  'Pre-clockfix copy of cb_device_punches. RLS is on with no policies on purpose: unreachable through the API, readable only by the service role.';
