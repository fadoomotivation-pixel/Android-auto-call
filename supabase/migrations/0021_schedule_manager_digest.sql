-- Nightly automation for the Manager AI coach: every day at 18:00 UTC
-- (~23:30 IST, i.e. end of the IST business day) call the manager-digest edge
-- function, which generates that day's digest for every active company.
--
-- Auth: the job sends the project's service-role key as a Bearer token; the
-- edge function recognises it as a trusted cron call. The key is read from
-- Supabase Vault (never hard-coded). ONE-TIME SETUP by the project owner:
--
--   select vault.create_secret('<YOUR_SERVICE_ROLE_KEY>', 'service_role_key');
--
-- Until that secret exists the job runs but the function returns 401 (harmless).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'manager-digest-nightly',
  '0 18 * * *',
  $job$
  select net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/manager-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
    ),
    body := '{}'::jsonb
  );
  $job$
);
