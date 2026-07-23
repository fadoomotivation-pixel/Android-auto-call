-- Pull Facebook leads on a schedule.
--
-- Meta's webhook PUSH is unreliable (app in Dev mode / lapsed app-webhook only
-- delivers test/admin leads), so real ad leads never arrived even though the
-- page reads as "connected". The facebook-poll function PULLS recent leads via
-- the Graph API instead — bulletproof against webhook/app-mode issues. Run it
-- every 10 minutes. It dedupes on lead_source_id and only imports leads from the
-- last few days, so re-runs are cheap and no old backlog is dragged in.

select cron.schedule(
  'facebook-poll-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/facebook-poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('since_days', 3)
  );
  $$
);
