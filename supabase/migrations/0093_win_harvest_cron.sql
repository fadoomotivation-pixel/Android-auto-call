-- Keep the shared winning brain learning automatically.
--
-- win-harvest reads leads that reached a site visit / booking and distils "kya
-- kaam aaya" into a company-scoped knowledge_chunks row (source_kind = 'win'),
-- which match_knowledge then serves to every rep in that company. The scan is
-- idempotent (skips leads already harvested, by source_id), so re-runs are
-- cheap. Every 2 hours is plenty for new wins to reach the team's coach.

select cron.schedule(
  'win-harvest-2h',
  '17 */2 * * *',
  $$
  select net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/win-harvest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('mode', 'scan', 'limit', 40)
  );
  $$
);
