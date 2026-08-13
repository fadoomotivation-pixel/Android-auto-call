-- 0163 — Keep every company's project list in step with its brain
--
-- projects-sync reads a company's own guide and price sheet and writes the
-- project names into company_projects, which is the list voice-note-ai makes
-- the model CHOOSE from. Fanbe's list was seeded by hand; every other tenant
-- has none, and a list that only exists when somebody remembers to build it is
-- a list that will be missing on the day it matters.
--
-- Daily, not hourly. The list changes when a founder uploads a new price sheet,
-- which is a monthly event at most, and every run costs one LLM call per
-- company against a token budget shared with sixteen other functions. 04:40 IST
-- (23:10 UTC) puts it well clear of the 7pm pulse and the overnight harvests.
--
-- The function is additive and never deletes, so a run that returns nothing
-- (model had a bad day, brain not uploaded yet) leaves the existing list alone.
select cron.schedule(
  'projects-sync-daily',
  '10 23 * * *',
  $$
  select net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/projects-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
