-- Work the outbox every five minutes.
--
-- Five, not hourly, because the failures this queue exists for are short: a
-- container redeploying, a phone that lost data for a minute, a session
-- reconnecting. Holding a founder's 10pm report until 11pm to recover from a
-- 90-second outage would make the queue itself the reason the report was late.
--
-- drainOutbox backs each row off on its own (2, 4, 8, 16, 32 minutes) and gives
-- up after six tries, so a genuinely dead worker is not retried into next week
-- — a report has a shelf life, and yesterday's numbers arriving on Thursday are
-- noise. It fails loudly instead, with the reason written next to the recipient.
select cron.unschedule('notification-outbox-drain')
 where exists (select 1 from cron.job where jobname = 'notification-outbox-drain');

select cron.schedule(
  'notification-outbox-drain',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/notify-provider',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{"action":"drain"}'::jsonb
  );
  $$
);
